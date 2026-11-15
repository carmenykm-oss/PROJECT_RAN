import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createRanCharacterAnimator } from './character-animation.js';

const mount = document.getElementById('game');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x77796f);
scene.fog = new THREE.Fog(0x77796f, 58, 145);
const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, .1, 280);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
mount.appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xd9d4c2, 0x34352c, 1.65));
const sun = new THREE.DirectionalLight(0xffe4b8, 2.35);
sun.position.set(-24, 34, 18); sun.castShadow = true; sun.shadow.mapSize.set(2048,2048); scene.add(sun);

function box(x, y, z, a, b, c, color, materialOptions = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(a, b, c), new THREE.MeshStandardMaterial({ color, roughness: .92, ...materialOptions }));
  mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh); return mesh;
}
function cylinder(x,y,z,rt,rb,h,color,segments=12){
 const m=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,segments),new THREE.MeshStandardMaterial({color,roughness:.88}));
 m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;scene.add(m);return m;
}
const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ color: 0x55594d, roughness:1 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
// Weathered square paving, with a broad central plaza and the avenue leading to the fountain.
const stoneColors=[0x77766b,0x858276,0x6d7068,0x918c7c,0x777a72,0x666960];
for(let x=-24;x<=24;x+=3.2) for(let z=-25;z<=22;z+=3.2){
 const tile=box(x,.055,z,3.08,.11,3.08,stoneColors[(Math.abs(Math.round(x*3)+Math.round(z*7)))%stoneColors.length]);
 tile.position.y=.055;
}
for(let x=-6;x<=6;x+=3) box(x,.13,0,2.9,.16,52,0x88877c);
// Campus perimeter retaining walls and iron fence lines.
for(const side of [-1,1]){
 box(side*14,1.1,-1,1.1,2.2,48,0x514d3f);
 for(let z=-22;z<=20;z+=3){
   box(side*14,2.35,z,.18,2.4,.18,0x292a26);
   box(side*14,3.48,z,.24,.18,.24,0x4b4636);
 }
 box(side*14,2.45,-1,.25,.16,48,0x252622);
 box(side*14,3.15,-1,.18,.14,48,0x252622);
 for(let z=-22;z<=20;z+=1.05) box(side*14,2.65,z,.055,1.05,.055,0x242620);
}
// Heavy carved gate piers, lintel and a dark iron gate behind the fountain.
for(const x of [-9.2,9.2]){
 box(x,4,-27,1.8,8,1.8,0x62513d);
 box(x,7.9,-27,2.15,.5,2.15,0x302b24);
 box(x,2.2,-27,2.25,.45,2.25,0x393b34);
}
box(0,7.7,-27,16.8,.65,1.15,0x393329);
for(let x=-7.8;x<=7.8;x+=.65) box(x,4.9,-27,.09,5.2,.09,0x242722);
for(const y of [2.5,6.9]) box(0,y,-27,16,.16,.16,0x2a2b25);
// Stone fountain: stepped octagonal basin, central pedestal and water.
cylinder(0,.34,-19,5.1,5.35,.55,0x777467,8);
cylinder(0,.65,-19,4.65,4.9,.22,0xaaa18a,8);
cylinder(0,.83,-19,4.2,4.35,.18,0x5b665e,8);
const water=new THREE.Mesh(new THREE.CylinderGeometry(3.95,3.95,.08,8),new THREE.MeshStandardMaterial({color:0x566b69,roughness:.24,metalness:.18}));
water.position.set(0,.96,-19);scene.add(water);
cylinder(0,1.65,-19,1.85,2.2,1.45,0x5d665d,8);
cylinder(0,2.7,-19,1.25,1.55,.7,0x817d6d,8);
cylinder(0,3.55,-19,.72,1.0,1.15,0x5a635d,8);
cylinder(0,4.25,-19,.9,.72,.25,0x9a9078,8);
// Weathered academy wings and ornate entrance structures in the distance.
for(const side of [-1,1]){
 box(side*19,4,-30,10,8,12,0x716b58);
 for(let z=-35;z<=-25;z+=3.2) box(side*19,4.1,z,10.2,.18,.2,0x37382f);
 for(let x=side*15;x!==side*24;x+=side*3) box(x,7.2,-30,2.5,.6,12,0x3b3027);
}
// Decorative masonry columns at foreground edges, framing the play space.
for(const side of [-1,1]){
 box(side*11,3.4,5,1.6,6.8,1.6,0x66523d);
 box(side*11,6.95,5,2,.35,2,0x302b24);
 box(side*11,1,5,2.1,.5,2.1,0x37362e);
}

