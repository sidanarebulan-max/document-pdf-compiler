const {chromium}=require('playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.FARIS_TEST_CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--disable-gpu-sandbox']});
 try{
  for(const role of ['staff','admin'])for(const mobile of [true,false]){
   const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:900},isMobile:mobile,hasTouch:mobile});
   await context.addInitScript(()=>{
    localStorage.setItem('faris_lead_hub_session_v2','workspace-fixture-session');
    localStorage.setItem('faris_lead_hub_trusted_browser_v1','workspace-fixture-device');
   });
   const errors=[],calls=[];
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   const user=role==='staff'?{id:'saz',display_name:'Sazwani',staff_code:'SAZ0001',role}:{id:'admin',display_name:'Faris',staff_code:'FARIS01',role};
   await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.hostname==='workspace.test'){
     const file=url.pathname==='/staff.html'?'staff.html':url.pathname.slice(1);
     if(['staff.html','staff.css','staff-navigation.js','staff-passcode.js','telegram-hub.js','inbox-client.js','staff-inbox.js'].includes(file)){
      return route.fulfill({status:200,contentType:file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'text/javascript',body:fs.readFileSync(path.join(process.cwd(),file),'utf8')});
     }
    }
    if(url.hostname.endsWith('.supabase.co')){
     if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type','Access-Control-Allow-Methods':'POST'}});
     const {action}=route.request().postDataJSON();calls.push(action);
     const result=url.pathname.endsWith('/lead-hub-inbox')&&action==='list'?{ok:true,files:[],total:0,next_offset:null,staff:[]}:action==='me'?{ok:true,user}:action==='list'?{ok:true,leads:[],history:[],staff:[],available_count:0,assignment_history:[{
      id:1,lead_id:'ridwhan',assignee_name:'Aiman',assignee_code:'AIMAN01',event_type:'legacy_assignment',assigned_at:null,recorded_at:'2026-10-26T12:00:00Z',lead:{id:'ridwhan',customer_name:'Ridwhan',phone_e164:'60123456789',model:'Proton e.MAS 5',consent_confirmed:true,stage:'claimed',assigned_id:'aiman'}
     }]}:action==='status_admin'?{ok:true,devices:[],enabled:false,pending:0}:{ok:true,team:{},personal:{},connected:false};
     return route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(result)});
    }
    return route.fulfill({status:200,contentType:'text/javascript',body:''});
   });
   await page.goto('https://workspace.test/staff.html');
   await page.waitForFunction(()=>document.getElementById('pmHistoryCount').textContent==='1'||document.getElementById('lastRefresh').textContent.includes('Dikemas'));
   assert.equal(await page.locator('#workspace-whatsapp').isVisible(),true);
   assert.equal(await page.locator('#telegramPanel').isVisible(),false);
   assert.equal(await page.locator('#createStaffForm').isVisible(),false);
   assert.equal(await page.locator('#whatsappAdminPanel').isVisible(),role==='admin');
   assert.equal(calls.includes('telegram_status'),false,'WhatsApp must not fetch Telegram status');
   assert.equal(calls.includes('status_admin'),false,'WhatsApp must not fetch Worker status');
   if(role==='staff'){
    await page.locator('[data-pm-tab="history"]').click();
    assert.match(await page.locator('#pmHistoryList').innerText(),/Aiman \(AIMAN01\)/);
    await page.locator('#leadSearch').fill('AIMAN01');
    assert.match(await page.locator('#pmHistoryList').innerText(),/Ridwhan/);
   }
   const nav=page.locator(mobile?'#mobileDock':'#workspaceNav');
   for(const [key,shown] of [['docs','staffWorkflow'],['telegram','telegramPanel'],['settings','accessCode']]){
    await nav.locator(`[${mobile?'data-mobile-nav':'data-workspace-nav'}="${key}"]`).click();
    assert.equal(await page.locator('#'+shown).isVisible(),true);
    assert.equal(await page.locator('#leadSection').isVisible(),false);
    assert.equal(await page.locator('#createStaffForm').isVisible(),key==='settings'&&role==='admin');
    assert.equal(await page.locator('#addLeadForm').isVisible(),false);
    assert.equal(await page.locator('#telegramPanel').isVisible(),key==='telegram');
    assert.equal(await page.locator('[data-workspace-page]:visible').count(),1);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    if(mobile&&key==='settings')await page.screenshot({path:`/workspace/scratch/f9187d9ae437/workspace-${role}-access.png`,fullPage:true});
   }
   assert.equal(await page.locator('#accessCode').innerText(),user.staff_code);
   await nav.locator(`[${mobile?'data-mobile-nav':'data-workspace-nav'}="whatsapp"]`).click();
   await page.locator('#messageSettingsBtn').click();
   assert.equal(await page.locator('#messageSettingsPanel').isVisible(),true);
   assert.equal(await page.locator('#createStaffForm').isVisible(),false);
   if(mobile){
    await page.locator('[data-theme-choice="light"]').click();
    await page.screenshot({path:`/workspace/scratch/f9187d9ae437/workspace-${role}-mobile.png`,fullPage:true});
   }
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   assert.deepEqual(errors,[]);
   await page.locator('#signoutBtn').click();
   await page.waitForFunction(()=>!document.getElementById('authSection').classList.contains('hide'));
   assert.equal(await page.locator('[data-workspace-page]:visible').count(),0);
   console.log(`PASS ${role}/${mobile?'phone light':'desktop dark'}: separated workspaces, correct admin controls, scripts, history, logout, no overflow/errors`);
   await context.close();
  }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
