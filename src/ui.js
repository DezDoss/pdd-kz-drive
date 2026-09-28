// Интерфейс: клавиатура и сенсор, HUD, меню, пауза, протокол, звук.
import { EXERCISES, PENALTIES, REMARKS, SOURCE } from './rules.js';
import { examHint } from './exam.js';
import { CAR, SPEED_LIMIT, TIME_LIMIT, CURB_AREAS, RAMP, HILL, PARK, XWALK, JUNCTION, FINISH, START } from './course.js';
import { lamps } from './actors.js';

const CARDS_URL = 'https://dezdoss.github.io/pdd-kz-cards/';
const KEY_LABEL = { belt: 'B', engine: 'I', indL: 'Q', indR: 'E', handbrake: 'Пробел', gearP: 'P', gearR: 'R', gearN: 'N', gearD: 'F', gas: 'W', camera: 'C' };
const TOUCH_LABEL = { belt: 'Ремень', engine: 'Двиг.', indL: '◀', indR: '▶', handbrake: 'Ручник', gearP: 'P', gearR: 'R', gearN: 'N', gearD: 'D', gas: 'Газ', camera: 'Вид' };
const KEYMAP = {
  KeyQ: 'indL', KeyE: 'indR', KeyB: 'belt', KeyI: 'engine', Space: 'handbrake',
  KeyP: 'gearP', KeyR: 'gearR', KeyN: 'gearN', KeyF: 'gearD',
  KeyC: 'camera', KeyM: 'sound', Escape: 'pause',
};
const DRIVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);
const UI_ACTIONS = new Set(['camera', 'sound', 'pause']);
const HISTORY_KEY = 'pddkz-autodrom-history';
const CAMERAS = ['chase', 'cockpit', 'top'];
const CAMERA_NAME = { chase: 'Вид сзади', cockpit: 'Из салона', top: 'Сверху' };

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const mmss = t => { t = Math.max(0, Math.floor(t)); return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };
const sec = t => t.toFixed(1).replace('.', ',');

// ---------------------------------------------------------------- ввод
function createInput(isTouch) {
  const down = new Set();
  const queue = [];
  const touch = { gas: false, brake: false, steering: false, steerAbs: 0 };
  let throttle = 0, brake = 0;

  window.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (DRIVE_KEYS.has(e.code) || KEYMAP[e.code]) e.preventDefault();
    if (e.repeat) return;
    down.add(e.code);
    if (KEYMAP[e.code]) queue.push(KEYMAP[e.code]);
  });
  window.addEventListener('keyup', e => down.delete(e.code));
  window.addEventListener('blur', () => { down.clear(); touch.gas = touch.brake = touch.steering = false; });

  // Газ плавно нарастает, пока держат клавишу; тормоз — быстрее; отпустил — ноль сразу
  function read(dt) {
    const gas = down.has('KeyW') || down.has('ArrowUp') || touch.gas;
    const stop = down.has('KeyS') || down.has('ArrowDown') || touch.brake;
    throttle = gas ? Math.min(1, throttle + dt * 1.6) : 0;
    brake = stop ? Math.min(1, brake + dt * 2.5) : 0;
    const left = down.has('KeyA') || down.has('ArrowLeft'), right = down.has('KeyD') || down.has('ArrowRight');
    const inp = { throttle, brake };
    if (touch.steering) inp.steerAbs = touch.steerAbs;
    else inp.steerDir = (right ? 1 : 0) - (left ? 1 : 0);
    return inp;
  }
  const take = () => queue.splice(0);
  const push = a => queue.push(a);
  return { read, take, push, touch, isTouch };
}

// ---------------------------------------------------------------- звук
function createAudio() {
  let ctx = null, muted = false;
  function unlock() {
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; } }
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }
  function tone(freq, dur, type, gain, delay = 0, slide) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  return {
    unlock,
    tick: on => tone(on ? 1850 : 1350, 0.02, 'square', 0.025),
    penalty: hard => { tone(hard ? 240 : 330, 0.16, 'sawtooth', 0.05); tone(hard ? 170 : 250, 0.26, 'sawtooth', 0.05, 0.13); },
    remark: () => tone(660, 0.12, 'triangle', 0.05),
    command: () => { tone(880, 0.12, 'sine', 0.08); tone(1320, 0.3, 'sine', 0.08, 0.14); },
    done: () => { tone(990, 0.09, 'triangle', 0.05); tone(1480, 0.16, 'triangle', 0.05, 0.08); },
    end: pass => pass
      ? [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.06, i * 0.11))
      : [392, 330, 262].forEach((f, i) => tone(f, 0.28, 'sawtooth', 0.04, i * 0.16)),
    get muted() { return muted; },
    set muted(v) { muted = v; },
  };
}

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch (e) { return []; }
}
function saveHistory(list) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 8))); } catch (e) { /* хранилище недоступно */ }
}

