'use strict';
(() => {
  const $=id=>document.getElementById(id);
  const labelState={READY_LOCAL_ONLY:'Queued, not transmitted',
    SUBMITTED_TO_RADIO_NOT_DELIVERED:'Submitted to radio; NOT delivered',
    QUEUED_WITH_LXMF_NOT_DELIVERED:'LXMF queued; NOT delivered',
    PATH_REQUESTED_NOT_SENT:'Path requested; NOT sent',
    UNCERTAIN_AFTER_RESTART:'Uncertain after restart; review before retry',
    SEND_FAILED_NOT_DELIVERED:'Failed; NOT delivered',
    SENDING:'Manual send in progress',NO_RECALLED_IDENTITY_NOT_SENT:'No identity; NOT sent'};
  const elt=(tag,cls,content)=>{const element=document.createElement(tag);if(cls)element.className=cls;
    if(content!==undefined)element.textContent=String(content);return element;};
  function stat(parent,label,value,warning=false){
    const box=elt('div','emergency-ops-stat'+(warning?' emergency-ops-alert':''));
    box.append(elt('strong','',value),elt('span','',label));parent.append(box);
  }
  function render(data){
    $('emergency-ops-time').textContent=`Snapshot ${data.generated_utc} · not live`;
    const stats=$('emergency-ops-stats');stats.replaceChildren();
    stat(stats,'Latest person labels',data.people_total);
    stat(stats,'Reported NEED HELP',data.needs_help_reported,data.needs_help_reported>0);
    stat(stats,'Stale/unknown reports',data.stale_or_unknown,data.stale_or_unknown>0);
    stat(stats,'Incoming to review',data.pending_radio_review,data.pending_radio_review>0);
    stat(stats,'Outbox entries',data.outbox_count);
    stat(stats,'Saved recipients',data.team_recipients);
    const radios=$('emergency-ops-radios');radios.replaceChildren();
    for(const [name,transport] of Object.entries(data.transports)){
      const row=elt('div','emergency-ops-radio');
      row.append(elt('strong','',name==='meshtastic'?'Meshtastic':'Reticulum/LXMF'),
        elt('span','',transport.local_ready?'Local interface ready · remote reachability UNKNOWN':'Not ready for operator send'));
      radios.append(row);
    }
    const people=$('emergency-ops-people');people.replaceChildren();
    if(!data.people.length)people.append(elt('p','muted','No local family status reports.'));
    for(const person of data.people.slice(0,30)){
      const card=elt('article','emergency-record');
      card.append(elt('strong','',`${person.person}: ${person.status.replaceAll('_',' ')}`),
        elt('p','muted small',`${person.freshness.replaceAll('_',' ')} · ${person.source.replaceAll('_',' ')} · Recorded ${person.recorded_utc}${person.origin_transport?' · via '+person.origin_transport+' '+(person.origin_sender||''):''}`));
      people.append(card);
    }
    const outbox=$('emergency-ops-outbox');outbox.replaceChildren();
    if(!data.outbox_items.length)outbox.append(elt('p','muted','No local outbox entries.'));
    for(const item of data.outbox_items){
      const card=elt('article','emergency-record');
      card.append(elt('strong','',`#${item.id} · ${item.transport} ${item.group_name?'· '+item.group_name:''}`),
        elt('p','muted small',labelState[item.state]||`Unrecognized state: ${item.state}`));outbox.append(card);
    }
    $('emergency-ops-message').textContent=`${data.pending_radio_review} incoming radio messages awaiting manual review. Queue counts do not prove delivery. ${data.warning}`;
  }
  async function refresh(){
    $('emergency-ops-refresh').disabled=true;
    try{
      const response=await fetch('/api/emergency/dashboard');
      const data=await response.json();if(!response.ok)throw Error(data.error||`HTTP ${response.status}`);
      render(data);
    }catch(error){$('emergency-ops-message').textContent=`Dashboard unavailable: ${error.message}`;}
    finally{$('emergency-ops-refresh').disabled=false;}
  }
  $('emergency-ops-refresh').addEventListener('click',refresh);
  document.addEventListener('openrf:emergency-shown',refresh);
})();
