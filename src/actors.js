// Светофор, пешеход и машина на поперечной улице.
import { CAR, JUNCTION, XWALK } from './course.js';
import { obb, polysOverlap, rectPoly, approach } from './geom.js';

// ---------------------------------------------------------------- светофор
// Фазы для нашего подхода (с запада). Поперечная улица получает зелёный внутри нашего красного.
export const LIGHT_DUR = { G: 10, Gb: 3, Y: 3, R: 16, RY: 2 };
const NEXT_PHASE = { G: 'Gb', Gb: 'Y', Y: 'R', R: 'RY', RY: 'G' };

export function createLight(rng) {
  const phase = rng() < 0.5 ? 'G' : 'R';
  return { phase, t: LIGHT_DUR[phase] * (0.3 + 0.7 * rng()), durR: LIGHT_DUR.R, clock: 0 };
}

export function stepLight(L, dt) {
  L.clock += dt;
  L.t -= dt;
  while (L.t <= 0) {
    L.phase = NEXT_PHASE[L.phase];
    L.t += LIGHT_DUR[L.phase];
    if (L.phase === 'R') L.durR = LIGHT_DUR.R;
  }
}

export function crossPhase(L) {
  if (L.phase !== 'R') return 'R';
  const e = L.durR - L.t, end = L.durR - 1;
  if (e < 1.5) return 'R';
  if (e < end - 6) return 'G';
  if (e < end - 3) return 'Gb';
  if (e < end) return 'Y';
  return 'R';
}

// Какие секции горят: мигающий зелёный — 2 раза в секунду
export function lamps(phase, clock) {
  const blink = clock % 0.5 < 0.25;
  return {
    r: phase === 'R' || phase === 'RY',
    y: phase === 'Y' || phase === 'RY',
    g: phase === 'G' || (phase === 'Gb' && blink),
  };
}

// На подъезде к перекрёстку чаще всего загорается жёлтый, реже — остаётся зелёный.
// scenario: 'red' | 'green' — детерминированно для тестов
export function forceApproach(L, rng, scenario) {
  if (scenario === 'green') { L.phase = 'G'; L.t = 30; return; }
  if (scenario === 'red') {
    if (L.phase !== 'R') { L.phase = 'Y'; L.t = LIGHT_DUR.Y; }
    else L.t = Math.max(L.t, 8);
    return;
  }
  if (L.phase === 'G') {
    if (rng() < 0.65) { L.phase = 'Gb'; L.t = 1.5; }
    else L.t = Math.max(L.t, 12);
  }
}

// ---------------------------------------------------------------- пешеход
export function createPed() {
  return { state: 'idle', visible: false, x: XWALK.pedX, z: XWALK.sideZ, dir: -1, speed: 1.3, walk: 0, blocked: false };
}

// Ставит пешехода на тротуар с одной из сторон; переходить он начнёт по команде экзамена
export function placePed(p, rng) {
  const fromSouth = rng() < 0.6;
  p.dir = fromSouth ? -1 : 1;
  p.z = fromSouth ? XWALK.sideZ : -XWALK.sideZ;
  p.visible = true;
}

// На проезжей части или вот-вот шагнёт на неё
export const pedOnRoad = p => p.state === 'walk' && Math.abs(p.z) < 2.85;

// Пешеход ещё не ушёл за дальний край дороги
export const pedCrossing = p => p.state === 'walk' && (Math.sign(p.z) !== p.dir || Math.abs(p.z) < 2.85);

export function stepPed(p, dt, carPoly) {
  if (p.state !== 'walk') return;
  // в стоящую на переходе машину пешеход не пойдёт — подождёт
  const ahead = { x0: p.x - 0.35, x1: p.x + 0.35, z0: Math.min(p.z, p.z + p.dir * 0.9), z1: Math.max(p.z, p.z + p.dir * 0.9) };
  p.blocked = !!carPoly && polysOverlap(rectPoly(ahead), carPoly);
  if (p.blocked) return;
  p.z += p.dir * p.speed * dt;
  p.walk += dt * p.speed * 4.2;
  if (Math.sign(p.z) === p.dir && Math.abs(p.z) > XWALK.sideZ + 0.6) p.state = 'done';
}

// ---------------------------------------------------------------- машина на поперечной улице
// Едет на юг по своей полосе, слушается своего светофора и не наезжает на игрока.
export function createNpc(rng) {
  return { x: 128, z: -125 + 20 * rng(), heading: Math.PI / 2, v: 7, wait: 0, spin: 0 };
}

export const npcPoly = n => obb(n.x, n.z, n.heading, CAR.length / 2, CAR.width / 2);

export function stepNpc(n, dt, phase, playerPoly, rng) {
  if (n.wait > 0) { n.wait -= dt; return; }
  const front = n.z + CAR.length / 2;
  let vT = 7;
  const dStop = JUNCTION.southStop.z0 - 0.2 - front;
  if (phase !== 'G' && phase !== 'Gb' && dStop > -0.5) {
    const canStop = dStop > n.v * n.v / 8;
    if (phase !== 'Y' || canStop) vT = Math.min(vT, Math.sqrt(Math.max(0, 5 * (dStop - 0.1))));
  }
  const look = Math.max(5, n.v * 1.6 + 4);
  const corridor = rectPoly({ x0: 126.3, x1: 129.7, z0: front, z1: front + look });
  if (playerPoly && polysOverlap(corridor, playerPoly)) vT = 0;
  n.v = approach(n.v, vT, (vT > n.v ? 2 : 6) * dt);
  n.z += n.v * dt;
  n.spin -= n.v * dt / CAR.wheelR;
  if (n.z > 64) { n.z = -128; n.v = 7; n.wait = 2 + 6 * rng(); }
}
