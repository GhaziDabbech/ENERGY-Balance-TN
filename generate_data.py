from supabase import create_client
import random

url = "http://127.0.0.1:54321"
key = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH"

supabase = create_client(url, key)

# The 2 regional centers (CRC)
crcs = ["nord", "sud"]

# Generate 7 BCC (local control bureaus) — 4 in the North, 3 in the South
bcc_list = []
bcc_names_nord = ["BCC_Tunis", "BCC_Ariana", "BCC_Bizerte", "BCC_Nabeul"]
bcc_names_sud = ["BCC_Sfax", "BCC_Gabes", "BCC_Medenine"]

for i, name in enumerate(bcc_names_nord):
    bcc_list.append({
        "temp_id": f"bcc_{i+1}",
        "name": name,
        "crc": "nord",
        "avg_load_mw": round(random.uniform(30, 80), 1)
    })

for i, name in enumerate(bcc_names_sud):
    bcc_list.append({
        "temp_id": f"bcc_{len(bcc_names_nord)+i+1}",
        "name": name,
        "crc": "sud",
        "avg_load_mw": round(random.uniform(30, 80), 1)
    })

# Generate 18 zones, spread across the 7 BCCs
zone_list = []
zone_names = [
    "Ariana Ville", "Ettadhamen", "La Soukra", "Menzah", "Bardo",
    "Ras Tabia", "Bizerte Nord", "Menzel Bourguiba", "Mateur",
    "Hammamet", "Nabeul Ville", "Kelibia",
    "Sfax Sud", "Sfax Nord", "Sakiet Ezzit",
    "Gabes Ville", "Gabes Ouest",
    "Medenine Centre"
]

for i, name in enumerate(zone_names):
    random_bcc = random.choice(bcc_list)
    zone_list.append({
        "temp_id": f"zone_{i+1}",
        "name": name,
        "delegation": name,
        "crc": random_bcc["crc"],
        "bcc_temp_id": random_bcc["temp_id"],
        "latitude": round(random.uniform(33.0, 37.5), 4),
        "longitude": round(random.uniform(8.0, 11.5), 4)
    })

# Generate 45 feeders, spread across the 18 zones
feeder_list = []
num_feeders = 45

for i in range(num_feeders):
    random_zone = random.choice(zone_list)
    matching_bcc_id = random_zone["bcc_temp_id"]

    feeder_list.append({
        "temp_id": f"feeder_{i+1}",
        "name": f"Depart_{random_zone['name'].replace(' ', '')}_{i+1}",
        "zone_temp_id": random_zone["temp_id"],
        "bcc_temp_id": matching_bcc_id,
        "priority_level": random.choices([0,1,2,3,4,5], weights=[5,10,20,30,25,10])[0],
        "avg_load_mw": round(random.uniform(1.0, 8.0), 2),
        "last_cut_at": None,
        "total_cuts_month": 0
    })

print(f"Generated: {len(bcc_list)} BCC, {len(zone_list)} zones, {len(feeder_list)} feeders (in memory)")

# ---------- INSERT BCC (guarded against duplicates) ----------
existing_bcc = supabase.table("bcc").select("id").execute()
if len(existing_bcc.data) > 0:
    print("BCC table already has data — skipping insert to avoid duplicates.")
    response = existing_bcc  # reuse existing rows instead of inserting again
else:
    bcc_to_insert = [
        {"name": b["name"], "crc": b["crc"], "avg_load_mw": b["avg_load_mw"]}
        for b in bcc_list
    ]
    response = supabase.table("bcc").insert(bcc_to_insert).execute()
    print("Inserted BCC:", len(response.data), "rows")

# Build a map: temp_id -> real database id
bcc_id_map = {}
for temp_bcc, real_bcc in zip(bcc_list, response.data):
    bcc_id_map[temp_bcc["temp_id"]] = real_bcc["id"]

print("BCC id map:", bcc_id_map)

# ---------- INSERT ZONES (guarded against duplicates) ----------
existing_zones = supabase.table("zones").select("id").execute()
if len(existing_zones.data) > 0:
    print("Zones table already has data — skipping insert to avoid duplicates.")
    zone_response = existing_zones
else:
    zones_to_insert = [
        {
            "name": z["name"],
            "delegation": z["delegation"],
            "crc": z["crc"],
            "bcc_id": bcc_id_map[z["bcc_temp_id"]],
            "latitude": z["latitude"],
            "longitude": z["longitude"]
        }
        for z in zone_list
    ]
    zone_response = supabase.table("zones").insert(zones_to_insert).execute()
    print("Inserted zones:", len(zone_response.data), "rows")


# ---------- INSERT FEEDERS (guarded against duplicates) ----------

# Build a map: zone temp_id -> real zone database id
zone_id_map = {}
for temp_zone, real_zone in zip(zone_list, zone_response.data):
    zone_id_map[temp_zone["temp_id"]] = real_zone["id"]

existing_feeders = supabase.table("feeders").select("id").execute()
if len(existing_feeders.data) > 0:
    print("Feeders table already has data — skipping insert to avoid duplicates.")
else:
    feeders_to_insert = [
        {
            "name": f["name"],
            "zone_id": zone_id_map[f["zone_temp_id"]],
            "bcc_id": bcc_id_map[f["bcc_temp_id"]],
            "priority_level": f["priority_level"],
            "avg_load_mw": f["avg_load_mw"],
            "last_cut_at": f["last_cut_at"],
            "total_cuts_month": f["total_cuts_month"]
        }
        for f in feeder_list
    ]
    feeder_response = supabase.table("feeders").insert(feeders_to_insert).execute()
    print("Inserted feeders:", len(feeder_response.data), "rows")