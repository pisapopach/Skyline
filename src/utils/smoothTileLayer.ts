import L from 'leaflet';

export interface SmoothTileOptions extends L.GridLayerOptions {
  styleKey: string;
  url: string;
  subdomains?: string[];
  maxNativeZoom: number;
  transparent?: boolean;
}

const MAX_CACHE_ENTRIES = 1600;
const imageCache = new Map<string, HTMLImageElement>();
const inFlightLoads = new Map<string, Promise<HTMLImageElement | null>>();

function makeCacheKey(styleKey: string, z: number, x: number, y: number): string {
  return `${styleKey}:${z}:${x}:${y}`;
}

function setCachedImage(key: string, z: number, img: HTMLImageElement) {
  if (imageCache.has(key)) {
    imageCache.delete(key);
  }
  imageCache.set(key, img);

  if (imageCache.size > MAX_CACHE_ENTRIES) {
    // Evict oldest high-zoom tiles first; always preserve low-zoom overview tiles (z <= 6)
    for (const oldKey of imageCache.keys()) {
      const parts = oldKey.split(':');
      const oldZ = Number(parts[1]);
      if (oldZ > 6) {
        imageCache.delete(oldKey);
        if (imageCache.size <= MAX_CACHE_ENTRIES - 150) break;
      }
    }
    while (imageCache.size > MAX_CACHE_ENTRIES) {
      const first = imageCache.keys().next().value;
      if (!first) break;
      imageCache.delete(first);
    }
  }
}

function resolveTileUrl(
  template: string,
  subdomains: string[] | undefined,
  z: number,
  x: number,
  y: number,
): string {
  const s =
    subdomains && subdomains.length > 0
      ? subdomains[Math.abs(x + y) % subdomains.length]
      : 'a';
  return template
    .replace('{s}', s)
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y));
}

function loadTileImage(
  styleKey: string,
  template: string,
  subdomains: string[] | undefined,
  z: number,
  x: number,
  y: number,
): Promise<HTMLImageElement | null> {
  const key = makeCacheKey(styleKey, z, x, y);
  const existing = imageCache.get(key);
  if (existing && existing.complete && existing.naturalWidth > 0) {
    return Promise.resolve(existing);
  }
  const pending = inFlightLoads.get(key);
  if (pending) return pending;

  const url = resolveTileUrl(template, subdomains, z, x, y);
  const promise = new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      inFlightLoads.delete(key);
      if (img.naturalWidth > 0) {
        setCachedImage(key, z, img);
        resolve(img);
      } else {
        resolve(null);
      }
    };
    img.onerror = () => {
      inFlightLoads.delete(key);
      resolve(null);
    };
    img.src = url;
  });

  inFlightLoads.set(key, promise);
  return promise;
}

/**
 * Pre-warms overview tiles (z=4 and z=5) covering Ukraine, Russia & surrounding regions
 * so any fast zoom or pan immediately has cached ancestor tiles available in 0ms.
 */
export function prewarmTheaterOverviewTiles(
  styleKey: string,
  url: string,
  subdomains?: string[],
) {
  // Zoom 4 tiles covering Europe / Ukraine / Russia (x: 8..12, y: 3..6)
  for (let x = 8; x <= 12; x++) {
    for (let y = 3; y <= 6; y++) {
      void loadTileImage(styleKey, url, subdomains, 4, x, y);
    }
  }
  // Zoom 5 tiles covering Ukraine & Western Russia (x: 17..22, y: 8..12)
  for (let x = 17; x <= 22; x++) {
    for (let y = 8; y <= 12; y++) {
      void loadTileImage(styleKey, url, subdomains, 5, x, y);
    }
  }
}

/**
 * Synchronous canvas fallback drawer:
 * Draws highest-resolution cached ancestor quadrant (or child mosaic on zoom-out)
 * onto the tile <canvas> BEFORE it enters the DOM, eliminating black frames on zoom.
 */
function paintFallbackFromCache(
  ctx: CanvasRenderingContext2D,
  styleKey: string,
  z: number,
  x: number,
  y: number,
  tileSize: number,
  transparent: boolean,
): boolean {
  let drewAnything = false;

  if (!transparent) {
    ctx.fillStyle = '#0c1626';
    ctx.fillRect(0, 0, tileSize, tileSize);
  }

  // 1. Check highest-resolution cached ancestor tile (zooming in / panning)
  for (let dz = 1; dz <= z; dz++) {
    const az = z - dz;
    const scale = 1 << dz;
    const ax = Math.floor(x / scale);
    const ay = Math.floor(y / scale);
    const key = makeCacheKey(styleKey, az, ax, ay);
    const ancestor = imageCache.get(key);
    if (ancestor && ancestor.complete && ancestor.naturalWidth > 0) {
      const ox = x - ax * scale;
      const oy = y - ay * scale;
      const sw = ancestor.naturalWidth / scale;
      const sh = ancestor.naturalHeight / scale;
      ctx.drawImage(
        ancestor,
        ox * sw,
        oy * sh,
        sw,
        sh,
        0,
        0,
        tileSize,
        tileSize,
      );
      drewAnything = true;
      break;
    }
  }

  // 2. Check immediate cached children (z+1) for crisp mosaic when zooming out
  const childZ = z + 1;
  const half = tileSize / 2;
  for (let dx = 0; dx < 2; dx++) {
    for (let dy = 0; dy < 2; dy++) {
      const cx = x * 2 + dx;
      const cy = y * 2 + dy;
      const childImg = imageCache.get(makeCacheKey(styleKey, childZ, cx, cy));
      if (childImg && childImg.complete && childImg.naturalWidth > 0) {
        ctx.drawImage(childImg, dx * half, dy * half, half, half);
        drewAnything = true;
      }
    }
  }

  return drewAnything;
}