function tag(text) {
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#111c'; ctx.roundRect(8, 8, 240, 48, 12); ctx.fill();
  ctx.fillStyle = 'white'; ctx.font = 'bold 23px Arial'; ctx.textAlign = 'center'; ctx.fillText(text, 128, 40);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true }));
  sprite.scale.set(3, .75, 1); return sprite;
}
function avatar(color, label) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.42, .9, 4, 8), new THREE.MeshStandardMaterial({ color }));
  body.position.y = 1.15; group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.32, 12, 10), new THREE.MeshStandardMaterial({ color: 0xe0b58d }));
  head.position.y = 2.05; group.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(.33, 10, 7, 0, Math.PI * 2, 0, Math.PI * .55), new THREE.MeshStandardMaterial({ color: 0x292b31 }));
  hair.position.y = 2.18; group.add(hair);
  const nameTag = tag(label); nameTag.position.y = 2.8; group.add(nameTag); return group;
}
const me = avatar(0x315b86, 'YOU'); scene.add(me); me.position.set(0, 0, 3);
// Load the reconstructed RAN Online character assets into the live campus scene.
// Resolve from this module URL so GitHub Pages subpaths and local hosting behave identically.
const gltfLoader = new GLTFLoader();
async function loadRANCharacter(url, target, desiredHeight = 2.65) {
  const resolvedUrl = new URL(url, import.meta.url).href;
  const status = document.getElementById('connection');
  if (status && new URLSearchParams(location.search).get('preview') === '1') status.textContent = '女角色載入中…';
  try {
    const gltf = await gltfLoader.loadAsync(resolvedUrl);
    const model = gltf.scene;
    let meshCount = 0, skinnedMeshCount = 0;
    model.traverse((obj) => {
      if (obj.isMesh) {
        meshCount++;
        if (obj.isSkinnedMesh) skinnedMeshCount++;
        obj.visible = true;
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    if (!meshCount || !Number.isFinite(size.y) || size.y <= 0.001) {
      throw new Error(`GLB 無有效可見模型：mesh=${meshCount}, height=${size.y}`);
    }
    // Normalize through a parent pivot instead of changing the GLTF scene root.
    // Some exported GLBs keep matrixAutoUpdate=false on the root; writing scale/position
    // directly to that root then has no visible effect and leaves the character off-screen.
    const scale = desiredHeight / size.y;
    const pivot = new THREE.Group();
    pivot.name = 'RAN_Female_NormalizationPivot';
    pivot.scale.setScalar(scale);
    pivot.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
    pivot.add(model);
    target.add(pivot);
    model.traverse((obj) => {
      if (obj.isMesh) {
        obj.frustumCulled = false;
        obj.visible = true;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of mats) if (mat) {
          mat.side = THREE.DoubleSide;
          mat.needsUpdate = true;
        }
      }
    });
    target.userData.ranModel = model;
    target.userData.ranPivot = pivot;
    target.userData.ranAnimator = createRanCharacterAnimator(model, THREE);
    target.visible = true;
    target.updateMatrixWorld(true);
    // Only hide the temporary mannequin after the normalized GLB is attached.
    target.children.forEach((child) => {
      if (child !== pivot && !child.isSprite) child.visible = false;
    });
    console.info('RAN female loaded:', { url: resolvedUrl, meshCount, skinnedMeshCount, sourceHeight: size.y, appliedScale: scale, bones: target.userData.ranAnimator.boneCount, pivotPosition: pivot.position.toArray() });
    if (status && new URLSearchParams(location.search).get('preview') === '1') status.textContent = '女角色已載入';
    if (new URLSearchParams(location.search).get('preview') === '1') notice(`女角色模型載入成功：${meshCount} 個網格、${target.userData.ranAnimator.boneCount} 根控制骨骼。`);
    return model;
  } catch (error) {
    console.error('RAN character model failed to load:', resolvedUrl, error);
    // Keep the visible placeholder instead of leaving the player completely invisible.
    target.visible = true;
    if (status) status.textContent = '女角色模型載入失敗';
    if (new URLSearchParams(location.search).get('preview') === '1') notice(`女角色載入失敗：${error.message || error}`);
    return null;
  }
}
loadRANCharacter('./models/ran-female.glb', me);
const mentor = avatar(0xb28a45, '學園導師'); mentor.position.set(0,0,-8); scene.add(mentor);
function makeQuestMarker() {
  const canvas=document.createElement('canvas'); canvas.width=128; canvas.height=128;
  const ctx=canvas.getContext('2d');
  const texture=new THREE.CanvasTexture(canvas);
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false}));
  sprite.position.set(0,3.75,0); sprite.scale.set(1.05,1.05,1); mentor.add(sprite);
  return {canvas,ctx,texture,sprite};
}
const questMarker=makeQuestMarker();
function updateQuestMarker(status) {
  const {ctx,canvas,texture,sprite}=questMarker; ctx.clearRect(0,0,128,128);
  let symbol='',fill='';
  if(status==='not_started'){symbol='!';fill='#e8b94f';}
  else if(status==='complete'){symbol='?';fill='#5eb7e8';}
  sprite.visible=!!symbol;
  if(symbol){ctx.beginPath();ctx.arc(64,64,49,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();ctx.lineWidth=8;ctx.strokeStyle='#fff4d2';ctx.stroke();ctx.fillStyle='#172536';ctx.font='bold 82px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(symbol,64,67);texture.needsUpdate=true;}
}
const remotes = new Map(), mobMeshes = new Map(), mobStates = new Map(), keys = new Set();
let yaw = 0, pitch = .22, myId = null, socket, attackCd = 0, lastSent = 0, myPlayer = null, authToken = null, gameStarted = false, registerMode = false;

function makeMob(mob) {
  const group = new THREE.Group();
  const color = mob.color || 0x69bd77;
  let geometry = new THREE.SphereGeometry(.8, 12, 10);
  let y = .8;
  if (mob.type === 'wolf') { geometry = new THREE.CapsuleGeometry(.48,.55,4,8); y=1; }
  if (mob.type === 'golem') { geometry = new THREE.DodecahedronGeometry(1,0); y=1; }
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: .72 }));
  mesh.position.y = y; mesh.castShadow = true; group.add(mesh);
  const eyes = new THREE.Mesh(new THREE.BoxGeometry(.34, .08, .06), new THREE.MeshBasicMaterial({ color: 0x17231b }));
  eyes.position.set(0, y+.2, mob.type==='golem'?.86:.72); group.add(eyes);
  const nameTag = tag(`${mob.name || '怪物'} Lv.${mob.level||1}`); nameTag.position.y = 2.25; group.add(nameTag);
  const hpBar = new THREE.Mesh(new THREE.BoxGeometry(1.5, .12, .12), new THREE.MeshBasicMaterial({ color: 0x4a2222 }));
  hpBar.position.set(0, 1.9, 0); group.add(hpBar); group.userData.hpbar = hpBar;
  group.position.set(mob.x, 0, mob.z); scene.add(group); mobMeshes.set(mob.id, group); updateMob(mob);
}
function updateMob(mob) {
  mobStates.set(mob.id, { ...mob });
  let group = mobMeshes.get(mob.id);
  if (!group && mob.alive) { makeMob(mob); group = mobMeshes.get(mob.id); }
  if (!group) return;
  group.visible = mob.alive;
  if (mob.alive) {
    group.position.set(mob.x, 0, mob.z);
    group.userData.hpbar.scale.x = Math.max(.01, mob.hp / mob.maxHp);
    group.userData.hpbar.position.x = -(1 - mob.hp / mob.maxHp) * .75;
  }
}
function setMyNameTag(name) {
  const oldTag = me.children.find(child => child.isSprite);
  if (oldTag) {
    me.remove(oldTag);
    if (oldTag.material?.map) oldTag.material.map.dispose();
    oldTag.material?.dispose();
  }
  const nameTag = tag(name || 'PLAYER');
  nameTag.position.y = 2.8;
  me.add(nameTag);
}
function addRemote(player) {
  if (!player || player.id === myId || remotes.has(player.id)) return;
  const mesh = avatar(0x8b4d53, `${player.academy || '鳳凰學園'}・${player.name}`); mesh.position.set(player.x, 0, player.z); scene.add(mesh);
  remotes.set(player.id, { mesh, target: new THREE.Vector3(player.x, 0, player.z) });
}
function notice(message) {
  const log = document.getElementById('chatLog'), line = document.createElement('div');
  line.className = 'system'; line.textContent = message; log.appendChild(line); log.scrollTop = log.scrollHeight;
}
function chat(name, message) {
  const log = document.getElementById('chatLog'), line = document.createElement('div'); line.className = 'chatline';
  const bold = document.createElement('b'); bold.textContent = `${name}: `; line.append(bold, document.createTextNode(message)); log.appendChild(line); log.scrollTop = log.scrollHeight;
}
function send(data) { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(data)); }

let pendingStatAllocations = { str:0, agi:0, spi:0, vit:0, end:0 };
let awaitingStatConfirmation = false;

