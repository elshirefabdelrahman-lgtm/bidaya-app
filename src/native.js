
const native=()=>globalThis.Capacitor?.isNativePlatform?.()===true;
export async function printReport(){
 if(native()){const {registerPlugin}=await import('@capacitor/core');return registerPlugin('BidayaPrint').print();}
 window.print();
}
export async function saveSpreadsheet(bytes){
 if(native()){
  const {Filesystem,Directory}=await import('@capacitor/filesystem');
  const {Share}=await import('@capacitor/share');
  // Cache stays inside the app; Android grants access only to the chosen recipient.
  let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
  const file=await Filesystem.writeFile({path:'bidaya-report.xlsx',data:btoa(binary),directory:Directory.Cache});
  await Share.share({title:'تقرير بداية',files:[file.uri]});return;
 }
 const blob=new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
 const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='bidaya-report.xlsx';a.click();
 setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
