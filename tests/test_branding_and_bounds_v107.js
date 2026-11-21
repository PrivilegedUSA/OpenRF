'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('openrf/static/index.html', 'utf8');
const css = fs.readFileSync('openrf/static/app.css', 'utf8');
const cameraJs = fs.readFileSync('openrf/static/camera-layers.js', 'utf8');

assert.match(html, /class="brand-wordmark"/);
assert.match(html, /src="\/static\/assets\/openrf-wordmark-light\.png"/);
assert.match(html, /rel="icon" type="image\/png" sizes="32x32"/);
assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/);
assert.match(html, /FIELD CONSOLE · 0\.2\.163/);
assert.match(css, /\.sidebar \.brand-wordmark\{/);
assert.match(css, /@media\(max-width:520px\)\{\.sidebar \.brand-wordmark/);
assert.match(html, /\/static\/camera-layers\.js\?v=0\.2\.114/);

// Exercise exactly the lightweight viewport validator shipped to browsers.
const validatorSource = cameraJs.match(/const usable=b=>([\s\S]*?);/);
assert(validatorSource, 'Camera viewport guard must be present');
const usable = vm.runInNewContext(`(b) => ${validatorSource[1]}`);
assert.equal(usable([-122.1, 37.4, -120.1, 39.1]), true);
assert.equal(usable([-245.804, 15.146, 48.804, 58.002]), false,
  'World-wrapped overview coordinates must not cause a 400 camera request');
assert.equal(usable([179, 35, 181, 38]), false);
assert.equal(usable([-181, 35, -120, 38]), false);
assert.equal(usable([-122, -91, -120, 38]), false);
assert.equal(usable(null), null);
assert.match(cameraJs, /Camera locations become available after zooming into a valid map area\./);

console.log('PASS v0.2.107 brand assets and camera world-wrap guard');
