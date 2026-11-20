/* ============================================================
 * PeerJS 联机：信令、房间、快照同步
 * ============================================================ */
(function (root) {
  'use strict';
  const SG = (root.SG = root.SG || {});
  const PREFIX = 'steeltide-';

  function loadConfig() {
    try {
      const raw = localStorage.getItem('steeltide.peerConfig');
      return raw ? JSON.parse(raw) : undefined;
    } catch (e) { return undefined; }
  }

  function makeCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  const Net = {
    peer: null, conn: null, role: null, roomCode: null, connected: false,
    started: false, applying: false, mySide: 'alliance',
    onMessage: null, onStatus: null, onRemote: null, onClose: null,
    timer: null, lastSent: '', revision: 0, state: null,

    setHandlers(h) {
      this.onMessage = h.onMessage || this.onMessage;
      this.onStatus = h.onStatus || this.onStatus;
      this.onRemote = h.onRemote || this.onRemote;
      this.onClose = h.onClose || this.onClose;
    },

    status(text, kind) {
      if (this.onStatus) this.onStatus(text, kind || 'info');
    },

    _wire(conn) {
      this.conn = conn;
      conn.on('open', () => {
        this.connected = true;
        this.status('已连接', 'good');
        if (this.role === 'host') {
          this.send('lobby-request', {});
        } else {
          this.send('hello', {});
        }
      });
      conn.on('data', data => {
        if (!data || !data.type) return;
        if (data.type === 'snapshot') { this.applySnapshot(data.state); return; }
        if (this.onMessage) this.onMessage(data.type, data);
      });
      conn.on('close', () => {
        this.connected = false;
        this.status('连接已断开', 'bad');
        if (this.onClose) this.onClose();
      });
      conn.on('error', err => this.status('连接错误：' + (err && err.message ? err.message : err), 'bad'));
    },

    createRoom() {
      this.disconnect();
      this.role = 'host';
      this.roomCode = makeCode();
      const id = PREFIX + this.roomCode;
      try {
        this.peer = new Peer(id, loadConfig());
      } catch (e) {
        this.status('PeerJS 初始化失败：' + e.message, 'bad');
        return;
      }
      this.peer.on('open', () => {
        this.status('房间已创建，等待客机加入', 'good');
        if (this.onMessage) this.onMessage('room-created', { code: this.roomCode });
      });
      this.peer.on('connection', conn => this._wire(conn));
      this.peer.on('error', err => {
        const msg = err && err.type === 'unavailable-id' ? '房间号冲突，请重试' : ('联机错误：' + (err && err.message ? err.message : err));
        this.status(msg, 'bad');
      });
    },

    joinRoom(code) {
      this.disconnect();
      this.role = 'guest';
      this.roomCode = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (this.roomCode.length !== 4) {
        this.status('房间号应为 4 位字母/数字', 'bad');
        return;
      }
      try {
        this.peer = new Peer(undefined, loadConfig());
      } catch (e) {
        this.status('PeerJS 初始化失败：' + e.message, 'bad');
        return;
      }
      this.peer.on('open', () => {
        this.status('正在连接房间…');
        const conn = this.peer.connect(PREFIX + this.roomCode, { reliable: true });
        this._wire(conn);
      });
      this.peer.on('error', err => {
        const msg = err && err.type === 'peer-unavailable' ? '房间不存在或主机已离线' : ('联机错误：' + (err && err.message ? err.message : err));
        this.status(msg, 'bad');
      });
    },

    send(type, data) {
      if (!this.conn || !this.connected) return false;
      try {
        this.conn.send(Object.assign({ type }, data || {}));
        return true;
      } catch (e) {
        this.status('发送失败：' + e.message, 'bad');
        return false;
      }
    },

    rawState(state) {
      const raw = JSON.parse(SG.game.serialize(state));
      delete raw.playerFaction;
      return raw;
    },

    beginGame(state, onRemote) {
      this.onRemote = onRemote;
      this.state = state;
      this.started = true;
      this.lastSent = JSON.stringify(this.rawState(state));
      this.revision = 0;
      if (this.timer) clearInterval(this.timer);
      this.timer = setInterval(() => this.tick(), 140);
      this.send('start-state', { state: this.rawState(state) });
    },

    tick() {
      const state = this.state;
      if (!this.started || !this.connected || this.applying || !state) return;
      const localAllowed = state.current === this.mySide ||
        (this.role === 'host' && state.aiFactions && state.aiFactions.includes(state.current));
      if (!localAllowed) return;
      const raw = this.rawState(state);
      const json = JSON.stringify(raw);
      if (json !== this.lastSent) {
        this.lastSent = json;
        this.send('snapshot', { state: raw, revision: ++this.revision });
      }
    },

    sendSnapshot(state) {
      if (!this.connected) return;
      const raw = this.rawState(state);
      this.lastSent = JSON.stringify(raw);
      this.send('snapshot', { state: raw, revision: ++this.revision });
    },

    applySnapshot(raw) {
      if (!raw) return;
      this.applying = true;
      try {
        const s = SG.game.deserialize(JSON.stringify(raw));
        if (!s) return;
        s.playerFaction = this.mySide;
        this.lastSent = JSON.stringify(raw);
        if (this.onRemote) this.onRemote(s);
      } finally {
        this.applying = false;
      }
    },

    disconnect() {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      this.started = false;
      this.connected = false;
      try { if (this.conn) this.conn.close(); } catch (e) { /* ignore */ }
      try { if (this.peer) this.peer.destroy(); } catch (e) { /* ignore */ }
      this.conn = null;
      this.peer = null;
      this.lastSent = '';
      this.revision = 0;
      this.state = null;
    }
  };

  SG.net = Net;
})(typeof window !== 'undefined' ? window : globalThis);
