# CLAUDE.md — SLR Protocol: panduan teknis end-to-end

Dokumen ini untuk developer dan agen AI (Claude Code) yang akan membaca, mengubah, atau men-deploy repo ini.
Baca bagian 1–3 dulu, lalu loncat ke bagian yang relevan. README.md berisi panduan untuk pengguna akhir.

## 1. Ringkasan

SLR Protocol adalah web app satu-halaman untuk systematic literature review:

1. Pengguna mengisi konteks review (research question, kriteria inklusi/eksklusi, sumber, query).
2. Pengguna mengunggah PDF. Backend mengekstrak teks (PyMuPDF), meminta LLM menyusun **JSON terstruktur** per
   artikel, dan mengembalikannya ke browser.
3. Pengguna menetapkan keputusan **screening** dan **full-text eligibility** secara manual.
4. Pengguna menjalankan **sintesis**: LLM menyintesis semua artikel INCLUDE (tema, kesepakatan, kontradiksi,
   research gap, taxonomy, system map).
5. Frontend merender PRISMA, sintesis, taxonomy, co-occurrence, dan system map.

Status: **prototype** untuk riset pribadi/kelompok kecil. Tidak ada akun, tidak ada database, tidak ada test suite.

### Prinsip desain (jangan dilanggar tanpa alasan kuat)

- **Satu berkas backend (`app.py`) dan satu berkas frontend (`static/app.js`)**, tanpa framework dan tanpa build
  step. Mudah dibaca, mudah di-deploy. Jangan memecah atau menambah toolchain kecuali diminta.
- **State milik browser.** Server hampir stateless: hanya menyimpan progres pekerjaan di memori (sementara).
  Sumber kebenaran proyek adalah `localStorage` + file Ekspor JSON.
- **AI hanya membantu, manusia memutuskan.** Rekomendasi screening AI tidak pernah otomatis menjadi keputusan
  (`screening_decision` dan `eligibility_decision` selalu mulai `pending`).
- **Provider AI dapat dipertukarkan lewat `.env`** (`ollama` atau `deepseek`) tanpa mengubah kode.
- Teks UI, pesan error, dan log berbahasa **Indonesia**. Nama variabel/fungsi berbahasa Inggris.

## 2. Struktur repo

```
app.py                  Backend Flask. Config, provider AI, progres, biaya, prompt, semua route.
templates/index.html    Satu halaman Jinja (hanya url_for untuk gambar). Semua tab ada di sini.
static/app.js           Frontend: IIFE tunggal, state, render, upload, progres, popup token, ekspor/impor.
static/style.css        Tema terminal (monokrom, font mono, variabel CSS).
requirements.txt        Flask, PyMuPDF, gunicorn, python-dotenv.
render.yaml             Blueprint Render.
start_windows.bat       Peluncur Windows (venv + pip install + python app.py).
.env.example            Seluruh variabel konfigurasi beserta penjelasan.
.gitignore              Mengabaikan .env, .venv, data/, dan berkas ekspor proyek.
```

Aset gambar yang dirujuk antarmuka tetapi **tidak ada di repo** (letakkan di `static/`): `slr.png` (logo + favicon),
`latte0nim.jpg` (avatar credit), `qris.png` (QRIS di popup token; kotaknya menyembunyikan diri bila gambar tidak ada).

Folder `data/` hanya dibuat saat `KEEP_SERVER_PDFS` / `KEEP_SERVER_JSON` dinyalakan (`data/pdfs`, `data/json`),
dan **tidak pernah dibaca kembali** oleh aplikasi. Keduanya mati secara bawaan.

## 3. Menjalankan dan konfigurasi

```bash
pip install -r requirements.txt
cp .env.example .env     # isi LLM_PROVIDER dan kredensial
python app.py            # http://127.0.0.1:5000 (app.run host 0.0.0.0, lihat bagian 11)
```

Produksi: `gunicorn app:app --workers 1 --threads 8 --timeout 600` (lihat bagian 9 mengapa `workers=1`).

`.env` dimuat dari folder `app.py` dengan `override=False` (variabel environment sistem menang atas `.env`).
**Nilai yang ada di `.env`/environment selalu mengalahkan nilai bawaan kode.** Contoh jebakan: `.env` lama yang berisi
`MAX_TEXT_CHARS=18000` membuat bawaan DeepSeek (80000) tidak berlaku.

