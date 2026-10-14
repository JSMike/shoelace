import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const manifest = JSON.parse(readFileSync(new URL('../dist/custom-elements.json', import.meta.url)));
const declarations = manifest.modules.flatMap(module => module.declarations ?? []);
const element = tag => declarations.find(declaration => declaration.tagName === tag);

test('animation types reference the DOM library with exact offsets', () => {
  const direction = element('sl-animation').members.find(member => member.name === 'direction').type;
  assert.deepEqual(direction.references, [{ name: 'PlaybackDirection', package: 'global:', start: 0, end: 17 }]);
  const keyframes = element('sl-animation').members.find(member => member.name === 'keyframes').type;
  assert.equal(keyframes.text.slice(keyframes.references[0].start, keyframes.references[0].end), 'Keyframe');
  assert.equal(keyframes.references[0].package, 'global:');
});

test('event types describe the event object through a public export, not just its detail', () => {
  const event = element('sl-tree').events.find(event => event.name === 'sl-selection-change');
  assert.deepEqual(event.type, {
    text: 'SlSelectionChangeEvent',
    references: [{ name: 'SlSelectionChangeEvent', module: 'shoelace.js' }]
  });
  const change = element('sl-input').events.find(event => event.name === 'sl-change');
  assert.equal(change.type.text, 'SlChangeEvent');
  assert.equal(change.type.references[0].module, 'shoelace.js');
});

test('primitive types stay inline', () => {
  const value = element('sl-input').members.find(member => member.name === 'value').type;
  assert.deepEqual(value, { text: 'string' });
});

test('legacy Vue integration does not import event aliases from component modules', () => {
  const vue = readFileSync(new URL('../dist/types/vue/index.d.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(vue, /\bSlChangeEvent\b/);
});
