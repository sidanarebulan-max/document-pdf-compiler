/* Ceria theme motion: KPI numbers count up and each tile shows its share of the filtered total.
   Presentation only; it never changes data, filters or requests. Final text always equals the original. */
(()=>{
'use strict';
const active=()=>document.documentElement.dataset.palette==='ceria';
const calm=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
const parse=s=>{const n=Number(String(s).replace(/[^\d.-]/g,''));return Number.isFinite(n)?n:0};
function countUp(el){
 const final=el.textContent,target=parse(final);if(!target||calm())return;
 const fmt=new Intl.NumberFormat('en-US'),start=performance.now(),ms=Math.min(1100,450+target*4);
 const step=now=>{if(!el.isConnected)return;const t=Math.min(1,(now-start)/ms),e=1-Math.pow(1-t,3);
  if(t<1){el.textContent=fmt.format(Math.round(target*e));requestAnimationFrame(step)}else el.textContent=final};
 el.textContent='0';requestAnimationFrame(step);
}
function enhance(){
 if(!active())return;
 const result=document.getElementById('customerInsightsResult'),grid=result?.querySelector('.insights-kpis');
 if(!grid||grid.dataset.ceria==='1')return;grid.dataset.ceria='1';
 const total=parse(result.querySelector('.insights-meta b')?.textContent)||0;
 grid.querySelectorAll('.insights-kpi').forEach(card=>{
  const strong=card.querySelector('strong');if(!strong)return;
  const value=parse(strong.textContent),pct=total?Math.max(0,Math.min(100,value/total*100)):0;
  const bar=document.createElement('span');bar.className='ceria-kpi-share';bar.setAttribute('aria-hidden','true');
  bar.title=Math.round(pct)+'% daripada jumlah';bar.innerHTML='<i></i>';strong.after(bar);
  requestAnimationFrame(()=>requestAnimationFrame(()=>{bar.firstChild.style.width=pct.toFixed(1)+'%'}));
  countUp(strong);
 });
}
function start(){
 const result=document.getElementById('customerInsightsResult');
 if(result)new MutationObserver(enhance).observe(result,{childList:true});
 document.addEventListener('faris:themechange',()=>{
  if(!active())return;const grid=document.querySelector('#customerInsightsResult .insights-kpis');
  if(grid&&grid.dataset.ceria!=='1')enhance();
 });
 enhance();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
