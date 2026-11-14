import * as THREE from 'three';
import type { RaceFormat, RaceFormatPreference, TrackId, TrackMeta } from './types';

export interface BoostPad {
  segIndex: number;
  lateralOffset: number; // world meters along normal
  x: number;
  z: number;
  heading: number;
}

export interface TrackData {
  meta: TrackMeta;
  seed: number;
  format: RaceFormat;
  isLoop: boolean;
  startSegIndex: number;
  finishSegIndex: number;
  segments: number;
  points: THREE.Vector3[];
  tangents: THREE.Vector3[];
  normals: THREE.Vector3[]; // perpendicular right-hand vector in XZ plane
  cumLengths: number[];
  totalLength: number;
  halfWidth: number;
  curbWidth: number;
  wallMargin: number;
  boostPads: BoostPad[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

export const TRACK_METAS: Record<TrackId, TrackMeta> = {
  'baie-pixel': {
    id: 'baie-pixel',
    name: 'Baie Pixel',
    subtitle: 'Soleil, palmiers & virages côtiers',
    difficulty: 'Facile',
    skyTop: '#2b95ff',
    skyBottom: '#a6ecff',
    fogColor: '#98e4ff',
    groundColor: '#3cb043',
    accentColor: '#ff4d6d',
    roadWidth: 20,
  },
  'canyon-turbo': {
    id: 'canyon-turbo',
    name: 'Canyon Turbo',
    subtitle: 'Courbes rocailleuses & pointes de vitesse',
    difficulty: 'Moyen',
    skyTop: '#ff7b3d',
    skyBottom: '#ffe0a3',
    fogColor: '#ffd494',
    groundColor: '#c96f3b',
    accentColor: '#ffbe0b',
    roadWidth: 18,
  },
  'nuit-neon': {
    id: 'nuit-neon',
    name: 'Nuit Néon',
    subtitle: 'Asphalte cyber, chicanes & néons',
    difficulty: 'Pro',
    skyTop: '#070919',
    skyBottom: '#261447',
    fogColor: '#190f33',
    groundColor: '#101426',
    accentColor: '#00f5ff',
    roadWidth: 17,
  },
};

export function generateRandomSeed(): number {
  return Math.floor(Math.random() * 899999) + 100000;
}

export function resolveRaceFormat(
  pref: RaceFormatPreference,
  seed: number,
): RaceFormat {
  if (pref === 'sprint' || pref === 'circuit' || pref === 'battle-royale') return pref;
  const r = mulberry32(seed ^ 0x9e3779b9)();
  if (r < 0.48) return 'sprint';
  if (r < 0.82) return 'circuit';
  return 'battle-royale';
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function buildSprintControlPoints(seed: number): THREE.Vector3[] {
  const rng = mulberry32(seed);
  const pts: THREE.Vector3[] = [];

  // Pre-start + clean straight launch grid heading -Z (heading = PI)
  pts.push(new THREE.Vector3(0, 0, 56));
  pts.push(new THREE.Vector3(0, 0, 14));
  pts.push(new THREE.Vector3(0, 0, -28));

  let x = 0;
  let z = -28;
  let heading = Math.PI; // sin(PI)=0, cos(PI)=-1 => -Z
  const baseHeading = Math.PI + (rng() - 0.5) * 0.4;
  const numSteps = 26 + Math.floor(rng() * 5); // 26..30 forward blocks (~2.8km - 3.6km)

  // Pick a logical sequence of driving features (sweeper, S-chicane, fast straight, hairpins)
  let featureCooldown = 0;
  let turnBias = rng() < 0.5 ? 1 : -1;

  for (let i = 0; i < numSteps; i++) {
    const progressFrac = i / numSteps;
    const isFinalChute = i >= numSteps - 2;

    let stepLen = 92 + rng() * 32;
    let deltaAngle = 0;

    if (isFinalChute) {
      // Gently straighten toward baseHeading for a crisp finish chute
      const diff = Math.atan2(
        Math.sin(baseHeading - heading),
        Math.cos(baseHeading - heading),
      );
      deltaAngle = diff * 0.65;
      stepLen = 84;
    } else if (featureCooldown > 0) {
      featureCooldown--;
      // Continuation of an S-bend or sweeping corner
      deltaAngle = -turnBias * (0.36 + rng() * 0.28);
    } else {
      const roll = rng();
      if (roll < 0.26 && progressFrac > 0.12) {
        // Fast straight section
        deltaAngle = (rng() - 0.5) * 0.14;
        stepLen = 108 + rng() * 30;
      } else if (roll < 0.58) {
        // S-chicane (2-step)
        turnBias = rng() < 0.5 ? 1 : -1;
        deltaAngle = turnBias * (0.44 + rng() * 0.26);
        featureCooldown = 1;
      } else {
        // Sweeping corner
        turnBias = rng() < 0.5 ? 1 : -1;
        deltaAngle = turnBias * (0.5 + rng() * 0.34);
      }
    }

    // Keep heading within ±68 deg of baseHeading so forward projection stays strictly monotonic (no self-crossing)
    const nextHeading = heading + deltaAngle;
    const rel = Math.atan2(
      Math.sin(nextHeading - baseHeading),
      Math.cos(nextHeading - baseHeading),
    );
    heading = baseHeading + clamp(rel, -1.18, 1.18);

    x += Math.sin(heading) * stepLen;
    z += Math.cos(heading) * stepLen;
    pts.push(new THREE.Vector3(x, 0, z));
  }

  // Final runoff past Finish Gantry
  x += Math.sin(heading) * 68;
  z += Math.cos(heading) * 68;
  pts.push(new THREE.Vector3(x, 0, z));

  return pts;
}

function buildCircuitControlPoints(seed: number): THREE.Vector3[] {
  const rng = mulberry32(seed);
  const M = 22;

  // Polar harmonic radii guarantee a long, clean star-shaped closed loop (~1.7km - 2.2km)
  const rx = 205 + rng() * 50;
  const rz = 230 + rng() * 55;
  const a1 = (rng() - 0.5) * 0.32;
  const a2 = (rng() - 0.5) * 0.22;
  const a3 = (rng() - 0.5) * 0.14;
  const p1 = rng() * Math.PI * 2;
  const p2 = rng() * Math.PI * 2;
  const p3 = rng() * Math.PI * 2;

  const raw: Array<{ x: number; z: number }> = [];
  for (let i = 0; i < M; i++) {
    const theta = (i / M) * Math.PI * 2;
    const mod =
      1 +
      a1 * Math.cos(2 * theta + p1) +
      a2 * Math.cos(3 * theta + p2) +
      a3 * Math.cos(4 * theta + p3);
    const rFactor = clamp(mod, 0.72, 1.32);
    const px = -Math.cos(theta) * rx * rFactor;
    const pz = -Math.sin(theta) * rz * rFactor;
    raw.push({ x: px, z: pz });
  }

  // Enforce a straight starting grid centered around raw[0] heading -Z
  const startX = raw[0].x;
  raw[M - 1] = { x: startX, z: 64 };
  raw[0] = { x: startX, z: 0 };
  raw[1] = { x: startX, z: -64 };

  return raw.map((p) => new THREE.Vector3(p.x - startX, 0, p.z));
}

function sampleCurve(
  rawPts: THREE.Vector3[],
  isLoop: boolean,
  segments: number,
): {
  points: THREE.Vector3[];
  tangents: THREE.Vector3[];
  normals: THREE.Vector3[];
  cumLengths: number[];
  totalLength: number;
} {
  const curve = new THREE.CatmullRomCurve3(rawPts, isLoop, 'catmullrom', 0.5);
  const points: THREE.Vector3[] = [];
  const tangents: THREE.Vector3[] = [];
  const normals: THREE.Vector3[] = [];
  const cumLengths: number[] = [0];

  for (let i = 0; i < segments; i++) {
    const u = isLoop ? i / segments : i / (segments - 1);
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u).setY(0).normalize();
    const n = new THREE.Vector3(-t.z, 0, t.x).normalize();

    points.push(p);
    tangents.push(t);
    normals.push(n);

    if (i > 0) {
      cumLengths.push(cumLengths[i - 1] + p.distanceTo(points[i - 1]));
    }
  }

  const totalLength = isLoop
    ? cumLengths[segments - 1] + points[0].distanceTo(points[segments - 1])
    : cumLengths[segments - 1];

  return { points, tangents, normals, cumLengths, totalLength };
}

function validateTrackGeometry(
  sampled: ReturnType<typeof sampleCurve>,
  isLoop: boolean,
  roadWidth: number,
): boolean {
  const N = sampled.points.length;
  const minClearanceSq = (roadWidth * 2.35) ** 2;
  const minArcGap = 38;

  // 1. Total length sanity for longer races
  if (sampled.totalLength < 1450 || sampled.totalLength > 4500) {
    return false;
  }

  // 2. Smooth curvature check (no sudden pinch/kink corners)
  const step = 10;
  for (let i = 0; i < N - (isLoop ? 0 : step); i++) {
    const j = (i + step) % N;
    const dot =
      sampled.tangents[i].x * sampled.tangents[j].x +
      sampled.tangents[i].z * sampled.tangents[j].z;
    if (dot < 0.25) {
      return false;
    }
  }

  // 3. Non-adjacent centerline separation (prevents crossing or touching roads)
  for (let i = 0; i < N; i += 3) {
    const pi = sampled.points[i];
    for (let j = i + minArcGap; j < N; j += 3) {
      if (isLoop && N - (j - i) < minArcGap) continue;
      const pj = sampled.points[j];
      const dx = pi.x - pj.x;
      const dz = pi.z - pj.z;
      if (dx * dx + dz * dz < minClearanceSq) {
        return false;
      }
    }
  }

  return true;
}

function computeLogicalBoostPads(
  sampled: ReturnType<typeof sampleCurve>,
  isLoop: boolean,
  startSegIndex: number,
  finishSegIndex: number,
  halfWidth: number,
  seed: number,
): BoostPad[] {
  const N = sampled.points.length;
  const rng = mulberry32(seed ^ 0x517cc1b7);
  const startSearch = isLoop ? 26 : startSegIndex + 26;
  const endSearch = isLoop ? N - 24 : finishSegIndex - 22;

  // Score each segment for straightness so pads sit on logical fast sections/exits
  const candidates: Array<{ idx: number; score: number }> = [];
  for (let i = startSearch; i <= endSearch; i++) {
    const prev = (i - 8 + N) % N;
    const next = (i + 8) % N;
    const tPrev = sampled.tangents[prev];
    const tNext = sampled.tangents[next];
    const dot = tPrev.x * tNext.x + tPrev.z * tNext.z;
    if (dot > 0.88) {
      candidates.push({ idx: i, score: dot + rng() * 0.03 });
    }
  }

  // Partition track into 7-9 zones and pick best straight spot per zone
  const targetCount = 7 + Math.floor(rng() * 3); // 7 to 9 pads
  const span = Math.max(1, endSearch - startSearch);
  const minGap = 48;
  const chosen: number[] = [];

  for (let slot = 0; slot < targetCount; slot++) {
    const zoneLo = startSearch + (slot / targetCount) * span;
    const zoneHi = startSearch + ((slot + 1) / targetCount) * span;

    let bestIdx = -1;
    let bestScore = -1;
    for (const c of candidates) {
      if (c.idx >= zoneLo && c.idx < zoneHi) {
        const farEnough = chosen.every((prev) => Math.abs(prev - c.idx) >= minGap);
        if (farEnough && c.score > bestScore) {
          bestScore = c.score;
          bestIdx = c.idx;
        }
      }
    }

    if (bestIdx === -1) {
      const fallback = Math.round((zoneLo + zoneHi) * 0.5);
      if (chosen.every((prev) => Math.abs(prev - fallback) >= 40)) {
        bestIdx = fallback;
      }
    }

    if (bestIdx !== -1) {
      chosen.push(bestIdx);
    }
  }

  const lateralChoices = [-0.32, 0.3, 0.0, -0.26, 0.34];
  return chosen.map((segIndex, idx) => {
    const p = sampled.points[segIndex];
    const n = sampled.normals[segIndex];
    const t = sampled.tangents[segIndex];
    const lat = lateralChoices[idx % lateralChoices.length] * halfWidth;
    return {
      segIndex,
      lateralOffset: lat,
      x: p.x + n.x * lat,
      z: p.z + n.z * lat,
      heading: Math.atan2(t.x, t.z),
    };
  });
}

const trackCache = new Map<string, TrackData>();

export function getTrackData(
  trackId: TrackId,
  seed = 104729,
  format: RaceFormat = 'sprint',
): TrackData {
  const safeSeed = Math.max(1, Math.floor(seed));
  const cacheKey = `${trackId}:${format}:${safeSeed}`;
  const cached = trackCache.get(cacheKey);
  if (cached) return cached;

  const meta = TRACK_METAS[trackId];
  const isLoop = format === 'circuit' || format === 'battle-royale';
  const segments = format === 'battle-royale' ? 360 : isLoop ? 640 : 680;

  let chosenSampled: ReturnType<typeof sampleCurve> | null = null;

  if (format === 'battle-royale') {
    const radius = 75;
    const points: THREE.Vector3[] = [];
    const tangents: THREE.Vector3[] = [];
    const normals: THREE.Vector3[] = [];
    const cumLengths: number[] = [0];
    const segs = 360;
    for (let i = 0; i < segs; i++) {
      const theta = (i / segs) * Math.PI * 2;
      const x = Math.sin(theta) * radius;
      const z = Math.cos(theta) * radius;
      points.push(new THREE.Vector3(x, 0, z));
      const nextTheta = ((i + 1) / segs) * Math.PI * 2;
      const nx = Math.sin(nextTheta) * radius;
      const nz = Math.cos(nextTheta) * radius;
      const t = new THREE.Vector3(nx - x, 0, nz - z).normalize();
      tangents.push(t);
      normals.push(new THREE.Vector3(-t.z, 0, t.x).normalize());
      if (i > 0) {
        cumLengths.push(cumLengths[i - 1] + points[i].distanceTo(points[i - 1]));
      }
    }
    const totalLength = cumLengths[segs - 1] + points[0].distanceTo(points[segs - 1]);
    chosenSampled = { points, tangents, normals, cumLengths, totalLength };
  } else {
    for (let attempt = 0; attempt < 32; attempt++) {
      const attemptSeed = safeSeed + attempt * 7919;
      const rawPts = isLoop
        ? buildCircuitControlPoints(attemptSeed)
        : buildSprintControlPoints(attemptSeed);
      const sampled = sampleCurve(rawPts, isLoop, segments);
      if (validateTrackGeometry(sampled, isLoop, meta.roadWidth)) {
        chosenSampled = sampled;
        break;
      }
    }
  }

  // Deterministic guaranteed-valid fallback if all perturbed attempts missed
  if (!chosenSampled) {
    const fallbackPts = isLoop
      ? [
          new THREE.Vector3(0, 0, 60),
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(0, 0, -75),
          new THREE.Vector3(45, 0, -140),
          new THREE.Vector3(125, 0, -135),
          new THREE.Vector3(165, 0, -70),
          new THREE.Vector3(135, 0, 5),
          new THREE.Vector3(92, 0, 45),
          new THREE.Vector3(142, 0, 118),
          new THREE.Vector3(95, 0, 174),
          new THREE.Vector3(18, 0, 152),
        ]
      : [
          new THREE.Vector3(0, 0, 56),
          new THREE.Vector3(0, 0, 14),
          new THREE.Vector3(0, 0, -45),
          new THREE.Vector3(50, 0, -150),
          new THREE.Vector3(145, 0, -240),
          new THREE.Vector3(215, 0, -350),
          new THREE.Vector3(135, 0, -470),
          new THREE.Vector3(40, 0, -580),
          new THREE.Vector3(95, 0, -700),
          new THREE.Vector3(195, 0, -820),
          new THREE.Vector3(155, 0, -950),
          new THREE.Vector3(55, 0, -1080),
          new THREE.Vector3(110, 0, -1210),
          new THREE.Vector3(195, 0, -1340),
          new THREE.Vector3(120, 0, -1480),
          new THREE.Vector3(45, 0, -1620),
          new THREE.Vector3(105, 0, -1760),
          new THREE.Vector3(145, 0, -1900),
          new THREE.Vector3(145, 0, -2050),
        ];
    chosenSampled = sampleCurve(fallbackPts, isLoop, segments);
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of chosenSampled.points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }

  const startSegIndex = isLoop ? 0 : 24;
  const finishSegIndex = isLoop ? 0 : segments - 20;
  const halfWidth = meta.roadWidth / 2;
  const curbWidth = 1.6;
  const wallMargin = halfWidth + curbWidth + 5.2;

  const boostPads = computeLogicalBoostPads(
    chosenSampled,
    isLoop,
    startSegIndex,
    finishSegIndex,
    halfWidth,
    safeSeed,
  );

  const data: TrackData = {
    meta,
    seed: safeSeed,
    format,
    isLoop,
    startSegIndex,
    finishSegIndex,
    segments,
    points: chosenSampled.points,
    tangents: chosenSampled.tangents,
    normals: chosenSampled.normals,
    cumLengths: chosenSampled.cumLengths,
    totalLength: chosenSampled.totalLength,
    halfWidth,
    curbWidth,
    wallMargin,
    boostPads,
    bounds: {
      minX: minX - 55,
      maxX: maxX + 55,
      minZ: minZ - 55,
      maxZ: maxZ + 55,
    },
  };

  if (trackCache.size >= 16) {
    const firstKey = trackCache.keys().next().value;
    if (firstKey !== undefined) trackCache.delete(firstKey);
  }
  trackCache.set(cacheKey, data);
  return data;
}

export interface TrackProjection {
  segIndex: number;
  progress: number; // 0..1 along loop or stage
  lateralOffset: number; // signed distance along normal (+ right, - left)
  tangentX: number;
  tangentZ: number;
  normalX: number;
  normalZ: number;
  centerX: number;
  centerZ: number;
  onRoad: boolean;
  onCurb: boolean;
}

export function projectOntoTrack(
  track: TrackData,
  x: number,
  z: number,
  hintIndex?: number,
): TrackProjection {
  const N = track.segments;
  let bestIdx = 0;
  let bestDistSq = Infinity;

  if (hintIndex !== undefined && hintIndex >= 0 && hintIndex < N) {
    const window = 32;
    const lo = track.isLoop ? -window : Math.max(-hintIndex, -window);
    const hi = track.isLoop ? window : Math.min(N - 1 - hintIndex, window);
    for (let offset = lo; offset <= hi; offset++) {
      const idx = track.isLoop ? (hintIndex + offset + N) % N : hintIndex + offset;
      const p = track.points[idx];
      const dx = x - p.x;
      const dz = z - p.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestDistSq) {
        bestDistSq = d2;
        bestIdx = idx;
      }
    }
    if (bestDistSq > 1800) {
      for (let i = 0; i < N; i++) {
        const p = track.points[i];
        const dx = x - p.x;
        const dz = z - p.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestDistSq) {
          bestDistSq = d2;
          bestIdx = i;
        }
      }
    }
  } else {
    for (let i = 0; i < N; i++) {
      const p = track.points[i];
      const dx = x - p.x;
      const dz = z - p.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestDistSq) {
        bestDistSq = d2;
        bestIdx = i;
      }
    }
  }

  const center = track.points[bestIdx];
  const normal = track.normals[bestIdx];
  const tangent = track.tangents[bestIdx];
  const dx = x - center.x;
  const dz = z - center.z;
  const lateralOffset = dx * normal.x + dz * normal.z;
  const forwardDelta = dx * tangent.x + dz * tangent.z;

  const absLat = Math.abs(lateralOffset);
  const onRoad = absLat <= track.halfWidth;
  const onCurb = !onRoad && absLat <= track.halfWidth + track.curbWidth;

  const rawProgress =
    (track.cumLengths[bestIdx] + forwardDelta) / track.totalLength;
  const progress = track.isLoop
    ? ((rawProgress % 1) + 1) % 1
    : clamp(rawProgress, 0, 1);

  return {
    segIndex: bestIdx,
    progress,
    lateralOffset,
    tangentX: tangent.x,
    tangentZ: tangent.z,
    normalX: normal.x,
    normalZ: normal.z,
    centerX: center.x,
    centerZ: center.z,
    onRoad,
    onCurb,
  };
}

