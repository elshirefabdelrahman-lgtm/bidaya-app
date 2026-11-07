import {chromium,expect} from '@playwright/test';
import http from 'node:http';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {mockBackend,loginMock} from './mock-backend.mjs';

// Serve exactly the deploy directory, not the source/dev server. All Supabase
// traffic is intercepted; this test cannot create real center records.
const base=path.resolve('dist');
const server=http.createServer(async(req,res)=>{
 try{
  const route=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file=path.resolve(base,'.'+(route==='/'?'/index.html':route));
  if(!file.startsWith(base+path.sep)||route.includes('\\'))throw Error();
  const body=await readFile(file);
  res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.jpeg':'image/jpeg','.png':'image/png'})[path.extname(file)]||'application/octet-stream');
  res.end(body);
 }catch{res.writeHead(404);res.end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
let browser;
try{
 for(const route of ['/src/config.js','/supabase/migrations/001_schema.sql','/.env','/package.json','/artifacts/private-backups/latest-backup-path.txt']){
  const response=await fetch(origin+route);expect(response.status).toBe(404);
 }
 browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:950}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await mockBackend(page,{origin});await page.goto(origin);
 await expect(page.locator('[data-form="login"]')).toBeVisible();
 expect(await page.locator('img').evaluateAll(xs=>xs.every(x=>x.complete&&x.naturalWidth>0))).toBeTruthy();
 await loginMock(page);
 const nav=async key=>{await page.locator(`.sidebar [data-screen="${key}"]`).click();await expect(page.locator(`.sidebar [data-screen="${key}"]`)).toHaveClass(/active/);};
 await nav('cases');await page.locator('[data-open="case"]').click();
 await page.locator('[name="name"]').fill('اختبار حزمة Web فقط');await page.locator('[name="fee"]').fill('30000');
 await page.locator('.dialog [type=submit]').click();await expect(page.locator('[data-case-value="remaining"]')).toHaveText('٣٠٬٠٠٠ ج.م');
 await page.getByRole('button',{name:'تسجيل دفعة',exact:true}).click();await page.locator('[name="amount"]').fill('10000');
 await page.locator('.dialog [type=submit]').click();await expect(page.locator('[data-case-value="remaining"]')).toHaveText('٢٠٬٠٠٠ ج.م');
 await page.locator('.dialog [data-close]').first().click();await nav('reports');
 const download=page.waitForEvent('download');await page.locator('[data-export="xlsx"]').click();
 const file=await download;expect(file.suggestedFilename()).toBe('bidaya-report.xlsx');
 const bytes=await readFile(await file.path());expect(bytes.subarray(0,2).toString()).toBe('PK');
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(350);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 expect(errors).toEqual([]);
 console.log('PASS built Web: static login/assets, mocked financial save, XLSX lazy chunk, mobile layout; private source paths return 404. No real Supabase calls.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
