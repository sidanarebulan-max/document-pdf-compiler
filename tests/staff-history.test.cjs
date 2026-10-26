const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('staff-passcode.js','utf8').replace(
 'document.addEventListener("DOMContentLoaded",init);',
 `globalThis.testApp={reload,renderLeads,events:pmEventHistory,
 set(data){user=data.user;leads=data.leads||[];history=data.history||[];
 assignmentHistory=data.assignments||[];activePmTab=data.tab||"history"}};`
);
function app(){
 const nodes=new Map();
 function element(){return {value:'',textContent:'',innerHTML:'',disabled:false,
  classList:{add(){},remove(){},toggle(){}},querySelectorAll(){return []}}}
 const context={console,Date,Map,Set,localStorage:{getItem(){return null}},
  window:{matchMedia(){return {matches:false}}},
  document:{getElementById(id){if(!nodes.has(id))nodes.set(id,element());return nodes.get(id)}}};
 vm.runInNewContext(source,context);
 return {api:context.testApp,nodes,context};
}
const saz={id:'saz',role:'staff',staff_code:'SAZ0001'};
function assignment(overrides={}){return {id:1,lead_id:'ridwhan',assignee_name:'Aiman',
 assignee_code:'AIMAN01',event_type:'claimed',assigned_at:'2026-10-26T11:00:00Z',
 recorded_at:'2026-10-26T11:00:00Z',lead:{customer_name:'Ridwhan',phone_e164:'60123456789',model:'Proton e.MAS 5'},...overrides}}
test('staff with no own leads sees another staff claim in shared history',()=>{
 const {api,nodes}=app();api.set({user:saz,assignments:[assignment()]});api.renderLeads();
 const html=nodes.get('pmHistoryList').innerHTML;
 assert.match(html,/Ridwhan/);assert.match(html,/60123456789/);
 assert.match(html,/Diambil \/ claim oleh/);assert.match(html,/Aiman \(AIMAN01\)/);
 assert.equal(nodes.get('pmPendingCount').textContent,'0');
 assert.equal(nodes.get('pmHistoryCount').textContent,'1');
 assert.doesNotMatch(html,/<a |<button|data-save|data-open/);
});
test('claim remains after reassignment and claimant is searchable',()=>{
 const {api,nodes}=app();api.set({user:saz,assignments:[assignment(),assignment({id:2,
  assignee_name:'Sazwani',assignee_code:'SAZ0001',assigned_at:'2026-10-26T12:00:00Z'})]});
 api.renderLeads();assert.equal(nodes.get('pmHistoryCount').textContent,'2');
 nodes.get('leadSearch').value='aiman01';api.renderLeads();
 assert.match(nodes.get('pmHistoryList').innerHTML,/Aiman/);
 assert.doesNotMatch(nodes.get('pmHistoryList').innerHTML,/Sazwani/);
});
test('legacy assignments do not fabricate claim time; names are escaped',()=>{
 const {api,nodes}=app();api.set({user:saz,assignments:[assignment({event_type:'legacy_assignment',
  assigned_at:null,assignee_name:'<img src=x onerror=alert(1)>'})]});api.renderLeads();
 const html=nodes.get('pmHistoryList').innerHTML;
 assert.match(html,/Masa claim asal tidak direkodkan/);
 assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img/);
});
test('shared history does not add other staff contacts to working tabs',()=>{
 const {api,nodes}=app();api.set({user:saz,assignments:[assignment()],tab:'pending'});api.renderLeads();
 assert.match(nodes.get('leadList').innerHTML,/Tiada nombor yang belum PM/);
 assert.equal(nodes.get('pmPendingCount').textContent,'0');
 assert.equal(nodes.get('pmHistoryCount').textContent,'1');
});
test('server reload retains shared history even when own list is empty',async()=>{
 const {api,nodes,context}=app();let calls=[];
 context.fetch=async(_url,options)=>{const action=JSON.parse(options.body).action;calls.push(action);
  return {ok:true,status:200,json:async()=>action==='list'?{ok:true,leads:[],history:[],
   assignment_history:[assignment()],staff:[],available_count:0}:{ok:true,team:{},personal:{}}}};
 api.set({user:saz});await api.reload();
 assert.deepEqual(calls,['list','get_message_templates']);
 assert.match(nodes.get('pmHistoryList').innerHTML,/Aiman \(AIMAN01\)/);
});
