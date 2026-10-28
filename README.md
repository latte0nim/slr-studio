# LitReview Studio — AI Systematic Literature Review

Prototype full-stack untuk workspace systematic literature review pribadi. Antarmuka dibuat dengan HTML/CSS/JavaScript, server memakai Python Flask, ekstraksi PDF memakai PyMuPDF, dan analisis memakai Gemini API.

## Fitur yang tersedia

- Upload batch hingga 8 PDF per permintaan (maks. 12 MB per file).
- Ekstraksi judul, penulis, tahun, DOI, abstrak, tujuan, metode, konteks, variabel, temuan, keterbatasan, future research, konsep, relasi, dan kutipan bukti yang disertai halaman jika terdeteksi.
- Rekomendasi screening AI: `include`, `exclude`, atau `review` — keputusan awal tetap `pending` sampai ditetapkan oleh pengguna.
- Verifikasi manual untuk screening judul/abstrak dan full-text eligibility.
- PRISMA tracking view yang menggunakan jumlah artikel berhasil diekstrak dan keputusan pengguna.
- Review synthesis: tema, kesepakatan, kontradiksi, research gaps, serta catatan keterbatasan korpus.
- Taxonomy visual: hierarchical, poly-hierarchical, faceted, list/flat, dan matrices. Analisis co-occurrence menampilkan jaringan istilah berdasarkan kata kunci/konsep yang diekstrak dari artikel.
- System map dengan nodes, arah hubungan, label, dan evidence article IDs.
- Autosave ke `localStorage` browser, ekspor proyek JSON, impor proyek JSON, cetak PRISMA, dan ekspor system map SVG.

## Kesesuaian dengan PDF referensi

Struktur mengikuti istilah pada `Systematic Review_S2.pdf`: Research Question; Article Identification; Article Screening; Article Selection; Review & Synthesis; PRISMA Flowchart; taxonomy list/flat, poly-hierarchical, metrices/matrices; dan system map. Lihat terutama bagian PRISMA sekitar halaman 11–24 serta taxonomy/system map sekitar halaman 26–31.

## Kebutuhan

- Python 3.10 atau lebih baru (direkomendasikan 3.11/3.12).
- API key Gemini dari Google AI Studio: https://aistudio.google.com/apikey
- Browser modern.

## Jalankan di komputer sendiri (Windows)

1. Ekstrak ZIP ke folder, misalnya `C:\slr-ai-website`.
2. Install Python jika belum tersedia: https://www.python.org/downloads/ . Saat instalasi Windows, centang **Add Python to PATH**.
3. Buka Command Prompt atau PowerShell di folder proyek.
4. Buat virtual environment dan install dependensi:

   ```powershell
   py -m venv .venv
   .\.venv\Scripts\Activate.ps1
   python -m pip install --upgrade pip
   pip install -r requirements.txt
   ```

   Jika PowerShell menolak aktivasi, buka Command Prompt lalu jalankan:

   ```bat
   .venv\Scripts\activate.bat
   ```

5. Duplikat `.env.example` menjadi `.env`, lalu edit file `.env` dengan text editor. Ganti `isi_api_key_di_sini` dengan API key dari Google AI Studio. File `.env` dibaca otomatis oleh aplikasi saat berjalan lokal. Contoh konfigurasi:

   ```env
   GEMINI_API_KEY=PASTE_API_KEY_ANDA
   GEMINI_MODEL=gemini-3.5-flash-lite
   ```

   Untuk penggunaan lokal, `APP_PASSWORD` boleh dibiarkan kosong. Untuk website yang dipublikasikan, wajib isi username dan password yang kuat di pengaturan environment hosting.

6. Buka `http://127.0.0.1:5000` di browser.
7. Jika AI menampilkan error model/akses, cek model yang tersedia pada akun Google AI Studio dan ubah `GEMINI_MODEL` sesuai model stabil yang tersedia untuk akunmu.

Jangan memasukkan API key ke file HTML/JavaScript dan jangan commit `.env` atau API key ke GitHub.

## Publikasi gratis menggunakan Render + GitHub

Render menyediakan free web services, tetapi layanan gratis akan tidur setelah tidak aktif dan filesystem-nya bersifat sementara. Data proyek aplikasi ini disimpan di browser, sehingga bukan pada filesystem Render.

1. Buat repository pribadi di GitHub lalu unggah isi folder proyek ini (jangan unggah `.env` atau API key).
2. Di Render pilih **New → Web Service** dan hubungkan repository.
3. Gunakan:
   - Build command: `pip install -r requirements.txt`
   - Start command: `gunicorn app:app --workers 1 --threads 4 --timeout 180`
   - Runtime: Python
   - Plan: Free
4. Tambahkan environment variables di Render:
   - `GEMINI_API_KEY` = API key dari Google AI Studio
   - `GEMINI_MODEL` = `gemini-3.5-flash-lite` (atau model stabil yang tersedia di akunmu)
   - `APP_USERNAME` = username pilihanmu
   - `APP_PASSWORD` = password yang kuat
5. Deploy. Browser akan meminta username/password HTTP Basic Auth sebelum membuka website jika `APP_PASSWORD` sudah diisi.

Panduan resmi Render: https://render.com/docs/deploy-flask dan batas free service: https://render.com/docs/free .

## Cara menggunakan

