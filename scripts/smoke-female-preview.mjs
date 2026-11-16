import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
const base = process.env.PREVIEW_URL || 'https://carmenykm-oss.github.io/PROJECT_RAN/';
const url = new URL('?preview=1&character=female&skinning=1&v=original-bin-animation-smoke', base).href;
await mkdir('preview-screenshots', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
const samplePose = () => page.evaluate(() => {
  const root = window.__ranCharacterDebugRoot;
  if (!root) return null;
  const pose = {};
  root.traverse(node => {
    if (node.isBone) pose[node.name] = [...node.position.toArray(), ...node.quaternion.toArray(), ...node.scale.toArray()];
  });
  return pose;
});
const poseDelta = (a, b) => {
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
    return window.__ranCharacterDebug?.character === 'female' || status.includes('女角色模型載入失敗');
  }, { timeout: 60000 });
  const status = (await page.locator('#connection').innerText()).trim();
  const debug = await page.evaluate(() => window.__ranCharacterDebug || null);
  if (!status.includes('女角色已載入') || !debug) throw new Error('Female GLB failed to load: ' + status);
  if (debug.meshCount < 6 || debug.skinnedMeshCount < 6 || debug.reboundSkinCount < 6 || debug.boneCount < 16 ||
      !Array.isArray(debug.evaluatedSkinnedSize) || debug.evaluatedSkinnedSize[1] < 0.2)
    throw new Error('Female rebound skinning incomplete: ' + JSON.stringify(debug));

  // Do not accept the procedural fallback: wait until all three real BIN clips
  // have loaded and have been registered by the browser-side RAN animation player.
  await page.waitForFunction(() => {
    const d = window.__ranOriginalAnimationDebug;
    return Array.isArray(d?.actions) &&
      ['idle', 'walk', 'run'].every(name => d.actions.includes(name)) &&
      Number.isFinite(d.tracks) && d.tracks > 0;
  }, { timeout: 60000 });
  const original = await page.evaluate(() => window.__ranOriginalAnimationDebug);
  await page.waitForTimeout(450);
  const idlePose = await samplePose();
  await page.screenshot({ path: 'preview-screenshots/female-game-preview.png' });

  await page.keyboard.down('w');
  await page.waitForTimeout(900);
  const walkPose = await samplePose();
  await page.screenshot({ path: 'preview-screenshots/female-original-bin-walk.png' });
  await page.keyboard.up('w');

  await page.keyboard.down('Shift');
  await page.keyboard.down('w');
  await page.waitForTimeout(900);
  const runPose = await samplePose();
  await page.screenshot({ path: 'preview-screenshots/female-original-bin-run.png' });
  await page.keyboard.up('w');
  await page.keyboard.up('Shift');

  const walkDelta = poseDelta(idlePose, walkPose);
  const runDelta = poseDelta(walkPose, runPose);
  if (!idlePose || !walkPose || !runPose || walkDelta < 0.001 || runDelta < 0.001) {
    throw new Error('Original BIN clips loaded but did not produce distinct bone poses: ' +
      JSON.stringify({ walkDelta, runDelta, actions: original.actions, tracks: original.tracks }));
  }
  if (errors.length) throw new Error('Browser errors: ' + errors.join(' | '));
  console.log(JSON.stringify({
    status: 'PASS',
    url,
    modelStatus: status,
    model: debug,
    originalBinAnimation: original,
    poseChecks: { walkDelta, runDelta, boneCount: Object.keys(idlePose).length }
  }, null, 2));
} finally {
  await browser.close();
}
