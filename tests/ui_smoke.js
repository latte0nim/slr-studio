// Uji asap UI (opsional). Memuat halaman asli + app.js di jsdom dengan state proyek, mengklik semua tab sidebar,
// lalu melaporkan galat JS, grup sidebar, judul halaman, dan isi panel LANGKAH.
// Pakai: npm i jsdom   (di folder mana saja yang bisa di-require)
//        python -c "import app; app.app.run(port=5055)" &
//        node tests/ui_smoke.js http://127.0.0.1:5055 output/<ekspor-proyek>.json static/app.js     ('-' = tanpa state)
const {JSDOM, VirtualConsole} = require('jsdom'); const fs = require('fs');
const [,, base = 'http://127.0.0.1:5055', projectJson = '-', appJs = 'static/app.js'] = process.argv;
(async () => {
  const errors = []; const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push('jsdomError: ' + (e.detail || e.message || e)));
  vc.on('error', m => errors.push('console.error: ' + String(m).slice(0, 200)));
  const html = await (await fetch(base + '/')).text();
  const dom = new JSDOM(html, {url: base + '/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc});
  const w = dom.window;
  w.fetch = (u, o) => fetch(base + u, o);
  w.scrollTo = () => {};
  w.structuredClone = w.structuredClone || (x => JSON.parse(JSON.stringify(x)));   // jsdom belum punya structuredClone
  const src = fs.readFileSync(appJs, 'utf8');
  const key = (src.match(/STORE_KEY\s*=\s*['"]([^'"]+)['"]/) || [])[1];
  if (projectJson !== '-') { const p = JSON.parse(fs.readFileSync(projectJson, 'utf8')); ['format', 'version', 'exported_at'].forEach(k => delete p[k]); w.localStorage.setItem(key, JSON.stringify(p)); }
  w.eval(src);
  if (w.document.readyState !== 'loading') w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  await sleep(300);
  const out = {errors, groups: [...w.document.querySelectorAll('.workspace-label')].map(e => e.textContent.trim()), nav: []};
  for (const b of w.document.querySelectorAll('.nav-item')) {
    b.click(); await sleep(700);
    const active = [...w.document.querySelectorAll('.page-section.active-section')].map(s => s.id).join(',');
    out.nav.push({label: b.textContent.replace(/\s+/g, ' ').trim(), target: b.dataset.target, active, crumb: w.document.querySelector('#breadcrumb-current').textContent, ok: active === b.dataset.target && b.classList.contains('active')});
  }
  w.document.querySelector('.nav-item[data-target="design"]').click(); await sleep(3000);
  const steps = w.document.querySelector('#design-steps');
  out.steps = steps ? steps.textContent.replace(/\s+/g, ' ').trim() : null;
  console.log(JSON.stringify(out, null, 1));
  process.exit(errors.length || out.nav.some(n => !n.ok) ? 1 : 0);
})();
