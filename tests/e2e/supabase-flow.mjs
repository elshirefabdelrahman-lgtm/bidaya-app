import {chromium,expect} from '@playwright/test';
import {emptyData,execute} from '../../src/service.js';
import {mkdir} from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1365,height:900}});
 const actor={id:'local-ui-admin',name:'مدير اختبار محلي',role:'Super Admin',active:true,permissions:[],branches:[]};
 let data=emptyData();data.branches=['فرع اختبار محلي'];data.users=[actor];
 let rejectSession=false,offline=false;const requests=[],errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://**/*',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname;
  const headers={'Access-Control-Allow-Origin':'http://localhost:4174','Access-Control-Allow-Headers':'apikey,content-type,authorization','Access-Control-Allow-Methods':'POST,PUT,OPTIONS'};
  if(request.method()==='OPTIONS')return route.fulfill({status:200,headers});
  requests.push(path);if(offline)return route.abort();
  const body=request.postDataJSON();const respond=(value,status=200)=>route.fulfill({status,headers,contentType:'application/json',body:JSON.stringify(value)});
  if(path==='/functions/v1/login'){
   expect(request.headers().authorization).toBeUndefined();
   if(body.identity!=='local-test-admin')return respond({message:'بيانات الدخول غير صحيحة.'},400);
   return respond({access_token:'test-ui-access',refresh_token:'test-ui-refresh',expires_in:3600});
  }
  expect(request.headers().authorization).toBe('Bearer test-ui-access');
  if(path==='/auth/v1/logout')return route.fulfill({status:204,headers});
  if(rejectSession)return respond({message:'expired'},401);
  if(path==='/rest/v1/rpc/app_snapshot')return respond({...data,currentUser:actor});
  if(path==='/rest/v1/rpc/app_command'){try{data=execute(data,actor,body.kind,body.input,body.request_id);return respond(null);}catch(error){return respond({message:error.message},400);}}
  if(path==='/functions/v1/admin-users'){data=execute(data,actor,body.kind,body.input);return respond({ok:true});}
  throw Error('Unexpected path '+path);
 });
 await page.goto('http://localhost:4174/');
 const login=async identity=>{await page.locator('[name="identity"]').fill(identity);await page.locator('[name="password"]').fill('test-password-not-real');await page.locator('[data-form="login"] [type="submit"]').click();};
 await login('wrong-test-user');await expect(page.locator('[data-login-error]')).toContainText('بيانات الدخول');await expect(page.locator('.shell')).toHaveCount(0);
 await login('local-test-admin');await expect(page.locator('.shell')).toBeVisible();await expect(page.locator('.sidebar__bottom')).toContainText('متصل بالخادم');
 const navigate=async name=>page.locator(`[data-screen="${name}"]`).first().click();
 await navigate('cases');await page.locator('[data-open="case"]').click();await page.locator('[name="name"]').fill('حالة اختبار معزولة');await page.locator('[name="fee"]').fill('30000');await page.locator('[name="phone"]').fill('01000000000');await page.locator('.dialog [type="submit"]').click();
 await expect(page.locator('#dialog-title')).toHaveText('تفاصيل الحالة 001');await page.locator('[data-edit-case="001"]').click();await expect(page.locator('[name="phone"]')).toHaveValue('01000000000');await page.locator('[name="name"]').fill('تعديل اختبار معزول');await page.locator('.dialog [type="submit"]').click();expect(data.cases[0].phone).toBe('01000000000');
 await page.locator('[data-case-detail="001"]').click();await page.getByRole('button',{name:'تسجيل دفعة',exact:true}).click();await page.locator('[name="amount"]').fill('10000');await page.locator('.dialog [type="submit"]').click();await expect(page.locator('[data-case-value="remaining"]')).toHaveText('٢٠٬٠٠٠ ج.م');await page.locator('.dialog [data-close]').first().click();
 await navigate('collections');await expect(page.locator('tbody tr')).toHaveCount(1);await expect(page.locator('tbody')).toContainText('تعديل اختبار معزول');
 await navigate('users');await page.locator('[data-open="user"]').click();await page.locator('[name="name"]').fill('حساب اختبار');await page.locator('[name="username"]').fill('ui_test_account');await page.locator('[name="email"]').fill('ui@example.invalid');await page.locator('.dialog [name="password"]').fill('initial-test-password');await page.locator('.dialog [type="submit"]').click();await expect(page.locator('tbody')).toContainText('حساب اختبار');
 offline=true;await page.locator('[data-refresh]').click();await expect(page.locator('.toast')).toContainText('تعذر الاتصال');await expect(page.locator('.shell')).toBeVisible();expect(data.collections.length).toBe(1);offline=false;
 rejectSession=true;await page.locator('[data-refresh]').click();await expect(page.locator('[data-form="login"]')).toBeVisible();await expect(page.locator('.shell')).toHaveCount(0);await expect(page.locator('#app')).not.toContainText('تعديل اختبار معزول');
 rejectSession=false;await login('local-test-admin');await navigate('cases');await expect(page.locator('tbody')).toContainText('تعديل اختبار معزول');
 await page.locator('[data-logout]').click();await expect(page.locator('[data-form="login"]')).toBeVisible();
 expect(requests).toContain('/functions/v1/login');expect(requests).toContain('/functions/v1/admin-users');expect(requests).toContain('/rest/v1/rpc/app_snapshot');expect(requests).toContain('/rest/v1/rpc/app_command');expect(errors).toEqual([]);
 await mkdir('artifacts/supabase-phase1',{recursive:true});await page.screenshot({path:'artifacts/supabase-phase1/login.png'});
 console.log('PASS mocked connected UI: rejected/successful login, authenticated snapshot, financial save, phone preservation, admin-users routing, explicit offline error, expired session cleanup, re-login and logout. All remote requests intercepted; no real records accessed.');
}finally{await browser.close();}
