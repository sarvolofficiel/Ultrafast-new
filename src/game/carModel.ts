import * as THREE from 'three';
import { extendCarPaintMaterial } from './shaders';
import {
  createCarRoofTexture,
  createNameBadgeTexture,
} from './textures';
import { CAR_LIVERIES, type CarColorId, type TrackId } from './types';

export interface PixelCarMesh {
  root: THREE.Group;
  airPivot: THREE.Group;
  bodyGroup: THREE.Group;
  shadowMesh: THREE.Mesh;
  frontLeftPivot: THREE.Group;
  frontRightPivot: THREE.Group;
  wheels: THREE.Group[];
  brakeLightsMat: THREE.MeshStandardMaterial;
  flameLeft: THREE.Mesh;
  flameRight: THREE.Mesh;
  nameSprite: THREE.Sprite | null;
  dispose: () => void;
}

export function createPixelCar(
  colorId: CarColorId,
  name: string,
  showNameTag: boolean,
  shadowTex: THREE.Texture,
  maxAniso: number,
  trackId: TrackId = 'baie-pixel',
): PixelCarMesh {
  const livery =
    CAR_LIVERIES.find((c) => c.id === colorId) ?? CAR_LIVERIES[0];

  const disposables: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  const root = new THREE.Group();
  const airPivot = new THREE.Group();
  airPivot.rotation.order = 'YXZ';
  airPivot.position.y = 0.55;
  const carContainer = new THREE.Group();
  carContainer.position.y = -0.55;
  airPivot.add(carContainer);
  root.add(airPivot);

  const bodyGroup = new THREE.Group();
  carContainer.add(bodyGroup);

  const roofTex = track(createCarRoofTexture(livery, maxAniso));

  // Materials with clear roughness & metalness contrast (>= 0.25 diff) + Sunlight Clearcoat Catchlight
  const paintMat = track(
    new THREE.MeshPhysicalMaterial({
      color: livery.primary,
      roughness: 0.28,
      metalness: 0.36,
      clearcoat: 0.88,
      clearcoatRoughness: 0.14,
    }),
  );
  extendCarPaintMaterial(paintMat, trackId, `paint-${colorId}`);

  const stripedPaintMat = track(
    new THREE.MeshPhysicalMaterial({
      map: roofTex,
      roughness: 0.26,
      metalness: 0.36,
      clearcoat: 0.88,
      clearcoatRoughness: 0.14,
    }),
  );
  extendCarPaintMaterial(stripedPaintMat, trackId, `stripe-${colorId}`);

  const secondaryMat = track(
    new THREE.MeshPhysicalMaterial({
      color: livery.secondary,
      roughness: 0.44,
      metalness: 0.22,
      clearcoat: 0.65,
      clearcoatRoughness: 0.2,
    }),
  );
  extendCarPaintMaterial(secondaryMat, trackId, `sec-${colorId}`);

  const accentMat = track(
    new THREE.MeshPhysicalMaterial({
      color: livery.accent,
      roughness: 0.26,
      metalness: 0.55,
      clearcoat: 0.82,
      clearcoatRoughness: 0.12,
    }),
  );
  extendCarPaintMaterial(accentMat, trackId, `acc-${colorId}`);
  const darkTrimMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x161922,
      roughness: 0.85,
      metalness: 0.08,
    }),
  );
  const glassMat = track(
    new THREE.MeshPhysicalMaterial({
      color: 0x1b2b44,
      roughness: 0.08,
      metalness: 0.15,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
    }),
  );
  const chromeMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xdbe4ee,
      roughness: 0.18,
      metalness: 0.9,
    }),
  );
  const tireMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x1a1c20,
      roughness: 0.92,
      metalness: 0.04,
    }),
  );
  const headlightMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xfff8d6,
      emissive: 0xfff0a8,
      emissiveIntensity: 1.4,
      roughness: 0.2,
    }),
  );
  const brakeLightsMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xff2233,
      emissive: 0xff1122,
      emissiveIntensity: 0.65,
      roughness: 0.3,
    }),
  );
  const flameMat = track(
    new THREE.MeshBasicMaterial({
      color: 0x00f5ff,
      transparent: true,
      opacity: 0.9,
    }),
  );

  // 1. Contact shadow grounding plane
  const shadowGeo = track(new THREE.PlaneGeometry(2.65, 4.5));
  const shadowMat = track(
    new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.65,
    }),
  );
  const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  shadowMesh.rotation.x = -Math.PI / 2;
  shadowMesh.position.y = 0.025;
  root.add(shadowMesh);

  // 2. Lower chassis & side skirts (voxel stepped silhouette, +Z is forward)
  const chassisMain = new THREE.Mesh(
    track(new THREE.BoxGeometry(1.76, 0.44, 3.6)),
    paintMat,
  );
  chassisMain.position.set(0, 0.44, 0);
  chassisMain.castShadow = true;
  chassisMain.receiveShadow = true;
  bodyGroup.add(chassisMain);

  // Hood / front deck with twin racing stripes
  const hood = new THREE.Mesh(
    track(new THREE.BoxGeometry(1.5, 0.14, 1.45)),
    stripedPaintMat,
  );
  hood.position.set(0, 0.69, 0.96);
  hood.castShadow = true;
  bodyGroup.add(hood);

  // Rear deck with racing stripes
  const rearDeck = new THREE.Mesh(
    track(new THREE.BoxGeometry(1.56, 0.14, 0.85)),
    stripedPaintMat,
  );
  rearDeck.position.set(0, 0.71, -1.28);
  rearDeck.castShadow = true;
  bodyGroup.add(rearDeck);

  // 3. Front splitter & pixel grille
  const splitter = new THREE.Mesh(
    track(new THREE.BoxGeometry(1.88, 0.12, 0.42)),
    darkTrimMat,
  );
  splitter.position.set(0, 0.24, 1.72);
  splitter.castShadow = true;
  bodyGroup.add(splitter);

  const grille = new THREE.Mesh(
    track(new THREE.BoxGeometry(1.12, 0.22, 0.12)),
    darkTrimMat,
  );
  grille.position.set(0, 0.42, 1.81);
  bodyGroup.add(grille);

  // Side pixel intake pods
  const sidePodGeo = track(new THREE.BoxGeometry(0.18, 0.28, 1.55));
  const leftPod = new THREE.Mesh(sidePodGeo, secondaryMat);
  leftPod.position.set(-0.92, 0.4, -0.05);
  const rightPod = new THREE.Mesh(sidePodGeo, secondaryMat);
  rightPod.position.set(0.92, 0.4, -0.05);
  bodyGroup.add(leftPod, rightPod);

  // 4. Stepped upper cabin & windshield
  const cabinRoof = new THREE.Mesh(
    track(new THREE.BoxGeometry(1.24, 0.38, 1.42)),
    stripedPaintMat,
  );
  cabinRoof.position.set(0, 0.94, -0.18);
  cabinRoof.castShadow = true;
  bodyGroup.add(cabinRoof);

  const windshield = new THREE.Mesh(
    track(new THREE.BoxGeometry(1.16, 0.28, 0.52)),
    glassMat,
  );
  windshield.position.set(0, 0.89, 0.45);
  windshield.rotation.x = -0.35;
  bodyGroup.add(windshield);

  const sideWindows = new THREE.Mesh(
    track(new THREE.BoxGeometry(1.28, 0.22, 1.1)),
    glassMat,
  );
  sideWindows.position.set(0, 0.91, -0.18);
  bodyGroup.add(sideWindows);

  // 5. Rear pixel spoiler wing (2 pylons + blade + endplates)
  const pylonGeo = track(new THREE.BoxGeometry(0.12, 0.34, 0.24));
  const pylonL = new THREE.Mesh(pylonGeo, darkTrimMat);
  pylonL.position.set(-0.56, 0.92, -1.55);
  const pylonR = new THREE.Mesh(pylonGeo, darkTrimMat);
  pylonR.position.set(0.56, 0.92, -1.55);

  const wingBlade = new THREE.Mesh(
    track(new THREE.BoxGeometry(1.86, 0.1, 0.42)),
    accentMat,
  );
  wingBlade.position.set(0, 1.12, -1.6);
  wingBlade.castShadow = true;

  const endplateGeo = track(new THREE.BoxGeometry(0.08, 0.24, 0.48));
  const endL = new THREE.Mesh(endplateGeo, paintMat);
  endL.position.set(-0.94, 1.12, -1.6);
  const endR = new THREE.Mesh(endplateGeo, paintMat);
  endR.position.set(0.94, 1.12, -1.6);
  bodyGroup.add(pylonL, pylonR, wingBlade, endL, endR);

  // 6. Headlights & tail/brake lights
  const lightGeo = track(new THREE.BoxGeometry(0.28, 0.14, 0.1));
  const hlL = new THREE.Mesh(lightGeo, headlightMat);
  hlL.position.set(-0.62, 0.5, 1.81);
  const hlR = new THREE.Mesh(lightGeo, headlightMat);
  hlR.position.set(0.62, 0.5, 1.81);

  const blL = new THREE.Mesh(lightGeo, brakeLightsMat);
  blL.position.set(-0.6, 0.52, -1.81);
  const blR = new THREE.Mesh(lightGeo, brakeLightsMat);
  blR.position.set(0.6, 0.52, -1.81);
  bodyGroup.add(hlL, hlR, blL, blR);

  // 7. Twin chrome exhausts + nitro flame cones
  const exhaustGeo = track(new THREE.CylinderGeometry(0.09, 0.1, 0.34, 8));
  exhaustGeo.rotateX(Math.PI / 2);
  const exL = new THREE.Mesh(exhaustGeo, chromeMat);
  exL.position.set(-0.34, 0.28, -1.86);
  const exR = new THREE.Mesh(exhaustGeo, chromeMat);
  exR.position.set(0.34, 0.28, -1.86);
  bodyGroup.add(exL, exR);

  const flameGeo = track(new THREE.ConeGeometry(0.14, 0.75, 6));
  flameGeo.rotateX(-Math.PI / 2);
  flameGeo.translate(0, 0, -0.38);
  const flameLeft = new THREE.Mesh(flameGeo, flameMat);
  flameLeft.position.set(-0.34, 0.28, -1.96);
  flameLeft.visible = false;
  const flameRight = new THREE.Mesh(flameGeo, flameMat);
  flameRight.position.set(0.34, 0.28, -1.96);
  flameRight.visible = false;
  bodyGroup.add(flameLeft, flameRight);

  // 8. 4 Articulated Pixel Wheels (8-sided low-poly cylinders with chrome hubs)
  const tireGeo = track(new THREE.CylinderGeometry(0.36, 0.36, 0.32, 10));
  tireGeo.rotateZ(Math.PI / 2);
  const rimGeo = track(new THREE.CylinderGeometry(0.2, 0.2, 0.34, 6));
  rimGeo.rotateZ(Math.PI / 2);

  const makeWheel = () => {
    const w = new THREE.Group();
    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.castShadow = true;
    const rim = new THREE.Mesh(rimGeo, chromeMat);
    w.add(tire, rim);
    return w;
  };

  const frontLeftPivot = new THREE.Group();
  frontLeftPivot.position.set(-0.92, 0.36, 1.12);
  const wFL = makeWheel();
  frontLeftPivot.add(wFL);

  const frontRightPivot = new THREE.Group();
  frontRightPivot.position.set(0.92, 0.36, 1.12);
  const wFR = makeWheel();
  frontRightPivot.add(wFR);

  const wRL = makeWheel();
  wRL.position.set(-0.94, 0.36, -1.12);
  const wRR = makeWheel();
  wRR.position.set(0.94, 0.36, -1.12);

  carContainer.add(frontLeftPivot, frontRightPivot, wRL, wRR);

  // 9. Optional floating pixel name sprite
  let nameSprite: THREE.Sprite | null = null;
  if (showNameTag) {
    const badgeTex = track(createNameBadgeTexture(name, livery.accent));
    const spriteMat = track(
      new THREE.SpriteMaterial({
        map: badgeTex,
        transparent: true,
        depthTest: true,
      }),
    );
    nameSprite = new THREE.Sprite(spriteMat);
    nameSprite.position.set(0, 2.05, 0);
    nameSprite.scale.set(2.8, 0.7, 1);
    airPivot.add(nameSprite);
  }

  return {
    root,
    airPivot,
    bodyGroup,
    shadowMesh,
    frontLeftPivot,
    frontRightPivot,
    wheels: [wFL, wFR, wRL, wRR],
    brakeLightsMat,
    flameLeft,
    flameRight,
    nameSprite,
    dispose: () => {
      for (const item of disposables) {
        item.dispose();
      }
    },
  };
}

