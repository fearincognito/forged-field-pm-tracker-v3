#!/usr/bin/env python3
"""V3 scheduled PM threshold alerts. Sends only with explicitly provisioned secrets.
No access to V2. Never logs credentials, endpoint keys or recipient addresses.
"""
import datetime as dt
import hashlib
import json
import os
import sys
from urllib.parse import urlencode
from zoneinfo import ZoneInfo

PACIFIC=ZoneInfo("America/Los_Angeles")
APP_URL="https://fearincognito.github.io/forged-field-pm-tracker-v3/"
def estimate(equipment,site,today):
    actual=equipment["current_hours"]
    if actual is None:return None
    actual=float(actual)
    daily=float(equipment["operating_hours_per_day"] or 0)
    if not daily or not equipment["hours_recorded_at"] or equipment["archived"] or equipment["status"]=="out_of_service":return actual
    anchor=site["rotation_anchor_date"]
    kind=site["rotation_type"]
    rotation={"14_7":(14,7),"20_10":(20,10)}.get(kind)
    if kind=="custom":
        a,b=site["rotation_on_days"],site["rotation_off_days"]
        if a and b and a>0 and b>0:rotation=(a,b)
    if rotation and not anchor:return actual
    first=equipment["hours_recorded_at"].astimezone(PACIFIC).date()
    day=first
    days=0
    while day<today:
        if not rotation or ((day-anchor).days%sum(rotation))<rotation[0]:days+=1
        day+=dt.timedelta(days=1)
    return round(actual+days*daily,1)

def tier(remaining,today=None):
    if remaining<=0:return "due"
    if remaining<=20:return "20"
    if remaining<=50:return "50"
    return None

def send_email(to,subject,body,event_id):
    import requests
    headers={"Authorization":"Bearer "+os.environ["RESEND_API_KEY"],"Content-Type":"application/json","Idempotency-Key":f"forged-pm-v3-{event_id}"}
    # Resend only receives the correct destination's email (never logged).
    response=requests.post("https://api.resend.com/emails",headers=headers,json={
      "from":os.environ["PM_EMAIL_FROM"],"to":[to],"subject":subject,"text":body},timeout=25)
    response.raise_for_status()

def pm_schedule_url(record):
    return "./?" + urlencode({
        "pm_equipment": record["equipment_id"],
        "pm_site": record["site_id"],
        "pm_schedule": record["schedule_id"],
    })

def send_push(sub,title,body,tag,url="./"):
    from pywebpush import webpush
    webpush(subscription_info={"endpoint":sub["endpoint"],"keys":{"p256dh":sub["p256dh"],"auth":sub["auth_secret"]}},
            data=json.dumps({"title":title,"body":body,"tag":tag,"url":url}),
            vapid_private_key=os.environ["VAPID_PRIVATE_KEY"],
            vapid_claims={"sub":os.environ["VAPID_SUBJECT"]},ttl=86400)

def reserve(conn,user,schedule,due,level,channel,destination):
    # One event per recipient, schedule cycle, severity and channel/device.
    with conn.cursor() as cur:
        cur.execute("""INSERT INTO public.pm_notification_delivery
          (user_id,schedule_id,due_hours,level,channel,destination_key,status)
          VALUES (%s,%s,%s,%s,%s,%s,'pending')
          ON CONFLICT (user_id,schedule_id,due_hours,level,channel,destination_key)
          DO UPDATE SET status='pending',error_code=NULL
          WHERE pm_notification_delivery.status='failed'
          RETURNING id""",(user,schedule,due,level,channel,destination))
        row=cur.fetchone()
    conn.commit()
    return row["id"] if row else None

def mark(conn,id,status,error=None):
    with conn.cursor() as cur:
        cur.execute("UPDATE public.pm_notification_delivery SET status=%s,sent_at=CASE WHEN %s='sent' THEN now() ELSE NULL END,error_code=%s WHERE id=%s",
                    (status,status,error,id))
    conn.commit()

