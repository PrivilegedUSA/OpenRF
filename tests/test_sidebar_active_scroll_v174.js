/* v0.2.174: active navigation stays visible within its own scroll pane on reload. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const app=fs.readFileSync('openrf/static/app.js','utf8');
const source=app.match(/function revealSelectedSidebarPage\(page\) \{[\s\S]*?\n\}\nfunction syncNavigation/);
assert(source,'Sidebar selection reveal must exist');
assert(app.includes('revealSelectedSidebarPage(page);'), 'Selection must be revealed when showPage restores the remembered page');
assert(app.includes('revealSelectedSidebarPage(rememberedPage());'), 'Drawer opening must reveal the current page');
assert(!source[0].includes('scrollIntoView'), 'Revealing a nav item must not jump the document scroll position');

function fixture({drawer=false,drawerOpen=false,scrollableNav=true,selectedTop=550,selectedBottom=592}={}){
  const nav={scrollHeight:scrollableNav?800:250,clientHeight:300,scrollTop:5,
    getBoundingClientRect(){return {top:100,bottom:400};}};
  const selected={getBoundingClientRect(){return {top:selectedTop,bottom:selectedBottom};}};
  const sidebar={scrollHeight:1000,clientHeight:500,scrollTop:7,
    getBoundingClientRect(){return {top:0,bottom:500};},
    querySelector(selector){return selector==='.nav'?nav:selector==='.nav-btn[data-page="weather"]'?selected:null;}};
  const context={mainSidebar:sidebar,compactNavigation:{matches:drawer},navigationOpen:drawerOpen};
  vm.runInNewContext(source[0].replace(/\nfunction syncNavigation$/,''),context);
  return {nav,sidebar,reveal:()=>context.revealSelectedSidebarPage('weather')};
}
{
  const x=fixture(); x.reveal();
  assert.equal(x.nav.scrollTop,207,'Desktop 7-inch nav should scroll enough to show Weather');
  assert.equal(x.sidebar.scrollTop,7,'Main sidebar itself stays still when its nav scrolls');
}
{
  const x=fixture({selectedTop:80,selectedBottom:118});x.reveal();
  assert.equal(x.nav.scrollTop,-25,'An active item above the viewport should be brought back into view');
}
{
  const x=fixture({drawer:true,drawerOpen:false,scrollableNav:false});x.reveal();
  assert.equal(x.sidebar.scrollTop,7,'Closed off-canvas drawer is not scrolled invisibly');
}
{
  const x=fixture({drawer:true,drawerOpen:true,scrollableNav:false});x.reveal();
  assert.equal(x.sidebar.scrollTop,109,'Open compact drawer scrolls the sidebar to its active item');
}
console.log('PASS v0.2.174 restored sidebar selection on desktop, 7-inch and compact drawer layouts');
