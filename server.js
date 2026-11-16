const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const WebSocket = require('ws');
const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'accounts.json');

// Local original RAN map access. Set RAN_DATA_ROOT to the installed client's RData folder
// when it is not at the default Windows installation path.
const RAN_DATA_ROOT = process.env.RAN_DATA_ROOT || 'C:\\Program Files (x86)\\XtraVision\\Ran2Online\\General\\RData';
const RAN_MAP_DIR = process.env.RAN_MAP_DIR || path.join(RAN_DATA_ROOT, 'map');
function safeMapFile(name, ext) {
  const base = String(name || '').replace(/\.(wld0?|WLD0?)$/i, '');
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(base)) throw new Error('Invalid map name');
  const file = path.resolve(RAN_MAP_DIR, base + ext);
  if (!file.startsWith(path.resolve(RAN_MAP_DIR) + path.sep)) throw new Error('Invalid map path');
  return file;
}
function readMapCatalog() {
  if (!fs.existsSync(RAN_MAP_DIR)) return { available:false, mapDir:RAN_MAP_DIR, maps:[] };
  const names = new Set();
  for (const file of fs.readdirSync(RAN_MAP_DIR)) {
    const m = file.match(/^(.+)\.wld0?$/i);
    if (m) names.add(m[1]);
  }
  return { available:true, maps:[...names].sort().map(name => ({
    name, wld:fs.existsSync(safeMapFile(name,'.wld')),
    wld0:fs.existsSync(safeMapFile(name,'.wld0'))
  })) };
}

fs.mkdirSync(DATA_DIR, { recursive: true });
let db = { accounts: {} };
try { if (fs.existsSync(DB_FILE)) db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) { console.error('Could not read account database:', e.message); }
const sessions = new Map();
const players = new Map();
const mobs = new Map();
const rand = (a, b) => a + Math.random() * (b - a);
const ITEM_TEMPLATES = {
  普通: [
    { name:'學園練習木劍', slot:'武器', attack:5, defense:0, hp:0 },
    { name:'新生護額', slot:'頭盔', attack:0, defense:2, hp:12 },
    { name:'校園制服外套', slot:'盔甲', attack:0, defense:5, hp:25 },
    { name:'校園護手', slot:'手套', attack:1, defense:3, hp:5 },
    { name:'運動訓練鞋', slot:'鞋子', attack:1, defense:2, hp:8 }
  ],
  稀有: [
    { name:'精製騎士長劍', slot:'武器', attack:12, defense:2, hp:0 },
    { name:'疾風頭盔', slot:'頭盔', attack:2, defense:6, hp:25 },
    { name:'鳳凰守衛鎧甲', slot:'盔甲', attack:1, defense:12, hp:55 },
    { name:'疾風護手', slot:'手套', attack:4, defense:7, hp:18 },
    { name:'迅影戰靴', slot:'鞋子', attack:3, defense:6, hp:20 }
  ],
  史詩: [
    { name:'烈焰斬魂劍', slot:'武器', attack:24, defense:5, hp:0 },
    { name:'龍鱗戰盔', slot:'頭盔', attack:5, defense:13, hp:55 },
    { name:'不滅鳳凰戰甲', slot:'盔甲', attack:3, defense:24, hp:110 },
    { name:'龍鱗戰腕', slot:'手套', attack:9, defense:16, hp:35 },
    { name:'幻影疾行靴', slot:'鞋子', attack:7, defense:13, hp:40 }
  ]
};
const EQUIP_SLOTS = { '武器':'weapon', '頭盔':'head', '盔甲':'armor', '手套':'gloves', '鞋子':'boots' };
const SLOT_LABELS = { weapon:'武器', head:'頭盔', armor:'盔甲', gloves:'手套', boots:'鞋子' };
function saveDb() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}
function verifyPassword(password, record) {
  const test = crypto.scryptSync(password, record.salt, 64);
  const expected = Buffer.from(record.hash, 'hex');
  return expected.length === test.length && crypto.timingSafeEqual(test, expected);
}
function json(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); }
function readBody(req) { return new Promise((resolve, reject) => { let data = ''; req.on('data', chunk => { data += chunk; if (data.length > 8192) { reject(new Error('Request too large')); req.destroy(); } }); req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { reject(new Error('Invalid JSON')); } }); req.on('error', reject); }); }
function tokenFrom(req) { const auth = req.headers.authorization || ''; return auth.startsWith('Bearer ') ? auth.slice(7) : ''; }
function accountForToken(token) { const accountId = sessions.get(token); return accountId ? db.accounts[accountId] : null; }
const ACADEMY_NAME = '鳳凰學園';
const JOBS = {
  warrior: { name: '戰士', attributes: { str: 12, agi: 5, spi: 3, vit: 10, end: 5 }, baseAttack: 12, baseDefense: 7 },
  archer: { name: '弓箭部', attributes: { str: 6, agi: 12, spi: 5, vit: 7, end: 4 }, baseAttack: 10, baseDefense: 4 },
  fighter: { name: '格鬥家', attributes: { str: 10, agi: 9, spi: 3, vit: 8, end: 5 }, baseAttack: 11, baseDefense: 6 },
  mage: { name: '氣功部', attributes: { str: 3, agi: 6, spi: 14, vit: 7, end: 3 }, baseAttack: 8, baseDefense: 3 }
};
const SHOP_CATALOG = [
  { id:'hp_small', name:'小型生命藥水', type:'potion', effect:'hp', amount:120, price:80, sellPrice:25, description:'恢復 120 HP' },
  { id:'hp_large', name:'大型生命藥水', type:'potion', effect:'hp', amount:350, price:220, sellPrice:70, description:'恢復 350 HP' },
  { id:'mp_small', name:'小型魔力藥水', type:'potion', effect:'mp', amount:100, price:80, sellPrice:25, description:'恢復 100 MP' },
  { id:'mp_large', name:'大型魔力藥水', type:'potion', effect:'mp', amount:300, price:220, sellPrice:70, description:'恢復 300 MP' },
  { id:'shop_sword', name:'學園制式長劍', type:'equipment', slot:'武器', attack:10, defense:1, hp:0, price:350, sellPrice:100, requiredLevel:1, rarity:'普通' },
  { id:'shop_bow', name:'學園制式弓', type:'equipment', slot:'武器', attack:9, defense:0, hp:0, price:350, sellPrice:100, requiredLevel:1, rarity:'普通' },
  { id:'shop_head', name:'學園護額', type:'equipment', slot:'頭盔', attack:0, defense:3, hp:20, price:240, sellPrice:70, requiredLevel:1, rarity:'普通' },
  { id:'shop_armor', name:'學園防護外套', type:'equipment', slot:'盔甲', attack:0, defense:7, hp:35, price:480, sellPrice:140, requiredLevel:1, rarity:'普通' },
  { id:'shop_gloves', name:'學園訓練手套', type:'equipment', slot:'手套', attack:2, defense:3, hp:10, price:260, sellPrice:75, requiredLevel:1, rarity:'普通' },
  { id:'shop_boots', name:'學園疾走鞋', type:'equipment', slot:'鞋子', attack:1, defense:3, hp:12, price:260, sellPrice:75, requiredLevel:1, rarity:'普通' }
];
const SHOP_BY_ID = new Map(SHOP_CATALOG.map(item => [item.id,item]));