### Variabel konfigurasi

| Variabel | Bawaan | Fungsi |
|---|---|---|
| `LLM_PROVIDER` | `ollama` | `ollama` atau `deepseek`. Nilai lain menghentikan start (`SystemExit`). |
| `OLLAMA_URL` / `OLLAMA_MODEL` | `http://127.0.0.1:11434/api/chat` / `qwen3-vl:8b-instruct` | Ollama lokal. |
| `OLLAMA_NUM_CTX` / `OLLAMA_MAX_OUTPUT_TOKENS` | `12288` / `3500` | Konteks dan plafon output Ollama. |
| `DEEPSEEK_API_KEY` | kosong | Wajib bila provider deepseek. Tanpa ini `AI_CONFIGURED=False` dan route AI menjawab 503. |
| `DEEPSEEK_MODEL` / `DEEPSEEK_URL` | `deepseek-flash` / `https://api.deepseek.com/chat/completions` | Model dan endpoint. |
| `DEEPSEEK_PRICE_INPUT_MISS/HIT`, `DEEPSEEK_PRICE_OUTPUT` | `0.15` / `0.003` / `0.60` | USD per 1 juta token, tarif **off-peak**. |
| `DEEPSEEK_PEAK_MULTIPLIER` | `2` | Pengali tarif saat jam peak. Isi `1` untuk mematikan. |
| `USD_TO_IDR` | `18000` | Kurs untuk estimasi rupiah (hanya tampilan). |
| `MAX_TEXT_CHARS` | 18000 ollama / 80000 deepseek | Teks per PDF yang dikirim ke AI. Dibatasi keras 200000. |
| `MAX_FILES_PER_BATCH` | 8 / 20 | PDF per upload. |
| `MAX_FILE_MB` | 12 / 30 | Ukuran per PDF. |
| `SYNTH_BATCH_SIZE` / `REDUCE_GROUP_SIZE` | 4 / 4 (ollama), 12 / 8 (deepseek) | Ukuran batch sintesis dan grup penggabungan. |
| `LLM_OUTPUT_SCALE` | `1` ollama / `1.75` deepseek | Pengali plafon token output (hanya plafon, bukan target). |
| `KEEP_SERVER_PDFS` / `KEEP_SERVER_JSON` | `false` / `false` | Salinan opsional di `data/`. |
| `APP_USERNAME` / `APP_PASSWORD` | `slr-user` / kosong | HTTP Basic Auth. Kosong = tanpa auth (peringatan dicetak bila provider deepseek). |
| `PORT` | `5000` | Port saat `python app.py`. |

Bawaan batas bergantung provider karena model lokal 8B berkonteks sempit, sedangkan API berkonteks besar.
`MAX_CONTENT_LENGTH` Flask dihitung dari `MAX_FILES_PER_BATCH × ukuran file + 5 MB`; error 413 ditangani.

## 4. Alur end-to-end

```
Browser                                   Flask (app.py)                          LLM
  |  GET /api/health  --------------------> limits, provider, status tarif
  |  (pre-check) SHA-256 tiap PDF; lewati yang hash-nya sudah ada di state.articles
  |  POST /api/analyze (multipart + job_id) -> new_progress(job) ; per PDF:
  |       <-- polling GET /api/analysis-progress?job_id  read_pdf -> article_prompt -> llm_json (stream) ---> chat completions
  |                                           normalisasi -> record artikel (id = sha256[:16])
  |  <-- {articles, errors, model, usage}
  |  state.articles += artikel baru (dedupe by hash/id); simpan ke localStorage
  |  pengguna mengubah screening_decision / eligibility_decision di tab Artikel (state.synthesis di-reset)
  |  POST /api/synthesize (json + job_id) --> filter INCLUDE+INCLUDE -> batch -> (reduce)* -> final -> taksonomi
  |       <-- polling GET /api/synthesis-progress?job_id
  |  <-- {synthesis, usage}  -> state.synthesis; render PRISMA / sintesis / taxonomy / co-occurrence / system map
```

### 4.1 Analisis (`POST /api/analyze`)

Form multipart: `pdfs` (banyak), `research_question`, `inclusion`, `exclusion`, `source_name`, `search_query`,
`search_date`, `job_id`. Panjang tiap teks dipotong di server (RQ 1000, kriteria 3000).

