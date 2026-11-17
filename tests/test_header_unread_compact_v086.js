'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
const mesh=fs.readFileSync('openrf/static/mesh.js','utf8');
const badge=css.match(/#mesh-header-button #mesh-header-unread\{([^}]*)\}/)?.[1]||'';
assert(html.includes('id="mesh-header-unread" hidden'),'No badge when read');
assert(badge.includes('top:8px;right:4px'),'Position relative to the envelope, inside the header button');
assert(badge.includes('min-width:13px;height:13px'),'Compact count');
assert(badge.includes('font-size:8px'),'Small count font');
assert(badge.includes('pointer-events:none'),'Do not block envelope tap');
assert(badge.includes('background:#34c9b1'),'Use muted teal instead of large amber badge');
assert(mesh.includes('const reticulumUnread=state.reticulumUnread||0;')&&mesh.includes('const count=state.unread+reticulumUnread;'),
  'Preserve the shared Meshtastic and Reticulum counter');
assert(css.includes('.mesh-unread-badge[hidden]{display:none!important}'));
console.log('PASS v0.2.101 compact teal notification overlay without losing unread counts');
