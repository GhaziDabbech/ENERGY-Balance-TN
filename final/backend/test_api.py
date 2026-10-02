import urllib.request
import json

BASE = "http://localhost:8000/api/v1"

# ── Test 1: health ──────────────────────────────────────────────────────────
r = urllib.request.urlopen("http://localhost:8000/health")
health = json.loads(r.read())
print("HEALTH:", health)

# ── Test 2: login as dn.admin ───────────────────────────────────────────────
data = json.dumps({"username": "dn.admin", "password": "admin1234"}).encode()
req  = urllib.request.Request(f"{BASE}/auth/login", data=data, headers={"Content-Type": "application/json"})
r    = urllib.request.urlopen(req)
auth = json.loads(r.read())
token = auth["access_token"]
print("LOGIN OK — token:", token[:50], "...")

# ── Test 3: GET /auth/me ────────────────────────────────────────────────────
req = urllib.request.Request(f"{BASE}/auth/me", headers={"Authorization": f"Bearer {token}"})
r   = urllib.request.urlopen(req)
me  = json.loads(r.read())
print("ME:", me)

# ── Test 4: GET /feeders (login as bcc.3) ───────────────────────────────────
data  = json.dumps({"username": "bcc.3", "password": "bcc31234"}).encode()
req   = urllib.request.Request(f"{BASE}/auth/login", data=data, headers={"Content-Type": "application/json"})
r     = urllib.request.urlopen(req)
bcc_token = json.loads(r.read())["access_token"]
print("BCC LOGIN OK")

req      = urllib.request.Request(f"{BASE}/feeders", headers={"Authorization": f"Bearer {bcc_token}"})
r        = urllib.request.urlopen(req)
feeders  = json.loads(r.read())
print(f"FEEDERS: {len(feeders)} returned")
print("  First feeder:", feeders[0]["ref"], feeders[0]["nom"], feeders[0]["priority"])

# ── Test 5: GET /kpis/national ──────────────────────────────────────────────
req  = urllib.request.Request(f"{BASE}/kpis/national", headers={"Authorization": f"Bearer {token}"})
r    = urllib.request.urlopen(req)
kpis = json.loads(r.read())
print("NATIONAL KPIs:", kpis)

print("\n=== ALL TESTS PASSED ===")
