import httpx

base = 'http://localhost:8000'
with httpx.Client() as client:
    r_op = client.post(f'{base}/auth/login', json={'username': 'operator', 'password': 'demo1234'})
    token = r_op.json()['token']
    headers = {'Authorization': f'Bearer {token}'}

    # Reset
    client.post(f'{base}/scenario/reset', headers=headers)

    # 1. Inject the 3 seed incidents
    inc1 = client.post(f'{base}/scenario/inject-incident', json={'type': 'flooded_home', 'zoneId': 'ZONE-A', 'peopleAffected': 6}, headers=headers).json()
    inc2 = client.post(f'{base}/scenario/inject-incident', json={'type': 'stranded_vehicle', 'zoneId': 'ZONE-B', 'peopleAffected': 3}, headers=headers).json()
    inc3 = client.post(f'{base}/scenario/inject-incident', json={'type': 'medical', 'zoneId': 'ZONE-A', 'peopleAffected': 2}, headers=headers).json()
    print('Injected incidents:', inc1.get('incidentId'), inc2.get('incidentId'), inc3.get('incidentId'))

    import time
    plan1 = None
    for _ in range(30):
        res = client.get(f'{base}/plan/current', headers=headers)
        if res.status_code == 200 and res.json():
            plan1 = res.json()
            break
        time.sleep(0.1)
    print('Plan 1 ID:', plan1.get('planId') if plan1 else None, 'Entries:', [(e['incidentId'], e['unitId'], e['etaMinutes']) for e in (plan1.get('entries', []) if plan1 else [])])

    # 2. Rain surge heavy
    surge = client.post(f'{base}/scenario/rain-surge', json={'intensity': 'heavy'}, headers=headers).json()
    print('Rain surge intensity:', surge.get('rain', {}).get('intensity'))

    # Check approvals inbox for APR-001
    apr1 = None
    for _ in range(30):
        apprs = client.get(f'{base}/approvals', headers=headers).json()
        apr1 = next((a for a in apprs if a['approvalId'] == 'APR-001'), None)
        if apr1:
            break
        time.sleep(0.1)
    print('Pending Approvals count:', len(apprs))
    if apr1:
        print('APR-001 summary:', apr1.get('summary'))

    # 3. Approve APR-001
    decision = client.post(f'{base}/approvals/APR-001/decide', json={'decision': 'approve', 'optionId': 'OPT-A'}, headers=headers).json()
    print('Approval decision:', decision.get('status'))

    # Check PLAN-002
    plan2 = None
    for _ in range(30):
        res = client.get(f'{base}/plan/current', headers=headers)
        if res.status_code == 200 and res.json() and res.json().get('planId') == 'PLAN-002':
            plan2 = res.json()
            break
        time.sleep(0.1)
    print('Plan 2 ID:', plan2.get('planId') if plan2 else None, 'Entries:', [(e['incidentId'], e['unitId'], e['etaMinutes']) for e in (plan2.get('entries', []) if plan2 else [])])

    # Check plan diff
    diff = client.get(f'{base}/plan/diff/PLAN-001/PLAN-002', headers=headers).json()
    print('Diff changes:')
    for c in diff.get('changes', []):
        print(f"  [{c['incidentId']}] {c['change']}: {c.get('reason')}")
