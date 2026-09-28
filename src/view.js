// Отрисовка на Three.js r128 (глобальный THREE из UMD-сборки). Вся графика процедурная.
import {
  CAR, RAMP, HILL, START, PARK, PARK_LINES, XWALK, JUNCTION, FINISH, SOLID_CENTER, WALLS,
  LIGHTS, SIGNS, BOARDS, ZONE_LINES, groundHeight,
} from './course.js';
import { EXERCISES } from './rules.js';
import { lamps, crossPhase } from './actors.js';

const T = () => window.THREE;
const RAMP_KINKS = [RAMP.x0, RAMP.x1, RAMP.x2, RAMP.x3];

// ---------------------------------------------------------------- текстуры
function canvasTex(w, h, draw, repeat) {
  const THREE = T();
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function speckle(ctx, w, h, base, dots, n, maxR = 1.6) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    ctx.globalAlpha = 0.25 + Math.random() * 0.5;
    ctx.fillStyle = dots[(Math.random() * dots.length) | 0];
    const r = 0.5 + Math.random() * maxR;
    ctx.fillRect(Math.random() * w, Math.random() * h, r, r);
  }
  ctx.globalAlpha = 1;
}

const asphaltTex = () => canvasTex(512, 512, (ctx, w, h) => {
  speckle(ctx, w, h, '#4a4f55', ['#5d636a', '#3b4045', '#6c727a', '#42474d'], 16000);
  for (let i = 0; i < 6; i++) {
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = i % 2 ? '#2f3438' : '#5a6066';
    ctx.fillRect(Math.random() * w, Math.random() * h, 60 + Math.random() * 140, 30 + Math.random() * 90);
  }
  ctx.globalAlpha = 1;
}, true);

const steppeTex = () => canvasTex(512, 512, (ctx, w, h) => {
  speckle(ctx, w, h, '#9a9c68', ['#8a9159', '#aeaa76', '#b8ab7c', '#7d8751', '#a3a36c'], 26000, 2.6);
  for (let i = 0; i < 40; i++) {
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = i % 3 ? '#8b9258' : '#bcae80';
    ctx.beginPath();
    ctx.arc(Math.random() * w, Math.random() * h, 12 + Math.random() * 40, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}, true);

const concreteTex = () => canvasTex(256, 256, (ctx, w, h) => {
  speckle(ctx, w, h, '#a4a7a6', ['#b3b6b4', '#949896', '#bcbfbd'], 5000);
}, true);

const barrierTex = () => canvasTex(256, 128, (ctx, w, h) => {
  ctx.fillStyle = '#f2f2ee';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#c8261b';
  for (let x = -h; x < w + h; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, h); ctx.lineTo(x + 32, h); ctx.lineTo(x + 32 + h, 0); ctx.lineTo(x + h, 0);
    ctx.fill();
  }
}, true);

// Знаки: лицевая сторона и серая изнанка той же формы
function signFace(type, text) {
  return canvasTex(256, 256, (ctx, w) => {
    const c = w / 2;
    const blueSquare = () => { ctx.fillStyle = '#ffffff'; roundRect(ctx, 4, 4, 248, 248, 16); ctx.fill(); ctx.fillStyle = '#0d4a9e'; roundRect(ctx, 12, 12, 232, 232, 12); ctx.fill(); };
    if (type === '3.24') {
      ctx.fillStyle = '#ffffff'; circle(ctx, c, c, 124); ctx.fill();
      ctx.fillStyle = '#d32011'; circle(ctx, c, c, 118); ctx.fill();
      ctx.fillStyle = '#ffffff'; circle(ctx, c, c, 92); ctx.fill();
      ctx.fillStyle = '#1a1a1a'; ctx.font = '700 104px "Fira Sans Extra Condensed", Arial, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, c, c + 6);
    } else if (type === '4.1.3') {
      ctx.fillStyle = '#ffffff'; circle(ctx, c, c, 124); ctx.fill();
      ctx.fillStyle = '#0d4a9e'; circle(ctx, c, c, 118); ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 30; ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(150, 205); ctx.lineTo(150, 118); ctx.quadraticCurveTo(150, 96, 128, 96); ctx.lineTo(100, 96); ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(52, 96); ctx.lineTo(106, 52); ctx.lineTo(106, 140); ctx.closePath(); ctx.fill();
    } else if (type === '5.19') {
      blueSquare();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(c, 34); ctx.lineTo(226, 214); ctx.lineTo(30, 214); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#1a1a1a';
      for (let i = 0; i < 5; i++) ctx.fillRect(74 + i * 24, 186, 12, 20);
      circle(ctx, 134, 96, 12); ctx.fill();
      ctx.lineWidth = 13; ctx.lineCap = 'round'; ctx.strokeStyle = '#1a1a1a';
      ctx.beginPath(); ctx.moveTo(130, 112); ctx.lineTo(122, 150); ctx.lineTo(104, 178); ctx.moveTo(122, 150); ctx.lineTo(142, 178); ctx.moveTo(128, 122); ctx.lineTo(106, 138); ctx.moveTo(130, 122); ctx.lineTo(152, 136); ctx.stroke();
    } else if (type === '6.4') {
      blueSquare();
      ctx.fillStyle = '#ffffff'; ctx.font = '700 176px "Fira Sans Extra Condensed", Arial, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('P', c, c + 10);
    }
  });
}

function signBack(type) {
  return canvasTex(128, 128, ctx => {
    ctx.fillStyle = '#8c9298';
    if (type === '3.24' || type === '4.1.3') { circle(ctx, 64, 64, 62); ctx.fill(); } else { roundRect(ctx, 2, 2, 124, 124, 8); ctx.fill(); }
  });
}

function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); }
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function boardTex(no, name) {
  return canvasTex(512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff'; roundRect(ctx, 0, 0, w, h, 18); ctx.fill();
    ctx.fillStyle = '#0d4a9e'; roundRect(ctx, 8, 8, w - 16, h - 16, 12); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center';
    ctx.font = '700 44px "Fira Sans Extra Condensed", Arial, sans-serif';
    ctx.fillText('УПРАЖНЕНИЕ № ' + no, w / 2, 72);
    ctx.font = '800 ' + (name.length > 14 ? 58 : 76) + 'px "Fira Sans Extra Condensed", Arial, sans-serif';
    ctx.fillText(name.toUpperCase(), w / 2, 170);
  });
}

