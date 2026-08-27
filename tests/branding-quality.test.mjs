import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('landing uses the full HQ Hemsfell logo and topbar uses clickable HH mark', async()=>{
  const page=await readFile(new URL('../app/page.tsx',import.meta.url),'utf8');
  assert.match(page,/landing-brand-logo[^>]*hemsfell-heroes-logo-hq\.png/);
  assert.doesNotMatch(page,/AS CRÔNICAS DE HEMSFELL/);
  assert.match(page,/hh-home-logo[^>]*onClick=\{\(\)=>setScreen\("menu"\)\}/);
  assert.match(page,/hemsfell-heroes-mark-hq\.png/);
  assert.match(page,/aria-label="Voltar ao menu principal"/);
});

test('branding stylesheet is isolated from match board geometry', async()=>{
  const css=await readFile(new URL('../app/brand.css',import.meta.url),'utf8');
  for(const forbidden of ['.screen-game','.hs-board','.creature-slot','.support-slot','.side-pile','.phase-orb']) assert.equal(css.includes(forbidden),false,`brand.css must not target ${forbidden}`);
});

test('layout uses the HH mark as the site icon', async()=>{
  const layout=await readFile(new URL('../app/layout.tsx',import.meta.url),'utf8');
  assert.match(layout,/import "\.\/brand\.css"/);
  assert.match(layout,/icon: "\/brand\/hemsfell-heroes-mark-hq\.png"/);
  assert.match(layout,/shortcut: "\/brand\/hemsfell-heroes-mark-hq\.png"/);
});
