// Сборка без зависимостей: модули из src/ склеиваются в один скрипт внутри app.html.
//   index.html      — тело страницы для публикации артефактом (<head> добавляет хост, three.js — с cdnjs)
//   dist/           — PWA для GitHub Pages: свой <head>, манифест, service worker, three.js рядом
//   dist/debug.html — та же игра плюс автопилот из тестов; на хостинг не выкладывается
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
const ASSETS = ['icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'og.png', 'manifest.webmanifest', '.nojekyll'];

const ORDER = ['geom', 'course', 'rules', 'car', 'actors', 'exam', 'sim', 'view', 'ui', 'main'];

const seen = new Map();
const convert = (file, name) => {
  const src = readFileSync(file, 'utf8');
  const body = src
    .replace(/^import\s[\s\S]*?\sfrom\s+['"][^'"]+['"];[ \t]*\n/gm, '')
    .replace(/^export (?=(const|let|function|class|async) )/gm, '');
  if (/^(import|export) /m.test(body)) throw new Error(`src/${name}.js: неподдерживаемый import/export`);
  for (const m of body.matchAll(/^(?:const|let|function|class|async function)\s+([A-Za-z_$][\w$]*)/gm)) {
    if (seen.has(m[1])) throw new Error(`Имя ${m[1]} объявлено и в ${seen.get(m[1])}, и в ${name}`);
    seen.set(m[1], name);
  }
  return `// ---- ${name}.js\n${body}`;
};
const parts = ORDER.map(name => convert(`src/${name}.js`, name));

const js = `(function () {\n'use strict';\n${parts.join('\n')}\n})();`;
const template = readFileSync('app.html', 'utf8');
if (!template.includes('/*__GAME_JS__*/')) throw new Error('В app.html нет места для скрипта');
const page = template.replace('/*__GAME_JS__*/', () => js);
writeFileSync('index.html', page);

if (!page.includes(THREE_CDN)) throw new Error('В app.html не найден three.js с cdnjs');
// PWA не зависит от CDN: three.js и шрифты Fira (OFL) лежат рядом с игрой
const googleFonts = /^<link rel="(?:preconnect|stylesheet)" href="https:\/\/fonts\.(?:googleapis|gstatic)\.com[^>]*>\n/gm;
if ((page.match(googleFonts) || []).length !== 3) throw new Error('В app.html не найдены ссылки на Google Fonts');
const offline = page
  .replace(THREE_CDN, 'vendor/three.min.js')
  .replace(googleFonts, '')
  .replace('<title>', '<link rel="stylesheet" href="fonts/fonts.css">\n<title>');
if (!offline.includes('fonts/fonts.css') || (offline.match(/<\/style>/g) || []).length !== 1) {
  throw new Error('В app.html должны быть ровно один </style> и <title>');
}
const cut = offline.indexOf('</style>') + '</style>'.length;
const standalone = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
${readFileSync('pwa/head.html', 'utf8').trim()}
<style>[hidden]{display:none!important}</style>
${offline.slice(0, cut)}
</head>
<body>
${offline.slice(cut)}
<script>
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
}
</script>
</body>
</html>
`;
mkdirSync('dist/vendor', { recursive: true });
mkdirSync('dist/fonts', { recursive: true });
writeFileSync('dist/index.html', standalone);
const fonts = readdirSync('pwa/fonts').sort();
const copied = [
  ...ASSETS.map(f => [`pwa/${f}`, `dist/${f}`]),
  ['pwa/vendor/three.min.js', 'dist/vendor/three.min.js'],
  ...fonts.map(f => [`pwa/fonts/${f}`, `dist/fonts/${f}`]),
];
for (const [from, to] of copied) copyFileSync(from, to);
// Версия кэша меняется вместе с любым файлом, который попадает в офлайн-кэш
const hash = createHash('sha1').update(standalone).update(readFileSync('pwa/sw.js'));
for (const [from] of copied) hash.update(readFileSync(from));
const version = hash.digest('hex').slice(0, 10);
const fontUrls = fonts.filter(f => /\.(css|woff2)$/.test(f)).map(f => `./fonts/${f}`);
writeFileSync('dist/sw.js', readFileSync('pwa/sw.js', 'utf8')
  .replace('__VERSION__', version)
  .replace('__FONT_FILES__', JSON.stringify(fontUrls)));

// Отладка: тот же код + автопилот из тестов, доступный из консоли как window.__autopilot
const debugJs = `window.__AUTODROM_DEBUG__ = true;\n(function () {\n'use strict';\n${[...parts, convert('test/autopilot.mjs', 'autopilot')].join('\n')}\nwindow.__autopilot = { control, buildPath };\n})();`;
writeFileSync('dist/debug.html', standalone.replace(js, () => debugJs));
console.log(`index.html ${(page.length / 1024).toFixed(0)} КБ; dist/ собран, версия кэша ${version}`);
