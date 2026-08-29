import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser, Page } from 'puppeteer';
import axios from 'axios';
import * as cheerio from 'cheerio';

puppeteerExtra.use(StealthPlugin());
import { pool } from './db';
import { LINES, getTableName } from './lines';
import type { Area, UrlType, CrawlGroup, RawBrowserItem, PropertyItem, SaveResult, CrawlSummary } from './types';

const BASE_URL = 'https://www.homes.co.jp';
const ITEMS_PER_PAGE = 30;
const MAX_PAGES = 15;
const PAGE_DELAY_MS = 2000;
const PAGE_DELAY_JITTER = 1500;
const AREA_DELAY_MS = 4000;
const MIN_DELETE_RATIO = 0.3;

const DEBUG = process.env.CRAWL_DEBUG === 'true';

// HOMES 페이지 CSS 셀렉터 (test-crawl.ts로 확인)
const CARD_SEL = 'table.unitSummary';

export const URL_TYPES: UrlType[] = [
  { type: 'chuko_mansion',     path: 'mansion/chuko',    label: '中古マンション' },
  { type: 'shinchiku_mansion', path: 'mansion/shinchiku', label: '新築マンション' },
  { type: 'chuko',             path: 'kodate/chuko',     label: '中古一戸建て' },
  { type: 'shinchiku',         path: 'kodate/shinchiku', label: '新築一戸建て' },
];

export const CRAWL_GROUPS: CrawlGroup[] = [
  { id: 'g01', name: '都心',     cron: '0 0 * * *',  areas: ['千代田区', '中央区', '港区'] },
  { id: 'g02', name: '西中心部', cron: '0 3 * * *',  areas: ['新宿区', '渋谷区', '文京区'] },
  { id: 'g03', name: '城南',     cron: '0 6 * * *',  areas: ['品川区', '目黒区', '大田区'] },
  { id: 'g04', name: '城西',     cron: '0 9 * * *',  areas: ['世田谷区', '中野区', '杉並区', '豊島区'] },
  { id: 'g05', name: '墨東',     cron: '0 12 * * *', areas: ['台東区', '墨田区', '江東区'] },
  { id: 'g06', name: '城北',     cron: '0 15 * * *', areas: ['北区', '荒川区', '板橋区', '練馬区'] },
  { id: 'g07', name: '城東',     cron: '0 17 * * *', areas: ['足立区', '葛飾区', '江戸川区'] },
  { id: 'g08', name: '周辺都市', cron: '0 20 * * *', areas: ['横浜市', '川崎市', 'さいたま市', '川口市', '千葉市', '船橋市', '市川市'] },
];

const TARGET_AREAS: Area[] = LINES;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const parsePrice = (text: string | null): number | null => {
  if (!text) return null;
  const results: number[] = [];
  for (const m of text.matchAll(/(\d+)\s*億\s*(\d*)\s*万?円/g)) {
    results.push(parseInt(m[1], 10) * 10000 + (m[2] ? parseInt(m[2], 10) : 0));
  }
  const manMatches = text.replace(/\d+億\d*万?円/g, '').match(/(\d[\d,]*)\s*万円/g);
  if (manMatches) manMatches.forEach((m) => results.push(parseInt(m.replace(/[^0-9]/g, ''), 10)));
  return results.length ? Math.min(...results) : null;
};

const parseTransport = (text: string | null): { lineName: string | null; station: string | null; walkMin: number | null } => {
  if (!text) return { lineName: null, station: null, walkMin: null };
  const walkMatch = text.match(/徒歩\s*(\d+)\s*分/);
  const walkMin = walkMatch ? parseInt(walkMatch[1], 10) : null;
  const stationMatch = text.match(/([^\s\n/「」]+)駅/);
  const station = stationMatch ? stationMatch[1] : null;
  const parts = text.split(/[\n\r]+/).map((s) => s.trim()).filter(Boolean);
  const lineName = parts[0] ?? null;
  return { lineName, station, walkMin };
};

