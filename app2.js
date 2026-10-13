
  // Thumbnail sebenar bagi muka surat pertama, dijana sekali sahaja selepas upload.
  // Fail tidak dihantar ke pelayan.
  async function makeSourceThumbnail(item){
    if(item.thumbnail || item.thumbnailBusy)return;
    item.thumbnailBusy=true;
    const ext=extOf(item.file.name);
    try{
      let canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
      if(ext==='pdf'){
        const pdf=await pdfjsLib.getDocument({data:new Uint8Array(await item.file.arrayBuffer())}).promise;
        try{
          const page=await pdf.getPage(1);
          const vp=page.getViewport({scale:0.6});
          const factor=Math.min(1.5,180/Math.max(1,vp.width));
          const v=page.getViewport({scale:0.6*factor});
          canvas.width=Math.ceil(v.width);canvas.height=Math.ceil(v.height);
          await page.render({canvasContext:ctx,viewport:v,background:'rgb(255,255,255)'}).promise;
        }finally{await pdf.destroy();}
      }else if(['jpg','jpeg','png','webp','heic','heif'].includes(ext)){
        const blob=['heic','heif'].includes(ext)?await imageToBlobForOCR(item.file):item.file;
        const bitmap=await createImageBitmap(blob);
        try{
          const factor=Math.min(1,200/Math.max(bitmap.width,bitmap.height));
          canvas.width=Math.max(1,Math.round(bitmap.width*factor));canvas.height=Math.max(1,Math.round(bitmap.height*factor));
          ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
        }finally{bitmap.close();}
      }else if(ext==='docx'){
        const raw=await mammoth.extractRawText({arrayBuffer:await item.file.arrayBuffer()});
        canvas.width=150;canvas.height=195;
        ctx.fillStyle='#fff';ctx.fillRect(0,0,150,195);ctx.fillStyle='#263247';ctx.font='11px sans-serif';
        let y=15;for(const line of (raw.value||'').split(/\r?\n/)){if(y>182)break;for(let pos=0;pos<line.length && y<=182;pos+=24){ctx.fillText(line.slice(pos,pos+24),7,y,136);y+=13;}}
      }else if(['xls','xlsx'].includes(ext)){
        const wb=XLSX.read(await item.file.arrayBuffer(),{type:'array'});
        canvas.width=150;canvas.height=195;ctx.fillStyle='#fff';ctx.fillRect(0,0,150,195);ctx.strokeStyle='#d6dfdf';ctx.fillStyle='#24314a';ctx.font='10px sans-serif';
        const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:''});
        for(let r=0;r<Math.min(rows.length,12);r++){ctx.strokeRect(3,r*16+2,144,16);ctx.fillText(rows[r].slice(0,3).join(' | ').slice(0,24),7,r*16+14,136);}
      }else if(ext==='txt'){
        canvas.width=150;canvas.height=195;ctx.fillStyle='#fff';ctx.fillRect(0,0,150,195);ctx.fillStyle='#263247';ctx.font='11px sans-serif';
        const lines=(await item.file.text()).split(/\r?\n/);let y=15;
        for(const line of lines){if(y>185)break;for(let pos=0;pos<line.length && y<=185;pos+=24){ctx.fillText(line.slice(pos,pos+24),7,y,136);y+=13;}}
      }else return;
      item.thumbnail=canvas.toDataURL('image/jpeg',0.76);
    }catch(e){item.thumbnailError=true;log('Thumbnail tidak tersedia untuk '+item.file.name+': '+e.message);}
    finally{
      item.thumbnailBusy=false;
      const el=document.querySelector('[data-source-thumb="'+item.id+'"]');
      if(el && item.thumbnail)el.innerHTML='<img src="'+item.thumbnail+'" alt="Pratonton muka surat pertama">';
    }
  }

  function partyItems(party=activeParty){ return items.filter(x=>x.party===party); }

  async function analyzeItem(item){
    const ext=extOf(item.file.name); let data={text:'',pages:1};
    try{
      if(ext==='pdf') data=await extractPdfText(item.file);
      else if(ext==='docx') data=await extractDocxText(item.file);
      else if(['xlsx','xls'].includes(ext)) data=await extractXlsxText(item.file);
      else if(['jpg','jpeg','png','webp','heic','heif'].includes(ext)) data=await extractImageText(item.file);
      else if(ext==='txt') data={text:await item.file.text(),pages:1};
    }catch(e){ log(`Analisis gagal untuk ${item.file.name}: ${e.message}`); }
    item.text=data.text||''; item.pages=data.pages||1;
    const cls=classifyText(item.file.name,item.text);
    const signals=ext==='pdf' ? categorySignals(item.text) : [];
    item.mixed = signals.length>=2 ? signals : [];
    if(item.mixed.length>=2){
      if($('#autoClassify').checked || item.category==='OTHER') item.category='OTHER';
      item.confidence=20;
      item.review=true;
      item.note='PDF bercampur: '+item.mixed.join(' + ');
    }else{
      if($('#autoClassify').checked || item.category==='OTHER') item.category=cls.category;
      item.confidence=cls.confidence;
      item.review=item.confidence<35;
      item.note='';
    }
    item.date=detectDate(item.file.name+' '+item.text);
    item.analyzed=true;
  }

  async function addFiles(fileList){
    const accepted=['pdf','jpg','jpeg','png','webp','heic','heif','docx','xlsx','xls','txt'];
    const files=[...fileList].filter(f=>accepted.includes(extOf(f.name)));
    const rejected=[...fileList].filter(f=>!accepted.includes(extOf(f.name)));
    rejected.forEach(f=>log(`Format tidak disokong: ${f.name}`));
    for(const file of files){
      items.push({
        id:crypto.randomUUID(),
        file,
        party:activeParty,
        category:'OTHER',
        confidence:0,
        text:'',
        date:0,
        pages:1,
        order:sequence++,
        analyzed:false,
        review:true
      });
    }
    render();
    // Jana thumbnail secara berperingkat, bebas daripada analisis pengelasan.
    for(const item of items.filter(x=>files.includes(x.file)))makeSourceThumbnail(item);
    if(files.length){ await analyzeAll(false); }
  }

  async function analyzeAll(force=true){
    const current=partyItems();
    if(!current.length) return;
    setProgress(2,`Menganalisis ${PARTY_META[activeParty].short}...`);
    for(let i=0;i<current.length;i++){
      const item=current[i];
      if(force || !item.analyzed){
        setProgress(Math.round((i/current.length)*90)+5,`Analisis ${i+1}/${current.length}: ${item.file.name}`);
        await analyzeItem(item);
      }
    }
    if($('#autoSort').checked) sortParty(activeParty);
    setProgress(100,'Analisis selesai.');
    log(`Analisis selesai untuk ${current.length} fail ${PARTY_META[activeParty].short}.`);
    render();
  }

  function sortedPartyItems(party){
    const catOrder=Object.fromEntries(CATEGORIES.map(c=>[c.id,c.order]));
    return partyItems(party).slice().sort((a,b)=>{
      const c=catOrder[a.category]-catOrder[b.category]; if(c!==0)return c;
      if(a.category==='IC'){ const s=guessIcSide(a)-guessIcSide(b); if(s!==0)return s; }
      if(['PAYSLIP','BANK'].includes(a.category) && (a.date||b.date)) return (b.date||0)-(a.date||0);
      return a.order-b.order;
    });
  }

  function sortParty(party=activeParty){
    const sorted=sortedPartyItems(party);
    const others=items.filter(x=>x.party!==party);
    sorted.forEach((x,i)=>x.order=i);
    items=[...others,...sorted];
    log(`Susunan ${PARTY_META[party].short} dikemas kini.`);
    render();
  }

  function sortAllParties(){
    ['HIRER','GUARANTOR'].forEach(p=>{
      const sorted=sortedPartyItems(p);
      sorted.forEach((x,i)=>x.order=i);
    });
  }

  function moveItem(id,dir){
    const item=items.find(x=>x.id===id); if(!item)return;
    const group=items
      .filter(x=>x.party===item.party && x.category===item.category)
      .sort((a,b)=>a.order-b.order);
    const gi=group.findIndex(x=>x.id===id); const target=group[gi+dir]; if(!target)return;
    const tmp=item.order; item.order=target.order; target.order=tmp;
    render();
  }

  function removeItem(id){ items=items.filter(x=>x.id!==id); render(); }

  function changeCat(id,cat){
    const x=items.find(x=>x.id===id);
    if(x){ x.category=cat; x.review=false; sortParty(x.party); }
  }

  function formatDate(ts){
    if(!ts)return 'Tarikh tidak dikesan';
    const d=new Date(ts);
    return d.toLocaleDateString('ms-MY',{month:'long',year:'numeric'});
  }

  function switchParty(party){
    if(!PARTY_META[party]) return;
    partyNames[activeParty]=$('#partyName').value.trim();
    activeParty=party;
    $('.party-tab.active')?.classList.remove('active');
    document.querySelector(`.party-tab[data-party="${party}"]`)?.classList.add('active');

    const meta=PARTY_META[party];
    $('#inputPanelTitle').textContent=`1. Dokumen ${meta.short}`;
    $('#reviewPanelTitle').textContent=`2. Semak & Susun — ${meta.short}`;
    $('#partyBanner').innerHTML=`<b>${meta.label}</b><span>Masukkan dokumen ${party==='HIRER'?'peminjam':'penjamin'} di bahagian ini.</span>`;
    $('#dropTitle').textContent=party==='HIRER'?'Upload Dokumen Peminjam':'Upload Dokumen Penjamin';
    $('#partyNameLabel').innerHTML=`Nama ${meta.short} <span class="optional">Optional</span>`;
    $('#partyName').value=partyNames[party]||'';
    $('#fileInput').value='';
    setProgress(0,'Belum ada proses.');
    render();
  }


  // Pratonton fail asal sebelum digabungkan. Semua diproses dalam pelayar sahaja.
  let sourcePreviewToken=0;
  async function openSourcePreview(id){
    const it=items.find(x=>x.id===id); if(!it)return;
    const token=++sourcePreviewToken;
    let modal=document.getElementById('sourcePreviewModal');
    if(!modal){
      const style=document.createElement('style');
      style.textContent='.source-preview-overlay{position:fixed;inset:0;background:rgba(1,6,18,.91);z-index:99999;display:flex;align-items:center;justify-content:center;padding:15px}.source-preview-dialog{width:min(960px,100%);height:min(92vh,100%);background:#101b31;border:1px solid #395079;border-radius:16px;display:flex;flex-direction:column;overflow:hidden;color:#eaf1ff}.source-preview-header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 17px;border-bottom:1px solid #30405f}.source-preview-info{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.source-preview-info small{display:block;color:#9db4da;margin-top:4px}.source-preview-actions{display:flex;align-items:center;justify-content:center;gap:8px;padding:10px;border-bottom:1px solid #30405f;flex-wrap:wrap}.source-preview-actions button,.source-preview-close,.source-preview-btn{background:#234276;color:#fff;border:1px solid #5277bb;border-radius:8px;padding:7px 12px;cursor:pointer;font-size:12px}.source-preview-actions button:disabled{opacity:.35;cursor:default}.source-preview-btn{margin:6px 0;background:#1d396a}.source-preview-close{background:#692d40;flex-shrink:0}.source-preview-body{overflow:auto;min-height:0;flex:1;display:flex;align-items:flex-start;justify-content:center;padding:16px;background:#081120}.source-preview-body canvas{max-width:100%;height:auto;background:#fff}.source-preview-body img{max-width:100%;max-height:100%;object-fit:contain}.source-preview-body pre{background:#fff;color:#1a2234;padding:20px;width:100%;overflow:auto;white-space:pre-wrap}.source-preview-body table{background:#fff;color:#111;border-collapse:collapse;font-size:12px}.source-preview-body td,.source-preview-body th{border:1px solid #bbb;padding:5px}.source-preview-body .source-msg{padding:24px;text-align:center;color:#c5d5f0}.source-preview-body .source-doc{background:white;color:#222;width:100%;padding:28px;overflow-wrap:anywhere}.source-preview-body .source-doc img{max-width:100%}@media(max-width:600px){.source-preview-header{padding:9px}.source-preview-dialog{height:96vh}.source-preview-body{padding:7px}}';
      document.head.appendChild(style);
      modal=document.createElement('div');
      modal.id='sourcePreviewModal'; modal.className='source-preview-overlay'; modal.hidden=true;
      modal.innerHTML='<div class="source-preview-dialog" role="dialog" aria-modal="true" aria-label="Pratonton dokumen"><div class="source-preview-header"><div class="source-preview-info" id="sourcePreviewInfo"></div><button type="button" class="source-preview-close" id="sourcePreviewClose">Tutup ✕</button></div><div class="source-preview-actions" id="sourcePreviewActions"></div><div class="source-preview-body" id="sourcePreviewBody"></div></div>';
      document.body.appendChild(modal);
      modal.querySelector('#sourcePreviewClose').onclick=closeSourcePreview;
      modal.addEventListener('click',e=>{if(e.target===modal)closeSourcePreview()});
      document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!modal.hidden)closeSourcePreview()});
    }
    modal.hidden=false;modal.style.display='flex';
    const body=modal.querySelector('#sourcePreviewBody'),actions=modal.querySelector('#sourcePreviewActions');
    modal.querySelector('#sourcePreviewInfo').innerHTML='<strong>'+escapeHtml(it.file.name)+'</strong><small>'+escapeHtml(PARTY_META[it.party].label)+' · '+escapeHtml(it.category)+' · '+mb(it.file.size)+'</small>';
    body.innerHTML='<div class="source-msg">Memuatkan pratonton…</div>';actions.innerHTML='';
    const ext=extOf(it.file.name),file=it.file;
    const stillOpen=()=>token===sourcePreviewToken&&!modal.hidden;
    try{
      if(ext==='pdf'){
        const pdf=await pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
        let pageNo=1;
        const draw=async()=>{
          if(!stillOpen())return;
          body.innerHTML='<div class="source-msg">Memuatkan muka surat '+pageNo+'…</div>';
          const page=await pdf.getPage(pageNo);if(!stillOpen())return;
          const viewport=page.getViewport({scale:1.6});
          const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
          await page.render({canvasContext:canvas.getContext('2d'),viewport,background:'rgb(255,255,255)'}).promise;
          if(!stillOpen())return;
          body.replaceChildren(canvas);actions.querySelector('#sourcePageNum').textContent='Muka surat '+pageNo+' / '+pdf.numPages;
          actions.querySelector('#sourcePrev').disabled=pageNo<=1;
          actions.querySelector('#sourceNext').disabled=pageNo>=pdf.numPages;
          body.scrollTop=0;
        };
        if(!stillOpen())return;
        actions.innerHTML='<button id="sourcePrev" type="button">← Sebelum</button><span id="sourcePageNum"></span><button id="sourceNext" type="button">Seterusnya →</button>';
        actions.querySelector('#sourcePrev').onclick=()=>{if(pageNo>1){pageNo--;draw().catch(showPreviewError)}};
        actions.querySelector('#sourceNext').onclick=()=>{if(pageNo<pdf.numPages){pageNo++;draw().catch(showPreviewError)}};
        await draw();
      }else if(['jpg','jpeg','png','webp','heic','heif'].includes(ext)){
        const blob=['heic','heif'].includes(ext)?await imageToBlobForOCR(file):file;
        if(!stillOpen())return;
        const url=URL.createObjectURL(blob);
        const img=document.createElement('img');img.alt=file.name;img.onload=()=>URL.revokeObjectURL(url);img.onerror=()=>{URL.revokeObjectURL(url);showPreviewError(new Error('Imej gagal dipaparkan.'))};img.src=url;body.replaceChildren(img);
      }else if(ext==='txt'){
        const pre=document.createElement('pre');pre.textContent=await file.text();if(stillOpen())body.replaceChildren(pre);
      }else if(ext==='docx'){
        const result=await mammoth.convertToHtml({arrayBuffer:await file.arrayBuffer()});
        if(!stillOpen())return;
        const doc=document.createElement('div');doc.className='source-doc';
        // Mammoth output is sanitized by removing unsafe elements and event handlers.
        const tpl=document.createElement('template');tpl.innerHTML=result.value;
        tpl.content.querySelectorAll('script,iframe,object,embed,form,svg,math,style,link').forEach(n=>n.remove());
        tpl.content.querySelectorAll('*').forEach(el=>{[...el.attributes].forEach(a=>{if(/^on/i.test(a.name)||['srcdoc'].includes(a.name)||(['href','src'].includes(a.name)&&/^\s*(javascript|data:text\/html):/i.test(a.value)))el.removeAttribute(a.name)})});
        doc.appendChild(tpl.content);body.replaceChildren(doc);
      }else if(['xlsx','xls'].includes(ext)){
        const wb=XLSX.read(await file.arrayBuffer(),{type:'array'});
        if(!stillOpen())return;
        const picker=document.createElement('select');picker.setAttribute('aria-label','Pilih helaian');
        wb.SheetNames.forEach((name,i)=>picker.add(new Option(name,String(i))));
        const showSheet=()=>{const sheet=wb.Sheets[wb.SheetNames[Number(picker.value)]], rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:''});const table=document.createElement('table');rows.slice(0,250).forEach(row=>{const tr=table.insertRow();row.slice(0,30).forEach(value=>{const td=tr.insertCell();td.textContent=String(value)})});body.replaceChildren(table);body.scrollTop=0;};
        actions.replaceChildren(picker);picker.onchange=showSheet;showSheet();
      }else body.innerHTML='<div class="source-msg">Pratonton tidak disokong untuk format ini.</div>';
    }catch(err){if(stillOpen())showPreviewError(err)}
    function showPreviewError(err){if(stillOpen())body.innerHTML='<div class="source-msg">Pratonton gagal: '+escapeHtml(err.message||'Fail tidak dapat dibaca')+'</div>'}
  }
  function closeSourcePreview(){
    sourcePreviewToken++;
    const modal=document.getElementById('sourcePreviewModal');
    if(modal){modal.hidden=true;modal.style.display='none';modal.querySelector('#sourcePreviewBody').replaceChildren();}
  }

  function render(){
    const current=partyItems().sort((a,b)=>a.order-b.order);
    const hirerCount=partyItems('HIRER').length;
    const guarantorCount=partyItems('GUARANTOR').length;

    $('#hirerTabCount').textContent=`${hirerCount} fail`;
    $('#guarantorTabCount').textContent=`${guarantorCount} fail`;
    $('#fileCount').textContent=`${current.length} fail`;
    $('#totalFiles').textContent=current.length;
    $('#totalPages').textContent=current.reduce((s,x)=>s+(x.pages||1),0);
    $('#reviewCount').textContent=current.filter(x=>x.review).length;

    const container=$('#sections'); container.innerHTML='';
    for(const cat of CATEGORIES){
      const group=current.filter(x=>x.category===cat.id).sort((a,b)=>a.order-b.order);
      const sec=document.createElement('div'); sec.className='section';
      sec.innerHTML=`<div class="section-head"><div class="section-title">${cat.label}<span class="badge">${group.length}</span></div><span class="small">${cat.order.toString().padStart(2,'0')}</span></div><div class="file-list"></div>`;
      const fl=sec.querySelector('.file-list');
      if(!group.length){
        fl.innerHTML='<div class="empty">Optional — belum ada dokumen</div>';
      }else{
        group.forEach(it=>{
          const ext=extOf(it.file.name);
          const div=document.createElement('div'); div.className='file';
          div.innerHTML=`
            <button type="button" class="thumb source-thumb" data-source-thumb="${it.id}" title="Klik untuk lihat dokumen penuh">${it.thumbnail?`<img src="${it.thumbnail}" alt="Pratonton dokumen">`:`<span>${escapeHtml(ext)}<small>Memuatkan...</small></span>`}</button>
            <div class="meta">
              <div class="name" title="${escapeHtml(it.file.name)}">${escapeHtml(it.file.name)}</div>
              <div class="sub">${mb(it.file.size)} • ${it.pages||1} page • ${formatDate(it.date)} ${it.review?'• ⚠ semak':''}${it.note?' • '+escapeHtml(it.note):''}</div>
              <select class="select-mini">${CATEGORIES.map(c=>`<option value="${c.id}" ${c.id===it.category?'selected':''}>${c.label}</option>`).join('')}</select>
            </div>
            <div class="actions">
              <button type="button" class="source-preview-btn" title="Lihat kandungan dokumen">👁 Lihat</button>
              <button class="iconbtn up" title="Naik">↑</button>
              <button class="iconbtn down" title="Turun">↓</button>
              <button class="iconbtn danger del" title="Buang">×</button>
            </div>`;
          div.querySelector('.source-preview-btn').onclick=()=>openSourcePreview(it.id);
          div.querySelector('.source-thumb').onclick=()=>openSourcePreview(it.id);
          div.querySelector('select').onchange=e=>changeCat(it.id,e.target.value);
          div.querySelector('.up').onclick=()=>moveItem(it.id,-1);
          div.querySelector('.down').onclick=()=>moveItem(it.id,1);
          div.querySelector('.del').onclick=()=>removeItem(it.id);
          fl.appendChild(div);
        });
      }
      container.appendChild(sec);
    }
    renderChecklist();
  }

  function partySummary(party){
    const arr=partyItems(party);
    const counts=Object.fromEntries(CATEGORIES.map(c=>[c.id,arr.filter(x=>x.category===c.id).length]));
    const totalPages=arr.reduce((s,x)=>s+(x.pages||1),0);
    return {total:arr.length,totalPages,counts};
  }

  function renderChecklist(){
    const h=partySummary('HIRER');
    const g=partySummary('GUARANTOR');
    const row=(label,count)=>`<span class="summary-pill">${label} ${count}</span>`;
    $('#checklist').innerHTML=`
      <div class="party-summary">
        <div class="party-summary-head"><b>HIRER / PEMINJAM</b><span>${h.total} fail • ${h.totalPages} page</span></div>
        <div class="summary-pills">${row('VSO',h.counts.VSO)}${row('IC',h.counts.IC)}${row('Lesen',h.counts.LESEN)}${row('Payslip',h.counts.PAYSLIP)}${row('Bank',h.counts.BANK)}${row('Other',h.counts.OTHER)}</div>
      </div>
      <div class="party-summary">
        <div class="party-summary-head"><b>GUARANTOR / PENJAMIN</b><span>${g.total} fail • ${g.totalPages} page</span></div>
        <div class="summary-pills">${row('VSO',g.counts.VSO)}${row('IC',g.counts.IC)}${row('Lesen',g.counts.LESEN)}${row('Payslip',g.counts.PAYSLIP)}${row('Bank',g.counts.BANK)}${row('Other',g.counts.OTHER)}</div>
      </div>
      <div class="merge-status ${h.total&&g.total?'ready':''}">
        ${h.total&&g.total?'✓ Final PDF akan merge Hirer + Cover Guarantor + Guarantor':'Semua bahagian optional — isi satu pihak atau kedua-duanya.'}
      </div>`;
  }