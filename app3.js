  async function fileToDataUrl(file){ return await new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(file); }); }

  async function loadImageElement(blob){
    const url=URL.createObjectURL(blob);
    try{
      return await new Promise((res,rej)=>{ const i=new Image(); i.onload=()=>res({img:i,url}); i.onerror=()=>{URL.revokeObjectURL(url);rej(new Error('Gambar tidak dapat dibaca oleh browser.'));}; i.src=url; });
    }catch(e){ throw e; }
  }

  async function normalizeImageBlob(blob){
    const {img,url}=await loadImageElement(blob);
    try{
      const maxSide=3600;
      const ratio=Math.min(1,maxSide/Math.max(img.naturalWidth||img.width,img.naturalHeight||img.height));
      const w=Math.max(1,Math.round((img.naturalWidth||img.width)*ratio));
      const h=Math.max(1,Math.round((img.naturalHeight||img.height)*ratio));
      const c=document.createElement('canvas'); c.width=w; c.height=h;
      const ctx=c.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,w,h); ctx.drawImage(img,0,0,w,h);
      const out=await new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(new Error('Gagal normalize gambar.')),'image/jpeg',.94));
      c.width=1;c.height=1; return out;
    }finally{ URL.revokeObjectURL(url); }
  }

  async function imageBlobToPdfPages(blob,pdfDoc){
    const normalized=await normalizeImageBlob(blob);
    const {img,url}=await loadImageElement(normalized);
    try{
      const portrait=img.height>=img.width; const size=portrait?[595.28,841.89]:[841.89,595.28];
      const page=pdfDoc.addPage(size); const margin=26; const maxW=size[0]-margin*2,maxH=size[1]-margin*2;
      const embedded=await pdfDoc.embedJpg(await normalized.arrayBuffer());
      const scale=Math.min(maxW/embedded.width,maxH/embedded.height); const w=embedded.width*scale,h=embedded.height*scale;
      page.drawImage(embedded,{x:(size[0]-w)/2,y:(size[1]-h)/2,width:w,height:h});
    }finally{ URL.revokeObjectURL(url); }
  }

  async function openPdfWithPdfJs(file,arrayBuffer){
    let password;
    while(true){
      try{
        return await pdfjsLib.getDocument({data:new Uint8Array(arrayBuffer.slice(0)),password}).promise;
      }catch(e){
        if(e && e.name==='PasswordException'){
          const p=window.prompt(`PDF "${file.name}" dikunci. Masukkan password PDF:`,'');
          if(p===null) throw new Error('PDF dikunci dan password tidak dimasukkan: '+file.name);
          password=p;
          continue;
        }
        throw e;
      }
    }
  }

  async function appendPdfViaPdfJs(file,pdfDoc){
    const ab=await file.arrayBuffer();
    const pdf=await openPdfWithPdfJs(file,ab);
    log(`Safe Mode: rasterize ${file.name} (${pdf.numPages} page).`);
    for(let p=1;p<=pdf.numPages;p++){
      setProgress(null,`Safe Mode PDF: ${file.name} • page ${p}/${pdf.numPages}`);
      const page=await pdf.getPage(p);
      const base=page.getViewport({scale:1});
      const renderVp=page.getViewport({scale:1.75});
      const canvas=document.createElement('canvas'); canvas.width=Math.max(1,Math.ceil(renderVp.width)); canvas.height=Math.max(1,Math.ceil(renderVp.height));
      const ctx=canvas.getContext('2d',{alpha:false}); ctx.fillStyle='#fff'; ctx.fillRect(0,0,canvas.width,canvas.height);
      await page.render({canvasContext:ctx,viewport:renderVp,background:'rgb(255,255,255)'}).promise;
      const jpg=await new Promise((res,rej)=>canvas.toBlob(b=>b?res(b):rej(new Error('Gagal render page PDF.')),'image/jpeg',.92));
      const embedded=await pdfDoc.embedJpg(await jpg.arrayBuffer());
      const out=pdfDoc.addPage([base.width,base.height]);
      out.drawImage(embedded,{x:0,y:0,width:base.width,height:base.height});
      canvas.width=1;canvas.height=1;
      if(page.cleanup) page.cleanup();
    }
    if(pdf.cleanup) pdf.cleanup();
    if(pdf.destroy) await pdf.destroy();
  }

  async function appendPdfFile(file,pdfDoc){
    const ab=await file.arrayBuffer();
    try{
      const src=await PDFDocument.load(ab,{updateMetadata:false});
      const copied=await pdfDoc.copyPages(src,src.getPageIndices()); copied.forEach(p=>pdfDoc.addPage(p));
      return;
    }catch(e){
      log(`Import PDF biasa gagal untuk ${file.name}: ${e.message}`);
      if(!$('#safePdf').checked) throw e;
      log(`Cuba PDF Safe Mode untuk ${file.name}...`);
      return appendPdfViaPdfJs(file,pdfDoc);
    }
  }

  async function renderHtmlToCanvas(html){
    const stage=$('#renderStage'); stage.innerHTML=html;
    await new Promise(r=>setTimeout(r,80));
    const canvas=await html2canvas(stage,{scale:1.6,backgroundColor:'#ffffff',useCORS:true,logging:false});
    stage.innerHTML=''; return canvas;
  }

  async function canvasToPdfPages(canvas,pdfDoc){
    const A4=[595.28,841.89];
    const targetRatio=A4[1]/A4[0];
    const sliceH=Math.floor(canvas.width*targetRatio);
    for(let y=0;y<canvas.height;y+=sliceH){
      const h=Math.min(sliceH,canvas.height-y); const tmp=document.createElement('canvas'); tmp.width=canvas.width; tmp.height=h;
      tmp.getContext('2d').drawImage(canvas,0,y,canvas.width,h,0,0,canvas.width,h);
      const png=tmp.toDataURL('image/png'); const img=await pdfDoc.embedPng(png); const page=pdfDoc.addPage(A4);
      const margin=18; const maxW=A4[0]-margin*2,maxH=A4[1]-margin*2; const sc=Math.min(maxW/img.width,maxH/img.height); const w=img.width*sc, hh=img.height*sc;
      page.drawImage(img,{x:(A4[0]-w)/2,y:A4[1]-margin-hh,width:w,height:hh});
    }
  }

  async function appendDocx(file,pdfDoc){
    const ab=await file.arrayBuffer(); const result=await mammoth.convertToHtml({arrayBuffer:ab});
    const html=`<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.45;color:#111">${result.value}</div>`;
    const canvas=await renderHtmlToCanvas(html); await canvasToPdfPages(canvas,pdfDoc);
  }

  async function appendXlsx(file,pdfDoc){
    const ab=await file.arrayBuffer(); const wb=XLSX.read(ab,{type:'array'});
    for(const name of wb.SheetNames){
      const table=XLSX.utils.sheet_to_html(wb.Sheets[name],{editable:false});
      const html=`<div style="font-family:Arial,sans-serif;color:#111"><h2 style="margin:0 0 16px">${escapeHtml(name)}</h2>${table}</div>`;
      const canvas=await renderHtmlToCanvas(html); await canvasToPdfPages(canvas,pdfDoc);
    }
  }

  async function appendTxt(file,pdfDoc){
    const txt=escapeHtml(await file.text()).replace(/\n/g,'<br>'); const canvas=await renderHtmlToCanvas(`<div style="font-family:Arial,sans-serif;font-size:14px;white-space:normal;color:#111">${txt}</div>`); await canvasToPdfPages(canvas,pdfDoc);
  }

  async function appendItem(item,pdfDoc){
    const ext=extOf(item.file.name);
    if(ext==='pdf') return appendPdfFile(item.file,pdfDoc);
    if(['jpg','jpeg','png','webp','heic','heif'].includes(ext)){
      let blob=item.file;
      if(ext==='heic'||ext==='heif'){
        const c=await heic2any({blob:item.file,toType:'image/jpeg',quality:.92}); blob=Array.isArray(c)?c[0]:c;
      }
      return imageBlobToPdfPages(blob,pdfDoc);
    }
    if(ext==='docx') return appendDocx(item.file,pdfDoc);
    if(['xlsx','xls'].includes(ext)) return appendXlsx(item.file,pdfDoc);
    if(ext==='txt') return appendTxt(item.file,pdfDoc);
    throw new Error('Format tidak disokong: '+ext);
  }
