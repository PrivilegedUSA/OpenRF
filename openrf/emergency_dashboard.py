"""Read-only field status snapshot. No live peer or distress conclusions."""
from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone


def _time(value):
    try:
        stamp=datetime.fromisoformat(value.replace('Z','+00:00'))
        return stamp.astimezone(timezone.utc) if stamp.tzinfo is not None else None
    except (ValueError, AttributeError, TypeError, OverflowError):
        return None


def build_dashboard(checkins, inbox, outbox, team, mesh, reticulum, *, now=None):
    """Summarize stored evidence; never infer delivery, safety or real-time location."""
    current=now or datetime.now(timezone.utc)
    latest={}
    for row in checkins:
        label=row['person'].strip()
        key=label.casefold()
        if key not in latest:
            latest[key]=row
    people=[]
    for row in latest.values():
        stamp=_time(row['recorded_utc'])
        age=(current-stamp).total_seconds() if stamp is not None else None
        freshness=('UNKNOWN_TIME' if age is None or age< -60 else
                   'OLDER_THAN_24H' if age>86400 else
                   'OLDER_THAN_6H' if age>21600 else 'RECENT_RECORD')
        people.append({'person':row['person'],'status':row['status'],'source':row['source'],
            'recorded_utc':row['recorded_utc'],'freshness':freshness,
            'age_minutes':round(max(0,age)/60) if age is not None and age>= -60 else None,
            'location_claim_saved':row['latitude'] is not None,
            'origin_transport':row.get('origin_transport'), 'origin_sender':row.get('origin_sender')})
    priorities={'NEED_HELP':0,'EVACUATING':1,'CHECK_IN':2,'SAFE':3}
    people.sort(key=lambda item:(priorities.get(item['status'],4),item['person'].casefold()))
    state_counts=Counter(row['state'] for row in outbox)
    pending=sum(1 for row in inbox if row['state']=='PENDING')
    return {'generated_utc':current.isoformat(timespec='seconds'),'snapshot_only':True,
        'people':people,'people_total':len(people),
        'needs_help_reported':sum(row['status']=='NEED_HELP' for row in people),
        'stale_or_unknown':sum(row['freshness']!='RECENT_RECORD' for row in people),
        'pending_radio_review':pending,
        'inbox_reviewed':sum(row['state'] in ('ACCEPTED','DISCARDED') for row in inbox),
        'outbox_count':len(outbox),'outbox_states':dict(state_counts),
        'outbox_items':[{'id':row['id'],'transport':row['transport'], 'state':row['state'],
                         'group_name':row.get('group_name'),'created_utc':row['created_utc']}
                        for row in outbox[:30]],
        'team_recipients':len(team),'team_groups':len({row['group_name'] for row in team}),
        'transports':{
            'meshtastic':{'local_ready':mesh.get('connected') is True and mesh.get('mode')=='normal',
                         'connected':mesh.get('connected') is True},
            'reticulum':{'local_ready':reticulum.get('enabled') is True,
                         'enabled':reticulum.get('enabled') is True}},
        'warning':'Historical local records, receiver state and message queue only. No remote safety, location, human receipt or RF reachability verification.'}
