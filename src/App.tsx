import { useEffect, useRef, useState } from 'react';
import { LobbyModal } from './components/LobbyModal';
import { PauseFinishModal } from './components/PauseFinishModal';
import { RaceHUD } from './components/RaceHUD';
import { TitleScreen } from './components/TitleScreen';
import { GameEngine } from './game/GameEngine';
import {
  CAR_LIVERIES,
  type CarColorId,
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

  const [lobbyConfig, setLobbyConfig] = useState<LobbyConfig>({
    roomCode: '',
    trackId: 'baie-pixel',
    raceFormat: 'sprint',
    formatPreference: 'random',
    mapSeed: 104729,
    totalLaps: 3,
    fillWithAI: true,
    maxPlayers: 8,
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
  const lobbyConfigRef = useRef<LobbyConfig>(lobbyConfig);
  lobbyConfigRef.current = lobbyConfig;
  const nameRef = useRef<string>(playerName);
  nameRef.current = playerName;

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
      onRaceFinished: (racers) => setFinishRacers(racers),
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
    engine.loadWorld(trackRef.current, seedRef.current, formatRef.current);

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
        );
      },
      onSnapshot: (snap) => {
        engine.receiveSnapshot(snap);
      },
      onRemoteInput: (peerId, input) => {
        engine.receiveRemoteInput(peerId, input);
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
    setTrackId(nextTrack);
    engineRef.current?.loadWorld(nextTrack, mapSeed, raceFormat);
  };

  const handleFormatPreferenceChange = (pref: RaceFormatPreference) => {
    const nextSeed = generateRandomSeed();
    const nextFmt = resolveRaceFormat(pref, nextSeed);
    setFormatPreference(pref);
    setMapSeed(nextSeed);
    setRaceFormat(nextFmt);
    engineRef.current?.loadWorld(trackId, nextSeed, nextFmt);
  };

  const handleShuffleMap = () => {
    const nextSeed = generateRandomSeed();
    const nextFmt = resolveRaceFormat(formatPreference, nextSeed);
    setMapSeed(nextSeed);
    setRaceFormat(nextFmt);
    engineRef.current?.loadWorld(trackId, nextSeed, nextFmt);
  };

  const handleColorChange = (nextColor: CarColorId) => {
    setColorId(nextColor);
    engineRef.current?.setupShowcaseCar(nextColor);
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

  const buildSoloParticipants = () => {
    const cleanName = playerName.trim() || 'PILOTE 01';
    const availableLiveries = CAR_LIVERIES.filter((l) => l.id !== colorId);
    const participants = [
      { id: 'local-player', name: cleanName, colorId, isAI: false },
    ];
    for (let i = 0; i < 3; i++) {
      participants.push({
        id: `ai-${i + 1}`,
        name: AI_BOT_NAMES[i],
        colorId: availableLiveries[i % availableLiveries.length].id,
        isAI: true,
      });
    }
    return participants;
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
    engine.startRace({
      trackId,
      mapSeed,
      raceFormat,
      totalLaps: 3,
      role: 'offline',
      localId: 'local-player',
      participants: buildSoloParticipants(),
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
      const { peerId } = await net.createHostRoom(
        cleanName,
        colorId,
        trackId,
        3,
        mapSeed,
        raceFormat,
        formatPreference,
      );
      setLocalPeerId(peerId);
      roleRef.current = 'host';
      setRole('host');
      phaseRef.current = 'lobby';
      engine.setLobbyPreview(trackId, colorId, mapSeed, raceFormat);
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
      engine.setLobbyPreview(trackId, colorId, mapSeed, raceFormat);
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

    if (cfg.fillWithAI && participants.length < 4) {
      const usedColors = new Set(participants.map((p) => p.colorId));
      const freeLiveries = CAR_LIVERIES.filter((l) => !usedColors.has(l.id));
      let aiIdx = 0;
      while (participants.length < 4) {
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
    });
  };

  const handleExitToTitle = () => {
    networkRef.current?.disconnect();
    roleRef.current = 'offline';
    setRole('offline');
    setBusyMessage(null);
    phaseRef.current = 'title';
    engineRef.current?.returnToTitleView(colorId);
  };

  const handleBackToLobby = () => {
    if (role === 'host') {
      const nextSeed = generateRandomSeed();
      const nextFmt = resolveRaceFormat(lobbyConfig.formatPreference, nextSeed);
      phaseRef.current = 'lobby';
      networkRef.current?.hostReturnToLobby();
      networkRef.current?.updateHostConfig({ mapSeed: nextSeed, raceFormat: nextFmt });
      engineRef.current?.setLobbyPreview(lobbyConfig.trackId, colorId, nextSeed, nextFmt);
    }
  };

  const handleRestartSolo = () => {
    if (role !== 'offline') return;
    const engine = engineRef.current;
    if (!engine) return;
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
      participants: buildSoloParticipants(),
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
          onPlayerNameChange={setPlayerName}
          colorId={colorId}
          onColorChange={handleColorChange}
          trackId={trackId}
          onTrackChange={handleTrackChange}
          formatPreference={formatPreference}
          raceFormat={raceFormat}
          mapSeed={mapSeed}
          onFormatPreferenceChange={handleFormatPreferenceChange}
          onShuffleMap={handleShuffleMap}
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
          onCarNameChange={setPlayerName}
        />
      )}

      {phase === 'lobby' && (
        <LobbyModal
          isHost={role === 'host'}
          localId={localPeerId}
          config={lobbyConfig}
          players={lobbyPlayers}
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
