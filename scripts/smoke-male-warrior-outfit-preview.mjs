import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const base = process.env.PREVIEW_URL || 'https://carmenykm-oss.github.io/PROJECT_RAN/';
const variants = [
  { id: 'outer', label: 'm_ss_war.x 原版外層' },
  { id: 'a', label: 's_m_a_zt.x A 部件組' },
  { id: 'f', label: 's_m_f_zt.X F 部件組' }
];
await mkdir('preview-screenshots', { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist']
});
const results = [];
const failures = [];

try {
  for (const variant of variants) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    const url = new URL(`?preview=1&character=male&warrior=${variant.id}&skinning=1&v=warrior-overlay-${variant.id}`, base).href;
    let status = '';
    let debug = null;
    try {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
      if (!response || !response.ok()) throw new Error(`Preview page HTTP status: ${response?.status() ?? 'no response'}`);
      await page.waitForFunction((id) => {
        const text = document.querySelector('#connection')?.textContent || '';
        const d = window.__ranCharacterDebug;
        return (d?.character === 'male' && d?.warriorVariant === id) || text.includes('男戰士模型載入失敗');
      }, variant.id, { timeout: 60000 });
      status = (await page.locator('#connection').innerText()).trim();
      debug = await page.evaluate(() => window.__ranCharacterDebug || null);
      await page.waitForTimeout(500);

      if (!status.includes('男戰士已載入') || !debug) throw new Error('男戰士模型未載入：' + status);
      if (debug.warriorVariant !== variant.id ||
          debug.warriorOverlayMeshCount < 4 ||
          debug.warriorOverlayReboundCount !== debug.warriorOverlayMeshCount ||
          debug.warriorOverlayBoneBindingMismatchCount !== 0 ||
          debug.meshCount < 10 || debug.skinnedMeshCount < 10 ||
          debug.reboundSkinCount < 10 || debug.bakedMeshCount !== 0) {
        throw new Error('戰士裝備蒙皮／骨骼配對未完成：' + JSON.stringify(debug));
      }
      const size = debug.evaluatedSkinnedSize;
      if (!Array.isArray(size) || size.length !== 3 || !size.every(Number.isFinite) ||
          size[1] < 2.4 || size[1] > 2.8 || size[0] > 4 || size[2] > 2) {
        throw new Error('戰士裝備合併後的角色尺寸異常：' + JSON.stringify(size));
      }
      const expectedNames = new Set((debug.warriorOverlayMeshNames || []).map(name => name + '_rebound_skin'));
      const diagnostics = (debug.skinDiagnostics || []).filter(item => expectedNames.has(item.name));
      if (diagnostics.length !== debug.warriorOverlayReboundCount) {
        throw new Error('戰士裝備網格沒有全部進入蒙皮診斷：' + JSON.stringify({ expected: expectedNames.size, actual: diagnostics.length }));
      }

      const views = [
        { name: 'front', angle: 0 },
        { name: 'side', angle: Math.PI / 2 },
        { name: 'back', angle: Math.PI }
      ];
      const screenshots = [];
      for (const view of views) {
        await page.evaluate((angle) => {
          const root = window.__ranCharacterDebugRoot;
          const pivot = root?.parent;
          if (pivot) {
            pivot.rotation.y = angle;
            pivot.updateMatrixWorld(true);
          }
        }, view.angle);
        await page.waitForTimeout(300);
        const path = `preview-screenshots/male-warrior-${variant.id}-${view.name}.png`;
        await page.screenshot({ path });
        screenshots.push(path);
      }
      if (errors.length) throw new Error('Browser errors: ' + errors.join(' | '));
      results.push({
        status: 'PASS',
        variant: variant.id,
        source: variant.label,
        url,
        modelStatus: status,
        overlaySkinnedMeshes: debug.warriorOverlayMeshCount,
        reboundOverlayMeshes: debug.warriorOverlayReboundCount,
        boneBindingMismatches: debug.warriorOverlayBoneBindingMismatchCount,
        totalMeshes: debug.meshCount,
        totalSkinnedMeshes: debug.skinnedMeshCount,
        evaluatedSize: size,
        overlayMeshNames: debug.warriorOverlayMeshNames,
        screenshots
      });
    } catch (error) {
      failures.push({ variant: variant.id, error: error.message, status, debug, browserErrors: errors });
      results.push({ status: 'FAIL', variant: variant.id, source: variant.label, url, error: error.message });
      await page.screenshot({ path: `preview-screenshots/male-warrior-${variant.id}-error.png` }).catch(() => {});
    } finally {
      await page.close();
    }
  }
  console.log(JSON.stringify({ results, failures }, null, 2));
  if (failures.length) throw new Error(`Male warrior outfit preview failed for ${failures.map(x => x.variant).join(', ')}`);
} finally {
  await browser.close();
}
