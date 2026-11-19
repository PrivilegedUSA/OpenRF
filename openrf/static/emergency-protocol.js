'use strict';
(() => {
  const $=id=>document.getElementById(id);
  let prepared=null;
  async function api(path,method='GET',body){
    const response=await fetch(path,{method,headers:body===undefined?{}:{'Content-Type':'application/json'},
      body:body===undefined?undefined:JSON.stringify(body)});
    const data=await response.json();if(!response.ok)throw Error(data.error||`HTTP ${response.status}`);return data;
  }
  function reset(){prepared=null;$('emergency-protocol-preview').value='';$('emergency-protocol-queue').disabled=true;}
  for(const id of ['emergency-protocol-person','emergency-protocol-status','emergency-protocol-note']){
    $(id).addEventListener('input',reset);$(id).addEventListener('change',reset);
  }
  async function refresh(){
    const members=(await api('/api/emergency/teams')).members;
    const select=$('emergency-protocol-team'),old=select.value;
    select.replaceChildren(new Option('Select team after preparing',''));
    const groups=[...new Set(members.map(m=>m.group_name))];
    for(const group of groups)select.add(new Option(`${group} (${members.filter(m=>m.group_name===group).length} recipients)`,group));
    if(groups.includes(old))select.value=old;
  }
  $('emergency-protocol-form').addEventListener('submit',async event=>{
    event.preventDefault();reset();
    try{
      const result=await api('/api/emergency/protocol/prepare','POST',{
        person:$('emergency-protocol-person').value,status:$('emergency-protocol-status').value,
        note:$('emergency-protocol-note').value});
      prepared={draft_id:result.draft_id,text:result.frame.text};
      $('emergency-protocol-preview').value=result.frame.text;
      $('emergency-protocol-queue').disabled=false;
      $('emergency-protocol-info').textContent=`Unsent local draft #${result.draft_id} prepared; ${result.frame.bytes}/180 bytes. ID ${result.frame.message_id}. No transmission.`;
      document.dispatchEvent(new Event('openrf:emergency-shown'));
    }catch(error){$('emergency-protocol-info').textContent=error.message;}
  });
  $('emergency-protocol-queue').addEventListener('click',async()=>{
    const group_name=$('emergency-protocol-team').value;
    if(!prepared||!group_name){$('emergency-protocol-info').textContent='Prepare a check-in and select a saved team.';return;}
    if(!confirm(`Queue one unsent message per saved recipient in ${group_name}? No radio send will occur.`))return;
    try{
      const result=await api('/api/emergency/teams/queue','POST',{
        group_name,draft_id:prepared.draft_id,text:prepared.text});
      $('emergency-protocol-info').textContent=`${result.queued} separate messages queued locally. Review and send each manually in Emergency outbox.`;
      $('emergency-protocol-queue').disabled=true;prepared=null;
      document.dispatchEvent(new Event('openrf:outbox-changed'));
    }catch(error){$('emergency-protocol-info').textContent=error.message;}
  });
  document.addEventListener('openrf:emergency-shown',()=>refresh().catch(error=>{
    $('emergency-protocol-info').textContent=error.message;}));
})();
