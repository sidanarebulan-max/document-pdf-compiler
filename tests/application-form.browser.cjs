const {chromium}=require('playwright'),{PDFDocument}=require('pdf-lib');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {fixture}=require('./application-form.test.cjs');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.FARIS_TEST_CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--disable-gpu-sandbox']});
 try{for(const mobile of [true,false]){
  const user={id:'10000000-0000-4000-8000-000000000001',display_name:'Test Staff',staff_code:'TEST01',role:'staff'},target={id:'20000000-0000-4000-8000-000000000001',customer_name:'Nor Farah',phone_e164:'60100000001'};
  const ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile,acceptDownloads:true});await ctx.addInitScript(()=>localStorage.setItem('faris_lead_hub_session_v2','application-fixture'));
  const page=await ctx.newPage(),errors=[],uploads=[],links=[],network=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());network.push(u.hostname+u.pathname);
   if(u.hostname==='application.test'){
    if(u.pathname==='/api/health')return route.fulfill({contentType:'application/json',body:'{"configured":false}'});
    const f=u.pathname==='/'?'index.html':u.pathname.slice(1);
    if(!f.includes('..')&&(/^[a-z0-9-]+\.(js|css|html|webmanifest)$/.test(f)||f.startsWith('assets/'))&&fs.existsSync(f))return route.fulfill({contentType:f.endsWith('.html')?'text/html':f.endsWith('.css')?'text/css':f.endsWith('.png')?'image/png':f.endsWith('.ttf')?'font/ttf':'text/javascript',body:fs.readFileSync(f)});
   }
   if(u.hostname.endsWith('.supabase.co')){
    const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type','Access-Control-Allow-Methods':'POST'};if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});let result;
    if(u.searchParams.get('action')==='receive'){
     const form=await new Request(req.url(),{method:'POST',headers:{'content-type':req.headers()['content-type']},body:req.postDataBuffer()}).formData(),file=form.get('file');uploads.push({name:file.name,bytes:Buffer.from(await file.arrayBuffer())});result={ok:true,files:[{id:'30000000-0000-4000-8000-000000000001'}]};
    }else{
     const b=req.postDataJSON();if(b.action==='me')result={ok:true,user};
     else if(b.action==='list'&&u.pathname.endsWith('/lead-hub-customers'))result={ok:true,customers:[target],total:1,next_offset:null};
     else if(b.action==='link_files'){links.push(b);result={ok:true}}
     else result={ok:true,leads:[],history:[],staff:[],team:{},personal:{}};
    }return route.fulfill({headers,contentType:'application/json',body:JSON.stringify(result)});
   }
   if(u.pathname.endsWith('/pdf.min.js'))return route.fulfill({contentType:'text/javascript',body:fs.readFileSync('/workspace/scratch/f9187d9ae437/browser-check/vendor/pdf.min.js')});
   if(u.pathname.endsWith('/pdf.worker.min.js'))return route.fulfill({contentType:'text/javascript',body:fs.readFileSync('/workspace/scratch/f9187d9ae437/browser-check/vendor/pdf.worker.min.js')});
   if(u.pathname.includes('/pdf-lib'))return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(path.dirname(require.resolve('pdf-lib')),'../dist/pdf-lib.min.js'))});
   return route.fulfill({contentType:'text/javascript',body:''});
  });
  await page.goto('https://application.test/?tool=APPLICATION&origin=staff');
  await page.locator('#applicationWorkspace:visible').waitFor();assert.equal(await page.locator('[data-main]').count(),3);assert.equal(await page.locator('[data-main="APPLICATION"]').getAttribute('aria-selected'),'true');
  assert.equal(await page.locator('#vsoWorkspace').isVisible(),false);assert.equal(await page.locator('.app').isVisible(),false);
  await page.locator('#applicationGenerate').click();assert.match(await page.locator('#applicationStatus').innerText(),/nama pemohon/);
  await page.locator('#applicationPaste').fill(fixture);assert.equal(await page.locator('#applicationGenerate').isDisabled(),true);await page.locator('#applicationRead').click();
  assert.equal(await page.locator('#application_applicant_name').inputValue(),'Nor Farah');assert.equal(await page.locator('#application_spouse_name').inputValue(),'Pasangan Contoh');assert.equal(await page.locator('#application_reference_name').inputValue(),'Rujukan Contoh');assert.equal(await page.locator('#application_applicant_phone').inputValue(),'0100000001');
  assert.equal(uploads.length,0,'pasted customer data stays local');
  await page.locator('#applicationOutputName').fill('Nor_Farah - Application Form');
  await page.locator('#applicationGenerate').click();await page.waitForFunction(()=>document.getElementById('applicationStatus').textContent.includes('siap'),null,{timeout:25000});
  assert.equal(await page.locator('#applicationPreview canvas').count(),2);assert.equal(await page.locator('#applicationSaveProfile').isDisabled(),false);
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#applicationDownload').click()]);assert.equal(download.suggestedFilename(),'Nor Farah - Application Form.pdf');const bytes=fs.readFileSync(await download.path());assert.equal((await PDFDocument.load(bytes)).getPageCount(),2);
  await page.locator('#applicationPreview').scrollIntoViewIfNeeded();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'/tmp/faris-application-'+(mobile?'phone':'desktop')+'.png',fullPage:true});
  await page.locator('#applicationSaveProfile').click();await page.locator('[data-generated-target]').waitFor();await page.locator('[data-generated-target]').click();await page.locator('#generatedProfileOpen').waitFor();assert.equal(uploads[0].name,download.suggestedFilename());assert.deepEqual(uploads[0].bytes,bytes);assert.equal(links[0].data.category,'OTHER');assert.equal(links[0].data.party,'HIRER');await page.locator('#generatedProfileClose').click();
  await page.locator('#applicationToCompiler').click();await page.waitForFunction(()=>document.querySelector('.app').style.display!=='none');assert.equal(await page.locator('#fileCount').innerText(),'1 fail');
  assert.match(await page.locator('#sections').innerText(),/Nor Farah - Application Form.pdf/);assert.equal(await page.locator('#customerName').inputValue(),'Nor Farah');assert.equal(await page.locator('.select-mini').inputValue(),'OTHER');
  await page.locator('[data-main="VSO"]').click();assert.equal(await page.locator('#vsoWorkspace').isVisible(),true);await page.locator('[data-main="APPLICATION"]').click();assert.equal(await page.locator('#application_applicant_name').inputValue(),'Nor Farah');
  await page.locator('#application_applicant_name').fill('Nama Baru');assert.equal(await page.locator('#applicationDownload').isDisabled(),true);assert.equal(await page.locator('#applicationSaveProfile').isDisabled(),true);
  await page.locator('#applicationPaste').fill('MAKLUMAT PEMOHON\nNama: Customer Baharu\nLabel Lain: Semak saya');await page.locator('#applicationRead').click();assert.equal(await page.locator('#application_spouse_name').inputValue(),'');assert.equal(await page.locator('#application_applicant_phone').inputValue(),'');assert.equal(await page.locator('#applicationIssues').isVisible(),true);
  page.once('dialog',d=>d.accept());await page.locator('#applicationClear').click();assert.equal(await page.locator('#application_applicant_name').inputValue(),'');assert.equal(await page.locator('#applicationPaste').inputValue(),'');assert.deepEqual(errors,[]);
  console.log('PASS '+(mobile?'phone':'desktop')+': third tab, Word parse and edits, actual two-page PDF preview/download, scoped profile upload/link with identical bytes, Compiler import, stale/new-customer clearing and no overflow/errors');await ctx.close();
 }}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
