import React from 'react';
import { Check, Settings, Sliders, Tv, Volume2, VolumeX, X } from 'lucide-react';
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
    <div className="pointer-events-auto fixed inset-0 z-30 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="arcade-panel w-full max-w-md p-5 sm:p-6 bg-slate-900/95 border-2 border-amber-400/60 shadow-[0_0_30px_rgba(255,159,28,0.15)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center border-2 border-amber-400 bg-amber-500/20">
              <Settings className="h-5 w-5 text-amber-300" />
            </div>
            <div>
              <h2 className="font-pixel text-base font-bold uppercase text-white sm:text-lg">
                Paramètres du Jeu
              </h2>
              <p className="text-xs font-semibold text-slate-400">
                Audio, affichage &amp; rendu pixel
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="arcade-btn border border-slate-700 bg-slate-800 p-2 text-slate-300 hover:border-rose-400 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Options List */}
        <div className="mt-5 space-y-4">
          <div className="flex items-center justify-between border border-slate-800 bg-slate-950/80 p-3.5">
            <div className="flex items-center gap-3">
              {muted ? (
                <VolumeX className="h-5 w-5 text-rose-400" />
              ) : (
                <Volume2 className="h-5 w-5 text-emerald-400" />
              )}
              <div>
                <div className="text-xs font-bold text-white">Effets Sonores &amp; Moteur</div>
                <div className="text-[10px] text-slate-400">Synthétiseur Web Audio en temps réel</div>
              </div>
            </div>
            <button
              type="button"
              onClick={onToggleMute}
              className={`arcade-btn border-2 px-3 py-1.5 text-xs font-bold uppercase ${
                muted
                  ? 'border-rose-500 bg-rose-500/20 text-rose-200'
                  : 'border-emerald-500 bg-emerald-500/20 text-emerald-200'
              }`}
            >
              {muted ? 'Coupé' : 'Actif'}
            </button>
          </div>

          <div className="flex items-center justify-between border border-slate-800 bg-slate-950/80 p-3.5">
            <div className="flex items-center gap-3">
              <Tv className="h-5 w-5 text-cyan-400" />
              <div>
                <div className="text-xs font-bold text-white">Mode Écran / Rendu</div>
                <div className="text-[10px] text-slate-400">Pixel art rétro vs HD net</div>
              </div>
            </div>
            <button
              type="button"
              onClick={onCyclePixelMode}
              className="arcade-btn border-2 border-cyan-400 bg-cyan-500/20 px-3 py-1.5 text-xs font-bold uppercase text-cyan-200 hover:bg-cyan-500/35"
            >
              {pixelMode === 'ultra'
                ? 'PIXEL ++'
                : pixelMode === 'retro'
                  ? 'PIXEL 3D'
                  : 'HD CRISP'}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 flex items-center justify-end border-t border-slate-800 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="arcade-btn flex items-center gap-2 border-2 border-amber-400 bg-amber-400 px-5 py-2 font-pixel text-xs font-bold uppercase text-slate-950 hover:brightness-110"
          >
            <Check className="h-4 w-4" />
            <span>Fermer</span>
          </button>
        </div>
      </div>
    </div>
  );
};
