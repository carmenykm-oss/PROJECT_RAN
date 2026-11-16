import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { createRanBinAnimationPlayer } from '../public/ran-bin-animation-player.js';

const model = new THREE.Group();
const pelvis = new THREE.Bone();
pelvis.name = 'Bip01_Pelvis';
model.add(pelvis);
const data = {
  timebase: 4800,
  tracks: [{
    bone: 'Bip01 Pelvis',
    quat_position: [
      { time: 0, position: [0,0,0], rotation: [0,0,0,1], scale: [1,1,1] },
      { time: 1200, position: [0,0.25,0], rotation: [0,0.2,0,0.98], scale: [1,1,1] }
    ]
  }]
};
const player = createRanBinAnimationPlayer(model, THREE, { walk: data });
if (!player.has('walk')) throw new Error('Original walk clip was not registered');
if (player.trackCount !== 3) throw new Error('Expected position, quaternion and scale tracks');
if (!player.play('walk', 0)) throw new Error('Original walk clip did not start');
player.update(0.05);
model.updateMatrixWorld(true);
if (![pelvis.position.x,pelvis.position.y,pelvis.position.z].every(Number.isFinite)) {
  throw new Error('Player produced non-finite bone position');
}
if (!Object.values(player.missingBones).every(list => list.length === 0)) {
  throw new Error('A test bone did not map to the female rig');
}
const matrixData = {
  timebase: 4800,
  tracks: [{
    bone: 'Bip01 Pelvis',
    matrix: [
      { time: 0, matrix: [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1] },
      { time: 1200, matrix: [1,0,0,0, 0,1,0,0, 0,0,1,0, 0.1,0.2,0.3,1] }
    ],
    // Source SetTime() prioritizes matrix keys even if quat-position data is present.
    quat_position: [{ time: 0, position: [9,9,9], rotation: [0,0,0,1], scale: [1,1,1] }]
  }]
};
const matrixPlayer = createRanBinAnimationPlayer(model, THREE, { run: matrixData });
if (!matrixPlayer.has('run')) throw new Error('DirectX matrix clip was not registered');
if (matrixPlayer.trackCount !== 3) throw new Error('Matrix clip should produce three TRS channels');
matrixPlayer.play('run', 0);
matrixPlayer.update(0.05);
if (Math.abs(pelvis.position.x - 0.02) > 1e-5 ||
    Math.abs(pelvis.position.y - 0.04) > 1e-5 ||
    Math.abs(pelvis.position.z - 0.06) > 1e-5) {
  throw new Error('DirectX row-major matrix was not transposed into Three.js local translation: ' + pelvis.position.toArray());
}

const femaleGlb = readFileSync(new URL('../public/models/ran-female.glb', import.meta.url));
if (femaleGlb.toString('ascii', 0, 4) !== 'glTF' || femaleGlb.toString('ascii', 16, 20) !== 'JSON') {
  throw new Error('Female GLB JSON chunk is invalid');
}
const femaleJsonLength = femaleGlb.readUInt32LE(12);
const femaleGltf = JSON.parse(femaleGlb.toString('utf8', 20, 20 + femaleJsonLength).trim());
const femaleSkin = femaleGltf.skins?.[0];
if (!femaleSkin?.joints?.length) throw new Error('Female GLB has no skin joint list');
const femaleRig = new THREE.Group();
const femaleBones = new Map();
const femaleJointIndices = [...new Set([
  ...femaleSkin.joints,
  ...femaleGltf.nodes.map((node, index) => node.name?.startsWith('Bip01') ? index : null).filter(index => index !== null)
])];
for (const index of femaleJointIndices) {
  const node = femaleGltf.nodes[index];
  const bone = new THREE.Bone();
  bone.name = node.name || ('joint_' + index);
  if (node.translation) bone.position.fromArray(node.translation);
  if (node.rotation) bone.quaternion.fromArray(node.rotation);
  if (node.scale) bone.scale.fromArray(node.scale);
  femaleBones.set(index, bone);
}
const childIndices = new Set();
for (const index of femaleJointIndices) {
  const node = femaleGltf.nodes[index];
  const parent = femaleBones.get(index);
  for (const childIndex of node.children || []) {
    const child = femaleBones.get(childIndex);
    if (child) { parent.add(child); childIndices.add(childIndex); }
  }
}
for (const [index, bone] of femaleBones) if (!childIndices.has(index)) femaleRig.add(bone);
femaleRig.updateMatrixWorld(true);
const femaleTracks = [...femaleBones].map(([index, bone]) => {
  const node = femaleGltf.nodes[index];
  const p = bone.position.toArray(), q = bone.quaternion.toArray(), scale = bone.scale.toArray();
  const nextQ = new THREE.Quaternion(...q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), 0.04));
  return {
    bone: bone.name.replace(/_/g, ' '),
    quat_position: [
      { time: 0, position: p, rotation: q, scale },
      { time: 480, position: p, rotation: nextQ.toArray(), scale }
    ]
  };
});
const femalePlayer = createRanBinAnimationPlayer(femaleRig, THREE, {
  idle: { timebase: 4800, tracks: femaleTracks },
  walk: { timebase: 4800, tracks: femaleTracks },
  run: { timebase: 4800, tracks: femaleTracks }
});
if (!femalePlayer.has('idle') || !femalePlayer.has('walk') || !femalePlayer.has('run')) {
  throw new Error('Original clip player did not register all three actions on the actual female rig');
}
const missingFemaleBones = Object.values(femalePlayer.missingBones).flat();
if (missingFemaleBones.length) throw new Error('Female rig bone-name mapping failed: ' + missingFemaleBones.join(', '));
femalePlayer.play('walk', 0);
femalePlayer.update(0.05);
femaleRig.updateMatrixWorld(true);

console.log(JSON.stringify({ status: 'PASS', actions: player.actions, tracks: player.trackCount,
  matrixAction: matrixPlayer.actions, matrixTranslation: pelvis.position.toArray(),
  femaleRigJoints: femaleJointIndices.length, femaleRigTracks: femalePlayer.trackCount,
  pelvisQuaternion: pelvis.quaternion.toArray() }, null, 2));
