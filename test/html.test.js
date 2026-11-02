import { test } from 'node:test';
import assert from 'node:assert/strict';
import { html, join, raw } from '../js/shared/html.js';

test('html escapar det som stoppas in', () => {
  const name = '<b>Anna</b> & "Bo"';
  assert.equal(String(html`<td>${name}</td>`), '<td>&#60;b&#62;Anna&#60;/b&#62; &#38; &#34;Bo&#34;</td>');
});

test('html med html eller raw inuti escapas inte igen', () => {
  const inner = html`<i>${'<x>'}</i>`;
  assert.equal(String(html`<p>${inner}${raw('<br>')}</p>`), '<p><i>&#60;x&#62;</i><br></p>');
});

test('listor fogas ihop, och null, undefined och false blir ingenting', () => {
  assert.equal(String(html`<ul>${['a', html`<b>b</b>`]}</ul>`), '<ul>a<b>b</b></ul>');
  assert.equal(String(html`${null}${undefined}${false}|${0}`), '|0');
});

test('join fogar ihop delar som html gör', () => {
  assert.equal(String(join(html`<a>`, '<', html`</a>`)), '<a>&#60;</a>');
});
