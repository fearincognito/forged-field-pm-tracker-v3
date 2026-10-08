// Usage: node tests/fleet_reference.test.cjs /absolute/path/to/collected-reference.json
// DOM integration test with the complete production script order and isolated database.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {JSDOM,VirtualConsole}=require('jsdom');
const root=path.resolve(__dirname,'..');
const source=JSON.parse(fs.readFileSync(process.argv[2],'utf8')).equipment_records;
const records=source.map(r=>({id:`cbcstaff:${r.source.equipment_record_id}`,unit_number:r.equipment_information.unit_number,description:r.equipment_information.description,data:Object.fromEntries(Object.entries(r).filter(([k])=>k!=='photos')),equipment:r.equipment,has_photo:!!r.photos?.length}));
const photos=Object.fromEntries(source.filter(r=>r.photos?.length).map(r=>[`cbcstaff:${r.source.equipment_record_id}`,r.photos]));
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const scripts=[...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m=>m[1]).filter(p=>!p.startsWith('https:'));
const errors=[];const console=new VirtualConsole();console.on('jsdomError',e=>errors.push(e.message));
const dom=new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g,''),{url:'https://test.invalid/',runScripts:'dangerously',virtualConsole:console});
const w=dom.window,d=w.document;
w.fleetFixture={records,photos};w.URL.createObjectURL=()=>`blob:fixture-${Math.random()}`;w.URL.revokeObjectURL=()=>{};w.alert=()=>{};
function script(code){const node=d.createElement('script');node.textContent=code;d.head.appendChild(node);}
function setupMock(){
    window.fixturePromise=Promise.resolve(window.fleetFixture);
    window.testEquipment=[
      {id:'existing-r411',unit_number:'R411',vin:'N/A',serial_number:'J124-K091',current_hours:990,site_id:'original-site',fleet_reference_id:'cbcstaff:576'},
      {id:'existing-tsu411',unit_number:'TSU411',vin:'0663166',engine_serial_number:'RG6081A173044',current_hours:13794,site_id:'original-site',fleet_reference_id:'cbcstaff:283'}
    ];
    window.testWrites=[];window.testUploads=[];
    function from(table){
      const query={filters:[],op:'select',values:null,one:false,
        select(){return this;},eq(k,v){this.filters.push([k,v]);return this;},order(){return this;},limit(){return this;},gte(){return this;},not(){return this;},in(){return this;},
        single(){this.one=true;return this;},maybeSingle(){this.one=true;return this;},insert(values){this.op='insert';this.values=values;return this;},update(values){this.op='update';this.values=values;return this;},delete(){this.op='delete';return this;},
        then(resolve,reject){return this.run().then(resolve,reject);},
        async run(){const fixture=await window.fixturePromise;
          let rows=table==='fleet_reference'?fixture.records:table==='fleet_reference_photos'?Object.entries(fixture.photos).map(([reference_id,photos])=>({reference_id,photos})):table==='equipment'?window.testEquipment:table==='work_tickets'?(window.testTickets||[]):[];
          if(window.testFailPhotos && table==='fleet_reference_photos')return {data:null,error:{message:'Photo connection failed'}};
          if(window.testFailCatalog && table==='fleet_reference')return {data:null,error:{message:'Catalog connection failed'}};
          if(this.op==='insert'){const row={id:'new-equipment',...this.values};window.testWrites.push({table,values:this.values});window.testEquipment.push(row);rows=[row];}
          else{rows=rows.filter(r=>this.filters.every(([k,v])=>r[k]===v));if(this.op==='delete'){window.testEquipment=window.testEquipment.filter(r=>!rows.includes(r));window.testWrites.push({table,deleted:rows.map(r=>r.id)});}if(this.op==='update'){window.testWrites.push({table,values:this.values});rows.forEach(r=>Object.assign(r,this.values));}}
          return {data:this.one?rows[0]||null:rows,error:null};
        }
      };return query;
    }
    window.supabase={createClient:()=>({from,rpc:async()=>({data:[],error:null}),auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},storage:{from:()=>({upload:async(path,blob)=>{window.testUploads.push({path,size:blob.size});return {error:null};},createSignedUrl:async()=>({data:{signedUrl:''}}),remove:async()=>({error:null})})}})};

}
script(`(${setupMock.toString()})()`);
scripts.forEach(p=>script(fs.readFileSync(path.join(root,p),'utf8')));
const get=id=>d.getElementById(id);
const change=(id,value)=>{get(id).value=value;get(id).dispatchEvent(new w.Event('change',{bubbles:true}));};
const search=value=>{get('fleetSearch').value=value;get('fleetSearch').dispatchEvent(new w.Event('input',{bubbles:true}));};
async function wait(fn){for(let i=0;i<150;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('Timed out waiting for UI state: '+get('fleetStatus')?.textContent);}
async function form(){w.showAddEquipmentForm('selected-site');await wait(()=>get('fleetSelect')?.options.length===278);}
(async()=>{
 w.eval("currentUser={id:'test-user'};currentProfile={role:'owner',active:true};showApp();");
 const realOpen=w.openEquipment;
 w.openEquipment=async(id,siteId)=>{w.opened={id,siteId};};
 await form();search('R602');assert.equal(get('fleetSelect').options.length,2);
 change('fleetSelect','cbcstaff:537');await wait(()=>get('fleetStatus').textContent.includes('Details ready'));
 assert.equal(get('equipmentUnitNumber').value,'R602');assert.equal(get('equipmentYear').value,'2012');
 assert.equal(get('equipmentEngineSerial').value,'60854243');assert.equal(get('equipmentSerial').value,'122654');
 assert.equal(get('equipmentHours').value,'');assert.ok(get('addEquipmentPhotoPreview').querySelector('img'));
 get('equipmentHours').value='19620';get('equipmentForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 await wait(()=>w.opened?.id==='new-equipment');
 const inserted=w.testWrites.find(x=>x.values.fleet_reference_id);
 assert.equal(inserted.values.current_hours,19620);assert.equal(inserted.values.site_id,'selected-site');assert.equal(inserted.values.year,2012);assert.equal(w.testUploads.length,1);
 w.testWrites=[];await form();change('fleetSelect','cbcstaff:283');await wait(()=>get('fleetStatus').textContent.includes('already exists'));
 assert.equal(get('equipmentForm').querySelector('[type="submit"]').disabled,true);
 [...get('fleetReview').querySelectorAll('button')].find(b=>b.textContent==='Open Existing TSU411').click();
 assert.deepEqual(JSON.parse(JSON.stringify(w.opened)),{id:'existing-tsu411',siteId:'original-site'});
 assert.equal(w.testEquipment.find(r=>r.id==='existing-tsu411').current_hours,13794);assert.equal(w.testWrites.length,0);
 await form();search('CS405');assert.equal(get('fleetSelect').options.length,3);assert.ok([...get('fleetSelect').options].slice(1).every(x=>x.textContent.includes('[record')));
 const renamed=records.find(r=>r.data.equipment_information.source_unit_number==='A803');search('');change('fleetSelect',renamed.id);await wait(()=>get('fleetStatus').textContent.includes('Details ready'));assert.equal(get('equipmentUnitNumber').value,'A581');
 // Same unit without a confirmed serial match requires an explicit different-machine check.
 w.testEquipment.push({id:'ambiguous',unit_number:'A581',site_id:'original-site',vin:'DIFFERENT'});
 await form();change('fleetSelect',renamed.id);await wait(()=>get('fleetStatus').textContent.includes('Details ready'));
 assert.equal(get('equipmentForm').querySelector('[type="submit"]').disabled,true);
 get('fleetDifferentMachine').checked=true;get('fleetDifferentMachine').dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(get('equipmentForm').querySelector('[type="submit"]').disabled,false);
 w.testFailPhotos=true;await form();change('fleetSelect',renamed.id);await wait(()=>get('fleetStatus').textContent.includes('Photo connection failed'));
 assert.equal(get('equipmentForm').querySelector('[type="submit"]').disabled,true);
 const prior=w.testWrites.length;get('equipmentForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,20));assert.equal(w.testWrites.length,prior);
 w.testFailPhotos=false;get('fleetManual').click();assert.equal(get('equipmentUnitNumber').value,'');assert.equal(get('equipmentHours').value,'');assert.equal(get('equipmentForm').querySelector('[type="submit"]').disabled,false);assert.equal(w.equipmentPhotoWorkflow.getPending(),null);
 w.eval("currentProfile.role='operator'");w.showAddEquipmentForm('selected-site');assert.equal(get('fleetSelect'),null);
 w.eval("currentProfile.role='owner'");await realOpen('existing-tsu411','original-site');
 assert.ok(d.body.textContent.includes('Original fleet details — TSU411'));
 assert.ok(d.body.textContent.includes('13750'));
 assert.ok(d.body.textContent.includes('13794'));
 // Mistake removal discards saved values, while source records remain unchanged.
 await realOpen('new-equipment','selected-site');
 assert.ok(get('removeMistakenEquipment'));w.confirm=()=>false;
 get('removeMistakenEquipment').click();assert.ok(w.testEquipment.some(r=>r.id==='new-equipment'));
 w.confirm=()=>true;w.openSite=async siteId=>{w.returnedSite=siteId;};
 get('removeMistakenEquipment').click();await wait(()=>w.returnedSite==='selected-site');
 assert.equal(w.testEquipment.some(r=>r.id==='new-equipment'),false);assert.equal(records.length,277);
 w.testTickets=[{id:'ticket',equipment_id:'existing-tsu411'}];await realOpen('existing-tsu411','original-site');
 assert.equal(get('removeMistakenEquipment').disabled,true);
 assert.ok(d.body.textContent.includes('Use Move Equipment or Archive Equipment'));
 w.eval("currentProfile.role='operator'");await realOpen('existing-tsu411','original-site');assert.equal(get('removeMistakenEquipment'),null);
 assert.deepEqual(errors,[]);
 process.stdout.write('PASS: production script load; 277 choices; search; R602 autofill and photo save; current hours; TSU411 preservation; renumbering; duplicate source IDs; ambiguous match; photo failure; manual reset; role visibility; mistake removal; confirmation cancel; ticket protection.\n');
 dom.window.close();
})().catch(e=>{process.stderr.write(e.stack+'\n');dom.window.close();process.exitCode=1;});
