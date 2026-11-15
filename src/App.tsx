import { useCallback, useEffect, useRef, useState } from 'react';
import { LobbyModal } from './components/LobbyModal';
import { PauseFinishModal } from './components/PauseFinishModal';
import { RaceHUD } from './components/RaceHUD';
import { TitleScreen } from './components/TitleScreen';
import { GameEngine } from './game/GameEngine';
import {
  CAR_LIVERIES,
  type CarColorId,
  type CustomLevelData,
  type DiscordAccount,
  type GamePhase,
  type HudTelemetry,
  type LobbyConfig,
  type LobbyPlayer,
  type NetworkRole,
  type PixelMode,
  type RaceFormat,
  type RaceFormatPreference,
  type RacerState,
  type TrackId,
} from './game/types';
import { generateRandomSeed, resolveRaceFormat } from './game/tracks';
import { P2PNetworkManager } from './net/p2pNetwork';

const AI_BOT_NAMES = ['PIXEL-BOT', 'TURBO-X', 'DRIFT-99', 'VOXEL-GT', 'CYBER-7'];

const INITIAL_HUD: HudTelemetry = {
  speedKmh: 0,
  gear: 1,
  rank: 1,
  totalRacers: 4,
  isLoop: false,
  isBattleRoyale: false,
  aliveCount: 4,
  knockouts: 0,
  arenaRadius: 54,
  eliminated: false,
  dashCooldown: 0,
  dashActive: false,
  stageProgressPct: 0,
  lap: 1,
  totalLaps: 3,
  raceTimeMs: 0,
  bestLapMs: null,
  nitroEnergy: 60,
  driftCharge: 0,
  driftTier: 0,
  isDrifting: false,
  boostActive: false,
  offRoad: false,
  countdownValue: 3,
  bannerText: null,
  minimapRacers: [],
};

