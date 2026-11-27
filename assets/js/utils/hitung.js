/* Fungsi hitung murni: tidak menyentuh DOM, diuji di tests/hitung.test.js. */
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

// Agar bisa diuji dengan node --test. Di browser, `module` tidak ada sehingga baris ini dilewati.
if (typeof module !== "undefined") module.exports = { personBreakdown };
