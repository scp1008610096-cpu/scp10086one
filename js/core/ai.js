/* ============================================================
 * 钢铁洪流 · 电脑对手（兵棋推演版）
 * 守军分配 → 生产 → 集结 → 推进；受人力/工业上限约束
 * ============================================================ */
(function (root) {
  'use strict';
  const SG = (root.SG = root.SG || {});
  const D = SG.data, H = SG.hex, U = D.UNITS;

  const PRIORITY = { rocket_artillery: 0, spg: 0, superheavy_tank: 0, heavy_tank: 1, field_gun: 1, tank: 2, missile_ship: 2, assault_boat: 2, infantry_gun: 3, mech_inf: 4, armored_car: 5, stormtrooper: 6, sniper_team: 6, suicide_squad: 6, conscript: 7, drone_team: 6, light_inf: 7, militia: 8, gunboat: 9, battle_barge: 10 };

  function createAI(state, faction) {
    const game = SG.game, rules = SG.rules;
    const diff = state.difficulty || 0;
    const foeFactions = () => (state.factions || ['alliance', 'empire']).filter(f => f !== faction);

    const self = {
      faction, force: game.forceOf(state, faction), phase: 'build', builds: [], buildIndex: 0,
      queue: [], index: 0, done: false,
      roles: new Map(), pushing: false,
      maxBuilds: diff === 0 ? 1 : diff === 1 ? 2 : 3,
      attackThreshold: diff === 0 ? 32 : diff === 1 ? 20 : 11,
      pushNeed: diff === 0 ? 6 : diff === 1 ? 4 : 3
    };

    function ownSites() { return state.sites.filter(s => s.faction === faction); }
    function enemySites() { return state.sites.filter(s => s.faction && s.faction !== faction && s.faction !== 'neutral'); }
    function myUnits() { return game.unitsOf(state, faction); }
    function foeUnits() { return state.units.filter(u => u.faction !== faction && u.faction !== 'neutral' && foeFactions().includes(u.faction)); }

    function nearestFoeDist(q, r) {
      let d = 99;
      for (const u of foeUnits()) d = Math.min(d, H.distance(q, r, u.q, u.r));
      return d;
    }
    function nearestEnemySite(q, r) {
      let best = null, bd = 1e9;
      for (const s of enemySites()) {
        const d = H.distance(q, r, s.q, s.r);
        if (d < bd) { bd = d; best = s; }
      }
      return best;
    }
    function frontDistance(q, r) {
      let best = 99;
      for (const s of enemySites()) best = Math.min(best, H.distance(q, r, s.q, s.r));
      return best;
    }

    function hateMap() {
      const raw = state.aiHate && state.aiHate[faction];
      if (!raw) return {};
      if (typeof raw === 'string') return { [raw]: 1 };
      return raw;
    }

    function hateEntries() {
      return Object.entries(hateMap())
        .filter(([f]) => state.factions.includes(f))
        .sort((a, b) => b[1] - a[1]);
    }

    const hatedFaction = () => (hateEntries()[0] || [null])[0];
    const hateScore = f => Number(hateMap()[f] || 0);
    const ownCapital = () => ownSites().find(s => s.capital) || ownSites()[0] || null;
    const SITE_VALUE = { industrial_base: 1000, city: 800, factory: 700, port: 600, airport: 400, village: 500 };

    function siteOrderValue(site) {
      if (!site) return 0;
      if (site.capital && site.faction && site.faction !== faction) return 900;
      return SITE_VALUE[site.kind] || 0;
    }

    function nearbySiteFor(unit) {
      let best = null, bestValue = -1, bestDist = 999;
      for (const site of state.sites) {
        if (site.faction === faction) continue;
        const d = H.distance(unit.q, unit.r, site.q, site.r);
        if (d > 8) continue;
        const v = siteOrderValue(site);
        if (v > bestValue || (v === bestValue && d < bestDist)) {
          best = site; bestValue = v; bestDist = d;
        }
      }
      return best;
    }

    function factionStrength(f) {
      if (!state.factions.includes(f)) return 0;
      const inc = game.incomeOf(state, f);
      let value = Math.max(0, inc.grossMoney || 0);
      for (const u of game.unitsOf(state, f)) {
        value += game.costOf(state, u.type, f).money * (u.state === 'damaged' ? 0.55 : 1);
      }
      return value;
    }

    function chooseStrategicTarget() {
      const enemies = state.factions.filter(f => f !== faction && f !== 'neutral');
      if (!enemies.length) return null;
      const cap = ownCapital();
      const strength = {};
      for (const f of state.factions) strength[f] = factionStrength(f);
      const total = state.factions.reduce((n, f) => n + strength[f], 0);
      // 一方实力接近其他所有阵营总和时，优先联合针对它。
      let dominant = null, dominantRatio = 0;
      for (const f of enemies) {
        const others = Math.max(1, total - strength[f]);
        const ratio = strength[f] / others;
        if (ratio >= 0.8 && ratio > dominantRatio) { dominant = f; dominantRatio = ratio; }
      }
      if (dominant) return dominant;

      let best = null, bestScore = -1e9;
      for (const f of enemies) {
        const sites = state.sites.filter(s => s.faction === f);
        const dist = cap && sites.length
          ? Math.min(...sites.map(s => H.distance(cap.q, cap.r, s.q, s.r)))
          : 99;
        const score = 90 / (strength[f] + 1) + 55 / (dist + 1) + hateScore(f) * 25;
        if (score > bestScore) { bestScore = score; best = f; }
      }
      return best;
    }

    function strategicTarget() {
      if (!self.strategicFaction || !state.factions.includes(self.strategicFaction)) {
        self.strategicFaction = chooseStrategicTarget();
      }
      return self.strategicFaction;
    }

    function sitePriority(site) {
      let score = 0;
      const cap = ownCapital();
      const d = cap ? H.distance(cap.q, cap.r, site.q, site.r) : 99;
      const hs = hateScore(site.faction);
      if (hs) score += Math.min(1200, hs * 35);
      if (site.faction === strategicTarget()) score += 420;
      if (d <= 5) score += 620;
      else if (d <= 10) score += (SITE_VALUE[site.kind] || 0) * 8;
      else score -= 80;
      return score;
    }

    function prioritySiteFor(unit) {
      let best = null, bestScore = -1e9;
      for (const site of state.sites) {
        if (site.faction === faction) continue;
        const score = sitePriority(site) - (unit ? H.distance(unit.q, unit.r, site.q, site.r) * 0.8 : 0);
        if (score > bestScore) { bestScore = score; best = site; }
      }
      return best;
    }

    /* ---------------- 生产 ---------------- */
    function planBuilds() {
      const counts = {};
      for (const u of myUnits()) counts[u.type] = (counts[u.type] || 0) + 1;
      const caps = game.capsOf(state, faction);
      const used = game.usageOf(state, faction);
      let money = state.money[faction];
      let freePop = caps.pop - used.pop;
      let freeInd = caps.industry - used.industry;
      const force = self.force;
      const specialTypes = D.SPECIAL_BY_FORCE[force] || [];
      let specialCount = myUnits().filter(u => specialTypes.includes(u.type)).length;
      const cheapSpecialTypes = specialTypes.filter(t => {
        const c = game.costOf(state, t, faction);
        return c.money <= 10;
      });
      const armorTypes = ['mech_inf', 'armored_car', 'tank', 'heavy_tank', 'superheavy_tank'];
      const artyTypes = ['infantry_gun', 'field_gun', 'rocket_artillery', 'siege_howitzer'];
      const infTypes = ['militia', 'light_inf', 'conscript', 'stormtrooper', 'sniper_team', 'guard', 'suicide_squad', 'infantry_column'];
      let armorInd = 0, artyInd = 0, infCount = 0, artyCount = 0, navalInd = 0, lightCount = 0, landCount = 0, armorCount = 0;
      for (const u of myUnits()) {
        const c = game.costOf(state, u.type, faction);
        if (armorTypes.includes(u.type)) armorInd += c.industry;
        if (artyTypes.includes(u.type)) { artyInd += c.industry; artyCount++; }
        if (infTypes.includes(u.type)) infCount++;
        if (U[u.type] && U[u.type].naval) navalInd += c.industry;
        if (!(U[u.type] && U[u.type].naval)) landCount++;
        if (u.type === 'armored_car' || u.type === 'tank' || u.type === 'heavy_tank' || u.type === 'superheavy_tank') armorCount++;
        if (u.type === 'light_inf' || u.type === 'suicide_squad') lightCount++;
      }
      const armorTarget = caps.industry * (force === 'ironblood' ? 0.6 : 0.4);
      const artyTarget = caps.industry * 0.4;

      const ironNeedArmor = force === 'ironblood' &&
        (armorInd < caps.industry * 0.6 || armorCount < landCount * 0.4);
      const sites = ownSites().sort((a, b) => {
        if (ironNeedArmor) {
          const ka = a.kind === 'industrial_base' ? 0 : 1;
          const kb = b.kind === 'industrial_base' ? 0 : 1;
          if (ka !== kb) return ka - kb;
        }
        return frontDistance(a.q, a.r) - frontDistance(b.q, b.r);
      });
      const plans = [];

      for (const site of sites) {
        if (plans.length >= self.maxBuilds) break;
        let want;
        if (force === 'ironblood') {
          const needArmorRatio = armorCount < landCount * 0.4;
          want = (armorInd < armorTarget || needArmorRatio)
            ? ['heavy_tank', 'tank', 'armored_car', 'mech_inf', 'stormtrooper']
            : ['light_inf', 'infantry_gun', 'tank', 'stormtrooper'];
        } else if (force === 'revolution') {
          if (artyInd < artyTarget || artyCount === 0) {
            want = ['rocket_artillery', 'field_gun', 'infantry_gun', 'conscript'];
          } else if (infCount < artyCount * 4) {
            want = ['conscript', 'light_inf', 'stormtrooper'];
          } else if (armorInd < armorTarget) {
            want = ['tank', 'armored_car', 'mech_inf', 'light_inf'];
          } else {
            want = ['field_gun', 'conscript', 'tank', 'light_inf'];
          }
        } else if (force === 'northsea') {
          if (navalInd < caps.industry * 0.3) {
            want = ['missile_ship', 'gunboat', 'battle_barge', 'sniper_team'];
          } else {
            want = ['tank', 'field_gun', 'light_inf', 'sniper_team', 'missile_ship'];
          }
        } else if (force === 'iris') {
          if (artyInd < caps.industry * 0.25) {
            want = ['siege_howitzer', 'field_gun', 'infantry_gun', 'light_inf'];
          } else if (infCount < 5) {
            want = ['guard', 'light_inf', 'mech_inf'];
          } else {
            want = ['tank', 'field_gun', 'light_inf', 'guard'];
          }
        } else if (force === 'sunrise') {
          if (navalInd < caps.industry * 0.4) {
            want = ['assault_boat', 'gunboat', 'battle_barge', 'light_inf'];
          } else if (lightCount < Math.max(1, landCount * 0.7)) {
            want = ['light_inf', 'suicide_squad', 'infantry_gun'];
          } else {
            want = ['light_inf', 'suicide_squad', 'infantry_gun', 'armored_car'];
          }
        } else if (force === 'eastland') {
          if (artyInd < caps.industry * 0.5) {
            want = ['field_gun', 'infantry_gun', 'light_inf'];
          } else {
            const militiaCount = counts.militia || 0;
            const lightInfCount = counts.light_inf || 0;
            if (militiaCount * 2 < lightInfCount) {
              want = ['militia', 'light_inf', 'infantry_column'];
            } else if (militiaCount * 2 > lightInfCount) {
              want = ['light_inf', 'militia', 'infantry_column'];
            } else {
              want = ['light_inf', 'militia', 'infantry_column'];
            }
          }
        } else if (force === 'newworld') {
          want = ['hover_tank', 'tank', 'heavy_tank', 'spg', 'field_gun', 'infantry_gun',
            'tactical_carrier', 'missile_ship', 'battle_barge', 'gunboat', 'light_inf', 'drone_team'];
        } else {
          const inf = counts.light_inf || 0;
          const armour = (counts.tank || 0) + (counts.armored_car || 0);
          const guns = (counts.field_gun || 0) + (counts.infantry_gun || 0);
          if (inf < 3) want = ['light_inf', 'mech_inf'];
          else if (guns < 2) want = ['infantry_gun', 'field_gun', 'light_inf'];
          else if (armour < Math.max(2, inf * 0.5)) want = ['tank', 'armored_car'];
          else want = ['tank', 'field_gun', 'light_inf'];
        }
        if (specialCount >= 2 && specialCount < 6 && cheapSpecialTypes.length) {
          want = cheapSpecialTypes.concat(want);
        }
        const fallback = force === 'newworld'
          ? ['light_inf', 'drone_team', 'gunboat', 'battle_barge']
          : ['light_inf', 'infantry_gun', 'gunboat', 'battle_barge'];
        // 特殊单位保底：前两个优先在能部署它们的地点生产；不合适的据点直接跳过，避免把预算花掉。
        const specialAtSite = specialCount < 2
          ? specialTypes.filter(t => {
              if (!game.deployable(state, site, t)) return false;
              const c = game.costOf(state, t, faction);
              return money >= c.money && (c.pop === 0 || freePop >= c.pop) && (c.industry === 0 || freeInd >= c.industry);
            })
          : [];
        const options = specialAtSite.concat(want, fallback);
        const seen = new Set();

        for (const t of options) {
          if (seen.has(t)) continue;
          seen.add(t);
          if (!game.deployable(state, site, t)) continue;
          const c = game.costOf(state, t, faction);
          if (money >= c.money && (c.pop === 0 || freePop >= c.pop) && (c.industry === 0 || freeInd >= c.industry)) {
            money -= c.money; freePop -= c.pop; freeInd -= c.industry;
            counts[t] = (counts[t] || 0) + 1;
            if (armorTypes.includes(t)) armorInd += c.industry;
            if (artyTypes.includes(t)) { artyInd += c.industry; artyCount++; }
            if (infTypes.includes(t)) infCount++;
            if (U[t] && U[t].naval) navalInd += c.industry;
            if (!(U[t] && U[t].naval)) landCount++;
            if (t === 'armored_car' || t === 'tank' || t === 'heavy_tank' || t === 'superheavy_tank') armorCount++;
            if (t === 'light_inf' || t === 'suicide_squad') lightCount++;
            if (specialTypes.includes(t)) specialCount++;
            plans.push({ siteId: site.id, type: t });
            break;
          }
        }
      }
      // 有条件时保底生产至少 1 个水域单位。
      if (!myUnits().some(u => U[u.type] && U[u.type].naval) && plans.length < self.maxBuilds) {
        for (const site of ownSites().filter(s => s.kind === 'port')) {
          for (const t of game.buildOrder(state, faction)) {
            if (!U[t] || !U[t].naval) continue;
            if (!game.deployable(state, site, t)) continue;
            const c = game.costOf(state, t, faction);
            if (money >= c.money && (c.pop === 0 || freePop >= c.pop) && (c.industry === 0 || freeInd >= c.industry)) {
              money -= c.money; freePop -= c.pop; freeInd -= c.industry;
              plans.push({ siteId: site.id, type: t });
              break;
            }
          }
          if (plans.some(p => p.siteId === site.id)) break;
        }
      }
      return plans;
    }

    /* ---------------- 守军分配 ---------------- */
    function enemyDirections() {
      const base = ownSites().find(s => s.capital) || ownSites()[0];
      if (!base) return new Set();
      const dirs = new Set();
      const add = (q, r) => {
        const dq = q - base.q, dr = r - base.r;
        if (Math.abs(dq) + Math.abs(dr) > 14) return;
        let bi = 0, bd = -Infinity;
        for (let i = 0; i < H.DIRS.length; i++) {
          const dot = dq * H.DIRS[i][0] + dr * H.DIRS[i][1];
          if (dot > bd) { bd = dot; bi = i; }
        }
        dirs.add(bi);
      };
      for (const s of enemySites()) add(s.q, s.r);
      for (const u of foeUnits()) add(u.q, u.r);
      return dirs;
    }

    function defensePoint() {
      const sites = ownSites().slice().sort((a, b) => nearestFoeDist(a.q, a.r) - nearestFoeDist(b.q, b.r));
      const site = sites[0];
      // 若桥头/通道靠近我方且暂不从这里进攻，优先守桥头。
      if (!self.pushing) {
        let best = null, bd = 1e9;
        for (const t of Object.values(state.grid)) {
          if (!t.bridge) continue;
          const d = site ? H.distance(site.q, site.r, t.q, t.r) : 99;
          if (d > 6 || d >= bd) continue;
          if (!enemyNear(t.q, t.r, 12)) continue;
          bd = d; best = t;
        }
        if (best) return { q: best.q, r: best.r, kind: 'bridge', name: '桥头', capital: false };
      }
      return site ? { q: site.q, r: site.r, kind: site.kind, name: site.name, capital: site.capital } : null;
    }

    function assignRoles() {
      self.roles.clear();
      const units = myUnits();
      const used = new Set();
      const sites = ownSites().slice().sort((a, b) => (b.capital ? 1 : 0) - (a.capital ? 1 : 0));

      for (const site of sites) {
        const threat = nearestFoeDist(site.q, site.r);
        const limit = site.capital ? 13 : 9;
        if (threat > limit) continue;

        let pick = game.unitAt(state, site.q, site.r);
        if (pick && pick.faction !== faction) pick = null;
        if (!pick) {
          let pd = 99;
          for (const u of units) {
            if (used.has(u.id)) continue;
            const d = H.distance(u.q, u.r, site.q, site.r);
            if (d < pd && d <= 4) { pd = d; pick = u; }
          }
        }
        if (pick && !used.has(pick.id)) {
          used.add(pick.id);
          self.roles.set(pick.id, site);
        }
      }

      // 多方向受威胁时，至少保留约20%单位用于守备，不把全部兵力投入单一路线。
      const dirs = enemyDirections();
      if (dirs.size >= 2) {
        const need = Math.max(1, Math.ceil(units.length * 0.2));
        if (self.roles.size < need) {
          const point = defensePoint();
          if (point) {
            const reserve = units.filter(u => !used.has(u.id) && !self.roles.has(u.id))
              .sort((a, b) => game.effective(a, state).atk - game.effective(b, state).atk ||
                H.distance(a.q, a.r, point.q, point.r) - H.distance(b.q, b.r, point.q, point.r));
            for (const u of reserve) {
              if (self.roles.size >= need) break;
              self.roles.set(u.id, point);
              used.add(u.id);
            }
          }
        }
      }
    }

    /* ---------------- 评估动作 ---------------- */
    function forceBias(unit) {
      if (self.force === 'ironblood' &&
        (unit.type === 'tank' || unit.type === 'armored_car' || unit.type === 'heavy_tank' || unit.type === 'superheavy_tank' || unit.type === 'mech_inf')) return 14;
      if (self.force === 'revolution' &&
        (unit.type === 'field_gun' || unit.type === 'tank' || unit.type === 'rocket_artillery')) return 11;
      if (self.force === 'northsea') return (SG.data.UNITS[unit.type] && SG.data.UNITS[unit.type].naval) ? 15 : 5;
      if (self.force === 'iris' && (unit.type === 'tank' || unit.type === 'guard' || unit.type === 'light_inf' || unit.type === 'mech_inf')) return 8;
      if (self.force === 'sunrise' && (unit.type === 'light_inf' || unit.type === 'suicide_squad')) return 12;
      if (self.force === 'eastland' && (unit.type === 'militia' || unit.type === 'light_inf' || unit.type === 'infantry_column')) return 10;
      return 0;
    }

    function bestAction(unit, stationary) {
      const reach = rules.reachable(state, unit);
      let best = null;
      const bias = forceBias(unit);
      const closePenalty = self.force === 'ironblood' && bias ? 0.08 : self.force === 'iris' ? 0.4 : 0.25;

      for (const node of reach.values()) {
        if (node.blocked) continue;
        if (stationary && node.cost > 0) continue;

        const site = game.siteAt(state, node.q, node.r);
        if (site && site.faction !== unit.faction && U[unit.type].capture && !game.unitAt(state, site.q, site.r)) {
          let s = 95 + site.level * 20 + (site.capital ? 160 : 0) + (site.kind !== 'city' ? 10 : 0);
          s += sitePriority(site);
          if (H.distance(unit.q, unit.r, site.q, site.r) <= 8) s += siteOrderValue(site) * 8;
          if (self.force === 'northsea' && site.kind === 'port') s += 30;
          if (self.force === 'sunrise' && (unit.type === 'light_inf' || unit.type === 'suicide_squad')) s += 35;
          s -= node.cost * 0.6;
          if (!best || s > best.score) best = { score: s, kind: 'capture', q: node.q, r: node.r, site };
        }

        for (const target of rules.attackTargets(state, unit, node.q, node.r)) {
          const est = rules.attackScore(state, unit, target, { fromQ: node.q, fromR: node.r });
          let s = est.score + bias + game.terrainDefense(state, node.q, node.r) * 3 - node.cost * closePenalty;
          if (self.force === 'eastland') s += rules.flankBonus(state, unit, target) * 12;
          const tSite = game.siteAt(state, target.q, target.r);
          if (tSite && tSite.faction === faction) s += 25;
          if (target.faction === strategicTarget()) s += 160;
          s += Math.min(500, hateScore(target.faction) * 24);
          if (self.force === 'iris' && ownSites().some(site => H.distance(target.q, target.r, site.q, site.r) <= 3)) s += 14;
          if (est.lethal > 0.5) s += 10;
          if (s > (best ? best.score : -1e9)) {
            best = { score: s, kind: 'attack', q: node.q, r: node.r, target, est };
          }
        }
      }

      if (best && best.kind === 'attack' && best.score < self.attackThreshold) {
        if (!(best.est && best.est.lethal >= 0.6)) best = null;
      }
      if (best && best.kind === 'capture' && best.score < 60) best = null;
      return { best, reach };
    }

    function execute(unit, best, reach) {
      if (best.q !== unit.q || best.r !== unit.r) {
        const res = rules.moveUnit(state, unit, best.q, best.r, reach);
        if (!res.ok) return null;
        if (res.captured) return { kind: 'capture', unit, site: res.captured };
      }
      if (best.kind === 'attack' && best.target) {
        const target = best.target;
        const res = rules.resolveAttack(state, unit, target);
        return { kind: 'attack', unit, target, result: res };
      }
      return null;
    }

    /* ---------------- 行军 ---------------- */
    function moveToward(unit, target) {
      if (!target) return null;
      let path = rules.findPath(state, unit, target.q, target.r);
      if (!path || !path.length) {
        let foeU = null, fd = 99;
        for (const e of foeUnits()) {
          const d = H.distance(unit.q, unit.r, e.q, e.r);
          if (d < fd) { fd = d; foeU = e; }
        }
        if (foeU) path = rules.findPath(state, unit, foeU.q, foeU.r);
        if (!path || !path.length) {
          let bestPath = null;
          for (const n of H.neighbors(target.q, target.r)) {
            const p = rules.findPath(state, unit, n.q, n.r);
            if (p && (!bestPath || p.length < bestPath.length)) bestPath = p;
          }
          path = bestPath;
        }
      }
      if (!path || !path.length) return null;

      const reach = rules.reachable(state, unit);
      let step = null;
      for (const p of path) {
        const node = reach.get(H.key(p.q, p.r));
        if (node && !node.blocked) step = p;
        else if (node && node.blocked) break;
      }
      if (!step) return null;

      // 受损部队不往两个以上敌人的枪口上撞
      if (unit.state === 'damaged') {
        let adj = 0;
        for (const e of foeUnits()) if (H.distance(e.q, e.r, step.q, step.r) <= 1) adj++;
        if (adj >= 2) return null;
      }
      const res = rules.moveUnit(state, unit, step.q, step.r, reach);
      if (!res.ok) return null;
      if (res.captured) return { kind: 'capture', unit, site: res.captured };

      const targets = rules.attackTargets(state, unit);
      if (targets.length) {
        let pick = null, bestS = -1e9;
        for (const t of targets) {
          const est = rules.attackScore(state, unit, t);
          if (est.score > bestS) { bestS = est.score; pick = t; }
        }
        if (pick && bestS > 6) {
          const ar = rules.resolveAttack(state, unit, pick);
          return { kind: 'attack', unit, target: pick, result: ar };
        }
      }
      return { kind: 'move', unit };
    }

    function nearestOwnSite(q, r) {
      let best = null, bd = 1e9;
      for (const s of ownSites()) {
        const d = H.distance(q, r, s.q, s.r);
        if (d < bd) { bd = d; best = s; }
      }
      return best;
    }

    function rallySite() {
      let best = null, bd = 1e9;
      for (const s of ownSites()) {
        const d = frontDistance(s.q, s.r);
        if (d < bd) { bd = d; best = s; }
      }
      return best;
    }

    function fieldTarget(unit) {
      const fieldCount = myUnits().filter(u => !self.roles.has(u.id)).length;
      if (!self.pushing && fieldCount >= self.pushNeed) self.pushing = true;
      if (self.pushing && fieldCount <= 1) self.pushing = false;

      let close = null, cd = 99;
      for (const e of foeUnits()) {
        const d = H.distance(unit.q, unit.r, e.q, e.r);
        if (d < cd) { cd = d; close = e; }
      }
      for (const [hated] of hateEntries()) {
        const hu = foeUnits().filter(e => e.faction === hated)
          .sort((a, b) => H.distance(unit.q, unit.r, a.q, a.r) - H.distance(unit.q, unit.r, b.q, b.r))[0];
        if (hu) return hu;
      }
      if (close && cd <= 2) return close;
      const nearby = nearbySiteFor(unit);
      if (nearby) return nearby;
      const strategic = strategicTarget();
      if (strategic) {
        const ss = state.sites.filter(s => s.faction === strategic)
          .sort((a, b) => H.distance(unit.q, unit.r, a.q, a.r) - H.distance(unit.q, unit.r, b.q, b.r))[0];
        if (ss) return ss;
      }
      const priority = prioritySiteFor(unit);
      if (priority) return priority;
      if (!self.pushing) return rallySite();
      return nearestEnemySite(unit.q, unit.r) || close || rallySite();
    }

    /* ---------------- 单兵行动 ---------------- */
    function enemyNear(q, r, range) {
      for (const u of foeUnits()) if (H.distance(q, r, u.q, u.r) <= range) return true;
      for (const s of enemySites()) if (H.distance(q, r, s.q, s.r) <= range) return true;
      return false;
    }

    function ownSiteThreatNear(unit) {
      return ownSites().some(site => H.distance(unit.q, unit.r, site.q, site.r) <= 1 && enemyNear(site.q, site.r, 6));
    }

    function isChokeTile(t) {
      if (!t) return false;
      if (t.bridge) return true;
      if (t.t !== 'plains') return false;
      let rough = 0, pass = 0;
      for (const n of H.neighbors(t.q, t.r)) {
        const nt = game.tileAt(state, n.q, n.r);
        if (!nt) continue;
        const td = D.TERRAIN[nt.t];
        if (!td) continue;
        if (td.pass) pass++;
        if (nt.t === 'mountain' || nt.t === 'hills') rough++;
      }
      return rough >= 2 && pass >= 2;
    }

    function chokeNear(unit) {
      for (let d = 0; d <= 4; d++) {
        for (const n of (d === 0 ? [{ q: unit.q, r: unit.r }] : H.ring(unit.q, unit.r, d))) {
          if (isChokeTile(game.tileAt(state, n.q, n.r))) return true;
        }
      }
      return false;
    }

    function defensiveDirection(unit) {
      if (self.pushing) return false;
      return enemyNear(unit.q, unit.r, 6);
    }

    function tryFortify(unit) {
      if (!rules.isFortBuilder(state, unit)) return null;
      if ((self.aiFortCount || 0) >= 1) return null;
      if (state.forts.filter(f => f.faction === faction).length >= 20) return null;
      if (unit.hasMoved || unit.hasAttacked || unit.supporting) return null;
      if (state.fortsBuilt >= game.fortLimit(state, faction)) return null;
      const siteThreat = ownSiteThreatNear(unit);
      const defensive = defensiveDirection(unit);
      const choke = chokeNear(unit);
      if (!siteThreat && !defensive && !choke) return null;
      const fortTypes = choke ? ['wire', 'trap', 'trench', 'aa'] : ['trench', 'wire', 'trap', 'aa'];
      for (const type of fortTypes) {
        const chk = rules.canBuildFort(state, unit, type);
        if (!chk.ok) continue;
        let spot = null;
        if (siteThreat) spot = chk.tiles.find(t => ownSites().some(s => s.q === t.q && s.r === t.r));
        if (!spot && choke) spot = chk.tiles.find(t => isChokeTile(t));
        if (!spot) spot = chk.tiles.slice().sort((a, b) => {
          const ea = enemySites().length ? Math.min(...enemySites().map(s => H.distance(a.q, a.r, s.q, s.r))) : 99;
          const eb = enemySites().length ? Math.min(...enemySites().map(s => H.distance(b.q, b.r, s.q, s.r))) : 99;
          return ea - eb;
        })[0];
        if (!spot) continue;
        const res = rules.buildFort(state, unit, type, spot.q, spot.r);
        if (res.ok) { self.aiFortCount = (self.aiFortCount || 0) + 1; return { kind: 'fort', unit, fortType: type, fort: res.fort, q: spot.q, r: spot.r }; }
      }
      return null;
    }

    function followUpAttack(unit) {
      if (self.force !== 'sunrise' || (unit.type !== 'light_inf' && unit.type !== 'suicide_squad')) return null;
      if (unit.hasAttacked || (unit.attacksMade || 0) >= 2) return null;
      const targets = rules.attackTargets(state, unit);
      if (!targets.length) return null;
      let pick = null, bestScore = -1e9;
      for (const t of targets) {
        const est = rules.attackScore(state, unit, t);
        if (est.score > bestScore) { bestScore = est.score; pick = t; }
      }
      if (!pick) return null;
      const ar = rules.resolveAttack(state, unit, pick);
      return { kind: 'attack', unit, target: pick, result: ar };
    }

    function supportChance() {
      if (self.force === 'eastland') return 0.60;
      if (self.force === 'sunrise' || self.force === 'ironblood') return 0.40;
      if (self.force === 'revolution') return 0.30;
      return 0.20;
    }

    function trySupport(unit) {
      if (unit.hasMoved || unit.hasAttacked || unit.supporting) return null;
      const targets = rules.attackTargets(state, unit);
      if (!targets.length) return null;
      const myAtk = game.effective(unit, state).atk;
      let pick = null, bestScore = -1e9;
      for (const t of targets) {
        const focus = self.focusTargetId && String(t.id) === String(self.focusTargetId) && self.focusRoll;
        if (!self.supportTurn && !focus) continue;
        const stronger = myUnits().some(o => o.id !== unit.id && !o.hasAttacked && !o.supporting &&
          game.effective(o, state).atk > myAtk && rules.attackTargets(state, o).includes(t));
        if (!stronger) continue;
        const est = rules.attackScore(state, unit, t);
        if (est.score > bestScore) { bestScore = est.score; pick = t; }
      }
      if (!pick) return null;
      const res = rules.supportUnit(state, unit, pick);
      if (!res.ok) return null;
      self.supportCount = (self.supportCount || 0) + 1;
      return { kind: 'support', unit, target: pick };
    }

    function actGarrison(unit) {
      const role = self.roles.get(unit.id);
      if (role && !unit.hasMoved && H.distance(unit.q, unit.r, role.q, role.r) > 1) {
        const move = moveToward(unit, role);
        if (move) return move;
      }
      const sup = trySupport(unit);
      if (sup) return sup;
      const fort = tryFortify(unit);
      if (fort) return fort;
      const { best, reach } = bestAction(unit, true);
      if (best) {
        const res = execute(unit, best, reach);
        if (res) return followUpAttack(unit) || res;
      }
      return null;
    }

    function actField(unit) {
      const sup = trySupport(unit);
      if (sup) return sup;
      const fort = tryFortify(unit);
      if (fort) return fort;
      // 受损部队不再反复向前推进：优先撤回最近的我方据点，到据点后待命恢复。
      if (unit.state === 'damaged') {
        const site = nearestOwnSite(unit.q, unit.r);
        if (site && (unit.q !== site.q || unit.r !== site.r)) {
          const back = moveToward(unit, site);
          if (back) return back;
        }
        const wait = rules.waitUnit(state, unit);
        if (wait.ok) return { kind: 'wait', unit };
        return null;
      }
      const { best, reach } = bestAction(unit, false);
      if (best) {
        const res = execute(unit, best, reach);
        if (res) return followUpAttack(unit) || res;
      }
      if (unit.hasMoved) return null;
      return moveToward(unit, fieldTarget(unit));
    }

    function ensureActed(unit) {
      if (!unit || (unit.hasMoved && unit.hasAttacked)) return null;
      //  garrison 单位在无攻击/工事机会时，也转为向前推进，避免整支 AI 停在原地。
      if (self.roles.has(unit.id)) {
        const role = self.roles.get(unit.id);
        if (role && !unit.hasMoved && H.distance(unit.q, unit.r, role.q, role.r) > 1) {
          const move = moveToward(unit, role);
          if (move) return move;
        }
        const hold = rules.waitUnit(state, unit);
        if (hold.ok) return { kind: 'wait', unit };
        return { kind: 'wait', unit };
      }
      if (!unit.hasMoved) {
        const move = moveToward(unit, fieldTarget(unit));
        if (move) return move;
      }
      if (!unit.hasMoved) {
        const taunts = rules.tauntEnemies(state, unit);
        if (taunts.length) {
          const move = moveToward(unit, taunts[0]);
          if (move) return move;
        }
      }
      // 只有确实无法移动/攻击时才待命。
      const wait = rules.waitUnit(state, unit);
      if (wait.ok) return { kind: 'wait', unit };
      // 被机甲嘲讽且无路可走时，至少结束该单位行动，避免 AI 回合卡住。
      if (!unit.hasMoved && !unit.hasAttacked) {
        unit.hasMoved = true;
        unit.hasAttacked = true;
      }
      return { kind: 'wait', unit };
    }

    function useAirportIfNeeded() {
      const airports = ownSites().filter(s => s.kind === 'airport');
      for (const site of airports) {
        const nuke = rules.airportStatus(state, site, 'nuke');
        if (nuke.ok) {
          const safeTiles = nuke.targets.tiles.filter(t =>
            !state.units.some(u => u.faction === faction && H.distance(u.q, u.r, t.q, t.r) <= 6));
          if (safeTiles.length) {
            const t = safeTiles[0];
            const res = rules.useAirportMission(state, site, 'nuke', t.q, t.r);
            if (res.ok) return res;
          }
        }
        for (const id of ['supply', 'bomb', 'tactical_bomb', 'jam', 'drop']) {
          const st = rules.airportStatus(state, site, id);
          if (!st.ok) continue;
          const t = st.targets.tiles[0] || (st.targets.units[0] && { q: st.targets.units[0].q, r: st.targets.units[0].r });
          if (!t) continue;
          const res = rules.useAirportMission(state, site, id, t.q, t.r);
          if (res.ok) return res;
        }
      }
      return null;
    }

    /* ---------------- 对外 ---------------- */
    self.begin = function () {
      assignRoles();
      self.aiFortCount = 0;
      self.supportTurn = Math.random() < supportChance();
      self.supportCount = 0;
      self.focusTargetId = null;
      const missMap = (state.aiMisses && state.aiMisses[faction]) || {};
      let bestMiss = 1;
      for (const [id, n] of Object.entries(missMap)) if (n >= 2 && n > bestMiss) { bestMiss = n; self.focusTargetId = id; }
      self.focusRoll = !!self.focusTargetId && Math.random() < Math.min(1, supportChance() + 0.20);
      for (let i = 0; i < 2; i++) useAirportIfNeeded();
      self.builds = planBuilds();
      self.phase = 'build';
      const units = myUnits().slice();
      units.sort((a, b) => (PRIORITY[a.type] - PRIORITY[b.type]) || (a.state === 'damaged' ? 1 : 0) - (b.state === 'damaged' ? 1 : 0));
      self.queue = units.map(u => u.id);
      self.index = 0;
    };

    self.step = function () {
      if (state.over) { self.done = true; return { done: true }; }
      if (self.phase === 'build') {
        if (self.buildIndex < self.builds.length) {
          const plan = self.builds[self.buildIndex++];
          const site = state.sitesById[plan.siteId];
          if (site) {
            const res = game.buildUnit(state, site, plan.type);
            if (res.ok) return { done: false, kind: 'build', unit: res.unit, site };
          }
          return { done: false, kind: 'none' };
        }
        self.phase = 'act';
        return { done: false, kind: 'phase' };
      }

      let guard = 0;
      while (self.index < self.queue.length && guard++ < 80) {
        if (state.over) { self.done = true; return { done: true }; }
        const id = self.queue[self.index++];
        const unit = state.units.find(u => u.id === id);
        if (!unit) continue;
        if (unit.jammed) continue;
        if (unit.hasMoved && unit.hasAttacked) continue;
        const res = self.roles.has(unit.id) ? actGarrison(unit) : actField(unit);
        if (res) return Object.assign({ done: false }, res);
        const fallback = ensureActed(unit);
        if (fallback) return Object.assign({ done: false }, fallback);
      }
      // 队列结束后再扫一遍，确保没有单位因无目标而被跳过。
      const idle = myUnits().find(u => !u.hasMoved && !u.hasAttacked && !u.supporting);
      if (idle) {
        const res = ensureActed(idle);
        if (res) return Object.assign({ done: false }, res);
      }
      self.done = true;
      return { done: true };
    };

    return self;
  }

  SG.ai = { createAI };
})(typeof window !== 'undefined' ? window : globalThis);
