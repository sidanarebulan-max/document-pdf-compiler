const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('assets/faris-appearance.js','utf8');
function setup(stored=null,{blocked=false,dark=false}={}){
 const root={dataset:{}},buttons=['auto','light','dark'].map(t=>({dataset:{themeChoice:t},setAttribute(k,v){this[k]=v}})),events={},windowEvents={},media={matches:dark,addEventListener(k,f){this.change=f}},storage=new Map(stored?[['faris_lead_hub_theme_v1',stored]]:[]),meta={};
 const document={documentElement:root,querySelector:()=>meta,querySelectorAll:()=>buttons,dispatchEvent:()=>{},addEventListener:(k,f)=>events[k]=f};
 const window={addEventListener:(k,f)=>windowEvents[k]=f};
 const ctx={window,document,matchMedia:()=>media,CustomEvent:class{constructor(type,data){this.type=type;this.detail=data.detail}},localStorage:{getItem:k=>{if(blocked)throw Error();return storage.get(k)},setItem:(k,v)=>{if(blocked)throw Error();storage.set(k,v)}}};vm.createContext(ctx);vm.runInContext(source,ctx);
 return {root,buttons,events,windowEvents,media,storage,api:window.FARIS_APPEARANCE,meta};
}
test('Auto follows device appearance, explicit modes persist and old preferences remain valid',()=>{
 const s=setup(null,{dark:true});assert.equal(s.root.dataset.iosTheme,'dark');assert.equal(s.root.dataset.iosAppearance,'auto');s.media.matches=false;s.media.change();assert.equal(s.root.dataset.iosTheme,'light');s.api.setTheme('dark');s.media.change();assert.equal(s.root.dataset.iosTheme,'dark');assert.equal(s.storage.get('faris_lead_hub_theme_v1'),'dark');assert.equal(s.api.setTheme('invalid'),false);assert.equal(setup('light',{dark:true}).root.dataset.iosTheme,'light');
});
test('Blocked storage, cross-tab changes and visual controls stay in sync',()=>{
 const s=setup(null,{blocked:true});assert.equal(s.api.setTheme('dark'),true);assert.equal(s.meta.content,'#10131d');assert.equal(s.buttons.find(b=>b.dataset.themeChoice==='dark')['aria-pressed'],'true');s.windowEvents.storage({key:'faris_lead_hub_theme_v1',newValue:'light'});assert.equal(s.root.dataset.theme,'light');assert.equal(s.root.dataset.iosTheme,'light');s.windowEvents.storage({key:null,newValue:null});assert.equal(s.api.getTheme(),'auto');
});