const parseArea = (text: string | null): number | null => {
  if (!text) return null;
  const m = text.match(/(\d+\.?\d*)/);
  return m ? parseFloat(m[1]) : null;
};

const parseYear = (text: string | null): number | null => {
  if (!text) return null;
  const m = text.match(/(\d{4})\s*年/);
  return m ? parseInt(m[1], 10) : null;
};

const buildItems = (rawItems: RawBrowserItem[], urlType: UrlType, areaName: string): PropertyItem[] =>
  rawItems
    .map((raw): PropertyItem | null => {
      const priceNum = parsePrice(raw.price);
      if (!priceNum) return null;
      const { lineName, station, walkMin } = parseTransport(raw.transport);
      return {
        name:              raw.name,
        price:             raw.price,
        price_num:         priceNum,
        address:           raw.address,
        transport:         raw.transport,
        land_area:         raw.landArea,
        land_area_num:     parseArea(raw.landArea),
        building_area:     raw.buildingArea,
        building_area_num: parseArea(raw.buildingArea),
        layout:            raw.layout,
        year_built:        parseYear(raw.yearBuilt),
        property_type:     urlType.type,
        homes_url:         raw.url,
        image_url:         raw.imageUrl,
        line_name:         lineName,
        station,
        walk_min:          walkMin,
        area:              areaName,
      };
    })
    .filter((item): item is PropertyItem => item !== null);

interface ScrapedResult {
  rawItems: RawBrowserItem[];
  totalStr: string;
}

// cheerio로 HTML 파싱 (Puppeteer page.evaluate와 동일한 로직)
const parseHtml = (html: string): ScrapedResult => {
  const $ = cheerio.load(html);
  const rawItems: RawBrowserItem[] = [];

  $('table.unitSummary').each((_, card) => {
    const $c = $(card);
    const relUrl = $c.find('tr[data-href]').attr('data-href') ?? null;
    const cardUrl = relUrl ? (relUrl.startsWith('http') ? relUrl : BASE_URL + relUrl) : null;
    const price     = $c.find('.priceLabel').first().text().trim() || null;
    const transport = $c.find('td.traffic').first().text().trim() || null;
    const $img      = $c.find('img.prg-lazy-display').first();
    const imageUrl  = $img.attr('data-original') ?? null;
    const name      = $img.attr('alt')?.trim() ?? null;

    let address: string | null = null, layout: string | null = null;
    let buildingArea: string | null = null, landArea: string | null = null, yearBuilt: string | null = null;

    $c.find('table.verticalTable tr').each((_, row) => {
      const cells = $(row).children().toArray();
      for (let i = 0; i < cells.length - 1; i++) {
        if (!$(cells[i]).is('th')) continue;
        const th = $(cells[i]).text().trim();
        const td = $(cells[i + 1]).is('td') ? $(cells[i + 1]).text().trim() || null : null;
        if (th.includes('所在地')) address = td;
        else if (th.includes('間取り')) layout = td;
        else if (th.includes('専有面積') || th.includes('建物面積')) buildingArea = td;
        else if (th.includes('土地面積')) landArea = td;
        else if (th.includes('築年月') || th.includes('築年')) yearBuilt = td;
      }
    });

    rawItems.push({ name, price, address, transport, layout, buildingArea, landArea, yearBuilt, url: cardUrl, imageUrl });
  });

  const totalStr = $('.totalNum').first().text().trim() || '0';
  return { rawItems, totalStr };
};

const AXIOS_HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'ja-JP,ja;q=0.9',
  'Sec-Fetch-Dest':  'document',
  'Sec-Fetch-Mode':  'navigate',
  'Sec-Fetch-Site':  'same-origin',
  'Referer':         'https://www.homes.co.jp/',
};