interface Particle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  scale: number;
  color: THREE.Color;
}

const _dummy = new THREE.Object3D();

export class VoxelParticlePool {
  public readonly mesh: THREE.InstancedMesh;
  private particles: Particle[] = [];
  private cursor = 0;
  private readonly maxCount: number;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.Material;

  constructor(maxCount = 240) {
    this.maxCount = maxCount;
    this.geometry = new THREE.BoxGeometry(0.26, 0.26, 0.26);
    this.material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(
      this.geometry,
      this.material,
      maxCount,
    );
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;

    const zeroColor = new THREE.Color(0xffffff);
    for (let i = 0; i < maxCount; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: -50,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 1,
        scale: 0,
        color: new THREE.Color(0xffffff),
      });
      _dummy.position.set(0, -50, 0);
      _dummy.scale.setScalar(0.001);
      _dummy.updateMatrix();
      this.mesh.setMatrixAt(i, _dummy.matrix);
      this.mesh.setColorAt(i, zeroColor);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  public spawn(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    hexColor: number,
    scale = 1,
    life = 0.45,
  ): void {
    const p = this.particles[this.cursor];
    this.cursor = (this.cursor + 1) % this.maxCount;
    p.active = true;
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.life = life;
    p.maxLife = life;
    p.scale = scale;
    p.color.setHex(hexColor);
  }

