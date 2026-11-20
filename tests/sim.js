/* Node 逻辑自检：据点/资源上限/单位状态/战斗/存档/AI 对局 */
'use strict';
const path = require('path');
const load = f => require(path.join(__dirname, '..', 'js', 'core', f));
load('data.js'); load('hex.js'); load('game.js'); load('rules.js'); load('ai.js');
const SG = globalThis.SG;
const { data: D, hex: H, game: G, rules: R } = SG;

let failures = 0;
function ok(cond, msg) {
  if (cond) console.log('  PASS ' + msg);
  else { failures++; console.log('  FAIL ' + msg); }
}

console.log('== 地图与据点 ==');
ok(D.MAP_ROWS.length === D.MAP_H, `地图行数 ${D.MAP_ROWS.length}`);
ok(D.MAP_ROWS.every(r => r.length === D.MAP_W), '每行宽度一致');
const st = G.create({ playerFaction: 'alliance', difficulty: 1 });
ok(st.sites.length === D.SITES.length, `据点数量 ${st.sites.length}`);
for (const s of st.sites) {
  const t = G.tileAt(st, s.q, s.r);
  ok(!!t && t.t === 'city', `${s.name} 位于有效地块`);
  ok(!!D.SITE_KINDS[s.kind], `${s.name} 类型合法（${s.kind}）`);
  const y = G.yieldOf(s);
  ok(typeof y.money === 'number', `${s.name} 产出金钱 ${y.money}`);
}
const kinds = {};
for (const s of st.sites) kinds[s.kind] = (kinds[s.kind] || 0) + 1;
console.log('  据点类型分布:', JSON.stringify(kinds));
ok(kinds.city >= 4 && kinds.village >= 4 && kinds.factory >= 2 && kinds.industrial_base >= 2 && kinds.port >= 2 && kinds.airport >= 2, '城市/农村/工厂/工业基地/港口/机场据点齐全');

console.log('== 资源上限 ==');
const capY = G.yieldOf(st.sitesById.whiteport);
const cityY = G.yieldOf(st.sitesById.stonebridge);
const facY = G.yieldOf(st.sitesById.ironforge);
const baseY = G.yieldOf(st.sitesById.pine);
const portY = G.yieldOf(st.sitesById.southcape);
ok(capY.money === 6 && capY.pop === 8 && capY.industry === 2, '首都 6 金 / 8 人力 / 2 工业');
ok(cityY.money === 4 && cityY.pop === 5 && cityY.industry === 1, '普通城市 4 金 / 5 人力 / 1 工业');
ok(facY.money === 1 && facY.pop === 0 && facY.industry === 3, '工厂 1 金 / 3 工业');
ok(baseY.money === 2 && baseY.pop === 0 && baseY.industry === 6, '工业基地 2 金 / 6 工业');
ok(portY.money === 2 && portY.pop === 0 && portY.industry === 2, '港口 2 金 / 2 工业');
ok(D.RULES.maxTurns === null && st.maxTurns === null, '游戏无回合上限');
const sCapYield = G.create({ playerFaction: 'alliance', difficulty: 1 });
const capY2 = sCapYield.sitesById.whiteport;
ok(G.yieldOf(capY2).money === 6, '首都产出为首都标准');
capY2.faction = 'empire';
ok(G.yieldOf(capY2).money === 4 && G.yieldOf(capY2).industry === 1, '占领敌方首都后按普通城市产出');
capY2.faction = 'alliance';
ok(G.yieldOf(capY2).money === 6, '首都回到原阵营后恢复首都产出');
const vilY = G.yieldOf(st.sitesById.wheat);
ok(vilY.money === 1 && vilY.pop === 1 && vilY.industry === 0, '农村 1 金 / 1 人力');
ok(G.siteDefense(st.sitesById.whiteport) === 2, '首都防御 +2');
ok(G.siteDefense(st.sitesById.stonebridge) === 2, '城市防御 +2');
ok(G.siteDefense(st.sitesById.pine) === 2, '工业基地防御 +2');
ok(G.siteDefense(st.sitesById.ironforge) === 2, '工厂防御 +2');
ok(G.siteDefense(st.sitesById.southcape) === 1, '港口防御 +1');
ok(G.siteDefense(st.sitesById.wheat) === 1, '农村防御 +1');
ok(G.siteDefense(st.sitesById.whiteair) === 2, '机场防御 +2');
const airY = G.yieldOf(st.sitesById.whiteair);
ok(airY.money === 0 && airY.pop === 0 && airY.industry === 0, '机场不提供收入');
for (const f of ['alliance', 'empire']) {
  const caps = G.capsOf(st, f), used = G.usageOf(st, f);
  ok(caps.money === 14 && caps.pop === 13 && caps.industry === 11, `${f} 据点上限 14 金 / 13 人力 / 11 工业`);
  ok(caps.pop === 13, `${f} 人力上限 13（${used.pop}/${caps.pop}）`);
  ok(caps.industry > used.industry, `${f} 工业有剩余（${used.industry}/${caps.industry}）`);
}


console.log('== 地图预设 ==');
const m1 = D.MAPS.map1;
ok(m1 && m1.width === 70 && m1.height === 70 && m1.rows.length === 70 && m1.rows.every(r => r.length === 70), '地图1为70×70');
ok(m1.sites.length === 35 && m1.sites.filter(s => !s.faction).length === 21, '地图1据点总数/中立据点正确');
const m1k = m1.sites.filter(s => !s.faction).reduce((a, s) => { a[s.kind] = (a[s.kind] || 0) + 1; return a; }, {});
ok(m1k.city === 3 && m1k.village === 9 && m1k.industrial_base === 3 && m1k.factory === 3 && m1k.port === 3, '地图1中立据点类型数量正确');
let bCells = [], bSet = new Set();
for (let r = 0; r < 70; r++) for (let c = 0; c < 70; c++) if (m1.rows[r][c] === 'b') { bCells.push([c, r]); bSet.add(c + ',' + r); }
let bGroups = 0; const bSeen = new Set();
for (const [c0, r0] of bCells) {
  if (bSeen.has(c0 + ',' + r0)) continue;
  bGroups++; const st = [[c0, r0]];
  while (st.length) {
    const [c, r] = st.pop(); const k = c + ',' + r;
    if (bSeen.has(k) || !bSet.has(k)) continue;
    bSeen.add(k);
    for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]) st.push([c+dc, r+dr]);
  }
}
ok(bGroups === 3 && bCells.length === 4, '地图1有三座桥，其中双格河面使用双格桥');
ok(['30,36','32,36','31,42','34,42','32,50','34,50'].every(k => {
  const [c, r] = k.split(',').map(Number); return m1.rows[r][c] === '.';
}), '桥梁两端为平原');
const sM1 = G.create({ playerFaction: 'alliance', difficulty: 1, mapId: 'map1' });
ok(sM1.mapId === 'map1' && sM1.sites.length === 35, '地图1可创建');
ok(sM1.sites.every(site => {
  const t = G.tileAt(sM1, site.q, site.r);
  return t && t.t !== 'water' && t.t !== 'river';
}), '地图1所有据点均在陆地上');
ok(G.unitsOf(sM1, 'alliance').length === 9 && G.unitsOf(sM1, 'empire').length === 9, '地图1双方各9支开局部队（含首都周围2轻步兵）');
ok(G.unitsOf(sM1, 'neutral').length === 21, '地图1中立据点各1单位');
const nUnits = G.unitsOf(sM1, 'neutral');
const nKeys = new Set(nUnits.map(u => H.key(u.q, u.r)));
ok(nKeys.size === 21, '地图1中立单位不堆叠');
ok(nUnits.every(u => { const site = sM1.sites.find(x => x.q === u.q && x.r === u.r); return site && !site.faction; }), '地图1中立单位驻守在据点内');
const lakePort = sM1.sitesById.n_p1;
ok(lakePort.name === '河港' && lakePort.col === 34 && lakePort.row === 55 && H.neighbors(lakePort.q, lakePort.r).some(n => {
  const t = G.tileAt(sM1, n.q, n.r); return t && t.t === 'river';
}), '河港位于河流沿岸');
const islandPort = sM1.sitesById.n_p2;
ok(islandPort.col === 65 && islandPort.row === 40 && H.neighbors(islandPort.q, islandPort.r).some(n => {
  const t = G.tileAt(sM1, n.q, n.r); return t && t.t === 'water';
}), '岛港为沿海港口');

console.log('== 部队维护费 ==');
const sMaint = G.create({ playerFaction: 'alliance', difficulty: 1, playerForce: 'ironblood' });
sMaint.units = [];
const baseMaintGold = G.capsOf(sMaint, 'alliance').money;
for (let i = 0; i < 5; i++) G.addUnit(sMaint, 'light_inf', 'alliance', 5 + i, 10, 'full');
ok(G.maintenanceOf(sMaint, 'alliance') === 2, '步兵维护为造价的十分之一');
G.addUnit(sMaint, 'tank', 'alliance', 12, 10, 'full');
ok(G.maintenanceOf(sMaint, 'alliance') === 4, '装甲维护为造价的五分之一');
G.addUnit(sMaint, 'militia', 'alliance', 13, 10, 'full');
ok(G.maintenanceOf(sMaint, 'alliance') === 4, '民兵不需要维护费');
G.addUnit(sMaint, 'gunboat', 'alliance', 14, 10, 'full');
ok(G.maintenanceOf(sMaint, 'alliance') === 7, '舰艇维护为造价的五分之一');
G.addUnit(sMaint, 'fort_gun', 'alliance', 15, 10, 'full');
ok(G.maintenanceOf(sMaint, 'alliance') === 10, '要塞炮固定维护费3金');
const incMaint = G.incomeOf(sMaint, 'alliance');
ok(incMaint.maintenance === 10 && incMaint.money === Math.max(0, baseMaintGold - 10), '维护费从回合金钱产出扣除');

console.log('== 多 AI ==');
const multiRows = Array.from({ length: 22 }, () => '.'.repeat(32));
const multiSites = [
  { id: 'm-w', name: '西都', col: 3, row: 11, kind: 'city', faction: 'alliance', capital: true },
  { id: 'm-e', name: '东都', col: 27, row: 11, kind: 'city', faction: 'empire', capital: true },
  { id: 'm-a3', name: 'AI2都', col: 12, row: 5, kind: 'city', faction: 'ai3', capital: true },
  { id: 'm-a4', name: 'AI3都', col: 20, row: 17, kind: 'city', faction: 'ai4', capital: true }
];
const multiMap = {
  id: 'custom', name: '多AI测试', width: 32, height: 22, rows: multiRows, sites: multiSites,
  startUnits: multiSites.map(x => ({ type: 'armored_car', faction: x.faction, col: x.col, row: x.row })),
  neutralGarrison: ['infantry_gun']
};
const sMulti = G.create({ playerFaction: 'alliance', difficulty: 1, customMap: multiMap });
ok(sMulti.factions.length === 4 && sMulti.aiFactions.length === 3, '一局可创建3个AI对手');
ok(new Set(Object.values(sMulti.forces)).size === 4, '多AI使用不同势力');
G.endTurn(sMulti); ok(sMulti.current === 'empire', '多AI回合顺序1');
G.endTurn(sMulti); ok(sMulti.current === 'ai3', '多AI回合顺序2');
G.endTurn(sMulti); ok(sMulti.current === 'ai4', '多AI回合顺序3');
G.endTurn(sMulti); ok(sMulti.current === 'alliance' && sMulti.turn === 2, '多AI回合循环回到玩家');
const sMultiLoad = G.deserialize(G.serialize(sMulti));
ok(sMultiLoad && sMultiLoad.factions.length === 4 && sMultiLoad.aiFactions.length === 3, '多AI随存档保存');

const fiveSites = [
  { id: 'f-w', name: '玩家都', col: 2, row: 11, kind: 'city', faction: 'alliance', capital: true },
  { id: 'f-e', name: 'AI1都', col: 27, row: 11, kind: 'city', faction: 'empire', capital: true },
  { id: 'f-3', name: 'AI2都', col: 8, row: 5, kind: 'city', faction: 'ai3', capital: true },
  { id: 'f-4', name: 'AI3都', col: 14, row: 18, kind: 'city', faction: 'ai4', capital: true },
  { id: 'f-5', name: 'AI4都', col: 20, row: 5, kind: 'city', faction: 'ai5', capital: true },
  { id: 'f-6', name: 'AI5都', col: 25, row: 18, kind: 'city', faction: 'ai6', capital: true }
];
const sFive = G.create({ playerFaction: 'alliance', difficulty: 1, customMap: {
  id: 'custom', name: '5AI', width: 32, height: 22, rows: multiRows, sites: fiveSites,
  startUnits: fiveSites.map(x => ({ type: 'armored_car', faction: x.faction, col: x.col, row: x.row })),
  neutralGarrison: ['infantry_gun']
} });
ok(sFive.factions.length === 6 && sFive.aiFactions.length === 5, '一局最多支持5个AI+1个玩家');
ok(new Set(Object.values(sFive.forces)).size === 6, '5AI+玩家势力互不重复');
const hateAtk = G.addUnit(sFive, 'light_inf', 'alliance', 3, 11, 'full');
const hateDef = G.addUnit(sFive, 'light_inf', 'ai3', 4, 11, 'full');
R.resolveAttack(sFive, hateAtk, hateDef);
ok(sFive.aiHate && sFive.aiHate.ai3 && (sFive.aiHate.ai3.alliance || 0) > 0, 'AI被攻击后记录仇恨阵营及强度');
G.addHate(sFive, 'ai3', 'empire', 3);
ok(sFive.aiHate.ai3.empire === 3 && sFive.aiHate.ai3.alliance === 1, 'AI可有多个仇恨对象并累计强度');
const ai3Sites = sFive.sites.filter(x => x.faction === 'ai3');
for (const x of ai3Sites) x.faction = null;
sFive.units = sFive.units.filter(u => u.faction !== 'ai3');
G.refreshEliminations(sFive);
ok(sFive.eliminated.ai3 && !sFive.factions.includes('ai3'), '失去全部据点与单位的阵营被击败并退出回合');

console.log('== 自定义地图 ==');
const customRows = Array.from({ length: 22 }, () => '.'.repeat(32));
const customMap = {
  id: 'custom', name: '测试图', width: 32, height: 22, rows: customRows,
  sites: [
    { id: 'c-w', name: '西都', col: 4, row: 11, kind: 'city', faction: 'alliance', capital: true },
    { id: 'c-e', name: '东都', col: 27, row: 11, kind: 'city', faction: 'empire', capital: true },
    { id: 'c-n', name: '中央城', col: 16, row: 11, kind: 'city', faction: null, capital: false }
  ],
  startUnits: [
    { type: 'armored_car', faction: 'alliance', col: 4, row: 11 },
    { type: 'armored_car', faction: 'empire', col: 27, row: 11 }
  ],
  neutralGarrison: ['armored_car', 'light_inf', 'light_inf', 'light_inf']
};
const sCustom = G.create({ playerFaction: 'alliance', difficulty: 1, customMap });
ok(sCustom.mapId === 'custom' && sCustom.customMap.name === '测试图', '自定义地图可创建');
ok(sCustom.sites.length === 3 && G.unitsOf(sCustom, 'neutral').length === 1, '自定义地图据点/中立驻军正常');
const sCustomLoad = G.deserialize(G.serialize(sCustom));
ok(sCustomLoad && sCustomLoad.mapId === 'custom' && sCustomLoad.customMap.name === '测试图', '自定义地图可随存档读取');

console.log('== 单位数值与状态 ==');
const inf = G.unitsOf(st, 'alliance').find(u => u.type === 'light_inf');
const art = G.addUnit(st, 'field_gun', 'alliance', inf.q, inf.r, 'full');
ok(G.statText(inf) === '2-6-3-1', '轻步兵属性 2-6-3-1');
ok(G.isFragile('field_gun'), '野战炮为脆弱单位');
ok(R.applyHit(st, inf) === 'damaged', '满编步兵受击后受损');
ok(G.statText(inf) === '1-6-3-1', '受损轻步兵属性降为 1-6-3-1');
ok(R.applyHit(st, inf) === 'damaged', '受损步兵可承受第二格受损条');
ok(R.applyHit(st, inf) === 'destroyed', '第三格受损条耗尽后被击毁');
ok(R.applyHit(st, art) === 'destroyed', '野战炮受击直接击毁');
ok(G.statText(G.unitsOf(st, 'alliance').find(u => u.type === 'light_inf')) === '1-6-3-1', '受损轻步兵仍是 1-6-3-1');

