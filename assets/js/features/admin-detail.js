// --------------------------------------------------------------- detail
async function loadBill(silent) {
  try {
    const b = await rpc("sb_admin_get", { p_master: master, p_code: code });
    const j = JSON.stringify(b);
    if (silent && j === lastJson) return;
    lastJson = j; bill = b;
    if (!isBusy() || !silent) renderBill();
    if (!silent && store.get("sb_fresh") === code) { store.del("sb_fresh"); confetti(50); stamp("LEVEL<br>DIBUAT!"); }
  } catch (e) { if (!silent) app.innerHTML = `<div class="card">${esc(e.message)}</div>`; }
}

function waText(m) {
  const br = personBreakdown(bill, m.id);
  const adjLabel = bill.adjust > 0 ? "Pajak & service" : "Diskon";
  let t = `Halo ${m.name}, ini rincian bagianmu untuk *${bill.title}*${bill.bill_date ? " (" + fmtDate(bill.bill_date) + ")" : ""}:\n\n`;
  t += br.lines.map(l => `• ${l.name}${l.n > 1 ? " (dibagi " + l.n + ")" : ""}: ${rp(l.part)}`).join("\n");
  t += `\n\nSubtotal: ${rp(br.sub)}`;
  if (Math.round(br.adj)) t += `\n${adjLabel}: ${rp(Math.abs(br.adj))}`;
  t += `\n*Total: ${rp(br.owe)}*`;
  if (bill.payment_info) t += `\n\nTransfer ke:\n${bill.payment_info}`;
  t += `\n\nRincian lengkap dan tombol konfirmasi transfer:\n${billLink(bill.code)}\n\nTerima kasih!`;
  return t;
}

function groupText() {
  return `Halo semua! Tagihan *${bill.title}* sudah bisa dibagi.\n\n1. Buka link ini\n2. Masuk pakai nama, nomor HP, dan PIN 4 angka\n3. Centang pesanan masing-masing (yang patungan centang juga)\n\nTotal per orang langsung terhitung, termasuk pajak dan service.\n${billLink(bill.code)}`;
}

function recapText() {
  let t = `*Rekap ${bill.title}*\nTotal struk: ${rp(bill.total)}\n\n`;
  t += bill.members.map(m => `${m.is_payer ? "💳" : m.status === "lunas" ? "✅" : m.status === "sudah_transfer" ? "🕒" : "⬜"} ${m.name}: ${rp(m.owe)}${m.is_payer ? " (penalang)" : ""}`).join("\n");
  if (bill.unclaimed > 0) t += `\n\n⚠️ Belum diklaim: ${rp(bill.unclaimed_owe)}`;
  return t + `\n\n${billLink(bill.code)}`;
}

// ceklis bayar: ketuk untuk menandai lunas, ketuk lagi untuk membatalkan
function payBox(m) {
  if (m.is_payer) return '<span class="tag pay">PENALANG</span>';
  if (m.status === "lunas") return `<button class="paybox on" data-pay="${m.id}" data-to="belum"><span class="pb">✓</span>LUNAS</button>`;
  if (m.status === "sudah_transfer") return `<button class="paybox wait" data-pay="${m.id}" data-to="lunas"><span class="pb"></span>CEK &amp; CENTANG</button>`;
  return `<button class="paybox" data-pay="${m.id}" data-to="lunas"><span class="pb"></span>BELUM BAYAR</button>`;
}

