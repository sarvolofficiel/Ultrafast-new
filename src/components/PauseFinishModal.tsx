import React from 'react';
import { Award, Home, Play, RotateCcw, Trophy } from 'lucide-react';
import {
  CAR_LIVERIES,
  type CarLivery,
  type NetworkRole,
  type RaceFormat,
  type RacerState,
} from '../game/types';
import { formatRaceTime } from './RaceHUD';

interface PauseFinishModalProps {
  mode: 'paused' | 'finished';
  role: NetworkRole;
  raceFormat: RaceFormat;
  racers: RacerState[];
  onResume: () => void;
  onRestart: () => void;
  onBackToLobby: () => void;
  onExitToTitle: () => void;
}

const MiniRaceCarSvg: React.FC<{ livery: CarLivery }> = ({ livery }) => (
  <svg
    viewBox="0 0 88 44"
    className="h-9 w-auto drop-shadow-[0_4px_6px_rgba(0,0,0,0.65)]"
    aria-hidden="true"
  >
    {/* Tires */}
    <rect x="12" y="3" width="16" height="6" rx="1" fill="#181c24" />
    <rect x="12" y="35" width="16" height="6" rx="1" fill="#181c24" />
    <rect x="56" y="3" width="17" height="6" rx="1" fill="#181c24" />
    <rect x="56" y="35" width="17" height="6" rx="1" fill="#181c24" />
    {/* Rear wing */}
    <rect x="4" y="6" width="8" height="32" fill="#0d1017" stroke={livery.accent} strokeWidth="1" />
    {/* Chassis body */}
    <path
      d="M11 8 L68 8 L82 14 L82 30 L68 36 L11 36 Z"
      fill={livery.primary}
    />
    {/* Racing stripe */}
    <rect x="12" y="18" width="66" height="8" fill={livery.secondary} />
    {/* Cockpit / windshield */}
    <path d="M32 13 L53 14 L57 22 L53 30 L32 31 Z" fill="#121722" />
    <path d="M35 15 L47 16 L49 22 L47 28 L35 29 Z" fill="#243147" />
    {/* Nose accent */}
    <rect x="74" y="16" width="6" height="12" fill={livery.accent} />
  </svg>
);

