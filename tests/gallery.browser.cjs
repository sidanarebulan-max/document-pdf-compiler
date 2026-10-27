const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
const initial=()=>['emas7_phev','emas7_ev','emas5'].map((model,i)=>({id:'00000000-0000-4000-8000-00000000000'+i,model,title:['PHEV Warna','EV Harga','e.MAS 5 Promosi'][i],original_name:'bahan-'+i+'.png',mime_type:'image/png',byte_size:png.length,created_at:'2026-10-28T02:00:00Z',url:'https://images.test/'+i+'.png'}));
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.FARIS_TEST_CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--disable-gpu-sandbox']});
 try{for(const role of ['staff','admin'])for(const mobile of [true,false]){
  const ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1400,height:1000},isMobile:mobile,hasTouch:mobile,acceptDownloads:true});
  await ctx.addInitScript(()=>{localStorage.setItem('faris_lead_hub_session_v2','gallery-fixture-session');Object.defineProperty(navigator,'canShare',{value:()=>true,configurable:true});Object.defineProperty(navigator,'share',{value:async data=>{window.__shared=data.files.map(f=>({name:f.name,type:f.type,size:f.size}))}})});
  let rows=initial(),calls=[],uploadCount=0;const errors=[];const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.hostname==='gallery.test'){
    const f=url.pathname.slice(1);if(/^(staff\.html|staff\.css|staff-gallery\.css|staff-gallery\.js|staff-navigation\.js|staff-passcode\.js|telegram-hub\.js|inbox-client\.js|staff-inbox\.js)$/.test(f))return route.fulfill({contentType:f.endsWith('html')?'text/html':f.endsWith('css')?'text/css':'text/javascript',body:fs.readFileSync(path.join(process.cwd(),f))});
   }
   if(url.hostname==='images.test')return route.fulfill({contentType:'image/png',headers:{'Access-Control-Allow-Origin':'*'},body:png});
   if(url.hostname.endsWith('.supabase.co')){
    const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type','Access-Control-Allow-Methods':'POST'};
    if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
    const gallery=url.pathname.endsWith('/lead-hub-gallery');
    const body=url.searchParams.has('action')?{}:req.postDataJSON();const action=url.searchParams.get('action')||body.action;calls.push({gallery,action});let result;
    if(gallery){
     if(action==='list'){const files=rows.filter(r=>(!body.model||r.model===body.model)&&(!body.search||r.title.includes(body.search)));result={ok:true,files,total:files.length,next_offset:null,counts:Object.fromEntries(['emas7_phev','emas7_ev','emas5'].map(m=>[m,rows.filter(r=>r.model===m).length]))}}
     if(action==='download')result={ok:true,file:rows.find(r=>r.id===body.id),url:'https://images.test/download.png'};
     if(action==='upload'){uploadCount++;rows.unshift({...initial()[0],id:'10000000-0000-4000-8000-000000000001',model:'emas5',title:'Upload Baru'});result={ok:true,id:rows[0].id}}
     if(action==='edit'){Object.assign(rows.find(r=>r.id===body.id),{model:body.model,title:body.title});result={ok:true}}
     if(action==='delete'){rows=rows.filter(r=>r.id!==body.id);result={ok:true}}
    }else{result=action==='me'?{ok:true,user:{id:role,role,display_name:'Faris Test',staff_code:role==='admin'?'FARIS01':'SAZ0001'}}:action==='list'?{ok:true,leads:[],history:[],staff:[],available_count:0}:{ok:true,team:{},personal:{}}}
    return route.fulfill({contentType:'application/json',headers,body:JSON.stringify(result)});
   }
   return route.fulfill({contentType:'text/javascript',body:''});
  });
  await page.goto('https://gallery.test/staff.html#gallery');
  await page.waitForFunction(()=>document.getElementById('galleryCountAll').textContent==='3');
  const nav=page.locator(mobile?'#mobileDock':'#workspaceNav');
  assert.deepEqual(await nav.locator('button').evaluateAll(nodes=>nodes.map(n=>n.dataset.mobileNav||n.dataset.workspaceNav)),['home','gallery','whatsapp','docs','telegram','settings']);
  assert.equal(await page.locator('.gallery-category').count(),3);assert.equal(await page.locator('.gallery-card').count(),3);
  assert.equal(await page.locator('#galleryUploadToggle').isVisible(),role==='admin');assert.equal(await page.locator('[data-gallery-edit]').count(),role==='admin'?3:0);
  await page.locator('[data-gallery-model="emas7_ev"]').click();await page.waitForFunction(()=>document.querySelectorAll('.gallery-card').length===1);assert.match(await page.locator('#galleryColumns').innerText(),/EV Harga/);
  await page.locator('[data-gallery-share]').click();await page.locator('#galleryPreviewShare:not([disabled])').waitFor();assert.equal(await page.locator('#galleryPreview').isVisible(),true);await page.locator('#galleryPreviewShare').click();assert.equal((await page.evaluate(()=>window.__shared))[0].type,'image/png');
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#galleryPreviewDownload').click()]);assert.equal(download.suggestedFilename(),'bahan-1.png');await page.locator('#galleryPreviewClose').click();
  await page.locator('[data-gallery-model=""]').click();await page.waitForFunction(()=>document.querySelectorAll('.gallery-card').length===3);
  await page.locator('#gallerySearch').fill('PHEV');await page.locator('#gallerySearchForm button').click();await page.waitForFunction(()=>document.querySelectorAll('.gallery-card').length===1);
  await page.locator('#gallerySearch').fill('');await page.locator('#gallerySearchForm button').click();await page.waitForFunction(()=>document.querySelectorAll('.gallery-card').length===3);
  if(role==='admin'){
   await page.locator('#galleryUploadToggle').click();await page.locator('#galleryUploadModel').selectOption('emas5');await page.locator('#galleryUploadTitleInput').fill('Upload Baru');await page.locator('#galleryUploadFiles').setInputFiles({name:'upload-baru.png',mimeType:'image/png',buffer:png});await page.locator('#galleryUploadSubmit').click();await page.waitForFunction(()=>document.getElementById('galleryCountAll').textContent==='4');assert.equal(uploadCount,1);
   await page.locator('[data-gallery-edit="10000000-0000-4000-8000-000000000001"]').click();await page.locator('#galleryEditName').fill('Tajuk Baharu');await page.locator('#galleryEditModel').selectOption('emas7_ev');await page.locator('#galleryEditSave').click();await page.waitForFunction(()=>!document.getElementById('galleryEdit').open);await page.getByRole('heading',{name:'Tajuk Baharu'}).waitFor();
   page.once('dialog',d=>d.accept());await page.locator('[data-gallery-delete="10000000-0000-4000-8000-000000000001"]').click();await page.waitForFunction(()=>document.getElementById('galleryCountAll').textContent==='3');
  }
  if(role==='staff'&&!mobile){await page.evaluate(()=>Object.defineProperty(navigator,'canShare',{value:()=>false}));await page.locator('[data-gallery-preview]').first().click();await page.locator('#galleryPreviewDownload:not([disabled])').waitFor();assert.equal(await page.locator('#galleryPreviewShare').isDisabled(),true);assert.match(await page.locator('#galleryPreviewStatus').innerText(),/Download gambar dahulu/);await page.locator('#galleryPreviewClose').click()}
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  if(mobile)await page.locator('[data-theme-choice="light"]').click();
  await page.screenshot({path:'/tmp/faris-gallery-'+role+(mobile?'-phone':'-desktop')+'.png',fullPage:true});
  await page.locator('#signoutBtn').click();await page.waitForFunction(()=>document.getElementById('galleryColumns').children.length===0);assert.equal(await page.locator('#galleryPreview').isVisible(),false);assert.deepEqual(errors,[]);
  assert.equal(calls.some(c=>c.gallery&&c.action==='download'),true);
  console.log('PASS '+role+'/'+(mobile?'phone light':'desktop dark')+': gallery ordering, categories, preview/share/download, '+(role==='admin'?'upload/edit/delete, ':'')+'logout cleanup and no overflow/errors');await ctx.close();
 }}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
