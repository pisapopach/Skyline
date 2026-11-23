import type { AirDefenseId, BuildingId, MunitionId } from '../data/munitions';
import type { RussianAircraftId } from '../data/airfields';

// Cached offscreen canvases & data URLs (populated lazily on first use in browser)
const buildingCanvasCache: Partial<Record<BuildingId | 'airfield', HTMLCanvasElement>> = {};
const buildingUrlCache: Partial<Record<BuildingId | 'airfield', string>> = {};

const munitionCanvasCache: Partial<Record<MunitionId, HTMLCanvasElement>> = {};
const munitionUrlCache: Partial<Record<MunitionId, string>> = {};

const aircraftCanvasCache: Partial<Record<RussianAircraftId, HTMLCanvasElement>> = {};
const aircraftUrlCache: Partial<Record<RussianAircraftId, string>> = {};

const launcherUrlCache: Partial<Record<MunitionId, string>> = {};
const pvoUrlCache: Partial<Record<AirDefenseId, string>> = {};

let cachedNoisePattern: CanvasPattern | null | undefined = undefined;

function getNoisePattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  if (cachedNoisePattern !== undefined) return cachedNoisePattern;
  if (typeof document === 'undefined') {
    cachedNoisePattern = null;
    return null;
  }
  const nc = document.createElement('canvas');
  nc.width = 64;
  nc.height = 64;
  const nctx = nc.getContext('2d');
  if (!nctx) {
    cachedNoisePattern = null;
    return null;
  }
  const img = nctx.createImageData(64, 64);
  let seed = 1337;
  for (let i = 0; i < img.data.length; i += 4) {
    seed = (seed * 16807) % 2147483647;
    const v = seed & 255;
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 14;
  }
  nctx.putImageData(img, 0, 0);
  cachedNoisePattern = ctx.createPattern(nc, 'repeat');
  return cachedNoisePattern;
}

// ============================================================================
// 3D ISOMETRIC MINIATURE DIORAMA ENGINE (Buildings + Airfield)
// ============================================================================

interface IsoProj {
  cx: number;
  cy: number;
  sx: number;
  sy: number;
  sz: number;
}

function iso(p: IsoProj, wx: number, wy: number, wz = 0): [number, number] {
  return [
    p.cx + (wx - wy) * 0.866 * p.sx,
    p.cy + (wx + wy) * 0.45 * p.sy - wz * p.sz,
  ];
}

function drawPoly(
  ctx: CanvasRenderingContext2D,
  pts: Array<[number, number]>,
  fill: string | CanvasGradient,
  stroke?: string,
  lineWidth = 0.7,
) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i][0], pts[i][1]);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}

function drawIsoShadow(
  ctx: CanvasRenderingContext2D,
  p: IsoProj,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  height: number,
  zBase = 0,
  alpha = 0.34,
) {
  const dx = height * 0.55;
  const dy = height * 0.28;
  ctx.save();
  ctx.fillStyle = `rgba(5, 8, 14, ${alpha})`;
  drawPoly(
    ctx,
    [
      iso(p, x1, y0, zBase),
      iso(p, x1 + dx, y0 + dy, zBase),
      iso(p, x1 + dx, y1 + dy, zBase),
      iso(p, x0 + dx, y1 + dy, zBase),
      iso(p, x0, y1, zBase),
      iso(p, x1, y1, zBase),
    ],
    `rgba(5, 8, 14, ${alpha})`,
  );
  ctx.restore();
}

function drawIsoBox(
  ctx: CanvasRenderingContext2D,
  p: IsoProj,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  z0: number,
  z1: number,
  colors: {
    top: string;
    left: string;
    right: string;
    edge?: string;
    shadowAlpha?: number;
  },
) {
  if ((colors.shadowAlpha ?? 0.28) > 0) {
    drawIsoShadow(ctx, p, x0, y0, x1, y1, z1 - z0, z0, colors.shadowAlpha ?? 0.28);
  }
  const edge = colors.edge ?? 'rgba(15, 20, 28, 0.48)';
  // Left-front face (wy = y1)
  drawPoly(
    ctx,
    [iso(p, x0, y1, z0), iso(p, x1, y1, z0), iso(p, x1, y1, z1), iso(p, x0, y1, z1)],
    colors.left,
    edge,
    0.65,
  );
  // Right-front face (wx = x1)
  drawPoly(
    ctx,
    [iso(p, x1, y0, z0), iso(p, x1, y1, z0), iso(p, x1, y1, z1), iso(p, x1, y0, z1)],
    colors.right,
    edge,
    0.65,
  );
  // Top face (z = z1)
  const pTopNW = iso(p, x0, y0, z1);
  const pTopSE = iso(p, x1, y1, z1);
  const gTop = ctx.createLinearGradient(pTopNW[0], pTopNW[1], pTopSE[0], pTopSE[1]);
  gTop.addColorStop(0, colors.top);
  gTop.addColorStop(1, colors.left);
  drawPoly(
    ctx,
    [iso(p, x0, y0, z1), iso(p, x1, y0, z1), iso(p, x1, y1, z1), iso(p, x0, y1, z1)],
    gTop,
    edge,
    0.65,
  );
}

function drawIsoBasePad(
  ctx: CanvasRenderingContext2D,
  p: IsoProj,
  size: number,
  surfaceA: string,
  surfaceB: string,
  skirtLeft = '#30363D',
  skirtRight = '#1F2429',
) {
  const s = size;
  const thick = 6.5;
  // Ground ambient shadow under diorama slab
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
  drawPoly(
    ctx,
    [
      iso(p, -s + 3, -s + 3, -thick - 1),
      iso(p, s + 4, -s + 3, -thick - 1),
      iso(p, s + 4, s + 4, -thick - 1),
      iso(p, -s + 3, s + 4, -thick - 1),
    ],
    'rgba(0, 0, 0, 0.42)',
  );
  ctx.restore();

  // Slab skirts
  drawPoly(
    ctx,
    [iso(p, -s, s, -thick), iso(p, s, s, -thick), iso(p, s, s, 0), iso(p, -s, s, 0)],
    skirtLeft,
    'rgba(10, 14, 20, 0.65)',
    0.8,
  );
  drawPoly(
    ctx,
    [iso(p, s, -s, -thick), iso(p, s, s, -thick), iso(p, s, s, 0), iso(p, s, -s, 0)],
    skirtRight,
    'rgba(10, 14, 20, 0.65)',
    0.8,
  );

  // Top terrain surface
  const pNW = iso(p, -s, -s, 0);
  const pSE = iso(p, s, s, 0);
  const grad = ctx.createLinearGradient(pNW[0], pNW[1], pSE[0], pSE[1]);
  grad.addColorStop(0, surfaceA);
  grad.addColorStop(1, surfaceB);
  drawPoly(
    ctx,
    [iso(p, -s, -s, 0), iso(p, s, -s, 0), iso(p, s, s, 0), iso(p, -s, s, 0)],
    grad,
    'rgba(255, 255, 255, 0.14)',
    0.8,
  );

  const pat = getNoisePattern(ctx);
  if (pat) {
    ctx.save();
    ctx.beginPath();
    const pts = [iso(p, -s, -s, 0), iso(p, s, -s, 0), iso(p, s, s, 0), iso(p, -s, s, 0)];
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fillStyle = pat;
    ctx.fill();
    ctx.restore();
  }
}