export const PauseFinishModal: React.FC<PauseFinishModalProps> = ({
  mode,
  role,
  raceFormat,
  racers,
  onResume,
  onRestart,
  onBackToLobby,
  onExitToTitle,
}) => {
  const sorted = [...racers].sort((a, b) => a.rank - b.rank);
  const isBR = raceFormat === 'battle-royale';
  const localRacer = sorted.find((r) => r.isLocal) ?? sorted[0];
  const leaderTimeMs = sorted[0]?.finished ? sorted[0].finishTimeMs : 0;
  const localWonBR = isBR && localRacer ? !localRacer.eliminated && localRacer.rank === 1 : false;
  const localSurvivedBR = isBR && localRacer ? !localRacer.eliminated : false;

  if (mode === 'paused') {
    return (
      <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/75 p-4">
        <div className="game-surface-solid w-full max-w-md p-6">
          <h2 className="font-display text-2xl font-bold uppercase tracking-wide text-white">
            Pause
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            {role === 'offline'
              ? 'La course est mise en pause.'
              : 'La course en ligne continue en arrière-plan.'}
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <button
              type="button"
              onClick={onResume}
              className="arcade-btn flex items-center justify-center gap-2 bg-[#ff2e3b] px-4 py-2.5 font-display text-sm font-bold uppercase tracking-wide text-white hover:bg-[#ff424e]"
            >
              <Play className="h-4 w-4 fill-current" />
              <span>Reprendre</span>
            </button>
            {role === 'offline' && (
              <button
                type="button"
                onClick={onRestart}
                className="arcade-btn flex items-center justify-center gap-2 border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-200 hover:border-white/35 hover:text-white"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Recommencer</span>
              </button>
            )}
            <button
              type="button"
              onClick={onExitToTitle}
              className="arcade-btn flex items-center justify-center gap-2 border border-white/10 bg-transparent px-4 py-2 text-xs font-semibold text-slate-400 hover:border-white/25 hover:text-white"
            >
              <Home className="h-4 w-4" />
              <span>Quitter vers l'accueil</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Podium order: [2nd, 1st, 3rd] for classic stepped podium presentation
  const topThree = sorted.slice(0, 3);
  const podiumSlots =
    topThree.length >= 3
      ? [
          { racer: topThree[1], step: 2 },
          { racer: topThree[0], step: 1 },
          { racer: topThree[2], step: 3 },
        ]
      : topThree.map((r, idx) => ({ racer: r, step: idx + 1 }));

  const headlineText = isBR
    ? localWonBR
      ? 'Victoire Royale'
      : localSurvivedBR
        ? 'Survivant'
        : 'Éliminé'
    : localRacer?.rank === 1
      ? 'Victoire'
      : localRacer && localRacer.rank <= 3
        ? 'Podium'
        : 'Arrivée';

  const localRankLabel = localRacer
    ? localRacer.rank === 1
      ? '1er'
      : `${localRacer.rank}e`
    : '—';

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center overflow-y-auto bg-black/80 p-3 sm:p-6">
      <div className="game-surface-solid w-full max-w-3xl overflow-hidden">
        {/* Checkered finish header strip */}
        <div
          className="h-2 w-full opacity-85"
          style={{
            backgroundImage:
              'repeating-linear-gradient(90deg, #f4f6fb 0 12px, #11151e 12px 24px)',
          }}
        />

        <div className="p-5 sm:p-6">
          {/* Top Broadcast Summary Header */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                {isBR
                  ? 'Battle Royale · Arène Sumo'
                  : raceFormat === 'sprint'
                    ? 'Résultats · Sprint'
                    : 'Résultats · Circuit'}
              </div>
              <h2
                className={`mt-0.5 font-display text-3xl font-bold italic uppercase tracking-wide sm:text-4xl ${
                  isBR && !localSurvivedBR
                    ? 'text-[#ff2e3b]'
                    : localRacer?.rank === 1
                      ? 'text-[#f5b700]'
                      : 'text-white'
                }`}
              >
                {headlineText}
              </h2>
            </div>

            {localRacer && (
              <div className="flex items-center gap-4 border border-white/10 bg-black/35 px-4 py-2.5">
                <div>
                  <div className="text-[11px] text-slate-400">Votre place</div>
                  <div
                    className={`font-display text-2xl font-bold italic leading-tight ${
                      localRacer.rank === 1
                        ? 'text-[#f5b700]'
                        : localRacer.rank === 2
                          ? 'text-slate-200'
                          : localRacer.rank === 3
                            ? 'text-amber-500'
                            : 'text-white'
                    }`}
                  >
                    {localRankLabel}
                    <span className="ml-1 text-xs font-medium not-italic text-slate-400">
                      /{sorted.length}
                    </span>
                  </div>
                </div>
                <div className="border-l border-white/10 pl-4">
                  <div className="text-[11px] text-slate-400">
                    {isBR ? 'Éliminations' : 'Temps final'}
                  </div>
                  <div className="font-mono-num text-sm font-bold text-white">
                    {isBR
                      ? `${localRacer.knockouts} KO`
                      : localRacer.finished
                        ? formatRaceTime(localRacer.finishTimeMs)
                        : '—'}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Visual 3-Step Racing Podium */}
          {podiumSlots.length > 0 && (
            <div className="mt-5 grid grid-cols-1 items-end gap-2.5 sm:grid-cols-3">
              {podiumSlots.map(({ racer, step }) => {
                const liv =
                  CAR_LIVERIES.find((c) => c.id === racer.colorId) ??
                  CAR_LIVERIES[0];
                const isFirst = step === 1;
                const isSecond = step === 2;
                const accentHex = isFirst
                  ? '#f5b700'
                  : isSecond
                    ? '#cbd5e1'
                    : '#d97706';
                const gapMs =
                  !isBR &&
                  !isFirst &&
                  racer.finished &&
                  leaderTimeMs > 0 &&
                  racer.finishTimeMs > leaderTimeMs
                    ? racer.finishTimeMs - leaderTimeMs
                    : null;

                return (
                  <div
                    key={racer.id}
                    className={`relative flex flex-col justify-between border bg-black/35 transition-transform ${
                      racer.isLocal
                        ? 'border-white/45 bg-white/[0.06]'
                        : 'border-white/10'
                    } ${
                      isFirst
                        ? 'order-first sm:order-none sm:min-h-[178px]'
                        : isSecond
                          ? 'sm:min-h-[152px]'
                          : 'sm:min-h-[136px]'
                    }`}
                  >
                    {/* Top Podium Accent Cap */}
                    <div
                      className="h-1 w-full"
                      style={{ backgroundColor: accentHex }}
                    />

                    <div className="flex flex-1 flex-col items-center justify-between px-3 py-3 text-center">
                      <div className="flex w-full items-center justify-between text-xs">
                        <span
                          className="font-display text-lg font-bold italic"
                          style={{ color: accentHex }}
                        >
                          {step === 1 ? '1er' : `${step}e`}
                        </span>
                        <span className="font-mono-num text-[11px] font-semibold text-slate-400">
                          #{liv.number}
                        </span>
                      </div>

                      <div className="my-2">
                        <MiniRaceCarSvg livery={liv} />
                      </div>

                      <div className="w-full">
                        <div className="flex items-center justify-center gap-1.5 truncate text-sm font-bold text-white">
                          {isFirst && (
                            <Trophy className="h-3.5 w-3.5 shrink-0 text-[#f5b700]" />
                          )}
                          {!isFirst && (
                            <Award
                              className="h-3.5 w-3.5 shrink-0"
                              style={{ color: accentHex }}
                            />
                          )}
                          <span className="truncate">{racer.name}</span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-400">
                          {racer.isLocal
                            ? 'Vous'
                            : racer.isAI
                              ? 'Bot'
                              : 'Pilote'}
                        </div>

                        <div className="mt-2 border-t border-white/10 pt-1.5 font-mono-num text-xs font-semibold">
                          {isBR ? (
                            <span
                              style={{
                                color: !racer.eliminated ? accentHex : '#94a3b8',
                              }}
                            >
                              {!racer.eliminated
                                ? isFirst
                                  ? 'Vainqueur'
                                  : 'Survivant'
                                : formatRaceTime(racer.finishTimeMs)}{' '}
                              · {racer.knockouts} KO
                            </span>
                          ) : (
                            <span className="text-slate-200">
                              {racer.finished
                                ? gapMs !== null
                                  ? `+${(gapMs / 1000).toFixed(2)}s`
                                  : formatRaceTime(racer.finishTimeMs)
                                : 'En course'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Complete Standings Sheet */}
          <div className="mt-4 overflow-hidden border border-white/10 bg-black/25">
            <div className="grid grid-cols-12 border-b border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] font-semibold text-slate-400">
              <div className="col-span-2">Pos</div>
              <div className="col-span-5">Pilote</div>
              <div className="col-span-2 text-right">
                {isBR ? 'KO' : 'Meilleur'}
              </div>
              <div className="col-span-3 text-right">
                {isBR ? 'Statut' : 'Temps'}
              </div>
            </div>

            <div className="divide-y divide-white/8">
              {sorted.map((r) => {
                const liv =
                  CAR_LIVERIES.find((c) => c.id === r.colorId) ??
                  CAR_LIVERIES[0];
                const gapMs =
                  !isBR &&
                  r.rank > 1 &&
                  r.finished &&
                  leaderTimeMs > 0 &&
                  r.finishTimeMs > leaderTimeMs
                    ? r.finishTimeMs - leaderTimeMs
                    : null;

                return (
                  <div
                    key={r.id}
                    className={`grid grid-cols-12 items-center px-3 py-2 text-xs ${
                      r.isLocal ? 'bg-white/[0.07]' : ''
                    }`}
                  >
                    <div className="col-span-2 flex items-center gap-2 font-mono-num font-bold">
                      <span
                        className={
                          r.rank === 1
                            ? 'text-[#f5b700]'
                            : r.rank === 2
                              ? 'text-slate-200'
                              : r.rank === 3
                                ? 'text-amber-500'
                                : 'text-slate-400'
                        }
                      >
                        P{r.rank}
                      </span>
                      <span
                        className="h-3.5 w-1"
                        style={{ backgroundColor: liv.primary }}
                      />
                    </div>

                    <div className="col-span-5 flex min-w-0 items-center gap-2 pr-2">
                      <span className="truncate font-semibold text-white">
                        {r.name}
                      </span>
                      <span className="shrink-0 text-[11px] text-slate-500">
                        {r.isLocal ? 'Vous' : r.isAI ? 'Bot' : ''}
                      </span>
                    </div>

                    <div className="col-span-2 text-right font-mono-num text-[11px] text-slate-400">
                      {isBR
                        ? `${r.knockouts}`
                        : r.bestLapMs !== null
                          ? formatRaceTime(r.bestLapMs)
                          : '—'}
                    </div>

                    <div className="col-span-3 text-right font-mono-num font-semibold">
                      {isBR ? (
                        <span
                          className={
                            !r.eliminated
                              ? r.rank === 1
                                ? 'text-[#f5b700]'
                                : 'text-emerald-400'
                              : 'text-slate-400'
                          }
                        >
                          {!r.eliminated
                            ? r.rank === 1
                              ? 'Vainqueur'
                              : 'Survivant'
                            : formatRaceTime(r.finishTimeMs)}
                        </span>
                      ) : r.finished ? (
                        <span className="text-slate-100">
                          {r.rank === 1
                            ? formatRaceTime(r.finishTimeMs)
                            : gapMs !== null
                              ? `+${(gapMs / 1000).toFixed(2)}s`
                              : formatRaceTime(r.finishTimeMs)}
                        </span>
                      ) : (
                        <span className="text-slate-500">En course</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer Action Row */}
          <div className="mt-5 flex flex-wrap items-center justify-end gap-2.5 border-t border-white/10 pt-4">
            {role === 'offline' && (
              <button
                type="button"
                onClick={onRestart}
                className="arcade-btn flex items-center gap-2 bg-[#ff2e3b] px-5 py-2.5 font-display text-sm font-bold uppercase tracking-wide text-white hover:bg-[#ff424e]"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Rejouer</span>
              </button>
            )}
            {role === 'host' && (
              <button
                type="button"
                onClick={onBackToLobby}
                className="arcade-btn flex items-center gap-2 bg-[#ff2e3b] px-5 py-2.5 font-display text-sm font-bold uppercase tracking-wide text-white hover:bg-[#ff424e]"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Retour au salon</span>
              </button>
            )}
            {role === 'client' && (
              <div className="px-3 py-2 text-xs text-slate-400">
                En attente de l'hôte...
              </div>
            )}
            <button
              type="button"
              onClick={onExitToTitle}
              className="arcade-btn flex items-center gap-2 border border-white/15 bg-white/5 px-4 py-2.5 text-xs font-semibold text-slate-200 hover:border-white/35 hover:text-white"
            >
              <Home className="h-4 w-4" />
              <span>Accueil</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
