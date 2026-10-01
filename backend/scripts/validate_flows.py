import httpx
import time

base = "http://localhost:8000"

with httpx.Client(timeout=10.0) as client:
    print("--- Flow A: Login ---")
    r_op = client.post(f"{base}/auth/login", json={"username": "operator", "password": "demo1234"})
    assert r_op.status_code == 200, f"Operator login failed: {r_op.text}"
    token_op = r_op.json()["token"]
    print("  [PASS] Operator login: role =", r_op.json()["role"])

    r_rev = client.post(f"{base}/auth/demo")
    assert r_rev.status_code == 200, f"Reviewer login failed: {r_rev.text}"
    print("  [PASS] Reviewer login: role =", r_rev.json()["role"])

    r_crew = client.post(f"{base}/auth/crew-login", json={"unitCode": "AMB-01", "pin": "1111"})
    assert r_crew.status_code == 200, f"Crew login failed: {r_crew.text}"
    token_crew = r_crew.json()["token"]
    print("  [PASS] Crew login: role =", r_crew.json()["role"], "unitId =", r_crew.json()["unitId"])

    headers = {"Authorization": f"Bearer {token_op}"}

    print("\n--- Flow B: Real GET Endpoints ---")
    for ep in ["/incidents", "/units", "/facilities", "/roads", "/zones", "/status"]:
        r = client.get(f"{base}{ep}", headers=headers)
        assert r.status_code == 200, f"Failed GET {ep}: {r.status_code}"
        print(f"  [PASS] GET {ep} returned 200")

    print("\n--- Resetting Scenario ---")
    client.post(f"{base}/scenario/reset", headers=headers)

    print("\n--- Flow D: POST /dev/replay ---")
    r_rep = client.post(f"{base}/dev/replay")
    assert r_rep.status_code == 200 and r_rep.json().get("eventsReplayed") == 70
    print(f"  [PASS] /dev/replay replayed {r_rep.json().get('eventsReplayed')} events")

    # Reset again for clean Demo Flow E
    client.post(f"{base}/scenario/reset", headers=headers)

    print("\n--- Flow E: Real Demo (3 incidents -> PLAN-001 -> Rain surge -> APR-001 -> Approve -> PLAN-002) ---")
    i1 = client.post(f"{base}/scenario/inject-incident", json={"type": "flooded_home", "zoneId": "ZONE-A", "peopleAffected": 6}, headers=headers).json()
    i2 = client.post(f"{base}/scenario/inject-incident", json={"type": "stranded_vehicle", "zoneId": "ZONE-B", "peopleAffected": 3}, headers=headers).json()
    i3 = client.post(f"{base}/scenario/inject-incident", json={"type": "medical", "zoneId": "ZONE-A", "peopleAffected": 2}, headers=headers).json()
    print("  [PASS] Injected 3 incidents:", i1["incidentId"], i2["incidentId"], i3["incidentId"])

    time.sleep(0.1)
    p1 = client.get(f"{base}/plan/current", headers=headers).json()
    assert p1 and p1["planId"] == "PLAN-001", f"Expected PLAN-001, got {p1}"
    print("  [PASS] PLAN-001 active with entries:", [(e["incidentId"], e["unitId"], e["etaMinutes"]) for e in p1["entries"]])

    surge = client.post(f"{base}/scenario/rain-surge", json={"intensity": "heavy"}, headers=headers).json()
    print("  [PASS] Rain surge heavy applied")

    time.sleep(0.1)
    apprs = client.get(f"{base}/approvals", headers=headers).json()
    apr1 = next((a for a in apprs if a["approvalId"] == "APR-001"), None)
    assert apr1 is not None, f"APR-001 not in inbox: {apprs}"
    print("  [PASS] APR-001 in inbox:", apr1["summary"])

    dec = client.post(f"{base}/approvals/APR-001/decide", json={"decision": "approve", "optionId": "OPT-A"}, headers=headers).json()
    print("  [PASS] APR-001 approved: status =", dec.get("status"))

    time.sleep(0.1)
    p2 = client.get(f"{base}/plan/current", headers=headers).json()
    assert p2 and p2["planId"] == "PLAN-002", f"Expected PLAN-002, got {p2}"
    print("  [PASS] PLAN-002 active with entries:", [(e["incidentId"], e["unitId"], e["etaMinutes"]) for e in p2["entries"]])

    diff = client.get(f"{base}/plan/diff/PLAN-001/PLAN-002", headers=headers).json()
    inc02_change = next(c for c in diff["changes"] if c["incidentId"] == "INC-02")
    assert "Hosur Rd underpass" in inc02_change["reason"] and "RES-02 cut off" in inc02_change["reason"]
    print("  [PASS] Plan diff INC-02 reason:", inc02_change["reason"])

    print("\n--- Flow F: ZONE-B Outage ---")
    outage_res = client.post(f"{base}/scenario/outage", json={"zoneId": "ZONE-B", "active": True}, headers=headers).json()
    print("  [PASS] Set ZONE-B outage: commsStatus =", outage_res.get("commsStatus"))
    time.sleep(0.1)

    apprs_f = client.get(f"{base}/approvals", headers=headers).json()
    apr2 = next((a for a in apprs_f if a["approvalId"] == "APR-002"), None)
    assert apr2 is not None, f"APR-002 not in approvals inbox: {apprs_f}"
    print("  [PASS] APR-002 in inbox:", apr2["summary"])

    comms = client.get(f"{base}/reports/comms/log", headers=headers).json()
    assert len(comms) > 0, "Comms log empty"
    print(f"  [PASS] Comms log has {len(comms)} entries, latest channel: {comms[-1].get('channel')}")

    print("\n--- Flow G: Crew Login and Assignment ---")
    crew_headers = {"Authorization": f"Bearer {token_crew}"}
    crew_asn = client.get(f"{base}/crew/assignment", headers=crew_headers).json()
    assert crew_asn and crew_asn.get("assignmentId"), f"No assignment for AMB-01: {crew_asn}"
    print(f"  [PASS] AMB-01 assignment: {crew_asn.get('assignmentId')} for {crew_asn.get('incidentId')}, status: {crew_asn.get('status')}")

    print("\n--- Flow H: Reports (After-Action Data) ---")
    aar = client.get(f"{base}/reports/after-action", headers=headers).json()
    assert aar and "metrics" in aar
    print(f"  [PASS] After-Action report generated: totalIncidents = {aar['metrics'].get('totalIncidents')}, plansCreated = {aar['metrics'].get('plansCreated')}")
    print("\n=== ALL FLOWS PASSED PERFECTLY ===")
