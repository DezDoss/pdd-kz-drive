// Сборка без зависимостей: модули из src/ склеиваются в один скрипт внутри app.html.
//   index.html      — тело страницы для публикации артефактом (<head> добавляет хост)
//   dist/index.html — самостоятельная страница: открыть локально или выложить на хостинг
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

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

const cut = page.indexOf('</style>') + '</style>'.length;
const standalone = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>[hidden]{display:none!important}</style>
${page.slice(0, cut)}
</head>
<body>
${page.slice(cut)}
</body>
</html>
`;
mkdirSync('dist', { recursive: true });
writeFileSync('dist/index.html', standalone);

// Отладка: тот же код + автопилот из тестов, доступный из консоли как window.__autopilot
const debugJs = `window.__AUTODROM_DEBUG__ = true;\n(function () {\n'use strict';\n${[...parts, convert('test/autopilot.mjs', 'autopilot')].join('\n')}\nwindow.__autopilot = { control, buildPath };\n})();`;
writeFileSync('dist/debug.html', standalone.replace(js, () => debugJs));
console.log(`index.html ${(page.length / 1024).toFixed(0)} КБ, dist/index.html собран`);
