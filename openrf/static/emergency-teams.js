'use strict';
(() => {
  const $=id=>document.getElementById(id);
  let members=[];
  async function api(url,method='GET',body){
    const response=await fetch(url,{method,headers:body===undefined?{}:{'Content-Type':'application/json'},
      body:body===undefined?undefined:JSON.stringify(body)});
    const data=await response.json();
    if(!response.ok)throw Error(data.error||`Request failed (${response.status})`);
    return data;
  }
  function syncTransport(){
    const mesh=$('emergency-team-transport').value==='meshtastic';
    $('emergency-team-channel-label').hidden=!mesh;
    $('emergency-team-destination').placeholder=mesh?'Meshtastic !1234abcd':'32-character Reticulum hex address';
  }
  async function refresh(){
    try{
      members=(await api('/api/emergency/teams')).members;
      const list=$('emergency-team-members');list.replaceChildren();
      const teamSelect=$('emergency-team-select');const remembered=teamSelect.value;
      teamSelect.replaceChildren(new Option('Choose team',''));
      const groups=[...new Set(members.map(m=>m.group_name))];
      for(const group of groups)teamSelect.add(new Option(`${group} (${members.filter(m=>m.group_name===group).length})`,group));
      if(groups.includes(remembered))teamSelect.value=remembered;
      for(const member of members){
        const row=document.createElement('div');row.className='emergency-record';
        const label=document.createElement('span');label.textContent=`${member.group_name} · ${member.alias} · ${member.transport} ${member.destination}${member.channel===null?'':` ch ${member.channel}`}`;
        const remove=document.createElement('button');remove.type='button';remove.className='btn ghost';remove.textContent='Remove';
        remove.addEventListener('click',async()=>{if(!confirm(`Remove ${member.alias} from ${member.group_name}? Queued messages are not changed.`))return;
          try{await api(`/api/emergency/teams/${member.id}`,'DELETE');await refresh();}
          catch(e){$('emergency-team-status').textContent=e.message;}});
        row.append(label,remove);list.append(row);
      }
      if(!members.length)list.textContent='No saved team members yet.';
    }catch(e){$('emergency-team-status').textContent=e.message;}
  }
  $('emergency-team-transport').addEventListener('change',syncTransport);
  $('emergency-team-form').addEventListener('submit',async event=>{
    event.preventDefault();const mesh=$('emergency-team-transport').value==='meshtastic';
    try{
      await api('/api/emergency/teams','POST',{
        group_name:$('emergency-team-name').value,alias:$('emergency-team-alias').value,
        transport:$('emergency-team-transport').value,destination:$('emergency-team-destination').value,
        channel:mesh?Number($('emergency-team-channel').value):null});
      $('emergency-team-alias').value='';$('emergency-team-destination').value='';
      $('emergency-team-status').textContent='Member saved locally. No message sent.';await refresh();
    }catch(e){$('emergency-team-status').textContent=e.message;}
  });
  $('emergency-team-queue').addEventListener('click',async()=>{
    const group_name=$('emergency-team-select').value;
    const draft_id=Number($('emergency-handoff-draft').value);
    const text=$('emergency-handoff-text').value;
    const selected=members.filter(m=>m.group_name===group_name);
    if(!group_name||!draft_id||!text.trim()){
      $('emergency-team-status').textContent='Choose a team and a saved SOS draft with outgoing text in Emergency radio handoff first.';return;
    }
    if(!confirm(`Create ${selected.length} separate offline outbox messages for ${group_name}? This will NOT transmit anything.`))return;
    try{
      const result=await api('/api/emergency/teams/queue','POST',{group_name,draft_id,text});
      $('emergency-team-status').textContent=`${result.queued} separate messages queued locally. None sent.`;
      document.dispatchEvent(new Event('openrf:outbox-changed'));
    }catch(e){$('emergency-team-status').textContent=`Team queue failed: ${e.message}`;}
  });
  document.addEventListener('openrf:emergency-shown',refresh);
  syncTransport();
})();