function renderStats(player, drop, message) {
  if (!player) return;
  myPlayer = player;
  const deadOverlay=document.getElementById('deathOverlay');
  deadOverlay.hidden=!player.dead;
  if(player.dead){autoAction=null;keys.clear();}
  document.getElementById('level').textContent = player.level;
  document.getElementById('hpBar').style.width = `${player.hp / player.maxHp * 100}%`;
  document.getElementById('hpText').textContent = `HP ${Math.ceil(player.hp)} / ${player.maxHp}`;
  const mpPercent = player.maxMp ? player.mp / player.maxMp * 100 : 0;
  document.getElementById('mpBar').style.width = `${mpPercent}%`;
  document.getElementById('mpText').textContent = `MP ${player.mp} / ${player.maxMp}`;
  const spPercent=player.maxSp?player.sp/player.maxSp*100:0; document.getElementById('spBar').style.width=`${spPercent}%`; document.getElementById('spText').textContent=`SP ${player.sp} / ${player.maxSp}`;
  renderSkills(player);
  document.getElementById('attackBtn').disabled=!!player.dead||(player.sp??100)<2;
  document.getElementById('expBar').style.width = `${player.exp / (player.level * 100) * 100}%`;
  document.getElementById('expText').textContent = `EXP ${player.exp} / ${player.level * 100}`;
  document.getElementById('statsToggle').classList.toggle('has-stat-points', (player.statPoints || 0) > 0);
  document.getElementById('charName').textContent=player.name||'Student';
  document.getElementById('charJob').textContent=player.jobName||'戰士';
  document.getElementById('charLevel').textContent=player.level;
  const expNeed=player.level*100; document.getElementById('charExpText').textContent=`${player.exp} / ${expNeed}`; document.getElementById('charExpBar').style.width=`${Math.min(100,player.exp/expNeed*100)}%`;
  const charHp=Math.ceil(player.hp), charMaxHp=Math.ceil(player.maxHp);
  const charMp=Math.ceil(player.mp), charMaxMp=Math.ceil(player.maxMp);
  const charSp=Math.ceil(player.sp ?? 100), charMaxSp=Math.ceil(player.maxSp ?? 100);
  document.getElementById('characterCombatStats').innerHTML=`<div><small>攻擊</small><b>${Math.round(player.attack??0)}</b></div><div><small>HP</small><span>${charHp} / ${charMaxHp}</span></div><div><small>防禦</small><b>${Math.round(player.defense??0)}</b></div><div><small>MP</small><span>${charMp} / ${charMaxMp}</span></div><div><small>速度</small><b>${Math.round(player.speed??100)}</b></div><div><small>SP</small><span>${charSp} / ${charMaxSp}</span></div>`;
  renderAttributes(player);
  document.getElementById('bagCount').textContent = `${player.inventory.length} / 24`;
  document.getElementById('taskToggle').classList.toggle('has-task-update', !!(currentQuest && (currentQuest.status==='not_started' || currentQuest.status==='complete')));
  document.getElementById('goldCount').textContent = player.gold ?? 0;
  renderBag(player); renderShop(player); renderHotbar(player);
  if (drop) notice(`獲得物品：[${drop.rarity||'普通'}] ${drop.name}`);
  if (message) notice(message);
}


const localSkillCooldowns = new Map();
function renderSkills(player) {
  const skills=player.skills||[];
  for(let index=0;index<4;index++){
    const button=document.getElementById(`skill${index+1}`); if(!button)continue;
    const skill=skills[index]; button.replaceChildren();
    const k=document.createElement('kbd');k.textContent=String(index+1);
    const icon=document.createElement('span');icon.className='skill-icon';icon.textContent=skill?.icon||['✦','➶','✹','✧'][index];
    const cooldown=document.createElement('span');cooldown.className='skill-cooldown';
    if(skill){const remain=Math.max(0,(localSkillCooldowns.get(skill.id)||0)-Date.now());button.dataset.skillId=skill.id;button.disabled=!!player.dead||player.mp<skill.mp||(player.sp??100)<5||remain>0;cooldown.textContent=remain>0?`${Math.ceil(remain/1000)}`:'';cooldown.classList.toggle('active',remain>0);cooldown.style.setProperty('--cooldown-progress',`${Math.max(0,Math.min(1,remain/(skill.cooldown*1000)))*100}%`);button.dataset.cooldownEnd=String(localSkillCooldowns.get(skill.id)||0);button.dataset.cooldownDuration=String(skill.cooldown*1000);button.title=skill.name||skill.description||'技能';button.onclick=()=>castSkill(index);}
    else{button.disabled=true;delete button.dataset.skillId;button.title='目前沒有技能';}
    button.append(k,icon,cooldown);
  }
}

