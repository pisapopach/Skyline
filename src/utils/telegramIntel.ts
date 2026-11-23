import { RUSSIAN_AIRCRAFT_BY_ID, type RussianAircraftId } from '../data/airfields';
import { MUNITION_BY_ID, type AltitudeMode, type MunitionId } from '../data/munitions';
import { haversineDistanceKm } from './geoBoundaries';

export type TelegramSceneMotif =
  | 'kyiv-river'
  | 'radar-city'
  | 'sea-port'
  | 'industrial'
  | 'west-peaks'
  | 'steppe-front';

export interface TelegramChannelMeta {
  oblast: string;
  title: string;
  shortTitle: string;
  handle: string;
  tag: string;
  subscribersLabel: string;
  avatarUrl: string;
}

export type TelegramIntelEventKind =
  | 'entered'
  | 'tracking'
  | 'climbed'
  | 'dropped'
  | 'dropped_radar_lost'
  | 'redirect'
  | 'intercepted'
  | 'explosion'
  | 'dorozvedka'
  | 'alert_on'
  | 'alert_upgrade'
  | 'alert_off';

export type TelegramAlertSubtype = 'drone' | 'missile' | 'ballistic' | 'aircraft' | 'clear';

export interface TelegramPost {
  id: string;
  oblast: string;
  munitionId?: MunitionId;
  carrierAircraftId?: RussianAircraftId;
  targetCity?: string;
  nearCity?: string;
  raionName?: string;
  transitOblast?: string;
  targetBuildingName?: string;
  bearingDeg?: number;
  altitudeMode: AltitudeMode;
  eventKind: TelegramIntelEventKind;
  alertSubtype?: TelegramAlertSubtype;
  text: string;
  viewsLabel: string;
  simTimeMinutes: number;
  timestampMs: number;
}

