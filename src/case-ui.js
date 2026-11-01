import { esc, icon, table, field, selectField } from './ui.js';
import { caseFinancials, money, dateLabel, timestampLabel } from './finance.js';
import { today } from './data.js';
import { can } from './service.js';

export function paymentActions(row, user) {
  if (row.voided) return `<span class="status status--muted">ملغاة</span><small>${esc(row.voidReason)}</small>`;
  return can(user,'finance') ? `<button type="button" class="text-control" data-void="collections" data-id="${esc(row.id)}">إلغاء موثّق</button>` : '';
}

export function caseDetail(state, record) {
  const f = caseFinancials(state.data,record);
  const payments = state.data.collections.filter(x=>x.caseId===record.id).sort((a,b)=>b.date.localeCompare(a.date)||(b.createdAt||'').localeCompare(a.createdAt||''));
  const value=(label,content,key='')=>`<div><small>${label}</small><strong ${key?`data-case-value="${key}"`:''}>${content}</strong></div>`;
  return `<div class="overlay" data-close></div><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><header class="dialog__head"><h2 id="dialog-title">تفاصيل الحالة ${esc(record.id)}</h2><button type="button" class="icon-btn" data-close aria-label="إغلاق">${icon('close')}</button></header><div class="dialog__body"><h3>${esc(record.name)}</h3><div class="detail-list">${value('المبلغ المتفق عليه بالكامل',money(f.agreed),'agreed')}${value('إجمالي المدفوع فعليًا',money(f.paid),'paid')}${value('المبلغ المتبقي',money(f.remaining),'remaining')}${value('حالة السداد',f.status,'status')}${value('الفرع',esc(record.branch))}${value('حالة الملف',esc(record.status))}${value('تاريخ الدخول',dateLabel(record.admission))}${value('تاريخ الخروج',dateLabel(record.discharge))}${record.phone?value('الهاتف',esc(record.phone)):''}</div><p class="report-note">المتبقي = المبلغ المتفق عليه − مجموع الدفعات غير الملغاة. كل دفعة هنا تظهر تلقائيًا في التحصيلات.</p><p>${esc(record.note)}</p><div class="dialog__actions">${can(state.user,'cases')?`<button type="button" class="button button--ghost" data-edit-case="${esc(record.id)}">تعديل بيانات الحالة</button>`:''}<button type="button" class="button button--teal" data-open="collection" data-case="${esc(record.id)}">تسجيل دفعة</button></div><h3 class="subheading">سجل دفعات الحالة</h3>${table(['المبلغ','تاريخ الدفع','الطريقة','سجّل بواسطة','وقت التسجيل (القاهرة)','ملاحظات / تصحيح'],payments.map(x=>`<tr><td>${money(x.amount)}</td><td>${dateLabel(x.date)}</td><td>${esc(x.method||'—')}</td><td>${esc(x.user||'غير مسجل')}</td><td>${timestampLabel(x.createdAt)}</td><td>${esc(x.note)}${paymentActions(x,state.user)}<small>${esc(x.receipt)}</small></td></tr>`).join(''),'لا توجد دفعات لهذه الحالة بعد.')}<div class="dialog__actions"><button type="button" class="button button--ghost" data-close>إغلاق</button></div></div></section>`;
}

export function paymentForm(state) {
  const record=state.data.cases.find(x=>x.id===state.paymentCase);
  const context=record?`<input type="hidden" name="caseId" value="${esc(record.id)}"><p class="report-note span-2">الحالة ${esc(record.id)} — ${esc(record.name)} · المتبقي ${money(caseFinancials(state.data,record).remaining)}</p>`:selectField('الحالة','caseId',state.data.cases.map(x=>[x.id,`${x.id} — ${x.name}`]),'required');
  return {title:'تسجيل دفعة',body:`${context}${field('المبلغ المدفوع (ج.م)','amount','number','min="0.01" step="0.01" required inputmode="decimal"')}${field('تاريخ الدفع','date','date',`value="${today()}" required`)}${selectField('طريقة الدفع','method',['نقدي','تحويل بنكي','بطاقة'].map(x=>[x,x]))}${field('ملاحظات اختيارية','note')}<input type="hidden" name="receipt" value="R-${crypto.randomUUID()}">`};
}
