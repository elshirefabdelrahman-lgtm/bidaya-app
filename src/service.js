import { caseBalance, total } from './finance.js';
export const emptyData = () => ({cases:[], collections:[], employees:[], payroll:[], salaryPayments:[], advances:[], settlements:[], expenses:[], audit:[], branches:[], users:[]});
export const roles = ['Super Admin','Admin','Accountant','Employee'];
export const can = (user, area) => !!user?.active && (user.role === 'Super Admin' || (user.permissions || []).includes(area));
export const advanceBalance = (d, employeeId) => total(d.advances.filter(x => x.employeeId === employeeId && !x.voided)) - total(d.settlements.filter(x => x.employeeId === employeeId && !x.voided));
export const salaryNet = s => Math.round((s.base + s.additions - s.deduction - s.advance)*100)/100;
export const salaryPaid = (d, id) => total(d.salaryPayments.filter(x => x.salaryId === id && !x.voided));
const areas = {case:'cases',caseEdit:'cases',collection:'finance',expense:'finance',employee:'employees',employeeEdit:'employees',salary:'payroll',salaryPayment:'payroll',advance:'payroll',repayment:'payroll',void:'finance',branch:'settings',user:'users',userEdit:'users'};
const amount = (v, zero = false) => { const n=Number(v); if (!Number.isSafeInteger(Math.round(n*100)) || !Number.isFinite(n) || n < (zero ? 0 : .01) || Math.abs(n*100-Math.round(n*100))>0.00001 || n>1e10) throw Error('أدخل مبلغًا صحيحًا حتى منزلتين عشريتين.'); return Math.round(n*100)/100; };
const date = v => { if (!/^\d{4}-\d{2}-\d{2}$/.test(v || '') || new Date(v+'T12:00:00').toISOString().slice(0,10)!==v) throw Error('التاريخ غير صحيح.'); return v; };
const text = v => { if (!String(v || '').trim()) throw Error('أكمل الحقول المطلوبة.'); return String(v).trim(); };
export function execute(data, user, kind, input, requestId = crypto.randomUUID()) {
  if (!can(user, areas[kind])) throw Error('ليس لديك صلاحية لتنفيذ هذه العملية.');
  if (data.audit.some(x=>x.requestId===requestId)) return data;
  const d=structuredClone(data), f=structuredClone(input), now=new Date().toISOString();
  if(f.time&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(f.time))throw Error('وقت الحركة غير صحيح.');
  const id=crypto.randomUUID(); let before=null, after, entity;
  const branch = b => { if (!d.branches.includes(b)) throw Error('اختر فرعًا مسجلاً.'); if(user.role!=='Super Admin' && !(user.branches||[]).includes(b)) throw Error('هذا الفرع خارج صلاحياتك.'); return b; };
  const employee = () => { const e=d.employees.find(x=>x.id===f.employeeId); if(!e) throw Error('اختر موظفًا صحيحًا.'); branch(e.branch); return e; };
  if (kind==='case' || kind==='caseEdit') {
    entity='cases'; const old=d.cases.find(x=>x.id===f.id); if(kind==='caseEdit'&&!old) throw Error('الحالة غير موجودة.');
    const row={...old,...f, name:text(f.name), branch:branch(f.branch), fee:amount(f.fee,true), admission:date(f.admission), status:f.status};
    if(!['نشطة','خرجت','مغلقة'].includes(row.status)) throw Error('حالة الملف غير صحيحة.');
    if(f.discharge && date(f.discharge)<row.admission) throw Error('الخروج يسبق الدخول.');
    if(row.status!=='نشطة'&&!f.discharge) throw Error('حدد تاريخ الخروج أو الإغلاق.');
    if(old && row.fee < total(d.collections.filter(x=>x.caseId===old.id&&!x.voided))) throw Error('التعاقد أقل من المدفوع.');
    if(old&&old.branch!==row.branch)throw Error('نقل الفرع يحتاج إجراء مستقل للحفاظ على تقارير الحركات السابقة.');
    before=old||null; row.id=old?.id || String(Math.max(0,...d.cases.map(x=>Number(x.id)||0))+1).padStart(3,'0');
    if(old) d.cases[d.cases.indexOf(old)]=row; else d.cases.push(row); after=row;
  } else if(kind==='employee'||kind==='employeeEdit') {
    entity='employees'; const old=d.employees.find(x=>x.id===f.id); if(kind==='employeeEdit'&&!old) throw Error('الموظف غير موجود.'); before=old||null;
    after={...old,...f,id:old?.id||id,name:text(f.name),role:text(f.role),branch:branch(f.branch),salary:amount(f.salary,true),hired:date(f.hired),active:f.active!=='false'};
    if(old&&old.branch!==after.branch)throw Error('نقل الموظف لفرع آخر يحتاج إجراء مستقل.');
    if(old) d.employees[d.employees.indexOf(old)]=after; else d.employees.push(after);
  } else if(kind==='collection') {
    entity='collections'; const c=d.cases.find(x=>x.id===f.caseId); if(!c) throw Error('اختر حالة صحيحة.'); branch(c.branch);
    f.amount=amount(f.amount); if(f.amount>caseBalance(d,c)) throw Error('المبلغ أكبر من الرصيد المتبقي؛ يلزم إجراء تسوية معتمد قبل التحصيل.');
    f.receipt=text(f.receipt); if(d.collections.some(x=>x.receipt===f.receipt)) throw Error('الإيصال مستخدم بالفعل.');
    after={...f,id,date:date(f.date),branch:c.branch,user:user.name,createdAt:now}; d.collections.push(after);
  } else if(kind==='expense') {
    entity='expenses'; after={...f,id,amount:amount(f.amount),date:date(f.date),branch:branch(f.branch),description:text(f.description),category:text(f.category),user:user.name,createdAt:now}; d.expenses.push(after);
  } else if(kind==='advance'||kind==='repayment') {
    employee(); entity=kind==='advance'?'advances':'settlements'; f.amount=amount(f.amount);
    if(kind==='repayment'&&f.amount>advanceBalance(d,f.employeeId)) throw Error('المبلغ أكبر من السلف المستحقة.');
    after={...f,id,date:date(f.date),kind:kind==='advance'?'advance':'cash',user:user.name}; d[entity].push(after);
  } else if(kind==='salary') {
    const e=employee(); entity='payroll'; if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(f.month)) throw Error('شهر الاستحقاق غير صحيح.');
    if(d.payroll.some(x=>x.employeeId===e.id&&x.month===f.month)) throw Error('راتب الشهر مسجل بالفعل.');
    after={...f,id,base:amount(e.salary,true),additions:amount(f.additions,true),deduction:amount(f.deduction,true),advance:amount(f.advance,true),date:date(f.date),user:user.name};
    if(salaryNet(after)<0||after.advance>advanceBalance(d,e.id)) throw Error('راجع الخصومات ورصيد السلف.');
    const paid=amount(f.paid,true); if(paid>salaryNet(after)) throw Error('المدفوع أكبر من صافي الراتب.');
    d.payroll.push(after); if(after.advance) d.settlements.push({id:crypto.randomUUID(),employeeId:e.id,salaryId:id,kind:'salary',amount:after.advance,date:f.date});
    if(paid) d.salaryPayments.push({id:crypto.randomUUID(),salaryId:id,employeeId:e.id,amount:paid,date:f.date,user:user.name});
  } else if(kind==='salaryPayment') {
    const s=d.payroll.find(x=>x.id===f.salaryId); if(!s) throw Error('الراتب غير موجود.'); f.employeeId=s.employeeId; employee(); entity='salaryPayments';
    const value=amount(f.amount); if(value>salaryNet(s)-salaryPaid(d,s.id)) throw Error('المبلغ يتجاوز باقي الراتب.');
    after={...f,id,amount:value,date:date(f.date),user:user.name}; d.salaryPayments.push(after);
  } else if(kind==='void') {
    if(!['collections','expenses'].includes(f.entity)) throw Error('هذا السجل يحتاج تسوية مستقلة.');
    entity=f.entity; const row=d[entity].find(x=>x.id===f.id); if(!row||row.voided) throw Error('الحركة غير موجودة أو ملغاة.'); branch(row.branch || d.cases.find(x=>x.id===row.caseId)?.branch);
    before=structuredClone(row); row.voided=true; row.voidReason=text(f.reason); row.voidedAt=now; after=row;
  } else if(kind==='branch') {
    if(user.role!=='Super Admin')throw Error('إضافة الفروع متاحة لمدير النظام فقط.');
    entity='branches'; const name=text(f.name); if(d.branches.includes(name)) throw Error('الفرع مسجل.'); d.branches.push(name); after={id,name};
  } else if(kind==='user'||kind==='userEdit') {
    if(user.role!=='Super Admin') throw Error('إدارة الحسابات متاحة لمدير النظام فقط.');
    entity='users'; if(!roles.includes(f.role)) throw Error('الدور غير صحيح.');
    if(!/^[a-zA-Z0-9_.-]{3,40}$/.test(f.username)||!/^\S+@\S+\.\S+$/.test(f.email))throw Error('اسم المستخدم أو البريد غير صحيح.');
    if((f.branches||[]).some(b=>!d.branches.includes(b))||(f.permissions||[]).some(p=>!['cases','finance','employees','payroll','reports','users','audit','settings'].includes(p)))throw Error('الصلاحيات أو الفروع غير صحيحة.');
    const old=d.users.find(x=>x.id===f.id); if(old?.id===user.id) throw Error('لا يمكن تعديل حسابك من هنا.');
    if(d.users.some(x=>x.id!==old?.id&&(x.email===f.email||x.username===f.username))) throw Error('البريد أو اسم المستخدم مستخدم.');
    before=old||null; after={id:old?.id||id,name:text(f.name),username:text(f.username),email:text(f.email),role:f.role,active:f.active!=='false',permissions:f.permissions||[],branches:f.branches||[]};
    if(old) d.users[d.users.indexOf(old)]=after; else d.users.push(after);
  } else throw Error('العملية غير مدعومة.');
  d.audit.push({id:crypto.randomUUID(),requestId,at:now,user:user.name,actorId:user.id,action:kind,entity,before:structuredClone(before),after:structuredClone(after)});
  return d;
}
