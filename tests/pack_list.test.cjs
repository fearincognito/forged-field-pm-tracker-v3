const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const {JSDOM} = require('jsdom');
const dom = new JSDOM('<div id="appView"><div class="grid"></div></div>', {runScripts:'dangerously'});
const w = dom.window, d = w.document;
w.appView = d.getElementById('appView');
w.openSite = async () => {};
w.escapeHtml = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
w.inventory = [];
const equipment = [{id:'a',site_id:'site',unit_number:'A',archived:false},{id:'b',site_id:'site',unit_number:'B',archived:false}];
const filters = [{equipment_id:'a',part_number:'FILTER',quantity:1,filter_type:'oil'}, {equipment_id:'b',part_number:'FILTER',quantity:2,filter_type:'oil'}];
w.db = {from(table) {
  let rows = table === 'sites' ? [{id:'site',name:'Test Site'}] : table === 'equipment' ? equipment : table === 'equipment_filters' ? filters : w.inventory;
  const q = {
    select(){return this;}, order(){return this;},
    eq(key,value){rows=rows.filter(row=>row[key]===value);return this;},
    in(key,values){rows=rows.filter(row=>values.includes(row[key]));return this;},
    single(){return Promise.resolve({data:rows[0],error:null});},
    then(resolve,reject){return Promise.resolve({data:rows,error:null}).then(resolve,reject);}
  }; return q;
}};
w.eval(fs.readFileSync(path.join(__dirname,'../site_inventory.js'),'utf8'));
async function run(stock, all) {
  w.inventory=stock.map(quantity_on_hand=>({site_id:'site',part_number:'FILTER',quantity_on_hand}));
  await w.showPackList('site');
  if(!all)d.querySelector('.packEquipmentCheck[value="b"]').checked=false;
  d.getElementById('generateSelectedPackList').click();
  for(let i=0;i<100&&!d.getElementById('packBack');i++)await new Promise(r=>setTimeout(r,5));
  const card=d.querySelector('article');assert.ok(card);
  const value=label=>Number([...card.querySelectorAll('small')].find(s=>s.textContent===label).nextElementSibling.textContent);
  return {required:value('Required'),onSite:value('On Site'),bring:value('Bring'),backup:card.textContent.includes('Bring at least 1 backup')};
}
(async()=>{
  assert.deepEqual(await run([1],false),{required:1,onSite:1,bring:1,backup:true});
  assert.deepEqual(await run([1],true),{required:3,onSite:1,bring:2,backup:true});
  assert.deepEqual(await run([0],false),{required:1,onSite:0,bring:1,backup:false});
  assert.deepEqual(await run([2],false),{required:1,onSite:2,bring:0,backup:false});
  assert.deepEqual(await run([1,1],true),{required:3,onSite:2,bring:1,backup:false});
  console.log('PASS: selected/full-site pack lists, one-stock backup, shortages, sufficient stock, consolidated inventory.');
  w.close();
})().catch(error=>{console.error(error);w.close();process.exitCode=1;});
