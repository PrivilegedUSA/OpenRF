'use strict';
(() => {
  const $=id=>document.getElementById(id);
  let drafts=[];
  let busy=false;
  const bytes=text=>new TextEncoder().encode(text).length;
  async function api(path,method='GET',body){
    const reply=await fetch(path,{method,headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
    const result=await reply.json();
    if(!reply.ok)throw Error(result.error||`Request failed (${reply.status})`);
    return result;
  }
  function textFromDraft(record){
    return record.details.split('\n').filter(line=>!line.startsWith('UNSENT EMERGENCY DRAFT')&&
      !line.startsWith('LOCAL DRAFT ONLY.')).join('\n');
  }
  function update(){
    const isMesh=$('emergency-handoff-transport').value==='meshtastic';
    $('emergency-handoff-channel-label').hidden=!isMesh;
    $('emergency-handoff-destination').placeholder=isMesh?'Meshtastic !1234abcd':'Reticulum 32-character hex address';
    const count=bytes($('emergency-handoff-text').value),limit=isMesh?180:1024;
    $('emergency-handoff-bytes').textContent=`${count} / ${limit} UTF-8 bytes${count>limit?' — shorten before sending':''}`;
    $('emergency-handoff-send').disabled=busy||!$('emergency-handoff-draft').value||!$('emergency-handoff-destination').value.trim()||count===0||count>limit;
    $('emergency-outbox-queue').disabled=$('emergency-handoff-send').disabled;
  }
  function payload(){
    const isMesh=$('emergency-handoff-transport').value==='meshtastic';
    return {draft_id:Number($('emergency-handoff-draft').value),
      transport:isMesh?'meshtastic':'reticulum',destination:$('emergency-handoff-destination').value.trim(),
      channel:isMesh?Number($('emergency-handoff-channel').value):null,text:$('emergency-handoff-text').value};
  }
  async function refreshOutbox(){
    try{
      const [result,readiness]=await Promise.all([api('/api/emergency/outbox'),api('/api/emergency/transport-readiness')]);
      $('emergency-transport-readiness').textContent=`Meshtastic: ${readiness.meshtastic.ready_for_operator_send?'USB node connected, Normal mode':'not ready for manual send'}; Reticulum: ${readiness.reticulum.ready_for_operator_send?'enabled, route unverified':'not enabled'}. Both require a reachable recipient. Automatic retry: OFF.`;
      const list=$('emergency-outbox-list');list.replaceChildren();
      if(!result.entries.length){list.textContent='No locally queued messages.';return;}
      for(const entry of result.entries){
        const card=document.createElement('article');card.className='emergency-record';
        const heading=document.createElement('strong');heading.textContent=`#${entry.id} · ${entry.transport} → ${entry.destination}`;card.append(heading);
        const details=document.createElement('p');details.className='muted small';details.textContent=`${entry.state.replaceAll('_',' ')} · ${entry.created_utc} · recipient delivery not verified`;card.append(details);
        const snippet=document.createElement('details');const summary=document.createElement('summary');summary.textContent='Review queued text';
        const body=document.createElement('p');body.textContent=entry.outbound_text;snippet.append(summary,body);card.append(snippet);
        if(entry.state==='READY_LOCAL_ONLY'){
          const send=document.createElement('button');send.type='button';send.className='btn primary';send.textContent='Confirm send now';
          send.addEventListener('click',async()=>{
            const oldFix=entry.outbound_text.includes('Browser-reported location')?' Any coordinates are from the ORIGINAL draft and may now be stale.':'';
            if(!confirm(`Send outbox #${entry.id} to ${entry.destination} via ${entry.transport}? This may transmit from connected equipment. Recipient delivery is NOT guaranteed.${oldFix}`))return;
            send.disabled=true;
            try{const outcome=await api(`/api/emergency/outbox/${entry.id}/send`,'POST',{});
              $('emergency-handoff-status').textContent=`Outbox #${entry.id}: ${outcome.attempt.status.replaceAll('_',' ')}. Human receipt not confirmed.`;
            }catch(e){$('emergency-handoff-status').textContent=e.message;}
            await refreshOutbox();await attempts();
          });card.append(send);
        }else if(['SEND_FAILED_NOT_DELIVERED','PATH_REQUESTED_NOT_SENT','NO_RECALLED_IDENTITY_NOT_SENT','UNCERTAIN_AFTER_RESTART'].includes(entry.state)){
          const prepare=document.createElement('button');prepare.type='button';prepare.className='btn ghost';prepare.textContent='Prepare retry (no send)';
          prepare.addEventListener('click',async()=>{if(!confirm('Make this item ready for another MANUAL send? Nothing will transmit now.'))return;
            try{await api(`/api/emergency/outbox/${entry.id}/prepare-retry`,'POST',{});await refreshOutbox();}
            catch(e){$('emergency-handoff-status').textContent=e.message;}});card.append(prepare);
        }
        if(entry.state!=='SENDING'){
          const remove=document.createElement('button');remove.type='button';remove.className='btn ghost';remove.textContent='Remove from outbox';
          remove.addEventListener('click',async()=>{if(!confirm(`Remove outbox #${entry.id}? This cannot retract a previously transmitted message.`))return;
            try{await api(`/api/emergency/outbox/${entry.id}`,'DELETE');await refreshOutbox();}
            catch(e){$('emergency-handoff-status').textContent=e.message;}});card.append(remove);
        }
        list.append(card);
      }
    }catch(e){$('emergency-transport-readiness').textContent=`Readiness/outbox unavailable: ${e.message}`;}
  }
  async function attempts(){
    const id=$('emergency-handoff-draft').value;
    const list=$('emergency-handoff-attempts');list.replaceChildren();
    if(!id)return;
    try{
      const result=await api('/api/emergency/attempts/'+encodeURIComponent(id));
      for(const attempt of result.attempts){
        const row=document.createElement('div');row.className='emergency-record';
        const info=document.createElement('p');info.className='muted small';
        info.textContent=`${attempt.attempted_utc} · ${attempt.transport} → ${attempt.destination}: ${attempt.status.replaceAll('_',' ')}. ${attempt.status==='ROUTING_ACK_REPORTED_NOT_READ'?'Routing acknowledgment reported; not proof of human reading.':'Recipient delivery NOT confirmed.'}`;
        row.append(info);
        if(['SEND_FAILED_NOT_DELIVERED','PATH_REQUESTED_NOT_SENT','NO_RECALLED_IDENTITY_NOT_SENT','ROUTING_ERROR_REPORTED'].includes(attempt.status) && attempt.outbound_text){
          const retry=document.createElement('button');retry.type='button';retry.className='btn ghost';retry.textContent='Prepare manual retry';
          retry.addEventListener('click',()=>{
            $('emergency-handoff-transport').value=attempt.transport;
            $('emergency-handoff-destination').value=attempt.destination;
            $('emergency-handoff-channel').value=String(attempt.channel??0);
            $('emergency-handoff-text').value=attempt.outbound_text;
            update();$('emergency-handoff-status').textContent='Previous text restored. Review the recipient and message, then confirm a NEW send attempt. Nothing has been resent.';
            $('emergency-handoff-text').focus();
          });row.append(retry);
        }
        list.append(row);
      }
    }catch(e){$('emergency-handoff-status').textContent=e.message;}
  }
  async function load(){
    try{
      const result=await api('/api/emergency/records');
      const selected=$('emergency-handoff-draft').value;
      drafts=result.records.filter(row=>row.kind==='sos_draft');
      const input=$('emergency-handoff-draft');input.replaceChildren(new Option('Select a saved SOS draft',''));
      for(const draft of drafts)input.add(new Option(`#${draft.id} · ${draft.title}`,String(draft.id)));
      if(drafts.some(row=>String(row.id)===selected))input.value=selected;
      update();await attempts();await refreshOutbox();
    }catch(e){$('emergency-handoff-status').textContent=e.message;}
  }
  $('emergency-handoff-draft').addEventListener('change',()=>{
    const draft=drafts.find(row=>String(row.id)===$('emergency-handoff-draft').value);
    $('emergency-handoff-text').value=draft?textFromDraft(draft):'';
    update();attempts();
  });
  $('emergency-handoff-transport').addEventListener('change',update);
  $('emergency-handoff-destination').addEventListener('input',update);
  $('emergency-handoff-text').addEventListener('input',update);
  $('emergency-handoff-refresh').addEventListener('click',attempts);
  $('emergency-outbox-refresh').addEventListener('click',refreshOutbox);
  document.addEventListener('openrf:outbox-changed',refreshOutbox);
  $('emergency-outbox-queue').addEventListener('click',async()=>{
    if(busy||$('emergency-outbox-queue').disabled)return;
    if(!confirm('Store this addressed message locally for a LATER manual send? It will NOT transmit now.'))return;
    busy=true;update();
    try{const result=await api('/api/emergency/outbox','POST',payload());
      $('emergency-handoff-status').textContent=`Outbox #${result.entry.id} saved locally. NOT transmitted.`;
      await refreshOutbox();
    }catch(e){$('emergency-handoff-status').textContent=`Queue failed: ${e.message}`;}
    finally{busy=false;update();}
  });
  $('emergency-handoff-form').addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;
    const isMesh=$('emergency-handoff-transport').value==='meshtastic';
    const draftId=Number($('emergency-handoff-draft').value);
    const destination=$('emergency-handoff-destination').value.trim();
    const text=$('emergency-handoff-text').value;
    if(!draftId||!destination||!text||bytes(text)>(isMesh?180:1024))return;
    const network=isMesh?'Meshtastic':'Reticulum';
    const oldFix=text.includes('Browser-reported location')?' Coordinates came from the saved draft and may no longer be current.':'';
    if(!confirm(`Send this message to ${destination} over ${network}? This may transmit via connected radio equipment. This is NOT a 911 call and delivery is not guaranteed.${oldFix}`))return;
    busy=true;update();$('emergency-handoff-status').textContent='Requesting radio handoff…';
    try{
      const result=await api('/api/emergency/sos/handoff','POST',payload());
      $('emergency-handoff-status').textContent=`${result.attempt.status.replaceAll('_',' ')}. Recipient delivery NOT confirmed.`;
    }catch(e){$('emergency-handoff-status').textContent=`Handoff failed: ${e.message}. Delivery NOT confirmed.`;}
    finally{busy=false;update();await attempts();await refreshOutbox();}
  });
  document.addEventListener('openrf:emergency-shown',load);
  update();
})();
