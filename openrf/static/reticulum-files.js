'use strict';
/* v0.2.159: explicit, bounded RNS.Resource peer file transfer controls. */
(()=>{
  const el=id=>document.getElementById(id);
  if(!el('reticulum-files-panel'))return;
  const limit=2*1024*1024;
  let enabled=false;
  let busy=false;
  let refreshing=false;
  const note=(message,error=false)=>{
    el('reticulum-file-notice').textContent=message;
    el('reticulum-file-notice').classList.toggle('error',error);
  };
  async function request(path,body){
    const response=await fetch(path,body===undefined?{cache:'no-store'}:{
      method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body)});
    let result;
    try{result=await response.json();}
    catch(_){throw Error('Invalid response from local file service.');}
    if(!response.ok)throw Error(result.error||`File request failed (${response.status}).`);
    return result;
  }
  function controls(){
    const file=el('reticulum-file-picker').files?.[0];
    const address=el('reticulum-file-destination').value.trim();
    el('reticulum-file-send').disabled=!enabled||busy||!file||file.size<1||file.size>limit||
      !/^[0-9a-fA-F]{32}$/.test(address)||!file.name||file.name.length>100||
      file.name==='.'||file.name==='..'||/[/\\\x00-\x1f\x7f]/.test(file.name);
    el('reticulum-file-announce').disabled=!enabled||busy;
    el('reticulum-file-picker').disabled=!enabled||busy;
    el('reticulum-file-arm').disabled=!enabled||busy;
    el('reticulum-file-disarm').disabled=!enabled||busy;
  }
  function render(report){
    enabled=report.enabled===true;
    el('reticulum-file-my-address').value=enabled?report.file_address:'Enable Reticulum first';
    const seconds=Number(report.receiving_armed_seconds)||0;
    el('reticulum-file-window').textContent=seconds
      ?`Receiving ARMED for up to ${seconds} more seconds · one file only · limit 2 MiB · no automatic save.`
      :'Receiving OFF. Arm only when expecting one transfer from a trusted sender.';
    el('reticulum-file-arm').disabled=!enabled||busy||seconds>0;
    el('reticulum-file-disarm').disabled=!enabled||busy||seconds===0;
    const box=el('reticulum-file-transfers');box.replaceChildren();
    if(!Array.isArray(report.transfers)||!report.transfers.length){
      const empty=document.createElement('p');empty.className='small muted';
      empty.textContent='No transfers this session.';box.append(empty);
    }
    for(const item of report.transfers||[]){
      if(!/^[0-9a-f]{32}$/.test(item.id||''))continue;
      const row=document.createElement('div');row.className='reticulum-file-row';
      const info=document.createElement('div');info.className='reticulum-file-info';
      const heading=document.createElement('strong');heading.textContent=String(item.filename||'Unnamed file');
      const detail=document.createElement('small');detail.className='muted';
      const progress=typeof item.progress==='number'&&Number.isFinite(item.progress)
        ?` · ${Math.round(Math.max(0,Math.min(1,item.progress))*100)}%` : '';
      detail.textContent=`${item.direction==='IN'?'Incoming':'Outgoing'} · ${(Number(item.size)/1024).toFixed(1)} KiB · ${String(item.status||'UNKNOWN').replaceAll('_',' ')}${progress}`;
      info.append(heading,detail);row.append(info);
      if(item.direction==='IN'&&item.status==='RECEIVED_READY'&&item.available===true){
        const link=document.createElement('a');link.className='btn mini outline';
        link.href=`/api/reticulum/files/download/${item.id}`;link.textContent='Download';row.append(link);
      }
      if(['CONNECTING','TRANSFERRING','RECEIVING'].includes(item.status)){
        const cancel=document.createElement('button');cancel.className='btn mini outline';
        cancel.textContent='Cancel';cancel.type='button';cancel.disabled=busy;
        cancel.addEventListener('click',async()=>{
          if(!window.confirm('Cancel this transfer? It cannot be resumed automatically.'))return;
          await action('/api/reticulum/files/cancel',{id:item.id},'Cancel requested.');
        });row.append(cancel);
      }
      box.append(row);
    }
    controls();
    el('reticulum-file-arm').disabled=!enabled||busy||seconds>0;
    el('reticulum-file-disarm').disabled=!enabled||busy||seconds===0;
  }
  async function refresh(){
    if(refreshing)return;
    refreshing=true;
    try{render(await request('/api/reticulum/files/status'));}
    catch(error){note(error.message,true);}
    finally{refreshing=false;}
  }
  async function action(path,payload,message){
    if(busy)return;
    busy=true;controls();
    try{
      const result=await request(path,payload);
      note(result.status?`${result.status.replaceAll('_',' ')}. ${result.note||''}`:message);
      await refresh();
      return result;
    }catch(error){note(error.message,true);return null;}
    finally{busy=false;controls();}
  }
  el('reticulum-file-announce').addEventListener('click',()=>action('/api/reticulum/files/announce',{},'File address announcement requested; peer reception unverified.'));
  el('reticulum-file-arm').addEventListener('click',()=>{
    if(!window.confirm('Receive the next offered file for up to five minutes? Anyone who knows your file address can offer one while armed. Only accept on a trusted link.'))return;
    action('/api/reticulum/files/arm',{enabled:true},'Receiving one file is armed for five minutes.');
  });
  el('reticulum-file-disarm').addEventListener('click',()=>action('/api/reticulum/files/arm',{enabled:false},'Receiving disarmed.'));
  el('reticulum-file-refresh').addEventListener('click',refresh);
  el('reticulum-file-destination').addEventListener('input',controls);
  el('reticulum-file-picker').addEventListener('change',controls);
  el('reticulum-file-send-form').addEventListener('submit',async event=>{
    event.preventDefault();
    if(busy||!enabled)return;
    const file=el('reticulum-file-picker').files?.[0];
    const destination=el('reticulum-file-destination').value.trim();
    if(!file||file.size<1||file.size>limit){note('Choose a file up to 2 MiB.',true);return;}
    if(!/^[0-9a-fA-F]{32}$/.test(destination)){note('Enter the peer file address, not the LXMF chat address.',true);return;}
    if(!window.confirm(`Send ${file.name} (${(file.size/1024).toFixed(1)} KiB) to file address ${destination}? The receiver must explicitly arm a file window. Transfer may be slow over radio.`))return;
    busy=true;controls();note('Reading selected file locally…');
    try{
      const base64=await new Promise((resolve,reject)=>{
        const reader=new FileReader();reader.onerror=()=>reject(Error('Could not read selected file.'));
        reader.onload=()=>{
          const raw=String(reader.result||'');const idx=raw.indexOf(',');
          if(idx<0)reject(Error('Invalid file encoding.'));else resolve(raw.slice(idx+1));
        };reader.readAsDataURL(file);
      });
      // File could change while the browser reads it; the server validates again.
      const result=await request('/api/reticulum/files/send',{
        destination,filename:file.name,data_base64:base64,confirm:true});
      note(`${result.status.replaceAll('_',' ')}. ${result.note||''}`);
      if(result.id)el('reticulum-file-picker').value='';
      await refresh();
    }catch(error){note(error.message,true);}
    finally{busy=false;controls();}
  });
  el('reticulum-files-panel').addEventListener('toggle',()=>{
    if(el('reticulum-files-panel').open)refresh();
  });
  setInterval(()=>{
    if(el('reticulum-files-panel').open&&el('page-reticulum')?.classList.contains('active')&&!busy)
      refresh();
  },3000);
  refresh();controls();
})();
