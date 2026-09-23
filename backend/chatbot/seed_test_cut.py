"""Inserts ONE active power cut (started 10 min ago, ends in 35 min)
for the first zone that has feeders, so get_zone_schedule can be tested.
Prints the zone_id to paste into tools.py."""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from functions import supabase
from datetime import datetime, timedelta, timezone

feeder = supabase.table("feeders").select("id,zone_id,bcc_id").gt("priority_level", 0).limit(1).execute().data[0]
zone = supabase.table("zones").select("id,name,crc").eq("id", feeder["zone_id"]).execute().data[0]

now = datetime.now(timezone.utc).replace(tzinfo=None)  # DB stores UTC without timezone
row = {
    "date": now.date().isoformat(),
    "time_slot_start": (now - timedelta(minutes=10)).isoformat(),
    "time_slot_end": (now + timedelta(minutes=35)).isoformat(),
    "crc": zone["crc"],
    "bcc_id": feeder["bcc_id"],
    "feeder_id": feeder["id"],
    "status": "active",
}
supabase.table("program_schedule").insert(row).execute()

print(f"Inserted active cut for zone: {zone['name']}")
print(f"zone_id to test with: {zone['id']}")