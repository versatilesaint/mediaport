// OverlayRoom: one Durable Object per organisation (idFromName(org.id)), SQLite-backed.
// It is the single source of truth for what is on air (brief §4.2). Controls send operations; the room
// applies them, saves, and sends every screen a fresh snapshot. Displays only ever receive their own output.

import { DurableObject } from 'cloudflare:workers';
import type { Env } from './env';
import { roleAtLeast, type Role } from '../../../packages/core/src/index';
// @ts-expect-error plain JS module shared with the browser
import { T, TPL, FIELDS, PACKS, MULTI, sample, defTargets } from '../public/assets/catalog.js';

type OutputId = 'obs' | 'freeshow' | 'stage';
const OUT_IDS: OutputId[] = ['obs', 'freeshow', 'stage'];

export interface OrgProfile {
  slug: string; name: string; short: string; mk: string; loc: string; motto: string; web: string;
  depts: string[]; lead: [string, string]; brand: Record<'p' | 'd' | 'a' | 'f' | 'm' | 'l', string>; pack: string; svc: string;
}
interface Item {
  id: string; n: number; comp: string; slot: string;
  data: Record<string, string | number>; live: Record<string, string | number>;
  targets: Record<OutputId, boolean>; liveTyping: boolean; updatedAt: number; updatedBy: string;
}
interface Timer { label: string; durationMs: number; startedAt: number; pausedAt: number; pausedTotal: number; graceMs: number; warns: number[] }
interface OutputCfg { mode: 'overlay' | 'fullframe'; quality: 'auto' | 'lite' | 'full'; fps: 30 | 60; safe: number; blackout: boolean }
export interface State {
  v: 1; seeded: boolean; items: Record<string, Item>; onAir: Record<OutputId, string[]>;
  ro: { id: string; time: string; dur: string }[]; roIdx: number; timer: Timer; timerItem: string;
  outputs: Record<OutputId, OutputCfg>; log: { t: number; msg: string; by: string }[]; autoOut: { id: string; at: number }[]; updatedAt: number;
}
interface Attachment { role: 'display' | 'control'; output?: OutputId; userId?: string; email?: string; roleName?: Role }

const ID_RE = /^i[a-z0-9]{6,20}$/;
const newId = () => 'i' + crypto.randomUUID().replace(/-/g, '').slice(0, 14);
const blank = (): State => ({
  v: 1, seeded: false, items: {}, onAir: { obs: [], freeshow: [], stage: [] }, ro: [], roIdx: -1,
  timer: { label: '', durationMs: 40 * 60000, startedAt: 0, pausedAt: 0, pausedTotal: 0, graceMs: 120000, warns: [5, 2, 1] }, timerItem: '',
  outputs: {
    obs: { mode: 'overlay', quality: 'lite', fps: 60, safe: 2, blackout: false },
    freeshow: { mode: 'overlay', quality: 'lite', fps: 30, safe: 5, blackout: false },
    stage: { mode: 'fullframe', quality: 'lite', fps: 30, safe: 5, blackout: false },
  },
  log: [], autoOut: [], updatedAt: 0,
});

export class OverlayRoom extends DurableObject<Env> {
  private st: State | null = null;
  private profile: OrgProfile | null = null;

