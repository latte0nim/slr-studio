# HANDOFF: SLR Protocol, progres dan rencana

Status per ekspor terakhir: 1 November 2026. Repo GitHub: `zaafirrahman/slr-protocol`.

Dokumen ini mencatat **apa yang sudah dikerjakan, mengapa, apa yang terbukti, dan apa yang harus dilakukan berikutnya**. `README.md` menjelaskan cara memakai aplikasi, `CLAUDE.md` menjelaskan teknis kode. Keduanya tidak mencatat progres, keputusan, atau rencana. Dokumen ini yang mencatatnya.

---

## 0. Cara memakai dokumen ini

**Untuk Claude di ruang chat baru.** Kamu tidak punya ingatan dari ruang sebelumnya. Semua yang perlu kamu ketahui ada di sini dan di berkas proyek.

1. Baca bagian 1, 2, 3, dan 11 dulu (ringkasan, konteks, cara bekerja dengan pemilik, rencana).
2. Baca `CLAUDE.md` sebelum mengubah kode.
3. Jalankan `python tests/test_research_design.py` (harus 131 pengecekan lulus) sebelum mengubah apa pun.
4. Ringkas ekspor di `output/` dengan `python tools/export_summary.py <berkas>`.
5. Jangan menyebut sesuatu "terbukti" sebelum kamu menjalankannya. Pisahkan selalu yang teruji dan yang belum.

**Untuk pemilik.** Pesan pembuka yang disarankan saat mengirim zip ke ruang baru:

> Ini serah-terima proyek SLR Protocol dari ruang chat sebelumnya. Zip berisi seluruh project (tanpa `.env`), 20 PDF di `data/pdfs/`, dan ekspor terakhir di `output/`. Baca `HANDOFF.md` dulu, lalu `CLAUDE.md`. Tugas pertama: bantu saya menjalankan uji ulang dari awal (bagian 11A) dan evaluasi hasilnya dengan skrip di `tools/`.

Lampirkan juga tiga berkas kuliah kalau ada: `Tugas_2_Taksonomi_Penelitian__2026.pdf`, foto slide research onion, dan foto papan tulis dosen. Isinya sudah ditranskripsikan di bagian 2, jadi ruang baru tetap paham tanpa gambarnya.

---

## 1. Ringkasan satu halaman

**Apa ini.** Aplikasi lokal (Flask + JavaScript tanpa build) untuk systematic literature review berbantuan AI. Fokus pekerjaan ini: menyusun **taksonomi desain riset** (metodologi, strategi, teknik) dari kumpulan jurnal, mengikuti kerangka **research onion** (Saunders dkk., 2019). Dipakai untuk Tugas 2 mata kuliah (Taksonomi Penelitian) dan sebagai dasar perencanaan tesis.

**Topik pemilik:** Predict-then-Optimize untuk keputusan operasional (industri).

**Status.**

| Bagian | Status |
|---|---|
| Ekstraksi label desain riset per artikel (codebook research onion) | Selesai, teruji pada 20 PDF nyata |
| Taksonomi desain riset (dihitung kode, bukan AI) + matriks metodologi x strategi | Selesai |
| Normalisasi teknik (AI usul, pemilik setuju, kode terapkan) | Selesai. Prompt barunya belum teruji pada usulan baru |
| Laporan HTML mandiri (desain riset) | Selesai untuk desain riset. Sintesis dan PRISMA belum masuk |
| Sintesis + taksonomi topik | Berfungsi, belum matang |
| Protokol SLR lengkap (PRISMA jujur, impor RIS, alasan eksklusi) | Belum |
| Audit mode (kesepakatan AI vs manusia) | Belum |
| Hosting | Belum diputuskan. Repo sudah bersih dari konfigurasi platform |

**Angka kunci (ekspor 1 Nov 2026).**

- 20 PDF: 17 INCLUDE, 3 EXCLUDE (di luar domain).
- 17 artikel semuanya **mono-method kuantitatif**; strategi: Experiment (Modeling & Simulation) 17, Archival research 13, Case study 4. Kualitatif dan Campuran = 0.
- 104 nama teknik mentah menjadi **77 nama baku dalam 10 keluarga**, 0 belum terpetakan.
- 59 dari 60 kutipan bukti terverifikasi ada di teks PDF.
- Biaya: sekitar **US$0,006 per artikel** (tarif normal), dua kali lipat saat jam peak DeepSeek. Total kumulatif sesi: sekitar US$0,22.
- Konsistensi AI antar-run: **32 dari 35 sel label sama (91,4%)**.

**Langkah berikutnya.** Pemilik akan **mengulang dari awal** (kosongkan state, unggah ulang 20 PDF, jalankan seluruh alur) untuk membuktikan perbaikan prompt terbaru. Protokol dan kriteria lulusnya ada di bagian 11A.

---

## 2. Konteks akademik

### 2.1 Tugas

**Tugas 2: Taksonomi Penelitian.** Individu. Mengorganisasi dan mengklasifikasi konsep, topik, dan subjek dalam bidang penelitian pilihan.

- Pilih topik sesuai minat.
- Susun taksonomi: identifikasi topik utama, definisikan konsep dan subkonsep, susun hierarki (top-down atau bottom-up) yang saling terhubung dan logis.
- Sumber: studi pustaka dan jurnal ilmiah bereputasi di bidang Teknik dan Manajemen Industri.
- Kumpul: hardcopy (tenggat awal Selasa 3 November 2026 pukul 15.00, Lab Sistem Produksi) dan softcopy lewat Edunex, format penulisan thesis Teknik dan Manajemen Industri. **Pemilik menyatakan tenggat sudah diundur** (tanggal baru tidak disebut). Pemilik memutuskan **belum menulis laporan formal**; keluaran HTML dianggap cukup dulu.

### 2.2 Penjelasan dosen (transkripsi papan tulis dan slide)

Papan tulis menggambar pohon:

```
Topik (akar)
├─ Metodologi
│   ├─ Quan  ── beberapa kotak (kelompok) di bawahnya
│   ├─ Qual
│   └─ Mix
└─ Strategi ── beberapa kotak di bawahnya
```

Catatan dosen:

- "Setelah dicari taksonominya, masuk ke systematic literature review."
- "Pengembangan model boleh menggunakan data sekunder: data global, wilayah, dkk."
- "Taksonomi awal fokus di eksploratori dulu, cari-cari jurnal untuk membuat research onion."

Slide research onion (Saunders dkk., 2019, Gambar 4.1) dengan anotasi dosen:

