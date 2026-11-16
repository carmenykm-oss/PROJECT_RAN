import { chromium } from 'playwright';

const base = process.env.PREVIEW_URL || 'https://carmenykm-oss.github.io/PROJECT_RAN/';
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist']
});
async function openPreview(character) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const params = new URLSearchParams({ preview:'1', character, skinning:'1', v:'fitting-ui-check' });
  if (character === 'female') params.set('underwear','1'), params.set('headCandidate','1'), params.set('hairCandidate','1');
  await page.goto(new URL('?' + params.toString(), base).href, { waitUntil:'domcontentloaded', timeout:90000 });
  await page.waitForFunction(() => window.__ranCharacterDebug?.character);
  await page.waitForSelector('#characterFitting:not([hidden])');
  return page;
}
try {
  const female = await openPreview('female');
  const femaleOptions = await female.locator('#fittingHairSelect option').count();
  if (femaleOptions !== 9) throw new Error('Female fitting panel must expose 9 hairstyles, found ' + femaleOptions);
  await female.locator('#fittingHairSelect').selectOption('w_hair02');
  await female.waitForFunction(() => window.__ranCharacterDebug?.femaleHairVariant === 'w_hair02');
  await female.locator('#fittingUpper').selectOption('a');
  await female.waitForFunction(() => (window.__ranCharacterDebug?.femaleEquipmentMeshCount || 0) > 0);
  const femaleDebug = await female.evaluate(() => window.__ranCharacterDebug);
  console.log(JSON.stringify({status:'PASS',character:'female',hairOptions:femaleOptions,hair:femaleDebug.femaleHairVariant,equipmentSlots:Object.keys(femaleDebug.femaleEquipmentSlotMeshes||{}),debug:femaleDebug},null,2));
  await female.close();

  const male = await openPreview('male');
  for (const slot of ['Upper','Gloves','Lower','Shoes']) await male.locator('#fitting'+slot).selectOption('a');
  await male.waitForFunction(() => Object.keys(window.__ranCharacterDebug?.maleEquipmentSlotMeshes||{}).length === 4);
  const maleDebug = await male.evaluate(() => window.__ranCharacterDebug);
  console.log(JSON.stringify({status:'PASS',character:'male',equipmentSlots:Object.keys(maleDebug.maleEquipmentSlotMeshes||{}),debug:maleDebug},null,2));
  await male.close();
} finally {
  await browser.close();
}
