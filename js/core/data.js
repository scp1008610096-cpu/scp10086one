/* ============================================================
 * 钢铁洪流 · 数据层（兵棋推演版）
 * 单位：攻-防-移-射 / 造价：金-人-工 / 据点：城市·工业区·港口
 * 纯逻辑文件：浏览器与 Node 均可加载
 * ============================================================ */
(function (root) {
  'use strict';
  const SG = (root.SG = root.SG || {});

  /* ---------------- 势力 ---------------- */
  const FORCES = {
    revolution: {
      id: 'revolution', name: '革命联盟', short: '革命', adj: '革命军',
      color: '#8a1f2d', dark: '#3f0c14', light: '#d9a0a6', text: '#f8e7e3', icon: '#e8c56a',
      bonus: '全军单位金钱花费 -1（最低1）；每两回合在首都周围获得1名待部署民兵',
      motto: '把土地分给人民，把旧秩序埋进战壕。'
    },
    ironblood: {
      id: 'ironblood', name: '铁血帝国', short: '帝国', adj: '帝国军',
      color: '#3b2a20', dark: '#17100c', light: '#c2a68f', text: '#f3e5d6', icon: '#df4a45',
      bonus: '轻型坦克、坦克攻击时掷2D6取高',
      motto: '用履带碾过平原，让敌人跪在钢铁之下。'
    },
    northsea: {
      id: 'northsea', name: '北海王国', short: '北海', adj: '北海舰队',
      color: '#c97d7d', dark: '#6f343a', light: '#e8b6b6', text: '#fbefef', icon: '#243f6b',
      bonus: '舰船花费 -2；新部署舰船本回合可直接行动',
      motto: '谁掌握海面，谁就掌握战争的侧翼。'
    },
    iris: {
      id: 'iris', name: '鸢尾花共和国', short: '鸢尾', adj: '鸢尾军',
      color: '#234a73', dark: '#10243c', light: '#a8c4e0', text: '#f2f6fb', icon: '#f6f9fc',
      bonus: '机械化步兵可构筑工事；每回合工事上限 +1',
      motto: '用堑壕守住每一寸土地，再让钢铁缓慢碾过去。'
    },
    sunrise: {
      id: 'sunrise', name: '日升帝国', short: '日升', adj: '日升军',
      color: '#b58a3c', dark: '#5c3e14', light: '#e2c68a', text: '#fff8e8', icon: '#f8f4e8',
      bonus: '轻步兵/敢死队每回合可攻击两次；第二次攻击未消灭目标时自身仍受反击',
      motto: '让步兵的脚步先于旗帜抵达敌城。'
    },
    eastland: {
      id: 'eastland', name: '东陆共和国', short: '东陆', adj: '东陆军',
      color: '#b23b3b', dark: '#5e1717', light: '#e0a3a3', text: '#fff0e8', icon: '#e8d7b0',
      bonus: '人口上限+6、工业上限+2；民兵/轻步兵移动+1；民兵防御+1并无视地形移动消耗',
      motto: '用脚步和炮火，把敌人装进包围圈。'
    },
    newworld: {
      id: 'newworld', name: '新大陆合众国', short: '新大陆', adj: '新大陆军',
      color: '#1f3f6e', dark: '#0b1d38', light: '#9fb8d8', text: '#eef5ff', icon: '#d94a7a',
      bonus: '工业上限+4；工厂可生产野战炮/坦克；机场获得战术核打击',
      motto: '用钢铁和海权，把战争带到敌人的天空。'
    }
  };

  /* 西线 / 东线是地图阵线；具体势力由开局选择决定。 */
  const FACTIONS = {
    alliance: {
      id: 'alliance', name: '西线阵线', short: '西线', adj: '西线部队',
      color: '#8a1f2d', dark: '#3f0c14', light: '#d9a0a6', text: '#f8e7e3', icon: '#e8c56a',
      motto: ''
    },
    empire: {
      id: 'empire', name: '东线阵线', short: '东线', adj: '东线部队',
      color: '#3b2a20', dark: '#17100c', light: '#c2a68f', text: '#f3e5d6', icon: '#df4a45',
      motto: ''
    },
    ai3: {
      id: 'ai3', name: 'AI 2', short: 'AI2', adj: 'AI 2 军',
      color: '#6d4f8a', dark: '#2b1d3a', light: '#cbb8df', text: '#f4ecff', icon: '#e4d6f5',
      motto: ''
    },
    ai4: {
      id: 'ai4', name: 'AI 3', short: 'AI3', adj: 'AI 3 军',
      color: '#2f6d68', dark: '#12302e', light: '#a8d5cf', text: '#effaf8', icon: '#d5f0ec',
      motto: ''
    },
    ai5: {
      id: 'ai5', name: 'AI 4', short: 'AI4', adj: 'AI 4 军',
      color: '#8a5a2f', dark: '#3d2410', light: '#e0bd94', text: '#fff4e6', icon: '#f0d3ad',
      motto: ''
    },
    ai6: {
      id: 'ai6', name: 'AI 5', short: 'AI5', adj: 'AI 5 军',
      color: '#5e6b3a', dark: '#293018', light: '#cbd6a7', text: '#f7fbe8', icon: '#e5edc6',
      motto: ''
    },
    neutral: {
      id: 'neutral', name: '中立守备队', short: '中立', adj: '守备队',
      color: '#8b8878', dark: '#565347', light: '#cfcabb', text: '#f0ecdf', icon: '#f0ecdf',
      motto: ''
    }
  };

  /* ---------------- 地形 ----------------
   * def 为“防御附加值”，直接加到单位防御力上（整数，便于推演）
   */
  const UNIT_CATEGORIES = {
    infantry: { id: 'infantry', name: '步兵' },
    artillery: { id: 'artillery', name: '火炮' },
    armor: { id: 'armor', name: '装甲' },
    ship: { id: 'ship', name: '舰艇' }
  };

  const TERRAIN = {
    plains: { id: 'plains', name: '平原', cost: 1, def: 0, atk: 0, pass: true, desc: '开阔地，便于装甲部队机动，无攻防修正。' },
    forest: { id: 'forest', name: '森林', cost: 2, def: 1, atk: 0, pass: true, desc: '树线提供掩护，防御 +1，行军速度下降。' },
    hills: { id: 'hills', name: '丘陵', cost: 2, def: 1, atk: 0, pass: true, desc: '居高临下，防御 +1。' },
    mountain: { id: 'mountain', name: '山地', cost: 3, def: 2, atk: 0, pass: true, noVehicle: true, desc: '装甲车辆无法通行，防御 +2，步兵的天然壁垒。' },
    river: { id: 'river', name: '河流', cost: 3, def: 0, atk: 0, pass: true, desc: '涉水而行，行动迟缓，难以设防。' },
    water: { id: 'water', name: '海洋', cost: 99, def: 0, atk: 0, pass: false, desc: '陆军无法进入。' },
    city: { id: 'city', name: '据点', cost: 1, def: 0, atk: 0, pass: true, desc: '据点提供额外防御与产出。' }
  };

  /* ---------------- 据点类型 ---------------- */
  const SITE_KINDS = {
    city: { id: 'city', name: '城市', desc: '提供金钱与人力上限', color: '#c9b98c' },
    village: { id: 'village', name: '农村', desc: '提供少量金钱与人力', color: '#a8a071' },
    factory: { id: 'factory', name: '工厂', desc: '提供少量金钱与工业', color: '#a9895c' },
    industrial_base: { id: 'industrial_base', name: '工业基地', desc: '提供更多金钱与工业', color: '#c09a5c' },
    port: { id: 'port', name: '港口', desc: '提供金钱与工业上限', color: '#6f9ab0' },
    airport: { id: 'airport', name: '机场', desc: '可执行空中任务', color: '#8f9aa8' }
  };

  /* 据点产出：按类型固定；首都为城市的强化版
   * 首都 6 金 / 8 人力 / 2 工业
   * 城市 4 金 / 5 人力
   * 农村 1 金 / 1 人力
   * 工厂 1 金 / 3 工业
   * 工业基地 2 金 / 7 工业
   * 港口 2 金 / 2 工业
   */
  const SITE_YIELDS = {
    capital: { money: 6, pop: 8, industry: 2 },
    city: { money: 4, pop: 5, industry: 1 },
    village: { money: 1, pop: 1, industry: 0 },
    factory: { money: 1, pop: 0, industry: 3 },
    industrial_base: { money: 2, pop: 0, industry: 6 },
    port: { money: 2, pop: 0, industry: 2 },
    airport: { money: 0, pop: 0, industry: 0 }
  };

  /* 据点防御附加值：农村 +1，城市/首都 +2，工业区 +2，港口 +1，机场 +2 */
  const SITE_DEF = { city: 2, village: 1, factory: 2, industrial_base: 2, port: 1, airport: 2 };

  /* ---------------- 单位 ----------------
   * stat: 攻-防-移-射
   * cost: 金钱-人力-工业
   * deploy: 可部署的据点类型
   * naval: 只能在水域（河流/海洋）移动
   */
  const UNITS = {
    militia: {
      id: 'militia', category: 'infantry', name: '民兵', short: 'MIL', role: '廉价守备',
      stat: '1-5-3-1', atk: 1, def: 5, move: 3, range: 1, minRange: 1,
      cost: { money: 1, pop: 0, industry: 0 },
      damagedStat: '1-4-2-1', damaged: { atk: 1, def: 4, move: 2, range: 1 },
      capture: true, deploy: ['city', 'village'],
      desc: '临时征召的民兵，费用极低且不占人力/工业，只能在首都、城市、农村生产；受损后 1-4-2-1。'
    },
    light_inf: {
      id: 'light_inf', category: 'infantry', name: '轻步兵', short: 'INF', role: '占领 / 固守',
      stat: '2-6-3-1', atk: 2, def: 6, move: 3, range: 1, minRange: 1,
      cost: { money: 3, pop: 2, industry: 0 },
      damagedStat: '1-6-3-1', damaged: { atk: 1, def: 6, move: 3, range: 1 },
      capture: true, deploy: ['village', 'city', 'factory', 'industrial_base', 'port'],
      ignoreTerrainCost: true,
      trait: '轻装：除河流、海洋外，移动消耗恒为 1',
      desc: '最廉价的占点部队，可在农村、城市、工厂、工业基地、港口部署；轻装特性使其在森林、丘陵、山地如履平地（河流除外）。'
    },
    drone_team: {
      id: 'drone_team', category: 'infantry', name: '无人机班组', short: 'UAV', role: '远程袭扰',
      stat: '1-4-2-4', atk: 1, def: 4, move: 2, range: 4, minRange: 1,
      cost: { money: 4, pop: 1, industry: 1 },
      fragile: true,
      capture: true, deploy: ['city', 'factory', 'industrial_base'],
      desc: '操作无人机的轻装班组，可在首都、城市、工厂、工业基地生产；4 格射程袭扰，受损即被消灭。'
    },
    mech_inf: {
      id: 'mech_inf', category: 'infantry', name: '机械化步兵', short: 'MEC', role: '快速突击',
      stat: '2-7-5-1', atk: 2, def: 7, move: 5, range: 1, minRange: 1,
      cost: { money: 7, pop: 2, industry: 1 },
      damagedStat: '1-6-3-1', damaged: { atk: 1, def: 6, move: 3, range: 1 },
      capture: true, deploy: ['factory', 'industrial_base'],
      desc: '乘车机动的步兵，只能从工厂或工业基地部署；受损后机动与攻防都会下降。'
    },
    armored_car: {
      id: 'armored_car', category: 'armor', name: '轻型坦克', short: 'LTK', role: '轻装甲 / 穿插',
      stat: '3-7-5-1', atk: 3, def: 7, move: 5, range: 1, minRange: 1,
      cost: { money: 8, pop: 1, industry: 2 },
      damagedStat: '2-5-3-1', damaged: { atk: 2, def: 5, move: 3, range: 1 },
      capture: true, deploy: ['factory', 'industrial_base', 'city'],
      capitalDeploy: true,
      ignoreNoVehicle: true,
      desc: '原装甲车，现为轻型坦克；机动与占点能力兼备，可从工厂、工业基地或首都部署；可进入山地。'
    },
    infantry_gun: {
      id: 'infantry_gun', category: 'artillery', name: '步兵炮', short: 'IG', role: '伴随火力',
      stat: '3-4-2-1', atk: 3, def: 4, move: 2, range: 1, minRange: 1,
      cost: { money: 6, pop: 1, industry: 1 },
      fragile: true,
      capture: true, deploy: ['village', 'city', 'factory', 'industrial_base'],
      desc: '随步兵推进的轻型火炮，可从农村、城市、工厂或工业基地部署；一旦受损即被摧毁。'
    },
    field_gun: {
      id: 'field_gun', category: 'artillery', name: '野战炮', short: 'FG', role: '远程压制',
      stat: '4-4-1-2', atk: 4, def: 4, move: 1, range: 2, minRange: 1,
      cost: { money: 10, pop: 1, industry: 2 },
      fragile: true,
      capture: true, deploy: ['factory', 'industrial_base'],
      desc: '在 1–2 格外开火的重炮，只能从工厂或工业基地部署；受损即被摧毁。'
    },
    tank: {
      id: 'tank', category: 'armor', name: '坦克', short: 'TNK', role: '突破主力',
      stat: '4-8-4-1', atk: 4, def: 8, move: 4, range: 1, minRange: 1,
      cost: { money: 12, pop: 1, industry: 3 },
      damagedStat: '2-6-2-1', damaged: { atk: 2, def: 6, move: 2, range: 1 },
      capture: true, deploy: ['factory', 'industrial_base'],
      desc: '装甲突击的核心，可在工厂或工业基地生产；受损后火力与机动明显下降。'
    },
    spg: {
      id: 'spg', category: 'artillery', name: '自行火炮', short: 'SPG', role: '机动炮击',
      stat: '3-7-4-2', atk: 3, def: 7, move: 4, range: 2, minRange: 1,
      cost: { money: 12, pop: 1, industry: 2 },
      damagedStat: '2-5-2-2', damaged: { atk: 2, def: 5, move: 2, range: 2 },
      capture: true, deploy: ['industrial_base'],
      desc: '履带式自行火炮，只能在工业基地生产；1–2 格外炮击，受损后火力与机动下降。'
    },
    stormtrooper: {
      id: 'stormtrooper', category: 'infantry', name: '风暴突击队', short: 'STO', role: '精锐突击',
      stat: '2-7-4-1', atk: 2, def: 7, move: 4, range: 1, minRange: 1,
      cost: { money: 5, pop: 2, industry: 0 },
      damagedStat: '2-6-2-1', damaged: { atk: 2, def: 6, move: 2, range: 1 },
      capture: true, deploy: ['city'],
      desc: '帝国精锐突击步兵，只能在首都/城市部署；受损后机动下降。'
    },
    heavy_tank: {
      id: 'heavy_tank', category: 'armor', name: '重型坦克', short: 'HTK', role: '重型突破',
      stat: '4-9-2-1', atk: 4, def: 9, move: 2, range: 1, minRange: 1,
      cost: { money: 14, pop: 1, industry: 3 },
      damagedStat: '2-8-1-1', damaged: { atk: 2, def: 8, move: 1, range: 1 },
      capture: true, deploy: ['industrial_base'],
      desc: '重型突破单位，只能在工业基地生产；移动缓慢但攻防极高。'
    },
    superheavy_tank: {
      id: 'superheavy_tank', category: 'armor', name: '超重型坦克', short: 'SHT', role: '超重型突破',
      stat: '4-10-2-1', atk: 4, def: 10, move: 2, range: 1, minRange: 1,
      cost: { money: 16, pop: 1, industry: 4 },
      damagedStat: '2-9-0-1', damaged: { atk: 2, def: 9, move: 0, range: 1 },
      capture: true, deploy: ['industrial_base'],
      desc: '铁血帝国的超重型坦克，只能在工业基地生产；攻防极高，受损后无法移动。'
    },
    conscript: {
      id: 'conscript', category: 'infantry', name: '动员兵', short: 'CON', role: '动员步兵',
      stat: '2-7-3-1', atk: 2, def: 7, move: 3, range: 1, minRange: 1,
      cost: { money: 1, pop: 2, industry: 0 },
      damagedStat: '1-8-2-1', damaged: { atk: 1, def: 8, move: 2, range: 1 },
      capture: true, deploy: ['city', 'village', 'factory', 'industrial_base', 'port', 'airport'],
      desc: '革命联盟的动员兵，任意据点均可部署；受损后攻击下降，但防御反而提升到 8。'
    },
    rocket_artillery: {
      id: 'rocket_artillery', category: 'artillery', name: '自行火箭炮', short: 'RKT', role: '多目标炮击',
      stat: '3-4-3-2', atk: 3, def: 4, move: 3, range: 2, minRange: 1,
      cost: { money: 10, pop: 1, industry: 2 },
      fragile: true, attacksPerTurn: 2,
      capture: true, deploy: ['industrial_base'],
      desc: '革命联盟的自行火箭炮，1–2 格炮击，每回合最多攻击两个不同敌方单位；受损即被摧毁。'
    },
    sniper_team: {
      id: 'sniper_team', category: 'infantry', name: '狙击班组', short: 'SNP', role: '精确狙杀',
      stat: '2-6-2-2', atk: 2, def: 6, move: 2, range: 2, minRange: 1,
      cost: { money: 4, pop: 1, industry: 0 },
      fragile: true,
      capture: true, deploy: ['city'],
      desc: '北海王国的狙击班组，只能在首都/城市部署；攻击非机械化步兵时攻击 +1，受损即被摧毁。'
    },
    missile_ship: {
      id: 'missile_ship', category: 'ship', name: '导弹支援舰', short: 'MSL', role: '远程支援',
      stat: '3-8-2-5', atk: 3, def: 8, move: 2, range: 5, minRange: 1,
      cost: { money: 16, pop: 1, industry: 4 },
      damagedStat: '1-7-1-1', damaged: { atk: 1, def: 7, move: 1, range: 1 },
      naval: true,
      capture: false, deploy: ['port'],
      desc: '北海王国的导弹支援舰，只能在港口生产；5 格远程炮击，受损后 1-7-1-1。'
    },
    guard: {
      id: 'guard', category: 'infantry', name: '近卫军', short: 'GRD', role: '精锐卫队',
      stat: '2-8-2-1', atk: 2, def: 8, move: 2, range: 1, minRange: 1,
      cost: { money: 6, pop: 2, industry: 0 },
      damagedStat: '2-8-2-1', damaged: { atk: 2, def: 8, move: 2, range: 1 },
      capture: true, deploy: ['city'], capitalOnly: true,
      desc: '鸢尾花共和国的近卫军，只能在首都生产；攻击装甲、舰船或要塞炮时 +1 攻击。'
    },
    siege_howitzer: {
      id: 'siege_howitzer', category: 'artillery', name: '列车炮', short: 'RLW', role: '攻坚重炮',
      stat: '5-3-1-3', atk: 5, def: 3, move: 1, range: 3, minRange: 2,
      cost: { money: 15, pop: 1, industry: 3 },
      fragile: true,
      capture: true, deploy: ['industrial_base'],
      desc: '铁血帝国的列车炮，只能在工业基地部署；2–3 格炮击，无法攻击贴身敌人，受损即毁。'
    },
    suicide_squad: {
      id: 'suicide_squad', category: 'infantry', name: '敢死队', short: 'SDS', role: '决死突击',
      stat: '2-6-3-1', atk: 2, def: 6, move: 3, range: 1, minRange: 1,
      cost: { money: 4, pop: 1, industry: 0 },
      damagedStat: '3-3-3-1', damaged: { atk: 3, def: 3, move: 3, range: 1 },
      capture: true, deploy: ['village', 'factory', 'port'],
      desc: '日升帝国的敢死队，可在农村/工厂/港口生产；受损后攻击升至3、防御降至3。'
    },
    assault_boat: {
      id: 'assault_boat', category: 'ship', name: '突击快船', short: 'ABT', role: '高速突击',
      stat: '2-7-5-1', atk: 2, def: 7, move: 5, range: 1, minRange: 1,
      cost: { money: 10, pop: 2, industry: 1 },
      fragile: true, naval: true, landingOnDeath: 'suicide_squad',
      capture: false, deploy: ['port'],
      desc: '高速突击快船；受损即毁，若沉没时靠近陆地，可由玩家选择相邻陆地格部署一名敢死队。'
    },
    infantry_column: {
      id: 'infantry_column', category: 'infantry', name: '步兵纵队', short: 'COL', role: '坚韧纵队',
      stat: '3-7-3-1', atk: 3, def: 7, move: 3, range: 1, minRange: 1,
      cost: { money: 8, pop: 4, industry: 1 },
      damagedStat: '2-6-3-1', damaged: { atk: 2, def: 6, move: 3, range: 1 },
      extraHits: 1, terrainReduction: 1,
      capture: true, deploy: ['city'],
      desc: '东陆步兵纵队，可承受两次受损（两次受损属性相同），地形移动消耗 -1（最低 1）。'
    },
    experimental_mech: {
      id: 'experimental_mech', category: 'armor', name: '实验型机甲', short: 'EXM', role: '威慑机甲',
      stat: '3-9-3-1', atk: 3, def: 9, move: 3, range: 1, minRange: 1,
      cost: { money: 15, pop: 0, industry: 3 },
      fragile: true, taunt: 6, immuneFlank: true,
      capture: true, deploy: ['industrial_base'],
      desc: '实验型机甲；周围 6 格敌军必须优先攻击它，且不受夹击/包围惩罚；受损即毁。'
    },
    hover_tank: {
      id: 'hover_tank', category: 'armor', name: '悬浮坦克', short: 'HVK', role: '全地形突击',
      stat: '3-7-4-1', atk: 3, def: 7, move: 4, range: 1, minRange: 1,
      cost: { money: 14, pop: 1, industry: 3 },
      damagedStat: '3-5-0-1', damaged: { atk: 3, def: 5, move: 0, range: 1 },
      capture: true, deploy: ['industrial_base'],
      terrainIgnore: ['hills', 'forest', 'river'], cannotEnter: ['mountain', 'water'],
      desc: '悬浮坦克；无视丘陵/森林/河流的移动消耗，但不能进入山地和海洋；受损后无法移动。'
    },
    tactical_carrier: {
      id: 'tactical_carrier', category: 'ship', name: '两栖攻击舰', short: 'LHA', role: '两栖攻击 / 海上航空',
      stat: '3-12-1-6', atk: 3, def: 12, move: 1, range: 6, minRange: 1,
      cost: { money: 32, pop: 2, industry: 6 },
      damagedStat: '2-8-0-5', damaged: { atk: 2, def: 8, move: 0, range: 5 },
      capture: false, deploy: ['port'], naval: true,
      desc: '新大陆的两栖攻击舰；6 格远程打击，受损后机动归零。'
    },
    battle_barge: {
      id: 'battle_barge', category: 'ship', name: '战斗驳船', short: 'BRG', role: '近岸火力',
      stat: '3-8-4-1', atk: 3, def: 8, move: 4, range: 1, minRange: 1,
      cost: { money: 8, pop: 1, industry: 2 },
      damagedStat: '1-6-2-1', damaged: { atk: 1, def: 6, move: 2, range: 1 },
      capture: false, deploy: ['port'], naval: true,
      desc: '只能在港口部署、在水域移动的武装驳船，可攻击陆上单位；受损后 1-6-2-1。'
    },
    gunboat: {
      id: 'gunboat', category: 'ship', name: '炮艇', short: 'GB', role: '水面压制',
      stat: '4-10-3-2', atk: 4, def: 10, move: 3, range: 2, minRange: 1,
      cost: { money: 16, pop: 1, industry: 4 },
      damagedStat: '2-7-1-1', damaged: { atk: 2, def: 7, move: 1, range: 1 },
      capture: false, deploy: ['port'], naval: true,
      desc: '重型内河/近海炮艇，可在港口部署、在水域移动并轰击岸上目标；受损后大幅削弱。'
    },
    tachanka: {
      id: 'tachanka', category: 'armor', name: '搭枪卡', short: 'TCH', role: '载具 / 火力支援',
      stat: '2-5-5-1', atk: 2, def: 5, move: 5, range: 1, minRange: 1,
      cost: { money: 4, pop: 1, industry: 0 },
      fragile: true,
      capture: true, deploy: ['village', 'city', 'factory', 'industrial_base'],
      transport: { capacity: 1, types: ['militia', 'light_inf', 'conscript'], range: 6, bonus: { atk: 1, def: 1 } },
      desc: '革命联盟的搭枪卡；可装载周围6格内1名民兵/轻步兵/动员兵，装载时自身攻防+1；可向周围相邻6格卸载，卸载后双方仍可攻击/行动；被击毁时在原地释放载员。'
    },
    marine: {
      id: 'marine', category: 'infantry', name: '海军陆战队', short: 'MAR', role: '两栖突击',
      stat: '2-6-3-1', atk: 2, def: 6, move: 3, range: 1, minRange: 1,
      cost: { money: 5, pop: 1, industry: 1 },
      damagedStat: '1-6-3-1', damaged: { atk: 1, def: 6, move: 3, range: 1 },
      capture: true, deploy: ['city', 'port'], amphibious: true,
      desc: '北海王国的海军陆战队，可在城市/首都/港口生产；无视河流阻碍，可进入海洋，水陆转换时本回合只能移动1格。'
    },
    commissar: {
      id: 'commissar', category: 'infantry', name: '督战队', short: 'COM', role: '督战 / 鼓舞',
      stat: '1-4-3-1', atk: 1, def: 4, move: 3, range: 1, minRange: 1,
      cost: { money: 2, pop: 1, industry: 0 },
      fragile: true,
      capture: true, deploy: ['city'],
      aura: { stat: 'def', value: 1, range: 6, category: 'infantry' },
      desc: '鸢尾花共和国的督战队，只能在首都/城市生产；周围6格内的步兵防御+1，多个督战队效果不叠加。'
    },
    infantry_tank: {
      id: 'infantry_tank', category: 'armor', name: '步兵坦克', short: 'IFT', role: '步兵协同装甲',
      stat: '2-9-3-1', atk: 2, def: 9, move: 3, range: 1, minRange: 1,
      cost: { money: 12, pop: 1, industry: 2 },
      damagedStat: '1-8-1-1', damaged: { atk: 1, def: 8, move: 1, range: 1 },
      capture: true, deploy: ['factory', 'industrial_base'],
      stackInfantry: true, stackBonus: 1,
      desc: '鸢尾花共和国的步兵坦克；可与1个我方步兵同格堆叠，双方攻防+1，堆叠时不能互相协同，敌军必须优先攻击坦克。'
    },
    motor_blitz: {
      id: 'motor_blitz', category: 'infantry', name: '摩托闪击队', short: 'MTB', role: '摩托突击',
      stat: '2-6-4-1', atk: 2, def: 6, move: 4, range: 1, minRange: 1,
      cost: { money: 4, pop: 2, industry: 1 },
      damagedStat: '1-5-4-1', damaged: { atk: 1, def: 5, move: 4, range: 1 },
      capture: true, deploy: ['city', 'factory', 'industrial_base'],
      terrainIgnore: ['forest'],
      desc: '日升帝国的摩托闪击队，可在首都/城市/工厂/工业基地生产；无视森林移动消耗。'
    },
    guerrilla: {
      id: 'guerrilla', category: 'infantry', name: '游击队', short: 'GUE', role: '敌后动员',
      stat: '1-7-4-1', atk: 1, def: 7, move: 4, range: 1, minRange: 1,
      cost: { money: 5, pop: 3, industry: 0 },
      damagedStat: '1-6-4-1', damaged: { atk: 1, def: 6, move: 4, range: 1 },
      capture: true, deploy: ['village', 'city'],
      guerrillaMilitia: true,
      desc: '东陆共和国的游击队，可在农村/城市/首都生产；每回合可在自身6格内生产1个民兵。'
    },
    gene_warrior: {
      id: 'gene_warrior', category: 'infantry', name: '基因改造战士', short: 'GEN', role: '强化步兵',
      stat: '2-7-3-1', atk: 2, def: 7, move: 3, range: 1, minRange: 1,
      cost: { money: 8, pop: 1, industry: 2 },
      damagedStat: '2-7-3-1', damaged: { atk: 2, def: 7, move: 3, range: 1 },
      capture: true, deploy: ['factory', 'industrial_base'],
      geneDefense: true,
      desc: '新大陆共和国的基因改造战士，只能在工厂/工业基地生产；被攻击时对方掷2次取低，阵亡时对攻击者造成2+1D6伤害。'
    },
    fort_gun: {
      id: 'fort_gun', category: 'artillery', name: '要塞炮', short: 'FGN', role: '固定炮台',
      stat: '4-12-0-3', atk: 4, def: 12, move: 0, range: 3, minRange: 2,
      cost: { money: 0, pop: 0, industry: 0 },
      fragile: true,
      capture: false, deploy: [], immobile: true,
      desc: '固定要塞炮，无法移动并封锁所在格；攻击 2–3 格内的敌人，开火后下一回合无法再攻击。'
    }
  };

  const BUILD_ORDER = ['militia', 'light_inf', 'drone_team', 'mech_inf', 'armored_car', 'infantry_gun', 'field_gun', 'tank', 'spg', 'heavy_tank', 'battle_barge', 'gunboat'];
  const SPECIAL_BY_FORCE = {
    ironblood: ['stormtrooper', 'superheavy_tank', 'siege_howitzer'],
    revolution: ['conscript', 'rocket_artillery', 'tachanka'],
    northsea: ['sniper_team', 'missile_ship', 'marine'],
    iris: ['guard', 'commissar', 'infantry_tank'],
    sunrise: ['suicide_squad', 'assault_boat', 'motor_blitz'],
    eastland: ['infantry_column', 'experimental_mech', 'guerrilla'],
    newworld: ['hover_tank', 'tactical_carrier', 'gene_warrior']
  };
  const SPECIAL_UNITS = ['stormtrooper', 'superheavy_tank', 'conscript', 'rocket_artillery', 'sniper_team', 'missile_ship', 'guard', 'siege_howitzer', 'suicide_squad', 'assault_boat', 'infantry_column', 'experimental_mech', 'hover_tank', 'tactical_carrier', 'tachanka', 'marine', 'commissar', 'infantry_tank', 'motor_blitz', 'guerrilla', 'gene_warrior'];

  /* ---------------- 可建造工事 ---------------- */
  const FORTS = {
    mine: {
      id: 'mine', name: '地雷', cost: 4, placement: 'self',
      desc: '敌军停留时造成 2+1D6 伤害，随后地雷消失；友军不触发。'
    },
    wire: {
      id: 'wire', name: '铁丝网', cost: 2, placement: 'adjacent',
      block: ['militia', 'light_inf'],
      desc: '强制所有敌方步兵停留，停留者本回合无法攻击、下回合无法移动；铁丝网随后消失。'
    },
    trap: {
      id: 'trap', name: '反坦克锥', cost: 2, placement: 'adjacent',
      block: ['mech_inf', 'armored_car', 'tank', 'spg'],
      desc: '强制所有敌方装甲单位停留，停留者本回合无法攻击、下回合无法移动；随后消失。'
    },
    trench: {
      id: 'trench', name: '战壕', cost: 5, placement: 'self',
      desc: '该格友军防御 +1；被敌军占领后消失。'
    },
    aa: {
      id: 'aa', name: '防空阵地', cost: 10, placement: 'self', aura: 2,
      desc: '以阵地为中心 2 格内的地格与友军不会被敌方机场任务选为目标；被敌军占领后消失。'
    },
    fort_gun: {
      id: 'fort_gun', name: '要塞炮', cost: 16, placement: 'adjacent',
      desc: '在相邻空格修建固定炮台，封锁该格；攻击 2–3 格，开火后下一回合不能再攻击。'
    }
  };

  /* ---------------- 战略选择 ---------------- */
  const STRATEGIES = {
    attack: {
      human_wave: {
        id: 'human_wave', name: '人海攻势',
        desc: '我方人口上限 +6；每四回合开始时获得 2 名待部署民兵，由玩家选择据点及周围位置部署。'
      },
      armor_blitz: {
        id: 'armor_blitz', name: '装甲突击',
        desc: '机械化步兵、轻型坦克、坦克移动力 +1。'
      },
      air_land: {
        id: 'air_land', name: '空地一体',
        desc: '每座机场每回合可额外执行一次任务；所有机场任务射程 +1。'
      },
      superior_firepower: {
        id: 'superior_firepower', name: '优势火力',
        desc: '步兵炮、野战炮花费 -1 金钱，占用工业 -1。'
      }
    },
    defense: {
      scorched_earth: {
        id: 'scorched_earth', name: '坚壁清野',
        desc: '工事建造花费 -1；每回合工事上限 +2；战壕防御修正变为 +2；要塞炮仍每回合最多 1 个。'
      },
      defense_in_depth: {
        id: 'defense_in_depth', name: '纵深防御',
        desc: '我方据点周围六格也获得该据点防御修正；敌军攻占我方据点时受到 1D6 伤害。'
      },
      endurance: {
        id: 'endurance', name: '持久生存',
        desc: '每回合额外 +3 金钱，人口上限 +1、工业上限 +1；受损单位只要停留在可生产该单位的我方据点内，下一回合即可恢复1格受损条，无需待命。'
      },
      fire_counter: {
        id: 'fire_counter', name: '火力反制',
        desc: '步兵炮、野战炮攻击与防御 +1；我方单位每回合反击次数 +1。'
      }
    }
  };

  /* ---------------- 战役地图 ---------------- */
  const MAP_ROWS = [
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~.fffff...........fffff~~~~~~',
    '~~~~...fffff..........fffffff.~~~~',
    '~~~...fffffff......=...fffff...~~~',
    '~~~..fffffffff.....=..hhhfff...~~~',
    '~~~.fffffffffff...=..hhhhh.....~~~',
    '~~~..fff...fff....=...hhhhhh...~~~',
    '~~~..............=..m...hhhhh..~~~',
    '~~~.fff..........=mm.....hhh...~~~',
    '~~~fffff..hhh...m=.............~~~',
    '~~~.fff..hhhhh.m.b.........m...~~~',
    '~~~.......hhhmmh=...hhh..mm....~~~',
    '~~~.........m.hh=..hhhhhm......~~~',
    '~~~f...........h=...hhh.....fff~~~',
    '~~~......mm.....b..........ffff~~~',
    '~~~.hhh.m.......=.fff.......fff~~~',
    '~~~hhhhh........=..ff..........~~~',
    '~~~.hhh.........==.fffff.......~~~',
    '~~~..............=.ffffff......~~~',
    '~~~..............=.fffff.......~~~',
    '~~~~.............=............~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~'
  ];

  const MAP_W = 34;
  const MAP_H = 24;

  /* ---------------- 据点 ---------------- */
  const SITES = [
    { id: 'whiteport', name: '白港', col: 6, row: 12, kind: 'city', faction: 'alliance', capital: true, note: '西线首都，人力与指挥中枢' },
    { id: 'whiteair', name: '白港机场', col: 3, row: 12, kind: 'airport', faction: 'alliance', note: '西线空军基地，可执行空中任务' },
    { id: 'stonebridge', name: '石桥', col: 9, row: 17, kind: 'city', faction: 'alliance', note: '南部铁路枢纽' },
    { id: 'pine', name: '松林镇', col: 8, row: 6, kind: 'industrial_base', faction: 'alliance', note: '西线工业基地，重装备命脉' },
    { id: 'southcape', name: '南岬', col: 10, row: 20, kind: 'port', faction: 'alliance', note: '半岛南端的渔港，西线海军据点' },
    { id: 'blackkeep', name: '黑堡', col: 28, row: 10, kind: 'city', faction: 'empire', capital: true, note: '东线首都，战争机器的心脏' },
    { id: 'blackair', name: '黑堡机场', col: 30, row: 12, kind: 'airport', faction: 'empire', note: '帝国空军基地，可执行空中任务' },
    { id: 'anvil', name: '铁砧', col: 24, row: 15, kind: 'city', faction: 'empire', note: '东线南线重镇' },
    { id: 'greyrock', name: '灰岩', col: 28, row: 4, kind: 'industrial_base', faction: 'empire', note: '东线北方矿区与重工业基地' },
    { id: 'eastwind', name: '东风', col: 27, row: 20, kind: 'port', faction: 'empire', note: '东线东南海湾港口' },
    { id: 'spring', name: '圣泉', col: 17, row: 11, kind: 'city', faction: null, note: '中立古城，四战之地' },
    { id: 'riverwatch', name: '北岭', col: 19, row: 7, kind: 'city', faction: null, note: '北方山口的小城' },
    { id: 'ironforge', name: '铁炉', col: 14, row: 14, kind: 'factory', faction: null, note: '中立工厂，西线门户' },
    { id: 'eastwatch', name: '东望', col: 21, row: 8, kind: 'factory', faction: null, note: '山口军工厂，东线门户' },
    { id: 'wheat', name: '麦田村', col: 8, row: 10, kind: 'village', faction: null, note: '西线麦田，产粮小村' },
    { id: 'riverbend', name: '河湾村', col: 11, row: 13, kind: 'village', faction: null, note: '河湾旁的农庄' },
    { id: 'millstone', name: '石磨村', col: 16, row: 8, kind: 'village', faction: null, note: '中部平原的磨坊村' },
    { id: 'maple', name: '枫林村', col: 18, row: 13, kind: 'village', faction: null, note: '丘陵间的枫林村' },
    { id: 'pasture', name: '牧野村', col: 23, row: 9, kind: 'village', faction: null, note: '东线牧野，帝国边境村落' },
    { id: 'southpond', name: '南塘村', col: 26, row: 16, kind: 'village', faction: null, note: '东南水塘边的农村' }
  ];

  /* ---------------- 开局部队 ---------------- */
  const START_UNITS = [
    { type: 'light_inf', faction: 'alliance', col: 9, row: 12 },
    { type: 'mech_inf', faction: 'alliance', col: 10, row: 13 },
    { type: 'tank', faction: 'alliance', col: 9, row: 9 },
    { type: 'armored_car', faction: 'alliance', col: 9, row: 11 },
    { type: 'light_inf', faction: 'alliance', col: 9, row: 17 },
    { type: 'light_inf', faction: 'alliance', col: 8, row: 6 },
    { type: 'light_inf', faction: 'empire', col: 22, row: 8 },
    { type: 'mech_inf', faction: 'empire', col: 23, row: 10 },
    { type: 'tank', faction: 'empire', col: 23, row: 11 },
    { type: 'armored_car', faction: 'empire', col: 19, row: 9 },
    { type: 'light_inf', faction: 'empire', col: 28, row: 4 },
    { type: 'light_inf', faction: 'empire', col: 24, row: 15 },
    { type: 'light_inf', faction: 'empire', col: 30, row: 12 }
  ];

  /* 中立据点守备队 */
  const NEUTRAL_GARRISON_TYPE = 'light_inf';


  /* ---------------- 地图预设 ---------------- */
  function buildMap1() {
    const W = 70, H = 70;
    const grid = Array.from({ length: H }, () => Array(W).fill('~'));
    const inMap = (c, r) => c >= 0 && c < W && r >= 0 && r < H;
    const siteDefs = [
      ['w_capital','西陆都城',10,20,'city','alliance',true],
      ['w_city','西陆城',15,12,'city','alliance',false],
      ['w_v1','西岸村',7,30,'village','alliance',false],
      ['w_v2','麦河村',12,37,'village','alliance',false],
      ['w_v3','西岬村',6,45,'village','alliance',false],
      ['w_factory','西陆工厂',18,26,'factory','alliance',false],
      ['w_port','西港',16,62,'port','alliance',false],
      ['e_capital','东陆都城',56,45,'city','empire',true],
      ['e_city','东陆城',50,32,'city','empire',false],
      ['e_v1','东岸村',56,58,'village','empire',false],
      ['e_v2','南岗村',52,57,'village','empire',false],
      ['e_v3','北林村',59,22,'village','empire',false],
      ['e_factory','东陆工厂',46,40,'factory','empire',false],
      ['e_port','东港',56,56,'port','empire',false],
      ['n_city1','湖北城',30,12,'city',null,false],
      ['n_city2','南原城',22,55,'city',null,false],
      ['n_city3','海东城',65,36,'city',null,false],
      ['n_v1','湖西村',24,28,'village',null,false],
      ['n_v2','湖东村',32,28,'village',null,false],
      ['n_v3','湖南村',24,33,'village',null,false],
      ['n_v4','湖湾村',32,33,'village',null,false],
      ['n_v5','北荒村',20,8,'village',null,false],
      ['n_v6','南野村',40,50,'village',null,false],
      ['n_v7','东林村',45,20,'village',null,false],
      ['n_v8','西岭村',12,60,'village',null,false],
      ['n_v9','河尾村',35,60,'village',null,false],
      ['n_i1','湖西工业基地',25,45,'industrial_base',null,false],
      ['n_i2','北原工业基地',40,15,'industrial_base',null,false],
      ['n_i3','东岸工业基地',50,60,'industrial_base',null,false],
      ['n_f1','西原工厂',20,50,'factory',null,false],
      ['n_f2','北口工厂',44,25,'factory',null,false],
      ['n_f3','东林工厂',53,12,'factory',null,false],
      ['n_p1','河港',34,55,'port',null,false],
      ['n_p2','岛港',65,40,'port',null,false],
      ['n_p3','南港',35,65,'port',null,false]
    ];
    const siteSet = new Set(siteDefs.map(s => s[2] + ',' + s[3]));
    function ellipse(c, r, cx, cy, rx, ry) {
      const dx = (c - cx) / rx, dy = (r - cy) / ry;
      return dx * dx + dy * dy < 1;
    }
    function mainLand(c, r) {
      if (c < 2 || c > 67 || r < 2 || r > 67) return false;
      if (c >= 58 && c <= 60 && r >= 28 && r <= 44) return false;
      const n = 0.07 * Math.sin(c * 0.53 + r * 0.37) + 0.045 * Math.cos(c * 0.29 - r * 0.67);
      return ellipse(c, r, 31, 33, 27 + n, 31 + n) ||
        ellipse(c, r, 10, 51, 12, 13) ||       // 西伊比利亚/布列塔尼式半岛
        ellipse(c, r, 17, 12, 14, 10) ||       // 北方半岛
        ellipse(c, r, 46, 21, 13, 11) ||       // 东欧突出部
        ellipse(c, r, 44, 55, 13, 12) ||       // 东南巴尔干式半岛
        ellipse(c, r, 27, 61, 12, 9);          // 南方半岛
    }
    function islandLand(c, r) {
      return ellipse(c, r, 64.5, 36, 4.7, 4.4);
    }
    // 湖泊：全部为河流水域（与河道相通），面积比旧图更大。
    const lake = new Set();
    for (let r = 26; r <= 36; r++) for (let c = 22; c <= 34; c++) {
      const key = c + ',' + r;
      if (siteSet.has(key)) continue;
      if (ellipse(c, r, 27.5, 31.5, 4.5, 3.9)) lake.add(key);
    }
    const riverPath = [
      [30,34],[30,35],[31,36],[31,37],[32,38],[32,39],[33,40],[33,41],[33,42],
      [33,43],[33,44],[33,45],[33,46],[33,47],[33,48],[33,49],[33,50],[33,51],
      [33,52],[33,53],[33,54],[33,55],[33,56],[33,57],[33,58],[33,59],[33,60],
      [33,61],[33,62],[33,63],[33,64],[33,65],[33,66],[33,67],[33,68]
    ];
    const river = new Set(riverPath.map(([c, r]) => c + ',' + r));
    for (let r = 39; r <= 46; r++) river.add('32,' + r);
    river.add('34,48'); river.add('34,49');
    const bridgeGroups = [
      { cells: ['31,36'], ends: ['30,36', '32,36'] },
      { cells: ['32,42', '33,42'], ends: ['31,42', '34,42'] },
      { cells: ['33,50'], ends: ['32,50', '34,50'] }
    ];
    const bridges = new Set(bridgeGroups.flatMap(g => g.cells));
    // 中央主山脉 + 三条余脉。
    const spine = [[33,9],[34,17],[32,24],[35,31],[33,39],[34,47],[32,55],[33,63]];
    const branches = [
      [[33,20],[29,19],[25,18]],
      [[34,34],[38,33],[42,31]],
      [[33,47],[29,49],[25,51]]
    ];
    function segDist(c, r, a, b) {
      const vx = b[0] - a[0], vy = b[1] - a[1];
      const wx = c - a[0], wy = r - a[1];
      const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / (vx * vx + vy * vy || 1)));
      const dx = c - (a[0] + vx * t), dy = r - (a[1] + vy * t);
      return Math.hypot(dx, dy);
    }
    function mountainDist(c, r) {
      let d = 99;
      for (let i = 0; i < spine.length - 1; i++) d = Math.min(d, segDist(c, r, spine[i], spine[i + 1]));
      for (const br of branches) for (let i = 0; i < br.length - 1; i++) d = Math.min(d, segDist(c, r, br[i], br[i + 1]) + 0.45);
      return d;
    }
    const forestNW = (c, r) => ellipse(c, r, 16, 14, 11, 8);
    const forestE = (c, r) => ellipse(c, r, 46, 33, 10, 8);
    const plainW = (c, r) => ellipse(c, r, 16, 34, 10, 12);
    const plainC = (c, r) => ellipse(c, r, 43, 25, 8, 8);
    const plainS = (c, r) => ellipse(c, r, 25, 53, 9, 7);
    const seHills = (c, r) => ellipse(c, r, 48, 57, 10, 8);
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const key = c + ',' + r;
      if (!(mainLand(c, r) || islandLand(c, r))) continue;
      if (lake.has(key) || river.has(key) || siteSet.has(key)) continue;
      const md = mountainDist(c, r);
      let t = '.';
      if (md <= 1.15) t = 'm';
      else if (md <= 3.2) t = 'h';
      else if (seHills(c, r) && (c > 38 && r > 48)) t = 'h';
      else if (forestNW(c, r) || forestE(c, r)) t = 'f';
      else if (plainW(c, r) || plainC(c, r) || plainS(c, r)) t = '.';
      else {
        const q = Math.sin(c * 0.71 + r * 1.03) + Math.cos(c * 1.17 - r * 0.41);
        if (q < -0.9) t = 'f';
        else if (q < -0.35) t = 'h';
      }
      grid[r][c] = t;
    }
    // 小岛内部的水域改为平原，港口改到岛屿沿海边缘。
    for (let r = 30; r <= 41; r++) for (let c = 58; c <= 69; c++) {
      if (islandLand(c, r) && grid[r][c] === '~') grid[r][c] = '.';
    }
    // 湖泊与河道：湖泊也是河流水域，保证与河道连通。
    for (const key of lake) { const [c, r] = key.split(',').map(Number); grid[r][c] = '='; }
    for (const key of river) {
      const [c, r] = key.split(',').map(Number);
      grid[r][c] = bridges.has(key) ? 'b' : '=';
    }
    // 据点永远是陆地。
    for (const s of siteDefs) grid[s[3]][s[2]] = '.';
    // 小岛港口放在东侧海岸，先保证外海邻格存在。
    grid[36][69] = '~';
    // 港口必须邻接水域或河流。
    for (const s of siteDefs) {
      if (s[4] !== 'port') continue;
      const c = s[2], r = s[3];
      const adj = [[c-1,r],[c+1,r],[c,r-1],[c,r+1]].filter(([x,y]) => inMap(x,y));
      if (!adj.some(([x,y]) => grid[y][x] === '~' || grid[y][x] === '=' || grid[y][x] === 'b')) {
        const [x, y] = adj.find(([a,b]) => !siteSet.has(a + ',' + b) && !river.has(a + ',' + b)) || adj[0];
        grid[y][x] = '~';
      }
    }
    // 清理小岛范围内的水域，全部改为平原；港口改到岛屿南岸。
    for (let r = 32; r <= 40; r++) for (let c = 60; c <= 68; c++) {
      if (grid[r][c] === '~') grid[r][c] = '.';
    }
    // 删除地图中央的内陆海洋水域（仅保留边缘海洋、湖泊与河流）。
    for (let r = 15; r < 55; r++) for (let c = 10; c < 55; c++) {
      if (grid[r][c] === '~') grid[r][c] = '.';
    }
    // 桥面两端必须是平原陆地。
    for (const g of bridgeGroups) for (const key of g.ends) {
      const [c, r] = key.split(',').map(Number);
      if (inMap(c, r)) grid[r][c] = '.';
    }
    const sites = siteDefs.map(s => ({
      id: s[0], name: s[1], col: s[2], row: s[3], kind: s[4],
      faction: s[5], capital: s[6], note: s[5] ? '' : '中立据点'
    }));
    const unitFor = s => s.kind === 'city' ? (s.capital ? 'armored_car' : 'mech_inf')
      : s.kind === 'village' ? 'militia' : s.kind === 'factory' ? 'infantry_gun' : 'light_inf';
    const startUnits = [];
    for (const s of sites) if (s.faction) startUnits.push({ type: unitFor(s), faction: s.faction, col: s.col, row: s.row });
    return {
      id: 'map1', name: '地图1', width: W, height: H,
      rows: grid.map(r => r.join('')), sites, startUnits,
      neutralGarrison: ['armored_car', 'light_inf', 'light_inf', 'light_inf']
    };
  }
  const MAP1 = buildMap1();
  const MAPS = {
    training: { id: 'training', name: '初始训练地图', width: MAP_W, height: MAP_H, rows: MAP_ROWS, sites: SITES, startUnits: START_UNITS, neutralGarrison: [NEUTRAL_GARRISON_TYPE] },
    map1: MAP1
  };

  const RULES = {
    maxTurns: null,
    startMoney: 10,
    captureReward: 2,
    flankBonus: 1,
    flankMax: 2,
    supportBonus: 1,
    waitDefense: 1
  };

  SG.data = {
    FORCES, FACTIONS, UNIT_CATEGORIES, TERRAIN, SITE_KINDS, SITE_YIELDS, SITE_DEF, UNITS, BUILD_ORDER, SPECIAL_BY_FORCE, SPECIAL_UNITS, FORTS, STRATEGIES,
    MAP_ROWS, MAP_W, MAP_H, SITES, START_UNITS, NEUTRAL_GARRISON_TYPE, MAPS, RULES
  };
})(typeof window !== 'undefined' ? window : globalThis);
