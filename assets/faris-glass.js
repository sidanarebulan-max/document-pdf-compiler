/* Presentation adapter. Uses existing routes and actions; no account or business data. */
(()=>{
'use strict';
const paths={"dashboard": "<rect x=\"3\" y=\"3\" width=\"7\" height=\"7\" rx=\"2\"/><rect x=\"14\" y=\"3\" width=\"7\" height=\"7\" rx=\"2\"/><rect x=\"3\" y=\"14\" width=\"7\" height=\"7\" rx=\"2\"/><rect x=\"14\" y=\"14\" width=\"7\" height=\"7\" rx=\"2\"/>", "users": "<path d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75\"/><circle cx=\"9\" cy=\"7\" r=\"4\"/>", "files": "<path d=\"M14 2H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z\"/><path d=\"M14 2v6h6M8 12h8m-8 4h5\"/>", "bank": "<path d=\"M3 10h18M5 10v9m5-9v9m4-9v9m5-9v9M3 21h18M2 7l10-5 10 5v3H2z\"/>", "vso": "<path d=\"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8m-8 4h5\"/>", "chat": "<path d=\"M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z\"/>", "settings": "<path d=\"M12 8v8M8 12h8\"/><circle cx=\"12\" cy=\"12\" r=\"9\"/>", "theme": "<path d=\"M12 3v1m0 16v1M3 12h1m16 0h1M5.6 5.6l.7.7m11.4 11.4.7.7m0-12.8-.7.7M6.3 17.7l-.7.7\"/><circle cx=\"12\" cy=\"12\" r=\"4\"/>", "info": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 11v6m0-10h.01\"/>", "close": "<path d=\"M6 6l12 12M18 6 6 18\"/>", "check": "<path d=\"m5 12 4 4L19 6\"/>", "arrow": "<path d=\"M7 17 17 7M7 7h10v10\"/>", "chevron": "<path d=\"m9 5 7 7-7 7\"/>", "back": "<path d=\"m15 5-7 7 7 7\"/>", "clock": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 7v5l3 2\"/>", "car": "<path d=\"m5 7 2-4h10l2 4M5 7h14a2 2 0 0 1 2 2v8H3V9a2 2 0 0 1 2-2zM5 17v3m14-3v3M6 12h2m8 0h2\"/>", "repeat": "<path d=\"m17 2 4 4-4 4M3 11V8a2 2 0 0 1 2-2h16M7 22l-4-4 4-4m14-1v3a2 2 0 0 1-2 2H3\"/>", "search": "<circle cx=\"10.5\" cy=\"10.5\" r=\"7.5\"/><path d=\"m16 16 5 5\"/>", "plus": "<path d=\"M12 5v14M5 12h14\"/>", "upload": "<path d=\"M12 16V3m-5 5 5-5 5 5M4 16v4h16v-4\"/>", "more": "<circle cx=\"5\" cy=\"12\" r=\"1\"/><circle cx=\"12\" cy=\"12\" r=\"1\"/><circle cx=\"19\" cy=\"12\" r=\"1\"/>", "send": "<path d=\"m22 2-7 20-4-9-9-4 20-7zM22 2 11 13\"/>", "empty": "<path d=\"M3 7h18v14H3zM3 7l4-5h10l4 5M3 14h5l2 3h4l2-3h5\"/>", "download": "<path d=\"M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4\"/>"};
const pageIcons={home:'dashboard',gallery:'car',whatsapp:'whatsapp',customers:'users',docs:'files',telegram:'send',settings:'settings'};
function icon(name){if(name==='whatsapp')return '<span class="faris-whatsapp-logo" aria-hidden="true"></span>';return '<svg class="faris-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[name]||paths.files)+'</svg>'}
function decorate(button){const page=button.dataset.workspaceNav||button.dataset.mobileNav,el=button.querySelector('span[aria-hidden]');if(el)el.innerHTML=icon(pageIcons[page]||'files')}
function themeControl(){
 const el=document.createElement('div');el.className='theme-switch';el.setAttribute('role','group');el.setAttribute('aria-label','Pilih warna paparan');
 for(const [key,label,symbol] of [['auto','Auto','◐'],['light','Light','☀'],['dark','Dark','☾']]){const b=document.createElement('button');b.type='button';b.className='theme-choice';b.dataset.themeChoice=key;b.setAttribute('aria-label',key==='auto'?'Ikut tema peranti':'Aktifkan '+label+' Mode');b.innerHTML=symbol+' <span>'+label+'</span>';el.append(b)}
 return el;
}
function staffShell(){
 const app=document.getElementById('appSection'),dock=document.getElementById('mobileDock');if(!app||!dock)return;
 document.querySelectorAll('[data-workspace-nav],[data-mobile-nav]').forEach(decorate);
 const more=document.createElement('dialog');more.className='faris-more-dialog';more.id='farisMoreDialog';more.setAttribute('aria-labelledby','farisMoreTitle');
 more.innerHTML='<div class="faris-more-head"><h2 id="farisMoreTitle">Lagi</h2><button type="button" class="secondary" aria-label="Tutup menu">✕</button></div><div class="faris-more-items"></div>';
 const list=more.querySelector('.faris-more-items');
 for(const page of ['gallery','telegram','settings']){const b=dock.querySelector('[data-mobile-nav="'+page+'"]');if(b){b.dataset.workspaceNav=page;delete b.dataset.mobileNav;b.classList.add('secondary');list.append(b)}}
 const ordered=['home','customers','docs','whatsapp'].map(p=>dock.querySelector('[data-mobile-nav="'+p+'"]')).filter(Boolean);ordered.forEach(b=>dock.append(b));
 const trigger=document.createElement('button');trigger.type='button';trigger.id='farisMoreButton';trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-controls',more.id);trigger.setAttribute('aria-expanded','false');trigger.innerHTML='<span aria-hidden="true">'+icon('more')+'</span><small>Lagi</small>';dock.append(trigger);app.append(more);
 trigger.addEventListener('click',()=>{if(!more.open){more.showModal();trigger.setAttribute('aria-expanded','true')}});
 more.querySelector('.faris-more-head button').addEventListener('click',()=>more.close());
 more.addEventListener('click',e=>{if(e.target.closest('[data-workspace-nav]'))more.close()});
 more.addEventListener('close',()=>trigger.setAttribute('aria-expanded','false'));
 const sync=()=>{const current=document.querySelector('#workspaceNav [aria-current="page"]')?.dataset.workspaceNav;if(['gallery','telegram','settings'].includes(current)){if(trigger.getAttribute('aria-current')!=='page')trigger.setAttribute('aria-current','page')}else if(trigger.hasAttribute('aria-current'))trigger.removeAttribute('aria-current');if(app.classList.contains('hide')&&more.open)more.close()};
 new MutationObserver(sync).observe(app,{subtree:true,attributes:true,attributeFilter:['class','aria-current']});sync();
}
function start(){
 staffShell();const nav=document.getElementById('mainWorkspaceNav');if(nav&&!nav.querySelector('.theme-switch'))nav.append(themeControl());
 window.FARIS_APPEARANCE?.refresh();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
