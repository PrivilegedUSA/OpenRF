'use strict';
(() => {
  const $=id=>document.getElementById(id);
  let searchSequence=0;
  async function api(url,method='GET',body){
    const response=await fetch(url,{method,headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
    const result=await response.json();
    if(!response.ok)throw Error(result.error||`Request failed (${response.status})`);
    return result;
  }
  async function load(){
    const sequence=++searchSequence;
    try{
      const result=await api('/api/emergency/library?q='+encodeURIComponent($('emergency-library-search').value));
      if(sequence!==searchSequence)return;
      const list=$('emergency-library-results');list.replaceChildren();
      $('emergency-library-status').textContent=`${result.references.length} saved reference(s) found. No internet lookup or verification performed.`;
      for(const record of result.references){
        const card=document.createElement('article');card.className='emergency-record';
        const heading=document.createElement('strong');heading.textContent=record.title;card.append(heading);
        const source=document.createElement('p');source.className='muted';source.textContent=`${record.category} · Source: ${record.source}`;card.append(source);
        const body=document.createElement('details');const summary=document.createElement('summary');summary.textContent='Read reference';
        const content=document.createElement('div');content.className='emergency-reference-body';content.textContent=record.content;
        body.append(summary,content);card.append(body);
        const remove=document.createElement('button');remove.type='button';remove.className='btn ghost';remove.textContent='Delete';
        remove.addEventListener('click',async()=>{if(!confirm('Delete this locally saved reference?'))return;
          try{await api(`/api/emergency/library/${record.id}`,'DELETE');await load();}catch(e){$('emergency-library-status').textContent=e.message;}});
        card.append(remove);list.append(card);
      }
    }catch(e){if(sequence===searchSequence)$('emergency-library-status').textContent=e.message;}
  }
  let debounce;
  $('emergency-library-search').addEventListener('input',()=>{clearTimeout(debounce);debounce=setTimeout(load,180);});
  $('emergency-library-form').addEventListener('submit',async event=>{
    event.preventDefault();
    const fields=['title','category','source','content'];const record={};
    for(const field of fields)record[field]=$('emergency-library-'+field).value;
    try{await api('/api/emergency/library','POST',record);event.target.reset();
      $('emergency-library-search').value='';await load();$('emergency-library-status').textContent='Saved locally. Reference is available offline.';
    }catch(e){$('emergency-library-status').textContent=e.message;}
  });
  async function install(pack){
    const result=await api('/api/emergency/packs/install','POST',pack);
    $('emergency-library-search').value='';await load();
    $('emergency-library-status').textContent=`${result.pack}: ${result.imported} added, ${result.already_present} already present. Verify pack sources before relying on the content.`;
  }
  $('emergency-pack-starter').addEventListener('click',async()=>{
    try{const response=await api('/api/emergency/packs/starter');await install(response);}
    catch(e){$('emergency-library-status').textContent=e.message;}
  });
  $('emergency-pack-file').addEventListener('change',async event=>{
    const file=event.target.files?.[0];if(!file)return;
    try{
      if(file.size>200000)throw Error('Pack is too large (200 KB maximum).');
      const pack=JSON.parse(await file.text());
      if(!confirm(`Import ${String(pack.name||'this pack').slice(0,120)}? Only import content from sources you trust.`))return;
      await install(pack);
    }catch(e){$('emergency-library-status').textContent=`Import failed: ${e.message}`;}
    finally{event.target.value='';}
  });
  document.addEventListener('openrf:emergency-shown',load);
})();
