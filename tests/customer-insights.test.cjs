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
test('Dashboard renders empty and hostile labels safely; all totals stay numeric',()=>{
 const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',innerHTML:'',textContent:''});return nodes.get(id)};
 const ctx={window:{FARIS_INSIGHTS:core},$ :node,esc:s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),STATUSES:{new:'Lead baharu'},when:()=> '30/10/2026',Intl,Number,Math};vm.createContext(ctx);
 const src=fs.readFileSync('staff-customers.js','utf8');vm.runInContext(src.slice(src.indexOf('const insightCore='),src.indexOf('async function loadInsights('))+';globalThis.draw=renderInsights;',ctx);
 ctx.draw({total:0,confirm:0,pending:0,coloured:0,trend:[],colours:[],statuses:[],models:[]},{from:'',to:'',group:'day'});assert.doesNotMatch(node('customerInsightsResult').innerHTML,/NaN|Infinity/);
 ctx.draw({total:3,confirm:1,pending:2,coloured:2,missing_colour:1,trend:[{bucket:'2026-10-30',total:3,confirm:1,pending:2}],colours:[{label:'<img src=x onerror=alert(1)>',value:2},{label:'Belum diisi',value:1}],statuses:[],models:[]},{from:'2026-10-01',to:'2026-10-30',group:'day'});
 assert.doesNotMatch(node('customerInsightsResult').innerHTML,/<img/);assert.match(node('customerInsightsResult').innerHTML,/&lt;img/);assert.match(node('customerInsightsResult').innerHTML,/33.3%/);
});
