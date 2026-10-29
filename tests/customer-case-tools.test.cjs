const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('staff-customers.js','utf8');
function fixture(){
 const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',checked:false,textContent:'',required:false,options:[],showModal(){this.shown=true},scrollIntoView(){this.scrolled=true}});return nodes.get(id)};
 const saved={customer_name:'Customer',model:'e.MAS 5',variant:'Premium',colour:'White',sales_status:'documents',booking_status:'paid',booking_amount:'100',deposit:'5000',selling_price:'75800',loan_amount:'60000',guarantor_required:true,lou_received:false,trade_in:false,closure_reason:'',expected_revision:7,expected_lead_updated_at:'2026-10-30T01:00:00Z'};
 const ctx={esc:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),when:()=> '30/10/2026',$:node,STATUSES:{documents:'Mengumpul dokumen',delivered:'Kereta diserahkan',on_hold:'Tangguh',cancelled:'Tidak diteruskan'},PARTIES:{HIRER:'Pemohon',GUARANTOR:'Penjamin',REBATE:'Rebate'},profileValues:()=>({...saved}),notice:t=>node('notice').textContent=t,showTab:t=>node('tab').value=t,document:{querySelectorAll:()=>[]}};
 vm.createContext(ctx);vm.runInContext("let selected=new Set(),customer={files:[],profile:{sales_status:'documents',lou_received:false,trade_in:false,closure_reason:''}},busy=false,dirty=false;"+src.slice(src.indexOf('function caseStage('),src.indexOf('function renderProfile('))+";globalThis.markup=referenceFilesMarkup;globalThis.show=openCaseStatus;globalThis.values=caseStatusValues;globalThis.reason=caseReasonRequired;globalThis.stage=caseStage;globalThis.makeDirty=()=>{dirty=true};",ctx);
 return {ctx,node,saved};
}
test('A case with no attachments can open the status editor',()=>{
 const {ctx,node}=fixture();ctx.show();assert.equal(node('customerCaseDialog').shown,true);assert.equal(node('customerCaseStatus').value,'documents');
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

test('Reference list includes old and unknown classifications without per-document states',()=>{
 const {ctx}=fixture();const base={byte_size:1000,created_at:'2026-10-30T01:00:00Z'};
 const html=ctx.markup([{...base,id:'a',original_name:'bundle.pdf',party:'HIRER',category:'IC'},{...base,id:'b',original_name:'support.jpg',party:'GUARANTOR',category:'BANK'},{...base,id:'c',original_name:'<img src=x>',party:'OLD_KIND',category:'LEGACY'}]);
 for(const id of ['a','b','c'])assert.match(html,new RegExp('data-customer-preview="'+id+'"'));
 assert.doesNotMatch(html,/<img|data-check-party|Status|Pemohon|Penjamin|Kad pengenalan|Penyata bank/);assert.match(html,/&lt;img/);
 assert.match(ctx.markup([]),/Upload dokumen lengkap atau dokumen sokongan/);
});
test('Complete PDFs and support files upload unchanged under the same customer reference workflow',async()=>{
 const files=[{name:'Complete application.pdf',size:1500,type:'application/pdf'},{name:'Supporting letter.png',size:1000,type:'image/png'}],uploaded=[],linked=[],nodes=new Map([['customerUpload',{files,value:'chosen'}]]);
 const ctx={$:id=>nodes.get(id),window:{FARIS_INBOX_CLIENT:{upload:async f=>{uploaded.push(f);return {files:[{id:'file-'+uploaded.length}]}}}},busyState:()=>{},notice:()=>{},mutate:async(action,data,id)=>linked.push({action,data,id}),refreshProfile:async()=>{}};vm.createContext(ctx);
 vm.runInContext("let customer={lead:{id:'customer-a'}},busy=false,epoch=1;"+src.slice(src.indexOf('async function upload('),src.indexOf('const fieldNames='))+";globalThis.uploadFiles=upload;",ctx);await ctx.uploadFiles();
 assert.deepEqual(uploaded,files);assert.equal(linked.length,2);for(const row of linked){assert.equal(row.action,'link_files');assert.equal(row.id,'customer-a');assert.equal(row.data.party,'HIRER');assert.equal(row.data.category,'OTHER')};assert.equal(nodes.get('customerUpload').value,'');
});
test('Saving the summary preserves stored financial values after the bank inputs are removed',()=>{
 const saved={booking_status:'paid',booking_amount:100,selling_price:75800,deposit:5000,loan_amount:60000},nodes=new Map();
 const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',checked:false});return nodes.get(id)};
 Object.entries({cpName:'Customer',cpModel:'e.MAS 5',cpVariant:'Premium',cpColour:'White',cpStatus:'documents',cpFollow:'2026-11-01',cpNext:'Follow up',cpReason:''}).forEach(([id,value])=>node(id).value=value);
 const ctx={$:node,saved};vm.createContext(ctx);vm.runInContext("let customer={profile:saved},editRevision=7,editStamp='2026-10-30T01:00:00Z';"+src.slice(src.indexOf('function profileValues('),src.indexOf('async function runWrite('))+";globalThis.values=profileValues;",ctx);
 const data=ctx.values();for(const [key,value] of Object.entries(saved))assert.equal(data[key],value);assert.equal(data.expected_revision,7);assert.equal(data.next_action,'Follow up');assert.ok(![...nodes.keys()].some(id=>/^cp(Booking|Price|Deposit|Loan)/.test(id)));
});
