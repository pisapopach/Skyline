import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson';
import { MUNITION_BY_ID, type MunitionId } from '../data/munitions';
import rawRaionsData from '../data/ukraineRaions.json';
import rawOblastsData from '../data/ukraineOblasts.json';
import rawRussiaRegionsData from '../data/russiaRegions.json';
import { haversineDistanceKm } from './geoBoundaries';

export type ThreatLevel = 'none' | 'drone' | 'missile';

export interface RaionMeta {
  id: string;
  name: string;
  oblast: string;
}

export interface RaionProperties extends RaionMeta {}

interface IndexedRaion {
  meta: RaionMeta;
  polys: {
    rings: Position[][];
    minLng: number;
    maxLng: number;
    minLat: number;
    maxLat: number;
  }[];
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
  centerLat: number;
  centerLng: number;
  approxRadiusKm: number;
}

export const ukraineRaionsGeoJson = rawRaionsData as unknown as FeatureCollection<
  Polygon | MultiPolygon,
  RaionProperties
>;

export const ukraineOblastsGeoJson = rawOblastsData as unknown as FeatureCollection<
  Polygon | MultiPolygon,
  { id: string; name: string }
>;

export const russiaRegionsGeoJson = rawRussiaRegionsData as unknown as FeatureCollection<
  Polygon | MultiPolygon,
  RaionProperties
>;

function pointInRing(lng: number, lat: number, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInRaion(lat: number, lng: number, r: IndexedRaion): boolean {
  if (lat < r.minLat || lat > r.maxLat || lng < r.minLng || lng > r.maxLng) return false;
  for (const poly of r.polys) {
    if (lat < poly.minLat || lat > poly.maxLat || lng < poly.minLng || lng > poly.maxLng) {
      continue;
    }
    if (pointInRing(lng, lat, poly.rings[0])) {
      let inHole = false;
      for (let h = 1; h < poly.rings.length; h++) {
        if (pointInRing(lng, lat, poly.rings[h])) {
          inHole = true;
          break;
        }
      }
      if (!inHole) return true;
    }
  }
  return false;
}

function buildIndexedRaions(fc: FeatureCollection<Polygon | MultiPolygon, RaionProperties>): IndexedRaion[] {
  return fc.features.map((feat: Feature<Polygon | MultiPolygon, RaionProperties>) => {
    const rawPolys =
      feat.geometry.type === 'Polygon' ? [feat.geometry.coordinates] : feat.geometry.coordinates;

    let rMinLng = Infinity;
    let rMaxLng = -Infinity;
    let rMinLat = Infinity;
    let rMaxLat = -Infinity;

    const polys = rawPolys.map((rings) => {
      let minLng = Infinity;
      let maxLng = -Infinity;
      let minLat = Infinity;
      let maxLat = -Infinity;
      for (const pt of rings[0]) {
        if (pt[0] < minLng) minLng = pt[0];
        if (pt[0] > maxLng) maxLng = pt[0];
        if (pt[1] < minLat) minLat = pt[1];
        if (pt[1] > maxLat) maxLat = pt[1];
      }
      if (minLng < rMinLng) rMinLng = minLng;
      if (maxLng > rMaxLng) rMaxLng = maxLng;
      if (minLat < rMinLat) rMinLat = minLat;
      if (maxLat > rMaxLat) rMaxLat = maxLat;
      return { rings, minLng, maxLng, minLat, maxLat };
    });

    const centerLat = (rMinLat + rMaxLat) * 0.5;
    const centerLng = (rMinLng + rMaxLng) * 0.5;
    const approxRadiusKm = haversineDistanceKm(centerLat, centerLng, rMaxLat, rMaxLng) + 3;

    return {
      meta: {
        id: feat.properties.id,
        name: feat.properties.name,
        oblast: feat.properties.oblast,
      },
      polys,
      minLng: rMinLng,
      maxLng: rMaxLng,
      minLat: rMinLat,
      maxLat: rMaxLat,
      centerLat,
      centerLng,
      approxRadiusKm,
    };
  });
}

const indexedRaions = buildIndexedRaions(ukraineRaionsGeoJson);
const indexedRussiaRegions = buildIndexedRaions(russiaRegionsGeoJson);

const ORDLO_DONETSK_RAION_IDS = new Set([
  'ua_r_50', // Донецький район
  'ua_r_55', // Горлівський район
  'ua_r_56', // Кальміуський район
]);

export const PERMANENT_ALERT_RAION_IDS: ReadonlySet<string> = new Set(
  indexedRaions
    .filter(
      (r) =>
        r.meta.oblast === 'АР Крим' ||
        r.meta.oblast === 'м. Севастополь' ||
        r.meta.oblast === 'Луганська область' ||
        ORDLO_DONETSK_RAION_IDS.has(r.meta.id),
    )
    .map((r) => r.meta.id),
);

export function isPermanentAlertRaionId(raionId: string): boolean {
  return PERMANENT_ALERT_RAION_IDS.has(raionId);
}

const WESTERN_UA_EXCLUDED_OBLASTS: ReadonlySet<string> = new Set([
  'Волинська область',
  'Рівненська область',
  'Львівська область',
  'Тернопільська область',
  'Хмельницька область',
  'Івано-Франківська область',
  'Чернівецька область',
  'Закарпатська область',
]);

const RAION_META_BY_ID = new Map<string, RaionMeta>(indexedRaions.map((r) => [r.meta.id, r.meta]));

export function getRaionMetaById(raionId: string): RaionMeta | null {
  return RAION_META_BY_ID.get(raionId) ?? null;
}

export function getRaionAt(lat: number, lng: number): RaionMeta | null {
  for (const r of indexedRaions) {
    if (pointInRaion(lat, lng, r)) {
      return r.meta;
    }
  }
  for (const r of indexedRussiaRegions) {
    if (pointInRaion(lat, lng, r)) {
      return r.meta;
    }
  }
  return null;
}

function isPointWithinRadiusOfRaion(
  lat: number,
  lng: number,
  raion: IndexedRaion,
  radiusKm: number,
): boolean {
  // Fast bounding-box rejection before computing spherical haversine distance
  const degPadLat = radiusKm / 110.5 + 0.08;
  const degPadLng = radiusKm / (110.5 * Math.max(0.2, Math.cos((lat * Math.PI) / 180))) + 0.08;
  if (
    lat < raion.minLat - degPadLat ||
    lat > raion.maxLat + degPadLat ||
    lng < raion.minLng - degPadLng ||
    lng > raion.maxLng + degPadLng
  ) {
    return false;
  }

  // Exact containment check (distance = 0)
  if (pointInRaion(lat, lng, raion)) {
    return true;
  }

  if (radiusKm <= 0) {
    return false;
  }

  // Exact point-to-polygon-boundary distance in local km coordinates
  const ky = 111.32;
  const kx = 111.32 * Math.max(0.25, Math.cos((lat * Math.PI) / 180));
  const rSq = radiusKm * radiusKm;

  for (const poly of raion.polys) {
    const ring = poly.rings[0];
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const ax = (ring[j][0] - lng) * kx;
      const ay = (ring[j][1] - lat) * ky;
      const bx = (ring[i][0] - lng) * kx;
      const by = (ring[i][1] - lat) * ky;

      const dx = bx - ax;
      const dy = by - ay;
      const lenSq = dx * dx + dy * dy;
      let t = 0;
      if (lenSq > 1e-9) {
        t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lenSq));
      }
      const px = ax + t * dx;
      const py = ay + t * dy;
      if (px * px + py * py <= rSq) {
        return true;
      }
    }
  }

  return false;
}