// Надписи и стрелка на асфальте: белое на прозрачном
function paintTex(w, h, draw) {
  return canvasTex(w, h, ctx => { ctx.fillStyle = '#f4f4f0'; ctx.strokeStyle = '#f4f4f0'; draw(ctx); });
}

const glowTex = () => canvasTex(128, 128, ctx => {
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
});

// ---------------------------------------------------------------- геометрия
function flatQuad(x0, z0, x1, z1, y, uvScale) {
  const THREE = T();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1], 3));
  const u = v => v / uvScale;
  g.setAttribute('uv', new THREE.Float32BufferAttribute([u(x0), u(-z0), u(x1), u(-z0), u(x1), u(-z1), u(x0), u(-z1)], 2));
  g.setIndex([0, 2, 1, 0, 3, 2]);
  g.computeVertexNormals();
  return g;
}

// Прямоугольники разметки одним мешем; на эстакаде ложатся по профилю
function markingGeo(rects, lift) {
  const THREE = T();
  const pos = [], idx = [];
  for (const r of rects) {
    const xs = [r.x0, ...RAMP_KINKS.filter(k => k > r.x0 && k < r.x1), r.x1];
    const zm = (r.z0 + r.z1) / 2;
    for (let i = 0; i < xs.length - 1; i++) {
      const a = xs[i], b = xs[i + 1], ya = groundHeight(a, zm) + lift, yb = groundHeight(b, zm) + lift;
      const n = pos.length / 3;
      pos.push(a, ya, r.z0, b, yb, r.z0, b, yb, r.z1, a, ya, r.z1);
      idx.push(n, n + 2, n + 1, n, n + 3, n + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function mergeBoxes(boxes) {
  const THREE = T();
  const pos = [], nrm = [];
  for (const b of boxes) {
    const g = new THREE.BoxGeometry(b.x1 - b.x0, b.h, b.z1 - b.z0).toNonIndexed();
    g.translate((b.x0 + b.x1) / 2, (b.y || 0) + b.h / 2, (b.z0 + b.z1) / 2);
    pos.push(...g.attributes.position.array);
    nrm.push(...g.attributes.normal.array);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return g;
}

const faceAngle = f => Math.atan2(f[0], f[1]);

// ---------------------------------------------------------------- модели
function makeCar(color, withSchoolSign) {
  const THREE = T();
  const root = new THREE.Group();
  root.rotation.order = 'YZX';
  const paint = new THREE.MeshStandardMaterial({ color, metalness: 0.35, roughness: 0.38 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1b2631, metalness: 0.6, roughness: 0.12 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x1c1f23, roughness: 0.7 });
  const lamp = (c, i = 0) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i, roughness: 0.4 });
  const add = (geo, mat, x, y, z, parent = root) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };

  const s = new THREE.Shape();
  s.moveTo(-0.85, 0.36);
  s.lineTo(-0.9, 0.64);
  s.quadraticCurveTo(-0.92, 0.88, -0.72, 0.94);
  s.lineTo(0.3, 0.97);
  s.lineTo(2.25, 0.95);
  s.quadraticCurveTo(3.2, 0.9, 3.46, 0.8);
  s.quadraticCurveTo(3.6, 0.72, 3.58, 0.5);
  s.lineTo(3.52, 0.34);
  s.lineTo(3.1, 0.32);
  s.absarc(2.65, 0.3, 0.42, 0, Math.PI, false);
  s.lineTo(0.42, 0.32);
  s.absarc(0, 0.3, 0.42, 0, Math.PI, false);
  s.lineTo(-0.85, 0.36);
  const bodyGeo = new THREE.ExtrudeGeometry(s, { depth: 1.7, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 2, curveSegments: 10 });
  bodyGeo.translate(0, 0, -0.85);
  add(bodyGeo, paint, 0, 0, 0);

  const cab = new THREE.Shape();
  cab.moveTo(0.18, 0.93); cab.lineTo(0.74, 1.4); cab.lineTo(1.78, 1.43); cab.lineTo(2.4, 0.95); cab.lineTo(0.18, 0.93);
  const cabGeo = new THREE.ExtrudeGeometry(cab, { depth: 1.36, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1 });
  cabGeo.translate(0, 0, -0.68);
  const cabin = new THREE.Group();
  root.add(cabin);
  add(cabGeo, glass, 0, 0, 0, cabin);
  add(new THREE.BoxGeometry(1.0, 0.05, 1.36), paint, 1.26, 1.44, 0, cabin);
  add(new THREE.BoxGeometry(0.1, 0.46, 1.43), paint, 1.3, 1.18, 0, cabin);
  add(new THREE.BoxGeometry(0.1, 0.1, 0.2), paint, 2.28, 1.0, 0.98);
  add(new THREE.BoxGeometry(0.1, 0.1, 0.2), paint, 2.28, 1.0, -0.98);

  add(new THREE.BoxGeometry(0.12, 0.22, 1.72), trim, 3.56, 0.42, 0);
  add(new THREE.BoxGeometry(0.12, 0.22, 1.72), trim, -0.88, 0.45, 0);
  add(new THREE.BoxGeometry(0.04, 0.14, 0.9), trim, 3.6, 0.62, 0);
  const plate = new THREE.MeshStandardMaterial({ color: 0xf5f5f2, roughness: 0.5 });
  add(new THREE.BoxGeometry(0.02, 0.11, 0.52), plate, -0.95, 0.52, 0);
  add(new THREE.BoxGeometry(0.02, 0.11, 0.52), plate, 3.63, 0.44, 0);

  const head = lamp(0xfff3d6, 0.5), tail = lamp(0xd01810, 0.2), rev = lamp(0xffffff, 0);
  const indL = lamp(0xff9a1a, 0), indR = lamp(0xff9a1a, 0);
  for (const z of [-0.58, 0.58]) {
    add(new THREE.BoxGeometry(0.06, 0.12, 0.36), head, 3.55, 0.7, z);
    add(new THREE.BoxGeometry(0.05, 0.14, 0.38), tail, -0.87, 0.82, z);
    add(new THREE.BoxGeometry(0.04, 0.07, 0.14), rev, -0.88, 0.66, z * 0.52);
  }
  for (const [mat, z] of [[indL, -1], [indR, 1]]) {
    add(new THREE.BoxGeometry(0.05, 0.07, 0.14), mat, 3.54, 0.7, 0.82 * z);
    add(new THREE.BoxGeometry(0.05, 0.07, 0.1), mat, -0.86, 0.82, 0.8 * z);
    add(new THREE.BoxGeometry(0.12, 0.035, 0.02), mat, 2.95, 0.84, 0.91 * z);
  }

  if (withSchoolSign) {
    const tex = canvasTex(128, 128, ctx => {
      ctx.fillStyle = '#d32011'; ctx.beginPath(); ctx.moveTo(64, 6); ctx.lineTo(124, 118); ctx.lineTo(4, 118); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(64, 26); ctx.lineTo(108, 108); ctx.lineTo(20, 108); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#1a1a1a'; ctx.font = '800 54px "Fira Sans Extra Condensed", Arial, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('У', 64, 98);
    });
    const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6 });
    const tri = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), mat);
    tri.position.set(1.2, 1.64, 0);
    tri.rotation.y = Math.PI / 2;
    tri.castShadow = true;
    cabin.add(tri);
    add(new THREE.BoxGeometry(0.2, 0.05, 0.2), trim, 1.2, 1.48, 0, cabin);
  }

  // Салон: торпедо и руль. Снаружи их закрывает тонированное стекло, видны только из салона
  const dashMat = new THREE.MeshStandardMaterial({ color: 0x24282c, roughness: 0.85 });
  add(new THREE.BoxGeometry(2.2, 0.06, 1.3), dashMat, 1.2, 0.98, 0);
  add(new THREE.BoxGeometry(0.55, 0.14, 1.36), dashMat, 2.08, 0.94, 0);
  const column = new THREE.Group();            // наклон рулевой колонки
  column.position.set(1.78, 0.93, -0.37);
  column.rotation.z = -0.45;
  const steeringWheel = new THREE.Group();     // вращение руля вокруг своей оси
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.02, 8, 28), dashMat);
  rim.rotation.y = Math.PI / 2;
  const hubBar = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.32), dashMat);
  steeringWheel.add(rim, hubBar);
  column.add(steeringWheel);
  root.add(column);

  const tireMat = new THREE.MeshStandardMaterial({ color: 0x191a1b, roughness: 0.92 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xb9bec4, metalness: 0.8, roughness: 0.32 });
  const tireGeo = new THREE.CylinderGeometry(CAR.wheelR, CAR.wheelR, 0.21, 22); tireGeo.rotateX(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.19, 0.19, 0.215, 10); rimGeo.rotateX(Math.PI / 2);
  const spokeGeo = new THREE.BoxGeometry(0.34, 0.05, 0.22);
  const wheels = [];
  for (const [lon, lat] of [[CAR.wheelbase, -CAR.track / 2], [CAR.wheelbase, CAR.track / 2], [0, CAR.track / 2], [0, -CAR.track / 2]]) {
    const pivot = new THREE.Group();
    pivot.position.set(lon, CAR.wheelR, lat);
    const spin = new THREE.Group();
    pivot.add(spin);
    add(tireGeo, tireMat, 0, 0, 0, spin);
    add(rimGeo, rimMat, 0, 0, 0, spin);
    add(spokeGeo, trim, 0, 0, 0, spin);
    root.add(pivot);
    wheels.push({ pivot, spin });
  }
  return { root, cabin, wheels, head, tail, rev, indL, indR, steeringWheel };
}

