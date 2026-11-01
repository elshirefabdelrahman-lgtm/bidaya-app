import test from 'node:test';
import assert from 'node:assert/strict';
import { cloneDemoData } from '../src/data.js';
import { caseBalance, casePaid, inRange, summary, validateCollection } from '../src/finance.js';

test('separate payments reduce one case balance without changing its fee', () => {
  const data = cloneDemoData();
  const record = data.cases[0];
  const originalFee = record.fee;
  const paid = casePaid(data, record.id);
  data.collections.push({ id: 'R-TEST', caseId: record.id, amount: 1000, date: '2026-10-30', receipt: 'R-TEST' });
  assert.equal(casePaid(data, record.id), paid + 1000);
  assert.equal(caseBalance(data, record), originalFee - paid - 1000);
  assert.equal(record.fee, originalFee);
});

test('date range includes both endpoints and filters by transaction date', () => {
  assert.equal(inRange('2026-10-01', '2026-10-01', '2026-10-30'), true);
  assert.equal(inRange('2026-10-30', '2026-10-01', '2026-10-30'), true);
  assert.equal(inRange('2026-10-31', '2026-10-01', '2026-10-30'), false);
  const data = cloneDemoData();
  const day = data.collections[0].date;
  const expected = data.collections.filter(row => row.date === day).reduce((sum, row) => sum + row.amount, 0);
  assert.equal(summary(data, { from: day, to: day }).collected, expected);
});

test('financial summary separates billed, collected, outstanding and cash flow', () => {
  const data = cloneDemoData();
  const result = summary(data);
  assert.equal(result.billed, data.cases.reduce((sum, row) => sum + row.fee, 0));
  assert.equal(result.collected, data.collections.reduce((sum, row) => sum + row.amount, 0));
  assert.equal(result.outstanding, result.billed - result.collected);
  assert.equal(result.cashFlow, result.collected - result.expenseTotal - result.salariesPaid);
});

test('collection validation prevents overpayment and invalid amounts', () => {
  const data = cloneDemoData();
  const record = data.cases[0];
  const base = { caseId: record.id, date: '2026-10-30', receipt: 'R-TEST' };
  assert.match(validateCollection(data, { ...base, amount: caseBalance(data, record) + 1 }), /أكبر من الرصيد/);
  assert.match(validateCollection(data, { ...base, amount: 0 }), /مبلغ تحصيل صحيح/);
  assert.equal(validateCollection(data, { ...base, amount: 100 }), '');
});
