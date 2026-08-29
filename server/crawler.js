const axios = require('axios');
const cheerio = require('cheerio');
const { pool } = require('./db');
const { LINES, getTableName } = require('./lines');

const BASE_URL = 'https://homes.co.jp';
const ITEMS_PER_PAGE = 30;
const MAX_PAGES = 50;
const CRAWL_DELAY_MS = 1500;
const LINE_DELAY_MS = 2000;
const MAX_WALK_MIN = 30;
// 크롤링 결과가 기존 데이터의 이 비율 미만이면 삭제를 보류 (크롤링 실패 방지)
const MIN_DELETE_RATIO = 0.3;

const TARGET_LINES = LINES;

// 시간별 크롤링 그룹 (1일 1순환)
const CRAWL_GROUPS = [
  {
    id: 'g01', name: '重量JR北系',
    cron: '0 0 * * *',
    lines: ['埼京線', '京浜東北線'],
  },
  {
    id: 'g02', name: '重量JR東系',
    cron: '30 2 * * *',
    lines: ['総武線', '常磐線'],
  },
  {
    id: 'g03', name: '東急重量',
    cron: '0 5 * * *',
    lines: ['東急東横線', '東急田園都市線'],
  },
  {
    id: 'g04', name: '小田急・南JR',
    cron: '30 7 * * *',
    lines: ['小田急小田原線', '東海道本線', '横須賀線'],
  },
  {
    id: 'g05', name: 'メトロ深部',
    cron: '0 10 * * *',
    lines: ['副都心線', '有楽町線', '半蔵門線', '南北線'],
  },
  {
    id: 'g06', name: 'メトロ内環',
    cron: '0 12 * * *',
    lines: ['銀座線', '丸ノ内線', '日比谷線', '千代田線', '東西線'],
  },
  {
    id: 'g07', name: '都営全線',
    cron: '0 14 * * *',
    lines: ['浅草線', '三田線', '都営新宿線', '大江戸線'],
  },
  {
    id: 'g08', name: '東武・西武',
    cron: '0 16 * * *',
    lines: ['東武東上線', '東武野田線', '西武新宿線', '西武池袋線'],
  },
  {
    id: 'g09', name: 'JR雑多',
    cron: '30 18 * * *',
    lines: ['中央線', '山手線', '南武線', '武蔵野線', '横浜線'],
  },
  {
    id: 'g10', name: '軽量各線',
    cron: '0 21 * * *',
    lines: ['京王線', '京王井の頭線', '小田急多摩線', '小田急江ノ島線',
            '東急目黒線', '東急大井町線', '東急多摩川線', '東急池上線',
            '京成本線', 'りんかい線', 'つくばエクスプレス'],
  },
];

const URL_TYPES = [
  { type: 'chuko',             path: 'chukoikkodate' },  // 中古一戸建て
  { type: 'shinchiku',         path: 'ikkodate' },       // 新築一戸建て
  { type: 'chuko_mansion',     path: 'ms/chuko' },       // 中古マンション
  { type: 'shinchiku_mansion', path: 'ms/shinchiku' },   // 新築マンション
];

