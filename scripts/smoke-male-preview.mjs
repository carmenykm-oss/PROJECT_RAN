import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const base = process.env.PREVIEW_URL || 'https://carmenykm-oss.github.io/PROJECT_RAN/';
const url = new URL('?preview=1&character=male&v=5511', base).href;
await mkdir('preview-screenshots', { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist']
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error') errors.push(message.text());
});

try {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  if (!response || !response.ok()) throw new Error(`Preview page HTTP status: ${response?.status() ?? 'no response'}`);

  await page.waitForFunction(() => {
    const status = document.querySelector('#connection')?.textContent || '';
    return window.__ranCharacterDebug?.character === 'male' || status.includes('男戰士模型載入失敗');
  }, { timeout: 60000 });

  const status = (await page.locator('#connection').innerText()).trim();
  const debug = await page.evaluate(() => window.__ranCharacterDebug || null);
  await page.waitForTimeout(1800);
  await page.screenshot({ path: 'preview-screenshots/male-game-preview.png' });
  if (!status.includes('男戰士已載入') || !debug) throw new Error('Male GLB failed to load: ' + status);
  if (debug.meshCount < 6 || debug.skinnedMeshCount < 6 || debug.boneCount < 16) {
    throw new Error('Male head/body rig incomplete: ' + JSON.stringify(debug));
  }
  if (errors.length) throw new Error('Browser errors: ' + errors.join(' | '));
  console.log(JSON.stringify({ status: 'PASS', url, modelStatus: status, debug, screenshot: 'preview-screenshots/male-game-preview.png' }, null, 2));
} finally {
  await browser.close();
}
