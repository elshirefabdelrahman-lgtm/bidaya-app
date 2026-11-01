import { config } from './config.js';
import { emptyData, execute } from './service.js';

export class DemoRepository {
  constructor(data=emptyData()) { this.data=data; }
  async load() { return structuredClone(this.data); }
  async command(user,kind,input,requestId) { this.data=execute(this.data,user,kind,input,requestId); return this.load(); }
}
export class SessionError extends Error {
  constructor(message='انتهت الجلسة؛ سجّل الدخول مرة أخرى.') { super(message);this.name='SessionError'; }
}
export function validateConnection(connection=config) {
  let url;
  try {url=new URL(connection.supabaseUrl);}catch{throw Error('عنوان Supabase غير صحيح.');}
  if(url.username||url.password||url.search||url.hash||!['https:','http:'].includes(url.protocol)||
    (url.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))||url.pathname!=='/') {
    throw Error('استخدم عنوان مشروع Supabase الأساسي عبر HTTPS.');
  }
  const key=connection.publishableKey;
  let publicKey=typeof key==='string'&&/^sb_publishable_[A-Za-z0-9_-]+$/.test(key);
  if(typeof key==='string'&&key.split('.').length===3) {
    try {const part=key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');publicKey=JSON.parse(atob(part)).role==='anon';}catch{publicKey=false;}
  }
  if(!publicKey)throw Error('استخدم Publishable Key أو Anon Key عامًا فقط؛ المفاتيح الإدارية غير مسموحة في الواجهة.');
  return {supabaseUrl:url.origin,publishableKey:key};
}
const snapshotArrays=['cases','collections','expenses','employees','payroll','salaryPayments','advances','settlements','branches','users','audit'];
const isSnapshot=data=>data&&typeof data==='object'&&snapshotArrays.every(key=>Array.isArray(data[key]));

