/* 通过 Edge DevTools Protocol 做浏览器冒烟测试与截图 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9333;
const ROOT = path.resolve(__dirname, '..');
const URL = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');
const SHOTS = path.join(ROOT, 'shots', 'test');
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });
const profile = path.join(os.tmpdir(), 'st-edge-' + Date.now());

const sleep = ms => new Promise(r => setTimeout(r, ms));
const errors = [];

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    ws.onopen = () => resolve({
      send(method, params) {
        return new Promise((res, rej) => {
          const mid = ++id;
          pending.set(mid, { res, rej });
          ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
        });
      },
      close() { ws.close(); }
    });
    ws.onerror = e => reject(e);
    ws.onmessage = ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) p.rej(new Error(JSON.stringify(msg.error)));
        else p.res(msg.result);
      } else if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        errors.push('EXCEPTION: ' + (d.exception && d.exception.description || d.text));
      } else if (msg.method === 'Runtime.consoleAPICalled') {
        const line = msg.params.args.map(a => a.value !== undefined ? a.value : a.description).join(' ');
        if (msg.params.type === 'error') errors.push('CONSOLE: ' + line);
        else console.log('  [page]', line);
      } else if (msg.method === 'Log.entryAdded') {
        const e = msg.params.entry;
        if (e.level === 'error') errors.push('LOG: ' + e.text);
      }
    };
  });
}

(async () => {
  const proc = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--no-default-browser-check', '--disable-features=Translate',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + profile,
    '--window-size=1600,1000',
    URL
  ], { stdio: 'ignore' });

  let page = null;
  for (let i = 0; i < 60; i++) {
    await sleep(250);
    try {
      const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
      page = list.find(p => p.type === 'page');
      if (page) break;
    } catch (e) { /* retry */ }
  }
  if (!page) { console.error('无法连接 Edge'); proc.kill(); process.exit(1); }

  const cdp = await connect(page.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Log.enable');
  await sleep(900);

  async function evalJS(expression) {
    const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
      errors.push('EVAL: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
      return null;
    }
    return r.result.value;
  }
  async function shot(name) {
    const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, name), Buffer.from(r.data, 'base64'));
    console.log('  截图:', name);
  }
  async function canvasRect() {
    return evalJS(`(()=>{const r=document.querySelector('#map').getBoundingClientRect();return {x:r.left,y:r.top};})()`);
  }
  async function clickCanvas(x, y) {
    const rect = await canvasRect();
    const cx = rect.x + x, cy = rect.y + y;
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx, y: cy, button: 'none' });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'left', clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx, y: cy, button: 'left', clickCount: 1 });
    await sleep(180);
  }
  async function hoverCanvas(x, y) {
    const rect = await canvasRect();
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x + x, y: rect.y + y, button: 'none' });
    await sleep(140);
  }

  console.log('1) 初始页面');
  await shot('01-start.png');
  console.log('   模块加载:', await evalJS('!!(window.SG && SG.UI && SG.Render && SG.data)'));

  console.log('2) 开始战役 / 选择战略');
  await evalJS(`document.querySelector('#btnStart').click()`);
  await sleep(250);
  await evalJS(`(()=>{const a=document.querySelectorAll('#attackStrategies .strategy-card')[1];const d=document.querySelector('#defenseStrategies .strategy-card');if(a)a.click();if(d)d.click();document.querySelector('#btnStrategyConfirm').click();})()`);
  await sleep(350);
  await evalJS(`document.querySelector('#btnEnemyStrategyOk').click()`);
  await sleep(1200);
  // 先完成开局待部署的民兵（革命联盟首都民兵/人海攻势）。
  for (let i = 0; i < 6; i++) {
    const m = await evalJS(`(()=>{const m=SG.UI.militiaMode;if(!m)return null;const k=[...m.tiles][0];if(!k)return null;const a=k.split(',').map(Number);const p=SG.Render.hexToScreen(a[0],a[1]);return {x:p.x,y:p.y};})()`);
    if (!m) break;
    await clickCanvas(m.x, m.y);
    await sleep(180);
  }
  console.log('   AI 状态按钮:', await evalJS(`!!document.querySelector('#btnAIStatus') && !document.querySelector('#btnAIStatus').classList.contains('hidden')`));
  await evalJS(`window.__caps=[]; const __o=SG.game.captureCity; SG.game.captureCity=function(s,c,f){const r=__o(s,c,f);window.__caps.push(c.name+':'+c.faction+':T'+s.turn);return r;};`);
  await shot('02-map.png');
  console.log('   状态:', JSON.stringify(await evalJS(`(()=>{const s=SG.UI.state;return {turn:s.turn,current:s.current,units:s.units.length,sites:s.sites.length,money:s.money};})()`)));

  const tank = await evalJS(`(()=>{const s=SG.UI.state;const u=s.units.find(u=>u.faction===s.playerFaction&&u.type==='tank');const p=SG.Render.hexToScreen(u.q,u.r);return {x:p.x,y:p.y,id:u.id};})()`);
  console.log('3) 选中坦克 ' + tank.id);
  await clickCanvas(tank.x, tank.y);
  await sleep(250);
  await shot('03-select.png');
  console.log('   选中:', await evalJS('SG.UI.selectedUnitId'), '可达格:', await evalJS('SG.UI.reach?SG.UI.reach.size:0'), '目标:', await evalJS('SG.UI.targets.size'));

  console.log('4) 悬停路径 / 移动 / 撤销');
  const target = await evalJS(`(()=>{const s=SG.UI.state;const u=s.units.find(u=>u.id===SG.UI.selectedUnitId);const R=SG.rules.reachable(s,u);let best=null;for(const n of R.values()){if(n.blocked||n.cost<=0)continue;if(!best||n.cost>best.cost)best=n;}const p=SG.Render.hexToScreen(best.q,best.r);return {x:p.x,y:p.y,q:best.q,r:best.r};})()`);
  await hoverCanvas(target.x, target.y);
  await shot('04-path.png');
  await clickCanvas(target.x, target.y);
  await sleep(650);
  const afterMove = await evalJS(`(()=>{const u=SG.UI.state.units.find(u=>u.id===${tank.id});return {q:u.q,r:u.r,moved:u.hasMoved,attacked:u.hasAttacked,undo:!!SG.UI.undo};})()`);
  console.log('   移动:', JSON.stringify(afterMove), '目标格', target.q, target.r);
  await shot('05-moved.png');

  await evalJS(`(()=>{const b=document.querySelector('#contextPanel [data-act="undo"]');if(b)b.click();})()`);
  await sleep(300);
  const afterUndo = await evalJS(`(()=>{const u=SG.UI.state.units.find(u=>u.id===${tank.id});return {q:u.q,r:u.r,moved:u.hasMoved};})()`);
  console.log('   撤销后:', JSON.stringify(afterUndo));
  await shot('05b-undo.png');

  console.log('5) 构造接敌并攻击');
  await evalJS(`(()=>{const u=SG.UI.state.units.find(u=>u.id===${tank.id});if(u)u.hasAttacked=false;})()`);
  const enemy = await evalJS(`(()=>{const s=SG.UI.state;const u=s.units.find(u=>u.id===${tank.id});const e=s.units.find(x=>x.faction==='empire'&&x.type==='tank');for(const n of SG.hex.neighbors(u.q,u.r)){if(!SG.game.unitAt(s,n.q,n.r)&&SG.data.TERRAIN[s.grid[n.q+','+n.r].t].pass){e.q=n.q;e.r=n.r;break;}}const p=SG.Render.hexToScreen(e.q,e.r);return {x:p.x,y:p.y,q:e.q,r:e.r,id:e.id};})()`);
  await clickCanvas(target.x, target.y);
  await sleep(250);
  await shot('06-targets.png');
  console.log('   目标数:', await evalJS('SG.UI.targets.size'));
  await clickCanvas(enemy.x, enemy.y);
  await sleep(900);
  console.log('   攻击后:', JSON.stringify(await evalJS(`(()=>{const s=SG.UI.state;return {targetAlive:!!s.units.find(u=>u.id===${enemy.id}),log:s.log.slice(-2).map(l=>l.text)};})()`)));
  await shot('06b-attack.png');

  console.log('6) 结束回合 / AI');
  await evalJS(`document.querySelector('#btnEndTurn').click()`);
  await sleep(8000);
  console.log('   AI 后:', JSON.stringify(await evalJS(`(()=>{const s=SG.UI.state;return {turn:s.turn,current:s.current,busy:SG.UI.busy,units:s.units.length,money:s.money,over:s.over};})()`)));
  console.log('   帝国城市:', await evalJS(`SG.UI.state.sites.filter(c=>c.faction==='empire').map(c=>c.name).join(',')`));
  console.log('   DOM 阵营卡片:', await evalJS(`document.querySelectorAll('.sit-card').length`));
  console.log('   占领记录:', await evalJS(`JSON.stringify(window.__caps)`));
  console.log('   东望:', await evalJS(`SG.UI.state.sitesById.eastwatch.faction`));
  await shot('07-after-ai.png');

  console.log('7) 城市生产');
  const city = await evalJS(`(()=>{const s=SG.UI.state;const c=s.sites.find(c=>c.faction===s.playerFaction&&c.faction===s.current);const p=SG.Render.hexToScreen(c.q,c.r);return {x:p.x,y:p.y,id:c.id,name:c.name};})()`);
  await clickCanvas(city.x, city.y);
  await sleep(250);
  await evalJS(`(()=>{const b=document.querySelector('#contextPanel [data-act="city"]');if(b)b.click();})()`);
  await sleep(250);
  await evalJS(`(()=>{const b=document.querySelector('#contextPanel [data-act="build"]');if(b)b.click();})()`);
  await sleep(400);
  console.log('   生产界面:', await evalJS(`!document.querySelector('#buildModal').classList.contains('hidden')`));
  await shot('08-build.png');
  await evalJS(`(()=>{const b=document.querySelectorAll('#buildList .build-card:not(:disabled)')[0];if(b)b.click();})()`);
  await sleep(400);
  const buildTile = await evalJS(`(()=>{const m=SG.UI.landBuild;if(!m)return null;const k=[...m.tiles][0];if(!k)return null;const a=k.split(',').map(Number);const p=SG.Render.hexToScreen(a[0],a[1]);return {x:p.x,y:p.y};})()`);
  if (buildTile) { await clickCanvas(buildTile.x, buildTile.y); await sleep(350); }
  console.log('   生产后金币:', await evalJS('SG.UI.state.money[SG.UI.state.playerFaction]'));
  await shot('08b-built.png');
  await evalJS(`document.querySelector('#buildModal .x-btn').click()`);

  console.log('8) 手册');
  await evalJS(`document.querySelector('#btnHelp2').click()`);
  await sleep(400);
  await shot('09-help.png');
  await evalJS(`document.querySelector('#helpModal .x-btn').click()`);
  await sleep(200);

  console.log('9) 存档 / 刷新 / 继续');
  await evalJS(`document.querySelector('#btnSave').click()`);
  await sleep(350);
  const saveInfo = await evalJS(`(()=>{const raw=localStorage.getItem('steeltide.save.v13');return raw?{len:raw.length,turn:JSON.parse(raw).turn}:null;})()`);
  console.log('   存档:', JSON.stringify(saveInfo));
  await cdp.send('Page.reload');
  await sleep(1600);
  console.log('   继续按钮可用:', await evalJS(`!document.querySelector('#btnContinue').disabled`));
  await shot('10-start-with-save.png');
  await evalJS(`document.querySelector('#btnContinue').click()`);
  await sleep(1500);
  console.log('   读档后:', JSON.stringify(await evalJS(`(()=>{const s=SG.UI.state;return s?{turn:s.turn,current:s.current,units:s.units.length}:null;})()`)));
  await shot('11-loaded.png');

  console.log('10) 错误汇总');
  if (errors.length) errors.forEach(e => console.log('   ✗', e));
  else console.log('   无 JS 异常');
  cdp.close();
  proc.kill();
  await sleep(300);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
