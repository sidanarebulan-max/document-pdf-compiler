const {chromium}=require('playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  for(const mobile of [true,false]){
   const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:900},isMobile:mobile,hasTouch:mobile});
   await context.addInitScript(()=>{
    localStorage.setItem('faris_lead_hub_session_v2','history-test-session');
    localStorage.setItem('faris_lead_hub_trusted_browser_v1','history-test-device');
   });
   const errors=[];
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.hostname==='history.test'){
     const file=url.pathname==='/staff.html'?'staff.html':url.pathname.slice(1);
     if(['staff.html','staff.css','staff-passcode.js'].includes(file)){
      return route.fulfill({status:200,contentType:file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'text/javascript',body:fs.readFileSync(path.join(process.cwd(),file),'utf8')});
     }
    }
    if(url.pathname.endsWith('/lead-hub')){
     const {action}=route.request().postDataJSON();
     const user={id:'saz',display_name:'Sazwani',staff_code:'SAZ0001',role:'staff'};
     const result=action==='me'?{ok:true,user}:action==='list'?{
      ok:true,leads:[],history:[],staff:[user],available_count:0,assignment_history:[{
       id:1,lead_id:'ridwhan',assignee_name:'Aiman',assignee_code:'AIMAN01',
       event_type:'legacy_assignment',assigned_at:null,recorded_at:'2026-10-26T12:00:00Z',
       lead:{customer_name:'Ridwhan',phone_e164:'60123456789',model:'Proton e.MAS 5'}
      }]}:{ok:true,team:{},personal:{}};
     return route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(result)});
    }
    return route.fulfill({status:200,contentType:'text/javascript',body:''});
   });
   await page.goto('https://history.test/staff.html');
   await page.waitForFunction(()=>document.getElementById('pmHistoryCount').textContent==='1');
   await page.locator('[data-pm-tab="history"]').click();
   assert.match(await page.locator('#pmHistoryList').innerText(),/Aiman \(AIMAN01\)/);
   assert.match(await page.locator('#pmHistoryList').innerText(),/Ridwhan/);
   assert.match(await page.locator('#pmHistoryList').innerText(),/Masa claim asal tidak direkodkan/);
   assert.equal(await page.locator('#pmHistoryList a,#pmHistoryList button').count(),0);
   await page.locator('#leadSearch').fill('AIMAN01');
   assert.match(await page.locator('#pmHistoryList').innerText(),/Ridwhan/);
   if(mobile){
    await page.locator('[data-theme-choice="light"]').click();
    await page.screenshot({path:'/workspace/scratch/f9187d9ae437/history-mobile-check.png',fullPage:true});
   }
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
   assert.equal(overflow,false,'History must fit viewport');assert.deepEqual(errors,[]);
   console.log(`PASS ${mobile?'mobile light':'desktop dark'}: zero own leads, shared claim, claimant search, no edit buttons, no overflow or script errors`);
   await context.close();
  }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
