import React from 'react';
import { Home, Play, RotateCcw, Trophy } from 'lucide-react';
import { CAR_LIVERIES, type NetworkRole, type RacerState } from '../game/types';
import { formatRaceTime } from './RaceHUD';

interface PauseFinishModalProps {
  mode: 'paused' | 'finished';
  role: NetworkRole;
  racers: RacerState[];
  onResume: () => void;
  onRestart: () => void;
  onBackToLobby: () => void;
  onExitToTitle: () => void;
}

export const PauseFinishModal: React.FC<PauseFinishModalProps> = ({
  mode,
  role,
  racers,
  onResume,
  onRestart,
  onBackToLobby,
  onExitToTitle,
}) => {
  const sorted = [...racers].sort((a, b) => a.rank - b.rank);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/75 p-4">
      <div className="arcade-panel w-full max-w-xl p-6">
        {mode === 'paused' ? (
          <>
            <h2 className="font-pixel text-xl font-bold uppercase text-white">
              Pause
            </h2>
            <p className="mt-1 text-xs font-semibold text-slate-400">
              {role === 'offline'
                ? 'La course est en pause.'
                : 'La course en ligne continue en temps réel.'}
            </p>
            <div className="mt-5 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={onResume}
                className="arcade-btn flex items-center justify-center gap-2 border-2 border-emerald-300 bg-emerald-500 px-4 py-2.5 font-pixel text-xs font-bold uppercase text-slate-950"
              >
                <Play className="h-4 w-4 fill-current" />
                <span>Reprendre</span>
              </button>
              {role === 'offline' && (
                <button
                  type="button"
                  onClick={onRestart}
                  className="arcade-btn flex items-center justify-center gap-2 border-2 border-cyan-400 bg-cyan-500/20 px-4 py-2 text-xs font-bold uppercase text-cyan-200"
                >
                  <RotateCcw className="h-4 w-4" />
                  <span>Recommencer</span>
                </button>
              )}
              <button
                type="button"
                onClick={onExitToTitle}
                className="arcade-btn flex items-center justify-center gap-2 border-2 border-rose-500/60 bg-rose-950/70 px-4 py-2 text-xs font-bold uppercase text-rose-200"
              >
                <Home className="h-4 w-4" />
                <span>Quitter la course</span>
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
              <div className="flex h-11 w-11 items-center justify-center border-2 border-amber-400 bg-amber-500/20">
                <Trophy className="h-6 w-6 text-amber-300" />
              </div>
              <div>
                <h2 className="font-pixel text-xl font-bold uppercase text-amber-300">
                  Arrivée !
                </h2>
                <p className="text-xs font-semibold text-slate-400">
                  Classement final de la course
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {sorted.map((r) => {
                const liv =
                  CAR_LIVERIES.find((c) => c.id === r.colorId) ??
                  CAR_LIVERIES[0];
                return (
                  <div
                    key={r.id}
                    className={`flex items-center justify-between border px-3 py-2 ${
                      r.isLocal
                        ? 'border-cyan-400/70 bg-cyan-950/40'
                        : 'border-slate-800 bg-slate-900/75'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`font-pixel w-8 text-sm font-bold ${
                          r.rank === 1
                            ? 'text-amber-300'
                            : r.rank === 2
                              ? 'text-slate-200'
                              : r.rank === 3
                                ? 'text-orange-300'
                                : 'text-slate-500'
                        }`}
                      >
                        #{r.rank}
                      </span>
                      <span
                        className="h-4 w-4 border border-white/60"
                        style={{ backgroundColor: liv.primary }}
                      />
                      <span className="text-sm font-bold text-white">
                        {r.name}
                        {r.isAI && (
                          <span className="ml-1.5 text-[10px] font-semibold text-slate-400">
                            [IA]
                          </span>
                        )}
                      </span>
                    </div>

                    <div className="text-right font-mono-num text-xs">
                      <div className="font-bold text-cyan-300">
                        {r.finished ? formatRaceTime(r.finishTimeMs) : 'En course'}
                      </div>
                      {r.bestLapMs !== null && r.bestLapMs !== r.finishTimeMs && (
                        <div className="text-[10px] text-emerald-300">
                          Meilleur tour : {formatRaceTime(r.bestLapMs)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2.5 border-t border-slate-800 pt-4">
              {role === 'offline' && (
                <button
                  type="button"
                  onClick={onRestart}
                  className="arcade-btn flex items-center gap-2 border-2 border-emerald-300 bg-emerald-500 px-4 py-2 font-pixel text-xs font-bold uppercase text-slate-950"
                >
                  <RotateCcw className="h-4 w-4" />
                  <span>Rejouer</span>
                </button>
              )}
              {role === 'host' && (
                <button
                  type="button"
                  onClick={onBackToLobby}
                  className="arcade-btn flex items-center gap-2 border-2 border-cyan-300 bg-cyan-500 px-4 py-2 font-pixel text-xs font-bold uppercase text-slate-950"
                >
                  <RotateCcw className="h-4 w-4" />
                  <span>Retour au salon (Tous)</span>
                </button>
              )}
              {role === 'client' && (
                <div className="border border-cyan-500/40 bg-cyan-950/50 px-3 py-2 font-pixel text-[11px] text-cyan-200">
                  En attente de l'hôte...
                </div>
              )}
              <button
                type="button"
                onClick={onExitToTitle}
                className="arcade-btn flex items-center gap-2 border-2 border-slate-600 bg-slate-800 px-4 py-2 text-xs font-bold uppercase text-slate-200"
              >
                <Home className="h-4 w-4" />
                <span>Accueil</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
