"""One-shot sanitized recovery into an explicitly allowlisted EMPTY managed project.
Never restores auth/session data, secrets, scheduler, or public Storage buckets.
No production connection credential is accepted. No backup artifacts are uploaded.
"""
import base64
import hashlib
import http.server
import threading
from contextlib import contextmanager
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from backup_to_b2 import BackupError
import restore_backup_test
from restore_backup_test import main as local_restore

def command(args, data=None):
    result=subprocess.run(args,input=data,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    if result.returncode:
        raise BackupError("Isolated recovery command failed; sensitive diagnostics suppressed.")
    return result.stdout

TARGET = 'sgfeieqqkrogvzotrais'
PRODUCTION = 'eaehrhqsqmlcjcuzeyoh'
BASE = 'https://' + TARGET + '.supabase.co'
POOLER = 'aws-1-us-west-1.pooler.supabase.com'
PUBLISHABLE = 'sb_publishable_AQM5KXG7Wyd6yjbaAL_Q9A_REYgOnCo'
HELPERS = ['current_user_role','is_admin','is_mechanic_or_above','can_access_site','can_work_at_site',
           'admin_list_users','owner_account_history','record_service_with_inventory',
           'rental_company_options','rental_company_contact_details','update_equipment_hours']
TABLES = {'audit_log','equipment','equipment_filters','fleet_reference','fleet_reference_photos',
          'pm_notification_config','pm_notification_delivery','pm_notification_preferences','pm_push_subscriptions',
          'pm_schedules','profiles','rental_companies','service_history','site_inventory','site_items',
          'site_members','sites','work_ticket_updates','work_tickets'}

def require(ok, label):
    if not ok: raise BackupError('Hosted recovery stopped: ' + label)

def target_environment(url):
    p=urllib.parse.urlparse(url)
    require(p.scheme in ('postgres','postgresql') and not p.query and not p.fragment,'unexpected connection URL options')
    require(p.path == '/postgres' and p.password and p.port in (None,5432),'expected session connection to postgres')
    user=urllib.parse.unquote(p.username or '')
    direct=p.hostname=='db.'+TARGET+'.supabase.co' and user=='postgres'
    pool=(p.hostname or '').endswith('.pooler.supabase.com') and user=='postgres.'+TARGET
    require(direct or pool,'target allowlist rejected connection')
    require(PRODUCTION not in url,'production connection forbidden')
    return {'PGHOST':p.hostname,'PGPORT':str(p.port or 5432),'PGUSER':user,
            'PGPASSWORD':urllib.parse.unquote(p.password),'PGDATABASE':'postgres','PGSSLMODE':'require','PGCONNECT_TIMEOUT':'15'}

def connection_url():
    password=os.environ.get('RECOVERY_SUPABASE_DB_PASSWORD')
    if password:
        return 'postgresql://postgres.'+TARGET+':'+urllib.parse.quote(password,safe='')+'@'+POOLER+':5432/postgres'
    return os.environ.get('RECOVERY_SUPABASE_DB_URL','')

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs): return None

def api(path,key,payload=None,method=None,raw=None,extra=None,jwt=None):
    require(path.startswith(('/auth/v1/','/rest/v1/','/storage/v1/')) and not path.startswith('//'),'unsafe API path')
    headers={'apikey':key,'Authorization':'Bearer '+(jwt or key)}
    data=raw
    if payload is not None: data=json.dumps(payload).encode();headers['Content-Type']='application/json'
    if extra: headers.update(extra)
    request=urllib.request.Request(BASE+path,data=data,headers=headers,method=method)
    try:
        with urllib.request.build_opener(NoRedirect).open(request,timeout=45) as r:return r.status,r.read()
    except urllib.error.HTTPError as e:return e.code,e.read()

