import React from 'react';
import { LogOut, Trophy, User, X } from 'lucide-react';
import { CAR_LIVERIES, type DiscordAccount } from '../game/types';
import { formatRaceTime } from './RaceHUD';

interface AccountModalProps {
  isOpen: boolean;
  account: DiscordAccount | null;
  onClose: () => void;
  onLogout: () => void;
}

export const AccountModal: React.FC<AccountModalProps> = ({
  isOpen,
  account,
  onClose,
  onLogout,
}) => {
  if (!isOpen || !account) return null;

  const livery =
    CAR_LIVERIES.find((l) => l.id === account.preferredColorId) ?? CAR_LIVERIES[0];

  return (
    <div className="pointer-events-auto fixed inset-0 z-30 flex items-center justify-center bg-black/75 p-4">
      <div className="game-surface-solid w-full max-w-md p-6">
        <div className="flex items-center justify-between border-b border-white/10 pb-3.5">
          <h2 className="font-display text-xl font-bold uppercase tracking-wide text-white">
            Compte pilote
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 transition-colors hover:text-white"
            aria-label="Fermer le compte"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 flex items-center gap-4">
          {account.avatarUrl ? (
            <img
              src={account.avatarUrl}
              alt={account.displayName}
              referrerPolicy="no-referrer"
              className="h-14 w-14 border border-white/20 object-cover"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center border border-white/20 bg-white/5 text-slate-300">
              <User className="h-6 w-6" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-bold text-white">
              {account.displayName}
            </div>
            <div className="truncate text-xs text-slate-400">
              Discord · @{account.username}
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-slate-300">
              <span
                className="inline-block h-2.5 w-2.5"
                style={{ backgroundColor: livery.primary }}
              />
              <span>
                {account.preferredName} · {livery.name}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2 border-y border-white/10 py-4">
          <div>
            <div className="text-[11px] text-slate-400">Courses</div>
            <div className="font-mono-num mt-0.5 text-xl font-bold text-white">
              {account.stats.racesPlayed}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1 text-[11px] text-slate-400">
              <Trophy className="h-3 w-3 text-[#f5b700]" />
              <span>Victoires</span>
            </div>
            <div className="font-mono-num mt-0.5 text-xl font-bold text-[#f5b700]">
              {account.stats.wins}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-400">Podiums</div>
            <div className="font-mono-num mt-0.5 text-xl font-bold text-white">
              {account.stats.podiums}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-400">Victoires Sumo</div>
            <div className="font-mono-num mt-0.5 text-lg font-bold text-white">
              {account.stats.brWins}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-400">KO Sumo</div>
            <div className="font-mono-num mt-0.5 text-lg font-bold text-[#ff2e3b]">
              {account.stats.knockouts}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-400">Meilleur tour</div>
            <div className="font-mono-num mt-0.5 text-sm font-bold text-slate-200">
              {account.stats.bestLapMs !== null
                ? formatRaceTime(account.stats.bestLapMs)
                : '—'}
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <button
            type="button"
            onClick={onLogout}
            className="arcade-btn flex items-center gap-2 border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-semibold text-slate-300 hover:border-[#ff2e3b]/60 hover:text-white"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Déconnexion</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="arcade-btn bg-[#ff2e3b] px-5 py-2 font-display text-sm font-bold uppercase tracking-wide text-white hover:bg-[#ff424e]"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
