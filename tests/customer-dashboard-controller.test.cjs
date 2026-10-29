const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const core=require('../customer-insights-core');
function fixture(){
 const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',innerHTML:'',textContent:'',disabled:false,setAttribute(k,v){this[k]=v}});return nodes.get(id)};
 Object.entries({customersModel:JSON.stringify('e.MAS 5'),customersVariant:JSON.stringify('premium'),customersColour:JSON.stringify('white'),customersStatus:'new',customersBucket:'pending',customersStaff:'forged-staff',customerInsightsFrom:'2026-10-01',customerInsightsTo:'2026-10-30',customerInsightsGroup:'week'}).forEach(([id,v])=>node(id).value=v);
 const calls=[],pending=[];const ctx={window:{FARIS_INSIGHTS:core},$:node,Intl,Number,Math,JSON,Map,esc:s=>String(s),notice:()=>{},request:(action,payload)=>{calls.push({action,payload});return new Promise((resolve,reject)=>pending.push({resolve,reject}))}};
 vm.createContext(ctx);const s=fs.readFileSync('staff-customers.js','utf8');
 vm.runInContext("let user={role:'staff'},epoch=0,listing=0,rows=[],next=null;"+s.slice(s.indexOf('const insightCore='),s.indexOf('function showTab('))+";let draws=0;renderDirectory=()=>{};renderInsights=()=>{draws++};fillDashboardOptions=()=>{};globalThis.run=directory;globalThis.state=()=>({rows,next,draws});globalThis.logout=()=>{epoch++;user=null;rows=[]};",ctx);
 return {ctx,node,calls,pending};
}
test('One dashboard request sends the complete drill-down and pagination preserves its filters',async()=>{
 const f=fixture(),first=f.ctx.run();assert.equal(f.calls[0].action,'dashboard');assert.deepEqual(JSON.parse(JSON.stringify(f.calls[0].payload)),{search:'',status:'new',model:'e.MAS 5',variant:'premium',colour:'white',bucket:'pending',staff_id:'',from:'2026-10-01',to:'2026-10-30',group:'week',offset:0});
 f.pending[0].resolve({customers:[{id:'a'}],next_offset:50,total:51,insights:{},options:{}});await first;
 const second=f.ctx.run(true);assert.equal(f.calls[1].payload.offset,50);assert.equal(f.calls[1].payload.colour,'white');f.pending[1].resolve({customers:[{id:'b'}],next_offset:null,total:51,insights:{},options:{}});await second;
 assert.deepEqual(JSON.parse(JSON.stringify(f.ctx.state().rows)),[{id:'a'},{id:'b'}]);assert.equal(f.ctx.state().draws,2);
});
test('Late dashboard response cannot repopulate a signed-out account',async()=>{
 const f=fixture(),p=f.ctx.run();f.ctx.logout();f.pending[0].resolve({customers:[{id:'private'}],next_offset:null,total:1,insights:{}});await p;assert.equal(f.ctx.state().rows.length,0);assert.equal(f.ctx.state().draws,0);
});
test('A newer filter request wins and invalid dates clear stale customers',async()=>{
 const f=fixture(),old=f.ctx.run();f.node('customersColour').value=JSON.stringify('black');const current=f.ctx.run();
 f.pending[1].resolve({customers:[{id:'black'}],next_offset:null,total:1,insights:{}});await current;
 f.pending[0].resolve({customers:[{id:'white'}],next_offset:null,total:1,insights:{}});await old;assert.equal(f.ctx.state().rows[0].id,'black');
 f.node('customerInsightsTo').value='2026-09-01';await f.ctx.run();assert.equal(f.calls.length,2);assert.equal(f.ctx.state().rows.length,0);assert.match(f.node('customerInsightsResult').innerHTML,/Semak tarikh/);
});
