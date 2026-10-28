  function compilerProfileStamp(){
    return JSON.stringify([$('#compileScope').value,$('#customerName').value,$('#customerPhone').value,$('#outputName').value,partyNames,items.map(x=>[x.id,x.party,x.category,x.date,x.order])]);
  }
  async function renderPreviewPage(){
    if(!finalPreviewPdf) return;
    const host=$('#preview');
    const page=await finalPreviewPdf.getPage(finalPreviewPage);
    const base=page.getViewport({scale:1});
    const targetW=Math.max(300,Math.min(760,(host.clientWidth||390)-34));
    const scale=Math.max(.5,Math.min(1.65,targetW/base.width));
    const vp=page.getViewport({scale});
    host.innerHTML=`<div class="preview-controls"><button class="btn" id="prevPage">←</button><span class="preview-page">Page ${finalPreviewPage} / ${finalPreviewPdf.numPages}</span><button class="btn" id="nextPage">→</button></div><div class="canvas-wrap"><canvas id="previewCanvas"></canvas></div>`;
    const canvas=$('#previewCanvas'); canvas.width=Math.ceil(vp.width); canvas.height=Math.ceil(vp.height);
    const ctx=canvas.getContext('2d',{alpha:false}); ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
    await page.render({canvasContext:ctx,viewport:vp,background:'rgb(255,255,255)'}).promise;
    $('#prevPage').disabled=finalPreviewPage<=1;
    $('#nextPage').disabled=finalPreviewPage>=finalPreviewPdf.numPages;
    $('#prevPage').onclick=async()=>{ if(finalPreviewPage>1){finalPreviewPage--;await renderPreviewPage();host.scrollTop=0;} };
    $('#nextPage').onclick=async()=>{ if(finalPreviewPage<finalPreviewPdf.numPages){finalPreviewPage++;await renderPreviewPage();host.scrollTop=0;} };
  }

  async function renderFinalPreview(){
    const ab=await finalBlob.arrayBuffer();
    finalPreviewPdf=await pdfjsLib.getDocument({data:new Uint8Array(ab)}).promise;
    finalPreviewPage=1;
    await renderPreviewPage();
    return finalPreviewPdf.numPages;
  }

  function cleanOutputName(value){
    let name=String(value||'').normalize('NFC').replace(/_/g,' ')
      .replace(/[\u0000-\u001f\u007f<>:"/\\|?*\u202a-\u202e\u2066-\u2069]/g,' ')
      .replace(/\s+/g,' ').trim().replace(/(?:\.pdf)+$/i,'').replace(/^[.\s]+|[.\s]+$/g,'').slice(0,120).trim();
    if(/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))name='Fail '+name;
    return name;
  }
  function safeFilename(mode=lastGeneratedMode){
    const custom=cleanOutputName($('#outputName').value);
    if(custom)return custom+'.pdf';
    const raw=cleanOutputName($('#customerName').value.trim()||partyNames.HIRER||partyNames.GUARANTOR||partyNames.REBATE);
    const label=mode==='REBATE_ONLY'?'Cop Rebate':'Document';
    return (raw?raw+' - ':'')+label+'.pdf';
  }
  function updateOutputNamePreview(){
    $('#outputNamePreview').textContent='Nama fail: '+safeFilename($('#compileScope').value);
  }

  function cleanPdfText(text){
    return String(text ?? '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g,'')
      .replace(/[→⇒⟶➜➝]/g,' > ')
      .replace(/[←⇐⟵]/g,' < ')
      .replace(/[–—−]/g,'-')
      .replace(/[“”]/g,'"')
      .replace(/[‘’]/g,"'")
      .replace(/…/g,'...')
      .replace(/[•·]/g,'-')
      .replace(/[^\x20-\x7E]/g,'?');
  }

  async function addGuarantorCoverPage(doc){
    const page=doc.addPage([595.28,841.89]);
    const bold=await doc.embedFont(StandardFonts.HelveticaBold);
    const normal=await doc.embedFont(StandardFonts.Helvetica);
    const w=page.getWidth(), h=page.getHeight();

    page.drawRectangle({x:0,y:0,width:w,height:h,color:rgb(0.97,0.98,1)});
    page.drawRectangle({x:0,y:h-18,width:w,height:18,color:rgb(0.31,0.55,1)});
    page.drawRectangle({x:0,y:0,width:w,height:12,color:rgb(0.49,0.36,1)});

    const eyebrow='DOCUMENT SECTION';
    const title='GUARANTOR / PENJAMIN';
    const sub='Dokumen Penjamin';
    const customer=($('#customerName').value.trim()||'').toUpperCase();
    const guarantor=(partyNames.GUARANTOR||'').toUpperCase();

    const centerText=(text,size,font,y,color=rgb(0.07,0.1,0.18))=>{
      const safe=cleanPdfText(text);
      const tw=font.widthOfTextAtSize(safe,size);
      page.drawText(safe,{x:(w-tw)/2,y,size,font,color});
    };

    centerText(eyebrow,11,bold,545,rgb(0.31,0.55,1));
    centerText(title,27,bold,500);
    centerText(sub,13,normal,472,rgb(0.36,0.42,0.55));
    page.drawLine({start:{x:120,y:448},end:{x:w-120,y:448},thickness:1,color:rgb(0.82,0.86,0.93)});

    if(guarantor){
      centerText(guarantor,18,bold,406);
      centerText('Nama Guarantor / Penjamin',10,normal,386,rgb(0.45,0.5,0.6));
    }
    if(customer){
      centerText(customer,12,bold,330);
      centerText('Nama Customer / Fail',9,normal,312,rgb(0.5,0.55,0.65));
    }

    const order='VSO  →  IC  →  LESEN  →  PAYSLIP  →  BANK STATEMENT  →  OTHER';
    centerText(order,8,normal,118,rgb(0.42,0.47,0.58));
    centerText('Halaman pemisah automatik',8,normal,92,rgb(0.57,0.61,0.7));
  }

  async function addRebateCoverPage(doc){
  const page=doc.addPage([595.28,841.89]);
  const bold=await doc.embedFont(StandardFonts.HelveticaBold);
  const normal=await doc.embedFont(StandardFonts.Helvetica);
  const w=page.getWidth(),h=page.getHeight();
  page.drawRectangle({x:0,y:0,width:w,height:h,color:rgb(0.97,0.98,1)});
  page.drawRectangle({x:0,y:h-18,width:w,height:18,color:rgb(0.31,0.55,1)});
  page.drawRectangle({x:0,y:0,width:w,height:12,color:rgb(0.49,0.36,1)});
  const center=(t,size,font,y,color=rgb(.07,.1,.18))=>{
    const safe=cleanPdfText(t);
    page.drawText(safe,{x:(w-font.widthOfTextAtSize(safe,size))/2,y,size,font,color});
  };
  center('DOCUMENT SECTION',11,bold,545,rgb(.31,.55,1));
  center('COP REBATE',30,bold,500);
  center('Dokumen Sokongan Rebat',14,normal,468,rgb(.36,.42,.55));
  const name=(partyNames.REBATE||'').trim();
  if(name)center(name.toUpperCase().slice(0,43),17,bold,405);
  const customer=($('#customerName').value||'').trim();
  if(customer)center(customer.toUpperCase().slice(0,50),11,normal,365);
  center('IC DEPAN - IC BELAKANG - LESEN - SURAT KERJA',9,normal,120);
  center('SIJIL LAHIR - SIJIL NIKAH - LAIN-LAIN',9,normal,100);
  center('Halaman pemisah automatik',8,normal,75,rgb(.57,.61,.7));
}

  async function processPartyDocs(party,docs,doc,state){
    for(let i=0;i<docs.length;i++){
      const item=docs[i];
      state.done++;
      lastProcessingName=item.file.name;
      const pct=Math.round((state.done/state.total)*84)+5;
      setProgress(pct,`${PARTY_META[party].short}: ${state.done}/${state.total} • ${lastProcessingName}`);
      log(`Proses ${PARTY_META[party].short}: ${item.category} → ${lastProcessingName}`);
      await appendItem(item,doc);
    }
  }

  async function generate(){
  partyNames[activeParty]=$('#partyName').value.trim();
  const scope=$('#compileScope').value;
  const hirerDocs=scope==='REBATE_ONLY'?[]:sortedPartyItems('HIRER');
  const guarantorDocs=scope==='REBATE_ONLY'?[]:sortedPartyItems('GUARANTOR');
  const rebateDocs=scope==='STANDARD'?[]:sortedPartyItems('REBATE');
  const allCount=hirerDocs.length+guarantorDocs.length+rebateDocs.length;
  if(!allCount){
    alert('Tiada dokumen dalam pilihan ini. Muat naik dokumen dahulu atau tukar pilihan gabungan.');
    return;
  }
  clearError();
  window.FARIS_GENERATED?.clear('compiler');
  const profileStamp=compilerProfileStamp();
  $('#generateBtn').disabled=true;
  $('#downloadBtn').disabled=true;
  $('#openBtn').disabled=true;
  $('#driveSaveBtn').disabled=true;
  setProgress(1,'Menjana PDF: '+(scope==='REBATE_ONLY'?'COP Rebate':scope==='STANDARD'?'Hirer + Guarantor':'Semua tab')+'...');
  lastProcessingName='';
  try{
    const doc=await PDFDocument.create();
    const state={done:0,total:allCount};
    if(hirerDocs.length){
      log('Mula HIRER / PEMINJAM ('+hirerDocs.length+' fail).');
      await processPartyDocs('HIRER',hirerDocs,doc,state);
    }
    if(hirerDocs.length&&guarantorDocs.length){
      lastProcessingName='COVER PAGE GUARANTOR / PENJAMIN';
      setProgress(90,'Menambah cover page Guarantor...');
      await addGuarantorCoverPage(doc);
    }
    if(guarantorDocs.length){
      log('Mula GUARANTOR / PENJAMIN ('+guarantorDocs.length+' fail).');
      await processPartyDocs('GUARANTOR',guarantorDocs,doc,state);
    }
    if(rebateDocs.length){
      if(hirerDocs.length||guarantorDocs.length){
        lastProcessingName='COVER PAGE COP REBATE';
        setProgress(90,'Menambah cover page COP Rebate...');
        await addRebateCoverPage(doc);
      }
      log('Mula COP REBATE ('+rebateDocs.length+' fail).');
      await processPartyDocs('REBATE',rebateDocs,doc,state);
    }
    if(doc.getPageCount()===0)throw new Error('Tiada muka surat berjaya dimasukkan ke PDF.');
    setProgress(94,'Menyimpan dan menyediakan pratonton PDF...');
    const bytes=await doc.save({useObjectStreams:true});
    if(finalUrl)URL.revokeObjectURL(finalUrl);
    finalBlob=new Blob([bytes],{type:'application/pdf'});
    finalUrl=URL.createObjectURL(finalBlob);
    lastGeneratedMode=scope;
    window.FARIS_GENERATED?.publish('compiler',{blob:finalBlob,name:safeFilename(),party:scope==='REBATE_ONLY'?'REBATE':!hirerDocs.length&&guarantorDocs.length&&!rebateDocs.length?'GUARANTOR':!hirerDocs.length&&!guarantorDocs.length?'REBATE':'HIRER',category:'OTHER',valid:()=>profileStamp===compilerProfileStamp()});
    $('#downloadBtn').disabled=false;
    $('#openBtn').disabled=false;
    $('#driveSaveBtn').disabled=false;
    let pages=doc.getPageCount();
    try{pages=await renderFinalPreview();}
    catch(pe){
      console.error(pe);
      log('Pratonton gagal tetapi PDF telah berjaya dijana: '+pe.message);
      $('#preview').innerHTML=`<div class="placeholder"><div><b>PDF siap (${pages} page)</b>Tekan Download PDF atau Buka PDF.</div></div>`;
    }
    const label=scope==='REBATE_ONLY'?'COP Rebate sahaja':scope==='STANDARD'?'Hirer + Guarantor':'Semua tab';
    setProgress(100,`PDF siap • ${pages} muka surat • ${label}.`);
    log(`Siap: ${safeFilename()} • ${pages} page • ${label} • ${(finalBlob.size/1024/1024).toFixed(2)} MB`);
  }catch(e){
    console.error(e);
    const where=lastProcessingName?`Fail bermasalah: ${lastProcessingName}\n`:'';
    const msg=where+`Sebab: ${e.message||String(e)}`;
    showError(msg);
    alert('Gagal generate PDF.\n\n'+msg);
    log('ERROR: '+msg.replace(/\n/g,' | '));
    setProgress(0,lastProcessingName?'Gagal pada: '+lastProcessingName:'Gagal menjana PDF.');
  }finally{
    $('#generateBtn').disabled=false;
  }
}

  document.querySelectorAll('.party-tab').forEach(btn=>{
    btn.onclick=()=>switchParty(btn.dataset.party);
  });

  $('#partyName').oninput=e=>{ partyNames[activeParty]=e.target.value;updateOutputNamePreview(); };
  $('#outputName').addEventListener('input',updateOutputNamePreview);
  $('#customerName').addEventListener('input',updateOutputNamePreview);

  $('#dropZone').onclick=()=>$('#fileInput').click();
  $('#fileInput').onchange=e=>addFiles(e.target.files);
  ['dragenter','dragover'].forEach(ev=>$('#dropZone').addEventListener(ev,e=>{e.preventDefault();$('#dropZone').classList.add('drag')}));
  ['dragleave','drop'].forEach(ev=>$('#dropZone').addEventListener(ev,e=>{e.preventDefault();$('#dropZone').classList.remove('drag')}));
  $('#dropZone').addEventListener('drop',e=>addFiles(e.dataTransfer.files));

  $('#analyzeBtn').onclick=()=>analyzeAll(true);
  $('#sortBtn').onclick=()=>sortParty(activeParty);

  $('#clearBtn').onclick=()=>{
    const label=PARTY_META[activeParty].short;
    if(confirm(`Kosongkan semua dokumen ${label}?`)){
      items=items.filter(x=>x.party!==activeParty);
      partyNames[activeParty]='';
      $('#partyName').value='';
      finalBlob=null;
      window.FARIS_GENERATED?.clear('compiler');
      finalPreviewPdf=null;
      clearError();
      if(finalUrl) URL.revokeObjectURL(finalUrl);
      finalUrl=null;
      $('#preview').innerHTML='<div class="placeholder"><div><b>Belum ada PDF dijana</b>Pilih tab dan muat naik dokumen.</div></div>';
      $('#downloadBtn').disabled=true;
      $('#openBtn').disabled=true;
      $('#driveSaveBtn').disabled=true;
      setProgress(0,'Belum ada proses.');
      render();
      log(`Page ${label} dikosongkan.`);
    }
  };

  $('#compileScope').onchange=()=>{renderChecklist();updateOutputNamePreview()};
  $('#generateBtn').onclick=generate;
  $('#downloadBtn').onclick=()=>{
    if(!finalBlob)return;
    const a=document.createElement('a');
    a.href=finalUrl;
    a.download=safeFilename();
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  $('#openBtn').onclick=()=>{ if(finalUrl) window.open(finalUrl,'_blank','noopener'); };

  switchParty('HIRER');
  updateOutputNamePreview();
