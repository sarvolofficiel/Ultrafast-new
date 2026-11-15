import React from 'react';
import { X } from 'lucide-react';
import type { PixelMode } from '../game/types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  muted: boolean;
  onToggleMute: () => void;
  pixelMode: PixelMode;
  onCyclePixelMode: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  muted,
  onToggleMute,
  pixelMode,
  onCyclePixelMode,
}) => {
  if (!isOpen) return null;

  return (
    <div className="pointer-events-auto fixed inset-0 z-30 flex items-center justify-center bg-black/75 p-4">
      <div className="game-surface-solid w-full max-w-md p-6">
        <div className="flex items-center justify-between border-b border-white/10 pb-3.5">
          <h2 className="font-display text-xl font-bold uppercase tracking-wide text-white">
            Paramètres
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 transition-colors hover:text-white"
            aria-label="Fermer les paramètres"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 divide-y divide-white/10">
          <div className="flex items-center justify-between py-3.5">
            <div>
              <div className="text-sm font-semibold text-white">Audio du jeu</div>
              <div className="text-xs text-slate-400">Moteur, drift et collisions (M)</div>
            </div>
            <button
              type="button"
              onClick={onToggleMute}
              className={`arcade-btn border px-3.5 py-1.5 text-xs font-semibold ${
                muted
                  ? 'border-[#ff2e3b]/60 bg-[#ff2e3b]/15 text-red-200'
                  : 'border-white/25 bg-white/10 text-white'
              }`}
            >
              {muted ? 'Coupé' : 'Activé'}
            </button>
          </div>

          <div className="flex items-center justify-between py-3.5">
            <div>
              <div className="text-sm font-semibold text-white">Rendu graphique</div>
              <div className="text-xs text-slate-400">Résolution pixel rétro ou HD</div>
            </div>
            <button
              type="button"
              onClick={onCyclePixelMode}
              className="arcade-btn border border-white/25 bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-white hover:border-white/45"
            >
              {pixelMode === 'ultra'
                ? 'Pixel ++'
                : pixelMode === 'retro'
                  ? 'Pixel 3D'
                  : 'HD'}
            </button>
          </div>
        </div>

        <div className="mt-5 flex justify-end border-t border-white/10 pt-4">
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
