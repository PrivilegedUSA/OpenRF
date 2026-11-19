'use strict';
(() => {
  const board=document.getElementById('emergency-inbox-board');
  const info=document.getElementById('emergency-inbox-info');
  async function api(path,method='GET',body){
    const response=await fetch(path,{method,headers:body===undefined?{}:{'Content-Type':'application/json'},
      body:body===undefined?undefined:JSON.stringify(body)});
    const result=await response.json();if(!response.ok)throw Error(result.error||`HTTP ${response.status}`);return result;
  }
  async function refresh(){
    const items=(await api('/api/emergency/inbox')).candidates;
    board.replaceChildren();
    if(!items.length){board.textContent='No radio messages imported for review.';return;}
    for(const item of items){
      const card=document.createElement('article');card.className='emergency-record';
      const title=document.createElement('strong');title.textContent=`${item.transport.toUpperCase()} · ${item.sender} · ${item.state}`;card.append(title);
      const time=document.createElement('p');time.className='muted small';
      time.textContent=`Receiver timestamp ${item.received_utc} (not sender-verified). Imported ${item.imported_utc}.`;
      card.append(time);
      const message=document.createElement('p');message.textContent=item.body;card.append(message);
      if(item.protocol){
        const parsed=document.createElement('p');parsed.className='muted small';
        if(item.protocol.kind==='CHECKIN_CLAIM'){
          parsed.textContent=`ORF1 structured CLAIM: ${item.protocol.person_claim} · ${item.protocol.status_claim} · ${item.protocol.note_claim}. Sender time ${new Date(item.protocol.sender_unix_claim*1000).toISOString()} (UNVERIFIED). Message ID ${item.protocol.message_id}.`;
          const ack=document.createElement('button');ack.className='btn ghost';ack.type='button';
          ack.textContent='Prepare acknowledgment text';
          ack.addEventListener('click',async()=>{
            try{const result=await api('/api/emergency/protocol/ack','POST',{message_id:item.protocol.message_id});
              const output=document.createElement('textarea');output.className='field';output.readOnly=true;output.value=result.text;output.rows=2;
              const note=document.createElement('small');note.textContent='Copy manually if appropriate. No acknowledgment transmitted or delivery confirmed.';
              ack.replaceWith(output,note);
            }catch(error){info.textContent=error.message;}
          });card.append(parsed,ack);
        }else{
          parsed.textContent=`ORF1 acknowledgment CLAIM for ID ${item.protocol.message_id}. This is not verified delivery or human reading.`;
          card.append(parsed);
        }
      }
      if(item.state==='PENDING'){
        const form=document.createElement('form');form.className='emergency-form';
        const person=document.createElement('input');person.className='field';person.placeholder='Person label you independently confirmed';person.maxLength=80;person.required=true;
        const status=document.createElement('select');status.className='field';
        for(const [value,label] of [['CHECK_IN','Checking in'],['SAFE','Safe'],['NEED_HELP','Needs assistance'],['EVACUATING','Evacuating']]){
          const option=document.createElement('option');option.value=value;option.textContent=label;status.append(option);
        }
        const note=document.createElement('textarea');note.className='field';note.maxLength=500;note.rows=2;
        note.placeholder='Your review notes; source text remains in inbox';
        const accept=document.createElement('button');accept.type='submit';accept.className='btn primary';accept.textContent='Accept as unverified radio report';
        const discard=document.createElement('button');discard.type='button';discard.className='btn ghost';discard.textContent='Discard candidate';
        const label=document.createElement('label');label.textContent='Person';label.append(person);
        const labelStatus=document.createElement('label');labelStatus.textContent='Reviewed status';labelStatus.append(status);
        const labelNote=document.createElement('label');labelNote.textContent='Review notes';labelNote.append(note);
        form.append(label,labelStatus,labelNote,accept,discard);
        form.addEventListener('submit',async event=>{
          event.preventDefault();if(!confirm('Save as an unverified, reviewed radio report with NO verified GPS?'))return;
          try{await api(`/api/emergency/inbox/${item.id}/accept`,'POST',{person:person.value,status:status.value,note:note.value});
            info.textContent='Radio report saved locally, not authenticated, not shared.';
            await refresh();document.dispatchEvent(new Event('openrf:emergency-shown'));
          }catch(error){info.textContent=error.message;}
        });
        discard.addEventListener('click',async()=>{
          try{await api(`/api/emergency/inbox/${item.id}/discard`,'POST',{});info.textContent='Candidate discarded locally.';await refresh();}
          catch(error){info.textContent=error.message;}
        });card.append(form);
      }
      board.append(card);
    }
  }
  document.getElementById('emergency-inbox-scan').addEventListener('click',async()=>{
    try{const result=await api('/api/emergency/inbox/scan','POST',{});
      info.textContent=`${result.new_candidates} new candidates from current radio inbox snapshots. No messages sent.`;await refresh();}
    catch(error){info.textContent=`Scan unavailable: ${error.message}`;}
  });
  document.addEventListener('openrf:emergency-shown',()=>refresh().catch(error=>{info.textContent=error.message;}));
})();
