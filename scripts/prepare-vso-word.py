"""Extract a clean one-page VSO template from the supplied editable Word form.
Usage: python prepare-vso-word.py /absolute/input.docx /absolute/output-directory
Render the resulting template.docx with the documents renderer, then copy its PDF
as template.pdf. The original populated document must never be committed.
"""
from pathlib import Path
from lxml import etree
import re,sys,zipfile
src,out=Path(sys.argv[1]),Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True)
ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main','v':'urn:schemas-microsoft-com:vml'}
with zipfile.ZipFile(src) as z: parts={n:z.read(n) for n in z.namelist()}
root=etree.fromstring(parts['word/document.xml']);body=root.find('w:body',ns)
first=body.find('w:p',ns)
for child in list(body):
 if child is not first and child.tag!='{'+ns['w']+'}sectPr':body.remove(child)
# Erase field contents in the source XML, rather than covering or rasterizing them.
cleared=0
private_samples=[]
for shape in first.findall('.//v:rect',ns):
 if shape.find('v:textbox',ns) is None:continue
 style=shape.get('style','')
 x=float(re.search(r'margin-left:([\d.]+)pt',style)[1]);y=float(re.search(r'margin-top:([\d.]+)pt',style)[1])
 dynamic=((108<x<112 and 110<y<202) or (393<x<398 and 85<y<150) or
          (423<x<426 and 170<y<202) or (119<x<122 and 199<y<216) or
          (328<x<331 and 199<y<217) or (400<x<404 and 199<y<217) or
          (183<x<186 and 228<y<531))
 if dynamic:
  for t in shape.findall('.//w:t',ns):
   if len(t.text or '')>=8:private_samples.append(t.text)
   t.text=''
  cleared+=1
assert cleared==22, f'Unexpected template field geometry ({cleared}); inspect before publication.'
# Normalize non-text legacy VML objects to native DrawingML. Some Word readers
# discard these background rules and pictures when the document has one paragraph.
uris={'w':ns['w'],'v':ns['v'],'r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
      'wp':'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
      'a':'http://schemas.openxmlformats.org/drawingml/2006/main',
      'wps':'http://schemas.microsoft.com/office/word/2010/wordprocessingShape',
      'pic':'http://schemas.openxmlformats.org/drawingml/2006/picture'}
def add(parent,tag,attrs=None):
 prefix,name=tag.split(':');node=etree.SubElement(parent,'{'+uris[prefix]+'}'+name)
 for key,value in (attrs or {}).items():
  if ':' in key:
   prefix,name=key.split(':');key='{'+uris[prefix]+'}'+name
  node.set(key,str(value))
 return node
for count,shape in enumerate(list(first.findall('.//v:rect',ns)),10000):
 if shape.find('v:textbox',ns) is not None:continue
 style=shape.get('style','')
 vals={key:float(re.search(key+r':([\d.]+)pt',style)[1]) for key in ['margin-left','margin-top','width','height']}
 cx,cy=round(vals['width']*12700),round(vals['height']*12700)
 old=shape.getparent();run=old.getparent();run.remove(old)
 drawing=add(run,'w:drawing');anchor=add(drawing,'wp:anchor',{'distT':0,'distB':0,'distL':0,'distR':0,'simplePos':0,'relativeHeight':1,'behindDoc':0,'locked':0,'layoutInCell':0,'allowOverlap':1})
 add(anchor,'wp:simplePos',{'x':0,'y':0})
 for axis,value in [('H',vals['margin-left']),('V',vals['margin-top'])]:
  pos=add(anchor,'wp:position'+axis,{'relativeFrom':'page'});add(pos,'wp:posOffset').text=str(round(value*12700))
 add(anchor,'wp:extent',{'cx':cx,'cy':cy});add(anchor,'wp:wrapNone')
 add(anchor,'wp:docPr',{'id':count,'name':'VSO template object '+str(count)})
 add(anchor,'wp:cNvGraphicFramePr');graphic=add(anchor,'a:graphic')
 image=shape.find('v:imagedata',ns)
 if image is not None:
  gd=add(graphic,'a:graphicData',{'uri':uris['pic']});pic=add(gd,'pic:pic');nv=add(pic,'pic:nvPicPr')
  add(nv,'pic:cNvPr',{'id':count,'name':'Dealer logo'});add(nv,'pic:cNvPicPr')
  fill=add(pic,'pic:blipFill');add(fill,'a:blip',{'r:embed':image.get('{'+uris['r']+'}id')});add(add(fill,'a:stretch'),'a:fillRect')
  sp=add(pic,'pic:spPr')
 else:
  gd=add(graphic,'a:graphicData',{'uri':uris['wps']});wsp=add(gd,'wps:wsp');add(wsp,'wps:cNvSpPr');sp=add(wsp,'wps:spPr')
 xf=add(sp,'a:xfrm');add(xf,'a:off',{'x':0,'y':0});add(xf,'a:ext',{'cx':cx,'cy':cy})
 if image is not None:add(add(sp,'a:prstGeom',{'prst':'rect'}),'a:avLst')
 else:
  geom=add(sp,'a:custGeom')
  for tag in ['a:avLst','a:gdLst','a:ahLst','a:cxnLst']:add(geom,tag)
  add(geom,'a:rect',{'l':0,'t':0,'r':cx,'b':cy});path=add(add(geom,'a:pathLst'),'a:path',{'w':cx,'h':cy})
  for tag,px,py in [('a:moveTo',0,0),('a:lnTo',cx,0),('a:lnTo',cx,cy),('a:lnTo',0,cy)]:add(add(path,tag),'a:pt',{'x':px,'y':py})
  add(path,'a:close')
 if image is None:
  add(add(sp,'a:solidFill'),'a:srgbClr',{'val':shape.get('fillcolor','#000000').lstrip('#')})
  add(add(sp,'a:ln'),'a:noFill');add(wsp,'wps:bodyPr')
parts['word/document.xml']=etree.tostring(root,xml_declaration=True,encoding='UTF-8',standalone=True)
# Remove source identities and document history from the distributable template.
cp='http://schemas.openxmlformats.org/package/2006/metadata/core-properties'
dc='http://purl.org/dc/elements/1.1/'
core=etree.fromstring(parts['docProps/core.xml'])
for child in core:
 if child.tag in ['{'+dc+'}creator','{'+cp+'}lastModifiedBy','{'+dc+'}description','{'+dc+'}subject']:child.text=''
 if child.tag=='{'+dc+'}title':child.text='VSO Word Template'
parts['docProps/core.xml']=etree.tostring(core,xml_declaration=True,encoding='UTF-8',standalone=True)
for n,data in parts.items():
 if n.endswith('.xml'):
  content=' '.join(etree.fromstring(data).itertext())
  assert not any(value in content for value in private_samples),f'Customer/sample data remains in {n}'
with zipfile.ZipFile(out/'template.docx','w',zipfile.ZIP_DEFLATED) as z:
 for n,data in parts.items():z.writestr(n,data)
print(f'Cleaned {cleared} fields; kept one editable A4 page.')
