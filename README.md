# SLR Protocol — Systematic Literature Review dengan bantuan AI

Workspace web untuk systematic literature review (SLR). Kamu mengunggah PDF jurnal, AI mengekstrak data
terstruktur dari tiap artikel, kamu memutuskan INCLUDE/EXCLUDE secara manual, lalu AI menyintesis seluruh
artikel yang lolos menjadi tema, kontradiksi, research gap, taxonomy, jaringan istilah, dan system map.

- **Backend:** Python + Flask (satu berkas, `app.py`).
- **Frontend:** HTML/CSS/JavaScript biasa, tanpa framework dan tanpa build step.
- **AI:** pilih satu lewat `.env`: **Ollama lokal** (gratis) atau **DeepSeek API** (berbayar per token).
- **Penyimpanan:** tidak ada database. Proyek disimpan di browser (`localStorage`) dan dicadangkan lewat Ekspor JSON.

> Dokumentasi teknis lengkap (arsitektur, alur data, API, konvensi) ada di [`CLAUDE.md`](CLAUDE.md).

## Fitur

- Unggah batch PDF berbasis teks, dengan cek duplikat di browser sebelum upload (hash SHA-256) supaya PDF yang sama
  tidak diproses, dan tidak ditagih, dua kali.
- Ekstraksi per artikel: judul, penulis, tahun, DOI, abstrak, tujuan, metode, konteks, variabel, temuan, keterbatasan,
  saran riset lanjutan, konsep, relasi, dan kutipan bukti. AI juga memberi rekomendasi screening, tetapi keputusan
  awal selalu `pending` sampai kamu menetapkannya.
- Dua tahap verifikasi manual: screening judul/abstrak dan full-text eligibility. Sintesis hanya memakai artikel
  yang **INCLUDE di kedua tahap**.
- PRISMA flow, review synthesis (tema, kesepakatan, kontradiksi, research gap), lima bentuk taxonomy
  (hierarchical, poly-hierarchical, faceted, flat, matrix), jaringan co-occurrence, dan system map (unduh SVG).
- **Progres live** untuk analisis dan sintesis: persen berdasarkan langkah yang benar-benar selesai, log per
  panggilan AI (token, durasi, biaya), serta catatan retry bila jawaban terpotong.
- **Popup pemakaian token** (klik chip token di pojok kanan atas): token, jumlah panggilan, estimasi biaya
  USD/Rupiah, status tarif **peak/off-peak** DeepSeek, dan tombol reset.
- Ekspor/impor proyek JSON (impor: `Ctrl/Cmd + Shift + O`), cetak PRISMA.

## Prasyarat

- Python 3.10 atau lebih baru (disarankan 3.11/3.12) dan browser modern.
- **Salah satu** dari:
  - Ollama terpasang dengan model, misalnya `ollama pull qwen3-vl:8b-instruct`; atau
  - API key DeepSeek dari https://platform.deepseek.com/api_keys (pastikan saldo terisi).

## Menjalankan di komputer sendiri

**Windows:** jalankan `start_windows.bat`. Pertama kali, file `.env` dibuat dari `.env.example` dan dibuka di
Notepad. Isi pengaturan, simpan, lalu jalankan skrip lagi.

**Manual (semua OS):**

```bash
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # lalu edit .env
python app.py
```

Buka http://127.0.0.1:5000. Untuk menguji koneksi AI tanpa upload PDF, buka `/api/test-ai`.
Pill status di pojok kanan atas harus menampilkan "Model siap".

### Memilih provider AI

Atur di `.env`, lalu restart aplikasi (`.env` hanya dibaca saat start):

```env
# DeepSeek API
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-xxxxxxxx

# atau Ollama lokal (default bila LLM_PROVIDER tidak diisi)
LLM_PROVIDER=ollama
OLLAMA_MODEL=qwen3-vl:8b-instruct
```

Semua variabel (model, tarif, batas, saklar penyimpanan) dijelaskan di [`.env.example`](.env.example).
Nilai yang tertulis di `.env` selalu mengalahkan nilai bawaan.

### Batas bawaan

| Batas | Ollama | DeepSeek |
|---|---|---|
| Teks yang dibaca per PDF | 18.000 karakter | 80.000 karakter (batas pengaman 200.000) |
| PDF per upload | 8 | 20 |
| Ukuran per PDF | 12 MB | 30 MB |
| Artikel per batch sintesis | 4 | 12 |

Model lokal 8B punya konteks sempit sehingga batasnya ketat. Dengan API, bagian akhir artikel (hasil,
limitasi, saran riset) ikut terbaca. Semua batas dapat diubah lewat `.env`.

## Biaya DeepSeek

- Tarif dihitung per juta token: input (cache miss), input (cache hit), dan output. Bawaan di `.env.example`
  mengikuti tarif `deepseek-flash` **off-peak**; saat **peak** tarif dikali 2.
- **Peak:** Senin–Jumat 01:00–04:00 dan 06:00–10:00 UTC (= 08:00–11:00 dan 13:00–17:00 WIB). Di luar itu dan di
  akhir pekan: off-peak. Hari libur nasional China (kabarnya off-peak) tidak dimodelkan.
- Biaya output biasanya mendominasi, sedangkan cache hit jarang terjadi pada dokumen yang berbeda.
- Rupiah di popup hanyalah estimasi dari `USD_TO_IDR`. Dashboard DeepSeek menagih dalam USD dan menampilkan
  biaya dipotong ke dua desimal, jadi untuk membandingkan gunakan jumlah token dan jumlah request.
