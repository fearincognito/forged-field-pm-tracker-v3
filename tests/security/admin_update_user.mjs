import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
await db.exec(`create schema auth;
create role authenticated; create role anon;
create type public.app_role as enum ('owner','admin','mechanic','operator','viewer');
create table public.profiles(id uuid primary key, full_name text not null, role public.app_role not null, active boolean not null, updated_at timestamptz default now());
create table public.sites(id uuid primary key, archived boolean not null default false);
create table public.site_members(site_id uuid references public.sites(id), user_id uuid references public.profiles(id), primary key(site_id,user_id));
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function public.current_user_role() returns public.app_role language sql stable security definer set search_path='' as $$select role from public.profiles where id=auth.uid() and active=true$$;
grant usage on schema public,auth to authenticated,anon;
alter table public.profiles enable row level security;
alter table public.site_members enable row level security;
`);
async function seed(){
 await db.exec(`reset role; truncate public.site_members,public.profiles,public.sites;
 insert into public.profiles(id,full_name,role,active) values
 ('${id(1)}','Owner','owner',true),('${id(2)}','Admin','admin',true),
 ('${id(3)}','Mechanic','mechanic',true),('${id(4)}','Operator','operator',true),
 ('${id(5)}','Viewer','viewer',true),('${id(6)}','Inactive','viewer',false);
 insert into public.sites values('${id(10)}',false),('${id(11)}',true);
 insert into public.site_members values('${id(10)}','${id(5)}');`);
}
async function snapshot(){ return JSON.stringify((await db.query(`select (select jsonb_agg(to_jsonb(p) order by id) from public.profiles p) profiles,(select jsonb_agg(to_jsonb(s) order by site_id,user_id) from public.site_members s) members`)).rows); }
async function call(actor,target=5,role='mechanic',active=true,sites=[],name='Updated'){
 await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[actor===null?'':id(actor)]);
 await db.exec('set role authenticated');
 try {return await db.query(`select public.admin_update_user($1,$2,$3,$4,$5::uuid[]) as ok`,[id(target),name,role,active,sites.map(id)]);}
 finally {await db.exec('reset role');}
}
let passed=0;
async function denied(label,actor,target=5,role='mechanic',active=true,sites=[],name='Updated',pattern=/Not authorized/){
 await seed();const before=await snapshot();
 await assert.rejects(()=>call(actor,target,role,active,sites,name),pattern);
 assert.equal(await snapshot(),before);console.log('PASS',label);passed++;
}
// Reproduce against the exact live pre-patch definition, using synthetic data only.
await db.exec(readFileSync(new URL('../../sql/admin_update_user_null_guard.sql',import.meta.url),'utf8').replace("if auth.uid() is null\n     or actor_role is null\n     or actor_role not in", "if actor_role not in"));
await seed();await call(6,6,'owner',true);
assert.equal((await db.query('select role from public.profiles where id=$1',[id(6)])).rows[0].role,'owner');
console.log('CONFIRMED old guard allowed inactive account elevation (isolated only)');
await db.exec(readFileSync(new URL('../../sql/admin_update_user_null_guard.sql',import.meta.url),'utf8'));
await db.exec(`revoke all on function public.admin_update_user(uuid,text,public.app_role,boolean,uuid[]) from public,anon; grant execute on function public.admin_update_user(uuid,text,public.app_role,boolean,uuid[]) to authenticated;`);
for(const [label,actor] of [['no identity',null],['missing profile',99],['inactive',6],['viewer',5],['operator',4],['mechanic',3]]) await denied(label,actor);
await denied('inactive cannot self-reactivate/elevate',6,6,'owner',true);
await denied('admin cannot edit owner',2,1,'owner',true,[],'Updated',/Admins cannot/);
await denied('admin cannot edit admin',2,2,'admin',true,[],'Updated',/Admins cannot/);
for(const role of ['owner','admin']) await denied(`admin cannot assign ${role}`,2,5,role,true,[],'Updated',/Admins cannot/);
await denied('owner cannot self-disable',1,1,'owner',false,[],'Updated',/cannot disable your own/);
await denied('last owner cannot be demoted',1,1,'viewer',true,[],'Updated',/At least one active Owner/);
await denied('archived site denied',1,5,'viewer',true,[11],'Updated',/invalid or archived/);
await denied('unknown site denied',1,5,'viewer',true,[99],'Updated',/invalid or archived/);
await denied('blank name denied',1,5,'viewer',true,[],' ',/Full name is required/);
for(const [label,actor,role,sites] of [['admin updates viewer',2,'viewer',[10]],['admin assigns mechanic',2,'mechanic',[]],['owner assigns admin',1,'admin',[]],['owner assigns owner',1,'owner',[]]]){
 await seed();const r=await call(actor,5,role,true,sites);
 assert.equal(r.rows[0].ok,true);assert.equal((await db.query('select role from public.profiles where id=$1',[id(5)])).rows[0].role,role);
 assert.equal(Number((await db.query('select count(*) n from public.site_members where user_id=$1',[id(5)])).rows[0].n),sites.length);
 console.log('PASS',label);passed++;
}
await seed();await db.exec('set role anon');
await assert.rejects(()=>db.query(`select public.admin_update_user($1,'No','owner',true,'{}'::uuid[])`,[id(5)]),/permission denied/);
await db.exec('reset role');console.log('PASS anonymous execute denied');passed++;
await db.close();console.log(`${passed} isolated authorization tests passed`);
