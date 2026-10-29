// Детерминированный рендер кадров через headless Chromium (Playwright).
// Кадр i = window.__renderAt(i/FPS) -> PNG. Кадры делятся между воркерами
// (отдельные процессы браузера), порядок и полнота проверяются в конце.
//   node render.js            — все кадры в frames/
//   node render.js --proof    — ключевые кадры в proof/
//   node render.js --workers 4
//   node render.js --range 4.0 6.0   — перерендер интервала (сек) поверх frames/
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PROOF_TIMES = [0.5, 1.0, 1.9, 2.8, 3.9, 5.7, 6.4, 7.6, 8.8, 9.25, 10.4, 11.2, 12.4, 13.6,
  14.8, 16.3, 17.0, 17.9, 18.8, 19.5, 20.3, 21.7, 22.3, 24.5, 26.3, 27.9, 29.2, 31.5];

async function openPage() {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--no-sandbox', '--headless=new', '--force-color-profile=srgb', '--font-render-hinting=none'],
  });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto('file://' + path.join(ROOT, 'index.html'));
  await page.waitForFunction('window.__ready === true', { timeout: 30000 });
  return { browser, page, canvas: await page.$('#stage') };
}

async function main() {
  const proof = process.argv.includes('--proof');
  const wi = process.argv.indexOf('--workers');
  const workers = wi > 0 ? +process.argv[wi + 1] : 4;
  const ri = process.argv.indexOf('--range');
  const range = ri > 0 ? [+process.argv[ri + 1], +process.argv[ri + 2]] : null;
  const outDir = path.join(ROOT, proof ? 'proof' : 'frames');
  if (!range) fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  if (proof) {
    const { browser, page, canvas } = await openPage();
    for (const t of PROOF_TIMES) {
      await page.evaluate((tt) => window.__renderAt(tt), t);
      await canvas.screenshot({ path: path.join(outDir, 'p_' + String(Math.round(t * 100)).padStart(5, '0') + '.png') });
    }
    await browser.close();
    console.log('proof frames:', PROOF_TIMES.length);
    return;
  }

  const probe = await openPage();
  const FPS = await probe.page.evaluate('window.__FPS');
  const TOTAL = await probe.page.evaluate('window.__TOTAL');
  await probe.browser.close();
  const total = Math.round(TOTAL * FPS);
  const todo = [];
  for (let i = 0; i < total; i++) if (!range || (i / FPS >= range[0] && i / FPS <= range[1])) todo.push(i);
  const t0 = Date.now();
  let done = 0;

  await Promise.all(Array.from({ length: workers }, async (_, w) => {
    const { browser, page, canvas } = await openPage();
    for (let j = w; j < todo.length; j += workers) {
      const i = todo[j];
      await page.evaluate((f) => window.__renderAt(f / window.__FPS), i);
      await canvas.screenshot({ path: path.join(outDir, 'f' + String(i).padStart(5, '0') + '.png') });
      if (++done % 120 === 0) {
        const el = (Date.now() - t0) / 1000;
        console.log(`${done}/${total}  ${el.toFixed(0)}s  ${(done / el).toFixed(1)} fps`);
      }
    }
    await browser.close();
  }));

  const files = fs.readdirSync(outDir).filter((f) => f.endsWith('.png'));
  const missing = [];
  for (let i = 0; i < total; i++) if (!fs.existsSync(path.join(outDir, 'f' + String(i).padStart(5, '0') + '.png'))) missing.push(i);
  console.log(`done ${files.length}/${total} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s; missing: ${missing.length}`);
  if (missing.length) process.exit(2);
}
main().catch((e) => { console.error(e); process.exit(1); });
