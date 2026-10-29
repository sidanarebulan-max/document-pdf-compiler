(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FARIS_INSIGHTS=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function localDate(now=new Date()){const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kuala_Lumpur',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(x=>[x.type,x.value]));return p.year+'-'+p.month+'-'+p.day}
function preset(kind,now=new Date()){
 const today=localDate(now),d=new Date(today+'T00:00:00Z');
 if(kind==='all')return {from:'',to:''};
 if(kind==='week')d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);
 if(kind==='month')d.setUTCDate(1);
 return {from:d.toISOString().slice(0,10),to:today};
}
function validRange(from,to){try{for(const s of [from,to])if(s&&(!/^\d{4}-\d{2}-\d{2}$/.test(s)||s<'2000-01-01'||s>'2100-12-31'||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s))return false;return !(from&&to&&from>to)}catch{return false}}
function bucketLabel(value,group='day'){const d=new Date(value+'T00:00:00+08:00');if(!Number.isFinite(+d))return value;const label=new Intl.DateTimeFormat('ms-MY',{timeZone:'Asia/Kuala_Lumpur',month:'short',year:'numeric',...(group==='month'?{}:{day:'numeric'})}).format(d);return group==='week'?'Minggu '+label:label}
return {localDate,preset,validRange,bucketLabel};
});
