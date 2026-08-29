const { Pool } = require('pg');
require('dotenv').config();
const { LINES, getTableName } = require('./lines');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// 노선 테이블 스키마 (공통)
const lineTableSchema = (tableName) => `
  CREATE TABLE IF NOT EXISTS ${tableName} (
    id                BIGINT      PRIMARY KEY DEFAULT nextval('global_prop_id_seq'),
    name              VARCHAR(500),
    price             VARCHAR(100),
    price_num         INTEGER,
    price_initial     INTEGER,
    walk_min          INTEGER,
    address           VARCHAR(500),
    transport         VARCHAR(500),
    land_area         VARCHAR(100),
    land_area_num     FLOAT,
    building_area     VARCHAR(100),
    building_area_num FLOAT,
    layout            VARCHAR(100),
    year_built        INTEGER,
    line_name         VARCHAR(100),
    area              VARCHAR(50),
    station           VARCHAR(100),
    property_type     VARCHAR(20),
    homes_url         TEXT        UNIQUE,
    image_url         TEXT,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
  );
`;

const initDB = async () => {
  // ── 전역 ID 시퀀스 (모든 노선 테이블이 공유 → VIEW 내 id 중복 없음) ──
  await pool.query(`CREATE SEQUENCE IF NOT EXISTS global_prop_id_seq START 1;`);

  // ── 기존 properties 테이블 마이그레이션 ────────────────────────────────
  // 현재 properties가 일반 테이블(relkind='r')이면 per-line 테이블로 이동 후 VIEW로 전환
  const relResult = await pool.query(`
    SELECT relkind FROM pg_class
    JOIN pg_namespace ON pg_class.relnamespace = pg_namespace.oid
    WHERE relname = 'properties' AND nspname = 'public'
  `);
  const relKind = relResult.rows[0]?.relkind;

  if (relKind === 'r') {
    console.log('[DB] 기존 properties 테이블 → 노선별 테이블로 마이그레이션 시작');

    // FK 제약 제거 (price_history, favorites)
    await pool.query(`
      ALTER TABLE IF EXISTS price_history
        DROP CONSTRAINT IF EXISTS price_history_homes_url_fkey;
    `);
    await pool.query(`
      ALTER TABLE IF EXISTS favorites
        DROP CONSTRAINT IF EXISTS favorites_property_id_fkey;
    `);

    // 전역 시퀀스를 기존 max id + 1 부터 시작 (마이그레이션 후 id 충돌 방지)
    const { rows: [{ maxid }] } = await pool.query(`SELECT COALESCE(MAX(id), 0) AS maxid FROM properties`);
    await pool.query(`SELECT setval('global_prop_id_seq', $1, false)`, [parseInt(maxid) + 1]);

    // 노선별 테이블 생성 후 데이터 이동
    for (const line of LINES) {
      const tbl = getTableName(line.slug);
      await pool.query(lineTableSchema(tbl));
      await pool.query(`
        INSERT INTO ${tbl}
          (id, name, price, price_num, price_initial, walk_min, address, transport,
           land_area, land_area_num, building_area, building_area_num, layout, year_built,
           line_name, area, station, property_type, homes_url, image_url, created_at, updated_at)
        SELECT
          id, name, price, price_num, price_initial, walk_min, address, transport,
          land_area, land_area_num, building_area, building_area_num, layout,
          CAST(NULLIF(REGEXP_REPLACE(year_built::TEXT, '[^0-9]', '', 'g'), '') AS INTEGER),
          line_name, area, station, property_type, homes_url, image_url, created_at, updated_at
        FROM properties
        WHERE line_name = $1
        ON CONFLICT (homes_url) DO NOTHING
      `, [line.name]);
    }

    // 기존 테이블 제거 후 VIEW로 교체
    await pool.query(`DROP TABLE properties CASCADE`);
    console.log('[DB] properties 테이블 제거 완료');
  }

  // ── 노선별 테이블 생성 (신규 설치 또는 새 노선 추가 시) ─────────────
  for (const line of LINES) {
    await pool.query(lineTableSchema(getTableName(line.slug)));
  }

  // ── 통합 VIEW 생성 (노선 추가/변경 시마다 재생성) ────────────────────
  const unionSQL = LINES
    .map((l) => `SELECT * FROM ${getTableName(l.slug)}`)
    .join('\nUNION ALL\n');
  await pool.query(`CREATE OR REPLACE VIEW properties AS ${unionSQL}`);

  // ── 인덱스 (각 노선 테이블에 생성) ──────────────────────────────────
  for (const line of LINES) {
    const tbl = getTableName(line.slug);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_${tbl}_price  ON ${tbl}(price_num);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_${tbl}_walk   ON ${tbl}(walk_min);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_${tbl}_area   ON ${tbl}(area);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_${tbl}_stn    ON ${tbl}(station);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_${tbl}_type   ON ${tbl}(property_type);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_${tbl}_cat    ON ${tbl}(created_at DESC);`);
  }

  // ── price_history ────────────────────────────────────────────────────
  // homes_url 기준 (FK 없음 - VIEW로 전환됐으므로 애플리케이션 레벨에서 관리)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS price_history (
      id          SERIAL PRIMARY KEY,
      homes_url   TEXT        NOT NULL,
      old_price   INTEGER     NOT NULL,
      new_price   INTEGER     NOT NULL,
      changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_price_history_url ON price_history(homes_url);`);

  // ── watchlist (관심종목 — properties 삭제에 영향받지 않는 별도 테이블) ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS watchlist (
      id                SERIAL PRIMARY KEY,
      user_id           TEXT NOT NULL,
      homes_url         TEXT NOT NULL,
      property_id       BIGINT,
      name              VARCHAR(500),
      price             VARCHAR(100),
      price_num         INTEGER,
      address           VARCHAR(500),
      transport         VARCHAR(500),
      line_name         VARCHAR(100),
      station           VARCHAR(100),
      walk_min          INTEGER,
      layout            VARCHAR(100),
      land_area         VARCHAR(100),
      land_area_num     FLOAT,
      building_area     VARCHAR(100),
      building_area_num FLOAT,
      year_built        INTEGER,
      property_type     VARCHAR(20),
      image_url         TEXT,
      snapshot_at       TIMESTAMPTZ DEFAULT NOW(),
      created_at        TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (user_id, homes_url)
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_watchlist_user_id ON watchlist(user_id);`);

  // ── favorites (기존 호환 유지, 신규는 watchlist 사용) ────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS favorites (
      user_id     TEXT    NOT NULL,
      property_id BIGINT  NOT NULL,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (user_id, property_id)
    );
  `);

  console.log('[DB] 초기화 완료 — 노선별 테이블:', LINES.length, '개');
};

module.exports = { pool, initDB };