def remote(command_name, args, data=None):
    env=os.environ.copy()
    invocation=['docker','run','--rm','-i']
    for key in ('PGHOST','PGPORT','PGUSER','PGPASSWORD','PGDATABASE','PGSSLMODE','PGCONNECT_TIMEOUT'):
        invocation+=['-e',key]
    invocation+=['postgres:17',command_name]+args
    result=subprocess.run(invocation,env=env,input=data,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    if result.returncode:
        # Never emit SQL statements, COPY rows, credentials or provider body.
        state=re.search(rb'SQLSTATE[^A-Z0-9]*([A-Z0-9]{5})',result.stderr)
        raise BackupError('Hosted '+command_name+' failed'+(' SQLSTATE '+state.group(1).decode() if state else '')+'; output suppressed.')
    return result.stdout

def sql(text): return remote('psql',['-X','-v','ON_ERROR_STOP=1','-At'],text.encode()).decode().strip()

def scrub(value,names):
    if isinstance(value,dict): return {scrub(k,names):scrub(v,names) for k,v in value.items()}
    if isinstance(value,list): return [scrub(v,names) for v in value]
    if not isinstance(value,str): return value
    if value.startswith('data:image/'):
        return value
    for name in names:
        if name: value=value.replace(name,'Recovery Account')
    value=re.sub(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+','redacted@example.invalid',value)
    value=re.sub(r'\+?\d[\d ()-]{8,}\d','[redacted-number]',value)
    value=value.replace(PRODUCTION,TARGET)
    # Fields holding credentials are emptied separately; unexpected credential-like values fail closed.
    require(not re.search(r'(?:eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]+\.|sb_secret_|ghp_|github_pat_)',value),'unexpected credential-like data')
    return value

def permission_denied(status,body,message=None):
    try: error=json.loads(body)
    except (ValueError,TypeError): return False
    if status in (401,403) and error.get('code')=='42501': return True
    return status==400 and error.get('code')=='P0001' and message is not None and error.get('message')==message

@contextmanager
def disable_after_test():
    try: yield
    finally:
        try: sql('update public.profiles set active=false;')
        except Exception:
            raise BackupError('Recovery cleanup failed: synthetic profiles may remain active; operator review needed.') from None

def browser_test(root,credentials,machine):
    source=root/'recovered-source'
    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(source),**kwargs)
        def log_message(self,*args):pass
        def do_GET(self):
            relative=urllib.parse.urlsplit(self.path).path.lstrip('/') or 'index.html'
            path=(source/relative).resolve()
            if not path.is_relative_to(source.resolve()): self.send_error(403);return
            if path.is_file() and path.suffix in ('.js','.html'):
                content=path.read_text().replace(PRODUCTION,TARGET)
                if relative=='app.js':
                    require(len(re.findall(r'const SUPABASE_URL = .*?;',content))==1 and len(re.findall(r'const SUPABASE_KEY = .*?;',content))==1,'unexpected frontend configuration shape')
                    content=re.sub(r'const SUPABASE_URL = .*?;', 'const SUPABASE_URL = '+json.dumps(BASE)+';',content,count=1)
                    content=re.sub(r'const SUPABASE_KEY = .*?;', 'const SUPABASE_KEY = '+json.dumps(PUBLISHABLE)+';',content,count=1)
                body=content.encode();self.send_response(200);self.send_header('Content-Type','application/javascript' if path.suffix=='.js' else 'text/html');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body);return
            super().do_GET()
    server=http.server.ThreadingHTTPServer(('127.0.0.1',55300),Handler)
    threading.Thread(target=server.serve_forever,daemon=True).start()
    config=root/'hosted-browser.json'
    try:
        config.write_text(json.dumps({'owner':credentials[0],'viewer':credentials[1],'equipment':machine,'target':TARGET}))
        env=os.environ.copy()
        # No elevated API/DB credentials enter the browser child process.
        for k in list(env):
            if k.startswith(('RECOVERY_SUPABASE_','B2_','PG')):env.pop(k)
        env['RECOVERY_BROWSER_CONFIG']=str(config)
        result=subprocess.run(['node','scripts/hosted_recovery_browser.cjs'],env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        require(result.returncode==0,'local frontend browser check failed; diagnostics suppressed')
    finally:
        server.shutdown();server.server_close();config.unlink(missing_ok=True)
    print('Local-only restored frontend login, equipment view and PM calculation passed against managed test backend.',flush=True)

def hosted(root,restored,container,psql,storage):
    start=time.monotonic()
    env=target_environment(connection_url())
    os.environ.update(env)
    key=os.environ.get('RECOVERY_SUPABASE_SERVICE_ROLE_KEY','')
    require(bool(key),'missing target API key')
    if key.startswith('eyJ'):
        try: claims=json.loads(base64.urlsafe_b64decode(key.split('.')[1]+'==='))
        except Exception: raise BackupError('Invalid recovery API key') from None
        require(claims.get('ref')==TARGET and claims.get('role')=='service_role','API key does not match target')
    else: require(key.startswith('sb_secret_'),'unexpected target key format')
    require(not any(os.environ.get(n) for n in ('SUPABASE_DB_URL','SUPABASE_SERVICE_ROLE_KEY','RESEND_API_KEY','VAPID_PRIVATE_KEY')),'production/outbound credentials present')
    require(sql("select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'")=='0','target is not empty; no destructive retry permitted')
    require(sql('select count(*) from auth.users')=='0' and sql('select count(*) from storage.objects')=='0','target contains existing users or files')
    require(sql("select count(*) from pg_namespace where nspname in ('account_audit_private','pm_scheduler_private')")=='0','target already initialized')
    status,body=api('/auth/v1/admin/users?page=1&per_page=1',key)
    require(status==200 and not json.loads(body).get('users'), 'target API key validation or empty-user check')
    # All sanitation is performed only on the network-isolated disposable DB.
    def local(q): return command(psql,q.encode()).decode().strip()
    tables=set(json.loads(local("select json_agg(tablename) from pg_tables where schemaname='public'")))
    require(tables==TABLES,'unreviewed application table set')
    definitions=local("select coalesce(string_agg(pg_get_functiondef(p.oid),E'\\n'),'') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','account_audit_private') and p.prokind in ('f','p')")
    require(not re.search(r'(https?://|\bvault\.|\bnet\.|\bcron\.|\bdblink|sb_secret_|ghp_|github_pat_|eyJ[A-Za-z0-9_-]{12,}\.)',definitions,re.I) and PRODUCTION not in definitions,'unreviewed external destination or credential in SQL definitions')
    users=json.loads(local("select coalesce(json_agg(json_build_object('id',id,'name',full_name,'role',role,'active',active)), '[]'::json) from public.profiles"))
    names=[u['name'] for u in users]
    require(len(users)>1 and any(u['role']=='owner' and u['active'] for u in users),'missing testable profiles')
    # Remove all notification destinations and client push secrets in the local derivative.
    local("set session_replication_role=replica; truncate public.pm_push_subscriptions,public.pm_notification_delivery,public.pm_notification_config; update public.pm_notification_preferences set email_enabled=false,push_enabled=false; update public.profiles set full_name='Recovery Account '||left(id::text,8); update public.rental_companies set salesperson_name=null,salesperson_phone=null,salesperson_email=null,parts_service_phone=null,parts_service_email=null; set session_replication_role=origin;")
    # Sanitise textual and JSON fields row-by-row using PostgreSQL ctid; no data is logged.
    columns=json.loads(local("select json_agg(json_build_object('schema',table_schema,'table',table_name,'column',column_name,'type',data_type)) from information_schema.columns where table_schema in ('public','account_audit_private') and data_type in ('text','character varying','character','jsonb','json')"))
    for c in columns:
        ident=lambda s:'"'+s.replace('"','""')+'"'
        relation=ident(c['schema'])+'.'+ident(c['table']);col=ident(c['column'])
        rows=json.loads(local('select coalesce(json_agg(json_build_object(\'ctid\',ctid::text,\'v\','+col+')),\'[]\'::json) from '+relation+' where '+col+' is not null'))
        for row in rows:
            value=scrub(row['v'],names)
            if value!=row['v']:
                encoded=json.dumps(value) if c['type'] in ('json','jsonb') else value
                local('set session_replication_role=replica; update '+relation+' set '+col+"='"+encoded.replace("'","''")+"'"+('::'+c['type'] if c['type'] in ('json','jsonb') else '')+" where ctid='"+row['ctid']+"'::tid; set session_replication_role=origin;")
    # Export only application schemas. Auth users/sessions and storage metadata are NEVER exported.
    command(['docker','exec',container,'pg_dump','-U','postgres','-d','postgres','--format=custom','--no-owner','--no-privileges','--schema=public','--schema=account_audit_private','-f','/tmp/sanitized.dump'])
    dump=root/'sanitized.dump';command(['docker','cp',container+':/tmp/sanitized.dump',str(dump)])
    # TOC excludes existing managed public schema; no clean/drop option is ever used remotely.
    toc=command(['docker','exec',container,'pg_restore','--list','/tmp/sanitized.dump']).decode()
    toc='\n'.join(line for line in toc.splitlines() if not re.search(r' SCHEMA - public ',line))+'\n'
    # SQL output includes only application schemas after sanitation; no managed auth/storage schema replacement.
    command(['docker','exec','-i',container,'sh','-c','cat > /tmp/restore.list'],toc.encode())
    restored_sql=command(['docker','exec',container,'pg_restore','--no-owner','--no-privileges','--use-list=/tmp/restore.list','--file=-','/tmp/sanitized.dump']).decode()
    require('CREATE SCHEMA auth' not in restored_sql and 'COPY auth.' not in restored_sql and 'COPY storage.' not in restored_sql,'managed schema export forbidden')
    # Preserve UUID relationships but create locked synthetic identities, never production passwords.
    identity_sql=[]
    for u in users:
        require(bool(re.fullmatch(r'[a-f0-9-]{36}',u['id'])),'invalid identity UUID')
        identity_sql.append("insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change) values ('"+u['id']+"','00000000-0000-0000-0000-000000000000','authenticated','authenticated','recovery-"+u['id']+"@example.invalid','',now(),'{\"provider\":\"email\",\"providers\":[\"email\"]}','{}',now(),now(),'','','','');")
        identity_sql.append("insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at) values ('"+u['id']+"','"+u['id']+"','{\"sub\":\""+u['id']+"\",\"email\":\"recovery-"+u['id']+"@example.invalid\"}','email',now(),now());")
    helper_sql="do $$ declare r record; begin for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any(array["+','.join("'"+n+"'" for n in HELPERS)+"]) loop execute 'grant execute on function '||r.sig||' to authenticated'; end loop; end $$;"
    lockdown="""
revoke all on schema public from public,anon,authenticated;
revoke all on all tables in schema public from public,anon,authenticated;
revoke all on all functions in schema public from public,anon,authenticated;
revoke all on all sequences in schema public from public,anon,authenticated;
revoke all on schema account_audit_private from public,anon,authenticated,service_role;
revoke all on all tables in schema account_audit_private from public,anon,authenticated,service_role;
revoke all on all functions in schema account_audit_private from public,anon,authenticated,service_role;
grant usage on schema public to authenticated;
grant select on all tables in schema public to authenticated;
revoke all on public.site_members from authenticated;
"""
    # psql script is in one transaction; role access is revoked before tables become externally visible.
    sql('begin; revoke all on schema public from public,anon,authenticated;\n'+ '\n'.join(identity_sql)+'\n'+restored_sql+'\n'+lockdown+helper_sql+"\nnotify pgrst,'reload schema'; commit;")
    with disable_after_test():
        print('Sanitized application schema/data restored into the allowlisted recovery project; no production Auth data copied.',flush=True)
        expected=local("select json_build_object('equipment',(select count(*) from public.equipment),'sites',(select count(*) from public.sites),'profiles',(select count(*) from public.profiles),'services',(select count(*) from public.service_history),'audit',(select count(*) from account_audit_private.events))")
        actual=sql("select json_build_object('equipment',(select count(*) from public.equipment),'sites',(select count(*) from public.sites),'profiles',(select count(*) from public.profiles),'services',(select count(*) from public.service_history),'audit',(select count(*) from account_audit_private.events))")
        require(json.loads(expected)==json.loads(actual),'restored row count mismatch')
        for schema,table in [('public',t) for t in sorted(TABLES)]+[('account_audit_private','events'),('account_audit_private','operations')]:
            fingerprint="set timezone='UTC'; select md5(coalesce(string_agg(row_to_json(t)::text,E'\\n' order by row_to_json(t)::text COLLATE \"C\"),'')) from "+schema+'.'+table+' t'
            require(local(fingerprint)==sql(fingerprint),'sanitized table fingerprint mismatch')
        print('All sanitized application and account-history table fingerprints match the isolated derivative.',flush=True)
        require(sql("select count(*) from public.pm_push_subscriptions")=='0','push destinations survived sanitation')
        require(sql("select count(*) from auth.sessions")=='0','unexpected restored sessions')
        require(sql("select count(*) from pg_namespace where nspname in ('cron','pm_scheduler_private')")=='0','unexpected scheduler schema')
        # Storage only through API, always private and without source metadata/owners.
        buckets=sorted({o['bucket'] for o in storage['objects']})
        for bucket in buckets:
            status,_=api('/storage/v1/bucket',key,{'id':bucket,'name':bucket,'public':False})
            require(status<300,'private bucket creation')
        for o in storage['objects']:
            data=(restored/o['archive_path']).read_bytes()
            path='/storage/v1/object/'+urllib.parse.quote(o['bucket'],safe='')+'/'+urllib.parse.quote(o['name'],safe='/')
            status,_=api(path,key,raw=data,extra={'Content-Type':(o.get('metadata') or {}).get('mimetype','application/octet-stream')})
            require(status<300,'private file upload')
            status,body=api(path.replace('/object/','/object/authenticated/',1),key)
            require(status==200 and hashlib.sha256(body).hexdigest()==o['sha256'],'private file checksum')
            public=BASE+path.replace('/object/','/object/public/',1)
            try:
                with urllib.request.build_opener(NoRedirect).open(public,timeout=30) as r:status=r.status
            except urllib.error.HTTPError as e:status=e.code
            require(status in (400,401,403,404),'public file access unexpectedly allowed or server error')
        print('All '+str(len(storage['objects']))+' files restored privately and checksum verified; public access denied.',flush=True)
        # Activate only two synthetic credentials for test login. No SMTP/invitation endpoint is called.
        owner=next(u for u in users if u['role']=='owner' and u['active'])
        other=next(u for u in users if u['id']!=owner['id'])
        sql("update public.profiles set role='viewer',active=true where id='"+other['id']+"';")
        logins=[];credentials=[]
        for u in (owner,other):
            password=secrets.token_urlsafe(32)
            status,_=api('/auth/v1/admin/users/'+u['id'],key,{'password':password,'email_confirm':True},method='PUT')
            require(status<300,'synthetic account credential setup')
            status,body=api('/auth/v1/token?grant_type=password',key,{'email':'recovery-'+u['id']+'@example.invalid','password':password})
            require(status==200,'synthetic managed password login')
            logins.append(json.loads(body)['access_token'])
            credentials.append({'email':'recovery-'+u['id']+'@example.invalid','password':password})
        owner_jwt,viewer_jwt=logins
        for attempt in range(10):
            status,body=api('/rest/v1/equipment?select=id,site_id,current_hours&limit=1',key,jwt=owner_jwt)
            if status==200:break
            time.sleep(2)
        require(status==200 and len(json.loads(body))>0,'owner managed equipment read')
        machine=json.loads(body)[0]
        sql("insert into public.site_members(site_id,user_id) values ('"+machine['site_id']+"','"+other['id']+"') on conflict do nothing;")
        status,body=api('/rest/v1/equipment?select=id',key,jwt=viewer_jwt)
        require(status==200 and len(json.loads(body))>0,'viewer site read')
        status,body=api('/rest/v1/equipment?id=eq.'+machine['id'],key,{'current_hours':999999},method='PATCH',jwt=viewer_jwt)
        require(permission_denied(status,body),'viewer write denied')
        status,body=api('/rest/v1/rpc/owner_account_history',key,{},jwt=viewer_jwt)
        require(permission_denied(status,body),'viewer account history denied')
        status,_=api('/rest/v1/rpc/owner_account_history',key,{},jwt=owner_jwt)
        require(status==200,'owner account history read')
        hours=float(machine['current_hours'] or 0)+1
        request={'p_equipment_id':machine['id'],'p_pm_schedule_id':None,'p_service_name':'Hosted recovery test','p_service_hours':hours,'p_scheduled_due_hours':None,'p_service_date':'2026-11-13','p_parts_used':None,'p_notes':'Synthetic recovery project only','p_inventory_deductions':[]}
        status,body=api('/rest/v1/rpc/record_service_with_inventory',key,request,jwt=viewer_jwt)
        require(permission_denied(status,body,'Only maintainers can record service'),'viewer service RPC denied')
        status,_=api('/rest/v1/rpc/record_service_with_inventory',key,request,jwt=owner_jwt)
        require(status<300,'owner service RPC')
        status,body=api('/rest/v1/equipment?id=eq.'+machine['id']+'&select=current_hours',key,jwt=owner_jwt)
        require(status==200 and float(json.loads(body)[0]['current_hours'])==hours,'managed meter update')
        browser_test(root,credentials,machine)
    summary='Managed recovery test PASSED in '+str(round(time.monotonic()-start))+' seconds. Sanitized application data, private image readback, synthetic managed login, owner/viewer permissions, account history and service/meter checks passed. Synthetic profiles disabled after test. No production users/sessions or outbound credentials copied. No emails, push, cron, DNS or production cutover. Local-only restored frontend sign-in and PM calculation passed. Private images verified via authenticated API, not public URL rendering. Real-user credential migration and full permission parity remain separate checks.'
    print(summary,flush=True)
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'],'a') as f:f.write('## Hosted recovery test\n\n'+summary+'\n')

if __name__=='__main__':
    try:
        # Validate configuration BEFORE downloading any production backup.
        target_environment(connection_url())
        restore_backup_test.command=command
        local_restore(recovery_callback=hosted)
    except BackupError as e:
        print('::error::'+str(e),file=sys.stderr);sys.exit(1)
    except Exception:
        print('::error::Hosted recovery failed; sensitive exception details suppressed.',file=sys.stderr);sys.exit(1)
