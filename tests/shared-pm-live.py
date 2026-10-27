"""Only use temporary test sessions and synthetic lead IDs; never sends WhatsApp."""
import json,sys,urllib.request,urllib.error,uuid
v=json.load(sys.stdin);url='https://qagsczjxzshjxmmxvkbq.supabase.co/functions/v1/lead-hub'
def call(action,payload=None,authenticated=True,expect=200):
 headers={'Content-Type':'application/json'}
 if authenticated:headers['Authorization']='Bearer '+v['token']
 req=urllib.request.Request(url,data=json.dumps({'action':action,**(payload or {})}).encode(),headers=headers)
 try:
  with urllib.request.urlopen(req,timeout=25) as r:status=r.status;d=json.load(r)
 except urllib.error.HTTPError as e:status=e.code;d=json.loads(e.read())
 assert status==expect,(action,status,d)
 return d
actor=call('me')['user'];operation=str(uuid.uuid4())
call('open_shared',{'lead_id':v['id'],'operation_id':str(uuid.uuid4())},authenticated=False,expect=401)
call('open_shared',{'lead_id':v['id'],'operation_id':str(uuid.uuid4()),'actor_id':'00000000-0000-4000-8000-000000000000'})
first=call('confirm_shared_pm',{'lead_id':v['id'],'operation_id':operation,'actor_id':'00000000-0000-4000-8000-000000000000'})
again=call('confirm_shared_pm',{'lead_id':v['id'],'operation_id':operation})
assert again['already_recorded'] and first['event_id']==again['event_id']
call('confirm_shared_pm',{'lead_id':v['blocked_id'],'operation_id':str(uuid.uuid4())},expect=400)
call('confirm_shared_pm',{'lead_id':str(uuid.uuid4()),'operation_id':str(uuid.uuid4())},expect=403)
call('save_lead',{'lead_id':v['id'],'stage':'contacted','notes':'MUST NOT BE WRITTEN'},expect=403)
d=call('list');activity=[x for x in d['activity_log'] if x['lead_id']==v['id']]
assert len(activity)==2 and all(x['actor_id']==actor['id'] and x['actor_code']=='SAZ0001' for x in activity)
assert any(x['id']==v['id'] and x['pm_confirmed_at'] and x['assigned_id']!=actor['id'] and x['stage']=='claimed' for x in d['my_pm'])
assert not any(x['id']==v['id'] for x in d['leads'])
assert any(x['lead_id']==v['id'] and x['assignee_code']=='AIMAN01' for x in d['assignment_history'])
assert 'SHARED_PRIVATE_SENTINEL_'+v['id'] not in json.dumps(d)
print(json.dumps({'status':'PASS','shared_pm_actor':'SAZ0001','claim_remains':'AIMAN01','events':len(activity),'retry_idempotent':True,'sender_dah_pm':True,'private_edit_denied':True,'private_notes_excluded':True,'consent_and_history_checks':True,'no_whatsapp_sent':True}),flush=True)