function makePed() {
  const THREE = T();
  const g = new THREE.Group();
  const jacket = new THREE.MeshStandardMaterial({ color: 0xd9632e, roughness: 0.8 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x2e3642, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc99f7e, roughness: 0.8 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x2a211d, roughness: 0.9 });
  const add = (geo, mat, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  add(new THREE.CylinderGeometry(0.17, 0.2, 0.62, 10), jacket, 0, 1.13, 0);
  add(new THREE.SphereGeometry(0.11, 14, 10), skin, 0, 1.58, 0);
  add(new THREE.SphereGeometry(0.116, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), hair, 0, 1.6, 0);
  const limb = (y, z, len, w, mat) => {
    const p = new THREE.Group(); p.position.set(0, y, z); g.add(p);
    add(new THREE.BoxGeometry(w, len, w + 0.02), mat, 0, -len / 2, 0, p);
    return p;
  };
  const legs = [limb(0.84, -0.09, 0.84, 0.13, pants), limb(0.84, 0.09, 0.84, 0.13, pants)];
  const arms = [limb(1.4, -0.24, 0.6, 0.09, jacket), limb(1.4, 0.24, 0.6, 0.09, jacket)];
  return { root: g, legs, arms };
}

function makeTrafficLight(glow) {
  const THREE = T();
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x6d7378, metalness: 0.6, roughness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1f2326, roughness: 0.7 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 });
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  add(new THREE.CylinderGeometry(0.06, 0.07, 3.3, 10), metal, 0, 1.65, 0);
  add(new THREE.BoxGeometry(0.56, 1.24, 0.02), white, 0, 3.05, -0.16);
  add(new THREE.BoxGeometry(0.5, 1.16, 0.03), dark, 0, 3.05, -0.145);
  add(new THREE.BoxGeometry(0.34, 1.0, 0.26), dark, 0, 3.05, 0);
  const lampsArr = [];
  [['r', 0.31, 0xff3b2f, 0x3a1310], ['y', 0, 0xffc21a, 0x3a2d0a], ['g', -0.31, 0x2dff8a, 0x0c2a19]].forEach(([k, dy, on, off]) => {
    const mat = new THREE.MeshBasicMaterial({ color: off });
    add(new THREE.CircleGeometry(0.11, 20), mat, 0, 3.05 + dy, 0.131);
    add(new THREE.BoxGeometry(0.28, 0.02, 0.14), dark, 0, 3.05 + dy + 0.13, 0.2);
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({
      map: glow, color: on, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85,
    }));
    halo.position.set(0, 3.05 + dy, 0.16);
    g.add(halo);
    lampsArr.push({ k, mat, halo, on: new THREE.Color(on), off: new THREE.Color(off) });
  });
  return { root: g, lamps: lampsArr };
}

