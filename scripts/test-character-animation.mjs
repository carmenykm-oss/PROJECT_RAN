import { readFileSync } from 'node:fs';

const glb = readFileSync(new URL('../public/models/ran-female.glb', import.meta.url));
if (glb.toString('ascii', 0, 4) !== 'glTF') throw new Error('Female GLB header is invalid');
const jsonLength = glb.readUInt32LE(12);
const jsonType = glb.toString('ascii', 16, 20);
if (jsonType !== 'JSON') throw new Error('Female GLB JSON chunk is missing');
const gltf = JSON.parse(glb.toString('utf8', 20, 20 + jsonLength).trim());
const glbNames = new Set((gltf.nodes || []).map(node => node.name).filter(Boolean));

const names = [
  'Bip01_Pelvis','Bip01_Spine','Bip01_Spine1','Bip01_Spine2','Bip01_Neck','Bip01_Head',
  'Bip01_L_UpperArm','Bip01_L_Forearm','Bip01_R_UpperArm','Bip01_R_Forearm',
  'Bip01_L_Thigh','Bip01_L_Calf','Bip01_L_Foot','Bip01_R_Thigh','Bip01_R_Calf','Bip01_R_Foot'
];
const missing = names.filter(name => !glbNames.has(name));
if (missing.length) throw new Error('Missing bones in female GLB: ' + missing.join(', '));

class Quaternion {
  constructor(x=0,y=0,z=0,w=1) { Object.assign(this,{x,y,z,w}); }
  clone() { return new Quaternion(this.x,this.y,this.z,this.w); }
  copy(q) { Object.assign(this,{x:q.x,y:q.y,z:q.z,w:q.w}); return this; }
  multiply(q) {
    const ax=this.x, ay=this.y, az=this.z, aw=this.w;
    const bx=q.x, by=q.y, bz=q.z, bw=q.w;
    this.x=ax*bw+aw*bx+ay*bz-az*by;
    this.y=ay*bw+aw*by+az*bx-ax*bz;
    this.z=az*bw+aw*bz+ax*by-ay*bx;
    this.w=aw*bw-ax*bx-ay*by-az*bz;
    return this;
  }
  setFromAxisAngle(a,t) {
    const h=t/2, s=Math.sin(h);
    this.x=a.x*s; this.y=a.y*s; this.z=a.z*s; this.w=Math.cos(h);
    return this;
  }
}
class Vector3 { constructor(x,y,z){this.x=x;this.y=y;this.z=z;} }
const THREE={Quaternion,Vector3};
const bones=new Map(names.map(name=>[name,{quaternion:new Quaternion()}]));
const model={position:{y:0},getObjectByName(name){return bones.get(name)||null;}};
const source=readFileSync(new URL('../public/character-animation.js',import.meta.url),'utf8')
  .replace('export function createRanCharacterAnimator','function createRanCharacterAnimator');
const animator=new Function('THREE','model',source+'; return createRanCharacterAnimator(model,THREE);')(THREE,model);
if(animator.boneCount!==names.length) throw new Error('Mapped bone count mismatch');

function assertPose(label) {
  let changed=0;
  for(const [name,bone] of bones) {
    const q=bone.quaternion;
    if(![q.x,q.y,q.z,q.w].every(Number.isFinite)) throw new Error(label+' has a non-finite quaternion at '+name);
    const norm=Math.hypot(q.x,q.y,q.z,q.w);
    if(Math.abs(norm-1)>1e-5) throw new Error(label+' has a non-normalized quaternion at '+name);
    if(Math.abs(q.x)+Math.abs(q.y)+Math.abs(q.z)>1e-6) changed++;
  }
  if(!changed) throw new Error(label+' did not move any mapped bones');
  return changed;
}
const results={};
animator.update('idle',1/60); results.idle=assertPose('idle');
animator.update('walk',1/60); results.walk=assertPose('walk');
animator.update('run',1/60); results.run=assertPose('run');
animator.triggerAttack(); animator.update('idle',1/60); results.attack=assertPose('attack');
animator.triggerSkill(); animator.update('idle',1/60); results.skill=assertPose('skill');
console.log(JSON.stringify({
  status:'PASS',
  femaleGlbNodes:gltf.nodes.length,
  glbOriginalAnimationClips:(gltf.animations||[]).length,
  mappedBones:animator.boneCount,
  changedBonesByAction:results,
  testedActions:['idle','walk','run','attack','skill']
},null,2));
