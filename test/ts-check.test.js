import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const root = new URL('../js/', import.meta.url);

// Filerna som ännu inte typkontrolleras. Listan ska bara krympa: när en fil får // @ts-check
// tas den bort här, och en ny fil i js/ ska alltid börja med // @ts-check.
const NOT_YET_CHECKED = [
  'about.js', 'autocomplete.js', 'category-picker.js', 'code-boxes.js', 'custom-select.js',
  'dialog.js', 'host.js', 'menu.js', 'play.js', 'season.js', 'settings-dialog.js', 'sheet.js',
  'theme.js', 'winner-animation.js',
];

const modules = readdirSync(root, { recursive: true })
  .map(String).map((file) => file.split('\\').join('/')).filter((file) => file.endsWith('.js'));
const isChecked = (file) => readFileSync(new URL(file, root), 'utf8').includes('// @ts-check');

test('alla filer i js/ typkontrolleras, utom de som står i listan', () => {
  const unchecked = modules.filter((file) => !isChecked(file) && !NOT_YET_CHECKED.includes(file));
  assert.deepEqual(unchecked, [], 'lägg till // @ts-check överst i filen');
});

test('listan över filer utan typkontroll är aktuell', () => {
  const stale = NOT_YET_CHECKED.filter((file) => !modules.includes(file) || isChecked(file));
  assert.deepEqual(stale, [], 'ta bort filen ur NOT_YET_CHECKED');
});
