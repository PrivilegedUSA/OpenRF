'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const guide=require('../openrf/static/route_guidance.js');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const app=fs.readFileSync('openrf/static/app.js','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
for(const id of ['map-voice-toggle','map-voice-status','map-traffic-status','map-lane-guidance','map-lane-arrows'])
 assert(html.includes(`id="${id}"`),id);
assert(css.includes('.map-lane-arrows') && css.includes('.lane-chip.active'));
const lanes=guide.laneGuidance({lanes:[{directions:8,active:8},{directions:10,valid:8}]});
assert.equal(lanes.length,2);
assert.equal(lanes[0].arrows,'←');
assert(lanes[0].active && lanes[0].valid);
assert(lanes[1].valid && !lanes[1].active);
assert(lanes[1].arrows.includes('↑') && lanes[1].arrows.includes('←'));
for(const wrong of [undefined,[],[{directions:'left'}],[{directions:-1}],[{directions:4096}],[{directions:0}]])
 assert.deepEqual(guide.laneGuidance({lanes:wrong}),[]);
const a={leg:1,shape_index:30,instruction:'Turn left',verbal_pre_transition_instruction:'Turn left now.',
 verbal_transition_alert_instruction:'Prepare to turn left.',distance_m:490};
let cue=guide.voiceCue(null,a);
assert.equal(cue.text,null);
cue=guide.voiceCue(cue.memory,{...a,distance_m:390});
assert.equal(cue.text,'Prepare to turn left.');
let repeat=guide.voiceCue(cue.memory,{...a,distance_m:290});
assert.equal(repeat.text,null,'do not repeat the warning at every GPS fix');
cue=guide.voiceCue(cue.memory,{...a,distance_m:75});
assert.equal(cue.text,'Turn left now.');
repeat=guide.voiceCue(cue.memory,{...a,distance_m:24});
assert.equal(repeat.text,null,'do not repeat the final instruction');
cue=guide.voiceCue(cue.memory,{...a,shape_index:44,distance_m:85,instruction:'Turn right',verbal_pre_transition_instruction:null});
assert.equal(cue.text,'Turn right','fall back to the source instruction, never invent a turn');
assert.deepEqual(guide.laneGuidance({lanes:null}),[]);
assert(app.includes('if(state.navDemoActive)'), 'disable voice during DEMO');
assert(app.includes('accuracy<=40 && movingHeading!==null'), 'spoken turns need accurate moving position');
assert(app.includes('resetNavigationVoice();renderNavigationLanes(null,false);'), 'stop silences speech and clears lanes');
assert(app.includes('navigationSilence();') && app.includes('state.navVoiceEnabled=false'));
assert(!app.includes('SpeechRecognition'),'no microphone or remote recognizer');
console.log('v0.2.59 opt-in voice, silent demo, lane fidelity and nonrepeating cues passed');
// Actual extracted click handlers: voice must never start before navigation,
// on an unsupported browser, or during simulation; turning it off cancels TTS.
const s=app.slice(app.indexOf('function navigationVoiceAvailable(){'),app.indexOf('// v0.2.32: opt-in GPS follow view.'));
const events={};let spoken=[],cancelCount=0;
const state={navFollowId:null,navDemoActive:false,navVoiceEnabled:false,navVoiceMemory:null};
const elements={
 'map-voice-toggle':{textContent:'',setAttribute(n,v){this[n]=v},addEventListener(n,fn){events[n]=fn}},
 'map-voice-status':{textContent:''},
 'map-lane-guidance':{hidden:true},
 'map-lane-arrows':{replaceChildren(){}}
};
const window={
 speechSynthesis:{cancel(){cancelCount++},speak(u){spoken.push(u.text)}},
 SpeechSynthesisUtterance:class{constructor(t){this.text=t}}
};
const $=id=>elements[id];
const voice=Function('state','$','window','routeGuide',s+';return {navigationSpeak,navigationSilence,resetNavigationVoice};')(state,$,window,guide);
events.click();assert.equal(state.navVoiceEnabled,false,'no speech when GPS follow not active');
state.navFollowId=5;state.navDemoActive=true;events.click();
assert.equal(spoken.length,0,'DEMO cannot activate spoken turn guidance');
state.navDemoActive=false;events.click();
assert.equal(state.navVoiceEnabled,true);assert.equal(spoken.length,1);
assert.equal(elements['map-voice-toggle']['aria-pressed'],'true');
voice.navigationSpeak('Turn left in one hundred feet.');
assert.equal(spoken.at(-1),'Turn left in one hundred feet.');
events.click();assert.equal(state.navVoiceEnabled,false);assert(cancelCount>0);
voice.resetNavigationVoice();assert.equal(elements['map-voice-toggle']['aria-pressed'],'false');
console.log('v0.2.59 extracted live voice toggle/cancel and DEMO gating passed');
