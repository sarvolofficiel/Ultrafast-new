import React, { useMemo } from 'react';
import { Flame, Pause, Tv, Volume2, VolumeX, Wifi } from 'lucide-react';
import { buildCustomTrackData, getTrackData } from '../game/tracks';
import type {
  CustomLevelData,
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
  customLevel?: CustomLevelData | null;
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
    dash?: boolean;
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
  customLevel = null,
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
  // Precompute SVG track polyline or Battle Royale circular radar for the compact mini-map
  const minimap = useMemo(() => {
    const track = customLevel
      ? buildCustomTrackData(customLevel)
      : getTrackData(trackId, mapSeed, raceFormat);
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

    if (track.format === 'battle-royale') {
      const center = toSvg(0, 0);
      return {
        size,
        scale,
        center,
        initialRadiusPx: (track.arenaInitialRadius || 54) * scale,
        initialArenaRadius: track.arenaInitialRadius || 54,
        isBattleRoyale: true,
        isLoop: true,
        polyline: '',
        startPt: center,
        finishPt: center,
        toSvg,
      };
    }

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
      scale,
      center: startPt,
      initialRadiusPx: 0,
      initialArenaRadius: track.arenaInitialRadius || 54,
      isBattleRoyale: false,
      isLoop: track.isLoop,
      polyline: pts.join(' '),
      startPt,
      finishPt,
      toSvg,
    };
  }, [trackId, mapSeed, raceFormat, customLevel]);

  const driftTierColor =
    hud.driftCharge >= 2.2
      ? '#ff2a85'
      : hud.driftCharge >= 1.35
        ? '#ff9f1c'
        : hud.driftCharge >= 0.55
          ? '#00f5ff'
          : '#64748b';

  const currentArenaPx = minimap.isBattleRoyale
    ? Math.max(4, (hud.arenaRadius || minimap.initialArenaRadius) * minimap.scale)
    : 0;
  const isShrinking =
    hud.isBattleRoyale &&
    hud.arenaRadius > 0 &&
    hud.arenaRadius < minimap.initialArenaRadius;

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-3 sm:p-5">
      {/* Top Row: Race Standings + Minimap (Left) & Controls/Net Status (Right) */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-2.5">
          {/* Position / Survivors, Lap / KO & Timer Cluster */}
          <div className="game-surface px-4 py-2.5">
            {hud.isBattleRoyale ? (
              <>
                <div className="flex items-baseline gap-4">
                  <div>
                    <div className="text-[11px] font-medium text-slate-400">
                      Survivants
                    </div>
                    <div className="font-mono-num text-2xl font-extrabold leading-none text-[#f5b700] sm:text-3xl">
                      {hud.aliveCount}
                      <span className="ml-1 text-xs font-semibold text-slate-400">
                        /{hud.totalRacers}
                      </span>
                    </div>
                  </div>
                  <div className="border-l border-white/10 pl-4">
                    <div className="text-[11px] font-medium text-slate-400">
                      KO
                    </div>
                    <div className="font-mono-num text-xl font-extrabold leading-none text-[#ff2e3b]">
                      {hud.knockouts}
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-4 border-t border-white/10 pt-1.5 text-xs">
                  <span className="font-mono-num font-semibold text-slate-200">
                    {formatRaceTime(hud.raceTimeMs)}
                  </span>
                  <span
                    className={`font-mono-num text-[11px] font-semibold ${
                      isShrinking ? 'text-[#ff2e3b]' : 'text-[#f5b700]'
                    }`}
                  >
                    Zone {hud.arenaRadius}m
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-baseline gap-4">
                  <div className="font-display text-2xl font-bold italic leading-none text-[#f5b700] sm:text-3xl">
                    {rankLabel(hud.rank)}
                    <span className="ml-1 text-xs font-semibold not-italic text-slate-400">
                      /{hud.totalRacers}
                    </span>
                  </div>
                  <div className="border-l border-white/10 pl-4">
                    <div className="text-[11px] font-medium text-slate-400">
                      {hud.isLoop ? 'Tour' : 'Étape'}
                    </div>
                    {hud.isLoop ? (
                      <div className="font-mono-num text-base font-bold leading-tight text-white">
                        {hud.lap}
                        <span className="text-slate-400">/{hud.totalLaps}</span>
                      </div>
                    ) : (
                      <div className="font-mono-num text-base font-bold leading-tight text-white">
                        {hud.stageProgressPct}%
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-4 border-t border-white/10 pt-1.5 text-xs">
                  <span className="font-mono-num font-semibold text-slate-200">
                    {formatRaceTime(hud.raceTimeMs)}
                  </span>
                  {hud.bestLapMs !== null && (
                    <span className="font-mono-num text-[11px] text-[#f5b700]">
                      Meilleur {formatRaceTime(hud.bestLapMs)}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Crisp SVG Circuit / Sprint / Battle Royale Radar Minimap */}
          <div className="game-surface hidden p-1.5 sm:block">
            <svg
              width={minimap.size}
              height={minimap.size}
              viewBox={`0 0 ${minimap.size} ${minimap.size}`}
            >
              {minimap.isBattleRoyale ? (
                <>
                  <circle
                    cx={minimap.center.sx}
                    cy={minimap.center.sy}
                    r={minimap.initialRadiusPx}
                    fill="#0f172a"
                    stroke="#334155"
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                  />
                  <circle
                    cx={minimap.center.sx}
                    cy={minimap.center.sy}
                    r={currentArenaPx}
                    fill="#1e293b"
                    stroke={isShrinking ? '#ef4444' : '#ffbe0b'}
                    strokeWidth="2.5"
                  />
                  <circle
                    cx={minimap.center.sx}
                    cy={minimap.center.sy}
                    r="2.5"
                    fill="#64748b"
                  />
                </>
              ) : minimap.isLoop ? (
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
              {!minimap.isBattleRoyale && (
                <circle
                  cx={minimap.startPt.sx}
                  cy={minimap.startPt.sy}
                  r="3"
                  fill={minimap.isLoop ? '#ffffff' : '#38e54d'}
                />
              )}
              {!minimap.isBattleRoyale && !minimap.isLoop && (
                <circle
                  cx={minimap.finishPt.sx}
                  cy={minimap.finishPt.sy}
                  r="3.4"
                  fill="#ffbe0b"
                  stroke="#0b0e17"
                  strokeWidth="1"
                />
              )}
              {hud.minimapRacers
                .filter((mr) => !mr.eliminated)
                .map((mr) => {
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
            <div className="game-surface flex items-center gap-1.5 px-3 py-1.5 font-mono-num text-xs font-medium text-slate-200">
              <Wifi className="h-3.5 w-3.5 text-emerald-400" />
              {role === 'host' ? (
                <span>Hôte · {peerCount}J</span>
              ) : (
                <span>
                  {clientTransport === 'webrtc' ? 'P2P' : 'Relais'} ·{' '}
                  {clientPingMs}ms
                </span>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={onCyclePixelMode}
            className="game-surface arcade-btn flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-100 hover:border-white/30"
            title="Mode écran : Pixel ++ / Pixel 3D / HD"
          >
            <Tv className="h-3.5 w-3.5 text-slate-300" />
            <span className="hidden sm:inline">
              {pixelMode === 'ultra'
                ? 'Pixel ++'
                : pixelMode === 'retro'
                  ? 'Pixel'
                  : 'HD'}
            </span>
          </button>

          <button
            type="button"
            onClick={onToggleMute}
            className="game-surface arcade-btn p-2 text-slate-100 hover:border-white/30"
            title="Son"
          >
            {muted ? (
              <VolumeX className="h-4 w-4 text-[#ff2e3b]" />
            ) : (
              <Volume2 className="h-4 w-4 text-slate-200" />
            )}
          </button>

          <button
            type="button"
            onClick={onPauseOrExit}
            className="game-surface arcade-btn p-2 text-slate-100 hover:border-white/30"
            title="Pause"
          >
            <Pause className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Center Countdown / Transient Banner */}
      <div className="flex flex-col items-center justify-center">
        {hud.countdownValue > 0 && (
          <div className="font-display text-8xl font-bold italic text-[#f5b700] drop-shadow-[0_4px_12px_rgba(0,0,0,0.85)]">
            {hud.countdownValue}
          </div>
        )}
        {hud.countdownValue === 0 && hud.bannerText && (
          <div className="font-display text-4xl font-bold italic uppercase tracking-wide text-white drop-shadow-[0_4px_12px_rgba(0,0,0,0.85)] sm:text-5xl">
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
            className="game-surface h-14 w-14 text-lg font-bold text-white active:bg-white/20"
          >
            ◀
          </button>
          <button
            type="button"
            onPointerDown={() => onTouchChange({ steer: -1 })}
            onPointerUp={() => onTouchChange({ steer: 0 })}
            onPointerLeave={() => onTouchChange({ steer: 0 })}
            className="game-surface h-14 w-14 text-lg font-bold text-white active:bg-white/20"
          >
            ▶
          </button>
        </div>

        {/* Prominent DRIFT CHARGE visual indicator (bottom-center) */}
        <div className="hidden flex-1 justify-center md:flex">
          {(hud.isDrifting || hud.driftCharge > 0.05) && (
            <div
              className="game-surface min-w-[260px] px-4 py-2.5"
              style={{
                borderColor:
                  hud.driftTier >= 1 ? driftTierColor : 'rgba(255,255,255,0.14)',
              }}
            >
              <div className="mb-1.5 flex items-center justify-between gap-4">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-white">
                  Drift
                </span>
                <span
                  className="text-[11px] font-bold uppercase"
                  style={{ color: driftTierColor }}
                >
                  {hud.driftTier === 3
                    ? 'Niv. 3 Ultra'
                    : hud.driftTier === 2
                      ? 'Niv. 2 Super'
                      : hud.driftTier === 1
                        ? 'Niv. 1 Mini'
                        : 'Amorce...'}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { min: 0, max: 0.55, color: '#00f5ff' },
                  { min: 0.55, max: 1.35, color: '#f5b700' },
                  { min: 1.35, max: 2.2, color: '#ff2e3b' },
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
                      className="h-2 bg-white/10"
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
                  className="mt-1.5 text-center text-[11px] font-medium"
                  style={{ color: driftTierColor }}
                >
                  Relâchez Shift / Espace en sortie
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-end gap-3">
          {/* Touch Pedals on mobile */}
          <div className="pointer-events-auto flex items-center gap-2 md:hidden">
            {hud.isBattleRoyale && (
              <button
                type="button"
                onPointerDown={() => onTouchChange({ dash: true })}
                onPointerUp={() => onTouchChange({ dash: false })}
                onPointerLeave={() => onTouchChange({ dash: false })}
                className={`game-surface h-12 px-3 text-xs font-bold ${
                  hud.dashCooldown <= 0
                    ? 'border-[#ff2e3b] text-[#ff2e3b]'
                    : 'text-slate-500'
                }`}
              >
                Charge
              </button>
            )}
            <button
              type="button"
              onPointerDown={() => onTouchChange({ jump: true })}
              onPointerUp={() => onTouchChange({ jump: false })}
              onPointerLeave={() => onTouchChange({ jump: false })}
              className="game-surface h-12 px-3 text-xs font-bold text-slate-200"
            >
              Saut
            </button>
            <button
              type="button"
              onPointerDown={() => onTouchChange({ drift: true })}
              onPointerUp={() => onTouchChange({ drift: false })}
              onPointerLeave={() => onTouchChange({ drift: false })}
              className="game-surface h-12 px-3 text-xs font-bold text-[#f5b700]"
            >
              Drift
            </button>
            <button
              type="button"
              onPointerDown={() => onTouchChange({ boost: true })}
              onPointerUp={() => onTouchChange({ boost: false })}
              onPointerLeave={() => onTouchChange({ boost: false })}
              className="game-surface h-12 px-3 text-xs font-bold text-white"
            >
              Nitro
            </button>
            <button
              type="button"
              onPointerDown={() => onTouchChange({ throttle: 1 })}
              onPointerUp={() => onTouchChange({ throttle: 0 })}
              onPointerLeave={() => onTouchChange({ throttle: 0 })}
              className="h-14 w-16 bg-[#ff2e3b] text-xs font-bold text-white"
            >
              Gaz
            </button>
          </div>

          {/* Speedometer & Boost Gauge */}
          <div className="game-surface min-w-[188px] px-4 py-3">
            <div className="flex items-baseline justify-between gap-2">
              <div className="flex items-baseline gap-1.5">
                <span
                  className={`font-mono-num text-3xl font-extrabold leading-none ${
                    hud.boostActive ? 'text-[#f5b700]' : 'text-white'
                  }`}
                >
                  {hud.speedKmh}
                </span>
                <span className="text-[11px] font-semibold text-slate-400">
                  km/h
                </span>
              </div>
              <span className="font-mono-num text-xs font-bold text-[#f5b700]">
                V{hud.gear}
              </span>
            </div>

            {/* Nitro Bar */}
            <div className="mt-2.5">
              <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-slate-300">
                <span className="flex items-center gap-1">
                  <Flame className="h-3 w-3 text-[#f5b700]" />
                  Nitro (F)
                </span>
                <span className="font-mono-num text-slate-200">
                  {hud.nitroEnergy}%
                </span>
              </div>
              <div className="h-1.5 w-full bg-white/10">
                <div
                  className="h-full bg-[#f5b700] transition-all duration-75"
                  style={{ width: `${hud.nitroEnergy}%` }}
                />
              </div>
            </div>

            {/* Battle Royale Left-Click Charge Gauge */}
            {hud.isBattleRoyale && (
              <div className="mt-2.5">
                <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-slate-300">
                  <span>Charge (Clic G)</span>
                  <span
                    className={`font-mono-num font-semibold ${
                      hud.dashActive
                        ? 'text-[#ff2e3b]'
                        : hud.dashCooldown <= 0
                          ? 'text-white'
                          : 'text-slate-400'
                    }`}
                  >
                    {hud.dashActive
                      ? 'Impact'
                      : hud.dashCooldown <= 0
                        ? 'Prêt'
                        : `${hud.dashCooldown.toFixed(1)}s`}
                  </span>
                </div>
                <div className="h-1.5 w-full bg-white/10">
                  <div
                    className={`h-full transition-all duration-75 ${
                      hud.dashCooldown <= 0 ? 'bg-[#ff2e3b]' : 'bg-white/40'
                    }`}
                    style={{
                      width: `${Math.max(0, Math.min(100, ((2.0 - hud.dashCooldown) / 2.0) * 100))}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {/* Drift Charge Bar inside speedometer for mobile/compact view */}
            {(hud.isDrifting || hud.driftCharge > 0.05) && (
              <div className="mt-2 md:hidden">
                <div className="mb-1 flex items-center justify-between text-[11px] font-semibold">
                  <span className="text-white">Drift</span>
                  <span style={{ color: driftTierColor }}>
                    Niv.{hud.driftTier}
                  </span>
                </div>
                <div className="h-1.5 w-full bg-white/10">
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
              <div className="mt-2 text-center text-[11px] font-bold uppercase tracking-wider text-[#f5b700]">
                Turbo actif
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