function buildChannelAvatarDataUri(params: {
  bgTop: string;
  bgBottom: string;
  accent: string;
  motif: TelegramSceneMotif;
  tag: string;
}): string {
  const { bgTop, bgBottom, accent, motif, tag } = params;

  let sceneSvg = '';
  if (motif === 'kyiv-river') {
    sceneSvg = `
      <circle cx="48" cy="24" r="14" fill="${accent}" fill-opacity="0.22"/>
      <path d="M0 54 L12 42 L18 42 L20 34 L25 34 L27 42 L38 42 L43 26 L47 26 L52 42 L68 42 L74 36 L82 42 L96 42 L96 96 L0 96 Z" fill="#0B1320"/>
      <path d="M0 68 Q32 61 62 70 T96 67 L96 96 L0 96 Z" fill="${accent}" fill-opacity="0.35"/>
      <path d="M12 63 L84 63" stroke="#E2E8F0" stroke-opacity="0.55" stroke-width="1.5"/>
      <line x1="45" y1="16" x2="45" y2="26" stroke="${accent}" stroke-width="2"/>
    `;
  } else if (motif === 'sea-port') {
    sceneSvg = `
      <circle cx="72" cy="24" r="11" fill="${accent}" fill-opacity="0.32"/>
      <path d="M0 56 L16 56 L22 36 L26 36 L30 56 L46 56 L46 46 L62 46 L62 56 L96 56 L96 96 L0 96 Z" fill="#0A1524"/>
      <path d="M24 38 L42 28 L44 31 L27 40" stroke="#94A3B8" stroke-width="1.6" fill="none"/>
      <path d="M0 64 Q24 58 48 64 T96 64 L96 96 L0 96 Z" fill="${accent}" fill-opacity="0.38"/>
      <path d="M0 74 Q24 68 48 74 T96 74" stroke="#E0F2FE" stroke-opacity="0.45" stroke-width="1.4" fill="none"/>
    `;
  } else if (motif === 'west-peaks') {
    sceneSvg = `
      <path d="M0 68 L22 34 L42 54 L64 26 L96 66 L96 96 L0 96 Z" fill="#0D1726"/>
      <path d="M56 36 L64 26 L73 37 L67 39 L64 35 L60 39 Z" fill="#E2E8F0" fill-opacity="0.72"/>
      <path d="M0 72 L30 58 L54 70 L78 55 L96 68 L96 96 L0 96 Z" fill="${accent}" fill-opacity="0.28"/>
    `;
  } else if (motif === 'industrial') {
    sceneSvg = `
      <path d="M0 60 L14 60 L14 34 L20 34 L20 60 L28 60 L28 28 L34 28 L34 60 L46 60 L46 42 L68 42 L68 60 L76 60 L76 36 L82 36 L82 60 L96 60 L96 96 L0 96 Z" fill="#0A111C"/>
      <circle cx="31" cy="20" r="6" fill="${accent}" fill-opacity="0.25"/>
      <circle cx="79" cy="26" r="5" fill="${accent}" fill-opacity="0.2"/>
      <rect x="49" y="47" width="4" height="4" fill="${accent}"/>
      <rect x="57" y="47" width="4" height="4" fill="${accent}"/>
    `;
  } else if (motif === 'steppe-front') {
    sceneSvg = `
      <circle cx="48" cy="46" r="24" stroke="${accent}" stroke-opacity="0.4" stroke-width="1.4" fill="none"/>
      <circle cx="48" cy="46" r="14" stroke="${accent}" stroke-opacity="0.6" stroke-width="1.2" fill="none"/>
      <path d="M48 46 L68 30" stroke="${accent}" stroke-width="2" stroke-linecap="round"/>
      <path d="M0 66 Q48 56 96 68 L96 96 L0 96 Z" fill="#0A121D"/>
    `;
  } else {
    sceneSvg = `
      <circle cx="48" cy="42" r="26" stroke="${accent}" stroke-opacity="0.34" stroke-width="1.4" fill="none"/>
      <circle cx="48" cy="42" r="16" stroke="${accent}" stroke-opacity="0.52" stroke-width="1.2" fill="none"/>
      <path d="M48 42 L67 24" stroke="${accent}" stroke-width="2" stroke-linecap="round"/>
      <path d="M0 62 L12 62 L12 48 L22 48 L22 62 L30 62 L30 40 L42 40 L42 62 L56 62 L56 44 L66 44 L66 62 L76 62 L76 50 L86 50 L86 62 L96 62 L96 96 L0 96 Z" fill="#09101B"/>
    `;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${bgTop}"/>
        <stop offset="100%" stop-color="${bgBottom}"/>
      </linearGradient>
    </defs>
    <rect width="96" height="96" fill="url(#g)"/>
    ${sceneSvg}
    <rect x="6" y="70" width="84" height="20" rx="4" fill="#050912" fill-opacity="0.72"/>
    <text x="48" y="84" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="13" fill="#F8FAFC" letter-spacing="1">${tag}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

interface RawChannelSpec {
  oblast: string;
  title: string;
  shortTitle: string;
  handle: string;
  tag: string;
  subscribersLabel: string;
  bgTop: string;
  bgBottom: string;
  accent: string;
  motif: TelegramSceneMotif;
}

const RAW_CHANNELS: RawChannelSpec[] = [
  { oblast: 'м. Київ', title: 'Киев INFO | Радар ППО', shortTitle: 'Киев INFO', handle: '@kyiv_radar_info', tag: 'КИЕВ', subscribersLabel: '542K', bgTop: '#1D4ED8', bgBottom: '#0B1324', accent: '#38BDF8', motif: 'kyiv-river' },
  { oblast: 'Київська область', title: 'Киевщина | Воздушная тревога', shortTitle: 'Киевщина', handle: '@kyiv_obl_sky', tag: 'КВ·ОБЛ', subscribersLabel: '218K', bgTop: '#0369A1', bgBottom: '#08121E', accent: '#7DD3FC', motif: 'radar-city' },
  { oblast: 'Харківська область', title: 'Харьков | Где летит?', shortTitle: 'Харьков ППО', handle: '@kharkiv_where_fly', tag: 'ХАРЬКОВ', subscribersLabel: '384K', bgTop: '#B91C1C', bgBottom: '#130A12', accent: '#FCA5A5', motif: 'industrial' },
  { oblast: 'Дніпропетровська область', title: 'Днепр Оперативный | ППО', shortTitle: 'Днепр ППО', handle: '@dnipro_pvo_live', tag: 'ДНЕПР', subscribersLabel: '312K', bgTop: '#0F766E', bgBottom: '#08141A', accent: '#5EEAD4', motif: 'kyiv-river' },
  { oblast: 'Одеська область', title: 'Одесса INFO | Море и Небо', shortTitle: 'Одесса INFO', handle: '@odesa_sky_monitor', tag: 'ОДЕССА', subscribersLabel: '346K', bgTop: '#1E40AF', bgBottom: '#061423', accent: '#60A5FA', motif: 'sea-port' },
  { oblast: 'Запорізька область', title: 'Запорожье | Почему тревога?', shortTitle: 'Запорожье', handle: '@zp_alarm_radar', tag: 'ЗП', subscribersLabel: '204K', bgTop: '#B45309', bgBottom: '#140E08', accent: '#FCD34D', motif: 'industrial' },
  { oblast: 'Миколаївська область', title: 'Николаевский Монитор', shortTitle: 'Николаев', handle: '@niko_monitor_sky', tag: 'НИКО', subscribersLabel: '465K', bgTop: '#0E7490', bgBottom: '#08131E', accent: '#22D3EE', motif: 'sea-port' },
  { oblast: 'Полтавська область', title: 'Полтава | Радар Онлайн', shortTitle: 'Полтава', handle: '@poltava_radar_24', tag: 'ПОЛТ', subscribersLabel: '154K', bgTop: '#4338CA', bgBottom: '#0C0E20', accent: '#A5B4FC', motif: 'radar-city' },
  { oblast: 'Сумська область', title: 'Сумы | Граница и Небо', shortTitle: 'Сумы Небо', handle: '@sumy_border_sky', tag: 'СУМЫ', subscribersLabel: '176K', bgTop: '#991B1B', bgBottom: '#140B10', accent: '#F87171', motif: 'steppe-front' },
  { oblast: 'Чернігівська область', title: 'Чернигов | Северный Радар', shortTitle: 'Чернигов', handle: '@chernihiv_north', tag: 'ЧЕРН', subscribersLabel: '139K', bgTop: '#1E3A8A', bgBottom: '#09101D', accent: '#93C5FD', motif: 'radar-city' },
  { oblast: 'Черкаська область', title: 'Черкассы | Почему тревога?', shortTitle: 'Черкассы', handle: '@cherkasy_pvo_live', tag: 'ЧЕРК', subscribersLabel: '122K', bgTop: '#047857', bgBottom: '#071411', accent: '#6EE7B7', motif: 'kyiv-river' },
  { oblast: 'Житомирська область', title: 'Житомир INFO | ППО', shortTitle: 'Житомир', handle: '@zhytomyr_sky_radar', tag: 'ЖИТ', subscribersLabel: '114K', bgTop: '#3730A3', bgBottom: '#0B0D1D', accent: '#818CF8', motif: 'radar-city' },
  { oblast: 'Вінницька область', title: 'Винница | Подолье Монитор', shortTitle: 'Винница', handle: '@vinnytsia_radar', tag: 'ВИНН', subscribersLabel: '131K', bgTop: '#0369A1', bgBottom: '#09131F', accent: '#38BDF8', motif: 'radar-city' },
  { oblast: 'Кіровоградська область', title: 'Кропивницкий | Центр ППО', shortTitle: 'Кропивницкий', handle: '@krop_center_pvo', tag: 'КРОП', subscribersLabel: '98K', bgTop: '#6D28D9', bgBottom: '#100B1F', accent: '#C4B5FD', motif: 'steppe-front' },
  { oblast: 'Хмельницька область', title: 'Хмельницкий | Радар Запад', shortTitle: 'Хмельницкий', handle: '@khmel_sky_watch', tag: 'ХМЕЛ', subscribersLabel: '119K', bgTop: '#0F766E', bgBottom: '#091519', accent: '#2DD4BF', motif: 'radar-city' },
  { oblast: 'Рівненська область', title: 'Ровно | Полесье Тревога', shortTitle: 'Ровно', handle: '@rivne_polissya', tag: 'РОВНО', subscribersLabel: '92K', bgTop: '#1D4ED8', bgBottom: '#0A1120', accent: '#60A5FA', motif: 'west-peaks' },
  { oblast: 'Волинська область', title: 'Луцк | Волынь Монитор', shortTitle: 'Луцк', handle: '@lutsk_volyn_sky', tag: 'ЛУЦК', subscribersLabel: '85K', bgTop: '#0284C7', bgBottom: '#08131E', accent: '#7DD3FC', motif: 'radar-city' },
  { oblast: 'Львівська область', title: 'Львовский Радар | ППО', shortTitle: 'Львов', handle: '@lviv_radar_pvo', tag: 'ЛЬВОВ', subscribersLabel: '264K', bgTop: '#1D4ED8', bgBottom: '#0B1224', accent: '#93C5FD', motif: 'west-peaks' },
  { oblast: 'Тернопільська область', title: 'Тернополь | Воздух 24/7', shortTitle: 'Тернополь', handle: '@ternopil_air', tag: 'ТЕРН', subscribersLabel: '79K', bgTop: '#4F46E5', bgBottom: '#0D0E20', accent: '#A5B4FC', motif: 'west-peaks' },
  { oblast: 'Івано-Франківська область', title: 'Франковск | Карпаты Небо', shortTitle: 'Франковск', handle: '@if_karpaty_sky', tag: 'ИВ-ФР', subscribersLabel: '94K', bgTop: '#0369A1', bgBottom: '#091421', accent: '#38BDF8', motif: 'west-peaks' },
  { oblast: 'Чернівецька область', title: 'Черновцы | Буковина Радар', shortTitle: 'Черновцы', handle: '@chernivtsi_pvo', tag: 'ЧЕРНВ', subscribersLabel: '67K', bgTop: '#047857', bgBottom: '#081612', accent: '#34D399', motif: 'west-peaks' },
  { oblast: 'Закарпатська область', title: 'Ужгород | Закарпатье Небо', shortTitle: 'Закарпатье', handle: '@zakarpattia_radar', tag: 'УЖГ', subscribersLabel: '74K', bgTop: '#0E7490', bgBottom: '#071419', accent: '#67E8F9', motif: 'west-peaks' },
  { oblast: 'Херсонська область', title: 'Херсон | Южный Фронт ППО', shortTitle: 'Херсон', handle: '@kherson_south_sky', tag: 'ХЕРС', subscribersLabel: '126K', bgTop: '#C2410C', bgBottom: '#160D09', accent: '#FDBA74', motif: 'steppe-front' },
  { oblast: 'Донецька область', title: 'Донбасс | Небо и Фронт', shortTitle: 'Донбасс', handle: '@donbas_sky_watch', tag: 'ДОНБ', subscribersLabel: '148K', bgTop: '#9A3412', bgBottom: '#140B09', accent: '#FB923C', motif: 'industrial' },
  { oblast: 'Луганська область', title: 'Луганск | Восток Монитор', shortTitle: 'Луганск', handle: '@luhansk_east_sky', tag: 'ЛУГ', subscribersLabel: '71K', bgTop: '#7C2D12', bgBottom: '#120A08', accent: '#FDBA74', motif: 'steppe-front' },
  { oblast: 'АР Крим', title: 'Крымский Ветер | Небо', shortTitle: 'Крымский Ветер', handle: '@crimea_wind_sky', tag: 'КРЫМ', subscribersLabel: '234K', bgTop: '#0369A1', bgBottom: '#071422', accent: '#38BDF8', motif: 'sea-port' },
  { oblast: 'м. Севастополь', title: 'Севастополь | Бухта Радар', shortTitle: 'Севастополь', handle: '@sevastopol_radar', tag: 'СЕВ', subscribersLabel: '151K', bgTop: '#1E40AF', bgBottom: '#071222', accent: '#60A5FA', motif: 'sea-port' },
];

export const UKRAINE_TELEGRAM_CHANNELS: TelegramChannelMeta[] = RAW_CHANNELS.map((c) => ({
  oblast: c.oblast,
  title: c.title,
  shortTitle: c.shortTitle,
  handle: c.handle,
  tag: c.tag,
  subscribersLabel: c.subscribersLabel,
  avatarUrl: buildChannelAvatarDataUri(c),
}));

const CHANNEL_BY_OBLAST = new Map<string, TelegramChannelMeta>(
  UKRAINE_TELEGRAM_CHANNELS.map((c) => [c.oblast, c]),
);

export function getTelegramChannelByOblast(oblast: string): TelegramChannelMeta | null {
  return CHANNEL_BY_OBLAST.get(oblast) ?? null;
}

export interface SettlementPoint {
  name: string;
  kind: 'г.' | 'пгт' | 'с.';
  lat: number;
  lng: number;
  isMajor?: boolean;
}

// Major cities + 140+ small towns, urban-type settlements (пгт), and villages (с.) across Ukraine
export const UKRAINE_SETTLEMENTS: SettlementPoint[] = [
  // Київ та Київщина
  { name: 'Киев', kind: 'г.', lat: 50.4501, lng: 30.5234, isMajor: true },
  { name: 'Бровары', kind: 'г.', lat: 50.5111, lng: 30.7903 },
  { name: 'Борисполь', kind: 'г.', lat: 50.3526, lng: 30.9551 },
  { name: 'Васильков', kind: 'г.', lat: 50.1774, lng: 30.321 },
  { name: 'Вышгород', kind: 'г.', lat: 50.583, lng: 30.486 },
  { name: 'Ирпень', kind: 'г.', lat: 50.5218, lng: 30.2506 },
  { name: 'Боярка', kind: 'г.', lat: 50.319, lng: 30.296 },
  { name: 'Украинка', kind: 'г.', lat: 50.149, lng: 30.743 },
  { name: 'Обухов', kind: 'г.', lat: 50.11, lng: 30.62 },
  { name: 'Фастов', kind: 'г.', lat: 50.075, lng: 29.918 },
  { name: 'Белая Церковь', kind: 'г.', lat: 49.7968, lng: 30.131 },
  { name: 'Переяслав', kind: 'г.', lat: 50.073, lng: 31.445 },
  { name: 'Яготин', kind: 'г.', lat: 50.257, lng: 31.782 },
  { name: 'Березань', kind: 'г.', lat: 50.308, lng: 31.482 },
  { name: 'Кагарлык', kind: 'г.', lat: 49.863, lng: 30.822 },
  { name: 'Богуслав', kind: 'г.', lat: 49.547, lng: 30.874 },
  { name: 'Тараща', kind: 'г.', lat: 49.561, lng: 30.499 },
  { name: 'Сквира', kind: 'г.', lat: 49.731, lng: 29.666 },
  { name: 'Тетиев', kind: 'г.', lat: 49.371, lng: 29.69 },
  { name: 'Бородянка', kind: 'пгт', lat: 50.644, lng: 29.92 },
  { name: 'Макаров', kind: 'пгт', lat: 50.464, lng: 29.811 },
  { name: 'Иванков', kind: 'пгт', lat: 50.935, lng: 29.898 },
  { name: 'Дымер', kind: 'пгт', lat: 50.783, lng: 30.304 },
  { name: 'Барышевка', kind: 'пгт', lat: 50.359, lng: 31.326 },
  { name: 'Згуровка', kind: 'пгт', lat: 50.492, lng: 31.781 },
  { name: 'Рокитное', kind: 'пгт', lat: 49.688, lng: 30.478 },
  { name: 'Ставище', kind: 'пгт', lat: 49.389, lng: 30.189 },
  { name: 'Клавдиево-Тарасово', kind: 'с.', lat: 50.583, lng: 30.008 },
  { name: 'Вита-Почтовая', kind: 'с.', lat: 50.312, lng: 30.388 },
  { name: 'Вороньков', kind: 'с.', lat: 50.219, lng: 30.896 },

  // Чернігівщина
  { name: 'Чернигов', kind: 'г.', lat: 51.4982, lng: 31.2893, isMajor: true },
  { name: 'Нежин', kind: 'г.', lat: 51.0428, lng: 31.8869 },
  { name: 'Прилуки', kind: 'г.', lat: 50.589, lng: 32.386 },
  { name: 'Бахмач', kind: 'г.', lat: 51.182, lng: 32.833 },
  { name: 'Борзна', kind: 'г.', lat: 51.253, lng: 32.429 },
  { name: 'Мена', kind: 'г.', lat: 51.522, lng: 32.221 },
  { name: 'Корюковка', kind: 'г.', lat: 51.771, lng: 32.253 },
  { name: 'Городня', kind: 'г.', lat: 51.89, lng: 31.595 },
  { name: 'Ичня', kind: 'г.', lat: 50.863, lng: 32.393 },
  { name: 'Бобровица', kind: 'г.', lat: 50.746, lng: 31.394 },
  { name: 'Носовка', kind: 'г.', lat: 50.931, lng: 31.584 },
  { name: 'Остёр', kind: 'г.', lat: 50.949, lng: 30.881 },
  { name: 'Новгород-Северский', kind: 'г.', lat: 52.008, lng: 33.272 },
  { name: 'Сосница', kind: 'пгт', lat: 51.525, lng: 32.499 },
  { name: 'Козелец', kind: 'пгт', lat: 50.913, lng: 31.116 },
  { name: 'Репки', kind: 'пгт', lat: 51.797, lng: 31.089 },
  { name: 'Куликовка', kind: 'пгт', lat: 51.373, lng: 31.646 },
  { name: 'Короп', kind: 'пгт', lat: 51.566, lng: 32.961 },
  { name: 'Варва', kind: 'пгт', lat: 50.495, lng: 32.719 },
  { name: 'Кипти', kind: 'с.', lat: 51.059, lng: 31.163 },

  // Сумщина
  { name: 'Сумы', kind: 'г.', lat: 50.9077, lng: 34.7981, isMajor: true },
  { name: 'Конотоп', kind: 'г.', lat: 51.2392, lng: 33.2044 },
  { name: 'Шостка', kind: 'г.', lat: 51.862, lng: 33.4694 },
  { name: 'Ахтырка', kind: 'г.', lat: 50.309, lng: 34.899 },
  { name: 'Ромны', kind: 'г.', lat: 50.742, lng: 33.488 },
  { name: 'Глухов', kind: 'г.', lat: 51.678, lng: 33.913 },
  { name: 'Лебедин', kind: 'г.', lat: 50.583, lng: 34.488 },
  { name: 'Тростянец', kind: 'г.', lat: 50.481, lng: 34.965 },
  { name: 'Белополье', kind: 'г.', lat: 51.148, lng: 34.307 },
  { name: 'Кролевец', kind: 'г.', lat: 51.552, lng: 33.379 },
  { name: 'Путивль', kind: 'г.', lat: 51.335, lng: 33.868 },
  { name: 'Бурынь', kind: 'г.', lat: 51.196, lng: 33.829 },
  { name: 'Краснополье', kind: 'пгт', lat: 50.771, lng: 35.258 },
  { name: 'Недригайлов', kind: 'пгт', lat: 50.835, lng: 33.878 },
  { name: 'Липовая Долина', kind: 'пгт', lat: 50.562, lng: 33.788 },
  { name: 'Великая Писаревка', kind: 'пгт', lat: 50.422, lng: 35.479 },
  { name: 'Ямполь', kind: 'пгт', lat: 51.946, lng: 33.79 },
  { name: 'Степановка', kind: 'пгт', lat: 50.946, lng: 34.61 },

  // Харківщина
  { name: 'Харьков', kind: 'г.', lat: 49.9935, lng: 36.2304, isMajor: true },
  { name: 'Чугуев', kind: 'г.', lat: 49.835, lng: 36.686 },
  { name: 'Балаклея', kind: 'г.', lat: 49.464, lng: 36.86 },
  { name: 'Лозовая', kind: 'г.', lat: 48.889, lng: 36.316 },
  { name: 'Изюм', kind: 'г.', lat: 49.212, lng: 37.256 },
  { name: 'Богодухов', kind: 'г.', lat: 50.161, lng: 35.524 },
  { name: 'Валки', kind: 'г.', lat: 49.839, lng: 35.619 },
  { name: 'Мерефа', kind: 'г.', lat: 49.814, lng: 36.054 },
  { name: 'Красноград', kind: 'г.', lat: 49.373, lng: 35.456 },
  { name: 'Златополь', kind: 'г.', lat: 49.392, lng: 36.216 },
  { name: 'Барвенково', kind: 'г.', lat: 48.905, lng: 37.018 },
  { name: 'Печенеги', kind: 'пгт', lat: 49.873, lng: 36.939 },
  { name: 'Шевченково', kind: 'пгт', lat: 49.694, lng: 37.172 },
  { name: 'Новая Водолага', kind: 'пгт', lat: 49.719, lng: 35.875 },
  { name: 'Кегичёвка', kind: 'пгт', lat: 49.286, lng: 35.764 },
  { name: 'Сахновщина', kind: 'пгт', lat: 49.149, lng: 35.876 },
  { name: 'Золочев', kind: 'пгт', lat: 50.278, lng: 35.979 },
  { name: 'Старый Салтов', kind: 'пгт', lat: 50.079, lng: 36.798 },

  // Полтавщина
  { name: 'Полтава', kind: 'г.', lat: 49.5883, lng: 34.5514, isMajor: true },
  { name: 'Кременчуг', kind: 'г.', lat: 49.0658, lng: 33.41 },
  { name: 'Миргород', kind: 'г.', lat: 49.9658, lng: 33.6114 },
  { name: 'Лубны', kind: 'г.', lat: 50.016, lng: 32.999 },
  { name: 'Гадяч', kind: 'г.', lat: 50.367, lng: 33.99 },
  { name: 'Зеньков', kind: 'г.', lat: 50.206, lng: 34.365 },
  { name: 'Хорол', kind: 'г.', lat: 49.786, lng: 33.271 },
  { name: 'Пирятин', kind: 'г.', lat: 50.242, lng: 32.51 },
  { name: 'Гребёнка', kind: 'г.', lat: 50.119, lng: 32.437 },
  { name: 'Кобеляки', kind: 'г.', lat: 49.141, lng: 34.201 },
  { name: 'Карловка', kind: 'г.', lat: 49.454, lng: 35.125 },
  { name: 'Глобино', kind: 'г.', lat: 49.389, lng: 33.255 },
  { name: 'Лохвица', kind: 'г.', lat: 50.358, lng: 33.268 },
  { name: 'Диканька', kind: 'пгт', lat: 49.821, lng: 34.533 },
  { name: 'Опошня', kind: 'пгт', lat: 49.957, lng: 34.614 },
  { name: 'Шишаки', kind: 'пгт', lat: 49.893, lng: 34.006 },
  { name: 'Новые Санжары', kind: 'пгт', lat: 49.333, lng: 34.316 },
  { name: 'Решетиловка', kind: 'г.', lat: 49.566, lng: 34.072 },
  { name: 'Великая Багачка', kind: 'пгт', lat: 49.786, lng: 33.719 },
  { name: 'Семёновка', kind: 'пгт', lat: 49.589, lng: 33.177 },

  // Черкащина
  { name: 'Черкассы', kind: 'г.', lat: 49.4444, lng: 32.0598, isMajor: true },
  { name: 'Умань', kind: 'г.', lat: 48.7484, lng: 30.2218 },
  { name: 'Смела', kind: 'г.', lat: 49.226, lng: 31.865 },
  { name: 'Золотоноша', kind: 'г.', lat: 49.669, lng: 32.043 },
  { name: 'Канев', kind: 'г.', lat: 49.754, lng: 31.461 },
  { name: 'Корсунь-Шевченковский', kind: 'г.', lat: 49.424, lng: 31.277 },
  { name: 'Шпола', kind: 'г.', lat: 49.007, lng: 31.394 },
  { name: 'Звенигородка', kind: 'г.', lat: 49.08, lng: 30.967 },
  { name: 'Тальное', kind: 'г.', lat: 48.887, lng: 30.703 },
  { name: 'Жашков', kind: 'г.', lat: 49.245, lng: 30.107 },
  { name: 'Чигирин', kind: 'г.', lat: 49.077, lng: 32.658 },
  { name: 'Городище', kind: 'г.', lat: 49.289, lng: 31.454 },
  { name: 'Чернобай', kind: 'пгт', lat: 49.666, lng: 32.323 },
  { name: 'Драбов', kind: 'пгт', lat: 49.961, lng: 32.145 },
  { name: 'Лысянка', kind: 'пгт', lat: 49.252, lng: 30.824 },
  { name: 'Мошны', kind: 'с.', lat: 49.519, lng: 31.737 },

  // Дніпропетровщина
  { name: 'Днепр', kind: 'г.', lat: 48.4647, lng: 35.0462, isMajor: true },
  { name: 'Кривой Рог', kind: 'г.', lat: 47.9105, lng: 33.3918 },
  { name: 'Каменское', kind: 'г.', lat: 48.5162, lng: 34.6143 },
  { name: 'Павлоград', kind: 'г.', lat: 48.5343, lng: 35.871 },
  { name: 'Никополь', kind: 'г.', lat: 47.5772, lng: 34.3965 },
  { name: 'Самар', kind: 'г.', lat: 48.634, lng: 35.257 },
  { name: 'Синельниково', kind: 'г.', lat: 48.321, lng: 35.512 },
  { name: 'Пятихатки', kind: 'г.', lat: 48.414, lng: 33.704 },
  { name: 'Вольногорск', kind: 'г.', lat: 48.481, lng: 34.028 },
  { name: 'Апостолово', kind: 'г.', lat: 47.658, lng: 33.719 },
  { name: 'Перещепино', kind: 'г.', lat: 49.013, lng: 35.362 },
  { name: 'Подгородное', kind: 'г.', lat: 48.574, lng: 35.107 },
  { name: 'Софиевка', kind: 'пгт', lat: 48.055, lng: 33.868 },
  { name: 'Покровское', kind: 'пгт', lat: 47.982, lng: 36.228 },
  { name: 'Васильковка', kind: 'пгт', lat: 48.209, lng: 36.028 },
  { name: 'Магдалиновка', kind: 'пгт', lat: 48.921, lng: 34.918 },
  { name: 'Царичанка', kind: 'пгт', lat: 48.941, lng: 34.481 },
  { name: 'Петриковка', kind: 'пгт', lat: 48.729, lng: 34.634 },
  { name: 'Солёное', kind: 'пгт', lat: 48.204, lng: 34.868 },
  { name: 'Томаковка', kind: 'пгт', lat: 47.817, lng: 34.749 },

  // Запоріжжя, Херсонщина, Миколаївщина, Одещина
  { name: 'Запорожье', kind: 'г.', lat: 47.8388, lng: 35.1396, isMajor: true },
  { name: 'Вольнянск', kind: 'г.', lat: 47.943, lng: 35.435 },
  { name: 'Орехов', kind: 'г.', lat: 47.567, lng: 35.788 },
  { name: 'Новониколаевка', kind: 'пгт', lat: 47.977, lng: 35.915 },
  { name: 'Николаев', kind: 'г.', lat: 46.975, lng: 31.9946, isMajor: true },
  { name: 'Вознесенск', kind: 'г.', lat: 47.5649, lng: 31.3308 },
  { name: 'Первомайск', kind: 'г.', lat: 48.044, lng: 30.85 },
  { name: 'Южноукраинск', kind: 'г.', lat: 47.8242, lng: 31.1828 },
  { name: 'Баштанка', kind: 'г.', lat: 47.405, lng: 32.441 },
  { name: 'Новый Буг', kind: 'г.', lat: 47.684, lng: 32.515 },
  { name: 'Снигирёвка', kind: 'г.', lat: 47.071, lng: 32.801 },
  { name: 'Новая Одесса', kind: 'г.', lat: 47.302, lng: 31.787 },
  { name: 'Березнеговатое', kind: 'пгт', lat: 47.311, lng: 32.849 },
  { name: 'Березанка', kind: 'пгт', lat: 46.854, lng: 31.391 },
  { name: 'Веселиново', kind: 'пгт', lat: 47.358, lng: 31.236 },
  { name: 'Казанка', kind: 'пгт', lat: 47.839, lng: 32.825 },
  { name: 'Доманёвка', kind: 'пгт', lat: 47.63, lng: 30.988 },
  { name: 'Кривое Озеро', kind: 'пгт', lat: 47.949, lng: 30.336 },
  { name: 'Коблево', kind: 'с.', lat: 46.663, lng: 31.209 },
  { name: 'Херсон', kind: 'г.', lat: 46.6354, lng: 32.6169, isMajor: true },
  { name: 'Берислав', kind: 'г.', lat: 46.842, lng: 33.428 },
  { name: 'Великая Александровка', kind: 'пгт', lat: 47.316, lng: 33.307 },
  { name: 'Белозёрка', kind: 'пгт', lat: 46.625, lng: 32.44 },
  { name: 'Одесса', kind: 'г.', lat: 46.4825, lng: 30.7233, isMajor: true },
  { name: 'Черноморск', kind: 'г.', lat: 46.3017, lng: 30.6569 },
  { name: 'Южный', kind: 'г.', lat: 46.623, lng: 31.101 },
  { name: 'Измаил', kind: 'г.', lat: 45.3497, lng: 28.8367 },
  { name: 'Белгород-Днестровский', kind: 'г.', lat: 46.197, lng: 30.351 },
  { name: 'Раздельная', kind: 'г.', lat: 46.849, lng: 30.075 },
  { name: 'Балта', kind: 'г.', lat: 47.939, lng: 29.621 },
  { name: 'Подольск', kind: 'г.', lat: 47.742, lng: 29.535 },
  { name: 'Арциз', kind: 'г.', lat: 45.992, lng: 29.427 },
  { name: 'Килия', kind: 'г.', lat: 45.455, lng: 29.265 },
  { name: 'Овидиополь', kind: 'пгт', lat: 46.249, lng: 30.439 },
  { name: 'Доброслав', kind: 'пгт', lat: 46.819, lng: 30.946 },
  { name: 'Ширяево', kind: 'пгт', lat: 47.384, lng: 30.189 },
  { name: 'Любашёвка', kind: 'пгт', lat: 47.837, lng: 30.26 },

  // Кіровоградщина, Вінниччина, Житомирщина
  { name: 'Кропивницкий', kind: 'г.', lat: 48.5079, lng: 32.2623, isMajor: true },
  { name: 'Александрия', kind: 'г.', lat: 48.6696, lng: 33.1159 },
  { name: 'Знаменка', kind: 'г.', lat: 48.713, lng: 32.671 },
  { name: 'Светловодск', kind: 'г.', lat: 49.051, lng: 33.214 },
  { name: 'Долинская', kind: 'г.', lat: 48.109, lng: 32.765 },
  { name: 'Бобринец', kind: 'г.', lat: 48.057, lng: 32.161 },
  { name: 'Новоукраинка', kind: 'г.', lat: 48.323, lng: 31.529 },
  { name: 'Смолино', kind: 'пгт', lat: 48.599, lng: 31.186 },
  { name: 'Голованевск', kind: 'пгт', lat: 48.383, lng: 30.453 },
  { name: 'Винница', kind: 'г.', lat: 49.2331, lng: 28.4682, isMajor: true },
  { name: 'Жмеринка', kind: 'г.', lat: 49.037, lng: 28.112 },
  { name: 'Козятин', kind: 'г.', lat: 49.717, lng: 28.833 },
  { name: 'Калиновка', kind: 'г.', lat: 49.45, lng: 28.523 },
  { name: 'Хмельник', kind: 'г.', lat: 49.557, lng: 27.957 },
  { name: 'Немиров', kind: 'г.', lat: 48.979, lng: 28.844 },
  { name: 'Тульчин', kind: 'г.', lat: 48.674, lng: 28.849 },
  { name: 'Ладыжин', kind: 'г.', lat: 48.686, lng: 29.242 },
  { name: 'Гайсин', kind: 'г.', lat: 48.811, lng: 29.384 },
  { name: 'Погребище', kind: 'г.', lat: 49.489, lng: 29.271 },
  { name: 'Житомир', kind: 'г.', lat: 50.2547, lng: 28.6587, isMajor: true },
  { name: 'Бердичев', kind: 'г.', lat: 49.892, lng: 28.602 },
  { name: 'Коростень', kind: 'г.', lat: 50.953, lng: 28.647 },
  { name: 'Малин', kind: 'г.', lat: 50.77, lng: 29.246 },
  { name: 'Радомышль', kind: 'г.', lat: 50.494, lng: 29.233 },
  { name: 'Овруч', kind: 'г.', lat: 51.324, lng: 28.807 },
  { name: 'Звягель', kind: 'г.', lat: 50.59, lng: 27.621 },
  { name: 'Коростышев', kind: 'г.', lat: 50.319, lng: 29.055 },
  { name: 'Озерное', kind: 'пгт', lat: 50.175, lng: 28.738 },
  { name: 'Любар', kind: 'пгт', lat: 49.921, lng: 27.764 },

  // Захід, Крим, Донбас
  { name: 'Хмельницкий', kind: 'г.', lat: 49.4229, lng: 26.9871, isMajor: true },
  { name: 'Староконстантинов', kind: 'г.', lat: 49.7556, lng: 27.2206 },
  { name: 'Шепетовка', kind: 'г.', lat: 50.184, lng: 27.065 },
  { name: 'Славута', kind: 'г.', lat: 50.303, lng: 26.867 },
  { name: 'Каменец-Подольский', kind: 'г.', lat: 48.683, lng: 26.583 },
  { name: 'Ровно', kind: 'г.', lat: 50.6199, lng: 26.2516, isMajor: true },
  { name: 'Дубно', kind: 'г.', lat: 50.417, lng: 25.735 },
  { name: 'Сарны', kind: 'г.', lat: 51.337, lng: 26.602 },
  { name: 'Луцк', kind: 'г.', lat: 50.7472, lng: 25.3254, isMajor: true },
  { name: 'Ковель', kind: 'г.', lat: 51.215, lng: 24.709 },
  { name: 'Львов', kind: 'г.', lat: 49.8397, lng: 24.0297, isMajor: true },
  { name: 'Стрый', kind: 'г.', lat: 49.262, lng: 23.851 },
  { name: 'Дрогобыч', kind: 'г.', lat: 49.354, lng: 23.514 },
  { name: 'Броды', kind: 'г.', lat: 50.084, lng: 25.151 },
  { name: 'Тернополь', kind: 'г.', lat: 49.5535, lng: 25.5948, isMajor: true },
  { name: 'Чортков', kind: 'г.', lat: 49.017, lng: 25.798 },
  { name: 'Ивано-Франковск', kind: 'г.', lat: 48.9226, lng: 24.7111, isMajor: true },
  { name: 'Коломыя', kind: 'г.', lat: 48.53, lng: 25.039 },
  { name: 'Черновцы', kind: 'г.', lat: 48.2921, lng: 25.9358, isMajor: true },
  { name: 'Ужгород', kind: 'г.', lat: 48.6208, lng: 22.2879, isMajor: true },
  { name: 'Мукачево', kind: 'г.', lat: 48.442, lng: 22.714 },
  { name: 'Краматорск', kind: 'г.', lat: 48.7389, lng: 37.5844 },
  { name: 'Славянск', kind: 'г.', lat: 48.853, lng: 37.606 },
  { name: 'Донецк', kind: 'г.', lat: 48.0159, lng: 37.8028 },
  { name: 'Мариуполь', kind: 'г.', lat: 47.0971, lng: 37.5434 },
  { name: 'Мелитополь', kind: 'г.', lat: 46.8489, lng: 35.3653 },
  { name: 'Симферополь', kind: 'г.', lat: 44.9521, lng: 34.1024 },
  { name: 'Севастополь', kind: 'г.', lat: 44.6166, lng: 33.5254 },
];

export function formatSettlementLabel(s: SettlementPoint): string {
  return `${s.kind} ${s.name}`;
}

export function findNearestSettlementInfo(
  lat: number,
  lng: number,
): { fullLabel: string; name: string; distKm: number } {
  let best = UKRAINE_SETTLEMENTS[0];
  let bestDist = Infinity;
  for (const item of UKRAINE_SETTLEMENTS) {
    const d = haversineDistanceKm(lat, lng, item.lat, item.lng);
    if (d < bestDist) {
      bestDist = d;
      best = item;
    }
  }
  return {
    fullLabel: formatSettlementLabel(best),
    name: best.name,
    distKm: bestDist,
  };
}

const OBLAST_TRANSIT_NAME_RU: Record<string, { acc: string; short: string }> = {
  'м. Київ': { acc: 'г. Киев', short: 'Киев' },
  'Київська область': { acc: 'Киевскую область', short: 'Киевскую обл.' },
  'Харківська область': { acc: 'Харьковскую область', short: 'Харьковскую обл.' },
  'Дніпропетровська область': { acc: 'Днепропетровскую область', short: 'Днепропетровскую обл.' },
  'Одеська область': { acc: 'Одесскую область', short: 'Одесскую обл.' },
  'Запорізька область': { acc: 'Запорожскую область', short: 'Запорожскую обл.' },
  'Миколаївська область': { acc: 'Николаевскую область', short: 'Николаевскую обл.' },
  'Полтавська область': { acc: 'Полтавскую область', short: 'Полтавскую обл.' },
  'Сумська область': { acc: 'Сумскую область', short: 'Сумскую обл.' },
  'Чернігівська область': { acc: 'Черниговскую область', short: 'Черниговскую обл.' },
  'Черкаська область': { acc: 'Черкасскую область', short: 'Черкасскую обл.' },
  'Житомирська область': { acc: 'Житомирскую область', short: 'Житомирскую обл.' },
  'Вінницька область': { acc: 'Винницкую область', short: 'Винницкую обл.' },
  'Кіровоградська область': { acc: 'Кировоградскую область', short: 'Кировоградскую обл.' },
  'Хмельницька область': { acc: 'Хмельницкую область', short: 'Хмельницкую обл.' },
  'Рівненська область': { acc: 'Ровенскую область', short: 'Ровенскую обл.' },
  'Волинська область': { acc: 'Волынскую область', short: 'Волынскую обл.' },
  'Львівська область': { acc: 'Львовскую область', short: 'Львовскую обл.' },
  'Тернопільська область': { acc: 'Тернопольскую область', short: 'Тернопольскую обл.' },
  'Івано-Франківська область': { acc: 'Ивано-Франковскую область', short: 'Ивано-Франковскую обл.' },
  'Чернівецька область': { acc: 'Черновицкую область', short: 'Черновицкую обл.' },
  'Закарпатська область': { acc: 'Закарпатскую область', short: 'Закарпатскую обл.' },
  'Херсонська область': { acc: 'Херсонскую область', short: 'Херсонскую обл.' },
  'Донецька область': { acc: 'Донецкую область', short: 'Донецкую обл.' },
  'Луганська область': { acc: 'Луганскую область', short: 'Луганскую обл.' },
  'АР Крим': { acc: 'Крым', short: 'Крым' },
  'м. Севастополь': { acc: 'г. Севастополь', short: 'Севастополь' },
};

export function formatOblastTransitAccusative(oblast: string): string {
  return OBLAST_TRANSIT_NAME_RU[oblast]?.acc ?? oblast;
}

export function formatOblastShortLabel(oblast: string): string {
  return OBLAST_TRANSIT_NAME_RU[oblast]?.short ?? oblast;
}

export function computeCompassDirectionRu(bearingDeg: number): string {
  const b = ((bearingDeg % 360) + 360) % 360;
  if (b >= 337.5 || b < 22.5) return 'север';
  if (b < 67.5) return 'северо-восток';
  if (b < 112.5) return 'восток';
  if (b < 157.5) return 'юго-восток';
  if (b < 202.5) return 'юг';
  if (b < 247.5) return 'юго-запад';
  if (b < 292.5) return 'запад';
  return 'северо-запад';
}

export function buildTelegramMessageText(params: {
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
  raionName?: string;
}): string {
  if (params.eventKind === 'alert_off') {
    return '🟢 Область чистая! ОТБОЙ воздушной тревоги. Можно покидать укрытия.';
  }

  if (params.eventKind === 'dorozvedka') {
    return '🔎 Дорозведка в области — воздушные цели больше не фиксируются. Оставайтесь в укрытиях до отбоя!';
  }

  if (params.eventKind === 'alert_on' || params.eventKind === 'alert_upgrade') {
    const raionList =
      params.alertRaionNames && params.alertRaionNames.length > 0
        ? ` (${params.alertRaionNames.slice(0, 3).join(', ')})`
        : '';
    if (params.alertSubtype === 'ballistic') {
      return `🔴 ВНИМАНИЕ! УГРОЗА ПРИМЕНЕНИЯ БАЛЛИСТИКИ${raionList}! Срочно в укрытия!`;
    }
    if (params.alertSubtype === 'aircraft') {
      return `🔴 ВОЗДУШНАЯ ТРЕВОГА — взлёт ракетоносителя РФ / ракетная опасность${raionList}!`;
    }
    if (params.alertSubtype === 'missile') {
      return `🔴 РАКЕТНАЯ ОПАСНОСТЬ по области${raionList}! Находитесь в безопасных местах!`;
    }
    return `🟡 ВОЗДУШНАЯ ТРЕВОГА (угроза ударных БПЛА)${raionList}. Следите за курсом!`;
  }

  if (params.eventKind === 'intercepted') {
    const mSpecInt = params.munitionId ? MUNITION_BY_ID[params.munitionId] : null;
    const isShahedInt =
      params.munitionId === 'shahed-136' || params.munitionId === 'shahed-238';
    const targetNameInt = isShahedInt
      ? params.munitionId === 'shahed-238'
        ? 'реактивный «Шахед»'
        : '«Шахед»'
      : mSpecInt?.name ?? 'воздушную цель';
    const wherePlaceInt = params.nearCity
      ? params.raionName
        ? `в районе ${params.nearCity} (${params.raionName})`
        : `в районе ${params.nearCity}`
      : params.raionName
        ? `в ${params.raionName}`
        : 'в области';
    return `✅ Отработало ППО — сбита цель (${targetNameInt}) ${wherePlaceInt}!`;
  }

  if (params.eventKind === 'explosion') {
    const wherePlace = params.nearCity
      ? params.raionName
        ? `в районе ${params.nearCity} (${params.raionName})`
        : `в районе ${params.nearCity}`
      : params.raionName
        ? `в ${params.raionName}`
        : 'в области';
    return `💥 Прогремел взрыв ${wherePlace}! Находитесь в укрытиях!`;
  }

  const mSpec = params.munitionId ? MUNITION_BY_ID[params.munitionId] : null;
  const isShahed =
    params.munitionId === 'shahed-136' || params.munitionId === 'shahed-238';
  const dirLabel =
    params.bearingDeg !== undefined ? computeCompassDirectionRu(params.bearingDeg) : null;
  const transitAcc = params.transitOblast
    ? formatOblastTransitAccusative(params.transitOblast)
    : null;

  if (params.carrierAircraftId && mSpec) {
    const carrier = RUSSIAN_AIRCRAFT_BY_ID[params.carrierAircraftId];
    return `✈️ В воздухе ${carrier.shortName} (носитель ${mSpec.shortName})${
      transitAcc
        ? ` — транзит в ${transitAcc}`
        : dirLabel
          ? ` — курс на ${dirLabel}`
          : ''
    }.`;
  }

  const threatLabel = isShahed
    ? params.munitionId === 'shahed-238'
      ? 'реактивный «Шахед»'
      : '«Шахед»'
    : mSpec?.name ?? 'Воздушная цель';

  const locPart = params.nearCity
    ? `возле ${params.nearCity}`
    : params.raionName
      ? `через ${params.raionName}`
      : 'в области';

  const courseParts: string[] = [];
  if (transitAcc) {
    courseParts.push(`транзит в ${transitAcc}`);
  }
  if (params.targetCity) {
    courseParts.push(`летит на ${params.targetCity}`);
  } else if (!transitAcc) {
    courseParts.push(dirLabel ? `курс на ${dirLabel}` : 'движение в области');
  }
  const courseSuffix = courseParts.join(', ');

  const nearMatchesTarget = Boolean(
    params.targetCity && params.nearCity && params.nearCity === params.targetCity,
  );
  const approachLocPart = nearMatchesTarget ? 'уже на подлёте' : locPart;

  if (params.eventKind === 'climbed') {
    const radarStatus =
      params.altitudeMode === 'low'
        ? 'набрал высоту и появился на радарах ППО (идёт низко)'
        : 'набрал высоту и уже фиксируется радарами ППО';
    return `📡 Цель (${isShahed ? '«Шахед»' : threatLabel}) ${approachLocPart} ${radarStatus} — ${courseSuffix}!`;
  }

  if (params.eventKind === 'dropped_radar_lost') {
    return `🔇 Цель (${isShahed ? '«Шахед»' : threatLabel}) ${approachLocPart} снизилась ОЧЕНЬ НИЗКО и пропала с радаров ППО! ${
      params.targetCity
        ? `Летит на ${params.targetCity}.`
        : transitAcc
          ? `Транзит в ${transitAcc}.`
          : dirLabel
            ? `Курс на ${dirLabel}.`
            : ''
    }`.trim();
  }

  if (params.eventKind === 'dropped') {
    return `📉 Цель (${isShahed ? '«Шахед»' : threatLabel}) ${approachLocPart} снизилась до малой высоты (видна в зоне РЛС) — ${courseSuffix}.`;
  }

  if (params.eventKind === 'redirect') {
    return `↪️ ${isShahed ? '«Шахед»' : threatLabel} ${approachLocPart} сменил направление (${
      params.targetCity
        ? `летит на ${params.targetCity}`
        : transitAcc
          ? `транзит в ${transitAcc}`
          : dirLabel
            ? `на ${dirLabel}`
            : 'новый курс'
    })!`;
  }

  if (params.altitudeMode === 'ultra-low') {
    return isShahed
      ? `🛵 «Шахед» замечен ${approachLocPart}, ${courseSuffix}. Идёт ОЧЕНЬ НИЗКО — радары не фиксируют!`
      : `⚠️ ${threatLabel} ${approachLocPart} — ${courseSuffix}. Сверхнизкая высота (вне РЛС)!`;
  }

  if (params.altitudeMode === 'low') {
    return isShahed
      ? `🛵 «Шахед» ${approachLocPart}, ${courseSuffix} (идёт низко).`
      : `⚠️ ${threatLabel} ${approachLocPart} — ${courseSuffix} (низкая высота).`;
  }

  if (mSpec?.profile === 'ballistic') {
    return `🔴 БЫСТРАЯ ЦЕЛЬ! ${threatLabel} ${approachLocPart} — ${courseSuffix}! Немедленно в укрытия!`;
  }

  if (params.eventKind === 'tracking') {
    return isShahed
      ? `🛵 Пролёт «Шахеда» ${approachLocPart} — ${courseSuffix}.`
      : `🚀 ${threatLabel} ${approachLocPart} — ${courseSuffix}.`;
  }

  return isShahed
    ? `⚠️ Зафиксирован «Шахед» ${approachLocPart}, ${courseSuffix}.`
    : `🚀 Зафиксирован ${threatLabel} ${approachLocPart}, ${courseSuffix}.`;
}
