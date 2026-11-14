import React, { useMemo } from 'react';
import { Flame, Pause, Tv, Volume2, VolumeX, Wifi } from 'lucide-react';
import { getTrackData } from '../game/tracks';
import type {
  HudTelemetry,
  NetworkRole,
  PixelMode,
  RaceFormat,
  TrackId,
  TransportType,
} from '../game/types';

interface RaceHUDProps {
  hud: HudTelemetry;
  trackId: TrackId;
  mapSeed: number;
  raceFormat: RaceFormat;
  role: NetworkRole;
  peerCount: number;
  clientPingMs: number;
  clientTransport: TransportType;
  muted: boolean;
  pixelMode: PixelMode;
  onToggleMute: () => void;
  onCyclePixelMode: () => void;
  onPauseOrExit: () => void;
  onTouchChange: (partial: {
    throttle?: number;
    brake?: number;
    steer?: number;
    drift?: boolean;
    boost?: boolean;
    jump?: boolean;
  }) => void;
}

export function formatRaceTime(ms: number): string {
  const totalSec = Math.max(0, ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = Math.floor(totalSec % 60);
  const hundredths = Math.floor((ms % 1000) / 10);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}

function rankLabel(rank: number): string {
  return rank === 1 ? '1er' : `${rank}e`;
}

export const RaceHUD: React.FC<RaceHUDProps> = ({
  hud,
  trackId,
  mapSeed,
  raceFormat,
  role,
  peerCount,
  clientPingMs,
  clientTransport,
  muted,
  pixelMode,
  onToggleMute,
  onCyclePixelMode,
  onPauseOrExit,
  onTouchChange,
}) => {
  // Precompute SVG track polyline for the compact mini-map
  const minimap = useMemo(() => {
    const track = getTrackData(trackId, mapSeed, raceFormat);
    const { minX, maxX, minZ, maxZ } = track.bounds;
    const spanX = Math.max(1, maxX - minX);
    const spanZ = Math.max(1, maxZ - minZ);
    const size = 104;
    const pad = 10;
    const scale = (size - pad * 2) / Math.max(spanX, spanZ);
    const offsetX = pad + ((size - pad * 2) - spanX * scale) * 0.5;
    const offsetY = pad + ((size - pad * 2) - spanZ * scale) * 0.5;

    const toSvg = (x: number, z: number) => ({
      sx: offsetX + (x - minX) * scale,
      sy: offsetY + (z - minZ) * scale,
    });

    const pts: string[] = [];
    for (let i = 0; i < track.segments; i += 6) {
      const p = track.points[i];
      const { sx, sy } = toSvg(p.x, p.z);
      pts.push(`${sx.toFixed(1)},${sy.toFixed(1)}`);
    }
    if (!track.isLoop) {
      const last = track.points[track.segments - 1];
      const { sx, sy } = toSvg(last.x, last.z);
      pts.push(`${sx.toFixed(1)},${sy.toFixed(1)}`);
    }
    const startPt = toSvg(
      track.points[track.startSegIndex].x,
      track.points[track.startSegIndex].z,
    );
    const finishPt = toSvg(
      track.points[track.finishSegIndex].x,
      track.points[track.finishSegIndex].z,
    );
    return {
      size,
      isLoop: track.isLoop,
      polyline: pts.join(' '),
      startPt,
      finishPt,
      toSvg,
    };
  }, [trackId, mapSeed, raceFormat]);

  const driftTierColor =
    hud.driftCharge >= 2.2
      ? '#ff2a85'
      : hud.driftCharge >= 1.35
        ? '#ff9f1c'
        : hud.driftCharge >= 0.55
          ? '#00f5ff'
          : '#64748b';

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-3 sm:p-5">
      {/* Top Row: Race Standings + Minimap (Left) & Controls/Net Status (Right) */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-2.5">
          {/* Position, Lap & Timer Cluster */}
          <div className="arcade-panel px-3.5 py-2.5">
            <div className="flex items-baseline gap-3">
              <div className="font-pixel text-2xl font-bold text-amber-300 sm:text-3xl">
                {rankLabel(hud.rank)}
                <span className="ml-1 text-xs text-slate-400">
                  /{hud.totalRacers}
                </span>
              </div>
              <div className="border-l border-slate-700 pl-3">
                <div className="font-pixel text-[10px] uppercase text-slate-400">
                  {hud.isLoop ? 'Tour' : 'Étape'}
                </div>
                {hud.isLoop ? (
                  <div className="font-mono-num text-base font-extrabold text-white">
                    {hud.lap}
                    <span className="text-slate-400">/{hud.totalLaps}</span>
                  </div>
                ) : (
                  <div className="font-mono-num text-base font-extrabold text-emerald-300">
                    {hud.stageProgressPct}%
                  </div>
                )}
              </div>
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-4 border-t border-slate-800 pt-1 text-xs">
              <span className="font-mono-num font-bold text-cyan-300">
                {formatRaceTime(hud.raceTimeMs)}
              </span>
              {hud.bestLapMs !== null && (
                <span className="font-mono-num text-[11px] text-emerald-300">
                  REC {formatRaceTime(hud.bestLapMs)}
                </span>
              )}
            </div>
          </div>

          {/* Crisp SVG Circuit/Sprint Minimap */}
          <div className="arcade-panel hidden p-1.5 sm:block">
            <svg
              width={minimap.size}
              height={minimap.size}
              viewBox={`0 0 ${minimap.size} ${minimap.size}`}
            >
              {minimap.isLoop ? (
                <>
                  <polygon
                    points={minimap.polyline}
                    fill="none"
                    stroke="#475569"
                    strokeWidth="5"
                    strokeLinejoin="round"
                  />
                  <polygon
                    points={minimap.polyline}
                    fill="none"
                    stroke="#cbd5e1"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  />
                </>
              ) : (
                <>
                  <polyline
                    points={minimap.polyline}
                    fill="none"
                    stroke="#475569"
                    strokeWidth="5"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  <polyline
                    points={minimap.polyline}
                    fill="none"
                    stroke="#cbd5e1"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </>
              )}
              <circle
                cx={minimap.startPt.sx}
                cy={minimap.startPt.sy}
                r="3"
                fill={minimap.isLoop ? '#ffffff' : '#38e54d'}
              />
              {!minimap.isLoop && (
                <circle
                  cx={minimap.finishPt.sx}
                  cy={minimap.finishPt.sy}
                  r="3.4"
                  fill="#ffbe0b"
                  stroke="#0b0e17"
                  strokeWidth="1"
                />
              )}
              {hud.minimapRacers.map((mr) => {
                const { sx, sy } = minimap.toSvg(mr.x, mr.z);
                return (
                  <circle
                    key={mr.id}
                    cx={sx}
                    cy={sy}
                    r={mr.isLocal ? 4.4 : 3.2}
                    fill={mr.color}
                    stroke="#0b0e17"
                    strokeWidth="1.4"
                  />
                );
              })}
            </svg>
          </div>
        </div>

        {/* Top-Right Compact Controls & Net Telemetry */}
        <div className="pointer-events-auto flex items-center gap-2">
          {role !== 'offline' && (
            <div className="arcade-panel flex items-center gap-1.5 px-2.5 py-1.5 font-mono-num text-[11px] font-bold text-slate-200">
              <Wifi className="h-3.5 w-3.5 text-emerald-400" />
              {role === 'host' ? (
                <span>HÔTE PC · {peerCount}J</span>
              ) : (
                <span>
                  {clientTransport === 'webrtc' ? 'P2P' : 'RELAIS'} ·{' '}
                  {clientPingMs}ms
                </span>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={onCyclePixelMode}
            className="arcade-panel arcade-btn flex items-center gap-1 px-2.5 py-2 text-[11px] font-bold uppercase text-slate-100 hover:border-cyan-400"
            title="Mode écran : Pixel Max / Pixel 3D / HD"
          >
            <Tv className="h-3.5 w-3.5 text-cyan-400" />
            <span className="hidden sm:inline">
              {pixelMode === 'ultra'
                ? 'PIXEL ++'
                : pixelMode === 'retro'
                  ? 'PIXEL'
                  : 'HD'}
            </span>
          </button>

          <button
            type="button"
            onClick={onToggleMute}
            className="arcade-panel arcade-btn p-2 text-slate-100 hover:border-amber-400"
            title="Son"
          >
            {muted ? (
              <VolumeX className="h-4 w-4 text-rose-400" />
            ) : (
              <Volume2 className="h-4 w-4 text-emerald-400" />
            )}
          </button>

          <button
            type="button"
            onClick={onPauseOrExit}
            className="arcade-panel arcade-btn p-2 text-slate-100 hover:border-white"
            title="Pause / Menu"
          >
            <Pause className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Center Countdown / Transient Banner */}
      <div className="flex flex-col items-center justify-center">
        {hud.countdownValue > 0 && (
          <div className="font-pixel text-7xl font-bold text-amber-300 drop-shadow-[0_6px_0_#000] sm:text-8xl">
            {hud.countdownValue}
          </div>
        )}
        {hud.countdownValue === 0 && hud.bannerText && (
          <div className="font-pixel text-3xl font-bold uppercase tracking-wider text-cyan-300 drop-shadow-[0_4px_0_#000] sm:text-5xl">
            {hud.bannerText}
          </div>
        )}
      </div>

      {/* Bottom Row: Touch Controls (mobile/coarse) + Speedometer & Nitro (Right) */}
      <div className="flex items-end justify-between gap-4">
        {/* Touch Controls for mobile/tablet */}
        <div className="pointer-events-auto flex items-center gap-2 md:hidden">
          <button
            type="button"
            onPointerDown={() => onTouchChange({ steer: 1 })}
            onPointerUp={() => onTouchChange({ steer: 0 })}
            onPointerLeave={() => onTouchChange({ steer: 0 })}
            className="arcade-panel h-14 w-14 font-pixel text-lg font-bold text-white active:bg-cyan-500/40"
          >
            ◀
          </button>
          <button
            type="button"
            onPointerDown={() => onTouchChange({ steer: -1 })}
            onPointerUp={() => onTouchChange({ steer: 0 })}
            onPointerLeave={() => onTouchChange({ steer: 0 })}
            className="arcade-panel h-14 w-14 font-pixel text-lg font-bold text-white active:bg-cyan-500/40"
          >
            ▶
          </button>
        </div>

        {/* Prominent DRIFT CHARGE visual indicator (bottom-center) */}
        <div className="hidden flex-1 justify-center md:flex">
          {(hud.isDrifting || hud.driftCharge > 0.05) && (
            <div
              className="arcade-panel min-w-[270px] px-4 py-2.5"
              style={{
                borderColor:
                  hud.driftTier >= 1 ? driftTierColor : 'rgba(255,255,255,0.2)',
              }}
            >
              <div className="mb-1.5 flex items-center justify-between gap-4">
                <span className="font-pixel text-[11px] font-bold uppercase tracking-wider text-white">
                  DRIFT CHARGE
                </span>
                <span
                  className="font-pixel text-[11px] font-bold uppercase"
                  style={{ color: driftTierColor }}
                >
                  {hud.driftTier === 3
                    ? 'NIV.3 ULTRA !'
                    : hud.driftTier === 2
                      ? 'NIV.2 SUPER'
                      : hud.driftTier === 1
                        ? 'NIV.1 MINI'
                        : 'AMORCE...'}
                </span>
              </div>

              {/* 3 Chunky Pixel Charge Segments */}
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { min: 0, max: 0.55, color: '#00f5ff' },
                  { min: 0.55, max: 1.35, color: '#ff9f1c' },
                  { min: 1.35, max: 2.2, color: '#ff2a85' },
                ].map((seg, idx) => {
                  const pct = Math.max(
                    0,
                    Math.min(
                      100,
                      ((hud.driftCharge - seg.min) / (seg.max - seg.min)) * 100,
                    ),
                  );
                  return (
                    <div
                      key={idx}
                      className="h-3 border border-slate-700 bg-slate-950 p-0.5"
                    >
                      <div
                        className="h-full transition-all duration-75"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: seg.color,
                        }}
                      />
                    </div>
                  );
                })}
              </div>

              {hud.driftTier >= 1 && (
                <div
                  className="mt-1.5 text-center font-pixel text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: driftTierColor }}
                >
                  Relâchez Shift / Espace en sortie !
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-end gap-3">
          {/* Touch Pedals on mobile */}
          <div className="pointer-events-auto flex items-center gap-2 md:hidden">
            <button
              type="button"
              onPointerDown={() => onTouchChange({ jump: true })}
              onPointerUp={() => onTouchChange({ jump: false })}
              onPointerLeave={() => onTouchChange({ jump: false })}
              className="arcade-panel h-12 px-3 font-pixel text-[10px] font-bold text-rose-300"
            >
              SAUT
            </button>
            <button
              type="button"
              onPointerDown={() => onTouchChange({ drift: true })}
              onPointerUp={() => onTouchChange({ drift: false })}
              onPointerLeave={() => onTouchChange({ drift: false })}
              className="arcade-panel h-12 px-3 font-pixel text-[10px] font-bold text-amber-300"
            >
              DRIFT
            </button>
            <button
              type="button"
              onPointerDown={() => onTouchChange({ boost: true })}
              onPointerUp={() => onTouchChange({ boost: false })}
              onPointerLeave={() => onTouchChange({ boost: false })}
              className="arcade-panel h-12 px-3 font-pixel text-[10px] font-bold text-cyan-300"
            >
              NITRO
            </button>
            <button
              type="button"
              onPointerDown={() => onTouchChange({ throttle: 1 })}
              onPointerUp={() => onTouchChange({ throttle: 0 })}
              onPointerLeave={() => onTouchChange({ throttle: 0 })}
              className="arcade-panel h-14 w-16 font-pixel text-xs font-bold text-emerald-300"
            >
              GAZ
            </button>
          </div>

          {/* Speedometer & Boost Gauge */}
          <div className="arcade-panel min-w-[184px] px-3.5 py-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <div className="flex items-baseline gap-1">
                <span
                  className={`font-mono-num text-3xl font-extrabold leading-none ${
                    hud.boostActive ? 'text-cyan-300' : 'text-white'
                  }`}
                >
                  {hud.speedKmh}
                </span>
                <span className="font-pixel text-[10px] text-slate-400">
                  KM/H
                </span>
              </div>
              <span className="border border-slate-700 bg-slate-950 px-1.5 py-0.5 font-mono-num text-xs font-bold text-amber-300">
                V{hud.gear}
              </span>
            </div>

            {/* Nitro Bar */}
            <div className="mt-2">
              <div className="mb-0.5 flex items-center justify-between text-[10px] font-bold uppercase text-slate-400">
                <span className="flex items-center gap-1">
                  <Flame className="h-3 w-3 text-cyan-400" />
                  Nitro (F)
                </span>
                <span className="font-mono-num text-cyan-300">
                  {hud.nitroEnergy}%
                </span>
              </div>
              <div className="h-2 w-full bg-slate-900">
                <div
                  className="h-full bg-cyan-400 transition-all duration-75"
                  style={{ width: `${hud.nitroEnergy}%` }}
                />
              </div>
            </div>

            {/* Drift Charge Bar inside speedometer for mobile/compact view */}
            {(hud.isDrifting || hud.driftCharge > 0.05) && (
              <div className="mt-2 md:hidden">
                <div className="mb-0.5 flex items-center justify-between text-[10px] font-bold uppercase">
                  <span className="text-white">DRIFT CHARGE</span>
                  <span style={{ color: driftTierColor }}>
                    NIV.{hud.driftTier}
                  </span>
                </div>
                <div className="h-2 w-full bg-slate-900">
                  <div
                    className="h-full transition-all duration-75"
                    style={{
                      width: `${Math.min(100, (hud.driftCharge / 2.2) * 100)}%`,
                      backgroundColor: driftTierColor,
                    }}
                  />
                </div>
              </div>
            )}

            {hud.boostActive && (
              <div className="mt-1.5 border border-cyan-400/70 bg-cyan-500/20 py-0.5 text-center font-pixel text-[10px] font-bold uppercase text-cyan-200">
                TURBO ACTIF
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