const SKILLS = {
  warrior: [
    { id:'power_slash', name:'強力斬', mp:15, cooldown:4, range:3.8, multiplier:2.4, description:'近距離強力斬擊' },
    { id:'armor_break', name:'破甲斬', mp:28, cooldown:8, range:4.2, multiplier:3.5, description:'高傷害近戰攻擊' },
    { id:'whirlwind', name:'旋風斬', mp:24, cooldown:6, range:4, multiplier:2.8, description:'旋身斬擊近身敵人' },
    { id:'earth_split', name:'裂地斬', mp:38, cooldown:11, range:4.5, multiplier:4.1, description:'重擊地面造成傷害' },
    { id:'charge', name:'衝鋒斬', mp:20, cooldown:7, range:5, multiplier:2.6, description:'迅速突進斬擊' },
    { id:'guard_break', name:'破防重擊', mp:42, cooldown:14, range:4, multiplier:4.6, description:'強力破防攻擊' },
    { id:'phoenix_blade', name:'鳳凰劍氣', mp:55, cooldown:18, range:7, multiplier:5.2, description:'釋放鳳凰劍氣' },
    { id:'final_blow', name:'終結一擊', mp:70, cooldown:24, range:4.5, multiplier:6, description:'集中力量施展終結技' },
    { id:'meteor_breaker', name:'流星破', mp:48, cooldown:16, range:5, multiplier:4.8, description:'躍起後重擊目標' },
    { id:'phoenix_guard', name:'鳳凰守護', mp:36, cooldown:20, range:4, multiplier:3.2, description:'以守勢反擊近身敵人' }
  ],
  archer: [
    { id:'piercing_shot', name:'穿心箭', mp:18, cooldown:3.5, range:14, multiplier:2.0, description:'遠距離精準射擊' },
    { id:'rapid_shot', name:'連環箭', mp:30, cooldown:8, range:13, multiplier:3.4, description:'快速連續射擊' },
    { id:'multi_shot', name:'多重箭', mp:24, cooldown:6, range:15, multiplier:2.8, description:'同時射出多支箭矢' },
    { id:'explosive_arrow', name:'爆裂箭', mp:38, cooldown:11, range:16, multiplier:4.1, description:'爆炸箭矢遠距離攻擊' },
    { id:'shadow_arrow', name:'影襲箭', mp:20, cooldown:7, range:15, multiplier:2.6, description:'快速射出追蹤箭' },
    { id:'wind_volley', name:'疾風箭雨', mp:42, cooldown:14, range:16, multiplier:4.6, description:'召喚箭雨攻擊' },
    { id:'phoenix_arrow', name:'鳳凰穿雲', mp:55, cooldown:18, range:18, multiplier:5.2, description:'貫穿遠方目標' },
    { id:'deadeye', name:'神射狙擊', mp:70, cooldown:24, range:20, multiplier:6, description:'集中精神狙擊敵人' },
    { id:'starfall_arrow', name:'流星箭雨', mp:48, cooldown:16, range:19, multiplier:4.8, description:'向遠方降下箭雨' },
    { id:'eagle_eye', name:'鷹眼穿透', mp:36, cooldown:12, range:22, multiplier:3.8, description:'鎖定遠距離目標' }
  ],
  fighter: [
    { id:'cyclone_punch', name:'旋風拳', mp:16, cooldown:3.5, range:3.8, multiplier:2.2, description:'近距離連擊' },
    { id:'dragon_rise', name:'升龍擊', mp:29, cooldown:8, range:4.2, multiplier:3.5, description:'強力上段攻擊' },
    { id:'iron_fist', name:'鐵拳連打', mp:24, cooldown:6, range:4, multiplier:2.8, description:'連續拳擊近身敵人' },
    { id:'tiger_roar', name:'猛虎震', mp:38, cooldown:11, range:4.5, multiplier:4.1, description:'爆發氣勢重擊' },
    { id:'rising_kick', name:'旋風腿', mp:20, cooldown:7, range:4, multiplier:2.6, description:'快速迴旋踢擊' },
    { id:'earth_pound', name:'地裂拳', mp:42, cooldown:14, range:4.5, multiplier:4.6, description:'重拳震裂地面' },
    { id:'dragon_fist', name:'龍形拳', mp:55, cooldown:18, range:5, multiplier:5.2, description:'凝聚力量施展龍拳' },
    { id:'limit_break', name:'極限爆發', mp:70, cooldown:24, range:4.5, multiplier:6, description:'全力爆發終結攻擊' },
    { id:'quake_fist', name:'震地拳', mp:48, cooldown:16, range:5, multiplier:4.8, description:'震裂地面重擊敵人' },
    { id:'spirit_combo', name:'靈氣連環', mp:36, cooldown:12, range:4.5, multiplier:3.8, description:'凝聚靈氣連續攻擊' }
  ],
  mage: [
    { id:'fireball', name:'火球術', mp:20, cooldown:4, range:14, multiplier:2.5, description:'遠距離火焰魔法' },
    { id:'ice_lance', name:'冰槍術', mp:34, cooldown:8, range:16, multiplier:3.8, description:'遠距離冰系魔法' },
    { id:'lightning', name:'雷電術', mp:24, cooldown:6, range:15, multiplier:2.8, description:'遠距離雷電攻擊' },
    { id:'frost_nova', name:'冰霜新星', mp:38, cooldown:11, range:14, multiplier:4.1, description:'釋放冰霜能量' },
    { id:'arcane_bolt', name:'秘法飛彈', mp:20, cooldown:7, range:16, multiplier:2.6, description:'快速發射魔法飛彈' },
    { id:'meteor', name:'隕石術', mp:42, cooldown:14, range:18, multiplier:4.6, description:'召喚隕石打擊敵人' },
    { id:'phoenix_flame', name:'鳳凰烈焰', mp:55, cooldown:18, range:18, multiplier:5.2, description:'釋放鳳凰火焰' },
    { id:'arcane_storm', name:'奧術風暴', mp:70, cooldown:24, range:20, multiplier:6, description:'引爆強大的奧術能量' },
    { id:'comet_burst', name:'彗星爆裂', mp:48, cooldown:16, range:21, multiplier:4.8, description:'召喚彗星轟擊目標' },
    { id:'spirit_chain', name:'靈力鎖鏈', mp:36, cooldown:12, range:19, multiplier:3.8, description:'以靈力連鎖打擊敵人' }
  ]
};
function newCharacter(name, job = 'warrior') {
  const selected = JOBS[job] ? job : 'warrior';
  const attributes = { ...JOBS[selected].attributes };
  const maxHp = 100 + attributes.vit * 5;
  const maxMp = 80 + attributes.spi * 5;
  const maxSp = 100 + (attributes.agi + attributes.end) * 5;
  return { name, job: selected, level: 1, exp: 0, hp: maxHp, maxHp, mp: maxMp, maxMp, sp:maxSp, maxSp, statPoints: 0, attributes, x: 0, z: 3, yaw: 0, inventory: [], gold: 500, hotbar:[null,null,null,null], equipment: { weapon:null, head:null, armor:null, gloves:null, boots:null } };
}
function normalizeCharacter(c) {
  if (!Array.isArray(c.inventory)) c.inventory=[];
  c.inventory=c.inventory.map(item=>({...item,rarity:item.rarity||'普通',requiredLevel:item.requiredLevel||1,enhanceLevel:item.enhanceLevel||0,hp:item.hp||0,baseAttack:item.baseAttack??item.attack??0,baseDefense:item.baseDefense??item.defense??0,baseHp:item.baseHp??item.hp??0}));
  if (!c.equipment) c.equipment={};
  // Migrate legacy 1.0 equipment slots without losing equipped items.
  if(c.equipment.hand && !c.equipment.weapon) c.equipment.weapon=c.equipment.hand;
  if(c.equipment.wrist && !c.equipment.gloves) c.equipment.gloves=c.equipment.wrist;
  if(c.equipment.accessory && !c.equipment.head) c.equipment.head=c.equipment.accessory;
  for(const old of ['hand','wrist','accessory']) delete c.equipment[old];
  for(const key of Object.keys(EQUIP_SLOTS).map(k=>EQUIP_SLOTS[k])) {
    const item=c.equipment[key];
    if(item) c.equipment[key]={...item,rarity:item.rarity||'普通',requiredLevel:item.requiredLevel||1,enhanceLevel:item.enhanceLevel||0,hp:item.hp||0,baseAttack:item.baseAttack??item.attack??0,baseDefense:item.baseDefense??item.defense??0,baseHp:item.baseHp??item.hp??0};
    else c.equipment[key]=null;
  }
  if(!Number.isFinite(c.gold)) c.gold=500;
  const attr=c.attributes||JOBS[c.job||'warrior'].attributes;
  const derivedResourceMax={hp:100+(attr.vit||0)*5,mp:80+(attr.spi||0)*5,sp:100+((attr.agi||0)+(attr.end||0))*5};
  c.maxSp=derivedResourceMax.sp; c.sp=Number.isFinite(c.sp)?Math.max(0,Math.min(c.sp,c.maxSp)):c.maxSp;
  if (!c.job || !JOBS[c.job]) c.job = 'warrior';
  if (!c.attributes) c.attributes = { ...JOBS[c.job].attributes };
  c.attributes.spi = c.attributes.spi ?? c.attributes.int ?? JOBS[c.job].attributes.spi;
  c.attributes.end = c.attributes.end ?? 0;
  delete c.attributes.int;
  if (!Array.isArray(c.hotbar)) c.hotbar = [null,null,null,null];
  c.hotbar = [...c.hotbar.slice(0,4),null,null,null,null].slice(0,4);
  if (!Number.isInteger(c.statPoints)) c.statPoints = 0;
  const derived=derivedStats(c);
  c.maxHp = derived.maxHp;
  c.maxMp = derived.maxMp; c.maxSp=derived.maxSp; c.sp=Math.min(c.sp,c.maxSp);
  if (!Number.isFinite(c.hp)) c.hp = c.maxHp;
  if (!Number.isFinite(c.mp)) c.mp = c.maxMp;
  c.mp = Math.max(0, Math.min(c.mp, c.maxMp));
  c.hp = Math.max(0, Math.min(c.hp, c.maxHp));
  return c;
}
function derivedStats(p) {
  const a = p.attributes; const job = JOBS[p.job] || JOBS.warrior;
  return {
    attack: job.baseAttack + a.str + (a.agi + a.spi) / 3 + Object.values(p.equipment||{}).reduce((n,item)=>n+(item?.attack||0),0),
    defense: job.baseDefense + a.str + Math.floor(a.vit * 1.5) + Math.floor((a.end||0) * 1.5) + Object.values(p.equipment||{}).reduce((n,item)=>n+(item?.defense||0),0),
    maxHp: 100 + a.vit * 5 + Object.values(p.equipment||{}).reduce((n,item)=>n+(item?.hp||0),0),
    maxMp: 80 + a.spi * 5,
    maxSp: 100 + (a.agi + (a.end||0)) * 5,
    speed: 100 + a.agi + a.spi
  };
}
function publicCharacter(c) { normalizeCharacter(c); return { name: c.name, job: c.job, level: c.level, exp: c.exp, hp: c.hp, maxHp: c.maxHp, mp:c.mp, maxMp:c.maxMp, statPoints: c.statPoints, attributes: c.attributes, inventory: c.inventory, equipment: c.equipment, hotbar:c.hotbar||[null,null,null,null], gold:c.gold||0, sp:c.sp??100, maxSp:c.maxSp??100, quests:c.quests || {} }; }
function saveCharacter(p) {
  const account = db.accounts[p.accountId]; if (!account) return;
  Object.assign(account.character, { job:p.job, level:p.level, exp:p.exp, hp:p.hp, maxHp:p.maxHp, mp:p.mp, maxMp:p.maxMp, statPoints:p.statPoints, attributes:p.attributes, x:p.x, z:p.z, yaw:p.yaw, inventory:p.inventory, equipment:p.equipment, hotbar:p.hotbar||[null,null,null,null], gold:p.gold||0, sp:p.sp??100, maxSp:p.maxSp??100, quests:p.quests || {} });
  saveDb();
}
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (req.method === 'POST' && ['/api/register','/api/login','/api/character'].includes(pathname)) {
    try {
      const body = await readBody(req);
      if (pathname === '/api/register') {
        const username = String(body.username || '').trim().toLowerCase();
        const password = String(body.password || '');
        if (!/^[a-z0-9_]{3,16}$/.test(username)) return json(res, 400, { error: '帳號需為 3–16 位英數字或底線。' });
        if (password.length < 8 || password.length > 128) return json(res, 400, { error: '密碼長度需為 8–128 位。' });
        if (db.accounts[username]) return json(res, 409, { error: '此帳號已被使用。' });
        const pass = hashPassword(password);
        db.accounts[username] = { username, password: pass, createdAt: Date.now(), character: null };
        saveDb();
        const token = crypto.randomBytes(32).toString('hex'); sessions.set(token, username);
        return json(res, 201, { token, username, character: null });
      }
      if (pathname === '/api/login') {
        const username = String(body.username || '').trim().toLowerCase();
        const account = db.accounts[username];
        if (!account || !verifyPassword(String(body.password || ''), account.password)) return json(res, 401, { error: '帳號或密碼錯誤。' });
        const token = crypto.randomBytes(32).toString('hex'); sessions.set(token, username);
        return json(res, 200, { token, username, character: account.character ? publicCharacter(account.character) : null });
      }
      if (pathname === '/api/character') {
        const account = accountForToken(tokenFrom(req));
        if (!account) return json(res, 401, { error: '登入已失效，請重新登入。' });
        if (account.character) return json(res, 409, { error: '此帳號已建立角色。' });
        const name = String(body.name || '').trim();
        if (!/^[\u4e00-\u9fffA-Za-z0-9_]{2,12}$/.test(name)) return json(res, 400, { error: '角色名稱需為 2–12 個中文字、英文字或數字。' });
        const taken = Object.values(db.accounts).some(a => a.character && a.character.name.toLowerCase() === name.toLowerCase());
        if (taken) return json(res, 409, { error: '角色名稱已有人使用。' });
        const job = String(body.job || 'warrior');
        if (!JOBS[job]) return json(res, 400, { error: '請選擇有效職業。' });
        account.character = newCharacter(name, job); saveDb();
        return json(res, 201, { character: publicCharacter(account.character) });
      }
    } catch (e) { return json(res, 400, { error: e.message || '請求格式錯誤。' }); }
  }

  if (req.method === 'GET' && pathname === '/api/ran-map/catalog') {
    try { return json(res, 200, readMapCatalog()); }
    catch (e) { return json(res, 500, { error:e.message }); }
  }
  if (req.method === 'GET' && pathname === '/api/ran-map/terrain') {
    try {
      const url = new URL(req.url, 'http://localhost');
      const mapName = url.searchParams.get('map') || 'LDG02';
      const summaryOnly = url.searchParams.get('summary') === '1';
      const file = safeMapFile(mapName, '.wld0');
      if (!fs.existsSync(file)) return json(res, 404, { error:'找不到地形檔', file });
      const SM = require('./scripts/ran-map/staticmesh');
      const parsed = SM.parse(fs.readFileSync(file));
      const meshes = [];
      const textureNames = new Set();
      let meshCount = 0, vertices = 0, triangles = 0;
      for (const bucket of parsed.buckets) for (const mesh of bucket.meshes) {
        if (!mesh.octree) continue;
        for (const node of mesh.octree.nodes || []) {
          const g = node.geometry;
          if (!g || !g.vertexCount || !g.indices?.length) continue;
          const textureName = mesh.texName || mesh.key || bucket.name;
          if (mesh.texName) textureNames.add(mesh.texName);
          meshCount++;
          const item = {
            name: textureName,
            bucket: bucket.name,
            positions: Array.from(g.positions),
            indices: Array.from(g.indices),
            uvs: g.uvs ? Array.from(g.uvs) : null,
            colors: g.vbColors ? Array.from(g.vbColors) : null,
            normals: g.vbNormals ? Array.from(g.vbNormals) : null
          };
          if (!summaryOnly) meshes.push(item);
          vertices += g.vertexCount; triangles += g.indices.length / 3;
        }
      }
      if (!meshCount) return json(res, 422, { error:'WLD0 已讀取，但沒有可用三角形地形', map:mapName, version:parsed.version });
      if (summaryOnly) return json(res, 200, { map:mapName, file:path.basename(file), version:parsed.version,
        bounds:{ min:parsed.vMin, max:parsed.vMax }, meshCount, vertices, triangles, textureNames:[...textureNames] });
      return json(res, 200, { map:mapName, file:path.basename(file), version:parsed.version,
        bounds:{ min:parsed.vMin, max:parsed.vMax }, vertices, triangles, meshes });
    } catch (e) { return json(res, 422, { error:e.message }); }
  }

  if (req.method === 'GET' && pathname === '/api/ran-map/texture') {
    try {
      const url = new URL(req.url, 'http://localhost');
      const name = String(url.searchParams.get('name') || '').replace(/\\\\/g, '/');
      if (!name || name.startsWith('/') || /^[A-Za-z]:/.test(name) || name.split('/').some(part => !part || part === '.' || part === '..')) {
        return json(res, 400, { error:'Invalid texture path' });
      }
      if (!/\\.(dds|tga|png|jpe?g|bmp)$/i.test(name)) return json(res, 400, { error:'Unsupported texture format' });
      const roots = ['textures','Textures','texture','Texture','map',''].map(folder => path.resolve(RAN_DATA_ROOT, folder));
      let file = null;
      for (const root of roots) {
        const candidate = path.resolve(root, name);
        if (!candidate.startsWith(root + path.sep)) continue;
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) { file = candidate; break; }
      }
      if (!file) return json(res, 404, { error:'Texture not found', name });
      res.writeHead(200, { 'Content-Type':'application/octet-stream', 'Cache-Control':'public, max-age=3600' });
      return fs.createReadStream(file).pipe(res);
    } catch (e) { return json(res, 400, { error:e.message }); }
  }
  if (pathname.startsWith('/api/')) return json(res, 404, { error: 'API not found' });
  let filePath = pathname === '/' ? path.join(ROOT, 'index.html') : path.resolve(ROOT, '.' + decodeURIComponent(pathname));
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    const ext = path.extname(filePath);
    const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(data);
  });
});
const wss = new WebSocket.Server({ noServer: true });
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://localhost'); const token = url.searchParams.get('token');
  const accountId = token && sessions.get(token); const account = accountId && db.accounts[accountId];
  if (!account || !account.character) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, ws => { ws.accountId = accountId; wss.emit('connection', ws, req); });
});
const MOB_TYPES = {
  slime: { name:'校園史萊姆', family:'slime', color:0x69bd77, hp:70, attack:8, defense:1, exp:35, dropChance:.55, aggroRange:12 },
  red_slime: { name:'赤紅史萊姆', family:'slime', color:0xd66b58, hp:105, attack:13, defense:4, exp:55, dropChance:.68, aggroRange:14 },
  wolf: { name:'荒野狼', family:'beast', color:0x9aabb9, hp:145, attack:18, defense:7, exp:85, dropChance:.72, aggroRange:16 },
  golem: { name:'岩石魔像', family:'construct', color:0x9b8067, hp:260, attack:27, defense:15, exp:140, dropChance:.82, aggroRange:13 }
};
function spawnMob(id, x, z, type='slime', level=1) {
  const base=MOB_TYPES[type] || MOB_TYPES.slime;
  mobs.set(id, { id, type, family:base.family, name:base.name, color:base.color, x, z, homeX:x, homeZ:z,
    hp:base.hp+(level-1)*32, maxHp:base.hp+(level-1)*32, alive:true, respawnAt:0, level,
    attack:base.attack+(level-1)*4, defense:base.defense+(level-1)*2, expReward:base.exp+(level-1)*20,
    dropChance:base.dropChance, aggroRange:base.aggroRange, attackRange:type==='golem'?2.4:1.9,
    attackCooldown:type==='wolf'?1350:(type==='golem'?2300:1800), lastAttackAt:0,
    state:'patrol', patrolAngle:rand(0,Math.PI*2), nextPatrolAt:Date.now()+rand(500,1800) });
}
spawnMob('campus_slime_1',-9,-3,'slime',1);
spawnMob('campus_slime_2',10,5,'red_slime',2);
spawnMob('campus_slime_3',-15,13,'slime',1);
spawnMob('campus_wolf_1',16,-12,'wolf',3);
spawnMob('campus_golem_1',2,19,'golem',4);