- Strategi **Experiment** diberi label **"Modeling & Simulation"**.
- Data analysis method: (1) kuantitatif, (2) kualitatif.
- Data collection method: (1) data sekunder, (2) data primer: wawancara, observasi, kuesioner.

### 2.3 Pemetaan research onion ke tool

| Lapisan onion | Field codebook | Tempat di pohon |
|---|---|---|
| Philosophy | `philosophy` | Cabang "Fondasi & horizon waktu" |
| Approach to theory development | `approach` | Cabang "Fondasi & horizon waktu" |
| Methodological choice | `methodological_choice` | Cabang **Metodologi** (Kuantitatif / Kualitatif / Campuran), lalu keluarga teknik di bawahnya |
| Strategy | `strategy` (boleh lebih dari satu) | Cabang **Strategi** |
| Time horizon | `time_horizon` | Cabang "Fondasi & horizon waktu" |
| Data collection | `data_source` | Cabang "Teknik & prosedur" |
| Data analysis | `analysis` | Cabang "Teknik & prosedur" |
| (di luar onion) | `techniques` | Daun di bawah keluarga pada cabang Metodologi |

Kode bertanda `[ekstensi]` di codebook (`experiment_modeling_simulation`, `synthetic_simulated`, dan beberapa lain) bukan dari Saunders. Ditambahkan agar cocok dengan riset pemodelan dan catatan dosen.

### 2.4 Topik dan konfigurasi pemilik

Nama topik di tool: **Predict-then-Optimize untuk keputusan operasional**. Konfigurasi review lengkap ada di bagian 10.

---

## 3. Pemilik dan cara bekerja sama

- **Bahasa:** Indonesia, santai ("bang", "ngab"). Balas dengan bahasa yang sama dan hangat, tanpa basa-basi.
- **Ingin paham alurnya.** Jelaskan pelan, bertahap. Jangan melompat ke solusi tanpa menjelaskan mengapa.
- **Ingin instruksi langsung.** Contoh: "klik tombol X, isi Y". Sebut folder tujuan setiap berkas yang dikirim.
- **Berkas dikirim satu per satu, bukan zip**, supaya langsung ditimpa.
- **Ingin evaluasi jujur.** Pisahkan "teruji", "belum teruji", dan "dugaan". Sebut batas alat dan batas pengujianmu sendiri.
- **Pola kerja yang sudah berjalan:** pemilik mengunggah ekspor JSON, kamu menganalisis dengan skrip, memperbaiki kode, menguji, lalu mengirim berkas yang berubah.
- **Pemilik memegang semua keputusan metodologis** (include/exclude, menyetujui normalisasi, granularitas penggabungan). Usulkan, jangan memutuskan.
- **Lingkungan pemilik:** Windows (kemungkinan dengan WSL: ia membuka aplikasi lewat `172.28.x.x:5000`), Chrome, DeepSeek API (model `deepseek-flash`), Git ke GitHub. Karena itu `HOST` bawaan tetap `0.0.0.0`.
- **Rencana hosting pemilik (nanti):** GitHub Actions, Cloudflare Pages, Supabase. Sekarang tidak diurus (bagian 11C).

---

## 4. Isi zip dan cara menjalankan

### 4.1 Struktur

```
slr-protocol/
├─ HANDOFF.md              dokumen ini
├─ README.md               penjelasan pemakaian
├─ CLAUDE.md               dokumentasi teknis end-to-end (baca sebelum mengubah kode)
├─ app.py                  backend Flask, semua logika server
├─ requirements.txt        Flask, PyMuPDF, python-dotenv
├─ start_windows.bat       peluncur lokal Windows
├─ .env.example            contoh konfigurasi  (.env TIDAK ikut zip)
├─ .gitignore
├─ static/
│   ├─ app.js              seluruh frontend (satu berkas, tanpa build)
│   ├─ style.css
│   └─ *.png, *.jpg        aset (logo, kredit, QRIS donasi)
├─ templates/index.html    satu halaman, 8 tab
├─ tests/
│   ├─ test_research_design.py        131 pengecekan, tanpa jaringan
│   ├─ fixtures_research_design.json  label buatan tangan (gold mini)
│   └─ fixtures_techniques.json       daftar teknik 5 artikel contoh
├─ tools/                  skrip analisis (bagian 13)
│   ├─ export_summary.py
│   ├─ compare_labels.py
│   └─ norm_agreement.py
├─ data/
│   ├─ pdfs/               20 PDF terakhir (nama berkas = hash SHA-256)
│   └─ json/               ekstraksi per artikel (bila KEEP_SERVER_JSON aktif)
└─ output/                 ekspor terakhir: proyek JSON, taksonomi JSON, laporan HTML
```

`render.yaml` sudah dihapus. Tambahkan `output/` ke `.gitignore` (berisi data riset).

### 4.2 Menjalankan

```
python -m venv .venv
.venv\Scripts\activate           (Windows)   |   source .venv/bin/activate  (WSL/Linux)
pip install -r requirements.txt
copy .env.example .env           (isi DEEPSEEK_API_KEY dan LLM_PROVIDER=deepseek)
python app.py                    # http://127.0.0.1:5000
```

Pengaturan `.env` yang dipakai pemilik: `LLM_PROVIDER=deepseek`, `DEEPSEEK_API_KEY=...`, `MAX_TEXT_CHARS=130000` (seluruh isi artikel terbaca, tidak terpotong). Daftar semua variabel ada di `CLAUDE.md` bagian 3.

### 4.3 Menguji

```
python tests/test_research_design.py
```

Harus menampilkan `SEMUA LULUS: 131 pengecekan`. Skrip memasang `LLM_PROVIDER=deepseek` dan kunci palsu sendiri, tidak memanggil jaringan. Bagian yang butuh PDF memakai `data/pdfs/` (atau variabel `SLR_PDF_DIR`) dan dilewati bila PDF tidak ada.

**Tes UI (jsdom) tidak ada di repo.** Sekitar 121 pengecekan UI pernah dijalankan di sandbox ruang sebelumnya dan tidak tersimpan. Lihat bagian 9 dan 14.

---

## 5. Arsitektur dan alur data

