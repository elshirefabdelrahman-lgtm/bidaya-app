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

// A read-only projection of the shared ledger, not extra expense records.
// Salary deductions are non-cash settlements and must never appear here.
export function expenseMovements(data) {
  const employee = row => data.employees.find(e=>e.id===row.employeeId);
  const linked = (row, returned=false) => {
    const e=employee(row);
    return {...row, source:returned?'advanceReturn':'advance',
      branch:row.branch||e?.branch||'', category:returned?'رد سلفة نقدًا':'سلفة موظف',
      description:`${returned?'رد سلفة':'صرف سلفة'} — ${e?.name||'موظف غير متاح'}${row.note?' — '+row.note:''}`,
      incoming:returned?Number(row.amount):0, outgoing:returned?0:Number(row.amount)};
  };
  return [
    ...data.expenses.map(row=>({...row,source:'expense',incoming:0,outgoing:Number(row.amount)})),
    ...(data.advances||[]).map(row=>linked(row)),
    ...(data.settlements||[]).filter(row=>row.kind==='cash').map(row=>linked(row,true)),
  ];
}
export function expenseMovementTotals(rows) {
  const active=rows.filter(row=>!row.voided);
  return {
    operating:total(active.filter(row=>row.source==='expense'),'outgoing'),
    advances:total(active.filter(row=>row.source==='advance'),'outgoing'),
    returned:total(active,'incoming'), outgoing:total(active,'outgoing'),
  };
}

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
  const advances = (data.advances || []).filter(x=>!x.voided&&employeeIds.has(x.employeeId));
  const settlements = (data.settlements || []).filter(x=>!x.voided&&employeeIds.has(x.employeeId));
  const advanceIssued=total(advances.filter(x=>inRange(x.date,from,to)));
  const advanceReturned=total(settlements.filter(x=>x.kind==='cash'&&inRange(x.date,from,to)));
  const totalSpent=total([{amount:expenseTotal},{amount:salariesPaid},{amount:advanceIssued}]);
  const advanceOutstanding=total(advances)-total(settlements);
  const salaryLiability=total(data.payroll.filter(x=>employeeIds.has(x.employeeId)).map(x=>({amount:x.base===undefined?0:x.base+x.additions-x.deduction-x.advance-total((data.salaryPayments||[]).filter(p=>p.salaryId===x.id))})));
  return { billed, collected, expenseTotal, salariesPaid, outstanding, advanceIssued,advanceReturned,advanceOutstanding,salaryLiability,totalSpent,expenseOutflowTotal:Math.round((expenseTotal+advanceIssued)*100)/100,cashFlow: collected - expenseTotal - salariesPaid, treasury:total([{amount:collected},{amount:-totalSpent},{amount:advanceReturned}]), cases: cases.length, active:cases.filter(x=>x.status==='نشطة').length,closed:cases.filter(x=>x.status!=='نشطة').length,collections: collections.length };
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
