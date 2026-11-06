"""Download the latest full backup and restore only into disposable local PostgreSQL.
This job receives Backblaze credentials only: it cannot connect to production Supabase.
"""
import datetime as dt
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import secrets
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.parse
import urllib.request
import base64
from backup_to_b2 import BackupError, request_json, sha256


def command(args, data=None):
    result = subprocess.run(args, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        # Print SQL error category only, never a COPY row or database data.
        message = result.stderr.decode(errors='replace')
        safe = []
        for line in message.splitlines():
            if 'ERROR:' in line or 'FATAL:' in line:
                safe.append(line.split('ERROR:')[-1].split('FATAL:')[-1].strip()[:200])
        raise BackupError('Disposable restore command failed: ' + ('; '.join(safe[:3]) or 'check container readiness/archive compatibility'))
    return result.stdout


def extract_checked(archive, destination):
    with tarfile.open(archive, 'r:*') as tar:
        for member in tar.getmembers():
            name = PurePosixPath(member.name)
            if name.is_absolute() or '..' in name.parts or not (member.isfile() or member.isdir()):
                raise BackupError('Unsafe archive member; restore stopped.')
        tar.extractall(destination, filter='data')


def main():
    os.umask(0o077)
    for name in ['B2_APPLICATION_KEY_ID', 'B2_APPLICATION_KEY', 'B2_BUCKET_NAME']:
        if not os.environ.get(name):
            raise BackupError('Missing backup read credential: ' + name)
    basic = base64.b64encode((os.environ['B2_APPLICATION_KEY_ID'] + ':' + os.environ['B2_APPLICATION_KEY']).encode()).decode()
    auth = request_json('https://api.backblazeb2.com/b2api/v4/b2_authorize_account', 'Basic ' + basic)
    api = auth['apiInfo']['storageApi']; token = auth['authorizationToken']
    buckets = request_json(api['apiUrl'] + '/b2api/v2/b2_list_buckets', token,
                           {'accountId': auth['accountId'], 'bucketName': os.environ['B2_BUCKET_NAME']})['buckets']
    if len(buckets) != 1 or buckets[0]['bucketType'] != 'allPrivate':
        raise BackupError('Expected a private backup bucket.')
    files = []; cursor = None
    while True:
        params = {'bucketId': buckets[0]['bucketId'], 'prefix': 'forged-pm/', 'maxFileCount': 1000}
        if cursor: params['startFileName'] = cursor
        page = request_json(api['apiUrl'] + '/b2api/v2/b2_list_file_names', token, params)
        files.extend(x for x in page['files'] if x['fileName'].endswith('.tar.gz'))
        cursor = page.get('nextFileName')
        if not cursor: break
    if not files: raise BackupError('No uploaded backup found.')
    latest = max(files, key=lambda x: x['uploadTimestamp'])
    container = 'forged-restore-' + secrets.token_hex(6)
    try:
        with tempfile.TemporaryDirectory(prefix='forged-restore-') as directory:
            root = Path(directory); bundle = root / 'backup.tar.gz'
            url = api['downloadUrl'] + '/b2api/v2/b2_download_file_by_id?' + urllib.parse.urlencode({'fileId': latest['fileId']})
            h = hashlib.sha1()
            with urllib.request.urlopen(urllib.request.Request(url, headers={'Authorization': token}), timeout=300) as response, bundle.open('wb') as f:
                for block in iter(lambda: response.read(1024*1024), b''):
                    h.update(block); f.write(block)
            if latest.get('contentSha1') != h.hexdigest(): raise BackupError('Downloaded backup transport checksum mismatch.')
            restored = root / 'restored'; restored.mkdir(); extract_checked(bundle, restored)
            manifest = json.loads((restored / 'manifest.json').read_text())
            if not manifest.get('storage_file_bytes_included'): raise BackupError('Latest archive predates full Storage coverage.')
            for name,key in [('database.dump','database_sha256'),('source.tar','source_sha256')]:
                if sha256(restored/name) != manifest[key]: raise BackupError('Archive component checksum mismatch: ' + name)
            if sha256(restored/'storage/manifest.json') != manifest['storage']['manifest_sha256']:
                raise BackupError('Storage manifest checksum mismatch.')
            storage = json.loads((restored/'storage/manifest.json').read_text())
            recovered = root/'recovered-storage'; recovered.mkdir()
            for obj in storage['objects']:
                original = PurePosixPath(obj['name']); bucket = PurePosixPath(obj['bucket'])
                path = PurePosixPath(obj['archive_path'])
                if any(p.is_absolute() or '..' in p.parts for p in [original,bucket,path]): raise BackupError('Unsafe recovery path.')
                source = restored.joinpath(*path.parts)
                if source.stat().st_size != obj['bytes'] or sha256(source) != obj['sha256']:
                    raise BackupError('Stored photo/logo checksum mismatch.')
                target = recovered.joinpath(*bucket.parts,*original.parts); target.parent.mkdir(parents=True,exist_ok=True)
                shutil.copyfile(source,target)
                if sha256(target) != obj['sha256']: raise BackupError('Recovered photo/logo failed verification.')
            source_dir = root/'recovered-source'; source_dir.mkdir(); extract_checked(restored/'source.tar',source_dir)
            if not (source_dir/'index.html').is_file() or not (source_dir/'app.js').is_file():
                raise BackupError('Recovered source is missing application entry points.')
            # No ports are published and the container has no network access.
            network = container+'-net' if os.environ.get('RESTORE_APPLICATION_TEST') == '1' else 'none'
            if network != 'none': command(['docker','network','create','--internal',network])
            network_options=['--network',network]+(['--network-alias','db'] if network!='none' else [])
            command(['docker','run','-d','--name',container]+network_options+['-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17'])
            ready=False
            for _ in range(60):
                result=subprocess.run(['docker','exec',container,'pg_isready','-U','postgres'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
                if result.returncode==0:ready=True;break
                time.sleep(1)
            if not ready:raise BackupError('Disposable PostgreSQL did not become ready.')
            psql=['docker','exec','-i',container,'psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At']
            roles=['dashboard_user','supabase_functions_admin','authenticated','anon','service_role','supabase_privileged_role','supabase_admin','authenticator','supabase_auth_admin','supabase_storage_admin','supabase_replication_admin','supabase_read_only_user','supabase_etl_admin','supabase_realtime_admin']
            sql='\n'.join('CREATE ROLE "'+role+'" NOLOGIN;' for role in roles)
            sql+='\nCREATE SCHEMA extensions; CREATE EXTENSION "uuid-ossp" SCHEMA extensions; CREATE EXTENSION pgcrypto SCHEMA extensions;'
            command(psql,sql.encode())
            command(['docker','cp',str(restored/'database.dump'),container+':/tmp/database.dump'])
            print('Restoring database into network-isolated disposable PostgreSQL…',flush=True)
            command(['docker','exec',container,'pg_restore','--exit-on-error','--no-owner','--no-privileges','--clean','--if-exists','-U','postgres','-d','postgres','/tmp/database.dump'])
            checks="""select json_build_object(
              'equipment',(select count(*) from public.equipment),
              'sites',(select count(*) from public.sites),
              'profiles',(select count(*) from public.profiles),
              'service_history',(select count(*) from public.service_history),
              'pm_schedules',(select count(*) from public.pm_schedules),
              'storage_objects',(select count(*) from storage.objects),
              'foreign_keys',(select count(*) from pg_constraint where contype='f'),
              'unvalidated_constraints',(select count(*) from pg_constraint where not convalidated),
              'rls_tables',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relrowsecurity),
              'policies',(select count(*) from pg_policies where schemaname='public'));
            """
            counts=json.loads(command(psql,checks.encode()).decode())
            if counts['equipment']<1 or counts['sites']<1 or counts['profiles']<1 or counts['policies']<1:
                raise BackupError('Critical restored application objects are missing.')
            if counts['storage_objects']!=len(storage['objects']):raise BackupError('Restored Storage database rows do not match recovered files.')
            # Check exact bucket/name associations without printing personal file paths.
            mapping=json.loads(command(psql,b"select coalesce(json_agg(json_build_array(bucket_id,name)), '[]'::json) from storage.objects;").decode())
            if {tuple(row) for row in mapping}!={(o['bucket'],o['name']) for o in storage['objects']}:
                raise BackupError('Storage bucket/name mapping mismatch.')
            # Exercise restored helpers and RLS with synthetic requests in the isolated database.
            permissions=b"""grant usage on schema public,auth to authenticated,anon;
            grant select on all tables in schema public to authenticated,anon;
            begin; set local role anon;
            do $$ begin if exists(select 1 from public.equipment) then raise exception 'Anonymous equipment access'; end if; end $$;
            rollback;
            select set_config('request.jwt.claim.sub',(select id::text from public.profiles where active and role='owner' limit 1),false);
            set role authenticated;
            do $$ begin if not public.is_admin() or not exists(select 1 from public.equipment) then raise exception 'Owner access failed'; end if; end $$;
            reset role;"""
            command(psql,permissions)
            if os.environ.get('RESTORE_APPLICATION_TEST') == '1':
                from app_recovery_test import application_test
                app_summary = application_test(root, restored, container, psql, storage)
                print(app_summary, flush=True)
                if os.environ.get('GITHUB_STEP_SUMMARY'):
                    with open(os.environ['GITHUB_STEP_SUMMARY'],'a') as f: f.write('## Local application recovery\n\n'+app_summary+'\n')
            summary='Restore rehearsal PASSED.\n\n'+json.dumps(counts,indent=2)+'\n\nRecovered and checksum-verified '+str(len(storage['objects']))+' uploaded files plus application source.\n\nLive Supabase was not connected to or modified. This tests data/source/file recovery, not hosted sign-in, deployed APIs, or a production cutover.\n'
            print(summary)
            if os.environ.get('GITHUB_STEP_SUMMARY'):
                with open(os.environ['GITHUB_STEP_SUMMARY'],'a') as f:f.write('## Disposable backup restore test\n\n'+summary)
    finally:
        subprocess.run(['docker','rm','-f','-v',container],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        subprocess.run(['docker','network','rm',container+'-net'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)


if __name__=='__main__':
    try:main()
    except BackupError as e:
        print('::error::'+str(e),file=sys.stderr);sys.exit(1)
    except Exception:
        print('::error::Restore test failed; sensitive exception details suppressed.',file=sys.stderr);sys.exit(1)
