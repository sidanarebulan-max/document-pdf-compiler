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
      items.push({id:crypto.randomUUID(),file,category:'OTHER',confidence:0,text:'',date:0,pages:1,order:sequence++,analyzed:false,review:true});
    }
    render();
    if(files.length){ await analyzeAll(false); }
  }

  async function analyzeAll(force=true){
    if(!items.length) return;
    setProgress(2,'Menganalisis dokumen...');
    for(let i=0;i<items.length;i++){
      const item=items[i];
      if(force || !item.analyzed){
        setProgress(Math.round((i/items.length)*90)+5,`Analisis ${i+1}/${items.length}: ${item.file.name}`);
        await analyzeItem(item);
      }
    }
    if($('#autoSort').checked) sortItems();
    setProgress(100,'Analisis selesai.');
    log(`Analisis selesai untuk ${items.length} fail.`);
    render();
  }

  function sortItems(){
    const catOrder=Object.fromEntries(CATEGORIES.map(c=>[c.id,c.order]));
    items.sort((a,b)=>{
      const c=catOrder[a.category]-catOrder[b.category]; if(c!==0)return c;
      if(a.category==='IC'){ const s=guessIcSide(a)-guessIcSide(b); if(s!==0)return s; }
      if(['PAYSLIP','BANK'].includes(a.category) && (a.date||b.date)) return (b.date||0)-(a.date||0);
      return a.order-b.order;
    });
    items.forEach((x,i)=>x.order=i);
    log('Susunan dokumen dikemas kini.');
    render();
  }

  function moveItem(id,dir){
    const idx=items.findIndex(x=>x.id===id); if(idx<0)return;
    const cat=items[idx].category;
    const group=items.filter(x=>x.category===cat);
    const gi=group.findIndex(x=>x.id===id); const target=group[gi+dir]; if(!target)return;
    const ti=items.findIndex(x=>x.id===target.id); [items[idx],items[ti]]=[items[ti],items[idx]];
    items.forEach((x,i)=>x.order=i); render();
  }

  function removeItem(id){ items=items.filter(x=>x.id!==id); render(); }
  function changeCat(id,cat){ const x=items.find(x=>x.id===id); if(x){x.category=cat;x.review=false;sortItems();} }

  function formatDate(ts){ if(!ts)return 'Tarikh tidak dikesan'; const d=new Date(ts); return d.toLocaleDateString('ms-MY',{month:'long',year:'numeric'}); }

  function render(){
    $('#fileCount').textContent=`${items.length} fail`;
    $('#totalFiles').textContent=items.length;
    $('#totalPages').textContent=items.reduce((s,x)=>s+(x.pages||1),0);
    $('#reviewCount').textContent=items.filter(x=>x.review).length;
    const container=$('#sections'); container.innerHTML='';
    for(const cat of CATEGORIES){
      const group=items.filter(x=>x.category===cat.id);
      const sec=document.createElement('div'); sec.className='section';
      sec.innerHTML=`<div class="section-head"><div class="section-title">${cat.label}<span class="badge">${group.length}</span></div><span class="small">${cat.order.toString().padStart(2,'0')}</span></div><div class="file-list"></div>`;
      const fl=sec.querySelector('.file-list');
      if(!group.length){ fl.innerHTML='<div class="empty">Belum ada dokumen</div>'; }
      else group.forEach(it=>{
        const ext=extOf(it.file.name); const div=document.createElement('div'); div.className='file';
        div.innerHTML=`
          <div class="thumb">${escapeHtml(ext)}</div>
          <div class="meta">
            <div class="name" title="${escapeHtml(it.file.name)}">${escapeHtml(it.file.name)}</div>
            <div class="sub">${mb(it.file.size)} • ${it.pages||1} page • ${formatDate(it.date)} ${it.review?'• ⚠ semak':''}${it.note?' • '+escapeHtml(it.note):''}</div>
            <select class="select-mini">${CATEGORIES.map(c=>`<option value="${c.id}" ${c.id===it.category?'selected':''}>${c.label}</option>`).join('')}</select>
          </div>
          <div class="actions"><button class="iconbtn up" title="Naik">↑</button><button class="iconbtn down" title="Turun">↓</button><button class="iconbtn danger del" title="Buang">×</button></div>`;
        div.querySelector('select').onchange=e=>changeCat(it.id,e.target.value);
        div.querySelector('.up').onclick=()=>moveItem(it.id,-1);
        div.querySelector('.down').onclick=()=>moveItem(it.id,1);
        div.querySelector('.del').onclick=()=>removeItem(it.id);
        fl.appendChild(div);
      });
      container.appendChild(sec);
    }
    renderChecklist();
  }

  function renderChecklist(){
    const counts=Object.fromEntries(CATEGORIES.map(c=>[c.id,items.filter(x=>x.category===c.id).length]));
    const checks=[
      ['VSO',counts.VSO>0,'VSO'],['IC',counts.IC>0,'IC'],['LESEN',counts.LESEN>0,'Lesen'],
      ['PAYSLIP',counts.PAYSLIP>=3,`Payslip ${counts.PAYSLIP}/3`],['BANK',counts.BANK>=1,`Bank Statement ${counts.BANK}`]
    ];
    $('#checklist').innerHTML=checks.map(([k,ok,label])=>`<div class="check"><span>${label}</span><b class="${ok?'ok':'warn'}">${ok?'✓':'⚠'}</b></div>`).join('');
  }