Per PDF (berurutan, satu request panjang):
1. Validasi: ukuran ≤ `MAX_FILE_MB`, signature `%PDF`.
2. `read_pdf()`: PyMuPDF membaca SEMUA halaman (batas keras 600.000 karakter) dengan penanda `[PAGE n]`.
   `strip_references()` membuang daftar pustaka, lalu `trim_text()` memotong ke `MAX_TEXT_CHARS` dengan
   menyimpan 70% awal + sisanya dari AKHIR dokumen (penanda `[... bagian tengah dipotong ...]`). Dulu hanya
   bagian awal yang disimpan sehingga limitations dan kesimpulan hilang. Teks < 100 karakter dianggap PDF scan
   (tidak ada OCR) dan dilaporkan sebagai error file.
3. `article_prompt()`: instruksi anti-halusinasi, konteks review, teks artikel, dan skema JSON yang diminta.
   Teks PDF diperlakukan sebagai data, bukan instruksi (mitigasi prompt injection).
4. `llm_json()` mengembalikan dict; hasilnya dinormalisasi (`normalise_list`, `safe_string`, batas panjang).
   Kutipan bukti diverifikasi terhadap teks PDF per halaman (`verify_quote`, field `verified`; halaman hasil
   pencocokan menggantikan tebakan AI). `research_design` divalidasi terhadap codebook (`normalise_research_design`):
   kode di luar codebook dibuang, dan basis `stated` diturunkan ke `inferred` bila kutipan buktinya tidak ada di teks.
5. Dibentuk **record artikel** (lihat 5.1). `screening_suggestion.decision` diperiksa ∈ {include, exclude, review}.
6. Opsional: salin PDF/JSON ke `data/` bila saklar `KEEP_SERVER_*` menyala.

Respons: `{articles, errors, model, usage}`. File yang gagal masuk `errors` dan **tidak menghentikan** batch.
Status HTTP: 400 (tanpa file / terlalu banyak), 503 (AI belum dikonfigurasi), 413 (total unggahan terlalu besar).

### 4.2 Sintesis (`POST /api/synthesize`)

Body JSON: `articles` (seluruh array state), `research_question`, `inclusion`, `exclusion`, `job_id`.
Server **menyaring sendiri**: hanya artikel dengan `screening_decision == "include"` **dan**
`eligibility_decision == "include"`. Kosong → 400; lebih dari 250 → 400.

Pipeline (semua panggilan lewat `llm_json`, jumlah langkah dihitung di awal untuk persen progres):
1. **Batch**: artikel dipadatkan (`compact_article`, potong tiap field) lalu dibagi per `SYNTH_BATCH_SIZE`.
   Tiap batch → `batch_synthesis_prompt` → ringkasan (overview, themes, taxonomy_seeds).
2. **Reduce** (hanya bila ringkasan > `REDUCE_GROUP_SIZE`): gabung per grup berulang-ulang sampai muat satu
   panggilan akhir. Grup berisi 1 ringkasan dilewatkan tanpa AI (`count_reduce_calls` meniru logika ini).
3. **Final** (`final_synthesis_prompt`): sintesis lintas-batch dengan katalog artikel valid.
4. **Taksonomi topik terpisah** (`taxonomy_only_prompt`, dengan `taxonomy_catalog` yang memuat metode, konsep, dan
   ringkasan desain; hierarki 3 level dengan satu prinsip pengelompokan per level; hasil dirapikan oleh
   `finalize_hierarchy`: perbaikan id/parent/siklus, roll-up `article_ids`, dan `taxonomy_coverage`).
   `final_synthesis_prompt` tidak lagi meminta taksonomi. Panggilan sendiri supaya taksonomi tidak berebut batas
   token dengan sintesis. Hasilnya `taxonomy_status` ∈ `ok` | `fallback` | `failed`. Kegagalan taksonomi tidak
   membatalkan sintesis.
5. `filter_references()` membuang `article_ids` yang tidak ada di korpus (mencegah AI mengarang rujukan).
   `parent_ids` taksonomi dicek di frontend.

Respons: `{synthesis, usage}`. Kegagalan → `{error, usage}` dengan 502.

### 4.3 Progres (`GET /api/analysis-progress`, `GET /api/synthesis-progress`)

