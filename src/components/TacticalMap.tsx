import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Globe, LocateFixed, Minus, Plus } from 'lucide-react';
import {
  AIR_DEFENSE_BY_ID,
  BUILDING_BY_ID,
  MUNITION_BY_ID,
  type AirDefenseId,
  type AltitudeMode,
  type BuildingId,
  type FlightProfile,
  type MunitionId,
} from '../data/munitions';
import {
  RUSSIAN_AIRCRAFT_BY_ID,
  type RussianAircraftId,
} from '../data/airfields';
import {
  INITIAL_AI_BUILDINGS,
  buildDynamicAiRedirectWaypoints,
  type AiAirfieldSortieOrder,
  type AiWaveStrikeOrder,
} from '../data/aiScenario';
import {
  findNearestSettlementInfo,
  getTelegramChannelByOblast,
  type TelegramAlertSubtype,
  type TelegramIntelEventKind,
} from '../utils/telegramIntel';
import {
  computeBearingDeg,
  getTerritoryAt,
  haversineDistanceKm,
  interpolatePath,
  inverseMaskGeoJson,
  isFlightPathAllowed,
  russiaGeoJson,
  ukraineGeoJson,
} from '../utils/geoBoundaries';
import {
  computeRaionThreatLevels,
  getRaionAt,
  getRaionMetaById,
  isPermanentAlertRaionId,
  russiaRegionsGeoJson,
  ukraineOblastsGeoJson,
  ukraineRaionsGeoJson,
  type RaionMeta,
  type ThreatLevel,
} from '../utils/raionAlerts';
import {
  prewarmTheaterOverviewTiles,
  SmoothCachedTileLayer,
} from '../utils/smoothTileLayer';
import {
  deepstateOccupiedGeoJson,
  FRONTLINE_DATE_LABEL,
  getFrontlineZoneAt,
  isFactionPlacementAllowed,
  uaRuBorderGeoJson,
  type DeepStateZoneProperties,
  type FrontlineZoneStatus,
} from '../utils/frontline2026';
import {
  createExplosionParticles,
  drawAirDefenseUnit,
  drawAirfield,
  drawAirInterceptBurst,
  drawBuilding,
  drawExplosion,
  drawFallingBomb,
  drawFlyingCarrierAircraft,
  drawFlyingMunition,
  drawLauncher,
  drawPvoLaunchPlume,
  drawSamInterceptor,
  type ActiveExplosion,
} from '../utils/canvasRenderers';
import { soundFx } from '../utils/soundFx';

export type PendingPlacement =
  | { kind: 'strike'; id: MunitionId }
  | { kind: 'pvo'; id: AirDefenseId }
  | { kind: 'infra'; id: BuildingId }
  | { kind: 'airfield' };

export interface PlacedAirfield {
  id: string;
  name: string;
  presetId?: string;
  lat: number;
  lng: number;
  selectedAircraftId: RussianAircraftId;
  salvoCount: number;
  isAi?: boolean;
}

export interface PlacedLauncher {
  id: string;
  munitionId: MunitionId;
  lat: number;
  lng: number;
  ammo: number;
  maxAmmo: number;
  lastLaunchAt: number;
  headingDeg: number;
  isAi?: boolean;
}

export interface PlacedAirDefense {
  id: string;
  airDefenseId: AirDefenseId;
  lat: number;
  lng: number;
  ammo: number;
  maxAmmo: number;
  hp: number;
  maxHp: number;
  headingDeg: number;
}

export interface PlacedBuilding {
  id: string;
  buildingId: BuildingId;
  lat: number;
  lng: number;
  hp: number;
  maxHp: number;
}

export interface RoutePoint {
  lat: number;
  lng: number;
}

export interface ActiveFlight {
  id: string;
  launcherId: string;
  munitionId: MunitionId;
  targetBuildingId?: string;
  targetPvoId?: string;
  lowAltitude?: boolean;
  altitudeMode?: AltitudeMode;
  climbAtProgress?: number;
  postClimbAltitudeMode?: AltitudeMode;
  manualSteering?: boolean;
  lastSteadyHeadingDeg?: number;
  pendingCourseReportAtSec?: number;
  reportedOblasts?: Record<string, true>;
  lastTelegramAtSec?: number;
  lastTelegramRaion?: string;
  lastTelegramTransitOblast?: string;
  lastTelegramTargetCity?: string;
  pendingTelegramEvent?: TelegramIntelEventKind;
  waypoints: RoutePoint[]; // smoothed route points [start, ..., end]
  rawWaypoints: RoutePoint[]; // original clicked waypoints for turn markers
  segmentIndex: number;
  segmentProgress: number;
  lat: number;
  lng: number;
  bearingDeg: number;
  visualHeadingDeg: number;
  totalDistanceKm: number;
  coveredKm: number;
  ageSec: number;
  trail: RoutePoint[];
  bombDropThresholds?: number[];
  bombsDroppedCount?: number;
  kabReleaseDone?: boolean;
  kabTargetPoint?: RoutePoint;
  kabTargetBuildingId?: string;
  kabTargetPvoId?: string;
  returnWaypoints?: RoutePoint[];
  isReturnToBase?: boolean;
  carrierAircraftId?: RussianAircraftId;
  carrierMissileId?: MunitionId;
  carrierMissileCount?: number;
  carrierMissileWaypoints?: RoutePoint[];
  airfieldId?: string;
  isAiStrike?: boolean;
  midFlightRedirectDone?: boolean;
}

interface FallingBomb {
  id: string;
  lat: number;
  lng: number;
  headingDeg: number;
  age: number;
  fallDuration: number;
  munitionId: MunitionId;
  targetBuildingId?: string;
  targetPvoId?: string;
}

interface SamInterceptor {
  id: string;
  pvoId: string;
  airDefenseId: AirDefenseId;
  targetFlightId: string;
  lat: number;
  lng: number;
  bearingDeg: number;
  visualHeadingDeg: number;
  speedKmPerSec: number;
  isGun: boolean;
  accentColor: string;
  trail: RoutePoint[];
  missed?: boolean;
  overshootAge?: number;
}

interface InterceptBurst {
  id: string;
  lat: number;
  lng: number;
  age: number;
  duration: number;
  isMiss?: boolean;
  isSelfDestruct?: boolean;
  confirmed?: boolean;
  pvoShortName?: string;
  targetShortName?: string;
  accentColor?: string;
}

interface PvoLaunchPlume {
  id: string;
  lat: number;
  lng: number;
  angleDeg: number;
  age: number;
  duration: number;
  isGun: boolean;
  isSmallBullet: boolean;
  accentColor: string;
}

interface ScheduledRouteSalvo {
  launcherId: string;
  munitionId: MunitionId;
  targetBuildingId?: string;
  targetPvoId?: string;
  lowAltitude?: boolean;
  altitudeMode?: AltitudeMode;
  climbAtProgress?: number;
  postClimbAltitudeMode?: AltitudeMode;
  kabTargetPoint?: RoutePoint;
  kabTargetBuildingId?: string;
  kabTargetPvoId?: string;
  returnWaypoints?: RoutePoint[];
  startPoint?: RoutePoint;
  isAirLaunched?: boolean;
  isAiStrike?: boolean;
  waypoints: RoutePoint[];
  rawWaypoints: RoutePoint[];
  totalDistanceKm: number;
  bearingDeg: number;
  delayRemainingSec: number;
}

export type TacticalEventKind = 'launch' | 'intercept' | 'miss' | 'impact';

export interface TacticalEventPayload {
  kind: TacticalEventKind;
  munitionId: MunitionId;
  detail: string;
}

export interface TelegramIntelPayload {
  flightId: string;
  oblast: string;
  raionName?: string;
  munitionId?: MunitionId;
  carrierAircraftId?: RussianAircraftId;
  targetCity?: string;
  nearCity?: string;
  transitOblast?: string;
  targetBuildingName?: string;
  altitudeMode: AltitudeMode;
  eventKind: TelegramIntelEventKind;
  alertSubtype?: TelegramAlertSubtype;
  alertRaionNames?: string[];
  bearingDeg?: number;
}

export type MapStyleId = 'arcgis-sat' | 'google-sat' | 'arcgis-topo';

export const MAP_STYLES: Array<{
  id: MapStyleId;
  label: string;
  title: string;
  url: string;
  subdomains?: string[];
  maxNativeZoom: number;
}> = [
  {
    id: 'arcgis-sat',
    label: 'Спутник',
    title: 'Спутниковая карта (ArcGIS HD)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maxNativeZoom: 17,
  },
  {
    id: 'google-sat',
    label: 'Спутник 2',
    title: 'Спутниковая карта (Google Satellite)',
    url: 'https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
    subdomains: ['0', '1', '2', '3'],
    maxNativeZoom: 19,
  },
  {
    id: 'arcgis-topo',
    label: 'Рельеф',
    title: 'Детальная рельефно-топографическая карта (почти как спутник)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    maxNativeZoom: 17,
  },
];

export interface SelectedFlightInfo {
  id: string;
  munitionId: MunitionId;
  carrierAircraftId?: RussianAircraftId;
  isAiStrike?: boolean;
  lowAltitude?: boolean;
  altitudeMode?: AltitudeMode;
  remainingKm: number;
}

export interface MapStats {
  activeFlights: number;
  activeDrones: number;
  activeMissiles: number;
  activeAircraft: number;
  totalLaunches: number;
  explosions: number;
  intercepts: number;
  misses: number;
  destroyedByStrikes: number;
  droneAlertRaions: number;
  missileAlertRaions: number;
}

interface TacticalMapProps {
  gameMode: 'sandbox' | 'ai';
  launchers: PlacedLauncher[];
  airfields: PlacedAirfield[];
  airDefenses: PlacedAirDefense[];
  buildings: PlacedBuilding[];
  pendingPlacement: PendingPlacement | null;
  selectedLauncherId: string | null;
  selectedAirfieldId: string | null;
  selectedFlightId: string | null;
  su57DropPoint: RoutePoint | null;
  airfieldLaunchPoint: RoutePoint | null;
  airfieldMissileWaypoints: RoutePoint[];
  launchAirfieldSignal: number;
  isPlottingRoute: boolean;
  routeWaypoints: RoutePoint[];
  routeLaunchCount: number;
  routeAltitudeMode: AltitudeMode;
  launchRouteSignal: number;
  isPlottingFlightRoute: boolean;
  flightRouteWaypoints: RoutePoint[];
  applyFlightRouteSignal: number;
  flightAltitudeCommand?: { id: string; altitudeMode: AltitudeMode; seq: number } | null;
  exitFollowCamSignal: number;
  detonateFlightSignal: number;
  aiWaveSignal: number;
  pendingAiWaveOrders: AiWaveStrikeOrder[];
  pendingAiSorties: AiAirfieldSortieOrder[];
  buildingScale: number;
  timeScale: number;
  mapStyle: MapStyleId;
  showLabels: boolean;
  showRaions: boolean;
  showFrontline: boolean;
  alertRadiusKm: number;
  alertHoldoverSec: number;
  clearSignal: number;
  focusCoords: { lat: number; lng: number; zoom?: number } | null;
  onChangeMapStyle: (style: MapStyleId) => void;
  onPlaceStrikeLauncher: (munitionId: MunitionId, lat: number, lng: number) => void;
  onPlaceAirfield: (lat: number, lng: number) => void;
  onPlaceAirDefense: (airDefenseId: AirDefenseId, lat: number, lng: number) => void;
  onPlaceBuilding: (buildingId: BuildingId, lat: number, lng: number) => void;
  onSelectLauncher: (id: string | null) => void;
  onSelectAirfield: (id: string | null) => void;
  onSelectFlight: (info: SelectedFlightInfo | null) => void;
  onFollowCamChange: (active: boolean) => void;
  onAddFlightWaypoint: (lat: number, lng: number) => void;
  onFlightRouteApplied: () => void;
  onSetSu57DropPoint: (pt: RoutePoint | null) => void;
  onSetAirfieldLaunchPoint: (pt: RoutePoint | null) => void;
  onAddAirfieldWaypoint: (lat: number, lng: number) => void;
  onAirfieldLaunched: () => void;
  onAiWaveOrdersConsumed: () => void;
  onRemoveLauncher: (id: string) => void;
  onRemoveAirfield: (id: string) => void;
  onRemovePvo: (id: string) => void;
  onRemoveBuilding: (id: string) => void;
  onCancelPending: () => void;
  onAddWaypoint: (lat: number, lng: number) => void;
  onRouteLaunched: () => void;
  onLaunchStarted: (launcherId: string, headingDeg: number) => void;
  onPvoFired: (pvoId: string, headingDeg: number) => void;
  onUnitsDestroyed: (launcherIds: string[], pvoIds: string[]) => void;
  onAirDefensesDamaged: (updates: Array<{ id: string; hp: number }>) => void;
  onBuildingsDamaged: (updates: Array<{ id: string; hp: number }>) => void;
  onTacticalEvent: (event: TacticalEventPayload) => void;
  onTelegramIntel: (intel: TelegramIntelPayload) => void;
  onWarning: (msg: string) => void;
  onStatsChange: (stats: MapStats) => void;
}

const DEFAULT_CENTER: [number, number] = [49.4, 34.8];
const DEFAULT_ZOOM = 5;

function normalizeAngleDeltaDeg(delta: number): number {
  let d = ((delta + 180) % 360 + 360) % 360 - 180;
  if (d < -180) d += 360;
  return d;
}

function slewAngleDeg(current: number, target: number, maxStep: number): number {
  const diff = normalizeAngleDeltaDeg(target - current);
  if (Math.abs(diff) <= maxStep) return target;
  return (current + Math.sign(diff) * maxStep + 360) % 360;
}

function getInterceptHitChance(
  airDefenseId: AirDefenseId,
  profile: FlightProfile,
  munitionId?: MunitionId,
  carrierAircraftId?: RussianAircraftId,
): number {
  // Strictly Patriot-only interception for Iskander & all ballistic missiles
  if (!carrierAircraftId && profile === 'ballistic') {
    if (airDefenseId !== 'patriot') return 0;
    if (munitionId === 'kinzhal') return 0.34;
    if (munitionId === 'kh22') return 0.56;
    return 0.76;
  }

  const stealthMod =
    munitionId === 'su57-kab' ||
    munitionId === 'kh69' ||
    carrierAircraftId === 'su57-x69'
      ? 0.82
      : 1;
  const effProfile: FlightProfile = carrierAircraftId ? 'airstrike' : profile;
  let base = 0.75;
  switch (airDefenseId) {
    case 'patriot':
      if (effProfile === 'kab') base = 0.62;
      else if (effProfile === 'cruise' || effProfile === 'airstrike') base = 0.85;
      else base = 0.9;
      break;
    case 's300':
      if (effProfile === 'kab') base = 0.45;
      else if (effProfile === 'cruise' || effProfile === 'airstrike') base = 0.77;
      else base = 0.82;
      break;
    case 'iris-t':
      if (effProfile === 'kab') base = 0.68;
      else if (effProfile === 'cruise' || effProfile === 'airstrike') base = 0.76;
      else base = 0.87;
      break;
    case 'gepard':
      if (effProfile === 'kab') base = 0.24;
      else if (effProfile === 'cruise' || effProfile === 'airstrike') base = 0.38;
      else if (effProfile === 'jet-drone') base = 0.54;
      else base = 0.78;
      break;
    case 'mg-pickup':
      if (effProfile === 'kab') base = 0.14;
      else if (effProfile === 'cruise' || effProfile === 'airstrike') base = 0.22;
      else if (effProfile === 'jet-drone') base = 0.42;
      else base = 0.72;
      break;
    default:
      base = 0.75;
  }
  return base * stealthMod;
}

/**
 * Preserves exact waypoint vertices for crisp, sharp tactical turns without
 * wide corner rounding.
 */
function buildSmoothRoute(points: RoutePoint[]): RoutePoint[] {
  return points.slice();
}

function computeRouteLengthKm(points: RoutePoint[]): number {
  let sum = 0;
  for (let i = 0; i < points.length - 1; i++) {
    sum += haversineDistanceKm(points[i].lat, points[i].lng, points[i + 1].lat, points[i + 1].lng);
  }
  return sum;
}

function getFlightCurrentPosition(flt: ActiveFlight): RoutePoint {
  const a = flt.waypoints[flt.segmentIndex];
  const b = flt.waypoints[flt.segmentIndex + 1];
  if (!a || !b) return { lat: flt.lat, lng: flt.lng };
  return interpolatePath(a.lat, a.lng, b.lat, b.lng, Math.min(1, flt.segmentProgress));
}

