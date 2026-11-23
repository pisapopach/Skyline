export type MunitionId =
  | 'shahed-136'
  | 'shahed-238'
  | 'kalibr'
  | 'iskander'
  | 'kh101'
  | 'neptune'
  | 'airstrike'
  | 'su57-kab'
  | 'kab'
  | 'lyutyi'
  | 'bober'
  | 'palyanytsya'
  | 'peklo'
  | 'sapsan'
  | 'flamingo'
  | 'kinzhal'
  | 'kh22'
  | 'kh69';

export type AirDefenseId = 'patriot' | 'iris-t' | 'gepard' | 's300' | 'mg-pickup' | 'radar';

export type BuildingId =
  | 'residential'
  | 'factory'
  | 'gas-station'
  | 'oil-depot'
  | 'power-plant'
  | 'ammo-depot'
  | 'port'
  | 'military-base'
  | 'metallurgy'
  | 'railway-hub'
  | 'command-center'
  | 'bridge';

export type FlightProfile = 'prop-drone' | 'jet-drone' | 'cruise' | 'ballistic' | 'airstrike' | 'kab';

export type AltitudeMode = 'normal' | 'low' | 'ultra-low';

export interface MunitionSpec {
  id: MunitionId;
  name: string;
  shortName: string;
  category: string;
  launcherName: string;
  profile: FlightProfile;
  faction: 'RU' | 'UA';
  allowedTerritory?: 'UA' | 'RU';
  airLaunchedOnly?: boolean;
  canFlyLow?: boolean;
  realSpeedKmh: number;
  simSpeedKmPerSec: number;
  maxAmmo: number;
  damage: number;
  blastRadiusKm: number;
  maxRangeKm?: number;
  kabMaxRangeKm?: number;
  accentColor: string;
  exhaustColor: string;
  summary: string;
}

export interface AirDefenseSpec {
  id: AirDefenseId;
  name: string;
  shortName: string;
  category: string;
  rangeKm: number;
  maxAmmo: number;
  maxHp: number;
  cost: number;
  interceptorSpeedKmPerSec: number;
  cooldownSec: number;
  isGun: boolean;
  isMobile?: boolean;
  isRadar?: boolean;
  accentColor: string;
  summary: string;
}

export interface BuildingSpec {
  id: BuildingId;
  name: string;
  shortName: string;
  category: string;
  maxHp: number;
  incomePerSec: number;
  secondaryBlastPower: number;
  secondaryBlastRadiusKm: number;
  accentColor: string;
  summary: string;
}

