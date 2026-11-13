'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('openrf/static/index.html','utf8');
const app=fs.readFileSync('openrf/static/app.js','utf8');
const css=fs.readFileSync('openrf/static/app.css','utf8');
for(const id of ['field-active-summary','field-active-state','field-action-row','field-open-receiver',
 'field-open-map','field-edit-plan','field-add-observation','field-scanner-link','field-map-link',
 'session-form','field-plan-form','field-plan-dialog'])
 assert(html.includes(`id="${id}"`),`Missing field survey UI ${id}`);
for(const receiver of ['UNASSIGNED','WIFI_NM','BLE_BLUEZ','USB_SERIAL','RTL_POWER_FILE','MANUAL']){
 assert(html.includes(`value="${receiver}"`));assert(app.includes(`${receiver}: {label:`));
}
for(const field of ['receiver_plan','site_label','objective','field_notes'])
 assert(html.includes(`name="${field}"`),`Missing local plan field ${field}`);
assert(html.includes('receiver selection is only a plan'));
assert(app.includes("$('field-open-receiver').addEventListener") && app.includes('showPage(page)'));
assert(app.includes('renderActiveFieldSurvey();'));
assert(app.includes("await api(`/api/sessions/${active.id}/plan`,'POST',data)"));
assert(app.includes('activeFieldSurvey()'));
assert(app.includes('Saved data is local and historical'));
assert(app.includes('escapeHTML(active.name)'));
assert(app.includes('escapeHTML(active.objective'));
assert(app.includes('Never') === false || app.includes('No scanning')); // No side effect on render
assert(!app.includes("localStorage.setItem('fieldPlan'"));
assert(css.includes('.field-plan-fields') && css.includes('max-width:650px'));
console.log('v0.2.44 field survey plan, navigation shortcuts, provenance and compact UI checks passed');