const axiosInstance = axios.create({
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'ja-JP,ja;q=0.9',
  },
  timeout: 15000,
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const parsePrice = (text) => {
  const results = [];
  for (const m of text.matchAll(/(\d+)\s*億\s*(\d*)\s*万?円/g)) {
    results.push(parseInt(m[1], 10) * 10000 + (m[2] ? parseInt(m[2], 10) : 0));
  }
  const manMatches = text.replace(/\d+億\d*万?円/g, '').match(/(\d[\d,]*)\s*万円/g);
  if (manMatches) manMatches.forEach((m) => results.push(parseInt(m.replace(/[^0-9]/g, ''), 10)));
  return results.length ? Math.min(...results) : null;
};

const parseWalkMinForLine = (transport, lineName) => {
  if (!transport) return Infinity;
  const idx = transport.indexOf(lineName);
  if (idx === -1) return Infinity;
  const m = transport.slice(idx).match(/徒歩\s*(\d+)\s*分/);
  return m ? parseInt(m[1], 10) : Infinity;
};

const parseStationForLine = (transport, lineName) => {
  if (!transport) return null;
  const idx = transport.indexOf(lineName);
  if (idx === -1) return null;
  const m = transport.slice(idx).match(/「([^」]+)」/);
  return m ? m[1] : null;
};

const parseLandArea = (text) => {
  if (!text) return null;
  const m = text.match(/(\d+\.?\d*)/);
  return m ? parseFloat(m[1]) : null;
};

const parseYearBuilt = (text) => {
  const m = text.match(/(\d{4})\s*年/);
  return m ? parseInt(m[1], 10) : null;
};

const parsePage = ($, urlType) => {
  const items = [];

  if (urlType.type === 'shinchiku_mansion') {
    $('.property_unit').each((_, unit) => {
      const $u = $(unit);
      const name = $u.find('.cassette_header-title').text().trim() || null;
      let address = null;
      let transport = null;
      $u.find('.cassette_basic-list_item').each((_, item) => {
        const title = $(item).find('.cassette_basic-title').text().trim();
        const value = $(item).find('.cassette_basic-value').text().trim().replace(/\s+/g, ' ');
        if (title === '所在地') address = value;
        if (title === '交通')   transport = value;
      });
      const priceText = $u.find('.cassette_price-accent').first().text().trim();
      const priceNum  = parsePrice(priceText);
      if (!priceNum) return;
      const descText = $u.find('.cassette_price-description').first().text().trim().replace(/\s+/g, ' ');
      const layoutMatch = descText.match(/^([^/／]+)/);
      const layout = layoutMatch ? layoutMatch[1].trim() : null;
      const areaMatch = descText.match(/([\d.]+)m/);
      const bldArea    = areaMatch ? `${areaMatch[1]}㎡` : null;
      const bldAreaNum = areaMatch ? parseFloat(areaMatch[1]) : null;
      const href = $u.find('a[href*="/ms/shinchiku/"]').first().attr('href') || '';
      const url  = href.startsWith('http') ? href : BASE_URL + href;
      const imgEl   = $u.find('img').first();
      const rawImg  = imgEl.attr('rel') || imgEl.attr('data-src') || imgEl.attr('src') || '';
      const cleanImg = rawImg.replace(/&amp;/g, '&');
      const imageUrl = cleanImg.startsWith('http') ? cleanImg : cleanImg ? BASE_URL + cleanImg : null;
      items.push({
        name, price: priceText, price_num: priceNum, address, transport,
        land_area: null, land_area_num: null,
        building_area: bldArea, building_area_num: bldAreaNum,
        layout, year_built: null, property_type: urlType.type,
        homes_url: url || null, image_url: imageUrl,
      });
    });
    return items;
  }

  $('.property_unit').each((_, unit) => {
    const get = (label) => {
      let val = '';
      $(unit).find('dl').each((_, dl) => {
        if ($(dl).find('dt').text().trim() === label)
          val = $(dl).find('dd').text().trim().replace(/\s+/g, ' ');
      });
      return val;
    };
    const name      = get('物件名');
    const price     = get('販売価格');
    const address   = get('所在地');
    const transport = get('沿線・駅');
    const landArea  = get('土地面積');
    const layout    = get('間取り');
    const bldArea   = get('建物面積') || get('専有面積');
    const yearText  = get('築年月');
    const priceNum = parsePrice(price || '');
    if (!priceNum) return;
    const href = $(unit).find('a[href*="ikkodate"], a[href*="/ms/chuko/"], a[href*="/ms/shinchiku/"]').first().attr('href') || '';
    const url  = href.startsWith('http') ? href : BASE_URL + href;
    const imgEl  = $(unit).find('img').first();
    const rawImg = imgEl.attr('rel') || imgEl.attr('data-src') || imgEl.attr('src') || '';
    const cleanImg = rawImg.replace(/&amp;/g, '&');
    const imageUrl = cleanImg.startsWith('http') ? cleanImg : cleanImg ? BASE_URL + cleanImg : null;
    items.push({
      name: name || null, price, price_num: priceNum,
      address: address || null, transport: transport || null,
      land_area: landArea || null, land_area_num: parseLandArea(landArea),
      building_area: bldArea || null, building_area_num: parseLandArea(bldArea),
      layout: layout || null, year_built: parseYearBuilt(yearText) || null,
      property_type: urlType.type, homes_url: url || null, image_url: imageUrl,
    });
  });
  return items;
};

const getTotalPages = ($) => {
  const hitText = $('.pagination_set-hit').first().text().trim();
  const total   = parseInt(hitText.replace(/[^0-9]/g, ''), 10) || 0;
  return Math.ceil(total / ITEMS_PER_PAGE);
};

const crawlLineArea = async (line, urlType, area) => {
  const { path } = urlType;
  const allItems = [];
  const buildUrl = (page) => {
    const base = `${BASE_URL}/${path}/${area}/${line.slug}/`;
    const params = new URLSearchParams({ pc: String(ITEMS_PER_PAGE) });
    if (page > 1) params.set('page', String(page));
    return `${base}?${params.toString()}`;
  };
  const { data: firstData } = await axiosInstance.get(buildUrl(1));
  const $first = cheerio.load(firstData);
  const totalPages = Math.min(getTotalPages($first), MAX_PAGES);
  const firstItems = parsePage($first, urlType);
  allItems.push(...firstItems);
  console.log(`  [${area}] 1/${totalPages}p → ${firstItems.length}건`);
  for (let page = 2; page <= totalPages; page++) {
    await sleep(CRAWL_DELAY_MS);
    try {
      const { data } = await axiosInstance.get(buildUrl(page));
      const $ = cheerio.load(data);
      const items = parsePage($, urlType);
      allItems.push(...items);
      console.log(`  [${area}] ${page}/${totalPages}p → ${items.length}건`);
    } catch (err) {
      console.warn(`  [${area}] ${page}p 스킵: ${err.message}`);
    }
  }
  return allItems;
};

const crawlLineType = async (line, urlType) => {
  const { type } = urlType;
  console.log(`\n[${line.name}/${type}] 크롤링 시작 (지역: ${line.areas.join(', ')})`);
  const allItems = [];
  for (const area of line.areas) {
    try {
      const items = await crawlLineArea(line, urlType, area);
      allItems.push(...items
        .filter((item) => item.transport && item.transport.split('/')[0].includes(line.name))
        .map((item) => ({
          ...item,
          area: /埼玉県/.test(item.address) ? 'saitama'
              : /東京都/.test(item.address) ? 'tokyo'
              : /神奈川県/.test(item.address) ? 'kanagawa'
              : /千葉県/.test(item.address) ? 'chiba'
              : area,
          walk_min: parseWalkMinForLine(item.transport, line.name),
          station:  parseStationForLine(item.transport, line.name),
        }))
        .filter((item) => item.walk_min <= MAX_WALK_MIN)
      );
    } catch (err) {
      console.warn(`[${line.name}/${type}] ${area} 스킵: ${err.message}`);
    }
    await sleep(LINE_DELAY_MS);
  }
  console.log(`[${line.name}/${type}] 합계 ${allItems.length}건`);
  return allItems;
};

// ──────────────────────────────────────────────────────────────────────────
// DB 저장 — 노선별 독립 테이블에 직접 갱신
// crawledAreas / crawledTypes 범위 내에서만 삭제하여 부분 크롤링 충돌 방지
// MIN_DELETE_RATIO 미만이면 삭제 보류 (크롤링 블록 등 비정상 결과 보호)
// ──────────────────────────────────────────────────────────────────────────
const saveProperties = async (items, line, crawledAreas = null, crawledTypes = null) => {
  const tbl = getTableName(line.slug);
  const client = await pool.connect();
  let saved = 0;
  let updated = 0;
  let deleted = 0;
  let deleteSkipped = false;

  try {
    await client.query('BEGIN');

    // 1. 기존 가격/price_initial 조회 (업데이트 감지 및 price_initial 보존)
    const crawledUrls = items.map((i) => i.homes_url).filter(Boolean);
    const existingMap = new Map();
    if (crawledUrls.length > 0) {
      const { rows } = await client.query(
        `SELECT homes_url, price_num, price_initial FROM ${tbl} WHERE homes_url = ANY($1)`,
        [crawledUrls]
      );
      rows.forEach((r) => existingMap.set(r.homes_url, r));
    }

    // 2. UPSERT
    for (const item of items) {
      if (!item.homes_url) continue;
      const prev = existingMap.get(item.homes_url);
      const priceInitial = prev?.price_initial ?? prev?.price_num ?? item.price_num;

      const result = await client.query(
        `INSERT INTO ${tbl}
          (name, price, price_num, price_initial, walk_min, address, transport,
           land_area, land_area_num, building_area, building_area_num,
           layout, year_built, line_name, area, station, property_type, homes_url, image_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         ON CONFLICT (homes_url) DO UPDATE SET
           price=$2, price_num=$3, walk_min=$5, address=$6, transport=$7,
           land_area=$8, land_area_num=$9, building_area=$10, building_area_num=$11,
           layout=$12, year_built=$13, area=$15, station=$16, property_type=$17,
           image_url=$19, updated_at=NOW()
         RETURNING (xmax = 0) AS inserted`,
        [item.name, item.price, item.price_num, priceInitial, item.walk_min,
         item.address, item.transport, item.land_area, item.land_area_num,
         item.building_area, item.building_area_num, item.layout, item.year_built,
         line.name, item.area || null, item.station || null, item.property_type || null,
         item.homes_url, item.image_url || null]
      );

      if (result.rows[0].inserted) {
        saved++;
      } else {
        updated++;
        if (prev && prev.price_num !== item.price_num && item.property_type === 'chuko') {
          await client.query(
            `INSERT INTO price_history (homes_url, old_price, new_price) VALUES ($1,$2,$3)`,
            [item.homes_url, prev.price_num, item.price_num]
          );
        }
      }
    }

    // 3. 안전 임계값 체크 후 삭제
    if (crawledUrls.length > 0) {
      let countCond = 'homes_url IS NOT NULL';
      const countParams = [];
      if (crawledAreas?.length) {
        countCond += ` AND area = ANY($${countParams.push(crawledAreas)})`;
      }
      if (crawledTypes?.length) {
        countCond += ` AND property_type = ANY($${countParams.push(crawledTypes)})`;
      }
      const { rows: [{ cnt }] } = await client.query(
        `SELECT COUNT(*) AS cnt FROM ${tbl} WHERE ${countCond}`,
        countParams
      );
      const existingCount = parseInt(cnt, 10);

      if (existingCount > 10 && crawledUrls.length < existingCount * MIN_DELETE_RATIO) {
        console.warn(
          `[${line.name}] ⚠️  삭제 보류: 크롤링 ${crawledUrls.length}건 < 기존 ${existingCount}건의 ${Math.round(MIN_DELETE_RATIO * 100)}%`
        );
        deleteSkipped = true;
      } else {
        // watchlist에 등록된 URL은 삭제 대상에서 제외
        let delCond = `homes_url NOT IN (${crawledUrls.map((_, i) => `$${i + 1}`).join(',')})`;
        const delParams = [...crawledUrls];
        if (crawledAreas?.length) {
          delCond += ` AND area = ANY($${delParams.push(crawledAreas)})`;
        }
        if (crawledTypes?.length) {
          delCond += ` AND property_type = ANY($${delParams.push(crawledTypes)})`;
        }
        const delResult = await client.query(
          `DELETE FROM ${tbl}
           WHERE ${delCond}
             AND homes_url NOT IN (SELECT DISTINCT homes_url FROM watchlist)`,
          delParams
        );
        deleted = delResult.rowCount;
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return { saved, updated, deleted, deleteSkipped };
};

// ──────────────────────────────────────────────────────────────────────────
// 크롤러 실행
// lineNames: 노선명 또는 노선명 배열 (null이면 전체)
// ──────────────────────────────────────────────────────────────────────────
const runCrawler = async (lineNames = null, targetAreas = null, targetTypes = null) => {
  let lines;
  if (!lineNames) {
    lines = TARGET_LINES;
  } else {
    const nameArr = Array.isArray(lineNames) ? lineNames : [lineNames];
    lines = TARGET_LINES.filter((l) => nameArr.includes(l.name));
  }

  if (targetAreas) {
    lines = lines
      .map((l) => ({ ...l, areas: l.areas.filter((a) => targetAreas.includes(a)) }))
      .filter((l) => l.areas.length > 0);
  }

  const urlTypes = targetTypes
    ? URL_TYPES.filter((t) => targetTypes.includes(t.type))
    : URL_TYPES;

  const summary = [];
  for (const line of lines) {
    let lineTotal = 0, lineSaved = 0, lineUpdated = 0, lineDeleted = 0;
    for (const urlType of urlTypes) {
      let items = [];
      try {
        items = await crawlLineType(line, urlType);
      } catch (err) {
        console.error(`[${line.name}/${urlType.type}] 오류:`, err.message);
      }
      if (items.length > 0) {
        try {
          const result = await saveProperties(items, line, line.areas, [urlType.type]);
          lineTotal += items.length;
          lineSaved += result.saved;
          lineUpdated += result.updated;
          lineDeleted += result.deleted;
          console.log(`[${line.name}/${urlType.type}] DB 저장: +${result.saved} 신규, ~${result.updated} 업데이트, -${result.deleted} 삭제`);
        } catch (err) {
          console.error(`[${line.name}/${urlType.type}] DB 저장 오류:`, err.message);
        }
      }
      await sleep(LINE_DELAY_MS);
    }
    summary.push({ line: line.name, total: lineTotal, saved: lineSaved, updated: lineUpdated, deleted: lineDeleted });
  }

  return summary;
};

module.exports = { runCrawler, TARGET_LINES, CRAWL_GROUPS };
