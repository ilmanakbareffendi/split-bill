// Split Bill · scan-struk
// Menerima foto struk dari halaman host, membacanya dengan Gemini, dan mengembalikan daftar item.
// Kunci Gemini disimpan sebagai secret GEMINI_API_KEY, tidak pernah dikirim ke browser.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const PROMPT = `Kamu membaca foto struk atau nota restoran di Indonesia untuk aplikasi patungan (split bill).
Kembalikan JSON sesuai skema. Aturan:
- items: hanya makanan, minuman, atau barang yang dipesan. JANGAN masukkan baris pajak, PB1, PPN, service charge, diskon, pembulatan, subtotal, total, tunai, kembalian, atau metode bayar.
- qty: jumlah porsi (bilangan bulat, minimal 1).
- unit_price: harga SATU porsi dalam rupiah (bilangan bulat, tanpa titik). Kalau struk hanya menulis harga total baris untuk qty > 1, bagi dengan qty.
- Kalau ada add-on atau topping di bawah sebuah item dengan harga sendiri, jadikan item terpisah. Kalau add-on tanpa harga, gabungkan ke nama item.
- name: nama item seperti tertulis, rapikan huruf besar kecilnya, maksimal 60 karakter.
- subtotal: jumlah harga item sebelum pajak/service/diskon. Isi 0 kalau tidak tertulis.
- total: jumlah AKHIR yang harus dibayar (Grand Total / Total Bayar), sudah termasuk pajak, service, dan diskon. Bukan uang tunai yang diserahkan. Isi 0 kalau tidak terbaca.
- place: nama tempat makan kalau terlihat, kalau tidak kosongkan.
- date: tanggal transaksi format YYYY-MM-DD kalau terlihat, kalau tidak kosongkan.
- is_receipt: false kalau gambar ini bukan struk/nota.
- notes: catatan singkat bahasa Indonesia kalau ada bagian yang tidak terbaca jelas, kalau tidak kosongkan.
Angka rupiah di struk Indonesia memakai titik sebagai pemisah ribuan: "25.000" berarti 25000.`;

const SCHEMA = {
  type: "OBJECT",
  properties: {
    is_receipt: { type: "BOOLEAN" },
    place: { type: "STRING" },
    date: { type: "STRING" },
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { name: { type: "STRING" }, qty: { type: "INTEGER" }, unit_price: { type: "NUMBER" } },
        required: ["name", "qty", "unit_price"],
      },
    },
    subtotal: { type: "NUMBER" },
    total: { type: "NUMBER" },
    notes: { type: "STRING" },
  },
  required: ["is_receipt", "place", "date", "items", "subtotal", "total", "notes"],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Metode tidak didukung" }, 405);

  let body: { token?: string; image?: string; mime?: string };
  try { body = await req.json(); } catch { return json({ error: "Data tidak valid" }, 400); }
  const { token, image, mime = "image/jpeg" } = body;
  if (!token || !image) return json({ error: "Foto atau sesi tidak ada" }, 400);
  if (image.length > 8_000_000) return json({ error: "Foto terlalu besar" }, 413);
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(mime)) return json({ error: "Format foto tidak didukung" }, 415);

  // 1. cek sesi dan batas scan harian lewat database
  const sbUrl = Deno.env.get("SUPABASE_URL") || "https://mdhnvznrtjzhgcvletbq.supabase.co";
  // kunci publik (publishable) memang aman dipakai di sini; fungsi sb_scan_allow sendiri memeriksa token
  const sbKey = Deno.env.get("SUPABASE_ANON_KEY") || "sb_publishable_qPeLUrizilLAUD5OGoJXHA_ZR3xVQUY";
  const h: Record<string, string> = { apikey: sbKey, "Content-Type": "application/json" };
  if (sbKey.startsWith("eyJ")) h.Authorization = `Bearer ${sbKey}`;
  const allow = await fetch(`${sbUrl}/rest/v1/rpc/sb_scan_allow`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ p_token: token }),
  }).then((r) => r.json()).catch(() => null);
  if (!allow || !allow.ok) return json({ error: allow?.error || "Tidak bisa memeriksa sesi" }, 403);

  // 2. baca struk dengan Gemini
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) return json({ error: "Kunci Gemini belum dipasang" }, 500);
  const model = Deno.env.get("GEMINI_MODEL") || "gemini-flash-latest";
  const g = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ inline_data: { mime_type: mime, data: image } }, { text: PROMPT }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: SCHEMA },
    }),
  });
  const gj = await g.json().catch(() => null);
  if (!g.ok) {
    const msg = gj?.error?.status === "RESOURCE_EXHAUSTED"
      ? "Kuota AI sedang penuh. Coba lagi sebentar lagi atau isi manual."
      : "AI gagal membaca struk. Coba foto ulang atau isi manual.";
    return json({ error: msg, detail: gj?.error?.message }, 502);
  }
  const text = gj?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") || "";
  let data;
  try { data = JSON.parse(text); } catch { return json({ error: "Hasil AI tidak terbaca. Coba foto ulang." }, 502); }
  if (!data.is_receipt) return json({ error: "Gambar ini sepertinya bukan struk." }, 422);
  data.items = (data.items || [])
    .filter((i: { name?: string; unit_price?: number }) => i.name && Number(i.unit_price) >= 0)
    .map((i: { name: string; qty?: number; unit_price: number }) => ({
      name: String(i.name).trim().slice(0, 60),
      qty: Math.max(1, Math.round(Number(i.qty) || 1)),
      price: Math.round(Number(i.unit_price) || 0),
    }));
  return json({ ok: true, left: allow.left, model, ...data });
});
