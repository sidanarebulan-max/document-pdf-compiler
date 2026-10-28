const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
(async()=>{
 const {cleanOutputName,caseOutputFilename}=await import('../supabase/functions/lead-hub-telegram/output-name.mjs');
 const {parseNavCallback,documentMenu}=await import('../supabase/functions/lead-hub-telegram/navigation.mjs');
 const {parseNatural}=await import('../supabase/functions/lead-hub-telegram/natural.mjs');
 const web=fs.readFileSync('app4.js','utf8');
 const webClean=vm.runInNewContext(web.slice(web.indexOf('  function cleanOutputName'),web.indexOf('  function safeFilename'))+';cleanOutputName');
 for(const [raw,expected] of [
  ['Nor_Farah - Document.pdf','Nor Farah - Document'],['  Nor   Farah  ','Nor Farah'],
  ['../../Nor:Farah?.pdf','Nor Farah'],['Émilie 李 - Document.pdf','Émilie 李 - Document'],
  ['A.pdf.pdf','A'],['CON','Fail CON'],['___ .pdf',''],['a\nb\u202ec','a b c']
 ]){assert.equal(cleanOutputName(raw),expected);assert.equal(webClean(raw),expected)}
 assert.equal(caseOutputFilename({customer_name:'Nor_Farah'}),'Nor Farah - Document.pdf');
 assert.equal(caseOutputFilename({customer_name:'Other',output_name:'Nor_Farah - Document.pdf'}),'Nor Farah - Document.pdf');
 assert.equal(caseOutputFilename({output_name:'Nor Farah - Document'},true),'Nor Farah - Document - Separa.pdf');
 const account={id:'10000000-0000-4000-8000-000000000001'},caseId='20000000-0000-4000-8000-000000000001';
 let active={id:caseId,account_id:account.id,chat_id:1,customer_name:'Customer',state:'collecting'},dialog={},messages=[],writes=[];
 const ctx={console,Date,parseNatural,parseNavCallback,cleanOutputName,caseOutputFilename,documentMenu,
  currentCase:async()=>active,linkedTelegramAccount:async()=>({account,link:{}}),
  say:async(_token,_chat,text)=>{messages.push(text)},telegramCall:async()=>({}),
  clearWhatsAppDraft:async()=>{},clearCustomerNamePrompt:async()=>{dialog={}},
  setCustomerFocus:async(_id,_chat,_account,id,step)=>{dialog={active_case_id:id,pending_step:step,pending_until:new Date(Date.now()+60000).toISOString()}},
  showCustomerMenu:async()=>{dialog={};messages.push('HOME')},handleWhatsAppDraft:async()=>false,
  db:{from(table){let filters={},patch;const b={select(){return b},eq(k,v){filters[k]=v;return b},update(v){patch=v;return b},async maybeSingle(){
   if(table==='lead_hub_telegram_dialog')return {data:dialog};
   assert.equal(table,'lead_hub_telegram_cases');assert.equal(filters.account_id,account.id);assert.equal(filters.chat_id,1);assert.equal(filters.state,'collecting');assert.equal(filters.id,caseId);
   writes.push(patch);Object.assign(active,patch);return {data:{...active}};
  }};return b}}
 };
 vm.createContext(ctx);
 const bot=fs.readFileSync('supabase/functions/lead-hub-telegram/index.ts','utf8');
 const functions=bot.slice(bot.indexOf('async function beginOutputName('),bot.indexOf('async function showWhatsAppMenu('))+
  bot.slice(bot.indexOf('async function processUpdate('),bot.indexOf('async function controller('));
 vm.runInContext(stripTypeScriptTypes(functions),ctx);
 const send=text=>ctx.processUpdate({message:{chat:{id:1,type:'private'},from:{id:9},text}},{},'test-token');
 await send('/namafail');assert.equal(dialog.pending_step,'output_name');
 await send('Nor_Farah - Document.pdf');assert.equal(active.output_name,'Nor Farah - Document');assert.equal(writes.length,1);assert.equal(dialog.pending_step,undefined);
 await send('/namafail');await send('batal');assert.equal(writes.length,1);
 await send('/namafail');await send('asal');assert.equal(active.output_name,null);
 await send('/namafail');active={...active,id:'30000000-0000-4000-8000-000000000001'};
 await send('Wrong folder');assert.equal(writes.length,2);assert.ok(messages.at(-1).includes('berubah'));
 active={...active,id:caseId};await ctx.beginOutputName('token',1,9,account,'30000000-0000-4000-8000-000000000001');assert.ok(messages.at(-1).includes('bukan kes aktif'));
 await send('/namafail');dialog.pending_until='2000-01-01T00:00:00Z';await send('Expired');assert.equal(writes.length,2);assert.ok(messages.at(-1).includes('tamat'));
 await send('/namafail');await send('/menu');assert.equal(writes.length,2);assert.equal(messages.at(-1),'HOME');
 const callback=documentMenu(active).reply_markup.inline_keyboard.flat().find(x=>x.text.includes('Nama Output'));
 assert.equal(parseNavCallback(callback.callback_data).caseId,caseId);
 assert.equal(parseNavCallback('faris_nav:filename:invalid'),null);
 console.log('PASS readable filenames, web/bot normalization, Unicode, partial label, Telegram prompt save/reset/cancel/expiry and wrong-case protection');
})().catch(e=>{console.error(e);process.exitCode=1});