Query `job_id` (dibuat frontend via `crypto.randomUUID`). Kelas `Progress` (thread-safe, dengan lock) menyimpan:
`percent` (monoton, maks 99 sampai `finish()`), `stage`, `current/total`, `filename`, `indeterminate`
(true hanya saat menunggu byte pertama dari AI), `elapsed`, `logs` (maks 150), `usage` (objek yang sama yang
dimutasi `add_usage`, sehingga biaya live). Registry `PROGRESS_JOBS` di memori, kunci `"{kind}:{job_id}"`,
dibersihkan bila > 1 jam atau > 40 job. Job yang belum terdaftar → `{"pending": true}` (frontend menahan
teks awal). **Persen = (langkah selesai + pecahan langkah berjalan) / total langkah.** Pecahan langkah berjalan
berasal dari jumlah token yang sudah di-stream terhadap ≈ setengah plafon, dibatasi per fase, jadi tidak pernah
melompat ke 100% sebelum panggilan selesai.

Baris log bertanda `live: true` adalah baris yang terus diganti selama AI menulis; `finish_live()` menggantinya
dengan baris final (token masuk/keluar, cache, detik, biaya). Retry dicatat sebagai peringatan.

### 4.4 Route lain

| Route | Auth | Fungsi |
|---|---|---|
| `GET /` | ya | Halaman. |
| `GET /api/health` | ya | Status AI + limits (`max_files_per_batch`, `max_file_mb`, `max_text_chars`, `synth_batch_size`, `keep_server_*`) + `pricing` (periode, waktu pergantian, tarif efektif; `null` untuk Ollama). |
| `GET /api/test-ai` | ya | Satu panggilan kecil non-streaming untuk uji koneksi/JSON; mengembalikan `usage`. |

`auth_guard` memakai HTTP Basic Auth bila `APP_PASSWORD` terisi (perbandingan string biasa, bukan constant-time;
cukup untuk prototype di atas HTTPS).

### 4.5 Taksonomi desain riset (research onion)

`RESEARCH_ONION` di `app.py` adalah codebook (Saunders dkk., 2019): philosophy, approach, methodological_choice,
strategy, time_horizon, data_source, analysis. Satu sumber kebenaran untuk prompt ekstraksi, validasi, dan taksonomi.
Kode bertanda `[ekstensi]` (mis. `experiment_modeling_simulation`, `synthetic_simulated`) bukan dari Saunders; ditambahkan
agar cocok dengan riset pemodelan. Ubah `CODEBOOK_VERSION` bila arti kode berubah.

Prinsip: AI hanya **mengklasifikasikan satu artikel ke kode codebook** (dengan `basis` stated/inferred/not_stated dan
bukti). Pohon **dihitung kode** oleh `build_design_taxonomy` (group-by), tanpa LLM: `POST /api/design-taxonomy`,
tab Desain Riset. Cabang: Metodologi (Kuantitatif/Kualitatif/Campuran lalu teknik), Strategi, Teknik & prosedur,
Fondasi & horizon waktu; plus matriks Metodologi x Strategi (sel kosong = kandidat gap) dan ringkasan
stated/inferred/not_stated. `GET /api/codebook` memberi label untuk UI.

Artikel lama (`analysis_version` 1) tidak punya `research_design`; UI memberi tahu dan mengizinkan unggah ulang
(analisis ulang mengganti ekstraksi, keputusan screening dipertahankan).

## 5. Model data

### 5.1 Record artikel (hasil `/api/analyze`, disimpan di `state.articles`)

`id` (= `hash[:16]`), `hash` (SHA-256 isi PDF), `filename`, `uploaded_at`, `pages`, `text_chars`, `title`, `authors[]`,
`year`, `doi`, `abstract`, `objective`, `research_questions[]`, `methods`, `context`, `variables[]`, `findings[]`,
`limitations[]`, `future_research[]`, `topic_tags[]`, `concepts[{name,description,parent_concepts[]}]`,
`relationships[{source,target,relation,evidence}]`, `evidence_quotes[{claim,quote,page}]`,
`screening_suggestion{decision,reason}`, `screening_decision` (`pending|include|exclude`), `eligibility_decision`
(`pending|include|exclude`), `source_name`, `search_query`, `search_date`, `analysis_version`,
`extraction_status`, `pdf_stored`, `json_stored`.
Tambahan v2 (`analysis_version` 2): `research_design{codebook_version, <field>{value, basis, evidence,
evidence_verified}, techniques[], warnings[]}`, `evidence_quotes[].verified`, `evidence_quality{quotes_total,
quotes_verified}`, `text_chars_original`, `text_truncated`, `references_removed`.