export function getSpawnTransform(
  track: TrackData,
  slotIndex: number,
  totalRacers = 8,
): { x: number; z: number; heading: number; segIndex: number } {
  if (track.format === 'battle-royale') {
    const angle = (slotIndex / Math.max(1, totalRacers)) * Math.PI * 2;
    const spawnRadius = 38;
    const x = Math.sin(angle) * spawnRadius;
    const z = Math.cos(angle) * spawnRadius;
    const heading = Math.atan2(-x, -z);
    return { x, z, heading, segIndex: Math.floor((slotIndex / totalRacers) * track.segments) };
  }

  const row = Math.floor(slotIndex / 2);
  const col = slotIndex % 2;

  let segIndex: number;
  if (track.isLoop) {
    const backSegs = 4 + row * 6;
    segIndex = (track.segments - backSegs) % track.segments;
  } else {
    const backSegs = 3 + row * 5;
    segIndex = Math.max(2, track.startSegIndex - backSegs);
  }

  const p = track.points[segIndex];
  const n = track.normals[segIndex];
  const t = track.tangents[segIndex];
  const lateral = (col === 0 ? -1 : 1) * (track.halfWidth * 0.36);

  return {
    x: p.x + n.x * lateral,
    z: p.z + n.z * lateral,
    heading: Math.atan2(t.x, t.z),
    segIndex,
  };
}
