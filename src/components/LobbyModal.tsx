import React, { useState } from 'react';
import { Check, Copy, Dices, Globe, LogOut, Play } from 'lucide-react';
import {
  CAR_LIVERIES,
  type CustomLevelData,
  type LobbyConfig,
  type LobbyPlayer,
  type RaceFormatPreference,
  type TrackId,
} from '../game/types';
import { generateRandomSeed, resolveRaceFormat, TRACK_METAS } from '../game/tracks';

interface LobbyModalProps {
  isHost: boolean;
  localId: string;
  config: LobbyConfig;
  players: LobbyPlayer[];
  communityLevels?: CustomLevelData[];
  onUpdateConfig: (partial: Partial<LobbyConfig>) => void;
  onLaunchRace: () => void;
  onLeave: () => void;
}

export const LobbyModal: React.FC<LobbyModalProps> = ({
  isHost,
  localId,
  config,
  players,
  communityLevels = [],
  onUpdateConfig,
  onLaunchRace,
  onLeave,
}) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [trackSourceTab, setTrackSourceTab] = useState<'official' | 'online'>(
    config.customLevel ? 'online' : 'official',
  );

  const shareUrl = `${window.location.origin}/?room=${config.roomCode}`;

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(config.roomCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1800);
    } catch {
      // ignore
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1800);
    } catch {
      // ignore
    }
  };

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/70 p-4">
      <div className="game-surface-solid w-full max-w-3xl p-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <h2 className="font-display text-xl font-bold uppercase tracking-wide text-white">
              {isHost ? 'Salon multijoueur' : "Salon de l'hôte"}
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              {isHost
                ? 'Partagez le code ou le lien pour inviter d’autres pilotes'
                : "En attente du départ par l'hôte"}
            </p>
          </div>

          <button
            type="button"
            onClick={onLeave}
            className="arcade-btn flex items-center gap-1.5 border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-[#ff2e3b]/70 hover:text-white"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Quitter</span>
          </button>
        </div>

        {/* Room Code & Invite Strip */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border border-white/10 bg-black/35 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-slate-400">Code</span>
            <span className="font-mono-num text-xl font-bold tracking-widest text-[#f5b700]">
              {config.roomCode}
            </span>
            <button
              type="button"
              onClick={copyCode}
              className="arcade-btn flex items-center gap-1.5 border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-medium text-slate-200 hover:border-white/35"
            >
              {copiedCode ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              <span>{copiedCode ? 'Copié' : 'Copier'}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={copyLink}
            className="arcade-btn flex items-center gap-1.5 border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:border-white/40"
          >
            {copiedLink ? (
              <Check className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            <span>
              {copiedLink ? 'Lien copié' : "Copier le lien d'invitation"}
            </span>
          </button>
        </div>

        {/* Main Grid: Players & Race Settings */}
        <div className="mt-5 grid grid-cols-1 gap-6 md:grid-cols-12">
          {/* Connected Players */}
          <div className="md:col-span-6">
            <div className="mb-2.5 flex items-baseline justify-between text-xs">
              <span className="font-semibold text-slate-300">Pilotes</span>
              <span className="font-mono-num text-slate-400">
                {players.length} / {config.maxPlayers}
              </span>
            </div>
            <div className="divide-y divide-white/8 border border-white/10 bg-black/25">
              {players.map((p) => {
                const livery =
                  CAR_LIVERIES.find((c) => c.id === p.colorId) ??
                  CAR_LIVERIES[0];
                const isMe = p.id === localId;
                return (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between px-3 py-2.5 ${
                      isMe ? 'bg-white/[0.06]' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className="h-4 w-1.5 shrink-0"
                        style={{ backgroundColor: livery.primary }}
                      />
                      <span className="text-sm font-semibold text-white">
                        {p.name}
                      </span>
                      {isMe && (
                        <span className="text-xs text-slate-400">· Vous</span>
                      )}
                      {p.isHost && (
                        <span className="text-xs font-semibold text-[#f5b700]">
                          · Hôte
                        </span>
                      )}
                    </div>

                    {!p.isHost && (
                      <span className="font-mono-num text-xs text-slate-400">
                        {p.transport === 'webrtc' ? 'P2P' : 'Relais'}
                        {p.pingMs > 0 ? ` · ${p.pingMs} ms` : ''}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Race Settings */}
          <div className="space-y-3.5 md:col-span-6">
            <div>
              <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-slate-300">
                  {config.customLevel ? (
                    <>
                      Online ·{' '}
                      <span className="text-[#f5b700]">{config.customLevel.name}</span>
                    </>
                  ) : (
                    <>
                      Circuit{' '}
                      <span className="font-mono-num text-slate-400">
                        #{config.mapSeed}
                      </span>
                    </>
                  )}
                </span>
                {isHost && !config.customLevel && (
                  <button
                    type="button"
                    onClick={() => {
                      const nextSeed = generateRandomSeed();
                      const nextFmt = resolveRaceFormat(
                        config.formatPreference,
                        nextSeed,
                      );
                      onUpdateConfig({ mapSeed: nextSeed, raceFormat: nextFmt });
                    }}
                    className="flex items-center gap-1 text-xs font-medium text-slate-300 transition-colors hover:text-white"
                  >
                    <Dices className="h-3.5 w-3.5" />
                    <span>Nouveau tracé</span>
                  </button>
                )}
              </div>

              {isHost && (
                <div className="mb-2.5 flex gap-4 border-b border-white/10 pb-1.5 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => {
                      setTrackSourceTab('official');
                      if (config.customLevel) {
                        onUpdateConfig({ customLevel: null });
                      }
                    }}
                    className={`pb-0.5 transition-colors ${
                      trackSourceTab === 'official'
                        ? 'border-b-2 border-[#ff2e3b] text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Officiels
                  </button>
                  <button
                    type="button"
                    onClick={() => setTrackSourceTab('online')}
                    className={`flex items-center gap-1.5 pb-0.5 transition-colors ${
                      trackSourceTab === 'online'
                        ? 'border-b-2 border-[#ff2e3b] text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Globe className="h-3.5 w-3.5" />
                    <span>Online ({communityLevels.length})</span>
                  </button>
                </div>
              )}

              {(!isHost && config.customLevel) || trackSourceTab === 'online' ? (
                <div className="max-h-36 space-y-1.5 overflow-y-auto pr-1">
                  {communityLevels.length === 0 && !config.customLevel ? (
                    <div className="border border-white/10 bg-black/25 p-3 text-center text-xs text-slate-400">
                      Aucun niveau Online publié pour le moment.
                    </div>
                  ) : (
                    (communityLevels.length > 0
                      ? communityLevels
                      : config.customLevel
                        ? [config.customLevel]
                        : []
                    ).map((lvl) => {
                      const active = config.customLevel?.id === lvl.id;
                      return (
                        <button
                          key={lvl.id}
                          type="button"
                          disabled={!isHost}
                          onClick={() =>
                            onUpdateConfig({
                              customLevel: lvl,
                              trackId: lvl.biome,
                              raceFormat: lvl.format,
                            })
                          }
                          className={`w-full border px-3 py-2 text-left transition-colors ${
                            active
                              ? 'border-white/75 bg-white/12 text-white'
                              : 'border-white/10 bg-white/[0.03] text-slate-300'
                          } ${isHost ? 'hover:border-white/30' : 'cursor-default'}`}
                        >
                          <div className="flex items-center justify-between text-xs font-semibold">
                            <span className="truncate">{lvl.name}</span>
                            <span className="ml-2 shrink-0 text-[11px] text-[#f5b700]">
                              {lvl.format === 'battle-royale'
                                ? 'Sumo'
                                : lvl.format === 'sprint'
                                  ? 'Sprint'
                                  : 'Circuit'}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {lvl.author} · {TRACK_METAS[lvl.biome].name}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-1.5">
                  {(Object.keys(TRACK_METAS) as TrackId[]).map((id) => {
                    const m = TRACK_METAS[id];
                    const active = !config.customLevel && config.trackId === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        disabled={!isHost}
                        onClick={() =>
                          onUpdateConfig({ trackId: id, customLevel: null })
                        }
                        className={`border px-2.5 py-2 text-left transition-colors ${
                          active
                            ? 'border-white/75 bg-white/12 text-white'
                            : 'border-white/10 bg-white/[0.03] text-slate-300'
                        } ${isHost ? 'hover:border-white/30' : 'cursor-default'}`}
                      >
                        <div className="truncate text-xs font-semibold">{m.name}</div>
                        <div className="text-[11px] text-slate-400">
                          {m.difficulty}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {!config.customLevel && (
              <div>
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-300">Format</span>
                  <span className="text-[#f5b700]">
                    {config.raceFormat === 'sprint'
                      ? 'Sprint'
                      : config.raceFormat === 'battle-royale'
                        ? 'Arène Sumo'
                        : 'Circuit'}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1 bg-black/35 p-1">
                  {(
                    [
                      { id: 'random', label: 'Aléa' },
                      { id: 'sprint', label: 'Sprint' },
                      { id: 'circuit', label: 'Tours' },
                      { id: 'battle-royale', label: 'Sumo' },
                    ] as Array<{ id: RaceFormatPreference; label: string }>
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={!isHost}
                      onClick={() => {
                        const nextSeed = generateRandomSeed();
                        const nextFmt = resolveRaceFormat(opt.id, nextSeed);
                        onUpdateConfig({
                          formatPreference: opt.id,
                          mapSeed: nextSeed,
                          raceFormat: nextFmt,
                        });
                      }}
                      className={`py-1.5 text-[11px] font-semibold transition-colors ${
                        config.formatPreference === opt.id
                          ? 'bg-white text-[#0b0e14]'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="mb-1 text-xs font-semibold text-slate-300">
                  {config.raceFormat === 'sprint'
                    ? 'Distance'
                    : config.raceFormat === 'battle-royale'
                      ? 'Arène'
                      : 'Tours'}
                </div>
                {config.raceFormat === 'sprint' ? (
                  <div className="border border-white/10 bg-black/25 py-1.5 text-center text-xs text-slate-300">
                    Étape unique
                  </div>
                ) : config.raceFormat === 'battle-royale' ? (
                  <div className="border border-white/10 bg-black/25 py-1.5 text-center text-xs text-slate-300">
                    Sumo circulaire
                  </div>
                ) : (
                  <div className="flex gap-1">
                    {[2, 3, 5].map((laps) => (
                      <button
                        key={laps}
                        type="button"
                        disabled={!isHost}
                        onClick={() => onUpdateConfig({ totalLaps: laps })}
                        className={`font-mono-num flex-1 border py-1.5 text-xs font-bold ${
                          config.totalLaps === laps
                            ? 'border-white bg-white text-[#0b0e14]'
                            : 'border-white/10 bg-black/25 text-slate-400'
                        }`}
                      >
                        {laps}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="mb-1 text-xs font-semibold text-slate-300">
                  Bots IA
                </div>
                <button
                  type="button"
                  disabled={!isHost}
                  onClick={() =>
                    onUpdateConfig({ fillWithAI: !config.fillWithAI })
                  }
                  className={`w-full border py-1.5 text-xs font-semibold ${
                    config.fillWithAI
                      ? 'border-white/40 bg-white/10 text-white'
                      : 'border-white/10 bg-black/25 text-slate-400'
                  }`}
                >
                  {config.fillWithAI
                    ? `Actifs (${config.raceFormat === 'battle-royale' ? '6' : '4'} max)`
                    : 'Désactivés'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer CTA */}
        <div className="mt-6 flex items-center justify-end border-t border-white/10 pt-4">
          {isHost ? (
            <button
              type="button"
              onClick={onLaunchRace}
              className="arcade-btn flex items-center gap-2 bg-[#ff2e3b] px-6 py-2.5 font-display text-sm font-bold uppercase tracking-wide text-white hover:bg-[#ff424e]"
            >
              <Play className="h-4 w-4 fill-current" />
              <span>Démarrer la course</span>
            </button>
          ) : (
            <div className="text-xs font-medium text-slate-400">
              En attente de l'hôte...
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
