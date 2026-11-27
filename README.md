# Split Bill

Bagi tagihan makan bareng: admin membuat tagihan dari struk, teman membuka link, masuk dengan nama + nomor HP + PIN, lalu mencentang pesanannya sendiri. Pajak, service, dan diskon dibagi sebanding dengan nilai pesanan.

- Halaman teman: `index.html?b=KODE`
- Halaman admin: `admin.html`
- Database: Supabase (tabel dan fungsi berawalan `sb_`, lihat `supabase/schema.sql`)
- `.github/workflows/keep-alive.yml` menjaga proyek Supabase gratis agar tidak dijeda.

## Menjalankan di komputer sendiri
1. Unduh atau clone repo ini.
2. Di folder repo, jalankan `python3 -m http.server 8000`.
3. Buka `http://localhost:8000/admin.html` untuk host, atau `http://localhost:8000/?b=KODE` untuk teman.

## Struktur
- `index.html`: halaman teman.
- `admin.html`: halaman host dan admin.
- `common.js`, `style.css`, `avatars.js`, `fonts/`: kode dan aset bersama.
- `supabase/schema.sql`: struktur database, RLS, dan fungsi.
- `supabase/functions/scan-struk/`: Edge Function pembaca struk.
- `CLAUDE.md`: aturan kerja untuk alat AI dan programmer.
- `CHANGELOG.md`: catatan perubahan.

## Keamanan data
Kunci yang ada di kode hanya kunci publik Supabase. Semua tabel memakai Row Level Security dan hanya bisa diakses lewat fungsi. Nomor HP dan PIN tidak pernah dikirim ke halaman teman; PIN disimpan sebagai hash bcrypt.

## Pemilik dan kontak
Career and Alumni Relations Unit, Pusat Pengembangan Karir dan Kewirausahaan (CEDC) UNPRI. Kontak: ilmanakbareffendi@unprimdn.ac.id.

Status hak cipta dan lisensi akan dicantumkan di file `LICENSE` setelah ditetapkan.
