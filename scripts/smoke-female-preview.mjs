import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
const base = process.env.PREVIEW_URL || 'https://carmenykm-oss.github.io/PROJECT_RAN/';
const url = new URL('?preview=1&character=female&skinning=1&v=5511', base).href;
await mkdir('preview-screenshots', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
const sampleThigh = () => page.evaluate(() => {
  const bone = window.__ranCharacterDebugRoot?.getObjectByName('Bip01_L_Thigh');
  return bone ? bone.quaternion.toArray() : null;
});
const delta = (a, b) => a && b ? Math.max(...a.map((v, i) => Math.abs(v - b[i]))) : 0;
try {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  if (!response || !response.ok()) throw new Error(`Preview page HTTP status: ${response?.status() ?? 'no response'}`);
  await page.waitForFunction(() => {
    const status = document.querySelector('#connection')?.textContent || '';
    return window.__ranCharacterDebug?.character === 'female' || status.includes('女角色模型載入失敗');
  }, { timeout: 60000 });
  const status = (await page.locator('#connection').innerText()).trim();
  const debug = await page.evaluate(() => window.__ranCharacterDebug || null);
  await page.waitForTimeout(500);
  const idlePose = await sampleThigh();
  await page.screenshot({ path: 'preview-screenshots/female-game-preview.png' });
  await page.keyboard.down('w'); await page.waitForTimeout(900);
  const walkPose = await sampleThigh();
  await page.screenshot({ path: 'preview-screenshots/female-rebound-walk.png' });
  await page.keyboard.up('w');
  await page.keyboard.down('Shift'); await page.keyboard.down('w'); await page.waitForTimeout(900);
  const runPose = await sampleThigh();
  await page.screenshot({ path: 'preview-screenshots/female-rebound-run.png' });
  await page.keyboard.up('w'); await page.keyboard.up('Shift');
  const walkDelta = delta(idlePose, walkPose), runDelta = delta(walkPose, runPose);
  if (!status.includes('女角色已載入') || !debug) throw new Error('Female GLB failed to load: ' + status);
  if (debug.meshCount < 6 || debug.skinnedMeshCount < 6 || debug.reboundSkinCount < 6 || debug.boneCount < 16 ||
      !Array.isArray(debug.evaluatedSkinnedSize) || debug.evaluatedSkinnedSize[1] < 0.2)
    throw new Error('Female rebound skinning incomplete: ' + JSON.stringify(debug));
  if (!idlePose || !walkPose || !runPose || walkDelta < 0.001 || runDelta < 0.001)
    throw new Error('Female walk/run did not change left-thigh pose: ' + JSON.stringify({idlePose,walkPose,runPose,walkDelta,runDelta}));
  if (errors.length) throw new Error('Browser errors: ' + errors.join(' | '));
  console.log(JSON.stringify({status:'PASS',url,modelStatus:status,debug,poseChecks:{walkDelta,runDelta,idlePose,walkPose,runPose}},null,2));
} finally { await browser.close(); }
