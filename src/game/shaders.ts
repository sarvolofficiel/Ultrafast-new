import * as THREE from 'three';
import type { TrackId } from './types';

export interface AnimatedShaderHandle {
  update: (timeSec: number) => void;
}

export interface SunConfig {
  dir: THREE.Vector3;
  color: THREE.Color;
  haloColor: THREE.Color;
}

export function getTrackSunConfig(trackId: TrackId): SunConfig {
  if (trackId === 'canyon-turbo') {
    return {
      dir: new THREE.Vector3(-0.38, 0.24, -0.89).normalize(),
      color: new THREE.Color('#ffe2a8'),
      haloColor: new THREE.Color('#ff9d4d'),
    };
  }
  if (trackId === 'nuit-neon') {
    return {
      dir: new THREE.Vector3(0.22, 0.28, -0.93).normalize(),
      color: new THREE.Color('#dbeafe'),
      haloColor: new THREE.Color('#64748b'),
    };
  }
  return {
    dir: new THREE.Vector3(0.45, 0.44, -0.77).normalize(),
    color: new THREE.Color('#fff9e6'),
    haloColor: new THREE.Color('#ffd89b'),
  };
}

/**
 * Clean Atmospheric Sky & Sunlight Scattering Shader
 */
export function createSkyDomeMaterial(trackId: TrackId): THREE.ShaderMaterial {
  const sun = getTrackSunConfig(trackId);
  const isNight = trackId === 'nuit-neon' ? 1.0 : 0.0;

  const zenith =
    trackId === 'nuit-neon'
      ? new THREE.Color('#090d1f')
      : trackId === 'canyon-turbo'
        ? new THREE.Color('#3e355c')
        : new THREE.Color('#1c73e8');

  const midSky =
    trackId === 'nuit-neon'
      ? new THREE.Color('#151b38')
      : trackId === 'canyon-turbo'
        ? new THREE.Color('#d96846')
        : new THREE.Color('#62c0ff');

  const horizon =
    trackId === 'nuit-neon'
      ? new THREE.Color('#272b4d')
      : trackId === 'canyon-turbo'
        ? new THREE.Color('#ffd99e')
        : new THREE.Color('#c2f0ff');

  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uIsNight: { value: isNight },
      uZenith: { value: zenith },
      uMidSky: { value: midSky },
      uHorizon: { value: horizon },
      uSunColor: { value: sun.color },
      uHaloColor: { value: sun.haloColor },
      uSunDir: { value: sun.dir },
    },
    vertexShader: /* glsl */ `
      varying vec3 vLocalDir;
      void main() {
        vLocalDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uIsNight;
      uniform vec3 uZenith;
      uniform vec3 uMidSky;
      uniform vec3 uHorizon;
      uniform vec3 uSunColor;
      uniform vec3 uHaloColor;
      uniform vec3 uSunDir;
      varying vec3 vLocalDir;

      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      float noise2(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash21(i);
        float b = hash21(i + vec2(1.0, 0.0));
        float c = hash21(i + vec2(0.0, 1.0));
        float d = hash21(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      float fbm(vec2 p) {
        float v = 0.0;
        float amp = 0.55;
        for (int i = 0; i < 4; i++) {
          v += amp * noise2(p);
          p *= 2.02;
          amp *= 0.5;
        }
        return v;
      }

      void main() {
        vec3 dir = normalize(vLocalDir);
        float h = clamp(dir.y, 0.0, 1.0);

        // Smooth atmospheric sky gradient
        vec3 col = mix(uHorizon, uMidSky, smoothstep(0.0, 0.25, h));
        col = mix(col, uZenith, smoothstep(0.22, 0.85, h));

        // Mie forward scattering & soft sun halo
        float sunDot = max(0.0, dot(dir, normalize(uSunDir)));
        float wideScatter = pow(sunDot, 4.0) * mix(0.32, 0.14, uIsNight);
        float tightHalo = pow(sunDot, 36.0) * mix(0.55, 0.25, uIsNight);
        col += uHaloColor * wideScatter + uSunColor * tightHalo;

        // Crisp sun / moon disc
        float disc = smoothstep(0.9968, 0.9982, sunDot);
        col = mix(col, uSunColor * mix(1.65, 1.2, uIsNight), disc);

        // Subtle atmospheric clouds in daytime/sunset
        if (uIsNight < 0.5) {
          vec2 cloudUv = (dir.xz / (h + 0.25)) * 1.4 + vec2(uTime * 0.012, uTime * 0.004);
          float c = fbm(cloudUv * 1.35);
          float cloudMask = smoothstep(0.52, 0.72, c) * smoothstep(0.04, 0.22, h) * (1.0 - smoothstep(0.55, 0.92, h));
          vec3 cloudCol = mix(uHorizon * 1.08, uSunColor * 1.05, pow(sunDot, 3.0) * 0.65);
          col = mix(col, cloudCol, cloudMask * 0.58);
        } else {
          // Calm subtle stars at night
          vec2 starCell = floor(dir.xz / max(0.22, abs(dir.y) + 0.25) * 72.0);
          float s = hash21(starCell);
          if (s > 0.991 && h > 0.08) {
            col += vec3(0.85, 0.92, 1.0) * 0.6 * smoothstep(0.08, 0.3, h);
          }
        }

        // Horizon blending
        col = mix(col, uHorizon, exp(-h * 12.0) * 0.45);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

/**
 * Sunlit Ocean Water Shader for Baie Pixel
 * Subtle gentle waves, sun specular reflection path & shoreline foam.
 */
export function createOceanMaterial(
  fogColor: string,
  fogDensity: number,
  islandRadius: number,
  centerX: number,
  centerZ: number,
  trackId: TrackId,
): THREE.ShaderMaterial {
  const sun = getTrackSunConfig(trackId);
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uFogColor: { value: new THREE.Color(fogColor) },
      uFogDensity: { value: fogDensity },
      uIslandRadius: { value: islandRadius },
      uCenter: { value: new THREE.Vector2(centerX, centerZ) },
      uSunDir: { value: sun.dir },
      uSunColor: { value: sun.color },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vWorldPos;
      varying float vFogDepth;

      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        float wave = sin(worldPos.x * 0.07 + uTime * 1.4) * 0.1
                   + cos(worldPos.z * 0.08 - uTime * 1.1) * 0.09;
        worldPos.y += wave;
        vWorldPos = worldPos.xyz;
        vec4 mvPos = viewMatrix * worldPos;
        vFogDepth = -mvPos.z;
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uFogColor;
      uniform float uFogDensity;
      uniform float uIslandRadius;
      uniform vec2 uCenter;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      varying vec3 vWorldPos;
      varying float vFogDepth;

      void main() {
        float w1 = sin(vWorldPos.x * 0.16 + uTime * 1.7) * cos(vWorldPos.z * 0.16 - uTime * 1.3);
        float w2 = sin((vWorldPos.x + vWorldPos.z) * 0.24 - uTime * 2.1);
        vec3 rippleNormal = normalize(vec3((w1 + w2) * 0.09, 1.0, (w1 - w2) * 0.09));

        float distFromCenter = length(vWorldPos.xz - uCenter);
        float shoreDist = abs(distFromCenter - (uIslandRadius + 24.0));
        float shallowMask = smoothstep(65.0, 0.0, distFromCenter - uIslandRadius);

        vec3 deepCol = vec3(0.02, 0.38, 0.68);
        vec3 shallowCol = vec3(0.06, 0.72, 0.85);
        vec3 waterCol = mix(deepCol, shallowCol, shallowMask);

        // Sunlight specular sparkle across waves
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        vec3 halfVec = normalize(normalize(uSunDir) + viewDir);
        float sunSpec = pow(max(0.0, dot(rippleNormal, halfVec)), 96.0);
        waterCol += uSunColor * sunSpec * 0.85;

        // Soft shoreline foam
        float foamWave = sin(shoreDist * 0.42 - uTime * 2.5);
        float foam = smoothstep(26.0, 3.0, shoreDist) * smoothstep(0.35, 0.65, foamWave + 0.3);
        waterCol = mix(waterCol, vec3(0.92, 0.98, 1.0), foam * 0.55);

        // Sky Fresnel reflection
        float fresnel = pow(1.0 - max(0.0, dot(viewDir, rippleNormal)), 3.5);
        waterCol = mix(waterCol, uFogColor * 0.92, fresnel * 0.35);

        float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
        waterCol = mix(waterCol, uFogColor, clamp(fogFactor, 0.0, 1.0));

        gl_FragColor = vec4(waterCol, 1.0);
      }
    `,
  });
}

