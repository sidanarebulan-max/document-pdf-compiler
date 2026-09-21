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
    $('#prevPage').disabled=finalPreviewPage<=1; $('#nextPage').disabled=finalPreviewPage>=finalPreviewPdf.numPages;
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
    const raw=$('#customerName').value.trim()||'FINAL';
    return raw.toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'')+'_DOCUMENT.pdf';
  }

  async function generate(){
    if(!items.length){alert('Masukkan dokumen dahulu.');return;}
    clearError();
    $('#generateBtn').disabled=true; $('#downloadBtn').disabled=true; $('#openBtn').disabled=true; setProgress(1,'Menjana PDF...');
    lastProcessingName='';
    try{
      if($('#autoSort').checked) sortItems();
      const doc=await PDFDocument.create();
      for(let i=0;i<items.length;i++){
        lastProcessingName=items[i].file.name;
        const pct=Math.round((i/items.length)*88)+3;
        setProgress(pct,`Convert ${i+1}/${items.length}: ${lastProcessingName}`);
        log(`Proses: ${items[i].category} → ${lastProcessingName}`);
        await appendItem(items[i],doc);
      }
      if(doc.getPageCount()===0) throw new Error('Tiada page berjaya dimasukkan ke PDF akhir.');
      setProgress(93,'Menyimpan dan menyemak PDF akhir...');
      const bytes=await doc.save({useObjectStreams:true});
      finalBlob=new Blob([bytes],{type:'application/pdf'});
      if(finalUrl) URL.revokeObjectURL(finalUrl); finalUrl=URL.createObjectURL(finalBlob);
      $('#downloadBtn').disabled=false; $('#openBtn').disabled=false;
      let pages=doc.getPageCount();
      try{
        pages=await renderFinalPreview();
      }catch(pe){
        console.error(pe);
        log('Preview gagal tetapi PDF berjaya dijana: '+pe.message);
        $('#preview').innerHTML=`<div class="placeholder"><div><b>PDF siap (${pages} page)</b>Preview browser gagal dipaparkan, tetapi fail telah siap. Tekan <strong>Download PDF</strong> atau <strong>Buka PDF</strong>.</div></div>`;
      }
      setProgress(100,`Final PDF siap • ${pages} page.`); log(`Siap: ${safeFilename()} • ${pages} page • ${(finalBlob.size/1024/1024).toFixed(2)} MB`);
    }catch(e){
      console.error(e);
      const where=lastProcessingName?`Fail bermasalah: ${lastProcessingName}\n`:'';
      const detail=(e&&e.message)?e.message:String(e);
      const msg=where+`Sebab: ${detail}`;
      showError(msg);
      alert('Gagal generate PDF.\n\n'+msg);
      log('ERROR: '+msg.replace(/\n/g,' | '));
      setProgress(0,lastProcessingName?`Gagal pada: ${lastProcessingName}`:'Gagal menjana PDF.');
    }finally{ $('#generateBtn').disabled=false; }
  }

  $('#dropZone').onclick=()=>$('#fileInput').click();
  $('#fileInput').onchange=e=>addFiles(e.target.files);
  ['dragenter','dragover'].forEach(ev=>$('#dropZone').addEventListener(ev,e=>{e.preventDefault();$('#dropZone').classList.add('drag')}));
  ['dragleave','drop'].forEach(ev=>$('#dropZone').addEventListener(ev,e=>{e.preventDefault();$('#dropZone').classList.remove('drag')}));
  $('#dropZone').addEventListener('drop',e=>addFiles(e.dataTransfer.files));
  $('#analyzeBtn').onclick=()=>analyzeAll(true);
  $('#sortBtn').onclick=()=>sortItems();
  $('#clearBtn').onclick=()=>{if(confirm('Kosongkan semua dokumen?')){items=[];finalBlob=null;finalPreviewPdf=null;clearError();if(finalUrl)URL.revokeObjectURL(finalUrl);finalUrl=null;$('#preview').innerHTML='<div class="placeholder"><div><b>Belum ada PDF dijana</b>Masukkan dokumen dan tekan Generate Final PDF.</div></div>';$('#downloadBtn').disabled=true;$('#openBtn').disabled=true;setProgress(0,'Belum ada proses.');render();log('Sesi dikosongkan.')}};
  $('#generateBtn').onclick=generate;
  $('#downloadBtn').onclick=()=>{ if(!finalBlob)return; const a=document.createElement('a');a.href=finalUrl;a.download=safeFilename();document.body.appendChild(a);a.click();a.remove(); };
  $('#openBtn').onclick=()=>{ if(finalUrl) window.open(finalUrl,'_blank','noopener'); };

  render();
