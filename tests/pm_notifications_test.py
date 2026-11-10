import datetime as dt
import importlib.util
import pathlib
import sys
import types
import unittest
from unittest.mock import MagicMock, patch
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

class PMReservationTests(unittest.TestCase):
    def setUp(self):
        self.conn = MagicMock()
        self.cur = self.conn.cursor.return_value.__enter__.return_value

    def reserve(self):
        return pm.reserve(self.conn, "user-1", "schedule-1", 100, "due", "email", "email")

    def test_dictionary_row_returns_reserved_id(self):
        self.cur.fetchone.return_value = {"id": 123}
        self.assertEqual(self.reserve(), 123)
        self.conn.commit.assert_called_once_with()

    def test_existing_pending_or_sent_delivery_is_skipped(self):
        self.cur.fetchone.return_value = None
        self.assertIsNone(self.reserve())
        self.conn.commit.assert_called_once_with()

    def test_only_failed_delivery_is_retryable_with_same_identity(self):
        self.cur.fetchone.return_value = {"id": 123}
        self.assertEqual(self.reserve(), 123)
        sql, params = self.cur.execute.call_args.args
        normalized = " ".join(sql.split())
        self.assertIn("ON CONFLICT (user_id,schedule_id,due_hours,level,channel,destination_key)", normalized)
        self.assertIn("WHERE pm_notification_delivery.status='failed' RETURNING id", normalized)
        self.assertEqual(params, ("user-1", "schedule-1", 100, "due", "email", "email"))


class PMWorkerTests(unittest.TestCase):
    def setUp(self):
        self.conn = MagicMock()
        self.conn.__enter__.return_value = self.conn
        self.cur = self.conn.cursor.return_value.__enter__.return_value
        record = {
            "schedule_id": "schedule-1", "service_name": "Oil service", "next_due_hours": 100,
            "equipment_id": "equipment-1", "unit_number": "TEST-1", "equipment_name": "Test machine",
            "current_hours": 120, "operating_hours_per_day": 0, "hours_recorded_at": None,
            "archived": False, "status": "active", "site_id": "site-1", "site_name": "Test site",
        }
        self.user = {"id": "user-1", "email": "recipient@example.invalid", "email_enabled": True, "push_enabled": True}
        self.subscription = {"id": "device-1", "user_id": "user-1"}
        self.cur.fetchall.side_effect = [[record], [self.user], [self.subscription]]
        self.cur.fetchone.side_effect = [{"id": 101}, {"id": 102}]
        self.psycopg = types.ModuleType("psycopg")
        self.psycopg.connect = MagicMock(return_value=self.conn)
        self.rows = types.ModuleType("psycopg.rows")
        self.rows.dict_row = object()

    def run_worker(self, email_error=None):
        # No real database, credentials, network clients, email or push sends.
        modules = {
            "psycopg": self.psycopg, "psycopg.rows": self.rows,
            "requests": types.ModuleType("requests"), "pywebpush": types.ModuleType("pywebpush"),
        }
        environment = {name: "test-placeholder" for name in (
            "SUPABASE_DB_URL", "RESEND_API_KEY", "PM_EMAIL_FROM", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT")}
        with patch.dict(sys.modules, modules), patch.dict(pm.os.environ, environment, clear=True), \
                patch.object(pm, "send_email", side_effect=email_error) as email, \
                patch.object(pm, "send_push") as push, patch("builtins.print"):
            result = pm.main()
        self.psycopg.connect.assert_called_once_with("test-placeholder", row_factory=self.rows.dict_row)
        return result, email, push

    def test_dictionary_reservations_reach_email_and_push_and_mark_sent(self):
        result, email, push = self.run_worker()
        self.assertEqual(result, 0)
        self.assertEqual(email.call_args.args[0], "recipient@example.invalid")
        self.assertEqual(email.call_args.args[3], 101)
        email.assert_called_once()
        push.assert_called_once()
        self.assertEqual(push.call_args.args[0], self.subscription)
        self.assertEqual(push.call_args.args[3], "schedule-1:100:due")
        self.assertEqual(push.call_args.args[4], "./?pm_equipment=equipment-1&pm_site=site-1&pm_schedule=schedule-1")
        updates = [call.args[1] for call in self.cur.execute.call_args_list if call.args[0].startswith("UPDATE")]
        self.assertEqual(updates, [("sent", "sent", None, 101), ("sent", "sent", None, 102)])

    def test_existing_reservations_do_not_send_duplicates(self):
        self.cur.fetchone.side_effect = [None, None]
        result, email, push = self.run_worker()
        self.assertEqual(result, 0)
        email.assert_not_called()
        push.assert_not_called()
        self.assertFalse(any(call.args[0].startswith("UPDATE") for call in self.cur.execute.call_args_list))

    def test_provider_failure_is_marked_failed_and_other_channel_continues(self):
        result, email, push = self.run_worker(email_error=RuntimeError("test failure"))
        self.assertEqual(result, 1)
        email.assert_called_once()
        push.assert_called_once()
        updates = [call.args[1] for call in self.cur.execute.call_args_list if call.args[0].startswith("UPDATE")]
        self.assertEqual(updates, [("failed", "failed", "RuntimeError", 101), ("sent", "sent", None, 102)])


if __name__=="__main__":
    unittest.main()

