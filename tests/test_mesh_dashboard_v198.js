'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {conversationTarget}=require('../openrf/static/mesh-dashboard.js');
const m='!1234abcd',c='a'.repeat(64),r='b'.repeat(32);
assert.equal(conversationTarget({protocol:'Meshtastic',id:m.toUpperCase()}),m);
assert.equal(conversationTarget({protocol:'Meshtastic',id:'^all'}),null);
assert.equal(conversationTarget({protocol:'MeshCore',id:c,role:'Client'}),c);
for(const role of ['Repeater','Room server',null])assert.equal(conversationTarget({protocol:'MeshCore',id:c,role}),null);
assert.equal(conversationTarget({protocol:'Reticulum',id:r,saved_contact:true}),r);
assert.equal(conversationTarget({protocol:'Reticulum',id:r,saved_contact:false}),null);
assert.equal(conversationTarget({protocol:'Reticulum',id:'bad',saved_contact:true}),null);
function handler(file,end,globals){
 const code=fs.readFileSync('openrf/static/'+file,'utf8');
 const start=code.indexOf("  document.addEventListener('openrf:mesh-node-conversation'");
 const snippet=code.slice(start,code.indexOf(end,start));
 let cb;vm.runInNewContext(snippet,{...globals,document:{addEventListener(_,fn){cb=fn;}}});return cb;
}
let opened=[],notes=[];const draft={value:'unsent'};
const coreState={selected:'old',busy:false};
const core=handler('meshcore.js',"  el('meshcore-back')",{state:coreState,el:()=>draft,messageNotice:m=>notes.push(m),openThread:id=>opened.push(id)});
core({detail:{protocol:'MeshCore',id:c}});assert.equal(opened.length,0);assert.equal(draft.value,'unsent');
draft.value='';core({detail:{protocol:'MeshCore',id:c}});assert.deepEqual(opened,[c]);
const retState={activeThread:null,busy:false,contacts:[],attachment:null};
const ret=handler('reticulum.js',"  document.addEventListener('openrf:reticulum-shown'",{state:retState,threadAddress:v=>/^[0-9a-f]{32}$/.test(v)?v:null,window:{},voicePending:false,voiceRecorder:null,sendNote:m=>notes.push(m),contactNote:m=>notes.push(m),openThread:id=>opened.push(id)});
ret({detail:{protocol:'Reticulum',id:r}});assert.deepEqual(opened,[c]);
retState.contacts=[{address:r}];retState.attachment={};ret({detail:{protocol:'Reticulum',id:r}});assert.deepEqual(opened,[c]);
retState.attachment=null;ret({detail:{protocol:'Reticulum',id:r}});assert.deepEqual(opened,[c,r]);
console.log('PASS conversation target validation and draft/attachment guards');
