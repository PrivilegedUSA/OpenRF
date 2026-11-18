'use strict';
// Ensure a second save cannot silently rename an existing LXMF contact.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const js=fs.readFileSync('openrf/static/reticulum.js','utf8');
const html=fs.readFileSync('openrf/static/index.html','utf8');
for(const id of ['reticulum-contact-submit','reticulum-contact-cancel'])
  assert(html.includes(`id="${id}"`));
function element(){
  return {value:'',events:{},hidden:true,readOnly:false,open:false,classList:{toggle(){}},
    addEventListener(type,cb){this.events[type]=cb;},
    focus(){this.focused=true;},
    reset(){elements['reticulum-contact-address'].value='';
      elements['reticulum-contact-alias'].value='';}};
}
const a='a'.repeat(32),b='b'.repeat(32);
const elements={};
for(const name of ['reticulum-save-recipient','reticulum-recipient','reticulum-contacts-panel',
  'reticulum-contact-form','reticulum-contact-address','reticulum-contact-alias',
  'reticulum-contact-status','reticulum-contact-submit','reticulum-contact-cancel'])
  elements[name]=element();
const calls=[],notes=[],state={contacts:[{address:a,alias:'Sideband'}],editingContact:null};
const context={elements,calls,notes,state};
const helpers=js.slice(js.indexOf('  function contactNote('),js.indexOf('  function renderContacts('));
const handlers=js.slice(js.indexOf("  el('reticulum-save-recipient').addEventListener"),
  js.indexOf("  el('reticulum-save-history').addEventListener"));
vm.runInNewContext(`const el=id=>globalThis.elements[id];
  const state=globalThis.state;
  const request=async (path,payload)=>{globalThis.calls.push({path,payload});
    return {contact:{address:payload.destination,alias:payload.alias}};};
  const refreshContacts=async()=>{};
  ${helpers}
  ${handlers}
  globalThis.beginEdit=contactEditMode;`,context);
const address=elements['reticulum-contact-address'];
const alias=elements['reticulum-contact-alias'];
const status=elements['reticulum-contact-status'];
const form=elements['reticulum-contact-form'];
const submit=()=>form.events.submit({preventDefault(){}});
(async()=>{
  elements['reticulum-recipient'].value=a.toUpperCase();
  elements['reticulum-save-recipient'].events.click();
  assert.match(status.textContent,/already saved as Sideband/i);
  assert.equal(elements['reticulum-contacts-panel'].open,true);
  address.value=a.toUpperCase();alias.value='Accidental name';
  await submit();
  assert.equal(calls.length,0,'Duplicate address must never silently update');
  assert.match(status.textContent,/Use Edit/);

  context.beginEdit(a);
  assert.equal(address.readOnly,true,'Edit locks original address');
  assert.equal(elements['reticulum-contact-submit'].textContent,'Update contact');
  assert.equal(elements['reticulum-contact-cancel'].hidden,false);
  address.value=a;alias.value='Renamed phone';
  await submit();
  assert.equal(calls.length,1);
  assert.equal(calls[0].path,'/api/reticulum/contacts');
  assert.equal(calls[0].payload.update,true,'Editing must be explicit');
  assert.equal(calls[0].payload.destination,a);
  assert.equal(elements['reticulum-contact-cancel'].hidden,true);
  assert.equal(address.readOnly,false);

  address.value=b;alias.value='New person';
  await submit();
  assert.equal(calls.length,2);
  assert.equal(calls[1].payload.destination,b);
  assert.equal('update' in calls[1].payload,false,'New contact cannot be an update');
  context.beginEdit(a);
  elements['reticulum-contact-cancel'].events.click();
  assert.equal(state.editingContact,null);
  assert.equal(address.readOnly,false);
  assert.match(status.textContent,/canceled/);
  console.log('PASS v0.2.104 duplicate contact guard and explicit nickname edit');
})().catch(error=>{console.error(error);process.exitCode=1;});
