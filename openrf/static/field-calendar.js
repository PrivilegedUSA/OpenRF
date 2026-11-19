'use strict';
(() => {
  const $=id=>document.getElementById(id);
  let viewed=new Date(),selected=new Date();
  function refreshClock(){
    const now=new Date();
    $('field-clock-time').textContent=new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit'}).format(now);
    $('field-clock-date').textContent=new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric'}).format(now);
  }
  function render(){
    const year=viewed.getFullYear(),month=viewed.getMonth();
    $('field-calendar-month').textContent=new Intl.DateTimeFormat(undefined,{month:'long',year:'numeric'}).format(new Date(year,month,1));
    const grid=$('field-calendar-grid');grid.replaceChildren();
    for(const weekday of ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']){
      const label=document.createElement('span');label.textContent=weekday;label.className='field-calendar-weekday';grid.append(label);
    }
    const first=new Date(year,month,1).getDay();
    for(let i=0;i<first;i++)grid.append(document.createElement('span'));
    const count=new Date(year,month+1,0).getDate(),today=new Date();
    for(let day=1;day<=count;day++){
      const button=document.createElement('button');button.type='button';button.textContent=String(day);
      const date=new Date(year,month,day);
      button.className='field-calendar-day';
      if(date.toDateString()===today.toDateString())button.classList.add('is-today');
      if(date.toDateString()===selected.toDateString())button.classList.add('is-selected');
      button.setAttribute('aria-label',new Intl.DateTimeFormat(undefined,{weekday:'long',month:'long',day:'numeric',year:'numeric'}).format(date));
      button.addEventListener('click',()=>{selected=date;render();});grid.append(button);
    }
    const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone||'Device local time';
    $('field-calendar-details').textContent=`Selected ${selected.toLocaleDateString(undefined,{weekday:'long',year:'numeric',month:'long',day:'numeric'})} · ${timezone}. Device clock is not independently verified.`;
  }
  function toggle(open){$('field-calendar-panel').hidden=!open;$('field-clock-button').setAttribute('aria-expanded',String(open));if(open)render();}
  $('field-clock-button').addEventListener('click',()=>toggle($('field-calendar-panel').hidden));
  $('field-calendar-prev').addEventListener('click',()=>{viewed=new Date(viewed.getFullYear(),viewed.getMonth()-1,1);render();});
  $('field-calendar-next').addEventListener('click',()=>{viewed=new Date(viewed.getFullYear(),viewed.getMonth()+1,1);render();});
  $('field-calendar-today').addEventListener('click',()=>{selected=new Date();viewed=new Date();render();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')toggle(false);});
  document.addEventListener('click',event=>{if(!event.target.closest('.field-clock-wrap'))toggle(false);});
  refreshClock();setInterval(refreshClock,30000);
})();
