const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),{PDFDocument}=require('pdf-lib');
const {fields}=require('../application-form-core');
const home='https://roundtrip.test';
const leadId='20000000-0000-4000-8000-000000000011',otherId='20000000-0000-4000-8000-000000000022';
const staff={id:'10000000-0000-4000-8000-000000000001',display_name:'Faris QA',staff_code:'QA01',role:'staff'};
const leadUrl=id=>home+'/staff?customer='+id+'#customers';
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png','.svg':'image/svg+xml'};
const commonKeys=new Set(['variant','colour','selling_price','loan_amount','deposit']);
function dummy(id,name,phone){
 return {lead:{id,customer_name:name,phone_e164:phone,model:'e.MAS 5',source:'QA',stage:'claimed',notes:'',consent_confirmed:true,assigned_id:staff.id,created_at:'2026-11-27T00:00:00Z',updated_at:'2026-11-27T00:00:00Z'},
  profile:{lead_id:id,sales_status:'new',variant:'Premium',colour:'Quartz Rose',closure_reason:'',lou_received:false,trade_in:false,booking_status:'none',
   selling_price:72092,loan_amount:60000,deposit:15800,revision:0,shared_fields:{otr_price:75800,vehicle_year:'2026',loan_term:'9'}},
  staff,files:[],banks:[],notes:[],checklist:[],tracking:{updated_at:'2026-11-27T00:00:00Z'}};
}
async function mock(context){
 const records=new Map([[leadId,dummy(leadId,'Pelanggan','60100000001')],[otherId,dummy(otherId,'Pelanggan Kedua','60100000002')]]);
 const events=[],uploads=[];let seq=0;
 const c=records.get(leadId);
 function activity(customer,event_type,details){
  const at=new Date(Date.UTC(2026,10,27,0,0,++seq)).toISOString();
  customer.tracking.updated_at=at;
  events.unshift({key:'audit:'+seq,lead_id:customer.lead.id,event_type,details,created_at:at,actor_name:staff.display_name,actor_code:staff.staff_code});
 }
 await context.addInitScript(()=>{
  if(location.hostname==='roundtrip.test')localStorage.setItem('faris_lead_hub_session_v2','profile-roundtrip-fixture');
 });
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());
  if(u.hostname==='roundtrip.test'){
   if(u.pathname==='/api/health')return route.fulfill({json:{configured:false}});
   const file=u.pathname==='/'?'index.html':u.pathname==='/staff'?'staff.html':u.pathname.slice(1);
   if(!file.includes('..')&&fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({contentType:mime[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
  }
  if(/\/pdf(?:\.worker)?\.min\.js$/.test(u.pathname))return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(require.resolve('pdfjs-dist/build/'+path.basename(u.pathname)))});
  if(u.pathname.includes('/pdf-lib'))return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(path.dirname(require.resolve('pdf-lib')),'../dist/pdf-lib.min.js'))});
  if(u.hostname==='files.test'){
   const file=uploads.find(x=>x.id===u.pathname.slice(1));
   return route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},contentType:'application/pdf',body:file.bytes});
  }
  if(!u.hostname.endsWith('.supabase.co'))return route.fulfill({contentType:'text/javascript',body:''});
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type','Access-Control-Allow-Methods':'POST'};
  const reply=(data,status=200)=>route.fulfill({headers,status,json:data});
  if(req.method()==='OPTIONS')return route.fulfill({headers,status:204});
  if(u.searchParams.get('action')==='receive'){
   const form=await new Request(req.url(),{method:'POST',headers:{'content-type':req.headers()['content-type']},body:req.postDataBuffer()}).formData();
   const customer=records.get(form.get('customer_id'));
   assert.ok(customer,'every upload must specify an accessible customer');
   assert.equal(form.get('account_id'),staff.id);
   const file=form.get('file'),bytes=Buffer.from(await file.arrayBuffer());
   const meta={id:'30000000-0000-4000-8000-'+String(uploads.length+1).padStart(12,'0'),customer_id:customer.lead.id,customer_name:customer.lead.customer_name,
    customer_phone:customer.lead.phone_e164,original_name:file.name,mime_type:file.type,byte_size:bytes.length,party:form.get('party'),category:form.get('category'),
    created_at:'2026-11-27T00:00:00Z',state:'assigned'};
   uploads.push({...meta,bytes});customer.files.push(meta);
   activity(customer,'documents_linked',{files:[{id:meta.id,name:meta.original_name}],party:meta.party,category:meta.category});
   return reply({ok:true,files:[meta]});
  }
  const body=req.postDataJSON(),action=body.action;
  const customer=records.get(body.lead_id)||[...records.values()].find(row=>row.lead.phone_e164===body.phone);
  if(action==='me')return reply({ok:true,user:staff});
  if(action==='get'||action==='shared_profile'){
   if(!customer)return reply({ok:false,error:'Tiada profil'},403);
   for(const [key,value] of Object.entries(body.changes||{})){
    if(['customer_name','model'].includes(key))customer.lead[key]=value;
    else if(commonKeys.has(key))customer.profile[key]=value;
    else customer.profile.shared_fields[key]=value;
   }
   if(body.changes){
    customer.profile.revision++;
    activity(customer,'shared_fields_updated',{fields:Object.keys(body.changes)});
   }
   return reply({ok:true,customer,account_id:staff.id});
  }
  if(action==='timeline')return reply({ok:true,events:events.filter(e=>e.lead_id===body.lead_id),next_offset:null});
  if(action==='save_bank'){
   const bank={...body.data,id:'40000000-0000-4000-8000-000000000011',updated_at:'2026-11-27T00:00:00Z'};
   customer.banks.push(bank);activity(customer,'bank_updated',{after:bank});return reply({ok:true});
  }
  if(action==='download'){
   const file=uploads.find(x=>x.id===body.id);const {bytes,...meta}=file;
   return reply({ok:true,file:meta,url:'https://files.test/'+file.id});
  }
  if(action==='dashboard'){
   const rows=[...records.values()].map(x=>({...x.lead,...x.profile}));
   return reply({ok:true,customers:rows,next_offset:null,total:rows.length,insights:{stats:{total:rows.length}},options:{}});
  }
  return reply({ok:true,leads:[c.lead],history:[],my_pm:[],staff:[],files:c.files,team:{},personal:{},available_count:0,next_offset:null});
 });
 return {records,uploads};
}
const input=(page,id)=>page.locator('#'+id).inputValue();
const assertField=async(page,id,value)=>assert.equal(await input(page,id),value,id);
const flush=page=>page.evaluate(()=>window.FARIS_WORKSPACE_PROFILE.flush());
async function shared(page,id,value){
 await page.locator('#'+id).fill(value);
 await page.locator('#'+id).dispatchEvent('change');
}
async function run(browser,mobile){
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1370,height:900},isMobile:mobile,hasTouch:mobile});
 const scenario=await mock(context),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(leadUrl(leadId));
  await page.locator('#cpName').waitFor();
  await page.locator('#customerSharedPersonal summary').click();
  await shared(page,'shared_applicant_email','mula@example.test');
  await shared(page,'shared_guarantor_name','Penjamin Dummy');
  await shared(page,'shared_rebate_name','Rebat Dummy');
  await shared(page,'shared_tradein_name','Trade In Dummy');
  await page.locator('[data-customer-tool="APPLICATION"]').click();
  await page.locator('#application_applicant_phone[readonly]').waitFor();
  await assertField(page,'application_applicant_email','mula@example.test');
  await assertField(page,'application_financing_model','e.MAS 5 Premium');
  await assertField(page,'application_financing_color','Quartz Rose');

  const values=Object.fromEntries(fields.map(f=>[f.id,'Nilai '+f.id.replaceAll('_',' ')]));
  Object.assign(values,{applicant_name:'Pemohon Dummy',applicant_phone:'0100000001',applicant_nric:'000101010001',
   applicant_email:'borang@example.test',applicant_permanent_address:'12 Jalan Ujian',employment_phone:'0300000000',
   spouse_name:'Pasangan Dummy',spouse_nric:'000101010012',spouse_phone:'0100000012',
   reference_name:'Rujukan Dummy',reference_phone:'0100000013',financing_model:'e.MAS 5 Premium',financing_color:'Quartz Rose',financing_term:'8 tahun'});
  await page.locator('#applicationPaste').fill([...new Set(fields.map(f=>f.section))].map(section=>{
   const title={applicant:'MAKLUMAT PEMOHON',employment:'MAKLUMAT PEKERJAAN',spouse:'MAKLUMAT PASANGAN',reference:'RUJUKAN',financing:'MAKLUMAT PEMBIAYAAN'}[section];
   return title+'\n'+fields.filter(f=>f.section===section).map(f=>f.label+values[f.id]).join('\n');
  }).join('\n'));
  await page.locator('#applicationRead').click();
  await flush(page);
  for(const [id,value] of Object.entries(values))await assertField(page,'application_'+id,value);
  assert.match(await page.locator('#applicationReadStatus').innerText(),new RegExp(fields.length+' daripada '+fields.length));

  const observer=await context.newPage();
  observer.on('pageerror',e=>errors.push(e.message));
  await observer.goto(leadUrl(leadId));
  await observer.locator('#cpName').waitFor();
  await observer.locator('[data-customer-tab="history"]').click();
  await observer.getByText('Maklumat pelanggan diselaraskan',{exact:true}).first().waitFor();
  await page.bringToFront();

  await page.locator('#applicationGenerate').click();
  await page.locator('#applicationDownload:not([disabled])').waitFor();
  await page.locator('#applicationToCompiler').click();
  await page.locator('[data-main="COMPILER"][aria-selected="true"]').waitFor();
  await assertField(page,'customerName','Pemohon Dummy');
  await assertField(page,'customerPhone','0100000001');
  for(const [party,name] of [['GUARANTOR','Penjamin Dummy'],['REBATE','Rebat Dummy'],['TRADEIN','Trade In Dummy']]){
   await page.locator('[data-party="'+party+'"]').click();
   await assertField(page,'partyName',name);
  }
  await shared(page,'partyName','Pemilik Trade In Dummy');
  await flush(page);

  await page.locator('[data-main="VSO"]').click();
  for(const [id,value] of Object.entries({vsoCustomer:'Pemohon Dummy',vsoPhone:'0100000001',vsoNric:'000101010001',
   vsoEmail:'borang@example.test',vsoAddress:'12 Jalan Ujian',vsoModel:'EMAS5_PREMIUM_2026',vsoColor:'Quartz Rose',vsoPeriod:'8',vsoLoan:'60000'}))
   await assertField(page,id,value);
  await shared(page,'vsoInsurance','3300');
  await shared(page,'vsoLoan','61000');
  assert.equal(await page.locator('#vsoNet').innerText(),'RM 71,792.00');
  assert.equal(await page.locator('#vsoCharges').innerText(),'RM 4,008.00');
  await shared(page,'vsoEmail','vso@example.test');
  await shared(page,'vsoAddress','34 Jalan Ujian');
  await shared(page,'vsoColor','Lithium White');
  await page.locator('#vsoPeriod').selectOption('7');
  await flush(page);
  await page.locator('#vsoToCompiler').click();
  await page.locator('[data-main="COMPILER"][aria-selected="true"]').waitFor();
  assert.match(await page.locator('#sections').innerText(),/VSO DRAF/);
  const vsoText=await page.evaluate(async url=>{
   const pdf=await pdfjsLib.getDocument(url).promise;
   try{return (await (await pdf.getPage(1)).getTextContent()).items.map(part=>part.str).join(' ');}
   finally{await pdf.destroy();}
  },'https://files.test/'+scenario.uploads[1].id);
  for(const amount of ['71,792.00','3,300.00','61,000.00'])assert.ok(vsoText.includes(amount),amount+' in the saved VSO PDF');
  await observer.waitForFunction(()=>document.querySelector('#customerHistory').textContent.includes('VSO DRAF.pdf'));
  await observer.close();
  await page.locator('[data-main="APPLICATION"]').click();
  await assertField(page,'application_applicant_email','vso@example.test');
  await assertField(page,'application_applicant_permanent_address','34 Jalan Ujian');
  await assertField(page,'application_financing_color','Lithium White');
  await assertField(page,'application_financing_term','7 tahun');

  await page.locator('#staffWorkflowFiles').click();
  await page.locator('[data-customer-panel="documents"]:visible').waitFor();
  assert.match(await page.locator('#customerFiles').innerText(),/Application Form\.pdf/);
  assert.match(await page.locator('#customerFiles').innerText(),/VSO DRAF\.pdf/);
  assert.equal(scenario.uploads.length,2,'passing PDFs to Compiler must reuse uploaded records');
  for(const [record,pages,category] of [[scenario.uploads[0],2,'OTHER'],[scenario.uploads[1],1,'VSO']]){
   assert.equal((await PDFDocument.load(record.bytes)).getPageCount(),pages);
   assert.equal(record.category,category);
   assert.equal(record.customer_id,leadId);
  }
  const [first]=scenario.uploads;
  await page.locator('[data-customer-file="'+first.id+'"]').check();
  await page.locator('#customerOpenCompiler').click();
  await page.waitForFunction(()=>document.querySelector('#compilerInboxStatus')?.textContent.includes('sudah berada'));
  assert.match(await page.locator('#sections').innerText(),/Application Form\.pdf/);
  assert.equal(scenario.uploads.length,2,'bringing back a stored file must reuse its original');
  await page.locator('#generateBtn').click();
  await page.waitForFunction(()=>document.querySelector('#staffWorkflowStatus')?.textContent.includes('Disimpan dalam Dokumen Pelanggan'));
  assert.equal(scenario.uploads.length,3);
  const source=await PDFDocument.create();source.addPage().drawText('Dokumen dummy');
  const bytes=Buffer.from(await source.save());
  for(const party of ['HIRER','GUARANTOR','REBATE','TRADEIN']){
   await page.locator('[data-party="'+party+'"]').click();
   const name=party+'-dummy.pdf';
   await page.locator('#fileInput').setInputFiles({name,mimeType:'application/pdf',buffer:bytes});
   await page.waitForFunction(filename=>document.querySelector('#staffWorkflowStatus')?.textContent.includes('Disimpan dalam Dokumen Pelanggan · '+filename),name);
   assert.equal(scenario.uploads.at(-1).party,party);
   assert.equal(scenario.uploads.at(-1).customer_id,leadId);
  }

  await page.locator('#staffWorkflowBack').click();
  await page.locator('#cpName').waitFor();
  await assertField(page,'cpName','Pemohon Dummy');
  await page.locator('#customerSharedPersonal summary').click();
  await page.locator('#customerSharedTrading summary').click();
  const expected={...values,applicant_email:'vso@example.test',applicant_permanent_address:'34 Jalan Ujian'};
  for(const [id,value] of Object.entries(expected)){
   if(!['applicant_name','applicant_phone','financing_model','financing_color','financing_term'].includes(id))
    await assertField(page,'shared_'+id,value);
  }
  await assertField(page,'shared_tradein_name','Pemilik Trade In Dummy');
  await assertField(page,'shared_loan_amount','61000');
  await assertField(page,'shared_insurance_amount','3300');
  await assertField(page,'shared_loan_term','7');
  await assertField(page,'cpColour','Lithium White');
  assert.equal(await page.locator('#customerDocCount').innerText(),'7');
  await page.locator('[data-customer-tab="banks"]').click();
  await page.locator('#customerAddBank').click();
  await assertField(page,'cbAmount','61000');await assertField(page,'cbTerm','84');
  await page.locator('#cbName').selectOption('CIMB Bank Berhad');
  await page.locator('#cbStatus').selectOption('review');
  await page.locator('#customerBankForm button[type="submit"]').click();
  await page.getByRole('heading',{name:'CIMB Bank Berhad',exact:true}).waitFor();
  await page.locator('[data-customer-tab="history"]').click();
  await page.getByText('Maklumat pelanggan diselaraskan',{exact:true}).first().waitFor();
  assert.match(await page.locator('#customerHistory').innerText(),/Dokumen dipautkan/);
  assert.match(await page.locator('#customerHistory').innerText(),/Permohonan bank dikemas kini/);

  await page.goto(leadUrl(otherId));
  await page.locator('#cpName').waitFor();
  await assertField(page,'cpName','Pelanggan Kedua');
  assert.equal(scenario.records.get(otherId).files.length,0);
  assert.equal(scenario.records.get(otherId).profile.shared_fields.applicant_nric,undefined);
  await page.goto(home+'/?origin=staff&tool=COMPILER');
  await page.locator('[data-main="APPLICATION"]').click();
  await page.locator('#applicationPaste').fill('Nama: Pelanggan Kedua\nNo IC: 000101010022\nNo telefon: 0100000002');
  await page.locator('#applicationRead').click();
  await page.locator('#application_applicant_phone[readonly]').waitFor();
  await flush(page);
  await assertField(page,'application_applicant_nric','000101010022');
  assert.deepEqual(errors,[]);
  console.log('PASS '+(mobile?'phone':'desktop')+': '+fields.length+' Application fields, profile round trip, VSO, Compiler, bank, audit, seven stored PDFs and isolation');
 }finally{await context.close()}
}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.FARIS_TEST_CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{for(const mobile of [false,true])await run(browser,mobile)}finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
