const crypto = require('crypto');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const PDFKit = require('pdfkit');
const mammoth = require('mammoth');
const XLSX = require('xlsx');
const sharp = require('sharp');

const { requireApiKey } = require('./_lib/security');
const {
  getClients,
  findCustomer,
  getValues,
  uploadBuffer,
  appendValues,
  env,
  safeName
} = require('./_lib/google');

const TYPE_ORDER = {
  VSO:1,
  IC:2,
  LICENSE:3,
  PAYSLIP:4,
  BANK_STATEMENT:5,
  OTHER:6
};

function ext(name='') {
  return path.extname(name).toLowerCase().replace('.','');
}

function pdfKitBuffer(render) {
  return new Promise((resolve,reject)=>{
    const doc = new PDFKit({ size:'A4', margin:36, autoFirstPage:true });
    const chunks=[];
    doc.on('data', c=>chunks.push(c));
    doc.on('end', ()=>resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    render(doc);
    doc.end();
  });
}

async function textToPdfBuffer(text, title='DOCUMENT') {
  return pdfKitBuffer(doc=>{
    doc.fontSize(14).text(title,{underline:true});
    doc.moveDown();
    doc.fontSize(8).font('Courier').text(String(text||''),{
      width:523,
      lineGap:1
    });
  });
}

async function officeToPdfBuffer(buffer, filename) {
  const e=ext(filename);
  if(e==='docx'){
    const r=await mammoth.extractRawText({buffer});
    return textToPdfBuffer(r.value||'', filename);
  }
  if(e==='xlsx'||e==='xls'){
    const wb=XLSX.read(buffer,{type:'buffer'});
    let text='';
    for(const name of wb.SheetNames){
      text+='===== '+name+' =====\n';
      text+=XLSX.utils.sheet_to_csv(wb.Sheets[name],{blankrows:false});
      text+='\n\n';
    }
    return textToPdfBuffer(text, filename);
  }
  if(e==='txt'){
    return textToPdfBuffer(buffer.toString('utf8'),filename);
  }
  throw new Error('Unsupported office format: '+filename);
}

async function fetchDriveFile(drive, fileId) {
  const meta=await drive.files.get({fileId,fields:'id,name,mimeType,size'});
  const data=await drive.files.get({fileId,alt:'media'},{responseType:'arraybuffer'});
  return {meta:meta.data,buffer:Buffer.from(data.data)};
}

async function appendPdfBuffer(outDoc, buffer) {
  const src=await PDFDocument.load(buffer,{updateMetadata:false,ignoreEncryption:true});
  const pages=await outDoc.copyPages(src,src.getPageIndices());
  pages.forEach(p=>outDoc.addPage(p));
}

async function appendImage(outDoc, buffer) {
  const jpg=await sharp(buffer).rotate().jpeg({quality:90}).toBuffer();
  const img=await outDoc.embedJpg(jpg);
  const portrait=img.height>=img.width;
  const size=portrait?[595.28,841.89]:[841.89,595.28];
  const page=outDoc.addPage(size);
  const margin=24;
  const scale=Math.min((size[0]-margin*2)/img.width,(size[1]-margin*2)/img.height);
  const w=img.width*scale,h=img.height*scale;
  page.drawImage(img,{x:(size[0]-w)/2,y:(size[1]-h)/2,width:w,height:h});
}

async function appendAny(outDoc, file) {
  const e=ext(file.meta.name);
  if(e==='pdf'||file.meta.mimeType==='application/pdf') return appendPdfBuffer(outDoc,file.buffer);
  if(['jpg','jpeg','png','webp','heic','heif','tif','tiff'].includes(e)||String(file.meta.mimeType||'').startsWith('image/')){
    return appendImage(outDoc,file.buffer);
  }
  if(['docx','xlsx','xls','txt'].includes(e)){
    const pdf=await officeToPdfBuffer(file.buffer,file.meta.name);
    return appendPdfBuffer(outDoc,pdf);
  }
  throw new Error('Format tidak disokong untuk auto compile: '+file.meta.name);
}

async function addGuarantorCover(doc, customerName) {
  const page=doc.addPage([595.28,841.89]);
  const bold=await doc.embedFont(StandardFonts.HelveticaBold);
  const normal=await doc.embedFont(StandardFonts.Helvetica);
  page.drawRectangle({x:0,y:0,width:595.28,height:841.89,color:rgb(0.97,0.98,1)});
  page.drawRectangle({x:0,y:823,width:595.28,height:18,color:rgb(0.31,0.55,1)});
  const center=(text,size,font,y,color=rgb(0.08,0.11,0.2))=>{
    const w=font.widthOfTextAtSize(text,size);
    page.drawText(text,{x:(595.28-w)/2,y,size,font,color});
  };
  center('DOCUMENT SECTION',11,bold,545,rgb(0.31,0.55,1));
  center('GUARANTOR / PENJAMIN',26,bold,500);
  center('Dokumen Penjamin',13,normal,472,rgb(0.38,0.43,0.55));
  if(customerName) center(String(customerName).toUpperCase(),12,bold,330);
  center('VSO  ->  IC  ->  LESEN  ->  PAYSLIP  ->  BANK STATEMENT  ->  OTHER',8,normal,118,rgb(0.42,0.47,0.58));
}

function rowToDoc(r){
  return {
    documentId:r[0]||'',
    customerId:r[1]||'',
    customerName:r[2]||'',
    documentType:r[3]||'OTHER',
    documentDate:r[4]||'',
    source:r[5]||'',
    originalFilename:r[6]||'',
    driveFileId:r[7]||'',
    driveFolderId:r[8]||'',
    status:r[9]||'ACTIVE',
    receivedAt:r[10]||'',
    notes:r[11]||'',
    party:(r[12]||'HIRER').toUpperCase()
  };
}

function dateValue(s){
  const n=Date.parse(s||'');
  return Number.isFinite(n)?n:0;
}

function sortDocs(a,b){
  const t=(TYPE_ORDER[a.documentType]||99)-(TYPE_ORDER[b.documentType]||99);
  if(t!==0) return t;
  if(['PAYSLIP','BANK_STATEMENT'].includes(a.documentType)){
    return dateValue(b.documentDate||b.receivedAt)-dateValue(a.documentDate||a.receivedAt);
  }
  return dateValue(a.receivedAt)-dateValue(b.receivedAt);
}

module.exports = async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});
  try{
    requireApiKey(req);
    const {phone='',customerId='',customerName='',outputFilename='',notes=''}=req.body||{};
    const clients=await getClients();
    const customer=await findCustomer(clients.sheets,{phone,customerId,name:customerName});
    if(!customer) return res.status(404).json({ok:false,error:'CUSTOMER_NOT_FOUND'});

    const rows=await getValues(clients.sheets,'DOCUMENTS!A2:M');
    const active=rows.map(rowToDoc)
      .filter(d=>d.customerId===customer.customerId)
      .filter(d=>!['DELETED','SUPERSEDED'].includes(d.status))
      .filter(d=>d.driveFileId);

    if(!active.length) return res.status(400).json({ok:false,error:'NO_ACTIVE_DOCUMENTS'});

    const hirer=active.filter(d=>d.party!=='GUARANTOR').sort(sortDocs);
    const guarantor=active.filter(d=>d.party==='GUARANTOR').sort(sortDocs);
    const out=await PDFDocument.create();
    const used=[];
    const skipped=[];

    for(const d of hirer){
      try{
        const f=await fetchDriveFile(clients.drive,d.driveFileId);
        await appendAny(out,f);
        used.push({...d,filename:f.meta.name});
      }catch(e){
        skipped.push({documentId:d.documentId,filename:d.originalFilename,error:e.message});
      }
    }

    if(hirer.length && guarantor.length && out.getPageCount()>0){
      await addGuarantorCover(out,customer.name);
    }

    for(const d of guarantor){
      try{
        const f=await fetchDriveFile(clients.drive,d.driveFileId);
        await appendAny(out,f);
        used.push({...d,filename:f.meta.name});
      }catch(e){
        skipped.push({documentId:d.documentId,filename:d.originalFilename,error:e.message});
      }
    }

    if(out.getPageCount()===0){
      return res.status(400).json({ok:false,error:'NO_DOCUMENT_COULD_BE_COMPILED',skipped});
    }

    const bytes=Buffer.from(await out.save({useObjectStreams:true}));
    const now=new Date().toISOString();
    const ymd=now.slice(0,10).replace(/-/g,'');
    const filename=outputFilename||safeName(customer.name)+'_LOAN_DOCUMENT_'+ymd+'.pdf';

    let generatedFolder=null;
    const folderList=await clients.drive.files.list({
      q:"'"+customer.folderId+"' in parents and name='GENERATED' and mimeType='application/vnd.google-apps.folder' and trashed=false",
      fields:'files(id,name)',pageSize:5
    });
    generatedFolder=(folderList.data.files||[])[0];
    if(!generatedFolder) throw new Error('Customer GENERATED folder tidak ditemui.');

    const uploaded=await uploadBuffer(clients.drive,{
      buffer:bytes,
      name:filename,
      mimeType:'application/pdf',
      parentId:generatedFolder.id
    });

    try{
      await clients.drive.files.create({
        requestBody:{
          name:filename,
          mimeType:'application/vnd.google-apps.shortcut',
          parents:[env('GENERATED_FOLDER_ID')],
          shortcutDetails:{targetId:uploaded.id}
        },
        fields:'id'
      });
    }catch(e){
      console.warn('Shortcut global gagal:',e.message);
    }

    const jobId=crypto.randomUUID();
    await appendValues(clients.sheets,'JOBS!A:K',[
      jobId,customer.customerId,customer.name,'AUTO_COMPILE',now,'COMPLETED',
      String(used.length),filename,uploaded.id,now,
      notes+(skipped.length?' | skipped='+JSON.stringify(skipped):'')
    ]);

    return res.status(200).json({
      ok:true,
      jobId,
      customer,
      output:{
        filename,
        driveFileId:uploaded.id,
        webViewLink:uploaded.webViewLink||null,
        pages:out.getPageCount(),
        size:bytes.length
      },
      used:used.map(d=>({documentId:d.documentId,documentType:d.documentType,party:d.party,filename:d.filename})),
      skipped
    });
  }catch(error){
    console.error(error);
    return res.status(error.statusCode||500).json({ok:false,error:error.message});
  }
};
