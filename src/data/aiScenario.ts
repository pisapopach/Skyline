import {
  RUSSIAN_AIRBASE_PRESETS,
  RUSSIAN_AIRCRAFT_BY_ID,
  type RussianAircraftId,
} from './airfields';
import {
  BUILDING_BY_ID,
  type AltitudeMode,
  type BuildingId,
  type MunitionId,
} from './munitions';
import { computeBearingDeg, isFlightPathAllowed } from '../utils/geoBoundaries';
import { isFactionPlacementAllowed } from '../utils/frontline2026';

export interface InitialBuildingTemplate {
  id: string;
  label: string;
  buildingId: BuildingId;
  lat: number;
  lng: number;
}

export interface AiLaunchOrigin {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export interface AiLauncherSpawn {
  id: string;
  munitionId: MunitionId;
  lat: number;
  lng: number;
  ammo: number;
  headingDeg: number;
  originName: string;
}

export interface AiWaveStrikeOrder {
  launcherId: string;
  munitionId: MunitionId;
  lowAltitude?: boolean;
  altitudeMode?: AltitudeMode;
  climbAtProgress?: number;
  postClimbAltitudeMode?: AltitudeMode;
  waypoints: Array<{ lat: number; lng: number }>;
  targetBuildingId?: string;
  targetPvoId?: string;
  delaySec: number;
  originName: string;
}

export interface AiAirfieldSortieOrder {
  airfieldPresetId: string;
  aircraftId: RussianAircraftId;
  missileCount: number;
  launchPoint: { lat: number; lng: number };
  missileWaypoints: Array<{ lat: number; lng: number }>;
  targetBuildingId?: string;
  targetPvoId?: string;
  delaySec: number;
}

export const AI_STARTING_MONEY = 750;
export const AI_FIRST_WAVE_PREP_SEC = 10;

export const INITIAL_AI_BUILDINGS: InitialBuildingTemplate[] = [
  { id: 'ai_bldg_kyiv', label: 'Киев (ТЭС)', buildingId: 'power-plant', lat: 50.4501, lng: 30.5234 },
  { id: 'ai_bldg_kharkiv', label: 'Харьков (Завод)', buildingId: 'factory', lat: 49.9935, lng: 36.2304 },
  { id: 'ai_bldg_dnipro', label: 'Днепр (Склад БК)', buildingId: 'ammo-depot', lat: 48.4647, lng: 35.0462 },
  { id: 'ai_bldg_odesa', label: 'Одесса (Порт)', buildingId: 'port', lat: 46.4825, lng: 30.7233 },
  { id: 'ai_bldg_zap', label: 'Запорожье (Меткомбинат)', buildingId: 'metallurgy', lat: 47.8388, lng: 35.1396 },
  { id: 'ai_bldg_kremenchuk', label: 'Кременчуг (НПЗ)', buildingId: 'oil-depot', lat: 49.0658, lng: 33.41 },
  { id: 'ai_bldg_lviv', label: 'Львов (Ж/Д узел)', buildingId: 'railway-hub', lat: 49.8397, lng: 24.0297 },
  { id: 'ai_bldg_mykolaiv', label: 'Николаев (Порт)', buildingId: 'port', lat: 46.975, lng: 31.9946 },
  { id: 'ai_bldg_vinnytsia', label: 'Винница (Штаб / КП)', buildingId: 'command-center', lat: 49.2331, lng: 28.4682 },
  { id: 'ai_bldg_poltava', label: 'Полтава (Воен. база)', buildingId: 'military-base', lat: 49.5883, lng: 34.5514 },
  { id: 'ai_bldg_kryvyi', label: 'Кривой Рог (Меткомбинат)', buildingId: 'metallurgy', lat: 47.9105, lng: 33.3918 },
  { id: 'ai_bldg_chernihiv', label: 'Чернигов (Воен. база)', buildingId: 'military-base', lat: 51.4982, lng: 31.2893 },
  { id: 'ai_bldg_sumy', label: 'Сумы (Заправка)', buildingId: 'gas-station', lat: 50.9077, lng: 34.7981 },
  { id: 'ai_bldg_cherkasy', label: 'Черкассы (Мост)', buildingId: 'bridge', lat: 49.4444, lng: 32.0598 },
  { id: 'ai_bldg_zhytomyr', label: 'Житомир (Склад БК)', buildingId: 'ammo-depot', lat: 50.2547, lng: 28.6587 },
  { id: 'ai_bldg_khmel', label: 'Хмельницкий (ТЭС)', buildingId: 'power-plant', lat: 49.4229, lng: 26.9871 },
  { id: 'ai_bldg_rivne', label: 'Ровно (Ж/Д узел)', buildingId: 'railway-hub', lat: 50.6199, lng: 26.2516 },
  { id: 'ai_bldg_ivano', label: 'Ивано-Франковск (Квартал)', buildingId: 'residential', lat: 48.9226, lng: 24.7111 },
];

export const AI_LAUNCH_ORIGINS: AiLaunchOrigin[] = [
  { id: 'kursk', name: 'Курская обл.', lat: 51.7373, lng: 36.1873 },
  { id: 'millerovo', name: 'Миллерово', lat: 48.9531, lng: 40.2966 },
  { id: 'voronezh', name: 'Воронеж', lat: 51.672, lng: 39.1843 },
  { id: 'melitopol', name: 'Мелитополь', lat: 46.8489, lng: 35.3653 },
  { id: 'bryansk', name: 'Брянск', lat: 53.2435, lng: 34.3634 },
  { id: 'primorsko', name: 'Приморско-Ахтарск', lat: 46.08, lng: 38.22 },
];

const AI_STANDOFF_LAUNCH_POINTS: Record<
  string,
  { aircraftId: RussianAircraftId; launchPoint: { lat: number; lng: number } }
> = {
  savasleyka: { aircraftId: 'mig31k', launchPoint: { lat: 52.85, lng: 41.2 } },
  engels: { aircraftId: 'tu95', launchPoint: { lat: 51.35, lng: 43.4 } },
  shaykovka: { aircraftId: 'tu22m3', launchPoint: { lat: 53.1, lng: 34.8 } },
  baltimore: { aircraftId: 'su57-x69', launchPoint: { lat: 51.1, lng: 38.2 } },
  mozdok: { aircraftId: 'tu22m3', launchPoint: { lat: 45.6, lng: 42.1 } },
};

const SAFE_CORRIDOR_WAYPOINTS: Array<{ lat: number; lng: number }> = [
  { lat: 50.65, lng: 32.15 },
  { lat: 49.55, lng: 34.45 },
  { lat: 48.75, lng: 32.65 },
  { lat: 47.45, lng: 33.85 },
];

export function buildDynamicAiRedirectWaypoints(
  startLat: number,
  startLng: number,
  targetLat: number,
  targetLng: number,
  preferDogleg: boolean,
): Array<{ lat: number; lng: number }> | null {
  const directOk = isFlightPathAllowed(startLat, startLng, targetLat, targetLng).allowed;
  if (directOk && !preferDogleg) {
    return [
      { lat: startLat, lng: startLng },
      { lat: targetLat, lng: targetLng },
    ];
  }

  const shuffledCorridors = [...SAFE_CORRIDOR_WAYPOINTS].sort(() => Math.random() - 0.5);
  for (const mid of shuffledCorridors) {
    const midPt = {
      lat: mid.lat + (Math.random() - 0.5) * 0.45,
      lng: mid.lng + (Math.random() - 0.5) * 0.55,
    };
    const seg1 = isFlightPathAllowed(startLat, startLng, midPt.lat, midPt.lng).allowed;
    const seg2 = isFlightPathAllowed(midPt.lat, midPt.lng, targetLat, targetLng).allowed;
    if (seg1 && seg2) {
      return [{ lat: startLat, lng: startLng }, midPt, { lat: targetLat, lng: targetLng }];
    }
  }

  if (directOk) {
    return [
      { lat: startLat, lng: startLng },
      { lat: targetLat, lng: targetLng },
    ];
  }
  return null;
}

export function createInitialAiBuildings() {
  return INITIAL_AI_BUILDINGS.map((tpl) => {
    const spec = BUILDING_BY_ID[tpl.buildingId];
    return {
      id: tpl.id,
      buildingId: tpl.buildingId,
      lat: tpl.lat,
      lng: tpl.lng,
      hp: spec.maxHp,
      maxHp: spec.maxHp,
    };
  });
}

export function createInitialAiAirfields() {
  const aiPresetIds = new Set(['savasleyka', 'engels', 'shaykovka', 'baltimore', 'mozdok']);
  return RUSSIAN_AIRBASE_PRESETS.filter((p) => aiPresetIds.has(p.id)).map((preset) => {
    const acSpec = RUSSIAN_AIRCRAFT_BY_ID[preset.defaultAircraftId];
    return {
      id: `ai_af_${preset.id}`,
      name: preset.name,
      presetId: preset.id,
      lat: preset.lat,
      lng: preset.lng,
      selectedAircraftId: preset.defaultAircraftId,
      salvoCount: Math.min(2, acSpec.missileCount),
      isAi: true,
    };
  });
}

function jitterLauncherCoords(origin: AiLaunchOrigin): { lat: number; lng: number } {
  for (let i = 0; i < 8; i++) {
    const lat = origin.lat + (Math.random() - 0.5) * 0.36;
    const lng = origin.lng + (Math.random() - 0.5) * 0.46;
    if (isFactionPlacementAllowed('RU', lat, lng).allowed) {
      return { lat, lng };
    }
  }
  return { lat: origin.lat, lng: origin.lng };
}

/**
 * Generates moderate, realistic AI attack waves ("не много и не часто"):
 * - Deploys real Russian/occupied ground launchers first (~2.8s before launch),
 *   then launches drones/missiles out of those launchers.
 * - Rarely (every 3rd wave starting wave 3) launches a real strategic/tactical aircraft
 *   sortie from one of the pre-placed Russian airbases.
 */
export function generateAiWaveOrders(
  waveNumber: number,
  buildings: Array<{ id: string; lat: number; lng: number }>,
  pvoUnits: Array<{ id: string; lat: number; lng: number; isRadar?: boolean }>,
): {
  launchers: AiLauncherSpawn[];
  orders: AiWaveStrikeOrder[];
  airfieldSorties: AiAirfieldSortieOrder[];
  nextIntervalSec: number;
} {
  if (buildings.length === 0) {
    return { launchers: [], orders: [], airfieldSorties: [], nextIntervalSec: 22 };
  }

  const orders: AiWaveStrikeOrder[] = [];
  const launchers: AiLauncherSpawn[] = [];
  const airfieldSorties: AiAirfieldSortieOrder[] = [];
  const plan: Array<{
    munitionId: MunitionId;
    altitudeMode: AltitudeMode;
    climbAtProgress?: number;
    postClimbAltitudeMode?: AltitudeMode;
  }> = [];

  if (waveNumber === 1) {
    plan.push({ munitionId: 'shahed-136', altitudeMode: 'low' });
    plan.push({
      munitionId: 'shahed-136',
      altitudeMode: 'ultra-low',
      climbAtProgress: 0.56,
      postClimbAltitudeMode: 'normal',
    });
  } else if (waveNumber === 2) {
    plan.push({ munitionId: 'shahed-136', altitudeMode: 'low' });
    plan.push({
      munitionId: 'shahed-136',
      altitudeMode: 'ultra-low',
      climbAtProgress: 0.62,
      postClimbAltitudeMode: 'normal',
    });
    plan.push({ munitionId: 'shahed-238', altitudeMode: 'low' });
  } else if (waveNumber === 3) {
    plan.push({ munitionId: 'shahed-136', altitudeMode: 'low' });
    plan.push({
      munitionId: 'shahed-136',
      altitudeMode: 'ultra-low',
      climbAtProgress: 0.52,
      postClimbAltitudeMode: 'low',
    });
    plan.push({ munitionId: 'kalibr', altitudeMode: 'normal' });
  } else if (waveNumber === 4) {
    plan.push({
      munitionId: 'shahed-136',
      altitudeMode: 'ultra-low',
      climbAtProgress: 0.58,
      postClimbAltitudeMode: 'normal',
    });
    plan.push({ munitionId: 'shahed-238', altitudeMode: 'low' });
    plan.push({ munitionId: 'kh101', altitudeMode: 'normal' });
  } else if (waveNumber === 5) {
    plan.push({
      munitionId: 'shahed-136',
      altitudeMode: 'ultra-low',
      climbAtProgress: 0.66,
      postClimbAltitudeMode: 'normal',
    });
    plan.push({ munitionId: 'shahed-238', altitudeMode: 'normal' });
    plan.push({ munitionId: 'iskander', altitudeMode: 'normal' });
  } else {
    const shahedCount = Math.min(4, 2 + Math.floor((waveNumber - 3) / 3));
    for (let i = 0; i < shahedCount; i++) {
      const isJet = i === shahedCount - 1 && waveNumber % 2 === 0;
      const r = Math.random();
      const altMode: AltitudeMode = r < 0.36 ? 'ultra-low' : r < 0.78 ? 'low' : 'normal';
      const willClimb = altMode === 'ultra-low' && Math.random() < 0.85;
      plan.push({
        munitionId: isJet ? 'shahed-238' : 'shahed-136',
        altitudeMode: altMode,
        climbAtProgress: willClimb ? 0.45 + Math.random() * 0.3 : undefined,
        postClimbAltitudeMode: willClimb
          ? Math.random() < 0.72
            ? 'normal'
            : 'low'
          : undefined,
      });
    }

    const missilePool: MunitionId[] =
      waveNumber % 4 === 0
        ? ['kh101', 'iskander']
        : waveNumber % 3 === 0
          ? ['iskander', 'kalibr']
          : ['kalibr', 'kh101'];
    const missileCount = waveNumber >= 9 ? 2 : 1;
    for (let m = 0; m < missileCount; m++) {
      const mId = missilePool[(waveNumber + m) % missilePool.length];
      plan.push({ munitionId: mId, altitudeMode: 'normal' });
    }
  }

  const waveOrigins = [...AI_LAUNCH_ORIGINS].sort(() => Math.random() - 0.5);
  const launcherMap = new Map<string, AiLauncherSpawn>();
  const combatPvo = pvoUnits.filter((p) => !p.isRadar);

  plan.forEach((item, idx) => {
    const shouldTargetPvo =
      waveNumber >= 2 && combatPvo.length > 0 && Math.random() < (idx === plan.length - 1 ? 0.35 : 0.2);

    let targetLat = buildings[0].lat;
    let targetLng = buildings[0].lng;
    let targetBuildingId: string | undefined;
    let targetPvoId: string | undefined;

    if (shouldTargetPvo) {
      const chosenPvo = combatPvo[Math.floor(Math.random() * combatPvo.length)];
      targetLat = chosenPvo.lat;
      targetLng = chosenPvo.lng;
      targetPvoId = chosenPvo.id;
    } else {
      const chosenBldg = buildings[Math.floor(Math.random() * buildings.length)];
      targetLat = chosenBldg.lat;
      targetLng = chosenBldg.lng;
      targetBuildingId = chosenBldg.id;
    }

    const isDrone = item.munitionId === 'shahed-136' || item.munitionId === 'shahed-238';
    const originIdx = idx % Math.min(2, waveOrigins.length);
    const baseOrigin = waveOrigins[originIdx];
    const groupKey = `${baseOrigin.id}_${item.munitionId}`;

    let assignedLauncher = launcherMap.get(groupKey);
    if (!assignedLauncher) {
      const coords = jitterLauncherCoords(baseOrigin);
      assignedLauncher = {
        id: `ai_lnch_${waveNumber}_${launchers.length}_${Math.random().toString(36).slice(2, 6)}`,
        munitionId: item.munitionId,
        lat: coords.lat,
        lng: coords.lng,
        ammo: 0,
        headingDeg: computeBearingDeg(coords.lat, coords.lng, targetLat, targetLng),
        originName: baseOrigin.name,
      };
      launcherMap.set(groupKey, assignedLauncher);
      launchers.push(assignedLauncher);
    }

    const route = buildDynamicAiRedirectWaypoints(
      assignedLauncher.lat,
      assignedLauncher.lng,
      targetLat,
      targetLng,
      isDrone && Math.random() < 0.65,
    );

    if (route) {
      assignedLauncher.ammo += 1;
      orders.push({
        launcherId: assignedLauncher.id,
        munitionId: item.munitionId,
        lowAltitude: item.altitudeMode !== 'normal',
        altitudeMode: item.altitudeMode,
        climbAtProgress: item.climbAtProgress,
        postClimbAltitudeMode: item.postClimbAltitudeMode,
        waypoints: route,
        targetBuildingId,
        targetPvoId,
        // Deploy visible launcher on map ~2.8s before first missile/drone fires from it
        delaySec: 2.8 + idx * (isDrone ? 1.35 : 1.05),
        originName: assignedLauncher.originName,
      });
    }
  });

  // Remove any launcher that failed route generation and got 0 ammo
  const validLaunchers = launchers.filter((l) => l.ammo > 0);

  // Rare AI Russian Airbase aircraft sortie (every 3rd wave starting from wave 3)
  if (waveNumber >= 3 && waveNumber % 3 === 0) {
    const presetIds = Object.keys(AI_STANDOFF_LAUNCH_POINTS);
    const chosenPresetId = presetIds[(Math.floor(waveNumber / 3) - 1) % presetIds.length];
    const sortieCfg = AI_STANDOFF_LAUNCH_POINTS[chosenPresetId];
    const acSpec = RUSSIAN_AIRCRAFT_BY_ID[sortieCfg.aircraftId];

    const chosenBldg = buildings[Math.floor(Math.random() * buildings.length)];
    const mRoute = buildDynamicAiRedirectWaypoints(
      sortieCfg.launchPoint.lat,
      sortieCfg.launchPoint.lng,
      chosenBldg.lat,
      chosenBldg.lng,
      true,
    );

    if (mRoute) {
      airfieldSorties.push({
        airfieldPresetId: chosenPresetId,
        aircraftId: sortieCfg.aircraftId,
        missileCount: Math.min(2, acSpec.missileCount),
        launchPoint: sortieCfg.launchPoint,
        missileWaypoints: mRoute,
        targetBuildingId: chosenBldg.id,
        delaySec: 1.8,
      });
    }
  }

  const nextIntervalSec = Math.max(18, 26 - Math.floor(waveNumber * 0.5));
  return { launchers: validLaunchers, orders, airfieldSorties, nextIntervalSec };
}
