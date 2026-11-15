import {
  getBattleRoyaleArenaRadius,
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
  type: 'collision' | 'boost' | 'lap' | 'jump' | 'splash' | 'dash';
  x: number;
  z: number;
  racerId: string;
  attackerId?: string;
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
      yawSpin: 0,
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
      totalProgress:
        track.format === 'battle-royale'
          ? 0
          : track.isLoop
            ? -0.02 * (idx + 1)
            : (spawn.segIndex - track.startSegIndex) /
              Math.max(1, track.finishSegIndex - track.startSegIndex),
      rank: idx + 1,
      finished: false,
      finishTimeMs: 0,
      lapStartTimeMs: 0,
      bestLapMs: null,
      lastLapMs: null,
      eliminated: false,
      knockouts: 0,
      stunTimer: 0,
      lastHitBy: null,
      lastHitTimeMs: 0,
      dashTimer: 0,
      dashCooldown: 0,
    };
  });
}

export function computeBattleRoyaleAIInput(
  racer: RacerState,
  track: TrackData,
  arenaRadius: number,
  allRacers: RacerState[],
): PlayerInput {
  const distFromCenter = Math.hypot(racer.x, racer.z);
  const projX = racer.x + racer.vx * 0.85;
  const projZ = racer.z + racer.vz * 0.85;
  const projDist = Math.hypot(projX, projZ);
  const speedMargin = Math.min(13, Math.abs(racer.speed) * 0.42);
  const dangerRadius = Math.max(7.5, arenaRadius - 6.5 - speedMargin);

  const outwardDot =
    distFromCenter > 0.01
      ? (racer.vx * racer.x + racer.vz * racer.z) / distFromCenter
      : 0;

  // Priority 1: Predictive edge-preservation & emergency recovery inside the shrinking island
  if (
    distFromCenter > dangerRadius ||
    projDist > arenaRadius - 4.5 ||
    (distFromCenter > arenaRadius - 10 && outwardDot > 4.2)
  ) {
    // Slight tangent offset around origin so multiple recovering bots don't head-on collide at (0,0)
    const tangBias = distFromCenter > 10 ? (racer.slotIndex % 2 === 0 ? 3.5 : -3.5) : 0;
    const invD = distFromCenter > 0.01 ? 1 / distFromCenter : 0;
    const safeAimX = -racer.z * invD * tangBias;
    const safeAimZ = racer.x * invD * tangBias;
    const toCenterAngle = Math.atan2(safeAimX - racer.x, safeAimZ - racer.z);
    const diff = normalizeAngle(toCenterAngle - racer.heading);
    const steer = Math.max(-1, Math.min(1, diff * 3.0));
    const facingOutward = Math.abs(diff) > 1.35;

    // Emergency inward dash / nitro when critically close to the cliff and pointed back inside
    const criticalRim = distFromCenter > arenaRadius - 4.6 && outwardDot > 2.5;
    if (criticalRim && Math.abs(diff) < 0.72) {
      return {
        throttle: 1,
        brake: 0,
        steer,
        drift: false,
        boost: racer.nitroEnergy > 20,
        jump: false,
        dash: racer.dashCooldown <= 0,
        seq: 0,
      };
    }

    if (outwardDot > 2.2 && facingOutward) {
      // Brake / reverse away from the drop-off while whipping steering inward
      return {
        throttle: 0,
        brake: 1,
        steer,
        drift: false,
        boost: false,
        jump: false,
        dash: false,
        seq: 0,
      };
    }

    return {
      throttle: Math.abs(diff) > 0.9 ? 0.58 : 0.96,
      brake: outwardDot > 5.5 && Math.abs(diff) > 0.6 ? 0.65 : 0,
      steer,
      drift: Math.abs(diff) > 0.75 && racer.speed > 14 && distFromCenter < arenaRadius - 5,
      boost: Math.abs(diff) < 0.42 && distFromCenter > arenaRadius - 5 && racer.nitroEnergy > 24,
      jump: false,
      dash: false,
      seq: 0,
    };
  }

  // Priority 2: Evade an incoming dashing / high-speed rival aimed directly at us
  for (const other of allRacers) {
    if (other.id === racer.id || other.eliminated) continue;
    const dx = racer.x - other.x;
    const dz = racer.z - other.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 17 || dist < 1) continue;
    const otherSpeed = Math.hypot(other.vx, other.vz);
    if (other.dashTimer <= 0 && otherSpeed < 24) continue;
    const aimDot = (dx * other.vx + dz * other.vz) / (dist * Math.max(1, otherSpeed));
    if (aimDot > 0.78) {
      // Perpendicular dodge vector biased toward center of the arena
      const perp1X = -other.vz / Math.max(1, otherSpeed);
      const perp1Z = other.vx / Math.max(1, otherSpeed);
      const centerDot = perp1X * -racer.x + perp1Z * -racer.z;
      const side = centerDot >= 0 ? 1 : -1;
      const evadeX = racer.x + perp1X * side * 12 - racer.x * 0.25;
      const evadeZ = racer.z + perp1Z * side * 12 - racer.z * 0.25;
      const evadeAngle = Math.atan2(evadeX - racer.x, evadeZ - racer.z);
      const evadeDiff = normalizeAngle(evadeAngle - racer.heading);
      const safeToJump =
        other.dashTimer > 0 &&
        dist < 8.5 &&
        distFromCenter < arenaRadius - 10 &&
        racer.y <= 0.05;
      return {
        throttle: 0.92,
        brake: 0,
        steer: Math.max(-1, Math.min(1, evadeDiff * 3.0)),
        drift: false,
        boost: Math.abs(evadeDiff) < 0.45 && racer.nitroEnergy > 45 && distFromCenter < arenaRadius - 10,
        jump: safeToJump,
        dash:
          racer.dashCooldown <= 0 &&
          Math.abs(evadeDiff) < 0.45 &&
          distFromCenter < arenaRadius - 12,
        seq: 0,
      };
    }
  }

  // Priority 3: Tactical Sumo target selection (prefer edge-exposed / stunned rivals, avoid 5-car pileups)
  const style = racer.slotIndex % 3; // 0: aggressive hunter, 1: center-king, 2: flanker
  let bestTarget: RacerState | null = null;
  let bestScore = Infinity;

  for (const other of allRacers) {
    if (other.id === racer.id || other.eliminated) continue;
    const otherDist = Math.hypot(other.x, other.z);
    if (otherDist > arenaRadius - 2.2) continue; // already falling off

    const distToOther = Math.hypot(other.x - racer.x, other.z - racer.z);
    const edgeRatio = otherDist / Math.max(1, arenaRadius);

    // Count nearby crowding bots so bots spread across fights rather than clumping
    let crowdCount = 0;
    for (const third of allRacers) {
      if (third.id === racer.id || third.id === other.id || third.eliminated) continue;
      if (Math.hypot(third.x - other.x, third.z - other.z) < 7.5) {
        crowdCount += 1;
      }
    }

    let score = distToOther - edgeRatio * (style === 0 ? 16 : 11) + crowdCount * 5.5;
    if (other.stunTimer > 0) score -= 6.5;
    if (style === 1 && distFromCenter > arenaRadius * 0.55 && otherDist < distFromCenter) {
      // Center-king prefers targets near or inside inner ring first
      score -= 4.0;
    }
    if (score < bestScore) {
      bestScore = score;
      bestTarget = other;
    }
  }

  // Default patrol: hold inner ring or grab a nearby central boost pad
  let targetX = (racer.slotIndex % 2 === 0 ? 1 : -1) * 4;
  let targetZ = (racer.slotIndex % 3 === 0 ? 1 : -1) * 4;
  let targetCenterDist = Math.hypot(targetX, targetZ);
  let outwardPushDot = 0;

  if (bestTarget) {
    const predX = bestTarget.x + bestTarget.vx * 0.22;
    const predZ = bestTarget.z + bestTarget.vz * 0.22;
    const predDist = Math.hypot(predX, predZ);
    const radX = predDist > 0.5 ? predX / predDist : 0;
    const radZ = predDist > 0.5 ? predZ / predDist : 1;

    const distToPred = Math.hypot(predX - racer.x, predZ - racer.z);
    // Sumo positioning: approach from the CENTER side of the target so impacts push them OUTWARD
    const onOutsideOfTarget = distFromCenter > predDist + 1.5;
    if (onOutsideOfTarget && distToPred > 7.5 && predDist > 6) {
      targetX = predX - radX * 5.0;
      targetZ = predZ - radZ * 5.0;
    } else {
      targetX = predX + radX * 1.1;
      targetZ = predZ + radZ * 1.1;
    }

    // Opportunistic boost pad detour when low on nitro and not in close combat
    if (racer.nitroEnergy < 48 && distToPred > 16) {
      for (const pad of track.boostPads) {
        const padR = Math.hypot(pad.x, pad.z);
        if (padR > arenaRadius - 6) continue;
        const distPad = Math.hypot(pad.x - racer.x, pad.z - racer.z);
        if (distPad < 14 && distPad < distToPred * 0.8) {
          targetX = pad.x;
          targetZ = pad.z;
          break;
        }
      }
    }

    const tDist = Math.hypot(targetX, targetZ);
    const maxChaseR = Math.max(5, arenaRadius - 7.5);
    if (tDist > maxChaseR) {
      const s = maxChaseR / tDist;
      targetX *= s;
      targetZ *= s;
    }
    targetCenterDist = Math.hypot(targetX, targetZ);

    if (distToPred > 0.5 && predDist > 0.5) {
      outwardPushDot = ((predX - racer.x) * radX + (predZ - racer.z) * radZ) / distToPred;
    }
  }

  const desiredAngle = Math.atan2(targetX - racer.x, targetZ - racer.z);
  const diff = normalizeAngle(desiredAngle - racer.heading);
  const steer = Math.max(-1, Math.min(1, diff * 2.5));
  const distToTarget = bestTarget
    ? Math.hypot(bestTarget.x - racer.x, bestTarget.z - racer.z)
    : 25;

  const shouldDrift = Math.abs(diff) > 0.72 && racer.speed > 15 && distFromCenter < arenaRadius - 8;
  const shouldBoost =
    bestTarget !== null &&
    Math.abs(diff) < 0.25 &&
    distToTarget < 21 &&
    distFromCenter < arenaRadius - 13 &&
    targetCenterDist < arenaRadius - 8 &&
    racer.nitroEnergy > 38 &&
    racer.boostTimer <= 0.1;

  // Deterministic smart Sumo Dash when lined up to knock a rival outward without flying off
  const fwdX = Math.sin(racer.heading);
  const fwdZ = Math.cos(racer.heading);
  const dashEndDist = Math.hypot(racer.x + fwdX * 13, racer.z + fwdZ * 13);
  const safeDashLine =
    dashEndDist < arenaRadius - 5.5 ||
    (distToTarget < 11 && targetCenterDist > arenaRadius - 11 && outwardPushDot > 0.35);

  const shouldDash =
    bestTarget !== null &&
    racer.dashCooldown <= 0 &&
    Math.abs(diff) < 0.32 &&
    distToTarget < 20 &&
    distFromCenter < arenaRadius - 9.5 &&
    safeDashLine &&
    (outwardPushDot > 0.12 || targetCenterDist < arenaRadius - 13);

  return {
    throttle: Math.abs(diff) > 1.0 && racer.speed > 15 ? 0.52 : 0.93,
    brake: Math.abs(diff) > 1.65 && racer.speed > 18 ? 0.55 : 0,
    steer,
    drift: shouldDrift,
    boost: shouldBoost,
    jump: false,
    dash: shouldDash,
    seq: 0,
  };
}

