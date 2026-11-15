import * as THREE from 'three';
import {
  createOceanMaterial,
  createSkyDomeMaterial,
  extendRoadAsphaltMaterial,
  type AnimatedShaderHandle,
} from './shaders';
import {
  createArenaTexture,
  createAsphaltTexture,
  createBoostPadTexture,
  createCheckeredTexture,
  createCurbTexture,
  createGroundTexture,
} from './textures';
import type { TrackData } from './tracks';

export interface BuiltWorld {
  group: THREE.Group;
  countdownLights: THREE.MeshStandardMaterial[];
  update: (timeSec: number, cameraPos: THREE.Vector3, arenaRadius?: number) => void;
  dispose: () => void;
}

function buildTrackRibbon(
  track: TrackData,
  innerOffset: number,
  outerOffset: number,
  yHeight: number,
  uvTileLength: number,
): THREE.BufferGeometry {
  const N = track.segments;
  const vertRows = track.isLoop ? N + 1 : N;
  const positions = new Float32Array(vertRows * 2 * 3);
  const normals = new Float32Array(vertRows * 2 * 3);
  const uvs = new Float32Array(vertRows * 2 * 2);
  const indices: number[] = [];

  for (let i = 0; i < vertRows; i++) {
    const idx = i % N;
    const p = track.points[idx];
    const n = track.normals[idx];

    const vIdx = i * 2;
    positions[vIdx * 3] = p.x + n.x * innerOffset;
    positions[vIdx * 3 + 1] = yHeight;
    positions[vIdx * 3 + 2] = p.z + n.z * innerOffset;

    positions[(vIdx + 1) * 3] = p.x + n.x * outerOffset;
    positions[(vIdx + 1) * 3 + 1] = yHeight;
    positions[(vIdx + 1) * 3 + 2] = p.z + n.z * outerOffset;

    normals[vIdx * 3] = 0;
    normals[vIdx * 3 + 1] = 1;
    normals[vIdx * 3 + 2] = 0;
    normals[(vIdx + 1) * 3] = 0;
    normals[(vIdx + 1) * 3 + 1] = 1;
    normals[(vIdx + 1) * 3 + 2] = 0;

    const len = track.isLoop && i === N ? track.totalLength : track.cumLengths[idx];
    const vCoord = len / uvTileLength;
    uvs[vIdx * 2] = 0;
    uvs[vIdx * 2 + 1] = vCoord;
    uvs[(vIdx + 1) * 2] = 1;
    uvs[(vIdx + 1) * 2 + 1] = vCoord;

    if (i < vertRows - 1) {
      const a = i * 2;
      const b = i * 2 + 1;
      const c = (i + 1) * 2;
      const d = (i + 1) * 2 + 1;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}

function isNearTrack(track: TrackData, x: number, z: number, minDist: number): boolean {
  const minD2 = minDist * minDist;
  for (let i = 0; i < track.segments; i += 4) {
    const p = track.points[i];
    const dx = x - p.x;
    const dz = z - p.z;
    if (dx * dx + dz * dz < minD2) return true;
  }
  return false;
}

export function buildTrackWorld(
  track: TrackData,
  maxAniso: number,
): BuiltWorld {
  const group = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];
  const keep = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  const trackId = track.meta.id;
  const centerX = (track.bounds.minX + track.bounds.maxX) * 0.5;
  const centerZ = (track.bounds.minZ + track.bounds.maxZ) * 0.5;
  const spanX = track.bounds.maxX - track.bounds.minX;
  const spanZ = track.bounds.maxZ - track.bounds.minZ;
  const worldSize = Math.max(2200, Math.ceil(Math.max(spanX, spanZ) + 1200));

  const shaderUpdaters: AnimatedShaderHandle[] = [];

  // 0. Atmospheric Sky Dome Shader (follows camera in update loop)
  const skyGeo = keep(new THREE.SphereGeometry(560, 28, 18));
  const skyMat = keep(createSkyDomeMaterial(trackId));
  const skyDome = new THREE.Mesh(skyGeo, skyMat);
  skyDome.frustumCulled = false;
  skyDome.renderOrder = -10;
  group.add(skyDome);
  shaderUpdaters.push({
    update: (t) => {
      skyMat.uniforms.uTime.value = t;
    },
  });

  const isBattleRoyale = track.format === 'battle-royale';
  const countdownLights: THREE.MeshStandardMaterial[] = [];
  let arenaGroup: THREE.Group | null = null;
  let arenaHazardMat: THREE.MeshBasicMaterial | null = null;
  let brOceanMat: THREE.ShaderMaterial | null = null;

  const asphaltTex = keep(createAsphaltTexture(trackId, maxAniso));

  if (isBattleRoyale) {
    const initialR = track.arenaInitialRadius || 54;
    const arenaTex = keep(createArenaTexture(trackId, maxAniso));

    arenaGroup = new THREE.Group();
    arenaGroup.scale.set(initialR, 1, initialR);

    // Top circular Sumo asphalt deck (unit radius scaled by arenaRadius)
    const deckGeo = keep(new THREE.CircleGeometry(1, 64));
    const deckMat = keep(
      new THREE.MeshStandardMaterial({
        map: arenaTex,
        roughness: 0.8,
        metalness: 0.1,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    );
    extendRoadAsphaltMaterial(deckMat, trackId);
    const deckMesh = new THREE.Mesh(deckGeo, deckMat);
    deckMesh.rotation.x = -Math.PI / 2;
    deckMesh.position.y = 0.04;
    deckMesh.receiveShadow = true;
    arenaGroup.add(deckMesh);

    // Solid elevated concrete/stone island base descending below water surface
    const cliffGeo = keep(new THREE.CylinderGeometry(1, 1.08, 3.2, 64));
    const cliffMat = keep(
      new THREE.MeshStandardMaterial({
        color:
          trackId === 'nuit-neon'
            ? 0x1e223d
            : trackId === 'canyon-turbo'
              ? 0x8b4c32
              : 0x64748b,
        roughness: 0.88,
        metalness: 0.12,
      }),
    );
    const cliffMesh = new THREE.Mesh(cliffGeo, cliffMat);
    cliffMesh.position.y = -1.58;
    cliffMesh.receiveShadow = true;
    arenaGroup.add(cliffMesh);

    // Crisp outer hazard ring right at the drop-off edge
    const ringGeo = keep(new THREE.RingGeometry(0.935, 1.0, 64));
    arenaHazardMat = keep(
      new THREE.MeshBasicMaterial({
        color: trackId === 'nuit-neon' ? 0xff2a85 : 0xffbe0b,
        side: THREE.DoubleSide,
      }),
    );
    const ringMesh = new THREE.Mesh(ringGeo, arenaHazardMat);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.y = 0.055;
    arenaGroup.add(ringMesh);

    group.add(arenaGroup);

    // Open sunlit ocean surrounding the elevated circular island (y = -1.6)
    const oceanGeo = keep(
      new THREE.PlaneGeometry(worldSize + 400, worldSize + 400, 64, 64),
    );
    brOceanMat = keep(
      createOceanMaterial(
        track.meta.fogColor,
        trackId === 'nuit-neon' ? 0.0042 : 0.003,
        initialR,
        0,
        0,
        trackId,
      ),
    );
    shaderUpdaters.push({
      update: (t) => {
        brOceanMat!.uniforms.uTime.value = t;
      },
    });
    const ocean = new THREE.Mesh(oceanGeo, brOceanMat);
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.set(0, -1.6, 0);
    group.add(ocean);

    // 4 Corner floating buoy pylons outside the arena (north pylon holds 3 countdown lights)
    const buoyPillarGeo = keep(new THREE.BoxGeometry(1.6, 8.0, 1.6));
    const buoyBaseGeo = keep(new THREE.BoxGeometry(3.8, 1.2, 3.8));
    const buoyMat = keep(
      new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.5,
        metalness: 0.55,
      }),
    );
    const buoyTrimMat = keep(
      new THREE.MeshStandardMaterial({
        color: trackId === 'nuit-neon' ? 0x00f5ff : 0xffbe0b,
        emissive: trackId === 'nuit-neon' ? 0x00f5ff : 0xff9f1c,
        emissiveIntensity: 0.45,
        roughness: 0.35,
      }),
    );

    const podGeo = keep(new THREE.BoxGeometry(1.3, 1.3, 0.4));
    for (let k = 0; k < 4; k++) {
      const ang = (k / 4) * Math.PI * 2;
      const bx = Math.sin(ang) * 68;
      const bz = Math.cos(ang) * 68;
      const buoy = new THREE.Group();
      buoy.position.set(bx, -1.5, bz);
      buoy.rotation.y = Math.atan2(-bx, -bz);

      const base = new THREE.Mesh(buoyBaseGeo, buoyTrimMat);
      base.position.y = 0.4;
      const pillar = new THREE.Mesh(buoyPillarGeo, buoyMat);
      pillar.position.y = 4.2;
      buoy.add(base, pillar);

      if (k === 2) {
        // Facing players from -Z
        for (let i = 0; i < 3; i++) {
          const lMat = keep(
            new THREE.MeshStandardMaterial({
              color: 0x334155,
              emissive: 0x000000,
              emissiveIntensity: 1.8,
              roughness: 0.25,
            }),
          );
          countdownLights.push(lMat);
          const pod = new THREE.Mesh(podGeo, lMat);
          pod.position.set((i - 1) * 1.8, 7.6, 0.9);
          buoy.add(pod);
        }
      }
      group.add(buoy);
    }
  } else {
    // 1. Extended Ground Terrain centered on generated map (Sprint / Circuit only)
    const groundTex = keep(createGroundTexture(trackId, maxAniso));
    const texRepeat = Math.round((worldSize / 1400) * 65);
    groundTex.repeat.set(texRepeat, texRepeat);
    const groundGeo = keep(new THREE.PlaneGeometry(worldSize, worldSize));
    const groundMat = keep(
      new THREE.MeshStandardMaterial({
        map: groundTex,
        roughness: 0.92,
        metalness: 0.05,
      }),
    );
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(centerX, 0, centerZ);
    ground.receiveShadow = true;
    group.add(ground);

    // Coastal sunlit ocean shader for Baie Pixel
    if (trackId === 'baie-pixel') {
      const islandRadius = Math.max(spanX, spanZ) * 0.55 + 45;
      const oceanGeo = keep(new THREE.PlaneGeometry(worldSize + 400, worldSize + 400, 56, 56));
      const oceanMat = keep(
        createOceanMaterial(
          track.meta.fogColor,
          0.003,
          islandRadius,
          centerX,
          centerZ,
          trackId,
        ),
      );
      shaderUpdaters.push({
        update: (t) => {
          oceanMat.uniforms.uTime.value = t;
        },
      });
      const ocean = new THREE.Mesh(oceanGeo, oceanMat);
      ocean.rotation.x = -Math.PI / 2;
      ocean.position.set(centerX, -0.35, centerZ);
      group.add(ocean);

      // Cut island feel with sand perimeter rim surrounding the course bounds
      const sandGeo = keep(new THREE.RingGeometry(islandRadius, islandRadius + 46, 36));
      const sandMat = keep(
        new THREE.MeshStandardMaterial({
          color: 0xf4d58d,
          roughness: 0.9,
        }),
      );
      const sand = new THREE.Mesh(sandGeo, sandMat);
      sand.rotation.x = -Math.PI / 2;
      sand.position.set(centerX, 0.01, centerZ);
      group.add(sand);
    }

    // 2. Main Asphalt Road Ribbon (y = 0.04 to prevent Z-fighting)
    const roadGeo = keep(
      buildTrackRibbon(track, -track.halfWidth, track.halfWidth, 0.04, 14),
    );
    const roadMat = keep(
      new THREE.MeshStandardMaterial({
        map: asphaltTex,
        roughness: 0.82,
        metalness: 0.1,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    );
    extendRoadAsphaltMaterial(roadMat, trackId);
    const roadMesh = new THREE.Mesh(roadGeo, roadMat);
    roadMesh.receiveShadow = true;
    group.add(roadMesh);

    // 3. Left & Right Pixel Rumble Curbs
    const curbTex = keep(createCurbTexture(trackId, maxAniso));
    const curbMat = keep(
      new THREE.MeshStandardMaterial({
        map: curbTex,
        roughness: 0.78,
        metalness: 0.08,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );
    const leftCurbGeo = keep(
      buildTrackRibbon(
        track,
        -track.halfWidth - track.curbWidth,
        -track.halfWidth,
        0.055,
        6,
      ),
    );
    const rightCurbGeo = keep(
      buildTrackRibbon(
        track,
        track.halfWidth,
        track.halfWidth + track.curbWidth,
        0.055,
        6,
      ),
    );
    const leftCurb = new THREE.Mesh(leftCurbGeo, curbMat);
    const rightCurb = new THREE.Mesh(rightCurbGeo, curbMat);
    leftCurb.receiveShadow = true;
    rightCurb.receiveShadow = true;
    group.add(leftCurb, rightCurb);
  }

  const dummy = new THREE.Object3D();

  if (!isBattleRoyale) {
    // 4. Perimeter Safety Barrier Posts (InstancedMesh)
    const barrierStep = 5;
    const barrierCount = Math.floor(track.segments / barrierStep) * 2;
    const barrierGeo = keep(new THREE.BoxGeometry(0.9, 1.1, 3.2));
    const barrierMat = keep(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.55,
        metalness: 0.15,
        emissive: trackId === 'nuit-neon' ? new THREE.Color(0x140a29) : new THREE.Color(0x000000),
      }),
    );
    const barriers = new THREE.InstancedMesh(barrierGeo, barrierMat, barrierCount);
    barriers.castShadow = true;
    barriers.receiveShadow = true;

    const colA = new THREE.Color(
      trackId === 'nuit-neon' ? 0xff2a85 : trackId === 'canyon-turbo' ? 0xffbe0b : 0xef233c,
    );
    const colB = new THREE.Color(
      trackId === 'nuit-neon' ? 0x00f5ff : 0xf8fafc,
    );

    let bIdx = 0;
    for (let i = 0; i < track.segments; i += barrierStep) {
      const p = track.points[i];
      const n = track.normals[i];
      const t = track.tangents[i];
      const yaw = Math.atan2(t.x, t.z);
      const col = Math.floor(i / barrierStep) % 2 === 0 ? colA : colB;

      for (const side of [-1, 1]) {
        if (bIdx >= barrierCount) break;
        dummy.position.set(
          p.x + n.x * side * track.wallMargin,
          0.55,
          p.z + n.z * side * track.wallMargin,
        );
        dummy.rotation.set(0, yaw, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        barriers.setMatrixAt(bIdx, dummy.matrix);
        barriers.setColorAt(bIdx, col);
        bIdx++;
      }
    }
    barriers.instanceMatrix.needsUpdate = true;
    if (barriers.instanceColor) barriers.instanceColor.needsUpdate = true;
    barriers.computeBoundingSphere();
    group.add(barriers);

    // End-cap transversal barriers for Sprint tracks
    if (!track.isLoop) {
      const capGeo = keep(new THREE.BoxGeometry(track.wallMargin * 2.1, 1.35, 1.2));
      const capMat = keep(
        new THREE.MeshStandardMaterial({
          color: trackId === 'nuit-neon' ? 0xff2a85 : 0xef233c,
          roughness: 0.5,
        }),
      );
      for (const endIdx of [0, track.segments - 1]) {
        const ep = track.points[endIdx];
        const et = track.tangents[endIdx];
        const cap = new THREE.Mesh(capGeo, capMat);
        cap.position.set(ep.x, 0.68, ep.z);
        cap.rotation.y = Math.atan2(et.x, et.z);
        cap.castShadow = true;
        group.add(cap);
      }
    }

    // 5. Start Checkered Line & Gantry Arch (+ separate Finish Gantry on Sprint)
    const startP = track.points[track.startSegIndex];
    const startT = track.tangents[track.startSegIndex];
    const startYaw = Math.atan2(startT.x, startT.z);

    const startGroup = new THREE.Group();
    startGroup.position.set(startP.x, 0, startP.z);
    startGroup.rotation.y = startYaw;

    const checkTex = keep(createCheckeredTexture(maxAniso));
    const checkGeo = keep(new THREE.PlaneGeometry(track.meta.roadWidth, 4.2));
    const checkMat = keep(
      new THREE.MeshStandardMaterial({
        map: checkTex,
        roughness: 0.75,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3,
      }),
    );
    const checkStrip = new THREE.Mesh(checkGeo, checkMat);
    checkStrip.rotation.x = -Math.PI / 2;
    checkStrip.position.y = 0.065;
    startGroup.add(checkStrip);

    const pillarMat = keep(
      new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.5,
        metalness: 0.6,
      }),
    );
    const bannerMat = keep(
      new THREE.MeshStandardMaterial({
        color: trackId === 'nuit-neon' ? 0x1e1b4b : 0x0f172a,
        roughness: 0.4,
        metalness: 0.35,
      }),
    );
    const span = track.halfWidth + 2.4;
    const pillarGeo = keep(new THREE.BoxGeometry(1.4, 7.6, 1.4));
    const pillarL = new THREE.Mesh(pillarGeo, pillarMat);
    pillarL.position.set(-span, 3.8, 0);
    pillarL.castShadow = true;
    const pillarR = new THREE.Mesh(pillarGeo, pillarMat);
    pillarR.position.set(span, 3.8, 0);
    pillarR.castShadow = true;

    const crossBeam = new THREE.Mesh(
      keep(new THREE.BoxGeometry(span * 2 + 1.8, 2.0, 1.6)),
      bannerMat,
    );
    crossBeam.position.set(0, 7.4, 0);
    crossBeam.castShadow = true;

    // Checkered trim strip on gantry
    const gantryCheck = new THREE.Mesh(
      keep(new THREE.BoxGeometry(span * 1.9, 0.55, 1.66)),
      checkMat,
    );
    gantryCheck.position.set(0, 7.9, 0);
    startGroup.add(pillarL, pillarR, crossBeam, gantryCheck);

    // 3 Countdown light pods on gantry
    const podGeo = keep(new THREE.BoxGeometry(1.1, 1.1, 0.3));
    for (let i = 0; i < 3; i++) {
      const lMat = keep(
        new THREE.MeshStandardMaterial({
          color: 0x334155,
          emissive: 0x000000,
          emissiveIntensity: 1.8,
          roughness: 0.25,
        }),
      );
      countdownLights.push(lMat);
      const pod = new THREE.Mesh(podGeo, lMat);
      pod.position.set((i - 1) * 2.2, 6.85, 0.85);
      startGroup.add(pod);
    }
    group.add(startGroup);

    // Separate checkered Finish Gantry at the end of Sprint stages
    if (!track.isLoop) {
      const finP = track.points[track.finishSegIndex];
      const finT = track.tangents[track.finishSegIndex];
      const finYaw = Math.atan2(finT.x, finT.z);

      const finGroup = new THREE.Group();
      finGroup.position.set(finP.x, 0, finP.z);
      finGroup.rotation.y = finYaw;

      const finStrip = new THREE.Mesh(checkGeo, checkMat);
      finStrip.rotation.x = -Math.PI / 2;
      finStrip.position.y = 0.065;
      finGroup.add(finStrip);

      const finPillarL = new THREE.Mesh(pillarGeo, pillarMat);
      finPillarL.position.set(-span, 3.8, 0);
      finPillarL.castShadow = true;
      const finPillarR = new THREE.Mesh(pillarGeo, pillarMat);
      finPillarR.position.set(span, 3.8, 0);
      finPillarR.castShadow = true;

      const finBeamMat = keep(
        new THREE.MeshStandardMaterial({
          color: 0xffbe0b,
          emissive: 0xff9f1c,
          emissiveIntensity: 0.35,
          roughness: 0.35,
        }),
      );
      const finBeam = new THREE.Mesh(
        keep(new THREE.BoxGeometry(span * 2 + 1.8, 1.8, 1.6)),
        finBeamMat,
      );
      finBeam.position.set(0, 7.4, 0);
      finBeam.castShadow = true;

      const finCheck = new THREE.Mesh(
        keep(new THREE.BoxGeometry(span * 1.9, 0.8, 1.7)),
        checkMat,
      );
      finCheck.position.set(0, 7.4, 0);

      finGroup.add(finPillarL, finPillarR, finBeam, finCheck);
      group.add(finGroup);
    }
  }

  // 6. Track Boost Pads
  const boostTex = keep(createBoostPadTexture(maxAniso));
  const boostMat = keep(
    new THREE.MeshStandardMaterial({
      map: boostTex,
      emissive: 0x00c8ff,
      emissiveMap: boostTex,
      emissiveIntensity: 0.85,
      roughness: 0.3,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    }),
  );
  const boostGeo = keep(new THREE.PlaneGeometry(3.8, 6.8));
  for (const pad of track.boostPads) {
    const mesh = new THREE.Mesh(boostGeo, boostMat);
    mesh.position.set(pad.x, 0.06, pad.z);
    mesh.rotation.order = 'YXZ';
    mesh.rotation.y = pad.heading;
    mesh.rotation.x = -Math.PI / 2;
    group.add(mesh);
  }

  // 7. Thematic Voxel Scenery distributed across generated map bounds
  const rng = (seed: number) => {
    const x = Math.sin((seed + track.seed * 0.13) * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  const scMinX = isBattleRoyale ? -240 : track.bounds.minX - 60;
  const scSpanX = isBattleRoyale ? 480 : track.bounds.maxX - track.bounds.minX + 120;
  const scMinZ = isBattleRoyale ? -240 : track.bounds.minZ - 60;
  const scSpanZ = isBattleRoyale ? 480 : track.bounds.maxZ - track.bounds.minZ + 120;

  if (trackId === 'baie-pixel' && !isBattleRoyale) {
    const propPositions: Array<{ x: number; z: number; s: number; rot: number }> = [];
    for (let i = 0; i < 1100 && propPositions.length < 220; i++) {
      const x = scMinX + rng(i * 3 + 1) * scSpanX;
      const z = scMinZ + rng(i * 3 + 2) * scSpanZ;
      if (!isNearTrack(track, x, z, track.wallMargin + 7)) {
        propPositions.push({
          x,
          z,
          s: 0.85 + rng(i * 3 + 3) * 0.32,
          rot: rng(i * 7) * Math.PI * 2,
        });
      }
    }

    const trunkGeo = keep(new THREE.BoxGeometry(1.1, 7.5, 1.1));
    const trunkMat = keep(
      new THREE.MeshStandardMaterial({ color: 0x8d5524, roughness: 0.88 }),
    );
    const crownGeo = keep(new THREE.BoxGeometry(4.8, 2.2, 4.8));
    const crownMat = keep(
      new THREE.MeshStandardMaterial({ color: 0x2ec44d, roughness: 0.72 }),
    );

    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, propPositions.length);
    const crowns = new THREE.InstancedMesh(crownGeo, crownMat, propPositions.length);
    trunks.castShadow = true;
    crowns.castShadow = true;

    propPositions.forEach((p, idx) => {
      dummy.position.set(p.x, 3.75 * p.s, p.z);
      dummy.rotation.set(0, p.rot, 0);
      dummy.scale.setScalar(p.s);
      dummy.updateMatrix();
      trunks.setMatrixAt(idx, dummy.matrix);

      dummy.position.set(p.x, 7.8 * p.s, p.z);
      dummy.rotation.set(0, p.rot + 0.4, 0);
      dummy.scale.set(p.s, p.s * 0.9, p.s);
      dummy.updateMatrix();
      crowns.setMatrixAt(idx, dummy.matrix);

      const shade = 0.88 + rng(idx * 11) * 0.24;
      crowns.setColorAt(idx, new THREE.Color(0.18 * shade, 0.78 * shade, 0.3 * shade));
    });
    trunks.instanceMatrix.needsUpdate = true;
    crowns.instanceMatrix.needsUpdate = true;
    if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
    trunks.computeBoundingSphere();
    crowns.computeBoundingSphere();
    group.add(trunks, crowns);
  } else if (trackId === 'canyon-turbo') {
    const mesaPositions: Array<{ x: number; z: number; sx: number; sy: number; sz: number }> = [];
    for (let i = 0; i < 1000 && mesaPositions.length < 180; i++) {
      const x = scMinX + rng(i * 5 + 1) * scSpanX;
      const z = scMinZ + rng(i * 5 + 2) * scSpanZ;
      if (isBattleRoyale) {
        if (Math.hypot(x, z) < 135) continue;
      } else if (isNearTrack(track, x, z, track.wallMargin + 9)) {
        continue;
      }
      mesaPositions.push({
        x,
        z,
        sx: 4 + rng(i * 5 + 3) * 10,
        sy: 4 + rng(i * 5 + 4) * 14,
        sz: 4 + rng(i * 5 + 5) * 10,
      });
    }

    const mesaGeo = keep(new THREE.BoxGeometry(1, 1, 1));
    const mesaMat = keep(
      new THREE.MeshStandardMaterial({ color: 0xb55239, roughness: 0.9 }),
    );
    const mesas = new THREE.InstancedMesh(mesaGeo, mesaMat, mesaPositions.length);
    mesas.castShadow = true;
    mesas.receiveShadow = true;

    const baseOffset = isBattleRoyale ? -1.6 : 0;
    mesaPositions.forEach((m, idx) => {
      dummy.position.set(m.x, baseOffset + m.sy / 2, m.z);
      dummy.rotation.set(0, rng(idx * 9) * 0.5, 0);
      dummy.scale.set(m.sx, m.sy, m.sz);
      dummy.updateMatrix();
      mesas.setMatrixAt(idx, dummy.matrix);
      const t = 0.82 + rng(idx * 13) * 0.3;
      mesas.setColorAt(idx, new THREE.Color(0.75 * t, 0.34 * t, 0.22 * t));
    });
    mesas.instanceMatrix.needsUpdate = true;
    if (mesas.instanceColor) mesas.instanceColor.needsUpdate = true;
    mesas.computeBoundingSphere();
    group.add(mesas);
  } else if (trackId === 'nuit-neon') {
    // Nuit Néon voxel skyscrapers
    const bldPositions: Array<{ x: number; z: number; w: number; h: number; d: number }> = [];
    for (let i = 0; i < 1100 && bldPositions.length < 210; i++) {
      const x = scMinX + rng(i * 4 + 1) * scSpanX;
      const z = scMinZ + rng(i * 4 + 2) * scSpanZ;
      if (isBattleRoyale) {
        if (Math.hypot(x, z) < 135) continue;
      } else if (isNearTrack(track, x, z, track.wallMargin + 8)) {
        continue;
      }
      bldPositions.push({
        x,
        z,
        w: 6 + rng(i * 4 + 3) * 10,
        h: 12 + rng(i * 4 + 4) * 34,
        d: 6 + rng(i * 4 + 5) * 10,
      });
    }

    const bldGeo = keep(new THREE.BoxGeometry(1, 1, 1));
    const bldMat = keep(
      new THREE.MeshStandardMaterial({
        color: 0x161b33,
        roughness: 0.45,
        metalness: 0.65,
      }),
    );
    const buildings = new THREE.InstancedMesh(bldGeo, bldMat, bldPositions.length);
    const crownStripGeo = keep(new THREE.BoxGeometry(1.02, 0.08, 1.02));
    const crownStripMat = keep(
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    const strips = new THREE.InstancedMesh(
      crownStripGeo,
      crownStripMat,
      bldPositions.length,
    );

    const baseOffset = isBattleRoyale ? -1.6 : 0;
    bldPositions.forEach((b, idx) => {
      dummy.position.set(b.x, baseOffset + b.h / 2, b.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(b.w, b.h, b.d);
      dummy.updateMatrix();
      buildings.setMatrixAt(idx, dummy.matrix);

      dummy.position.set(b.x, baseOffset + b.h - 1.2, b.z);
      dummy.scale.set(b.w * 1.02, 1.1, b.d * 1.02);
      dummy.updateMatrix();
      strips.setMatrixAt(idx, dummy.matrix);
      strips.setColorAt(
        idx,
        new THREE.Color(idx % 2 === 0 ? 0x00f5ff : 0xff2a85),
      );
    });
    buildings.instanceMatrix.needsUpdate = true;
    strips.instanceMatrix.needsUpdate = true;
    if (strips.instanceColor) strips.instanceColor.needsUpdate = true;
    buildings.computeBoundingSphere();
    strips.computeBoundingSphere();
    group.add(buildings, strips);
  }

  const baseHazardHex = trackId === 'nuit-neon' ? 0xff2a85 : 0xffbe0b;

  return {
    group,
    countdownLights,
    update: (timeSec: number, cameraPos: THREE.Vector3, arenaRadius?: number) => {
      skyDome.position.copy(cameraPos);
      if (isBattleRoyale && arenaGroup) {
        const r = arenaRadius && arenaRadius > 0 ? arenaRadius : (track.arenaInitialRadius || 54);
        arenaGroup.scale.set(r, 1, r);
        if (brOceanMat) {
          brOceanMat.uniforms.uIslandRadius.value = r;
        }
        if (arenaHazardMat) {
          const isShrinking = r < (track.arenaInitialRadius || 54) - 0.5;
          if (isShrinking) {
            const pulse = 0.5 + 0.5 * Math.sin(timeSec * 8.0);
            arenaHazardMat.color.setHex(pulse > 0.5 ? 0xff2244 : 0xff9f1c);
          } else {
            arenaHazardMat.color.setHex(baseHazardHex);
          }
        }
      }
      for (const updater of shaderUpdaters) {
        updater.update(timeSec);
      }
    },
    dispose: () => {
      for (const item of disposables) {
        item.dispose();
      }
    },
  };
}
