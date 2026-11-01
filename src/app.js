import { caseDetail, paymentForm, paymentActions } from './case-ui.js';
import { SupabaseRepository, SessionError, connected } from './repository.js';
import { emptyData, can, roles } from './service.js';
import { extraScreen, extraForm, reportDetail, comparisonChart, filterBar, matchFilters, exportReport } from './screens.js';
import { today } from './data.js';
import { money, dateLabel, total, caseBalance, casePaid, timestampLabel, summary, monthStart } from './finance.js';
import { esc, icon, navItems, badge, empty, field, selectField, branchOptions, caseRows, table } from './ui.js';

const root = document.querySelector('#app');
let repository;
let availableBranches=[];
const state = { mode:'unconfigured', user:null, busy:false, entered: false, screen: 'dashboard', data: emptyData(), modal: '', detail: '', menu: false, filters: { cases: { q: '', branch: '' }, collections: { branch: '', q:'', from:'', to:'', method:'' }, expenses: { branch: '', q:'', from:'', to:'', category:'' } }, report: { from: monthStart(today()), to: today(), branch: '' } };
const title = Object.fromEntries(navItems.map(([key, value]) => [key, value]));
let toastTimer;

function toast(message, error = false) {
  document.querySelector('.toast')?.remove();
  const box = document.createElement('div');
  box.className = `toast${error ? ' error' : ''}`;
  box.setAttribute('role', 'status');
  box.textContent = message;
  document.body.append(box);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.remove(), 3800);
}

function loginView() {
  return `<main class="login"><div class="login__visual"><img src="./hero/bedaya-center-hero.png" alt="استقبال مركز بداية"><div class="login__caption"><span class="kicker">نظام إدارة المركز</span><h2>رؤية أوضح لكل قرار مالي</h2><p>مساحة واحدة لمتابعة الحالات والتحصيلات والمصروفات بدقة وهدوء.</p></div></div><div class="login__panel"><div class="login__card"><div class="brand-lockup"><img src="./brand/bedaya-center-logo.jpeg" alt="شعار مركز بداية"><div><strong>بداية</strong><span>مركز بداية للطب النفسي وعلاج الإدمان</span></div></div><h1>مرحبًا بعودتك</h1><p class="login__lead">واجهة عربية لإدارة الحسابات والعمليات اليومية.</p><p class="notice">سجّل الدخول بحساب المركز. تُحفظ العمليات في قاعدة بيانات المركز المشتركة.</p><form class="login__form" data-form="login" novalidate>${field('البريد الإلكتروني أو اسم المستخدم', 'identity', 'text', 'autocomplete="username" placeholder="أدخل البريد أو اسم المستخدم" required')}<label class="field"><span>كلمة المرور</span><span class="password-wrap"><input name="password" type="password" autocomplete="current-password" placeholder="أدخل كلمة المرور" required><button type="button" class="text-control" data-toggle-password>إظهار</button></span></label><div class="login__actions"><button type="button" class="text-control" data-forgot>نسيت كلمة المرور؟</button></div><p class="form-error" data-login-error></p><button class="button button--wide" type="submit">تسجيل الدخول ${icon('chevron', 17)}</button></form><p class="login__footer">© ${new Date().getFullYear()} مركز بداية · نظام إدارة المركز</p></div></div></main>`;
}

