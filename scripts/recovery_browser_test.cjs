const fs=require('fs');
const {chromium}=require('playwright');
(async()=>{
 const config=JSON.parse(fs.readFileSync(process.env.RECOVERY_BROWSER_CONFIG,'utf8'));
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try{
  for(const [role,creds] of [['owner',config.owner],['viewer',config.viewer]]){
   const context=await browser.newContext();
   await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.hostname==='127.0.0.1'||url.hostname==='cdn.jsdelivr.net')return route.continue();
    return route.abort();
   });
   const page=await context.newPage();
   await page.goto('http://127.0.0.1:55300');
   await page.locator('#email').fill(creds.email);await page.locator('#password').fill(creds.password);
   await page.locator('#loginForm button').click();
   await page.locator('#sitesCard').waitFor({state:'visible',timeout:30000});
   await page.evaluate(({id,site})=>window.openEquipment(id,site),{id:config.equipment.id,site:config.equipment.site_id});
   await page.locator('#equipmentBackSite').waitFor({state:'visible',timeout:30000});
   if(role==='viewer' && await page.locator('#editEquipmentButton').count())throw Error('Viewer edit visible');
   const result=await page.evaluate(()=>{
    const machine={current_hours:100,operating_hours_per_day:12,hours_recorded_at:'2026-10-01T15:00:00Z',status:'active'};
    const site={rotation_type:'custom',rotation_on_days:2,rotation_off_days:2,rotation_anchor_date:'2026-10-01'};
    return pmEstimatedHours(machine,site,new Date('2026-10-05T18:00:00Z')).hours;
   });
   if(result!==124)throw Error('PM calculation failed');
   await context.close();
  }
 }finally{await browser.close();}
})().catch(error=>{let reason='BROWSER_CHECK_FAILED';if(String(error.message).includes('Timeout'))reason='BROWSER_SELECTOR_TIMEOUT';if(String(error.message).includes('Executable'))reason='BROWSER_EXECUTABLE_MISSING';if(String(error.message).includes('dependencies'))reason='BROWSER_DEPENDENCIES_MISSING';let message=String(error.message).split('\n')[0].slice(0,400);try{const cfg=JSON.parse(fs.readFileSync(process.env.RECOVERY_BROWSER_CONFIG,'utf8'));for(const user of [cfg.owner,cfg.viewer])for(const value of Object.values(user))if(typeof value==='string'&&value)message=message.split(value).join('[test-value]');}catch{}console.error(reason+': '+message);process.exit(1);});
