const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&s>='2000-01-01'&&s<='2100-12-31'&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
export function insightsFilters(b,statuses,isId){
 const date=v=>{if(!v)return null;const s=String(v);try{if(validDate(s))return s}catch{}throw Error('Tarikh tidak sah.')};
 const from=date(b.from),to=date(b.to),group=b.group||'day';
 if(from&&to&&from>to)throw Error('Tarikh mula mesti sebelum atau sama dengan tarikh akhir.');
 if(!['day','week','month'].includes(group))throw Error('Pilih hari, minggu atau bulan.');
 if(b.status&&!Object.hasOwn(statuses,b.status))throw Error('Status tidak sah.');
 if(b.staff_id&&!isId(b.staff_id))throw Error('Staff tidak sah.');
 return {_from:from,_to:to,_group:group,_search:String(b.search||'').trim().slice(0,100).replace(/[^\p{L}\p{N} @+.-]/gu,''),_status:b.status||'',_model:String(b.model||'').slice(0,120),_staff:b.staff_id||null};
}
