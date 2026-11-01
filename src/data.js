const localDay = (offset = 0) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const today = () => localDay();
export const demoBranches = ['فرع القاهرة', 'فرع الجيزة', 'فرع الإسكندرية'];

export const demoData = {
  cases: [
    { id: 'BD-2401', name: 'حالة تجريبية ٠١', phone: '', branch: 'فرع القاهرة', admission: localDay(-28), discharge: '', fee: 42000, status: 'نشطة' },
    { id: 'BD-2402', name: 'حالة تجريبية ٠٢', phone: '', branch: 'فرع الجيزة', admission: localDay(-21), discharge: '', fee: 36000, status: 'نشطة' },
    { id: 'BD-2403', name: 'حالة تجريبية ٠٣', phone: '', branch: 'فرع القاهرة', admission: localDay(-18), discharge: '', fee: 28500, status: 'نشطة' },
    { id: 'BD-2404', name: 'حالة تجريبية ٠٤', phone: '', branch: 'فرع الإسكندرية', admission: localDay(-15), discharge: '', fee: 54000, status: 'نشطة' },
    { id: 'BD-2405', name: 'حالة تجريبية ٠٥', phone: '', branch: 'فرع الجيزة', admission: localDay(-11), discharge: '', fee: 32000, status: 'نشطة' },
    { id: 'BD-2406', name: 'حالة تجريبية ٠٦', phone: '', branch: 'فرع القاهرة', admission: localDay(-9), discharge: localDay(-2), fee: 24000, status: 'مغلقة' },
    { id: 'BD-2407', name: 'حالة تجريبية ٠٧', phone: '', branch: 'فرع الإسكندرية', admission: localDay(-6), discharge: '', fee: 46000, status: 'نشطة' },
    { id: 'BD-2408', name: 'حالة تجريبية ٠٨', phone: '', branch: 'فرع القاهرة', admission: localDay(-3), discharge: '', fee: 37500, status: 'نشطة' },
  ],
  collections: [
    ['R-1001', 'BD-2401', 18000, -25, 'تحويل بنكي'], ['R-1002', 'BD-2401', 9000, -5, 'نقدي'],
    ['R-1003', 'BD-2402', 14000, -20, 'بطاقة'], ['R-1004', 'BD-2402', 8000, -3, 'تحويل بنكي'],
    ['R-1005', 'BD-2403', 12500, -16, 'نقدي'], ['R-1006', 'BD-2404', 26000, -12, 'تحويل بنكي'],
    ['R-1007', 'BD-2404', 10000, -2, 'بطاقة'], ['R-1008', 'BD-2405', 12000, -9, 'نقدي'],
    ['R-1009', 'BD-2406', 24000, -7, 'تحويل بنكي'], ['R-1010', 'BD-2407', 19000, -5, 'بطاقة'],
    ['R-1011', 'BD-2408', 15000, 0, 'نقدي'], ['R-1012', 'BD-2405', 7000, 0, 'تحويل بنكي'],
  ].map(([id, caseId, amount, offset, method]) => ({ id, caseId, amount, date: localDay(offset), method, receipt: id, note: '' })),
  expenses: [
    ['EX-301', 4300, 'مستلزمات تشغيل', -12, 'مشتريات تشغيلية', 'فرع القاهرة'],
    ['EX-302', 2200, 'مرافق', -8, 'فاتورة مرافق', 'فرع الجيزة'],
    ['EX-303', 5800, 'صيانة', -6, 'صيانة دورية', 'فرع الإسكندرية'],
    ['EX-304', 1750, 'مستلزمات تشغيل', -3, 'مستلزمات مكتبية', 'فرع القاهرة'],
    ['EX-305', 3100, 'مرافق', -1, 'مرافق الفرع', 'فرع الإسكندرية'],
    ['EX-306', 1400, 'أخرى', 0, 'مصاريف تشغيلية', 'فرع الجيزة'],
  ].map(([id, amount, category, offset, description, branch]) => ({ id, amount, category, date: localDay(offset), description, branch, user: 'حساب تجريبي' })),
  employees: [
    { id: 'EMP-01', name: 'موظف تجريبي ٠١', branch: 'فرع القاهرة', role: 'إدارة', salary: 12500 },
    { id: 'EMP-02', name: 'موظف تجريبي ٠٢', branch: 'فرع الجيزة', role: 'استقبال', salary: 7800 },
    { id: 'EMP-03', name: 'موظف تجريبي ٠٣', branch: 'فرع الإسكندرية', role: 'محاسبة', salary: 9400 },
  ],
  payroll: [
    { id: 'SAL-01', employeeId: 'EMP-01', month: localDay().slice(0, 7), date: localDay(-3), advance: 1000, deduction: 500, paid: 11000 },
    { id: 'SAL-02', employeeId: 'EMP-02', month: localDay().slice(0, 7), date: localDay(-2), advance: 500, deduction: 0, paid: 7300 },
    { id: 'SAL-03', employeeId: 'EMP-03', month: localDay().slice(0, 7), date: localDay(-1), advance: 0, deduction: 400, paid: 9000 },
  ],
};

export const cloneDemoData = () => structuredClone(demoData);
