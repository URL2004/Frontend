import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const src = fs.readFileSync(new URL('../assets/js/app-boot.js',import.meta.url),'utf8');
test('concurrent module loaders both reject, and retry creates a fresh script', async () => {
  const scripts=[];
  const document={querySelector:()=>scripts[0],head:{appendChild:s=>scripts.push(s)},createElement:()=>{
    const listeners={};
    return {dataset:{},addEventListener:(name,fn)=>(listeners[name] ||= []).push(fn),
      emit:name=>(listeners[name]||[]).forEach(fn=>fn()),remove(){scripts.splice(scripts.indexOf(this),1);}};
  }};
  const c={document,assetPath:x=>x};vm.createContext(c);
  vm.runInContext(src.slice(src.indexOf('  function loadScript('),src.indexOf('  function loadStyle(')),c);
  const a=c.loadScript('/module.js'),b=c.loadScript('/module.js');
  const checked=Promise.all([assert.rejects(a,/Failed to load/),assert.rejects(b,/Failed to load/)]);
  scripts[0].emit('error');await checked;assert.equal(scripts.length,0);
  const retry=c.loadScript('/module.js');scripts[0].emit('load');await retry;
  assert.equal(scripts[0].dataset.loaded,'1');await c.loadScript('/module.js');
});
test('boot failure remains visible over a populated shell and never deletes the draft', () => {
  const added=[],root={textContent:'existing input',prepend:n=>added.push(n)};
  const document={getElementById:id=>id==='page-root'?root:null,documentElement:{classList:{add(){}}},
    createElement:()=>({children:[],setAttribute(k,v){this[k]=v;},appendChild(n){this.children.push(n);},addEventListener(){}})};
  const c={document,window:{location:{reload(){}}},console:{error(){}}};vm.createContext(c);
  const body=src.slice(src.indexOf('  boot().catch(function (error) {')+'  boot().catch(function (error) {'.length,src.lastIndexOf('  });'));
  vm.runInContext('(function(error){'+body+'})(new Error("network"))',c);
  assert.equal(root.textContent,'existing input');assert.equal(added.length,1);assert.equal(added[0].role,'alert');
  assert.match(added[0].children[0].textContent,/입력한 글/);
});

test('a failed stylesheet rejects concurrent loads and can be retried', async () => {
  const links=[];
  const document={getElementById:id=>links.find(n=>n.id===id),head:{appendChild:n=>links.push(n)},createElement:()=>{
    const listeners={};
    return {dataset:{},addEventListener:(name,fn)=>(listeners[name] ||= []).push(fn),
      emit:name=>(listeners[name]||[]).forEach(fn=>fn()),remove(){links.splice(links.indexOf(this),1);}};
  }};
  const c={document,assetPath:x=>x};vm.createContext(c);
  vm.runInContext(src.slice(src.indexOf('  function loadStyle('),src.indexOf('  function idle(')),c);
  const a=c.loadStyle('/app.css','app'),b=c.loadStyle('/app.css','app');
  const checked=Promise.all([assert.rejects(a,/Failed to load/),assert.rejects(b,/Failed to load/)]);
  links[0].emit('error');await checked;assert.equal(links.length,0);
  const retry=c.loadStyle('/app.css','app');links[0].emit('load');await retry;
  await c.loadStyle('/app.css','app');assert.equal(links.length,1);
});
