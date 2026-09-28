// Автодром-прототип. Метры; x — на восток, z — на юг; движение правостороннее.
// Нормативы зон взяты из Правил приёма экзаменов (прил. 3 к приказу МВД РК № 862, ред. на 27.07.2026):
// подъём 8–16 %, линия фиксации 0,3 м через 1 м после начала подъёма, «Стоп» 0,4 м за 1 м до его конца,
// барьеры по бокам эстакады, «Стоп» перед «зеброй» не ближе 1 м, знак 20 км/ч в 2–10 м после старта.
// Размеры кармана параллельной парковки в Правилах не указаны — здесь 7,0 × 2,6 м.
import { inAnyRect } from './geom.js';

export const CAR = {
  length: 4.4, width: 1.8, wheelbase: 2.65, rearOverhang: 0.85, frontOverhang: 0.9,
  track: 1.55, wheelR: 0.31, maxSteer: 32 * Math.PI / 180,
};

export const SPEED_LIMIT = 20;      // км/ч — общий предел на автодроме (КТ11)
export const TIME_LIMIT = 600;      // с — общее время устанавливает сам автодром; у нас 10 минут

// Полосы между линиями разметки
export const LANES = {
  west: { x0: -12, x1: 126, z0: -2.25, z1: 2.25 },
  cross: { x0: 126, x1: 134, z0: -130, z1: 60 },
};

// Внутри бордюров: разметка 0,15 м и ещё 0,2 м до камня
export const CURB_AREAS = [
  { x0: -12, x1: 126, z0: -2.6, z1: 2.6 },
  { x0: 71.5, x1: 79.5, z0: 2.25, z1: 5.2 },
  { x0: 125.65, x1: 134.35, z0: -130, z1: 60 },
];
export const insideCurbs = (x, z) => inAnyRect(CURB_AREAS, x, z);

// Упражнение 1 — старт из предстартовой зоны
export const START = { lineX0: 6.0, lineX1: 6.4, signalOffDist: 10, late1: 20, late2: 30 };
export const START_POSE = { x: START.lineX0 - 0.4 - CAR.wheelbase - CAR.frontOverhang, z: 0, heading: 0 };

// Упражнение 2 — крутой подъём и спуск: уклон 12 %
export const RAMP = { x0: 30, x1: 40, x2: 46, x3: 56, h: 1.2, lane: 1.9, wall: 2.3 };
export const HILL = {
  zoneX0: 22, zoneX1: 60,
  fixX0: 31.0, fixX1: 31.3,          // линия фиксации
  stopX0: 38.6, stopX1: 39.0,        // линия «Стоп»
  rollbackMax: 0.2, standMin: 3, startMax: 30,
};

export function rampHeight(x) {
  if (x <= RAMP.x0 || x >= RAMP.x3) return 0;
  if (x < RAMP.x1) return RAMP.h * (x - RAMP.x0) / (RAMP.x1 - RAMP.x0);
  if (x <= RAMP.x2) return RAMP.h;
  return RAMP.h * (RAMP.x3 - x) / (RAMP.x3 - RAMP.x2);
}
export const groundHeight = (x, z) => (Math.abs(z) <= RAMP.wall ? rampHeight(x) : 0);

// Упражнение 6 — параллельная парковка задним ходом, карман справа
export const PARK = {
  zoneX0: 64, zoneX1: 92,
  x0: 72, x1: 79, z0: 2.25, z1: 4.85,
  fix: { x0: 72.3, x1: 78.7, z0: 4.35, z1: 4.65 },   // правые колёса должны стоять на этой линии
  timeMax: 120,
};
export const PARK_LINES = [                          // контрольные линии
  { x0: 71.85, x1: 72.0, z0: 2.25, z1: 5.0 },
  { x0: 79.0, x1: 79.15, z0: 2.25, z1: 5.0 },
  { x0: 71.85, x1: 79.15, z0: 4.85, z1: 5.0 },
];

