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
export function dashboardFilters(b,statuses,isId){
 const f=insightsFilters(b,statuses,isId);
 const exact=(v,max)=>{if(v===null||v===undefined)return null;if(typeof v!=='string'||v.length>max)throw Error('Tapisan tidak sah.');return v.trim().replace(/\s+/g,' ').toLowerCase()};
 if(b.model!==null&&b.model!==undefined&&(typeof b.model!=='string'||b.model.length>120))throw Error('Model tidak sah.');
 const bucket=b.bucket||'',offset=b.offset??0;
 if(!['','lou','delivered','pending','trade_in'].includes(bucket)||!Number.isInteger(offset)||offset<0||offset>1000000000)throw Error('Tapisan atau halaman tidak sah.');
 return {...f,_model:b.model==null?null:b.model.trim(),_variant:exact(b.variant,120),_colour:exact(b.colour,80),_bucket:bucket,_offset:offset};
}
