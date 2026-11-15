'use strict';
/* v0.2.88: Reticulum inbox replies, address copying and dedicated screen. */
(()=>{
  const el=id=>document.getElementById(id);
  if(!el('reticulum-panel'))return;
  const state={enabled:false,busy:false,available:false,polling:false,
    receiveSequence:null,unread:0};
  const viewingMessages=()=>Boolean(el('page-reticulum')?.classList.contains('active'));
  function publishUnread(){
    document.dispatchEvent(new CustomEvent('openrf:reticulum-unread',
      {detail:{count:state.unread}}));
  }
  function trackInbox(result){
    // The worker increments this only for inbound LXMF messages with a
    // validated signature. Never count queued outgoing texts or old records.
    const sequence=result?.receive_sequence;
    if(Number.isSafeInteger(sequence)&&sequence>=0){
      if(state.receiveSequence!==null && sequence<state.receiveSequence)state.unread=0;
      if(state.receiveSequence!==null && sequence>state.receiveSequence && !viewingMessages()){
        const newlyReceived=sequence-state.receiveSequence;
        state.unread+=newlyReceived;
        if(!document.body.classList.contains('map-workspace'))
          el('mesh-global-announcer').textContent=`${newlyReceived} new Reticulum message${newlyReceived===1?'':'s'} received. Open Messages to read.`;
      }
      state.receiveSequence=sequence;
    }
    if(viewingMessages())state.unread=0;
    publishUnread();
  }
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
    el('reticulum-tcp-enable').disabled=state.enabled||state.busy;
    el('reticulum-disable').disabled=!state.enabled||state.busy;
    el('reticulum-announce').disabled=!state.enabled||state.busy;
    el('reticulum-send').disabled=!state.enabled||state.busy||count===0||count>1024||!validAddress;
  }
  function renderStatus(result){
    const wasEnabled=state.enabled;
    state.enabled=Boolean(result.enabled);
    state.available=Boolean(result.dependencies_available);
    if(!state.enabled){
      state.receiveSequence=null;
      state.unread=0;
      publishUnread();
    }else if(!wasEnabled)state.receiveSequence=null;
    if(state.enabled)el('reticulum-tcp-enable').checked=Boolean(result.tcp_enabled);
    el('reticulum-badge').textContent=state.enabled?'LAN ENABLED':'OFF';
    el('reticulum-address').value=state.enabled&&result.address?result.address:'Not enabled';
    updateControls();
    if(result.last_error)note(result.last_error,true);
    else if(state.enabled)note(result.tcp_enabled
      ?'Reticulum active with TCP listener requested on port 4242. Check interface details for live state; reception is unverified.'
      :'Reticulum LAN active. Address announce was requested; no remote reception or delivery is verified.');
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
      article.append(heading,content,detail);
      // A received LXMF row stores the sender hash in `destination`. Never
      // offer a reply to an outgoing row or a malformed/untrusted address.
      const sender=String(message.destination||'').trim();
      if(message.direction==='IN' && /^[0-9a-fA-F]{32}$/.test(sender)){
        const actions=document.createElement('div');actions.className='reticulum-message-actions';
        const reply=document.createElement('button');reply.type='button';
        reply.className='btn mini primary';reply.textContent='Reply';
        reply.setAttribute('aria-label',`Reply to LXMF sender ${sender}`);
        reply.addEventListener('click',()=>prefillReply(sender));
        const copy=document.createElement('button');copy.type='button';
        copy.className='btn mini outline';copy.textContent='Copy address';
        copy.setAttribute('aria-label',`Copy LXMF sender address ${sender}`);
        copy.addEventListener('click',()=>copySenderAddress(sender));
        actions.append(reply,copy);article.append(actions);
      }
      box.append(article);
    }
    box.scrollTop=nearBottom?box.scrollHeight:previous;
  }
  function prefillReply(sender){
    const recipient=el('reticulum-recipient');
    recipient.value=sender;
    updateControls();
    el('reticulum-text').focus();
    el('reticulum-compose').scrollIntoView({block:'nearest',behavior:'smooth'});
    note('Reply address filled. Write your message and press Send when ready.');
  }
  async function copySenderAddress(sender){
    try{
      if(!navigator.clipboard?.writeText)throw Error('Clipboard access unavailable');
      await navigator.clipboard.writeText(sender);
      note('Sender LXMF address copied to clipboard.');
    }catch(_){
      // Clipboard permission can be denied; leave the address selected for
      // the operator to copy manually. Never send or post it anywhere.
      const recipient=el('reticulum-recipient');
      recipient.value=sender;
      updateControls();
      recipient.focus();recipient.select();
      note('Clipboard unavailable. Sender address selected in the recipient field; copy it there.');
    }
  }
  const shown=value=>Number.isSafeInteger(value)&&value>=0?String(value):'unknown';
  function renderDiagnostics(report){
    const container=el('reticulum-interfaces');
    container.replaceChildren();
    const summary=document.createElement('p');summary.className='small muted';
    if(!report.active)summary.textContent='Reticulum is stopped. No live network interfaces to inspect.';
    else if(!report.available)summary.textContent=String(report.note||'RNS interface counters unavailable.');
    else summary.textContent=report.interfaces.length
      ?'Local Reticulum interface counters (not message receipts):'
      :'RNS returned zero interfaces; the TCP listener is not confirmed to be listening.';
    container.append(summary);
    for(const item of report.interfaces||[]){
      const entry=document.createElement('div');entry.className='reticulum-interface';
      const header=document.createElement('strong');header.textContent=String(item.name||'Unknown interface');
      const status=document.createElement('p');status.className='small';
      const up=item.up===true?'UP':item.up===false?'DOWN':'state unknown';
      status.textContent=`${up} · Peers: ${shown(item.reachable_peers)} · TCP clients: ${shown(item.connected_clients)}`;
      const traffic=document.createElement('p');traffic.className='small muted';
      traffic.textContent=`Received: ${shown(item.rx_bytes)} bytes · Sent: ${shown(item.tx_bytes)} bytes`;
      entry.append(header,status,traffic);container.append(entry);
    }
    const announced=el('reticulum-announce-detail');
    if(!report.active)announced.textContent='No live announce information. Remote reception is unverified.';
    else announced.textContent=`Announce requests this session: ${shown(report.announce_requests)} · Last request (UTC): ${String(report.last_announce_requested_at_utc||'unknown')} · Reception by another device: unverified.`;
    const tcp=el('reticulum-tcp-instructions');
    tcp.classList.toggle('reticulum-tcp-active',Boolean(report.active&&report.tcp_requested));
  }
  async function refreshDiagnostics(){
    try{renderDiagnostics(await request('/api/reticulum/diagnostics'));}
    catch(error){el('reticulum-interfaces').textContent=`Connection diagnostics unavailable: ${error.message}`;}
  }
  async function refreshInbox(){
    if(state.polling||!state.enabled)return;
    state.polling=true;
    try{const result=await request('/api/reticulum/messages');
      trackInbox(result);
      if(viewingMessages())renderInbox(result.messages||[]);}
    catch(error){note(error.message,true);}
    finally{state.polling=false;}
  }
  async function refreshStatus(){
    try{renderStatus(await request('/api/reticulum/status'));
      await Promise.all([refreshInbox(),refreshDiagnostics()]);}
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
  el('reticulum-enable').addEventListener('click',()=>act('/api/reticulum/start',
    {tcp_enabled:el('reticulum-tcp-enable').checked}));
  el('reticulum-disable').addEventListener('click',async()=>{
    const result=await act('/api/reticulum/stop',{});
    if(result?.worker_stopped){renderInbox([]);note('Reticulum stopped. LAN process closed.');}
  });
  el('reticulum-announce').addEventListener('click',async()=>{
    if(await act('/api/reticulum/announce',{}))note('Destination announcement requested; reaching any other device is not verified.');
  });
  el('reticulum-refresh').addEventListener('click',refreshStatus);
  el('reticulum-diagnostics-refresh').addEventListener('click',refreshDiagnostics);
  el('reticulum-diagnostics-panel').addEventListener('toggle',()=>{
    if(el('reticulum-diagnostics-panel').open)refreshDiagnostics();
  });
  el('reticulum-recipient').addEventListener('input',updateControls);
  el('reticulum-text').addEventListener('input',updateControls);
  document.addEventListener('openrf:reticulum-shown',()=>{
    state.unread=0;publishUnread();
    if(state.enabled)refreshInbox();
  });
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
  // The passive poll runs while messaging is enabled even when another page
  // is open. It never enables Reticulum, announces, sends or starts RF scans.
  setInterval(()=>{if(state.enabled&&!state.busy)refreshInbox();},5000);
  updateControls();
  publishUnread();
  refreshStatus();
})();