// Упражнение 3 — пешеходный переход в зоне регулируемого перекрёстка
export const XWALK = {
  zoneX0: 96, zoneX1: 110, stopX0: 102.6, stopX1: 103.0,
  x0: 104, x1: 108, pedX: 106, sideZ: 4.8, pedTriggerX: 92,
  standMin: 3, startMax: 30,
};

// Упражнение 7 — регулируемый перекрёсток, поворот налево
export const JUNCTION = {
  zoneX0: 112, stopX0: 123.0, stopX1: 123.4,
  boxX0: 126, boxX1: 134, center: 130, exitZ: -14,
  southStop: { x0: 126, x1: 130, z0: -7.05, z1: -6.65 },
  northStop: { x0: 130, x1: 134, z0: 6.65, z1: 7.05 },
  slow1: 20, slow2: 30,
};
export const SOLID_CENTER = [{ z0: -30, z1: -7.05 }, { z0: 7.05, z1: 25 }];   // сплошная 1.1 по x = 130

// Упражнение 10 — финиш на северной ветке
export const FINISH = { zoneZ0: -56, lineZ0: -70.4, lineZ1: -70.0 };

// Препятствия: наезд на любое — 100 баллов
export const WALLS = [
  { x0: RAMP.x0, x1: RAMP.x3, z0: RAMP.lane, z1: RAMP.wall, kind: 'барьер эстакады' },
  { x0: RAMP.x0, x1: RAMP.x3, z0: -RAMP.wall, z1: -RAMP.lane, kind: 'барьер эстакады' },
  { x0: -12.6, x1: -12.0, z0: -2.8, z1: 2.8, kind: 'ограждение' },
];

// face — куда смотрит лицевая сторона (навстречу тем, кому адресован знак)
export const LIGHTS = [
  { x: 124.2, z: 3.6, face: [-1, 0], group: 'main' },
  { x: 135.2, z: -3.4, face: [-1, 0], group: 'main' },
  { x: 125.2, z: -7.8, face: [0, -1], group: 'cross' },
  { x: 134.8, z: 7.8, face: [0, 1], group: 'cross' },
];
export const SIGNS = [
  { type: '3.24', text: '20', x: 12, z: 3.4, face: [-1, 0] },
  { type: '6.4', x: 80.2, z: 5.9, face: [-1, 0] },
  { type: '5.19', x: 104, z: 3.4, face: [-1, 0] },
  { type: '5.19', x: 108, z: -3.4, face: [-1, 0] },
  { type: '4.1.3', x: 119, z: 3.4, face: [-1, 0] },
  { type: '3.24', text: '20', x: 134.9, z: -18, face: [0, 1] },
];
export const POLES = [
  ...LIGHTS.map(l => ({ x: l.x, z: l.z, r: 0.12, kind: 'столб светофора' })),
  ...SIGNS.map(s => ({ x: s.x, z: s.z, r: 0.06, kind: 'стойка знака' })),
];

// Таблички с названиями упражнений — слева по ходу
export const BOARDS = [
  { ex: 'start', x: 9, z: -3.9, face: [-1, 0] },
  { ex: 'hill', x: 23, z: -3.9, face: [-1, 0] },
  { ex: 'parallel', x: 65, z: -3.9, face: [-1, 0] },
  { ex: 'crosswalk', x: 97, z: -3.9, face: [-1, 0] },
  { ex: 'junction', x: 113.4, z: -3.9, face: [-1, 0] },
  { ex: 'finish', x: 124.6, z: -57, face: [0, 1] },
];

// Жёлтые пунктиры начала и конца упражнений
export const ZONE_LINES = [
  { x: HILL.zoneX0 }, { x: HILL.zoneX1 }, { x: PARK.zoneX0 }, { x: PARK.zoneX1 },
  { x: XWALK.zoneX0 }, { x: XWALK.zoneX1 }, { x: JUNCTION.zoneX0 },
  { z: JUNCTION.exitZ }, { z: FINISH.zoneZ0 },
];
