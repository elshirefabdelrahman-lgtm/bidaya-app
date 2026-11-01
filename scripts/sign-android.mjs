import {AsyncEntry} from '@napi-rs/keyring';
import {randomBytes,createHash} from 'node:crypto';
import {mkdir,stat,readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
const run=promisify(execFile);
const java=process.env.JAVA_HOME,sdk=process.env.ANDROID_HOME;
if(!java||!sdk)throw Error('Set JAVA_HOME and ANDROID_HOME first.');
const key=process.env.BIDAYA_KEYSTORE||'D:/bidaya-tools/signing/bidaya-release.p12';
const entry=new AsyncEntry('Bidaya Android release','com.bidaya.center');
let password=await entry.getPassword();
const exists=await stat(key).then(()=>true,()=>false);
if(exists&&!password)throw Error('Signing credential is missing. Restore it securely; do not replace the existing release key.');
if(!password){password=randomBytes(36).toString('base64url');await entry.setPassword(password);}
const env={...process.env,BIDAYA_SIGNING_PASSWORD:password,JAVA_TOOL_OPTIONS:'-Xmx96m -XX:+UseSerialGC -XX:ActiveProcessorCount=2'};
await mkdir(path.dirname(key),{recursive:true});
if(!exists)await run(path.join(java,'bin/keytool.exe'),[
 '-genkeypair','-keystore',key,'-storetype','PKCS12','-alias','bidaya',
 '-keyalg','RSA','-keysize','3072','-validity','10000',
 '-dname','CN=Bidaya, OU=Android, O=Bidaya, C=EG',
 '-storepass:env','BIDAYA_SIGNING_PASSWORD','-keypass:env','BIDAYA_SIGNING_PASSWORD'
],{env});
if(process.argv.includes('--prepare')){console.log('Encrypted signing key ready. Password is in the OS credential store.');process.exit(0);}
await mkdir('artifacts',{recursive:true});
const output='artifacts/Bidaya-1.0.0.apk';
const signer=path.join(sdk,'build-tools/36.0.0/lib/apksigner.jar');
await run(path.join(java,'bin/java.exe'),['-jar',signer,'sign','--ks',key,'--ks-key-alias','bidaya',
 '--ks-pass','env:BIDAYA_SIGNING_PASSWORD','--key-pass','env:BIDAYA_SIGNING_PASSWORD','--out',output,
 'android/app/build/outputs/apk/release/app-release-unsigned.apk'],{env});
await run(path.join(java,'bin/java.exe'),['-jar',signer,'verify','--verbose',output],{env});
console.log('Signed APK verified:',output);
console.log('SHA256:',createHash('sha256').update(await readFile(output)).digest('hex'));
