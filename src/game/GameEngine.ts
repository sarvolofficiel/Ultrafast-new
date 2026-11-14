import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SoundEngine } from './audio';
import {
  createPixelCar,
  VoxelParticlePool,
  type PixelCarMesh,
} from './carModel';
import {
  buildSnapshot,
  createInitialRacers,
  stepRaceSimulation,
  type RaceEvent,
} from './physics';
import { getTrackSunConfig, SunLightPostShader } from './shaders';
import { createContactShadowTexture } from './textures';
import { getTrackData, TRACK_METAS, type TrackData } from './tracks';
import type {
  CarColorId,
  GamePhase,
  HudTelemetry,
  NetworkRole,
  PixelMode,
  PlayerInput,
  RaceFormat,
  RacerState,
  TrackId,
  WorldSnapshot,
} from './types';
import { buildTrackWorld, type BuiltWorld } from './worldBuilder';
import type { P2PNetworkManager } from '../net/p2pNetwork';

// Pre-allocated math helpers outside render loop (zero GC)
const _camTargetPos = new THREE.Vector3();
const _camLookTarget = new THREE.Vector3();
const _sunProj = new THREE.Vector3();
const _camForward = new THREE.Vector3();
const _skyTop = new THREE.Color();
const _skyBot = new THREE.Color();

