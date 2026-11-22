# Split Bill

Bagi tagihan makan bareng: admin membuat tagihan dari struk, teman membuka link, masuk dengan nama + nomor HP + PIN, lalu mencentang pesanannya sendiri. Pajak, service, dan diskon dibagi sebanding dengan nilai pesanan.

- Halaman teman: `index.html?b=KODE`
- Halaman admin: `admin.html`
- Database: Supabase (tabel dan fungsi berawalan `sb_`, lihat `supabase/schema.sql`)
- `.github/workflows/keep-alive.yml` menjaga proyek Supabase gratis agar tidak dijeda.