export const MUNITIONS: MunitionSpec[] = [
  {
    id: 'shahed-136',
    name: 'Шахед-136',
    shortName: 'Шахед-136',
    category: 'БПЛА-камикадзе',
    launcherName: 'Рельсовая ПУ (катапульта)',
    profile: 'prop-drone',
    faction: 'RU',
    canFlyLow: true,
    realSpeedKmh: 185,
    simSpeedKmPerSec: 10,
    maxAmmo: 5,
    damage: 25,
    blastRadiusKm: 8,
    accentColor: '#F59E0B',
    exhaustColor: '#FBBF24',
    summary: 'Треугольное крыло, толкающий винт; может идти на сверхмалой высоте',
  },
  {
    id: 'shahed-238',
    name: 'Шахед-238',
    shortName: 'Шахед-238',
    category: 'Реактивный БПЛА',
    launcherName: 'Мобильная ТПК-установка',
    profile: 'jet-drone',
    faction: 'RU',
    canFlyLow: true,
    realSpeedKmh: 580,
    simSpeedKmPerSec: 21,
    maxAmmo: 4,
    damage: 35,
    blastRadiusKm: 10,
    accentColor: '#FB923C',
    exhaustColor: '#38BDF8',
    summary: 'Чёрный стелс-корпус, реактивный ТРД, маловысотный прорыв',
  },
  {
    id: 'kalibr',
    name: 'Калибр 3М-14',
    shortName: 'Калибр',
    category: 'Крылатая ракета',
    launcherName: 'Контейнерная ПУ «Калибр-К»',
    profile: 'cruise',
    faction: 'RU',
    realSpeedKmh: 880,
    simSpeedKmPerSec: 30,
    maxAmmo: 4,
    damage: 50,
    blastRadiusKm: 15,
    accentColor: '#38BDF8',
    exhaustColor: '#F97316',
    summary: 'Дозвуковая КР со складным крылом',
  },
  {
    id: 'iskander',
    name: 'Искандер-М',
    shortName: 'Искандер-М',
    category: 'Баллистическая ракета',
    launcherName: 'СПУ 9П78-1 (МЗКТ-7930)',
    profile: 'ballistic',
    faction: 'RU',
    realSpeedKmh: 7200,
    simSpeedKmPerSec: 64,
    maxAmmo: 2,
    damage: 70,
    blastRadiusKm: 20,
    accentColor: '#EF4444',
    exhaustColor: '#FDE047',
    summary: 'Высокая дуга полёта, сверхзвуковой удар',
  },
  {
    id: 'kh101',
    name: 'Ракета Х-101',
    shortName: 'Х-101',
    category: 'Стратегическая КР',
    launcherName: 'Пусковая платформа Х-101',
    profile: 'cruise',
    faction: 'RU',
    realSpeedKmh: 960,
    simSpeedKmPerSec: 33,
    maxAmmo: 4,
    damage: 55,
    blastRadiusKm: 16,
    accentColor: '#A78BFA',
    exhaustColor: '#FB923C',
    summary: 'Малозаметный гранёный корпус, большое крыло',
  },
  {
    id: 'neptune',
    name: 'Р-360 Нептун',
    shortName: 'Нептун',
    category: 'Украинская КР',
    launcherName: 'РК-360МЦ (шасси 8×8)',
    profile: 'cruise',
    faction: 'UA',
    allowedTerritory: 'UA',
    realSpeedKmh: 900,
    simSpeedKmPerSec: 31,
    maxAmmo: 4,
    damage: 45,
    blastRadiusKm: 14,
    accentColor: '#2DD4BF',
    exhaustColor: '#F59E0B',
    summary: 'Украинская противокорабельная и наземная крылатая ракета',
  },
  {
    id: 'airstrike',
    name: 'Авиаудар',
    shortName: 'Авиаудар',
    category: 'Ударная авиация',
    launcherName: 'Точка захода (Авиаудар)',
    profile: 'airstrike',
    faction: 'RU',
    realSpeedKmh: 1120,
    simSpeedKmPerSec: 36,
    maxAmmo: 1,
    damage: 30,
    blastRadiusKm: 12,
    accentColor: '#F43F5E',
    exhaustColor: '#FB923C',
    summary: 'Однократный пролёт по маршруту со сбросом 6 авиабомб',
  },
  {
    id: 'su57-kab',
    name: 'Су-57 (пуск КАБ)',
    shortName: 'Су-57 · КАБ',
    category: 'Стелс-истребитель · КАБ',
    launcherName: 'Аэродром Су-57',
    profile: 'airstrike',
    faction: 'RU',
    realSpeedKmh: 2100,
    simSpeedKmPerSec: 46,
    maxAmmo: 4,
    damage: 60,
    blastRadiusKm: 13,
    kabMaxRangeKm: 75,
    accentColor: '#38BDF8',
    exhaustColor: '#60A5FA',
    summary: 'Подлетает к рубежу ≤75 км, сбрасывает планирующий КАБ и уходит от ППО',
  },
  {
    id: 'kab',
    name: 'КАБ (УМПК)',
    shortName: 'КАБ · 75 км',
    category: 'Планирующая авиабомба',
    launcherName: 'Точка сброса КАБ (до 75 км)',
    profile: 'kab',
    faction: 'RU',
    realSpeedKmh: 850,
    simSpeedKmPerSec: 26,
    maxAmmo: 6,
    damage: 60,
    blastRadiusKm: 13,
    maxRangeKm: 75,
    accentColor: '#FB7185',
    exhaustColor: '#FDA4AF',
    summary: 'Обычный КАБ с УМПК — дальность планирования ограничена 75 км',
  },
  {
    id: 'lyutyi',
    name: 'БПЛА «Лютый» (АН-196)',
    shortName: 'Лютый',
    category: 'Украинский БПЛА',
    launcherName: 'Катапульта ВСУ «Лютый»',
    profile: 'prop-drone',
    faction: 'UA',
    allowedTerritory: 'UA',
    realSpeedKmh: 195,
    simSpeedKmPerSec: 11,
    maxAmmo: 6,
    damage: 30,
    blastRadiusKm: 9,
    accentColor: '#38BDF8',
    exhaustColor: '#FDE047',
    summary: 'Украинский дальнобойный дрон-камикадзе, ставится только в Украине',
  },
  {
    id: 'bober',
    name: 'БПЛА «Бобер» (UJ-26)',
    shortName: 'Бобер',
    category: 'Украинский БПЛА',
    launcherName: 'Рампа ВСУ «Бобер»',
    profile: 'prop-drone',
    faction: 'UA',
    allowedTerritory: 'UA',
    realSpeedKmh: 165,
    simSpeedKmPerSec: 9.5,
    maxAmmo: 6,
    damage: 25,
    blastRadiusKm: 8,
    accentColor: '#60A5FA',
    exhaustColor: '#FACC15',
    summary: 'Украинский ударный БПЛА схемы «утка», ставится только в Украине',
  },
  {
    id: 'palyanytsya',
    name: '«Паляниця» (дрон-ракета)',
    shortName: 'Паляниця',
    category: 'Украинский реакт. БПЛА',
    launcherName: 'Наземная ПУ «Паляниця»',
    profile: 'jet-drone',
    faction: 'UA',
    allowedTerritory: 'UA',
    realSpeedKmh: 680,
    simSpeedKmPerSec: 24,
    maxAmmo: 4,
    damage: 40,
    blastRadiusKm: 11,
    accentColor: '#FACC15',
    exhaustColor: '#38BDF8',
    summary: 'Украинский реактивный дрон-ракета, ставится только в Украине',
  },
  {
    id: 'peklo',
    name: '«Пекло» (ракета-дрон)',
    shortName: 'Пекло',
    category: 'Украинская ракета-дрон',
    launcherName: 'Мобильная ПУ «Пекло»',
    profile: 'cruise',
    faction: 'UA',
    allowedTerritory: 'UA',
    realSpeedKmh: 760,
    simSpeedKmPerSec: 27,
    maxAmmo: 5,
    damage: 45,
    blastRadiusKm: 13,
    accentColor: '#38BDF8',
    exhaustColor: '#FBBF24',
    summary: 'Украинская крылатая ракета-дрон ВСУ, ставится только в Украине',
  },
  {
    id: 'sapsan',
    name: 'ОТРК «Сапсан» (Гром-2)',
    shortName: 'Сапсан',
    category: 'Украинская баллистика',
    launcherName: 'СПУ ОТРК «Сапсан» (10×10)',
    profile: 'ballistic',
    faction: 'UA',
    allowedTerritory: 'UA',
    realSpeedKmh: 6400,
    simSpeedKmPerSec: 58,
    maxAmmo: 2,
    damage: 75,
    blastRadiusKm: 20,
    accentColor: '#FDE047',
    exhaustColor: '#38BDF8',
    summary: 'Украинская оперативно-тактическая баллистическая ракета',
  },
  {
    id: 'flamingo',
    name: 'КР «Фламинго» (FP-5)',
    shortName: 'Фламинго',
    category: 'Украинская тяжёлая КР',
    launcherName: 'Пусковая рампа «Фламинго»',
    profile: 'cruise',
    faction: 'UA',
    allowedTerritory: 'UA',
    realSpeedKmh: 950,
    simSpeedKmPerSec: 34,
    maxAmmo: 2,
    damage: 85,
    blastRadiusKm: 18,
    accentColor: '#F472B6',
    exhaustColor: '#FDE047',
    summary: 'Тяжёлая дальнобойная украинская крылатая ракета (БЧ ~1000 кг)',
  },
  {
    id: 'kinzhal',
    name: 'Х-47М2 «Кинжал»',
    shortName: 'Кинжал',
    category: 'Гиперзвуковая ракета',
    launcherName: 'МиГ-31К (воздушный старт)',
    profile: 'ballistic',
    faction: 'RU',
    airLaunchedOnly: true,
    realSpeedKmh: 12000,
    simSpeedKmPerSec: 84,
    maxAmmo: 1,
    damage: 90,
    blastRadiusKm: 22,
    accentColor: '#EF4444',
    exhaustColor: '#FEF08A',
    summary: 'Гиперзвуковая аэробаллистическая ракета воздушного старта с МиГ-31К',
  },
  {
    id: 'kh22',
    name: 'Ракета Х-22 / Х-32',
    shortName: 'Х-22',
    category: 'Сверхзвуковая КР',
    launcherName: 'Ту-22М3 (воздушный старт)',
    profile: 'ballistic',
    faction: 'RU',
    airLaunchedOnly: true,
    realSpeedKmh: 4600,
    simSpeedKmPerSec: 54,
    maxAmmo: 2,
    damage: 75,
    blastRadiusKm: 18,
    accentColor: '#F97316',
    exhaustColor: '#FDE047',
    summary: 'Тяжёлая сверхзвуковая противокорабельная и ударная ракета с Ту-22М3',
  },
  {
    id: 'kh69',
    name: 'Ракета Х-69',
    shortName: 'Х-69',
    category: 'Малозаметная КР',
    launcherName: 'Су-57 (внутр. отсек)',
    profile: 'cruise',
    faction: 'RU',
    airLaunchedOnly: true,
    realSpeedKmh: 1000,
    simSpeedKmPerSec: 34,
    maxAmmo: 2,
    damage: 60,
    blastRadiusKm: 15,
    accentColor: '#C084FC',
    exhaustColor: '#60A5FA',
    summary: 'Новейшая малозаметная квадратная КР воздушного старта с Су-57',
  },
];