// ---------------------------------------------------------------- сцена
export function createView(canvas) {
  const THREE = T();
  const small = Math.min(window.innerWidth, window.innerHeight) < 600;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const aniso = renderer.capabilities.getMaxAnisotropy();

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xd6e0e6, 110, 420);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.05, 900);

  // небо: вертикальный градиент на куполе
  {
    const geo = new THREE.SphereGeometry(600, 32, 16);
    const top = new THREE.Color(0x5f97d0), hor = new THREE.Color(0xdbe5ec), low = new THREE.Color(0xc9ccc0);
    const col = [];
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / 600;
      const c = y > 0 ? hor.clone().lerp(top, Math.pow(y, 0.55)) : hor.clone().lerp(low, Math.min(1, -y * 4));
      col.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    scene.add(sky);
    scene.userData.sky = sky;
  }

  scene.add(new THREE.HemisphereLight(0xdfe9f3, 0x7d7650, 0.8));
  const sun = new THREE.DirectionalLight(0xfff1dc, 1.25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 220 });
  sun.shadow.bias = -0.0004;
  scene.add(sun, sun.target);

  const texA = asphaltTex(), texG = steppeTex(), texC = concreteTex(), texB = barrierTex(), glow = glowTex();
  [texA, texG, texC, texB].forEach(t => { t.anisotropy = aniso; });

  const ground = new THREE.Mesh(flatQuad(-300, -340, 420, 300, -0.03, 12), new THREE.MeshStandardMaterial({ map: texG, roughness: 1 }));
  ground.receiveShadow = true;
  scene.add(ground);

  const asphalt = new THREE.MeshStandardMaterial({ map: texA, roughness: 0.92 });
  for (const r of [
    { x0: -12, x1: 126, z0: -2.6, z1: 2.6 },
    { x0: 71.5, x1: 79.5, z0: 2.6, z1: 5.2 },
    { x0: 125.65, x1: 134.35, z0: -130, z1: 60 },
  ]) {
    const m = new THREE.Mesh(flatQuad(r.x0, r.z0, r.x1, r.z1, 0, 7), asphalt);
    m.receiveShadow = true;
    scene.add(m);
  }

  // эстакада: верх по профилю, барьеры по бокам
  {
    const pos = [], uv = [], idx = [];
    RAMP_KINKS.forEach((x, i) => {
      const y = groundHeight(x, 0);
      pos.push(x, y, -RAMP.lane, x, y, RAMP.lane);
      uv.push(x / 3, RAMP.lane / 3, x / 3, -RAMP.lane / 3);
      if (i) { const n = i * 2; idx.push(n - 2, n - 1, n + 1, n - 2, n + 1, n); }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const top = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: texC, roughness: 0.95 }));
    top.receiveShadow = true;
    scene.add(top);
    const prof = new THREE.Shape();
    prof.moveTo(RAMP.x0, 0); prof.lineTo(RAMP.x0, 0.5); prof.lineTo(RAMP.x1, RAMP.h + 0.5);
    prof.lineTo(RAMP.x2, RAMP.h + 0.5); prof.lineTo(RAMP.x3, 0.5); prof.lineTo(RAMP.x3, 0); prof.lineTo(RAMP.x0, 0);
    const wallGeo = new THREE.ExtrudeGeometry(prof, { depth: RAMP.wall - RAMP.lane, bevelEnabled: false });
    texB.repeat.set(0.5, 1.6);
    const wallMat = new THREE.MeshStandardMaterial({ map: texB, roughness: 0.8 });
    for (const z of [RAMP.lane, -RAMP.wall]) {
      const m = new THREE.Mesh(wallGeo, wallMat);
      m.position.z = z;
      m.castShadow = m.receiveShadow = true;
      scene.add(m);
    }
  }

  // бордюры, тротуары у перехода, ограждение в конце западной ветки
  {
    const curb = [
      [-12, 30, -2.8, -2.6], [56, 100, -2.8, -2.6], [112, 125.65, -2.8, -2.6],
      [-12, 30, 2.6, 2.8], [56, 71.5, 2.6, 2.8], [79.5, 100, 2.6, 2.8], [112, 125.65, 2.6, 2.8],
      [71.3, 79.7, 5.2, 5.4], [71.3, 71.5, 2.8, 5.2], [79.5, 79.7, 2.8, 5.2],
      [125.45, 125.65, -130, -2.8], [125.45, 125.65, 2.8, 60], [134.35, 134.55, -130, 60],
    ].map(([x0, x1, z0, z1]) => ({ x0, x1, z0, z1, h: 0.15 }));
    const cm = new THREE.Mesh(mergeBoxes(curb), new THREE.MeshStandardMaterial({ color: 0xb9bcbe, roughness: 0.9 }));
    cm.receiveShadow = cm.castShadow = true;
    scene.add(cm);
    const walk = new THREE.Mesh(mergeBoxes([
      { x0: 100, x1: 112, z0: -6.2, z1: -2.6, h: 0.15 }, { x0: 100, x1: 112, z0: 2.6, z1: 6.2, h: 0.15 },
    ]), new THREE.MeshStandardMaterial({ color: 0xc8c3b6, roughness: 0.95 }));
    walk.receiveShadow = true;
    scene.add(walk);
    const end = WALLS[2];
    const block = new THREE.Mesh(new THREE.BoxGeometry(end.x1 - end.x0, 0.9, end.z1 - end.z0), new THREE.MeshStandardMaterial({ map: texB, roughness: 0.8 }));
    block.position.set((end.x0 + end.x1) / 2, 0.45, 0);
    block.castShadow = true;
    scene.add(block);
  }

  // разметка
  {
    const W = [], Y = [];
    const edge = 0.15;
    for (const [x0, x1] of [[-12, 30], [56, 126]]) W.push({ x0, x1, z0: -2.25 - edge, z1: -2.25 });
    for (const [x0, x1] of [[-12, 30], [56, 71.85], [79.15, 126]]) W.push({ x0, x1, z0: 2.25, z1: 2.25 + edge });
    W.push({ x0: 125.85, x1: 126, z0: -130, z1: -2.25 }, { x0: 125.85, x1: 126, z0: 2.25, z1: 60 }, { x0: 134, x1: 134 + edge, z0: -130, z1: 60 });
    for (const r of SOLID_CENTER) W.push({ x0: 129.925, x1: 130.075, z0: r.z0, z1: r.z1 });
    for (let z = -130; z < -30; z += 9) W.push({ x0: 129.925, x1: 130.075, z0: z, z1: Math.min(z + 3, -30) });
    for (let z = 25; z < 60; z += 9) W.push({ x0: 129.925, x1: 130.075, z0: z, z1: z + 3 });
    W.push({ x0: -0.15, x1: 0, z0: -2.25, z1: 2.25 });
    W.push({ x0: START.lineX0, x1: START.lineX1, z0: -2.25, z1: 2.25 });
    W.push({ x0: HILL.stopX0, x1: HILL.stopX1, z0: -RAMP.lane, z1: RAMP.lane });
    Y.push({ x0: HILL.fixX0, x1: HILL.fixX1, z0: -RAMP.lane, z1: RAMP.lane });
    W.push(...PARK_LINES);
    Y.push(PARK.fix);
    W.push({ x0: XWALK.stopX0, x1: XWALK.stopX1, z0: -2.25, z1: 2.25 });
    for (const c of [-1.65, -0.55, 0.55, 1.65]) W.push({ x0: XWALK.x0, x1: XWALK.x1, z0: c - 0.25, z1: c + 0.25 });
    W.push({ x0: JUNCTION.stopX0, x1: JUNCTION.stopX1, z0: -2.25, z1: 2.25 }, JUNCTION.southStop, JUNCTION.northStop);
    W.push({ x0: 130, x1: 134, z0: FINISH.lineZ0, z1: FINISH.lineZ1 });
    for (const l of ZONE_LINES) {
      if (l.x != null) {
        const half = l.x > RAMP.x0 - 1 && l.x < RAMP.x3 + 1 ? RAMP.lane : 2.25;
        for (let z = -half; z < half; z += 0.25) Y.push({ x0: l.x, x1: l.x + 0.1, z0: z, z1: Math.min(z + 0.15, half) });
      } else {
        for (let x = 130; x < 134; x += 0.25) Y.push({ x0: x, x1: Math.min(x + 0.15, 134), z0: l.z - 0.1, z1: l.z });
      }
    }
    const mat = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const wm = new THREE.Mesh(markingGeo(W, 0.012), mat(0xf1f1ec));
    const ym = new THREE.Mesh(markingGeo(Y, 0.013), mat(0xf2c200));
    wm.receiveShadow = ym.receiveShadow = true;
    scene.add(wm, ym);
  }

  // надписи и стрелка на асфальте
  const decal = (tex, w, h, x, z, rotY) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({
      map: tex, transparent: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, depthWrite: false,
    }));
    m.rotation.order = 'YXZ';
    m.rotation.set(-Math.PI / 2, rotY, 0);
    m.position.set(x, 0.014, z);
    m.receiveShadow = true;
    scene.add(m);
  };
  const word = text => paintTex(512, 160, ctx => {
    ctx.font = '800 150px "Fira Sans Extra Condensed", Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.save(); ctx.scale(1, 1); ctx.fillText(text, 256, 88); ctx.restore();
  });
  decal(word('СТАРТ'), 3.2, 1.0, 8.4, 0, -Math.PI / 2);
  decal(word('ФИНИШ'), 3.2, 1.0, 132, -73, 0);
  decal(paintTex(256, 512, ctx => {
    ctx.lineWidth = 34; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(150, 512); ctx.lineTo(150, 230); ctx.quadraticCurveTo(150, 170, 90, 170); ctx.lineTo(80, 170); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(10, 170); ctx.lineTo(96, 100); ctx.lineTo(96, 240); ctx.closePath(); ctx.fill();
  }), 1.1, 2.2, 116, 0, -Math.PI / 2);

  // знаки
  for (const s of SIGNS) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.5, 8), new THREE.MeshStandardMaterial({ color: 0x8b9197, metalness: 0.5, roughness: 0.5 }));
    pole.position.y = 1.25;
    pole.castShadow = true;
    const faceTex = signFace(s.type, s.text);
    faceTex.anisotropy = aniso;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), new THREE.MeshStandardMaterial({
      map: faceTex, alphaTest: 0.5, roughness: 0.55, emissive: 0xffffff, emissiveMap: faceTex, emissiveIntensity: 0.18,
    }));
    face.position.set(0, 2.15, 0.04);
    face.castShadow = true;
    const back = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), new THREE.MeshStandardMaterial({ map: signBack(s.type), alphaTest: 0.5 }));
    back.position.set(0, 2.15, 0.03);
    back.rotation.y = Math.PI;
    g.add(pole, face, back);
    g.position.set(s.x, 0, s.z);
    g.rotation.y = faceAngle(s.face);
    scene.add(g);
  }

  // таблички упражнений
  for (const b of BOARDS) {
    const ex = EXERCISES.find(e => e.id === b.ex);
    const tex = boardTex(ex.no, ex.short);
    tex.anisotropy = aniso;
    const g = new THREE.Group();
    const leg = new THREE.MeshStandardMaterial({ color: 0x8b9197, metalness: 0.5, roughness: 0.5 });
    for (const x of [-0.7, 0.7]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.3, 8), leg);
      p.position.set(x, 1.15, -0.02);
      p.castShadow = true;
      g.add(p);
    }
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.9), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.15 }));
    face.position.y = 2.05;
    face.castShadow = true;
    const back = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.9), new THREE.MeshStandardMaterial({ color: 0x8c9298 }));
    back.position.set(0, 2.05, -0.01);
    back.rotation.y = Math.PI;
    g.add(face, back);
    g.position.set(b.x, 0, b.z);
    g.rotation.y = faceAngle(b.face);
    scene.add(g);
  }

  // светофоры
  const lights = LIGHTS.map(l => {
    const tl = makeTrafficLight(glow);
    tl.root.position.set(l.x, 0, l.z);
    tl.root.rotation.y = faceAngle(l.face);
    scene.add(tl.root);
    return { ...tl, group: l.group };
  });

  // здание автодрома, флагшток, тополя и фонари
  {
    const bld = new THREE.Group();
    const panel = new THREE.MeshStandardMaterial({ color: 0xd9dcdf, roughness: 0.85 });
    const band = new THREE.MeshStandardMaterial({ color: 0x0d4a9e, roughness: 0.6 });
    const win = new THREE.MeshStandardMaterial({ color: 0x2a3a4a, metalness: 0.5, roughness: 0.2 });
    const box = (w, h, d, x, y, z, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; bld.add(o); };
    box(20, 6.4, 9, 0, 3.2, 0, panel);
    box(20.2, 0.9, 9.2, 0, 6.1, 0, band);
    box(18, 1.4, 0.1, 0, 4.2, 4.52, win);
    box(18, 1.4, 0.1, 0, 1.6, 4.52, win);
    const title = canvasTex(1024, 128, (ctx, w, h) => {
      ctx.fillStyle = '#0d4a9e'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ffffff'; ctx.font = '800 92px "Fira Sans Extra Condensed", Arial, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('АВТОДРОМ · КАТЕГОРИЯ B', w / 2, h / 2 + 4);
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(12, 1.5), new THREE.MeshStandardMaterial({ map: title, emissive: 0xffffff, emissiveMap: title, emissiveIntensity: 0.2 }));
    sign.position.set(0, 6.1, 4.62);
    bld.add(sign);
    bld.position.set(1, 0, -19);
    scene.add(bld);

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 9, 10), new THREE.MeshStandardMaterial({ color: 0xcfd3d6, metalness: 0.6, roughness: 0.4 }));
    pole.position.set(14, 4.5, -11);
    pole.castShadow = true;
    scene.add(pole);
    const flag = canvasTex(360, 180, (ctx, w, h) => {
      ctx.fillStyle = '#00afca'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#fec50c';
      ctx.beginPath(); ctx.arc(w / 2 + 12, h / 2 - 10, 30, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 32; i++) {
        const a = (i / 32) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(w / 2 + 12 + Math.cos(a) * 36, h / 2 - 10 + Math.sin(a) * 36);
        ctx.lineTo(w / 2 + 12 + Math.cos(a + 0.06) * 50, h / 2 - 10 + Math.sin(a + 0.06) * 50);
        ctx.lineTo(w / 2 + 12 + Math.cos(a - 0.06) * 50, h / 2 - 10 + Math.sin(a - 0.06) * 50);
        ctx.fill();
      }
      ctx.beginPath(); ctx.moveTo(w / 2 - 50, h / 2 + 40); ctx.quadraticCurveTo(w / 2 + 12, h / 2 + 18, w / 2 + 74, h / 2 + 40);
      ctx.quadraticCurveTo(w / 2 + 12, h / 2 + 28, w / 2 - 50, h / 2 + 40); ctx.fill();
      for (let y = 8; y < h; y += 20) ctx.fillRect(14, y, 16, 12);
    });
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.1, 12, 1), new THREE.MeshStandardMaterial({ map: flag, side: THREE.DoubleSide, roughness: 0.8 }));
    fl.position.set(15.15, 8.3, -11);
    fl.castShadow = true;
    scene.add(fl);
    scene.userData.flag = fl;

    const spots = [];
    for (let x = -30; x <= 150; x += 7.5) { spots.push([x, -30 - (x % 2)]); if (x < 122 || x > 138) spots.push([x, 16 + (x % 3)]); }
    for (let z = -125; z <= 40; z += 8) { spots.push([152, z]); spots.push([110 - (z % 2), z < -35 ? z : -200]); }
    const trees = spots.filter(([x, z]) => z > -150 && !(x > -12 && x < 16 && z < -8 && z > -26));
    const trunkGeo = new THREE.CylinderGeometry(0.12, 0.16, 2.4, 6); trunkGeo.translate(0, 1.2, 0);
    const crownGeo = new THREE.ConeGeometry(1.25, 7.5, 8); crownGeo.translate(0, 5.8, 0);
    const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x6b5a45, roughness: 1 }), trees.length);
    const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ color: 0x5f7a3c, roughness: 1 }), trees.length);
    const m4 = new THREE.Matrix4();
    trees.forEach(([x, z], i) => {
      const s = 0.8 + ((i * 37) % 10) / 22;
      m4.makeScale(s, s, s); m4.setPosition(x, 0, z);
      trunks.setMatrixAt(i, m4); crowns.setMatrixAt(i, m4);
    });
    trunks.castShadow = crowns.castShadow = true;
    scene.add(trunks, crowns);

    const lampPos = [[18, -3.6], [62, -3.6], [92, -3.6], [118, -3.6], [135.4, -24], [135.4, -48], [135.4, -76]];
    const postGeo = new THREE.CylinderGeometry(0.07, 0.09, 7, 8); postGeo.translate(0, 3.5, 0);
    const posts = new THREE.InstancedMesh(postGeo, new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.5, roughness: 0.5 }), lampPos.length);
    lampPos.forEach(([x, z], i) => { m4.makeTranslation(x, 0, z); posts.setMatrixAt(i, m4); });
    posts.castShadow = true;
    scene.add(posts);
  }

  // машины и пешеход
  const player = makeCar(0xeef0f2, true);
  const npc = makeCar(0x2b5d9c, false);
  const ped = makePed();
  scene.add(player.root, npc.root, ped.root);

  // ---------------------------------------------------------------- кадр
  const camPos = new THREE.Vector3(-20, 30, 40), camLook = new THREE.Vector3(10, 0, 0), up = new THREE.Vector3(0, 1, 0);
  const tmp = new THREE.Vector3(), tmpLook = new THREE.Vector3();
  let orbit = 0, lastMode = null, clock = 0;

  function syncCar(m, car, rideX, rideZ, heading, y, pitch, steer, spin) {
    m.root.position.set(rideX, y, rideZ);
    m.root.rotation.set(0, -heading, pitch);
    m.wheels.forEach((w, i) => { w.spin.rotation.z = spin; if (i < 2) w.pivot.rotation.y = -steer; });
  }

  function render(w, dt, mode) {
    clock += dt;
    const car = w.car;
    syncCar(player, car, car.x, car.z, car.heading, car.y, car.pitch, car.steer, car.wheelSpin);
    const blinkOn = car.ind && car.indTime % 0.66 < 0.33;
    player.indL.emissiveIntensity = blinkOn && car.ind < 0 ? 2.6 : 0;
    player.indR.emissiveIntensity = blinkOn && car.ind > 0 ? 2.6 : 0;
    player.tail.emissiveIntensity = car.brake > 0.05 ? 2.4 : 0.25;
    player.rev.emissiveIntensity = car.gear === 'R' ? 1.8 : 0;
    player.head.emissiveIntensity = car.engine ? 0.9 : 0.1;
    player.cabin.visible = mode !== 'cockpit';
    player.steeringWheel.rotation.x = -(car.steer / CAR.maxSteer) * 2.6;

    const n = w.npc;
    syncCar(npc, null, n.x, n.z - (CAR.length / 2 - CAR.rearOverhang), n.heading, 0, 0, 0, n.spin);
    npc.tail.emissiveIntensity = n.v < 6.5 && n.v > 0.1 ? 2.2 : n.v <= 0.1 ? 1.6 : 0.25;
    npc.head.emissiveIntensity = 0.9;

    const p = w.ped;
    ped.root.visible = p.visible && p.state !== 'done';
    if (ped.root.visible) {
      ped.root.position.set(p.x, Math.abs(p.z) > 2.6 ? 0.15 : 0, p.z);
      ped.root.rotation.y = p.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
      const walking = p.state === 'walk' && !p.blocked;
      const sw = walking ? Math.sin(p.walk) * 0.55 : 0;
      ped.legs[0].rotation.z = sw; ped.legs[1].rotation.z = -sw;
      ped.arms[0].rotation.z = -sw * 0.8; ped.arms[1].rotation.z = sw * 0.8;
    }

    for (const l of lights) {
      const on = lamps(l.group === 'main' ? w.light.phase : crossPhase(w.light), w.light.clock);
      for (const lp of l.lamps) {
        lp.mat.color.copy(on[lp.k] ? lp.on : lp.off);
        lp.halo.visible = on[lp.k];
      }
    }

    const flag = scene.userData.flag;
    if (flag) {
      const pa = flag.geometry.attributes.position;
      for (let i = 0; i < pa.count; i++) {
        const x = pa.getX(i) + 1.1;
        pa.setZ(i, Math.sin(x * 2.4 - clock * 3) * 0.08 * x);
      }
      pa.needsUpdate = true;
    }

    // камера
    const c = Math.cos(car.heading), s = Math.sin(car.heading);
    const cx = car.x + c * 1.35, cz = car.z + s * 1.35;
    let k = 1 - Math.exp(-dt * 5);
    if (mode !== lastMode) { k = 1; lastMode = mode; }
    if (mode === 'orbit') {
      orbit += dt * 0.05;
      tmp.set(62 + Math.cos(orbit) * 95, 48, -18 + Math.sin(orbit) * 95);
      tmpLook.set(66, 0, -12);
      camera.up.set(0, 1, 0);
      k = Math.max(k, 0.04);
    } else if (mode === 'cockpit') {
      const cp = Math.cos(car.pitch);
      const lift = Math.sin(car.pitch) * 1.25;
      tmp.set(car.x + c * 1.25 * cp + s * 0.37, car.y + 1.22 + lift, car.z + s * 1.25 * cp - c * 0.37);
      tmpLook.set(tmp.x + c * cp * 10, tmp.y + Math.sin(car.pitch) * 10 - 0.3, tmp.z + s * cp * 10);
      camera.up.set(0, 1, 0);
      k = 1;
    } else if (mode === 'top') {
      tmp.set(cx, car.y + 24, cz);
      tmpLook.set(cx, car.y, cz);
      up.set(c, 0, s);
      camera.up.lerp(up, k).normalize();
    } else {
      tmp.set(car.x - c * 4.9, car.y + 2.7, car.z - s * 4.9);
      tmpLook.set(car.x + c * 5, car.y + 0.8, car.z + s * 5);
      camera.up.set(0, 1, 0);
    }
    camPos.lerp(tmp, k);
    camLook.lerp(tmpLook, mode === 'cockpit' ? 1 : Math.min(1, k * 1.6));
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    camera.fov = mode === 'cockpit' ? 72 : 60;
    camera.updateProjectionMatrix();

    const focus = mode === 'orbit' ? tmpLook : player.root.position;
    sun.target.position.set(focus.x, 0, focus.z);
    sun.position.set(focus.x - 40, 75, focus.z + 32);
    scene.userData.sky.position.copy(camera.position);

    renderer.render(scene, camera);
  }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  return { render, resize };
}
