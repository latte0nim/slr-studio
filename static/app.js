(() => {
  'use strict';
  const STORE_KEY = 'litreview_studio_project_v1';
  const EMPTY_USAGE = { calls: 0, prompt_tokens: 0, cache_hit_tokens: 0, completion_tokens: 0, cost_usd: 0, usd_to_idr: 18000 };
  const DEFAULT_STATE = { articles: [], identifiedTotal: 0, duplicateCount: 0, synthesis: null, meta: {}, usage: {...EMPTY_USAGE} };
  let state = loadState();
  let activeTaxonomy = 'hierarchical';
  let activeArticleDetail = null;
  let isBusy = false;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const list = (value) => Array.isArray(value) ? value : [];
  const prettyDate = (value) => {
    if (!value) return '—';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('id-ID', {day:'2-digit', month:'short', year:'numeric'});
  };
  const fileSize = (n) => n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / (1024 * 1024)).toFixed(1)} MB`;
  const safeArrayText = (arr) => list(arr).length ? list(arr).map(x => typeof x === 'string' ? x : JSON.stringify(x)).join('\n') : 'Belum diekstrak / tidak dinyatakan dalam artikel.';

  function loadState() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return structuredClone(DEFAULT_STATE);
      const data = JSON.parse(raw);
      return {...structuredClone(DEFAULT_STATE), ...data, articles: Array.isArray(data.articles) ? data.articles : [], meta: data.meta || {}, usage: normaliseUsage(data.usage)};
    } catch (error) {
      console.warn('Project local storage tidak dapat dibaca:', error);
      return structuredClone(DEFAULT_STATE);
    }
  }
  function saveState() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
      updateSavedHint(true);
    } catch (error) {
      updateSavedHint(false);
      toast('Penyimpanan browser penuh. Ekspor proyek sebagai JSON dan kurangi data.', 'error');
    }
  }
  function updateSavedHint(ok) {
    const hint = $('.save-hint');
    if (!hint) return;
    hint.innerHTML = ok ? '<span class="save-check">✓</span> Perubahan disimpan lokal di browser' : '<span class="save-check">!</span> Penyimpanan lokal bermasalah — ekspor backup';
  }
  function toast(message, type = '') {
    const region = $('#toast-region');
    const node = document.createElement('div');
    node.className = `toast ${type}`;
    node.textContent = message;
    region.appendChild(node);
    setTimeout(() => node.remove(), 5200);
  }
  function globalMessage(message, type = '') {
    const box = $('#global-message');
    box.className = `message ${type}`;
    box.textContent = message;
    box.classList.remove('hidden');
  }
  function clearGlobalMessage() { $('#global-message').classList.add('hidden'); }
  const PANELS = {
    analysis: {wrap:'#upload-progress', text:'#progress-text', percent:'#progress-percent', fill:'#progress-bar-fill', current:'#progress-current', usage:'#progress-usage', log:'#process-log'},
    synthesis: {wrap:'#synthesis-progress', text:'#synthesis-progress-text', percent:'#synthesis-progress-percent', fill:'#synthesis-progress-fill', current:'#synthesis-progress-current', usage:'#synthesis-progress-usage', log:'#synthesis-progress-log'},
  };
  function setBusy(busy, text = 'Menganalisis artikel…', kind = 'analysis') {
    isBusy = busy;
    $('#analyze-button').disabled = busy;
    $('#run-synthesis').disabled = busy;
    Object.entries(PANELS).forEach(([name, p]) => $(p.wrap).classList.toggle('hidden', !(busy && name === kind)));
    if (busy) $(PANELS[kind].text).textContent = text;
  }
  function renderProcessProgress(snapshot, kind = 'analysis') {
    if (!snapshot || snapshot.pending) return; // pekerjaan belum terdaftar di server: pertahankan teks awal
    const p = PANELS[kind];
    const percent = Math.max(0, Math.min(100, Number(snapshot.percent) || 0));
    $(p.percent).textContent = `${percent}%`;
    const fill = $(p.fill);
    fill.style.width = `${percent}%`;
    fill.parentElement.classList.toggle('is-working', !!snapshot.indeterminate);
    $(p.text).textContent = snapshot.stage || 'Memproses…';
    const elapsed = Number(snapshot.elapsed) > 0 ? ` · ${snapshot.elapsed} dtk` : '';
    const where = snapshot.filename ? `Jurnal ${snapshot.current || 0}/${snapshot.total || 0}: ${snapshot.filename}` : (snapshot.stage || 'Menyiapkan proses');
    $(p.current).textContent = where + elapsed;
    $(p.usage).textContent = snapshot.usage ? liveUsageText(snapshot.usage) : '';
    const logBox = $(p.log);
    const logs = Array.isArray(snapshot.logs) ? snapshot.logs : [];
    logBox.innerHTML = logs.slice(-30).map(item => `<div class="process-log-item${item.live ? ' is-live' : ''}"><time>${esc(item.time || '')}</time><span>${esc(item.message || '')}</span></div>`).join('') || '<div class="process-log-item">Menunggu log proses…</div>';
    logBox.scrollTop = logBox.scrollHeight;
  }
  function newJobId() {
    return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : `job-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
  // Polling progres dari backend (/api/analysis-progress atau /api/synthesis-progress). Mengembalikan fungsi stop.
  function startProgressPolling(kind, jobId) {
    let active = true, wake = null;
    const loop = (async () => {
      while (active) {
        try {
          const snapshot = await api(`/api/${kind}-progress?job_id=${encodeURIComponent(jobId)}`);
          if (active) renderProcessProgress(snapshot, kind);
        } catch (_) { /* backend may still be starting */ }
        if (!active) break;
        await new Promise(resolve => { wake = resolve; setTimeout(resolve, 500); });
      }
    })();
    return async () => { active = false; if (wake) wake(); await loop; };
  }

  // ---- Pemakaian token (akumulasi per proyek, tersimpan di browser & ikut ekspor/impor) ----
  function normaliseUsage(u) {
    const out = {...EMPTY_USAGE};
    for (const key of Object.keys(EMPTY_USAGE)) {
      const value = Number(u && u[key]);
      if (Number.isFinite(value) && value >= 0) out[key] = value;
    }
    return out;
  }
  function addUsage(u) {
    if (!u || !u.calls) return;
    const total = normaliseUsage(state.usage);
    for (const key of ['calls', 'prompt_tokens', 'cache_hit_tokens', 'completion_tokens', 'cost_usd']) total[key] += Number(u[key]) || 0;
    if (Number(u.usd_to_idr) > 0) total.usd_to_idr = Number(u.usd_to_idr);
    state.usage = total;
    saveState();
    renderUsage();
  }
  function renderUsage() {
    const chip = $('#usage-chip');
    if (!chip) return;
    const u = normaliseUsage(state.usage);
    const nf = new Intl.NumberFormat('id-ID');
    const idr = u.cost_usd * u.usd_to_idr;
    const cost = u.cost_usd <= 0 ? 'lokal' : (idr < 1 ? '< Rp1' : `≈ Rp${nf.format(Math.round(idr))}`);
    $('#usage-text').textContent = `${nf.format(u.prompt_tokens + u.completion_tokens)} token · ${cost}`;
    updateUsageDot();
    if (!$('#usage-popover').hidden) renderUsagePopover();
  }

  // ---- Popup pemakaian token + status tarif peak/off-peak (muncul saat chip diklik) ----
  let healthInfo = null;
  let serverLimits = {maxFiles: 8, maxFileMb: 12};
  function applyServerLimits() {
    const note = $('#upload-limits-note'), small = $('#upload-limits-small');
    if (note) note.textContent = `Maks. ${serverLimits.maxFiles} PDF per batch · ${serverLimits.maxFileMb} MB per PDF`;
    if (small) small.textContent = `PDF berbasis teks · batch maksimum ${serverLimits.maxFiles} dokumen`;
  }
  async function sha256Hex(file) {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  function usageTzLabel() {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz === 'Asia/Jakarta') return 'WIB';
    if (tz === 'Asia/Makassar') return 'WITA';
    if (tz === 'Asia/Jayapura') return 'WIT';
    const part = new Intl.DateTimeFormat('id-ID', {timeZoneName: 'short'}).formatToParts(new Date()).find(x => x.type === 'timeZoneName');
    return part ? part.value : tz;
  }
  const clock = d => new Intl.DateTimeFormat('id-ID', {hour: '2-digit', minute: '2-digit', hour12: false}).format(d).replace('.', ':');
  function utcHourLocal(h) {
    const n = new Date();
    return clock(new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), h)));
  }
  function fmtDuration(ms) {
    const mins = Math.max(1, Math.round(ms / 60000));
    const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
    if (d) return `${d} hari ${h} jam`;
    if (h) return m ? `${h} jam ${m} menit` : `${h} jam`;
    return `${m} menit`;
  }
  function updateUsageDot() {
    const dot = $('#usage-period-dot');
    if (!dot) return;
    const p = healthInfo && healthInfo.pricing;
    if (!p) { dot.hidden = true; return; }
    dot.hidden = false;
    dot.className = 'usage-period-dot ' + (p.period === 'peak' ? 'is-peak' : 'is-off');
    dot.title = p.period === 'peak' ? 'Jam peak DeepSeek' : 'Off-peak DeepSeek';
  }
  function periodBlockHtml() {
    if (!healthInfo) {
      return '<div class="usage-period is-local"><b>Status tarif tidak tersedia</b><p>Backend tidak terhubung, jadi status peak/off-peak tidak dapat dimuat.</p></div>';
    }
    const p = healthInfo.pricing;
    if (!p) {
      return '<div class="usage-period is-local"><b>Model lokal</b><p>Tanpa biaya API, jadi tarif peak/off-peak tidak berlaku.</p></div>';
    }
    const tz = usageTzLabel();
    const peak = p.period === 'peak';
    const next = p.next_change_utc ? new Date(p.next_change_utc) : null;
    const title = !p.peak_enabled ? 'Tarif peak dinonaktifkan' : (peak ? `Jam peak · tarif ×${p.peak_multiplier}` : 'Off-peak · tarif normal');
    const nextLine = next && p.peak_enabled
      ? `${peak ? 'Off-peak' : 'Peak'} mulai pukul ${clock(next)} ${tz} (${fmtDuration(next - Date.now())} lagi).`
      : '';
    const r = p.rates_now || {};
    const usd = v => { let t = Number(v).toFixed(4).replace(/0+$/, ''); if ((t.split('.')[1] || '').length < 2) t = Number(v).toFixed(2); return '$' + t; };
    const rates = `Tarif sekarang / 1 juta token: input ${usd(r.input_miss)} · cache hit ${usd(r.input_hit)} · output ${usd(r.output)}.`;
    const sched = p.peak_enabled
      ? `Jadwal peak (Sen–Jum): ${(p.peak_windows_utc || []).map(w => w.replace('-', '–')).join(' & ')} UTC${new Date().getTimezoneOffset() === 0 ? '' : ` = ${utcHourLocal(1)}–${utcHourLocal(4)} & ${utcHourLocal(6)}–${utcHourLocal(10)} ${tz}`}. Di luar itu dan di akhir pekan: off-peak.`
      : '';
    return `<div class="usage-period ${peak ? 'is-peak' : 'is-off'}"><b><span class="usage-period-dot ${peak ? 'is-peak' : 'is-off'}"></span>${esc(title)}</b>${nextLine ? `<p>${esc(nextLine)}</p>` : ''}<p>${esc(rates)}</p>${sched ? `<p>${esc(sched)}</p>` : ''}</div>`;
  }
  function renderUsagePopover() {
    const body = $('#usage-pop-body');
    if (!body) return;
    const u = normaliseUsage(state.usage);
    const nf = new Intl.NumberFormat('id-ID');
    const idr = u.cost_usd * u.usd_to_idr;
    const costText = u.cost_usd <= 0
      ? 'Lokal (tanpa biaya API)'
      : `$${u.cost_usd.toFixed(5)} ≈ Rp${nf.format(Math.round(idr))}`;
    const sub = healthInfo ? `<p class="usage-sub">${esc(healthInfo.provider || '')} · ${esc(healthInfo.model || '')}</p>` : '';
    body.innerHTML = `${sub}${periodBlockHtml()}
      <div class="usage-stats">
        <div><span>Input</span><strong>${nf.format(u.prompt_tokens)}</strong></div>
        <div><span>Cache hit</span><strong>${nf.format(u.cache_hit_tokens)}</strong></div>
        <div><span>Output</span><strong>${nf.format(u.completion_tokens)}</strong></div>
        <div><span>Panggilan API</span><strong>${nf.format(u.calls)}</strong></div>
        <div><span>Total token</span><strong>${nf.format(u.prompt_tokens + u.completion_tokens)}</strong></div>
        <div><span>Estimasi biaya</span><strong>${esc(costText)}</strong></div>
      </div>
      <p class="usage-note">Biaya dihitung per panggilan memakai tarif saat panggilan terjadi. Data tersimpan di browser untuk proyek ini dan ikut ekspor/impor.</p>${donateBlockHtml(u.cost_usd > 0 ? idr : 0, nf)}`;
  }
  // ---- Ajakan bantu bayar API via QRIS (opsional, tampil di bawah popup token) ----
  function donateBlockHtml(idr, nf) {
    const rounded = idr >= 1 ? Math.max(100, Math.round(idr / 100) * 100) : 0;
    const msg = rounded
      ? `Habis token sekitar Rp${nf.format(rounded)} nih ngab. Kalau mau bantu bayar API biar server tetep tancap gas, bisa scan QRIS di bawah ya!`
      : 'Server ini jalan pakai API berbayar. Kalau mau bantu bayar API biar tetep tancap gas, bisa scan QRIS di bawah ya!';
    return `<div class="donate-box"><b class="donate-title">// traktir server</b><p>${esc(msg)}</p><img class="donate-qris" src="/static/qris.png" alt="QRIS untuk bantu bayar API" loading="lazy" onerror="this.closest('.donate-box').hidden=true"><small>Sukarela, tidak wajib. Makasih banyak ngab!</small></div>`;
  }
  async function refreshHealthInfo() {
    try { healthInfo = await api('/api/health'); } catch (_) { healthInfo = null; }
    updateUsageDot();
    if (!$('#usage-popover').hidden) renderUsagePopover();
  }
  let resetArmTimer = null;
  function disarmReset() {
    clearTimeout(resetArmTimer);
    const btn = $('#usage-reset');
    if (btn) { btn.classList.remove('is-confirm'); btn.textContent = 'Reset penghitung'; }
  }
  function openUsagePopover() {
    $('#usage-popover').hidden = false;
    $('#usage-chip').setAttribute('aria-expanded', 'true');
    renderUsagePopover();
    refreshHealthInfo();
  }
  function closeUsagePopover() {
    $('#usage-popover').hidden = true;
    $('#usage-chip').setAttribute('aria-expanded', 'false');
    disarmReset();
  }
  function setupUsagePopover() {
    $('#usage-chip').addEventListener('click', () => $('#usage-popover').hidden ? openUsagePopover() : closeUsagePopover());
    $('#usage-pop-close').addEventListener('click', closeUsagePopover);
    document.addEventListener('click', e => {
      if (!$('#usage-popover').hidden && !e.target.closest('.usage-wrap')) closeUsagePopover();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#usage-popover').hidden) { closeUsagePopover(); $('#usage-chip').focus(); } });
    $('#usage-reset').addEventListener('click', () => {
      const btn = $('#usage-reset');
      if (!btn.classList.contains('is-confirm')) {
        btn.classList.add('is-confirm');
        btn.textContent = 'Yakin? Klik lagi untuk reset';
        resetArmTimer = setTimeout(disarmReset, 4000);
        return;
      }
      disarmReset();
      state.usage = {...EMPTY_USAGE};
      saveState();
      renderUsage();
      toast('Penghitung token direset.', 'success');
    });
    setInterval(refreshHealthInfo, 60000); // perbarui status peak/off-peak tiap menit
  }
  function usageText(u) {
    if (!u || !u.calls) return '';
    const nf = new Intl.NumberFormat('id-ID');
    const cost = u.cost_idr > 0 ? `≈ Rp${nf.format(u.cost_idr)}` : 'lokal';
    return ` Pemakaian: ${nf.format(u.prompt_tokens)} token input, ${nf.format(u.completion_tokens)} token output (${cost}).`;
  }
  function liveUsageText(u) {
    const nf = new Intl.NumberFormat('id-ID');
    const cost = u.calls ? (u.cost_idr > 0 ? ` · ≈ Rp${nf.format(u.cost_idr)}` : ' · lokal') : '';
    const calls = u.calls ? ` · ${nf.format(u.calls)} panggilan API` : '';
    return `Token terpakai: ${nf.format(u.prompt_tokens || 0)} input · ${nf.format(u.completion_tokens || 0)} output${cost}${calls}`;
  }
  async function api(path, options = {}) {
    const response = await fetch(path, options);
    let data = {};
    try { data = await response.json(); } catch (_) { data = {}; }
    if (!response.ok) {
      const error = new Error(data.error || `Permintaan gagal (HTTP ${response.status}).`);
      error.usage = data.usage; // token tetap terpakai walau permintaan gagal
      throw error;
    }
    return data;
  }

  function getMetaFromForm() {
    return {
      research_question: $('#research-question').value.trim(),
      source_name: $('#source-name').value.trim(),
      search_date: $('#search-date').value,
      search_query: $('#search-query').value.trim(),
      inclusion: $('#inclusion').value.trim(),
      exclusion: $('#exclusion').value.trim(),
    };
  }
  function applyMeta(meta = {}) {
    $('#research-question').value = meta.research_question || '';
    $('#source-name').value = meta.source_name || '';
    $('#search-date').value = meta.search_date || '';
    $('#search-query').value = meta.search_query || '';
    $('#inclusion').value = meta.inclusion || '';
    $('#exclusion').value = meta.exclusion || '';
  }
  function saveMetaFromForm(showToast = false) {
    state.meta = getMetaFromForm();
    saveState();
    if (showToast) toast('Konfigurasi review tersimpan.', 'success');
  }

  function navigate(target) {
    if (!target || !$('#' + target)) return;
    $$('.page-section').forEach(section => section.classList.toggle('active-section', section.id === target));
    $$('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.target === target));
    const labels = {overview:'Ikhtisar', articles:'Artikel', prisma:'PRISMA Flow', synthesis:'Review Synthesis', taxonomy:'Taxonomy', cooccurrence:'Co-occurrence', 'system-map':'System Map'};
    $('#breadcrumb-current').textContent = labels[target] || target;
    window.scrollTo({top:0, behavior:'smooth'});
    if (target === 'articles') renderArticles();
    if (target === 'prisma') renderPrisma();
    if (target === 'taxonomy') renderTaxonomy();
    if (target === 'cooccurrence') renderCooccurrence();
    if (target === 'system-map') renderSystemMap();
    if (target === 'synthesis') renderSynthesis();
  }

  function currentCounts() {
    const articles = state.articles;
    const screeningPending = articles.filter(a => (a.screening_decision || 'pending') === 'pending').length;
    const screeningExcluded = articles.filter(a => a.screening_decision === 'exclude').length;
    const screenPassed = articles.filter(a => a.screening_decision === 'include').length;
    const fulltextPending = articles.filter(a => a.screening_decision === 'include' && (a.eligibility_decision || 'pending') === 'pending').length;
    const fulltextExcluded = articles.filter(a => a.screening_decision === 'include' && a.eligibility_decision === 'exclude').length;
    const included = articles.filter(a => a.screening_decision === 'include' && a.eligibility_decision === 'include').length;
    const completed = articles.filter(a => a.screening_decision === 'exclude' || (a.screening_decision === 'include' && a.eligibility_decision !== 'pending')).length;
    return {unique:articles.length, identified:state.identifiedTotal || articles.length, duplicates:state.duplicateCount || 0, screeningPending, screeningExcluded, screenPassed, fulltextPending, fulltextExcluded, included, completed, total:articles.length};
  }
  function renderMetrics() {
    const c = currentCounts();
    $('#nav-article-count').textContent = c.unique;
    $('#metric-articles').textContent = c.unique;
    $('#metric-pending').textContent = c.screeningPending + c.fulltextPending;
    $('#metric-included').textContent = c.included;
    $('#metric-gaps').textContent = state.synthesis ? list(state.synthesis.research_gaps).length : '—';
    $('#metric-gaps-note').textContent = state.synthesis ? 'Gap hasil sintesis' : 'Jalankan sintesis untuk melihat gap';
    $('#progress-ratio').textContent = `${c.completed} / ${c.total} selesai`;
    const n = c.total || 1;
    $('#stacked-progress .seg-included').style.width = `${(c.included / n) * 100}%`;
    $('#stacked-progress .seg-excluded').style.width = `${((c.screeningExcluded + c.fulltextExcluded) / n) * 100}%`;
    $('#stacked-progress .seg-pending').style.width = `${Math.max(0, 100 - ((c.included + c.screeningExcluded + c.fulltextExcluded) / n) * 100)}%`;
    $('#article-table-note').textContent = `${c.unique} artikel unik · ${c.duplicates} duplikat terdeteksi · ${c.included} masuk sintesis`;
  }

  function recommendationBadge(article) {
    const s = (article.screening_suggestion || {}).decision || 'review';
    const map = {include:['recommend-include','Saran INCLUDE'], exclude:['recommend-exclude','Saran EXCLUDE'], review:['recommend-review','Perlu ditinjau']};
    const [cls, label] = map[s] || map.review;
    return `<span class="recommendation ${cls}" title="${esc((article.screening_suggestion || {}).reason || '')}">${esc(label)}</span>`;
  }
  function statusLabel(status, kind) {
    const prefix = kind === 'screen' ? 'Screening' : 'Full-text';
    const opts = status === 'include' ? 'INCLUDE' : status === 'exclude' ? 'EXCLUDE' : 'Belum diputuskan';
    return `${prefix}: ${opts}`;
  }
  function renderArticles() {
    const body = $('#articles-body');
    const query = ($('#article-search')?.value || '').trim().toLowerCase();
    const filter = $('#article-filter')?.value || 'all';
    const articles = state.articles.filter(a => {
      const hay = `${a.title || ''} ${(a.authors || []).join(' ')} ${(a.topic_tags || []).join(' ')} ${a.filename || ''}`.toLowerCase();
      if (query && !hay.includes(query)) return false;
      if (filter === 'pending') return a.screening_decision !== 'exclude' && !(a.screening_decision === 'include' && a.eligibility_decision === 'include');
      if (filter === 'included') return a.screening_decision === 'include' && a.eligibility_decision === 'include';
      if (filter === 'excluded') return a.screening_decision === 'exclude' || (a.screening_decision === 'include' && a.eligibility_decision === 'exclude');
      return true;
    });
    if (!articles.length) {
      body.innerHTML = `<tr><td colspan="5" class="empty-cell">${state.articles.length ? 'Tidak ada artikel yang cocok dengan filter.' : 'Belum ada artikel. Unggah PDF pada halaman Ikhtisar.'}</td></tr>`;
      return;
    }
    body.innerHTML = articles.map(a => {
      const authors = list(a.authors).slice(0,3).join(', ');
      const year = a.year || 'Tahun tidak terdeteksi';
      const screen = a.screening_decision || 'pending';
      const eligibility = a.eligibility_decision || 'pending';
      return `<tr>
        <td class="article-title-cell"><span class="article-title">${esc(a.title || a.filename)}</span><span class="article-meta">${esc(authors || 'Penulis tidak terdeteksi')} · ${esc(year)}${a.doi ? ` · DOI: ${esc(a.doi)}` : ''}</span><span class="article-filename">${esc(a.filename || '')}</span></td>
        <td>${recommendationBadge(a)}<div class="article-meta" style="max-width:180px;margin-top:6px">${esc((a.screening_suggestion || {}).reason || 'Tidak ada alasan rekomendasi.')}</div></td>
        <td class="select-cell"><select aria-label="Keputusan screening" data-id="${esc(a.id)}" data-field="screening_decision">${decisionOptions(screen)}</select></td>
        <td class="select-cell"><select aria-label="Keputusan full text" data-id="${esc(a.id)}" data-field="eligibility_decision" ${screen !== 'include' ? 'disabled title="Screening harus INCLUDE terlebih dahulu"' : ''}>${decisionOptions(eligibility)}</select></td>
        <td><button class="icon-button" data-detail="${esc(a.id)}" aria-label="Lihat detail artikel" title="Detail artikel">↗</button></td>
      </tr>`;
    }).join('');
  }
  function decisionOptions(value) {
    const options = [['pending','Belum diputuskan'],['include','INCLUDE'],['exclude','EXCLUDE']];
    return options.map(([key,label]) => `<option value="${key}" ${key===value?'selected':''}>${label}</option>`).join('');
  }
  function findArticle(id) { return state.articles.find(a => a.id === id); }
  function escapeWithBreaks(text) { return esc(text).replace(/\n/g, '<br>'); }
  function renderArticleDetail(id) {
    const a = findArticle(id); if (!a) return;
    activeArticleDetail = id;
    const quotes = list(a.evidence_quotes).map(q => `<li><strong>${esc(q.claim || 'Klaim')}</strong><br>“${esc(q.quote || '')}” ${q.page ? `<span class="article-meta">(hal. ${esc(q.page)})</span>` : ''}</li>`).join('');
    $('#article-detail').innerHTML = `<button class="icon-button detail-close" id="close-detail" aria-label="Tutup detail">×</button><h2 class="detail-title">${esc(a.title)}</h2><div class="detail-meta">${esc(list(a.authors).join(', ') || 'Penulis tidak terdeteksi')} · ${esc(a.year || 'Tahun tidak terdeteksi')} · ${esc(a.pages || '?')} halaman · ${esc(a.filename || '')}</div><div class="detail-grid">
      <div class="detail-block"><h4>ABSTRACT / TUJUAN</h4><p>${escapeWithBreaks(a.abstract || a.objective || 'Tidak diekstrak.')}</p></div>
      <div class="detail-block"><h4>METODE & KONTEKS</h4><p>${escapeWithBreaks(a.methods || 'Metode tidak terdeteksi')}\n\nKonteks: ${escapeWithBreaks(a.context || 'Tidak tersedia')}</p></div>
      <div class="detail-block"><h4>TEMUAN UTAMA</h4><ul>${list(a.findings).length ? list(a.findings).map(x=>`<li>${esc(x)}</li>`).join('') : '<li>Temuan tidak diekstrak.</li>'}</ul></div>
      <div class="detail-block"><h4>VARIABEL / TOPIK</h4><p>${esc([...list(a.variables), ...list(a.topic_tags)].join(' · ') || 'Tidak terdeteksi')}</p></div>
      <div class="detail-block"><h4>LIMITASI</h4><ul>${list(a.limitations).length ? list(a.limitations).map(x=>`<li>${esc(x)}</li>`).join('') : '<li>Tidak dinyatakan / tidak terdeteksi.</li>'}</ul></div>
      <div class="detail-block"><h4>REKOMENDASI SCREENING</h4><p>${esc((a.screening_suggestion || {}).decision || 'review').toUpperCase()} — ${esc((a.screening_suggestion || {}).reason || 'Perlu verifikasi manual.')}</p></div>
      ${quotes ? `<div class="detail-block" style="grid-column:1/-1"><h4>KUTIPAN BUKTI YANG DIEKSTRAK</h4><ul>${quotes}</ul></div>` : ''}
      <div class="detail-block" style="grid-column:1/-1"><h4>CATATAN</h4><p>Hasil ekstraksi perlu diverifikasi dengan artikel sumber sebelum dipakai sebagai kutipan atau bukti final. File PDF asli tetap disimpan lokal dan JSON terstruktur tersedia di folder data/json.</p></div>
      </div>`;
    $('#article-detail').classList.remove('hidden');
    $('#article-detail').scrollIntoView({behavior:'smooth',block:'start'});
  }

  function renderPrisma() {
    const c = currentCounts();
    $('#prisma-updated').textContent = state.articles.length ? `${state.articles.length} artikel unik · diperbarui ${new Date().toLocaleString('id-ID')}` : 'Belum ada data';
    if (!state.articles.length) {
      $('#prisma-diagram').innerHTML = '<div class="empty-state">Unggah PDF dan tetapkan keputusan screening untuk membangun diagram PRISMA.</div>';
      return;
    }
    const completed = c.screeningPending === 0 && c.fulltextPending === 0;
    const finalLabel = completed ? 'Keputusan seleksi lengkap' : 'Belum menjadi flow final — masih ada keputusan pending';
    const finalClass = completed ? 'stage-main' : 'stage-pending';
    $('#prisma-diagram').innerHTML = `<div class="prisma-grid">
      <div class="prisma-row"><div class="prisma-stage"><div class="stage-label">IDENTIFICATION</div><strong>${c.identified}</strong><p>Records identified dari PDF berhasil diekstrak dan duplikat yang diterima untuk diperiksa</p></div><div class="prisma-arrow">→</div><div class="prisma-stage stage-excluded"><div class="stage-label">DUPLICATES</div><strong>${c.duplicates}</strong><p>Duplikat PDF persis yang dihapus saat penambahan</p></div></div>
      <div class="prisma-connector">↓</div>
      <div class="prisma-row"><div class="prisma-stage stage-main"><div class="stage-label">SCREENING</div><strong>${c.unique}</strong><p>Artikel unik tersedia untuk pemeriksaan judul/abstrak</p></div><div class="prisma-arrow">→</div><div class="prisma-stage stage-excluded"><div class="stage-label">RECORDS EXCLUDED</div><strong>${c.screeningExcluded}</strong><p>Dikeluarkan pada screening judul/abstrak</p></div></div>
      <div class="prisma-pending-row"><span class="stage-pending-chip">${c.screeningPending} belum diputuskan pada screening</span><span class="stage-next">${c.screenPassed} lolos screening → penilaian full-text</span></div>
      <div class="prisma-connector">↓</div>
      <div class="prisma-row"><div class="prisma-stage stage-main"><div class="stage-label">ELIGIBILITY</div><strong>${c.screenPassed}</strong><p>Artikel dilanjutkan ke penilaian kelayakan full-text</p></div><div class="prisma-arrow">→</div><div class="prisma-stage stage-excluded"><div class="stage-label">FULL-TEXT EXCLUDED</div><strong>${c.fulltextExcluded}</strong><p>Dikeluarkan setelah penilaian full-text</p></div></div>
      <div class="prisma-pending-row"><span class="stage-pending-chip">${c.fulltextPending} full-text belum diputuskan</span><span class="stage-next">Lolos dan disetujui: ${c.included}</span></div>
      <div class="prisma-connector">↓</div>
      <div class="prisma-final-row"><div class="prisma-stage ${finalClass}"><div class="stage-label">INCLUDED STUDIES</div><strong>${c.included}</strong><p>Artikel siap digunakan untuk sintesis</p></div><div class="prisma-final-note">${esc(finalLabel)}<small>${c.screeningPending + c.fulltextPending} keputusan masih pending</small></div></div>
    </div>`;
  }

  function citationChips(ids) {
    return list(ids).map(id => {
      const a = findArticle(id);
      return `<span class="source-chip" title="${esc(a ? a.title : id)}">${esc(a ? `${a.year || 'n.d.'} · ${a.title.slice(0,28)}${a.title.length>28?'…':''}` : id)}</span>`;
    }).join('');
  }
  function renderSynthesis() {
    const s = state.synthesis;
    $('#synthesis-empty').classList.toggle('hidden', !!s);
    $('#synthesis-output').classList.toggle('hidden', !s);
    if (!s) return;
    const themes = list(s.main_themes).map(t => `<div class="synth-list-item"><div class="synth-card-head"><h4>${esc(t.name || 'Tema')}</h4><span class="confidence ${(t.confidence || '').toLowerCase()}">${esc(t.confidence || 'confidence tidak ditentukan')}</span></div><p>${esc(t.synthesis || t.description || '')}</p>${t.description && t.synthesis ? `<p style="margin-top:7px"><strong>Definisi:</strong> ${esc(t.description)}</p>` : ''}<div class="source-chips">${citationChips(t.article_ids)}</div></div>`).join('');
    const agreements = list(s.agreements).map(x=>`<div class="synth-list-item"><h4>${esc(x.claim || 'Temuan konsisten')}</h4><p>${esc(x.interpretation || x.notes || '')}</p><div class="source-chips">${citationChips(x.article_ids)}</div></div>`).join('');
    const contradictions = list(s.contradictions).map(x=>`<div class="synth-list-item"><h4>${esc(x.issue || 'Perbedaan temuan')}</h4><p>${esc(x.possible_explanation || 'Belum ada penjelasan yang cukup dari ringkasan.')}</p><div class="source-chips">${citationChips(x.article_ids)}</div></div>`).join('');
    const gaps = list(s.research_gaps).map((x,i)=>`<div class="synth-list-item"><div class="synth-eyebrow">GAP ${String(i+1).padStart(2,'0')}</div><h4>${esc(x.gap || 'Research gap')}</h4><p>${esc(x.evidence || '')}</p>${x.suggested_next_step ? `<p style="margin-top:7px"><strong>Arah penelitian:</strong> ${esc(x.suggested_next_step)}</p>` : ''}<div class="source-chips">${citationChips(x.article_ids)}</div></div>`).join('');
    const limitations = list(s.limitations_of_corpus).map(x=>`<li>${esc(x)}</li>`).join('');
    const notes = list(s.review_notes).map(x=>`<li>${esc(x)}</li>`).join('');
    $('#synthesis-output').innerHTML = `
      <div class="synth-card"><div class="synth-eyebrow">SUMMARY / ${esc(s.included_article_count || currentCounts().included)} ARTIKEL</div><div class="synth-card-head"><h2>Sintesis eksekutif</h2><span class="status-pill status-ok">Hasil sintesis · perlu verifikasi</span></div><p>${esc(s.executive_synthesis || 'Tidak ada ringkasan.')}</p><p class="citation-note"><strong>Research question:</strong> ${esc(s.research_question_refinement || $('#research-question').value || 'Belum ditentukan')}</p>${list(s.subquestions).length ? `<h3 style="margin:16px 0 8px">Subquestions</h3><ol class="review-note-list">${list(s.subquestions).map(x=>`<li>${esc(x)}</li>`).join('')}</ol>` : ''}</div>
      <div class="synth-card"><div class="synth-card-head"><h2>01 / Tema utama</h2><span class="confidence">${list(s.main_themes).length} tema</span></div><div class="synth-list">${themes || '<p>Belum ada tema utama.</p>'}</div></div>
      <div class="detail-grid" style="margin-bottom:13px;align-items:start"><div class="synth-card" style="margin:0;height:100%"><div class="synth-card-head"><h2>02 / Konsistensi</h2><span class="confidence high">${list(s.agreements).length}</span></div><div class="synth-list">${agreements || '<p>Tidak ada pola konsisten yang dirangkum.</p>'}</div></div><div class="synth-card" style="margin:0;height:100%"><div class="synth-card-head"><h2>03 / Kontradiksi</h2><span class="confidence low">${list(s.contradictions).length}</span></div><div class="synth-list">${contradictions || '<p>Tidak ada kontradiksi yang teridentifikasi dari ringkasan.</p>'}</div></div></div>
      <div class="synth-card"><div class="synth-card-head"><h2>04 / Research gaps</h2><span class="confidence">${list(s.research_gaps).length} kandidat gap</span></div><div class="synth-list">${gaps || '<p>Tidak ada research gap yang dirangkum.</p>'}</div></div>
      <div class="detail-grid" style="align-items:start"><div class="synth-card" style="margin:0"><h3>Limitasi korpus</h3><ul class="review-note-list">${limitations || '<li>Tidak tersedia.</li>'}</ul></div><div class="synth-card" style="margin:0"><h3>Catatan verifikasi</h3><ul class="review-note-list">${notes || '<li>Periksa kembali hasil ekstraksi pada artikel asli.</li>'}</ul></div></div>
      <p class="citation-note">Dihasilkan ${esc(prettyDate(s.generated_at))} menggunakan model ${esc(s.model || 'lokal')}. Sintesis dibangun dari artikel yang secara manual ditandai INCLUDE pada dua tahap. Chip artikel menunjukkan judul singkat sumber dukungan; tetap buka PDF asli untuk mengonfirmasi klaim.</p>`;
  }

  function svgText(text, x, y, size=12, weight=600, fill='#d6d4cb') {
    return `<text x="${x}" y="${y}" text-anchor="middle" font-size="${size}" font-weight="${weight}" fill="${fill}">${esc(String(text || '').slice(0,38))}</text>`;
  }
  function renderHierarchySvg(root, nodes, edges, poly=false) {
    if (!nodes.length && !root) return '<div class="empty-state">Belum ada struktur taxonomy yang cukup untuk divisualisasikan.</div>';
    const all = root ? [root, ...nodes] : nodes;
    const ids = all.map((n,i)=>String(n.id || `node-${i}`));
    const index = Object.fromEntries(ids.map((id,i)=>[id,i]));
    const links = (edges || []).map(e=>({a:index[String(e.from || e.source || e.parent_id)], b:index[String(e.to || e.target || e.id)]})).filter(e=>Number.isInteger(e.a)&&Number.isInteger(e.b)&&e.a!==e.b);
    if (!links.length && !poly) nodes.forEach((n,i)=>{const pid=String(n.parent_id || (root && root.id) || ''); if (index[pid]!==undefined) links.push({a:index[pid],b:index[String(n.id || `node-${i+1}`)]});});
    const w=900, h=Math.max(250, Math.ceil(all.length/4)*125+70), pos=[];
    if (poly) {
      all.forEach((n,i)=>{const angle=(2*Math.PI*i/all.length)-Math.PI/2;pos.push({x:w/2+Math.cos(angle)*Math.min(310,all.length*28),y:h/2+Math.sin(angle)*Math.min(115,all.length*15)});});
    } else {
      const depth={}; depth[0]=0;
      let changed=true; for(let pass=0;pass<all.length&&changed;pass++){changed=false;links.forEach(e=>{if(depth[e.a]!==undefined&&depth[e.b]===undefined){depth[e.b]=depth[e.a]+1;changed=true;}});}
      all.forEach((n,i)=>{const d=depth[i]||0;const same=all.map((_,j)=>j).filter(j=>(depth[j]||0)===d);const rank=same.indexOf(i);pos.push({x:(rank+1)*w/(same.length+1),y:45+d*105});});
    }
    let svg=`<svg class="taxonomy-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="Diagram taxonomy"><defs><marker id="tax-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#8b8b82"/></marker></defs>`;
    links.forEach(e=>{const a=pos[e.a],b=pos[e.b];svg+=`<path d="M${a.x} ${a.y+20} L${b.x} ${b.y-20}" stroke="#8b8b82" stroke-width="1.5" fill="none" marker-end="url(#tax-arrow)"/>`;});
    all.forEach((n,i)=>{const q=pos[i],name=n.name||n.label||n.id||'Konsep';svg+=`<g><rect x="${q.x-85}" y="${q.y-22}" width="170" height="44" fill="${i===0?'#f3f1e7':'#141413'}" stroke="${i===0?'#f3f1e7':'#8b8b82'}"/><text x="${q.x}" y="${q.y+4}" text-anchor="middle" font-family="IBM Plex Mono,monospace" font-size="10" font-weight="700" fill="${i===0?'#0d0d0c':'#d6d4cb'}">${esc(String(name).slice(0,25))}</text></g>`;});
    return svg+'</svg>';
  }
  function renderCooccurrence() {
    const s=state.synthesis, canvas=$('#cooccurrence-canvas'), meta=$('#cooccurrence-meta');
    if(!s){canvas.innerHTML='<div class="empty-state">Jalankan Review Synthesis untuk membangun jaringan istilah.</div>';meta.textContent='Belum ada data sintesis';return;}
    const included=list(state.articles).filter(a=>a.screening_decision==='include'&&a.eligibility_decision==='include');
    const docs=included.length?included:list(state.articles).filter(a=>a.extraction_status==='success');
    const stop=new Set(['dengan','dalam','untuk','pada','yang','dan','atau','the','and','for','with','from','this','that','study','research','analysis','based','using','based on']);
    const docTerms=[];
    docs.forEach(a=>{const ext=a.extraction||a;let raw=[...list(ext.topic_tags),...list(ext.concepts),...list(ext.keywords)]; if(!raw.length) raw=[ext.title,ext.abstract].filter(Boolean).join(' ').match(/[A-Za-z][A-Za-z-]{3,}/g)||[];const terms=[...new Set(raw.map(x=>String(typeof x==='object'?(x.name||x.label||''):x).toLowerCase().trim()).filter(x=>x.length>2&&!stop.has(x)))].slice(0,18); if(terms.length)docTerms.push(terms);});
    const freq={},pairs={};docTerms.forEach(terms=>{terms.forEach(t=>freq[t]=(freq[t]||0)+1);for(let i=0;i<terms.length;i++)for(let j=i+1;j<terms.length;j++){const k=[terms[i],terms[j]].sort().join('|||');pairs[k]=(pairs[k]||0)+1;}});
    const min=Number($('#cooccurrence-min')?.value||2), top=Object.entries(freq).filter(([t,n])=>n>=min).sort((a,b)=>b[1]-a[1]).slice(0,35);const keep=new Set(top.map(x=>x[0]));const edges=Object.entries(pairs).map(([k,v])=>({terms:k.split('|||'),v})).filter(e=>e.v>=min&&e.terms.every(t=>keep.has(t))).sort((a,b)=>b.v-a.v).slice(0,75);
    if(!top.length){canvas.innerHTML='<div class="empty-state">Belum ada kata kunci berulang. Coba ubah minimum kemunculan menjadi 1 atau jalankan ulang sintesis.</div>';meta.textContent=`${docs.length} artikel diperiksa`;return;}
    const w=900,h=560,cx=w/2,cy=h/2,max=Math.max(...top.map(x=>x[1]));const pos={};top.forEach(([t,n],i)=>{const angle=(2*Math.PI*i/top.length)-Math.PI/2;const r=70+Math.min(170,top.length*5);pos[t]={x:cx+Math.cos(angle)*r,y:cy+Math.sin(angle)*r,n};});
    let svg=`<svg class="cooccur-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="Co-occurrence network"><rect width="100%" height="100%" fill="#0d0d0c"/>`;
    edges.forEach(e=>{const a=pos[e.terms[0]],b=pos[e.terms[1]];if(a&&b)svg+=`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#8b8b82" stroke-opacity=".5" stroke-width="${Math.min(5,1+e.v)}"/>`;});
    top.forEach(([t,n],i)=>{const q=pos[t],r=9+14*n/max;svg+=`<g><circle cx="${q.x}" cy="${q.y}" r="${r}" fill="${i%3===0?'#f3f1e7':i%3===1?'#9fd09f':'#dcb85c'}" fill-opacity=".95" stroke="#0d0d0c" stroke-width="2"/><text x="${q.x}" y="${q.y+r+13}" text-anchor="middle" font-family="IBM Plex Mono,monospace" font-size="${Math.min(11,9+n/max*2)}" font-weight="500" fill="#d6d4cb">${esc(t.slice(0,24))}</text></g>`;});
    canvas.innerHTML=svg+'</svg>';meta.textContent=`${docs.length} artikel · ${top.length} istilah · ${edges.length} hubungan co-occurrence`;
  }

  function renderTaxonomy() {
    const s = state.synthesis;
    const box = $('#taxonomy-content');
    if (s && s.taxonomy_status === 'failed') {
      box.innerHTML = `<div class="empty-state"><strong>Sintesis berhasil, tetapi taxonomy belum berhasil dibuat.</strong><p>${esc(s.taxonomy_error || 'Model tidak menghasilkan struktur taxonomy yang dapat dipakai.')}</p><p>Periksa apakah model AI (Ollama/DeepSeek) masih berjalan, lalu jalankan ulang sintesis untuk mencoba membuat taxonomy lagi.</p></div>`;
      return;
    }
    if (!s || !s.taxonomy) { box.innerHTML = '<div class="empty-state">Jalankan Review Synthesis untuk menghasilkan taxonomy dari artikel yang termasuk.</div>'; return; }
    $$('.taxonomy-tab').forEach(b => b.classList.toggle('active', b.dataset.taxonomy === activeTaxonomy));
    if (activeTaxonomy === 'hierarchical') {
      const h = s.taxonomy.hierarchical || {}; const root = h.root || {id:'root',name:'Konsep utama'}; const nodes = list(h.nodes);
      box.innerHTML = `<div class="synth-eyebrow">HIERARCHICAL TAXONOMY</div><h2 class="taxonomy-title">Struktur dari konsep umum ke subkategori</h2><p class="taxonomy-help">Setiap konsep memiliki satu jalur induk utama. Periksa kembali hierarki yang diusulkan.</p>${nodes.length ? renderHierarchySvg(root,nodes,[]) : '<div class="empty-state">Belum ada struktur hierarki. Jalankan ulang sintesis untuk menghasilkan node hierarkis.</div>'}`;
    } else if (activeTaxonomy === 'faceted') {
      const f=s.taxonomy.faceted||{}; const facets=list(f.facets);
      box.innerHTML = `<div class="synth-eyebrow">FACETED TAXONOMY</div><h2 class="taxonomy-title">Klasifikasi berdasarkan beberapa facet</h2><p class="taxonomy-help">Setiap kolom menunjukkan dimensi atribut yang berbeda untuk mendeskripsikan studi atau konsep.</p>${facets.length ? `<div class="facet-diagram">${facets.map((facet,i)=>`<div class="facet-column"><div class="facet-head">${esc(facet.name||'Facet '+(i+1))}</div>${list(facet.values).map(v=>`<div class="facet-value"><strong>${esc(v.name||'Kategori')}</strong><small>${esc(v.description||'')}</small><span>${list(v.article_ids).length} artikel</span></div>`).join('')}</div>`).join('')}</div>` : '<div class="empty-state">Belum ada facet yang dihasilkan. Jalankan ulang sintesis untuk membuat klasifikasi multi-dimensi.</div>'}`;
    } else if (activeTaxonomy === 'flat') {
      const data = list(s.taxonomy.flat);
      box.innerHTML = `<div class="synth-eyebrow">FLAT / LIST TAXONOMY</div><h2 style="font-size:17px;margin:0 0 15px">Kategori pada level yang sama</h2>${data.length ? `<div class="taxonomy-list">${data.map((x,i)=>`<div class="taxonomy-item"><div class="taxonomy-index">KATEGORI ${String(i+1).padStart(2,'0')}</div><h3>${esc(x.name || 'Kategori')}</h3><p>${esc(x.description || '')}</p><span class="evidence-count">${list(x.article_ids).length} artikel pendukung</span><div class="source-chips">${citationChips(x.article_ids)}</div></div>`).join('')}</div>` : '<div class="empty-state">Model tidak menghasilkan daftar kategori. Periksa data sintesis atau coba ulangi.</div>'}`;
    } else if (activeTaxonomy === 'poly') {
      const data = s.taxonomy.polyhierarchy || {};
      const nodes = list(data.nodes);
      const nodeNames = Object.fromEntries(nodes.map(n => [n.id, n.name]));
      box.innerHTML = `<div class="synth-eyebrow">POLY-HIERARCHICAL TAXONOMY</div><h2 style="font-size:17px;margin:0 0 7px">Satu konsep dapat memiliki beberapa parent</h2><p style="color:#8b8b82;font-size:11px;margin:0 0 15px">Relasi parent berasal dari struktur model dan harus diverifikasi secara konseptual.</p>${nodes.length ? `${renderHierarchySvg(null,nodes,list(data.edges),true)}<div class="poly-tree">${nodes.map(n=>`<div class="poly-node"><h3>${esc(n.name || n.id)}</h3><p>${esc(n.description || '')}</p><div class="poly-parents">Parent: ${list(n.parent_ids).length ? list(n.parent_ids).map(id=>esc(nodeNames[id] || id)).join(' · ') : 'Tidak ditentukan'}</div><div class="source-chips">${citationChips(n.article_ids)}</div></div>`).join('')}</div>` : '<div class="empty-state">Belum ada node poly-hierarchy pada hasil sintesis.</div>'}`;
    } else {
      const m = s.taxonomy.matrix || {};
      const cols = list(m.columns);
      const rows = list(m.rows);
      box.innerHTML = `<div class="synth-eyebrow">MATRICES TAXONOMY</div><h2 style="font-size:17px;margin:0 0 7px">Klasifikasi silang antar dimensi</h2><p style="font-size:11px;color:#8b8b82;margin:0 0 15px">Baris: ${esc(m.row_axis_name || 'Dimensi baris')} · Kolom: ${esc(m.column_axis_name || 'Dimensi kolom')}</p>${rows.length && cols.length ? `<div class="matrix-wrap"><table class="matrix-table"><thead><tr><th>${esc(m.row_axis_name || 'Kategori')}</th>${cols.map(c=>`<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr><td>${esc(row.name || 'Baris')}</td>${cols.map(col=>{const cell=list(row.cells).find(c=>c.column===col);return `<td>${esc(cell ? cell.summary || '—' : '—')}${cell && list(cell.article_ids).length ? `<span class="matrix-cell-evidence">${list(cell.article_ids).length} artikel</span><div class="source-chips">${citationChips(cell.article_ids)}</div>` : ''}</td>`}).join('')}</tr>`).join('')}</tbody></table></div>` : '<div class="empty-state">Belum ada matriks taxonomy pada hasil sintesis.</div>'}`;
    }
  }

  function typeColor(type) {
    const colours = {concept:'#f3f1e7', factor:'#dcb85c', outcome:'#9fd09f', context:'#86b4d8', method:'#e8906e'};
    return colours[type] || colours.concept;
  }
  function downloadSvg(selector, filename) { const svg=$(selector); if(!svg){toast('Diagram belum tersedia.','error');return;} const blob=new Blob([svg.outerHTML],{type:'image/svg+xml;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url); }
  function renderSystemMap() {
    const s = state.synthesis;
    const canvas = $('#system-map-canvas');
    const legend = $('#system-map-legend');
    if (!s || !s.system_map || !list(s.system_map.nodes).length) {
      canvas.innerHTML = '<div class="empty-state">System map akan tampil setelah sintesis berhasil dilakukan.</div>';
      $('#system-map-meta').textContent = 'Belum ada system map';
      legend.innerHTML = '';
      return;
    }
    const nodes = list(s.system_map.nodes).slice(0, 30);
    const edges = list(s.system_map.edges).filter(e=>nodes.some(n=>n.id===e.source)&&nodes.some(n=>n.id===e.target)).slice(0, 60);
    const positions = {};
    const cols = nodes.length <= 4 ? 2 : 3;
    const cellW = 240, cellH = 112, nodeW = 172, nodeH = 62;
    const rows = Math.ceil(nodes.length / cols);
    const width = cols * cellW + 35, height = Math.max(260, rows * cellH + 20);
    nodes.forEach((node,i)=> {
      const col = i % cols, row = Math.floor(i / cols);
      positions[node.id] = {x: 18 + col*cellW + (cellW-nodeW)/2, y: 12 + row*cellH + 18, cx: 18 + col*cellW + (cellW-nodeW)/2 + nodeW/2, cy: 12 + row*cellH + 18 + nodeH/2};
    });
    const edgeSvg = edges.map(e=>{
      const a=positions[e.source], b=positions[e.target]; if(!a||!b) return '';
      let sx=a.cx, sy=a.cy, tx=b.cx, ty=b.cy;
      if (Math.abs(tx-sx)>Math.abs(ty-sy)) { sx += tx>sx ? nodeW/2-3 : -nodeW/2+3; tx += tx>sx ? -nodeW/2+3 : nodeW/2-3; }
      else { sy += ty>sy ? nodeH/2-2 : -nodeH/2+2; ty += ty>sy ? -nodeH/2+2 : nodeH/2-2; }
      const midx=(sx+tx)/2, midy=(sy+ty)/2;
      return `<g><path d="M ${sx} ${sy} L ${tx} ${ty}" stroke="#8b8b82" stroke-width="1.35" fill="none" marker-end="url(#arrowhead)"/><rect x="${midx-67}" y="${midy-11}" width="134" height="22" fill="#0d0d0c" stroke="#46463f"/><text x="${midx}" y="${midy+3}" font-family="IBM Plex Mono,monospace" font-size="9" fill="#8b8b82" text-anchor="middle">${esc((e.label||'hubungan').slice(0,24))}</text></g>`;
    }).join('');
    const nodeSvg = nodes.map(n=>{
      const p=positions[n.id], color=typeColor(n.type);
      const label=String(n.label || n.id); const lines=label.length>25?[label.slice(0,24)+'…']: [label];
      const evidence=list(n.article_ids).length;
      return `<g><rect x="${p.x}" y="${p.y}" width="${nodeW}" height="${nodeH}" fill="#141413" stroke="#46463f" stroke-width="1.2"/><rect x="${p.x}" y="${p.y}" width="5" height="${nodeH}" fill="${color}"/><text x="${p.x+15}" y="${p.y+25}" font-family="IBM Plex Mono,monospace" font-size="10" font-weight="700" fill="#f3f1e7">${esc(lines[0])}</text><text x="${p.x+15}" y="${p.y+43}" font-family="IBM Plex Mono,monospace" font-size="9" fill="#8b8b82">${esc(String(n.type||'concept').toUpperCase())} · ${evidence} artikel</text></g>`;
    }).join('');
    canvas.innerHTML = `<svg id="system-map-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="System map hasil sintesis"><defs><marker id="arrowhead" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto"><path d="M0,0 L6,3.5 L0,7 Z" fill="#8b8b82"/></marker></defs>${edgeSvg}${nodeSvg}</svg>`;
    $('#system-map-meta').textContent = `${nodes.length} node · ${edges.length} hubungan · ${s.included_article_count || currentCounts().included} artikel terpilih`;
    const typeNames = {concept:'Konsep',factor:'Faktor',outcome:'Outcome',context:'Konteks',method:'Metode'};
    const types = [...new Set(nodes.map(n=>n.type||'concept'))];
    legend.innerHTML = types.map(t=>`<span class="map-legend-chip"><span style="background:${typeColor(t)}"></span>${esc(typeNames[t]||t)}</span>`).join('');
  }

  async function checkHealth() {
    const pill = $('#ai-status');
    try {
      const h = await api('/api/health');
      healthInfo = h; updateUsageDot();
      if (h.max_files_per_batch) { serverLimits = {maxFiles: h.max_files_per_batch, maxFileMb: h.max_file_mb || 12}; applyServerLimits(); }
      if (h.ai_configured) {
        pill.className = 'status-pill status-ok';
        pill.innerHTML = '<span class="status-dot"></span> Model siap · ' + esc(h.model);
      } else {
        pill.className = 'status-pill status-warn';
        pill.innerHTML = '<span class="status-dot"></span> API key belum dipasang';
      }
    } catch (error) {
      pill.className = 'status-pill status-error';
      pill.innerHTML = '<span class="status-dot"></span> Backend tidak terhubung';
    }
  }

  async function handleUpload(event) {
    event.preventDefault();
    if (isBusy) return;
    clearGlobalMessage();
    const input = $('#pdf-files');
    let files = Array.from(input.files || []);
    if (!files.length) { globalMessage('Pilih setidaknya satu PDF.', 'error'); return; }
    const bad = files.filter(f=>f.size>serverLimits.maxFileMb*1024*1024 || (!f.name.toLowerCase().endsWith('.pdf') && f.type!=='application/pdf'));
    if (bad.length) { globalMessage(`Periksa file: ${bad.map(f=>f.name).join(', ')}. Setiap file harus PDF dan maksimal ${serverLimits.maxFileMb} MB.`, 'error'); return; }
    // Cek duplikat di browser sebelum upload: PDF yang hash-nya sudah ada di proyek tidak dikirim ke AI (hemat biaya).
    const skipped = [];
    if (window.crypto && crypto.subtle) {
      const known = new Set(state.articles.map(a => a.hash).filter(Boolean));
      const fresh = [];
      for (const f of files) {
        let hash = null;
        try { hash = await sha256Hex(f); } catch (_) { /* file tidak terbaca: biarkan server memeriksa */ }
        if (hash && known.has(hash)) { skipped.push(f.name); continue; }
        if (hash) known.add(hash);
        fresh.push(f);
      }
      files = fresh;
    }
    if (skipped.length) {
      state.identifiedTotal = (state.identifiedTotal || 0) + skipped.length;
      state.duplicateCount = (state.duplicateCount || 0) + skipped.length;
      saveState(); renderAll();
    }
    if (!files.length) {
      input.value = ''; renderSelectedFiles();
      globalMessage(`${skipped.length} file sudah ada di proyek ini (hash sama), jadi tidak diproses ulang dan tidak memakai AI.`, 'success');
      return;
    }
    if (files.length > serverLimits.maxFiles) { globalMessage(`Maksimal ${serverLimits.maxFiles} PDF per batch. Pilih atau unggah batch yang lebih kecil.`, 'error'); return; }
    saveMetaFromForm(false);
    const meta = getMetaFromForm();
    const data = new FormData();
    files.forEach(f=>data.append('pdfs',f));
    data.append('research_question', meta.research_question);
    data.append('inclusion', meta.inclusion);
    data.append('exclusion', meta.exclusion);
    data.append('source_name', meta.source_name || 'Upload manual');
    data.append('search_query', meta.search_query);
    data.append('search_date', meta.search_date);
    setBusy(true, `Memproses ${files.length} PDF…`);
    $('#process-log').innerHTML = '<div class="process-log-item">Mengirim file ke backend…</div>';
    renderProcessProgress({percent:0, stage:'Mengirim file', current:0, total:files.length, logs:[]});
    const jobId = newJobId();
    data.append('job_id', jobId);
    const stopPolling = startProgressPolling('analysis', jobId);
    try {
      const response = await api('/api/analyze', {method:'POST', body:data});
      addUsage(response.usage);
      const newArticles = list(response.articles);
      let added=0, duplicates=0;
      for (const article of newArticles) {
        state.identifiedTotal = (state.identifiedTotal || 0) + 1;
        const already = state.articles.some(a=>a.hash===article.hash || a.id===article.id);
        if (already) { state.duplicateCount = (state.duplicateCount || 0)+1; duplicates++; continue; }
        state.articles.push(article); added++;
      }
      if (added || duplicates) state.synthesis = null;
      saveState(); renderAll();
      let message = `${added} artikel berhasil dianalisis.`;
      if (duplicates) message += ` ${duplicates} duplikat dikenali dan tidak ditambahkan lagi.`;
      if (skipped.length) message += ` ${skipped.length} file dilewati karena sudah ada di proyek (tanpa biaya AI).`;
      if (list(response.errors).length) message += ' Beberapa file tidak berhasil dianalisis.';
      message += usageText(response.usage);
      if (list(response.errors).length) {
        const detailed = `${message} Detail: ${response.errors.map(e=>`${e.filename}: ${e.error}`).join(' | ')}`;
        globalMessage(detailed, 'error'); toast(message, 'error');
      } else {
        globalMessage(message, 'success'); toast(message, 'success');
      }
      input.value=''; renderSelectedFiles();
      navigate('articles');
    } catch (error) {
      addUsage(error.usage);
      globalMessage(error.message, 'error');
      toast(error.message, 'error');
    } finally { await stopPolling(); setBusy(false); }
  }

  async function handleSynthesis() {
    if (isBusy) return;
    clearGlobalMessage();
    saveMetaFromForm(false);
    const c = currentCounts();
    if (!c.included) { globalMessage('Belum ada artikel INCLUDE pada screening dan full-text eligibility. Buka tab Artikel untuk menetapkan keputusan manual.', 'error'); return; }
    setBusy(true, `Menyintesis ${c.included} artikel yang disetujui…`, 'synthesis');
    renderProcessProgress({percent:0, stage:'Mengirim data ke server', indeterminate:true, logs:[]}, 'synthesis');
    const jobId = newJobId();
    const stopPolling = startProgressPolling('synthesis', jobId);
    $('#run-synthesis').textContent = '* Menyintesis…';
    try {
      const data = await api('/api/synthesize', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({articles:state.articles, ...getMetaFromForm(), job_id:jobId})
      });
      addUsage(data.usage);
      state.synthesis = data.synthesis;
      saveState(); renderAll(); navigate('synthesis');
      const doneMessage = 'Review synthesis berhasil dibuat.' + usageText(data.usage);
      globalMessage(doneMessage, 'success'); toast(doneMessage, 'success');
    } catch (error) {
      addUsage(error.usage);
      globalMessage(error.message, 'error');
      toast(error.message, 'error');
    } finally { await stopPolling(); setBusy(false); $('#run-synthesis').textContent = '* Jalankan sintesis'; }
  }

  function renderSelectedFiles() {
    const files=Array.from($('#pdf-files').files||[]), box=$('#selected-files');
    if(!files.length){box.classList.add('hidden');box.innerHTML='';return;}
    box.classList.remove('hidden');
    box.innerHTML=files.map(f=>`<span class="file-chip"><span>▤</span><span>${esc(f.name)} · ${fileSize(f.size)}</span></span>`).join('');
  }
  function exportProject() {
    const payload = {format:'litreview-studio-project', version:1, exported_at:new Date().toISOString(), ...state};
    const blob = new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`litreview-project-${new Date().toISOString().slice(0,10)}.json`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
    toast('Backup proyek diekspor sebagai JSON.', 'success');
  }
  async function importProject(file) {
    try {
      const data=JSON.parse(await file.text());
      if (!Array.isArray(data.articles)) throw new Error('File JSON tidak memiliki daftar artikel yang valid.');
      state={...structuredClone(DEFAULT_STATE), ...data, articles:data.articles, meta:data.meta||{}, usage:normaliseUsage(data.usage)};
      state.synthesis=data.synthesis||null;
      saveState();applyMeta(state.meta);renderAll();toast('Proyek berhasil diimpor.', 'success');
    } catch(error) { toast(`Impor gagal: ${error.message}`, 'error'); }
  }
  function renderAll() {
    renderUsage();renderMetrics();renderArticles();renderPrisma();renderSynthesis();renderTaxonomy();renderSystemMap();renderCooccurrence();
  }
  function handleDecisionChange(event) {
    const el=event.target;
    if (!(el instanceof HTMLSelectElement) || !el.dataset.id || !el.dataset.field) return;
    const article=findArticle(el.dataset.id); if(!article) return;
    article[el.dataset.field]=el.value;
    if (el.dataset.field==='screening_decision' && el.value!=='include') article.eligibility_decision='pending';
    // Any manual decision change can invalidate the previously generated collective synthesis.
    state.synthesis=null;
    saveState();renderAll();
    if (activeArticleDetail) renderArticleDetail(activeArticleDetail);
    toast('Keputusan tersimpan. Jalankan ulang sintesis bila daftar artikel yang termasuk berubah.', 'success');
  }

  function attachEvents() {
    $$('.nav-item').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.target)));
    $$('[data-go]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.go)));
    $('#project-form').addEventListener('submit',e=>{e.preventDefault();saveMetaFromForm(true);});
    $('#upload-form').addEventListener('submit',handleUpload);
    $('#run-synthesis').addEventListener('click',handleSynthesis);
    $('#pdf-files').addEventListener('change',renderSelectedFiles);
    const dz=$('#dropzone');
    ['dragenter','dragover'].forEach(name=>dz.addEventListener(name,e=>{e.preventDefault();dz.classList.add('dragging');}));
    ['dragleave','drop'].forEach(name=>dz.addEventListener(name,e=>{e.preventDefault();dz.classList.remove('dragging');}));
    dz.addEventListener('drop',e=>{const files=Array.from(e.dataTransfer.files||[]).filter(f=>f.name.toLowerCase().endsWith('.pdf'));if(!files.length){toast('File yang dijatuhkan bukan PDF.', 'error');return;}const transfer=new DataTransfer();files.slice(0,8).forEach(f=>transfer.items.add(f));$('#pdf-files').files=transfer.files;renderSelectedFiles();});
    $('#articles-body').addEventListener('change',handleDecisionChange);
    $('#articles-body').addEventListener('click',e=>{const b=e.target.closest('[data-detail]');if(b)renderArticleDetail(b.dataset.detail);});
    $('#article-search').addEventListener('input',renderArticles);
    $('#article-filter').addEventListener('change',renderArticles);
    $('#article-detail').addEventListener('click',e=>{if(e.target.id==='close-detail'){activeArticleDetail=null;$('#article-detail').classList.add('hidden');}});
    $('#clear-articles').addEventListener('click',()=>{if(!state.articles.length)return;if(!confirm('Hapus semua artikel dan hasil sintesis dari proyek browser ini? Tindakan ini tidak dapat dibatalkan, ekspor backup dahulu jika perlu.'))return;state.articles=[];state.identifiedTotal=0;state.duplicateCount=0;state.synthesis=null;activeArticleDetail=null;$('#article-detail').classList.add('hidden');saveState();renderAll();toast('Daftar artikel dihapus.','success');});
    $$('.taxonomy-tab').forEach(b=>b.addEventListener('click',()=>{activeTaxonomy=b.dataset.taxonomy;renderTaxonomy();}));
    $('#cooccurrence-min')?.addEventListener('change',renderCooccurrence);
    $('#cooccurrence-download')?.addEventListener('click',()=>downloadSvg('#cooccurrence-canvas svg','cooccurrence-network.svg'));
    $('#export-json').addEventListener('click',exportProject);
    setupUsagePopover();
    $('#import-json').addEventListener('click',()=>$('#import-json-file').click());
    $('#import-json-file').addEventListener('change',e=>{if(e.target.files[0])importProject(e.target.files[0]);e.target.value='';});
    // Import is reachable with keyboard shortcut Ctrl/Cmd+Shift+O; exports remain accessible in the header.
    document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key.toLowerCase()==='o'){e.preventDefault();$('#import-json-file').click();}});
    $('#print-prisma').addEventListener('click',()=>{navigate('prisma');setTimeout(()=>window.print(),200);});
    $('#system-map-download').addEventListener('click',()=>{
      const svg=$('#system-map-svg');if(!svg){toast('Belum ada system map untuk diunduh.','error');return;}
      const clone=svg.cloneNode(true);clone.setAttribute('xmlns','http://www.w3.org/2000/svg');
      const blob=new Blob([new XMLSerializer().serializeToString(clone)],{type:'image/svg+xml;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='system-map.svg';a.click();URL.revokeObjectURL(url);toast('System map diekspor sebagai SVG.','success');
    });
    // Persist form edits even if the user navigates away before pressing save.
    ['research-question','source-name','search-date','search-query','inclusion','exclusion'].forEach(id=>$('#'+id).addEventListener('change',()=>saveMetaFromForm(false)));
  }

  document.addEventListener('DOMContentLoaded',()=>{
    // This script is deferred; DOM is ready by the time it runs in modern browsers.
    applyMeta(state.meta);attachEvents();renderAll();checkHealth();
    if (!state.meta.search_date) { const d=new Date();$('#search-date').value=d.toISOString().slice(0,10); }
  });
})();