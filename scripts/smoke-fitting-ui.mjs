import { chromium } from 'playwright';

const base = process.env.PREVIEW_URL || 'https://carmenykm-oss.github.io/PROJECT_RAN/';
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist']
});

async function openPreview(character) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(90000);
  const params = new URLSearchParams({ preview: '1', character, skinning: '1', v: 'confirmed-base-fitting-ui' });
  if (character === 'female') {
    params.set('underwear', '1');
    params.set('headCandidate', '1');
    params.set('hairCandidate', '1');
    params.set('femaleHair', 'w_hair00');
  }
  await page.goto(new URL('?' + params.toString(), base).href, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() =>
    window.__ranCharacterDebug?.character ||
    (document.querySelector('#connection')?.textContent || '').includes('載入失敗'),
    { timeout: 90000 }
  );
  await page.waitForSelector('#characterFitting:not([hidden])');
  return page;
}

async function verifyFaceAndHair(character) {
  const page = await openPreview(character);
  try {
    const debugKey = character === 'female' ? 'female' : 'male';
    const faceCount = debug => debug[debugKey + 'FaceSkinnedMeshCount'];
    const hairCount = debug => debug[debugKey + 'HairSkinnedMeshCount'];
    let debug = await page.evaluate(() => window.__ranCharacterDebug);
    if (faceCount(debug) !== 1 || hairCount(debug) !== 1) {
      throw new Error(character + ' confirmed base face/hair not loaded: ' + JSON.stringify(debug));
    }

    await page.locator('#fittingFaceSelect').selectOption('off');
    await page.waitForFunction(key => window.__ranCharacterDebug?.[key + 'FaceSkinnedMeshCount'] === 0, debugKey);
    await page.locator('#fittingFaceSelect').selectOption('on');
    await page.waitForFunction(key => window.__ranCharacterDebug?.[key + 'FaceSkinnedMeshCount'] === 1, debugKey);

    await page.locator('#fittingHairSelect').selectOption('none');
    await page.waitForFunction(key => window.__ranCharacterDebug?.[key + 'HairSkinnedMeshCount'] === 0, debugKey);
    await page.locator('#fittingHairSelect').selectOption(character === 'female' ? 'w_hair00' : 'base');
    await page.waitForFunction(key => window.__ranCharacterDebug?.[key + 'HairSkinnedMeshCount'] === 1, debugKey);

    debug = await page.evaluate(() => window.__ranCharacterDebug);
    console.log(JSON.stringify({
      status: 'PASS', character, tested: 'confirmed face and base hair independently removable/restorable',
      faceMeshes: faceCount(debug), hairMeshes: hairCount(debug)
    }, null, 2));
  } finally {
    await page.close();
  }
}

try {
  await verifyFaceAndHair('female');
  await verifyFaceAndHair('male');
} finally {
  await browser.close();
}