export interface ThreatFlightInput {
  lat: number;
  lng: number;
  munitionId: MunitionId;
  isCarrierAircraft?: boolean;
  waypoints?: Array<{ lat: number; lng: number }>;
  segmentIndex?: number;
  ageSec?: number;
}

function getMunitionThreatLevel(
  munitionId: MunitionId,
  isCarrierAircraft?: boolean,
): Exclude<ThreatLevel, 'none'> {
  if (isCarrierAircraft) return 'missile';
  const profile = MUNITION_BY_ID[munitionId].profile;
  return profile === 'prop-drone' || profile === 'jet-drone' ? 'drone' : 'missile';
}

function clipPolylineToKm(
  points: Array<{ lat: number; lng: number }>,
  maxKm: number,
): Array<{ lat: number; lng: number }> {
  if (points.length <= 1 || maxKm <= 0) return points.slice(0, 1);
  const out: Array<{ lat: number; lng: number }> = [points[0]];
  let accKm = 0;

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const segKm = haversineDistanceKm(a.lat, a.lng, b.lat, b.lng);
    if (accKm + segKm <= maxKm) {
      out.push(b);
      accKm += segKm;
    } else {
      const rem = maxKm - accKm;
      const frac = segKm > 0.001 ? Math.max(0, Math.min(1, rem / segKm)) : 0;
      out.push({
        lat: a.lat + (b.lat - a.lat) * frac,
        lng: a.lng + (b.lng - a.lng) * frac,
      });
      break;
    }
  }

  return out;
}

