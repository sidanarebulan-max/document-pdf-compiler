"""Temporary synthetic customers and sessions only. Does not open/send WhatsApp."""
import base64,json,sys,urllib.request,urllib.error,uuid
v=json.load(sys.stdin);ROOT='https://qagsczjxzshjxmmxvkbq.supabase.co/functions/v1/'
lead=v['lead'];other=v['other'];file_id=None
png=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=')
def call(action,payload=None,role='staff',service='lead-hub-customers',expect=200,raw=None,ctype=None):
 headers={'Content-Type':ctype or 'application/json'}
 if role:headers['Authorization']='Bearer '+v[role]
 req=urllib.request.Request(ROOT+service+('?action=receive' if raw is not None else ''),data=raw if raw is not None else json.dumps({'action':action,**(payload or {})}).encode(),headers=headers)
 try:
  with urllib.request.urlopen(req,timeout=40) as r:status=r.status;d=json.load(r)
 except urllib.error.HTTPError as e:status=e.code;d=json.loads(e.read())
 assert status==expect,(action,status,d)
 return d

def get(role='staff',id=lead):return call('get',{'lead_id':id},role)['customer']
def write(action,data,role='staff',id=lead,operation=None,expect=200):return call(action,{'lead_id':id,'data':data,'operation_id':operation or str(uuid.uuid4()),'actor_id':'00000000-0000-4000-8000-000000000000'},role,expect=expect)
def values(c):
 d={k:c['profile'][k] for k in ['sales_status','variant','next_action','closure_reason','guarantor_required','booking_status','booking_amount','selling_price','deposit','loan_amount']}
 d.update(customer_name=c['lead']['customer_name'],model=c['lead']['model'],follow_up_at=c['lead']['follow_up_at'],expected_revision=c['profile']['revision'],expected_lead_updated_at=c['lead']['updated_at']);return d
try:
 call('get',{'lead_id':lead},role=None,expect=401);call('get',{'lead_id':other},expect=403);call('timeline',{'lead_id':other},expect=403)
 c=get();assert c['profile']['revision']>=0
 listing=call('list',{'search':'Customer profile integration'});assert listing['total']>=1 and any(x['id']==lead for x in listing['customers']) and not any(x['id']==other for x in listing['customers'])
 data=values(c);data.update(sales_status='documents',next_action='Minta penyata bank',variant='Premium',follow_up_at='2026-11-01',deposit=5000)
 write('save_profile',data);write('save_profile',data,expect=409)
 write('save_profile',{**values(get()),'sales_status':'on_hold','closure_reason':''},expect=400)
 op=str(uuid.uuid4());write('add_note',{'note':'PRIVATE CUSTOMER TEST NOTE'},operation=op);d=write('add_note',{'note':'PRIVATE CUSTOMER TEST NOTE'},operation=op);assert d['already_recorded']
 assert len([n for n in get()['notes'] if n['details']['note']=='PRIVATE CUSTOMER TEST NOTE'])==1
 write('save_bank',{'bank_name':'Test Bank','status':'submitted','amount':100000,'notes':'Dokumen dihantar','submitted_at':'2026-10-28'})
 bank=get()['banks'][0];write('save_bank',{**{k:bank[k] for k in ['id','bank_name','amount','notes','submitted_at']},'status':'approved'})
 write('save_bank',{'bank_name':'Foreign Test Bank','status':'draft'},role='admin',id=other)
 foreign=get('admin',other)['banks'][0]
 write('save_bank',{'id':foreign['id'],'bank_name':'MUST NOT CHANGE','status':'approved'},expect=403)
 print('PASS scoped profile/list, independent sales status, stale-save protection, note retry/actor identity and per-bank records',flush=True)
 boundary='faris-'+uuid.uuid4().hex
 raw=(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="customer-profile-test.png"\r\nContent-Type: image/png\r\n\r\n'.encode()+png+f'\r\n--{boundary}--\r\n'.encode())
 file_id=call('receive',service='lead-hub-inbox',raw=raw,ctype='multipart/form-data; boundary='+boundary)['files'][0]['id']
 assert any(f['id']==file_id for f in call('unlinked_files',{'lead_id':lead})['files'])
 write('link_files',{'ids':[file_id],'party':'HIRER','category':'IC'})
 c=get();assert any(f['id']==file_id and f['category']=='IC' for f in c['files']) and 'storage_path' not in json.dumps(c)
 d=call('download',{'id':file_id},service='lead-hub-inbox')
 with urllib.request.urlopen(d['url'],timeout=40) as r:assert r.read()==png
 call('download',{'id':file_id},role='other_staff',service='lead-hub-inbox',expect=404)
 call('assign',{'ids':[file_id],'customer_name':'WRONG PERSON','party':'HIRER','category':'IC'},service='lead-hub-inbox',expect=400)
 write('checklist',{'party':'HIRER','category':'IC','status':'received'})
 call('save_lead',{'lead_id':lead,'stage':'contacted','notes':'WHATSAPP PRIVATE TEST NOTE','follow_up_at':'2026-11-02'},service='lead-hub')
 timeline=call('timeline',{'lead_id':lead})['events'];assert any(e['event_type']=='whatsapp_details_updated' and e['details']['notes_after']=='WHATSAPP PRIVATE TEST NOTE' and e['actor_code']=='SAZ0001' for e in timeline)
 assert any(e['event_type']=='documents_linked' and e['actor_code']=='SAZ0001' for e in timeline)
 assert not any(e['event_type']=='note_added' and e['actor_code']!='SAZ0001' for e in timeline)
 print('PASS original document bytes, profile link, private download access, checklist and combined customer/WhatsApp audit',flush=True)
 call('assign',{'lead_id':lead,'staff_id':'fd96690a-e04c-403a-9fda-3a55e0e527ed'},role='admin',service='lead-hub')
 call('get',{'lead_id':lead},expect=403);call('download',{'id':file_id},service='lead-hub-inbox',expect=404)
 call('download',{'id':file_id},role='other_staff',service='lead-hub-inbox')
 assert any(f['id']==file_id for f in get('other_staff')['files'])
 assert any(f['id']==file_id for f in call('list',{'state':'all'},role='other_staff',service='lead-hub-inbox')['files'])
 assert not any(f['id']==file_id for f in call('list',{'state':'all'},service='lead-hub-inbox')['files'])
 write('add_note',{'note':'MUST NOT WRITE AFTER REASSIGNMENT'},expect=403)
 print('PASS reassignment transfers profile/document access; former staff loses get, mutation and Inbox download/list access',flush=True)
finally:
 if file_id:
  c=get('admin')
  if any(f['id']==file_id for f in c['files']):write('unlink_file',{'id':file_id},role='admin')
  call('delete',{'id':file_id,'confirmed':True},role='admin',service='lead-hub-inbox')
  print('CLEANUP synthetic document removed',flush=True)
