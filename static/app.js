(() => {
  'use strict';
  const STORE_KEY = 'litreview_studio_project_v1';
  const DEFAULT_STATE = { articles: [], identifiedTotal: 0, duplicateCount: 0, synthesis: null, meta: {} };
  let state = loadState();
  let activeTaxonomy = 'hierarchical';
  let activeArticleDetail = null;
  let isBusy = false;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const esc = (value) => String(value ?? '').replace(/[&<\"']+/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const list = (value) => Array.isArray(value) ? value : [];
  const prettyDate = (value) => {
    if (!value) return '—';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  };
  const fileSize = (n) => n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / (1024 * 1024)).toFixed(1)} MB`;
  const safeArrayText = (arr) => list(arr).length ? list(arr).map(x => typeof x === 'string' ? x : JSON.stringify(x)).join('\n') : 'Belum diekstrak / tidak dinyatakan dalam artikel.';

  function loadState() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return structuredClone(DEFAULT_STATE);
      const data = JSON.parse(raw);
      return { ...structuredClone(DEFAULT_STATE), ...data, articles: Array.isArray(data.articles) ? data.articles : [], meta: data.meta || {} };
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
  function setBusy(busy, text = 'Menganalisis artikel…') {
    isBusy = busy;
    $('#analyze-button').disabled = busy;
    $('#run-synthesis').disabled = busy;
    $('#upload-progress').classList.toggle('hidden', !busy);
    $('#progress-text').textContent = text;
  }
  async function api(path, options = {}) {
    const response = await fetch(path, options);
    let data = {};
    try { data = await response.json(); } catch (_) { data = {}; }
    if (!response.ok) throw new Error(data.error || `Permintaan gagal (HTTP ${response.status}).`);
    return data;
  }

  // ... (rest of the original app.js content unchanged)

})();