// ---------------------------------------------------------------- мини-карта
const MAP = { x0: -14, x1: 142, z0: -92, z1: 14 };
function createMinimap(canvas) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const s = Math.min(W / (MAP.x1 - MAP.x0), H / (MAP.z1 - MAP.z0));
  const ox = (W - (MAP.x1 - MAP.x0) * s) / 2, oy = (H - (MAP.z1 - MAP.z0) * s) / 2;
  const px = x => ox + (x - MAP.x0) * s, pz = z => oy + (z - MAP.z0) * s;
  // неподвижная часть рисуется один раз
  const bg = document.createElement('canvas');
  bg.width = W; bg.height = H;
  {
    const c2 = bg.getContext('2d');
    const draw = (r, fill) => { c2.fillStyle = fill; c2.fillRect(px(r.x0), pz(r.z0), (r.x1 - r.x0) * s, (r.z1 - r.z0) * s); };
    for (const r of CURB_AREAS) draw(r, '#454d56');
    draw({ x0: RAMP.x0, x1: RAMP.x3, z0: -RAMP.wall, z1: RAMP.wall }, '#6b747d');
    draw({ x0: RAMP.x0, x1: RAMP.x3, z0: -RAMP.lane, z1: RAMP.lane }, '#8a929a');
    for (const c of [-1.65, -0.55, 0.55, 1.65]) draw({ x0: XWALK.x0, x1: XWALK.x1, z0: c - 0.25, z1: c + 0.25 }, '#e8e8e2');
    draw({ x0: PARK.x0, x1: PARK.x1, z0: PARK.z0, z1: PARK.z1 }, '#56606a');
    draw(PARK.fix, '#f5c400');
    for (const x of [START.lineX0, HILL.stopX0, XWALK.stopX0, JUNCTION.stopX0]) draw({ x0: x, x1: x + 0.6, z0: -2.25, z1: 2.25 }, '#ffffff');
    draw({ x0: 130, x1: 134, z0: FINISH.lineZ0 - 0.3, z1: FINISH.lineZ1 }, '#ffffff');
    const labels = [['1', 3, -7], ['2', 35, -7], ['6', 75.5, 9], ['3', 106, -9], ['7', 118, -9], ['10', 139, -70]];
    c2.font = '700 22px "Fira Sans Extra Condensed", Arial, sans-serif';
    c2.textAlign = 'center'; c2.textBaseline = 'middle';
    for (const [t, x, z] of labels) {
      c2.fillStyle = '#0d4a9e'; c2.beginPath(); c2.arc(px(x), pz(z), 13, 0, Math.PI * 2); c2.fill();
      c2.fillStyle = '#ffffff'; c2.fillText(t, px(x), pz(z) + 1);
    }
  }
  function draw(w) {
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(bg, 0, 0);
    const L = lamps(w.light.phase, w.light.clock);
    ctx.fillStyle = L.r ? '#ff4a3a' : L.y ? '#ffc21a' : L.g ? '#2fdc7c' : '#333';
    ctx.beginPath(); ctx.arc(px(124.2), pz(4.6), 6, 0, Math.PI * 2); ctx.fill();
    const n = w.npc;
    ctx.fillStyle = '#5c8fd6';
    ctx.fillRect(px(n.x - 0.9), pz(n.z - 2.2), 1.8 * s, 4.4 * s);
    if (w.ped.visible && w.ped.state !== 'done') {
      ctx.fillStyle = '#ff8a3c'; ctx.beginPath(); ctx.arc(px(w.ped.x), pz(w.ped.z), 5, 0, Math.PI * 2); ctx.fill();
    }
    const car = w.car, c = Math.cos(car.heading), sn = Math.sin(car.heading);
    const P = (lon, lat) => [px(car.x + c * lon - sn * lat), pz(car.z + sn * lon + c * lat)];
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#0d1115'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(...P(4.2, 0)); ctx.lineTo(...P(-1.2, 1.4)); ctx.lineTo(...P(-0.4, 0)); ctx.lineTo(...P(-1.2, -1.4));
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  return { draw };
}

