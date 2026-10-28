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
window.VSO_VARIANTS=Object.freeze({list,get,charges,calculate});
})();
