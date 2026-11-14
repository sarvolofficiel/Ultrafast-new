import React, { useState } from 'react';
import {
  Check,
  Copy,
  Crown,
  Dices,
  Laptop,
  LogOut,
  Play,
  Wifi,
} from 'lucide-react';
import {
  CAR_LIVERIES,
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
  onUpdateConfig: (partial: Partial<LobbyConfig>) => void;
  onLaunchRace: () => void;
  onLeave: () => void;
}

export const LobbyModal: React.FC<LobbyModalProps> = ({
  isHost,
  localId,
  config,
  players,
  onUpdateConfig,
  onLaunchRace,
  onLeave,
}) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

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
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-950/65 p-4">
      <div className="arcade-panel w-full max-w-3xl p-5 sm:p-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center border-2 border-cyan-400 bg-cyan-500/20">
              <Laptop className="h-5 w-5 text-cyan-300" />
            </div>
            <div>
              <h2 className="font-pixel text-base font-bold uppercase text-white sm:text-lg">
                {isHost
                  ? 'Salon Hébergé sur votre PC'
                  : "Connecté au PC de l'Hôte"}
              </h2>
              <p className="text-xs font-semibold text-slate-400">
                {isHost
                  ? 'Votre ordinateur simule la course et synchronise les joueurs en P2P WebRTC'
                  : "En attente du lancement de la course par l'hôte"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onLeave}
            className="arcade-btn flex items-center gap-1.5 border-2 border-rose-500/70 bg-rose-950/70 px-3 py-1.5 text-xs font-bold uppercase text-rose-200 hover:bg-rose-900"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Quitter</span>
          </button>
        </div>

        {/* Room Code & Invite Strip */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-2 border-slate-800 bg-slate-950/90 p-3">
          <div className="flex items-center gap-3">
            <span className="font-pixel text-[11px] uppercase text-slate-400">
              Code Salon
            </span>
            <span className="font-mono-num border border-cyan-400/50 bg-cyan-500/10 px-3 py-1 text-xl font-extrabold tracking-widest text-cyan-300">
              {config.roomCode}
            </span>
            <button
              type="button"
              onClick={copyCode}
              className="arcade-btn flex items-center gap-1 border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-bold text-slate-200 hover:border-cyan-400"
            >
              {copiedCode ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              <span>{copiedCode ? 'Copié' : 'Code'}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={copyLink}
            className="arcade-btn flex items-center gap-1.5 border-2 border-amber-400/70 bg-amber-500/15 px-3 py-1.5 text-xs font-bold uppercase text-amber-200 hover:bg-amber-500/25"
          >
            {copiedLink ? (
              <Check className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            <span>
              {copiedLink
                ? "Lien d'invitation copié !"
                : "Copier le lien d'invitation"}
            </span>
          </button>
        </div>

        {/* Main Grid: Players & Race Settings */}
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-12">
          {/* Connected Players */}
          <div className="md:col-span-7">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-pixel text-[11px] uppercase text-slate-300">
                Pilotes connectés ({players.length}/{config.maxPlayers})
              </span>
            </div>
            <div className="space-y-1.5">
              {players.map((p) => {
                const livery =
                  CAR_LIVERIES.find((c) => c.id === p.colorId) ??
                  CAR_LIVERIES[0];
                const isMe = p.id === localId;
                return (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between border px-3 py-2 ${
                      isMe
                        ? 'border-cyan-400/60 bg-cyan-950/30'
                        : 'border-slate-800 bg-slate-900/70'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className="h-4 w-4 border border-white/60"
                        style={{ backgroundColor: livery.primary }}
                      />
                      <span className="text-sm font-bold text-white">
                        {p.name}
                        {isMe && (
                          <span className="ml-1.5 text-[10px] font-semibold text-cyan-300">
                            (VOUS)
                          </span>
                        )}
                      </span>
                      {p.isHost && (
                        <span className="inline-flex items-center gap-1 border border-amber-400/50 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-300">
                          <Crown className="h-3 w-3" />
                          HÔTE PC
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-xs">
                      {!p.isHost && (
                        <span
                          className={`inline-flex items-center gap-1 border px-1.5 py-0.5 font-mono-num text-[10px] font-bold ${
                            p.transport === 'webrtc'
                              ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                              : 'border-sky-500/50 bg-sky-500/10 text-sky-300'
                          }`}
                        >
                          <Wifi className="h-3 w-3" />
                          {p.transport === 'webrtc' ? 'P2P' : 'RELAIS'}
                          {p.pingMs > 0 ? ` · ${p.pingMs}ms` : ''}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Race Settings */}
          <div className="space-y-3 md:col-span-5">
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="font-pixel text-[11px] uppercase text-slate-300">
                  Biome &amp; Tracé{' '}
                  <span className="font-mono-num text-cyan-300">
                    #{config.mapSeed}
                  </span>
                </span>
                {isHost && (
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
                    className="arcade-btn flex items-center gap-1 border border-cyan-400/70 bg-cyan-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-cyan-200 hover:bg-cyan-500/35"
                  >
                    <Dices className="h-3 w-3" />
                    <span>Nouveau tracé</span>
                  </button>
                )}
              </div>
              <div className="space-y-1.5">
                {(Object.keys(TRACK_METAS) as TrackId[]).map((id) => {
                  const m = TRACK_METAS[id];
                  const active = config.trackId === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      disabled={!isHost}
                      onClick={() => onUpdateConfig({ trackId: id })}
                      className={`w-full border-2 px-3 py-1.5 text-left transition-colors ${
                        active
                          ? 'border-amber-400 bg-amber-500/15 text-white'
                          : 'border-slate-800 bg-slate-900/60 text-slate-300'
                      } ${isHost ? 'hover:border-slate-500' : 'cursor-default'}`}
                    >
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span>{m.name}</span>
                        <span className="text-[10px] uppercase text-slate-400">
                          {m.difficulty}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="mb-1 font-pixel text-[10px] uppercase text-slate-400">
                Format ({config.raceFormat === 'sprint' ? 'Sprint A→B' : 'Circuit'})
              </div>
              <div className="grid grid-cols-3 gap-1">
                {(
                  [
                    { id: 'random', label: 'Aléatoire' },
                    { id: 'sprint', label: 'Sprint' },
                    { id: 'circuit', label: 'Tours' },
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
                    className={`border-2 py-1 text-[10px] font-bold uppercase ${
                      config.formatPreference === opt.id
                        ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
                        : 'border-slate-800 bg-slate-900 text-slate-400'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="mb-1 font-pixel text-[10px] uppercase text-slate-400">
                  {config.raceFormat === 'sprint' ? 'Distance' : 'Tours'}
                </div>
                {config.raceFormat === 'sprint' ? (
                  <div className="border-2 border-emerald-500/50 bg-emerald-500/15 py-1 text-center text-[11px] font-bold uppercase text-emerald-200">
                    Étape unique
                  </div>
                ) : (
                  <div className="flex gap-1">
                    {[2, 3, 5].map((laps) => (
                      <button
                        key={laps}
                        type="button"
                        disabled={!isHost}
                        onClick={() => onUpdateConfig({ totalLaps: laps })}
                        className={`font-mono-num flex-1 border-2 py-1 text-xs font-bold ${
                          config.totalLaps === laps
                            ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
                            : 'border-slate-800 bg-slate-900 text-slate-400'
                        }`}
                      >
                        {laps}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="mb-1 font-pixel text-[10px] uppercase text-slate-400">
                  Bots IA
                </div>
                <button
                  type="button"
                  disabled={!isHost}
                  onClick={() =>
                    onUpdateConfig({ fillWithAI: !config.fillWithAI })
                  }
                  className={`w-full border-2 py-1 text-xs font-bold uppercase ${
                    config.fillWithAI
                      ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200'
                      : 'border-slate-800 bg-slate-900 text-slate-400'
                  }`}
                >
                  {config.fillWithAI ? 'Actifs (4 max)' : 'Désactivés'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer CTA */}
        <div className="mt-5 flex items-center justify-end border-t border-slate-800 pt-4">
          {isHost ? (
            <button
              type="button"
              onClick={onLaunchRace}
              className="arcade-btn flex items-center gap-2 border-2 border-emerald-300 bg-emerald-500 px-6 py-2.5 font-pixel text-xs font-bold uppercase tracking-wider text-slate-950 hover:brightness-110"
            >
              <Play className="h-4 w-4 fill-current" />
              <span>Lancer la course</span>
            </button>
          ) : (
            <div className="border border-cyan-500/40 bg-cyan-950/50 px-4 py-2 font-pixel text-xs text-cyan-200">
              En attente de l'hôte...
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
