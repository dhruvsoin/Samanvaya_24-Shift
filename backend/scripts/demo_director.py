"""
demo_director.py — Interactive or automated demo flow director for recording the Samanvaya 3-minute video.

Usage:
  # To reset before recording:
  python scripts/demo_director.py --reset

  # Interactive mode (Press Enter to trigger each beat):
  python scripts/demo_director.py

  # Automated mode (runs with the exact timed beats for the video):
  python scripts/demo_director.py --auto
"""
import argparse
import sys
import time
import httpx

BASE = "http://localhost:8000"


def get_operator_token(client: httpx.Client) -> str:
    r = client.post(f"{BASE}/auth/login", json={"username": "operator", "password": "demo1234"})
    if r.status_code != 200:
        print(f"[!] Login failed: {r.text}")
        sys.exit(1)
    return r.json()["token"]


def reset_scenario(client: httpx.Client, headers: dict) -> None:
    r = client.post(f"{BASE}/scenario/reset", headers=headers)
    print(">>> [RESET] Scenario reset to baseline state. Clock at 09:00:00. Log cleared.")


def step_1_incidents(client: httpx.Client, headers: dict) -> None:
    print("\n=======================================================")
    print("BEAT 1 (0:20 - 0:50): INCIDENTS ARRIVE")
    print("Injecting 3 seed incidents (INC-01 Kannada flooded home, INC-02 stranded vehicle, INC-03 medical)...")
    print("=======================================================")
    i1 = client.post(f"{BASE}/scenario/inject-incident", json={
        "type": "flooded_home", "zoneId": "ZONE-A", "peopleAffected": 6, "language": "kn"
    }, headers=headers).json()
    print(f"  [+] Injected INC-01 (Kannada, Flooded Home, 6 people)")
    time.sleep(0.5)

    i2 = client.post(f"{BASE}/scenario/inject-incident", json={
        "type": "stranded_vehicle", "zoneId": "ZONE-B", "peopleAffected": 3, "language": "en"
    }, headers=headers).json()
    print(f"  [+] Injected INC-02 (Stranded Vehicle, 3 people)")
    time.sleep(0.5)

    i3 = client.post(f"{BASE}/scenario/inject-incident", json={
        "type": "medical", "zoneId": "ZONE-A", "peopleAffected": 2, "language": "en"
    }, headers=headers).json()
    print(f"  [+] Injected INC-03 (Critical Medical Emergency)")
    print(">>> Map and Queue fill. Agent stream shows Intake and Assessment scoring.")


def step_2_plan1(client: httpx.Client, headers: dict) -> None:
    print("\n=======================================================")
    print("BEAT 2 (0:50 - 1:20): PLAN-001 PUBLISHED")
    print("Checking PLAN-001 initial solver allocation...")
    print("=======================================================")
    p1 = None
    for _ in range(20):
        res = client.get(f"{BASE}/plan/current", headers=headers)
        if res.status_code == 200 and res.json() and res.json().get("planId") == "PLAN-001":
            p1 = res.json()
            break
        time.sleep(0.2)
    if p1:
        print(f"  [+] Active Plan: {p1['planId']} with {len(p1['entries'])} assignments:")
        for e in p1["entries"]:
            print(f"      - {e['incidentId']} -> {e['unitId']} (ETA {e['etaMinutes']}m, range {e.get('etaRange')})")
    print(">>> Point to Map routes and assignment chips in UI.")


def step_3_rain_surge_and_approval(client: httpx.Client, headers: dict) -> None:
    print("\n=======================================================")
    print("BEAT 3 (1:20 - 2:00): RAIN SURGE & PLAN-002 APPROVAL")
    print("Triggering heavy rain surge -> ROAD-04 underpass closes...")
    print("=======================================================")
    client.post(f"{BASE}/scenario/rain-surge", json={"intensity": "heavy"}, headers=headers)
    print("  [+] Rain surge HEAVY applied. ROAD-04 closed. ETAs recomputed.")
    
    # Wait for APR-001
    apr1 = None
    for _ in range(20):
        apprs = client.get(f"{BASE}/approvals", headers=headers).json()
        apr1 = next((a for a in apprs if a.get("approvalId") == "APR-001"), None)
        if apr1:
            break
        time.sleep(0.2)
    
    if apr1:
        print(f"  [+] APR-001 generated: {apr1.get('summary')}")
        print(">>> Switch to Approvals Inbox in UI to show APR-001.")
        time.sleep(1.0)
        print(">>> Approving APR-001 (reassigning RES-01 to INC-02)...")
        dec = client.post(f"{BASE}/approvals/APR-001/decision", json={"decision": "approve", "optionId": "OPT-A"}, headers=headers).json()
        print(f"  [+] APR-001 Approved: status = {dec.get('status')}")
    
    # Wait for PLAN-002
    p2 = None
    for _ in range(20):
        res = client.get(f"{BASE}/plan/current", headers=headers)
        if res.status_code == 200 and res.json() and res.json().get("planId") == "PLAN-002":
            p2 = res.json()
            break
        time.sleep(0.2)
    if p2:
        print(f"  [+] PLAN-002 published! Check Plan Diff view.")
        diff = client.get(f"{BASE}/plan/diff?from=PLAN-001&to=PLAN-002", headers=headers).json()
        for c in (diff if isinstance(diff, list) else []):
            print(f"      - {c.get('incidentId')}: {c.get('change')} | {c.get('reason')}")


