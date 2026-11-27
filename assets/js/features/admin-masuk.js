const app = $("#app");
// auth = kunci admin (semua tagihan) atau token sesi host (tagihan sendiri)
let isAdmin = !!store.get("sb_master");
let master = store.get("sb_master") || store.get("sb_token");
let me = null;
const qs = new URLSearchParams(location.search);
const code = (qs.get("b") || "").toUpperCase();
const isNew = qs.has("new");
let bill = null, editing = false, tab = "rekap", lastJson = "";
let pickAv = store.get("sb_avatar") || AVATAR_KEYS[Math.floor(Math.random() * AVATAR_KEYS.length)];

soundButton($("#snd")); bgCoins(6);
app.innerHTML = `<div class="loader"><span class="av">${av("robo")}</span><p>MEMUAT<span class="blink">...</span></p></div>`;
$("#out").onclick = () => { store.del("sb_master"); store.del("sb_token"); location.href = "admin.html"; };

async function start() {
  if (!master) return renderLogin();
  try {
    if (isAdmin) { if (!(await rpc("sb_admin_check", { p_master: master }))) throw 0; }
    else { me = await rpc("sb_whoami", { p_token: master }); if (!me) throw 0; }
  } catch {
    store.del(isAdmin ? "sb_master" : "sb_token"); master = null; isAdmin = false; return renderLogin();
  }
  $("#out").classList.remove("hide");
  $(".brand").innerHTML = isAdmin ? `<span class="logo">%</span> ADMIN` : `<span class="av" style="width:30px;height:30px">${av(me.avatar)}</span> ${esc(me.name.toUpperCase().slice(0, 14))}`;
  if (isNew) return renderNew();
  if (code) { await loadBill(); setInterval(() => { if (!isBusy() && document.visibilityState === "visible") loadBill(true); }, 6000); return; }
  renderList();
}

function renderLogin(adminMode) {
  if (adminMode) {
    app.innerHTML = `<div class="card title-card"><h1>ADMIN</h1><p class="sub" style="margin-top:0">Kunci admin bisa melihat semua tagihan.</p>
      <label style="text-align:left">KUNCI ADMIN</label><input id="k" type="password" autocomplete="current-password">
      <button class="block gold" id="go" style="margin-top:14px">▶ MASUK</button>
      <p class="small" style="margin-bottom:0"><button class="link" id="back">Kembali ke login biasa</button></p></div>`;
    $("#back").onclick = () => renderLogin();
    $("#go").onclick = async () => {
      const k = $("#k").value.trim();
      try {
        if (await rpc("sb_admin_check", { p_master: k })) { store.set("sb_master", k); master = k; isAdmin = true; SFX.start(); start(); }
        else toast("Kunci admin salah", true);
      } catch (e) { toast(e.message, true); }
    };
    return;
  }
  app.innerHTML = `<div class="card title-card"><div class="party">${AVATAR_KEYS.map(k => `<span class="av bob">${av(k)}</span>`).join("")}</div>
    <h1>SPLIT BILL<br>TONGKRONGAN!!</h1>
    <span class="tag wait" style="font-size:9px;margin:4px 0 8px">🎮 JADI HOST</span>
    <p class="sub" style="margin-top:4px">Masuk untuk membuat tagihan dan menagih teman. Pakai nomor dan PIN yang sama kalau sudah pernah main.</p></div>
    <div class="card"><span class="label">PILIH KARAKTER</span><div style="height:12px"></div>
    <div class="chars">${AVATAR_KEYS.map(k => `<div class="char ${k === pickAv ? "on" : ""}" data-av="${k}"><span class="av">${av(k)}</span><div class="nm">${esc(AVATARS[k].name.split(" ")[0])}</div></div>`).join("")}</div>
    <div class="charname" id="cname">${esc(AVATARS[pickAv].name.toUpperCase())}</div></div>
    <div class="card"><span class="label">DATA HOST</span>
    <label>NAMA</label><input id="nm" maxlength="40" autocomplete="name" value="${esc(store.get("sb_name") || "")}">
    <label>NOMOR HP (WA)</label><input id="ph" inputmode="tel" autocomplete="tel" placeholder="08xxxxxxxxxx" value="${esc(store.get("sb_phone") || "")}">
    <label>PIN RAHASIA (4 ANGKA)</label><input id="pin" class="pin" inputmode="numeric" maxlength="4" type="password" placeholder="····">
    <button class="block gold" id="go" style="margin-top:16px">▶ MASUK</button>
    <p class="small" style="margin-bottom:0;text-align:center"><button class="link" id="adm">Masuk dengan kunci admin</button></p></div>
    <p style="text-align:center;margin-top:18px"><a href="./" class="px" style="color:var(--acc);font-size:9px">◀ BERANDA</a></p>${CREDIT}`;
  app.querySelectorAll(".char").forEach(el => el.onclick = () => {
    pickAv = el.dataset.av; SFX.select();
    app.querySelectorAll(".char").forEach(c => c.classList.toggle("on", c === el));
    $("#cname").textContent = AVATARS[pickAv].name.toUpperCase();
  });
  $("#pin").addEventListener("input", (e) => (e.target.value = e.target.value.replace(/\D/g, "").slice(0, 4)));
  $("#adm").onclick = () => renderLogin(true);
  $("#go").onclick = async (e) => {
    const nm = $("#nm").value.trim(), ph = $("#ph").value.trim(), pin = $("#pin").value;
    if (!nm) return toast("Isi nama dulu", true);
    if (pin.length !== 4) return toast("PIN harus 4 angka", true);
    e.target.disabled = true;
    try {
      const r = await rpc("sb_login", { p_name: nm, p_phone: ph, p_pin: pin, p_avatar: pickAv });
      store.set("sb_token", r.token); store.set("sb_name", nm); store.set("sb_phone", ph); store.set("sb_avatar", pickAv);
      master = r.token; isAdmin = false; SFX.start(); start();
    } catch (err) { toast(err.message, true); e.target.disabled = false; }
  };
}