Aturan keputusan (frontend, `handleDecisionChange`): mengubah screening menjadi selain `include` mereset
`eligibility_decision` ke `pending`; **setiap** perubahan keputusan mengosongkan `state.synthesis`.

### 5.2 State proyek (browser)

`localStorage["litreview_studio_project_v1"]` = `{articles[], identifiedTotal, duplicateCount, synthesis, meta{research_question,
source_name, search_date, search_query, inclusion, exclusion}, usage{calls,prompt_tokens,cache_hit_tokens,
completion_tokens,cost_usd,cost_idr,usd_to_idr}}`.

> **Jangan mengganti nama kunci `litreview_studio_project_v1`.** Itu kunci warisan; menggantinya membuat proyek
> yang sudah tersimpan di browser pengguna tampak hilang. `localStorage` terikat ke origin, jadi
> `localhost:5000` ≠ `127.0.0.1:5000` ≠ domain hosting.

`identifiedTotal` dan `duplicateCount` menggerakkan angka PRISMA. Duplikat yang dilewati di pre-check browser
tetap menambah keduanya, supaya hitungan PRISMA konsisten.

### 5.3 Hasil sintesis (`state.synthesis`)

`research_question_refinement`, `subquestions[]`, `executive_synthesis`, `main_themes[]`, `agreements[]`,
`contradictions[]`, `research_gaps[]`, `limitations_of_corpus[]`, `review_notes[]`, `system_map{nodes[{id,label,type,
article_ids}],edges[{source,target,label,direction,article_ids}]}`, dan `taxonomy{hierarchical, faceted, flat,
polyhierarchy, matrix}`. Metadata tambahan dari server: `taxonomy_status`, `taxonomy_note|taxonomy_error`,
`included_article_count`, `generated_at`, `model`, `evidence_catalog`. Semua `article_ids` merujuk `record.id`.

### 5.4 Ekspor/impor proyek

Ekspor = `{format:'slr-protocol-project', version:1, exported_at, ...state}`, diunduh sebagai
`slr-protocol-project-YYYY-MM-DD.json`. Impor hanya memvalidasi `articles` adalah array (penanda `format` tidak
dicek, jadi ekspor lama `litreview-studio-project` tetap bisa diimpor) dan **menimpa seluruh state**. PDF tidak
ikut diekspor.

## 6. Lapisan provider AI (`llm_json`)

Semua panggilan AI melewati `llm_json(prompt, max_output_tokens, usage, progress, label)`:

- **Payload per provider.**
  - DeepSeek (`IS_API`): `POST chat/completions` dengan `Authorization: Bearer`, `response_format: json_object`,
    `thinking: {"type":"disabled"}` (V4 menyalakan thinking secara default, boros token), `temperature: 0`,
    `max_tokens = max_output_tokens × LLM_OUTPUT_SCALE`, dan `stream_options.include_usage` bila streaming.
  - Ollama: `/api/chat` dengan `format: "json"`, `think: false`, `keep_alive`, `options{num_predict,num_ctx}`.
- **Streaming**: bila `progress` diberikan, jawaban dibaca bertahap (`read_llm_stream`: SSE untuk DeepSeek,
  NDJSON untuk Ollama), progres live diperbarui ±tiap 0,6 detik, lalu dirakit menjadi dict berbentuk sama dengan
  respons non-streaming sehingga sisa kode tidak peduli. Tanpa `progress` (mis. `/api/test-ai`) respons utuh.
- **Retry satu kali** (maks 2 percobaan): bila konten kosong, JSON rusak, atau output terpotong
  (`finish_reason=length`). Percobaan kedua memakai pesan perbaikan JSON dan plafon +700 token. Token dari
  percobaan gagal **tetap dihitung dan ditagih**.
- `extract_json()` toleran terhadap pagar markdown dan teks di sekitar objek.
- Error HTTP DeepSeek dipetakan ke pesan Indonesia (401 key salah, 402 saldo habis, 429 rate limit, 5xx).
- Timeout socket 600 detik per panggilan.

