// Procedural skeletal controller for the reconstructed RAN female rig.
// This supplies real bone-driven locomotion while the original .bin converter is being completed.
export function createRanCharacterAnimator(model, THREE) {
  const names = [
    'Bip01_Pelvis','Bip01_Spine','Bip01_Spine1','Bip01_Spine2','Bip01_Neck','Bip01_Head',
    'Bip01_L_UpperArm','Bip01_L_Forearm','Bip01_R_UpperArm','Bip01_R_Forearm',
    'Bip01_L_Thigh','Bip01_L_Calf','Bip01_L_Foot','Bip01_R_Thigh','Bip01_R_Calf','Bip01_R_Foot'
  ];
  const bones = new Map();
  const rest = new Map();
  for (const name of names) {
    const bone = model.getObjectByName(name);
    if (bone) { bones.set(name, bone); rest.set(name, bone.quaternion.clone()); }
  }
  const axis = {
    x: new THREE.Vector3(1,0,0),
    y: new THREE.Vector3(0,1,0),
    z: new THREE.Vector3(0,0,1)
  };
  const offset = new THREE.Quaternion();
  let clock = 0;
  let attackClock = 10;
  let skillClock = 10;
  function pose(name, axisName, angle) {
    const bone = bones.get(name), base = rest.get(name);
    if (!bone || !base || !angle) return;
    offset.setFromAxisAngle(axis[axisName], angle);
    bone.quaternion.copy(base).multiply(offset);
  }
  function reset() {
    for (const [name,bone] of bones) bone.quaternion.copy(rest.get(name));
  }
  function triggerAttack() { attackClock = 0; }
  function triggerSkill() { skillClock = 0; }
  function update(mode, dt) {
    clock += dt;
    attackClock += dt;
    skillClock += dt;
    reset();
    const gaitRate = mode === 'run' ? 11.5 : 7.2;
    const phase = clock * gaitRate;
    if (attackClock < .68) {
      const t = attackClock / .68;
      const wind = Math.sin(Math.min(1,t) * Math.PI);
      const strike = Math.sin(Math.max(0,Math.min(1,(t-.28)/.48)) * Math.PI);
      pose('Bip01_Spine','y',-.24*wind);
      pose('Bip01_Spine1','y',-.18*wind);
      pose('Bip01_R_UpperArm','z',-.95*wind + .82*strike);
      pose('Bip01_R_UpperArm','x',-.72*wind - .42*strike);
      pose('Bip01_R_Forearm','x',-1.0*wind + .48*strike);
      pose('Bip01_L_UpperArm','z',.28*wind);
      pose('Bip01_L_Forearm','x',-.35*wind);
      pose('Bip01_Pelvis','y',-.18*wind);
      return;
    }
    if (skillClock < .82) {
      const t = skillClock / .82;
      const pulse = Math.sin(Math.min(1,t)*Math.PI);
      pose('Bip01_Spine','x',-.12*pulse);
      pose('Bip01_L_UpperArm','z',.72*pulse);
      pose('Bip01_R_UpperArm','z',-.72*pulse);
      pose('Bip01_L_Forearm','x',-.5*pulse);
      pose('Bip01_R_Forearm','x',-.5*pulse);
      return;
    }
    if (mode === 'walk' || mode === 'run') {
      const amp = mode === 'run' ? .72 : .43;
      const swing = Math.sin(phase);
      const bob = Math.abs(Math.cos(phase*2)) * (mode === 'run' ? .075 : .035);
      pose('Bip01_Pelvis','x',mode === 'run' ? -.06 : -.025);
      pose('Bip01_Pelvis','z',Math.sin(phase)*.035);
      pose('Bip01_Spine','x',mode === 'run' ? -.11 : -.045);
      pose('Bip01_Spine1','x',.035*Math.sin(phase*2));
      pose('Bip01_L_Thigh','x',swing*amp);
      pose('Bip01_R_Thigh','x',-swing*amp);
      pose('Bip01_L_Calf','x',Math.max(0,-swing)*(mode === 'run' ? .78 : .42));
      pose('Bip01_R_Calf','x',Math.max(0,swing)*(mode === 'run' ? .78 : .42));
      pose('Bip01_L_Foot','x',Math.max(0,swing)*-.28);
      pose('Bip01_R_Foot','x',Math.max(0,-swing)*-.28);
      pose('Bip01_L_UpperArm','x',-swing*amp*.48);
      pose('Bip01_R_UpperArm','x',swing*amp*.48);
      pose('Bip01_L_Forearm','x',-.22-Math.max(0,swing)*.16);
      pose('Bip01_R_Forearm','x',-.22-Math.max(0,-swing)*.16);
      pose('Bip01_Neck','x',.025*Math.sin(phase));
      model.position.y = bob;
    } else {
      const breath = Math.sin(clock*2.15);
      pose('Bip01_Spine','x',-.018 + breath*.018);
      pose('Bip01_Spine1','z',breath*.012);
      pose('Bip01_Neck','z',Math.sin(clock*.7)*.012);
      pose('Bip01_Head','y',Math.sin(clock*.55)*.025);
      pose('Bip01_L_UpperArm','x',Math.sin(clock*1.1)*.018);
      pose('Bip01_R_UpperArm','x',-Math.sin(clock*1.1)*.018);
      model.position.y = 0;
    }
  }
  return { update, triggerAttack, triggerSkill, boneCount: bones.size };
}