let autoAction = null;
let currentQuest = null;
function renderQuest(quest,message='') {
  if (!quest) return; currentQuest=quest; updateQuestMarker(quest.status);
  const progress=document.getElementById('questProgress');
  progress.textContent=`${quest.title}：${quest.progress}/${quest.target}　獎勵：${quest.reward}`;
  const text=document.getElementById('questDialogText'); if(message) text.textContent=message;
  document.getElementById('questAccept').hidden=quest.status!=='not_started';
  document.getElementById('questTurnIn').hidden=quest.status!=='complete';
  if(quest.status==='active' && !message) text.textContent='任務進行中：請清除 5 隻校園史萊姆。';
  if(quest.status==='complete' && !message) text.textContent='做得好！任務已完成，回來領取獎勵。';
  if(quest.status==='turned_in' && !message) text.textContent='任務已完成，謝謝你的幫忙！';
  renderTaskJournal(quest);
}
function renderTaskJournal(quest) {
  const list=document.getElementById('taskList');
  if(!list) return;
  document.getElementById('taskToggle')?.classList.toggle('has-task-update', quest.status==='not_started' || quest.status==='complete');
  list.replaceChildren();
  if(quest.status==='not_started') {
    const empty=document.createElement('div'); empty.className='task-empty'; empty.textContent='尚未接取任務。前往學園導師處接取新任務！'; list.appendChild(empty);
  } else {
    const entry=document.createElement('article'); entry.className='task-entry';
    const title=document.createElement('strong'); title.textContent=quest.title;
    const desc=document.createElement('p'); desc.textContent=quest.description || '協助導師清除校園史萊姆。';
    const progress=document.createElement('p'); progress.textContent=`擊倒校園史萊姆：${quest.progress}/${quest.target}`;
    const reward=document.createElement('p'); reward.textContent=`任務獎勵：${quest.reward}`;
    const state=document.createElement('div'); state.className='task-state'+(quest.status==='complete'?' ready':'');
    state.textContent=quest.status==='active'?'進行中':quest.status==='complete'?'已完成・返回 NPC 領取獎勵':'已領取獎勵';
    entry.append(title,desc,progress,reward,state); list.appendChild(entry);
  }
}
function openQuestDialog() { document.getElementById('questPanel').hidden=false; send({type:'npcInteract'}); }
function nearestMob() {
  let best = Infinity, target = null;
  for (const mob of mobStates.values()) {
    if (!mob.alive) continue;
    const distance = Math.hypot(me.position.x - mob.x, me.position.z - mob.z);
    if (distance < best) { best = distance; target = mob; }
  }
  return target;
}
function beginAutoAction(type, index = 0) {
  if (!myPlayer || myPlayer.dead) return;
  const skill = type === 'skill' ? myPlayer.skills?.[index] : null;
  if (type === 'skill' && !skill) return;
  if (skill) {
    const readyAt = localSkillCooldowns.get(skill.id) || 0;
    if (Date.now() < readyAt) return notice(`技能冷卻中，還需 ${((readyAt-Date.now())/1000).toFixed(1)} 秒。`);
    if (myPlayer.mp < skill.mp) return notice(`MP 不足！需要 ${skill.mp} MP。`);
    if ((myPlayer.sp??100) < 5) return notice('SP 不足！技能需要 5 SP。');
  }
  if(type==='attack' && (myPlayer.sp??100)<2) return notice('SP 不足！普通攻擊需要 2 SP。');
  const target = nearestMob();
  if (!target) return notice('附近沒有可攻擊的怪物。');
  const range = skill ? skill.range : ((myPlayer.job==='archer'||myPlayer.job==='mage') ? 14 : 3.2);
  autoAction = { type, index, skillId: skill?.id || null, targetId: target.id, range };
  notice(skill ? `正在接近目標，準備施放 ${skill.name}…` : '正在接近目標，準備攻擊…');
}
function attack() {
  if (attackCd > 0) return;
  beginAutoAction('attack');
}
function castSkill(index) { beginAutoAction('skill', index); }
function useRecovery() {
  if (!myPlayer || myPlayer.dead) return notice('目前不能使用恢復藥水。');
  const hotbar=(myPlayer.hotbar||[]).map(id=>myPlayer.inventory?.find(item=>item.id===id&&item.type==='potion')).filter(Boolean);
  const hpPotion=hotbar.find(item=>item.effect==='hp' && myPlayer.hp<myPlayer.maxHp);
  const mpPotion=hotbar.find(item=>item.effect==='mp' && myPlayer.mp<myPlayer.maxMp);
  const item=hpPotion||mpPotion;
  if (!item) return notice('快捷欄沒有可用的恢復藥水，或 HP／MP 已滿。');
  send({type:'usePotion',itemId:item.id});
}
function pickupHint() {
  notice('物品會在擊倒怪物時自動拾取，並直接放入背包。');
}
function updateSkillCooldowns() {
  document.querySelectorAll('.action-wheel .skill-slot').forEach(button=>{
    const end=Number(button.dataset.cooldownEnd||0), duration=Number(button.dataset.cooldownDuration||0);
    const overlay=button.querySelector('.skill-cooldown'); if(!overlay)return;
    const remain=Math.max(0,end-Date.now());
    overlay.textContent=remain>0?String(Math.ceil(remain/1000)):'';
    overlay.classList.toggle('active',remain>0);
    overlay.style.setProperty('--cooldown-progress',`${duration?Math.max(0,Math.min(100,remain/duration*100)):0}%`);
    if(remain<=0 && button.dataset.skillId && myPlayer && !myPlayer.dead && myPlayer.mp >= Number((myPlayer.skills||[]).find(skill=>skill.id===button.dataset.skillId)?.mp||0) && (myPlayer.sp??100)>=5) button.disabled=false;
  });
}
setInterval(updateSkillCooldowns,100);
function processAutoAction(dt) {
  if (!autoAction) return null;
  const mob = mobStates.get(autoAction.targetId);
  if (!mob || !mob.alive) { autoAction = null; return null; }
  const dx = mob.x - me.position.x, dz = mob.z - me.position.z;
  const distance = Math.hypot(dx, dz);
  const stopDistance = Math.max(1.0, autoAction.range - 0.35);
  if (distance > stopDistance) {
    const direction = new THREE.Vector3(dx, 0, dz).normalize();
    me.position.addScaledVector(direction, 8 * (myPlayer?.speed??100) / 100 * dt);
    me.rotation.y = Math.atan2(direction.x, direction.z);
    me.position.x = THREE.MathUtils.clamp(me.position.x, -42, 42);
    me.position.z = THREE.MathUtils.clamp(me.position.z, -42, 42);
    return true;
  }
  me.rotation.y = Math.atan2(dx, dz);
  // Send the final position before the action; WebSocket preserves message order.
  send({ type: 'move', x: me.position.x, z: me.position.z, yaw: me.rotation.y });
  if (autoAction.type === 'attack') {
    me.userData.ranAnimator?.triggerAttack();
    attackCd = .45;
    send({ type: 'attack' });
  } else {
    const skill = myPlayer?.skills?.[autoAction.index];
    if (skill) {
      me.userData.ranAnimator?.triggerSkill();
      localSkillCooldowns.set(skill.id, Date.now() + skill.cooldown * 1000);
      send({ type: 'skill', skillId: skill.id });
      renderSkills(myPlayer);
    }
  }
  autoAction = null;
  return false;
}