- Tarif bisa berubah. Cek https://api-docs.deepseek.com/quick_start/pricing dan sesuaikan `DEEPSEEK_PRICE_*`.

## Cara menggunakan

1. Isi research question, sumber/database, tanggal dan query pencarian, serta kriteria inklusi/eksklusi.
2. Unggah PDF berbasis teks. PDF yang sudah ada di proyek dilewati otomatis.
3. Di tab **Artikel**, periksa hasil ekstraksi dan tetapkan keputusan screening, lalu keputusan full-text.
4. Buka **Review Synthesis** dan jalankan sintesis **sekali di akhir** (setiap sintesis memproses ulang semua
   artikel INCLUDE dan menambah biaya).
5. Periksa PRISMA, taxonomy, co-occurrence, dan system map.
6. **Ekspor proyek** secara berkala. Mengubah keputusan artikel menghapus hasil sintesis lama, jadi sintesis
   perlu dijalankan ulang.

### Di mana datamu disimpan

- Proyek (artikel, keputusan, sintesis, penghitung token) ada di `localStorage` browser, **per alamat**:
  `localhost:5000` dan `127.0.0.1:5000` adalah dua penyimpanan berbeda. Membersihkan data browser
  menghapus proyek, maka klik **Ekspor proyek** sesudah setiap batch upload dan setelah sintesis.
- **Impor menimpa seluruh proyek** di browser, bukan menggabungkan.
- Salinan PDF/JSON di server bersifat opsional dan **mati secara bawaan**
  (`KEEP_SERVER_PDFS`, `KEEP_SERVER_JSON`); aplikasi tidak membacanya kembali.

## Deploy ke Render

1. Buat repository GitHub dari folder ini (jangan commit `.env`).
2. Di Render pilih **New → Blueprint** (memakai `render.yaml`) atau **New → Web Service** dengan
   start command `gunicorn app:app --workers 1 --threads 8 --timeout 600`.
3. Isi environment variable rahasia di dashboard: `DEEPSEEK_API_KEY` dan **`APP_PASSWORD`**.
   Tanpa `APP_PASSWORD`, siapa pun yang membuka alamatnya bisa memakai saldo API-mu.
4. Browser akan meminta username/password (HTTP Basic Auth) sebelum membuka aplikasi.

Catatan free tier: layanan tidur saat tidak aktif, RAM 512 MB (karena itu batas upload di `render.yaml`
lebih kecil), dan filesystem bersifat sementara. Analisis dan sintesis berjalan sebagai satu request panjang;
lihat bagian keterbatasan di `CLAUDE.md` bila platform memutus request yang terlalu lama.

## Aset gambar

Antarmuka memakai tiga gambar di folder `static/` yang tidak ikut dalam kerangka repo ini; letakkan sendiri:
`slr.png` (logo dan favicon), `latte0nim.jpg` (avatar credit di sidebar), dan `qris.png` (QRIS pada popup token).
Aplikasi tetap berjalan tanpa mereka. Kotak QRIS menyembunyikan diri bila `qris.png` tidak ada, sedangkan
logo dan avatar akan tampil sebagai gambar rusak.

## Pemecahan masalah

| Gejala | Penyebab umum |
|---|---|
| "API key belum dipasang" | `DEEPSEEK_API_KEY` kosong, atau lupa restart setelah mengubah `.env` |
| HTTP 401 dari DeepSeek | API key salah/belum aktif |
| HTTP 402 dari DeepSeek | Saldo habis, top up di platform.deepseek.com |
| HTTP 429 | Terkena rate limit, tunggu lalu coba lagi |
| Proyek tampak kosong | Alamat/port berbeda dari sebelumnya, atau data browser dibersihkan: impor file ekspor |
| Teks "tidak terbaca" pada PDF | PDF hasil scan tanpa lapisan teks; belum ada OCR, jalankan OCR dulu |
| Banyak "retry" di log | Output AI terpotong di batas token; naikkan `LLM_OUTPUT_SCALE` |

## Keterbatasan dan integritas akademik

- Belum ada pencarian otomatis ke Scopus, Web of Science, PubMed, IEEE Xplore, atau Google Scholar. Catat sumber,
  tanggal, dan query secara manual.
- Belum ada OCR otomatis untuk PDF hasil scan.
- PRISMA dibangun dari file yang berhasil diproses dan keputusan manualmu; angka hasil database yang tidak
  kamu input tidak diketahui sistem.
- Screening satu reviewer dengan bantuan AI bukan pengganti penilaian kritis peneliti. Periksa semua keputusan,
  kutipan halaman, metodologi, dan temuan terhadap artikel aslinya.
- AI dapat salah mengekstrak, menyimpulkan hubungan yang tidak didukung, atau melewatkan konteks.
- Dengan DeepSeek, teks artikel dikirim ke server pihak ketiga. Jangan unggah materi rahasia atau yang tidak
  boleh dibagikan.
- Ini prototype untuk penggunaan riset: belum multi-user, tanpa audit trail formal atau quality appraisal standar.

## Struktur repo

```
app.py                  backend Flask (API, prompt, provider AI, progres, biaya)
templates/index.html    satu halaman (semua tab)
static/app.js           logika frontend (state, render, upload, progres, popup)
static/style.css        tema terminal
requirements.txt        dependensi Python
render.yaml             blueprint deploy Render
start_windows.bat       peluncur Windows
.env.example            contoh konfigurasi
CLAUDE.md               dokumentasi teknis end-to-end
```

## Referensi

- PRISMA 2020: https://www.prisma-statement.org/prisma-2020
- DeepSeek API: https://api-docs.deepseek.com
- Ollama: https://ollama.com
- Render: https://render.com/docs
