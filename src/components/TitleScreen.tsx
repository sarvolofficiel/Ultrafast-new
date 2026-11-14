import React, { useState } from 'react';
import { Dices, Play, Server, Users, Volume2, VolumeX, Tv, Wrench, Settings } from 'lucide-react';
import {
  CAR_LIVERIES,
  type CarColorId,
  type PixelMode,
  type RaceFormat,
  type RaceFormatPreference,
  type TrackId,
} from '../game/types';
import { TRACK_METAS } from '../game/tracks';
import { CustomizerModal } from './CustomizerModal';
import { SettingsModal } from './SettingsModal';

interface TitleScreenProps {
  playerName: string;
  onPlayerNameChange: (name: string) => void;
  colorId: CarColorId;
  onColorChange: (id: CarColorId) => void;
  trackId: TrackId;
  onTrackChange: (id: TrackId) => void;
  formatPreference: RaceFormatPreference;
  raceFormat: RaceFormat;
  mapSeed: number;
  onFormatPreferenceChange: (pref: RaceFormatPreference) => void;
  onShuffleMap: () => void;
  initialRoomCode: string;
  muted: boolean;
  onToggleMute: () => void;
  pixelMode: PixelMode;
  onCyclePixelMode: () => void;
  busyMessage: string | null;
  errorMessage: string | null;
  onQuickSolo: () => void;
  onHostGame: () => void;
  onJoinGame: (code: string) => void;
  carName: string;
  onCarNameChange: (name: string) => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  playerName,
  onPlayerNameChange,
  colorId,
  onColorChange,
  trackId,
  onTrackChange,
  formatPreference,
  raceFormat,
  mapSeed,
  onFormatPreferenceChange,
  onShuffleMap,
  initialRoomCode,
  muted,
  onToggleMute,
  pixelMode,
  onCyclePixelMode,
  busyMessage,
  errorMessage,
  onQuickSolo,
  onHostGame,
  onJoinGame,
  carName,
  onCarNameChange,
}) => {
  const [joinCode, setJoinCode] = useState(initialRoomCode);
  const [showJoinInput, setShowJoinInput] = useState(initialRoomCode.length > 0);
  const [showCustomizer, setShowCustomizer] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (joinCode.trim().length < 3) return;
    onJoinGame(joinCode.trim().toUpperCase());
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-4 sm:p-6">
      {/* Top Bar: Brand Logo Lockup (Left) + Display/Audio Toggles (Right) */}
      <div className="flex items-start justify-between gap-4">
        <div className="pointer-events-auto select-none">
          <svg
            viewBox="0 0 380 86"
            className="h-16 w-auto drop-shadow-[0_4px_0_rgba(0,0,0,0.85)] sm:h-20"
            aria-label="Pixel Turbo 3D"
          >
            {/* Pixel Checkered Flag Badge */}
            <rect x="4" y="10" width="60" height="58" fill="#111827" stroke="#f8fafc" strokeWidth="4" />
            <rect x="10" y="16" width="12" height="12" fill="#f8fafc" />
            <rect x="34" y="16" width="12" height="12" fill="#f8fafc" />
            <rect x="22" y="28" width="12" height="12" fill="#f8fafc" />
            <rect x="46" y="28" width="12" height="12" fill="#f8fafc" />
            <rect x="10" y="40" width="12" height="12" fill="#f8fafc" />
            <rect x="34" y="40" width="12" height="12" fill="#f8fafc" />
            <rect x="22" y="52" width="12" height="12" fill="#ef233c" />
            <rect x="46" y="52" width="12" height="12" fill="#00f5ff" />

            {/* Title Text */}
            <text
              x="78"
              y="40"
              fill="#ffd166"
              fontFamily="Silkscreen, monospace"
              fontWeight="700"
              fontSize="28"
              letterSpacing="1"
            >
              PIXEL TURBO
            </text>
            <rect x="78" y="48" width="276" height="4" fill="#ef233c" />
            <text
              x="78"
              y="70"
              fill="#00f5ff"
              fontFamily="Chakra Petch, sans-serif"
              fontWeight="700"
              fontSize="16"
              letterSpacing="3"
            >
              COURSE 3D · HÉBERGEMENT PC P2P
            </text>
          </svg>
        </div>

        <div className="pointer-events-auto z-20 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowCustomizer(true)}
            className="arcade-panel arcade-btn flex items-center gap-1.5 px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-100 hover:border-cyan-400"
            title="Créer / Personnaliser votre voiture et voir les côtés"
          >
            <Wrench className="h-4 w-4 text-cyan-400" />
            <span className="hidden sm:inline">Garage 3D</span>
          </button>

          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="arcade-panel arcade-btn flex items-center gap-1.5 px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-100 hover:border-amber-400"
            title="Paramètres du jeu"
          >
            <Settings className="h-4 w-4 text-amber-400" />
            <span className="hidden sm:inline">Paramètres</span>
          </button>

          <button
            type="button"
            onClick={onCyclePixelMode}
            className="arcade-panel arcade-btn flex items-center gap-1.5 px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-100 hover:border-cyan-400"
            title="Basculer écran Pixel Max / Pixel 3D / HD"
          >
            <Tv className="h-4 w-4 text-cyan-400" />
            <span>
              {pixelMode === 'ultra'
                ? 'PIXEL ++'
                : pixelMode === 'retro'
                  ? 'PIXEL 3D'
                  : 'HD CRISP'}
            </span>
          </button>
          <button
            type="button"
            onClick={onToggleMute}
            className="arcade-panel arcade-btn flex items-center justify-center p-2 text-slate-100 hover:border-amber-400"
            title={muted ? 'Activer le son' : 'Couper le son'}
          >
            {muted ? (
              <VolumeX className="h-5 w-5 text-rose-400" />
            ) : (
              <Volume2 className="h-5 w-5 text-emerald-400" />
            )}
          </button>
        </div>
      </div>

      <CustomizerModal
        isOpen={showCustomizer}
        onClose={() => setShowCustomizer(false)}
        colorId={colorId}
        onColorChange={onColorChange}
        carName={carName}
        onCarNameChange={onCarNameChange}
      />

      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        muted={muted}
        onToggleMute={onToggleMute}
        pixelMode={pixelMode}
        onCyclePixelMode={onCyclePixelMode}
      />

      {/* Bottom Dock: Compact Arcade Garage & Launch Panel leaving center 3D car clear */}
      <div className="flex flex-col items-center gap-3">
        <div className="arcade-panel pointer-events-auto w-full max-w-4xl p-4 sm:p-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-12 md:items-end">
            {/* Driver Profile & Car Color */}
            <div className="space-y-2.5 md:col-span-4">
              <div>
                <label className="mb-1 block font-pixel text-[10px] uppercase tracking-wider text-slate-400">
                  Pseudo Pilote
                </label>
                <input
                  type="text"
                  maxLength={14}
                  value={playerName}
                  onChange={(e) => onPlayerNameChange(e.target.value)}
                  placeholder="PILOTE 01"
                  className="w-full border-2 border-slate-700 bg-slate-950 px-3 py-1.5 text-sm font-bold uppercase tracking-wide text-white outline-none focus:border-cyan-400"
                />
              </div>
              <div>
                <div className="mb-1 font-pixel text-[10px] uppercase tracking-wider text-slate-400">
                  Carrosserie
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {CAR_LIVERIES.map((liv) => {
                    const active = liv.id === colorId;
                    return (
                      <button
                        key={liv.id}
                        type="button"
                        onClick={() => onColorChange(liv.id)}
                        title={liv.name}
                        className={`h-7 w-7 border-2 transition-transform ${
                          active
                            ? 'scale-110 border-white ring-2 ring-cyan-400'
                            : 'border-slate-700 opacity-85 hover:opacity-100'
                        }`}
                        style={{ backgroundColor: liv.primary }}
                      />
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Biome & Random Track Selection */}
            <div className="space-y-2 md:col-span-4">
              <div className="flex items-center justify-between">
                <div className="font-pixel text-[10px] uppercase tracking-wider text-slate-400">
                  Biome &amp; Tracé{' '}
                  <span className="font-mono-num text-cyan-300">
                    #{mapSeed}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onShuffleMap}
                  title="Générer une nouvelle carte aléatoire"
                  className="arcade-btn flex items-center gap-1 border border-cyan-500/60 bg-cyan-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-cyan-200 hover:bg-cyan-500/30"
                >
                  <Dices className="h-3 w-3" />
                  <span>Aléa</span>
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {(Object.keys(TRACK_METAS) as TrackId[]).map((id) => {
                  const meta = TRACK_METAS[id];
                  const active = id === trackId;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onTrackChange(id)}
                      className={`arcade-btn border-2 px-2 py-1.5 text-left ${
                        active
                          ? 'border-amber-400 bg-amber-500/15 text-white'
                          : 'border-slate-700 bg-slate-900/90 text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      <div className="truncate text-xs font-bold">{meta.name}</div>
                      <div className="mt-0.5 text-[10px] font-semibold uppercase text-slate-400">
                        {meta.difficulty}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1">
                {(
                  [
                    { id: 'random', label: 'Aléatoire' },
                    { id: 'sprint', label: 'Sprint' },
                    { id: 'circuit', label: 'Circuit' },
                    { id: 'battle-royale', label: 'Battle Royale' },
                  ] as const
                ).map((opt) => {
                  const active = formatPreference === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onFormatPreferenceChange(opt.id)}
                      className={`arcade-btn border px-1.5 py-1 text-[10px] font-bold uppercase ${
                        active
                          ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
                          : 'border-slate-700 bg-slate-900/80 text-slate-400 hover:border-slate-500'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <div className="text-[10px] font-semibold text-slate-400">
                Mode actif :{' '}
                <span className="text-amber-300">
                  {raceFormat === 'sprint'
                    ? 'Étape Sprint (A→B)'
                    : raceFormat === 'circuit'
                      ? 'Circuit (3 tours)'
                      : 'Battle Royale (Arène Sumo)'}
                </span>
              </div>
            </div>

            {/* Mode Launch Buttons */}
            <div className="flex flex-col gap-2 md:col-span-4">
              <button
                type="button"
                disabled={Boolean(busyMessage)}
                onClick={onQuickSolo}
                className="arcade-btn flex w-full items-center justify-center gap-2 border-2 border-emerald-300 bg-emerald-500 px-4 py-2.5 font-pixel text-xs font-bold uppercase tracking-wider text-slate-950 hover:brightness-110 disabled:opacity-50"
              >
                <Play className="h-4 w-4 fill-current" />
                <span>Course Rapide (Solo)</span>
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={Boolean(busyMessage)}
                  onClick={onHostGame}
                  className="arcade-btn flex items-center justify-center gap-1.5 border-2 border-cyan-300 bg-cyan-500 px-2.5 py-2 text-xs font-bold uppercase tracking-wide text-slate-950 hover:brightness-110 disabled:opacity-50"
                >
                  <Server className="h-3.5 w-3.5" />
                  <span>Héberger (PC)</span>
                </button>
                <button
                  type="button"
                  disabled={Boolean(busyMessage)}
                  onClick={() => setShowJoinInput((v) => !v)}
                  className={`arcade-btn flex items-center justify-center gap-1.5 border-2 px-2.5 py-2 text-xs font-bold uppercase tracking-wide ${
                    showJoinInput
                      ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                      : 'border-slate-600 bg-slate-800 text-slate-100 hover:border-slate-400'
                  }`}
                >
                  <Users className="h-3.5 w-3.5" />
                  <span>Rejoindre</span>
                </button>
              </div>
            </div>
          </div>

          {/* Join by Code Drawer */}
          {showJoinInput && (
            <form
              onSubmit={handleJoinSubmit}
              className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-800 pt-3"
            >
              <span className="font-pixel text-[11px] uppercase text-slate-300">
                Code du salon :
              </span>
              <input
                type="text"
                maxLength={6}
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="EX: PX49K"
                className="font-mono-num w-36 border-2 border-slate-600 bg-slate-950 px-3 py-1.5 text-center text-sm font-extrabold uppercase tracking-widest text-cyan-300 outline-none focus:border-cyan-400"
              />
              <button
                type="submit"
                disabled={Boolean(busyMessage) || joinCode.trim().length < 3}
                className="arcade-btn border-2 border-amber-300 bg-amber-400 px-4 py-1.5 text-xs font-extrabold uppercase tracking-wider text-slate-950 hover:brightness-110 disabled:opacity-40"
              >
                Connexion au PC Hôte
              </button>
            </form>
          )}

          {(busyMessage || errorMessage) && (
            <div
              className={`mt-2.5 border px-3 py-1.5 text-xs font-bold ${
                errorMessage
                  ? 'border-rose-500/60 bg-rose-950/80 text-rose-200'
                  : 'border-cyan-500/50 bg-cyan-950/70 text-cyan-200'
              }`}
            >
              {errorMessage || busyMessage}
            </div>
          )}
        </div>

        {/* Single flat control-hint line */}
        <div className="bg-slate-950/85 px-3 py-1 font-pixel text-[10px] tracking-wider text-slate-300">
          ZQSD / Flèches Conduire · Shift / Espace Drift · E Sauter (+ Haut/Bas Flip) · F Nitro · Échap Pause
        </div>
      </div>
    </div>
  );
};
