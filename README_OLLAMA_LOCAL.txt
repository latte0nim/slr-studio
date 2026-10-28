LitReview Studio — paket lengkap

Fitur revisi:
- Menggunakan Ollama lokal dengan model qwen3-vl:8b-instruct.
- Sintesis menggunakan seluruh artikel yang tersimpan pada proyek dan memenuhi keputusan INCLUDE pada screening serta full-text. Tambahkan jurnal baru lalu jalankan sintesis ulang untuk memperbarui hasil lintas-korpus.
- PDF yang berhasil dianalisis disimpan di data/pdfs dan dapat dipreview pada detail artikel. Jangan hapus folder ini jika ingin menyimpan PDF.
- Warna: primary #602437, secondary #9E2A2B, accent #E08F3E, border/text #B1A7A6, background #FFF8F0. Font Montserrat.
- Istilah antarmuka dirapikan tanpa menyebut teknologi di label utama.

Persiapan Windows:
1. Install Python 3.11+ dan Ollama.
2. Di PowerShell jalankan: ollama pull qwen3-vl:8b-instruct
3. Pastikan `ollama list` menampilkan qwen3-vl:8b-instruct.
4. Buat environment (opsional): python -m venv .venv lalu .venv\Scripts\activate
5. Install dependensi: pip install -r requirements.txt
6. Periksa .env. Ubah APP_PASSWORD jika ingin memasang kata sandi.
7. Jalankan start_windows.bat atau python app.py.
8. Buka http://127.0.0.1:5000 lalu tes /api/test-ai.

Catatan penting:
- Model 8B membutuhkan RAM/VRAM lebih besar daripada model 4B; kecepatan bergantung pada perangkat. Tag instruct dipilih agar ekstraksi lebih langsung menghasilkan JSON dan tidak menghabiskan batas keluaran untuk thinking.
- Qwen3-VL mendukung input visual, tetapi ekstraksi PDF saat ini memakai teks PDF yang dapat dipilih; OCR PDF hasil scan belum disertakan.
- Data artikel proyek disimpan di browser (localStorage); PDF asli disimpan pada komputer yang menjalankan server di data/pdfs. Ekspor proyek JSON tetap disarankan untuk backup.
- Sintesis hanya memasukkan artikel yang ditandai INCLUDE pada screening dan eligibility. Model memberi dukungan analisis, bukan pengganti keputusan akademik.

Taxonomy dibangkitkan melalui panggilan Ollama terpisah selepas sintesis utama supaya struktur taxonomy tidak bersaing dengan seluruh output sintesis dalam satu batas token. Jika taxonomy tidak dapat dibuat, hasil sintesis utama tetap dipertahankan dan halaman Taxonomy menampilkan pesan diagnostik.
