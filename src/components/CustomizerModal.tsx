import React from 'react';
import { X } from 'lucide-react';
import { CAR_LIVERIES, type CarColorId } from '../game/types';

interface CustomizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  colorId: CarColorId;
  onColorChange: (id: CarColorId) => void;
  carName: string;
  onCarNameChange: (name: string) => void;
}

export const CustomizerModal: React.FC<CustomizerModalProps> = ({
  isOpen,
  onClose,
  colorId,
  onColorChange,
  carName,
  onCarNameChange,
}) => {
  if (!isOpen) return null;

  const currentLivery =
    CAR_LIVERIES.find((l) => l.id === colorId) ?? CAR_LIVERIES[0];

  return (
    <div className="pointer-events-auto fixed inset-0 z-30 flex items-center justify-center bg-black/75 p-4">
      <div className="game-surface-solid w-full max-w-lg p-6">
        <div className="flex items-center justify-between border-b border-white/10 pb-3.5">
          <h2 className="font-display text-xl font-bold uppercase tracking-wide text-white">
            Garage
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 transition-colors hover:text-white"
            aria-label="Fermer le garage"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 space-y-5">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-300">
              Nom du pilote / écurie
            </label>
            <input
              type="text"
              maxLength={14}
              value={carName}
              onChange={(e) => onCarNameChange(e.target.value)}
              placeholder="Pilote 01"
              className="w-full border border-white/15 bg-black/40 px-3 py-2 text-sm font-semibold text-white outline-none transition-colors focus:border-white/50"
            />
          </div>

          <div>
            <div className="mb-2.5 flex items-baseline justify-between text-xs">
              <span className="font-semibold text-slate-300">Livrée officielle</span>
              <span className="font-medium text-[#f5b700]">
                {currentLivery.name} · N° {currentLivery.number}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {CAR_LIVERIES.map((liv) => {
                const active = liv.id === colorId;
                return (
                  <button
                    key={liv.id}
                    type="button"
                    onClick={() => onColorChange(liv.id)}
                    className={`arcade-btn flex items-center gap-3 border px-3 py-2.5 text-left ${
                      active
                        ? 'border-white bg-white/12 text-white'
                        : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/30'
                    }`}
                  >
                    <span className="flex h-6 w-3 shrink-0 flex-col overflow-hidden border border-white/30">
                      <span
                        className="h-4 w-full"
                        style={{ backgroundColor: liv.primary }}
                      />
                      <span
                        className="h-2 w-full"
                        style={{ backgroundColor: liv.secondary }}
                      />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold">{liv.name}</div>
                      <div className="font-mono-num text-[11px] text-slate-400">
                        #{liv.number}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end border-t border-white/10 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="arcade-btn bg-[#ff2e3b] px-5 py-2 font-display text-sm font-bold uppercase tracking-wide text-white hover:bg-[#ff424e]"
          >
            Valider
          </button>
        </div>
      </div>
    </div>
  );
};
