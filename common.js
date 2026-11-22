// Konfigurasi Supabase. Kunci "publishable/anon" memang aman ditaruh di halaman:
// semua tabel dikunci, dan akses hanya lewat fungsi sb_* yang sudah membatasi diri.
const SB_URL = "https://mdhnvznrtjzhgcvletbq.supabase.co";
const SB_KEY = "sb_publishable_qPeLUrizilLAUD5OGoJXHA_ZR3xVQUY";

async function rpc(fn, args) {
  const headers = { apikey: SB_KEY, "Content-Type": "application/json" };
  if (SB_KEY.startsWith("eyJ")) headers.Authorization = "Bearer " + SB_KEY;
  let r;
  try {
    r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, { method: "POST", headers, body: JSON.stringify(args || {}) });
  } catch (e) {
    throw new Error("Tidak bisa terhubung. Cek koneksi internet lalu coba lagi.");
  }
  const t = await r.text();
  let d; try { d = t ? JSON.parse(t) : null; } catch { d = t; }
  if (!r.ok) {
    const msg = (d && (d.message || d.hint)) || "Server sedang bermasalah";
    throw new Error(msg);
  }
  if (d && typeof d === "object" && !Array.isArray(d) && d.error) throw new Error(d.error);
  return d;
}

const rp = (n) => "Rp" + Math.round(Number(n) || 0).toLocaleString("id-ID");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = (s, el = document) => el.querySelector(s);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

function fmtDate(d) {
  if (!d) return "";
  const x = new Date(d + (String(d).length === 10 ? "T00:00:00" : ""));
  return x.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

let toastTimer;
function toast(msg, bad) {
  let el = $("#toast");
  if (!el) { el = document.createElement("div"); el.id = "toast"; document.body.appendChild(el); }
  el.textContent = msg;
  el.className = "show" + (bad ? " bad" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = ""), 2600);
}

async function copyText(t) {
  try { await navigator.clipboard.writeText(t); toast("Tersalin"); }
  catch {
    const a = document.createElement("textarea"); a.value = t; document.body.appendChild(a);
    a.select(); document.execCommand("copy"); a.remove(); toast("Tersalin");
  }
}

// Rincian per orang dari data tagihan: item yang diklaim, porsi, dan total.
function personBreakdown(bill, personId) {
  const factor = bill.subtotal > 0 ? bill.total / bill.subtotal : 0;
  const lines = [];
  let sub = 0;
  for (const it of bill.items) {
    if (!it.claimers.some((c) => c.id === personId)) continue;
    const n = it.claimers.length;
    const part = it.price / n;
    sub += part;
    lines.push({ name: it.name, n, part });
  }
  return { lines, sub, adj: sub * (factor - 1), owe: Math.round(sub * factor) };
}

function billLink(code) {
  return new URL("./?b=" + code, location.href).href.replace(/admin\.html/, "");
}