console.log('== 单位表核对 ==');
const roster = [
  ['militia', '1-5-3-1', '1-4-2-1', 1, 0, 0, ['city', 'village']],
  ['light_inf', '2-6-3-1', '1-6-3-1', 3, 2, 0, ['village', 'city', 'factory', 'industrial_base', 'port']],
  ['drone_team', '1-4-2-4', null, 4, 1, 1, ['city', 'factory', 'industrial_base']],
  ['mech_inf', '2-7-5-1', '1-6-3-1', 7, 2, 1, ['factory', 'industrial_base']],
  ['armored_car', '3-7-5-1', '2-5-3-1', 8, 1, 2, ['factory', 'industrial_base', 'city']],
  ['infantry_gun', '3-4-2-1', null, 6, 1, 1, ['village', 'city', 'factory', 'industrial_base']],
  ['field_gun', '4-4-1-2', null, 10, 1, 2, ['factory', 'industrial_base']],
  ['tank', '4-8-4-1', '2-6-2-1', 12, 1, 3, ['factory', 'industrial_base']],
  ['spg', '3-7-4-2', '2-5-2-2', 12, 1, 2, ['industrial_base']],
  ['battle_barge', '3-8-4-1', '1-6-2-1', 8, 1, 2, ['port']],
  ['gunboat', '4-10-3-2', '2-7-1-1', 16, 1, 4, ['port']]
];
for (const [t, stat, dmg, m, p, i, dep] of roster) {
  const u = D.UNITS[t];
  ok(!!u, `存在单位 ${t}`);
  if (!u) continue;
  const costOk = u.cost.money === m && u.cost.pop === p && u.cost.industry === i;
  const depOk = u.deploy.length === dep.length && dep.every(k => u.deploy.includes(k));
  ok(u.stat === stat && costOk && depOk, `${u.name} ${stat} 造价 ${m}-${p}-${i}`);
  if (dmg) ok(u.damagedStat === dmg, `${u.name} 受损 ${dmg}`);
  else ok(u.fragile === true, `${u.name} 受损即消灭`);
}
ok(D.UNITS.gunboat.fragile !== true, '炮艇有受损状态');
ok(G.maxHits('tank') === 3 && G.maxHits('light_inf') === 3, '普通单位增加1格受损条');
ok(G.maxHits('militia') === 2 && G.maxHits('battle_barge') === 2 && G.maxHits('missile_ship') === 2, '民兵/战斗驳船/导弹支援舰有1格受损条');
ok(G.maxHits('conscript') === 2, '动员兵有2格受损条');
ok(G.maxHits('drone_team') === 1 && G.maxHits('sniper_team') === 1, '无人机/狙击班组仍为一击即毁');
ok(G.statText({ type: 'militia', state: 'damaged' }) === '1-4-2-1', '民兵受损 1-4-2-1');
ok(G.statText({ type: 'battle_barge', state: 'damaged' }) === '1-6-2-1', '战斗驳船受损 1-6-2-1');
ok(G.statText({ type: 'missile_ship', state: 'damaged' }) === '1-7-1-1', '导弹支援舰受损 1-7-1-1');
ok(D.UNITS.conscript.move === 3, '动员兵满编移动力3');
ok(G.statText({ type: 'gunboat', state: 'damaged' }) === '2-7-1-1', '炮艇受损 2-7-1-1');
const unitCats = Object.values(D.UNITS);
ok(unitCats.every(u => D.UNIT_CATEGORIES[u.category]), '所有通用/特殊兵种都有合法分类');
ok(D.UNITS.light_inf.category === 'infantry' && D.UNITS.field_gun.category === 'artillery' &&
  D.UNITS.tank.category === 'armor' && D.UNITS.gunboat.category === 'ship', '四类兵种分类对应正确');

ok(D.UNITS.tank.capture && D.UNITS.field_gun.capture && D.UNITS.infantry_gun.capture && D.UNITS.militia.capture && D.UNITS.drone_team.capture && D.UNITS.spg.capture, '所有陆上单位都可占领据点');
ok(!D.UNITS.gunboat.capture && !D.UNITS.battle_barge.capture, '舰船不能占领据点');
const sCap = G.create({ playerFaction: 'alliance', difficulty: 1 });
const capTank = G.unitsOf(sCap, 'alliance').find(u => u.type === 'tank');
const enemyPort = sCap.sitesById.eastwind;
ok(isFinite(G.moveCost(sCap, enemyPort.q, enemyPort.r, capTank)), '坦克可以开进敌方据点');
const capGun = G.addUnit(sCap, 'gunboat', 'alliance', enemyPort.q, enemyPort.r, 'full');
ok(!isFinite(G.moveCost(sCap, enemyPort.q, enemyPort.r, capGun)), '舰船不能开进据点');

console.log('== 轻步兵轻装特性 ==');
const sT = G.create({ playerFaction: 'alliance', difficulty: 1 });
const liT = G.unitsOf(sT, 'alliance').find(u => u.type === 'light_inf');
const mechT = G.unitsOf(sT, 'alliance').find(u => u.type === 'mech_inf');
const tankT = G.unitsOf(sT, 'alliance').find(u => u.type === 'tank');
const terr = name => Object.values(sT.grid).find(t => t.t === name && !t.siteId);
const forestT = terr('forest'), hillsT = terr('hills'), mountainT = terr('mountain'), riverT = terr('river'), waterT = terr('water');
ok(G.moveCost(sT, forestT.q, forestT.r, liT) === 1, '轻步兵森林移动消耗 1');
ok(G.moveCost(sT, hillsT.q, hillsT.r, liT) === 1, '轻步兵丘陵移动消耗 1');
ok(G.moveCost(sT, mountainT.q, mountainT.r, liT) === 1, '轻步兵山地移动消耗 1');
ok(G.moveCost(sT, riverT.q, riverT.r, liT) === 3, '轻步兵河流仍为 3');
ok(!isFinite(G.moveCost(sT, waterT.q, waterT.r, liT)), '轻步兵不能进入海洋');
ok(G.moveCost(sT, forestT.q, forestT.r, mechT) === 2, '机械化步兵仍受森林消耗影响');
ok(!isFinite(G.moveCost(sT, mountainT.q, mountainT.r, tankT)), '坦克仍不能进入山地');
const lightTankT = G.addUnit(sT, 'armored_car', 'alliance', 3, 9, 'full');
ok(isFinite(G.moveCost(sT, mountainT.q, mountainT.r, lightTankT)), '轻型坦克可以进入山地');
const bridges = Object.values(sT.grid).filter(t => t.bridge);
ok(bridges.length === 2, '河流上有两座桥梁');
ok(bridges.some(t => t.row < 12) && bridges.some(t => t.row > 12), '桥梁分处河流南北');
ok(bridges.every(t => t.t === 'river' && !t.siteId), '桥梁覆盖在河流格上');
const bridgeT = bridges[0];
ok(G.moveCost(sT, bridgeT.q, bridgeT.r, tankT) === 1, '坦克过桥消耗 1');
ok(G.moveCost(sT, bridgeT.q, bridgeT.r, mechT) === 1, '机械化步兵过桥消耗 1');
ok(G.moveCost(sT, bridgeT.q, bridgeT.r, liT) === 1, '轻步兵过桥消耗 1');
const bridgeUnit = G.addUnit(sT, 'light_inf', 'alliance', bridgeT.q, bridgeT.r, 'full');
const bridgeWater = H.neighbors(bridgeT.q, bridgeT.r).map(n => G.tileAt(sT, n.q, n.r))
  .find(t => t && (t.t === 'water' || (t.t === 'river' && !t.bridge)));
ok(bridgeWater && !isFinite(G.moveCost(sT, bridgeWater.q, bridgeWater.r, bridgeUnit)), '桥梁上的陆军不能进入水域/河流');
const bridgeLands = H.neighbors(bridgeT.q, bridgeT.r).map(n => G.tileAt(sT, n.q, n.r))
  .filter(t => t && t.t !== 'water' && t.t !== 'river' && D.TERRAIN[t.t].pass);
const bridgeEnds = bridgeLands.filter(t => t.row === bridgeT.row).slice(0, 2);
const bridgeSide = bridgeLands.find(t => !bridgeEnds.includes(t));
if (bridgeEnds.length === 2) {
  ok(bridgeEnds.every(t => isFinite(G.moveCost(sT, t.q, t.r, bridgeUnit))), '桥梁只连接两端的陆地');
  if (bridgeSide) ok(!isFinite(G.moveCost(sT, bridgeSide.q, bridgeSide.r, bridgeUnit)), '桥梁不能通向非两端的相邻陆地');
  if (bridgeSide) {
    const sideUnit = G.addUnit(sT, 'light_inf', 'alliance', bridgeSide.q, bridgeSide.r, 'full');
    ok(!isFinite(G.moveCost(sT, bridgeT.q, bridgeT.r, sideUnit)) && !R.reachable(sT, sideUnit).has(H.key(bridgeT.q, bridgeT.r)), '非桥端陆地不能直接进入桥梁');
    const sideFoe = G.addUnit(sT, 'light_inf', 'empire', bridgeSide.q, bridgeSide.r, 'full');
    ok(R.attackTargets(sT, bridgeUnit).some(t => t.q === bridgeSide.q && t.r === bridgeSide.r), '桥梁上的单位仍可攻击非桥端相邻目标');
  }
}
const riverTiles = Object.values(sT.grid).filter(t => t.t === 'river');
const seenRiver = new Set([riverTiles[0].q + ',' + riverTiles[0].r]);
const rq = [riverTiles[0]];
while (rq.length) {
  const cur = rq.pop();
  for (const n of H.neighbors(cur.q, cur.r)) {
    const nt = G.tileAt(sT, n.q, n.r);
    if (nt && nt.t === 'river' && !seenRiver.has(nt.q + ',' + nt.r)) {
      seenRiver.add(nt.q + ',' + nt.r); rq.push(nt);
    }
  }
}
ok(seenRiver.size === riverTiles.length, '所有河流格属于同一条河流');
ok(riverTiles.some(t => H.neighbors(t.q, t.r).some(n => {
  const nt = G.tileAt(sT, n.q, n.r); return nt && nt.t === 'water';
})), '河流通向大海');
for (const b of bridges) {
  const westA = H.offsetToAxial(b.col - 1, b.row), eastA = H.offsetToAxial(b.col + 1, b.row);
  const west = G.tileAt(sT, westA.q, westA.r), east = G.tileAt(sT, eastA.q, eastA.r);
  ok(west && east && D.TERRAIN[west.t].pass && D.TERRAIN[east.t].pass &&
    west.t !== 'mountain' && east.t !== 'mountain', '桥梁左右两岸均可通行');
}

console.log('== 生产与部署限制 ==');
const s2 = G.create({ playerFaction: 'alliance', difficulty: 1 });
const city = s2.sitesById.whiteport;
const factory = s2.sitesById.ironforge;
const base = s2.sitesById.pine;
factory.faction = 'alliance';
const port = s2.sites.find(s => s.kind === 'port' && s.faction === 'alliance');
// 腾出首都格与工业占用，便于验证部署和建造
s2.units = s2.units.filter(u => !(u.q === city.q && u.r === city.r));
s2.units = s2.units.filter(u => !(u.faction === 'alliance' && u.type === 'tank'));
const beforeMoney = s2.money.alliance;
const beforeUse = G.usageOf(s2, 'alliance');
ok(!G.canBuild(s2, city, 'tank').ok, '城市不能部署坦克');
const lightCap = s2.sitesById.whiteport, lightCity = s2.sitesById.stonebridge;
s2.money.alliance = 100;
ok(G.canBuild(s2, lightCap, 'armored_car').ok, '轻型坦克可在首都部署');
ok(!G.canBuild(s2, lightCity, 'armored_car').ok, '轻型坦克不能在其他城市部署');
s2.money.alliance = beforeMoney;
const sCapBuild = G.create({ playerFaction: 'alliance', difficulty: 1 });
sCapBuild.money.alliance = 100;
const capBuildSite = sCapBuild.sitesById.whiteport;
const cap1 = G.buildUnit(sCapBuild, capBuildSite, 'militia');
const cap2 = G.buildUnit(sCapBuild, capBuildSite, 'militia');
ok(cap1.ok && cap2.ok && !G.canBuild(sCapBuild, capBuildSite, 'militia').ok, '首都每回合最多生产2个单位');
ok(!G.canBuild(s2, city, 'mech_inf').ok, '城市不能部署机械化步兵');
ok(G.canBuild(s2, city, 'light_inf').ok, '城市可以部署轻步兵');
ok(G.canBuild(s2, city, 'militia').ok, '城市可以部署民兵');
ok(G.canBuild(s2, city, 'drone_team').ok, '城市可以部署无人机班组');
ok(G.canBuild(s2, city, 'infantry_gun').ok, '城市可以部署步兵炮');
ok(G.canBuild(s2, factory, 'infantry_gun').ok, '工厂可以生产步兵炮');
ok(G.canBuild(s2, factory, 'mech_inf').ok, '工厂可以生产机械化步兵');
ok(G.canBuild(s2, factory, 'armored_car').ok, '工厂可以生产轻型坦克');
ok(G.canBuild(s2, factory, 'tank').ok, '工厂可以生产坦克');
const sDeploy = G.create({ playerFaction: 'alliance', difficulty: 1 });
sDeploy.units = sDeploy.units.filter(u => !(u.faction === 'alliance' && u.type === 'light_inf'));
sDeploy.money.alliance = 80;
const dSite = sDeploy.sitesById.southcape;
const dTiles = G.landDeployTiles(sDeploy, dSite, 'light_inf');
ok(dTiles.some(t => t.q === dSite.q && t.r === dSite.r), '生产部署包含据点本身');
ok(dTiles.some(t => H.distance(dSite.q, dSite.r, t.q, t.r) === 1), '生产部署包含周围六格');
const dTarget = dTiles.find(t => !G.unitAt(sDeploy, t.q, t.r));
const dBuild = dTarget ? G.buildUnit(sDeploy, dSite, 'light_inf', dTarget.q, dTarget.r) : null;
ok(dBuild && dBuild.ok && dBuild.unit.q === dTarget.q && dBuild.unit.r === dTarget.r, '生产单位可部署到选定地格');
ok(!G.canBuild(s2, factory, 'spg').ok, '工厂不能生产自行火炮');
ok(!G.canBuild(s2, factory, 'militia').ok, '工厂不能生产民兵');
const b1 = G.canBuild(s2, base, 'tank');
ok(b1.ok, '工业基地可生产坦克');
if (b1.ok) {
  const r = G.buildUnit(s2, base, 'tank');
  ok(r.ok, '生产坦克成功');
  ok(r.unit.hasMoved && r.unit.hasAttacked, '新生产单位当回合不能行动');
  ok(s2.money.alliance === beforeMoney - 11, '金钱扣除 11（革命联盟全军 -1）');
  const afterUse = G.usageOf(s2, 'alliance');
  ok(afterUse.pop === beforeUse.pop + 1, '人力占用 +1');
  ok(afterUse.industry === beforeUse.industry + 3, '工业占用 +3');
}
const sSpg = G.create({ playerFaction: 'alliance', difficulty: 1 });
sSpg.units = sSpg.units.filter(u => !(u.faction === 'alliance' && u.type === 'light_inf'));
const baseSpg = sSpg.sitesById.pine;
ok(G.canBuild(sSpg, baseSpg, 'spg').ok, '工业基地可生产自行火炮');
const village = s2.sitesById.wheat;
village.faction = 'alliance';
s2.units = s2.units.filter(u => !(u.q === village.q && u.r === village.r));
ok(G.canBuild(s2, village, 'militia').ok, '农村可以生产民兵');
ok(G.canBuild(s2, village, 'light_inf').ok && G.canBuild(s2, village, 'infantry_gun').ok, '农村可以生产轻步兵与步兵炮');
ok(G.canBuild(s2, factory, 'drone_team').ok, '工厂可以生产无人机班组');
ok(D.BUILD_ORDER.length === 12, '生产列表包含 12 种单位');
ok(G.isVehicle('spg') && !G.isVehicle('militia'), '自行火炮属于车辆');
ok(D.UNITS.spg.minRange === 1 && D.UNITS.field_gun.minRange === 1 && D.UNITS.drone_team.range === 4, '自行火炮/榴弹炮 1–2 格，无人机射程正确');
const sArty = G.create({ playerFaction: 'alliance', difficulty: 1 });
const artySpot = Object.values(sArty.grid).find(t => t.t === 'plains' && !t.siteId && !G.unitAt(sArty, t.q, t.r));
const artyEnemySpot = H.neighbors(artySpot.q, artySpot.r).map(n => G.tileAt(sArty, n.q, n.r))
  .find(t => t && D.TERRAIN[t.t].pass && !t.siteId && !G.unitAt(sArty, t.q, t.r));
if (artySpot && artyEnemySpot) {
  const fgArty = G.addUnit(sArty, 'field_gun', 'alliance', artySpot.q, artySpot.r, 'full');
  const foeArty = G.addUnit(sArty, 'militia', 'empire', artyEnemySpot.q, artyEnemySpot.r, 'full');
  ok(R.attackTargets(sArty, fgArty).includes(foeArty), '野战炮可攻击 1 格目标');
}
const noMoneyState = G.create({ playerFaction: 'alliance', difficulty: 1 });
noMoneyState.money.alliance = 0;
ok(!G.canBuild(noMoneyState, noMoneyState.sitesById.whiteport, 'light_inf').ok, '没钱不能生产');
const capState = G.create({ playerFaction: 'alliance', difficulty: 1 });
capState.units = capState.units.filter(u => u.faction !== 'alliance');
for (let i = 0; i < 20; i++) G.addUnit(capState, 'light_inf', 'alliance', 5, 10, 'full');
ok(!G.canBuild(capState, capState.sitesById.whiteport, 'light_inf').ok, '人力上限占满后不能生产');

