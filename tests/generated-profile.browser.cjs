const {chromium}=require('playwright'),{PDFDocument}=require('pdf-lib');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const doc=await PDFDocument.create();doc.addPage().drawText('GENERATED PROFILE TEST PAGE ONE');doc.addPage().drawText('PAGE TWO');const source=Buffer.from(await doc.save());
 const browser=await chromium.launch({headless:true,executablePath:process.env.FARIS_TEST_CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--disable-gpu-sandbox']});
 try{for(const role of ['staff','admin'])for(const mobile of [true,false]){
  const user={id:'10000000-0000-4000-8000-000000000001',display_name:'Test Staff',staff_code:'TEST01',role};
  const target={id:'20000000-0000-4000-8000-000000000001',customer_name:'Customer Ujian',phone_e164:'60100000888',model:'e.MAS 5',staff_name:'Test Staff'};
  const ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1400,height:1000},isMobile:mobile,hasTouch:mobile,acceptDownloads:true});await ctx.addInitScript(()=>localStorage.setItem('faris_lead_hub_session_v2','generated-fixture-session'));

  const page=await ctx.newPage(),errors=[];let uploads=[],links=[],failLink=true;page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());
   if(u.hostname==='generated.test'){
    if(u.pathname==='/api/health')return route.fulfill({contentType:'application/json',body:'{"configured":false}'});
    const f=u.pathname==='/'?'index.html':u.pathname.slice(1);
    if(!f.includes('..')&&(/^[a-z0-9-]+\.(js|css|html|webmanifest)$/.test(f)||f.startsWith('assets/'))&&fs.existsSync(f))return route.fulfill({contentType:f.endsWith('.html')?'text/html':f.endsWith('.css')?'text/css':f.endsWith('.png')?'image/png':'text/javascript',body:fs.readFileSync(f)});
   }
   if(u.hostname.endsWith('.supabase.co')){
    const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type','Access-Control-Allow-Methods':'POST'};if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});let result;
    if(u.searchParams.get('action')==='receive'){
     const form=await new Request(req.url(),{method:'POST',headers:{'content-type':req.headers()['content-type']},body:req.postDataBuffer()}).formData(),file=form.get('file');uploads.push({name:file.name,bytes:Buffer.from(await file.arrayBuffer())});result={ok:true,files:[{id:'30000000-0000-4000-8000-'+String(uploads.length).padStart(12,'0')}]};
    }else{
     const b=req.postDataJSON();
     if(b.action==='me')result={ok:true,user};
     else if(b.action==='list'&&u.pathname.endsWith('/lead-hub-customers'))result={ok:true,customers:[target],total:b.search?1:51,next_offset:b.search||b.offset?null:50};
     else if(b.action==='link_files'){
      links.push(b);if(failLink){failLink=false;return route.fulfill({status:503,headers,contentType:'application/json',body:'{"ok":false,"error":"Temporary test failure"}'})}result={ok:true};
     }else result={ok:true,leads:[],history:[],staff:[],team:{},personal:{}};
    }
    return route.fulfill({headers,contentType:'application/json',body:JSON.stringify(result)});
   }
   if(u.pathname.endsWith('/pdf.min.js'))return route.fulfill({contentType:'text/javascript',body:fs.readFileSync('/workspace/scratch/f9187d9ae437/browser-check/vendor/pdf.min.js')});
   if(u.pathname.endsWith('/pdf.worker.min.js'))return route.fulfill({contentType:'text/javascript',body:fs.readFileSync('/workspace/scratch/f9187d9ae437/browser-check/vendor/pdf.worker.min.js')});
   if(u.pathname.includes('/pdf-lib'))return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(path.dirname(require.resolve('pdf-lib')),'../dist/pdf-lib.min.js'))});
   return route.fulfill({contentType:'text/javascript',body:''});
  });
  await page.goto('https://generated.test/?tool=COMPILER&origin=staff');
  assert.equal(await page.locator('#compilerSaveProfile').isDisabled(),true);
  await page.evaluate(async bytes=>{await addFiles([new File([new Uint8Array(bytes)],'source.pdf',{type:'application/pdf'})],{analyze:false});document.getElementById('customerName').value='Customer Ujian'},[...source]);
  assert.equal(await page.evaluate(()=>safeFilename()),'Customer Ujian - Document.pdf');
  await page.locator('#outputName').fill('Nor_Farah - Document.pdf');
  assert.equal(await page.locator('#outputNamePreview').textContent(),'Nama fail: Nor Farah - Document.pdf');
  await page.locator('#generateBtn').click();await page.locator('#compilerSaveProfile:not([disabled])').waitFor();
  const [compiledDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#downloadBtn').click()]);
  assert.equal(compiledDownload.suggestedFilename(),'Nor Farah - Document.pdf');
  await page.locator('#compilerSaveProfile').click();await page.locator('[data-generated-target]').waitFor();assert.equal(await page.locator('#generatedProfileMore').isVisible(),true);await page.locator('#generatedProfileMore').click();await page.waitForFunction(()=>document.getElementById('generatedProfileMore').hidden);
  await page.locator('#generatedProfileSearch').fill('Customer');await page.locator('#generatedProfileSearchForm button').click();await page.locator('[data-generated-target]').waitFor();await page.locator('[data-generated-target]').click();await page.waitForFunction(()=>document.getElementById('generatedProfileStatus').textContent.includes('Temporary test failure'));
  assert.equal(uploads.length,1);await page.locator('[data-generated-target]').click();await page.locator('#generatedProfileOpen').waitFor();assert.equal(uploads.length,1,'retry reuses uploaded PDF');assert.equal(uploads[0].name,compiledDownload.suggestedFilename());assert.deepEqual(uploads[0].bytes,fs.readFileSync(await compiledDownload.path()));assert.equal(links[0].operation_id,links[1].operation_id);assert.equal(links[1].data.category,'OTHER');assert.equal(links[1].lead_id,target.id);assert.equal((await PDFDocument.load(uploads[0].bytes)).getPageCount(),2);assert.match(await page.locator('#generatedProfileOpen').getAttribute('href'),/customer=20000000/);
  await page.screenshot({path:'/tmp/faris-generated-profile-'+role+(mobile?'-phone':'-desktop')+'.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('#generatedProfileClose').click();await page.locator('#compilerSaveProfile').click();await page.locator('#generatedProfileOpen').waitFor();assert.equal(uploads.length,1,'saved result does not duplicate');await page.locator('#generatedProfileClose').click();
  await page.locator('#outputName').fill('Nama Baru');assert.equal(await page.locator('#compilerSaveProfile').isDisabled(),true,'edited output name invalidates old profile metadata');
  await page.locator('#customerName').fill('Nama lain');assert.equal(await page.locator('#compilerSaveProfile').isDisabled(),true,'edited inputs invalidate old generated PDF');
  await page.evaluate(()=>window.FARIS_GENERATED.publish('compiler',{blob:new Blob([new Uint8Array(21*1048576)],{type:'application/pdf'}),name:'large.pdf',party:'HIRER',category:'OTHER'}));await page.locator('#compilerSaveProfile').click();await page.waitForFunction(()=>document.getElementById('generatedProfileStatus').textContent.includes('melebihi had'));assert.equal(uploads.length,1);assert.equal(await page.locator('[data-generated-target]').count(),0);await page.locator('#generatedProfileClose').click();
  await page.locator('[data-main="VSO"]').click();await page.waitForFunction(()=>document.getElementById('vsoExactStatus').textContent.includes('automatik'));
  await page.locator('#vsoCustomer').fill('Customer VSO Test');await page.locator('#vsoPhone').fill('0100000888');await page.locator('#vsoLoan').fill('60000');await page.locator('#vsoColor').fill('Hijau');await page.locator('#vsoYear').fill('2026');
  for(const [loan,otr,net] of [['60000','75,800.00','72,092.00'],['68220','75,800.00','72,092.00'],['68220.01','75,800.01','72,092.01'],['72800','80,888.89','77,180.89'],['80000','88,888.89','85,180.89']]){
   await page.locator('#vsoLoan').fill(loan);assert.equal(await page.locator('#vsoOtr').innerText(),'RM '+otr);assert.equal(await page.locator('#vsoNet').innerText(),'RM '+net);assert.equal(await page.locator('#vsoAnchor').innerText(),'RM 75,800.00');assert.equal(await page.locator('#vsoLoanLimit').innerText(),'RM 68,220.00');
  }
  const [aboveAnchor]=await Promise.all([page.waitForEvent('download'),page.locator('#vsoDownload').click()]);assert.equal((await PDFDocument.load(fs.readFileSync(await aboveAnchor.path()))).getPageCount(),1,'loan above original anchor generates automatically');
  await page.locator('#vsoLoan').fill('72800');
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#vsoDownload').click()]);assert.equal(download.suggestedFilename(),'Customer VSO Test - VSO DRAF.pdf');
  const readPdf=async file=>page.evaluate(async raw=>{const doc=await pdfjsLib.getDocument({data:new Uint8Array(raw)}).promise;try{return (await (await doc.getPage(1)).getTextContent()).items.map(x=>x.str).join(' ')}finally{await doc.destroy()}},[...fs.readFileSync(file)]);
  const painted=await readPdf(await download.path());for(const text of ['RM 72,800.00','80,888.89','77,180.89'])assert.ok(painted.includes(text),'native Word PDF contains '+text);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);if(role==='staff')await page.locator('#vsoExactCanvas').screenshot({path:'/tmp/faris-vso-anchor-'+(mobile?'phone':'desktop')+'.png'});
  await page.locator('#vsoSaveProfile:not([disabled])').waitFor();await page.locator('#vsoSaveProfile').click();await page.locator('[data-generated-target]').waitFor();await page.locator('[data-generated-target]').click();await page.locator('#generatedProfileOpen').waitFor();assert.equal(uploads.length,2);assert.equal(links.at(-1).data.category,'VSO');assert.equal(links.at(-1).data.party,'HIRER');assert.equal((await PDFDocument.load(uploads[1].bytes)).getPageCount(),1);assert.deepEqual(fs.readFileSync(await download.path()),uploads[1].bytes,'saved VSO matches downloaded generation');
  await page.locator('#generatedProfileClose').click();await page.locator('#vsoColor').fill('Biru');assert.equal(await page.locator('#vsoSaveProfile').isDisabled(),true);assert.deepEqual(errors,[]);
  assert.equal(await page.locator('#vsoModel option').count(),7);
  await page.locator('.vsoFixedDetails summary').click();
  for(const [id,anchor,net,fees,insurance,model] of [['EMAS7_PHEV_PRIME_2026','113,611.00','109,430.00','4,181.00','3,811.00','e.Mas 7 PHEV Prime'],['EMAS7_PHEV_PREMIUM_2026','127,995.00','123,430.00','4,565.00','4,195.00','e.Mas 7 PHEV Premium']]){
   await page.locator('#vsoModel').selectOption(id);await page.locator('#vsoColor').fill('Silver');await page.locator('#vsoLoan').fill('80000');
   assert.equal(await page.locator('#vsoAnchor').innerText(),'RM '+anchor);assert.equal(await page.locator('#vsoOtr').innerText(),'RM '+anchor);assert.equal(await page.locator('#vsoNet').innerText(),'RM '+net);assert.equal(await page.locator('#vsoCharges').innerText(),'RM '+fees);assert.ok((await page.locator('#vsoFixedBreakdown').innerText()).includes('RM '+insurance));
   const [variantPdf]=await Promise.all([page.waitForEvent('download'),page.locator('#vsoDownload').click()]);assert.equal((await PDFDocument.load(fs.readFileSync(await variantPdf.path()))).getPageCount(),1);
   const drawn=await readPdf(await variantPdf.path());for(const value of [model,anchor,net,insurance])assert.ok(drawn.includes(value),'new variant native PDF contains '+value);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   if(role==='staff'&&!mobile)await page.locator('#vsoExactCanvas').screenshot({path:'/tmp/faris-'+id+'.png'});
  }
  assert.deepEqual(errors,[]);
  console.log('PASS '+role+'/'+(mobile?'phone':'desktop')+': real 2-page compilation and original VSO generation → profile picker/search/pagination → PDF upload/link; retry uses same bytes/file/operation; stale input protection and no duplicate save');await ctx.close();
 }}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
