// --------------------------------------------------------------- buat baru
let rows = [];

function parseItems(txt) {
  const out = [];
  txt.split(/\n/).map(s => s.trim()).filter(Boolean).forEach((line) => {
    let qty = 1, name, price, m;
    const parts = line.split("|").map(s => s.trim());
    if (parts.length === 3) [qty, name, price] = parts;
    else if (parts.length === 2) [name, price] = parts;
    else if ((m = line.match(/^(\d+)\s*x\s+(.+?)\s+(?:rp\.?\s*)?([\d.,]+)$/i))) [, qty, name, price] = m;
    else if ((m = line.match(/^(.+?)\s+(?:rp\.?\s*)?([\d.,]+)$/i))) [, name, price] = m;
    qty = parseInt(String(qty).replace(/\D/g, "")) || 1;
    price = parseInt(String(price ?? "").replace(/\D/g, ""));
    if (name && !isNaN(price)) out.push({ qty, name, price });
  });
  return out;
}

// perkecil foto di HP sebelum dikirim (lebih cepat dan hemat kuota)
function shrinkImage(file, maxSide = 1600) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      const d = c.toDataURL("image/jpeg", 0.85); resolve({ data: d.split(",")[1], preview: d });
    };
    img.onerror = () => reject(new Error("Foto tidak bisa dibuka. Coba format JPG atau PNG."));
    img.src = url;
  });
}

