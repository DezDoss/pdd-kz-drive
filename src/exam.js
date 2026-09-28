// Экзамен: упражнения по порядку маршрута, общие требования КТ11 и замечания по ПДД.
// Модуль не знает про отрисовку, поэтому его целиком проверяют тесты с автопилотом.
import { PENALTIES, EXERCISES } from './rules.js';
import {
  START, HILL, RAMP, PARK, PARK_LINES, XWALK, JUNCTION, FINISH, SOLID_CENTER,
  WALLS, POLES, SPEED_LIMIT, TIME_LIMIT, insideCurbs,
} from './course.js';
import { inRect, rectPoly, polysOverlap, polyCircle } from './geom.js';
import { forceApproach, pedOnRoad, pedCrossing, placePed, npcPoly } from './actors.js';

// Можно ли остановиться до линии без экстренного торможения (не резче 3,5 м/с²)
export const canStopBefore = (d, v) => v < 0.5 || d > (v * v) / 7 + 0.3;

const PHASE_NAME = { R: 'красный', RY: 'красный с жёлтым', Y: 'жёлтый', G: 'зелёный', Gb: 'зелёный мигающий' };
const fmtS = s => s.toFixed(1).replace('.', ',') + ' с';
const fmtM = m => m.toFixed(2).replace('.', ',') + ' м';

// light: 'random' | 'red' | 'green'; ped: 'random' | 'yes' | 'no'
export function createExam({ practice = false, light = 'random', ped = 'random' } = {}) {
  return {
    practice, light, ped,
    phase: 'prep',          // prep → run → end
    t: 0,                   // время с команды «Старт»
    idx: 0, active: false,
    ex: EXERCISES.map(e => ({ id: e.id, status: 'pending', t0: null, t1: null, s: {} })),
    points: 0, log: [], remarks: [], events: [],
    result: null,
    g: { over: false, overT: 0, overNext: 0, underT: 0, hitOn: false, hitClear: 0, solidOn: false, solidClear: 0 },
  };
}

// ---------------------------------------------------------------- журнал
function penal(E, code, note = '') {
  const p = PENALTIES[code];
  const entry = { code, pts: p.pts, note, t: E.t, ex: E.ex[E.idx].id };
  E.points += p.pts;
  E.log.push(entry);
  E.events.push({ type: 'penalty', ...entry });
  if (E.points >= 100 && !E.practice) finishExam(E, 'fail');
}

function remark(E, code) {
  const ex = E.ex[E.idx].id;
  if (E.remarks.some(r => r.code === code && r.ex === ex)) return;
  const entry = { code, t: E.t, ex };
  E.remarks.push(entry);
  E.events.push({ type: 'remark', ...entry });
}

function activate(E) {
  const x = E.ex[E.idx];
  x.status = 'active';
  x.t0 = E.t;
  E.active = true;
  E.events.push({ type: 'exercise', id: x.id });
}

function close(E, status) {
  const x = E.ex[E.idx];
  x.status = status;
  x.t1 = E.t;
  E.active = false;
  E.events.push({ type: status, id: x.id });
  if (E.idx < E.ex.length - 1) E.idx++;
}

const done = E => close(E, 'done');
function skip(E, note) { penal(E, 'skip', note); close(E, 'skipped'); }

function finishExam(E, result) {
  if (E.phase === 'end') return;
  E.phase = 'end';
  E.result = result;
  E.events.push({ type: 'end', result });
}

// ---------------------------------------------------------------- упражнения
const ENTER = {
  start: () => true,
  hill: g => g.front.x > HILL.zoneX0,
  parallel: g => g.front.x > PARK.zoneX0,
  crosswalk: g => g.front.x > XWALK.zoneX0,
  junction: g => g.front.x > JUNCTION.zoneX0,
  finish: g => g.front.z < FINISH.zoneZ0 && g.front.x > JUNCTION.boxX0,
};

// Общая схема «стоп — постоять 3 с — тронуться за 30 с» для подъёма и перехода
function standAndGo(E, s, car, rules, codes) {
  if (s.moveT == null && car.v > 0.02) s.moveT = E.t;
  if (car.x > s.stopX + 0.5) {
    s.started = true;
    const stood = s.moveT - s.stopT;
    if (stood < rules.standMin) penal(E, codes.early, 'стояли ' + fmtS(stood));
  } else if (E.t - s.stopT > rules.startMax && !s.late) {
    s.late = true;
    penal(E, codes.late);
  }
}

