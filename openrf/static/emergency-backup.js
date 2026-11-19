'use strict';
(() => {
  const $=id=>document.getElementById(id);
  async function post(path,payload){
    const res=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    if(!res.ok){const err=await res.json();throw Error(err.error||`HTTP ${res.status}`);}
    return res;
  }
  $('emergency-backup-form').addEventListener('submit',async event=>{
    event.preventDefault();const passphrase=$('emergency-backup-passphrase').value;
    const status=$('emergency-backup-info');const button=$('emergency-backup-download');
    if(passphrase!==$('emergency-backup-confirm').value){status.textContent='Passphrases do not match; no backup was created.';return;}
    if(!confirm('Download a password-encrypted copy of your entire main OpenRF database? It may contain sensitive personal or location records.'))return;
    button.disabled=true;
    try{
      const response=await post('/api/emergency/backup/create',{passphrase});
      const blob=await response.blob();const url=URL.createObjectURL(blob);
      const link=document.createElement('a');link.href=url;link.download='openrf-private-backup.orfbak';
      document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),15000);
      status.textContent='Encrypted snapshot prepared for download. Store it privately, remember your passphrase, and verify it before depending on it. No files restored.';
    }catch(error){status.textContent=`Backup unavailable: ${error.message}`;}
    finally{button.disabled=false;$('emergency-backup-passphrase').value='';$('emergency-backup-confirm').value='';}
  });
  $('emergency-backup-verify-form').addEventListener('submit',async event=>{
    event.preventDefault();const output=$('emergency-backup-preview'),file=$('emergency-backup-file').files?.[0];
    if(!file||file.size>24*1024*1024||file.size<100){output.textContent='Choose a supported encrypted backup file under 24 MiB.';return;}
    const passphrase=$('emergency-backup-verify-passphrase').value;
    output.textContent='Checking encrypted backup in memory; this will not restore files…';
    try{
      const response=await post('/api/emergency/backup/inspect',{passphrase,bundle:await file.text()});
      const data=await response.json();
      output.textContent=`Verified encrypted database snapshot. Local record counts: ${Object.entries(data.counts).map(([name,count])=>`${name}: ${count}`).join('; ')}. No restoration occurred.`;
    }catch(error){output.textContent=`Could not verify backup: ${error.message}`;}
    finally{$('emergency-backup-verify-passphrase').value='';}
  });
  async function readiness(){
    try{
      const res=await fetch('/api/emergency/backup/status');const data=await res.json();
      if(!data.available){$('emergency-backup-info').textContent='Optional cryptography library is unavailable. Encrypted backup is disabled until it is installed.';
        $('emergency-backup-download').disabled=true;}
    }catch(error){$('emergency-backup-info').textContent=`Backup readiness unavailable: ${error.message}`;}
  }
  document.addEventListener('openrf:emergency-shown',readiness);
})();