export class SmoothCachedTileLayer extends L.GridLayer {
  private tileOpts: SmoothTileOptions;
  private isZoomActiveFn: () => boolean;

  constructor(options: SmoothTileOptions, isZoomActiveFn: () => boolean) {
    super(options);
    this.tileOpts = options;
    this.isZoomActiveFn = isZoomActiveFn;
  }

  protected _invalidateAll() {
    const map = (this as unknown as { _map?: L.Map })._map;
    const tileZoom = (this as unknown as { _tileZoom?: number })._tileZoom;
    if (this.isZoomActiveFn() && map && tileZoom !== undefined) {
      return;
    }
    const protoInvalidate = (
      L.GridLayer.prototype as unknown as { _invalidateAll: () => void }
    )._invalidateAll;
    protoInvalidate.call(this);
  }

  protected _resetView(e: L.LeafletEvent) {
    const map = (this as unknown as { _map?: L.Map })._map;
    const tileZoom = (this as unknown as { _tileZoom?: number })._tileZoom;
    if (this.isZoomActiveFn() && map && tileZoom !== undefined) {
      const targetZoom = Math.min(
        this.tileOpts.maxNativeZoom,
        Math.max(this.tileOpts.minZoom ?? 0, Math.round(map.getZoom())),
      );
      if (targetZoom === tileZoom) {
        (
          this as unknown as { _setZoomTransforms: (c: L.LatLng, z: number) => void }
        )._setZoomTransforms(map.getCenter(), map.getZoom());
        return;
      }
    }
    const protoReset = (
      L.GridLayer.prototype as unknown as { _resetView: (ev: L.LeafletEvent) => void }
    )._resetView;
    protoReset.call(this, e);
  }

  createTile(coords: L.Coords, done: L.DoneCallback): HTMLElement {
    const size = this.getTileSize();
    const canvas = document.createElement('canvas');
    canvas.width = size.x;
    canvas.height = size.y;
    canvas.className = 'leaflet-tile leaflet-tile-loaded';
    canvas.style.visibility = 'visible';
    canvas.style.opacity = '1';

    const ctx = canvas.getContext('2d');
    const maxZ = this.tileOpts.maxNativeZoom;
    const reqZ = Math.min(coords.z, maxZ);
    const scaleDiff = Math.max(0, coords.z - reqZ);
    const divisor = 1 << scaleDiff;
    const reqX = Math.floor(coords.x / divisor);
    const reqY = Math.floor(coords.y / divisor);

    const wrapCount = 1 << reqZ;
    const normX = ((reqX % wrapCount) + wrapCount) % wrapCount;

    if (!ctx || reqY < 0 || reqY >= wrapCount) {
      queueMicrotask(() => done(undefined, canvas));
      return canvas;
    }

    const { styleKey, url, subdomains, transparent = false } = this.tileOpts;
    const exactKey = makeCacheKey(styleKey, reqZ, normX, reqY);
    const exactImg = imageCache.get(exactKey);

    const drawSubTile = (img: HTMLImageElement) => {
      if (scaleDiff === 0) {
        ctx.drawImage(img, 0, 0, size.x, size.y);
      } else {
        const ox = coords.x - reqX * divisor;
        const oy = coords.y - reqY * divisor;
        const sw = img.naturalWidth / divisor;
        const sh = img.naturalHeight / divisor;
        ctx.drawImage(img, ox * sw, oy * sh, sw, sh, 0, 0, size.x, size.y);
      }
    };

    if (exactImg && exactImg.complete && exactImg.naturalWidth > 0) {
      drawSubTile(exactImg);
      queueMicrotask(() => done(undefined, canvas));
      return canvas;
    }

    // Synchronous ancestor/child paint -> 0ms non-black tile immediately on screen
    paintFallbackFromCache(ctx, styleKey, reqZ, normX, reqY, size.x, transparent);

    loadTileImage(styleKey, url, subdomains, reqZ, normX, reqY).then((img) => {
      if (img && canvas.isConnected) {
        if (transparent) {
          ctx.clearRect(0, 0, size.x, size.y);
        }
        drawSubTile(img);
      }
      done(undefined, canvas);
    });

    return canvas;
  }
}
