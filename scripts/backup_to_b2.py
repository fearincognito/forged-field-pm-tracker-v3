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


def main():
    required = ['SUPABASE_DB_URL', 'B2_APPLICATION_KEY_ID', 'B2_APPLICATION_KEY', 'B2_BUCKET_NAME']
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
        database = root / 'database.dump'
        db_env = os.environ.copy()
        db_env['PGDATABASE'] = os.environ['SUPABASE_DB_URL']
        db_env['PGSSLMODE'] = 'require'
        db_env['PGCONNECT_TIMEOUT'] = '30'
        docker = ['docker', 'run', '--rm', '-i', '-e', 'PGDATABASE', '-e', 'PGSSLMODE', '-e', 'PGCONNECT_TIMEOUT', 'postgres:17']
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
        now = dt.datetime.now(dt.timezone.utc)
        metadata = {'created_at': now.isoformat(), 'project': 'eaehrhqsqmlcjcuzeyoh',
                    'commit': os.environ.get('GITHUB_SHA'), 'database_sha256': sha256(database),
                    'source_sha256': sha256(root / 'source.tar'),
                    'database_schemas': ['public', 'auth', 'storage'],
                    'storage_file_bytes_included': False,
                    'limitations': ['Storage metadata included; uploaded photo/logo file bytes require a separate Storage backup.',
                                    'Restore into a compatible Supabase project; managed roles/extensions/platform settings are not included.',
                                    'Archive readability verified; a full restore rehearsal is still required.']}
        (root / 'manifest.json').write_text(json.dumps(metadata, indent=2))
        bundle = root / 'backup.tar.gz'
        with tarfile.open(bundle, 'w:gz') as tar:
            for name in ['database.dump', 'source.tar', 'manifest.json']:
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
        summary = f'Database + source backup uploaded and download checksum verified.\n\nSize: {len(data):,} bytes.\n\nUploaded photo/logo bytes are NOT included yet.\n'
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
