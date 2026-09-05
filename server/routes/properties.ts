import { Router, Request, Response } from 'express';
import { pool } from '../db';
import { LINES } from '../lines';

const router = Router();

const SORT_MAP: Record<string, string> = {
  price_asc:  'price_num ASC NULLS LAST',
  price_desc: 'price_num DESC NULLS LAST',
  walk_asc:   'walk_min ASC NULLS LAST',
  walk_desc:  'walk_min DESC NULLS LAST',
  year_asc:   'CAST(year_built AS INTEGER) ASC NULLS LAST',
  year_desc:  'CAST(year_built AS INTEGER) DESC NULLS LAST',
};

router.get('/', async (req: Request, res: Response) => {
  try {
    const {
      line, area, station, buildingType, ageType,
      page = '1', limit = '20', priceMin, priceMax, yearFrom,
      walkMax, landAreaMin, landAreaMax, buildingAreaMin, buildingAreaMax,
      sortBy, skipCount,
    } = req.query as Record<string, string | undefined>;

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const conditions: string[] = [];
    const params: unknown[] = [];

    const push = (val: unknown, cond: string): void => {
      params.push(val);
      conditions.push(cond.replace('?', `$${params.length}`));
    };

    if (line) push(line, 'line_name = ?');
    if (area) {
      const areaNames = LINES.filter((l) => l.prefecture === area).map((l) => l.name);
      if (areaNames.length === 1) {
        push(areaNames[0], 'area = ?');
      } else if (areaNames.length > 1) {
        params.push(areaNames);
        conditions.push(`area = ANY($${params.length})`);
      }
    }
    if (station) {
      const list = station.split(',').map((s) => s.trim()).filter(Boolean);
      if (list.length === 1) {
        push(list[0], 'station = ?');
      } else {
        params.push(list);
        conditions.push(`station = ANY($${params.length})`);
      }
    }
    if (buildingType || ageType) {
      const all = ['shinchiku', 'chuko', 'shinchiku_mansion', 'chuko_mansion'];
      const types = all.filter((t) => {
        if (buildingType === 'ikkodate' && t.includes('mansion')) return false;
        if (buildingType === 'mansion'  && !t.includes('mansion')) return false;
        if (ageType === 'shinchiku' && !t.startsWith('shinchiku')) return false;
        if (ageType === 'chuko'     && !t.startsWith('chuko'))     return false;
        return true;
      });
      if (types.length === 1) {
        push(types[0], 'property_type = ?');
      } else if (types.length < 4) {
        params.push(types);
        conditions.push(`property_type = ANY($${params.length})`);
      }
    }
    if (priceMin)     push(parseInt(priceMin, 10),      'price_num >= ?');
    if (priceMax)     push(parseInt(priceMax, 10),      'price_num <= ?');
    if (yearFrom)     push(parseInt(yearFrom, 10),      'CAST(year_built AS INTEGER) >= ?');
    if (walkMax)      push(parseInt(walkMax, 10),       'walk_min <= ?');
    if (landAreaMin)  push(parseFloat(landAreaMin),     'land_area_num >= ?');
    if (landAreaMax)  push(parseFloat(landAreaMax),     'land_area_num <= ?');
    if (buildingAreaMin) push(parseFloat(buildingAreaMin), 'building_area_num >= ?');
    if (buildingAreaMax) push(parseFloat(buildingAreaMax), 'building_area_num <= ?');

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const order = SORT_MAP[sortBy ?? ''] ?? 'created_at DESC';
    const dataParams = [...params, limit, offset];

    const dataQuery = pool.query(
      `SELECT *,
              (SELECT COUNT(*) FROM price_history WHERE homes_url = properties.homes_url) AS price_change_count
       FROM properties ${where} ORDER BY ${order} LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams
    );

    if (skipCount === 'true') {
      const { rows } = await dataQuery;
      res.json({ total: null, page: parseInt(page, 10), limit: parseInt(limit, 10), data: rows });
      return;
    }

    const [countResult, dataResult] = await Promise.all([
      pool.query<{ count: string }>(`SELECT COUNT(*) FROM properties ${where}`, params),
      dataQuery,
    ]);

    res.json({
      total: parseInt(countResult.rows[0].count, 10),
      page:  parseInt(page, 10),
      limit: parseInt(limit, 10),
      data:  dataResult.rows,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/price-history', async (req: Request, res: Response) => {
  try {
    const { homes_url } = req.query as { homes_url?: string };
    if (!homes_url) { res.status(400).json({ error: 'homes_url required' }); return; }
    const { rows } = await pool.query(
      'SELECT old_price, new_price, changed_at FROM price_history WHERE homes_url = $1 ORDER BY changed_at ASC',
      [homes_url]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query('SELECT * FROM properties WHERE id = $1', [req.params.id]);
    if (!rows.length) { res.status(404).json({ error: '매물을 찾을 수 없습니다' }); return; }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
