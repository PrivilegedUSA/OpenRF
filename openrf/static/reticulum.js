'use strict';
/* v0.2.96: two independent RNode USB profiles and evidence-limited traffic deltas. */
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
  const state={enabled:false,busy:false,starting:false,available:false,polling:false,
    contacts:[],messages:[],historyEnabled:false,editingContact:null,lastSentReceipt:null,
    activeThread:null,drafts:Object.create(null),attachment:null,attachmentPreviewUrl:null,
    halowEligible:[],...restoredUnread()};
  const maxAttachmentBytes=128*1024;
  const maxVoiceSeconds=20;
  let voiceRecorder=null,voiceStream=null,voiceTimer=null,voiceStarted=0;
  let voiceEpoch=0,voicePending=false,voiceFile=false;
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
  function sendNote(message,error=false){
    // Send lives on Inbox; Dashboard's status is hidden while composing.
    // Keep actionable results beside the button for sighted and AT users.
    const label=el('reticulum-send-status');
    if(label){label.textContent=message;label.classList.toggle('error',error);}
    note(message,error);
  }
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
    const file=state.attachment;
    const validFile=Boolean(file&&file.size>0&&file.size<=maxAttachmentBytes&&
      file.name.length>0&&file.name.length<=100&&file.name!=='.'&&file.name!=='..'&&
      !/[/\\\x00-\x1f\x7f]/.test(file.name));
    const attachmentStatus=el('reticulum-attachment-status');
    if(file){
      attachmentStatus.textContent=`${file.name} · ${(file.size/1024).toFixed(1)} KiB${validFile?'':' · exceeds 128 KiB or invalid name'}`;
      attachmentStatus.classList.toggle('error',!validFile);
    }else{
      attachmentStatus.textContent='One file up to 128 KiB · direct LXMF only · available during this session';
      attachmentStatus.classList.toggle('error',false);
    }
    el('reticulum-attachment-remove').hidden=!file;
    el('reticulum-attachment-file').disabled=state.busy;
    el('reticulum-byte-count').textContent=`${count} / 1024 UTF-8 bytes${count>1024?' · too long':''}`;
    el('reticulum-byte-count').classList.toggle('error',count>1024);
    // Keep Enable actionable when dependencies are absent: its explicit POST
    // then surfaces the precise local error instead of silently doing nothing.
    el('reticulum-enable').disabled=state.enabled||state.busy;
    el('reticulum-enable').textContent=state.starting?'Starting Reticulum…':'Enable LAN messaging';
    el('reticulum-tcp-enable').disabled=state.enabled||state.busy;
    const listenPort=el('reticulum-tcp-port');
    if(listenPort)listenPort.disabled=state.enabled||state.busy||!el('reticulum-tcp-enable').checked;
    const peerToggle=el('reticulum-peer-enable');
    if(peerToggle){
      peerToggle.disabled=state.enabled||state.busy;
      for(const id of ['reticulum-peer-host','reticulum-peer-port']){
        const field=el(id);
        if(field)field.disabled=state.enabled||state.busy||!peerToggle.checked;
      }
    }
    el('reticulum-halow-refresh').disabled=state.busy;
    el('reticulum-halow-activate').disabled=state.enabled||state.busy||!state.halowEligible.length;
    el('reticulum-halow-device').disabled=state.enabled||state.busy||!el('reticulum-halow-activate').checked;
    el('reticulum-rnode-activate').disabled=state.enabled||state.busy;
    const rnodeSelected=el('reticulum-rnode-activate').checked;
    const rnodeSetupLocked=state.enabled||state.busy||!rnodeSelected;
    for(const id of ['reticulum-rnode-port','reticulum-rnode-frequency','reticulum-rnode-bandwidth',
      'reticulum-rnode-txpower','reticulum-rnode-sf','reticulum-rnode-cr'])
      el(id).disabled=rnodeSetupLocked;
    const second=el('reticulum-rnode-second-activate');
    second.disabled=rnodeSetupLocked;
    if(!rnodeSelected)second.checked=false;
    el('reticulum-rnode-second-fields').hidden=!rnodeSelected||!second.checked;
    for(const id of ['reticulum-rnode-port-2','reticulum-rnode-frequency-2','reticulum-rnode-bandwidth-2',
      'reticulum-rnode-txpower-2','reticulum-rnode-sf-2','reticulum-rnode-cr-2'])
      el(id).disabled=rnodeSetupLocked||!second.checked;
    el('reticulum-transport-enable').disabled=rnodeSetupLocked;
    if(!rnodeSelected)el('reticulum-transport-enable').checked=false;
    el('reticulum-disable').disabled=!state.enabled||state.busy;
    el('reticulum-announce').disabled=!state.enabled||state.busy;
    el('reticulum-send').disabled=!state.enabled||state.busy||voicePending||Boolean(voiceRecorder)||
      (!count&&!validFile)||count>1024||!validAddress||(Boolean(file)&&!validFile);
    el('reticulum-save-recipient').disabled=!validAddress;
    const voiceStart=el('reticulum-voice-record');
    if(voiceStart){
      voiceStart.disabled=!state.enabled||state.busy||voicePending||Boolean(voiceRecorder);
      el('reticulum-voice-stop').hidden=!voiceRecorder;
      el('reticulum-voice-stop').disabled=state.busy;
      el('reticulum-voice-discard').hidden=!voicePending&&!voiceRecorder&&!voiceFile;
      el('reticulum-voice-discard').disabled=state.busy;
      el('reticulum-voice-compose')?.classList.toggle('is-recording',Boolean(voiceRecorder));
    }
  }
  function renderStatus(result){
    state.enabled=Boolean(result.enabled);
    state.available=Boolean(result.dependencies_available);
    const help=el('reticulum-start-help');
    if(help){
      help.hidden=state.available;
      if(!state.available){
        const packages=(Array.isArray(result.missing_packages)&&result.missing_packages.length)
          ?result.missing_packages.join(' and '):'rns and lxmf';
        const python=result.python_executable||'the Python interpreter running OpenRF';
        help.textContent=`Cannot start yet: ${packages} unavailable in OpenRF's active Python (${python}). Install the optional packages in that same Python environment, then restart the OpenRF backend. Another terminal or Electron runtime can use a different Python. Press Enable for the local startup error.`;
      }else help.textContent='';
    }
    // A temporary status disconnect must not erase an unread notification.
    // The first successful inbox poll will establish/reset its sequence.
    if(state.enabled)el('reticulum-tcp-enable').checked=Boolean(result.tcp_enabled);
    if(state.enabled)el('reticulum-halow-activate').checked=Boolean(result.halow_device_requested);
    el('reticulum-badge').textContent=state.enabled?'LAN ENABLED':'OFF';
    el('reticulum-connection-brief').textContent=state.enabled
      ?`Reticulum enabled · TCP listener ${result.tcp_enabled?`port ${result.tcp_port||4242}`:'off'} · outbound TCP ${result.tcp_peer_requested?'requested':'off'} · ${result.rnode_count||0} USB RNode(s) requested · HaLow ${result.halow_device_requested||'not selected'} · forwarding ${result.transport_forwarding_requested?'requested':'off'} · delivery unverified`
      :'Connection: off · no TCP listener requested by OpenRF.';
    el('reticulum-address').value=state.enabled&&result.address?result.address:'Not enabled';
    updateControls();
    if(result.last_error)note(result.last_error,true);
    else if(state.enabled)note(result.rnode_requested
      ?'RNode requested. Inspect actual RNS interface counters; radio startup and peer reception are not verified by this status alone.'
      :result.tcp_enabled
      ?`Reticulum active with TCP listener requested on port ${result.tcp_port||4242}. Check interface details for live state; reception is unverified.`
      :result.tcp_peer_requested
      ?'Reticulum outbound TCP peer requested. Check interface counters and message receipts; remote connection and delivery are unverified.'
      :'Reticulum LAN active. Address announce was requested; no remote reception or delivery is verified.');
    else if(!state.available)note('Reticulum is off. Optional Linux packages rns and lxmf are not installed.');
    else note('Reticulum is off. Press Enable only when you want local-network messaging.');
  }
  function contactName(address){
    const value=String(address||'').toLowerCase();
    const found=state.contacts.find(item=>item.address===value);
    return found?`${found.alias} (${value.slice(0,7)}…)`:String(address||'unknown');
  }
  function clearAttachment(){
    const wasVoice=Boolean(voiceRecorder||voicePending||voiceFile);
    cancelVoice(true);
    state.attachment=null;
    if(state.attachmentPreviewUrl && typeof URL!=='undefined')URL.revokeObjectURL(state.attachmentPreviewUrl);
    state.attachmentPreviewUrl=null;
    const file=el('reticulum-attachment-file');
    if(file){file.value='';updateControls();}
    const preview=el('reticulum-attachment-preview');
    if(preview){preview.hidden=true;preview.removeAttribute('src');}
    const audio=el('reticulum-attachment-audio');
    if(audio){audio.pause();audio.hidden=true;audio.removeAttribute('src');audio.load();}
    voiceFile=false;
    if(wasVoice)voiceMessage('Voice note removed from this composer. Microphone off.');
    updateControls();
  }
  function voiceMessage(message,error=false){
    const label=el('reticulum-voice-status');
    if(label){label.textContent=message;label.classList.toggle('error',error);}
  }
  function releaseMicrophone(stream){
    for(const track of stream?.getTracks?.()||[])track.stop();
    if(voiceStream===stream)voiceStream=null;
  }
  function stopVoiceTimer(){
    if(voiceTimer!==null){clearInterval(voiceTimer);voiceTimer=null;}
    el('reticulum-voice-timer').textContent='00:00 / 00:20';
  }
  function cancelVoice(silent=false){
    voiceEpoch++;
    voicePending=false;
    void window.openrfVoicePermission?.disarm?.();
    const recorder=voiceRecorder;
    voiceRecorder=null;
    if(recorder&&recorder.state!=='inactive'){
      try{recorder.stop();}catch(_){/* Already stopping; tracks are stopped below. */}
    }
    releaseMicrophone(voiceStream);
    stopVoiceTimer();
    if(!silent)voiceMessage('Recording discarded. Microphone off. Nothing was sent.');
  }
  function previewAttachment(file){
    if(state.attachmentPreviewUrl&&typeof URL!=='undefined')URL.revokeObjectURL(state.attachmentPreviewUrl);
    state.attachmentPreviewUrl=null;
    state.attachment=file||null;
    const image=el('reticulum-attachment-preview');
    const audio=el('reticulum-attachment-audio');
    image.hidden=true;image.removeAttribute('src');
    audio.pause();audio.hidden=true;audio.removeAttribute('src');audio.load();
    if(file&&file.size<=maxAttachmentBytes){
      if(['image/png','image/jpeg','image/webp'].includes(file.type)){
        state.attachmentPreviewUrl=URL.createObjectURL(file);
        image.src=state.attachmentPreviewUrl;image.hidden=false;
      }else if(['audio/webm','audio/ogg','audio/mp4'].includes(file.type)){
        state.attachmentPreviewUrl=URL.createObjectURL(file);
        audio.src=state.attachmentPreviewUrl;audio.hidden=false;
      }
    }
    updateControls();
  }
  function finishVoice(){
    const rec=voiceRecorder;
    if(rec&&rec.state==='recording'){
      try{rec.stop();}catch(_){cancelVoice();}
    }
  }
  async function startVoice(){
    if(!state.enabled||state.busy||voicePending||voiceRecorder)return;
    if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){
      voiceMessage('Recording is unavailable in this browser/device. Check microphone support and permissions.',true);return;
    }
    if(state.attachment&&!window.confirm('Replace the currently selected attachment with a voice note?'))return;
    if(state.attachment)clearAttachment();
    const epoch=++voiceEpoch;
    voicePending=true;updateControls();
    voiceMessage('Requesting microphone permission for this voice note…');
    let stream;
    try{
      if(window.openrfVoicePermission?.arm && await window.openrfVoicePermission.arm()!==true)
        throw Error('Native shell declined microphone permission.');
      if(epoch!==voiceEpoch){void window.openrfVoicePermission?.disarm?.();return;}
      stream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
      if(epoch!==voiceEpoch){releaseMicrophone(stream);void window.openrfVoicePermission?.disarm?.();return;}
      voiceStream=stream;
      const preferred=['audio/webm;codecs=opus','audio/ogg;codecs=opus',
                       'audio/webm','audio/ogg','audio/mp4'];
      const selected=preferred.find(type=>MediaRecorder.isTypeSupported?.(type));
      const rec=new MediaRecorder(stream, selected?{mimeType:selected,audioBitsPerSecond:24000}:
        {audioBitsPerSecond:24000});
      const mime=rec.mimeType.split(';')[0].toLowerCase();
      const extensions={'audio/webm':'webm','audio/ogg':'ogg','audio/mp4':'m4a'};
      if(!extensions[mime])throw Error('This browser did not offer a supported WebM, Ogg or MP4 audio format.');
      const chunks=[];
      rec.ondataavailable=event=>{if(event.data&&event.data.size>0)chunks.push(event.data);};
      rec.onerror=()=>{if(epoch!==voiceEpoch)return;cancelVoice(true);voiceMessage('Microphone recording failed. No audio was saved or sent.',true);};
      rec.onstop=()=>{
        void window.openrfVoicePermission?.disarm?.();
        releaseMicrophone(stream);stopVoiceTimer();
        if(epoch!==voiceEpoch)return;
        voiceRecorder=null;voicePending=false;
        const blob=new Blob(chunks,{type:mime});
        if(!blob.size||blob.size>maxAttachmentBytes){
          voiceFile=false;
          voiceMessage(blob.size?'Voice note exceeded 128 KiB. Try a shorter recording; nothing was sent.':'No audio was captured. Nothing was sent.',true);
          updateControls();return;
        }
        const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\..*$/,'Z');
        const file=new File([blob],`voice-note-${stamp}.${extensions[mime]}`,{type:mime});
        voiceFile=true;previewAttachment(file);
        voiceMessage(`Voice note ready (${(file.size/1024).toFixed(1)} KiB). Preview it, then press Send. Nothing has been transmitted.`);
      };
      rec.start(1000);
      voiceRecorder=rec;voicePending=false;voiceStarted=Date.now();
      voiceTimer=setInterval(()=>{
        if(epoch!==voiceEpoch)return;
        if(!viewingMessages() || (window.OpenRFReticulumTabs?.current?.() || 'inbox') !== 'inbox'){
          cancelVoice();voiceMessage('Recording stopped because you left the Reticulum Inbox. Nothing was saved.',true);
          return;
        }
        const elapsed=Math.min(maxVoiceSeconds,Math.floor((Date.now()-voiceStarted)/1000));
        el('reticulum-voice-timer').textContent=`00:${String(elapsed).padStart(2,'0')} / 00:20`;
        if(elapsed>=maxVoiceSeconds)finishVoice();
      },250);
      voiceMessage('Recording now. Stop anytime (maximum 20 seconds). Microphone active.');
    }catch(error){
      void window.openrfVoicePermission?.disarm?.();
      releaseMicrophone(stream);stopVoiceTimer();
      if(epoch!==voiceEpoch)return;
      voiceRecorder=null;voicePending=false;
      voiceMessage(`Microphone unavailable or permission denied: ${error.message}. Nothing was recorded.`,true);
    }finally{updateControls();}
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
  function threadAddress(value){
    const address=String(value||'').toLowerCase();
    return /^[0-9a-f]{32}$/.test(address)?address:null;
  }
  let lastThreadListSignature='';
  function renderThreadList(){
    const box=el('reticulum-thread-list');
    if(!box)return; // Legacy/script-only tests may not mount the thread UI.
    const signature=JSON.stringify([state.contacts,state.messages]);
    if(signature===lastThreadListSignature)return;
    lastThreadListSignature=signature;
    const lastByAddress=new Map();
    state.messages.forEach((item,index)=>{
      const address=threadAddress(item.destination);
      if(address)lastByAddress.set(address,{message:item,index});
    });
    const addresses=new Set([...state.contacts.map(item=>item.address),...lastByAddress.keys()]);
    const sorted=[...addresses].sort((a,b)=>{
      const order=(lastByAddress.get(b)?.index??-1)-(lastByAddress.get(a)?.index??-1);
      return order||contactName(a).localeCompare(contactName(b));
    });
    box.replaceChildren();
    if(!sorted.length){
      const empty=document.createElement('p');empty.className='small muted';
      empty.textContent='No conversations yet. Use New message to enter an LXMF address.';box.append(empty);
      return;
    }
    for(const address of sorted){
      const known=state.contacts.find(item=>item.address===address);
      const label=known?.alias||`${address.slice(0,8)}…`;
      const latest=lastByAddress.get(address)?.message;
      const button=document.createElement('button');button.type='button';
      button.className='reticulum-thread-row';
      button.setAttribute('aria-label',`Open Reticulum conversation with ${label}`);
      const avatar=document.createElement('span');avatar.className='reticulum-thread-avatar';
      avatar.textContent=label.charAt(0).toUpperCase();
      const info=document.createElement('span');info.className='reticulum-thread-info';
      const title=document.createElement('strong');title.textContent=label;
      const preview=document.createElement('span');preview.className='reticulum-thread-preview';
      preview.textContent=latest
        ?`${latest.direction==='OUT'?'Queued: ':'Received: '}${String(latest.text||latest.attachment?.filename||'').replace(/\s+/g,' ').slice(0,90)}`
        :'No messages yet';
      info.append(title,preview);
      const when=document.createElement('span');when.className='reticulum-thread-date';
      when.textContent=latest?friendlyMessageTime(latest.utc):'';
      button.append(avatar,info,when);
      button.addEventListener('click',()=>openThread(address));
      box.append(button);
    }
  }
  function saveThreadDraft(){
    if(state.activeThread!==null)state.drafts[state.activeThread]=el('reticulum-text').value;
  }
  function openThread(address){
    const selected=address===null?'new':threadAddress(address);
    if(!selected)return;
    saveThreadDraft();
    clearAttachment();
    state.activeThread=selected;
    el('reticulum-thread-browser').hidden=true;
    el('reticulum-thread-view').hidden=false;
    const isNew=selected==='new';
    const contact=state.contacts.find(item=>item.address===selected);
    el('reticulum-thread-name').textContent=isNew?'New message':contact?.alias||`${selected.slice(0,8)}…`;
    el('reticulum-thread-address').textContent=isNew?'Enter a recipient address':selected;
    el('reticulum-thread-copy').disabled=isNew;
    el('reticulum-thread-save').hidden=isNew||Boolean(contact);
    el('reticulum-recipient-label').hidden=!isNew;
    el('reticulum-quick-contact').hidden=!isNew;
    el('reticulum-recipient').value=isNew?'':selected;
    el('reticulum-text').value=state.drafts[selected]||'';
    el('reticulum-conversation').value=isNew?'all':selected;
    renderInbox(state.messages);
    scrollToLatest();
    updateControls();
    el('reticulum-thread-view').scrollIntoView({block:'start',behavior:'smooth'});
  }
  function backToConversations(){
    saveThreadDraft();clearAttachment();state.activeThread=null;
    el('reticulum-thread-view').hidden=true;
    el('reticulum-thread-browser').hidden=false;
    renderThreadList();
    el('reticulum-thread-browser').scrollIntoView({block:'start',behavior:'smooth'});
  }
  let lastThreadContentSignature='';
  function scrollToLatest(){
    const box=el('reticulum-messages');
    if(box)box.scrollTop=box.scrollHeight;
  }
  function renderInbox(rows){
    state.messages=Array.isArray(rows)?rows:[];
    renderConversationChoices();
    renderThreadList();
    const selected=state.activeThread==='new'?'__new__':
      state.activeThread||el('reticulum-conversation')?.value||'all';
    if(state.activeThread&&state.activeThread!=='new'&&el('reticulum-thread-name')){
      const contact=state.contacts.find(item=>item.address===state.activeThread);
      el('reticulum-thread-name').textContent=contact?.alias||`${state.activeThread.slice(0,8)}…`;
      el('reticulum-thread-save').hidden=Boolean(contact);
    }
    // Chat chronology runs oldest to newest, with the latest at the bottom.
    // Older persisted entries can have been imported from a prior session;
    // order by their actual UTC timestamps, not SQLite insertion order.
    // JS stable sort preserves arrival order when timestamps are identical.
    const visible=(selected==='__new__'?[]:selected==='all'?state.messages:
      state.messages.filter(row=>String(row.destination||'').toLowerCase()===selected)).slice().sort((left,right)=>{
        const a=Date.parse(left.utc),b=Date.parse(right.utc);
        return Number.isFinite(a)&&Number.isFinite(b)?a-b:0;
      });
    const contentSignature=JSON.stringify([selected,visible,state.contacts]);
    if(contentSignature===lastThreadContentSignature)return;
    lastThreadContentSignature=contentSignature;
    const box=el('reticulum-messages');
    const previous=box.scrollTop;
    const nearBottom=box.scrollHeight-box.scrollTop-box.clientHeight<=48;
    box.replaceChildren();
    if(!visible.length){const p=document.createElement('p');p.className='small muted';
      p.textContent=selected==='all'?'No LXMF messages in this inbox.':
        'No messages in this thread yet. Write a message below.';box.append(p);return;}
    for(const message of visible){
      const article=document.createElement('article');
      article.className=`mesh-message message-bubble ${message.direction==='IN'?'message-inbound':'message-outbound'}`;
      const heading=document.createElement('strong');
      heading.textContent=`${message.direction==='IN'?'Received from':'To'} ${contactName(message.destination)}`;
      const content=document.createElement('p');content.textContent=String(message.text||'');
      const detail=document.createElement('small');
      const status=message.status==='RECEIVED_VALID_SIGNATURE'?'Received · valid LXMF signature':
        message.status==='DELIVERED_LXMF'?'Delivered · LXMF receipt confirmed':
        message.status==='FAILED_LXMF'?'Delivery failed · LXMF reported failure':
        message.status==='QUEUED_WITH_LXMF_NOT_DELIVERED'?'Queued with LXMF · delivery not confirmed':
        'Status unverified';
      detail.textContent=`${status} · ${friendlyMessageTime(message.utc)}`;
      detail.title=String(message.utc||'UTC unknown');
      article.append(heading,content,detail);
      const attachment=message.attachment;
      if(attachment&&/^[0-9a-f]{32}$/.test(attachment.id||'')){
        const wrap=document.createElement('div');wrap.className='reticulum-message-attachment';
        if(attachment.available!==false){
          const attachmentUrl=`/api/reticulum/attachments/${attachment.id}`;
          if(['image/png','image/jpeg','image/webp'].includes(attachment.mime)){
            const thumbnail=document.createElement('img');thumbnail.src=attachmentUrl;
            thumbnail.alt=`Attached image: ${attachment.filename}`;thumbnail.loading='lazy';
            wrap.append(thumbnail);
          }else if(['audio/webm','audio/ogg','audio/mp4'].includes(attachment.mime)){
            const player=document.createElement('audio');
            player.controls=true;player.preload='none';player.src=attachmentUrl;
            player.setAttribute('aria-label',`Play voice attachment: ${attachment.filename}`);
            wrap.append(player);
          }
          const link=document.createElement('a');link.href=`${attachmentUrl}?download=1`;
          link.textContent=`Download ${attachment.filename} (${Math.ceil(attachment.size/1024)} KiB)`;
          link.className='small';wrap.append(link);
        }else{
          const expired=document.createElement('small');expired.className='muted';
          expired.textContent=`${attachment.filename} · file expired when the session ended (metadata only)`;
          wrap.append(expired);
        }
        article.append(wrap);
      }
      // A received LXMF row stores the sender hash in `destination`. Never
      // offer a reply to an outgoing row or a malformed/untrusted address.
      const sender=String(message.destination||'').trim();
      if(!state.activeThread&&message.direction==='IN' && /^[0-9a-fA-F]{32}$/.test(sender)){
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
    // Follow new arrivals only if already near the latest message. Preserve
    // scroll position while the operator is reading older chat history.
    box.scrollTop=nearBottom?box.scrollHeight:previous;
  }
  function prefillReply(sender){
    if(typeof window!=='undefined')window.OpenRFReticulumTabs?.open?.('inbox');
    const recipient=el('reticulum-recipient');
    recipient.value=sender;
    if(el('reticulum-thread-view')&&threadAddress(sender)){
      openThread(sender);
    }else if(el('reticulum-conversation')){
      el('reticulum-conversation').value=sender.toLowerCase();
      renderInbox(state.messages);
      scrollToLatest();
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
      if(state.activeThread&&state.activeThread!=='new'){
        note('Clipboard unavailable. The full LXMF address is shown in the thread header for manual copying.');
        return;
      }
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
  let previousInterfaceCounters=new Map();
  function renderDiagnostics(report){
    const container=el('reticulum-interfaces');
    container.replaceChildren();
    const previous=previousInterfaceCounters;
    const current=new Map();
    let compared=0;
    const summary=document.createElement('p');summary.className='small muted';
    if(!report.active)summary.textContent='Reticulum is stopped. No live network interfaces to inspect.';
    else if(!report.available)summary.textContent=String(report.note||'RNS interface counters unavailable.');
    else summary.textContent=report.interfaces.length
      ?'Local Reticulum interface counters (not message receipts):'
      :'RNS returned zero interfaces; the TCP listener is not confirmed to be listening.';
    container.append(summary);
    for(const [index,item] of (report.interfaces||[]).entries()){
      const entry=document.createElement('div');entry.className='reticulum-interface';
      const header=document.createElement('strong');header.textContent=String(item.name||'Unknown interface');
      const status=document.createElement('p');status.className='small';
      const up=item.up===true?'UP':item.up===false?'DOWN':'state unknown';
      status.textContent=`${up} · Peers: ${shown(item.reachable_peers)} · TCP clients: ${shown(item.connected_clients)}`;
      const traffic=document.createElement('p');traffic.className='small muted';
      traffic.textContent=`Received: ${shown(item.rx_bytes)} bytes · Sent: ${shown(item.tx_bytes)} bytes`;
      entry.append(header,status,traffic);container.append(entry);
      const key=`${index}:${item.name}`;
      const old=previous.get(key);
      const rx=Number.isSafeInteger(item.rx_bytes)&&item.rx_bytes>=0?item.rx_bytes:null;
      const tx=Number.isSafeInteger(item.tx_bytes)&&item.tx_bytes>=0?item.tx_bytes:null;
      if(rx!==null&&tx!==null){
        current.set(key,{rx,tx});
        if(old&&rx>=old.rx&&tx>=old.tx){
          const change=document.createElement('p');change.className='small muted';
          change.textContent=`Since previous check: +${rx-old.rx} received / +${tx-old.tx} sent bytes (local counters only)`;
          entry.append(change);compared++;
        }
      }
    }
    previousInterfaceCounters=report.active&&report.available?current:new Map();
    el('reticulum-traffic-summary').textContent=!report.active
      ?'No live counters. Starting and stopping Reticulum resets this comparison.'
      :compared?`Compared ${compared} interface(s) with the previous check. Counter changes show local activity only—not signal quality, RF reachability or LXMF delivery.`
      :'No comparable previous counters. Refresh again to view real byte changes, if RNS provides counters.';
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
      const last=state.lastSentReceipt;
      if(last){
        const updated=state.messages.find(row=>row.direction==='OUT'&&row.worker_id===last.worker_id&&
          row.event_id===last.event_id);
        if(updated&&updated.status!==last.reported){
          if(updated.status==='DELIVERED_LXMF')sendNote('LXMF delivery confirmed by a receipt from the destination.');
          else if(updated.status==='FAILED_LXMF')sendNote('LXMF reports this message failed to deliver.',true);
          last.reported=updated.status;
        }
      }
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
  async function refreshRNodeReadiness(){
    const label=el('reticulum-rnode-readiness');
    label.textContent='Reading Linux USB endpoints…';
    try{
      const report=await request('/api/reticulum/rnode/readiness');
      for(const [id,placeholder] of [['reticulum-rnode-port','No port selected'],
                                     ['reticulum-rnode-port-2','No second port selected']]){
        const picker=el(id);const previous=picker.value;
        picker.replaceChildren(new Option(placeholder,''));
        for(const port of report.ports||[]){
          if(!/^\/dev\/tty(?:USB|ACM)\d{1,3}$/.test(port.path||''))continue;
          picker.append(new Option(`${port.path} · ${port.status==='ready_to_probe'?'accessible, firmware unknown':port.status}`,
            port.path));
        }
        picker.value=[...picker.options].some(option=>option.value===previous)?previous:'';
      }
      label.textContent=`${(report.ports||[]).length} USB serial candidate(s) · RNode not verified · HaLow not verified`;
    }catch(error){label.textContent=`USB readiness unavailable: ${error.message}`;}
    updateControls();
  }
  async function refreshHaLowReadiness(){
    const label=el('reticulum-halow-status');
    label.textContent='Checking local Linux driver and IPv6 prerequisites…';
    try{
      const report=await request('/api/wifi-halow/status');
      if(report.kind!=='PASSIVE_WIFI_HALOW_READINESS'||report.read_only!==true)
        throw Error('Unexpected HaLow readiness response');
      const picker=el('reticulum-halow-device');
      const selected=picker.value;
      state.halowEligible=(report.candidate_interfaces||[])
        .filter(item=>item.reticulum_opt_in_eligible===true&&/^[a-zA-Z0-9_.:-]{1,32}$/.test(item.name||''))
        .map(item=>item.name);
      picker.replaceChildren(new Option('No HaLow device selected',''));
      for(const name of state.halowEligible)
        picker.append(new Option(`${name} · OS up + IPv6 link-local (peer unverified)`,name));
      picker.value=state.halowEligible.includes(selected)?selected:'';
      if(!state.halowEligible.length&&!state.enabled)el('reticulum-halow-activate').checked=false;
      label.textContent=state.halowEligible.length
        ?`${state.halowEligible.length} eligible candidate(s) · RF/multicast/peer unverified`
        :`${report.state.replaceAll('_',' ')} · no eligible HaLow IP interface; check Hardware`;
    }catch(error){
      state.halowEligible=[];
      el('reticulum-halow-device').replaceChildren(new Option('Readiness unavailable',''));
      if(!state.enabled)el('reticulum-halow-activate').checked=false;
      label.textContent=`HaLow readiness failed: ${error.message}`;
    }
    updateControls();
  }
  function rnodeStartOptions(){
    const options={tcp_enabled:el('reticulum-tcp-enable').checked};
    if(options.tcp_enabled && el('reticulum-tcp-port')){
      const port=Number(el('reticulum-tcp-port').value);
      if(!Number.isInteger(port)||port<1024||port>65535)
        throw Error('Choose a valid TCP listener port between 1024 and 65535.');
      if(port!==4242)options.tcp_listen_port=port;
    }
    if(el('reticulum-peer-enable')?.checked){
      const host=el('reticulum-peer-host')?.value.trim();
      const port=Number(el('reticulum-peer-port')?.value);
      if(!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host||'') || !Number.isInteger(port)||port<1024||port>65535)
        throw Error('Enter a numeric private IPv4 peer address and port 1024–65535.');
      options.tcp_peer={host,port,confirm:true};
    }
    if(el('reticulum-halow-activate')?.checked){
      const candidate=el('reticulum-halow-device')?.value||'';
      if(!/^[a-zA-Z0-9_.:-]{1,32}$/.test(candidate))
        throw Error('Check HaLow readiness and select a candidate Linux interface first.');
      options.halow_device=candidate;
    }
    if(!el('reticulum-rnode-activate').checked)return options;
    const profile=suffix=>{
      const port=el(`reticulum-rnode-port${suffix}`).value;
      const frequency=Number(el(`reticulum-rnode-frequency${suffix}`).value)*1000000;
      const bandwidth=Number(el(`reticulum-rnode-bandwidth${suffix}`).value)*1000;
      const txpower=Number(el(`reticulum-rnode-txpower${suffix}`).value);
      const spreadingfactor=Number(el(`reticulum-rnode-sf${suffix}`).value);
      const codingrate=Number(el(`reticulum-rnode-cr${suffix}`).value);
      if(!port||![frequency,bandwidth,txpower,spreadingfactor,codingrate].every(Number.isInteger)||
         frequency<902000000||frequency>928000000||![62500,125000,250000,500000].includes(bandwidth)||
         txpower<0||txpower>17||spreadingfactor<7||spreadingfactor>12||codingrate<5||codingrate>8){
        throw Error('Select an inventoried USB RNode candidate and valid 902–928 MHz radio settings.');
      }
      return {port,frequency,bandwidth,txpower,spreadingfactor,codingrate};
    };
    const primary=profile('');
    if(el('reticulum-rnode-second-activate')?.checked){
      const second=profile('-2');
      if(primary.port===second.port)throw Error('Choose two different physical USB ports for the two RNodes.');
      options.rnodes=[primary,second];
    }else options.rnode=primary;
    options.transport_enabled=el('reticulum-transport-enable').checked;
    return options;
  }
  async function act(path,payload){
    const starting=path==='/api/reticulum/start';
    if(starting){
      state.starting=true;
      note('Starting the local Reticulum worker… This may take up to 20 seconds. Waiting for your LXMF address.');
    }
    state.busy=true;updateControls();
    try{
      const result=await request(path,payload);
      await refreshStatus();
      return result;
    }catch(error){note(error.message,true);return null;}
    finally{state.busy=false;state.starting=false;updateControls();}
  }
  el('reticulum-enable').addEventListener('click',async()=>{
    let options;
    try{options=rnodeStartOptions();}
    catch(error){note(error.message,true);return;}
    if((options.rnode||options.rnodes)&&!window.confirm('Start Reticulum with the selected USB RNode radio(s)? Each may transmit immediately (including an LXMF announcement). Confirm firmware, antennas, legal frequencies/powers and channel agreement first.'))return;
    if(options.halow_device&&!window.confirm(`Start Reticulum AutoInterface on ${options.halow_device}? This may send IPv6 multicast/UDP announcements on the vendor-configured HaLow network. An OS UP/carrier indicator is not proof of RF reachability or peer delivery. Continue?`))return;
    if(options.tcp_peer&&!window.confirm(`Attempt outbound Reticulum TCP connection to ${options.tcp_peer.host}:${options.tcp_peer.port}? This sends network traffic on your private LAN. A connection is not proof of encrypted LXMF delivery. Continue?`))return;
    if(options.transport_enabled&&!window.confirm('Enable Reticulum transport forwarding? This can relay other traffic and transmit additional RF packets. Proceed only for a deliberately configured node.'))return;
    await act('/api/reticulum/start',options);
  });
  el('reticulum-rnode-refresh').addEventListener('click',refreshRNodeReadiness);
  el('reticulum-tcp-enable').addEventListener('change',updateControls);
  el('reticulum-tcp-port')?.addEventListener('change',updateControls);
  el('reticulum-peer-enable')?.addEventListener('change',updateControls);
  el('reticulum-halow-refresh').addEventListener('click',refreshHaLowReadiness);
  el('reticulum-halow-activate').addEventListener('change',updateControls);
  el('reticulum-halow-panel').addEventListener('toggle',()=>{
    if(el('reticulum-halow-panel').open)refreshHaLowReadiness();
  });
  el('reticulum-rnode-activate').addEventListener('change',updateControls);
  el('reticulum-rnode-second-activate').addEventListener('change',updateControls);
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
  el('reticulum-recipient').addEventListener('input',()=>{
    updateControls();
    if(state.activeThread==='new'){
      el('reticulum-thread-address').textContent=el('reticulum-recipient').value.trim()||'Enter a recipient address';
    }
  });
  el('reticulum-text').addEventListener('input',updateControls);
  el('reticulum-attachment-file').addEventListener('change',event=>{
    cancelVoice(true);voiceFile=false;
    previewAttachment(event.target.files?.[0]||null);
    voiceMessage('Microphone off. Only the selected file will be attached when you press Send.');
  });
  el('reticulum-attachment-remove').addEventListener('click',clearAttachment);
  el('reticulum-voice-record').addEventListener('click',startVoice);
  el('reticulum-voice-stop').addEventListener('click',finishVoice);
  el('reticulum-voice-discard').addEventListener('click',()=>{
    clearAttachment();voiceMessage('Voice recording discarded. Microphone off. Nothing was sent.');
  });
  el('reticulum-new-thread').addEventListener('click',()=>{
    openThread(null);el('reticulum-recipient').focus();
  });
  el('reticulum-thread-back').addEventListener('click',backToConversations);
  el('reticulum-thread-copy').addEventListener('click',()=>{
    if(threadAddress(state.activeThread))copySenderAddress(state.activeThread);
  });
  el('reticulum-thread-save').addEventListener('click',()=>{
    if(!threadAddress(state.activeThread))return;
    el('reticulum-recipient').value=state.activeThread;
    updateControls();
    el('reticulum-save-recipient').click();
  });
  el('reticulum-conversation').addEventListener('change',()=>{
    renderInbox(state.messages);
    scrollToLatest();
  });
  el('reticulum-save-recipient').addEventListener('click',()=>{
    const address=el('reticulum-recipient').value.trim();
    if(!/^[0-9a-fA-F]{32}$/.test(address))return;
    if(typeof window!=='undefined')window.OpenRFReticulumTabs?.open?.('contacts');
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
  document.addEventListener('openrf:mesh-node-conversation',event=>{
    const {protocol,id}=event.detail||{};if(protocol!=='Reticulum'||!threadAddress(id))return;
    if(state.activeThread===id){window.OpenRFReticulumTabs?.open?.('inbox');return;}
    if(state.busy||state.attachment||voicePending||voiceRecorder){sendNote('Finish the current attachment or recording before switching conversations.',true);return;}
    if(!state.contacts.some(c=>c.address===id)){contactNote('Destination is not a saved LXMF contact. Open Contacts to verify it.',true);window.OpenRFReticulumTabs?.open?.('contacts');return;}
    window.OpenRFReticulumTabs?.open?.('inbox');openThread(id);
  });
  document.addEventListener('openrf:reticulum-shown',async()=>{
    await refreshInbox();
    if(state.activeThread!==null)scrollToLatest();
  });
  document.addEventListener('openrf:connections-changed',refreshStatus);
  el('reticulum-compose').addEventListener('submit',async event=>{
    event.preventDefault();
    if(!state.enabled||state.busy||voicePending||voiceRecorder||el('reticulum-send').disabled)return;
    sendNote('Submitting your message to the local Reticulum worker… Delivery is not confirmed.');
    const address=el('reticulum-recipient').value.trim().toLowerCase();
    const payload={destination:address,text:el('reticulum-text').value};
    if(state.attachment){
      try{
        const file=state.attachment;
        if(file.size<1||file.size>maxAttachmentBytes||file.name.length>100)
          throw Error('Choose one file of 1–128 KiB. Larger transfers will be added later.');
        const bytes=new Uint8Array(await file.arrayBuffer());
        let binary='';
        for(let offset=0;offset<bytes.length;offset+=8192)
          binary+=String.fromCharCode(...bytes.subarray(offset,offset+8192));
        payload.attachment={filename:file.name,data_base64:btoa(binary)};
      }catch(error){sendNote(`Could not read selected file: ${error.message}`,true);return;}
    }
    const result=await act('/api/reticulum/send',payload);
    if(!result){sendNote(el('reticulum-status').textContent||'The send attempt failed. Nothing was confirmed delivered.',true);return;}
    if(Number.isSafeInteger(result.event_id)&&result.worker_id){
      state.lastSentReceipt={event_id:result.event_id,worker_id:result.worker_id,
        reported:result.status};
    }
    if(result.status==='QUEUED_WITH_LXMF_NOT_DELIVERED'){
      el('reticulum-text').value='';updateControls();
      clearAttachment();
      if(state.activeThread!==null)state.drafts[state.activeThread]='';
      if(state.activeThread==='new')openThread(address);
      sendNote('Queued in LXMF. The recipient has NOT confirmed delivery.');
    }else if(result.status==='DELIVERED_LXMF'){
      el('reticulum-text').value='';updateControls();clearAttachment();
      if(state.activeThread!==null)state.drafts[state.activeThread]='';
      sendNote('LXMF delivery confirmed by a receipt from the destination.');
    }else if(result.status==='FAILED_LXMF'){
      sendNote('LXMF reports this message failed to deliver.',true);
    }else if(result.status==='PATH_REQUESTED_NOT_SENT'){
      sendNote('Route discovery requested. Message NOT sent. Wait for a path, then press Send again.');
    }else sendNote('Destination identity is not yet known. Message NOT sent. Try again after discovery.');
  });
  // The passive poll runs while messaging is enabled even when another page
  // is open. It never enables Reticulum, announces, sends or starts RF scans.
  setInterval(()=>{if((state.enabled||state.historyEnabled)&&!state.busy)refreshInbox();},5000);
  // Prompt read-only refresh when a backgrounded browser regains focus.
  // The existing polling guard coalesces simultaneous focus/visibility events.
  const resumeInbox=()=>{if(state.enabled&&!state.busy)refreshInbox();};
  window.addEventListener('focus',resumeInbox);
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden&&(voiceRecorder||voicePending)){
      cancelVoice();voiceMessage('Voice recording stopped when the app was hidden. Nothing was sent.');
    }
    if(!document.hidden)resumeInbox();
  });
  updateControls();
  publishUnread();
  refreshContacts().catch(error=>contactNote(error.message,true));
  refreshStatus();
  refreshRNodeReadiness();
})();
