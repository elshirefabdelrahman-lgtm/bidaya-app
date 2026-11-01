import test from 'node:test';
import assert from 'node:assert/strict';

test('OTA readiness never loads a native plugin in the browser',async()=>{
 const {confirmAppReady}=await import('../src/ota.js?browser');
 assert.equal(await confirmAppReady({isNative:()=>false,loadUpdater:()=>{throw Error('must not load');}}),false);
});
test('concurrent startup checks confirm once after plugin resolves',async()=>{
 const {confirmAppReady}=await import('../src/ota.js?native');let calls=0;
 const options={isNative:()=>true,loadUpdater:async()=>({OtaKit:{notifyAppReady:async()=>{calls++;}}})};
 assert.deepEqual(await Promise.all([confirmAppReady(options),confirmAppReady(options)]),[true,true]);
 assert.equal(calls,1);
});
test('native failure reports a fixed diagnostic without raw errors and can retry',async()=>{
 const {confirmAppReady}=await import('../src/ota.js?failure');let reported=0;
 assert.equal(await confirmAppReady({isNative:()=>true,loadUpdater:async()=>{throw Error('sensitive detail');},report:(...args)=>{assert.equal(args.length,0);reported++;}}),false);
 assert.equal(reported,1);
 assert.equal(await confirmAppReady({isNative:()=>true,loadUpdater:async()=>({OtaKit:{notifyAppReady:async()=>{}}})}),true);
});
