import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite();
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
await db.exec(`create schema auth;create role authenticated;create role anon;create role service_role bypassrls;
create type public.app_role as enum('owner','admin','mechanic','operator','viewer');
create table public.profiles(id uuid primary key,full_name text not null,role public.app_role not null,active boolean not null,updated_at timestamptz default now());
create table public.sites(id uuid primary key,name text not null,archived boolean not null default false);
create table public.site_members(site_id uuid references public.sites(id),user_id uuid references public.profiles(id) on delete cascade,primary key(site_id,user_id));
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
create function public.current_user_role() returns public.app_role language sql stable security definer set search_path='' as $$select role from public.profiles where id=auth.uid() and active=true$$;
create function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles where id=auth.uid() and active=true and role in('owner','admin'))$$;
grant usage on schema public,auth to authenticated,anon,service_role;
grant select,update on public.profiles to authenticated;
grant select,insert,update,delete on public.site_members to authenticated;
grant all on public.profiles,public.sites,public.site_members to service_role;
alter table public.profiles enable row level security;
alter table public.site_members enable row level security;
create policy profile_admin_update on public.profiles for update to authenticated using(public.is_admin()) with check(public.is_admin());
create policy profile_self_select on public.profiles for select to authenticated using(id=auth.uid());
create policy site_members_admin_all on public.site_members for all to authenticated using(public.is_admin()) with check(public.is_admin());`);
await db.exec(readFileSync(new URL('../../sql/admin_update_user_null_guard.sql',import.meta.url),'utf8'));
async function clearContext(){await db.exec('reset role');for(const k of ['request.jwt.claim.sub','request.jwt.claim.role','app.account_audit_operation']) await db.query('select set_config($1,$2,false)',[k,'']);}
async function seed(){await clearContext();await db.exec(`truncate public.site_members,public.profiles,public.sites;
insert into public.profiles(id,full_name,role,active) values('${id(1)}','Owner','owner',true),('${id(2)}','Admin','admin',true),('${id(3)}','Mechanic','mechanic',true),('${id(4)}','Operator','operator',true),('${id(5)}','Viewer','viewer',true),('${id(6)}','Inactive','viewer',false);
insert into public.sites values('${id(10)}','Alpha',false),('${id(11)}','Beta',false),('${id(12)}','Archived',true);
insert into public.site_members values('${id(10)}','${id(5)}');`);
if(migrated)await db.exec('truncate account_audit_private.events,account_audit_private.operations restart identity');}
async function as(role,who,fn){await clearContext();await db.query('select set_config($1,$2,false)',['request.jwt.claim.sub',who===null?'':id(who)]);await db.query('select set_config($1,$2,false)',['request.jwt.claim.role',role]);await db.exec(`set role ${role}`);try{return await fn();}finally{await clearContext();}}
async function admin(actor,target=5,role='viewer',active=true,sites=[10],name='Viewer'){return as('authenticated',actor,()=>db.query('select public.admin_update_user($1,$2,$3,$4,$5::uuid[])',[id(target),name,role,active,sites.map(id)]));}
async function begin(actor=1,mode='invite',role='viewer',sites=[10]){return (await as('service_role',null,()=>db.query('select public.account_audit_begin($1,$2,$3,$4,$5::uuid[]) op',[id(actor),mode,'New Account',role,sites.map(id)]))).rows[0].op;}
async function finalize(op,target=7){return as('service_role',null,()=>db.query('select public.account_audit_finalize($1,$2) ok',[op,id(target)]));}
async function fail(op,code='provider_failed',target=null){return as('service_role',null,()=>db.query('select public.account_audit_fail($1,$2,$3)',[op,target===null?null:id(target),code]));}
async function events(){return(await db.query('select * from account_audit_private.events order by id')).rows;}
async function newUser(){await as('service_role',null,()=>db.query("insert into public.profiles values($1,'Auth Created','viewer',true,now())",[id(7)]));}
let migrated=false,passed=0;
await seed();await as('authenticated',2,()=>db.query("update public.profiles set role='owner' where id=$1",[id(2)]));
assert.equal((await db.query('select role from public.profiles where id=$1',[id(2)])).rows[0].role,'owner');
console.log('CONFIRMED pre-fix direct Admin self-promotion in isolated exact grants/RLS');
await db.exec(readFileSync(new URL('../../sql/account_history.sql',import.meta.url),'utf8'));migrated=true;
async function test(label,fn){await seed();await fn();passed++;console.log('PASS',label);}
for(const actor of [1,2,3,4,5,6])await test(`direct profile update denied role ${actor}`,async()=>{await assert.rejects(()=>as('authenticated',actor,()=>db.query("update public.profiles set role='owner' where id=$1",[id(actor)])),/permission denied/);assert.equal((await events()).length,0);});
await test('direct site changes denied',async()=>assert.rejects(()=>as('authenticated',1,()=>db.query('delete from public.site_members')),/permission denied/));
for(const actor of [2,3,4,5,6,99,null])await test(`history owner only denies ${actor}`,async()=>assert.rejects(()=>as('authenticated',actor,()=>db.query('select * from public.owner_account_history()')),/Owner access required/));
await test('anonymous history denied',async()=>assert.rejects(()=>as('anon',null,()=>db.query('select * from public.owner_account_history()')),/permission denied/));
await test('app cannot forge/alter/delete/truncate audit',async()=>{for(const sql of ["select * from account_audit_private.events","insert into account_audit_private.events(actor_name,target_name,event_type,outcome) values('Spoof','Target','x','succeeded')","update account_audit_private.events set actor_name='Spoof'","delete from account_audit_private.events","truncate account_audit_private.events"])await assert.rejects(()=>as('authenticated',1,()=>db.query(sql)),/permission denied/);});
await test('app cannot call service writer with spoofed actor',async()=>assert.rejects(()=>as('authenticated',1,()=>db.query("select public.account_audit_begin($1,'invite','Fake','owner','{}')",[id(1)])),/permission denied/));
await test('role name and state edit audited with verified actor',async()=>{await admin(1,5,'mechanic',false,[],'Changed');const e=await events();assert.equal(e.length,2);assert.equal(e[0].actor_user_id,id(1));assert.equal(e[0].actor_name,'Owner');assert.deepEqual(e[0].before_values,{full_name:'Viewer',role:'viewer',active:true});assert.deepEqual(e[0].after_values,{full_name:'Changed',role:'mechanic',active:false});assert.equal(e[1].event_type,'site_access_removed');});
await test('site diff logs removed and added without false replacements',async()=>{await admin(1,5,'viewer',true,[11]);let e=await events();assert.deepEqual(e.map(x=>x.event_type),['site_access_removed','site_access_added']);assert.deepEqual(e[0].before_values.site_names,['Alpha']);assert.deepEqual(e[1].after_values.site_names,['Beta']);await admin(1,5,'viewer',true,[11]);assert.equal((await events()).length,2);});
await test('no-op save emits no events',async()=>{await admin(1);assert.equal((await events()).length,0);});
await test('admin edit still works and is audited',async()=>{await admin(2,5,'operator',true,[10]);const e=await events();assert.equal(e[0].actor_name,'Admin');assert.equal(e[0].after_values.role,'operator');});
await test('admin owner boundary preserved',async()=>{await assert.rejects(()=>admin(2,2,'owner',true,[],'Admin'),/Admins cannot/);assert.equal((await events()).length,0);});
await test('audit failure rolls back account edit',async()=>{await db.exec("alter table account_audit_private.events add constraint test_fail check(event_type<>'account_updated')");await assert.rejects(()=>admin(1,5,'mechanic',true,[],'Changed'),/test_fail/);assert.equal((await db.query('select full_name from public.profiles where id=$1',[id(5)])).rows[0].full_name,'Viewer');assert.equal((await db.query('select count(*) n from public.site_members')).rows[0].n,1);assert.equal((await events()).length,0);await db.exec('alter table account_audit_private.events drop constraint test_fail');});
await test('owner pagination and bounds',async()=>{await admin(1,5,'viewer',true,[10],'First');await admin(1,5,'viewer',true,[10],'Second');const a=(await as('authenticated',1,()=>db.query('select * from public.owner_account_history(1,null)'))).rows;assert.equal(a.length,1);const b=(await as('authenticated',1,()=>db.query('select * from public.owner_account_history(1,$1)',[a[0].id]))).rows;assert.equal(b.length,1);assert.ok(b[0].id<a[0].id);});
await test('invite begin and finalize trusted actor atomic success',async()=>{const op=await begin();await newUser();await finalize(op);const e=await events();assert.equal(e[0].event_type,'invitation_requested');assert.equal(e.at(-1).event_type,'invitation_succeeded');assert.equal(e.at(-1).actor_user_id,id(1));assert.equal(e.at(-1).target_user_id,id(7));assert.equal(e.filter(x=>x.event_type==='account_updated')[0].actor_name,'Owner');assert.equal((await db.query('select full_name from public.profiles where id=$1',[id(7)])).rows[0].full_name,'New Account');const n=e.length;await finalize(op);assert.equal((await events()).length,n);});
await test('manual viewer success',async()=>{const op=await begin(1,'manual_viewer');await newUser();await finalize(op);assert.equal((await events()).at(-1).event_type,'manual_account_succeeded');});
await test('provider failure safe and idempotent',async()=>{const op=await begin();await fail(op);await fail(op);const e=await events();assert.equal(e.length,2);assert.equal(e[1].detail,'provider_failed');assert.equal(e[1].outcome,'failed');});
await test('manual setup and cleanup failures retained',async()=>{const op=await begin(1,'manual_viewer');await newUser();await fail(op,'setup_failed',7);await fail(op,'cleanup_failed',7);assert.deepEqual((await events()).filter(x=>x.outcome==='failed').map(x=>x.detail),['setup_failed','cleanup_failed']);});
await test('failure accepts no arbitrary secret message',async()=>{const op=await begin();await assert.rejects(()=>fail(op,'password=secret'),/Invalid failure code/);assert.equal((await events()).length,1);});
await test('actor disabled before finalize prevents provisioning',async()=>{const op=await begin(2);await newUser();await db.query('update public.profiles set active=false where id=$1',[id(2)]);await assert.rejects(()=>finalize(op),/Not authorized/);assert.equal((await db.query('select full_name from public.profiles where id=$1',[id(7)])).rows[0].full_name,'Auth Created');});
for(const actor of [3,4,5,6,99])await test(`service begin rejects ineligible actor ${actor}`,async()=>assert.rejects(()=>begin(actor),/Not authorized/));
await test('admin cannot provision owner',async()=>assert.rejects(()=>begin(2,'invite','owner',[]),/Admins cannot/));
await test('admin cannot create manual login',async()=>assert.rejects(()=>begin(2,'manual_viewer'),/Manual accounts/));
await test('archived site rejected',async()=>assert.rejects(()=>begin(1,'invite','viewer',[12]),/Invalid or archived/));
await test('all-site role normalized',async()=>{const op=await begin(1,'invite','mechanic',[10]);await newUser();await finalize(op);assert.deepEqual((await events()).at(-1).after_values.site_ids,[]);});
await test('system profile deletion retains snapshot',async()=>{await db.query('delete from public.profiles where id=$1',[id(6)]);const e=(await events()).at(-1);assert.equal(e.event_type,'account_deleted');assert.equal(e.target_name,'Inactive');assert.equal(e.actor_name,'System / administrator');});
await test('membership direct service update logged both sides',async()=>{await as('service_role',null,()=>db.query('update public.site_members set site_id=$1 where user_id=$2',[id(11),id(5)]));assert.deepEqual((await events()).map(x=>x.event_type),['site_access_removed','site_access_added']);});
await test('post-success failure cannot overwrite outcome',async()=>{const op=await begin();await newUser();await finalize(op);const n=(await events()).length;await fail(op);assert.equal((await events()).length,n);});
await db.close();console.log(`${passed} isolated account audit tests passed`);