function shell() {
  const menu = navItems.map(([key, label]) => `<a href="#${key}" class="nav-link${state.screen === key ? ' active' : ''}" data-screen="${key}" ${state.screen === key ? 'aria-current="page"' : ''}>${icon(key, 19)}<span>${label}</span></a>`).join('');
  const bottom = navItems.slice(0, 4).concat([['reports', 'التقارير']]).map(([key, label]) => `<button type="button" data-screen="${key}" class="${state.screen === key ? 'active' : ''}">${icon(key, 20)}<span>${label}</span></button>`).join('');
  return `<div class="shell${state.menu ? ' menu-open' : ''}"><aside class="sidebar"><div class="brand-lockup"><img src="./brand/bedaya-center-logo.jpeg" alt="شعار بداية"><div><strong>بداية</strong><span>إدارة المركز والحسابات</span></div></div><span class="sidebar__label">مساحة العمل</span><nav aria-label="التنقل الرئيسي">${menu}</nav><div class="sidebar__bottom"><span class="demo-pill">● متصل بالخادم</span><p>البيانات حسب صلاحيات حسابك.</p></div></aside><div class="workspace"><header class="topbar"><div class="topbar__right"><button type="button" class="icon-btn mobile-menu" data-menu aria-label="فتح القائمة">${icon('dashboard', 18)}</button><div><strong class="topbar__title">${title[state.screen]}</strong><span class="topbar__sub">مركز بداية للطب النفسي وعلاج الإدمان</span></div></div><div class="topbar__left"><span class="demo-pill">${esc(state.user?.name)}</span><button class="text-control" data-refresh>تحديث</button><button class="text-control" data-logout>خروج</button></div></header><main class="content" id="main">${screen()}</main></div><nav class="mobile-nav" aria-label="تنقل الهاتف">${bottom}</nav>${state.menu ? '<div class="overlay" data-menu-close></div>' : ''}${state.modal || state.detail ? modalView() : ''}</div>`;
}

const pageHead = (heading, sub, actions = '') => `<div class="page-head"><div><h1>${heading}</h1><p>${sub}</p></div>${actions ? `<div class="page-head__actions">${actions}</div>` : ''}</div>`;
const addButton = (kind, label) => `<button class="button button--teal" type="button" data-open="${kind}">${icon('plus', 17)} ${label}</button>`;
const metric = (label, value, hint, symbol, tone = '') => `<article class="section-card metric ${tone}"><div class="metric__icon">${icon(symbol, 20)}</div><span>${label}</span><strong>${value}</strong><small>${hint}</small></article>`;

function dashboard() {
  const d = state.data, t = today(), month = summary(d, state.report), day = summary(d, { from: t, to: t, branch:state.report.branch });
  const last = [...d.collections.filter(x=>!x.voided&&(!state.report.branch||d.cases.find(c=>c.id===x.caseId)?.branch===state.report.branch))].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const days = Array.from({ length: 7 }, (_, i) => { const x = new Date(`${t}T12:00:00`); x.setDate(x.getDate() - (6 - i)); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; });
  const values = days.map(date => summary(d,{from:date,to:date,branch:state.report.branch}).collected);
  const max = Math.max(...values, 1);
  return `${filterBar(state.report,'',availableBranches)}<section class="dashboard-hero"><div><span class="dashboard-hero__tag">ملخص اليوم · ${dateLabel(t)}</span><h2>صباح الخير، أهلاً بك في بداية</h2><p>تابع حركة المركز المالية والحالات من مكان واحد.</p></div><div class="dashboard-hero__side"><span>حالات نشطة</span><strong>${d.cases.filter(x => x.status === 'نشطة').length} حالات</strong></div></section>${pageHead('نظرة عامة', 'حركات الفترة المختارة؛ الأرصدة والعدد لقطة حالية.', addButton('collection', 'تحصيل جديد'))}<div class="grid grid--4">${metric('تحصيلات اليوم', money(day.collected), `${day.collections} حركة تحصيل`, 'collections')}${metric('تحصيلات الفترة', money(month.collected), 'إيراد محصّل فعليًا', 'reports', 'metric--navy')}${metric('مصروفات الفترة', money(month.expenseTotal), 'بدون الرواتب المدفوعة', 'expenses', 'metric--rose')}${metric('أرصدة مستحقة', money(month.outstanding), 'رصيد جميع الحالات الحالي', 'cases', 'metric--amber')}</div>${reportDetail(state, false)}${comparisonChart(state)}<div class="two-column"><section class="section-card"><div class="section-card__head"><div><h2>حركة التحصيل خلال 7 أيام</h2><p>حسب تاريخ استلام المبلغ</p></div></div><div class="mini-chart" role="img" aria-label="أعمدة تحصيلات آخر سبعة أيام">${days.map((date, i) => `<div class="mini-chart__bar" style="height:${Math.max(7, values[i] / max * 100)}%" title="${dateLabel(date)}: ${money(values[i])}"><span>${date.slice(-2)}</span></div>`).join('')}</div><p class="chart-note">صافي الحركة النقدية للفترة: <strong>${money(month.cashFlow)}</strong> · التحصيلات − المصروفات − الرواتب المدفوعة. ليس صافي الربح المحاسبي.</p></section><section class="section-card"><div class="section-card__head"><div><h2>آخر التحصيلات</h2><p>أحدث الحركات المسجلة</p></div><button class="text-control" data-screen="collections">عرض الكل</button></div><ul class="activity-list">${last.map(row => `<li><span class="activity-list__icon">${icon('collections', 16)}</span><span class="activity-list__main"><strong>${esc(row.caseId)}</strong><small>${dateLabel(row.date)} · ${esc(row.method)}</small></span><span class="activity-list__value">${money(row.amount)}</span></li>`).join('')}</ul></section></div>`;
}

