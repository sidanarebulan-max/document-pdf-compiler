/* FARIS R+PROTON - mobile-only client-side navigation.
 * Data actions stay in existing staff-passcode.js / telegram-hub.js.
 * This module only changes visibility, never permissions or saved data. */
(()=>{
 "use strict";
 const $=id=>document.getElementById(id);
 const mobile=window.matchMedia("(max-width:780px)");
 const views={
  home:[".welcome","#mobileHomeActions",".metrics"],
  leads:["#leadsPanel"],
  tools:["#staffWorkflow"],
  settings:["#mobileSettingsHub","#messageSettingsPanel","#telegramPanel"],
  admin:["#adminPanel"]
 };
 let active="home";
 const all=[...new Set(Object.values(views).flat())];
 function adminReady(){return $("currentRole")?.textContent?.trim()==="ADMIN"}
 function loggedIn(){return !!$("appSection")&&!$("appSection").classList.contains("hide")}
 function navTo(next,scroll=true){
  if(!views[next])next="home";
  if(next==="admin"&&!adminReady())next="home";
  active=next;
  const app=$("appSection");if(!app)return;
  for(const selector of all){
   const element=app.querySelector(selector);
   if(!element)continue;
   const show=views[next].includes(selector);
   element.classList.toggle("mobile-screen-off",!show);
  }
  document.querySelectorAll("#mobileDock button[data-mobile-nav]").forEach(button=>{
   const selected=button.dataset.mobileNav===next;
   button.setAttribute("aria-current",selected?"page":"false");
  });
  const title={home:"Utama",leads:"Senarai Lead",tools:"Dokumen & VSO",
    settings:"Tetapan",admin:"Admin"}[next];
  $("mobileViewTitle").textContent=title;
  if(scroll&&mobile.matches)window.scrollTo({top:0,behavior:"smooth"});
 }
 function sync(){
  if(!$("mobileDock"))return;
  const inSession=loggedIn();
  $("mobileDock").classList.toggle("hide",!inSession);
  $("mobileAdminNav").classList.toggle("hide",!adminReady());
  if(inSession)navTo(active,false);
  else active="home";
 }
 function openPanel(panelId,triggerId){
  navTo("settings");
  const panel=$(panelId),trigger=$(triggerId);
  if(panel&&panel.classList.contains("hide")&&trigger)trigger.click();
  requestAnimationFrame(()=>panel?.scrollIntoView({behavior:"smooth",block:"start"}));
 }
 function buildAdminShortcuts(){
  const panel=$("adminPanel"),grid=panel?.querySelector(".admin-grid");
  if(!grid||$("mobileAdminShortcuts"))return;
  const labels=["Cipta Staf","Tambah Nombor","Import Lead","Senarai Staf","Akaun"];
  const items=[...grid.querySelectorAll(":scope > .innerpanel")];
  const bar=document.createElement("div");bar.id="mobileAdminShortcuts";
  bar.className="admin-mobile-shortcuts mobile-only";
  items.forEach((item,index)=>{
   item.id=item.id||"mobileAdminSection"+index;
   const button=document.createElement("button");
   button.type="button";button.className="secondary";
   button.textContent=labels[index]||"Bahagian "+(index+1);
   button.addEventListener("click",()=>item.scrollIntoView({behavior:"smooth",block:"start"}));
   bar.appendChild(button);
  });
  grid.before(bar);
 }
 function init(){
  if(!$("appSection")||!$("mobileDock"))return;
  buildAdminShortcuts();
  document.querySelectorAll("[data-mobile-nav]").forEach(button=>
   button.addEventListener("click",()=>navTo(button.dataset.mobileNav)));
  $("mobileGoLeads")?.addEventListener("click",()=>navTo("leads"));
  $("mobileGoDocs")?.addEventListener("click",()=>navTo("tools"));
  $("mobileGoSettings")?.addEventListener("click",()=>navTo("settings"));
  $("mobileOpenMessages")?.addEventListener("click",()=>openPanel("messageSettingsPanel","messageSettingsBtn"));
  $("mobileOpenTelegram")?.addEventListener("click",()=>openPanel("telegramPanel","telegramSettingsBtn"));
  // Existing header shortcuts still work, but switch to Settings view on phones.
  for(const id of ["messageSettingsBtn","telegramSettingsBtn"]){
   $(id)?.addEventListener("click",()=>{
    if(mobile.matches&&loggedIn())navTo("settings",false);
   });
  }
  const observer=new MutationObserver(()=>sync());
  observer.observe($("appSection"),{attributes:true,attributeFilter:["class"]});
  observer.observe($("adminPanel"),{attributes:true,attributeFilter:["class"]});
  mobile.addEventListener?.("change",()=>sync());
  sync();
 }
 document.addEventListener("DOMContentLoaded",init);
})();
