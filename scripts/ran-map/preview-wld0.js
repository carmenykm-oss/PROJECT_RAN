#!/usr/bin/env node
'use strict';

// Render a loose RAN .wld0 file to a top-down PNG for visual validation.
// Usage:
//   node scripts/ran-map/preview-wld0.js "C:/.../LDG02.wld0" --out preview/LDG02.png
//   node scripts/ran-map/preview-wld0.js "C:/.../LDG02.wld0" --out preview/LDG02.png --side
//
// This reads a loose file only. It does NOT guess an RCC transform. The WLD
// body cipher is applied only when the 128-byte type field explicitly says
// Default_Crypt (or the paired WLD encrypted spelling Land.Man).

const fs = require('fs');
const path = require('path');
const SM = require('./staticmesh');
const png = require('./png');

const argv = process.argv.slice(2);
const input = argv.find((v) => !v.startsWith('--'));
const val = (flag, fallback) => {
  const i = argv.indexOf(flag);
  return i < 0 ? fallback : argv[i + 1];
};
const has = (flag) => argv.includes(flag);
const output = val('--out', null);
const size = Math.max(128, Math.min(4096, Number(val('--size', '1024')) || 1024));
const side = has('--side');

if (!input || !output) {
  console.error('usage: node preview-wld0.js FILE.wld0 --out FILE.png [--size N] [--side]');
  process.exit(2);
}
if (!fs.existsSync(input)) throw new Error('Input file not found: ' + input);

const raw = fs.readFileSync(input);
const sm = SM.parse(raw);
const all = [];
const lo = [Infinity, Infinity, Infinity];
const hi = [-Infinity, -Infinity, -Infinity];
const textures = new Set();
let meshCount = 0, nodeCount = 0, vertexCount = 0, triangleCount = 0;

for (const bucket of sm.buckets) {
  for (const mesh of bucket.meshes) {
    meshCount++;
    if (mesh.texName) textures.add(mesh.texName);
    for (const effect of mesh.effects || []) {
      for (const tex of effect.textures || []) textures.add(tex);
    }
    if (!mesh.octree) continue;
    for (const node of mesh.octree.nodes || []) {
      nodeCount++;
      const g = node.geometry;
      if (!g || !g.vertexCount || !g.indices?.length) continue;
      if (g.indices.length % 3 !== 0) throw new Error('Index count is not a triangle list');
      for (let a = 0; a < 3; a++) {
        if (Number.isFinite(node.vMin[a])) lo[a] = Math.min(lo[a], node.vMin[a]);
        if (Number.isFinite(node.vMax[a])) hi[a] = Math.max(hi[a], node.vMax[a]);
      }
      for (const idx of g.indices) {
        if (idx >= g.vertexCount) throw new Error('Mesh-local index outside vertex array');
      }
      for (const p of g.positions) {
        if (!Number.isFinite(p)) throw new Error('Non-finite vertex coordinate');
      }
      all.push(g);
      vertexCount += g.vertexCount;
      triangleCount += g.indices.length / 3;
    }
  }
}

if (!all.length || !Number.isFinite(lo[0])) {
  throw new Error('No valid terrain geometry was found in this .wld0 file');
}

const [ax, ay, az] = side ? [0, 1, 2] : [0, 2, 1];
const spanX = hi[ax] - lo[ax] || 1;
const spanY = hi[ay] - lo[ay] || 1;
const scale = (size - 2) / Math.max(spanX, spanY);
const width = Math.max(2, Math.round(spanX * scale) + 2);
const height = Math.max(2, Math.round(spanY * scale) + 2);
const rgba = Buffer.alloc(width * height * 4);
for (let i = 0; i < width * height; i++) {
  rgba[i * 4] = 18;
  rgba[i * 4 + 1] = 22;
  rgba[i * 4 + 2] = 28;
  rgba[i * 4 + 3] = 255;
}
const depth = new Float32Array(width * height).fill(Infinity);
const px = (v) => (v[ax] - lo[ax]) * scale + 1;
const py = (v) => height - 1 - ((v[ay] - lo[ay]) * scale + 1);
const p = [[0,0,0],[0,0,0],[0,0,0]];
let rasterized = 0;

for (const g of all) {
  for (let t = 0; t + 2 < g.indices.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const o = g.indices[t + k] * 3;
      p[k][0] = g.positions[o];
      p[k][1] = g.positions[o + 1];
      p[k][2] = g.positions[o + 2];
    }
    const [a,b,c] = p;
    const ux=b[0]-a[0], uy=b[1]-a[1], uz=b[2]-a[2];
    const vx=c[0]-a[0], vy=c[1]-a[1], vz=c[2]-a[2];
    let nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx;
    const len=Math.hypot(nx,ny,nz)||1;
    nx/=len; ny/=len; nz/=len;
    const shade=0.28+0.72*Math.abs(nx*0.35+ny*0.87+nz*0.35);
    const h=((a[az]+b[az]+c[az])/3-lo[az])/((hi[az]-lo[az])||1);
    const r=(65+155*h)*shade, gg=(95+125*h)*shade, bl=(145-45*h)*shade;
    const x0=px(a), y0=py(a), x1=px(b), y1=py(b), x2=px(c), y2=py(c);
    const minX=Math.max(0,Math.floor(Math.min(x0,x1,x2)));
    const maxX=Math.min(width-1,Math.ceil(Math.max(x0,x1,x2)));
    const minY=Math.max(0,Math.floor(Math.min(y0,y1,y2)));
    const maxY=Math.min(height-1,Math.ceil(Math.max(y0,y1,y2)));
    const area=(x1-x0)*(y2-y0)-(x2-x0)*(y1-y0);
    if (!area) continue;
    rasterized++;
    for(let y=minY;y<=maxY;y++) for(let x=minX;x<=maxX;x++) {
      const cx=x+0.5, cy=y+0.5;
      const w0=((x1-cx)*(y2-cy)-(x2-cx)*(y1-cy))/area;
      const w1=((x2-cx)*(y0-cy)-(x0-cx)*(y2-cy))/area;
      const w2=1-w0-w1;
      if(w0<0||w1<0||w2<0) continue;
      const d=-(w0*a[az]+w1*b[az]+w2*c[az]);
      const at=y*width+x;
      if(d>=depth[at]) continue;
      depth[at]=d;
      rgba[at*4]=Math.min(255,r);
      rgba[at*4+1]=Math.min(255,gg);
      rgba[at*4+2]=Math.min(255,bl);
    }
  }
}

const outPath = path.resolve(output);
fs.mkdirSync(path.dirname(outPath), {recursive:true});
fs.writeFileSync(outPath, png.encode(width,height,rgba));
let covered=0;
for(const d of depth) if(d!==Infinity) covered++;
console.log(JSON.stringify({
  input:path.resolve(input), output:outPath,
  type:sm.type, encrypted:sm.encrypted, containerVersion:'0x'+sm.version.toString(16),
  meshes:meshCount, octreeNodes:nodeCount, geometryNodes:all.length,
  vertices:vertexCount, triangles:triangleCount, textures:textures.size,
  skipped:sm.buckets.reduce((n,b)=>n+b.meshes.reduce((m,x)=>m+(x.octree?.skipped||0),0),0),
  boundsMin:lo, boundsMax:hi, image:[width,height],
  rasterizedTriangles:rasterized, coveragePercent:Number((100*covered/(width*height)).toFixed(2))
},null,2));
console.log('PNG written: '+outPath);
