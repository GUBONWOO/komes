import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cron from 'node-cron';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import 'dotenv/config';
import './types'; // Express.User 타입 확장 로드

import { initDB, pool } from './db';
import { runCrawler, TARGET_LINES, CRAWL_GROUPS } from './crawler';
import propertiesRouter from './routes/properties';
import authRouter from './routes/auth';
import favoritesRouter from './routes/favorites';
import watchlistRouter from './routes/watchlist';
import type { UserProfile } from './types';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-prod';

const app = express();
app.set('trust proxy', 1);
app.use(cors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(cookieParser());

passport.use(new GoogleStrategy(
  {
    clientID:     process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    callbackURL:  process.env.GOOGLE_CALLBACK_URL ?? '',
  },
  (_accessToken, _refreshToken, profile, done) => {
    const user: UserProfile = {
      id:    profile.id,
      name:  profile.displayName,
      email: profile.emails?.[0]?.value ?? '',
      photo: profile.photos?.[0]?.value,
    };
    done(null, user);
  }
));
app.use(passport.initialize());

const INTERNAL_NETWORK = process.env.INTERNAL_NETWORK ?? '';
app.use((req: Request, _res: Response, next: NextFunction) => {
  if (INTERNAL_NETWORK) {
    const ip = req.ip ?? req.socket.remoteAddress ?? '';
    if (ip.startsWith(INTERNAL_NETWORK) || ip === '::1' || ip === '127.0.0.1' || ip === '::ffff:127.0.0.1') {
      req.user = { id: 'admin', name: '관리자', email: 'admin@local' };
      return next();
    }
  }
  const token = req.cookies?.token as string | undefined;
  if (token) {
    try {
      req.user = jwt.verify(token, JWT_SECRET) as UserProfile;
    } catch { /* invalid token */ }
  }
  next();
});

app.use('/auth', authRouter);

const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  if (req.user) { next(); return; }
  res.status(401).json({ error: 'Unauthorized' });
};

app.use('/api', requireAuth);
app.use('/api/properties', propertiesRouter);
app.use('/api/favorites',  favoritesRouter);
app.use('/api/watchlist',  watchlistRouter);

app.get('/api/stats', async (_req, res: Response) => {
  try {
    const { rows } = await pool.query<{ line_name: string; count: string }>(
      `SELECT line_name, COUNT(*) AS count FROM properties GROUP BY line_name ORDER BY line_name`
    );
    const { rows: [{ count }] } = await pool.query<{ count: string }>('SELECT COUNT(*) FROM properties');
    res.json({ total: parseInt(count, 10), byLine: rows });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/crawl', (req: Request, res: Response) => {
  const { area, areas, types } = (req.body ?? {}) as { area?: string; areas?: string[]; types?: string | string[] };
  const areaTarget = areas ?? area ?? null;
  const typeList = types ? (Array.isArray(types) ? types : [types]) : null;
  const label = Array.isArray(areaTarget) ? areaTarget.join(',') : (areaTarget ?? '전체 지역');
  console.log(`크롤링 요청: ${label} / 타입: ${typeList ? typeList.join(',') : '전체'}`);
  res.json({ message: `크롤링 시작: ${label}` });

  runCrawler(areaTarget, typeList)
    .then((summary) => console.log('크롤링 완료:', summary))
    .catch((err: Error) => console.error('크롤링 오류:', err.message));
});

app.get('/api/lines', (_req, res: Response) => {
  res.json(TARGET_LINES.map((a) => a.name));
});

app.get('/api/crawl-groups', (_req, res: Response) => {
  res.json(CRAWL_GROUPS.map((g) => ({ id: g.id, name: g.name, cron: g.cron, areas: g.areas })));
});

app.get('/api/stations', async (req: Request, res: Response) => {
  try {
    const { line } = req.query as { line?: string };
    const where = line ? 'WHERE line_name = $1 AND station IS NOT NULL' : 'WHERE station IS NOT NULL';
    const params = line ? [line] : [];
    const { rows } = await pool.query<{ station: string; count: string }>(
      `SELECT station, COUNT(*) AS count FROM properties ${where} GROUP BY station ORDER BY count DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

const PORT = process.env.PORT ?? 5000;

(async () => {
  await initDB();
  app.listen(PORT, () => console.log(`서버 실행 중: http://localhost:${PORT}`));

  CRAWL_GROUPS.forEach((group) => {
    cron.schedule(group.cron, () => {
      console.log(`[배치] 그룹 ${group.id}(${group.name}) 시작: ${new Date().toISOString()}`);
      runCrawler(group.areas)
        .then((s) => console.log(`[배치] 그룹 ${group.id}(${group.name}) 완료`, s))
        .catch((err: Error) => console.error(`[배치] 그룹 ${group.id}(${group.name}) 오류`, err.message));
    });
  });

  console.log('[배치] 스케줄 등록 완료:');
  CRAWL_GROUPS.forEach((g) => console.log(`  ${g.cron}  ${g.id}(${g.name}): ${g.areas.join(', ')}`));
})();