const STEP_EX = {
  start(E, s, w, g) {
    const car = w.car;
    if (!s.moved && car.odo > 0.2) s.moved = true;
    if (!s.moved) {
      if (E.t > START.late1 && !s.late1) { s.late1 = true; penal(E, 'startLate20'); }
      if (E.t > START.late2 && !s.late2) { s.late2 = true; penal(E, 'startLate30'); }
    }
    if (!s.crossed && g.front.x > START.lineX0) {
      s.crossed = true;
      if (!car.belt) penal(E, 'belt');
      if (car.ind !== -1) penal(E, 'startSignal');
    }
    if (s.crossed && !s.offChecked) {
      if (car.ind !== -1) s.offChecked = true;
      else if (g.front.x > START.lineX1 + START.signalOffDist) { s.offChecked = true; penal(E, 'startSignalOff'); }
    }
    if (s.offChecked) done(E);
  },

  hill(E, s, w, g) {
    const car = w.car, fx = g.front.x, rx = g.rear.x;
    if (!s.stopped) {
      const onAscent = fx > HILL.fixX1 && rx < RAMP.x1;
      if (onAscent && car.stillT >= 0.25 && car.gear !== 'R') {
        s.stopped = true;
        s.stopT = E.t - car.stillT;
        s.stopX = car.x;
        s.maxBack = 0;
        if (rx < HILL.fixX1) penal(E, 'hillPos', 'задний бампер не пересёк линию фиксации');
        else if (fx > HILL.stopX1) penal(E, 'hillPos', 'передний бампер за линией «Стоп»');
      } else if (rx >= RAMP.x1) {
        s.stopped = s.started = true;
        penal(E, 'hillPos', 'проехали подъём без остановки');
        penal(E, 'hillEarly', 'остановки не было');
      }
    } else if (!s.started) {
      const back = s.stopX - car.x;
      if (back > s.maxBack) s.maxBack = back;
      if (s.maxBack > HILL.rollbackMax && !s.rolled) { s.rolled = true; penal(E, 'rollback', 'откат ' + fmtM(s.maxBack)); }
      standAndGo(E, s, car, HILL, { early: 'hillEarly', late: 'hillLate' });
    }
    if (rx > HILL.zoneX1) done(E);
  },

  parallel(E, s, w, g, dt) {
    const car = w.car;
    const touch = g.patches.some(pp => pp.some(p => PARK_LINES.some(r => inRect(r, p.x, p.z))));
    if (touch) {
      if (!s.lineOn) { s.lineOn = true; penal(E, 'parkLine'); }
      s.lineOff = 0;
    } else if (s.lineOn && (s.lineOff = (s.lineOff || 0) + dt) > 0.8) s.lineOn = false;

    const inPocket = p => p.x > PARK.x0 && p.x < PARK.x1 && p.z > PARK.z0 && p.z < PARK.z1;
    if (!s.entered && g.wheels.some(inPocket)) s.entered = true;
    const allIn = g.wheels.every(inPocket);
    if (allIn && car.stillT >= 0.5) {
      const onFix = i => g.patches[i].some(p => inRect(PARK.fix, p.x, p.z));
      s.parked = true;
      s.fixOk = onFix(1) && onFix(2);
    }
    if (s.parked && !allIn && car.gear === 'D' && !s.judged) {
      s.judged = true;
      if (!s.fixOk) penal(E, 'parkFix');
    }
    if (!s.slow && E.t - E.ex[E.idx].t0 > PARK.timeMax) { s.slow = true; penal(E, 'parkTime'); }
    if (g.front.x > PARK.zoneX1) {
      if (!s.entered) { skip(E, 'в карман не заезжали'); return; }
      if (!s.judged) {
        s.judged = true;
        if (!s.parked || !s.fixOk) penal(E, 'parkFix', s.parked ? '' : 'машина не встала в карман целиком');
      }
      done(E);
    }
  },

  crosswalk(E, s, w, g) {
    const car = w.car, fx = g.front.x;
    // Пешеход ждёт у края и выходит, когда машина остановилась (или уже проехала переход)
    if (!s.pedChecked) {
      s.pedChecked = true;
      s.pedGo = E.ped === 'yes' || (E.ped === 'random' && w.rng() < 0.6);
      if (s.pedGo) placePed(w.ped, w.rng);
    }
    if (s.pedGo && w.ped.state === 'idle' && ((s.stopped && !s.started && E.t - s.stopT > 0.8) || g.rear.x > XWALK.x1)) {
      w.ped.state = 'walk';
    }
    if (!s.stopped) {
      if (car.stillT >= 0.25 && fx < XWALK.x1) {
        s.stopped = true;
        s.stopT = E.t - car.stillT;
        s.stopX = car.x;
        if (fx > XWALK.x0) penal(E, 'zebra');
      } else if (fx > XWALK.x0 + 0.3) {
        s.stopped = s.started = true;
        penal(E, 'zebraEarly', 'не остановились перед переходом');
      }
    } else if (!s.started) {
      standAndGo(E, s, car, XWALK, { early: 'zebraEarly', late: 'zebraLate' });
    }
    if (fx > XWALK.x0 && fx < XWALK.x1 + 1 && car.v > 0.1 && pedOnRoad(w.ped)) remark(E, 'pedestrian');
    if (g.rear.x > XWALK.zoneX1) done(E);
  },

  junction(E, s, w, g, dt) {
    const car = w.car, L = w.light, fx = g.front.x;
    if (!s.forced) { s.forced = true; s.greenT = 0; forceApproach(L, w.rng, E.light); }
    if (L.phase === 'Y' && s.lastPhase !== 'Y') {
      s.yellowGo = fx > JUNCTION.stopX0 || !canStopBefore(JUNCTION.stopX0 - fx, Math.max(0, car.v));
    }
    s.lastPhase = L.phase;
    const permissive = L.phase === 'G' || L.phase === 'Gb' || (L.phase === 'Y' && s.yellowGo);
    s.permissive = permissive;
    if (!s.crossed && fx > JUNCTION.stopX1) {
      s.crossed = true;
      if (!permissive) penal(E, 'redLight', 'горел ' + PHASE_NAME[L.phase]);
    }
    if (!s.cleared) {
      if (permissive) s.greenT += dt;
      if (s.greenT > JUNCTION.slow1 && !s.slow1) { s.slow1 = true; penal(E, 'slow20'); }
      if (s.greenT > JUNCTION.slow2 && !s.slow2) { s.slow2 = true; penal(E, 'slow30'); }
      if (g.rear.z < -2.6) s.cleared = true;
    }
    if (!s.inBox && fx > JUNCTION.boxX0) {
      s.inBox = true;
      if (car.ind !== -1) penal(E, 'turnSignal');
    }
    if (g.front.z > 9 && g.front.x > JUNCTION.boxX0) { skip(E, 'по маршруту нужно было повернуть налево'); return; }
    if (g.rear.z < JUNCTION.exitZ) done(E);
  },

  finish(E, s, w, g) {
    if (g.front.z < FINISH.lineZ1) {
      if (w.car.ind !== 1) penal(E, 'finishSignal');
      done(E);
      const skipped = E.ex.some(x => x.status === 'skipped');
      finishExam(E, E.points < 100 && !skipped ? 'pass' : 'fail');
    }
  },
};

