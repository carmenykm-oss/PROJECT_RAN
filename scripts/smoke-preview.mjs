import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const base = process.env.PREVIEW_URL || 'https://carmenykm-oss.github.io/PROJECT_RAN/';
const url = new URL('?preview=1&character=male', base).href;
await mkdir('preview-screenshots', { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist']
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error') pageErrors.push(message.text());
});

try {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  if (!response || !response.ok()) {
    throw new Error(`Preview page HTTP status: ${response?.status() ?? 'no response'}`);
  }

  await page.waitForFunction(() => {
    const status = document.querySelector('#connection')?.textContent || '';
    return status.includes('男戰士已載入') || status.includes('男戰士模型載入失敗');
  }, { timeout: 60000 });

  const status = (await page.locator('#connection').innerText()).trim();
  if (!status.includes('男戰士已載入')) {
    throw new Error('Warrior GLB did not load: ' + status);
  }

  await page.waitForFunction(() => {
    const canvas = document.querySelector('#game canvas');
    return !!canvas && canvas.width > 0 && canvas.height > 0;
  }, { timeout: 15000 });

  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'preview-screenshots/ran-warrior-preview.png' });
  if (pageErrors.length) {
    throw new Error('Browser console/page errors: ' + pageErrors.join(' | '));
  }
  console.log(JSON.stringify({
    status: 'PASS',
    url,
    modelStatus: status,
    canvas: await page.locator('#game canvas').count(),
    screenshot: 'preview-screenshots/ran-warrior-preview.png'
  }, null, 2));
} finally {
  await browser.close();
}
