// Keep names readable in WhatsApp, Telegram and file search.
export function cleanOutputName(value){
 let name=String(value||'').normalize('NFC').replace(/_/g,' ')
  .replace(/[\u0000-\u001f\u007f<>:"/\\|?*\u202a-\u202e\u2066-\u2069]/g,' ')
  .replace(/\s+/g,' ').trim().replace(/(?:\.pdf)+$/i,'').replace(/^[.\s]+|[.\s]+$/g,'').slice(0,120).trim();
 if(/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))name='Fail '+name;
 return name;
}
export function caseOutputFilename(c,partial=false){
 const custom=cleanOutputName(c.output_name);
 const base=custom||((cleanOutputName(c.customer_name)||'Customer')+' - Document');
 return base+(partial?' - Separa':'')+'.pdf';
}
