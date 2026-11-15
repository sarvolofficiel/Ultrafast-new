import 'dotenv/config';
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';
const LEVELS_DIR = path.resolve(__dirname, 'data');
const LEVELS_FILE = path.join(LEVELS_DIR, 'community-levels.json');
const ACCOUNTS_FILE = path.join(LEVELS_DIR, 'accounts.json');
const SECRET_FILE = path.join(LEVELS_DIR, '.session-secret');
const SESSION_COOKIE_NAME = 'ultrafast_session';

interface Room {
  code: string;
  hostId: string;
  clients: Map<string, WebSocket>;
  createdAt: number;
}

const rooms = new Map<string, Room>();

interface StoredLevel {
  id: string;
  name: string;
  author: string;
  biome: 'baie-pixel' | 'canyon-turbo' | 'nuit-neon';
  format: 'sprint' | 'circuit' | 'battle-royale';
  roadWidth: number;
  arenaRadius: number;
  arenaMinRadius: number;
  controlPoints: Array<{ x: number; z: number }>;
  boostPads: Array<{
    u?: number;
    lateralFrac?: number;
    x?: number;
    z?: number;
    heading?: number;
  }>;
  createdAt: number;
  plays: number;
}

function ensureDataDir(): void {
  if (!fs.existsSync(LEVELS_DIR)) {
    fs.mkdirSync(LEVELS_DIR, { recursive: true });
  }
}

function loadLevelsFromDisk(): StoredLevel[] {
  try {
    if (fs.existsSync(LEVELS_FILE)) {
      const raw = fs.readFileSync(LEVELS_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.warn('Could not load community levels:', err);
  }
  return [];
}

function saveLevelsToDisk(levels: StoredLevel[]): void {
  try {
    ensureDataDir();
    fs.writeFileSync(LEVELS_FILE, JSON.stringify(levels, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Could not persist community levels:', err);
  }
}

interface StoredAccount {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  preferredName: string;
  preferredColorId: 'crimson' | 'cobalt' | 'volt' | 'magenta' | 'amber' | 'arctic';
  stats: {
    racesPlayed: number;
    wins: number;
    podiums: number;
    brWins: number;
    knockouts: number;
    bestLapMs: number | null;
  };
  createdAt: number;
  lastSeenAt: number;
}

function loadAccountsFromDisk(): Map<string, StoredAccount> {
  const map = new Map<string, StoredAccount>();
  try {
    if (fs.existsSync(ACCOUNTS_FILE)) {
      const raw = fs.readFileSync(ACCOUNTS_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item.id === 'string') {
            map.set(item.id, item as StoredAccount);
          }
        }
      }
    }
  } catch (err) {
    console.warn('Could not load accounts:', err);
  }
  return map;
}

function saveAccountsToDisk(map: Map<string, StoredAccount>): void {
  try {
    ensureDataDir();
    fs.writeFileSync(
      ACCOUNTS_FILE,
      JSON.stringify(Array.from(map.values()), null, 2),
      'utf-8',
    );
  } catch (err) {
    console.warn('Could not persist accounts:', err);
  }
}

function getSessionSecret(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  try {
    ensureDataDir();
    if (fs.existsSync(SECRET_FILE)) {
      const existing = fs.readFileSync(SECRET_FILE, 'utf-8').trim();
      if (existing.length >= 32) return existing;
    }
    const generated = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(SECRET_FILE, generated, 'utf-8');
    return generated;
  } catch {
    return process.env.DISCORD_CLIENT_SECRET || 'ultrafast-fallback-secret';
  }
}

const SESSION_SECRET = getSessionSecret();
const accountsById = loadAccountsFromDisk();
const communityLevels: StoredLevel[] = loadLevelsFromDisk();

function signToken(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(body)
    .digest('base64url');
  return `${body}.${sig}`;
}

function verifyToken<T extends Record<string, unknown>>(token: string | undefined): T | null {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(body)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8')) as T;
    if (typeof decoded.exp === 'number' && Date.now() > decoded.exp) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        out[key] = decodeURIComponent(val);
      } catch {
        out[key] = val;
      }
    }
  }
  return out;
}

function getAppBaseUrl(): string {
  const appUrl = (process.env.APP_URL || '').trim().replace(/\/+$/, '');
  if (appUrl) return appUrl;
  return `http://localhost:${PORT}`;
}

