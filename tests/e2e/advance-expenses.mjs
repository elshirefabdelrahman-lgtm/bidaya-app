import {chromium,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {mockBackend,loginMock} from './mock-backend.mjs';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:950}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));const backend=await mockBackend(page);
 await page.goto('http://localhost:4174');await loginMock(page);await expect(page.locator('.sidebar [data-screen="advances"]')).toHaveCount(0);await expect(page.locator('.sidebar [data-screen="expenses"]')).toHaveText('المصروفات والسلف');
 const nav=async key=>{await page.locator(`[data-screen="${key}"]`).first().click();await expect(page.locator(`.sidebar [data-screen="${key}"]`)).toHaveClass(/active/);};
 const save=async()=>{await page.locator('.dialog [type=submit]').click();await expect(page.locator('.dialog')).toHaveCount(0);};
 await nav('employees');await page.locator('[data-open="employee"]').click();
 for(const [k,v]of Object.entries({name:'أحمد اختبار السلف',role:'إداري',salary:'6000'}))await page.locator(`[name="${k}"]`).fill(v);
 await save();await nav('expenses');await page.locator('[data-open="advance"]').click();await page.locator('[name="amount"]').fill('1000');await save();
 await nav('expenses');await expect(page.locator('[data-movement-source="advance"]')).toHaveCount(1);
 await expect(page.locator('[data-movement-source="advance"]')).toContainText('أحمد اختبار السلف');
 await expect(page.locator('[data-movement-source="advance"] [data-void]')).toHaveCount(0);
 await expect(page.locator('[data-expense-summary]')).toContainText('١٬٠٠٠ ج.م');
 expect(backend.snapshot().expenses).toHaveLength(0);await expect(page.locator('[data-open="advance"]')).toBeVisible();await expect(page.locator('[data-open="expense"]')).toBeVisible();
 await page.locator('[data-movement-source="advance"] [data-advance-balances]').click();
 await expect(page.locator('#advance-balances')).toBeInViewport();
 await page.locator('[data-open="repayment"]').click();await page.locator('[name="amount"]').fill('200');await save();
 await nav('payroll');await page.locator('[data-open="salary"]').click();await page.locator('[name="advance"]').fill('800');await page.locator('[name="paid"]').fill('5200');await save();
 await nav('expenses');await expect(page.locator('[data-expense-ledger] tbody tr')).toHaveCount(2);
 await expect(page.locator('[data-movement-source="advanceReturn"]')).toContainText('٢٠٠ ج.م');
 await page.locator('select[name="category"]').selectOption('سلفة موظف');await page.locator('[data-form="filters"] [type=submit]').click();
 await expect(page.locator('[data-expense-ledger] tbody tr')).toHaveCount(1);
 await page.locator('[data-refresh]').click();await expect(page.locator('[data-movement-source="advance"]')).toHaveCount(1);
 const data=backend.snapshot();expect(data.expenses).toHaveLength(0);expect(data.advances).toHaveLength(1);expect(data.settlements).toHaveLength(2);
 await nav('reports');await expect(page.locator('#main')).toContainText('٦٬٠٠٠');
 await nav('expenses');await page.setViewportSize({width:390,height:844});
 await expect(page.locator('[data-expense-summary]')).toBeVisible();await page.waitForTimeout(350);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await mkdir('artifacts/advance-expenses',{recursive:true});await page.screenshot({path:'artifacts/advance-expenses/mobile.png',fullPage:true,animations:'disabled'});
 for(const permission of ['finance','payroll']){
  const limited=await browser.newPage();await mockBackend(limited,{user:{id:'limited',name:'اختبار صلاحيات',role:'Employee',active:true,permissions:[permission],branches:['فرع اختبار محلي']}});
  await limited.goto('http://localhost:4174');await loginMock(limited);
  await limited.locator('.sidebar [data-screen="expenses"]').click();await expect(limited.locator('h1')).toHaveText('المصروفات والسلف');
  await expect(limited.locator('[data-open="expense"]')).toHaveCount(permission==='finance'?1:0);
  await expect(limited.locator('[data-open="advance"]')).toHaveCount(permission==='payroll'?1:0);
  await expect(limited.locator('[data-open="repayment"]')).toHaveCount(permission==='payroll'?1:0);
  await limited.close();
 }
 expect(errors).toEqual([]);console.log('PASS advance expenses: automatic linked row, cash return, salary settlement without duplication, filters, refresh, reports and mobile; mocked backend only.');
}finally{await browser.close();}
