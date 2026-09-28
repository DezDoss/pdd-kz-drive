// Точка входа: цикл с фиксированным шагом и режимы «меню / заезд / пауза / протокол».
import { createWorld, stepWorld, STEP } from './sim.js';
import { createView } from './view.js';
import { createUI } from './ui.js';
import { CAR } from './course.js';

function boot(saved) {
  const view = createView(document.getElementById('scene'));
  let world = createWorld({});
  let mode = 'menu';
  let practice = false;
  let endAt = null;
  let pending = [];

  const ui = createUI({
    start: p => start(p),
    restart: () => start(practice),
    menu: () => toMenu(),
    pause: () => { if (mode === 'run') setPause(true); else if (mode === 'pause') setPause(false); },
    resume: () => { if (mode === 'pause') setPause(false); },
    currentSteer: () => world.car.steer / CAR.maxSteer,
  });
  if (typeof saved.cam === 'number') ui.camIndex = saved.cam;
  if (saved.muted) ui.audio.muted = true;
  if (window.claude && window.claude.hot && window.claude.hot.snapshot) {
    window.claude.hot.snapshot(() => ({ cam: ui.camIndex, muted: ui.audio.muted }));
  }

  function start(p, extra = {}) {
    practice = p;
    world = createWorld({ practice: p, ...extra });
    endAt = null;
    pending = [];
    mode = 'run';
    ui.audio.unlock();
    ui.showRun();
  }
  function toMenu() {
    world = createWorld({});
    mode = 'menu';
    ui.showMenu();
  }
  function setPause(on) {
    mode = on ? 'pause' : 'run';
    ui.showPause(on);
  }

  document.addEventListener('visibilitychange', () => {
    const manual = window.__autodrom && window.__autodrom.manual;
    if (document.hidden && mode === 'run' && !manual) setPause(true);
  });
  window.addEventListener('resize', () => view.resize());
  view.resize();

  let last = performance.now(), acc = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const actions = ui.takeUiActions();
    const manual = window.__autodrom && window.__autodrom.manual;
    if (mode === 'run' && !manual) {
      pending.push(...actions);
      acc += dt;
      while (acc >= STEP) {
        const inp = ui.input.read(STEP);
        inp.actions = pending;
        pending = [];
        if (world.exam.phase === 'end') { inp.throttle = 0; inp.brake = 1; inp.actions = []; }
        stepWorld(world, inp, STEP);
        acc -= STEP;
      }
      ui.update(world);
      if (world.exam.phase === 'end') {
        if (endAt == null) endAt = now;
        const waited = (now - endAt) / 1000;
        if ((world.car.stillT > 0.4 && waited > 0.8) || waited > 3) {
          mode = 'result';
          ui.showResult(world);
        }
      }
    } else if (mode === 'menu' && !manual) {
      stepWorld(world, { throttle: 0, brake: 1 }, dt);
    } else {
      acc = 0;
    }
    view.render(world, dt, mode === 'menu' ? 'orbit' : ui.camMode);
    requestAnimationFrame(frame);
  }

  // Отладочная сборка (dist/debug.html) даёт доступ к миру, чтобы прогнать маршрут автопилотом
  if (window.__AUTODROM_DEBUG__) {
    window.__autodrom = {
      manual: false,
      get world() { return world; },
      start, stepWorld, STEP, ui, view,
      frame(mode) { ui.update(world); view.render(world, 0.05, mode || ui.camMode); },
    };
  }

  document.getElementById('loading').hidden = true;
  ui.showMenu();
  requestAnimationFrame(frame);
}

// Надписи на знаках и табличках рисуются шрифтами страницы — ждём их, но не дольше 2,5 с
function waitFonts() {
  if (!document.fonts || !document.fonts.load) return Promise.resolve();
  const faces = ['800 40px "Fira Sans Extra Condensed"', '700 40px "Fira Sans Extra Condensed"', '500 16px "Fira Mono"', '400 16px "Fira Sans"'];
  return Promise.race([
    Promise.all(faces.map(f => document.fonts.load(f))).catch(() => {}),
    new Promise(r => setTimeout(r, 2500)),
  ]);
}

function run(saved) {
  if (!window.THREE) {
    document.getElementById('loading').textContent = 'Не загрузилась библиотека Three.js — проверьте интернет и обновите страницу';
    return;
  }
  waitFonts().then(() => boot(saved || {}));
}

const hot = window.claude && window.claude.hot;
if (hot && hot.ready) hot.ready(run);
else run((hot && hot.data) || {});
