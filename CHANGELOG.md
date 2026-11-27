# Catatan Perubahan

Semua perubahan penting pada project ini dicatat di sini. Format mengikuti [Keep a Changelog](https://keepachangelog.com/id-ID/1.1.0/) dan penomoran versi mengikuti [Semantic Versioning](https://semver.org/lang/id/).

## [Belum dirilis]

### Diubah
- Skrip di dalam `index.html` dan `admin.html` dipindah ke file terpisah di `assets/js/`. `admin.html` kini 55 baris dan logikanya terbagi ke tiga file (masuk dan daftar, tagihan baru, detail tagihan). Tampilan tidak berubah: diuji dengan membandingkan lima halaman sebelum dan sesudah.
- Fungsi `personBreakdown` dipindah dari `common.js` ke `assets/js/utils/hitung.js`.

### Ditambahkan
- Tujuh uji otomatis untuk perhitungan tagihan (`tests/hitung.test.js`).

### Ditambahkan
- `CLAUDE.md` dan `AGENTS.md` berisi aturan struktur dan keamanan untuk alat AI.
- `.gitignore`, `.editorconfig`, dan catatan perubahan ini.
- README diperluas: cara menjalankan lokal, struktur, layanan pihak ketiga, dan keamanan data.
