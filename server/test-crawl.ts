import puppeteer from 'puppeteer';

const TEST_URL = 'https://www.homes.co.jp/mansion/chuko/tokyo/koto-city/list/';

async function main(): Promise<void> {
  console.log('브라우저 시작...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'ja-JP,ja;q=0.9' });

  console.log(`접속 중: ${TEST_URL}`);
  await page.goto(TEST_URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 3000));

  interface AnalysisResult {
    priceCount: number;
    walkCount: number;
    parentClasses: string[];
    sampleHtml: string;
    priceTexts: { text: string; tag: string; cls: string }[];
    walkTexts: { text: string; tag: string; cls: string }[];
  }

  const result = await page.evaluate((): AnalysisResult => {
    const allEls = Array.from(document.querySelectorAll('*'));
    const priceEls = allEls.filter(
      (el) => el.children.length === 0 && /万円/.test(el.textContent ?? '')
    );
    const walkEls = allEls.filter(
      (el) => el.children.length === 0 && /徒歩\d+分/.test(el.textContent ?? '')
    );

    const parentClasses = new Set<string>();
    priceEls.slice(0, 5).forEach((el) => {
      let cur: Element | null = el.parentElement;
      for (let i = 0; i < 6; i++) {
        if (!cur) break;
        String(cur.className).split(' ').forEach((c) => c && parentClasses.add(c));
        cur = cur.parentElement;
      }
    });

    const sampleHtml = priceEls[0]
      ? (() => {
          let cur: Element = priceEls[0];
          for (let i = 0; i < 4; i++) if (cur.parentElement) cur = cur.parentElement;
          return cur.outerHTML.slice(0, 2000);
        })()
      : '가격 요소 없음';

    return {
      priceCount:   priceEls.length,
      walkCount:    walkEls.length,
      parentClasses: [...parentClasses].sort(),
      sampleHtml,
      priceTexts: priceEls.slice(0, 5).map((el) => ({
        text: (el.textContent ?? '').trim(),
        tag:  el.tagName,
        cls:  typeof el.className === 'string' ? el.className : '',
      })),
      walkTexts: walkEls.slice(0, 3).map((el) => ({
        text: (el.textContent ?? '').trim(),
        tag:  el.tagName,
        cls:  typeof el.className === 'string' ? el.className : '',
      })),
    };
  });

  console.log('\n=== 가격 요소 ===');
  console.log('개수:', result.priceCount);
  console.table(result.priceTexts);

  console.log('\n=== 徒歩 요소 ===');
  console.log('개수:', result.walkCount);
  console.table(result.walkTexts);

  console.log('\n=== 부모 클래스명 ===');
  console.log(result.parentClasses.join('\n'));

  console.log('\n=== 샘플 HTML ===');
  console.log(result.sampleHtml);

  await browser.close();
  console.log('\n완료. 위 정보로 crawler.ts의 SEL 상수를 업데이트하세요.');
}

main().catch(console.error);
