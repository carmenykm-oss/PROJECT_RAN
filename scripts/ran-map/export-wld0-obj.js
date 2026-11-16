#!/usr/bin/env node
'use strict';

// Export loose RAN .wld0 static terrain to OBJ + MTL.
// Usage:
//   node scripts/ran-map/export-wld0-obj.js FILE.wld0 --out-dir preview/LDG02
//
// This preserves mesh/material grouping, UVs and node-local triangle indices.
// It does not yet add the .wld scene's placed objects or .pis replacement pieces.

const fs = require('fs');
const path = require('path');
const SM = require('./staticmesh');

const argv = process.argv.slice(2);
const input = argv.find((v) => !v.startsWith('--'));
const at = argv.indexOf('--out-dir');
const outDir = at >= 0 ? argv[at + 1] : null;
if (!input || !outDir) {
  console.error('usage: export-wld0-obj.js FILE.wld0 --out-dir DIRECTORY');
  process.exit(2);
}
if (!fs.existsSync(input)) throw new Error('Input file not found: ' + input);

const sm = SM.parse(fs.readFileSync(input));
const obj = ['# PROJECT RAN loose WLD0 terrain export', 'mtllib terrain.mtl'];
const mtl = [];
const materials = new Map();
let vertexBase = 1;
let uvBase = 1;
let meshes = 0, nodes = 0, vertices = 0, triangles = 0;

function safeName(s) {
  return String(s || 'untextured').replace(/[^A-Za-z0-9_.-]/g, '_') || 'untextured';
}
function materialName(texture) {
  const key = String(texture || '').toLowerCase();
  if (materials.has(key)) return materials.get(key);
  const name = safeName(texture);
  materials.set(key, name);
  mtl.push('newmtl ' + name, 'Kd 1 1 1', 'Ka 0.1 0.1 0.1');
  if (texture) mtl.push('map_Kd ' + path.basename(texture));
  mtl.push('');
  return name;
}

for (const bucket of sm.buckets) {
  for (const mesh of bucket.meshes) {
    meshes++;
    const tex = mesh.texName || mesh.key || '';
    const mat = materialName(tex);
    if (!mesh.octree) continue;
    for (const node of mesh.octree.nodes || []) {
      const g = node.geometry;
      if (!g || !g.vertexCount || !g.indices?.length) continue;
      nodes++;
      obj.push('g ' + safeName(bucket.name + '_' + (mesh.texName || 'mesh') + '_' + nodes));
      obj.push('usemtl ' + mat);
      for (let i=0;i<g.vertexCount;i++) {
        const x = -g.positions[i*3];
        const y = g.positions[i*3+1];
        const z = g.positions[i*3+2];
        obj.push('v ' + x + ' ' + y + ' ' + z);
      }
      for (let i=0;i<g.vertexCount;i++) {
        const u = g.uvs ? g.uvs[i*2] : 0;
        const v = g.uvs ? 1-g.uvs[i*2+1] : 0;
        obj.push('vt ' + u + ' ' + v);
      }
      for (let i=0;i<g.indices.length;i+=3) {
        const a=vertexBase+g.indices[i];
        const b=vertexBase+g.indices[i+1];
        const c=vertexBase+g.indices[i+2];
        obj.push('f '+a+'/'+uvBase+' '+c+'/'+(uvBase+g.indices[i+2])+' '+b+'/'+(uvBase+g.indices[i+1]));
      }
      vertexBase += g.vertexCount;
      uvBase += g.vertexCount;
      vertices += g.vertexCount;
      triangles += g.indices.length/3;
    }
  }
}

if (!nodes) throw new Error('No valid terrain geometry nodes were found');
fs.mkdirSync(path.resolve(outDir), {recursive:true});
const objPath = path.resolve(outDir,'terrain.obj');
const mtlPath = path.resolve(outDir,'terrain.mtl');
fs.writeFileSync(objPath,obj.join('\n')+'\n');
fs.writeFileSync(mtlPath,mtl.join('\n')+'\n');
console.log(JSON.stringify({
  input:path.resolve(input), obj:objPath, mtl:mtlPath,
  type:sm.type, containerVersion:'0x'+sm.version.toString(16),
  meshes,nodes,vertices,triangles,materials:materials.size
},null,2));