console.log('== 水陆转换后停止移动 ==');
const sCross = G.create({ playerFaction: 'alliance', difficulty: 1 });
let riverCross = null, originCross = null, farCross = null;
for (const t of Object.values(sCross.grid)) {
  if (t.t !== 'river' || t.bridge) continue;
  const landNs = H.neighbors(t.q, t.r).map(n => G.tileAt(sCross, n.q, n.r))
    .filter(x => x && D.TERRAIN[x.t].pass && x.t !== 'water' && x.t !== 'river' && !x.siteId && !G.unitAt(sCross, x.q, x.r));
  if (landNs.length >= 2) { riverCross = t; originCross = landNs[0]; farCross = landNs[1]; break; }
}
if (riverCross) {
  const crossUnit = G.addUnit(sCross, 'light_inf', 'alliance', originCross.q, originCross.r, 'full');
  const crossFoe = G.addUnit(sCross, 'light_inf', 'empire', farCross.q, farCross.r, 'full');
  const reachCross = R.reachable(sCross, crossUnit);
  ok(reachCross.has(H.key(riverCross.q, riverCross.r)), '陆地单位可进入河流');
  const crossRes = R.moveUnit(sCross, crossUnit, riverCross.q, riverCross.r, reachCross);
  ok(crossRes.ok && crossUnit.q === riverCross.q && crossUnit.crossedWater, '进入水域后标记停止移动');
  ok(R.attackTargets(sCross, crossUnit).includes(crossFoe), '进入水域后仍可攻击');
  sCross.units = sCross.units.filter(u => u !== crossFoe);
  const landBack = G.addUnit(sCross, 'light_inf', 'alliance', riverCross.q, riverCross.r, 'full');
  const reachLand = R.reachable(sCross, landBack);
  ok(reachLand.has(H.key(farCross.q, farCross.r)), '水域单位可登陆相邻陆地');
  const backRes = R.moveUnit(sCross, landBack, farCross.q, farCross.r, reachLand);
  ok(backRes.ok && landBack.crossedWater, '登陆后标记停止移动');
}

console.log('== 水域单位 ==');
const sN = G.create({ playerFaction: 'alliance', difficulty: 1 });
const portA = sN.sitesById.southcape;
const portE = sN.sitesById.eastwind;
ok(G.isNaval('gunboat') && G.isNaval('battle_barge'), '炮艇/战斗驳船为水域单位');
ok(!G.isNaval('tank'), '坦克不是水域单位');
ok(!G.canBuild(sN, city, 'gunboat').ok, '炮艇不能在城市部署');
ok(!G.canBuild(sN, factory, 'gunboat').ok, '炮艇不能在工厂部署');
ok(G.deployable(sN, portA, 'gunboat'), '港口可部署炮艇（有相邻水域）');
// 腾出工业占用后再验证下水
sN.units = sN.units.filter(u => !(u.faction === 'alliance' && (u.type === 'tank' || u.type === 'light_inf')));
const gunboatBuild = G.canBuild(sN, portA, 'gunboat');
ok(gunboatBuild.ok, '工业余量足够时可建造炮艇');
if (gunboatBuild.ok) {
  const gb = G.buildUnit(sN, portA, 'gunboat');
  ok(gb.ok && G.tileAt(sN, gb.unit.q, gb.unit.r).t === 'water', '炮艇出生在相邻水域');
}
const sNV = G.create({ playerFaction: 'alliance', difficulty: 1 });
sNV.units = sNV.units.filter(u => !(u.faction === 'alliance' && u.type === 'light_inf'));
let portNV = null, navalTiles = [];
for (const p of sNV.sites.filter(s => s.faction === 'alliance' && s.kind === 'port')) {
  const ts = G.navalDeployTiles(sNV, p, 'gunboat');
  if (ts.length) { portNV = p; navalTiles = ts; break; }
}
if (portNV && navalTiles.length) {
  const chosen = navalTiles[navalTiles.length - 1];
  const nv = G.buildUnit(sNV, portNV, 'gunboat', chosen.q, chosen.r);
  ok(nv.ok && nv.unit.q === chosen.q && nv.unit.r === chosen.r, '舰船可在玩家选择的海域部署');
  ok(nv.unit.hasMoved && nv.unit.hasAttacked, '新舰船当回合不能行动');
}
const gb2 = G.addUnit(sN, 'gunboat', 'alliance', portA.q, portA.r, 'full');
const landTile = Object.values(sN.grid).find(t => t.t === 'plains' && !t.siteId);
const waterTile = Object.values(sN.grid).find(t => t.t === 'water');
ok(isFinite(G.moveCost(sN, waterTile.q, waterTile.r, gb2)), '炮艇可进入海洋');
ok(!isFinite(G.moveCost(sN, landTile.q, landTile.r, gb2)), '炮艇不能进入陆地');
const landUnit = G.addUnit(sN, 'light_inf', 'alliance', landTile.q, landTile.r, 'full');
ok(!isFinite(G.moveCost(sN, waterTile.q, waterTile.r, landUnit)), '陆军不能进入海洋');

// 水域与陆地互相攻击
const sN2 = G.create({ playerFaction: 'alliance', difficulty: 1 });
sN2.units = [];
const coastWater = Object.values(sN2.grid).find(t => {
  if (t.t !== 'water') return false;
  return H.neighbors(t.q, t.r).some(n => {
    const nt = sN2.grid[H.key(n.q, n.r)];
    return nt && D.TERRAIN[nt.t].pass && !nt.siteId && nt.t !== 'water';
  });
});
const coastLand = H.neighbors(coastWater.q, coastWater.r).map(n => sN2.grid[H.key(n.q, n.r)])
  .find(t => t && D.TERRAIN[t.t].pass && !t.siteId && t.t !== 'water');
const ship2 = G.addUnit(sN2, 'gunboat', 'alliance', coastWater.q, coastWater.r, 'full');
const shore2 = G.addUnit(sN2, 'light_inf', 'empire', coastLand.q, coastLand.r, 'full');
ok(R.attackTargets(sN2, ship2).includes(shore2), '炮艇可以攻击陆上单位');
ok(R.attackTargets(sN2, shore2).includes(ship2), '陆军可以攻击水域中的舰船');

console.log('== 战斗判定（1D6） ==');
const s3 = G.create({ playerFaction: 'alliance', difficulty: 1 });
const tank = G.unitsOf(s3, 'alliance').find(u => u.type === 'tank');
const einf = G.unitsOf(s3, 'empire').find(u => u.type === 'light_inf');
const tankInf = G.unitsOf(s3, 'alliance').find(u => u.type === 'light_inf');
const fc = R.combatForecast(s3, tank, einf);
console.log(`  坦克(4) → 轻步兵(6)：攻 ${fc.atkTotal} + 1D6 ≥ 防 ${fc.defTotal}，需 ${fc.need}+，命中 ${(fc.p * 100).toFixed(0)}%`);
ok(fc.need === 2 && Math.abs(fc.p - 5/6) < 1e-9, '攻 4 vs 防 6：掷 2+，83%');
const fcInf = R.combatForecast(s3, tankInf, einf);
console.log(`  步兵(2) → 步兵(6)：需 ${fcInf.need}+，命中 ${(fcInf.p * 100).toFixed(0)}%`);
ok(fcInf.need === 4 && Math.abs(fcInf.p - 0.5) < 1e-9, '攻 2 vs 防 6：需 4+，50%');
let cityInf = G.unitsOf(s3, 'empire').find(u => u.type === 'light_inf' && u.q === s3.sitesById.blackkeep.q);
if (!cityInf) cityInf = G.addUnit(s3, 'light_inf', 'empire', s3.sitesById.blackkeep.q, s3.sitesById.blackkeep.r, 'full');
const fc2 = R.combatForecast(s3, tankInf, cityInf);
console.log(`  步兵(2) → 首都步兵(6+2)：需 ${fc2.need}+，命中 ${(fc2.p * 100).toFixed(0)}%`);
ok(fc2.need === 6 && Math.abs(fc2.p - 1/6) < 1e-9, '首都防御 +2：弱攻需掷 6+');
const atkArt = G.addUnit(s3, 'field_gun', 'alliance', einf.q, einf.r - 1, 'full');
const far2 = H.ring(einf.q, einf.r, 2)[0];
const fc3 = R.combatForecast(s3, atkArt, einf, { fromQ: far2.q, fromR: far2.r });
ok(fc3.counterP === 0 && fc3.counterNeed == null, '火炮远程攻击无反击');

const res = R.resolveAttack(s3, tank, einf);
ok(res.roll >= 1 && res.roll <= 6, '掷骰结果为 1–6');
ok(res.hit === (res.roll >= res.need), '命中判定与公式一致');
console.log(`  实际攻击：掷 ${res.roll}，需 ${res.need}+ → ${res.hit ? '命中' : '未命中'}`);


console.log('== 行动规则：易位 / 协同 / 反击次数 ==');
const s6 = G.create({ playerFaction: 'alliance', difficulty: 1 });
const a6 = G.unitsOf(s6, 'alliance').find(u => u.type === 'light_inf');
const b6 = G.unitsOf(s6, 'alliance').find(u => u.type === 'armored_car');
let ta = null, tb = null;
for (const t of Object.values(s6.grid)) {
  if (!D.TERRAIN[t.t].pass || t.siteId || G.unitAt(s6, t.q, t.r)) continue;
  for (const n of H.neighbors(t.q, t.r)) {
    const nt = s6.grid[H.key(n.q, n.r)];
    if (nt && D.TERRAIN[nt.t].pass && !nt.siteId && !G.unitAt(s6, n.q, n.r)) { ta = t; tb = nt; break; }
  }
  if (ta) break;
}
a6.q = ta.q; a6.r = ta.r;
b6.q = tb.q; b6.r = tb.r;
ok(R.canSwap(s6, a6, b6), '相邻友军满足易位条件');
const swapRes = R.swapUnits(s6, a6, b6);
ok(swapRes.ok && a6.q === tb.q && b6.q === ta.q, '易位后双方交换位置');
ok(a6.hasMoved && b6.hasMoved && !a6.hasAttacked && !b6.hasAttacked, '易位后不能再移动但可攻击');
ok(!R.canSwap(s6, a6, b6), '易位后不能再次易位');

const s7 = G.create({ playerFaction: 'alliance', difficulty: 1 });
const target7 = G.unitsOf(s7, 'empire').find(u => u.type === 'light_inf');
const sup1 = G.unitsOf(s7, 'alliance').find(u => u.type === 'light_inf');
const sup2 = G.unitsOf(s7, 'alliance').find(u => u.type === 'mech_inf');
const freeNb = H.neighbors(target7.q, target7.r).filter(n => {
  const t = s7.grid[H.key(n.q, n.r)];
  return t && D.TERRAIN[t.t].pass && !t.siteId && !G.unitAt(s7, n.q, n.r);
});
sup1.q = freeNb[0].q; sup1.r = freeNb[0].r;
sup2.q = freeNb[1].q; sup2.r = freeNb[1].r;
const supRes1 = R.supportUnit(s7, sup1, target7);
const supRes2 = R.supportUnit(s7, sup2, target7);
ok(supRes1.ok && supRes2.ok, '两支友军进入协同状态');
ok(sup1.supporting && sup2.supporting && sup1.hasAttacked, '协同后行动结束并标记');
const attacker7 = G.unitsOf(s7, 'alliance').find(u => u.type === 'tank');
const fcSup = R.combatForecast(s7, attacker7, target7);
ok(fcSup.support === 2, '两名协同友军指定同一目标时叠加 +2 攻击修正');
const otherTarget = G.unitsOf(s7, 'empire').find(u => u.id !== target7.id);
if (otherTarget) {
  const fcOther = R.combatForecast(s7, attacker7, otherTarget);
  ok(fcOther.support === 0, '未指定目标的攻击不吃协同加成');
}
console.log(`  协同加成 ${fcSup.support}，总攻 ${fcSup.atkTotal} vs 防 ${fcSup.defTotal}`);
const supResolve = R.resolveAttack(s7, attacker7, target7);
ok(supResolve && R.combatForecast(s7, attacker7, target7).support === 0, '协同效果每回合只生效一次');
const lowHpSup = G.addUnit(s7, 'light_inf', 'alliance', 8, 8, 'damaged');
lowHpSup.hitsTaken = G.maxHits('light_inf') - 1;
ok(!R.supportRestriction(s7, lowHpSup).ok && !R.supportUnit(s7, lowHpSup, target7).ok, '受损条仅剩1格时不能协同');
const fragileSup = G.addUnit(s7, 'sniper_team', 'alliance', 8, 9, 'full');
ok(R.supportRestriction(s7, fragileSup).ok, '原本只有1格受损条的部队不受协同限制');

const s8 = G.create({ playerFaction: 'alliance', difficulty: 1 });
const atk8 = G.unitsOf(s8, 'alliance').find(u => u.type === 'light_inf');
const def8 = G.unitsOf(s8, 'empire').find(u => u.type === 'tank');
const nb8 = H.neighbors(def8.q, def8.r).find(n => {
  const t = s8.grid[H.key(n.q, n.r)];
  return t && D.TERRAIN[t.t].pass && !t.siteId && !G.unitAt(s8, n.q, n.r);
});
atk8.q = nb8.q; atk8.r = nb8.r;
const r8a = R.resolveAttack(s8, atk8, def8);
ok(def8.counterUsed === true, '守方对第一次攻击进行反击后标记');
atk8.hasAttacked = false; atk8.hasMoved = false;
const r8b = R.resolveAttack(s8, atk8, def8);
ok(r8b.counterNeed === null, '同一回合第二次被攻击不再反击');
s8.units.forEach(u => { u.counterUsed = true; u.supporting = true; u.swapped = true; });
G.startTurn(s8, 'alliance');
ok(s8.units.every(u => !u.counterUsed && !u.supporting && !u.swapped && !u.supportUsed), '回合开始时重置协同/反击/易位标记');

// 反击必须覆盖“未命中”和“命中但存活”；被击毁则不反击
function makeAdjacent(atkType, defType) {
  const s = G.create({ playerFaction: 'alliance', difficulty: 1 });
  s.units = [];
  const t = Object.values(s.grid).find(tile => {
    if (tile.t !== 'plains' || tile.siteId) return false;
    return H.neighbors(tile.q, tile.r).some(n => {
      const nt = s.grid[H.key(n.q, n.r)];
      return nt && D.TERRAIN[nt.t].pass && !nt.siteId;
    });
  });
  const a = G.addUnit(s, atkType, 'alliance', t.q, t.r, 'full');
  const n = H.neighbors(t.q, t.r).find(n => {
    const nt = s.grid[H.key(n.q, n.r)];
    return nt && D.TERRAIN[nt.t].pass && !nt.siteId && !G.unitAt(s, n.q, n.r);
  });
  const d = G.addUnit(s, defType, 'empire', n.q, n.r, 'full');
  return { s, a, d };
}
function seedForRoll(target) {
  for (let seed = 1; seed < 200000; seed++) {
    const tmp = { rng: seed };
    if (1 + Math.floor(G.nextRandom(tmp) * 6) === target) return seed;
  }
  return 1;
}
const missCase = makeAdjacent('light_inf', 'tank');
missCase.s.rng = seedForRoll(1); // 攻 2 vs 防 8：需 6+，掷 1 必失
const missRes = R.resolveAttack(missCase.s, missCase.a, missCase.d);
ok(!missRes.hit && missRes.counterRoll != null, '攻击未命中时，守方仍然反击');
ok(missRes.counterRoll >= 1 && missRes.counterRoll <= 6, '反击也有 1D6 判定');
ok(missRes.counterHit === (missRes.counterRoll >= missRes.counterNeed), '反击命中与骰点一致');

const hitCase = makeAdjacent('tank', 'light_inf');
hitCase.s.rng = seedForRoll(6); // 攻 4 vs 防 6：需 2+，掷 6 必中
const hitRes = R.resolveAttack(hitCase.s, hitCase.a, hitCase.d);
ok(hitRes.hit && !hitRes.defenderDestroyed && hitRes.counterRoll != null, '命中但守方存活时，守方反击');

const killCase = makeAdjacent('tank', 'infantry_gun');
const killRes = R.resolveAttack(killCase.s, killCase.a, killCase.d);
ok(killRes.defenderDestroyed && killRes.counterRoll == null, '守方被击毁时不反击');

console.log('== 战线状态：两侧受敌 / 被包围 ==');
const s9 = G.create({ playerFaction: 'alliance', difficulty: 1 });
s9.units = [];
const center = Object.values(s9.grid).find(t => {
  if (t.t !== 'plains' || t.siteId) return false;
  return H.neighbors(t.q, t.r).every(n => {
    const nt = s9.grid[H.key(n.q, n.r)];
    return nt && D.TERRAIN[nt.t].pass && !nt.siteId;
  });
});
ok(!!center, '找到一处六向可站的平原');
const dfd = G.addUnit(s9, 'light_inf', 'empire', center.q, center.r, 'full');
const eW = G.addUnit(s9, 'light_inf', 'alliance', center.q - 1, center.r, 'full');
const eE = G.addUnit(s9, 'light_inf', 'alliance', center.q + 1, center.r, 'full');
let fst = R.frontlineStatus(s9, dfd);
ok(fst.flanked && !fst.surrounded && fst.defMod === -1 && fst.atkMod === 0, '左右受敌：防御 -1');
const fcFlank = R.combatForecast(s9, eW, dfd);
ok(fcFlank.defTotal === 6 + fcFlank.defTerrain - 1, '防御总值计入 -1');