function publicPlayer(p) { const derived = derivedStats(p); return { id:p.id, name:p.name, academy:ACADEMY_NAME, job:p.job, jobName:JOBS[p.job]?.name || '戰士', attributes:p.attributes, statPoints:p.statPoints, x:p.x, z:p.z, yaw:p.yaw, hp:p.hp, maxHp:p.maxHp, mp:p.mp, maxMp:p.maxMp, dead:!!p.dead, respawnAt:p.respawnAt||0, level:p.level, exp:p.exp, inventory:p.inventory, equipment:p.equipment, hotbar:p.hotbar||[null,null,null,null], gold:p.gold||0, sp:p.sp??100, maxSp:p.maxSp??100, attack:derived.attack, defense:derived.defense, speed:derived.speed, skills:SKILLS[p.job] || [], quests:p.quests || {} }; }
function snapshot() { return { players:[...players.values()].map(publicPlayer), mobs:[...mobs.values()] }; }
function send(ws,obj) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); }
function broadcast(obj,except) { const data=JSON.stringify(obj); for (const client of wss.clients) if (client!==except && client.readyState===WebSocket.OPEN) client.send(data); }
function notice(ws,text) { send(ws,{type:'notice',text}); }
const QUEST_ID = 'campus_slime_hunt';
function questView(p) {
  const q = p.quests?.[QUEST_ID] || { status:'not_started', progress:0 };
  return { id:QUEST_ID, title:'校園清潔任務', description:'協助導師清除 5 隻校園史萊姆。', target:5, progress:q.progress||0, status:q.status||'not_started', reward:'150 EXP' };
}
function sendQuest(ws,p,message='') { send(ws,{type:'questState',quest:questView(p),message}); }
function progressSlimeQuest(p) {
  const q=p.quests?.[QUEST_ID];
  if(q && q.status==='active') { q.progress=Math.min(5,(q.progress||0)+1); if(q.progress>=5) q.status='complete'; saveCharacter(p); }
}
function gainExp(p,amount) { p.exp+=amount; let needed=p.level*100; while(p.exp>=needed){p.exp-=needed;p.level++;p.statPoints+=3;needed=p.level*100;broadcast({type:'notice',text:`${p.name} 升到 Lv.${p.level}！獲得 3 點屬性點數。`});} }
function makeDrop(mob) {
  if(Math.random()>(mob?.dropChance ?? .55)) return null;
  const roll=Math.random();
  const rarity=roll>.975?'史詩':(roll>.78?'稀有':'普通');
  const pool=ITEM_TEMPLATES[rarity];
  const item=pool[Math.floor(Math.random()*pool.length)];
  const scale=1+Math.max(0,(mob?.level||1)-1)*.12;
  return { id:`item_${Date.now()}_${Math.random().toString(36).slice(2,7)}`, ...item,
    attack:Math.round(item.attack*scale), defense:Math.round(item.defense*scale), hp:Math.round((item.hp||0)*scale), rarity, enhanceLevel:0, baseAttack:Math.round(item.attack*scale), baseDefense:Math.round(item.defense*scale), baseHp:Math.round((item.hp||0)*scale),
    source:mob?.name||'怪物', requiredLevel:Math.max(1,(mob?.level||1)-1) };
}
setInterval(()=>{for(const p of players.values()){if(!p.dead && p.mp<p.maxMp){p.mp=Math.min(p.maxMp,p.mp+5);const account=db.accounts[p.accountId];if(account?.character)account.character.mp=p.mp;for(const client of wss.clients)if(client.pid===p.id)send(client,{type:'playerStats',player:publicPlayer(p)});}}},1000);
// 0.9 monster AI: patrol, acquire nearby players, chase, attack, then leash home.
function sendPlayerStats(p, message='') {
  for (const client of wss.clients) if (client.pid===p.id) send(client,{type:'playerStats',player:publicPlayer(p),message});
}
function broadcastMob(mob) { broadcast({type:'mobUpdate',mob}); }
setInterval(()=>{
  const now=Date.now();
  for(const mob of mobs.values()){
    if(!mob.alive){
      if(now>=mob.respawnAt){mob.alive=true;mob.hp=mob.maxHp;mob.x=mob.homeX;mob.z=mob.homeZ;mob.state='patrol';mob.lastAttackAt=0;broadcastMob(mob);}
      continue;
    }
    let target=null,nearest=mob.aggroRange;
    for(const player of players.values()){
      if(player.dead)continue;
      const d=Math.hypot(player.x-mob.x,player.z-mob.z);
      if(d<nearest){nearest=d;target=player;}
    }
    const homeDistance=Math.hypot(mob.x-mob.homeX,mob.z-mob.homeZ);
    if(target && homeDistance<22){
      mob.state='chase';
      const dx=target.x-mob.x,dz=target.z-mob.z,dist=Math.max(.001,Math.hypot(dx,dz));
      if(dist>mob.attackRange){const step=Math.min(.42,dist-mob.attackRange);mob.x+=dx/dist*step;mob.z+=dz/dist*step;}
      else if(now-mob.lastAttackAt>=mob.attackCooldown){
        mob.lastAttackAt=now;
        const raw=mob.attack+Math.floor(mob.level*1.5);
        const damage=Math.max(1,Math.floor(raw-Math.floor(derivedStats(target).defense*.28)));
        target.hp=Math.max(0,target.hp-damage);
        if(target.hp<=0){target.dead=true;target.respawnAt=now+6000;target.hp=0;target.x=target.x;saveCharacter(target);sendPlayerStats(target,`你被校園史萊姆擊倒了！6 秒後自動復活。`);broadcast({type:'playerDeath',player:publicPlayer(target)});}
        else {saveCharacter(target);sendPlayerStats(target,`${mob.name} Lv.${mob.level} 攻擊你，受到 ${damage} 點傷害！`);}
        for(const client of wss.clients)if(client.pid===target.id)send(client,{type:'damageFlash',damage});
      }
      broadcastMob(mob);
    } else if(homeDistance>1.2){
      mob.state='return';const dx=mob.homeX-mob.x,dz=mob.homeZ-mob.z,dist=Math.max(.001,Math.hypot(dx,dz));const step=Math.min(.28,dist);mob.x+=dx/dist*step;mob.z+=dz/dist*step;broadcastMob(mob);
    } else {
      mob.state='patrol';
      if(now>=mob.nextPatrolAt){mob.patrolAngle+=rand(-1.4,1.4);mob.nextPatrolAt=now+rand(1200,2800);}
      const px=mob.homeX+Math.cos(mob.patrolAngle)*2.5,pz=mob.homeZ+Math.sin(mob.patrolAngle)*2.5;
      const dx=px-mob.x,dz=pz-mob.z,dist=Math.hypot(dx,dz);
      if(dist>.35){mob.x+=dx/dist*.10;mob.z+=dz/dist*.10;broadcastMob(mob);}
    }
  }
  for(const p of players.values()){
    if(p.dead && now>=p.respawnAt){p.dead=false;p.hp=p.maxHp;p.mp=p.maxMp;p.x=0;p.z=3;p.yaw=0;p.respawnAt=0;saveCharacter(p);sendPlayerStats(p,'你已復活！HP、MP 已恢復。');broadcast({type:'playerRespawn',player:publicPlayer(p)});broadcast({type:'playerMoved',player:publicPlayer(p)});}
  }
},200);

