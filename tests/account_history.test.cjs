const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const fs = require('node:fs');
const code = fs.readFileSync(__dirname + '/../account_history.js', 'utf8');
const tick = () => new Promise(r => setImmediate(r));
function setup(role = 'owner', handler = async () => ({ data: [] })) {
  const dom = new JSDOM('<section id="appView"><div class="grid"></div></section>', { runScripts: 'outside-only' });
  const w = dom.window; w.currentProfile = { role, active: true }; w.appView = w.document.querySelector('#appView');
  w.calls = []; w.db = { rpc: async (name, args) => { w.calls.push({ name, args }); return handler(name, args); } };
  w.showUsersManagement = async () => { w.appView.querySelector('.grid').innerHTML = '<div><button id="inviteUserButton">Invite</button></div>'; };
  w.eval(code); return w;
}
test('owner button only, non-owner direct call blocked', async () => {
  for (const role of ['owner','admin','mechanic','operator','viewer']) {
    const w = setup(role); await w.showUsersManagement();
    assert.equal(!!w.document.querySelector('#accountHistoryButton'), role === 'owner');
    w.showAccountHistory(); await tick(); assert.equal(w.calls.length, role === 'owner' ? 1 : 0); w.close();
  }
});
test('empty state and back navigation', async () => {
  const w=setup(); w.showAccountHistory(); await tick();
  assert.match(w.document.body.textContent,/No account events/);
  assert.equal(w.document.querySelector('.card > button:last-child').hidden,true);
  w.document.querySelector('.card > button').click(); await tick();
  assert.ok(w.document.querySelector('#accountHistoryButton')); w.close();
});
test('server values escaped, secret fields omitted, Regina time displayed', async () => {
  const w=setup('owner',async()=>({data:[{id:'1', occurred_at:'2026-07-01T13:00:00Z', actor_name:'<img src=x onerror=alert(1)>',target_name:'<script>x</script>',event_type:'account_updated',outcome:'succeeded',before_values:{role:'viewer'},after_values:{role:'mechanic',password:'SECRET',token:'TOKEN'},detail:'https://private/reset'}]}));
  w.showAccountHistory(); await tick(); const text=w.document.body.textContent;
  assert.equal(w.document.querySelectorAll('img,script,a').length,0);
  assert.match(text,/<img/); assert.match(text,/7:00:00.*CST/); assert.match(text,/viewer → mechanic/);
  assert.doesNotMatch(text,/SECRET|TOKEN|private\/reset/); w.close();
});
test('pagination, duplicate clicks, duplicate ids and bigint string cursor', async () => {
  let resolve; const rows=Array.from({length:50},(_,i)=>({id:String(9007199254740993000n-BigInt(i)),event_type:'account_created'}));
  const w=setup('owner',async(_,args)=>args.p_before_id?new Promise(r=>{resolve=r;}):({data:rows}));
  w.showAccountHistory(); await tick(); const more=w.document.querySelector('.card > button:last-child'); more.click(); more.click();
  assert.equal(w.calls.length,2); assert.equal(w.calls[1].args.p_before_id, rows[49].id);
  resolve({data:[rows[49],{id:'2',event_type:'account_created'}]});await tick();
  assert.equal(w.document.querySelectorAll('article').length,51);assert.equal(more.hidden,true); w.close();
});
test('error and thrown network failure retain retry without leaking server details',async()=>{
  let n=0;const w=setup('owner',async()=>{n++;if(n===1)return {error:{message:'SECRET'}};if(n===2)throw Error('TOKEN');return {data:[]};});
  w.showAccountHistory(); await tick(); let more=w.document.querySelector('.card > button:last-child');
  assert.equal(more.textContent,'Retry');assert.doesNotMatch(w.document.body.textContent,/SECRET/);
  more.click();await tick(); assert.equal(more.disabled,false);assert.doesNotMatch(w.document.body.textContent,/TOKEN/);
  more.click();await tick();assert.match(w.document.body.textContent,/No account events/); w.close();
});
test('late response after leaving cannot overwrite users or re-entered history',async()=>{
  const resolvers=[];const w=setup('owner',()=>new Promise(r=>resolvers.push(r)));
  w.showAccountHistory();w.document.querySelector('.card > button').click();await tick();
  resolvers[0]({data:[{id:1,actor_name:'OLD'}]});await tick();assert.ok(w.document.querySelector('#inviteUserButton'));assert.doesNotMatch(w.document.body.textContent,/OLD/);
  w.showAccountHistory();w.showAccountHistory();resolvers[1]({data:[{id:2,actor_name:'STALE'}]});resolvers[2]({data:[]});await tick();assert.doesNotMatch(w.document.body.textContent,/STALE/);w.close();
});
test('role revoked during request does not render returned audit data',async()=>{
  let resolve;const w=setup('owner',()=>new Promise(r=>resolve=r));w.showAccountHistory();w.currentProfile.role='viewer';resolve({data:[{id:1,actor_name:'PRIVATE'}]});await tick();assert.doesNotMatch(w.document.body.textContent,/PRIVATE/);w.close();
});