// ---------------------------------------------------------------- интерфейс
export function createUI(handlers) {
  const $ = id => document.getElementById(id);
  const isTouch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
  document.body.classList.toggle('touch', isTouch);
  const input = createInput(isTouch);
  const audio = createAudio();
  const minimap = createMinimap($('minimap'));
  const labels = isTouch ? TOUCH_LABEL : KEY_LABEL;
  let camIndex = 0;
  let history = loadHistory();
  // DOM трогаем, только когда значение поменялось
  let cache = new WeakMap();
  const set = (el, key, value, apply) => {
    let m = cache.get(el);
    if (!m) cache.set(el, (m = new Map()));
    if (m.get(key) === value) return;
    m.set(key, value);
    apply(value);
  };
  const text = (el, v) => set(el, 't', v, x => { el.textContent = x; });
  const html = (el, v) => set(el, 'h', v, x => { el.innerHTML = x; });
  const cls = (el, name, on) => set(el, 'c' + name, on, x => el.classList.toggle(name, x));

  const renderHint = s => esc(s).replace(/\[(\w+)\]/g, (_, k) => '<kbd>' + esc(labels[k] || k) + '</kbd>');

  // --- меню
  $('source').textContent = 'Баллы: ' + SOURCE + '. Размеры кармана для парковки и лимит времени (10 минут) задаёт сам автодром — в Правилах их нет. Пешеход и попутная машина — для практики ПДД, на экзамене их нет.';
  const keyRows = isTouch
    ? [['Газ, Тормоз', 'педали справа, держите пальцем'], ['Руль', 'ведите пальцем по полосе слева'], ['◀ ▶', 'левый и правый указатели'], ['P R N D', 'селектор автоматической коробки'], ['Ремень, Двиг., Ручник', 'ремень, двигатель, стояночный тормоз'], ['Вид', 'сзади, из салона, сверху']]
    : [['W / ↑', 'газ'], ['S / ↓', 'тормоз'], ['A D / ← →', 'руль'], ['Q / E', 'левый / правый указатель'], ['B', 'ремень'], ['I', 'двигатель (селектор в P или N)'], ['P R N F', 'селектор: P, R, N, D'], ['Пробел', 'стояночный тормоз'], ['C', 'вид: сзади, из салона, сверху'], ['M / Esc', 'звук / пауза']];
  $('keys').innerHTML = keyRows.map(([k, v]) => `<dt>${k.split(', ').map(x => '<kbd>' + esc(x) + '</kbd>').join(' ')}</dt><dd>${esc(v)}</dd>`).join('');
  {
    const byKt = {};
    for (const p of Object.values(PENALTIES)) (byKt[p.kt] = byKt[p.kt] || []).push(p);
    const ktName = { 'КТ1': '1 · Старт', 'КТ2': '2 · Подъём', 'КТ3': '3 · Переход', 'КТ6': '6 · Параллельная парковка', 'КТ7': '7 · Регулируемый перекрёсток', 'КТ10': '10 · Финиш', 'КТ11': 'Общие' };
    let rows = '<thead><tr><th>Упражнение</th><th>Нарушение</th><th>Баллы</th></tr></thead><tbody>';
    for (const kt of Object.keys(byKt)) {
      byKt[kt].forEach((p, i) => {
        rows += `<tr>${i === 0 ? `<td class="kt" rowspan="${byKt[kt].length}">${esc(ktName[kt] || kt)}</td>` : ''}<td>${esc(p.text)}</td><td class="num">${p.pts}</td></tr>`;
      });
    }
    $('pen-table').innerHTML = rows + '</tbody>';
  }
  function renderHistory() {
    const box = $('history');
    box.hidden = !history.length;
    if (!history.length) return;
    box.innerHTML = '<strong>Последние попытки</strong><ol>' + history.map(h =>
      `<li><span class="${h.pass ? 'ok' : 'no'}">${h.pass ? 'сдал' : 'не сдал'}</span> · ${h.points} баллов · ${mmss(h.time)} · ${h.practice ? 'тренировка' : 'экзамен'} · ${esc(h.date)}</li>`).join('') + '</ol>';
  }

  // --- кнопки
  document.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    audio.unlock();
    if (b.dataset.a) { input.push(b.dataset.a); b.blur(); }
    if (b.dataset.ui) uiAction(b.dataset.ui);
  });
  $('btn-exam').addEventListener('click', () => handlers.start(false));
  $('btn-practice').addEventListener('click', () => handlers.start(true));

  function uiAction(a) {
    if (a === 'camera') { camIndex = (camIndex + 1) % CAMERAS.length; toast('info', 'вид', CAMERA_NAME[CAMERAS[camIndex]]); }
    else if (a === 'sound') { audio.muted = !audio.muted; toast('info', 'звук', audio.muted ? 'Звук выключен' : 'Звук включён'); }
    else if (handlers[a]) handlers[a]();
  }

  // --- сенсорные педали и руль
  const hold = (el, key) => {
    const on = e => { e.preventDefault(); audio.unlock(); input.touch[key] = true; el.classList.add('pressed'); };
    const off = () => { input.touch[key] = false; el.classList.remove('pressed'); };
    el.addEventListener('pointerdown', on);
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => el.addEventListener(t, off));
    el.addEventListener('contextmenu', e => e.preventDefault());
  };
  hold($('t-gas'), 'gas');
  hold($('t-brake'), 'brake');
  {
    const pad = $('t-wheel');
    let startX = 0, startSteer = 0, pid = null;
    pad.addEventListener('pointerdown', e => {
      e.preventDefault();
      pid = e.pointerId;
      pad.setPointerCapture(pid);
      startX = e.clientX;
      startSteer = handlers.currentSteer();
      input.touch.steering = true;
      input.touch.steerAbs = startSteer;
    });
    pad.addEventListener('pointermove', e => {
      if (e.pointerId !== pid) return;
      const span = pad.clientWidth * 0.42;
      input.touch.steerAbs = Math.max(-1, Math.min(1, startSteer + (e.clientX - startX) / span));
    });
    const end = e => { if (e.pointerId === pid) { pid = null; input.touch.steering = false; } };
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);
  }

  // --- всплывающие сообщения
  function toast(kind, badge, body, note) {
    const box = $('toasts');
    const el = document.createElement('div');
    el.className = 'toast panel ' + kind;
    el.innerHTML = `<b>${esc(badge)}</b><div>${esc(body)}${note ? `<small>${esc(note)}</small>` : ''}</div>`;
    box.prepend(el);
    while (box.children.length > 4) box.lastChild.remove();
    setTimeout(() => el.remove(), kind === 'info' ? 2200 : 6500);
  }
  let flashTimer = 0;
  function flash(msg, small) {
    const el = $('flash');
    el.textContent = msg;
    el.classList.toggle('small', !!small);
    el.classList.add('on');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => el.classList.remove('on'), small ? 1300 : 1600);
  }

  function handleEvents(w) {
    for (const ev of w.exam.events.splice(0)) {
      if (ev.type === 'command') { flash('Старт!'); audio.command(); }
      else if (ev.type === 'done') { flash('Выполнено', true); audio.done(); }
      else if (ev.type === 'skipped') toast('hard', 'КТ11', 'Упражнение пропущено');
      else if (ev.type === 'penalty') {
        const p = PENALTIES[ev.code];
        toast(p.pts >= 100 ? 'hard' : 'pen', '+' + p.pts, p.text, [p.kt, ev.note].filter(Boolean).join(' · '));
        audio.penalty(p.pts >= 100);
      } else if (ev.type === 'remark') {
        toast('remark', 'ПДД', REMARKS[ev.code].text, 'Баллов нет, но это нарушение ПДД');
        audio.remark();
      } else if (ev.type === 'end') audio.end(ev.result === 'pass');
    }
    for (const n of w.notices.splice(0)) toast('info', 'i', n);
  }

  // --- HUD
  const el = id => $(id);
  const E_ = { taskNo: el('task-no'), taskStep: el('task-step'), taskName: el('task-name'), hint: el('hint'), progress: el('progress'),
    pts: el('pts'), ptsBox: el('pts-box'), clock: el('clock'), exClock: el('ex-clock'), speed: el('speed'), limit: el('limit'),
    gears: el('gears'), indL: el('ind-l'), indR: el('ind-r'), belt: el('tell-belt'), engine: el('tell-engine'), hb: el('tell-hb'),
    wheel: el('wheel'), knob: el('t-knob'), tbBelt: el('tb-belt'), tbEngine: el('tb-engine'), tbHb: el('tb-hb'), tbIndL: el('tb-indL'), tbIndR: el('tb-indR'), tbGears: el('tb-gears') };
  E_.progress.innerHTML = EXERCISES.map(e => `<span id="pg-${e.id}" title="${esc(e.name)}">${e.no}</span>`).join('');
  $('clock-limit').textContent = 'из ' + mmss(TIME_LIMIT);
  let lastBlink = false;

  function exClock(E, w) {
    if (E.phase !== 'run' || !E.active) return '';
    const x = E.ex[E.idx], s = x.s;
    switch (x.id) {
      case 'start': return s.moved ? '' : 'тронуться: ' + Math.max(0, Math.ceil(20 - E.t)) + ' с';
      case 'hill': case 'crosswalk':
        if (s.stopped && !s.started) { const st = E.t - s.stopT; return st < 3 ? 'стоим ' + sec(st) + ' из 3 с' : 'можно ехать · осталось ' + Math.ceil(30 - st) + ' с'; }
        return '';
      case 'parallel': return mmss(E.t - x.t0) + ' из 02:00';
      case 'junction': return s.permissive && !s.cleared ? 'на разрешающий: ' + Math.floor(s.greenT) + ' из 20 с' : '';
    }
    return '';
  }

  function update(w) {
    const E = w.exam, car = w.car;
    handleEvents(w);
    const meta = EXERCISES[E.idx];
    text(E_.taskNo, E.phase === 'prep' ? 'Подготовка к старту' : 'Упражнение № ' + meta.no);
    text(E_.taskStep, E.idx + 1 + ' из ' + EXERCISES.length);
    text(E_.taskName, E.phase === 'prep' ? 'Предстартовая зона' : meta.name);
    html(E_.hint, renderHint(examHint(E, w)));
    E.ex.forEach(x => {
      const node = document.getElementById('pg-' + x.id);
      const bad = E.log.some(l => l.ex === x.id);
      const state = x.status === 'skipped' ? 'skipped' : x.status === 'active' ? 'active' : x.status === 'done' ? (bad ? 'bad' : 'done') : '';
      set(node, 's', state, v => { node.className = v; });
    });
    text(E_.pts, String(E.points));
    cls(E_.ptsBox, 'warn', E.points > 0 && E.points < 100);
    cls(E_.ptsBox, 'fail', E.points >= 100);
    text(E_.clock, mmss(E.t));
    text(E_.exClock, exClock(E, w));
    const kmh = Math.round(Math.abs(car.v) * 3.6);
    text(E_.speed, String(kmh));
    cls(E_.limit, 'over', kmh > SPEED_LIMIT);
    [...E_.gears.children].forEach(sp => cls(sp, 'on', sp.textContent === car.gear));
    [...E_.tbGears.children].forEach(b => cls(b, 'on', b.textContent === car.gear));
    const blink = !!car.ind && car.indTime % 0.66 < 0.33;
    if (blink !== lastBlink) { if (car.ind || lastBlink) audio.tick(blink); lastBlink = blink; }
    E_.indL.classList.toggle('on', blink && car.ind < 0);
    E_.indR.classList.toggle('on', blink && car.ind > 0);
    cls(E_.tbIndL, 'blink', blink && car.ind < 0);
    cls(E_.tbIndR, 'blink', blink && car.ind > 0);
    cls(E_.belt, 'alert', !car.belt);
    text(E_.belt, car.belt ? 'Ремень ✓' : 'Ремень');
    cls(E_.engine, 'warn', !car.engine);
    text(E_.engine, car.engine ? 'Двигатель ✓' : 'Двигатель');
    cls(E_.hb, 'alert', car.handbrake);
    cls(E_.tbBelt, 'alert', !car.belt);
    cls(E_.tbEngine, 'on', car.engine);
    cls(E_.tbHb, 'alert', car.handbrake);
    const steer = car.steer / CAR.maxSteer;
    set(E_.wheel, 'r', Math.round(steer * 90), v => { E_.wheel.style.transform = `rotate(${v * 2}deg)`; });
    if (isTouch) {
      const shown = input.touch.steering ? input.touch.steerAbs : steer;
      set(E_.knob, 'x', Math.round(shown * 100), v => {
        E_.knob.style.transform = `translateX(${(v / 100) * (E_.knob.parentElement.clientWidth / 2 - 38)}px)`;
      });
    } else minimap.draw(w);
  }

  // --- экраны
  const show = (id, on) => { $(id).hidden = !on; };
  function showMenu() {
    renderHistory();
    show('menu', true); show('hud', false); show('result', false); show('pause', false); show('touch', false);
  }
  // Приборка и сообщения встают над сенсорной панелью, какой бы высоты она ни вышла
  const measureTouch = () => {
    if (isTouch && !$('touch').hidden) document.body.style.setProperty('--touch-h', $('touch').offsetHeight + 'px');
  };
  window.addEventListener('resize', measureTouch);
  function showRun() {
    cache = new WeakMap();
    $('toasts').innerHTML = '';
    show('menu', false); show('hud', true); show('result', false); show('pause', false); show('touch', true);
    measureTouch();
  }
  const showPause = on => { show('pause', on); show('touch', !on); measureTouch(); };

  function showResult(w) {
    const E = w.exam;
    const pass = E.result === 'pass';
    const date = new Date().toLocaleString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    history = [{ pass, points: E.points, time: E.t, practice: E.practice, date }, ...history].slice(0, 8);
    saveHistory(history);
    const rows = EXERCISES.map((m, i) => {
      const x = E.ex[i];
      const pts = E.log.filter(l => l.ex === m.id).reduce((a, l) => a + l.pts, 0);
      const status = { done: 'выполнено', skipped: 'пропущено', active: 'прервано', pending: 'не начато' }[x.status];
      const time = x.t0 == null ? '—' : mmss((x.t1 ?? E.t) - x.t0);
      return `<tr><td class="kt">№ ${m.no}</td><td>${esc(m.name)}</td><td>${status}</td><td class="num">${time}</td><td class="num">${pts || '—'}</td></tr>`;
    }).join('');
    const errs = E.log.map(l => {
      const p = PENALTIES[l.code];
      const deck = p.deck ? ` Повторить: карточки «${esc(p.deck)}».` : '';
      return `<li><span class="p${p.pts >= 100 ? ' hard' : ''}">+${p.pts}</span><div>${esc(p.text)}${l.note ? ` — ${esc(l.note)}` : ''}<small>${esc(p.kt)} · ${esc(EXERCISES.find(e => e.id === l.ex).short)} · ${mmss(l.t)}</small><small class="tip">${esc(p.tip)}${deck}</small></div></li>`;
    }).join('');
    const rem = E.remarks.map(r => {
      const d = REMARKS[r.code];
      return `<li><span class="p pdd">ПДД</span><div>${esc(d.text)}<small class="tip">${esc(d.rule)}${d.deck ? ` Повторить: карточки «${esc(d.deck)}».` : ''}</small></div></li>`;
    }).join('');
    $('protocol').innerHTML = `
      <header>
        <div class="doc">Протокол · практический экзамен · автодром · тренажёр</div>
        <h2>${pass ? 'Экзамен сдан' : 'Экзамен не сдан'}</h2>
        <div class="meta"><span>Баллы <b>${E.points}</b> из 100</span><span>Время <b>${mmss(E.t)}</b></span><span>Режим <b>${E.practice ? 'тренировка' : 'экзамен'}</b></span><span>${esc(date)}</span></div>
      </header>
      <div class="stamp ${pass ? 'pass' : 'fail'}">${pass ? 'Сдал' : 'Не сдал'}</div>
      <h3>Упражнения</h3>
      <div class="table-wrap"><table><thead><tr><th>№</th><th>Упражнение</th><th>Итог</th><th>Время</th><th>Баллы</th></tr></thead><tbody>${rows}</tbody></table></div>
      <h3>Штрафные баллы</h3>
      ${errs ? `<ul class="errs">${errs}</ul>` : '<p class="clean">Ни одной ошибки по контрольным таблицам.</p>'}
      ${rem ? `<h3>Нарушения ПДД без баллов</h3><ul class="errs">${rem}</ul>` : ''}
      <div class="actions">
        <button class="primary" type="button" data-ui="restart">Пересдать</button>
        <button type="button" data-ui="menu">В меню</button>
      </div>
      <p class="source" style="margin-top:18px;color:var(--paper-muted)">Баллы — по приложению 5 к Правилам приёма экзаменов (приказ МВД РК № 862, ред. на 27.07.2026). Теорию можно повторить в <a href="${CARDS_URL}" target="_blank" rel="noopener">карточках ПДД РК</a>.</p>`;
    show('result', true); show('hud', false); show('touch', false); show('pause', false);
  }

  function takeUiActions() {
    const sim = [];
    for (const a of input.take()) {
      if (UI_ACTIONS.has(a)) uiAction(a);
      else sim.push(a);
    }
    return sim;
  }

  return {
    input, audio, update, showMenu, showRun, showPause, showResult, takeUiActions, toast,
    get camMode() { return CAMERAS[camIndex]; },
    set camIndex(i) { camIndex = i; },
    get camIndex() { return camIndex; },
  };
}
