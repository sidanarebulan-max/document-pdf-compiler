(function(root, factory){
 const catalogue = factory();
 if(typeof module==='object' && module.exports) module.exports=catalogue;
 else root.FARIS_CUSTOMER_CATALOGUE=catalogue;
})(globalThis,function(){
 'use strict';

 // Faris Proton model and bank reference PDFs, 26 November 2026.
 // Colours are model-level brochure palettes.
 const vehicles = [
  {model:'e.MAS 5',name:'Proton e.MAS 5',
   variants:['Prime','Premium'],
   colours:['Jade Green','Marble Cream','Quartz Rose','Graphite Silver','Slate Grey']},
  {model:'e.MAS 7 EV',name:'Proton e.MAS 7 EV',aliases:['e.MAS 7'],
   variants:['Prime','Premium','Premium Plus'],
   colours:['Lithium White','Turquoise Green','Slate Grey','Platinum Silver','Quartz Rose','Obsidian Black']},
  {model:'e.MAS 7 PHEV',name:'Proton e.MAS 7 PHEV',
   variants:['Prime','Premium','Premium Plus'],
   colours:['Aquamarine Blue','Obsidian Black','Galena Grey','Lithium White','Mercury Silver','Emerald Green']},
  {model:'Proton Saga',name:'Proton Saga',aliases:['Saga MC3','All-New Saga'],
   variants:['1.5 Standard','1.5 Executive','1.5 Premium'],
   colours:['Marine Blue','Space Grey','Ruby Red','Armour Silver','Snow White']},
  {model:'Proton S70',name:'Proton S70',
   variants:['1.5 Lite','1.5 Prime','1.5TD Premium','1.5TD Flagship','1.5TD Flagship X'],
   colours:['Quartz Black','Space Grey','Snow White','Marine Blue','Armour Silver']},
  {model:'Proton X50',name:'Proton X50',
   variants:['1.5TD Executive','1.5TD Premium','1.5TD Flagship'],
   colours:['Armour Silver','Snow White','Jet Grey','Quartz Black','Teal Bayou Green']},
  {model:'Proton X70',name:'Proton X70',
   variants:['1.5TD Executive','1.5TD Premium'],
   colours:['Snow White','Armour Silver','Jet Grey','Marine Blue']},
  {model:'Proton X90',name:'Proton X90',
   variants:['1.5TD Lite','1.5TD Prime','1.5TD Prime X'],
   colours:['Quartz Black','Marine Blue','Armour Silver','Snow White','Jet Grey']}
 ];
 const banks = [
  ['Affin Bank Berhad'],
  ['Affin Islamic Bank Berhad'],
  ['AmBank (M) Berhad'],
  ['AmBank Islamic Berhad'],
  ['Bank Islam Malaysia Berhad'],
  ['Bank Muamalat Malaysia Berhad'],
  ['Bank Kerjasama Rakyat Malaysia Berhad','Bank Rakyat — Bank Kerjasama Rakyat Malaysia Berhad'],
  ['Bank Simpanan Nasional','BSN — Bank Simpanan Nasional'],
  ['CIMB Bank Berhad'],
  ['CIMB Islamic Bank Berhad'],
  ['Hong Leong Bank Berhad'],
  ['Hong Leong Islamic Bank Berhad'],
  ['Malayan Banking Berhad','Maybank — Malayan Banking Berhad'],
  ['Maybank Islamic Berhad'],
  ['MBSB Bank Berhad','MBSB Bank Berhad — Lembah Klang sahaja'],
  ['Public Bank Berhad'],
  ['Public Islamic Bank Berhad'],
  ['RHB Bank Berhad'],
  ['RHB Islamic Bank Berhad']
 ];

 const normalized = value => String(value??'').toLowerCase().replace(/[^a-z0-9]/g,'').replace(/^proton/,'');
 const namedVehicle = new Map();
 for (const vehicle of vehicles) {
  for (const name of [vehicle.model,...(vehicle.aliases||[])]) {
   namedVehicle.set(normalized(name),vehicle);
   for (const variant of vehicle.variants) namedVehicle.set(normalized(name+variant),vehicle);
  }
 }
 function vehicleFor(model){
  return namedVehicle.get(normalized(model));
 }
 function optionsWithSaved(choices, saved){
  const options = choices.map(choice => Array.isArray(choice) ? [choice[0],choice[1]||choice[0]] : [choice,choice]);
  if(saved && !options.some(([value])=>value===saved)) options.push([saved,saved+' (rekod sedia ada)']);
  return options;
 }
 function selectionAfterModelChange(previous, model, variant, colour){
  const vehicle = vehicleFor(model);
  const sameVehicle = vehicle && vehicle===vehicleFor(previous);
  return {
   model,
   variant:sameVehicle ? variant : '',
   colour:sameVehicle ? colour : ''
  };
 }
 return {vehicles,banks,vehicleFor,optionsWithSaved,selectionAfterModelChange};
});
