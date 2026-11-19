'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const html=fs.readFileSync('openrf/static/index.html','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
const app=fs.readFileSync('openrf/static/app.js','utf8');
const js=fs.readFileSync('openrf/static/offline-trails.js','utf8');
assert(html.includes('id="offline-trail-library"'));
assert(html.includes('id="offline-trail-import-form"'));
assert(html.includes('id="emergency-checkin-draft"'));
assert(html.includes('class="emergency-checkin-draft-choice"'));
assert(html.indexOf('id="emergency-checkin-note"')<html.indexOf('id="emergency-checkin-draft"'));
assert(html.indexOf('id="emergency-checkin-draft"')<html.indexOf('id="emergency-checkin-location"'));
assert(html.indexOf('id="emergency-checkin-location"')<html.indexOf('id="emergency-checkin-locate"'));
assert(css.includes('#page-emergency #emergency-handoff-form>.emergency-outbox-actions{display:flex;justify-content:flex-start'));
assert(css.includes('#page-emergency #emergency-handoff-form>#emergency-handoff-bytes'));
assert(app.includes("ids: ['map-breadcrumbs-panel','offline-trail-library'"));
assert(!html.includes('id="inbox-nav-item"'),'Do not ship half-unified inbox');
assert(!html.includes('data-page="inbox"'),'Unified messaging must wait for one inbox, outbox and reply flow');

const elements=new Map();
function el(id){
  if (!elements.has(id)) elements.set(id,{
    value:'',disabled:false,innerHTML:'',textContent:'',handlers:{},
    files:[],addEventListener(type,fn){this.handlers[type]=fn;},closest(){return null;}
  });
  return elements.get(id);
}
const document={getElementById:el,createElement(){return {click(){},remove(){}};},body:{append(){}}};
const window={OpenRFMapReadOnly(){return null;}};
let imported=[],uploads=0,external=0;
async function fetch(url,options={}){
  if(!url.startsWith('/api/navigation/trails')) external++;
  const method=options.method||'GET';
  let result={};
  if (method==='GET'&&url==='/api/navigation/trails') result={trails:imported};
  else if(method==='POST'&&url==='/api/navigation/trails/import'){
    uploads++;const body=JSON.parse(options.body);
    assert(body.gpx.includes('<gpx>'));
    const row={id:1,name:body.name,attribution:body.attribution,
      point_count:2,distance_m:120,bounds:[-120.5,38.5,-120.4,38.6],added_utc:new Date().toISOString()};
    imported=[row];result={trail:row};
  } else if(method==='GET'&&url==='/api/navigation/trails/1') result={...imported[0],
    segments:[[[-120.5,38.5],[-120.4,38.6]]]};
  else throw Error(`Unexpected request ${method} ${url}`);
  return {ok:true,status:200,async json(){return result;}};
}
vm.runInNewContext(js,{document,window,fetch,Date,Number,Math,JSON,Error,Blob:function(){},URL:{},
  setInterval(){},setTimeout(){},confirm(){return false;}});
const tick=()=>new Promise(resolve=>setTimeout(resolve,15));
(async()=>{
  await tick();
  assert.equal(uploads,0,'No automatic file import');
  assert.equal(external,0,'No external trail service contacted');
  el('offline-trail-name').value='Test ridge';
  el('offline-trail-credit').value='Self-created test data';
  el('offline-trail-file').files=[{name:'route.gpx',size:50,async text(){return '<gpx></gpx>';}}];
  await el('offline-trail-import-form').handlers.submit({preventDefault(){}});
  assert.equal(uploads,1,'Explicit import action creates one trail');
  assert(imported[0].name==='Test ridge');
  assert.equal(external,0,'Imported path stayed on loopback');
  console.log('PASS v0.2.132 emergency layout order and opt-in offline GPX import, no partial unified inbox');
})().catch(error=>{console.error(error);process.exitCode=1;});
