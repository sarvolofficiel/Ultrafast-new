import {
  getSpawnTransform,
  projectOntoTrack,
  type TrackData,
} from './tracks';
import type {
  CarColorId,
  PlayerInput,
  RacerState,
  WorldSnapshot,
} from './types';

function normalizeAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export interface RaceEvent {
  type: 'collision' | 'boost' | 'lap' | 'jump';
  x: number;
  z: number;
  racerId: string;
  intensity?: number;
}

export function createInitialRacers(
  track: TrackData,
  participants: Array<{
    id: string;
    name: string;
    colorId: CarColorId;
    isAI: boolean;
    isLocal: boolean;
  }>,
): RacerState[] {
  return participants.map((p, idx) => {
    const spawn = getSpawnTransform(track, idx, participants.length);
    return {
      id: p.id,
      name: p.name,
      colorId: p.colorId,
      isAI: p.isAI,
      isLocal: p.isLocal,
      slotIndex: idx,
      x: spawn.x,
      y: 0,
      z: spawn.z,
      vx: 0,
      vy: 0,
      vz: 0,
      heading: spawn.heading,
      pitch: 0,
      airFlipAccum: 0,
      speed: 0,
      steerAngle: 0,
      visualYawOffset: 0,
      driftDir: 0,
      driftCharge: 0,
      boostTimer: 0,
      nitroEnergy: 60,
      offRoad: false,
      braking: false,
      segIndex: spawn.segIndex,
      lap: 1,
      maxCheckpoint: 0,
      totalProgress: track.isLoop
        ? -0.02 * (idx + 1)
        : (spawn.segIndex - track.startSegIndex) /
          Math.max(1, track.finishSegIndex - track.startSegIndex),
      rank: idx + 1,
      finished: false,
      finishTimeMs: 0,
      lapStartTimeMs: 0,
      bestLapMs: null,
      lastLapMs: null,
    };
  });
}

export function computeAIInput(
  racer: RacerState,
  track: TrackData,
  allRacers: RacerState[],
  leaderProgress: number,
): PlayerInput {
  const N = track.segments;
  const lookAhead = 14;
  const targetIdx = track.isLoop
    ? (racer.segIndex + lookAhead) % N
    : Math.min(N - 1, racer.segIndex + lookAhead);
  const farIdx = track.isLoop
    ? (racer.segIndex + 26) % N
    : Math.min(N - 1, racer.segIndex + 26);

  // Deterministic preferred lane per AI slot
  const baseLane = ((racer.slotIndex % 3) - 1) * (track.halfWidth * 0.34);

  // Steer toward nearby boost pad if close ahead
  let targetLane = baseLane;
  for (const pad of track.boostPads) {
    const segDiff = track.isLoop
      ? (pad.segIndex - racer.segIndex + N) % N
      : pad.segIndex - racer.segIndex;
    if (segDiff > 2 && segDiff < 24) {
      targetLane = pad.lateralOffset;
      break;
    }
  }

  // Overtake slower car directly ahead
  for (const other of allRacers) {
    if (other.id === racer.id) continue;
    const dx = other.x - racer.x;
    const dz = other.z - racer.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < 85) {
      const fwdDot = dx * Math.sin(racer.heading) + dz * Math.cos(racer.heading);
      if (fwdDot > 0) {
        const rightDot = dx * Math.cos(racer.heading) - dz * Math.sin(racer.heading);
        targetLane += rightDot > 0 ? -3.6 : 3.6;
      }
    }
  }
  targetLane = Math.max(-track.halfWidth * 0.7, Math.min(track.halfWidth * 0.7, targetLane));

  const p = track.points[targetIdx];
  const n = track.normals[targetIdx];
  const tx = p.x + n.x * targetLane;
  const tz = p.z + n.z * targetLane;

  const desiredAngle = Math.atan2(tx - racer.x, tz - racer.z);
  const diff = normalizeAngle(desiredAngle - racer.heading);

  // Measure upcoming corner sharpness
  const tNow = track.tangents[racer.segIndex];
  const tFar = track.tangents[farIdx];
  const cornerDot = tNow.x * tFar.x + tNow.z * tFar.z;
  const sharpTurn = cornerDot < 0.78;

  const steer = Math.max(-1, Math.min(1, diff * 2.2));
  const shouldDrift = sharpTurn && Math.abs(diff) > 0.28 && racer.speed > 26;

  // Gentle arcade catch-up only when far behind; bots use nitro sparingly
  const behindLeader = leaderProgress - racer.totalProgress;
  const useBoost =
    racer.nitroEnergy > 78 &&
    !sharpTurn &&
    behindLeader > 0.35 &&
    Math.random() < 0.008;

  return {
    throttle: sharpTurn && racer.speed > 36 ? 0.55 : 0.95,
    brake: sharpTurn && racer.speed > 45 ? 0.45 : 0,
    steer,
    drift: shouldDrift,
    boost: useBoost,
    jump: false,
    seq: 0,
  };
}

