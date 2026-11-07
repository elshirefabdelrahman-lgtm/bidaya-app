import {emptyData,execute} from '../../src/service.js';

// Test transport only. Production has no demo login or local data fallback.
export async function mockBackend(page) {
 let data=emptyData();
 const actor={id:'test-admin',name:'اختبار محلي',role:'Super Admin',active:true,permissions:[],branches:[]};
 const reset=()=>{data=emptyData();data.branches=['فرع اختبار محلي'];data.users=[actor];};reset();
 await page.unroute('https://**/*');
 await page.route('https://**/*',async route=>{
  const r=route.request(),p=new URL(r.url()).pathname;
  const headers={'Access-Control-Allow-Origin':'http://localhost:4174','Access-Control-Allow-Headers':'apikey,content-type,authorization','Access-Control-Allow-Methods':'POST,OPTIONS'};
  const send=(v,status=200)=>route.fulfill({status,headers,contentType:'application/json',body:JSON.stringify(v)});
  if(r.method()==='OPTIONS')return send({});
  const body=r.postDataJSON();
  if(p==='/functions/v1/login')return send({access_token:'test-access',refresh_token:'test-refresh',expires_in:3600});
  if(p==='/auth/v1/logout'){reset();return route.fulfill({status:204,headers});}
  if(p==='/rest/v1/rpc/app_snapshot')return send({...data,currentUser:actor});
  if(p==='/rest/v1/rpc/app_command'||p==='/functions/v1/admin-users'){
   try{data=execute(data,actor,body.kind,body.input,body.request_id||crypto.randomUUID());return send({ok:true});}
   catch(e){return send({message:e.message},400);}
  }
  return send({},404);
 });
 return {snapshot:()=>structuredClone(data)};
}
export async function loginMock(page){
 if(await page.locator('[data-demo]').count())throw Error('Production must not expose demo login.');
 await page.locator('[name="identity"]').fill('test-admin');
 await page.locator('[name="password"]').fill('test-password-only');
 await page.locator('[data-form="login"] [type="submit"]').click();
 await page.locator('.shell').waitFor();
}