// axios로 페이지 가져오기 (Puppeteer에서 추출한 쿠키 사용)
const scrapePageAxios = async (url: string, cookieHeader: string): Promise<ScrapedResult> => {
  try {
    const r = await axios.get<string>(url, {
      headers: { ...AXIOS_HEADERS, Cookie: cookieHeader },
      timeout: 20000,
    });
    if (!r.data.includes('unitSummary')) return { rawItems: [], totalStr: '0' };
    return parseHtml(r.data);
  } catch {
    return { rawItems: [], totalStr: '0' };
  }
};

const isBlocked = async (page: Page): Promise<boolean> => {
  const title = await page.evaluate(() => document.title);
  return title.includes('Verification') || title.includes('403') || title.includes('Error');
};

const scrapePage = async (page: Page, url: string, retryOnBlock = true): Promise<ScrapedResult> => {
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });

  if (await isBlocked(page)) {
    if (retryOnBlock) {
      console.warn(`  [bot detection] ${url} — waiting 20s then retry`);
      await sleep(20000);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
      if (await isBlocked(page)) {
        console.warn(`  [bot detection] retry failed, skipping page`);
        return { rawItems: [], totalStr: '0' };
      }
    } else {
      return { rawItems: [], totalStr: '0' };
    }
  }

  let hasCards = false;
  try {
    await page.waitForSelector(CARD_SEL, { timeout: 12000 });
    hasCards = true;
  } catch {
    // no listings on this page
  }

  if (!hasCards) return { rawItems: [], totalStr: '0' };

  return page.evaluate((baseUrl: string) => {
    const cards = Array.from(document.querySelectorAll('table.unitSummary'));

    const rawItems = cards.map((card) => {
      // URL: tr[data-href] attribute (relative path)
      const relUrl = card.querySelector('tr[data-href]')?.getAttribute('data-href') ?? null;
      const cardUrl = relUrl ? (relUrl.startsWith('http') ? relUrl : baseUrl + relUrl) : null;

      // Price
      const price = card.querySelector('.priceLabel')?.textContent?.trim() ?? null;

      // Transport
      const transport = card.querySelector('td.traffic')?.textContent?.trim() ?? null;

      // Image (lazy-loaded: src is placeholder gif, real URL is data-original)
      const img = card.querySelector('img.prg-lazy-display');
      const imageUrl = img?.getAttribute('data-original') ?? null;
      const name = img?.getAttribute('alt')?.trim() ?? null;

      // Address, layout, area sizes, year from verticalTable th→td
      let address: string | null = null;
      let layout: string | null = null;
      let buildingArea: string | null = null;
      let landArea: string | null = null;
      let yearBuilt: string | null = null;

      // Each verticalTable row may have multiple th/td pairs side by side
      for (const row of Array.from(card.querySelectorAll('table.verticalTable tr'))) {
        const cells = Array.from(row.children);
        for (let i = 0; i < cells.length - 1; i++) {
          if (cells[i].tagName !== 'TH') continue;
          const th = cells[i].textContent?.trim() ?? '';
          const td = cells[i + 1]?.tagName === 'TD' ? cells[i + 1].textContent?.trim() ?? null : null;
          if (th.includes('所在地')) address = td;
          else if (th.includes('間取り')) layout = td;
          else if (th.includes('専有面積') || th.includes('建物面積')) buildingArea = td;
          else if (th.includes('土地面積')) landArea = td;
          else if (th.includes('築年月') || th.includes('築年')) yearBuilt = td;
        }
      }

      return { name, price, address, transport, layout, buildingArea, landArea, yearBuilt, url: cardUrl, imageUrl };
    });

    // Total count (span.totalNum confirmed by test)
    const totalStr = document.querySelector('.totalNum')?.textContent?.trim() ?? '0';

    return { rawItems, totalStr };
  }, BASE_URL) as Promise<ScrapedResult>;
};