function getDiscordConfig() {
  const clientId = (process.env.DISCORD_CLIENT_ID || '').trim();
  const clientSecret = (process.env.DISCORD_CLIENT_SECRET || '').trim();
  const baseUrl = getAppBaseUrl();
  const redirectUri = `${baseUrl}/auth/discord/callback`;
  return {
    clientId,
    clientSecret,
    baseUrl,
    redirectUri,
    configured: clientId.length > 0 && clientSecret.length > 0,
  };
}

function getRequestAccount(req: express.Request): StoredAccount | null {
  const auth = req.headers.authorization;
  let token: string | undefined;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    token = auth.slice(7).trim();
  }
  if (!token) {
    const cookies = parseCookies(req.headers.cookie);
    token = cookies[SESSION_COOKIE_NAME];
  }
  const verified = verifyToken<{ uid?: string; exp?: number }>(token);
  if (!verified?.uid) return null;
  return accountsById.get(verified.uid) ?? null;
}

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
  app.use(express.json({ limit: '512kb' }));

  const server = http.createServer(app);

  // WebSocket signaling & fallback relay for Host-on-PC P2P rooms
  const wss = new WebSocketServer({ server, path: '/ws' });

  const broadcastLevelsUpdate = () => {
    const payload = JSON.stringify({ type: 'levels:updated', levels: communityLevels });
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  };

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, activeRooms: rooms.size, levelsCount: communityLevels.length });
  });

  // Discord OAuth2 Authentication & Player Accounts
  app.get('/api/auth/discord/status', (_req, res) => {
    const cfg = getDiscordConfig();
    res.json({
      configured: cfg.configured,
      redirectUri: cfg.redirectUri,
    });
  });

  app.get('/api/auth/discord/url', (_req, res) => {
    const cfg = getDiscordConfig();
    if (!cfg.configured) {
      res.status(503).json({
        error:
          'Connexion Discord non configurée sur le serveur (ajoutez DISCORD_CLIENT_ID et DISCORD_CLIENT_SECRET).',
        redirectUri: cfg.redirectUri,
      });
      return;
    }

    const state = signToken({
      nonce: crypto.randomBytes(12).toString('hex'),
      exp: Date.now() + 10 * 60 * 1000,
    });

    const params = new URLSearchParams({
      client_id: cfg.clientId,
      redirect_uri: cfg.redirectUri,
      response_type: 'code',
      scope: 'identify',
      state,
    });

    res.json({
      url: `https://discord.com/oauth2/authorize?${params.toString()}`,
    });
  });

  const handleDiscordCallback = async (req: express.Request, res: express.Response) => {
    const cfg = getDiscordConfig();
    const sendPopupResult = (ok: boolean, message: string, token?: string) => {
      const payloadJson = JSON.stringify(
        ok
          ? { type: 'OAUTH_AUTH_SUCCESS', token }
          : { type: 'OAUTH_AUTH_ERROR', error: message },
      );
      res.status(ok ? 200 : 400).setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(`<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>Connexion Discord — Ultrafast</title>
    <style>
      body { margin: 0; font-family: system-ui, sans-serif; background: #0b0e14; color: #f4f6fb; display: flex; min-height: 100vh; align-items: center; justify-content: center; text-align: center; padding: 24px; }
      .box { max-width: 380px; border: 1px solid rgba(255,255,255,0.14); background: #11151e; padding: 24px; }
      h1 { font-size: 18px; margin: 0 0 8px; }
      p { font-size: 13px; color: #94a3b8; margin: 0; }
    </style>
  </head>
  <body>
    <div class="box">
      <h1>${ok ? 'Compte Discord connecté' : 'Connexion interrompue'}</h1>
      <p>${message.replace(/[<>&"]/g, '')}</p>
    </div>
    <script>
      (function() {
        var payload = ${payloadJson};
        if (window.opener) {
          window.opener.postMessage(payload, '*');
          window.close();
        } else if (payload.type === 'OAUTH_AUTH_SUCCESS') {
          window.location.href = '/';
        }
      })();
    </script>
  </body>
</html>`);
    };

    const errorParam = typeof req.query.error === 'string' ? req.query.error : '';
    if (errorParam) {
      sendPopupResult(false, 'Autorisation Discord annulée.');
      return;
    }

    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    if (!code || !verifyToken(state)) {
      sendPopupResult(false, 'Session OAuth invalide ou expirée.');
      return;
    }
    if (!cfg.configured) {
      sendPopupResult(false, 'Identifiants Discord absents sur le serveur.');
      return;
    }

    try {
      const tokenBody = new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: cfg.redirectUri,
      });

      const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenBody.toString(),
      });

      if (!tokenRes.ok) {
        sendPopupResult(false, 'Échec de validation du code Discord.');
        return;
      }

      const tokenData = (await tokenRes.json()) as { access_token?: string };
      if (!tokenData.access_token) {
        sendPopupResult(false, 'Jeton Discord manquant.');
        return;
      }

      const userRes = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (!userRes.ok) {
        sendPopupResult(false, 'Impossible de lire le profil Discord.');
        return;
      }

      const discordUser = (await userRes.json()) as {
        id: string;
        username: string;
        global_name?: string | null;
        avatar?: string | null;
        discriminator?: string;
      };

      const displayName =
        (discordUser.global_name || discordUser.username || 'Pilote').trim().slice(0, 24);
      const avatarUrl = discordUser.avatar
        ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png?size=128`
        : null;

      const existing = accountsById.get(discordUser.id);
      const now = Date.now();
      const account: StoredAccount = existing
        ? {
            ...existing,
            username: discordUser.username,
            displayName,
            avatarUrl,
            lastSeenAt: now,
          }
        : {
            id: discordUser.id,
            username: discordUser.username,
            displayName,
            avatarUrl,
            preferredName: displayName.slice(0, 14).toUpperCase(),
            preferredColorId: 'crimson',
            stats: {
              racesPlayed: 0,
              wins: 0,
              podiums: 0,
              brWins: 0,
              knockouts: 0,
              bestLapMs: null,
            },
            createdAt: now,
            lastSeenAt: now,
          };

      accountsById.set(account.id, account);
      saveAccountsToDisk(accountsById);

      const sessionToken = signToken({
        uid: account.id,
        exp: now + 30 * 24 * 60 * 60 * 1000,
      });

      const isHttps = cfg.baseUrl.startsWith('https://');
      res.cookie(SESSION_COOKIE_NAME, sessionToken, {
        httpOnly: true,
        secure: isHttps,
        sameSite: isHttps ? 'none' : 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000,
        path: '/',
      });

      sendPopupResult(true, 'Vous pouvez revenir sur Ultrafast.', sessionToken);
    } catch (err) {
      console.error('Discord OAuth error:', err);
      sendPopupResult(false, 'Erreur réseau lors de la connexion Discord.');
    }
  };

  app.get(['/auth/discord/callback', '/auth/discord/callback/'], handleDiscordCallback);

  app.get('/api/auth/me', (req, res) => {
    const account = getRequestAccount(req);
    res.json({ user: account });
  });

  app.post('/api/auth/logout', (_req, res) => {
    const cfg = getDiscordConfig();
    const isHttps = cfg.baseUrl.startsWith('https://');
    res.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      secure: isHttps,
      sameSite: isHttps ? 'none' : 'lax',
      path: '/',
    });
    res.json({ ok: true });
  });

  app.patch('/api/account/profile', (req, res) => {
    const account = getRequestAccount(req);
    if (!account) {
      res.status(401).json({ error: 'Non connecté.' });
      return;
    }
    const body = req.body as Record<string, unknown> | undefined;
    if (body && typeof body.preferredName === 'string') {
      const clean = body.preferredName.trim().slice(0, 14);
      if (clean.length >= 1) account.preferredName = clean;
    }
    const validColors = new Set([
      'crimson',
      'cobalt',
      'volt',
      'magenta',
      'amber',
      'arctic',
    ]);
    if (body && typeof body.preferredColorId === 'string' && validColors.has(body.preferredColorId)) {
      account.preferredColorId = body.preferredColorId as StoredAccount['preferredColorId'];
    }
    account.lastSeenAt = Date.now();
    accountsById.set(account.id, account);
    saveAccountsToDisk(accountsById);
    res.json({ user: account });
  });

  app.post('/api/account/race-result', (req, res) => {
    const account = getRequestAccount(req);
    if (!account) {
      res.status(401).json({ error: 'Non connecté.' });
      return;
    }
    const body = (req.body as Record<string, unknown>) || {};
    const rank = Math.max(1, Number(body.rank) || 99);
    const isBattleRoyale = Boolean(body.isBattleRoyale);
    const won = Boolean(body.won);
    const knockouts = Math.max(0, Math.min(20, Number(body.knockouts) || 0));
    const bestLapMs =
      typeof body.bestLapMs === 'number' && Number.isFinite(body.bestLapMs) && body.bestLapMs > 1000
        ? Math.round(body.bestLapMs)
        : null;

    account.stats.racesPlayed += 1;
    if (isBattleRoyale) {
      if (won) {
        account.stats.wins += 1;
        account.stats.brWins += 1;
        account.stats.podiums += 1;
      }
      account.stats.knockouts += knockouts;
    } else {
      if (rank === 1) account.stats.wins += 1;
      if (rank <= 3) account.stats.podiums += 1;
      if (
        bestLapMs !== null &&
        (account.stats.bestLapMs === null || bestLapMs < account.stats.bestLapMs)
      ) {
        account.stats.bestLapMs = bestLapMs;
      }
    }
    account.lastSeenAt = Date.now();
    accountsById.set(account.id, account);
    saveAccountsToDisk(accountsById);
    res.json({ user: account });
  });

  app.get('/api/levels', (_req, res) => {
    res.json({ levels: communityLevels });
  });

  app.post('/api/levels', (req, res) => {
    const body = req.body as Record<string, unknown> | undefined;
    if (!body || typeof body !== 'object') {
      res.status(400).json({ error: 'Données de niveau invalides.' });
      return;
    }

    const signedIn = getRequestAccount(req);
    const rawName = String(body.name || '').trim().slice(0, 32);
    const rawAuthor =
      (signedIn ? signedIn.preferredName || signedIn.displayName : String(body.author || 'PILOTE'))
        .trim()
        .slice(0, 16) || 'PILOTE';
    const biome =
      body.biome === 'canyon-turbo' || body.biome === 'nuit-neon'
        ? body.biome
        : 'baie-pixel';
    const format =
      body.format === 'circuit' || body.format === 'battle-royale'
        ? body.format
        : 'sprint';

    if (rawName.length < 2) {
      res.status(400).json({ error: 'Le nom du niveau doit contenir au moins 2 caractères.' });
      return;
    }

    const rawPts = Array.isArray(body.controlPoints) ? body.controlPoints : [];
    const controlPoints = rawPts
      .slice(0, 48)
      .map((p: unknown) => {
        const pt = p as Record<string, unknown>;
        return {
          x: Math.round(Number(pt?.x || 0) * 100) / 100,
          z: Math.round(Number(pt?.z || 0) * 100) / 100,
        };
      })
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.z));

    if (format !== 'battle-royale' && controlPoints.length < 4) {
      res.status(400).json({ error: 'Ajoutez au moins 4 points de tracé.' });
      return;
    }

    const rawPads = Array.isArray(body.boostPads) ? body.boostPads : [];
    const boostPads = rawPads.slice(0, 24).map((p: unknown) => {
      const pad = p as Record<string, unknown>;
      return {
        u: typeof pad?.u === 'number' && Number.isFinite(pad.u) ? pad.u : undefined,
        lateralFrac:
          typeof pad?.lateralFrac === 'number' && Number.isFinite(pad.lateralFrac)
            ? Math.max(-0.7, Math.min(0.7, pad.lateralFrac))
            : undefined,
        x: typeof pad?.x === 'number' && Number.isFinite(pad.x) ? pad.x : undefined,
        z: typeof pad?.z === 'number' && Number.isFinite(pad.z) ? pad.z : undefined,
        heading:
          typeof pad?.heading === 'number' && Number.isFinite(pad.heading)
            ? pad.heading
            : undefined,
      };
    });

    const roadWidth = Math.max(14, Math.min(26, Number(body.roadWidth) || 19));
    const arenaRadius = Math.max(38, Math.min(72, Number(body.arenaRadius) || 54));
    const arenaMinRadius = Math.max(
      18,
      Math.min(arenaRadius - 10, Number(body.arenaMinRadius) || 26),
    );

    const newLevel: StoredLevel = {
      id: `lvl-${makeId(8)}`,
      name: rawName,
      author: rawAuthor,
      biome,
      format,
      roadWidth,
      arenaRadius,
      arenaMinRadius,
      controlPoints,
      boostPads,
      createdAt: Date.now(),
      plays: 0,
    };

    communityLevels.unshift(newLevel);
    if (communityLevels.length > 60) {
      communityLevels.length = 60;
    }
    saveLevelsToDisk(communityLevels);
    broadcastLevelsUpdate();
    res.status(201).json({ level: newLevel });
  });

  app.post('/api/levels/:id/play', (req, res) => {
    const level = communityLevels.find((l) => l.id === req.params.id);
    if (level) {
      level.plays += 1;
      saveLevelsToDisk(communityLevels);
      res.json({ plays: level.plays });
      return;
    }
    res.status(404).json({ error: 'Niveau introuvable' });
  });

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
    console.log(`Ultrafast server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
