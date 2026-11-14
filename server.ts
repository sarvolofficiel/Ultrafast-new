import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

interface Room {
  code: string;
  hostId: string;
  clients: Map<string, WebSocket>;
  createdAt: number;
}

const rooms = new Map<string, Room>();

function makeId(len = 8): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < len; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function makeRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = '';
    for (let i = 0; i < 5; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    if (!rooms.has(code)) return code;
  }
  return makeId(5).toUpperCase();
}

function safeSend(ws: WebSocket | undefined, data: unknown): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(data));
}

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, activeRooms: rooms.size });
  });

  const server = http.createServer(app);

  // WebSocket signaling & fallback relay for Host-on-PC P2P rooms
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    const peerId = makeId(10);
    let currentRoomCode: string | null = null;
    let isAlive = true;

    ws.on('pong', () => {
      isAlive = true;
    });

    safeSend(ws, { type: 'welcome', peerId });

    const leaveCurrentRoom = () => {
      if (!currentRoomCode) return;
      const room = rooms.get(currentRoomCode);
      if (room) {
        room.clients.delete(peerId);
        if (room.hostId === peerId) {
          for (const [otherId, otherWs] of room.clients.entries()) {
            if (otherId !== peerId) {
              safeSend(otherWs, { type: 'room:closed', reason: "L'hôte a fermé le salon." });
            }
          }
          rooms.delete(currentRoomCode);
        } else {
          const hostWs = room.clients.get(room.hostId);
          safeSend(hostWs, { type: 'peer:left', peerId });
        }
      }
      currentRoomCode = null;
    };

    ws.on('message', (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }

      const type = msg.type;

      if (type === 'ping') {
        safeSend(ws, { type: 'pong', t: msg.t });
        return;
      }

      if (type === 'room:create') {
        leaveCurrentRoom();
        const code = makeRoomCode();
        const room: Room = {
          code,
          hostId: peerId,
          clients: new Map([[peerId, ws]]),
          createdAt: Date.now(),
        };
        rooms.set(code, room);
        currentRoomCode = code;
        safeSend(ws, { type: 'room:created', roomCode: code, peerId });
        return;
      }

      if (type === 'room:join') {
        leaveCurrentRoom();
        const rawCode = String(msg.roomCode || '').trim().toUpperCase();
        const room = rooms.get(rawCode);
        if (!room) {
          safeSend(ws, {
            type: 'room:error',
            message: `Salon "${rawCode}" introuvable. Vérifiez le code auprès de l'hôte.`,
          });
          return;
        }
        if (room.clients.size >= 8) {
          safeSend(ws, {
            type: 'room:error',
            message: 'Ce salon est complet (8 joueurs maximum).',
          });
          return;
        }

        room.clients.set(peerId, ws);
        currentRoomCode = rawCode;

        safeSend(ws, {
          type: 'room:joined',
          roomCode: rawCode,
          peerId,
          hostId: room.hostId,
        });

        const hostWs = room.clients.get(room.hostId);
        safeSend(hostWs, {
          type: 'peer:joined',
          peerId,
          name: String(msg.name || 'Pilote').slice(0, 16),
          colorId: String(msg.colorId || 'cobalt'),
        });
        return;
      }

      if (type === 'room:leave') {
        leaveCurrentRoom();
        return;
      }

      if (type === 'signal' && currentRoomCode) {
        const room = rooms.get(currentRoomCode);
        if (!room) return;
        const targetId = String(msg.to || '');
        const targetWs = room.clients.get(targetId);
        if (targetWs) {
          safeSend(targetWs, {
            type: 'signal',
            from: peerId,
            payload: msg.payload,
          });
        }
        return;
      }

      if (type === 'relay' && currentRoomCode) {
        const room = rooms.get(currentRoomCode);
        if (!room) return;
        const targetId = String(msg.to || '');
        if (targetId === 'broadcast') {
          for (const [otherId, otherWs] of room.clients.entries()) {
            if (otherId !== peerId) {
              safeSend(otherWs, {
                type: 'relay',
                from: peerId,
                payload: msg.payload,
              });
            }
          }
        } else {
          const targetWs = room.clients.get(targetId);
          if (targetWs) {
            safeSend(targetWs, {
              type: 'relay',
              from: peerId,
              payload: msg.payload,
            });
          }
        }
      }
    });

    ws.on('close', () => {
      leaveCurrentRoom();
    });

    ws.on('error', () => {
      leaveCurrentRoom();
    });

    // Store heartbeat check on ws
    (ws as WebSocket & { _checkAlive?: () => boolean })._checkAlive = () => {
      if (!isAlive) {
        ws.terminate();
        return false;
      }
      isAlive = false;
      ws.ping();
      return true;
    };
  });

  const heartbeat = setInterval(() => {
    wss.clients.forEach((client) => {
      const fn = (client as WebSocket & { _checkAlive?: () => boolean })._checkAlive;
      if (fn) fn();
    });
  }, 25000);

  wss.on('close', () => clearInterval(heartbeat));

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : undefined,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Pixel Turbo 3D server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