function renderAttributes(player) {
  const names = { str:'力量 STR', agi:'敏捷 AGI', spi:'精神 SPI', vit:'體力 VIT', end:'耐力 END' };
  const descriptions = { str:'增加攻擊、防禦', agi:'增加攻擊、速度', spi:'增加攻擊、速度', vit:'增加最大 HP', end:'增加最大 SP' };
  const list = document.getElementById('attributeList');
  if (!list) return;
  const points = Math.max(0, Number(player.statPoints || 0));
  const pending = Object.values(pendingStatAllocations).reduce((a,b)=>a+b,0);
  document.getElementById('availableStatPoints').textContent = points - pending;
  document.getElementById('confirmStats').disabled = pending < 1 || awaitingStatConfirmation;
  list.replaceChildren();
  const jobDefaults = { warrior:{str:12,agi:5,spi:3,vit:10,end:5}, archer:{str:6,agi:12,spi:5,vit:7,end:4}, fighter:{str:10,agi:9,spi:3,vit:8,end:5}, mage:{str:3,agi:6,spi:14,vit:7,end:3} };
  // Preview all derived combat/resource values without mutating server-backed player data.
  const jobBases = { warrior:{attack:12,defense:7}, archer:{attack:10,defense:4}, fighter:{attack:11,defense:6}, mage:{attack:8,defense:3} };
  const base = jobDefaults[player.job] || jobDefaults.warrior;
  const attrs = Object.fromEntries(['str','agi','spi','vit','end'].map(k=>[k,Number(player.attributes?.[k] ?? base[k])+pendingStatAllocations[k]]));
  const equipment = Object.values(player.equipment||{});
  const sumEquip = key => equipment.reduce((n,item)=>n+Number(item?.[key]||0),0);
  const jobBase = jobBases[player.job] || jobBases.warrior;
  const preview = {
    attack: jobBase.attack + attrs.str + (attrs.agi+attrs.spi)/3 + sumEquip('attack'),
    defense: jobBase.defense + attrs.str + Math.floor(attrs.vit*1.5) + Math.floor(attrs.end*1.5) + sumEquip('defense'),
    speed: 100 + attrs.agi + attrs.spi,
    maxHp: 100 + attrs.vit*5 + sumEquip('hp'),
    maxMp: 80 + attrs.spi*5,
    maxSp: 100 + (attrs.agi+attrs.end)*5
  };
  const previewHp=Math.min(preview.maxHp,Math.ceil(player.hp)+(pendingStatAllocations.vit*5));
  const previewMp=Math.min(preview.maxMp,Math.ceil(player.mp)+(pendingStatAllocations.spi*5));
  const previewSp=Math.min(preview.maxSp,Math.ceil(player.sp??100)+((pendingStatAllocations.agi+pendingStatAllocations.end)*5));
  document.getElementById('characterCombatStats').innerHTML=`<div><small>攻擊</small><b>${Math.round(preview.attack)}</b></div><div><small>HP</small><span>${previewHp} / ${preview.maxHp}</span></div><div><small>防禦</small><b>${Math.round(preview.defense)}</b></div><div><small>MP</small><span>${previewMp} / ${preview.maxMp}</span></div><div><small>速度</small><b>${Math.round(preview.speed)}</b></div><div><small>SP</small><span>${previewSp} / ${preview.maxSp}</span></div>`;
  for (const key of ['str','agi','spi','vit','end']) {
    const row = document.createElement('div'); row.className = 'attribute-row';
    const info=document.createElement('div'); info.className='attribute-info';
    const label = document.createElement('strong'); label.textContent = names[key];
    const desc=document.createElement('small'); desc.textContent=descriptions[key]; desc.className='attribute-description'; info.append(label,desc);
    const total = Math.round(Number(player.attributes?.[key] ?? base[key]));
    const allocated = Math.max(0, Math.round(total - base[key]));
    const value = document.createElement('span'); value.className='attribute-value'; value.textContent = `${total + pendingStatAllocations[key]}`;
    const controls=document.createElement('div'); controls.className='attribute-controls';
    const plus=document.createElement('button'); plus.type='button'; plus.textContent='+'; plus.disabled=points-pending<1 || awaitingStatConfirmation; plus.title=`增加${names[key]}分配`;
    plus.onclick=()=>{if(points-Object.values(pendingStatAllocations).reduce((a,b)=>a+b,0)>0){pendingStatAllocations[key]++;renderAttributes(myPlayer);}};
    const minus=document.createElement('button'); minus.type='button'; minus.textContent='−'; minus.disabled=pendingStatAllocations[key]<1 || awaitingStatConfirmation; minus.title=`減少${names[key]}分配`;
    minus.onclick=()=>{pendingStatAllocations[key]=Math.max(0,pendingStatAllocations[key]-1);renderAttributes(myPlayer);};
    controls.append(plus,minus); row.append(info,value,controls); list.appendChild(row);
  }
}

document.getElementById('confirmStats').addEventListener('click',()=>{
  const allocations={...pendingStatAllocations};
  if(Object.values(allocations).some(n=>n>0) && !awaitingStatConfirmation){awaitingStatConfirmation=true;send({type:'allocateStats',allocations});renderAttributes(myPlayer);}
});

