// Мир целиком: машина, светофор, пешеход, попутная машина и экзамен. Шаг фиксированный.
import { createCar, stepCar, carGeo, toggleIndicator, shiftGear, toggleEngine } from './car.js';
import { createLight, stepLight, crossPhase, createPed, stepPed, createNpc, stepNpc } from './actors.js';
import { createExam, stepExam } from './exam.js';
import { START_POSE, groundHeight } from './course.js';
import { mulberry32 } from './geom.js';

export const STEP = 1 / 120;

export function createWorld({ seed = Date.now() >>> 0, practice = false, light = 'random', ped = 'random' } = {}) {
  const rng = mulberry32(seed);
  return {
    seed, rng,
    car: createCar(START_POSE),
    light: createLight(rng),
    ped: createPed(),
    npc: createNpc(rng),
    exam: createExam({ practice, light, ped }),
    time: 0,
    notices: [],
    lastHit: null,
  };
}

export function applyAction(w, a) {
  const car = w.car;
  switch (a) {
    case 'belt': car.belt = !car.belt; return true;
    case 'handbrake': car.handbrake = !car.handbrake; return true;
    case 'indL': toggleIndicator(car, -1); return true;
    case 'indR': toggleIndicator(car, 1); return true;
    case 'engine':
      if (toggleEngine(car)) return true;
      w.notices.push(car.engine ? 'Сначала остановитесь' : 'Двигатель запускается только в P или N');
      return false;
    case 'gearP': case 'gearR': case 'gearN': case 'gearD':
      if (shiftGear(car, a.slice(4))) return true;
      w.notices.push('Селектор переключают только на месте');
      return false;
  }
  return false;
}

// inp: { throttle, brake, steerDir | steerAbs, actions: [...] }
export function stepWorld(w, inp, dt = STEP) {
  if (inp.actions) for (const a of inp.actions) applyAction(w, a);
  const car = w.car;
  const prev = { x: car.x, z: car.z, heading: car.heading };
  stepLight(w.light, dt);
  stepCar(car, inp, dt, groundHeight);
  const geo = carGeo(car);
  stepPed(w.ped, dt, geo.corners);
  stepNpc(w.npc, dt, crossPhase(w.light), geo.corners, w.rng);
  const hit = stepExam(w.exam, w, geo, dt);
  // упёрлись — машина останавливается на месте, сквозь препятствия не проезжает
  if (hit) { car.x = prev.x; car.z = prev.z; car.heading = prev.heading; car.v = 0; }
  w.lastHit = hit;
  w.time += dt;
  return geo;
}
