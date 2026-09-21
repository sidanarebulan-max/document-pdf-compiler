pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
  const CATEGORIES = [
    {id:'VSO', label:'VSO', order:1},
    {id:'IC', label:'IC', order:2},
    {id:'LESEN', label:'LESEN', order:3},
    {id:'PAYSLIP', label:'PAYSLIP', order:4},
    {id:'BANK', label:'BANK STATEMENT', order:5},
    {id:'OTHER', label:'OTHER DOCUMENTS', order:6}
  ];
  const PARTY_META = {
    HIRER:{label:'HIRER / PEMINJAM', short:'Hirer / Peminjam'},
    GUARANTOR:{label:'GUARANTOR / PENJAMIN', short:'Guarantor / Penjamin'}
  };
  let activeParty = 'HIRER';
  let partyNames = {HIRER:'', GUARANTOR:''};
  let items = [];
  let finalBlob = null;
  let finalUrl = null;
  let finalPreviewPdf = null;
  let finalPreviewPage = 1;
  let lastProcessingName = '';
  let sequence = 0;

  const $ = s => document.querySelector(s);
  const log = (msg) => { const el=$('#log'); const t=new Date().toLocaleTimeString('ms-MY',{hour12:false}); el.textContent += `\n[${t}] ${msg}`; el.scrollTop=el.scrollHeight; };
  const setProgress=(pct,msg)=>{ if(pct!==null && pct!==undefined) $('#progressBar').style.width=`${Math.max(0,Math.min(100,pct))}%`; $('#progressText').textContent=msg||''; };
  const clearError=()=>{ const e=$('#errorBox'); e.style.display='none'; e.textContent=''; };
  const showError=(msg)=>{ const e=$('#errorBox'); e.textContent=msg; e.style.display='block'; };
  const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
  const escapeHtml = s => String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const extOf = name => (name.split('.').pop()||'').toLowerCase();
  const mb = n => (n/1024/1024).toFixed(2)+' MB';
  const normalize = s => (s||'').toLowerCase().replace(/[^a-z0-9À-ž\s]/g,' ');

  const monthMap = {jan:0,january:0,januari:0,feb:1,february:1,februari:1,mar:2,march:2,mac:2,apr:3,april:3,may:4,mei:4,jun:5,june:5,july:6,julai:6,aug:7,august:7,ogos:7,sep:8,september:8,sept:8,oct:9,october:9,oktober:9,nov:10,november:10,dec:11,december:11,disember:11};

  function detectDate(text){
    const s=(text||'').replace(/\s+/g,' ');
    let best=null;
    const monthRegex=/(jan(?:uary|uari)?|feb(?:ruary|ruari)?|mar(?:ch)?|mac|apr(?:il)?|may|mei|jun(?:e)?|jul(?:y|ai)?|aug(?:ust)?|ogos|sep(?:t(?:ember)?)?|oct(?:ober)?|oktober|nov(?:ember)?|dec(?:ember)?|disember)\s*[,'\/-]?\s*(20\d{2})/ig;
    for(const m of s.matchAll(monthRegex)){
      const mon=monthMap[m[1].toLowerCase()]; const y=+m[2]; const d=new Date(y,mon,1); if(!best||d>best)best=d;
    }
    const dmy=/(\b\d{1,2})[\/.\-](\d{1,2})[\/.\-](20\d{2}|\d{2})\b/g;
    for(const m of s.matchAll(dmy)){
      let y=+m[3]; if(y<100)y+=2000; const d=new Date(y,+m[2]-1,+m[1]); if(!Number.isNaN(+d)&&(!best||d>best))best=d;
    }
    const ym=/\b(20\d{2})[\/-](\d{1,2})\b/g;
    for(const m of s.matchAll(ym)){ const d=new Date(+m[1],+m[2]-1,1); if(!best||d>best)best=d; }
    return best ? +best : 0;
  }

  function classifyText(filename,text){
    const s=normalize(filename+' '+text);
    const rules=[
      ['VSO',['vehicle sales order','vso no','sales advisor','model description','on the road price']],
      ['LESEN',['lesen memandu','driving licence','driving license','kelas','tarikh tamat lesen']],
      ['PAYSLIP',['payslip','pay slip','salary slip','basic salary','net pay','total earning','epf employee','socso employee','gaji']],
      ['BANK',['bank statement','account transactions','statement date','beginning balance','ending balance','transaction amount','account number','penyata bank','urusniaga akaun']],
      ['IC',['kad pengenalan','mykad','nric','identity card','warganegara','ic depan','ic belakang','ic front','ic back']]
    ];
    let best={cat:'OTHER',score:0};
    for(const [cat,keys] of rules){
      let score=0; for(const k of keys){ if(s.includes(k)) score+= k.includes(' ') ? 3 : 1; }
      if(score>best.score) best={cat,score};
    }
    if(/\b(ic|mykad|nric)\b/i.test(filename) && best.score<4) best={cat:'IC',score:4};
    if(/\b(vso)\b/i.test(filename)) best={cat:'VSO',score:8};
    if(/lesen|licen[cs]e/i.test(filename)) best={cat:'LESEN',score:6};
    if(/pay\s?slip|salary/i.test(filename)) best={cat:'PAYSLIP',score:6};
    if(/bank|statement/i.test(filename)) best={cat:'BANK',score:5};
    return {category:best.cat, confidence:Math.min(100, best.score*16)};
  }

  function categorySignals(text){
    const s=normalize(text||'');
    const tests={
      VSO:['vehicle sales order','vso no','on the road price'],
      IC:['kad pengenalan','mykad','identity card','warganegara'],
      LESEN:['lesen memandu','driving licence','driving license'],
      PAYSLIP:['payslip','pay slip','basic salary','net pay','total earning','epf employee','socso employee'],
      BANK:['bank statement','account transactions','statement date','beginning balance','ending balance','urusniaga akaun']
    };
    return Object.entries(tests).filter(([,keys])=>keys.some(k=>s.includes(k))).map(([k])=>k);
  }

  function guessIcSide(item){
    const s=normalize(item.file.name+' '+(item.text||''));
    if(/belakang|back|reverse/.test(s)) return 2;
    if(/depan|front/.test(s)) return 0;
    return 1;
  }

  async function extractPdfText(file){
    const buf=await file.arrayBuffer();
    const pdf=await pdfjsLib.getDocument({data:buf}).promise;
    let out=''; const lim=Math.min(pdf.numPages,5);
    for(let p=1;p<=lim;p++){
      const page=await pdf.getPage(p); const tc=await page.getTextContent(); out+=' '+tc.items.map(x=>x.str).join(' ');
    }
    return {text:out,pages:pdf.numPages};
  }

  async function extractDocxText(file){
    const ab=await file.arrayBuffer();
    const result=await window.mammoth.extractRawText({arrayBuffer:ab});
    return {text:result.value||'',pages:1};
  }

  async function extractXlsxText(file){
    const ab=await file.arrayBuffer();
    const wb=XLSX.read(ab,{type:'array'}); let out='';
    for(const name of wb.SheetNames){ out+=' '+name+' '+XLSX.utils.sheet_to_csv(wb.Sheets[name],{blankrows:false}); }
    return {text:out,pages:Math.max(1,wb.SheetNames.length)};
  }

  async function imageToBlobForOCR(file){
    const ext=extOf(file.name);
    if(ext==='heic'||ext==='heif'){
      const converted=await heic2any({blob:file,toType:'image/jpeg',quality:.9});
      return Array.isArray(converted)?converted[0]:converted;
    }
    return file;
  }

  async function extractImageText(file){
    if(!$('#useOCR').checked) return {text:'',pages:1};
    const blob=await imageToBlobForOCR(file);
    const r=await Tesseract.recognize(blob,'eng');
    return {text:r.data.text||'',pages:1};
  }