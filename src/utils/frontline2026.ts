import type { Feature, FeatureCollection, LineString, MultiPolygon, Polygon, Position } from 'geojson';
import rawDeepStateData from '../data/deepstateFrontline.json';
import rawOblastsData from '../data/ukraineOblasts.json';
import { getTerritoryAt } from './geoBoundaries';

export type FrontlineZoneStatus = 'occupied' | 'occupied_2014';

export interface DeepStateZoneProperties {
  id: string;
  status: FrontlineZoneStatus;
  name: string;
}

type RawDeepStateStatus = FrontlineZoneStatus | 'contested' | 'liberated';

type RawDeepStateCollection = FeatureCollection<
  Polygon | MultiPolygon,
  { id: string; status: RawDeepStateStatus; name: string }
> & {
  id?: number;
  datetime?: string;
};

type RawOblastCollection = FeatureCollection<
  Polygon | MultiPolygon,
  { id: string; name: string }
>;

const rawDeepState = rawDeepStateData as unknown as RawDeepStateCollection;
const rawOblasts = rawOblastsData as unknown as RawOblastCollection;

export const FRONTLINE_DATE_LABEL = rawDeepState.datetime
  ? `DeepState · ${rawDeepState.datetime}`
  : 'DeepStateMap · 19.11.2026';

/**
 * Only occupied territories (2022+ occupied and 2014 occupied Crimea/ORDLO),
 * with grey contested zones and green liberated zones excluded.
 */
export const deepstateOccupiedGeoJson: FeatureCollection<
  Polygon | MultiPolygon,
  DeepStateZoneProperties
> = {
  type: 'FeatureCollection',
  features: rawDeepState.features
    .filter(
      (f): f is typeof f & { properties: { status: FrontlineZoneStatus } } =>
        f.properties.status === 'occupied' || f.properties.status === 'occupied_2014',
    )
    .map((f) => ({
      ...f,
      properties: {
        id: f.properties.id,
        status: f.properties.status,
        name: f.properties.name,
      },
    })),
};

function getPrimaryRing(oblastName: string): Position[] {
  const feat = rawOblasts.features.find((f) => f.properties.name === oblastName);
  if (!feat) return [];
  return feat.geometry.type === 'Polygon'
    ? feat.geometry.coordinates[0]
    : feat.geometry.coordinates[0][0];
}

/**
 * High-precision international state border between Ukraine and Russia,
 * stitched continuously from the Three Sisters tripoint (UA/BY/RU) in Chernihiv oblast
 * through Sumy, Kharkiv, Luhansk, and Donetsk oblasts to the Sea of Azov.
 */
function buildUaRuBorderCoords(): Position[] {
  const ch = getPrimaryRing('Чернігівська область');
  const su = getPrimaryRing('Сумська область');
  const hk = getPrimaryRing('Харківська область');
  const lg = getPrimaryRing('Луганська область');
  const dn = getPrimaryRing('Донецька область');

  if (!ch.length || !su.length || !hk.length || !lg.length || !dn.length) {
    return [];
  }

  return [
    ...ch.slice(0, 41).reverse(),   // [31.782, 52.112] -> [33.429, 52.346]
    ...su.slice(0, 114).reverse(),  // [33.429, 52.346] -> [35.693, 50.345]
    ...hk.slice(0, 46).reverse(),   // [35.693, 50.345] -> [38.094, 49.847]
    ...lg.slice(0, 132).reverse(),  // [38.094, 49.847] -> [39.074, 47.869]
    ...dn.slice(132, 166).reverse(), // [39.074, 47.869] -> [38.230, 47.119]
  ];
}

export const uaRuBorderGeoJson: Feature<LineString> = {
  type: 'Feature',
  properties: { id: 'ua-ru-border', name: 'Граница Украина — Россия' },
  geometry: {
    type: 'LineString',
    coordinates: buildUaRuBorderCoords(),
  },
};

interface IndexedZonePoly {
  status: FrontlineZoneStatus;
  rings: Position[][];
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
}

const indexedZones: IndexedZonePoly[] = [];

for (const feat of deepstateOccupiedGeoJson.features) {
  const polys =
    feat.geometry.type === 'Polygon' ? [feat.geometry.coordinates] : feat.geometry.coordinates;
  for (const rings of polys) {
    if (!rings.length || !rings[0].length) continue;
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
    indexedZones.push({
      status: feat.properties.status,
      rings,
      minLng,
      maxLng,
      minLat,
      maxLat,
    });
  }
}

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

const STATUS_PRIORITY: Record<FrontlineZoneStatus, number> = {
  occupied: 2,
  occupied_2014: 1,
};

export function getFrontlineZoneAt(lat: number, lng: number): FrontlineZoneStatus | null {
  let best: FrontlineZoneStatus | null = null;
  let bestPrio = 0;

  for (const poly of indexedZones) {
    const prio = STATUS_PRIORITY[poly.status];
    if (prio <= bestPrio) continue;
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
      if (!inHole) {
        best = poly.status;
        bestPrio = prio;
      }
    }
  }
  return best;
}

export function isPointInOccupiedTerritory(lat: number, lng: number): boolean {
  return getFrontlineZoneAt(lat, lng) !== null;
}

export function isFactionPlacementAllowed(
  faction: 'RU' | 'UA',
  lat: number,
  lng: number,
): { allowed: boolean; reason?: string } {
  const territory = getTerritoryAt(lat, lng);
  if (!territory) {
    return {
      allowed: false,
      reason: 'Установку можно поставить только на территории Украины или России',
    };
  }
  const occupied = isPointInOccupiedTerritory(lat, lng);
  if (faction === 'RU') {
    if (territory === 'RU' || occupied) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: 'Российские БПЛА, ракеты и аэродромы можно ставить только в РФ и на оккупированной территории',
    };
  }

  if (territory === 'UA' && !occupied) {
    return { allowed: true };
  }
  return {
    allowed: false,
    reason: 'Украинские БПЛА и ракеты можно ставить только на подконтрольной Украине территории',
  };
}
