import { connect } from 'puppeteer-real-browser';
import type { Browser, Page } from 'puppeteer';
import { pool } from './db';
import { LINES, getTableName } from './lines';
import type { Area, UrlType, CrawlGroup, RawBrowserItem, PropertyItem, SaveResult, CrawlSummary } from './types';

const BASE_URL = 'https://www.homes.co.jp';
const ITEMS_PER_PAGE = 30;
const MAX_PAGES = 15;
const PAGE_DELAY_MS = 4000;
const PAGE_DELAY_JITTER = 3000;
const AREA_DELAY_MS = 6000;
const DETAIL_DELAY_MS = 2500;
const DETAIL_DELAY_JITTER = 1500;
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
  { id: 'g01', name: '都心',     areas: ['千代田区', '中央区', '港区'] },
  { id: 'g02', name: '西中心部', areas: ['新宿区', '渋谷区', '文京区'] },
  { id: 'g03', name: '城南',     areas: ['品川区', '目黒区', '大田区'] },
  { id: 'g04', name: '城西',     areas: ['世田谷区', '中野区', '杉並区', '豊島区'] },
  { id: 'g05', name: '墨東',     areas: ['台東区', '墨田区', '江東区'] },
  { id: 'g06', name: '城北',     areas: ['北区', '荒川区', '板橋区', '練馬区'] },
  { id: 'g07', name: '城東',     areas: ['足立区', '葛飾区', '江戸川区'] },
  { id: 'g08', name: '周辺都市', areas: ['横浜市', '川崎市', 'さいたま市', '川口市', '千葉市', '船橋市', '市川市'] },
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

interface TransportEntry {
  lineName: string | null;
  station: string | null;
  walkMin: number | null;
}

// HOMES 交通テキストは改行なしで連結: "路線名 駅名駅 徒歩N分路線名 駅名駅 徒歩N分..."
const parseAllTransportLines = (text: string): TransportEntry[] => {
  return text
    .split('分')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((chunk) => {
      const walkMatch = chunk.match(/徒歩\s*(\d+)$/);
      const walkMin = walkMatch ? parseInt(walkMatch[1], 10) : null;
      const stationMatch = chunk.match(/([^\s/「」、。]+)駅/);
      const station = stationMatch ? stationMatch[1] : null;
      const stationPos = stationMatch ? chunk.indexOf(stationMatch[0]) : -1;
      const lineName = stationPos > 0 ? chunk.slice(0, stationPos).trim() || null : null;
      return { lineName, station, walkMin };
    })
    .filter((e) => e.lineName || e.station);
};

const parseTransport = (text: string | null): { lineName: string | null; station: string | null; walkMin: number | null } => {
  if (!text) return { lineName: null, station: null, walkMin: null };
  const entries = parseAllTransportLines(text);
  if (entries.length === 0) return { lineName: null, station: null, walkMin: null };
  const first = entries[0];
  return { lineName: first.lineName, station: first.station, walkMin: first.walkMin };
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

interface DetailInfo {
  address: string | null;
  transport: string | null;
  yearBuilt: string | null;
  floor: string | null;
  imageUrl: string | null;
}

const scrapeDetailPage = async (page: Page, url: string): Promise<DetailInfo> => {
  const empty: DetailInfo = { address: null, transport: null, yearBuilt: null, floor: null, imageUrl: null };
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    if (page.url().includes('/search/condition-list/')) return empty;

    return page.evaluate(() => {
      let address: string | null = null;
      let transport: string | null = null;
      let yearBuilt: string | null = null;
      let floor: string | null = null;

      document.querySelectorAll('table tr').forEach((row) => {
        const ths = row.querySelectorAll('th');
        ths.forEach((th) => {
          const text = th.textContent?.trim() ?? '';
          const td = th.nextElementSibling?.textContent?.trim() ?? null;
          if (!td) return;
          if (text.includes('所在地') && !address) address = td;
          if (text.includes('交通') && !transport) transport = td;
          if (text.includes('築年月') && !yearBuilt) yearBuilt = td;
          if ((text.includes('所在階') || text === '階数') && !floor) floor = td;
        });
      });

      // 상세 페이지 메인 이미지 스크랩
      let imageUrl: string | null = null;
      const imgSelectors = [
        'img.prg-lazy-display[data-original]',
        '.swiper-slide img[data-original]',
        '.ph-box img[data-original]',
        '.main-visual img[data-original]',
      ];
      for (const sel of imgSelectors) {
        const el = document.querySelector(sel) as HTMLImageElement | null;
        const src = el?.getAttribute('data-original') ?? null;
        if (src && !src.includes('transparent') && !src.includes('loading')) {
          imageUrl = src;
          break;
        }
      }

      return { address, transport, yearBuilt, floor, imageUrl };
    });
  } catch {
    return empty;
  }
};