export function computeAIInput(
  racer: RacerState,
  track: TrackData,
  allRacers: RacerState[],
  leaderProgress: number,
): PlayerInput {
  const N = track.segments;
  const speedRatio = Math.max(0, Math.min(1, racer.speed / 60));
  const lookAhead = Math.round(9 + speedRatio * 10);
  const farAhead = Math.round(18 + speedRatio * 14);

  const targetIdx = track.isLoop
    ? (racer.segIndex + lookAhead) % N
    : Math.min(N - 1, racer.segIndex + lookAhead);
  const farIdx = track.isLoop
    ? (racer.segIndex + farAhead) % N
    : Math.min(N - 1, racer.segIndex + farAhead);

  // Measure upcoming corner sharpness & inside apex direction
  const tNow = track.tangents[racer.segIndex];
  const nNow = track.normals[racer.segIndex];
  const tFar = track.tangents[farIdx];
  const cornerDot = tNow.x * tFar.x + tNow.z * tFar.z;
  const sharpTurn = cornerDot < 0.8;
  const turnIntoNormal = (tFar.x - tNow.x) * nNow.x + (tFar.z - tNow.z) * nNow.z;

  // Deterministic base lane + apex-hugging racing line through corners
  const baseLane = ((racer.slotIndex % 3) - 1) * (track.halfWidth * 0.28);
  let targetLane = baseLane;
  if (Math.abs(turnIntoNormal) > 0.14) {
    const apexStrength = Math.min(1, Math.abs(turnIntoNormal) * 1.45);
    const apexLane = Math.sign(turnIntoNormal) * track.halfWidth * 0.56;
    targetLane = baseLane * (1 - apexStrength) + apexLane * apexStrength;
  }

  // Steer smoothly toward nearby boost pad if close ahead and not a sharp hairpin
  for (const pad of track.boostPads) {
    const segDiff = track.isLoop
      ? (pad.segIndex - racer.segIndex + N) % N
      : pad.segIndex - racer.segIndex;
    if (segDiff > 2 && segDiff < 24 && cornerDot > 0.72) {
      targetLane = pad.lateralOffset;
      break;
    }
  }

  // Intelligent overtaking: detect slower cars (including player) up to 26m ahead and pass on the wider road side
  let overtakingAhead = false;
  const fwdX = Math.sin(racer.heading);
  const fwdZ = Math.cos(racer.heading);
  for (const other of allRacers) {
    if (other.id === racer.id) continue;
    const dx = other.x - racer.x;
    const dz = other.z - racer.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < 676) {
      const fwdDot = dx * fwdX + dz * fwdZ;
      if (fwdDot > 0.5 && fwdDot < 26 && other.speed < racer.speed + 9) {
        const rightDot = dx * fwdZ - dz * fwdX;
        if (Math.abs(rightDot) < 3.6) {
          overtakingAhead = true;
          // Pick pass side that stays inside track boundaries
          const passSign =
            rightDot > 0
              ? targetLane - 4.8 > -track.halfWidth * 0.72
                ? -1
                : 1
              : targetLane + 4.8 < track.halfWidth * 0.72
                ? 1
                : -1;
          targetLane += passSign * 4.8;
        }
      }
    }
  }
  targetLane = Math.max(-track.halfWidth * 0.72, Math.min(track.halfWidth * 0.72, targetLane));

  const p = track.points[targetIdx];
  const n = track.normals[targetIdx];
  const tx = p.x + n.x * targetLane;
  const tz = p.z + n.z * targetLane;

  const desiredAngle = Math.atan2(tx - racer.x, tz - racer.z);
  const diff = normalizeAngle(desiredAngle - racer.heading);

  const steer = Math.max(-1, Math.min(1, diff * 2.35));

  // Drift in sharp corners, then release cleanly near corner exit to trigger Drift Turbo!
  const readyToCashDrift =
    racer.driftDir !== 0 &&
    racer.driftCharge >= 0.75 &&
    ((!sharpTurn && Math.abs(diff) < 0.24) || (racer.driftCharge >= 1.55 && Math.abs(diff) < 0.2));
  const shouldDrift =
    !readyToCashDrift &&
    sharpTurn &&
    Math.abs(diff) > 0.24 &&
    racer.speed > 26;

  // Strategic Nitro on straights, when catching up, or while overtaking a slower car
  const behindLeader = leaderProgress - racer.totalProgress;
  const straightEnough = cornerDot > 0.87 && Math.abs(diff) < 0.24;
  const useBoost =
    straightEnough &&
    racer.boostTimer <= 0.1 &&
    (racer.nitroEnergy > 45 ||
      (behindLeader > 0.06 && racer.nitroEnergy > 28) ||
      (overtakingAhead && racer.nitroEnergy > 26));

  // Recovery if spun around or hitting deep corner too hot
  const severeHeadingError = Math.abs(diff) > 1.75;

  return {
    throttle: severeHeadingError ? 0.45 : sharpTurn && racer.speed > 42 ? 0.65 : 1.0,
    brake: severeHeadingError
      ? racer.speed > 18
        ? 0.65
        : 0
      : sharpTurn && racer.speed > 49
        ? 0.42
        : 0,
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
  const isBR = track.format === 'battle-royale';
  const arenaRadius = isBR ? getBattleRoyaleArenaRadius(track, raceElapsedMs) : 0;

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

    // Eliminated cars stay submerged gently bobbing in the water
    if (isBR && r.eliminated) {
      r.vy = 0;
      r.vx *= Math.max(0, 1 - dt * 4.5);
      r.vz *= Math.max(0, 1 - dt * 4.5);
      r.speed *= Math.max(0, 1 - dt * 4.5);
      r.x += r.vx * dt;
      r.z += r.vz * dt;
      r.y = THREE_DAMP(r.y, -2.55, 6, dt);
      r.braking = false;
      r.boostTimer = 0;
      r.driftDir = 0;
      continue;
    }

    if (r.stunTimer > 0) {
      r.stunTimer = Math.max(0, r.stunTimer - dt);
    }
    if (r.dashTimer > 0) {
      r.dashTimer = Math.max(0, r.dashTimer - dt);
    }
    if (r.dashCooldown > 0) {
      r.dashCooldown = Math.max(0, r.dashCooldown - dt);
    }

    const finishedSprint = !isBR && r.finished && !track.isLoop;
    const input: PlayerInput = finishedSprint
      ? {
          throttle: 0,
          brake: r.speed > 1.2 ? 0.85 : 0,
          steer: 0,
          drift: false,
          boost: false,
          jump: false,
          seq: 0,
        }
      : isBR
        ? r.isAI
          ? computeBattleRoyaleAIInput(r, track, arenaRadius, racers)
          : inputs.get(r.id) ?? {
              throttle: 0,
              brake: 0,
              steer: 0,
              drift: false,
              boost: false,
              jump: false,
              seq: 0,
            }
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

    const overPlatform = !isBR || Math.hypot(r.x, r.z) <= arenaRadius;
    const wasGrounded = overPlatform && r.y >= -0.05 && r.y <= 0.02 && r.vy <= 0.1;

    // Jump trigger (KeyE)
    if (input.jump && wasGrounded) {
      r.vy = 18.0;
      r.y = 0.04;
      r.airFlipAccum = 0;
      if (r.driftDir !== 0) {
        if (r.driftCharge >= 0.55) {
          const tier = r.driftCharge >= 2.2 ? 3 : r.driftCharge >= 1.35 ? 2 : 1;
          const duration = isBR
            ? tier === 3
              ? 1.05
              : tier === 2
                ? 0.8
                : 0.55
            : tier === 3
              ? 1.9
              : tier === 2
                ? 1.35
                : 0.9;
          r.boostTimer = Math.max(r.boostTimer, duration);
          const surgeSpeed = isBR ? 28 + tier * 2.5 : 62 + tier * 6;
          r.speed = Math.max(
            r.speed,
            r.isAI ? Math.min(74, surgeSpeed) : surgeSpeed,
          );
          events.push({ type: 'boost', x: r.x, z: r.z, racerId: r.id, intensity: tier });
        }
        r.driftDir = 0;
        r.driftCharge = 0;
      }
      events.push({ type: 'jump', x: r.x, z: r.z, racerId: r.id });
    }

    // Vertical physics: jump/flip on platform, or gravity plunge when off the circular edge
    if (isBR && (!overPlatform || r.y < -0.05)) {
      r.vy -= 33.0 * dt;
      r.y += r.vy * dt;
      r.pitch += 2.1 * dt;
      if (!r.eliminated && r.y <= -1.6) {
        r.eliminated = true;
        r.finished = true;
        r.finishTimeMs = raceElapsedMs;
        r.speed *= 0.22;
        r.vx *= 0.25;
        r.vz *= 0.25;

        let attackerId: string | undefined;
        if (r.lastHitBy && raceElapsedMs - r.lastHitTimeMs <= 7000) {
          const attacker = racers.find((other) => other.id === r.lastHitBy);
          if (attacker && attacker.id !== r.id) {
            attacker.knockouts += 1;
            attackerId = attacker.id;
          }
        }
        events.push({
          type: 'splash',
          x: r.x,
          z: r.z,
          racerId: r.id,
          attackerId,
          intensity: 1,
        });
      }
    } else if (r.y > 0.02 || r.vy > 0) {
      r.vy -= 33.0 * dt;
      r.y += r.vy * dt;
      if (r.y > 0.02) {
        const pitchInput = input.throttle - input.brake;
        const dPitch = pitchInput * 6.0 * dt;
        r.pitch += dPitch;
        r.airFlipAccum += Math.abs(dPitch);

        // Horizontal 360° air spin via E + Left/Right
        if (input.jump && Math.abs(input.steer) > 0.05) {
          const dYaw = input.steer * 6.8 * dt;
          r.yawSpin += dYaw;
          r.airFlipAccum += Math.abs(dYaw);
        }
      } else {
        r.y = 0;
        r.vy = 0;
        if (r.airFlipAccum >= Math.PI * 1.45) {
          r.boostTimer = Math.max(r.boostTimer, isBR ? 0.85 : 1.45);
          r.speed = Math.max(
            r.speed,
            isBR ? (r.isAI ? 30 : 33) : r.isAI ? 72 : 74,
          );
          r.nitroEnergy = Math.min(100, r.nitroEnergy + 24);
          events.push({ type: 'boost', x: r.x, z: r.z, racerId: r.id, intensity: 2 });
        }
        r.airFlipAccum = 0;
        r.pitch = normalizeAngle(r.pitch);
        r.yawSpin = normalizeAngle(r.yawSpin);
      }
    } else {
      r.y = 0;
      r.vy = 0;
      r.pitch += (0 - r.pitch) * Math.min(1, dt * 18);
      r.yawSpin += (0 - r.yawSpin) * Math.min(1, dt * 18);
    }

    const grounded = overPlatform && r.y >= -0.05 && r.y <= 0.05;

    // AI bots cruise near player base speed (94%-100%) so they overtake cleanly if player slows down
    const AI_MAX_SPEED = isBR ? 34 : 74;
    let aiFactor = 1.0;
    if (r.isAI) {
      if (isBR) {
        aiFactor = 0.88 + (r.slotIndex % 3) * 0.03;
      } else {
        const baseTier = 0.94 + (r.slotIndex % 3) * 0.03;
        const gapToHuman = humanProgress - r.totalProgress;
        const rubberBand =
          gapToHuman > 0.08
            ? Math.min(0.05, (gapToHuman - 0.08) * 0.18)
            : gapToHuman < -0.25
              ? Math.max(-0.03, (gapToHuman + 0.25) * 0.08)
              : 0;
        aiFactor = Math.min(1.03, Math.max(0.92, baseTier + rubberBand));
      }
    }

    const maxBaseSpeed = (isBR ? 26 : 58) * aiFactor;
    const boostSpeedBonus =
      r.dashTimer > 0
        ? isBR
          ? r.isAI
            ? 12
            : 18
          : 24
        : r.boostTimer > 0
          ? isBR
            ? r.isAI
              ? 7
              : 10
            : r.isAI
              ? 16
              : 24
          : 0;
    const offRoadCap = !isBR && grounded && r.offRoad ? 0.62 : 1.0;
    const rawTopSpeed = (maxBaseSpeed + boostSpeedBonus) * offRoadCap;
    const topSpeed = r.isAI
      ? Math.min((r.dashTimer > 0 && isBR ? 38 : AI_MAX_SPEED) * offRoadCap, rawTopSpeed)
      : rawTopSpeed;

    // Battle Royale Left-Click Sumo Dash / Charge toward targeted rival
    if (isBR && input.dash && grounded && r.dashCooldown <= 0) {
      let lockTarget: RacerState | null = null;
      let bestLockScore = Infinity;
      const fwdX = Math.sin(r.heading);
      const fwdZ = Math.cos(r.heading);

      for (const other of racers) {
        if (other.id === r.id || other.eliminated) continue;
        const dx = other.x - r.x;
        const dz = other.z - r.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 40 || dist < 0.5) continue;
        const dot = (dx / dist) * fwdX + (dz / dist) * fwdZ;
        // Prefer targets roughly in front (dot > 0.25) or very close in a melee (< 16m)
        if (dot > 0.25 || dist < 16) {
          const score = dist - dot * 12;
          if (score < bestLockScore) {
            bestLockScore = score;
            lockTarget = other;
          }
        }
      }

      if (lockTarget) {
        const tx = lockTarget.x + lockTarget.vx * 0.12;
        const tz = lockTarget.z + lockTarget.vz * 0.12;
        r.heading = Math.atan2(tx - r.x, tz - r.z);
      }

      r.dashTimer = 0.42;
      r.dashCooldown = 2.0;
      r.boostTimer = Math.max(r.boostTimer, 0.42);
      const chargeSpeed = r.isAI ? 38 : 44;
      r.speed = Math.max(r.speed, chargeSpeed);
      r.vx = Math.sin(r.heading) * r.speed;
      r.vz = Math.cos(r.heading) * r.speed;
      events.push({ type: 'dash', x: r.x, z: r.z, racerId: r.id, intensity: 1 });
    }

    // Boost timer & manual Nitro
    if (r.boostTimer > 0) {
      r.boostTimer = Math.max(0, r.boostTimer - dt);
    }
    if (input.boost && r.nitroEnergy > 18 && r.boostTimer <= 0.15) {
      r.boostTimer = isBR ? 0.65 : r.isAI ? 0.78 : 0.85;
      r.speed = Math.max(
        r.speed,
        isBR
          ? r.isAI
            ? 30
            : 33
          : r.isAI
            ? Math.min(AI_MAX_SPEED, 68)
            : 66,
      );
      r.nitroEnergy = Math.max(0, r.nitroEnergy - 32);
      events.push({ type: 'boost', x: r.x, z: r.z, racerId: r.id, intensity: 1 });
    } else {
      r.nitroEnergy = Math.min(100, r.nitroEnergy + dt * (r.isAI ? 4.8 : 5.2));
    }

    // Acceleration & braking (grounded only; airborne throttle/brake controls vertical pitch)
    const baseAccel = isBR
      ? r.dashTimer > 0
        ? 85
        : r.boostTimer > 0
          ? 44
          : 24
      : r.boostTimer > 0
        ? 94
        : 46;
    const accel = baseAccel * (r.isAI ? aiFactor : 1) * (!isBR && r.offRoad ? 0.65 : 1);
    if (grounded) {
      if (input.throttle > 0) {
        r.speed += accel * input.throttle * dt;
      }
      if (input.brake > 0) {
        if (r.speed > 2) {
          r.speed -= (isBR ? 72 : 62) * input.brake * dt;
          r.braking = true;
        } else {
          r.speed = Math.max(isBR ? -20 : -18, r.speed - (isBR ? 34 : 28) * input.brake * dt);
          r.braking = false;
        }
      } else {
        r.braking = false;
      }

      // Natural drag
      if (input.throttle <= 0 && input.brake <= 0) {
        r.speed -= r.speed * (isBR ? 1.85 : 1.35) * dt;
      }
    } else {
      r.braking = false;
      r.speed -= r.speed * 0.12 * dt;
    }

    if (finishedSprint) {
      r.speed = Math.max(0, r.speed);
      if (r.speed < 0.8 && grounded) {
        r.speed = 0;
        r.vx *= Math.max(0, 1 - dt * 10);
        r.vz *= Math.max(0, 1 - dt * 10);
        r.braking = false;
      }
    }

    if (r.speed > topSpeed) {
      r.speed += (topSpeed - r.speed) * Math.min(1, dt * (grounded ? 4.5 : 0.8));
    }
    const aiTopCap = isBR && r.dashTimer > 0 ? 38 : AI_MAX_SPEED;
    if (r.isAI && r.speed > aiTopCap) {
      r.speed = aiTopCap;
    }

    // Drift (Shift / Space) & steering
    const absSpeed = Math.abs(r.speed);
    const speedSteerFactor =
      Math.min(1, absSpeed / (isBR ? 7 : 12)) * (r.speed >= 0 ? 1 : -1);

    if (
      grounded &&
      input.drift &&
      r.speed > (isBR ? 8 : 10) &&
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
          const duration = isBR
            ? tier === 3
              ? 1.05
              : tier === 2
                ? 0.8
                : 0.55
            : tier === 3
              ? 1.9
              : tier === 2
                ? 1.35
                : 0.9;
          r.boostTimer = Math.max(r.boostTimer, duration);
          const surgeSpeed = isBR ? 28 + tier * 2.5 : 62 + tier * 6;
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
      const turnRate = (grounded ? (isBR ? 2.75 : 2.35) : input.jump ? 0.15 : 1.15) * speedSteerFactor;
      r.heading = normalizeAngle(r.heading + input.steer * turnRate * dt);
      r.visualYawOffset += (0 - r.visualYawOffset) * Math.min(1, dt * 12);
    }

    // Visual front wheel steer
    const targetWheelAngle = input.steer * 0.42;
    r.steerAngle += (targetWheelAngle - r.steerAngle) * Math.min(1, dt * 14);

    // Move car in XZ plane (+Z forward when heading = 0)
    const dirX = Math.sin(r.heading);
    const dirZ = Math.cos(r.heading);

    // Lateral velocity blending (stunTimer temporarily lowers grip so Sumo knockbacks carry momentum!)
    const targetVx = dirX * r.speed;
    const targetVz = dirZ * r.speed;
    const grip = !grounded
      ? 1.2
      : r.stunTimer > 0
        ? 2.8
        : r.driftDir !== 0
          ? 5.2
          : isBR
            ? 12.5
            : 11.5;
    r.vx += (targetVx - r.vx) * Math.min(1, dt * grip);
    r.vz += (targetVz - r.vz) * Math.min(1, dt * grip);

    r.x += r.vx * dt;
    r.z += r.vz * dt;

    if (isBR) {
      // Open Sumo platform: no perimeter walls, no off-road penalty, no lap logic
      r.offRoad = false;
    } else {
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

      // Checkpoint & Lap / Sprint Stage Progression
      if (!r.finished) {
        if (track.isLoop) {
          if (proj.progress >= 0.2 && proj.progress < 0.55 && r.maxCheckpoint === 0) {
            r.maxCheckpoint = 1;
          } else if (proj.progress >= 0.45 && proj.progress < 0.8 && r.maxCheckpoint === 1) {
            r.maxCheckpoint = 2;
          } else if (proj.progress >= 0.72 && r.maxCheckpoint >= 2) {
            r.maxCheckpoint = 3;
          }

          const prevProg = r.totalProgress - (r.lap - 1);
          // Crossed start/finish line forward using continuous progress
          if (prevProg > 0.75 && proj.progress < 0.25 && r.maxCheckpoint >= 2) {
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

          if (!r.finished) {
            const effectiveProg =
              r.maxCheckpoint === 0 && proj.progress > 0.8
                ? proj.progress - 1
                : proj.progress;
            r.totalProgress = r.lap - 1 + effectiveProg;
          } else {
            r.totalProgress = totalLaps + 1 + 1 / Math.max(1, r.finishTimeMs);
          }
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

    // Boost pads check (only when close to platform surface)
    if (r.y > -0.2 && r.y < 1.2) {
      for (const pad of track.boostPads) {
        const dx = r.x - pad.x;
        const dz = r.z - pad.z;
        if (dx * dx + dz * dz < 14.5) {
          if (r.boostTimer < 0.6) {
            events.push({ type: 'boost', x: r.x, z: r.z, racerId: r.id });
          }
          r.boostTimer = Math.max(r.boostTimer, isBR ? 0.7 : 1.3);
          r.nitroEnergy = Math.min(100, r.nitroEnergy + 20);
        }
      }
    }
  }

  // Car-to-car elastic collisions (+ Sumo knockback & stun in Battle Royale)
  const minSep = 2.65;
  const minSepSq = minSep * minSep;
  for (let i = 0; i < racers.length; i++) {
    for (let j = i + 1; j < racers.length; j++) {
      const a = racers[i];
      const b = racers[j];
      if (a.eliminated || b.eliminated) continue;
      if (Math.abs(a.y - b.y) > 2.2) continue;

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
          const restitution = isBR ? 1.25 : 0.85;
          const jImpulse = -restitution * velAlongNormal;
          a.vx -= nx * jImpulse;
          a.vz -= nz * jImpulse;
          b.vx += nx * jImpulse;
          b.vz += nz * jImpulse;

          if (isBR) {
            // Directional Sumo ramming knockback + stun (extra massive push on Left-Click Charge!)
            const aDashing = a.dashTimer > 0;
            const bDashing = b.dashTimer > 0;
            const aSpeed = Math.hypot(a.vx, a.vz);
            const bSpeed = Math.hypot(b.vx, b.vz);
            const aPush = aDashing ? 23 : a.boostTimer > 0 ? 13 : 6.5;
            const bPush = bDashing ? 23 : b.boostTimer > 0 ? 13 : 6.5;

            if (aDashing || aSpeed > bSpeed * 0.85) {
              b.vx += nx * aPush;
              b.vz += nz * aPush;
              b.stunTimer = aDashing ? 0.72 : 0.42;
              b.speed *= aDashing ? 0.45 : 0.72;
            }
            if (bDashing || bSpeed > aSpeed * 0.85) {
              a.vx -= nx * bPush;
              a.vz -= nz * bPush;
              a.stunTimer = bDashing ? 0.72 : 0.42;
              a.speed *= bDashing ? 0.45 : 0.72;
            }

            // Stabilize dashing attacker on impact so they don't fly off the edge right behind victim
            if (aDashing && !bDashing) {
              a.vx *= 0.45;
              a.vz *= 0.45;
              a.speed *= 0.45;
              a.dashTimer = 0;
            }
            if (bDashing && !aDashing) {
              b.vx *= 0.45;
              b.vz *= 0.45;
              b.speed *= 0.45;
              b.dashTimer = 0;
            }

            a.lastHitBy = b.id;
            a.lastHitTimeMs = raceElapsedMs;
            b.lastHitBy = a.id;
            b.lastHitTimeMs = raceElapsedMs;
          } else {
            a.speed *= 0.92;
            b.speed *= 0.92;
          }

          if (Math.abs(velAlongNormal) > 4.5) {
            events.push({
              type: 'collision',
              x: (a.x + b.x) * 0.5,
              z: (a.z + b.z) * 0.5,
              racerId: a.id,
              intensity: Math.min(1.5, Math.abs(velAlongNormal) / 16),
            });
          }
        }
      }
    }
  }

  // Battle Royale victory condition (last car standing on the arena)
  if (isBR) {
    const alive = racers.filter((r) => !r.eliminated);
    if (alive.length <= 1 && racers.length > 1) {
      for (const r of alive) {
        if (!r.finished) {
          r.finished = true;
          r.finishTimeMs = raceElapsedMs + 1000;
        }
      }
    }
  }

  // Update live ranks
  const sorted = [...racers].sort((a, b) => {
    if (isBR) {
      if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
      if (!a.eliminated && !b.eliminated) {
        if (b.knockouts !== a.knockouts) return b.knockouts - a.knockouts;
        return Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z);
      }
      return b.finishTimeMs - a.finishTimeMs;
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

function THREE_DAMP(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
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
      yawSpin: Math.round(r.yawSpin * 1000) / 1000,
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
      eliminated: r.eliminated,
      knockouts: r.knockouts,
      dashTimer: Math.round(r.dashTimer * 100) / 100,
    })),
    events: events.length > 0 ? events : undefined,
  };
}
