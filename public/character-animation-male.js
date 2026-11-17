// Male-specific controller for the native RAN male rig.
// Keep the original male bind pose intact until male-native animation tracks
// have been calibrated. The female controller is intentionally not reused:
// matching bone names do not guarantee matching local bone axes/rest rotations.
export function createRanMaleCharacterAnimator(model, THREE) {
  const names = [
    'Bip01_Pelvis','Bip01_Spine','Bip01_Spine1','Bip01_Spine2','Bip01_Neck','Bip01_Head',
    'Bip01_L_UpperArm','Bip01_L_Forearm','Bip01_R_UpperArm','Bip01_R_Forearm',
    'Bip01_L_Thigh','Bip01_L_Calf','Bip01_L_Foot','Bip01_R_Thigh','Bip01_R_Calf','Bip01_R_Foot'
  ];
  const bones = new Map();
  const rest = new Map();
  for (const name of names) {
    const bone = model.getObjectByName(name);
    if (bone) {
      bones.set(name, bone);
      rest.set(name, bone.quaternion.clone());
    }
  }
  const baseY = model.position.y;
  let clock = 0;
  function restoreBindPose() {
    for (const [name, bone] of bones) bone.quaternion.copy(rest.get(name));
  }
  function update(mode, dt) {
    clock += Math.max(0, dt || 0);
    restoreBindPose();
    // Root-only locomotion keeps the male skin weights and native joint axes
    // untouched. A small vertical cadence gives feedback without bending limbs.
    const moving = mode === 'walk' || mode === 'run';
    const rate = mode === 'run' ? 11.5 : 7.2;
    const amplitude = mode === 'run' ? 0.035 : 0.012;
    model.position.y = baseY + (moving ? Math.abs(Math.sin(clock * rate)) * amplitude : 0);
  }
  return {
    update,
    triggerAttack() {},
    triggerSkill() {},
    boneCount: bones.size,
    mode: 'male-native-bind-pose-safe'
  };
}