async function renderList() {
  let list = [];
  try { list = await rpc("sb_admin_list", { p_master: master }); } catch (e) { return toast(e.message, true); }
  let h = `<h1>${isAdmin ? "SEMUA TAGIHAN" : "TAGIHANKU"}</h1><p class="sub">Foto struknya, cek hasil bacaannya, lalu bagikan link ke teman.</p>
    <a class="btn block gold" href="admin.html?new" style="margin-top:14px">📸 TAGIHAN BARU</a>`;
  if (!list.length) h += `<div class="card muted">Belum ada tagihan. Tekan tombol di atas untuk mulai.</div>`;
  const active = list.filter(b => !b.done_at), done = list.filter(b => b.done_at);
  const row = (b) => {
    const paid = b.members > 0 && b.lunas >= b.members;
    h += `<a class="card billrow ${b.done_at ? "archived" : ""}" href="admin.html?b=${b.code}"><div class="row between">
      <div class="grow"><div class="strong">${esc(b.title)}</div><div class="small muted">${esc([b.place, fmtDate(b.bill_date), isAdmin && b.host ? "host " + b.host : ""].filter(Boolean).join(" · "))}</div></div>
      <div style="text-align:right"><div class="px num" style="font-size:10px">${rp(b.total)}</div>
      <div class="small" style="margin-top:6px">${b.done_at ? '<span class="tag ok">🏁 SELESAI</span>' : `${b.locked ? '<span class="tag">🔒</span> ' : ""}<span class="tag ${paid ? "ok" : "wait"}">${b.lunas}/${b.members} LUNAS${paid ? " ★" : ""}</span>`}</div></div></div></a>`;
  };
  if (active.length) h += `<h2 style="margin:26px 0 0">AKTIF (${active.length})</h2>`;
  active.forEach(row);
  if (done.length) h += `<h2 style="margin:30px 0 0;color:var(--muted)">SELESAI (${done.length})</h2>`;
  done.forEach(row);
  h += CREDIT;
  app.innerHTML = h;
}
