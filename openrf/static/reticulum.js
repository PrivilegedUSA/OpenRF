'use strict';
/* v0.2.83: opt-in Reticulum/LXMF over the local network, separate from Meshtastic. */
(()=>{
  const el=id=>document.getElementById(id);
  if(!el('reticulum-panel'))return;
  const state={enabled:false,busy:false,available:false,polling:false};
  const note=(message,error=false)=>{
    el('reticulum-status').textContent=message;
    el('reticulum-status').classList.toggle('error',error);
  };
  async function request(path,payload){
    const settings=payload===undefined?{cache:'no-store'}:{method:'POST',cache:'no-store',
      headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)};
    const response=await fetch(path,settings);
    let result;
    try{result=await response.json();}
    catch(_){throw Error('The local Reticulum service returned an unreadable response.');}
    if(!response.ok)throw Error(result.error||`Request failed (${response.status}).`);
    return result;
  }
  function updateControls(){
    const count=new TextEncoder().encode(el('reticulum-text').value).length;
    const validAddress=/^[0-9a-fA-F]{32}$/.test(el('reticulum-recipient').value.trim());
    el('reticulum-byte-count').textContent=`${count} / 1024 UTF-8 bytes${count>1024?' · too long':''}`;
    el('reticulum-byte-count').classList.toggle('error',count>1024);
    el('reticulum-enable').disabled=state.enabled||state.busy||!state.available;
    el('reticulum-disable').disabled=!state.enabled||state.busy;
    el('reticulum-announce').disabled=!state.enabled||state.busy;
    el('reticulum-send').disabled=!state.enabled||state.busy||count===0||count>1024||!validAddress;
  }
  function renderStatus(result){
    state.enabled=Boolean(result.enabled);
    state.available=Boolean(result.dependencies_available);
    el('reticulum-badge').textContent=state.enabled?'LAN ENABLED':'OFF';
    el('reticulum-address').value=state.enabled&&result.address?result.address:'Not enabled';
    updateControls();
    if(result.last_error)note(result.last_error,true);
    else if(state.enabled)note('Reticulum LAN enabled. Address announced on LAN. No destination delivery or RF reachability is assumed.');
    else if(!state.available)note('Reticulum is off. Optional Linux packages rns and lxmf are not installed.');
    else note('Reticulum is off. Press Enable only when you want local-network messaging.');
  }
  function renderInbox(rows){
    const box=el('reticulum-messages');
    const previous=box.scrollTop;
    const nearBottom=box.scrollHeight-box.scrollTop-box.clientHeight<24;
    box.replaceChildren();
    if(!rows.length){const p=document.createElement('p');p.className='small muted';
      p.textContent='No LXMF messages in this session.';box.append(p);return;}
    for(const message of rows){
      const article=document.createElement('article');article.className='mesh-message';
      const heading=document.createElement('strong');
      heading.textContent=`${message.direction==='IN'?'Received from':'To'} ${String(message.destination||'unknown')}`;
      const content=document.createElement('p');content.textContent=String(message.text||'');
      const detail=document.createElement('small');
      detail.textContent=`${String(message.status||'UNVERIFIED')} · ${String(message.utc||'UTC unknown')}`;
      article.append(heading,content,detail);box.append(article);
    }
    box.scrollTop=nearBottom?box.scrollHeight:previous;
  }
  async function refreshInbox(){
    if(state.polling||!state.enabled)return;
    state.polling=true;
    try{const result=await request('/api/reticulum/messages');renderInbox(result.messages||[]);}
    catch(error){note(error.message,true);}
    finally{state.polling=false;}
  }
  async function refreshStatus(){
    try{renderStatus(await request('/api/reticulum/status'));await refreshInbox();}
    catch(error){note(error.message,true);}
  }
  async function act(path,payload){
    state.busy=true;updateControls();
    try{
      const result=await request(path,payload);
      await refreshStatus();
      return result;
    }catch(error){note(error.message,true);return null;}
    finally{state.busy=false;updateControls();}
  }
  el('reticulum-enable').addEventListener('click',()=>act('/api/reticulum/start',{}));
  el('reticulum-disable').addEventListener('click',async()=>{
    const result=await act('/api/reticulum/stop',{});
    if(result?.worker_stopped){renderInbox([]);note('Reticulum stopped. LAN process closed.');}
  });
  el('reticulum-announce').addEventListener('click',async()=>{
    if(await act('/api/reticulum/announce',{}))note('Destination announcement requested; reaching any other device is not verified.');
  });
  el('reticulum-refresh').addEventListener('click',refreshStatus);
  el('reticulum-recipient').addEventListener('input',updateControls);
  el('reticulum-text').addEventListener('input',updateControls);
  el('reticulum-compose').addEventListener('submit',async event=>{
    event.preventDefault();
    if(!state.enabled||state.busy||el('reticulum-send').disabled)return;
    const result=await act('/api/reticulum/send',{
      destination:el('reticulum-recipient').value.trim(),text:el('reticulum-text').value});
    if(!result)return;
    if(result.status==='QUEUED_WITH_LXMF_NOT_DELIVERED'){
      el('reticulum-text').value='';updateControls();
      note('LXMF router accepted this message for delivery; recipient delivery is not confirmed.');
    }else if(result.status==='PATH_REQUESTED_NOT_SENT'){
      note('Route requested, but message was NOT sent. Wait for discovery, then send again.');
    }else note('Destination identity is not yet known. Nothing was sent.');
  });
  setInterval(()=>{if(state.enabled&&!state.busy&&el('page-messages')?.classList.contains('active'))refreshInbox();},5000);
  updateControls();
  refreshStatus();
})();
