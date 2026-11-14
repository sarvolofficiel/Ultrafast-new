import type {
  CarColorId,
  LobbyConfig,
  LobbyPlayer,
  PlayerInput,
  RaceFormat,
  RaceFormatPreference,
  TrackId,
  TransportType,
  WorldSnapshot,
} from '../game/types';

export type NetPacket =
  | { kind: 'lobby-sync'; config: LobbyConfig; players: LobbyPlayer[] }
  | { kind: 'race-start'; config: LobbyConfig; participants: Array<{ id: string; name: string; colorId: CarColorId; isAI: boolean }> }
  | { kind: 'back-to-lobby' }
  | { kind: 'snapshot'; snapshot: WorldSnapshot }
  | { kind: 'input'; input: PlayerInput }
  | { kind: 'player-update'; name: string; colorId: CarColorId; ready: boolean }
  | { kind: 'ping'; t: number }
  | { kind: 'pong'; t: number };

interface PeerLink {
  peerId: string;
  pc: RTCPeerConnection;
  stateChannel: RTCDataChannel | null;
  eventChannel: RTCDataChannel | null;
  transport: TransportType;
  pingMs: number;
  lastPingSent: number;
}

export interface NetCallbacks {
  onLobbyUpdated?: (config: LobbyConfig, players: LobbyPlayer[]) => void;
  onRaceStart?: (
    config: LobbyConfig,
    participants: Array<{ id: string; name: string; colorId: CarColorId; isAI: boolean }>,
  ) => void;
  onBackToLobby?: () => void;
  onSnapshot?: (snapshot: WorldSnapshot) => void;
  onRemoteInput?: (peerId: string, input: PlayerInput) => void;
  onRoomClosed?: (reason: string) => void;
  onError?: (message: string) => void;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export class P2PNetworkManager {
  private ws: WebSocket | null = null;
  private peerId = '';
  private hostId = '';
  private role: 'host' | 'client' | 'offline' = 'offline';
  private roomCode = '';
  private peers = new Map<string, PeerLink>();
  private pingTimer: number | null = null;
  private inRace = false;

  // Host-owned lobby state
  private hostPlayers: LobbyPlayer[] = [];
  private hostConfig: LobbyConfig = {
    roomCode: '',
    trackId: 'baie-pixel',
    raceFormat: 'sprint',
    formatPreference: 'random',
    mapSeed: 104729,
    totalLaps: 3,
    fillWithAI: true,
    maxPlayers: 8,
  };

  private callbacks: NetCallbacks = {};

  public setCallbacks(cb: NetCallbacks): void {
    this.callbacks = cb;
  }

  public getPeerId(): string {
    return this.peerId;
  }

  public getRole(): 'host' | 'client' | 'offline' {
    return this.role;
  }

  public getHostConfig(): LobbyConfig {
    return { ...this.hostConfig };
  }

  public getHostPlayers(): LobbyPlayer[] {
    return [...this.hostPlayers];
  }

  private connectWS(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${proto}//${window.location.host}/ws`;
      const ws = new WebSocket(url);
      this.ws = ws;

      let settled = false;

      ws.onopen = () => {
        // Wait for welcome message
      };

      ws.onmessage = (ev) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(String(ev.data));
        } catch {
          return;
        }

        if (msg.type === 'welcome' && !settled) {
          this.peerId = String(msg.peerId);
          settled = true;
          resolve();
          return;
        }

        this.handleWsMessage(msg);
      };

      ws.onerror = () => {
        if (!settled) {
          settled = true;
          reject(new Error('Impossible de joindre le serveur de signalisation.'));
        }
      };