1. Isi research question, database/sumber, tanggal/query pencarian, serta kriteria inklusi dan eksklusi.
2. Upload PDF berbasis teks. Untuk batch besar, gunakan batch berisi 5–8 PDF dan tunggu satu batch selesai.
3. Pada tab **Artikel**, periksa ekstraksi setiap artikel dan ubah keputusan screening dari `Belum diputuskan` menjadi `INCLUDE` atau `EXCLUDE`.
4. Untuk artikel dengan keputusan screening `INCLUDE`, tetapkan pula keputusan `Full-text` menjadi `INCLUDE` atau `EXCLUDE` setelah membaca PDF asli.
5. Buka **Review Synthesis** lalu jalankan sintesis AI. Sintesis menggunakan hanya artikel dengan dua keputusan manual `INCLUDE`.
6. Periksa PRISMA, lima bentuk taxonomy, co-occurrence network, dan system map. Jika keputusan artikel berubah, hasil sintesis lama akan dihapus sehingga perlu dijalankan ulang.
7. Ekspor proyek JSON sebagai backup berkala. Impor kembali melalui shortcut `Ctrl+Shift+O` / `Cmd+Shift+O`.

## Batasan dan integritas akademik

- Sistem belum melakukan pencarian otomatis ke Scopus, Web of Science, PubMed, IEEE Xplore, atau Google Scholar. Catatan database, tanggal, query, dan jumlah hasil pencarian harus diisi dari proses pencarian yang benar-benar dilakukan.
- PDF hasil scan yang tidak memiliki lapisan teks akan ditandai sebagai tidak terbaca; prototype belum menjalankan OCR otomatis.
- PRISMA adalah pelacakan yang dibangun dari file yang berhasil diproses dan keputusan manual. Jumlah hasil database yang tidak diinput bukan otomatis diketahui. Untuk publikasi, periksa dan sesuaikan dengan template PRISMA 2020 resmi.
- Screening satu reviewer dengan bantuan AI bukan pengganti penilaian kritis peneliti. Semua keputusan inklusi/eksklusi, kutipan halaman, metodologi, dan temuan harus dicek pada PDF asli.
- Model dapat salah mengekstrak teks, menyimpulkan hubungan yang tidak didukung, atau melewatkan konteks. Sistem meminta ID artikel sebagai sumber, tetapi bukan jaminan bahwa seluruh kutipan/relasi tepat.
- Untuk akun/API free tier, ketentuan pemrosesan data dapat berbeda. Jangan mengunggah artikel yang bersifat rahasia atau materi yang tidak diizinkan untuk dibagikan ke layanan AI eksternal.
- Proyek disimpan di localStorage browser pada perangkat/domain saat ini, bukan database cloud. Bersihkan cache browser atau mengganti browser dapat menghilangkan proyek; gunakan ekspor JSON sebagai backup. File PDF asli tidak disimpan oleh server setelah proses ekstraksi selesai.
- Ini merupakan prototype untuk penggunaan riset pribadi, bukan sistem dengan akun multi-user, enkripsi dokumen, audit trail formal, quality appraisal standar, atau kontrol akses berlapis.

## Referensi teknologi

- Gemini API — https://ai.google.dev/gemini-api/docs/generate-content
- Gemini models — https://ai.google.dev/gemini-api/docs/models
- PRISMA 2020 — https://www.prisma-statement.org/prisma-2020
- PRISMA flow diagram — https://www.prisma-statement.org/prisma-2020-flow-diagram

### Cara lebih singkat di Windows

Jalankan `start_windows.bat`. Pada pertama kali, file `.env` akan dibuat dan dibuka di Notepad. Masukkan API key lalu simpan, kemudian jalankan `start_windows.bat` lagi. Script akan membuat virtual environment, memasang dependensi, dan menjalankan website.


## Pembaruan visual taxonomy dan co-occurrence

- Identitas warna: primer `#6C151E`, sekunder `#0F3D3A`, latar `#F5DABF`.
- Taxonomy hierarchical dan poly-hierarchical ditampilkan sebagai diagram node-panah; faceted taxonomy ditampilkan sebagai kolom facet dan nilai.
- Halaman Co-occurrence membangun jaringan istilah dari kata kunci/konsep pada artikel yang diekstrak, dengan filter minimum kemunculan dan unduh SVG. Visualisasi ini terinspirasi analisis co-occurrence VOSviewer tetapi bukan aplikasi VOSviewer resmi.
- Jalankan ulang Review Synthesis setelah pembaruan untuk meminta AI mengisi field `hierarchical` dan `faceted` pada data taxonomy.

Taxonomy dibangkitkan melalui panggilan Ollama terpisah selepas sintesis utama supaya struktur taxonomy tidak bersaing dengan seluruh output sintesis dalam satu batas token. Jika taxonomy tidak dapat dibuat, hasil sintesis utama tetap dipertahankan dan halaman Taxonomy menampilkan pesan diagnostik.


## Pembaruan workflow
- PDF asli tetap disimpan di `data/pdfs/`, tetapi tidak ada preview PDF di antarmuka.
- Hasil ekstraksi terstruktur disimpan per artikel di `data/json/` untuk audit dan penggunaan ulang.
- Saat analisis berjalan, antarmuka menampilkan persentase progres, nama file aktif, tahap proses, dan log status dari backend. Persentase adalah progres tahap/file (bukan estimasi waktu).
