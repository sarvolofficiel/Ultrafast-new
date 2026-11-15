import * as THREE from 'three';
import type { CarLivery, TrackId } from './types';

function makePixelCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [canvas, ctx];
}

function finalizePixelTexture(
  canvas: HTMLCanvasElement,
  maxAniso: number,
  repeatX = 1,
  repeatY = 1,
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = Math.min(maxAniso, 8);
  tex.needsUpdate = true;
  return tex;
}

export function createAsphaltTexture(
  trackId: TrackId,
  maxAniso: number,
): THREE.CanvasTexture {
  const [canvas, ctx] = makePixelCanvas(32, 32);

  const isNeon = trackId === 'nuit-neon';
  const base = isNeon ? '#1a1d32' : trackId === 'canyon-turbo' ? '#36333a' : '#2f3542';
  const speckA = isNeon ? '#222642' : '#3b4252';
  const speckB = isNeon ? '#141729' : '#262b36';

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 32, 32);

  // Deterministic pixel asphalt grain
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const h = (x * 73 + y * 151 + x * y * 19) % 17;
      if (h === 0 || h === 5) {
        ctx.fillStyle = speckA;
        ctx.fillRect(x, y, 1, 1);
      } else if (h === 2 || h === 9) {
        ctx.fillStyle = speckB;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  // Crisp outer edge shoulder stripes
  ctx.fillStyle = isNeon ? '#00f5ff' : '#f8fafc';
  ctx.fillRect(1, 0, 1, 32);
  ctx.fillRect(30, 0, 1, 32);

  // Dashed center line
  ctx.fillStyle = isNeon ? '#ff2a85' : '#ffd166';
  ctx.fillRect(15, 2, 2, 12);
  ctx.fillRect(15, 18, 2, 12);

  return finalizePixelTexture(canvas, maxAniso, 1, 1);
}

export function createCurbTexture(
  trackId: TrackId,
  maxAniso: number,
): THREE.CanvasTexture {
  const [canvas, ctx] = makePixelCanvas(8, 16);
  const colA = trackId === 'nuit-neon' ? '#ff2a85' : '#ef233c';
  const colB = trackId === 'nuit-neon' ? '#00f5ff' : '#f8fafc';

  ctx.fillStyle = colA;
  ctx.fillRect(0, 0, 8, 8);
  ctx.fillStyle = colB;
  ctx.fillRect(0, 8, 8, 8);

  // Pixel highlight edge
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(0, 0, 1, 16);
  ctx.fillRect(7, 0, 1, 16);

  return finalizePixelTexture(canvas, maxAniso, 1, 1);
}

export function createCheckeredTexture(maxAniso: number): THREE.CanvasTexture {
  const [canvas, ctx] = makePixelCanvas(32, 8);
  for (let y = 0; y < 8; y += 2) {
    for (let x = 0; x < 32; x += 2) {
      const even = ((x / 2) + (y / 2)) % 2 === 0;
      ctx.fillStyle = even ? '#ffffff' : '#111827';
      ctx.fillRect(x, y, 2, 2);
    }
  }
  return finalizePixelTexture(canvas, maxAniso, 1, 1);
}

export function createBoostPadTexture(maxAniso: number): THREE.CanvasTexture {
  const [canvas, ctx] = makePixelCanvas(16, 32);
  ctx.fillStyle = '#090d16';
  ctx.fillRect(0, 0, 16, 32);

  // Glowing pixel chevrons pointing forward (+V)
  const colors = ['#00f5ff', '#38e54d', '#ffe600'];
  for (let c = 0; c < 3; c++) {
    ctx.fillStyle = colors[c];
    const baseY = 4 + c * 9;
    for (let i = 0; i < 7; i++) {
      ctx.fillRect(1 + i, baseY + Math.floor(i * 0.7), 2, 3);
      ctx.fillRect(13 - i, baseY + Math.floor(i * 0.7), 2, 3);
    }
  }
  // Neon side borders
  ctx.fillStyle = '#00f5ff';
  ctx.fillRect(0, 0, 1, 32);
  ctx.fillRect(15, 0, 1, 32);

  return finalizePixelTexture(canvas, maxAniso, 1, 1);
}