  public spawnBurst(
    x: number,
    y: number,
    z: number,
    count: number,
    hexColor: number,
    speed = 8,
  ): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = (0.4 + Math.random() * 0.8) * speed;
      this.spawn(
        x,
        y,
        z,
        Math.cos(a) * spd,
        2 + Math.random() * 5,
        Math.sin(a) * spd,
        hexColor,
        0.9 + Math.random() * 0.7,
        0.35 + Math.random() * 0.25,
      );
    }
  }

  public update(dt: number): void {
    let anyColor = false;
    for (let i = 0; i < this.maxCount; i++) {
      const p = this.particles[i];
      if (!p.active) continue;

      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        _dummy.position.set(0, -50, 0);
        _dummy.scale.setScalar(0.001);
        _dummy.updateMatrix();
        this.mesh.setMatrixAt(i, _dummy.matrix);
        continue;
      }

      p.vy -= 12 * dt;
      p.x += p.vx * dt;
      p.y = Math.max(0.1, p.y + p.vy * dt);
      p.z += p.vz * dt;

      const ratio = p.life / p.maxLife;
      _dummy.position.set(p.x, p.y, p.z);
      _dummy.rotation.set(p.life * 4, p.life * 6, 0);
      _dummy.scale.setScalar(p.scale * ratio);
      _dummy.updateMatrix();
      this.mesh.setMatrixAt(i, _dummy.matrix);
      this.mesh.setColorAt(i, p.color);
      anyColor = true;
    }

    this.mesh.instanceMatrix.needsUpdate = true;
    if (anyColor && this.mesh.instanceColor) {
      this.mesh.instanceColor.needsUpdate = true;
    }
  }

  public dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
