const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('staff-passcode.js','utf8').replace('document.addEventListener("DOMContentLoaded",init);',
 `globalThis.testApp={reload,renderLeads,numbers:historyNumbers,events:pmEventHistory,
 set(data){user=data.user;leads=data.leads||[];history=data.history||[];myPm=data.myPm||[];
 assignmentHistory=data.assignments||[];activePmTab=data.tab||"history"}};`);
function app(){
 const nodes=new Map();
 const element=()=>({value:'',textContent:'',innerHTML:'',disabled:false,classList:{add(){},remove(){},toggle(){}},querySelectorAll(){return []}});
 const context={console,Date,Map,Set,localStorage:{getItem(){return null}},window:{matchMedia(){return {matches:false}}},document:{getElementById(id){if(!nodes.has(id))nodes.set(id,element());return nodes.get(id)}}};
 vm.runInNewContext(source,context);return {api:context.testApp,nodes,context};
}
const saz={id:'saz',display_name:'Sazwani',role:'staff',staff_code:'SAZ0001'};
function assignment(overrides={}){return {id:1,lead_id:'ridwhan',assignee_name:'Aiman',assignee_code:'AIMAN01',event_type:'claimed',assigned_at:'2026-10-26T11:00:00Z',recorded_at:'2026-10-26T11:00:00Z',lead:{id:'ridwhan',customer_name:'Ridwhan',phone_e164:'60123456789',model:'Proton e.MAS 5',consent_confirmed:true,assigned_id:'aiman',stage:'claimed'},...overrides}}
test('history is a contactable number list with claimant and no private edit controls',()=>{
 const {api,nodes}=app();api.set({user:saz,assignments:[assignment()]});api.renderLeads();const html=nodes.get('pmHistoryList').innerHTML;
 assert.match(html,/Ridwhan/);assert.match(html,/Aiman \(AIMAN01\)/);assert.match(html,/data-history-open/);assert.match(html,/data-history-confirm/);
 assert.equal(nodes.get('pmPendingCount').textContent,'0');assert.equal(nodes.get('pmHistoryCount').textContent,'1');
 assert.doesNotMatch(html,/data-save|data-assignee|textarea|WhatsApp dibuka/);
});
test('repeat assignments do not duplicate history numbers but remain in activity log',()=>{
 const {api,nodes}=app();const newer=assignment({id:2,assignee_name:'Sazwani',assignee_code:'SAZ0001',recorded_at:'2026-10-26T12:00:00Z'});
 api.set({user:saz,assignments:[assignment(),newer]});api.renderLeads();assert.equal(nodes.get('pmHistoryCount').textContent,'1');assert.equal(nodes.get('pmActivityCount').textContent,'2');
 assert.match(nodes.get('pmHistoryList').innerHTML,/Sazwani/);
 api.set({user:saz,assignments:[assignment(),newer],tab:'log'});api.renderLeads();assert.match(nodes.get('pmActivityList').innerHTML,/Aiman/);assert.match(nodes.get('pmActivityList').innerHTML,/Sazwani/);assert.doesNotMatch(nodes.get('pmActivityList').innerHTML,/<a |<button/);
});
test('shared PM is listed under sender Dah PM even without assigned leads',()=>{
 const {api,nodes}=app();api.set({user:saz,assignments:[assignment()],myPm:[{...assignment().lead,pm_confirmed_at:'2026-10-27T12:00:00Z'}],tab:'sent'});api.renderLeads();
 assert.equal(nodes.get('pmPendingCount').textContent,'0');assert.equal(nodes.get('pmSentCount').textContent,'1');assert.match(nodes.get('leadList').innerHTML,/Ridwhan/);assert.doesNotMatch(nodes.get('leadList').innerHTML,/data-save|textarea/);
});
test('log shows actual actor and confirmation while history stays separate',()=>{
 const {api,nodes}=app();api.set({user:saz,assignments:[assignment()],history:[{id:7,lead_id:'ridwhan',actor_id:'saz',actor:{display_name:'Sazwani',staff_code:'SAZ0001'},event_type:'pm_confirmed',created_at:'2026-10-27T12:00:00Z',lead:assignment().lead}],tab:'log'});api.renderLeads();
 assert.match(nodes.get('pmActivityList').innerHTML,/Mesej disahkan sudah PM/);assert.match(nodes.get('pmActivityList').innerHTML,/Sazwani \(SAZ0001\)/);assert.equal(nodes.get('pmHistoryCount').textContent,'1');
});
test('history refuses contact buttons without consent and escapes names',()=>{
 const {api,nodes}=app();const record=assignment({assignee_name:'<img src=x onerror=alert(1)>',lead:{...assignment().lead,consent_confirmed:false}});
 api.set({user:saz,assignments:[record]});api.renderLeads();const html=nodes.get('pmHistoryList').innerHTML;assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img|data-history-open|data-history-confirm/);
});
test('reload uses separate team activity and own confirmed-contact responses',async()=>{
 const {api,nodes,context}=app(),calls=[];
 context.fetch=async(_url,options)=>{const action=JSON.parse(options.body).action;calls.push(action);return {ok:true,status:200,json:async()=>action==='list'?{ok:true,leads:[],history:[],activity_log:[],my_pm:[],assignment_history:[assignment()],staff:[],available_count:0}:{ok:true,team:{},personal:{}}}};
 api.set({user:saz});await api.reload();assert.deepEqual(calls,['list','get_message_templates']);assert.match(nodes.get('pmHistoryList').innerHTML,/Aiman \(AIMAN01\)/);
});