```
PDF
 └─ read_pdf()              buang daftar pustaka, potong 70% awal + 30% akhir bila melebihi MAX_TEXT_CHARS
     └─ LLM (article_prompt)   ekstraksi terstruktur + research_design (kode dari codebook)
         └─ validasi deterministik
              ├─ normalise_research_design   kode di luar codebook dibuang; basis 'stated' wajib kutipan terverifikasi
              ├─ apply_evidence_gates        label sintetis wajib kutipan yang memuat istilahnya
              ├─ apply_self_reference_rules  pulihkan 'case_study' bila penulis menyebutnya sendiri
              └─ verify_quote                tiap kutipan dicek ada di teks PDF per halaman
              → record artikel (analysis_version 6)

state di browser (localStorage 'litreview_studio_project_v1')
 ├─ articles[]  ← keputusan screening + full-text oleh pemilik
 ├─ synthesis   ← /api/synthesize (batch → gabung → final) + taksonomi topik (panggilan terpisah)
 ├─ designUi    ← nama topik + cakupan pohon
 └─ norm        ← {draft, approved}: pemetaan normalisasi teknik

/api/design-taxonomy      dihitung KODE dari label (tanpa AI): Metodologi / Strategi / Teknik / Fondasi + matriks
/api/normalize-techniques AI mengusulkan merges/drops/keluarga → finalisasi deterministik → DRAF → pemilik menyetujui
laporan HTML              dibuat di browser dari hasil di atas (satu berkas mandiri)
```

**Prinsip yang tidak boleh dilanggar:** AI mengusulkan, kode memvalidasi atau menghitung, pemilik menyetujui. Struktur pohon desain riset tidak digenerate LLM, karena kategori sejajar harus saling lepas dan konsisten.

**Versi.** `ANALYSIS_VERSION = 6`, `CODEBOOK_VERSION = onion-saunders2019-v3`. Naikkan `ANALYSIS_VERSION` setiap kali aturan atau skema ekstraksi berubah, supaya artikel lama boleh diunggah ulang (browser tidak lagi menganggapnya duplikat) dan hasil baru menggantikan yang lama dengan keputusan manual tetap terjaga.

**Delapan tab UI:** Ikhtisar, Artikel, PRISMA Flow, Review Synthesis, Taxonomy, Desain Riset, Co-occurrence, System Map.

---

## 6. Status per tahap rencana

Rencana asli (disusun di awal ruang sebelumnya) memiliki sembilan tahap.

| Tahap | Isi | Status |
|---|---|---|
| 0 | Codebook research onion (kerangka, definisi tiap nilai) | **Selesai** (v3) |
| 1 | Korpus dan PRISMA jujur (impor RIS/CSV, screening judul/abstrak sebelum PDF, alasan eksklusi) | **Belum.** "Identified" masih jumlah PDF yang diunggah, bukan hasil pencarian database |
| 2 | Ekstraksi v2+ (bagian PDF cerdas, kutipan terverifikasi, `research_design` per artikel) | **Selesai** (versi analisis 6) |
| 3 | Normalisasi (satukan nama, buang yang bukan teknik, kelompokkan ke keluarga, pemilik menyetujui) | **Selesai untuk teknik.** Konsep dan variabel belum dinormalisasi |
| 4a | Taksonomi desain riset dihitung kode | **Selesai** |
| 4b | Taksonomi topik (apa yang diteliti), usulan AI | **Berfungsi, belum matang** (bagian 8.5) |
| 5 | Validasi (cakupan, audit sampel manual, kesepakatan AI vs manusia) | **Sebagian.** Cakupan terukur; audit dan kesepakatan belum |
| 6 | Iterasi codebook dengan versi | **Sebagian.** Versi tercatat dan unggah ulang berjalan; belum ada UI pengelolaan |
| 7 | Analisis gap | **Sebagian.** Matriks menampilkan sel kosong; belum ada daftar gap terstruktur |
| 8 | Ekspor | **Sebagian.** JSON dan laporan HTML desain riset selesai. Sintesis, PRISMA, dan format Word/thesis belum |

Hal tambahan yang sudah selesai di luar tahap: alur unggah ulang artikel versi lama, tombol salin dengan cadangan untuk konteks non-HTTPS, pesan pemotongan teks yang akurat, `HOST` configurable, pembersihan hosting.

---

## 7. Keputusan desain dan alasannya

Tiap keputusan di bawah lahir dari temuan pada data nyata. Jangan membalikkannya tanpa bukti baru.

| Keputusan | Alasan |
|---|---|
| Taksonomi desain riset **dihitung kode** dari label, bukan digenerate LLM | LLM tidak konsisten membuat struktur yang saling lepas. LLM bagus mengklasifikasikan satu artikel ke kode yang sudah ditetapkan |
| Kode codebook tetap (enum), nilai di luar daftar dibuang | Mencegah kategori karangan dan menjaga pohon stabil |
| Basis dinilai **per nilai** pada field multi-nilai (`strategy`, `data_source`, `analysis`) | Satu kutipan tidak boleh "menyatakan" dua label. Ditemukan pada artikel pendidikan: label sekunder ikut tampak dinyatakan padahal kutipan hanya mendukung sintetis |
| **Label eksplisit** (semua `philosophy`; strategi survey, case_study, ethnography, grounded_theory, narrative_inquiry, action_research) hanya diterima bila `stated` dengan kutipan terverifikasi yang **memuat istilahnya**; selain itu **dibuang**, bukan sekadar ditandai | Case study diberikan ke 3 dari 5 artikel padahal hanya 1 yang benar. Positivism diberikan acak ke 2 dari 5 artikel serupa |
| Kutipan terverifikasi tidak sama dengan kutipan yang mendukung. Lencana UI: **"dinyatakan ✓"** hanya untuk label eksplisit, **"didukung kutipan ✓"** untuk label lain | Kode hanya memastikan kalimat ada di PDF. Contoh nyata: kutipan time horizon yang tidak membahas waktu |
| `time_horizon` dijawab berurutan: deret waktu historis eksplisit = longitudinal; satu waktu = cross_sectional; selain itu (pemodelan, simulasi) = `not_applicable` tanpa kutipan | "Rolling horizon", "planning horizon" adalah horizon perencanaan model, **bukan** time horizon penelitian. Pemilik menyetujui aturan ini |
| Aturan recall deterministik hanya untuk `case_study` (kalimat orang pertama "we present a ... case study") | Setelah dibuat ketat, AI melewatkan satu case study yang benar. Pola sengaja sempit: kalimat pustaka dan judul bagian tidak cocok. Kode lain belum diberi aturan (kasus terlewat belum teramati) |
| Gerbang istilah untuk `synthetic_simulated`: kutipan wajib memuat istilah synthetic/simulat/generat/dst.; tanpa kutipan tetap diterima sebagai tebakan | Artikel PM2.5 (data publik nyata) keliru berlabel sintetis lewat kutipan tentang sample average approximation |
| Normalisasi: AI **mengusulkan** (draf), pemilik menyetujui, hanya `approved` yang dipakai pohon | Penggabungan dan pembuangan teknik itu keputusan metodologis. AI terbukti keliru pada hal material (bagian 8.3) |
| Finalisasi usulan AI **deterministik** (tiap nama masukan tepat sekali, nama karangan diabaikan, id keluarga tak valid menjadi "belum dikelompokkan") | Menjaga struktur walau AI berantakan. Kode **tidak bisa** menilai kebenaran semantik penggabungan; itu tugas pemilik lewat tombol pisah (×) |
| Item "belum dikelompokkan" diproses ulang oleh tombol Perbarui | Konsisten dengan hitungan "belum terpetakan" di UI |
| Maksimal **8 teknik utama per artikel** pada ekstraksi | Membatasi token dan menjaga fokus. Akibatnya angka di pohon berarti "disebut sebagai teknik utama", bukan pemakaian lengkap |
| Keputusan domain screening: ikuti kriteria tertulis (opsi A), 3 artikel di luar domain di-EXCLUDE | Reproduktibilitas SLR: kriteria ditetapkan lebih dulu, bukan disesuaikan setelah melihat artikel |
| Laporan HTML mandiri: CSP `default-src 'none'`, semua teks di-escape, JSON ditanam | Aman dibagikan, bisa dicetak ke PDF, tidak butuh internet |
| `HOST` bawaan `0.0.0.0`, bisa diganti `127.0.0.1` | Pemilik membuka aplikasi lewat IP WSL. Mengubah bawaan akan memutus akses itu |
| Konfigurasi hosting (`render.yaml`, gunicorn) dihapus; batasan arsitektur dicatat netral di `CLAUDE.md` bagian 9 | Platform belum ditentukan. Pengetahuan teknisnya (satu worker, health check 401, request panjang) dipertahankan |