export function createGroundTexture(
  trackId: TrackId,
  maxAniso: number,
): THREE.CanvasTexture {
  const [canvas, ctx] = makePixelCanvas(32, 32);

  if (trackId === 'baie-pixel') {
    ctx.fillStyle = '#38a347';
    ctx.fillRect(0, 0, 32, 32);
    for (let y = 0; y < 32; y += 2) {
      for (let x = 0; x < 32; x += 2) {
        const v = (x * 17 + y * 31) % 11;
        if (v < 3) {
          ctx.fillStyle = '#2d8a3a';
          ctx.fillRect(x, y, 2, 2);
        } else if (v === 4) {
          ctx.fillStyle = '#52c459';
          ctx.fillRect(x, y, 2, 2);
        }
      }
    }
  } else if (trackId === 'canyon-turbo') {
    ctx.fillStyle = '#c86b38';
    ctx.fillRect(0, 0, 32, 32);
    for (let y = 0; y < 32; y += 2) {
      for (let x = 0; x < 32; x += 2) {
        const v = (x * 23 + y * 43) % 13;
        if (v < 3) {
          ctx.fillStyle = '#b3592a';
          ctx.fillRect(x, y, 2, 2);
        } else if (v === 5) {
          ctx.fillStyle = '#de834d';
          ctx.fillRect(x, y, 2, 2);
        }
      }
    }
  } else {
    // Nuit Néon cyber grid
    ctx.fillStyle = '#0d1021';
    ctx.fillRect(0, 0, 32, 32);
    ctx.fillStyle = '#25184d';
    ctx.fillRect(0, 0, 32, 1);
    ctx.fillRect(0, 0, 1, 32);
    ctx.fillStyle = '#181c38';
    ctx.fillRect(16, 0, 1, 32);
    ctx.fillRect(0, 16, 32, 1);
  }

  return finalizePixelTexture(canvas, maxAniso, 90, 90);
}

export function createCarRoofTexture(
  livery: CarLivery,
  maxAniso: number,
): THREE.CanvasTexture {
  const [canvas, ctx] = makePixelCanvas(32, 32);
  ctx.fillStyle = livery.primary;
  ctx.fillRect(0, 0, 32, 32);

  // Twin pixel racing stripes
  ctx.fillStyle = livery.secondary;
  ctx.fillRect(10, 0, 4, 32);
  ctx.fillRect(18, 0, 4, 32);

  // Pixel accent trim
  ctx.fillStyle = livery.accent;
  ctx.fillRect(9, 0, 1, 32);
  ctx.fillRect(22, 0, 1, 32);

  return finalizePixelTexture(canvas, maxAniso, 1, 1);
}

export function createContactShadowTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makePixelCanvas(32, 32);
  const grad = ctx.createRadialGradient(16, 16, 3, 16, 16, 15);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
  grad.addColorStop(0.65, 'rgba(0, 0, 0, 0.35)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 32, 32);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createNameBadgeTexture(
  name: string,
  accentHex: string,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 256, 64);

  ctx.fillStyle = 'rgba(10, 14, 24, 0.85)';
  ctx.fillRect(16, 12, 224, 40);

  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 4;
  ctx.strokeRect(16, 12, 224, 40);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name.slice(0, 12).toUpperCase(), 128, 33);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

export function createArenaTexture(
  trackId: TrackId,
  maxAniso: number,
): THREE.CanvasTexture {
  const size = 256;
  const [canvas, ctx] = makePixelCanvas(size, size);
  const cx = size / 2;
  const cy = size / 2;

  const isNeon = trackId === 'nuit-neon';
  const isCanyon = trackId === 'canyon-turbo';
  const base = isNeon ? '#161a30' : isCanyon ? '#332d35' : '#2a303d';
  const speckA = isNeon ? '#1e2442' : '#353d4d';
  const speckB = isNeon ? '#101324' : '#202530';

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  // Pixel asphalt grain
  for (let y = 0; y < size; y += 2) {
    for (let x = 0; x < size; x += 2) {
      const h = (x * 73 + y * 151 + x * y * 19) % 19;
      if (h === 0 || h === 7) {
        ctx.fillStyle = speckA;
        ctx.fillRect(x, y, 2, 2);
      } else if (h === 3 || h === 11) {
        ctx.fillStyle = speckB;
        ctx.fillRect(x, y, 2, 2);
      }
    }
  }

  // Orthogonal Sumo arena grid lines
  ctx.strokeStyle = isNeon ? 'rgba(0, 245, 255, 0.16)' : 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, 12);
  ctx.lineTo(cx, size - 12);
  ctx.moveTo(12, cy);
  ctx.lineTo(size - 12, cy);
  ctx.stroke();

  // Concentric Sumo rings
  const rings = [
    { r: 22, col: isNeon ? '#00f5ff' : '#ffd166', w: 3 },
    { r: 62, col: 'rgba(255, 255, 255, 0.25)', w: 2 },
    { r: 96, col: 'rgba(255, 190, 11, 0.35)', w: 3 },
    { r: 118, col: isNeon ? '#ff2a85' : '#ef233c', w: 6 },
  ];
  for (const ring of rings) {
    ctx.strokeStyle = ring.col;
    ctx.lineWidth = ring.w;
    ctx.beginPath();
    ctx.arc(cx, cy, ring.r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Center sumo emblem
  ctx.fillStyle = isNeon ? '#ff2a85' : '#ef233c';
  ctx.beginPath();
  ctx.arc(cx, cy, 8, 0, Math.PI * 2);
  ctx.fill();

  return finalizePixelTexture(canvas, maxAniso, 1, 1);
}