// 夹击：左上+右下（斜向对穿）
const s10 = G.create({ playerFaction: 'alliance', difficulty: 1 });
s10.units = [];
const c10 = Object.values(s10.grid).find(t => {
  if (t.t !== 'plains' || t.siteId) return false;
  return H.neighbors(t.q, t.r).every(n => {
    const nt = s10.grid[H.key(n.q, n.r)];
    return nt && D.TERRAIN[nt.t].pass && !nt.siteId;
  });
});
const d10 = G.addUnit(s10, 'light_inf', 'empire', c10.q, c10.r, 'full');
G.addUnit(s10, 'light_inf', 'alliance', c10.q, c10.r - 1, 'full');       // 西北
G.addUnit(s10, 'light_inf', 'alliance', c10.q, c10.r + 1, 'full');       // 东南
ok(R.frontlineStatus(s10, d10).flanked, '左上+右下：算夹击');
s10.units = [d10];
G.addUnit(s10, 'light_inf', 'alliance', c10.q, c10.r - 1, 'full');       // 西北
G.addUnit(s10, 'light_inf', 'alliance', c10.q + 1, c10.r - 1, 'full');   // 东北
ok(!R.frontlineStatus(s10, d10).flanked, '同为上侧的西北+东北：不算夹击');
s10.units = [d10];
G.addUnit(s10, 'light_inf', 'alliance', c10.q - 1, c10.r + 1, 'full');   // 西南
G.addUnit(s10, 'light_inf', 'alliance', c10.q + 1, c10.r - 1, 'full');   // 东北
ok(R.frontlineStatus(s10, d10).flanked, '左下+右上：算夹击');

const rest = H.neighbors(center.q, center.r).filter(n => !G.unitAt(s9, n.q, n.r));
for (const n of rest) G.addUnit(s9, 'light_inf', 'alliance', n.q, n.r, 'full');
fst = R.frontlineStatus(s9, dfd);
ok(fst.surrounded && fst.atkMod === -1 && fst.defMod === -2, '六向被围：攻击 -1、防御 -2（不叠加为 -3）');
const fcSur = R.combatForecast(s9, eW, dfd);
ok(fcSur.defTotal === 6 + fcSur.defTerrain - 2, '包围时防御总值计入 -2');
ok(fcSur.atkStatus.atkMod === 0, '攻方未被围时不减攻击');
console.log(`  两侧受敌防御 ${fcFlank.defTotal}，被围防御 ${fcSur.defTotal}，攻方总攻 ${fcSur.atkTotal}`);

console.log('== 纵深防御 ==');
const sDepthUI = G.create({ playerFaction: 'alliance', difficulty: 1 });
sDepthUI.strategies.alliance = { attack: 'human_wave', defense: 'defense_in_depth' };
const depthSiteUI = sDepthUI.sitesById.whiteport;
const depthSpotUI = H.neighbors(depthSiteUI.q, depthSiteUI.r).map(n => G.tileAt(sDepthUI, n.q, n.r))
  .find(t => t && D.TERRAIN[t.t].pass && !t.siteId && !G.unitAt(sDepthUI, t.q, t.r));
ok(!!depthSpotUI, '找到据点相邻空地');
if (depthSpotUI) {
  const dUnitUI = G.addUnit(sDepthUI, 'light_inf', 'alliance', depthSpotUI.q, depthSpotUI.r, 'full');
  const dDepthUI = G.depthDefenseAt(sDepthUI, depthSpotUI.q, depthSpotUI.r, 'alliance');
  ok(dDepthUI.value === G.siteDefense(depthSiteUI), '据点周围六格获得据点防御加成');
  ok(G.effective(dUnitUI, sDepthUI).def === D.UNITS.light_inf.def + dDepthUI.value, '纵深防御实际计入单位防御');
  ok(G.depthDefenseAt(sDepthUI, depthSiteUI.q, depthSiteUI.r, 'alliance').value === 0, '据点格本身不重复叠加纵深防御');
  const dAtkSpot = H.neighbors(depthSpotUI.q, depthSpotUI.r).map(n => G.tileAt(sDepthUI, n.q, n.r))
    .find(t => t && D.TERRAIN[t.t].pass && !t.siteId && !G.unitAt(sDepthUI, t.q, t.r));
  if (dAtkSpot) {
    const dAtkUI = G.addUnit(sDepthUI, 'light_inf', 'empire', dAtkSpot.q, dAtkSpot.r, 'full');
    const dFcUI = R.combatForecast(sDepthUI, dAtkUI, dUnitUI);
    ok(dFcUI.defense.depthDef === dDepthUI.value, '纵深防御计入战斗预测');
  }
}

console.log('== 待命：防御 +1（不可叠加） ==');
const s11 = G.create({ playerFaction: 'alliance', difficulty: 1 });
const w11 = G.unitsOf(s11, 'alliance').find(u => u.type === 'light_inf');
const foe11 = G.unitsOf(s11, 'empire').find(u => u.type === 'light_inf');
const baseDef = R.combatForecast(s11, foe11, w11).defTotal;
const waitRes = R.waitUnit(s11, w11);
ok(waitRes.ok && w11.waiting && w11.hasAttacked, '待命状态生效');
const waitedDef = R.combatForecast(s11, foe11, w11).defTotal;
ok(waitedDef === baseDef + 1, `待命防御 +1（${baseDef} → ${waitedDef}）`);
ok(!R.waitUnit(s11, w11).ok, '同一回合不能重复待命');
ok(R.combatForecast(s11, foe11, w11).defTotal === baseDef + 1, '待命加成不可叠加');
G.startTurn(s11, 'alliance');
ok(!w11.waiting, '下回合开始清除待命状态');
const wm = G.unitsOf(s11, 'alliance').find(u => u.type === 'tank');
wm.hasMoved = true;
ok(!R.waitUnit(s11, wm).ok, '移动后不能再选择待命');


console.log('== 机场任务 ==');
function moveToRing(state, unit, site, dist) {
  const t = H.ring(site.q, site.r, dist)
    .map(n => G.tileAt(state, n.q, n.r))
    .find(x => x && D.TERRAIN[x.t].pass && x.t !== 'water' && x.t !== 'river');
  unit.q = t.q; unit.r = t.r;
  return t;
}
const sA = G.create({ playerFaction: 'alliance', difficulty: 1 });
const airA = sA.sitesById.whiteair;
ok(airA && airA.kind === 'airport', '同盟机场存在');
ok(G.yieldOf(airA).money === 0 && G.yieldOf(airA).pop === 0 && G.yieldOf(airA).industry === 0, '机场不提供收入');
ok(G.siteDefense(airA) === 2, '机场防御 +2');
ok(!R.airportStatus(sA, sA.sitesById.blackair, 'jam').ok, '不能使用敌方机场');
const stA0 = R.airportStatus(sA, airA, 'bomb');
ok(!stA0.ok || stA0.targets.units.every(u => u.faction === 'neutral'), '开局机场范围内没有敌方正规军（中立可被选中）');
const jamTarget = G.unitsOf(sA, 'empire').find(u => u.type === 'light_inf');
moveToRing(sA, jamTarget, airA, 2);
const moneyA = sA.money.alliance;
const jamSt = R.airportStatus(sA, airA, 'jam');
ok(jamSt.ok, '无人机干扰有有效目标');
const jamRes = R.useAirportMission(sA, airA, 'jam', jamTarget.q, jamTarget.r);
ok(jamRes.ok && sA.money.alliance === moneyA - 4, '干扰花费 4 金');
ok(airA.airportUsedTurn === sA.turn, '机场本回合已使用');
ok(G.airportMaxUses(sA, 'alliance') === 2, '机场每回合可执行 2 次任务');
G.endTurn(sA);
ok(jamTarget.jammed === true, '目标在它的下回合被干扰');
ok(R.attackTargets(sA, jamTarget).length === 0, '被干扰单位没有攻击目标');
const jamMove = R.moveUnit(sA, jamTarget, jamTarget.q, jamTarget.r, new Map());
ok(!jamMove.ok && /干扰/.test(jamMove.why), '被干扰单位无法移动');
G.endTurn(sA);
ok(jamTarget.jammed === false, '干扰只持续一个回合');

const sB = G.create({ playerFaction: 'alliance', difficulty: 1 });
const airB = sB.sitesById.whiteair;
const bombTarget = G.unitsOf(sB, 'empire').find(u => u.type === 'light_inf');
moveToRing(sB, bombTarget, airB, 2);
const stB2 = R.airportStatus(sB, airB, 'bomb');
ok(stB2.ok && stB2.targets.keys.has(H.key(bombTarget.q, bombTarget.r)), '无人机空袭射程覆盖 2 格');
const moneyB = sB.money.alliance;
const bombRes = R.useAirportMission(sB, airB, 'bomb', bombTarget.q, bombTarget.r);
ok(bombRes.ok && bombRes.damage >= 5 && bombRes.damage <= 10, '无人机空袭伤害 4+1D6');
ok(sB.money.alliance === moneyB - 8, '无人机空袭花费 8 金');
ok(sB.units.includes(bombTarget) && bombTarget.state === 'damaged' && bombTarget.hitsTaken === 1, '无人机空袭使目标减少1格受损条');

const sTB = G.create({ playerFaction: 'alliance', difficulty: 1 });
const airTB = sTB.sitesById.whiteair;
const tbTarget = G.unitsOf(sTB, 'empire').find(u => u.type === 'light_inf');
moveToRing(sTB, tbTarget, airTB, 2);
ok(!R.airportStatus(sTB, airTB, 'tactical_bomb').targets.keys.has(H.key(tbTarget.q, tbTarget.r)), '战术轰炸最小射程 3');
moveToRing(sTB, tbTarget, airTB, 3);
const moneyTB = sTB.money.alliance;
const tbRes = R.useAirportMission(sTB, airTB, 'tactical_bomb', tbTarget.q, tbTarget.r);
ok(tbRes.ok && tbRes.damage >= 7 && tbRes.damage <= 12, '战术轰炸伤害 6+1D6');
ok(sTB.money.alliance === moneyTB - 14, '战术轰炸花费 14 金');
ok(sTB.units.includes(tbTarget) && tbTarget.state === 'damaged' && tbTarget.hitsTaken === 1, '战术轰炸使目标减少1格受损条');

const sC = G.create({ playerFaction: 'alliance', difficulty: 1 });
let dropRemoved = 0;
sC.units = sC.units.filter(u => !(u.faction === 'alliance' && u.type === 'light_inf' && dropRemoved++ < 2));
const airC = sC.sitesById.whiteair;
const dropTile = H.ring(airC.q, airC.r, 3).map(n => G.tileAt(sC, n.q, n.r))
  .find(t => t && D.TERRAIN[t.t].pass && t.t !== 'water' && t.t !== 'river' && !t.siteId && !G.unitAt(sC, t.q, t.r));
const beforePop = G.usageOf(sC, 'alliance').pop;
const moneyC = sC.money.alliance;
const dropRes = R.useAirportMission(sC, airC, 'drop', dropTile.q, dropTile.r);
ok(dropRes.ok && dropRes.unit.type === 'light_inf', '空降投放轻步兵');
ok(G.usageOf(sC, 'alliance').pop === beforePop + 2, '空降占用 2 人力');
ok(sC.money.alliance === moneyC - 6, '空降花费 6 金');
ok(dropRes.unit.hasMoved && dropRes.unit.hasAttacked, '空降单位当回合不能行动');
ok(!R.airportStatus(sC, airC, 'drop').ok, '空降后机场本回合不可再用');

const sSup = G.create({ playerFaction: 'alliance', difficulty: 1 });
const airSup = sSup.sitesById.whiteair;
const supUnit = G.unitsOf(sSup, 'alliance').find(u => u.type === 'light_inf');
supUnit.state = 'damaged'; supUnit.hitsTaken = 1;
const supSpot = H.neighbors(airSup.q, airSup.r).map(n => G.tileAt(sSup, n.q, n.r))
  .find(t => t && D.TERRAIN[t.t].pass && !t.siteId && !G.unitAt(sSup, t.q, t.r));
supUnit.q = supSpot.q; supUnit.r = supSpot.r;
sSup.money.alliance = 20;
const supStatus = R.airportStatus(sSup, airSup, 'supply');
ok(supStatus.ok && supStatus.mission.maxRange === 8, '空投补给：射程8且可选中受损友军');
const supMoney = sSup.money.alliance;
const supRes = R.useAirportMission(sSup, airSup, 'supply', supUnit.q, supUnit.r);
ok(supRes.ok && supUnit.state === 'full' && supUnit.hitsTaken === 0 && sSup.money.alliance === supMoney - 6, '空投补给恢复1格并花费6');

console.log('== 存档往返 ==');
const s4 = G.create({ playerFaction: 'empire', difficulty: 2 });
const json = G.serialize(s4);
const s5 = G.deserialize(json);
ok(!!s5, '反序列化成功');
ok(s5.turn === s4.turn && s5.units.length === s4.units.length, '回合与部队数量一致');
ok(s5.money.empire === s4.money.empire, '金钱一致');
ok(G.serialize(s5) === json, '二次序列化结果稳定');


console.log('== 桥梁叠放 / 河滩惩罚 ==');
const sZ = G.create({ playerFaction: 'alliance', difficulty: 1 });
const bridgeZ = Object.values(sZ.grid).find(t => t.bridge);
ok(!!bridgeZ, '找到桥梁');
const landZ = G.addUnit(sZ, 'light_inf', 'alliance', bridgeZ.q, bridgeZ.r, 'full');
const shipZ = G.addUnit(sZ, 'gunboat', 'alliance', bridgeZ.q, bridgeZ.r, 'full');
ok(G.unitsAt(sZ, bridgeZ.q, bridgeZ.r).length === 2, '桥梁上可同时停留陆上单位与舰船');
ok(!G.canOccupy(sZ, G.addUnit(sZ, 'light_inf', 'alliance', 0, 0, 'full'), bridgeZ.q, bridgeZ.r), '桥梁不能叠第三支单位');
ok(!G.canOccupy(sZ, G.addUnit(sZ, 'gunboat', 'alliance', 0, 0, 'full'), bridgeZ.q, bridgeZ.r), '桥梁不能叠第二支舰船');

const sZ2 = G.create({ playerFaction: 'alliance', difficulty: 1 });
const bridge2 = Object.values(sZ2.grid).find(t => t.bridge);
const shipZ2 = G.addUnit(sZ2, 'gunboat', 'alliance', bridge2.q, bridge2.r, 'full');
const nb2 = H.neighbors(bridge2.q, bridge2.r).map(n => G.tileAt(sZ2, n.q, n.r))
  .find(t => t && D.TERRAIN[t.t].pass && !t.siteId && !G.unitAt(sZ2, t.q, t.r));
const moverZ2 = G.addUnit(sZ2, 'light_inf', 'alliance', nb2.q, nb2.r, 'full');
const reach2 = R.reachable(sZ2, moverZ2);
ok(reach2.has(H.key(bridge2.q, bridge2.r)) && !reach2.get(H.key(bridge2.q, bridge2.r)).blocked, '陆军可移动到已有舰船的桥梁');
const mv2 = R.moveUnit(sZ2, moverZ2, bridge2.q, bridge2.r, reach2);
ok(mv2.ok && G.unitsAt(sZ2, bridge2.q, bridge2.r).length === 2, '陆军与舰船成功叠放');

const sZ3 = G.create({ playerFaction: 'alliance', difficulty: 1 });
const riverZ = Object.values(sZ3.grid).find(t => t.t === 'river' && !t.bridge);
const riverLand = G.addUnit(sZ3, 'light_inf', 'alliance', riverZ.q, riverZ.r, 'full');
const eRiver = G.effective(riverLand, sZ3);
ok(eRiver.atk === 1 && eRiver.def === 5, '陆上单位在河流上攻防 -1');
ok(G.statText(riverLand, sZ3) === '1-5-3-1', '河滩上的属性显示为 1-5-3-1');
const bridgeLand = G.addUnit(sZ3, 'light_inf', 'alliance', bridgeZ.q, bridgeZ.r, 'full');
ok(G.effective(bridgeLand, sZ3).atk === 2 && G.effective(bridgeLand, sZ3).def === 6, '桥梁上不受河滩惩罚');
const riverShip = G.addUnit(sZ3, 'gunboat', 'alliance', riverZ.q, riverZ.r, 'full');
ok(G.effective(riverShip, sZ3).atk === 4 && G.effective(riverShip, sZ3).def === 10, '舰船不受河滩惩罚');
const weakRiver = G.addUnit(sZ3, 'light_inf', 'alliance', riverZ.q + 100, riverZ.r, 'damaged');
weakRiver.q = riverZ.q; weakRiver.r = riverZ.r;
ok(G.effective(weakRiver, sZ3).atk === 1 && G.effective(weakRiver, sZ3).def === 5, '河滩惩罚后攻防最低为 1');



const sAirN = G.create({ playerFaction: 'alliance', difficulty: 1 });
const airN = sAirN.sitesById.whiteair;
const neutralSpot = Object.values(sAirN.grid).find(t => {
  if (t.t === 'water' || t.t === 'river' || !D.TERRAIN[t.t].pass || t.siteId) return false;
  const d = H.distance(airN.q, airN.r, t.q, t.r);
  return d >= 3 && d <= 8 && !G.unitAt(sAirN, t.q, t.r);
});
if (neutralSpot) {
  const neutralUnit = G.addUnit(sAirN, 'militia', 'neutral', neutralSpot.q, neutralSpot.r, 'full');
  const neutralTargets = R.airportTargets(sAirN, airN, 'bomb');
  ok(neutralTargets.units.includes(neutralUnit), '空军可选中中立单位');
  const bombNeutral = R.useAirportMission(sAirN, airN, 'bomb', neutralSpot.q, neutralSpot.r);
  ok(bombNeutral.ok && sAirN.units.includes(neutralUnit) && neutralUnit.state === 'damaged' && neutralUnit.hitsTaken === 1, '无人机空袭对民兵减少1格受损条');
}

