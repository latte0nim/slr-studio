// Uji end-to-end laporan HTML: verifikasi artikel lewat UI, buat laporan, bongkar di jsdom kedua, uji mode naskah/audit dan tombol cetak.
// Pakai: npm i jsdom ; python -c "import app; app.app.run(port=5055)" &
//        node tests/ui_report_check.js http://127.0.0.1:5055 output/<ekspor-proyek>.json static/app.js
const {JSDOM, VirtualConsole} = require('jsdom'); const fs = require('fs');
const [,, base = 'http://127.0.0.1:5055', projectJson, appJs = 'static/app.js'] = process.argv;
if (!projectJson) { console.error('Butuh ekspor proyek JSON sebagai argumen ke-2.'); process.exit(2); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = []; const check = (name, ok, detail = '') => { results.push({name, ok: !!ok}); console.log((ok ? 'ok   ' : 'GAGAL') + ' ' + name + (ok ? '' : ' :: ' + detail)); };

async function boot(project) {
  const errors = [], vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push('jsdomError: ' + (e.detail || e.message || e)));
  const html = await (await fetch(base + '/')).text();
  const w = new JSDOM(html, {url: base + '/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc}).window;
  w.fetch = (u, o) => fetch(base + u, o); w.scrollTo = () => {};
  w.structuredClone = w.structuredClone || (x => JSON.parse(JSON.stringify(x)));
  let captured = null; w.URL.createObjectURL = b => { captured = b; return 'blob:x'; }; w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function () {};
  w.Element.prototype.scrollIntoView = function () {};   // jsdom belum punya scrollIntoView
  const src = fs.readFileSync(appJs, 'utf8'), key = src.match(/STORE_KEY\s*=\s*['"]([^'"]+)['"]/)[1];
  const p = JSON.parse(JSON.stringify(project)); ['format', 'version', 'exported_at'].forEach(k => delete p[k]);
  w.localStorage.setItem(key, JSON.stringify(p)); w.eval(src);
  if (w.document.readyState !== 'loading') w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await sleep(300);
  return {w, key, errors, getBlob: () => captured};
}
async function makeReport(app) {
  const {w} = app; w.document.querySelector('.nav-item[data-target="design"]').click(); await sleep(3000);
  w.document.querySelector('#design-report').click(); await sleep(300);
  const blob = app.getBlob(); if (!blob) throw new Error('laporan tidak dihasilkan');
  return await new Promise((res, rej) => { const fr = new w.FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsText(blob); });
}
const text = e => e.textContent.replace(/\s+/g, ' ').trim();
// teks satu bagian: semua elemen kakak-beradik setelah h2 yang judulnya diawali `prefix`, sampai h2 berikutnya
function sectionText(doc, prefix) { const h = [...doc.querySelectorAll('h2')].find(x => x.textContent.startsWith(prefix)); let out = [], n = h && h.nextElementSibling; while (n && n.tagName !== 'H2' && !n.matches('section.audit')) { out.push(text(n)); n = n.nextElementSibling; } return out.join(' '); }

(async () => {
  const project = JSON.parse(fs.readFileSync(projectJson, 'utf8'));

  // ---- A. verifikasi lewat UI sungguhan ----
  const app = await boot(project), d = app.w.document;
  d.querySelector('.nav-item[data-target="articles"]').click(); await sleep(400);
  const incl = project.articles.filter(a => a.screening_decision === 'include' && a.eligibility_decision === 'include');
  const firstBtn = d.querySelector('[data-detail]'), firstId = firstBtn.dataset.detail;
  const wasV = !!project.articles.find(a => a.id === firstId).owner_verified;
  firstBtn.click(); await sleep(300);
  const box = d.querySelector('#verify-article');
  check('kotak "sudah saya cek" muncul di detail artikel dan mencerminkan status awalnya', !!box && box.checked === wasV);
  box.click(); await sleep(300);
  const saved = JSON.parse(app.w.localStorage.getItem(app.key)), now = saved.articles.find(a => a.id === firstId);
  check('mencentang/mencabut menyimpan owner_verified (+ waktu) di state', !!now.owner_verified === !wasV && (!now.owner_verified || !!now.owner_verified_at));
  const vAll = saved.articles.filter(a => a.owner_verified).length;
  check('tabel artikel menandai "✓ dicek" sebanyak artikel terverifikasi', d.querySelectorAll('.verified-mark').length === vAll, `${d.querySelectorAll('.verified-mark').length} vs ${vAll}`);
  d.querySelector('.nav-item[data-target="design"]').click(); await sleep(3000);
  const vInc = saved.articles.filter(a => a.screening_decision === 'include' && a.eligibility_decision === 'include' && a.owner_verified).length;
  check('panel LANGKAH menghitung verifikasi sesuai state', new RegExp(vInc + ' dari ' + incl.length + ' artikel INCLUDE sudah dicek').test(text(d.querySelector('#design-steps'))), text(d.querySelector('#design-steps')).slice(0, 300));

  // ---- B. laporan ----
  const html = await makeReport(app);
  const printed = [];
  const rdom = new JSDOM(html, {runScripts: 'dangerously', pretendToBeVisual: true, beforeParse(win) { win.print = () => printed.push(win.document.documentElement.getAttribute('data-view')); }});
  const doc = rdom.window.document, win = rdom.window; await sleep(200);
  const heads = [...doc.querySelectorAll('h2')].filter(h => !h.closest('#panduan')).map(text);
  const naskahHeads = ['1. Topik', '2. Metode', '3. Taksonomi', '4. Definisi', '5. Matriks', '6. Keluarga', '7. Posisi', '8. Temuan', '9. Daftar pustaka'];
  check('bagian naskah 1-9 berurutan', naskahHeads.every((h, i) => (heads[i] || '').startsWith(h)), JSON.stringify(heads.slice(0, 9)));
  check('lampiran audit A-F menyusul setelahnya', ['A.', 'B.', 'C.', 'D.', 'E.', 'F.'].every((c, i) => (heads[9 + i] || '').startsWith('Lampiran ' + c)), JSON.stringify(heads.slice(9)));
  check('lampiran audit dibungkus .audit (6 bagian)', doc.querySelectorAll('section.audit').length === 6);
  const banner = doc.querySelector('.banner'), bannerText = banner ? text(banner) : '';
  const lampF = [...doc.querySelectorAll('section.audit')].find(s => /^Lampiran F/.test(text(s.querySelector('h2')))), rowsF = [...lampF.querySelectorAll('tbody tr')];
  const belumN = rowsF.filter(r => /belum/.test(text(r.lastElementChild))).length;
  check('banner DRAFT konsisten dengan Lampiran F (artikel belum diverifikasi)', belumN > 0 ? new RegExp(belumN + ' dari ' + rowsF.length + ' artikel belum diverifikasi').test(bannerText) : !/belum diverifikasi/.test(bannerText), `belum=${belumN}/${rowsF.length} banner=${bannerText.slice(0, 160)}`);
  const synObj = project.synthesis || {}, synSrc = JSON.stringify(synObj);
  const hasSyn = !!(synObj.executive_synthesis || (synObj.research_gaps || []).length || (synObj.main_themes || []).length);
  const sec8 = sectionText(doc, '8.');
  if (hasSyn) {
    check('sumber sintesis memang memuat ID mentah (uji ini bermakna)', /\b[0-9a-f]{16}\b/.test(synSrc));
    check('bagian 8 (temuan dan celah) tanpa ID mentah, dengan rujukan [n]', sec8.length > 100 && !/\b[0-9a-f]{16}\b/.test(sec8) && /\[\d+\]/.test(sec8), sec8.slice(0, 160));
    check('sumber sintesis memuat kode mentah snake_case (uji ini bermakna)', /\b[a-z]+_[a-z_]+\b/.test(synSrc));
    check('bagian 8 tanpa kode mentah snake_case (diganti label codebook)', !/\b[a-z]+_[a-z_]+\b/.test(sec8), (sec8.match(/\b[a-z]+_[a-z_]+\b/g) || []).join(','));
  } else {
    check('tanpa sintesis: bagian 8 memuat petunjuk menjalankan Review Synthesis (bukan kosong atau galat)', /Belum ada ringkasan: jalankan Review Synthesis/.test(sec8), sec8.slice(0, 160));
  }
  const naskahText = [...doc.querySelectorAll('main > *:not(.audit)')].map(text).join(' ');
  const tahun = text([...doc.querySelectorAll('dt')].find(e => text(e) === 'Sebaran tahun').nextElementSibling);
  check('sebaran tahun tanpa kurung ganda dan menyebut cakupan', !/\)\s*\(/.test(tahun) && /dari \d+ artikel dalam cakupan laporan/.test(tahun), tahun);
  check('seluruh teks naskah tanpa ID artikel mentah', !/\b[0-9a-f]{16}\b/.test(naskahText));
  check('string pencarian tanpa backslash', !/\\/.test(text([...doc.querySelectorAll('dt')].find(e => text(e) === 'String pencarian').nextElementSibling)));
  const defTable = [...doc.querySelectorAll('h2')].find(h => h.textContent.startsWith('4.')).nextElementSibling;
  const defRows = [...defTable.querySelectorAll('tbody tr')].map(r => [...r.children].map(text));
  check('tabel definisi: kode hierarkis (1, 1.1 Kuantitatif ...)', defRows[0][0] === '1' && defRows[0][1] === 'Metodologi' && defRows[1][0] === '1.1' && defRows[1][1] === 'Kuantitatif', JSON.stringify(defRows.slice(0, 2)));
  const bannerNoDef = Number((/(\d+) keluarga teknik belum punya definisi/.exec(bannerText) || [])[1] || 0);
  const defPlaceholders = defRows.filter(r => /definisi belum diisi/.test(r[2])).length;
  check('placeholder definisi di tabel = jumlah keluarga tanpa definisi di banner (lapisan baku sudah berdefinisi)', defPlaceholders === bannerNoDef, `tabel=${defPlaceholders} banner=${bannerNoDef}`);
  check('catatan [ekstensi] muncul bila definisi memuatnya', !defRows.some(r => /\[ekstensi\]/.test(r[2])) || /Tanda \[ekstensi\]/.test(text(defTable.nextElementSibling)));
  const pos = text([...doc.querySelectorAll('h2')].find(h => h.textContent.startsWith('7.')).nextElementSibling);
  check('posisi onion: menyebut cabang tanpa artikel (Kualitatif, Campuran)', /Tanpa artikel: Kualitatif, Campuran/.test(pos), pos.slice(0, 200));
  check('sebaran tahun dihitung otomatis', /Sebaran tahun/.test(text(doc.querySelector('main'))) && /\(\d+\)/.test(text([...doc.querySelectorAll('dt')].find(e => text(e) === 'Sebaran tahun').nextElementSibling)));
  check('daftar pustaka memuat catatan nama jurnal belum ada', /Nama jurnal, volume, dan halaman belum tersedia/.test(text(doc.querySelector('main'))));

  // mode naskah vs lengkap
  const disp = el => win.getComputedStyle(el).display;
  win.document.querySelector('#v-naskah').click();
  check('pratinjau naskah: data-view=naskah', doc.documentElement.getAttribute('data-view') === 'naskah');
  check('naskah menyembunyikan semua .audit dan penanda', [...doc.querySelectorAll('.audit,.tag')].every(e => disp(e) === 'none'));
  check('naskah tetap menampilkan banner dan bagian 1-9', disp(doc.querySelector('.banner')) !== 'none' && [...doc.querySelectorAll('h2')].slice(0, 9).every(h => disp(h) !== 'none'));
  win.document.querySelector('#v-lengkap').click();
  check('tampilan lengkap menampilkan lampiran audit', [...doc.querySelectorAll('section.audit')].every(e => disp(e) !== 'none'));
  win.document.querySelector('#p-naskah').click(); await sleep(250);
  check('Cetak naskah: print() dipanggil saat mode naskah', printed[0] === 'naskah' && doc.documentElement.getAttribute('data-view') === 'naskah', JSON.stringify(printed));
  win.dispatchEvent(new win.Event('afterprint')); 
  check('setelah dialog cetak, tampilan kembali ke semula (lengkap)', doc.documentElement.getAttribute('data-view') === 'lengkap');
  win.document.querySelector('#p-lengkap').click(); await sleep(250);
  check('Cetak lengkap: print() dipanggil saat mode lengkap', printed[1] === 'lengkap', JSON.stringify(printed));

  // ---- panduan kerangka ----
  const guideEl = doc.querySelector('#panduan'), guideText = guideEl ? text(guideEl) : '';
  check('panduan kerangka ada dan tersembunyi di tampilan lengkap', !!guideEl && disp(guideEl) === 'none');
  win.document.querySelector('#v-panduan').click();
  check('tampilan Panduan kerangka: data-view=panduan dan tombolnya dinonaktifkan', doc.documentElement.getAttribute('data-view') === 'panduan' && win.document.querySelector('#v-panduan').disabled);
  check('panduan terlihat; bagian naskah, lampiran audit, dan banner tersembunyi; bilah atas tetap tampak',
        disp(guideEl) !== 'none' && [...doc.querySelectorAll('section.audit')].every(e => disp(e) === 'none') && disp([...doc.querySelectorAll('h2')].find(h => h.textContent.startsWith('1.'))) === 'none' && disp(doc.querySelector('.toolbar')) !== 'none');
  win.document.querySelector('#v-naskah').click();
  check('kembali ke naskah: panduan tersembunyi lagi dan catatan acuan terlihat', disp(guideEl) === 'none' && disp(doc.querySelector('.refnote')) !== 'none');
  const topicNow = (project.designUi || {}).topic || '';
  check('panduan memuat bagian A-E, topik proyek, dan >= 6 contoh data', ['A. Peta kerangka', 'B. Bab per bab', 'C. Alur kerja', 'D. Catatan format', 'E. Daftar periksa'].every(h => guideText.includes(h)) && (!topicNow || guideText.includes(topicNow)) && (guideText.match(/Contoh dari proyekmu/g) || []).length >= 6, guideText.slice(0, 120));
  check('panduan memuat angka nyata proyek (jumlah artikel dan keluarga teknik)', new RegExp(incl.length + ' artikel').test(guideText) && /\(\d+ artikel\)/.test(guideText));
  check('seluruh laporan tanpa ID mentah, undefined, NaN, atau [object]', !/undefined|NaN|\[object/.test(text(doc.querySelector('main'))) && !/\b[0-9a-f]{16}\b/.test(guideText));

  // ---- C. semua artikel terverifikasi: banner tidak lagi menyebut verifikasi ----
  const allV = JSON.parse(JSON.stringify(project)); allV.articles.forEach(a => { a.owner_verified = true; a.owner_verified_at = new Date().toISOString(); });
  const app2 = await boot(allV), html2 = await makeReport(app2), doc2 = new JSDOM(html2).window.document;
  const b2 = doc2.querySelector('.banner');
  check('semua terverifikasi: banner tidak menyebut verifikasi lagi', !b2 || !/belum diverifikasi/.test(text(b2)), b2 && text(b2));
  check('semua terverifikasi: metode menyebut "N dari N artikel sudah diverifikasi"', new RegExp(incl.length + ' dari ' + incl.length + ' artikel sudah diverifikasi').test(text(doc2.querySelector('main'))));

  const errs = [...app.errors, ...app2.errors].filter(e => !/Not implemented/.test(e));
  check('tanpa galat JS selama seluruh uji', errs.length === 0, errs.join(' | '));
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${failed ? 'ADA YANG GAGAL' : 'SEMUA LULUS'}: ${results.length - failed}/${results.length} pengecekan`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('GALAT UJI:', e); process.exit(1); });