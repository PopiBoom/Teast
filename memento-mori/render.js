// Детерминированный рендер кадров через headless Chromium (Playwright).
// Каждый кадр: window.__renderAt(i/FPS) -> screenshot canvas -> PNG.
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'frames');
const PROOF = path.join(ROOT, 'proof');

async function main() {
  const proof = process.argv.includes('--proof');
  const outDir = proof ? PROOF : OUT;
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--no-sandbox', '--headless=new', '--force-color-profile=srgb', '--disable-lcd-text', '--font-render-hinting=none'],
  });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto('file://' + path.join(ROOT, 'index.html'));
  await page.waitForFunction('window.__ready === true', { timeout: 30000 });
  const FPS = await page.evaluate('window.__FPS');
  const TOTAL = await page.evaluate('window.__TOTAL');
  const canvas = await page.$('#stage');

  if (proof) {
    const times = [0.8, 2.0, 3.0, 4.2, 6.2, 8.4, 9.7, 11.0, 11.9, 13.3, 14.7, 15.6, 17.0, 18.4, 20.6, 21.6];
    for (const t of times) {
      await page.evaluate((tt) => window.__renderAt(tt), t);
      const name = 'proof_' + String(Math.round(t * 100)).padStart(5, '0') + '.png';
      await canvas.screenshot({ path: path.join(outDir, name) });
      console.log('proof', t.toFixed(2));
    }
  } else {
    const total = Math.round(TOTAL * FPS);
    const t0 = Date.now();
    for (let i = 0; i < total; i++) {
      await page.evaluate((f) => window.__renderAt(f / window.__FPS), i);
      await canvas.screenshot({ path: path.join(outDir, 'f' + String(i).padStart(5, '0') + '.png') });
      if (i % 60 === 0) {
        const el = (Date.now() - t0) / 1000;
        console.log(`frame ${i}/${total}  ${(100*i/total).toFixed(1)}%  ${el.toFixed(0)}s  (${(i/Math.max(el,0.1)).toFixed(1)} fps)`);
      }
    }
    console.log('done', total, 'frames in', ((Date.now()-t0)/1000).toFixed(0),'s');
  }
  await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