/**
 * Adds directional sunlight specular sheen to the asphalt road MeshStandardMaterial
 * while keeping full PBR shadows intact.
 */
export function extendRoadAsphaltMaterial(
  mat: THREE.MeshStandardMaterial,
  trackId: TrackId,
): void {
  const sun = getTrackSunConfig(trackId);
  const specStrength = trackId === 'nuit-neon' ? 0.16 : 0.28;

  mat.customProgramCacheKey = () => `road-sunlight-${trackId}`;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSunDir = { value: sun.dir };
    shader.uniforms.uSunColor = { value: sun.color };
    shader.uniforms.uSpecStrength = { value: specStrength };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vRoadWorld;`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vRoadWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform float uSpecStrength;
        varying vec3 vRoadWorld;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        vec3 viewW = normalize(cameraPosition - vRoadWorld);
        vec3 halfSun = normalize(normalize(uSunDir) + viewW);
        float sunGlint = pow(max(0.0, dot(vec3(0.0, 1.0, 0.0), halfSun)), 28.0);
        float grazing = pow(1.0 - clamp(viewW.y, 0.0, 1.0), 2.5);
        totalEmissiveRadiance += uSunColor * sunGlint * grazing * uSpecStrength;`,
      );
  };
}

/**
 * Adds a crisp sunlight rim catchlight to car MeshPhysicalMaterial clearcoat paint.
 */