async function scanReceipt(file) {
  const box = $("#scanbox");
  // scan butuh sesi pemain (untuk batas harian); admin memakai sesi pemain di HP ini kalau ada
  const scanToken = isAdmin ? store.get("sb_token") : master;
  if (!scanToken) {
    box.innerHTML = `<div class="notice"><span>⚠️</span><div><b>BELUM BISA SCAN</b>Scan struk butuh login sebagai host (nama, HP, PIN). Isi item manual, atau keluar lalu masuk sebagai host.</div></div>`;
    return;
  }
  box.innerHTML = `<div class="loader" style="padding:24px 0"><span class="av">${av("robo")}</span><p>MEMBACA STRUK<span class="blink">...</span></p></div>`;
  try {
    const img = await shrinkImage(file);
    box.innerHTML = `<div class="row" style="align-items:center"><img src="${img.preview}" style="width:72px;height:96px;object-fit:cover;border:var(--b);border-radius:8px">
      <div class="grow"><div class="loader" style="padding:0;text-align:left"><span class="av" style="width:40px;height:40px">${av("robo")}</span><p style="margin-top:8px">MEMBACA STRUK<span class="blink">...</span></p></div></div></div>`;
    const r = await fetch(`${SB_URL}/functions/v1/scan-struk`, {
      method: "POST", headers: { apikey: SB_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ token: scanToken, image: img.data, mime: "image/jpeg" }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) throw new Error(d.error || "Gagal membaca struk");
    rows = d.items.map(i => ({ ...i }));
    if (d.total) $("#total").value = fmtNum(Math.round(d.total));
    if (d.place) { $("#place").value = d.place; if (!$("#title").value) $("#title").value = "Makan di " + d.place; }
    if (/^\d{4}-\d{2}-\d{2}$/.test(d.date || "")) $("#date").value = d.date;
    drawRows();
    const sub = rows.reduce((a, i) => a + i.qty * i.price, 0);
    const warn = d.subtotal && Math.abs(d.subtotal - sub) > 1 ? `<br>⚠️ Subtotal di struk ${rp(d.subtotal)}, hasil bacaan ${rp(sub)}. Cek lagi item yang terlewat atau salah harga.` : "";
    box.innerHTML = `<div class="notice ok" style="margin-top:0"><span>🤖</span><div><b>${rows.length} ITEM TERBACA!</b>Cek lagi nama, jumlah, dan harganya. AI kadang salah baca.${d.notes ? "<br>Catatan: " + esc(d.notes) : ""}${warn}</div></div>
      <button class="sm ghost" id="rescan" style="margin-top:10px">📸 FOTO ULANG</button>`;
    $("#rescan").onclick = () => $("#file").click();
    SFX.ok(); confetti(30);
  } catch (e) {
    box.innerHTML = `<div class="notice"><span>⚠️</span><div><b>GAGAL MEMBACA</b>${esc(e.message)}</div></div><button class="sm ghost" id="rescan" style="margin-top:10px">📸 COBA LAGI</button>`;
    $("#rescan").onclick = () => $("#file").click(); SFX.bad();
  }
}

function drawRows() {
  const el = $("#rows");
  el.innerHTML = rows.map((r, i) => `<div class="row ed" style="gap:6px;margin-top:8px" data-i="${i}">
      <input data-f="qty" inputmode="numeric" value="${r.qty}" style="width:48px;text-align:center">
      <input data-f="name" value="${esc(r.name)}" placeholder="Nama item" class="grow">
      <span class="money sm" style="width:112px;flex:none"><input data-f="price" inputmode="numeric" value="${fmtNum(r.price)}" placeholder="Harga" style="text-align:right"></span>
      <button class="sm danger" data-del="${i}" aria-label="Hapus item">✕</button></div>`).join("") ||
    `<p class="small muted" style="margin:6px 0 0">Belum ada item. Scan struk atau tambah manual.</p>`;
  el.querySelectorAll("input").forEach(inp => inp.oninput = () => {
    const i = +inp.closest("[data-i]").dataset.i, f = inp.dataset.f;
    if (f === "price") inp.value = fmtNum(inp.value);
    rows[i][f] = f === "name" ? inp.value : numOf(inp.value) || 0;
    updTotals();
  });
  el.querySelectorAll("[data-del]").forEach(b => b.onclick = () => { rows.splice(+b.dataset.del, 1); drawRows(); });
  updTotals();
}

function updTotals() {
  const sub = rows.reduce((a, i) => a + (i.qty || 1) * (i.price || 0), 0);
  const tot = parseInt($("#total").value.replace(/\D/g, ""));
  let h = rows.length ? `Subtotal item: <b>${rp(sub)}</b>` : "";
  if (sub && tot) {
    const d = tot - sub;
    h += d === 0 ? " · tanpa pajak atau service." :
      `<br>${d > 0 ? "Pajak & service" : "Diskon"}: <b>${rp(Math.abs(d))}</b> (${(Math.abs(d) / sub * 100).toFixed(1).replace(".", ",")}% dari subtotal), dibagi sebanding ke tiap orang.`;
  }
  $("#adj").innerHTML = h;
}

async function renderNew() {
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const pn = isAdmin ? store.get("sb_payer_name") || "" : me.name;
  const pp = isAdmin ? store.get("sb_payer_phone") || "" : "0" + String(me.phone).replace(/^62/, "");
  rows = [];
  app.innerHTML = `<h1>TAGIHAN BARU</h1>
  <div class="card"><span class="label gold">FOTO STRUK</span>
    <p class="small muted" style="margin-top:8px">Foto struknya, AI akan membaca item dan totalnya. Pastikan struk lurus, terang, dan terlihat utuh.</p>
    <input type="file" id="file" accept="image/*" class="hide">
    <div id="scanbox"><button class="block gold" id="pick">📸 FOTO / PILIH STRUK</button></div>
  </div>
  <div class="card"><span class="label">DAFTAR ITEM</span>
    <div class="row small muted" style="gap:6px;margin-top:10px;font-family:var(--px);font-size:7px"><span style="width:48px;text-align:center">QTY</span><span class="grow">NAMA</span><span style="width:112px;text-align:right">HARGA SATUAN</span><span style="width:30px"></span></div>
    <div id="rows"></div>
    <div class="row" style="gap:8px;margin-top:12px"><button class="sm soft" id="addRow">+ TAMBAH ITEM</button><button class="sm ghost" id="pasteBtn">TEMPEL TEKS</button></div>
    <div id="pasteBox" class="hide"><textarea id="items" style="margin-top:10px" placeholder="2 | Nasi Goreng | 25000&#10;3 | Es Teh | 5000"></textarea>
      <button class="sm" id="pasteGo" style="margin-top:8px">MASUKKAN</button></div>
    <label>TOTAL AKHIR STRUK</label><div class="small muted" style="margin:-4px 0 8px">Sudah termasuk pajak, service, dan diskon.</div>
    <div class="money"><input id="total" inputmode="numeric" placeholder="Contoh 167.475"></div>
    <div id="adj" class="small muted" style="margin-top:8px"></div>
  </div>
  <div class="card"><span class="label">INFO TAGIHAN</span>
    <label>JUDUL</label><input id="title" placeholder="Makan malam">
    <div class="row"><div class="grow"><label>TEMPAT</label><input id="place"></div>
    <div class="grow"><label>TANGGAL</label><input id="date" type="date" value="${today}"></div></div>
  </div>
  <div class="card"><span class="label">PENALANG</span>
    <p class="small muted" style="margin-top:8px">Orang yang membayar ke kasir. Teman akan transfer ke sini.</p>
    <label>NAMA</label><input id="pn" value="${esc(pn)}">
    <label>NOMOR HP</label><input id="pp" inputmode="tel" value="${esc(pp)}">
    <label>INFO TRANSFER</label><textarea id="pi" style="min-height:80px" placeholder="BCA 1234567890 a.n. Nama&#10;DANA 08xxxx">${esc(store.get("sb_payer_info") || "")}</textarea>
  </div>
  <button class="block gold" id="create" style="margin-top:20px">▶ BUAT TAGIHAN</button>`;
  drawRows();
  $("#pick").onclick = () => $("#file").click();
  $("#file").onchange = (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) scanReceipt(f); };
  moneyInput($("#total"), updTotals);
  $("#addRow").onclick = () => { rows.push({ qty: 1, name: "", price: 0 }); drawRows(); const ins = $("#rows").querySelectorAll('[data-f="name"]'); ins[ins.length - 1].focus(); };
  $("#pasteBtn").onclick = () => $("#pasteBox").classList.toggle("hide");
  $("#pasteGo").onclick = () => { const p = parseItems($("#items").value); if (!p.length) return toast("Teks belum terbaca", true); rows.push(...p); $("#items").value = ""; $("#pasteBox").classList.add("hide"); drawRows(); };
  $("#create").onclick = async (e) => {
    const items = rows.filter(r => r.name.trim()).map(r => ({ qty: r.qty || 1, name: r.name.trim(), price: r.price || 0 }));
    const tot = parseInt($("#total").value.replace(/\D/g, ""));
    if (!items.length) return toast("Daftar item masih kosong", true);
    if (items.some(i => !i.price)) return toast("Ada item yang harganya belum diisi. Hapus kalau gratis.", true);
    if (isNaN(tot)) return toast("Isi total akhir struk", true);
    if (isAdmin) { store.set("sb_payer_name", $("#pn").value.trim()); store.set("sb_payer_phone", $("#pp").value.trim()); }
    store.set("sb_payer_info", $("#pi").value.trim());
    e.target.disabled = true; e.target.textContent = "MEMBUAT...";
    try {
      const b = await rpc("sb_admin_create_bill", { p_master: master, p_title: $("#title").value, p_place: $("#place").value,
        p_date: $("#date").value || null, p_total: tot, p_items: items,
        p_payer_name: $("#pn").value, p_payer_phone: $("#pp").value, p_payment_info: $("#pi").value });
      SFX.ok(); store.set("sb_fresh", b.code); location.href = "admin.html?b=" + b.code;
    } catch (err) { toast(err.message, true); e.target.disabled = false; e.target.textContent = "▶ BUAT TAGIHAN"; }
  };
}

// Jangan segarkan halaman saat host sedang mengetik atau mengubah sesuatu.
function isBusy() {
  if (editing || tab === "set") return true;
  const a = document.activeElement;
  if (a && app.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return true;
  return ["#nName", "#nPrice"].some(sel => { const el = $(sel); return el && el.value.trim(); });
}
