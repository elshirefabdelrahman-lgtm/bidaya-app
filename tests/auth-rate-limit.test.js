import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { stripTypeScriptTypes } from 'node:module';

// Isolated in-memory PostgreSQL only. No network, filesystem database, or Supabase.
test('auth_take_slot executes with named arguments, limits requests and protects access', async t => {
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`create schema auth;create table auth.users(id uuid primary key);create role anon;create role authenticated;create role service_role;grant usage on schema public to service_role;`);
 await db.exec(await readFile('supabase/migrations/001_schema.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/004_account_admin.sql','utf8'));
 const slot=async(bucket,max)=> (await db.query('select public.auth_take_slot(p_bucket => $1, p_max_hits => $2) as allowed',[bucket,max])).rows[0].allowed;
 await t.test('exactly the first three attempts pass and subsequent attempts fail',async()=>{
  assert.deepEqual(await Promise.all(Array.from({length:6},()=>slot('login-test',3))),[true,true,true,false,false,false]);
  const row=(await db.query("select hits from public.auth_rate_limits where bucket='login-test'")).rows[0];assert.equal(row.hits,6);
 });
 await t.test('buckets are independent and rejected attempts do not move the window',async()=>{
  assert.equal(await slot('recovery-test',1),true);
  const before=(await db.query("select window_start from public.auth_rate_limits where bucket='recovery-test'")).rows[0].window_start;
  assert.equal(await slot('recovery-test',1),false);
  assert.deepEqual((await db.query("select window_start from public.auth_rate_limits where bucket='recovery-test'")).rows[0].window_start,before);
 });
 await t.test('window resets at exactly fifteen minutes including counter reset',async()=>{
  await slot('expired',1);
  await db.exec('begin');
  try {
   await db.exec("update public.auth_rate_limits set window_start=now()-interval '15 minutes',hits=20 where bucket='expired'");
   assert.equal(await slot('expired',1),true);assert.equal(await slot('expired',1),false);
   assert.equal((await db.query("select hits from public.auth_rate_limits where bucket='expired'")).rows[0].hits,2);
  } finally {await db.exec('rollback');}
 });
 await t.test('queued concurrent callers cannot over-allocate or lose increments',async()=>{
  // PGlite serializes execution: tests a concurrent JS burst, not multiple server connections.
  const results=await Promise.all(Array.from({length:50},()=>slot('burst',10)));
  assert.equal(results.filter(Boolean).length,10);assert.equal(results.filter(x=>!x).length,40);
  assert.equal((await db.query("select hits from public.auth_rate_limits where bucket='burst'")).rows[0].hits,50);
 });
 await t.test('invalid limits and empty buckets are rejected without creating counters',async()=>{
  for(const max of [0,-1,null,2147483647])await assert.rejects(slot('invalid',max),/Invalid rate limit/);
  for(const bucket of ['', ' ',null])await assert.rejects(slot(bucket,3),/Invalid bucket/);
  assert.equal((await db.query("select count(*)::int as n from public.auth_rate_limits where bucket='invalid'")).rows[0].n,0);
 });
 await t.test('counter near integer maximum rejects without overflow',async()=>{
  await slot('overflow',3);await db.exec("update public.auth_rate_limits set hits=2147483647 where bucket='overflow'");assert.equal(await slot('overflow',3),false);
 });
 await t.test('only service_role can call the function, not clients',async()=>{
  for(const role of ['anon','authenticated']) {
   await db.exec(`set role ${role}`);try{await assert.rejects(slot('forbidden',3),/permission denied/);}finally{await db.exec('reset role');}
  }
  await db.exec('set role service_role');try{assert.equal(await slot('trusted',1),true);assert.equal(await slot('trusted',1),false);}finally{await db.exec('reset role');}
 });
 await t.test('actual Edge limit helper uses matching RPC names and rejects excess attempts',async()=>{
  const previous=globalThis.__bidayaRateTestCreateClient;
  const calls=[];
  // Replace only the external SDK transport. Run the actual helper against local SQL.
  globalThis.__bidayaRateTestCreateClient=()=>({rpc:async(name,args)=>{
   calls.push({name,args});
   assert.equal(name,'auth_take_slot');
   assert.deepEqual(Object.keys(args).sort(),['p_bucket','p_max_hits']);
   return {data:await slot(args.p_bucket,args.p_max_hits),error:null};
  }});
  try {
   const ts=await readFile('supabase/functions/_shared/common.ts','utf8');
   const source=ts.replace(/^import[^\n]+\n/,
    "const createClient=globalThis.__bidayaRateTestCreateClient;\nconst Deno={env:{get:()=> 'local-test-placeholder'}};\n");
   const js=stripTypeScriptTypes(source,{mode:'strip'});
   const helper=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
   const request=new Request('http://localhost/',{headers:{'x-forwarded-for':'192.0.2.1'}});
   await helper.limit(request,'login',2);await helper.limit(request,'login',2);
   await assert.rejects(helper.limit(request,'login',2),/حاول مرة أخرى لاحقًا/);
   assert.equal(calls.length,3);assert.equal(calls[0].args.p_bucket,calls[2].args.p_bucket);
   await helper.limit(request,'recovery',1); // Independent scope for the same IP.
   assert.notEqual(calls[0].args.p_bucket,calls[3].args.p_bucket);
   const login=await readFile('supabase/functions/login/index.ts','utf8');
   assert.match(login,/import\s*\{[^}]*limit[^}]*\}\s*from '\.\.\/_shared\/common\.ts'/);
   assert.match(login,/await limit\(req,recover\?'recovery':'login',recover\?3:10\)/);
  } finally {
   if(previous===undefined)delete globalThis.__bidayaRateTestCreateClient;
   else globalThis.__bidayaRateTestCreateClient=previous;
  }
 });
});
