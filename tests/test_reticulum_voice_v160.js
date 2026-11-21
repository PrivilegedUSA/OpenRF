'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const js=fs.readFileSync('openrf/static/reticulum.js','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
const main=fs.readFileSync('tools/openrf-electron/main.js','utf8');
const preload=fs.readFileSync('tools/openrf-electron/preload.js','utf8');
for(const id of ['reticulum-voice-record','reticulum-voice-stop','reticulum-voice-discard',
  'reticulum-voice-status','reticulum-voice-timer','reticulum-attachment-audio'])
  assert(html.includes(`id="${id}"`),`Missing ${id}`);
assert(css.includes('.reticulum-voice-compose'));
assert(js.includes("else if(['audio/webm','audio/ogg','audio/mp4'].includes(attachment.mime))"));
assert(js.includes("player.preload='none'"),'Never preload remote voice notes');
assert(js.includes("navigator.mediaDevices.getUserMedia({audio:true,video:false})"));
assert(js.includes('maxVoiceSeconds=20'));
assert(js.includes('voicePending||Boolean(voiceRecorder)||'),
  'Cannot send text or an older attachment while microphone capture is pending/active');
assert(main.includes('session.defaultSession.setPermissionRequestHandler'));
assert(main.includes("details.mediaTypes[0]==='audio'"));
assert(main.includes("event.sender!==win.webContents"));
assert(preload.includes('openrfVoicePermission'));
assert(!js.includes('innerHTML'));

const events=[];
const elems=Object.create(null);
const node=id=>elems[id]||(elems[id]={id,hidden:true,disabled:false,textContent:'',value:'',
  classList:{toggle(){}},pause(){},load(){},removeAttribute(name){delete this[name];}});
const state={enabled:true,busy:false,attachment:null,attachmentPreviewUrl:null};
let micStops=0,permissionRequests=0,grants=0;
const stream={getTracks:()=>[{stop:()=>{micStops++;}}]};
class FakeRecorder{
  static isTypeSupported(type){return type==='audio/webm;codecs=opus';}
  constructor(s,opts){assert.equal(s,stream);this.mimeType=opts.mimeType;this.state='inactive';events.push('constructed');}
  start(){this.state='recording';events.push('started');}
  stop(){this.state='inactive';this.ondataavailable({data:new Blob([Buffer.from([0x1a,0x45,0xdf,0xa3,1,2,3])],{type:'audio/webm'})});this.onstop();}
}
const source=js.slice(js.indexOf('  function voiceMessage('),js.indexOf('  function friendlyMessageTime('));
assert(source.includes('async function startVoice'));
const context={
  state,events,window:{openrfVoicePermission:{arm:async()=>{grants++;return true;},disarm:async()=>true},confirm:()=>true},
  navigator:{mediaDevices:{getUserMedia:async()=>{permissionRequests++;return stream;}}},
  MediaRecorder:FakeRecorder,Blob,File,Buffer,Date,URL:{createObjectURL:()=> 'blob:fake',revokeObjectURL:()=>{}},
  setInterval:()=>1,clearInterval:()=>{},document:{},
  el:node,updateControls:()=>{},maxAttachmentBytes:128*1024,maxVoiceSeconds:20,
  viewingMessages:()=>true,
};
vm.runInNewContext(`let voiceRecorder=null,voiceStream=null,voiceTimer=null,voiceStarted=0,
  voiceEpoch=0,voicePending=false,voiceFile=false;
  const {state,window,navigator,MediaRecorder,Blob,File,Date,URL}=globalThis;
  const {el,updateControls,viewingMessages,maxAttachmentBytes,maxVoiceSeconds}=globalThis;
  ${source}
  globalThis.startVoice=startVoice;globalThis.finishVoice=finishVoice;globalThis.cancelVoice=cancelVoice;`,context);
(async()=>{
  assert.equal(permissionRequests,0,'No microphone on page load');
  await context.startVoice();
  assert.equal(permissionRequests,1,'One deliberate user action requests audio');
  assert.equal(grants,1,'Electron microphone permission armed only on click');
  assert(events.includes('started'));
  context.finishVoice();
  assert.equal(micStops,1,'Microphone track released on Stop');
  assert(state.attachment,'Voice note staged locally for deliberate Send');
  assert(state.attachment.size>0&&state.attachment.size<128*1024);
  assert.equal(state.attachment.type,'audio/webm');
  assert.equal(node('reticulum-attachment-audio').hidden,false,'Local playback appears');
  assert.match(node('reticulum-voice-status').textContent,/Nothing has been transmitted/);
  context.cancelVoice(true);
  assert.equal(permissionRequests,1,'Discard does not reacquire microphone');
  console.log('PASS v0.2.160 opt-in short voice recording, microphone cleanup, audio preview and permissions');
})().catch(error=>{console.error(error);process.exitCode=1;});
