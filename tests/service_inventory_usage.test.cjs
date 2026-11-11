const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');

const machine = { id: 'r411', unit_number: 'R411', current_hours: 1506.3 };
const schedules = [
  { id: 'oil', service_name: 'Engine Oil and filter', interval_hours: 250, next_due_hours: 1507 },
  { id: 'hydraulic', service_name: 'Hydraulic filter', interval_hours: 500, next_due_hours: 2000 }
];
const tick = () => new Promise(resolve => setImmediate(resolve));

async function setup(t, options = {}) {
  const dom = new JSDOM('<section id="appView"><div class="grid"></div></section>', { runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const w = dom.window;
  w.appView = w.document.querySelector('#appView');
  w.escapeHtml = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  w.eval(fs.readFileSync('pm.js', 'utf8'));
  const calls = [], navigation = [];
  w.openEquipment = async (...args) => { navigation.push(args); };
  w.console.error = () => {};
  w.db = {
    from(table) {
      assert(['equipment_filters', 'site_inventory'].includes(table));
      return { select() { return this; }, eq() { return this; }, async order() {
        return { data: options[table] || [], error: options.loadError || null };
      } };
    },
    async rpc(name, payload) {
      assert.equal(name, 'record_service_with_inventory');
      calls.push(JSON.parse(JSON.stringify(payload)));
      return options.rpc ? options.rpc(payload) : { error: null };
    }
  };
  w.eval(fs.readFileSync('service_inventory_usage.js', 'utf8'));
  const open = () => w.showServiceForm(options.machine || machine, 'site', options.schedules || schedules);
  await open();
  const $ = selector => w.document.querySelector(selector);
  const choice = value => { $('#serviceSchedule').value = value; $('#serviceSchedule').dispatchEvent(new w.Event('change')); };
  const hours = value => { $('#serviceHours').value = value; $('#serviceHours').dispatchEvent(new w.Event('input')); };
  const submit = async () => { $('#serviceForm').dispatchEvent(new w.Event('submit', { cancelable: true })); await tick(); };
  return { w, $, choice, hours, submit, calls, navigation, open, preview: () => $('#serviceSchedulePreview').textContent };
}

test('no implicit unscheduled choice, even with one schedule; submit fails closed', async t => {
  const f = await setup(t, { schedules: [schedules[0]] });
  assert.equal(f.$('#serviceSchedule').value, '');
  assert(f.$('#serviceSchedule').required);
  assert(f.$('button[type=submit]').disabled);
  f.$('#serviceName').value = 'Oil';
  await f.submit();
  assert.equal(f.calls.length, 0);
  assert.match(f.$('#serviceMessage').textContent, /Choose a PM schedule/);
});

test('scheduled preview follows hours and chosen interval; RPC retains schedule link and due', async t => {
  const f = await setup(t);
  f.choice('oil');
  assert.equal(f.$('#serviceName').value, 'Engine Oil and filter');
  assert.match(f.preview(), /1,506.3 hours; next due at 1,756.3 hours/);
  f.hours('1600.5');
  assert.match(f.preview(), /1,850.5/);
  f.choice('hydraulic');
  assert.match(f.preview(), /2,100.5/);
  await f.submit();
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].p_pm_schedule_id, 'hydraulic');
  assert.equal(f.calls[0].p_scheduled_due_hours, 2000);
  assert.equal(f.calls[0].p_service_hours, 1600.5);
  assert.equal(f.navigation.length, 1);
});

test('explicit unscheduled work warns and sends null schedule/due without a schedule reset', async t => {
  const f = await setup(t);
  f.choice('oil');
  f.choice('__unscheduled__');
  assert.match(f.preview(), /does NOT reset any PM countdown/);
  assert.doesNotMatch(f.preview(), /1,756.3/);
  await f.submit();
  assert.equal(f.calls[0].p_pm_schedule_id, null);
  assert.equal(f.calls[0].p_scheduled_due_hours, null);
});

test('equipment with no schedules still requires a deliberate unscheduled selection', async t => {
  const f = await setup(t, { schedules: [] });
  assert.match(f.$('#serviceScheduleHelp').textContent, /No PM schedules/);
  assert.equal(f.$('#serviceSchedule').value, '');
  f.choice('__unscheduled__');
  f.$('#serviceName').value = 'Repair';
  await f.submit();
  assert.equal(f.calls.length, 1);
});