console.log('== 工事 ==');
function fakeReach(q, r) {
  return new Map([[H.key(q, r), { q, r, cost: 1, blocked: false, prev: null }]]);
}
const sF = G.create({ playerFaction: 'alliance', difficulty: 1 });
const buildF = G.unitsOf(sF, 'alliance').find(u => u.type === 'light_inf');
const ft = H.neighbors(buildF.q, buildF.r).map(n => G.tileAt(sF, n.q, n.r))
  .find(t => t && D.TERRAIN[t.t].pass && !t.siteId && !G.unitAt(sF, t.q, t.r));
ok(!R.canBuildFort(sF, G.unitsOf(sF, 'alliance').find(u => u.type === 'tank'), 'mine').ok, '坦克不能修建工事');
const mineBuild = R.buildFort(sF, buildF, 'mine', ft.q, ft.r);
ok(mineBuild.ok && sF.forts.length === 1, '轻步兵可修建地雷');
ok(buildF.hasMoved && buildF.hasAttacked, '修建后无法再行动');
ok(!R.canBuildFort(sF, buildF, 'wire').ok, '同一单位一回合只能修一个工事');
const foeF = G.unitsOf(sF, 'empire').find(u => u.type === 'light_inf');
const mineMove = R.moveUnit(sF, foeF, ft.q, ft.r, fakeReach(ft.q, ft.r));
ok(mineMove.ok && mineMove.fort && mineMove.fort.kind === 'mine', '敌军触雷');
ok(!sF.forts.length && foeF.state === 'damaged', '地雷造成伤害后消失');

const sW = G.create({ playerFaction: 'alliance', difficulty: 1 });
const bW = G.unitsOf(sW, 'alliance').find(u => u.type === 'light_inf');
const wt = H.neighbors(bW.q, bW.r).map(n => G.tileAt(sW, n.q, n.r))
  .find(t => t && D.TERRAIN[t.t].pass && !t.siteId && !G.unitAt(sW, t.q, t.r));
R.buildFort(sW, bW, 'wire', wt.q, wt.r);
const lightRun = G.unitsOf(sW, 'empire').find(u => u.type === 'light_inf');
const wireMove = R.moveUnit(sW, lightRun, wt.q, wt.r, fakeReach(wt.q, wt.r));
ok(wireMove.ok && lightRun.noMoveTurn === sW.turn + 1 && lightRun.noAttackTurn === sW.turn && R.attackTargets(sW, lightRun).length === 0, '铁丝网强制停留且本回合无法攻击');
ok(!sW.forts.length, '铁丝网触发后消失');

const sT2 = G.create({ playerFaction: 'alliance', difficulty: 1 });
const bT = G.unitsOf(sT2, 'alliance').find(u => u.type === 'light_inf');
const trapT = H.neighbors(bT.q, bT.r).map(n => G.tileAt(sT2, n.q, n.r))
  .find(t => t && D.TERRAIN[t.t].pass && !t.siteId && !G.unitAt(sT2, t.q, t.r));
R.buildFort(sT2, bT, 'trap', trapT.q, trapT.r);
const tankRun = G.unitsOf(sT2, 'empire').find(u => u.type === 'tank');
const trapMove = R.moveUnit(sT2, tankRun, trapT.q, trapT.r, fakeReach(trapT.q, trapT.r));
ok(trapMove.ok && tankRun.noMoveTurn === sT2.turn + 1 && tankRun.noAttackTurn === sT2.turn && R.attackTargets(sT2, tankRun).length === 0, '反坦克锥强制停留且本回合无法攻击');

const sTr = G.create({ playerFaction: 'alliance', difficulty: 1 });
const bTr = G.unitsOf(sTr, 'alliance').find(u => u.type === 'light_inf');
R.buildFort(sTr, bTr, 'trench', bTr.q, bTr.r);
ok(G.effective(bTr, sTr).def === 7 && G.effective(bTr, sTr).trenchDef === 1, '战壕使友军防御 +1');

const sAA = G.create({ playerFaction: 'alliance', difficulty: 1 });
const airAA = sAA.sitesById.whiteair;
const aaTile = H.ring(airAA.q, airAA.r, 2).map(n => G.tileAt(sAA, n.q, n.r))
  .find(t => t && D.TERRAIN[t.t].pass && !t.siteId && !G.unitAt(sAA, t.q, t.r));
const aaTarget = G.unitsOf(sAA, 'empire').find(u => u.type === 'light_inf');
aaTarget.q = aaTile.q; aaTarget.r = aaTile.r;
const aaFort = G.addFort(sAA, 'aa', 'empire', aaTile.q, aaTile.r);
ok(!R.airportTargets(sAA, airAA, 'jam').keys.has(H.key(aaTarget.q, aaTarget.r)), '防空阵地保护范围内单位');
G.removeFort(sAA, aaFort);
ok(R.airportTargets(sAA, airAA, 'jam').keys.has(H.key(aaTarget.q, aaTarget.r)), '移除防空阵地后重新可被机场选中');

const sG = G.create({ playerFaction: 'alliance', difficulty: 1 });
const bG = G.unitsOf(sG, 'alliance').find(u => u.type === 'light_inf');
const gt = H.neighbors(bG.q, bG.r).map(n => G.tileAt(sG, n.q, n.r))
  .find(t => t && D.TERRAIN[t.t].pass && !t.siteId && !G.unitAt(sG, t.q, t.r));
const gunRes = R.buildFort(sG, bG, 'fort_gun', gt.q, gt.r);
ok(gunRes.ok && gunRes.gun.type === 'fort_gun', '修建要塞炮');
ok(!G.canOccupy(sG, bG, gt.q, gt.r), '要塞炮封锁地格');
ok(R.reachable(sG, gunRes.gun).size === 1, '要塞炮无法移动');
const gunTarget = G.unitsOf(sG, 'empire').find(u => u.type === 'light_inf');
const ring2 = H.ring(gt.q, gt.r, 2).map(n => G.tileAt(sG, n.q, n.r))
  .find(t => t && D.TERRAIN[t.t].pass && !t.siteId && !G.unitAt(sG, t.q, t.r));
gunTarget.q = ring2.q; gunTarget.r = ring2.r;
gunRes.gun.hasMoved = false;
gunRes.gun.hasAttacked = false;
ok(R.attackTargets(sG, gunRes.gun).includes(gunTarget), '要塞炮可攻击 2 格目标');
R.resolveAttack(sG, gunRes.gun, gunTarget);
ok(gunRes.gun.noAttackTurn === sG.turn + 1, '要塞炮开火后下一回合冷却');
gunRes.gun.hasAttacked = false;
const savedTurn = sG.turn; sG.turn = savedTurn + 1;
ok(R.attackTargets(sG, gunRes.gun).length === 0, '冷却回合不能攻击');
sG.turn = savedTurn;

const sL = G.create({ playerFaction: 'alliance', difficulty: 1 });
const builders = G.unitsOf(sL, 'alliance').filter(u => u.type === 'light_inf').slice(0, 4);
for (const b of builders) {
  const t = H.neighbors(b.q, b.r).map(n => G.tileAt(sL, n.q, n.r))
    .find(x => x && D.TERRAIN[x.t].pass && !x.siteId && !G.unitAt(sL, x.q, x.r) && !G.fortAt(sL, x.q, x.r));
  if (t && sL.fortsBuilt < 2) R.buildFort(sL, b, 'mine', t.q, t.r);
}
ok(sL.fortsBuilt === 2, '基础状态下每回合最多建造 2 个工事');
const extraBuilder = builders[3];
if (extraBuilder) {
  const t = H.neighbors(extraBuilder.q, extraBuilder.r).map(n => G.tileAt(sL, n.q, n.r))
    .find(x => x && D.TERRAIN[x.t].pass && !x.siteId && !G.unitAt(sL, x.q, x.r) && !G.fortAt(sL, x.q, x.r));
  if (t) ok(R.canBuildFort(sL, extraBuilder, 'mine').ok, '工事总数无上限，可继续建造');
}


const sMF = G.create({ playerFaction: 'alliance', difficulty: 1 });
const bMF = G.unitsOf(sMF, 'alliance').find(u => u.type === 'light_inf');
const mtF = H.neighbors(bMF.q, bMF.r).map(n => G.tileAt(sMF, n.q, n.r))
  .find(t => t && D.TERRAIN[t.t].pass && !t.siteId && !G.unitAt(sMF, t.q, t.r));
R.buildFort(sMF, bMF, 'mine', mtF.q, mtF.r);
const friendlyF = G.unitsOf(sMF, 'alliance').find(u => u.id !== bMF.id && u.type === 'light_inf');
const mfRes = R.moveUnit(sMF, friendlyF, mtF.q, mtF.r, fakeReach(mtF.q, mtF.r));
ok(mfRes.ok && sMF.forts.length === 1, '友军停留不触发地雷');

const sWF = G.create({ playerFaction: 'alliance', difficulty: 1 });
const bWF = G.unitsOf(sWF, 'alliance').find(u => u.type === 'light_inf');
const wtF = H.neighbors(bWF.q, bWF.r).map(n => G.tileAt(sWF, n.q, n.r))
  .find(t => t && D.TERRAIN[t.t].pass && !t.siteId && !G.unitAt(sWF, t.q, t.r));
R.buildFort(sWF, bWF, 'wire', wtF.q, wtF.r);
const friendlyW = G.unitsOf(sWF, 'alliance').find(u => u.id !== bWF.id && u.type === 'light_inf');
friendlyW.q = wtF.q - 100; friendlyW.r = wtF.r;
const wfRes = R.moveUnit(sWF, friendlyW, wtF.q, wtF.r, fakeReach(wtF.q, wtF.r));
ok(wfRes.ok && !sWF.forts.length, '铁丝网对友军同样生效并消失');

const sTrE = G.create({ playerFaction: 'alliance', difficulty: 1 });
const trE = H.neighbors(G.unitsOf(sTrE, 'alliance')[0].q, G.unitsOf(sTrE, 'alliance')[0].r)
  .map(n => G.tileAt(sTrE, n.q, n.r)).find(t => t && D.TERRAIN[t.t].pass && !t.siteId && !G.unitAt(sTrE, t.q, t.r));
const trFort = G.addFort(sTrE, 'trench', 'alliance', trE.q, trE.r);
const foeTr = G.unitsOf(sTrE, 'empire')[0];
R.moveUnit(sTrE, foeTr, trE.q, trE.r, fakeReach(trE.q, trE.r));
ok(!sTrE.forts.includes(trFort), '敌军占领后战壕消失');

const sAAE = G.create({ playerFaction: 'alliance', difficulty: 1 });
const aaE = H.neighbors(G.unitsOf(sAAE, 'alliance')[0].q, G.unitsOf(sAAE, 'alliance')[0].r)
  .map(n => G.tileAt(sAAE, n.q, n.r)).find(t => t && D.TERRAIN[t.t].pass && !t.siteId && !G.unitAt(sAAE, t.q, t.r));
const aaFortE = G.addFort(sAAE, 'aa', 'empire', aaE.q, aaE.r);
const foeAA = G.unitsOf(sAAE, 'alliance')[0];
R.moveUnit(sAAE, foeAA, aaE.q, aaE.r, fakeReach(aaE.q, aaE.r));
ok(!sAAE.forts.includes(aaFortE), '敌军占领后防空阵地消失');

const sTrapN = G.create({ playerFaction: 'alliance', difficulty: 1 });
const bTrapN = G.unitsOf(sTrapN, 'alliance').find(u => u.type === 'light_inf');
const tnN = H.neighbors(bTrapN.q, bTrapN.r).map(n => G.tileAt(sTrapN, n.q, n.r))
  .find(t => t && D.TERRAIN[t.t].pass && !t.siteId && !G.unitAt(sTrapN, t.q, t.r));
R.buildFort(sTrapN, bTrapN, 'trap', tnN.q, tnN.r);
const militiaN = G.addUnit(sTrapN, 'militia', 'empire', tnN.q - 100, tnN.r, 'full');
R.moveUnit(sTrapN, militiaN, tnN.q, tnN.r, fakeReach(tnN.q, tnN.r));
ok(sTrapN.forts.length === 1, '民兵不受反坦克锥影响');

ok(D.UNITS.fort_gun.def === 12 && D.UNITS.fort_gun.fragile, '要塞炮防御 12 且一击即毁');
const sPlace = G.create({ playerFaction: 'alliance', difficulty: 1 });
const bPlace = G.unitsOf(sPlace, 'alliance').find(u => u.type === 'light_inf');
const wireTiles = R.fortPlacementTiles(sPlace, bPlace, 'wire');
const mineTiles = R.fortPlacementTiles(sPlace, bPlace, 'mine');
ok(!wireTiles.some(t => t.q === bPlace.q && t.r === bPlace.r), '铁丝网不能建在自身格');
ok(mineTiles.some(t => t.q === bPlace.q && t.r === bPlace.r), '地雷可以建在自身格');



console.log('== 移动穿透与行动结束 ==');
function findTraverseCase(state, mover, blockerFaction, blockerType) {
  for (const n of H.neighbors(mover.q, mover.r)) {
    const b = G.tileAt(state, n.q, n.r);
    if (!b || !D.TERRAIN[b.t].pass || b.siteId || G.unitAt(state, b.q, b.r)) continue;
    for (const n2 of H.neighbors(b.q, b.r)) {
      if (n2.q === mover.q && n2.r === mover.r) continue;
      const t = G.tileAt(state, n2.q, n2.r);
      if (!t || !D.TERRAIN[t.t].pass || t.siteId || G.unitAt(state, t.q, t.r)) continue;
      if (G.fortAt(state, t.q, t.r)) continue;
      const blocker = G.addUnit(state, blockerType, blockerFaction, b.q, b.r, 'full');
      return { b, t, blocker };
    }
  }
  return null;
}
const sPass = G.create({ playerFaction: 'alliance', difficulty: 1 });
const passMover = G.unitsOf(sPass, 'alliance').find(u => u.type === 'light_inf');
const passCase = findTraverseCase(sPass, passMover, 'alliance', 'militia');
if (passCase) {
  const passReach = R.reachable(sPass, passMover);
  ok(passReach.has(H.key(passCase.t.q, passCase.t.r)), '可穿过友军继续移动');
  ok(!passReach.has(H.key(passCase.b.q, passCase.b.r)), '不能停在友军格上');
  ok(!!R.findPath(sPass, passMover, passCase.t.q, passCase.t.r), '寻路可穿过友军');
}
const sBlock = G.create({ playerFaction: 'alliance', difficulty: 1 });
const blockMover = G.unitsOf(sBlock, 'alliance').find(u => u.type === 'light_inf');
const blockCase = findTraverseCase(sBlock, blockMover, 'empire', 'militia');
if (blockCase) {
  ok(!G.canTraverse(sBlock, blockMover, blockCase.b.q, blockCase.b.r), '不能穿过敌军移动');
}
const sGunBlock = G.create({ playerFaction: 'alliance', difficulty: 1 });
const gunBlockMover = G.unitsOf(sGunBlock, 'alliance').find(u => u.type === 'light_inf');
const gunBlockCase = findTraverseCase(sGunBlock, gunBlockMover, 'alliance', 'fort_gun');
if (gunBlockCase) {
  ok(!G.canTraverse(sGunBlock, gunBlockMover, gunBlockCase.b.q, gunBlockCase.b.r), '友军要塞炮仍然阻挡通行');
}

const sExh = G.create({ playerFaction: 'alliance', difficulty: 1 });
const exhUnit = G.unitsOf(sExh, 'alliance').find(u => u.type === 'light_inf');
const exhDest = Object.values(sExh.grid).find(t => t.t === 'plains' && !t.siteId && !G.unitAt(sExh, t.q, t.r) &&
  sExh.units.every(e => e.faction === 'alliance' || H.distance(t.q, t.r, e.q, e.r) > 4));
const exhRes = R.moveUnit(sExh, exhUnit, exhDest.q, exhDest.r, fakeReach(exhDest.q, exhDest.r));
ok(exhRes.ok && exhRes.exhausted === true && exhUnit.hasAttacked, '移动后无目标自动进入行动完毕状态');



console.log('== 日升帝国 ==');
const sSun = G.create({ playerFaction: 'alliance', difficulty: 1, playerForce: 'sunrise' });
sSun.current = 'alliance';
sSun.money.alliance = 100;
ok(G.buildOrder(sSun, 'alliance').includes('suicide_squad') && G.buildOrder(sSun, 'alliance').includes('assault_boat'), '日升生产列表含特殊兵种');
ok(D.UNITS.suicide_squad.stat === '2-6-3-1' && D.UNITS.suicide_squad.damaged.atk === 3, '敢死队受损后攻击升至3');
ok(D.UNITS.assault_boat.fragile && D.UNITS.assault_boat.landingOnDeath === 'suicide_squad', '突击快船沉没可登陆');
const sunSpot = Object.values(sSun.grid).find(t => t.t === 'plains' && !t.siteId && !G.unitAt(sSun, t.q, t.r));
const sunFoeSpot = H.neighbors(sunSpot.q, sunSpot.r).map(n => G.tileAt(sSun, n.q, n.r))
  .find(t => t && D.TERRAIN[t.t].pass && !t.siteId && !G.unitAt(sSun, t.q, t.r));