function drawIsoCylinder(
  ctx: CanvasRenderingContext2D,
  p: IsoProj,
  wx: number,
  wy: number,
  z0: number,
  z1: number,
  radius: number,
  cLight: string,
  cMid: string,
  cDark: string,
  cTop: string,
  stripeColor?: string,
) {
  const [bx, by] = iso(p, wx, wy, z0);
  const [tx, ty] = iso(p, wx, wy, z1);
  const rx = radius * 1.12 * p.sx;
  const ry = radius * 0.56 * p.sy;

  // Cast shadow
  ctx.save();
  ctx.fillStyle = 'rgba(5, 8, 14, 0.34)';
  ctx.beginPath();
  ctx.ellipse(bx + (z1 - z0) * 0.42, by + (z1 - z0) * 0.22, rx * 1.15, ry * 1.05, 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const grad = ctx.createLinearGradient(bx - rx, by, bx + rx, by);
  grad.addColorStop(0, cMid);
  grad.addColorStop(0.28, cLight);
  grad.addColorStop(0.68, cMid);
  grad.addColorStop(1, cDark);

  ctx.beginPath();
  ctx.moveTo(bx - rx, by);
  ctx.lineTo(tx - rx, ty);
  ctx.ellipse(tx, ty, rx, ry, 0, Math.PI, 0, false);
  ctx.lineTo(bx + rx, by);
  ctx.ellipse(bx, by, rx, ry, 0, 0, Math.PI, false);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(15, 20, 28, 0.5)';
  ctx.lineWidth = 0.65;
  ctx.stroke();

  if (stripeColor) {
    const sy = ty + (by - ty) * 0.28;
    ctx.save();
    ctx.strokeStyle = stripeColor;
    ctx.lineWidth = Math.max(1.8, (by - ty) * 0.1);
    ctx.beginPath();
    ctx.ellipse(tx, sy, rx * 0.98, ry * 0.96, 0, 0.08, Math.PI - 0.08);
    ctx.stroke();
    ctx.restore();
  }

  // Top cap
  ctx.beginPath();
  ctx.ellipse(tx, ty, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = cTop;
  ctx.fill();
  ctx.strokeStyle = 'rgba(20, 26, 34, 0.45)';
  ctx.lineWidth = 0.6;
  ctx.stroke();
}

function drawIsoTree(ctx: CanvasRenderingContext2D, p: IsoProj, wx: number, wy: number, scale = 1) {
  const [tx, ty] = iso(p, wx, wy, 0);
  const r = 5.5 * scale;
  ctx.fillStyle = 'rgba(4, 8, 12, 0.34)';
  ctx.beginPath();
  ctx.ellipse(tx + 3.5 * scale, ty + 2 * scale, r * 1.1, r * 0.65, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#4E3B2B';
  ctx.fillRect(tx - 1.1 * scale, ty - 4.5 * scale, 2.2 * scale, 4.5 * scale);

  const g = ctx.createRadialGradient(tx - r * 0.35, ty - 8 * scale, r * 0.15, tx, ty - 6.5 * scale, r * 1.2);
  g.addColorStop(0, '#6B9A4A');
  g.addColorStop(0.55, '#477032');
  g.addColorStop(1, '#2B471E');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(tx, ty - 6.5 * scale, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawIsoVehicle(
  ctx: CanvasRenderingContext2D,
  p: IsoProj,
  wx: number,
  wy: number,
  colorTop: string,
  colorSide: string,
  alongX = true,
  len = 8,
  wid = 4.2,
  ht = 3.6,
) {
  const x0 = alongX ? wx - len / 2 : wx - wid / 2;
  const x1 = alongX ? wx + len / 2 : wx + wid / 2;
  const y0 = alongX ? wy - wid / 2 : wy - len / 2;
  const y1 = alongX ? wy + wid / 2 : wy + len / 2;
  drawIsoBox(ctx, p, x0, y0, x1, y1, 0.6, ht, {
    top: colorTop,
    left: colorSide,
    right: '#222831',
    shadowAlpha: 0.25,
  });
}

function bakeBuildingDiorama(kind: BuildingId | 'airfield'): HTMLCanvasElement {
  const W = 280;
  const H = 216;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const p: IsoProj = { cx: W / 2, cy: H * 0.57, sx: 1.0, sy: 1.0, sz: 1.0 };

  if (kind === 'oil-depot') {
    drawIsoBasePad(ctx, p, 58, '#4E5649', '#3B4237', '#2E342B', '#20241E');
    // Concrete tank bund floor
    drawPoly(
      ctx,
      [iso(p, -46, -46, 0.3), iso(p, 46, -46, 0.3), iso(p, 46, 38, 0.3), iso(p, -46, 38, 0.3)],
      '#6E747B',
      '#2B3138',
      0.7,
    );
    // Access road
    drawPoly(
      ctx,
      [iso(p, -52, 41, 0.4), iso(p, 52, 41, 0.4), iso(p, 52, 53, 0.4), iso(p, -52, 53, 0.4)],
      '#353B42',
    );
    // 4 Cylindrical white/silver fuel storage tanks with red hazard bands
    drawIsoCylinder(ctx, p, -24, -24, 0.4, 23, 14, '#E2E8F0', '#B8C2CC', '#78828D', '#D1DAE2', '#B91C1C');
    drawIsoCylinder(ctx, p, 12, -24, 0.4, 23, 14, '#E2E8F0', '#B8C2CC', '#78828D', '#D1DAE2', '#B91C1C');
    drawIsoCylinder(ctx, p, -24, 10, 0.4, 21, 13, '#DCE3EB', '#AEB8C2', '#707A85', '#CBD4DD', '#D97706');
    // Distillation unit + tall flare stack + pipe bridge
    drawIsoCylinder(ctx, p, 33, 6, 0.4, 42, 4.5, '#D1D8DF', '#98A2AC', '#586069', '#BCC4CD');
    drawIsoCylinder(ctx, p, 22, 16, 0.4, 34, 4.0, '#CBD3DB', '#8E98A2', '#525A63', '#B4BDC7');
    drawIsoBox(ctx, p, -3, 14, 15, 28, 0.4, 11, {
      top: '#7B848E',
      left: '#5B646E',
      right: '#3E454E',
    });
    // Overhead steel pipe bridge
    drawIsoBox(ctx, p, -22, -6, 22, -3, 11, 13.5, {
      top: '#A6AFB8',
      left: '#737C86',
      right: '#4A525B',
      shadowAlpha: 0.12,
    });
    // Fuel tanker truck on road
    drawIsoVehicle(ctx, p, -10, 47, '#D97706', '#92400E', true, 14, 5.5, 5.5);
    drawIsoVehicle(ctx, p, 18, 47, '#CBD5E1', '#64748B', true, 10, 5, 4.5);
    drawIsoTree(ctx, p, -49, -49, 0.9);
    drawIsoTree(ctx, p, 50, -48, 0.85);
  } else if (kind === 'factory') {
    drawIsoBasePad(ctx, p, 58, '#4D5549', '#394035');
    // Concrete industrial yard
    drawPoly(
      ctx,
      [iso(p, -48, -44, 0.3), iso(p, 48, -44, 0.3), iso(p, 48, 48, 0.3), iso(p, -48, 48, 0.3)],
      '#5C636B',
      '#2B3138',
      0.7,
    );
    // Tall red/white industrial smokestacks
    drawIsoCylinder(ctx, p, -34, -26, 0.5, 54, 4.2, '#D8DEE6', '#9CA5B0', '#586068', '#333A42', '#B91C1C');
    drawIsoCylinder(ctx, p, -20, -32, 0.5, 46, 3.6, '#D8DEE6', '#9CA5B0', '#586068', '#333A42', '#B91C1C');
    // Main heavy assembly hall + sawtooth roof bays
    drawIsoBox(ctx, p, -36, -18, 22, 22, 0.5, 20, {
      top: '#848E99',
      left: '#606872',
      right: '#3E454E',
    });
    // Sawtooth skylights on factory roof
    for (const bx of [-30, -14, 2]) {
      drawIsoBox(ctx, p, bx, -15, bx + 11, 19, 20, 26, {
        top: '#9CA6B0',
        left: '#4A6278',
        right: '#3C434D',
        shadowAlpha: 0.14,
      });
    }
    // Side logistics warehouse + loading bay doors
    drawIsoBox(ctx, p, 24, -12, 44, 24, 0.5, 14, {
      top: '#78828D',
      left: '#535B64',
      right: '#353C44',
    });
    // Parked cargo trucks at dock
    drawIsoVehicle(ctx, p, -16, 34, '#E2E8F0', '#94A3B8', false, 13, 5.5, 5.5);
    drawIsoVehicle(ctx, p, -2, 34, '#3B82F6', '#1E3A8A', false, 13, 5.5, 5.5);
    drawIsoVehicle(ctx, p, 14, 34, '#D97706', '#78350F', false, 12, 5.2, 5.2);
    drawIsoTree(ctx, p, 49, -46, 0.9);
    drawIsoTree(ctx, p, -49, 46, 0.9);
  } else if (kind === 'gas-station') {
    drawIsoBasePad(ctx, p, 56, '#4F5A49', '#3A4336');
    // Asphalt station forecourt
    drawPoly(
      ctx,
      [iso(p, -50, -42, 0.3), iso(p, 50, -42, 0.3), iso(p, 50, 48, 0.3), iso(p, -50, 48, 0.3)],
      '#394048',
      '#22272D',
      0.7,
    );
    // Convenience shop building in back-left
    drawIsoBox(ctx, p, -40, -34, -4, -12, 0.4, 15, {
      top: '#949EA8',
      left: '#606B76',
      right: '#3E4650',
    });
    // Glass storefront accent
    drawPoly(
      ctx,
      [iso(p, -36, -12, 2), iso(p, -8, -12, 2), iso(p, -8, -12, 11), iso(p, -36, -12, 11)],
      '#3A6482',
      '#1C252E',
      0.6,
    );
    // Fuel dispenser islands under canopy
    for (const dx of [-14, 8]) {
      drawIsoBox(ctx, p, dx, 4, dx + 6, 16, 0.4, 6.5, {
        top: '#CBD5E1',
        left: '#64748B',
        right: '#475569',
        shadowAlpha: 0.18,
      });
    }
    // Canopy pillars
    for (const [px, py] of [
      [-18, -2],
      [18, -2],
      [-18, 22],
      [18, 22],
    ]) {
      drawIsoBox(ctx, p, px, py, px + 2.5, py + 2.5, 0.4, 19, {
        top: '#94A3B8',
        left: '#64748B',
        right: '#475569',
        shadowAlpha: 0.1,
      });
    }
    // Iconic illuminated fuel canopy roof (orange/amber fascia + crisp white deck)
    drawIsoBox(ctx, p, -24, -6, 26, 26, 19, 24.5, {
      top: '#D8DEE6',
      left: '#D97706',
      right: '#9A3412',
      shadowAlpha: 0.38,
    });
    // Tall roadside price pylon sign
    drawIsoBox(ctx, p, 34, 28, 41, 35, 0.4, 30, {
      top: '#1E293B',
      left: '#F59E0B',
      right: '#B45309',
    });
    // Refueling cars
    drawIsoVehicle(ctx, p, -4, 10, '#E2E8F0', '#94A3B8', false, 10, 4.8, 4);
    drawIsoVehicle(ctx, p, 22, 10, '#EF4444', '#991B1B', false, 10, 4.8, 4);
    drawIsoTree(ctx, p, 42, -38, 0.95);
    drawIsoTree(ctx, p, -44, 38, 0.9);
  } else if (kind === 'residential') {
    drawIsoBasePad(ctx, p, 58, '#4F5E48', '#3B4635');
    // Paved courtyard & street
    drawPoly(
      ctx,
      [iso(p, -46, 20, 0.3), iso(p, 48, 20, 0.3), iso(p, 48, 48, 0.3), iso(p, -46, 48, 0.3)],
      '#40464E',
    );
    // Tall 9-story L-shaped residential block
    drawIsoBox(ctx, p, -36, -36, 10, 12, 0.5, 44, {
      top: '#8A949E',
      left: '#727C86',
      right: '#4B535C',
    });
    // Adjacent mid-rise residential wing
    drawIsoBox(ctx, p, 10, -28, 40, 14, 0.5, 32, {
      top: '#9AA4AE',
      left: '#6B747E',
      right: '#434B54',
    });
    // Rooftop elevator shafts / HVAC units
    drawIsoBox(ctx, p, -22, -22, -6, -8, 44, 50, {
      top: '#78828C',
      left: '#565F68',
      right: '#383F47',
      shadowAlpha: 0.14,
    });
    drawIsoBox(ctx, p, 18, -14, 30, -2, 32, 37, {
      top: '#78828C',
      left: '#565F68',
      right: '#383F47',
      shadowAlpha: 0.14,
    });
    // Windows grid on left & right walls
    for (let floor = 0; floor < 5; floor++) {
      const fz = 6 + floor * 7.2;
      for (const wx of [-30, -20, -10, 0]) {
        const lit = (floor + wx) % 3 === 0;
        drawPoly(
          ctx,
          [iso(p, wx, 12.1, fz), iso(p, wx + 6, 12.1, fz), iso(p, wx + 6, 12.1, fz + 4.2), iso(p, wx, 12.1, fz + 4.2)],
          lit ? '#E8C574' : '#26313D',
        );
      }
      for (const wy of [-22, -11, 0]) {
        const lit = (floor + wy) % 2 === 0;
        drawPoly(
          ctx,
          [iso(p, 40.1, wy, Math.min(fz, 25)), iso(p, 40.1, wy + 7, Math.min(fz, 25)), iso(p, 40.1, wy + 7, Math.min(fz + 4, 29)), iso(p, 40.1, wy, Math.min(fz + 4, 29))],
          lit ? '#D4AF5A' : '#1E2732',
        );
      }
    }
    drawIsoVehicle(ctx, p, -20, 34, '#CBD5E1', '#64748B', true, 10, 4.6, 3.8);
    drawIsoVehicle(ctx, p, 6, 34, '#3B82F6', '#1D4ED8', true, 10, 4.6, 3.8);
    drawIsoTree(ctx, p, -46, -24, 1.0);
    drawIsoTree(ctx, p, -45, 8, 0.9);
    drawIsoTree(ctx, p, 46, 34, 1.0);
  } else if (kind === 'power-plant') {
    drawIsoBasePad(ctx, p, 58, '#4A5448', '#353E34');
    drawPoly(
      ctx,
      [iso(p, -48, -46, 0.3), iso(p, 48, -46, 0.3), iso(p, 48, 46, 0.3), iso(p, -48, 46, 0.3)],
      '#586068',
      '#2B3138',
      0.7,
    );
    // Two hyperbolic concrete cooling towers
    for (const [cxw, cyw] of [
      [-26, -22],
      [-2, -32],
    ]) {
      const [bx, by] = iso(p, cxw, cyw, 0.5);
      const [tx, ty] = iso(p, cxw, cyw, 42);
      ctx.fillStyle = 'rgba(5, 8, 14, 0.34)';
      ctx.beginPath();
      ctx.ellipse(bx + 18, by + 9, 17, 9, 0.35, 0, Math.PI * 2);
      ctx.fill();
      const grad = ctx.createLinearGradient(bx - 16, by, bx + 16, by);
      grad.addColorStop(0, '#A8B1BA');
      grad.addColorStop(0.3, '#DCE3EA');
      grad.addColorStop(0.7, '#949EA8');
      grad.addColorStop(1, '#586068');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(bx - 16, by);
      ctx.quadraticCurveTo(bx - 10, (by + ty) * 0.55, tx - 11.5, ty);
      ctx.ellipse(tx, ty, 11.5, 5.5, 0, Math.PI, 0, false);
      ctx.quadraticCurveTo(bx + 10, (by + ty) * 0.55, bx + 16, by);
      ctx.ellipse(bx, by, 16, 7.5, 0, 0, Math.PI, false);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(18, 24, 32, 0.5)';
      ctx.lineWidth = 0.7;
      ctx.stroke();

      ctx.fillStyle = '#1E242B';
      ctx.beginPath();
      ctx.ellipse(tx, ty, 10.5, 4.8, 0, 0, Math.PI * 2);
      ctx.fill();
      // Subtle steam wisp
      ctx.fillStyle = 'rgba(226, 232, 240, 0.32)';
      ctx.beginPath();
      ctx.arc(tx + 3, ty - 6, 7, 0, Math.PI * 2);
      ctx.arc(tx + 9, ty - 11, 5.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Red-white power plant stack
    drawIsoCylinder(ctx, p, 30, -24, 0.5, 50, 3.6, '#DCE3EA', '#9CA5AF', '#586068', '#2A3038', '#DC2626');
    // Main turbine generator hall
    drawIsoBox(ctx, p, -32, 8, 22, 34, 0.5, 22, {
      top: '#7D8792',
      left: '#57606A',
      right: '#383F47',
    });
    // Outdoor high-voltage transformer substation yard
    for (const txw of [-10, 8, 26]) {
      drawIsoBox(ctx, p, txw, 36, txw + 9, 44, 0.5, 9, {
        top: '#94A3B8',
        left: '#64748B',
        right: '#334155',
      });
    }
    // Yellow high-voltage gantry busbars
    drawIsoBox(ctx, p, -12, 39, 36, 41, 13, 15, {
      top: '#EAB308',
      left: '#CA8A04',
      right: '#854D0E',
      shadowAlpha: 0.1,
    });
  } else if (kind === 'ammo-depot') {
    drawIsoBasePad(ctx, p, 58, '#46523C', '#333D2B');
    // Dirt perimeter road inside fortified depot
    drawPoly(
      ctx,
      [iso(p, -44, -44, 0.3), iso(p, 44, -44, 0.3), iso(p, 44, 44, 0.3), iso(p, -44, 44, 0.3)],
      '#585547',
      '#2E2C24',
      0.7,
    );
    // Earth-bermed concrete ammunition bunkers (arch/trapezoid roofs + blast doors)
    drawIsoBox(ctx, p, -36, -34, -4, -6, 0.4, 15, {
      top: '#5A684C',
      left: '#48523E',
      right: '#2E3628',
    });
    drawIsoBox(ctx, p, 8, -34, 40, -6, 0.4, 15, {
      top: '#5A684C',
      left: '#48523E',
      right: '#2E3628',
    });
    // Concrete bunker portals
    drawPoly(
      ctx,
      [iso(p, -28, -5.8, 0.5), iso(p, -12, -5.8, 0.5), iso(p, -12, -5.8, 11), iso(p, -28, -5.8, 11)],
      '#23282D',
      '#68727A',
      0.8,
    );
    drawPoly(
      ctx,
      [iso(p, 16, -5.8, 0.5), iso(p, 32, -5.8, 0.5), iso(p, 32, -5.8, 11), iso(p, 16, -5.8, 11)],
      '#23282D',
      '#68727A',
      0.8,
    );
    // Reinforced storage hangar + sandbag/concrete blast walls
    drawIsoBox(ctx, p, -34, 10, 6, 36, 0.4, 17, {
      top: '#636D56',
      left: '#49523F',
      right: '#2F3629',
    });
    // Guard watchtower
    drawIsoBox(ctx, p, 34, 24, 42, 32, 0.4, 26, {
      top: '#788070',
      left: '#52594B',
      right: '#343930',
    });
    // Military logistics trucks & olive ammo crate pallets
    drawIsoVehicle(ctx, p, 18, 22, '#556347', '#38422E', false, 14, 5.8, 5.5);
    drawIsoBox(ctx, p, 12, 34, 24, 40, 0.4, 5, {
      top: '#808A52',
      left: '#5B633A',
      right: '#3D4226',
    });
    drawIsoTree(ctx, p, -48, -44, 0.95);
    drawIsoTree(ctx, p, 48, -42, 0.9);
  } else if (kind === 'port') {
    drawIsoBasePad(ctx, p, 58, '#234C63', '#163447', '#132B3B', '#0D1E2A');
    // Subtle harbor water ripples
    ctx.save();
    ctx.strokeStyle = 'rgba(125, 211, 252, 0.24)';
    ctx.lineWidth = 1;
    for (const wy of [22, 38, 48]) {
      const a = iso(p, -20, wy, 0.3);
      const b = iso(p, 48, wy, 0.3);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    }
    ctx.restore();
    // L-shaped concrete port quay pier
    drawIsoBox(ctx, p, -54, -54, 54, 4, 0, 4.5, {
      top: '#848C94',
      left: '#5E666E',
      right: '#414850',
      shadowAlpha: 0.15,
    });
    drawIsoBox(ctx, p, -54, 4, -12, 54, 0, 4.5, {
      top: '#848C94',
      left: '#5E666E',
      right: '#414850',
      shadowAlpha: 0.15,
    });
    // Port cargo warehouse
    drawIsoBox(ctx, p, -48, -46, -6, -18, 4.5, 20, {
      top: '#949EA8',
      left: '#606A74',
      right: '#3E464F',
    });
    // Stacked colorful shipping containers
    drawIsoBox(ctx, p, -48, 12, -26, 26, 4.5, 13, { top: '#C2410C', left: '#9A3412', right: '#7C2D12' });
    drawIsoBox(ctx, p, -48, 28, -26, 42, 4.5, 13, { top: '#1D4ED8', left: '#1E40AF', right: '#1E3A8A' });
    drawIsoBox(ctx, p, -46, 14, -28, 24, 13, 21, { top: '#D97706', left: '#B45309', right: '#78350F' });
    // Docked cargo ship in harbor!
    drawIsoBox(ctx, p, 2, 16, 46, 36, 0.5, 9, {
      top: '#323A44',
      left: '#7F1D1D',
      right: '#1C2229',
    });
    drawIsoBox(ctx, p, 6, 19, 30, 33, 9, 15, {
      top: '#B45309',
      left: '#1D4ED8',
      right: '#1E3A8A',
      shadowAlpha: 0.14,
    });
    drawIsoBox(ctx, p, 33, 18, 43, 34, 9, 22, {
      top: '#E2E8F0',
      left: '#CBD5E1',
      right: '#64748B',
      shadowAlpha: 0.18,
    });
    // Two tall container gantry cranes along pier
    for (const gx of [4, 28]) {
      drawIsoBox(ctx, p, gx, -6, gx + 4, -2, 4.5, 34, {
        top: '#0284C7',
        left: '#0369A1',
        right: '#075985',
        shadowAlpha: 0.2,
      });
      drawIsoBox(ctx, p, gx - 2, -10, gx + 6, 24, 34, 37, {
        top: '#38BDF8',
        left: '#0284C7',
        right: '#0369A1',
        shadowAlpha: 0.25,
      });
    }
  } else if (kind === 'military-base') {
    drawIsoBasePad(ctx, p, 58, '#4D5B42', '#37422E', '#2A3323', '#1E2519');
    drawPoly(
      ctx,
      [iso(p, -46, -46, 0.3), iso(p, 46, -46, 0.3), iso(p, 46, 46, 0.3), iso(p, -46, 46, 0.3)],
      '#5A6252',
      '#2B3026',
      0.7,
    );
    // Vehicle motor-pool hangars
    drawIsoBox(ctx, p, -40, -38, -4, -14, 0.4, 18, {
      top: '#6A755E',
      left: '#525C49',
      right: '#353C2F',
    });
    drawIsoBox(ctx, p, 4, -38, 40, -14, 0.4, 18, {
      top: '#6A755E',
      left: '#525C49',
      right: '#353C2F',
    });
    // Hangar bay doors
    for (const dx of [-34, -22, 10, 22]) {
      drawPoly(
        ctx,
        [iso(p, dx, -13.9, 0.6), iso(p, dx + 8, -13.9, 0.6), iso(p, dx + 8, -13.9, 12), iso(p, dx, -13.9, 12)],
        '#252C22',
        '#7B846E',
        0.7,
      );
    }
    // Garrison barracks building
    drawIsoBox(ctx, p, -38, 4, 2, 34, 0.4, 22, {
      top: '#78806D',
      left: '#596150',
      right: '#3B4235',
    });
    // Comms tower + watchpost
    drawIsoBox(ctx, p, 24, 14, 34, 24, 0.4, 36, {
      top: '#94A3B8',
      left: '#64748B',
      right: '#334155',
    });
    drawIsoBox(ctx, p, 20, 10, 38, 28, 36, 40, {
      top: '#CBD5E1',
      left: '#65A30D',
      right: '#3F6212',
      shadowAlpha: 0.14,
    });
    // Parked military trucks
    drawIsoVehicle(ctx, p, 14, 38, '#556347', '#38422E', true, 13, 5.5, 5.2);
    drawIsoVehicle(ctx, p, -16, 42, '#4D5D3E', '#303B26', true, 13, 5.5, 5.2);
    drawIsoTree(ctx, p, -48, -48, 0.9);
    drawIsoTree(ctx, p, 48, 44, 0.9);
  } else if (kind === 'metallurgy') {
    drawIsoBasePad(ctx, p, 58, '#46494D', '#323539', '#25282C', '#1A1C20');
    drawPoly(
      ctx,
      [iso(p, -48, -46, 0.3), iso(p, 48, -46, 0.3), iso(p, 48, 46, 0.3), iso(p, -48, 46, 0.3)],
      '#4E535A',
      '#24282E',
      0.7,
    );
    // Twin blast furnaces + hot blast stoves
    drawIsoCylinder(ctx, p, -30, -24, 0.4, 48, 9, '#8D959E', '#646C75', '#3A4047', '#4B525A', '#EA580C');
    drawIsoCylinder(ctx, p, -8, -28, 0.4, 44, 8, '#8D959E', '#646C75', '#3A4047', '#4B525A', '#EA580C');
    drawIsoCylinder(ctx, p, 14, -26, 0.4, 54, 4, '#CBD5E1', '#94A3B8', '#475569', '#24292F', '#DC2626');
    // Massive rolling mill foundry hall
    drawIsoBox(ctx, p, -34, -2, 34, 32, 0.4, 24, {
      top: '#6B7280',
      left: '#4B5563',
      right: '#2B313B',
    });
    // Molten steel roof vent & orange glow slit
    drawIsoBox(ctx, p, -26, 4, 26, 18, 24, 30, {
      top: '#9CA3AF',
      left: '#EA580C',
      right: '#7C2D12',
      shadowAlpha: 0.14,
    });
    // Coal / iron ore storage mound & crane
    drawIsoBox(ctx, p, -38, 36, -12, 46, 0.4, 7, {
      top: '#27272A',
      left: '#18181B',
      right: '#09090B',
    });
    drawIsoVehicle(ctx, p, 22, 40, '#D97706', '#78350F', true, 12, 5.2, 5.2);
  } else if (kind === 'railway-hub') {
    drawIsoBasePad(ctx, p, 58, '#4F5648', '#394034');
    // Gravel track bed
    drawPoly(
      ctx,
      [iso(p, -52, -10, 0.3), iso(p, 52, -10, 0.3), iso(p, 52, 46, 0.3), iso(p, -52, 46, 0.3)],
      '#5E5850',
      '#2B2824',
      0.7,
    );
    // Parallel steel rails
    ctx.save();
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 1.4;
    for (const ry of [0, 6, 18, 24, 34, 40]) {
      const a = iso(p, -50, ry, 0.6);
      const b = iso(p, 50, ry, 0.6);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    }
    ctx.restore();
    // Locomotive depot building
    drawIsoBox(ctx, p, -44, -44, 14, -14, 0.4, 21, {
      top: '#8A949E',
      left: '#5B646E',
      right: '#383F48',
    });
    // Signal tower
    drawIsoBox(ctx, p, 24, -40, 38, -26, 0.4, 28, {
      top: '#94A3B8',
      left: '#0284C7',
      right: '#075985',
    });
    // Freight train locomotive + cargo wagons on track
    drawIsoBox(ctx, p, -40, -1, -18, 7, 0.8, 10, {
      top: '#EF4444',
      left: '#B91C1C',
      right: '#7F1D1D',
    });
    drawIsoBox(ctx, p, -14, -1, 12, 7, 0.8, 9.5, {
      top: '#92400E',
      left: '#78350F',
      right: '#451A03',
    });
    drawIsoBox(ctx, p, 16, -1, 42, 7, 0.8, 9.5, {
      top: '#3B82F6',
      left: '#1D4ED8',
      right: '#1E3A8A',
    });
    drawIsoBox(ctx, p, -26, 17, 6, 25, 0.8, 9, {
      top: '#CBD5E1',
      left: '#64748B',
      right: '#334155',
    });
    drawIsoTree(ctx, p, 46, -44, 0.85);
  } else if (kind === 'command-center') {
    drawIsoBasePad(ctx, p, 58, '#465242', '#313B2E');
    drawPoly(
      ctx,
      [iso(p, -46, -46, 0.3), iso(p, 46, -46, 0.3), iso(p, 46, 46, 0.3), iso(p, -46, 46, 0.3)],
      '#47505A',
      '#22282F',
      0.7,
    );
    // Fortified multi-tier command headquarters
    drawIsoBox(ctx, p, -36, -34, 16, 10, 0.4, 26, {
      top: '#788492',
      left: '#525C68',
      right: '#333A44',
    });
    drawIsoBox(ctx, p, -24, -24, 6, 2, 26, 38, {
      top: '#94A3B8',
      left: '#64748B',
      right: '#3E4856',
      shadowAlpha: 0.18,
    });
    // Radar / satcom radome on rooftop
    drawIsoCylinder(ctx, p, -10, -12, 38, 12, 8, '#E2E8F0', '#CBD5E1', '#64748B', '#F8FAFC');
    // Tall communications antenna mast
    drawIsoBox(ctx, p, 24, -34, 30, -28, 0.4, 48, {
      top: '#E2E8F0',
      left: '#94A3B8',
      right: '#475569',
    });
    // Helipad courtyard
    drawPoly(
      ctx,
      [iso(p, -34, 18, 0.5), iso(p, 2, 18, 0.5), iso(p, 2, 42, 0.5), iso(p, -34, 42, 0.5)],
      '#334155',
      '#EAB308',
      1.1,
    );
    const [hx, hy] = iso(p, -16, 30, 0.7);
    ctx.save();
    ctx.strokeStyle = '#FACC15';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(hx, hy, 11, 6, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    drawIsoVehicle(ctx, p, 24, 32, '#1E293B', '#0F172A', true, 11, 5, 4.5);
    drawIsoTree(ctx, p, 46, -42, 0.9);
    drawIsoTree(ctx, p, -46, 44, 0.85);
  } else if (kind === 'bridge') {
    drawIsoBasePad(ctx, p, 58, '#465842', '#313F2E');
    // Wide blue river cutting across the pad
    drawPoly(
      ctx,
      [iso(p, -26, -54, 0.2), iso(p, 26, -54, 0.2), iso(p, 26, 54, 0.2), iso(p, -26, 54, 0.2)],
      '#1E4E68',
      '#0F2E40',
      0.8,
    );
    // Subtle river reflections
    ctx.save();
    ctx.strokeStyle = 'rgba(125, 211, 252, 0.25)';
    ctx.lineWidth = 1.1;
    for (const rx of [-12, 0, 12]) {
      const a = iso(p, rx, -44, 0.35);
      const b = iso(p, rx, 44, 0.35);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    }
    ctx.restore();
    // River piers supporting bridge spans
    for (const px of [-16, 10]) {
      drawIsoBox(ctx, p, px, -16, px + 6, 16, 0.3, 14, {
        top: '#64748B',
        left: '#475569',
        right: '#334155',
      });
    }
    // Concrete highway bridge deck across river
    drawIsoBox(ctx, p, -54, -14, 54, 14, 14, 19, {
      top: '#4B5563',
      left: '#94A3B8',
      right: '#64748B',
      shadowAlpha: 0.28,
    });
    // Twin cable-stayed bridge pylons
    drawIsoBox(ctx, p, -16, -15, -10, -11, 19, 52, {
      top: '#E2E8F0',
      left: '#CBD5E1',
      right: '#64748B',
    });
    drawIsoBox(ctx, p, -16, 11, -10, 15, 19, 52, {
      top: '#E2E8F0',
      left: '#CBD5E1',
      right: '#64748B',
    });
    drawIsoBox(ctx, p, -16, -15, -10, 15, 48, 52, {
      top: '#F1F5F9',
      left: '#CBD5E1',
      right: '#64748B',
      shadowAlpha: 0.1,
    });
    // Stay cables & vehicles crossing deck
    ctx.save();
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.65)';
    ctx.lineWidth = 0.9;
    const topPylon = iso(p, -13, 0, 49);
    for (const cx of [-44, -32, 4, 20, 38]) {
      const deckPt = iso(p, cx, 0, 19);
      ctx.beginPath();
      ctx.moveTo(topPylon[0], topPylon[1]);
      ctx.lineTo(deckPt[0], deckPt[1]);
      ctx.stroke();
    }
    ctx.restore();
    drawIsoVehicle(ctx, p, -32, -4, '#E2E8F0', '#94A3B8', true, 10, 4.4, 3.8);
    drawIsoVehicle(ctx, p, 24, 4, '#2DD4BF', '#0F766E', true, 11, 4.6, 4);
  } else {
    // 'airfield': Full Isometric 3D Military Airbase Diorama
    drawIsoBasePad(ctx, p, 58, '#4B5B42', '#374430');
    // Main asphalt runway diagonal across base
    drawPoly(
      ctx,
      [iso(p, -54, 12, 0.4), iso(p, 54, 12, 0.4), iso(p, 54, 38, 0.4), iso(p, -54, 38, 0.4)],
      '#242A32',
      '#161A20',
      0.8,
    );
    // Yellow taxiway + concrete aircraft apron
    drawPoly(
      ctx,
      [iso(p, -44, -36, 0.35), iso(p, 44, -36, 0.35), iso(p, 44, 6, 0.35), iso(p, -44, 6, 0.35)],
      '#6E7680',
      '#394048',
      0.7,
    );
    // Runway centerline dashes & threshold stripes
    ctx.save();
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([6, 5]);
    const rA = iso(p, -46, 25, 0.5);
    const rB = iso(p, 46, 25, 0.5);
    ctx.beginPath();
    ctx.moveTo(rA[0], rA[1]);
    ctx.lineTo(rB[0], rB[1]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    // Reinforced aircraft revetment shelters (caponiers) + hangar
    drawIsoBox(ctx, p, -44, -44, -14, -22, 0.4, 16, {
      top: '#606A74',
      left: '#454E58',
      right: '#2C323A',
    });
    drawIsoBox(ctx, p, -8, -44, 18, -22, 0.4, 15, {
      top: '#5C6654',
      left: '#444C3D',
      right: '#2B3127',
    });
    // ATC Control Tower with glass cab & radar mast
    drawIsoBox(ctx, p, 26, -42, 38, -30, 0.4, 28, {
      top: '#94A3B8',
      left: '#64748B',
      right: '#475569',
    });
    drawIsoBox(ctx, p, 24, -44, 40, -28, 28, 35, {
      top: '#CBD5E1',
      left: '#38BDF8',
      right: '#0369A1',
      shadowAlpha: 0.14,
    });
    // Fuel tanks at airbase
    drawIsoCylinder(ctx, p, 44, -14, 0.4, 14, 6.5, '#DCE3EA', '#AEB8C2', '#6C7680', '#CBD4DD', '#D97706');
    // Parked tactical fighter on concrete apron
    const [ax, ay] = iso(p, -8, -8, 0.6);
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(-0.45);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.moveTo(15, 2);
    ctx.lineTo(-9, -11);
    ctx.lineTo(-11, 13);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#9AA4B0';
    ctx.strokeStyle = '#1E242B';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(2, -2.5);
    ctx.lineTo(-8, -11);
    ctx.lineTo(-11, -9);
    ctx.lineTo(-5, -2.5);
    ctx.lineTo(-12, -2.5);
    ctx.lineTo(-12, 2.5);
    ctx.lineTo(-5, 2.5);
    ctx.lineTo(-11, 9);
    ctx.lineTo(-8, 11);
    ctx.lineTo(2, 2.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    drawIsoTree(ctx, p, -50, 48, 0.9);
    drawIsoTree(ctx, p, 50, -48, 0.9);
  }

  return canvas;
}

export function getBuildingSpriteCanvas(id: BuildingId | 'airfield'): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  if (!buildingCanvasCache[id]) {
    buildingCanvasCache[id] = bakeBuildingDiorama(id);
  }
  return buildingCanvasCache[id] ?? null;
}

export function getBuildingSpriteDataUrl(id: BuildingId | 'airfield'): string {
  if (buildingUrlCache[id]) return buildingUrlCache[id]!;
  const c = getBuildingSpriteCanvas(id);
  if (!c) return '';
  const url = c.toDataURL('image/png');
  buildingUrlCache[id] = url;
  return url;
}

// ============================================================================
// PHOTOREALISTIC 3D TOP-DOWN DRONE, MISSILE & AIRCRAFT SPRITE ENGINE
// ============================================================================

function paintCylindricalMissile(
  ctx: CanvasRenderingContext2D,
  x0: number,
  x1: number,
  halfW: number,
  noseLen: number,
  palette: {
    top: string;
    mid: string;
    dark: string;
    nose: string;
    wing?: string;
    fin?: string;
    hasMidWings?: boolean;
    wingSpan?: number;
    wingSweep?: number;
    hasDorsalPod?: boolean;
    bandColor?: string;
  },
) {
  const cy = 0;
  // Mid swept wings (under/mid body)
  if (palette.hasMidWings) {
    const span = palette.wingSpan ?? 24;
    const wxRoot = (x0 + x1) * 0.54;
    const sweep = palette.wingSweep ?? 15;
    for (const side of [-1, 1]) {
      const wg = ctx.createLinearGradient(wxRoot, 0, wxRoot - sweep, side * span);
      wg.addColorStop(0, palette.wing ?? palette.top);
      wg.addColorStop(1, palette.dark);
      ctx.fillStyle = wg;
      ctx.strokeStyle = 'rgba(12, 16, 22, 0.8)';
      ctx.lineWidth = 0.85;
      ctx.beginPath();
      ctx.moveTo(wxRoot + 4, side * (halfW - 0.5));
      ctx.lineTo(wxRoot - sweep, side * span);
      ctx.lineTo(wxRoot - sweep - 6, side * (span - 1));
      ctx.lineTo(wxRoot - 6, side * (halfW - 0.5));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  // Rear cruciform tail fins
  for (const side of [-1, 1]) {
    ctx.fillStyle = palette.fin ?? palette.dark;
    ctx.strokeStyle = 'rgba(12, 16, 22, 0.82)';
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    ctx.moveTo(x0 + 9, side * (halfW - 0.5));
    ctx.lineTo(x0 + 2, side * (halfW + 7.5));
    ctx.lineTo(x0 - 2.5, side * (halfW + 6.5));
    ctx.lineTo(x0 + 1, side * (halfW - 0.5));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Cylindrical fuselage with 5-stop specular shading
  const bodyEnd = x1 - noseLen;
  const g = ctx.createLinearGradient(0, -halfW, 0, halfW);
  g.addColorStop(0, palette.mid);
  g.addColorStop(0.28, palette.top);
  g.addColorStop(0.62, palette.mid);
  g.addColorStop(1, palette.dark);

  ctx.fillStyle = g;
  ctx.strokeStyle = 'rgba(12, 16, 22, 0.85)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(x0, cy - halfW * 0.88);
  ctx.lineTo(bodyEnd, cy - halfW);
  ctx.quadraticCurveTo(x1 - noseLen * 0.25, cy - halfW * 0.55, x1, cy);
  ctx.quadraticCurveTo(x1 - noseLen * 0.25, cy + halfW * 0.55, bodyEnd, cy + halfW);
  ctx.lineTo(x0, cy + halfW * 0.88);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Nose seeker cone
  const ng = ctx.createLinearGradient(0, -halfW, 0, halfW);
  ng.addColorStop(0, palette.nose);
  ng.addColorStop(0.32, '#E2E8F0');
  ng.addColorStop(1, '#1E242C');
  ctx.fillStyle = ng;
  ctx.beginPath();
  ctx.moveTo(bodyEnd, cy - halfW);
  ctx.quadraticCurveTo(x1 - noseLen * 0.25, cy - halfW * 0.55, x1, cy);
  ctx.quadraticCurveTo(x1 - noseLen * 0.25, cy + halfW * 0.55, bodyEnd, cy + halfW);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Recessed panel seam rings
  ctx.strokeStyle = 'rgba(15, 20, 28, 0.45)';
  ctx.lineWidth = 0.8;
  for (const sx of [x0 + 14, (x0 + bodyEnd) * 0.52, bodyEnd - 4]) {
    ctx.beginPath();
    ctx.moveTo(sx, -halfW + 0.5);
    ctx.lineTo(sx, halfW - 0.5);
    ctx.stroke();
  }

  if (palette.bandColor) {
    ctx.fillStyle = palette.bandColor;
    ctx.fillRect(bodyEnd - 6, -halfW + 0.6, 3.2, halfW * 2 - 1.2);
  }

  // Rear nozzle ring
  ctx.fillStyle = '#181C22';
  ctx.fillRect(x0 - 2.2, -halfW * 0.65, 3, halfW * 1.3);

  // Dorsal jet engine pod (for Flamingo FP-5 / Peklo)
  if (palette.hasDorsalPod) {
    const pg = ctx.createLinearGradient(0, -3.5, 0, 3.5);
    pg.addColorStop(0, '#949EA8');
    pg.addColorStop(0.35, '#CBD5E1');
    pg.addColorStop(1, '#333A42');
    ctx.fillStyle = pg;
    ctx.strokeStyle = 'rgba(12, 16, 22, 0.85)';
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    ctx.roundRect(x0 + 8, -3.2, 22, 6.4, 2.4);
    ctx.fill();
    ctx.stroke();
  }
}

function bakeMunitionSprite(id: MunitionId): HTMLCanvasElement {
  const W = 220;
  const H = 150;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(2.15, 2.15);

  if (id === 'shahed-136' || id === 'shahed-238') {
    const isJet = id === 'shahed-238';
    // Realistic 3D-shaded composite delta wing (matching Screenshot 1 & 4)
    const wg = ctx.createLinearGradient(0, -20, 0, 20);
    if (isJet) {
      wg.addColorStop(0, '#5A626B');
      wg.addColorStop(0.35, '#323840');
      wg.addColorStop(0.75, '#1D2127');
      wg.addColorStop(1, '#111418');
    } else {
      wg.addColorStop(0, '#EEF2F6');
      wg.addColorStop(0.38, '#C8D0D8');
      wg.addColorStop(0.76, '#939CA6');
      wg.addColorStop(1, '#68717A');
    }
    ctx.fillStyle = wg;
    ctx.strokeStyle = 'rgba(18, 22, 28, 0.85)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(27, 0);
    ctx.quadraticCurveTo(18, -3.8, -14, -20);
    ctx.lineTo(-21, -17.5);
    ctx.lineTo(-17.5, -5.2);
    ctx.lineTo(-20.5, -3.8);
    ctx.lineTo(-20.5, 3.8);
    ctx.lineTo(-17.5, 5.2);
    ctx.lineTo(-21, 17.5);
    ctx.lineTo(-14, 20);
    ctx.quadraticCurveTo(18, 3.8, 27, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Wing leading-edge highlight + elevon control flap seams
    ctx.strokeStyle = isJet ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 0.65;
    ctx.beginPath();
    ctx.moveTo(22, -1);
    ctx.lineTo(-14, -18.8);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(20, 25, 32, 0.35)';
    ctx.lineWidth = 0.55;
    ctx.beginPath();
    ctx.moveTo(-16.5, -17);
    ctx.lineTo(-15.5, -5.5);
    ctx.moveTo(-16.5, 17);
    ctx.lineTo(-15.5, 5.5);
    ctx.stroke();

    // Cropped wingtip vertical endplates
    ctx.fillStyle = isJet ? '#15181D' : '#858E98';
    ctx.fillRect(-20.2, -20.2, 7.5, 2.1);
    ctx.fillRect(-20.2, 18.1, 7.5, 2.1);

    // Sculpted cylindrical central fuselage spine
    const fg = ctx.createLinearGradient(0, -3.5, 0, 3.5);
    fg.addColorStop(0, isJet ? '#646D77' : '#F8FAFC');
    fg.addColorStop(0.35, isJet ? '#3B424A' : '#D5DDE5');
    fg.addColorStop(1, isJet ? '#16191E' : '#737C86');
    ctx.fillStyle = fg;
    ctx.strokeStyle = 'rgba(18, 22, 28, 0.72)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(28, 0);
    ctx.quadraticCurveTo(16, -3.6, -21, -3.2);
    ctx.lineTo(-21, 3.2);
    ctx.quadraticCurveTo(16, 3.6, 28, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Nose radome / sensor pitot
    ctx.fillStyle = '#1E232A';
    ctx.beginPath();
    ctx.moveTo(28, 0);
    ctx.lineTo(17.5, -2.5);
    ctx.lineTo(17.5, 2.5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(28, 0);
    ctx.lineTo(31.5, 0);
    ctx.stroke();

    if (isJet) {
      // Dorsal turbojet intake scoop + exhaust ring
      ctx.fillStyle = '#111419';
      ctx.strokeStyle = '#737C86';
      ctx.lineWidth = 0.55;
      ctx.beginPath();
      ctx.roundRect(-10, -2.1, 13, 4.2, 1.4);
      ctx.fill();
      ctx.stroke();
    } else {
      // Rear pusher engine + 2-blade wooden/composite prop
      ctx.fillStyle = '#252A30';
      ctx.fillRect(-22.5, -2.4, 3.2, 4.8);
      ctx.fillStyle = '#14171B';
      ctx.beginPath();
      ctx.roundRect(-24.2, -7.8, 1.8, 15.6, 0.9);
      ctx.fill();
    }
  } else if (id === 'lyutyi') {
    // Ukrainian An-196 Lyutyi twin-boom pusher UAV
    const bg = ctx.createLinearGradient(0, -18, 0, 18);
    bg.addColorStop(0, '#DCE3EA');
    bg.addColorStop(0.5, '#B4BEC8');
    bg.addColorStop(1, '#757E88');
    // Tail booms & inverted-V stabilizer
    ctx.fillStyle = '#7D8792';
    ctx.strokeStyle = 'rgba(18, 24, 32, 0.75)';
    ctx.lineWidth = 0.6;
    ctx.fillRect(-23, -7.2, 18, 1.8);
    ctx.strokeRect(-23, -7.2, 18, 1.8);
    ctx.fillRect(-23, 5.4, 18, 1.8);
    ctx.strokeRect(-23, 5.4, 18, 1.8);
    ctx.fillStyle = '#949EA8';
    ctx.fillRect(-24, -8.2, 3.2, 16.4);
    ctx.strokeRect(-24, -8.2, 3.2, 16.4);
    // High-aspect swept wings
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.moveTo(6, -2.5);
    ctx.lineTo(-1, -24.5);
    ctx.lineTo(-6.2, -23.5);
    ctx.lineTo(-3.5, -2.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(6, 2.5);
    ctx.lineTo(-1, 24.5);
    ctx.lineTo(-6.2, 23.5);
    ctx.lineTo(-3.5, 2.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Central streamlined fuselage pod
    paintCylindricalMissile(ctx, -10, 26, 3.3, 9, {
      top: '#ECEFF4',
      mid: '#B0BAC4',
      dark: '#67717C',
      nose: '#252B32',
    });
    // Pusher prop at pod rear
    ctx.fillStyle = '#181C22';
    ctx.fillRect(-12, -5.5, 1.6, 11);
  } else if (id === 'bober') {
    // Ukrainian UJ-26 Bober canard UAV
    const wg = ctx.createLinearGradient(0, -21, 0, 21);
    wg.addColorStop(0, '#E2E8F0');
    wg.addColorStop(0.5, '#B4BEC8');
    wg.addColorStop(1, '#717B85');
    ctx.fillStyle = wg;
    ctx.strokeStyle = 'rgba(18, 24, 32, 0.78)';
    ctx.lineWidth = 0.65;
    // Forward canards
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(18, s * 2);
      ctx.lineTo(12, s * 10);
      ctx.lineTo(8.5, s * 9.5);
      ctx.lineTo(12, s * 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Main aft wing
      ctx.beginPath();
      ctx.moveTo(-2, s * 2.4);
      ctx.lineTo(-15, s * 21);
      ctx.lineTo(-20.5, s * 19.5);
      ctx.lineTo(-11, s * 2.4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    paintCylindricalMissile(ctx, -22, 27, 2.9, 8, {
      top: '#EEF2F6',
      mid: '#AEB8C2',
      dark: '#646E78',
      nose: '#232930',
    });
    ctx.fillStyle = '#181C22';
    ctx.fillRect(-24.2, -5.2, 1.6, 10.4);
  } else if (id === 'palyanytsya') {
    paintCylindricalMissile(ctx, -26, 28, 3.4, 9, {
      top: '#D8E0E8',
      mid: '#9BA5B0',
      dark: '#525B64',
      nose: '#272D34',
      wing: '#B0BAC4',
      hasMidWings: true,
      wingSpan: 20,
      wingSweep: 13,
      hasDorsalPod: false,
      bandColor: '#EAB308',
    });
    ctx.fillStyle = '#1C2229';
    ctx.beginPath();
    ctx.roundRect(-8, -1.8, 10, 3.6, 1.2);
    ctx.fill();
  } else if (id === 'peklo') {
    paintCylindricalMissile(ctx, -27, 28, 3.1, 8.5, {
      top: '#E6ECF2',
      mid: '#A6B0BA',
      dark: '#5B646E',
      nose: '#222830',
      wing: '#CBD4DD',
      hasMidWings: true,
      wingSpan: 21,
      wingSweep: 11,
      hasDorsalPod: true,
    });
  } else if (id === 'kalibr') {
    paintCylindricalMissile(ctx, -29, 30, 3.3, 9.5, {
      top: '#EEF2F6',
      mid: '#A9B3BD',
      dark: '#555E68',
      nose: '#7F2323',
      wing: '#C4CDD6',
      hasMidWings: true,
      wingSpan: 22,
      wingSweep: 12,
    });
  } else if (id === 'kh101') {
    paintCylindricalMissile(ctx, -30, 31, 3.6, 10, {
      top: '#909AA4',
      mid: '#5D6670',
      dark: '#2A3038',
      nose: '#3C434D',
      wing: '#7D8792',
      hasMidWings: true,
      wingSpan: 25,
      wingSweep: 16,
    });
  } else if (id === 'neptune') {
    paintCylindricalMissile(ctx, -28, 30, 3.3, 9.5, {
      top: '#B4BEC8',
      mid: '#7C8792',
      dark: '#3D464F',
      nose: '#232930',
      wing: '#94A0AA',
      hasMidWings: true,
      wingSpan: 19,
      wingSweep: 9,
      bandColor: '#FACC15',
    });
  } else if (id === 'flamingo') {
    paintCylindricalMissile(ctx, -29, 30, 4.4, 10, {
      top: '#A4ADB6',
      mid: '#6B747E',
      dark: '#323840',
      nose: '#9E4B66',
      wing: '#8E97A1',
      hasMidWings: true,
      wingSpan: 25,
      wingSweep: 8,
      hasDorsalPod: true,
    });
  } else if (id === 'iskander') {
    paintCylindricalMissile(ctx, -31, 32, 4.8, 15, {
      top: '#8A987B',
      mid: '#56634B',
      dark: '#2D3526',
      nose: '#B8C2CC',
      fin: '#232820',
    });
  } else if (id === 'sapsan') {
    paintCylindricalMissile(ctx, -31, 32, 4.6, 14, {
      top: '#8C9B84',
      mid: '#586652',
      dark: '#2D362A',
      nose: '#9EA8B2',
      fin: '#222820',
      bandColor: '#FACC15',
    });
  } else if (id === 'kinzhal') {
    paintCylindricalMissile(ctx, -31, 33, 3.8, 13.5, {
      top: '#F1F5F9',
      mid: '#B4BEC8',
      dark: '#5D6670',
      nose: '#1E232A',
      fin: '#383F48',
    });
  } else if (id === 'kh22') {
    paintCylindricalMissile(ctx, -30, 32, 4.3, 12, {
      top: '#E4EBF2',
      mid: '#A2ACB6',
      dark: '#545D67',
      nose: '#242A32',
      wing: '#BAC4CE',
      hasMidWings: true,
      wingSpan: 22,
      wingSweep: 16,
    });
  } else if (id === 'kh69') {
    paintCylindricalMissile(ctx, -28, 30, 3.5, 9.5, {
      top: '#828C96',
      mid: '#515A64',
      dark: '#252A31',
      nose: '#343B44',
      wing: '#6D7680',
      hasMidWings: true,
      wingSpan: 21,
      wingSweep: 14,
    });
  } else if (id === 'kab') {
    paintCylindricalMissile(ctx, -24, 26, 4.4, 10, {
      top: '#8D987E',
      mid: '#5E6850',
      dark: '#303628',
      nose: '#4B5340',
      wing: '#C4CDD6',
      hasMidWings: true,
      wingSpan: 24,
      wingSweep: 11,
    });
  } else if (id === 'airstrike' || id === 'su57-kab') {
    drawJetFighterTopDown(ctx, id === 'su57-kab' ? 'su57' : 'su34');
  }

  ctx.restore();
  return canvas;
}

function drawJetFighterTopDown(
  ctx: CanvasRenderingContext2D,
  variant: 'su57' | 'su34' | 'mig31' | 'tu22' | 'tu95' | 'tu160',
) {
  if (variant === 'su57' || variant === 'su34') {
    const isStealth = variant === 'su57';
    const g = ctx.createLinearGradient(0, -24, 0, 24);
    if (isStealth) {
      g.addColorStop(0, '#96A2AF');
      g.addColorStop(0.45, '#5E6976');
      g.addColorStop(1, '#2D343E');
    } else {
      g.addColorStop(0, '#78889A');
      g.addColorStop(0.5, '#4B5969');
      g.addColorStop(1, '#262E38');
    }
    ctx.fillStyle = g;
    ctx.strokeStyle = 'rgba(12, 16, 22, 0.85)';
    ctx.lineWidth = 0.75;

    // Main wings + LERX
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(16, s * 2.5);
      ctx.lineTo(7, s * 8.5);
      ctx.lineTo(-10, s * 23);
      ctx.lineTo(-16, s * 19.5);
      ctx.lineTo(-9, s * 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Tailplane
      ctx.beginPath();
      ctx.moveTo(-12, s * 5);
      ctx.lineTo(-22, s * 14);
      ctx.lineTo(-25, s * 11.5);
      ctx.lineTo(-18, s * 4.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Splinter digital camo patches on Su-57
    if (isStealth) {
      ctx.fillStyle = 'rgba(203, 213, 225, 0.28)';
      ctx.beginPath();
      ctx.moveTo(-2, -14);
      ctx.lineTo(-10, -18);
      ctx.lineTo(-12, -10);
      ctx.lineTo(-5, -8);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-2, 14);
      ctx.lineTo(-10, 18);
      ctx.lineTo(-12, 10);
      ctx.lineTo(-5, 8);
      ctx.closePath();
      ctx.fill();
    }

    // Twin engine nacelles + nozzles
    for (const ey of [-3.6, 3.6]) {
      ctx.fillStyle = '#4B5562';
      ctx.fillRect(-23, ey - 1.8, 11, 3.6);
      ctx.fillStyle = '#1E232A';
      ctx.fillRect(-25.5, ey - 1.4, 3, 2.8);
    }

    // Fuselage spine & nose
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(31, 0);
    ctx.lineTo(14, -4.4);
    ctx.lineTo(-20, -6);
    ctx.lineTo(-20, 6);
    ctx.lineTo(14, 4.4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Tinted canopy with golden specular glint
    ctx.fillStyle = '#161C24';
    ctx.beginPath();
    ctx.ellipse(14.5, 0, 6.2, 2.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(234, 179, 8, 0.45)';
    ctx.beginPath();
    ctx.ellipse(15.5, -0.5, 3.4, 0.75, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (variant === 'mig31') {
    const g = ctx.createLinearGradient(0, -19, 0, 19);
    g.addColorStop(0, '#9AA4B0');
    g.addColorStop(0.5, '#68727D');
    g.addColorStop(1, '#363C44');
    ctx.fillStyle = g;
    ctx.strokeStyle = 'rgba(12, 16, 22, 0.85)';
    ctx.lineWidth = 0.7;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(10, s * 3.5);
      ctx.lineTo(-10, s * 18.5);
      ctx.lineTo(-16, s * 15.5);
      ctx.lineTo(-6, s * 3.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-14, s * 3.2);
      ctx.lineTo(-22, s * 10);
      ctx.lineTo(-24, s * 7.5);
      ctx.lineTo(-18, s * 3.2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(27, 0);
    ctx.lineTo(12, -3.8);
    ctx.lineTo(-20, -4.4);
    ctx.lineTo(-20, 4.4);
    ctx.lineTo(12, 3.8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#181E26';
    ctx.beginPath();
    ctx.ellipse(15, 0, 5.2, 1.4, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (variant === 'tu22') {
    const g = ctx.createLinearGradient(0, -23, 0, 23);
    g.addColorStop(0, '#8A94A0');
    g.addColorStop(0.5, '#59626E');
    g.addColorStop(1, '#2D333B');
    ctx.fillStyle = g;
    ctx.strokeStyle = 'rgba(12, 16, 22, 0.85)';
    ctx.lineWidth = 0.7;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(10, s * 3);
      ctx.lineTo(-10, s * 22.5);
      ctx.lineTo(-16, s * 19.5);
      ctx.lineTo(-5, s * 3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-14, s * 2.8);
      ctx.lineTo(-23, s * 10.5);
      ctx.lineTo(-25, s * 8);
      ctx.lineTo(-19, s * 2.8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(27, 0);
    ctx.quadraticCurveTo(15, -3.8, -20, -3.8);
    ctx.lineTo(-20, 3.8);
    ctx.quadraticCurveTo(15, 3.8, 27, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#181E26';
    ctx.beginPath();
    ctx.ellipse(16, 0, 4.5, 1.3, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (variant === 'tu95') {
    const g = ctx.createLinearGradient(0, -26, 0, 26);
    g.addColorStop(0, '#D4DCE4');
    g.addColorStop(0.5, '#9CA5B0');
    g.addColorStop(1, '#646D77');
    ctx.fillStyle = g;
    ctx.strokeStyle = 'rgba(15, 20, 26, 0.82)';
    ctx.lineWidth = 0.7;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(9, s * 2.5);
      ctx.lineTo(-12, s * 26);
      ctx.lineTo(-17, s * 24);
      ctx.lineTo(-3, s * 2.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-17, s * 2.2);
      ctx.lineTo(-24, s * 10);
      ctx.lineTo(-26, s * 8.2);
      ctx.lineTo(-21, s * 2.2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    for (const [ex, ey] of [
      [1, -10.5],
      [-5.5, -18],
      [1, 10.5],
      [-5.5, 18],
    ]) {
      ctx.fillStyle = '#4B535D';
      ctx.fillRect(ex - 2.8, ey - 1.4, 7.2, 2.8);
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.5)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(ex + 4.8, ey - 3.6);
      ctx.lineTo(ex + 4.8, ey + 3.6);
      ctx.stroke();
    }
    ctx.fillStyle = g;
    ctx.strokeStyle = 'rgba(15, 20, 26, 0.82)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(27, 0);
    ctx.quadraticCurveTo(21, -2.8, 14, -2.6);
    ctx.lineTo(-23, -2.4);
    ctx.lineTo(-23, 2.4);
    ctx.lineTo(14, 2.6);
    ctx.quadraticCurveTo(21, 2.8, 27, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#181E26';
    ctx.fillRect(16, -1.4, 4, 2.8);
    return;
  }

  // tu160 "White Swan"
  const wg = ctx.createLinearGradient(0, -25, 0, 25);
  wg.addColorStop(0, '#F8FAFC');
  wg.addColorStop(0.5, '#DCE3EB');
  wg.addColorStop(1, '#A4B0BC');
  ctx.fillStyle = wg;
  ctx.strokeStyle = 'rgba(22, 28, 36, 0.82)';
  ctx.lineWidth = 0.7;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(9, s * 2.8);
    ctx.lineTo(-11, s * 25);
    ctx.lineTo(-17, s * 22);
    ctx.lineTo(-5, s * 2.8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-16, s * 2.4);
    ctx.lineTo(-24, s * 9.5);
    ctx.lineTo(-26, s * 7.2);
    ctx.lineTo(-20, s * 2.4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(28, 0);
  ctx.quadraticCurveTo(19, -3.2, 12, -3.2);
  ctx.lineTo(-22, -3.2);
  ctx.lineTo(-22, 3.2);
  ctx.lineTo(12, 3.2);
  ctx.quadraticCurveTo(19, 3.2, 28, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#1C232D';
  ctx.beginPath();
  ctx.ellipse(17, 0, 4.4, 1.4, 0, 0, Math.PI * 2);
  ctx.fill();
}

function bakeAircraftSprite(id: RussianAircraftId): HTMLCanvasElement {
  const W = 220;
  const H = 160;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(2.2, 2.2);
  const map: Record<RussianAircraftId, 'mig31' | 'tu95' | 'tu22' | 'tu160' | 'su57'> = {
    mig31k: 'mig31',
    tu95: 'tu95',
    tu22m3: 'tu22',
    tu160: 'tu160',
    'su57-x69': 'su57',
  };
  drawJetFighterTopDown(ctx, map[id]);
  ctx.restore();
  return canvas;
}

export function getMunitionSpriteCanvas(id: MunitionId): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  if (!munitionCanvasCache[id]) {
    munitionCanvasCache[id] = bakeMunitionSprite(id);
  }
  return munitionCanvasCache[id] ?? null;
}

export function getMunitionSpriteDataUrl(id: MunitionId): string {
  if (munitionUrlCache[id]) return munitionUrlCache[id]!;
  const c = getMunitionSpriteCanvas(id);
  if (!c) return '';
  const url = c.toDataURL('image/png');
  munitionUrlCache[id] = url;
  return url;
}

export function getAircraftSpriteCanvas(id: RussianAircraftId): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  if (!aircraftCanvasCache[id]) {
    aircraftCanvasCache[id] = bakeAircraftSprite(id);
  }
  return aircraftCanvasCache[id] ?? null;
}

export function getAircraftSpriteDataUrl(id: RussianAircraftId): string {
  if (aircraftUrlCache[id]) return aircraftUrlCache[id]!;
  const c = getAircraftSpriteCanvas(id);
  if (!c) return '';
  const url = c.toDataURL('image/png');
  aircraftUrlCache[id] = url;
  return url;
}

// ============================================================================
// PHOTOREALISTIC TOP-DOWN LAUNCHER TRUCKS & PVO MENU PREVIEWS
// ============================================================================

export function drawRealisticLauncherChassis(
  ctx: CanvasRenderingContext2D,
  id: MunitionId,
  faction: 'RU' | 'UA',
  ammo: number,
  reloadingReady = true,
) {
  const isUa = faction === 'UA';
  const rim = 'rgba(10, 14, 20, 0.88)';
  const isEmpty = ammo <= 0;

  if (
    id === 'shahed-136' ||
    id === 'shahed-238' ||
    id === 'lyutyi' ||
    id === 'bober' ||
    id === 'palyanytsya' ||
    id === 'peklo'
  ) {
    // Realistic 6x6 KamAZ / KrAZ military truck with dual launch rails & loaded drones on bed (matching image_dde43998)
    // 6 black treaded rubber tires
    ctx.fillStyle = '#15181C';
    for (const wx of [-15, -6, 13]) {
      ctx.beginPath();
      ctx.roundRect(wx - 3.3, -11.5, 6.6, 2.6, 0.8);
      ctx.roundRect(wx - 3.3, 8.9, 6.6, 2.6, 0.8);
      ctx.fill();
      ctx.strokeStyle = '#363D45';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    // Side mirrors sticking out from cab
    ctx.fillStyle = '#1C2026';
    ctx.fillRect(15.5, -11.8, 1.5, 3);
    ctx.fillRect(15.5, 8.8, 1.5, 3);

    // Flatbed steel frame
    ctx.fillStyle = '#1E231D';
    ctx.strokeStyle = rim;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.roundRect(-20, -9.6, 29, 19.2, 1.5);
    ctx.fill();
    ctx.stroke();

    // Inner recessed cargo bed floor
    ctx.fillStyle = '#151914';
    ctx.fillRect(-18.5, -8.2, 26, 16.4);

    // Armored KamAZ / KrAZ cab at front
    const cabGrad = ctx.createLinearGradient(0, -9.2, 0, 9.2);
    if (isUa) {
      cabGrad.addColorStop(0, '#5B6C4E');
      cabGrad.addColorStop(0.5, '#47563D');
      cabGrad.addColorStop(1, '#2D3826');
    } else {
      cabGrad.addColorStop(0, '#55614C');
      cabGrad.addColorStop(0.5, '#414B3A');
      cabGrad.addColorStop(1, '#293024');
    }
    ctx.fillStyle = cabGrad;
    ctx.strokeStyle = rim;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.roundRect(8.5, -9, 12.5, 18, 2.2);
    ctx.fill();
    ctx.stroke();

    // Recessed tinted front windshield with glass reflection
    ctx.fillStyle = '#121820';
    ctx.beginPath();
    ctx.roundRect(16.2, -7.2, 3.2, 14.4, 0.8);
    ctx.fill();
    ctx.fillStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.fillRect(17.4, -6.4, 0.9, 12.8);

    // Roof hatch & tactical markings
    ctx.fillStyle = '#333C2D';
    ctx.fillRect(10.5, -5.5, 4, 4.2);
    if (isUa) {
      ctx.fillStyle = '#2563EB';
      ctx.fillRect(9.2, -7.8, 1.8, 7.5);
      ctx.fillStyle = '#FACC15';
      ctx.fillRect(9.2, 0.3, 1.8, 7.5);
    } else {
      // White tactical numeral / roof mark
      ctx.fillStyle = 'rgba(226, 232, 240, 0.78)';
      ctx.font = '700 6px sans-serif';
      ctx.fillText('V', 11.2, 4.5);
    }

    // 3 amber roof clearance marker lights + front headlights
    ctx.fillStyle = '#F59E0B';
    for (const ly of [-2.4, 0, 2.4]) {
      ctx.fillRect(19.6, ly - 0.5, 1, 1);
    }
    ctx.fillStyle = 'rgba(254, 243, 199, 0.85)';
    ctx.fillRect(20.4, -7, 1.2, 2.4);
    ctx.fillRect(20.4, 4.6, 1.2, 2.4);

    // Twin steel lattice launch rails on cargo bed
    for (const ry of [-4.4, 4.4]) {
      ctx.strokeStyle = '#6E7781';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-18, ry - 1.1);
      ctx.lineTo(7, ry - 1.1);
      ctx.moveTo(-18, ry + 1.1);
      ctx.lineTo(7, ry + 1.1);
      ctx.stroke();
      ctx.strokeStyle = '#4B535D';
      ctx.lineWidth = 0.7;
      for (let rx = -16; rx <= 5; rx += 3.5) {
        ctx.beginPath();
        ctx.moveTo(rx, ry - 1.1);
        ctx.lineTo(rx, ry + 1.1);
        ctx.stroke();
      }
    }

    // Draw actual 3D-shaded drone models mounted on the launch rails (shows 2, 1, or 0!)
    const visibleSlots = isEmpty ? 0 : !reloadingReady ? Math.max(0, Math.min(2, ammo) - 1) : Math.min(2, ammo);
    const droneSprite = getMunitionSpriteCanvas(id);
    const slotYs = [-4.4, 4.4];
    for (let s = 0; s < visibleSlots; s++) {
      const sy = slotYs[s];
      if (droneSprite) {
        ctx.save();
        ctx.translate(-5.5, sy);
        ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
        ctx.shadowBlur = 3;
        ctx.shadowOffsetY = 1.5;
        ctx.drawImage(droneSprite, -15, -10.5, 30, 21);
        ctx.restore();
      }
    }
    return;
  }

  if (id === 'iskander' || id === 'sapsan') {
    // 8x8 MZKT-7930 / Sapsan TEL vehicle (matching image_2df51667 Iskander-M)
    ctx.fillStyle = '#15181C';
    for (const wx of [-17, -7, 4, 15]) {
      ctx.beginPath();
      ctx.roundRect(wx - 3.3, -12, 6.6, 2.6, 0.8);
      ctx.roundRect(wx - 3.3, 9.4, 6.6, 2.6, 0.8);
      ctx.fill();
      ctx.strokeStyle = '#383F48';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    const bodyGrad = ctx.createLinearGradient(0, -9.8, 0, 9.8);
    bodyGrad.addColorStop(0, '#6A7860');
    bodyGrad.addColorStop(0.5, '#525E4A');
    bodyGrad.addColorStop(1, '#333B2E');
    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = rim;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.roundRect(-21, -9.8, 43, 19.6, 2.4);
    ctx.fill();
    ctx.stroke();

    // Subtle olive camo blotches
    ctx.fillStyle = 'rgba(42, 50, 38, 0.55)';
    ctx.beginPath();
    ctx.ellipse(-8, -5, 6, 3, 0.3, 0, Math.PI * 2);
    ctx.ellipse(2, 4, 7, 3.5, -0.2, 0, Math.PI * 2);
    ctx.fill();

    // Split twin armored forward cabs (characteristic MZKT-7930 front)
    for (const cy of [-6.2, 1.4]) {
      ctx.fillStyle = '#4B5744';
      ctx.strokeStyle = rim;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.roundRect(11.5, cy, 9.5, 4.8, 1);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#121820';
      ctx.fillRect(17.5, cy + 0.8, 2.4, 3.2);
    }

    if (isUa) {
      ctx.fillStyle = '#2563EB';
      ctx.fillRect(8.5, -8.5, 2, 8);
      ctx.fillStyle = '#FACC15';
      ctx.fillRect(8.5, 0.5, 2, 8);
    }

    // Twin missile bay compartments (shows loaded missiles vs dark fired bays)
    const missileSprite = getMunitionSpriteCanvas(id);
    [-4.6, 4.6].forEach((by, idx) => {
      const loaded = idx < ammo;
      ctx.fillStyle = loaded ? '#2C3429' : '#0B0F0C';
      ctx.strokeStyle = '#1C221B';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.roundRect(-18.5, by - 3.6, 28, 7.2, 1);
      ctx.fill();
      ctx.stroke();
      if (loaded && missileSprite) {
        ctx.drawImage(missileSprite, -19, by - 8, 30, 20.5);
      }
    });
    return;
  }

  if (id === 'neptune') {
    // RK-360MC 8x8 Neptune coastal/ground cruise missile launcher
    ctx.fillStyle = '#15181C';
    for (const wx of [-16, -6, 5, 15]) {
      ctx.fillRect(wx - 3.1, -11.5, 6.2, 2.5);
      ctx.fillRect(wx - 3.1, 9, 6.2, 2.5);
    }
    const g = ctx.createLinearGradient(0, -9.5, 0, 9.5);
    g.addColorStop(0, '#5E6E5E');
    g.addColorStop(1, '#323C34');
    ctx.fillStyle = g;
    ctx.strokeStyle = rim;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.roundRect(-20, -9.5, 41, 19, 2.2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#121820';
    ctx.fillRect(15.5, -7, 3.2, 14);
    ctx.fillStyle = '#2563EB';
    ctx.fillRect(11, -8.5, 2, 8);
    ctx.fillStyle = '#FACC15';
    ctx.fillRect(11, 0.5, 2, 8);

    // 4 cylindrical launch canisters
    [-6.2, -2.2, 1.8, 5.8].forEach((cy, idx) => {
      const loaded = idx < ammo;
      ctx.fillStyle = loaded ? '#4A594D' : '#11161C';
      ctx.strokeStyle = rim;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.roundRect(-18, cy - 1.3, 27, 2.6, 1.1);
      ctx.fill();
      ctx.stroke();
      if (loaded) {
        ctx.fillStyle = '#D97706';
        ctx.fillRect(7.5, cy - 1, 1.5, 2);
      }
    });
    return;
  }

  if (id === 'flamingo') {
    // Heavy ramp trailer carrying the FP-5 Flamingo cruise missile
    ctx.fillStyle = '#15181C';
    for (const wx of [-15, -4, 12]) {
      ctx.fillRect(wx - 3.1, -11, 6.2, 2.3);
      ctx.fillRect(wx - 3.1, 8.7, 6.2, 2.3);
    }
    const g = ctx.createLinearGradient(0, -9, 0, 9);
    g.addColorStop(0, '#55606B');
    g.addColorStop(1, '#2D343C');
    ctx.fillStyle = g;
    ctx.strokeStyle = rim;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.roundRect(-19, -9, 39, 18, 2.2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#2563EB';
    ctx.fillRect(13, -8, 2.2, 7.5);
    ctx.fillStyle = '#FACC15';
    ctx.fillRect(13, 0.5, 2.2, 7.5);

    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-17, -4);
    ctx.lineTo(14, -4);
    ctx.moveTo(-17, 4);
    ctx.lineTo(14, 4);
    ctx.stroke();

    if (!isEmpty) {
      const mSprite = getMunitionSpriteCanvas('flamingo');
      if (mSprite) {
        ctx.drawImage(mSprite, -18, -12, 34, 24);
      }
    }
    return;
  }

  if (id === 'airstrike' || id === 'su57-kab') {
    // Tactical forward airpad with parked realistic fighter
    ctx.fillStyle = '#252D36';
    ctx.strokeStyle = rim;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.roundRect(-20, -12, 40, 24, 3);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#EAB308';
    ctx.lineWidth = 1.1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(-16, 0);
    ctx.lineTo(16, 0);
    ctx.stroke();
    ctx.setLineDash([]);
    if (!isEmpty) {
      const jet = getMunitionSpriteCanvas(id);
      if (jet) {
        ctx.drawImage(jet, -20, -14, 40, 28);
      }
    }
    return;
  }

  if (id === 'kab') {
    // Bomb pylon rack carrying 3D KAB UMPK glide bombs
    ctx.fillStyle = '#283038';
    ctx.strokeStyle = rim;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.roundRect(-16, -11, 32, 22, 2.5);
    ctx.fill();
    ctx.stroke();
    const kabSprite = getMunitionSpriteCanvas('kab');
    for (let i = 0; i < 3; i++) {
      if (i < ammo && kabSprite) {
        ctx.drawImage(kabSprite, -14, -13 + i * 6.5, 28, 18);
      }
    }
    return;
  }

  // Container TEL (Kalibr-K / Kh-101)
  ctx.fillStyle = '#15181C';
  for (const wx of [-15, -5, 6, 15]) {
    ctx.fillRect(wx - 3, -11.2, 6, 2.3);
    ctx.fillRect(wx - 3, 8.9, 6, 2.3);
  }
  const cg = ctx.createLinearGradient(0, -9, 0, 9);
  cg.addColorStop(0, '#5A6454');
  cg.addColorStop(1, '#30372C');
  ctx.fillStyle = cg;
  ctx.strokeStyle = rim;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.roundRect(-19.5, -9, 39.5, 18, 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#121820';
  ctx.fillRect(15.5, -6.5, 3, 13);

  let cellIdx = 0;
  for (const gx of [-13.5, -2.5]) {
    for (const gy of [-6.2, 1.2]) {
      const loaded = cellIdx < ammo;
      ctx.fillStyle = loaded ? '#4B5546' : '#0C1014';
      ctx.strokeStyle = '#1C221A';
      ctx.lineWidth = 0.8;
      ctx.fillRect(gx, gy, 8.5, 5);
      ctx.strokeRect(gx, gy, 8.5, 5);
      cellIdx++;
    }
  }
}

export function getLauncherSpriteDataUrl(id: MunitionId): string {
  if (launcherUrlCache[id]) return launcherUrlCache[id]!;
  if (typeof document === 'undefined') return '';
  // Drones & air-launched / pure missiles show the realistic 3D drone/missile model in the menu;
  // iconic ground TEL systems (Iskander-M, Sapsan, Neptune, Flamingo) show the photorealistic TEL launcher!
  const showVehicleInMenu =
    id === 'iskander' || id === 'sapsan' || id === 'neptune' || id === 'flamingo';
  if (!showVehicleInMenu) {
    const url = getMunitionSpriteDataUrl(id);
    launcherUrlCache[id] = url;
    return url;
  }

  const W = 220;
  const H = 150;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(3.6, 3.6);
  const faction = id === 'iskander' ? 'RU' : 'UA';
  const maxAmmo = id === 'neptune' ? 4 : 2;
  drawRealisticLauncherChassis(ctx, id, faction, maxAmmo, true);
  ctx.restore();
  const url = c.toDataURL('image/png');
  launcherUrlCache[id] = url;
  return url;
}

export function getPvoSpriteDataUrl(id: AirDefenseId): string {
  if (pvoUrlCache[id]) return pvoUrlCache[id]!;
  if (typeof document === 'undefined') return '';
  const W = 220;
  const H = 150;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(3.9, 3.9);
  drawRealisticPvoTopDown(ctx, id, 4);
  ctx.restore();
  const url = c.toDataURL('image/png');
  pvoUrlCache[id] = url;
  return url;
}

export function drawRealisticPvoTopDown(
  ctx: CanvasRenderingContext2D,
  id: AirDefenseId,
  ammo: number,
) {
  const rim = 'rgba(10, 14, 20, 0.9)';

  if (id === 'mg-pickup') {
    // 4x4 Tactical Technical Pickup (Hilux / HMMWV-style)
    ctx.fillStyle = '#11151A';
    for (const wx of [-9.2, 7.2]) {
      for (const wy of [-8.4, 6.2]) {
        ctx.beginPath();
        ctx.roundRect(wx - 2.6, wy, 5.2, 2.2, 0.6);
        ctx.fill();
        ctx.fillStyle = '#2B3138';
        ctx.fillRect(wx - 1.5, wy + 0.45, 3, 1.3);
        ctx.fillStyle = '#11151A';
      }
    }

    // Main olive-drab chassis body
    const bodyGrad = ctx.createLinearGradient(0, -6.6, 0, 6.6);
    bodyGrad.addColorStop(0, '#667458');
    bodyGrad.addColorStop(0.5, '#4A5640');
    bodyGrad.addColorStop(1, '#2E3628');
    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = rim;
    ctx.lineWidth = 0.85;
    ctx.beginPath();
    ctx.roundRect(-13.2, -6.4, 26.2, 12.8, 2);
    ctx.fill();
    ctx.stroke();

    // Rear cargo bed + dark bedliner & ammo crates
    ctx.fillStyle = '#22281E';
    ctx.strokeStyle = 'rgba(15, 20, 15, 0.9)';
    ctx.lineWidth = 0.65;
    ctx.fillRect(-11.8, -5.2, 11.4, 10.4);
    ctx.strokeRect(-11.8, -5.2, 11.4, 10.4);

    // Bed floor ribs
    ctx.strokeStyle = 'rgba(72, 84, 65, 0.35)';
    ctx.lineWidth = 0.5;
    for (const ry of [-3.2, -1.1, 1.1, 3.2]) {
      ctx.beginPath();
      ctx.moveTo(-11.4, ry);
      ctx.lineTo(-1, ry);
      ctx.stroke();
    }

    // Steel rollbar behind cab + spare wheel / ammo box
    ctx.fillStyle = '#1E242B';
    ctx.fillRect(-1.2, -5.5, 1.3, 11);
    ctx.fillStyle = '#3C4A33';
    ctx.fillRect(-11, 2.4, 3.4, 2.2);

    // Armored cab roof + sun hatch
    ctx.fillStyle = '#58664B';
    ctx.strokeStyle = rim;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.roundRect(0.2, -5.5, 6.4, 11, 1);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#404B37';
    ctx.fillRect(1.6, -3.2, 3.2, 6.4);

    // Tinted windshield + side mirrors
    ctx.fillStyle = '#101822';
    ctx.beginPath();
    ctx.roundRect(6.4, -4.9, 2.7, 9.8, 0.7);
    ctx.fill();
    ctx.strokeStyle = '#6C7A60';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(6.2, -6.4);
    ctx.lineTo(6.2, -7.7);
    ctx.moveTo(6.2, 6.4);
    ctx.lineTo(6.2, 7.7);
    ctx.stroke();

    // Hood louvers + front bumper + headlights
    ctx.fillStyle = '#3B4633';
    ctx.fillRect(9.8, -3.4, 2.2, 6.8);
    ctx.fillStyle = '#1A1E24';
    ctx.fillRect(12.6, -5.8, 1.2, 11.6);
    ctx.fillStyle = 'rgba(254, 240, 138, 0.85)';
    ctx.fillRect(12.3, -5.1, 1.2, 1.9);
    ctx.fillRect(12.3, 3.2, 1.2, 1.9);
    return;
  }

  if (id === 'gepard') {
    // Flakpanzer Gepard SPAAG (Leopard 1 tracked chassis + twin 35mm Oerlikon turret)
    // Heavy caterpillar tracks with tread grooves
    ctx.fillStyle = '#141815';
    ctx.fillRect(-15.5, -10.2, 31, 3.0);
    ctx.fillRect(-15.5, 7.2, 31, 3.0);
    ctx.strokeStyle = '#333934';
    ctx.lineWidth = 0.65;
    for (let tx = -14; tx <= 14; tx += 2.8) {
      ctx.beginPath();
      ctx.moveTo(tx, -10.2);
      ctx.lineTo(tx, -7.2);
      ctx.moveTo(tx, 7.2);
      ctx.lineTo(tx, 10.2);
      ctx.stroke();
    }

    // Tracked hull + armored side skirts
    const hullGrad = ctx.createLinearGradient(0, -7.8, 0, 7.8);
    hullGrad.addColorStop(0, '#69775E');
    hullGrad.addColorStop(0.5, '#4D5845');
    hullGrad.addColorStop(1, '#31392B');
    ctx.fillStyle = hullGrad;
    ctx.strokeStyle = rim;
    ctx.lineWidth = 0.85;
    ctx.beginPath();
    ctx.roundRect(-14.5, -7.8, 29, 15.6, 1.8);
    ctx.fill();
    ctx.stroke();

    // Rear engine deck cooling grilles + exhaust louvers
    ctx.fillStyle = '#252C21';
    ctx.fillRect(-13.2, -5.8, 6.2, 11.6);
    ctx.strokeStyle = '#4E5847';
    ctx.lineWidth = 0.6;
    for (let gx = -12.4; gx <= -7.8; gx += 1.5) {
      ctx.beginPath();
      ctx.moveTo(gx, -5.2);
      ctx.lineTo(gx, 5.2);
      ctx.stroke();
    }

    // Glacis driver periscope + front headlights
    ctx.fillStyle = '#18212C';
    ctx.fillRect(10.5, -4.6, 2.2, 2.6);
    ctx.fillStyle = 'rgba(254, 240, 138, 0.8)';
    ctx.fillRect(13.5, -6.5, 1.1, 1.6);
    ctx.fillRect(13.5, 4.9, 1.1, 1.6);

    // Twin 35mm Oerlikon KDA gun pods + ribbed barrels + muzzle velocity radars
    for (const gy of [-5.8, 5.8]) {
      ctx.fillStyle = '#3B4437';
      ctx.strokeStyle = rim;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.roundRect(-2.5, gy - 1.7, 7.2, 3.4, 0.8);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = '#7E8891';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(4.5, gy);
      ctx.lineTo(20.5, gy);
      ctx.stroke();

      // Perforated muzzle brake / chronograph tip
      ctx.fillStyle = '#22282F';
      ctx.fillRect(18.2, gy - 1.35, 2.8, 2.7);
    }

    // Armored Gepard turret body + commander hatches
    ctx.fillStyle = '#5F6D56';
    ctx.strokeStyle = rim;
    ctx.lineWidth = 0.85;
    ctx.beginPath();
    ctx.roundRect(-7.5, -5.4, 13.5, 10.8, 3.5);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#475240';
    ctx.beginPath();
    ctx.arc(-1.8, -2.3, 1.8, 0, Math.PI * 2);
    ctx.arc(-1.8, 2.3, 1.8, 0, Math.PI * 2);
    ctx.fill();

    // Front tracking radar dish & dome
    ctx.fillStyle = '#89949E';
    ctx.strokeStyle = rim;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.arc(5.6, 0, 2.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    return;
  }

  if (id === 'iris-t' || id === 's300') {
    // Heavy 8x8 TELAR / TEL Launcher (MAN HX 8x8 for IRIS-T SLM / MAZ-543 8x8 for S-300PS)
    ctx.fillStyle = '#12161B';
    for (const wx of [-13, -5, 4, 12]) {
      for (const wy of [-10.6, 8.2]) {
        ctx.beginPath();
        ctx.roundRect(wx - 2.5, wy, 5.0, 2.4, 0.7);
        ctx.fill();
        ctx.fillStyle = '#2A3138';
        ctx.fillRect(wx - 1.3, wy + 0.5, 2.6, 1.4);
        ctx.fillStyle = '#12161B';
      }
    }

    // Hydraulic outrigger pads deployed laterally
    ctx.fillStyle = '#2D343C';
    ctx.strokeStyle = rim;
    ctx.lineWidth = 0.6;
    for (const ox of [-10, 7]) {
      ctx.fillRect(ox - 1.2, -10.4, 2.4, 2.2);
      ctx.fillRect(ox - 1.2, 8.2, 2.4, 2.2);
    }

    const chassisGrad = ctx.createLinearGradient(0, -8.2, 0, 8.2);
    chassisGrad.addColorStop(0, '#62705A');
    chassisGrad.addColorStop(0.5, '#475340');
    chassisGrad.addColorStop(1, '#293125');
    ctx.fillStyle = chassisGrad;
    ctx.strokeStyle = rim;
    ctx.lineWidth = 0.85;
    ctx.beginPath();
    ctx.roundRect(-16, -8.2, 32, 16.4, 2);
    ctx.fill();
    ctx.stroke();

    if (id === 's300') {
      // Iconic MAZ-543 split twin-cab front with central radiator bay
      ctx.fillStyle = '#53604B';
      ctx.strokeStyle = rim;
      ctx.lineWidth = 0.65;
      ctx.fillRect(9.2, -7.8, 6.2, 5.2);
      ctx.strokeRect(9.2, -7.8, 6.2, 5.2);
      ctx.fillRect(9.2, 2.6, 6.2, 5.2);
      ctx.strokeRect(9.2, 2.6, 6.2, 5.2);
      ctx.fillStyle = '#1E251F';
      ctx.fillRect(9.5, -2.5, 5.5, 5.0);
      ctx.fillStyle = '#101822';
      ctx.fillRect(13.2, -7.1, 1.7, 3.8);
      ctx.fillRect(13.2, 3.3, 1.7, 3.8);

      // 4 massive ribbed S-300PS 5P85S TEL cylindrical canisters
      const canisterYs = [-5.8, -2.0, 1.8, 5.6];
      canisterYs.forEach((cy, idx) => {
        const loaded = idx < ammo;
        ctx.fillStyle = loaded ? '#586452' : '#1A2026';
        ctx.strokeStyle = rim;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.roundRect(-14.6, cy - 1.5, 22.8, 3.0, 1.1);
        ctx.fill();
        ctx.stroke();
        // Canister stiffening ribs & end-cap ring
        ctx.fillStyle = loaded ? '#798574' : '#2C333B';
        ctx.fillRect(-14.2, cy - 1.3, 1.5, 2.6);
        ctx.fillRect(6.5, cy - 1.3, 1.5, 2.6);
        ctx.fillRect(-5.5, cy - 1.3, 1.1, 2.6);
      });
    } else {
      // MAN HX armored cab + panoramic windshield
      ctx.fillStyle = '#5A6751';
      ctx.strokeStyle = rim;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.roundRect(8.4, -7.5, 7.0, 15.0, 1.4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#101822';
      ctx.fillRect(12.2, -6.4, 2.4, 12.8);
      ctx.fillStyle = 'rgba(254, 240, 138, 0.8)';
      ctx.fillRect(15.0, -6.5, 0.9, 1.8);
      ctx.fillRect(15.0, 4.7, 0.9, 1.8);

      // IRIS-T SLM 8-cell VLS launcher rack frame
      ctx.fillStyle = '#252D28';
      ctx.strokeStyle = rim;
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      ctx.roundRect(-14.8, -7.0, 21.6, 14.0, 1.2);
      ctx.fill();
      ctx.stroke();

      let cellIdx = 0;
      for (const cx of [-11.5, -6.2, -0.9, 4.2]) {
        for (const cy of [-3.4, 3.4]) {
          const loaded = cellIdx < ammo;
          cellIdx += 1;
          ctx.fillStyle = loaded ? '#647264' : '#10151C';
          ctx.strokeStyle = rim;
          ctx.lineWidth = 0.65;
          ctx.beginPath();
          ctx.roundRect(cx - 2.1, cy - 2.4, 4.2, 4.8, 0.6);
          ctx.fill();
          ctx.stroke();
          if (loaded) {
            ctx.fillStyle = '#97A89E';
            ctx.beginPath();
            ctx.arc(cx, cy, 1.1, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }
    return;
  }

  if (id === 'radar') {
    // 36D6 / AN/MPQ-65 Mobile Surveillance Radar Complex (6x6 tractor + shelter + stabilizer legs)
    ctx.fillStyle = '#12161B';
    for (const wx of [-11.5, -1, 10]) {
      for (const wy of [-10.0, 7.8]) {
        ctx.beginPath();
        ctx.roundRect(wx - 2.4, wy, 4.8, 2.2, 0.6);
        ctx.fill();
      }
    }

    // Outrigger support struts
    ctx.strokeStyle = '#6E7985';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-11, -7.5);
    ctx.lineTo(-14, -10.8);
    ctx.moveTo(-11, 7.5);
    ctx.lineTo(-14, 10.8);
    ctx.moveTo(6, -7.5);
    ctx.lineTo(8, -10.8);
    ctx.moveTo(6, 7.5);
    ctx.lineTo(8, 10.8);
    ctx.stroke();

    const g = ctx.createLinearGradient(0, -7.6, 0, 7.6);
    g.addColorStop(0, '#586753');
    g.addColorStop(0.5, '#424F3E');
    g.addColorStop(1, '#283126');
    ctx.fillStyle = g;
    ctx.strokeStyle = rim;
    ctx.lineWidth = 0.85;
    ctx.beginPath();
    ctx.roundRect(-14.8, -7.6, 29.6, 15.2, 2);
    ctx.fill();
    ctx.stroke();

    // Cab + windshield
    ctx.fillStyle = '#101822';
    ctx.fillRect(10.6, -5.8, 2.8, 11.6);

    // Armored radar electronics shelter + cooling grilles
    ctx.fillStyle = '#333F32';
    ctx.strokeStyle = rim;
    ctx.lineWidth = 0.7;
    ctx.fillRect(-13.4, -6.2, 21.4, 12.4);
    ctx.strokeRect(-13.4, -6.2, 21.4, 12.4);

    ctx.fillStyle = '#202721';
    ctx.fillRect(-12.2, -4.6, 4.2, 9.2);
    ctx.fillStyle = '#4B5A4C';
    ctx.beginPath();
    ctx.arc(-1.5, 0, 4.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    return;
  }

  // Patriot M901 M860 Semi-Trailer Launcher (4 canted PAC-2/PAC-3 rectangular canisters + outriggers + generator)
  // Heavy ground outrigger stabilizer pads
  ctx.strokeStyle = '#6A737D';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(-12, -8.5);
  ctx.lineTo(-17.5, -13);
  ctx.moveTo(-12, 8.5);
  ctx.lineTo(-17.5, 13);
  ctx.moveTo(11, -8.5);
  ctx.lineTo(16.5, -13);
  ctx.moveTo(11, 8.5);
  ctx.lineTo(16.5, 13);
  ctx.stroke();

  ctx.fillStyle = '#222830';
  for (const [px, py] of [
    [-17.5, -13],
    [-17.5, 13],
    [16.5, -13],
    [16.5, 13],
  ]) {
    ctx.beginPath();
    ctx.arc(px, py, 1.9, 0, Math.PI * 2);
    ctx.fill();
  }

  // Semi-trailer flatbed deck
  const pg = ctx.createLinearGradient(0, -8.8, 0, 8.8);
  pg.addColorStop(0, '#626F5A');
  pg.addColorStop(0.5, '#4B5644');
  pg.addColorStop(1, '#323A2E');
  ctx.fillStyle = pg;
  ctx.strokeStyle = rim;
  ctx.lineWidth = 0.85;
  ctx.beginPath();
  ctx.roundRect(-15.5, -8.8, 31, 17.6, 1.8);
  ctx.fill();
  ctx.stroke();

  // Rear generator & hydraulic turntable base
  ctx.fillStyle = '#2D352B';
  ctx.fillRect(-14.4, -6.8, 4.2, 13.6);
  ctx.fillStyle = '#3D4838';
  ctx.beginPath();
  ctx.arc(0, 0, 6.2, 0, Math.PI * 2);
  ctx.fill();

  // 4 rectangular Patriot M901 launch canisters with structural ribs & frangible front covers
  for (let i = 0; i < 4; i++) {
    const cy = -7.0 + i * 3.8;
    const loaded = i < ammo;
    ctx.fillStyle = loaded ? '#68755E' : '#15191F';
    ctx.strokeStyle = rim;
    ctx.lineWidth = 0.7;
    ctx.fillRect(-10.5, cy, 24.5, 3.0);
    ctx.strokeRect(-10.5, cy, 24.5, 3.0);

    // Canister structural bands & frangible nose cover
    ctx.fillStyle = loaded ? '#88957E' : '#252B33';
    ctx.fillRect(-2.5, cy + 0.2, 1.3, 2.6);
    ctx.fillRect(5.5, cy + 0.2, 1.3, 2.6);
    ctx.fillStyle = loaded ? '#B2BEAB' : '#0E1217';
    ctx.fillRect(12.2, cy + 0.3, 1.6, 2.4);
  }
}