Menambah provider baru: tambahkan nilai di `LLM_PROVIDER`, blok config (MODEL, AI_URL, AI_CONFIGURED,
CONFIG_ERROR, PROVIDER_LABEL), cabang payload/headers di `llm_json`, parser di `read_llm_stream`, dan cabang di
`add_usage`. Cari semua `IS_API` / `LLM_PROVIDER` untuk titik sentuhnya.

## 7. Biaya dan token

`add_usage(usage, raw)` menambah `calls`, `prompt_tokens`, `cache_hit_tokens`, `completion_tokens`. Untuk DeepSeek
biaya dihitung per panggilan: `(hit×harga_hit + miss×harga_miss + output×harga_output) / 1e6 × faktor`, dengan
`faktor = DEEPSEEK_PEAK_MULTIPLIER` bila `deepseek_is_peak()` (Senin–Jumat, 01:00–04:00 dan 06:00–10:00 UTC), selain itu 1.
Karena dihitung per panggilan, total campuran peak/off-peak tetap benar. `cost_idr = cost_usd × USD_TO_IDR`.
Ollama: biaya 0 ("lokal").

Fakta yang sudah diverifikasi terhadap dashboard DeepSeek: jumlah token dan jumlah request cocok persis dengan
hitungan app; dashboard memotong (bukan membulatkan) biaya ke dua desimal sehingga untuk perbandingan gunakan
token/request atau tinggi grafik. Tarif dan jadwal peak bersumber dari dokumentasi/aggregator publik dan **bisa
berubah**; hari libur nasional China (off-peak) tidak dimodelkan, sehingga estimasi bisa sedikit tinggi pada hari itu.

Pola biaya: output mendominasi (≈ dua pertiga biaya), cache hit jarang karena dokumen berbeda, sintesis memproses
ulang **semua** artikel INCLUDE setiap kali dijalankan (tidak inkremental). Retry menggandakan biaya panggilan itu.

## 8. Frontend (`static/app.js`)

Satu IIFE, tanpa modul. Pola umum: `state` global + `saveState()` + `renderAll()` (render ulang tab yang relevan).
Helper `$`/`$$`, `esc()` (escape HTML, **wajib** untuk semua data AI yang masuk `innerHTML`), `list()`.

| Area | Fungsi kunci |
|---|---|
| State & penyimpanan | `loadState`, `saveState`, `DEFAULT_STATE`, `STORE_KEY` |
| Navigasi | `navigate(target)`, tombol `data-target`, 8 tab: overview, articles, prisma, synthesis, taxonomy, design, cooccurrence, system-map |
| Upload | `handleUpload`: validasi → pre-check duplikat (`sha256Hex` via `crypto.subtle`) → FormData + `job_id` → polling → merge artikel |
| Progres | `PANELS`, `renderProcessProgress`, `startProgressPolling(kind, jobId)` (interval 500 ms) |
| Sintesis | `handleSynthesis` (menolak bila belum ada artikel INCLUDE/INCLUDE) |
| Token & tarif | `renderUsage`, popup (`renderUsagePopover`, `periodBlockHtml`, `donateBlockHtml`), `refreshHealthInfo` tiap 60 dtk |
| Visualisasi | `renderTaxonomy` (hierarchical/poly-hierarchical sebagai SVG node-panah, faceted, flat, matrix), `renderCooccurrence` (dari `topic_tags`+`concepts`, filter minimum kemunculan), `renderSystemMap` |
| Backup | `exportProject`, `importProject` (`Ctrl/Cmd+Shift+O`), `downloadSvg`, cetak PRISMA |

Hal yang perlu diingat:
- **Batas upload dibaca dari `/api/health`** (`serverLimits`), bukan hardcode; teks di UI ikut menyesuaikan.
- **Pre-check duplikat** memakai SHA-256 isi file, identik dengan hash server (`hashlib.sha256`), dibandingkan
  dengan `state.articles[].hash`. Jika `crypto.subtle` tidak tersedia (konteks non-HTTPS selain localhost), langkah
  ini dilewati dan server tetap dedupe setelah panggilan AI.
- Popup token: tombol reset dua langkah (klik ulang dalam 4 detik), status peak/off-peak dari `healthInfo.pricing`,
  jadwal peak dikonversi ke zona waktu browser.
