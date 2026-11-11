const uiAsset=require('./ui-assets.cjs');
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
const initial=()=>[...['emas7_phev','emas7_ev','emas5'].map((model,i)=>({id:'00000000-0000-4000-8000-00000000000'+i,model,variant:['premium','premium_plus','prime'][i],colour:['pink','blue','grey'][i],view:'front',title:['PHEV Warna','EV Harga','e.MAS 5 Promosi'][i],original_name:'bahan-'+i+'.png',mime_type:'image/png',byte_size:png.length,created_at:'2026-10-28T02:00:00Z',url:'https://images.test/'+i+'.png'})),...Array.from({length:30},(_,i)=>({id:'00000000-0000-4000-8000-'+String(i+100).padStart(12,'0'),model:'poster_posting',poster_type:i===29?'car':null,title:'Poster_Harian_'+(i+1),original_name:'poster-'+i+'.png',mime_type:'image/png',byte_size:png.length,created_at:'2026-11-09T02:00:00Z',url:'https://images.test/poster-'+i+'.png'}))];
const colors=['#21394b','#5c4c7e','#176e5e','#a17f42'];
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.FARIS_TEST_CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--disable-gpu-sandbox']});
 try{for(const role of ['staff','admin'])for(const mobile of [true,false]){
  const ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile,acceptDownloads:true});
  await ctx.addInitScript(()=>{
   localStorage.setItem('faris_lead_hub_session_v2','gallery-fixture-session');window.__shares=[];
   Object.defineProperty(navigator,'canShare',{value:()=>true,configurable:true});
   Object.defineProperty(navigator,'share',{value:async data=>{window.__shares.push({keys:Object.keys(data),active:navigator.userActivation.isActive,files:data.files.map(f=>({name:f.name,type:f.type,size:f.size}))});if(window.__shareCancel)throw new DOMException('Canceled','AbortError')},configurable:true});
  });
  let rows=initial(),calls=[],uploadCount=0,imageReads=0;const errors=[];const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());if(await uiAsset(route,url))return;
   if(url.hostname==='gallery.test'){
    const f=url.pathname.slice(1);if(/^(staff\.html|staff\.css|staff-gallery\.css|staff-gallery\.js|staff-navigation\.js|staff-passcode\.js|telegram-hub\.js|inbox-client\.js|staff-inbox\.js)$/.test(f))return route.fulfill({contentType:f.endsWith('html')?'text/html':f.endsWith('css')?'text/css':'text/javascript',body:fs.readFileSync(path.join(process.cwd(),f))});
   }
   if(url.hostname==='images.test'){
    const headers={'Access-Control-Allow-Origin':'*'};imageReads++;
    if(url.pathname==='/download.png')return route.fulfill({contentType:'image/png',headers,body:png});
    const hue=colors[(Number(url.pathname.match(/\d+/)?.[0])||0)%colors.length];
    return route.fulfill({contentType:'image/svg+xml',headers,body:`<svg xmlns="http://www.w3.org/2000/svg" width="540" height="960"><rect width="540" height="960" fill="${hue}"/><text x="45" y="100" fill="white" font-size="30" font-family="sans-serif">POSTER GALLERY</text><rect x="45" y="160" width="450" height="520" fill="#eee9dd"/><text x="80" y="420" fill="${hue}" font-size="48" font-family="sans-serif">PRATONTON</text><rect x="45" y="790" width="450" height="70" rx="10" fill="#16845f"/><text x="90" y="835" fill="white" font-size="25" font-family="sans-serif">FARIS PROTON</text></svg>`});
   }
   if(url.hostname.endsWith('.supabase.co')){
    const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type','Access-Control-Allow-Methods':'POST'};
    if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
    const gallery=url.pathname.endsWith('/lead-hub-gallery');const body=url.searchParams.has('action')?{}:req.postDataJSON();const action=url.searchParams.get('action')||body.action;calls.push({gallery,action,model:body.model});let result;
    if(gallery){
     if(action==='list'){
      const files=rows.filter(r=>(!body.model||r.model===body.model)&&(!body.search||r.title.toLowerCase().includes(body.search.toLowerCase()))&&['variant','colour','view'].every(key=>!body[key]||r[key]===body[key])&&(!body.poster_type||(r.poster_type||'general')===body.poster_type));const offset=body.offset||0;
      result={ok:true,files:files.slice(offset,offset+12),total:files.length,next_offset:offset+12<files.length?offset+12:null,counts:Object.fromEntries(['emas7_phev','emas7_ev','emas5','poster_posting'].map(m=>[m,rows.filter(r=>r.model===m).length]))};
     }
     if(action==='download')result={ok:true,file:rows.find(r=>r.id===body.id),url:'https://images.test/download.png'};
     if(action==='upload'&&req.postData().includes('filename="duplicate.png"'))result={ok:true,id:rows[0].id,duplicate:true};
     else if(action==='upload'){uploadCount++;const m=req.postData().match(/name="model"\r\n\r\n([^\r\n]+)/)?.[1];rows.unshift({...initial()[3],id:'10000000-0000-4000-8000-'+String(uploadCount).padStart(12,'0'),model:m,title:'Upload_Baru_'+uploadCount});result={ok:true,id:rows[0].id}}
     if(action==='edit'){const {action,id,...metadata}=body;Object.assign(rows.find(r=>r.id===id),metadata);result={ok:true}}
     if(action==='delete'){rows=rows.filter(r=>r.id!==body.id);result={ok:true}}
    }else result=action==='me'?{ok:true,user:{id:role,role,display_name:'Faris Test',staff_code:role==='admin'?'FARIS01':'SAZ0001'}}:action==='list'?{ok:true,leads:[],history:[],staff:[],available_count:0}:{ok:true,team:{},personal:{}};
    return route.fulfill({contentType:'application/json',headers,body:JSON.stringify(result)});
   }
   return route.fulfill({contentType:'text/javascript',body:''});
  });
  await page.goto('https://gallery.test/staff.html#gallery');await page.waitForFunction(()=>document.getElementById('galleryCountAll').textContent==='33');
  assert.equal(await page.locator('.gallery-album').count(),4);assert.equal(await page.locator('.gallery-card').count(),0);assert.equal(imageReads,0);assert.equal(await page.locator('#galleryBrowser').isVisible(),false);
  assert.equal(await page.locator('#galleryUploadToggle').isVisible(),role==='admin');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight)<1600,'album landing must not become a thirty-image wall');
  await page.screenshot({path:'/tmp/faris-gallery-albums-'+role+(mobile?'-phone':'-desktop')+'.png',fullPage:true});
  await page.locator('#gallerySearch').fill('Poster');await page.locator('#gallerySearchForm button').click();assert.equal(await page.locator('.gallery-album').count(),1);
  await page.locator('#gallerySearch').fill('');await page.locator('#gallerySearchForm button').click();assert.equal(await page.locator('.gallery-album').count(),4);
  await page.locator('[data-gallery-model="emas7_phev"]').click();
  await page.locator('.gallery-card').first().waitFor();
  assert.deepEqual(await page.locator('[data-gallery-filter="variant"]').allTextContents(),['Semua varian','PHEV Prime','PHEV Premium','PHEV Premium Plus']);
  await page.getByRole('button',{name:'PHEV Premium',exact:true}).click();
  await page.getByRole('button',{name:'Pink',exact:true}).click();
  await page.locator('#galleryView').selectOption('rear');
  await page.getByText('Tiada gambar sepadan dengan penapis.',{exact:true}).waitFor();
  await page.locator('#galleryView').selectOption('front');
  await page.getByText('PHEV Premium · Pink · Depan',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Pink',exact:true}).getAttribute('aria-pressed'),'true');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('#galleryBack').click();
  await page.locator('[data-gallery-model="poster_posting"]').click();await page.waitForFunction(()=>document.querySelectorAll('.gallery-card').length===12);
  await page.getByRole('button',{name:'Poster Kereta',exact:true}).click();
  await page.getByRole('heading',{name:'Poster Harian 30',exact:true}).waitFor();
  assert.equal(await page.locator('.gallery-card').count(),1);
  await page.getByRole('button',{name:'Poster Biasa',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.gallery-card').length===12);
  assert.equal(await page.locator('#galleryAlbumTitle').innerText(),'Poster Posting');assert.equal(await page.locator('#galleryAlbums').isVisible(),false);
  assert.equal(await page.locator('.gallery-card').first().locator('h4').innerText(),'Poster Harian 1');assert.equal(await page.locator('[data-gallery-edit]').count(),role==='admin'?12:0);
  for(const count of [24,29]){await page.locator('#galleryLoadMore').click();await page.waitForFunction(n=>document.querySelectorAll('.gallery-card').length===n,count)}
  assert.equal(await page.locator('#galleryLoadMore').isVisible(),false);
  const a=await page.locator('.gallery-card').nth(0).boundingBox(),b=await page.locator('.gallery-card').nth(1).boundingBox();assert.ok(b.x>a.x&&Math.abs(a.y-b.y)<2,'grid must use multiple columns');
  if(mobile){const third=await page.locator('.gallery-card').nth(2).boundingBox();assert.ok(third.y>a.y&&Math.abs(third.x-a.x)<2,'phone grid fits exactly two cards per row')}
  assert.equal(await page.locator('.gallery-image-button img').first().evaluate(e=>getComputedStyle(e).objectFit),'contain');
  await page.locator('#galleryLayout').selectOption('horizontal');
  assert.ok(await page.locator('#galleryColumns').evaluate(e=>e.scrollWidth>e.clientWidth));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('#galleryNext').click();await page.waitForFunction(()=>document.getElementById('galleryColumns').scrollLeft>20);
  await page.locator('#galleryLayout').selectOption('list');const c=await page.locator('.gallery-card').nth(0).boundingBox(),d=await page.locator('.gallery-card').nth(1).boundingBox();assert.ok(d.y>c.y&&Math.abs(c.x-d.x)<2);
  await page.locator('#galleryLayout').selectOption('focus');assert.ok((await page.locator('.gallery-card').first().boundingBox()).width<=681);
  await page.locator('#galleryLayout').selectOption('grid');
  await page.locator('[data-gallery-preview]').first().click();await page.locator('#galleryPreviewDownload:not([disabled])').waitFor();
  await page.locator('#galleryPreviewShare').click();assert.equal((await page.evaluate(()=>window.__shares)).at(-1).active,true);assert.deepEqual((await page.evaluate(()=>window.__shares)).at(-1).keys,['files']);
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#galleryPreviewDownload').click()]);assert.equal(download.suggestedFilename(),'poster-0.png');await page.locator('#galleryPreviewClose').click();
  const beforeShare=await page.evaluate(()=>window.__shares.length);await page.locator('[data-gallery-share]').first().click();await page.waitForFunction(n=>window.__shares.length>n,beforeShare);assert.equal(await page.locator('#galleryPreview').isVisible(),false,'cached file shares directly from the Status tap');
  await page.evaluate(()=>{window.__shareCancel=true});await page.locator('[data-gallery-share]').first().click();await page.locator('[data-gallery-share]').first().waitFor({state:'visible'});await page.evaluate(()=>{window.__shareCancel=false});
  await page.locator('#gallerySearch').fill('Harian_2');await page.locator('#gallerySearchForm button').click();await page.waitForFunction(()=>document.querySelectorAll('.gallery-card').length===11);
  await page.locator('#gallerySearch').fill('');await page.locator('#gallerySearchForm button').click();await page.waitForFunction(()=>document.querySelectorAll('.gallery-card').length===12);
  if(role==='admin'){
   await page.locator('#galleryUploadToggle').click();assert.equal(await page.locator('#galleryUploadModel').inputValue(),'poster_posting');
   await page.locator('#galleryUploadFiles').setInputFiles([{name:'upload-a.png',mimeType:'image/png',buffer:png},{name:'upload-b.png',mimeType:'image/png',buffer:png},{name:'duplicate.png',mimeType:'image/png',buffer:png}]);await page.locator('#galleryUploadSubmit').click();await page.waitForFunction(()=>document.getElementById('galleryCountAll').textContent==='35');assert.equal(uploadCount,2);assert.equal(rows[0].model,'poster_posting');assert.match(await page.locator('#galleryNotice').innerText(),/2 gambar baharu disimpan.*1 gambar pendua dilangkau/);
   const id='10000000-0000-4000-8000-000000000002';await page.locator('[data-gallery-edit="'+id+'"]').click();await page.locator('#galleryEditName').fill('Tajuk_Baharu');await page.locator('#galleryEditModel').selectOption('emas7_ev');
   assert.deepEqual(await page.locator('#galleryEditTags select[name="variant"] option').allTextContents(),['Belum ditag','Premium','Premium Plus']);
   await page.locator('#galleryEditTags select[name="variant"]').selectOption('premium_plus');
   await page.locator('#galleryEditTags select[name="colour"]').selectOption('pink');
   await page.locator('#galleryEditTags select[name="view"]').selectOption('front');
   await page.locator('#galleryEditSave').click();await page.waitForFunction(()=>!document.getElementById('galleryEdit').open);
   await page.locator('#galleryBack').click();await page.waitForFunction(()=>document.querySelectorAll('.gallery-card').length===0);await page.locator('[data-gallery-model="emas7_ev"]').click();await page.getByRole('heading',{name:'Tajuk Baharu'}).waitFor();await page.getByText('Premium Plus · Pink · Depan',{exact:true}).waitFor();page.once('dialog',d=>d.accept());await page.locator('[data-gallery-delete="'+id+'"]').click();await page.waitForFunction(()=>document.getElementById('galleryCountAll').textContent==='34');
   await page.locator('#galleryBack').click();await page.locator('[data-gallery-model="poster_posting"]').click();await page.waitForFunction(()=>document.querySelectorAll('.gallery-card').length===12);
   page.once('dialog',d=>d.accept());await page.locator('[data-gallery-delete="10000000-0000-4000-8000-000000000001"]').click();await page.waitForFunction(()=>document.getElementById('galleryCountAll').textContent==='33');
  }
  await page.evaluate(()=>Object.defineProperty(navigator,'canShare',{value:()=>false,configurable:true}));await page.locator('[data-gallery-share]').first().click();await page.locator('#galleryPreviewDownload:not([disabled])').waitFor();assert.equal(await page.locator('#galleryPreviewShare').isDisabled(),true);assert.equal(await page.locator('#galleryPreviewFallback').isVisible(),true);await page.locator('#galleryPreviewClose').click();
  await page.locator('#galleryLayout').selectOption('list');await page.reload();await page.waitForFunction(()=>document.getElementById('galleryCountAll').textContent==='33');assert.equal(await page.locator('.gallery-card').count(),0);await page.locator('[data-gallery-model="poster_posting"]').click();await page.waitForFunction(()=>document.querySelectorAll('.gallery-card').length===12);assert.equal(await page.locator('#galleryLayout').inputValue(),'list');
  await page.locator('#galleryLayout').selectOption('grid');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:'/tmp/faris-gallery-grid-'+role+(mobile?'-phone':'-desktop')+'.png',fullPage:false});
  await page.locator('#signoutBtn').click();await page.waitForFunction(()=>document.getElementById('galleryColumns').children.length===0);assert.equal(await page.locator('.gallery-album').count(),0);assert.equal(await page.locator('#galleryPreview').isVisible(),false);assert.deepEqual(errors,[]);
  assert.equal(calls.some(c=>c.gallery&&c.action==='download'),true);
  console.log('PASS '+role+'/'+(mobile?'phone':'desktop')+': title-only albums, thirty posters with pagination, four layouts, direct file-share gesture, cancel/fallback, '+(role==='admin'?'multi-upload/edit/move/delete, ':'')+'saved view and logout isolation');await ctx.close();
 }}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
