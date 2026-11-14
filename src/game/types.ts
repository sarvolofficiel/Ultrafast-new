export type TrackId = 'baie-pixel' | 'canyon-turbo' | 'nuit-neon';

export type RaceFormat = 'sprint' | 'circuit';
export type RaceFormatPreference = 'random' | 'sprint' | 'circuit';

export type CarColorId =
  | 'crimson'
  | 'cobalt'
  | 'volt'
  | 'magenta'
  | 'amber'
  | 'arctic';

export interface CarLivery {
  id: CarColorId;
  name: string;
  primary: string;
  secondary: string;
  accent: string;
  number: string;
}

export const CAR_LIVERIES: CarLivery[] = [
  {
    id: 'crimson',
    name: 'Rouge GT',
    primary: '#ef233c',
    secondary: '#ffffff',
    accent: '#ffd166',
    number: '01',
  },
  {
    id: 'cobalt',
    name: 'Bleu Rallye',
    primary: '#0077ff',
    secondary: '#ffe600',
    accent: '#00f5d4',
    number: '07',
  },
  {
    id: 'volt',
    name: 'Vert Volt',
    primary: '#38e54d',
    secondary: '#111827',
    accent: '#faff00',
    number: '24',
  },
  {
    id: 'magenta',
    name: 'Cyber Rose',
    primary: '#ff2a85',
    secondary: '#18182f',
    accent: '#00f5ff',
    number: '88',
  },
  {
    id: 'amber',
    name: 'Or Turbo',
    primary: '#ff9f1c',
    secondary: '#1d1e2c',
    accent: '#ffffff',
    number: '13',
  },
  {
    id: 'arctic',
    name: 'Blanc Apex',
    primary: '#f1f5f9',
    secondary: '#0f172a',
    accent: '#ef233c',
    number: '99',
  },
];

export type GamePhase =
  | 'title'
  | 'lobby'
  | 'countdown'
  | 'racing'
  | 'paused'
  | 'finished';

export type NetworkRole = 'offline' | 'host' | 'client';

export type TransportType = 'local' | 'webrtc' | 'ws-relay' | 'connecting';

export interface PlayerInput {
  throttle: number; // 0..1
  brake: number; // 0..1
  steer: number; // -1 (right) to +1 (left)
  drift: boolean;
  boost: boolean;
  jump: boolean;
  seq: number;
}

export interface RacerState {
  id: string;
  name: string;
  colorId: CarColorId;
  isAI: boolean;
  isLocal: boolean;
  slotIndex: number;

  // Physics kinematics
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  heading: number; // radians, +Z or track direction
  pitch: number; // vertical flip rotation in radians
  airFlipAccum: number; // accumulated vertical rotation while airborne
  speed: number; // scalar forward speed (m/s)
  steerAngle: number; // visual front wheel angle
  visualYawOffset: number; // drift slip angle
  driftDir: number; // -1, 0, 1
  driftCharge: number; // 0..3
  boostTimer: number; // remaining boost seconds
  nitroEnergy: number; // 0..100 manual nitro energy
  offRoad: boolean;
  braking: boolean;

  // Race progression
  segIndex: number;
  lap: number; // 1..totalLaps
  maxCheckpoint: number; // -1 before first start-line crossing, then 0..3 checkpoints
  totalProgress: number; // monotonic race progress for ranking
  rank: number; // 1..N
  finished: boolean;
  finishTimeMs: number;
  lapStartTimeMs: number;
  bestLapMs: number | null;
  lastLapMs: number | null;
}

export interface LobbyPlayer {
  id: string;
  name: string;
  colorId: CarColorId;
  isHost: boolean;
  isAI: boolean;
  transport: TransportType;
  pingMs: number;
  ready: boolean;
}

export interface LobbyConfig {
  roomCode: string;
  trackId: TrackId;
  raceFormat: RaceFormat;
  formatPreference: RaceFormatPreference;
  mapSeed: number;
  totalLaps: number;
  fillWithAI: boolean;
  maxPlayers: number;
}

export interface WorldSnapshot {
  tick: number;
  raceElapsedMs: number;
  countdownValue: number; // 3, 2, 1, 0 (GO)
  phase: 'countdown' | 'racing' | 'finished';
  racers: Array<{
    id: string;
    name: string;
    colorId: CarColorId;
    isAI: boolean;
    slotIndex: number;
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    heading: number;
    pitch: number;
    speed: number;
    steerAngle: number;
    visualYawOffset: number;
    driftDir: number;
    driftCharge: number;
    boostTimer: number;
    nitroEnergy: number;
    offRoad: boolean;
    braking: boolean;
    segIndex: number;
    lap: number;
    totalProgress: number;
    rank: number;
    finished: boolean;
    finishTimeMs: number;
    bestLapMs: number | null;
    lastLapMs: number | null;
  }>;
  events?: Array<{
    type: 'collision' | 'boost' | 'lap' | 'jump';
    x: number;
    z: number;
    racerId?: string;
    intensity?: number;
  }>;
}

export type PixelMode = 'ultra' | 'retro' | 'hd';

export interface HudTelemetry {
  speedKmh: number;
  gear: number;
  rank: number;
  totalRacers: number;
  isLoop: boolean;
  stageProgressPct: number;
  lap: number;
  totalLaps: number;
  raceTimeMs: number;
  bestLapMs: number | null;
  nitroEnergy: number;
  driftCharge: number;
  driftTier: 0 | 1 | 2 | 3;
  isDrifting: boolean;
  boostActive: boolean;
  offRoad: boolean;
  countdownValue: number;
  bannerText: string | null;
  minimapRacers: Array<{
    id: string;
    x: number;
    z: number;
    color: string;
    isLocal: boolean;
  }>;
}

export interface TrackMeta {
  id: TrackId;
  name: string;
  subtitle: string;
  difficulty: 'Facile' | 'Moyen' | 'Pro';
  skyTop: string;
  skyBottom: string;
  fogColor: string;
  groundColor: string;
  accentColor: string;
  roadWidth: number;
}
