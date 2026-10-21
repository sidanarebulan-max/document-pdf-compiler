(function vsoBoot(){
  "use strict";
  const $ = sel=>document.querySelector(sel);
  const root=$('.app');
  if(!root) return;
  const base = {
    id:'EMAS5_PREMIUM_2026',
    model:'e.MAS 5 Premium',
    year:2026,
    otr:75800,
    feeList:[
      {key:'handling',label:'Inspection & Handling Fee',amount:200},
      {key:'plate',label:'Registration Number Plate',amount:98},
      {key:'registration',label:'Registration Fee',amount:300},
      {key:'roadTax',label:'Road tax',amount:60},
      {key:'claim',label:'H.P. Ownership Claim Fee',amount:50},
      {key:'insurance',label:'Insurance Premium Inc. 6% SST',amount:3000}
    ]
  };
  const fees=base.feeList.reduce((s,f)=>s+f.amount,0);
  let active='VSO',mode='PLAIN',lastBuild=null,lastFilename='',busy=false,previewScale=1;
  const esc=s=>String(s??'').replace(/[&<>"']/g,k=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[k]));
  const currency=n=>Number.isFinite(n)?'RM '+n.toLocaleString('en-MY',{minimumFractionDigits:0,maximumFractionDigits:0}):'—';
  const fmt=n=>Number.isFinite(n)?n.toLocaleString('en-MY',{maximumFractionDigits:0}):'—';
  const today=()=>{
    const d=new Date();
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  };
  const nav=document.createElement('div');nav.id='mainWorkspaceNav';
  nav.innerHTML=`
   <div class="hubBrand"><span class="hubEmblem">P</span><div><strong>Proton Document Center</strong><small>Vehicle Sales Order &amp; PDF Compiler</small></div></div>
   <div class="hubSwitch" role="tablist" aria-label="Bahagian utama">
    <button type="button" class="hubTab active" data-main="VSO" role="tab" aria-selected="true">01 <b>VSO Generator</b></button>
    <button type="button" class="hubTab" data-main="COMPILER" role="tab" aria-selected="false">02 <b>PDF Compiler</b></button>
   </div>`;
  root.parentNode.insertBefore(nav,root);
  const workspace=document.createElement('section');workspace.id='vsoWorkspace';
  root.parentNode.insertBefore(workspace,root);
  workspace.innerHTML=`
   <div class="vsoIntro"><div><div class="vsoEyebrow">VEHICLE SALES ORDER</div><h1>VSO Format Asal</h1><p>Format PDF asal dikekalkan. Hanya isi butiran pelanggan, kenderaan dan pinjaman. Semak dokumen A4 sebelum muat turun atau hantar ke Compiler.</p></div><div class="vsoVersion">Template 01 · e.MAS 5 Premium</div></div>
   <div class="vsoGrid">
    <aside class="vsoFormPanel">
     <div class="vsoSectionHead"><b>1. Pilih jenis VSO</b><span>2 pilihan</span></div>
     <div class="vsoModeGrid">
      <button type="button" data-vso-mode="PLAIN" class="vsoModeCard active"><strong>Tanpa Markup</strong><small>OTR asal, tanpa rebate</small></button>
      <button type="button" data-vso-mode="MARKUP" class="vsoModeCard"><strong>Markup 90%</strong><small>Loan ÷ 90% = OTR</small></button>
     </div>
     <div class="vsoSectionHead"><b>2. Maklumat pelanggan</b><span>Untuk VSO</span></div>
     <div class="vsoFields">
      <label class="vsoField"><span>Nama penuh pelanggan *</span><input id="vsoCustomer" autocomplete="off" placeholder="Nama seperti kad pengenalan"></label>
      <label class="vsoField"><span>No. kad pengenalan</span><input id="vsoNric" inputmode="numeric" placeholder="Contoh: 980916085195"></label>
      <label class="vsoField"><span>Alamat surat menyurat</span><textarea id="vsoAddress" rows="3" placeholder="Alamat penuh pelanggan"></textarea></label>
      <div class="vsoFieldRow">
       <label class="vsoField"><span>No. telefon</span><input id="vsoPhone" type="tel" placeholder="01xxxxxxxx"></label>
       <label class="vsoField"><span>E-mel</span><input id="vsoEmail" type="email" placeholder="contoh@email.com"></label>
      </div>
     </div>
     <div class="vsoSectionHead"><b>3. Maklumat kereta</b><span>Medan boleh diisi</span></div>
     <div class="vsoFields">
      <label class="vsoField"><span>Model & varian</span><select id="vsoModel"><option value="EMAS5_PREMIUM_2026">Proton e.MAS 5 Premium — 2026</option></select></label>
      <div class="vsoFieldRow">
       <label class="vsoField"><span>Tahun pembuatan</span><input id="vsoYear" type="number" min="2000" max="2100" value="2026"></label>
       <label class="vsoField"><span>Warna kereta</span><input id="vsoColor" value="Rose Pink" placeholder="Warna kereta"></label>
      </div>
      <div class="vsoNotebox">Model dan harga lain akan ditambah selepas template VSO rasmi bagi setiap varian dibekalkan.</div>
     </div>
     <div class="vsoSectionHead"><b>4. Maklumat pinjaman</b><span>Medan boleh diisi</span></div>
     <div class="vsoFields">
       <label class="vsoField"><span>Loan Amount (RM) *</span><input id="vsoLoan" type="number" min="1" step="1" value="60800" inputmode="decimal"></label>
       <label class="vsoField"><span>Tempoh pinjaman</span><select id="vsoPeriod"><option value="9">9 tahun</option><option value="7">7 tahun</option><option value="5">5 tahun</option><option value="3">3 tahun</option></select></label>
       <div class="vsoMath">
        <div><small id="vsoOtrLabel">Harga OTR asal</small><strong id="vsoOtr">RM 75,800</strong></div>
        <div><small>Jumlah caj dalam VSO contoh</small><strong id="vsoCharges">RM 3,708</strong></div>
        <div><small>Govt. Approved Net Selling Price <sup>*</sup></small><strong id="vsoNet">RM 72,092</strong></div>
        <div class="vsoEquation" id="vsoEquation">OTR asal daripada template · Rebate RM0 · Markup RM0</div>
       </div>
       <div id="vsoNotice" class="vsoCaution" role="note"></div>
       <div id="vsoError" role="alert" hidden></div>
       <div class="vsoActions">
        <button type="button" class="vsoPrimary" id="vsoDownload">Jana &amp; Download PDF</button>
        <button type="button" class="vsoSecondary" id="vsoToCompiler">Hantar ke Compiler</button>
       </div>
       <p class="vsoLegalHint">* Nilai “Govt. Approved Net Selling Price” ialah pengiraan daripada contoh, bukan pengesahan kelulusan kerajaan/pengeluar. Semua VSO yang dijana ditandakan DRAF dan memerlukan pengesahan pengedar sebelum penggunaan rasmi.</p>
     </div>
    </aside>
    <main class="vsoPreviewPanel">
     <div class="vsoPreviewToolbar"><div><b>Pratonton VSO</b><small>1 muka surat · A4 · dikemas kini automatik</small></div><span id="vsoModeBadge">TANPA MARKUP</span></div>
     <div id="vsoPreviewViewport"><div id="vsoSheetFrame"><article id="vsoSheet" aria-label="Pratonton VSO A4"></article></div></div>
     <div class="vsoPreviewFooter"><span>Dokumen untuk semakan dalaman — bukan VSO yang telah diluluskan.</span><button type="button" id="vsoDownloadBottom" class="vsoSecondary">Download PDF</button></div>
    </main>
   </div>`;
  const E=id=>document.getElementById(id);
  function read(){
    const loan=Number(E('vsoLoan').value);
    const otr=mode==='MARKUP'?Math.round((loan/0.9)/10)*10:base.otr;
    return {
      name:E('vsoCustomer').value.trim(),
      nric:E('vsoNric').value.trim(),
      address:E('vsoAddress').value.trim(),
      phone:E('vsoPhone').value.trim(),
      email:E('vsoEmail').value.trim(),
      model:base.model,
      year:E('vsoYear').value.trim(),
      color:E('vsoColor').value.trim(),
      loan,
      period:E('vsoPeriod').value,
      otr,
      net:otr-fees,
      date:today(),
      mode
    };
  }
  function cleanFilename(name){
    return (name||'CUSTOMER').toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,70)||'CUSTOMER';
  }
  function sheetHTML(v){
    const money=n=>fmt(n);
    const row=(label,num,flag='')=>`<tr><td>${label}</td><td class="vsoMoney">${num===null?'':money(num)}</td></tr>`;
    return `
    <header class="vsoDocHeader"><div class="vsoSymbol">PROTON<br><span>EDAR</span></div><div class="vsoDealer"><strong>LON G PUNCAK SDN BHD</strong> <small>(Co. No. 1321406-X)</small><br><small>(Authorised Dealer for Proton Edar Sdn. Bhd.)<br>PT 3600, JALAN PERSIARAN PUNCAK ALAM 6,<br>42300 PUNCAK ALAM, SELANGOR DARUL EHSAN.<br>TEL:019-6873600</small></div><div class="vsoProton">PROTON</div></header>
    <div class="vsoDocTitle"><b>VEHICLE SALES ORDER</b><span><strong>VSO No:</strong> <i>Untuk diisi oleh pengedar</i></span><span>Date: ${esc(v.date)}</span></div>
    <div class="vsoCustomerTable">
      <table><tr><td class="vsoLbl">Customer Name:</td><td>${esc(v.name)}</td><td class="vsoLbl">Sales Advisor:</td><td>FARIS</td></tr>
      <tr><td class="vsoLbl">Mailing Address:</td><td rowspan="2">${esc(v.address).replace(/\n/g,'<br>')}</td><td class="vsoLbl">HP No:</td><td>${esc(v.phone)}</td></tr>
      <tr><td></td><td class="vsoLbl">NRIC:</td><td>${esc(v.nric)}</td></tr>
      <tr><td class="vsoLbl">NRIC/Passport:</td><td>${esc(v.nric)}</td><td class="vsoLbl">Finance:</td><td></td></tr>
      <tr><td class="vsoLbl">Contact/HPNo:</td><td>${esc(v.phone)}</td><td class="vsoLbl">Loan Amount:</td><td><b>${currency(v.loan)}</b></td></tr>
      <tr><td class="vsoLbl">Email:</td><td>${esc(v.email)}</td><td class="vsoLbl">Period:</td><td>${esc(v.period)} years</td></tr></table>
    </div>
    <div class="vsoVehicleRow"><b>Model/Description: <span>${esc(v.model)}</span></b><span>Year Made: <b>${esc(v.year)}</b></span><span>Colour: <b>${esc(v.color)}</b></span></div>
    <div class="vsoDocMiddle">
      <div class="vsoDocPrices"><div class="vsoPriceHeader"><span></span><span>RM</span></div>
       <table class="vsoPriceTable">
        ${row('Govt. Approved Net Selling Price*',v.net)}
        ${row('Inclusive of Approved Standard Accessories Excise Duty',null)}
        ${row('Sub Total (Sales Price)',null)}
        ${row('Inspection & Handling Fee',200)}
        ${row('Metallic Paint',null)}
        ${row('Registration Number plate',98)}
        ${row('Accessory Package',null)}
        <tr class="vsoBlank"><td></td><td></td></tr>
        ${row('Less Discount (If any)',0)}
        <tr class="vsoBlank"><td></td><td></td></tr>
        ${row('Total Sales Price',null)}
        ${row('Registration Fee',300)}
        ${row('Road tax',60)}
        ${row('H.P. Ownership Claim Fee',50)}
        ${row('Insurance Premium Inc. 6% SST',3000)}
        ${row('Sum Insured',null)}
        ${row('NCB',null)}
        <tr class="vsoPriceOtr"><td><strong>On The Road Price:</strong></td><td class="vsoMoney"><strong>${money(v.otr)}</strong></td></tr>
       </table>
      </div>
      <div class="vsoDocProfile">
        <h3>PAYMENT DUE FROM/TO CUSTOMER/FINANCE SOURCE</h3>
        <table class="vsoPayRows"><tr><td>Total Sales Price</td><td></td></tr><tr><td>Booking Fee</td><td>O/R:</td></tr><tr><td>Total Amount</td><td></td></tr><tr><td>Balance Customer</td><td></td></tr><tr><td>Balance Finance</td><td></td></tr></table>
        <h3>Customer Profile</h3>
        <table class="vsoProfileRows"><tr><td>Marital Status:</td><td></td></tr><tr><td>Race:</td><td></td></tr><tr><td>Income:</td><td></td></tr><tr><td>Occupation:</td><td></td></tr><tr><td>Sex:</td><td></td></tr><tr><td>Buyer Type:</td><td>New / Replacement / Additional</td></tr></table>
        <div class="vsoRemarks"><strong>Remark:</strong><div class="vsoModeNote">${v.mode==='MARKUP'?'Markup 90% — pengiraan anggaran':'Tanpa markup &amp; rebate'}</div></div>
        <div class="vsoTradeNote">Note: Lon G Puncak Sdn. Bhd. Do not deal any trade-in of used vehicle.</div>
      </div>
    </div>
    <div class="vsoPlease"><strong>Please Note</strong></div>
    <div class="vsoConditions">
     <p>All cheques should be made payable to LON G PUNCAK SDN BHD. If any payment to the company is made by CASH, then insist on an Official Receipt immediately. Upon any payment to the company, you should insist on an Official Receipt and if you have not received any Official Receipt within 3 days of payment, please notify the Sales Office at 017-6168130 immediately. Price subject to change without prior notice.</p>
     <p>The company may use the information provided herein for any purpose related to the sale of the vehicle and/or accessories to you and any other purpose as reasonably determined by the company or PROTON EDAR SDN BHD from time to time. The company may disclose the information provided herein to any third party in order to carry out the aforementioned purposes. The information requested in this form is obligatory and failure to provide accurate information may result in the company not being able to carry out the sale of the vehicle and/or accessories.</p>
     <p>I, the Customer, have read and understood the above terms and conditions and I acknowledge and unconditionally agree to them.</p>
     <p class="vsoDisclaimer">* Harga dan pecahan caj dikira daripada template contoh yang diberikan. Pengesahan harga diluluskan, caj insurans dan terma pembiayaan mesti dibuat oleh pengedar sebelum VSO rasmi dikeluarkan.</p>
    </div>
    <div class="vsoSignatures"><div>Customer<br>Signature Date:</div><div>Sales Advisor: FARIS<br>Signature Date:</div><div>Verified By Manager<br>Date:</div></div>
    <div class="vsoWatermark">DRAF • UNTUK SEMAKAN</div>`;
  }
  function updatePreview(){
    const v=read();
    E('vsoSheet').innerHTML=sheetHTML(v);
    E('vsoOtr').textContent=currency(v.otr);
    E('vsoCharges').textContent=currency(fees);
    E('vsoNet').textContent=currency(v.net);
    E('vsoModeBadge').textContent=mode==='MARKUP'?'MARKUP 90%':'TANPA MARKUP';
    E('vsoOtrLabel').textContent=mode==='MARKUP'?'OTR daripada Loan ÷ 90%':'Harga OTR asal';
    if(mode==='MARKUP'){
      const diff=v.otr-base.otr;
      E('vsoEquation').textContent=`${currency(v.loan)} ÷ 0.90 ≈ ${currency(v.otr)} (dibundarkan kepada RM10) · OTR − ${currency(fees)} = ${currency(v.net)}`;
      E('vsoNotice').textContent=`OTR asas model dalam contoh ialah ${currency(base.otr)}. Kiraan markup menghasilkan perbezaan ${currency(diff)}. Angka ini belum disahkan sebagai harga jualan diluluskan dan tidak boleh digunakan untuk mengelirukan institusi pembiaya.`;
    }else{
      E('vsoEquation').textContent=`OTR asal ${currency(base.otr)} − caj ${currency(fees)} = ${currency(v.net)} · Rebate RM0 · Markup RM0`;
      E('vsoNotice').textContent='Harga OTR dikekalkan daripada contoh VSO e.MAS 5 Premium. Kadar insurans dan caj lain perlu disahkan oleh pengedar.';
    }
    lastBuild=null;lastFilename='';
    resize();
  }
  function resize(){
    const view=E('vsoPreviewViewport'),frame=E('vsoSheetFrame'),sheet=E('vsoSheet');
    if(!view||!frame||!sheet)return;
    previewScale=Math.min(1,(view.clientWidth-24)/794);
    sheet.style.transform=`scale(${previewScale})`;
    frame.style.width=(794*previewScale)+'px';
    frame.style.height=(1123*previewScale)+'px';
  }
  function switchMain(target){
    active=target==='COMPILER'?'COMPILER':'VSO';
    workspace.style.display=active==='VSO'?'':'none';
    root.style.display=active==='COMPILER'?'':'none';
    nav.querySelectorAll('[data-main]').forEach(b=>{
      const on=b.dataset.main===active;b.classList.toggle('active',on);b.setAttribute('aria-selected',String(on));
    });
    if(active==='VSO')requestAnimationFrame(resize);
    window.scrollTo({top:0,behavior:'auto'});
  }
  function setMode(value){
    mode=value==='MARKUP'?'MARKUP':'PLAIN';
    if(mode==='MARKUP'&&Number(E('vsoLoan').value)===60800)E('vsoLoan').value='72800';
    if(mode==='PLAIN'&&Number(E('vsoLoan').value)===72800)E('vsoLoan').value='60800';
    workspace.querySelectorAll('[data-vso-mode]').forEach(b=>b.classList.toggle('active',b.dataset.vsoMode===mode));
    updatePreview();
  }
  function validate(v){
    if(!v.name)return 'Masukkan nama penuh pelanggan.';
    if(!Number.isFinite(v.loan)||v.loan<=0)return 'Loan Amount mesti melebihi RM0.';
    if(!Number.isFinite(v.otr)||v.otr<=0)return 'Harga OTR tidak sah.';
    if(v.net<=0)return 'Harga bersih selepas caj tidak sah.';
    if(!v.year||!/^\d{4}$/.test(v.year))return 'Masukkan tahun kereta yang sah.';
    if(!v.color)return 'Masukkan warna kereta.';
    if(v.mode==='PLAIN'&&v.loan>v.otr)return 'Loan Amount tidak boleh melebihi OTR asal untuk VSO tanpa markup.';
    return '';
  }
  async function makePdf(){
    if(busy)return null;
    const v=read(),problem=validate(v);
    E('vsoError').hidden=true;
    if(problem){E('vsoError').textContent=problem;E('vsoError').hidden=false;E('vsoError').scrollIntoView({block:'nearest'});return null;}
    if(lastBuild)return {blob:lastBuild,name:lastFilename};
    busy=true;
    [E('vsoDownload'),E('vsoDownloadBottom'),E('vsoToCompiler')].forEach(b=>b.disabled=true);
    E('vsoDownload').textContent='Menjana PDF...';
    let holder;
    try{
      if(!window.html2canvas||!window.PDFLib)throw new Error('Pustaka PDF belum dimuatkan. Cuba segar semula halaman.');
      // Clone the full-size A4 sheet: screen preview is scaled for mobile.
      holder=document.createElement('div');
      holder.style.cssText='position:fixed;left:-12000px;top:0;width:794px;height:1123px;overflow:hidden;background:white;z-index:-1;';
      const sheet=E('vsoSheet').cloneNode(true);
      sheet.style.transform='none';sheet.style.position='relative';sheet.style.margin='0';
      holder.appendChild(sheet);document.body.appendChild(holder);
      const canvas=await window.html2canvas(sheet,{backgroundColor:'#ffffff',scale:1.75,useCORS:false,logging:false,windowWidth:1050});
      const png=canvas.toDataURL('image/jpeg',0.90);
      const pdf=await window.PDFLib.PDFDocument.create();
      const image=await pdf.embedJpg(png);
      const page=pdf.addPage([595.28,841.89]);
      page.drawImage(image,{x:0,y:0,width:595.28,height:841.89});
      const bytes=await pdf.save({useObjectStreams:true});
      lastBuild=new Blob([bytes],{type:'application/pdf'});
      lastFilename=`${cleanFilename(v.name)}_${mode==='MARKUP'?'MARKUP90':'TANPA_MARKUP'}_VSO_DRAF.pdf`;
      return {blob:lastBuild,name:lastFilename};
    }catch(err){
      E('vsoError').textContent='Gagal jana PDF: '+err.message;
      E('vsoError').hidden=false;
      return null;
    }finally{
      if(holder)holder.remove();
      busy=false;
      [E('vsoDownload'),E('vsoDownloadBottom'),E('vsoToCompiler')].forEach(b=>b.disabled=false);
      E('vsoDownload').textContent='Jana & Download PDF';
    }
  }
  async function download(){
    const out=await makePdf();if(!out)return;
    const url=URL.createObjectURL(out.blob);
    const a=document.createElement('a');a.href=url;a.download=out.name;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),2500);
  }
  async function sendToCompiler(){
    const out=await makePdf();if(!out)return;
    try{
      if(typeof switchParty!=='function'||typeof addFiles!=='function')throw new Error('Enjin Compiler belum sedia.');
      const file=new File([out.blob],out.name,{type:'application/pdf'});
      switchParty('HIRER');switchMain('COMPILER');
      await addFiles([file]);
      const fileSeen=typeof partyItems==='function'&&partyItems('HIRER').some(x=>x.file.name===out.name&&x.file.size===file.size);
      if(!fileSeen)throw new Error('Fail tidak disahkan dalam senarai Compiler.');
      const status=document.createElement('div');status.className='vsoTransferNotice';
      status.textContent='VSO berjaya dimasukkan ke tab Hirer / Peminjam. Semak pratonton sebelum gabung.';
      root.insertBefore(status,root.firstChild);
      setTimeout(()=>status.remove(),6500);
    }catch(err){
      E('vsoError').textContent='Tidak berjaya hantar ke Compiler: '+err.message;E('vsoError').hidden=false;
      switchMain('VSO');
    }
  }
  nav.querySelectorAll('[data-main]').forEach(b=>b.onclick=()=>switchMain(b.dataset.main));
  workspace.querySelectorAll('[data-vso-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.vsoMode));
  workspace.querySelectorAll('input,textarea,select').forEach(el=>el.addEventListener('input',updatePreview));
  E('vsoDownload').onclick=download;E('vsoDownloadBottom').onclick=download;E('vsoToCompiler').onclick=sendToCompiler;
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(resize).observe(E('vsoPreviewViewport'));
  window.addEventListener('resize',resize);
  window.VSO_CENTER={calculate(loan,kind='MARKUP'){
    const n=Number(loan),otr=kind==='MARKUP'?Math.round(n/.9/10)*10:base.otr;
    return {loan:n,otr,charges:fees,net:otr-fees,baseOtr:base.otr,mode:kind};
  },openVso:()=>switchMain('VSO'),openCompiler:()=>switchMain('COMPILER')};
  updatePreview();switchMain('VSO');
})();
