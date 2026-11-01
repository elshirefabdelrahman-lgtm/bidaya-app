import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('006 upgrades either RPC signature, preserves counters and restores service-only access', async t => {
  const migration=await readFile('supabase/migrations/006_fix_auth_take_slot.sql','utf8');
  for (const signature of ['legacy','current']) {
    await t.test(signature,async()=>{
      const db=new PGlite();
      try {
        await db.exec(`create schema auth;
          create table auth.users(id uuid primary key);
          create function auth.uid() returns uuid language sql stable as
          $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
          create role anon;create role authenticated;create role service_role;
          grant usage on schema public to service_role;`);
        for(const file of ['001_schema.sql','002_rls_audit.sql','003_commands.sql','004_account_admin.sql','005_case_financials.sql']) {
          await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
        }
        if(signature==='legacy') {
          await db.exec(`drop function public.auth_take_slot(text,integer);
            create function public.auth_take_slot(bucket text,max_hits integer)
            returns boolean language sql as $$select true$$;`);
        }
        await db.exec(`insert into public.auth_rate_limits values('existing',now(),2);
          insert into public.branches values('existing branch');`);
        const before=await db.query('select * from public.auth_rate_limits order by bucket');
        await db.exec(migration);
        assert.deepEqual((await db.query('select * from public.auth_rate_limits order by bucket')).rows,before.rows);
        assert.equal((await db.query('select count(*)::int as n from public.branches')).rows[0].n,1);
        const fn=(await db.query(`select proargnames,prosecdef,proconfig from pg_proc
          where oid='public.auth_take_slot(text,integer)'::regprocedure`)).rows[0];
        assert.deepEqual(fn.proargnames,['p_bucket','p_max_hits']);assert.equal(fn.prosecdef,true);
        assert.ok(fn.proconfig.some(x=>x.startsWith('search_path=')&&!x.includes('public')));
        const slot=async()=> (await db.query(`select public.auth_take_slot(
          p_bucket => 'existing',p_max_hits => 3) as allowed`)).rows[0].allowed;
        await db.exec('set role service_role');
        assert.equal(await slot(),true);assert.equal(await slot(),false);
        await db.exec('reset role');
        for(const role of ['anon','authenticated']) {
          await db.exec(`set role ${role}`);
          await assert.rejects(slot(),/permission denied/);
          await db.exec('reset role');
        }
        const counters=(await db.query('select * from public.auth_rate_limits')).rows;
        await db.exec(migration); // Safe to reapply: counters remain unchanged.
        assert.deepEqual((await db.query('select * from public.auth_rate_limits')).rows,counters);
      } finally {await db.close();}
    });
  }
});
