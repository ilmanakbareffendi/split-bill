// Uji fungsi hitung tagihan. Jalankan: node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const { personBreakdown } = require("../assets/js/utils/hitung.js");

const A = { id: "a" }, B = { id: "b" }, C = { id: "c" };
const bill = (total, items) => ({ total, subtotal: items.reduce((s, it) => s + it.price, 0), items });

test("satu item, satu orang, tanpa pajak: bayar sesuai harga", () => {
  const r = personBreakdown(bill(25000, [{ name: "Nasi goreng", price: 25000, claimers: [A] }]), "a");
  assert.equal(r.owe, 25000);
  assert.equal(r.sub, 25000);
  assert.equal(r.adj, 0);
  assert.deepEqual(r.lines, [{ name: "Nasi goreng", n: 1, part: 25000 }]);
});

test("item patungan dibagi rata ke semua yang mencentang", () => {
  const b = bill(30000, [{ name: "Pizza", price: 30000, claimers: [A, B, C] }]);
  for (const id of ["a", "b", "c"]) assert.equal(personBreakdown(b, id).owe, 10000);
});

test("pajak dan service dibagi sebanding dengan pesanan", () => {
  // subtotal 100.000, total 115.000 (pajak dan service 15%)
  const b = bill(115000, [
    { name: "Steak", price: 80000, claimers: [A] },
    { name: "Es teh", price: 20000, claimers: [B] },
  ]);
  assert.equal(personBreakdown(b, "a").owe, 92000);
  assert.equal(personBreakdown(b, "b").owe, 23000);
  assert.equal(Math.round(personBreakdown(b, "a").adj), 12000);
});

test("diskon mengurangi tagihan secara sebanding", () => {
  // subtotal 100.000, total 90.000 (diskon 10%)
  const b = bill(90000, [
    { name: "Ayam", price: 60000, claimers: [A] },
    { name: "Jus", price: 40000, claimers: [B] },
  ]);
  assert.equal(personBreakdown(b, "a").owe, 54000);
  assert.equal(personBreakdown(b, "b").owe, 36000);
  assert.ok(personBreakdown(b, "a").adj < 0);
});

test("orang yang tidak mencentang apa pun membayar nol", () => {
  const r = personBreakdown(bill(50000, [{ name: "Mie", price: 50000, claimers: [A] }]), "b");
  assert.equal(r.owe, 0);
  assert.deepEqual(r.lines, []);
});

test("subtotal nol tidak menghasilkan pembagian dengan nol", () => {
  const r = personBreakdown({ total: 10000, subtotal: 0, items: [] }, "a");
  assert.equal(r.owe, 0);
  assert.ok(Number.isFinite(r.adj));
});

test("bila semua item terklaim, jumlah tagihan semua orang mendekati total (selisih pembulatan maksimal 1 rupiah per orang)", () => {
  const b = bill(173250, [
    { name: "Paket A", price: 47000, claimers: [A] },
    { name: "Paket B", price: 52000, claimers: [B] },
    { name: "Camilan", price: 33000, claimers: [A, B, C] },
    { name: "Minuman", price: 18500, claimers: [C] },
  ]);
  const sum = ["a", "b", "c"].reduce((s, id) => s + personBreakdown(b, id).owe, 0);
  assert.ok(Math.abs(sum - 173250) <= 3, "jumlah " + sum);
});
