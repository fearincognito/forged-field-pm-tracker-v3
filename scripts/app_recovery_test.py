"""Temporary self-hosted Auth/REST/Storage + recovered frontend smoke test."""
import base64
import hashlib
import hmac
import http.server
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from backup_to_b2 import BackupError, sha256


def application_test(root, restored, database_container, psql, storage):
    from restore_backup_test import command
    suffix=secrets.token_hex(4); network=database_container+'-net'; containers=[]
    endpoints={}
    secret=secrets.token_urlsafe(48)
    def token(role):
        enc=lambda x:base64.urlsafe_b64encode(json.dumps(x,separators=(',',':')).encode()).decode().rstrip('=')
        payload=enc({'alg':'HS256','typ':'JWT'})+'.'+enc({'role':role,'iss':'supabase','iat':int(time.time()),'exp':int(time.time())+7200})
        return payload+'.'+base64.urlsafe_b64encode(hmac.new(secret.encode(),payload.encode(),hashlib.sha256).digest()).decode().rstrip('=')
    anon=token('anon');service=token('service_role');server=None
    def start(name,image,port,values):
        container='recovery-'+name+'-'+suffix;containers.append(container)
        env=os.environ.copy();args=['docker','run','-d','--name',container,'--network',network,'--network-alias',name,'-p','127.0.0.1:'+str(port)+':'+str({'auth':9999,'rest':3000,'storage':5000}[name])]
        for i,(key,value) in enumerate(values.items()):
            env[key]=str(value);args+=['-e',key]
        args.append(image)
        result=subprocess.run(args,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        if result.returncode:raise BackupError('Could not start local '+name+' service.')
        info=json.loads(command(['docker','inspect',container]))[0]
        endpoints[port]=(info['NetworkSettings']['Networks'][network]['IPAddress'], {'auth':9999,'rest':3000,'storage':5000}[name])
    def api(port,path,payload=None,jwt=None,method=None,raw=None,extra=None):
        headers={'apikey':service,'Authorization':'Bearer '+(jwt or service)}
        data=raw
        if payload is not None:data=json.dumps(payload).encode();headers['Content-Type']='application/json'
        if extra:headers.update(extra)
        host,target_port=endpoints[port]
        req=urllib.request.Request('http://'+host+':'+str(target_port)+path,data=data,headers=headers,method=method)
        try:
            with urllib.request.urlopen(req,timeout=30) as r:return r.status,r.read()
        except urllib.error.HTTPError as e:return e.code,e.read()
    def wait(port,path,label):
        for _ in range(35):
            try:
                status,_=api(port,path)
                if status<400:return
            except (OSError,TimeoutError):pass
            time.sleep(1)
        # Startup-only diagnostics, before test-user creation or restored-data API writes.
        target='recovery-'+label.lower()+'-'+suffix
        logs=subprocess.run(['docker','logs',target],stdout=subprocess.PIPE,stderr=subprocess.STDOUT).stdout.decode(errors='replace')
        logs=logs.replace(secret,'[test-secret]').replace(service,'[test-token]').replace(anon,'[test-token]')
        logs=re.sub(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+', '[redacted-address]', logs)
        logs=re.sub(r'postgres(?:ql)?://\S+', '[database-url]', logs)
        safe=[]
        for line in logs.splitlines():
            try:
                entry=json.loads(line)
                if entry.get('level') in ['fatal','error']:
                    safe.append(str(entry.get('msg',''))[-500:])
            except ValueError:
                pass
        if safe: print('Startup diagnostic ('+label+'): '+'; '.join(safe[-2:]),flush=True)
        raise BackupError('Local '+label+' service did not become healthy.')
    def check(condition,message):
        if not condition:raise BackupError('Application recovery check failed: '+message)
    try:
        command(psql,b"alter role service_role bypassrls; grant anon,authenticated,service_role to postgres; grant usage on schema public,auth,storage,extensions to anon,authenticated,service_role; grant all on all tables in schema public,storage to service_role; grant all on all sequences in schema public,storage to service_role; grant select,insert,update,delete on all tables in schema public to authenticated; grant usage on all sequences in schema public to authenticated; grant execute on all functions in schema public to authenticated,service_role;")
        start('rest','postgrest/postgrest:v14.18',55301,{'PGRST_DB_URI':'postgres://postgres@db:5432/postgres','PGRST_DB_SCHEMAS':'public,storage','PGRST_DB_ANON_ROLE':'anon','PGRST_JWT_SECRET':secret,'PGRST_DB_EXTRA_SEARCH_PATH':'public,extensions','PGRST_DB_USE_LEGACY_GUCS':'false'})
        start('auth','supabase/gotrue:v2.197.0',55302,{'GOTRUE_API_HOST':'0.0.0.0','PORT':9999,'GOTRUE_API_PORT':9999,'API_EXTERNAL_URL':'http://127.0.0.1:55300/auth/v1','GOTRUE_DB_DRIVER':'postgres','GOTRUE_DB_DATABASE_URL':'postgres://postgres@db:5432/postgres?search_path=auth,public,extensions','GOTRUE_SITE_URL':'http://127.0.0.1:55300','GOTRUE_JWT_SECRET':secret,'GOTRUE_JWT_EXP':3600,'GOTRUE_JWT_AUD':'authenticated','GOTRUE_JWT_DEFAULT_GROUP_NAME':'authenticated','GOTRUE_JWT_ADMIN_ROLES':'service_role','GOTRUE_EXTERNAL_EMAIL_ENABLED':'true','GOTRUE_MAILER_AUTOCONFIRM':'true','GOTRUE_DISABLE_SIGNUP':'true','GOTRUE_LOG_LEVEL':'error'})
        start('storage','supabase/storage-api:v1.89.12',55303,{'ANON_KEY':anon,'SERVICE_KEY':service,'AUTH_JWT_SECRET':secret,'POSTGREST_URL':'http://rest:3000','DATABASE_URL':'postgres://postgres@db:5432/postgres?search_path=storage,public,extensions','FILE_SIZE_LIMIT':52428800,'STORAGE_BACKEND':'file','FILE_STORAGE_BACKEND_PATH':'/var/lib/storage','TENANT_ID':'recovery','REGION':'local','GLOBAL_S3_BUCKET':'recovery','ENABLE_IMAGE_TRANSFORMATION':'false','LOG_LEVEL':'fatal','STORAGE_PUBLIC_URL':'http://127.0.0.1:55300'})
        wait(55301,'/equipment?select=id&limit=1','REST')
        wait(55302,'/health','Auth')
        wait(55303,'/status','Storage')
        print('Local Auth, REST and Storage services are healthy.',flush=True)
        # Recover actual bytes through Storage API, not direct metadata inserts.
        for obj in storage['objects']:
            data=(restored/obj['archive_path']).read_bytes()
            path='/object/'+urllib.parse.quote(obj['bucket'],safe='')+'/'+urllib.parse.quote(obj['name'],safe='/')
            status,_=api(55303,path,raw=data,extra={'Content-Type':(obj.get('metadata') or {}).get('mimetype','application/octet-stream'),'x-upsert':'true'})
            check(status<300,'Storage re-upload')
            status,download=api(55303,path.replace('/object/','/object/authenticated/',1))
            check(status==200 and hashlib.sha256(download).hexdigest()==obj['sha256'],'Storage API readback')
        print('All '+str(len(storage['objects']))+' image files re-uploaded and read back through local Storage API.',flush=True)
        credentials=[]
        for role in ['owner','viewer']:
            email='recovery-'+role+'-'+suffix+'@example.invalid';password=secrets.token_urlsafe(24)
            status,body=api(55302,'/admin/users',{'email':email,'password':password,'email_confirm':True,'user_metadata':{'full_name':'Recovery '+role}})
            check(status<300,'create temporary '+role+' account')
            user=json.loads(body);uid=user['id']
            command(psql,("update public.profiles set role='"+role+"',active=true where id='"+uid+"';").encode())
            status,body=api(55302,'/token?grant_type=password',{'email':email,'password':password})
            check(status==200,'password sign-in '+role)
            jwt=json.loads(body)['access_token'];credentials.append({'email':email,'password':password,'jwt':jwt,'id':uid})
        owner,viewer=credentials
        status,body=api(55301,'/equipment?select=id,site_id,current_hours&limit=1',jwt=owner['jwt']);check(status==200,'owner equipment read')
        machine=json.loads(body)[0]
        # Assign viewer only to the machine site in restored data.
        command(psql,("insert into public.site_members(site_id,user_id) values ('"+machine['site_id']+"','"+viewer['id']+"') on conflict do nothing;").encode())
        status,body=api(55301,'/equipment?select=id',jwt=viewer['jwt']);check(status==200 and len(json.loads(body))>0,'viewer assigned-site read')
        status,body=api(55301,'/equipment?id=eq.'+machine['id'],{'name':'Forbidden viewer edit'},jwt=viewer['jwt'],method='PATCH',extra={'Prefer':'return=representation'})
        check(status>=400 or json.loads(body)==[],'viewer equipment write denied')
        hours=float(machine['current_hours'] or 0)+1
        request={'p_equipment_id':machine['id'],'p_pm_schedule_id':None,'p_service_name':'Temporary recovery test','p_service_hours':hours,'p_scheduled_due_hours':None,'p_service_date':'2026-11-05','p_parts_used':None,'p_notes':'Disposable recovery environment only','p_inventory_deductions':[]}
        status,_=api(55301,'/rpc/record_service_with_inventory',request,jwt=viewer['jwt']);check(status>=400,'viewer service write denied')
        status,_=api(55301,'/rpc/record_service_with_inventory',request,jwt=owner['jwt']);check(status<300,'owner record-service RPC')
        status,body=api(55301,'/equipment?id=eq.'+machine['id']+'&select=current_hours,hours_recorded_at',jwt=owner['jwt'])
        check(status==200 and float(json.loads(body)[0]['current_hours'])==hours and json.loads(body)[0]['hours_recorded_at'],'service updates equipment meter')
        # Serve recovered frontend with only temporary localhost URL/key substitutions.
        source=root/'recovered-source'
        class Handler(http.server.SimpleHTTPRequestHandler):
            def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(source),**kwargs)
            def log_message(self,*args):pass
            def forward(self):
                prefixes={'/auth/v1':55302,'/rest/v1':55301,'/storage/v1':55303}
                for prefix,port in prefixes.items():
                    if self.path.startswith(prefix):
                        body=self.rfile.read(int(self.headers.get('Content-Length',0))) if self.headers.get('Content-Length') else None
                        headers={k:v for k,v in self.headers.items() if k.lower() not in ['host','content-length','connection','accept-encoding']}
                        host,target_port=endpoints[port]
                        req=urllib.request.Request('http://'+host+':'+str(target_port)+self.path[len(prefix):],data=body,headers=headers,method=self.command)
                        try:r=urllib.request.urlopen(req,timeout=30)
                        except urllib.error.HTTPError as e:r=e
                        self.send_response(r.status)
                        for k,v in r.headers.items():
                            if k.lower() not in ['transfer-encoding','connection','content-length']:self.send_header(k,v)
                        content=r.read();self.send_header('Content-Length',str(len(content)));self.end_headers();self.wfile.write(content);return True
                return False
            def do_GET(self):
                if self.forward():return
                if self.path.split('?')[0]=='/app.js':
                    content=(source/'app.js').read_text()
                    content=re.sub(r'const SUPABASE_URL = .*?;', 'const SUPABASE_URL = "http://127.0.0.1:55300";',content,count=1)
                    content=re.sub(r'const SUPABASE_KEY = .*?;', 'const SUPABASE_KEY = '+json.dumps(anon)+';',content,count=1)
                    data=content.encode();self.send_response(200);self.send_header('Content-Type','application/javascript');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data);return
                super().do_GET()
            def do_POST(self):self.forward()
            def do_PATCH(self):self.forward()
            def do_PUT(self):self.forward()
            def do_DELETE(self):self.forward()
        server=http.server.ThreadingHTTPServer(('127.0.0.1',55300),Handler)
        threading.Thread(target=server.serve_forever,daemon=True).start()
        # Browser package is test-only, installed by this dedicated CI workflow.
        settings=root/'browser-test.json';settings.write_text(json.dumps({'owner':owner,'viewer':viewer,'equipment':machine}))
        env=os.environ.copy();env['RECOVERY_BROWSER_CONFIG']=str(settings)
        result=subprocess.run(['node','scripts/recovery_browser_test.cjs'],env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        if result.returncode:
            diagnostics=result.stderr.decode(errors='replace')
            reason=next((item for item in ['BROWSER_SELECTOR_TIMEOUT','BROWSER_EXECUTABLE_MISSING','BROWSER_DEPENDENCIES_MISSING','BROWSER_CHECK_FAILED'] if item in diagnostics),'BROWSER_PROCESS_FAILED')
            safe_line=next((line for line in diagnostics.splitlines() if line.startswith(reason+': ')),reason)
            raise BackupError('Recovered frontend browser checks failed: '+safe_line)
        print('Recovered frontend browser login, equipment view and PM runtime calculation passed.',flush=True)
        return 'Local application recovery PASSED: Auth login, REST access, viewer write denial, service recording/meter reset, '+str(len(storage['objects']))+' Storage API upload/readbacks and recovered frontend browser checks.'
    finally:
        if server:server.shutdown()
        for container in reversed(containers):subprocess.run(['docker','rm','-f','-v',container],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        subprocess.run(['docker','network','disconnect',network,database_container],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        subprocess.run(['docker','network','rm',network],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
