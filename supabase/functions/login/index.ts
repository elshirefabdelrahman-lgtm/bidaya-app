import {admin,authClient,headers,reply,limit,LoginDiagnosticError,loginDiagnosticCodes,requireEnv} from '../_shared/common.ts';
type LoginStage='CORS'|'REQUEST'|'RATE_LIMIT'|'USERNAME_LOOKUP'|'RECOVERY'|'AUTH'|'PROFILE';
const unexpectedByStage={
 CORS:'LOGIN_CORS_DENIED',REQUEST:'LOGIN_BAD_REQUEST',RATE_LIMIT:'LOGIN_UNEXPECTED',
 USERNAME_LOOKUP:'LOGIN_PROFILE_READ_FAILED',RECOVERY:'LOGIN_AUTH_FAILED',
 AUTH:'LOGIN_AUTH_FAILED',PROFILE:'LOGIN_PROFILE_READ_FAILED',
} as const;
function logFailure(requestId:string,stage:LoginStage,error:unknown){
 // Never log error.message, raw errors, request contents, identities or credentials.
 const code=error instanceof LoginDiagnosticError&&loginDiagnosticCodes.includes(error.code)
  ?error.code:unexpectedByStage[stage];
 console.error(JSON.stringify({event:'BIDAYA_LOGIN_FAILURE',requestId,stage,code}));
}
Deno.serve(async req=>{
 const requestId=crypto.randomUUID();
 let stage:LoginStage='CORS';
 let h={};try {
  h=headers(req);if(req.method==='OPTIONS')return new Response(null,{headers:h});if(req.method!=='POST')return reply({},405,h);
  stage='REQUEST';
  if(Number(req.headers.get('content-length')||0)>10000)return reply({},413,h);
  const {identity,password,recover}=await req.json();
  stage='RATE_LIMIT';
  await limit(req,recover?'recovery':'login',recover?3:10);
  stage='REQUEST';
  if(typeof identity!=='string'||!identity.trim()||identity.length>254||(!recover&&(typeof password!=='string'||password.length>1024)))throw new LoginDiagnosticError('LOGIN_BAD_REQUEST');
  let email=identity.trim();
  if(!email.includes('@')) {
   stage='USERNAME_LOOKUP';
   const {data,error}=await admin().from('profiles').select('email').ilike('username',email.replace(/[%_]/g,'\\$&')).eq('active',true).maybeSingle();
   if(error)throw new LoginDiagnosticError('LOGIN_PROFILE_READ_FAILED');
   // Preserve the existing non-disclosing fallback for an unmatched username.
   email=data?.email||'invalid@example.invalid';
  }
  if(recover){
   stage='RECOVERY';
   const redirectTo=requireEnv('APP_URL');
   const {error}=await authClient().auth.resetPasswordForEmail(email,{redirectTo});
   // Preserve the non-disclosing recovery response, even if sending failed.
   if(error)logFailure(requestId,stage,new LoginDiagnosticError('LOGIN_AUTH_FAILED'));
   return reply({message:'إذا كان الحساب موجودًا سيصلك رابط آمن.'},200,h);
  }
  stage='AUTH';
  const {data,error}=await authClient().auth.signInWithPassword({email,password});
  if(error)throw new LoginDiagnosticError('LOGIN_AUTH_FAILED');
  if(!data?.session||!data.user?.id)throw new LoginDiagnosticError('LOGIN_AUTH_BAD_RESPONSE');
  stage='PROFILE';
  const {data:p,error:profileError}=await admin().from('profiles').select('active').eq('id',data.user.id).maybeSingle();
  if(profileError)throw new LoginDiagnosticError('LOGIN_PROFILE_READ_FAILED');
  if(!p)throw new LoginDiagnosticError('LOGIN_PROFILE_MISSING');
  if(p.active!==true)throw new LoginDiagnosticError('LOGIN_PROFILE_INACTIVE');
  return reply(data.session,200,h);
 }catch(error){
  logFailure(requestId,stage,error);
  return reply({message:'تعذر تسجيل الدخول أو تجاوزت المحاولات المتاحة.'},400,h);
 }
});
