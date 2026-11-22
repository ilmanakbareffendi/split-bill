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

// format angka rupiah di kolom isian: 138600 -> "138.600"
const fmtNum = (n) => { n = parseInt(String(n ?? "").replace(/\D/g, "")); return isNaN(n) ? "" : n.toLocaleString("id-ID"); };
const numOf = (s) => parseInt(String(s ?? "").replace(/\D/g, ""));
function moneyInput(el, after) {
  el.addEventListener("input", () => { el.value = fmtNum(el.value); if (after) after(); });
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
  if (bad && typeof SFX !== "undefined") SFX.bad();
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

// ------------------------------------------------------------------ efek game
const SFX = {
  on: store.get("sb_sound") !== "off",
  ctx: null,
  tone(freqs, dur = 0.07, type = "square", vol = 0.05) {
    if (!this.on) return;
    try {
      this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)();
      let t = this.ctx.currentTime;
      for (const f of freqs) {
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.type = type; o.frequency.value = f;
        g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t + dur);
        t += dur * 0.9;
      }
    } catch {}
  },
  coin() { this.tone([1047, 1319, 1568], 0.05); },
  drop() { this.tone([440, 330], 0.06, "triangle"); },
  select() { this.tone([660, 880], 0.05); },
  ok() { this.tone([523, 659, 784, 1047], 0.09); },
  bad() { this.tone([180, 140], 0.12, "sawtooth", 0.04); },
  start() { this.tone([392, 523, 659, 784, 659, 784, 1047], 0.08); },
  toggle() { this.on = !this.on; store.set("sb_sound", this.on ? "on" : "off"); if (this.on) this.select(); return this.on; },
};

// ikon speaker pixel: menyala dengan gelombang suara, mati dengan tanda silang
const SPEAKER_ON = '<svg viewBox="0 0 12 10" width="16" height="14" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="M0 3h2v4H0zM2 2h1v6H2zM3 1h1v8H3zM4 0h1v10H4zM7 3h1v4H7zM9 1h1v8H9zM8 2h1v1H8zM8 7h1v1H8zM10 2h1v6h-1z"/></svg>';
const SPEAKER_OFF = '<svg viewBox="0 0 12 10" width="16" height="14" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="M0 3h2v4H0zM2 2h1v6H2zM3 1h1v8H3zM4 0h1v10H4zM7 3h1v1H7zM8 4h1v1H8zM9 5h1v1H9zM10 6h1v1h-1zM10 3h1v1h-1zM9 4h1v1H9zM8 5h1v1H8zM7 6h1v1H7z"/></svg>';
function soundButton(el) {
  const paint = () => {
    el.innerHTML = (SFX.on ? SPEAKER_ON : SPEAKER_OFF) + `<span>${SFX.on ? "ON" : "OFF"}</span>`;
    el.setAttribute("aria-label", SFX.on ? "Matikan suara" : "Nyalakan suara");
    el.classList.toggle("off", !SFX.on);
  };
  paint(); el.onclick = () => { SFX.toggle(); paint(); };
}

function floatText(x, y, text, minus) {
  const d = document.createElement("div");
  d.className = "fx" + (minus ? " minus" : ""); d.textContent = text;
  d.style.left = x + "px"; d.style.top = y + "px";
  document.body.appendChild(d); setTimeout(() => d.remove(), 950);
}

function sparks(x, y, n = 8) {
  for (let i = 0; i < n; i++) {
    const s = document.createElement("i"); s.className = "spark";
    const a = (Math.PI * 2 * i) / n, r = 34 + Math.random() * 18;
    s.style.left = x + "px"; s.style.top = y + "px";
    s.style.setProperty("--dx", Math.cos(a) * r + "px"); s.style.setProperty("--dy", Math.sin(a) * r + "px");
    if (i % 2) s.style.background = "#4ade80";
    document.body.appendChild(s); setTimeout(() => s.remove(), 650);
  }
}

function confetti(n = 70) {
  const cols = ["#ffc400", "#4ade80", "#15803d", "#6a2bc2", "#ff8fab", "#2ec4b6"];
  for (let i = 0; i < n; i++) {
    const c = document.createElement("i"); c.className = "confetti";
    c.style.left = Math.random() * 100 + "vw"; c.style.background = cols[i % cols.length];
    c.style.animationDuration = 1.6 + Math.random() * 1.6 + "s"; c.style.animationDelay = Math.random() * 0.4 + "s";
    document.body.appendChild(c); setTimeout(() => c.remove(), 3800);
  }
}

function stamp(text) {
  const s = document.createElement("div"); s.className = "stamp";
  s.innerHTML = `<div>${text}</div>`; document.body.appendChild(s); setTimeout(() => s.remove(), 1900);
}

function bgCoins(n = 9) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const w = document.createElement("div"); w.id = "bgcoins";
  for (let i = 0; i < n; i++) {
    const c = document.createElement("i");
    c.style.left = Math.random() * 100 + "vw";
    c.style.animationDuration = 14 + Math.random() * 14 + "s";
    c.style.animationDelay = -Math.random() * 28 + "s";
    w.appendChild(c);
  }
  document.body.prepend(w);
}

// angka berjalan (seperti skor game)
function countUp(el, to) {
  const from = Number(el.dataset.v || 0); el.dataset.v = to;
  if (from === to) { el.textContent = rp(to); return; }
  el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop");
  const t0 = performance.now(), d = 450;
  const step = (t) => {
    const k = Math.min(1, (t - t0) / d), v = from + (to - from) * (1 - Math.pow(1 - k, 3));
    el.textContent = rp(v); if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
