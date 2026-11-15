import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Compass,
  Eraser,
  Globe,
  Move,
  Play,
  Plus,
  RotateCcw,
  Trash2,
  Undo2,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  generateTemplateControlPoints,
  TRACK_METAS,
  validateCustomTrack,
} from '../game/tracks';
import type {
  CustomLevelBoostPad,
  CustomLevelControlPoint,
  CustomLevelData,
  RaceFormat,
  TrackId,
} from '../game/types';

interface LevelEditorModalProps {
  isOpen: boolean;
  playerName: string;
  authToken?: string | null;
  onClose: () => void;
  onPlaytest: (level: CustomLevelData) => void;
  onPublished: (level: CustomLevelData) => void;
}

type EditorTool = 'add' | 'move' | 'delete' | 'boost';

export const LevelEditorModal: React.FC<LevelEditorModalProps> = ({
  isOpen,
  playerName,
  authToken = null,
  onClose,
  onPlaytest,
  onPublished,
}) => {
  const [name, setName] = useState('Mon Circuit Ultrafast');
  const [biome, setBiome] = useState<TrackId>('baie-pixel');
  const [format, setFormat] = useState<RaceFormat>('circuit');
  const [roadWidth, setRoadWidth] = useState(19);
  const [arenaRadius, setArenaRadius] = useState(54);
  const [arenaMinRadius, setArenaMinRadius] = useState(26);
  const [controlPoints, setControlPoints] = useState<CustomLevelControlPoint[]>(() =>
    generateTemplateControlPoints('gp', 'circuit'),
  );
  const [boostPads, setBoostPads] = useState<CustomLevelBoostPad[]>([
    { u: 0.25, lateralFrac: 0 },
    { u: 0.55, lateralFrac: 0.25 },
    { u: 0.82, lateralFrac: -0.2 },
  ]);
  const [history, setHistory] = useState<
    Array<{ pts: CustomLevelControlPoint[]; pads: CustomLevelBoostPad[] }>
  >([]);

  const [tool, setTool] = useState<EditorTool>('move');
  const [zoom, setZoom] = useState(0.72);
  const [pan, setPan] = useState({ x: 180, y: 0 });
  const [publishing, setPublishing] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(
    null,
  );

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragStateRef = useRef<
    | { type: 'point'; idx: number }
    | { type: 'br-pad'; idx: number }
    | { type: 'pan'; startX: number; startY: number; origPanX: number; origPanY: number }
    | null
  >(null);

  const draftLevel: CustomLevelData = useMemo(
    () => ({
      id: 'draft-preview',
      name: name.trim() || 'Niveau Perso',
      author: (playerName || 'PILOTE').trim().slice(0, 16) || 'PILOTE',
      biome,
      format,
      roadWidth,
      arenaRadius,
      arenaMinRadius: Math.min(arenaMinRadius, arenaRadius - 10),
      controlPoints,
      boostPads,
      createdAt: Date.now(),
      plays: 0,
    }),
    [
      name,
      playerName,
      biome,
      format,
      roadWidth,
      arenaRadius,
      arenaMinRadius,
      controlPoints,
      boostPads,
    ],
  );

  const validation = useMemo(() => validateCustomTrack(draftLevel), [draftLevel]);

  const pushHistory = useCallback(() => {
    setHistory((prev) => [
      ...prev.slice(-19),
      {
        pts: controlPoints.map((p) => ({ ...p })),
        pads: boostPads.map((b) => ({ ...b })),
      },
    ]);
  }, [controlPoints, boostPads]);

  const handleUndo = () => {
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setControlPoints(last.pts);
      setBoostPads(last.pads);
      return prev.slice(0, -1);
    });
  };

  const applyFormat = (nextFmt: RaceFormat) => {
    if (nextFmt === format) return;
    pushHistory();
    setFormat(nextFmt);
    setStatusMsg(null);
    if (nextFmt === 'battle-royale') {
      setBoostPads([0, 1, 2, 3].map((k) => {
        const ang = (k / 4) * Math.PI * 2 + Math.PI / 4;
        return {
          x: Math.round(Math.sin(ang) * 16),
          z: Math.round(Math.cos(ang) * 16),
          heading: ang + Math.PI * 0.6,
        };
      }));
      setPan({ x: 0, y: 0 });
      setZoom(3.0);
      if (tool === 'add' || tool === 'delete') setTool('boost');
    } else {
      const pts = generateTemplateControlPoints(
        nextFmt === 'sprint' ? 'serpent' : 'gp',
        nextFmt,
      );
      setControlPoints(pts);
      setBoostPads([
        { u: 0.24, lateralFrac: 0 },
        { u: 0.56, lateralFrac: 0.2 },
        { u: 0.84, lateralFrac: -0.2 },
      ]);
      setPan(nextFmt === 'sprint' ? { x: 20, y: -440 } : { x: 185, y: 0 });
      setZoom(nextFmt === 'sprint' ? 0.5 : 0.72);
    }
  };

  const applyTemplate = (tpl: 'oval' | 'gp' | 'serpent' | 'technique') => {
    pushHistory();
    setStatusMsg(null);
    const targetFmt = format === 'battle-royale' ? 'circuit' : format;
    if (format === 'battle-royale') setFormat('circuit');
    setControlPoints(generateTemplateControlPoints(tpl, targetFmt));
    setBoostPads([
      { u: 0.25, lateralFrac: 0 },
      { u: 0.55, lateralFrac: 0.22 },
      { u: 0.82, lateralFrac: -0.22 },
    ]);
    setPan(targetFmt === 'sprint' ? { x: 20, y: -440 } : { x: 185, y: 0 });
    setZoom(targetFmt === 'sprint' ? 0.5 : 0.72);
  };

  const handleClearTrack = () => {
    pushHistory();
    setStatusMsg(null);
    if (format === 'battle-royale') {
      setBoostPads([]);
    } else {
      setControlPoints([]);
      setBoostPads([]);
      setTool('add');
      setPan({ x: 0, y: 0 });
      setZoom(0.8);
    }
  };

  const handleReverse = () => {
    if (format === 'battle-royale' || controlPoints.length < 2) return;
    pushHistory();
    setControlPoints([...controlPoints].reverse());
    setBoostPads(boostPads.map((b) => ({ ...b, u: 1 - (b.u ?? 0.5) })));
  };

  const centerView = useCallback(() => {
    if (format === 'battle-royale') {
      setPan({ x: 0, y: 0 });
      setZoom(3.0);
      return;
    }
    if (controlPoints.length === 0) {
      setPan({ x: 0, y: 0 });
      setZoom(0.8);
      return;
    }
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of controlPoints) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }
    const cx = (minX + maxX) * 0.5;
    const cz = (minZ + maxZ) * 0.5;
    const span = Math.max(220, maxX - minX + 120, maxZ - minZ + 120);
    const canvas = canvasRef.current;
    const minDim = canvas ? Math.min(canvas.width, canvas.height) : 480;
    setPan({ x: cx, y: cz });
    setZoom(Math.max(0.28, Math.min(2.2, (minDim * 0.76) / span)));
  }, [format, controlPoints]);

  const screenToWorld = (clientX: number, clientY: number): { x: number; z: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, z: 0 };
    const rect = canvas.getBoundingClientRect();
    const sx = ((clientX - rect.left) / Math.max(1, rect.width)) * canvas.width;
    const sy = ((clientY - rect.top) / Math.max(1, rect.height)) * canvas.height;
    return {
      x: pan.x + (sx - canvas.width * 0.5) / zoom,
      z: pan.y + (sy - canvas.height * 0.5) / zoom,
    };
  };

  // Render interactive blueprint canvas
  useEffect(() => {
    if (!isOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const meta = TRACK_METAS[biome];

    ctx.fillStyle = '#070b14';
    ctx.fillRect(0, 0, w, h);

    const worldToScreen = (wx: number, wz: number) => ({
      sx: w * 0.5 + (wx - pan.x) * zoom,
      sy: h * 0.5 + (wz - pan.y) * zoom,
    });

    // World grid (50m cells)
    const step = format === 'battle-royale' ? 10 : 50;
    const halfWWorld = w / (2 * zoom);
    const halfHWorld = h / (2 * zoom);
    const xStart = Math.floor((pan.x - halfWWorld) / step) * step;
    const xEnd = Math.ceil((pan.x + halfWWorld) / step) * step;
    const zStart = Math.floor((pan.y - halfHWorld) / step) * step;
    const zEnd = Math.ceil((pan.y + halfHWorld) / step) * step;

    ctx.lineWidth = 1;
    for (let gx = xStart; gx <= xEnd; gx += step) {
      const { sx } = worldToScreen(gx, 0);
      ctx.strokeStyle = gx === 0 ? 'rgba(56,189,248,0.22)' : 'rgba(148,163,184,0.1)';
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, h);
      ctx.stroke();
    }
    for (let gz = zStart; gz <= zEnd; gz += step) {
      const { sy } = worldToScreen(0, gz);
      ctx.strokeStyle = gz === 0 ? 'rgba(56,189,248,0.22)' : 'rgba(148,163,184,0.1)';
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(w, sy);
      ctx.stroke();
    }

    if (format === 'battle-royale') {
      const c = worldToScreen(0, 0);
      const outerPx = arenaRadius * zoom;
      const minPx = Math.min(arenaMinRadius, arenaRadius - 10) * zoom;

      // Water backdrop circle glow
      ctx.fillStyle = 'rgba(14, 116, 144, 0.24)';
      ctx.beginPath();
      ctx.arc(c.sx, c.sy, outerPx + 24, 0, Math.PI * 2);
      ctx.fill();

      // Asphalt island
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = '#ffbe0b';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(c.sx, c.sy, outerPx, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Min shrink dashed circle
      ctx.setLineDash([7, 5]);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(c.sx, c.sy, minPx, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw BR Boost Pads
      boostPads.forEach((bp, idx) => {
        const px = bp.x ?? 0;
        const pz = bp.z ?? 0;
        const { sx, sy } = worldToScreen(px, pz);
        ctx.fillStyle = '#00f5ff';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx, sy, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`⚡${idx + 1}`, sx, sy);
      });
      return;
    }

    // Control polygon guide
    if (controlPoints.length >= 2) {
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      controlPoints.forEach((pt, i) => {
        const { sx, sy } = worldToScreen(pt.x, pt.z);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      if (format === 'circuit') ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Spline road preview
    const pts = validation.sampledPoints;
    if (pts.length >= 4) {
      const roadPx = Math.max(6, roadWidth * zoom);

      // Curb / border
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = validation.valid ? meta.accentColor : '#ef4444';
      ctx.lineWidth = roadPx + 5;
      ctx.beginPath();
      pts.forEach((pt, i) => {
        const { sx, sy } = worldToScreen(pt.x, pt.z);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      if (format === 'circuit') ctx.closePath();
      ctx.stroke();

      // Asphalt surface
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = roadPx;
      ctx.stroke();

      // Center dashed line
      ctx.setLineDash([8, 8]);
      ctx.strokeStyle = 'rgba(248, 250, 252, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);

      // Start/Finish marker & direction arrow
      const startIdx = format === 'circuit' ? 0 : Math.min(pts.length - 2, 10);
      const sp = pts[startIdx];
      const spNext = pts[(startIdx + 2) % pts.length];
      const sPos = worldToScreen(sp.x, sp.z);
      const ang = Math.atan2(spNext.z - sp.z, spNext.x - sp.x);
      ctx.save();
      ctx.translate(sPos.sx, sPos.sy);
      ctx.rotate(ang);
      ctx.fillStyle = '#38e54d';
      ctx.fillRect(-3, -roadPx * 0.65, 6, roadPx * 1.3);
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(3, -7);
      ctx.lineTo(3, 7);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      if (format === 'sprint') {
        const finIdx = Math.max(0, pts.length - 8);
        const fp = pts[finIdx];
        const fPos = worldToScreen(fp.x, fp.z);
        ctx.fillStyle = '#ffbe0b';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(fPos.sx, fPos.sy, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Boost pads along spline
      boostPads.forEach((bp) => {
        const u = Math.max(0.05, Math.min(0.94, bp.u ?? 0.25));
        const idx = Math.min(pts.length - 2, Math.floor(u * pts.length));
        const p0 = pts[idx];
        const p1 = pts[(idx + 1) % pts.length];
        const dx = p1.x - p0.x;
        const dz = p1.z - p0.z;
        const len = Math.hypot(dx, dz) || 1;
        const nx = -dz / len;
        const nz = dx / len;
        const lat = (bp.lateralFrac ?? 0) * (roadWidth * 0.5);
        const { sx, sy } = worldToScreen(p0.x + nx * lat, p0.z + nz * lat);
        ctx.fillStyle = '#00f5ff';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx, sy, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
    }

    // Control points handles
    controlPoints.forEach((pt, idx) => {
      const { sx, sy } = worldToScreen(pt.x, pt.z);
      ctx.fillStyle = idx === 0 ? '#38e54d' : '#ffd166';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, idx === 0 ? 9 : 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(idx + 1), sx, sy + 0.5);
    });
  }, [
    isOpen,
    biome,
    format,
    roadWidth,
    arenaRadius,
    arenaMinRadius,
    controlPoints,
    boostPads,
    validation,
    pan,
    zoom,
  ]);

  if (!isOpen) return null;

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const world = screenToWorld(e.clientX, e.clientY);
    const hitRadius = 15 / zoom;

    // Middle/right button always pans
    if (e.button === 1 || e.button === 2) {
      dragStateRef.current = {
        type: 'pan',
        startX: e.clientX,
        startY: e.clientY,
        origPanX: pan.x,
        origPanY: pan.y,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    if (format === 'battle-royale') {
      const padIdx = boostPads.findIndex(
        (bp) => Math.hypot((bp.x ?? 0) - world.x, (bp.z ?? 0) - world.z) < 12 / zoom,
      );
      if (tool === 'delete' && padIdx >= 0) {
        pushHistory();
        setBoostPads((prev) => prev.filter((_, i) => i !== padIdx));
        return;
      }
      if (padIdx >= 0 && tool === 'move') {
        pushHistory();
        dragStateRef.current = { type: 'br-pad', idx: padIdx };
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }
      if (tool === 'boost') {
        if (padIdx >= 0) {
          pushHistory();
          setBoostPads((prev) => prev.filter((_, i) => i !== padIdx));
          return;
        }
        const dist = Math.hypot(world.x, world.z);
        if (dist <= arenaRadius - 5 && boostPads.length < 16) {
          pushHistory();
          const ang = Math.atan2(world.x, world.z);
          setBoostPads((prev) => [
            ...prev,
            {
              x: Math.round(world.x * 10) / 10,
              z: Math.round(world.z * 10) / 10,
              heading: ang + Math.PI * 0.6,
            },
          ]);
        }
        return;
      }
      dragStateRef.current = {
        type: 'pan',
        startX: e.clientX,
        startY: e.clientY,
        origPanX: pan.x,
        origPanY: pan.y,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    // Check control point hit
    const ptIdx = controlPoints.findIndex(
      (p) => Math.hypot(p.x - world.x, p.z - world.z) < hitRadius,
    );

    if (tool === 'delete') {
      if (ptIdx >= 0 && controlPoints.length > 4) {
        pushHistory();
        setControlPoints((prev) => prev.filter((_, i) => i !== ptIdx));
      } else if (ptIdx === -1 && validation.sampledPoints.length >= 4) {
        // Also allow deleting nearest boost pad in delete mode
        const pts = validation.sampledPoints;
        const bIdx = boostPads.findIndex((bp) => {
          const idx = Math.min(pts.length - 1, Math.floor((bp.u ?? 0.25) * pts.length));
          return Math.hypot(pts[idx].x - world.x, pts[idx].z - world.z) < hitRadius * 1.4;
        });
        if (bIdx >= 0) {
          pushHistory();
          setBoostPads((prev) => prev.filter((_, i) => i !== bIdx));
        }
      }
      return;
    }

    if (tool === 'boost') {
      const pts = validation.sampledPoints;
      if (pts.length < 4) return;
      // Check if clicking an existing boost pad -> remove it
      const existingIdx = boostPads.findIndex((bp) => {
        const idx = Math.min(pts.length - 1, Math.floor((bp.u ?? 0.25) * pts.length));
        return Math.hypot(pts[idx].x - world.x, pts[idx].z - world.z) < hitRadius * 1.4;
      });
      if (existingIdx >= 0) {
        pushHistory();
        setBoostPads((prev) => prev.filter((_, i) => i !== existingIdx));
        return;
      }
      // Find closest spline point to snap Boost Pad onto track
      let bestIdx = 0;
      let bestD2 = Infinity;
      for (let i = 0; i < pts.length; i++) {
        const dx = pts[i].x - world.x;
        const dz = pts[i].z - world.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD2) {
          bestD2 = d2;
          bestIdx = i;
        }
      }
      if (Math.sqrt(bestD2) < roadWidth * 1.6 && boostPads.length < 18) {
        const p0 = pts[bestIdx];
        const p1 = pts[(bestIdx + 1) % pts.length];
        const dx = p1.x - p0.x;
        const dz = p1.z - p0.z;
        const len = Math.hypot(dx, dz) || 1;
        const nx = -dz / len;
        const nz = dx / len;
        const lat = ((world.x - p0.x) * nx + (world.z - p0.z) * nz) / (roadWidth * 0.5);
        pushHistory();
        setBoostPads((prev) => [
          ...prev,
          {
            u: Math.max(0.06, Math.min(0.93, bestIdx / pts.length)),
            lateralFrac: Math.max(-0.55, Math.min(0.55, Math.round(lat * 100) / 100)),
          },
        ]);
      }
      return;
    }

    if (ptIdx >= 0) {
      pushHistory();
      dragStateRef.current = { type: 'point', idx: ptIdx };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    if (tool === 'add') {
      if (controlPoints.length >= 40) return;
      pushHistory();
      setControlPoints((prev) => [
        ...prev,
        { x: Math.round(world.x), z: Math.round(world.z) },
      ]);
      return;
    }

    // Pan background in move mode
    dragStateRef.current = {
      type: 'pan',
      startX: e.clientX,
      startY: e.clientY,
      origPanX: pan.x,
      origPanY: pan.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragStateRef.current;
    if (!drag) return;
    if (drag.type === 'pan') {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / Math.max(1, rect.width);
      const scaleY = canvas.height / Math.max(1, rect.height);
      const dx = ((e.clientX - drag.startX) * scaleX) / zoom;
      const dy = ((e.clientY - drag.startY) * scaleY) / zoom;
      setPan({ x: drag.origPanX - dx, y: drag.origPanY - dy });
      return;
    }
    const world = screenToWorld(e.clientX, e.clientY);
    if (drag.type === 'point') {
      setControlPoints((prev) =>
        prev.map((p, i) =>
          i === drag.idx ? { x: Math.round(world.x), z: Math.round(world.z) } : p,
        ),
      );
    } else if (drag.type === 'br-pad') {
      const dist = Math.hypot(world.x, world.z);
      const maxR = Math.max(8, arenaRadius - 6);
      const s = dist > maxR ? maxR / dist : 1;
      const fx = Math.round(world.x * s * 10) / 10;
      const fz = Math.round(world.z * s * 10) / 10;
      const ang = Math.atan2(fx, fz);
      setBoostPads((prev) =>
        prev.map((bp, i) =>
          i === drag.idx ? { ...bp, x: fx, z: fz, heading: ang + Math.PI * 0.6 } : bp,
        ),
      );
    }
  };

  const handleCanvasPointerUp = () => {
    dragStateRef.current = null;
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    setZoom((z) => Math.max(0.25, Math.min(4.5, z * factor)));
  };

  const handlePublish = async () => {
    if (!validation.valid) {
      setStatusMsg({ kind: 'err', text: validation.reason || 'Tracé invalide.' });
      return;
    }
    if (name.trim().length < 2) {
      setStatusMsg({ kind: 'err', text: 'Entrez un nom de niveau (2 caractères min.).' });
      return;
    }
    setPublishing(true);
    setStatusMsg(null);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (authToken) {
        headers.Authorization = `Bearer ${authToken}`;
      }
      const res = await fetch('/api/levels', {
        method: 'POST',
        headers,
        body: JSON.stringify(draftLevel),
      });
      const data = (await res.json()) as { level?: CustomLevelData; error?: string };
      if (!res.ok || !data.level) {
        setStatusMsg({
          kind: 'err',
          text: data.error || 'Impossible de publier le niveau.',
        });
      } else {
        setStatusMsg({
          kind: 'ok',
          text: `Niveau "${data.level.name}" publié en ligne et intégré au jeu !`,
        });
        onPublished(data.level);
      }
    } catch {
      setStatusMsg({ kind: 'err', text: 'Erreur réseau lors de la publication.' });
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="pointer-events-auto fixed inset-0 z-30 flex items-center justify-center bg-black/80 p-3 sm:p-5">
      <div className="game-surface-solid flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden p-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-3.5">
          <div>
            <h2 className="font-display text-xl font-bold uppercase tracking-wide text-white">
              Éditeur de niveaux
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Dessinez votre tracé, testez en Solo et publiez directement en ligne
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 transition-colors hover:text-white"
            title="Fermer l'éditeur"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="mt-4 grid min-h-0 flex-1 grid-cols-1 gap-5 lg:grid-cols-12">
          {/* Left Settings & Tools */}
          <div className="flex flex-col gap-3.5 overflow-y-auto pr-1 lg:col-span-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-300">
                Nom du niveau
              </label>
              <input
                type="text"
                maxLength={32}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Grand Prix Baie"
                className="w-full border border-white/15 bg-black/40 px-3 py-2 text-sm font-semibold text-white outline-none focus:border-white/45"
              />
            </div>

            <div className="grid grid-cols-3 gap-1 bg-black/35 p-1">
              {(
                [
                  { id: 'circuit', label: 'Circuit' },
                  { id: 'sprint', label: 'Sprint' },
                  { id: 'battle-royale', label: 'Sumo BR' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => applyFormat(f.id)}
                  className={`py-1.5 text-xs font-semibold transition-colors ${
                    format === f.id
                      ? 'bg-white text-[#0b0e14]'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div>
              <div className="mb-1.5 text-xs font-semibold text-slate-300">
                Environnement
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {(Object.keys(TRACK_METAS) as TrackId[]).map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setBiome(id)}
                    className={`arcade-btn border px-2 py-2 text-xs font-semibold ${
                      biome === id
                        ? 'border-white/75 bg-white/12 text-white'
                        : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/30'
                    }`}
                  >
                    {TRACK_METAS[id].name}
                  </button>
                ))}
              </div>
            </div>

            {format === 'battle-royale' ? (
              <div className="space-y-2.5 border border-white/10 bg-black/25 p-3">
                <div>
                  <div className="flex justify-between text-xs text-slate-300">
                    <span>Rayon initial</span>
                    <span className="font-mono-num font-semibold text-[#f5b700]">
                      {arenaRadius} m
                    </span>
                  </div>
                  <input
                    type="range"
                    min={38}
                    max={72}
                    value={arenaRadius}
                    onChange={(e) => setArenaRadius(Number(e.target.value))}
                    className="mt-1 w-full accent-[#ff2e3b]"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-xs text-slate-300">
                    <span>Zone finale</span>
                    <span className="font-mono-num font-semibold text-white">
                      {Math.min(arenaMinRadius, arenaRadius - 10)} m
                    </span>
                  </div>
                  <input
                    type="range"
                    min={18}
                    max={Math.max(20, arenaRadius - 10)}
                    value={Math.min(arenaMinRadius, arenaRadius - 10)}
                    onChange={(e) => setArenaMinRadius(Number(e.target.value))}
                    className="mt-1 w-full accent-[#ff2e3b]"
                  />
                </div>
              </div>
            ) : (
              <div className="border border-white/10 bg-black/25 p-3">
                <div className="flex justify-between text-xs text-slate-300">
                  <span>Largeur de piste</span>
                  <span className="font-mono-num font-semibold text-[#f5b700]">
                    {roadWidth} m
                  </span>
                </div>
                <input
                  type="range"
                  min={14}
                  max={26}
                  value={roadWidth}
                  onChange={(e) => setRoadWidth(Number(e.target.value))}
                  className="mt-1 w-full accent-[#ff2e3b]"
                />
              </div>
            )}

            {/* Map Tools */}
            <div>
              <div className="mb-1.5 text-xs font-semibold text-slate-300">
                Outils
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {format !== 'battle-royale' && (
                  <button
                    type="button"
                    onClick={() => setTool('add')}
                    className={`arcade-btn flex items-center justify-center gap-1.5 border py-2 text-xs font-semibold ${
                      tool === 'add'
                        ? 'border-white bg-white text-[#0b0e14]'
                        : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/30'
                    }`}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Ajouter point</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setTool('move')}
                  className={`arcade-btn flex items-center justify-center gap-1.5 border py-2 text-xs font-semibold ${
                    tool === 'move'
                      ? 'border-white bg-white text-[#0b0e14]'
                      : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/30'
                  }`}
                >
                  <Move className="h-3.5 w-3.5" />
                  <span>Déplacer</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTool('boost')}
                  className={`arcade-btn flex items-center justify-center gap-1.5 border py-2 text-xs font-semibold ${
                    tool === 'boost'
                      ? 'border-[#f5b700] bg-[#f5b700] text-[#0b0e14]'
                      : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/30'
                  }`}
                >
                  <Zap className="h-3.5 w-3.5" />
                  <span>Dalle Boost</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTool('delete')}
                  className={`arcade-btn flex items-center justify-center gap-1.5 border py-2 text-xs font-semibold ${
                    tool === 'delete'
                      ? 'border-[#ff2e3b] bg-[#ff2e3b] text-white'
                      : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/30'
                  }`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Supprimer</span>
                </button>
              </div>
            </div>

            {/* Templates & Quick Actions */}
            {format !== 'battle-royale' && (
              <div>
                <div className="mb-1.5 text-xs font-semibold text-slate-300">
                  Modèles de tracé
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {(
                    [
                      { id: 'gp', label: 'Grand Prix' },
                      { id: 'oval', label: 'Ovale Rapide' },
                      { id: 'serpent', label: 'Serpentin' },
                      { id: 'technique', label: 'Technique' },
                    ] as const
                  ).map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => applyTemplate(tpl.id)}
                      className="arcade-btn border border-white/10 bg-white/[0.03] py-1.5 text-xs font-medium text-slate-300 hover:border-white/35 hover:text-white"
                    >
                      {tpl.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                disabled={history.length === 0}
                onClick={handleUndo}
                className="arcade-btn flex flex-1 items-center justify-center gap-1 border border-white/10 bg-white/[0.03] py-1.5 text-xs font-medium text-slate-200 hover:border-white/30 disabled:opacity-40"
              >
                <Undo2 className="h-3.5 w-3.5" />
                <span>Annuler</span>
              </button>
              {format !== 'battle-royale' && (
                <button
                  type="button"
                  onClick={handleReverse}
                  className="arcade-btn flex flex-1 items-center justify-center gap-1 border border-white/10 bg-white/[0.03] py-1.5 text-xs font-medium text-slate-200 hover:border-white/30"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Inverser</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleClearTrack}
                className="arcade-btn flex flex-1 items-center justify-center gap-1 border border-white/10 bg-white/[0.03] py-1.5 text-xs font-medium text-slate-300 hover:border-[#ff2e3b]/60 hover:text-white"
              >
                <Eraser className="h-3.5 w-3.5" />
                <span>Effacer</span>
              </button>
            </div>
          </div>

          {/* Right Blueprint Canvas */}
          <div className="flex min-h-[300px] flex-col gap-3 lg:col-span-8">
            <div className="relative flex-1 overflow-hidden border border-white/12 bg-[#0a0d14]">
              <canvas
                ref={canvasRef}
                width={820}
                height={500}
                onPointerDown={handleCanvasPointerDown}
                onPointerMove={handleCanvasPointerMove}
                onPointerUp={handleCanvasPointerUp}
                onContextMenu={(e) => e.preventDefault()}
                onWheel={handleWheel}
                className="h-full w-full cursor-crosshair touch-none"
              />

              {/* Zoom & Center overlay */}
              <div className="absolute right-2.5 top-2.5 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(4.5, z * 1.2))}
                  className="border border-white/15 bg-[#11151e]/90 p-1.5 text-slate-200 hover:border-white/40"
                  title="Zoom +"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(0.25, z * 0.82))}
                  className="border border-white/15 bg-[#11151e]/90 p-1.5 text-slate-200 hover:border-white/40"
                  title="Zoom -"
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={centerView}
                  className="border border-white/15 bg-[#11151e]/90 p-1.5 text-slate-200 hover:border-white/40"
                  title="Centrer la vue"
                >
                  <Compass className="h-4 w-4" />
                </button>
              </div>

              <div className="pointer-events-none absolute bottom-2.5 left-2.5 bg-black/70 px-2.5 py-1 text-[11px] text-slate-300">
                {format === 'battle-royale'
                  ? 'Cliquez avec Dalle Boost pour placer ou retirer · Glissez avec Déplacer · Molette Zoom'
                  : 'Clic gauche selon outil · Clic droit pour déplacer la vue · Molette Zoom'}
              </div>
            </div>

            {/* Validation + Publish Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
              <div className="text-xs font-medium">
                {statusMsg ? (
                  <span
                    className={
                      statusMsg.kind === 'ok' ? 'text-emerald-400' : 'text-[#ff2e3b]'
                    }
                  >
                    {statusMsg.text}
                  </span>
                ) : validation.valid ? (
                  <span className="flex items-center gap-1.5 text-slate-200">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    Prêt · {validation.lengthMeters} m · {boostPads.length} Boosts
                  </span>
                ) : (
                  <span className="text-[#ff2e3b]">{validation.reason}</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!validation.valid}
                  onClick={() => onPlaytest(draftLevel)}
                  className="arcade-btn flex items-center gap-1.5 border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:border-white/45 disabled:opacity-40"
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                  <span>Tester en Solo</span>
                </button>
                <button
                  type="button"
                  disabled={!validation.valid || publishing}
                  onClick={handlePublish}
                  className="arcade-btn flex items-center gap-1.5 bg-[#ff2e3b] px-4 py-2 font-display text-xs font-bold uppercase tracking-wide text-white hover:bg-[#ff424e] disabled:opacity-40"
                >
                  <Globe className="h-3.5 w-3.5" />
                  <span>{publishing ? 'Publication...' : 'Publier Online'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