function renderBill() {
  const y = window.scrollY;
  const claimedOwe = bill.members.reduce((a, m) => a + m.owe, 0);
  const lunas = bill.members.filter(m => m.status === "lunas" || m.is_payer).length;
  let h = `${bill.done_at ? '<span class="tag ok" style="margin-top:14px">🏁 SELESAI</span>' : ""}<h1>${esc(bill.title)}</h1><div class="sub">${esc([bill.place, fmtDate(bill.bill_date)].filter(Boolean).join(" · "))} · Kode <b class="px" style="font-size:11px">${bill.code}</b></div>
  <div class="card"><span class="label gold">LINK UNTUK PARTY</span>
    <div class="strong" style="word-break:break-all;margin:8px 0 12px">${esc(billLink(bill.code))}</div>
    <div class="row"><button class="soft grow" id="cpLink">SALIN LINK</button>
    <a class="btn wa grow" target="_blank" href="https://wa.me/?text=${encodeURIComponent(groupText())}">KIRIM KE WA</a></div>
    ${!isAdmin ? `<a class="btn block gold" href="./?b=${bill.code}" style="margin-top:10px">🍽️ PILIH PESANANKU</a>` : ""}</div>
  <div class="row" style="margin-top:14px;gap:8px">
    <div class="stat gold"><div class="k">STRUK</div><div class="v num">${rp(bill.total)}</div></div>
    <div class="stat"><div class="k">TERKLAIM</div><div class="v num">${rp(claimedOwe)}</div></div>
    <div class="stat"><div class="k">LUNAS</div><div class="v">${lunas}/${bill.members.length}</div></div></div>
  <div class="hpbar"><i style="width:${bill.total > 0 ? Math.min(100, Math.round(claimedOwe / bill.total * 100)) : 0}%"></i></div>`;
  if (bill.unclaimed > 0) h += `<div class="notice"><span>⚠️</span><div><b>ITEM TERSISA</b>Senilai ${rp(bill.unclaimed)} (${rp(bill.unclaimed_owe)} setelah pajak) belum diklaim siapa pun.</div></div>`;
  else if (bill.items.length) h += `<div class="notice ok"><span>🏆</span><div><b>SEMUA ITEM DIKLAIM!</b>Tagihan semua pemain pas dengan total struk.</div></div>`;
  if (bill.locked) h += `<div class="notice"><span>🔒</span><div><b>DIKUNCI</b>Teman tidak bisa mengubah pilihan atau bergabung.</div></div>`;

  h += `<div class="tabs">${[["rekap", "PARTY"], ["items", "ITEM"], ["set", "SETELAN"]].map(([k, l]) => `<button class="sm ${tab === k ? "on" : ""}" data-tab="${k}">${l}</button>`).join("")}</div>`;

  if (tab === "rekap") {
    const debtors = bill.members.filter(m => !m.is_payer);
    const waiting = debtors.filter(m => m.status === "sudah_transfer").length;
    h += `<div class="card"><span class="label">CEKLIS BAYAR (${debtors.filter(m => m.status === "lunas").length}/${debtors.length})</span>
      <div class="row between" style="margin-top:6px"><span class="small muted">${waiting ? `<b style="color:var(--gold-ink)">${waiting} orang bilang sudah transfer.</b> Cek rekeningmu, lalu centang.` : "Ketuk kotak untuk menandai lunas. Ketuk lagi untuk membatalkan."}</span>
      <button class="sm soft" id="cpRecap">SALIN REKAP</button></div>`;
    if (!bill.members.length) h += `<p class="muted">Belum ada yang gabung. Bagikan link di atas.</p>`;
    for (const m of bill.members) {
      const br = personBreakdown(bill, m.id);
      h += `<div class="player">
        <div class="row between"><span class="av bob" style="animation-delay:${(m.name.length % 5) * .2}s">${av(m.avatar)}</span><div class="grow"><div class="strong" style="font-size:18px">${esc(m.name)}</div><div class="small muted">+${esc(m.phone || "")} · ${br.lines.length} item</div></div>
        <div style="text-align:right"><div class="px num" style="font-size:11px">${rp(m.owe)}</div></div></div>
        <div class="small muted" style="margin-top:4px">${br.lines.map(l => esc(l.name) + (l.n > 1 ? " ÷" + l.n : "")).join(", ") || "Belum memilih item"}</div>
        <div class="row between" style="margin-top:8px">${payBox(m)}
          <div class="act">${!m.is_payer && m.owe > 0 && m.status !== "lunas" ? `<a class="btn wa sm" target="_blank" href="https://wa.me/${m.phone}?text=${encodeURIComponent(waText(m))}">TAGIH WA</a>` : ""}
          <button class="sm ghost" data-more="${m.id}">•••</button></div></div>
        <div class="act hide" id="more-${m.id}" style="margin-top:8px">
          <button class="sm ghost" data-reset="${m.id}">RESET PIN</button>
          <button class="sm danger" data-rm="${m.id}">KELUARKAN</button></div></div>`;
    }
    h += `</div>`;
  }

  if (tab === "items") {
    h += `<div class="card"><span class="label">ITEM (${bill.items.length})</span><div class="small muted" style="margin-top:4px">Subtotal ${rp(bill.subtotal)}</div>`;
    for (const it of bill.items) {
      h += `<div class="row between" style="border-top:2px dashed var(--line);padding:10px 0" id="it-${it.id}">
        <div class="grow"><div class="strong">${esc(it.name)}</div>
        <div class="small ${it.claimers.length ? "muted" : "err"}">${it.claimers.length ? it.claimers.map(c => esc(c.name)).join(", ") : "Belum diklaim"}</div></div>
        <div style="text-align:right"><div class="num">${rp(it.price)}</div>
        <div class="act" style="margin-top:4px"><button class="sm ghost" data-edit="${it.id}">UBAH</button><button class="sm danger" data-del="${it.id}">HAPUS</button></div></div></div>`;
    }
    h += `<div class="row ed" style="margin-top:12px;gap:6px"><input id="nName" placeholder="Nama item" class="grow"><span class="money sm" style="width:120px;flex:none"><input id="nPrice" placeholder="Harga" inputmode="numeric"></span><button class="sm" id="add">+ TAMBAH</button></div>
      <p class="small muted" style="margin-bottom:0">Kalau subtotal berubah, pajak tetap dihitung dari total akhir struk di tab SETELAN.</p></div>`;
  }

  if (tab === "set") {
    h += `<div class="card"><span class="label">INFO TAGIHAN</span>
      <label>JUDUL</label><input id="sTitle" value="${esc(bill.title)}">
      <div class="row"><div class="grow"><label>TEMPAT</label><input id="sPlace" value="${esc(bill.place || "")}"></div>
      <div class="grow"><label>TANGGAL</label><input id="sDate" type="date" value="${esc(bill.bill_date || "")}"></div></div>
      <label>TOTAL AKHIR STRUK</label><div class="money"><input id="sTotal" inputmode="numeric" value="${fmtNum(Math.round(bill.total))}"></div>
      <label>NAMA PENALANG</label><input id="sPn" value="${esc(bill.payer_name || "")}">
      <label>HP PENALANG</label><input id="sPp" inputmode="tel" value="${esc(bill.payer_phone || "")}">
      <label>INFO TRANSFER</label><textarea id="sPi" style="min-height:80px;font-family:inherit">${esc(bill.payment_info || "")}</textarea>
      <button class="block" id="saveSet" style="margin-top:16px">SIMPAN</button></div>
      <div class="card"><span class="label">KUNCI TAGIHAN</span><p class="small muted" style="margin-top:8px">Kunci setelah semua pilihan beres. Teman tetap bisa melihat dan konfirmasi transfer.</p>
      <button class="block ${bill.locked ? "soft" : "gold"}" id="lock">${bill.locked ? "🔓 BUKA KUNCI" : "🔒 KUNCI TAGIHAN"}</button></div>`;
  }
  const debtorsAll = bill.members.filter(m => !m.is_payer);
  const unpaid = debtorsAll.filter(m => m.status !== "lunas").length;
  if (bill.done_at) {
    h += `<div class="card" style="background:var(--soft)"><span class="label gold">🏁 SELESAI</span>
      <p style="margin:10px 0 12px">Tagihan ini sudah ditandai selesai pada ${esc(new Date(bill.done_at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }))}. Pilihan teman terkunci.</p>
      <button class="block ghost" id="undone">↺ BUKA LAGI</button></div>`;
  } else {
    h += `<div class="card"><span class="label">SELESAIKAN TAGIHAN</span>
      <p class="small muted" style="margin-top:8px">${unpaid ? `Masih ada <b>${unpaid} orang</b> yang belum lunas. Kamu tetap bisa menandai selesai kalau sudah beres di luar aplikasi.` : debtorsAll.length ? "Semua sudah lunas! Tandai selesai supaya tagihan terkunci dan pindah ke arsip." : "Belum ada teman yang bergabung."}</p>
      <button class="block ${unpaid || !debtorsAll.length ? "ghost" : "gold"}" id="done">🏁 TANDAI SELESAI</button></div>`;
  }
  h += `<div class="card"><span class="label">HAPUS TAGIHAN</span><p class="small muted" style="margin-top:8px">Menghapus tagihan ini beserta semua pilihan teman. Tidak bisa dibatalkan. Hanya host tagihan ini dan admin yang bisa menghapus.</p>
    <button class="block danger" id="delBill">🗑️ HAPUS TAGIHAN</button></div>`;
  h += `<p style="text-align:center;margin-top:20px"><a href="admin.html" class="px" style="color:var(--acc);font-size:9px">◀ DAFTAR TAGIHAN</a></p>${CREDIT}`;
  app.innerHTML = h;
  window.scrollTo(0, y);
  bind();
}

