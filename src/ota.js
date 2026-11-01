let readyTask;

// Confirm only after the application has rendered. Never wait for an Auth login
// or patient data: offline startup must remain usable, too.
export function confirmAppReady({
 isNative=()=>globalThis.Capacitor?.isNativePlatform?.()===true,
 loadUpdater=()=>import('@otakit/capacitor-updater'),
 report=()=>console.warn('BIDAYA_OTA_READY_FAILED'),
}={}){
 if(!isNative())return Promise.resolve(false);
 if(readyTask)return readyTask;
 readyTask=(async()=>{
  try{const {OtaKit}=await loadUpdater();await OtaKit.notifyAppReady();return true;}
  catch{readyTask=undefined;report();return false;}
 })();
 return readyTask;
}
