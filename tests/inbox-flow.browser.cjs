const {chromium}=require('playwright');
const {PDFDocument}=require('pdf-lib');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const pdf=await PDFDocument.create();pdf.addPage().drawText('FARIS test document - no customer data');pdf.addPage().drawText('Page two');const pdfBytes=Buffer.from(await pdf.save());
 const browser=await chromium.launch({headless:true,executablePath:process.env.FARIS_TEST_CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--disable-gpu-sandbox']});
 try{
  for(const mobile of [true,false]){
   const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:900},isMobile:mobile,hasTouch:mobile});
   await context.addInitScript(()=>{localStorage.setItem('faris_lead_hub_session_v2','fixture');localStorage.setItem('faris_lead_hub_trusted_browser_v1','fixture')});
   const user={id:'22222222-2222-4222-8222-222222222222',display_name:'Sazwani',staff_code:'SAZ0001',role:'staff'};
   const rows=[],errors=[],requests=[];const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   page.on('console',message=>{if(message.type()==='warning'||message.type()==='error')console.log('Browser:',message.text())});
   await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.hostname==='fixture.test'){
     if(url.pathname==='/api/health')return route.fulfill({contentType:'application/json',body:'{"configured":false}'});
     const file=url.pathname==='/'?'index.html':url.pathname.slice(1);
     if(!file.includes('..')&&(/^[a-z0-9-]+\.(js|css|html|webmanifest)$/.test(file)||file.startsWith('assets/'))&&fs.existsSync(file))return route.fulfill({contentType:file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':file.endsWith('.webmanifest')?'application/manifest+json':'text/javascript',body:fs.readFileSync(file)});
    }
    if(url.hostname==='files.fixture.test')return route.fulfill({contentType:'application/pdf',body:pdfBytes,headers:{'Access-Control-Allow-Origin':'*'}});
    if(url.hostname.endsWith('.supabase.co')){
     const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type','Access-Control-Allow-Methods':'POST'};
     if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:cors});
     const inbox=url.pathname.endsWith('/lead-hub-inbox');
     let result;
     if(inbox&&url.searchParams.get('action')==='receive'){
      rows.push({id:'11111111-1111-4111-8111-111111111111',owner_id:user.id,uploaded_by:user.id,original_name:'bank_statement.pdf',mime_type:'application/pdf',byte_size:pdfBytes.length,source:'web_upload',state:'inbox',party:'HIRER',category:'AUTO',created_at:'2026-10-26T12:00:00Z'});result={ok:true,files:[{id:rows[0].id}]};requests.push('receive');
     }else{
      const d=route.request().postDataJSON();requests.push(d.action);
      if(d.action==='me')result={ok:true,user};
      else if(d.action==='list'&&inbox){const shown=rows.filter(x=>!d.state||d.state==='all'||x.state===d.state);result={ok:true,files:shown,total:shown.length,next_offset:null,staff:[]}}
      else if(d.action==='list')result={ok:true,leads:[],history:[],assignment_history:[],staff:[],available_count:0};
      else if(d.action==='assign'){for(const row of rows)if(d.ids.includes(row.id))Object.assign(row,{customer_name:d.customer_name,customer_phone:d.customer_phone,party:d.party,category:d.category,state:'assigned'});result={ok:true,ids:d.ids}}
      else if(d.action==='download')result={ok:true,file:rows.find(x=>x.id===d.id),url:'https://files.fixture.test/document.pdf'};
      else if(d.action==='key_status')result={ok:true,key:null};
      else result={ok:true,team:{},personal:{},connected:false};
     }
     return route.fulfill({contentType:'application/json',headers:cors,body:JSON.stringify(result)});
    }
    if(url.pathname.endsWith('/pdf.min.js'))return route.fulfill({contentType:'text/javascript',body:fs.readFileSync('/workspace/scratch/f9187d9ae437/browser-check/vendor/pdf.min.js')});
    if(url.pathname.endsWith('/pdf.worker.min.js'))return route.fulfill({contentType:'text/javascript',body:fs.readFileSync('/workspace/scratch/f9187d9ae437/browser-check/vendor/pdf.worker.min.js')});
    if(url.pathname.includes('/pdf-lib'))return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(path.dirname(require.resolve('pdf-lib')),'../dist/pdf-lib.min.js'))});
    return route.fulfill({status:200,contentType:'text/javascript',body:''});
   });
   await page.goto('https://fixture.test/staff.html#docs');
   await page.waitForFunction(()=>document.getElementById('inboxTotal').textContent.includes('0 fail'));
   assert.equal(await page.locator('#documentInbox').isVisible(),true);
   assert.equal(await page.locator('#telegramPanel').isVisible(),false);
   await page.locator('#inboxUpload').setInputFiles({name:'bank_statement.pdf',mimeType:'application/pdf',buffer:pdfBytes});
   await page.waitForFunction(()=>document.querySelectorAll('[data-inbox-id]').length===1);
   assert.match(await page.locator('#inboxList').innerText(),/bank_statement.pdf/);
   await page.reload();await page.waitForFunction(()=>document.querySelectorAll('[data-inbox-id]').length===1);
   await page.locator('[data-inbox-id]').check();await page.locator('#inboxCustomer').fill('FARIS TEST CUSTOMER');await page.locator('#inboxCategory').selectOption('BANK');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.screenshot({path:`/workspace/scratch/f9187d9ae437/inbox-${mobile?'mobile':'desktop'}.png`,fullPage:true});
   await page.locator('#inboxOpenCompiler').click();await page.waitForURL(/tool=COMPILER/);
   await page.waitForFunction(()=>document.getElementById('compilerInboxStatus')?.textContent.includes('sudah berada'),{timeout:20000});
   assert.equal(await page.locator('#customerName').inputValue(),'FARIS TEST CUSTOMER');
   assert.equal(await page.locator('#fileCount').innerText(),'1 fail');
   assert.match(await page.locator('#sections').innerText(),/bank_statement.pdf/);
   assert.equal(await page.locator('.select-mini').inputValue(),'BANK');
   await page.waitForFunction(()=>document.getElementById('totalPages').textContent==='2',null,{timeout:5000}).catch(async e=>{console.log(await page.locator('#log').innerText());throw e});
   assert.equal(rows[0].state,'assigned');assert.equal(rows.length,1,'Cloud original retained');
   assert.equal(await page.evaluate(()=>sessionStorage.getItem('faris_inbox_compiler_v1')),null);
   assert.deepEqual(errors,[]);
   console.log(`PASS ${mobile?'phone':'desktop'}: upload, inbox survives reload, assignment, authenticated download, real Compiler import and original retention`);
   await context.close();
  }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
