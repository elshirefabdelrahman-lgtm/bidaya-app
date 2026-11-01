import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('007 fixes the deployed profile permission failure without broad service grants',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create schema auth;create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create role anon;create role authenticated;create role service_role bypassrls;
   grant usage on schema public,auth to authenticated;
   grant execute on function auth.uid() to authenticated;`);
  for(const file of (await readdir('supabase/migrations')).filter(x=>/^00[1-6]_/.test(x)).sort())await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
  await db.exec(`insert into auth.users values('00000000-0000-4000-8000-000000000001');
   insert into public.profiles values('00000000-0000-4000-8000-000000000001','مدير اختبار','local_admin','local@example.invalid','Super Admin',true,'{}','{}');
   set role service_role;`);
  await assert.rejects(db.query('select active from public.profiles'),/permission denied/);
  await db.exec('reset role');
  const migration=await readFile('supabase/migrations/007_edge_service_permissions.sql','utf8');
  await db.exec(migration);await db.exec(migration);
  await db.exec('set role service_role');
  assert.equal((await db.query('select active from public.profiles')).rows[0].active,true);
  await db.query("insert into public.audit_logs(action,entity) values('TEST_RESET','profiles')");
  await assert.rejects(db.exec("update public.profiles set role='Employee'"),/permission denied/);
  await assert.rejects(db.exec('delete from public.profiles'),/permission denied/);
  await assert.rejects(db.exec('select * from public.cases'),/permission denied/);
  await assert.rejects(db.exec('select * from public.audit_logs'),/permission denied/);
  for(const role of ['anon','authenticated']){
   await db.exec('reset role;set role '+role);
   await assert.rejects(db.exec("insert into public.audit_logs(action,entity) values('BAD','profiles')"),/permission denied/);
   await assert.rejects(db.exec("update public.profiles set role='Super Admin'"),/permission denied/);
  }
 }finally{await db.close();}
});