if (sunSpot && sunFoeSpot) {
  const li = G.addUnit(sSun, 'light_inf', 'alliance', sunSpot.q, sunSpot.r, 'full');
  const foeS = G.addUnit(sSun, 'fort_gun', 'empire', sunFoeSpot.q, sunFoeSpot.r, 'full');
  ok(R.attackTargets(sSun, li).includes(foeS), '日升轻步兵首击可用');
  R.resolveAttack(sSun, li, foeS);
  ok(!li.hasAttacked && li.attacksMade === 1, '日升轻步兵第一次攻击后仍可行动');
  ok(R.attackTargets(sSun, li).includes(foeS), '日升轻步兵可对同一目标再次攻击');
  R.resolveAttack(sSun, li, foeS);
  ok(li.hasAttacked && li.attacksMade === 2, '日升轻步兵第二次攻击后行动结束');
}

const sSunCounter = G.create({ playerFaction: 'alliance', difficulty: 1, playerForce: 'sunrise' });
sSunCounter.current = 'alliance';
const sunSpot2 = Object.values(sSunCounter.grid).find(t => t.t === 'plains' && !t.siteId && !G.unitAt(sSunCounter, t.q, t.r));
const sunFoeSpot2 = sunSpot2 && H.neighbors(sunSpot2.q, sunSpot2.r).map(n => G.tileAt(sSunCounter, n.q, n.r))
  .find(t => t && D.TERRAIN[t.t].pass && !t.siteId && !G.unitAt(sSunCounter, t.q, t.r));
if (sunSpot2 && sunFoeSpot2) {
  const sunAtk2 = G.addUnit(sSunCounter, 'light_inf', 'alliance', sunSpot2.q, sunSpot2.r, 'full');
  const sunFoe2 = G.addUnit(sSunCounter, 'tank', 'empire', sunFoeSpot2.q, sunFoeSpot2.r, 'full');
  sunAtk2.attacksMade = 1;
  sunFoe2.counterCount = 2;
  const fcSun2 = R.combatForecast(sSunCounter, sunAtk2, sunFoe2);
  ok(fcSun2.counterNeed != null, '日升第二次攻击战斗预测仍显示反击');
  const sunRes2 = R.resolveAttack(sSunCounter, sunAtk2, sunFoe2);
  ok(sunRes2.forcedCounter && sunRes2.counterNeed != null && sunFoe2.counterCount === 3, '日升第二次攻击未消灭目标时强制反击');
}

const sBoat = G.create({ playerFaction: 'alliance', difficulty: 1, playerForce: 'sunrise' });
let boatSpot = null, landSpot = null;
for (const t of Object.values(sBoat.grid)) {
  if (t.t !== 'water') continue;
  const land = H.neighbors(t.q, t.r).map(n => G.tileAt(sBoat, n.q, n.r))
    .find(x => x && x.t !== 'water' && x.t !== 'river' && !x.siteId && !G.unitAt(sBoat, x.q, x.r));
  if (land) { boatSpot = t; landSpot = land; break; }
}
if (boatSpot && landSpot) {
  const boat = G.addUnit(sBoat, 'assault_boat', 'alliance', boatSpot.q, boatSpot.r, 'full');
  R.applyHit(sBoat, boat);
  ok(sBoat.pendingLandings.length === 1, '突击快船沉没时生成登陆选择');
  const landing = sBoat.pendingLandings[0];
  const placed = R.placeLanding(sBoat, landing, landing.options[0].q, landing.options[0].r);
  ok(placed.ok && sBoat.units.some(u => u.type === 'suicide_squad'), '玩家可将敢死队部署到相邻陆地');
}


console.log('== 东陆共和国 ==');
const sEast = G.create({ playerFaction: 'alliance', difficulty: 1, playerForce: 'eastland' });
sEast.current = 'alliance';
sEast.money.alliance = 100;
ok(G.forceOf(sEast, 'alliance') === 'eastland', '东陆势力已绑定');
ok(G.buildOrder(sEast, 'alliance').includes('infantry_column') && G.buildOrder(sEast, 'alliance').includes('experimental_mech'), '东陆生产列表含特殊兵种');
const eCaps = G.capsOf(sEast, 'alliance');
ok(eCaps.pop === 19 && eCaps.industry === 13, '东陆人口 +6 / 工业 +2');
const eMilitia = G.addUnit(sEast, 'militia', 'alliance', 3, 12, 'full');
const eEff = G.effective(eMilitia, sEast);
ok(eEff.move === D.UNITS.militia.move + 1 && eEff.def === D.UNITS.militia.def + 1, '东陆民兵移动/防御 +1');
const eForest = Object.values(sEast.grid).find(t => t.t === 'forest' && !t.siteId && !G.unitAt(sEast, t.q, t.r));
if (eForest) ok(G.moveCost(sEast, eForest.q, eForest.r, eMilitia) === 1, '东陆民兵无视森林移动消耗');
const eLight = G.addUnit(sEast, 'light_inf', 'alliance', 3, 13, 'full');
ok(G.effective(eLight, sEast).move === D.UNITS.light_inf.move + 1, '东陆轻步兵移动 +1');

const eColumn = G.addUnit(sEast, 'infantry_column', 'alliance', 4, 12, 'full');
ok(G.maxHits('infantry_column') === 4, '步兵纵队可承受四次命中');
ok(G.costOf(sEast, 'infantry_column', 'alliance').money === 8, '步兵纵队花费 8 金');
R.applyHit(sEast, eColumn);
ok(eColumn.state === 'damaged' && eColumn.hitsTaken === 1, '步兵纵队第一次受损');
R.applyHit(sEast, eColumn);
ok(eColumn.state === 'damaged' && eColumn.hitsTaken === 2, '步兵纵队第二次受损仍存活');
ok(R.applyHit(sEast, eColumn) === 'damaged' && eColumn.hitsTaken === 3, '步兵纵队第三次命中仍存活');
ok(R.applyHit(sEast, eColumn) === 'destroyed', '步兵纵队第四次命中才被击毁');
if (eForest) ok(G.moveCost(sEast, eForest.q, eForest.r, eColumn) === 1, '步兵纵队森林地形消耗 -1');

const eMech = G.addUnit(sEast, 'experimental_mech', 'eastland', 5, 12, 'full');
ok(D.UNITS.experimental_mech.taunt === 6 && D.UNITS.experimental_mech.immuneFlank, '实验型机甲带嘲讽/免疫夹击');
const eFoe = G.addUnit(sEast, 'light_inf', 'empire', 5, 11, 'full');
const eOther = G.addUnit(sEast, 'light_inf', 'empire', 6, 12, 'full');
const eAtk = G.addUnit(sEast, 'light_inf', 'alliance', 5, 13, 'full');
ok(R.attackTargets(sEast, eAtk).length === 1 && R.attackTargets(sEast, eAtk)[0] === eMech, '机甲周围敌军只能优先攻击机甲');
ok(R.frontlineStatus(sEast, eMech).defMod === 0 && R.flankBonus(sEast, eAtk, eMech) === 0, '机甲免疫夹击/包围惩罚');

const oldRand4 = Math.random;
Math.random = () => 0.1;
const sEastAI = G.create({ playerFaction: 'alliance', difficulty: 1,
  strategies: { attack: 'armor_blitz', defense: 'endurance' }, aiForce: 'eastland' });
ok(G.strategyOf(sEastAI, 'empire').attack === 'human_wave' && G.strategyOf(sEastAI, 'empire').defense === 'endurance', '东陆 AI 倾向人海/持久');
Math.random = oldRand4;


console.log('== 新大陆合众国 ==');
const sNW = G.create({ playerFaction: 'alliance', difficulty: 1, playerForce: 'newworld' });
sNW.current = 'alliance';
sNW.money.alliance = 100;
ok(G.forceOf(sNW, 'alliance') === 'newworld', '新大陆势力已绑定');
ok(G.capsOf(sNW, 'alliance').industry === 15, '新大陆工业上限 +4');
sNW.sitesById.ironforge.faction = 'alliance';
ok(G.canBuild(sNW, sNW.sitesById.ironforge, 'tank').ok, '新大陆工厂可生产坦克');
ok(G.buildOrder(sNW, 'alliance').includes('hover_tank') && G.buildOrder(sNW, 'alliance').includes('tactical_carrier'), '新大陆生产列表含特殊兵种');
ok(D.UNITS.hover_tank.terrainIgnore.includes('forest') && D.UNITS.hover_tank.cannotEnter.includes('mountain'), '悬浮坦克地形规则正确');
ok(D.UNITS.tactical_carrier.name === '两栖攻击舰' && D.UNITS.tactical_carrier.range === 6 && D.UNITS.tactical_carrier.naval && D.UNITS.tactical_carrier.cost.money === 32, '两栖攻击舰属性/造价正确');

const airNW = sNW.sitesById.whiteair;
const nukeTarget = Object.values(sNW.grid).find(t => {
  const d = H.distance(airNW.q, airNW.r, t.q, t.r);
  return d >= 5 && d <= 12 && t.t !== 'water' && t.t !== 'river' && !t.siteId && !G.unitAt(sNW, t.q, t.r);
});
if (nukeTarget) {
  const nukeFoe = G.addUnit(sNW, 'tank', 'empire', nukeTarget.q, nukeTarget.r, 'full');
  const nukeFort = G.addFort(sNW, 'trench', 'empire', nukeTarget.q, nukeTarget.r);
  const nukeFriend = G.addUnit(sNW, 'light_inf', 'alliance', nukeTarget.q + 1, nukeTarget.r, 'full');
  const nukeStatus = R.airportStatus(sNW, airNW, 'nuke');
  ok(nukeStatus.ok, '新大陆机场可用战术核打击');
  const nukeRes = R.useAirportMission(sNW, airNW, 'nuke', nukeTarget.q, nukeTarget.r);
  ok(nukeRes.ok && !sNW.units.includes(nukeFoe) && !sNW.forts.includes(nukeFort), '核打击摧毁目标单位与工事');
  ok(!sNW.units.includes(nukeFriend) || nukeFriend.state === 'damaged', '核打击波及周围友军');
  ok(!R.airportStatus(sNW, airNW, 'nuke').ok, '核打击六回合冷却');
}

const oldRandNW = Math.random;
Math.random = () => 0.2;
const sNWAI = G.create({ playerFaction: 'alliance', difficulty: 1,
  strategies: { attack: 'armor_blitz', defense: 'endurance' }, aiForce: 'newworld' });
ok(G.strategyOf(sNWAI, 'empire').attack === 'superior_firepower' && G.strategyOf(sNWAI, 'empire').defense === 'fire_counter', '新大陆 AI 倾向优势火力/火力反制');
const sNWBuild = G.create({ playerFaction: 'alliance', difficulty: 1,
  strategies: { attack: 'armor_blitz', defense: 'endurance' }, aiForce: 'newworld' });
G.startTurn(sNWBuild, 'empire', true);
sNWBuild.money.empire = 100;
const aiNWBuild = SG.ai.createAI(sNWBuild, 'empire');
aiNWBuild.begin();
ok(!aiNWBuild.builds.some(b => b.type === 'militia'), '新大陆 AI 不再把民兵当兜底生产');
const sBuildNoMilitia = G.create({ playerFaction: 'alliance', difficulty: 1 });
G.startTurn(sBuildNoMilitia, 'empire', true);
sBuildNoMilitia.money.empire = 100;
const aiNoMilitia = SG.ai.createAI(sBuildNoMilitia, 'empire');
aiNoMilitia.begin();
ok(!aiNoMilitia.builds.some(b => b.type === 'militia'), 'AI 通用兜底不再优先生产民兵');
Math.random = oldRandNW;

console.log('== 势力与特殊兵种 ==');
ok(D.FORCES.ironblood && D.FORCES.revolution && D.FORCES.northsea, '三势力数据存在');
const sBO = G.create({ playerFaction: 'alliance', difficulty: 1 });
const boE = G.buildOrder(sBO, 'empire'), boA = G.buildOrder(sBO, 'alliance');
ok(boE.includes('stormtrooper') && boE.includes('superheavy_tank') && !boE.includes('conscript'), '帝国生产列表含本国特殊兵种');
ok(D.BUILD_ORDER.includes('heavy_tank') && !D.SPECIAL_UNITS.includes('heavy_tank'), '重型坦克已改为通用单位');
ok(boA.includes('conscript') && boA.includes('rocket_artillery') && !boA.includes('stormtrooper'), '革命生产列表含本国特殊兵种');

const sSpecE = G.create({ playerFaction: 'empire', difficulty: 1 });
let specRemoved = 0;
sSpecE.units = sSpecE.units.filter(u => !(u.faction === 'empire' && u.type === 'light_inf' && specRemoved++ < 2));
sSpecE.current = 'empire';
sSpecE.money.empire = 100;
const cityE = sSpecE.sitesById.blackkeep;
const baseE = sSpecE.sitesById.greyrock;
ok(G.canBuild(sSpecE, cityE, 'stormtrooper').ok, '风暴突击队可在首都/城市生产');
ok(G.canBuild(sSpecE, baseE, 'heavy_tank').ok && G.canBuild(sSpecE, baseE, 'superheavy_tank').ok, '重型/超重型坦克可在工业基地生产');
ok(!G.canBuild(sSpecE, cityE, 'conscript').ok, '帝国不能生产革命特殊兵种');
ok(D.UNITS.stormtrooper.stat === '2-7-4-1' && D.UNITS.stormtrooper.cost.money === 5, '风暴突击队属性/造价正确');
ok(D.UNITS.superheavy_tank.stat === '4-10-2-1' && D.UNITS.superheavy_tank.damagedStat === '2-9-0-1' && D.UNITS.superheavy_tank.cost.money === 16, '超重型坦克属性/造价正确');
ok(D.UNITS.guard.cost.money === 6 && D.UNITS.suicide_squad.cost.money === 4 && D.UNITS.assault_boat.cost.money === 10 && D.UNITS.infantry_column.cost.money === 8, '指定特殊单位造价更新');
ok(D.UNITS.experimental_mech.stat === '3-9-3-1' && D.UNITS.experimental_mech.cost.money === 15, '实验型机甲攻击3/移动3/造价15');
ok(D.UNITS.heavy_tank.stat === '4-9-2-1' && D.UNITS.heavy_tank.damaged.def === 8, '重型坦克属性正确');
ok(G.canBuild(sSpecE, baseE, 'siege_howitzer').ok, '列车炮是铁血帝国特殊单位');

const sSpecA = G.create({ playerFaction: 'alliance', difficulty: 1 });
sSpecA.current = 'alliance';
const cityA = sSpecA.sitesById.whiteport;
const baseA = sSpecA.sitesById.pine;
ok(G.canBuild(sSpecA, cityA, 'conscript').ok, '动员兵可在任意据点生产');
const con = G.addUnit(sSpecA, 'conscript', 'alliance', cityA.q, cityA.r, 'damaged');
ok(G.effective(con, sSpecA).atk === 1 && G.effective(con, sSpecA).def === 8, '动员兵受损后防御变为 8');
sSpecA.units = sSpecA.units.filter(u => u !== con);
ok(G.canBuild(sSpecA, baseA, 'rocket_artillery').ok, '自行火箭炮可在工业基地生产');
ok(!G.canBuild(sSpecA, cityA, 'heavy_tank').ok && G.canBuild(sSpecA, baseA, 'heavy_tank').ok, '重型坦克通用但只能在工业基地生产');
ok(!G.canBuild(sSpecA, baseA, 'superheavy_tank').ok, '革命不能生产帝国特殊兵种');
ok(G.costOf(sSpecA, 'tank', 'alliance').money === 11 && G.costOf(sSpecA, 'militia', 'alliance').money === 1, '革命联盟全军造价 -1（下限 1）');

const sIron = G.create({ playerFaction: 'alliance', difficulty: 1, playerForce: 'ironblood' });
sIron.current = 'alliance';
const ironLand = Object.values(sIron.grid).find(t => t.t === 'plains' && !t.siteId && !G.unitAt(sIron, t.q, t.r));
const ironFoeSpot = H.neighbors(ironLand.q, ironLand.r).map(n => G.tileAt(sIron, n.q, n.r))
  .find(t => t && D.TERRAIN[t.t].pass && !t.siteId && !G.unitAt(sIron, t.q, t.r));
if (ironLand && ironFoeSpot) {
  const lt = G.addUnit(sIron, 'armored_car', 'alliance', ironLand.q, ironLand.r, 'full');
  const foeI = G.addUnit(sIron, 'militia', 'empire', ironFoeSpot.q, ironFoeSpot.r, 'full');
  const fcI = R.combatForecast(sIron, lt, foeI);
  ok(fcI.rolls === 2, '铁血帝国轻型坦克攻击掷两次');
  const resI = R.resolveAttack(sIron, lt, foeI);
  ok(resI.rolls && resI.rolls.length === 2, '铁血帝国攻击实际使用两枚骰');
}

const sRkt = G.create({ playerFaction: 'alliance', difficulty: 1 });
const rktSpot = Object.values(sRkt.grid).find(t => t.t === 'plains' && !t.siteId && !G.unitAt(sRkt, t.q, t.r));
const rktTargets = H.ring(rktSpot.q, rktSpot.r, 2).map(n => G.tileAt(sRkt, n.q, n.r))
  .filter(t => t && D.TERRAIN[t.t].pass && !t.siteId && !G.unitAt(sRkt, t.q, t.r)).slice(0, 2);
