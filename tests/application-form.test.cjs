const assert=require('node:assert/strict'),fs=require('node:fs');
const core=require('../application-form-core'),PDFLib=require('pdf-lib'),fontkit=require('../assets/vendor/fontkit-1.1.1.umd.min.js');
const fixture=`APPLICATION FORM
MAKLUMAT PEMOHON
Nama : Nor Farah
I/C No : 000101010001
Alamat Tetap : No 12 Jalan Ujian
Bandar Contoh 40000 Selangor
No HP : 0100000001
Email : nor@example.test
Nama ibu : Ibu Contoh
MAKLUMAT PEKERJAAN
Nama Majikan (nama syarikat) : Syarikat Contoh
Alamat tempat kerja: No 3 Jalan Pejabat
No Tel : 0300000000
Jawatan : Eksekutif
Department :
Lantikan : TETAP
Skop kerja :
Skop syarikat :
MAKLUMAT PASANGAN (jika berkahwin)
Nama : Pasangan Contoh
I/C No : 000101010002
No HP : 0100000002
Majikan pasangan : Majikan Pasangan
Jawatan : Pengurus
Pendapatan bulanan : RM4,600
RUJUKAN (Mak/ayah/adik beradik/keluarga terdekat)
Nama : Rujukan Contoh
Alamat : Jalan Rujukan
No HP : 0100000003
Hubungan : Kakak
MAKLUMAT PEMBIAYAAN
Model kereta : e.MAS 5 Premium
Warna kereta : Hijau
Tempoh pinjaman : 9 Tahun`;
module.exports={fixture};
if(require.main===module)(async()=>{
 const p=core.parse(fixture);assert.equal(p.unparsed.length,0);assert.equal(p.conflicts.length,0);
 for(const [id,value] of Object.entries({applicant_name:'Nor Farah',spouse_name:'Pasangan Contoh',reference_name:'Rujukan Contoh',applicant_phone:'0100000001',spouse_phone:'0100000002',employment_position:'Eksekutif',spouse_position:'Pengurus',employment_department:'',employment_job_scope:'',financing_term:'9 Tahun'}))assert.equal(p.values[id],value);
 assert.equal(p.values.applicant_permanent_address,'No 12 Jalan Ujian Bandar Contoh 40000 Selangor');
 const table=core.parse('MAKLUMAT PEMOHON\nNama\tNor Farah\nNo HP\t0100000001\nMAKLUMAT PEKERJAAN\nNama Majikan\nContoh Sdn Bhd\nMAKLUMAT RUJUKAN\nNama : Rujukan');assert.equal(table.values.employment_employer,'Contoh Sdn Bhd');assert.equal(table.values.reference_name,'Rujukan');
 const conflict=core.parse('Nama: First\nNama: Second');assert.equal(conflict.values.applicant_name,'First');assert.deepEqual(conflict.conflicts,['applicant_name']);
 const unknown=core.parse('Nama: Pemohon\nMAKLUMAT PENJAMIN\nNama: Bukan Pemohon\nData baharu: Jangan teka');assert.equal(unknown.values.applicant_name,'Pemohon');assert.equal(unknown.unparsed.length,3);
 assert.deepEqual(core.parse('Nama: Customer Baharu').values,{applicant_name:'Customer Baharu'});
 const assets={PDFLib,fontkit,fontBytes:fs.readFileSync('assets/application-form/CanvaSans-Regular.ttf'),titleBytes:fs.readFileSync('assets/application-form/title.png')};
 const out=await core.buildPdf({...assets,values:p.values});assert.equal(out.pages,2);const doc=await PDFLib.PDFDocument.load(out.bytes);assert.equal(doc.getPageCount(),2);assert.equal(doc.getTitle(),'Application Form');
 const long={...p.values,applicant_permanent_address:'Alamat sangat panjang '.repeat(90),employment_job_scope:'Tugas kerja panjang '.repeat(70),spouse_employer:'Syarikat '.repeat(130)};const overflow=await core.buildPdf({...assets,values:long});assert.ok(overflow.pages>2);fs.writeFileSync('/tmp/faris-application-long-output.pdf',overflow.bytes);
 await assert.rejects(core.buildPdf({...assets,values:{applicant_name:'Unsupported 字'}}),/Aksara.*belum disokong/);
 console.log('PASS 37-field parser: person scoping, Word tables, multiline addresses, blank fields, duplicate/unknown warnings, fresh parse; real two-page PDF, overflow pages and unsupported-glyph rejection');
})().catch(e=>{console.error(e);process.exitCode=1});
