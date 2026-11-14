import React, { useState } from 'react';
import {
  Car,
  Check,
  Palette,
  Sliders,
  Sparkles,
  Trophy,
  Wrench,
  X,
} from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState<'livery' | 'tuning' | 'showcase'>('livery');
  const [spoilerType, setSpoilerType] = useState<'gt' | 'ducktail' | 'low'>('gt');
  const [rimStyle, setRimStyle] = useState<'chrome' | 'mesh' | 'aero'>('chrome');

  if (!isOpen) return null;

  const currentLivery =
    CAR_LIVERIES.find((l) => l.id === colorId) ?? CAR_LIVERIES[0];

  return (
    <div className="pointer-events-auto fixed inset-0 z-30 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="arcade-panel w-full max-w-xl p-5 sm:p-6 bg-slate-900/95 border-2 border-cyan-500/60 shadow-[0_0_30px_rgba(0,245,255,0.15)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center border-2 border-cyan-400 bg-cyan-500/20">
              <Wrench className="h-5 w-5 text-cyan-300" />
            </div>
            <div>
              <h2 className="font-pixel text-base font-bold uppercase text-white sm:text-lg">
                Atelier &amp; Garage 3D
              </h2>
              <p className="text-xs font-semibold text-slate-400">
                Personnalisez votre bolide pixel &amp; observez-le sous tous les angles
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

        {/* Tab Navigation */}
        <div className="mt-4 flex gap-2 border-b border-slate-800 pb-3">
          {[
            { id: 'livery', label: 'Livrée & Peinture', icon: Palette },
            { id: 'tuning', label: 'Tuning & Pièces', icon: Sliders },
            { id: 'showcase', label: 'Vitrine 3D', icon: Car },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`arcade-btn flex items-center gap-1.5 border-2 px-3 py-1.5 text-xs font-bold uppercase ${
                  active
                    ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
                    : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-600'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="mt-4 min-h-[220px]">
          {activeTab === 'livery' && (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block font-pixel text-[11px] uppercase text-slate-300">
                  Nom du Modèle / Écurie
                </label>
                <input
                  type="text"
                  maxLength={18}
                  value={carName}
                  onChange={(e) => onCarNameChange(e.target.value)}
                  className="w-full border-2 border-slate-700 bg-slate-950 px-3 py-2 text-sm font-bold uppercase text-white outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <div className="mb-2 font-pixel text-[11px] uppercase text-slate-300">
                  Teinte &amp; Sponsor officiel :{' '}
                  <span className="text-amber-300">{currentLivery.name}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {CAR_LIVERIES.map((liv) => {
                    const active = liv.id === colorId;
                    return (
                      <button
                        key={liv.id}
                        type="button"
                        onClick={() => onColorChange(liv.id)}
                        className={`flex items-center gap-2.5 border-2 p-2.5 text-left transition-all ${
                          active
                            ? 'border-cyan-400 bg-cyan-950/40 ring-2 ring-cyan-500/30'
                            : 'border-slate-800 bg-slate-950/80 hover:border-slate-600'
                        }`}
                      >
                        <span
                          className="h-6 w-6 border border-white/60 shrink-0"
                          style={{ backgroundColor: liv.primary }}
                        />
                        <div className="truncate">
                          <div className="text-xs font-bold text-white">
                            {liv.name}
                          </div>
                          <div className="text-[10px] font-semibold text-slate-400">
                            N° {liv.number}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'tuning' && (
            <div className="space-y-4">
              <div>
                <div className="mb-1.5 font-pixel text-[11px] uppercase text-slate-300">
                  Aileron Arrière aérodynamique
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'gt', label: 'GT Carbone' },
                    { id: 'ducktail', label: 'Ducktail' },
                    { id: 'low', label: 'Discret Low' },
                  ].map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSpoilerType(s.id as any)}
                      className={`border-2 p-2 text-xs font-bold uppercase ${
                        spoilerType === s.id
                          ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                          : 'border-slate-800 bg-slate-950 text-slate-400'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-1.5 font-pixel text-[11px] uppercase text-slate-300">
                  Jantes &amp; Moyeux
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'chrome', label: 'Chrome 8-Branches' },
                    { id: 'mesh', label: 'Mesh Gold' },
                    { id: 'aero', label: 'Aero Turbo Fan' },
                  ].map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setRimStyle(r.id as any)}
                      className={`border-2 p-2 text-xs font-bold uppercase ${
                        rimStyle === r.id
                          ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
                          : 'border-slate-800 bg-slate-950 text-slate-400'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-400">
                <span className="font-bold text-emerald-400">Indice Performance :</span> S+ (Vmax 243 km/h · Grip Aéro Optimisé)
              </div>
            </div>
          )}

          {activeTab === 'showcase' && (
            <div className="flex flex-col items-center justify-center py-6 text-center space-y-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-cyan-400 bg-cyan-500/20 text-cyan-300 animate-pulse">
                <Sparkles className="h-7 w-7" />
              </div>
              <h3 className="font-pixel text-sm font-bold uppercase text-white">
                Inspecteur 3D Actif sur l'Écran d'Accueil
              </h3>
              <p className="max-w-md text-xs text-slate-400">
                Faites glisser ou touchez l'écran d'accueil à tout moment pour faire pivoter la caméra autour de votre voiture sous tous les angles !
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-5 flex items-center justify-end border-t border-slate-800 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="arcade-btn flex items-center gap-2 border-2 border-emerald-300 bg-emerald-500 px-5 py-2 font-pixel text-xs font-bold uppercase text-slate-950 hover:brightness-110"
          >
            <Check className="h-4 w-4" />
            <span>Valider &amp; Sauvegarder</span>
          </button>
        </div>
      </div>
    </div>
  );
};