export function stepRaceSimulation(
  racers: RacerState[],
  inputs: Map<string, PlayerInput>,
  track: TrackData,
  totalLaps: number,
  raceElapsedMs: number,
  dt: number,
  canMove: boolean,
): RaceEvent[] {
  const events: RaceEvent[] = [];

  // Determine leader & human progress for fair AI pacing
  let leaderProgress = 0;
  let humanProgress = -Infinity;
  for (const r of racers) {
    if (r.totalProgress > leaderProgress) leaderProgress = r.totalProgress;
    if (!r.isAI && r.totalProgress > humanProgress) humanProgress = r.totalProgress;
  }
  if (humanProgress === -Infinity) humanProgress = leaderProgress;

  for (const r of racers) {
    if (!canMove) {
      r.speed = 0;
      r.vx = 0;
      r.vz = 0;
      r.braking = false;
      continue;
    }

    const finishedSprint = r.finished && !track.isLoop;
    const input: PlayerInput = finishedSprint
      ? { throttle: 0, brake: 0.7, steer: 0, drift: false, boost: false, jump: false, seq: 0 }
      : r.finished || r.isAI
        ? computeAIInput(r, track, racers, leaderProgress)
        : inputs.get(r.id) ?? {
            throttle: 0,
            brake: 0,
            steer: 0,
            drift: false,
            boost: false,
            jump: false,
            seq: 0,
          };

    const wasGrounded = r.y <= 0.02 && r.vy <= 0.1;

    // Jump trigger (KeyE)
    if (input.jump && wasGrounded) {
      r.vy = 18.0;
      r.y = 0.04;
      r.airFlipAccum = 0;
      if (r.driftDir !== 0) {
        if (r.driftCharge >= 0.55) {
          const tier = r.driftCharge >= 2.2 ? 3 : r.driftCharge >= 1.35 ? 2 : 1;
          const duration = tier === 3 ? 1.9 : tier === 2 ? 1.35 : 0.9;
          r.boostTimer = Math.max(r.boostTimer, duration);
          const surgeSpeed = 62 + tier * 6;
          r.speed = Math.max(
            r.speed,
            r.isAI ? Math.min(243 / 3.6, surgeSpeed) : surgeSpeed,
          );
          events.push({ type: 'boost', x: r.x, z: r.z, racerId: r.id, intensity: tier });
        }
        r.driftDir = 0;
        r.driftCharge = 0;
      }
      events.push({ type: 'jump', x: r.x, z: r.z, racerId: r.id });
    }

    // Vertical physics & airborne vertical rotation (frontflip / backflip)
    if (r.y > 0.02 || r.vy > 0) {
      r.vy -= 33.0 * dt;
      r.y += r.vy * dt;
      if (r.y > 0.02) {
        const pitchInput = input.throttle - input.brake;
        const dPitch = pitchInput * 6.0 * dt;
        r.pitch += dPitch;
        r.airFlipAccum += Math.abs(dPitch);
      } else {
        r.y = 0;
        r.vy = 0;
        if (r.airFlipAccum >= Math.PI * 1.45) {
          r.boostTimer = Math.max(r.boostTimer, 1.45);
          r.speed = Math.max(r.speed, r.isAI ? 243 / 3.6 : 70);
          r.nitroEnergy = Math.min(100, r.nitroEnergy + 24);
          events.push({ type: 'boost', x: r.x, z: r.z, racerId: r.id, intensity: 2 });
        }
        r.airFlipAccum = 0;
        r.pitch = normalizeAngle(r.pitch);
      }
    } else {
      r.y = 0;
      r.vy = 0;
      r.pitch += (0 - r.pitch) * Math.min(1, dt * 18);
    }

    const grounded = r.y <= 0.05;

    // AI bots cruise at ~86%-92% of player base speed and are strictly capped at 243 km/h (67.5 m/s)
    const AI_MAX_SPEED = 243 / 3.6;
    let aiFactor = 1.0;
    if (r.isAI) {
      const baseTier = 0.86 + (r.slotIndex % 3) * 0.03;
      const gapToHuman = humanProgress - r.totalProgress;
      const rubberBand =
        gapToHuman > 0.15
          ? Math.min(0.05, (gapToHuman - 0.15) * 0.12)
          : gapToHuman < -0.08
            ? Math.max(-0.06, gapToHuman * 0.15)
            : 0;
      aiFactor = Math.min(0.95, Math.max(0.8, baseTier + rubberBand));
    }

    const maxBaseSpeed = 58 * aiFactor;
    const boostSpeedBonus = r.boostTimer > 0 ? (r.isAI ? 14 : 24) : 0;
    const offRoadCap = grounded && r.offRoad ? 0.62 : 1.0;
    const rawTopSpeed = (maxBaseSpeed + boostSpeedBonus) * offRoadCap;
    const topSpeed = r.isAI
      ? Math.min(AI_MAX_SPEED * offRoadCap, rawTopSpeed)
      : rawTopSpeed;

    // Boost timer & manual Nitro
    if (r.boostTimer > 0) {
      r.boostTimer = Math.max(0, r.boostTimer - dt);
    }
    if (input.boost && r.nitroEnergy > 18 && r.boostTimer <= 0.15) {
      r.boostTimer = r.isAI ? 0.65 : 0.85;
      r.speed = Math.max(r.speed, r.isAI ? Math.min(AI_MAX_SPEED, 60) : 66);
      r.nitroEnergy = Math.max(0, r.nitroEnergy - 32);
      events.push({ type: 'boost', x: r.x, z: r.z, racerId: r.id, intensity: 1 });
    } else {
      r.nitroEnergy = Math.min(100, r.nitroEnergy + dt * (r.isAI ? 2.5 : 4.5));
    }

    // Acceleration & braking (grounded only; airborne throttle/brake controls vertical pitch)
    const baseAccel = r.boostTimer > 0 ? 94 : 46;
    const accel = baseAccel * (r.isAI ? aiFactor : 1) * (r.offRoad ? 0.65 : 1);
    if (grounded) {
      if (input.throttle > 0) {
        r.speed += accel * input.throttle * dt;
      }
      if (input.brake > 0) {
        if (r.speed > 2) {
          r.speed -= 62 * input.brake * dt;
          r.braking = true;
        } else {
          r.speed = Math.max(-18, r.speed - 28 * input.brake * dt);
          r.braking = false;
        }
      } else {
        r.braking = false;
      }

      // Natural drag
      if (input.throttle <= 0 && input.brake <= 0) {
        r.speed -= r.speed * 1.35 * dt;
      }
    } else {
      r.braking = false;
      r.speed -= r.speed * 0.12 * dt;
    }

    if (r.speed > topSpeed) {
      r.speed += (topSpeed - r.speed) * Math.min(1, dt * (grounded ? 4.5 : 0.8));
    }
    if (r.isAI && r.speed > AI_MAX_SPEED) {
      r.speed = AI_MAX_SPEED;
    }

    // Drift (Shift / Space) & steering
    const absSpeed = Math.abs(r.speed);
    const speedSteerFactor = Math.min(1, absSpeed / 12) * (r.speed >= 0 ? 1 : -1);

    if (
      grounded &&
      input.drift &&
      r.speed > 10 &&
      (Math.abs(input.steer) > 0.04 || r.driftDir !== 0)
    ) {
      if (r.driftDir === 0) {
        r.driftDir = input.steer >= 0 ? 1 : -1;
      }
      // Lock into power-slide arc while allowing wide counter-steer or tight apex modulation
      const driftTurn = r.driftDir * 1.25 + input.steer * 0.85;
      r.heading = normalizeAngle(r.heading + driftTurn * dt * speedSteerFactor);
      const targetSlip = r.driftDir * 0.36;
      r.visualYawOffset += (targetSlip - r.visualYawOffset) * Math.min(1, dt * 10);
      const chargeRate = 1.35 + Math.abs(input.steer) * 0.45;
      r.driftCharge = Math.min(3.0, r.driftCharge + dt * chargeRate);
      r.nitroEnergy = Math.min(100, r.nitroEnergy + dt * 9);
    } else {
      if (r.driftDir !== 0 && grounded) {
        // Exit-turn temporary speed boost based on Drift Charge tier
        if (r.driftCharge >= 0.55) {
          const tier = r.driftCharge >= 2.2 ? 3 : r.driftCharge >= 1.35 ? 2 : 1;
          const duration = tier === 3 ? 1.9 : tier === 2 ? 1.35 : 0.9;
          r.boostTimer = Math.max(r.boostTimer, duration);
          const surgeSpeed = 62 + tier * 6;
          r.speed = Math.max(
            r.speed,
            r.isAI ? Math.min(AI_MAX_SPEED, surgeSpeed) : surgeSpeed,
          );
          r.nitroEnergy = Math.min(100, r.nitroEnergy + 12);
          events.push({
            type: 'boost',
            x: r.x,
            z: r.z,
            racerId: r.id,
            intensity: tier,
          });
        }
        r.driftDir = 0;
        r.driftCharge = 0;
      }
      const turnRate = (grounded ? 2.35 : 1.15) * speedSteerFactor;
      r.heading = normalizeAngle(r.heading + input.steer * turnRate * dt);
      r.visualYawOffset += (0 - r.visualYawOffset) * Math.min(1, dt * 12);
    }

    // Visual front wheel steer
    const targetWheelAngle = input.steer * 0.42;
    r.steerAngle += (targetWheelAngle - r.steerAngle) * Math.min(1, dt * 14);

    // Move car in XZ plane (+Z forward when heading = 0)
    const dirX = Math.sin(r.heading);
    const dirZ = Math.cos(r.heading);

    // Lateral velocity blending for arcade grip vs drift slide
    const targetVx = dirX * r.speed;
    const targetVz = dirZ * r.speed;
    const grip = !grounded ? 1.2 : r.driftDir !== 0 ? 5.2 : 11.5;
    r.vx += (targetVx - r.vx) * Math.min(1, dt * grip);
    r.vz += (targetVz - r.vz) * Math.min(1, dt * grip);

    r.x += r.vx * dt;
    r.z += r.vz * dt;

    // Track projection & boundary collision
    const prevSeg = r.segIndex;
    const proj = projectOntoTrack(track, r.x, r.z, prevSeg);
    r.segIndex = proj.segIndex;
    r.offRoad = !proj.onRoad && !proj.onCurb;

    const maxLat = track.wallMargin - 1.35;
    if (Math.abs(proj.lateralOffset) > maxLat) {
      const sign = Math.sign(proj.lateralOffset);
      const excess = Math.abs(proj.lateralOffset) - maxLat;
      r.x -= proj.normalX * sign * excess;
      r.z -= proj.normalZ * sign * excess;

      // Deflect velocity inward & damp slightly
      const outwardVel = r.vx * proj.normalX + r.vz * proj.normalZ;
      if (outwardVel * sign > 0) {
        r.vx -= proj.normalX * outwardVel * 1.25;
        r.vz -= proj.normalZ * outwardVel * 1.25;
        r.speed *= 0.84;
        if (Math.abs(outwardVel) > 6) {
          events.push({
            type: 'collision',
            x: r.x,
            z: r.z,
            racerId: r.id,
            intensity: Math.min(1.5, Math.abs(outwardVel) / 20),
          });
        }
      }
      // Nudge heading gently toward track tangent so cars never get wedged
      const trackYaw = Math.atan2(proj.tangentX, proj.tangentZ);
      const yawDiff = normalizeAngle(trackYaw - r.heading);
      r.heading = normalizeAngle(r.heading + yawDiff * 0.25);
    }

    // Longitudinal end-cap containment for open Sprint stages
    if (!track.isLoop) {
      if (proj.segIndex <= 1) {
        const backPt = track.points[1];
        const backTan = track.tangents[1];
        const along = (r.x - backPt.x) * backTan.x + (r.z - backPt.z) * backTan.z;
        if (along < 0) {
          r.x -= backTan.x * along;
          r.z -= backTan.z * along;
          r.speed = Math.max(0, r.speed);
        }
      } else if (proj.segIndex >= track.segments - 2) {
        const endPt = track.points[track.segments - 2];
        const endTan = track.tangents[track.segments - 2];
        const along = (r.x - endPt.x) * endTan.x + (r.z - endPt.z) * endTan.z;
        if (along > 0) {
          r.x -= endTan.x * along;
          r.z -= endTan.z * along;
          r.speed = Math.min(0, r.speed);
          r.vx *= 0.25;
          r.vz *= 0.25;
        }
      }
    }

    // Boost pads check (only when close to ground)
    if (r.y < 1.2) {
      for (const pad of track.boostPads) {
        const dx = r.x - pad.x;
        const dz = r.z - pad.z;
        if (dx * dx + dz * dz < 14.5) {
          if (r.boostTimer < 0.9) {
            events.push({ type: 'boost', x: r.x, z: r.z, racerId: r.id });
          }
          r.boostTimer = Math.max(r.boostTimer, 1.3);
          r.nitroEnergy = Math.min(100, r.nitroEnergy + 20);
        }
      }
    }

    // Checkpoint & Lap / Sprint Stage Progression
    if (!r.finished) {
      if (track.isLoop) {
        const quarter = Math.floor(proj.progress * 4);
        if (quarter === 1 && r.maxCheckpoint === 0) r.maxCheckpoint = 1;
        else if (quarter === 2 && r.maxCheckpoint === 1) r.maxCheckpoint = 2;
        else if (quarter === 3 && r.maxCheckpoint >= 2) r.maxCheckpoint = 3;

        const prevProg = prevSeg / track.segments;
        // Crossed start/finish line forward
        if (prevProg > 0.85 && proj.progress < 0.15 && r.maxCheckpoint >= 2) {
          const lapTime = raceElapsedMs - r.lapStartTimeMs;
          r.lastLapMs = lapTime;
          if (r.bestLapMs === null || lapTime < r.bestLapMs) {
            r.bestLapMs = lapTime;
          }
          r.lapStartTimeMs = raceElapsedMs;
          r.maxCheckpoint = 0;

          if (r.lap >= totalLaps) {
            r.finished = true;
            r.finishTimeMs = raceElapsedMs;
            events.push({ type: 'lap', x: r.x, z: r.z, racerId: r.id, intensity: 2 });
          } else {
            r.lap += 1;
            events.push({ type: 'lap', x: r.x, z: r.z, racerId: r.id, intensity: 1 });
          }
        }

        const effectiveProg =
          r.lap === 1 && r.maxCheckpoint === 0 && proj.progress > 0.8
            ? proj.progress - 1
            : proj.progress;
        r.totalProgress = r.lap - 1 + effectiveProg;
      } else {
        // Point-to-point Sprint stage progression (0 -> 1 from start gantry to finish gantry)
        const startFrac = track.cumLengths[track.startSegIndex] / track.totalLength;
        const finishFrac = track.cumLengths[track.finishSegIndex] / track.totalLength;
        const stageProg = (proj.progress - startFrac) / Math.max(0.01, finishFrac - startFrac);
        r.lap = 1;
        r.totalProgress = stageProg;

        if (proj.segIndex >= track.finishSegIndex) {
          r.finished = true;
          r.finishTimeMs = raceElapsedMs;
          r.bestLapMs = raceElapsedMs;
          r.lastLapMs = raceElapsedMs;
          r.totalProgress = 1;
          events.push({ type: 'lap', x: r.x, z: r.z, racerId: r.id, intensity: 2 });
        }
      }
    } else {
      r.totalProgress =
        (track.isLoop ? totalLaps : 1) + 1 + 1 / Math.max(1, r.finishTimeMs);
    }
  }

  // Car-to-car elastic collisions
  const minSep = 2.65;
  const minSepSq = minSep * minSep;
  for (let i = 0; i < racers.length; i++) {
    for (let j = i + 1; j < racers.length; j++) {
      const a = racers[i];
      const b = racers[j];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > 0.0001 && d2 < minSepSq) {
        const dist = Math.sqrt(d2);
        const nx = dx / dist;
        const nz = dz / dist;
        const overlap = (minSep - dist) * 0.5;
        a.x -= nx * overlap;
        a.z -= nz * overlap;
        b.x += nx * overlap;
        b.z += nz * overlap;

        const rvx = b.vx - a.vx;
        const rvz = b.vz - a.vz;
        const velAlongNormal = rvx * nx + rvz * nz;
        if (velAlongNormal < 0) {
          const jImpulse = -0.85 * velAlongNormal;
          a.vx -= nx * jImpulse;
          a.vz -= nz * jImpulse;
          b.vx += nx * jImpulse;
          b.vz += nz * jImpulse;
          a.speed *= 0.92;
          b.speed *= 0.92;

          if (Math.abs(velAlongNormal) > 5) {
            events.push({
              type: 'collision',
              x: (a.x + b.x) * 0.5,
              z: (a.z + b.z) * 0.5,
              racerId: a.id,
              intensity: Math.min(1.4, Math.abs(velAlongNormal) / 18),
            });
          }
        }
      }
    }
  }

  // Battle Royale arena boundary check & elimination
  if (track.format === 'battle-royale') {
    for (const r of racers) {
      if (!r.finished) {
        const distFromCenter = Math.hypot(r.x, r.z);
        if (distFromCenter > 78 || r.y < -1) {
          r.finished = true;
          r.finishTimeMs = raceElapsedMs;
          r.y = -6;
          r.speed = 0;
          r.vx = 0;
          r.vz = 0;
          events.push({ type: 'collision', x: r.x, z: r.z, racerId: r.id, intensity: 2.0 });
        }
      }
    }

    const activeRacers = racers.filter((r) => !r.finished);
    if (activeRacers.length <= 1 && racers.length > 1) {
      for (const r of activeRacers) {
        if (!r.finished) {
          r.finished = true;
          r.finishTimeMs = raceElapsedMs;
        }
      }
    }
  }

  // Update live ranks
  const sorted = [...racers].sort((a, b) => {
    if (track.format === 'battle-royale') {
      if (a.finished && b.finished) return b.finishTimeMs - a.finishTimeMs;
      if (a.finished) return 1;
      if (b.finished) return -1;
      return 0;
    }
    if (a.finished && b.finished) return a.finishTimeMs - b.finishTimeMs;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.totalProgress - a.totalProgress;
  });
  sorted.forEach((r, idx) => {
    r.rank = idx + 1;
  });

  return events;
}