---

## 8. Hasil pada korpus nyata

### 8.1 Korpus

20 PDF. Daftar lengkap ada di Lampiran A. Ringkas:

- **17 INCLUDE** (screening dan full-text): 2 dari batch awal (Singapura: ridesharing EMAV; PM2.5 Ontario: forecasting + stochastic optimization) dan 15 jurnal baru.
- **3 EXCLUDE**, semuanya dari batch awal:
  - Reliabilitas struktur seismik dengan surrogate SNGP (prediksi tanpa optimasi keputusan; saran AI: exclude).
  - Alokasi bantuan finansial pendidikan (Predict-then-Optimize, tetapi domain di luar kriteria; saran AI: review).
  - Prediksi CSI dan optimasi di jaringan RIS 6G (Predict-then-Optimize, tetapi domain di luar kriteria; saran AI: review).
- Tahun 17 artikel INCLUDE: 2024 (1), 2025 (3), **2026 (13)**. Korpus condong ke 2026 padahal kriteria 2020 sampai 2026. Itu soal cakupan pencarian, bukan tool.
- Sumber: ScienceDirect. Jumlah hit database **belum dicatat** (perlu diisi manual untuk PRISMA).

### 8.2 Taksonomi desain riset (17 artikel)

- Metodologi: Kuantitatif 17, Kualitatif 0, Campuran 0.
- Strategi: Experiment (Modeling & Simulation) 17, Archival research 13, Case study 4, lainnya 0.
- Data collection: data sekunder 16, data sintetis 10, primer lainnya 2, tidak dinyatakan 1.
- Time horizon: longitudinal 7, tidak relevan 10. Philosophy: tidak dinyatakan 17. Approach: deduktif 17 (semua disimpulkan AI).
- Kepercayaan label: dari 119 label (17 artikel x 7 lapisan), sekitar 84 berstatus disimpulkan AI.
- Matriks metodologi x strategi: baris Kualitatif dan Campuran kosong. Itu hasil jujur untuk topik berbasis pemodelan, bukan bug.

### 8.3 Normalisasi teknik

**Hasil akhir (disetujui pemilik): 10 keluarga, 77 nama baku dari 104 nama mentah, 0 belum terpetakan.**

| Keluarga | Teknik baku | Artikel |
|---|---|---|
| Optimasi matematis dan algoritma solusi | 8 | 12 |
| Prediksi: jaringan saraf | 17 | 10 |
| Optimasi di bawah ketidakpastian | 6 | 9 |
| Prediksi: pohon keputusan dan boosting | 11 | 9 |
| Pembelajaran terarah keputusan | 11 | 6 |
| Prediksi: model linear, kernel, dan berbasis jarak | 6 | 5 |
| Heuristik dan algoritma numerik | 5 | 4 |
| Optimasi berurutan dan kendali | 5 | 4 |
| Seleksi fitur, tuning, dan interpretasi | 5 | 4 |
| Evaluasi dan validasi statistik | 3 | 2 |

**Audit usulan AI (prompt lama) terhadap keputusan pemilik.** AI umumnya baik, tetapi keliru pada empat hal:

1. **Membuang 8 arsitektur model prediksi** (TCN, DCRNN, TGCN, ASTGCN, STID, LM-MTSF, Transformer decoder-only, Kolmogorov-Arnold Network) sebagai "bukan teknik", padahal arsitektur sejenis (LSTM, Transformer) dipertahankan. Pemilik mengembalikannya.
2. **Perangkat lunak ikut sebagai teknik** (Gurobi, CPLEX) dan komponen model (resource extension functions). Pemilik membuangnya.
3. **Menggabungkan varian metodologis** ke metode dasar: `quantile XGBoost` dan `XGB-CQR` ke XGBoost; `robust MPC` dan `stochastic MPC` ke MPC; `weighted SAA` ke SAA. Pemilik memisahkannya.
4. **Keluarga "Evaluasi dan validasi" menampung yang tidak cocok** (K-means, reduced error pruning, Pooling and Boosting). Pemilik memindahkannya. Pemilik juga memecah keluarga prediksi yang berisi 34 teknik menjadi tiga (pohon dan boosting, jaringan saraf, linear/kernel/jarak).

Prompt normalisasi sudah diperbaiki untuk keempat hal ini (arsitektur adalah teknik, solver dibuang, varian tetap terpisah, jangan paksa teknik ke keluarga yang salah). **Perbaikan itu belum teruji** karena draf yang diaudit lahir dari prompt lama.

