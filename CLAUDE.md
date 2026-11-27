# CLAUDE.md

## Tentang project
Split Bill Tongkrongan: web app pribadi untuk membagi tagihan makan bersama lewat tautan; host membuat tagihan dari struk, teman mencentang pesanannya sendiri.
Pemilik: Career and Alumni Relations Unit, Pusat Pengembangan Karir dan Kewirausahaan (CEDC) UNPRI.
Acuan: Standar Pengembangan Web CEDC UNPRI v1.0.

## Struktur saat ini
- `index.html` dan `admin.html`: markup saja.
- `assets/js/features/teman.js`: logika halaman teman.
- `assets/js/features/admin-masuk.js`, `admin-tagihan-baru.js`, `admin-detail.js`, dan `assets/js/admin-main.js`: halaman host dan admin.
- `assets/js/utils/hitung.js`: fungsi hitung murni `personBreakdown`, diuji di `tests/hitung.test.js`.
- `common.js`: fungsi bersama, termasuk `esc()`, format rupiah, suara, dan efek.
- Semua skrip adalah skrip klasik yang dimuat berurutan dan berbagi nama global. Setiap tag memakai `?v=` untuk memaksa browser mengambil versi baru; naikkan nilainya setiap kali file JavaScript atau CSS berubah.
- `style.css`, `avatars.js`, `fonts/`.
- `supabase/schema.sql`: tabel `sb_*`, RLS, dan fungsi RPC. PIN disimpan sebagai hash bcrypt dengan penguncian setelah beberapa kali salah.
- `supabase/functions/scan-struk/`: Edge Function untuk membaca struk.
- `.github/workflows/keep-alive.yml`: menjaga proyek Supabase gratis agar tidak dijeda.

## Struktur target (Standar Pengembangan Web CEDC UNPRI v1.0)

```
index.html, pages/          hanya markup
assets/css/                 base.css, components.css, pages/
assets/js/main.js           titik masuk
assets/js/config.js         semua konfigurasi (URL, kunci publik)
assets/js/services/         akses Supabase dan API
assets/js/features/         satu folder per fitur
assets/js/utils/            fungsi umum (format, escape)
assets/data/                data statis .json
assets/vendor/              salinan pustaka luar versi tetap
tests/  docs/
```

## Catatan khusus
- Perhitungan uang (pembagian pajak, service, diskon) wajib diuji otomatis sebelum diubah.
- Secret untuk Edge Function hanya disimpan di Supabase secrets, tidak pernah di repo.

## Aturan wajib

1. Sebelum menulis fungsi baru, cari dulu fungsi serupa (grep). Pakai ulang, jangan salin.
2. Satu file satu tugas. Target di bawah 300 baris. File di atas 500 baris wajib dipecah sebelum menambah fitur baru; usulkan dulu kepada pemilik.
3. File baru tidak memuat CSS atau JavaScript di dalam HTML, dan tidak memakai `style=""` atau `onclick=""`. Selector JavaScript memakai atribut `data-*`.
4. Teks dari pengguna, file, atau database ditampilkan lewat `textContent`, atau lewat `esc()` bila harus disusun sebagai HTML. `esc()` wajib mengamankan `& < > " '`.
5. Jangan pernah menulis secret key atau service_role key. Kunci publik Supabase saja yang boleh ada di kode.
6. Setiap tabel Supabase wajib RLS. Pengecekan hak admin, PIN, dan aturan permainan dilakukan di fungsi database, bukan di JavaScript.
7. Pustaka luar: versi dikunci dan memakai atribut `integrity` plus `crossorigin="anonymous"`, atau disalin ke `assets/vendor/`.
8. Logika hitung ditulis sebagai fungsi murni dan diuji di `tests/` dengan `node --test`.
9. Kerja di branch `fitur/...` atau `perbaikan/...`, bukan langsung di `main`, karena `main` langsung tayang di GitHub Pages. Catat setiap perubahan di `CHANGELOG.md`.
10. Jangan menghapus atau menulis ulang riwayat Git.

## Gaya tulisan

Teks antarmuka dan dokumentasi memakai bahasa Indonesia. Jangan memakai tanda pisah panjang atau en dash dalam kalimat. Tulis jenjang sebagai Sarjana, Magister, Doktoral, bukan singkatan S1, S2, S3.

## Perintah

- Jalankan lokal: `python3 -m http.server 8000`, lalu buka `http://localhost:8000`
- Pengujian: `node --test` (menjalankan semua file `tests/*.test.js`)
