import type { MunitionId } from './munitions';

export type RussianAircraftId = 'mig31k' | 'tu95' | 'tu22m3' | 'tu160' | 'su57-x69';

export interface RussianAircraftSpec {
  id: RussianAircraftId;
  name: string;
  shortName: string;
  role: string;
  missileId: MunitionId;
  missileCount: number;
  realSpeedKmh: number;
  simSpeedKmPerSec: number;
  accentColor: string;
  exhaustColor: string;
  summary: string;
}

export interface RussianAirbasePreset {
  id: string;
  name: string;
  region: string;
  lat: number;
  lng: number;
  defaultAircraftId: RussianAircraftId;
  summary: string;
}

export const RUSSIAN_AIRCRAFT: RussianAircraftSpec[] = [
  {
    id: 'mig31k',
    name: 'МиГ-31К',
    shortName: 'МиГ-31К',
    role: 'Носитель гиперзвукового «Кинжала»',
    missileId: 'kinzhal',
    missileCount: 1,
    realSpeedKmh: 2800,
    simSpeedKmPerSec: 52,
    accentColor: '#EF4444',
    exhaustColor: '#60A5FA',
    summary: 'Перехватчик с 1× гиперзвуковой аэробаллистической ракетой Х-47М2 «Кинжал»',
  },
  {
    id: 'tu95',
    name: 'Ту-95МС',
    shortName: 'Ту-95МС',
    role: 'Стратегический ракетоносец',
    missileId: 'kh101',
    missileCount: 4,
    realSpeedKmh: 830,
    simSpeedKmPerSec: 30,
    accentColor: '#A78BFA',
    exhaustColor: '#94A3B8',
    summary: 'Турбовинтовой стратег — несёт залп из 4× крылатых ракет Х-101',
  },
  {
    id: 'tu22m3',
    name: 'Ту-22М3',
    shortName: 'Ту-22М3',
    role: 'Дальний сверхзвуковой бомбардировщик',
    missileId: 'kh22',
    missileCount: 2,
    realSpeedKmh: 2000,
    simSpeedKmPerSec: 44,
    accentColor: '#F97316',
    exhaustColor: '#FB923C',
    summary: 'Сверхзвуковой ракетоносец — пуск 2× тяжёлых ракет Х-22/Х-32',
  },
  {
    id: 'tu160',
    name: 'Ту-160',
    shortName: 'Ту-160',
    role: 'Стратегический ракетоносец',
    missileId: 'kh101',
    missileCount: 6,
    realSpeedKmh: 2200,
    simSpeedKmPerSec: 46,
    accentColor: '#38BDF8',
    exhaustColor: '#FDE047',
    summary: '«Белый лебедь» — тяжёлый залп из 6× крылатых ракет Х-101',
  },
  {
    id: 'su57-x69',
    name: 'Су-57 (Х-69)',
    shortName: 'Су-57',
    role: 'Малозаметный истребитель',
    missileId: 'kh69',
    missileCount: 2,
    realSpeedKmh: 2100,
    simSpeedKmPerSec: 46,
    accentColor: '#C084FC',
    exhaustColor: '#60A5FA',
    summary: 'Стелс-носитель — скрытый пуск 2× малозаметных ракет Х-69',
  },
];

export const RUSSIAN_AIRCRAFT_BY_ID: Record<RussianAircraftId, RussianAircraftSpec> =
  RUSSIAN_AIRCRAFT.reduce(
    (acc, item) => {
      acc[item.id] = item;
      return acc;
    },
    {} as Record<RussianAircraftId, RussianAircraftSpec>,
  );

export const RUSSIAN_AIRBASE_PRESETS: RussianAirbasePreset[] = [
  {
    id: 'savasleyka',
    name: 'Саваслейка',
    region: 'Нижегородская обл.',
    lat: 55.435,
    lng: 42.309,
    defaultAircraftId: 'mig31k',
    summary: 'База носителей МиГ-31К «Кинжал»',
  },
  {
    id: 'engels',
    name: 'Энгельс-2',
    region: 'Саратовская обл.',
    lat: 51.482,
    lng: 46.203,
    defaultAircraftId: 'tu95',
    summary: 'База стратегической авиации Ту-95МС и Ту-160',
  },
  {
    id: 'shaykovka',
    name: 'Шайковка',
    region: 'Калужская обл.',
    lat: 54.226,
    lng: 34.369,
    defaultAircraftId: 'tu22m3',
    summary: 'Авиабаза Ту-22М3 (ракеты Х-22)',
  },
  {
    id: 'baltimore',
    name: 'Балтимор (Воронеж)',
    region: 'Воронежская обл.',
    lat: 51.622,
    lng: 39.152,
    defaultAircraftId: 'su57-x69',
    summary: 'Оперативный аэродром тактической авиации',
  },
  {
    id: 'mozdok',
    name: 'Моздок',
    region: 'Сев. Осетия',
    lat: 43.791,
    lng: 44.600,
    defaultAircraftId: 'tu22m3',
    summary: 'Южный аэродром Ту-22М3 и МиГ-31К',
  },
  {
    id: 'olenya',
    name: 'Оленья',
    region: 'Мурманская обл.',
    lat: 68.151,
    lng: 33.462,
    defaultAircraftId: 'tu160',
    summary: 'Северная база Ту-95МС и Ту-160',
  },
];
