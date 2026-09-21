(function(){
  const driveBtn = document.querySelector('#driveSaveBtn');
  const driveStatus = document.querySelector('#driveStatus');
  if(!driveBtn) return;

  async function blobToBase64(blob){
    return await new Promise((resolve,reject)=>{
      const r=new FileReader();
      r.onload=()=>resolve(String(r.result).split(',')[1]||'');
      r.onerror=reject;
      r.readAsDataURL(blob);
    });
  }

  async function checkDrive(){
    try{
      const r=await fetch('/api/health',{cache:'no-store'});
      const j=await r.json();
      if(j.configured){
        driveStatus.textContent='☁️ Google Drive ready';
        driveStatus.className='small drive-ok';
      }else{
        driveStatus.textContent='☁️ Drive belum dikonfigurasi';
        driveStatus.className='small drive-warn';
      }
    }catch(e){
      driveStatus.textContent='☁️ Drive API offline';
      driveStatus.className='small drive-warn';
    }
  }

  async function saveFinalToDrive(){
    if(!finalBlob){
      alert('Generate Final PDF dahulu.');
      return;
    }
    const customerName=(document.querySelector('#customerName')?.value||'').trim();
    const phone=(document.querySelector('#customerPhone')?.value||'').trim();
    if(!customerName && !phone){
      alert('Masukkan nama customer atau nombor telefon dahulu supaya sistem boleh padankan folder.');
      return;
    }

    driveBtn.disabled=true;
    const oldText=driveBtn.textContent;
    driveBtn.textContent='Saving to Drive...';
    try{
      const fileBase64=await blobToBase64(finalBlob);
      const r=await fetch('/api/save-generated',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          customerName,
          phone,
          fileBase64,
          outputFilename:safeFilename(),
          jobType:'LOAN_DOCUMENT',
          filesUsed:items.length,
          notes:'Generated from Document PDF Compiler web UI'
        })
      });
      const j=await r.json();
      if(!r.ok || !j.ok) throw new Error(j.error||('HTTP '+r.status));
      log('Google Drive: '+j.output.filename+' disimpan. File ID: '+j.output.driveFileId);
      driveStatus.textContent='✓ Saved to Google Drive';
      driveStatus.className='small drive-ok';
      if(j.output.webViewLink && confirm('PDF berjaya disimpan ke Google Drive. Buka fail sekarang?')){
        window.open(j.output.webViewLink,'_blank','noopener');
      }
    }catch(e){
      console.error(e);
      driveStatus.textContent='⚠ Drive save gagal';
      driveStatus.className='small drive-warn';
      alert('Gagal simpan ke Google Drive.\n\n'+e.message);
      log('Drive ERROR: '+e.message);
    }finally{
      driveBtn.textContent=oldText;
      driveBtn.disabled=!finalBlob;
    }
  }

  driveBtn.onclick=saveFinalToDrive;
  setInterval(()=>{ driveBtn.disabled=!finalBlob; },800);
  checkDrive();
})();