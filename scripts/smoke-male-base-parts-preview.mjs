import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const base = process.env.PREVIEW_URL || 'https://carmenykm-oss.github.io/PROJECT_RAN/';
await mkdir('preview-screenshots', { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist']
});

async function openPreview(extra, screenshot) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(90000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const params = new URLSearchParams({
    preview: '1', character: 'male', skinning: '1',
    v: 'male-female-equivalent-base-parts-v2',
    ...extra
  });
  const url = new URL('?' + params.toString(), base).href;
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    if (!response || !response.ok()) throw new Error('Male base preview HTTP status: ' + (response?.status() ?? 'no response'));
    await page.waitForFunction(() => {
      const status = document.querySelector('#connection')?.textContent || '';
      return window.__ranCharacterDebug?.character === 'male' || status.includes('男戰士模型載入失敗');
    }, { timeout: 90000 });
    await page.waitForTimeout(800);
    const status = (await page.locator('#connection').innerText()).trim();
    const debug = await page.evaluate(() => window.__ranCharacterDebug || null);
    if (screenshot) await page.screenshot({ path: 'preview-screenshots/' + screenshot });
    if (!status.includes('男戰士已載入') || !debug) {
      throw new Error('Male base model failed: ' + status + ' | ' + errors.join(' | '));
    }
    if (errors.length) throw new Error('Browser errors: ' + errors.join(' | '));
    return { page, url, status, debug, errors };
  } catch (error) {
    await page.close();
    throw error;
  }
}

try {
  // The active male assembly mirrors the confirmed female structure:
  // 4 body meshes + 1 independent face + 1 independent hairstyle.
  const full = await openPreview({}, 'male-female-equivalent-base-parts.png');
  const d = full.debug;
  if (d.meshCount !== 6 || d.skinnedMeshCount !== 6 || d.reboundSkinCount !== 6 ||
      d.maleFaceSkinnedMeshCount !== 1 || d.maleHairSkinnedMeshCount !== 1 ||
      d.maleFaceReboundCount !== 1 || d.maleHairReboundCount !== 1 ||
      d.maleFaceBoneBindingMismatchCount !== 0 || d.maleHairBoneBindingMismatchCount !== 0 ||
      d.maleBaseRigBoneCount < 40 ||
      !Array.isArray(d.evaluatedSkinnedSize) || d.evaluatedSkinnedSize[1] < 0.2) {
    throw new Error('Male body/face/hair assembly differs from the female-equivalent structure: ' + JSON.stringify(d));
  }
  console.log(JSON.stringify({ status: 'PASS', assembly: '4 body + 1 face + 1 hair', url: full.url, debug: d }, null, 2));
  await full.page.close();

  const noFace = await openPreview({ maleFace: '0' });
  if (noFace.debug.meshCount !== 5 || noFace.debug.maleFaceSkinnedMeshCount !== 0 ||
      noFace.debug.maleHairSkinnedMeshCount !== 1 || noFace.debug.maleHairReboundCount !== 1) {
    throw new Error('Male face cannot be independently removed: ' + JSON.stringify(noFace.debug));
  }
  console.log(JSON.stringify({ status: 'PASS', independentSlot: 'face-off', debug: noFace.debug }, null, 2));
  await noFace.page.close();

  const noHair = await openPreview({ maleHair: '0' });
  if (noHair.debug.meshCount !== 5 || noHair.debug.maleFaceSkinnedMeshCount !== 1 ||
      noHair.debug.maleFaceReboundCount !== 1 || noHair.debug.maleHairSkinnedMeshCount !== 0) {
    throw new Error('Male hair cannot be independently removed: ' + JSON.stringify(noHair.debug));
  }
  console.log(JSON.stringify({ status: 'PASS', independentSlot: 'hair-off', debug: noHair.debug }, null, 2));
  await noHair.page.close();
} finally {
  await browser.close();
}
