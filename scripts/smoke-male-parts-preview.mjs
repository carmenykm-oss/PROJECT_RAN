import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const base = process.env.PREVIEW_URL || 'https://carmenykm-oss.github.io/PROJECT_RAN/';
await mkdir('preview-screenshots', { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist']
});

async function verifyVariant(variant, expectedEquipment, screenshotName) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(90000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const params = new URLSearchParams({
    preview: '1',
    character: 'male',
    skinning: '1',
    v: 'male-independent-parts-' + variant
  });
  if (expectedEquipment > 1) {
    params.set('maleUpper', variant);
    params.set('maleGloves', variant);
    params.set('maleLower', variant);
    params.set('maleShoes', variant);
  } else {
    params.set('maleUpper', variant);
  }
  const url = new URL('?' + params.toString(), base).href;
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    if (!response || !response.ok()) throw new Error('Preview HTTP status: ' + (response?.status() ?? 'no response'));
    await page.waitForFunction(() => {
      const status = document.querySelector('#connection')?.textContent || '';
      return window.__ranCharacterDebug?.character === 'male' || status.includes('男戰士模型載入失敗');
    }, { timeout: 90000 }).catch(async error => {
      const status = await page.locator('#connection').innerText().catch(() => 'status unavailable');
      throw new Error('Timed out waiting for male model: ' + status + ' | ' + errors.join(' | ') + ' | ' + error.message);
    });
    await page.waitForTimeout(1500);
    const status = (await page.locator('#connection').innerText()).trim();
    const debug = await page.evaluate(() => window.__ranCharacterDebug || null);
    await page.screenshot({ path: 'preview-screenshots/' + screenshotName });
    if (!status.includes('男戰士已載入') || !debug) throw new Error('Male character failed: ' + status + ' | ' + errors.join(' | '));
    if (debug.maleFaceSkinnedMeshCount !== 1 || debug.maleHairSkinnedMeshCount !== 1) {
      throw new Error('Male face/hair were not independently attached: ' + JSON.stringify(debug));
    }
    if (debug.maleEquipmentMeshCount !== expectedEquipment ||
        debug.maleEquipmentReboundCount !== expectedEquipment ||
        Object.keys(debug.maleEquipmentSlotMeshes || {}).length !== (expectedEquipment === 1 ? 1 : 4) ||
        Object.values(debug.maleEquipmentSlotMeshes || {}).some(count => count < 1) ||
        debug.maleEquipmentBoneBindingMismatchCount !== 0) {
      throw new Error('Male equipment slot binding failed: ' + JSON.stringify(debug));
    }
    if (debug.reboundSkinCount < 6 + expectedEquipment || debug.evaluatedSkinnedSize?.[1] < 0.2) {
      throw new Error('Male assembled skinning/bounds incomplete: ' + JSON.stringify(debug));
    }
    if (errors.length) throw new Error('Browser errors: ' + errors.join(' | '));
    console.log(JSON.stringify({ status: 'PASS', variant, url, modelStatus: status, debug, screenshot: screenshotName }, null, 2));
  } finally {
    await page.close();
  }
}

async function verifyMixedOutfit() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(90000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const params = new URLSearchParams({
    preview: '1', character: 'male', skinning: '1',
    maleUpper: 'f', maleGloves: 'f', maleLower: 'a', maleShoes: 'a',
    v: 'male-mixed-outfit-f-upper-a-lower'
  });
  try {
    const response = await page.goto(new URL('?' + params.toString(), base).href, { waitUntil: 'domcontentloaded', timeout: 90000 });
    if (!response || !response.ok()) throw new Error('Mixed male outfit HTTP status: ' + (response?.status() ?? 'no response'));
    await page.waitForFunction(() => window.__ranCharacterDebug?.character === 'male', { timeout: 90000 });
    await page.waitForTimeout(1200);
    const status = (await page.locator('#connection').innerText()).trim();
    const debug = await page.evaluate(() => window.__ranCharacterDebug || null);
    const screenshot = 'male-mixed-outfit-f-upper-a-lower.png';
    await page.screenshot({ path: 'preview-screenshots/' + screenshot });
    if (!status.includes('男戰士已載入') || !debug ||
        debug.maleEquipmentMeshCount !== 5 ||
        debug.maleEquipmentReboundCount !== 5 ||
        Object.keys(debug.maleEquipmentSlotMeshes || {}).length !== 4 ||
        debug.maleEquipmentBoneBindingMismatchCount !== 0 ||
        errors.length) {
      throw new Error('Mixed male outfit validation failed: ' + JSON.stringify({ status, debug, errors }));
    }
    console.log(JSON.stringify({ status: 'PASS', outfit: 'upper=f, gloves=f, lower=a, shoes=a', debug, screenshot }, null, 2));
  } finally { await page.close(); }
}

try {
  await verifyVariant('a', 4, 'male-independent-parts-outfit-a.png');
  await verifyVariant('f', 5, 'male-independent-parts-outfit-f.png');
  await verifyVariant('a', 1, 'male-independent-single-upper.png');
  await verifyMixedOutfit();
} finally {
  await browser.close();
}
