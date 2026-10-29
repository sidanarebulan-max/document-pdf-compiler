const uiAsset=require('./ui-assets.cjs');
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.FARIS_TEST_CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--disable-gpu-sandbox']});
 try{for(const mobile of [true,false]){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:900},isMobile:mobile,hasTouch:mobile});
  await context.addInitScript(()=>{localStorage.setItem('faris_lead_hub_session_v2','fixture');localStorage.setItem('faris_lead_hub_trusted_browser_v1','fixture')});
  const user={id:'saz',display_name:'Sazwani',staff_code:'SAZ0001',role:'staff'},number={id:'11111111-1111-4111-8111-111111111111',customer_name:'Ridwhan',phone_e164:'60123456789',model:'Proton e.MAS 5',assigned_id:'aiman',stage:'claimed',consent_confirmed:true};
  const activity=[],sent=[],calls=[],errors=[];const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());if(await uiAsset(route,url))return;
   if(url.hostname==='shared.test'){
    const name=url.pathname==='/staff.html'?'staff.html':url.pathname.slice(1);
    if(['staff.html','staff.css','staff-navigation.js','staff-passcode.js','telegram-hub.js','inbox-client.js','staff-inbox.js'].includes(name))return route.fulfill({contentType:name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':'text/javascript',body:fs.readFileSync(name)});
   }
   if(url.hostname==='wa.me')return route.fulfill({contentType:'text/html',body:'WhatsApp link intercepted for test; no message sent.'});
   if(url.hostname.endsWith('.supabase.co')){
    const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type','Access-Control-Allow-Methods':'POST'};
    if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
    const d=route.request().postDataJSON();calls.push(d);let result;
    if(d.action==='me')result={ok:true,user};
    else if(d.action==='list'&&url.pathname.endsWith('lead-hub-inbox'))result={ok:true,files:[],total:0,next_offset:null,staff:[]};
    else if(d.action==='list')result={ok:true,leads:[],staff:[],history:[],activity_log:activity,my_pm:sent,available_count:0,assignment_history:[1,2].map(id=>({id,lead_id:number.id,assignee_name:'Aiman',assignee_code:'AIMAN01',event_type:'claimed',assigned_at:'2026-10-27T11:00:00Z',recorded_at:'2026-10-27T11:00:00Z',lead:number}))};
    else if(d.action==='open_shared'||d.action==='confirm_shared_pm'){
     assert.match(d.operation_id,/^[a-f0-9-]{36}$/i);
     const event_type=d.action==='open_shared'?'whatsapp_opened':'pm_confirmed';
     activity.push({id:activity.length+1,lead_id:number.id,actor_id:user.id,actor_name:'Sazwani',actor_code:'SAZ0001',event_type,created_at:'2026-10-27T12:00:00Z',lead:number});
     if(event_type==='pm_confirmed')sent.push({...number,pm_confirmed_at:'2026-10-27T12:00:00Z'});
     result={ok:true};
    }else result={ok:true,team:{},personal:{},connected:false};
    return route.fulfill({contentType:'application/json',headers,body:JSON.stringify(result)});
   }
   return route.fulfill({contentType:'text/javascript',body:''});
  });
  await page.goto('https://shared.test/staff.html');await page.waitForFunction(()=>document.getElementById('pmHistoryCount').textContent==='1');
  assert.equal(await page.locator('#staffPmTabs [role="tab"]').count(),4);
  await page.locator('[data-pm-tab="history"]').click();assert.equal(await page.locator('#pmHistoryList [data-history-number]').count(),1);
  assert.match(await page.locator('#pmHistoryList').innerText(),/Aiman \(AIMAN01\)/);
  assert.equal(await page.locator('#pmActivityList').isVisible(),false);
  await page.locator('[data-history-open]').click();await page.waitForFunction(()=>true);
  await page.locator('[data-history-confirm]').click();await page.waitForFunction(()=>document.getElementById('pmSentCount').textContent==='1');
  assert.equal(number.assigned_id,'aiman');assert.equal(number.stage,'claimed');
  assert.equal(await page.locator('#pmHistoryList [data-history-number]').count(),1);
  await page.locator('[data-pm-tab="log"]').click();
  assert.match(await page.locator('#pmActivityList').innerText(),/Mesej disahkan sudah PM/);assert.match(await page.locator('#pmActivityList').innerText(),/Sazwani \(SAZ0001\)/);
  assert.equal(await page.locator('#pmActivityList a,#pmActivityList button').count(),0);
  await page.locator('#leadSearch').fill('Sazwani');assert.equal(await page.locator('#pmActivityList .pm-history-card').count(),2);
  await page.locator('#leadSearch').fill('');await page.locator('[data-pm-tab="sent"]').click();assert.match(await page.locator('#leadList').innerText(),/Ridwhan/);assert.equal(await page.locator('#leadList textarea').count(),0);
  await page.locator('[data-pm-tab="history"]').click();assert.equal(await page.locator('#pmHistoryList [data-history-number]').count(),1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);assert.ok(calls.some(x=>x.action==='open_shared'));assert.ok(calls.some(x=>x.action==='confirm_shared_pm'));
  await page.screenshot({path:path.join(process.env.FARIS_TEST_ARTIFACT_DIR||os.tmpdir(),'faris-shared-history-'+(mobile?'phone':'desktop')+'.png'),fullPage:true});
  console.log('PASS '+(mobile?'phone':'desktop')+': deduplicated numbers, another staff can open and confirm PM, own Dah PM updated, separate actor log, claim unchanged; no real WhatsApp sent');
  await context.close();
 }}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
