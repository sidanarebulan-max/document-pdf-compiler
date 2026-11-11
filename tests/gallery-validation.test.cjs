const test=require('node:test'),assert=require('node:assert/strict');
const mod=import('../supabase/functions/lead-hub-gallery/validation.mjs');
test('gallery catalogue accepts model-specific variants and rejects incompatible tags',async()=>{
 const {metadata,catalogue}=await mod;
 const tags={variant:'premium_plus',colour:'pink',view:'front'};
 assert.deepEqual(catalogue('emas7_phev',tags),{...tags,poster_type:null});
 assert.deepEqual(catalogue('emas7_ev',tags),{...tags,poster_type:null});
 assert.equal(metadata({model:'emas5',title:'Dalaman',variant:'prime',view:'interior'}).variant,'prime');
 assert.equal(metadata({model:'poster_posting',title:'Poster',poster_type:'car'}).poster_type,'car');
 for(const [model,invalid] of [
  ['emas7_ev',{variant:'prime'}],
  ['emas5',{variant:'premium_plus'}],
  ['emas5',{colour:'p!nk'}],
  ['emas7_phev',{view:'unknown'}],
  ['poster_posting',{variant:'premium'}],
  ['emas5',{poster_type:'car'}]
 ])assert.throws(()=>catalogue(model,invalid));
});
test('gallery accepts car and poster categories and bounded titles',async()=>{const {metadata}=await mod;assert.deepEqual(metadata({model:'emas7_phev',title:'  Pilihan Warna  '}),{model:'emas7_phev',title:'Pilihan Warna',variant:null,colour:null,view:null,poster_type:null});assert.equal(metadata({model:'emas5'},'Brosur').title,'Brosur');assert.deepEqual(metadata({model:'poster_posting',title:' Tips Kereta '}),{model:'poster_posting',title:'Tips Kereta',variant:null,colour:null,view:null,poster_type:null});assert.equal(metadata({model:'poster_posting'},'Poster Story').title,'Poster Story');for(const b of [{model:'all',title:'Test'},{model:'poster',title:'Test'},{model:'emas5',title:'x'.repeat(121)},{model:'emas7_ev',title:' '}])assert.throws(()=>metadata(b))});
test('gallery rejects spoofed image extensions, documents and oversized images',async()=>{const {imageInfo,MAX_FILE}=await mod;const png=Uint8Array.from([137,80,78,71,13,10,26,10,1]);assert.equal(imageInfo('warna.png',png).mime_type,'image/png');assert.throws(()=>imageInfo('warna.jpg',png));assert.throws(()=>imageInfo('data.svg',png));assert.throws(()=>imageInfo('data.pdf',png));assert.throws(()=>imageInfo('x.png',new Uint8Array(MAX_FILE+1)));assert.throws(()=>imageInfo('x.png',new Uint8Array()))});
