import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const base = process.env.PREVIEW_URL || 'https://carmenykm-oss.github.io/PROJECT_RAN/';
const url = new URL('?preview=1&character=female&underwear=1&skinning=1&headCandidate=1&hairCandidate=1&v=headhair01', base).href;
await mkdir('preview-screenshots', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
try {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  if (!response || !response.ok()) throw new Error(`Preview page HTTP status: ${response?.status() ?? 'no response'}`);
  await page.waitForFunction(() => {
    const status = document.querySelector('#connection')?.textContent || '';
    return window.__ranCharacterDebug?.character === 'female' || status.includes('女角色模型載入失敗');
  }, { timeout: 60000 });
  await page.waitForTimeout(700);
  const status = (await page.locator('#connection').innerText()).trim();
  const debug = await page.evaluate(() => window.__ranCharacterDebug || null);
  await page.screenshot({ path: 'preview-screenshots/female-head-hair-candidate.png' });
  if (!status.includes('女角色已載入') || !debug)
    throw new Error('Female candidate preview failed: ' + status + '; browser errors: ' + errors.join(' | '));
  if (debug.femaleHeadCandidate !== true || debug.femaleHairCandidate !== true ||
      debug.femaleFaceSkinnedMeshCount < 1 || debug.femaleHairSkinnedMeshCount < 1 ||
      debug.reboundSkinCount < 3 || debug.boneCount < 1 ||
      !Array.isArray(debug.evaluatedSkinnedSize) || debug.evaluatedSkinnedSize[1] < 0.2)
    throw new Error('Female head/hair candidate skinning incomplete: ' + JSON.stringify(debug));
  if (errors.length) throw new Error('Browser errors: ' + errors.join(' | '));
  console.log(JSON.stringify({ status: 'PASS', url, modelStatus: status, debug }, null, 2));
} finally {
  await browser.close();
}
