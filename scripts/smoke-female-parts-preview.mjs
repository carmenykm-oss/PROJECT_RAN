import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const base = process.env.PREVIEW_URL || 'https://carmenykm-oss.github.io/PROJECT_RAN/';
await mkdir('preview-screenshots', { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist']
});

async function verifyVariant(variant, expectedMeshes, screenshotName, singleSlot = false, hairVariant = 'w_hair00') {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const params = new URLSearchParams({
    preview: '1', character: 'female', underwear: '1',
    headCandidate: '1', hairCandidate: '1', skinning: '1',
    v: 'female-independent-parts-' + variant + (singleSlot ? '-single' : ''),
    femaleHair: hairVariant
  });
  params.set('femaleUpper', variant);
  if (!singleSlot) {
    params.set('femaleGloves', variant);
    params.set('femaleLower', variant);
    params.set('femaleShoes', variant);
  }
  const url = new URL('?' + params.toString(), base).href;
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    if (!response || !response.ok()) throw new Error('Preview HTTP status: ' + (response?.status() ?? 'no response'));
    await page.waitForFunction(() => {
      const status = document.querySelector('#connection')?.textContent || '';
      return window.__ranCharacterDebug?.character === 'female' || status.includes('女角色模型載入失敗');
    }, { timeout: 60000 });
    await page.waitForTimeout(1200);
    const status = (await page.locator('#connection').innerText()).trim();
    const debug = await page.evaluate(() => window.__ranCharacterDebug || null);
    await page.screenshot({ path: 'preview-screenshots/' + screenshotName });
    if (!status.includes('女角色已載入') || !debug) {
      throw new Error('Female character failed: ' + status + ' | ' + errors.join(' | '));
    }
    const expectedSlots = singleSlot ? 1 : 4;
    if (debug.femaleFaceSkinnedMeshCount < 1 || debug.femaleHairSkinnedMeshCount < 1 ||
        debug.femaleEquipmentMeshCount !== expectedMeshes ||
        debug.femaleEquipmentReboundCount !== expectedMeshes ||
        Object.keys(debug.femaleEquipmentSlotMeshes || {}).length !== expectedSlots ||
        Object.values(debug.femaleEquipmentSlotMeshes || {}).some(count => count < 1) ||
        debug.femaleEquipmentHelperBoneCount < 1 ||
        debug.femaleEquipmentBoneBindingMismatchCount !== 0 ||
        debug.reboundSkinCount < 6 + expectedMeshes) {
      throw new Error('Female independent equipment validation failed: ' + JSON.stringify(debug));
    }
    if (errors.length) throw new Error('Browser errors: ' + errors.join(' | '));
    console.log(JSON.stringify({ status: 'PASS', variant, url, modelStatus: status, debug, screenshot: screenshotName }, null, 2));
  } finally {
    await page.close();
  }
}

try {
  await verifyVariant('a', 6, 'female-independent-parts-outfit-a.png');
  await verifyVariant('s', 9, 'female-independent-parts-outfit-s.png', false, 'w_hair02');
  await verifyVariant('a', 2, 'female-independent-single-upper.png', true, 'w_hair04');
} finally {
  await browser.close();
}