**Angka dasar (baseline) usulan prompt LAMA terhadap pemetaan akhir pemilik** (dihitung `tools/norm_agreement.py`; acuan dibuat dengan mengedit usulan AI, jadi angkanya cenderung optimis):

| Ukuran | Precision | Recall | F1 |
|---|---|---|---|
| Keputusan buang | 0,579 | 0,786 | 0,667 |
| Penggabungan nama (pasangan) | 0,682 | 1,000 | 0,811 |
| Keluarga (pasangan sekeluarga) | 0,468 | 0,709 | 0,564 |

Usulan lama juga menyisakan 2 teknik tak terkelompok (acuan: 0). Uji ulang (11A) harus mengalahkan angka ini, terutama keputusan buang.

### 8.4 Ekstraksi: temuan audit yang sudah diperbaiki

| Temuan | Perbaikan | Versi |
|---|---|---|
| Teks terpotong di depan, kesimpulan dan limitations hilang | Buang daftar pustaka, simpan 70% awal + sisanya dari akhir | v2 |
| Kutipan AI tidak diverifikasi | `verify_quote` per halaman, penanda sitasi `[59,60]` diabaikan | v2 |
| Case study keliru di 2 dari 3 artikel; philosophy acak | Basis per nilai, label eksplisit wajib bukti | v3 |
| Case study yang benar hilang setelah aturan diperketat | Aturan recall kalimat orang pertama | v4 |
| Lencana "dinyatakan" menyesatkan | Dibedakan dari "didukung kutipan" | v4 |
| Label sintetis keliru pada artikel PM2.5 | Gerbang istilah kutipan | v5 |
| Daftar teknik berisi topik, dataset, metrik, kata "classifier" | Aturan penulisan `techniques` | v6 |

Konsistensi AI antar-run (5 artikel, dua run, satu perubahan disengaja): 32 dari 35 sel sama (91,4%). Dua perbedaan lain hanya bendera yang bergeser dari *stated* ke *inferred*.

### 8.5 Sintesis dan taksonomi topik (17 artikel)

- Sintesis jalan; narasinya hati-hati dan jujur soal batas korpus.
- Taksonomi topik: 3 kategori utama (sekitar 10, 7, 4 artikel), 8 subkategori, cakupan 17 dari 17, prinsip per level tertulis.
- **Kelemahan:** jumlah artikel di tiga kategori utama menjumlah 21 untuk 17 artikel (minimal 4 artikel di lebih dari satu kategori), dan prinsip level 1 sedikit bercampur (peran prediksi bercampur dengan gaya optimasi).
- `limitations_of_corpus` dan `review_notes` kosong pada sintesis ini (pada run 2 artikel terisi). Klaim negatif dalam narasi (misalnya "tidak ada uji lapangan prospektif") belum diverifikasi.

---

## 9. Masalah terbuka dan keterbatasan

| # | Masalah | Dampak |
|---|---|---|
| 1 | PRISMA: "identified" = jumlah PDF diunggah; tidak ada impor RIS/CSV; alasan eksklusi tidak tercatat | PRISMA belum bisa dipakai di tesis |
| 2 | Tidak ada audit mode (label manual vs AI, kappa) dan tidak ada reviewer kedua | Klaim "AI cukup andal" belum bisa dipertanggungjawabkan |
| 3 | Maksimal 8 teknik per artikel | Jumlah di pohon = "teknik utama", bukan pemakaian lengkap |
| 4 | Saran screening AI tidak konsisten antar-run | Jangan dipakai sebagai keputusan |
| 5 | Normalisasi hanya untuk teknik; konsep dan variabel belum | Taksonomi topik masih bergantung ringkasan AI |
| 6 | Taksonomi topik: prinsip level bercampur, artikel tumpang tindih | Belum bisa diandalkan untuk laporan |
| 7 | Tidak ada catatan keputusan normalisasi (usulan AI vs ubahan pemilik) | Audit trail metodologi kurang |
| 8 | Tidak ada tombol gabung manual di editor normalisasi | Cara kerja: beri dua item nama baku identik di keluarga yang sama (pohon menggabungkannya) |
| 9 | Item hasil pisah (×) tidak menampilkan jumlah artikel di editor | Kosmetik; pohon menghitung ulang dengan benar |
| 10 | **Tes UI tidak ada di repo** | Perubahan UI tidak punya jaring pengaman otomatis |
| 11 | Tampilan laporan HTML di browser sungguhan belum diverifikasi visual (hanya struktur DOM dan render PDF WeasyPrint) | Mungkin ada cacat tampilan layar |
| 12 | Korpus condong ke 2026 | Soal strategi pencarian, bukan kode |
| 13 | Analisis dan sintesis berjalan dalam satu request HTTP panjang; state hanya di browser; PDF di disk lokal | Hambatan untuk hosting (`CLAUDE.md` bagian 9) |
| 14 | `import fitz` memunculkan peringatan deprecation pada PyMuPDF baru | Kosmetik; ganti ke `import pymupdf` bila perlu |

Daftar keterbatasan teknis lengkap ada di `CLAUDE.md` bagian 11.

---

## 10. Konfigurasi review yang dipakai

Isikan persis ini di tab Ikhtisar saat mengulang dari awal.

| Kolom | Isi |
|---|---|
| Research question | Bagaimana desain penelitian (metodologi, strategi, teknik) pada studi predict-then-optimize untuk keputusan operasional industri? |
| Sumber/database | ScienceDirect |
| Tanggal pencarian | 2026-10-30 |
| Search query | ("prescriptive analytics" OR "predict-then-optimize" OR "decision-focused learning" OR "uncertainty" OR "stochastic") AND ("optimization" OR "resource allocation" OR "logistics") |
| Kriteria inklusi | Artikel jurnal peer-reviewed 2020–2026, bahasa Inggris, menggabungkan prediksi (ML/forecasting) dengan model optimasi untuk keputusan operasional industri |
| Kriteria eksklusi | Hanya prediksi tanpa optimasi; domain di luar operasional/industri; review atau opini; tanpa full text |
| Nama topik (tab Desain Riset) | Predict-then-Optimize untuk keputusan operasional |
| Cakupan pohon | Hanya yang INCLUDE (screening + full-text) |

---

## 11. Rencana

### 11A. Uji ulang dari awal (langkah berikutnya)