function samplePolylinePoints(
  points: Array<{ lat: number; lng: number }>,
  stepKm = 65,
): Array<{ lat: number; lng: number }> {
  if (points.length <= 1) return points;
  const samples: Array<{ lat: number; lng: number }> = [points[0]];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const segKm = haversineDistanceKm(a.lat, a.lng, b.lat, b.lng);
    const steps = Math.max(1, Math.ceil(segKm / stepKm));
    for (let s = 1; s <= steps; s++) {
      const f = s / steps;
      samples.push({
        lat: a.lat + (b.lat - a.lat) * f,
        lng: a.lng + (b.lng - a.lng) * f,
      });
    }
  }
  return samples;
}

/**
 * Computes active instantaneous threat level per Ukrainian raion (for RU/general strikes)
 * and per Russian region (for Ukrainian UAVs & missiles):
 * - 'drone' (yellow) within `alertRadiusKm`
 * - 'missile' (red) spreading rapidly wave-by-wave upon launch along the forward corridor.
 */
export function computeRaionThreatLevels(
  flights: ThreatFlightInput[],
  alertRadiusKm = 50,
): Map<string, ThreatLevel> {
  const result = new Map<string, ThreatLevel>();
  if (flights.length === 0) return result;

  const baseRadius = Math.max(0, alertRadiusKm);

  for (const flt of flights) {
    const spec = MUNITION_BY_ID[flt.munitionId];
    const isUaStrike = !flt.isCarrierAircraft && (spec.faction === 'UA' || spec.allowedTerritory === 'UA');
    const targetRegions = isUaStrike ? indexedRussiaRegions : indexedRaions;
    const level = getMunitionThreatLevel(flt.munitionId, flt.isCarrierAircraft);

    // Any aircraft departing from a Russian airfield places ALL of Ukraine on red missile alert
    if (flt.isCarrierAircraft) {
      for (const region of indexedRaions) {
        result.set(region.meta.id, 'missile');
      }
      continue;
    }

    if (level === 'drone') {
      for (const region of targetRegions) {
        const prev = result.get(region.meta.id);
        if (prev === 'missile' || prev === 'drone') continue;

        if (isPointWithinRadiusOfRaion(flt.lat, flt.lng, region, baseRadius)) {
          result.set(region.meta.id, 'drone');
        }
      }
      continue;
    }

    // Ballistic missile launch from RF/occupied ground triggers alert across Ukraine up to Zhytomyr oblast
    // (excluding Western Ukraine oblasts unless trajectory enters them)
    if (!isUaStrike && spec.profile === 'ballistic') {
      for (const region of indexedRaions) {
        if (!WESTERN_UA_EXCLUDED_OBLASTS.has(region.meta.oblast)) {
          result.set(region.meta.id, 'missile');
        }
      }
    }

    // Missile / ballistic / tactical aviation / KAB rapid wave expansion along forward corridor
    const profile = spec.profile;
    const targetNearRadiusKm =
      profile === 'ballistic'
        ? Math.max(baseRadius, 460)
        : profile === 'cruise'
          ? Math.max(baseRadius, 165)
          : Math.max(baseRadius, 135);
    const corridorKm =
      profile === 'ballistic' ? 210 : profile === 'cruise' ? 120 : 85;

    const ageSec = Math.max(0, flt.ageSec ?? 99);
    const waveSpeedKmPerSec = profile === 'ballistic' ? 840 : 560;
    const initialReachKm = profile === 'ballistic' ? 125 : 90;
    const waveReachKm = initialReachKm + ageSec * waveSpeedKmPerSec;
    const effectiveNearRadiusKm = Math.min(targetNearRadiusKm, waveReachKm);

    const fullRemainingPath: Array<{ lat: number; lng: number }> =
      flt.waypoints && flt.waypoints.length > 0
        ? [{ lat: flt.lat, lng: flt.lng }, ...flt.waypoints.slice((flt.segmentIndex ?? 0) + 1)]
        : [{ lat: flt.lat, lng: flt.lng }];
    const activeWavePath = clipPolylineToKm(fullRemainingPath, waveReachKm);
    const waveSamples =
      activeWavePath.length >= 2 ? samplePolylinePoints(activeWavePath, 60) : [];

    for (const region of targetRegions) {
      if (result.get(region.meta.id) === 'missile') continue;

      if (isPointWithinRadiusOfRaion(flt.lat, flt.lng, region, effectiveNearRadiusKm)) {
        result.set(region.meta.id, 'missile');
        continue;
      }

      for (let i = 0; i < waveSamples.length; i++) {
        const pt = waveSamples[i];
        if (isPointWithinRadiusOfRaion(pt.lat, pt.lng, region, corridorKm)) {
          result.set(region.meta.id, 'missile');
          break;
        }
      }
    }
  }

  return result;
}