def main(dry_run=False):
    needed=("SUPABASE_DB_URL","RESEND_API_KEY","PM_EMAIL_FROM","VAPID_PRIVATE_KEY","VAPID_SUBJECT")
    if dry_run: needed=("SUPABASE_DB_URL",)
    missing=[x for x in needed if not os.getenv(x)]
    if missing:
        print("NOT READY: PM notification provider secrets are missing: "+", ".join(missing))
        return 2
    import psycopg
    from psycopg.rows import dict_row
    import requests
    import pywebpush
    today=dt.datetime.now(PACIFIC).date()
    # All SELECTs use the existing V3 database only.
    with psycopg.connect(os.environ["SUPABASE_DB_URL"],row_factory=dict_row) as conn:
        if dry_run: conn.execute("SET TRANSACTION READ ONLY")
        with conn.cursor() as cur:
            cur.execute("""SELECT s.id schedule_id,s.service_name,s.next_due_hours,
                e.id equipment_id,e.unit_number,e.name equipment_name,e.current_hours,
                e.operating_hours_per_day,e.hours_recorded_at,e.archived,e.status,
                si.id site_id,si.name site_name,si.rotation_type,si.rotation_on_days,
                si.rotation_off_days,si.rotation_anchor_date
                FROM public.pm_schedules s JOIN public.equipment e ON e.id=s.equipment_id
                JOIN public.sites si ON si.id=e.site_id
                WHERE s.active=true AND s.next_due_hours IS NOT NULL
                AND e.archived=false AND si.archived=false""")
            records=cur.fetchall()
            cur.execute("""SELECT p.id,p.role,u.email,
                coalesce(pref.email_enabled,true) email_enabled,
                coalesce(pref.push_enabled,true) push_enabled
                FROM public.profiles p JOIN auth.users u ON u.id=p.id
                LEFT JOIN public.pm_notification_preferences pref ON pref.user_id=p.id
                WHERE p.active=true AND p.role::text IN ('owner','admin','mechanic')
                AND u.email IS NOT NULL""")
            recipients=cur.fetchall()
            cur.execute("SELECT id,user_id,endpoint,p256dh,auth_secret FROM public.pm_push_subscriptions")
            subscriptions=cur.fetchall()
        by_user={}
        for sub in subscriptions:by_user.setdefault(sub["user_id"],[]).append(sub)
        sent=errors=planned=0
        for rec in records:
            current=estimate(rec,rec,today)
            if current is None:continue
            due=float(rec["next_due_hours"])
            remaining=due-current
            level=tier(remaining,today)
            if not level:continue
            machine=rec["unit_number"] or rec["equipment_name"] or "Equipment"
            label=("DUE / OVERDUE" if remaining<=0 else str(round(remaining,1))+" hours remaining")
            title=f"PM {label}: {machine}"
            body=f"Site: {rec['site_name']}\nEquipment: {machine}\nService: {rec['service_name']}\nDue at: {due:g} hours\nCurrent estimated: {current:g} hours\nRemaining: {remaining:.1f} hours\nOpen: {APP_URL}"
            for user in recipients:
                jobs=[]
                if user["email_enabled"]:jobs.append(("email","email",None))
                if user["push_enabled"]:
                    for sub in by_user.get(user["id"],[]):
                        jobs.append(("push",str(sub["id"]),sub))
                for channel,dest,sub in jobs:
                    # do not emit the same threshold/due-cycle twice on repeated cron runs.
                    if dry_run:
                        with conn.cursor() as cur:
                            cur.execute("""SELECT status FROM public.pm_notification_delivery
                                WHERE user_id=%s AND schedule_id=%s AND due_hours=%s
                                AND level=%s AND channel=%s AND destination_key=%s""",
                                (user["id"],rec["schedule_id"],rec["next_due_hours"],level,channel,dest))
                            existing=cur.fetchone()
                        if existing is None or existing["status"]=="failed": planned+=1
                        continue
                    identity=reserve(conn,user["id"],rec["schedule_id"],rec["next_due_hours"],level,channel,dest)
                    if identity is None:continue
                    try:
                        if channel=="email":send_email(user["email"],title,body,identity)
                        else:
                            target = pm_schedule_url(rec)
                            push_title = f"{machine}: {rec['service_name']}"
                            push_body = f"PM {label} · {rec['site_name']} · Due at {due:g} hrs"
                            send_push(sub,push_title,push_body,f"{rec['schedule_id']}:{due:g}:{level}",target)
                        mark(conn,identity,"sent")
                        sent+=1
                    except Exception as exc:
                        # Rejected deliveries can be retried next run. Never log sensitive exception bodies.
                        mark(conn,identity,"failed",type(exc).__name__[:80])
                        errors+=1
        if dry_run:
            print(f"PM dry run: schedules={len(records)}, recipients={len(recipients)}, would_deliver={planned}; no sends or delivery writes")
            return 0
        print(f"PM alerts: schedules={len(records)}, recipients={len(recipients)}, delivered={sent}, failed={errors}")
        return 1 if errors else 0

if __name__=="__main__":
    import argparse
    parser=argparse.ArgumentParser()
    parser.add_argument("--dry-run",action="store_true")
    args=parser.parse_args()
    try:sys.exit(main(dry_run=args.dry_run))
    except Exception as exc:
        print("PM notifier failed: "+type(exc).__name__)
        sys.exit(1)

