const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const passport = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
require('dotenv').config();

const { initDB, pool } = require('./db');
const { runCrawler, TARGET_LINES, CRAWL_GROUPS } = require('./crawler');
const propertiesRouter = require('./routes/properties');
const authRouter = require('./routes/auth');
const favoritesRouter = require('./routes/favorites');
const watchlistRouter = require('./routes/watchlist');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-prod';

const app = express();
app.set('trust proxy', 1);
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(cookieParser());

passport.use(new GoogleStrategy(
  {
    clientID:     process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL:  process.env.GOOGLE_CALLBACK_URL,
  },
  (_accessToken, _refreshToken, profile, done) => {
    done(null, {
      id:    profile.id,
      name:  profile.displayName,
      email: profile.emails?.[0]?.value,
      photo: profile.photos?.[0]?.value,
    });
  }
));
app.use(passport.initialize());

// 내부 IP 접속 시 어드민 자동 로그인
const INTERNAL_NETWORK = process.env.INTERNAL_NETWORK || '';
app.use((req, res, next) => {
  if (INTERNAL_NETWORK) {
    const ip = req.ip || req.connection.remoteAddress || '';
    if (ip.startsWith(INTERNAL_NETWORK) || ip === '::1' || ip === '127.0.0.1') {
      req.user = { id: 'admin', name: '관리자', email: 'admin@local' };
      return next();
    }
  }
  // JWT 검증
  const token = req.cookies?.token;
  if (token) {
    try {
      req.user = jwt.verify(token, JWT_SECRET);
    } catch {}
  }
  next();
});

// 인증 라우트 (로그인 전 접근 가능)
app.use('/auth', authRouter);

// API 인증 미들웨어
const requireAuth = (req, res, next) => {
  if (req.user) return next();
  res.status(401).json({ error: 'Unauthorized' });
};

app.use('/api', requireAuth);
app.use('/api/properties', propertiesRouter);
app.use('/api/favorites', favoritesRouter);
app.use('/api/watchlist', watchlistRouter);

// GET /api/stats
app.get('/api/stats', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT line_name, COUNT(*) AS count
      FROM properties
      GROUP BY line_name
      ORDER BY line_name
    `);
    const { rows: [{ count }] } = await pool.query('SELECT COUNT(*) FROM properties');
    res.json({ total: parseInt(count, 10), byLine: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/crawl
app.post('/api/crawl', (req, res) => {
  const { line, lines, types } = req.body || {};
  const lineTarget = lines || line || null;
  const typeList = types ? (Array.isArray(types) ? types : [types]) : null;
  const label = Array.isArray(lineTarget) ? lineTarget.join(',') : (lineTarget || '전체 노선');
  console.log(`크롤링 요청: ${label} / 타입: ${typeList ? typeList.join(',') : '전체'}`);
  res.json({ message: `크롤링 시작: ${label}` });

  runCrawler(lineTarget, null, typeList)
    .then((summary) => console.log('크롤링 완료:', summary))
    .catch((err) => console.error('크롤링 오류:', err.message));
});

// GET /api/lines
app.get('/api/lines', (_req, res) => {
  res.json(TARGET_LINES.map((l) => l.name));
});

// GET /api/crawl-groups
app.get('/api/crawl-groups', (_req, res) => {
  res.json(CRAWL_GROUPS.map((g) => ({ id: g.id, name: g.name, cron: g.cron, lines: g.lines })));
});

// GET /api/stations?line=xxx
app.get('/api/stations', async (req, res) => {
  try {
    const { line } = req.query;
    const where = line ? 'WHERE line_name = $1 AND station IS NOT NULL' : 'WHERE station IS NOT NULL';
    const params = line ? [line] : [];
    const { rows } = await pool.query(
      `SELECT station, COUNT(*) AS count
       FROM properties
       ${where}
       GROUP BY station
       ORDER BY count DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 서버 시작 ───────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

(async () => {
  await initDB();
  app.listen(PORT, () => console.log(`서버 실행 중: http://localhost:${PORT}`));

  // 노선 그룹별 크롤링 스케줄 (1일 1순환)
  CRAWL_GROUPS.forEach((group) => {
    cron.schedule(group.cron, () => {
      console.log(`[배치] 그룹 ${group.id}(${group.name}) 시작: ${new Date().toISOString()}`);
      runCrawler(group.lines)
        .then((s) => console.log(`[배치] 그룹 ${group.id}(${group.name}) 완료`, s))
        .catch((err) => console.error(`[배치] 그룹 ${group.id}(${group.name}) 오류`, err.message));
    });
  });

  console.log('[배치] 스케줄 등록 완료:');
  CRAWL_GROUPS.forEach((g) => console.log(`  ${g.cron}  ${g.id}(${g.name}): ${g.lines.join(', ')}`));
})();
