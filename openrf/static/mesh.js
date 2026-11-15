'use strict';
/* v0.2.77: independent message workspace and local unread indicator.
   No fake nodes, background connections or transmissions; storage is opt-in. */
(() => {
  const el=id=>document.getElementById(id);
  if(!el('mesh-panel'))return;
  const state={connected:false,mode:'normal',busy:false,polling:false,
    receiveSequence:null,unread:0};
  const viewingMessages=()=>Boolean(el('page-messages')?.classList.contains('active'));
  function renderUnread(){
    const count=state.unread,display=count>99?'99+':String(count);
    for(const id of ['mesh-header-unread','mesh-nav-unread']){
      const badge=el(id);if(!badge)continue;
      badge.hidden=count===0;badge.textContent=display;
    }
    const header=el('mesh-header-button');
    header.setAttribute('aria-label',count?`Open mesh messages, ${count} unread`:'Open mesh messages');
    header.title=count?`${count} unread mesh message${count===1?'':'s'}`:'Open mesh messages';
  }
  function trackInbox(result){
    // The server counts *genuine inbound events*, not sent texts or old saved
    // rows. Establish a baseline on first load so historical chat is not new.
    const sequence=result?.receive_sequence;
    if(Number.isSafeInteger(sequence)&&sequence>=0){
      if(state.receiveSequence!==null && sequence>state.receiveSequence && !viewingMessages()){
        const newlyReceived=sequence-state.receiveSequence;
        state.unread+=newlyReceived;
        // Keep driving/map view quiet: visible badge only, no live-region
        // announcement competing with safety-critical navigation prompts.
        if(!document.body.classList.contains('map-workspace'))
          el('mesh-global-announcer').textContent=`${newlyReceived} new mesh message${newlyReceived===1?'':'s'} received. Open Messages to read.`;
      }
      state.receiveSequence=sequence;
    }
    if(viewingMessages())state.unread=0;
    renderUnread();
  }
  const note=(text,error=false)=>{
    const node=el('mesh-status');node.textContent=text;node.classList.toggle('error',error);
  };
  async function request(path,body){
    const opts=body===undefined?{cache:'no-store'}:{method:'POST',cache:'no-store',
      headers:{'Content-Type':'application/json'},body:JSON.stringify(body)};
    const response=await fetch(path,opts);
    let result;
    try{result=await response.json();}
    catch(_){throw Error('Local mesh service returned an unreadable response.');}
    if(!response.ok)throw Error(result.error||`Mesh operation failed (${response.status}).`);
    return result;
  }
  function renderButtons(){
    const canConnect=!state.connected&&!state.busy&&Boolean(el('mesh-serial').value)&&state.sdkAvailable;
    el('mesh-connect').disabled=!canConnect;
    el('mesh-disconnect').disabled=!state.connected||state.busy;
    el('mesh-set-mode').disabled=state.busy;
    el('mesh-send').disabled=!state.connected||state.mode!=='normal'||state.busy;
    el('mesh-link-badge').textContent=state.connected?'USB LINK CONNECTED':'NOT CONNECTED';
  }
  function renderStatus(info){
    state.connected=Boolean(info.connected);state.mode=info.mode==='relay_only'?'relay_only':'normal';
    state.sdkAvailable=Boolean(info.sdk_available);
    const options=el('mesh-serial'),old=options.value;
    options.replaceChildren();
    const ports=Array.isArray(info.available_serial_ports)?info.available_serial_ports:[];
    if(!ports.length){
      const none=new Option('No Linux USB serial ports detected','');options.append(none);
    }else{
      for(const port of ports)options.append(new Option(port,port));
      if(ports.includes(old))options.value=old;
      else if(ports.includes(info.port))options.value=info.port;
    }
    options.disabled=state.connected||state.busy;
    el('mesh-mode').value=state.mode;
    el('mesh-save-history').checked=Boolean(info.history_enabled);
    el('mesh-save-history').disabled=!info.history_available;
    el('mesh-storage-label').textContent=info.history_enabled?'Private local history · last 1000':'Session only · last 100';
    renderButtons();
    if(info.last_error)note(info.last_error,true);
    else if(state.connected)note(`${info.port||'USB node'} connected. ${state.mode==='relay_only'?'Relay-focused: composing disabled.':'Normal mode: user-started text sending available.'} Radio reception and mesh rebroadcast are controlled by its firmware; link status does not prove RF coverage.`);
    else note(info.sdk_available? 'No mesh radio connected. Select a visible USB serial port and press Connect; no automatic connection or transmissions.' :
      'Optional Meshtastic Python package not found in this Linux environment. Install meshtastic and attach a USB node before connecting. Nothing is transmitting.');
  }
  let latestRows=[];
  function conversationKey(message){
    return `${message.node||'unknown node'}|${Number.isInteger(message.channel)?message.channel:'?'}`;
  }
  function renderMessages(rows){
    latestRows=Array.isArray(rows)?rows:[];
    const selector=el('mesh-conversation'), selected=selector.value;
    const keys=[...new Set(latestRows.map(conversationKey))].sort();
    selector.replaceChildren(new Option('All messages','all'));
    for(const key of keys){
      const [node,channel]=key.split('|');selector.append(new Option(`${node} · channel ${channel}`,key));
    }
    selector.value=keys.includes(selected)?selected:'all';
    const filtered=selector.value==='all'?latestRows:latestRows.filter(m=>conversationKey(m)===selector.value);

    const box=el('mesh-messages');box.replaceChildren();
    if(!filtered.length){
      const p=document.createElement('p');p.className='small muted';
      p.textContent='No recorded messages in this conversation. A connected radio is required for actual messages.';box.append(p);return;
    }
    for(const m of filtered.slice(-1000)){
      const article=document.createElement('article');article.className='mesh-message';
      const title=document.createElement('div');title.className='mesh-message-head';
      const label=document.createElement('strong');label.textContent=`${m.direction==='IN'?'Received from':'Submitted to'} ${m.node||'unknown node'} · channel ${Number.isInteger(m.channel)?m.channel:'?'}`;
      const time=document.createElement('span');time.textContent=m.received_at_utc||'UTC unavailable';
      title.append(label,time);
      const text=document.createElement('p');text.textContent=String(m.text||'');
      const delivery=document.createElement('small');delivery.textContent=m.direction==='IN'?'Reported by connected radio; sender authenticity unverified.':'Submitted to connected radio; delivery not confirmed.';
      article.append(title,text,delivery);
      if(m.direction==='IN' && /^![0-9a-fA-F]{8}$/.test(m.node||'') && state.connected){
        const reply=document.createElement('button');reply.type='button';reply.className='mesh-message-reply';
        reply.textContent='Reply to this node';
        reply.addEventListener('click',()=>{
          el('mesh-destination').value=m.node;
          if(Number.isInteger(m.channel)&&m.channel>=0&&m.channel<=7)el('mesh-channel').value=String(m.channel);
          el('mesh-text').focus();
        });
        article.append(reply);
      }
      box.append(article);
    }
    box.scrollTop=box.scrollHeight;
  }
  async function loadMessages(){
    if(state.polling)return;
    state.polling=true;
    try{
      const result=await request('/api/mesh/messages');
      trackInbox(result);
      if(viewingMessages())renderMessages(result.messages);
    }
    catch(error){note(error.message,true);}
    finally{state.polling=false;}
  }
  async function refresh(){
    try{renderStatus(await request('/api/mesh/status'));await loadMessages();}
    catch(error){note(error.message,true);}
  }
  async function run(body,path){
    state.busy=true;renderButtons();
    try{const result=await request(path,body);await refresh();return result;}
    catch(error){note(error.message,true);return null;}
    finally{state.busy=false;renderButtons();}
  }
  el('mesh-conversation').addEventListener('change',()=>renderMessages(latestRows));
  el('mesh-save-history').addEventListener('change',async event=>{
    const enabled=event.target.checked;
    const result=await run({enabled},'/api/mesh/history');
    if(!result)event.target.checked=!enabled;
    else note(enabled?'Local history enabled; future messages will be stored privately.':'Saved history deleted; future messages will stay in memory.');
  });
  el('mesh-clear-history').addEventListener('click',async ()=>{
    if(!window.confirm('Clear all session and saved mesh messages on this device?'))return;
    const result=await run({},'/api/mesh/history/clear');
    if(result){state.unread=0;renderUnread();note('Mesh message history cleared.');}
  });
  el('mesh-serial').addEventListener('change',renderButtons);
  el('mesh-connect').addEventListener('click',()=>run({port:el('mesh-serial').value},'/api/mesh/connect'));
  el('mesh-disconnect').addEventListener('click',()=>run({},'/api/mesh/disconnect'));
  el('mesh-set-mode').addEventListener('click',()=>run({mode:el('mesh-mode').value},'/api/mesh/mode'));
  el('mesh-refresh').addEventListener('click',refresh);
  el('mesh-compose').addEventListener('submit',async event=>{
    event.preventDefault();
    if(state.busy||!state.connected||state.mode!=='normal'){
      note('Connect a real USB node in Normal mode before sending.',true);return;
    }
    const text=el('mesh-text').value;
    if(new TextEncoder().encode(text).length>180){note('Message exceeds 180 UTF-8 bytes.',true);return;}
    const result=await run({text,destination:el('mesh-destination').value.trim(),
      channel:Number(el('mesh-channel').value)},'/api/mesh/send');
    if(result?.submitted_to_radio){
      el('mesh-text').value='';
      note('Message submitted to the USB radio. Recipient delivery is NOT confirmed.');
    }
  });
  document.addEventListener('openrf:messages-shown',refresh);
  // A read-only inbox poll continues across pages, so the header can indicate
  // real incoming texts without an open message page. No auto-connection,
  // radio scanning or transmission is initiated by this timer.
  setInterval(()=>{
    if(state.connected&&!state.busy)loadMessages();
  },4000);
  renderButtons();
  renderUnread();
  refresh();
})();
