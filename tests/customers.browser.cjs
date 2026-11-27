const uiAsset=require('./ui-assets.cjs');
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
const leadId='00000000-0000-4000-8000-000000000001',manualId='00000000-0000-4000-8000-000000000002',fileId='10000000-0000-4000-8000-000000000001',unlinkedId='10000000-0000-4000-8000-000000000002',uploadId='10000000-0000-4000-8000-000000000003';
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.FARIS_TEST_CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--disable-gpu-sandbox']});
try{for(const role of ['staff','admin'])for(const mobile of [true,false]){
 const user={id:'00000000-0000-4000-8000-000000000009',role,display_name:'Faris Test',staff_code:role==='admin'?'FARIS01':'SAZ0001'};
 let revoked=false,tick=0,events=[],allFiles=[{id:fileId,customer_id:leadId,original_name:'IC-customer.png',mime_type:'image/png',byte_size:png.length,party:'HIRER',category:'IC',created_at:'2026-10-28T01:00:00Z'},{id:unlinkedId,customer_id:null,original_name:'Penyata-bank.png',mime_type:'image/png',byte_size:png.length,party:'HIRER',category:'BANK',created_at:'2026-10-28T01:00:00Z'}];
 const customer={lead:{id:leadId,customer_name:'Customer Ujian',phone_e164:'60100000111',model:'e.MAS 5',source:'Browser Test',stage:'claimed',notes:'Catatan WhatsApp asal',consent_confirmed:true,assigned_id:user.id,follow_up_at:null,created_at:'2026-10-28T01:00:00Z',updated_at:'2026-10-28T01:00:00Z'},profile:{lead_id:leadId,sales_status:'new',variant:'Premium',colour:'White',lou_received:false,trade_in:false,next_action:'',closure_reason:'',guarantor_required:false,booking_status:'none',booking_amount:null,selling_price:null,deposit:null,loan_amount:null,revision:0},staff:user,files:[],banks:[],checklist:[],notes:[]};
 const {validate}=await import('../supabase/functions/lead-hub-customers/validation.mjs');
 let manualCustomer,createCalls=0;
 const ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1400,height:1000},isMobile:mobile,hasTouch:mobile,acceptDownloads:true});await ctx.addInitScript(()=>localStorage.setItem('faris_lead_hub_session_v2','customer-fixture-session'));
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());if(await uiAsset(route,url))return;
  if(url.hostname==='customers.test'){
   const f=url.pathname.slice(1);if(/^(staff\.html|staff\.css|staff-gallery\.css|staff-gallery\.js|staff-customers\.css|staff-customers\.js|customer-insights-core\.js|customer-catalogue\.js|customer-workflow\.js|application-form-core\.js|staff-navigation\.js|staff-passcode\.js|telegram-hub\.js|inbox-client\.js|staff-inbox\.js)$/.test(f))return route.fulfill({contentType:f.endsWith('html')?'text/html':f.endsWith('css')?'text/css':'text/javascript',body:fs.readFileSync(path.join(process.cwd(),f))});
  }
  if(url.hostname==='files.test')return route.fulfill({contentType:'image/png',headers:{'Access-Control-Allow-Origin':'*'},body:png});
  if(url.hostname.endsWith('.supabase.co')){
   const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type','Access-Control-Allow-Methods':'POST'};if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
   const b=url.searchParams.has('action')?{action:url.searchParams.get('action')}:req.postDataJSON();let result;
   if(url.pathname.endsWith('/lead-hub-customers')){
    if(revoked&&b.action==='get')return route.fulfill({status:403,contentType:'application/json',headers,body:JSON.stringify({ok:false,error:'Profile access changed'})});
    customer.files=allFiles.filter(f=>f.customer_id===leadId);
    if(b.action==='list')result={ok:true,customers:[{...customer.lead,...customer.profile,id:leadId,staff_name:user.display_name,staff_code:user.staff_code,doc_count:customer.files.length}],total:1,next_offset:null,staff:[user],models:[{model:'e.MAS 5'}]};
    else if(b.action==='dashboard'){
     const row={...customer.lead,...customer.profile,id:leadId,staff_name:user.display_name,staff_code:user.staff_code,doc_count:customer.files.length},norm=s=>String(s||'').trim().toLowerCase(),outcome=['on_hold','cancelled'].includes(row.sales_status)?'inactive':row.sales_status==='delivered'?'delivered':row.lou_received?'lou':'pending';
     const base=(!b.model||row.model===b.model)&&(b.variant==null||norm(row.variant)===b.variant)&&(b.colour==null||norm(row.colour)===b.colour)&&(!b.status||row.sales_status===b.status),visible=base&&(!b.bucket||(b.bucket==='trade_in'?row.trade_in:outcome===b.bucket)),n=visible?1:0;
     result={ok:true,customers:visible?[row]:[],total:n,next_offset:null,options:{models:[{model:row.model}],variants:[{value:norm(row.variant),label:row.variant}],colours:[{value:norm(row.colour),label:row.colour}],staff:[user]},insights:{total:n,stats:{total:base?1:0,lou:base&&outcome==='lou'?1:0,delivered:base&&outcome==='delivered'?1:0,pending:base&&outcome==='pending'?1:0,trade_in:base&&row.trade_in?1:0,on_hold:0,cancelled:0},vehicles:visible?[{model:row.model,variant:norm(row.variant),label:row.model+' · '+row.variant,value:1}]:[],colours:visible?[{key:norm(row.colour),label:row.colour,value:1}]:[],statuses:visible?[{label:row.sales_status,value:1}]:[],trend:visible?[{bucket:'2026-10-28',total:1,lou:outcome==='lou'?1:0,delivered:outcome==='delivered'?1:0,pending:outcome==='pending'?1:0,trade_in:row.trade_in?1:0}]:[],generated_at:'2026-10-30T01:00:00Z'}};
    }
    else if(b.action==='insights')result={ok:true,insights:{total:1,confirm:0,pending:1,on_hold:0,cancelled:0,coloured:0,missing_colour:1,colours:[{label:'Belum diisi',value:1}],models:[{label:'e.MAS 5',value:1}],statuses:[{label:'new',value:1}],trend:[{bucket:'2026-10-28',total:1,confirm:0,pending:1}],generated_at:'2026-10-30T01:00:00Z'}};
    else if(b.action==='create_customer'){
     createCalls++;
     assert.equal(b.account_id,user.id);
     const respond=(status,data)=>route.fulfill({status,headers,contentType:'application/json',json:data});
     let values;
     try{values=validate(b.action,b.data)}catch(error){return respond(400,{ok:false,error:error.message})}
     if(values.phone_e164==='60120000999')return respond(409,{ok:false,error:'Nombor ini sudah berdaftar. Hubungi admin untuk semak agihan pelanggan.'});
     if(manualCustomer)return respond(200,{ok:true,created:false,lead_id:manualId});
     manualCustomer={...structuredClone(customer),lead:{...customer.lead,...values,id:manualId,stage:'new',consent_confirmed:false,notes:'',follow_up_at:null},
      profile:{...customer.profile,lead_id:manualId,sales_status:'new',variant:'',colour:'',lou_received:false,trade_in:false,next_action:'',revision:0},files:[],banks:[],notes:[]};
     return respond(201,{ok:true,created:true,lead_id:manualId});
    }
    else if(b.action==='get'||b.action==='shared_profile')result={ok:true,customer:b.lead_id===manualId?manualCustomer:customer,account_id:user.id};
    else if(b.action==='timeline')result={ok:true,events,next_offset:null};
    else if(b.action==='unlinked_files')result={ok:true,files:allFiles.filter(f=>!f.customer_id),total:allFiles.filter(f=>!f.customer_id).length,next_offset:null};
    else{
     const d=b.data,before=structuredClone(customer.profile);tick++;
     if(b.action==='save_profile'){Object.assign(customer.profile,d,{revision:customer.profile.revision+1});Object.assign(customer.lead,{customer_name:d.customer_name,model:d.model,follow_up_at:d.follow_up_at,updated_at:'2026-10-28T01:00:'+String(tick).padStart(2,'0')+'Z'})}
     if(b.action==='add_note')customer.notes.unshift({id:'note-'+tick,actor_name:user.display_name,actor_code:user.staff_code,created_at:'2026-10-28T01:10:00Z',details:{note:d.note}});
     if(b.action==='save_bank'){if(d.id)Object.assign(customer.banks.find(x=>x.id===d.id),d);else customer.banks.push({...d,id:'20000000-0000-4000-8000-000000000001'})}
     if(b.action==='delete_bank')customer.banks=customer.banks.filter(x=>x.id!==d.id);
     if(b.action==='checklist'){customer.checklist=customer.checklist.filter(x=>x.party!==d.party||x.category!==d.category);customer.checklist.push(d)}
     if(b.action==='link_files')allFiles.filter(f=>d.ids.includes(f.id)).forEach(f=>Object.assign(f,{customer_id:leadId,party:d.party,category:d.category}));
     if(b.action==='unlink_file')allFiles.find(f=>f.id===d.id).customer_id=null;
     events.unshift({key:'event-'+tick,event_type:({save_profile:'profile_updated',add_note:'note_added',save_bank:'bank_updated',checklist:'checklist_updated',link_files:'documents_linked',unlink_file:'document_unlinked'})[b.action],actor_name:user.display_name,actor_code:user.staff_code,created_at:'2026-10-28T01:15:00Z',details:b.action==='save_profile'?{before,after:structuredClone(customer.profile)}:d});result={ok:true};
    }
   }else if(url.pathname.endsWith('/lead-hub-inbox')){
    if(b.action==='receive'){
     const form=await new Request(req.url(),{method:'POST',headers:{'content-type':req.headers()['content-type']},body:req.postDataBuffer()}).formData();
     const file={id:uploadId,customer_id:form.get('customer_id'),original_name:'Slip-gaji.png',mime_type:'image/png',byte_size:png.length,party:form.get('party')||'HIRER',category:form.get('category')||'AUTO',created_at:'2026-10-28T01:00:00Z'};
     allFiles.push(file);result={ok:true,files:[file]};
    }
    else if(b.action==='download')result={ok:true,url:'https://files.test/test.png',file:allFiles.find(f=>f.id===b.id)};
    else if(b.action==='list')result={ok:true,files:allFiles.filter(f=>b.state==='all'||(b.state==='inbox'?!f.customer_id:!!f.customer_id)),total:allFiles.length,next_offset:null,staff:[]};
    else result={ok:true,user};
   }else result=b.action==='me'?{ok:true,user}:b.action==='list'?{ok:true,leads:[customer.lead],history:[],assignment_history:[],my_pm:[],activity_log:[],staff:[user],available_count:0}:{ok:true,team:{},personal:{}};
   return route.fulfill({contentType:'application/json',headers,body:JSON.stringify(result)});
  }
  return route.fulfill({contentType:'text/javascript',body:''});
 });
 await page.goto('https://customers.test/staff.html#customers');await page.locator('#customersList .customer-name-open[data-customer-open="'+leadId+'"]').waitFor();
 if(mobile){assert.equal(await page.locator('[data-customer-fold][open]').count(),0);assert.equal(await page.locator('.customer-row-staff').first().isVisible(),false);assert.equal(await page.locator('.customer-row-identity>small').first().isVisible(),false);await page.locator('[data-customer-fold="filters"]>summary').click();await page.locator('[data-customer-fold="analysis"]>summary').click();}
 assert.equal(await page.locator('#customersStaff').isVisible(),role==='admin');await page.locator('.insights-kpi').first().waitFor();assert.equal(await page.locator('.insights-kpi').count(),4);assert.match(await page.locator('#customerInsightsResult').innerText(),/Premium/);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.equal(await page.locator('#customersList .customer-row-staff').count(),0);
 assert.equal(await page.locator('#customersList .customer-row-updated time').isVisible(),true);
 assert.ok(await page.locator('#customersList .customer-row-updated time').evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=17));
 await page.locator('[data-insight-model]').click();await page.waitForFunction(()=>document.getElementById('customersVariant').value==='\"premium\"'&&document.querySelectorAll('#customersList .customer-name-open').length===1);
 await page.locator('[data-insight-colour]').click();await page.waitForFunction(()=>document.getElementById('customersColour').value==='\"white\"'&&document.querySelectorAll('#customersList .customer-name-open').length===1);
 await page.locator('[data-insight-status]').click();await page.waitForFunction(()=>document.getElementById('customersStatus').value==='new'&&document.querySelectorAll('#customersList .customer-name-open').length===1);
 await page.locator('[data-insight-bucket=\"lou\"]').click();await page.waitForFunction(()=>document.getElementById('customersTotal').textContent==='0 daripada 0 pelanggan sepadan');assert.equal(await page.locator('#customersList .customer-name-open').count(),0);
 await page.locator('#customersClearFilters').click();await page.locator('#customersList .customer-name-open').waitFor();
 await page.locator('#customersList .customer-name-open').click();await page.locator('#cpName').waitFor();assert.equal(await page.locator('#cpName').inputValue(),'Customer Ujian');assert.match(await page.locator('#customerLegacyNotes').innerText(),/Catatan WhatsApp asal/);
 await page.locator('#cpStatus').selectOption('documents');await page.locator('#cpNext').fill('Minta penyata bank');await page.locator('#cpFollow').fill('2026-11-01');await page.locator('#cpVariant').selectOption('Premium');await page.locator('#cpGuarantor').check();await page.locator('#cpLou').check();await page.locator('#cpTradeIn').check();await page.locator('#customerProfileForm [data-profile-save]').click();await page.waitForFunction(()=>document.getElementById('customerStatusBadge').textContent==='Mengumpul dokumen');assert.match(await page.locator('#customerNextAction').innerText(),/Minta penyata bank/);
 await page.locator('#customerNote').fill('Customer mahu warna hijau <script>');await page.locator('#customerNoteSave').click();await page.getByText('Customer mahu warna hijau <script>',{exact:true}).waitFor();assert.equal(await page.locator('#customerNotes script').count(),0);
 assert.equal(await page.locator('#cpModel option').count(),9);
 assert.equal(await page.locator('#cpColour').inputValue(),'White');
 await page.locator('#cpModel').selectOption('Proton S70');
 assert.equal(await page.locator('#cpVariant option').count(),6);
 assert.equal(await page.locator('#cpVariant').inputValue(),'');
 assert.equal(await page.locator('#cpColour option').count(),6);
 await page.locator('#cpModel').selectOption('e.MAS 5');
 await page.locator('#cpVariant').selectOption('Premium');
 await page.locator('#customerProfileForm [data-profile-save]').click();
 await page.locator('[data-customer-tab="banks"]').click();
 await page.locator('#customerAddBank').click();
 assert.equal(await page.locator('#cbName option').count(),20);
 assert.equal(await page.locator('#cbName').inputValue(),'');
 await page.locator('#cbName').selectOption('CIMB Islamic Bank Berhad');
 await page.locator('#cbStatus').selectOption('review');
 await page.locator('#customerBankForm button[type="submit"]').click();
 await page.locator('#customerBankList').getByText('CIMB Islamic Bank Berhad',{exact:true}).waitFor();
 assert.equal(await page.locator('[data-customer-tab]').count(),4);assert.equal(await page.locator('[data-customer-panel="summary"] #customerNoteForm').count(),1);
 await page.locator('[data-customer-tab="documents"]').click();assert.equal(await page.locator('.customer-checklist-group').count(),0);await page.locator('#customerStatusBadge').click();await page.locator('#customerCaseStatus').selectOption('on_hold');assert.equal(await page.locator('#customerCaseReason').getAttribute('required'),'');await page.locator('#customerCaseCancel').click();assert.equal(await page.locator('#customerStatusBadge').innerText(),'Mengumpul dokumen');await page.locator('#customerStatusBadge').click();await page.locator('#customerCaseStatus').selectOption('bank_submitted');await page.locator('#customerCaseSave').click();await page.waitForFunction(()=>!document.getElementById('customerCaseDialog').open);assert.equal(await page.locator('#customerStatusBadge').innerText(),'Permohonan bank');
 await page.locator('#customerPickInbox').click();await page.locator('[data-customer-inbox="'+unlinkedId+'"]').check();await page.locator('#customerInboxLink').click();await page.waitForFunction(()=>!document.getElementById('customerInboxDialog').open);assert.equal(await page.locator('.customer-file').count(),2);
 await page.locator('[data-customer-preview="'+fileId+'"]').click();await page.locator('#customerPreviewDownload:not([disabled])').waitFor();const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#customerPreviewDownload').click()]);assert.equal(download.suggestedFilename(),'IC-customer.png');await page.locator('#customerPreviewClose').click();
 await page.locator('#customerUpload').setInputFiles({name:'Slip-gaji.png',mimeType:'image/png',buffer:png});await page.locator('[data-customer-preview="'+uploadId+'"]').waitFor();assert.equal(await page.locator('.customer-file').count(),3);
 page.once('dialog',d=>d.accept());await page.locator('[data-customer-unlink="'+uploadId+'"]').click();await page.locator('[data-customer-preview="'+uploadId+'"]').waitFor({state:'detached'});
 await page.locator('[data-customer-tab="history"]').click();await page.locator('.customer-history-item').first().waitFor();assert.match(await page.locator('#customerHistory').innerText(),/Profil dikemas kini/);assert.match(await page.locator('#customerHistory').innerText(),/Permohonan bank/);assert.match(await page.locator('#customerHistory').innerText(),/Nota ditambah/);assert.match(await page.locator('#customerHistory').innerText(),/Faris Test/);
 await page.locator('[data-customer-tab="summary"]').click();if(mobile)await page.locator('[data-theme-choice="light"]').click();await page.screenshot({path:'/tmp/faris-customers-'+role+(mobile?'-phone':'-desktop')+'.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 // Approval and delivery remain visible even when LOU has already been received.
 for(const [status,label] of [['approved','Loan Lulus – Tunggu Delivery'],['delivered','Dah Delivery']]){
  await page.locator('#customerStatusBadge').click();await page.locator('#customerCaseStatus').selectOption(status);await page.locator('#customerCaseSave').click();
  await page.waitForFunction(()=>!document.getElementById('customerCaseDialog').open);
  assert.equal(await page.locator('#customerStatusBadge').innerText(),label);
  assert.equal(await page.locator('#customerLastUpdated time').isVisible(),true);
  await page.locator('#customerBack').click();await page.locator('#customersList .customer-name-open').waitFor();
  assert.match(await page.locator('#customersList .customer-status').innerText(),new RegExp(label));
  assert.equal(await page.locator('#customersList .customer-row-staff').count(),0);
  assert.equal(await page.locator('#customersList .customer-row-updated time').isVisible(),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:'/tmp/faris-delivery-'+status+'-'+role+(mobile?'-phone':'-desktop')+'.png',fullPage:true});
  await page.locator('#customersList .customer-name-open').click();await page.locator('#cpName').waitFor();
 }
 // Start a link from the existing Inbox rather than creating a duplicate upload.
 const nav=page.locator(mobile?'#mobileDock':'#workspaceNav');await nav.locator('[data-'+(mobile?'mobile':'workspace')+'-nav="docs"]').click();await page.locator('[data-inbox-id="'+uploadId+'"]').check();await page.locator('#inboxLinkProfile').click();await page.locator('[data-customer-link-target]').waitFor();await page.locator('[data-customer-link-target]').click();await page.locator('[data-customer-preview="'+uploadId+'"]').waitFor();assert.equal(await page.locator('.customer-file').count(),3);
 await page.locator('[data-customer-file="'+fileId+'"]').check();await page.locator('[data-customer-file="'+unlinkedId+'"]').check();await page.locator('#customerOpenCompiler').click();await page.waitForURL(url=>url.searchParams.get('origin')==='staff'&&url.searchParams.get('tool')==='COMPILER'&&url.searchParams.get('customer')===leadId&&url.searchParams.get('inbox')==='1');const handoff=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('faris_inbox_compiler_v1')));assert.deepEqual(handoff.ids,[fileId,unlinkedId]);assert.equal(handoff.account_id,user.id);
 await page.goto('https://customers.test/staff.html?customer='+leadId+'&customer_tab=documents#customers');await page.locator('#customerFiles .customer-file').first().waitFor();assert.equal(await page.locator('[data-customer-panel="documents"]').isVisible(),true);await page.locator('[data-customer-tab="summary"]').click();await page.locator('#cpName').waitFor();assert.equal(new URL(page.url()).searchParams.has('customer'),false);revoked=true;await page.locator('#customersRefresh').click();await page.waitForFunction(()=>document.getElementById('customerDetail').classList.contains('hide')&&document.getElementById('cpName').value==='');revoked=false;await page.locator('#customersRefresh').click();await page.locator('#customersList .customer-name-open').click();await page.locator('#cpName').waitFor();

 const form=page.locator('#customerCreateForm'),save=page.locator('#customerCreateSave');
 await page.locator('#customerCreateOpen').click();
 await save.click();
 assert.equal(createCalls,0,'empty form does not send a request');
 await form.locator('[name="customer_name"]').fill('Pelanggan Walk-in Ujian');
 await form.locator('[name="phone"]').fill('0300000123');
 await form.locator('[name="source"]').selectOption('Walk-in');
 await save.click();
 await page.getByText('Masukkan nombor telefon bimbit Malaysia yang sah.',{exact:true}).waitFor();
 await form.locator('[name="phone"]').fill('012-000 0999');
 await save.click();
 await page.getByText('Nombor ini sudah berdaftar. Hubungi admin untuk semak agihan pelanggan.',{exact:true}).waitFor();
 assert.equal(await form.locator('[name="customer_name"]').inputValue(),'Pelanggan Walk-in Ujian');
 await form.locator('[name="phone"]').fill('+60 (12) 000-0123');
 if(!mobile)await page.locator('#customerCreateModel').selectOption('Proton Saga');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await save.click();
 await page.getByText('Pelanggan baharu berjaya ditambah.',{exact:true}).waitFor();
 assert.equal(await page.locator('#cpName').inputValue(),'Pelanggan Walk-in Ujian');
 assert.equal(await page.locator('#cpPhone').inputValue(),'60120000123');
 assert.equal(await page.locator('#cpModel').inputValue(),mobile?'':'Proton Saga');
 assert.match(await page.locator('#customerSourceInfo').innerText(),/Walk-in/);
 assert.equal(await page.locator('#customerWhatsapp').getAttribute('href'),null);
 await page.locator('#customerCreateOpen').click();
 await form.locator('[name="customer_name"]').fill('Nama daripada cubaan pendua');
 await form.locator('[name="phone"]').fill('0120000123');
 await form.locator('[name="source"]').selectOption('Rujukan');
 await save.click();
 await page.getByText('Nombor ini sudah berdaftar. Profil sedia ada dibuka.',{exact:true}).waitFor();
 assert.equal(await page.locator('#cpName').inputValue(),'Pelanggan Walk-in Ujian');

 await page.locator('#signoutBtn').click();await page.waitForFunction(()=>document.getElementById('customerFiles').children.length===0);assert.equal(await page.locator('#cpName').inputValue(),'');assert.equal(await page.locator('#customerPreview').isVisible(),false);assert.deepEqual(errors,[]);
 console.log('PASS '+role+'/'+(mobile?'phone':'desktop')+': manual customer creation, phone validation and duplicate handling');
 console.log('PASS '+role+'/'+(mobile?'phone light':'desktop dark')+': profile/status/follow-up, notes in summary, general references, upload/link/unlink/preview/download, Inbox handoff, Compiler IDs, timeline, access-revocation cleanup, logout cleanup and no overflow/errors');await ctx.close();
}}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