export function extendCarPaintMaterial(
  mat: THREE.MeshPhysicalMaterial,
  trackId: TrackId,
  cacheTag: string,
): void {
  const sun = getTrackSunConfig(trackId);

  mat.customProgramCacheKey = () => `car-sunlight-${trackId}-${cacheTag}`;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSunDir = { value: sun.dir };
    shader.uniforms.uSunColor = { value: sun.color };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vCarWorldPos;
        varying vec3 vCarWorldNormal;`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vCarWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vCarWorldNormal = normalize((modelMatrix * vec4(objectNormal, 0.0)).xyz);`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        varying vec3 vCarWorldPos;
        varying vec3 vCarWorldNormal;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        vec3 viewVec = normalize(cameraPosition - vCarWorldPos);
        vec3 nW = normalize(vCarWorldNormal);
        float fresnel = pow(1.0 - max(0.0, dot(viewVec, nW)), 3.2);
        float sunFacing = max(0.15, dot(nW, normalize(uSunDir)) * 0.5 + 0.5);
        totalEmissiveRadiance += uSunColor * fresnel * sunFacing * 0.22;`,
      );
  };
}

/**
 * Subtle Sunlight Optical Glare & Atmospheric Light Shader (Post-Processing)
 * Only applies gentle warm sun scattering when looking toward the sun — zero neon/CRT clutter.
 */
export const SunLightPostShader = {
  uniforms: {
    tDiffuse: { value: null },
    uSunScreenPos: { value: new THREE.Vector2(0.5, 0.7) },
    uSunWeight: { value: 0.0 },
    uSunColor: { value: new THREE.Color('#ffe6b3') },
    uAspect: { value: 1.77 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uSunScreenPos;
    uniform float uSunWeight;
    uniform vec3 uSunColor;
    uniform float uAspect;
    varying vec2 vUv;

    void main() {
      vec3 col = texture2D(tDiffuse, vUv).rgb;

      if (uSunWeight > 0.01) {
        vec2 delta = vUv - uSunScreenPos;
        delta.x *= uAspect;
        float d = length(delta);

        // Soft atmospheric sun bloom & gentle crepuscular veil
        float halo = exp(-d * 3.8) * 0.22 + exp(-d * 1.4) * 0.08;
        col += uSunColor * halo * uSunWeight;
      }

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `,
};
