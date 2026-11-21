'use strict';
// Exercise the tab controller with lightweight DOM doubles; no radio, LXMF or
// microphone access is permitted or needed for these layout interactions.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('openrf/static/index.html', 'utf8');
const css = fs.readFileSync('openrf/static/app.css', 'utf8');
const code = fs.readFileSync('openrf/static/reticulum-tabs.js', 'utf8');
assert(html.includes('/static/reticulum-tabs.js?v=0.2.165'));
assert(css.includes('.reticulum-tab-panel[hidden]{display:none!important}'));
assert(!/\.scrollIntoView\s*\(/.test(code), 'Tab changes must not scroll the page');

class FakeElement {
  constructor(id = '', className = '') {
    this.id = id;
    this.className = className;
    this.children = [];
    this.events = {};
    this.attributes = {};
    this.dataset = {};
    this.tabIndex = -1;
    this.previousElementSibling = null;
    this.ownIds = [];
    this.hidden = false;
  }
  append(...nodes) { for (const node of nodes) { if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1); this.children.push(node); node.parent = node.parentElement = this; } }
  prepend(...nodes) { for (const node of nodes.reverse()) { if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1); this.children.unshift(node); node.parent = node.parentElement = this; } }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, fn) { this.events[name] = fn; }
  querySelector(selector) { return selector.split(/\s*,\s*/).some(part => part[0] === '#' && this.ownIds.includes(part.slice(1))) ? {} : null; }
  matches(selectors) { return selectors.split(/\s*,\s*/).some(selector => selector[0] === '#' ? selector.slice(1) === this.id : selector.slice(1) === this.className); }
  focus(options) { this.focusOptions = options; }
}

const elements = new Map();
function element(id, className = '', ownIds = []) {
  const result = new FakeElement(id, className);
  result.ownIds = ownIds;
  elements.set(id, result);
  return result;
}
const root = element('page-reticulum');
const bar = element('reticulum-tabs');
const container = element('reticulum-panel');
const btns = ['dashboard', 'inbox', 'contacts', 'files'].map(key => element(`reticulum-tab-${key}`));
element('reticulum-tab-unread');
element('reticulum-messages').scrollHeight = 480;
element('reticulum-inbox-unread').textContent = '3 unread · review messages, then mark all read';
const children = [
  element('title', 'panel-title'), element('intro'), element('reticulum-status'), element('reticulum-start-help'), element('reticulum-connection-brief'),
  element('tcp', 'reticulum-tcp-settings'), element('reticulum-halow-panel'), element('reticulum-rnode-panel'),
  element('buttons', 'button-line', ['reticulum-enable']), element('lxmf-address', 'mesh-conversation-select', ['reticulum-address']),
  element('privacy'), element('announce', 'button-line', ['reticulum-announce']), element('reticulum-files-panel'),
  element('reticulum-diagnostics-panel'), element('reticulum-contacts-panel'), element('message-heading', 'mesh-inbox-header'),
  element('read-action'), element('reticulum-thread-browser'), element('reticulum-thread-view'),
  element('reticulum-history-panel'), element('note')
];
for (let i = 0; i < children.length; i++) children[i].previousElementSibling = children[i - 1] || null;
container.append(...children);
const bluetooth = element('bluetooth-file-panel');
const events = {};
const doc = {
  getElementById: id => elements.get(id) || null,
  querySelector: selector => selector === '#reticulum-panel .reticulum-tcp-settings' ? elements.get('tcp') : null,
  createElement: () => new FakeElement(),
  addEventListener: (name, fn) => { events[name] = fn; }
};
const global = { document: doc, window: {} };
vm.runInNewContext(code, global);

const sections = Object.fromEntries(['dashboard', 'inbox', 'contacts', 'files'].map(key => [key, container.children.find(item => item.id === `reticulum-tab-panel-${key}`)]));
assert.equal(global.window.OpenRFReticulumTabs.current(), 'dashboard');
btns[1].events.click();
assert.equal(global.window.OpenRFReticulumTabs.current(), 'inbox');
assert.equal(elements.get('reticulum-messages').scrollTop,480,
  'Switching to Inbox starts with the newest message in view');
btns[0].events.click();
assert.equal(elements.get('reticulum-tab-unread').textContent, '3');
assert.deepEqual(container.children.map(item => item.id), Object.values(sections).map(item => item.id));
function contains(parent, child) { return parent === child || parent.children.some(item => contains(item, child)); }
for (const child of children)
  assert.equal(Object.values(sections).filter(section => contains(section, child)).length, 1, `${child.id} must be preserved exactly once`);
assert(sections.inbox.children.includes(elements.get('reticulum-thread-browser')));
assert(sections.contacts.children.includes(elements.get('reticulum-contacts-panel')));
assert(sections.dashboard.children.includes(elements.get('reticulum-history-panel')));
assert(sections.dashboard.children.includes(elements.get('reticulum-status')));
const settings = sections.dashboard.children.find(item => item.className === 'reticulum-dashboard-settings');
assert(settings, 'Dashboard contains grouped connection settings');
assert(contains(settings, elements.get('tcp')));
assert(contains(settings, elements.get('reticulum-halow-panel')));
assert(contains(settings, elements.get('reticulum-rnode-panel')));
assert(contains(settings, elements.get('reticulum-diagnostics-panel')));
assert.equal(settings.children[0].open, false);
assert.equal(elements.get('reticulum-halow-panel').open, false);
assert.equal(elements.get('reticulum-rnode-panel').open, false);
assert(sections.files.children.includes(bluetooth));
assert(sections.files.children.includes(elements.get('reticulum-files-panel')));

btns[3].events.click();
assert.equal(global.window.OpenRFReticulumTabs.current(), 'files');
assert.equal(sections.dashboard.hidden, true);
assert.equal(sections.files.hidden, false);
assert.equal(btns[3].attributes['aria-selected'], 'true');
assert.equal(btns[0].tabIndex, -1);
let prevented = false;
btns[3].events.keydown({ key: 'Home', preventDefault() { prevented = true; } });
assert(prevented);
assert.equal(global.window.OpenRFReticulumTabs.current(), 'dashboard');
assert.equal(btns[0].focusOptions.preventScroll, true);
events['openrf:reticulum-unread']({ detail: { count: 5 } });
assert.equal(elements.get('reticulum-tab-unread').textContent, '5');
assert.equal(btns[1].attributes['aria-label'], 'Inbox, 5 unread');
events['openrf:reticulum-unread']({ detail: { count: 0 } });
assert.equal(elements.get('reticulum-tab-unread').hidden, true);
btns[2].events.click();
assert.equal(global.window.OpenRFReticulumTabs.current(), 'contacts');
assert.equal(elements.get('reticulum-contacts-panel').open, true);

assert(!fs.existsSync('openrf/static/lxst.js'), 'No calling dependency should be bundled');
assert(!html.includes('id="reticulum-tab-connections"'), 'Connections tab must be absent');
assert(html.includes('id="reticulum-send-status"'), 'Send feedback is visible on the Inbox composer');
const reticulum = fs.readFileSync('openrf/static/reticulum.js', 'utf8');
assert(reticulum.includes("sendNote('Route discovery requested. Message NOT sent."));
assert(reticulum.includes("sendNote('Queued in LXMF."));
console.log('PASS v0.2.165: four Reticulum tabs, collapsed dashboard settings and visible Inbox send status');