function renderBag(player) {
  const equipment=document.getElementById('equipment'), inventory=document.getElementById('inventory');
  const slots=[['weapon','武器'],['head','頭盔'],['armor','盔甲'],['gloves','手套'],['boots','鞋子']];
  equipment.replaceChildren();
  for(const [key,label] of slots){
    const item=player.equipment?.[key],cell=document.createElement('div'); cell.className='equip-slot';
    const title=document.createElement('b'); title.textContent=label; cell.appendChild(title);
    const name=document.createElement('span'); name.textContent=item?`${item.name}${item.enhanceLevel?` +${item.enhanceLevel}`:''}`:'空'; cell.appendChild(name);
    if(item){const stats=document.createElement('small');stats.textContent=`ATK +${item.attack||0} · DEF +${item.defense||0} · HP +${item.hp||0}`;cell.appendChild(stats);
      const actions=document.createElement('div');actions.className='equip-actions';
      const enhance=document.createElement('button');enhance.type='button';enhance.textContent=`強化 +${item.enhanceLevel||0}`;enhance.onclick=()=>send({type:'enhance',slot:key});actions.appendChild(enhance);
      const remove=document.createElement('button');remove.type='button';remove.textContent='卸下';remove.onclick=()=>send({type:'unequip',slot:key});actions.appendChild(remove);cell.appendChild(actions);cell.classList.add(`rarity-${item.rarity||'普通'}`);}
    equipment.appendChild(cell);
  }
  inventory.replaceChildren();
  if(!player.inventory?.length){const empty=document.createElement('div');empty.className='empty';empty.textContent='背包目前沒有物品。可到交易所購買補給或擊倒怪物取得裝備。';inventory.appendChild(empty);}
  for(const item of (player.inventory||[])){
    const activeBagTab=document.querySelector('[data-bag-tab].active')?.dataset.bagTab||'equipment';
    if(activeBagTab==='equipment' && item.type==='potion') continue; if(activeBagTab==='other' && item.type!=='potion') continue;
    const card=document.createElement('div');card.className=`item-card rarity-${item.rarity||'普通'}`;
    const title=document.createElement('strong');title.textContent=item.name; if(item.type==='potion'){card.draggable=true;card.dataset.potionId=item.id;card.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/potion-id',item.id);e.dataTransfer.effectAllowed='copy';});}
    const detail=document.createElement('small');detail.textContent=item.type==='potion'?`${item.effect==='hp'?'生命':'魔力'}藥水 · 恢復 ${item.amount} · 數量 ${item.quantity||1}`:`${item.rarity||'普通'} · ${item.slot} · ATK +${item.attack||0} · DEF +${item.defense||0} · HP +${item.hp||0} · Lv.${item.requiredLevel||1}`;
    card.append(title,detail);
    const actions=document.createElement('div');actions.className='item-actions';
    if(item.type==='potion'){
      const use=document.createElement('button');use.textContent='使用';use.onclick=()=>send({type:'usePotion',itemId:item.id});actions.appendChild(use);
      const dragHint=document.createElement('small');dragHint.textContent='可拖曳到下方藥水快捷欄';actions.appendChild(dragHint);
    } else {const equip=document.createElement('button');equip.textContent='裝備';equip.onclick=()=>send({type:'equip',itemId:item.id});actions.appendChild(equip);}
    const sellPrice=Number(item.sellPrice)||({普通:40,稀有:120,史詩:350}[item.rarity]||30);const sell=document.createElement('button');sell.textContent=`出售 ${sellPrice}G`;sell.onclick=()=>{if(confirm(`確定出售「${item.name}」，獲得 ${sellPrice} G？`))send({type:'sellItem',itemId:item.id});};actions.appendChild(sell);
    card.appendChild(actions);inventory.appendChild(card);
  }
}
const SHOP_PRODUCTS = [
  ['hp_small','小型生命藥水','恢復 120 HP',80],['hp_large','大型生命藥水','恢復 350 HP',220],['mp_small','小型魔力藥水','恢復 100 MP',80],['mp_large','大型魔力藥水','恢復 300 MP',220],
  ['shop_sword','學園制式長劍','武器 · ATK +10',350],['shop_bow','學園制式弓','武器 · ATK +9',350],['shop_head','學園護額','頭盔 · DEF +3 · HP +20',240],['shop_armor','學園防護外套','盔甲 · DEF +7 · HP +35',480],['shop_gloves','學園訓練手套','手套 · ATK +2 · DEF +3',260],['shop_boots','學園疾走鞋','鞋子 · ATK +1 · DEF +3',260]
];
function renderShop(player){
  const root=document.getElementById('shopCatalog'); if(!root)return;
  const active=document.querySelector('[data-shop-tab].active')?.dataset.shopTab||'equipment';
  root.replaceChildren();
  for(const [id,name,desc,price] of SHOP_PRODUCTS){
    const isGear=id.startsWith('shop_'); if(active==='equipment'&&!isGear)continue; if(active==='other'&&isGear)continue;
    const row=document.createElement('div');row.className='shop-item';const info=document.createElement('div');const title=document.createElement('strong');title.textContent=name;const detail=document.createElement('small');detail.textContent=desc;info.append(title,detail);const buy=document.createElement('button');buy.textContent=`${price} G 購買`;buy.disabled=(player.gold||0)<price||player.inventory.length>=24;buy.onclick=()=>send({type:'buyItem',itemId:id});row.append(info,buy);root.appendChild(row);
  }
  if(!root.children.length){const empty=document.createElement('div');empty.className='empty';empty.textContent='此分類暫時沒有商品。';root.appendChild(empty);}
  document.getElementById('shopGold').textContent=player.gold??0;
}

function renderHotbar(player){
  document.querySelectorAll('.hotbar-slot').forEach((el,index)=>{
    const id=player.hotbar?.[index],item=player.inventory?.find(i=>i.id===id&&i.type==='potion');el.replaceChildren();
    const label=document.createElement('span');label.textContent=item?`${item.name.replace('小型','小').replace('大型','大')} ×${item.quantity||1}`:'拖放藥水';el.append(label);el.classList.toggle('has-item',!!item);
    el.onclick=()=>{if(item)send({type:'usePotion',itemId:item.id});};
    el.ondragover=e=>{e.preventDefault();el.classList.add('drag-over');};
    el.ondragleave=()=>el.classList.remove('drag-over');
    el.ondrop=e=>{e.preventDefault();el.classList.remove('drag-over');const itemId=e.dataTransfer.getData('text/potion-id');if(itemId)send({type:'assignHotbar',slot:index,itemId});};
  });
}

function connect() {
  if (!authToken) return;
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  socket = new WebSocket(`${protocol}://${location.host}?token=${encodeURIComponent(authToken)}`);
  socket.onopen = () => { document.getElementById('connection').textContent = 'ONLINE'; };
  socket.onclose = () => { document.getElementById('connection').textContent = 'RECONNECTING'; setTimeout(connect, 1500); };
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.type === 'welcome') {
      myId = message.id; me.position.set(message.player.x || 0, 0, message.player.z || 3); document.getElementById('playerName').textContent = `${message.player.academy || '鳳凰學園'}・${message.player.name}`; setMyNameTag(`${message.player.academy || '鳳凰學園'}・${message.player.name}`);
      message.state.players.forEach(addRemote); message.state.mobs.forEach(updateMob); renderStats(message.player); const savedQuest=message.player.quests?.campus_slime_hunt || {status:'not_started',progress:0}; renderQuest({id:'campus_slime_hunt',title:'校園清潔任務',description:'協助導師清除 5 隻校園史萊姆。',target:5,progress:savedQuest.progress||0,status:savedQuest.status||'not_started',reward:'150 EXP'});
    }
    if (message.type === 'playerJoined') addRemote(message.player);
    if (message.type === 'playerMoved') {
      if (!remotes.has(message.player.id)) addRemote(message.player);
      const remote = remotes.get(message.player.id); if (remote) remote.target.set(message.player.x, 0, message.player.z);
    }
    if (message.type === 'playerLeft') { const remote = remotes.get(message.id); if (remote) scene.remove(remote.mesh); remotes.delete(message.id); }
    if (message.type === 'mobUpdate') updateMob(message.mob);
    if (message.type === 'questState') renderQuest(message.quest,message.message);
    if (message.type === 'questDialog') { document.getElementById('questPanel').hidden=false; document.getElementById('questNpcTitle').textContent=message.npcName; renderQuest(message.quest,message.message); }
    if (message.type === 'playerStats' && message.player.id === myId) { if(awaitingStatConfirmation){pendingStatAllocations={str:0,agi:0,spi:0,vit:0,end:0};awaitingStatConfirmation=false;} renderStats(message.player, message.drop, message.message); }
    if (message.type === 'playerDeath' && message.player.id === myId) { renderStats(message.player); notice('你已倒下，請等待復活。'); }
    if (message.type === 'playerRespawn' && message.player.id === myId) { me.position.set(message.player.x,0,message.player.z); me.rotation.y=message.player.yaw||0; renderStats(message.player); notice('復活成功！重新投入戰鬥吧。'); }
    if (message.type === 'damageFlash') { const game=document.getElementById('game'); game.classList.remove('damage-flash'); void game.offsetWidth; game.classList.add('damage-flash'); notice(`受到 ${message.damage} 點傷害！`); }
    if (message.type === 'notice') { if(awaitingStatConfirmation){awaitingStatConfirmation=false;renderAttributes(myPlayer);} notice(message.text); }
    if (message.type === 'chat') chat(message.name, message.message);
  };
}
// 0.6.2: keep the auto-approach attack() implementation defined above.
// Do not let game controls intercept typing in login, registration, character,
// chat, or any other editable field.
function isTypingTarget(target) {
  return target instanceof HTMLElement && (
    target.isContentEditable ||
    target.matches('input, textarea, select') ||
    target.closest('[contenteditable="true"]')
  );
}