wss.on('connection',(ws)=>{
  const account=db.accounts[ws.accountId]; const saved=account.character; const id=ws.accountId;
  normalizeCharacter(saved);
  const p={id,accountId:id,name:saved.name,job:saved.job,attributes:{...saved.attributes},statPoints:saved.statPoints,quests:saved.quests||{},x:saved.x??0,z:saved.z??3,yaw:saved.yaw??0,hp:saved.hp??saved.maxHp,maxHp:saved.maxHp,mp:saved.mp??saved.maxMp??(80+(saved.attributes?.spi||saved.attributes?.int||3)*5),maxMp:saved.maxMp??(80+(saved.attributes?.spi||saved.attributes?.int||3)*5),level:saved.level??1,exp:saved.exp??0,lastAttack:0,cooldowns:{},dead:(saved.hp??saved.maxHp)<=0,respawnAt:0,inventory:saved.inventory||[],gold:saved.gold??500,sp:saved.sp??100,maxSp:saved.maxSp??100,hotbar:saved.hotbar||[null,null,null,null],equipment:saved.equipment||{}}; normalizeCharacter(p); p.maxHp=derivedStats(p).maxHp; p.hp=Math.min(p.hp,p.maxHp);
  if(p.dead){p.respawnAt=Date.now()+5000;}
  players.set(id,p); ws.pid=id; send(ws,{type:'welcome',id,player:publicPlayer(p),state:snapshot()}); sendQuest(ws,p); broadcast({type:'playerJoined',player:publicPlayer(p)},ws);
  let lastSave=0;
  ws.on('message',raw=>{let d;try{d=JSON.parse(raw.toString());}catch{return;}const me=players.get(id);if(!me||!d||typeof d.type!=='string')return;
    if(d.type==='npcInteract') {
      if(Math.hypot(me.x-0,me.z-(-8))>4.5) return notice(ws,'導師距離太遠，請走近一點再按 E。');
      send(ws,{type:'questDialog',quest:questView(me),npcName:'學園導師',message:'同學，學園附近出現了史萊姆。請幫忙清除 5 隻！'});
    }
    if(d.type==='questAccept') {
      if(Math.hypot(me.x,me.z+8)>4.5) return notice(ws,'請走近學園導師再接取任務。');
      const current=questView(me);
      if(current.status==='active') return sendQuest(ws,me,'你已經接取這項任務。');
      if(current.status==='complete') return sendQuest(ws,me,'任務已完成，請領取獎勵。');
      me.quests[QUEST_ID]={status:'active',progress:0}; saveCharacter(me); sendQuest(ws,me,'任務已接取：擊倒 5 隻校園史萊姆！');
    }
    if(d.type==='questTurnIn') {
      if(Math.hypot(me.x,me.z+8)>4.5) return notice(ws,'請走近學園導師再交付任務。');
      const q=questView(me); if(q.status!=='complete') return sendQuest(ws,me,'還未完成任務，繼續努力！');
      me.quests[QUEST_ID]={status:'turned_in',progress:5}; gainExp(me,150); saveCharacter(me); send(ws,{type:'playerStats',player:publicPlayer(me),message:'任務完成！獲得 150 EXP。'}); sendQuest(ws,me,'任務獎勵已領取，感謝你的幫忙！');
    }
    if(d.type==='move'){if(me.dead)return;me.x=Math.max(-42,Math.min(42,Number(d.x)||0));me.z=Math.max(-42,Math.min(42,Number(d.z)||0));me.yaw=Number(d.yaw)||0;broadcast({type:'playerMoved',player:publicPlayer(me)},ws);if(Date.now()-lastSave>5000){saveCharacter(me);lastSave=Date.now();}}
    if(d.type==='attack'){if(me.dead)return notice(ws,'死亡狀態中，請等待復活。');const now=Date.now();if(now-me.lastAttack<450)return;me.lastAttack=now;if((me.sp??0)<2)return notice(ws,'SP 不足！普通攻擊需要 2 SP。');let target=null,best=(me.job==='archer'||me.job==='mage')?14:3.2;for(const mob of mobs.values()){if(!mob.alive)continue;const dist=Math.hypot(me.x-mob.x,me.z-mob.z);if(dist<best){best=dist;target=mob;}}if(!target){notice(ws,'附近沒有可攻擊的怪物，請靠近怪物！');return;}me.sp-=2;const dealt=Math.max(1,Math.floor(derivedStats(me).attack+Math.floor(me.level*2)-(target.defense||0)));target.hp=Math.max(0,target.hp-dealt);if(target.hp===0){target.alive=false;target.respawnAt=Date.now()+8000;gainExp(me,target.expReward||35);me.gold=(me.gold||0)+15+(target.level||1)*8;if(target.family==='slime')progressSlimeQuest(me);sendQuest(ws,me);const drop=makeDrop(target);if(drop&&me.inventory.length<24)me.inventory.push(drop);else if(drop)notice(ws,'背包已滿，物品沒有拾取成功！');saveCharacter(me);broadcast({type:'mobUpdate',mob:target});send(ws,{type:'playerStats',player:publicPlayer(me),drop});broadcast({type:'notice',text:`${me.name} 擊倒了 ${target.name} Lv.${target.level}！獲得 ${target.expReward||35} EXP。`});}else {broadcast({type:'mobUpdate',mob:target});saveCharacter(me);send(ws,{type:'playerStats',player:publicPlayer(me)});}}
    if(d.type==='skill'){
      if(me.dead)return notice(ws,'死亡狀態中，請等待復活。');
      const skill=(SKILLS[me.job]||[]).find(item=>item.id===String(d.skillId||''));
      if(!skill) return notice(ws,'此職業不能使用這項技能。');
      const now=Date.now(); const readyAt=me.cooldowns[skill.id]||0;
      if(now<readyAt) return notice(ws,`技能冷卻中，還需 ${((readyAt-now)/1000).toFixed(1)} 秒。`);
      if(me.mp<skill.mp) return notice(ws,`MP 不足！需要 ${skill.mp} MP。`);
      if((me.sp??0)<5) return notice(ws,'SP 不足！施放技能需要 5 SP。');
      let target=null,best=skill.range;
      for(const mob of mobs.values()){if(!mob.alive)continue;const dist=Math.hypot(me.x-mob.x,me.z-mob.z);if(dist<best){best=dist;target=mob;}}
      if(!target) return notice(ws,`技能距離 ${skill.range}，附近沒有可攻擊的怪物。`);
      me.mp-=skill.mp; me.sp-=5; me.cooldowns[skill.id]=now+skill.cooldown*1000;
      const damage=Math.max(1,Math.floor((derivedStats(me).attack+Math.floor(me.level*2))*skill.multiplier)-(target.defense||0));
      target.hp=Math.max(0,target.hp-damage);
      if(target.hp===0){target.alive=false;target.respawnAt=now+8000;gainExp(me,target.expReward||35);me.gold=(me.gold||0)+15+(target.level||1)*8;if(target.family==='slime')progressSlimeQuest(me);sendQuest(ws,me);const drop=makeDrop(target);if(drop&&me.inventory.length<24)me.inventory.push(drop);else if(drop)notice(ws,'背包已滿，物品沒有拾取成功！');saveCharacter(me);broadcast({type:'mobUpdate',mob:target});send(ws,{type:'playerStats',player:publicPlayer(me),drop,message:`${skill.name} 命中！造成 ${damage} 傷害，擊倒 ${target.name}！`});broadcast({type:'notice',text:`${me.name} 使用 ${skill.name} 擊倒了 ${target.name} Lv.${target.level}！`});}
      else {broadcast({type:'mobUpdate',mob:target});saveCharacter(me);send(ws,{type:'playerStats',player:publicPlayer(me),message:`${skill.name} 命中！造成 ${damage} 傷害。`});}
    }
    if(d.type==='equip'){
      const item=me.inventory.find(i=>i.id===d.itemId); if(!item)return notice(ws,'找不到這件物品。');
      const slot=EQUIP_SLOTS[item.slot]; if(!slot)return notice(ws,'這件物品不能裝備。');
      if(me.level<(item.requiredLevel||1))return notice(ws,`需要角色 Lv.${item.requiredLevel||1} 才能裝備。`);
      const old=me.equipment[slot]; me.inventory=me.inventory.filter(i=>i.id!==item.id); if(old)me.inventory.push(old);
      me.equipment[slot]=item; const oldMax=me.maxHp; me.maxHp=derivedStats(me).maxHp; me.hp=Math.min(me.maxHp,me.hp+Math.max(0,me.maxHp-oldMax));
      saveCharacter(me); send(ws,{type:'playerStats',player:publicPlayer(me),message:`已裝備：${item.name}`}); broadcast({type:'playerMoved',player:publicPlayer(me)},ws);
    }
    if(d.type==='unequip'){
      const slot=['weapon','head','armor','gloves','boots'].includes(d.slot)?d.slot:null;
      if(!slot||!me.equipment[slot])return; if(me.inventory.length>=24)return notice(ws,'背包已滿，無法卸下裝備。');
      const item=me.equipment[slot]; me.equipment[slot]=null; me.inventory.push(item); const oldMax=me.maxHp; me.maxHp=derivedStats(me).maxHp; me.hp=Math.min(me.hp,me.maxHp);
      saveCharacter(me); send(ws,{type:'playerStats',player:publicPlayer(me),message:`已卸下：${item.name}`});
    }
    if(d.type==='enhance'){
      const slot=['weapon','head','armor','gloves','boots'].includes(d.slot)?d.slot:null;
      const item=slot?me.equipment[slot]:null; if(!item)return notice(ws,'該裝備欄沒有物品。');
      const level=item.enhanceLevel||0; if(level>=10)return notice(ws,'裝備已達最高強化 +10。');
      const cost=100*(level+1)*(level+1); if((me.gold||0)<cost)return notice(ws,`金幣不足！強化需要 ${cost} 金幣。`);
      me.gold-=cost; item.enhanceLevel=level+1; item.attack=(item.baseAttack||0)+Math.ceil((item.baseAttack||0)*.08)*item.enhanceLevel;
      item.defense=(item.baseDefense||0)+Math.ceil((item.baseDefense||0)*.08)*item.enhanceLevel;
      item.hp=(item.baseHp||0)+Math.ceil((item.baseHp||0)*.08)*item.enhanceLevel;
      const oldMax=me.maxHp; me.maxHp=derivedStats(me).maxHp; me.hp=Math.min(me.maxHp,me.hp+Math.max(0,me.maxHp-oldMax));
      saveCharacter(me); send(ws,{type:'playerStats',player:publicPlayer(me),message:`${item.name} 強化成功！目前 +${item.enhanceLevel}。`});
    }
    if(d.type==='buyItem'){
      const product=SHOP_BY_ID.get(String(d.itemId||'')); if(!product)return notice(ws,'找不到這件商品。');
      if(me.gold<product.price)return notice(ws,`金幣不足！需要 ${product.price} G。`);
      if(me.inventory.length>=24)return notice(ws,'背包已滿，無法購買。');
      me.gold-=product.price;
      if(product.type==='potion'){
        const existing=me.inventory.find(i=>i.type==='potion'&&i.shopId===product.id);
        if(existing) existing.quantity=(existing.quantity||1)+1;
        else me.inventory.push({id:`potion_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,shopId:product.id,name:product.name,type:'potion',effect:product.effect,amount:product.amount,quantity:1,sellPrice:product.sellPrice});
      } else {
        const item={...product,id:`gear_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,baseAttack:product.attack||0,baseDefense:product.defense||0,baseHp:product.hp||0,enhanceLevel:0}; delete item.price;
        me.inventory.push(item);
      }
      saveCharacter(me); send(ws,{type:'playerStats',player:publicPlayer(me),message:`購買成功：${product.name}`});
    }
    if(d.type==='sellItem'){
      const item=me.inventory.find(i=>i.id===d.itemId); if(!item)return notice(ws,'背包找不到這件物品。');
      const price=Math.max(1,Number(item.sellPrice)||({普通:40,稀有:120,史詩:350}[item.rarity]||30));
      if(item.type==='potion'&&(item.quantity||1)>1)item.quantity--;
      else me.inventory=me.inventory.filter(i=>i.id!==item.id);
      me.gold+=price; me.hotbar=(me.hotbar||[]).map(id=>id===item.id?null:id);
      saveCharacter(me); send(ws,{type:'playerStats',player:publicPlayer(me),message:`出售成功：${item.name}，獲得 ${price} G。`});
    }
    if(d.type==='usePotion'){
      const item=me.inventory.find(i=>i.id===d.itemId&&i.type==='potion'); if(!item)return notice(ws,'快捷欄中的藥水已不存在。');
      if(me.dead)return notice(ws,'倒地時不能使用藥水。');
      const field=item.effect==='mp'?'mp':'hp',maxField=field==='mp'?'maxMp':'maxHp';
      if(me[field]>=me[maxField])return notice(ws,`${field==='hp'?'HP':'MP'} 已滿，不需要使用藥水。`);
      const restored=Math.min(item.amount||0,me[maxField]-me[field]); me[field]+=restored;
      if((item.quantity||1)>1)item.quantity--;else{me.inventory=me.inventory.filter(i=>i.id!==item.id);me.hotbar=(me.hotbar||[]).map(id=>id===item.id?null:id);}
      saveCharacter(me); send(ws,{type:'playerStats',player:publicPlayer(me),message:`使用 ${item.name}，恢復 ${restored} ${field.toUpperCase()}。`});
    }
    if(d.type==='assignHotbar'){
      const slot=Number(d.slot),item=me.inventory.find(i=>i.id===d.itemId&&i.type==='potion');
      if(!Number.isInteger(slot)||slot<0||slot>3)return notice(ws,'快捷欄位置無效。');
      if(d.itemId&&!item)return notice(ws,'只能把藥水放入快捷欄。');
      me.hotbar=me.hotbar||[null,null,null,null]; me.hotbar[slot]=item?item.id:null;
      saveCharacter(me); send(ws,{type:'playerStats',player:publicPlayer(me),message:item?`${item.name} 已放到快捷欄 ${slot+1}。`:`已清空快捷欄 ${slot+1}。`});
    }
    if(d.type==='allocateStat'){
      const allowed=['str','agi','spi','vit','end']; const stat=String(d.stat||'');
      if(!allowed.includes(stat)) return notice(ws,'無效的屬性項目。');
      if(me.statPoints<1) return notice(ws,'沒有可用的屬性點數。');
      me.statPoints--; me.attributes[stat]++;
      const derived=derivedStats(me); me.maxHp=derived.maxHp; me.maxMp=derived.maxMp; me.maxSp=derived.maxSp;
      if(stat==='vit'){me.hp=Math.min(me.maxHp,me.hp+5);}
      if(stat==='spi'){me.mp=Math.min(me.maxMp,me.mp+5);}
      if(stat==='agi'||stat==='end'){me.sp=Math.min(me.maxSp,me.sp+5);}
      saveCharacter(me); send(ws,{type:'playerStats',player:publicPlayer(me),message:`${({str:'力量',agi:'敏捷',spi:'精神',vit:'體力',end:'耐力'})[stat]}提升 1 點。`});
    }
    if(d.type==='allocateStats'){
      const allowed=['str','agi','spi','vit','end']; const allocations=d.allocations||{};
      const entries=Object.entries(allocations);
      if(entries.some(([stat,n])=>!allowed.includes(stat)||!Number.isInteger(n)||n<0)||entries.reduce((sum,[,n])=>sum+n,0)<1) return notice(ws,'屬性分配資料無效。');
      const total=entries.reduce((sum,[,n])=>sum+n,0);
      if(total>me.statPoints) return notice(ws,'可用點數不足，請重新分配。');
      for(const [stat,n] of entries) me.attributes[stat]=(me.attributes[stat]||0)+n;
      me.statPoints-=total;
      const derived=derivedStats(me); me.maxHp=derived.maxHp; me.maxMp=derived.maxMp; me.maxSp=derived.maxSp;
      me.hp=Math.min(me.maxHp,me.hp+(allocations.vit||0)*5);
      me.mp=Math.min(me.maxMp,me.mp+(allocations.spi||0)*5);
      me.sp=Math.min(me.maxSp,me.sp+((allocations.agi||0)+(allocations.end||0))*5);
      saveCharacter(me); send(ws,{type:'playerStats',player:publicPlayer(me),message:`已確認分配 ${total} 點屬性。`});
    }
    if(d.type==='chat'){const message=String(d.message||'').trim().slice(0,120);if(message)broadcast({type:'chat',name:me.name,message});}
  });
  ws.on('close',()=>{saveCharacter(p);players.delete(id);broadcast({type:'playerLeft',id});});
});
setInterval(()=>{for(const p of players.values()){if(p.dead)continue;const max=derivedStats(p).maxSp;p.maxSp=max;if((p.sp??0)<max){p.sp=Math.min(max,(p.sp??0)+2);saveCharacter(p);for(const client of wss.clients){if(client.accountId===p.accountId)send(client,{type:'playerStats',player:publicPlayer(p)});}}}},1000);
server.listen(PORT,()=>console.log(`PROJECT RAN 1.2.6 running at http://localhost:${PORT}`));
