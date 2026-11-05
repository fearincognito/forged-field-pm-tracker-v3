"""Off-site database/source backup. Credentials stay in runner environment only."""
import base64
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import urllib.error
import urllib.parse
import urllib.request


class BackupError(Exception):
    pass


def request_json(url, token, payload=None):
    data = None if payload is None else json.dumps(payload).encode()
    headers = {'Authorization': token}
    if data is not None:
        headers['Content-Type'] = 'application/json'
    try:
        with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=headers), timeout=120) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        # Never print response bodies, credentials or signed URLs.
        raise BackupError(f'Backblaze API returned HTTP {e.code}. Check key permissions and bucket settings.') from None


def run(args, env=None, output=None):
    result = subprocess.run(args, env=env, stdout=output or subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        # libpq errors can contain connection details. Classify without printing them.
        err = result.stderr.lower()
        if b'password authentication failed' in err:
            detail = 'Database password rejected. Update SUPABASE_DB_URL.'
        elif b'could not translate host' in err or b'invalid integer' in err or b'invalid percent' in err:
            detail = 'Invalid database URL. Check the session-pooler URL and percent-encode special characters in the password.'
        elif b'tenant or user not found' in err:
            detail = 'Session pooler rejected the project username. Copy the full Session pooler connection string from Supabase Connect.'
        elif b'network is unreachable' in err:
            detail = 'Database host requires IPv6. Use the Session pooler connection string for GitHub Actions.'
        elif b'connection refused' in err or b'timeout expired' in err:
            detail = 'Database connection refused or timed out. Check the pooler host, port and network restrictions.'
        elif b'could not connect to server' in err or b'no such file or directory' in err:
            detail = 'Database connection was not established. Check that SUPABASE_DB_URL contains the complete connection string.'
        elif b'permission denied' in err:
            detail = 'Database user cannot export one or more schemas.'
        elif b'server version' in err:
            detail = 'Database client/server version mismatch.'
        else:
            detail = 'Backup command failed. Check database connectivity, URL and client compatibility.'
        raise BackupError(detail)
    return result.stdout


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


STORAGE_BASE = 'https://eaehrhqsqmlcjcuzeyoh.supabase.co/storage/v1'


def storage_request(path, payload=None):
    key = os.environ['SUPABASE_SERVICE_ROLE_KEY']
    headers = {'Authorization': 'Bearer ' + key, 'apikey': key}
    data = None
    if payload is not None:
        headers['Content-Type'] = 'application/json'
        data = json.dumps(payload).encode()
    try:
        return urllib.request.urlopen(urllib.request.Request(STORAGE_BASE + path, data=data, headers=headers), timeout=120)
    except urllib.error.HTTPError as error:
        raise BackupError(f'Supabase Storage returned HTTP {error.code}. Check SUPABASE_SERVICE_ROLE_KEY and object availability.') from None


def storage_inventory():
    with storage_request('/bucket') as response:
        buckets = json.load(response)
    if not {'equipment-photos', 'site-logos'}.issubset({b['id'] for b in buckets}):
        raise BackupError('Expected photo/logo buckets were not returned. Check the service-role key belongs to this project.')
    objects = []
    for bucket in buckets:
        pending = ['']
        visited = set()
        while pending:
            prefix = pending.pop()
            if prefix in visited:
                continue
            visited.add(prefix)
            offset = 0
            while True:
                with storage_request('/object/list/' + urllib.parse.quote(bucket['id'], safe=''),
                                     {'prefix': prefix, 'limit': 100, 'offset': offset,
                                      'sortBy': {'column': 'name', 'order': 'asc'}}) as response:
                    page = json.load(response)
                for entry in page:
                    name = prefix + '/' + entry['name'] if prefix else entry['name']
                    if entry.get('id') is None:
                        pending.append(name)
                    else:
                        objects.append({'bucket': bucket['id'], 'name': name, 'id': entry['id'],
                                        'updated_at': entry.get('updated_at'), 'metadata': entry.get('metadata')})
                if len(page) < 100:
                    break
                offset += len(page)
    return {'buckets': sorted(buckets, key=lambda b: b['id']),
            'objects': sorted(objects, key=lambda o: (o['bucket'], o['name']))}


def export_storage(root, inventory):
    folder = root / 'storage' / 'objects'
    folder.mkdir(parents=True)
    manifest = []
    total = 0
    for obj in inventory['objects']:
        identity = json.dumps([obj['bucket'], obj['name']], ensure_ascii=False).encode()
        local_name = hashlib.sha256(identity).hexdigest()
        target = folder / local_name
        h = hashlib.sha256()
        size = 0
        route = '/object/authenticated/' + urllib.parse.quote(obj['bucket'], safe='') + '/' + urllib.parse.quote(obj['name'], safe='/')
        with storage_request(route) as response, target.open('wb') as output:
            for block in iter(lambda: response.read(1024 * 1024), b''):
                output.write(block)
                h.update(block)
                size += len(block)
                total += len(block)
                if total > 1024 * 1024 * 1024:
                    raise BackupError('Storage exceeds 1 GiB; streaming multipart backup must be configured.')
        expected_size = (obj.get('metadata') or {}).get('size')
        if expected_size is not None and size != int(expected_size):
            raise BackupError('Storage object size changed during backup; rerun to capture a stable copy.')
        manifest.append({**obj, 'archive_path': 'storage/objects/' + local_name, 'bytes': size, 'sha256': h.hexdigest()})
    # Detect additions, deletions and replacements during the dump/download window.
    if inventory != storage_inventory():
        raise BackupError('Storage changed during backup. Rerun when photo/logo uploads have finished.')
    (root / 'storage' / 'manifest.json').write_text(json.dumps({'buckets': inventory['buckets'], 'objects': manifest}, indent=2))
    print(f'Copied and hashed {len(manifest)} Storage files ({total:,} bytes).', flush=True)
    return {'file_count': len(manifest), 'bytes': total,
            'manifest_sha256': sha256(root / 'storage' / 'manifest.json')}



def main():
    required = ['SUPABASE_DB_URL', 'B2_APPLICATION_KEY_ID', 'B2_APPLICATION_KEY', 'B2_BUCKET_NAME', 'SUPABASE_SERVICE_ROLE_KEY']
    for name in required:
        if not os.environ.get(name):
            raise BackupError(f'Missing GitHub Actions secret: {name}')
    db_url = os.environ['SUPABASE_DB_URL'].strip()
    if not db_url.startswith(('postgresql://', 'postgres://')):
        raise BackupError('SUPABASE_DB_URL must contain the FULL postgresql:// connection string, not just the password.')
    if '[YOUR-PASSWORD]' in db_url:
        raise BackupError('Replace the password placeholder in SUPABASE_DB_URL.')
    os.environ['SUPABASE_DB_URL'] = db_url
    os.umask(0o077)
    key = base64.b64encode((os.environ['B2_APPLICATION_KEY_ID'] + ':' + os.environ['B2_APPLICATION_KEY']).encode()).decode()
    auth = request_json('https://api.backblazeb2.com/b2api/v4/b2_authorize_account', 'Basic ' + key)
    api = auth['apiInfo']['storageApi']
    token = auth['authorizationToken']
    buckets = request_json(api['apiUrl'] + '/b2api/v2/b2_list_buckets', token,
                           {'accountId': auth['accountId'], 'bucketName': os.environ['B2_BUCKET_NAME']})['buckets']
    if len(buckets) != 1 or buckets[0]['bucketType'] != 'allPrivate':
        raise BackupError('Backup bucket must exist and be private. No backup uploaded.')
    bucket_id = buckets[0]['bucketId']
    with tempfile.TemporaryDirectory(prefix='forged-backup-') as directory:
        root = Path(directory)
        inventory = storage_inventory()
        database = root / 'database.dump'
        db_env = os.environ.copy()
        # libpq does not expand a URI inherited as the PGDATABASE default.
        # Parse it into connection variables instead; never put secrets in CLI arguments.
        try:
            connection = urllib.parse.urlsplit(os.environ['SUPABASE_DB_URL'])
            if not connection.hostname or not connection.username or not connection.password or connection.fragment:
                raise ValueError()
            db_env['PGHOST'] = connection.hostname
            db_env['PGPORT'] = str(connection.port or 5432)
            db_env['PGUSER'] = urllib.parse.unquote(connection.username)
            db_env['PGPASSWORD'] = urllib.parse.unquote(connection.password)
            db_env['PGDATABASE'] = urllib.parse.unquote(connection.path.lstrip('/')) or 'postgres'
        except ValueError:
            raise BackupError('Invalid connection string. Use the full Session pooler URL; special password characters such as # must be percent-encoded.') from None
        db_env['PGSSLMODE'] = 'require'
        db_env['PGCONNECT_TIMEOUT'] = '30'
        docker = ['docker', 'run', '--rm', '-i']
        for variable in ['PGHOST','PGPORT','PGUSER','PGPASSWORD','PGDATABASE','PGSSLMODE','PGCONNECT_TIMEOUT']:
            docker.extend(['-e',variable])
        docker.append('postgres:17')
        print('Exporting public, auth and storage database schemas…', flush=True)
        with database.open('wb') as f:
            run(docker + ['pg_dump', '--format=custom', '--no-owner', '--no-privileges', '--schema=public', '--schema=auth', '--schema=storage'], env=db_env, output=f)
        if database.stat().st_size < 100:
            raise BackupError('Database dump is empty.')
        # Verify the archive is readable without touching the live database.
        with database.open('rb') as f:
            result = subprocess.run(['docker', 'run', '--rm', '-i', 'postgres:17', 'pg_restore', '--list'], stdin=f, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if result.returncode or b'TABLE DATA public equipment' not in result.stdout:
            raise BackupError('Database dump validation failed: equipment table data is missing.')
        with (root / 'source.tar').open('wb') as f:
            run(['git', 'archive', '--format=tar', 'HEAD'], output=f)
        storage = export_storage(root, inventory)
        now = dt.datetime.now(dt.timezone.utc)
        metadata = {'created_at': now.isoformat(), 'project': 'eaehrhqsqmlcjcuzeyoh',
                    'commit': os.environ.get('GITHUB_SHA'), 'database_sha256': sha256(database),
                    'source_sha256': sha256(root / 'source.tar'),
                    'database_schemas': ['public', 'auth', 'storage'],
                    'storage_file_bytes_included': True, 'storage': storage,
                    'limitations': ['Database and Storage exports are sequential, not a single transactional snapshot.',
                                    'Restore into a compatible Supabase project; managed roles/extensions/platform settings are not included.',
                                    'Archive readability verified; a full restore rehearsal is still required.']}
        (root / 'manifest.json').write_text(json.dumps(metadata, indent=2))
        bundle = root / 'backup.tar.gz'
        with tarfile.open(bundle, 'w:gz') as tar:
            for name in ['database.dump', 'source.tar', 'manifest.json', 'storage']:
                tar.add(root / name, arcname=name)
        expected = sha256(bundle)
        filename = 'forged-pm/' + now.strftime('%Y/%m/%Y%m%dT%H%M%SZ') + '-' + os.environ.get('GITHUB_RUN_ID', 'manual') + '-' + os.environ.get('GITHUB_RUN_ATTEMPT', '1') + '.tar.gz'
        upload = request_json(api['apiUrl'] + '/b2api/v2/b2_get_upload_url', token, {'bucketId': bucket_id})
        # Current project backups are small. Fail explicitly before memory-heavy uploads.
        if bundle.stat().st_size > 512 * 1024 * 1024:
            raise BackupError('Backup exceeds 512 MiB; multipart streaming upload must be configured.')
        data = bundle.read_bytes()
        headers = {'Authorization': upload['authorizationToken'], 'Content-Type': 'application/gzip',
                   'X-Bz-File-Name': urllib.parse.quote(filename, safe='/'),
                   'X-Bz-Content-Sha1': hashlib.sha1(data).hexdigest(), 'X-Bz-Server-Side-Encryption': 'AES256'}
        try:
            with urllib.request.urlopen(urllib.request.Request(upload['uploadUrl'], data=data, headers=headers), timeout=300) as r:
                saved = json.load(r)
            url = api['downloadUrl'] + '/b2api/v2/b2_download_file_by_id?' + urllib.parse.urlencode({'fileId': saved['fileId']})
            with urllib.request.urlopen(urllib.request.Request(url, headers={'Authorization': token}), timeout=300) as response:
                h = hashlib.sha256()
                for block in iter(lambda: response.read(1024 * 1024), b''):
                    h.update(block)
            if h.hexdigest() != expected:
                raise BackupError('Backblaze download verification failed.')
        except urllib.error.HTTPError as e:
            raise BackupError(f'Backblaze upload/verification returned HTTP {e.code}.') from None
        summary = f"Database + source + Storage backup uploaded and download checksum verified.\n\nSize: {len(data):,} bytes.\n\nStorage files included: {storage['file_count']}.\n"
        print(summary)
        if os.environ.get('GITHUB_STEP_SUMMARY'):
            with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as f:
                f.write('## Off-site database backup\n\n' + summary)


if __name__ == '__main__':
    try:
        main()
    except BackupError as error:
        print(f'::error::{error}', file=sys.stderr)
        sys.exit(1)
    except Exception:
        print('::error::Backup failed; sensitive exception details suppressed. Check network access and configured secrets.', file=sys.stderr)
        sys.exit(1)
