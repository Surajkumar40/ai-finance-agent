// Tests for the plain functions in services/ (no database is used).
// Run with:  npm run test:unit      (needs backend/.env to exist, see the README)
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');

const { nextDate } = require('../services/recurring');
const split = require('../services/split');
const budget = require('../services/budgetSuggest');
const { projectGoal } = require('../services/goalPace');
const { detect } = require('../services/recurringDetect');

// ───────────────────────── next due date ─────────────────────────
test('recurring: a bill on the 31st stays on the 31st after a short month', () => {
  assert.equal(nextDate('2026-01-31', 'monthly', 31), '2026-02-28');
  assert.equal(nextDate('2026-02-28', 'monthly', 31), '2026-03-31');
  assert.equal(nextDate('2028-01-31', 'monthly', 31), '2028-02-29'); // leap year
});

test('recurring: yearly, weekly and daily steps cross month and year ends', () => {
  assert.equal(nextDate('2028-02-29', 'yearly', 29), '2029-02-28');
  assert.equal(nextDate('2026-12-15', 'monthly', 15), '2027-01-15');
  assert.equal(nextDate('2026-10-28', 'weekly'), '2026-11-04');
  assert.equal(nextDate('2026-12-31', 'daily'), '2027-01-01');
});

// ───────────────────────── splitting expenses ─────────────────────────
test('split: the parts always add up to exactly the total', () => {
  for (let total = 1; total <= 300; total++) {
    for (let n = 1; n <= 7; n++) {
      const parts = split.splitEqual(total, Array.from({ length: n }, (_, i) => i + 1));
      assert.equal(parts.reduce((s, p) => s + p.share, 0), total, `total ${total} between ${n}`);
      assert.ok(Math.max(...parts.map((p) => p.share)) - Math.min(...parts.map((p) => p.share)) <= 1);
    }
  }
});

test('split: leftover paise go to the first people', () => {
  assert.deepEqual(split.splitEqual(1000, [1, 2, 3]).map((p) => p.share), [334, 333, 333]);
});

test('split: rupees and paise convert without float drift', () => {
  assert.equal(split.toPaise(12.34), 1234);
  assert.equal(split.toPaise('0.1'), 10);
  assert.equal(split.toRupees(1234), 12.34);
});

test('split: balances and the fewest payments to settle up', () => {
  const people = (ids) => ids.map((id) => ({ user_id: id, user_name: 'P' + id, share_paise: 3000 }));
  const bal = split.balances([{ paid_by: 1, paid_by_name: 'P1', amount_paise: 9000 }], people([1, 2, 3]), []);
  assert.equal(bal.get(1).paise, 6000);
  assert.equal(bal.get(2).paise, -3000);
  const pay = split.suggest(bal, new Set([1, 2, 3]));
  assert.deepEqual(pay.map((p) => [p.from_user, p.to_user, p.amount_paise]), [[2, 1, 3000], [3, 1, 3000]]);
});

test('split: a settlement clears the debt, and people who left are left out', () => {
  const shares = [1, 2].map((id) => ({ user_id: id, user_name: 'P' + id, share_paise: 5000 }));
  const expenses = [{ paid_by: 1, paid_by_name: 'P1', amount_paise: 10000 }];
  const settled = split.balances(expenses, shares, [{ from_user: 2, from_name: 'P2', to_user: 1, to_name: 'P1', amount_paise: 5000 }]);
  assert.deepEqual(split.suggest(settled, new Set([1, 2])), []);
  const open = split.balances(expenses, shares, []);
  assert.deepEqual(split.suggest(open, new Set([1])), []); // P2 is no longer a member
});

// ───────────────────────── budget suggestions ─────────────────────────
const row = (id, name, ym, spent) => ({ category_id: id, category_name: name, icon: '', category_color: '#000', ym, spent });

test('budget: limits are rounded up to an easy number', () => {
  assert.equal(budget.niceCeil(95), 100);
  assert.equal(budget.niceCeil(1234), 1300);
  assert.equal(budget.niceCeil(2000), 2000);
  assert.equal(budget.niceCeil(2001), 2100);
  assert.equal(budget.niceCeil(99999), 100000);
});

test('budget: only the months since the first transaction count', () => {
  assert.deepEqual(budget.windowMonths('2026-10', '2026-01'), ['2026-07', '2026-08', '2026-09']);
  assert.deepEqual(budget.windowMonths('2026-10', '2026-09'), ['2026-09']);
  assert.deepEqual(budget.windowMonths('2026-10', null), []);
});

