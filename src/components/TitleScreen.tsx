import React, { useState } from 'react';
import {
  ChevronRight,
  Dices,
  Globe,
  Hammer,
  Play,
  Settings,
  SlidersHorizontal,
  Users,
  Volume2,
  VolumeX,
  Wrench,
} from 'lucide-react';
import {
  CAR_LIVERIES,
  type CarColorId,
  type CustomLevelData,
  type DiscordAccount,
  type PixelMode,
  type RaceFormat,
  type RaceFormatPreference,
  type TrackId,
} from '../game/types';
import { TRACK_METAS } from '../game/tracks';
import { AccountModal } from './AccountModal';
import { CustomizerModal } from './CustomizerModal';
import { LevelEditorModal } from './LevelEditorModal';
import { SettingsModal } from './SettingsModal';

const DiscordIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
  </svg>
);

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
  communityLevels: CustomLevelData[];
  selectedCustomLevel: CustomLevelData | null;
  onSelectCustomLevel: (level: CustomLevelData | null) => void;
  onPlaytestCustomLevel: (level: CustomLevelData) => void;
  onLevelPublished: (level: CustomLevelData) => void;
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
  account: DiscordAccount | null;
  authToken?: string | null;
  authBusy?: boolean;
  onDiscordLogin: () => void;
  onDiscordLogout: () => void;
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
  communityLevels,
  selectedCustomLevel,
  onSelectCustomLevel,
  onPlaytestCustomLevel,
  onLevelPublished,
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
  account,
  authToken = null,
  authBusy = false,
  onDiscordLogin,
  onDiscordLogout,
}) => {
  const [joinCode, setJoinCode] = useState(initialRoomCode);
  const [showJoinInput, setShowJoinInput] = useState(initialRoomCode.length > 0);
  const [showCustomizer, setShowCustomizer] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [trackTab, setTrackTab] = useState<'classic' | 'online'>('classic');

  const currentLivery =
    CAR_LIVERIES.find((l) => l.id === colorId) ?? CAR_LIVERIES[0];

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (joinCode.trim().length < 3) return;
    onJoinGame(joinCode.trim().toUpperCase());
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between">
      {/* Soft left gradient scrim so menu typography sits cleanly over the 3D scene */}
      <div className="title-left-scrim pointer-events-none fixed inset-0 z-0" />

      {/* Top Bar: Discord Account + Audio & Display Controls (Right) */}
      <div className="pointer-events-auto relative z-10 flex items-center justify-end gap-2 px-5 pt-4 sm:px-8 sm:pt-6">
        {account ? (
          <button
            type="button"
            onClick={() => setShowAccount(true)}
            className="game-surface arcade-btn flex items-center gap-2.5 px-3 py-1.5 text-xs font-semibold text-white hover:border-white/35"
            title="Voir mon compte pilote"
          >
            {account.avatarUrl ? (
              <img
                src={account.avatarUrl}
                alt={account.displayName}
                referrerPolicy="no-referrer"
                className="h-5 w-5 object-cover"
              />
            ) : (
              <DiscordIcon className="h-4 w-4 text-[#5865F2]" />
            )}
            <span className="max-w-[130px] truncate">{account.displayName}</span>
            <span className="font-mono-num text-[11px] text-[#f5b700]">
              {account.stats.wins}V
            </span>
          </button>
        ) : (
          <button
            type="button"
            disabled={authBusy}
            onClick={onDiscordLogin}
            className="arcade-btn flex items-center gap-2 border border-[#5865F2]/80 bg-[#5865F2] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#4752c4] disabled:opacity-60"
          >
            <DiscordIcon className="h-4 w-4" />
            <span>{authBusy ? 'Connexion...' : 'Connexion Discord'}</span>
          </button>
        )}

        <button
          type="button"
          onClick={onCyclePixelMode}
          className="game-surface arcade-btn flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-white/30 hover:text-white"
          title="Basculer le rendu"
        >
          <SlidersHorizontal className="h-3.5 w-3.5 text-slate-400" />
          <span>
            {pixelMode === 'ultra'
              ? 'Pixel ++'
              : pixelMode === 'retro'
                ? 'Pixel 3D'
                : 'HD'}
          </span>
        </button>
        <button
          type="button"
          onClick={onToggleMute}
          className="game-surface arcade-btn flex items-center justify-center p-2 text-slate-200 hover:border-white/30 hover:text-white"
          title={muted ? 'Activer le son' : 'Couper le son'}
        >
          {muted ? (
            <VolumeX className="h-4 w-4 text-[#ff2e3b]" />
          ) : (
            <Volume2 className="h-4 w-4 text-slate-200" />
          )}
        </button>
      </div>

      {/* Main Left Rail: Wordmark + Course Launch + Menu Links, leaving right/center open for the 3D car */}
      <div className="relative z-10 flex flex-1 items-center px-5 pb-4 sm:px-8">
        <div className="pointer-events-auto flex max-h-[84vh] w-full max-w-[390px] flex-col gap-5 overflow-y-auto pr-1">
          {/* Wordmark */}
          <div className="select-none">
            <h1 className="font-display text-4xl font-bold italic tracking-tight text-white sm:text-5xl">
              ULTRAFAST
            </h1>
            <div className="mt-1.5 h-[3px] w-24 bg-[#ff2e3b]" />
          </div>

          {/* Driver & Livery Compact Row */}
          <div className="flex items-center gap-2.5">
            <span
              className="h-9 w-2 shrink-0"
              style={{ backgroundColor: currentLivery.primary }}
            />
            <input
              type="text"
              maxLength={14}
              value={playerName}
              onChange={(e) => onPlayerNameChange(e.target.value)}
              placeholder="Pilote 01"
              aria-label="Pseudo du pilote"
              className="game-surface h-9 min-w-0 flex-1 px-3 text-sm font-semibold text-white outline-none transition-colors placeholder:text-slate-500 focus:border-white/40"
            />
            <button
              type="button"
              onClick={() => setShowCustomizer(true)}
              className="game-surface arcade-btn flex h-9 shrink-0 items-center gap-1.5 px-3 text-xs font-semibold text-slate-200 hover:border-white/30 hover:text-white"
              title="Changer la voiture et la couleur"
            >
              <Wrench className="h-3.5 w-3.5 text-slate-400" />
              <span>Garage</span>
            </button>
          </div>

          {/* Track & Mode Selector */}
          <div className="game-surface p-3.5">
            <div className="mb-2.5 flex items-center justify-between gap-2 border-b border-white/10 pb-2">
              <div className="flex items-center gap-4 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    setTrackTab('classic');
                    if (selectedCustomLevel) onSelectCustomLevel(null);
                  }}
                  className={`pb-0.5 transition-colors whitespace-nowrap ${
                    trackTab === 'classic'
                      ? 'border-b-2 border-[#ff2e3b] text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Circuits
                </button>
                <button
                  type="button"
                  onClick={() => setTrackTab('online')}
                  className={`flex items-center gap-1.5 pb-0.5 transition-colors whitespace-nowrap ${
                    trackTab === 'online'
                      ? 'border-b-2 border-[#ff2e3b] text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Globe className="h-3.5 w-3.5" />
                  <span>Online ({communityLevels.length})</span>
                </button>
              </div>

              {trackTab === 'classic' && (
                <button
                  type="button"
                  onClick={onShuffleMap}
                  title="Générer un autre tracé"
                  className="flex items-center gap-1 text-xs font-mono-num text-slate-400 transition-colors hover:text-white"
                >
                  <Dices className="h-3.5 w-3.5" />
                  <span>#{mapSeed}</span>
                </button>
              )}
            </div>

            {trackTab === 'classic' ? (
              <div className="space-y-2.5">
                <div className="grid grid-cols-3 gap-1.5">
                  {(Object.keys(TRACK_METAS) as TrackId[]).map((id) => {
                    const meta = TRACK_METAS[id];
                    const active = !selectedCustomLevel && id === trackId;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => {
                          onSelectCustomLevel(null);
                          onTrackChange(id);
                        }}
                        className={`arcade-btn border px-2.5 py-2 text-left ${
                          active
                            ? 'border-white/70 bg-white/12 text-white'
                            : 'border-white/8 bg-white/[0.03] text-slate-300 hover:border-white/25'
                        }`}
                      >
                        <div className="truncate text-xs font-semibold">{meta.name}</div>
                        <div className="mt-0.5 text-[11px] text-slate-400">
                          {meta.difficulty}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-4 gap-1 bg-black/35 p-1">
                  {(
                    [
                      { id: 'random', label: 'Aléa' },
                      { id: 'sprint', label: 'Sprint' },
                      { id: 'circuit', label: 'Circuit' },
                      { id: 'battle-royale', label: 'Sumo' },
                    ] as const
                  ).map((opt) => {
                    const active = !selectedCustomLevel && formatPreference === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          onSelectCustomLevel(null);
                          onFormatPreferenceChange(opt.id);
                        }}
                        className={`py-1.5 text-[11px] font-semibold transition-colors whitespace-nowrap ${
                          active
                            ? 'bg-white text-[#0b0e14]'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Mode sélectionné</span>
                  <span className="font-semibold text-[#f5b700]">
                    {raceFormat === 'sprint'
                      ? 'Étape Sprint'
                      : raceFormat === 'circuit'
                        ? 'Circuit (3 tours)'
                        : 'Battle Royale Sumo'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {communityLevels.length === 0 ? (
                  <div className="py-4 text-center text-xs text-slate-400">
                    Aucun niveau publié pour le moment.{' '}
                    <button
                      type="button"
                      onClick={() => setShowEditor(true)}
                      className="font-semibold text-white underline hover:text-[#f5b700]"
                    >
                      Créer le premier
                    </button>
                  </div>
                ) : (
                  <div className="max-h-36 space-y-1 overflow-y-auto pr-1">
                    {communityLevels.map((lvl) => {
                      const active = selectedCustomLevel?.id === lvl.id;
                      return (
                        <button
                          key={lvl.id}
                          type="button"
                          onClick={() => onSelectCustomLevel(lvl)}
                          className={`flex w-full items-center justify-between border px-3 py-2 text-left transition-colors ${
                            active
                              ? 'border-white/75 bg-white/12 text-white'
                              : 'border-white/8 bg-white/[0.03] text-slate-300 hover:border-white/25'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="truncate text-xs font-semibold">
                              {lvl.name}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {lvl.author} · {TRACK_METAS[lvl.biome].name}
                            </div>
                          </div>
                          <span className="ml-2 shrink-0 text-[11px] font-semibold text-[#f5b700]">
                            {lvl.format === 'battle-royale'
                              ? 'Sumo'
                              : lvl.format === 'circuit'
                                ? 'Circuit'
                                : 'Sprint'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Primary Actions */}
          <div className="space-y-2">
            <button
              type="button"
              disabled={Boolean(busyMessage)}
              onClick={onQuickSolo}
              className="arcade-btn flex w-full items-center justify-between bg-[#ff2e3b] px-4 py-3 font-display text-base font-bold uppercase tracking-wide text-white hover:bg-[#ff424e] disabled:opacity-50"
            >
              <span className="flex items-center gap-2.5">
                <Play className="h-4 w-4 fill-current" />
                <span>Lancer la course</span>
              </span>
              <span className="text-xs font-semibold opacity-85">Solo</span>
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={Boolean(busyMessage)}
                onClick={onHostGame}
                className="game-surface arcade-btn flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-semibold text-slate-100 hover:border-white/35 hover:text-white disabled:opacity-50"
              >
                <Users className="h-3.5 w-3.5 text-slate-400" />
                <span>Héberger</span>
              </button>
              <button
                type="button"
                disabled={Boolean(busyMessage)}
                onClick={() => setShowJoinInput((v) => !v)}
                className={`arcade-btn flex items-center justify-center gap-2 border px-3 py-2.5 text-xs font-semibold ${
                  showJoinInput
                    ? 'border-white/60 bg-white/15 text-white'
                    : 'game-surface text-slate-100 hover:border-white/35'
                }`}
              >
                <span>Rejoindre</span>
              </button>
            </div>

            {showJoinInput && (
              <form
                onSubmit={handleJoinSubmit}
                className="game-surface flex items-center gap-2 p-2"
              >
                <input
                  type="text"
                  maxLength={6}
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="Code (ex: PX49K)"
                  className="font-mono-num min-w-0 flex-1 bg-black/40 px-2.5 py-1.5 text-sm font-bold uppercase tracking-widest text-white outline-none placeholder:text-xs placeholder:tracking-normal placeholder:text-slate-500"
                />
                <button
                  type="submit"
                  disabled={Boolean(busyMessage) || joinCode.trim().length < 3}
                  className="arcade-btn shrink-0 bg-white px-3.5 py-1.5 text-xs font-bold text-[#0b0e14] hover:bg-slate-200 disabled:opacity-40"
                >
                  Rejoindre
                </button>
              </form>
            )}

            {(busyMessage || errorMessage) && (
              <div
                className={`border px-3 py-2 text-xs font-medium ${
                  errorMessage
                    ? 'border-[#ff2e3b]/60 bg-[#ff2e3b]/15 text-red-200'
                    : 'border-white/15 bg-black/60 text-slate-200'
                }`}
              >
                {errorMessage || busyMessage}
              </div>
            )}
          </div>

          {/* Secondary Game Menu Links */}
          <div className="border-t border-white/10 pt-2">
            <button
              type="button"
              onClick={() => setShowEditor(true)}
              className="flex w-full items-center justify-between py-2 text-left text-sm font-medium text-slate-300 transition-colors hover:text-white"
            >
              <span className="flex items-center gap-2.5">
                <Hammer className="h-4 w-4 text-slate-400" />
                <span>Éditeur de niveaux</span>
              </span>
              <ChevronRight className="h-4 w-4 text-slate-500" />
            </button>
            <button
              type="button"
              onClick={() => setShowCustomizer(true)}
              className="flex w-full items-center justify-between py-2 text-left text-sm font-medium text-slate-300 transition-colors hover:text-white"
            >
              <span className="flex items-center gap-2.5">
                <Wrench className="h-4 w-4 text-slate-400" />
                <span>Garage</span>
              </span>
              <ChevronRight className="h-4 w-4 text-slate-500" />
            </button>
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="flex w-full items-center justify-between py-2 text-left text-sm font-medium text-slate-300 transition-colors hover:text-white"
            >
              <span className="flex items-center gap-2.5">
                <Settings className="h-4 w-4 text-slate-400" />
                <span>Paramètres</span>
              </span>
              <ChevronRight className="h-4 w-4 text-slate-500" />
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Quiet Controls Hint */}
      <div className="relative z-10 hidden items-center justify-end px-8 pb-5 md:flex">
        <p className="text-xs font-medium text-slate-300/80 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
          ZQSD / Flèches Conduire · Shift Drift · E Saut / 360° · F Nitro · Clic gauche Charge · Échap Pause
        </p>
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

      <LevelEditorModal
        isOpen={showEditor}
        playerName={playerName}
        authToken={authToken}
        onClose={() => setShowEditor(false)}
        onPlaytest={(lvl) => {
          setShowEditor(false);
          onPlaytestCustomLevel(lvl);
        }}
        onPublished={(lvl) => {
          onLevelPublished(lvl);
          setTrackTab('online');
        }}
      />

      <AccountModal
        isOpen={showAccount}
        account={account}
        onClose={() => setShowAccount(false)}
        onLogout={() => {
          setShowAccount(false);
          onDiscordLogout();
        }}
      />
    </div>
  );
};