const crawlAreaType = async (browser: Browser, area: Area, urlType: UrlType): Promise<PropertyItem[]> => {
  const buildUrl = (p: number): string => {
    const base = `${BASE_URL}/${urlType.path}/${area.prefecture}/${area.slug}/list/`;
    return p > 1 ? `${base}?page=${p}` : base;
  };

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  const allItems: PropertyItem[] = [];
  try {
    const { rawItems: firstRaw, totalStr } = await scrapePage(page, buildUrl(1));
    const totalItems = parseInt(totalStr.replace(/[^0-9]/g, ''), 10) || 0;
    const knownPages = totalItems > 0 ? Math.ceil(totalItems / ITEMS_PER_PAGE) : 0;
    // If total unknown but page 1 had a full set of items, try remaining pages up to MAX_PAGES
    const totalPages = Math.min(knownPages || (firstRaw.length >= ITEMS_PER_PAGE ? MAX_PAGES : 1), MAX_PAGES);
    const firstItems = buildItems(firstRaw, urlType, area.name);
    allItems.push(...firstItems);
    console.log(`  [${area.name}/${urlType.type}] 1/${totalPages}p → ${firstItems.length}건`);

    if (DEBUG && firstRaw[0]) {
      console.log('[DEBUG] 첫 카드:', JSON.stringify(firstRaw[0], null, 2));
    }

    // Puppeteer로 얻은 WAF 쿠키 → 나머지 페이지는 axios로 처리
    const cookies = await page.cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

    for (let p = 2; p <= totalPages; p++) {
      await sleep(PAGE_DELAY_MS + Math.random() * PAGE_DELAY_JITTER);
      try {
        const { rawItems } = await scrapePageAxios(buildUrl(p), cookieHeader);
        const items = buildItems(rawItems, urlType, area.name);
        allItems.push(...items);
        console.log(`  [${area.name}/${urlType.type}] ${p}/${totalPages}p → ${items.length}건`);
      } catch (err) {
        console.warn(`  [${area.name}/${urlType.type}] ${p}p 스킵:`, (err as Error).message);
      }
    }
  } finally {
    await page.close();
  }

  return allItems;
};