- Log progres: `is-live` untuk baris yang sedang diperbarui; bar hanya mengikuti `percent` dari server.
- `.progress-line.is-working` (garis putus-putus) aktif hanya saat `indeterminate` (menunggu respons pertama AI).

### Tema (`static/style.css`)

Tema terminal: variabel `:root` (`--bg --panel --line --dim --text --bright --ok --bad --warn --info --mono`),
sudut persegi, font IBM Plex Mono, warna terbalik untuk state aktif. Warna di SVG yang dibuat JavaScript
(taxonomy, co-occurrence, system map) di-hardcode di `app.js` dan harus diselaraskan manual bila tema diubah.
Ada stylesheet cetak (`@media print`) untuk PRISMA.

## 9. Deploy

`render.yaml` mendefinisikan satu web service gratis. Keputusan yang disengaja:
- **`--workers 1 --threads 8`**: progres pekerjaan disimpan di memori proses; dengan banyak worker, polling bisa
  mendarat di proses lain dan melihat job kosong. Konkurensi (request analisis panjang + polling) dari thread.
- **`--timeout 600`**.
- **Tanpa `healthCheckPath`**: `/api/health` memakai Basic Auth sehingga health check akan 401.
- `KEEP_SERVER_*` = false (filesystem sementara dan privasi), `MAX_FILES_PER_BATCH=8`, `MAX_FILE_MB=15` (RAM 512 MB).
- `DEEPSEEK_API_KEY` dan `APP_PASSWORD` bertanda `sync: false`: diisi manual di dashboard. **`APP_PASSWORD` wajib.**

Python version tidak dipin; bila build gagal pada PyMuPDF di versi Python terbaru, pin lewat env `PYTHON_VERSION`.

## 10. Verifikasi dan pengujian

Tes otomatis tanpa jaringan dan tanpa API key: `python tests/test_research_design.py` (51 pengecekan: normalisasi
kutipan, pembuangan referensi, pemotongan teks, validasi codebook, taksonomi desain, hierarki). Bagian yang butuh PDF
memakai `data/pdfs` atau `SLR_PDF_DIR`. `tests/fixtures_research_design.json` berisi label buatan tangan (gold standard
mini, bukan keluaran AI), dua entri sengaja salah untuk menguji pertahanan. Belum ada tes browser otomatis di repo.
Pemeriksaan lain yang dipakai selama pengembangan:

```bash
python -m pyflakes app.py        # harus bersih
python -m py_compile app.py
node --check static/app.js
```

Smoke test manual: jalankan app, buka `/api/test-ai` (harus `"ok": true` dengan angka token), unggah 1–2 PDF kecil,
tetapkan INCLUDE/INCLUDE, jalankan sintesis, lalu cocokkan token dan jumlah request di popup dengan dashboard
penyedia. Untuk pengujian otomatis tanpa biaya: buat server tiruan yang meniru SSE DeepSeek
(`data: {...choices[0].delta.content...}`, chunk `usage` terakhir, `data: [DONE]`) dan NDJSON Ollama, arahkan
`DEEPSEEK_URL`/`OLLAMA_URL` ke sana, lalu panggil `/api/analyze` dan `/api/synthesize` sambil polling progres;
periksa persen monoton, baris `live`, dan log retry (sisipkan satu respons terpotong dengan `finish_reason=length`).

## 11. Keterbatasan yang diketahui dan arah pengembangan

Urut kira-kira berdasarkan dampak:

1. **Request panjang sinkron.** `/api/analyze` dan `/api/synthesize` berjalan dalam satu request HTTP. Di hosting
   dengan batas waktu request pada proxy, batch besar bisa terputus. Perbaikan yang direncanakan: jalankan
   pekerjaan di background thread/antrian, kembalikan `job_id` segera, dan biarkan frontend polling sampai selesai
   (kerangka `Progress`/`job_id` sudah ada). Sampai itu dibuat, hasil yang sudah dibayar bisa hilang bila koneksi putus.
2. **Progres di memori, satu proses.** Hilang saat restart; tidak bekerja dengan banyak worker. Perlu penyimpanan
   bersama (mis. Redis) bila di-scale.
