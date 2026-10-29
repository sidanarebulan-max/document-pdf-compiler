const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('staff-customers.js','utf8');
function fixture(){
 const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',checked:false,textContent:'',required:false,options:[],showModal(){this.shown=true},scrollIntoView(){this.scrolled=true}});return nodes.get(id)};
 const saved={customer_name:'Customer',model:'e.MAS 5',variant:'Premium',colour:'White',sales_status:'documents',booking_status:'paid',booking_amount:'100',deposit:'5000',selling_price:'75800',loan_amount:'60000',guarantor_required:true,lou_received:false,trade_in:false,closure_reason:'',expected_revision:7,expected_lead_updated_at:'2026-10-30T01:00:00Z'};
 const ctx={$:node,STATUSES:{documents:'Mengumpul dokumen',delivered:'Kereta diserahkan',on_hold:'Tangguh',cancelled:'Tidak diteruskan'},PARTIES:{HIRER:'Pemohon',GUARANTOR:'Penjamin',REBATE:'Rebate'},profileValues:()=>({...saved}),notice:t=>node('notice').textContent=t,showTab:t=>node('tab').value=t,categories:()=>{node('customerDocCategory').options=(node('customerDocParty').value==='REBATE'?['IC_FRONT','LESEN','OTHER']:['IC','LESEN','PAYSLIP','BANK','OTHER']).map(value=>({value}))},document:{querySelectorAll:()=>[]}};
 vm.createContext(ctx);vm.runInContext("let customer={profile:{sales_status:'documents',lou_received:false,trade_in:false,closure_reason:''}},busy=false,dirty=false;"+src.slice(src.indexOf('function caseStage('),src.indexOf('function renderProfile('))+";globalThis.choose=chooseDocumentTarget;globalThis.show=openCaseStatus;globalThis.values=caseStatusValues;globalThis.reason=caseReasonRequired;globalThis.stage=caseStage;globalThis.makeDirty=()=>{dirty=true};",ctx);
 return {ctx,node,saved};
}
test('Quick upload targets the chosen person and category, rejecting categories outside that person',()=>{
 const {ctx,node}=fixture();assert.equal(ctx.choose('GUARANTOR','BANK'),true);assert.equal(node('customerDocParty').value,'GUARANTOR');assert.equal(node('customerDocCategory').value,'BANK');assert.equal(ctx.choose('REBATE','BANK'),false);assert.equal(ctx.choose('invalid','IC'),false);
});
test('Status changes preserve money, identity, guarantee and optimistic concurrency fields',()=>{
 const {ctx,node,saved}=fixture();node('customerCaseStatus').value='bank_submitted';node('customerCaseReason').value='';node('customerCaseLou').checked=true;node('customerCaseTradeIn').checked=true;
 const data=JSON.parse(JSON.stringify(ctx.values()));for(const k of ['customer_name','model','variant','colour','booking_status','booking_amount','deposit','selling_price','loan_amount','guarantor_required','expected_revision','expected_lead_updated_at'])assert.equal(data[k],saved[k]);assert.equal(data.sales_status,'bank_submitted');assert.equal(data.lou_received,true);assert.equal(data.trade_in,true);assert.equal(saved.sales_status,'documents');
});
test('Status editor requires stop reasons and does not discard an unsaved profile',()=>{
 const {ctx,node}=fixture();node('customerCaseStatus').value='on_hold';ctx.reason();assert.equal(node('customerCaseReason').required,true);node('customerCaseStatus').value='documents';ctx.reason();assert.equal(node('customerCaseReason').required,false);
 ctx.makeDirty();ctx.show();assert.notEqual(node('customerCaseDialog').shown,true);assert.equal(node('tab').value,'summary');assert.match(node('notice').textContent,/Simpan perubahan profil/);
});
test('Case stage distinguishes LOU, delivery and inactive cases',()=>{
 const {ctx}=fixture();assert.match(ctx.stage({sales_status:'documents',lou_received:true}),/LOU/);assert.match(ctx.stage({sales_status:'delivered',lou_received:true}),/DELIVER/);assert.equal(ctx.stage({sales_status:'cancelled',lou_received:true}),'Tidak diteruskan');
});
