// Геометрия на плоскости x–z (ось y смотрит вверх).
// Курс отсчитывается от +x к +z: «вперёд» = (cos θ, sin θ), «вправо» = (−sin θ, cos θ).

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const approach = (v, target, step) =>
  v < target ? Math.min(target, v + step) : Math.max(target, v - step);

export function wrapAngle(a) {
  a = (a + Math.PI) % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  return a - Math.PI;
}

export function inRect(r, x, z) {
  return x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
}

export function inAnyRect(rects, x, z) {
  for (let i = 0; i < rects.length; i++) if (inRect(rects[i], x, z)) return true;
  return false;
}

export function rectPoly(r) {
  return [{ x: r.x0, z: r.z0 }, { x: r.x1, z: r.z0 }, { x: r.x1, z: r.z1 }, { x: r.x0, z: r.z1 }];
}

// Прямоугольник по центру, курсу и половинам длины/ширины: углы ПЛ, ПП, ЗП, ЗЛ
export function obb(cx, cz, th, hl, hw) {
  const c = Math.cos(th), s = Math.sin(th);
  const fx = c * hl, fz = s * hl, rx = -s * hw, rz = c * hw;
  return [
    { x: cx + fx - rx, z: cz + fz - rz },
    { x: cx + fx + rx, z: cz + fz + rz },
    { x: cx - fx + rx, z: cz - fz + rz },
    { x: cx - fx - rx, z: cz - fz - rz },
  ];
}

function separatedOnAxes(a, b) {
  for (let i = 0; i < a.length; i++) {
    const p = a[i], q = a[(i + 1) % a.length];
    const nx = q.z - p.z, nz = p.x - q.x;
    let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
    for (const v of a) { const d = v.x * nx + v.z * nz; if (d < minA) minA = d; if (d > maxA) maxA = d; }
    for (const v of b) { const d = v.x * nx + v.z * nz; if (d < minB) minB = d; if (d > maxB) maxB = d; }
    if (maxA < minB || maxB < minA) return true;
  }
  return false;
}

// Пересечение выпуклых многоугольников (теорема о разделяющей оси)
export function polysOverlap(a, b) {
  return !separatedOnAxes(a, b) && !separatedOnAxes(b, a);
}

export function pointInConvex(poly, x, z) {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const cr = (q.x - p.x) * (z - p.z) - (q.z - p.z) * (x - p.x);
    if (cr !== 0) {
      const s = cr > 0 ? 1 : -1;
      if (sign === 0) sign = s;
      else if (s !== sign) return false;
    }
  }
  return true;
}

export function distPointSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const t = len2 ? clamp(((px - ax) * dx + (pz - az) * dz) / len2, 0, 1) : 0;
  return Math.hypot(ax + dx * t - px, az + dz * t - pz);
}

export function polyCircle(poly, cx, cz, r) {
  if (pointInConvex(poly, cx, cz)) return true;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    if (distPointSeg(cx, cz, p.x, p.z, q.x, q.z) <= r) return true;
  }
  return false;
}

// Детерминированный генератор случайных чисел: одинаковый seed — одинаковый заезд
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