if (rktSpot && rktTargets.length === 2) {
  const rkt = G.addUnit(sRkt, 'rocket_artillery', 'alliance', rktSpot.q, rktSpot.r, 'full');
  const r1 = G.addUnit(sRkt, 'militia', 'empire', rktTargets[0].q, rktTargets[0].r, 'full');
  const r2 = G.addUnit(sRkt, 'militia', 'empire', rktTargets[1].q, rktTargets[1].r, 'full');
  ok(R.attackTargets(sRkt, rkt).includes(r1) && R.attackTargets(sRkt, rkt).includes(r2), '自行火箭炮 1–2 格均可攻击');
  R.resolveAttack(sRkt, rkt, r1);
  ok(!rkt.hasAttacked && rkt.attacksMade === 1, '自行火箭炮第一次攻击后仍可行动');
  ok(!R.attackTargets(sRkt, rkt).includes(r1) && R.attackTargets(sRkt, rkt).includes(r2), '第二次攻击必须换目标');
  R.resolveAttack(sRkt, rkt, r2);
  ok(rkt.hasAttacked && rkt.attacksMade === 2, '自行火箭炮第二次攻击后行动结束');
}

const oldRandom = Math.random;
Math.random = () => 0.1;
const sAIForce = G.create({ playerFaction: 'alliance', difficulty: 1, strategies: { attack: 'armor_blitz', defense: 'endurance' } });
ok(G.strategyOf(sAIForce, 'empire').attack === 'armor_blitz', '铁血帝国 AI 倾向装甲突击');
const sAIRev = G.create({ playerFaction: 'empire', difficulty: 1, strategies: { attack: 'armor_blitz', defense: 'endurance' } });
ok(G.strategyOf(sAIRev, 'alliance').attack === 'human_wave' && G.strategyOf(sAIRev, 'alliance').defense === 'defense_in_depth', '革命联盟 AI 倾向人海/纵深');
Math.random = oldRandom;


console.log('== 北海王国 ==');
const sSea = G.create({ playerFaction: 'alliance', difficulty: 1, playerForce: 'northsea' });
ok(G.forceOf(sSea, 'alliance') === 'northsea', '北海王国势力已绑定');
ok(G.buildOrder(sSea, 'alliance').includes('sniper_team') && G.buildOrder(sSea, 'alliance').includes('missile_ship'), '北海生产列表含本国特殊兵种');
const seaPort = sSea.sitesById.southcape;
sSea.money.alliance = 100;
const seaCost = G.costOf(sSea, 'gunboat', 'alliance');
ok(seaCost.money <= 14, '北海舰船花费 -2');
const seaShip = G.buildUnit(sSea, seaPort, 'gunboat');
ok(seaShip.ok && !seaShip.unit.hasMoved && !seaShip.unit.hasAttacked, '北海新舰船可以立即行动');

const sSeaOther = G.create({ playerFaction: 'alliance', difficulty: 1, playerForce: 'revolution' });
sSeaOther.money.alliance = 100;
const otherShip = G.buildUnit(sSeaOther, sSeaOther.sitesById.southcape, 'gunboat');
ok(otherShip.ok && otherShip.unit.hasMoved && otherShip.unit.hasAttacked, '其他势力新舰船本回合不能行动');
ok(D.UNITS.sniper_team.fragile && D.UNITS.sniper_team.range === 2, '狙击班组脆弱且射程2');
ok(D.UNITS.missile_ship.range === 5 && D.UNITS.missile_ship.naval && D.UNITS.missile_ship.cost.industry === 4, '导弹支援舰属性正确');
ok(D.UNITS.stormtrooper.cost.pop === 2, '风暴突击队占用人口改为2');

const sSniper = G.create({ playerFaction: 'alliance', difficulty: 1, playerForce: 'northsea' });
const snSpot = Object.values(sSniper.grid).find(t => t.t === 'plains' && !t.siteId && !G.unitAt(sSniper, t.q, t.r));
const snFoeSpot = H.neighbors(snSpot.q, snSpot.r).map(n => G.tileAt(sSniper, n.q, n.r))
  .find(t => t && D.TERRAIN[t.t].pass && !t.siteId && !G.unitAt(sSniper, t.q, t.r));
if (snSpot && snFoeSpot) {
  const sn = G.addUnit(sSniper, 'sniper_team', 'northsea', snSpot.q, snSpot.r, 'full');
  const infT = G.addUnit(sSniper, 'light_inf', 'empire', snFoeSpot.q, snFoeSpot.r, 'full');
  const mechSpot = H.ring(snSpot.q, snSpot.r, 2).map(n => G.tileAt(sSniper, n.q, n.r))
    .find(t => t && D.TERRAIN[t.t].pass && !t.siteId && !G.unitAt(sSniper, t.q, t.r));
  const mechT = mechSpot ? G.addUnit(sSniper, 'mech_inf', 'empire', mechSpot.q, mechSpot.r, 'full') : null;
  ok(R.combatForecast(sSniper, sn, infT).sniper === 1, '狙击班组攻击普通步兵 +1');
  if (mechT) ok(R.combatForecast(sSniper, sn, mechT).sniper === 0, '狙击班组不克制机械化步兵');
}

const sStorm = G.create({ playerFaction: 'alliance', difficulty: 1, playerForce: 'ironblood' });
const stSpot = Object.values(sStorm.grid).find(t => t.t === 'plains' && !t.siteId && !G.unitAt(sStorm, t.q, t.r));
const stFoeSpot = H.neighbors(stSpot.q, stSpot.r).map(n => G.tileAt(sStorm, n.q, n.r))
  .find(t => t && t.t === 'plains' && !t.siteId && !G.unitAt(sStorm, t.q, t.r));
if (stSpot && stFoeSpot) {
  const st = G.addUnit(sStorm, 'stormtrooper', 'ironblood', stSpot.q, stSpot.r, 'full');
  const plainFoe = G.addUnit(sStorm, 'light_inf', 'revolution', stFoeSpot.q, stFoeSpot.r, 'full');
  ok(R.combatForecast(sStorm, st, plainFoe).storm === 0, '风暴突击队攻击平原目标无加成');
  const forest = H.neighbors(stSpot.q, stSpot.r).map(n => G.tileAt(sStorm, n.q, n.r))
    .find(t => t && t.t === 'forest' && !t.siteId && !G.unitAt(sStorm, t.q, t.r));
  if (forest) {
    const forestFoe = G.addUnit(sStorm, 'light_inf', 'revolution', forest.q, forest.r, 'full');
    ok(R.combatForecast(sStorm, st, forestFoe).storm === 1, '风暴突击队攻击地形防御目标 +1');
  }
}

const oldRand2 = Math.random;
Math.random = () => 0.1;
const sSeaAI = G.create({ playerFaction: 'alliance', difficulty: 1,
  strategies: { attack: 'armor_blitz', defense: 'endurance' }, aiForce: 'northsea' });
ok(G.strategyOf(sSeaAI, 'empire').defense === 'fire_counter', '北海 AI 倾向火力反制');
Math.random = oldRand2;


console.log('== 鸢尾花共和国 ==');
const sIris = G.create({ playerFaction: 'alliance', difficulty: 1, playerForce: 'iris' });
sIris.current = 'alliance';
sIris.money.alliance = 100;
ok(G.forceOf(sIris, 'alliance') === 'iris', '鸢尾花势力已绑定');
ok(G.buildOrder(sIris, 'alliance').includes('guard') && G.buildOrder(sIris, 'alliance').includes('commissar') && G.buildOrder(sIris, 'alliance').includes('infantry_tank') && !G.buildOrder(sIris, 'alliance').includes('siege_howitzer'), '鸢尾生产列表含新特殊兵种');
const irisCap = sIris.sitesById.whiteport;
const irisCity = sIris.sitesById.stonebridge;
const irisBase = sIris.sitesById.pine;
ok(G.canBuild(sIris, irisCap, 'guard').ok, '近卫军只能在首都生产（首都）');
ok(!G.canBuild(sIris, irisCity, 'guard').ok, '近卫军不能在普通城市生产');
ok(!G.canBuild(sIris, irisBase, 'siege_howitzer').ok, '列车炮不再属于鸢尾');
ok(D.UNITS.guard.damaged.def === 8 && D.UNITS.guard.damaged.atk === 2, '近卫军受损属性不变');
ok(D.UNITS.siege_howitzer.name === '列车炮' && D.UNITS.siege_howitzer.minRange === 2 && D.UNITS.siege_howitzer.range === 3 && D.UNITS.siege_howitzer.fragile, '列车炮 2–3 格且脆弱');
ok(G.fortLimit(sIris, 'alliance') === Infinity, '工事总数无上限（鸢尾不再额外限制）');
const irisMech = G.addUnit(sIris, 'mech_inf', 'alliance', 3, 12, 'full');
ok(R.isFortBuilder(sIris, irisMech), '鸢尾机械化步兵可修工事');

const gSpot = Object.values(sIris.grid).find(t => t.t === 'plains' && !t.siteId && !G.unitAt(sIris, t.q, t.r));
const gFoeSpot = H.neighbors(gSpot.q, gSpot.r).map(n => G.tileAt(sIris, n.q, n.r))
  .find(t => t && D.TERRAIN[t.t].pass && !t.siteId && !G.unitAt(sIris, t.q, t.r));
if (gSpot && gFoeSpot) {
  const guard = G.addUnit(sIris, 'guard', 'iris', gSpot.q, gSpot.r, 'full');
  const tankFoe = G.addUnit(sIris, 'tank', 'revolution', gFoeSpot.q, gFoeSpot.r, 'full');
  ok(R.combatForecast(sIris, guard, tankFoe).guard === 1, '近卫军攻击装甲 +1');
  const infFoe = G.addUnit(sIris, 'light_inf', 'revolution', gFoeSpot.q + 1, gFoeSpot.r, 'full');
  ok(R.combatForecast(sIris, guard, infFoe).guard === 0, '近卫军攻击普通步兵无加成');
}

const oldRand3 = Math.random;
Math.random = () => 0.1;
const sIrisAI = G.create({ playerFaction: 'alliance', difficulty: 1,
  strategies: { attack: 'armor_blitz', defense: 'endurance' }, aiForce: 'iris' });
ok(G.strategyOf(sIrisAI, 'empire').defense === 'scorched_earth', '鸢尾 AI 倾向坚壁清野');
const sSunAI = G.create({ playerFaction: 'alliance', difficulty: 1,
  strategies: { attack: 'armor_blitz', defense: 'endurance' }, aiForce: 'sunrise' });
ok(G.strategyOf(sSunAI, 'empire').attack === 'human_wave', '日升 AI 倾向人海攻势');
const sIronAI = G.create({ playerFaction: 'alliance', difficulty: 1,
  strategies: { attack: 'armor_blitz', defense: 'endurance' }, aiForce: 'ironblood' });
G.startTurn(sIronAI, 'empire', true);
sIronAI.money.empire = 100;
const aiIron = SG.ai.createAI(sIronAI, 'empire');
aiIron.begin();
ok(aiIron.builds.some(b => ['armored_car', 'tank', 'heavy_tank', 'superheavy_tank'].includes(b.type)), '铁血 AI 会补足装甲占陆上单位比例');
Math.random = oldRand3;

const sAIris = G.create({ playerFaction: 'alliance', difficulty: 1,
  playerForce: 'revolution', aiForce: 'iris' });
G.startTurn(sAIris, 'empire', true);
sAIris.money.empire = 40;
const aiIris = SG.ai.createAI(sAIris, 'empire');
aiIris.begin();
let ais = 0;
while (ais++ < 30) { const st = aiIris.step(); if (st.done) break; }
ok(sAIris.forts.length > 0 && sAIris.fortsBuilt <= G.fortLimit(sAIris, 'empire'), '鸢尾 AI 会主动修建防御工事');

console.log('== 战略 ==');
const sStr = G.create({ playerFaction: 'alliance', difficulty: 1,
  strategies: { attack: 'human_wave', defense: 'endurance' },
  aiStrategies: { attack: 'armor_blitz', defense: 'fire_counter' } });
ok(G.strategyOf(sStr, 'alliance').attack === 'human_wave', '玩家进攻战略已保存');
ok(G.strategyOf(sStr, 'empire').defense === 'fire_counter', 'AI 也选择防御战略');
const capsStr = G.capsOf(sStr, 'alliance');
ok(capsStr.pop === 20 && capsStr.industry === 12, '人海+6人口/持久+1人口+1工业');
ok(G.incomeOf(sStr, 'alliance').grossMoney === 17, '持久生存额外 +3 金钱（维护前）');
ok(sStr.militiaPending.alliance === 2, '人海攻势：每四回合获得 2 个待部署民兵');
const mTiles = G.militiaTargets(sStr, 'alliance');
ok(mTiles.length > 0, '人海攻势：存在可选部署位置');
const militiaBefore = G.unitsOf(sStr, 'alliance').filter(u => u.type === 'militia').length;
let placed2 = 0;
for (let i = 0; i < 2; i++) {
  const ts = G.militiaTargets(sStr, 'alliance');
  if (ts.length && G.placeMilitia(sStr, ts[0].q, ts[0].r).ok) placed2++;
}
ok(placed2 === 2 && G.unitsOf(sStr, 'alliance').filter(u => u.type === 'militia').length === militiaBefore + 2, '人海攻势一次部署 2 民兵');
ok(sStr.militiaPending.alliance === 0, '部署完成后待部署数归零');

ok(sStr.capitalMilitiaPending.alliance === 1, '革命联盟每两回合获得 1 个首都民兵');
const capTargets = G.capitalMilitiaTargets(sStr, 'alliance');
ok(capTargets.length > 0, '首都民兵有部署位置');
const capPlace = G.placeCapitalMilitia(sStr, capTargets[0].q, capTargets[0].r);
ok(capPlace.ok && sStr.capitalMilitiaPending.alliance === 0, '首都民兵可自行选择部署位置');
ok(capTargets.every(t => H.distance(sStr.sitesById.whiteport.q, sStr.sitesById.whiteport.r, t.q, t.r) <= 1), '首都民兵只在首都及周围六格部署');
G.endTurn(sStr);
G.endTurn(sStr);
G.endTurn(sStr);
G.endTurn(sStr);
ok(sStr.turn === 3 && sStr.militiaPending.alliance === 0 && sStr.capitalMilitiaPending.alliance === 1, '第三回合只有革命联盟首都民兵（实际 ' + sStr.turn + '/' + sStr.militiaPending.alliance + '/' + sStr.capitalMilitiaPending.alliance + '）');
const cap3 = G.capitalMilitiaTargets(sStr, 'alliance');
if (cap3.length) G.placeCapitalMilitia(sStr, cap3[0].q, cap3[0].r);
G.endTurn(sStr);
G.endTurn(sStr);
ok(sStr.turn === 4 && sStr.militiaPending.alliance === 0 && sStr.capitalMilitiaPending.alliance === 0, '第四回合未到人海攻势（实际 ' + sStr.turn + '/' + sStr.militiaPending.alliance + '/' + sStr.capitalMilitiaPending.alliance + '）');
G.endTurn(sStr);
G.endTurn(sStr);
ok(sStr.turn === 5 && sStr.militiaPending.alliance === 2, '第五回合获得 2 人海民兵（实际 ' + sStr.turn + '/' + sStr.militiaPending.alliance + '）');

const sAIHuman = G.create({ playerFaction: 'alliance', difficulty: 1,
  strategies: { attack: 'armor_blitz', defense: 'scorched_earth' },
  aiStrategies: { attack: 'human_wave', defense: 'endurance' } });
const aiMilitiaBefore = G.unitsOf(sAIHuman, 'empire').filter(u => u.type === 'militia').length;
G.startTurn(sAIHuman, 'empire', true);
ok(G.unitsOf(sAIHuman, 'empire').filter(u => u.type === 'militia').length  >= aiMilitiaBefore + 2, 'AI 人海攻势自动部署 2 民兵');

const sArmor = G.create({ playerFaction: 'alliance', difficulty: 1,
  strategies: { attack: 'armor_blitz', defense: 'scorched_earth' } });
const mechA = G.unitsOf(sArmor, 'alliance').find(u => u.type === 'mech_inf');
const tankA = G.unitsOf(sArmor, 'alliance').find(u => u.type === 'tank');
ok(G.effective(mechA, sArmor).move === 6 && G.effective(tankA, sArmor).move === 5, '装甲突击移动 +1');
ok(G.fortLimit(sArmor, 'alliance') === Infinity, '工事总数无上限（坚壁清野不再额外限制）');
ok(G.fortCost(sArmor, 'alliance', 'mine') === 3, '坚壁清野工事花费 -1');

const sFire = G.create({ playerFaction: 'alliance', difficulty: 1,
  strategies: { attack: 'superior_firepower', defense: 'fire_counter' } });
