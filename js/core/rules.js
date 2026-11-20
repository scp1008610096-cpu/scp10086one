/* ============================================================
 * 钢铁洪流 · 规则引擎（兵棋推演版）
 * 移动 / 寻路 / 命中判定 / 受损与击毁 / 占领
 * ============================================================ */
(function (root) {
  'use strict';
  const SG = (root.SG = root.SG || {});
  const D = SG.data, H = SG.hex, U = D.UNITS, F = D.FACTIONS, T = D.TERRAIN;
  const G = () => SG.game;

  function key(q, r) { return H.key(q, r); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /* ---------- 可达范围 ---------- */
  function waterDomain(state, unit, q, r) {
    const t = G().tileAt(state, q, r);
    if (!t) return false;
    if (U[unit.type] && U[unit.type].naval) return t.t === 'water' || t.t === 'river';
    return !t.bridge && (t.t === 'water' || t.t === 'river');
  }

  function reachable(state, unit) {
    if (!unit || unit.jammed) return new Map();
    const game = G();
    const start = key(unit.q, unit.r);
    if (U[unit.type] && U[unit.type].immobile) {
      return new Map([[start, { q: unit.q, r: unit.r, cost: 0, blocked: false, prev: null }]]);
    }
    if (unit.noMoveTurn === state.turn) {
      return new Map([[start, { q: unit.q, r: unit.r, cost: 0, blocked: false, prev: null }]]);
    }
    const best = new Map([[start, 0]]);
    const prev = new Map();
    const blocked = new Set();
    const destinations = new Set([start]);
    if (unit.hasMoved) {
      return new Map([[start, { q: unit.q, r: unit.r, cost: 0, blocked: false, prev: null }]]);
    }
    const move = game.effective(unit, state).move;
    const startWater = waterDomain(state, unit, unit.q, unit.r);
    const open = [{ q: unit.q, r: unit.r, cost: 0 }];

    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i].cost < open[bi].cost) bi = i;
      const cur = open.splice(bi, 1)[0];
      if (cur.cost > best.get(key(cur.q, cur.r))) continue;

      for (const n of H.neighbors(cur.q, cur.r)) {
        const tile = game.tileAt(state, n.q, n.r);
        if (!tile) continue;
        const cost = game.moveCost(state, n.q, n.r, unit, cur.q, cur.r);
        if (!isFinite(cost)) continue;
        if (!game.canTraverse(state, unit, n.q, n.r)) continue;
        const nc = cur.cost + cost;
        if (nc > move) continue;
        const k = key(n.q, n.r);
        if (!best.has(k) || nc < best.get(k)) {
          best.set(k, nc);
          prev.set(k, { q: cur.q, r: cur.r });
          if (game.canOccupy(state, unit, n.q, n.r)) destinations.add(k);
          const fort = game.fortAt(state, n.q, n.r);
          const stopFort = fort && (fort.type === 'wire' || fort.type === 'trap') &&
            D.FORTS[fort.type].block.includes(unit.type);
          const stopWater = waterDomain(state, unit, n.q, n.r) !== startWater;
          if (!stopFort && !stopWater) open.push({ q: n.q, r: n.r, cost: nc });
        }
      }
    }

    const out = new Map();
    for (const [k, cost] of best) {
      if (!destinations.has(k)) continue;
      const p = H.parse(k);
      out.set(k, { q: p.q, r: p.r, cost, blocked: blocked.has(k), prev: prev.get(k) || null });
    }
    return out;
  }

  function pathTo(reach, q, r) {
    const path = [];
    let k = key(q, r);
    let guard = 0;
    while (reach.has(k) && guard++ < 200) {
      const node = reach.get(k);
      if (node.cost === 0) break;
      path.push({ q: node.q, r: node.r });
      if (!node.prev) break;
      k = key(node.prev.q, node.prev.r);
    }
    path.reverse();
    return path;
  }

  /* ---------- 长距离 A* ---------- */
  function findPath(state, unit, tq, tr) {
    const game = G();
    const startK = key(unit.q, unit.r), goalK = key(tq, tr);
    const startWater = waterDomain(state, unit, unit.q, unit.r);
    if (startK === goalK) return [];
    const open = [{ q: unit.q, r: unit.r, g: 0, f: H.distance(unit.q, unit.r, tq, tr) }];
    const gScore = new Map([[startK, 0]]);
    const prev = new Map();
    const closed = new Set();
    let guard = 0;

    while (open.length && guard++ < 7000) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
      const cur = open.splice(bi, 1)[0];
      const ck = key(cur.q, cur.r);
      if (ck === goalK) {
        const path = [];
        let k = goalK;
        while (k !== startK) {
          const p = H.parse(k);
          path.push({ q: p.q, r: p.r });
          const pr = prev.get(k);
          if (!pr) return null;
          k = key(pr.q, pr.r);
        }
        return path.reverse();
      }
      if (closed.has(ck)) continue;
      closed.add(ck);

      for (const n of H.neighbors(cur.q, cur.r)) {
        const nk = key(n.q, n.r);
        if (closed.has(nk)) continue;
        const tile = game.tileAt(state, n.q, n.r);
        if (!tile) continue;
        const cost = game.moveCost(state, n.q, n.r, unit, cur.q, cur.r);
        if (!isFinite(cost)) continue;
        if (!game.canTraverse(state, unit, n.q, n.r)) continue;
        if (nk === goalK && !game.canOccupy(state, unit, n.q, n.r)) continue;
        const ng = cur.g + cost;
        if (!gScore.has(nk) || ng < gScore.get(nk)) {
          gScore.set(nk, ng);
          prev.set(nk, { q: cur.q, r: cur.r });
          const fort = game.fortAt(state, n.q, n.r);
          const stopFort = fort && (fort.type === 'wire' || fort.type === 'trap') &&
            D.FORTS[fort.type].block.includes(unit.type);
          const stopWater = waterDomain(state, unit, n.q, n.r) !== startWater;
          if (!stopFort && !stopWater) open.push({ q: n.q, r: n.r, g: ng, f: ng + H.distance(n.q, n.r, tq, tr) * 1.05 });
        }
      }
    }
    return null;
  }

  /* ---------- 攻击目标 ---------- */
  function tauntEnemies(state, unit) {
    if (!unit) return [];
    return state.units.filter(o => o.faction !== unit.faction && U[o.type] &&
      U[o.type].taunt && H.distance(unit.q, unit.r, o.q, o.r) <= U[o.type].taunt);
  }

  function stackedWithTank(state, unit) {
    if (!unit) return null;
    return state.units.find(o => o.id !== unit.id && o.q === unit.q && o.r === unit.r &&
      o.type === 'infantry_tank') || null;
  }

  function attackTargets(state, unit, q, r) {
    if (!unit || unit.jammed || unit.hasAttacked) return [];
    if (unit.noAttackTurn === state.turn) return [];
    if ((unit.attacksMade || 0) >= G().attackLimit(state, unit)) return [];
    if (unit.type === 'fort_gun' && unit.noAttackTurn === state.turn) return [];
    const eff = G().effective(unit, state);
    const fromQ = q == null ? unit.q : q;
    const fromR = r == null ? unit.r : r;
    const out = [];
    for (const other of state.units) {
      if (other === unit) continue;
      if (other.faction === unit.faction) continue;
      if (!G().attackRepeatable(state, unit) && unit.attackedTargetIds && unit.attackedTargetIds.includes(other.id)) continue;
      const tankStack = state.units.find(o => o.q === other.q && o.r === other.r && o.type === 'infantry_tank');
      if (tankStack && tankStack.id !== other.id) continue;
      const d = H.distance(fromQ, fromR, other.q, other.r);
      if (d < eff.minRange || d > eff.range) continue;
      out.push(other);
    }
    const taunts = tauntEnemies(state, unit);
    if (taunts.length) return out.filter(t => taunts.includes(t));
    return out;
  }

  function flankBonus(state, attacker, defender) {
    if (U[defender.type] && U[defender.type].immuneFlank) return 0;
    let n = 0;
    for (const nb of H.neighbors(defender.q, defender.r)) {
      const u = G().unitAt(state, nb.q, nb.r);
      if (u && u.faction === attacker.faction && u.id !== attacker.id) n++;
      if (n >= D.RULES.flankMax) break;
    }
    return Math.min(D.RULES.flankMax, n) * D.RULES.flankBonus;
  }

  /* 协同攻击：友军支援单位攻击范围内的目标，每支 +1，可叠加 */
  function supportBonus(state, attacker, defender, consume) {
    let n = 0;
    for (const u of state.units) {
      if (u === attacker || u.faction !== attacker.faction || !u.supporting || u.supportUsed) continue;
      if (u.supportTargetId !== defender.id) continue;
      n++;
      if (consume) u.supportUsed = true;
    }
    return n * D.RULES.supportBonus;
  }

  function supportRestriction(state, unit) {
    if (!unit) return { ok: false, why: '没有单位' };
    const max = G().maxHits(unit.type);
    const left = max - (unit.hitsTaken || 0);
    if (max > 1 && left <= 1) return { ok: false, why: '受损条仅剩1格，无法协同' };
    const stack = state ? G().unitsAt(state, unit.q, unit.r) : [];
    if (stack.length > 1 && stack.some(o => o.type === 'infantry_tank') && stack.some(o => U[o.type] && U[o.type].category === 'infantry')) {
      return { ok: false, why: '堆叠单位不能协同' };
    }
    return { ok: true };
  }

  /* 战线状态：夹击 / 包围
   * 夹击：任意一条对穿线的两端都有敌军
   *   左右：西(q-1,r) / 东(q+1,r)
   *   左上右下：西北(q,r-1) / 东南(q,r+1)
   *   左下右上：西南(q-1,r+1) / 东北(q+1,r-1)
   * 包围：六个相邻方向全部是敌军，是更强的一档，不叠加
   */
  function frontlineStatus(state, unit) {
    if (!unit) return { flanked: false, surrounded: false, atkMod: 0, defMod: 0, enemyCount: 0 };
    if (U[unit.type] && U[unit.type].immuneFlank) return { flanked: false, surrounded: false, atkMod: 0, defMod: 0, enemyCount: 0 };
    const game = G();
    const isFoe = (q, r) => {
      const u = game.unitAt(state, q, r);
      return !!u && u.faction !== unit.faction;
    };
    const at = (dq, dr) => isFoe(unit.q + dq, unit.r + dr);
    let count = 0;
    let surrounded = true;
    for (const n of H.neighbors(unit.q, unit.r)) {
      if (isFoe(n.q, n.r)) count++;
      else surrounded = false;
    }
    const linePairs = [
      [at(-1, 0), at(1, 0)],    // 左右
      [at(0, -1), at(0, 1)],    // 左上 / 右下
      [at(-1, 1), at(1, -1)]    // 左下 / 右上
    ];
    const flanked = linePairs.some(p => p[0] && p[1]);
    if (surrounded) return { flanked: true, surrounded: true, atkMod: -1, defMod: -2, enemyCount: 6 };
    if (flanked) return { flanked: true, surrounded: false, atkMod: 0, defMod: -1, enemyCount: count };
    return { flanked: false, surrounded: false, atkMod: 0, defMod: 0, enemyCount: count };
  }

  /* ---------- 命中判定：攻 + 1D6 - 防，结果 ≥ 0 命中 ---------- */
  function terrainAtkMod(state, q, r) {
    const t = G().tileAt(state, q, r);
    return t ? (T[t.t].atk || 0) : 0;
  }

  // 需要掷出多少点（d6 >= need）才能命中；need <= 1 必中，need > 6 不可能
  function needOf(atkTotal, defTotal) { return defTotal - atkTotal; }
  function chanceFromNeed(need) {
    if (need <= 1) return 1;
    if (need > 6) return 0;
    return (7 - need) / 6;
  }

  function attackRolls(state, attacker) {
    if (!state || !attacker) return 1;
    return (G().forceOf(state, attacker.faction) === 'ironblood' &&
      (attacker.type === 'armored_car' || attacker.type === 'tank')) ? 2 : 1;
  }

  const SNIPER_INFANTRY = ['militia', 'light_inf', 'conscript', 'stormtrooper', 'sniper_team', 'drone_team'];
  function sniperBonus(attacker, defender) {
    return attacker.type === 'sniper_team' && SNIPER_INFANTRY.includes(defender.type) ? 1 : 0;
  }
  function guardBonus(attacker, defender) {
    if (attacker.type !== 'guard') return 0;
    const game = G();
    return (game.isVehicle(defender.type) || game.isNaval(defender.type) || defender.type === 'fort_gun') ? 1 : 0;
  }

  function combatForecast(state, attacker, defender, opts) {
    const game = G();
    const aEff = game.effective(attacker, state);
    const dEff = game.effective(defender, state);
    const aq = opts && opts.fromQ != null ? opts.fromQ : attacker.q;
    const ar = opts && opts.fromR != null ? opts.fromR : attacker.r;

    const atkTerrain = terrainAtkMod(state, aq, ar);
    const defTerrain = game.terrainDefense(state, defender.q, defender.r);
    const dist = H.distance(aq, ar, defender.q, defender.r);
    // 只有贴身进攻才享受侧翼包夹；火炮远射不算
    const flank = dist === 1 ? flankBonus(state, attacker, defender) : 0;
    const support = supportBonus(state, attacker, defender, opts && opts.consumeSupport);
    const atkStatus = frontlineStatus(state, attacker);
    const defStatus = frontlineStatus(state, defender);
    const defWait = defender.waiting ? D.RULES.waitDefense : 0;
    const sniper = sniperBonus(attacker, defender);
    const storm = attacker.type === 'stormtrooper' && (defTerrain > 0 || dEff.trenchDef > 0 || dEff.depthDef > 0) ? 1 : 0;
    const guard = guardBonus(attacker, defender);
    const atkTotal = aEff.atk + atkTerrain + flank + support + atkStatus.atkMod + sniper + storm + guard;
    const defTotal = dEff.def + defTerrain + defStatus.defMod + defWait;
    const need = needOf(atkTotal, defTotal);
    const rolls = attackRolls(state, attacker);
    const pBase = chanceFromNeed(need);
    const geneDef = defender.type === 'gene_warrior';
    const p = geneDef ? pBase * pBase : (rolls > 1 ? 1 - Math.pow(1 - pBase, rolls) : pBase);

    const defFragile = game.isFragile(defender.type);
    const lethal = (defFragile || (defender.hitsTaken || 0) + 1 >= game.maxHits(defender.type)) ? p : 0;

    let counterNeed = null, counterP = 0;
    const defCanReach = dEff.minRange <= 1 && dEff.range >= 1;
    const sunriseSecond = game.forceOf(state, attacker.faction) === 'sunrise' &&
      (attacker.type === 'light_inf' || attacker.type === 'suicide_squad') &&
      (attacker.attacksMade || 0) === 1;
    if (dist === 1 && defCanReach && (sunriseSecond || (defender.counterCount || 0) < game.counterLimit(state, defender.faction))) {
      const dAtk = dEff.atk + terrainAtkMod(state, defender.q, defender.r) + defStatus.atkMod;
      const aDef = aEff.def + game.terrainDefense(state, aq, ar) + atkStatus.defMod +
        (attacker.waiting ? D.RULES.waitDefense : 0);
      counterNeed = needOf(dAtk, aDef);
      counterP = chanceFromNeed(counterNeed);
    }

    return {
      p, need, rolls, counterP, counterNeed, lethal,
      atkTotal, defTotal,
      atkBase: aEff.atk, defBase: dEff.def,
      atkTerrain, defTerrain, flank, support, defWait, sniper, storm, guard,
      atkStatus, defStatus,
      attack: aEff, defense: dEff
    };
  }

  function landingTiles(state, q, r) {
    const game = G();
    const out = [];
    for (const n of H.neighbors(q, r)) {
      const t = game.tileAt(state, n.q, n.r);
      if (!t || t.t === 'water' || t.t === 'river' || !T[t.t].pass) continue;
      if (t.siteId) continue;
      if (game.unitAt(state, n.q, n.r)) continue;
      if (game.fortAt(state, n.q, n.r)) continue;
      out.push(t);
    }
    return out;
  }

  function queueLanding(state, unit) {
    const def = U[unit.type];
    if (!def || !def.landingOnDeath || unit.landingQueued) return;
    const tiles = landingTiles(state, unit.q, unit.r);
    if (!tiles.length) return;
    unit.landingQueued = true;
    const game = G();
    if (state.aiFactions ? state.aiFactions.includes(unit.faction) : unit.faction === state.aiFaction) {
      const t = tiles[0];
      const squad = game.addUnit(state, def.landingOnDeath, unit.faction, t.q, t.r, 'full');
      squad.hasMoved = true;
      squad.hasAttacked = true;
      game.pushLog(state, game.unitName(unit) + ' 沉没前放下 ' + U[def.landingOnDeath].name,
        unit.faction === state.playerFaction ? 'bad' : 'good');
      return;
    }
    if (!state.pendingLandings) state.pendingLandings = [];
    state.pendingLandings.push({
      faction: unit.faction, boatType: unit.type, q: unit.q, r: unit.r,
      options: tiles.map(t => ({ q: t.q, r: t.r, col: t.col, row: t.row }))
    });
  }

  function placeLanding(state, landing, q, r) {
    if (!landing || !landing.options.some(t => t.q === q && t.r === r)) {
      return { ok: false, why: '该地格不能部署' };
    }
    const game = G();
    const type = game.forceOf(state, landing.faction) === 'sunrise' ? 'suicide_squad' : 'suicide_squad';
    const squad = game.addUnit(state, type, landing.faction, q, r, 'full');
    squad.hasMoved = true;
    squad.hasAttacked = true;
    state.pendingLandings = (state.pendingLandings || []).filter(x => x !== landing);
    game.pushLog(state, game.forceData(state, landing.faction).short + ' 突击快船沉没，敢死队从残骸登陆',
      landing.faction === state.playerFaction ? 'good' : 'bad');
    return { ok: true, unit: squad };
  }

  /* 应用一次命中：受损 / 击毁 */  /* 应用一次命中：受损 / 击毁 */
  function applyHit(state, unit) {
    const def = U[unit.type];
    const hits = (unit.hitsTaken || 0) + 1;
    const maxHits = G().maxHits(unit.type);
    const willDie = def.fragile || hits >= maxHits;
    if (willDie && def.landingOnDeath) queueLanding(state, unit);
    if (willDie && unit.type === 'tachanka' && unit.cargo) G().releaseCargoOnDeath(state, unit);
    if (def.fragile) { unit.hitsTaken = hits; return 'destroyed'; }
    unit.hitsTaken = hits;
    if (hits >= maxHits) return 'destroyed';
    unit.state = 'damaged';
    return 'damaged';
  }

  function resolveAttack(state, attacker, defender) {
    const game = G();
    if (state.aiHate && state.aiFactions && state.aiFactions.includes(defender.faction) &&
      attacker.faction !== defender.faction) {
      game.addHate(state, defender.faction, attacker.faction, 1);
    }
    const beforeA = attacker.state;
    const beforeD = defender.state;
    const an = game.unitName(attacker);
    const dn = game.unitName(defender);
    const fc = combatForecast(state, attacker, defender, { consumeSupport: true });
    const geneDef = defender.type === 'gene_warrior';
    const rollValues = [];
    const rollCount = geneDef ? 2 : fc.rolls;
    for (let i = 0; i < rollCount; i++) rollValues.push(1 + Math.floor(game.nextRandom(state) * 6));
    const roll = geneDef ? Math.min.apply(null, rollValues) : Math.max.apply(null, rollValues);
    const hit = roll >= fc.need;
    if (state.aiFactions && state.aiFactions.includes(attacker.faction)) {
      if (!state.aiMisses) state.aiMisses = {};
      const misses = state.aiMisses[attacker.faction] || (state.aiMisses[attacker.faction] = {});
      if (hit) delete misses[defender.id];
      else misses[defender.id] = (misses[defender.id] || 0) + 1;
    }
    let geneDamage = null;
    let defenderAfter = beforeD;
    let defenderDestroyed = false;
    let counterHit = false;
    let attackerDestroyed = false;
    let attackerAfter = beforeA;
    let counterRoll = null, counterNeed = null, counterP = 0;

    if (hit) {
      const res = applyHit(state, defender);
      if (res === 'destroyed') {
        defenderDestroyed = true;
        defenderAfter = null;
        state.stats.kills[attacker.faction] = (state.stats.kills[attacker.faction] || 0) + 1;
      } else {
        defenderAfter = 'damaged';
      }
    }

    if (defenderDestroyed && defender.type === 'gene_warrior') {
      geneDamage = 2 + 1 + Math.floor(game.nextRandom(state) * 6);
      game.pushLog(state, `基因改造战士阵亡：对 ${game.unitName(attacker)} 造成 ${geneDamage} 点附加伤害`, 'bad');
      const gd = applyHit(state, attacker);
      if (gd === 'destroyed') {
        attackerDestroyed = true;
        attackerAfter = null;
        state.stats.kills[defender.faction] = (state.stats.kills[defender.faction] || 0) + 1;
      }
    }

    const dist = H.distance(attacker.q, attacker.r, defender.q, defender.r);
    const defEff = game.effective(defender, state);
    const defCanReach = defEff.minRange <= 1 && defEff.range >= 1;
    const sunriseSecond = game.forceOf(state, attacker.faction) === 'sunrise' &&
      (attacker.type === 'light_inf' || attacker.type === 'suicide_squad') &&
      (attacker.attacksMade || 0) === 1;
    const forcedCounter = sunriseSecond;
    if (!attackerDestroyed && !defenderDestroyed && dist === 1 && defCanReach &&
      (forcedCounter || (defender.counterCount || 0) < game.counterLimit(state, defender.faction))) {
      defender.counterCount = (defender.counterCount || 0) + 1;
      defender.counterUsed = true;
      const dEff = defEff;
      const aEff = game.effective(attacker, state);
      const dAtk = dEff.atk + terrainAtkMod(state, defender.q, defender.r);
      const aDef = aEff.def + game.terrainDefense(state, attacker.q, attacker.r);
      counterNeed = needOf(dAtk, aDef);
      counterP = chanceFromNeed(counterNeed);
      counterRoll = 1 + Math.floor(game.nextRandom(state) * 6);
      if (counterRoll >= counterNeed) {
        counterHit = true;
        const res2 = applyHit(state, attacker);
        if (res2 === 'destroyed') {
          attackerDestroyed = true;
          attackerAfter = null;
          state.stats.kills[defender.faction] = (state.stats.kills[defender.faction] || 0) + 1;
        } else {
          attackerAfter = 'damaged';
        }
      }
    }

    attacker.attacksMade = (attacker.attacksMade || 0) + 1;
    if (!attacker.attackedTargetIds) attacker.attackedTargetIds = [];
    if (!attacker.attackedTargetIds.includes(defender.id)) attacker.attackedTargetIds.push(defender.id);
    attacker.hasMoved = true;
    attacker.hasAttacked = attacker.attacksMade >= game.attackLimit(state, attacker);
    if (!attacker.hasAttacked && attackTargets(state, attacker).length === 0) attacker.hasAttacked = true;
    if (attacker.type === 'fort_gun') attacker.noAttackTurn = state.turn + 1;

    const needText = fc.need <= 1 ? '自动命中' : fc.need > 6 ? '无法命中' : '需 ' + fc.need + '+';
    const rollText = rollValues.length > 1 ? rollValues.join('/') + '（取' + roll + '）' : String(roll);
    let text = `${an} 攻击 ${dn}：掷 ${rollText}（${needText}）→ ${hit ? '命中' : '未命中'}`;
    if (hit) text += defenderDestroyed ? '，将其击毁' : '，敌部受损';
    if (counterNeed != null) {
      const cText = counterNeed <= 1 ? '自动命中' : counterNeed > 6 ? '无法命中' : '需 ' + counterNeed + '+';
      text += `；守方反击掷 ${counterRoll}（${cText}）`;
      if (counterHit) text += attackerDestroyed ? '，命中并击毁己方' : '，命中，己方受损';
      else text += '，未命中';
      if (forcedCounter) text += '（第二次攻击未消灭目标，强制反击）';
    } else if (defenderDestroyed) {
      text += '；守方已被击毁，无法反击';
    }
    game.pushLog(state, text, attacker.faction === state.playerFaction ? 'good' : 'bad');

    if (defenderDestroyed || attackerDestroyed) {
      state.units = state.units.filter(u =>
        !((u === defender && defenderDestroyed) || (u === attacker && attackerDestroyed)));
      if (defenderDestroyed && defender.type === 'tachanka' && defender.cargo) game.releaseCargoOnDeath(state, defender);
      if (attackerDestroyed && attacker.type === 'tachanka' && attacker.cargo) game.releaseCargoOnDeath(state, attacker);
      game.refreshEliminations(state);
    }

    return {
      attackerId: attacker.id, defenderId: defender.id,
      fromQ: attacker.q, fromR: attacker.r, toQ: defender.q, toR: defender.r,
      hit, counterHit, forcedCounter,
      roll, rolls: rollValues, need: fc.need, p: fc.p,
      counterRoll, counterNeed, counterP,
      defenderBefore: beforeD, defenderAfter,
      attackerBefore: beforeA, attackerAfter,
      defenderDestroyed, attackerDestroyed,
      attackerType: attacker.type, defenderType: defender.type, geneDamage,
      attackerFaction: attacker.faction, defenderFaction: defender.faction
    };
  }

  /* ---------- 移动 ---------- */
  function applyFortOnEnter(state, unit) {
    const game = G();
    const fort = game.fortAt(state, unit.q, unit.r);
    if (!fort) return null;
    if (fort.type === 'mine') {
      if (unit.faction === fort.faction) return null;
      const roll = 1 + Math.floor(game.nextRandom(state) * 6);
      const damage = 2 + roll;
      const name = game.unitName(unit);
      let destroyed = false;
      if (applyHit(state, unit) === 'destroyed') {
        destroyed = true;
        state.units = state.units.filter(u => u !== unit);
        state.stats.kills[fort.faction] = (state.stats.kills[fort.faction] || 0) + 1;
      }
      game.removeFort(state, fort);
      game.pushLog(state,
        name + ' 触雷：造成 ' + damage + ' 伤害' + (destroyed ? '，被击毁' : ''),
        fort.faction === state.playerFaction ? 'good' : 'bad');
      return { kind: 'mine', fort, roll, damage, destroyed };
    }
    if (fort.type === 'wire' || fort.type === 'trap') {
      const def = D.FORTS[fort.type];
      const utype = U[unit.type];
      const blocked = fort.type === 'wire' ? !!(utype && utype.category === 'infantry') : !!(utype && utype.category === 'armor');
      if (!blocked) return null;
      unit.noMoveTurn = state.turn + 1;
      unit.noAttackTurn = state.turn;
      game.removeFort(state, fort);
      game.pushLog(state,
        game.unitName(unit) + ' 被' + def.name + '阻挡并停留，下回合无法移动',
        fort.faction === state.playerFaction ? 'good' : 'bad');
      return { kind: 'wire', fort, noMoveTurn: unit.noMoveTurn };
    }
    if (fort.type === 'trench' || fort.type === 'aa') {
      if (unit.faction === fort.faction) return null;
      game.removeFort(state, fort);
      game.pushLog(state,
        D.FORTS[fort.type].name + ' 被敌军占领，已摧毁',
        fort.faction === state.playerFaction ? 'bad' : 'good');
      return { kind: 'removed', fort };
    }
    return null;
  }

  function depthCaptureDamage(state, site, unit, prevOwner) {
    if (!prevOwner || !G().hasStrategy(state, prevOwner, 'defense', 'defense_in_depth')) return null;
    const game = G();
    const roll = 1 + Math.floor(game.nextRandom(state) * 6);
    const name = game.unitName(unit);
    const res = applyHit(state, unit);
    let destroyed = false;
    if (res === 'destroyed') {
      destroyed = true;
      state.units = state.units.filter(x => x !== unit);
      state.stats.kills[prevOwner] = (state.stats.kills[prevOwner] || 0) + 1;
    }
    game.pushLog(state,
      '纵深防御：' + name + ' 占领据点时受到 ' + roll + ' 伤害' + (destroyed ? '，被击毁' : ''),
      prevOwner === state.playerFaction ? 'good' : 'bad');
    return { roll, damage: roll, destroyed };
  }

  function moveUnit(state, unit, q, r, reach) {
    const game = G();
    if (unit.jammed) return { ok: false, why: '被无人机干扰，本回合无法行动' };
    if (U[unit.type] && U[unit.type].immobile) return { ok: false, why: '该单位无法移动' };
    if (unit.noMoveTurn === state.turn) return { ok: false, why: '该单位本回合无法移动' };
    if (unit.hasMoved) return { ok: false, why: '该部队本回合已移动' };
    if (unit.q === q && unit.r === r) return { ok: false, why: '原地不动' };
    if (tauntEnemies(state, unit).length) {
      const destSite = game.siteAt(state, q, r);
      if (destSite && destSite.faction !== unit.faction) {
        return { ok: false, why: '必须先消灭实验型机甲' };
      }
    }
    const node = reach && reach.get(key(q, r));
    if (!node) return { ok: false, why: '无法抵达' };
    if (node.blocked) return { ok: false, why: '目标格已被占据' };
    if (!game.canOccupy(state, unit, q, r)) return { ok: false, why: '目标格已被占据' };

    const from = { q: unit.q, r: unit.r };
    const crossedWater = waterDomain(state, unit, from.q, from.r) !== waterDomain(state, unit, q, r);
    unit.q = q; unit.r = r;
    unit.hasMoved = true;
    if (crossedWater) {
      unit.crossedWater = true;
      game.pushLog(state, `${game.unitName(unit)} ${waterDomain(state, unit, q, r) ? '进入水域' : '登陆'}，本回合停止移动（仍可攻击）`,
        unit.faction === state.playerFaction ? 'info' : 'info');
    }

    const fortRes = applyFortOnEnter(state, unit);
    if (fortRes && fortRes.destroyed) {
      return { ok: true, from, captured: null, fort: fortRes, destroyed: true };
    }

    const site = game.siteAt(state, q, r);
    if (site && site.faction !== unit.faction) {
      const prevOwner = site.faction;
      const victory = game.captureSite(state, site, unit.faction);
      unit.hasAttacked = true;
      const depth = depthCaptureDamage(state, site, unit, prevOwner);
      if (depth && depth.destroyed) {
        return { ok: true, from, captured: site, victory, fort: fortRes, depth, destroyed: true };
      }
      return { ok: true, from, captured: site, victory, fort: fortRes, depth };
    }
    let exhausted = false;
    if (!unit.hasAttacked && attackTargets(state, unit).length === 0) {
      unit.hasAttacked = true;
      exhausted = true;
    }
    return { ok: true, from, captured: null, fort: fortRes, exhausted, crossedWater };
  }

  function canAct(state, unit) {
    return !!unit && !unit.jammed && (!unit.hasAttacked || !unit.hasMoved);
  }

  /* ---------- 待命 ---------- */
  function waitUnit(state, unit) {
    if (!unit) return { ok: false, why: '没有单位' };
    if (unit.jammed) return { ok: false, why: '被无人机干扰，本回合无法行动' };
    const wt = G().tileAt(state, unit.q, unit.r);
    if (wt && !wt.bridge && (wt.t === 'water' || wt.t === 'river')) return { ok: false, why: '水域中不能待命' };
    if (unit.hasMoved || unit.hasAttacked) return { ok: false, why: '移动/攻击后不能再待命' };
    if (tauntEnemies(state, unit).length) return { ok: false, why: '必须先消灭实验型机甲' };
    unit.hasMoved = true;
    unit.hasAttacked = true;
    unit.waiting = true;
    G().pushLog(state, `${G().unitName(unit)} 待命（防御 +${D.RULES.waitDefense}，不可叠加）`,
      unit.faction === state.playerFaction ? 'good' : 'bad');
    return { ok: true };
  }

  /* ---------- 易位 ---------- */
  // 只按地形计算行军成本，忽略所有单位占位
  function travelCost(state, unit, tq, tr) {
    const game = G();
    const startK = key(unit.q, unit.r), goalK = key(tq, tr);
    const startWater = waterDomain(state, unit, unit.q, unit.r);
    if (startK === goalK) return 0;
    const dist = new Map([[startK, 0]]);
    const open = [{ q: unit.q, r: unit.r, c: 0 }];
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i].c < open[bi].c) bi = i;
      const cur = open.splice(bi, 1)[0];
      if (cur.c > dist.get(key(cur.q, cur.r))) continue;
      for (const n of H.neighbors(cur.q, cur.r)) {
        const cost = game.moveCost(state, n.q, n.r, unit);
        if (!isFinite(cost)) continue;
        const nc = cur.c + cost;
        const k = key(n.q, n.r);
        if (!dist.has(k) || nc < dist.get(k)) {
          dist.set(k, nc);
          open.push({ q: n.q, r: n.r, c: nc });
        }
      }
    }
    const v = dist.get(goalK);
    return v == null ? Infinity : v;
  }

  function canSwap(state, a, b) {
    if (!a || !b || a === b || a.faction !== b.faction) return false;
    if (a.jammed || b.jammed) return false;
    if ((a.noMoveTurn === state.turn) || (b.noMoveTurn === state.turn)) return false;
    if (U[a.type].immobile || U[b.type].immobile) return false;
    const ga = G();
    if (ga.unitsAt(state, a.q, a.r).length > 1 || ga.unitsAt(state, b.q, b.r).length > 1) return false;
    if (a.hasMoved || a.hasAttacked || a.supporting || a.swapped) return false;
    if (tauntEnemies(state, a).length || tauntEnemies(state, b).length) return false;
    if (b.hasMoved || b.hasAttacked || b.supporting || b.swapped) return false;
    const game = G();
    const ca = travelCost(state, a, b.q, b.r);
    const cb = travelCost(state, b, a.q, a.r);
    return ca <= game.effective(a, state).move && cb <= game.effective(b, state).move;
  }

  function swapPartners(state, unit) {
    if (!unit || unit.hasMoved || unit.hasAttacked || unit.supporting) return [];
    return state.units.filter(u => u.faction === unit.faction && u.id !== unit.id && canSwap(state, unit, u));
  }

  function swapUnits(state, a, b) {
    if (!canSwap(state, a, b)) return { ok: false, why: '双方移动力不足以到达对方位置' };
    const aq = a.q, ar = a.r;
    a.q = b.q; a.r = b.r;
    b.q = aq; b.r = ar;
    a.hasMoved = true; b.hasMoved = true;
    a.swapped = true; b.swapped = true;
    G().pushLog(state, `${G().unitName(a)} 与 ${G().unitName(b)} 易位`, a.faction === state.playerFaction ? 'info' : 'info');
    return { ok: true, a, b };
  }

  /* ---------- 协同攻击 ---------- */
  function supportUnit(state, unit, target) {
    const game = G();
    if (!unit) return { ok: false, why: '没有单位' };
    if (unit.jammed) return { ok: false, why: '被无人机干扰，本回合无法行动' };
    if (U[unit.type].immobile) return { ok: false, why: '固定炮台无法协同' };
    if (unit.hasAttacked || unit.supporting || (unit.attacksMade || 0) > 0) return { ok: false, why: '该单位本回合已行动' };
    if (tauntEnemies(state, unit).length) return { ok: false, why: '必须先消灭实验型机甲' };
    if (unit.swapped) return { ok: false, why: '易位后只能攻击' };
    if (stackedWithTank(state, unit) || unit.type === 'infantry_tank' && state.units.some(o => o.q === unit.q && o.r === unit.r && o.id !== unit.id && U[o.type].category === 'infantry')) return { ok: false, why: '堆叠单位不能互相协同' };
    const supDam = supportRestriction(state, unit);
    if (!supDam.ok) return supDam;
    if (!target || target.faction === unit.faction) return { ok: false, why: '请选择敌方单位' };
    if (!attackTargets(state, unit).includes(target)) return { ok: false, why: '目标不在协同范围内' };
    unit.supporting = true;
    unit.supportTargetId = target.id;
    unit.hasMoved = true;
    unit.hasAttacked = true;
    game.pushLog(state, `${game.unitName(unit)} 协同 ${game.unitName(target)}：友军攻击该目标时 +${D.RULES.supportBonus} 攻击`,
      unit.faction === state.playerFaction ? 'good' : 'bad');
    return { ok: true, target };
  }

  /* ---------- 可建造工事 ---------- */
  const FORT_LIMIT = 1;
  function isFortBuilder(state, unit) {
    if (!unit) return false;
    const def = U[unit.type];
    return !!def && def.category === 'infantry' && !['drone_team', 'sniper_team'].includes(unit.type);
  }

  function fortPlacementTiles(state, unit, typeId) {
    const def = D.FORTS[typeId];
    const out = [];
    if (!def || !unit) return out;
    const game = G();
    const cand = [];
    if (def.placement === 'self') {
      const t = game.tileAt(state, unit.q, unit.r);
      if (t) cand.push(t);
    }
    for (const n of H.neighbors(unit.q, unit.r)) {
      const t = game.tileAt(state, n.q, n.r);
      if (t) cand.push(t);
    }
    for (const t of cand) {
      if (t.t === 'water' || t.t === 'river' || !T[t.t].pass) continue;
      if (t.siteId) continue;
      if (game.fortAt(state, t.q, t.r)) continue;
      const occ = game.unitsAt(state, t.q, t.r);
      if (typeId === 'wire' || typeId === 'trap' || typeId === 'fort_gun') {
        if (occ.length) continue;
      } else if (occ.some(u => u.faction !== unit.faction)) {
        continue;
      }
      out.push(t);
    }
    return out;
  }

  function canBuildFort(state, unit, typeId) {
    const def = D.FORTS[typeId];
    if (!def) return { ok: false, why: '未知工事' };
    if (!state || state.over) return { ok: false, why: '战役已结束' };
    if (!unit || !isFortBuilder(state, unit)) return { ok: false, why: '该单位不能构筑工事' };
    if (unit.faction !== state.current) return { ok: false, why: '只能在己方回合构筑' };
    if (unit.jammed) return { ok: false, why: '被无人机干扰，本回合无法行动' };
    if (unit.hasMoved || unit.hasAttacked || unit.supporting || unit.swapped) {
      return { ok: false, why: '该单位本回合已行动' };
    }
    if (tauntEnemies(state, unit).length) return { ok: false, why: '必须先消灭实验型机甲' };
    if (typeId === 'fort_gun' && (state.fortGunBuilt || 0) >= 1) return { ok: false, why: '要塞炮每回合最多建造 1 个' };
    const cost = G().fortCost(state, unit.faction, typeId);
    if (state.money[unit.faction] < cost) return { ok: false, why: '金钱不足（需 ' + cost + '）' };
    const tiles = fortPlacementTiles(state, unit, typeId);
    if (!tiles.length) return { ok: false, why: '附近没有可修建的地格' };
    return { ok: true, def, tiles };
  }

  function buildFort(state, unit, typeId, q, r) {
    const st = canBuildFort(state, unit, typeId);
    if (!st.ok) return st;
    if (!st.tiles.some(t => t.q === q && t.r === r)) return { ok: false, why: '该地格不能修建此工事' };
    const game = G();
    const def = st.def;
    const cost = G().fortCost(state, unit.faction, typeId);
    state.money[unit.faction] -= cost;
    state.fortsBuilt += 1;
    if (typeId === 'fort_gun') state.fortGunBuilt = (state.fortGunBuilt || 0) + 1;
    unit.hasMoved = true;
    unit.hasAttacked = true;
    let fort = null, gun = null;
    if (typeId === 'fort_gun') {
      gun = game.addUnit(state, 'fort_gun', unit.faction, q, r, 'full');
      gun.hasMoved = true;
      gun.hasAttacked = true;
    } else {
      fort = game.addFort(state, typeId, unit.faction, q, r);
    }
    game.pushLog(state,
      game.unitName(unit) + ' 构筑了 ' + def.name + '（花费 ' + cost + ' 金）',
      unit.faction === state.playerFaction ? 'good' : 'bad');
    return { ok: true, type: typeId, fort, gun, cost };
  }

  /* ---------- 机场任务 ---------- */
  const AIRPORT_MISSIONS = {
    jam: { id: 'jam', name: '无人机干扰', cost: 4, minRange: 0, maxRange: 4,
      desc: '使范围内一名非我方单位下回合无法行动' },
    drop: { id: 'drop', name: '空降作战', cost: 6, minRange: 0, maxRange: 6,
      desc: '在范围内投放一名轻步兵，占用 2 人力' },
    supply: { id: 'supply', name: '空投补给', cost: 6, minRange: 0, maxRange: 8,
      desc: '恢复范围内一名我方受损单位 1 格受损条' },
    bomb: { id: 'bomb', name: '无人机空袭', cost: 8, minRange: 0, maxRange: 8, damageBase: 4,
      desc: '对范围内一名非我方单位造成 4+1D6 伤害' },
    tactical_bomb: { id: 'tactical_bomb', name: '战术轰炸', cost: 14, minRange: 3, maxRange: 10, damageBase: 6,
      desc: '对范围内一名非我方单位造成 6+1D6 伤害' },
    nuke: { id: 'nuke', name: '战术核打击', cost: 20, minRange: 5, maxRange: 12,
      force: 'newworld', cooldown: 6,
      desc: '摧毁目标格敌军与工事；对目标周围6格所有单位造成1D6伤害；无视防空；6回合冷却' }
  };

  function aaProtected(state, airportFaction, q, r) {
    return state.forts.some(f => f.type === 'aa' && f.faction !== airportFaction &&
      H.distance(f.q, f.r, q, r) <= 2);
  }

  function airportTargets(state, site, id) {
    const m = AIRPORT_MISSIONS[id];
    const out = { units: [], tiles: [], keys: new Set() };
    if (!m || !state || !site || site.kind !== 'airport') return out;
    const game = G();
    const maxRange = m.maxRange + game.airportRangeBonus(state, site.faction);
    for (const t of Object.values(state.grid)) {
      const d = H.distance(site.q, site.r, t.q, t.r);
      if (d < m.minRange || d > maxRange) continue;
      if (id !== 'nuke' && id !== 'supply' && aaProtected(state, site.faction, t.q, t.r)) continue;
      if (id === 'nuke') {
        const u = game.unitAt(state, t.q, t.r);
        const fort = game.fortAt(state, t.q, t.r);
        if ((u && u.faction !== site.faction) || (fort && fort.faction !== site.faction)) {
          out.tiles.push(t);
          out.keys.add(key(t.q, t.r));
          if (u) out.units.push(u);
        }
        continue;
      }
      if (id === 'supply') {
        const u = game.unitAt(state, t.q, t.r);
        if (!u || u.faction !== site.faction) continue;
        if (u.state !== 'damaged' && !(u.hitsTaken > 0)) continue;
        out.units.push(u);
        out.keys.add(key(u.q, u.r));
        continue;
      }
      if (id === 'drop') {
        if (t.t === 'water' || t.t === 'river') continue;
        if (!T[t.t].pass) continue;
        if (game.fortAt(state, t.q, t.r)) continue;
        if (game.unitAt(state, t.q, t.r)) continue;
        out.tiles.push(t);
        out.keys.add(key(t.q, t.r));
      } else {
        const u = game.unitAt(state, t.q, t.r);
        if (!u || u.faction === site.faction) continue;
        out.units.push(u);
        out.keys.add(key(u.q, u.r));
      }
    }
    return out;
  }

  function airportStatus(state, site, id) {
    const m = AIRPORT_MISSIONS[id];
    if (!m) return { ok: false, why: '未知任务' };
    if (!state || !site || site.kind !== 'airport') return { ok: false, why: '不是机场' };
    if (state.over) return { ok: false, why: '战役已结束' };
    if (!site.faction) return { ok: false, why: '机场未归属任何阵营' };
    if (site.faction !== state.current) return { ok: false, why: '只能在机场所属阵营的回合使用' };
    const used = site.airportUsedTurn === state.turn ? (site.airportUsedCount || 0) : 0;
    if (used >= G().airportMaxUses(state, site.faction)) {
      return { ok: false, why: '本机场本回合已执行任务' };
    }
    if (m.force && G().forceOf(state, site.faction) !== m.force) {
      return { ok: false, why: '该机场任务属于其他势力' };
    }
    if (m.cooldown && (site.nukeReadyTurn || 0) > state.turn) {
      return { ok: false, why: '战术核打击冷却中（' + (site.nukeReadyTurn - state.turn) + ' 回合）' };
    }
    if (state.money[site.faction] < m.cost) {
      return { ok: false, why: '金钱不足（需 ' + m.cost + '）' };
    }
    const targets = airportTargets(state, site, id);
    if (id === 'drop') {
      if (site.airportDropUsedTurn === state.turn) {
        return { ok: false, why: '本机场本回合已执行过空降' };
      }
      const free = G().freeCapacity(state, site);
      if (free.pop < U.light_inf.cost.pop) {
        return { ok: false, why: '人力上限不足（需 ' + U.light_inf.cost.pop + '）' };
      }
    }
    if (!targets.keys.size) {
      return { ok: false, why: id === 'drop' ? '范围内没有可投放的空地' : id === 'supply' ? '范围内没有我方受损单位' : '范围内没有可打击单位' };
    }
    const eff = Object.assign({}, m, { maxRange: m.maxRange + G().airportRangeBonus(state, site.faction) });
    return { ok: true, mission: eff, targets };
  }

  function useAirportMission(state, site, id, q, r) {
    const st = airportStatus(state, site, id);
    if (!st.ok) return st;
    const k = key(q, r);
    if (!st.targets.keys.has(k)) return { ok: false, why: '目标不在任务范围内' };
    const m = st.mission;
    const owner = site.faction;
    const game = G();
    const target = game.unitAt(state, q, r);
    if (site.airportUsedTurn !== state.turn) {
      site.airportUsedTurn = state.turn;
      site.airportUsedCount = 0;
    }
    site.airportUsedCount = (site.airportUsedCount || 0) + 1;
    if (id === 'drop') site.airportDropUsedTurn = state.turn;

    if (id === 'supply') {
      if (!target || target.faction !== owner) return { ok: false, why: '目标无效' };
      if (target.state !== 'damaged' && !(target.hitsTaken > 0)) return { ok: false, why: '目标未受损' };
      state.money[owner] -= m.cost;
      const hits = Math.max(0, (target.hitsTaken || 1) - 1);
      target.hitsTaken = hits;
      target.state = hits > 0 ? 'damaged' : 'full';
      game.pushLog(state, `${game.forceData(state, owner).short}·${site.name} 空投补给：${game.unitName(target)} 恢复1格受损条`,
        owner === state.playerFaction ? 'good' : 'bad');
      return { ok: true, kind: 'supply', target, cost: m.cost };
    }

    if (id === 'nuke') {
      const targetUnit = game.unitAt(state, q, r);
      const targetFort = game.fortAt(state, q, r);
      if (!targetUnit && !targetFort) return { ok: false, why: '目标无效' };
      state.money[owner] -= m.cost;
      site.nukeReadyTurn = state.turn + 6;
      if (targetFort) game.removeFort(state, targetFort);
      const doomed = [];
      for (const u of state.units) {
        if (u.faction !== owner && u.q === q && u.r === r) doomed.push(u);
      }
      for (const u of doomed) state.units = state.units.filter(x => x !== u);
      const splash = [];
      for (const u of state.units) {
        if (H.distance(u.q, u.r, q, r) <= 6) splash.push(u);
      }
      let killed = doomed.length + (targetFort ? 1 : 0);
      let hurt = 0;
      for (const u of splash) {
        const roll = 1 + Math.floor(game.nextRandom(state) * 6);
        const res = applyHit(state, u);
        if (res === 'destroyed') {
          state.units = state.units.filter(x => x !== u);
          killed++;
          if (u.faction !== owner) state.stats.kills[owner] = (state.stats.kills[owner] || 0) + 1;
        } else hurt++;
        game.pushLog(state, `战术核打击余波：${game.unitName(u)} 受到 ${roll} 伤害`,
          u.faction === state.playerFaction ? 'bad' : 'good');
      }
      const nukeTile = game.tileAt(state, q, r);
      game.pushLog(state,
        `${game.forceData(state, owner).short} 在 (${nukeTile.col},${nukeTile.row}) 实施战术核打击，击毁 ${killed} 个目标`,
        owner === state.playerFaction ? 'good' : 'bad');
      return { ok: true, kind: 'nuke', q, r, killed, hurt, cost: m.cost };
    }

    if (id === 'jam') {
      if (!target || target.faction === owner) return { ok: false, why: '目标无效' };
      const nextTurn = state.current === 'alliance' ? state.turn : state.turn + 1;
      target.jamTurn = nextTurn;
      target.jammed = false;
      state.money[owner] -= m.cost;
      game.pushLog(state,
        game.forceData(state, owner).short + '·' + site.name + ' 无人机干扰 ' + game.unitName(target) + '：该单位下回合无法行动',
        owner === state.playerFaction ? 'good' : 'bad');
      return { ok: true, kind: 'jam', target, nextTurn, cost: m.cost };
    }

    if (id === 'bomb' || id === 'tactical_bomb') {
      if (!target || target.faction === owner) return { ok: false, why: '目标无效' };
      const roll = 1 + Math.floor(game.nextRandom(state) * 6);
      const damage = (m.damageBase || 6) + roll;
      let destroyed = false;
      if (state.units.includes(target) && applyHit(state, target) === 'destroyed') destroyed = true;
      if (destroyed) {
        state.units = state.units.filter(u => u !== target);
        state.stats.kills[owner] = (state.stats.kills[owner] || 0) + 1;
      }
      state.money[owner] -= m.cost;
      game.pushLog(state,
        game.forceData(state, owner).short + '·' + site.name + ' ' + m.name + '：掷 ' + roll + '，造成 ' + damage + ' 伤害，' +
        (destroyed ? '击毁 ' + game.unitName(target) : '命中 ' + game.unitName(target)),
        owner === state.playerFaction ? 'good' : 'bad');
      return { ok: true, kind: 'bomb', missionName: m.name, target, roll, damage, destroyed, q, r, cost: m.cost };
    }

    if (id === 'drop') {
      const tile = game.tileAt(state, q, r);
      if (!tile) return { ok: false, why: '目标格不存在' };
      const siteThere = game.siteAt(state, q, r);
      const u = game.addUnit(state, 'light_inf', owner, q, r, 'full');
      u.hasMoved = true;
      u.hasAttacked = true;
      let captured = null;
      let depth = null;
      if (siteThere && siteThere.faction !== owner) {
        const prevOwner = siteThere.faction;
        game.captureSite(state, siteThere, owner);
        captured = siteThere;
        depth = depthCaptureDamage(state, siteThere, u, prevOwner);
        if (depth && depth.destroyed) {
          state.units = state.units.filter(x => x !== u);
        }
      }
      state.money[owner] -= m.cost;
      game.pushLog(state,
        game.forceData(state, owner).short + '·' + site.name + ' 空降作战：轻步兵降落于 (' + tile.col + ',' + tile.row + ')' +
        (captured ? '，占领 ' + captured.name : ''),
        owner === state.playerFaction ? 'good' : 'bad');
      return { ok: true, kind: 'drop', unit: u, captured, depth, unitDestroyed: !!(depth && depth.destroyed), q, r, cost: m.cost };
    }

    return { ok: false, why: '未知任务' };
  }

  /* ---------- AI / 提示用的攻击评分 ---------- */
  function attackScore(state, attacker, defender, opts) {
    const game = G();
    const fc = combatForecast(state, attacker, defender, opts);
    let score = fc.p * 55 + fc.lethal * 45 - fc.counterP * 35;
    if (defender.type === 'field_gun' || defender.type === 'infantry_gun' || defender.type === 'gunboat') score += 12;
    if (defender.type === 'tank') score += 6;
    const tSite = game.siteAt(state, defender.q, defender.r);
    if (tSite && tSite.faction === attacker.faction) score += 15;
    return {
      score,
      p: fc.p,
      counterP: fc.counterP,
      lethal: fc.lethal,
      forecast: fc
    };
  }

  SG.rules = {
    reachable, pathTo, findPath, attackTargets, flankBonus, supportBonus,
    terrainAtkMod, needOf, chanceFromNeed, combatForecast, applyHit,
    resolveAttack, moveUnit, canAct,
    travelCost, canSwap, swapPartners, swapUnits, supportUnit, supportRestriction, stackedWithTank, waitUnit,
    frontlineStatus, attackScore,
    AIRPORT_MISSIONS, airportTargets, airportStatus, useAirportMission, tauntEnemies,
    FORT_LIMIT, isFortBuilder, fortPlacementTiles, canBuildFort, buildFort, aaProtected, landingTiles, placeLanding
  };
})(typeof window !== 'undefined' ? window : globalThis);
