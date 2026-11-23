// OverlayRoom: one Durable Object per organisation (idFromName(org.id)), SQLite-backed.
// Phase 0 keeps the connection model and security rules; Phase 1a adds the full sync protocol (brief §4.2).

import { DurableObject } from 'cloudflare:workers';
import type { Env } from './env';
import { PROTOCOL_VERSION, WRITE_MESSAGES, type RoomState, type ServerMessage } from '../../../packages/core/src/index';

interface Attachment {
  role: 'display' | 'control';
  output?: string;
  userId?: string;
  canWrite: boolean;
}

export class OverlayRoom extends DurableObject<Env> {
  private async state(): Promise<RoomState> {
    return (await this.ctx.storage.get<RoomState>('state')) ?? { v: 1, items: {}, updatedAt: 0 };
  }

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
    // The Worker has already checked the key or the session and role; it passes the result in these headers.
    const role = req.headers.get('x-mp-role') === 'control' ? 'control' : 'display';
    const att: Attachment = {
      role,
      output: req.headers.get('x-mp-output') || undefined,
      userId: req.headers.get('x-mp-user') || undefined,
      canWrite: role === 'control' && req.headers.get('x-mp-can-write') === '1',
    };
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server, [role]);
    server.serializeAttachment(att);
    this.send(server, { v: PROTOCOL_VERSION, type: 'hello', role, output: att.output as never, serverTime: Date.now() });
    this.send(server, { v: PROTOCOL_VERSION, type: 'snapshot', state: await this.state() });
    return new Response(null, { status: 101, webSocket: client });
  }

  private send(ws: WebSocket, m: ServerMessage) {
    try {
      ws.send(JSON.stringify(m));
    } catch {
      /* socket already closed */
    }
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const att = ws.deserializeAttachment() as Attachment;
    let msg: { v?: number; type?: string; t?: number };
    try {
      msg = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
    } catch {
      return this.send(ws, { v: 1, type: 'error', code: 'bad_json', message: 'Message was not valid JSON.' });
    }
    if (msg.type === 'ping') return this.send(ws, { v: 1, type: 'pong', t: Number(msg.t) || 0, serverTime: Date.now() });
    if ((WRITE_MESSAGES as readonly string[]).includes(String(msg.type))) {
      if (!att.canWrite) return this.send(ws, { v: 1, type: 'error', code: 'read_only', message: 'This connection is display-only.' });
      return this.send(ws, { v: 1, type: 'error', code: 'not_implemented', message: 'Editing arrives in Phase 1a.' });
    }
    this.send(ws, { v: 1, type: 'error', code: 'unknown_type', message: 'Unknown message type.' });
  }

  async webSocketClose(ws: WebSocket, code: number) {
    try {
      ws.close(code === 1005 ? 1000 : code);
    } catch {
      /* already closed */
    }
  }

  /** Called by the Worker when a display key is rotated or an organisation is suspended or deleted. */
  async disconnect(filter: { output?: string; all?: boolean }) {
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attachment;
      if (filter.all || (a.role === 'display' && a.output === filter.output)) ws.close(4001, 'Access changed');
    }
  }
}