// ---------------------------------------------------------------- общие требования (КТ11) и ПДД
function globalRules(E, w, g, dt) {
  const car = w.car, G = E.g;
  if (!G.timeout && E.t > TIME_LIMIT) { G.timeout = true; penal(E, 'timeout'); }

  // 5 баллов при превышении и ещё по 5 за каждые следующие 5 секунд
  const kmh = Math.abs(car.v) * 3.6;
  if (kmh >= SPEED_LIMIT + 0.5) {
    G.underT = 0;
    if (!G.over) { G.over = true; G.overT = 0; G.overNext = 0; }
    G.overT += dt;
    if (G.overT >= G.overNext) { penal(E, 'speed', Math.round(kmh) + ' км/ч'); G.overNext += 5; }
  } else if (G.over && kmh < SPEED_LIMIT - 0.5 && (G.underT += dt) > 1) G.over = false;

  let hit = null;
  if (g.patches.some(pp => pp.some(p => !insideCurbs(p.x, p.z)))) hit = 'бордюр';
  const body = g.corners;
  for (const r of WALLS) if (polysOverlap(body, rectPoly(r))) hit = r.kind;
  for (const p of POLES) if (polyCircle(body, p.x, p.z, p.r)) hit = p.kind;
  if (polysOverlap(body, npcPoly(w.npc))) hit = 'автомобиль';
  if (w.ped.state === 'walk' && Math.abs(car.v) > 0.05 && polyCircle(body, w.ped.x, w.ped.z, 0.3)) hit = 'пешеход';
  if (hit) {
    if (!G.hitOn) { G.hitOn = true; penal(E, 'collision', hit); }
    G.hitClear = 0;
  } else if (G.hitOn && (G.hitClear += dt) > 1.5) G.hitOn = false;

  const onSolid = g.patches.some(pp => pp.some(p =>
    Math.abs(p.x - JUNCTION.center) < 0.075 && SOLID_CENTER.some(r => p.z >= r.z0 && p.z <= r.z1)));
  if (onSolid) {
    if (!G.solidOn) { G.solidOn = true; remark(E, 'solid'); }
    G.solidClear = 0;
  } else if (G.solidOn && (G.solidClear += dt) > 1.5) G.solidOn = false;

  const northbound = Math.cos(car.heading + Math.PI / 2) > 0.7;
  if (northbound && g.center.z < -2.6 && g.center.x < JUNCTION.center && g.center.x > JUNCTION.boxX0 - 1) remark(E, 'oncoming');
  return hit;
}

