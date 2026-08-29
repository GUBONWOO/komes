const { Router } = require('express');
const { pool } = require('../db');

const router = Router();

const SORT_MAP = {
  price_asc:  'price_num ASC NULLS LAST',
  price_desc: 'price_num DESC NULLS LAST',
  walk_asc:   'walk_min ASC NULLS LAST',
  walk_desc:  'walk_min DESC NULLS LAST',
  year_asc:   'CAST(year_built AS INTEGER) ASC NULLS LAST',
  year_desc:  'CAST(year_built AS INTEGER) DESC NULLS LAST',
};

// GET /api/properties
router.get('/', async (req, res) => {
  try {
    const { line, area, station, buildingType, ageType, page = 1, limit = 20, priceMin, priceMax, yearFrom, walkMax, landAreaMin, landAreaMax, buildingAreaMin, buildingAreaMax, sortBy, skipCount } = req.query;
    const offset = (page - 1) * limit;

    const conditions = [];
    const params = [];

    const push = (val, cond) => {
      params.push(val);
      conditions.push(cond.replace('?', `$${params.length}`));
    };

    if (line)     push(line,               'line_name = ?');
    if (area)     push(area,               'area = ?');
    if (station) {
      const list = station.split(',').map((s) => s.trim()).filter(Boolean);
      if (list.length === 1) push(list[0], 'station = ?');
      else { params.push(list); conditions.push(`station = ANY($${params.length})`); }
    }
    if (buildingType || ageType) {
      const all = ['shinchiku', 'chuko', 'shinchiku_mansion', 'chuko_mansion'];
      const types = all.filter((t) => {
        if (buildingType === 'ikkodate' && t.includes('mansion')) return false;
        if (buildingType === 'mansion' && !t.includes('mansion')) return false;
        if (ageType === 'shinchiku' && !t.startsWith('shinchiku')) return false;
        if (ageType === 'chuko' && !t.startsWith('chuko')) return false;
        return true;
      });
      if (types.length === 1) {
        push(types[0], 'property_type = ?');
      } else if (types.length < 4) {
        params.push(types);
        conditions.push(`property_type = ANY($${params.length})`);
      }
    }
    if (priceMin) push(parseInt(priceMin),  'price_num >= ?');
    if (priceMax) push(parseInt(priceMax),  'price_num <= ?');
    if (yearFrom) push(parseInt(yearFrom),  '(CAST(year_built AS INTEGER) >= ? OR year_built IS NULL)');
    if (walkMax)         push(parseInt(walkMax),           'walk_min <= ?');
    if (landAreaMin)     push(parseFloat(landAreaMin),     'land_area_num >= ?');
    if (landAreaMax)     push(parseFloat(landAreaMax),     'land_area_num <= ?');
    if (buildingAreaMin) push(parseFloat(buildingAreaMin), 'building_area_num >= ?');
    if (buildingAreaMax) push(parseFloat(buildingAreaMax), 'building_area_num <= ?');

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const order = SORT_MAP[sortBy] || 'created_at DESC';

    const dataParams = [...params, limit, offset];

    const dataQuery = pool.query(
      `SELECT *,
              (SELECT COUNT(*) FROM price_history WHERE homes_url = properties.homes_url) AS price_change_count
       FROM properties ${where} ORDER BY ${order} LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams
    );

    let count;
    if (skipCount === 'true') {
      const { rows } = await dataQuery;
      return res.json({ total: null, page: parseInt(page), limit: parseInt(limit), data: rows });
    }

    const [countResult, dataResult] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM properties ${where}`, params),
      dataQuery,
    ]);

    count = countResult.rows[0].count;
    const { rows } = dataResult;

    res.json({ total: parseInt(count, 10), page: parseInt(page), limit: parseInt(limit), data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/properties/price-history?homes_url=...
router.get('/price-history', async (req, res) => {
  try {
    const { homes_url } = req.query;
    if (!homes_url) return res.status(400).json({ error: 'homes_url required' });
    const { rows } = await pool.query(
      'SELECT old_price, new_price, changed_at FROM price_history WHERE homes_url = $1 ORDER BY changed_at ASC',
      [homes_url]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/properties/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM properties WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: '매물을 찾을 수 없습니다' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