**Tujuan.** Membuktikan dua hal pada data yang sama: (1) ekstraksi v6 stabil dan akurat, (2) prompt normalisasi yang baru memperbaiki empat kesalahan di bagian 8.3. Pemilik juga ingin memastikan seluruh alur berjalan bersih dari nol.

**Persiapan (pemilik).**

1. **Ekspor proyek terbaru sekarang** dan simpan di `output/`. Ekspor proyek di server terakhir (1 Nov) hanya memuat pemetaan 8 keluarga lama. Pemetaan final 10 keluarga ada di berkas taksonomi (kunci `normalization`) dan di state browser saat ini. Ekspor dulu sebelum mengosongkan apa pun.
2. Pastikan `.env`: `LLM_PROVIDER=deepseek`, kunci terisi, `MAX_TEXT_CHARS=130000`. Restart server.
3. Jalankan di luar jam peak DeepSeek (hari kerja sekitar 08–11 dan 13–17 WIB; biaya dua kali lipat).

**Mengosongkan state dengan benar.** Tombol "Hapus semua artikel" **hanya** menghapus artikel, penghitung, dan sintesis. Tombol itu **tidak** menghapus pemetaan normalisasi (`norm`), konfigurasi, nama topik, atau penghitung token. Kalau hanya itu yang dilakukan, pemetaan lama tetap aktif dan uji normalisasi tidak bersih.

Cara paling bersih: setelah mengekspor, buka DevTools Chrome, tab Application, Storage, **Clear site data** untuk alamat aplikasi, lalu muat ulang. Cara manual: Hapus semua artikel, lalu di tab Desain Riset klik **Hapus normalisasi** (dan **Buang draf** bila ada), lalu klik chip token di pojok kanan atas dan **Reset penghitung** (klik dua kali untuk konfirmasi).

**Langkah.**

1. Isi konfigurasi (bagian 10) dan simpan.
2. Unggah 20 PDF dari `data/pdfs/` dalam 2 sampai 3 batch (maksimal 10 per batch). Aplikasi menolak duplikat berdasarkan hash.
3. Tab Artikel: terapkan keputusan yang sama seperti sebelumnya supaya hasil bisa dibandingkan: **17 INCLUDE** (screening dan full-text) dan **3 EXCLUDE** (id berawalan `a7b7e1`, `c25ce2`, `be0cef`; lihat Lampiran A).
4. Jalankan **Sintesis** sekali.
5. Tab Desain Riset: isi nama topik, pilih cakupan "Hanya yang INCLUDE".
6. **Klik "Usulkan pengelompokan (AI)" dan JANGAN mengedit dulu.** Ekspor proyek saat itu (mengandung `norm.draft` murni). Itu bahan evaluasi prompt baru.
7. Setelah itu edit draf seperti biasa dan setujui (atau tiru keputusan di bagian 8.3).
8. Ekspor terakhir: proyek JSON, taksonomi desain riset JSON, dan laporan HTML. Kirim ke ruang chat.

**Evaluasi (Claude).**

```
python tools/export_summary.py output/<proyek-uji-ulang>.json
python tools/compare_labels.py  output/<proyek-lama-11-01>.json  output/<proyek-uji-ulang>.json
python tools/norm_agreement.py  output/<taksonomi-final>.json    output/<proyek-uji-ulang-dengan-draf>.json
```

**Kriteria lulus (usulan, bukan standar baku; sesuaikan bila pemilik tidak setuju).**

| Ukuran | Target | Asal |
|---|---|---|
| Sel label sama dengan run sebelumnya | 90% atau lebih | baseline 91,4% |
| Case study | tepat 4 artikel, semua `stated` | hasil sekarang |
| Philosophy | semua tidak dinyatakan | hasil sekarang |
| Label sintetis keliru pada PM2.5 | tidak muncul | perbaikan v5 |
| Normalisasi: arsitektur model dibuang AI | 0 dari 8 | baseline: 8 dibuang |
| Normalisasi: Gurobi dan CPLEX | dibuang | baseline: lolos |
| Normalisasi: precision keputusan buang | 0,85 atau lebih | baseline 0,579 |
| Normalisasi: varian XGBoost/MPC/SAA tidak digabung | tidak digabung | baseline: digabung |
| Teknik tak terkelompok | 0 sampai 2 | baseline 2 |
| Kutipan terverifikasi | 95% atau lebih | sekarang 59/60 |

Audit manual (pemilik atau Claude dengan PDF): ambil 5 sampai 8 artikel, terutama yang detailnya memuat "Catatan validasi", dan cocokkan label ke teks asli.

### 11B. Roadmap setelah uji ulang (urut prioritas)