const evaluateCards = (page: Page): Promise<ScrapedResult> =>
  page.evaluate((baseUrl: string) => {
    const cards = Array.from(document.querySelectorAll('table.unitSummary'));
    const rawItems = cards.map((card) => {
      const relUrl = card.querySelector('tr[data-href]')?.getAttribute('data-href') ?? null;
      const cardUrl = relUrl ? (relUrl.startsWith('http') ? relUrl : baseUrl + relUrl) : null;
      const price = card.querySelector('.priceLabel')?.textContent?.trim() ?? null;
      const img = card.querySelector('img.prg-lazy-display');
      const imageUrl = img?.getAttribute('data-original') ?? null;
      const rawName = img?.getAttribute('alt')?.trim() ?? null;
      const name = rawName ? rawName.replace(/\s+[^\s]+の間取り$/, '').trim() : null;
      const floorEl = card.querySelector('span.u-text-sm.u-font-bold.u-mr-1');
      const floor = floorEl?.textContent?.trim() ?? null;
      let layout: string | null = null;
      let buildingArea: string | null = null;
      let landArea: string | null = null;
      for (const row of Array.from(card.querySelectorAll('table.verticalTable tr'))) {
        const cells = Array.from(row.children);
        for (let i = 0; i < cells.length - 1; i++) {
          if (cells[i].tagName !== 'TH') continue;
          const th = cells[i].textContent?.trim() ?? '';
          const td = cells[i + 1]?.tagName === 'TD' ? cells[i + 1].textContent?.trim() ?? null : null;
          if (th.includes('間取り')) layout = td;
          else if (th.includes('専有面積') || th.includes('建物面積')) buildingArea = td;
          else if (th.includes('土地面積')) landArea = td;
        }
      }
      return { name, price, address: null, transport: null, layout, buildingArea, landArea, yearBuilt: null, floor, url: cardUrl, imageUrl };
    });
    const totalStr = document.querySelector('.totalNum')?.textContent?.trim() ?? '0';
    return { rawItems, totalStr };
  }, BASE_URL) as Promise<ScrapedResult>;

const isBlocked = async (page: Page): Promise<boolean> => {
  const title = await page.evaluate(() => document.title);
  return title.includes('Verification') || title.includes('403') || title.includes('Error');
};

const scrapePage = async (page: Page, url: string, retryOnBlock = true): Promise<ScrapedResult> => {
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

  let hasCards = false;
  try {
    await page.waitForSelector(CARD_SEL, { timeout: 15000 });
    hasCards = true;
  } catch {
    // 카드 없음 → blocked 여부 확인
  }

  if (!hasCards) {
    if (retryOnBlock && await isBlocked(page)) {
      console.warn(`  [bot detection] ${url} — 30s 후 재시도`);
      await sleep(30000);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
      try {
        await page.waitForSelector(CARD_SEL, { timeout: 15000 });
        hasCards = true;
      } catch {
        console.warn(`  [bot detection] 재시도 실패, 스킵`);
        return { rawItems: [], totalStr: '0' };
      }
    } else {
      return { rawItems: [], totalStr: '0' };
    }
  }

  return evaluateCards(page);
};

