const { Router } = require('express');
const { pool } = require('../db');

const router = Router();

// GET /api/watchlist
// properties에 아직 있으면 최신 데이터, 삭제된 경우 스냅샷 반환
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         w.id              AS watchlist_id,
         w.created_at      AS watchlist_added_at,
         COALESCE(p.id,                w.property_id)       AS id,
         COALESCE(p.homes_url,         w.homes_url)         AS homes_url,
         COALESCE(p.name,              w.name)              AS name,
         COALESCE(p.price,             w.price)             AS price,
         COALESCE(p.price_num,         w.price_num)         AS price_num,
         COALESCE(p.price_initial,     w.price_num)         AS price_initial,
         COALESCE(p.address,           w.address)           AS address,
         COALESCE(p.transport,         w.transport)         AS transport,
         COALESCE(p.line_name,         w.line_name)         AS line_name,
         COALESCE(p.station,           w.station)           AS station,
         COALESCE(p.walk_min,          w.walk_min)          AS walk_min,
         COALESCE(p.layout,            w.layout)            AS layout,
         COALESCE(p.land_area,         w.land_area)         AS land_area,
         COALESCE(p.land_area_num,     w.land_area_num)     AS land_area_num,
         COALESCE(p.building_area,     w.building_area)     AS building_area,
         COALESCE(p.building_area_num, w.building_area_num) AS building_area_num,
         COALESCE(p.year_built,        w.year_built)        AS year_built,
         COALESCE(p.property_type,     w.property_type)     AS property_type,
         COALESCE(p.image_url,         w.image_url)         AS image_url,
         (p.id IS NOT NULL)            AS is_listed,
         (SELECT COUNT(*) FROM price_history ph WHERE ph.homes_url = w.homes_url) AS price_change_count
       FROM watchlist w
       LEFT JOIN properties p ON p.homes_url = w.homes_url
       WHERE w.user_id = $1
       ORDER BY w.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/watchlist/:id  (property.id 기준으로 추가, 스냅샷 복사)
router.post('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM properties WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: '物件が見つかりません' });
    const p = rows[0];

    await pool.query(
      `INSERT INTO watchlist
         (user_id, homes_url, property_id, name, price, price_num, address, transport,
          line_name, station, walk_min, layout, land_area, land_area_num,
          building_area, building_area_num, year_built, property_type, image_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       ON CONFLICT (user_id, homes_url) DO NOTHING`,
      [req.user.id, p.homes_url, p.id, p.name, p.price, p.price_num,
       p.address, p.transport, p.line_name, p.station, p.walk_min, p.layout,
       p.land_area, p.land_area_num, p.building_area, p.building_area_num,
       p.year_built, p.property_type, p.image_url]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/watchlist/:id  (property.id 기준으로 제거)
router.delete('/:id', async (req, res) => {
  try {
    // 먼저 properties 테이블에서 homes_url 조회
    const propResult = await pool.query('SELECT homes_url FROM properties WHERE id = $1', [req.params.id]);
    if (propResult.rows.length > 0) {
      await pool.query(
        'DELETE FROM watchlist WHERE user_id = $1 AND homes_url = $2',
        [req.user.id, propResult.rows[0].homes_url]
      );
    } else {
      // property가 이미 삭제된 경우, 저장된 property_id로 삭제
      await pool.query(
        'DELETE FROM watchlist WHERE user_id = $1 AND property_id = $2',
        [req.user.id, req.params.id]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
