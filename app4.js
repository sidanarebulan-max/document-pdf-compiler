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

  function safeFilename(){
    const raw=$('#customerName').value.trim()||partyNames.HIRER||partyNames.GUARANTOR||'FINAL';
    return raw.toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'')+'_DOCUMENT.pdf';
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

    const hirerDocs=sortedPartyItems('HIRER');
    const guarantorDocs=sortedPartyItems('GUARANTOR');
    if(!hirerDocs.length && !guarantorDocs.length){
      alert('Masukkan sekurang-kurangnya satu dokumen Hirer atau Guarantor dahulu.');
      return;
    }

    clearError();
    $('#generateBtn').disabled=true;
    $('#downloadBtn').disabled=true;
    $('#openBtn').disabled=true;
    setProgress(1,'Menjana Final PDF gabungan...');
    lastProcessingName='';

    try{
      const doc=await PDFDocument.create();
      const state={done:0,total:hirerDocs.length+guarantorDocs.length};

      if(hirerDocs.length){
        log(`Mula bahagian HIRER / PEMINJAM (${hirerDocs.length} fail).`);
        await processPartyDocs('HIRER',hirerDocs,doc,state);
      }

      if(hirerDocs.length && guarantorDocs.length){
        lastProcessingName='COVER PAGE GUARANTOR / PENJAMIN';
        setProgress(90,'Menambah cover page Guarantor / Penjamin...');
        await addGuarantorCoverPage(doc);
        log('Cover page GUARANTOR / PENJAMIN ditambah di tengah PDF.');
      }

      if(guarantorDocs.length){
        log(`Mula bahagian GUARANTOR / PENJAMIN (${guarantorDocs.length} fail).`);
        await processPartyDocs('GUARANTOR',guarantorDocs,doc,state);
      }

      if(doc.getPageCount()===0) throw new Error('Tiada page berjaya dimasukkan ke PDF akhir.');

      setProgress(94,'Menyimpan dan menyemak PDF akhir...');
      const bytes=await doc.save({useObjectStreams:true});
      finalBlob=new Blob([bytes],{type:'application/pdf'});

      if(finalUrl) URL.revokeObjectURL(finalUrl);
      finalUrl=URL.createObjectURL(finalBlob);
      $('#downloadBtn').disabled=false;
      $('#openBtn').disabled=false;

      let pages=doc.getPageCount();
      try{
        pages=await renderFinalPreview();
      }catch(pe){
        console.error(pe);
        log('Preview gagal tetapi PDF berjaya dijana: '+pe.message);
        $('#preview').innerHTML=`<div class="placeholder"><div><b>PDF siap (${pages} page)</b>Preview browser gagal dipaparkan, tetapi fail telah siap. Tekan <strong>Download PDF</strong> atau <strong>Buka PDF</strong>.</div></div>`;
      }

      const mode=hirerDocs.length&&guarantorDocs.length
        ? 'Hirer + Cover Guarantor + Guarantor'
        : hirerDocs.length ? 'Hirer sahaja' : 'Guarantor sahaja';

      setProgress(100,`Final PDF siap • ${pages} page • ${mode}.`);
      log(`Siap: ${safeFilename()} • ${pages} page • ${mode} • ${(finalBlob.size/1024/1024).toFixed(2)} MB`);
    }catch(e){
      console.error(e);
      const where=lastProcessingName?`Fail bermasalah: ${lastProcessingName}\n`:'';
      const detail=(e&&e.message)?e.message:String(e);
      const msg=where+`Sebab: ${detail}`;
      showError(msg);
      alert('Gagal generate PDF.\n\n'+msg);
      log('ERROR: '+msg.replace(/\n/g,' | '));
      setProgress(0,lastProcessingName?`Gagal pada: ${lastProcessingName}`:'Gagal menjana PDF.');
    }finally{
      $('#generateBtn').disabled=false;
    }
  }

  document.querySelectorAll('.party-tab').forEach(btn=>{
    btn.onclick=()=>switchParty(btn.dataset.party);
  });

  $('#partyName').oninput=e=>{ partyNames[activeParty]=e.target.value; };

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
      finalPreviewPdf=null;
      clearError();
      if(finalUrl) URL.revokeObjectURL(finalUrl);
      finalUrl=null;
      $('#preview').innerHTML='<div class="placeholder"><div><b>Belum ada PDF dijana</b>Isi Hirer, Guarantor atau kedua-duanya.</div></div>';
      $('#downloadBtn').disabled=true;
      $('#openBtn').disabled=true;
      setProgress(0,'Belum ada proses.');
      render();
      log(`Page ${label} dikosongkan.`);
    }
  };

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