const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=()=>import('../supabase/functions/lead-hub-inbox/validation.mjs');
const id='11111111-1111-4111-8111-111111111111';
test('files are checked by content and unsupported executable formats rejected',async()=>{
 const {fileInfo}=await load();
 assert.equal(fileInfo('bank.txt',Buffer.from('Statement')).mime,'text/plain');
 assert.equal(fileInfo('a.pdf',Buffer.from('%PDF-1.4\n')).mime,'application/pdf');
 assert.throws(()=>fileInfo('fake.pdf',Buffer.from('not a PDF')),/Kandungan/);
 assert.throws(()=>fileInfo('a.html',Buffer.from('<script>')),/Format/);
 assert.throws(()=>fileInfo('zero.txt',Buffer.alloc(0)),/20 MB/);
});
test('filenames cannot inject paths and per-file size is enforced',async()=>{
 const {fileInfo,MAX_FILE}=await load();
 assert.equal(fileInfo('../../bank.txt',Buffer.from('data')).name,'.._.._bank.txt');
 assert.throws(()=>fileInfo('large.txt',Buffer.alloc(MAX_FILE+1)),/20 MB/);
});
test('assignment validates party-specific categories, phone and IDs',async()=>{
 const {assignment}=await load();
 const values=assignment({ids:[id,id],customer_name:'Ahmad',customer_phone:'0123456789',party:'HIRER',category:'BANK'});
 assert.equal(values.ids.length,1);assert.equal(values.customer_phone,'60123456789');
 assert.throws(()=>assignment({ids:[id],customer_name:'Ahmad',party:'REBATE',category:'BANK'}),/kategori/);
 assert.throws(()=>assignment({ids:['invalid'],customer_name:'Ahmad'}),/Pilih/);
 assert.throws(()=>assignment({ids:[id],customer_name:'A'}),/nama/);
 assert.throws(()=>assignment({ids:[id],customer_name:'Ahmad',customer_phone:'123'}),/Nombor/);
});
