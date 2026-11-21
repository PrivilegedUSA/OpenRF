'use strict';
// Exercise the tab controller with lightweight DOM doubles; no radio, LXMF or
// microphone access is permitted or needed for these layout interactions.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('openrf/static/index.html', 'utf8');
const css = fs.readFileSync('openrf/static/app.css', 'utf8');
const code = fs.readFileSync('openrf/static/reticulum-tabs.js', 'utf8');
assert(html.includes('/static/reticulum-tabs.js?v=0.2.162'));
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
  append(...nodes) { for (const node of nodes) { if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1); this.children.push(node); node.parent = this; } }
  prepend(...nodes) { for (const node of nodes.reverse()) { if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1); this.children.unshift(node); node.parent = this; } }
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
const btns = ['inbox', 'dashboard', 'connections', 'files'].map(key => element(`reticulum-tab-${key}`));
element('reticulum-tab-unread');
element('reticulum-inbox-unread').textContent = '3 unread · review messages, then mark all read';
const children = [
  element('title', 'panel-title'), element('intro'), element('reticulum-status'), element('reticulum-connection-brief'),
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
  createElement: () => new FakeElement(),
  addEventListener: (name, fn) => { events[name] = fn; }
};
const global = { document: doc, window: {} };
vm.runInNewContext(code, global);

const sections = Object.fromEntries(['inbox', 'dashboard', 'connections', 'files'].map(key => [key, container.children.find(item => item.id === `reticulum-tab-panel-${key}`)]));
assert.equal(global.window.OpenRFReticulumTabs.current(), 'inbox');
assert.equal(elements.get('reticulum-tab-unread').textContent, '3');
assert.deepEqual(container.children.map(item => item.id), Object.values(sections).map(item => item.id));
for (const child of children) {
  assert.equal(Object.values(sections).filter(section => section.children.includes(child)).length, 1, `${child.id} must be preserved exactly once`);
}
assert(sections.inbox.children.includes(elements.get('reticulum-thread-browser')));
assert(sections.inbox.children.includes(elements.get('reticulum-contacts-panel')));
assert(sections.dashboard.children.includes(elements.get('reticulum-status')));
assert(sections.connections.children.includes(elements.get('reticulum-rnode-panel')));
assert(sections.files.children.includes(bluetooth));
assert(sections.files.children.includes(elements.get('reticulum-files-panel')));

btns[2].events.click();
assert.equal(global.window.OpenRFReticulumTabs.current(), 'connections');
assert.equal(sections.inbox.hidden, true);
assert.equal(sections.connections.hidden, false);
assert.equal(btns[2].attributes['aria-selected'], 'true');
assert.equal(btns[0].tabIndex, -1);
let prevented = false;
btns[2].events.keydown({ key: 'Home', preventDefault() { prevented = true; } });
assert(prevented);
assert.equal(global.window.OpenRFReticulumTabs.current(), 'inbox');
assert.equal(btns[0].focusOptions.preventScroll, true);
events['openrf:reticulum-unread']({ detail: { count: 5 } });
assert.equal(elements.get('reticulum-tab-unread').textContent, '5');
assert.equal(btns[0].attributes['aria-label'], 'Inbox, 5 unread');
events['openrf:reticulum-unread']({ detail: { count: 0 } });
assert.equal(elements.get('reticulum-tab-unread').hidden, true);

assert(!fs.existsSync('openrf/static/lxst.js'), 'No calling dependency should be bundled');
console.log('PASS v0.2.162: inbox-first Reticulum tabs, node preservation, keyboard selection and unread state');
