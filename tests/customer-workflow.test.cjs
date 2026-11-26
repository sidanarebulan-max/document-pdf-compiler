const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm');
const source=fs.readFileSync('customer-workflow.js','utf8');
const id='10000000-0000-4000-8000-000000000001';
function fixture(){
 const start={lead:{id,customer_name:'Customer Test',phone_e164:'60123456789',model:''},
  profile:{variant:'',colour:'',loan_amount:null,deposit:null,selling_price:null,shared_fields:{}},files:[]};
 const calls=[], replies=[], uploads=[];
 const runtime={window:{addEventListener(){},FARIS_INBOX_CLIENT:{upload:async(file,meta)=>{uploads.push(meta);return {files:[{customer_id:id}]}}}},
  localStorage:{getItem:()=> 'token'}, clearTimeout, setTimeout,
  fetch:async(_,req)=>{calls.push(JSON.parse(req.body));return new Promise(resolve=>replies.push(resolve));}};
 vm.runInNewContext(source,runtime);
 const api=runtime.window.FARIS_CUSTOMER_WORKFLOW;
 const flow=api.create({customer:start,accountId:'staff',render(){},notify(){}});
 const reply=customer=>replies.shift()({ok:true,json:async()=>({ok:true,customer})});
 return {api,flow,start,calls,uploads,reply};
}
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
