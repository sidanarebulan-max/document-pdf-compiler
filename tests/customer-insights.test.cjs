const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const core=require('../customer-insights-core');
test('Malaysia date presets respect UTC midnight, Monday weeks and month boundaries',()=>{
 assert.equal(core.localDate(new Date('2026-10-29T15:59:59Z')),'2026-10-29');assert.equal(core.localDate(new Date('2026-10-29T16:00:00Z')),'2026-10-30');
 assert.deepEqual(core.preset('week',new Date('2026-11-01T04:00:00Z')),{from:'2026-10-26',to:'2026-11-01'});
 assert.deepEqual(core.preset('month',new Date('2026-12-31T16:00:00Z')),{from:'2027-01-01',to:'2027-01-01'});assert.deepEqual(core.preset('all'),{from:'',to:''});
 assert.ok(core.validRange('2028-02-29','2028-03-01'));assert.ok(!core.validRange('2026-02-29','2026-03-01'));assert.ok(!core.validRange('2026-11-01','2026-10-01'));assert.ok(!core.validRange('2026-02-31',''));assert.ok(core.bucketLabel('2026-10-26','week').startsWith('Minggu'));
});
test('Edge filters reject invalid ranges, status and account selectors; actor cannot be supplied by caller',async()=>{
 const {insightsFilters}=await import('../supabase/functions/lead-hub-customers/insights.mjs');const {STATUSES,isId}=await import('../supabase/functions/lead-hub-customers/validation.mjs');
 for(const b of [{from:'2026-02-30'},{to:'bad'},{from:'2027-01-01',to:'2026-01-01'},{group:'year'},{status:'made_up'},{staff_id:'bad'}])assert.throws(()=>insightsFilters(b,STATUSES,isId));
 const f=insightsFilters({from:'2026-10-01',to:'2026-10-30',group:'week',actor_id:'other',_actor:'other'},STATUSES,isId);assert.equal(f._group,'week');assert.equal(f._from,'2026-10-01');assert.equal(f._actor,undefined);
});
test('Optional colour is bounded and older clients do not erase saved colour',async()=>{
 const {validate}=await import('../supabase/functions/lead-hub-customers/validation.mjs'),base={customer_name:'Test',sales_status:'new',booking_status:'none',expected_revision:0,expected_lead_updated_at:'2026-10-30T01:00:00Z'};
 assert.equal(validate('save_profile',{...base,colour:' Snow White '}).colour,'Snow White');assert.equal(Object.hasOwn(validate('save_profile',base),'colour'),false);assert.throws(()=>validate('save_profile',{...base,colour:'a'.repeat(81)}));
});
test('Dashboard filters validate category, exact values, pagination and preserve missing values',async()=>{
 const {dashboardFilters}=await import('../supabase/functions/lead-hub-customers/insights.mjs');const {STATUSES,isId}=await import('../supabase/functions/lead-hub-customers/validation.mjs');
 const f=dashboardFilters({variant:' PREMIUM  PLUS ',colour:' White ',model:'e.MAS 5',bucket:'trade_in',offset:50,_actor:'forged'},STATUSES,isId);
 assert.equal(f._variant,'premium plus');assert.equal(f._colour,'white');assert.equal(f._offset,50);assert.equal(f._actor,undefined);
 assert.equal(dashboardFilters({},STATUSES,isId)._variant,null);assert.equal(dashboardFilters({colour:''},STATUSES,isId)._colour,'');assert.equal(dashboardFilters({model:''},STATUSES,isId)._model,'');
 for(const b of [{bucket:'admin'},{offset:-1},{offset:1.2},{offset:'50'},{offset:1000000001},{variant:[]},{colour:'x'.repeat(81)},{model:[]}])assert.throws(()=>dashboardFilters(b,STATUSES,isId));
});
test('LOU and Trade In flags are strict booleans and omitted fields preserve older clients',async()=>{
 const {validate}=await import('../supabase/functions/lead-hub-customers/validation.mjs');const base={customer_name:'Test',sales_status:'new',booking_status:'none',expected_revision:0,expected_lead_updated_at:'2026-10-30T01:00:00Z'};
 assert.equal(validate('save_profile',{...base,lou_received:true,trade_in:false}).lou_received,true);
 for(const key of ['lou_received','trade_in']){assert.equal(Object.hasOwn(validate('save_profile',base),key),false);assert.throws(()=>validate('save_profile',{...base,[key]:'false'}));}
});
test('Dashboard renders four clickable categories and safely encodes model, variant, colour and status',()=>{
 const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',innerHTML:'',textContent:'',selectedOptions:[]});return nodes.get(id)};
 const ctx={window:{FARIS_INSIGHTS:core},$ :node,esc:s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),STATUSES:{new:'Lead baharu'},when:()=> '30/10/2026',Intl,Number,Math};vm.createContext(ctx);
 const src=fs.readFileSync('staff-customers.js','utf8');vm.runInContext(src.slice(src.indexOf('const insightCore='),src.indexOf('async function loadInsights('))+';globalThis.draw=renderInsights;',ctx);
 ctx.draw({stats:{total:0},total:0,trend:[],colours:[],statuses:[],vehicles:[]},{from:'',to:'',group:'day',bucket:''});assert.doesNotMatch(node('customerInsightsResult').innerHTML,/NaN|Infinity/);
 const hostile='<img src=x onerror=alert(1)>',filters={from:'2026-10-01',to:'2026-10-30',group:'day',bucket:'pending'};
 ctx.draw({stats:{total:3,lou:1,delivered:0,pending:2,trade_in:1},total:2,trend:[{bucket:'2026-10-30',total:2,lou:0,delivered:0,pending:2,trade_in:1}],vehicles:[{model:hostile,variant:'premium',label:hostile+' · Premium',value:2}],colours:[{key:hostile,label:hostile,value:2}],statuses:[{label:'new',value:2}]},filters);
 const html=node('customerInsightsResult').innerHTML;assert.doesNotMatch(html,/<img/);assert.match(html,/&lt;img/);for(const key of ['lou','delivered','pending','trade_in'])assert.match(html,new RegExp('data-insight-bucket="'+key+'"'));assert.match(html,/data-insight-variant="&quot;premium&quot;"/);assert.match(html,/data-insight-status="new"/);assert.match(html,/class="insights-kpi pending"[^>]*aria-pressed="true"/);
});
