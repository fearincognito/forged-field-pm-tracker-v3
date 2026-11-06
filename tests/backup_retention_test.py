import datetime as dt
import importlib.util
import unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('backup',Path(__file__).resolve().parents[1] / 'scripts' / 'backup_to_b2.py')
b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
UTC=dt.timezone.utc

class RetentionTest(unittest.TestCase):
    def setUp(self):
        self.now=dt.datetime(2026,11,5,12,tzinfo=UTC);self.n=0
    def archive(self,when,verified=True,name=None):
        self.n+=1;ident=str(self.n)
        f={'action':'upload','fileId':ident,'fileName':name or when.strftime('forged-pm/%Y/%m/%Y%m%dT%H%M%SZ-')+ident+'-1.tar.gz','uploadTimestamp':int(when.timestamp()*1000),'fileInfo':{}}
        m={'action':'upload','fileId':'marker'+ident,'fileName':f['fileName']+'.verified.json','uploadTimestamp':f['uploadTimestamp'],'fileInfo':{'backup-file-id':ident}}
        return f,[f,m] if verified else [f]
    def test_daily_boundary_monthly_and_unknown_files(self):
        current,versions=self.archive(self.now)
        boundary,v=self.archive(self.now-dt.timedelta(days=30));versions+=v
        sept1,v=self.archive(dt.datetime(2026,9,1,tzinfo=UTC));versions+=v
        sept2,v=self.archive(dt.datetime(2026,9,30,tzinfo=UTC));versions+=v
        oldest,v=self.archive(dt.datetime(2025,11,30,tzinfo=UTC));versions+=v
        oldest_keep,v=self.archive(dt.datetime(2025,12,1,tzinfo=UTC));versions+=v
        foreign,v=self.archive(dt.datetime(2025,1,1,tzinfo=UTC),name='unrelated/photo.tar.gz');versions+=v
        p=b.retention_plan(versions,self.now,current['fileId']);removed={x['fileId'] for x in p['archives']}
        self.assertIn(sept1['fileId'],removed);self.assertIn(oldest['fileId'],removed)
        for f in [current,boundary,sept2,oldest_keep,foreign]:self.assertNotIn(f['fileId'],removed)
        self.assertEqual(len(p['markers']),2)
    def test_verified_monthly_preferred_to_unverified(self):
        current,versions=self.archive(self.now)
        good,v=self.archive(dt.datetime(2026,8,1,tzinfo=UTC));versions+=v
        bad,v=self.archive(dt.datetime(2026,8,31,tzinfo=UTC),verified=False);versions+=v
        p=b.retention_plan(versions,self.now,current['fileId'])
        self.assertEqual([x['fileId'] for x in p['archives']],[bad['fileId']])
    def test_no_deletion_without_current_verification(self):
        current,versions=self.archive(self.now,verified=False)
        with self.assertRaises(b.BackupError):b.retention_plan(versions,self.now,current['fileId'])
    def test_duplicate_versions_and_calendar_year(self):
        self.now=dt.datetime(2027,1,15,tzinfo=UTC)
        current,versions=self.archive(self.now)
        old,v=self.archive(dt.datetime(2026,2,1,tzinfo=UTC));versions+=v
        newer,v=self.archive(dt.datetime(2026,2,28,tzinfo=UTC),name=old['fileName']);versions+=v
        p=b.retention_plan(versions,self.now,current['fileId'])
        self.assertEqual([x['fileId'] for x in p['archives']],[old['fileId']])

if __name__=='__main__':unittest.main()
