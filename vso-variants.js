(function(){
"use strict";
// Source: supplied VSO.zip and subsequent PHEV reference PDFs, stripped of customer details. Prices are document examples, not verified live quotes.
const list = Object.freeze([
  {
    "id": "EMAS5_PRIME_2026",
    "display": "Proton e.MAS 5 Prime — 2026",
    "model": "e.Mas 5 Prime",
    "year": 2026,
    "baseOtr": 62600,
    "baseNet": 59322,
    "fees": {
      "handling": 200,
      "plate": 98,
      "registration": 300,
      "roadTax": 30,
      "claim": 50,
      "insurance": 2600,
      "accessory": null,
      "gst": null
    },
    "source": "VS0 eMAS 5 Prime .pdf"
  },
  {
    "id": "EMAS5_PREMIUM_2026",
    "display": "Proton e.MAS 5 Premium — 2026",
    "model": "e.Mas 5 Premium",
    "year": 2026,
    "baseOtr": 75800,
    "baseNet": 72092,
    "fees": {
      "handling": 200,
      "plate": 98,
      "registration": 300,
      "roadTax": 60,
      "claim": 50,
      "insurance": 3000,
      "accessory": null,
      "gst": 0
    },
    "source": "VSO Markup 90% / Tanpa Markup — rujukan sedia ada"
  },
  {
    "id": "EMAS7_PREMIUM_2026",
    "display": "Proton e.MAS 7 Premium — 2026",
    "model": "e.Mas 7 Premium",
    "year": 2026,
    "baseOtr": 123400,
    "baseNet": 119172,
    "fees": {
      "handling": null,
      "plate": 98,
      "registration": 300,
      "roadTax": 180,
      "claim": 50,
      "insurance": 3600,
      "accessory": null,
      "gst": null
    },
    "source": "VS0 - eMAS 7 Premium .pdf"
  },
  {
    "id": "EMAS7_PREMIUM_PLUS_2026",
    "display": "Proton e.MAS 7 Premium Plus — 2026",
    "model": "e.Mas 7 Premium Plus",
    "year": 2026,
    "baseOtr": 129659,
    "baseNet": 125172,
    "fees": {
      "handling": null,
      "plate": 98,
      "registration": 300,
      "roadTax": 180,
      "claim": 50,
      "insurance": 3859,
      "accessory": null,
      "gst": null
    },
    "source": "VS0 -  eMAS 7 Premium Plus.pdf"
  },
  {
    "id": "EMAS7_PHEV_PRIME_2026",
    "display": "Proton e.MAS 7 PHEV Prime — 2026",
    "model": "e.Mas 7 PHEV Prime",
    "year": 2026,
    "baseOtr": 113611,
    "baseNet": 109430,
    "fees": {
      "handling": null,
      "plate": 50,
      "registration": 150,
      "roadTax": 120,
      "claim": 50,
      "insurance": 3811,
      "accessory": 0,
      "gst": 0
    },
    "source": "VSO - PHEV PRIME.pdf"
  },
  {
    "id": "EMAS7_PHEV_PREMIUM_2026",
    "display": "Proton e.MAS 7 PHEV Premium — 2026",
    "model": "e.Mas 7 PHEV Premium",
    "year": 2026,
    "baseOtr": 127995,
    "baseNet": 123430,
    "fees": {
      "handling": null,
      "plate": 50,
      "registration": 150,
      "roadTax": 120,
      "claim": 50,
      "insurance": 4195,
      "accessory": 0,
      "gst": 0
    },
    "source": "VSO - PHEV Premium.pdf"
  },
  {
    "id": "EMAS7_PHEV_PREMIUM_PLUS_2026",
    "display": "Proton e.MAS 7 PHEV Premium Plus — 2026",
    "model": "e.Mas 7 PHEV PREMIUM PLUS",
    "year": 2026,
    "baseOtr": 134159,
    "baseNet": 129230,
    "fees": {
      "handling": 200,
      "plate": 50,
      "registration": 150,
      "roadTax": 120,
      "claim": 50,
      "insurance": 4359,
      "accessory": 0,
      "gst": 0
    },
    "source": "VSO - PHEV Premium Plus.pdf"
  }
].map(v=>Object.freeze({...v,fees:Object.freeze(v.fees)})));
const byId=Object.fromEntries(list.map(v=>[v.id,v]));
const get=id=>byId[id]||byId.EMAS5_PREMIUM_2026;
const charges=v=>Object.entries(v.fees).reduce((total,[key,num])=>total+(key==="gst"||!Number.isFinite(num)?0:num),0);
const calculate=(amount,kind="AUTO",variantId="EMAS5_PREMIUM_2026")=>{
 const v=get(variantId),loan=Number(amount),loanCents=Math.round(loan*100),anchorCents=Math.round(v.baseOtr*100),feeTotal=charges(v);
 const valid=Number.isSafeInteger(loanCents)&&loanCents>=0&&Number.isSafeInteger(loanCents*10);
 const adjusted=valid&&loanCents*10>anchorCents*9;
 const otrCents=valid?(adjusted?Math.round(loanCents*10/9):anchorCents):NaN;
 const otr=otrCents/100,net=(otrCents-Math.round(feeTotal*100))/100;
 return {variant:v,loan,otr,net,feeTotal,baseOtr:v.baseOtr,baseNet:v.baseNet,anchorPrice:v.baseOtr,loanLimit:anchorCents*9/1000,adjusted,kind};
};
// Presentation only: the OTR/90% calculation above remains the source of truth.
const present=(result,placement='NET',insurance)=>{
 const accessoriesMode=placement==='ACCESSORIES';
 const extraCents=accessoriesMode&&Number.isFinite(result.otr)?Math.max(0,Math.round(result.otr*100)-Math.round(result.anchorPrice*100)):0;
 const templateFees=result.variant.fees;
 const fees=insurance==null?templateFees:{...templateFees,insurance};
 const feeCents=Math.round(charges({fees})*100);
 return {...result,placement:accessoriesMode?'ACCESSORIES':'NET',accessoriesExcess:extraCents/100,
  fees,feeTotal:feeCents/100,net:(Math.round(result.otr*100)-feeCents-extraCents)/100};
};
const norm=value=>String(value??'').toLowerCase().replace(/[^a-z0-9]/g,'');
const vehicleVariants=list.map(v=>({
 ...v,
 family:v.id.startsWith('EMAS5')?'e.MAS 5':v.id.includes('PHEV')?'e.MAS 7 PHEV':'e.MAS 7 EV',
 grade:v.model.match(/(Premium Plus|Premium|Prime)$/i)?.[0]||''
}));
function match(model,grade=''){
 const name=norm(model).replace(/^proton/,'').replace(/20[0-9]{2}$/,'');
 const family=name==='emas7'?'emas7ev':name;
 return vehicleVariants.find(v=>
  norm(v.family)===family&&norm(v.grade)===norm(grade) ||
  (norm(v.model)===name||norm(v.family+v.grade)===name)&&(!grade||norm(v.grade)===norm(grade))
 );
}
function customerQuote(previous,patch){
 const updated={...previous,...patch};
 const vehicle=match(updated.model,updated.variant);
 const changedVehicle=vehicle?.id!==match(previous.model,previous.variant)?.id;
 if(changedVehicle&&vehicle){
  if(!('selling_price' in patch))patch.selling_price=vehicle.baseNet;
  if(!('vehicle_year' in patch))patch.vehicle_year=String(vehicle.year);
  if(!('insurance_amount' in patch))patch.insurance_amount=null;
 }
 const insurance=patch.insurance_amount!==undefined?patch.insurance_amount:updated.insurance_amount;
 const quote=vehicle?vehicle.baseOtr+Number(insurance??vehicle.fees.insurance??0)-Number(vehicle.fees.insurance??0):updated.otr_price;
 const adjust=['deposit','rebate_amount','insurance_amount','otr_price','selling_price'].some(key=>key in patch);
 if(!('loan_amount' in patch)&&quote!=null&&(adjust||changedVehicle&&(updated.deposit!=null||updated.rebate_amount!=null))){
  patch.loan_amount=Math.max(0,Math.round((quote-Number(updated.deposit||0)-Number(updated.rebate_amount||0))*100)/100);
 }
 if(vehicle&&('loan_amount' in patch||changedVehicle||updated.otr_price==null)&&!('otr_price' in patch)){
  const result=calculate(Number(patch.loan_amount??updated.loan_amount??0),'AUTO',vehicle.id);
  if(Number.isFinite(result.otr))patch.otr_price=result.otr;
 }
 return patch;
}
window.VSO_VARIANTS=Object.freeze({list,get,charges,calculate,present,match,vehicleVariants,customerQuote});
})();
