import {admin,authClient,headers,reply,limit} from '../_shared/common.ts';
Deno.serve(async req=>{
 let h={};try {
  h=headers(req);if(req.method==='OPTIONS')return new Response(null,{headers:h});if(req.method!=='POST')return reply({},405,h);
  const db=admin();const token=req.headers.get('authorization')?.replace(/^Bearer /i,'');if(!token)return reply({},401,h);
  const {data:{user},error:ue}=await db.auth.getUser(token);if(ue||!user)return reply({},401,h);
  const {data:actor}=await db.from('profiles').select('*').eq('id',user.id).single();if(!actor?.active||actor.role!=='Super Admin')return reply({},403,h);
  await limit(req,'admin',30);const {kind,input:f}=await req.json();if(!['user','userEdit','resetPassword'].includes(kind))throw Error('Unknown operation');
  if(f.id===user.id)throw Error('Cannot edit self');
  let old:any=null;if(f.id){const {data,error}=await db.from('profiles').select('*').eq('id',f.id).single();if(error)throw error;old=data;}
  if(kind==='resetPassword') {
   if(!old)throw Error('Missing user');const {error}=await authClient().auth.resetPasswordForEmail(old.email,{redirectTo:Deno.env.get('APP_URL')});if(error)throw error;
   const {error:ae}=await db.from('audit_logs').insert({actor_id:user.id,actor_name:actor.name,action:'PASSWORD_RESET_REQUEST',entity:'profiles',after_value:{id:old.id}});if(ae)throw ae;return reply({ok:true},200,h);
  }
  if(!f.name?.trim()||!(/^[a-zA-Z0-9_.-]{3,40}$/).test(f.username)||!(/^[^\s@]+@[^\s@]+\.[^\s@]+$/).test(f.email)||!['Super Admin','Admin','Accountant','Employee'].includes(f.role)||!Array.isArray(f.permissions)||!Array.isArray(f.branches))throw Error('Invalid profile');
  const profile={id:old?.id,name:f.name.trim(),username:f.username,email:f.email.trim().toLowerCase(),role:f.role,active:f.active!==false&&f.active!=='false',permissions:f.permissions,branches:f.branches};
  const save=async(p:any)=>{const {error}=await db.rpc('admin_save_profile',{actor:user.id,profile:p});if(error)throw error;};
  if(kind==='user') {
   if(old||typeof f.password!=='string'||f.password.length<12)throw Error('Initial password must be 12+ characters');
   const {data,error}=await db.auth.admin.createUser({email:profile.email,password:f.password,email_confirm:true,ban_duration:profile.active?'none':'876000h'});if(error)throw error;
   profile.id=data.user.id;
   try{await save(profile);}catch(error){await db.auth.admin.deleteUser(data.user.id);throw error;}
  } else {
   if(!old)throw Error('Missing account');
   // Revoke database access first. A failed Auth change leaves the account safely disabled.
   await save({...profile,active:false});
   const {error}=await db.auth.admin.updateUserById(old.id,{email:profile.email,email_confirm:true,ban_duration:profile.active?'none':'876000h'});
   if(error)throw error;await save(profile);
  }
  return reply({ok:true},200,h);
 }catch{return reply({message:'تعذر إتمام إدارة الحساب. راجع صحة البيانات وتكرار البريد واسم المستخدم. إذا فشل تعديل حساب فقد يظل معطلاً حتى إعادة تفعيله.'},400,h);}
});
