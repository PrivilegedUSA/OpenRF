'use strict';
/* v0.2.161: user-consented OpenRF Bluetooth Classic RFCOMM file exchange. */
(()=>{
  const el=id=>document.getElementById(id);
  if(!el('bluetooth-file-panel'))return;
  const maxFile=2*1024*1024;
  const mac=/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i;
  let report=null,requesting=false,refreshing=false;
  const note=(message,error=false)=>{
    const status=el('bluetooth-file-notice');status.textContent=message;
    status.classList.toggle('error',error);
  };
  async function api(action,payload){
    const options=payload===undefined?{cache:'no-store'}:{method:'POST',cache:'no-store',
      headers:{'Content-Type':'application/json','X-OpenRF-Bluetooth-Consent':action},
      body:JSON.stringify(payload)};
    const response=await fetch(action==='status'?'/api/bluetooth/status':`/api/bluetooth/${action}`,options);
    let result;
    try{result=await response.json();}
    catch(_){throw Error('Unreadable response from the local Bluetooth file service.');}
    if(!response.ok)throw Error(result.error||`Bluetooth request failed (${response.status})`);
    return result;
  }
  function controls(){
    const enabled=Boolean(report?.supported&&report?.local_address);
    const selected=el('bluetooth-file-picker').files?.[0];
    const validFile=selected&&selected.size>0&&selected.size<=maxFile&&
      selected.name.length>0&&selected.name.length<=100&&
      selected.name!=='.'&&selected.name!=='..'&&!/[/\\\x00-\x1f\x7f]/.test(selected.name);
    el('bluetooth-arm').disabled=!enabled||requesting||!mac.test(el('bluetooth-expected-peer').value.trim())||
      Boolean(report?.busy)||Boolean(report?.receive_seconds);
    el('bluetooth-send').disabled=!enabled||requesting||Boolean(report?.busy)||
      Boolean(report?.receive_seconds)||!mac.test(el('bluetooth-destination').value.trim())||!validFile;
    el('bluetooth-cancel').disabled=requesting||!(report?.receive_seconds||report?.busy);
    el('bluetooth-file-picker').disabled=requesting||Boolean(report?.busy);
  }
  function render(status){
    report=status;
    const address=status.local_address;
    el('bluetooth-local-address').textContent=address||
      (status.supported?'No Linux Bluetooth controller detected':'Unavailable in this Linux/Python environment');
    el('bluetooth-receive-state').textContent=status.receive_seconds
      ?`Receiving ARMED for ${status.receive_peer}, ${status.receive_seconds}s left · one file only.`
      :'Receiving OFF. No Bluetooth listener is open.';
    const list=el('bluetooth-file-transfers');list.replaceChildren();
    const inbox=status.inbox;
    if(inbox&&/^[0-9a-f]{32}$/.test(inbox.id||'')){
      const row=document.createElement('div');row.className='bluetooth-transfer-row';
      const info=document.createElement('div');
      const title=document.createElement('strong');title.textContent=`Received: ${inbox.filename}`;
      const detail=document.createElement('small');detail.textContent=`${(inbox.size/1024).toFixed(1)} KiB · from ${inbox.peer} · checksum verified · held only in memory`;
      info.append(title,detail);row.append(info);
      const actions=document.createElement('div');actions.className='button-line';actions.style.marginTop='0';
      const link=document.createElement('a');link.className='btn mini primary';
      link.href=`/api/bluetooth/download/${inbox.id}`;link.textContent='Download file';
      const discard=document.createElement('button');discard.className='btn mini outline';discard.type='button';discard.textContent='Discard';
      discard.addEventListener('click',()=>{
        if(window.confirm('Discard the received file from memory? Download it first if you need to keep it.'))
          void action('discard',{},'Received file discarded.');
      });
      actions.append(link,discard);row.append(actions);list.append(row);
    }
    for(const transfer of status.transfers||[]){
      const row=document.createElement('div');row.className='bluetooth-transfer-row';
      const info=document.createElement('div');
      const title=document.createElement('strong');title.textContent=transfer.filename||'Bluetooth file';
      const detail=document.createElement('small');
      const progress=Number.isFinite(transfer.progress)?` · ${Math.round(transfer.progress*100)}%`:'';
      detail.textContent=`${transfer.direction==='IN'?'Incoming':'Outgoing'} · ${transfer.peer} · ${(Number(transfer.size)/1024).toFixed(1)} KiB · ${String(transfer.status).replaceAll('_',' ')}${progress}${transfer.error?' · '+transfer.error:''}`;
      info.append(title,detail);row.append(info);list.append(row);
    }
    if(!inbox&&!(status.transfers||[]).length){
      const empty=document.createElement('p');empty.className='small muted';
      empty.textContent='No Bluetooth files transferred in this app session.';list.append(empty);
    }
    controls();
  }
  async function refresh(){
    if(refreshing)return;
    refreshing=true;
    try{render(await api('status'));}
    catch(error){note(error.message,true);}
    finally{refreshing=false;}
  }
  async function action(kind,payload,success){
    if(requesting)return;
    requesting=true;controls();
    try{
      const response=await api(kind,payload);
      note(`${String(response.status||success||'Done').replaceAll('_',' ')}. ${response.note||''}`);
      await refresh();
      return response;
    }catch(error){note(error.message,true);return null;}
    finally{requesting=false;controls();}
  }
  el('bluetooth-expected-peer').addEventListener('input',controls);
  el('bluetooth-destination').addEventListener('input',controls);
  el('bluetooth-file-picker').addEventListener('change',controls);
  el('bluetooth-refresh').addEventListener('click',refresh);
  el('bluetooth-arm').addEventListener('click',()=>{
    const address=el('bluetooth-expected-peer').value.trim().toUpperCase();
    if(!mac.test(address))return note('Enter the exact paired sender address.',true);
    if(!window.confirm(`Receive ONE Bluetooth file from ${address} during the next five minutes? The device must already be paired and trusted. No file is saved automatically.`))return;
    void action('arm',{address,confirm:true},'Receiver armed.');
  });
  el('bluetooth-cancel').addEventListener('click',()=>{
    if(window.confirm('Stop waiting for Bluetooth files and cancel any ongoing transfer?'))
      void action('cancel',{},'Bluetooth receiving stopped.');
  });
  el('bluetooth-send-form').addEventListener('submit',async event=>{
    event.preventDefault();
    if(requesting||!report?.supported)return;
    const file=el('bluetooth-file-picker').files?.[0];
    const address=el('bluetooth-destination').value.trim().toUpperCase();
    if(!file||file.size<1||file.size>maxFile)return note('Choose one file between 1 byte and 2 MiB.',true);
    if(!mac.test(address))return note('Enter the paired receiver Bluetooth address.',true);
    if(!window.confirm(`Send ${file.name} (${(file.size/1024).toFixed(1)} KiB) via Bluetooth Classic to ${address}? The receiver must be armed and nearby.`))return;
    requesting=true;controls();note('Reading selected file locally. Nothing has been sent yet.');
    try{
      const data_base64=await new Promise((resolve,reject)=>{
        const reader=new FileReader();
        reader.onerror=()=>reject(Error('Could not read selected file.'));
        reader.onload=()=>{
          const raw=String(reader.result||'');const comma=raw.indexOf(',');
          if(comma<0)reject(Error('Invalid file encoding.'));else resolve(raw.slice(comma+1));
        };
        reader.readAsDataURL(file);
      });
      const result=await api('send',{address,filename:file.name,data_base64,confirm:true});
      note(`${result.status.replaceAll('_',' ')}. ${result.note}`);
      el('bluetooth-file-picker').value='';
      await refresh();
    }catch(error){note(error.message,true);}
    finally{requesting=false;controls();}
  });
  el('bluetooth-file-panel').addEventListener('toggle',()=>{
    if(el('bluetooth-file-panel').open)void refresh();
  });
  setInterval(()=>{
    if(el('bluetooth-file-panel').open&&el('page-reticulum')?.classList.contains('active')&&!requesting)
      void refresh();
  },3000);
  controls();
})();
