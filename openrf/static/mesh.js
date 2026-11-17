'use strict';
/* v0.2.90: reliable per-tab inbound sequence tracking and unread badges.
   No fake nodes, background connections or transmissions; storage is opt-in. */
(() => {
  const el=id=>document.getElementById(id);
  if(!el('mesh-panel'))return;
  const unreadKey='openrf.mesh.unread.v1';
  function restoredUnread(){
    try{
      const value=JSON.parse(window.sessionStorage?.getItem(unreadKey)||'null');
      if(value&&Number.isSafeInteger(value.sequence)&&value.sequence>=0&&
         Number.isSafeInteger(value.unread)&&value.unread>=0)
        return {receiveSequence:value.sequence,unread:value.unread};
    }catch(_){/* Blocked session storage must not prevent messaging. */}
    return {receiveSequence:null,unread:0};
  }
  const state={connected:false,mode:'normal',busy:false,polling:false,
    ...restoredUnread(),reticulumUnread:0};
  const viewingMessages=()=>Boolean(el('page-messages')?.classList.contains('active'));
  function renderUnread(){
    // The envelope is the total, but each sidebar child shows only its own
    // genuine incoming unread count. Never count sends or initial history.
    const reticulumUnread=state.reticulumUnread||0;
    const count=state.unread+reticulumUnread;
    for(const [id,value] of [
      ['mesh-header-unread',count],
      ['mesh-nav-unread',state.unread],
      ['reticulum-nav-unread',reticulumUnread],
      ['mesh-header-mesh-unread',state.unread],
      ['mesh-header-reticulum-unread',reticulumUnread]
    ]){
      const badge=el(id);if(!badge)continue;
      badge.hidden=value===0;
      badge.textContent=value>99?'99+':String(value);
    }
    const parent=el('messages-nav-toggle');
    parent?.classList?.toggle('has-unread',count>0);
    for(const [id,label,value] of [
      ['mesh-nav-item','Mesh messages',state.unread],
      ['reticulum-nav-item','Reticulum',reticulumUnread]
    ]){
      const button=el(id);
      button?.setAttribute('aria-label',value?`${label}, ${value} unread`:`${label}, no unread messages`);
    }
    const header=el('mesh-header-button');
    header.setAttribute('aria-label',count?`Choose message inbox, ${count} unread`:'Choose message inbox');
    header.title=count?`${count} unread message${count===1?'':'s'} (Meshtastic: ${state.unread}, Reticulum: ${state.reticulumUnread||0})`:'Choose message inbox';
    persistUnread();
  }
  function persistUnread(){
    try{
      if(state.receiveSequence!==null)window.sessionStorage?.setItem('openrf.mesh.unread.v1',
        JSON.stringify({sequence:state.receiveSequence,unread:state.unread}));
    }catch(_){/* Session counters remain live without storage. */}
  }
  function trackInbox(result){
    // The server counts *genuine inbound events*, not sent texts or old saved
    // rows. Establish a baseline on first load so historical chat is not new.
    const sequence=result?.receive_sequence;
    if(Number.isSafeInteger(sequence)&&sequence>=0){
      // A reconnect or server restart can reset the counter. Keep genuine
      // unread badges until opened, but don't synthesize new messages.
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
    el('mesh-send').disabled=!state.connected||state.mode!=='normal'||state.busy||
      new TextEncoder().encode(el('mesh-text').value).length>180;
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
    const diag=info.diagnostics||{};
    const diagnostics=el('mesh-diagnostics');diagnostics.replaceChildren();
    const field=(label,value)=>{
      const card=document.createElement('div');card.className='mesh-diagnostic';
      const head=document.createElement('strong');head.textContent=label;
      const item=document.createElement('span');item.textContent=value;
      card.append(head,item);diagnostics.append(card);
    };
    field('Meshtastic SDK',diag.sdk==='AVAILABLE'?'Available':'Not installed in Linux');
    field('USB link',diag.link==='OPEN'?'Connected to selected serial device; RF not tested':'Disconnected');
    field('Selected port',diag.selected_port||'None');
    field('LoRa reachability','Not tested · requires actual radios');
    const checks=Array.isArray(diag.usb_ports)?diag.usb_ports:[];
    field('Linux serial ports',checks.length?checks.map(p=>{
      const status={READ_WRITE_AVAILABLE:'read/write available',PERMISSION_BLOCKED:'permission blocked',
        NOT_CHARACTER_DEVICE:'not a serial character device',NOT_ACCESSIBLE_IN_LINUX:'not accessible'}[p.access]||'unknown';
      return `${p.port}: ${status}`;
    }).join(' · '):'No compatible USB serial ports enumerated');
    field('Firmware version','Unknown · not queried');
    renderButtons();
    if(info.last_error)note(info.last_error,true);
    else if(state.connected)note(`${info.port||'USB node'} connected. ${state.mode==='relay_only'?'Relay-focused: composing disabled.':'Normal mode: user-started text sending available.'} Radio reception and mesh rebroadcast are controlled by its firmware; link status does not prove RF coverage.`);
    else note(info.sdk_available? 'No mesh radio connected. Select a visible USB serial port and press Connect; no automatic connection or transmissions.' :
      'Optional Meshtastic Python package not found in this Linux environment. Install meshtastic and attach a USB node before connecting. Nothing is transmitting.');
  }
  let latestRows=[];
  let nicknames={};
  async function loadNodes(){
    const data=await request('/api/mesh/nodes');
    const rows=Array.isArray(data.nodes)?data.nodes:[];
    nicknames=Object.fromEntries(rows.map(item=>[item.id,item.alias||'']));
    const box=el('mesh-nodes');box.replaceChildren();
    if(!rows.length){const p=document.createElement('p');p.className='small muted';p.textContent='No recorded contacts.';box.append(p);return;}
    for(const item of rows){
      const button=document.createElement('button');button.type='button';button.className='mesh-node-choice';
      button.textContent=`${item.alias?item.alias+' · ':''}${item.id} · online unknown`;
      button.addEventListener('click',()=>{
        el('mesh-alias-node').value=item.id;
        el('mesh-alias-text').value=item.alias||'';
        el('mesh-destination').value=item.id;
      });
      box.append(button);
    }
  }
  let lastRenderedSignature='';
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
    el('mesh-reply-conversation').disabled=selector.value==='all'||!state.connected;
    const filtered=selector.value==='all'?latestRows:latestRows.filter(m=>conversationKey(m)===selector.value);
    const signature=JSON.stringify([selector.value,filtered]);
    if(signature===lastRenderedSignature)return;
    lastRenderedSignature=signature;

    const box=el('mesh-messages');box.replaceChildren();
    const oldScroll=box.scrollTop;
    const wasNearBottom=box.scrollHeight-box.scrollTop-box.clientHeight<28;
    if(!filtered.length){
      const p=document.createElement('p');p.className='small muted';
      p.textContent='No recorded messages in this conversation. A connected radio is required for actual messages.';box.append(p);return;
    }
    for(const m of filtered.slice(-1000)){
      const article=document.createElement('article');article.className='mesh-message';
      const title=document.createElement('div');title.className='mesh-message-head';
      const label=document.createElement('strong');label.textContent=`${m.direction==='IN'?'Received from':'Submitted to'} ${nicknames[m.node]?nicknames[m.node]+' · ':''}${m.node||'unknown node'} · channel ${Number.isInteger(m.channel)?m.channel:'?'}`;
      const time=document.createElement('span');time.textContent=m.received_at_utc||'UTC unavailable';
      title.append(label,time);
      const text=document.createElement('p');text.textContent=String(m.text||'');
      const delivery=document.createElement('small');delivery.textContent=m.direction==='IN'?'Reported by connected radio; sender authenticity unverified.':
        m.delivery==='ROUTING_ACK_REPORTED_NOT_READ'?'Routing acknowledgment reported by radio; not proof message was read.':
        m.delivery==='ROUTING_ERROR_REPORTED'?'Radio reported a routing error; delivery not confirmed.':
        'Submitted to connected radio; delivery not confirmed.';
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
    box.scrollTop=wasNearBottom?box.scrollHeight:oldScroll;
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
    try{renderStatus(await request('/api/mesh/status'));await loadNodes();await loadMessages();}
    catch(error){note(error.message,true);}
  }
  async function run(body,path){
    state.busy=true;renderButtons();
    try{const result=await request(path,body);await refresh();return result;}
    catch(error){note(error.message,true);return null;}
    finally{state.busy=false;renderButtons();}
  }
  el('mesh-conversation').addEventListener('change',()=>renderMessages(latestRows));
  el('mesh-reply-conversation').addEventListener('click',()=>{
    const key=el('mesh-conversation').value;
    if(key==='all'||!state.connected)return;
    const [node,channel]=key.split('|');
    if(!/^![0-9a-fA-F]{8}$/.test(node)){
      note('This conversation has no verified-format destination node. Choose a direct node manually.',true);return;
    }
    el('mesh-destination').value=node;
    if(/^[0-7]$/.test(channel))el('mesh-channel').value=channel;
    el('mesh-text').focus();
  });
  el('mesh-save-alias').addEventListener('click',async()=>{
    const node=el('mesh-alias-node').value.trim(),alias=el('mesh-alias-text').value.trim();
    const result=await run({node,alias},'/api/mesh/nodes/alias');
    if(result){lastRenderedSignature='';renderMessages(latestRows);note(alias?'Nickname saved on this device.':'Nickname removed.');}
  });
  function updateByteCount(){
    const count=new TextEncoder().encode(el('mesh-text').value).length;
    const label=el('mesh-byte-count');
    label.textContent=`${count} / 180 UTF-8 bytes${count>180?' · too long to send':''}`;
    label.classList.toggle('error',count>180);
    el('mesh-send').disabled=state.busy||!state.connected||state.mode!=='normal'||count>180;
  }
  el('mesh-text').addEventListener('input',updateByteCount);
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
      updateByteCount();
      note('Message submitted to the USB radio. Recipient delivery is NOT confirmed.');
    }
  });
  // Reticulum publishes its own genuine inbound-event count. The mesh script
  // owns the shared badge so both channels cannot overwrite each other.
  document.addEventListener('openrf:reticulum-unread',event=>{
    const count=event.detail?.count;
    if(Number.isSafeInteger(count)&&count>=0){state.reticulumUnread=count;renderUnread();}
  });
  document.addEventListener('openrf:messages-shown',()=>{
    state.unread=0;renderUnread();refresh();
  });
  // A read-only inbox poll continues across pages, so the header can indicate
  // real incoming texts without an open message page. No auto-connection,
  // radio scanning or transmission is initiated by this timer.
  setInterval(()=>{if(!state.busy)loadMessages();},4000);
  // Background tabs may throttle polling. Refresh immediately on returning;
  // this never connects to a radio or attempts to send anything.
  const resumeInbox=()=>{if(!state.busy)loadMessages();};
  window.addEventListener('focus',resumeInbox);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)resumeInbox();});
  renderButtons();
  updateByteCount();
  renderUnread();
  refresh();
})();