const crawlAreaType = async (page: Page, area: Area, urlType: UrlType): Promise<PropertyItem[]> => {
  const buildUrl = (p: number): string => {
    const base = `${BASE_URL}/${urlType.path}/${area.prefecture}/${area.slug}/list/`;
    return p > 1 ? `${base}?page=${p}` : base;
  };

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

    for (let p = 2; p <= totalPages; p++) {
      await sleep(PAGE_DELAY_MS + Math.random() * PAGE_DELAY_JITTER);
      try {
        // 자연스러운 링크 클릭으로 페이지 이동 (goto보다 WAF 회피 유리)
        const nextUrl = buildUrl(p);
        const linkHandle = await page.$(`a[href*="?page=${p}"], a[href*="page=${p}"]`);
        if (linkHandle) {
          await linkHandle.evaluate((el) => el.scrollIntoView());
          await sleep(500);
          await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }),
            linkHandle.click(),
          ]);
        } else {
          // 링크 없으면 soft navigation
          await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }),
            page.evaluate((u: string) => { window.location.href = u; }, nextUrl),
          ]);
        }

        // Cloudflare Turnstile 리다이렉트 즉시 감지
        const currentUrl = page.url();
        if (currentUrl.includes('/search/condition-list/') || await isBlocked(page)) {
          console.log(`  [${area.name}/${urlType.type}] ${p}p CF챌린지 감지, 중단`);
          break;
        }

        let hasCards = false;
        try {
          await page.waitForSelector(CARD_SEL, { timeout: 12000 });
          hasCards = true;
        } catch { /* no cards */ }

        if (!hasCards) {
          console.log(`  [${area.name}/${urlType.type}] ${p}/${totalPages}p → 0건`);
          break;
        }

        const result = await evaluateCards(page);

        const items = buildItems(result.rawItems, urlType, area.name);
        allItems.push(...items);
        console.log(`  [${area.name}/${urlType.type}] ${p}/${totalPages}p → ${items.length}건`);
        if (items.length === 0) break;
      } catch (err) {
        console.warn(`  [${area.name}/${urlType.type}] ${p}p 스킵:`, (err as Error).message);
        break;
      }
    }
  } catch (err) {
    console.error(`[${area.name}/${urlType.type}] 크롤링 오류:`, (err as Error).message);
  }

  // 신규 아이템만 상세 페이지 방문 (기존 DB에 address 있으면 스킵)
  if (allItems.length > 0) {
    const tbl = getTableName(area.slug);
    const allUrls = allItems.map((i) => i.homes_url).filter((u): u is string => u !== null);
    const { rows: existingRows } = await pool.query<{ homes_url: string }>(
      `SELECT homes_url FROM ${tbl} WHERE homes_url = ANY($1) AND address IS NOT NULL AND walk_min IS NOT NULL AND transport IS NOT NULL`,
      [allUrls]
    ).catch(() => ({ rows: [] as { homes_url: string }[] }));
    const existingSet = new Set(existingRows.map((r) => r.homes_url));

    const newItems = allItems.filter((i) => i.homes_url && !existingSet.has(i.homes_url));
    console.log(`  [${area.name}/${urlType.type}] 상세 페이지: ${newItems.length}건 신규 / ${allItems.length - newItems.length}건 기존 스킵`);

    for (let i = 0; i < newItems.length; i++) {
      const item = newItems[i];
      if (!item.homes_url) continue;
      await sleep(DETAIL_DELAY_MS + Math.random() * DETAIL_DELAY_JITTER);
      const detail = await scrapeDetailPage(page, item.homes_url);
      if (detail.address)   item.address = detail.address;
      if (detail.transport) {
        item.transport = detail.transport;
        const { lineName, station, walkMin } = parseTransport(detail.transport);
        item.line_name = lineName;
        item.station   = station;
        item.walk_min  = walkMin;
      }
      if (detail.imageUrl && !item.image_url) item.image_url = detail.imageUrl;
      if (detail.yearBuilt) item.year_built = parseYear(detail.yearBuilt);
      if ((i + 1) % 10 === 0) console.log(`    상세 ${i + 1}/${newItems.length}건 완료`);
    }
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

      await client.query('SAVEPOINT item_save');
      try {
        const result = await client.query<{ inserted: boolean }>(
          `INSERT INTO ${tbl}
            (name, price, price_num, price_initial, walk_min, address, transport,
             land_area, land_area_num, building_area, building_area_num,
             layout, year_built, line_name, area, station, property_type, homes_url, image_url)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
           ON CONFLICT (homes_url) DO UPDATE SET
             price=$2, price_num=$3,
             address    = COALESCE($6,  EXCLUDED.address),
             transport  = COALESCE($7,  EXCLUDED.transport),
             land_area=$8, land_area_num=$9, building_area=$10, building_area_num=$11,
             layout=$12,
             year_built = COALESCE($13, EXCLUDED.year_built),
             line_name  = COALESCE($14, EXCLUDED.line_name),
             station    = COALESCE($16, EXCLUDED.station),
             walk_min   = COALESCE($5,  EXCLUDED.walk_min),
             property_type=$17, image_url=$19, updated_at=NOW()
           RETURNING (xmax = 0) AS inserted`,
          [item.name, item.price, item.price_num, priceInitial, item.walk_min,
           item.address, item.transport, item.land_area, item.land_area_num,
           item.building_area, item.building_area_num, item.layout, item.year_built,
           item.line_name, item.area, item.station, item.property_type,
           item.homes_url, item.image_url]
        );

        await client.query('RELEASE SAVEPOINT item_save');

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
      } catch (err) {
        await client.query('ROLLBACK TO SAVEPOINT item_save');
        await client.query('RELEASE SAVEPOINT item_save');
        console.error(`  [저장 오류] ${item.homes_url}:`, (err as Error).message);
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

  const { browser, page: initialPage } = await connect({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  }) as unknown as { browser: Browser; page: Page };

  const summary: CrawlSummary[] = [];
  try {
    for (const area of areas) {
      let areaTotal = 0, areaSaved = 0, areaUpdated = 0, areaDeleted = 0;
      for (const urlType of urlTypes) {
        let items: PropertyItem[] = [];
        try {
          console.log(`\n[${area.name}/${urlType.label}] 크롤링 시작`);
          items = await crawlAreaType(initialPage, area, urlType);
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
