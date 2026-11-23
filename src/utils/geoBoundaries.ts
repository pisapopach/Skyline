import type { Feature, GeoJsonProperties, MultiPolygon, Polygon, Position } from 'geojson';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import countriesTopoJson from 'world-atlas/countries-50m.json';

export type TerritoryCode = 'UA' | 'RU';

type CountryGeometry = Polygon | MultiPolygon;

interface IndexedPolygon {
  rings: Position[][];
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
}

const UKRAINE_ISO = '804';
const RUSSIA_ISO = '643';

function normalizeRing(ring: Position[]): Position[] {
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const pt of ring) {
    if (pt[0] < minLng) minLng = pt[0];
    if (pt[0] > maxLng) maxLng = pt[0];
  }
  if (maxLng - minLng > 180) {
    return ring.map(([lng, lat]) => [lng < 0 ? lng + 360 : lng, lat]);
  }
  return ring;
}

function normalizeGeometry(geom: CountryGeometry): MultiPolygon {
  const rawPolys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  const normalizedPolys = rawPolys.map((rings) => rings.map((ring) => normalizeRing(ring)));
  return {
    type: 'MultiPolygon',
    coordinates: normalizedPolys,
  };
}

function buildIndexedPolygons(mp: MultiPolygon): IndexedPolygon[] {
  return mp.coordinates.map((rings) => {
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
    return { rings, minLng, maxLng, minLat, maxLat };
  });
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

function pointInIndexedPolygons(lat: number, lng: number, polys: IndexedPolygon[]): boolean {
  const candidates = [lng, lng + 360, lng - 360];
  for (const poly of polys) {
    if (lat < poly.minLat || lat > poly.maxLat) continue;
    for (const testLng of candidates) {
      if (testLng < poly.minLng || testLng > poly.maxLng) continue;
      if (pointInRing(testLng, lat, poly.rings[0])) {
        let inHole = false;
        for (let h = 1; h < poly.rings.length; h++) {
          if (pointInRing(testLng, lat, poly.rings[h])) {
            inHole = true;
            break;
          }
        }
        if (!inHole) return true;
      }
    }
  }
  return false;
}

const topology = countriesTopoJson as unknown as Topology<{
  countries: GeometryCollection<GeoJsonProperties>;
}>;
const countriesFeatureCollection = feature(topology, topology.objects.countries);

const rawUkraine = countriesFeatureCollection.features.find((f) => String(f.id) === UKRAINE_ISO);
const rawRussia = countriesFeatureCollection.features.find((f) => String(f.id) === RUSSIA_ISO);

const ukraineGeom: MultiPolygon = rawUkraine
  ? normalizeGeometry(rawUkraine.geometry as CountryGeometry)
  : { type: 'MultiPolygon', coordinates: [] };

const rawRussiaGeom: MultiPolygon = rawRussia
  ? normalizeGeometry(rawRussia.geometry as CountryGeometry)
  : { type: 'MultiPolygon', coordinates: [] };

const russiaGeom: MultiPolygon = {
  type: 'MultiPolygon',
  coordinates: rawRussiaGeom.coordinates.filter((rings) => {
    const outer = rings[0];
    if (!outer || outer.length === 0) return false;
    let minLng = Infinity;
    let maxLng = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;
    for (const [lng, lat] of outer) {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    const isCrimeaPoly =
      minLng >= 32 && maxLng <= 37 && minLat >= 44 && maxLat <= 46.5;
    return !isCrimeaPoly;
  }),
};

const thirdCountryPolygons: IndexedPolygon[] = [];
for (const feat of countriesFeatureCollection.features) {
  const idStr = String(feat.id);
  if (idStr === UKRAINE_ISO || idStr === RUSSIA_ISO) continue;
  const geom = feat.geometry;
  if (!geom || (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon')) continue;
  const norm = normalizeGeometry(geom);
  thirdCountryPolygons.push(...buildIndexedPolygons(norm));
}

const ukraineIndexed = buildIndexedPolygons(ukraineGeom);
const russiaIndexed = buildIndexedPolygons(russiaGeom);

export const ukraineGeoJson: Feature<MultiPolygon> = {
  type: 'Feature',
  properties: { code: 'UA', name: 'Украина' },
  geometry: ukraineGeom,
};

export const russiaGeoJson: Feature<MultiPolygon> = {
  type: 'Feature',
  properties: { code: 'RU', name: 'Россия' },
  geometry: russiaGeom,
};

/**
 * Inverse world mask polygon with holes punched out for Ukraine & Russia
 * so all surrounding territory is subtly dimmed on the satellite map.
 */
const worldOuterRing: Position[] = [
  [-360, -85],
  [540, -85],
  [540, 85],
  [-360, 85],
  [-360, -85],
];

const allowedOuterHoles: Position[][] = [
  ...ukraineGeom.coordinates.map((poly) => poly[0]),
  ...russiaGeom.coordinates.map((poly) => poly[0]),
];

export const inverseMaskGeoJson: Feature<Polygon> = {
  type: 'Feature',
  properties: { name: 'Restricted Airspace Mask' },
  geometry: {
    type: 'Polygon',
    coordinates: [worldOuterRing, ...allowedOuterHoles],
  },
};

export function getTerritoryAt(lat: number, lng: number): TerritoryCode | null {
  if (pointInIndexedPolygons(lat, lng, ukraineIndexed)) {
    return 'UA';
  }
  if (pointInIndexedPolygons(lat, lng, russiaIndexed)) {
    return 'RU';
  }
  return null;
}

export function isInsideThirdCountry(lat: number, lng: number): boolean {
  return pointInIndexedPolygons(lat, lng, thirdCountryPolygons);
}

/**
 * Ensures both launcher and target are strictly within Ukraine or Russia,
 * and checks that the flight corridor stays within Ukraine/Russia airspace
 * (never crossing third-country landmasses such as Belarus, Poland, Baltics, etc.).
 */
export function isFlightPathAllowed(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
): { allowed: boolean; reason?: string } {
  const startTerritory = getTerritoryAt(startLat, startLng);
  if (!startTerritory) {
    return { allowed: false, reason: 'Пусковая установка должна быть в Украине или России' };
  }
  const endTerritory = getTerritoryAt(endLat, endLng);
  if (!endTerritory) {
    return { allowed: false, reason: 'Цель должна находиться в Украине или России' };
  }

  const distKm = haversineDistanceKm(startLat, startLng, endLat, endLng);
  const steps = Math.max(18, Math.min(90, Math.ceil(distKm / 35)));

  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const pt = interpolatePath(startLat, startLng, endLat, endLng, t);
    const territory = getTerritoryAt(pt.lat, pt.lng);
    if (territory) continue;

    // Allow narrow internal coastal waters (e.g. Sea of Azov / Karkinit Bay)
    // only if not entering any third country and staying close to UA/RU shoreline.
    if (isInsideThirdCountry(pt.lat, pt.lng)) {
      return {
        allowed: false,
        reason: 'Маршрут проходит над территорией другой страны — выберите цель в пределах UA / RU',
      };
    }

    const nearAllowed =
      getTerritoryAt(pt.lat + 0.55, pt.lng) !== null ||
      getTerritoryAt(pt.lat - 0.55, pt.lng) !== null ||
      getTerritoryAt(pt.lat, pt.lng + 0.85) !== null ||
      getTerritoryAt(pt.lat, pt.lng - 0.85) !== null;

    if (!nearAllowed) {
      return {
        allowed: false,
        reason: 'Маршрут выходит за пределы воздушного пространства Украины и России',
      };
    }
  }

  return { allowed: true };
}

export function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function computeBearingDeg(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dLambda = ((lng2 - lng1) * Math.PI) / 180;
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function interpolatePath(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
  t: number,
): { lat: number; lng: number } {
  return {
    lat: lat1 + (lat2 - lat1) * t,
    lng: lng1 + (lng2 - lng1) * t,
  };
}
