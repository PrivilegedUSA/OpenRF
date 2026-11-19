'use strict';
(() => {
  const el = id => document.getElementById(id);
  let records = [];
  const labels = {contact:'Contact',meeting_point:'Meeting point',checklist:'Checklist',sos_draft:'UNSENT SOS DRAFT'};
  async function request(url,method='GET',data){
    const response = await fetch(url,{method,headers:data===undefined?{}:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});
    const payload=await response.json();
    if(!response.ok)throw new Error(payload.error||`Request failed (${response.status})`);
    return payload;
  }
  function draw(){
    const container=el('emergency-records');container.replaceChildren();
    if(!records.length){container.textContent='No emergency records saved yet.';return;}
    for(const record of records){
      const card=document.createElement('article');card.className='emergency-record';
      const header=document.createElement('header');
      const heading=document.createElement('strong');heading.textContent=`${labels[record.kind]||record.kind}: ${record.title}`;
      header.append(heading);card.append(header);
      if(record.details){const p=document.createElement('p');p.textContent=record.details;card.append(p);}
      if(record.kind==='sos_draft'){
        const warning=document.createElement('p');warning.className='muted';warning.textContent='NOT TRANSMITTED. No recipient has been notified.';card.append(warning);
      }
      if(record.kind==='checklist'){
        const label=document.createElement('label');const check=document.createElement('input');check.type='checkbox';check.checked=Boolean(record.completed);
        check.addEventListener('change',async()=>{try{await request(`/api/emergency/checklists/${record.id}`,'POST',{completed:check.checked});await load();}catch(e){check.checked=!check.checked;el('emergency-status').textContent=e.message;}});
        label.append(check,document.createTextNode(' Completed'));card.append(label);
      }
      const remove=document.createElement('button');remove.className='btn ghost';remove.type='button';remove.textContent='Delete';
      remove.addEventListener('click',async()=>{if(!confirm(`Delete local ${labels[record.kind]} record?`))return;try{await request(`/api/emergency/records/${record.id}`,'DELETE');await load();}catch(e){el('emergency-status').textContent=e.message;}});
      card.append(remove);container.append(card);
    }
  }
  async function load(){
    try{
      const response=await request('/api/emergency/records');records=response.records||[];draw();
      const count=kind=>records.filter(item=>item.kind===kind).length;
      el('emergency-readiness').textContent=`Offline records ready: ${count('contact')} contacts, ${count('meeting_point')} meeting points, ${count('checklist')} checklist items, ${count('sos_draft')} unsent SOS drafts. Network delivery: NOT CONFIGURED. GPS and battery: not verified here.`;
    }catch(e){el('emergency-readiness').textContent=`Could not load local emergency records: ${e.message}`;}
  }
  el('emergency-form').addEventListener('submit',async event=>{
    event.preventDefault();
    try{
      await request('/api/emergency/records','POST',{kind:el('emergency-kind').value,title:el('emergency-title').value,details:el('emergency-details').value});
      el('emergency-title').value='';el('emergency-details').value='';
      el('emergency-status').textContent='Saved on this device. No message was transmitted.';await load();
    }catch(e){el('emergency-status').textContent=e.message;}
  });
  el('emergency-refresh').addEventListener('click',load);
  document.addEventListener('openrf:emergency-shown',load);
})();
