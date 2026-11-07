import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyData,execute} from '../src/service.js';
import {expenseMovements,expenseMovementTotals,summary} from '../src/finance.js';
import {ledger,matchFilters} from '../src/screens.js';

test('advance, cash return and salary deduction remain single-source cash movements',()=>{
 const actor={id:'test',name:'اختبار',role:'Super Admin',active:true,permissions:[],branches:[]};
 let d=emptyData();d.branches=['أ'];
 const cmd=(kind,input)=>{d=execute(d,actor,kind,input,crypto.randomUUID());};
 cmd('employee',{name:'موظف اختبار',role:'إداري',branch:'أ',salary:6000,hired:'2026-11-01'});
 const employeeId=d.employees[0].id;
 cmd('expense',{branch:'أ',amount:300,category:'أخرى',description:'مصروف',date:'2026-11-07'});
 cmd('advance',{employeeId,amount:1000,date:'2026-11-07'});
 assert.equal(d.expenses.length,1);
 assert.deepEqual(expenseMovementTotals(expenseMovements(d)),{operating:300,advances:1000,returned:0,outgoing:1300});
 assert.equal(summary(d).treasury,-1300);assert.equal(summary(d).expenseOutflowTotal,1300);
 cmd('repayment',{employeeId,amount:200,date:'2026-11-07'});
 cmd('salary',{employeeId,month:'2026-11',additions:0,deduction:0,advance:800,paid:5200,date:'2026-11-07'});
 const original=structuredClone(d),rows=expenseMovements(d);
 assert.equal(rows.length,3);assert.equal(rows.filter(x=>x.source==='advance').length,1);
 assert.equal(rows.find(x=>x.source==='advance').id,d.advances[0].id);
 assert.match(rows.find(x=>x.source==='advance').description,/موظف اختبار/);
 assert.deepEqual(expenseMovementTotals(rows),{operating:300,advances:1000,returned:200,outgoing:1300});
 assert.equal(summary(d).expenseOutflowTotal,1300);assert.equal(summary(d).advanceOutstanding,0);assert.equal(summary(d).treasury,-6300);
 const movements=ledger({data:d,report:{}});
 assert.equal(movements.reduce((s,x)=>s+x.outgoing,0),6500);
 assert.equal(movements.reduce((s,x)=>s+x.incoming,0),200);
 assert.deepEqual(d,original);assert.equal(d.expenses.length,1);
});

test('expense projection filters date, employee, branch and category and preserves void status',()=>{
 const d=emptyData();d.employees=[{id:'e',name:'أحمد',branch:'أ'}];
 d.expenses=[{id:'x',amount:500,voided:true,branch:'أ',category:'أخرى',date:'2026-11-07'}];
 d.advances=[{id:'a',employeeId:'e',amount:1000,date:'2026-11-07'},{id:'b',employeeId:'e',branch:'ب',amount:200,date:'2026-11-08'}];
 d.settlements=[{id:'cash',employeeId:'e',amount:100,kind:'cash',date:'2026-11-07'},{id:'salary',employeeId:'e',amount:900,kind:'salary',date:'2026-11-07'}];
 const rows=expenseMovements(d);
 assert.equal(rows.length,4);
 const filtered=rows.filter(x=>x.branch==='أ'&&matchFilters(x,{from:'2026-11-07',to:'2026-11-07',q:'أحمد',category:'سلفة موظف'}));
 assert.equal(filtered.length,1);assert.equal(filtered[0].id,'a');
 assert.deepEqual(expenseMovementTotals(rows),{operating:0,advances:1200,returned:100,outgoing:1200});
 assert.equal(rows.find(x=>x.id==='x').voided,true);
});