async function act(fn, args, msg) {
  try { bill = await rpc(fn, { p_master: master, p_code: code, ...args }); lastJson = JSON.stringify(bill); renderBill(); if (msg) { toast(msg); SFX.coin(); } return true; }
  catch (e) { toast(e.message, true); return false; }
}

// tombol berbahaya: ketuk dua kali untuk konfirmasi (tanpa dialog browser)
function twoTap(btn, label, fn) {
  if (btn.dataset.armed) return fn();
  const old = btn.textContent; btn.dataset.armed = 1; btn.textContent = label;
  setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.textContent = old; } }, 3000);
}

function bind() {
  app.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => { tab = b.dataset.tab; editing = false; renderBill(); });
  const cl = $("#cpLink"); if (cl) cl.onclick = () => copyText(billLink(bill.code));
  const cr = $("#cpRecap"); if (cr) cr.onclick = () => copyText(recapText());
  app.querySelectorAll("[data-pay]").forEach(b => b.onclick = async () => {
    const before = bill.members.filter(m => !m.is_payer && m.status !== "lunas").length;
    b.disabled = true;
    if (!(await act("sb_admin_set_status", { p_person: b.dataset.pay, p_status: b.dataset.to }))) return;
    const after = bill.members.filter(m => !m.is_payer && m.status !== "lunas").length;
    if (b.dataset.to === "lunas") { SFX.coin(); toast("Ditandai lunas ✓"); } else { SFX.drop(); toast("Dibatalkan"); }
    if (before > 0 && after === 0 && !bill.done_at) { SFX.ok(); confetti(60); stamp("SEMUA<br>LUNAS!"); }
  });
  const dn = $("#done"); if (dn) dn.onclick = () => twoTap(dn, "KETUK LAGI UNTUK SELESAI", async () => {
    if (await act("sb_admin_update_bill", { p_patch: { done: true } })) { SFX.ok(); confetti(50); stamp("TAGIHAN<br>SELESAI!"); }
  });
  const ud = $("#undone"); if (ud) ud.onclick = () => act("sb_admin_update_bill", { p_patch: { done: false } }, "Tagihan dibuka lagi");
  app.querySelectorAll("[data-more]").forEach(b => b.onclick = () => $("#more-" + b.dataset.more).classList.toggle("hide"));
  app.querySelectorAll("[data-reset]").forEach(b => b.onclick = () => twoTap(b, "YAKIN?", async () => {
    try { await rpc("sb_admin_reset_pin", { p_master: master, p_person: b.dataset.reset }); toast("PIN direset. Teman bisa membuat PIN baru saat masuk."); }
    catch (e) { toast(e.message, true); }
  }));
  app.querySelectorAll("[data-rm]").forEach(b => b.onclick = () => twoTap(b, "YAKIN?", () => act("sb_admin_remove_member", { p_person: b.dataset.rm }, "Peserta dikeluarkan")));
  app.querySelectorAll("[data-del]").forEach(b => b.onclick = () => twoTap(b, "YAKIN?", () => act("sb_admin_item", { p_action: "delete", p_item_id: b.dataset.del }, "Item dihapus")));
  app.querySelectorAll("[data-edit]").forEach(b => b.onclick = () => {
    const it = bill.items.find(i => i.id === b.dataset.edit); editing = true;
    const row = $("#it-" + it.id);
    row.innerHTML = `<div class="ed grow" style="background:var(--gold-soft);border:var(--b);border-radius:10px;padding:10px">
      <label style="margin-top:0">NAMA ITEM</label><input id="eN" value="${esc(it.name)}">
      <label>HARGA</label><div class="money"><input id="eP" inputmode="numeric" value="${fmtNum(Math.round(it.price))}"></div>
      <div class="row" style="gap:8px;margin-top:12px"><button class="grow" id="eS">SIMPAN</button><button class="ghost grow" id="eC">BATAL</button></div></div>`;
    $("#eN").focus();
    moneyInput($("#eP"));
    $("#eC").onclick = () => { editing = false; renderBill(); };
    $("#eS").onclick = () => {
      const price = numOf($("#eP").value);
      if (!$("#eN").value.trim() || isNaN(price)) return toast("Isi nama dan harga", true);
      editing = false; act("sb_admin_item", { p_action: "update", p_item_id: it.id, p_name: $("#eN").value, p_price: price }, "Item diperbarui");
    };
  });
  ["#sTotal", "#nPrice"].forEach(s => { const el = $(s); if (el) moneyInput(el); });
  const add = $("#add"); if (add) add.onclick = () => {
    const n = $("#nName").value.trim(), p = parseInt($("#nPrice").value.replace(/\D/g, ""));
    if (!n || isNaN(p)) return toast("Isi nama dan harga", true);
    act("sb_admin_item", { p_action: "add", p_name: n, p_price: p }, "Item ditambahkan");
  };
  if (tab === "set" || tab === "items") app.querySelectorAll("input, textarea").forEach(i => { i.onfocus = () => (editing = true); });
  const ss = $("#saveSet"); if (ss) ss.onclick = () => {
    const tot = numOf($("#sTotal").value);
    if (!tot) return toast("Total akhir struk wajib diisi", true);
    editing = false; act("sb_admin_update_bill", { p_patch: {
    title: $("#sTitle").value, place: $("#sPlace").value, bill_date: $("#sDate").value, total: tot,
    payer_name: $("#sPn").value, payer_phone: $("#sPp").value, payment_info: $("#sPi").value } }, "Tersimpan"); };
  const lk = $("#lock"); if (lk) lk.onclick = () => act("sb_admin_update_bill", { p_patch: { locked: !bill.locked } }, bill.locked ? "Kunci dibuka" : "Tagihan dikunci");
  const db = $("#delBill"); if (db) db.onclick = () => twoTap(db, "KETUK LAGI UNTUK HAPUS", async () => {
    try { await rpc("sb_admin_delete_bill", { p_master: master, p_code: code }); location.href = "admin.html"; } catch (e) { toast(e.message, true); }
  });
}