      ws.onclose = () => {
        if (this.role !== 'offline') {
          this.callbacks.onRoomClosed?.('Connexion au serveur perdue.');
        }
      };
    });
  }

  private sendWs(data: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  public async createHostRoom(
    hostName: string,
    colorId: CarColorId,
    trackId: TrackId,
    totalLaps: number,
    mapSeed: number,
    raceFormat: RaceFormat,
    formatPreference: RaceFormatPreference,
  ): Promise<{ roomCode: string; peerId: string }> {
    this.disconnect();
    await this.connectWS();

    return new Promise((resolve, reject) => {
      const ws = this.ws;
      if (!ws) {
        reject(new Error('WebSocket non initialisé'));
        return;
      }

      const prevHandler = ws.onmessage;
      const timeout = window.setTimeout(() => {
        ws.onmessage = prevHandler;
        reject(new Error('Délai dépassé lors de la création du salon.'));
      }, 6000);

      ws.onmessage = (ev) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(String(ev.data));
        } catch {
          return;
        }

        if (msg.type === 'room:created') {
          window.clearTimeout(timeout);
          ws.onmessage = prevHandler;
          this.role = 'host';
          this.roomCode = String(msg.roomCode);
          this.peerId = String(msg.peerId);
          this.hostId = this.peerId;
          this.hostConfig = {
            roomCode: this.roomCode,
            trackId,
            raceFormat,
            formatPreference,
            mapSeed,
            totalLaps,
            fillWithAI: true,
            maxPlayers: 8,
          };
          this.hostPlayers = [
            {
              id: this.peerId,
              name: hostName,
              colorId,
              isHost: true,
              isAI: false,
              transport: 'local',
              pingMs: 0,
              ready: true,
            },
          ];
          this.startPingLoop();
          this.callbacks.onLobbyUpdated?.(this.hostConfig, this.hostPlayers);
          resolve({ roomCode: this.roomCode, peerId: this.peerId });
          return;
        }

        if (prevHandler) prevHandler.call(ws, ev);
      };

      this.sendWs({ type: 'room:create' });
    });
  }

  public async joinRoom(
    roomCode: string,
    playerName: string,
    colorId: CarColorId,
  ): Promise<{ roomCode: string; peerId: string; hostId: string }> {
    this.disconnect();
    await this.connectWS();

    return new Promise((resolve, reject) => {
      const ws = this.ws;
      if (!ws) {
        reject(new Error('WebSocket non initialisé'));
        return;
      }

      const prevHandler = ws.onmessage;
      const timeout = window.setTimeout(() => {
        ws.onmessage = prevHandler;
        reject(new Error('Délai dépassé lors de la connexion au salon.'));
      }, 6000);

      ws.onmessage = (ev) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(String(ev.data));
        } catch {
          return;
        }

        if (msg.type === 'room:error') {
          window.clearTimeout(timeout);
          ws.onmessage = prevHandler;
          reject(new Error(String(msg.message)));
          return;
        }

        if (msg.type === 'room:joined') {
          window.clearTimeout(timeout);
          ws.onmessage = prevHandler;
          this.role = 'client';
          this.roomCode = String(msg.roomCode);
          this.peerId = String(msg.peerId);
          this.hostId = String(msg.hostId);
          this.setupClientPeerConnection(this.hostId);
          this.startPingLoop();
          resolve({
            roomCode: this.roomCode,
            peerId: this.peerId,
            hostId: this.hostId,
          });
          return;
        }

        if (prevHandler) prevHandler.call(ws, ev);
      };

      this.sendWs({
        type: 'room:join',
        roomCode: roomCode.trim().toUpperCase(),
        name: playerName,
        colorId,
      });
    });
  }

  private handleWsMessage(msg: Record<string, unknown>): void {
    const type = msg.type;

    if (type === 'peer:joined' && this.role === 'host') {
      const remoteId = String(msg.peerId);
      const name = String(msg.name || 'Pilote');
      const colorId = (String(msg.colorId || 'cobalt') as CarColorId);

      // Idempotent guard
      if (!this.hostPlayers.some((p) => p.id === remoteId)) {
        this.hostPlayers.push({
          id: remoteId,
          name,
          colorId,
          isHost: false,
          isAI: false,
          transport: 'connecting',
          pingMs: 0,
          ready: true,
        });
      }

      this.initiateHostWebRTC(remoteId);
      // Immediately send lobby sync over fallback relay so UI updates instantaneously
      this.sendPacketToPeer(remoteId, {
        kind: 'lobby-sync',
        config: this.hostConfig,
        players: this.hostPlayers,
      });
      this.broadcastLobbySync();
      return;
    }

    if (type === 'peer:left' && this.role === 'host') {
      const remoteId = String(msg.peerId);
      const link = this.peers.get(remoteId);
      if (link) {
        link.pc.close();
        this.peers.delete(remoteId);
      }
      this.hostPlayers = this.hostPlayers.filter((p) => p.id !== remoteId);
      this.broadcastLobbySync();
      return;
    }

    if (type === 'room:closed') {
      const reason = String(msg.reason || 'Le salon a été fermé.');
      this.disconnect();
      this.callbacks.onRoomClosed?.(reason);
      return;
    }

    if (type === 'room:error') {
      this.callbacks.onError?.(String(msg.message));
      return;
    }

    if (type === 'signal') {
      const from = String(msg.from);
      const payload = msg.payload as Record<string, unknown>;
      void this.handleRtcSignal(from, payload);
      return;
    }

    if (type === 'relay') {
      const from = String(msg.from);
      const packet = msg.payload as NetPacket;
      this.handleNetPacket(from, packet, 'ws-relay');
    }
  }

  private initiateHostWebRTC(remoteId: string): void {
    const pc = new RTCPeerConnection(RTC_CONFIG);

    const stateChannel = pc.createDataChannel('game-state', {
      ordered: false,
      maxRetransmits: 0,
    });
    const eventChannel = pc.createDataChannel('game-events', {
      ordered: true,
    });

    const link: PeerLink = {
      peerId: remoteId,
      pc,
      stateChannel,
      eventChannel,
      transport: 'ws-relay',
      pingMs: 0,
      lastPingSent: 0,
    };
    this.peers.set(remoteId, link);

    this.attachDataChannelHandlers(link, stateChannel, false);
    this.attachDataChannelHandlers(link, eventChannel, true);

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        this.sendWs({
          type: 'signal',
          to: remoteId,
          payload: { ice: ev.candidate },
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        link.transport = 'ws-relay';
        this.updateHostPlayerTransport(remoteId, 'ws-relay');
      }
    };

    void (async () => {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        this.sendWs({
          type: 'signal',
          to: remoteId,
          payload: { sdp: pc.localDescription },
        });
      } catch {
        // Fallback relay stays active
      }
    })();
  }

  private setupClientPeerConnection(hostId: string): void {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    const link: PeerLink = {
      peerId: hostId,
      pc,
      stateChannel: null,
      eventChannel: null,
      transport: 'ws-relay',
      pingMs: 0,
      lastPingSent: 0,
    };
    this.peers.set(hostId, link);

    pc.ondatachannel = (ev) => {
      const ch = ev.channel;
      if (ch.label === 'game-state') {
        link.stateChannel = ch;
        this.attachDataChannelHandlers(link, ch, false);
      } else {
        link.eventChannel = ch;
        this.attachDataChannelHandlers(link, ch, true);
      }
    };

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        this.sendWs({
          type: 'signal',
          to: hostId,
          payload: { ice: ev.candidate },
        });
      }
    };
  }

  private attachDataChannelHandlers(
    link: PeerLink,
    ch: RTCDataChannel,
    isReliable: boolean,
  ): void {
    ch.onopen = () => {
      if (isReliable) {
        link.transport = 'webrtc';
        if (this.role === 'host') {
          this.updateHostPlayerTransport(link.peerId, 'webrtc');
          if (!this.inRace) {
            this.broadcastLobbySync();
          }
        }
      }
    };

    ch.onclose = () => {
      if (isReliable) {
        link.transport = 'ws-relay';
        if (this.role === 'host') {
          this.updateHostPlayerTransport(link.peerId, 'ws-relay');
        }
      }
    };

    ch.onmessage = (ev) => {
      try {
        const packet = JSON.parse(String(ev.data)) as NetPacket;
        this.handleNetPacket(link.peerId, packet, 'webrtc');
      } catch {
        // ignore malformed packet
      }
    };
  }

  private async handleRtcSignal(
    from: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const link = this.peers.get(from);
    if (!link) return;
    const pc = link.pc;

    try {
      if (payload.sdp) {
        const desc = payload.sdp as RTCSessionDescriptionInit;
        await pc.setRemoteDescription(new RTCSessionDescription(desc));
        if (desc.type === 'offer') {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          this.sendWs({
            type: 'signal',
            to: from,
            payload: { sdp: pc.localDescription },
          });
        }
      } else if (payload.ice) {
        await pc.addIceCandidate(
          new RTCIceCandidate(payload.ice as RTCIceCandidateInit),
        );
      }
    } catch {
      // Fallback WS relay remains operational
    }
  }

  private updateHostPlayerTransport(peerId: string, transport: TransportType): void {
    const p = this.hostPlayers.find((item) => item.id === peerId);
    if (p) {
      p.transport = transport;
    }
  }

  private handleNetPacket(
    fromPeerId: string,
    packet: NetPacket,
    via: TransportType,
  ): void {
    if (packet.kind === 'ping') {
      this.sendPacketToPeer(fromPeerId, { kind: 'pong', t: packet.t }, true);
      return;
    }

    if (packet.kind === 'pong') {
      const rtt = Math.max(1, Math.round(performance.now() - packet.t));
      const link = this.peers.get(fromPeerId);
      if (link) link.pingMs = rtt;
      if (this.role === 'host') {
        const p = this.hostPlayers.find((item) => item.id === fromPeerId);
        if (p) {
          p.pingMs = rtt;
          p.transport = link?.eventChannel?.readyState === 'open' ? 'webrtc' : via;
          if (!this.inRace) {
            this.callbacks.onLobbyUpdated?.(this.hostConfig, [...this.hostPlayers]);
          }
        }
      }
      return;
    }

    if (this.role === 'host') {
      if (packet.kind === 'input') {
        this.callbacks.onRemoteInput?.(fromPeerId, packet.input);
      } else if (packet.kind === 'player-update') {
        const p = this.hostPlayers.find((item) => item.id === fromPeerId);
        if (p) {
          p.name = packet.name.slice(0, 16);
          p.colorId = packet.colorId;
          p.ready = packet.ready;
          if (!this.inRace) {
            this.broadcastLobbySync();
          }
        }
      }
      return;
    }

    // Client receives authoritative updates from Host's PC
    if (packet.kind === 'lobby-sync') {
      if (!this.inRace) {
        this.callbacks.onLobbyUpdated?.(packet.config, packet.players);
      }
    } else if (packet.kind === 'race-start') {
      this.inRace = true;
      this.callbacks.onRaceStart?.(packet.config, packet.participants);
    } else if (packet.kind === 'back-to-lobby') {
      this.inRace = false;
      this.callbacks.onBackToLobby?.();
    } else if (packet.kind === 'snapshot') {
      this.callbacks.onSnapshot?.(packet.snapshot);
    }
  }

  private sendPacketToPeer(
    peerId: string,
    packet: NetPacket,
    reliable = true,
  ): void {
    const link = this.peers.get(peerId);
    const serialized = JSON.stringify(packet);

    if (link) {
      const ch = reliable ? link.eventChannel : link.stateChannel;
      if (ch && ch.readyState === 'open') {
        try {
          ch.send(serialized);
          return;
        } catch {
          // fallback to WS relay
        }
      }
    }

    this.sendWs({
      type: 'relay',
      to: peerId,
      payload: packet,
    });
  }

  public broadcastFromHost(packet: NetPacket, reliable = true): void {
    if (this.role !== 'host') return;
    const serialized = JSON.stringify(packet);
    let needRelay = false;

    for (const [peerId, link] of this.peers.entries()) {
      const ch = reliable ? link.eventChannel : link.stateChannel;
      if (ch && ch.readyState === 'open') {
        try {
          ch.send(serialized);
        } catch {
          this.sendWs({ type: 'relay', to: peerId, payload: packet });
        }
      } else {
        needRelay = true;
      }
    }

    if (needRelay) {
      // Send only to peers without open channel
      for (const peerId of this.peers.keys()) {
        const link = this.peers.get(peerId);
        const ch = reliable ? link?.eventChannel : link?.stateChannel;
        if (!ch || ch.readyState !== 'open') {
          this.sendWs({ type: 'relay', to: peerId, payload: packet });
        }
      }
    }
  }

  public updateHostConfig(partial: Partial<LobbyConfig>): void {
    if (this.role !== 'host') return;
    this.hostConfig = { ...this.hostConfig, ...partial };
    this.broadcastLobbySync();
  }

  public updateHostLocalProfile(name: string, colorId: CarColorId): void {
    if (this.role !== 'host') return;
    const me = this.hostPlayers.find((p) => p.id === this.peerId);
    if (me) {
      me.name = name.slice(0, 16);
      me.colorId = colorId;
      this.broadcastLobbySync();
    }
  }

  public broadcastLobbySync(): void {
    if (this.role !== 'host') return;
    this.callbacks.onLobbyUpdated?.(this.hostConfig, [...this.hostPlayers]);
    this.broadcastFromHost(
      {
        kind: 'lobby-sync',
        config: this.hostConfig,
        players: this.hostPlayers,
      },
      true,
    );
  }

  public hostLaunchRace(
    participants: Array<{ id: string; name: string; colorId: CarColorId; isAI: boolean }>,
  ): void {
    if (this.role !== 'host') return;
    this.inRace = true;
    this.broadcastFromHost(
      {
        kind: 'race-start',
        config: this.hostConfig,
        participants,
      },
      true,
    );
  }

  public hostReturnToLobby(): void {
    if (this.role !== 'host') return;
    this.inRace = false;
    this.broadcastFromHost({ kind: 'back-to-lobby' }, true);
    this.broadcastLobbySync();
  }

  public sendClientInput(input: PlayerInput): void {
    if (this.role !== 'client' || !this.hostId) return;
    this.sendPacketToPeer(this.hostId, { kind: 'input', input }, false);
  }

  public sendClientProfile(name: string, colorId: CarColorId, ready = true): void {
    if (this.role !== 'client' || !this.hostId) return;
    this.sendPacketToPeer(
      this.hostId,
      { kind: 'player-update', name, colorId, ready },
      true,
    );
  }

  public getClientPingMs(): number {
    if (this.role !== 'client' || !this.hostId) return 0;
    return this.peers.get(this.hostId)?.pingMs ?? 0;
  }

  public getClientTransport(): TransportType {
    if (this.role !== 'client' || !this.hostId) return 'local';
    const link = this.peers.get(this.hostId);
    if (!link) return 'connecting';
    return link.eventChannel?.readyState === 'open' ? 'webrtc' : 'ws-relay';
  }

  private startPingLoop(): void {
    if (this.pingTimer !== null) {
      window.clearInterval(this.pingTimer);
    }
    this.pingTimer = window.setInterval(() => {
      const now = performance.now();
      if (this.role === 'host') {
        for (const peerId of this.peers.keys()) {
          this.sendPacketToPeer(peerId, { kind: 'ping', t: now }, true);
        }
        if (!this.inRace) {
          this.broadcastLobbySync();
        }
      } else if (this.role === 'client' && this.hostId) {
        this.sendPacketToPeer(this.hostId, { kind: 'ping', t: now }, true);
      }
    }, 1500);
  }

  public disconnect(): void {
    this.inRace = false;
    if (this.pingTimer !== null) {
      window.clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    for (const link of this.peers.values()) {
      try {
        link.stateChannel?.close();
        link.eventChannel?.close();
        link.pc.close();
      } catch {
        // ignore
      }
    }
    this.peers.clear();
    if (this.ws) {
      const oldWs = this.ws;
      this.ws = null;
      oldWs.onopen = null;
      oldWs.onmessage = null;
      oldWs.onerror = null;
      oldWs.onclose = null;
      try {
        if (oldWs.readyState === WebSocket.OPEN) {
          oldWs.send(JSON.stringify({ type: 'room:leave' }));
        }
        oldWs.close();
      } catch {
        // ignore
      }
    }
    this.role = 'offline';
    this.roomCode = '';
    this.hostId = '';
    this.hostPlayers = [];
  }
}
