import httpx
import json

base = 'http://localhost:8000'
with httpx.Client(timeout=10.0) as client:
    # Login as operator
    r_op = client.post(f'{base}/auth/login', json={'username': 'operator', 'password': 'demo1234'})
    token = r_op.json()['token']
    headers = {'Authorization': f'Bearer {token}'}

    # Reset first
    client.post(f'{base}/scenario/reset', headers=headers)

    # POST /dev/replay
    rep = client.post(f'{base}/dev/replay')
    assert rep.status_code == 200, f'Replay failed: {rep.text}'
    print('Replay response:', rep.json())

    # 1. Incidents on map & queue
    incs = client.get(f'{base}/incidents', headers=headers).json()
    print(f'1. Incidents on map & queue: count={len(incs)} (Expected >= 3)')
    for inc in incs:
        print(f"   - {inc.get('incidentId')}: {inc.get('type')}, status={inc.get('status')}")

    # 2. PLAN-001 and history
    plans = client.get(f'{base}/plan/history', headers=headers).json()
    p1 = next((p for p in plans if p.get('planId') == 'PLAN-001'), None)
    print(f"2. PLAN-001 in history: {p1 is not None}, entries count={len(p1.get('entries', [])) if p1 else 0}")

    # 3. Rain surge
    status = client.get(f'{base}/status', headers=headers).json()
    roads = client.get(f'{base}/roads', headers=headers).json()
    road_04 = next((r for r in roads.get('roads', []) if r.get('roadId') == 'ROAD-04'), None)
    print(f"3. Rain surge: intensity={status.get('rain', {}).get('intensity')}, ROAD-04 status={road_04.get('status') if road_04 else None}")

    # 4. APR-001 in approval inbox
    apprs = client.get(f'{base}/approvals', headers=headers).json()
    apr1 = next((a for a in apprs if a.get('approvalId') == 'APR-001'), None)
    print(f"4. APR-001 in approvals: {apr1.get('approvalId') if apr1 else None}, status={apr1.get('status') if apr1 else None}, summary={apr1.get('summary') if apr1 else None}")

    # 5. PLAN-002 in plan diff
    p2 = next((p for p in plans if p.get('planId') == 'PLAN-002'), None)
    diff = client.get(f'{base}/plan/diff?from=PLAN-001&to=PLAN-002', headers=headers).json()
    print(f"5. PLAN-002 in plan diff: p2_exists={p2 is not None}, diff changes count={len(diff) if isinstance(diff, list) else 0}")
    if isinstance(diff, list):
        for c in diff:
            print(f"   - {c.get('incidentId')}: {c.get('change')}, reason={c.get('reason')}")

    # 6. Zone B outage
    zones = client.get(f'{base}/zones', headers=headers).json()
    zone_b = next((z for z in zones if z.get('zoneId') == 'ZONE-B'), None)
    print(f"6. Zone B outage: ZONE-B commsStatus={zone_b.get('commsStatus') if zone_b else None}")

    # 7. SMS entries in comms log
    comms = client.get(f'{base}/comms/log', headers=headers).json()
    sms_comms = [c for c in comms if c.get('channel') == 'sms']
    print(f"7. Comms log SMS entries: total comms={len(comms)}, SMS count={len(sms_comms)}")

    # 8. APR-002
    apr2 = next((a for a in apprs if a.get('approvalId') == 'APR-002'), None)
    print(f"8. APR-002 in approvals: {apr2.get('approvalId') if apr2 else None}, status={apr2.get('status') if apr2 else None}, summary={apr2.get('summary') if apr2 else None}")

    # 9. After-action report
    aar = client.get(f'{base}/reports/after-action', headers=headers).json()
    print(f"9. After-Action report metrics: totalIncidents={aar.get('metrics', {}).get('totalIncidents')}, plansCreated={aar.get('metrics', {}).get('plansCreated')}")
