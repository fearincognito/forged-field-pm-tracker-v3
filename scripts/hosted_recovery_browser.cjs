const fs=require('fs');
const {chromium}=require('playwright');
(async()=>{
 const config=JSON.parse(fs.readFileSync(process.env.RECOVERY_BROWSER_CONFIG,'utf8'));
 if(config.target!=='sgfeieqqkrogvzotrais')throw Error('Wrong target');
 const browser=await chromium.launch({headless:true});
 try{
  for(const [role,creds] of [['owner',config.owner],['viewer',config.viewer]]){
   const context=await browser.newContext({serviceWorkers:'block'});
   await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.href.includes('eaehrhqsqmlcjcuzeyoh'))return route.abort();
    if(url.origin==='https://'+config.target+'.supabase.co' && (url.pathname.startsWith('/functions/') || /\/auth\/v1\/(signup|recover|otp|invite|resend)/.test(url.pathname)))return route.abort();
    if(url.origin==='http://127.0.0.1:55300'||url.origin==='https://'+config.target+'.supabase.co'||url.origin==='https://cdn.jsdelivr.net')return route.continue();
    return route.abort();
   });
   await context.routeWebSocket('**/*',ws=>ws.close());
   const page=await context.newPage();
   await page.goto('http://127.0.0.1:55300');
   await page.locator('#email').fill(creds.email);await page.locator('#password').fill(creds.password);
   await page.getByRole('button',{name:'Sign in',exact:true}).click();
   await page.locator('#sitesCard').waitFor({state:'visible',timeout:30000});
   await page.evaluate(({id,site})=>window.openEquipment(id,site),{id:config.equipment.id,site:config.equipment.site_id});
   await page.locator('#equipmentBackSite').waitFor({state:'visible',timeout:30000});
   if(role==='viewer' && await page.locator('#editEquipmentButton').count())throw Error('Viewer edit visible');
   const result=await page.evaluate(()=>pmEstimatedHours({current_hours:100,operating_hours_per_day:12,hours_recorded_at:'2026-10-01T15:00:00Z',status:'active'},{rotation_type:'custom',rotation_on_days:2,rotation_off_days:2,rotation_anchor_date:'2026-10-01'},new Date('2026-10-05T18:00:00Z')).hours);
   if(result!==124)throw Error('PM calculation failed');
   await context.close();
  }
 }finally{await browser.close();}
})().catch(()=>{console.error('HOSTED_BROWSER_CHECK_FAILED');process.exit(1);});