function getPixelRadiusKm(
  map: L.Map,
  lat: number,
  lng: number,
  radiusKm: number,
): number {
  const dLng = radiusKm / (111.32 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  const pCenter = map.latLngToContainerPoint([lat, lng]);
  const pEdge = map.latLngToContainerPoint([lat, lng + dLng]);
  return Math.max(12, Math.hypot(pEdge.x - pCenter.x, pEdge.y - pCenter.y));
}

function getRaionStyle(level: ThreatLevel, isPermanent = false): L.PathOptions {
  if (level === 'missile' || isPermanent) {
    return {
      fill: true,
      fillColor: '#EF4444',
      fillOpacity: 0.44,
      color: '#FCA5A5',
      weight: 1.7,
      opacity: 0.95,
    };
  }
  if (level === 'drone') {
    return {
      fill: true,
      fillColor: '#FACC15',
      fillOpacity: 0.36,
      color: '#FEF08A',
      weight: 1.5,
      opacity: 0.9,
    };
  }
  return {
    fill: true,
    fillColor: '#0F172A',
    fillOpacity: 0.03,
    color: '#FFFFFF',
    weight: 0.7,
    opacity: 0.3,
  };
}

function formatLocationLabel(lat: number, lng: number): string {
  const raion = getRaionAt(lat, lng);
  if (raion) return raion.name;
  const territory = getTerritoryAt(lat, lng);
  if (territory === 'UA') return 'Украина';
  if (territory === 'RU') return 'Россия';
  return `${lat.toFixed(2)}, ${lng.toFixed(2)}`;
}

function getFlightAltitudeMode(flt: {
  altitudeMode?: AltitudeMode;
  lowAltitude?: boolean;
}): AltitudeMode {
  if (flt.altitudeMode) return flt.altitudeMode;
  return flt.lowAltitude ? 'low' : 'normal';
}

function isShahedMunition(id: MunitionId): boolean {
  return id === 'shahed-136' || id === 'shahed-238';
}

function isManuallySteerableFlight(flt: {
  munitionId: MunitionId;
  carrierAircraftId?: RussianAircraftId;
  isReturnToBase?: boolean;
}): boolean {
  if (flt.isReturnToBase || flt.carrierAircraftId) return false;
  return MUNITION_BY_ID[flt.munitionId].profile !== 'airstrike';
}

function computePointAheadKm(
  lat: number,
  lng: number,
  bearingDeg: number,
  distKm: number,
): RoutePoint {
  const rad = (bearingDeg * Math.PI) / 180;
  return {
    lat: lat + (Math.cos(rad) * distKm) / 111.32,
    lng:
      lng +
      (Math.sin(rad) * distKm) / (111.32 * Math.max(0.2, Math.cos((lat * Math.PI) / 180))),
  };
}

export function TacticalMap({
  gameMode,
  launchers,
  airfields,
  airDefenses,
  buildings,
  pendingPlacement,
  selectedLauncherId,
  selectedAirfieldId,
  selectedFlightId,
  su57DropPoint,
  airfieldLaunchPoint,
  airfieldMissileWaypoints,
  launchAirfieldSignal,
  isPlottingRoute,
  routeWaypoints,
  routeLaunchCount,
  routeAltitudeMode,
  launchRouteSignal,
  isPlottingFlightRoute,
  flightRouteWaypoints,
  applyFlightRouteSignal,
  flightAltitudeCommand = null,
  exitFollowCamSignal,
  detonateFlightSignal,
  aiWaveSignal,
  pendingAiWaveOrders,
  pendingAiSorties,
  buildingScale,
  timeScale,
  mapStyle,
  showLabels,
  showRaions,
  showFrontline,
  alertRadiusKm,
  alertHoldoverSec,
  clearSignal,
  focusCoords,
  onChangeMapStyle,
  onPlaceStrikeLauncher,
  onPlaceAirfield,
  onPlaceAirDefense,
  onPlaceBuilding,
  onSelectLauncher,
  onSelectAirfield,
  onSelectFlight,
  onFollowCamChange,
  onAddFlightWaypoint,
  onFlightRouteApplied,
  onSetSu57DropPoint,
  onSetAirfieldLaunchPoint,
  onAddAirfieldWaypoint,
  onAirfieldLaunched,
  onAiWaveOrdersConsumed,
  onRemoveLauncher,
  onRemoveAirfield,
  onRemovePvo,
  onRemoveBuilding,
  onCancelPending,
  onAddWaypoint,
  onRouteLaunched,
  onLaunchStarted,
  onPvoFired,
  onUnitsDestroyed,
  onAirDefensesDamaged,
  onBuildingsDamaged,
  onTacticalEvent,
  onTelegramIntel,
  onWarning,
  onStatsChange,
}: TacticalMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const baseTileLayerRef = useRef<SmoothCachedTileLayer | null>(null);
  const labelsLayerRef = useRef<SmoothCachedTileLayer | null>(null);
  const raionsLayerRef = useRef<L.GeoJSON | null>(null);
  const russiaRegionsLayerRef = useRef<L.GeoJSON | null>(null);
  const oblastsLayerRef = useRef<L.GeoJSON | null>(null);
  const occupiedLayerRef = useRef<L.GeoJSON | null>(null);
  const raionPolygonMapRef = useRef<Map<string, L.Path>>(new Map());
  const activeThreatsRef = useRef<Map<string, ThreatLevel>>(new Map());
  const raionHoldoversRef = useRef<Map<string, { droneHold: number; missileHold: number }>>(
    new Map(),
  );

  const [hoveredRaion, setHoveredRaion] = useState<{
    meta: RaionMeta;
    threat: ThreatLevel;
    zoneStatus: FrontlineZoneStatus | null;
  } | null>(null);
  const [alertCounts, setAlertCounts] = useState<{ drone: number; missile: number }>({
    drone: 0,
    missile: 0,
  });

  const flightsRef = useRef<ActiveFlight[]>([]);
  const scheduledSalvoRef = useRef<ScheduledRouteSalvo[]>([]);
  const fallingBombsRef = useRef<FallingBomb[]>([]);
  const interceptorsRef = useRef<SamInterceptor[]>([]);
  const interceptBurstsRef = useRef<InterceptBurst[]>([]);
  const pvoLaunchFlashesRef = useRef<PvoLaunchPlume[]>([]);
  const explosionsRef = useRef<ActiveExplosion[]>([]);
  const pvoCooldownsRef = useRef<Record<string, number>>({});
  const mobilePvoStateRef = useRef<
    Record<
      string,
      {
        homeLat: number;
        homeLng: number;
        lat: number;
        lng: number;
        targetLat: number;
        targetLng: number;
        chassisHeadingDeg: number;
        turretHeadingDeg: number;
      }
    >
  >({});
  const totalExplosionsRef = useRef(0);
  const totalInterceptsRef = useRef(0);
  const totalMissesRef = useRef(0);
  const totalLaunchesRef = useRef(0);
  const totalDestroyedByStrikesRef = useRef(0);
  const forceAlertUpdateRef = useRef(false);
  const zoomAnimRef = useRef<{
    active: boolean;
    targetZoom: number;
    anchorPoint: L.Point;
  }>({
    active: false,
    targetZoom: DEFAULT_ZOOM,
    anchorPoint: L.point(0, 0),
  });

  const gameModeRef = useRef(gameMode);
  gameModeRef.current = gameMode;
  const launchersRef = useRef(launchers);
  launchersRef.current = launchers;
  const airfieldsRef = useRef(airfields);
  airfieldsRef.current = airfields;
  const airDefensesRef = useRef(airDefenses);
  airDefensesRef.current = airDefenses;
  const buildingsRef = useRef(buildings);
  buildingsRef.current = buildings;
  const pendingRef = useRef(pendingPlacement);
  pendingRef.current = pendingPlacement;
  const selectedRef = useRef(selectedLauncherId);
  selectedRef.current = selectedLauncherId;
  const selectedAirfieldRef = useRef(selectedAirfieldId);
  selectedAirfieldRef.current = selectedAirfieldId;
  const selectedFlightRef = useRef(selectedFlightId);
  selectedFlightRef.current = selectedFlightId;
  const su57DropPointRef = useRef(su57DropPoint);
  su57DropPointRef.current = su57DropPoint;
  const airfieldLaunchPointRef = useRef(airfieldLaunchPoint);
  airfieldLaunchPointRef.current = airfieldLaunchPoint;
  const airfieldMissileWaypointsRef = useRef(airfieldMissileWaypoints);
  airfieldMissileWaypointsRef.current = airfieldMissileWaypoints;
  const plottingRef = useRef(isPlottingRoute);
  plottingRef.current = isPlottingRoute;
  const waypointsRef = useRef(routeWaypoints);
  waypointsRef.current = routeWaypoints;
  const routeLaunchCountRef = useRef(routeLaunchCount);
  routeLaunchCountRef.current = routeLaunchCount;
  const routeAltitudeModeRef = useRef<AltitudeMode>(routeAltitudeMode);
  routeAltitudeModeRef.current = routeAltitudeMode;
  const plottingFlightRef = useRef(isPlottingFlightRoute);
  plottingFlightRef.current = isPlottingFlightRoute;
  const flightWaypointsRef = useRef(flightRouteWaypoints);
  flightWaypointsRef.current = flightRouteWaypoints;
  const followCamFlightIdRef = useRef<string | null>(null);
  const keysHeldRef = useRef<{ a: boolean; d: boolean }>({ a: false, d: false });
  const pendingDetonateFlightIdRef = useRef<string | null>(null);
  const prevOblastAlertsRef = useRef<Map<string, ThreatLevel>>(new Map());
  const oblastDorozvedkaTimersRef = useRef<Record<string, number>>({});
  const pendingAiWaveOrdersRef = useRef(pendingAiWaveOrders);
  pendingAiWaveOrdersRef.current = pendingAiWaveOrders;
  const pendingAiSortiesRef = useRef(pendingAiSorties);
  pendingAiSortiesRef.current = pendingAiSorties;
  const buildingScaleRef = useRef(buildingScale);
  buildingScaleRef.current = buildingScale;
  const timeScaleRef = useRef(timeScale);
  timeScaleRef.current = timeScale;
  const alertRadiusKmRef = useRef(alertRadiusKm);
  alertRadiusKmRef.current = alertRadiusKm;
  const alertHoldoverSecRef = useRef(alertHoldoverSec);
  alertHoldoverSecRef.current = alertHoldoverSec;

  const callbacksRef = useRef({
    onPlaceStrikeLauncher,
    onPlaceAirfield,
    onPlaceAirDefense,
    onPlaceBuilding,
    onSelectLauncher,
    onSelectAirfield,
    onSelectFlight,
    onFollowCamChange,
    onAddFlightWaypoint,
    onFlightRouteApplied,
    onSetSu57DropPoint,
    onSetAirfieldLaunchPoint,
    onAddAirfieldWaypoint,
    onAirfieldLaunched,
    onAiWaveOrdersConsumed,
    onRemoveLauncher,
    onRemoveAirfield,
    onRemovePvo,
    onRemoveBuilding,
    onCancelPending,
    onAddWaypoint,
    onRouteLaunched,
    onLaunchStarted,
    onPvoFired,
    onUnitsDestroyed,
    onAirDefensesDamaged,
    onBuildingsDamaged,
    onTacticalEvent,
    onTelegramIntel,
    onWarning,
    onStatsChange,
  });
  callbacksRef.current = {
    onPlaceStrikeLauncher,
    onPlaceAirfield,
    onPlaceAirDefense,
    onPlaceBuilding,
    onSelectLauncher,
    onSelectAirfield,
    onSelectFlight,
    onFollowCamChange,
    onAddFlightWaypoint,
    onFlightRouteApplied,
    onSetSu57DropPoint,
    onSetAirfieldLaunchPoint,
    onAddAirfieldWaypoint,
    onAirfieldLaunched,
    onAiWaveOrdersConsumed,
    onRemoveLauncher,
    onRemoveAirfield,
    onRemovePvo,
    onRemoveBuilding,
    onCancelPending,
    onAddWaypoint,
    onRouteLaunched,
    onLaunchStarted,
    onPvoFired,
    onUnitsDestroyed,
    onAirDefensesDamaged,
    onBuildingsDamaged,
    onTacticalEvent,
    onTelegramIntel,
    onWarning,
    onStatsChange,
  };

  const cursorRef = useRef<{ x: number; y: number; lat: number; lng: number; inside: boolean }>({
    x: 0,
    y: 0,
    lat: DEFAULT_CENTER[0],
    lng: DEFAULT_CENTER[1],
    inside: false,
  });
  const hoveredLauncherIdRef = useRef<string | null>(null);
  const hoveredAirfieldIdRef = useRef<string | null>(null);
  const hoveredPvoIdRef = useRef<string | null>(null);
  const hoveredBuildingIdRef = useRef<string | null>(null);
  const hoveredFlightIdRef = useRef<string | null>(null);

  const emitMapStats = (droneAlertCount?: number, missileAlertCount?: number) => {
    const activeRadars = airDefensesRef.current.filter(
      (r) => AIR_DEFENSE_BY_ID[r.airDefenseId].isRadar && r.hp > 0,
    );
    let activeDrones = 0;
    let activeMissiles = 0;
    let activeAircraft = 0;
    for (const f of flightsRef.current) {
      if (f.isReturnToBase) continue;
      const altMode = getFlightAltitudeMode(f);
      if (altMode === 'ultra-low') continue;
      if (altMode === 'low') {
        const detected = activeRadars.some(
          (r) =>
            haversineDistanceKm(r.lat, r.lng, f.lat, f.lng) <=
            AIR_DEFENSE_BY_ID[r.airDefenseId].rangeKm,
        );
        if (!detected) continue;
      }
      if (f.carrierAircraftId || f.munitionId === 'su57-kab' || f.munitionId === 'airstrike') {
        activeAircraft += 1;
      } else {
        const prof = MUNITION_BY_ID[f.munitionId].profile;
        if (prof === 'prop-drone' || prof === 'jet-drone') activeDrones += 1;
        else activeMissiles += 1;
      }
    }
    const drones =
      droneAlertCount ??
      Array.from(activeThreatsRef.current.values()).filter((v) => v === 'drone').length;
    const missiles =
      missileAlertCount ??
      Array.from(activeThreatsRef.current.values()).filter((v) => v === 'missile').length;
    callbacksRef.current.onStatsChange({
      activeFlights: activeDrones + activeMissiles + activeAircraft,
      activeDrones,
      activeMissiles,
      activeAircraft,
      totalLaunches: totalLaunchesRef.current,
      explosions: totalExplosionsRef.current,
      intercepts: totalInterceptsRef.current,
      misses: totalMissesRef.current,
      destroyedByStrikes: totalDestroyedByStrikesRef.current,
      droneAlertRaions: drones,
      missileAlertRaions: missiles,
    });
  };

  const rightDragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    moved: boolean;
    suppressNextContextMenu: boolean;
  }>({
    active: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    moved: false,
    suppressNextContextMenu: false,
  });

  useEffect(() => {
    if (clearSignal === 0) return;
    flightsRef.current = [];
    scheduledSalvoRef.current = [];
    fallingBombsRef.current = [];
    interceptorsRef.current = [];
    interceptBurstsRef.current = [];
    pvoLaunchFlashesRef.current = [];
    explosionsRef.current = [];
    pvoCooldownsRef.current = {};
    mobilePvoStateRef.current = {};
    followCamFlightIdRef.current = null;
    keysHeldRef.current = { a: false, d: false };
    pendingDetonateFlightIdRef.current = null;
    callbacksRef.current.onFollowCamChange(false);
    totalExplosionsRef.current = 0;
    totalInterceptsRef.current = 0;
    totalMissesRef.current = 0;
    totalLaunchesRef.current = 0;
    totalDestroyedByStrikesRef.current = 0;

    for (const [raionId] of activeThreatsRef.current) {
      const layer = raionPolygonMapRef.current.get(raionId);
      if (layer) layer.setStyle(getRaionStyle('none', isPermanentAlertRaionId(raionId)));
    }
    activeThreatsRef.current = new Map();
    prevOblastAlertsRef.current.clear();
    for (const tId of Object.values(oblastDorozvedkaTimersRef.current)) {
      window.clearTimeout(tId);
    }
    oblastDorozvedkaTimersRef.current = {};
    raionHoldoversRef.current.clear();
    soundFx.updateAirRaidSiren({
      droneRaions: 0,
      missileRaions: 0,
      newlyAlertedDrone: false,
      newlyAlertedMissile: false,
    });
    soundFx.updateInFlightAudio({
      propDrone: 0,
      jetDrone: 0,
      cruiseMissile: 0,
      ballistic: 0,
      samMissile: 0,
      flakGun: 0,
    });
    setAlertCounts({ drone: 0, missile: 0 });
    setHoveredRaion((prev) =>
      prev ? { meta: prev.meta, threat: 'none', zoneStatus: prev.zoneStatus } : null,
    );
    callbacksRef.current.onSelectFlight(null);
    emitMapStats(0, 0);
  }, [clearSignal]);

  useEffect(() => {
    if (exitFollowCamSignal === 0) return;
    followCamFlightIdRef.current = null;
    keysHeldRef.current = { a: false, d: false };
    callbacksRef.current.onFollowCamChange(false);
  }, [exitFollowCamSignal]);

  useEffect(() => {
    if (detonateFlightSignal === 0) return;
    if (selectedFlightRef.current) {
      pendingDetonateFlightIdRef.current = selectedFlightRef.current;
    }
  }, [detonateFlightSignal]);

  useEffect(() => {
    if (!selectedFlightId) {
      if (followCamFlightIdRef.current) {
        followCamFlightIdRef.current = null;
        callbacksRef.current.onFollowCamChange(false);
      }
      keysHeldRef.current = { a: false, d: false };
    }
  }, [selectedFlightId]);

  useEffect(() => {
    if (!flightAltitudeCommand) return;
    const flt = flightsRef.current.find((f) => f.id === flightAltitudeCommand.id);
    if (!flt || flt.isReturnToBase) return;
    const prevAlt = getFlightAltitudeMode(flt);
    const nextAlt = flightAltitudeCommand.altitudeMode;
    if (prevAlt === nextAlt) return;

    const altRank: Record<AltitudeMode, number> = {
      'ultra-low': 0,
      low: 1,
      normal: 2,
    };
    flt.altitudeMode = nextAlt;
    flt.lowAltitude = nextAlt !== 'normal';
    flt.climbAtProgress = undefined;
    flt.postClimbAltitudeMode = undefined;
    flt.pendingTelegramEvent =
      altRank[nextAlt] > altRank[prevAlt]
        ? 'climbed'
        : nextAlt === 'ultra-low'
          ? 'dropped_radar_lost'
          : 'dropped';
    forceAlertUpdateRef.current = true;
    soundFx.playSelectLauncher();
    callbacksRef.current.onSelectFlight({
      id: flt.id,
      munitionId: flt.munitionId,
      carrierAircraftId: flt.carrierAircraftId,
      isAiStrike: flt.isAiStrike,
      lowAltitude: flt.lowAltitude,
      altitudeMode: nextAlt,
      remainingKm: Math.max(0, Math.round(flt.totalDistanceKm - flt.coveredKm)),
    });
  }, [flightAltitudeCommand]);

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
    };
    const isActiveSteerableSelected = () => {
      if (!selectedFlightRef.current) return false;
      const flt = flightsRef.current.find((f) => f.id === selectedFlightRef.current);
      return Boolean(flt && isManuallySteerableFlight(flt));
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') {
        if (e.code === 'ArrowLeft' && isActiveSteerableSelected()) {
          e.preventDefault();
          e.stopPropagation();
        }
        keysHeldRef.current.a = true;
      } else if (e.code === 'KeyD' || e.code === 'ArrowRight') {
        if (e.code === 'ArrowRight' && isActiveSteerableSelected()) {
          e.preventDefault();
          e.stopPropagation();
        }
        keysHeldRef.current.d = true;
      } else if (
        (e.code === 'ArrowUp' || e.code === 'ArrowDown') &&
        isActiveSteerableSelected()
      ) {
        e.preventDefault();
        e.stopPropagation();
      } else if (e.code === 'Space' && selectedFlightRef.current) {
        const flt = flightsRef.current.find((f) => f.id === selectedFlightRef.current);
        if (flt && isManuallySteerableFlight(flt)) {
          e.preventDefault();
          pendingDetonateFlightIdRef.current = flt.id;
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') keysHeldRef.current.a = false;
      else if (e.code === 'KeyD' || e.code === 'ArrowRight') keysHeldRef.current.d = false;
    };
    const onBlur = () => {
      keysHeldRef.current = { a: false, d: false };
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  // Launch multi-waypoint route when parent triggers launchRouteSignal
  useEffect(() => {
    if (launchRouteSignal === 0) return;
    const launcher = launchersRef.current.find((l) => l.id === selectedRef.current);
    const wps = waypointsRef.current;
    if (!launcher || wps.length === 0) return;

    if (launcher.ammo <= 0) {
      soundFx.playBlocked();
      callbacksRef.current.onWarning(
        `Боекомплект ПУ исчерпан (0/${launcher.maxAmmo}) — установите новую пусковую установку`,
      );
      return;
    }

    const rawPath: RoutePoint[] = [{ lat: launcher.lat, lng: launcher.lng }, ...wps];
    const smoothPath = buildSmoothRoute(rawPath);
    const totalKm = computeRouteLengthKm(smoothPath);

    if (totalKm < 6) {
      soundFx.playBlocked();
      callbacksRef.current.onWarning('Слишком короткий маршрут — добавьте точку подальше от ПУ');
      return;
    }

    const spec = MUNITION_BY_ID[launcher.munitionId];
    if (spec.id === 'su57-kab') {
      if (wps.length < 2) {
        soundFx.playBlocked();
        callbacksRef.current.onWarning(
          'Для Су-57 укажите минимум 2 точки: точку сброса самолёта и цель для КАБ (≤75 км)',
        );
        return;
      }
      const dropPt = wps[wps.length - 2];
      const kabTarget = wps[wps.length - 1];
      const kabLegKm = haversineDistanceKm(dropPt.lat, dropPt.lng, kabTarget.lat, kabTarget.lng);
      const maxKabKm = spec.kabMaxRangeKm ?? 75;
      if (kabLegKm > maxKabKm) {
        soundFx.playBlocked();
        callbacksRef.current.onWarning(
          `Участок от точки сброса до цели КАБ превышает ${maxKabKm} км (${Math.round(kabLegKm)} км)`,
        );
        return;
      }

      const jetRawPath: RoutePoint[] = [{ lat: launcher.lat, lng: launcher.lng }, ...wps.slice(0, -1)];
      const jetSmoothPath = buildSmoothRoute(jetRawPath);
      const jetTotalKm = computeRouteLengthKm(jetSmoothPath);
      if (jetTotalKm < 6) {
        soundFx.playBlocked();
        callbacksRef.current.onWarning('Точка сброса слишком близко к аэродрому Су-57');
        return;
      }
      const returnSmoothPath = buildSmoothRoute([...jetRawPath].reverse());
      const initialBearing = computeBearingDeg(
        jetSmoothPath[0].lat,
        jetSmoothPath[0].lng,
        jetSmoothPath[1].lat,
        jetSmoothPath[1].lng,
      );
      const matchedBuilding = buildingsRef.current.find(
        (b) => haversineDistanceKm(kabTarget.lat, kabTarget.lng, b.lat, b.lng) <= 1.2,
      );
      const salvoCount = Math.max(
        1,
        Math.min(launcher.ammo, Math.floor(routeLaunchCountRef.current || 1)),
      );

      flightsRef.current.push({
        id: `flt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        launcherId: launcher.id,
        munitionId: launcher.munitionId,
        waypoints: jetSmoothPath,
        rawWaypoints: jetRawPath,
        segmentIndex: 0,
        segmentProgress: 0,
        lat: launcher.lat,
        lng: launcher.lng,
        bearingDeg: initialBearing,
        visualHeadingDeg: initialBearing,
        totalDistanceKm: jetTotalKm,
        coveredKm: 0,
        ageSec: 0,
        trail: [{ lat: launcher.lat, lng: launcher.lng }],
        kabTargetPoint: kabTarget,
        kabTargetBuildingId: matchedBuilding?.id,
        returnWaypoints: returnSmoothPath,
      });
      forceAlertUpdateRef.current = true;
      totalLaunchesRef.current += 1;
      soundFx.playLaunch(spec.profile);
      callbacksRef.current.onTacticalEvent({
        kind: 'launch',
        munitionId: launcher.munitionId,
        detail: matchedBuilding
          ? `Вылет → сброс КАБ по ${BUILDING_BY_ID[matchedBuilding.buildingId].shortName} (${Math.round(jetTotalKm)} + ${Math.round(kabLegKm)} км)${salvoCount > 1 ? ` · Звено ×${salvoCount}` : ''}`
          : `Вылет к точке сброса (${Math.round(jetTotalKm)} км) → КАБ ${Math.round(kabLegKm)} км${salvoCount > 1 ? ` · Звено ×${salvoCount}` : ''}`,
      });
      callbacksRef.current.onLaunchStarted(launcher.id, initialBearing);

      for (let i = 1; i < salvoCount; i++) {
        scheduledSalvoRef.current.push({
          launcherId: launcher.id,
          munitionId: launcher.munitionId,
          waypoints: jetSmoothPath,
          rawWaypoints: jetRawPath,
          totalDistanceKm: jetTotalKm,
          bearingDeg: initialBearing,
          kabTargetPoint: kabTarget,
          kabTargetBuildingId: matchedBuilding?.id,
          returnWaypoints: returnSmoothPath,
          delayRemainingSec: i * 0.45,
        });
      }

      callbacksRef.current.onRouteLaunched();
      emitMapStats();
      return;
    }

    if (spec.maxRangeKm && totalKm > spec.maxRangeKm) {
      soundFx.playBlocked();
      callbacksRef.current.onWarning(
        `Дальность КАБ ограничена ${spec.maxRangeKm} км (маршрут: ${Math.round(totalKm)} км)`,
      );
      return;
    }
    const initialBearing = computeBearingDeg(
      smoothPath[0].lat,
      smoothPath[0].lng,
      smoothPath[1].lat,
      smoothPath[1].lng,
    );

    const dest = smoothPath[smoothPath.length - 1];
    const matchedBuilding = buildingsRef.current.find(
      (b) => haversineDistanceKm(dest.lat, dest.lng, b.lat, b.lng) <= 1.2,
    );
    const matchedPvo = !matchedBuilding
      ? airDefensesRef.current.find((p) => {
          const m = mobilePvoStateRef.current[p.id];
          const pLat = m ? m.lat : p.lat;
          const pLng = m ? m.lng : p.lng;
          return haversineDistanceKm(dest.lat, dest.lng, pLat, pLng) <= 1.5;
        })
      : undefined;

    const salvoCount = Math.max(
      1,
      Math.min(launcher.ammo, Math.floor(routeLaunchCountRef.current || 1)),
    );
    const altMode: AltitudeMode = spec.canFlyLow ? routeAltitudeModeRef.current : 'normal';
    const isLowAlt = altMode !== 'normal';
    const altTag =
      altMode === 'ultra-low' ? ' · Очень низко' : altMode === 'low' ? ' · Низко' : '';

    const firstFlight: ActiveFlight = {
      id: `flt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      launcherId: launcher.id,
      munitionId: launcher.munitionId,
      targetBuildingId: matchedBuilding?.id,
      targetPvoId: matchedPvo?.id,
      lowAltitude: isLowAlt,
      altitudeMode: altMode,
      waypoints: smoothPath,
      rawWaypoints: rawPath,
      segmentIndex: 0,
      segmentProgress: 0,
      lat: launcher.lat,
      lng: launcher.lng,
      bearingDeg: initialBearing,
      visualHeadingDeg: initialBearing,
      totalDistanceKm: totalKm,
      coveredKm: 0,
      ageSec: 0,
      trail: [{ lat: launcher.lat, lng: launcher.lng }],
      ...(spec.profile === 'airstrike'
        ? {
            bombDropThresholds: [0.18, 0.33, 0.48, 0.63, 0.78, 0.93],
            bombsDroppedCount: 0,
          }
        : {}),
    };

    flightsRef.current.push(firstFlight);
    forceAlertUpdateRef.current = true;
    totalLaunchesRef.current += 1;
    soundFx.playLaunch(spec.profile);
    callbacksRef.current.onTacticalEvent({
      kind: 'launch',
      munitionId: launcher.munitionId,
      detail: matchedBuilding
        ? `→ ${BUILDING_BY_ID[matchedBuilding.buildingId].shortName} (${formatLocationLabel(dest.lat, dest.lng)}, ${Math.round(totalKm)} км)${altTag}${salvoCount > 1 ? ` · Залп ×${salvoCount}` : ''}`
        : matchedPvo
          ? `→ ППО ${AIR_DEFENSE_BY_ID[matchedPvo.airDefenseId].shortName} (${Math.round(totalKm)} км)${altTag}${salvoCount > 1 ? ` · Залп ×${salvoCount}` : ''}`
          : `→ ${formatLocationLabel(dest.lat, dest.lng)} (${Math.round(totalKm)} км)${altTag}${salvoCount > 1 ? ` · Залп ×${salvoCount}` : ''}`,
    });
    callbacksRef.current.onLaunchStarted(launcher.id, initialBearing);

    for (let i = 1; i < salvoCount; i++) {
      scheduledSalvoRef.current.push({
        launcherId: launcher.id,
        munitionId: launcher.munitionId,
        targetBuildingId: matchedBuilding?.id,
        targetPvoId: matchedPvo?.id,
        lowAltitude: isLowAlt,
        altitudeMode: altMode,
        waypoints: smoothPath,
        rawWaypoints: rawPath,
        totalDistanceKm: totalKm,
        bearingDeg: initialBearing,
        delayRemainingSec: i * 0.38,
      });
    }

    callbacksRef.current.onRouteLaunched();
    emitMapStats();
  }, [launchRouteSignal]);

  // Launch airfield aircraft sortie with custom multi-waypoint missile route
  useEffect(() => {
    if (launchAirfieldSignal === 0) return;
    const airfield = airfieldsRef.current.find((a) => a.id === selectedAirfieldRef.current);
    const launchPt = airfieldLaunchPointRef.current;
    const wps = airfieldMissileWaypointsRef.current;
    if (!airfield || !launchPt || wps.length === 0) return;

    const aircraftSpec = RUSSIAN_AIRCRAFT_BY_ID[airfield.selectedAircraftId];
    const missileSpec = MUNITION_BY_ID[aircraftSpec.missileId];
    const missileRoute = buildSmoothRoute([launchPt, ...wps]);
    const missileTotalKm = computeRouteLengthKm(missileRoute);
    if (missileTotalKm < 6) {
      soundFx.playBlocked();
      callbacksRef.current.onWarning('Выберите маршрут ракет подальше от точки пуска');
      return;
    }

    const jetDistKm = haversineDistanceKm(airfield.lat, airfield.lng, launchPt.lat, launchPt.lng);
    const jetBearingDeg = computeBearingDeg(airfield.lat, airfield.lng, launchPt.lat, launchPt.lng);
    const jetPts: RoutePoint[] = [{ lat: airfield.lat, lng: airfield.lng }, launchPt];
    const returnPts: RoutePoint[] = [launchPt, { lat: airfield.lat, lng: airfield.lng }];
    const salvoCount = Math.max(
      1,
      Math.min(aircraftSpec.missileCount, airfield.salvoCount || aircraftSpec.missileCount),
    );
    const finalDest = missileRoute[missileRoute.length - 1];
    const matchedBuilding = buildingsRef.current.find(
      (b) => haversineDistanceKm(finalDest.lat, finalDest.lng, b.lat, b.lng) <= 1.2,
    );
    const matchedPvo = !matchedBuilding
      ? airDefensesRef.current.find((p) => {
          const m = mobilePvoStateRef.current[p.id];
          const pLat = m ? m.lat : p.lat;
          const pLng = m ? m.lng : p.lng;
          return haversineDistanceKm(finalDest.lat, finalDest.lng, pLat, pLng) <= 1.5;
        })
      : undefined;

    flightsRef.current.push({
      id: `flt_air_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      launcherId: airfield.id,
      airfieldId: airfield.id,
      munitionId: aircraftSpec.missileId,
      carrierAircraftId: aircraftSpec.id,
      carrierMissileId: aircraftSpec.missileId,
      carrierMissileCount: salvoCount,
      carrierMissileWaypoints: missileRoute,
      waypoints: jetPts,
      rawWaypoints: jetPts,
      segmentIndex: 0,
      segmentProgress: 0,
      lat: airfield.lat,
      lng: airfield.lng,
      bearingDeg: jetBearingDeg,
      visualHeadingDeg: jetBearingDeg,
      totalDistanceKm: jetDistKm,
      coveredKm: 0,
      ageSec: 0,
      trail: [{ lat: airfield.lat, lng: airfield.lng }],
      kabTargetPoint: finalDest,
      kabTargetBuildingId: matchedBuilding?.id,
      kabTargetPvoId: matchedPvo?.id,
      returnWaypoints: returnPts,
    });

    forceAlertUpdateRef.current = true;
    totalLaunchesRef.current += 1;
    soundFx.playLaunch('airstrike');
    callbacksRef.current.onTacticalEvent({
      kind: 'launch',
      munitionId: aircraftSpec.missileId,
      detail: matchedBuilding
        ? `${airfield.name}: ${aircraftSpec.shortName} → ${salvoCount}× ${missileSpec.shortName} по ${BUILDING_BY_ID[matchedBuilding.buildingId].shortName}`
        : matchedPvo
          ? `${airfield.name}: ${aircraftSpec.shortName} → ${salvoCount}× ${missileSpec.shortName} по ППО ${AIR_DEFENSE_BY_ID[matchedPvo.airDefenseId].shortName}`
          : `${airfield.name}: вылет ${aircraftSpec.shortName} (${Math.round(jetDistKm)} км) → ${salvoCount}× ${missileSpec.shortName} (${Math.round(missileTotalKm)} км)`,
    });
    callbacksRef.current.onAirfieldLaunched();
    emitMapStats();
  }, [launchAirfieldSignal]);

  // Apply multi-waypoint mid-flight route change for selected airborne target
  useEffect(() => {
    if (applyFlightRouteSignal === 0) return;
    const flt = flightsRef.current.find((f) => f.id === selectedFlightRef.current);
    const wps = flightWaypointsRef.current;
    if (!flt || wps.length === 0) return;

    const newRaw = [{ lat: flt.lat, lng: flt.lng }, ...wps];
    const smoothPath = buildSmoothRoute(newRaw);
    const totalKm = Math.max(1, computeRouteLengthKm(smoothPath));
    const spec = MUNITION_BY_ID[flt.munitionId];
    if (spec.maxRangeKm && totalKm > spec.maxRangeKm) {
      soundFx.playBlocked();
      callbacksRef.current.onWarning(
        `Дальность КАБ ограничена ${spec.maxRangeKm} км (новый участок ${Math.round(totalKm)} км)`,
      );
      return;
    }

    const bearingDeg = computeBearingDeg(
      smoothPath[0].lat,
      smoothPath[0].lng,
      smoothPath[1].lat,
      smoothPath[1].lng,
    );
    const dest = smoothPath[smoothPath.length - 1];
    const matchedBuilding = buildingsRef.current.find(
      (b) => haversineDistanceKm(dest.lat, dest.lng, b.lat, b.lng) <= 1.2,
    );
    const matchedPvo = !matchedBuilding
      ? airDefensesRef.current.find((p) => {
          const m = mobilePvoStateRef.current[p.id];
          const pLat = m ? m.lat : p.lat;
          const pLng = m ? m.lng : p.lng;
          return haversineDistanceKm(dest.lat, dest.lng, pLat, pLng) <= 1.5;
        })
      : undefined;

    flt.waypoints = smoothPath;
    flt.rawWaypoints = newRaw;
    flt.segmentIndex = 0;
    flt.segmentProgress = 0;
    flt.coveredKm = 0;
    flt.totalDistanceKm = totalKm;
    flt.bearingDeg = bearingDeg;
    flt.manualSteering = false;
    flt.midFlightRedirectDone = true;
    flt.pendingCourseReportAtSec = flt.ageSec + 2.4;
    flt.trail.push({ lat: flt.lat, lng: flt.lng });
    if (flt.trail.length > 64) flt.trail.shift();

    if (flt.carrierAircraftId || flt.munitionId === 'su57-kab') {
      if (flt.returnWaypoints) {
        const homePt = flt.returnWaypoints[flt.returnWaypoints.length - 1];
        flt.returnWaypoints = [dest, homePt];
      }
    } else {
      flt.targetBuildingId = matchedBuilding?.id;
      flt.targetPvoId = matchedPvo?.id;
    }

    forceAlertUpdateRef.current = true;
    soundFx.playSelectLauncher();
    callbacksRef.current.onFlightRouteApplied();
    callbacksRef.current.onSelectFlight({
      id: flt.id,
      munitionId: flt.munitionId,
      carrierAircraftId: flt.carrierAircraftId,
      isAiStrike: flt.isAiStrike,
      lowAltitude: flt.lowAltitude,
      altitudeMode: getFlightAltitudeMode(flt),
      remainingKm: Math.round(totalKm),
    });
  }, [applyFlightRouteSignal]);

  // Spawn AI defense-mode strike waves (from visible deployed launchers) & rare airfield sorties
  useEffect(() => {
    if (aiWaveSignal === 0) return;
    const orders = pendingAiWaveOrdersRef.current ?? [];
    const sorties = pendingAiSortiesRef.current ?? [];
    if (orders.length === 0 && sorties.length === 0) {
      callbacksRef.current.onAiWaveOrdersConsumed();
      return;
    }

    let launchedImmediate = false;
    let firstVisibleProfile: FlightProfile | null = null;

    for (const order of orders) {
      if (order.waypoints.length < 2) continue;
      const spec = MUNITION_BY_ID[order.munitionId];
      const launcher = launchersRef.current.find((l) => l.id === order.launcherId);
      const startPt = launcher ? { lat: launcher.lat, lng: launcher.lng } : order.waypoints[0];
      const smoothPath = buildSmoothRoute([startPt, ...order.waypoints.slice(1)]);
      const totalKm = computeRouteLengthKm(smoothPath);
      const bearingDeg = computeBearingDeg(
        smoothPath[0].lat,
        smoothPath[0].lng,
        smoothPath[1].lat,
        smoothPath[1].lng,
      );
      const orderAltMode: AltitudeMode =
        order.altitudeMode ?? (order.lowAltitude ? 'low' : 'normal');
      if (orderAltMode === 'normal' && !firstVisibleProfile) {
        firstVisibleProfile = spec.profile;
      }

      if (order.delaySec <= 0.05) {
        flightsRef.current.push({
          id: `flt_ai_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          launcherId: order.launcherId,
          munitionId: order.munitionId,
          targetBuildingId: order.targetBuildingId,
          targetPvoId: order.targetPvoId,
          lowAltitude: orderAltMode !== 'normal',
          altitudeMode: orderAltMode,
          climbAtProgress: order.climbAtProgress,
          postClimbAltitudeMode: order.postClimbAltitudeMode,
          isAiStrike: true,
          waypoints: smoothPath,
          rawWaypoints: smoothPath,
          segmentIndex: 0,
          segmentProgress: 0,
          lat: smoothPath[0].lat,
          lng: smoothPath[0].lng,
          bearingDeg,
          visualHeadingDeg: bearingDeg,
          totalDistanceKm: totalKm,
          coveredKm: 0,
          ageSec: 0,
          trail: [{ lat: smoothPath[0].lat, lng: smoothPath[0].lng }],
        });
        totalLaunchesRef.current += 1;
        launchedImmediate = true;
        if (launcher) {
          callbacksRef.current.onLaunchStarted(launcher.id, bearingDeg);
        }
      } else {
        scheduledSalvoRef.current.push({
          launcherId: order.launcherId,
          munitionId: order.munitionId,
          targetBuildingId: order.targetBuildingId,
          targetPvoId: order.targetPvoId,
          lowAltitude: orderAltMode !== 'normal',
          altitudeMode: orderAltMode,
          climbAtProgress: order.climbAtProgress,
          postClimbAltitudeMode: order.postClimbAltitudeMode,
          startPoint: smoothPath[0],
          isAiStrike: true,
          waypoints: smoothPath,
          rawWaypoints: smoothPath,
          totalDistanceKm: totalKm,
          bearingDeg,
          delayRemainingSec: order.delaySec,
        });
      }
    }

    for (const sortie of sorties) {
      const af =
        airfieldsRef.current.find(
          (a) => a.presetId === sortie.airfieldPresetId || a.id === sortie.airfieldPresetId,
        ) ?? airfieldsRef.current.find((a) => a.isAi);
      if (!af || sortie.missileWaypoints.length < 2) continue;

      const aircraftSpec = RUSSIAN_AIRCRAFT_BY_ID[sortie.aircraftId];
      const missileSpec = MUNITION_BY_ID[aircraftSpec.missileId];
      const jetDistKm = haversineDistanceKm(
        af.lat,
        af.lng,
        sortie.launchPoint.lat,
        sortie.launchPoint.lng,
      );
      const jetBearingDeg = computeBearingDeg(
        af.lat,
        af.lng,
        sortie.launchPoint.lat,
        sortie.launchPoint.lng,
      );
      const jetPts: RoutePoint[] = [{ lat: af.lat, lng: af.lng }, sortie.launchPoint];
      const returnPts: RoutePoint[] = [sortie.launchPoint, { lat: af.lat, lng: af.lng }];
      const finalDest = sortie.missileWaypoints[sortie.missileWaypoints.length - 1];

      flightsRef.current.push({
        id: `flt_ai_air_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        launcherId: af.id,
        airfieldId: af.id,
        munitionId: aircraftSpec.missileId,
        carrierAircraftId: aircraftSpec.id,
        carrierMissileId: aircraftSpec.missileId,
        carrierMissileCount: sortie.missileCount,
        carrierMissileWaypoints: sortie.missileWaypoints,
        isAiStrike: true,
        waypoints: jetPts,
        rawWaypoints: jetPts,
        segmentIndex: 0,
        segmentProgress: 0,
        lat: af.lat,
        lng: af.lng,
        bearingDeg: jetBearingDeg,
        visualHeadingDeg: jetBearingDeg,
        totalDistanceKm: jetDistKm,
        coveredKm: 0,
        ageSec: 0,
        trail: [{ lat: af.lat, lng: af.lng }],
        kabTargetPoint: finalDest,
        kabTargetBuildingId: sortie.targetBuildingId,
        returnWaypoints: returnPts,
      });
      totalLaunchesRef.current += 1;
      launchedImmediate = true;
      if (!firstVisibleProfile) {
        firstVisibleProfile = 'airstrike';
      }
      callbacksRef.current.onTacticalEvent({
        kind: 'launch',
        munitionId: aircraftSpec.missileId,
        detail: `${af.name}: взлёт ${aircraftSpec.shortName} (${sortie.missileCount}× ${missileSpec.shortName})`,
      });
    }

    if (launchedImmediate) {
      forceAlertUpdateRef.current = true;
    }
    if (firstVisibleProfile) {
      soundFx.playLaunch(firstVisibleProfile);
    }
    if (orders.length > 0) {
      const visibleCount = orders.filter((o) => !o.lowAltitude).length;
      const stealthCount = orders.filter((o) => o.lowAltitude).length;
      const summaryParts: string[] = [];
      if (visibleCount > 0) summaryParts.push(`${visibleCount} рак./БПЛА`);
      if (stealthCount > 0) summaryParts.push(`${stealthCount} низковыс. БПЛА (нужен РЛС)`);
      callbacksRef.current.onTacticalEvent({
        kind: 'launch',
        munitionId: orders[0].munitionId,
        detail: `ПУ ИИ (${orders[0].originName}): ${summaryParts.join(' + ')}`,
      });
    }

    callbacksRef.current.onAiWaveOrdersConsumed();
    emitMapStats();
  }, [aiWaveSignal]);

  useEffect(() => {
    if (!focusCoords || !mapRef.current) return;
    zoomAnimRef.current.active = false;
    mapRef.current.setView(
      [focusCoords.lat, focusCoords.lng],
      focusCoords.zoom ?? mapRef.current.getZoom(),
      { animate: false },
    );
  }, [focusCoords]);

  useEffect(() => {
    const map = mapRef.current;
    const labelsLayer = labelsLayerRef.current;
    if (!map || !labelsLayer) return;
    if (showLabels) {
      if (!map.hasLayer(labelsLayer)) labelsLayer.addTo(map);
    } else if (map.hasLayer(labelsLayer)) {
      map.removeLayer(labelsLayer);
    }
  }, [showLabels]);

  useEffect(() => {
    const map = mapRef.current;
    const raionsLayer = raionsLayerRef.current;
    const russiaRegionsLayer = russiaRegionsLayerRef.current;
    const oblastsLayer = oblastsLayerRef.current;
    if (!map || !raionsLayer || !oblastsLayer) return;
    if (showRaions) {
      if (!map.hasLayer(raionsLayer)) raionsLayer.addTo(map);
      if (russiaRegionsLayer && !map.hasLayer(russiaRegionsLayer)) russiaRegionsLayer.addTo(map);
      if (!map.hasLayer(oblastsLayer)) oblastsLayer.addTo(map);
    } else {
      if (map.hasLayer(raionsLayer)) map.removeLayer(raionsLayer);
      if (russiaRegionsLayer && map.hasLayer(russiaRegionsLayer)) map.removeLayer(russiaRegionsLayer);
      if (map.hasLayer(oblastsLayer)) map.removeLayer(oblastsLayer);
    }
  }, [showRaions]);

  useEffect(() => {
    const map = mapRef.current;
    const occupiedLayer = occupiedLayerRef.current;
    if (!map || !occupiedLayer) return;
    if (showFrontline) {
      if (!map.hasLayer(occupiedLayer)) occupiedLayer.addTo(map);
    } else {
      if (map.hasLayer(occupiedLayer)) map.removeLayer(occupiedLayer);
    }
  }, [showFrontline]);

  useEffect(() => {
    const container = mapContainerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const map = L.map(container, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      minZoom: 3,
      maxZoom: 18,
      zoomSnap: 0,
      zoomDelta: 0.5,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      zoomControl: false,
      attributionControl: false,
      zoomAnimation: false,
      markerZoomAnimation: false,
      fadeAnimation: false,
      worldCopyJump: false,
      maxBounds: [
        [-80, -30],
        [85, 200],
      ],
      maxBoundsViscosity: 0.7,
    });
    mapRef.current = map;

    const labelsLayer = new SmoothCachedTileLayer(
      {
        styleKey: 'arcgis-labels',
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        maxNativeZoom: 17,
        maxZoom: 18,
        minZoom: 3,
        opacity: 0.88,
        keepBuffer: 4,
        updateWhenZooming: true,
        updateWhenIdle: false,
        transparent: true,
        zIndex: 3,
      },
      () => zoomAnimRef.current.active,
    );
    labelsLayerRef.current = labelsLayer;
    if (showLabels) {
      labelsLayer.addTo(map);
    }

    // Dedicated panes so occupied territories, raions, and oblasts layer cleanly
    const occupiedPane = map.createPane('occupiedPane');
    occupiedPane.style.zIndex = '235';
    occupiedPane.style.pointerEvents = 'none';

    const raionPane = map.createPane('raionPane');
    raionPane.style.zIndex = '240';
    raionPane.style.pointerEvents = 'none';

    const oblastPane = map.createPane('oblastPane');
    oblastPane.style.zIndex = '260';
    oblastPane.style.pointerEvents = 'none';

    const borderPane = map.createPane('borderPane');
    borderPane.style.zIndex = '270';
    borderPane.style.pointerEvents = 'none';

    L.geoJSON(inverseMaskGeoJson, {
      style: {
        fillColor: '#050A14',
        fillOpacity: 0.58,
        stroke: false,
      },
      interactive: false,
    }).addTo(map);

    const occupiedLayer = L.geoJSON(deepstateOccupiedGeoJson, {
      pane: 'occupiedPane',
      interactive: false,
      style: (feature) => {
        const status = (feature?.properties as DeepStateZoneProperties | undefined)?.status;
        if (status === 'occupied_2014') {
          return {
            fill: true,
            fillColor: '#880E4F',
            fillOpacity: 0.35,
            stroke: false,
          };
        }
        return {
          fill: true,
          fillColor: '#A52714',
          fillOpacity: 0.35,
          stroke: false,
        };
      },
    });
    occupiedLayerRef.current = occupiedLayer;

    const raionPolyMap = new Map<string, L.Path>();
    const raionsLayer = L.geoJSON(ukraineRaionsGeoJson, {
      pane: 'raionPane',
      interactive: false,
      style: (feature) =>
        getRaionStyle('none', isPermanentAlertRaionId(String(feature?.properties?.id ?? ''))),
      onEachFeature: (feature, layer) => {
        const id = feature.properties?.id;
        if (id && 'setStyle' in layer) {
          raionPolyMap.set(id, layer as L.Path);
        }
      },
    });
    const russiaRegionsLayer = L.geoJSON(russiaRegionsGeoJson, {
      pane: 'raionPane',
      interactive: false,
      style: () => getRaionStyle('none', false),
      onEachFeature: (feature, layer) => {
        const id = feature.properties?.id;
        if (id && 'setStyle' in layer) {
          raionPolyMap.set(id, layer as L.Path);
        }
      },
    });
    russiaRegionsLayerRef.current = russiaRegionsLayer;
    raionPolygonMapRef.current = raionPolyMap;
    raionsLayerRef.current = raionsLayer;

    const oblastsLayer = L.geoJSON(ukraineOblastsGeoJson, {
      pane: 'oblastPane',
      interactive: false,
      style: {
        color: '#FFFFFF',
        weight: 1.4,
        opacity: 0.78,
        fill: false,
      },
    });
    oblastsLayerRef.current = oblastsLayer;

    if (showFrontline) {
      occupiedLayer.addTo(map);
    }

    if (showRaions) {
      raionsLayer.addTo(map);
      russiaRegionsLayer.addTo(map);
      oblastsLayer.addTo(map);
    }

    L.geoJSON(ukraineGeoJson, {
      style: {
        color: '#FFFFFF',
        weight: 1.15,
        opacity: 0.52,
        fill: false,
      },
      interactive: false,
    }).addTo(map);

    L.geoJSON(russiaGeoJson, {
      style: {
        color: '#FFFFFF',
        weight: 1.0,
        opacity: 0.42,
        fill: false,
      },
      interactive: false,
    }).addTo(map);

    // Clean white state border between Ukraine and Russia (no yellow/blue line)
    L.geoJSON(uaRuBorderGeoJson, {
      pane: 'borderPane',
      interactive: false,
      style: {
        color: '#FFFFFF',
        weight: 1.6,
        opacity: 0.72,
        lineCap: 'round',
        lineJoin: 'round',
      },
    }).addTo(map);

    const findHitLauncher = (pt: L.Point): PlacedLauncher | null => {
      let best: PlacedLauncher | null = null;
      let bestDist = 26;
      for (const l of launchersRef.current) {
        const lp = map.latLngToContainerPoint([l.lat, l.lng]);
        const d = Math.hypot(lp.x - pt.x, lp.y - pt.y);
        if (d < bestDist) {
          bestDist = d;
          best = l;
        }
      }
      return best;
    };

    const getPvoLiveCoords = (p: PlacedAirDefense): { lat: number; lng: number } => {
      const m = mobilePvoStateRef.current[p.id];
      return m ? { lat: m.lat, lng: m.lng } : { lat: p.lat, lng: p.lng };
    };

    const findHitPvo = (pt: L.Point, excludeRadars = false): PlacedAirDefense | null => {
      let best: PlacedAirDefense | null = null;
      let bestDist = 24;
      for (const p of airDefensesRef.current) {
        if (excludeRadars && AIR_DEFENSE_BY_ID[p.airDefenseId].isRadar) continue;
        const pos = getPvoLiveCoords(p);
        const pp = map.latLngToContainerPoint([pos.lat, pos.lng]);
        const d = Math.hypot(pp.x - pt.x, pp.y - pt.y);
        if (d < bestDist) {
          bestDist = d;
          best = p;
        }
      }
      return best;
    };

    const findHitAirfield = (pt: L.Point): PlacedAirfield | null => {
      let best: PlacedAirfield | null = null;
      let bestDist = 28;
      for (const a of airfieldsRef.current) {
        const ap = map.latLngToContainerPoint([a.lat, a.lng]);
        const d = Math.hypot(ap.x - pt.x, ap.y - pt.y);
        if (d < bestDist) {
          bestDist = d;
          best = a;
        }
      }
      return best;
    };

    const findHitBuilding = (pt: L.Point): PlacedBuilding | null => {
      let best: PlacedBuilding | null = null;
      let bestDist = 24 * Math.max(0.7, buildingScaleRef.current);
      for (const b of buildingsRef.current) {
        const bp = map.latLngToContainerPoint([b.lat, b.lng]);
        const d = Math.hypot(bp.x - pt.x, bp.y - pt.y);
        if (d < bestDist) {
          bestDist = d;
          best = b;
        }
      }
      return best;
    };

    const isFlightDetectedNow = (flt: ActiveFlight): boolean => {
      const altMode = getFlightAltitudeMode(flt);
      if (altMode === 'ultra-low') return false;
      if (altMode === 'normal') return true;
      return airDefensesRef.current.some(
        (r) =>
          AIR_DEFENSE_BY_ID[r.airDefenseId].isRadar &&
          r.hp > 0 &&
          haversineDistanceKm(r.lat, r.lng, flt.lat, flt.lng) <=
            AIR_DEFENSE_BY_ID[r.airDefenseId].rangeKm,
      );
    };

    const isFlightVisibleToUser = (flt: ActiveFlight): boolean => {
      if (isFlightDetectedNow(flt)) return true;
      return !flt.isAiStrike || gameModeRef.current === 'sandbox';
    };

    const findHitFlight = (pt: L.Point): ActiveFlight | null => {
      let best: ActiveFlight | null = null;
      let bestDist = 24;
      for (const flt of flightsRef.current) {
        if (flt.isReturnToBase || !isFlightVisibleToUser(flt)) continue;
        const fp = map.latLngToContainerPoint([flt.lat, flt.lng]);
        const d = Math.hypot(fp.x - pt.x, fp.y - pt.y);
        if (d < bestDist) {
          bestDist = d;
          best = flt;
        }
      }
      return best;
    };

    // Right-mouse-button hold & drag panning + right-click delete on placed units/objects
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 2) return;
      rightDragRef.current = {
        active: true,
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        moved: false,
        suppressNextContextMenu: false,
      };
      container.style.cursor = 'grabbing';
    };

    const onWindowMouseMove = (e: MouseEvent) => {
      const drag = rightDragRef.current;
      if (!drag.active) return;

      const totalDist = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);
      if (totalDist > 4) {
        drag.moved = true;
        drag.suppressNextContextMenu = true;
      }

      const dx = e.clientX - drag.lastX;
      const dy = e.clientY - drag.lastY;
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;

      if (drag.moved && (dx !== 0 || dy !== 0)) {
        zoomAnimRef.current.active = false;
        if (followCamFlightIdRef.current) {
          followCamFlightIdRef.current = null;
          callbacksRef.current.onFollowCamChange(false);
        }
        map.panBy([-dx, -dy], { animate: false });
      }
    };

    const onWindowMouseUp = (e: MouseEvent) => {
      if (e.button !== 2) return;
      const drag = rightDragRef.current;
      if (!drag.active) return;
      const wasMoved = drag.moved;
      drag.active = false;
      container.style.cursor = '';

      if (!wasMoved) {
        const box = container.getBoundingClientRect();
        const pt = L.point(e.clientX - box.left, e.clientY - box.top);

        // Right-click on any player-placed unit/object/building/airfield deletes it immediately
        const candidates: Array<{ dist: number; remove: () => void }> = [];
        const hitL = findHitLauncher(pt);
        if (hitL && !hitL.isAi) {
          const lp = map.latLngToContainerPoint([hitL.lat, hitL.lng]);
          candidates.push({
            dist: Math.hypot(lp.x - pt.x, lp.y - pt.y),
            remove: () => callbacksRef.current.onRemoveLauncher(hitL.id),
          });
        }
        const hitAf = findHitAirfield(pt);
        if (hitAf && !hitAf.isAi) {
          const ap = map.latLngToContainerPoint([hitAf.lat, hitAf.lng]);
          candidates.push({
            dist: Math.hypot(ap.x - pt.x, ap.y - pt.y),
            remove: () => callbacksRef.current.onRemoveAirfield(hitAf.id),
          });
        }
        const hitP = findHitPvo(pt);
        if (hitP) {
          const pPos = getPvoLiveCoords(hitP);
          const pp = map.latLngToContainerPoint([pPos.lat, pPos.lng]);
          candidates.push({
            dist: Math.hypot(pp.x - pt.x, pp.y - pt.y),
            remove: () => {
              delete mobilePvoStateRef.current[hitP.id];
              callbacksRef.current.onRemovePvo(hitP.id);
            },
          });
        }
        const hitB = gameModeRef.current !== 'ai' ? findHitBuilding(pt) : null;
        if (hitB) {
          const bp = map.latLngToContainerPoint([hitB.lat, hitB.lng]);
          candidates.push({
            dist: Math.hypot(bp.x - pt.x, bp.y - pt.y),
            remove: () => callbacksRef.current.onRemoveBuilding(hitB.id),
          });
        }

        if (candidates.length > 0) {
          candidates.sort((a, b) => a.dist - b.dist);
          candidates[0].remove();
          soundFx.playSelectLauncher();
          return;
        }

        if (pendingRef.current) {
          callbacksRef.current.onCancelPending();
        } else if (selectedFlightRef.current) {
          followCamFlightIdRef.current = null;
          callbacksRef.current.onFollowCamChange(false);
          callbacksRef.current.onSelectFlight(null);
        } else if (airfieldLaunchPointRef.current) {
          callbacksRef.current.onSetAirfieldLaunchPoint(null);
        } else if (su57DropPointRef.current) {
          callbacksRef.current.onSetSu57DropPoint(null);
        } else if (selectedAirfieldRef.current) {
          callbacksRef.current.onSelectAirfield(null);
        } else if (selectedRef.current) {
          callbacksRef.current.onSelectLauncher(null);
        }
      }
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      if (rightDragRef.current.suppressNextContextMenu) {
        rightDragRef.current.suppressNextContextMenu = false;
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const box = container.getBoundingClientRect();
      const pt = L.point(e.clientX - box.left, e.clientY - box.top);
      const baseZoom = zoomAnimRef.current.active ? zoomAnimRef.current.targetZoom : map.getZoom();
      const normY =
        e.deltaMode === 1
          ? e.deltaY * 16
          : e.deltaMode === 2
            ? e.deltaY * box.height
            : e.deltaY;
      const sensitivity = e.ctrlKey ? 0.0085 : 0.0024;
      const nextTarget = Math.max(3, Math.min(18, baseZoom - normY * sensitivity));
      if (followCamFlightIdRef.current) {
        map.setZoom(nextTarget, { animate: false });
        return;
      }
      zoomAnimRef.current = {
        active: true,
        targetZoom: nextTarget,
        anchorPoint: pt,
      };
    };

    const onDragStart = () => {
      zoomAnimRef.current.active = false;
      if (followCamFlightIdRef.current) {
        followCamFlightIdRef.current = null;
        callbacksRef.current.onFollowCamChange(false);
      }
    };

    map.on('dragstart', onDragStart);
    container.addEventListener('wheel', onWheel, { passive: false });
    container.addEventListener('mousedown', onMouseDown);
    container.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('mousemove', onWindowMouseMove);
    window.addEventListener('mouseup', onWindowMouseUp);

    map.on('mousemove', (ev: L.LeafletMouseEvent) => {
      const pt = map.latLngToContainerPoint(ev.latlng);
      cursorRef.current = {
        x: pt.x,
        y: pt.y,
        lat: ev.latlng.lat,
        lng: ev.latlng.lng,
        inside: true,
      };
      const hitL = findHitLauncher(pt);
      const hitAf = findHitAirfield(pt);
      const hitP = findHitPvo(pt);
      const hitB = findHitBuilding(pt);
      const hitF = findHitFlight(pt);
      hoveredLauncherIdRef.current = hitL ? hitL.id : null;
      hoveredAirfieldIdRef.current = hitAf ? hitAf.id : null;
      hoveredPvoIdRef.current = hitP ? hitP.id : null;
      hoveredBuildingIdRef.current = hitB ? hitB.id : null;
      hoveredFlightIdRef.current = hitF ? hitF.id : null;

      const hoveredMeta = getRaionAt(ev.latlng.lat, ev.latlng.lng);
      if (hoveredMeta) {
        const threat = activeThreatsRef.current.get(hoveredMeta.id) ?? 'none';
        const zoneStatus = getFrontlineZoneAt(ev.latlng.lat, ev.latlng.lng);
        setHoveredRaion((prev) =>
          prev &&
          prev.meta.id === hoveredMeta.id &&
          prev.threat === threat &&
          prev.zoneStatus === zoneStatus
            ? prev
            : { meta: hoveredMeta, threat, zoneStatus },
        );
      } else {
        setHoveredRaion((prev) => (prev === null ? prev : null));
      }

      if (rightDragRef.current.active) {
        container.style.cursor = 'grabbing';
      } else if (pendingRef.current || plottingRef.current || plottingFlightRef.current) {
        container.style.cursor = 'crosshair';
      } else if ((hitL && !hitL.isAi) || (hitAf && !hitAf.isAi) || hitF) {
        container.style.cursor = 'pointer';
      } else if (selectedRef.current || selectedAirfieldRef.current || selectedFlightRef.current) {
        container.style.cursor = 'crosshair';
      } else {
        container.style.cursor = '';
      }
    });

    map.on('mouseout', () => {
      cursorRef.current.inside = false;
      hoveredLauncherIdRef.current = null;
      hoveredAirfieldIdRef.current = null;
      hoveredPvoIdRef.current = null;
      hoveredBuildingIdRef.current = null;
      hoveredFlightIdRef.current = null;
      setHoveredRaion(null);
    });

    map.on('click', (ev: L.LeafletMouseEvent) => {
      const pt = map.latLngToContainerPoint(ev.latlng);
      const { lat, lng } = ev.latlng;

      // 1. Place pending launcher, airfield, ППО unit, or infrastructure building
      if (pendingRef.current) {
        if (pendingRef.current.kind === 'strike') {
          const spec = MUNITION_BY_ID[pendingRef.current.id];
          const placeCheck = isFactionPlacementAllowed(spec.faction, lat, lng);
          if (!placeCheck.allowed) {
            soundFx.playBlocked();
            callbacksRef.current.onWarning(
              placeCheck.reason ?? 'Недопустимая зона для размещения этой установки',
            );
            return;
          }
          soundFx.playPlaceLauncher();
          callbacksRef.current.onPlaceStrikeLauncher(pendingRef.current.id, lat, lng);
        } else if (pendingRef.current.kind === 'airfield') {
          const placeCheck = isFactionPlacementAllowed('RU', lat, lng);
          if (!placeCheck.allowed) {
            soundFx.playBlocked();
            callbacksRef.current.onWarning(
              placeCheck.reason ?? 'Аэродром ВКС РФ можно поставить только в РФ или на оккупированной территории',
            );
            return;
          }
          soundFx.playPlaceLauncher();
          callbacksRef.current.onPlaceAirfield(lat, lng);
        } else {
          const territory = getTerritoryAt(lat, lng);
          if (!territory) {
            soundFx.playBlocked();
            callbacksRef.current.onWarning(
              'Установку можно поставить только на территории Украины или России',
            );
            return;
          }
          if (pendingRef.current.kind === 'pvo') {
            soundFx.playPlaceLauncher();
            callbacksRef.current.onPlaceAirDefense(pendingRef.current.id, lat, lng);
          } else {
            soundFx.playPlaceLauncher();
            callbacksRef.current.onPlaceBuilding(pendingRef.current.id, lat, lng);
          }
        }
        return;
      }

      // 2. If currently plotting custom waypoint route for selected launcher
      if (selectedRef.current && plottingRef.current) {
        const launcher = launchersRef.current.find((l) => l.id === selectedRef.current);
        if (!launcher) return;

        const hitB = findHitBuilding(pt);
        const hitP = !hitB ? findHitPvo(pt, true) : null;
        const hitPPos = hitP ? getPvoLiveCoords(hitP) : null;
        const wpLat = hitB ? hitB.lat : hitPPos ? hitPPos.lat : lat;
        const wpLng = hitB ? hitB.lng : hitPPos ? hitPPos.lng : lng;

        const wps = waypointsRef.current;
        const prevPoint: RoutePoint =
          wps.length > 0 ? wps[wps.length - 1] : { lat: launcher.lat, lng: launcher.lng };

        const segDist = haversineDistanceKm(prevPoint.lat, prevPoint.lng, wpLat, wpLng);
        if (segDist < 6) {
          soundFx.playBlocked();
          callbacksRef.current.onWarning('Поставьте точку маршрута чуть дальше от предыдущей');
          return;
        }

        const check = isFlightPathAllowed(prevPoint.lat, prevPoint.lng, wpLat, wpLng);
        if (!check.allowed) {
          soundFx.playBlocked();
          callbacksRef.current.onWarning(
            check.reason ?? 'Маршрут разрешён только по территории Украины и России',
          );
          return;
        }

        const spec = MUNITION_BY_ID[launcher.munitionId];
        if (spec.maxRangeKm) {
          const candidateSmooth = buildSmoothRoute([
            { lat: launcher.lat, lng: launcher.lng },
            ...wps,
            { lat: wpLat, lng: wpLng },
          ]);
          const nextTotalKm = computeRouteLengthKm(candidateSmooth);
          if (nextTotalKm > spec.maxRangeKm) {
            soundFx.playBlocked();
            callbacksRef.current.onWarning(
              `Дальность КАБ ограничена ${spec.maxRangeKm} км (получится ${Math.round(nextTotalKm)} км)`,
            );
            return;
          }
        }

        soundFx.playSelectLauncher();
        callbacksRef.current.onAddWaypoint(wpLat, wpLng);
        return;
      }

      // 3. Handle selected airborne flight (switch target / add waypoint / 1-click mid-flight redirect)
      const activateFlightSelection = (targetFlt: ActiveFlight) => {
        soundFx.playSelectLauncher();
        const steerable = isManuallySteerableFlight(targetFlt);
        if (steerable) {
          followCamFlightIdRef.current = targetFlt.id;
          callbacksRef.current.onFollowCamChange(true);
          zoomAnimRef.current.active = false;
          const minZoom = isShahedMunition(targetFlt.munitionId) ? 11.8 : 11.0;
          const focusZoom = Math.max(minZoom, map.getZoom());
          map.setView([targetFlt.lat, targetFlt.lng], focusZoom, { animate: false });
        } else {
          followCamFlightIdRef.current = null;
          callbacksRef.current.onFollowCamChange(false);
        }
        callbacksRef.current.onSelectFlight({
          id: targetFlt.id,
          munitionId: targetFlt.munitionId,
          carrierAircraftId: targetFlt.carrierAircraftId,
          isAiStrike: targetFlt.isAiStrike,
          lowAltitude: targetFlt.lowAltitude,
          altitudeMode: getFlightAltitudeMode(targetFlt),
          remainingKm: Math.max(0, Math.round(targetFlt.totalDistanceKm - targetFlt.coveredKm)),
        });
      };

      const hitFlight = findHitFlight(pt);
      if (selectedFlightRef.current) {
        if (hitFlight && hitFlight.id !== selectedFlightRef.current) {
          activateFlightSelection(hitFlight);
          return;
        }

        const flt = flightsRef.current.find((f) => f.id === selectedFlightRef.current);
        if (!flt) {
          callbacksRef.current.onSelectFlight(null);
          return;
        }

        const hitB = findHitBuilding(pt);
        const hitP = !hitB ? findHitPvo(pt, true) : null;
        const hitPPos = hitP ? getPvoLiveCoords(hitP) : null;
        const targetLat = hitB ? hitB.lat : hitPPos ? hitPPos.lat : lat;
        const targetLng = hitB ? hitB.lng : hitPPos ? hitPPos.lng : lng;

        if (plottingFlightRef.current) {
          const wps = flightWaypointsRef.current;
          const prevPoint = wps.length > 0 ? wps[wps.length - 1] : { lat: flt.lat, lng: flt.lng };
          const segDist = haversineDistanceKm(prevPoint.lat, prevPoint.lng, targetLat, targetLng);
          if (segDist < 5) {
            soundFx.playBlocked();
            callbacksRef.current.onWarning('Поставьте точку маршрута чуть дальше');
            return;
          }
          const check = isFlightPathAllowed(prevPoint.lat, prevPoint.lng, targetLat, targetLng);
          if (!check.allowed) {
            soundFx.playBlocked();
            callbacksRef.current.onWarning(
              check.reason ?? 'Маршрут разрешён только по территории Украины и России',
            );
            return;
          }
          const spec = MUNITION_BY_ID[flt.munitionId];
          if (spec.maxRangeKm) {
            const nextTotalKm = computeRouteLengthKm([
              { lat: flt.lat, lng: flt.lng },
              ...wps,
              { lat: targetLat, lng: targetLng },
            ]);
            if (nextTotalKm > spec.maxRangeKm) {
              soundFx.playBlocked();
              callbacksRef.current.onWarning(
                `Дальность КАБ ограничена ${spec.maxRangeKm} км (получится ${Math.round(nextTotalKm)} км)`,
              );
              return;
            }
          }
          soundFx.playSelectLauncher();
          callbacksRef.current.onAddFlightWaypoint(targetLat, targetLng);
          return;
        }

        // Active drones and missiles are steered directly with Left/Right keys without 1-click blue trajectory preview
        if (isManuallySteerableFlight(flt)) {
          return;
        }

        // Instant 1-click mid-flight course change
        const distKm = haversineDistanceKm(flt.lat, flt.lng, targetLat, targetLng);
        if (distKm < 5) {
          soundFx.playBlocked();
          callbacksRef.current.onWarning('Выберите новый курс подальше от текущей позиции цели');
          return;
        }
        const pathCheck = isFlightPathAllowed(flt.lat, flt.lng, targetLat, targetLng);
        if (!pathCheck.allowed) {
          soundFx.playBlocked();
          callbacksRef.current.onWarning(
            pathCheck.reason ?? 'Полёты разрешены только по территории Украины и России',
          );
          return;
        }
        const spec = MUNITION_BY_ID[flt.munitionId];
        if (spec.maxRangeKm && distKm > spec.maxRangeKm) {
          soundFx.playBlocked();
          callbacksRef.current.onWarning(
            `Дальность КАБ ограничена ${spec.maxRangeKm} км (до точки ${Math.round(distKm)} км)`,
          );
          return;
        }

        const newPts: RoutePoint[] = [
          { lat: flt.lat, lng: flt.lng },
          { lat: targetLat, lng: targetLng },
        ];
        const newBearing = computeBearingDeg(flt.lat, flt.lng, targetLat, targetLng);
        flt.waypoints = newPts;
        flt.rawWaypoints = newPts;
        flt.segmentIndex = 0;
        flt.segmentProgress = 0;
        flt.coveredKm = 0;
        flt.totalDistanceKm = distKm;
        flt.bearingDeg = newBearing;
        flt.manualSteering = false;
        flt.midFlightRedirectDone = true;
        flt.pendingCourseReportAtSec = flt.ageSec + 2.4;
        flt.trail.push({ lat: flt.lat, lng: flt.lng });
        if (flt.trail.length > 64) flt.trail.shift();

        if (flt.carrierAircraftId || flt.munitionId === 'su57-kab') {
          if (flt.returnWaypoints) {
            const homePt = flt.returnWaypoints[flt.returnWaypoints.length - 1];
            flt.returnWaypoints = [{ lat: targetLat, lng: targetLng }, homePt];
          }
        } else {
          flt.targetBuildingId = hitB?.id;
          flt.targetPvoId = hitP?.id;
        }

        forceAlertUpdateRef.current = true;
        soundFx.playSelectLauncher();
        callbacksRef.current.onSelectFlight({
          id: flt.id,
          munitionId: flt.munitionId,
          carrierAircraftId: flt.carrierAircraftId,
          isAiStrike: flt.isAiStrike,
          lowAltitude: flt.lowAltitude,
          altitudeMode: getFlightAltitudeMode(flt),
          remainingKm: Math.round(distKm),
        });
        return;
      }

      // 3b. Select clicked player strike launcher, airfield, or airborne target on map
      const hitLauncher = findHitLauncher(pt);
      if (hitLauncher && !hitLauncher.isAi) {
        soundFx.playSelectLauncher();
        callbacksRef.current.onSelectLauncher(hitLauncher.id);
        return;
      }

      const hitAirfield = findHitAirfield(pt);
      if (hitAirfield && !hitAirfield.isAi) {
        soundFx.playSelectLauncher();
        callbacksRef.current.onSelectAirfield(hitAirfield.id);
        return;
      }

      if (hitFlight && !su57DropPointRef.current && !airfieldLaunchPointRef.current) {
        activateFlightSelection(hitFlight);
        return;
      }

      // 3.5. Russian Airfield 2-step launch:
      // Step 1: set launch point where aircraft flies -> Step 2: set target point/building for its missiles
      if (selectedAirfieldRef.current) {
        const airfield = airfieldsRef.current.find((a) => a.id === selectedAirfieldRef.current);
        if (!airfield) return;

        const aircraftSpec = RUSSIAN_AIRCRAFT_BY_ID[airfield.selectedAircraftId];
        const missileSpec = MUNITION_BY_ID[aircraftSpec.missileId];
        const curLaunchPt = airfieldLaunchPointRef.current;

        if (!curLaunchPt) {
          const legKm = haversineDistanceKm(airfield.lat, airfield.lng, lat, lng);
          if (legKm < 8) {
            soundFx.playBlocked();
            callbacksRef.current.onWarning(
              `Поставьте точку пуска подальше от аэродрома «${airfield.name}»`,
            );
            return;
          }
          const legCheck = isFlightPathAllowed(airfield.lat, airfield.lng, lat, lng);
          if (!legCheck.allowed) {
            soundFx.playBlocked();
            callbacksRef.current.onWarning(
              legCheck.reason ?? 'Полёты разрешены только по территории Украины и России',
            );
            return;
          }
          soundFx.playSelectLauncher();
          callbacksRef.current.onSetAirfieldLaunchPoint({ lat, lng });
          return;
        }

        const hitBuilding = findHitBuilding(pt);
        const hitPvo = !hitBuilding ? findHitPvo(pt, true) : null;
        const hitPvoPos = hitPvo ? getPvoLiveCoords(hitPvo) : null;
        const targetLat = hitBuilding ? hitBuilding.lat : hitPvoPos ? hitPvoPos.lat : lat;
        const targetLng = hitBuilding ? hitBuilding.lng : hitPvoPos ? hitPvoPos.lng : lng;

        const mWps = airfieldMissileWaypointsRef.current;
        const prevPt = mWps.length > 0 ? mWps[mWps.length - 1] : curLaunchPt;
        const segDistKm = haversineDistanceKm(prevPt.lat, prevPt.lng, targetLat, targetLng);
        if (segDistKm < 6) {
          soundFx.playBlocked();
          callbacksRef.current.onWarning('Поставьте точку маршрута ракет подальше от предыдущей');
          return;
        }
        const missilePathCheck = isFlightPathAllowed(
          prevPt.lat,
          prevPt.lng,
          targetLat,
          targetLng,
        );
        if (!missilePathCheck.allowed) {
          soundFx.playBlocked();
          callbacksRef.current.onWarning(
            missilePathCheck.reason ?? 'Полёты разрешены только по территории Украины и России',
          );
          return;
        }

        soundFx.playSelectLauncher();
        callbacksRef.current.onAddAirfieldWaypoint(targetLat, targetLng);
        return;
      }

      // 4. Direct 1-click launch from selected launcher toward clicked building or point
      if (selectedRef.current) {
        const launcher = launchersRef.current.find((l) => l.id === selectedRef.current);
        if (!launcher) return;

        if (launcher.ammo <= 0) {
          soundFx.playBlocked();
          callbacksRef.current.onWarning(
            `Боекомплект ПУ исчерпан (0/${launcher.maxAmmo}) — установите новую пусковую установку`,
          );
          return;
        }

        const hitBuilding = findHitBuilding(pt);
        const hitPvo = !hitBuilding ? findHitPvo(pt, true) : null;
        const hitPvoPos = hitPvo ? getPvoLiveCoords(hitPvo) : null;
        const targetLat = hitBuilding ? hitBuilding.lat : hitPvoPos ? hitPvoPos.lat : lat;
        const targetLng = hitBuilding ? hitBuilding.lng : hitPvoPos ? hitPvoPos.lng : lng;

        const distKm = haversineDistanceKm(launcher.lat, launcher.lng, targetLat, targetLng);
        if (distKm < 8) {
          soundFx.playBlocked();
          callbacksRef.current.onWarning('Выберите точку цели подальше от пусковой установки');
          return;
        }

        const pathCheck = isFlightPathAllowed(launcher.lat, launcher.lng, targetLat, targetLng);
        if (!pathCheck.allowed) {
          soundFx.playBlocked();
          callbacksRef.current.onWarning(
            pathCheck.reason ?? 'Полёты разрешены только по территории Украины и России',
          );
          return;
        }

        const spec = MUNITION_BY_ID[launcher.munitionId];

        // Su-57 2-step flow: Step 1 places aircraft drop point -> Step 2 picks КАБ target <= 75 km
        if (spec.id === 'su57-kab') {
          const curDrop = su57DropPointRef.current;
          if (!curDrop) {
            const dropDistKm = haversineDistanceKm(launcher.lat, launcher.lng, lat, lng);
            if (dropDistKm < 8) {
              soundFx.playBlocked();
              callbacksRef.current.onWarning('Поставьте точку сброса подальше от аэродрома Су-57');
              return;
            }
            const dropPathCheck = isFlightPathAllowed(launcher.lat, launcher.lng, lat, lng);
            if (!dropPathCheck.allowed) {
              soundFx.playBlocked();
              callbacksRef.current.onWarning(
                dropPathCheck.reason ?? 'Полёты разрешены только по территории Украины и России',
              );
              return;
            }
            soundFx.playSelectLauncher();
            callbacksRef.current.onSetSu57DropPoint({ lat, lng });
            return;
          }

          const kabDistKm = haversineDistanceKm(curDrop.lat, curDrop.lng, targetLat, targetLng);
          const maxKabKm = spec.kabMaxRangeKm ?? 75;
          if (kabDistKm < 4) {
            soundFx.playBlocked();
            callbacksRef.current.onWarning('Выберите цель для КАБ подальше от точки сброса');
            return;
          }
          if (kabDistKm > maxKabKm) {
            soundFx.playBlocked();
            callbacksRef.current.onWarning(
              `Дальность КАБ от точки сброса ограничена ${maxKabKm} км (сейчас ${Math.round(kabDistKm)} км)`,
            );
            return;
          }
          const kabPathCheck = isFlightPathAllowed(curDrop.lat, curDrop.lng, targetLat, targetLng);
          if (!kabPathCheck.allowed) {
            soundFx.playBlocked();
            callbacksRef.current.onWarning(
              kabPathCheck.reason ?? 'Полёты разрешены только по территории Украины и России',
            );
            return;
          }

          const jetDistKm = haversineDistanceKm(launcher.lat, launcher.lng, curDrop.lat, curDrop.lng);
          const jetBearingDeg = computeBearingDeg(launcher.lat, launcher.lng, curDrop.lat, curDrop.lng);
          const jetPts: RoutePoint[] = [
            { lat: launcher.lat, lng: launcher.lng },
            curDrop,
          ];
          const returnPts: RoutePoint[] = [
            curDrop,
            { lat: launcher.lat, lng: launcher.lng },
          ];

          flightsRef.current.push({
            id: `flt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            launcherId: launcher.id,
            munitionId: launcher.munitionId,
            waypoints: jetPts,
            rawWaypoints: jetPts,
            segmentIndex: 0,
            segmentProgress: 0,
            lat: launcher.lat,
            lng: launcher.lng,
            bearingDeg: jetBearingDeg,
            visualHeadingDeg: jetBearingDeg,
            totalDistanceKm: jetDistKm,
            coveredKm: 0,
            ageSec: 0,
            trail: [{ lat: launcher.lat, lng: launcher.lng }],
            kabTargetPoint: { lat: targetLat, lng: targetLng },
            kabTargetBuildingId: hitBuilding?.id,
            kabTargetPvoId: hitPvo?.id,
            returnWaypoints: returnPts,
          });
          forceAlertUpdateRef.current = true;
          totalLaunchesRef.current += 1;
          soundFx.playLaunch(spec.profile);
          callbacksRef.current.onTacticalEvent({
            kind: 'launch',
            munitionId: launcher.munitionId,
            detail: hitBuilding
              ? `Вылет → сброс КАБ по ${BUILDING_BY_ID[hitBuilding.buildingId].shortName} (${Math.round(jetDistKm)} + ${Math.round(kabDistKm)} км)`
              : hitPvo
                ? `Вылет → сброс КАБ по ППО ${AIR_DEFENSE_BY_ID[hitPvo.airDefenseId].shortName} (${Math.round(jetDistKm)} + ${Math.round(kabDistKm)} км)`
                : `Вылет к точке сброса (${Math.round(jetDistKm)} км) → КАБ ${Math.round(kabDistKm)} км`,
          });
          callbacksRef.current.onSetSu57DropPoint(null);
          callbacksRef.current.onLaunchStarted(launcher.id, jetBearingDeg);
          emitMapStats();
          return;
        }

        if (spec.maxRangeKm && distKm > spec.maxRangeKm) {
          soundFx.playBlocked();
          callbacksRef.current.onWarning(
            `Дальность КАБ ограничена ${spec.maxRangeKm} км (до цели ${Math.round(distKm)} км) — используйте Су-57 или поставьте ближе`,
          );
          return;
        }

        const bearingDeg = computeBearingDeg(launcher.lat, launcher.lng, targetLat, targetLng);
        const pts = [
          { lat: launcher.lat, lng: launcher.lng },
          { lat: targetLat, lng: targetLng },
        ];
        const altMode: AltitudeMode = spec.canFlyLow ? routeAltitudeModeRef.current : 'normal';
        const isLowAlt = altMode !== 'normal';
        const altTag =
          altMode === 'ultra-low' ? ' · Очень низко' : altMode === 'low' ? ' · Низко' : '';

        const flight: ActiveFlight = {
          id: `flt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          launcherId: launcher.id,
          munitionId: launcher.munitionId,
          targetBuildingId: hitBuilding?.id,
          targetPvoId: hitPvo?.id,
          lowAltitude: isLowAlt,
          altitudeMode: altMode,
          waypoints: pts,
          rawWaypoints: pts,
          segmentIndex: 0,
          segmentProgress: 0,
          lat: launcher.lat,
          lng: launcher.lng,
          bearingDeg,
          visualHeadingDeg: bearingDeg,
          totalDistanceKm: distKm,
          coveredKm: 0,
          ageSec: 0,
          trail: [{ lat: launcher.lat, lng: launcher.lng }],
          ...(spec.profile === 'airstrike'
            ? {
                bombDropThresholds: [0.18, 0.33, 0.48, 0.63, 0.78, 0.93],
                bombsDroppedCount: 0,
              }
            : {}),
        };

        flightsRef.current.push(flight);
        forceAlertUpdateRef.current = true;
        totalLaunchesRef.current += 1;
        soundFx.playLaunch(spec.profile);
        callbacksRef.current.onTacticalEvent({
          kind: 'launch',
          munitionId: launcher.munitionId,
          detail: hitBuilding
            ? `→ ${BUILDING_BY_ID[hitBuilding.buildingId].shortName} (${formatLocationLabel(targetLat, targetLng)}, ${Math.round(distKm)} км)${altTag}`
            : hitPvo
              ? `→ ППО ${AIR_DEFENSE_BY_ID[hitPvo.airDefenseId].shortName} (${Math.round(distKm)} км)${altTag}`
              : `→ ${formatLocationLabel(targetLat, targetLng)} (${Math.round(distKm)} км)${altTag}`,
        });
        callbacksRef.current.onLaunchStarted(launcher.id, bearingDeg);
        emitMapStats();
      }
    });

    const syncCanvasSize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(100, Math.floor(rect.width));
      const h = Math.max(100, Math.floor(rect.height));
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      map.invalidateSize({ pan: false, animate: false });
    };

    syncCanvasSize();
    const resizeObserver = new ResizeObserver(syncCanvasSize);
    resizeObserver.observe(container);

    let animId = 0;
    let lastTime = performance.now();
    let trailTimer = 0;
    let alertTimer = 0;

    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;
      const timeSec = now / 1000;
      trailTimer += dt;
      alertTimer += dt;

      // Smooth 60fps anchored zoom synchronized inside canvas tick (zero drift, zero tile black flash)
      if (zoomAnimRef.current.active) {
        const currZoom = map.getZoom();
        const targetZoom = zoomAnimRef.current.targetZoom;
        const diff = targetZoom - currZoom;
        if (Math.abs(diff) < 0.002) {
          zoomAnimRef.current.active = false;
          map.setZoomAround(zoomAnimRef.current.anchorPoint, targetZoom, { animate: false });
        } else {
          const factor = 1 - Math.exp(-16 * dt);
          const nextZoom = currZoom + diff * factor;
          map.setZoomAround(zoomAnimRef.current.anchorPoint, nextZoom, { animate: false });
        }
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        animId = requestAnimationFrame(tick);
        return;
      }

      const rect = container.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);

      let statsDirty = false;
      const recordTrail = trailTimer >= 0.08;
      if (recordTrail) trailTimer = 0;

      const triggerExplosionAt = (
        lat: number,
        lng: number,
        munitionId: MunitionId,
        power: number,
        expId: string,
        targetBuildingId?: string,
        targetPvoId?: string,
      ) => {
        const expSpec = MUNITION_BY_ID[munitionId];
        const { particles, fireLobes, smokePuffs } = createExplosionParticles(power);
        explosionsRef.current.push({
          id: expId,
          lat,
          lng,
          munitionId,
          age: 0,
          duration: 3.2 + power * 0.85,
          power,
          particles,
          fireLobes,
          smokePuffs,
        });

        const effectiveBlastKm = expSpec.blastRadiusKm;
        const tightSplashKm = Math.min(4.5, effectiveBlastKm);

        const destroyedLaunchers =
          targetPvoId || targetBuildingId
            ? []
            : launchersRef.current
                .filter((l) => haversineDistanceKm(lat, lng, l.lat, l.lng) <= tightSplashKm)
                .map((l) => l.id);

        // Damage PVO units strictly when non-radar PVO is targeted or within a tight untargeted impact radius (radars are immune to strikes)
        const hitPvoIds = new Set<string>();
        if (targetPvoId) {
          for (const p of airDefensesRef.current) {
            if (p.id !== targetPvoId) continue;
            if (AIR_DEFENSE_BY_ID[p.airDefenseId].isRadar) continue;
            const m = mobilePvoStateRef.current[p.id];
            const pLat = m ? m.lat : p.lat;
            const pLng = m ? m.lng : p.lng;
            const dKm = haversineDistanceKm(lat, lng, pLat, pLng);
            if (dKm <= Math.max(8, effectiveBlastKm)) {
              hitPvoIds.add(p.id);
            }
          }
        } else if (!targetBuildingId) {
          for (const p of airDefensesRef.current) {
            if (AIR_DEFENSE_BY_ID[p.airDefenseId].isRadar) continue;
            const m = mobilePvoStateRef.current[p.id];
            const pLat = m ? m.lat : p.lat;
            const pLng = m ? m.lng : p.lng;
            if (haversineDistanceKm(lat, lng, pLat, pLng) <= tightSplashKm) {
              hitPvoIds.add(p.id);
            }
          }
        }

        const pvoUpdates: Array<{ id: string; hp: number }> = [];
        const destroyedPvos: string[] = [];
        const damagedPvoLabels: string[] = [];
        const destroyedPvoLabels: string[] = [];

        if (hitPvoIds.size > 0) {
          const nextPvos: PlacedAirDefense[] = [];
          for (const p of airDefensesRef.current) {
            if (!hitPvoIds.has(p.id)) {
              nextPvos.push(p);
              continue;
            }
            const pSpec = AIR_DEFENSE_BY_ID[p.airDefenseId];
            const nextHp = Math.max(0, Math.round(p.hp - expSpec.damage));
            pvoUpdates.push({ id: p.id, hp: nextHp });
            if (nextHp <= 0) {
              destroyedPvos.push(p.id);
              destroyedPvoLabels.push(pSpec.shortName);
              const m = mobilePvoStateRef.current[p.id];
              const pLat = m ? m.lat : p.lat;
              const pLng = m ? m.lng : p.lng;
              delete mobilePvoStateRef.current[p.id];
              const sec = createExplosionParticles(0.8);
              explosionsRef.current.push({
                id: `cook_${p.id}_${Date.now()}`,
                lat: pLat,
                lng: pLng,
                munitionId,
                age: 0,
                duration: 2.5,
                power: 0.8,
                ...sec,
              });
            } else {
              nextPvos.push({ ...p, hp: nextHp });
              damagedPvoLabels.push(`${pSpec.shortName} (${nextHp}/${p.maxHp} HP)`);
            }
          }
          airDefensesRef.current = nextPvos;
          callbacksRef.current.onAirDefensesDamaged(pvoUpdates);
        }

        if (destroyedLaunchers.length > 0 || destroyedPvos.length > 0) {
          totalDestroyedByStrikesRef.current += destroyedLaunchers.length + destroyedPvos.length;
          callbacksRef.current.onUnitsDestroyed(destroyedLaunchers, destroyedPvos);

          for (const lid of destroyedLaunchers) {
            const dl = launchersRef.current.find((l) => l.id === lid);
            if (dl) {
              const sec = createExplosionParticles(0.75);
              explosionsRef.current.push({
                id: `cook_${lid}_${Date.now()}`,
                lat: dl.lat,
                lng: dl.lng,
                munitionId,
                age: 0,
                duration: 2.4,
                power: 0.75,
                ...sec,
              });
            }
          }
        }

        // Strict target isolation: PVO-targeted strikes NEVER damage nearby buildings; building-targeted hits ONLY that building; untargeted hits use tight radius
        const hitBuildings = targetPvoId
          ? []
          : targetBuildingId
            ? buildingsRef.current.filter(
                (b) =>
                  b.id === targetBuildingId &&
                  haversineDistanceKm(lat, lng, b.lat, b.lng) <= Math.max(4, effectiveBlastKm),
              )
            : buildingsRef.current.filter(
                (b) => haversineDistanceKm(lat, lng, b.lat, b.lng) <= tightSplashKm,
              );

        const buildingUpdates: Array<{ id: string; hp: number }> = [];
        const damagedBuildingLabels: string[] = [];
        const destroyedBuildings: PlacedBuilding[] = [];

        if (hitBuildings.length > 0) {
          const hitSet = new Set(hitBuildings.map((b) => b.id));
          const nextBuildings: PlacedBuilding[] = [];
          for (const b of buildingsRef.current) {
            if (!hitSet.has(b.id)) {
              nextBuildings.push(b);
              continue;
            }
            const bSpec = BUILDING_BY_ID[b.buildingId];
            const nextHp = Math.max(0, Math.round(b.hp - expSpec.damage));
            buildingUpdates.push({ id: b.id, hp: nextHp });
            if (nextHp <= 0) {
              destroyedBuildings.push(b);
              if (bSpec.secondaryBlastPower > 0) {
                const sec = createExplosionParticles(bSpec.secondaryBlastPower);
                explosionsRef.current.push({
                  id: `bldg_exp_${b.id}_${Date.now()}`,
                  lat: b.lat,
                  lng: b.lng,
                  munitionId,
                  age: 0,
                  duration: 2.6 + bSpec.secondaryBlastPower * 0.9,
                  power: bSpec.secondaryBlastPower,
                  ...sec,
                });
                totalExplosionsRef.current += 1;
                window.setTimeout(() => {
                  soundFx.playExplosion(bSpec.secondaryBlastPower, false);
                }, 140);
              }
            } else {
              nextBuildings.push({ ...b, hp: nextHp });
              damagedBuildingLabels.push(`${bSpec.shortName} (${nextHp}/${b.maxHp} HP)`);
            }
          }
          buildingsRef.current = nextBuildings;
          callbacksRef.current.onBuildingsDamaged(buildingUpdates);
        }

        const impactLoc = formatLocationLabel(lat, lng);
        const detailParts = [impactLoc];
        if (destroyedLaunchers.length > 0) {
          detailParts.push(`уничтожено ПУ: ${destroyedLaunchers.length}`);
        }
        if (destroyedPvoLabels.length > 0) {
          detailParts.push(`уничтожено ППО: ${destroyedPvoLabels.join(', ')}`);
        }
        if (damagedPvoLabels.length > 0) {
          detailParts.push(`попадание в ППО: ${damagedPvoLabels.join(', ')}`);
        }
        if (destroyedBuildings.length > 0) {
          const bNames = destroyedBuildings.map((b) => BUILDING_BY_ID[b.buildingId].shortName);
          detailParts.push(
            destroyedBuildings.length === 1
              ? `уничтожен объект: ${bNames[0]}`
              : `уничтожены объекты: ${bNames.join(', ')}`,
          );
        }
        if (damagedBuildingLabels.length > 0) {
          detailParts.push(`урон -${expSpec.damage}: ${damagedBuildingLabels.join(', ')}`);
        }
        callbacksRef.current.onTacticalEvent({
          kind: 'impact',
          munitionId,
          detail: detailParts.join(' · '),
        });

        const expRaion = getRaionAt(lat, lng);
        if (expRaion && getTelegramChannelByOblast(expRaion.oblast)) {
          const nearInfo = findNearestSettlementInfo(lat, lng);
          const nearCity = nearInfo.distKm <= 48 ? nearInfo.fullLabel : undefined;
          callbacksRef.current.onTelegramIntel({
            flightId: expId,
            oblast: expRaion.oblast,
            raionName: expRaion.name,
            munitionId,
            nearCity,
            altitudeMode: 'normal',
            eventKind: 'explosion',
          });
        }

        totalExplosionsRef.current += 1;
        soundFx.playExplosion(
          power,
          expSpec.profile === 'prop-drone' || expSpec.profile === 'jet-drone',
        );
        statsDirty = true;
      };

      // A0. Process staggered multi-target salvo launches along plotted routes or from carrier aircraft
      if (scheduledSalvoRef.current.length > 0) {
        const nextQueue: ScheduledRouteSalvo[] = [];
        for (const q of scheduledSalvoRef.current) {
          q.delayRemainingSec -= dt * timeScaleRef.current;
          if (q.delayRemainingSec <= 0) {
            const spec = MUNITION_BY_ID[q.munitionId];
            const qAltMode: AltitudeMode =
              q.altitudeMode ?? (q.lowAltitude ? 'low' : 'normal');
            if ((q.isAirLaunched || q.isAiStrike) && q.startPoint) {
              const aiLauncher = q.isAiStrike
                ? launchersRef.current.find((l) => l.id === q.launcherId)
                : undefined;
              const startPt = aiLauncher ? { lat: aiLauncher.lat, lng: aiLauncher.lng } : q.startPoint;
              const launchWaypoints = aiLauncher
                ? buildSmoothRoute([startPt, ...q.waypoints.slice(1)])
                : q.waypoints;
              flightsRef.current.push({
                id: `flt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                launcherId: q.launcherId,
                munitionId: q.munitionId,
                targetBuildingId: q.targetBuildingId,
                targetPvoId: q.targetPvoId,
                lowAltitude: qAltMode !== 'normal',
                altitudeMode: qAltMode,
                climbAtProgress: q.climbAtProgress,
                postClimbAltitudeMode: q.postClimbAltitudeMode,
                isAiStrike: Boolean(q.isAiStrike),
                waypoints: launchWaypoints,
                rawWaypoints: q.rawWaypoints,
                segmentIndex: 0,
                segmentProgress: 0,
                lat: startPt.lat,
                lng: startPt.lng,
                bearingDeg: q.bearingDeg,
                visualHeadingDeg: q.bearingDeg,
                totalDistanceKm: q.totalDistanceKm,
                coveredKm: 0,
                ageSec: 0,
                trail: [{ lat: startPt.lat, lng: startPt.lng }],
              });
              totalLaunchesRef.current += 1;
              forceAlertUpdateRef.current = true;
              if (qAltMode === 'normal') {
                soundFx.playLaunch(spec.profile);
              }
              if (aiLauncher) {
                callbacksRef.current.onLaunchStarted(aiLauncher.id, q.bearingDeg);
              }
              statsDirty = true;
            } else {
              const launcher = launchersRef.current.find((l) => l.id === q.launcherId);
              if (!launcher || launcher.ammo <= 0) continue;
              flightsRef.current.push({
                id: `flt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                launcherId: launcher.id,
                munitionId: q.munitionId,
                targetBuildingId: q.targetBuildingId,
                targetPvoId: q.targetPvoId,
                lowAltitude: qAltMode !== 'normal',
                altitudeMode: qAltMode,
                waypoints: q.waypoints,
                rawWaypoints: q.rawWaypoints,
                segmentIndex: 0,
                segmentProgress: 0,
                lat: launcher.lat,
                lng: launcher.lng,
                bearingDeg: q.bearingDeg,
                visualHeadingDeg: q.bearingDeg,
                totalDistanceKm: q.totalDistanceKm,
                coveredKm: 0,
                ageSec: 0,
                trail: [{ lat: launcher.lat, lng: launcher.lng }],
                kabTargetPoint: q.kabTargetPoint,
                kabTargetBuildingId: q.kabTargetBuildingId,
                kabTargetPvoId: q.kabTargetPvoId,
                returnWaypoints: q.returnWaypoints,
                ...(spec.profile === 'airstrike' && spec.id !== 'su57-kab'
                  ? {
                      bombDropThresholds: [0.18, 0.33, 0.48, 0.63, 0.78, 0.93],
                      bombsDroppedCount: 0,
                    }
                  : {}),
              });
              totalLaunchesRef.current += 1;
              forceAlertUpdateRef.current = true;
              soundFx.playLaunch(spec.profile);
              callbacksRef.current.onLaunchStarted(launcher.id, q.bearingDeg);
              statsDirty = true;
            }
          } else {
            nextQueue.push(q);
          }
        }
        scheduledSalvoRef.current = nextQueue;
      }

      const resolveStrikeBlastPower = (munitionId: MunitionId): number => {
        if (munitionId === 'kinzhal') return 1.75;
        if (munitionId === 'iskander' || munitionId === 'sapsan' || munitionId === 'kh22') return 1.55;
        if (munitionId === 'flamingo') return 1.45;
        if (munitionId === 'kh101' || munitionId === 'kalibr' || munitionId === 'kh69') return 1.25;
        if (munitionId === 'neptune' || munitionId === 'peklo' || munitionId === 'palyanytsya') return 1.15;
        return 0.92;
      };

      const resolveTransitOblast = (
        flt: ActiveFlight,
        currentOblast: string,
      ): string | undefined => {
        const segEnd = flt.waypoints[flt.segmentIndex + 1];
        const segRemKm =
          !flt.manualSteering && segEnd
            ? haversineDistanceKm(flt.lat, flt.lng, segEnd.lat, segEnd.lng)
            : 130;
        const hasMoreSegments =
          !flt.manualSteering && flt.segmentIndex + 2 < flt.waypoints.length;
        const maxProbeKm = flt.manualSteering
          ? 125
          : Math.min(130, segRemKm + (hasMoreSegments ? 8 : 2));

        const normCur =
          currentOblast === 'м. Київ'
            ? 'Київська область'
            : currentOblast === 'м. Севастополь'
              ? 'АР Крим'
              : currentOblast;

        for (const dKm of [18, 36, 56, 80, 108, 128]) {
          if (dKm > maxProbeKm) break;
          const probe = computePointAheadKm(flt.lat, flt.lng, flt.bearingDeg, dKm);
          const probeRaion = getRaionAt(probe.lat, probe.lng);
          if (!probeRaion) continue;
          const probeOblast =
            probeRaion.oblast === 'м. Київ'
              ? 'Київська область'
              : probeRaion.oblast === 'м. Севастополь'
                ? 'АР Крим'
                : probeRaion.oblast;
          if (probeOblast !== normCur && getTelegramChannelByOblast(probeRaion.oblast)) {
            return probeOblast;
          }
        }
        return undefined;
      };

      const resolveApproachingTargetCity = (
        flt: ActiveFlight,
        currentOblast: string,
      ): string | undefined => {
        if (
          flt.manualSteering ||
          flt.isReturnToBase ||
          flt.carrierAircraftId ||
          flt.waypoints.length < 2
        ) {
          return undefined;
        }
        // On a plotted multi-waypoint route, only announce destination city once on the final leg
        if (flt.segmentIndex < flt.waypoints.length - 2) return undefined;
        if (flt.ageSec < 1.4) return undefined;

        const finalDest = flt.waypoints[flt.waypoints.length - 1];
        const normOblast = (o: string) =>
          o === 'м. Київ'
            ? 'Київська область'
            : o === 'м. Севастополь'
              ? 'АР Крим'
              : o;
        const finalRaion = getRaionAt(finalDest.lat, finalDest.lng);
        if (finalRaion && normOblast(finalRaion.oblast) !== normOblast(currentOblast)) {
          return undefined;
        }

        const distToFinalKm = haversineDistanceKm(flt.lat, flt.lng, finalDest.lat, finalDest.lng);
        const speed = MUNITION_BY_ID[flt.munitionId].simSpeedKmPerSec;
        const approachRadiusKm = speed >= 40 ? 95 : 68;
        if (distToFinalKm > approachRadiusKm) return undefined;
        const finalNear = findNearestSettlementInfo(finalDest.lat, finalDest.lng);
        if (finalNear.distKm > 28) return undefined;
        return finalNear.fullLabel;
      };

      const emitTelegramForOblast = (
        flt: ActiveFlight,
        oblast: string,
        raionName: string,
        eventKind: TelegramIntelEventKind,
        forceImmediate = false,
      ) => {
        if (!getTelegramChannelByOblast(oblast)) return;
        const isAltitudeEvent =
          eventKind === 'climbed' ||
          eventKind === 'dropped' ||
          eventKind === 'dropped_radar_lost';

        const altMode = getFlightAltitudeMode(flt);
        const nearInfo = findNearestSettlementInfo(flt.lat, flt.lng);
        const nearCity = nearInfo.distKm <= 42 ? nearInfo.fullLabel : undefined;
        const targetCity = resolveApproachingTargetCity(flt, oblast);
        const transitOblast = resolveTransitOblast(flt, oblast);
        const urgentFinalApproach = Boolean(
          targetCity &&
            !flt.lastTelegramTargetCity &&
            flt.totalDistanceKm - flt.coveredKm <= 30,
        );

        // Wait 2.3s after launch or while a direction-change delay is pending before reporting target course
        if (!forceImmediate && !isAltitudeEvent && !urgentFinalApproach) {
          if (flt.pendingCourseReportAtSec !== undefined) return;
          if (flt.ageSec < 2.3 && flt.totalDistanceKm > 35) return;
        }

        const firstInOblast = !flt.reportedOblasts?.[oblast];
        const secSinceLast =
          flt.lastTelegramAtSec !== undefined ? flt.ageSec - flt.lastTelegramAtSec : Infinity;
        const raionChanged = flt.lastTelegramRaion !== undefined && flt.lastTelegramRaion !== raionName;
        const transitChanged =
          flt.lastTelegramTransitOblast !== transitOblast && flt.lastTelegramAtSec !== undefined;
        const targetCityChanged = Boolean(targetCity && flt.lastTelegramTargetCity !== targetCity);

        if (isAltitudeEvent) {
          // Altitude updates always report promptly
        } else if (forceImmediate) {
          if (secSinceLast < 1.1 && !firstInOblast) return;
        } else if (firstInOblast) {
          // Emit upon entering a new oblast once initial stabilization passes
        } else if (targetCityChanged) {
          if (secSinceLast < 1.1) return;
        } else if (raionChanged || transitChanged) {
          if (secSinceLast < 2.4) return;
        } else {
          if (secSinceLast < 4.5) return;
        }

        flt.reportedOblasts = { ...(flt.reportedOblasts ?? {}), [oblast]: true };
        flt.lastTelegramAtSec = flt.ageSec;
        flt.lastTelegramRaion = raionName;
        flt.lastTelegramTransitOblast = transitOblast;
        flt.lastTelegramTargetCity = targetCity;
        flt.lastSteadyHeadingDeg = flt.bearingDeg;

        callbacksRef.current.onTelegramIntel({
          oblast,
          raionName,
          munitionId: flt.munitionId,
          carrierAircraftId: flt.carrierAircraftId,
          targetCity,
          nearCity,
          transitOblast,
          altitudeMode: altMode,
          eventKind: firstInOblast && eventKind === 'tracking' ? 'entered' : eventKind,
          bearingDeg: flt.bearingDeg,
          flightId: flt.id,
        });
      };

      // A. Update active Shahed, missile, carrier aircraft & airstrike flights along paths (plus A/D manual steering)
      const nextFlights: ActiveFlight[] = [];
      for (const flt of flightsRef.current) {
        const spec = MUNITION_BY_ID[flt.munitionId];
        const carrierSpec = flt.carrierAircraftId
          ? RUSSIAN_AIRCRAFT_BY_ID[flt.carrierAircraftId]
          : null;
        const speedKmPerSec = carrierSpec ? carrierSpec.simSpeedKmPerSec : spec.simSpeedKmPerSec;

        if (pendingDetonateFlightIdRef.current === flt.id) {
          pendingDetonateFlightIdRef.current = null;
          if (selectedFlightRef.current === flt.id) {
            if (followCamFlightIdRef.current === flt.id) {
              followCamFlightIdRef.current = null;
              callbacksRef.current.onFollowCamChange(false);
            }
            callbacksRef.current.onSelectFlight(null);
          }
          triggerExplosionAt(
            flt.lat,
            flt.lng,
            flt.munitionId,
            resolveStrikeBlastPower(flt.munitionId),
            `exp_${flt.id}`,
            flt.targetBuildingId,
            flt.targetPvoId,
          );
          continue;
        }

        flt.ageSec += dt;
        if (flt.lastSteadyHeadingDeg === undefined) {
          flt.lastSteadyHeadingDeg = flt.bearingDeg;
        }
        const canManualSteer =
          selectedFlightRef.current === flt.id && isManuallySteerableFlight(flt);
        const steerDir = canManualSteer
          ? (keysHeldRef.current.d ? 1 : 0) - (keysHeldRef.current.a ? 1 : 0)
          : 0;
        if (steerDir !== 0) {
          flt.manualSteering = true;
          flt.targetBuildingId = undefined;
          flt.targetPvoId = undefined;
          flt.midFlightRedirectDone = true;
          const turnRateDeg = isShahedMunition(flt.munitionId) ? 105 : 120;
          flt.bearingDeg =
            (flt.bearingDeg + steerDir * turnRateDeg * timeScaleRef.current * dt + 360) % 360;
          flt.pendingCourseReportAtSec = flt.ageSec + 2.4;
        }

        let finished = false;
        if (flt.manualSteering) {
          const stepKm = speedKmPerSec * timeScaleRef.current * dt;
          let nextPt = computePointAheadKm(flt.lat, flt.lng, flt.bearingDeg, stepKm);
          if (getTerritoryAt(nextPt.lat, nextPt.lng) === null) {
            flt.bearingDeg = (flt.bearingDeg + 145) % 360;
            nextPt = computePointAheadKm(flt.lat, flt.lng, flt.bearingDeg, stepKm);
          }
          flt.lat = nextPt.lat;
          flt.lng = nextPt.lng;
          flt.coveredKm += stepKm;
          const lookAhead = computePointAheadKm(flt.lat, flt.lng, flt.bearingDeg, 60);
          flt.waypoints = [{ lat: flt.lat, lng: flt.lng }, lookAhead];
          flt.rawWaypoints = flt.waypoints;
          flt.segmentIndex = 0;
          flt.segmentProgress = 0;
          flt.totalDistanceKm = 60;
          flt.visualHeadingDeg = slewAngleDeg(
            flt.visualHeadingDeg,
            flt.bearingDeg,
            560 * timeScaleRef.current * dt,
          );

          for (const b of buildingsRef.current) {
            if (haversineDistanceKm(flt.lat, flt.lng, b.lat, b.lng) <= 2.6) {
              flt.targetBuildingId = b.id;
              finished = true;
              break;
            }
          }
          if (!finished) {
            for (const p of airDefensesRef.current) {
              if (AIR_DEFENSE_BY_ID[p.airDefenseId].isRadar) continue;
              const m = mobilePvoStateRef.current[p.id];
              const pLat = m ? m.lat : p.lat;
              const pLng = m ? m.lng : p.lng;
              if (haversineDistanceKm(flt.lat, flt.lng, pLat, pLng) <= 2.6) {
                flt.targetPvoId = p.id;
                finished = true;
                break;
              }
            }
          }
        } else {
          let remainingStepKm = speedKmPerSec * timeScaleRef.current * dt;

          while (remainingStepKm > 0 && !finished) {
            const a = flt.waypoints[flt.segmentIndex];
            const b = flt.waypoints[flt.segmentIndex + 1];
            if (!a || !b) {
              finished = true;
              break;
            }
            const segKm = Math.max(1, haversineDistanceKm(a.lat, a.lng, b.lat, b.lng));
            const progressStep = remainingStepKm / segKm;

            if (flt.segmentProgress + progressStep >= 1) {
              const consumedKm = (1 - flt.segmentProgress) * segKm;
              remainingStepKm -= consumedKm;
              flt.coveredKm += consumedKm;

              if (flt.segmentIndex + 2 < flt.waypoints.length) {
                flt.segmentIndex += 1;
                flt.segmentProgress = 0;
                const nextA = flt.waypoints[flt.segmentIndex];
                const nextB = flt.waypoints[flt.segmentIndex + 1];
                flt.bearingDeg = computeBearingDeg(nextA.lat, nextA.lng, nextB.lat, nextB.lng);
                flt.trail.push({ lat: nextA.lat, lng: nextA.lng });
                if (flt.trail.length > 64) flt.trail.shift();
              } else {
                flt.segmentProgress = 1;
                finished = true;
              }
            } else {
              flt.segmentProgress += progressStep;
              flt.coveredKm += remainingStepKm;
              remainingStepKm = 0;
              flt.bearingDeg = computeBearingDeg(a.lat, a.lng, b.lat, b.lng);
            }
          }

          const pos = getFlightCurrentPosition(flt);
          flt.lat = pos.lat;
          flt.lng = pos.lng;

          // Crisp tactical turn onto the new segment bearing
          const turnRateDegPerSec = 980 * timeScaleRef.current;
          flt.visualHeadingDeg = slewAngleDeg(
            flt.visualHeadingDeg,
            flt.bearingDeg,
            turnRateDegPerSec * dt,
          );
        }

        // When carrier aircraft (MiG-31K, Tu-95MS, Tu-22M3, Tu-160, Su-57) reaches Step 1 launch point,
        // fire its onboard missile salvo toward the Step 2 target & return to its home airfield
        if (
          finished &&
          flt.carrierAircraftId &&
          !flt.kabReleaseDone &&
          !flt.isReturnToBase
        ) {
          flt.kabReleaseDone = true;
          flt.isReturnToBase = true;

          const carrier = RUSSIAN_AIRCRAFT_BY_ID[flt.carrierAircraftId];
          const missileId = flt.carrierMissileId ?? carrier.missileId;
          const missileSpec = MUNITION_BY_ID[missileId];
          const salvoCount = Math.max(1, flt.carrierMissileCount ?? carrier.missileCount);
          const missileTarget = flt.kabTargetPoint;

          if (missileTarget) {
            const missileWaypoints: RoutePoint[] =
              flt.carrierMissileWaypoints && flt.carrierMissileWaypoints.length >= 2
                ? [{ lat: flt.lat, lng: flt.lng }, ...flt.carrierMissileWaypoints.slice(1)]
                : [{ lat: flt.lat, lng: flt.lng }, missileTarget];
            const missileDistKm = Math.max(1, computeRouteLengthKm(missileWaypoints));
            const missileBearing = computeBearingDeg(
              missileWaypoints[0].lat,
              missileWaypoints[0].lng,
              missileWaypoints[1].lat,
              missileWaypoints[1].lng,
            );

            flightsRef.current.push({
              id: `flt_airm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              launcherId: flt.launcherId,
              munitionId: missileId,
              targetBuildingId: flt.kabTargetBuildingId,
              targetPvoId: flt.kabTargetPvoId,
              isAiStrike: flt.isAiStrike,
              waypoints: missileWaypoints,
              rawWaypoints: missileWaypoints,
              segmentIndex: 0,
              segmentProgress: 0,
              lat: flt.lat,
              lng: flt.lng,
              bearingDeg: missileBearing,
              visualHeadingDeg: missileBearing,
              totalDistanceKm: missileDistKm,
              coveredKm: 0,
              ageSec: 0,
              trail: [{ lat: flt.lat, lng: flt.lng }],
            });
            totalLaunchesRef.current += 1;

            for (let i = 1; i < salvoCount; i++) {
              scheduledSalvoRef.current.push({
                launcherId: flt.launcherId,
                munitionId: missileId,
                targetBuildingId: flt.kabTargetBuildingId,
                targetPvoId: flt.kabTargetPvoId,
                startPoint: { lat: flt.lat, lng: flt.lng },
                isAirLaunched: true,
                isAiStrike: flt.isAiStrike,
                waypoints: missileWaypoints,
                rawWaypoints: missileWaypoints,
                totalDistanceKm: missileDistKm,
                bearingDeg: missileBearing,
                delayRemainingSec: i * 0.35,
              });
            }

            forceAlertUpdateRef.current = true;
            soundFx.playLaunch(missileSpec.profile);
            const finalWp = missileWaypoints[missileWaypoints.length - 1];
            callbacksRef.current.onTacticalEvent({
              kind: 'launch',
              munitionId: missileId,
              detail: `Пуск с ${carrier.shortName}: ${salvoCount}× ${missileSpec.shortName} (${Math.round(missileDistKm)} км → ${formatLocationLabel(finalWp.lat, finalWp.lng)})`,
            });
          }

          const homeAirfield = airfieldsRef.current.find((a) => a.id === flt.airfieldId);
          const returnPath =
            flt.returnWaypoints && flt.returnWaypoints.length >= 2
              ? flt.returnWaypoints
              : homeAirfield
                ? [
                    { lat: flt.lat, lng: flt.lng },
                    { lat: homeAirfield.lat, lng: homeAirfield.lng },
                  ]
                : null;

          if (returnPath && returnPath.length >= 2) {
            flt.waypoints = returnPath;
            flt.rawWaypoints = returnPath;
            flt.segmentIndex = 0;
            flt.segmentProgress = 0;
            flt.bearingDeg = computeBearingDeg(
              returnPath[0].lat,
              returnPath[0].lng,
              returnPath[1].lat,
              returnPath[1].lng,
            );
            flt.totalDistanceKm = Math.max(1, computeRouteLengthKm(returnPath));
            flt.coveredKm = 0;
            flt.kabTargetPoint = undefined;
            flt.kabTargetBuildingId = undefined;
            flt.kabTargetPvoId = undefined;
            finished = false;
            statsDirty = true;
          }
        }

        // When Su-57 reaches its placed drop point, launch КАБ to the chosen target & return to launcher
        if (
          finished &&
          flt.munitionId === 'su57-kab' &&
          !flt.kabReleaseDone &&
          !flt.isReturnToBase
        ) {
          flt.kabReleaseDone = true;
          flt.isReturnToBase = true;

          const kabTarget = flt.kabTargetPoint;
          if (kabTarget) {
            const kabDistKm = Math.max(
              1,
              haversineDistanceKm(flt.lat, flt.lng, kabTarget.lat, kabTarget.lng),
            );
            const kabBearing = computeBearingDeg(flt.lat, flt.lng, kabTarget.lat, kabTarget.lng);
            const kabWaypoints: RoutePoint[] = [{ lat: flt.lat, lng: flt.lng }, kabTarget];

            flightsRef.current.push({
              id: `flt_kab_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              launcherId: flt.launcherId,
              munitionId: 'kab',
              targetBuildingId: flt.kabTargetBuildingId,
              targetPvoId: flt.kabTargetPvoId,
              waypoints: kabWaypoints,
              rawWaypoints: kabWaypoints,
              segmentIndex: 0,
              segmentProgress: 0,
              lat: flt.lat,
              lng: flt.lng,
              bearingDeg: kabBearing,
              visualHeadingDeg: kabBearing,
              totalDistanceKm: kabDistKm,
              coveredKm: 0,
              ageSec: 0,
              trail: [{ lat: flt.lat, lng: flt.lng }],
            });
            totalLaunchesRef.current += 1;
            forceAlertUpdateRef.current = true;
            soundFx.playLaunch('kab');
            callbacksRef.current.onTacticalEvent({
              kind: 'launch',
              munitionId: 'kab',
              detail: `Сброс с Су-57 (${Math.round(kabDistKm)} км → ${formatLocationLabel(kabTarget.lat, kabTarget.lng)})`,
            });
          }

          const homeLauncher = launchersRef.current.find((l) => l.id === flt.launcherId);
          const returnPath =
            flt.returnWaypoints && flt.returnWaypoints.length >= 2
              ? flt.returnWaypoints
              : homeLauncher
                ? [
                    { lat: flt.lat, lng: flt.lng },
                    { lat: homeLauncher.lat, lng: homeLauncher.lng },
                  ]
                : null;

          if (returnPath && returnPath.length >= 2) {
            flt.waypoints = returnPath;
            flt.rawWaypoints = returnPath;
            flt.segmentIndex = 0;
            flt.segmentProgress = 0;
            flt.bearingDeg = computeBearingDeg(
              returnPath[0].lat,
              returnPath[0].lng,
              returnPath[1].lat,
              returnPath[1].lng,
            );
            flt.totalDistanceKm = Math.max(1, computeRouteLengthKm(returnPath));
            flt.coveredKm = 0;
            flt.kabTargetPoint = undefined;
            flt.kabTargetBuildingId = undefined;
            flt.kabTargetPvoId = undefined;
            finished = false;
            statsDirty = true;
          }
        }

        // Airstrike drops a stick of aerial bombs along its route
        if (flt.bombDropThresholds && flt.bombsDroppedCount !== undefined) {
          const totalProg = Math.min(1, flt.coveredKm / Math.max(1, flt.totalDistanceKm));
          while (
            flt.bombsDroppedCount < flt.bombDropThresholds.length &&
            totalProg >= flt.bombDropThresholds[flt.bombsDroppedCount]
          ) {
            fallingBombsRef.current.push({
              id: `bomb_${flt.id}_${flt.bombsDroppedCount}`,
              lat: flt.lat,
              lng: flt.lng,
              headingDeg: flt.visualHeadingDeg,
              age: 0,
              fallDuration: 0.38,
              munitionId: flt.munitionId,
              targetBuildingId: flt.targetBuildingId,
              targetPvoId: flt.targetPvoId,
            });
            flt.bombsDroppedCount += 1;
            soundFx.playBombDrop();
          }
        }

        if (recordTrail) {
          flt.trail.push({ lat: flt.lat, lng: flt.lng });
          if (flt.trail.length > 64) flt.trail.shift();
        }

        // Dynamic AI mid-flight course changes:
        // 1) Reroute if assigned target was already destroyed
        // 2) ~45% of Shaheds and cruise missiles execute mid-flight tactical evasion / target shift
        if (!finished && flt.isAiStrike && !flt.isReturnToBase && !flt.carrierAircraftId) {
          const bTargetGone =
            Boolean(flt.targetBuildingId) &&
            !buildingsRef.current.some((b) => b.id === flt.targetBuildingId);
          const pTargetGone =
            Boolean(flt.targetPvoId) &&
            !airDefensesRef.current.some((p) => p.id === flt.targetPvoId);

          if ((bTargetGone || pTargetGone) && buildingsRef.current.length > 0) {
            const sorted = buildingsRef.current
              .slice()
              .sort(
                (a, b) =>
                  haversineDistanceKm(flt.lat, flt.lng, a.lat, a.lng) -
                  haversineDistanceKm(flt.lat, flt.lng, b.lat, b.lng),
              );
            const newTgt = sorted[Math.floor(Math.random() * Math.min(3, sorted.length))];
            const newWps = buildDynamicAiRedirectWaypoints(
              flt.lat,
              flt.lng,
              newTgt.lat,
              newTgt.lng,
              false,
            );
            if (newWps && newWps.length >= 2) {
              flt.waypoints = newWps;
              flt.rawWaypoints = newWps;
              flt.segmentIndex = 0;
              flt.segmentProgress = 0;
              flt.coveredKm = 0;
              flt.totalDistanceKm = Math.max(1, computeRouteLengthKm(newWps));
              flt.bearingDeg = computeBearingDeg(newWps[0].lat, newWps[0].lng, newWps[1].lat, newWps[1].lng);
              flt.targetBuildingId = newTgt.id;
              flt.targetPvoId = undefined;
              flt.midFlightRedirectDone = true;
              forceAlertUpdateRef.current = true;
            }
          } else if (
            !flt.midFlightRedirectDone &&
            flt.totalDistanceKm > 65 &&
            flt.coveredKm / Math.max(1, flt.totalDistanceKm) >= 0.44
          ) {
            flt.midFlightRedirectDone = true;
            if (
              ['shahed-136', 'shahed-238', 'kalibr', 'kh101', 'kh69'].includes(flt.munitionId) &&
              Math.random() < 0.45
            ) {
              const altBuildings = buildingsRef.current.filter(
                (b) =>
                  b.id !== flt.targetBuildingId &&
                  haversineDistanceKm(flt.lat, flt.lng, b.lat, b.lng) <= 420,
              );
              if (altBuildings.length > 0 && Math.random() < 0.55) {
                const altTgt = altBuildings[Math.floor(Math.random() * altBuildings.length)];
                const newWps = buildDynamicAiRedirectWaypoints(
                  flt.lat,
                  flt.lng,
                  altTgt.lat,
                  altTgt.lng,
                  true,
                );
                if (newWps && newWps.length >= 2) {
                  flt.waypoints = newWps;
                  flt.rawWaypoints = newWps;
                  flt.segmentIndex = 0;
                  flt.segmentProgress = 0;
                  flt.coveredKm = 0;
                  flt.totalDistanceKm = Math.max(1, computeRouteLengthKm(newWps));
                  flt.bearingDeg = computeBearingDeg(
                    newWps[0].lat,
                    newWps[0].lng,
                    newWps[1].lat,
                    newWps[1].lng,
                  );
                  flt.targetBuildingId = altTgt.id;
                  flt.targetPvoId = undefined;
                  flt.pendingCourseReportAtSec = flt.ageSec + 2.45;
                  forceAlertUpdateRef.current = true;
                }
              } else {
                const curDest = flt.waypoints[flt.waypoints.length - 1];
                const newWps = buildDynamicAiRedirectWaypoints(
                  flt.lat,
                  flt.lng,
                  curDest.lat,
                  curDest.lng,
                  true,
                );
                if (newWps && newWps.length >= 2) {
                  flt.waypoints = newWps;
                  flt.rawWaypoints = newWps;
                  flt.segmentIndex = 0;
                  flt.segmentProgress = 0;
                  flt.coveredKm = 0;
                  flt.totalDistanceKm = Math.max(1, computeRouteLengthKm(newWps));
                  flt.bearingDeg = computeBearingDeg(
                    newWps[0].lat,
                    newWps[0].lng,
                    newWps[1].lat,
                    newWps[1].lng,
                  );
                  flt.pendingCourseReportAtSec = flt.ageSec + 2.45;
                }
              }
            }
          }
        }

        // Autonomous AI Shahed altitude climb: starts ultra-low (invisible to radars), then climbs & appears on radars
        if (
          !finished &&
          flt.climbAtProgress !== undefined &&
          !flt.isReturnToBase &&
          flt.coveredKm / Math.max(1, flt.totalDistanceKm) >= flt.climbAtProgress
        ) {
          const nextAlt: AltitudeMode = flt.postClimbAltitudeMode ?? 'normal';
          flt.climbAtProgress = undefined;
          flt.postClimbAltitudeMode = undefined;
          if (nextAlt !== getFlightAltitudeMode(flt)) {
            flt.altitudeMode = nextAlt;
            flt.lowAltitude = nextAlt !== 'normal';
            flt.pendingTelegramEvent = 'climbed';
            forceAlertUpdateRef.current = true;
            if (selectedFlightRef.current === flt.id) {
              callbacksRef.current.onSelectFlight({
                id: flt.id,
                munitionId: flt.munitionId,
                carrierAircraftId: flt.carrierAircraftId,
                isAiStrike: flt.isAiStrike,
                lowAltitude: flt.lowAltitude,
                altitudeMode: nextAlt,
                remainingKm: Math.max(0, Math.round(flt.totalDistanceKm - flt.coveredKm)),
              });
            }
          }
        }

        // Detect sharp waypoint/heading transitions so Telegram delays reporting new direction by ~2.4s
        if (
          !finished &&
          !flt.isReturnToBase &&
          steerDir === 0 &&
          flt.pendingCourseReportAtSec === undefined &&
          flt.lastSteadyHeadingDeg !== undefined &&
          flt.lastTelegramAtSec !== undefined &&
          Math.abs(normalizeAngleDeltaDeg(flt.bearingDeg - flt.lastSteadyHeadingDeg)) >= 18
        ) {
          flt.pendingCourseReportAtSec = flt.ageSec + 2.4;
        }

        // Telegram oblast monitoring channels (2-3s delay after course changes; immediate on altitude shifts)
        if (!finished && !flt.isReturnToBase) {
          let pendingEv = flt.pendingTelegramEvent;
          flt.pendingTelegramEvent = undefined;
          let forceImmediate = Boolean(pendingEv);

          if (
            !pendingEv &&
            flt.pendingCourseReportAtSec !== undefined &&
            flt.ageSec >= flt.pendingCourseReportAtSec &&
            steerDir === 0
          ) {
            flt.pendingCourseReportAtSec = undefined;
            flt.lastSteadyHeadingDeg = flt.bearingDeg;
            pendingEv = 'redirect';
            forceImmediate = true;
          }

          const curRaion = getRaionAt(flt.lat, flt.lng);
          if (curRaion) {
            emitTelegramForOblast(
              flt,
              curRaion.oblast,
              curRaion.name,
              pendingEv ?? 'tracking',
              forceImmediate,
            );
          }
        }

        if (finished) {
          if (selectedFlightRef.current === flt.id) {
            if (followCamFlightIdRef.current === flt.id) {
              followCamFlightIdRef.current = null;
              callbacksRef.current.onFollowCamChange(false);
            }
            callbacksRef.current.onSelectFlight(null);
          }
          if (spec.profile === 'airstrike' || flt.isReturnToBase) {
            // Single flyby or aircraft return-to-base landing completes cleanly
            statsDirty = true;
          } else {
            const finalPt = flt.manualSteering
              ? { lat: flt.lat, lng: flt.lng }
              : flt.waypoints[flt.waypoints.length - 1];
            const power = resolveStrikeBlastPower(flt.munitionId);
            triggerExplosionAt(
              finalPt.lat,
              finalPt.lng,
              flt.munitionId,
              power,
              `exp_${flt.id}`,
              flt.targetBuildingId,
              flt.targetPvoId,
            );
          }
        } else {
          nextFlights.push(flt);
        }
      }
      flightsRef.current = nextFlights;

      // Follow-cam keeping the selected Shahed centered in the middle of the screen
      if (followCamFlightIdRef.current) {
        const followFlt = flightsRef.current.find((f) => f.id === followCamFlightIdRef.current);
        if (!followFlt || followFlt.isReturnToBase) {
          followCamFlightIdRef.current = null;
          callbacksRef.current.onFollowCamChange(false);
        } else {
          const curZoom = map.getZoom();
          map.setView([followFlt.lat, followFlt.lng], curZoom, { animate: false });
        }
      }

      // A2. Update falling aerial bombs & trigger chain of ground explosions
      const nextBombs: FallingBomb[] = [];
      for (const bomb of fallingBombsRef.current) {
        bomb.age += dt;
        const headRad = (bomb.headingDeg * Math.PI) / 180;
        const driftKm = 5.5 * timeScaleRef.current * dt;
        const dLat = (Math.cos(headRad) * driftKm) / 111.32;
        const dLng =
          (Math.sin(headRad) * driftKm) /
          (111.32 * Math.max(0.2, Math.cos((bomb.lat * Math.PI) / 180)));
        bomb.lat += dLat;
        bomb.lng += dLng;

        if (bomb.age >= bomb.fallDuration) {
          triggerExplosionAt(
            bomb.lat,
            bomb.lng,
            bomb.munitionId,
            1.05,
            `exp_${bomb.id}`,
            bomb.targetBuildingId,
            bomb.targetPvoId,
          );
        } else {
          nextBombs.push(bomb);
        }
      }
      fallingBombsRef.current = nextBombs;

      // B. Mobile ППО patrol movement + target scanning + Radar ПВО range extension (+45%)
      const getMobilePos = (pvo: PlacedAirDefense) => {
        const m = mobilePvoStateRef.current[pvo.id];
        return m ? { lat: m.lat, lng: m.lng } : { lat: pvo.lat, lng: pvo.lng };
      };

      for (const pvo of airDefensesRef.current) {
        const spec = AIR_DEFENSE_BY_ID[pvo.airDefenseId];
        if (!spec.isMobile && spec.id !== 'mg-pickup') continue;
        let m = mobilePvoStateRef.current[pvo.id];
        if (!m) {
          const ang = Math.random() * Math.PI * 2;
          const distKm = 10 + Math.random() * 10;
          const tLat = pvo.lat + (Math.cos(ang) * distKm) / 111.32;
          const tLng =
            pvo.lng +
            (Math.sin(ang) * distKm) /
              (111.32 * Math.max(0.2, Math.cos((pvo.lat * Math.PI) / 180)));
          const validTarget = spec.isMobile && getTerritoryAt(tLat, tLng) !== null;
          m = {
            homeLat: pvo.lat,
            homeLng: pvo.lng,
            lat: pvo.lat,
            lng: pvo.lng,
            targetLat: validTarget ? tLat : pvo.lat,
            targetLng: validTarget ? tLng : pvo.lng,
            chassisHeadingDeg: pvo.headingDeg || 45,
            turretHeadingDeg: pvo.headingDeg || 45,
          };
          mobilePvoStateRef.current[pvo.id] = m;
        }

        // Stationary pickup keeps chassis fixed in place while its machine-gun turret rotates freely
        if (!spec.isMobile) continue;

        const distToPatrol = haversineDistanceKm(m.lat, m.lng, m.targetLat, m.targetLng);
        if (distToPatrol < 1.8) {
          for (let attempt = 0; attempt < 8; attempt++) {
            const ang = Math.random() * Math.PI * 2;
            const distKm = 10 + Math.random() * 12;
            const candLat = m.homeLat + (Math.cos(ang) * distKm) / 111.32;
            const candLng =
              m.homeLng +
              (Math.sin(ang) * distKm) /
                (111.32 * Math.max(0.2, Math.cos((m.homeLat * Math.PI) / 180)));
            if (getTerritoryAt(candLat, candLng) !== null) {
              m.targetLat = candLat;
              m.targetLng = candLng;
              break;
            }
          }
        } else {
          const driveSpeedKmPerSec = 4.2;
          const stepKm = Math.min(distToPatrol, driveSpeedKmPerSec * timeScaleRef.current * dt);
          const frac = stepKm / distToPatrol;
          const driveBearing = computeBearingDeg(m.lat, m.lng, m.targetLat, m.targetLng);
          m.chassisHeadingDeg = slewAngleDeg(
            m.chassisHeadingDeg,
            driveBearing,
            190 * timeScaleRef.current * dt,
          );
          const nextPt = interpolatePath(m.lat, m.lng, m.targetLat, m.targetLng, frac);
          m.lat = nextPt.lat;
          m.lng = nextPt.lng;
        }
      }

      const activeRadars = airDefensesRef.current.filter(
        (r) => AIR_DEFENSE_BY_ID[r.airDefenseId].isRadar && r.hp > 0,
      );

      // 3-tier stealth: 'normal' always visible, 'low' needs radar, 'ultra-low' invisible even to radars
      const isFlightDetected = (flt: ActiveFlight): boolean => {
        const altMode = getFlightAltitudeMode(flt);
        if (altMode === 'ultra-low') return false;
        if (altMode === 'normal') return true;
        return activeRadars.some(
          (r) =>
            haversineDistanceKm(r.lat, r.lng, flt.lat, flt.lng) <=
            AIR_DEFENSE_BY_ID[r.airDefenseId].rangeKm,
        );
      };

      const isFlightVisible = (flt: ActiveFlight): boolean => {
        if (isFlightDetected(flt)) return true;
        return !flt.isAiStrike || gameModeRef.current === 'sandbox';
      };

      for (const pvo of airDefensesRef.current) {
        const spec = AIR_DEFENSE_BY_ID[pvo.airDefenseId];
        if (spec.isRadar) continue;

        const pvoPos = getMobilePos(pvo);
        const cd = Math.max(0, (pvoCooldownsRef.current[pvo.id] ?? 0) - dt * timeScaleRef.current);
        pvoCooldownsRef.current[pvo.id] = cd;

        const linkedRadars = activeRadars.filter(
          (r) =>
            haversineDistanceKm(pvoPos.lat, pvoPos.lng, r.lat, r.lng) <=
            AIR_DEFENSE_BY_ID[r.airDefenseId].rangeKm + spec.rangeKm,
        );
        const extendedRangeKm =
          linkedRadars.length > 0 ? Math.round(spec.rangeKm * 1.45) : spec.rangeKm;

        let targetFlight: ActiveFlight | null = null;
        let bestDist = extendedRangeKm;

        for (const flt of flightsRef.current) {
          if (!isFlightDetected(flt)) continue;
          // Only Patriot systems can engage ballistic missiles (Iskander, Sapsan, Kinzhal, Kh-22)
          if (
            !flt.carrierAircraftId &&
            MUNITION_BY_ID[flt.munitionId].profile === 'ballistic' &&
            pvo.airDefenseId !== 'patriot'
          ) {
            continue;
          }
          const dKm = haversineDistanceKm(pvoPos.lat, pvoPos.lng, flt.lat, flt.lng);
          if (dKm > bestDist) continue;

          const inOrganicRange = dKm <= spec.rangeKm;
          const seenByLinkedRadar =
            !inOrganicRange &&
            linkedRadars.some(
              (r) =>
                haversineDistanceKm(r.lat, r.lng, flt.lat, flt.lng) <=
                AIR_DEFENSE_BY_ID[r.airDefenseId].rangeKm,
            );

          if (inOrganicRange || seenByLinkedRadar) {
            const activeChasers = interceptorsRef.current.filter(
              (ic) => ic.targetFlightId === flt.id && !ic.missed,
            ).length;
            if (activeChasers < 2) {
              bestDist = dKm;
              targetFlight = flt;
            }
          }
        }

        if (
          targetFlight &&
          (spec.isMobile || spec.id === 'mg-pickup') &&
          mobilePvoStateRef.current[pvo.id]
        ) {
          const aimBearing = computeBearingDeg(
            pvoPos.lat,
            pvoPos.lng,
            targetFlight.lat,
            targetFlight.lng,
          );
          mobilePvoStateRef.current[pvo.id].turretHeadingDeg = slewAngleDeg(
            mobilePvoStateRef.current[pvo.id].turretHeadingDeg,
            aimBearing,
            440 * timeScaleRef.current * dt,
          );
        }

        if (pvo.ammo <= 0 || cd > 0) continue;

        if (targetFlight) {
          const bearingDeg = computeBearingDeg(
            pvoPos.lat,
            pvoPos.lng,
            targetFlight.lat,
            targetFlight.lng,
          );
          const isSmallBullet = pvo.airDefenseId === 'mg-pickup';
          const exitOffsetKm = spec.isGun ? 0.65 : 1.45;
          const exitPt = computePointAheadKm(pvoPos.lat, pvoPos.lng, bearingDeg, exitOffsetKm);
          interceptorsRef.current.push({
            id: `sam_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            pvoId: pvo.id,
            airDefenseId: pvo.airDefenseId,
            targetFlightId: targetFlight.id,
            lat: exitPt.lat,
            lng: exitPt.lng,
            bearingDeg,
            visualHeadingDeg: bearingDeg,
            speedKmPerSec: spec.interceptorSpeedKmPerSec,
            isGun: spec.isGun,
            accentColor: spec.accentColor,
            trail: [{ lat: pvoPos.lat, lng: pvoPos.lng }, exitPt],
          });
          pvoLaunchFlashesRef.current.push({
            id: `plume_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            lat: pvoPos.lat,
            lng: pvoPos.lng,
            angleDeg: bearingDeg,
            age: 0,
            duration: spec.isGun ? 0.28 : 0.78,
            isGun: spec.isGun,
            isSmallBullet,
            accentColor: spec.accentColor,
          });
          pvoCooldownsRef.current[pvo.id] = spec.cooldownSec;
          soundFx.playSamLaunch(spec.isGun, isSmallBullet);
          callbacksRef.current.onPvoFired(pvo.id, bearingDeg);
        }
      }

      // C. Update SAM interceptors & resolve mid-air interceptions (including miss probability)
      const nextInterceptors: SamInterceptor[] = [];
      for (const sam of interceptorsRef.current) {
        const isSmallBullet = sam.airDefenseId === 'mg-pickup';
        const maxTrailLen = isSmallBullet ? 5 : 18;
        if (sam.missed) {
          sam.overshootAge = (sam.overshootAge ?? 0) + dt;
          const stepKm = sam.speedKmPerSec * timeScaleRef.current * dt;
          const rad = (sam.bearingDeg * Math.PI) / 180;
          sam.lat += (Math.cos(rad) * stepKm) / 111.32;
          sam.lng +=
            (Math.sin(rad) * stepKm) /
            (111.32 * Math.max(0.2, Math.cos((sam.lat * Math.PI) / 180)));
          if (recordTrail) {
            sam.trail.push({ lat: sam.lat, lng: sam.lng });
            if (sam.trail.length > maxTrailLen) sam.trail.shift();
          }
          if (sam.overshootAge >= (isSmallBullet ? 0.22 : 0.42)) {
            interceptBurstsRef.current.push({
              id: `ib_${sam.id}`,
              lat: sam.lat,
              lng: sam.lng,
              age: 0,
              duration: 0.95,
              isMiss: true,
            });
            continue;
          }
          nextInterceptors.push(sam);
          continue;
        }

        const tgt = flightsRef.current.find((f) => f.id === sam.targetFlightId);
        if (!tgt) {
          interceptBurstsRef.current.push({
            id: `ib_${sam.id}`,
            lat: sam.lat,
            lng: sam.lng,
            age: 0,
            duration: 0.55,
            isSelfDestruct: true,
          });
          continue;
        }

        const tgtAltMode = getFlightAltitudeMode(tgt);
        if (tgtAltMode === 'ultra-low' || (tgtAltMode === 'low' && !isFlightDetected(tgt))) {
          const deflect = (Math.random() < 0.5 ? 1 : -1) * (12 + Math.random() * 14);
          sam.missed = true;
          sam.overshootAge = 0;
          sam.bearingDeg = (sam.bearingDeg + deflect + 360) % 360;
          sam.visualHeadingDeg = sam.bearingDeg;
          nextInterceptors.push(sam);
          continue;
        }

        const distKm = haversineDistanceKm(sam.lat, sam.lng, tgt.lat, tgt.lng);
        const stepKm = sam.speedKmPerSec * timeScaleRef.current * dt;
        sam.bearingDeg = computeBearingDeg(sam.lat, sam.lng, tgt.lat, tgt.lng);
        sam.visualHeadingDeg = slewAngleDeg(
          sam.visualHeadingDeg,
          sam.bearingDeg,
          260 * timeScaleRef.current * dt,
        );

        if (stepKm >= distKm || distKm < 7) {
          const pvoSpec = AIR_DEFENSE_BY_ID[sam.airDefenseId];
          const tgtSpec = MUNITION_BY_ID[tgt.munitionId];
          const hitChance = getInterceptHitChance(
            sam.airDefenseId,
            tgtSpec.profile,
            tgt.munitionId,
            tgt.carrierAircraftId,
          );

          if (Math.random() <= hitChance) {
            flightsRef.current = flightsRef.current.filter((f) => f.id !== tgt.id);
            if (selectedFlightRef.current === tgt.id) {
              if (followCamFlightIdRef.current === tgt.id) {
                followCamFlightIdRef.current = null;
                callbacksRef.current.onFollowCamChange(false);
              }
              callbacksRef.current.onSelectFlight(null);
            }
            interceptBurstsRef.current.push({
              id: `ib_${sam.id}`,
              lat: tgt.lat,
              lng: tgt.lng,
              age: 0,
              duration: 2.1,
              accentColor: pvoSpec.accentColor,
            });
            totalInterceptsRef.current += 1;
            callbacksRef.current.onTacticalEvent({
              kind: 'intercept',
              munitionId: tgt.munitionId,
              detail: `${pvoSpec.shortName} · ${formatLocationLabel(tgt.lat, tgt.lng)}`,
            });
            const hitRaion = getRaionAt(tgt.lat, tgt.lng);
            if (hitRaion && getTelegramChannelByOblast(hitRaion.oblast)) {
              const nearInfo = findNearestSettlementInfo(tgt.lat, tgt.lng);
              callbacksRef.current.onTelegramIntel({
                flightId: `int_${sam.id}`,
                oblast: hitRaion.oblast,
                raionName: hitRaion.name,
                munitionId: tgt.munitionId,
                nearCity: nearInfo.distKm <= 45 ? nearInfo.fullLabel : undefined,
                altitudeMode: getFlightAltitudeMode(tgt),
                eventKind: 'intercepted',
              });
            }
            soundFx.playAirIntercept(
              tgtSpec.profile === 'prop-drone' || tgtSpec.profile === 'jet-drone',
              sam.isGun,
            );
            statsDirty = true;
          } else {
            // Interceptor misses target and streaks past
            const deflect = (Math.random() < 0.5 ? 1 : -1) * (9 + Math.random() * 14);
            sam.missed = true;
            sam.overshootAge = 0;
            sam.bearingDeg = (sam.bearingDeg + deflect + 360) % 360;
            sam.visualHeadingDeg = sam.bearingDeg;
            totalMissesRef.current += 1;
            callbacksRef.current.onTacticalEvent({
              kind: 'miss',
              munitionId: tgt.munitionId,
              detail: `${pvoSpec.shortName} · промах (${formatLocationLabel(tgt.lat, tgt.lng)})`,
            });
            statsDirty = true;
            nextInterceptors.push(sam);
          }
          continue;
        }

        const frac = stepKm / distKm;
        const nextPos = interpolatePath(sam.lat, sam.lng, tgt.lat, tgt.lng, frac);
        sam.lat = nextPos.lat;
        sam.lng = nextPos.lng;
        if (recordTrail) {
          sam.trail.push({ lat: sam.lat, lng: sam.lng });
          if (sam.trail.length > maxTrailLen) sam.trail.shift();
        }
        nextInterceptors.push(sam);
      }
      interceptorsRef.current = nextInterceptors;

      // D. Update mid-air intercept bursts, PVO launch plumes & ground explosions
      const nextBursts: InterceptBurst[] = [];
      for (const b of interceptBurstsRef.current) {
        b.age += dt;
        if (b.age < b.duration) nextBursts.push(b);
      }
      interceptBurstsRef.current = nextBursts;

      const nextPlumes: PvoLaunchPlume[] = [];
      for (const pl of pvoLaunchFlashesRef.current) {
        pl.age += dt;
        if (pl.age < pl.duration) nextPlumes.push(pl);
      }
      pvoLaunchFlashesRef.current = nextPlumes;

      const nextExplosions: ActiveExplosion[] = [];
      for (const exp of explosionsRef.current) {
        exp.age += dt;
        if (exp.age < exp.duration) nextExplosions.push(exp);
      }
      explosionsRef.current = nextExplosions;

      // E. Update Ukrainian raion threat alerts (rapid gradual corridor wave on missile launch + holdover & sirens)
      let droneCount = 0;
      let missileCount = 0;
      const shouldUpdateAlerts =
        forceAlertUpdateRef.current ||
        alertTimer >= 0.045 ||
        (flightsRef.current.length > 0 && activeThreatsRef.current.size === 0);

      if (shouldUpdateAlerts) {
        forceAlertUpdateRef.current = false;
        const stepSec = alertTimer;
        alertTimer = 0;

        const instantThreats = computeRaionThreatLevels(
          flightsRef.current
            .filter((f) => !f.isReturnToBase && isFlightDetected(f))
            .map((f) => ({
              lat: f.lat,
              lng: f.lng,
              munitionId: f.munitionId,
              isCarrierAircraft: Boolean(f.carrierAircraftId),
              ageSec: f.ageSec,
              waypoints: f.kabTargetPoint ? [...f.waypoints, f.kabTargetPoint] : f.waypoints,
              segmentIndex: f.segmentIndex,
            })),
          alertRadiusKmRef.current,
        );
        const holdoverSec = Math.max(0, alertHoldoverSecRef.current);
        const prevThreats = activeThreatsRef.current;
        const holdMap = raionHoldoversRef.current;

        const candidateIds = new Set<string>([
          ...instantThreats.keys(),
          ...holdMap.keys(),
          ...prevThreats.keys(),
        ]);

        const nextThreats = new Map<string, ThreatLevel>();
        let newlyAlertedDrone = false;
        let newlyAlertedMissile = false;

        for (const id of candidateIds) {
          const inst = instantThreats.get(id) ?? 'none';
          const prevHold = holdMap.get(id) ?? { droneHold: 0, missileHold: 0 };

          const missileNow = inst === 'missile';
          const droneNow = inst === 'drone';

          const missileHold = missileNow ? holdoverSec : Math.max(0, prevHold.missileHold - stepSec);
          const droneHold = droneNow ? holdoverSec : Math.max(0, prevHold.droneHold - stepSec);

          if (missileHold > 0 || droneHold > 0) {
            holdMap.set(id, { droneHold, missileHold });
          } else {
            holdMap.delete(id);
          }

          let effective: ThreatLevel = 'none';
          if (missileNow || missileHold > 0) {
            effective = 'missile';
            missileCount += 1;
          } else if (droneNow || droneHold > 0) {
            effective = 'drone';
            droneCount += 1;
          }

          if (effective !== 'none') {
            nextThreats.set(id, effective);
          }

          const prevLevel = prevThreats.get(id) ?? 'none';
          if (prevLevel !== effective) {
            if (effective === 'missile') newlyAlertedMissile = true;
            else if (effective === 'drone' && prevLevel === 'none') newlyAlertedDrone = true;
          }
        }

        let threatMapChanged = false;
        for (const [id] of prevThreats) {
          if (!nextThreats.has(id)) {
            const poly = raionPolygonMapRef.current.get(id);
            if (poly) poly.setStyle(getRaionStyle('none', isPermanentAlertRaionId(id)));
            threatMapChanged = true;
          }
        }
        for (const [id, level] of nextThreats) {
          if (prevThreats.get(id) !== level) {
            const poly = raionPolygonMapRef.current.get(id);
            if (poly) poly.setStyle(getRaionStyle(level, isPermanentAlertRaionId(id)));
            threatMapChanged = true;
          }
        }

        soundFx.updateAirRaidSiren({
          droneRaions: droneCount,
          missileRaions: missileCount,
          newlyAlertedDrone,
          newlyAlertedMissile,
        });

        if (threatMapChanged) {
          activeThreatsRef.current = nextThreats;
          setAlertCounts({ drone: droneCount, missile: missileCount });
          statsDirty = true;

          // Broadcast oblast air-raid alerts (type + start/upgrade/clear) to Telegram channels
          const nextOblastInfo = new Map<string, { level: ThreatLevel; raions: string[] }>();
          for (const [raionId, level] of nextThreats) {
            const meta = getRaionMetaById(raionId);
            if (!meta) continue;
            if (
              meta.oblast === 'АР Крим' ||
              meta.oblast === 'м. Севастополь' ||
              meta.oblast === 'Луганська область'
            ) {
              continue;
            }
            const cur = nextOblastInfo.get(meta.oblast);
            if (!cur) {
              nextOblastInfo.set(meta.oblast, { level, raions: [meta.name] });
            } else {
              if (level === 'missile') cur.level = 'missile';
              if (cur.raions.length < 4 && !cur.raions.includes(meta.name)) {
                cur.raions.push(meta.name);
              }
            }
          }

          let hasDetectedBallistic = false;
          let hasDetectedAircraft = false;
          for (const f of flightsRef.current) {
            if (f.isReturnToBase || !isFlightDetected(f)) continue;
            if (f.carrierAircraftId) hasDetectedAircraft = true;
            if (MUNITION_BY_ID[f.munitionId].profile === 'ballistic') {
              hasDetectedBallistic = true;
            }
          }
          const missileSubtype: TelegramAlertSubtype = hasDetectedBallistic
            ? 'ballistic'
            : hasDetectedAircraft
              ? 'aircraft'
              : 'missile';

          const prevOblastAlerts = prevOblastAlertsRef.current;
          const allOblasts = new Set<string>([
            ...prevOblastAlerts.keys(),
            ...nextOblastInfo.keys(),
          ]);
          const nextOblastLevels = new Map<string, ThreatLevel>();

          for (const oblast of allOblasts) {
            const prevLvl = prevOblastAlerts.get(oblast) ?? 'none';
            const nextInfo = nextOblastInfo.get(oblast);
            const nextLvl: ThreatLevel = nextInfo ? nextInfo.level : 'none';
            if (nextLvl !== 'none') {
              nextOblastLevels.set(oblast, nextLvl);
            }
            if (!getTelegramChannelByOblast(oblast)) continue;

            if (prevLvl === 'none' && nextLvl !== 'none') {
              if (oblastDorozvedkaTimersRef.current[oblast]) {
                window.clearTimeout(oblastDorozvedkaTimersRef.current[oblast]);
                delete oblastDorozvedkaTimersRef.current[oblast];
              }
              callbacksRef.current.onTelegramIntel({
                flightId: `alert_${oblast}`,
                oblast,
                targetCity: oblast,
                altitudeMode: 'normal',
                eventKind: 'alert_on',
                alertSubtype: nextLvl === 'drone' ? 'drone' : missileSubtype,
                alertRaionNames: nextInfo?.raions,
              });
            } else if (prevLvl === 'drone' && nextLvl === 'missile') {
              if (oblastDorozvedkaTimersRef.current[oblast]) {
                window.clearTimeout(oblastDorozvedkaTimersRef.current[oblast]);
                delete oblastDorozvedkaTimersRef.current[oblast];
              }
              callbacksRef.current.onTelegramIntel({
                flightId: `alert_${oblast}`,
                oblast,
                targetCity: oblast,
                altitudeMode: 'normal',
                eventKind: 'alert_upgrade',
                alertSubtype: missileSubtype,
                alertRaionNames: nextInfo?.raions,
              });
            } else if (prevLvl !== 'none' && nextLvl === 'none') {
              if (oblastDorozvedkaTimersRef.current[oblast]) {
                window.clearTimeout(oblastDorozvedkaTimersRef.current[oblast]);
              }
              callbacksRef.current.onTelegramIntel({
                flightId: `recon_${oblast}_${Date.now()}`,
                oblast,
                targetCity: oblast,
                altitudeMode: 'normal',
                eventKind: 'dorozvedka',
              });
              oblastDorozvedkaTimersRef.current[oblast] = window.setTimeout(() => {
                delete oblastDorozvedkaTimersRef.current[oblast];
                if (!prevOblastAlertsRef.current.has(oblast)) {
                  callbacksRef.current.onTelegramIntel({
                    flightId: `clear_${oblast}_${Date.now()}`,
                    oblast,
                    targetCity: oblast,
                    altitudeMode: 'normal',
                    eventKind: 'alert_off',
                    alertSubtype: 'clear',
                  });
                }
              }, 3400);
            }
          }
          prevOblastAlertsRef.current = nextOblastLevels;

          if (cursorRef.current.inside) {
            const hov = getRaionAt(cursorRef.current.lat, cursorRef.current.lng);
            setHoveredRaion(
              hov
                ? {
                    meta: hov,
                    threat: nextThreats.get(hov.id) ?? 'none',
                    zoneStatus: getFrontlineZoneAt(cursorRef.current.lat, cursorRef.current.lng),
                  }
                : null,
            );
          }
        }
      } else {
        for (const lvl of activeThreatsRef.current.values()) {
          if (lvl === 'drone') droneCount += 1;
          else if (lvl === 'missile') missileCount += 1;
        }
      }

      if (statsDirty) {
        emitMapStats(droneCount, missileCount);
      }

      // F. Update continuous in-flight sounds for airborne drones, missiles & ППО interceptors
      let propDroneCount = 0;
      let jetDroneCount = 0;
      let cruiseMissileCount = 0;
      let ballisticCount = 0;
      for (const flt of flightsRef.current) {
        if (!isFlightDetected(flt)) continue;
        const prof = MUNITION_BY_ID[flt.munitionId].profile;
        if (prof === 'prop-drone') propDroneCount += 1;
        else if (prof === 'jet-drone') jetDroneCount += 1;
        else if (prof === 'ballistic') ballisticCount += 1;
        else if (prof !== 'kab') cruiseMissileCount += 1;
      }
      let samMissileCount = 0;
      let flakGunCount = 0;
      for (const sam of interceptorsRef.current) {
        if (sam.isGun) flakGunCount += 1;
        else samMissileCount += 1;
      }
      soundFx.updateInFlightAudio({
        propDrone: propDroneCount,
        jetDrone: jetDroneCount,
        cruiseMissile: cruiseMissileCount,
        ballistic: ballisticCount,
        samMissile: samMissileCount,
        flakGun: flakGunCount,
      });

      // 2. Render ППО units, Radar ПВО links & boosted radar circles
      if (activeRadars.length > 0) {
        ctx.save();
        ctx.strokeStyle = 'rgba(34, 211, 238, 0.28)';
        ctx.lineWidth = 1.1;
        ctx.setLineDash([4, 6]);
        for (const r of activeRadars) {
          const rSpec = AIR_DEFENSE_BY_ID[r.airDefenseId];
          const rPt = map.latLngToContainerPoint([r.lat, r.lng]);
          for (const pvo of airDefensesRef.current) {
            const pSpec = AIR_DEFENSE_BY_ID[pvo.airDefenseId];
            if (pSpec.isRadar || pvo.ammo <= 0) continue;
            const pPos = getMobilePos(pvo);
            if (haversineDistanceKm(r.lat, r.lng, pPos.lat, pPos.lng) <= rSpec.rangeKm + pSpec.rangeKm) {
              const pPt = map.latLngToContainerPoint([pPos.lat, pPos.lng]);
              ctx.beginPath();
              ctx.moveTo(rPt.x, rPt.y);
              ctx.lineTo(pPt.x, pPt.y);
              ctx.stroke();
            }
          }
        }
        ctx.setLineDash([]);
        ctx.restore();
      }

      for (const pvo of airDefensesRef.current) {
        const pPos = getMobilePos(pvo);
        const mState = mobilePvoStateRef.current[pvo.id];
        const pt = map.latLngToContainerPoint([pPos.lat, pPos.lng]);
        const spec = AIR_DEFENSE_BY_ID[pvo.airDefenseId];
        const rangePx = getPixelRadiusKm(map, pPos.lat, pPos.lng, spec.rangeKm);
        const hasRadarBoost =
          !spec.isRadar &&
          activeRadars.some(
            (r) =>
              haversineDistanceKm(r.lat, r.lng, pPos.lat, pPos.lng) <=
              AIR_DEFENSE_BY_ID[r.airDefenseId].rangeKm + spec.rangeKm,
          );
        const extendedRangePx = hasRadarBoost
          ? getPixelRadiusKm(map, pPos.lat, pPos.lng, Math.round(spec.rangeKm * 1.45))
          : undefined;
        const aimRad = (( (mState ? mState.turretHeadingDeg : pvo.headingDeg) - 90) * Math.PI) / 180;
        const chassisRad = mState ? ((mState.chassisHeadingDeg - 90) * Math.PI) / 180 : aimRad;
        const isHov = hoveredPvoIdRef.current === pvo.id;
        const isPvoTargetLocked =
          isHov &&
          !spec.isRadar &&
          Boolean(
            (selectedRef.current ||
              (selectedAirfieldRef.current && airfieldLaunchPointRef.current)) &&
              !pendingRef.current &&
              !plottingRef.current,
          );

        drawAirDefenseUnit(ctx, pt.x, pt.y, rangePx, spec, {
          ammo: pvo.ammo,
          maxAmmo: pvo.maxAmmo,
          hp: pvo.hp,
          maxHp: pvo.maxHp,
          cooldownRemainingSec: pvoCooldownsRef.current[pvo.id] ?? 0,
          cooldownTotalSec: spec.cooldownSec,
          aimAngleRad: aimRad,
          chassisAngleRad: chassisRad,
          extendedRangePx,
          hovered: isHov,
          isTargetLocked: isPvoTargetLocked,
          timeSec,
        });

        if (isHov && !isPvoTargetLocked) {
          ctx.save();
          ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
          const tag = `${spec.name} · ${Math.ceil(pvo.hp)}/${pvo.maxHp} HP`;
          const tw = ctx.measureText(tag).width;
          const labelY = pt.y - 48;
          ctx.fillStyle = 'rgba(7, 13, 23, 0.9)';
          ctx.strokeStyle = spec.accentColor;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(pt.x - tw / 2 - 7, labelY, tw + 14, 19, 4);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#F8FAFC';
          ctx.fillText(tag, pt.x - tw / 2, labelY + 13);
          ctx.restore();
        }
      }

      // 2.5. Render visible booster ignition flames & cold-launch smoke clouds bursting from ППО tubes
      for (const pl of pvoLaunchFlashesRef.current) {
        const pt = map.latLngToContainerPoint([pl.lat, pl.lng]);
        const headRad = ((pl.angleDeg - 90) * Math.PI) / 180;
        drawPvoLaunchPlume(
          ctx,
          pt.x,
          pt.y,
          headRad,
          pl.age,
          pl.duration,
          pl.isGun,
          pl.isSmallBullet,
          pl.accentColor,
        );
      }

      // 3. Render custom waypoint route preview OR direct 1-click targeting preview
      if (selectedRef.current && !pendingRef.current) {
        const sel = launchersRef.current.find((l) => l.id === selectedRef.current);
        if (sel) {
          const spec = MUNITION_BY_ID[sel.munitionId];
          const wps = waypointsRef.current;

          // Draw max-range boundary ring around launcher when weapon has a km limit (e.g. КАБ 75 км)
          if (spec.maxRangeKm) {
            const selPt = map.latLngToContainerPoint([sel.lat, sel.lng]);
            const maxPx = getPixelRadiusKm(map, sel.lat, sel.lng, spec.maxRangeKm);
            ctx.save();
            ctx.strokeStyle = 'rgba(251, 113, 133, 0.55)';
            ctx.fillStyle = 'rgba(251, 113, 133, 0.04)';
            ctx.lineWidth = 1.4;
            ctx.setLineDash([6, 5]);
            ctx.beginPath();
            ctx.arc(selPt.x, selPt.y, maxPx, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
          }

          if (plottingRef.current) {
            const rawPts: RoutePoint[] = [{ lat: sel.lat, lng: sel.lng }, ...wps];
            const smoothPreview = buildSmoothRoute(rawPts);
            const totalRouteKm = computeRouteLengthKm(smoothPreview);

            ctx.save();
            // Draw smooth curved route segments
            if (smoothPreview.length > 1) {
              ctx.strokeStyle = spec.accentColor;
              ctx.lineWidth = 2.2;
              ctx.beginPath();
              const pFirst = map.latLngToContainerPoint([smoothPreview[0].lat, smoothPreview[0].lng]);
              ctx.moveTo(pFirst.x, pFirst.y);
              for (let i = 1; i < smoothPreview.length; i++) {
                const pNext = map.latLngToContainerPoint([smoothPreview[i].lat, smoothPreview[i].lng]);
                ctx.lineTo(pNext.x, pNext.y);
              }
              ctx.stroke();
            }

            // Draw numbered waypoint markers
            for (let i = 0; i < wps.length; i++) {
              const wpPt = map.latLngToContainerPoint([wps[i].lat, wps[i].lng]);
              const isLast = i === wps.length - 1;
              ctx.fillStyle = isLast ? '#EF4444' : '#0A1322';
              ctx.strokeStyle = isLast ? '#FCA5A5' : spec.accentColor;
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.arc(wpPt.x, wpPt.y, 9, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();

              ctx.font = '700 10px "JetBrains Mono", monospace';
              ctx.fillStyle = '#FFFFFF';
              const numStr = String(i + 1);
              const nw = ctx.measureText(numStr).width;
              ctx.fillText(numStr, wpPt.x - nw / 2, wpPt.y + 3.5);
            }

            // Draw 75 km KAB radius around last plotted waypoint for Су-57 so player sees KAB reach
            if (spec.id === 'su57-kab' && wps.length >= 1) {
              const lastWp = wps[wps.length - 1];
              const lastWpPt = map.latLngToContainerPoint([lastWp.lat, lastWp.lng]);
              const kabPx = getPixelRadiusKm(map, lastWp.lat, lastWp.lng, spec.kabMaxRangeKm ?? 75);
              ctx.strokeStyle = 'rgba(251, 113, 133, 0.42)';
              ctx.lineWidth = 1.2;
              ctx.setLineDash([5, 4]);
              ctx.beginPath();
              ctx.arc(lastWpPt.x, lastWpPt.y, kabPx, 0, Math.PI * 2);
              ctx.stroke();
              ctx.setLineDash([]);
            }

            // Draw dashed preview from last waypoint (or launcher) to cursor
            if (cursorRef.current.inside && !rightDragRef.current.active) {
              const lastGeo = rawPts[rawPts.length - 1];
              const lastPt = map.latLngToContainerPoint([lastGeo.lat, lastGeo.lng]);
              const cur = cursorRef.current;
              const segCheck = isFlightPathAllowed(lastGeo.lat, lastGeo.lng, cur.lat, cur.lng);
              const segKm = haversineDistanceKm(lastGeo.lat, lastGeo.lng, cur.lat, cur.lng);
              const nextTotalKm = totalRouteKm + segKm;
              const overKabLimit = Boolean(spec.maxRangeKm && nextTotalKm > spec.maxRangeKm);
              const routeValid = segCheck.allowed && !overKabLimit;
              const etaSec = nextTotalKm / (spec.simSpeedKmPerSec * timeScaleRef.current);

              ctx.strokeStyle = routeValid ? spec.accentColor : '#EF4444';
              ctx.lineWidth = 1.6;
              ctx.setLineDash([6, 5]);
              ctx.beginPath();
              ctx.moveTo(lastPt.x, lastPt.y);
              ctx.lineTo(cur.x, cur.y);
              ctx.stroke();
              ctx.setLineDash([]);

              ctx.strokeStyle = routeValid ? spec.accentColor : '#EF4444';
              ctx.beginPath();
              ctx.arc(cur.x, cur.y, 9, 0, Math.PI * 2);
              ctx.stroke();

              const labelText = !segCheck.allowed
                ? 'Вне зоны UA / RU'
                : overKabLimit
                  ? `Превышен лимит КАБ: ${Math.round(nextTotalKm)} / ${spec.maxRangeKm} км`
                  : spec.id === 'su57-kab'
                    ? wps.length === 0
                      ? `+Точка 1 (маршрут Су-57 · ${Math.round(segKm)} км)`
                      : `+Точка ${wps.length + 1} (${Math.round(segKm)} км${segKm <= (spec.kabMaxRangeKm ?? 75) ? ' · КАБ ≤75 км ✓' : ' · >75 км для КАБ'})`
                    : `+Точка ${wps.length + 1} · Всего ${Math.round(nextTotalKm)} км (~${etaSec.toFixed(1)} с)`;
              ctx.font = '600 11px "JetBrains Mono", monospace';
              const tw = ctx.measureText(labelText).width;
              const lx = cur.x + 15;
              const ly = cur.y - 16;
              ctx.fillStyle = 'rgba(7, 13, 23, 0.9)';
              ctx.strokeStyle = routeValid ? spec.accentColor : 'rgba(239, 68, 68, 0.7)';
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.roundRect(lx, ly - 13, tw + 14, 20, 4);
              ctx.fill();
              ctx.stroke();
              ctx.fillStyle = routeValid ? '#F8FAFC' : '#FCA5A5';
              ctx.fillText(labelText, lx + 7, ly + 1);
            }

            ctx.restore();
          } else if (spec.id === 'su57-kab') {
            // Dedicated 2-step targeting preview for Су-57:
            // Step 1: pick drop location where plane flies; Step 2: pick КАБ target within 75 km
            const startPt = map.latLngToContainerPoint([sel.lat, sel.lng]);
            const dropPt = su57DropPointRef.current;
            const hasAmmo = sel.ammo > 0;
            const maxKabKm = spec.kabMaxRangeKm ?? 75;

            if (!dropPt) {
              if (cursorRef.current.inside && !rightDragRef.current.active) {
                const targetLat = cursorRef.current.lat;
                const targetLng = cursorRef.current.lng;
                const endPt = cursorRef.current;
                const pathCheck = isFlightPathAllowed(sel.lat, sel.lng, targetLat, targetLng);
                const distKm = haversineDistanceKm(sel.lat, sel.lng, targetLat, targetLng);
                const canFly = hasAmmo && pathCheck.allowed;

                ctx.save();
                ctx.strokeStyle = canFly ? '#38BDF8' : '#EF4444';
                ctx.lineWidth = 1.85;
                ctx.setLineDash([7, 5]);
                ctx.beginPath();
                ctx.moveTo(startPt.x, startPt.y);
                ctx.lineTo(endPt.x, endPt.y);
                ctx.stroke();
                ctx.setLineDash([]);

                const kabRingPx = getPixelRadiusKm(map, targetLat, targetLng, maxKabKm);
                ctx.strokeStyle = 'rgba(251, 113, 133, 0.45)';
                ctx.fillStyle = 'rgba(251, 113, 133, 0.04)';
                ctx.lineWidth = 1.2;
                ctx.setLineDash([5, 4]);
                ctx.beginPath();
                ctx.arc(endPt.x, endPt.y, kabRingPx, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                ctx.setLineDash([]);

                ctx.strokeStyle = canFly ? '#38BDF8' : '#EF4444';
                ctx.lineWidth = 1.8;
                ctx.beginPath();
                ctx.arc(endPt.x, endPt.y, 11, 0, Math.PI * 2);
                ctx.stroke();

                const labelText = !hasAmmo
                  ? `Боекомплект 0/${sel.maxAmmo}`
                  : !pathCheck.allowed
                    ? 'Вне зоны UA / RU'
                    : `Шаг 1: точка сброса Су-57 (${Math.round(distKm)} км) · зона КАБ 75 км`;
                ctx.font = '600 11px "JetBrains Mono", monospace';
                const tw = ctx.measureText(labelText).width;
                const lx = endPt.x + 18;
                const ly = endPt.y - 20;
                ctx.fillStyle = 'rgba(7, 13, 23, 0.9)';
                ctx.strokeStyle = canFly ? 'rgba(56, 189, 248, 0.7)' : 'rgba(239, 68, 68, 0.65)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.roundRect(lx, ly - 13, tw + 14, 20, 4);
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = canFly ? '#E0F2FE' : '#FCA5A5';
                ctx.fillText(labelText, lx + 7, ly + 1);
                ctx.restore();
              }
            } else {
              const dropCanvasPt = map.latLngToContainerPoint([dropPt.lat, dropPt.lng]);
              const kabRadiusPx = getPixelRadiusKm(map, dropPt.lat, dropPt.lng, maxKabKm);

              ctx.save();
              // Outbound Су-57 leg (launcher -> dropPt) + return vector
              ctx.strokeStyle = '#38BDF8';
              ctx.lineWidth = 2.1;
              ctx.beginPath();
              ctx.moveTo(startPt.x, startPt.y);
              ctx.lineTo(dropCanvasPt.x, dropCanvasPt.y);
              ctx.stroke();

              // 75 km KAB zone around chosen drop point
              ctx.strokeStyle = 'rgba(251, 113, 133, 0.65)';
              ctx.fillStyle = 'rgba(251, 113, 133, 0.05)';
              ctx.lineWidth = 1.4;
              ctx.setLineDash([6, 5]);
              ctx.beginPath();
              ctx.arc(dropCanvasPt.x, dropCanvasPt.y, kabRadiusPx, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();
              ctx.setLineDash([]);

              // Drop point marker
              ctx.fillStyle = '#0A1322';
              ctx.strokeStyle = '#38BDF8';
              ctx.lineWidth = 2.2;
              ctx.beginPath();
              ctx.arc(dropCanvasPt.x, dropCanvasPt.y, 9, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();

              ctx.font = '700 10px "JetBrains Mono", monospace';
              const dropTag = 'СБРОС КАБ';
              const dtw = ctx.measureText(dropTag).width;
              ctx.fillStyle = 'rgba(7, 13, 23, 0.9)';
              ctx.beginPath();
              ctx.roundRect(dropCanvasPt.x - dtw / 2 - 5, dropCanvasPt.y - 27, dtw + 10, 15, 3);
              ctx.fill();
              ctx.fillStyle = '#7DD3FC';
              ctx.fillText(dropTag, dropCanvasPt.x - dtw / 2, dropCanvasPt.y - 16);

              if (cursorRef.current.inside && !rightDragRef.current.active) {
                const lockedBuilding = hoveredBuildingIdRef.current
                  ? buildingsRef.current.find((b) => b.id === hoveredBuildingIdRef.current) ?? null
                  : null;
                const lockedPvo = !lockedBuilding && hoveredPvoIdRef.current
                  ? airDefensesRef.current.find(
                      (p) =>
                        p.id === hoveredPvoIdRef.current &&
                        !AIR_DEFENSE_BY_ID[p.airDefenseId].isRadar,
                    ) ?? null
                  : null;
                const lockedPvoPos = lockedPvo ? getMobilePos(lockedPvo) : null;
                const targetLat = lockedBuilding
                  ? lockedBuilding.lat
                  : lockedPvoPos
                    ? lockedPvoPos.lat
                    : cursorRef.current.lat;
                const targetLng = lockedBuilding
                  ? lockedBuilding.lng
                  : lockedPvoPos
                    ? lockedPvoPos.lng
                    : cursorRef.current.lng;
                const endPt = lockedBuilding
                  ? map.latLngToContainerPoint([lockedBuilding.lat, lockedBuilding.lng])
                  : lockedPvoPos
                    ? map.latLngToContainerPoint([lockedPvoPos.lat, lockedPvoPos.lng])
                    : cursorRef.current;
                const hasLockedEntity = Boolean(lockedBuilding || lockedPvo);

                const pathCheck = isFlightPathAllowed(dropPt.lat, dropPt.lng, targetLat, targetLng);
                const kabDistKm = haversineDistanceKm(dropPt.lat, dropPt.lng, targetLat, targetLng);
                const withinKabLimit = kabDistKm <= maxKabKm;
                const canFire = hasAmmo && pathCheck.allowed && withinKabLimit;

                ctx.strokeStyle = canFire ? '#FB7185' : '#EF4444';
                ctx.lineWidth = hasLockedEntity ? 2 : 1.75;
                ctx.setLineDash([6, 4]);
                ctx.beginPath();
                ctx.moveTo(dropCanvasPt.x, dropCanvasPt.y);
                ctx.lineTo(endPt.x, endPt.y);
                ctx.stroke();
                ctx.setLineDash([]);

                ctx.strokeStyle = canFire ? (hasLockedEntity ? '#EF4444' : '#FB7185') : '#EF4444';
                ctx.lineWidth = 1.6;
                ctx.beginPath();
                ctx.arc(endPt.x, endPt.y, hasLockedEntity ? 14 : 11, 0, Math.PI * 2);
                ctx.stroke();

                const labelText = !hasAmmo
                  ? `Боекомплект 0/${sel.maxAmmo}`
                  : !pathCheck.allowed
                    ? 'Вне зоны UA / RU'
                    : !withinKabLimit
                      ? `Вне радиуса КАБ: ${Math.round(kabDistKm)} / ${maxKabKm} км`
                      : lockedBuilding
                        ? (() => {
                            const bSpec = BUILDING_BY_ID[lockedBuilding.buildingId];
                            const afterHp = Math.max(0, Math.ceil(lockedBuilding.hp - spec.damage));
                            return `КАБ → ${bSpec.shortName} (${Math.ceil(lockedBuilding.hp)}→${afterHp} HP) · ${Math.round(kabDistKm)} км`;
                          })()
                        : lockedPvo
                          ? (() => {
                              const pSpec = AIR_DEFENSE_BY_ID[lockedPvo.airDefenseId];
                              const afterHp = Math.max(0, Math.ceil(lockedPvo.hp - spec.damage));
                              return `КАБ → ППО ${pSpec.shortName} (${Math.ceil(lockedPvo.hp)}→${afterHp} HP) · ${Math.round(kabDistKm)} км`;
                            })()
                          : `Шаг 2: цель КАБ (${Math.round(kabDistKm)}/${maxKabKm} км) · Урон ${spec.damage}`;
                ctx.font = '600 11px "JetBrains Mono", monospace';
                const tw = ctx.measureText(labelText).width;
                const lx = endPt.x + 18;
                const ly = endPt.y - 22;
                ctx.fillStyle = 'rgba(7, 13, 23, 0.9)';
                ctx.strokeStyle = canFire ? 'rgba(251, 113, 133, 0.7)' : 'rgba(239, 68, 68, 0.7)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.roundRect(lx, ly - 13, tw + 14, 20, 4);
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = canFire ? '#FFE4E6' : '#FCA5A5';
                ctx.fillText(labelText, lx + 7, ly + 1);
              }
              ctx.restore();
            }
          } else if (cursorRef.current.inside && !rightDragRef.current.active) {
            // Standard 1-click targeting preview (auto-snaps to hovered building or ППО)
            const startPt = map.latLngToContainerPoint([sel.lat, sel.lng]);
            const lockedBuilding = hoveredBuildingIdRef.current
              ? buildingsRef.current.find((b) => b.id === hoveredBuildingIdRef.current) ?? null
              : null;
            const lockedPvo = !lockedBuilding && hoveredPvoIdRef.current
              ? airDefensesRef.current.find(
                  (p) =>
                    p.id === hoveredPvoIdRef.current &&
                    !AIR_DEFENSE_BY_ID[p.airDefenseId].isRadar,
                ) ?? null
              : null;
            const lockedPvoPos = lockedPvo ? getMobilePos(lockedPvo) : null;
            const targetLat = lockedBuilding
              ? lockedBuilding.lat
              : lockedPvoPos
                ? lockedPvoPos.lat
                : cursorRef.current.lat;
            const targetLng = lockedBuilding
              ? lockedBuilding.lng
              : lockedPvoPos
                ? lockedPvoPos.lng
                : cursorRef.current.lng;
            const endPt = lockedBuilding
              ? map.latLngToContainerPoint([lockedBuilding.lat, lockedBuilding.lng])
              : lockedPvoPos
                ? map.latLngToContainerPoint([lockedPvoPos.lat, lockedPvoPos.lng])
                : cursorRef.current;
            const hasLockedEntity = Boolean(lockedBuilding || lockedPvo);

            const hasAmmo = sel.ammo > 0;
            const pathCheck = isFlightPathAllowed(sel.lat, sel.lng, targetLat, targetLng);
            const distKm = haversineDistanceKm(sel.lat, sel.lng, targetLat, targetLng);
            const withinKabLimit = !spec.maxRangeKm || distKm <= spec.maxRangeKm;
            const canFire = hasAmmo && pathCheck.allowed && withinKabLimit;
            const etaSec = distKm / (spec.simSpeedKmPerSec * timeScaleRef.current);

            ctx.save();
            ctx.strokeStyle = canFire ? (hasLockedEntity ? '#EF4444' : spec.accentColor) : '#EF4444';
            ctx.lineWidth = hasLockedEntity ? 2 : 1.75;
            ctx.setLineDash([7, 5]);
            ctx.beginPath();
            ctx.moveTo(startPt.x, startPt.y);
            ctx.lineTo(endPt.x, endPt.y);
            ctx.stroke();
            ctx.setLineDash([]);

            // Blast radius indicator ring only when targeting open terrain
            if (!hasLockedEntity) {
              const blastKm = spec.blastRadiusKm;
              const blastPx = getPixelRadiusKm(map, targetLat, targetLng, blastKm);
              ctx.strokeStyle = canFire ? 'rgba(239, 68, 68, 0.42)' : 'rgba(239, 68, 68, 0.25)';
              ctx.lineWidth = 1;
              ctx.setLineDash([3, 3]);
              ctx.beginPath();
              ctx.arc(endPt.x, endPt.y, blastPx, 0, Math.PI * 2);
              ctx.stroke();
              ctx.setLineDash([]);
            }

            ctx.strokeStyle = canFire ? (hasLockedEntity ? '#EF4444' : spec.accentColor) : '#EF4444';
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.arc(endPt.x, endPt.y, hasLockedEntity ? 14 : 11, 0, Math.PI * 2);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(endPt.x - 16, endPt.y);
            ctx.lineTo(endPt.x - 6, endPt.y);
            ctx.moveTo(endPt.x + 6, endPt.y);
            ctx.lineTo(endPt.x + 16, endPt.y);
            ctx.moveTo(endPt.x, endPt.y - 16);
            ctx.lineTo(endPt.x, endPt.y - 6);
            ctx.moveTo(endPt.x, endPt.y + 6);
            ctx.lineTo(endPt.x, endPt.y + 16);
            ctx.stroke();

            const labelText = !hasAmmo
              ? `Боекомплект 0/${sel.maxAmmo}`
              : !pathCheck.allowed
                ? 'Вне зоны UA / RU'
                : !withinKabLimit
                  ? `Превышен лимит КАБ: ${Math.round(distKm)} / ${spec.maxRangeKm} км`
                  : lockedBuilding
                    ? (() => {
                        const bSpec = BUILDING_BY_ID[lockedBuilding.buildingId];
                        const afterHp = Math.max(0, Math.ceil(lockedBuilding.hp - spec.damage));
                        return `Цель: ${bSpec.shortName} (${Math.ceil(lockedBuilding.hp)}→${afterHp} HP) · Урон ${spec.damage}`;
                      })()
                    : lockedPvo
                      ? (() => {
                          const pSpec = AIR_DEFENSE_BY_ID[lockedPvo.airDefenseId];
                          const afterHp = Math.max(0, Math.ceil(lockedPvo.hp - spec.damage));
                          return `Цель ППО: ${pSpec.shortName} (${Math.ceil(lockedPvo.hp)}→${afterHp} HP) · Урон ${spec.damage}`;
                        })()
                      : `${Math.round(distKm)} км · ~${etaSec.toFixed(1)} с · Урон ${spec.damage}`;
            ctx.font = '600 11px "JetBrains Mono", monospace';
            const tw = ctx.measureText(labelText).width;
            const lx = endPt.x + 18;
            const ly = endPt.y - 22;
            ctx.fillStyle = 'rgba(7, 13, 23, 0.9)';
            ctx.strokeStyle = canFire
              ? hasLockedEntity
                ? 'rgba(239, 68, 68, 0.75)'
                : 'rgba(148, 163, 184, 0.35)'
              : 'rgba(239, 68, 68, 0.6)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(lx, ly - 13, tw + 14, 20, 4);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = canFire ? (hasLockedEntity ? '#FECACA' : '#F8FAFC') : '#FCA5A5';
            ctx.fillText(labelText, lx + 7, ly + 1);
            ctx.restore();
          }
        }
      }

      // 3.5. Render Russian Airfield 2-step launch preview when an airfield is selected
      if (selectedAirfieldRef.current && !pendingRef.current) {
        const af = airfieldsRef.current.find((a) => a.id === selectedAirfieldRef.current);
        if (af) {
          const aircraftSpec = RUSSIAN_AIRCRAFT_BY_ID[af.selectedAircraftId];
          const missileSpec = MUNITION_BY_ID[aircraftSpec.missileId];
          const salvoCount = Math.max(
            1,
            Math.min(aircraftSpec.missileCount, af.salvoCount || aircraftSpec.missileCount),
          );
          const startPt = map.latLngToContainerPoint([af.lat, af.lng]);
          const launchPt = airfieldLaunchPointRef.current;

          if (!launchPt) {
            if (cursorRef.current.inside && !rightDragRef.current.active) {
              const targetLat = cursorRef.current.lat;
              const targetLng = cursorRef.current.lng;
              const endPt = cursorRef.current;
              const pathCheck = isFlightPathAllowed(af.lat, af.lng, targetLat, targetLng);
              const distKm = haversineDistanceKm(af.lat, af.lng, targetLat, targetLng);
              const canFly = pathCheck.allowed && distKm >= 8;

              ctx.save();
              ctx.strokeStyle = canFly ? aircraftSpec.accentColor : '#EF4444';
              ctx.lineWidth = 2;
              ctx.setLineDash([7, 5]);
              ctx.beginPath();
              ctx.moveTo(startPt.x, startPt.y);
              ctx.lineTo(endPt.x, endPt.y);
              ctx.stroke();
              ctx.setLineDash([]);

              ctx.strokeStyle = canFly ? aircraftSpec.accentColor : '#EF4444';
              ctx.lineWidth = 1.8;
              ctx.beginPath();
              ctx.arc(endPt.x, endPt.y, 11, 0, Math.PI * 2);
              ctx.stroke();

              const labelText = !pathCheck.allowed
                ? 'Вне зоны UA / RU'
                : `Шаг 1: точка пуска ${aircraftSpec.shortName} (${Math.round(distKm)} км)`;
              ctx.font = '600 11px "JetBrains Mono", monospace';
              const tw = ctx.measureText(labelText).width;
              const lx = endPt.x + 18;
              const ly = endPt.y - 20;
              ctx.fillStyle = 'rgba(7, 13, 23, 0.9)';
              ctx.strokeStyle = canFly ? aircraftSpec.accentColor : 'rgba(239, 68, 68, 0.65)';
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.roundRect(lx, ly - 13, tw + 14, 20, 4);
              ctx.fill();
              ctx.stroke();
              ctx.fillStyle = canFly ? '#F8FAFC' : '#FCA5A5';
              ctx.fillText(labelText, lx + 7, ly + 1);
              ctx.restore();
            }
          } else {
            const launchCanvasPt = map.latLngToContainerPoint([launchPt.lat, launchPt.lng]);
            ctx.save();
            ctx.strokeStyle = aircraftSpec.accentColor;
            ctx.lineWidth = 2.2;
            ctx.beginPath();
            ctx.moveTo(startPt.x, startPt.y);
            ctx.lineTo(launchCanvasPt.x, launchCanvasPt.y);
            ctx.stroke();

            ctx.fillStyle = '#0A1322';
            ctx.strokeStyle = aircraftSpec.accentColor;
            ctx.lineWidth = 2.2;
            ctx.beginPath();
            ctx.arc(launchCanvasPt.x, launchCanvasPt.y, 9, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            ctx.font = '700 10px "JetBrains Mono", monospace';
            const lTag = `ПУСК ${salvoCount}× ${missileSpec.shortName}`;
            const ltw = ctx.measureText(lTag).width;
            ctx.fillStyle = 'rgba(7, 13, 23, 0.92)';
            ctx.beginPath();
            ctx.roundRect(launchCanvasPt.x - ltw / 2 - 6, launchCanvasPt.y - 28, ltw + 12, 16, 3);
            ctx.fill();
            ctx.fillStyle = '#F8FAFC';
            ctx.fillText(lTag, launchCanvasPt.x - ltw / 2, launchCanvasPt.y - 16.5);

            const mWps = airfieldMissileWaypointsRef.current;
            const fullMissilePts: RoutePoint[] = [launchPt, ...mWps];
            const totalMissileKm = computeRouteLengthKm(fullMissilePts);

            if (fullMissilePts.length > 1) {
              ctx.strokeStyle = missileSpec.accentColor;
              ctx.lineWidth = 2.2;
              ctx.beginPath();
              const p0 = map.latLngToContainerPoint([fullMissilePts[0].lat, fullMissilePts[0].lng]);
              ctx.moveTo(p0.x, p0.y);
              for (let i = 1; i < fullMissilePts.length; i++) {
                const pi = map.latLngToContainerPoint([fullMissilePts[i].lat, fullMissilePts[i].lng]);
                ctx.lineTo(pi.x, pi.y);
              }
              ctx.stroke();
            }

            for (let i = 0; i < mWps.length; i++) {
              const wpPt = map.latLngToContainerPoint([mWps[i].lat, mWps[i].lng]);
              const isLast = i === mWps.length - 1;
              ctx.fillStyle = isLast ? '#EF4444' : '#0A1322';
              ctx.strokeStyle = isLast ? '#FCA5A5' : missileSpec.accentColor;
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.arc(wpPt.x, wpPt.y, 9, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();

              ctx.font = '700 10px "JetBrains Mono", monospace';
              ctx.fillStyle = '#FFFFFF';
              const numStr = String(i + 1);
              const nw = ctx.measureText(numStr).width;
              ctx.fillText(numStr, wpPt.x - nw / 2, wpPt.y + 3.5);
            }

            if (cursorRef.current.inside && !rightDragRef.current.active) {
              const prevGeo = fullMissilePts[fullMissilePts.length - 1];
              const prevCanvasPt = map.latLngToContainerPoint([prevGeo.lat, prevGeo.lng]);
              const lockedBuilding = hoveredBuildingIdRef.current
                ? buildingsRef.current.find((b) => b.id === hoveredBuildingIdRef.current) ?? null
                : null;
              const lockedPvo = !lockedBuilding && hoveredPvoIdRef.current
                ? airDefensesRef.current.find(
                    (p) =>
                      p.id === hoveredPvoIdRef.current &&
                      !AIR_DEFENSE_BY_ID[p.airDefenseId].isRadar,
                  ) ?? null
                : null;
              const lockedPvoPos = lockedPvo ? getMobilePos(lockedPvo) : null;
              const targetLat = lockedBuilding
                ? lockedBuilding.lat
                : lockedPvoPos
                  ? lockedPvoPos.lat
                  : cursorRef.current.lat;
              const targetLng = lockedBuilding
                ? lockedBuilding.lng
                : lockedPvoPos
                  ? lockedPvoPos.lng
                  : cursorRef.current.lng;
              const endPt = lockedBuilding
                ? map.latLngToContainerPoint([lockedBuilding.lat, lockedBuilding.lng])
                : lockedPvoPos
                  ? map.latLngToContainerPoint([lockedPvoPos.lat, lockedPvoPos.lng])
                  : cursorRef.current;
              const hasLockedEntity = Boolean(lockedBuilding || lockedPvo);

              const pathCheck = isFlightPathAllowed(
                prevGeo.lat,
                prevGeo.lng,
                targetLat,
                targetLng,
              );
              const segKm = haversineDistanceKm(
                prevGeo.lat,
                prevGeo.lng,
                targetLat,
                targetLng,
              );
              const mDistKm = totalMissileKm + segKm;
              const canFire = pathCheck.allowed && segKm >= 6;

              ctx.strokeStyle = canFire ? missileSpec.accentColor : '#EF4444';
              ctx.lineWidth = hasLockedEntity ? 2.1 : 1.85;
              ctx.setLineDash([6, 4]);
              ctx.beginPath();
              ctx.moveTo(prevCanvasPt.x, prevCanvasPt.y);
              ctx.lineTo(endPt.x, endPt.y);
              ctx.stroke();
              ctx.setLineDash([]);

              if (!hasLockedEntity) {
                const blastPx = getPixelRadiusKm(map, targetLat, targetLng, missileSpec.blastRadiusKm);
                ctx.strokeStyle = canFire ? 'rgba(239, 68, 68, 0.42)' : 'rgba(239, 68, 68, 0.25)';
                ctx.lineWidth = 1;
                ctx.setLineDash([3, 3]);
                ctx.beginPath();
                ctx.arc(endPt.x, endPt.y, blastPx, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
              }

              ctx.strokeStyle = canFire ? (hasLockedEntity ? '#EF4444' : missileSpec.accentColor) : '#EF4444';
              ctx.lineWidth = 1.7;
              ctx.beginPath();
              ctx.arc(endPt.x, endPt.y, hasLockedEntity ? 14 : 11, 0, Math.PI * 2);
              ctx.stroke();

              const labelText = !pathCheck.allowed
                ? 'Вне зоны UA / RU'
                : lockedBuilding
                  ? (() => {
                      const bSpec = BUILDING_BY_ID[lockedBuilding.buildingId];
                      const afterHp = Math.max(
                        0,
                        Math.ceil(lockedBuilding.hp - missileSpec.damage * salvoCount),
                      );
                      return `+Точка ${mWps.length + 1}: ${salvoCount}× ${missileSpec.shortName} → ${bSpec.shortName} (${Math.ceil(lockedBuilding.hp)}→${afterHp} HP)`;
                    })()
                  : lockedPvo
                    ? (() => {
                        const pSpec = AIR_DEFENSE_BY_ID[lockedPvo.airDefenseId];
                        const afterHp = Math.max(
                          0,
                          Math.ceil(lockedPvo.hp - missileSpec.damage * salvoCount),
                        );
                        return `+Точка ${mWps.length + 1}: ${salvoCount}× ${missileSpec.shortName} → ППО ${pSpec.shortName} (${Math.ceil(lockedPvo.hp)}→${afterHp} HP)`;
                      })()
                    : `+Точка ${mWps.length + 1} маршрута (${Math.round(mDistKm)} км · ${salvoCount}× ${missileSpec.shortName})`;
              ctx.font = '600 11px "JetBrains Mono", monospace';
              const tw = ctx.measureText(labelText).width;
              const lx = endPt.x + 18;
              const ly = endPt.y - 22;
              ctx.fillStyle = 'rgba(7, 13, 23, 0.9)';
              ctx.strokeStyle = canFire ? 'rgba(249, 115, 22, 0.7)' : 'rgba(239, 68, 68, 0.7)';
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.roundRect(lx, ly - 13, tw + 14, 20, 4);
              ctx.fill();
              ctx.stroke();
              ctx.fillStyle = canFire ? '#F8FAFC' : '#FCA5A5';
              ctx.fillText(labelText, lx + 7, ly + 1);
            }
            ctx.restore();
          }
        }
      }

      // 3.8. Render selected airborne flight route-change preview (1-click redirect or multi-waypoint)
      if (selectedFlightRef.current && !pendingRef.current) {
        const selFlt = flightsRef.current.find((f) => f.id === selectedFlightRef.current);
        if (selFlt && isFlightVisible(selFlt)) {
          const spec = MUNITION_BY_ID[selFlt.munitionId];
          const curFlightPt = map.latLngToContainerPoint([selFlt.lat, selFlt.lng]);

          if (plottingFlightRef.current) {
            const wps = flightWaypointsRef.current;
            const rawPts: RoutePoint[] = [{ lat: selFlt.lat, lng: selFlt.lng }, ...wps];
            const totalRouteKm = computeRouteLengthKm(rawPts);

            ctx.save();
            if (rawPts.length > 1) {
              ctx.strokeStyle = '#38BDF8';
              ctx.lineWidth = 2.2;
              ctx.beginPath();
              ctx.moveTo(curFlightPt.x, curFlightPt.y);
              for (let i = 1; i < rawPts.length; i++) {
                const pNext = map.latLngToContainerPoint([rawPts[i].lat, rawPts[i].lng]);
                ctx.lineTo(pNext.x, pNext.y);
              }
              ctx.stroke();
            }

            for (let i = 0; i < wps.length; i++) {
              const wpPt = map.latLngToContainerPoint([wps[i].lat, wps[i].lng]);
              const isLast = i === wps.length - 1;
              ctx.fillStyle = isLast ? '#EF4444' : '#0A1322';
              ctx.strokeStyle = isLast ? '#FCA5A5' : '#38BDF8';
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.arc(wpPt.x, wpPt.y, 9, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();

              ctx.font = '700 10px "JetBrains Mono", monospace';
              ctx.fillStyle = '#FFFFFF';
              const numStr = String(i + 1);
              const nw = ctx.measureText(numStr).width;
              ctx.fillText(numStr, wpPt.x - nw / 2, wpPt.y + 3.5);
            }

            if (cursorRef.current.inside && !rightDragRef.current.active) {
              const lastGeo = rawPts[rawPts.length - 1];
              const lastPt = map.latLngToContainerPoint([lastGeo.lat, lastGeo.lng]);
              const cur = cursorRef.current;
              const segCheck = isFlightPathAllowed(lastGeo.lat, lastGeo.lng, cur.lat, cur.lng);
              const segKm = haversineDistanceKm(lastGeo.lat, lastGeo.lng, cur.lat, cur.lng);
              const nextTotalKm = totalRouteKm + segKm;
              const overKab = Boolean(spec.maxRangeKm && nextTotalKm > spec.maxRangeKm);
              const routeValid = segCheck.allowed && !overKab;

              ctx.strokeStyle = routeValid ? '#38BDF8' : '#EF4444';
              ctx.lineWidth = 1.6;
              ctx.setLineDash([6, 5]);
              ctx.beginPath();
              ctx.moveTo(lastPt.x, lastPt.y);
              ctx.lineTo(cur.x, cur.y);
              ctx.stroke();
              ctx.setLineDash([]);

              ctx.beginPath();
              ctx.arc(cur.x, cur.y, 9, 0, Math.PI * 2);
              ctx.stroke();

              const labelText = !segCheck.allowed
                ? 'Вне зоны UA / RU'
                : overKab
                  ? `Лимит КАБ: ${Math.round(nextTotalKm)} / ${spec.maxRangeKm} км`
                  : `+Точка ${wps.length + 1} · Новый курс ${Math.round(nextTotalKm)} км`;
              ctx.font = '600 11px "JetBrains Mono", monospace';
              const tw = ctx.measureText(labelText).width;
              const lx = cur.x + 15;
              const ly = cur.y - 16;
              ctx.fillStyle = 'rgba(7, 13, 23, 0.92)';
              ctx.strokeStyle = routeValid ? '#38BDF8' : 'rgba(239, 68, 68, 0.7)';
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.roundRect(lx, ly - 13, tw + 14, 20, 4);
              ctx.fill();
              ctx.stroke();
              ctx.fillStyle = routeValid ? '#E0F2FE' : '#FCA5A5';
              ctx.fillText(labelText, lx + 7, ly + 1);
            }
            ctx.restore();
          } else if (
            cursorRef.current.inside &&
            !rightDragRef.current.active &&
            !isManuallySteerableFlight(selFlt)
          ) {
            const lockedBuilding = hoveredBuildingIdRef.current
              ? buildingsRef.current.find((b) => b.id === hoveredBuildingIdRef.current) ?? null
              : null;
            const lockedPvo =
              !lockedBuilding && hoveredPvoIdRef.current
                ? airDefensesRef.current.find(
                    (p) =>
                      p.id === hoveredPvoIdRef.current &&
                      !AIR_DEFENSE_BY_ID[p.airDefenseId].isRadar,
                  ) ?? null
                : null;
            const lockedPvoPos = lockedPvo ? getMobilePos(lockedPvo) : null;
            const targetLat = lockedBuilding
              ? lockedBuilding.lat
              : lockedPvoPos
                ? lockedPvoPos.lat
                : cursorRef.current.lat;
            const targetLng = lockedBuilding
              ? lockedBuilding.lng
              : lockedPvoPos
                ? lockedPvoPos.lng
                : cursorRef.current.lng;
            const endPt = lockedBuilding
              ? map.latLngToContainerPoint([lockedBuilding.lat, lockedBuilding.lng])
              : lockedPvoPos
                ? map.latLngToContainerPoint([lockedPvoPos.lat, lockedPvoPos.lng])
                : cursorRef.current;

            const pathCheck = isFlightPathAllowed(selFlt.lat, selFlt.lng, targetLat, targetLng);
            const distKm = haversineDistanceKm(selFlt.lat, selFlt.lng, targetLat, targetLng);
            const overKab = Boolean(spec.maxRangeKm && distKm > spec.maxRangeKm);
            const canRedirect = pathCheck.allowed && distKm >= 5 && !overKab;

            ctx.save();
            ctx.strokeStyle = canRedirect ? '#38BDF8' : '#EF4444';
            ctx.lineWidth = 1.8;
            ctx.setLineDash([6, 4]);
            ctx.beginPath();
            ctx.moveTo(curFlightPt.x, curFlightPt.y);
            ctx.lineTo(endPt.x, endPt.y);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.beginPath();
            ctx.arc(endPt.x, endPt.y, lockedBuilding || lockedPvo ? 14 : 10, 0, Math.PI * 2);
            ctx.stroke();

            const labelText = !pathCheck.allowed
              ? 'Вне зоны UA / RU'
              : overKab
                ? `Лимит КАБ ${spec.maxRangeKm} км`
                : lockedBuilding
                  ? `Сменить курс → ${BUILDING_BY_ID[lockedBuilding.buildingId].shortName} (${Math.round(distKm)} км)`
                  : lockedPvo
                    ? `Сменить курс → ППО ${AIR_DEFENSE_BY_ID[lockedPvo.airDefenseId].shortName} (${Math.round(distKm)} км)`
                    : `Новый курс: ${Math.round(distKm)} км`;
            ctx.font = '600 11px "JetBrains Mono", monospace';
            const tw = ctx.measureText(labelText).width;
            const lx = endPt.x + 16;
            const ly = endPt.y - 18;
            ctx.fillStyle = 'rgba(7, 13, 23, 0.92)';
            ctx.strokeStyle = canRedirect ? '#38BDF8' : 'rgba(239, 68, 68, 0.7)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(lx, ly - 13, tw + 14, 20, 4);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = canRedirect ? '#E0F2FE' : '#FCA5A5';
            ctx.fillText(labelText, lx + 7, ly + 1);
            ctx.restore();
          }
        }
      }

      // 4. Render active flight planned multi-waypoint paths & contrails
      for (const flt of flightsRef.current) {
        if (!isFlightVisible(flt)) continue;
        const spec = MUNITION_BY_ID[flt.munitionId];
        const isSelectedFlt = selectedFlightRef.current === flt.id;
        const hideSelectedBlueLines =
          isSelectedFlt && isManuallySteerableFlight(flt);
        const curPt = map.latLngToContainerPoint([flt.lat, flt.lng]);
        const finalGeo = flt.waypoints[flt.waypoints.length - 1];
        const endPt = map.latLngToContainerPoint([finalGeo.lat, finalGeo.lng]);

        ctx.save();
        if (!hideSelectedBlueLines) {
          ctx.strokeStyle = isSelectedFlt ? '#38BDF8CC' : `${spec.accentColor}55`;
          ctx.lineWidth = isSelectedFlt ? 2.1 : 1.25;
          ctx.setLineDash([4, 5]);
          ctx.beginPath();
          ctx.moveTo(curPt.x, curPt.y);
          for (let i = flt.segmentIndex + 1; i < flt.waypoints.length; i++) {
            const wp = map.latLngToContainerPoint([flt.waypoints[i].lat, flt.waypoints[i].lng]);
            ctx.lineTo(wp.x, wp.y);
          }
          ctx.stroke();
          ctx.setLineDash([]);

          // Original turn waypoint markers
          for (let i = 1; i < flt.rawWaypoints.length - 1; i++) {
            const wp = map.latLngToContainerPoint([flt.rawWaypoints[i].lat, flt.rawWaypoints[i].lng]);
            ctx.fillStyle = isSelectedFlt ? '#38BDF8' : spec.accentColor;
            ctx.beginPath();
            ctx.arc(wp.x, wp.y, isSelectedFlt ? 3.5 : 2.5, 0, Math.PI * 2);
            ctx.fill();
          }

          const pulse = 1 + Math.sin(timeSec * 6) * 0.12;
          ctx.strokeStyle = flt.isReturnToBase ? '#38BDF8' : '#EF4444';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(endPt.x, endPt.y, 7.5 * pulse, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = flt.isReturnToBase ? '#38BDF8' : '#EF4444';
          ctx.beginPath();
          ctx.arc(endPt.x, endPt.y, 2, 0, Math.PI * 2);
          ctx.fill();
        }

        if (!flt.kabReleaseDone && flt.carrierMissileWaypoints && flt.carrierMissileWaypoints.length >= 2) {
          ctx.strokeStyle = 'rgba(251, 113, 133, 0.55)';
          ctx.lineWidth = 1.25;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          const m0 = map.latLngToContainerPoint([flt.carrierMissileWaypoints[0].lat, flt.carrierMissileWaypoints[0].lng]);
          ctx.moveTo(m0.x, m0.y);
          for (let i = 1; i < flt.carrierMissileWaypoints.length; i++) {
            const mi = map.latLngToContainerPoint([flt.carrierMissileWaypoints[i].lat, flt.carrierMissileWaypoints[i].lng]);
            ctx.lineTo(mi.x, mi.y);
          }
          ctx.stroke();
          ctx.setLineDash([]);
          const mLast = map.latLngToContainerPoint([
            flt.carrierMissileWaypoints[flt.carrierMissileWaypoints.length - 1].lat,
            flt.carrierMissileWaypoints[flt.carrierMissileWaypoints.length - 1].lng,
          ]);
          ctx.strokeStyle = '#FB7185';
          ctx.beginPath();
          ctx.arc(mLast.x, mLast.y, 6, 0, Math.PI * 2);
          ctx.stroke();
        } else if (flt.kabTargetPoint && !flt.kabReleaseDone) {
          const kPt = map.latLngToContainerPoint([flt.kabTargetPoint.lat, flt.kabTargetPoint.lng]);
          ctx.strokeStyle = 'rgba(251, 113, 133, 0.55)';
          ctx.lineWidth = 1.25;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(endPt.x, endPt.y);
          ctx.lineTo(kPt.x, kPt.y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.strokeStyle = '#FB7185';
          ctx.beginPath();
          ctx.arc(kPt.x, kPt.y, 6, 0, Math.PI * 2);
          ctx.stroke();
        }

        if (flt.trail.length > 1) {
          for (let i = 1; i < flt.trail.length; i++) {
            const p0 = map.latLngToContainerPoint([flt.trail[i - 1].lat, flt.trail[i - 1].lng]);
            const p1 = map.latLngToContainerPoint([flt.trail[i].lat, flt.trail[i].lng]);
            const ratio = i / flt.trail.length;
            ctx.strokeStyle =
              spec.profile === 'ballistic'
                ? `rgba(254, 240, 138, ${ratio * 0.65})`
                : spec.profile === 'prop-drone'
                  ? `rgba(203, 213, 225, ${ratio * 0.38})`
                  : `rgba(226, 232, 240, ${ratio * 0.58})`;
            ctx.lineWidth = spec.profile === 'ballistic' ? 2.6 * ratio : 1.7 * ratio;
            ctx.beginPath();
            ctx.moveTo(p0.x, p0.y);
            ctx.lineTo(p1.x, p1.y);
            ctx.stroke();
          }
        }
        ctx.restore();
      }

      // 5. Render SAM interceptor trails, missiles & compact small-caliber MG bullets
      for (const sam of interceptorsRef.current) {
        const pt = map.latLngToContainerPoint([sam.lat, sam.lng]);
        const isSmallBullet = sam.airDefenseId === 'mg-pickup';
        if (sam.trail.length > 1) {
          ctx.save();
          for (let i = 1; i < sam.trail.length; i++) {
            const p0 = map.latLngToContainerPoint([sam.trail[i - 1].lat, sam.trail[i - 1].lng]);
            const p1 = map.latLngToContainerPoint([sam.trail[i].lat, sam.trail[i].lng]);
            const ratio = i / sam.trail.length;
            ctx.strokeStyle = isSmallBullet
              ? `rgba(253, 224, 71, ${ratio * 0.72})`
              : sam.isGun
                ? `rgba(254, 240, 138, ${ratio * 0.55})`
                : `rgba(241, 245, 249, ${ratio * 0.72})`;
            ctx.lineWidth = isSmallBullet ? 1.0 : sam.isGun ? 1.4 : 1.8 * ratio;
            ctx.beginPath();
            ctx.moveTo(p0.x, p0.y);
            ctx.lineTo(p1.x, p1.y);
            ctx.stroke();
          }
          ctx.restore();
        }
        const headingRad = ((sam.visualHeadingDeg - 90) * Math.PI) / 180;
        drawSamInterceptor(
          ctx,
          pt.x,
          pt.y,
          headingRad,
          sam.isGun,
          sam.accentColor,
          isSmallBullet,
        );
      }

      // 5.5. Render placed buildings & infrastructure objects
      const bScale = buildingScaleRef.current;
      for (const b of buildingsRef.current) {
        const pt = map.latLngToContainerPoint([b.lat, b.lng]);
        const spec = BUILDING_BY_ID[b.buildingId];
        const isHov = hoveredBuildingIdRef.current === b.id;
        const isTargetLocked =
          isHov &&
          Boolean(
            (selectedRef.current ||
              selectedFlightRef.current ||
              (selectedAirfieldRef.current && airfieldLaunchPointRef.current)) &&
              !pendingRef.current &&
              !plottingRef.current,
          );

        drawBuilding(ctx, pt.x, pt.y, spec, {
          hp: b.hp,
          maxHp: b.maxHp,
          scale: bScale,
          hovered: isHov,
          isTargetLocked,
          timeSec,
        });

        if (isHov && !isTargetLocked) {
          ctx.save();
          ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
          const tag = `${spec.name} · ${Math.ceil(b.hp)}/${b.maxHp} HP`;
          const tw = ctx.measureText(tag).width;
          const labelY = pt.y - 22 * bScale - 20;
          ctx.fillStyle = 'rgba(7, 13, 23, 0.9)';
          ctx.strokeStyle = spec.accentColor;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(pt.x - tw / 2 - 7, labelY, tw + 14, 19, 4);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#F8FAFC';
          ctx.fillText(tag, pt.x - tw / 2, labelY + 13);
          ctx.restore();
        }
      }

      // 6. Render placed strike launchers
      for (const l of launchersRef.current) {
        const pt = map.latLngToContainerPoint([l.lat, l.lng]);
        const spec = MUNITION_BY_ID[l.munitionId];
        const isSel = selectedRef.current === l.id;
        const isHov = hoveredLauncherIdRef.current === l.id;

        let aimRad = ((l.headingDeg - 90) * Math.PI) / 180;
        if (isSel && cursorRef.current.inside && !pendingRef.current && l.ammo > 0) {
          aimRad = Math.atan2(cursorRef.current.y - pt.y, cursorRef.current.x - pt.x);
        }

        const sinceLaunch = (Date.now() - l.lastLaunchAt) / 1000;
        const reloadProgress = Math.min(1, sinceLaunch / 0.5);

        drawLauncher(ctx, pt.x, pt.y, spec, {
          selected: isSel,
          hovered: isHov,
          aimAngleRad: aimRad,
          reloadingProgress: reloadProgress,
          ammo: l.ammo,
          maxAmmo: l.maxAmmo,
          timeSec,
        });

        if (isSel || isHov) {
          ctx.save();
          ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
          const tag = l.isAi ? `ПУ ИИ · ${spec.shortName}` : `ПУ · ${spec.shortName}`;
          const tw = ctx.measureText(tag).width;
          ctx.fillStyle = 'rgba(7, 13, 23, 0.88)';
          ctx.strokeStyle = isSel ? spec.accentColor : 'rgba(148, 163, 184, 0.4)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(pt.x - tw / 2 - 7, pt.y - 42, tw + 14, 19, 4);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#F8FAFC';
          ctx.fillText(tag, pt.x - tw / 2, pt.y - 29);
          ctx.restore();
        }
      }

      // 6.5. Render placed Russian airfields
      for (const af of airfieldsRef.current) {
        const pt = map.latLngToContainerPoint([af.lat, af.lng]);
        const aircraftSpec = RUSSIAN_AIRCRAFT_BY_ID[af.selectedAircraftId];
        const missileSpec = MUNITION_BY_ID[aircraftSpec.missileId];
        const isSel = selectedAirfieldRef.current === af.id;
        const isHov = hoveredAirfieldIdRef.current === af.id;
        const salvo = Math.max(1, Math.min(aircraftSpec.missileCount, af.salvoCount || aircraftSpec.missileCount));

        drawAirfield(ctx, pt.x, pt.y, {
          name: af.name,
          aircraftId: af.selectedAircraftId,
          aircraftShortName: aircraftSpec.shortName,
          missileShortName: missileSpec.shortName,
          salvoCount: salvo,
          accentColor: aircraftSpec.accentColor,
          selected: isSel,
          hovered: isHov,
          timeSec,
        });

        if (isSel || isHov) {
          ctx.save();
          ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
          const tag = af.isAi ? `База РФ · ${af.name}` : `Аэродром · ${af.name}`;
          const tw = ctx.measureText(tag).width;
          ctx.fillStyle = 'rgba(7, 13, 23, 0.9)';
          ctx.strokeStyle = isSel ? aircraftSpec.accentColor : 'rgba(249, 115, 22, 0.55)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(pt.x - tw / 2 - 7, pt.y - 44, tw + 14, 19, 4);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#F8FAFC';
          ctx.fillText(tag, pt.x - tw / 2, pt.y - 31);
          ctx.restore();
        }
      }

      // 7. Render flying Shaheds, missiles & carrier aircraft with smooth banking heading
      for (const flt of flightsRef.current) {
        if (!isFlightVisible(flt)) continue;
        const detectedByRadar = isFlightDetected(flt);
        const altMode = getFlightAltitudeMode(flt);
        const spec = MUNITION_BY_ID[flt.munitionId];
        const pt = map.latLngToContainerPoint([flt.lat, flt.lng]);
        const headingRad = ((flt.visualHeadingDeg - 90) * Math.PI) / 180;
        const totalProg = Math.min(1, flt.coveredKm / Math.max(1, flt.totalDistanceKm));
        const remKm = Math.max(0, Math.round(flt.totalDistanceKm - flt.coveredKm));
        const isSelFlt = selectedFlightRef.current === flt.id;
        const isHovFlt = hoveredFlightIdRef.current === flt.id;
        const isFollowFlt = followCamFlightIdRef.current === flt.id;

        if (
          (isSelFlt || isHovFlt) &&
          !isFollowFlt &&
          !(isSelFlt && isManuallySteerableFlight(flt))
        ) {
          ctx.save();
          ctx.strokeStyle = isSelFlt ? '#38BDF8' : 'rgba(56, 189, 248, 0.65)';
          ctx.lineWidth = isSelFlt ? 2 : 1.3;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, isSelFlt ? 18 : 15, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        if (flt.carrierAircraftId) {
          const aircraftSpec = RUSSIAN_AIRCRAFT_BY_ID[flt.carrierAircraftId];
          drawFlyingCarrierAircraft(
            ctx,
            pt.x,
            pt.y,
            headingRad,
            aircraftSpec,
            totalProg,
            !flt.isReturnToBase,
            timeSec,
          );
          ctx.save();
          ctx.font = '600 10px "JetBrains Mono", monospace';
          const tag = flt.isReturnToBase
            ? `${aircraftSpec.shortName} (возврат) · ${remKm} км`
            : `${aircraftSpec.shortName} (${flt.carrierMissileCount ?? aircraftSpec.missileCount}× ${spec.shortName}) · ${remKm} км`;
          const tw = ctx.measureText(tag).width;
          ctx.fillStyle = 'rgba(7, 13, 23, 0.85)';
          ctx.beginPath();
          ctx.roundRect(pt.x - tw / 2 - 5, pt.y - 31, tw + 10, 16, 3);
          ctx.fill();
          ctx.fillStyle = flt.isReturnToBase ? '#7DD3FC' : aircraftSpec.accentColor;
          ctx.fillText(tag, pt.x - tw / 2, pt.y - 20);
          ctx.restore();
        } else {
          drawFlyingMunition(
            ctx,
            pt.x,
            pt.y,
            headingRad,
            spec,
            totalProg,
            timeSec,
            altMode !== 'normal',
            altMode === 'low' && detectedByRadar,
            altMode,
          );

          ctx.save();
          ctx.font = '600 10px "JetBrains Mono", monospace';
          const tag = flt.isReturnToBase
            ? `Су-57 (возврат) · ${remKm} км`
            : altMode === 'ultra-low'
              ? `${spec.shortName} · Сверхнизко (вне РЛС) · ${remKm} км`
              : altMode === 'low'
                ? `${spec.shortName} · РЛС · ${remKm} км`
                : `${spec.shortName} · ${remKm} км`;
          const tw = ctx.measureText(tag).width;
          ctx.fillStyle = 'rgba(7, 13, 23, 0.82)';
          ctx.beginPath();
          ctx.roundRect(pt.x - tw / 2 - 5, pt.y - 29, tw + 10, 16, 3);
          ctx.fill();
          ctx.fillStyle = flt.isReturnToBase
            ? '#7DD3FC'
            : altMode === 'ultra-low'
              ? '#C4B5FD'
              : altMode === 'low'
                ? '#67E8F9'
                : spec.accentColor;
          ctx.fillText(tag, pt.x - tw / 2, pt.y - 18);
          ctx.restore();
        }
      }

      // 8. Placement ghost preview following cursor
      if (pendingRef.current && cursorRef.current.inside && !rightDragRef.current.active) {
        const territory = getTerritoryAt(cursorRef.current.lat, cursorRef.current.lng);
        let valid = territory !== null;
        let tip = '';

        if (pendingRef.current.kind === 'strike') {
          const spec = MUNITION_BY_ID[pendingRef.current.id];
          const placeCheck = isFactionPlacementAllowed(
            spec.faction,
            cursorRef.current.lat,
            cursorRef.current.lng,
          );
          valid = placeCheck.allowed;
          drawLauncher(ctx, cursorRef.current.x, cursorRef.current.y, spec, {
            isPreview: true,
            previewValid: valid,
            timeSec,
          });
          tip = !valid
            ? spec.faction === 'UA'
              ? 'Только подконтрольная Украина'
              : 'Только РФ и оккуп. территории'
            : `Установить ПУ (${spec.faction === 'UA' ? 'Украина' : territory === 'RU' ? 'Россия' : 'Оккуп. территория'}) · ${spec.maxAmmo} пусков`;
        } else if (pendingRef.current.kind === 'airfield') {
          const placeCheck = isFactionPlacementAllowed(
            'RU',
            cursorRef.current.lat,
            cursorRef.current.lng,
          );
          valid = placeCheck.allowed;
          drawAirfield(ctx, cursorRef.current.x, cursorRef.current.y, {
            name: 'База',
            aircraftId: 'mig31k',
            aircraftShortName: 'МиГ-31К',
            missileShortName: 'Кинжал',
            salvoCount: 1,
            accentColor: '#F97316',
            isPreview: true,
            previewValid: valid,
            timeSec,
          });
          tip = valid
            ? `Поставить аэродром ВКС РФ (${territory === 'RU' ? 'Россия' : 'Оккуп. территория'})`
            : 'Только РФ и оккуп. территории';
        } else if (pendingRef.current.kind === 'pvo') {
          const spec = AIR_DEFENSE_BY_ID[pendingRef.current.id];
          const rangePx = getPixelRadiusKm(
            map,
            cursorRef.current.lat,
            cursorRef.current.lng,
            spec.rangeKm,
          );
          drawAirDefenseUnit(ctx, cursorRef.current.x, cursorRef.current.y, rangePx, spec, {
            isPreview: true,
            previewValid: valid,
            timeSec,
          });
          tip = !valid
            ? 'Только Украина или Россия'
            : spec.isRadar
              ? `Установить ${spec.shortName} (${territory === 'UA' ? 'Украина' : 'Россия'}) · Обзор ${spec.rangeKm} км (+45% для ППО)`
              : `Установить ППО ${spec.shortName} (${territory === 'UA' ? 'Украина' : 'Россия'}) · ${spec.rangeKm} км`;
        } else {
          const spec = BUILDING_BY_ID[pendingRef.current.id];
          drawBuilding(ctx, cursorRef.current.x, cursorRef.current.y, spec, {
            scale: buildingScaleRef.current,
            isPreview: true,
            previewValid: valid,
            timeSec,
          });
          tip = valid
            ? `Поставить: ${spec.shortName} (${territory === 'UA' ? 'Украина' : 'Россия'})`
            : 'Только Украина или Россия';
        }

        ctx.save();
        ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
        const tw = ctx.measureText(tip).width;
        const tx = cursorRef.current.x + 26;
        const ty = cursorRef.current.y - 10;
        ctx.fillStyle = 'rgba(7, 13, 23, 0.9)';
        ctx.strokeStyle = valid ? 'rgba(34, 197, 94, 0.65)' : 'rgba(239, 68, 68, 0.7)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(tx, ty - 13, tw + 14, 21, 4);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = valid ? '#BBF7D0' : '#FCA5A5';
        ctx.fillText(tip, tx + 7, ty + 1);
        ctx.restore();
      }

      // 9. Falling bombs, mid-air interception bursts & ground explosions
      for (const bomb of fallingBombsRef.current) {
        const pt = map.latLngToContainerPoint([bomb.lat, bomb.lng]);
        const headRad = ((bomb.headingDeg - 90) * Math.PI) / 180;
        drawFallingBomb(ctx, pt.x, pt.y, headRad, bomb.age / bomb.fallDuration);
      }

      for (const b of interceptBurstsRef.current) {
        const pt = map.latLngToContainerPoint([b.lat, b.lng]);
        drawAirInterceptBurst(ctx, pt.x, pt.y, b.age, b.duration, {
          isMiss: b.isMiss,
          isSelfDestruct: b.isSelfDestruct,
          confirmed: b.confirmed,
          pvoShortName: b.pvoShortName,
          targetShortName: b.targetShortName,
          accentColor: b.accentColor,
        });
      }

      for (const exp of explosionsRef.current) {
        const pt = map.latLngToContainerPoint([exp.lat, exp.lng]);
        drawExplosion(ctx, pt.x, pt.y, exp);
      }

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      map.off('dragstart', onDragStart);
      container.removeEventListener('wheel', onWheel);
      container.removeEventListener('mousedown', onMouseDown);
      container.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('mousemove', onWindowMouseMove);
      window.removeEventListener('mouseup', onWindowMouseUp);
      soundFx.updateAirRaidSiren({
        droneRaions: 0,
        missileRaions: 0,
        newlyAlertedDrone: false,
        newlyAlertedMissile: false,
      });
      soundFx.updateInFlightAudio({
        propDrone: 0,
        jetDrone: 0,
        cruiseMissile: 0,
        ballistic: 0,
        samMissile: 0,
        flakGun: 0,
      });
      for (const tId of Object.values(oblastDorozvedkaTimersRef.current)) {
        window.clearTimeout(tId);
      }
      oblastDorozvedkaTimersRef.current = {};
      map.remove();
      mapRef.current = null;
      baseTileLayerRef.current = null;
      labelsLayerRef.current = null;
      russiaRegionsLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const cfg = MAP_STYLES.find((s) => s.id === mapStyle) ?? MAP_STYLES[0];
    prewarmTheaterOverviewTiles(cfg.id, cfg.url, cfg.subdomains);

    if (baseTileLayerRef.current && map.hasLayer(baseTileLayerRef.current)) {
      map.removeLayer(baseTileLayerRef.current);
    }

    const baseLayer = new SmoothCachedTileLayer(
      {
        styleKey: cfg.id,
        url: cfg.url,
        subdomains: cfg.subdomains,
        minZoom: 3,
        maxNativeZoom: cfg.maxNativeZoom,
        maxZoom: 18,
        keepBuffer: 8,
        updateWhenZooming: true,
        updateWhenIdle: false,
        transparent: false,
        zIndex: 1,
      },
      () => zoomAnimRef.current.active,
    );
    baseLayer.addTo(map);
    baseTileLayerRef.current = baseLayer;
  }, [mapStyle]);

  const handleZoomIn = () => {
    soundFx.playUiClick('tap');
    const map = mapRef.current;
    const container = mapContainerRef.current;
    if (!map || !container) return;
    const baseZoom = zoomAnimRef.current.active ? zoomAnimRef.current.targetZoom : map.getZoom();
    zoomAnimRef.current = {
      active: true,
      targetZoom: Math.min(18, baseZoom + 0.85),
      anchorPoint: L.point(container.clientWidth / 2, container.clientHeight / 2),
    };
  };

  const handleZoomOut = () => {
    soundFx.playUiClick('tap');
    const map = mapRef.current;
    const container = mapContainerRef.current;
    if (!map || !container) return;
    const baseZoom = zoomAnimRef.current.active ? zoomAnimRef.current.targetZoom : map.getZoom();
    zoomAnimRef.current = {
      active: true,
      targetZoom: Math.max(3, baseZoom - 0.85),
      anchorPoint: L.point(container.clientWidth / 2, container.clientHeight / 2),
    };
  };

  const handleResetView = () => {
    soundFx.playUiClick('tap');
    zoomAnimRef.current.active = false;
    mapRef.current?.setView(DEFAULT_CENTER, DEFAULT_ZOOM, { animate: false });
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#060C16]">
      <div ref={mapContainerRef} className="h-full w-full z-0" />
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 z-10"
      />

      {/* Map Style Switcher & Navigation Controls */}
      <div className="absolute bottom-4 right-4 z-20 flex items-end gap-2">
        <div
          className="flex items-center gap-0.5 rounded border border-slate-800 bg-[#0A111C]/95 p-0.5"
          role="group"
          aria-label="Слой карты"
        >
          <Globe className="h-3.5 w-3.5 text-slate-400 mx-1.5 shrink-0" />
          {MAP_STYLES.map((st) => (
            <button
              key={st.id}
              type="button"
              onClick={() => {
                soundFx.playUiClick('tab');
                onChangeMapStyle(st.id);
              }}
              title={st.title}
              className={`px-2 py-1 text-[11px] font-medium rounded-xs transition-colors whitespace-nowrap cursor-pointer ${
                mapStyle === st.id
                  ? 'bg-sky-500/20 text-sky-200 border border-sky-500/50'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100 border border-transparent'
              }`}
            >
              {st.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={handleZoomIn}
            title="Приблизить"
            aria-label="Приблизить карту"
            className="flex h-10 w-10 items-center justify-center rounded border border-slate-800 bg-[#0A111C]/95 text-slate-200 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleZoomOut}
            title="Отдалить"
            aria-label="Отдалить карту"
            className="flex h-10 w-10 items-center justify-center rounded border border-slate-800 bg-[#0A111C]/95 text-slate-200 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleResetView}
            title="Центрировать на Украине и России"
            aria-label="Центрировать карту"
            className="flex h-10 w-10 items-center justify-center rounded border border-slate-800 bg-[#0A111C]/95 text-slate-200 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
          >
            <LocateFixed className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Hovered District + Threat Legend */}
      <div className="pointer-events-none absolute bottom-4 left-4 z-20 flex flex-col items-start gap-1.5">
        {hoveredRaion && (
          <div className="flex items-center gap-2 rounded border border-slate-800 bg-[#0A111C]/95 px-3 py-1.5 text-[11px] text-slate-200">
            <span className="font-semibold text-slate-100">{hoveredRaion.meta.name}</span>
            <span className="text-slate-600" aria-hidden="true">·</span>
            <span className="text-slate-400">{hoveredRaion.meta.oblast}</span>
            {hoveredRaion.zoneStatus && showFrontline && (
              <>
                <span className="text-slate-600" aria-hidden="true">·</span>
                <span
                  className={`font-semibold ${
                    hoveredRaion.zoneStatus === 'occupied' ? 'text-red-400' : 'text-pink-400'
                  }`}
                >
                  {hoveredRaion.zoneStatus === 'occupied' ? 'Оккупировано' : 'ОРДЛО / Крым'}
                </span>
              </>
            )}
            {hoveredRaion.threat !== 'none' ? (
              <>
                <span className="text-slate-600" aria-hidden="true">·</span>
                <span
                  className={`font-semibold ${
                    hoveredRaion.threat === 'missile' ||
                    isPermanentAlertRaionId(hoveredRaion.meta.id)
                      ? 'text-red-400'
                      : 'text-yellow-300'
                  }`}
                >
                  {hoveredRaion.threat === 'missile'
                    ? 'Ракетная угроза'
                    : isPermanentAlertRaionId(hoveredRaion.meta.id)
                      ? 'Постоянная тревога'
                      : 'Дроновая угроза'}
                </span>
              </>
            ) : (
              isPermanentAlertRaionId(hoveredRaion.meta.id) && (
                <>
                  <span className="text-slate-600" aria-hidden="true">·</span>
                  <span className="font-semibold text-red-400">Постоянная тревога</span>
                </>
              )
            )}
          </div>
        )}

        <div className="hidden sm:flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-slate-800 bg-[#0A111C]/95 px-3 py-1.5 text-[11px] text-slate-300">
          {showFrontline && (
            <>
              <span className="flex items-center gap-1.5" title={FRONTLINE_DATE_LABEL}>
                <span className="h-2.5 w-3 bg-[#A52714]/80 border border-red-400/70" />
                <span className="text-rose-200 font-medium">Оккупировано</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-3 bg-[#880E4F]/80 border border-pink-400/70" />
                <span className="text-slate-300">Крым/ОРДЛО</span>
              </span>
              <span className="text-slate-500 font-mono-tabular text-[10px]">
                {FRONTLINE_DATE_LABEL}
              </span>
              <span className="text-slate-600" aria-hidden="true">·</span>
            </>
          )}
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-3 bg-yellow-400/85 border border-yellow-200/70" />
            <span>
              Дроны
              {alertCounts.drone > 0 && (
                <strong className="ml-1 font-mono-tabular text-yellow-300">
                  {alertCounts.drone}
                </strong>
              )}
            </span>
          </span>
          <span className="text-slate-600" aria-hidden="true">·</span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-3 bg-red-500/85 border border-red-300/70" />
            <span>
              Ракеты
              {alertCounts.missile > 0 && (
                <strong className="ml-1 font-mono-tabular text-red-400">
                  {alertCounts.missile}
                </strong>
              )}
            </span>
          </span>
          <span className="text-slate-600" aria-hidden="true">·</span>
          <span className="text-slate-400">ЛКМ / ПКМ — управление и курс целей</span>
        </div>
      </div>
    </div>
  );
}
