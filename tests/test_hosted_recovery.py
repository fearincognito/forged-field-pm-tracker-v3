import os
import sys
import unittest
import json,base64,tempfile
from unittest.mock import patch
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import hosted_recovery_test as h
from hosted_recovery_test import target_environment,scrub,TARGET,PRODUCTION,BackupError
class Guards(unittest.TestCase):
    def test_direct_target(self):
        self.assertEqual(target_environment('postgresql://postgres:test@db.'+TARGET+'.supabase.co:5432/postgres')['PGHOST'],'db.'+TARGET+'.supabase.co')
    def test_password_only_connection(self):
        with patch.dict(os.environ,{'RECOVERY_SUPABASE_DB_PASSWORD':'p@ss:word/with?chars'},clear=True):
            value=h.target_environment(h.connection_url())
        self.assertEqual(value['PGPASSWORD'],'p@ss:word/with?chars')
        self.assertEqual(value['PGHOST'],'aws-1-us-west-1.pooler.supabase.com')
    def test_pool_target(self):
        self.assertEqual(target_environment('postgresql://postgres.'+TARGET+':test@aws-0-us-west-1.pooler.supabase.com:5432/postgres')['PGUSER'],'postgres.'+TARGET)
    def test_forbidden_targets(self):
        for url in ['postgresql://postgres:x@db.'+PRODUCTION+'.supabase.co/postgres','postgresql://postgres:x@attacker.test/postgres','postgresql://postgres.'+PRODUCTION+':x@aws-0-us-west-1.pooler.supabase.com/postgres','postgresql://postgres:x@db.'+TARGET+'.supabase.co/postgres?host=attacker.test','postgresql://postgres.'+TARGET+':x@evilpooler.supabase.com/postgres','postgresql://postgres:x@db.'+TARGET+'.supabase.co:6543/postgres','postgresql://postgres:x@db.'+TARGET+'.supabase.co/other']:
            with self.subTest(url=url):
                with self.assertRaises(BackupError): target_environment(url)
    def test_nested_scrub(self):
        x={'name':'Real Name','nested':['abc@domain.com','call 555-333-4444','https://'+PRODUCTION+'.supabase.co/x']}
        y=scrub(x,['Real Name'])
        self.assertEqual(y['name'],'Recovery Account')
        self.assertEqual(y['nested'][0],'redacted@example.invalid')
        self.assertNotIn('555',y['nested'][1]);self.assertIn(TARGET,y['nested'][2])
    def test_credentials_rejected(self):
        for value in ['ghp_example','sb_secret_example','github_pat_example']:
            with self.assertRaises(BackupError):scrub(value,[])
    def test_browser_network_guard(self):
        source=(Path(__file__).resolve().parents[1]/'scripts/hosted_recovery_browser.cjs').read_text()
        self.assertIn("serviceWorkers:'block'",source)
        self.assertIn("routeWebSocket('**/*',ws=>ws.close())",source)
        self.assertIn("url.origin==='http://127.0.0.1:55300'",source)
        self.assertNotIn("url.hostname===",source)
    def test_non_text(self):self.assertEqual(scrub([None,True,1,3.4],[]),[None,True,1,3.4])
    def test_no_scheduled_trigger_or_production_keys(self):
        text=(Path(__file__).resolve().parents[1]/'.github/workflows/hosted-recovery-test.yml').read_text()
        self.assertNotIn('schedule:',text);self.assertNotIn('push:',text)
        self.assertNotIn('secrets.SUPABASE_DB_URL',text);self.assertNotIn('secrets.SUPABASE_SERVICE_ROLE_KEY',text)
        self.assertNotIn('upload-artifact',text)
    def test_json_key_redaction(self):
        self.assertEqual(scrub({'Someone@place.com':'Real Name'},['Real Name']),{'redacted@example.invalid':'Recovery Account'})
    def test_denial_not_server_error(self):
        body=json.dumps({'code':'42501'}).encode()
        self.assertTrue(h.permission_denied(403,body))
        for status in [400,404,500,503]:self.assertFalse(h.permission_denied(status,body))
        exact=json.dumps({'code':'P0001','message':'Only maintainers can record service'}).encode()
        self.assertTrue(h.permission_denied(400,exact,'Only maintainers can record service'))
        self.assertFalse(h.permission_denied(500,exact,'Only maintainers can record service'))
    def test_command_diagnostics_suppressed(self):
        class Failed: returncode=1;stdout=b'';stderr=b'ERROR: password=private-secret'
        with patch.object(h.subprocess,'run',return_value=Failed()):
            with self.assertRaises(BackupError) as e:h.command(['test'])
        self.assertNotIn('private-secret',str(e.exception))
    def test_cleanup_on_failure(self):
        with patch.object(h,'sql') as sql:
            with self.assertRaisesRegex(ValueError,'simulated'):
                with h.disable_after_test():raise ValueError('simulated')
        sql.assert_called_once_with('update public.profiles set active=false;')
    def test_api_key_failure_before_write(self):
        claims=base64.urlsafe_b64encode(json.dumps({'ref:':'unused','ref':TARGET,'role':'service_role'}).encode()).decode().rstrip('=')
        env={'RECOVERY_SUPABASE_DB_URL':'postgresql://postgres:test@db.'+TARGET+'.supabase.co/postgres','RECOVERY_SUPABASE_SERVICE_ROLE_KEY':'eyJ.'+claims+'.test'}
        seen=[]
        with tempfile.TemporaryDirectory() as td,patch.dict(os.environ,env,clear=True),patch.object(h,'api',return_value=(401,b'{}')),patch.object(h,'command',side_effect=AssertionError('must not restore')),patch.object(h,'sql',side_effect=lambda q:seen.append(q) or '0'):
            with self.assertRaises(BackupError):h.hosted(Path(td),Path(td),'isolated',['psql'],{'objects':[]})
        self.assertTrue(all(q.startswith('select') for q in seen))
    def test_reviewed_text_types_and_procedures(self):
        source=(Path(__file__).resolve().parents[1]/'scripts/hosted_recovery_test.py').read_text()
        self.assertIn("'character varying','character'",source)
        self.assertIn("p.prokind in ('f','p')",source)
if __name__=='__main__':unittest.main()
