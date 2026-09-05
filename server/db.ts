import { Pool } from 'pg';
import 'dotenv/config';
import { LINES, getTableName } from './lines';

export const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const lineTableSchema = (tableName: string): string => `
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

export const initDB = async (): Promise<void> => {
  await pool.query(`CREATE SEQUENCE IF NOT EXISTS global_prop_id_seq START 1;`);

  const relResult = await pool.query<{ relkind: string }>(`
    SELECT relkind FROM pg_class
    JOIN pg_namespace ON pg_class.relnamespace = pg_namespace.oid
    WHERE relname = 'properties' AND nspname = 'public'
  `);
  const relKind = relResult.rows[0]?.relkind;

  if (relKind === 'r') {
    console.log('[DB] 기존 properties 테이블 → 지역별 테이블로 마이그레이션 시작');
    await pool.query(`ALTER TABLE IF EXISTS price_history DROP CONSTRAINT IF EXISTS price_history_homes_url_fkey;`);
    await pool.query(`ALTER TABLE IF EXISTS favorites DROP CONSTRAINT IF EXISTS favorites_property_id_fkey;`);

    const { rows: [{ maxid }] } = await pool.query<{ maxid: string }>(`SELECT COALESCE(MAX(id), 0) AS maxid FROM properties`);
    await pool.query(`SELECT setval('global_prop_id_seq', $1, false)`, [parseInt(maxid) + 1]);

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
        WHERE area = $1
        ON CONFLICT (homes_url) DO NOTHING
      `, [line.name]);
    }

    await pool.query(`DROP TABLE properties CASCADE`);
    console.log('[DB] properties 테이블 제거 완료');
  }

  for (const line of LINES) {
    await pool.query(lineTableSchema(getTableName(line.slug)));
  }

  const unionSQL = LINES
    .map((l) => `SELECT * FROM ${getTableName(l.slug)}`)
    .join('\nUNION ALL\n');
  await pool.query(`CREATE OR REPLACE VIEW properties AS ${unionSQL}`);

  for (const line of LINES) {
    const tbl = getTableName(line.slug);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_${tbl}_price ON ${tbl}(price_num);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_${tbl}_walk  ON ${tbl}(walk_min);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_${tbl}_area  ON ${tbl}(area);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_${tbl}_stn   ON ${tbl}(station);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_${tbl}_type  ON ${tbl}(property_type);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_${tbl}_cat   ON ${tbl}(created_at DESC);`);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS price_history (
      id         SERIAL PRIMARY KEY,
      homes_url  TEXT        NOT NULL,
      old_price  INTEGER     NOT NULL,
      new_price  INTEGER     NOT NULL,
      changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_price_history_url ON price_history(homes_url);`);

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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS favorites (
      user_id     TEXT   NOT NULL,
      property_id BIGINT NOT NULL,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (user_id, property_id)
    );
  `);

  // 기존 잘못된 line_name(전체 transport 문자열 저장됨) 수정
  for (const line of LINES) {
    const tbl = getTableName(line.slug);
    await pool.query(`
      UPDATE ${tbl}
      SET line_name = (regexp_match(transport, '^(\\S+)'))[1]
      WHERE transport IS NOT NULL
        AND line_name IS NOT NULL
        AND line_name LIKE '% %'
    `).catch(() => {});
  }

  console.log('[DB] 초기화 완료 — 지역 테이블:', LINES.length, '개');
};