export const AIR_DEFENSE_SYSTEMS: AirDefenseSpec[] = [
  {
    id: 'mg-pickup',
    name: 'МВГ «Пикап + Пулемёт»',
    shortName: 'Пулемёт МВГ',
    category: 'ППО · Пикап + турель',
    rangeKm: 32,
    maxAmmo: 15,
    maxHp: 35,
    cost: 150,
    interceptorSpeedKmPerSec: 130,
    cooldownSec: 0.32,
    isGun: true,
    isMobile: false,
    accentColor: '#84CC16',
    summary: 'Стационарный пикап с вращающейся турелью: 15 патронов и быстрая КД против БПЛА',
  },
  {
    id: 'gepard',
    name: 'ЗСУ «Gepard»',
    shortName: 'Gepard',
    category: 'ППО · 2×35 мм пушка',
    rangeKm: 48,
    maxAmmo: 12,
    maxHp: 55,
    cost: 280,
    interceptorSpeedKmPerSec: 125,
    cooldownSec: 2.5,
    isGun: true,
    accentColor: '#FACC15',
    summary: 'Радарная 35 мм установка против Шахедов и крылатых ракет',
  },
  {
    id: 'iris-t',
    name: 'ЗРК «IRIS-T SLM»',
    shortName: 'IRIS-T',
    category: 'ППО · Средняя дальность',
    rangeKm: 92,
    maxAmmo: 8,
    maxHp: 65,
    cost: 480,
    interceptorSpeedKmPerSec: 110,
    cooldownSec: 3.5,
    isGun: false,
    accentColor: '#22C55E',
    summary: '8-зарядная ПУ против БПЛА и КР (баллистику не перехватывает)',
  },
  {
    id: 'patriot',
    name: 'ЗРК «Patriot»',
    shortName: 'Patriot',
    category: 'ППО · ПРО / ПВО',
    rangeKm: 145,
    maxAmmo: 4,
    maxHp: 75,
    cost: 850,
    interceptorSpeedKmPerSec: 135,
    cooldownSec: 4.5,
    isGun: false,
    accentColor: '#38BDF8',
    summary: 'Единственный ЗРК, способный перехватывать «Искандер» и баллистические ракеты',
  },
  {
    id: 's300',
    name: 'ЗРК «С-300ПС»',
    shortName: 'С-300',
    category: 'ППО · Большая дальность',
    rangeKm: 135,
    maxAmmo: 4,
    maxHp: 70,
    cost: 620,
    interceptorSpeedKmPerSec: 125,
    cooldownSec: 5.0,
    isGun: false,
    accentColor: '#60A5FA',
    summary: '4-контейнерная ПУ против КР, авиации и БПЛА (баллистику не перехватывает)',
  },
  {
    id: 'radar',
    name: 'Радар ПВО (РЛС 36Д6)',
    shortName: 'Радар ПВО',
    category: 'ППО · ДРЛО и обзор',
    rangeKm: 260,
    maxAmmo: 0,
    maxHp: 50,
    cost: 250,
    interceptorSpeedKmPerSec: 0,
    cooldownSec: 0,
    isGun: false,
    isRadar: true,
    accentColor: '#22D3EE',
    summary: 'Раскрывает низколетящие Шахеды для всех ППО и расширяет радиус захвата (+45%)',
  },
];

