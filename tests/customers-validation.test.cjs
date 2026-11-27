const test=require('node:test'),assert=require('node:assert/strict');
const modulePromise=import('../supabase/functions/lead-hub-customers/validation.mjs');
test('Manual customer creation normalizes phone numbers and accepts an optional model',async()=>{
 const {validate}=await modulePromise;
 const data={customer_name:' Walk-in Ujian ',source:'Walk-in'};
 for(const phone of ['012-000 0123','+60 (12) 000-0123','60120000123']){
  assert.deepEqual(validate('create_customer',{...data,phone}),{
   customer_name:'Walk-in Ujian',phone_e164:'60120000123',source:'Walk-in',model:''
  });
 }
 const valid={...data,phone:'01100000123',model:'Proton Saga'};
 assert.equal(validate('create_customer',valid).model,'Proton Saga');
 for(const patch of [{phone:'No 0120000123'},{phone:'+60120000123 ext 3'},{phone:'0300000123'},{customer_name:'   '},{customer_name:{}},{source:''},{source:'WhatsApp'},{model:{}}]){
  assert.throws(()=>validate('create_customer',{...valid,...patch}));
 }
});
const profile=()=>({customer_name:' Test ',model:'e.MAS 5',sales_status:'documents',booking_status:'none',expected_revision:0,expected_lead_updated_at:'2026-10-28T01:00:00Z',follow_up_at:'2026-11-01'});
test('sales and bank validation rejects invalid money, status, dates and blank stop reasons',async()=>{const {validate}=await modulePromise;assert.equal(validate('save_profile',profile()).customer_name,'Test');for(const patch of [{sales_status:'pm_sent'},{sales_status:'on_hold'},{deposit:-1},{loan_amount:'NaN'},{booking_amount:'1.005'},{follow_up_at:'2026-02-30'},{expected_revision:null}])assert.throws(()=>validate('save_profile',{...profile(),...patch}));assert.throws(()=>validate('save_bank',{bank_name:'Bank',status:'unknown'}))});
test('document links validate identifiers, batches and matching party/category',async()=>{const {validate}=await modulePromise;const id='00000000-0000-4000-8000-000000000001';assert.deepEqual(validate('link_files',{ids:[id,id],party:'HIRER',category:'BANK'}),{ids:[id],party:'HIRER',category:'BANK'});assert.throws(()=>validate('link_files',{ids:[id],party:'REBATE',category:'PAYSLIP'}));assert.throws(()=>validate('link_files',{ids:['bad'],party:'HIRER',category:'IC'}));assert.throws(()=>validate('checklist',{party:'HIRER',category:'AUTO',status:'received'}));assert.throws(()=>validate('add_note',{note:' '}))});

test('Every bank status can be saved with only name and status, including blank optional form values',async()=>{
 const {validate,BANK_STATUSES}=await modulePromise;
 const optional={officer_name:'',officer_phone:'',submitted_at:'',submitted_time:'',amount:'',term_months:'',approved_amount:'',approved_rate:'',approved_term_months:'',follow_up_due_at:'',next_action:'',notes:'',selected:false};
 for(const status of Object.keys(BANK_STATUSES)){
  for(const fields of [{bank_name:'Maybank',status},{...optional,bank_name:'Maybank',status}]){
   const bank=validate('save_bank',fields);assert.equal(bank.bank_name,'Maybank');assert.equal(bank.status,status);assert.equal(bank.submitted_at,null);assert.equal(bank.amount,null);
  }
 }
 assert.throws(()=>validate('save_bank',{bank_name:' ',status:'draft'}));
 assert.throws(()=>validate('save_bank',{bank_name:'Maybank'}));
});
test('Optional bank fields remain independent and retain validation when supplied',async()=>{
 const {validate}=await modulePromise,base={bank_name:'CIMB',status:'approved',officer_name:''};
 const result=validate('save_bank',{...base,submitted_time:'10:15',follow_up_due_at:'2026-11-27T09:30'});
 assert.equal(result.submitted_at,null);assert.equal(result.submitted_time,'10:15');assert.equal(result.follow_up_due_at,'2026-11-27T09:30:00+08:00');assert.equal(result.next_action,'');
 for(const patch of [{amount:-1},{submitted_at:'2026-02-30'},{submitted_time:'25:00'},{approved_rate:101},{term_months:121}])assert.throws(()=>validate('save_bank',{...base,...patch}));
 const id='20000000-0000-4000-8000-000000000001';
 assert.throws(()=>validate('save_bank',{...base,id}));
 assert.equal(validate('save_bank',{...base,id,expected_updated_at:'2026-11-26T10:00:00Z'}).expected_updated_at,'2026-11-26T10:00:00Z');
});