function casesScreen() {
  const { q, branch } = state.filters.cases;
  const records = state.data.cases.filter(row => (!branch || row.branch === branch) && (!q || `${row.id} ${row.name}`.toLowerCase().includes(q.toLowerCase())));
  return `${pageHead('إدارة الحالات', 'بيانات إدارية مختصرة بدون تشخيصات أو تفاصيل طبية حساسة.', addButton('case', 'إضافة حالة'))}<div class="section-card toolbar"><input class="search-input" data-filter="cases.q" value="${esc(q)}" placeholder="ابحث برقم الحالة أو اسم العرض" aria-label="ابحث عن حالة"><label class="field"><span>الفرع</span><select data-filter="cases.branch">${branchOptions(availableBranches).map(([value, label]) => `<option value="${esc(value)}" ${value === branch ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></label></div><section class="section-card"><div class="section-card__head"><div><h2>سجل الحالات</h2><p>${records.length} من ${state.data.cases.length} حالات</p></div></div>${table(['رقم الحالة', 'الحالة والفرع', 'تاريخ الدخول', 'الرسوم المتفق عليها', 'المحصّل', 'المتبقي', 'الحالة'], caseRows(state.data, records))}</section>`;
}

function collectionsScreen() {
  const branch = state.filters.collections.branch;
  const rows = [...state.data.collections].filter(row => { const c = state.data.cases.find(x => x.id === row.caseId); return c && (!branch || c.branch === branch) && matchFilters(row,state.filters.collections); }).sort((a, b) => b.date.localeCompare(a.date));
  const body = rows.map(row => `<tr><td><strong>${esc(row.receipt)}</strong></td><td><button class="table-link" data-case-detail="${esc(row.caseId)}">${esc(row.caseId)}</button></td><td>${esc(state.data.cases.find(x=>x.id===row.caseId)?.name || '')}</td><td>${dateLabel(row.date)}<small>${esc(row.time||'')}</small></td><td><strong>${money(row.amount)}</strong></td><td>${esc(row.method)}</td><td>${esc(state.data.cases.find(x => x.id === row.caseId)?.branch || '')}</td><td>${esc(row.user)}<small>${timestampLabel(row.createdAt)}</small>${paymentActions(row,state.user)}</td></tr>`).join('');
  return `${pageHead('التحصيلات', 'كل دفعة حركة مستقلة بتاريخها وإيصالها، ويمكن للحالة الواحدة عدة دفعات.', addButton('collection', 'تسجيل تحصيل'))}<div class="section-card toolbar"><label class="field"><span>الفرع</span><select data-filter="collections.branch">${branchOptions(availableBranches).map(([value, label]) => `<option value="${esc(value)}" ${value === branch ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></label></div>${filterBar(state.filters.collections,'collections')}<section class="section-card"><div class="section-card__head"><div><h2>حركات التحصيل</h2><p>${rows.length} حركة في العرض الحالي</p></div><strong>${money(total(rows.filter(x=>!x.voided)))}</strong></div>${table(['الإيصال', 'رقم الحالة', 'اسم الحالة', 'تاريخ التحصيل', 'المبلغ', 'طريقة الدفع', 'الفرع', 'التسجيل والتصحيح'], body)}<div class="table-footer">المبالغ هنا محصّلة بالفعل، وليست إجمالي الرسوم المتفق عليها.</div></section>`;
}

function expensesScreen() {
  const branch = state.filters.expenses.branch;
  const rows = [...state.data.expenses].filter(row => (!branch || row.branch === branch) && matchFilters(row,state.filters.expenses)).sort((a, b) => b.date.localeCompare(a.date));
  const body = rows.map(row => `<tr><td><strong>${esc(row.id)}</strong></td><td>${dateLabel(row.date)}</td><td>${esc(row.category)}</td><td>${esc(row.description)}</td><td>${esc(row.branch)}</td><td>${esc(row.user)}</td><td><strong>${money(row.amount)}</strong>${row.voided?'ملغاة: '+esc(row.voidReason):`<button class="text-control" data-void="expenses" data-id="${esc(row.id)}">إلغاء موثّق</button>`}</td></tr>`).join('');
  return `${pageHead('المصروفات', 'تتبّع المصروفات التشغيلية حسب تاريخها وفرعها وتصنيفها.', addButton('expense', 'إضافة مصروف'))}<div class="section-card toolbar"><label class="field"><span>الفرع</span><select data-filter="expenses.branch">${branchOptions(availableBranches).map(([value, label]) => `<option value="${esc(value)}" ${value === branch ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></label></div>${filterBar(state.filters.expenses,'expenses')}<section class="section-card"><div class="section-card__head"><div><h2>سجل المصروفات</h2><p>${rows.length} حركة</p></div><strong>${money(total(rows.filter(x=>!x.voided)))}</strong></div>${table(['المرجع', 'التاريخ', 'التصنيف', 'البيان', 'الفرع', 'المسجل', 'المبلغ'], body)}</section>`;
}

function reportsScreen() {
  const d = state.data, f = state.report, s = summary(d, f);
  const branchOpts = branchOptions(availableBranches).map(([v, l]) => `<option value="${esc(v)}" ${v === f.branch ? 'selected' : ''}>${esc(l)}</option>`).join('');
  return `${pageHead('التقارير المالية', 'فلترة شاملة بالتاريخ الفعلي والفرع، مع فصل الفوترة عن التحصيل.')}<section class="section-card"><div class="section-card__head"><h2>نطاق التقرير</h2></div><form class="section-card__body report-filters" data-form="report"><label class="field"><span>من تاريخ</span><input type="date" name="from" value="${esc(f.from)}"></label><label class="field"><span>إلى تاريخ</span><input type="date" name="to" value="${esc(f.to)}"></label><label class="field"><span>الفرع</span><select name="branch">${branchOpts}</select></label><button class="button button--teal" type="submit">تطبيق الفلاتر</button></form><div class="summary-strip"><button type="button" class="text-control" data-period="today">اليوم</button><button type="button" class="text-control" data-period="week">هذا الأسبوع</button><button type="button" class="text-control" data-period="month">هذا الشهر</button><button type="button" class="text-control" data-period="year">هذا العام</button><button type="button" class="text-control" data-period="all">كل الفترات</button></div></section><div class="grid grid--4" style="margin-top:16px">${metric('الرسوم المتفق عليها', money(s.billed), 'لحالات بدأت داخل الفترة', 'cases', 'metric--navy')}${metric('تحصيلات فعلية', money(s.collected), `${s.collections} دفعة داخل الفترة`, 'collections')}${metric('مصروفات', money(s.expenseTotal), 'داخل الفترة المحددة', 'expenses', 'metric--rose')}${metric('رواتب مدفوعة', money(s.salariesPaid), 'بحسب تاريخ الصرف', 'employees', 'metric--amber')}</div><div class="grid grid--2" style="margin-top:16px">${metric('الرصيد المستحق الحالي', money(s.outstanding), 'لقائمة حالات الفرع، بغض النظر عن تاريخ الفلتر', 'cases', 'metric--amber')}${metric('التدفق النقدي التشغيلي', money(s.cashFlow), 'تحصيلات − مصروفات − رواتب مدفوعة', 'reports')}</div>${reportDetail(state)}<p class="report-note">التدفق النقدي لا يساوي صافي الربح؛ لا يشمل التسويات أو الاستحقاقات المحاسبية أو البنود غير النقدية. الأرصدة المستحقة لقطة حالية، بينما بقية الأرقام تعتمد الفترة المختارة.</p>`;
}

function screen() {
  const area=({dashboard:'reports',cases:'cases',collections:'finance',expenses:'finance',employees:'employees',payroll:'payroll',advances:'payroll',reports:'reports',users:'users',audit:'audit',settings:'settings'})[state.screen];
  if(state.screen==='users'&&state.user.role!=='Super Admin')return '<p class="notice">إدارة الحسابات متاحة لمدير النظام فقط.</p>';
  if(!can(state.user,area))return '<p class="notice">ليس لديك صلاحية عرض هذا القسم.</p>';

  const extra=extraScreen(state); if(extra!==null) return extra;
  return ({ dashboard, cases: casesScreen, collections: collectionsScreen, expenses: expensesScreen, reports: reportsScreen })[state.screen]();
}

function modalView() {
  if (state.detail) {
    const c = state.data.cases.find(x => x.id === state.detail);
    if (!c) return '';
    return caseDetail(state,c);
  }
  const kind = state.modal;
  const branches = availableBranches.map(x => [x, x]);
  const caseOptions = state.data.cases.map(x => [x.id, `${x.id} — ${x.name}`]);
  const forms = {
    case: { title: 'إضافة حالة', body: `<p class="report-note span-2">أدخل المبلغ المتفق عليه بالكامل. بعد الحفظ اضغط «تسجيل دفعة» لتسجيل أي جزء مدفوع أو المبلغ بالكامل؛ سيُحسب المتبقي تلقائيًا وتظهر الدفعة في التحصيلات.</p>${field('اسم العرض', 'name', 'text', 'placeholder="اسم الحالة المسجل بالمركز" required')}${selectField('الفرع', 'branch', branches, 'required')}${selectField('الحالة', 'status', [['نشطة', 'نشطة'], ['خرجت', 'خرجت'], ['مغلقة', 'مغلقة']])}${field('تاريخ الدخول', 'admission', 'date', `value="${today()}" required`)}${field('تاريخ الخروج', 'discharge', 'date')}${field('المبلغ المتفق عليه بالكامل (ج.م)', 'fee', 'number', 'min="0" step="0.01" required')}${field('الهاتف (اختياري)', 'phone', 'tel', 'inputmode="tel"')}${field('ملاحظات إدارية','note')}` },
    expense: { title: 'إضافة مصروف', body: `${field('المبلغ (ج.م)', 'amount', 'number', 'min="1" step="1" required')}${selectField('التصنيف', 'category', ['الإيجار', 'الأدوية والمستلزمات', 'الطعام', 'الكهرباء والمياه', 'صيانة', 'مصروفات إدارية', 'أخرى'].map(x => [x, x]))}${field('تاريخ المصروف', 'date', 'date', `value="${today()}" required`)}${selectField('الفرع', 'branch', branches)}${field('وقت المصروف','time','time',`value="${new Date().toTimeString().slice(0,5)}" required`)}${selectField('طريقة الدفع','method',['نقدي','تحويل بنكي','بطاقة'].map(x=>[x,x]))}${field('ملاحظات','note')}<label class="field span-2"><span>البيان</span><textarea name="description" required></textarea></label>` },
  };
  const form = kind==='collection' ? paymentForm(state) : extraForm(kind,state) || forms[kind];
  if (!form) return '';
  return `<div class="overlay" data-close></div><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><header class="dialog__head"><h2 id="dialog-title">${form.title}</h2><button class="icon-btn" data-close aria-label="إغلاق">${icon('close')}</button></header><div class="dialog__body"><p class="notice">ستسجل العملية باسم حسابك مع الاحتفاظ بأثرها.</p><form data-form="${kind}"><div class="form-grid">${form.body}</div><p class="form-error" data-form-error></p><div class="dialog__actions"><button class="button button--ghost" type="button" data-close>إلغاء</button><button class="button button--teal" type="submit">حفظ</button></div></form></div></section>`;
}

function render() {
  root.innerHTML = state.recovery ? `<main class="login__panel"><div class="login__card"><h1>تعيين كلمة مرور جديدة</h1><form data-form="recovery">${field('كلمة المرور الجديدة','password','password','minlength="12" required autocomplete="new-password"')}${field('تأكيد كلمة المرور','confirm','password','minlength="12" required autocomplete="new-password"')}<p class="form-error" data-form-error></p><button class="button" type="submit">تحديث كلمة المرور</button></form></div></main>` : state.entered ? shell() : loginView();
  if(state.entered) { for(const section of ['collections','expenses'])for(const key of ['method','category']){const el=root.querySelector(`[data-section="${section}"] [name="${key}"]`);if(el)el.value=state.filters[section][key]||'';}root.querySelectorAll('[data-form="report"] [name="branch"]').forEach(x=>x.value=state.report.branch||'');const map={case:'cases',caseEdit:'cases',collection:'finance',expense:'finance',employee:'employees',employeeEdit:'employees',salary:'payroll',salaryPayment:'payroll',advance:'payroll',repayment:'payroll',user:'users',branch:'settings'};
   root.querySelectorAll('[data-open]').forEach(el=>{el.disabled=!can(state.user,map[el.dataset.open]);});
   if(state.modal){const dialog=root.querySelector('.dialog');if(dialog)dialog.querySelector('input,select,button')?.focus();}
  }
  document.title = `${state.entered ? title[state.screen] : 'دخول المعاينة'} | بداية`;
}

function closeModal() { state.editId='';state.modal = ''; state.detail = state.paymentCase || '';state.paymentCase='';render(); }
function errorFor(form,message){const field=form?.querySelector('[data-form-error]');if(field)field.textContent=message;toast(message,true);}
function resetLiveState(message='') {
 state.entered=false;state.recovery=false;state.mode='unconfigured';state.user=null;state.data=emptyData();
 state.modal='';state.detail='';state.editId='';state.paymentCase='';state.menu=false;state.screen='dashboard';availableBranches=[];
 state.filters={cases:{q:'',branch:''},collections:{branch:'',q:'',from:'',to:'',method:''},expenses:{branch:'',q:'',from:'',to:'',category:''}};
 render();if(message)toast(message,true);
}
function liveRepository(){return new SupabaseRepository({onSessionExpired:message=>resetLiveState(message)});}
function handleFailure(error,form){
 if(error instanceof SessionError){if(state.entered||state.recovery)resetLiveState(error.message);else toast(error.message,true);return;}
 errorFor(form,error.message);
}

async function submitData(form, kind) {
  if(state.busy) return;
  const f=Object.fromEntries(new FormData(form));
  if(['user','userEdit'].includes(kind)) { f.permissions=new FormData(form).getAll('permissions');f.branches=new FormData(form).getAll('branches'); }
  if(state.editId) f.id=state.editId;
  state.busy=true; const button=form.querySelector('[type="submit"]');if(button)button.disabled=true;
  try { const previousCaseIds=new Set(state.data.cases.map(c=>c.id));state.data=await repository.command(state.user,kind,f); availableBranches=state.data.branches;state.modal='';state.detail=kind==='case' ? state.data.cases.find(c=>!previousCaseIds.has(c.id))?.id||'' : kind==='collection' ? state.paymentCase || '' : '';state.paymentCase='';state.editId='';render();toast('تم حفظ العملية في قاعدة بيانات المركز.'); }
  catch(e) {handleFailure(e,form);} finally {state.busy=false;if(button)button.disabled=false;}
}

root.addEventListener('click', async event => {
  const target = event.target;
  if(target.closest('[data-refresh]')) {try{state.data=await repository.load();if(state.mode==='live'){state.user=state.data.currentUser;if(!state.user)throw new SessionError('الحساب معطل أو انتهت الجلسة.');}availableBranches=state.data.branches;render();toast('تم تحديث البيانات المتاحة.');}catch(e){handleFailure(e);}return;}
  if(target.closest('[data-logout]')) {try {if(state.mode==='live')await repository.logout();}catch(e){handleFailure(e);}resetLiveState();return;}
  const edit=target.closest('[data-edit-case],[data-edit-employee],[data-edit-user]');
  if(edit) {const key=edit.dataset.editCase?'cases':edit.dataset.editEmployee?'employees':'users';const id=edit.dataset.editCase||edit.dataset.editEmployee||edit.dataset.editUser;state.editId=id;state.modal=key==='cases'?'caseEdit':key==='employees'?'employeeEdit':'userEdit';state.detail='';render();const row=state.data[key].find(x=>x.id===id);const form=root.querySelector('form[data-form]');for(const [k,v] of Object.entries(row)) {const el=form.elements.namedItem(k);if(el&&el.tagName)el.value=String(v);}for(const el of form.querySelectorAll('[type=checkbox]'))el.checked=(row[el.name]||[]).includes(el.value);return;}
  const cancel=target.closest('[data-void]');
  if(cancel) {const reason=prompt('سبب الإلغاء: ستظل الحركة الأصلية محفوظة في السجل.');if(!reason)return;if(!confirm('تأكيد إلغاء الحركة مع الاحتفاظ بأثرها؟'))return;try {state.data=await repository.command(state.user,'void',{entity:cancel.dataset.void,id:cancel.dataset.id,reason});render();}catch(e){handleFailure(e);}return;}
  const exp=target.closest('[data-export]');if(exp){try{await exportReport(state,exp.dataset.export);}catch(e){handleFailure(e);}return;}
  const reset=target.closest('[data-reset-user]');if(reset){if(state.mode!=='live')return toast('إعادة التعيين الآمنة تتطلب Supabase.');try{await repository.command(state.user,'resetPassword',{id:reset.dataset.resetUser});toast('تم إرسال رابط آمن للبريد المسجل.');}catch(e){handleFailure(e);}return;}

  const screenButton = target.closest('[data-screen]');
  if (screenButton) { event.preventDefault();if(state.mode==='live'){try{const data=await repository.load();if(!data.currentUser?.active)throw new SessionError('الحساب معطل أو انتهت الجلسة.');state.data=data;state.user=data.currentUser;availableBranches=data.branches;}catch(e){handleFailure(e);return;}} state.paymentCase='';state.screen = screenButton.dataset.screen; state.menu = false; state.modal = ''; state.detail = ''; render(); window.scrollTo(0, 0); return; }
  if (target.closest('[data-toggle-password]')) { const input = root.querySelector('[name="password"]'); input.type = input.type === 'password' ? 'text' : 'password'; target.closest('button').textContent = input.type === 'password' ? 'إظهار' : 'إخفاء'; return; }
  if (target.closest('[data-forgot]')) {if(!connected())return toast('استعادة كلمة المرور تتطلب ربط Supabase.');const identity=root.querySelector('[name="identity"]').value.trim();if(!identity)return toast('أدخل البريد الإلكتروني أو اسم المستخدم أولًا.',true);try{await new SupabaseRepository().recover(identity);toast('إذا كان الحساب موجودًا سيصلك رابط آمن.');}catch(e){handleFailure(e);}return;}
  if (target.closest('[data-menu]')) { state.menu = !state.menu; render(); return; }
  if (target.closest('[data-menu-close]')) { state.menu = false; render(); return; }
  if (target.closest('[data-close]')) return closeModal();
  const detail = target.closest('[data-case-detail]');
  if (detail) { state.paymentCase='';state.detail = detail.dataset.caseDetail; state.modal = ''; render(); return; }
  const open = target.closest('[data-open]');
  if (open) { document.querySelector('.toast')?.remove();state.editId='';state.paymentCase=open.dataset.case || '';state.modal = open.dataset.open; state.detail = ''; render();return; }
  const period = target.closest('[data-period]');
  if (period) { const t = today(); const week=new Date(t+'T12:00:00');week.setDate(week.getDate()-((week.getDay()+1)%7));const weekStart=`${week.getFullYear()}-${String(week.getMonth()+1).padStart(2,'0')}-${String(week.getDate()).padStart(2,'0')}`; state.report.from = period.dataset.period==='week'?weekStart:period.dataset.period==='year'?t.slice(0,4)+'-01-01':period.dataset.period === 'today' ? t : period.dataset.period === 'month' ? monthStart(t) : ''; state.report.to = period.dataset.period === 'all' ? '' : t; render(); }
});

root.addEventListener('input',event=>{if(event.target.matches('[data-filter="cases.q"]')){const value=event.target.value,position=event.target.selectionStart;state.filters.cases.q=value;render();const input=root.querySelector('[data-filter="cases.q"]');input.focus();input.setSelectionRange(position,position);return;}if(event.target.matches('[data-table-search]')){const q=event.target.value.trim();root.querySelectorAll('tbody tr').forEach(tr=>tr.hidden=!tr.textContent.includes(q));}});
root.addEventListener('change', event => {
  const key = event.target.dataset.filter;
  if (!key || key === 'cases.q') return;
  const [section, name] = key.split('.');
  state.filters[section][name] = event.target.value;
  render();
});

root.addEventListener('submit', async event => {
  const form = event.target.closest('form[data-form]');
  if (!form) return;
  event.preventDefault();
  const kind = form.dataset.form;
  if(kind==='recovery'){if(form.elements.password.value!==form.elements.confirm.value)return errorFor(form,'كلمتا المرور غير متطابقتين.');try{await repository.resetPassword(form.elements.password.value);await repository.logout();state.recovery=false;render();toast('تم تحديث كلمة المرور؛ سجّل الدخول من جديد.');}catch(e){handleFailure(e,form);}return;}
  if (kind === 'login') {
    const identity = form.elements.identity.value.trim(), password = form.elements.password.value;
    if (!identity || !password) { form.querySelector('[data-login-error]').textContent = 'أدخل اسم المستخدم وكلمة المرور لتسجيل الدخول.'; return; }
    if(!connected()) {form.querySelector('[data-login-error]').textContent='إعداد الاتصال بقاعدة البيانات غير صحيح. راجع مسؤول النظام.';return;}
    if(state.busy)return;state.busy=true;
    try {repository=liveRepository();state.data=await repository.login(identity,password);state.user=state.data.currentUser;availableBranches=state.data.branches;state.mode='live';state.entered=true;render();}catch(e){form.querySelector('[data-login-error]').textContent=e.message;}finally{state.busy=false;}return;
  }
  if(kind==='filters') {const f=Object.fromEntries(new FormData(form));if(f.from&&f.to&&f.from>f.to)return toast('نطاق التاريخ غير صحيح.',true);Object.assign(state.filters[form.dataset.section],f);render();return;}
  if (kind === 'report') {
    const f = Object.fromEntries(new FormData(form));
    if (f.from && f.to && f.from > f.to) return toast('تاريخ البداية يجب أن يسبق تاريخ النهاية.', true);
    state.report = f; render(); return;
  }
  submitData(form, kind);
});

const recoveryParams=new URLSearchParams(location.hash.slice(1));
if(recoveryParams.get('type')==='recovery'&&connected()&&recoveryParams.has('access_token')){repository=liveRepository();try{repository.setSession({access_token:recoveryParams.get('access_token'),refresh_token:recoveryParams.get('refresh_token'),expires_in:Number(recoveryParams.get('expires_in')||3600)});state.recovery=true;}catch(e){repository.clearSession();toast(e.message,true);}history.replaceState(null,'',location.pathname+location.search);}
render();

document.addEventListener('keydown',event=>{if(event.key==='Escape'&&(state.modal||state.detail))closeModal();if(event.key==='Tab'&&(state.modal||state.detail)){const els=[...root.querySelectorAll('.dialog button,.dialog input,.dialog select,.dialog textarea')].filter(x=>!x.disabled);if(!els.length)return;const first=els[0],last=els.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}});
