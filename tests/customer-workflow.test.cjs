const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm');
const source=fs.readFileSync('customer-workflow.js','utf8');
const id='10000000-0000-4000-8000-000000000001';
function fixture(){
 const start={lead:{id,customer_name:'Customer Test',phone_e164:'60123456789',model:''},
  profile:{variant:'',colour:'',loan_amount:null,deposit:null,selling_price:null,shared_fields:{}},files:[]};
 const calls=[], replies=[], uploads=[],rendered=[];
 const runtime={window:{addEventListener(){},FARIS_INBOX_CLIENT:{upload:async(file,meta)=>{uploads.push(meta);return {files:[{customer_id:id}]}}}},
  localStorage:{getItem:()=> 'token'}, clearTimeout, setTimeout,
  fetch:async(_,req)=>{calls.push(JSON.parse(req.body));return new Promise(resolve=>replies.push(resolve));}};
 vm.runInNewContext(source,runtime);
 const api=runtime.window.FARIS_CUSTOMER_WORKFLOW;
 const flow=api.create({customer:start,accountId:'staff',render:data=>rendered.push(data),notify(){}});
 const reply=(customer,index=0)=>replies.splice(index,1)[0]({ok:true,json:async()=>({ok:true,customer})});
 const fail=(status,index=0)=>replies.splice(index,1)[0]({ok:false,status,json:async()=>({ok:false,error:'Ujian kegagalan simpan'})});
 return {api,flow,start,calls,uploads,rendered,reply,fail};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const withFiles=(customer,n)=>({...customer,files:Array.from({length:n},(_,i)=>({id:'file-'+i,customer_id:id}))});
test('Phone matching handles local/international numbers without switching the active profile',()=>{
 const {api,flow}=fixture();
 assert.equal(api.normalizePhone('012-345 6789'),'60123456789');
 assert.equal(api.normalizePhone('+60 12 345 6789'),'60123456789');
 assert.equal(api.normalizePhone('03-345 6789'),'');
 assert.match(api.url('VSO',id),new RegExp(id));
 assert.equal(flow.id,id);
 flow.close();
});
test('In-flight changes preserve a newer edit and upload waits for the same profile to save',async()=>{
 const {flow,start,calls,uploads,reply}=fixture();
 flow.queue({loan_amount:49000});
 const save=flow.flush();
 flow.queue({loan_amount:48000,applicant_email:'demo@example.test'});
 const upload=flow.upload({name:'demo.pdf'});
 assert.equal(calls.length,1);
 reply({...start,profile:{...start.profile,loan_amount:49000}});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(calls.length,2);
 assert.equal(calls[1].previous.loan_amount,49000);
 assert.equal(calls[1].changes.loan_amount,48000);
 assert.equal(uploads.length,0);
 reply({...start,profile:{...start.profile,loan_amount:48000,shared_fields:{applicant_email:'demo@example.test'}}});
 await Promise.all([save,upload]);
 assert.equal(uploads.length,1);
 assert.equal(uploads[0].customer_id,id);
 assert.equal(flow.data.loan_amount,48000);
 flow.close();
});
test('Shared validation accepts draft data while keeping phone and bank decisions out of shared updates', async()=>{
 const {sharedPatch,normalPhone}=await import('../supabase/functions/lead-hub-customers/validation.mjs');
 assert.equal(normalPhone('+60123456789'),'60123456789');
 assert.deepEqual(sharedPatch({loan_amount:'49600',applicant_nric:'Test',employment_income:'RM 5000'}),{loan_amount:49600,applicant_nric:'Test',employment_income:'RM 5000'});
 assert.throws(()=>sharedPatch({phone:'60123456789'}));
 assert.throws(()=>sharedPatch({bank_status:'approved'}));
 assert.throws(()=>sharedPatch({customer_name:''}));
});
test('A second document notification during a profile read triggers a new read',async()=>{
 const {flow,start,calls,reply}=fixture();
 const first=flow.refresh();
 await flow.refresh();
 assert.equal(calls.length,1);
 reply(withFiles(start,1));
 await tick();
 assert.equal(calls.length,2);
 reply(withFiles(start,2));
 await first;
 flow.close();
});
test('A slow read may not render data older than a save that has already finished',async()=>{
 const {flow,start,calls,reply,rendered}=fixture();
 const read=flow.refresh();
 flow.queue({loan_amount:61000});
 const save=flow.flush();
 const updated={...start,profile:{...start.profile,loan_amount:61000}};
 reply(updated,1);
 await save;
 reply(start);
 await tick();
 assert.equal(flow.data.loan_amount,61000);
 assert.deepEqual(rendered.map(row=>row.loan_amount),[61000]);
 assert.equal(calls.length,3);
 reply(updated);
 await read;
 flow.close();
});
test('A notification while a save is pending refreshes after the save',async()=>{
 const {flow,start,calls,reply}=fixture();
 flow.queue({loan_amount:61000});
 const save=flow.flush();
 await flow.refresh();
 assert.equal(calls.length,1);
 const updated={...start,profile:{...start.profile,loan_amount:61000}};
 reply(updated);
 await save;
 assert.equal(calls.length,2);
 reply({...updated,profile:{...updated.profile,shared_fields:{applicant_email:'other-tab@example.test'}}});
 await tick();
 assert.equal(flow.data.applicant_email,'other-tab@example.test');
 flow.close();
});
test('A failed save can be retried without a second upload or losing the draft',async()=>{
 const {flow,start,reply,fail,calls,uploads}=fixture();
 flow.queue({loan_amount:62000});
 const first=flow.upload({name:'dummy.pdf'});
 fail(503);
 await assert.rejects(first,/Ujian kegagalan simpan/);
 assert.equal(flow.data.loan_amount,62000);
 assert.equal(uploads.length,0);
 const retry=flow.upload({name:'dummy.pdf'});
 assert.equal(calls.length,2);
 assert.deepEqual(calls[0],calls[1]);
 reply({...start,profile:{...start.profile,loan_amount:62000}});
 await retry;
 assert.equal(uploads.length,1);
 flow.close();
});
test('Closing a profile while it saves prevents a waiting upload from starting',async()=>{
 const {flow,start,reply,uploads}=fixture();
 flow.queue({loan_amount:62000});
 const upload=flow.upload({name:'dummy.pdf'});
 flow.close();
 reply({...start,profile:{...start.profile,loan_amount:62000}});
 await assert.rejects(upload,/Buka semula profil/);
 assert.equal(uploads.length,0);
});
