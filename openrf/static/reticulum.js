'use strict';
/* v0.2.93: explicit unread acknowledgment and newest-first LXMF inbox. */
(()=>{
  const el=id=>document.getElementById(id);
  if(!el('reticulum-panel'))return;
  const unreadKey='openrf.reticulum.unread.v1';
  function restoredUnread(){
    try{
      const value=JSON.parse(window.sessionStorage?.getItem(unreadKey)||'null');
      if(value&&Number.isSafeInteger(value.sequence)&&value.sequence>=0&&
         Number.isSafeInteger(value.unread)&&value.unread>=0)
        return {receiveSequence:value.sequence,unread:value.unread};
    }catch(_){/* Messaging remains functional with session storage denied. */}
    return {receiveSequence:null,unread:0};
  }
  const state={enabled:false,busy:false,available:false,polling:false,
    contacts:[],messages:[],historyEnabled:false,editingContact:null,...restoredUnread()};
  const viewingMessages=()=>Boolean(el('page-reticulum')?.classList.contains('active'));
  function persistUnread(){
    try{
      if(state.receiveSequence!==null)window.sessionStorage?.setItem('openrf.reticulum.unread.v1',
        JSON.stringify({sequence:state.receiveSequence,unread:state.unread}));
    }catch(_){/* Memory-only counters remain visible. */}
  }
  function publishUnread(){
    persistUnread();
    const markRead=el('reticulum-mark-read');
    if(markRead)markRead.disabled=state.unread===0;
    const inboxCount=el('reticulum-inbox-unread');
    if(inboxCount)inboxCount.textContent=state.unread
      ?`${state.unread} unread · review messages, then mark all read`
      :'No unread Reticulum messages';
    document.dispatchEvent(new CustomEvent('openrf:reticulum-unread',
      {detail:{count:state.unread}}));
  }
  function trackInbox(result){
    // The worker increments this only for inbound LXMF messages with a
    // validated signature. Never count queued outgoing texts or old records.
    const sequence=result?.receive_sequence;
    if(Number.isSafeInteger(sequence)&&sequence>=0){
      // Worker restart resets its sequence but doesn't mean earlier unread
      // messages were actually opened; retain the badge until read.
      if(state.receiveSequence!==null && sequence>state.receiveSequence){
        const newlyReceived=sequence-state.receiveSequence;
        state.unread+=newlyReceived;
        if(!document.body.classList.contains('map-workspace'))
          el('mesh-global-announcer').textContent=`${newlyReceived} new Reticulum message${newlyReceived===1?'':'s'} received. Review Messages and mark them read.`;
      }
      state.receiveSequence=sequence;
    }
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
    el('reticulum-save-recipient').disabled=!validAddress;
  }
  function renderStatus(result){
    state.enabled=Boolean(result.enabled);
    state.available=Boolean(result.dependencies_available);
    // A temporary status disconnect must not erase an unread notification.
    // The first successful inbox poll will establish/reset its sequence.
    if(state.enabled)el('reticulum-tcp-enable').checked=Boolean(result.tcp_enabled);
    el('reticulum-badge').textContent=state.enabled?'LAN ENABLED':'OFF';
    el('reticulum-connection-brief').textContent=state.enabled
      ?`Reticulum enabled · TCP listener ${result.tcp_enabled?'requested on port 4242':'not requested'} · connection and delivery not yet verified`
      :'Connection: off · no TCP listener requested by OpenRF.';
    el('reticulum-address').value=state.enabled&&result.address?result.address:'Not enabled';
    updateControls();
    if(result.last_error)note(result.last_error,true);
    else if(state.enabled)note(result.tcp_enabled
      ?'Reticulum active with TCP listener requested on port 4242. Check interface details for live state; reception is unverified.'
      :'Reticulum LAN active. Address announce was requested; no remote reception or delivery is verified.');
    else if(!state.available)note('Reticulum is off. Optional Linux packages rns and lxmf are not installed.');
    else note('Reticulum is off. Press Enable only when you want local-network messaging.');
  }
  function contactName(address){
    const value=String(address||'').toLowerCase();
    const found=state.contacts.find(item=>item.address===value);
    return found?`${found.alias} (${value.slice(0,7)}…)`:String(address||'unknown');
  }
  function friendlyMessageTime(value){
    const raw=String(value||'');
    const date=new Date(raw);
    return raw&&!Number.isNaN(date.getTime())
      ?date.toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})
      :raw||'UTC unavailable';
  }
  function renderConversationChoices(){
    const selector=el('reticulum-conversation');
    if(!selector)return;
    const old=selector.value||'all';
    const addresses=new Set(state.contacts.map(item=>item.address));
    for(const item of state.messages){
      const address=String(item.destination||'').toLowerCase();
      if(/^[0-9a-f]{32}$/.test(address))addresses.add(address);
    }
    selector.replaceChildren(new Option('All messages','all'));
    for(const address of Array.from(addresses).sort((a,b)=>contactName(a).localeCompare(contactName(b))))
      selector.append(new Option(contactName(address),address));
    selector.value=addresses.has(old)?old:'all';
  }
  function renderInbox(rows){
    state.messages=Array.isArray(rows)?rows:[];
    renderConversationChoices();
    const selected=el('reticulum-conversation')?.value||'all';
    // The worker inbox and saved SQLite history both arrive oldest-first.
    // Reverse a copy AFTER filtering so repeated polls and conversations
    // remain newest-first without mutating the canonical message order.
    const visible=(selected==='all'?state.messages:
      state.messages.filter(row=>String(row.destination||'').toLowerCase()===selected)).slice().reverse();
    const box=el('reticulum-messages');
    const previous=box.scrollTop;
    const oldHeight=box.scrollHeight;
    const nearTop=box.scrollTop<24;
    box.replaceChildren();
    if(!visible.length){const p=document.createElement('p');p.className='small muted';
      p.textContent=selected==='all'?'No LXMF messages in this inbox.':'No messages for this contact.';box.append(p);return;}
    for(const message of visible){
      const article=document.createElement('article');
      article.className=`mesh-message message-bubble ${message.direction==='IN'?'message-inbound':'message-outbound'}`;
      const heading=document.createElement('strong');
      heading.textContent=`${message.direction==='IN'?'Received from':'To'} ${contactName(message.destination)}`;
      const content=document.createElement('p');content.textContent=String(message.text||'');
      const detail=document.createElement('small');
      const status=message.status==='RECEIVED_VALID_SIGNATURE'?'Received · valid LXMF signature':
        message.status==='QUEUED_WITH_LXMF_NOT_DELIVERED'?'Queued with LXMF · delivery not confirmed':
        'Status unverified';
      detail.textContent=`${status} · ${friendlyMessageTime(message.utc)}`;
      detail.title=String(message.utc||'UTC unknown');
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
    // The latest item is now at the top. Do not drag someone reading an older
    // message back to the top during automatic inbox refreshes.
    box.scrollTop=nearTop?0:Math.max(0,previous+box.scrollHeight-oldHeight);
  }
  function prefillReply(sender){
    const recipient=el('reticulum-recipient');
    recipient.value=sender;
    if(el('reticulum-conversation')){
      el('reticulum-conversation').value=sender.toLowerCase();
      el('reticulum-messages').scrollTop=0;
      renderInbox(state.messages);
    }
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
  function contactNote(message,error=false){
    const node=el('reticulum-contact-status');
    node.textContent=message;node.classList.toggle('error',error);
  }
  function contactEditMode(address=null){
    state.editingContact=address;
    el('reticulum-contact-address').readOnly=Boolean(address);
    el('reticulum-contact-submit').textContent=address?'Update contact':'Save contact';
    el('reticulum-contact-cancel').hidden=!address;
  }
  function renderContacts(){
    el('reticulum-contact-count').textContent=`${state.contacts.length} saved`;
    const box=el('reticulum-contacts-list');box.replaceChildren();
    if(!state.contacts.length){
      const empty=document.createElement('p');empty.className='small muted';
      empty.textContent='No saved Reticulum contacts.';box.append(empty);return;
    }
    for(const item of state.contacts){
      const row=document.createElement('div');row.className='reticulum-contact-entry';
      const identity=document.createElement('div');identity.className='reticulum-contact-identity';
      const alias=document.createElement('strong');alias.textContent=item.alias;
      const address=document.createElement('small');address.textContent=item.address;
      identity.append(alias,address);
      const actions=document.createElement('div');actions.className='reticulum-contact-actions';
      const message=document.createElement('button');message.type='button';
      message.className='btn mini outline';message.textContent='Message';
      message.addEventListener('click',()=>prefillReply(item.address));
      const edit=document.createElement('button');edit.type='button';
      edit.className='btn mini outline';edit.textContent='Edit';
      edit.addEventListener('click',()=>{
        contactEditMode(item.address);
        el('reticulum-contact-address').value=item.address;
        el('reticulum-contact-alias').value=item.alias;
        contactNote(`Editing ${item.alias}. Change the nickname, then select Update contact.`);
        el('reticulum-contact-alias').focus();
      });
      const remove=document.createElement('button');remove.type='button';
      remove.className='btn mini outline';remove.textContent='Remove';
      remove.addEventListener('click',async()=>{
        if(!window.confirm(`Remove contact ${item.alias}? Existing messages will not be deleted.`))return;
        try{
          await request('/api/reticulum/contacts/delete',{destination:item.address});
          if(state.editingContact===item.address){el('reticulum-contact-form').reset();contactEditMode();}
          await refreshContacts();contactNote('Contact removed. Existing messages were preserved.');
        }catch(error){contactNote(error.message,true);}
      });
      actions.append(message,edit,remove);row.append(identity,actions);box.append(row);
    }
  }
  async function refreshContacts(){
    const response=await request('/api/reticulum/contacts');
    state.contacts=Array.isArray(response.contacts)?response.contacts:[];
    renderContacts();
    if(viewingMessages())renderInbox(state.messages);
    else renderConversationChoices();
  }
  async function refreshHistory(){
    const report=await request('/api/reticulum/history');
    state.historyEnabled=Boolean(report.enabled);
    el('reticulum-save-history').checked=state.historyEnabled;
    el('reticulum-storage-label').textContent=state.historyEnabled?'Private local history · last 1000':'Current session · last 100';
    el('reticulum-history-count').textContent=state.historyEnabled
      ?`${Number(report.saved_count)||0} messages saved locally. Delivery not guaranteed.`
      :'History saving is off. Messages stay in memory until Reticulum stops.';
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
    const connection=el('reticulum-connection-brief');
    if(!report.active)connection.textContent='Connection: off · no live Reticulum transport.';
    else if(!report.available)connection.textContent='Reticulum enabled · interface counters unavailable; connection not verified.';
    else{
      const peers=(report.interfaces||[]).reduce((sum,item)=>sum+(Number.isSafeInteger(item.reachable_peers)?item.reachable_peers:0),0);
      const clients=(report.interfaces||[]).reduce((sum,item)=>sum+(Number.isSafeInteger(item.connected_clients)?item.connected_clients:0),0);
      connection.textContent=`Reticulum enabled · ${report.interfaces.length} reported interface(s) · ${peers} interface peer entries · ${clients} reported clients. Message delivery not confirmed.`;
    }
  }
  async function refreshDiagnostics(){
    try{renderDiagnostics(await request('/api/reticulum/diagnostics'));}
    catch(error){el('reticulum-interfaces').textContent=`Connection diagnostics unavailable: ${error.message}`;}
  }
  async function refreshInbox(){
    if(state.polling)return;
    state.polling=true;
    try{const result=await request('/api/reticulum/messages');
      trackInbox(result);
      state.messages=Array.isArray(result.messages)?result.messages:[];
      if(viewingMessages()){
        renderInbox(state.messages);
        if(state.historyEnabled)await refreshHistory();
      }}
    catch(error){note(error.message,true);}
    finally{state.polling=false;}
  }
  async function refreshStatus(){
    try{renderStatus(await request('/api/reticulum/status'));
      await refreshInbox();
      await Promise.all([refreshDiagnostics(),refreshHistory()]);}
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
    if(result?.worker_stopped){await refreshInbox();note('Reticulum stopped. LAN process closed; any opt-in saved history remains available.');}
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
  el('reticulum-conversation').addEventListener('change',()=>{
    el('reticulum-messages').scrollTop=0;
    renderInbox(state.messages);
  });
  el('reticulum-save-recipient').addEventListener('click',()=>{
    const address=el('reticulum-recipient').value.trim();
    if(!/^[0-9a-fA-F]{32}$/.test(address))return;
    el('reticulum-contacts-panel').open=true;
    const existing=state.contacts.find(item=>item.address===address.toLowerCase());
    el('reticulum-contact-form').reset();contactEditMode();
    el('reticulum-contact-address').value=address;
    if(existing){
      contactNote(`This address is already saved as ${existing.alias}. Select Edit in your contacts to rename it.`,true);
      return;
    }
    contactNote('Enter a nickname to save this address.');
    el('reticulum-contact-alias').focus();
  });
  el('reticulum-contact-cancel').addEventListener('click',()=>{
    el('reticulum-contact-form').reset();contactEditMode();
    contactNote('Contact edit canceled.');
  });
  el('reticulum-contact-form').addEventListener('submit',async event=>{
    event.preventDefault();
    try{
      const address=el('reticulum-contact-address').value.trim().toLowerCase();
      const existing=state.contacts.find(item=>item.address===address);
      if(!state.editingContact && existing){
        contactNote(`This address is already saved as ${existing.alias}. Use Edit to change the nickname.`,true);
        return;
      }
      if(state.editingContact && state.editingContact!==address){
        contactNote('The contact address cannot change while editing. Cancel edit to add a new address.',true);
        return;
      }
      const payload={destination:address,alias:el('reticulum-contact-alias').value.trim()};
      if(state.editingContact)payload.update=true;
      const wasEditing=Boolean(state.editingContact);
      const result=await request('/api/reticulum/contacts',payload);
      el('reticulum-contact-form').reset();
      contactEditMode();
      await refreshContacts();contactNote(`${result.contact.alias} ${wasEditing?'updated':'saved'} on this device.`);
    }catch(error){contactNote(error.message,true);}
  });
  el('reticulum-save-history').addEventListener('change',async event=>{
    const enabled=event.target.checked;
    if(enabled&&!window.confirm('Save the current Reticulum session and future messages privately on this device? Message text will NOT be encrypted at rest.')){
      event.target.checked=false;return;
    }
    try{
      await request('/api/reticulum/history',{enabled});
      await refreshHistory();await refreshInbox();
      note(enabled?'Private local message history enabled.':'Saved Reticulum history deleted; session messages remain in memory.');
    }catch(error){event.target.checked=!enabled;note(error.message,true);}
  });
  el('reticulum-clear-history').addEventListener('click',async()=>{
    if(!window.confirm('Delete saved and current-session Reticulum messages on this device? Contacts will remain.'))return;
    try{
      await request('/api/reticulum/history/clear',{});
      state.messages=[];state.unread=0;publishUnread();renderInbox([]);
      await refreshHistory();note('Reticulum messages cleared locally. Contacts were preserved.');
    }catch(error){note(error.message,true);}
  });
  el('reticulum-mark-read').addEventListener('click',()=>{
    state.unread=0;publishUnread();
    note('Reticulum messages marked as read on this tab.');
  });
  document.addEventListener('openrf:reticulum-shown',refreshInbox);
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
  setInterval(()=>{if((state.enabled||state.historyEnabled)&&!state.busy)refreshInbox();},5000);
  // Prompt read-only refresh when a backgrounded browser regains focus.
  // The existing polling guard coalesces simultaneous focus/visibility events.
  const resumeInbox=()=>{if(state.enabled&&!state.busy)refreshInbox();};
  window.addEventListener('focus',resumeInbox);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)resumeInbox();});
  updateControls();
  publishUnread();
  refreshContacts().catch(error=>contactNote(error.message,true));
  refreshStatus();
})();
