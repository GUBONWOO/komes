// HOMES 페이지 구조 분석용 스크립트
// 실행: node test-crawl.js
// → crawler.js의 SEL 상수를 실제 클래스명으로 업데이트하는 데 사용

const puppeteer = require('puppeteer');

const TEST_URL = 'https://www.homes.co.jp/mansion/chuko/tokyo/koto-city/list/';

async function main() {
  console.log('브라우저 시작...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'ja-JP,ja;q=0.9' });

  console.log(`접속 중: ${TEST_URL}`);
  await page.goto(TEST_URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 3000));

  const result = await page.evaluate(() => {
    // 가격 텍스트가 있는 요소 찾기
    const allEls = Array.from(document.querySelectorAll('*'));
    const priceEls = allEls.filter(
      (el) => el.children.length === 0 && /万円/.test(el.textContent)
    );

    // 가격 요소의 부모들 클래스 수집
    const parentClasses = new Set();
    priceEls.slice(0, 5).forEach((el) => {
      let cur = el.parentElement;
      for (let i = 0; i < 6; i++) {
        if (!cur) break;
        if (cur.className) {
          String(cur.className).split(' ').forEach((c) => c && parentClasses.add(c));
        }
        cur = cur.parentElement;
      }
    });

    // 徒歩 텍스트 요소 찾기
    const walkEls = allEls.filter(
      (el) => el.children.length === 0 && /徒歩\d+分/.test(el.textContent)
    );

    // 첫 번째 가격 요소 주변 HTML
    const sampleHtml = priceEls[0]
      ? (() => {
          let cur = priceEls[0];
          for (let i = 0; i < 4; i++) if (cur.parentElement) cur = cur.parentElement;
          return cur.outerHTML.slice(0, 2000);
        })()
      : '가격 요소 없음';

    return {
      priceCount: priceEls.length,
      walkCount: walkEls.length,
      parentClasses: [...parentClasses].sort(),
      sampleHtml,
      priceTexts: priceEls.slice(0, 5).map((el) => ({
        text: el.textContent.trim(),
        tag: el.tagName,
        cls: el.className,
      })),
      walkTexts: walkEls.slice(0, 3).map((el) => ({
        text: el.textContent.trim(),
        tag: el.tagName,
        cls: el.className,
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
  console.log('\n완료. 위 정보로 crawler.js의 SEL 상수를 업데이트하세요.');
}

main().catch(console.error);
