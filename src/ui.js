import { money, dateLabel, caseBalance, casePaid, caseFinancials } from './finance.js';

export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const icon = (name, size = 20) => {
  const paths = {
    dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    cases: '<path d="M8 3h8l2 2v16H6V5l2-2Z"/><path d="M9 10h6M9 14h6M9 18h4"/>',
    collections: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',
    expenses: '<path d="M4 7h16v13H4zM8 7V4h8v3M8 13h8M12 10v6"/>',
    employees: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 6a3 3 0 0 1 0 6M17 15a5 5 0 0 1 4 5"/>',
    reports: '<path d="M4 20V4M4 20h16M8 16v-5M13 16V7M18 16v-8"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    users: '<circle cx="12" cy="8" r="3"/><path d="M5 21v-2a7 7 0 0 1 14 0v2M3 4h3M18 4h3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
    close: '<path d="M5 5l14 14M19 5 5 19"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>',
    shield: '<path d="m12 2 8 4v5c0 5-3 9-8 11-5-2-8-6-8-11V6l8-4Z"/><path d="m9 12 2 2 4-4"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.dashboard}</svg>`;
};

export const navItems = [
  ['dashboard', 'الرئيسية'], ['cases', 'الحالات'], ['collections', 'التحصيلات'],
  ['expenses', 'المصروفات'], ['employees', 'الموظفون'], ['payroll','الرواتب'], ['advances','السلف'], ['reports', 'التقارير'],
  ['audit','سجل النشاط'], ['settings', 'الإعدادات'], ['users', 'المستخدمون'],
];

export const badge = status => `<span class="status ${status === 'نشطة' ? 'status--active' : 'status--muted'}">${esc(status)}</span>`;
export const empty = message => `<div class="empty-state">${icon('cases', 28)}<strong>لا توجد نتائج</strong><p>${esc(message)}</p></div>`;
export const field = (label, name, type = 'text', extra = '') => `<label class="field"><span>${label}</span><input name="${name}" type="${type}" ${extra}></label>`;
export const selectField = (label, name, options, extra = '') => `<label class="field"><span>${label}</span><select name="${name}" ${extra}>${options.map(([value, text]) => `<option value="${esc(value)}">${esc(text)}</option>`).join('')}</select></label>`;
export const branchOptions = branches => [['', 'كل الفروع'], ...branches.map(x => [x, x])];
export const caseRows = (data, records) => records.map(record => `<tr><td><button class="table-link" data-case-detail="${esc(record.id)}">${esc(record.id)}</button></td><td><strong>${esc(record.name)}</strong><small>${esc(record.branch)}</small></td><td>${dateLabel(record.admission)}</td><td>${money(record.fee)}</td><td>${money(casePaid(data, record.id))}</td><td><strong class="balance">${money(caseBalance(data, record))}</strong></td><td>${badge(record.status)}<small>${caseFinancials(data,record).status}</small></td></tr>`).join('');
export const table = (head, body, emptyMessage = 'لا توجد سجلات مطابقة.') => body ? `<div class="table-scroll"><table><thead><tr>${head.map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>` : empty(emptyMessage);
