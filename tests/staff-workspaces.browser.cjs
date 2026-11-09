const uiAsset=require('./ui-assets.cjs');
const {chromium}=require('playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const path=require('node:path');
const insightCore=require('../customer-insights-core');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.FARIS_TEST_CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--disable-gpu-sandbox']});
 try{
  for(const role of ['staff','admin'])for(const mobile of [true,false]){
   const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:900},isMobile:mobile,hasTouch:mobile});
   await context.addInitScript(()=>{
    localStorage.setItem('faris_lead_hub_session_v2','workspace-fixture-session');
    localStorage.setItem('faris_lead_hub_trusted_browser_v1','workspace-fixture-device');
   });
   const errors=[],calls=[],trendRequests=[];
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   const user=role==='staff'?{id:'saz',display_name:'Sazwani',staff_code:'SAZ0001',role}:{id:'admin',display_name:'Faris',staff_code:'FARIS01',role};
   await page.route('**/*',async route=>{
    const url=new URL(route.request().url());if(await uiAsset(route,url))return;
    if(url.hostname==='workspace.test'){
     const file=url.pathname==='/staff.html'?'staff.html':url.pathname.slice(1);
     if(['staff.html','staff.css','staff-navigation.js','staff-passcode.js','telegram-hub.js','inbox-client.js','staff-inbox.js','staff-gallery.js','staff-gallery.css','staff-customers.js','staff-customers.css','customer-insights-core.js'].includes(file)){
      return route.fulfill({status:200,contentType:file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'text/javascript',body:fs.readFileSync(path.join(process.cwd(),file),'utf8')});
     }
    }
    if(url.hostname.endsWith('.supabase.co')){
     if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type','Access-Control-Allow-Methods':'POST'}});
     const body=route.request().postDataJSON(),{action}=body;calls.push(action);
     const range=insightCore.calendarWeek(body.from);const trend=range?[{bucket:range.days[0],total:2,lou:1,delivered:0,pending:1,trade_in:1},{bucket:range.days[6],total:5,lou:0,delivered:1,pending:4,trade_in:0}]:[];
     if(url.pathname.endsWith('/lead-hub-customers')&&action==='dashboard')trendRequests.push(body);
     const result=url.pathname.endsWith('/lead-hub-customers')?{ok:true,customers:[],total:0,next_offset:null,staff:[],models:[],options:{},insights:{stats:{},total:0,vehicles:[],colours:[],statuses:[],trend,generated_at:new Date().toISOString()}}:url.pathname.endsWith('/lead-hub-gallery')?{ok:true,files:[],counts:{},total:0,next_offset:null}:url.pathname.endsWith('/lead-hub-inbox')&&action==='list'?{ok:true,files:[],total:0,next_offset:null,staff:[]}:action==='me'?{ok:true,user}:action==='list'?{ok:true,leads:[],history:[],staff:[],available_count:0,assignment_history:[{
      id:1,lead_id:'ridwhan',assignee_name:'Aiman',assignee_code:'AIMAN01',event_type:'legacy_assignment',assigned_at:null,recorded_at:'2026-10-26T12:00:00Z',lead:{id:'ridwhan',customer_name:'Ridwhan',phone_e164:'60123456789',model:'Proton e.MAS 5',consent_confirmed:true,stage:'claimed',assigned_id:'aiman'}
     }]}:action==='import'?{ok:true,inserted:1,duplicates:0,auto_assigned:1}:action==='status_admin'?{ok:true,devices:[],enabled:false,pending:0}:{ok:true,team:{},personal:{},connected:false};
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
   await page.waitForFunction(()=>document.querySelectorAll('#whatsappTrendResult tbody tr').length===7);
   assert.equal(await page.evaluate(()=>document.getElementById('whatsappTrend').nextElementSibling.id),'whatsappAdminPanel');
   assert.equal(await page.evaluate(()=>document.getElementById('whatsappAdminPanel').nextElementSibling.id),'leadSection');
   await page.locator('#whatsappWeekDate').fill('2026-11-09');await page.locator('#whatsappWeekDate').dispatchEvent('change');
   await page.waitForFunction(()=>document.querySelector('#whatsappTrendResult tbody tr th')?.textContent==='9 Nov 2026');
   if(mobile)assert.ok(await page.locator('#whatsappTrendResult .insights-trend-scroll').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'weekly table columns must fit the phone');
   assert.equal(await page.locator('#whatsappTrendResult tbody tr').count(),7);assert.equal(trendRequests.at(-1).from,'2026-11-09');assert.equal(trendRequests.at(-1).to,'2026-11-15');assert.equal(trendRequests.at(-1).group,'day');
   assert.equal(await page.locator('#whatsappTrendResult tbody tr').nth(0).locator('td').first().innerText(),'2');assert.equal(await page.locator('#whatsappTrendResult tbody tr').nth(1).locator('td').first().innerText(),'0');assert.equal(await page.locator('#whatsappTrendResult tbody tr').nth(6).locator('td').first().innerText(),'5');
   await page.locator('#whatsappWeekPrevious').click();await page.waitForFunction(()=>document.querySelector('#whatsappTrendResult tbody tr th')?.textContent==='2 Nov 2026');assert.equal(trendRequests.at(-1).to,'2026-11-08');
   await page.locator('#whatsappWeekNext').click();await page.waitForFunction(()=>document.querySelector('#whatsappTrendResult tbody tr th')?.textContent==='9 Nov 2026');
   await page.locator('#whatsappWeekDate').fill('2027-01-01');await page.locator('#whatsappTrendForm').evaluate(e=>e.requestSubmit());await page.waitForFunction(()=>document.querySelector('#whatsappTrendResult tbody tr th')?.textContent==='28 Dis 2026');assert.equal(trendRequests.at(-1).to,'2027-01-03');
   const requestCount=trendRequests.length;await page.locator('#whatsappWeekDate').fill('');await page.locator('#whatsappWeekDate').dispatchEvent('change');assert.equal(await page.locator('#whatsappTrendResult [role="alert"]').isVisible(),true);assert.equal(trendRequests.length,requestCount);
   await page.locator('#whatsappWeekCurrent').click();await page.waitForFunction(()=>document.querySelectorAll('#whatsappTrendResult tbody tr').length===7);assert.equal(trendRequests.at(-1).from,insightCore.calendarWeek().from);
   if(role==='admin'){
    const trendBox=await page.locator('#whatsappTrend').boundingBox(),formBox=await page.locator('#whatsappAdminPanel').boundingBox(),listBox=await page.locator('#leadSection').boundingBox();assert.ok(trendBox.y+trendBox.height<=formBox.y+2&&formBox.y<listBox.y,'number entry must follow weekly totals, before customer list');
    await page.locator('#addName').fill('Pelanggan Ujian');await page.locator('#addPhone').fill('0123456789');await page.locator('#addConsent').check();await page.locator('#addLeadBtn').click();await page.waitForFunction(()=>document.getElementById('addPhone').value==='');assert.ok(calls.includes('import'));
    await page.locator('#whatsappTrend').scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/faris-weekly-'+(mobile?'phone':'desktop')+'.png',fullPage:true});
   }
   assert.equal(calls.includes('telegram_status'),false,'WhatsApp must not fetch Telegram status');
   assert.equal(calls.includes('status_admin'),false,'WhatsApp must not fetch Worker status');
   if(role==='staff'){
    await page.locator('[data-pm-tab="history"]').click();
    assert.match(await page.locator('#pmHistoryList').innerText(),/Aiman \(AIMAN01\)/);
    await page.locator('#leadSearch').fill('AIMAN01');
    assert.match(await page.locator('#pmHistoryList').innerText(),/Ridwhan/);
   }
   const nav=page.locator(mobile?'#mobileDock':'#workspaceNav');
   for(const [key,shown] of [['customers','customersTitle'],['gallery','galleryTitle'],['docs','staffWorkflow'],['telegram','telegramPanel'],['settings','accessCode']]){
    if(mobile&&['gallery','telegram','settings'].includes(key)){await page.locator('#farisMoreButton').click();await page.locator('#farisMoreDialog [data-workspace-nav="'+key+'"]').click()}else await nav.locator(`[${mobile?'data-mobile-nav':'data-workspace-nav'}="${key}"]`).click();
    assert.equal(await page.locator('#'+shown).isVisible(),true);
    assert.equal(await page.locator('#leadSection').isVisible(),false);
    assert.equal(await page.locator('#createStaffForm').isVisible(),key==='settings'&&role==='admin');
    assert.equal(await page.locator('#addLeadForm').isVisible(),false);
    assert.equal(await page.locator('#telegramPanel').isVisible(),key==='telegram');
    assert.equal(await page.locator('[data-workspace-page]:visible').count(),1);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    if(mobile&&key==='settings')await page.screenshot({path:`/tmp/workspace-${role}-access.png`,fullPage:true});
   }
   assert.equal(await page.locator('#accessCode').innerText(),user.staff_code);
   await nav.locator(`[${mobile?'data-mobile-nav':'data-workspace-nav'}="whatsapp"]`).click();
   await page.locator('#messageSettingsBtn').click();
   assert.equal(await page.locator('#messageSettingsPanel').isVisible(),true);
   assert.equal(await page.locator('#createStaffForm').isVisible(),false);
   if(mobile){
    await page.locator('[data-theme-choice="light"]').click();
    await page.screenshot({path:`/tmp/workspace-${role}-mobile.png`,fullPage:true});
   }
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   assert.deepEqual(errors,[]);
   await page.locator('#signoutBtn').click();
   await page.waitForFunction(()=>!document.getElementById('authSection').classList.contains('hide'));
   assert.equal(await page.locator('[data-workspace-page]:visible').count(),0);
   console.log(`PASS ${role}/${mobile?'phone light':'desktop dark'}: separated workspaces, weekly seven-day totals, week navigation, number entry above list, correct admin controls, scripts, history, logout, no overflow/errors`);
   await context.close();
  }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
