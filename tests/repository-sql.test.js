import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {SupabaseRepository} from '../src/repository.js';
import {caseFinancials,summary} from '../src/finance.js';
import {config} from '../src/config.js';

// The HTTP transport is local and injected. No calls to the configured real project.
test('repository contract works against actual SQL 001-006 using isolated PostgreSQL',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 const userId='00000000-0000-4000-8000-000000000001';
 await db.exec(`create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create role anon;create role authenticated;create role service_role;
 grant usage on schema public,auth to authenticated;grant execute on function auth.uid() to authenticated;`);
 for(const file of (await readdir('supabase/migrations')).filter(x=>/^00[1-6]_.*\.sql$/.test(x)).sort())await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
 await db.exec(`insert into auth.users values('${userId}');insert into public.branches values('فرع اختبار محلي');
 insert into public.profiles values('${userId}','مدير اختبار','test_admin','test@example.invalid','Super Admin',true,'{}','{}');
 set role authenticated;set request.jwt.claim.sub='${userId}';`);
 const calls=[];
 const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
 const repo=new SupabaseRepository({fetcher:async(url,options)=>{
  const path=new URL(url).pathname,body=JSON.parse(options.body||'{}');calls.push(path);
  assert.equal(options.headers.apikey,config.publishableKey);
  if(path==='/functions/v1/login') {assert.equal(options.headers.Authorization,undefined);return reply({access_token:'sql-test-token',refresh_token:'sql-test-refresh',expires_in:3600});}
  assert.equal(options.headers.Authorization,'Bearer sql-test-token');
  try {
   if(path==='/rest/v1/rpc/app_snapshot')return reply((await db.query('select public.app_snapshot() as data')).rows[0].data);
   if(path==='/rest/v1/rpc/app_command') {
    await db.query('select public.app_command(kind=>$1,input=>$2::jsonb,request_id=>$3::uuid)',[body.kind,JSON.stringify(body.input),body.request_id]);
    return new Response(null,{status:204});
   }
   assert.fail('Unexpected endpoint '+path);
  }catch(error){return reply({message:error.message},400);}
 }});
 let state;
 await t.test('login returns actual snapshot contract and branch names',async()=>{
  state=await repo.login('test_admin','local-test-password');assert.equal(state.currentUser.id,userId);assert.deepEqual(state.branches,['فرع اختبار محلي']);assert.deepEqual(state.cases,[]);
 });
 await t.test('case and subsequent edit preserve phone through actual SQL',async()=>{
  state=await repo.command(state.currentUser,'case',{name:'حالة اختبار محلي فقط',branch:state.branches[0],fee:30000,admission:'2026-11-01',status:'نشطة',phone:'01000000000'});
  state=await repo.command(state.currentUser,'caseEdit',{id:state.cases[0].id,name:'تعديل اختباري',branch:state.branches[0],fee:30000,admission:'2026-11-01',status:'نشطة'});
  assert.equal(state.cases[0].phone,'01000000000');
 });
 await t.test('two real SQL payment records update balances and report totals exactly once',async()=>{
  for(const [index,amount]of [10000,5000].entries()){
   const payload={caseId:state.cases[0].id,amount,date:'2026-11-01',receipt:'SQL-TEST-'+index,method:'نقدي'};const id=crypto.randomUUID();
   state=await repo.command(state.currentUser,'collection',payload,id);state=await repo.command(state.currentUser,'collection',payload,id);
   assert.equal(state.collections.length,index+1);assert.equal(caseFinancials(state,state.cases[0]).remaining,index===0?20000:15000);
  }
  assert.equal(summary(state).collected,15000);
  const view=(await db.query('select * from public.case_financials')).rows[0];assert.equal(Number(view.paid_amount),15000);assert.equal(Number(view.remaining_amount),15000);
 });
 await t.test('expense, employee, advance and salary persist through the same repository',async()=>{
  state=await repo.command(state.currentUser,'expense',{amount:300,branch:state.branches[0],date:'2026-11-01',category:'أخرى',description:'مصروف اختبار محلي'});
  state=await repo.command(state.currentUser,'employee',{name:'موظف اختبار محلي',role:'إداري',branch:state.branches[0],salary:6000,hired:'2026-11-01',active:'true'});
  const employeeId=state.employees[0].id;
  state=await repo.command(state.currentUser,'advance',{employeeId,amount:1000,date:'2026-11-01'});
  state=await repo.command(state.currentUser,'salary',{employeeId,month:'2026-11',additions:0,deduction:0,advance:1000,paid:5000,date:'2026-11-01'});
  assert.equal(state.expenses.length,1);assert.equal(state.employees.length,1);assert.equal(state.salaryPayments.length,1);
  const report=summary(state);assert.equal(report.expenseTotal,300);assert.equal(report.salariesPaid,5000);assert.equal(report.advanceOutstanding,0);assert.equal(report.cashFlow,9700);assert.equal(report.treasury,8700);
 });
 await t.test('re-reading never inserts payments or loses the shared state',async()=>{
  const previous=state.collections.length;for(let i=0;i<3;i++)state=await repo.load();assert.equal(state.collections.length,previous);assert.ok(state.audit.length>0);
  assert.ok(calls.includes('/functions/v1/login'));assert.ok(calls.includes('/rest/v1/rpc/app_command'));
 });
});
