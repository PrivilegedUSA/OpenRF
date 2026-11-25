'use strict';
/* MeshCore is independent of Meshtastic and LXMF. All sends require a click. */
(() => {
  const el = id => document.getElementById(id);
  if (!el('meshcore-panel')) return;
  const sessionKey = 'openrf.meshcore.unread.v1';
  let saved = null;
  try { saved = JSON.parse(window.sessionStorage?.getItem(sessionKey) || 'null'); } catch (_) {}
  const state = {connected:false, busy:false, sdk:false, port:null, selected:null,
    contacts:[], rows:[], sequence:Number.isSafeInteger(saved?.sequence)?saved.sequence:null,
    unread:Number.isSafeInteger(saved?.unread)&&saved.unread>=0?saved.unread:0,
    lastSignature:'', lastContactSignature:'', polling:false};
  const active = () => el('page-meshcore').classList.contains('active');
  const bytes = value => new TextEncoder().encode(value).length;
  const notice = (message, error=false) => {
    el('meshcore-status').textContent = message;
    el('meshcore-status').classList.toggle('error', error);
  };
  function messageNotice(message, error=false){
    el('meshcore-send-status').textContent=message;
    el('meshcore-send-status').classList.toggle('error',error);
  }
  async function request(path, body){
    const options = body===undefined ? {cache:'no-store'} :
      {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'};
    const response=await fetch(path,options);
    const data=await response.json();
    if(!response.ok)throw Error(data.error||`MeshCore operation failed (${response.status}).`);
    return data;
  }
  function renderUnread(){
    el('meshcore-mark-read').disabled=state.unread===0;
    el('meshcore-unread-label').textContent=state.unread
      ?`${state.unread} unread · review and mark all as read`:'No unread MeshCore messages';
    const tabBadge=el('meshcore-tab-unread');
    if(tabBadge){
      tabBadge.hidden=state.unread===0;
      tabBadge.textContent=state.unread>99?'99+':String(state.unread);
      el('meshcore-tab-inbox')?.setAttribute('aria-label',state.unread?`Inbox, ${state.unread} unread`:'Inbox');
    }
    try{window.sessionStorage?.setItem(sessionKey,JSON.stringify({sequence:state.sequence,unread:state.unread}));}catch(_){}
    document.dispatchEvent(new CustomEvent('openrf:meshcore-unread',{detail:{count:state.unread}}));
  }
  function trackInbox(response){
    const sequence=response?.receive_sequence;
    if(Number.isSafeInteger(sequence)&&sequence>=0){
      if(state.sequence!==null && sequence>state.sequence)state.unread+=sequence-state.sequence;
      else if(state.sequence!==null && sequence<state.sequence)state.unread=0; // New backend session.
      state.sequence=sequence;
    }
    renderUnread();
  }
  function updateControls(){
    const input=el('meshcore-port');
    input.disabled=state.busy||state.connected;
    el('meshcore-connect').disabled=state.busy||state.connected||!input.value||!state.sdk;
    el('meshcore-disconnect').disabled=state.busy||!state.port;
    el('meshcore-refresh').disabled=state.busy;
    const n=bytes(el('meshcore-text').value);
    el('meshcore-text').disabled=Boolean(state.selected)&&!state.contacts.some(c=>c.public_key===state.selected);
    el('meshcore-byte-count').textContent=`${n} / 120 UTF-8 bytes`;
    el('meshcore-byte-count').classList.toggle('error',n>120);
    el('meshcore-send').disabled=state.busy||!state.connected||!state.selected||
      !state.contacts.some(c=>c.public_key===state.selected)||!el('meshcore-text').value.trim()||n>120;
    el('meshcore-link-badge').textContent=state.connected?'USB LINK CONNECTED':state.port?'LINK UNAVAILABLE':'DISCONNECTED';
  }
  function renderStatus(info){
    state.connected=Boolean(info.connected);
    state.port=info.port||null;
    state.sdk=Boolean(info.sdk_available);
    const chooser=el('meshcore-port'),prior=chooser.value;
    const ports=Array.isArray(info.available_serial_ports)?info.available_serial_ports:[];
    chooser.replaceChildren();
    chooser.append(new Option(ports.length?'Choose USB serial port':'No USB serial ports visible',''));
    for(const port of ports)chooser.append(new Option(`${port} · candidate only`,port));
    chooser.value=ports.includes(prior)?prior:ports.includes(info.port)?info.port:'';
    const firmware=info.device||{};
    el('meshcore-device-info').textContent=state.connected
      ?`Selected port: ${state.port}. Model: ${firmware.model||'not reported'}. Firmware: ${firmware.version||firmware.firmware_version||'not reported'}. ${info.contact_count||0} contacts. RF network reachability not verified.`
      :`SDK: ${state.sdk?'available':'not installed in Linux'}. ${ports.length} USB candidate port(s). Neither firmware nor radio range can be identified by listing ports.`;
    if(info.last_error)notice(info.last_error,true);
    else if(state.connected)notice(`Connected to ${state.port}. Radio contact list available; network delivery not verified.`);
    else if(state.port)notice('MeshCore USB link was lost. Disconnect to release the session; do not assume outstanding messages delivered.',true);
    else notice(state.sdk?'No MeshCore Companion connected. Choose a visible port and press Connect; no automatic connection.':
      'MeshCore SDK is not installed in the Python interpreter running OpenRF. Install optional “meshcore” package, then refresh.');
    updateControls();
  }
  function contactName(key){
    if(key.startsWith('unknown:'))return `Unknown sender ${key.slice(8)||'(no key)'}`;
    const contact=state.contacts.find(item=>item.public_key===key);
    return contact?.name||`${key.slice(0,12)}…`;
  }
  const threadKey=row=>row.public_key||`unknown:${row.sender_prefix||''}`;
  function renderContacts(){
    const contacts=new Map(state.contacts.map(c=>[c.public_key,c]));
    for(const item of state.rows){
      const key=threadKey(item);
      if(!contacts.has(key))contacts.set(key,{public_key:key,name:''});
    }
    const signature=JSON.stringify([state.selected,Array.from(contacts.values()),state.rows.map(m=>[m.id,threadKey(m)])]);
    if(signature===state.lastContactSignature)return;
    state.lastContactSignature=signature;
    const directory=el('meshcore-directory-list');
    if(directory){
      directory.replaceChildren();
      if(!state.contacts.length){
        const p=document.createElement('p');p.className='small muted';
        p.textContent=state.connected?'This radio reports no saved contacts. Add them using a compatible MeshCore client, then Refresh on Dashboard.':'Connect a MeshCore Companion on Dashboard to load its saved contacts.';
        directory.append(p);
      }
      for(const contact of state.contacts){
        const button=document.createElement('button');button.type='button';
        button.className='meshcore-contact-choice';
        const title=document.createElement('strong');title.textContent=contact.name||`${contact.public_key.slice(0,12)}…`;
        const detail=document.createElement('small');detail.textContent=`${contact.public_key.slice(0,20)}… · stored on radio · online unknown`;
        button.append(title,detail);
        button.addEventListener('click',()=>openThread(contact.public_key));
        directory.append(button);
      }
    }
    const box=el('meshcore-contact-list');box.replaceChildren();
    const rows=[...contacts.values()].sort((a,b)=>{
      const last=key=>Math.max(0,...state.rows.filter(m=>threadKey(m)===key).map(m=>m.id));
      return last(b.public_key)-last(a.public_key) || (a.name||a.public_key).localeCompare(b.name||b.public_key);
    });
    if(!rows.length){
      const p=document.createElement('p');p.className='small muted';
      p.textContent=state.connected?'No contacts stored on this radio. Add contacts using a compatible MeshCore client and refresh.':'Connect a MeshCore radio to load contacts.';
      box.append(p);return;
    }
    for(const item of rows){
      const btn=document.createElement('button');btn.type='button';
      btn.className='meshcore-contact-choice';
      btn.classList.toggle('selected',item.public_key===state.selected);
      const label=document.createElement('strong');label.textContent=item.name||contactName(item.public_key);
      const detail=document.createElement('small');detail.textContent=`${item.public_key.slice(0,20)}… · ${state.contacts.some(c=>c.public_key===item.public_key)?'stored radio contact':'unmatched sender / session history'} · online unknown`;
      btn.append(label,detail);
      btn.addEventListener('click',()=>openThread(item.public_key));
      box.append(btn);
    }
  }
  const labelTime=value=>{
    const date=new Date(value);
    return Number.isNaN(date.getTime())?'UTC unavailable':date.toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
  };
  function nearBottom(box){return box.scrollHeight-box.clientHeight-box.scrollTop<70;}
  function scrollLatest(){const box=el('meshcore-messages');box.scrollTop=box.scrollHeight;}
  function renderConversation(forceBottom=false){
    const box=el('meshcore-messages');
    if(!state.selected)return;
    const rows=state.rows.filter(row=>threadKey(row)===state.selected)
      .sort((a,b)=>Date.parse(a.received_at_utc)-Date.parse(b.received_at_utc)||a.id-b.id);
    const signature=JSON.stringify([state.selected,rows.map(r=>[r.id,r.delivery,r.text])]);
    if(!forceBottom&&signature===state.lastSignature)return;
    const follow=forceBottom||nearBottom(box);
    box.replaceChildren();
    if(!rows.length){const p=document.createElement('p');p.className='small muted';p.textContent='No direct messages with this contact yet.';box.append(p);}
    for(const message of rows){
      const bubble=document.createElement('article');
      bubble.className=`mesh-message message-bubble ${message.direction==='OUT'?'message-outbound':'message-inbound'}`;
      const text=document.createElement('p');text.textContent=message.text;
      const meta=document.createElement('small');
      const delivery=message.direction==='OUT'
        ?message.delivery==='NETWORK_ACK_REPORTED_NOT_READ'?'Network ACK reported · not read':
          'Submitted to radio · network ACK not received'
        :'Received by radio · sender unverified';
      meta.textContent=`${labelTime(message.received_at_utc)} · ${delivery}`;
      bubble.append(text,meta);box.append(bubble);
    }
    state.lastSignature=signature;
    if(follow)scrollLatest();
  }
  function openThread(key){
    state.selected=key;state.lastSignature='';
    el('meshcore-thread-title').textContent=`${contactName(key)} · direct message`;
    el('meshcore-thread-browser').hidden=true;
    el('meshcore-conversation').hidden=false;
    el('meshcore-text').disabled=!state.contacts.some(c=>c.public_key===key);
    el('meshcore-send-status').textContent=key.startsWith('unknown:')?'Sender key not matched to a saved radio contact; reply unavailable until contact is identified.':
      'Radio acceptance is not a network ACK or proof someone read your message.';
    renderContacts();renderConversation(true);updateControls();
    window.OpenRFMessagingTabs?.meshcore?.open('inbox');
  }
  function closeThread(){
    state.selected=null;
    el('meshcore-thread-browser').hidden=false;
    el('meshcore-conversation').hidden=true;
    renderContacts();updateControls();
  }
  async function loadMessages(){
    if(state.polling)return;
    state.polling=true;
    try{
      const result=await request('/api/meshcore/messages');
      state.rows=Array.isArray(result.messages)?result.messages:[];
      trackInbox(result);renderContacts();renderConversation();
      const last=state.rows.filter(row=>row.direction==='OUT').at(-1);
      if(last&&last.delivery==='NETWORK_ACK_REPORTED_NOT_READ')
        messageNotice('Radio network ACK reported for the latest outgoing message. This is not proof of reading.');
    }catch(error){if(active())notice(error.message,true);}
    finally{state.polling=false;}
  }
  async function refreshStatus(reloadContacts=true){
    const result=await request('/api/meshcore/status');
    renderStatus(result);
    if(reloadContacts){
      const data=await request('/api/meshcore/contacts');
      state.contacts=Array.isArray(data.contacts)?data.contacts:[];
      renderContacts();
    }
    await loadMessages();
  }
  async function act(fn){
    if(state.busy)return;
    state.busy=true;updateControls();
    try{await fn();}
    catch(error){notice(error.message,true);messageNotice(error.message,true);}
    finally{state.busy=false;updateControls();}
  }
  el('meshcore-connect').addEventListener('click',()=>act(async()=>{
    if(!el('meshcore-port').value)return;
    await request('/api/meshcore/connect',{port:el('meshcore-port').value});
    await refreshStatus();
  }));
  el('meshcore-disconnect').addEventListener('click',()=>act(async()=>{
    await request('/api/meshcore/disconnect',{});await refreshStatus();
  }));
  el('meshcore-refresh').addEventListener('click',()=>act(async()=>{
    if(state.connected)await request('/api/meshcore/refresh',{});
    await refreshStatus();
  }));
  document.addEventListener('openrf:mesh-node-conversation',event=>{
    const {protocol,id}=event.detail||{};if(protocol!=='MeshCore'||! /^[0-9a-f]{64}$/.test(id))return;
    if(state.busy||(state.selected!==id&&el('meshcore-text').value.trim())){messageNotice('Finish or clear the current draft before opening another node.');return;}
    openThread(id);
  });
  el('meshcore-back').addEventListener('click',closeThread);
  el('meshcore-text').addEventListener('input',updateControls);
  el('meshcore-port').addEventListener('change',updateControls);
  el('meshcore-mark-read').addEventListener('click',()=>{state.unread=0;renderUnread();});
  el('meshcore-compose').addEventListener('submit',event=>{
    event.preventDefault();
    if(!state.selected||!state.connected)return;
    act(async()=>{
      const destination=state.selected,text=el('meshcore-text').value;
      const result=await request('/api/meshcore/send',{destination,text});
      if(result.submitted_to_radio){
        el('meshcore-text').value='';updateControls();
        messageNotice('Message submitted to the radio. Waiting for a matching network ACK; delivery is not yet confirmed.');
        await loadMessages();scrollLatest();
      }
    });
  });
  document.addEventListener('openrf:meshcore-shown',async()=>{
    try{await refreshStatus();if(state.selected)renderConversation(true);}
    catch(error){notice(error.message,true);}
  });
  // Read-only inbox polling begins only after a user has connected. No port
  // opens or transmissions are initiated by this timer.
  setInterval(async()=>{
    if(state.busy||!state.connected)return;
    try{await refreshStatus(false);}catch(error){if(active())notice(error.message,true);}
  },4000);
  renderUnread();
  refreshStatus().catch(error=>notice(error.message,true));
})();
