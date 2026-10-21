(function installExactVso(){
  "use strict";
  const host=document.getElementById("vsoWorkspace"),viewport=document.getElementById("vsoPreviewViewport");
  if(!host||!viewport)return;
  const E=id=>document.getElementById(id);
  const sample={width:595.5,height:842.25};
  const key="lon-puncak-template-v2-variants";
  const outputResolution=2.15;
  let blankImage=null,baseData=null,drawSeq=0,buildBusy=false,previewCanvas=null,latest=null,templateAvailable=false;
  // Borang asal tidak diubah: hanya medan pelanggan, butiran kenderaan dan pinjaman dilukis di atas templat.
  const controlledFields=Object.freeze(['vsoCustomer','vsoNric','vsoAddress','vsoPhone','vsoEmail','vsoModel','vsoYear','vsoColor','vsoLoan','vsoPeriod']);
  const money=n=>Math.round(n).toLocaleString("en-MY");
  const mode=()=>host.querySelector('[data-vso-mode].active')?.dataset.vsoMode||"PLAIN";
  const validData=()=>{
    const value=id=>E(id)?.value?.trim()||"";
    const loan=Number(value("vsoLoan"));
    const kind=mode();
    const v=window.VSO_VARIANTS.get(value("vsoModel"));
    const result=window.VSO_VARIANTS.calculate(loan,kind,v.id);
    return {customer:value("vsoCustomer"),nric:value("vsoNric"),address:value("vsoAddress"),phone:value("vsoPhone"),email:value("vsoEmail"),year:value("vsoYear"),color:value("vsoColor"),period:value("vsoPeriod"),model:v.model,variant:v,fees:v.fees,feeTotal:result.feeTotal,loan,otr:result.otr,net:result.net,kind};
  };
  const boxes=[
    [393.8,89.1,468,101.5],
    [110.8,119.2,354.5,129.6],
    [110.4,134.3,353.8,146.0],
    [110.6,163.9,350,175.0],
    [110.5,177.9,351,188.7],
    [109.5,190.9,349,201.7],
    [396.5,118.8,549,130.4],
    [396.5,132.2,549,144.0],
    [424.3,174.8,543.8,186.6],
    [423.9,189.1,542,201.4],
    [119.9,204.8,269,216.3],
    [328.8,203.4,359.7,216.5],
    [401.5,203.5,542.7,216.1],
    [230.2,228.5,255.3,237.3],
    [231.6,520.7,255.5,529.0],
    // Bersihkan nilai caj asal agar data varian baharu tidak bertindih.
    [228,296.0,257,305.4],
    [228,319.0,257,328.8],
    [227,441.4,257,450.6],
    [227,452.7,257,461.6],
    [227,463.7,257,472.5],
    [225,474.4,257,484.3],
    [243,238.5,253.5,248.2],
    [246.0,329.2,257,338.5]
  ];
  const prep=document.createElement("div");
  prep.className="vsoExactPanel";
  prep.innerHTML=`
    <div class="vsoExactHeader"><strong><span aria-hidden="true">▣</span> Format VSO Asal — Templat Tetap</strong><span class="vsoExactPill">BORANG ORIGINAL</span></div>
    <p id="vsoTemplateHelp">Templat VSO asal disediakan secara <b>berpusat dan automatik</b>. Hanya isi maklumat pelanggan, kereta serta pinjaman; semua bahagian tetap dokumen dikekalkan.</p>
    <label class="vsoExactChoose" for="vsoExactUpload">📄 Muat naik templat sendiri (pilihan sandaran)</label>
    <button type="button" class="vsoExactChange" id="vsoExactChange">Tukar templat PDF</button>
    <input id="vsoExactUpload" type="file" accept=".pdf,application/pdf" hidden>
    <div id="vsoExactStatus" role="status">Memuatkan templat VSO berpusat...</div>
    <small>Templat asal dipasang terus dalam website; tiada langkah muat naik diperlukan pada pelayar atau telefon baharu. Dokumen pelanggan hanya diproses dalam pelayar. PDF akhir masih DRAF sehingga disahkan pengedar.</small>`;
  const first=host.querySelector(".vsoModeGrid");
  if(first)first.insertAdjacentElement("afterend",prep);
  const status=E("vsoExactStatus");
  E("vsoExactChange").addEventListener("click",()=>{
    E("vsoExactUpload").click();
  });
  const blankHint=document.createElement("div");
  blankHint.id="vsoExactPlaceholder";
  blankHint.innerHTML="<div class='vsoExactPlaceholderIcon'>▤</div><strong>Pratonton format VSO asal</strong><p>Muat naik PDF templat asal dahulu. Halaman dan logo asal akan dipaparkan di sini tanpa sebarang reka bentuk semula.</p>";
  viewport.appendChild(blankHint);
  const oldFrame=E("vsoSheetFrame");
  if(oldFrame)oldFrame.style.display="none";
  previewCanvas=document.createElement("canvas");
  previewCanvas.id="vsoExactCanvas";
  previewCanvas.width=Math.round(sample.width*outputResolution);
  previewCanvas.height=Math.round(sample.height*outputResolution);
  previewCanvas.style.display="none";
  viewport.appendChild(previewCanvas);
  const text=(ctx,s,x,y,width,font="10px Calibri, Arial, sans-serif",align="left")=>{
    const value=String(s||"");if(!value)return;
    ctx.save();ctx.font=font;ctx.fillStyle="#101010";ctx.textAlign=align;ctx.textBaseline="alphabetic";
    if(width>0 && ctx.measureText(value).width>width){
      let size=parseFloat(font);const family=font.replace(/^[\w ]*?[\d.]+px\s*/,"");
      for(let i=0;i<8 && ctx.measureText(value).width>width;i++){size=Math.max(6.2,size-.4);ctx.font=`${size}px ${family}`;}
      if(ctx.measureText(value).width>width)ctx.fillText(value,x,y,width);else ctx.fillText(value,x,y);
    }else ctx.fillText(value,x,y);
    ctx.restore();
  };
  const drawFields=(ctx,d)=>{
    const yy=(e)=>e;
    const date=new Date();const dateStr=[date.getDate(),date.getMonth()+1,date.getFullYear()].join("/");
    text(ctx,dateStr,394.3,99.6,74,"10px Calibri, Arial, sans-serif");
    text(ctx,d.customer.toUpperCase(),111.1,128.3,241,"10px Calibri, Arial, sans-serif");
    const addrLines=d.address.replace(/\s+/g," ").match(/.{1,62}(?:\s|$)/g)||[];
    text(ctx,(addrLines[0]||"").trim().toUpperCase(),111.1,143.0,240,"9.4px Calibri, Arial, sans-serif");
    if(addrLines.length>1)text(ctx,addrLines.slice(1).join(" ").trim().toUpperCase(),111.1,153.1,240,"8.8px Calibri, Arial, sans-serif");
    text(ctx,d.nric,111.1,173.3,180,"10px Calibri, Arial, sans-serif");
    text(ctx,d.phone,111.1,186.2,180,"10px Calibri, Arial, sans-serif");
    text(ctx,d.email,110.5,199.3,220,"10px Calibri, Arial, sans-serif");
    text(ctx,d.phone,397.1,128.9,144,"10.5px Calibri, Arial, sans-serif");
    text(ctx,d.nric,397.1,143.0,144,"10.5px Calibri, Arial, sans-serif");
    text(ctx,Number.isFinite(d.loan)&&d.loan>0?`RM ${money(d.loan)}`:"",424.9,184.7,117,"10.6px Calibri, Arial, sans-serif");
    text(ctx,d.period?`${d.period} years`:"",424.5,200.1,110,"10.6px Calibri, Arial, sans-serif");
    text(ctx,d.model,120.5,213.3,145,"10.2px Calibri, Arial, sans-serif");
    text(ctx,d.year,329.2,213.3,30,"10.2px Calibri, Arial, sans-serif");
    text(ctx,d.color,402.1,213.3,140,"10.2px Calibri, Arial, sans-serif");
    text(ctx,Number.isFinite(d.net)&&d.net>0?money(d.net):"",251.6,235.9,86,"7.5px Calibri, Arial, sans-serif","right");
    text(ctx,Number.isFinite(d.otr)&&d.otr>0?money(d.otr):"",253.5,528.2,86,"7.8px Calibri, Arial, sans-serif","right");
    // Y-coordinate sebenar nombor dalam PDF setiap varian, dengan nilai null sebagai ruang kosong.
    const feeText=(key,y,size="7.5px")=>{
      const val=d.fees[key];
      if(val===null||val===undefined)return;
      text(ctx,money(val),253.4,y,43,size+" Calibri, Arial, sans-serif","right");
    };
    feeText("gst",247.0,"7.0px");
    feeText("handling",303.9);
    feeText("plate",327.3);
    feeText("accessory",337.2);
    feeText("registration",449.4);
    feeText("roadTax",460.5);
    feeText("claim",471.5);
    feeText("insurance",482.7);
    // The original VSO number is blank; drafts must not resemble issued dealership originals.
    text(ctx,"DRAF",255,101.1,38,"bold 10px Calibri, Arial, sans-serif");
  };
  function fitPreview(){
    if(!templateAvailable)return;
    const allowed=Math.max(240,viewport.clientWidth-22);
    const width=Math.min(allowed,820);
    previewCanvas.style.width=width+"px";
    previewCanvas.style.height=(width*sample.height/sample.width)+"px";
  }
  function drawPreview(){
    if(!blankImage)return;
    const ctx=previewCanvas.getContext("2d",{alpha:false});
    ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,previewCanvas.width,previewCanvas.height);
    ctx.drawImage(blankImage,0,0,previewCanvas.width,previewCanvas.height);
    ctx.setTransform(outputResolution,0,0,outputResolution,0,0);
    drawFields(ctx,validData());ctx.setTransform(1,0,0,1,0,0);
    fitPreview();latest=null;
  }
  const showStatus=(s,ok=false)=>{status.textContent=s;status.className=ok?"vsoExactOk":"vsoExactWait"};
  async function setTemplate(data,persist=false){
    const img=new Image();
    await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error("Templat tidak boleh dibaca."));img.src=data;});
    baseData=data;blankImage=img;templateAvailable=true;
    prep.classList.add("vso-template-loaded");
    E("vsoTemplateHelp").innerHTML="✓ <b>Templat VSO asal aktif.</b> Isi sahaja maklumat pelanggan, kereta dan pinjaman. Logo, jadual dan unsur lain dikekalkan.";
    blankHint.style.display="none";previewCanvas.style.display="block";
    drawPreview();
    showStatus(persist?"✓ Templat asal berjaya diproses. Menyimpan templat kosong...":"✓ Template asal tersedia. Anda boleh terus jana VSO.",true);
    if(persist){
      try{
        const database=await openDb();
        await new Promise((resolve,reject)=>{
          const tx=database.transaction("template","readwrite");
          tx.objectStore("template").put({id:key,data,createdAt:Date.now()});
          tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
        });
        database.close();showStatus("✓ Templat asal sedia digunakan dan disimpan dalam pelayar ini.",true);
      }catch(err){showStatus("✓ Templat tersedia untuk sesi ini sahaja. Storan pelayar disekat.",true);}
    }
  }
  function openDb(){
    return new Promise((resolve,reject)=>{
      if(!("indexedDB" in window))return reject(Error("Penyimpanan tidak disokong."));
      const req=indexedDB.open("proton-vso-template-v1",1);
      req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains("template"))req.result.createObjectStore("template",{keyPath:"id"});};
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
  }

  // Semua pengguna mendapat salinan templat bersih dari pelayan, tidak kira browser,
  // storan setempat, telefon atau jenis peranti. Ini bukan data pelanggan.
  async function loadCentralTemplate(){
    try{
      const centralUrl=new URL("assets/vso-master-variants-blank.png?v=variants-20261022",document.baseURI).href;
      await setTemplate(centralUrl,false);
      showStatus("✓ Templat VSO asal telah dimuatkan secara automatik dari server. Sedia digunakan di mana-mana browser.",true);
    }catch(error){
      console.warn("Templat pusat tidak dapat dimuatkan, cuba templat setempat:",error);
      await restore();
      if(!templateAvailable){
        showStatus("Templat pusat gagal dimuatkan. Cuba segar semula halaman, atau gunakan pilihan muat naik templat sendiri.");
      }else{
        showStatus("✓ Menggunakan templat setempat sebagai sandaran.",true);
      }
    }
  }

  async function restore(){
    try{
      const database=await openDb();
      const row=await new Promise((resolve,reject)=>{
        const tx=database.transaction("template","readonly");
        const request=tx.objectStore("template").get(key);
        request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
      });database.close();
      if(row?.data)await setTemplate(row.data,false);
    }catch(e){/* A fresh session can still upload a template. */}
  }
  async function fromPdf(file){
    if(!file||!file.name.toLowerCase().endsWith(".pdf"))throw Error("Sila pilih fail PDF sahaja.");
    if(file.size>20*1024*1024)throw Error("Fail PDF terlalu besar (maksimum 20 MB).");
    if(!window.pdfjsLib)throw Error("Pustaka pembaca PDF belum dimuatkan.");
    const pdf=await pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
    if(pdf.numPages!==1){await pdf.destroy();throw Error("Templat perlu mempunyai tepat satu halaman A4.");}
    const page=await pdf.getPage(1),v=page.getViewport({scale:1});
    if(Math.abs(v.width-sample.width)>15||Math.abs(v.height-sample.height)>15){await pdf.destroy();throw Error("Templat mesti satu halaman A4 potret dengan reka letak asal.");}
    const content=await page.getTextContent();
    const body=content.items.map(x=>x.str).join(" ").toLowerCase();
    if(!body.includes("vehicle sales order")||!body.includes("approved net selling price")||!body.includes("road price")){
      await pdf.destroy();throw Error("PDF tidak sepadan dengan template asal VSO Lon G Puncak.");
    }
    const canvas=document.createElement("canvas");
    canvas.width=Math.round(sample.width*outputResolution);
    canvas.height=Math.round(sample.height*outputResolution);
    const ctx=canvas.getContext("2d",{alpha:false});
    await page.render({canvasContext:ctx,viewport:page.getViewport({scale:outputResolution}),background:"rgb(255,255,255)"}).promise;
    // Erase supplied sample's confidential customer information and old prices in pixels.
    // Only a sanitized raster, never original PDF bytes, is persisted to indexedDB.
    ctx.save();ctx.setTransform(outputResolution,0,0,outputResolution,0,0);
    ctx.fillStyle="#fff";for(const [x0,y0,x1,y1] of boxes)ctx.fillRect(x0,y0,x1-x0,y1-y0);
    ctx.restore();
    const cleanData=canvas.toDataURL("image/jpeg",.95);
    await pdf.destroy();
    canvas.width=1;canvas.height=1;
    await setTemplate(cleanData,true);
  }
  E("vsoExactUpload").addEventListener("change",async e=>{
    const file=e.target.files?.[0];if(!file)return;
    showStatus("Menganalisis dan menyalin reka letak VSO asal...");
    try{await fromPdf(file);}catch(err){showStatus("Ralat template: "+err.message);}
    e.target.value="";
  });
  async function createExact(){
    if(!templateAvailable){showStatus("Pilih templat VSO asal dahulu. Format lama tidak lagi digunakan.");E("vsoExactUpload").click();return null;}
    const d=validData();
    if(!d.customer){showStatus("Sila isi nama penuh pelanggan.");E("vsoCustomer").focus();return null;}
    if(!Number.isFinite(d.loan)||d.loan<=0){showStatus("Loan Amount mesti lebih daripada RM0.");E("vsoLoan").focus();return null;}
    if(!d.color||!d.year){showStatus("Lengkapkan warna dan tahun pembuatan.");return null;}
    if(d.kind==="PLAIN"&&d.loan>d.otr){showStatus("Loan tidak boleh melebihi OTR asal bagi VSO tanpa markup.");return null;}
    if(d.net<=0){showStatus("Jumlah pinjaman tidak menghasilkan harga bersih positif.");return null;}
    if(buildBusy)return null;
    buildBusy=true;
    const buttons=[E("vsoDownload"),E("vsoDownloadBottom"),E("vsoToCompiler")];
    buttons.forEach(x=>x.disabled=true);
    try{
      drawPreview();
      const jpg=previewCanvas.toDataURL("image/jpeg",.97);
      const pdf=await PDFLib.PDFDocument.create();
      const image=await pdf.embedJpg(jpg);
      const page=pdf.addPage([sample.width,sample.height]);
      page.drawImage(image,{x:0,y:0,width:sample.width,height:sample.height});
      const bytes=await pdf.save({useObjectStreams:true});
      const blob=new Blob([bytes],{type:"application/pdf"});
      const fname=(d.customer.toUpperCase().replace(/[^A-Z0-9]+/g,"_").slice(0,37)||"CUSTOMER")+"_"+d.variant.id+"_"+(d.kind==="MARKUP"?"MARKUP_90":"TANPA_MARKUP")+"_VSO_DRAF.pdf";
      showStatus("✓ PDF VSO DRAF siap dijana daripada template asal.",true);
      return {blob,fname};
    }catch(err){showStatus("Gagal menjana PDF: "+err.message);return null;}
    finally{buildBusy=false;buttons.forEach(x=>x.disabled=false);}
  }
  async function downloadExact(){
    const r=await createExact();if(!r)return;
    const url=URL.createObjectURL(r.blob),a=document.createElement("a");
    a.href=url;a.download=r.fname;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),4000);
  }
  async function toCompiler(){
    const r=await createExact();if(!r)return;
    try{
      if(typeof addFiles!=="function"||typeof switchParty!=="function")throw Error("Modul Compiler belum sedia.");
      const file=new File([r.blob],r.fname,{type:"application/pdf"});
      switchParty("HIRER");
      document.querySelector('[data-main="COMPILER"]')?.click();
      await addFiles([file]);
      showStatus("✓ VSO sudah dihantar ke Compiler.",true);
    }catch(err){showStatus("Tidak berjaya hantar ke Compiler: "+err.message);}
  }
  E("vsoDownload").onclick=downloadExact;
  E("vsoDownloadBottom").onclick=downloadExact;
  E("vsoToCompiler").onclick=toCompiler;
  controlledFields.forEach(id=>E(id)?.addEventListener("input",drawPreview));
  host.querySelectorAll("[data-vso-mode]").forEach(x=>x.addEventListener("click",()=>requestAnimationFrame(drawPreview)));
  window.addEventListener("resize",fitPreview);
  if(typeof ResizeObserver!=="undefined")new ResizeObserver(fitPreview).observe(viewport);
  loadCentralTemplate();
})();