| # | Pekerjaan | Ukuran | Mengapa |
|---|---|---|---|
| 1 | **Protokol SLR:** impor RIS/CSV, screening judul/abstrak sebelum PDF diunggah, kolom alasan eksklusi, angka PRISMA dari hasil database | Besar | Syarat validitas SLR tesis; paling banyak mengubah alur kerja |
| 2 | **Audit mode:** pemilik melabeli sampel manual, tool menghitung kesepakatan (Cohen's kappa) dengan AI | Sedang | Membuat klaim "AI cukup andal" bisa dipertanggungjawabkan |
| 3 | **Taksonomi topik:** normalisasi konsep, peringatan otomatis bila prinsip level bercampur atau artikel tumpang tindih lintas kategori | Sedang | Kelemahan di bagian 8.5 |
| 4 | **Laporan:** sintesis dan PRISMA masuk laporan HTML; opsi ringkas; ekspor Word/format thesis | Sedang | Pemilik ingin keluaran yang bisa dibaca; format thesis menyusul |
| 5 | **Audit trail normalisasi:** catat usulan AI vs ubahan pemilik; simpan versi model dan prompt di ekspor | Kecil | Reproduktibilitas |
| 6 | **Tes UI masuk repo** (tulis ulang skrip jsdom dengan fixture mandiri) | Sedang | Jaring pengaman untuk perubahan UI |
| 7 | Kecil-kecil: tombol gabung manual, jumlah artikel pada item hasil pisah, batas 8 teknik bisa diatur | Kecil | Bagian 9 poin 3, 8, 9 |

### 11C. Persiapan hosting (ditunda, rencana pemilik)

Pemilik berencana memakai **GitHub Actions** (CI dan tes), **Cloudflare Pages**, dan **Supabase**. Belum ada yang dikerjakan dan belum ada keputusan arsitektur.

Hal yang perlu diputuskan saat tiba waktunya:

- **Di mana backend Python berjalan.** Cloudflare Pages melayani frontend statis (dan fungsi edge). Backend ini adalah aplikasi Flask dengan PyMuPDF (dependensi native) dan request analisis yang bisa berlangsung beberapa menit. Apakah backend berjalan di tempat lain, atau diubah menjadi arsitektur job di background, belum diselidiki. Kelayakan tiap opsi belum diverifikasi.
- **Penyimpanan.** State proyek sekarang hanya di localStorage browser. Supabase bisa menggantikannya (database, autentikasi, penyimpanan PDF). Perlu model data dan keamanan (PDF berhak cipta, kunci API).
- **CI.** GitHub Actions cocok untuk menjalankan `tests/test_research_design.py` pada tiap push.
- Batasan yang sudah dicatat: satu worker, health check kena 401 bila `APP_PASSWORD` diisi, request panjang, rahasia hanya lewat environment, HTTPS wajib. Detail di `CLAUDE.md` bagian 9.

### 11D. Tugas 2 (kuliah)

Bahan yang sudah ada: pohon taksonomi (Metodologi, Strategi, Teknik, Fondasi) dengan keluarga teknik, matriks metodologi x strategi, laporan HTML, dan teks outline lewat tombol "Salin outline teks". Yang belum: penulisan dalam format thesis TMI. Pemilik memutuskan menundanya. Saat dibutuhkan, susun dari data yang sama (bukan menulis ulang dari awal): alur metode (pencarian, screening, ekstraksi berbantuan AI dengan verifikasi, normalisasi yang disetujui manusia), pohon, matriks gap, keterbatasan (bagian 9).

---

## 12. Peta format ekspor JSON

### 12.1 Ekspor proyek (`slr-protocol-project-YYYY-MM-DD.json`)

```
format, version, exported_at
articles[]            (lihat di bawah)
identifiedTotal, duplicateCount
synthesis             null atau {executive_synthesis, main_themes, agreements, contradictions, research_gaps,
                       subquestions, evidence_catalog, taxonomy{hierarchical,faceted,flat,polyhierarchy,matrix},
                       taxonomy_status, taxonomy_coverage{total,covered,uncovered_ids,max_depth,parent_fixes},
                       included_article_count, generated_at, model, ...}
meta                  {research_question, source_name, search_date, search_query, inclusion, exclusion}
usage                 {calls, prompt_tokens, cache_hit_tokens, completion_tokens, cost_usd, usd_to_idr}
designUi              {topic, scope}   scope: notexcluded | all | included
norm                  {draft, approved}  masing-masing {families[{id,name,definition}],
                       items[{canonical, variants[], family, reason, count, article_ids[], new}],
                       principle, model, proposed_at, added, approved_at}
                       family: id keluarga | "__drop__" (dibuang) | null (belum dikelompokkan)
```

Artikel:

```
id (16 hex), hash, filename, title, authors, year, doi, abstract, objective, methods, context,
research_questions, variables, findings, limitations, future_research, topic_tags, concepts, relationships,
evidence_quotes[{claim, quote, page, verified}], evidence_quality{quotes_total, quotes_verified},
screening_suggestion{decision, reason}, screening_decision, eligibility_decision,
analysis_version, text_chars, text_chars_body, text_chars_original, text_truncated, references_removed,
extraction_status, pages, uploaded_at, pdf_stored, json_stored, source_name, search_query, search_date
research_design:
  codebook_version, techniques[], warnings[]
  philosophy | approach | methodological_choice | time_horizon:
      {value, basis: stated|inferred|not_stated, evidence, evidence_verified}
  strategy | data_source | analysis:
      {value[], basis (agregat), items[{code, basis, evidence, evidence_verified, source?:"rule", page?}]}
```

### 12.2 Ekspor taksonomi desain riset

```
topic, n_articles, n_with_design, missing_ids[], codebook_version, generated_at
tree{id, name, kind: root|branch|group|family|value|technique, definition, note,
     article_ids[], count, inferred_count, children[]}
matrix{columns[{key,label}], rows[{id,name,total,cells{kolom: [id artikel]}}]}
basis_summary{field: {label, stated, inferred, not_stated}}
normalization_status{applied, families, unmapped[], unmapped_count}
normalization        pemetaan yang disetujui (sama dengan norm.approved)
```

---

## 13. Alat bantu (`tools/`)

Tiga skrip Python murni (tanpa dependensi luar). Dibuat dari analisis yang berulang kali dilakukan di ruang sebelumnya.

| Skrip | Fungsi |
|---|---|
| `export_summary.py FILE.json` | Ringkasan satu layar untuk ekspor proyek atau taksonomi: jumlah artikel, versi, keputusan, kutipan terverifikasi, biaya, sintesis, status normalisasi |
| `compare_labels.py LAMA.json BARU.json` | Membandingkan label desain riset per artikel antara dua ekspor proyek; mencetak sel yang sama atau beda, perubahan daftar teknik, peringatan baru |
| `norm_agreement.py ACUAN.json USULAN.json` | Kesepakatan usulan normalisasi AI dengan pemetaan acuan: precision, recall, F1 untuk keputusan buang, penggabungan, dan pasangan sekeluarga |

`norm_agreement.py` menerima berkas taksonomi (kunci `normalization`) atau ekspor proyek (`norm.approved` atau `norm.draft`).

---

## 14. Lingkungan uji dan pelajaran (untuk Claude yang menguji di sandbox)

- **Dependensi:** `pip install flask pymupdf python-dotenv --break-system-packages`. Tes UI memakai Node dengan `jsdom` (`npm install jsdom`). Pemeriksaan tata letak cetak memakai WeasyPrint.
- **jsdom butuh suntikan:** `structuredClone`, `crypto` (lewat `Object.defineProperty`, bukan penugasan biasa), `URL.createObjectURL`, `HTMLAnchorElement.prototype.click`, `scrollIntoView`, `scrollTo`, `confirm`. Server Flask harus berjalan (`flask --app app run -p 5055`) dan di-restart tiap kali `app.py` berubah.
- **Shell:** `/bin/sh` tidak mendukung process substitution `<(...)`; gunakan berkas sementara. `cut -c` memotong karakter UTF-8 dan merusak keluaran; pakai Python untuk memotong teks. Server latar belakang harus dijalankan di perintah yang sama dengan pengujinya. `pkill` di akhir perintah membuat kode keluar -1 walau hasilnya benar.
- **Pelajaran yang mahal:**
  - Pengecekan tes yang berakhiran `or True` atau berbentuk longgar berarti tidak menguji apa-apa. Tulis asersi yang bisa gagal.
  - Naikkan `ANALYSIS_VERSION` setiap aturan ekstraksi berubah, kalau tidak, unggah ulang dilewati diam-diam sebagai duplikat.
  - Pisahkan "bug di kode" dari "artefak tes" sebelum memperbaiki. Beberapa kegagalan tes ternyata ekspektasi yang salah.
  - Periksa keluaran visual (render PDF) selain struktur DOM. Tes DOM tidak menemukan halaman kosong akibat aturan cetak.
  - Prompt AI tidak deterministik. Ukur dengan data nyata sebelum menyatakan perbaikan prompt berhasil.

---

## 15. Keamanan dan privasi

- **Rotasi `DEEPSEEK_API_KEY`.** Pada ruang sebelumnya, arsip yang dibagikan memuat `.env` dengan kunci terisi. Anggap kunci itu sudah bocor dan ganti. Jangan pernah menyertakan `.env` dalam zip atau commit (sudah di `.gitignore`).
- **Riwayat git bersih:** `.env` tidak pernah ter-commit; tidak ada PDF, `data/`, atau ekspor proyek di riwayat; satu-satunya "sk-" adalah placeholder di `.env.example`.
- **Isi zip ini bersifat privat:** 20 PDF jurnal (hak cipta penerbit) dan data riset di `output/`. Jangan dipublikasikan atau di-commit (`data/` sudah di `.gitignore`; tambahkan `output/`).
- **`APP_PASSWORD`** kosong di konfigurasi awal. Isi bila aplikasi dapat dijangkau orang lain (bawaan `HOST=0.0.0.0` terbuka bagi seluruh jaringan lokal); tanpa itu siapa pun di jaringan bisa memakai saldo API.
- Semua teks dari PDF dan AI di-escape di UI dan laporan HTML.

---

## Lampiran A. Daftar 20 artikel

Id adalah 6 karakter pertama dari 16 hex `id` artikel (nama berkas PDF di `data/pdfs/` berawalan id penuh). Judul dipotong.

| Id | Tahun | Keputusan | Saran AI | Judul |
|---|---|---|---|---|
| b12f6b | 2024 | INCLUDE | include | Refinery planning optimization based on smart predict-then-optimize method under exogenous p... |
| e130d7 | 2025 | INCLUDE | include | A prescriptive tree-based model for energy-efficient room scheduling: Considering uncertaint... |
| f0b903 | 2025 | INCLUDE | include | Air quality monitoring and mitigation through time series forecasting and stochastic optimiz... |
| dd9c0f | 2025 | INCLUDE | include | Predictive and prescriptive analytics for robust airport gate assignment planning in airside... |
| 599fa9 | 2026 | INCLUDE | include | A predict-then-optimize framework for Just-In-Time arrival of vessels with probabilistic ber... |
| 2b03c5 | 2026 | INCLUDE | include | A predict-then-optimize framework for exposure allocation in online-to-offline platforms und... |
| c99de2 | 2026 | INCLUDE | include | A predict-then-optimize framework for multi-stage agricultural production and distribution p... |
| b5694c | 2026 | INCLUDE | include | A smart predict-then-optimize framework for vehicle rebalancing problem |
| cf05cd | 2026 | INCLUDE | include | Customized first-and-last-mile ridesharing services with electric modular autonomous vehicle... |
| 489d02 | 2026 | INCLUDE | include | Data-Driven Predict-then-Optimize framework for landing scheduling with hybrid descent modes |
| 673126 | 2026 | INCLUDE | include | Data-driven arrival time suggestion for drivers in trucking platform of export containers |
| f3d7cd | 2026 | INCLUDE | include | Decision-Focused Learning Enhanced by Automated Feature Engineering for Energy Storage Optim... |
| 75fffd | 2026 | INCLUDE | include | Decision-focused learning-augmented MPC for climate control in controlled-environment agricu... |
| 9ac7e5 | 2026 | INCLUDE | include | Integrated estimate-and-optimize decision trees learning for two-stage linear decision-makin... |
| e2e2ec | 2026 | INCLUDE | include | Machine Learning-Enhanced Rolling Horizon Optimization algorithm for dynamic scheduling in A... |
| 46530a | 2026 | INCLUDE | include | Predict-then-optimize: LM-MTSF provides data-driven support for distributionally robust oper... |
| cc6f2d | 2026 | INCLUDE | include | SPO-VCS: An end-to-end smart predict-then-optimize framework with alternating differentiatio... |
| a7b7e1 | 2026 | EXCLUDE | exclude | Adaptive and uncertainty-aware surrogate modeling for reliability analysis of nonlinear dyna... |
| c25ce2 | 2026 | EXCLUDE | review | Balancing the scales: Fair and efficient resource allocation for student success |
| be0cef | 2026 | EXCLUDE | review | Uncertainty-aware CSI prediction and AI-seeded multi-objective optimization in RIS assisted ... |

Lima artikel pertama dari batch awal (`a7b7e1`, `be0cef`, `c25ce2`, `cf05cd`, `f0b903`) dipakai juga sebagai bahan tes backend (`tests/fixtures_research_design.json`, label buatan tangan). Karena itu PDF-nya harus tetap ada di `data/pdfs/` agar pengecekan berbasis PDF aktif.

## Lampiran B. Istilah

| Istilah | Arti |
|---|---|
| `stated` / "dinyatakan" | Penulis menyebut istilah label itu sendiri; berlaku untuk label eksplisit, dengan kutipan terverifikasi yang memuat istilahnya |
| "didukung kutipan" | Ada kutipan yang terverifikasi di PDF dan relevan, tetapi penulis belum tentu menyebut labelnya secara harfiah |
| `inferred` / "disimpulkan" | Tebakan AI dari cara studi dilakukan; periksa sebelum dipakai sebagai fakta |
| Draf vs disetujui | `norm.draft` hasil usulan atau edit yang belum dipakai pohon; `norm.approved` yang dipakai pohon |
| Cakupan | Artikel mana yang dihitung pohon: semua, semua kecuali EXCLUDE, atau hanya INCLUDE |
| Keluarga | Kelompok teknik, kotak di bawah Kuantitatif pada pohon (padanan kotak di papan tulis dosen) |
| Peak | Jam tarif DeepSeek dua kali lipat: hari kerja (UTC) 01–04 dan 06–10, kira-kira 08–11 dan 13–17 WIB |