3. **Tanpa akun / multi-user.** Satu password bersama. Proyek ada di browser masing-masing. Belum ada audit trail.
4. **Sintesis tidak inkremental** dan ekstraksi **tidak di-cache**: PDF yang sama dengan pengaturan sama tetap
   dipanggil ulang bila lolos pre-check (mis. browser lain). Ide: cache ekstraksi berkunci hash + konteks review +
   model + `MAX_TEXT_CHARS`.
5. **Tidak ada OCR.** PDF scan ditolak dengan pesan jelas.
6. **`app.run(host="0.0.0.0")`** saat `python app.py`: dapat diakses dari jaringan lokal. Gunakan `APP_PASSWORD`,
   atau ubah host ke `127.0.0.1` bila hanya dipakai lokal.
7. **Auth sederhana** (Basic Auth, tanpa rate limit/lockout). Wajib HTTPS di produksi.
8. **Tes otomatis hanya mencakup logika murni dan alur backend dengan LLM tiruan**; belum ada CI dan belum ada
   tes browser di repo. Kualitas label AI sendiri (akurasi klasifikasi) belum diukur: perlu audit sampel manual.
9. Tarif/jadwal peak DeepSeek di-hardcode sebagai bawaan dan bisa kedaluwarsa; libur China tidak dimodelkan.
10. Warna SVG visualisasi di-hardcode di JavaScript.
11. **Label research onion banyak yang `inferred`.** Philosophy dan approach jarang dinyatakan penulis; tampilkan apa
    adanya, jangan disajikan sebagai fakta. Kebenaran label `stated` hanya dijamin bahwa kutipannya ada di teks,
    bukan bahwa kutipan itu benar-benar mendukung label.
12. **Teknik digabung berdasarkan string yang sama** (huruf besar/kecil dan tanda baca diabaikan). Sinonim ("LSTM" vs
    "Long Short-Term Memory") belum digabung: butuh langkah normalisasi konsep dengan persetujuan manusia.
13. **Taksonomi topik tetap usulan AI**, bukan hasil hitung. Cakupan diukur, tetapi kebenaran pengelompokan tidak.
14. Pemotongan teks tetap bisa menghilangkan bagian tengah (hasil/diskusi) pada artikel yang sangat panjang.

## 12. Panduan perubahan cepat

| Ingin… | Ubah di… |
|---|---|
| Menambah/mengubah field ekstraksi artikel | `article_prompt` (skema), pembentukan `record` di `analyze_pdfs`, `compact_article`, lalu `renderArticleDetail` di `app.js` |
| Mengubah perilaku sintesis | `batch_synthesis_prompt`, `reduce_summaries_prompt`, `final_synthesis_prompt`, `taxonomy_only_prompt`; bentuk keluaran dipakai `renderSynthesis`/`renderTaxonomy`/`renderSystemMap` |
| Menambah/mengubah nilai research onion | `RESEARCH_ONION` (+ `METHOD_GROUPS`, naikkan `CODEBOOK_VERSION`); prompt, validasi, dan taksonomi mengikuti otomatis |
| Mengubah batas | `.env` (lihat tabel bagian 3); bawaan ada di blok "Batas bawaan" `app.py` |
| Mengubah tarif/jadwal peak | `.env` (`DEEPSEEK_PRICE_*`, `DEEPSEEK_PEAK_MULTIPLIER`); jadwal di `deepseek_is_peak` dan `deepseek_pricing_info` |
| Menambah tab/halaman | `index.html` (tombol `data-target` + `section.page-section`), `navigate`/`renderAll` di `app.js` |
| Mengubah tema | variabel `:root` di `style.css` + warna SVG di `app.js` |
| Menambah kredensial/rahasia | `.env` dan `render.yaml` (`sync: false`); jangan pernah commit nilainya |

## 13. Konvensi untuk kontributor

- Pertahankan gaya satu-berkas; komentar singkat, jelaskan **mengapa**, bukan apa.
- Semua teks yang tampil ke pengguna dalam bahasa Indonesia, nada ringkas dan jelas.
- Semua data dari AI atau PDF yang masuk `innerHTML` harus melewati `esc()`.
- Jangan menyimpan rahasia di repo; `.env` ada di `.gitignore`. Rotasi key bila pernah ter-commit.
- Jalankan pemeriksaan di bagian 10 sebelum commit. Hindari mengubah kunci `localStorage` dan skema record artikel
  tanpa jalur migrasi (data pengguna ada di browser mereka dan di file ekspor).