export function buildSnapshot(
  racers: RacerState[],
  tick: number,
  raceElapsedMs: number,
  countdownValue: number,
  phase: 'countdown' | 'racing' | 'finished',
  events: RaceEvent[],
): WorldSnapshot {
  return {
    tick,
    raceElapsedMs,
    countdownValue,
    phase,
    racers: racers.map((r) => ({
      id: r.id,
      name: r.name,
      colorId: r.colorId,
      isAI: r.isAI,
      slotIndex: r.slotIndex,
      x: Math.round(r.x * 100) / 100,
      y: Math.round(r.y * 100) / 100,
      z: Math.round(r.z * 100) / 100,
      vx: Math.round(r.vx * 10) / 10,
      vy: Math.round(r.vy * 10) / 10,
      vz: Math.round(r.vz * 10) / 10,
      heading: Math.round(r.heading * 1000) / 1000,
      pitch: Math.round(r.pitch * 1000) / 1000,
      speed: Math.round(r.speed * 10) / 10,
      steerAngle: Math.round(r.steerAngle * 100) / 100,
      visualYawOffset: Math.round(r.visualYawOffset * 100) / 100,
      driftDir: r.driftDir,
      driftCharge: Math.round(r.driftCharge * 100) / 100,
      boostTimer: Math.round(r.boostTimer * 100) / 100,
      nitroEnergy: Math.round(r.nitroEnergy),
      offRoad: r.offRoad,
      braking: r.braking,
      segIndex: r.segIndex,
      lap: r.lap,
      totalProgress: Math.round(r.totalProgress * 10000) / 10000,
      rank: r.rank,
      finished: r.finished,
      finishTimeMs: Math.round(r.finishTimeMs),
      bestLapMs: r.bestLapMs !== null ? Math.round(r.bestLapMs) : null,
      lastLapMs: r.lastLapMs !== null ? Math.round(r.lastLapMs) : null,
    })),
    events: events.length > 0 ? events : undefined,
  };
}