test('invalid hours and non-positive/missing intervals cannot reach RPC', async t => {
  const f = await setup(t);
  f.choice('oil');
  for (const value of ['', '-1', 'Infinity']) {
    f.hours(value); await f.submit();
    assert.equal(f.calls.length, 0);
    assert(f.$('button[type=submit]').disabled);
  }
  f.hours('0');
  assert.match(f.preview(), /next due at 250 hours/);
  for (const interval of [0, -250, null, 'invalid']) {
    const g = await setup(t, { schedules: [{ ...schedules[0], interval_hours: interval }] });
    g.choice('oil'); await g.submit();
    assert.match(g.preview(), /valid positive interval/);
    assert.equal(g.calls.length, 0);
  }
});

test('lower historical meter preview explains saved equipment meter is not rewound', async t => {
  const f = await setup(t);
  f.choice('oil'); f.hours('1400');
  assert.match(f.preview(), /next due at 1,650 hours/);
  assert.match(f.preview(), /meter stays at 1,506.3/);
});

test('cancel and reopen reset the selection rather than reuse a prior choice', async t => {
  const f = await setup(t);
  f.choice('oil'); f.$('#serviceCancelBottom').click();
  assert.equal(f.calls.length, 0);
  assert.equal(f.navigation.length, 1);
  await f.open();
  assert.equal(f.$('#serviceSchedule').value, '');
  assert(f.$('button[type=submit]').disabled);
});

test('keeps inventory deduction payload and selected parts in the one RPC', async t => {
  const f = await setup(t, {
    equipment_filters: [{ part_number: 'ABC', filter_type: 'oil_filter', quantity: 2 }],
    site_inventory: [{ part_number: 'ABC', quantity_on_hand: 5 }]
  });
  f.choice('oil'); f.$('.serviceInventoryCheck').checked = true;
  f.$('#serviceParts').value = 'Oil';
  await f.submit();
  assert.deepEqual(f.calls[0].p_inventory_deductions, [{ part_number: 'ABC', quantity: 2 }]);
  assert.equal(f.calls[0].p_parts_used, 'Site inventory: 2 × ABC; Oil');
});

test('repeated submissions while saving cannot duplicate service or inventory deductions', async t => {
  let resolve;
  const f = await setup(t, { rpc: () => new Promise(r => { resolve = r; }) });
  f.choice('oil');
  await f.submit(); await f.submit();
  assert.equal(f.calls.length, 1);
  assert(f.$('button[type=submit]').disabled);
  resolve({ error: null }); await tick();
  assert.equal(f.navigation.length, 1);
});

test('returned database errors permit retry, uncertain throws do not', async t => {
  const f = await setup(t, { rpc: async () => ({ error: { message: 'No access' } }) });
  f.choice('oil'); await f.submit();
  assert.match(f.$('#serviceMessage').textContent, /No access/);
  assert.equal(f.$('button[type=submit]').disabled, false);
  const g = await setup(t, { rpc: async () => { throw Error('Lost response'); } });
  g.choice('oil'); await g.submit(); await g.submit();
  assert.match(g.$('#serviceMessage').textContent, /check service history/);
  assert(g.$('button[type=submit]').disabled);
  assert.equal(g.calls.length, 1);
});

test('schedule text is rendered as text, not executable markup', async t => {
  const name = '<img src=x onerror=alert(1)>';
  const f = await setup(t, { schedules: [{ ...schedules[0], service_name: name }] });
  f.choice('oil');
  assert(f.preview().includes(name));
  assert.equal(f.$('#serviceSchedulePreview img'), null);
  assert.equal(f.$('#serviceSchedule img'), null);
});

 test('resolved transport failures also lock Save until history can be checked', async t => {
  for (const status of [0, 502, 503, 504]) {
    const f = await setup(t, { rpc: async () => ({ error: { message: 'Connection lost' }, status }) });
    f.choice('oil');
    await f.submit();
    assert(f.$('button[type=submit]').disabled);
    assert.match(f.$('#serviceMessage').textContent, /check service history/);
    await f.submit();
    assert.equal(f.calls.length, 1);
  }
});
