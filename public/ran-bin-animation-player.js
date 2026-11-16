// Plays extracted RAN BIN keyframes on the reconstructed Three.js skeleton.
// Input is the JSON emitted by scripts/extract-ran2-animation-clips.py.
export function createRanBinAnimationPlayer(model, THREE, clipDataByAction) {
  const actualNames = new Map();
  model.traverse(node => {
    if (node.isBone && node.name) actualNames.set(normalize(node.name), node.name);
  });
  const clips = new Map();
  const missingBones = new Map();

  for (const [actionName, data] of Object.entries(clipDataByAction || {})) {
    if (!data || !Array.isArray(data.tracks)) continue;
    const tracks = [];
    const missing = [];
    for (const source of data.tracks) {
      const boneName = actualNames.get(normalize(source.bone));
      if (!boneName) { missing.push(source.bone); continue; }

      // SQuatPosKey stores one complete transform per key. Prefer it when present.
      if (source.quat_position?.length) {
        const keys = source.quat_position;
        const times = keys.map(k => k.time / (data.timebase || 4800));
        tracks.push(new THREE.VectorKeyframeTrack(boneName + '.position', times, keys.flatMap(k => k.position)));
        tracks.push(new THREE.QuaternionKeyframeTrack(boneName + '.quaternion', times, keys.flatMap(k => k.rotation)));
        tracks.push(new THREE.VectorKeyframeTrack(boneName + '.scale', times, keys.flatMap(k => k.scale)));
        continue;
      }

      if (source.position?.length) {
        tracks.push(new THREE.VectorKeyframeTrack(
          boneName + '.position',
          source.position.map(k => k.time / (data.timebase || 4800)),
          source.position.flatMap(k => k.value)
        ));
      }
      if (source.rotation?.length) {
        tracks.push(new THREE.QuaternionKeyframeTrack(
          boneName + '.quaternion',
          source.rotation.map(k => k.time / (data.timebase || 4800)),
          source.rotation.flatMap(k => normalizeQuaternion(k.value))
        ));
      }
      if (source.scale?.length) {
        tracks.push(new THREE.VectorKeyframeTrack(
          boneName + '.scale',
          source.scale.map(k => k.time / (data.timebase || 4800)),
          source.scale.flatMap(k => k.value)
        ));
      }
      // Legacy matrix-only clips are decomposed into standard glTF TRS channels.
      if (!source.quat_position?.length && !source.rotation?.length && source.matrix?.length) {
        const positions = [], rotations = [], scales = [];
        for (const key of source.matrix) {
          const m = key.matrix;
          const matrix = new THREE.Matrix4().set(
            m[0],m[1],m[2],m[3], m[4],m[5],m[6],m[7],
            m[8],m[9],m[10],m[11], m[12],m[13],m[14],m[15]
          );
          const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
          matrix.decompose(p,q,s);
          positions.push(...p.toArray()); rotations.push(...q.toArray()); scales.push(...s.toArray());
        }
        const times = source.matrix.map(k => k.time / (data.timebase || 4800));
        tracks.push(new THREE.VectorKeyframeTrack(boneName + '.position', times, positions));
        tracks.push(new THREE.QuaternionKeyframeTrack(boneName + '.quaternion', times, rotations));
        tracks.push(new THREE.VectorKeyframeTrack(boneName + '.scale', times, scales));
      }
    }
    const duration = tracks.reduce((max, track) => Math.max(max, track.times[track.times.length - 1] || 0), 0);
    if (tracks.length && duration > 0) clips.set(actionName, new THREE.AnimationClip('RAN_' + actionName, duration, tracks));
    missingBones.set(actionName, [...new Set(missing)]);
  }

  const mixer = new THREE.AnimationMixer(model);
  const actions = new Map();
  for (const [name, clip] of clips) actions.set(name, mixer.clipAction(clip));
  let current = null;

  function play(name, fade = 0.18) {
    const next = actions.get(name);
    if (!next) return false;
    if (current === next) return true;
    if (current) current.fadeOut(fade);
    next.reset().fadeIn(fade).play();
    current = next;
    return true;
  }

  function update(dt) { mixer.update(Math.max(0, Math.min(dt, 0.05))); }
  return {
    play, update,
    has: name => actions.has(name),
    actions: [...actions.keys()],
    missingBones: Object.fromEntries(missingBones),
    trackCount: [...clips.values()].reduce((n, c) => n + c.tracks.length, 0)
  };
}

function normalize(name) {
  return String(name).toLowerCase().replace(/[ .-]+/g, '_').replace(/[^a-z0-9_]/g, '');
}

function normalizeQuaternion(q) {
  const length = Math.hypot(...q) || 1;
  return q.map(value => value / length);
}
