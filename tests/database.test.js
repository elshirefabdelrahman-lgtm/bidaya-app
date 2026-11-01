import test from 'node:test';import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';import fs from 'node:fs/promises';
const adminId='00000000-0000-4000-8000-000000000001',empId='00000000-0000-4000-8000-000000000002';
test('SQL migrations, transactional accounting, RLS, audit and restricted admin RPC',async()=>{
 const db=new PGlite();
 await db.exec(`create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create role anon;create role authenticated;create role service_role;grant usage on schema public,auth to authenticated;grant execute on function auth.uid() to authenticated;`);
 for(const file of ['001_schema.sql','002_rls_audit.sql','003_commands.sql','004_account_admin.sql','005_case_financials.sql'])await db.exec(await fs.readFile('supabase/migrations/'+file,'utf8'));
 await db.exec(`insert into auth.users values('${adminId}'),('${empId}');insert into public.branches values('القاهرة'),('الجيزة');insert into public.profiles values('${adminId}','مدير','admin','admin@example.test','Super Admin',true,'{}','{}'),('${empId}','موظف','employee','employee@example.test','Employee',true,'{cases}','{القاهرة}');set request.jwt.claim.sub='${adminId}';`);
 const command=async(kind,input,id=crypto.randomUUID())=>db.query('select public.app_command($1,$2::jsonb,$3::uuid)',[kind,JSON.stringify(input),id]);
 await command('case',{name:'حالة اختبار',fee:30000,branch:'القاهرة',admission:'2026-11-01',status:'نشطة'});
 let snap=(await db.query('select public.app_snapshot() as d')).rows[0].d;assert.equal(snap.cases[0].id,'001');
 for(const [i,n] of [10000,5000,3000].entries()){
  await command('collection',{caseId:'001',amount:n,date:'2026-11-01',receipt:'R'+i});
  const totals=(await db.query("select * from public.case_financials where case_id='001'")).rows[0];
  if(i===0){assert.equal(Number(totals.paid_amount),10000);assert.equal(Number(totals.remaining_amount),20000);}
  if(i===1){assert.equal(Number(totals.paid_amount),15000);assert.equal(Number(totals.remaining_amount),15000);const state=(await db.query('select public.app_snapshot() as d')).rows[0].d;assert.equal(state.collections.length,2);assert.equal(state.collections.reduce((v,x)=>v+x.amount,0),15000);}
 }
 await assert.rejects(command('collection',{caseId:'001',amount:12001,date:'2026-11-01',receipt:'over'}),/Overpayment/);
 const request=crypto.randomUUID(),expense={amount:500,branch:'القاهرة',date:'2026-11-01',description:'إيجار',category:'إيجار'};
 await command('expense',expense,request);await command('expense',expense,request);
 await assert.rejects(command('expense',{...expense,amount:600},request),/reused/);
 await command('employee',{name:'أحمد',role:'إداري',salary:6000,hired:'2026-11-01',branch:'القاهرة'});
 snap=(await db.query('select public.app_snapshot() as d')).rows[0].d;const eid=snap.employees[0].id;
 for(const amount of [1000,500])await command('advance',{employeeId:eid,amount,date:'2026-11-01'});
 await command('salary',{employeeId:eid,month:'2026-11',advance:1500,additions:0,deduction:0,paid:4000,date:'2026-11-01'});
 snap=(await db.query('select public.app_snapshot() as d')).rows[0].d;
 await command('salaryPayment',{salaryId:snap.payroll[0].id,amount:500,date:'2026-11-02'});
 await assert.rejects(command('salaryPayment',{salaryId:snap.payroll[0].id,amount:1,date:'2026-11-02'}),/overpayment/);
 assert.equal(snap.expenses.length,1);assert.equal(snap.settlements[0].amount,1500);
 await command('void',{entity:'collections',id:snap.collections[0].id,reason:'تصحيح اختبار'});
 const reversed=(await db.query("select * from public.case_financials where case_id='001'")).rows[0];assert.equal(Number(reversed.paid_amount),8000);assert.equal(Number(reversed.remaining_amount),22000);
 await assert.rejects(db.exec('delete from public.audit_logs'),/append-only/);
 await db.exec(`set role authenticated;set request.jwt.claim.sub='${empId}';`);
 await assert.rejects(command('expense',expense),/Permission/);
 await assert.rejects(db.exec(`update public.profiles set role='Super Admin' where id='${empId}'`),/permission denied/);
 await assert.rejects(db.query('select public.admin_save_profile($1,$2::jsonb)',[empId,'{}']),/permission denied/);
 let employeeSnap=(await db.query('select public.app_snapshot() as d')).rows[0].d;assert.equal(employeeSnap.cases.length,1);assert.equal(employeeSnap.collections.length,3);assert.equal(employeeSnap.audit.length,0);
 await assert.rejects(command('case',{name:'ممنوع',fee:0,branch:'الجيزة',admission:'2026-11-01',status:'نشطة'}),/Branch access/);
 await db.exec(`reset role;update public.profiles set active=false where id='${empId}';set role authenticated;`);
 employeeSnap=(await db.query('select public.app_snapshot() as d')).rows[0].d;assert.equal(employeeSnap.cases.length,0);
 await db.close();
});
