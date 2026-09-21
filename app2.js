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
            <div class="thumb">${escapeHtml(ext)}</div>
            <div class="meta">
              <div class="name" title="${escapeHtml(it.file.name)}">${escapeHtml(it.file.name)}</div>
              <div class="sub">${mb(it.file.size)} • ${it.pages||1} page • ${formatDate(it.date)} ${it.review?'• ⚠ semak':''}${it.note?' • '+escapeHtml(it.note):''}</div>
              <select class="select-mini">${CATEGORIES.map(c=>`<option value="${c.id}" ${c.id===it.category?'selected':''}>${c.label}</option>`).join('')}</select>
            </div>
            <div class="actions">
              <button class="iconbtn up" title="Naik">↑</button>
              <button class="iconbtn down" title="Turun">↓</button>
              <button class="iconbtn danger del" title="Buang">×</button>
            </div>`;
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