  private async load(): Promise<State> {
    if (!this.st) {
      const saved = await this.ctx.storage.get<State>('state');
      // Rooms from before Phase 1a stored a different shape; start those fresh.
      this.st = saved && saved.onAir && saved.outputs && saved.timer ? saved : blank();
      this.profile = (await this.ctx.storage.get<OrgProfile>('profile')) ?? null;
    }
    return this.st;
  }

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
    // The Worker has already checked the display key or the session and role, and passes the result in these headers.
    const role = req.headers.get('x-mp-role') === 'control' ? 'control' : 'display';
    const att: Attachment = role === 'control'
      ? { role, userId: req.headers.get('x-mp-user') || '', email: req.headers.get('x-mp-email') || '', roleName: (req.headers.get('x-mp-role-name') || 'viewer') as Role }
      : { role, output: (req.headers.get('x-mp-output') || 'obs') as OutputId };
    const st = await this.load();
    const prof = req.headers.get('x-mp-org');
    if (prof) {
      try {
        this.profile = JSON.parse(prof) as OrgProfile;
        await this.ctx.storage.put('profile', this.profile);
      } catch { /* keep the stored profile */ }
    }
    if (role === 'control' && !st.seeded && this.profile) { this.seed(st, this.profile); await this.save(); }

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server, [role]);
    server.serializeAttachment(att);
    this.sendTo(server, { v: 1, type: 'hello', role, output: att.output, serverTime: Date.now() });
    this.sendTo(server, this.snapshotFor(att, st));
    this.presence();
    return new Response(null, { status: 101, webSocket: client });
  }

  // ---------- Seeding from the organisation's starter pack ----------
  private makeItem(n: number, by: string, data?: Record<string, string | number>): Item {
    const t = T(n);
    const base = sample(t, this.profile) as Record<string, string | number>;
    const d = { ...base, ...(data || {}) };
    return { id: newId(), n, comp: t.comp, slot: t.slot, data: d, live: { ...d }, targets: defTargets(t), liveTyping: false, updatedAt: Date.now(), updatedBy: by };
  }
  private seed(st: State, p: OrgProfile) {
    const pk = (PACKS as Record<string, { plan: [number, string, string][] }>)[p.pack] || PACKS.church;
    for (const [n, time, dur] of pk.plan) { const it = this.makeItem(n, 'setup'); st.items[it.id] = it; st.ro.push({ id: it.id, time, dur }); }
    let timer = st.ro.map((r) => st.items[r.id]!).find((i) => i.comp === 'timer');
    if (!timer) { timer = this.makeItem(222, 'setup'); st.items[timer.id] = timer; }
    st.timerItem = timer.id;
    st.timer.label = p.lead[0];
    for (const n of [94, 99]) { const it = this.makeItem(n, 'setup'); st.items[it.id] = it; }
    st.seeded = true;
    this.log(st, 'Room set up with the ' + p.pack + ' starter pack', 'MediaPort');
  }

  // ---------- Snapshots ----------
  private snapshotFor(att: Attachment, st: State) {
    if (att.role === 'control') return { v: 1, type: 'snapshot', state: st, profile: this.profile };
    // Displays get only what their own output shows: no running order, no log, no other outputs.
    const o = att.output!;
    const ids = st.onAir[o];
    const items: Record<string, Item> = {};
    for (const id of ids) if (st.items[id]) items[id] = st.items[id]!;
    if (st.timerItem && st.items[st.timerItem]) items[st.timerItem] = st.items[st.timerItem]!;
    return {
      v: 1, type: 'snapshot', profile: this.profile ? { brand: this.profile.brand, mk: this.profile.mk, short: this.profile.short, name: this.profile.name, loc: this.profile.loc } : null,
      state: { v: 1, items, onAir: { [o]: ids }, timer: st.timer, timerItem: st.timerItem, outputs: { [o]: st.outputs[o] }, updatedAt: st.updatedAt },
    };
  }
  private sendTo(ws: WebSocket, m: unknown) {
    try { ws.send(JSON.stringify(m)); } catch { /* closed */ }
  }
  private broadcast(st: State) {
    for (const ws of this.ctx.getWebSockets()) this.sendTo(ws, this.snapshotFor(ws.deserializeAttachment() as Attachment, st));
  }
  private presence() {
    const socks = this.ctx.getWebSockets().map((w) => w.deserializeAttachment() as Attachment);
    const displays: Record<string, number> = { obs: 0, freeshow: 0, stage: 0 };
    const controls: string[] = [];
    for (const a of socks) {
      if (a.role === 'display' && a.output) displays[a.output] = (displays[a.output] || 0) + 1;
      if (a.role === 'control' && a.email && !controls.includes(a.email)) controls.push(a.email);
    }
    const msg = { v: 1, type: 'presence', displays, controls };
    for (const ws of this.ctx.getWebSockets()) if ((ws.deserializeAttachment() as Attachment).role === 'control') this.sendTo(ws, msg);
  }
  private log(st: State, msg: string, by: string) {
    st.log.unshift({ t: Date.now(), msg, by });
    if (st.log.length > 80) st.log.length = 80;
  }
  private async save() {
    const st = this.st!;
    st.updatedAt = Date.now();
    await this.ctx.storage.put('state', st);
  }

  // ---------- Program operations ----------
  private take(st: State, id: string) {
    const it = st.items[id];
    if (!it) return;
    it.live = { ...it.data };
    if (it.comp === 'countdown') it.live.target = Date.now() + (Number(it.data.minutes) || 10) * 60000;
    for (const o of OUT_IDS) {
      const arr = st.onAir[o].filter((x) => x !== id);
      if (it.targets[o]) {
        const same = arr.filter((x) => st.items[x]?.slot === it.slot);
        const lim = (MULTI as Record<string, number>)[it.slot] || 1;
        const drop = same.slice(0, Math.max(0, same.length - lim + 1));
        st.onAir[o] = arr.filter((x) => !drop.includes(x)).concat(id);
      } else st.onAir[o] = arr;
    }
    if (it.slot === 'transition') {
      st.autoOut = st.autoOut.filter((a) => a.id !== id).concat({ id, at: Date.now() + 2700 });
      void this.ctx.storage.setAlarm(Math.min(...st.autoOut.map((a) => a.at)));
    }
  }
  private clear(st: State, id: string) {
    for (const o of OUT_IDS) st.onAir[o] = st.onAir[o].filter((x) => x !== id);
  }
  private isOn(st: State, id: string) {
    return OUT_IDS.some((o) => st.onAir[o].includes(id));
  }
  private label(st: State, id: string) {
    const it = st.items[id];
    return it ? `#${it.n} ${T(it.n).name}` : 'item';
  }
  private cleanData(n: number, raw: unknown): Record<string, string | number> | null {
    if (!raw || typeof raw !== 'object') return null;
    const t = T(n);
    const allowed = new Set<string>([...((FIELDS as Record<string, [string][]>)[t.comp] || []).map((f) => f[0]), ...Object.keys(sample(t, this.profile) || {})]);
    const out: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (!allowed.has(k)) continue;
      if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.max(-1e6, Math.min(1e6, v));
      else if (typeof v === 'string') out[k] = v.slice(0, 2000);
    }
    return out;
  }

  async alarm() {
    const st = await this.load();
    const nowT = Date.now();
    const due = st.autoOut.filter((a) => a.at <= nowT);
    if (!due.length) return;
    for (const a of due) this.clear(st, a.id);
    st.autoOut = st.autoOut.filter((a) => a.at > nowT);
    if (st.autoOut.length) await this.ctx.storage.setAlarm(Math.min(...st.autoOut.map((a) => a.at)));
    await this.save();
    this.broadcast(st);
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const att = ws.deserializeAttachment() as Attachment;
    let m: Record<string, unknown>;
    try {
      m = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
    } catch {
      return this.sendTo(ws, { v: 1, type: 'error', code: 'bad_json', message: 'Message was not valid JSON.' });
    }
    if (m.type === 'ping') return this.sendTo(ws, { v: 1, type: 'pong', t: Number(m.t) || 0, serverTime: Date.now() });
    if (att.role !== 'control') return this.sendTo(ws, { v: 1, type: 'error', code: 'read_only', message: 'This connection is display-only.' });

    const role = att.roleName || 'viewer';
    const by = att.email || 'someone';
    const need = (r: Role) => {
      if (roleAtLeast(role, r)) return true;
      this.sendTo(ws, { v: 1, type: 'error', code: 'forbidden', message: `This needs the ${r} role or higher.` });
      return false;
    };
    const st = await this.load();
    const id = typeof m.itemId === 'string' ? m.itemId : '';
    const out = OUT_IDS.includes(m.output as OutputId) ? (m.output as OutputId) : null;

    switch (m.type) {
      case 'item.upsert': {
        const inp = (m.item || {}) as { id?: string; n?: number; data?: unknown; targets?: Record<string, unknown>; liveTyping?: boolean };
        if (!inp.id || !ID_RE.test(inp.id)) return this.sendTo(ws, { v: 1, type: 'error', code: 'bad_id', message: 'Bad item id.' });
        let it = st.items[inp.id];
        if (!it) {
          if (!need('producer')) return;
          const n = Number(inp.n);
          if (!Number.isInteger(n) || n < 1 || n > TPL.length) return this.sendTo(ws, { v: 1, type: 'error', code: 'bad_template', message: 'Unknown template.' });
          it = this.makeItem(n, by);
          it.id = inp.id;
          st.items[it.id] = it;
          if (Object.keys(st.items).length > 400) this.prune(st);
        } else if (!need('operator')) return;
        const d = this.cleanData(it.n, inp.data);
        if (d) it.data = { ...it.data, ...d };
        if (inp.targets && roleAtLeast(role, 'producer')) for (const o of OUT_IDS) if (typeof inp.targets[o] === 'boolean') it.targets[o] = inp.targets[o] as boolean;
        if (typeof inp.liveTyping === 'boolean') it.liveTyping = inp.liveTyping;
        if (it.liveTyping && this.isOn(st, it.id)) it.live = { ...it.data, ...(it.live.target ? { target: it.live.target } : {}) };
        // Changing which outputs an on-air item targets re-applies it.
        if (inp.targets && this.isOn(st, it.id)) { const keep = it.live; this.take(st, it.id); it.live = keep; }
        it.updatedAt = Date.now(); it.updatedBy = by;
        break;
      }
      case 'take': if (!need('operator') || !st.items[id]) return; this.take(st, id); this.log(st, 'Showed ' + this.label(st, id), by); break;
      case 'clear': if (!need('operator') || !st.items[id]) return; this.clear(st, id); this.log(st, 'Cleared ' + this.label(st, id), by); break;
      case 'clearOut': if (!need('operator') || !out) return; st.onAir[out] = []; this.log(st, 'Cleared everything on ' + out, by); break;
      case 'updateLive': {
        if (!need('operator') || !st.items[id]) return;
        const it = st.items[id]!; it.live = { ...it.data, ...(it.live.target ? { target: it.live.target } : {}) };
        this.log(st, 'Updated on air ' + this.label(st, id), by); break;
      }
      case 'roGo': case 'next': case 'prev': {
        if (!need('operator') || !st.ro.length) return;
        const i = m.type === 'roGo' ? Number(m.i) : m.type === 'next' ? Math.min(st.ro.length - 1, st.roIdx + 1) : Math.max(0, st.roIdx - 1);
        if (!Number.isInteger(i) || i < 0 || i >= st.ro.length) return;
        st.roIdx = i; this.take(st, st.ro[i]!.id); this.log(st, 'Showed ' + this.label(st, st.ro[i]!.id), by); break;
      }
      case 'ro.add': {
        if (!need('producer') || !st.items[id] || st.ro.some((r) => r.id === id)) return;
        st.ro.push({ id, time: '—', dur: '—' }); break;
      }
      case 'ro.remove': {
        if (!need('producer')) return;
        const i = Number(m.i);
        if (!Number.isInteger(i) || i < 0 || i >= st.ro.length) return;
        st.ro.splice(i, 1); if (st.roIdx >= st.ro.length) st.roIdx = st.ro.length - 1; break;
      }
      case 'timer': {
        if (!need('operator')) return;
        const t = st.timer; const v = m.value; const nowT = Date.now();
        switch (m.op) {
          case 'toggle':
            if (!t.startedAt) { t.startedAt = nowT; t.pausedAt = 0; t.pausedTotal = 0; this.log(st, 'Timer started', by); }
            else if (t.pausedAt) { t.pausedTotal += nowT - t.pausedAt; t.pausedAt = 0; this.log(st, 'Timer resumed', by); }
            else { t.pausedAt = nowT; this.log(st, 'Timer paused', by); }
            break;
          case 'reset': t.startedAt = 0; t.pausedAt = 0; t.pausedTotal = 0; this.log(st, 'Timer reset', by); break;
          case 'add': t.durationMs = Math.max(60000, Math.min(6 * 3600000, t.durationMs + (Number(v) === -60000 ? -60000 : 60000))); break;
          case 'duration': { const mins = Number(v); if (Number.isFinite(mins) && mins >= 1 && mins <= 360) t.durationMs = Math.round(mins) * 60000; break; }
          case 'grace': { const mins = Number(v); if (Number.isFinite(mins) && mins >= 0 && mins <= 10) t.graceMs = Math.round(mins) * 60000; break; }
          case 'warn': { const w = Number(v); if ([5, 2, 1].includes(w)) t.warns = t.warns.includes(w) ? t.warns.filter((x) => x !== w) : [...t.warns, w]; break; }
          case 'label': t.label = String(v ?? '').slice(0, 80); break;
          default: return;
        }
        break;
      }
      case 'output': {
        if (!out) return;
        const c = st.outputs[out]; const k = m.key; const v = m.value;
        if (k === 'blackout') { if (!need('operator')) return; c.blackout = !!v; this.log(st, (v ? 'Blackout on ' : 'Blackout off ') + out, by); break; }
        if (!need('admin')) return;
        if (k === 'mode' && (v === 'overlay' || v === 'fullframe')) c.mode = v;
        else if (k === 'quality' && (v === 'auto' || v === 'lite' || v === 'full')) c.quality = v;
        else if (k === 'fps' && (v === 30 || v === 60)) c.fps = v;
        else if (k === 'safe' && typeof v === 'number' && v >= 0 && v <= 10) c.safe = v;
        else return;
        break;
      }
      default:
        return this.sendTo(ws, { v: 1, type: 'error', code: 'unknown_type', message: 'Unknown message type.' });
    }
    await this.save();
    this.broadcast(st);
  }

  /** Keeps the item map bounded: drops the oldest items that are not on air, in the running order or the timer. */
  private prune(st: State) {
    const keep = new Set([...st.ro.map((r) => r.id), st.timerItem, ...OUT_IDS.flatMap((o) => st.onAir[o])]);
    const old = Object.values(st.items).filter((i) => !keep.has(i.id)).sort((a, b) => a.updatedAt - b.updatedAt);
    for (const i of old.slice(0, old.length - 200)) delete st.items[i.id];
  }

  async webSocketClose(ws: WebSocket, code: number) {
    try { ws.close(code === 1005 ? 1000 : code); } catch { /* already closed */ }
    this.presence();
  }

  /** Called by the Worker when a display key is rotated or an organisation is suspended or deleted. */
  async disconnect(filter: { output?: string; all?: boolean }) {
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attachment;
      if (filter.all || (a.role === 'display' && a.output === filter.output)) ws.close(4001, 'Access changed');
    }
  }

  /** Called by the Worker after an organisation's profile (name, brand) changes. */
  async setProfile(p: OrgProfile) {
    this.profile = p;
    await this.ctx.storage.put('profile', p);
    const st = await this.load();
    this.broadcast(st);
  }
}

