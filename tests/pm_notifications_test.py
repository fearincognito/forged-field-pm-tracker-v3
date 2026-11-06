import datetime as dt
import importlib.util
import pathlib
import unittest
from zoneinfo import ZoneInfo

spec=importlib.util.spec_from_file_location("pm_notifications",pathlib.Path(__file__).resolve().parents[1]/"scripts"/"pm_notifications.py")
pm=importlib.util.module_from_spec(spec)
spec.loader.exec_module(pm)

class PMAlertTests(unittest.TestCase):
    def test_thresholds(self):
        self.assertIsNone(pm.tier(50.1,None))
        self.assertEqual(pm.tier(50,None),"50")
        self.assertEqual(pm.tier(20.1,None),"50")
        self.assertEqual(pm.tier(20,None),"20")
        self.assertEqual(pm.tier(.1,None),"20")
        self.assertEqual(pm.tier(0,None),"due")
        self.assertEqual(pm.tier(-12,None),"due")

    def test_rotation_and_estimate(self):
        pacific=ZoneInfo("America/Los_Angeles")
        first=dt.datetime(2026,10,1,12,0,tzinfo=pacific)
        machine={"current_hours":100,"operating_hours_per_day":1.5,
          "hours_recorded_at":first,"archived":False,"status":"active"}
        site={"rotation_type":"14_7","rotation_on_days":None,"rotation_off_days":None,
          "rotation_anchor_date":dt.date(2026,10,1)}
        self.assertEqual(pm.estimate(machine,site,dt.date(2026,10,2)),101.5)
        self.assertEqual(pm.estimate(machine,site,dt.date(2026,10,22)),121)
        machine["status"]="out_of_service"
        self.assertEqual(pm.estimate(machine,site,dt.date(2026,10,22)),100)

    def test_missing_baseline(self):
        machine={"current_hours":500,"operating_hours_per_day":8,
          "hours_recorded_at":None,"archived":False,"status":"active"}
        site={"rotation_type":"14_7","rotation_anchor_date":None,
          "rotation_on_days":None,"rotation_off_days":None}
        self.assertEqual(pm.estimate(machine,site,dt.date(2026,11,5)),500)

if __name__=="__main__":
    unittest.main()