// Возвращает название препятствия, если машина во что-то упёрлась
export function stepExam(E, w, g, dt) {
  if (E.phase === 'end') return null;
  const car = w.car;
  if (E.phase === 'prep') {
    const ready = car.engine && car.ind === -1 && car.indTime >= 0.6;
    if (!ready && car.odo < 0.3) return null;
    E.phase = 'run';
    E.t = 0;
    E.events.push({ type: 'command' });
    activate(E);
  }
  E.t += dt;
  const hit = globalRules(E, w, g, dt);
  if (E.phase === 'end') return hit;
  const cur = E.ex[E.idx];
  if (!E.active && cur.status === 'pending' && ENTER[cur.id](g)) activate(E);
  if (E.active) STEP_EX[cur.id](E, cur.s, w, g, dt);
  return hit;
}

// ---------------------------------------------------------------- подсказка на экране
// Токены в квадратных скобках интерфейс заменяет на клавиши или кнопки
export function examHint(E, w) {
  const car = w.car;
  if (E.phase === 'end') return E.result === 'pass' ? 'Экзамен сдан' : 'Экзамен не сдан';
  if (E.phase === 'prep') {
    if (!car.belt) return 'Пристегните ремень [belt]';
    if (!car.engine) return car.gear === 'P' || car.gear === 'N' ? 'Запустите двигатель [engine]' : 'Селектор в P [gearP], затем двигатель [engine]';
    if (car.ind !== -1) return 'Подтвердите готовность левым указателем [indL]';
    return 'Ждите команды «Старт»';
  }
  const x = E.ex[E.idx], s = x.s;
  if (!E.active) return 'Дальше: ' + EXERCISES[E.idx].name;
  const stood = s.stopped && !s.started ? E.t - s.stopT : 0;
  switch (x.id) {
    case 'start':
      if (!s.moved) {
        if (car.gear !== 'D') return 'Команда «Старт»! Селектор в D [gearD]';
        if (car.handbrake) return 'Снимите стояночный тормоз [handbrake]';
        return 'Трогайтесь [gas] — не позже 20 секунд';
      }
      if (s.crossed && car.ind === -1) return 'Выключите левый указатель [indL] в пределах 10 м';
      return 'Пересеките линию «Старт» с левым указателем';
    case 'hill':
      if (!s.stopped) return 'Остановитесь на подъёме: задний бампер за жёлтой линией фиксации, передний — до белой «Стоп»';
      if (!s.started) return stood < HILL.standMin ? 'Стойте ещё ' + fmtS(HILL.standMin - stood) : 'Трогайтесь без отката: сразу газ [gas] или со стояночного тормоза [handbrake]';
      return 'Спускайтесь не быстрее 20 км/ч';
    case 'parallel':
      if (!s.entered) return 'Проедьте карман справа, остановитесь и включите задний ход [gearR]';
      if (!s.judged) return s.parked
        ? 'Машина в кармане. Селектор в D [gearD] и выезжайте'
        : 'Задним ходом в карман: правые колёса — на жёлтую линию. Вид сверху — [camera]';
      return 'Езжайте к переходу';
    case 'crosswalk':
      if (!s.stopped) return 'Остановитесь перед переходом, не заезжая на «зебру»';
      if (!s.started && stood < XWALK.standMin) return 'Стойте ещё ' + fmtS(XWALK.standMin - stood);
      if (pedCrossing(w.ped) && car.x < XWALK.x0) return 'Пропустите пешехода';
      return 'Проезжайте переход';
    case 'junction':
      if (!s.crossed && !s.permissive) return 'Запрещающий сигнал — остановитесь перед линией «Стоп»';
      if (car.ind !== -1 && !s.inBox) return 'Поворот налево: включите левый указатель [indL]';
      return 'Поворачивайте налево — на зелёный не дольше 20 секунд';
    case 'finish':
      return car.ind !== 1 ? 'Включите правый указатель [indR] до линии «Финиш»' : 'Пересеките линию «Финиш»';
  }
  return '';
}