export const BUILDINGS: BuildingSpec[] = [
  {
    id: 'residential',
    name: 'Жилой квартал',
    shortName: 'Квартал',
    category: 'Городская застройка',
    maxHp: 140,
    incomePerSec: 2,
    secondaryBlastPower: 0,
    secondaryBlastRadiusKm: 0,
    accentColor: '#94A3B8',
    summary: 'Многоэтажный жилой или административный корпус',
  },
  {
    id: 'factory',
    name: 'Промышленный завод',
    shortName: 'Завод',
    category: 'Промышленность',
    maxHp: 200,
    incomePerSec: 4,
    secondaryBlastPower: 0.75,
    secondaryBlastRadiusKm: 10,
    accentColor: '#60A5FA',
    summary: 'Производственные цеха, при поражении — детонация цеха',
  },
  {
    id: 'gas-station',
    name: 'АЗС (Заправка)',
    shortName: 'Заправка',
    category: 'Топливный узел',
    maxHp: 100,
    incomePerSec: 2,
    secondaryBlastPower: 0.95,
    secondaryBlastRadiusKm: 12,
    accentColor: '#F59E0B',
    summary: 'Топливные колонки и цистерны — огненная вспышка при ударе',
  },
  {
    id: 'oil-depot',
    name: 'Нефтебаза / НПЗ',
    shortName: 'НПЗ',
    category: 'Топливно-энерг. узел',
    maxHp: 190,
    incomePerSec: 5,
    secondaryBlastPower: 1.4,
    secondaryBlastRadiusKm: 16,
    accentColor: '#FB923C',
    summary: 'Резервуары ГСМ — мощный вторичный взрыв при прилёте',
  },
  {
    id: 'power-plant',
    name: 'ТЭС / Подстанция',
    shortName: 'ТЭС',
    category: 'Энергетика',
    maxHp: 170,
    incomePerSec: 4,
    secondaryBlastPower: 0.85,
    secondaryBlastRadiusKm: 12,
    accentColor: '#FACC15',
    summary: 'Энергоблок и трансформаторное поле высокого напряжения',
  },
  {
    id: 'ammo-depot',
    name: 'Склад БК / Арсенал',
    shortName: 'Склад БК',
    category: 'Логистика и арсенал',
    maxHp: 220,
    incomePerSec: 4,
    secondaryBlastPower: 1.65,
    secondaryBlastRadiusKm: 18,
    accentColor: '#F87171',
    summary: 'Арсенал боеприпасов — мощная вторичная детонация',
  },
  {
    id: 'port',
    name: 'Морской / речной порт',
    shortName: 'Порт',
    category: 'Портовая инфраструктура',
    maxHp: 240,
    incomePerSec: 5,
    secondaryBlastPower: 1.35,
    secondaryBlastRadiusKm: 15,
    accentColor: '#0EA5E9',
    summary: 'Причалы, портовые краны, склады и топливные терминалы',
  },
  {
    id: 'military-base',
    name: 'Военная база',
    shortName: 'Воен. база',
    category: 'Оборонный объект',
    maxHp: 250,
    incomePerSec: 5,
    secondaryBlastPower: 1.45,
    secondaryBlastRadiusKm: 14,
    accentColor: '#84CC16',
    summary: 'Укреплённый гарнизон, боксы техники и узел связи',
  },
  {
    id: 'metallurgy',
    name: 'Меткомбинат',
    shortName: 'Меткомбинат',
    category: 'Тяжёлая металлургия',
    maxHp: 230,
    incomePerSec: 5,
    secondaryBlastPower: 0.9,
    secondaryBlastRadiusKm: 11,
    accentColor: '#F97316',
    summary: 'Доменные печи, прокатные цеха и сталеплавильный узел',
  },
  {
    id: 'railway-hub',
    name: 'Ж/Д узел / Депо',
    shortName: 'Ж/Д узел',
    category: 'Транспортная логистика',
    maxHp: 175,
    incomePerSec: 4,
    secondaryBlastPower: 0.85,
    secondaryBlastRadiusKm: 10,
    accentColor: '#38BDF8',
    summary: 'Сортировочная станция, эшелоны и локомотивное депо',
  },
  {
    id: 'command-center',
    name: 'Командный пункт',
    shortName: 'Штаб / КП',
    category: 'Управление и связь',
    maxHp: 210,
    incomePerSec: 4,
    secondaryBlastPower: 0.95,
    secondaryBlastRadiusKm: 11,
    accentColor: '#A78BFA',
    summary: 'Защищённый штаб управления, РЛС связи и вертолётная площадка',
  },
  {
    id: 'bridge',
    name: 'Стратегический мост',
    shortName: 'Мост',
    category: 'Переправа и логистика',
    maxHp: 260,
    incomePerSec: 4,
    secondaryBlastPower: 0.45,
    secondaryBlastRadiusKm: 6,
    accentColor: '#2DD4BF',
    summary: 'Опорный речной переход, связывающий транспортные коридоры',
  },
];

export const MUNITION_BY_ID: Record<MunitionId, MunitionSpec> = MUNITIONS.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<MunitionId, MunitionSpec>,
);

export const AIR_DEFENSE_BY_ID: Record<AirDefenseId, AirDefenseSpec> = AIR_DEFENSE_SYSTEMS.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<AirDefenseId, AirDefenseSpec>,
);

export const BUILDING_BY_ID: Record<BuildingId, BuildingSpec> = BUILDINGS.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<BuildingId, BuildingSpec>,
);
