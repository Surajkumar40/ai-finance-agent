// Money maths for split expenses. Everything is in whole paise (integers), so nothing is lost to rounding.

// Divides a total between people. The leftover paise go to the first people (in the order given),
// so the parts always add up to exactly the total.
function splitEqual(totalPaise, ids) {
  const n = ids.length;
  const base = Math.floor(totalPaise / n);
  let extra = totalPaise - base * n;
  return ids.map((id) => { const share = base + (extra > 0 ? 1 : 0); if (extra > 0) extra -= 1; return { id, share }; });
}

// Balance per person: paid - own shares + money handed over - money received.
// Positive = the others owe them. Negative = they owe the others.
// expenses: [{ paid_by, paid_by_name, amount_paise }], shares: [{ user_id, user_name, share_paise }],
// settlements: [{ from_user, from_name, to_user, to_name, amount_paise }]
function balances(expenses, shares, settlements) {
  const map = new Map();
  const at = (id, name) => { if (!map.has(id)) map.set(id, { user_id: id, name, paise: 0 }); return map.get(id); };
  for (const e of expenses) at(e.paid_by, e.paid_by_name).paise += Number(e.amount_paise);
  for (const s of shares) at(s.user_id, s.user_name).paise -= Number(s.share_paise);
  for (const t of settlements) { at(t.from_user, t.from_name).paise += Number(t.amount_paise); at(t.to_user, t.to_name).paise -= Number(t.amount_paise); }
  return map;
}

// Fewest payments that settle everyone: the person who owes most pays the person owed most, and so on.
// Only people in `allowed` (the current members) are included.
function suggest(balanceMap, allowed) {
  const cred = [], debt = [];
  for (const b of balanceMap.values()) {
    if (!allowed.has(b.user_id)) continue;
    if (b.paise > 0) cred.push({ ...b }); else if (b.paise < 0) debt.push({ ...b, paise: -b.paise });
  }
  const byBig = (a, b) => b.paise - a.paise || a.user_id - b.user_id;
  cred.sort(byBig); debt.sort(byBig);
  const out = []; let i = 0, j = 0;
  while (i < debt.length && j < cred.length) {
    const pay = Math.min(debt[i].paise, cred[j].paise);
    if (pay > 0) out.push({ from_user: debt[i].user_id, from_name: debt[i].name, to_user: cred[j].user_id, to_name: cred[j].name, amount_paise: pay });
    debt[i].paise -= pay; cred[j].paise -= pay;
    if (debt[i].paise === 0) i++;
    if (cred[j].paise === 0) j++;
  }
  return out;
}

const toPaise = (rupees) => Math.round(Number(rupees) * 100);
const toRupees = (paise) => Number(paise) / 100;

module.exports = { splitEqual, balances, suggest, toPaise, toRupees };