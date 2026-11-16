import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const base = process.env.PREVIEW_URL || 'https://carmenykm-oss.github.io/PROJECT_RAN/';
const url = new URL('?preview=1&character=male&skinning=1&originalBin=1&v=5515', base).href;
await mkdir('preview-screenshots', { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist']
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });

const samplePose = () => page.evaluate(() => {
  const root = window.__ranCharacterDebugRoot;
  if (!root) return null;
  const pose = {};
  root.traverse(node => {
    if (node.isBone && node.name?.startsWith('Bip01')) {
      pose[node.name] = [...node.position.toArray(), ...node.quaternion.toArray(), ...node.scale.toArray()];
    }
  });
  return pose;
});
const delta = (a, b) => {
  if (!a || !b) return 0;
  let max = 0;
  for (const [name, values] of Object.entries(a)) {
    const other = b[name];
    if (other) for (let i = 0; i < values.length; i++) max = Math.max(max, Math.abs(values[i] - other[i]));
  }
  return max;
};

try {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  if (!response || !response.ok()) throw new Error(`Preview page HTTP status: ${response?.status() ?? 'no response'}`);
  await page.waitForFunction(() => {
    const status = document.querySelector('#connection')?.textContent || '';
    return window.__ranCharacterDebug?.character === 'male' || status.includes('男戰士模型載入失敗');
  }, { timeout: 60000 });
  const status = (await page.locator('#connection').innerText()).trim();
  const debug = await page.evaluate(() => window.__ranCharacterDebug || null);
  await page.waitForFunction(() => {
    const d = window.__ranOriginalAnimationDebug;
    return d && d.status !== undefined && d.status !== 'waiting-for-real-bin-clips';
  }, { timeout: 60000 });
  const original = await page.evaluate(() => window.__ranOriginalAnimationDebug);
  if (original.status !== 'compatible' || !['idle', 'walk', 'run'].every(name => original.actions?.includes(name))) {
    throw new Error('Original RAN BIN clips are not compatible with the male rig: ' + JSON.stringify(original));
  }
  await page.waitForTimeout(500);
  const idlePose = await samplePose();
  await page.screenshot({ path: 'preview-screenshots/male-rebound-idle.png' });

  await page.keyboard.down('w');
  await page.waitForTimeout(900);
  const walkPose = await samplePose();
  await page.screenshot({ path: 'preview-screenshots/male-rebound-walk.png' });
  await page.keyboard.up('w');

  await page.keyboard.down('Shift');
  await page.keyboard.down('w');
  await page.waitForTimeout(900);
  const runPose = await samplePose();
  await page.screenshot({ path: 'preview-screenshots/male-rebound-run.png' });
  await page.keyboard.up('w');
  await page.keyboard.up('Shift');

  const walkDelta = delta(idlePose, walkPose);
  const runDelta = delta(walkPose, runPose);
  if (!status.includes('男戰士已載入') || !debug) throw new Error('Male rebound-skin GLB failed to load: ' + status);
  if (debug.reboundSkinCount < 6 || debug.skinnedMeshCount < 6 ||
      !Array.isArray(debug.evaluatedSkinnedSize) || debug.evaluatedSkinnedSize[1] < 0.2) {
    throw new Error('Male rebound skinning incomplete: ' + JSON.stringify(debug));
  }
  if (!idlePose || !walkPose || !runPose || walkDelta < 0.001 || runDelta < 0.001) {
    throw new Error('Original BIN walk/run clips did not change male bone poses: ' + JSON.stringify({ walkDelta, runDelta, original }));
  }
  if (errors.length) throw new Error('Browser errors: ' + errors.join(' | '));
  console.log(JSON.stringify({
    status: 'PASS', url, modelStatus: status, debug, originalBinAnimation: original,
    poseChecks: { walkDelta, runDelta, boneCount: Object.keys(idlePose || {}).length },
    screenshots: ['male-rebound-idle.png', 'male-rebound-walk.png', 'male-rebound-run.png']
  }, null, 2));
} finally { await browser.close(); }