const utilityPanels = ['statsPanel', 'bagPanel', 'taskPanel', 'shopPanel'];
function toggleUtilityPanel(panelId) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  const opening = panel.hidden;
  const statsWasOpen = !document.getElementById('statsPanel').hidden;
  utilityPanels.forEach(id => { document.getElementById(id).hidden = true; });
  panel.hidden = !opening;
  if (statsWasOpen && (panelId !== 'statsPanel' || !opening)) resetPendingStatDraft();
}

// C / B / Q quickly open the three utility windows. The typing guard above
// keeps these shortcuts from interfering with login, chat, or other fields.
document.addEventListener('keydown', event => {
  if (isTypingTarget(event.target)) return;

  const key = event.key.toLowerCase();
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'c', 'b', 'q', 't'].includes(key)) {
    event.preventDefault();
  }
  if (!event.repeat) {
    if (key === 'c') toggleUtilityPanel('statsPanel');
    if (key === 'b') toggleUtilityPanel('bagPanel');
    if (key === 'q') toggleUtilityPanel('taskPanel');
    if (key === 't') toggleUtilityPanel('shopPanel');

  }
  keys.add(key);
  if (key === ' ') attack();
  if (key === 'e') { if (Math.hypot(me.position.x, me.position.z + 8) <= 4.5) openQuestDialog(); else notice('請走近學園導師（地圖中央偏北）再按 E。'); }
  if (/^[1-4]$/.test(key)) castSkill(Number(key)-1);
});

// Always clear released keys, even if focus moved to an input after keydown.
document.addEventListener('keyup', event => {
  keys.delete(event.key.toLowerCase());
});

