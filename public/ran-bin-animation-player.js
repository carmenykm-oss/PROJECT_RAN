// Plays extracted RAN BIN keyframes on the reconstructed Three.js skeleton.
// Input is the JSON emitted by scripts/extract-ran2-animation-clips.py.
export function createRanBinAnimationPlayer(model, THREE, clipDataByAction) {
  const actualNames = new Map();
  model.traverse(node => {
    if (node.isBone && node.name) actualNames.set(normalize(node.name), node.name);
  });
  const clips = new Map();
  const missingBones = new Map();
  const mappedBones = new Set();
  const sourceBones = new Set();

  for (const [actionName, data] of Object.entries(clipDataByAction || {})) {
    if (!data || !Array.isArray(data.tracks)) continue;
    const tracks = [];
    const missing = [];
    for (const source of data.tracks) {
      sourceBones.add(normalize(source.bone));
      const boneName = actualNames.get(normalize(source.bone));
      if (!boneName) { missing.push(source.bone); continue; }
      mappedBones.add(boneName);

      // RAN SetTime() uses matrix keys first when present. Convert the DirectX
      // row-major matrix payload to Three.js column-major form before decomposing.
      if (source.matrix?.length) {
        const positions = [], rotations = [], scales = [];
        for (const key of source.matrix) {
          const matrix = new THREE.Matrix4().fromArray(key.matrix);
          const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
          matrix.decompose(p, q, s);
          positions.push(...p.toArray()); rotations.push(...q.toArray()); scales.push(...s.toArray());
        }
        const times = source.matrix.map(k => k.time / (data.timebase || 4800));
        tracks.push(new THREE.VectorKeyframeTrack(boneName + '.position', times, positions));
        tracks.push(new THREE.QuaternionKeyframeTrack(boneName + '.quaternion', times, rotations));
        tracks.push(new THREE.VectorKeyframeTrack(boneName + '.scale', times, scales));
        continue;
      }

      // SQuatPosKey is the source runtime's fallback when no matrix array exists.
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
          source.rotation.flatMap(k => normalizeQuaternion([k.value[0], k.value[1], k.value[2], -k.value[3]]))
        ));
      }
      if (source.scale?.length) {
        tracks.push(new THREE.VectorKeyframeTrack(
          boneName + '.scale',
          source.scale.map(k => k.time / (data.timebase || 4800)),
          source.scale.flatMap(k => k.value)
        ));
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
    mappedBones: [...mappedBones],
    sourceBoneCount: sourceBones.size,
    mappedBoneCount: mappedBones.size,
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

export async function loadRanBinAnimationPlayer(model, THREE, baseUrl = './animations/') {
  const base = new URL(baseUrl, import.meta.url);
  const manifestResponse = await fetch(new URL('manifest.json', base), { cache: 'no-cache' });
  if (!manifestResponse.ok) throw new Error('Original RAN animation manifest is unavailable');
  const manifest = await manifestResponse.json();
  if (manifest.status !== 'ready') return null;
  const files = {
    idle: manifest.clips?.idle,
    walk: manifest.clips?.walk,
    run: manifest.clips?.run
  };
  if (Object.values(files).some(file => typeof file !== 'string' || !file.endsWith('.json'))) {
    throw new Error('Original RAN animation manifest is incomplete');
  }
  const entries = await Promise.all(Object.entries(files).map(async ([action, file]) => {
    const response = await fetch(new URL(file, base), { cache: 'no-cache' });
    if (!response.ok) throw new Error('Unable to load original RAN animation clip: ' + file);
    return [action, await response.json()];
  }));
  const player = createRanBinAnimationPlayer(model, THREE, Object.fromEntries(entries));
  if (!player.has('idle') || !player.has('walk') || !player.has('run')) {
    throw new Error('Original RAN idle/walk/run clips did not all produce playable tracks');
  }
  return player;
}
