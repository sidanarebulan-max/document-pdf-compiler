const uiAsset=require('./ui-assets.cjs');
const {chromium}=require('playwright'),{PDFDocument}=require('pdf-lib');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {fixture}=require('./application-form.test.cjs');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.FARIS_TEST_CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--disable-gpu-sandbox']});
 try{for(const mobile of [true,false]){
  const user={id:'10000000-0000-4000-8000-000000000001',display_name:'Test Staff',staff_code:'TEST01',role:'staff'},target={id:'20000000-0000-4000-8000-000000000001',customer_name:'Pelanggan',phone_e164:'60100000001',model:''};
  const additionalPhone='60160000042';
  const customer={lead:target,additional_phones:[additionalPhone],profile:{shared_fields:{},variant:'',colour:'',selling_price:null,loan_amount:null,deposit:null}};
  const ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile,acceptDownloads:true});await ctx.addInitScript(()=>localStorage.setItem('faris_lead_hub_session_v2','application-fixture'));
  const page=await ctx.newPage(),errors=[],uploads=[],links=[],network=[];page.on('pageerror',e=>errors.push(e.message));
  let profileDelay;
  const lookups=[];
  await page.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());if(await uiAsset(route,u))return;network.push(u.hostname+u.pathname);
   if(u.hostname==='application.test'){
    if(u.pathname==='/api/health')return route.fulfill({contentType:'application/json',body:'{"configured":false}'});
    const f=u.pathname==='/'?'index.html':u.pathname.slice(1);
    if(!f.includes('..')&&(/^[a-z0-9-]+\.(js|css|html|webmanifest)$/.test(f)||f.startsWith('assets/'))&&fs.existsSync(f))return route.fulfill({contentType:f.endsWith('.html')?'text/html':f.endsWith('.css')?'text/css':f.endsWith('.png')?'image/png':f.endsWith('.ttf')?'font/ttf':'text/javascript',body:fs.readFileSync(f)});
   }
   if(u.hostname.endsWith('.supabase.co')){
    const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type','Access-Control-Allow-Methods':'POST'};if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});let result;
    if(u.searchParams.get('action')==='receive'){
     const form=await new Request(req.url(),{method:'POST',headers:{'content-type':req.headers()['content-type']},body:req.postDataBuffer()}).formData(),file=form.get('file');
     uploads.push({name:file.name,bytes:Buffer.from(await file.arrayBuffer()),customer:form.get('customer_id')});
     result={ok:true,files:[{id:'30000000-0000-4000-8000-'+String(uploads.length).padStart(12,'0'),customer_id:form.get('customer_id')}]};
    }else{
     const b=req.postDataJSON();if(b.action==='me')result={ok:true,user};
     else if(b.action==='list'&&u.pathname.endsWith('/lead-hub-customers'))result={ok:true,customers:[target],total:1,next_offset:null};
     else if(b.action==='shared_profile'){
      if(!b.changes){lookups.push(b.lead_id||b.phone);if(profileDelay)await profileDelay;}
      if(b.lead_id!==target.id&&b.phone!==target.phone_e164&&b.phone!==additionalPhone){
       assert.equal(b.changes,undefined,'an unlinked form must never write customer data');
       return route.fulfill({status:403,headers,json:{ok:false,error:'Profil atau fail ini bukan di bawah akses anda. Refresh senarai.'}});
      }
      for(const [key,value] of Object.entries(b.changes||{})){
       if(['customer_name','model'].includes(key))target[key]=value;
       else if(Object.hasOwn(customer.profile,key))customer.profile[key]=value;
       else customer.profile.shared_fields[key]=value;
      }
      result={ok:true,customer,account_id:user.id};
     }
     else if(b.action==='link_files'){links.push(b);result={ok:true}}
     else result={ok:true,leads:[],history:[],staff:[],team:{},personal:{}};
    }return route.fulfill({headers,contentType:'application/json',body:JSON.stringify(result)});
   }
   if(/\/pdf(?:\.worker)?\.min\.js$/.test(u.pathname))return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(require.resolve('pdfjs-dist/build/'+path.basename(u.pathname)))});
   if(u.pathname.includes('/pdf-lib'))return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(path.dirname(require.resolve('pdf-lib')),'../dist/pdf-lib.min.js'))});
   return route.fulfill({contentType:'text/javascript',body:''});
  });
  await page.goto('https://application.test/?tool=APPLICATION&origin=staff');
  await page.locator('#applicationWorkspace:visible').waitFor();assert.equal(await page.locator('[data-main]').count(),3);assert.equal(await page.locator('[data-main="APPLICATION"]').getAttribute('aria-selected'),'true');
  assert.equal(await page.locator('#vsoWorkspace').isVisible(),false);assert.equal(await page.locator('.app').isVisible(),false);
  await page.locator('#applicationGenerate').click();await page.getByText('Isi nama pemohon dahulu.',{exact:true}).waitFor();
  const standalone='Nama: Pemohon Ujian Tanpa Profil\nNo. IC: 000101010042\nNombor telefon: 0190000042\nAlamat Tetap: 18 Jalan Ujian\nEmail: ujian@example.test\nMAKLUMAT PEMBIAYAAN\nModel kereta: e.MAS 7 PHEV Prime\nWarna kereta: Putih\nTempoh pinjaman: 8 tahun';
  await page.locator('#applicationPaste').fill(standalone);
  const deniedLookup=page.waitForResponse(r=>r.status()===403&&r.request().postDataJSON().phone==='60190000042');
  await page.locator('#applicationRead').click();
  await deniedLookup;
  await page.waitForFunction(()=>!window.FARIS_WORKSPACE_PROFILE.loading);
  await page.locator('#applicationGenerate').click();
  await page.locator('#applicationStatus').waitFor({state:'visible'});
  await page.waitForFunction(()=>!document.querySelector('#applicationGenerate').disabled);
  assert.equal(await page.locator('#applicationDownload').isEnabled(),true,await page.locator('#applicationStatus').textContent());
  assert.equal(await page.locator('#applicationPreview canvas').count(),2);
  assert.match(await page.locator('#applicationStatus').innerText(),/Pautkan profil pelanggan/);
  const [standaloneDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#applicationDownload').click()]);
  assert.equal(standaloneDownload.suggestedFilename(),'Pemohon Ujian Tanpa Profil - Application Form.pdf');
  assert.equal((await PDFDocument.load(fs.readFileSync(await standaloneDownload.path()))).getPageCount(),2);
  await page.locator('#applicationToCompiler').click();
  await page.locator('[data-main="COMPILER"][aria-selected="true"]').waitFor();
  assert.equal(await page.locator('#fileCount').innerText(),'1 fail');
  await page.locator('#compileScope').selectOption('REBATE_ONLY');
  await page.locator('[data-main="APPLICATION"]').click();
  await page.locator('#applicationPreviewToVso').click();
  await page.locator('[data-main="VSO"][aria-selected="true"]').waitFor();
  for(const [id,value] of Object.entries({vsoCustomer:'Pemohon Ujian Tanpa Profil',vsoNric:'000101010042',vsoPhone:'0190000042',
   vsoAddress:'18 Jalan Ujian',vsoEmail:'ujian@example.test',vsoModel:'EMAS7_PHEV_PRIME_2026',vsoColor:'Putih',vsoPeriod:'8',vsoLoan:''}))
   assert.equal(await page.locator('#'+id).inputValue(),value,id);
  await page.locator('#vsoLoan').fill('73000');
  await page.locator('#vsoCustomer').fill('Orang Lain');
  await page.locator('#vsoToCompiler').click();
  await page.waitForFunction(()=>document.querySelector('#vsoExactStatus').textContent.includes('Maklumat pemohon pada VSO dan Application Form berbeza'));
  await page.locator('#vsoCustomer').fill('Pemohon Ujian Tanpa Profil');
  await page.locator('#vsoToCompilerBottom').click();
  await page.locator('[data-main="COMPILER"][aria-selected="true"]').waitFor();
  assert.equal(await page.locator('#compilerFlowStatus').innerText(),'Application Form dan VSO tersedia di bahagian Peminjam.');
  assert.equal(await page.locator('#fileCount').innerText(),'2 fail');
  assert.equal(await page.locator('#compileScope').inputValue(),'ALL');
  assert.match(await page.locator('#sections').innerText(),/Pemohon Ujian Tanpa Profil - VSO DRAF.pdf/);
  assert.match(await page.locator('#sections').innerText(),/Pemohon Ujian Tanpa Profil - Application Form.pdf/);
  assert.equal(await page.locator('#customerName').inputValue(),'Pemohon Ujian Tanpa Profil');
  assert.equal(await page.locator('#customerPhone').inputValue(),'0190000042');
  await page.locator('#compilerFlowBar a').click();
  await page.locator('#generateBtn').click();
  await page.locator('#generateBtn:not([disabled])').waitFor();
  const [merged]=await Promise.all([page.waitForEvent('download'),page.locator('#downloadBtn').click()]);
  assert.equal((await PDFDocument.load(fs.readFileSync(await merged.path()))).getPageCount(),3);
  await page.locator('#compilerBackToVso').click();
  await page.locator('#vsoToCompiler').click();
  await page.locator('[data-main="COMPILER"][aria-selected="true"]').waitFor();
  assert.equal(await page.locator('#fileCount').innerText(),'2 fail');
  assert.equal(await page.locator('#downloadBtn').isEnabled(),true);
  await page.locator('#compilerBackToVso').click();
  await page.locator('#vsoLoan').fill('72500');
  await page.locator('#vsoToCompiler').click();
  await page.locator('[data-main="COMPILER"][aria-selected="true"]').waitFor();
  assert.equal(await page.locator('#fileCount').innerText(),'2 fail');
  assert.equal(await page.locator('#downloadBtn').isDisabled(),true);
  assert.equal(uploads.length,0,'unlinked PDFs are never uploaded automatically');
  await page.goto('https://application.test/?tool=APPLICATION&origin=staff');
  await page.locator('#applicationWorkspace:visible').waitFor();
  const pasted=fixture.replace('MAKLUMAT PEMOHON','*MAKLUMAT DIRI*').replace('Nama : Nor Farah\nI/C No : 000101010001','*Nama penuh:* Nor Farah | No. I/C: 000101–01–0001').replace('No HP : 0100000001','Nombor WhatsApp = +60 (10) 000-0001');
  await page.locator('#applicationPaste').fill(pasted.replace('+60 (10) 000-0001','+60 (16) 000-0042'));assert.equal(await page.locator('#applicationGenerate').isDisabled(),true);await page.locator('#applicationRead').click();
  await page.locator('#application_applicant_phone[readonly]').waitFor();
  assert.equal(lookups.at(-1),additionalPhone);
  assert.equal(await page.locator('#application_applicant_name').inputValue(),'Nor Farah');assert.equal(await page.locator('#application_spouse_name').inputValue(),'Pasangan Contoh');assert.equal(await page.locator('#application_reference_name').inputValue(),'Rujukan Contoh');assert.equal(await page.locator('#application_applicant_phone').inputValue(),'0100000001');
  assert.equal(await page.locator('#application_applicant_nric').inputValue(),'000101010001');
  await page.locator('#applicationPaste').fill('Nama: Nor Farah\nNo. telefon: 0160000042');
  await page.locator('#applicationRead').click();
  assert.match(await page.locator('#applicationReadStatus').innerText(),/medan dibaca/);
  assert.equal(await page.locator('#application_applicant_phone').inputValue(),'0100000001');
  assert.equal(uploads.length,0,'PDF only uploads after generation');
  await page.locator('#applicationPaste').fill('Nama: Pelanggan Lain\nNo. IC: 000101010002\nNombor telefon: +60190000001');
  await page.locator('#applicationRead').click();
  assert.match(await page.locator('#applicationReadStatus').innerText(),/berbeza daripada profil/);
  assert.equal(await page.locator('#application_applicant_name').inputValue(),'Nor Farah');
  assert.equal(await page.locator('#application_applicant_nric').inputValue(),'000101010001');
  await page.locator('#applicationPaste').fill('Nama: Pelanggan Lain\nNo. IC: 000101010002');
  await page.locator('#applicationRead').click();
  assert.match(await page.locator('#applicationReadStatus').innerText(),/Nombor IC berbeza/);
  assert.equal(await page.locator('#application_applicant_name').inputValue(),'Nor Farah');
  await page.locator('#applicationPaste').fill('Nama pasangan: Pasangan Contoh\nNo. IC: 000101010002\nNo. HP: 0100000002');
  await page.locator('#applicationRead').click();
  assert.equal(await page.locator('#application_applicant_nric').inputValue(),'000101010001');
  assert.equal(await page.locator('#application_applicant_phone').inputValue(),'0100000001');
  assert.equal(await page.locator('#application_spouse_nric').inputValue(),'000101010002');
  await page.locator('#applicationPaste').fill(pasted);await page.locator('#applicationRead').click();
  await page.locator('#applicationOutputName').fill('Nor_Farah - Application Form');
  await page.locator('#applicationGenerate').click();
  await page.locator('#applicationDownload:not([disabled])').waitFor().catch(async error=>{throw new Error(await page.locator('#applicationStatus').textContent(),{cause:error})});
  assert.equal(await page.locator('#applicationPreview canvas').count(),2);assert.equal(await page.locator('#applicationSaveProfile').isDisabled(),false);
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#applicationDownload').click()]);assert.equal(download.suggestedFilename(),'Nor Farah - Application Form.pdf');const bytes=fs.readFileSync(await download.path());assert.equal((await PDFDocument.load(bytes)).getPageCount(),2);
  await page.locator('#applicationPreview').scrollIntoViewIfNeeded();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'/tmp/faris-application-'+(mobile?'phone':'desktop')+'.png',fullPage:true});
  await page.locator('#applicationSaveProfile').click();
  assert.equal(uploads[0].name,download.suggestedFilename());assert.deepEqual(uploads[0].bytes,bytes);assert.equal(uploads[0].customer,target.id);assert.equal(links.length,0);
  assert.equal(target.customer_name,'Nor Farah');assert.equal(customer.profile.shared_fields.applicant_nric,'000101010001');
  await page.locator('#applicationToCompiler').click();await page.waitForFunction(()=>document.querySelector('.app').style.display!=='none');assert.equal(await page.locator('#fileCount').innerText(),'1 fail');
  assert.match(await page.locator('#sections').innerText(),/Nor Farah - Application Form.pdf/);assert.equal(await page.locator('#customerName').inputValue(),'Nor Farah');assert.equal(await page.locator('.select-mini').inputValue(),'OTHER');
  await page.locator('[data-main="APPLICATION"]').click();
  await page.locator('#applicationPreviewToVso').click();assert.equal(await page.locator('#vsoWorkspace').isVisible(),true);
  assert.equal(await page.locator('#vsoCustomer').inputValue(),'Nor Farah');assert.equal(await page.locator('#vsoPhone').inputValue(),'0100000001');assert.equal(await page.locator('#vsoNric').inputValue(),'000101010001');
  assert.equal(await page.locator('#vsoAddress').inputValue(),'No 12 Jalan Ujian Bandar Contoh 40000 Selangor');
  await page.locator('#vsoYear').fill('2026');await page.locator('#vsoLoan').fill('60000');
  const [vsoDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#vsoDownload').click()]);
  assert.equal((await PDFDocument.load(fs.readFileSync(await vsoDownload.path()))).getPageCount(),1);
  await page.locator('#vsoSaveProfile').click();
  assert.equal(uploads[1].customer,target.id);assert.equal(uploads[1].name,vsoDownload.suggestedFilename());
  await page.locator('#vsoToCompiler').click();
  await page.locator('[data-main="COMPILER"][aria-selected="true"]').waitFor();
  assert.equal(await page.locator('#fileCount').innerText(),'2 fail');
  assert.equal(uploads.length,2,'both transferred PDFs reuse the linked uploads');
  await page.locator('[data-main="APPLICATION"]').click();assert.equal(await page.locator('#application_applicant_name').inputValue(),'Nor Farah');
  await page.locator('#application_applicant_name').fill('Nama Baru');assert.equal(await page.locator('#applicationDownload').isDisabled(),true);assert.equal(await page.locator('#applicationSaveProfile').isDisabled(),true);
  await page.locator('#applicationPaste').fill('MAKLUMAT PEMOHON\nNama: Customer Baharu\nLabel Lain: Semak saya');await page.locator('#applicationRead').click();assert.equal(await page.locator('#application_spouse_name').inputValue(),'Pasangan Contoh');assert.equal(await page.locator('#application_applicant_phone').inputValue(),'0100000001');assert.equal(await page.locator('#applicationIssues').isVisible(),true);
  page.once('dialog',d=>d.accept());await page.locator('#applicationClear').click();assert.equal(await page.locator('#application_applicant_name').inputValue(),'Customer Baharu');assert.equal(await page.locator('#applicationPaste').inputValue(),'');assert.deepEqual(errors,[]);
  await page.evaluate(()=>window.FARIS_WORKSPACE_PROFILE.flush());
  let releaseProfile;
  profileDelay=new Promise(resolve=>{releaseProfile=resolve});
  const lookupCount=lookups.length;
  try{
   await page.goto('https://application.test/?tool=APPLICATION&origin=staff&customer='+target.id,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>window.FARIS_WORKSPACE_PROFILE?.loading);
   await page.locator('#applicationPaste').fill('Nama: Pelanggan Lain\nNombor telefon: 0190000001');
   await page.locator('#applicationRead').click();
   assert.match(await page.locator('#applicationReadStatus').innerText(),/Tunggu profil pelanggan/);
   assert.equal(await page.locator('#application_applicant_name').inputValue(),'');
  }finally{releaseProfile();profileDelay=null;}
  await page.locator('#application_applicant_phone[readonly]').waitFor();
  assert.deepEqual(lookups.slice(lookupCount),[target.id]);
  await page.locator('#applicationRead').click();
  assert.match(await page.locator('#applicationReadStatus').innerText(),/berbeza daripada profil/);
  assert.equal(await page.locator('#application_applicant_name').inputValue(),'Customer Baharu');
  await page.locator('#applicationPaste').fill('Nama: Customer Baharu\nNo. Telefon: 0100000001');
  await page.locator('#applicationRead').click();
  await page.locator('#applicationToVso').click();
  await page.locator('[data-main="VSO"][aria-selected="true"]').waitFor();
  assert.equal(await page.locator('#vsoCustomer').inputValue(),'Customer Baharu');
  const beforeUpdate=uploads.length;
  await page.locator('#vsoColor').fill('Biru Ujian');
  await page.locator('#vsoToCompiler').click();
  await page.locator('[data-main="COMPILER"][aria-selected="true"]').waitFor();
  assert.equal(await page.locator('#fileCount').innerText(),'2 fail');
  assert.equal(customer.profile.colour,'Biru Ujian');
  const regenerated=uploads.slice(beforeUpdate).filter(file=>file.name.endsWith('Application Form.pdf')).at(-1);
  assert.ok(regenerated,'a linked VSO change regenerates the carried Application Form');
  const latestText=await page.evaluate(async bytes=>{
   const pdf=await pdfjsLib.getDocument({data:new Uint8Array(bytes)}).promise;
   try{return (await (await pdf.getPage(2)).getTextContent()).items.map(item=>item.str).join(' ');}
   finally{await pdf.destroy();}
  },[...regenerated.bytes]);
  assert.ok(latestText.includes('Biru Ujian'));
  assert.deepEqual(errors,[]);
  console.log('PASS staff/'+(mobile?'phone':'desktop')+': linked and unlinked Application Form → VSO → Compiler, actual merged PDF, correct applicant, updated PDF replacement and no duplicate files or uploads');await ctx.close();
 }}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
