import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyData} from '../src/service.js';
import {summary} from '../src/finance.js';

test('total spent includes rent, all operating expenses, paid salaries and advances once',()=>{
 const d=emptyData();d.employees=[{id:'e',branch:'أ'}];
 d.expenses=[{amount:2000,category:'الإيجار',branch:'أ',date:'2026-11-08'},{amount:250,category:'أخرى',branch:'أ',date:'2026-11-08'}];
 d.advances=[{employeeId:'e',amount:1000,date:'2026-11-08'}];
 d.payroll=[{id:'s',employeeId:'e',base:6000,additions:0,deduction:0,advance:1000}];
 d.settlements=[{employeeId:'e',kind:'salary',amount:1000,date:'2026-11-08'}];
 assert.equal(summary(d).totalSpent,3250); // Accrual alone is not a payment.
 d.salaryPayments=[{salaryId:'s',employeeId:'e',amount:4000,date:'2026-11-08'}];
 assert.equal(summary(d).totalSpent,7250);
 d.salaryPayments.push({salaryId:'s',employeeId:'e',amount:1000,date:'2026-11-08'});
 assert.equal(summary(d).totalSpent,8250);
 d.settlements.push({employeeId:'e',kind:'cash',amount:100,date:'2026-11-08'});
 assert.equal(summary(d).totalSpent,8250);
 assert.equal(summary(d).advanceReturned,100);
 assert.equal(summary(d).treasury,-8150);
});

test('total spent respects date/branch, cents and cancelled movements; empty is zero',()=>{
 assert.equal(summary(emptyData()).totalSpent,0);
 const d=emptyData();d.employees=[{id:'a',branch:'أ'},{id:'b',branch:'ب'}];
 d.expenses=[{amount:100.01,branch:'أ',date:'2026-11-08'},{amount:999,branch:'أ',date:'2026-11-08',voided:true},{amount:999,branch:'ب',date:'2026-11-08'},{amount:999,branch:'أ',date:'2026-11-09'}];
 d.advances=[{employeeId:'a',amount:200.02,date:'2026-11-08'},{employeeId:'a',amount:999,date:'2026-11-08',voided:true},{employeeId:'b',amount:999,date:'2026-11-08'}];
 d.salaryPayments=[{employeeId:'a',amount:300.03,date:'2026-11-08'},{employeeId:'a',amount:999,date:'2026-11-08',voided:true},{employeeId:'a',amount:999,date:'2026-11-07'}];
 const s=summary(d,{from:'2026-11-08',to:'2026-11-08',branch:'أ'});
 assert.equal(s.totalSpent,600.06);assert.equal(s.treasury,-600.06);
});
