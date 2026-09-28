// Автопилот проходит маршрут через те же входы, что и игрок: газ, тормоз, руль, кнопки.
// Чистый заезд должен давать 0 баллов, опции ниже нарочно делают по одной ошибке.
import { createWorld, stepWorld, STEP } from '../src/sim.js';
import { carGeo } from '../src/car.js';
import { CAR, START, START_POSE, JUNCTION, FINISH } from '../src/course.js';
import { pedCrossing } from '../src/actors.js';
import { canStopBefore } from '../src/exam.js';
import { clamp, wrapAngle } from '../src/geom.js';

const DEG = Math.PI / 180;
const HILL_FRONT = 37.5;            // передний бампер при остановке на подъёме
const PARK_START_X = 80.99;         // задняя ось перед заездом в карман
const PARK_STEER = Math.atan(CAR.wheelbase / 4.6) / CAR.maxSteer;
const PARK_ARC = 53.44 * DEG;       // две дуги R = 4,6 м сдвигают машину на 3,72 м вбок
const XWALK_FRONT = 102.4;
const JUNCTION_FRONT = 122.8;

function buildPath() {
  const pts = [];
  for (let x = START_POSE.x; x <= 124; x += 0.5) pts.push({ x, z: 0 });
  for (let a = 0.02; a < Math.PI / 2; a += 0.02) pts.push({ x: 124 + 8 * Math.sin(a), z: -8 + 8 * Math.cos(a) });
  for (let z = -8; z >= -110; z -= 0.5) pts.push({ x: 132, z });
  return pts;
}

function pursuit(car, path, S, Ld, global = false) {
  let best = Infinity, i = S.pi;
  const from = global ? 0 : S.pi, to = global ? path.length : Math.min(path.length, S.pi + 60);
  for (let k = from; k < to; k++) {
    const d = Math.hypot(path[k].x - car.x, path[k].z - car.z);
    if (d < best) { best = d; i = k; }
  }
  S.pi = i;
  let j = i;
  while (j < path.length - 1 && Math.hypot(path[j].x - car.x, path[j].z - car.z) < Ld) j++;
  const p = path[j];
  const alpha = wrapAngle(Math.atan2(p.z - car.z, p.x - car.x) - car.heading);
  return clamp(Math.atan2(2 * CAR.wheelbase * Math.sin(alpha), Ld) / CAR.maxSteer, -1, 1);
}

// Скорость в сторону включённой передачи
function speedCtl(car, vT) {
  const along = car.v * (car.gear === 'R' ? -1 : 1);
  if (vT <= 0) return { throttle: 0, brake: 1 };
  const err = vT - along;
  if (err > 0.05) return { throttle: clamp(0.12 + err * 0.6, 0, 1), brake: 0 };
  if (err < -0.1) return { throttle: 0, brake: clamp(-err * 0.4, 0.05, 1) };
  return { throttle: 0.06, brake: 0 };
}

// Остановка в точке: тормозим с тем замедлением, которое нужно, чтобы встать ровно в ней
function stopCtl(car, d, cruise) {
  if (d < 0.1) return { throttle: 0, brake: 1 };
  const v = Math.max(0, car.v);
  const aReq = (v * v) / (2 * (d - 0.05));
  if (aReq > 0.8) return { throttle: 0, brake: clamp(aReq / 7 + 0.1, 0, 1) };
  return speedCtl(car, Math.min(cruise, Math.sqrt(1.6 * (d - 0.05))));
}

