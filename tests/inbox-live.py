"""Live inbox verification. Reads temporary session tokens from stdin; removes test uploads."""
import sys,json,urllib.request,urllib.error,uuid,hashlib,io
from reportlab.pdfgen.canvas import Canvas
credentials=json.load(sys.stdin)
endpoint='https://qagsczjxzshjxmmxvkbq.supabase.co/functions/v1/lead-hub-inbox'
prefix='_FARIS_INBOX_TEST_'+uuid.uuid4().hex
saved=[];key_record=None;checks=[]
def request(action,token=None,payload=None,upload_key=None,file=None,expect=200):
 headers={}
 if token:headers['Authorization']='Bearer '+token
 if upload_key:headers['X-Faris-Upload-Key']=upload_key
 url=endpoint
 if file:
  name,content,mime=file;boundary='FarisTest'+uuid.uuid4().hex
  body=('--'+boundary+'\r\nContent-Disposition: form-data; name="file"; filename="'+name+'"\r\nContent-Type: '+mime+'\r\n\r\n').encode()+content+('\r\n--'+boundary+'--\r\n').encode()
  headers['Content-Type']='multipart/form-data; boundary='+boundary;url+='?action=receive'
 else:body=json.dumps({'action':action,**(payload or {})}).encode();headers['Content-Type']='application/json'
 req=urllib.request.Request(url,data=body,headers=headers)
 try:
  with urllib.request.urlopen(req,timeout=30) as r:status=r.status;data=json.load(r)
 except urllib.error.HTTPError as e:status=e.code;data=json.loads(e.read())
 assert status==expect,(action,status,data)
 return data
try:
 request('list',expect=401);checks.append('anonymous denied')
 saz=request('me',credentials['saz'])['user'];aiman=request('me',credentials['aiman'])['user']
 d=request('create_key',credentials['saz']);upload_key=d['key'];key_record=d['record']['id']
 request('list',upload_key=upload_key,expect=401);checks.append('upload key cannot read')
 pdf=io.BytesIO();canvas=Canvas(pdf);canvas.drawString(60,780,'FARIS INBOX TEST - no customer data');canvas.save();pdf_bytes=pdf.getvalue()
 d=request('receive',upload_key=upload_key,file=(prefix+'.pdf',pdf_bytes,'application/pdf'));file_id=d['files'][0]['id'];saved.append(file_id)
 listing=request('list',credentials['saz'],{'state':'all','search':prefix})
 assert any(x['id']==file_id and x['source']=='ios_shortcut' and x['state']=='inbox' for x in listing['files']);checks.append('Shortcut upload persisted')
 assert request('list',credentials['aiman'],{'state':'all','search':prefix})['total']==0
 request('download',credentials['aiman'],{'id':file_id},expect=404)
 request('download',upload_key=upload_key,payload={'id':file_id},expect=401)
 request('assign',credentials['aiman'],{'ids':[file_id],'customer_name':'FARIS TEST ONLY','party':'HIRER','category':'BANK'},expect=403);checks.append('cross-account reads and writes denied')
 request('assign',credentials['admin'],{'ids':[file_id],'customer_name':'FARIS TEST ONLY','party':'HIRER','category':'BANK','owner_id':aiman['id']})
 request('download',credentials['saz'],{'id':file_id},expect=404)
 downloaded=request('download',credentials['aiman'],{'id':file_id})
 assert downloaded['file']['category']=='BANK' and downloaded['file']['state']=='assigned'
 with urllib.request.urlopen(downloaded['url'],timeout=30) as r:actual=r.read()
 assert hashlib.sha256(actual).digest()==hashlib.sha256(pdf_bytes).digest();checks.append('admin transfer and exact-byte compiler download')
 d=request('receive',credentials['saz'],file=(prefix+'.txt',b'Synthetic inbox note','text/plain'));saved.append(d['files'][0]['id']);checks.append('browser upload persisted')
 request('receive',credentials['saz'],file=(prefix+'_fake.pdf',b'not PDF','application/pdf'),expect=400);checks.append('fake PDF rejected')
 checks.append('private storage and ownership verified')
 print(json.dumps({'status':'PASS','checks':checks,'key_record_id':key_record,'test_file_ids':saved}),flush=True)
finally:
 for ident in saved:
  try:request('delete',credentials['admin'],{'id':ident,'confirmed':True})
  except Exception as e:print(json.dumps({'cleanup_error':str(e),'test_file_id':ident}),flush=True)
 if key_record:
  try:request('revoke_key',credentials['saz'])
  except Exception as e:print(json.dumps({'key_revoke_error':str(e),'key_record_id':key_record}),flush=True)