const saveProperties = async (items: PropertyItem[], area: Area, crawledTypes: string[] | null = null): Promise<SaveResult> => {
  const tbl = getTableName(area.slug);
  const client = await pool.connect();
  let saved = 0, updated = 0, deleted = 0, deleteSkipped = false;

  try {
    await client.query('BEGIN');

    const crawledUrls = items.map((i) => i.homes_url).filter((u): u is string => u !== null);
    const existingMap = new Map<string, { price_num: number; price_initial: number }>();
    if (crawledUrls.length > 0) {
      const { rows } = await client.query<{ homes_url: string; price_num: number; price_initial: number }>(
        `SELECT homes_url, price_num, price_initial FROM ${tbl} WHERE homes_url = ANY($1)`,
        [crawledUrls]
      );
      rows.forEach((r) => existingMap.set(r.homes_url, r));
    }

    for (const item of items) {
      if (!item.homes_url) continue;
      const prev = existingMap.get(item.homes_url);
      const priceInitial = prev?.price_initial ?? prev?.price_num ?? item.price_num;

      const result = await client.query<{ inserted: boolean }>(
        `INSERT INTO ${tbl}
          (name, price, price_num, price_initial, walk_min, address, transport,
           land_area, land_area_num, building_area, building_area_num,
           layout, year_built, line_name, area, station, property_type, homes_url, image_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         ON CONFLICT (homes_url) DO UPDATE SET
           price=$2, price_num=$3, walk_min=$5, address=$6, transport=$7,
           land_area=$8, land_area_num=$9, building_area=$10, building_area_num=$11,
           layout=$12, year_built=$13, line_name=$14, station=$16, property_type=$17,
           image_url=$19, updated_at=NOW()
         RETURNING (xmax = 0) AS inserted`,
        [item.name, item.price, item.price_num, priceInitial, item.walk_min,
         item.address, item.transport, item.land_area, item.land_area_num,
         item.building_area, item.building_area_num, item.layout, item.year_built,
         item.line_name, item.area, item.station, item.property_type,
         item.homes_url, item.image_url]
      );

      if (result.rows[0].inserted) {
        saved++;
      } else {
        updated++;
        if (prev && prev.price_num !== item.price_num && item.property_type?.includes('chuko')) {
          await client.query(
            `INSERT INTO price_history (homes_url, old_price, new_price) VALUES ($1,$2,$3)`,
            [item.homes_url, prev.price_num, item.price_num]
          );
        }
      }
    }

    if (crawledUrls.length > 0) {
      const countParams: unknown[] = [];
      let countCond = 'homes_url IS NOT NULL';
      if (crawledTypes?.length) {
        countCond += ` AND property_type = ANY($${countParams.push(crawledTypes)})`;
      }
      const { rows: [{ cnt }] } = await client.query<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt FROM ${tbl} WHERE ${countCond}`, countParams
      );
      const existingCount = parseInt(cnt, 10);

      if (existingCount > 10 && crawledUrls.length < existingCount * MIN_DELETE_RATIO) {
        console.warn(`[${area.name}] ⚠️  삭제 보류: ${crawledUrls.length}건 < 기존 ${existingCount}건의 ${Math.round(MIN_DELETE_RATIO * 100)}%`);
        deleteSkipped = true;
      } else {
        const delParams: unknown[] = [...crawledUrls];
        let delCond = `homes_url NOT IN (${crawledUrls.map((_, i) => `$${i + 1}`).join(',')})`;
        if (crawledTypes?.length) {
          delCond += ` AND property_type = ANY($${delParams.push(crawledTypes)})`;
        }
        const { rowCount } = await client.query(
          `DELETE FROM ${tbl} WHERE ${delCond} AND homes_url NOT IN (SELECT DISTINCT homes_url FROM watchlist)`,
          delParams
        );
        deleted = rowCount ?? 0;
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

export const runCrawler = async (areaNames: string | string[] | null = null, targetTypes: string[] | null = null): Promise<CrawlSummary[]> => {
  let areas = TARGET_AREAS;
  if (areaNames) {
    const nameArr = Array.isArray(areaNames) ? areaNames : [areaNames];
    areas = TARGET_AREAS.filter((a) => nameArr.includes(a.name));
  }

  const urlTypes = targetTypes
    ? URL_TYPES.filter((t) => targetTypes.includes(t.type))
    : URL_TYPES;

  const browser = await puppeteerExtra.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  }) as Browser;

  const summary: CrawlSummary[] = [];
  try {
    for (const area of areas) {
      let areaTotal = 0, areaSaved = 0, areaUpdated = 0, areaDeleted = 0;
      for (const urlType of urlTypes) {
        let items: PropertyItem[] = [];
        try {
          console.log(`\n[${area.name}/${urlType.label}] 크롤링 시작`);
          items = await crawlAreaType(browser, area, urlType);
          console.log(`[${area.name}/${urlType.label}] 합계 ${items.length}건`);
        } catch (err) {
          console.error(`[${area.name}/${urlType.type}] 크롤링 오류:`, (err as Error).message);
        }
        if (items.length > 0) {
          try {
            const result = await saveProperties(items, area, [urlType.type]);
            areaTotal  += items.length;
            areaSaved  += result.saved;
            areaUpdated += result.updated;
            areaDeleted += result.deleted;
            console.log(`[${area.name}/${urlType.type}] DB: +${result.saved} 신규, ~${result.updated} 업데이트, -${result.deleted} 삭제`);
          } catch (err) {
            console.error(`[${area.name}/${urlType.type}] DB 오류:`, (err as Error).message);
          }
        }
        await sleep(AREA_DELAY_MS);
      }
      summary.push({ area: area.name, total: areaTotal, saved: areaSaved, updated: areaUpdated, deleted: areaDeleted });
    }
  } finally {
    await browser.close();
  }

  return summary;
};

export { TARGET_AREAS as TARGET_LINES };
