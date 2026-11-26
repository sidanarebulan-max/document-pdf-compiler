const uiAsset=require('./ui-assets.cjs');
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
// The document tools (VSO, PDF Compiler, Application Form) open only for a signed-in staff account.
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.FARIS_TEST_CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const cases=[
  {name:'no account',session:null,device:null,mobile:false,url:'/',expect:'login'},
  {name:'expired session, no trusted browser',session:'expired',device:null,mobile:false,url:'/',expect:'login'},
  {name:'expired session, revoked trusted browser',session:'expired',device:'revoked',mobile:false,url:'/',expect:'login'},
  {name:'signed-in staff',session:'valid',device:null,mobile:false,url:'/',expect:'tools'},
  {name:'expired session renewed by trusted browser',session:'expired',device:'trusted',mobile:false,url:'/?tool=VSO&origin=staff',expect:'tools'},
  {name:'phone without account on staff tool link',session:null,device:null,mobile:true,url:'/?tool=VSO&origin=staff',expect:'login'},
  {name:'phone signed-in staff on tool link',session:'valid',device:null,mobile:true,url:'/?tool=VSO&origin=staff',expect:'tools'},
 ];
 for(const c of cases){
  const ctx=await browser.newContext({viewport:c.mobile?{width:390,height:844}:{width:1280,height:900},isMobile:c.mobile,hasTouch:c.mobile});
  await ctx.addInitScript(([s,d])=>{if(sessionStorage.getItem('seeded'))return;sessionStorage.setItem('seeded','1');if(s)localStorage.setItem('faris_lead_hub_session_v2',s);if(d)localStorage.setItem('faris_lead_hub_trusted_browser_v1',d)},[c.session,c.device]);
  const page=await ctx.newPage();
  await page.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());if(await uiAsset(route,url))return;
   if(url.hostname==='docs.test'){
    if(url.pathname==='/'||url.pathname==='/index.html')return route.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(process.cwd(),'index.html'))});
    if(url.pathname==='/staff.html')return route.fulfill({contentType:'text/html',body:'<!doctype html><title>login</title><h1 id="login">Lead Hub login</h1>'});
   }
   if(url.hostname.endsWith('.supabase.co')){
    const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type','Access-Control-Allow-Methods':'POST'};
    if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
    const b=req.postDataJSON()||{},auth=req.headers().authorization||'';
    if(b.action==='me'&&auth==='Bearer valid')return route.fulfill({contentType:'application/json',headers,body:JSON.stringify({ok:true,user:{role:'staff'}})});
    if(b.action==='resume_device'&&b.device_token==='trusted')return route.fulfill({contentType:'application/json',headers,body:JSON.stringify({ok:true,token:'valid'})});
    return route.fulfill({status:401,contentType:'application/json',headers,body:JSON.stringify({ok:false,error:'UNAUTHORIZED'})});
   }
   return route.fulfill({contentType:url.pathname.endsWith('.css')?'text/css':'text/javascript',body:''});
  });
  await page.goto('https://docs.test'+c.url);
  if(c.expect==='login'){
   await page.waitForURL('**/staff.html');assert.equal(await page.locator('#login').isVisible(),true,c.name);
  }else{
   await page.waitForFunction(()=>document.documentElement.style.visibility==='');
   assert.equal(new URL(page.url()).pathname,'/',c.name);
   if(c.device==='trusted')assert.equal(await page.evaluate(()=>localStorage.getItem('faris_lead_hub_session_v2')),'valid');
   await page.evaluate(()=>window.dispatchEvent(new StorageEvent('storage',{key:'faris_lead_hub_session_v2',newValue:null})));
   await page.waitForURL('**/staff.html');
  }
  console.log('PASS '+c.name+' → '+c.expect);await ctx.close();
 }
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
