/* ============================================================
 * 钢铁洪流 · 局面与流程（兵棋推演版）
 * 金钱为库存；人力/工业为上限，由据点提供、由存活单位占用
 * ============================================================ */
(function (root) {
  'use strict';
  const SG = (root.SG = root.SG || {});
  const D = SG.data;
  const H = SG.hex;

  const F = D.FACTIONS, T = D.TERRAIN, U = D.UNITS;

  function nextRandom(state) {
    let t = (state.rng = (state.rng + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function tileAt(state, q, r) { return state.grid[H.key(q, r)] || null; }
  function siteAt(state, q, r) {
    const t = tileAt(state, q, r);
    return t && t.siteId ? state.sitesById[t.siteId] : null;
  }
  function unitsAt(state, q, r) {
    return state.units.filter(u => u.q === q && u.r === r);
  }
  function unitAt(state, q, r) {
    const list = unitsAt(state, q, r);
    return list.length ? list[0] : null;
  }
  function canTraverse(state, unit, q, r) {
    const occs = unitsAt(state, q, r);
    if (!occs.length) return true;
    if (occs.some(o => o.faction !== unit.faction)) return false;
    if (occs.some(o => o.type === 'fort_gun')) return false;
    return true;
  }

  function canOccupy(state, unit, q, r) {
    const list = unitsAt(state, q, r);
    if (!list.length) return true;
    if (list.some(u => u.faction !== unit.faction)) return false;
    const tile = tileAt(state, q, r);
    if (list.length === 1) {
      const a = list[0];
      const aInf = U[a.type] && U[a.type].category === 'infantry';
      const uInf = U[unit.type] && U[unit.type].category === 'infantry';
      if ((U[unit.type].stackInfantry && aInf) || (U[a.type].stackInfantry && uInf)) return true;
    }
    if (!tile || !tile.bridge || list.length >= 2) return false;
    return isNaval(list[0].type) !== isNaval(unit.type);
  }
  function unitsOf(state, faction) { return state.units.filter(u => u.faction === faction); }
  const EMPTY_STRATEGY = { attack: null, defense: null };
  function strategyOf(state, faction) {
    const st = state.strategies && state.strategies[faction];
    return st || EMPTY_STRATEGY;
  }
  function hasStrategy(state, faction, kind, id) {
    const st = strategyOf(state, faction);
    return !!(st && st[kind] === id);
  }
  function attackLimit(state, unit) {
    if (!unit) return 1;
    if (forceOf(state, unit.faction) === 'sunrise' &&
      (unit.type === 'light_inf' || unit.type === 'suicide_squad')) return 2;
    return (U[unit.type] && U[unit.type].attacksPerTurn) || 1;
  }
  const NO_EXTRA_DAMAGE_BAR = new Set(['drone_team', 'sniper_team', 'infantry_gun', 'field_gun',
    'fort_gun', 'rocket_artillery', 'siege_howitzer', 'assault_boat', 'experimental_mech',
    'militia', 'battle_barge', 'missile_ship', 'motor_blitz', 'guerrilla', 'gene_warrior', 'conscript']);

  function maxHits(typeId) {
    const def = U[typeId];
    if (!def) return 1;
    if (def.fragile) return 1;
    return 2 + (def.extraHits || 0) + (NO_EXTRA_DAMAGE_BAR.has(typeId) ? 0 : 1);
  }
  function attackRepeatable(state, unit) {
    return forceOf(state, unit.faction) === 'sunrise' &&
      (unit.type === 'light_inf' || unit.type === 'suicide_squad');
  }
  const DEFAULT_FORCE = { alliance: 'revolution', empire: 'ironblood' };
  function forceOf(state, faction) {
    if (state && state.forces && state.forces[faction]) return state.forces[faction];
    return DEFAULT_FORCE[faction] || null;
  }
  function forceData(state, faction) {
    return D.FORCES[forceOf(state, faction)] || F[faction] || F.neutral;
  }
  function buildOrder(state, faction) {
    const force = forceOf(state, faction);
    return D.BUILD_ORDER.concat((D.SPECIAL_BY_FORCE && D.SPECIAL_BY_FORCE[force]) || []);
  }
  function specialOwner(typeId) {
    for (const f of Object.keys(D.SPECIAL_BY_FORCE || {})) {
      if (D.SPECIAL_BY_FORCE[f].includes(typeId)) return f;
    }
    return null;
  }
  function randomStrategy(kind) {
    const keys = Object.keys(D.STRATEGIES[kind]);
    return keys[Math.floor(Math.random() * keys.length)];
  }
  function pickStrategyForForce(force, kind) {
    if (force === 'newworld') {
      const r = Math.random();
      if (kind === 'attack') {
        if (r < 0.45) return 'superior_firepower';
        if (r < 0.9) return 'air_land';
        const rest = Object.keys(D.STRATEGIES.attack).filter(k => k !== 'superior_firepower' && k !== 'air_land');
        return rest[Math.floor(Math.random() * rest.length)];
      }
      if (r < 0.8) return 'fire_counter';
      const rest = Object.keys(D.STRATEGIES.defense).filter(k => k !== 'fire_counter');
      return rest[Math.floor(Math.random() * rest.length)];
    }
    const preferred = kind === 'attack'
      ? (force === 'ironblood' ? 'armor_blitz' : (force === 'revolution' || force === 'sunrise' || force === 'eastland') ? 'human_wave' : null)
      : (force === 'revolution' ? 'defense_in_depth' : force === 'northsea' ? 'fire_counter' : force === 'iris' ? 'scorched_earth' : force === 'eastland' ? 'endurance' : null);
    if (preferred && D.STRATEGIES[kind][preferred] && Math.random() < 0.5) return preferred;
    const keys = Object.keys(D.STRATEGIES[kind]).filter(k => k !== preferred);
    return keys[Math.floor(Math.random() * keys.length)];
  }
  function fortAt(state, q, r) {
    if (state.fortIndex) {
      const f = state.fortIndex[H.key(q, r)];
      if (f) return f;
    }
    return state.forts.find(f => f.q === q && f.r === r) || null;
  }
  function addFort(state, type, faction, q, r) {
    const f = { id: state.nextFortId++, type, faction, q, r };
    state.forts.push(f);
    if (!state.fortIndex) state.fortIndex = {};
    state.fortIndex[H.key(q, r)] = f;
    return f;
  }
  function removeFort(state, fort) {
    const i = state.forts.indexOf(fort);
    if (i >= 0) state.forts.splice(i, 1);
    if (state.fortIndex) delete state.fortIndex[H.key(fort.q, fort.r)];
  }
  function isEnemy(a, b) { return !!a && !!b && a !== b; }

  function yieldOf(site) {
    if (site.capital && (!site.original || site.faction === site.original)) return D.SITE_YIELDS.capital;
    return D.SITE_YIELDS[site.kind] || D.SITE_YIELDS.city;
  }
  function siteDefense(site) {
    return D.SITE_DEF[site.kind] || 0;
  }
  function terrainDefense(state, q, r) {
    const s = siteAt(state, q, r);
    if (s) return siteDefense(s);
    const t = tileAt(state, q, r);
    return t ? T[t.t].def : 0;
  }
  /* 纵深防御：我方据点相邻的六个地格获得该据点防御加成；据点格本身走据点防御。 */
  function depthDefenseAt(state, q, r, faction) {
    if (!state || !hasStrategy(state, faction, 'defense', 'defense_in_depth')) return { value: 0, site: null };
    if (siteAt(state, q, r)) return { value: 0, site: null };
    let best = 0, bestSite = null;
    for (const n of H.neighbors(q, r)) {
      const site = siteAt(state, n.q, n.r);
      if (site && site.faction === faction) {
        const v = siteDefense(site);
        if (v > best) { best = v; bestSite = site; }
      }
    }
    return { value: best, site: bestSite };
  }
  function isVehicle(typeId) {
    return typeId === 'tank' || typeId === 'heavy_tank' || typeId === 'armored_car' || typeId === 'spg' || typeId === 'rocket_artillery' || typeId === 'hover_tank';
  }
  function isNaval(typeId) {
    return !!(U[typeId] && U[typeId].naval);
  }
  function bridgeInfo(state, tile) {
    if (!tile || !tile.bridge) return null;
    if (tile._bridgeInfo) return tile._bridgeInfo;
    const group = new Set([H.key(tile.q, tile.r)]);
    const open = [tile];
    while (open.length) {
      const cur = open.pop();
      for (const n of H.neighbors(cur.q, cur.r)) {
        const nt = tileAt(state, n.q, n.r);
        if (!nt || !nt.bridge) continue;
        const k = H.key(nt.q, nt.r);
        if (!group.has(k)) { group.add(k); open.push(nt); }
      }
    }
    const external = new Map();
    for (const k of group) {
      const [q, r] = k.split(',').map(Number);
      for (const n of H.neighbors(q, r)) {
        const nt = tileAt(state, n.q, n.r);
        if (!nt || nt.bridge) continue;
        if (nt.t === 'water' || nt.t === 'river' || !T[nt.t] || !T[nt.t].pass) continue;
        external.set(H.key(nt.q, nt.r), nt);
      }
    }
    let ends = [];
    const list = [...external.values()];
    const horizontal = list.filter(t => t.row === tile.row);
    if (horizontal.length >= 2) ends = horizontal.slice(0, 2);
    else if (list.length <= 2) ends = list.slice();
    else {
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        if (!ends.length || H.distance(list[i].q, list[i].r, list[j].q, list[j].r) >
          H.distance(ends[0].q, ends[0].r, ends[1].q, ends[1].r)) ends = [list[i], list[j]];
      }
    }
    const info = { group, ends: new Set(ends.map(t => H.key(t.q, t.r))) };
    for (const k of group) {
      const [q, r] = k.split(',').map(Number);
      const gt = tileAt(state, q, r);
      if (gt) gt._bridgeInfo = info;
    }
    return info;
  }

  function moveCost(state, q, r, unit, fromQ, fromR) {
    const t = tileAt(state, q, r);
    if (!t) return Infinity;
    const from = fromQ != null ? tileAt(state, fromQ, fromR) : (unit ? tileAt(state, unit.q, unit.r) : null);
    const adjacent = from && H.distance(from.q, from.r, q, r) === 1;
    if (from && from.bridge && !isNaval(unit.type) && !U[unit.type].amphibious && !t.bridge &&
      (t.t === 'water' || t.t === 'river')) return Infinity;
    if (adjacent && !isNaval(unit.type) && !U[unit.type].amphibious && (from && from.bridge || t.bridge)) {
      const fromInfo = from && from.bridge ? bridgeInfo(state, from) : null;
      const toInfo = t.bridge ? bridgeInfo(state, t) : null;
      if (fromInfo) {
        if (t.bridge) {
          if (!toInfo || !fromInfo.group.has(H.key(t.q, t.r))) return Infinity;
        } else if (!fromInfo.ends.has(H.key(t.q, t.r))) return Infinity;
      } else if (toInfo && !toInfo.ends.has(H.key(from.q, from.r))) {
        return Infinity;
      }
    }
    const terr = T[t.t];
    if (U[unit.type].amphibious && (terr.id === 'water' || terr.id === 'river')) return 1;
    if (isNaval(unit.type)) {
      // 舰船只能在水域移动，不能进入陆地/据点
      if (t.siteId) return Infinity;
      if (terr.id === 'water' || terr.id === 'river') return 1;
      return Infinity;
    }
    if (U[unit.type].cannotEnter && U[unit.type].cannotEnter.includes(terr.id)) return Infinity;
    if (U[unit.type].terrainIgnore && U[unit.type].terrainIgnore.includes(terr.id)) return 1;
    if (!terr.pass) return Infinity;
    if (terr.noVehicle && isVehicle(unit.type) && !U[unit.type].ignoreNoVehicle) return Infinity;
    // 桥梁：架在河流上，任何陆上单位都按平原消耗通行
    if (t.bridge) return 1;
    if (t.siteId) {
      const site = state.sitesById[t.siteId];
      if (site && site.faction !== unit.faction && !U[unit.type].capture) return Infinity;
      return 1;
    }
    // 轻步兵轻装特性：除河流、海洋外，地形移动消耗恒为 1
    const force = state ? forceOf(state, unit.faction) : null;
    if ((U[unit.type].ignoreTerrainCost || (force === 'eastland' && unit.type === 'militia')) && terr.id !== 'river') return 1;
    const reduction = U[unit.type].terrainReduction || 0;
    return Math.max(1, terr.cost - reduction);
  }

  /* 单位当前有效属性：满编用基础值，受损用 damaged 值 */
  function effective(unit, state) {
    const def = U[unit.type];
    let atk, dfn, move, range, fragile;
    if (unit.state === 'damaged' && def.damaged) {
      atk = def.damaged.atk; dfn = def.damaged.def;
      move = def.damaged.move; range = def.damaged.range; fragile = false;
    } else {
      atk = def.atk; dfn = def.def;
      move = def.move; range = def.range; fragile = !!def.fragile;
    }
    let waterPenalty = false;
    let auraDef = 0;
    let guerrillaDef = 0;
    let trenchDef = 0;
    let depthDef = 0;
    let firepower = false;
    const st = state ? strategyOf(state, unit.faction) : EMPTY_STRATEGY;
    if (st && st.attack === 'armor_blitz' &&
      (unit.type === 'mech_inf' || unit.type === 'armored_car' || unit.type === 'tank')) {
      move += 1;
    }
    if (st && st.defense === 'fire_counter' &&
      (unit.type === 'infantry_gun' || unit.type === 'field_gun')) {
      atk += 1;
      dfn += 1;
      firepower = true;
    }
    const force = state ? forceOf(state, unit.faction) : null;
    if (force === 'eastland' && (unit.type === 'militia' || unit.type === 'light_inf')) move += 1;
    if (force === 'eastland' && unit.type === 'militia') dfn += 1;
    if (state && def.category === 'infantry') {
      for (const o of state.units) {
        if (o.id === unit.id || o.faction !== unit.faction || o.type !== 'commissar') continue;
        if (H.distance(unit.q, unit.r, o.q, o.r) <= 6) { dfn += 1; auraDef = 1; break; }
      }
    }
    if (state) {
      const stack = unitsAt(state, unit.q, unit.r);
      const hasTank = stack.length > 1 && stack.some(o => o.type === 'infantry_tank');
      if (hasTank && (def.category === 'infantry' || unit.type === 'infantry_tank')) { atk += 1; dfn += 1; }
      if (unit.type === 'tachanka' && unit.cargo) { atk += 1; dfn += 1; }
    }
    if (state && !isNaval(unit.type)) {
      const t = tileAt(state, unit.q, unit.r);
      if (t && !t.bridge && (t.t === 'river' || t.t === 'water')) {
        waterPenalty = true;
        atk = Math.max(1, atk - 1);
        dfn = Math.max(1, dfn - 1);
      }
      const fort = fortAt(state, unit.q, unit.r);
      if (fort && fort.type === 'trench' && fort.faction === unit.faction) {
        trenchDef = st.defense === 'scorched_earth' ? 2 : 1;
        dfn += trenchDef;
      }
      if (unit.type === 'guerrilla') {
        const here = siteAt(state, unit.q, unit.r);
        let inVillage = !!(here && here.kind === 'village');
        if (!inVillage) {
          for (const n of H.neighbors(unit.q, unit.r)) {
            const ns = siteAt(state, n.q, n.r);
            if (ns && ns.kind === 'village') { inVillage = true; break; }
          }
        }
        if (inVillage) { dfn += 1; guerrillaDef = 1; }
      }
    }
    const depth = state ? depthDefenseAt(state, unit.q, unit.r, unit.faction) : { value: 0, site: null };
    depthDef = depth.value;
    dfn += depthDef;
    return {
      atk, def: dfn, move, range,
      minRange: def.minRange, capture: def.capture, fragile, waterPenalty, auraDef, guerrillaDef, trenchDef, depthDef, firepower
    };
  }
  function statText(unit, state) {
    const e = effective(unit, state);
    return e.atk + '-' + e.def + '-' + e.move + '-' + e.range;
  }
  function isDamaged(unit) { return unit.state === 'damaged'; }
  function isFragile(typeId) { return !!U[typeId].fragile; }

  function unitName(u) {
    const fd = u.force ? D.FORCES[u.force] : null;
    const side = fd || F[u.faction];
    return (side ? side.short + '·' : '') + U[u.type].name + (u.state === 'damaged' ? '（受损）' : '');
  }

  /* ---------- 经济 ---------- */
  function costOf(state, typeId, faction) {
    const def = U[typeId];
    if (!def) return { money: 0, pop: 0, industry: 0 };
    const c = { money: def.cost.money, pop: def.cost.pop, industry: def.cost.industry };
    if (hasStrategy(state, faction, 'attack', 'superior_firepower') &&
      (typeId === 'infantry_gun' || typeId === 'field_gun')) {
      c.money = Math.max(0, c.money - 1);
      c.industry = Math.max(0, c.industry - 1);
    }
    const force = forceOf(state, faction);
    if (force === 'revolution') c.money = Math.max(1, c.money - 1);
    if (force === 'northsea' && def.naval) c.money = Math.max(1, c.money - 2);
    return c;
  }
  function capsOf(state, faction) {
    let money = 0, pop = 0, industry = 0, count = 0;
    for (const s of state.sites) {
      if (s.faction !== faction) continue;
      const y = yieldOf(s);
      money += y.money; pop += y.pop || 0; industry += y.industry || 0; count++;
    }
    if (hasStrategy(state, faction, 'attack', 'human_wave')) pop += 6;
    if (hasStrategy(state, faction, 'defense', 'endurance')) { pop += 1; industry += 1; }
    if (forceOf(state, faction) === 'eastland') { pop += 6; industry += 2; }
    if (forceOf(state, faction) === 'newworld') industry += 4;
    return { money, pop, industry, count };
  }
  function usageOf(state, faction) {
    let pop = 0, industry = 0;
    for (const u of state.units) {
      if (u.faction !== faction || u.freeStart) continue;
      const c = costOf(state, u.type, faction);
      pop += c.pop; industry += c.industry;
    }
    return { pop, industry };
  }
  function maintenanceOf(state, faction) {
    let value = 0;
    for (const u of state.units) {
      if (u.faction !== faction) continue;
      if (u.type === 'militia') continue;
      if (u.type === 'fort_gun') { value += 3; continue; }
      const c = costOf(state, u.type, faction).money;
      const cat = U[u.type] ? U[u.type].category : 'infantry';
      value += c * ((cat === 'armor' || cat === 'ship') ? 0.2 : 0.1);
    }
    return Math.round(value);
  }

  function incomeOf(state, faction) {
    const caps = capsOf(state, faction);
    if (hasStrategy(state, faction, 'defense', 'endurance')) caps.money += 3;
    const grossMoney = caps.money;
    const maintenance = maintenanceOf(state, faction);
    caps.grossMoney = grossMoney;
    caps.maintenance = maintenance;
    caps.money = Math.max(0, grossMoney - maintenance);
    return caps;
  }
  function fortLimit(state, faction) {
    return Infinity;
  }
  function fortCost(state, faction, typeId) {
    const c = D.FORTS[typeId] ? D.FORTS[typeId].cost : 0;
    return Math.max(0, c - (hasStrategy(state, faction, 'defense', 'scorched_earth') ? 1 : 0));
  }
  function airportMaxUses(state, faction) {
    return 2 + (hasStrategy(state, faction, 'attack', 'air_land') ? 1 : 0);
  }
  function airportRangeBonus(state, faction) {
    return hasStrategy(state, faction, 'attack', 'air_land') ? 1 : 0;
  }
  function counterLimit(state, faction) {
    return 1 + (hasStrategy(state, faction, 'defense', 'fire_counter') ? 1 : 0);
  }

  function garrisonSpots(state, site, types) {
    const out = [];
    const used = new Set();
    for (const type of types) {
      const cands = Object.values(state.grid)
        .filter(t => {
          if (H.distance(site.q, site.r, t.q, t.r) > 2) return false;
          if (t.t === 'water' || t.t === 'river') return false;
          if (!T[t.t].pass) return false;
          if (t.siteId && t.siteId !== site.id) return false;
          if (unitAt(state, t.q, t.r)) return false;
          if (T[t.t].noVehicle && isVehicle(type)) return false;
          const k = H.key(t.q, t.r);
          return !used.has(k);
        })
        .sort((a, b) => H.distance(site.q, site.r, a.q, a.r) - H.distance(site.q, site.r, b.q, b.r));
      const spot = cands[0];
      if (spot) {
        used.add(H.key(spot.q, spot.r));
        out.push(spot);
      }
    }
    return out;
  }

  /* ---------- 创建 ---------- */
  function create(opts) {
    opts = opts || {};
    const playerFaction = opts.playerFaction === 'empire' ? 'empire' : 'alliance';
    const difficulty = typeof opts.difficulty === 'number' ? opts.difficulty : 1;
    const aiMul = [0.85, 1.0, 1.18][difficulty] || 1;
    const map = opts.customMap || D.MAPS[opts.mapId] || D.MAPS.training;

    // 地图上实际拥有据点的非玩家阵线会成为 AI；最多 5 个 AI。
    const AI_ORDER = ['alliance', 'empire', 'ai3', 'ai4', 'ai5', 'ai6'];
    const mapSides = new Set(map.sites.map(s => s.faction).filter(f => AI_ORDER.includes(f)));
    let aiFactions = AI_ORDER.filter(f => f !== playerFaction && mapSides.has(f)).slice(0, 5);
    if (!aiFactions.length) aiFactions = [playerFaction === 'alliance' ? 'empire' : 'alliance'];
    const factions = [playerFaction].concat(aiFactions.filter(f => f !== playerFaction));
    const aiFaction = aiFactions[0];

    const makeFactionMap = value => {
      const out = {};
      for (const f of factions) out[f] = typeof value === 'function' ? value(f) : value;
      return out;
    };
    const state = {
      version: 13,
      mapId: opts.customMap ? 'custom' : ((opts.mapId && D.MAPS[opts.mapId]) ? opts.mapId : 'training'),
      turn: 1,
      maxTurns: D.RULES.maxTurns,
      current: playerFaction,
      playerFaction,
      factions,
      aiFactions,
      aiFaction,
      difficulty,
      aiIncomeMul: aiMul,
      money: makeFactionMap(D.RULES.startMoney),
      units: [],
      forts: [],
      fortIndex: {},
      nextFortId: 1,
      fortsBuilt: 0,
      sites: [],
      sitesById: {},
      grid: {},
      log: [],
      over: null,
      rng: 20261029,
      nextUnitId: 1,
      stats: {
        kills: makeFactionMap(0), built: makeFactionMap(0), captured: makeFactionMap(0)
      },
      strategies: makeFactionMap(() => ({ attack: null, defense: null })),
      aiHate: makeFactionMap(null),
      aiMisses: makeFactionMap(() => ({})),
      eliminated: makeFactionMap(false),
      militiaPending: makeFactionMap(0),
      capitalMilitiaPending: makeFactionMap(0),
      pendingLandings: [],
      fortGunBuilt: 0,
      forces: {}
    };

    const usedForces = new Set();
    const pf = D.FORCES[opts.playerForce] ? opts.playerForce : DEFAULT_FORCE[playerFaction];
    state.forces[playerFaction] = pf;
    usedForces.add(pf);
    aiFactions.forEach((f, idx) => {
      let force = null;
      if (idx === 0 && D.FORCES[opts.aiForce] && !usedForces.has(opts.aiForce)) force = opts.aiForce;
      if (!force && idx === 0 && !opts.playerForce && DEFAULT_FORCE[f] && !usedForces.has(DEFAULT_FORCE[f])) {
        force = DEFAULT_FORCE[f];
      }
      if (!force) {
        const keys = Object.keys(D.FORCES).filter(k => !usedForces.has(k));
        force = keys[Math.floor(Math.random() * keys.length)] || DEFAULT_FORCE[f] || 'ironblood';
      }
      usedForces.add(force);
      state.forces[f] = force;
    });

    const picked = opts.strategies || null;
    if (picked) {
      const a = D.STRATEGIES.attack[picked.attack] ? picked.attack : null;
      const d = D.STRATEGIES.defense[picked.defense] ? picked.defense : null;
      state.strategies[playerFaction] = { attack: a, defense: d };
      aiFactions.forEach((f, idx) => {
        const aiPick = idx === 0 ? (opts.aiStrategies || null) : null;
        state.strategies[f] = {
          attack: aiPick && D.STRATEGIES.attack[aiPick.attack] ? aiPick.attack : pickStrategyForForce(state.forces[f], 'attack'),
          defense: aiPick && D.STRATEGIES.defense[aiPick.defense] ? aiPick.defense : pickStrategyForForce(state.forces[f], 'defense')
        };
        const aiAtk = D.STRATEGIES.attack[state.strategies[f].attack];
        const aiDef = D.STRATEGIES.defense[state.strategies[f].defense];
        pushLog(state, `${forceData(state, f).name}战略：${aiAtk.name} · ${aiDef.name}`, 'sys');
      });
    }

    if (opts.customMap) state.customMap = opts.customMap;
    for (let row = 0; row < map.rows.length; row++) {
      const line = map.rows[row];
      for (let col = 0; col < line.length; col++) {
        const ch = line[col];
        const a = H.offsetToAxial(col, row);
        let t = 'plains';
        let bridge = false;
        if (ch === 'f') t = 'forest';
        else if (ch === 'h') t = 'hills';
        else if (ch === 'm') t = 'mountain';
        else if (ch === '=') t = 'river';
        else if (ch === 'b') { t = 'river'; bridge = true; }
        else if (ch === '~') t = 'water';
        else if (ch === 'C') t = 'city';
        state.grid[H.key(a.q, a.r)] = { q: a.q, r: a.r, t, bridge, col, row };
      }
    }

    for (const def of map.sites) {
      const a = H.offsetToAxial(def.col, def.row);
      const tile = tileAt(state, a.q, a.r);
      if (!tile) continue;
      const site = {
        id: def.id, name: def.name, q: a.q, r: a.r, col: def.col, row: def.row,
        kind: def.kind, faction: def.faction || null,
        original: def.faction || null, capital: !!def.capital,
        note: def.note || '', builtTurn: 0, builtCount: 0, airportUsedTurn: 0, airportUsedCount: 0, airportDropUsedTurn: 0, nukeReadyTurn: 0
      };
      tile.t = 'city';
      tile.siteId = site.id;
      state.sites.push(site);
      state.sitesById[site.id] = site;
    }

    for (const s of map.startUnits) {
      const a = H.offsetToAxial(s.col, s.row);
      addUnit(state, s.type, s.faction, a.q, a.r, s.state || 'full');
    }

    // 中立据点只保留 1 支部队，且必须驻守在据点格内。
    for (const site of state.sites) {
      if (site.faction !== null) continue;
      const type = (site.kind === 'factory' || site.kind === 'industrial_base') ? 'armored_car' : 'light_inf';
      if (!unitAt(state, site.q, site.r)) addUnit(state, type, 'neutral', site.q, site.r, 'full');
    }

    // 玩家与每个 AI 的首都周围额外增加 2 名轻步兵。
    for (const f of state.factions) {
      const cap = state.sites.find(s => s.faction === f && s.capital);
      if (!cap) continue;
      let made = 0;
      for (const n of H.neighbors(cap.q, cap.r)) {
        if (made >= 2) break;
        const t = tileAt(state, n.q, n.r);
        if (!t || t.t === 'water' || t.t === 'river' || !T[t.t].pass) continue;
        if (unitAt(state, n.q, n.r) || fortAt(state, n.q, n.r)) continue;
        if (t.siteId && t.siteId !== cap.id) continue;
        const extra = addUnit(state, 'light_inf', f, n.q, n.r, 'full');
        extra.freeStart = true;
        made++;
      }
    }

    pushLog(state, '战役开始。夺取敌方首都，或在大战结束时占据更多据点。', 'sys');
    startTurn(state, playerFaction, true);
    return state;
  }

  function transportTargets(state, transport) {
    const def = U[transport.type];
    const t = def && def.transport;
    if (!t || transport.cargo) return [];
    return state.units.filter(p => p.faction === transport.faction && p.id !== transport.id &&
      t.types.includes(p.type) && !p.cargo &&
      H.distance(transport.q, transport.r, p.q, p.r) === 1);
  }

  function loadTransport(state, transport, passenger) {
    if (!transport || !passenger) return { ok: false, why: '目标无效' };
    if (!transportTargets(state, transport).some(p => p.id === passenger.id)) {
      return { ok: false, why: '该单位无法装载此目标' };
    }
    transport.cargo = {
      type: passenger.type, state: passenger.state, hitsTaken: passenger.hitsTaken || 0,
      force: passenger.force || null, faction: passenger.faction
    };
    state.units = state.units.filter(u => u !== passenger);
    transport.hasMoved = true;
    transport.hasAttacked = false;
    transport.attacksMade = 0;
    pushLog(state, `${unitName(transport)} 装载 ${unitName(passenger)}`, 'info');
    return { ok: true, transport, passenger };
  }

  function releaseTransport(state, transport, q, r) {
    if (!transport || !transport.cargo) return { ok: false, why: '没有搭载单位' };
    const t = tileAt(state, q, r);
    if (!t || t.t === 'water' || t.t === 'river' || !T[t.t].pass) return { ok: false, why: '只能释放在陆地上' };
    if (unitAt(state, q, r) || fortAt(state, q, r)) return { ok: false, why: '目标格已被占据' };
    if (H.distance(transport.q, transport.r, q, r) !== 1) return { ok: false, why: '只能释放到周围相邻6格' };
    const cargo = transport.cargo;
    const u = addUnit(state, cargo.type, transport.faction, q, r, cargo.state);
    u.hitsTaken = cargo.hitsTaken || 0;
    u.state = u.hitsTaken > 0 ? 'damaged' : 'full';
    u.hasMoved = false; u.hasAttacked = false; u.attacksMade = 0;
    transport.cargo = null;
    transport.hasMoved = true; transport.hasAttacked = false; transport.attacksMade = 0;
    pushLog(state, `${unitName(transport)} 释放 ${unitName(u)}`, 'info');
    return { ok: true, unit: u };
  }

  function releaseCargoOnDeath(state, transport) {
    if (!transport || !transport.cargo) return null;
    const cargo = transport.cargo;
    transport.cargo = null;
    const u = addUnit(state, cargo.type, transport.faction, transport.q, transport.r, cargo.state);
    u.hitsTaken = cargo.hitsTaken || 0;
    u.state = u.hitsTaken > 0 ? 'damaged' : 'full';
    u.hasMoved = true; u.hasAttacked = true;
    pushLog(state, `${unitName(transport)} 被击毁，载员 ${unitName(u)} 在原地释放`, 'bad');
    return u;
  }

  function addUnit(state, type, faction, q, r, stateName) {
    const def = U[type];
    const u = {
      id: state.nextUnitId++, type, faction, force: state.forces ? state.forces[faction] : null, q, r,
      state: stateName === 'damaged' && def.damaged ? 'damaged' : 'full',
      hasMoved: false, hasAttacked: false,
      supporting: false, counterUsed: false, swapped: false, waiting: false,
      jammed: false, jamTurn: null, noMoveTurn: null, noAttackTurn: null,
      cargo: null, guerrillaUsedTurn: 0, supportTargetId: null, supportUsed: false, counterCount: 0, attacksMade: 0, attackedTargetIds: [], hitsTaken: 0, crossedWater: false
    };
    state.units.push(u);
    return u;
  }

  function pushLog(state, text, kind) {
    state.log.push({ turn: state.turn, text, kind: kind || 'info' });
    if (state.log.length > 90) state.log.shift();
  }

  /* ---------- 回合 ---------- */
  function canProduceAtSite(state, site, typeId) {
    const def = U[typeId];
    if (!def || !def.deploy || !def.deploy.includes(site.kind)) return false;
    if (def.capitalOnly && !site.capital) return false;
    if (def.capitalDeploy && site.kind === 'city' && !site.capital) return false;
    const owner = specialOwner(typeId);
    if (owner && owner !== forceOf(state, site.faction)) return false;
    return true;
  }

  function guerrillaMilitiaTargets(state, unit) {
    const out = [];
    for (const n of H.neighbors(unit.q, unit.r)) {
      const t = tileAt(state, n.q, n.r);
      if (!t || t.t === 'water' || t.t === 'river' || !T[t.t].pass) continue;
      if (t.siteId) {
        const site = state.sitesById[t.siteId];
        if (!site || site.faction !== unit.faction) continue;
      }
      if (unitAt(state, n.q, n.r) || fortAt(state, n.q, n.r)) continue;
      out.push(t);
    }
    return out;
  }

  function canGuerrillaMilitia(state, unit) {
    if (!unit || unit.type !== 'guerrilla') return { ok: false, why: '不是游击队' };
    if (unit.faction !== state.current) return { ok: false, why: '只能在己方回合生产' };
    if (unit.hasMoved || unit.hasAttacked || unit.supporting) return { ok: false, why: '该单位本回合已行动' };
    if (unit.guerrillaUsedTurn === state.turn) return { ok: false, why: '该游击队本回合已生产民兵' };
    const cost = costOf(state, 'militia', unit.faction).money;
    if (state.money[unit.faction] < cost) return { ok: false, why: '金钱不足（需 ' + cost + '）' };
    if (!guerrillaMilitiaTargets(state, unit).length) return { ok: false, why: '6格内没有空位' };
    return { ok: true, cost };
  }

  function spawnGuerrillaMilitia(state, unit, q, r) {
    const chk = canGuerrillaMilitia(state, unit);
    if (!chk.ok) return chk;
    if (!guerrillaMilitiaTargets(state, unit).some(t => t.q === q && t.r === r)) {
      return { ok: false, why: '该地格不能部署民兵' };
    }
    state.money[unit.faction] -= chk.cost;
    const u = addUnit(state, 'militia', unit.faction, q, r, 'full');
    u.hasMoved = true; u.hasAttacked = true;
    unit.hasMoved = true; unit.hasAttacked = true;
    unit.guerrillaUsedTurn = state.turn;
    pushLog(state, `${unitName(unit)} 花费 ${chk.cost} 金，在 (${tileAt(state, q, r).col},${tileAt(state, q, r).row}) 生产民兵`,
      unit.faction === state.playerFaction ? 'good' : 'bad');
    return { ok: true, unit, cost: chk.cost };
  }

  function startTurn(state, faction, silent) {
    state.current = faction;
    state.fortsBuilt = 0;
    state.fortGunBuilt = 0;
    const endurance = hasStrategy(state, faction, 'defense', 'endurance');
    for (const u of state.units.slice()) {
      if (u.faction === faction && u.state === 'damaged' && (u.waiting || endurance)) {
        const site = siteAt(state, u.q, u.r);
        if (site && site.faction === faction && canProduceAtSite(state, site, u.type)) {
          const hits = Math.max(0, (u.hitsTaken || 1) - 1);
          u.hitsTaken = hits;
          u.state = hits > 0 ? 'damaged' : 'full';
          pushLog(state, `${unitName(u)} 在${site.name}休整，恢复1格受损条`,
            faction === state.playerFaction ? 'good' : 'bad');
        }
      }
      u.counterUsed = false;
      u.counterCount = 0;
      u.attacksMade = 0;
      u.attackedTargetIds = [];
      u.supporting = false;
      u.supportTargetId = null;
      u.supportUsed = false;
      u.swapped = false;
      u.crossedWater = false;
      u.jammed = false;
      if (u.faction === faction && u.jamTurn === state.turn) {
        u.jammed = true;
        u.jamTurn = null;
      }
      if (u.faction === faction) { u.hasMoved = false; u.hasAttacked = false; u.waiting = false; }
    }
    const inc = incomeOf(state, faction);
    const mul = state.aiFactions.includes(faction) ? state.aiIncomeMul : 1;
    const gained = Math.round(inc.money * mul);
    state.money[faction] += gained;
    if (!silent) {
      pushLog(state, `${forceData(state, faction).name}回合开始 · 金钱 +${gained}` +
        (inc.maintenance ? `（产出 ${inc.grossMoney}，维护 -${inc.maintenance}）` : '') +
        `（人力 ${inc.pop} / 工业 ${inc.industry}）`,
        faction === state.playerFaction ? 'player' : 'ai');
    }
    const humanWaveRound = state.turn % 4 === 1;
    const capitalMilitiaRound = state.turn % 2 === 1;
    if (hasStrategy(state, faction, 'attack', 'human_wave') && humanWaveRound) {
      if (faction === state.playerFaction) {
        state.militiaPending[faction] = (state.militiaPending[faction] || 0) + 2;
      } else {
        const spots = militiaTargets(state, faction);
        let made = 0;
        for (let i = 0; i < 2 && i < spots.length; i++) {
          const spot = spots[i];
          const u = addUnit(state, 'militia', faction, spot.q, spot.r, 'full');
          u.hasMoved = true;
          u.hasAttacked = true;
          made++;
        }
        if (made && !silent) {
          pushLog(state, `${forceData(state, faction).name} 人海攻势：${made} 名民兵在据点周围集结`, 'bad');
        }
      }
    }
    // 革命联盟：每两回合在首都周围获得 1 名民兵。
    if (forceOf(state, faction) === 'revolution' && capitalMilitiaRound) {
      if (faction === state.playerFaction) {
        state.capitalMilitiaPending[faction] = (state.capitalMilitiaPending[faction] || 0) + 1;
      } else {
        const cap = state.sites.find(x => x.faction === faction && x.capital);
        const spots = cap ? capitalMilitiaTargets(state, faction) : [];
        if (spots.length) {
          const spot = spots[0];
          const u = addUnit(state, 'militia', faction, spot.q, spot.r, 'full');
          u.hasMoved = true;
          u.hasAttacked = true;
          if (!silent) pushLog(state, `${forceData(state, faction).name} 首都民兵在${cap.name}周围集结`, 'bad');
        }
      }
    }
  }

  function endTurn(state) {
    if (state.over) return state.over;
    const v = checkVictory(state);
    if (v) return v;
    const order = state.factions && state.factions.length ? state.factions : ['alliance', 'empire'];
    let idx = order.indexOf(state.current);
    if (idx < 0) idx = 0;
    const wrap = idx === order.length - 1;
    const next = order[(idx + 1) % order.length];
    if (wrap) {
      state.turn++;
      if (state.maxTurns && state.turn > state.maxTurns) {
        state.turn = state.maxTurns;
        return checkVictory(state, true) || null;
      }
    }
    startTurn(state, next, false);
    return null;
  }

  /* ---------- 人海攻势部署 ---------- */
  function militiaTargetsForSites(state, faction, sites) {
    const out = [];
    const seen = new Set();
    for (const site of sites) {
      if (site.faction !== faction) continue;
      const cand = [site];
      for (const n of H.neighbors(site.q, site.r)) {
        const t = tileAt(state, n.q, n.r);
        if (t) cand.push(t);
      }
      for (const t of cand) {
        const k = H.key(t.q, t.r);
        if (seen.has(k)) continue;
        if (t.t === 'water' || t.t === 'river') continue;
        if (!t.siteId && (!T[t.t] || !T[t.t].pass)) continue;
        if (t.siteId && t.siteId !== site.id) continue;
        if (unitAt(state, t.q, t.r)) continue;
        if (fortAt(state, t.q, t.r)) continue;
        seen.add(k);
        out.push(t);
      }
    }
    return out;
  }

  function militiaTargets(state, faction) {
    return militiaTargetsForSites(state, faction, state.sites.filter(s => s.faction === faction));
  }

  function capitalMilitiaTargets(state, faction) {
    const cap = state.sites.find(s => s.faction === faction && s.capital);
    return cap ? militiaTargetsForSites(state, faction, [cap]) : [];
  }

  function placeMilitia(state, q, r) {
    const faction = state.current;
    if (!state.militiaPending || !(state.militiaPending[faction] > 0)) {
      return { ok: false, why: '没有待部署的民兵' };
    }
    if (!militiaTargets(state, faction).some(t => t.q === q && t.r === r)) {
      return { ok: false, why: '该位置不能部署民兵' };
    }
    const u = addUnit(state, 'militia', faction, q, r, 'full');
    u.hasMoved = true;
    u.hasAttacked = true;
    state.militiaPending[faction] -= 1;
    if (state.militiaPending[faction] <= 0) state.militiaPending[faction] = 0;
    pushLog(state, `${forceData(state, faction).short} 人海攻势：民兵部署到 (${tileAt(state, q, r).col},${tileAt(state, q, r).row})`,
      faction === state.playerFaction ? 'good' : 'bad');
    return { ok: true, unit: u, remaining: state.militiaPending[faction] };
  }

  function placeCapitalMilitia(state, q, r) {
    const faction = state.current;
    if (!state.capitalMilitiaPending || !(state.capitalMilitiaPending[faction] > 0)) {
      return { ok: false, why: '没有待部署的首都民兵' };
    }
    if (!capitalMilitiaTargets(state, faction).some(t => t.q === q && t.r === r)) {
      return { ok: false, why: '该位置不能部署首都民兵' };
    }
    const u = addUnit(state, 'militia', faction, q, r, 'full');
    u.hasMoved = true;
    u.hasAttacked = true;
    state.capitalMilitiaPending[faction] -= 1;
    if (state.capitalMilitiaPending[faction] <= 0) state.capitalMilitiaPending[faction] = 0;
    pushLog(state, `${forceData(state, faction).short} 首都民兵部署到 (${tileAt(state, q, r).col},${tileAt(state, q, r).row})`,
      faction === state.playerFaction ? 'good' : 'bad');
    return { ok: true, unit: u, remaining: state.capitalMilitiaPending[faction] };
  }

  /* ---------- 据点与胜负 ---------- */
  function addHate(state, defender, attacker, amount) {
    if (!defender || !attacker || defender === attacker) return;
    if (!state.aiFactions || !state.aiFactions.includes(defender)) return;
    if (!state.aiHate) state.aiHate = {};
    const old = state.aiHate[defender];
    const map = old && typeof old === 'object' ? Object.assign({}, old) : {};
    if (typeof old === 'string') map[old] = map[old] || 1;
    map[attacker] = (map[attacker] || 0) + (amount || 1);
    state.aiHate[defender] = map;
  }

  function captureSite(state, site, faction) {
    if (site.faction === faction) return;
    const old = site.faction;
    if (old && state.aiFactions && state.aiFactions.includes(old) && old !== faction) {
      addHate(state, old, faction, 5);
    }
    site.faction = faction;
    state.money[faction] += D.RULES.captureReward;
    state.stats.captured[faction] = (state.stats.captured[faction] || 0) + 1;
    const kindName = D.SITE_KINDS[site.kind].name;
    pushLog(state, `${forceData(state, faction).short}占领了${site.capital ? '首都' : ''}${site.name}（${kindName}）` +
      (old ? `，原属${forceData(state, old).short}` : '，中立据点'), faction === state.playerFaction ? 'good' : 'bad');
    if (old) site.formerOwner = old;
    return checkVictory(state);
  }

  function siteCount(state, faction) { return state.sites.filter(s => s.faction === faction).length; }

  function refreshEliminations(state) {
    if (!state.eliminated) state.eliminated = {};
    for (const f of state.factions.slice()) {
      if (f === 'neutral') continue;
      if (siteCount(state, f) === 0 && unitsOf(state, f).length === 0) {
        state.eliminated[f] = true;
        state.factions = state.factions.filter(x => x !== f);
        pushLog(state, `${forceData(state, f).name} 已被击败，退出战场`, 'sys');
      }
    }
  }

  function checkVictory(state, byTurnLimit) {
    if (state.over) return state.over;
    refreshEliminations(state);
    const player = state.playerFaction;
    const aiSlots = state.aiFactions || [];
    if (aiSlots.length && state.eliminated[player]) {
      const winner = state.factions.filter(f => f !== player)
        .sort((a, b) => siteCount(state, b) - siteCount(state, a))[0] || 'draw';
      state.over = { winner, reason: `${forceData(state, player).name}已被击败`, detail: '全军覆没' };
      pushLog(state, state.over.reason, 'sys');
      return state.over;
    }
    if (aiSlots.length && aiSlots.every(f => state.eliminated[f])) {
      state.over = { winner: player, reason: '所有敌对 AI 已被击败', detail: '大陆统一' };
      pushLog(state, state.over.reason, 'sys');
      return state.over;
    }
    const multi = state.factions && state.factions.length > 2;
    if (multi) {
      const player = state.playerFaction;
      const ais = state.factions.filter(f => f !== player);
      const playerCap = state.sites.find(s => s.capital && s.original === player);
      if (playerCap && playerCap.faction && playerCap.faction !== player && playerCap.faction !== 'neutral') {
        state.over = { winner: playerCap.faction, reason: `${forceData(state, playerCap.faction).name}攻陷了${playerCap.name}`, detail: `${forceData(state, player).name}首都陷落` };
        pushLog(state, state.over.reason, 'sys');
        return state.over;
      }
      if (siteCount(state, player) === 0 && unitsOf(state, player).length === 0) {
        const winner = ais.slice().sort((a, b) => siteCount(state, b) - siteCount(state, a))[0] || 'draw';
        state.over = { winner, reason: `${forceData(state, player).name}已失去全部据点`, detail: '全线崩溃' };
        pushLog(state, state.over.reason, 'sys');
        return state.over;
      }
      if (ais.length === 0 || ais.every(f => state.eliminated[f])) {
        state.over = { winner: player, reason: '所有敌对 AI 已被逐出战场', detail: '大陆统一' };
        pushLog(state, state.over.reason, 'sys');
        return state.over;
      }
    } else {
    for (const s of state.sites) {
      if (!s.capital || !s.original) continue;
      if (s.faction && s.faction !== 'neutral' && s.faction !== s.original) {
        state.over = {
          winner: s.faction,
          reason: `${forceData(state, s.faction).name}攻陷了${s.name}`,
          detail: forceData(state, s.original).name + '首都陷落'
        };
        pushLog(state, state.over.reason, 'sys');
        return state.over;
      }
    }
    for (const f of ['alliance', 'empire']) {
      if (siteCount(state, f) === 0 && unitsOf(state, f).length === 0) {
        const w = f === 'alliance' ? 'empire' : 'alliance';
        state.over = { winner: w, reason: `${forceData(state, f).name}已失去全部据点`, detail: '全线崩溃' };
        pushLog(state, state.over.reason, 'sys');
        return state.over;
      }
    }
    }
    if (byTurnLimit || (state.maxTurns && state.turn > state.maxTurns)) {
      let winner = null, bestSites = -1, bestUnits = -1;
      for (const f of state.factions) {
        const sc = siteCount(state, f), uc = unitsOf(state, f).length;
        if (sc > bestSites || (sc === bestSites && uc > bestUnits)) {
          bestSites = sc; bestUnits = uc; winner = f;
        } else if (sc === bestSites && uc === bestUnits) winner = 'draw';
      }
      state.over = {
        winner,
        reason: winner === 'draw' ? '停战协定' : `${forceData(state, winner).name}在停战时占据优势`,
        detail: state.factions.map(f => `${forceData(state, f).short} ${siteCount(state, f)} 据点`).join(' / ')
      };
      pushLog(state, state.over.reason, 'sys');
      return state.over;
    }
    return null;
  }

  /* ---------- 生产 ---------- */
  function freeCapacity(state, site) {
    const caps = capsOf(state, site.faction);
    const used = usageOf(state, site.faction);
    return { money: state.money[site.faction], pop: caps.pop - used.pop, industry: caps.industry - used.industry, caps, used };
  }

  function canBuild(state, site, typeId) {
    const def = U[typeId];
    if (!def) return { ok: false, why: '未知兵种' };
    if (site.faction !== state.current) return { ok: false, why: '只能在己方回合、己方据点生产' };
    const builtNow = site.builtTurn === state.turn ? (site.builtCount || 1) : 0;
    const perTurn = site.capital ? 2 : 1;
    if (builtNow >= perTurn) return { ok: false, why: site.capital ? '首都本回合已生产 2 个单位' : '本据点本回合已生产' };
    const owner = specialOwner(typeId);
    if (owner && owner !== forceOf(state, site.faction)) return { ok: false, why: '该特殊兵种不属于本势力' };
    if (!def.deploy || !def.deploy.includes(site.kind)) {
      const need = (def.deploy || []).map(k => D.SITE_KINDS[k].name).join('/');
      return { ok: false, why: '只能在' + need + '部署' };
    }
    if (def.capitalOnly && !site.capital) return { ok: false, why: '只能在首都部署' };
    if (def.capitalDeploy && site.kind === 'city' && !site.capital) return { ok: false, why: '该单位只能在首都部署' };
    const free = freeCapacity(state, site);
    const cost = costOf(state, typeId, site.faction);
    if (free.money < cost.money) return { ok: false, why: '金钱不足' };
    if (cost.pop > 0 && free.pop < cost.pop) return { ok: false, why: '人力上限不足' };
    if (cost.industry > 0 && free.industry < cost.industry) return { ok: false, why: '工业上限不足' };
    if (!spawnTile(state, site, typeId)) {
      return { ok: false, why: isNaval(typeId) ? '港口附近没有可部署水域' : '据点周围没有空位' };
    }
    return { ok: true };
  }

  function landDeployTiles(state, site, typeId) {
    const def = U[typeId];
    if (!def || def.naval) return [];
    const out = [];
    const cand = [tileAt(state, site.q, site.r)];
    for (const n of H.neighbors(site.q, site.r)) cand.push(tileAt(state, n.q, n.r));
    for (const t of cand) {
      if (!t) continue;
      if (t.t === 'water' || t.t === 'river') continue;
      if (!T[t.t] || !T[t.t].pass) continue;
      if (t.siteId && t.siteId !== site.id) continue;
      if (unitAt(state, t.q, t.r)) continue;
      if (fortAt(state, t.q, t.r)) continue;
      if (T[t.t].noVehicle && isVehicle(typeId) && !U[typeId].ignoreNoVehicle) continue;
      out.push(t);
    }
    return out;
  }

  function spawnTile(state, site, typeId) {
    const tiles = U[typeId] && U[typeId].naval
      ? navalDeployTiles(state, site, typeId)
      : landDeployTiles(state, site, typeId);
    return tiles.length ? { q: tiles[0].q, r: tiles[0].r } : null;
  }

  function navalDeployTiles(state, site, typeId) {
    const def = U[typeId];
    if (!def || !def.naval) return [];
    const out = [];
    for (const n of H.neighbors(site.q, site.r)) {
      const t = tileAt(state, n.q, n.r);
      if (!t || t.siteId) continue;
      if (t.t !== 'water' && t.t !== 'river') continue;
      if (unitAt(state, n.q, n.r)) continue;
      out.push(t);
    }
    return out;
  }

  function buildUnit(state, site, typeId, q, r) {
    const chk = canBuild(state, site, typeId);
    if (!chk.ok) return chk;
    const def = U[typeId];
    let spot = null;
    if (q != null && r != null) {
      const tiles = def.naval ? navalDeployTiles(state, site, typeId) : landDeployTiles(state, site, typeId);
      if (!tiles.some(t => t.q === q && t.r === r)) {
        return { ok: false, why: def.naval ? '该海域不能部署此舰船' : '该位置不能部署此单位' };
      }
      spot = { q, r };
    } else {
      spot = spawnTile(state, site, typeId);
    }
    if (!spot) return { ok: false, why: isNaval(typeId) ? '港口附近没有可部署水域' : '据点周围没有空位' };
    state.money[site.faction] -= costOf(state, typeId, site.faction).money;
    const u = addUnit(state, typeId, site.faction, spot.q, spot.r, 'full');
    const force = forceOf(state, site.faction);
    if (!(force === 'northsea' && isNaval(typeId))) {
      u.hasMoved = true;
      u.hasAttacked = true;
    }
    if (site.builtTurn !== state.turn) { site.builtTurn = state.turn; site.builtCount = 0; }
    site.builtCount = (site.builtCount || 0) + 1;
    state.stats.built[site.faction] = (state.stats.built[site.faction] || 0) + 1;
    pushLog(state, `${forceData(state, site.faction).short}在${site.name}组建了${def.name}`, site.faction === state.playerFaction ? 'good' : 'bad');
    return { ok: true, unit: u };
  }

  /* ---------- 存档 ---------- */
  function serialize(state) {
    return JSON.stringify({
      v: 13,
      mapId: state.mapId,
      customMap: state.customMap || null,
      turn: state.turn,
      current: state.current,
      playerFaction: state.playerFaction,
      factions: state.factions,
      aiFactions: state.aiFactions,
      aiFaction: state.aiFaction,
      difficulty: state.difficulty,
      aiIncomeMul: state.aiIncomeMul,
      money: state.money,
      rng: state.rng,
      nextUnitId: state.nextUnitId,
      over: state.over,
      stats: state.stats,
      log: state.log.slice(-40),
      sites: state.sites.map(s => ({ id: s.id, faction: s.faction, builtTurn: s.builtTurn, builtCount: s.builtCount || 0, airportUsedTurn: s.airportUsedTurn || 0, airportUsedCount: s.airportUsedCount || 0, airportDropUsedTurn: s.airportDropUsedTurn || 0, nukeReadyTurn: s.nukeReadyTurn || 0 })),
      forts: state.forts.map(f => ({ id: f.id, type: f.type, faction: f.faction, q: f.q, r: f.r })),
      nextFortId: state.nextFortId,
      fortsBuilt: state.fortsBuilt || 0,
      fortGunBuilt: state.fortGunBuilt || 0,
      strategies: state.strategies,
      aiHate: state.aiHate || {},
      aiMisses: state.aiMisses || {},
      eliminated: state.eliminated || {},
      forces: state.forces,
      militiaPending: state.militiaPending || { alliance: 0, empire: 0 },
      capitalMilitiaPending: state.capitalMilitiaPending || { alliance: 0, empire: 0 },
      pendingLandings: state.pendingLandings || [],
      units: state.units.map(u => ({
        id: u.id, type: u.type, faction: u.faction, force: u.force || null, q: u.q, r: u.r,
        state: u.state, hasMoved: u.hasMoved, hasAttacked: u.hasAttacked,
        supporting: !!u.supporting, counterUsed: !!u.counterUsed, swapped: !!u.swapped, waiting: !!u.waiting,
        jammed: !!u.jammed, jamTurn: u.jamTurn || null, counterCount: u.counterCount || 0,
        noMoveTurn: u.noMoveTurn || null, noAttackTurn: u.noAttackTurn || null,
        cargo: u.cargo || null, freeStart: !!u.freeStart, guerrillaUsedTurn: u.guerrillaUsedTurn || 0, supportTargetId: u.supportTargetId || null, supportUsed: !!u.supportUsed,
        attacksMade: u.attacksMade || 0, attackedTargetIds: u.attackedTargetIds || [], hitsTaken: u.hitsTaken || 0
      }))
    });
  }

  function deserialize(text) {
    let raw;
    try { raw = JSON.parse(text); } catch (e) { return null; }
    if (!raw || raw.v !== 13 || !raw.units || !raw.sites) return null;
    const state = create({ playerFaction: raw.playerFaction, difficulty: raw.difficulty, mapId: raw.mapId, customMap: raw.customMap || null, playerForce: raw.forces && raw.forces[raw.playerFaction], aiForce: raw.forces && raw.forces[raw.aiFaction] });
    state.customMap = raw.customMap || state.customMap || null;
    state.turn = raw.turn;
    state.current = raw.current;
    state.factions = raw.factions || state.factions;
    state.aiFactions = raw.aiFactions || state.aiFactions;
    state.aiFaction = raw.aiFaction || (state.aiFactions && state.aiFactions[0]) || state.aiFaction;
    state.aiIncomeMul = raw.aiIncomeMul;
    state.money = raw.money;
    state.rng = raw.rng;
    state.nextUnitId = raw.nextUnitId;
    state.over = raw.over || null;
    state.stats = raw.stats || state.stats;
    state.log = raw.log || [];
    for (const s of state.sites) { s.builtTurn = 0; s.airportUsedTurn = 0; }
    for (const s of raw.sites) {
      const site = state.sitesById[s.id];
      if (site) {
        site.faction = s.faction;
        site.builtTurn = s.builtTurn || 0;
        site.builtCount = s.builtCount || 0;
        site.airportUsedTurn = s.airportUsedTurn || 0;
        site.airportUsedCount = s.airportUsedCount || 0;
        site.airportDropUsedTurn = s.airportDropUsedTurn || 0;
        site.nukeReadyTurn = s.nukeReadyTurn || 0;
      }
    }
    state.forts = (raw.forts || []).map(f => ({ id: f.id, type: f.type, faction: f.faction, q: f.q, r: f.r }));
    state.fortIndex = {};
    for (const f of state.forts) state.fortIndex[H.key(f.q, f.r)] = f;
    state.nextFortId = raw.nextFortId || (state.forts.reduce((m, f) => Math.max(m, f.id || 0), 0) + 1);
    state.fortsBuilt = raw.fortsBuilt || 0;
    state.fortGunBuilt = raw.fortGunBuilt || 0;
    if (raw.strategies) state.strategies = raw.strategies;
    state.aiHate = raw.aiHate || state.aiHate;
    state.aiMisses = raw.aiMisses || state.aiMisses || {};
    state.eliminated = raw.eliminated || state.eliminated;
    state.militiaPending = raw.militiaPending || state.militiaPending;
    state.capitalMilitiaPending = raw.capitalMilitiaPending || state.capitalMilitiaPending;
    state.pendingLandings = raw.pendingLandings || [];
    if (raw.forces) state.forces = raw.forces;
    state.units = raw.units.map(u => ({
      id: u.id, type: u.type, faction: u.faction, force: u.force || (state.forces ? state.forces[u.faction] : null), q: u.q, r: u.r,
      state: u.state === 'damaged' ? 'damaged' : 'full',
      hasMoved: !!u.hasMoved, hasAttacked: !!u.hasAttacked,
      supporting: !!u.supporting, counterUsed: !!u.counterUsed, swapped: !!u.swapped, waiting: !!u.waiting,
      jammed: !!u.jammed, jamTurn: u.jamTurn || null, counterCount: u.counterCount || 0,
      noMoveTurn: u.noMoveTurn || null, noAttackTurn: u.noAttackTurn || null,
      cargo: u.cargo || null, freeStart: !!u.freeStart, guerrillaUsedTurn: u.guerrillaUsedTurn || 0, supportTargetId: u.supportTargetId || null, supportUsed: !!u.supportUsed,
      attacksMade: u.attacksMade || 0, attackedTargetIds: u.attackedTargetIds || [], hitsTaken: u.hitsTaken || 0
    }));
    return state;
  }

  function deployable(state, site, typeId) {
    const def = U[typeId];
    if (!def || !def.deploy || !def.deploy.includes(site.kind)) return false;
    if (def.capitalOnly && !site.capital) return false;
    if (def.capitalDeploy && site.kind === 'city' && !site.capital) return false;
    const owner = specialOwner(typeId);
    if (owner && owner !== forceOf(state, site.faction)) return false;
    return !!spawnTile(state, site, typeId);
  }

  SG.game = {
    create, tileAt, siteAt, cityAt: siteAt, unitAt, unitsOf, isEnemy,
    yieldOf, siteDefense, terrainDefense, depthDefenseAt, moveCost,
    effective, statText, isDamaged, isFragile, isNaval, unitName, unitsAt, canOccupy, canTraverse,
    strategyOf, hasStrategy, costOf, forceOf, forceData, buildOrder, specialOwner, attackLimit, attackRepeatable, maxHits, militiaTargets, capitalMilitiaTargets, placeMilitia, placeCapitalMilitia, capsOf, usageOf, incomeOf, maintenanceOf, freeCapacity,
    fortLimit, fortCost, airportMaxUses, airportRangeBonus, counterLimit,
    startTurn, endTurn, refreshEliminations, captureSite, captureCity: captureSite, addHate, checkVictory, fortAt, addFort, removeFort,
    canBuild, canProduceAtSite, buildUnit, spawnTile, landDeployTiles, navalDeployTiles, deployable, pushLog, serialize, deserialize,
    nextRandom, siteCount, cityCount: siteCount, isVehicle, addUnit, transportTargets, loadTransport, releaseTransport, releaseCargoOnDeath, guerrillaMilitiaTargets, canGuerrillaMilitia, spawnGuerrillaMilitia
  };
})(typeof window !== 'undefined' ? window : globalThis);
