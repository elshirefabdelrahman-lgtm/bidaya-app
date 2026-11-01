export const money = value => `${new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(value)} ج.م`;
export const dateLabel = value => value ? new Intl.DateTimeFormat('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(`${value}T12:00:00`)) : '—';
export const inRange = (date, from, to) => (!from || date >= from) && (!to || date <= to);
export const total = (rows, key = 'amount') => rows.reduce((sum, row) => sum + Math.round(Number(row[key] || 0)*100), 0)/100;
export const casePaid = (data, caseId) => total(data.collections.filter(row => row.caseId === caseId && !row.voided));
export const caseBalance = (data, record) => Math.max(0, Math.round((Number(record.fee) - casePaid(data, record.id))*100)/100);
export function caseFinancials(data, record) {
  const paid = casePaid(data, record.id);
  const remaining = caseBalance(data, record);
  return { agreed: Number(record.fee), paid, remaining, status: remaining === 0 ? 'مكتمل' : paid === 0 ? 'لم يدفع' : 'دفع جزءًا' };
}
export const timestampLabel = value => value ? new Intl.DateTimeFormat('ar-EG', { dateStyle:'medium', timeStyle:'short', timeZone:'Africa/Cairo' }).format(new Date(value)) : 'غير مسجل';
export const monthStart = date => `${date.slice(0, 7)}-01`;

export function summary(data, { from = '', to = '', branch = '' } = {}) {
  const cases = data.cases.filter(row => !branch || row.branch === branch);
  const caseIds = new Set(cases.map(row => row.id));
  const collections = data.collections.filter(row => !row.voided && caseIds.has(row.caseId) && inRange(row.date, from, to));
  const expenses = data.expenses.filter(row => !row.voided && (!branch || row.branch === branch) && inRange(row.date, from, to));
  const employeeIds = new Set(data.employees.filter(row => !branch || row.branch === branch).map(row => row.id));
  const payroll = (data.salaryPayments || data.payroll).filter(row => !row.voided && employeeIds.has(row.employeeId) && inRange(row.date, from, to));
  const billed = total(cases.filter(row => inRange(row.admission, from, to)), 'fee');
  const collected = total(collections);
  const expenseTotal = total(expenses);
  const salariesPaid = total(payroll, data.salaryPayments ? 'amount' : 'paid');
  const outstanding = total(cases.map(row => ({ amount: caseBalance(data, row) })));
  const advances = (data.advances || []).filter(x=>employeeIds.has(x.employeeId));
  const settlements = (data.settlements || []).filter(x=>employeeIds.has(x.employeeId));
  const advanceIssued=total(advances.filter(x=>inRange(x.date,from,to)));
  const advanceReturned=total(settlements.filter(x=>x.kind==='cash'&&inRange(x.date,from,to)));
  const advanceOutstanding=total(advances)-total(settlements);
  const salaryLiability=total(data.payroll.filter(x=>employeeIds.has(x.employeeId)).map(x=>({amount:x.base===undefined?0:x.base+x.additions-x.deduction-x.advance-total((data.salaryPayments||[]).filter(p=>p.salaryId===x.id))})));
  return { billed, collected, expenseTotal, salariesPaid, outstanding, advanceIssued,advanceReturned,advanceOutstanding,salaryLiability,cashFlow: collected - expenseTotal - salariesPaid, treasury:collected-expenseTotal-salariesPaid-advanceIssued+advanceReturned, cases: cases.length, active:cases.filter(x=>x.status==='نشطة').length,closed:cases.filter(x=>x.status!=='نشطة').length,collections: collections.length };
}

export function validateCollection(data, entry) {
  const record = data.cases.find(row => row.id === entry.caseId);
  if (!record) return 'اختر حالة صحيحة.';
  if (!Number.isInteger(entry.amount) || entry.amount <= 0) return 'أدخل مبلغ تحصيل صحيحًا أكبر من صفر.';
  if (entry.amount > caseBalance(data, record)) return 'المبلغ أكبر من الرصيد المتبقي للحالة.';
  if (!entry.date) return 'حدد تاريخ التحصيل الفعلي.';
  if (!entry.receipt.trim()) return 'أدخل رقم الإيصال.';
  return '';
}
