/* ============================================================
 * 钢铁洪流 · 界面控制
 * ============================================================ */
(function (root) {
  'use strict';
  const SG = (root.SG = root.SG || {});
  const D = SG.data, H = SG.hex, G = SG.game, R = SG.rules, Rnd = SG.Render, Au = SG.Audio;
  const F = D.FACTIONS, U = D.UNITS, T = D.TERRAIN, SK = D.SITE_KINDS;
  const Net = SG.net;
  const $ = (s) => document.querySelector(s);
  const SAVE_KEY = 'steeltide.save.v13';

  const ui = {
    state: null,
    selectedUnitId: null,
    selectedCityId: null,
    reach: null,
    targets: new Set(),
    busy: false,
    ai: null,
    aiTimer: null,
    undo: null,
    playerFaction: 'alliance',
    playerForce: 'revolution',
    mapId: 'training',
    customMap: null,
    difficulty: 1,
    hover: null,
    buildCityId: null,
    swapMode: null,
    airportMode: null,
    fortMode: null,
    supportMode: null,
    militiaMode: null,
    navalBuild: null,
    landBuild: null,
    landingMode: null,
    strategyPick: null,
    lastStrategies: null,
    enemyRevealCb: null,
    started: false,
    network: false,
    net: null,
    inited: false
  };

  const p2p = {
    role: null, hostSide: 'alliance', guestSide: 'empire', pickOrder: 'host',
    mapId: 'training', choices: { host: null, guest: null }, connected: false, roomCode: null
  };

  let drag = { down: false, moved: false, x: 0, y: 0 };
  let audioUnlocked = false;

  /* ================= 工具 ================= */
  function findUnit(id) { return ui.state ? ui.state.units.find(u => u.id === id) : null; }
  function key(q, r) { return H.key(q, r); }
  function factionName(f) { return F[f] ? F[f].name : '中立'; }

  function toast(text, kind) {
    const box = $('#toast');
    const el = document.createElement('div');
    el.className = 'toast-item' + (kind ? ' ' + kind : '');
    el.textContent = text;
    box.appendChild(el);
    while (box.children.length > 3) box.removeChild(box.firstChild);
    setTimeout(() => { el.style.transition = 'opacity .35s, transform .35s'; el.style.opacity = '0'; el.style.transform = 'translateY(-6px)'; }, 2100);
    setTimeout(() => el.remove(), 2550);
  }

  function hint(text) { $('#hint').textContent = text; }

  function banner(text, faction) {
    const b = $('#turnBanner');
    b.textContent = text;
    const fd = ui.state && faction ? G.forceData(ui.state, faction) : (faction ? F[faction] : null);
    b.style.color = fd ? fd.light : '';
    b.className = 'turn-banner show' + (faction ? ' ' + faction : '');
    clearTimeout(banner._t);
    banner._t = setTimeout(() => { b.className = 'turn-banner' + (faction ? ' ' + faction : ''); }, 1500);
  }

  /* ================= 初始化 ================= */
  function init() {
    if (ui.inited) return;
    ui.inited = true;

    Rnd.init($('#map'));
    Rnd.setState(null);
    bindUI();
    bindMapEditor();
    buildHelpTable();
    ui.customMap = loadCustomMapFromStorage();
    updateCustomMapCard();
    refreshSaveButton();
    maybeAutoJoinP2P();

    requestAnimationFrame(loop);
    window.addEventListener('resize', () => { Rnd.resize(); });
  }

  function loop() {
    Rnd.draw();
    requestAnimationFrame(loop);
  }

  function bindUI() {
    // 势力 / 难度选择
    document.querySelectorAll('.pick').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.pick').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        ui.playerForce = btn.dataset.force || 'revolution';
        ui.playerFaction = 'alliance';
        Au.play('click');
      });
    });
    document.querySelectorAll('#diffPick button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#diffPick button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        ui.difficulty = Number(btn.dataset.diff);
        Au.play('click');
      });
    });

    document.querySelectorAll('#mapPick button').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.map || 'training';
        if (id === 'custom' && !ui.customMap) {
          openMapEditor();
          Au.play('click');
          return;
        }
        document.querySelectorAll('#mapPick button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        ui.mapId = id;
        Au.play('click');
      });
    });
    $('#btnMapEditor').addEventListener('click', openMapEditor);
    $('#btnStart').addEventListener('click', () => {
      if (ui.mapId === 'custom' && !ui.customMap) { openMapEditor(); return; }
      showStrategyPicker();
    });
    $('#btnContinue').addEventListener('click', continueSave);
    $('#btnP2P').addEventListener('click', openP2P);
    $('#btnStrategyConfirm').addEventListener('click', confirmStrategy);
    $('#btnEnemyStrategyOk').addEventListener('click', confirmEnemyStrategy);
    $('#btnAIStatus').addEventListener('click', openAIStatus);
    $('#btnHelpStart').addEventListener('click', () => showModal('helpModal'));
    $('#btnHelp2').addEventListener('click', () => showModal('helpModal'));
    $('#btnFit').addEventListener('click', () => { Rnd.fit(false); Au.play('click'); });
    $('#btnSound').addEventListener('click', () => {
      const on = Au.toggle();
      $('#btnSound').classList.toggle('off', !on);
      toast(on ? '音效已开启' : '音效已关闭');
    });
    $('#btnEndTurn').addEventListener('click', endPlayerTurn);
    $('#btnSave').addEventListener('click', () => saveManual());
    $('#btnNew').addEventListener('click', () => {
      if (ui.busy) { toast('敌军行动中，无法开始新战役'); return; }
      if (ui.network) { Net.disconnect(); ui.network = false; ui.net = null; ui.state = null; }
      showStart();
    });
    $('#btnAgain').addEventListener('click', () => {
      hideModal('endScreen');
      if (ui.network) { Net.disconnect(); ui.network = false; ui.net = null; ui.state = null; showStart(); return; }
      const st = (ui.state && ui.state.strategies && ui.state.strategies[ui.state.playerFaction]) || ui.lastStrategies;
      if (st && st.attack && st.defense) startNew('alliance', ui.difficulty, st, ui.playerForce);
      else { $('#startScreen').classList.remove('hidden'); showStrategyPicker(); }
    });
    $('#btnBackMenu').addEventListener('click', () => {
      hideModal('endScreen');
      if (ui.network) { Net.disconnect(); ui.network = false; ui.net = null; }
      ui.state = null;
      Rnd.setState(null);
      showStart();
    });

    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => hideModal(btn.dataset.close));
    });

    // 画布交互
    const cv = $('#map');
    cv.addEventListener('mousedown', e => {
      unlockAudio();
      if (e.button !== 0) return;
      drag = { down: true, moved: false, x: e.clientX, y: e.clientY };
    });
    cv.addEventListener('mousemove', e => {
      const r = cv.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      if (drag.down) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
        if (drag.moved) {
          Rnd.pan(dx, dy);
          drag.x = e.clientX; drag.y = e.clientY;
          cv.classList.add('dragging');
          hideTooltip();
          return;
        }
      }
      updateHover(px, py, e.clientX, e.clientY);
    });
    cv.addEventListener('mouseup', e => {
      const wasDrag = drag.moved;
      drag.down = false;
      cv.classList.remove('dragging');
      if (wasDrag) return;
      const r = cv.getBoundingClientRect();
      handleClick(e.clientX - r.left, e.clientY - r.top);
    });
    cv.addEventListener('mouseleave', () => {
      drag.down = false;
      cv.classList.remove('dragging');
      Rnd.setHover(null, null);
      Rnd.setView({ path: null });
      hideTooltip();
    });
    cv.addEventListener('contextmenu', e => { e.preventDefault(); deselect(); });
    cv.addEventListener('wheel', e => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      Rnd.zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.12 : 1 / 1.12);
    }, { passive: false });

    // 键盘
    window.addEventListener('keydown', e => {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.key === ' ' || e.key === 'Enter') {
        if (!document.querySelector('.overlay:not(.hidden)')) { e.preventDefault(); endPlayerTurn(); }
      } else if (e.key === 'Escape') {
        const help = $('#helpModal'), build = $('#buildModal'), fort = $('#fortModal'), strategy = $('#strategyModal'), end = $('#endScreen'), start = $('#startScreen');
        if (!help.classList.contains('hidden')) { hideModal('helpModal'); return; }
        if (!$('#mapEditor').classList.contains('hidden')) { closeMapEditor(); return; }
        if (!build.classList.contains('hidden')) { hideModal('buildModal'); return; }
        if (fort && !fort.classList.contains('hidden')) { hideModal('fortModal'); return; }
        if (strategy && !strategy.classList.contains('hidden')) { hideModal('strategyModal'); return; }
        const enemy = $('#enemyStrategyModal'), aiStatus = $('#aiStatusModal');
        if (enemy && !enemy.classList.contains('hidden')) { confirmEnemyStrategy(); return; }
        if (aiStatus && !aiStatus.classList.contains('hidden')) { hideModal('aiStatusModal'); return; }
        if (!end.classList.contains('hidden') || !start.classList.contains('hidden')) return;
        if (ui.navalBuild) { cancelNavalBuild(); return; }
        if (ui.landBuild) { cancelLandBuild(); return; }
        if (ui.supportMode) { cancelSupport(); return; }
        if (ui.fortMode) { cancelFortMode(); return; }
        if (ui.airportMode) { cancelAirportMode(); return; }
        if (ui.swapMode) {
          ui.swapMode = null;
          Rnd.setView({ swapTargets: null });
          syncSelection();
          renderContext();
          hint('已取消易位');
          return;
        }
        deselect();
      } else if (e.key === '+' || e.key === '=') {
        const r = $('#map').getBoundingClientRect();
        Rnd.zoomAt(r.width / 2, r.height / 2, 1.15);
      } else if (e.key === '-') {
        const r = $('#map').getBoundingClientRect();
        Rnd.zoomAt(r.width / 2, r.height / 2, 0.87);
      } else if (e.key.toLowerCase() === 'f') {
        Rnd.fit(false);
      } else if (e.key === 'Tab') {
        if (document.querySelector('.overlay:not(.hidden)')) return;
        e.preventDefault();
        cycleIdleUnit();
      }
    });

    window.addEventListener('mouseup', () => { drag.down = false; });
    window.addEventListener('pointerdown', unlockAudio, { once: true });
    window.addEventListener('beforeunload', () => { if (ui.state && !ui.state.over && !ui.busy) autoSave(); });
    bindP2P();
  }

  function unlockAudio() {
    if (!audioUnlocked) { audioUnlocked = true; Au.unlock(); }
  }

  /* ================= 战役开始 / 读档 ================= */
  function showEnemyStrategyReveal(done) {
    const s = ui.state;
    if (!s) { done(); return; }
    const ais = (s.factions || [s.aiFaction]).filter(f => f !== s.playerFaction);
    const cards = [];
    for (const ai of ais) {
      const st = s.strategies && s.strategies[ai];
      const atk = st && D.STRATEGIES.attack[st.attack];
      const def = st && D.STRATEGIES.defense[st.defense];
      if (!atk || !def) continue;
      const fd = G.forceData(s, ai);
      cards.push(`<div class="ai-strategy-block"><h3 style="color:${fd.light}">${fd.name}</h3>
        <div class="strategy-card active"><b>进攻 · ${atk.name}</b><span>${atk.desc}</span></div>
        <div class="strategy-card active"><b>防御 · ${def.name}</b><span>${def.desc}</span></div></div>`);
    }
    if (!cards.length) { done(); return; }
    ui.enemyRevealCb = done;
    $('#enemyStrategyModal h2').textContent = 'AI 战略 · ' + ais.length + ' 个对手';
    $('#enemyStrategyCards').innerHTML = cards.join('');
    showModal('enemyStrategyModal');
    Au.play('click');
  }

  function confirmEnemyStrategy() {
    hideModal('enemyStrategyModal');
    const cb = ui.enemyRevealCb;
    ui.enemyRevealCb = null;
    if (cb) cb();
  }

  function openAIStatus() {
    const s = ui.state;
    if (!s) { toast('战役尚未开始', 'bad'); return; }
    const ais = (s.factions || [s.aiFaction]).filter(f => f !== s.playerFaction);
    if (!ais.length) { toast('本局没有 AI', 'bad'); return; }
    if (!ui.aiStatusSelected || !ais.includes(ui.aiStatusSelected)) {
      ui.aiStatusSelected = ais.includes(s.current) ? s.current : (s.aiFaction || ais[0]);
    }
    renderAIStatus();
    showModal('aiStatusModal');
    Au.play('click');
  }

  function renderAIStatus() {
    const s = ui.state;
    const ais = (s.factions || [s.aiFaction]).filter(f => f !== s.playerFaction);
    const ai = ais.includes(ui.aiStatusSelected) ? ui.aiStatusSelected : (s.aiFaction || ais[0]);
    ui.aiStatusSelected = ai;
    const caps = G.capsOf(s, ai);
    const used = G.usageOf(s, ai);
    const inc = G.incomeOf(s, ai);
    const aiIncome = Math.round(inc.money * (s.aiIncomeMul || 1));
    const st = G.strategyOf(s, ai);
    const atk = D.STRATEGIES.attack[st.attack];
    const def = D.STRATEGIES.defense[st.defense];
    const owned = s.sites.filter(x => x.faction === ai);
    const siteCounts = { capital: 0 };
    for (const x of owned) {
      const k = x.capital ? 'capital' : x.kind;
      siteCounts[k] = (siteCounts[k] || 0) + 1;
    }
    const siteKinds = [{ id: 'capital', name: '首都' }].concat(
      Object.keys(SK).map(k => ({ id: k, name: SK[k].name })));
    const siteRows = siteKinds.map(x =>
      `<div class="ai-site">${x.name}<b>${siteCounts[x.id] || 0}</b></div>`).join('');
    const forces = s.units.filter(u => u.faction === ai);
    const byType = {};
    for (const u of forces) {
      if (!byType[u.type]) byType[u.type] = { n: 0, damaged: 0 };
      byType[u.type].n++;
      if (u.state === 'damaged') byType[u.type].damaged++;
    }
    const order = D.BUILD_ORDER.concat(['fort_gun']);
    const types = Object.keys(byType).sort((a, b) => {
      const ia = order.indexOf(a), ib = order.indexOf(b);
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
    });
    const unitRows = types.length ? types.map(t =>
      `<div class="ai-unit"><span>${U[t] ? U[t].name : t} ×${byType[t].n}</span>${byType[t].damaged ? '<em>受损 ' + byType[t].damaged + '</em>' : ''}</div>`
    ).join('') : '<div class="ai-unit">暂无已部署单位</div>';
    const damaged = forces.filter(u => u.state === 'damaged').length;
    const tabs = ais.map(f => {
      const fd = G.forceData(s, f);
      return `<button class="ai-tab ${f === ai ? 'active' : ''}" data-ai="${f}">
        <span class="dot" style="background:${fd.icon}"></span>
        <b>${fd.name}</b>
        <small>${G.siteCount(s, f)} 据点 · ${G.unitsOf(s, f).length} 单位</small>
      </button>`;
    }).join('');
    $('#aiStatusTitle').textContent = 'AI 状态 · ' + ais.length + ' 个对手';
    $('#aiStatusBody').innerHTML = `
      <div class="ai-tabs">${tabs}</div>
      <div class="ai-selected">
        <div class="ai-sec">
          <h3>${G.forceData(s, ai).name} · 战略</h3>
          <div class="ai-strategy-line">进攻：${atk ? atk.name : '未选择'}<br>防御：${def ? def.name : '未选择'}${(() => {
            const raw = s.aiHate && s.aiHate[ai];
            const hm = typeof raw === 'string' ? { [raw]: 1 } : (raw || {});
            const rows = Object.entries(hm).filter(([f]) => s.factions.includes(f)).sort((a, b) => b[1] - a[1]);
            return rows.length ? '<br>仇恨对象：' + rows.map(([f, n]) => G.forceData(s, f).name + '（' + n + '）').join('、') : '';
          })()}</div>
        </div>
        <div class="ai-sec">
          <h3>经济与上限</h3>
          <div class="ai-kv">
            <div>当前金钱<b>${s.money[ai]}</b></div>
            <div>每回合收入<b>+${aiIncome}</b></div>
            <div>据点总数<b>${owned.length}</b></div>
            <div>人口上限<b>${caps.pop}</b></div>
            <div>已占用人口<b>${used.pop}</b></div>
            <div>工业上限<b>${caps.industry}</b></div>
            <div>已占用工业<b>${used.industry}</b></div>
            <div>当前回合<b>${s.turn}</b></div>
            <div>状态<b>${s.current === ai ? '行动中' : '待命'}</b></div>
          </div>
        </div>
        <div class="ai-sec">
          <h3>据点（${owned.length}）</h3>
          <div class="ai-sites">${siteRows}</div>
        </div>
        <div class="ai-sec">
          <h3>已部署兵力（${forces.length}）</h3>
          <div class="ai-kv">
            <div>总兵力<b>${forces.length}</b></div>
            <div>受损单位<b>${damaged}</b></div>
            <div>据点<b>${owned.length}</b></div>
          </div>
          <div class="ai-units">${unitRows}</div>
        </div>
      </div>`;
    document.querySelectorAll('#aiStatusBody .ai-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        ui.aiStatusSelected = btn.dataset.ai;
        renderAIStatus();
        Au.play('click');
      });
    });
  }

  function showStrategyPicker() {
    ui.strategyPick = { attack: null, defense: null };
    renderStrategyPicker();
    showModal('strategyModal');
  }

  function renderStrategyPicker() {
    for (const kind of ['attack', 'defense']) {
      const box = $('#' + kind + 'Strategies');
      box.innerHTML = Object.values(D.STRATEGIES[kind]).map(def => {
        const sel = ui.strategyPick && ui.strategyPick[kind] === def.id;
        return `<button class="strategy-card ${sel ? 'active' : ''}" data-kind="${kind}" data-strategy="${def.id}">
          <b>${def.name}</b><span>${def.desc}</span>
        </button>`;
      }).join('');
      box.querySelectorAll('.strategy-card').forEach(btn => {
        btn.addEventListener('click', () => {
          ui.strategyPick[kind] = btn.dataset.strategy;
          renderStrategyPicker();
          Au.play('click');
        });
      });
    }
    const p = ui.strategyPick || {};
    const ready = !!(p.attack && p.defense);
    $('#btnStrategyConfirm').disabled = !ready;
    $('#strategyRes').textContent = ready
      ? ('进攻：' + D.STRATEGIES.attack[p.attack].name + ' · 防御：' + D.STRATEGIES.defense[p.defense].name)
      : '请选择进攻与防御战略';
  }

  function confirmStrategy() {
    const p = ui.strategyPick;
    if (!p || !p.attack || !p.defense) { toast('请选择进攻与防御战略', 'bad'); return; }
    ui.lastStrategies = { attack: p.attack, defense: p.defense };
    hideModal('strategyModal');
    startNew('alliance', ui.difficulty, ui.lastStrategies, ui.playerForce);
  }

  function maybeOpenLanding() {
    const s = ui.state;
    if (!s || s.over || s.current !== s.playerFaction) return;
    const list = (s.pendingLandings || []).filter(x => x.faction === s.playerFaction);
    if (!list.length) { ui.landingMode = null; return; }
    const first = list[0];
    first.options = first.options.filter(o => {
      const t = G.tileAt(s, o.q, o.r);
      return t && t.t !== 'water' && t.t !== 'river' && T[t.t].pass && !G.unitAt(s, o.q, o.r) && !G.fortAt(s, o.q, o.r);
    });
    if (!first.options.length) {
      s.pendingLandings = s.pendingLandings.filter(x => x !== first);
      return maybeOpenLanding();
    }
    ui.landingMode = { landing: first, keys: new Set(first.options.map(o => H.key(o.q, o.r))) };
    ui.selectedUnitId = null;
    ui.selectedCityId = null;
    ui.reach = null;
    ui.targets = new Set();
    Rnd.setView({
      landingTiles: ui.landingMode.keys, selectedUnit: null, selectedCityId: null,
      reach: null, targets: new Set(), supportTargets: null
    });
    updateHUD();
    renderContext();
    hint('突击快船沉没：点击高亮陆地格部署敢死队');
  }

  function placeLanding(q, r) {
    const s = ui.state;
    if (!s || !ui.landingMode) return;
    const res = R.placeLanding(s, ui.landingMode.landing, q, r);
    if (!res.ok) { toast(res.why, 'bad'); return; }
    Rnd.flash(q, r, 'rgba(230, 200, 130, 0.55)');
    Rnd.floatText(q, r, '敢死队', '#f0d69a');
    Au.play('build');
    ui.landingMode = null;
    Rnd.setView({ landingTiles: null });
    refreshAll();
    toast('突击快船沉没，敢死队已登陆（本回合不能行动）', 'good');
    maybeOpenLanding();
    if (!ui.landingMode) maybeOpenMilitiaDeployment();
  }

  function maybeOpenMilitiaDeployment() {
    const s = ui.state;
    if (!s || s.over || s.current !== s.playerFaction || ui.landingMode) return;
    const human = s.militiaPending ? (s.militiaPending[s.playerFaction] || 0) : 0;
    const capital = s.capitalMilitiaPending ? (s.capitalMilitiaPending[s.playerFaction] || 0) : 0;
    let source = null, n = 0, tiles = [];
    if (human > 0) {
      source = 'human'; n = human; tiles = G.militiaTargets(s, s.playerFaction);
      if (!tiles.length) { s.militiaPending[s.playerFaction] = 0; source = null; n = 0; }
    }
    if (!source && capital > 0) {
      source = 'capital'; n = capital; tiles = G.capitalMilitiaTargets(s, s.playerFaction);
      if (!tiles.length) { s.capitalMilitiaPending[s.playerFaction] = 0; source = null; n = 0; }
    }
    if (!source || n <= 0) {
      ui.militiaMode = null;
      Rnd.setView({ militiaTiles: null });
      return;
    }
    ui.militiaMode = { source, remaining: n, tiles: new Set(tiles.map(t => H.key(t.q, t.r))) };
    ui.selectedUnitId = null;
    ui.selectedCityId = null;
    ui.reach = null;
    ui.targets = new Set();
    Rnd.setView({
      reach: null, targets: new Set(), selectedUnit: null, selectedCityId: null,
      militiaTiles: ui.militiaMode.tiles, supportTargets: null
    });
    renderContext();
    updateHUD();
    hint((source === 'capital' ? '首都民兵' : '人海攻势') + '：点击高亮地格部署民兵（剩余 ' + n + '）');
  }

  function deployMilitia(q, r) {
    const s = ui.state;
    if (!s || !ui.militiaMode) return;
    const source = ui.militiaMode.source;
    const res = source === 'capital' ? G.placeCapitalMilitia(s, q, r) : G.placeMilitia(s, q, r);
    if (!res.ok) { toast(res.why, 'bad'); return; }
    Rnd.flash(q, r, 'rgba(180, 220, 160, 0.55)');
    Rnd.floatText(q, r, '民兵', '#cfe6b8');
    Au.play('build');
    ui.militiaMode = null;
    Rnd.setView({ militiaTiles: null });
    refreshAll();
    maybeOpenMilitiaDeployment();
    if (!ui.militiaMode) toast((source === 'capital' ? '首都民兵' : '人海攻势') + '：民兵部署完毕', 'good');
  }

  /* ================= P2P 联机 ================= */
  function p2pStatus(msg, kind) {
    const el = $('#p2pStatus');
    if (!el) return;
    el.textContent = msg;
    el.className = 'p2p-status ' + (kind || '');
  }

  function p2pLocalSide() {
    return p2p.role === 'host' ? p2p.hostSide : p2p.guestSide;
  }

  function p2pOtherSide() {
    return p2p.role === 'host' ? p2p.guestSide : p2p.hostSide;
  }

  function p2pPopulateSelects() {
    const force = $('#p2pForce');
    if (force && !force.options.length) {
      force.innerHTML = Object.values(D.FORCES).map(f => `<option value="${f.id}">${f.name}</option>`).join('');
    }
    const atk = $('#p2pAttack'), def = $('#p2pDefense');
    if (atk && !atk.options.length) {
      atk.innerHTML = Object.values(D.STRATEGIES.attack).map(s => `<option value="${s.id}">${s.name}</option>`).join('');
      def.innerHTML = Object.values(D.STRATEGIES.defense).map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    }
  }

  function p2pResetView() {
    $('#p2pConnectPanel').classList.remove('hidden');
    $('#p2pLobby').classList.add('hidden');
    $('#p2pHostBox').classList.add('hidden');
    $('#p2pJoinBox').classList.add('hidden');
    $('#p2pStart').disabled = true;
    p2p.choices = { host: null, guest: null };
    p2p.connected = false;
    p2pStatus('未连接', '');
  }

  function openP2P() {
    p2pPopulateSelects();
    const cfg = localStorage.getItem('steeltide.peerConfig') || '';
    $('#p2pServerConfig').value = cfg;
    p2pResetView();
    showModal('p2pModal');
    Au.play('click');
  }

  function p2pBecomeHost() {
    p2p.role = 'host';
    p2p.guestSide = p2p.hostSide === 'alliance' ? 'empire' : 'alliance';
    p2p.choices = { host: null, guest: null };
    $('#p2pHostBox').classList.remove('hidden');
    $('#p2pJoinBox').classList.add('hidden');
    p2pStatus('正在创建房间…');
    Net.setHandlers({
      onStatus: p2pStatus,
      onMessage: p2pMessage,
      onRemote: applyNetworkState,
      onClose: () => { p2p.connected = false; p2pStatus('对方已断开', 'bad'); }
    });
    Net.createRoom();
  }

  function p2pBecomeGuest() {
    p2p.role = 'guest';
    $('#p2pHostBox').classList.add('hidden');
    $('#p2pJoinBox').classList.remove('hidden');
    p2pStatus('输入房间号后连接');
  }

  function p2pConnect() {
    const code = ($('#p2pJoinCode').value || '').trim().toUpperCase();
    p2pStatus('正在连接…');
    Net.setHandlers({
      onStatus: p2pStatus,
      onMessage: p2pMessage,
      onRemote: applyNetworkState,
      onClose: () => { p2p.connected = false; p2pStatus('主机已断开', 'bad'); }
    });
    Net.joinRoom(code);
  }

  function p2pSendLobby() {
    if (p2p.role !== 'host' || !Net.connected) return;
    Net.send('lobby', {
      mapId: p2p.mapId, hostSide: p2p.hostSide, guestSide: p2p.guestSide,
      pickOrder: p2p.pickOrder
    });
  }

  function p2pApplyLobby(d) {
    p2p.mapId = d.mapId || 'training';
    p2p.hostSide = d.hostSide || 'alliance';
    p2p.guestSide = d.guestSide || (p2p.hostSide === 'alliance' ? 'empire' : 'alliance');
    p2p.pickOrder = d.pickOrder || 'host';
    p2p.connected = true;
    if (p2p.role === 'guest') {
      ui.started = false;
      Net.mySide = p2p.guestSide;
      ui.network = true;
      ui.net = { role: 'guest', mySide: p2p.guestSide, hostSide: p2p.hostSide, guestSide: p2p.guestSide, pickOrder: p2p.pickOrder, mapId: p2p.mapId };
    }
    $('#p2pConnectPanel').classList.add('hidden');
    $('#p2pLobby').classList.remove('hidden');
    p2pUpdateLobby();
    if (p2p.role === 'guest') {
      $('#p2pHostSettings').classList.add('hidden');
      $('#p2pGuestMapInfo').textContent = `地图：${p2p.mapId === 'custom' ? '自定义地图' : p2p.mapId === 'map1' ? '地图1' : '初始训练地图'} · 你的位置：${p2pLocalSide() === 'alliance' ? '西线' : '东线'} · 先选方：${p2p.pickOrder === 'host' ? '主机' : '客机'}`;
    }
  }

  function p2pUpdateLobby() {
    const mine = p2p.choices[p2p.role];
    const other = p2p.choices[p2p.role === 'host' ? 'guest' : 'host'];
    const side = p2pLocalSide();
    $('#p2pRoomInfo').textContent = `你的位置：${side === 'alliance' ? '西线' : '东线'} · 地图：${p2p.mapId} · 先选方：${p2p.pickOrder === 'host' ? '主机' : '客机'}`;
    $('#p2pChoiceState').textContent = mine
      ? ('你已确认 ' + D.FORCES[mine.force].name + '；' + (other ? '对方也已确认' : '等待对方确认'))
      : (other ? '对方已确认，等待你选择' : '选择国家、进攻战略和防御战略后确认');
    $('#p2pStart').disabled = !(p2p.role === 'host' && p2p.choices.host && p2p.choices.guest && Net.connected);
    if (p2p.role === 'host') {
      $('#p2pGuestMapInfo').textContent = `客机位置：${p2p.guestSide === 'alliance' ? '西线' : '东线'}`;
    }
  }

  function p2pChoose() {
    if (!p2p.role || !Net.connected) { p2pStatus('尚未连接', 'bad'); return; }
    const choice = {
      force: $('#p2pForce').value,
      attack: $('#p2pAttack').value,
      defense: $('#p2pDefense').value
    };
    p2p.choices[p2p.role] = choice;
    Net.send('choice', { role: p2p.role, choice, side: p2pLocalSide() });
    p2pUpdateLobby();
    p2pStatus('选择已发送', 'good');
  }

  function p2pMessage(type, data) {
    if (type === 'room-created') {
      p2p.roomCode = data.code;
      $('#p2pRoomCode').textContent = '房间号：' + data.code;
      p2pStatus('房间已创建，等待客机加入', 'good');
      return;
    }
    if (type === 'hello') {
      if (p2p.role === 'host') { p2p.connected = true; p2pSendLobby(); p2pApplyLobby({ mapId: p2p.mapId, hostSide: p2p.hostSide, guestSide: p2p.guestSide, pickOrder: p2p.pickOrder }); }
      return;
    }
    if (type === 'lobby') {
      p2pApplyLobby(data);
      return;
    }
    if (type === 'choice') {
      p2p.choices[data.role] = data.choice;
      p2p.connected = true;
      p2pUpdateLobby();
      return;
    }
    if (type === 'start-state') {
      Net.applySnapshot(data.state);
      return;
    }
  }

  function p2pShareLink() {
    if (!p2p.roomCode) return;
    if (location.protocol === 'file:') {
      p2pStatus('当前是本地文件，无法生成可分享网址；请先把游戏部署到静态网站', 'bad');
      return;
    }
    const url = new URL(location.href);
    url.searchParams.set('room', p2p.roomCode);
    const text = url.toString();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => p2pStatus('邀请链接已复制', 'good')).catch(() => window.prompt('复制邀请链接：', text));
    } else {
      window.prompt('复制邀请链接：', text);
    }
  }

  function maybeAutoJoinP2P() {
    let code = '';
    try { code = (new URLSearchParams(location.search).get('room') || '').toUpperCase(); } catch (e) { return; }
    if (!/^[A-Z0-9]{4}$/.test(code)) return;
    setTimeout(() => {
      openP2P();
      p2pBecomeGuest();
      $('#p2pJoinCode').value = code;
      p2pStatus('正在加入邀请房间…');
      p2pConnect();
    }, 350);
  }

  function p2pStart() {
    if (p2p.role !== 'host' || !Net.connected) return;
    const host = p2p.choices.host, guest = p2p.choices.guest;
    if (!host || !guest) { p2pStatus('等待双方完成选择', 'bad'); return; }
    const mapId = p2p.mapId;
    if (mapId === 'custom' && !ui.customMap) { p2pStatus('主机没有可用的自定义地图存档', 'bad'); return; }
    const s = G.create({
      playerFaction: p2p.hostSide,
      difficulty: 1,
      strategies: { [p2p.hostSide]: { attack: host.attack, defense: host.defense }, [p2p.guestSide]: { attack: guest.attack, defense: guest.defense } },
      playerForce: host.force,
      mapId,
      customMap: mapId === 'custom' ? ui.customMap : null
    });
    // 客机阵营交给客机控制，其余地图阵营继续作为 AI。
    s.aiFactions = (s.aiFactions || []).filter(f => f !== p2p.guestSide);
    s.forces[p2p.guestSide] = guest.force;
    s.strategies[p2p.hostSide] = { attack: host.attack, defense: host.defense };
    s.strategies[p2p.guestSide] = { attack: guest.attack, defense: guest.defense };
    const first = p2p.pickOrder === 'host' ? p2p.guestSide : p2p.hostSide;
    const second = first === p2p.hostSide ? p2p.guestSide : p2p.hostSide;
    const ai = s.factions.filter(f => f !== p2p.hostSide && f !== p2p.guestSide);
    s.factions = [first, second].concat(ai);
    s.aiFactions = ai;
    s.aiFaction = ai[0] || null;
    s.current = first;
    s.playerFaction = p2p.hostSide;
    G.startTurn(s, first, true);
    ui.network = true;
    ui.net = { role: 'host', mySide: p2p.hostSide, hostSide: p2p.hostSide, guestSide: p2p.guestSide, pickOrder: p2p.pickOrder, mapId };
    Net.mySide = p2p.hostSide;
    installNetworkGame(s, true);
    Net.beginGame(s, applyNetworkState);
    p2pStatus('战役已开始', 'good');
  }

  function installNetworkGame(s, initial) {
    ui.state = s;
    ui.playerFaction = Net.mySide;
    ui.playerForce = s.forces ? s.forces[Net.mySide] : null;
    ui.mapId = s.mapId;
    ui.customMap = s.customMap || null;
    ui.started = true;
    ui.busy = s.current !== Net.mySide;
    clearSelection();
    Rnd.setState(s);
    hideAllModals();
    $('#startScreen').classList.add('hidden');
    $('#btnAIStatus').classList.remove('hidden');
    if (initial) Rnd.fit(true);
    refreshAll();
    if (s.current === Net.mySide) {
      ui.busy = false;
      maybeOpenLanding();
      maybeOpenMilitiaDeployment();
      banner('第 ' + s.turn + ' 回合 · ' + G.forceData(s, Net.mySide).short, Net.mySide);
      hint(defaultHint());
    } else {
      ui.busy = true;
      hint('等待对方行动…');
    }
    if (ui.net && ui.net.role === 'host' && s.aiFactions.includes(s.current)) {
      setTimeout(runAI, 240);
    }
  }

  function applyNetworkState(s) {
    if (!ui.network || !ui.net) return;
    const first = !ui.started;
    Net.state = s;
    const oldCurrent = ui.state && ui.state.current;
    ui.state = s;
    ui.started = true;
    if (first) {
      hideAllModals();
      $('#startScreen').classList.add('hidden');
      $('#btnAIStatus').classList.remove('hidden');
    }
    ui.playerFaction = Net.mySide;
    ui.playerForce = s.forces ? s.forces[Net.mySide] : null;
    if (s.current !== oldCurrent) clearSelection();
    ui.busy = s.current !== Net.mySide;
    Rnd.setState(s);
    if (first) Rnd.fit(true);
    refreshAll();
    if (s.over) { finishGame(); return; }
    if (s.current === Net.mySide) {
      ui.busy = false;
      maybeOpenLanding();
      maybeOpenMilitiaDeployment();
      banner('第 ' + s.turn + ' 回合 · ' + G.forceData(s, Net.mySide).short, Net.mySide);
      hint(defaultHint());
    } else {
      ui.busy = true;
      hint(ui.net && ui.net.role === 'host' && s.aiFactions.includes(s.current) ? 'AI 行动中…' : '等待对方行动…');
      if (ui.net && ui.net.role === 'host' && s.aiFactions.includes(s.current)) {
        const target = s;
        setTimeout(() => {
          if (ui.state === target && !ui.state.over && ui.state.current === target.current && target.aiFactions.includes(target.current)) runAI();
        }, 260);
      }
    }
  }

  function bindP2P() {
    $('#p2pHostBtn').addEventListener('click', p2pBecomeHost);
    $('#p2pJoinBtn').addEventListener('click', p2pBecomeGuest);
    $('#p2pConnectBtn').addEventListener('click', p2pConnect);
    $('#p2pChoiceBtn').addEventListener('click', p2pChoose);
    $('#p2pStart').addEventListener('click', p2pStart);
    $('#p2pShare').addEventListener('click', p2pShareLink);
    $('#p2pMap').addEventListener('change', () => { p2p.mapId = $('#p2pMap').value; p2pSendLobby(); });
    $('#p2pHostSide').addEventListener('change', () => { p2p.hostSide = $('#p2pHostSide').value; p2p.guestSide = p2p.hostSide === 'alliance' ? 'empire' : 'alliance'; p2pSendLobby(); p2pUpdateLobby(); });
    $('#p2pPickOrder').addEventListener('change', () => { p2p.pickOrder = $('#p2pPickOrder').value; p2pSendLobby(); p2pUpdateLobby(); });
    $('#p2pSaveConfig').addEventListener('click', () => {
      const raw = $('#p2pServerConfig').value.trim();
      try {
        if (raw) JSON.parse(raw);
        if (raw) localStorage.setItem('steeltide.peerConfig', raw); else localStorage.removeItem('steeltide.peerConfig');
        p2pStatus('联机设置已保存，重新连接后生效', 'good');
      } catch (e) { p2pStatus('设置不是合法 JSON', 'bad'); }
    });
    $('#p2pClearConfig').addEventListener('click', () => {
      localStorage.removeItem('steeltide.peerConfig'); $('#p2pServerConfig').value = '';
      p2pStatus('已恢复默认 PeerServer', 'good');
    });
  }

  function startNew(faction, difficulty, strategies, force) {
    ui.network = false; ui.net = null;
    ui.playerFaction = 'alliance';
    ui.playerForce = force || ui.playerForce || 'revolution';
    ui.difficulty = difficulty;
    ui.militiaMode = null;
    ui.navalBuild = null;
    ui.landBuild = null;
    ui.landingMode = null;
    ui.state = G.create({ playerFaction: 'alliance', difficulty, strategies, playerForce: ui.playerForce, mapId: ui.mapId, customMap: ui.mapId === 'custom' ? ui.customMap : null });
    ui.selectedUnitId = null;
    ui.selectedCityId = null;
    ui.undo = null;
    ui.started = true;
    clearSelection();
    Rnd.setState(ui.state);
    Rnd.clearFx();
    hideAllModals();
    $('#toast').innerHTML = '';
    $('#startScreen').classList.add('hidden');
    $('#btnAIStatus').classList.remove('hidden');
    Rnd.resize();
    Rnd.fit(true);
    refreshAll();
    maybeOpenLanding();
    maybeOpenMilitiaDeployment();
    banner('第 1 回合 · ' + G.forceData(ui.state, ui.state.current).short, ui.state.current);
    Au.play('turn');
    hint(ui.state.current === ui.playerFaction ? defaultHint() : '敌军行动中，请稍候…');
    autoSave();
    $('#btnAIStatus').classList.remove('hidden');
    showEnemyStrategyReveal(() => {
      if (ui.state.current !== ui.playerFaction) {
        ui.busy = true;
        updateHUD();
        runAI();
      }
    });
  }

  function continueSave() {
    let raw = null;
    try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { raw = null; }
    if (!raw) { toast('没有可用的存档', 'bad'); return; }
    const s = G.deserialize(raw);
    if (!s) { toast('存档损坏，无法读取', 'bad'); return; }
    ui.state = s;
    ui.playerFaction = s.playerFaction;
    ui.playerForce = s.forces ? s.forces[s.playerFaction] : 'revolution';
    ui.mapId = s.mapId || 'training';
    ui.customMap = s.customMap || ui.customMap || null;
    ui.difficulty = s.difficulty;
    ui.militiaMode = null;
    ui.navalBuild = null;
    ui.landBuild = null;
    ui.landingMode = null;
    ui.lastStrategies = s.strategies ? s.strategies[s.playerFaction] : null;
    ui.selectedUnitId = null;
    ui.selectedCityId = null;
    ui.undo = null;
    ui.busy = false;
    ui.started = true;
    clearSelection();
    Rnd.setState(s);
    Rnd.clearFx();
    hideAllModals();
    $('#toast').innerHTML = '';
    $('#startScreen').classList.add('hidden');
    $('#btnAIStatus').classList.remove('hidden');
    Rnd.resize();
    Rnd.fit(true);
    refreshAll();
    maybeOpenLanding();
    maybeOpenMilitiaDeployment();
    banner('第 ' + s.turn + ' 回合 · ' + G.forceData(s, s.current).short, s.current);
    hint(ui.militiaMode ? ('人海攻势：点击高亮地格部署民兵（剩余 ' + ui.militiaMode.remaining + '）') : '欢迎回来，指挥官。');
    if (s.over) { finishGame(); return; }
    if (s.current !== s.playerFaction) {
      ui.busy = true;
      updateHUD();
      runAI();
    }
  }

  function showStart() {
    hideAllModals();
    updateCustomMapCard();
    $('#btnAIStatus').classList.add('hidden');
    $('#startScreen').classList.remove('hidden');
    refreshSaveButton();
  }

  function refreshSaveButton() {
    let has = false;
    try { has = !!localStorage.getItem(SAVE_KEY); } catch (e) { has = false; }
    $('#btnContinue').disabled = !has;
  }

  /* ================= 刷新界面 ================= */
  function refreshAll() {
    if (!ui.state) return;
    if (ui.selectedUnitId && !findUnit(ui.selectedUnitId)) {
      ui.selectedUnitId = null;
      ui.reach = null;
      ui.targets = new Set();
    }
    Rnd.setState(ui.state);
    updateHUD();
    renderContext();
    renderLog();
  }

  function updateHUD() {
    const s = ui.state;
    if (!s) return;
    const cur = G.forceData(s, s.current);
    $('#hudFaction').textContent = cur.name;
    $('#hudFaction').style.color = cur.light || '#e6e0d2';
    const ais = (s.factions || ['empire']).filter(f => f !== s.playerFaction);
    $('#hudTurn').textContent = '第 ' + s.turn + (s.maxTurns ? ' / ' + s.maxTurns : '') + ' 回合';
    $('#hudPhase').textContent = s.over ? '战役结束' : (s.current === s.playerFaction ? '你的回合' : (ui.network && !s.aiFactions.includes(s.current) ? '对方回合' : 'AI 回合'));

    if (ais.length > 1) {
      $('#hudObjective').textContent = '目标：消灭全部 ' + ais.length + ' 个 AI';
    } else {
      const enemyCap = s.sites.find(c => c.capital && c.original === ais[0]);
      $('#hudObjective').textContent = '目标：攻占' + (enemyCap ? enemyCap.name : '敌方首都');
    }
    const st = G.strategyOf(s, s.playerFaction);
    const atk = D.STRATEGIES.attack[st.attack];
    const def = D.STRATEGIES.defense[st.defense];
    $('#hudStrategy').textContent = atk && def ? ('战术：' + atk.name + ' · ' + def.name) : '';

    const caps = G.capsOf(s, s.playerFaction);
    const used = G.usageOf(s, s.playerFaction);
    $('#resGold').textContent = s.money[s.playerFaction];
    const goldInc = G.incomeOf(s, s.playerFaction);
    $('#resGoldInc').textContent = '+' + goldInc.money + '/回合' +
      (goldInc.maintenance ? '（维护 -' + goldInc.maintenance + '）' : '');
    $('#resGoldInc').title = goldInc.maintenance
      ? '产出 ' + goldInc.grossMoney + ' 金，部队维护 -' + goldInc.maintenance + ' 金'
      : '当前无部队维护费';
    $('#resPop').textContent = used.pop + ' / ' + caps.pop;
    $('#resPopInc').textContent = '已占用 / 上限';
    $('#resInd').textContent = used.industry + ' / ' + caps.industry;
    $('#resIndInc').textContent = '已占用 / 上限';
    $('#resPop').classList.toggle('over', used.pop > caps.pop);
    $('#resInd').classList.toggle('over', used.industry > caps.industry);

    const btn = $('#btnEndTurn');
    btn.disabled = ui.busy || s.over || s.current !== s.playerFaction || !!ui.militiaMode || !!ui.navalBuild || !!ui.landBuild || !!ui.landingMode;
    $('.et-main').textContent = ui.busy ? '敌军行动中' : s.over ? '战役结束' : '结束回合';
    const idle = s.current === s.playerFaction ? s.units.filter(u =>
      u.faction === s.playerFaction && !(u.hasMoved && u.hasAttacked)).length : 0;
    $('.et-sub').textContent = ui.busy ? 'WAIT' : ui.state.over ? '' : (idle > 0 ? idle + ' 支部队可行动' : 'SPACE');
  }

  function renderLog() {
    const list = $('#logList');
    const s = ui.state;
    const prevTop = list.scrollTop;
    const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 28;
    const items = s.log.slice(-40);
    const frag = document.createDocumentFragment();
    for (const item of items) {
      const el = document.createElement('div');
      el.className = 'log-item ' + (item.kind || 'info');
      const t = document.createElement('em');
      t.textContent = 'T' + item.turn;
      el.appendChild(t);
      el.appendChild(document.createTextNode(item.text));
      frag.appendChild(el);
    }
    list.innerHTML = '';
    list.appendChild(frag);
    if (atBottom) list.scrollTop = list.scrollHeight;
    else list.scrollTop = prevTop;
  }

  /* ================= 选中与信息面板 ================= */
  function clearSelection() {
    ui.selectedUnitId = null;
    ui.selectedCityId = null;
    ui.reach = null;
    ui.targets = new Set();
    ui.undo = null;
    ui.swapMode = null;
    ui.airportMode = null;
    ui.fortMode = null;
    ui.supportMode = null;
    ui.transportMode = null;
    ui.guerrillaMode = null;
    Rnd.setView({
      reach: null, targets: new Set(), selectedUnit: null, path: null, selectedCityId: null,
      swapTargets: null, supportTiles: null, supportUnitId: null,
      airportTargets: null, airportTiles: null, fortTiles: null, supportTargets: null, navalTiles: null, landTiles: null, buildTiles: null, militiaTiles: null, landingTiles: null
    });
  }

  function deselect() {
    if (ui.busy) return;
    if (ui.militiaMode) { toast('请先部署完待部署的民兵', 'bad'); return; }
    if (ui.navalBuild) { toast('请先完成舰船部署', 'bad'); return; }
    if (ui.landBuild) { toast('请先完成生产部署', 'bad'); return; }
    if (ui.landingMode) { toast('请先选择突击快船的登陆位置', 'bad'); return; }
    clearSelection();
    renderContext();
    hint(defaultHint());
  }

  function defaultHint() {
    if (!ui.state) return '';
    if (ui.state.over) return '战役已结束。';
    if (ui.state.current !== ui.playerFaction) return '敌军行动中，请稍候…';
    if (ui.militiaMode) return (ui.militiaMode.source === 'capital' ? '首都民兵' : '人海攻势') + '：点击高亮地格部署民兵（剩余 ' + ui.militiaMode.remaining + '）';
    if (ui.navalBuild) return '舰船部署：点击高亮海域放置 ' + U[ui.navalBuild.type].name + '；Esc 取消';
    if (ui.landBuild) return '生产部署：点击高亮地格放置 ' + U[ui.landBuild.type].name + '；Esc 取消';
    if (ui.landingMode) return '突击快船沉没：点击高亮陆地格部署敢死队';
    return '拖动地图 · 滚轮缩放 · Tab 切换可行动部队 · 点击部队开始行动';
  }

  function selectUnit(u) {
    ui.selectedUnitId = u.id;
    ui.selectedCityId = null;
    ui.undo = null;
    ui.swapMode = null;
    ui.airportMode = null;
    ui.fortMode = null;
    ui.supportMode = null;
    ui.transportMode = null;
    ui.guerrillaMode = null;
    Rnd.setView({ swapTargets: null, airportTargets: null, airportTiles: null, fortTiles: null, supportTargets: null });
    syncSelection();
    renderContext();
    updateHoverHint();
    Au.play('click');
  }

  function selectCity(c) {
    ui.selectedUnitId = null;
    ui.selectedCityId = c.id;
    ui.reach = null;
    ui.targets = new Set();
    ui.airportMode = null;
    ui.fortMode = null;
    ui.supportMode = null;
    ui.transportMode = null;
    ui.guerrillaMode = null;
    Rnd.setView({ reach: null, targets: new Set(), selectedUnit: null, path: null, selectedCityId: c.id,
      airportTargets: null, airportTiles: null, fortTiles: null, supportTargets: null });
    renderContext();
    hint(c.kind === 'airport' && c.faction === ui.playerFaction && ui.state.current === ui.playerFaction
      ? '选择机场任务：无人机干扰 / 空降作战 / 无人机空袭 / 战术轰炸。'
      : (c.kind === 'airport' ? '机场可执行空中任务。' : (c.faction === ui.playerFaction && ui.state.current === ui.playerFaction
        ? '点击「生产」组建新的部队。' : '城市提供收入与防御加成。')));
    Au.play('click');
  }

  function syncSelection() {
    const s = ui.state;
    const u = findUnit(ui.selectedUnitId);
    if (!u) {
      ui.selectedUnitId = null;
      ui.reach = null;
      ui.targets = new Set();
      Rnd.setView({ reach: null, targets: new Set(), selectedUnit: null, path: null });
      return;
    }
    if (u.faction === s.playerFaction && s.current === s.playerFaction && !s.over && !u.jammed) {
      ui.reach = u.hasMoved ? null : R.reachable(s, u);
      ui.targets = new Set(R.attackTargets(s, u).map(t => t.id));
    } else {
      ui.reach = null;
      ui.targets = new Set();
    }
    const supTarget = u.supporting ? s.units.find(x => x.id === u.supportTargetId) : null;
    Rnd.setView({
      reach: ui.reach, targets: ui.targets, selectedUnit: u, path: null, selectedCityId: null,
      swapTargets: ui.swapMode ? ui.swapMode.targets : null,
      supportTiles: supTarget ? [{ q: supTarget.q, r: supTarget.r }] : null,
      supportUnitId: u.supporting ? u.id : null,
      supportTargets: null
    });
  }

  function updateHoverHint() {
    if (ui.landingMode) {
      hint('突击快船沉没：点击高亮陆地格部署敢死队');
      return;
    }
    if (ui.navalBuild) {
      hint('舰船部署：点击高亮海域放置 ' + U[ui.navalBuild.type].name + '；Esc 取消');
      return;
    }
    if (ui.landBuild) {
      hint('生产部署：点击高亮地格放置 ' + U[ui.landBuild.type].name + '；Esc 取消');
      return;
    }
    if (ui.militiaMode) {
      hint((ui.militiaMode.source === 'capital' ? '首都民兵' : '人海攻势') + '：点击高亮地格部署民兵（剩余 ' + ui.militiaMode.remaining + '）');
      return;
    }
    if (ui.supportMode) {
      hint('协同攻击：点击一个高亮敌军作为指定目标；Esc 取消');
      return;
    }
    if (ui.fortMode) {
      hint('构筑工事：点击高亮地格放置 ' + D.FORTS[ui.fortMode.type].name + '；Esc 取消');
      return;
    }
    if (ui.airportMode) {
      hint(ui.airportMode.mission === 'drop'
        ? '空降作战：点击范围内的高亮空地投放轻步兵；Esc 取消'
        : '点击高亮敌军执行任务；Esc 取消');
      return;
    }
    const u = findUnit(ui.selectedUnitId);
    if (!u) { hint(defaultHint()); return; }
    if (ui.swapMode) { hint('易位模式：点击高亮友军；Esc 取消'); return; }
    if (ui.state.current !== ui.playerFaction) { hint('敌军行动中，请稍候…'); return; }
    if (u.jammed) { hint('被无人机干扰：本回合无法移动、攻击或执行其他行动。'); return; }
    if (u.noMoveTurn === ui.state.turn) { hint('铁丝网 / 反坦克锥：本回合无法移动，仍可攻击。'); return; }
    if (U[u.type].immobile) {
      if (u.type === 'fort_gun' && u.noAttackTurn === ui.state.turn) hint('要塞炮冷却中：本回合无法攻击。');
      else if (ui.targets.size) hint('点击 2–3 格内的红框敌军，要塞炮开火。');
      else hint('要塞炮：无法移动，只能攻击 2–3 格内的敌人。');
      return;
    }
    if (u.supporting) { hint('协同中：友军攻击其指定目标时攻击 +1（可叠加），本回合不能再行动。'); return; }
    const taunted = R.tauntEnemies(ui.state, u).length > 0;
    if (taunted && !u.hasAttacked) hint('必须先攻击周围6格内的实验型机甲。');
    else if (u.hasAttacked) hint('该部队本回合行动完毕。');
    else if ((u.attacksMade || 0) > 0 && !u.hasAttacked) hint('已攻击 ' + u.attacksMade + '/' + G.attackLimit(ui.state, u) + ' · 可继续攻击。');
    else if (u.swapped) hint('已易位 · 本回合不能再移动，可继续攻击。');
    else if (u.hasMoved) hint('已移动 · 可攻击红框敌军或协同；不能再待命。');
    else if (ui.targets.size) hint('点击红框敌军攻击；或选择易位 / 协同 / 待命。');
    else hint('点击蓝色格子移动；也可易位、协同或待命。');
  }

  function displayStatText(u) {
    if (!u || !ui.state) return '';
    const s = ui.state;
    const e = G.effective(u, s);
    const t = G.tileAt(s, u.q, u.r);
    const atkTerrain = t && D.TERRAIN[t.t] ? (D.TERRAIN[t.t].atk || 0) : 0;
    const defTerrain = G.terrainDefense(s, u.q, u.r);
    const fs = R.frontlineStatus(s, u);
    const waitDef = u.waiting ? D.RULES.waitDefense : 0;
    const atk = Math.max(1, e.atk + atkTerrain + fs.atkMod);
    const def = Math.max(1, e.def + defTerrain + fs.defMod + waitDef);
    return atk + '-' + def + '-' + e.move + '-' + e.range;
  }

  function hpLabel(hp, max) {
    const pct = Math.max(0, Math.min(100, Math.round(hp / max * 100)));
    return { pct, text: Math.round(hp) + ' / ' + max };
  }

  function renderContext() {
    const box = $('#contextPanel');
    const s = ui.state;
    if (!s) return;
    const u = findUnit(ui.selectedUnitId);
    if (u) { box.innerHTML = unitCardHtml(u); bindContextActions(u); return; }
    if (ui.selectedCityId) {
      const c = s.sitesById[ui.selectedCityId];
      if (c) { box.innerHTML = cityCardHtml(c); bindContextActions(null, c); return; }
    }
    box.innerHTML = `<div class="ctx-empty"><div class="ctx-emblem">⌖</div>
      <p>选中一支部队，或点击城市查看详情。<br>滚轮缩放，拖动平移战场。</p></div>`;
  }

  function unitCardHtml(u) {
    const def = U[u.type];
    const fo = G.forceData(ui.state, u.faction);
    const badge = u.faction === ui.state.playerFaction ? 'blue' : (u.faction === 'neutral' ? 'gray' : 'red');
    const canAct = u.faction === ui.state.playerFaction && ui.state.current === ui.state.playerFaction && !ui.state.over && !u.jammed;
    const taunted = R.tauntEnemies(ui.state, u).length > 0;
    const partners = canAct ? R.swapPartners(ui.state, u) : [];
    const supRest = R.supportRestriction(ui.state, u);
    const uTile = G.tileAt(ui.state, u.q, u.r);
    const atWater = uTile && !uTile.bridge && (uTile.t === 'water' || uTile.t === 'river');
    const buttons = [];
    const siteHere = G.siteAt(ui.state, u.q, u.r);
    if (canAct && !taunted && ui.undo && ui.undo.unitId === u.id && !u.hasAttacked && !u.swapped && !(u.attacksMade || 0)) {
      buttons.push('<button class="btn" data-act="undo">撤销移动</button>');
    }
    if (canAct && !taunted && !def.immobile && !u.hasMoved && !u.hasAttacked && !u.supporting && !u.swapped && !(u.attacksMade || 0) && partners.length) {
      buttons.push('<button class="btn" data-act="swap">易位</button>');
    }
    if (canAct && !taunted && !def.immobile && !u.hasAttacked && !u.supporting && !u.swapped && !(u.attacksMade || 0) && supRest.ok) {
      buttons.push('<button class="btn" data-act="support">协同</button>');
    }
    if (canAct && !taunted && !def.immobile && !atWater && !u.hasMoved && !u.hasAttacked && !u.supporting && !u.swapped && !(u.attacksMade || 0)) {
      buttons.push('<button class="btn" data-act="wait">待机</button>');
    }
    if (canAct && !taunted && u.type === 'tachanka' && !u.hasAttacked && !u.supporting) {
      if (u.cargo) buttons.push('<button class="btn" data-act="transport-release">释放载员</button>');
      else if (G.transportTargets(ui.state, u).length) buttons.push('<button class="btn" data-act="transport-load">装载</button>');
    }
    if (canAct && !taunted && u.type === 'guerrilla' && G.canGuerrillaMilitia(ui.state, u).ok) {
      buttons.push('<button class="btn" data-act="guerrilla">生产民兵</button>');
    }
    if (canAct && !def.immobile && R.isFortBuilder(ui.state, u) &&
      !u.hasMoved && !u.hasAttacked && !u.supporting && !u.swapped && !(u.attacksMade || 0) && !taunted) {
      buttons.push('<button class="btn" data-act="fort">工 事</button>');
    }
    if (siteHere) buttons.push(`<button class="btn" data-act="city" data-city="${siteHere.id}">据点</button>`);
    if (!buttons.length) {
      if (def.immobile && canAct && !u.hasAttacked) {
        buttons.push(`<button class="btn" disabled>${u.noAttackTurn === ui.state.turn ? '冷却中' : (ui.targets.size ? '点击敌军开火' : '无目标')}</button>`);
      } else if (canAct && !u.hasAttacked && taunted) {
        buttons.push(`<button class="btn" disabled>${ui.targets.size ? '必须优先攻击实验型机甲' : '必须先接近实验型机甲'}</button>`);
      } else if (canAct && !u.hasAttacked && (u.attacksMade || 0) > 0) {
        buttons.push(`<button class="btn" disabled>${ui.targets.size ? '点击敌军再次开火' : '无可攻击目标'}</button>`);
      } else {
        buttons.push(`<button class="btn" disabled>${u.jammed ? '本回合被干扰' : '已结束行动'}</button>`);
      }
    }

    const maxHits = G.maxHits(u.type);
    const hitsTaken = u.hitsTaken || 0;
    const filledPips = Math.max(0, maxHits - hitsTaken);
    const pips = Array.from({ length: maxHits }, (_, i) =>
      `<i class="pip ${i < filledPips ? 'on' : 'off'}"></i>`).join('');
    const stateNote = def.fragile
      ? '命中即毁'
      : (hitsTaken >= maxHits - 1 ? '再中一击→击毁' : `可再受损 ${maxHits - 1 - hitsTaken} 次`);
    const supTarget = u.supporting ? ui.state.units.find(x => x.id === u.supportTargetId) : null;
    const actionTag = u.supporting
      ? (' · 协同：' + (supTarget ? U[supTarget.type].name : '目标已消失'))
      : ((u.attacksMade || 0) > 0 && !u.hasAttacked
        ? (' · 已攻击 ' + u.attacksMade + '/' + G.attackLimit(ui.state, u))
        : (u.swapped && !u.hasAttacked ? ' · 已易位' : (u.waiting ? ' · 待命' : '')));
    const fs = R.frontlineStatus(ui.state, u);
    const frontTag = fs.surrounded
      ? '<div class="frontline-tag surrounded">包围：攻击 −1 · 防御 −2</div>'
      : (fs.flanked ? '<div class="frontline-tag flanked">夹击：防御 −1</div>' : '');
    const waitTag = u.waiting ? '<div class="wait-tag">待命：防御 +1（不可叠加）</div>' : '';
    const traitTag = def.trait ? `<div class="trait-tag">${def.trait}</div>` : '';
    const uf = G.forceOf(ui.state, u.faction);
    let forceTag = '';
    if (uf === 'ironblood' && (u.type === 'armored_car' || u.type === 'tank')) {
      forceTag = '<div class="trait-tag">势力：攻击掷 2D6 取高</div>';
    } else if (u.type === 'rocket_artillery') {
      forceTag = '<div class="trait-tag">每回合可攻击 2 个不同目标</div>';
    } else if (u.type === 'sniper_team') {
      forceTag = '<div class="trait-tag">攻击非机械化步兵时 +1 攻击</div>';
    } else if (u.type === 'stormtrooper') {
      forceTag = '<div class="trait-tag">攻击有地形/据点/战壕防御加成的目标时 +1 攻击</div>';
    } else if (uf === 'northsea' && U[u.type].naval) {
      forceTag = '<div class="trait-tag">新部署舰船本回合可直接行动</div>';
    } else if (u.type === 'guard') {
      forceTag = '<div class="trait-tag">对装甲 / 舰船 / 要塞炮攻击 +1</div>';
    } else if (u.type === 'siege_howitzer') {
      forceTag = '<div class="trait-tag">射程 2–3，无法攻击 1 格目标</div>';
    } else if (uf === 'iris' && u.type === 'mech_inf') {
      forceTag = '<div class="trait-tag">鸢尾势力：机械化步兵可构筑工事</div>';
    } else if (uf === 'sunrise' && (u.type === 'light_inf' || u.type === 'suicide_squad')) {
      forceTag = '<div class="trait-tag">势力：每回合可攻击两次</div>';
    } else if (u.type === 'assault_boat') {
      forceTag = '<div class="trait-tag">沉没时可由玩家选择登陆敢死队</div>';
    } else if (u.type === 'experimental_mech') {
      forceTag = '<div class="trait-tag">周围6格敌军必须优先攻击；免疫夹击/包围惩罚</div>';
    } else if (u.type === 'infantry_column') {
      forceTag = '<div class="trait-tag">可承受两次受损；地形移动消耗 -1</div>';
    } else if (uf === 'eastland' && (u.type === 'militia' || u.type === 'light_inf')) {
      forceTag = '<div class="trait-tag">东陆：移动 +1' + (u.type === 'militia' ? '，防御 +1，无视地形移动消耗' : '') + '</div>';
    } else if (u.type === 'hover_tank') {
      forceTag = '<div class="trait-tag">无视丘陵/森林/河流消耗；不能进入山地/海洋</div>';
    } else if (u.type === 'tactical_carrier') {
      forceTag = '<div class="trait-tag">6 格远程打击；受损后无法移动</div>';
    }
    const catName = D.UNIT_CATEGORIES[def.category] ? D.UNIT_CATEGORIES[def.category].name : '未分类';
    const categoryTag = `<div class="trait-tag">分类：${catName}</div>`;
    const st = G.strategyOf(ui.state, u.faction);
    const atkStrat = st.attack ? D.STRATEGIES.attack[st.attack] : null;
    const defStrat = st.defense ? D.STRATEGIES.defense[st.defense] : null;
    const forceBonusTag = fo.bonus ? `<div class="trait-tag">势力加成：${fo.bonus}</div>` : '';
    const strategyTags = (atkStrat ? `<div class="trait-tag">进攻战略 · ${atkStrat.name}：${atkStrat.desc}</div>` : '') +
      (defStrat ? `<div class="trait-tag">防御战略 · ${defStrat.name}：${defStrat.desc}</div>` : '');
    const depthInfo = G.depthDefenseAt(ui.state, u.q, u.r, u.faction);
    const depthTag = depthInfo.value > 0
      ? `<div class="trait-tag">纵深防御：${depthInfo.site ? depthInfo.site.name + ' ' : ''}防御 +${depthInfo.value}</div>` : '';
    const jamTag = u.jammed ? '<div class="jam-tag">无人机干扰：本回合无法行动</div>' : '';
    const eff = G.effective(u, ui.state);
    const auraTag = eff.auraDef ? '<div class="trait-tag">督战：防御 +1</div>' : '';
    const guerrillaTag = eff.guerrillaDef ? '<div class="trait-tag">游击：村落防御 +1</div>' : '';
    const noMoveTag = (u.noMoveTurn && u.noMoveTurn >= ui.state.turn)
      ? `<div class="water-tag">${u.noMoveTurn === ui.state.turn ? '本回合无法移动' : '下回合无法移动'}（铁丝网 / 反坦克锥）</div>` : '';
    const coolTag = (u.type === 'fort_gun' && u.noAttackTurn === ui.state.turn)
      ? '<div class="water-tag">冷却：本回合无法攻击</div>' : '';
    const trenchTag = eff.trenchDef ? `<div class="trait-tag">战壕：防御 +${eff.trenchDef}</div>` : '';
    const immobileTag = def.immobile ? '<div class="wait-tag">固定炮台：无法移动，封锁所在格</div>' : '';
    const waterTag = eff.waterPenalty ? '<div class="water-tag">河滩 / 浅水：攻击、防御 −1（最低 1）</div>' : '';
    const stackList = G.unitsAt(ui.state, u.q, u.r);
    const stackTag = stackList.length > 1
      ? '<div class="stack-tag">同格叠放：' + (stackList.some(x => x.type === 'infantry_tank') ? '步兵坦克 + 步兵' : '陆军 + 舰船') + '</div>'
      : '';
    const cargoTag = u.cargo ? '<div class="trait-tag">搭载：' + U[u.cargo.type].name + '</div>' : '';

    return `
      <div class="unit-card-head">
        <div class="unit-badge" style="background:linear-gradient(160deg,${fo.color},${fo.dark})">${def.short}</div>
        <div class="unit-title">
          <h3>${def.name}</h3>
          <div class="sub">${fo.short} · ${catName} · ${def.role}${actionTag}</div>
        </div>
      </div>
      <div class="unit-state ${u.state}">
        <div class="pips">${pips}</div>
        <div class="state-text">${u.state === 'damaged' ? '受损' : '满编'}</div>
        <div class="state-note">${stateNote}</div>
      </div>
      <div class="stat-line"><span>攻-防-移-射（实际）</span><b>${displayStatText(u)}</b></div>
      ${frontTag}
      ${waitTag}
      ${auraTag}
      ${guerrillaTag}
      ${jamTag}
      ${waterTag}
      ${stackTag}${cargoTag}
      ${noMoveTag}
      ${coolTag}
      ${trenchTag}
      ${immobileTag}
      ${traitTag}
      ${categoryTag}
      ${forceBonusTag}
      ${strategyTags}
      ${depthTag}
      ${forceTag}
      <div class="unit-actions">${buttons.join('')}</div>`;
  }

  function airportCardHtml(c) {
    const owner = c.faction ? G.forceData(ui.state, c.faction) : null;
    const usedCount = c.airportUsedTurn === ui.state.turn ? (c.airportUsedCount || 0) : 0;
    const maxUses = G.airportMaxUses(ui.state, c.faction);
    const rangeBonus = G.airportRangeBonus(ui.state, c.faction);
    const garrison = G.unitAt(ui.state, c.q, c.r);
    const active = ui.airportMode && ui.airportMode.siteId === c.id;
    const missions = Object.values(R.AIRPORT_MISSIONS)
      .filter(m => !m.force || G.forceOf(ui.state, c.faction) === m.force)
      .map(m => {
      const st = R.airportStatus(ui.state, c, m.id);
      const why = st.ok ? '' : st.why;
      return `<button class="airport-mission" data-act="airport-task" data-city="${c.id}" data-mission="${m.id}" ${st.ok ? '' : 'disabled'} title="${why}">
        <span class="am-top"><b>${m.name}</b><em>◈ ${m.cost}</em></span>
        <span class="am-meta">射程 ${m.minRange}–${m.maxRange + rangeBonus} 格</span>
        <span class="am-desc">${m.desc}</span>
        ${st.ok ? '' : `<span class="am-why">${why}</span>`}
      </button>`;
    }).join('');
    return `
      <div class="city-head">
        <h3>${c.name}</h3>
        <div class="owner" style="color:${owner ? owner.light : '#cfcabb'}">
          ${owner ? owner.name : '中立'} · 机场 · 防御 +${G.siteDefense(c)}
        </div>
      </div>
      <div class="city-note">
        ${c.note || ''}<br>${usedCount >= maxUses ? '本回合已执行任务' : '本回合可执行 ' + (maxUses - usedCount) + ' 次任务'} · 本机场每回合上限 ${maxUses} 次
        ${garrison ? '<br>驻军：' + U[garrison.type].name + '（' + (garrison.state === 'damaged' ? '受损' : '满编') + '）' : '<br>当前无驻军。'}
      </div>
      <div class="airport-missions">${missions}</div>
      ${active ? '<div class="city-actions"><button class="btn" data-act="airport-cancel">取消任务选择</button></div>' : ''}`;
  }

  function startAirportMission(cityId, missionId) {
    const s = ui.state;
    if (!s) return;
    const c = s.sitesById[cityId];
    if (!c) return;
    const st = R.airportStatus(s, c, missionId);
    if (!st.ok) { toast(st.why, 'bad'); return; }
    const keys = st.targets.keys;
    ui.airportMode = { siteId: c.id, mission: missionId, keys: new Set(keys) };
    ui.selectedUnitId = null;
    ui.selectedCityId = c.id;
    ui.reach = null;
    ui.targets = new Set();
    ui.swapMode = null;
    Rnd.setView({
      reach: null, targets: new Set(), selectedUnit: null, path: null, selectedCityId: c.id,
      swapTargets: null, supportTiles: null, supportUnitId: null,
      airportTargets: missionId === 'drop' ? null : keys,
      airportTiles: (missionId === 'drop' || missionId === 'nuke') ? keys : null
    });
    renderContext();
    hint(missionId === 'drop'
      ? '空降作战：点击范围内的高亮空地投放轻步兵；Esc 取消'
      : missionId === 'nuke'
        ? '战术核打击：点击高亮目标格，注意周围友军也会受到伤害；Esc 取消'
        : '点击高亮敌军执行任务；Esc 取消');
    Au.play('click');
  }

  function cancelAirportMode() {
    if (!ui.airportMode) return;
    const cid = ui.airportMode.siteId;
    ui.airportMode = null;
    ui.fortMode = null;
    ui.supportMode = null;
    ui.transportMode = null;
    ui.guerrillaMode = null;
    Rnd.setView({ airportTargets: null, airportTiles: null, fortTiles: null });
    ui.selectedCityId = cid;
    renderContext();
    hint('已取消机场任务');
  }

  function executeAirportMission(q, r) {
    const mode = ui.airportMode;
    if (!mode) return;
    const s = ui.state;
    const c = s.sitesById[mode.siteId];
    if (!c) return;
    const res = R.useAirportMission(s, c, mode.mission, q, r);
    if (!res.ok) { toast(res.why, 'bad'); return; }
    ui.airportMode = null;
    ui.fortMode = null;
    ui.supportMode = null;
    ui.transportMode = null;
    ui.guerrillaMode = null;
    Rnd.setView({ airportTargets: null, airportTiles: null, fortTiles: null });
    ui.selectedCityId = res.kind === 'drop' ? null : c.id;
    if (res.kind === 'nuke') {
      Rnd.flash(q, r, 'rgba(255, 170, 120, 0.7)');
      Rnd.boom(q, r);
      Rnd.floatText(q, r, '核打击', '#ffd09a');
      Au.play('boom');
      toast('战术核打击：击毁 ' + res.killed + ' 个目标，另有 ' + res.hurt + ' 个单位受损', 'good');
      maybeOpenLanding();
    } else if (res.kind === 'jam') {
      Rnd.flash(q, r, 'rgba(140, 190, 255, 0.55)');
      Rnd.floatText(q, r, '干扰', '#a9c9e8');
      Au.play('click');
      toast('无人机干扰成功：目标下回合无法行动', 'good');
    } else if (res.kind === 'bomb') {
      Rnd.boom(q, r);
      Rnd.floatText(q, r, res.damage + ' 伤害', '#ff9c7d');
      Au.play('boom');
      toast((res.missionName || '空袭') + '：造成 ' + res.damage + ' 伤害' + (res.destroyed ? '，目标被击毁' : ''), 'good');
    } else if (res.kind === 'drop') {
      Rnd.flash(q, r, 'rgba(150, 220, 170, 0.55)');
      Rnd.floatText(q, r, '空降', '#b8e0a8');
      if (res.depth) Rnd.floatText(q, r, res.depth.damage + ' 伤害', '#ff9c7d');
      Au.play('capture');
      toast('空降完成：轻步兵已投放' + (res.captured ? '，占领 ' + res.captured.name : '') +
        (res.depth ? '；纵深防御造成 ' + res.depth.damage + ' 伤害' : ''), res.depth ? 'bad' : 'good');
    }
    refreshAll();
    if (res.kind === 'drop' && res.unit && !res.unitDestroyed) {
      ui.selectedUnitId = res.unit.id;
      ui.selectedCityId = null;
      syncSelection();
      renderContext();
    }
    if (s.over) setTimeout(finishGame, 650);
  }

  function cityCardHtml(c) {
    if (c.kind === 'airport') return airportCardHtml(c);
    const kind = SK[c.kind];
    const y = G.yieldOf(c);
    const owner = c.faction ? G.forceData(ui.state, c.faction) : null;
    const garrison = G.unitAt(ui.state, c.q, c.r);
    const canBuild = c.kind !== 'airport' && c.faction === ui.state.playerFaction &&
      ui.state.current === ui.state.playerFaction && !ui.state.over;
    const defBonus = G.siteDefense(c);
    return `
      <div class="city-head">
        <h3>${c.name}${c.capital ? ' · 首都' : ''}</h3>
        <div class="owner" style="color:${owner ? owner.light : '#cfcabb'}">
          ${owner ? owner.name : '中立'} · ${kind.name} · 防御 +${defBonus}
        </div>
      </div>
      <div class="city-income">
        <div><b>+${y.money}</b><span>金钱 / 回合</span></div>
        <div><b>${y.pop ? '+' + y.pop : '—'}</b><span>人力上限</span></div>
        <div><b>${y.industry ? '+' + y.industry : '—'}</b><span>工业上限</span></div>
      </div>
      <div class="city-note">
        ${c.note || ''}${garrison ? '<br>驻军：' + U[garrison.type].name + '（' + (garrison.state === 'damaged' ? '受损' : '满编') + '）' : '<br>当前无驻军。'}
        ${c.faction && G.hasStrategy(ui.state, c.faction, 'defense', 'defense_in_depth')
          ? `<br><span style="color:#e9d3a0">纵深防御：周围六格友军防御 +${defBonus}</span>` : ''}
      </div>
      <div class="city-actions">
        ${canBuild ? `<button class="btn primary" data-act="build" data-city="${c.id}">生 产</button>`
        : `<button class="btn" disabled>${c.kind === 'airport' ? '机场不生产' : (c.faction === ui.state.playerFaction ? '本回合不可生产' : '非己方据点')}</button>`}
        ${garrison && garrison.faction === ui.state.playerFaction ? `<button class="btn" data-act="garrison">查看驻军</button>` : ''}
      </div>`;
  }

  function bindContextActions(u, city) {
    document.querySelectorAll('#contextPanel [data-act]').forEach(btn => {
      const act = btn.dataset.act;
      if (act === 'undo') btn.addEventListener('click', undoMove);
      else if (act === 'wait') btn.addEventListener('click', () => waitUnit(u));
      else if (act === 'build') btn.addEventListener('click', () => openBuild(btn.dataset.city));
      else if (act === 'swap') btn.addEventListener('click', () => startSwap(u));
      else if (act === 'support') btn.addEventListener('click', () => doSupport(u));
      else if (act === 'transport-load') btn.addEventListener('click', () => startTransportLoad(u));
      else if (act === 'transport-release') btn.addEventListener('click', () => startTransportRelease(u));
      else if (act === 'guerrilla') btn.addEventListener('click', () => startGuerrillaMilitia(u));
      else if (act === 'city') btn.addEventListener('click', () => {
        const c = ui.state.sitesById[btn.dataset.city];
        if (c) selectCity(c);
      });
      else if (act === 'garrison') btn.addEventListener('click', () => {
        const gu = G.unitAt(ui.state, city.q, city.r);
        if (gu) selectUnit(gu);
      });
      else if (act === 'fort') btn.addEventListener('click', () => openFortBuilder(u));
      else if (act === 'airport-task') btn.addEventListener('click', () => {
        startAirportMission(btn.dataset.city, btn.dataset.mission);
      });
      else if (act === 'airport-cancel') btn.addEventListener('click', cancelAirportMode);
    });
  }

  /* ================= 交互 ================= */
  function updateHover(px, py, clientX, clientY) {
    if (!ui.state) return;
    const hx = Rnd.screenToHex(px, py);
    const tile = G.tileAt(ui.state, hx.q, hx.r);
    if (!tile) {
      Rnd.setHover(null, null);
      hideTooltip();
      return;
    }
    Rnd.setHover(hx.q, hx.r);
    ui.hover = hx;

    // 路径预览
    const su = findUnit(ui.selectedUnitId);
    if (su && ui.reach && su.faction === ui.state.playerFaction) {
      const node = ui.reach.get(key(hx.q, hx.r));
      if (node && !node.blocked && node.cost > 0) {
        Rnd.setView({ path: R.pathTo(ui.reach, hx.q, hx.r) });
      } else {
        Rnd.setView({ path: null });
      }
    } else {
      Rnd.setView({ path: null });
    }

    showTooltip(clientX, clientY, tile, hx);
  }

  function showTooltip(cx, cy, tile, hx) {
    const tip = $('#tooltip');
    const s = ui.state;
    let html = '';
    const site = tile.siteId ? s.sitesById[tile.siteId] : null;
    const unit = G.unitAt(s, hx.q, hx.r);
    const fort = G.fortAt(s, hx.q, hx.r);
    const depthForTile = G.depthDefenseAt(s, hx.q, hx.r, unit ? unit.faction : s.playerFaction);
    const terr = tile.bridge ? { name: '桥梁', cost: 1, def: 0 } : T[tile.t];

    if (unit) {
      const fo = G.forceData(ui.state, unit.faction), def = U[unit.type];
      const eff = G.effective(unit, ui.state);
      html += `<b>${fo.short} · ${def.name}</b> · ${unit.state === 'damaged' ? '受损' : '满编'}` +
        `<br><span class="tt-sub">攻-防-移-射 ${displayStatText(unit)}（含地形/战线/光环修正）</span>`;
      if (eff.waterPenalty) html += `<br><span class="tt-sub" style="color:#d8b06a">河滩 / 浅水：攻击、防御 −1（最低 1）</span>`;
      if (eff.trenchDef) html += `<br><span class="tt-sub" style="color:#b8c9a6">战壕：防御 +1</span>`;
      if (eff.depthDef) html += `<br><span class="tt-sub" style="color:#e9d3a0">纵深防御：${depthForTile.site ? depthForTile.site.name + ' ' : ''}防御 +${eff.depthDef}</span>`;
      if (unit.noMoveTurn === s.turn) html += `<br><span class="tt-sub" style="color:#d8b06a">本回合无法移动</span>`;
      if (unit.type === 'fort_gun' && unit.noAttackTurn === s.turn) html += `<br><span class="tt-sub" style="color:#d8b06a">冷却：本回合无法攻击</span>`;
      if (fort) html += `<br><span class="tt-sub" style="color:#e9d3a0">工事：${D.FORTS[fort.type].name}</span>`;
      if (G.unitsAt(s, unit.q, unit.r).length > 1) html += `<br><span class="tt-sub" style="color:#a9c9e8">同格叠放：陆军 + 舰船</span>`;
      if (def.trait) html += `<br><span class="tt-sub" style="color:#a9c9e8">${def.trait}</span>`;
      const fs = R.frontlineStatus(s, unit);
      if (fs.surrounded) html += `<br><span class="tt-sub" style="color:#e0a094">包围：攻击 −1 · 防御 −2</span>`;
      else if (fs.flanked) html += `<br><span class="tt-sub" style="color:#d8b06a">夹击：防御 −1</span>`;
      if (unit.waiting) html += `<br><span class="tt-sub" style="color:#a9c9e8">待命：防御 +1</span>`;
      const su = findUnit(ui.selectedUnitId);
      if (su && su.faction !== unit.faction && su.faction === s.playerFaction &&
        H.distance(su.q, su.r, unit.q, unit.r) >= G.effective(su, ui.state).minRange &&
        H.distance(su.q, su.r, unit.q, unit.r) <= G.effective(su, ui.state).range) {
        const fc = R.combatForecast(s, su, unit);
        const fmtNeed = n => n <= 1 ? '自动命中' : n > 6 ? '无法命中' : '掷 ' + n + '+';
        const mods = [];
        if (fc.flank) mods.push('侧翼 +' + fc.flank);
        if (fc.support) mods.push('协同 +' + fc.support);
        if (fc.atkTerrain) mods.push('地形攻 +' + fc.atkTerrain);
        if (fc.atkStatus && fc.atkStatus.atkMod) mods.push('攻方被围 ' + fc.atkStatus.atkMod);
        if (fc.defStatus && fc.defStatus.defMod) mods.push((fc.defStatus.surrounded ? '守方被围 ' : '守方侧翼 ') + fc.defStatus.defMod);
        if (fc.defWait) mods.push('守方待命 +1防');
        html += `<br><span class="tt-sub">攻 ${fc.atkTotal} + 1D6 ≥ 防 ${fc.defTotal} · ${fmtNeed(fc.need)}（${Math.round(fc.p * 100)}%）` +
          (mods.length ? ' · ' + mods.join(' ') : '') +
          (fc.counterNeed != null
            ? ` · 反击 ${fmtNeed(fc.counterNeed)}（${Math.round(fc.counterP * 100)}%，守方存活时）`
            : ' · 无反击') +
          (fc.lethal > 0 ? ' · 可击毁' : '') + `</span>`;
      }
    } else if (site) {
      const y = G.yieldOf(site);
      html += `<b>${site.name}</b> · ${site.faction ? G.forceData(ui.state, site.faction).short : '中立'}<br>` +
        `${SK[site.kind].name} · 防御 +${G.siteDefense(site)}` +
        (G.hasStrategy(s, site.faction, 'defense', 'defense_in_depth')
          ? `<br><span class="tt-sub" style="color:#e9d3a0">纵深防御：周围6格友军 +${G.siteDefense(site)}</span>` : '') +
        `<br>` +
        `<span class="tt-sub">产出 +${y.money} 金${y.pop ? ' · +' + y.pop + ' 人力' : ''}${y.industry ? ' · +' + y.industry + ' 工业' : ''}</span>`;
    } else if (fort) {
      const fd = D.FORTS[fort.type];
      html += `<b>${fd.name}</b><br><span class="tt-sub">${fd.desc}</span>` +
        `<br><span class="tt-sub">${terr.name} · 移动消耗 ${terr.cost}</span>`;
    } else {
      html += `<b>${terr.name}</b><br><span class="tt-sub">移动消耗 ${terr.cost} · 防御 +${terr.def}</span>`;
      if (terr.noVehicle) html += `<br><span class="tt-sub">装甲车辆无法进入</span>`;
      if (depthForTile.value > 0) html += `<br><span class="tt-sub" style="color:#e9d3a0">纵深防御：邻接${depthForTile.site ? depthForTile.site.name : '我方据点'}，防御 +${depthForTile.value}</span>`;
    }

    tip.innerHTML = html;
    tip.classList.remove('hidden');
    const r = tip.getBoundingClientRect();
    let x = cx + 18, y = cy + 16;
    if (x + r.width > window.innerWidth - 10) x = cx - r.width - 14;
    if (y + r.height > window.innerHeight - 10) y = cy - r.height - 12;
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  }

  function hideTooltip() { $('#tooltip').classList.add('hidden'); }

  function handleClick(px, py) {
    const s = ui.state;
    if (!s || s.over) return;
    if (ui.busy) return;
    if (ui.landingMode) {
      const h = Rnd.screenToHex(px, py);
      if (ui.landingMode.keys.has(H.key(h.q, h.r))) placeLanding(h.q, h.r);
      else toast('请选择高亮陆地格部署敢死队', 'bad');
      return;
    }
    if (ui.militiaMode) {
      const h = Rnd.screenToHex(px, py);
      if (ui.militiaMode.tiles.has(H.key(h.q, h.r))) deployMilitia(h.q, h.r);
      else toast('请选择高亮地格部署民兵', 'bad');
      return;
    }
    if (s.current !== s.playerFaction) { toast('现在是敌军回合', 'bad'); return; }

    if (ui.navalBuild) {
      const nh = Rnd.screenToHex(px, py);
      if (ui.navalBuild.tiles.has(H.key(nh.q, nh.r))) finishNavalBuild(nh.q, nh.r);
      else toast('请选择高亮海域部署舰船', 'bad');
      return;
    }
    if (ui.landBuild) {
      const lh = Rnd.screenToHex(px, py);
      if (ui.landBuild.tiles.has(H.key(lh.q, lh.r))) finishLandBuild(lh.q, lh.r);
      else toast('请选择高亮地格部署单位', 'bad');
      return;
    }
    if (ui.supportMode) {
      const sh = Rnd.screenToHex(px, py);
      const target = G.unitsAt(s, sh.q, sh.r).find(x => ui.supportMode.targets.has(x.id));
      if (target) executeSupport(target);
      else { cancelSupport(); toast('未选择有效目标', 'bad'); }
      return;
    }
    if (ui.fortMode) {
      const fh = Rnd.screenToHex(px, py);
      if (ui.fortMode.keys.has(H.key(fh.q, fh.r))) executeFortPlacement(fh.q, fh.r);
      else toast('该地格不能修建此工事', 'bad');
      return;
    }
    if (ui.airportMode) {
      const ah = Rnd.screenToHex(px, py);
      if (ui.airportMode.keys.has(H.key(ah.q, ah.r))) executeAirportMission(ah.q, ah.r);
      else toast('目标不在任务范围内', 'bad');
      return;
    }

    const hx = Rnd.screenToHex(px, py);
    const tile = G.tileAt(s, hx.q, hx.r);
    if (!tile) { deselect(); return; }
    const clickedUnits = G.unitsAt(s, hx.q, hx.r);
    const clickedUnit = clickedUnits.length ? (clickedUnits.find(x => x.id !== ui.selectedUnitId) || clickedUnits[0]) : null;
    if (ui.guerrillaMode) {
      if (ui.guerrillaMode.keys.has(H.key(hx.q, hx.r))) executeGuerrillaMilitia(hx.q, hx.r);
      else { ui.guerrillaMode = null; Rnd.setView({ militiaTiles: null }); refreshAll(); hint('已取消生产民兵'); }
      return;
    }
    if (ui.transportMode && ui.transportMode.type === 'load') {
      const p = clickedUnits.find(x => ui.transportMode.ids.has(x.id));
      if (p) executeTransportLoad(p);
      else { ui.transportMode = null; Rnd.setView({ supportTargets: null }); refreshAll(); hint('已取消装载'); }
      return;
    }
    if (ui.transportMode && ui.transportMode.type === 'release') {
      if (ui.transportMode.keys.has(H.key(hx.q, hx.r))) executeTransportRelease(hx.q, hx.r);
      else toast('只能释放在高亮地格', 'bad');
      return;
    }
    if (ui.swapMode) {
      const partner = clickedUnits.find(x => ui.swapMode.targets.has(x.id));
      if (partner) {
        const a = findUnit(ui.swapMode.unitId);
        doSwap(a, partner);
      } else {
        ui.swapMode = null;
        Rnd.setView({ swapTargets: null });
        syncSelection();
        renderContext();
        hint('已取消易位');
      }
      return;
    }
    const su = findUnit(ui.selectedUnitId);

    if (su) {
      const target = clickedUnits.find(x => x.faction !== s.playerFaction && ui.targets.has(x.id));
      if (target) {
        doAttack(su, target);
        return;
      }
      const node = ui.reach ? ui.reach.get(key(hx.q, hx.r)) : null;
      if (node && !node.blocked && node.cost > 0 && clickedUnits.every(x => x.faction === s.playerFaction)) {
        doMove(su, hx.q, hx.r);
        return;
      }
    }

    if (clickedUnits.length) {
      let pick = clickedUnits[0];
      if (clickedUnits.length > 1) {
        const idx = clickedUnits.findIndex(x => x.id === ui.selectedUnitId);
        if (idx >= 0) pick = clickedUnits[(idx + 1) % clickedUnits.length];
      }
      selectUnit(pick);
      return;
    }
    const site = tile.siteId ? s.sitesById[tile.siteId] : null;
    if (site) { selectCity(site); return; }
    const depthInfo = G.depthDefenseAt(s, hx.q, hx.r, s.playerFaction);
    deselect();
    if (depthInfo.value > 0) {
      hint(`纵深防御：${depthInfo.site ? depthInfo.site.name : '我方据点'} 使周围六格防御 +${depthInfo.value}。`);
      toast(`纵深防御：该地格防御 +${depthInfo.value}`, 'good');
    }
  }

  function doMove(u, q, r) {
    const s = ui.state;
    const from = { q: u.q, r: u.r };
    const res = R.moveUnit(s, u, q, r, ui.reach);
    if (!res.ok) { toast(res.why || '无法移动', 'bad'); return; }

    Rnd.animateUnit(u, from.q, from.r, 260);
    Au.play('move');
    ui.undo = (res.fort || res.depth || res.exhausted) ? null : { unitId: u.id, q: from.q, r: from.r };
    ui.selectedUnitId = res.destroyed ? null : u.id;

    if (res.fort) {
      const fr = res.fort;
      if (fr.kind === 'mine') {
        Rnd.boom(q, r);
        Rnd.floatText(q, r, fr.damage + ' 伤害', '#ff9c7d');
        toast('触雷：造成 ' + fr.damage + ' 伤害' + (fr.destroyed ? '，部队被击毁' : ''), 'bad');
      } else if (fr.kind === 'wire') {
        Rnd.floatText(q, r, '受阻', '#e9d3a0');
        toast('被' + (fr.fort.type === 'wire' ? '铁丝网' : '反坦克锥') + '阻挡：下回合无法移动', 'bad');
      } else if (fr.kind === 'removed') {
        toast('敌方工事被摧毁', 'good');
      }
    }

    if (res.depth) {
      Rnd.floatText(q, r, res.depth.damage + ' 伤害', '#ff9c7d');
      Au.play('boom');
      toast('纵深防御：占领据点时受到 ' + res.depth.damage + ' 伤害' + (res.depth.destroyed ? '，部队被击毁' : ''), 'bad');
    }
    if (res.captured) {
      const c = res.captured;
      Rnd.flash(c.q, c.r, 'rgba(240,210,140,0.55)');
      Rnd.floatText(c.q, c.r, '占领 ' + c.name, '#ffe6b0');
      Au.play('capture');
      toast((c.faction === s.playerFaction ? '夺回 ' : '占领 ') + c.name, 'good');
    } else if (!res.fort && !res.depth) {
      toast(U[u.type].name + (res.exhausted ? ' 移动完毕：无可攻击目标，行动结束' : ' 移动完毕'));
    }

    syncSelection();
    refreshAll();
    updateHoverHint();
    maybeOpenLanding();

    if (s.over) { setTimeout(finishGame, 500); }
  }

  function doAttack(attacker, defender) {
    const s = ui.state;
    const aq = attacker.q, ar = attacker.r, dq = defender.q, dr = defender.r;
    const res = R.resolveAttack(s, attacker, defender);
    Au.play('attack');
    Rnd.tracer(aq, ar, dq, dr);
    setTimeout(() => {
      if (res.hit) Rnd.boom(dq, dr);
      if (res.counterHit) Rnd.boom(aq, ar);
    }, 90);
    Rnd.floatText(dq, dr, res.hit ? (res.defenderDestroyed ? '击毁' : '受损') : '未命中',
      res.hit ? '#ff9c7d' : '#cfd6df');
    if (res.counterHit) Rnd.floatText(aq, ar, res.attackerDestroyed ? '被毁' : '受损', '#ffcf8a');
    else if (res.counterNeed != null) Rnd.floatText(aq, ar, '反击未中', '#cfd6df');
    if (res.defenderDestroyed || res.attackerDestroyed) setTimeout(() => Au.play('boom'), 120);

    ui.undo = null;
    ui.selectedUnitId = res.attackerDestroyed ? null : attacker.id;
    syncSelection();
    refreshAll();
    updateHoverHint();
    maybeOpenLanding();

    if (s.over) { setTimeout(finishGame, 650); return; }
    const needTxt = res.need <= 1 ? '自动命中' : res.need > 6 ? '需 7+（不可能）' : '需 ' + res.need + '+';
    const counterTxt = res.counterNeed != null
      ? (res.counterHit ? '；守方反击命中' : '；守方反击未命中')
      : '';
    if (!res.hit) toast(`掷出 ${res.roll}，${needTxt} · 未命中${counterTxt}`);
    else if (res.defenderDestroyed) toast(`掷出 ${res.roll}（${needTxt}）· 击毁 ${G.forceData(ui.state, res.defenderFaction).short} ${U[res.defenderType].name}；守方无法反击`, 'good');
    else toast(`掷出 ${res.roll}（${needTxt}）· 命中，敌部受损${counterTxt}`);
  }

  function waitUnit(u) {
    if (!u) return;
    const res = R.waitUnit(ui.state, u);
    if (!res.ok) { toast(res.why, 'bad'); return; }
    ui.undo = null;
    ui.swapMode = null;
    ui.selectedUnitId = null;
    Rnd.setView({ swapTargets: null, supportTiles: null, supportUnitId: null });
    deselect();
    refreshAll();
    toast('待命：防御 +1（不可叠加），持续到该单位下回合开始', 'good');
  }

  /* ---------- 易位 ---------- */
  function startSwap(u) {
    const s = ui.state;
    if (!s || !u) return;
    const partners = R.swapPartners(s, u);
    if (!partners.length) { toast('没有满足条件的友军（双方移动力都要够到对方位置）', 'bad'); return; }
    ui.swapMode = { unitId: u.id, targets: new Set(partners.map(p => p.id)) };
    ui.reach = null;
    ui.targets = new Set();
    Rnd.setView({ swapTargets: ui.swapMode.targets, reach: null, targets: new Set(), path: null });
    hint('选择一支友军易位：双方移动力都必须足够到达对方位置；Esc 取消');
    toast('易位模式：点击高亮友军');
    Au.play('click');
  }

  function doSwap(a, b) {
    const s = ui.state;
    if (!a || !b) return;
    const beforeA = { q: a.q, r: a.r };
    const beforeB = { q: b.q, r: b.r };
    const res = R.swapUnits(s, a, b);
    if (!res.ok) { toast(res.why, 'bad'); return; }
    Rnd.animateUnit(a, beforeA.q, beforeA.r, 260);
    Rnd.animateUnit(b, beforeB.q, beforeB.r, 260);
    Au.play('move');
    ui.swapMode = null;
    ui.undo = null;
    ui.selectedUnitId = a.id;
    Rnd.setView({ swapTargets: null });
    syncSelection();
    refreshAll();
    updateHoverHint();
    toast('易位完成：双方本回合不能再移动，但仍可攻击');
  }

  /* ---------- 游击队生产民兵 ---------- */
  function startGuerrillaMilitia(u) {
    const chk = G.canGuerrillaMilitia(ui.state, u);
    if (!chk.ok) { toast(chk.why, 'bad'); return; }
    const keys = new Set(G.guerrillaMilitiaTargets(ui.state, u).map(t => H.key(t.q, t.r)));
    ui.guerrillaMode = { unitId: u.id, keys };
    ui.supportMode = null; ui.swapMode = null; ui.undo = null; ui.transportMode = null;
    refreshAll();
    Rnd.setView({ militiaTiles: keys, supportTargets: null, reach: null, targets: new Set() });
    hint('游击队生产民兵：花费 ' + chk.cost + ' 金，点击周围相邻6格内高亮地格部署');
  }

  function executeGuerrillaMilitia(q, r) {
    const mode = ui.guerrillaMode;
    if (!mode) return;
    const u = findUnit(mode.unitId);
    if (!u) { ui.guerrillaMode = null; return; }
    const res = G.spawnGuerrillaMilitia(ui.state, u, q, r);
    if (!res.ok) { toast(res.why, 'bad'); return; }
    ui.guerrillaMode = null;
    clearSelection();
    refreshAll();
    Rnd.setView({ militiaTiles: null });
    hint('民兵已在游击队附近部署。');
  }

  /* ---------- 搭枪卡装载/释放 ---------- */
  function startTransportLoad(u) {
    const targets = G.transportTargets(ui.state, u);
    if (!targets.length) { toast('周围相邻6格内没有可装载单位', 'bad'); return; }
    ui.transportMode = { type: 'load', transportId: u.id, ids: new Set(targets.map(x => x.id)) };
    ui.supportMode = null; ui.swapMode = null; ui.undo = null;
    refreshAll();
    Rnd.setView({ supportTargets: ui.transportMode.ids, reach: null, targets: new Set(), landTiles: null });
    hint('装载：点击周围相邻6格内高亮的民兵/轻步兵/动员兵');
  }

  function startTransportRelease(u) {
    if (!u.cargo) { toast('没有搭载单位', 'bad'); return; }
    const keys = new Set();
    for (const n of H.neighbors(u.q, u.r)) {
      const t = G.tileAt(ui.state, n.q, n.r);
      if (!t || t.t === 'water' || t.t === 'river' || !D.TERRAIN[t.t].pass) continue;
      if (G.unitAt(ui.state, n.q, n.r) || G.fortAt(ui.state, n.q, n.r)) continue;
      keys.add(H.key(n.q, n.r));
    }
    ui.transportMode = { type: 'release', transportId: u.id, keys };
    ui.supportMode = null; ui.swapMode = null; ui.undo = null;
    refreshAll();
    Rnd.setView({ militiaTiles: keys, supportTargets: null, reach: null, targets: new Set() });
    hint('释放载员：点击周围相邻6格内高亮地格');
  }

  function executeTransportLoad(passenger) {
    const mode = ui.transportMode;
    if (!mode || mode.type !== 'load') return;
    const t = findUnit(mode.transportId);
    if (!t) { ui.transportMode = null; return; }
    const res = G.loadTransport(ui.state, t, passenger);
    if (!res.ok) { toast(res.why, 'bad'); return; }
    ui.transportMode = null;
    ui.guerrillaMode = null;
    clearSelection();
    refreshAll();
    Rnd.setView({ supportTargets: null, landTiles: null });
    hint('已装载。搭枪卡攻击/防御+1，载员被保护。');
  }

  function executeTransportRelease(q, r) {
    const mode = ui.transportMode;
    if (!mode || mode.type !== 'release') return;
    const t = findUnit(mode.transportId);
    if (!t) { ui.transportMode = null; return; }
    const res = G.releaseTransport(ui.state, t, q, r);
    if (!res.ok) { toast(res.why, 'bad'); return; }
    ui.transportMode = null;
    ui.guerrillaMode = null;
    clearSelection();
    refreshAll();
    Rnd.setView({ militiaTiles: null, supportTargets: null });
    hint('已释放载员。');
  }

  /* ---------- 协同攻击：指定一个敌方目标 ---------- */
  function doSupport(u) {
    const s = ui.state;
    if (!s || !u) return;
    const sup = R.supportRestriction(s, u);
    if (!sup.ok) { toast(sup.why, 'bad'); return; }
    const targets = R.attackTargets(s, u);
    if (!targets.length) { toast('协同范围内没有敌方目标', 'bad'); return; }
    ui.supportMode = { unitId: u.id, targets: new Set(targets.map(t => t.id)) };
    ui.swapMode = null;
    ui.undo = null;
    ui.reach = null;
    ui.targets = new Set();
    ui.selectedUnitId = u.id;
    Rnd.setView({
      swapTargets: null, reach: null, targets: new Set(), supportTiles: null, supportUnitId: null,
      supportTargets: ui.supportMode.targets
    });
    hint('协同攻击：点击一个高亮敌军作为指定目标；Esc 取消');
    toast('协同攻击：选择要标记的敌方单位');
    Au.play('click');
  }

  function executeSupport(target) {
    const mode = ui.supportMode;
    if (!mode || !target) return;
    const u = findUnit(mode.unitId);
    if (!u) { ui.supportMode = null; return; }
    const res = R.supportUnit(ui.state, u, target);
    if (!res.ok) { toast(res.why, 'bad'); return; }
    ui.supportMode = null;
    ui.swapMode = null;
    ui.undo = null;
    ui.selectedUnitId = u.id;
    Rnd.setView({ supportTargets: null });
    syncSelection();
    refreshAll();
    updateHoverHint();
    toast('协同攻击：友军攻击 ' + U[target.type].name + ' 时 +' + D.RULES.supportBonus + '（每名协同单位每回合生效一次）', 'good');
  }

  function cancelSupport() {
    if (!ui.supportMode) return;
    ui.supportMode = null;
    Rnd.setView({ supportTargets: null });
    renderContext();
    hint('已取消协同攻击');
  }

  function tilesInRange(state, unit) {
    const eff = G.effective(unit, ui.state);
    const out = [];
    for (const t of Object.values(state.grid)) {
      const d = H.distance(unit.q, unit.r, t.q, t.r);
      if (d >= eff.minRange && d <= eff.range) out.push({ q: t.q, r: t.r });
    }
    return out;
  }

  function cycleIdleUnit() {
    const s = ui.state;
    if (!s || ui.busy || s.over || s.current !== s.playerFaction || ui.militiaMode || ui.navalBuild || ui.landBuild || ui.landingMode) return;
    const idle = s.units.filter(u => u.faction === s.playerFaction && !(u.hasMoved && u.hasAttacked));
    if (!idle.length) { toast('所有部队都已行动，可以结束回合了'); return; }
    const idx = idle.findIndex(u => u.id === ui.selectedUnitId);
    const next = idle[(idx + 1) % idle.length];
    selectUnit(next);
    Rnd.centerOn(next.q, next.r);
  }

  function undoMove() {
    const s = ui.state;
    if (!ui.undo) return;
    const u = findUnit(ui.undo.unitId);
    if (!u || u.hasAttacked || s.current !== s.playerFaction) { toast('无法撤销', 'bad'); return; }
    u.q = ui.undo.q; u.r = ui.undo.r;
    u.hasMoved = false;
    ui.selectedUnitId = u.id;
    ui.undo = null;
    syncSelection();
    refreshAll();
    updateHoverHint();
    Au.play('click');
    toast('已撤销移动');
  }

  /* ================= 生产 ================= */
  function openBuild(cityId) {
    const s = ui.state;
    const city = s.sitesById[cityId];
    if (!city || city.faction !== s.playerFaction || s.current !== s.playerFaction) { toast('只能在己方回合生产', 'bad'); return; }
    ui.buildCityId = cityId;
    const free = G.freeCapacity(s, city);
    $('#buildTitle').textContent = city.name + ' · 生产';
    $('#buildCityInfo').innerHTML =
      `${SK[city.kind].name} · 本回合${city.capital ? (city.builtTurn === s.turn ? '已生产 ' + (city.builtCount || 0) + '/2' : '可生产 0/2') : (city.builtTurn === s.turn ? '已生产' : '可生产')} · ` +
      `可用人力 ${free.pop} / 工业 ${free.industry} · 金钱 ${free.money}`;
    renderBuildList();
    showModal('buildModal');
    Au.play('click');
  }

  function renderBuildList() {
    const s = ui.state;
    const city = s.sitesById[ui.buildCityId];
    const box = $('#buildList');
    if (!city) return;
    box.innerHTML = '';
    const free = G.freeCapacity(s, city);
    for (const type of G.buildOrder(s, city.faction)) {
      const def = U[type];
      const chk = G.canBuild(s, city, type);
      const btn = document.createElement('button');
      btn.className = 'build-card';
      btn.disabled = !chk.ok;
      const cost = G.costOf(s, type, city.faction);
      const noMoney = free.money < cost.money;
      const noPop = free.pop < cost.pop;
      const noInd = free.industry < cost.industry;
      const deployNames = (def.deploy || []).map(k => SK[k].name).join('/');
      const catName = D.UNIT_CATEGORIES[def.category] ? D.UNIT_CATEGORIES[def.category].name : '未分类';
      btn.innerHTML = `
        <div class="bc-name"><span>${def.name}</span><span class="bc-short">${def.short}</span></div>
        <div class="bc-role">${catName} · ${def.role}${def.naval ? ' · 水域' : ''}</div>
        ${def.trait ? `<div class="bc-trait">${def.trait}</div>` : ''}
        <div class="bc-stats"><span>攻-防-移-射 <b>${def.stat}</b></span></div>
        <div class="bc-deploy">部署：${deployNames}</div>
        <div class="bc-cost">
          <span class="${noMoney ? 'no' : ''}">◈ ${cost.money}</span>
          <span class="${noPop ? 'no' : ''}">人 ${cost.pop}</span>
          <span class="${noInd ? 'no' : ''}">工 ${cost.industry}</span>
        </div>`;
      btn.title = (!chk.ok ? chk.why + ' · ' : '') + def.desc;
      btn.addEventListener('click', () => buildAt(city, type));
      box.appendChild(btn);
    }
    $('#buildRes').textContent =
      `可用：◈ ${free.money} 金 · 人力 ${free.pop} · 工业 ${free.industry}`;
  }

  function startNavalBuild(city, type) {
    const s = ui.state;
    const tiles = G.navalDeployTiles(s, city, type);
    if (!tiles.length) { toast('港口附近没有可部署海域', 'bad'); return; }
    ui.navalBuild = { cityId: city.id, type, tiles: new Set(tiles.map(t => H.key(t.q, t.r))) };
    ui.selectedCityId = city.id;
    ui.selectedUnitId = null;
    ui.reach = null;
    ui.targets = new Set();
    hideModal('buildModal');
    Rnd.setView({
      navalTiles: ui.navalBuild.tiles, selectedCityId: city.id, selectedUnit: null,
      reach: null, targets: new Set(), supportTargets: null
    });
    updateHUD();
    renderContext();
    hint('舰船部署：点击高亮海域放置 ' + U[type].name + '；Esc 取消');
    Au.play('click');
  }

  function finishNavalBuild(q, r) {
    const s = ui.state;
    const mode = ui.navalBuild;
    if (!s || !mode) return;
    const city = s.sitesById[mode.cityId];
    const res = G.buildUnit(s, city, mode.type, q, r);
    if (!res.ok) { toast(res.why, 'bad'); return; }
    ui.navalBuild = null;
    Rnd.setView({ navalTiles: null });
    Rnd.flash(q, r, 'rgba(160,210,255,0.55)');
    Rnd.floatText(q, r, U[mode.type].name, '#b8d8f0');
    Au.play('build');
    toast('已部署 ' + U[mode.type].name + '（本回合不能行动）', 'good');
    refreshAll();
    hint(defaultHint());
  }

  function cancelNavalBuild() {
    if (!ui.navalBuild) return;
    ui.navalBuild = null;
    Rnd.setView({ navalTiles: null });
    refreshAll();
    hint(defaultHint());
    toast('已取消舰船部署');
  }

  function startLandBuild(city, type) {
    const s = ui.state;
    const tiles = G.landDeployTiles(s, city, type);
    if (!tiles.length) { toast('据点及周围六格没有可部署位置', 'bad'); return; }
    ui.landBuild = { cityId: city.id, type, tiles: new Set(tiles.map(t => H.key(t.q, t.r))) };
    ui.selectedCityId = city.id;
    ui.selectedUnitId = null;
    ui.reach = null;
    ui.targets = new Set();
    hideModal('buildModal');
    Rnd.setView({
      buildTiles: ui.landBuild.tiles, selectedCityId: city.id, selectedUnit: null,
      reach: null, targets: new Set(), supportTargets: null
    });
    updateHUD();
    renderContext();
    hint('生产部署：点击高亮地格放置 ' + U[type].name + '；Esc 取消');
    Au.play('click');
  }

  function finishLandBuild(q, r) {
    const s = ui.state;
    const mode = ui.landBuild;
    if (!s || !mode) return;
    const city = s.sitesById[mode.cityId];
    const res = G.buildUnit(s, city, mode.type, q, r);
    if (!res.ok) { toast(res.why, 'bad'); return; }
    ui.landBuild = null;
    Rnd.setView({ buildTiles: null });
    Rnd.flash(q, r, 'rgba(160,210,255,0.5)');
    Rnd.floatText(q, r, U[mode.type].name, '#b8d8f0');
    Au.play('build');
    toast('已组建 ' + U[mode.type].name + '（本回合不能行动）', 'good');
    refreshAll();
    hint(defaultHint());
  }

  function cancelLandBuild() {
    if (!ui.landBuild) return;
    ui.landBuild = null;
    Rnd.setView({ buildTiles: null });
    refreshAll();
    hint(defaultHint());
    toast('已取消生产部署');
  }

  function buildAt(city, type) {
    const s = ui.state;
    if (U[type] && U[type].naval) { startNavalBuild(city, type); return; }
    startLandBuild(city, type);
  }

  /* ================= 工事 ================= */
  function openFortBuilder(u) {
    const s = ui.state;
    if (!s || !u) return;
    const box = $('#fortList');
    const info = $('#fortInfo');
    const money = s.money[u.faction];
    $('#fortTitle').textContent = '构筑工事 · ' + U[u.type].name;
    info.textContent = `本回合已建造 ${s.fortsBuilt} 个工事 · 总数无上限 · 金钱 ${money}`;
    box.innerHTML = '';
    for (const type of Object.keys(D.FORTS || {})) {
      const def = D.FORTS[type];
      const chk = R.canBuildFort(s, u, type);
      const cost = G.fortCost(s, u.faction, type);
      const btn = document.createElement('button');
      btn.className = 'build-card';
      btn.disabled = !chk.ok;
      btn.innerHTML = `
        <div class="bc-name"><span>${def.name}</span><span class="bc-short">FORT</span></div>
        <div class="bc-role">${def.placement === 'self' ? '自身 / 周围 6 格' : '周围 6 格'}</div>
        <div class="bc-stats"><span>${def.desc}</span></div>
        <div class="bc-cost"><span class="${money < cost ? 'no' : ''}">◈ ${cost}</span></div>
        ${chk.ok ? '' : `<div class="bc-deploy">${chk.why}</div>`}`;
      btn.addEventListener('click', () => {
        hideModal('fortModal');
        startFortPlacement(u, type);
      });
      box.appendChild(btn);
    }
    $('#fortRes').textContent = `本回合工事 ${s.fortsBuilt} 个 · 无上限 · 金钱 ${money}`;
    showModal('fortModal');
    Au.play('click');
  }

  function startFortPlacement(u, type) {
    const s = ui.state;
    const st = R.canBuildFort(s, u, type);
    if (!st.ok) { toast(st.why, 'bad'); return; }
    ui.fortMode = { unitId: u.id, type, keys: new Set(st.tiles.map(t => H.key(t.q, t.r))) };
    ui.selectedUnitId = u.id;
    ui.selectedCityId = null;
    ui.reach = null;
    ui.targets = new Set();
    ui.swapMode = null;
    Rnd.setView({
      reach: null, targets: new Set(), selectedUnit: u, path: null, selectedCityId: null,
      swapTargets: null, supportTiles: null, supportUnitId: null,
      airportTargets: null, airportTiles: null, fortTiles: ui.fortMode.keys
    });
    renderContext();
    hint('构筑工事：点击高亮地格放置 ' + D.FORTS[type].name + '；Esc 取消');
    Au.play('click');
  }

  function cancelFortMode() {
    if (!ui.fortMode) return;
    ui.fortMode = null;
    ui.supportMode = null;
    Rnd.setView({ fortTiles: null });
    renderContext();
    hint('已取消构筑工事');
  }

  function executeFortPlacement(q, r) {
    const mode = ui.fortMode;
    if (!mode) return;
    const s = ui.state;
    const u = findUnit(mode.unitId);
    if (!u) { ui.fortMode = null; return; }
    const res = R.buildFort(s, u, mode.type, q, r);
    if (!res.ok) { toast(res.why, 'bad'); return; }
    ui.fortMode = null;
    ui.supportMode = null;
    Rnd.setView({ fortTiles: null });
    Rnd.flash(q, r, 'rgba(220, 190, 120, 0.55)');
    Rnd.floatText(q, r, D.FORTS[mode.type].name, '#e9d3a0');
    Au.play('build');
    ui.selectedUnitId = u.id;
    ui.selectedCityId = null;
    refreshAll();
    toast('已构筑 ' + D.FORTS[mode.type].name + '（花费 ' + res.cost + ' 金）', 'good');
    renderContext();
  }

  /* ================= 回合流程 ================= */
  function endPlayerTurn() {
    const s = ui.state;
    if (!s || s.over || ui.busy || s.current !== s.playerFaction) return;
    if (ui.militiaMode) { toast('请先部署完待部署的民兵', 'bad'); return; }
    if (ui.navalBuild) { toast('请先完成舰船部署', 'bad'); return; }
    if (ui.landBuild) { toast('请先完成生产部署', 'bad'); return; }
    if (ui.landingMode) { toast('请先选择突击快船的登陆位置', 'bad'); return; }
    clearSelection();
    renderContext();
    const v = G.endTurn(s);
    refreshAll();
    if (v) { finishGame(); return; }
    if (ui.network) {
      SG.net.sendSnapshot(s, true);
      if (s.current === s.playerFaction) {
        ui.busy = false;
        updateHUD();
        banner('第 ' + s.turn + ' 回合 · ' + G.forceData(s, s.playerFaction).short, s.playerFaction);
        hint(defaultHint());
      } else if (ui.net && ui.net.role === 'host' && s.aiFactions.includes(s.current)) {
        ui.busy = true;
        updateHUD();
        banner(G.forceData(s, s.current).name + '回合', s.current);
        hint('AI 行动中…');
        setTimeout(runAI, 240);
      } else {
        ui.busy = true;
        updateHUD();
        hint('等待对方行动…');
      }
      return;
    }
    ui.busy = true;
    updateHUD();
    auTurnSound(s.current);
    banner(G.forceData(s, s.current).name + '回合', s.current);
    hint('敌军行动中，请稍候…');
    setTimeout(runAI, 480);
  }

  function auTurnSound() { Au.play('turn'); }

  function runAI() {
    const s = ui.state;
    if (!s || s.over) { finishAI(); return; }
    ui.ai = SG.ai.createAI(s, s.current);
    ui.ai.begin();
    let steps = 0;
    const tick = () => {
      if (!ui.state || ui.state.over) { finishAI(); return; }
      const before = new Map();
      for (const u of s.units) before.set(u.id, { q: u.q, r: u.r });
      let res;
      try {
        res = ui.ai.step();
      } catch (err) {
        console.error(err);
        toast('AI 行动异常，回合结束', 'bad');
        finishAI();
        return;
      }
      // 移动动画
      if (res && res.unit) {
        const b = before.get(res.unit.id);
        if (b && (b.q !== res.unit.q || b.r !== res.unit.r)) {
          Rnd.animateUnit(res.unit, b.q, b.r, 200);
        }
      }
      if (res && res.kind === 'attack' && res.result) {
        const r2 = res.result;
        Au.play('attack');
        Rnd.tracer(r2.fromQ, r2.fromR, r2.toQ, r2.toR);
        setTimeout(() => { if (r2.hit) Rnd.boom(r2.toQ, r2.toR); }, 60);
        Rnd.floatText(r2.toQ, r2.toR, r2.hit ? (r2.defenderDestroyed ? '击毁' : '受损') : '未命中',
          r2.hit ? '#ff9c7d' : '#cfd6df');
        if (r2.counterHit) Rnd.floatText(r2.fromQ, r2.fromR, r2.attackerDestroyed ? '被毁' : '受损', '#ffcf8a');
        else if (r2.counterNeed != null) Rnd.floatText(r2.fromQ, r2.fromR, '反击未中', '#cfd6df');
      } else if (res && res.kind === 'capture') {
        Au.play('capture');
        Rnd.flash(res.site.q, res.site.r, 'rgba(240,210,140,0.5)');
        Rnd.floatText(res.site.q, res.site.r, '失守', '#ff9c7d');
        toast(res.site.name + ' 被敌军占领', 'bad');
      } else if (res && res.kind === 'build') {
        Au.play('build');
      }
      refreshAll();
      steps++;
      if (res && !res.done && steps < 500) {
        ui.aiTimer = setTimeout(tick, s.over ? 60 : 80);
      } else {
        ui.aiTimer = setTimeout(finishAI, 180);
      }
    };
    ui.aiTimer = setTimeout(tick, 260);
  }

  function finishAI() {
    const s = ui.state;
    ui.busy = false;
    if (!s) return;
    if (s.over) { refreshAll(); finishGame(); return; }
    const v = G.endTurn(s);
    refreshAll();
    if (v) { finishGame(); return; }
    if (ui.network) {
      SG.net.sendSnapshot(s, true);
      if (s.current === s.playerFaction) {
        ui.busy = false;
        updateHUD();
        maybeOpenLanding();
        maybeOpenMilitiaDeployment();
        banner('第 ' + s.turn + ' 回合 · ' + G.forceData(s, s.playerFaction).short, s.playerFaction);
        hint(defaultHint());
      } else if (ui.net && ui.net.role === 'host' && s.aiFactions.includes(s.current)) {
        ui.busy = true;
        updateHUD();
        banner(G.forceData(s, s.current).name + '回合', s.current);
        hint('AI 行动中…');
        setTimeout(runAI, 240);
      } else {
        ui.busy = true;
        updateHUD();
        hint('等待对方行动…');
      }
      return;
    }
    if (s.current !== s.playerFaction) {
      ui.busy = true;
      updateHUD();
      banner('第 ' + s.turn + ' 回合 · ' + G.forceData(s, s.current).short, s.current);
      hint(G.forceData(s, s.current).name + ' 行动中…');
      autoSave();
      setTimeout(runAI, 420);
      return;
    }
    maybeOpenLanding();
    maybeOpenMilitiaDeployment();
    banner('第 ' + s.turn + ' 回合 · ' + G.forceData(s, s.playerFaction).short, s.playerFaction);
    Au.play('turn');
    hint(defaultHint());
    autoSave();
  }

  /* ================= 结局 ================= */
  function finishGame() {
    const s = ui.state;
    if (!s || !s.over) return;
    ui.busy = false;
    clearTimeout(ui.aiTimer);
    const win = s.over.winner === s.playerFaction;
    const draw = s.over.winner === 'draw';
    const card = document.querySelector('.end-card');
    card.classList.toggle('lose', !win && !draw);
    $('#endKicker').textContent = draw ? 'CEASEFIRE' : win ? 'CAMPAIGN COMPLETE' : 'CAMPAIGN FAILED';
    $('#endTitle').textContent = draw ? '停战' : win ? '胜利' : '失败';
    $('#endReason').textContent = s.over.reason + ' · ' + s.over.detail;
    const me = s.playerFaction;
    $('#endStats').innerHTML = `
      <div><b>${s.turn}</b><span>回合</span></div>
      <div><b>${G.siteCount(s, me)}</b><span>据点</span></div>
      <div><b>${s.stats.kills[me] || 0}</b><span>歼敌</span></div>
      <div><b>${s.stats.built[me] || 0}</b><span>生产</span></div>`;
    showModal('endScreen');
    Au.play(win ? 'win' : 'lose');
    updateHUD();
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    refreshSaveButton();
  }

  /* ================= 存档 ================= */
  function autoSave() {
    if (!ui.state || ui.state.over || ui.network) return;
    try { localStorage.setItem(SAVE_KEY, G.serialize(ui.state)); } catch (e) { /* 忽略 */ }
    refreshSaveButton();
  }
  function saveManual() {
    if (!ui.state) return;
    if (ui.busy) { toast('敌军行动中，暂不能保存', 'bad'); return; }
    autoSave();
    toast('进度已保存', 'good');
  }

  /* ================= 弹窗 ================= */
  function showModal(id) {
    document.getElementById(id).classList.remove('hidden');
    hideTooltip();
  }
  function hideModal(id) {
    document.getElementById(id).classList.add('hidden');
  }
  function hideAllModals() {
    document.querySelectorAll('.overlay').forEach(o => o.classList.add('hidden'));
  }


  /* ================= 自定义地图 ================= */
  const CUSTOM_MAP_KEY = 'steeltide.customMap.v1';
  const CUSTOM_MAPS_KEY = 'steeltide.customMaps.v1';
  const CUSTOM_W = 32, CUSTOM_H = 22;
  const CUSTOM_MIN = 20, CUSTOM_MAX = 50;
  const MAP_PALETTE = {
    plains: '#a49b6c', forest: '#6d7d52', hills: '#b09c68',
    mountain: '#918b7e', river: '#4d7185', water: '#2b4457'
  };
  const SITE_GLYPH = {
    city: '城', village: '村', factory: '厂', industrial_base: '基',
    port: '港', airport: '空'
  };
  const TERRAIN_CHAR = {
    plains: '.', forest: 'f', hills: 'h', mountain: 'm',
    river: '=', water: '~', bridge: 'b'
  };
  const mapEditor = {
    data: null, tool: 'terrain', terrain: 'plains', faction: 'alliance',
    siteKind: 'city', hover: null, seq: 1, bound: false
  };

  function cloneMap(m) { return JSON.parse(JSON.stringify(m)); }

  function normalizeCustomMap(m) {
    if (!m || !Array.isArray(m.rows) || !m.rows.length) return null;
    const w = m.width || (m.rows[0] || '').length;
    const h = m.height || m.rows.length;
    if (w < CUSTOM_MIN || w > CUSTOM_MAX || h < CUSTOM_MIN || h > CUSTOM_MAX) return null;
    if (m.rows.length !== h || !m.rows.every(r => typeof r === 'string' && r.length === w)) return null;
    if (!Array.isArray(m.sites)) return null;
    m.width = w; m.height = h;
    m.name = m.name || '我的地图';
    m.id = m.id || ('custom-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 999));
    return m;
  }

  function loadMapLibrary() {
    const out = [];
    try {
      const raw = localStorage.getItem(CUSTOM_MAPS_KEY);
      const arr = JSON.parse(raw || '[]');
      if (Array.isArray(arr)) {
        for (const item of arr) {
          const m = normalizeCustomMap(item);
          if (m) out.push(m);
        }
      }
    } catch (e) { /* ignore */ }
    try {
      const active = normalizeCustomMap(JSON.parse(localStorage.getItem(CUSTOM_MAP_KEY) || 'null'));
      if (active && !out.some(m => m.id === active.id)) out.unshift(active);
    } catch (e) { /* ignore */ }
    return out;
  }

  function saveMapLibrary(list) {
    localStorage.setItem(CUSTOM_MAPS_KEY, JSON.stringify(list));
  }

  function loadCustomMapFromStorage() {
    try {
      const active = normalizeCustomMap(JSON.parse(localStorage.getItem(CUSTOM_MAP_KEY) || 'null'));
      if (active) return active;
    } catch (e) { /* ignore */ }
    const lib = loadMapLibrary();
    return lib.length ? lib[0] : null;
  }

  function refreshMapLibrarySelect(selectedId) {
    const box = $('#customMapLibrary');
    if (!box) return;
    const lib = loadMapLibrary();
    box.innerHTML = '<option value="">— 选择已保存地图 —</option>' +
      lib.map(m => `<option value="${m.id}">${m.name} · ${m.width}×${m.height}</option>`).join('');
    if (selectedId) box.value = selectedId;
  }

  function defaultCustomMap() {
    const rows = Array.from({ length: CUSTOM_H }, () => '.'.repeat(CUSTOM_W));
    return {
      id: 'custom', name: '我的地图', width: CUSTOM_W, height: CUSTOM_H, rows,
      sites: [
        { id: 'custom-w-capital', name: '西都', col: 4, row: 11, kind: 'city', faction: 'alliance', capital: true },
        { id: 'custom-e-capital', name: '东都', col: 27, row: 11, kind: 'city', faction: 'empire', capital: true },
        { id: 'custom-n-city', name: '中央城', col: 16, row: 11, kind: 'city', faction: null, capital: false }
      ],
      startUnits: [], neutralGarrison: ['armored_car', 'light_inf', 'light_inf', 'light_inf']
    };
  }

  function customStartUnit(site) {
    if (!site.faction) return null;
    if (site.capital) return 'armored_car';
    if (site.kind === 'city') return 'mech_inf';
    if (site.kind === 'village') return 'militia';
    if (site.kind === 'factory') return 'infantry_gun';
    if (site.kind === 'port') return 'light_inf';
    if (site.kind === 'industrial_base') return 'light_inf';
    return null;
  }

  function finalizeCustomMap(data, name) {
    const rows = data.rows.map(r => Array.isArray(r) ? r.slice() : r.split(''));
    for (const site of data.sites) {
      if (rows[site.row] && rows[site.row][site.col] !== undefined) rows[site.row][site.col] = '.';
    }
    const sites = data.sites.map(x => ({ ...x }));
    const startUnits = [];
    for (const site of sites) {
      const type = customStartUnit(site);
      if (type) startUnits.push({ type, faction: site.faction, col: site.col, row: site.row });
    }
    return {
      id: data.id || 'custom', name: name || data.name || '我的地图', width: data.width, height: data.height,
      rows: rows.map(r => r.join('')), sites, startUnits,
      neutralGarrison: ['armored_car', 'light_inf', 'light_inf', 'light_inf']
    };
  }

  function updateCustomMapCard() {
    if (!ui.customMap) ui.customMap = loadCustomMapFromStorage();
    const sub = $('#customMapSub');
    if (sub) {
      if (!ui.customMap) sub.textContent = '尚无存档 · 点击编辑';
      else {
        const ais = new Set(ui.customMap.sites.map(s => s.faction).filter(f => ['empire', 'ai3', 'ai4', 'ai5', 'ai6'].includes(f)));
        sub.textContent = '已保存 · ' + ui.customMap.width + ' × ' + ui.customMap.height + ' · ' + ais.size + ' AI';
      }
    }
  }

  function editorCanvasSize() {
    const size = 20, pad = 12;
    const W = (mapEditor.data && mapEditor.data.width) || CUSTOM_W;
    const H = (mapEditor.data && mapEditor.data.height) || CUSTOM_H;
    const w = Math.ceil(Math.sqrt(3) * size * (W + 0.5) + pad * 2);
    const h = Math.ceil(size * 2 + (H - 1) * 1.5 * size + pad * 2);
    return { size, pad, w, h };
  }

  function editorHexCenter(col, row) {
    const { size, pad } = editorCanvasSize();
    return {
      x: pad + Math.sqrt(3) * size * (col + 0.5 * (row & 1)),
      y: pad + size + 1.5 * size * row
    };
  }

  function editorHexPath(ctx, x, y, radius) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 180 * (60 * i - 30);
      const px = x + radius * Math.cos(a), py = y + radius * Math.sin(a);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function editorSiteAt(col, row) {
    return mapEditor.data ? mapEditor.data.sites.find(s => s.col === col && s.row === row) : null;
  }

  function drawMapEditor() {
    const canvas = $('#mapEditorCanvas');
    if (!canvas || !mapEditor.data) return;
    const { size, w, h } = editorCanvasSize();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.ceil(w * dpr);
    canvas.height = Math.ceil(h * dpr);
    canvas.style.aspectRatio = w + ' / ' + h;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0d141b';
    ctx.fillRect(0, 0, w, h);

    const W = mapEditor.data.width, H = mapEditor.data.height;
    for (let row = 0; row < H; row++) {
      for (let col = 0; col < W; col++) {
        const p = editorHexCenter(col, row);
        const ch = mapEditor.data.rows[row][col];
        const site = editorSiteAt(col, row);
        let terrain = ch === 'f' ? 'forest' : ch === 'h' ? 'hills' : ch === 'm' ? 'mountain'
          : ch === '=' || ch === 'b' ? 'river' : ch === '~' ? 'water' : 'plains';
        if (site) terrain = 'plains';
        editorHexPath(ctx, p.x, p.y, size * 0.97);
        ctx.fillStyle = MAP_PALETTE[terrain] || MAP_PALETTE.plains;
        ctx.fill();
        ctx.strokeStyle = 'rgba(20, 28, 34, 0.55)';
        ctx.lineWidth = 1;
        ctx.stroke();

        if (ch === 'b' && !site) {
          ctx.strokeStyle = '#8d5f45';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(p.x - size * 0.58, p.y);
          ctx.lineTo(p.x + size * 0.58, p.y);
          ctx.stroke();
        }

        if (site) {
          const fo = site.faction ? D.FACTIONS[site.faction] : null;
          const color = fo ? fo.color : '#6f6a5f';
          editorHexPath(ctx, p.x, p.y, size * 0.78);
          ctx.fillStyle = color;
          ctx.fill();
          ctx.strokeStyle = site.capital ? '#f1d27b' : 'rgba(255,255,255,.35)';
          ctx.lineWidth = site.capital ? 2.5 : 1;
          ctx.stroke();
          ctx.fillStyle = '#fff8e6';
          ctx.font = 'bold ' + Math.round(size * 0.72) + 'px "Microsoft YaHei", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(site.capital ? '都' : (SITE_GLYPH[site.kind] || '?'), p.x, p.y + 0.5);
        }

        if (mapEditor.hover && mapEditor.hover.col === col && mapEditor.hover.row === row) {
          editorHexPath(ctx, p.x, p.y, size * 0.94);
          ctx.strokeStyle = '#f5d77c';
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }
      }
    }
  }

  function updateEditorSizeLabel() {
    const label = $('#mapEditorSizeLabel');
    if (label && mapEditor.data) label.textContent = '地图尺寸 ' + mapEditor.data.width + ' × ' + mapEditor.data.height;
  }

  function resizeMapEditor() {
    if (!mapEditor.data) return;
    const w = Math.max(CUSTOM_MIN, Math.min(CUSTOM_MAX, parseInt($('#customMapW').value, 10) || CUSTOM_W));
    const h = Math.max(CUSTOM_MIN, Math.min(CUSTOM_MAX, parseInt($('#customMapH').value, 10) || CUSTOM_H));
    const old = mapEditor.data.rows;
    const rows = Array.from({ length: h }, (_, r) =>
      Array.from({ length: w }, (_, c) => (old[r] && old[r][c]) ? old[r][c] : '.'));
    mapEditor.data.rows = rows;
    mapEditor.data.width = w;
    mapEditor.data.height = h;
    mapEditor.data.sites = mapEditor.data.sites.filter(s => s.col < w && s.row < h);
    $('#customMapW').value = w;
    $('#customMapH').value = h;
    updateEditorSizeLabel();
    drawMapEditor();
    toast('地图尺寸已改为 ' + w + ' × ' + h, 'good');
  }

  function openMapEditor() {
    const saved = ui.customMap || loadCustomMapFromStorage();
    mapEditor.data = cloneMap(saved || defaultCustomMap());
    mapEditor.data.rows = mapEditor.data.rows.map(r => r.split(''));
    mapEditor.data.width = Math.max(CUSTOM_MIN, Math.min(CUSTOM_MAX, mapEditor.data.width || mapEditor.data.rows[0].length));
    mapEditor.data.height = Math.max(CUSTOM_MIN, Math.min(CUSTOM_MAX, mapEditor.data.height || mapEditor.data.rows.length));
    mapEditor.name = mapEditor.data.name || '我的地图';
    mapEditor.hover = null;
    mapEditor.seq = 1;
    $('#customMapName').value = mapEditor.name;
    $('#customMapName').disabled = false;
    $('#customMapW').value = mapEditor.data.width;
    $('#customMapH').value = mapEditor.data.height;
    updateEditorSizeLabel();
    refreshMapLibrarySelect(mapEditor.data.id);
    setEditorTool('terrain');
    setEditorTerrain('plains');
    showModal('mapEditor');
    requestAnimationFrame(() => { drawMapEditor(); });
  }

  function closeMapEditor() {
    hideModal('mapEditor');
    updateCustomMapCard();
  }

  function setEditorTool(tool) {
    mapEditor.tool = tool;
    $('#mapEditorHint').textContent = tool === 'terrain'
      ? '已选择地形笔刷：点击地格绘制；据点所在格需先删除据点。'
      : tool === 'site'
        ? '据点放置：选择阵营与类型后点击地格；每方只能有一个首都。'
        : '删除据点：点击已放置的据点将其移除。';
  }

  function setEditorTerrain(t) {
    mapEditor.terrain = t;
    mapEditor.tool = 'terrain';
    document.querySelectorAll('#terrainTools button').forEach(b => b.classList.toggle('active', b.dataset.terrain === t));
    setEditorTool('terrain');
    $('#mapEditorHint').textContent = '地形笔刷：' + D.TERRAIN[t === 'bridge' ? 'river' : t].name + '。点击地格绘制。';
  }

  function editorCoordFromEvent(e) {
    const canvas = $('#mapEditorCanvas');
    const { size, w, h } = editorCanvasSize();
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (w / rect.width);
    const y = (e.clientY - rect.top) * (h / rect.height);
    let best = null, bestD = size * 0.95;
    const W = mapEditor.data.width, H = mapEditor.data.height;
    for (let row = 0; row < H; row++) {
      for (let col = 0; col < W; col++) {
        const p = editorHexCenter(col, row);
        const d = Math.hypot(x - p.x, y - p.y);
        if (d < bestD) { bestD = d; best = { col, row }; }
      }
    }
    return best;
  }

  function editorPaintCell(hit) {
    if (!hit || !mapEditor.data) return;
    const site = editorSiteAt(hit.col, hit.row);
    if (mapEditor.tool === 'erase') {
      if (!site) { toast('该格没有据点', 'bad'); return; }
      mapEditor.data.sites = mapEditor.data.sites.filter(s => s !== site);
      drawMapEditor();
      toast('已删除据点 ' + site.name, 'good');
      return;
    }
    if (mapEditor.tool === 'site') {
      const kind = $('#customSiteKind').value;
      const faction = $('#customFaction').value || null;
      if (kind === 'capital' && !faction) { toast('中立不能设置首都', 'bad'); return; }
      if (kind === 'capital' && faction && mapEditor.data.sites.some(s => s.faction === faction && s.capital)) {
        toast('每方只能设置一个首都', 'bad'); return;
      }
      if (site) mapEditor.data.sites = mapEditor.data.sites.filter(s => s !== site);
      const actualKind = kind === 'capital' ? 'city' : kind;
      const count = mapEditor.data.sites.filter(s => s.kind === actualKind).length + 1;
      const prefix = faction === 'alliance' ? '西' : faction === 'empire' ? '东' : faction === 'ai3' ? 'AI2' : faction === 'ai4' ? 'AI3' : faction === 'ai5' ? 'AI4' : faction === 'ai6' ? 'AI5' : '中';
      const capName = { alliance: '西都', empire: '东都', ai3: 'AI2都', ai4: 'AI3都', ai5: 'AI4都', ai6: 'AI5都' }[faction] || '都城';
      const name = kind === 'capital' ? capName : prefix + D.SITE_KINDS[actualKind].name + count;
      mapEditor.data.sites.push({
        id: 'custom-site-' + Date.now().toString(36) + '-' + (mapEditor.seq++),
        name, col: hit.col, row: hit.row, kind: actualKind,
        faction, capital: kind === 'capital'
      });
      mapEditor.data.rows[hit.row][hit.col] = '.';
      drawMapEditor();
      toast('已放置 ' + name, 'good');
      return;
    }
    if (site) { toast('该格已有据点，请先删除据点', 'bad'); return; }
    mapEditor.data.rows[hit.row][hit.col] = TERRAIN_CHAR[mapEditor.terrain] || '.';
    drawMapEditor();
  }

  function saveCustomMap(useAfter) {
    if (!mapEditor.data) return false;
    const name = ($('#customMapName').value || '').trim() || '我的地图';
    if (!mapEditor.data.sites.some(s => s.faction === 'alliance' && s.capital)) { toast('请先放置玩家（西线）首都', 'bad'); return false; }
    const aiSides = ['empire', 'ai3', 'ai4', 'ai5', 'ai6'];
    const aiPresent = new Set(mapEditor.data.sites.filter(s => aiSides.includes(s.faction)).map(s => s.faction));
    if (![...aiPresent].some(f => mapEditor.data.sites.some(s => s.faction === f && s.capital))) { toast('请至少放置一个 AI 首都', 'bad'); return false; }
    for (const f of aiPresent) {
      if (!mapEditor.data.sites.some(s => s.faction === f && s.capital)) { toast('AI ' + f + ' 有据点但缺少首都', 'bad'); return false; }
    }
    const map = finalizeCustomMap(mapEditor.data, name);
    map.id = mapEditor.data.id || ('custom-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 999));
    try {
      const lib = loadMapLibrary();
      const idx = lib.findIndex(m => m.id === map.id);
      if (idx >= 0) lib[idx] = map; else lib.push(map);
      saveMapLibrary(lib);
      localStorage.setItem(CUSTOM_MAP_KEY, JSON.stringify(map));
      ui.customMap = map;
      mapEditor.data.id = map.id;
      mapEditor.name = name;
      refreshMapLibrarySelect(map.id);
      updateCustomMapCard();
      toast('自定义地图已保存到本地', 'good');
    } catch (e) {
      toast('保存失败：浏览器存储不可用', 'bad');
      return false;
    }
    if (useAfter) {
      ui.mapId = 'custom';
      document.querySelectorAll('#mapPick button').forEach(b => b.classList.toggle('active', b.dataset.map === 'custom'));
      closeMapEditor();
      toast('已选用自定义地图，点击“开始战役”即可开局', 'good');
    }
    return true;
  }

  function loadSelectedMap() {
    const id = $('#customMapLibrary').value;
    if (!id) { toast('请先选择一个已保存地图', 'bad'); return; }
    const map = loadMapLibrary().find(m => m.id === id);
    if (!map) { toast('地图不存在', 'bad'); return; }
    mapEditor.data = cloneMap(map);
    mapEditor.data.rows = mapEditor.data.rows.map(r => r.split(''));
    mapEditor.name = map.name;
    $('#customMapName').value = map.name;
    $('#customMapW').value = map.width;
    $('#customMapH').value = map.height;
    updateEditorSizeLabel();
    drawMapEditor();
    ui.customMap = map;
    ui.mapId = 'custom';
    document.querySelectorAll('#mapPick button').forEach(b => b.classList.toggle('active', b.dataset.map === 'custom'));
    updateCustomMapCard();
    toast('已读取并选用：' + map.name, 'good');
  }

  function newCustomMap() {
    const m = defaultCustomMap();
    m.id = null;
    m.name = '我的地图';
    mapEditor.data = m;
    mapEditor.data.rows = m.rows.map(r => r.split(''));
    mapEditor.name = m.name;
    $('#customMapName').value = m.name;
    $('#customMapW').value = m.width;
    $('#customMapH').value = m.height;
    updateEditorSizeLabel();
    refreshMapLibrarySelect('');
    drawMapEditor();
    toast('已新建空白地图', 'good');
  }

  function deleteSelectedMap() {
    const id = $('#customMapLibrary').value;
    if (!id) { toast('请先选择一个已保存地图', 'bad'); return; }
    if (!confirm('确定删除这张本地地图存档？')) return;
    const lib = loadMapLibrary().filter(m => m.id !== id);
    try { saveMapLibrary(lib); } catch (e) { toast('删除失败', 'bad'); return; }
    try {
      const active = JSON.parse(localStorage.getItem(CUSTOM_MAP_KEY) || 'null');
      if (active && active.id === id) localStorage.removeItem(CUSTOM_MAP_KEY);
    } catch (e) { /* ignore */ }
    if (ui.customMap && ui.customMap.id === id) ui.customMap = lib[0] || null;
    refreshMapLibrarySelect('');
    updateCustomMapCard();
    toast('本地地图已删除', 'good');
  }

  function bindMapEditor() {
    if (mapEditor.bound) return;
    mapEditor.bound = true;
    $('#btnMapEditor').addEventListener('click', openMapEditor);
    $('#btnMapEditorClose').addEventListener('click', closeMapEditor);
    $('#btnLoadMap').addEventListener('click', loadSelectedMap);
    $('#btnNewMap').addEventListener('click', newCustomMap);
    $('#btnDeleteMap').addEventListener('click', deleteSelectedMap);
    $('#terrainTools').querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => { setEditorTerrain(btn.dataset.terrain); Au.play('click'); });
    });
    $('#btnPlaceSite').addEventListener('click', () => { setEditorTool('site'); Au.play('click'); });
    $('#btnEraseSite').addEventListener('click', () => { setEditorTool('erase'); Au.play('click'); });
    $('#customFaction').addEventListener('change', () => setEditorTool('site'));
    $('#customSiteKind').addEventListener('change', () => setEditorTool('site'));
    $('#btnClearMap').addEventListener('click', () => {
      if (!mapEditor.data || !confirm('确定清空当前自定义地图？')) return;
      mapEditor.data.rows = Array.from({ length: mapEditor.data.height }, () => Array(mapEditor.data.width).fill('.'));
      mapEditor.data.sites = [];
      drawMapEditor();
      toast('地图已清空', 'good');
    });
    $('#btnResizeMap').addEventListener('click', resizeMapEditor);
    $('#btnSaveMap').addEventListener('click', () => saveCustomMap(false));
    $('#btnSaveMapUse').addEventListener('click', () => saveCustomMap(true));
    const cv = $('#mapEditorCanvas');
    cv.addEventListener('mousemove', e => {
      mapEditor.hover = editorCoordFromEvent(e);
      drawMapEditor();
    });
    cv.addEventListener('mouseleave', () => { mapEditor.hover = null; drawMapEditor(); });
    cv.addEventListener('click', e => {
      const hit = editorCoordFromEvent(e);
      if (!hit) return;
      editorPaintCell(hit);
    });
  }

  function buildHelpTable() {
    const box = $('#helpUnitTable');
    if (!box) return;
    box.innerHTML = D.BUILD_ORDER.map(t => {
      const u = U[t];
      return `<div><b>${u.name}</b><span>${u.stat} · ${u.cost.money}金/${u.cost.pop}人/${u.cost.industry}工${u.fragile ? ' · 受损即毁' : ''}</span></div>`;
    }).join('');
  }

  /* ================= 启动 ================= */
  window.addEventListener('DOMContentLoaded', init);
  if (document.readyState !== 'loading') init();

  SG.UI = ui;
  // 调试钩子（也方便自动化测试）
  SG.debug = {
    finishGame: () => finishGame(),
    refresh: () => refreshAll(),
    startNew: (f, d, force) => startNew(f, d, null, force),
    endTurn: () => endPlayerTurn(),
    getBusy: () => ui.busy,
    getNetwork: () => ({ network: ui.network, net: ui.net }),
    getState: () => ui.state
  };
})(typeof window !== 'undefined' ? window : globalThis);