test('budget: suggests the average, skips one-off and already-budgeted categories', () => {
  const rows = [
    row(1, 'Food', '2026-07', 1000), row(1, 'Food', '2026-08', 2000), row(1, 'Food', '2026-09', 3000),
    row(2, 'One-off', '2026-09', 5000),
    row(3, 'Has budget', '2026-08', 100), row(3, 'Has budget', '2026-09', 100),
  ];
  const out = budget.suggest({ month: '2026-10', firstMonth: '2026-01', rows, budgeted: [3] });
  assert.deepEqual(out.suggestions.map((s) => [s.category_name, s.average, s.suggested]), [['Food', 2000, 2000]]);
});

// ───────────────────────── savings goal pace ─────────────────────────
const saved = [{ amount: 1000, on: '2026-08-20' }, { amount: 1000, on: '2026-09-20' }, { amount: 1000, on: '2026-10-18' }];
const goal = (o) => projectGoal({ contributions: saved, firstOn: '2026-08-20', today: '2026-10-20', ...o });

test('goal pace: no guess without enough history', () => {
  assert.equal(projectGoal({ contributions: [], firstOn: null, remaining: 1000, today: '2026-10-20' }), null);
});

test('goal pace: on track, behind, and no deadline', () => {
  assert.equal(goal({ remaining: 5000, targetDate: '2027-06-01' }).status, 'on_track');
  const behind = goal({ remaining: 50000, targetDate: '2027-01-01' });
  assert.equal(behind.status, 'behind');
  assert.ok(behind.days_late > 0);
  assert.equal(goal({ remaining: 5000, targetDate: null }).status, 'no_deadline');
});

test('goal pace: money taken back out means the goal has stalled', () => {
  const out = projectGoal({ contributions: [{ amount: 1000, on: '2026-08-20' }, { amount: -1000, on: '2026-10-01' }], firstOn: '2026-08-20', remaining: 5000, today: '2026-10-20' });
  assert.equal(out.status, 'stalled');
  assert.equal(out.finish_date, null);
});

// ───────────────────────── spotting repeating payments ─────────────────────────
const today = '2026-10-19';
const mk = (title, amount, dates, o = {}) => dates.map((date) => ({ title, amount, type: 'expense', category_id: null, category_name: null, date, ...o }));
const names = (list) => list.map((s) => s.title);

test('detect: finds a monthly bill and says when it is next due', () => {
  const out = detect({ transactions: mk('Netflix', 649, ['2026-08-05', '2026-09-05', '2026-10-05']), today });
  assert.equal(out.length, 1);
  assert.equal(out[0].frequency, 'monthly');
  assert.equal(out[0].next_due, '2026-11-05');
});

test('detect: a bill on the 31st keeps the 31st even when it fell on the 30th', () => {
  const out = detect({ transactions: mk('Rent', 20000, ['2026-07-31', '2026-08-31', '2026-09-30']), today });
  assert.equal(out[0].next_due, '2026-10-31');
});

test('detect: weekly, yearly and income patterns', () => {
  assert.equal(detect({ transactions: mk('Gym', 999, ['2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12']), today })[0].frequency, 'weekly');
  assert.equal(detect({ transactions: mk('Insurance', 12000, ['2024-10-15', '2025-10-14']), today })[0].next_due, '2027-10-15');
  const salary = detect({ transactions: mk('Salary', 90000, ['2026-07-28', '2026-08-28', '2026-09-28'], { type: 'income' }), today });
  assert.deepEqual([salary[0].type, salary[0].next_due], ['income', '2026-10-28']);
});

test('detect: ignores irregular spending, changing amounts and payments that stopped', () => {
  assert.equal(detect({ transactions: mk('Zomato', 320, ['2026-10-02', '2026-10-09', '2026-09-20', '2026-09-03', '2026-08-17']), today }).length, 0);
  const varying = mk('Electricity', 1500, ['2026-10-10', '2026-09-09', '2026-08-11']).map((t, i) => ({ ...t, amount: [1500, 2400, 900][i] }));
  assert.equal(detect({ transactions: varying, today }).length, 0);
  assert.equal(detect({ transactions: mk('Old gym', 999, ['2026-01-03', '2026-02-03', '2026-03-03', '2026-04-03']), today }).length, 0);
});

test('detect: skips what is already recurring, dismissed, or created by a recurring item', () => {
  const base = mk('Netflix', 649, ['2026-08-05', '2026-09-05', '2026-10-05']);
  assert.deepEqual(names(detect({ transactions: base, today })), ['Netflix']);
  assert.equal(detect({ transactions: base, existing: [{ title: 'netflix ', type: 'expense' }], today }).length, 0);
  assert.equal(detect({ transactions: base, dismissed: ['expense|netflix'], today }).length, 0);
  assert.equal(detect({ transactions: base.map((t) => ({ ...t, is_recurring: 1 })), today }).length, 0);
});