export class SupabaseRepository {
  constructor({connection=config,fetcher=(...args)=>globalThis.fetch(...args),onSessionExpired=()=>{}}={}) {
    this.connection=validateConnection(connection);this.fetcher=fetcher;this.onSessionExpired=onSessionExpired;
    this.token=null;this.refreshToken=null;this.expires=0;this.pending=new Map();this.refreshPromise=null;this.version=0;this.snapshot=null;
  }
  clearSession() {
    this.version++;this.token=null;this.refreshToken=null;this.expires=0;
    this.snapshot=null;this.pending.clear();this.refreshPromise=null;
  }
  expire(message) {
    this.clearSession();this.onSessionExpired(message||'انتهت الجلسة؛ سجّل الدخول مرة أخرى.');
    return new SessionError(message);
  }
  setSession(session) {
    if(!session||typeof session.access_token!=='string'||!session.access_token||
      typeof session.refresh_token!=='string'||!session.refresh_token||
      !Number.isFinite(Number(session.expires_in))||Number(session.expires_in)<=0) {
      throw new SessionError('استجابة المصادقة غير مكتملة؛ سجّل الدخول مرة أخرى.');
    }
    const ttl=Number(session.expires_in);
    this.token=session.access_token;this.refreshToken=session.refresh_token;
    this.expires=Date.now()+(ttl-Math.min(60,ttl/2))*1000;
  }
  async request(path,body,method='POST',{auth=true,expireOn401=true}={}) {
    const headers={apikey:this.connection.publishableKey,'Content-Type':'application/json'};
    const version=this.version,authenticated=auth&&!!this.token;
    if(authenticated)headers.Authorization=`Bearer ${this.token}`;
    let response;
    try {
      response=await this.fetcher(`${this.connection.supabaseUrl}${path}`,{
        method,headers,cache:'no-store',credentials:'omit',...(body?{body:JSON.stringify(body)}:{}),
      });
    }catch{throw Error('تعذر الاتصال بـ Supabase. تحقق من الإنترنت وإعدادات الاتصال؛ لم يتم التحويل إلى بيانات تجريبية.');}
    if(authenticated&&version!==this.version)throw new SessionError();
    const payload=await response.text();let result=null;
    try{result=payload?JSON.parse(payload):null;}catch{throw Error('استجابة الخادم غير صالحة؛ حاول تحديث البيانات.');}
    if(!response.ok) {
      if(response.status===401&&authenticated&&expireOn401)throw this.expire();
      const original=result?.msg||result?.message||result?.error_description||'';
      const rules=[['Overpayment','المبلغ أكبر من المتبقي للحالة.'],['overpayment','المبلغ أكبر من باقي الراتب.'],['duplicate key','السجل أو الإيصال أو راتب الشهر مسجل بالفعل.'],['Branch','لا تسمح صلاحياتك بهذه العملية أو بنقل الفرع.'],['Permission','ليس لديك صلاحية لتنفيذ العملية.'],['Access denied','الحساب غير متاح أو انتهت صلاحيات الجلسة.'],['Invalid','راجع المبالغ والتواريخ والحقول المطلوبة.']];
      const error=Error(rules.find(([key])=>original.includes(key))?.[1]||original||'تعذر إتمام الطلب على Supabase.');error.status=response.status;throw error;
    }
    return result;
  }
  async login(identity,password) {
    this.clearSession();const version=this.version;
    try {
      const result=await this.request('/functions/v1/login',{identity,password},'POST',{auth:false});
      if(version!==this.version)throw new SessionError();
      this.setSession(result);return await this.load();
    }catch(error){if(version===this.version)this.clearSession();throw error;}
  }
  async refresh() {
    if(!this.token)throw new SessionError('سجّل الدخول أولًا للاتصال ببيانات المركز.');
    if(this.refreshPromise)return this.refreshPromise;
    if(Date.now()<this.expires)return;
    const version=this.version,refreshToken=this.refreshToken;
    if(!refreshToken)throw this.expire();
    const task=(async()=>{
      try {
        const result=await this.request('/auth/v1/token?grant_type=refresh_token',
          {refresh_token:refreshToken},'POST',{auth:false,expireOn401:false});
        if(version!==this.version)throw new SessionError();
        this.setSession(result);
      }catch(error){
        if(version===this.version&&(error instanceof SessionError||[400,401,403].includes(error.status)))throw this.expire();
        throw error;
      }
    })();
    this.refreshPromise=task;
    try{await task;}finally{if(this.refreshPromise===task)this.refreshPromise=null;}
  }
  async load() {
    await this.refresh();const version=this.version;
    const data=await this.request('/rest/v1/rpc/app_snapshot',{});
    if(version!==this.version)throw new SessionError();
    if(!data?.currentUser?.active)throw this.expire('الحساب غير نشط أو غير مرتبط بملف مستخدم؛ سجّل الدخول بعد مراجعة المسؤول.');
    if(!isSnapshot(data))throw Error('بيانات الخادم غير مكتملة؛ لم يتم استبدالها ببيانات محلية.');
    this.snapshot=structuredClone(data);return data;
  }
  async command(user,kind,input,requestId) {
    await this.refresh();
    if(['user','userEdit','resetPassword'].includes(kind)) {
      await this.request('/functions/v1/admin-users',{kind,input});return this.load();
    }
    let payload={...input};
    // SQL 003 defaults an omitted phone to ''. Preserve it at the repository boundary.
    if(kind==='caseEdit'&&payload.phone==null) {
      const data=this.snapshot||await this.load();const current=data.cases.find(record=>record.id===payload.id);
      if(!current)throw Error('الحالة غير موجودة ضمن البيانات المسموح بها؛ حدّث القائمة.');
      payload.phone=current.phone??'';
    }
    const key=JSON.stringify({kind,input:payload});
    const id=requestId||this.pending.get(key)||crypto.randomUUID();this.pending.set(key,id);
    await this.request('/rest/v1/rpc/app_command',{kind,input:payload,request_id:id});
    const data=await this.load();this.pending.delete(key);return data;
  }
  async logout() {
    const token=this.token;this.clearSession();
    if(token) {
      try {
        const response=await this.fetcher(`${this.connection.supabaseUrl}/auth/v1/logout`,{
          method:'POST',headers:{apikey:this.connection.publishableKey,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
          body:'{}',cache:'no-store',credentials:'omit',
        });
        if(!response.ok&&response.status!==401)throw Error();
      }catch{throw Error('تم تسجيل الخروج محليًا، وتعذر تأكيد إغلاق الجلسة على الخادم.');}
    }
  }
  async recover(identity){return this.request('/functions/v1/login',{identity,recover:true},'POST',{auth:false});}
  async resetPassword(password){await this.refresh();return this.request('/auth/v1/user',{password},'PUT');}
}
export const connected=()=>{try{validateConnection();return true;}catch{return false;}};