function control(w, S, path, o) {
  const car = w.car, g = carGeo(car), E = w.exam;
  const actions = [];
  const once = (key, action) => { if (!S.done[key]) { S.done[key] = true; actions.push(action); } };
  const since = () => S.t - S.mark;
  const to = phase => { S.phase = phase; S.mark = S.t; };
  // руль сначала крутят на месте, потом едут
  const steerThen = (target, vT) => {
    const ready = Math.abs(car.steer - target * CAR.maxSteer) < 0.01;
    return { ...speedCtl(car, ready ? vT : 0), steerAbs: target };
  };
  const cruise = o.speeding && g.front.x > 8 && g.front.x < 20 ? 7.2 : 4.6;
  let out;

  switch (S.phase) {
    case 'prep':
      if (!o.noBelt) once('belt', 'belt');
      once('engine', 'engine');
      if (!o.noStartSignal && S.t > 0.2) once('indL', 'indL');
      if (E.phase === 'run' || (o.noStartSignal && S.t > 1)) { actions.push('gearD', 'handbrake'); to('go'); }
      out = { throttle: 0, brake: 1, steerAbs: 0 };
      break;

    case 'go': {
      const steerAbs = pursuit(car, path, S, 3.5);
      let vT = cruise, stopD = Infinity;
      if (g.front.x > START.lineX1 + 3 && g.front.x < 20 && !o.keepStartSignal && car.ind === -1) once('startOff', 'indL');
      if (!S.done.hill) {
        stopD = HILL_FRONT - g.front.x;
        if (car.stillT > 0.3 && Math.abs(stopD) < 0.6) { S.done.hill = true; S.hillX = car.x; to('hillWait'); }
      } else if (!S.done.park && !o.skipParking) {
        stopD = PARK_START_X - car.x;
        if (car.stillT > 0.3 && car.x > 78) { S.done.park = true; to('parkPrep'); }
      } else if (!S.done.xwalk) {
        stopD = XWALK_FRONT - g.front.x;
        if (car.stillT > 0.3 && g.front.x > 100) { S.done.xwalk = true; to('xwWait'); }
      } else if (!S.done.junction) {
        if (g.front.x > 110 && !o.noTurnSignal) once('turnL', 'indL');
        const ph = w.light.phase, d = JUNCTION.stopX0 - g.front.x;
        // на жёлтый решаем один раз — в момент его включения, как требуют ПДД
        if (ph === 'Y' && S.lastPh !== 'Y') S.yellowStop = canStopBefore(d, car.v);
        S.lastPh = ph;
        const mustStop = !o.runRed && d > 0 && (ph === 'R' || ph === 'RY' || (ph === 'Y' && S.yellowStop));
        if (mustStop) stopD = JUNCTION_FRONT - g.front.x;
        if (g.front.x > 118) vT = 3.0;
        if (g.front.x > JUNCTION.stopX1) S.done.junction = true;
      } else {
        if (g.front.z < -8 && car.ind === -1) once('turnOff', 'indL');
        if (g.front.z < FINISH.zoneZ0 && !o.noFinishSignal) once('indR', 'indR');
      }
      out = { ...(stopD < Infinity ? stopCtl(car, stopD, vT) : speedCtl(car, vT)), steerAbs };
      break;
    }

    case 'hillWait':
      out = { throttle: 0, brake: 1, steerAbs: 0 };
      if (since() > (o.hillEarly ? 1.0 : 3.4)) to('hillGo');
      break;

    case 'hillGo':
      out = o.rollback && since() < 1.6 ? { throttle: 0, brake: 0, steerAbs: 0 } : { throttle: 0.7, brake: 0, steerAbs: 0 };
      if (car.x > S.hillX + 1.5) to('go');
      break;

    case 'parkPrep':
      if (car.stillT > 0.2) once('gearR', 'gearR');
      out = { throttle: 0, brake: 1, steerAbs: PARK_STEER };
      if (car.gear === 'R' && Math.abs(car.steer - PARK_STEER * CAR.maxSteer) < 0.01) to('parkArc1');
      break;

    case 'parkArc1':
      out = steerThen(PARK_STEER, 0.8);
      if (car.heading <= -PARK_ARC) to('parkArc2');
      break;

    case 'parkArc2':
      out = steerThen(-PARK_STEER, 0.8);
      if (car.heading >= -0.003) to('parkHold');
      break;

    case 'parkHold':
      out = { throttle: 0, brake: 1, steerAbs: 0 };
      if (car.stillT > 0.8) { once('gearD', 'gearD'); to('exitArc1'); }
      break;

    case 'exitArc1':
      out = steerThen(-1, 0.6);
      if (car.heading <= -45 * DEG) to('exitArc2');
      break;

    case 'exitArc2':
      out = steerThen(1, 0.6);
      if (car.heading >= -0.01) { pursuit(car, path, S, 3.5, true); to('go'); }
      break;

    case 'xwWait':
      out = { throttle: 0, brake: 1, steerAbs: 0 };
      if (since() > 3.4 && (o.ignorePed || !pedCrossing(w.ped))) to('go');
      break;
  }
  out.actions = actions;
  return out;
}

export function drive(opts = {}) {
  const w = createWorld({
    seed: opts.seed ?? 7,
    practice: opts.practice ?? true,
    light: opts.light ?? 'green',
    ped: opts.ped ?? 'no',
  });
  const path = buildPath();
  const S = { phase: 'prep', t: 0, mark: 0, pi: 0, done: {} };
  const limit = (opts.maxTime ?? 600) / STEP;
  for (let i = 0; i < limit && w.exam.phase !== 'end'; i++) {
    stepWorld(w, control(w, S, path, opts), STEP);
    S.t += STEP;
  }
  return w;
}