def step_4_zone_b_outage(client: httpx.Client, headers: dict) -> None:
    print("\n=======================================================")
    print("BEAT 4 (2:00 - 2:30): ZONE-B COMMS OUTAGE & FALLBACK")
    print("Triggering cell tower outage in ZONE-B...")
    print("=======================================================")
    client.post(f"{BASE}/scenario/outage", json={"zoneId": "ZONE-B", "active": True}, headers=headers)
    print("  [+] Outage active in ZONE-B. Network degraded.")
    print("  [+] Channel dispatcher switched active units in Zone B to SMS channel.")
    
    # Check APR-002
    apprs = client.get(f"{BASE}/approvals", headers=headers).json()
    apr2 = next((a for a in apprs if a.get("approvalId") == "APR-002"), None)
    if apr2:
        print(f"  [+] APR-002 in inbox: {apr2.get('summary')}")
    print(">>> Show Comms Log with SMS switch and check-in message.")


def step_5_close_and_report(client: httpx.Client, headers: dict) -> None:
    print("\n=======================================================")
    print("BEAT 5 (2:30 - 3:00): CLOSE MISSIONS & AFTER-ACTION AUDIT")
    print("Closing missions and checking After-Action benchmarks...")
    print("=======================================================")
    for inc_id in ["INC-01", "INC-02", "INC-03"]:
        client.post(f"{BASE}/incidents/close", json={"incidentId": inc_id, "outcome": "resolved"}, headers=headers)
    print("  [+] Missions marked resolved.")
    aar = client.get(f"{BASE}/reports/after-action", headers=headers).json()
    print("  [+] After-Action Report generated with metrics & timeline:")
    for b in aar.get("baseline", []):
        print(f"      - {b.get('metric')}: Samanvaya = {b.get('samanvaya')} {b.get('unit')}, Legacy = {b.get('baseline')} {b.get('unit')}")
    print("\n>>> Open /after-action in UI to display the Benchmark vs Baseline table.")
    print(">>> Open /sos on phone (or browser) to show the citizen QR scan portal.")
    print(">>> Closing line: 'Samanvaya turns chaotic disaster response into coordinated, real-time life-saving action.'")


def main():
    parser = argparse.ArgumentParser(description="Samanvaya Demo Director")
    parser.add_argument("--auto", action="store_true", help="Run in fully automated timed mode for 3-minute video")
    parser.add_argument("--reset", action="store_true", help="Reset scenario to baseline and exit")
    args = parser.parse_args()

    with httpx.Client(timeout=10.0) as client:
        token = get_operator_token(client)
        headers = {"Authorization": f"Bearer {token}"}

        if args.reset:
            reset_scenario(client, headers)
            return

        print("\n=======================================================")
        print(" SAMANVAYA 3-MINUTE DEMO DIRECTOR")
        print(" Mode:", "AUTOMATED (TIMED)" if args.auto else "INTERACTIVE (STEP-BY-STEP)")
        print("=======================================================")

        if not args.auto:
            input("Press [ENTER] to RESET scenario and start recording...")
            reset_scenario(client, headers)

            input("\n[0:00 - 0:20] Start recording problem statement. Press [ENTER] when ready for Incidents (0:20)...")
            step_1_incidents(client, headers)

            input("\n[0:20 - 0:50] Explaining Intake & Assessment. Press [ENTER] to show PLAN-001 (0:50)...")
            step_2_plan1(client, headers)

            input("\n[0:50 - 1:20] Explaining initial plan. Press [ENTER] to trigger Rain Surge & APR-001 (1:20)...")
            step_3_rain_surge_and_approval(client, headers)

            input("\n[1:20 - 2:00] Explaining PLAN-002 diff. Press [ENTER] to trigger Zone-B Outage (2:00)...")
            step_4_zone_b_outage(client, headers)

            input("\n[2:00 - 2:30] Explaining SMS fallback. Press [ENTER] to Close Incidents & View Report (2:30)...")
            step_5_close_and_report(client, headers)

            print("\n>>> DEMO COMPLETE! Stop your recording.")
        else:
            reset_scenario(client, headers)
            print("[0:00 - 0:20] The Problem: Speak intro (phone calls, radio, whiteboards, plans going stale)...")
            time.sleep(20)

            step_1_incidents(client, headers)
            print("[0:20 - 0:50] Incidents arriving. Queue & map filling. Showing Kannada message...")
            time.sleep(30)

            step_2_plan1(client, headers)
            print("[0:50 - 1:20] Showing PLAN-001 ETAs and routes...")
            time.sleep(30)

            step_3_rain_surge_and_approval(client, headers)
            print("[1:20 - 2:00] Showing Rain surge, approving APR-001, and inspecting PLAN-002 diff reasons...")
            time.sleep(40)

            step_4_zone_b_outage(client, headers)
            print("[2:00 - 2:30] Showing Zone B comms degraded, SMS fallback in comms log, APR-002...")
            time.sleep(30)

            step_5_close_and_report(client, headers)
            print("[2:30 - 3:00] Showing After-Action report benchmarks, citizen /sos page, closing statement.")


if __name__ == "__main__":
    main()
