/* Shared appearance only. Existing account/session handling is untouched. */
(()=>{
'use strict';
const KEY='faris_lead_hub_theme_v1',valid=t=>['auto','light','dark'].includes(t);
let preference='auto';try{const stored=localStorage.getItem(KEY);if(valid(stored))preference=stored}catch{}
const media=typeof matchMedia==='function'?matchMedia('(prefers-color-scheme: dark)'):null;
function apply(){
 const resolved=preference==='auto'?(media?.matches?'dark':'light'):preference,root=document.documentElement;
 root.dataset.theme=resolved;root.dataset.iosTheme=resolved;root.dataset.iosAppearance=preference;
 const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=resolved==='light'?'#f1f2f8':'#10131d';
 document.querySelectorAll('[data-theme-choice]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.themeChoice===preference)));
 document.dispatchEvent(new CustomEvent('faris:themechange',{detail:{preference,resolved}}));
}
function setTheme(value){if(!valid(value))return false;preference=value;try{localStorage.setItem(KEY,value)}catch{}apply();return true}
window.FARIS_APPEARANCE=Object.freeze({setTheme,getTheme:()=>preference,refresh:apply});
if(media?.addEventListener)media.addEventListener('change',()=>{if(preference==='auto')apply()});
window.addEventListener('storage',e=>{if(e.key===KEY||e.key===null){preference=valid(e.newValue)?e.newValue:'auto';apply()}});
document.addEventListener('click',e=>{const b=e.target.closest('[data-theme-choice]');if(b)setTheme(b.dataset.themeChoice)});
document.addEventListener('DOMContentLoaded',apply);apply();
})();