function getInitialRoomFromUrl(): string {
  const params = new URLSearchParams(window.location.search);
  return (params.get('room') || '').trim().toUpperCase().slice(0, 6);
}

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const networkRef = useRef<P2PNetworkManager | null>(null);

  const [phase, setPhase] = useState<GamePhase>('title');
  const [role, setRole] = useState<NetworkRole>('offline');
  const [playerName, setPlayerName] = useState('PILOTE 01');
  const [colorId, setColorId] = useState<CarColorId>('crimson');
  const [trackId, setTrackId] = useState<TrackId>('baie-pixel');
  const [formatPreference, setFormatPreference] = useState<RaceFormatPreference>('random');
  const [mapSeed, setMapSeed] = useState<number>(() => generateRandomSeed());
  const [raceFormat, setRaceFormat] = useState<RaceFormat>(() =>
    resolveRaceFormat('random', mapSeed),
  );
  const [initialRoomCode] = useState<string>(getInitialRoomFromUrl);

  const [muted, setMuted] = useState(false);
  const [pixelMode, setPixelMode] = useState<PixelMode>('ultra');
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [communityLevels, setCommunityLevels] = useState<CustomLevelData[]>([]);
  const [selectedCustomLevel, setSelectedCustomLevel] =
    useState<CustomLevelData | null>(null);
  const [account, setAccount] = useState<DiscordAccount | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(() => {
    try {
      return window.sessionStorage.getItem('ultrafast_auth_token');
    } catch {
      return null;
    }
  });
  const [authBusy, setAuthBusy] = useState(false);

  const [lobbyConfig, setLobbyConfig] = useState<LobbyConfig>({
    roomCode: '',
    trackId: 'baie-pixel',
    raceFormat: 'sprint',
    formatPreference: 'random',
    mapSeed: 104729,
    totalLaps: 3,
    fillWithAI: true,
    maxPlayers: 8,
    customLevel: null,
  });
  const [lobbyPlayers, setLobbyPlayers] = useState<LobbyPlayer[]>([]);
  const [localPeerId, setLocalPeerId] = useState('local-player');

  const [hud, setHud] = useState<HudTelemetry>(INITIAL_HUD);
  const [finishRacers, setFinishRacers] = useState<RacerState[]>([]);

  // Refs to avoid stale closures inside engine/network callbacks
  const phaseRef = useRef<GamePhase>('title');
  phaseRef.current = phase;
  const roleRef = useRef<NetworkRole>('offline');
  roleRef.current = role;
  const colorRef = useRef<CarColorId>(colorId);
  colorRef.current = colorId;
  const trackRef = useRef<TrackId>(trackId);
  trackRef.current = trackId;
  const seedRef = useRef<number>(mapSeed);
  seedRef.current = mapSeed;
  const formatRef = useRef<RaceFormat>(raceFormat);
  formatRef.current = raceFormat;
  const customLevelRef = useRef<CustomLevelData | null>(selectedCustomLevel);
  customLevelRef.current = selectedCustomLevel;
  const lobbyConfigRef = useRef<LobbyConfig>(lobbyConfig);
  lobbyConfigRef.current = lobbyConfig;
  const nameRef = useRef<string>(playerName);
  nameRef.current = playerName;
  const accountRef = useRef<DiscordAccount | null>(account);
  accountRef.current = account;
  const authTokenRef = useRef<string | null>(authToken);
  authTokenRef.current = authToken;

  const fetchAccount = useCallback(
    async (overrideToken?: string | null, applyProfile = false) => {
      try {
        const tokenToUse = overrideToken !== undefined ? overrideToken : authTokenRef.current;
        const headers: Record<string, string> = {};
        if (tokenToUse) {
          headers.Authorization = `Bearer ${tokenToUse}`;
        }
        const res = await fetch('/api/auth/me', {
          credentials: 'include',
          headers,
        });
        if (!res.ok) return;
        const data = (await res.json()) as { user?: DiscordAccount | null };
        const user = data.user ?? null;
        setAccount(user);
        accountRef.current = user;
        if (user && applyProfile) {
          const nextName = user.preferredName || user.displayName.slice(0, 14);
          setPlayerName(nextName);
          nameRef.current = nextName;
          setColorId(user.preferredColorId);
          colorRef.current = user.preferredColorId;
          engineRef.current?.setupShowcaseCar(user.preferredColorId);
        }
      } catch {
        // ignore auth check errors
      }
    },
    [],
  );

  useEffect(() => {
    void fetchAccount(undefined, true);

    const handleOAuthMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (
        origin !== window.location.origin &&
        !origin.endsWith('.run.app') &&
        !origin.includes('localhost')
      ) {
        return;
      }
      const data = event.data as { type?: string; token?: string; error?: string } | null;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'OAUTH_AUTH_SUCCESS') {
        setAuthBusy(false);
        setErrorMessage(null);
        if (typeof data.token === 'string' && data.token.length > 0) {
          setAuthToken(data.token);
          authTokenRef.current = data.token;
          try {
            window.sessionStorage.setItem('ultrafast_auth_token', data.token);
          } catch {
            // ignore storage errors
          }
          void fetchAccount(data.token, true);
        } else {
          void fetchAccount(undefined, true);
        }
      } else if (data.type === 'OAUTH_AUTH_ERROR') {
        setAuthBusy(false);
        setErrorMessage(data.error || 'Connexion Discord annulée.');
      }
    };

    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, [fetchAccount]);

  const refreshCommunityLevels = useCallback(async () => {
    try {
      const res = await fetch('/api/levels');
      if (!res.ok) return;
      const data = (await res.json()) as { levels?: CustomLevelData[] };
      if (Array.isArray(data.levels)) {
        setCommunityLevels(data.levels);
      }
    } catch {
      // ignore network fetch failure
    }
  }, []);

  useEffect(() => {
    void refreshCommunityLevels();

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as {
          type?: string;
          levels?: CustomLevelData[];
        };
        if (msg.type === 'levels:updated' && Array.isArray(msg.levels)) {
          setCommunityLevels(msg.levels);
        }
      } catch {
        // ignore
      }
    };
    return () => {
      ws.close();
    };
  }, [refreshCommunityLevels]);

  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const net = new P2PNetworkManager();
    networkRef.current = net;

    const engine = new GameEngine(mount, net, {
      onHudUpdate: (nextHud) => setHud(nextHud),
      onPhaseChange: (nextPhase) => {
        phaseRef.current = nextPhase;
        setPhase(nextPhase);
      },
      onRaceFinished: (racers) => {
        setFinishRacers(racers);
        if (accountRef.current) {
          const local = racers.find((r) => r.isLocal);
          if (local) {
            const activeFmt =
              roleRef.current === 'offline'
                ? customLevelRef.current?.format ?? formatRef.current
                : lobbyConfigRef.current.raceFormat;
            const isBR = activeFmt === 'battle-royale';
            const headers: Record<string, string> = {
              'Content-Type': 'application/json',
            };
            if (authTokenRef.current) {
              headers.Authorization = `Bearer ${authTokenRef.current}`;
            }
            fetch('/api/account/race-result', {
              method: 'POST',
              credentials: 'include',
              headers,
              body: JSON.stringify({
                rank: local.rank,
                isBattleRoyale: isBR,
                won: isBR ? !local.eliminated && local.rank === 1 : local.rank === 1,
                knockouts: local.knockouts,
                bestLapMs: local.bestLapMs,
              }),
            })
              .then((r) => (r.ok ? r.json() : null))
              .then((data: { user?: DiscordAccount } | null) => {
                if (data?.user) {
                  setAccount(data.user);
                  accountRef.current = data.user;
                }
              })
              .catch(() => {
                // ignore stats error
              });
          }
        }
      },
      onPauseRequested: () => {
        if (roleRef.current === 'offline') {
          setPhase((prev) => {
            if (prev === 'paused') {
              engine.setPaused(false);
              phaseRef.current = 'racing';
              return 'racing';
            }
            if (prev === 'racing' || prev === 'countdown') {
              engine.setPaused(true);
              phaseRef.current = 'paused';
              return 'paused';
            }
            return prev;
          });
        } else {
          setPhase((prev) => {
            const next = prev === 'paused' ? 'racing' : 'paused';
            phaseRef.current = next;
            return next;
          });
        }
      },
    });
    engineRef.current = engine;
    engine.loadWorld(
      trackRef.current,
      seedRef.current,
      formatRef.current,
      customLevelRef.current,
    );

    net.setCallbacks({
      onLobbyUpdated: (cfg, players) => {
        lobbyConfigRef.current = cfg;
        setLobbyConfig(cfg);
        setLobbyPlayers(players);
        setTrackId(cfg.trackId);
        if (phaseRef.current === 'title' || phaseRef.current === 'lobby') {
          engine.setLobbyPreview(
            cfg.trackId,
            colorRef.current,
            cfg.mapSeed,
            cfg.raceFormat,
            cfg.customLevel ?? null,
          );
        }
      },
      onRaceStart: (cfg, participants) => {
        lobbyConfigRef.current = cfg;
        setLobbyConfig(cfg);
        setTrackId(cfg.trackId);
        roleRef.current = 'client';
        setRole('client');
        phaseRef.current = 'countdown';
        engine.startRace({
          trackId: cfg.trackId,
          mapSeed: cfg.mapSeed,
          raceFormat: cfg.raceFormat,
          totalLaps: cfg.totalLaps,
          role: 'client',
          localId: net.getPeerId(),
          participants,
          customLevel: cfg.customLevel ?? null,
        });
      },
      onBackToLobby: () => {
        phaseRef.current = 'lobby';
        const cfg = lobbyConfigRef.current;
        engine.setLobbyPreview(
          cfg.trackId,
          colorRef.current,
          cfg.mapSeed,
          cfg.raceFormat,
          cfg.customLevel ?? null,
        );
      },
      onSnapshot: (snap) => {
        engine.receiveSnapshot(snap);
      },
      onRemoteInput: (peerId, input) => {
        engine.receiveRemoteInput(peerId, input);
      },
      onLevelsUpdated: (levels) => {
        setCommunityLevels(levels);
      },
      onRoomClosed: (reason) => {
        roleRef.current = 'offline';
        setRole('offline');
        setErrorMessage(reason);
        phaseRef.current = 'title';
        engine.returnToTitleView(colorRef.current);
      },
      onError: (msg) => {
        setErrorMessage(msg);
      },
    });

    // Global 'M' mute shortcut
    const onGlobalKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'KeyM') {
        const next = !engine.sound.isMuted();
        engine.sound.setMuted(next);
        setMuted(next);
      }
    };
    window.addEventListener('keydown', onGlobalKey);

    return () => {
      window.removeEventListener('keydown', onGlobalKey);
      net.disconnect();
      engine.dispose();
    };
  }, []);

  const handleTrackChange = (nextTrack: TrackId) => {
    setSelectedCustomLevel(null);
    customLevelRef.current = null;
    setTrackId(nextTrack);
    engineRef.current?.loadWorld(nextTrack, mapSeed, raceFormat, null);
  };

  const handleFormatPreferenceChange = (pref: RaceFormatPreference) => {
    const nextSeed = generateRandomSeed();
    const nextFmt = resolveRaceFormat(pref, nextSeed);
    setSelectedCustomLevel(null);
    customLevelRef.current = null;
    setFormatPreference(pref);
    setMapSeed(nextSeed);
    setRaceFormat(nextFmt);
    engineRef.current?.loadWorld(trackId, nextSeed, nextFmt, null);
  };

  const handleShuffleMap = () => {
    const nextSeed = generateRandomSeed();
    const nextFmt = resolveRaceFormat(formatPreference, nextSeed);
    setSelectedCustomLevel(null);
    customLevelRef.current = null;
    setMapSeed(nextSeed);
    setRaceFormat(nextFmt);
    engineRef.current?.loadWorld(trackId, nextSeed, nextFmt, null);
  };

  const handleSelectCustomLevel = (level: CustomLevelData | null) => {
    setSelectedCustomLevel(level);
    customLevelRef.current = level;
    if (level) {
      setTrackId(level.biome);
      setRaceFormat(level.format);
      engineRef.current?.loadWorld(level.biome, mapSeed, level.format, level);
    } else {
      engineRef.current?.loadWorld(trackId, mapSeed, raceFormat, null);
    }
  };

  const handleLevelPublished = (level: CustomLevelData) => {
    setCommunityLevels((prev) => {
      const rest = prev.filter((item) => item.id !== level.id);
      return [level, ...rest];
    });
    handleSelectCustomLevel(level);
  };

  const syncAccountProfile = useCallback(
    (partial: { preferredName?: string; preferredColorId?: CarColorId }) => {
      if (!accountRef.current) return;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (authTokenRef.current) {
        headers.Authorization = `Bearer ${authTokenRef.current}`;
      }
      fetch('/api/account/profile', {
        method: 'PATCH',
        credentials: 'include',
        headers,
        body: JSON.stringify(partial),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { user?: DiscordAccount } | null) => {
          if (data?.user) {
            setAccount(data.user);
            accountRef.current = data.user;
          }
        })
        .catch(() => {
          // ignore
        });
    },
    [],
  );

  const handlePlayerNameChange = (nextName: string) => {
    setPlayerName(nextName);
    nameRef.current = nextName;
    if (accountRef.current && nextName.trim().length > 0) {
      syncAccountProfile({ preferredName: nextName });
    }
  };

  const handleColorChange = (nextColor: CarColorId) => {
    setColorId(nextColor);
    colorRef.current = nextColor;
    engineRef.current?.setupShowcaseCar(nextColor);
    if (accountRef.current) {
      syncAccountProfile({ preferredColorId: nextColor });
    }
  };

  const handleDiscordLogin = async () => {
    setErrorMessage(null);
    setAuthBusy(true);
    try {
      const res = await fetch('/api/auth/discord/url');
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setAuthBusy(false);
        setErrorMessage(
          data.error || 'Connexion Discord indisponible pour le moment.',
        );
        return;
      }
      const popup = window.open(
        data.url,
        'ultrafast_discord_oauth',
        'width=540,height=720',
      );
      if (!popup) {
        setAuthBusy(false);
        setErrorMessage(
          'Autorisez les fenêtres pop-up dans votre navigateur pour vous connecter via Discord.',
        );
      }
    } catch {
      setAuthBusy(false);
      setErrorMessage('Impossible de démarrer la connexion Discord.');
    }
  };

  const handleDiscordLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // ignore
    }
    try {
      window.sessionStorage.removeItem('ultrafast_auth_token');
    } catch {
      // ignore
    }
    setAuthToken(null);
    authTokenRef.current = null;
    setAccount(null);
    accountRef.current = null;
  };

  const handleToggleMute = () => {
    const engine = engineRef.current;
    if (!engine) return;
    const next = !muted;
    engine.sound.setMuted(next);
    setMuted(next);
  };

  const handleCyclePixelMode = () => {
    const engine = engineRef.current;
    if (!engine) return;
    const next: PixelMode =
      pixelMode === 'ultra' ? 'retro' : pixelMode === 'retro' ? 'hd' : 'ultra';
    engine.setPixelMode(next);
    setPixelMode(next);
  };

  const buildSoloParticipants = (targetFmt: RaceFormat = raceFormat) => {
    const cleanName = playerName.trim() || 'PILOTE 01';
    const availableLiveries = CAR_LIVERIES.filter((l) => l.id !== colorId);
    const botCount = targetFmt === 'battle-royale' ? 5 : 3;
    const participants = [
      { id: 'local-player', name: cleanName, colorId, isAI: false },
    ];
    for (let i = 0; i < botCount; i++) {
      participants.push({
        id: `ai-${i + 1}`,
        name: AI_BOT_NAMES[i % AI_BOT_NAMES.length],
        colorId: availableLiveries[i % availableLiveries.length].id,
        isAI: true,
      });
    }
    return participants;
  };

  const recordLevelPlay = (level: CustomLevelData | null) => {
    if (!level || !level.id || level.id === 'draft-preview') return;
    fetch(`/api/levels/${encodeURIComponent(level.id)}/play`, {
      method: 'POST',
    }).catch(() => {
      // ignore stats update error
    });
  };

  const handleQuickSolo = () => {
    const engine = engineRef.current;
    if (!engine) return;
    setErrorMessage(null);
    networkRef.current?.disconnect();
    roleRef.current = 'offline';
    setRole('offline');
    setLocalPeerId('local-player');
    phaseRef.current = 'countdown';
    const activeCustom = customLevelRef.current;
    const activeTrack = activeCustom ? activeCustom.biome : trackId;
    const activeFmt = activeCustom ? activeCustom.format : raceFormat;
    recordLevelPlay(activeCustom);
    engine.startRace({
      trackId: activeTrack,
      mapSeed,
      raceFormat: activeFmt,
      totalLaps: 3,
      role: 'offline',
      localId: 'local-player',
      participants: buildSoloParticipants(activeFmt),
      customLevel: activeCustom,
    });
  };

  const handlePlaytestCustomLevel = (draft: CustomLevelData) => {
    const engine = engineRef.current;
    if (!engine) return;
    setErrorMessage(null);
    networkRef.current?.disconnect();
    roleRef.current = 'offline';
    setRole('offline');
    setLocalPeerId('local-player');
    setSelectedCustomLevel(draft);
    customLevelRef.current = draft;
    setTrackId(draft.biome);
    setRaceFormat(draft.format);
    phaseRef.current = 'countdown';
    engine.startRace({
      trackId: draft.biome,
      mapSeed,
      raceFormat: draft.format,
      totalLaps: 3,
      role: 'offline',
      localId: 'local-player',
      participants: buildSoloParticipants(draft.format),
      customLevel: draft,
    });
  };

  const handleHostGame = async () => {
    const net = networkRef.current;
    const engine = engineRef.current;
    if (!net || !engine) return;

    setErrorMessage(null);
    setBusyMessage('Ouverture du salon sur votre PC...');
    try {
      const cleanName = playerName.trim() || 'HÔTE';
      const activeCustom = customLevelRef.current;
      const activeTrack = activeCustom ? activeCustom.biome : trackId;
      const activeFmt = activeCustom ? activeCustom.format : raceFormat;
      const { peerId } = await net.createHostRoom(
        cleanName,
        colorId,
        activeTrack,
        3,
        mapSeed,
        activeFmt,
        formatPreference,
        activeCustom,
      );
      setLocalPeerId(peerId);
      roleRef.current = 'host';
      setRole('host');
      phaseRef.current = 'lobby';
      engine.setLobbyPreview(
        activeTrack,
        colorId,
        mapSeed,
        activeFmt,
        activeCustom,
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Erreur lors de la création.',
      );
    } finally {
      setBusyMessage(null);
    }
  };

  const handleJoinGame = async (code: string) => {
    const net = networkRef.current;
    const engine = engineRef.current;
    if (!net || !engine) return;

    setErrorMessage(null);
    setBusyMessage(`Connexion au PC de l'hôte (${code})...`);
    try {
      const cleanName = playerName.trim() || 'PILOTE';
      const { peerId } = await net.joinRoom(code, cleanName, colorId);
      setLocalPeerId(peerId);
      roleRef.current = 'client';
      setRole('client');
      phaseRef.current = 'lobby';
      engine.setLobbyPreview(trackId, colorId, mapSeed, raceFormat, null);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Impossible de rejoindre le salon.',
      );
    } finally {
      setBusyMessage(null);
    }
  };

  const handleHostLaunchRace = () => {
    const net = networkRef.current;
    const engine = engineRef.current;
    if (!net || !engine || net.getRole() !== 'host') return;

    const cfg = net.getHostConfig();
    const players = net.getHostPlayers();
    const participants: Array<{
      id: string;
      name: string;
      colorId: CarColorId;
      isAI: boolean;
    }> = players.map((p) => ({
      id: p.id,
      name: p.name,
      colorId: p.colorId,
      isAI: false,
    }));

    const targetCount = cfg.raceFormat === 'battle-royale' ? 6 : 4;
    if (cfg.fillWithAI && participants.length < targetCount) {
      const usedColors = new Set(participants.map((p) => p.colorId));
      const freeLiveries = CAR_LIVERIES.filter((l) => !usedColors.has(l.id));
      let aiIdx = 0;
      while (participants.length < targetCount) {
        const liv =
          freeLiveries[aiIdx % Math.max(1, freeLiveries.length)] ??
          CAR_LIVERIES[aiIdx % CAR_LIVERIES.length];
        participants.push({
          id: `ai-${aiIdx + 1}`,
          name: AI_BOT_NAMES[aiIdx % AI_BOT_NAMES.length],
          colorId: liv.id,
          isAI: true,
        });
        aiIdx++;
      }
    }

    recordLevelPlay(cfg.customLevel ?? null);
    phaseRef.current = 'countdown';
    net.hostLaunchRace(participants);
    engine.startRace({
      trackId: cfg.trackId,
      mapSeed: cfg.mapSeed,
      raceFormat: cfg.raceFormat,
      totalLaps: cfg.totalLaps,
      role: 'host',
      localId: net.getPeerId(),
      participants,
      customLevel: cfg.customLevel ?? null,
    });
  };

  const handleExitToTitle = () => {
    networkRef.current?.disconnect();
    roleRef.current = 'offline';
    setRole('offline');
    setBusyMessage(null);
    phaseRef.current = 'title';
    engineRef.current?.returnToTitleView(colorId);
    void refreshCommunityLevels();
  };

  const handleBackToLobby = () => {
    if (role === 'host') {
      const nextSeed = generateRandomSeed();
      const nextFmt = lobbyConfig.customLevel
        ? lobbyConfig.customLevel.format
        : resolveRaceFormat(lobbyConfig.formatPreference, nextSeed);
      phaseRef.current = 'lobby';
      networkRef.current?.hostReturnToLobby();
      networkRef.current?.updateHostConfig({ mapSeed: nextSeed, raceFormat: nextFmt });
      engineRef.current?.setLobbyPreview(
        lobbyConfig.trackId,
        colorId,
        nextSeed,
        nextFmt,
        lobbyConfig.customLevel ?? null,
      );
    }
  };

  const handleRestartSolo = () => {
    if (role !== 'offline') return;
    const engine = engineRef.current;
    if (!engine) return;
    const activeCustom = customLevelRef.current;
    if (activeCustom) {
      recordLevelPlay(activeCustom);
      phaseRef.current = 'countdown';
      engine.startRace({
        trackId: activeCustom.biome,
        mapSeed,
        raceFormat: activeCustom.format,
        totalLaps: 3,
        role: 'offline',
        localId: 'local-player',
        participants: buildSoloParticipants(activeCustom.format),
        customLevel: activeCustom,
      });
      return;
    }
    const nextSeed = generateRandomSeed();
    const nextFmt = resolveRaceFormat(formatPreference, nextSeed);
    setMapSeed(nextSeed);
    setRaceFormat(nextFmt);
    phaseRef.current = 'countdown';
    engine.startRace({
      trackId,
      mapSeed: nextSeed,
      raceFormat: nextFmt,
      totalLaps: 3,
      role: 'offline',
      localId: 'local-player',
      participants: buildSoloParticipants(nextFmt),
      customLevel: null,
    });
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0b0e17]">
      {/* Isolated WebGL mount container */}
      <div ref={canvasMountRef} className="fixed inset-0 z-0" />
      {pixelMode !== 'hd' && (
        <div className="pixel-screen-overlay pointer-events-none fixed inset-0 z-[1]" />
      )}

      {phase === 'title' && (
        <TitleScreen
          playerName={playerName}
          onPlayerNameChange={handlePlayerNameChange}
          colorId={colorId}
          onColorChange={handleColorChange}
          trackId={trackId}
          onTrackChange={handleTrackChange}
          formatPreference={formatPreference}
          raceFormat={raceFormat}
          mapSeed={mapSeed}
          onFormatPreferenceChange={handleFormatPreferenceChange}
          onShuffleMap={handleShuffleMap}
          communityLevels={communityLevels}
          selectedCustomLevel={selectedCustomLevel}
          onSelectCustomLevel={handleSelectCustomLevel}
          onPlaytestCustomLevel={handlePlaytestCustomLevel}
          onLevelPublished={handleLevelPublished}
          initialRoomCode={initialRoomCode}
          muted={muted}
          onToggleMute={handleToggleMute}
          pixelMode={pixelMode}
          onCyclePixelMode={handleCyclePixelMode}
          busyMessage={busyMessage}
          errorMessage={errorMessage}
          onQuickSolo={handleQuickSolo}
          onHostGame={handleHostGame}
          onJoinGame={handleJoinGame}
          carName={playerName}
          onCarNameChange={handlePlayerNameChange}
          account={account}
          authToken={authToken}
          authBusy={authBusy}
          onDiscordLogin={handleDiscordLogin}
          onDiscordLogout={handleDiscordLogout}
        />
      )}

      {phase === 'lobby' && (
        <LobbyModal
          isHost={role === 'host'}
          localId={localPeerId}
          config={lobbyConfig}
          players={lobbyPlayers}
          communityLevels={communityLevels}
          onUpdateConfig={(partial) =>
            networkRef.current?.updateHostConfig(partial)
          }
          onLaunchRace={handleHostLaunchRace}
          onLeave={handleExitToTitle}
        />
      )}

      {(phase === 'countdown' || phase === 'racing' || phase === 'paused') && (
        <RaceHUD
          hud={hud}
          trackId={role === 'offline' ? trackId : lobbyConfig.trackId}
          mapSeed={role === 'offline' ? mapSeed : lobbyConfig.mapSeed}
          raceFormat={role === 'offline' ? raceFormat : lobbyConfig.raceFormat}
          customLevel={
            role === 'offline'
              ? selectedCustomLevel
              : (lobbyConfig.customLevel ?? null)
          }
          role={role}
          peerCount={Math.max(1, lobbyPlayers.length)}
          clientPingMs={networkRef.current?.getClientPingMs() ?? 0}
          clientTransport={
            networkRef.current?.getClientTransport() ?? 'connecting'
          }
          muted={muted}
          pixelMode={pixelMode}
          onToggleMute={handleToggleMute}
          onCyclePixelMode={handleCyclePixelMode}
          onPauseOrExit={() => {
            if (role === 'offline') {
              const nextPaused = phase !== 'paused';
              engineRef.current?.setPaused(nextPaused);
            } else {
              setPhase((prev) => (prev === 'paused' ? 'racing' : 'paused'));
            }
          }}
          onTouchChange={(partial) =>
            engineRef.current?.setTouchControls(partial)
          }
        />
      )}

      {(phase === 'paused' || phase === 'finished') && (
        <PauseFinishModal
          mode={phase}
          role={role}
          raceFormat={role === 'offline' ? raceFormat : lobbyConfig.raceFormat}
          racers={finishRacers}
          onResume={() => {
            if (role === 'offline') {
              engineRef.current?.setPaused(false);
            } else {
              setPhase('racing');
            }
          }}
          onRestart={handleRestartSolo}
          onBackToLobby={handleBackToLobby}
          onExitToTitle={handleExitToTitle}
        />
      )}
    </div>
  );
}
