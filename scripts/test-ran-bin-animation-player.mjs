import * as THREE from 'three';
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
console.log(JSON.stringify({ status: 'PASS', actions: player.actions, tracks: player.trackCount,
  pelvisPosition: pelvis.position.toArray(), pelvisQuaternion: pelvis.quaternion.toArray() }, null, 2));