// Prevent a held movement key from remaining active when a form field receives focus.
document.addEventListener('focusin', event => {
  if (isTypingTarget(event.target)) keys.clear();
});
window.addEventListener('blur', () => keys.clear());
for (const element of document.querySelectorAll('[data-key]')) {
  const key = element.dataset.key;
  element.addEventListener('pointerdown', event => { event.preventDefault(); keys.add(key); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(type => element.addEventListener(type, () => keys.delete(key)));
}
document.getElementById('attackBtn').onclick = attack;
document.getElementById('questClose').onclick = () => { document.getElementById('questPanel').hidden=true; };
document.getElementById('taskToggle').onclick = () => toggleUtilityPanel('taskPanel');
document.getElementById('shopToggle').onclick = () => toggleUtilityPanel('shopPanel');
document.getElementById('shopClose').onclick = () => { document.getElementById('shopPanel').hidden=true; };
document.getElementById('taskClose').onclick = () => { document.getElementById('taskPanel').hidden=true; };
document.getElementById('questAccept').onclick = () => send({type:'questAccept'});
document.getElementById('questTurnIn').onclick = () => send({type:'questTurnIn'});

document.getElementById('bagToggle').onclick = () => toggleUtilityPanel('bagPanel');
document.querySelectorAll('[data-bag-tab]').forEach(button=>button.onclick=()=>{document.querySelectorAll('[data-bag-tab]').forEach(b=>b.classList.toggle('active',b===button));if(myPlayer)renderBag(myPlayer);});
document.querySelectorAll('[data-shop-tab]').forEach(button=>button.onclick=()=>{document.querySelectorAll('[data-shop-tab]').forEach(b=>b.classList.toggle('active',b===button));if(myPlayer)renderShop(myPlayer);});
document.getElementById('bagClose').onclick = () => { document.getElementById('bagPanel').hidden = true; };
function resetPendingStatDraft(){
  if(awaitingStatConfirmation) return;
  pendingStatAllocations={str:0,agi:0,spi:0,vit:0,end:0};
  if(myPlayer) renderAttributes(myPlayer);
}
document.getElementById('statsToggle').onclick = () => toggleUtilityPanel('statsPanel');
document.getElementById('statsClose').onclick = () => { document.getElementById('statsPanel').hidden = true; resetPendingStatDraft(); };

// Draggable, position-persistent utility windows.
for (const panelId of utilityPanels) {
  const panel = document.getElementById(panelId);
  const header = panel?.querySelector('header');
  if (!panel || !header) continue;
  const storageKey = `project-ran-window-${panelId}`;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
      const x = Math.max(8, Math.min(saved.x, window.innerWidth - panel.offsetWidth - 8));
      const y = Math.max(8, Math.min(saved.y, window.innerHeight - 70));
      panel.style.left = `${x}px`; panel.style.top = `${y}px`;
      panel.style.right = 'auto';
    }
  } catch (_) { /* Ignore unavailable or invalid local storage. */ }

  let moving = false, startX = 0, startY = 0, originX = 0, originY = 0;
  header.addEventListener('pointerdown', event => {
    if (event.target.closest('button')) return;
    moving = true;
    const rect = panel.getBoundingClientRect();
    startX = event.clientX; startY = event.clientY;
    originX = rect.left; originY = rect.top;
    panel.style.left = `${rect.left}px`; panel.style.top = `${rect.top}px`;
    panel.style.right = 'auto';
    header.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  header.addEventListener('pointermove', event => {
    if (!moving) return;
    const maxX = Math.max(8, window.innerWidth - panel.offsetWidth - 8);
    const maxY = Math.max(8, window.innerHeight - 70);
    const x = Math.max(8, Math.min(originX + event.clientX - startX, maxX));
    const y = Math.max(8, Math.min(originY + event.clientY - startY, maxY));
    panel.style.left = `${x}px`; panel.style.top = `${y}px`;
  });
  const stopDragging = () => {
    if (!moving) return;
    moving = false;
    const rect = panel.getBoundingClientRect();
    try { localStorage.setItem(storageKey, JSON.stringify({x: rect.left, y: rect.top})); } catch (_) {}
  };
  header.addEventListener('pointerup', stopDragging);
  header.addEventListener('pointercancel', stopDragging);
}
document.getElementById('chatForm').onsubmit = event => {
  event.preventDefault(); const input = document.getElementById('chatInput'), value = input.value.trim();
  if (value) { send({ type: 'chat', message: value }); input.value = ''; }
};
let drag = false, lastX = 0, lastY = 0;
renderer.domElement.addEventListener('pointerdown', event => { drag = true; lastX = event.clientX; lastY = event.clientY; renderer.domElement.setPointerCapture(event.pointerId); });
renderer.domElement.addEventListener('pointerup', () => drag = false);
renderer.domElement.addEventListener('pointermove', event => {
  if (!drag) return;
  yaw -= (event.clientX - lastX) * .005;
  pitch = THREE.MathUtils.clamp(pitch + (event.clientY - lastY) * .003, -.05, .65);
  lastX = event.clientX; lastY = event.clientY;
});
const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), .05); attackCd = Math.max(0, attackCd - dt);
  if (myPlayer && Math.random() < dt * 2) renderSkills(myPlayer);
  const forward = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
  const side = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
  if (myPlayer?.dead) { keys.clear(); autoAction=null; }
  if (!myPlayer?.dead && (forward || side)) {
    autoAction = null; // Manual movement cancels auto-approach.
    const direction = new THREE.Vector3(side, 0, -forward).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    me.position.addScaledVector(direction, 8 * (myPlayer?.speed??100) / 100 * (keys.has('shift') ? 1.55 : 1) * dt);
    me.position.x = THREE.MathUtils.clamp(me.position.x, -42, 42); me.position.z = THREE.MathUtils.clamp(me.position.z, -42, 42);
    me.rotation.y = Math.atan2(direction.x, direction.z);
  } else if (!myPlayer?.dead && autoAction) {
    processAutoAction(dt);
  }
  const isMoving = !myPlayer?.dead && (!!(forward || side) || !!autoAction);
  me.userData.ranAnimator?.update(isMoving ? (keys.has('shift') && (forward || side) ? 'run' : 'walk') : 'idle', dt);
  const nearMentor = Math.hypot(me.position.x, me.position.z + 8) <= 4.5;
  document.getElementById('npcHint').hidden = !nearMentor || !document.getElementById('questPanel').hidden;
  const target = new THREE.Vector3(me.position.x, 2.2, me.position.z);
  const offset = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch) * 10, 3 + Math.sin(pitch) * 10, Math.cos(yaw) * Math.cos(pitch) * 10);
  camera.position.lerp(target.clone().add(offset), .12); camera.lookAt(target);
  for (const remote of remotes.values()) remote.mesh.position.lerp(remote.target, .18);
  if (!myPlayer?.dead && Date.now() - lastSent > 80) { send({ type: 'move', x: me.position.x, z: me.position.z, yaw: me.rotation.y }); lastSent = Date.now(); }
  if(myPlayer?.dead){const remain=Math.max(0,Math.ceil((myPlayer.respawnAt-Date.now())/1000));document.getElementById('respawnCountdown').textContent=remain;}
  renderer.render(scene, camera);
}
window.onresize = () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); };
function showAuthError(text) { document.getElementById('authError').textContent = text || ''; }
function setAuthMode(register) {
  registerMode = register;
  document.getElementById('authTitle').textContent = register ? '建立帳號' : '登入遊戲';
  document.getElementById('authSubtitle').textContent = register ? '建立你的 PROJECT RAN 帳號' : '歡迎回到鳳凰學園';
  document.getElementById('authSubmit').textContent = register ? '建立帳號' : '登入';
  document.getElementById('authSwitchText').textContent = register ? '已經有帳號？' : '還沒有帳號？';
  document.getElementById('authSwitch').textContent = register ? '返回登入' : '建立帳號';
  document.getElementById('authPassword').autocomplete = register ? 'new-password' : 'current-password';
  showAuthError('');
}
document.getElementById('authSwitch').onclick = () => setAuthMode(!registerMode);
const jobDescriptions = {
  warrior:'戰士：高力量與體力，適合正面近戰。',
  archer:'弓箭部：高敏捷，擅長遠距離弓箭攻擊。',
  fighter:'格鬥家：力量與敏捷兼備，近戰均衡。',
  mage:'氣功部：高精神與遠程能力，擅長遠距離氣功攻擊。'
};
document.getElementById('characterJob').onchange = event => { document.getElementById('jobHint').textContent = jobDescriptions[event.target.value]; };
document.getElementById('authForm').onsubmit = async event => {
  event.preventDefault(); showAuthError('');
  const username = document.getElementById('authUsername').value.trim();
  const password = document.getElementById('authPassword').value;
  const button = document.getElementById('authSubmit'); button.disabled = true; button.textContent = '處理中…';
  try {
    const response = await fetch(registerMode ? '/api/register' : '/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username,password}) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || '操作失敗');
    authToken = data.token; sessionStorage.setItem('projectRanToken', authToken);
    document.getElementById('authScreen').hidden = true;
    if (data.character) enterGame(); else document.getElementById('characterScreen').hidden = false;
  } catch (error) { showAuthError(error.message); }
  finally { button.disabled = false; button.textContent = registerMode ? '建立帳號' : '登入'; }
};
document.getElementById('characterForm').onsubmit = async event => {
  event.preventDefault(); document.getElementById('characterError').textContent = '';
  try {
    const response = await fetch('/api/character', {method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${authToken}`},body:JSON.stringify({name:document.getElementById('characterName').value.trim(),job:document.getElementById('characterJob').value})});
    const data = await response.json(); if (!response.ok) throw new Error(data.error || '建立角色失敗');
    document.getElementById('characterScreen').hidden = true; enterGame();
  } catch(error) { document.getElementById('characterError').textContent = error.message; }
};
document.getElementById('logoutButton').onclick = () => { authToken = null; sessionStorage.removeItem('projectRanToken'); document.getElementById('characterScreen').hidden = true; document.getElementById('authScreen').hidden = false; };
function enterGame() {
  if (gameStarted) return; gameStarted = true;
  document.getElementById('game').classList.remove('game-hidden');
  if (new URLSearchParams(location.search).get('preview') === '1') return;
  connect();
}
loop();

// Static preview mode: opens the real campus scene and the female GLB without
// account creation or a WebSocket server. Combat input still plays the rig pose.
if (new URLSearchParams(location.search).get('preview') === '1') {
  document.getElementById('authScreen').hidden = true;
  document.getElementById('characterScreen').hidden = true;
  me.position.set(0, 0, 3);
  me.rotation.y = Math.PI;
  setMyNameTag('預覽角色');
  document.getElementById('playerName').textContent = '鳳凰學園・預覽角色';
  document.getElementById('connection').textContent = 'PREVIEW';
  const previewPlayer = {
    id:'preview-player', name:'預覽角色', academy:'鳳凰學園',
    job:'warrior', jobName:'戰士', level:1, exp:0,
    hp:100, maxHp:100, mp:80, maxMp:80, sp:100, maxSp:100,
    attack:30, defense:20, speed:100, statPoints:0, gold:1000,
    attributes:{str:12,agi:5,spi:3,vit:10,end:5},
    equipment:{weapon:null,head:null,armor:null,gloves:null,boots:null},
    inventory:[], hotbar:[], skills:[{id:'preview_slash',name:'破空斬',icon:'✦',mp:10,range:8,cooldown:2},{id:'preview_burst',name:'旋風擊',icon:'✹',mp:15,range:8,cooldown:3}], dead:false
  };
  renderStats(previewPlayer);
  renderQuest({id:'campus_slime_hunt',title:'校園清潔任務',description:'測試用訓練目標',target:5,progress:0,status:'not_started',reward:'150 EXP'});
  updateMob({id:'preview-slime',name:'校園史萊姆',type:'slime',level:1,x:0,z:-3,hp:60,maxHp:60,alive:true});
  enterGame();
  notice('預覽模式：WASD 移動、Shift 跑步、空白鍵或攻擊按鈕測試動作。此模式不連接伺服器。');
}
