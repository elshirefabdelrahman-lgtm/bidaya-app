import test from 'node:test';import assert from 'node:assert/strict';
import {emptyData,execute,advanceBalance,salaryNet,salaryPaid} from '../src/service.js';
import {caseBalance,casePaid,summary} from '../src/finance.js';import {workbook} from '../src/xlsx.js';import {unzipSync,strFromU8} from 'fflate';
const user={id:'admin',name:'مدير اختبار',active:true,role:'Super Admin'};
const setup=()=>{const d=emptyData();d.branches=['القاهرة','الجيزة'];return d;};
const caseInput={name:'حالة اختبار',branch:'القاهرة',admission:'2026-11-01',fee:30000,status:'نشطة'};
const pay=(amount,receipt)=>({caseId:'001',amount,receipt,date:'2026-11-01',method:'نقدي'});
test('automatic serial, three partial payments and full payment; no contract recorded as cash',()=>{
 let d=execute(setup(),user,'case',caseInput);assert.equal(d.cases[0].id,'001');assert.equal(summary(d).collected,0);
 for(const [i,n]of [10000,5000,3000].entries())d=execute(d,user,'collection',pay(n,'R'+i));
 assert.equal(casePaid(d,'001'),18000);assert.equal(caseBalance(d,d.cases[0]),12000);
 d=execute(d,user,'collection',pay(12000,'R3'));assert.equal(caseBalance(d,d.cases[0]),0);
 assert.throws(()=>execute(d,user,'collection',pay(1,'over')),/أكبر من الرصيد/);
});
test('invalid dates, money, duplicate receipts and replayed requests',()=>{
 let d=execute(setup(),user,'case',caseInput);const id=crypto.randomUUID();d=execute(d,user,'collection',pay(10,'R'),id);
 assert.equal(execute(d,user,'collection',pay(10,'R'),id).collections.length,1);
 assert.throws(()=>execute(d,user,'collection',pay(10,'R')),/الإيصال/);
 for(const v of [NaN,-1,Infinity,1.001])assert.throws(()=>execute(d,user,'collection',pay(v,'bad')));
 assert.throws(()=>execute(d,user,'collection',{...pay(1,'bad'),date:'2026-02-30'}),/التاريخ/);
});
test('payroll additions, deductions, advances, partial salary and cash return avoid double counting',()=>{
 let d=execute(setup(),user,'employee',{name:'أحمد',role:'إداري',branch:'القاهرة',salary:6000,hired:'2026-11-01'});const eid=d.employees[0].id;
 for(const n of [1000,500])d=execute(d,user,'advance',{employeeId:eid,amount:n,date:'2026-11-01'});
 d=execute(d,user,'repayment',{employeeId:eid,amount:200,date:'2026-11-01'});
 d=execute(d,user,'salary',{employeeId:eid,month:'2026-11',advance:1300,additions:200,deduction:100,paid:4000,date:'2026-11-01'});
 const s=d.payroll[0];assert.equal(salaryNet(s),4800);assert.equal(salaryPaid(d,s.id),4000);assert.equal(advanceBalance(d,eid),0);assert.equal(summary(d).salaryLiability,800);
 d=execute(d,user,'salaryPayment',{salaryId:s.id,amount:800,date:'2026-11-02'});assert.equal(summary(d).salaryLiability,0);
 assert.equal(summary(d).cashFlow,-4800);assert.equal(summary(d).treasury,-6100);
 assert.throws(()=>execute(d,user,'salaryPayment',{salaryId:s.id,amount:1,date:'2026-11-02'}),/باقي الراتب/);
 assert.throws(()=>execute(d,user,'salary',{employeeId:eid,month:'2026-11',advance:0,additions:0,deduction:0,paid:0,date:'2026-11-01'}),/مسجل/);
});
test('documented reversal preserves original and audit before and after',()=>{
 let d=execute(setup(),user,'case',caseInput);d=execute(d,user,'collection',pay(100,'R'));const id=d.collections[0].id;
 d=execute(d,user,'void',{entity:'collections',id,reason:'تصحيح'});assert.equal(d.collections[0].amount,100);assert.equal(casePaid(d,'001'),0);assert.equal(d.audit.at(-1).before.amount,100);assert.equal(d.audit.at(-1).after.voided,true);
 const before=d.cases[0].fee;d=execute(d,user,'caseEdit',{...d.cases[0],fee:35000});assert.equal(d.audit.at(-1).before.fee,before);assert.equal(d.audit.at(-1).after.fee,35000);
});
test('permissions and branches apply to commands; ordinary admin cannot grant roles',()=>{
 const limited={id:'e',name:'موظف',active:true,role:'Employee',permissions:['cases'],branches:['القاهرة']};
 const d=execute(setup(),limited,'case',caseInput);assert.throws(()=>execute(d,limited,'collection',pay(100,'R')),/صلاحية/);
 assert.throws(()=>execute(d,limited,'case',{...caseInput,branch:'الجيزة'}),/خارج صلاحياتك/);
 assert.throws(()=>execute(d,{...limited,active:false},'case',caseInput),/صلاحية/);
 assert.throws(()=>execute(d,{...limited,role:'Admin',permissions:['users']},'user',{name:'رفع صلاحيات'}),/مدير النظام/);
});
test('decimal amounts retain exact cents and branch/date reports use actual movement dates',()=>{
 let d=execute(setup(),user,'case',{...caseInput,fee:.3});d=execute(d,user,'collection',pay(.1,'1'));d=execute(d,user,'collection',pay(.2,'2'));assert.equal(casePaid(d,'001'),.3);assert.equal(caseBalance(d,d.cases[0]),0);
 assert.equal(summary(d,{from:'2026-11-02'}).collected,0);assert.equal(summary(d,{branch:'الجيزة'}).collected,0);
});
test('Excel is actual zipped OOXML with numeric amounts, RTL and safe literal strings',()=>{
 const files=unzipSync(workbook([{name:'تقرير',rows:[['=HYPERLINK("bad")',100],['<اسم>',1.5]]}]));const xml=strFromU8(files['xl/worksheets/sheet1.xml']);
 assert.match(xml,/rightToLeft="1"/);assert.match(xml,/<v>100<\/v>/);assert.match(xml,/&lt;اسم&gt;/);assert.ok(!xml.includes('<f>'));assert.ok(files['[Content_Types].xml']);
});
