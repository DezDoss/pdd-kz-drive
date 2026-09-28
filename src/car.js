// Машина с автоматической коробкой: кинематическая «велосипедная» модель от задней оси.
// На скоростях автодрома (до 20 км/ч) шины почти не скользят, поэтому этого достаточно
// и для змейки, и для парковки. Уклон эстакады считается по высотам осей.
import { CAR } from './course.js';
import { clamp, approach, wrapAngle } from './geom.js';

const G = 9.81;

export const DRIVE = {
  accel: 3.0, reverseAccel: 1.8, forwardMax: 30, reverseMax: 3.5,
  creepAccel: 0.55, creepSpeed: 1.6,     // «ползучесть» АКПП на холостых
  brake: 7.0, handbrake: 4.5, parkLock: 50, roll: 0.12, drag: 0.0005,
  steerRate: 1.1,                        // рад/с на колёсах, пока держат клавишу
  steerRateAbs: 2.4,                     // рад/с, когда руль задают пальцем
  centerRate: 0.35,                      // руль сам возвращается на ходу
};

export function createCar(pose) {
  return {
    x: pose.x, z: pose.z, heading: pose.heading,
    v: 0, steer: 0, throttle: 0, brake: 0,
    gear: 'P', engine: false, handbrake: true, belt: false,
    ind: 0, indTime: 0, indTurn: 0,
    odo: 0, stillT: 0, y: 0, pitch: 0, wheelSpin: 0,
  };
}

export function toggleIndicator(car, side) {
  car.ind = car.ind === side ? 0 : side;
  car.indTime = 0;
  car.indTurn = 0;
}

// Селектор АКПП переключается только почти на месте
export function shiftGear(car, gear) {
  if (car.gear === gear) return true;
  if (Math.abs(car.v) > 0.3) return false;
  car.gear = gear;
  return true;
}

// Двигатель запускается только в P или N
export function toggleEngine(car) {
  if (car.engine) {
    if (Math.abs(car.v) > 0.3) return false;
    car.engine = false;
    return true;
  }
  if (car.gear !== 'P' && car.gear !== 'N') return false;
  car.engine = true;
  return true;
}

// inp: { throttle 0..1, brake 0..1, steerDir −1/0/1 (клавиши) или steerAbs −1..1 (палец) }
export function stepCar(car, inp, dt, heightAt) {
  const maxS = CAR.maxSteer;
  if (inp.steerAbs != null) car.steer = approach(car.steer, clamp(inp.steerAbs, -1, 1) * maxS, DRIVE.steerRateAbs * dt);
  else if (inp.steerDir) car.steer = clamp(car.steer + inp.steerDir * DRIVE.steerRate * dt, -maxS, maxS);
  else car.steer = approach(car.steer, 0, DRIVE.centerRate * Math.min(1, Math.abs(car.v) / 3) * dt);

  car.throttle = inp.throttle || 0;
  car.brake = inp.brake || 0;

  const L = CAR.wheelbase;
  const c0 = Math.cos(car.heading), s0 = Math.sin(car.heading);
  const dh = heightAt(car.x + c0 * L, car.z + s0 * L) - heightAt(car.x, car.z);
  const sinPitch = dh / Math.hypot(L, dh);

  const dir = !car.engine ? 0 : car.gear === 'D' ? 1 : car.gear === 'R' ? -1 : 0;
  let aDrive = 0;
  if (dir) {
    const along = car.v * dir;
    const maxA = dir > 0 ? DRIVE.accel : DRIVE.reverseAccel;
    const vmax = dir > 0 ? DRIVE.forwardMax : DRIVE.reverseMax;
    const thr = car.throttle * maxA * clamp(1 - along / vmax, 0, 1);
    const creep = along < DRIVE.creepSpeed ? DRIVE.creepAccel * (1 - Math.max(0, along) / DRIVE.creepSpeed) : 0;
    aDrive = dir * (thr + creep);
  }
  const aNet = aDrive - G * sinPitch;
  const hold = car.brake * DRIVE.brake + (car.handbrake ? DRIVE.handbrake : 0)
    + (car.gear === 'P' ? DRIVE.parkLock : 0) + DRIVE.roll + DRIVE.drag * car.v * car.v;

  if (car.v === 0) {
    if (Math.abs(aNet) > hold) car.v = Math.sign(aNet) * (Math.abs(aNet) - hold) * dt;
  } else {
    const nv = car.v + (aNet - Math.sign(car.v) * hold) * dt;
    // тормоза и сопротивление останавливают машину, но не разгоняют в обратную сторону
    car.v = Math.sign(nv) !== Math.sign(car.v) && Math.abs(aNet) <= hold ? 0 : nv;
  }

  const w = car.v / L * Math.tan(car.steer);
  const h0 = car.heading;
  const hm = h0 + w * dt / 2;
  car.x += car.v * Math.cos(hm) * dt;
  car.z += car.v * Math.sin(hm) * dt;
  car.heading = wrapAngle(h0 + w * dt);
  car.odo += Math.abs(car.v) * dt;
  car.wheelSpin -= car.v * dt / CAR.wheelR;
  car.stillT = Math.abs(car.v) < 0.02 ? car.stillT + dt : 0;

  // Указатель гаснет сам, когда поворот завершён и руль вернулся, — как в настоящей машине
  if (car.ind) {
    car.indTime += dt;
    car.indTurn += wrapAngle(car.heading - h0) * car.ind;
    if (car.indTurn > 0.9 && Math.abs(car.steer) < 0.06) { car.ind = 0; car.indTime = 0; car.indTurn = 0; }
  }

  const c1 = Math.cos(car.heading), s1 = Math.sin(car.heading);
  const hr = heightAt(car.x, car.z), hf = heightAt(car.x + c1 * L, car.z + s1 * L);
  car.y = (hr + hf) / 2;
  car.pitch = Math.atan2(hf - hr, L);
}

// Габариты, колёса и точки пятен контакта (±0,3 м вдоль, ±0,1 м поперёк) для проверки линий
export function carGeo(car) {
  const c = Math.cos(car.heading), s = Math.sin(car.heading);
  const P = (lon, lat) => ({ x: car.x + c * lon - s * lat, z: car.z + s * lon + c * lat });
  const L = CAR.wheelbase, fo = L + CAR.frontOverhang, ro = -CAR.rearOverhang;
  const hw = CAR.width / 2, ht = CAR.track / 2;
  const wheelPos = [[L, -ht], [L, ht], [0, ht], [0, -ht]];          // ПЛ, ПП, ЗП, ЗЛ
  return {
    corners: [P(fo, -hw), P(fo, hw), P(ro, hw), P(ro, -hw)],
    wheels: wheelPos.map(([lon, lat]) => P(lon, lat)),
    patches: wheelPos.map(([lon, lat]) => [P(lon + 0.3, lat), P(lon - 0.3, lat), P(lon, lat + 0.1), P(lon, lat - 0.1)]),
    front: P(fo, 0),
    rear: P(ro, 0),
    center: P((fo + ro) / 2, 0),
  };
}
