import test from 'node:test';
import assert from 'node:assert/strict';
import { SupabaseRepository, SessionError, validateConnection } from '../src/repository.js';
import { emptyData } from '../src/service.js';
import { config } from '../src/config.js';
const session={access_token:'test-access-token',refresh_token:'test-refresh-token',expires_in:3600};
const snapshot=()=>({...emptyData(),currentUser:{id:'test-user',name:'مدير اختبار',active:true,role:'Super Admin'}});
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const signed=options=>{const repo=new SupabaseRepository(options);repo.setSession(session);return repo;};

test('connection uses supplied public URL/key and rejects secret/service-role keys',()=>{
 assert.equal(validateConnection().supabaseUrl,'https://pgasaphvjavvpqfplfap.supabase.co');
 assert.ok(config.publishableKey.startsWith('sb_publishable_'));
 const jwt=role=>'e30.'+Buffer.from(JSON.stringify({role})).toString('base64url')+'.signature';
 assert.equal(validateConnection({...config,publishableKey:jwt('anon')}).publishableKey,jwt('anon'));
 for(const key of ['sb_secret_test',jwt('service_role'),''])assert.throws(()=>validateConnection({...config,publishableKey:key}),/المفاتيح الإدارية/);
 assert.throws(()=>validateConnection({...config,supabaseUrl:'http://untrusted.test'}),/HTTPS/);
});
test('pre-login requests send apikey only, never a public key as Bearer',async()=>{
 let options;const repo=new SupabaseRepository({fetcher:async(url,opts)=>{options=opts;return json({message:'ok'});}});
 await repo.recover('test@example.invalid');assert.equal(options.headers.apikey,config.publishableKey);assert.equal(options.headers.Authorization,undefined);
});
test('login calls published login then app_snapshot with access token',async()=>{
 const calls=[];const data=snapshot();const repo=new SupabaseRepository({fetcher:async(url,opts)=>{calls.push({url,opts});return json(url.endsWith('/login')?session:data);}});
 assert.deepEqual(await repo.login('test-user','test-only-password'),data);
 assert.ok(calls[0].url.endsWith('/functions/v1/login'));assert.equal(calls[0].opts.headers.Authorization,undefined);
 assert.deepEqual(JSON.parse(calls[0].opts.body),{identity:'test-user',password:'test-only-password'});
 assert.ok(calls[1].url.endsWith('/rest/v1/rpc/app_snapshot'));assert.equal(calls[1].opts.headers.Authorization,'Bearer '+session.access_token);
 assert.deepEqual(JSON.parse(calls[1].opts.body),{});
});
test('failed login is explicit and leaves no session or demo fallback',async()=>{
 const repo=signed({fetcher:async()=>json({message:'بيانات الدخول غير صحيحة.'},400)});
 await assert.rejects(repo.login('test','wrong'),/بيانات الدخول/);assert.equal(repo.token,null);assert.equal(repo.snapshot,null);
});
test('malformed Auth session is rejected',async()=>{
 const repo=new SupabaseRepository({fetcher:async()=>json({access_token:'incomplete'})});
 await assert.rejects(repo.login('test','test'),SessionError);assert.equal(repo.token,null);
});
test('reading without a session does not send requests',async()=>{
 const repo=new SupabaseRepository({fetcher:async()=>assert.fail('no network expected')});await assert.rejects(repo.load(),SessionError);
});
test('network errors never return local/demo records',async()=>{
 const repo=signed({fetcher:async()=>{throw Error('offline');}});
 await assert.rejects(repo.load(),/لم يتم التحويل إلى بيانات تجريبية/);assert.equal(repo.snapshot,null);
});
test('incomplete snapshot is rejected instead of displaying misleading empty data',async()=>{
 const repo=signed({fetcher:async()=>json({currentUser:snapshot().currentUser,cases:[]})});await assert.rejects(repo.load(),/غير مكتملة/);
});
test('disabled profile clears tokens and notifies the UI',async()=>{
 let notified=0;const repo=signed({fetcher:async()=>json({...snapshot(),currentUser:null}),onSessionExpired:()=>notified++});
 await assert.rejects(repo.load(),SessionError);assert.equal(repo.token,null);assert.equal(repo.refreshToken,null);assert.equal(notified,1);
});
test('authenticated 401 clears session while permission 403 preserves it',async()=>{
 let status=403;const repo=signed({fetcher:async()=>json({message:'denied'},status)});
 await assert.rejects(repo.load(),/denied/);assert.equal(repo.token,session.access_token);
 status=401;await assert.rejects(repo.load(),SessionError);assert.equal(repo.token,null);
});
test('concurrent reads share exactly one refresh and use the new access token',async()=>{
 const gate=defer(),started=defer();let refreshes=0;const headers=[];
 const repo=signed({fetcher:async(url,opts)=>{
  if(url.includes('grant_type=refresh_token')){refreshes++;assert.equal(opts.headers.Authorization,undefined);assert.deepEqual(JSON.parse(opts.body),{refresh_token:session.refresh_token});started.resolve();await gate.promise;return json({...session,access_token:'new-access',refresh_token:'new-refresh'});}
  headers.push(opts.headers.Authorization);return json(snapshot());
 }});repo.expires=0;
 const tasks=Array.from({length:6},()=>repo.load());await started.promise;gate.resolve();await Promise.all(tasks);
 assert.equal(refreshes,1);assert.deepEqual(headers,Array(6).fill('Bearer new-access'));assert.equal(repo.refreshToken,'new-refresh');assert.equal(repo.refreshPromise,null);
});
test('invalid refresh token clears session and prevents a financial write',async()=>{
 const calls=[];const repo=signed({fetcher:async url=>{calls.push(url);return json({message:'invalid refresh'},400);}});repo.expires=0;
 await assert.rejects(repo.command({},'expense',{amount:1}),SessionError);assert.equal(calls.length,1);assert.equal(repo.token,null);
});
test('temporary refresh network failure is retryable without losing session',async()=>{
 let offline=true;const repo=signed({fetcher:async url=>{if(offline)throw Error('offline');return json(url.includes('grant_type')?session:snapshot());}});repo.expires=0;
 await assert.rejects(repo.load(),/تعذر الاتصال/);assert.equal(repo.refreshToken,session.refresh_token);assert.equal(repo.refreshPromise,null);
 offline=false;await repo.load();assert.ok(repo.token);
});
test('late refresh cannot resurrect a logged-out session',async()=>{
 const gate=defer(),started=defer();const repo=signed({fetcher:async url=>{
  if(url.includes('grant_type')){started.resolve();await gate.promise;return json({...session,access_token:'late'});}return new Response(null,{status:204});
 }});repo.expires=0;const refreshing=repo.refresh();const rejection=assert.rejects(refreshing,SessionError);
 await started.promise;await repo.logout();gate.resolve();await rejection;assert.equal(repo.token,null);assert.equal(repo.refreshToken,null);
});
test('late login cannot resurrect a cleared session',async()=>{
 const gate=defer();const repo=new SupabaseRepository({fetcher:async()=>{await gate.promise;return json(session);}});
 const login=repo.login('test','test');const rejection=assert.rejects(login,SessionError);repo.clearSession();gate.resolve();await rejection;assert.equal(repo.token,null);
});
test('logout clears all local state even when remote revocation fails',async()=>{
 const repo=signed({fetcher:async()=>{throw Error('offline');}});repo.snapshot=snapshot();repo.pending.set('test','id');
 await assert.rejects(repo.logout(),/محليًا/);assert.equal(repo.token,null);assert.equal(repo.snapshot,null);assert.equal(repo.pending.size,0);
});
test('all financial commands use app_command and its actual named arguments',async()=>{
 const writes=[];const repo=signed({fetcher:async(url,opts)=>{if(url.endsWith('/app_command')){writes.push(JSON.parse(opts.body));return new Response(null,{status:204});}return json(snapshot());}});
 for(const kind of ['case','collection','expense','employee','employeeEdit','salary','salaryPayment','advance','repayment','void','branch'])await repo.command({},kind,{marker:kind});
 assert.equal(writes.length,11);for(const write of writes){assert.deepEqual(Object.keys(write).sort(),['input','kind','request_id']);assert.equal(write.input.marker,write.kind);assert.match(write.request_id,/^[a-f0-9-]{36}$/);}
});
test('administrative operations call admin-users, never app_command',async()=>{
 const calls=[];const repo=signed({fetcher:async(url,opts)=>{calls.push({url,opts});return json(url.endsWith('/admin-users')?{ok:true}:snapshot());}});
 for(const kind of ['user','userEdit','resetPassword'])await repo.command({},kind,{id:'test-account'});
 assert.equal(calls.filter(x=>x.url.endsWith('/admin-users')).length,3);assert.ok(!calls.some(x=>x.url.endsWith('/app_command')));
 for(const c of calls.filter(x=>x.url.endsWith('/admin-users')))assert.equal(c.opts.headers.Authorization,'Bearer '+session.access_token);
});
test('case edit preserves omitted/null phone; explicit replacement is sent',async()=>{
 const data=snapshot();data.cases=[{id:'001',phone:'01000000000'}];const sent=[];
 const repo=signed({fetcher:async(url,opts)=>{if(url.endsWith('/app_command')){sent.push(JSON.parse(opts.body).input);return json(null);}return json(data);}});
 await repo.command({},'caseEdit',{id:'001',name:'تعديل'});await repo.command({},'caseEdit',{id:'001',phone:null});await repo.command({},'caseEdit',{id:'001',phone:'01111111111'});
 assert.deepEqual(sent.map(x=>x.phone),['01000000000','01000000000','01111111111']);
});
test('RPC retry reuses request ID after successful mutation and failed snapshot',async()=>{
 const repo=signed(),ids=[];let fail=true;
 repo.request=async(path,body)=>{if(path.includes('app_command')){ids.push(body.request_id);return null;}if(fail){fail=false;throw Error('network');}return snapshot();};
 await assert.rejects(repo.command({},'expense',{amount:50}),/network/);
 await repo.command({},'expense',{amount:50});assert.equal(ids[0],ids[1]);assert.equal(repo.pending.size,0);
});
test('REST adapter accepts empty 204 responses',async()=>{
 const repo=new SupabaseRepository({fetcher:async()=>new Response(null,{status:204})});assert.equal(await repo.request('/test',{}),null);
});
test('password recovery uses public login and password update uses user access token',async()=>{
 const calls=[];const repo=signed({fetcher:async(url,opts)=>{calls.push({url,opts});return json({});}});
 await repo.recover('test@example.invalid');await repo.resetPassword('new-test-password');
 assert.ok(calls[0].url.endsWith('/functions/v1/login'));assert.equal(calls[0].opts.headers.Authorization,undefined);assert.equal(JSON.parse(calls[0].opts.body).recover,true);
 assert.ok(calls[1].url.endsWith('/auth/v1/user'));assert.equal(calls[1].opts.method,'PUT');assert.equal(calls[1].opts.headers.Authorization,'Bearer '+session.access_token);
});
