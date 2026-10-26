(()=>{
"use strict";
const pages=new Set(["home","whatsapp","docs","telegram","settings"]);
let account=null,current="whatsapp";
const $=id=>document.getElementById(id);
function show(page,{scroll=true,updateHash=true}={}){
 if(!account||!pages.has(page))return false;
 current=page;
 document.querySelectorAll("[data-workspace-page]").forEach(panel=>{
  const selected=panel.dataset.workspacePage===page;
  panel.hidden=!selected;panel.classList.toggle("hide",!selected);
  panel.setAttribute("aria-hidden",String(!selected));
 });
 document.querySelectorAll("[data-workspace-nav],[data-mobile-nav]").forEach(button=>{
  const selected=(button.dataset.workspaceNav||button.dataset.mobileNav)===page;
  if(selected)button.setAttribute("aria-current","page");
  else button.removeAttribute("aria-current");
 });
 if(updateHash&&location.hash!=="#"+page)history.replaceState(null,"","#"+page);
 if(page==="telegram"){
  $("telegramPanel").classList.remove("hide");
  window.FARIS_TG?.onShow?.();
 }
 if(scroll)$("workspace-"+page)?.scrollIntoView({behavior:"instant",block:"start"});
 return true;
}
function fromHash(){const value=location.hash.slice(1);return pages.has(value)?value:"whatsapp"}
window.FARIS_NAV={show,
 onLogin(user){
  account=user;
  document.querySelectorAll("[data-admin-only]").forEach(el=>el.classList.toggle("hide",user.role!=="admin"));
  $("accessName").textContent=user.display_name;
  $("accessCode").textContent=user.staff_code;
  $("accessRole").textContent=user.role==="admin"?"Admin":"Staf";
  $("accessHelp").textContent=user.role==="admin"
   ?"Urus ID, passcode dan akses pasukan melalui borang di bawah."
   :"Jika terlupa atau mahu reset passcode, hubungi admin. Passcode tidak dipaparkan semula.";
  show(fromHash(),{scroll:false,updateHash:false});
 },
 onLogout(){
  account=null;
  for(const id of ["accessName","accessCode","accessRole"])$(id).textContent="";
  document.querySelectorAll("[data-workspace-page]").forEach(el=>{
   el.hidden=true;el.classList.add("hide");el.setAttribute("aria-hidden","true");
  });
 },
 current:()=>current
};
document.addEventListener("DOMContentLoaded",()=>{
 document.addEventListener("click",event=>{
  const button=event.target.closest("[data-workspace-nav],[data-mobile-nav]");
  if(button)show(button.dataset.workspaceNav||button.dataset.mobileNav);
 });
 window.addEventListener("hashchange",()=>show(fromHash(),{updateHash:false}));
});
})();