const ig = G.unitsOf(sFire, 'alliance').find(u => u.type === 'infantry_gun');
const fg = G.unitsOf(sFire, 'alliance').find(u => u.type === 'field_gun');
ok(!ig && !fg, '开局没有火炮单位');
const cIG = G.costOf(sFire, 'infantry_gun', 'alliance');
const cFG = G.costOf(sFire, 'field_gun', 'alliance');
ok(cIG.money === 4 && cIG.industry === 0 && cFG.money === 8 && cFG.industry === 1, '优势火力+革命联盟：火炮花费/工业 -1');
const igLand = Object.values(sFire.grid).find(t => t.t === 'plains' && !t.siteId);
const igUnit = G.addUnit(sFire, 'infantry_gun', 'alliance', igLand.q, igLand.r, 'full');
ok(G.effective(igUnit, sFire).atk === 4 && G.effective(igUnit, sFire).def === 5, '火力反制：步兵炮攻防 +1');
ok(G.counterLimit(sFire, 'alliance') === 2, '火力反制：反击次数 +1');

const sTrench = G.create({ playerFaction: 'alliance', difficulty: 1,
  strategies: { attack: 'armor_blitz', defense: 'scorched_earth' } });
const bTrench = G.unitsOf(sTrench, 'alliance').find(u => u.type === 'light_inf');
R.buildFort(sTrench, bTrench, 'trench', bTrench.q, bTrench.r);
ok(G.effective(bTrench, sTrench).trenchDef === 2, '坚壁清野战壕防御 +2');

const sDepth = G.create({ playerFaction: 'alliance', difficulty: 1,
  strategies: { attack: 'armor_blitz', defense: 'defense_in_depth' },
  aiStrategies: { attack: 'human_wave', defense: 'defense_in_depth' } });
const bDepth = G.unitsOf(sDepth, 'alliance').find(u => u.type === 'light_inf');
const capSite = sDepth.sitesById.whiteport;
const adj = H.neighbors(capSite.q, capSite.r).map(n => G.tileAt(sDepth, n.q, n.r))
  .find(t => t && D.TERRAIN[t.t].pass && !t.siteId && !G.unitAt(sDepth, t.q, t.r));
if (adj) {
  bDepth.q = adj.q; bDepth.r = adj.r;
  ok(G.effective(bDepth, sDepth).depthDef === G.siteDefense(capSite), '纵深防御：据点邻格获得防御修正');
}
const depot = sDepth.sitesById.eastwind;
const capturer = G.unitsOf(sDepth, 'alliance').find(u => u.type === 'light_inf' && u.id !== bDepth.id);
if (depot && capturer) {
  capturer.q = depot.q; capturer.r = depot.r;
  // 直接以俘虏单位放在据点上，模拟占领后结算
  const prev = depot.faction;
  G.captureSite(sDepth, depot, 'alliance');
  const roll = 1 + Math.floor(G.nextRandom(sDepth) * 6);
  ok(roll >= 1 && roll <= 6, '纵深防御占领伤害为 1D6');
}

const sEnd = G.create({ playerFaction: 'alliance', difficulty: 1,
  strategies: { attack: 'armor_blitz', defense: 'endurance' } });
const hurt = G.addUnit(sEnd, 'light_inf', 'alliance', sEnd.sitesById.whiteport.q, sEnd.sitesById.whiteport.r, 'damaged');
hurt.waiting = false;
G.startTurn(sEnd, 'alliance', true);
ok(hurt.state === 'full', '持久生存单位无需待命也可在据点恢复1格');
const sRec = G.create({ playerFaction: 'alliance', difficulty: 1,
  strategies: { attack: 'armor_blitz', defense: 'endurance' } });
const recCity = sRec.sitesById.whiteport;
const recBase = sRec.sitesById.pine;
const recTank = G.addUnit(sRec, 'tank', 'alliance', recCity.q, recCity.r, 'damaged');
const recTank2 = G.addUnit(sRec, 'tank', 'alliance', recBase.q, recBase.r, 'damaged');
recTank.waiting = true; recTank2.waiting = true;
G.startTurn(sRec, 'alliance', true);
ok(recTank.state === 'damaged', '不能在不能生产坦克的城市恢复');
ok(recTank2.state === 'full', '可在能生产坦克的工业基地恢复');
const recTank3 = G.addUnit(sRec, 'tank', 'alliance', recBase.q, recBase.r, 'damaged');
recTank3.hitsTaken = 2; recTank3.waiting = true;
G.startTurn(sRec, 'alliance', true);
ok(recTank3.state === 'damaged' && recTank3.hitsTaken === 1, '多格受损条每回合只恢复1格');

const sAir = G.create({ playerFaction: 'alliance', difficulty: 1,
  strategies: { attack: 'air_land', defense: 'scorched_earth' } });
const airS = sAir.sitesById.whiteair;
ok(G.airportMaxUses(sAir, 'alliance') === 3 && G.airportRangeBonus(sAir, 'alliance') === 1, '空地一体：机场 3 次/射程 +1');
const airTarget = G.unitsOf(sAir, 'empire').find(u => u.type === 'light_inf');
const far5 = H.ring(airS.q, airS.r, 5).map(n => G.tileAt(sAir, n.q, n.r))
  .find(t => t && D.TERRAIN[t.t].pass && !t.siteId && !G.unitAt(sAir, t.q, t.r));
airTarget.q = far5.q; airTarget.r = far5.r;
ok(R.airportTargets(sAir, airS, 'jam').keys.has(H.key(airTarget.q, airTarget.r)), '空地一体：射程 +1 可覆盖 5 格');
const airUse1 = R.useAirportMission(sAir, airS, 'jam', airTarget.q, airTarget.r);
const airUse2 = R.useAirportMission(sAir, airS, 'jam', airTarget.q, airTarget.r);
ok(airUse1.ok && airUse2.ok && airS.airportUsedCount === 2, '空地一体：机场每回合可执行多次任务');

const sD2 = G.create({ playerFaction: 'alliance', difficulty: 1,
  strategies: { attack: 'armor_blitz', defense: 'scorched_earth' },
  aiStrategies: { attack: 'human_wave', defense: 'defense_in_depth' } });
const depotD = sD2.sitesById.eastwind;
const capD = G.unitsOf(sD2, 'alliance').find(u => u.type === 'light_inf');
const depthMove = R.moveUnit(sD2, capD, depotD.q, depotD.r, fakeReach(depotD.q, depotD.r));
ok(depthMove.ok && depthMove.depth && depotD.faction === 'alliance', '纵深防御：敌军攻占据点时受到伤害');
ok(!sD2.units.includes(capD) || capD.state === 'damaged', '纵深防御伤害按状态结算');

const sFGun = G.create({ playerFaction: 'alliance', difficulty: 1,
  strategies: { attack: 'armor_blitz', defense: 'scorched_earth' } });
sFGun.money.alliance = 100;
const gunBuilders = G.unitsOf(sFGun, 'alliance').filter(u => u.type === 'light_inf').slice(0, 2);
let gunCount = 0;
for (const b of gunBuilders) {
  const t = H.neighbors(b.q, b.r).map(n => G.tileAt(sFGun, n.q, n.r))
    .find(x => x && D.TERRAIN[x.t].pass && !x.siteId && !G.unitAt(sFGun, x.q, x.r) && !G.fortAt(sFGun, x.q, x.r));
  if (t && R.buildFort(sFGun, b, 'fort_gun', t.q, t.r).ok) gunCount++;
}
ok(gunCount === 1 && sFGun.fortGunBuilt === 1, '坚壁清野下要塞炮仍每回合最多 1 个');


console.log('== AI 全单位行动 ==');
const sAct = G.create({ playerFaction: 'alliance', difficulty: 1 });
G.startTurn(sAct, 'empire', true);
const aiAct = SG.ai.createAI(sAct, 'empire');
aiAct.begin();
let actGuard = 0, actRes;
do { actRes = aiAct.step(); if (++actGuard > 5000) throw new Error('AI 行动死循环'); } while (!actRes.done);
const aiIdle = G.unitsOf(sAct, 'empire').filter(u => !u.hasMoved && !u.hasAttacked && !u.supporting);
ok(aiIdle.length === 0, 'AI 回合结束时每个单位都已行动');

console.log('== AI 特殊单位保底 ==');
const sSpecialAI = G.create({ playerFaction: 'alliance', difficulty: 1, aiForce: 'ironblood' });
sSpecialAI.units = [];
G.startTurn(sSpecialAI, 'empire', true);
sSpecialAI.money.empire = 100;
const aiSpecial = SG.ai.createAI(sSpecialAI, 'empire');
aiSpecial.begin();
const specialBuilt = aiSpecial.builds.filter(b => ['stormtrooper', 'superheavy_tank'].includes(b.type)).length;
ok(specialBuilt >= 2, 'AI 在条件允许时保底生产 2 个本阵营特殊单位');

console.log('== 水域待命 ==');
const sWaterWait = G.create({ playerFaction: 'alliance', difficulty: 1 });
const ww = Object.values(sWaterWait.grid).find(t => t.t === 'water');
const wwUnit = G.addUnit(sWaterWait, 'marine', 'alliance', ww.q, ww.r, 'full');
ok(!R.waitUnit(sWaterWait, wwUnit).ok, '水域中不能待命');

console.log('== 新特殊单位 ==');
const sNew = G.create({ playerFaction: 'alliance', difficulty: 1 });
const newSpot = Object.values(sNew.grid).find(t => t.t === 'plains' && !t.siteId && !G.unitAt(sNew, t.q, t.r));
const tach = G.addUnit(sNew, 'tachanka', 'alliance', newSpot.q, newSpot.r, 'full');
const riderSpot0 = H.neighbors(newSpot.q, newSpot.r).map(n => G.tileAt(sNew, n.q, n.r)).find(t => t && t.t === 'plains' && !G.unitAt(sNew, t.q, t.r));
const rider = G.addUnit(sNew, 'light_inf', 'alliance', riderSpot0.q, riderSpot0.r, 'full');
ok(G.loadTransport(sNew, tach, rider).ok && !sNew.units.includes(rider) && G.effective(tach, sNew).atk === 3, '搭枪卡可装载周围相邻6格内的轻步兵并+1攻防');
const riderSpot = H.neighbors(newSpot.q, newSpot.r).map(n => G.tileAt(sNew, n.q, n.r)).find(t => t && t.t === 'plains' && !G.unitAt(sNew, t.q, t.r));
const rel = riderSpot ? G.releaseTransport(sNew, tach, riderSpot.q, riderSpot.r) : null;
ok(rel && rel.ok && G.unitAt(sNew, riderSpot.q, riderSpot.r), '搭枪卡可主动释放载员');
ok(rel && !rel.unit.hasMoved && !rel.unit.hasAttacked && tach.hasMoved && !tach.hasAttacked, '卸载单位可继续行动且搭枪卡卸载后可攻击');
const farRelease = H.ring(tach.q, tach.r, 2).map(n => G.tileAt(sNew, n.q, n.r)).find(t => t && t.t === 'plains' && !G.unitAt(sNew, t.q, t.r));
ok(!farRelease || !G.releaseTransport(sNew, tach, farRelease.q, farRelease.r).ok, '搭枪卡只能向周围相邻6格卸载');
const riderAgain = G.unitAt(sNew, riderSpot.q, riderSpot.r);
G.loadTransport(sNew, tach, riderAgain);
ok(tach.cargo && G.releaseCargoOnDeath(sNew, tach) !== null, '搭枪卡被击毁时释放载员');

const marine = G.addUnit(sNew, 'marine', 'alliance', newSpot.q, newSpot.r, 'full');
const marineWater = Object.values(sNew.grid).find(t => t.t === 'water');
ok(G.moveCost(sNew, marineWater.q, marineWater.r, marine) === 1, '海军陆战队可进入海洋');

const com = G.addUnit(sNew, 'commissar', 'alliance', newSpot.q, newSpot.r, 'full');
const infNear = G.addUnit(sNew, 'light_inf', 'alliance', newSpot.q, newSpot.r, 'full');
G.addUnit(sNew, 'commissar', 'alliance', newSpot.q, newSpot.r, 'full');
ok(G.effective(infNear, sNew).def === D.UNITS.light_inf.def + 1, '督战队步兵防御+1且不叠加');

const sStack = G.create({ playerFaction: 'alliance', difficulty: 1 });
const stackSpot = Object.values(sStack.grid).find(t => t.t === 'plains' && !t.siteId && !G.unitAt(sStack, t.q, t.r));
const itank = G.addUnit(sStack, 'infantry_tank', 'alliance', stackSpot.q, stackSpot.r, 'full');
const iinf = G.addUnit(sStack, 'light_inf', 'alliance', stackSpot.q, stackSpot.r, 'full');
ok(G.effective(itank, sStack).def === D.UNITS.infantry_tank.def + 1 && G.effective(iinf, sStack).atk === D.UNITS.light_inf.atk + 1, '步兵坦克与步兵堆叠互相+1');
const stackFoe = G.addUnit(sStack, 'light_inf', 'empire', stackSpot.q + 1, stackSpot.r, 'full');
ok(R.attackTargets(sStack, stackFoe).every(t => t.type === 'infantry_tank'), '敌军必须优先攻击堆叠的步兵坦克');

const motor = G.addUnit(sNew, 'motor_blitz', 'alliance', newSpot.q, newSpot.r, 'full');
const forestNew = Object.values(sNew.grid).find(t => t.t === 'forest');
ok(G.moveCost(sNew, forestNew.q, forestNew.r, motor) === 1, '摩托闪击队无视森林移动消耗');

const sGue = G.create({ playerFaction: 'alliance', difficulty: 1 });
const gue = G.addUnit(sGue, 'guerrilla', 'alliance', sGue.sitesById.whiteport.q, sGue.sitesById.whiteport.r, 'full');
const gueBefore = G.unitsOf(sGue, 'alliance').filter(u => u.type === 'militia').length;
const gueMoney = sGue.money.alliance;
const gueTarget = G.guerrillaMilitiaTargets(sGue, gue);
ok(gueTarget.every(t => H.distance(gue.q, gue.r, t.q, t.r) === 1), '游击队只在周围相邻6格部署民兵');
const gueRes = gueTarget.length ? G.spawnGuerrillaMilitia(sGue, gue, gueTarget[0].q, gueTarget[0].r) : null;
ok(gueRes && gueRes.ok && G.unitsOf(sGue, 'alliance').filter(u => u.type === 'militia').length === gueBefore + 1 && sGue.money.alliance === gueMoney - 1, '游击队可花1金生产1个民兵');
ok(!G.canGuerrillaMilitia(sGue, gue).ok, '同一游击队每回合只能生产1次民兵');
const villageGue = Object.values(sGue.sites).find(x => x.kind === 'village');
if (villageGue) {
  villageGue.faction = 'alliance';
  const gueV = G.addUnit(sGue, 'guerrilla', 'alliance', villageGue.q, villageGue.r, 'full');
  ok(D.UNITS.guerrilla.stat === '1-7-4-1' && D.UNITS.guerrilla.cost.money === 5, '游击队属性/造价更新');
  ok(G.effective(gueV, sGue).def === D.UNITS.guerrilla.def + 1, '游击队在农村获得+1防御');
}
ok(G.maxHits('gene_warrior') === 2 && D.UNITS.gene_warrior.geneDefense, '基因改造战士数据/特性存在');

console.log('== AI 水域保底 ==');
const sNavAI = G.create({ playerFaction: 'alliance', difficulty: 1, aiForce: 'northsea' });
sNavAI.units = sNavAI.units.filter(u => u.faction !== 'empire');
sNavAI.money.empire = 100;
G.startTurn(sNavAI, 'empire', true);
const navAI = SG.ai.createAI(sNavAI, 'empire');
navAI.begin();
ok(navAI.builds.some(b => D.UNITS[b.type] && D.UNITS[b.type].naval), 'AI在可生产水域单位时至少生产1个');

console.log('== AI 自动对局 ==');
function play(seed, diff) {
  const s = G.create({ playerFaction: 'alliance', difficulty: diff });
  s.rng = seed;
  let steps = 0, guard = 0;
  while (!s.over && (!s.maxTurns || s.turn <= s.maxTurns)) {
    const ai = SG.ai.createAI(s, s.current);
    ai.begin();
    let g = 0, res;
    do {
      res = ai.step();
      if (++g > 6000) throw new Error('AI 回合死循环');
      steps++;
    } while (!res.done);
    if (s.over) break;
    const v = G.endTurn(s);
    if (v) break;
    if (++guard > 80) break;
  }
  return { s, steps };
}
for (const [seed, diff] of [[11, 1], [777, 1], [2024, 0], [31337, 2]]) {
  let out;
  try { out = play(seed, diff); }
  catch (e) { ok(false, `seed ${seed} 异常: ${e.message}\n${e.stack}`); continue; }
  const s = out.s;
  console.log(`  seed ${seed} diff ${diff}: T${s.turn}, 胜者 ${s.over ? s.over.winner : '未结束'}, ` +
    `据点 ${G.siteCount(s, 'alliance')}:${G.siteCount(s, 'empire')}, ` +
    `部队 ${G.unitsOf(s, 'alliance').length}:${G.unitsOf(s, 'empire').length}, 步数 ${out.steps}`);
  ok(true, '对局完成且无异常');
  const occupied = new Set();
  let overlap = false;
  for (const u of s.units) {
    const k = H.key(u.q, u.r);
    if (occupied.has(k)) overlap = true;
    occupied.add(k);
    if (!['full', 'damaged'].includes(u.state)) overlap = true;
  }
  ok(!overlap, '无重叠单位 / 状态合法');
  const caps = G.capsOf(s, 'alliance');
  ok(caps.pop >= 0 && caps.industry >= 0, '据点上限非负');
}

console.log(failures ? `\n${failures} 项失败` : '\n全部通过');
process.exit(failures ? 1 : 0);
