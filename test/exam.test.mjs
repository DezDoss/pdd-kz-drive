import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drive } from './autopilot.mjs';
import { createCar, stepCar } from '../src/car.js';
import { groundHeight } from '../src/course.js';

const codes = w => w.exam.log.map(e => e.code);
const summary = w => JSON.stringify({
  result: w.exam.result, points: w.exam.points, phase: w.exam.phase,
  log: w.exam.log.map(e => `${e.ex}:${e.code}${e.note ? ' (' + e.note + ')' : ''}`),
  remarks: w.exam.remarks.map(r => `${r.ex}:${r.code}`),
  ex: w.exam.ex.map(x => `${x.id}:${x.status}`),
  car: { x: +w.car.x.toFixed(2), z: +w.car.z.toFixed(2) },
}, null, 1);

test('чистый заезд на зелёный без пешехода — 0 баллов', () => {
  const w = drive({ light: 'green', ped: 'no' });
  assert.equal(w.exam.result, 'pass', summary(w));
  assert.equal(w.exam.points, 0, summary(w));
  assert.deepEqual(w.exam.remarks, [], summary(w));
  assert.ok(w.exam.ex.every(x => x.status === 'done'), summary(w));
});

test('чистый заезд с красным и пешеходом — 0 баллов', () => {
  const w = drive({ light: 'red', ped: 'yes', seed: 11 });
  assert.equal(w.exam.result, 'pass', summary(w));
  assert.equal(w.exam.points, 0, summary(w));
  assert.deepEqual(w.exam.remarks, [], summary(w));
});

const mistakes = [
  ['без ремня', { noBelt: true }, 'belt', 5],
  ['старт без левого указателя', { noStartSignal: true }, 'startSignal', 5],
  ['указатель не выключен после старта', { keepStartSignal: true }, 'startSignalOff', 5],
  ['откат на подъёме', { rollback: true }, 'rollback', 20],
  ['тронулся раньше 3 секунд на подъёме', { hillEarly: true }, 'hillEarly', 25],
  ['поворот без указателя', { noTurnSignal: true }, 'turnSignal', 5],
  ['пропуск парковки', { skipParking: true }, 'skip', 100],
  ['финиш без правого указателя', { noFinishSignal: true }, 'finishSignal', 5],
];
for (const [name, opts, code, pts] of mistakes) {
  test(`ошибка: ${name} → ${code}`, () => {
    const w = drive(opts);
    assert.ok(codes(w).includes(code), summary(w));
    assert.equal(w.exam.points, pts, summary(w));
  });
}

test('превышение 20 км/ч штрафуется по 5 баллов', () => {
  const w = drive({ speeding: true });
  assert.ok(codes(w).includes('speed'), summary(w));
  assert.ok(codes(w).every(c => c === 'speed'), summary(w));
});

test('проезд на красный в режиме экзамена сразу заканчивает экзамен', () => {
  const w = drive({ light: 'red', runRed: true, practice: false });
  assert.ok(codes(w).includes('redLight'), summary(w));
  assert.equal(w.exam.result, 'fail', summary(w));
  assert.equal(w.exam.ex.find(x => x.id === 'finish').status, 'pending', summary(w));
});

test('не пропустил пешехода — замечание по ПДД без баллов', () => {
  const w = drive({ ped: 'yes', ignorePed: true, seed: 11 });
  assert.ok(w.exam.remarks.some(r => r.code === 'pedestrian'), summary(w));
});

test('физика: на уклоне 12 % без тормоза машина катится назад, с тормозом стоит', () => {
  const car = createCar({ x: 32, z: 0, heading: 0 });
  car.engine = true; car.gear = 'D'; car.handbrake = false;
  for (let i = 0; i < 120; i++) stepCar(car, { brake: 1 }, 1 / 120, groundHeight);
  assert.equal(car.v, 0);
  const x0 = car.x;
  for (let i = 0; i < 120; i++) stepCar(car, {}, 1 / 120, groundHeight);
  assert.ok(car.x < x0 - 0.2, `откат ${x0 - car.x}`);
});

test('физика: стояночный тормоз не даёт тронуться даже с газом', () => {
  const car = createCar({ x: 0, z: 0, heading: 0 });
  car.engine = true; car.gear = 'D';
  for (let i = 0; i < 240; i++) stepCar(car, { throttle: 1 }, 1 / 120, groundHeight);
  assert.equal(car.x, 0);
});
