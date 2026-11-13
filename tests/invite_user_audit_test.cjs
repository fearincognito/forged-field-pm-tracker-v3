const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { stripTypeScriptTypes } = require("node:module");
const source = fs.readFileSync(__dirname+"/../supabase/functions/invite-user/index.ts","utf8")
 .replace(/^import .*;\n/,"").replace("export async function","async function");
const js=stripTypeScriptTypes(source);
function setup(options={}) {
 const calls=[], logs=[]; let finalizeCalls=0;
 const admin={
  auth: {
   getUser:async token=>({data:{user:options.badSession?null:{id:"verified-actor"}},error:null}),
   admin:{
    createUser: async payload=>{calls.push(["create",payload]);if(options.providerThrow)throw Error("PRIVATE password email token");
      return {data:{user:options.providerFail?null:{id:"new-user"}},error:options.providerFail?{message:"PRIVATE provider email"}:null};},
    inviteUserByEmail: async (email,payload)=>{calls.push(["invite",{email,...payload}]);if(options.providerThrow)throw Error("PRIVATE password email token");
      return {data:{user:options.providerFail?null:{id:"new-user"}},error:options.providerFail?{message:options.conflict?"already registered PRIVATE":"PRIVATE provider email"}:null};},
    deleteUser:async id=>{calls.push(["delete",id]);if(options.cleanupThrow)throw Error("PRIVATE cleanup");return {error:options.cleanupFail?{message:"PRIVATE cleanup"}:null};}
   }},
  from:table=>{
   calls.push(["from",table]);
   const chain={select:()=>chain,eq:()=>chain,in:()=>chain,
    single:async()=>({data:{role:options.actorRole||"owner",active:!options.inactive},error:null}),
    then:resolve=>resolve({data:options.invalidSite?[]:[{id:"site1"}],error:null})};
   return chain;
  },
  rpc:async (name,args)=>{
   calls.push([name,args]);
   if(name==="account_audit_begin")return {data:options.beginFail?null:"operation-1",error:options.beginFail?{message:"PRIVATE begin"}:null};
   if(name==="account_audit_finalize"){
    finalizeCalls++;
    if(options.finalizeThrow || (options.finalizeOnceThrow && finalizeCalls===1))throw Error("PRIVATE finalize");
    if(options.finalizeReject)return {data:null,error:{code:"P0001",message:"PRIVATE rejection"}};
    if(options.finalizeTransport)return {data:null,error:{message:"PRIVATE transport"}};
    return {data:!options.finalizeFail,error:null};
   }
   if(options.failRpcThrow)throw Error("PRIVATE failure RPC");
   return {data:null,error:null};
  }
 };
 const context={createClient:()=>admin,Deno:{env:{get:()=>"mock"},serve:fn=>context.handler=fn},
 Response,Request,crypto:require("node:crypto").webcrypto,console:{error:(...args)=>logs.push(args)}};
 vm.runInNewContext(js,context);
 return {calls,logs,run:async(body,auth=true)=>{
  const r=await context.handler(new Request("https://local.test",{method:"POST",headers:auth?{Authorization:"Bearer mock"}:{},body:JSON.stringify(body)}));
  return {status:r.status,body:await r.json()};
 }};
}
const base={mode:"invite",full_name:"Test Person",role:"viewer",site_ids:["site1"],email:"test@example.invalid",actor_user_id:"spoof"};
let count=0;
async function test(name,fn){await fn();count++;console.log("PASS "+name);}
(async()=>{
await test("invite success binds verified actor and atomic finalize",async()=>{
 const m=setup(),r=await m.run(base);assert.equal(r.status,200);
 const begin=m.calls.find(c=>c[0]==="account_audit_begin")[1];
 assert.equal(begin.p_actor_user_id,"verified-actor");assert.equal(begin.p_mode,"invite");
 assert.deepEqual(Array.from(begin.p_site_ids),["site1"]);
 assert.ok(m.calls.findIndex(c=>c[0]==="account_audit_begin")<m.calls.findIndex(c=>c[0]==="invite"));
 assert.ok(m.calls.some(c=>c[0]==="account_audit_finalize"));
 assert.ok(!m.calls.some(c=>c[0]==="from"&&c[1]==="site_members"));
});
await test("manual viewer returns credentials only on successful finalize",async()=>{
 const m=setup(),r=await m.run({...base,mode:"manual_viewer"});
 assert.equal(r.status,200);assert.equal(r.body.password.length,16);assert.equal(r.body.mode,"manual_viewer");
 assert.ok(!JSON.stringify(m.calls.filter(c=>c[0].startsWith("account_audit"))).includes(r.body.password));
});
await test("begin failure prevents provider side effects",async()=>{
 const m=setup({beginFail:true}),r=await m.run(base);assert.equal(r.status,500);
 assert.ok(!m.calls.some(c=>["invite","create"].includes(c[0])));
});
for(const mode of ["invite","manual_viewer"]){
 await test(mode+" provider failure recorded safely",async()=>{
  const m=setup({providerFail:true}),r=await m.run({...base,mode});assert.equal(r.status,400);
  assert.equal(m.calls.find(c=>c[0]==="account_audit_fail")[1].p_error_code,"provider_failed");
  assert.ok(!JSON.stringify([r,m.logs]).includes("PRIVATE"));
 });
 await test(mode+" provider exception recorded safely",async()=>{
  const m=setup({providerThrow:true}),r=await m.run({...base,mode});assert.equal(r.status,500);
  assert.equal(m.calls.find(c=>c[0]==="account_audit_fail")[1].p_error_code,"provider_failed");
 });
}
await test("provider duplicate preserves 409 without raw details",async()=>{
 const m=setup({providerFail:true,conflict:true}),r=await m.run(base);assert.equal(r.status,409);assert.equal(r.body.error,"Account already exists");
});
await test("invite setup failure records event without deleting invited auth user",async()=>{
 const m=setup({finalizeFail:true}),r=await m.run(base);assert.equal(r.status,500);
 assert.equal(m.calls.find(c=>c[0]==="account_audit_fail")[1].p_error_code,"setup_failed");
 assert.ok(!m.calls.some(c=>c[0]==="delete"));
});
for(const cleanupOption of [{},{cleanupFail:true},{cleanupThrow:true}]){
 await test("manual definite SQL rejection cleans up; cleanup result "+JSON.stringify(cleanupOption),async()=>{
  const m=setup({finalizeReject:true,...cleanupOption}),r=await m.run({...base,mode:"manual_viewer"});assert.equal(r.status,500);
  assert.ok(m.calls.some(c=>c[0]==="delete"));
  const errors=m.calls.filter(c=>c[0]==="account_audit_fail").map(c=>c[1].p_error_code);
  assert.deepEqual(errors,Object.keys(cleanupOption).length?["setup_failed","cleanup_failed"]:["setup_failed"]);
  assert.ok(!("password" in r.body));
 });
}
await test("audit failure error is safe and does not skip manual cleanup",async()=>{
 const m=setup({finalizeFail:true,failRpcThrow:true}),r=await m.run({...base,mode:"manual_viewer"});
 assert.equal(r.status,500);assert.ok(m.calls.some(c=>c[0]==="delete"));assert.ok(!JSON.stringify(m.logs).includes("PRIVATE"));
});
for(const [name,options,body,status,auth] of [
 ["missing auth",{},base,401,false],
 ["invalid session",{badSession:true},base,401,true],
 ["inactive actor",{inactive:true},base,403,true],
 ["viewer actor",{actorRole:"viewer"},base,403,true],
 ["admin cannot create owner",{actorRole:"admin"},{...base,role:"owner"},403,true],
 ["admin cannot create manual",{actorRole:"admin"},{...base,mode:"manual_viewer"},403,true],
 ["manual nonviewer",{}, {...base,mode:"manual_viewer",role:"mechanic"},400,true],
 ["invalid mode",{}, {...base,mode:"arbitrary"},400,true],
 ["invalid email",{}, {...base,email:"bad"},400,true],
 ["invalid sites",{invalidSite:true},base,400,true],
]){
 await test(name+" has no audit/provider mutation",async()=>{
  const m=setup(options),r=await m.run(body,auth);assert.equal(r.status,status);
  assert.ok(!m.calls.some(c=>c[0].startsWith("account_audit")||["create","invite"].includes(c[0])));
 });
}
await test("all-site role normalizes site selection",async()=>{
 const m=setup(),r=await m.run({...base,role:"mechanic"});assert.equal(r.status,200);
 assert.equal(m.calls.find(c=>c[0]==="account_audit_begin")[1].p_site_ids.length,0);
});

for (const mode of ["manual_viewer","invite"]) {
 await test(mode+" retries ambiguous finalize once and accepts idempotent success",async()=>{
  const m=setup({finalizeOnceThrow:true}),r=await m.run({...base,mode});assert.equal(r.status,200);
  assert.equal(m.calls.filter(c=>c[0]==="account_audit_finalize").length,2);
  assert.ok(!m.calls.some(c=>c[0]==="delete"||c[0]==="account_audit_fail"));
 });
 for (const options of [{finalizeThrow:true},{finalizeTransport:true},{finalizeOnceThrow:true,finalizeReject:true}]) {
  await test(mode+" unknown finalize cannot delete committed account "+JSON.stringify(options),async()=>{
   const m=setup(options),r=await m.run({...base,mode});assert.equal(r.status,500);
   assert.match(r.body.error,/could not be confirmed/); assert.ok(!("password" in r.body));
   assert.equal(m.calls.filter(c=>c[0]==="account_audit_finalize").length,2);
   assert.ok(!m.calls.some(c=>c[0]==="delete"));
   assert.equal(m.calls.find(c=>c[0]==="account_audit_fail")[1].p_error_code,"setup_failed");
  });
 }
}

console.log(count+" mock tests passed; no network or emails");
})().catch(e=>{console.error(e);process.exitCode=1;});
