'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {carrierInfoText,bindCarrierInfo,colors}=require('../openrf/static/cellular-map.js');
assert.match(carrierInfoText('att').body,/Cricket Wireless/);
assert.match(carrierInfoText('tmobile').body,/Mint Mobile/);
assert.match(carrierInfoText('verizon').body,/Visible/);
assert.match(carrierInfoText('verizon').body,/does not guarantee reception/);
assert.match(carrierInfoText('aggregate').body,/not a live union/);
assert.equal(carrierInfoText('unknown'),null);
class Element {constructor(key){this.dataset={carrierInfo:key};this.handlers={};this.attrs={};this.hidden=true;}addEventListener(type,fn){this.handlers[type]=fn;}setAttribute(k,v){this.attrs[k]=v;}focus(){this.focused=true;}click(){this.handlers.click();}}
const ids=Object.fromEntries(['cellular-carrier-info','cellular-carrier-info-title','cellular-carrier-info-text','cellular-carrier-info-close'].map(k=>[k,new Element()]));
const buttons=['att','tmobile','verizon','aggregate'].map(k=>new Element(k));const doc={getElementById:k=>ids[k],querySelectorAll:()=>buttons};
bindCarrierInfo(doc);buttons[0].click();assert.equal(ids['cellular-carrier-info'].hidden,false);assert.equal(buttons[0].attrs['aria-expanded'],'true');assert.match(ids['cellular-carrier-info-text'].textContent,/Cricket/);
buttons[1].click();assert.equal(buttons[0].attrs['aria-expanded'],'false');assert.match(ids['cellular-carrier-info-title'].textContent,/T-Mobile/);
ids['cellular-carrier-info-close'].click();assert.equal(ids['cellular-carrier-info'].hidden,true);assert.equal(buttons[1].focused,true);
buttons[2].click();buttons[2].click();assert.equal(ids['cellular-carrier-info'].hidden,true);
buttons[3].click();ids['cellular-carrier-info'].handlers.keydown({key:'Escape',stopPropagation(){}});assert.equal(ids['cellular-carrier-info'].hidden,true);
const h=fs.readFileSync('openrf/static/index.html','utf8'),css=fs.readFileSync('openrf/static/app.css','utf8');const grid=h.split('id="cellular-carrier-grid"')[1].split('<section')[0];assert.deepEqual([...grid.matchAll(/data-cellular-carrier="(.*?)"/g)].map(m=>m[1]),['att','tmobile','verizon','aggregate']);assert.match(h,/id="cellular-regional-carriers"[\s\S]*?data-cellular-carrier="other"/);assert.doesNotMatch(grid,/<label/);assert.match(css,new RegExp('\\.cellular-dot\\.aggregate\\{background:'+colors.aggregate+'\\}'));assert.equal(colors.aggregate,'#fff39a');
console.log('Carrier info, independent checkbox controls and aggregate palette passed');

assert.match(css,/#page-map \.cellular-carrier-name\{[^}]*text-decoration:none/);
assert.match(css,/#page-map \.cellular-carrier-name:hover[^}]*color:#70e5d3/);
assert.match(css,/prefers-reduced-motion:reduce\)\{#page-map \.cellular-carrier-name\{transition:none/);