function detectSoftwareGl(): boolean {
  const probe = document.createElement('canvas');
  const gl = probe.getContext('webgl2');
  if (!gl) return true;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const gpu = String(gl.getParameter(param));
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

export interface EngineCallbacks {
  onHudUpdate: (hud: HudTelemetry) => void;
  onPhaseChange: (phase: GamePhase) => void;
  onRaceFinished: (racers: RacerState[]) => void;
  onPauseRequested: () => void;
}

export class GameEngine {
  private container: HTMLElement;
  private network: P2PNetworkManager;
  private callbacks: EngineCallbacks;
  public readonly sound = new SoundEngine();

  private isSoftwareGl: boolean;
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private postPass: ShaderPass | null = null;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private keyLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private envRT: THREE.WebGLRenderTarget;

  private shadowTex: THREE.Texture;
  private particles: VoxelParticlePool;
  private world: BuiltWorld | null = null;
  private track: TrackData;

  private carMeshes = new Map<string, PixelCarMesh>();
  private showcaseCar: PixelCarMesh | null = null;
  private showcaseColor: CarColorId = 'crimson';

  // Simulation state
  private phase: GamePhase = 'title';
  private role: NetworkRole = 'offline';
  private localPlayerId = 'local-player';
  private totalLaps = 3;
  private racers: RacerState[] = [];
  private remoteInputs = new Map<string, PlayerInput>();
  private localInputSeq = 0;

  private raceElapsedMs = 0;
  private countdownTimer = 3.5;
  private lastCountdownInt = 4;
  private simTick = 0;
  private netSendAccum = 0;
  private hudAccum = 0;
  private hitstopTimer = 0;
  private cameraShake = 0;
  private bannerText: string | null = null;
  private bannerTimer = 0;

  // Pixel screen mode ('ultra' = bold 26% pixel res, 'retro' = 42% pixel res, 'hd' = crisp native)
  private pixelMode: PixelMode = 'ultra';

  // Input state (held vs justPressed)
  private heldKeys = new Set<string>();
  private shiftHeld = false;
  private touchControls = {
    throttle: 0,
    brake: 0,
    steer: 0,
    drift: false,
    boost: false,
    jump: false,
  };

  // Loop management
  private frameId = 0;
  private disposed = false;
  private clock = new THREE.Clock();
  private shaderElapsedSec = 0;
  private camPos = new THREE.Vector3(0, 8, 18);
  private camLook = new THREE.Vector3(0, 1.5, 0);
  private showcaseAngle = 0.5;
  private isDragging = false;
  private lastPointerX = 0;

  constructor(
    container: HTMLElement,
    network: P2PNetworkManager,
    callbacks: EngineCallbacks,
  ) {
    this.container = container;
    this.network = network;
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareGl();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.applyPixelRatio();

    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.className = 'pixel-canvas';
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();

    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(62, w / h, 0.2, 650);

    // Subtle Sunlight Post-Processing Pipeline (GPU only; bypassed on software WebGL)
    if (!this.isSoftwareGl) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));

      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(w, h),
        0.16, // subtle sun bloom strength
        0.35, // radius
        0.92, // high threshold so only sun & bright specular glints bloom
      );
      this.composer.addPass(this.bloomPass);
      this.composer.addPass(new OutputPass());

      this.postPass = new ShaderPass(SunLightPostShader);
      this.composer.addPass(this.postPass);
    }

    this.applyPixelRatio();

    // Mandatory studio environment reflections via RoomEnvironment
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = this.envRT.texture;
    pmrem.dispose();

    // Warm/cool 3-point outdoor lighting rig
    this.hemiLight = new THREE.HemisphereLight(0xa6ecff, 0x3b4d2b, 0.78);
    this.scene.add(this.hemiLight);

    this.keyLight = new THREE.DirectionalLight(0xfff3d6, 1.85);
    this.keyLight.position.set(55, 95, 40);
    this.keyLight.castShadow = !this.isSoftwareGl;
    this.keyLight.shadow.mapSize.width = 1024;
    this.keyLight.shadow.mapSize.height = 1024;
    this.keyLight.shadow.camera.near = 10;
    this.keyLight.shadow.camera.far = 260;
    const d = 55;
    this.keyLight.shadow.camera.left = -d;
    this.keyLight.shadow.camera.right = d;
    this.keyLight.shadow.camera.top = d;
    this.keyLight.shadow.camera.bottom = -d;
    this.keyLight.shadow.bias = -0.0005;
    this.keyLight.shadow.normalBias = 0.02;
    this.scene.add(this.keyLight);
    this.scene.add(this.keyLight.target);

    const rimLight = new THREE.DirectionalLight(0x88ccff, 0.55);
    rimLight.position.set(-60, 40, -70);
    this.scene.add(rimLight);

    this.shadowTex = createContactShadowTexture();
    this.particles = new VoxelParticlePool(240);
    this.scene.add(this.particles.mesh);

    this.track = getTrackData('baie-pixel', 104729, 'sprint');
    this.loadWorld('baie-pixel', 104729, 'sprint');
    this.setupShowcaseCar('crimson');

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    this.clock.start();
    this.startLoop();
  }

  private applyPixelRatio(): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;

    let targetW = w;
    let targetH = h;
    let dpr = 1;

    if (this.pixelMode === 'hd') {
      dpr = this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2);
      this.renderer.setPixelRatio(dpr);
      this.renderer.setSize(w, h, false);
    } else {
      const scale = this.pixelMode === 'ultra' ? 0.26 : 0.42;
      targetW = Math.max(220, Math.round(w * scale));
      targetH = Math.max(124, Math.round(h * scale));
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(targetW, targetH, false);
    }

    if (this.composer) {
      this.composer.setPixelRatio(dpr);
      this.composer.setSize(targetW, targetH);
    }
    if (this.bloomPass) {
      this.bloomPass.resolution.set(targetW, targetH);
    }
    if (this.postPass) {
      this.postPass.uniforms.uAspect.value = w / Math.max(1, h);
    }

    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
  }

  public setPixelMode(mode: PixelMode): void {
    this.pixelMode = mode;
    this.renderer.domElement.className = mode !== 'hd' ? 'pixel-canvas' : '';
    this.applyPixelRatio();
  }

  public getPixelMode(): PixelMode {
    return this.pixelMode;
  }

  public setTouchControls(
    partial: Partial<{
      throttle: number;
      brake: number;
      steer: number;
      drift: boolean;
      boost: boolean;
      jump: boolean;
    }>,
  ): void {
    Object.assign(this.touchControls, partial);
  }

  public loadWorld(
    trackId: TrackId,
    mapSeed = 104729,
    raceFormat: RaceFormat = 'sprint',
  ): void {
    if (
      this.world &&
      this.track.meta.id === trackId &&
      this.track.seed === mapSeed &&
      this.track.format === raceFormat
    ) {
      return;
    }

    if (this.world) {
      this.scene.remove(this.world.group);
      this.world.dispose();
      this.world = null;
    }

    this.track = getTrackData(trackId, mapSeed, raceFormat);
    const meta = TRACK_METAS[trackId];

    _skyTop.set(meta.skyTop);
    _skyBot.set(meta.skyBottom);
    this.scene.background = _skyBot.clone();
    this.scene.fog = new THREE.FogExp2(meta.fogColor, trackId === 'nuit-neon' ? 0.0042 : 0.003);

    const sun = getTrackSunConfig(trackId);
    if (trackId === 'nuit-neon') {
      this.hemiLight.color.set(0x6366f1);
      this.hemiLight.groundColor.set(0x1e1b4b);
      this.hemiLight.intensity = 0.85;
      this.keyLight.color.copy(sun.color);
      this.keyLight.intensity = 1.35;
    } else if (trackId === 'canyon-turbo') {
      this.hemiLight.color.set(0xffd2a6);
      this.hemiLight.groundColor.set(0x6b3a24);
      this.hemiLight.intensity = 0.82;
      this.keyLight.color.copy(sun.color);
      this.keyLight.intensity = 1.95;
    } else {
      this.hemiLight.color.set(0xa6ecff);
      this.hemiLight.groundColor.set(0x3b4d2b);
      this.hemiLight.intensity = 0.78;
      this.keyLight.color.copy(sun.color);
      this.keyLight.intensity = 1.85;
    }

    if (this.postPass) {
      this.postPass.uniforms.uSunColor.value.copy(sun.haloColor);
    }

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.world = buildTrackWorld(this.track, maxAniso);
    this.scene.add(this.world.group);

    if (this.showcaseCar) {
      const p = this.track.points[this.track.startSegIndex];
      const t = this.track.tangents[this.track.startSegIndex];
      this.showcaseCar.root.position.set(p.x + t.x * 7, 0, p.z + t.z * 7);
      this.showcaseCar.root.rotation.y = Math.atan2(t.x, t.z);
    }
  }

  public setupShowcaseCar(colorId: CarColorId): void {
    if (this.showcaseColor === colorId && this.showcaseCar) return;
    this.showcaseColor = colorId;
    if (this.showcaseCar) {
      this.scene.remove(this.showcaseCar.root);
      this.showcaseCar.dispose();
      this.showcaseCar = null;
    }

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.showcaseCar = createPixelCar(
      colorId,
      'JOUEUR',
      false,
      this.shadowTex,
      maxAniso,
      this.track.meta.id,
    );
    const p = this.track.points[this.track.startSegIndex];
    const t = this.track.tangents[this.track.startSegIndex];
    this.showcaseCar.root.position.set(p.x + t.x * 7, 0, p.z + t.z * 7);
    this.showcaseCar.root.rotation.y = Math.atan2(t.x, t.z);
    this.showcaseCar.root.visible = this.phase === 'title' || this.phase === 'lobby';
    this.scene.add(this.showcaseCar.root);
  }

  private setPhase(newPhase: GamePhase) {
    this.phase = newPhase;
    if (this.renderer && this.renderer.domElement) {
      if (newPhase === 'title' || newPhase === 'lobby' || newPhase === 'paused') {
        this.renderer.domElement.style.pointerEvents = 'none';
      } else {
        this.renderer.domElement.style.pointerEvents = 'auto';
      }
    }
  }

  public returnToTitleView(colorId: CarColorId): void {
    this.clearRaceCars();
    this.setPhase('title');
    this.role = 'offline';
    this.sound.updateEngine(0, false, false, false);
    this.setupShowcaseCar(colorId);
    if (this.showcaseCar) {
      const p = this.track.points[this.track.startSegIndex];
      const t = this.track.tangents[this.track.startSegIndex];
      this.showcaseCar.root.position.set(p.x + t.x * 7, 0, p.z + t.z * 7);
      this.showcaseCar.root.visible = true;
    }
    this.callbacks.onPhaseChange('title');
  }

  public setLobbyPreview(
    trackId: TrackId,
    colorId: CarColorId,
    mapSeed?: number,
    raceFormat?: RaceFormat,
  ): void {
    const alreadyInLobby = this.phase === 'lobby';
    if (!alreadyInLobby) {
      this.clearRaceCars();
      this.setPhase('lobby');
      this.sound.updateEngine(0, false, false, false);
    }
    const targetSeed = mapSeed ?? this.track.seed;
    const targetFormat = raceFormat ?? this.track.format;
    if (
      this.track.meta.id !== trackId ||
      this.track.seed !== targetSeed ||
      this.track.format !== targetFormat
    ) {
      this.loadWorld(trackId, targetSeed, targetFormat);
      this.setupShowcaseCar(colorId);
    } else if (!alreadyInLobby || !this.showcaseCar) {
      this.setupShowcaseCar(colorId);
    }
    if (this.showcaseCar) {
      const p = this.track.points[this.track.startSegIndex];
      const t = this.track.tangents[this.track.startSegIndex];
      this.showcaseCar.root.position.set(p.x + t.x * 7, 0, p.z + t.z * 7);
      this.showcaseCar.root.visible = true;
    }
    if (!alreadyInLobby) {
      this.callbacks.onPhaseChange('lobby');
    }
  }

  public startRace(options: {
    trackId: TrackId;
    mapSeed: number;
    raceFormat: RaceFormat;
    totalLaps: number;
    role: NetworkRole;
    localId: string;
    participants: Array<{
      id: string;
      name: string;
      colorId: CarColorId;
      isAI: boolean;
    }>;
  }): void {
    this.sound.unlock();
    this.clearRaceCars();
    if (this.showcaseCar) {
      this.showcaseCar.root.visible = false;
    }

    this.loadWorld(options.trackId, options.mapSeed, options.raceFormat);

    this.role = options.role;
    this.localPlayerId = options.localId;
    this.totalLaps = options.raceFormat === 'sprint' ? 1 : options.totalLaps;

    this.racers = createInitialRacers(
      this.track,
      options.participants.map((p) => ({
        ...p,
        isLocal: p.id === options.localId,
      })),
    );

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    for (const r of this.racers) {
      const car = createPixelCar(
        r.colorId,
        r.name,
        !r.isLocal,
        this.shadowTex,
        maxAniso,
        this.track.meta.id,
      );
      car.root.position.set(r.x, 0, r.z);
      car.root.rotation.y = r.heading;
      this.scene.add(car.root);
      this.carMeshes.set(r.id, car);
    }

    // Position chase camera cleanly behind local car
    const local = this.racers.find((r) => r.isLocal) ?? this.racers[0];
    if (local) {
      this.camPos.set(
        local.x - Math.sin(local.heading) * 10,
        4.6,
        local.z - Math.cos(local.heading) * 10,
      );
      this.camLook.set(local.x, 1.4, local.z);
    }

    this.raceElapsedMs = 0;
    this.countdownTimer = 3.2;
    this.lastCountdownInt = 4;
    this.simTick = 0;
    this.hitstopTimer = 0;
    this.cameraShake = 0;
    this.bannerText = null;
    this.bannerTimer = 0;
    this.remoteInputs.clear();

    this.setPhase('countdown');
    this.callbacks.onPhaseChange('countdown');
  }

  public setPaused(paused: boolean): void {
    if (this.role !== 'offline') return; // online races don't freeze world clock
    if (paused && (this.phase === 'racing' || this.phase === 'countdown')) {
      this.setPhase('paused');
      this.sound.updateEngine(0, false, false, false);
      this.callbacks.onPhaseChange('paused');
    } else if (!paused && this.phase === 'paused') {
      const nextP = this.countdownTimer > 0 ? 'countdown' : 'racing';
      this.setPhase(nextP);
      this.callbacks.onPhaseChange(nextP);
    }
  }

  public receiveRemoteInput(peerId: string, input: PlayerInput): void {
    this.remoteInputs.set(peerId, input);
  }

  public receiveSnapshot(snapshot: WorldSnapshot): void {
    if (this.role !== 'client') return;

    this.raceElapsedMs = snapshot.raceElapsedMs;
    this.simTick = snapshot.tick;

    // Handle phase transitions driven by Host's PC
    if (snapshot.phase === 'racing' && this.phase === 'countdown') {
      this.setPhase('racing');
      this.countdownTimer = 0;
      this.updateCountdownLights(0);
      this.bannerText = 'PARTEZ !';
      this.bannerTimer = 1.1;
      this.sound.playCountdownBeep(true);
      this.callbacks.onPhaseChange('racing');
    } else if (snapshot.phase === 'countdown') {
      this.countdownTimer = snapshot.countdownValue;
      if (snapshot.countdownValue !== this.lastCountdownInt) {
        this.lastCountdownInt = snapshot.countdownValue;
        if (snapshot.countdownValue > 0) {
          this.sound.playCountdownBeep(false);
        }
        this.updateCountdownLights(snapshot.countdownValue);
      }
    }

    // Reconcile racers list
    for (const sr of snapshot.racers) {
      const localR = this.racers.find((r) => r.id === sr.id);
      if (localR) {
        // Smooth blend toward authoritative host position
        const distSq = (sr.x - localR.x) ** 2 + (sr.z - localR.z) ** 2;
        if (distSq > 64) {
          localR.x = sr.x;
          localR.z = sr.z;
        } else {
          localR.x += (sr.x - localR.x) * 0.45;
          localR.z += (sr.z - localR.z) * 0.45;
        }
        localR.y += (sr.y - localR.y) * 0.55;
        localR.vx = sr.vx;
        localR.vy = sr.vy;
        localR.vz = sr.vz;
        localR.heading = lerpAngle(localR.heading, sr.heading, 0.45);
        localR.pitch = lerpAngle(localR.pitch, sr.pitch, 0.55);
        localR.speed = sr.speed;
        localR.steerAngle = sr.steerAngle;
        localR.visualYawOffset = sr.visualYawOffset;
        localR.driftDir = sr.driftDir;
        localR.driftCharge = sr.driftCharge;
        localR.boostTimer = sr.boostTimer;
        localR.nitroEnergy = sr.nitroEnergy;
        localR.offRoad = sr.offRoad;
        localR.braking = sr.braking;
        localR.segIndex = sr.segIndex;
        localR.lap = sr.lap;
        localR.totalProgress = sr.totalProgress;
        localR.rank = sr.rank;
        localR.finished = sr.finished;
        localR.finishTimeMs = sr.finishTimeMs;
        localR.bestLapMs = sr.bestLapMs;
        localR.lastLapMs = sr.lastLapMs;
      }
    }

    if (snapshot.events) {
      for (const ev of snapshot.events) {
        this.triggerEventEffects(ev);
      }
    }

    const me = this.racers.find((r) => r.id === this.localPlayerId);
    if (me && me.finished && this.phase !== 'finished') {
      this.phase = 'finished';
      this.sound.playLapChime(true);
      this.callbacks.onPhaseChange('finished');
      this.callbacks.onRaceFinished([...this.racers]);
    }
  }

  private clearRaceCars(): void {
    for (const car of this.carMeshes.values()) {
      this.scene.remove(car.root);
      car.dispose();
    }
    this.carMeshes.clear();
    this.racers = [];
  }

  private readLocalInput(): PlayerInput {
    const k = this.heldKeys;
    const throttle =
      k.has('KeyW') || k.has('KeyZ') || k.has('ArrowUp')
        ? 1
        : this.touchControls.throttle;
    const brake =
      k.has('KeyS') || k.has('ArrowDown')
        ? 1
        : this.touchControls.brake;

    let steer = this.touchControls.steer;
    if (k.has('KeyA') || k.has('KeyQ') || k.has('ArrowLeft')) steer += 1;
    if (k.has('KeyD') || k.has('ArrowRight')) steer -= 1;
    steer = Math.max(-1, Math.min(1, steer));

    const drift =
      this.shiftHeld ||
      k.has('ShiftLeft') ||
      k.has('ShiftRight') ||
      k.has('Space') ||
      this.touchControls.drift;
    const boost = k.has('KeyF') || k.has('KeyB') || this.touchControls.boost;
    const jump = k.has('KeyE') || this.touchControls.jump;

    return {
      throttle,
      brake,
      steer,
      drift,
      boost,
      jump,
      seq: ++this.localInputSeq,
    };
  }

  private updateCountdownLights(val: number): void {
    if (!this.world) return;
    const lights = this.world.countdownLights;
    if (lights.length < 3) return;
    if (val >= 3) {
      lights[0].emissive.setHex(0xff1e38);
      lights[1].emissive.setHex(0x000000);
      lights[2].emissive.setHex(0x000000);
    } else if (val === 2) {
      lights[0].emissive.setHex(0xff1e38);
      lights[1].emissive.setHex(0xffbe0b);
      lights[2].emissive.setHex(0x000000);
    } else if (val === 1) {
      lights[0].emissive.setHex(0xff1e38);
      lights[1].emissive.setHex(0xffbe0b);
      lights[2].emissive.setHex(0xffbe0b);
    } else {
      lights.forEach((l) => l.emissive.setHex(0x38e54d));
    }
  }

  private triggerEventEffects(ev: {
    type: 'collision' | 'boost' | 'lap' | 'jump';
    x: number;
    z: number;
    racerId?: string;
    intensity?: number;
  }): void {
    const isMe = ev.racerId === this.localPlayerId;
    if (ev.type === 'jump') {
      this.particles.spawnBurst(ev.x, 0.2, ev.z, 8, 0xe2e8f0, 6);
      if (isMe) {
        this.sound.playJump();
      }
    } else if (ev.type === 'collision') {
      this.particles.spawnBurst(ev.x, 0.5, ev.z, 12, 0xffd166, 9);
      if (isMe) {
        this.cameraShake = Math.min(0.65, 0.28 * (ev.intensity ?? 1));
        this.hitstopTimer = 0.042; // 42ms impact hitstop
        this.sound.playCollision(ev.intensity ?? 1);
      }
    } else if (ev.type === 'boost') {
      const tier = ev.intensity ?? 1;
      const sparkColor =
        tier >= 3 ? 0xff2a85 : tier === 2 ? 0xff9f1c : 0x00f5ff;
      this.particles.spawnBurst(ev.x, 0.4, ev.z, 12 + tier * 4, sparkColor, 8);
      if (isMe) {
        this.sound.playBoost();
        this.bannerText =
          tier >= 3
            ? 'ULTRA DRIFT TURBO !'
            : tier === 2
              ? 'SUPER TURBO !'
              : 'MINI-TURBO !';
        this.bannerTimer = 0.85;
      }
    } else if (ev.type === 'lap' && isMe) {
      if ((ev.intensity ?? 1) >= 2) {
        this.sound.playLapChime(true);
      } else {
        this.sound.playLapChime(false);
        const me = this.racers.find((r) => r.id === this.localPlayerId);
        this.bannerText =
          me && me.lap === this.totalLaps ? 'DERNIER TOUR !' : `TOUR ${me?.lap ?? ''}`;
        this.bannerTimer = 1.4;
      }
    }
  }

  private updateSunPostUniforms(): void {
    if (!this.postPass) return;
    if (this.track.meta.id === 'nuit-neon') {
      this.postPass.uniforms.uSunWeight.value = 0;
      return;
    }
    const sun = getTrackSunConfig(this.track.meta.id);
    this.camera.getWorldDirection(_camForward);
    const facingDot = _camForward.dot(sun.dir);
    const weight = Math.max(0, Math.min(1, (facingDot - 0.15) / 0.85));
    if (weight <= 0.001) {
      this.postPass.uniforms.uSunWeight.value = 0;
      return;
    }
    _sunProj.copy(this.camera.position).addScaledVector(sun.dir, 450);
    _sunProj.project(this.camera);
    this.postPass.uniforms.uSunScreenPos.value.set(
      _sunProj.x * 0.5 + 0.5,
      _sunProj.y * 0.5 + 0.5,
    );
    this.postPass.uniforms.uSunWeight.value = weight;
  }

  private stepFrame(dt: number): void {
    this.shaderElapsedSec += dt;

    if (this.bannerTimer > 0) {
      this.bannerTimer = Math.max(0, this.bannerTimer - dt);
      if (this.bannerTimer === 0) this.bannerText = null;
    }

    if (this.phase === 'title' || this.phase === 'lobby') {
      if (this.showcaseCar) {
        const p = this.showcaseCar.root.position;
        // Static side view framing (no camera rotation blocking UI touches)
        _camTargetPos.set(p.x - 7.5, p.y + 1.35, p.z + 4.2);
        this.camera.position.copy(_camTargetPos);
        _camLookTarget.set(p.x, p.y + 0.75, p.z);
        this.camera.lookAt(_camLookTarget);
        const sun = getTrackSunConfig(this.track.meta.id);
        this.keyLight.position.set(
          p.x + sun.dir.x * 110,
          Math.max(35, sun.dir.y * 140),
          p.z + sun.dir.z * 110,
        );
        this.keyLight.target.position.copy(p);
      }
      this.world?.update(this.shaderElapsedSec, this.camera.position);
      this.updateSunPostUniforms();
      this.particles.update(dt);
      return;
    }

    if (this.phase === 'paused') {
      this.world?.update(this.shaderElapsedSec, this.camera.position);
      return;
    }

    // Micro-hitstop freeze on heavy collisions (offline/host visual polish)
    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
      return;
    }

    const localInput = this.readLocalInput();

    // Host or Offline runs authoritative simulation
    if (this.role === 'offline' || this.role === 'host') {
      let frameEvents: RaceEvent[] = [];

      if (this.phase === 'countdown') {
        this.countdownTimer -= dt;
        const cInt = Math.max(0, Math.ceil(this.countdownTimer));
        if (cInt !== this.lastCountdownInt) {
          this.lastCountdownInt = cInt;
          this.updateCountdownLights(cInt);
          if (cInt > 0) {
            this.sound.playCountdownBeep(false);
          }
        }
        if (this.countdownTimer <= 0) {
          this.setPhase('racing');
          this.updateCountdownLights(0);
          this.sound.playCountdownBeep(true);
          this.bannerText = 'PARTEZ !';
          this.bannerTimer = 1.1;
          this.callbacks.onPhaseChange('racing');
        }
      }

      if (this.phase === 'racing' || this.phase === 'finished') {
        this.raceElapsedMs += dt * 1000;
      }

      const simInputs = new Map<string, PlayerInput>(this.remoteInputs);
      simInputs.set(this.localPlayerId, localInput);

      frameEvents = stepRaceSimulation(
        this.racers,
        simInputs,
        this.track,
        this.totalLaps,
        this.raceElapsedMs,
        dt,
        this.phase === 'racing' || this.phase === 'finished',
      );

      for (const ev of frameEvents) {
        this.triggerEventEffects(ev);
      }

      const me = this.racers.find((r) => r.id === this.localPlayerId);
      if (me && me.finished && this.phase === 'racing') {
        this.setPhase('finished');
        this.callbacks.onPhaseChange('finished');
        this.callbacks.onRaceFinished([...this.racers]);
      }

      // Broadcast snapshot from Host's PC to all connected clients at 30Hz
      if (this.role === 'host') {
        this.netSendAccum += dt;
        if (this.netSendAccum >= 1 / 30 || frameEvents.length > 0) {
          this.netSendAccum = 0;
          this.simTick++;
          const snap = buildSnapshot(
            this.racers,
            this.simTick,
            this.raceElapsedMs,
            Math.max(0, Math.ceil(this.countdownTimer)),
            this.phase === 'countdown'
              ? 'countdown'
              : this.phase === 'finished'
                ? 'finished'
                : 'racing',
            frameEvents,
          );
          this.network.broadcastFromHost({ kind: 'snapshot', snapshot: snap }, false);
        }
      }
    } else if (this.role === 'client') {
      // Client sends inputs to Host's PC at 30Hz & smoothly extrapolates positions
      this.netSendAccum += dt;
      if (this.netSendAccum >= 1 / 30) {
        this.netSendAccum = 0;
        this.network.sendClientInput(localInput);
      }
      if (this.phase === 'racing' || this.phase === 'finished') {
        for (const r of this.racers) {
          r.x += r.vx * dt;
          r.z += r.vz * dt;
          if (r.y > 0 || r.vy > 0) {
            r.vy -= 33.0 * dt;
            r.y = Math.max(0, r.y + r.vy * dt);
          }
        }
      }
    }

    // Update 3D car meshes, wheels, flames & particles
    for (const r of this.racers) {
      const car = this.carMeshes.get(r.id);
      if (!car) continue;

      car.root.position.set(r.x, 0, r.z);
      car.root.rotation.y = r.heading + r.visualYawOffset;
      car.airPivot.position.y = 0.55 + r.y;
      car.airPivot.rotation.x = r.pitch;

      const shadowScale = 1 / (1 + r.y * 0.14);
      car.shadowMesh.scale.set(shadowScale, shadowScale, 1);
      (car.shadowMesh.material as THREE.MeshBasicMaterial).opacity =
        0.65 / (1 + r.y * 0.18);

      // Subtle suspension lean into turns
      const targetRoll = -r.steerAngle * Math.min(1, Math.abs(r.speed) / 40) * 0.14;
      car.bodyGroup.rotation.z = THREE.MathUtils.damp(
        car.bodyGroup.rotation.z,
        targetRoll,
        12,
        dt,
      );

      // Front steering & wheel spin
      car.frontLeftPivot.rotation.y = r.steerAngle;
      car.frontRightPivot.rotation.y = r.steerAngle;
      const wheelSpin = (r.speed / 0.36) * dt;
      for (const w of car.wheels) {
        w.rotation.x += wheelSpin;
      }

      // Brake lights & nitro flames
      car.brakeLightsMat.emissiveIntensity = r.braking ? 2.8 : 0.6;
      const boosting = r.boostTimer > 0;
      car.flameLeft.visible = boosting;
      car.flameRight.visible = boosting;
      if (boosting) {
        const flicker = 0.8 + Math.random() * 0.55;
        car.flameLeft.scale.set(1, 1, flicker);
        car.flameRight.scale.set(1, 1, flicker);
      }

      // Drift sparks & off-road dust particles
      const sinH = Math.sin(r.heading);
      const cosH = Math.cos(r.heading);
      if (r.y <= 0.08 && r.driftDir !== 0 && r.speed > 14 && Math.random() < 0.75) {
        const sparkCol =
          r.driftCharge >= 2.2
            ? 0xff2a85
            : r.driftCharge >= 1.4
              ? 0xff9f1c
              : 0x00f5ff;
        this.particles.spawn(
          r.x - sinH * 1.4 + (Math.random() - 0.5) * 1.2,
          0.2,
          r.z - cosH * 1.4 + (Math.random() - 0.5) * 1.2,
          -r.vx * 0.2 + (Math.random() - 0.5) * 3,
          1.5 + Math.random() * 2,
          -r.vz * 0.2 + (Math.random() - 0.5) * 3,
          sparkCol,
          0.85,
          0.26,
        );
      } else if (r.y <= 0.08 && r.offRoad && Math.abs(r.speed) > 12 && Math.random() < 0.45) {
        const dustCol =
          this.track.meta.id === 'canyon-turbo' ? 0xd98a5f : 0xcbd5e1;
        this.particles.spawn(
          r.x - sinH * 1.5 + (Math.random() - 0.5) * 1.1,
          0.22,
          r.z - cosH * 1.5 + (Math.random() - 0.5) * 1.1,
          (Math.random() - 0.5) * 2,
          1.2 + Math.random() * 1.5,
          (Math.random() - 0.5) * 2,
          dustCol,
          1.1,
          0.35,
        );
      }
    }

    this.particles.update(dt);

    // Chase camera with exponential damping, speed FOV punch, & collision shake
    const focus = this.racers.find((r) => r.isLocal) ?? this.racers[0];
    if (focus) {
      const camHeading = focus.heading + focus.visualYawOffset * 0.35;
      const dist = focus.boostTimer > 0 ? 11.4 : 9.8;
      const height = 4.4 + focus.y * 0.72;

      _camTargetPos.set(
        focus.x - Math.sin(camHeading) * dist,
        height,
        focus.z - Math.cos(camHeading) * dist,
      );
      _camLookTarget.set(
        focus.x + Math.sin(focus.heading) * 6,
        1.25 + focus.y * 0.85,
        focus.z + Math.cos(focus.heading) * 6,
      );

      this.camPos.x = THREE.MathUtils.damp(this.camPos.x, _camTargetPos.x, 9, dt);
      this.camPos.y = THREE.MathUtils.damp(this.camPos.y, _camTargetPos.y, 9, dt);
      this.camPos.z = THREE.MathUtils.damp(this.camPos.z, _camTargetPos.z, 9, dt);

      this.camLook.x = THREE.MathUtils.damp(this.camLook.x, _camLookTarget.x, 12, dt);
      this.camLook.y = THREE.MathUtils.damp(this.camLook.y, _camLookTarget.y, 12, dt);
      this.camLook.z = THREE.MathUtils.damp(this.camLook.z, _camLookTarget.z, 12, dt);

      this.camera.position.copy(this.camPos);
      if (this.cameraShake > 0.005) {
        this.camera.position.x += (Math.random() - 0.5) * this.cameraShake;
        this.camera.position.y += (Math.random() - 0.5) * this.cameraShake;
        this.cameraShake = THREE.MathUtils.damp(this.cameraShake, 0, 14, dt);
      }
      this.camera.lookAt(this.camLook);

      const targetFov = focus.boostTimer > 0 ? 74 : 62 + Math.min(8, (Math.abs(focus.speed) / 60) * 8);
      if (Math.abs(this.camera.fov - targetFov) > 0.1) {
        this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 7, dt);
        this.camera.updateProjectionMatrix();
      }

      // Move directional sun shadow frustum aligned with sky sun
      const sun = getTrackSunConfig(this.track.meta.id);
      this.keyLight.position.set(
        focus.x + sun.dir.x * 110,
        Math.max(35, sun.dir.y * 140),
        focus.z + sun.dir.z * 110,
      );
      this.keyLight.target.position.set(focus.x, 0, focus.z);

      // Update Web Audio engine synth
      this.sound.updateEngine(
        Math.abs(focus.speed) / 58,
        focus.driftDir !== 0,
        focus.boostTimer > 0,
        this.phase === 'racing' || this.phase === 'countdown',
      );
    }

    this.world?.update(this.shaderElapsedSec, this.camera.position);
    this.updateSunPostUniforms();

    // Push HUD telemetry at ~20Hz so React HUD stays crisp without GC spam
    this.hudAccum += dt;
    if (this.hudAccum >= 0.05 && focus) {
      this.hudAccum = 0;
      const kmh = Math.round(Math.abs(focus.speed) * 3.6);
      const gear = Math.min(5, Math.max(1, Math.floor((Math.abs(focus.speed) / 58) * 4.5) + 1));
      const driftTier: 0 | 1 | 2 | 3 =
        focus.driftCharge >= 2.2
          ? 3
          : focus.driftCharge >= 1.35
            ? 2
            : focus.driftCharge >= 0.55
              ? 1
              : 0;
      const stageProgressPct = this.track.isLoop
        ? 0
        : Math.max(0, Math.min(100, Math.round(focus.totalProgress * 100)));
      this.callbacks.onHudUpdate({
        speedKmh: kmh,
        gear,
        rank: focus.rank,
        totalRacers: this.racers.length,
        isLoop: this.track.isLoop,
        stageProgressPct,
        lap: Math.min(this.totalLaps, focus.lap),
        totalLaps: this.totalLaps,
        raceTimeMs: this.raceElapsedMs,
        bestLapMs: focus.bestLapMs,
        nitroEnergy: Math.round(focus.nitroEnergy),
        driftCharge: focus.driftCharge,
        driftTier,
        isDrifting: focus.driftDir !== 0,
        boostActive: focus.boostTimer > 0,
        offRoad: focus.offRoad,
        countdownValue:
          this.phase === 'countdown' ? Math.max(0, Math.ceil(this.countdownTimer)) : 0,
        bannerText: this.bannerText,
        minimapRacers: this.racers.map((r) => ({
          id: r.id,
          x: r.x,
          z: r.z,
          color:
            r.colorId === 'crimson'
              ? '#ef233c'
              : r.colorId === 'cobalt'
                ? '#0077ff'
                : r.colorId === 'volt'
                  ? '#38e54d'
                  : r.colorId === 'magenta'
                    ? '#ff2a85'
                    : r.colorId === 'amber'
                      ? '#ff9f1c'
                      : '#f8fafc',
          isLocal: r.isLocal,
        })),
      });
    }
  }

  private startLoop(): void {
    const afterDraw = (cb: () => void) => {
      const gl = this.renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.disposed) return;
        const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (state === gl.UNSIGNALED) {
          this.frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.frameId = window.setTimeout(cb, 80);
        }
      };
      this.frameId = window.setTimeout(poll, 5);
    };

    const tick = () => {
      if (this.disposed) return;
      const rawDt = this.clock.getDelta();
      const dt = Math.min(rawDt, 0.05);

      this.stepFrame(dt);
      if (this.isSoftwareGl || !this.composer) {
        this.renderer.render(this.scene, this.camera);
      } else {
        this.composer.render();
      }

      if (this.isSoftwareGl) {
        afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    if (this.isSoftwareGl) {
      this.frameId = window.setTimeout(tick, 16);
    } else {
      this.frameId = requestAnimationFrame(tick);
    }
  }

  private onKeyDown = (e: KeyboardEvent) => {
    // Do not hijack typing inside inputs
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    this.sound.unlock();
    this.heldKeys.add(e.code);
    this.shiftHeld = e.shiftKey;

    if (e.code === 'Escape' && (this.phase === 'racing' || this.phase === 'countdown' || this.phase === 'paused')) {
      this.callbacks.onPauseRequested();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.heldKeys.delete(e.code);
    this.shiftHeld = e.shiftKey;
  };

  private onBlur = () => {
    this.heldKeys.clear();
    this.shiftHeld = false;
  };

  private onResize = () => {
    if (this.disposed) return;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.applyPixelRatio();
  };

  private onPointerDown = (e: PointerEvent) => {
    if (this.phase !== 'title' && this.phase !== 'lobby') return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'BUTTON' || target.tagName === 'INPUT' || target.closest('button') || target.closest('input') || target.closest('.arcade-panel') || target.closest('form'))) {
      return;
    }
    this.isDragging = true;
    this.lastPointerX = e.clientX;
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.isDragging || (this.phase !== 'title' && this.phase !== 'lobby')) return;
    const deltaX = e.clientX - this.lastPointerX;
    this.lastPointerX = e.clientX;
    this.showcaseAngle -= deltaX * 0.012;
  };

  private onPointerUp = () => {
    this.isDragging = false;
  };

  private bindEvents(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('resize', this.onResize);
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    window.clearTimeout(this.frameId);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('resize', this.onResize);
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);

    this.sound.dispose();
    this.clearRaceCars();
    if (this.showcaseCar) {
      this.scene.remove(this.showcaseCar.root);
      this.showcaseCar.dispose();
    }
    if (this.world) {
      this.scene.remove(this.world.group);
      this.world.dispose();
    }
    this.particles.dispose();
    this.shadowTex.dispose();
    this.envRT.dispose();
    this.bloomPass?.dispose();
    this.postPass?.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
