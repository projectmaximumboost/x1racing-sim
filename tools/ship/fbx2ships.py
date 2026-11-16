# FBX (ASCII 7.7, Unity export) -> GLB for the X1 sim. Units cm -> m, Y up kept, UV v flipped.
# usage: python3 tools/ship/fbx2ships.py LargeCruiseship_RotatingRadars.fbx dist   (writes dist/X1_SkyRacer_Ships.bin)
import fbx,json,struct,io,math,sys
import numpy as np
from PIL import Image
SRC=sys.argv[1] if len(sys.argv)>1 else 'LargeCruiseship_RotatingRadars.fbx'
R=fbx.parse(SRC);O=R.get('Objects');C=R.get('Connections')
oid=lambda n:int(n.val.split(',')[0])
objs={oid(n):n for n in O.kids if n.val and n.val.split(',')[0].strip().isdigit()}
kids={};op={}
for c in C.all('C'):
    p=[x.strip().strip('"') for x in fbx.leaf(c).split(',')];ch,pa=int(p[1]),int(p[2])
    kids.setdefault(pa,[]).append(ch)
    if p[0]=='OP':op[(ch,pa)]=p[3]
name=lambda n:n.val.split('::')[1].split('"')[0]
def geom(g,matmap):
    v=np.array(fbx.nums(g.get('Vertices'))).reshape(-1,3)*.01
    pvi=np.array(fbx.nums(g.get('PolygonVertexIndex'),int));assert (pvi[2::3]<0).all()
    vi=np.where(pvi<0,~pvi,pvi)
    nrm=np.array(fbx.nums(g.get('LayerElementNormal').get('Normals'))).reshape(-1,3)
    uvl=g.all('LayerElementUV')[0];uv=np.array(fbx.nums(uvl.get('UV'))).reshape(-1,2);ui=np.array(fbx.nums(uvl.get('UVIndex'),int))
    ml=g.get('LayerElementMaterial');mm=fbx.leaf(ml.get('MappingInformationType')).strip('"');mats=np.array(fbx.nums(ml.get('Materials'),int))
    pm=np.repeat(mats if mm=='ByPolygon' else np.full(len(vi)//3,mats[0]),3)
    P=v[vi];Nn=nrm;U=uv[ui].copy();U[:,1]=1-U[:,1]
    key=np.round(np.hstack([P*1000,Nn*1000,U*100000]))
    _,first,inv=np.unique(key,axis=0,return_index=True,return_inverse=True);inv=inv.reshape(-1)
    prims=[]
    for m in sorted(set(pm.tolist())):
        idx=inv[pm==m];prims.append((matmap[m],idx.astype(np.uint32)))
    return P[first].astype(np.float32),Nn[first].astype(np.float32),U[first].astype(np.float32),prims
# materials in model connection order
def modelMats(mid):return [c for c in kids.get(mid,[]) if objs.get(c) is not None and objs[c].name=='Material']
def modelGeo(mid):return [c for c in kids.get(mid,[]) if objs.get(c) is not None and objs[c].name=='Geometry'][0]
matIds=[];
def matIndex(m):
    if m not in matIds:matIds.append(m)
    return matIds.index(m)
# textures
def tex(matid,prop):
    for c in kids.get(matid,[]):
        if op.get((c,matid))==prop:
            vid=[x for x in kids.get(c,[]) if objs[x].name=='Video'][0];return fbx.content(objs[vid])
buf=bytearray();views=[];accs=[]
def addView(b,target=None):
    while len(buf)%4:buf.append(0)
    views.append({'buffer':0,'byteOffset':len(buf),'byteLength':len(b),**({'target':target} if target else {})});buf.extend(b);return len(views)-1
def addAcc(a,typ,ct,target):
    v=addView(a.tobytes(),target);d={'bufferView':v,'componentType':ct,'count':len(a),'type':typ}
    if typ=='VEC3':d['min']=a.min(0).tolist();d['max']=a.max(0).tolist()
    accs.append(d);return len(accs)-1
def mesh(mid):
    g=objs[modelGeo(mid)];mm=[matIndex(m) for m in modelMats(mid)]
    P,Nn,U,prims=geom(g,mm);a=addAcc(P,'VEC3',5126,34962);n=addAcc(Nn,'VEC3',5126,34962);u=addAcc(U,'VEC2',5126,34962)
    return {'name':name(objs[mid]),'primitives':[{'attributes':{'POSITION':a,'NORMAL':n,'TEXCOORD_0':u},'indices':addAcc(i,'SCALAR',5125,34963),'material':m} for m,i in prims]}
def p70(n):return fbx.props(n)
def vec(p,k,d):return [float(x) for x in p[k][-3:]] if k in p else d
def quatY(deg):a=math.radians(deg)/2;return [0,math.sin(a),0,math.cos(a)]
root=[c for c in kids[0]][0];meshes=[];nodes=[]
meshes.append(mesh(root));hull={'name':'Hull','mesh':0,'children':[]};nodes.append(hull)
for c in kids[root]:
    n=objs.get(c)
    if n is None or n.name!='Model':continue
    p=p70(n);t=[x*.01 for x in vec(p,'Lcl Translation',[0,0,0])]
    ch=[x for x in kids.get(c,[]) if objs[x].name=='Model'][0];meshes.append(mesh(ch))
    nodes.append({'name':name(objs[ch]),'mesh':len(meshes)-1,'rotation':quatY(vec(p70(objs[ch]),'Lcl Rotation',[0,0,0])[1])})
    nodes.append({'name':name(n),'translation':t,'children':[len(nodes)-1]});hull['children'].append(len(nodes)-1)
# images: colour 4096 jpeg, normal + emissive 2048, railings png
imgs=[];texs=[]
def addImg(b,size=None,fmt='JPEG',q=88):
    im=Image.open(io.BytesIO(b));im.load()
    if size and im.size[0]>size:im=im.resize((size,size*im.size[1]//im.size[0]),Image.LANCZOS)
    o=io.BytesIO()
    if fmt=='JPEG':im.convert('RGB').save(o,'JPEG',quality=q,optimize=True,progressive=False)
    else:im.save(o,'PNG',optimize=True)
    v=addView(o.getvalue());imgs.append({'bufferView':v,'mimeType':'image/jpeg' if fmt=='JPEG' else 'image/png'});texs.append({'source':len(imgs)-1,'sampler':0});print(' img',im.size,fmt,len(o.getvalue())//1024,'KB');return len(texs)-1
mats=[]
for mid in matIds:
    mn=name(objs[mid]);d=tex(mid,'DiffuseColor');nm=tex(mid,'NormalMap');em=tex(mid,'EmissiveColor')
    rail=Image.open(io.BytesIO(d)).mode=='RGBA'
    m={'name':mn,'pbrMetallicRoughness':{'baseColorTexture':{'index':addImg(d,4096,'PNG' if rail else 'JPEG',90)},'metallicFactor':0,'roughnessFactor':.55},'doubleSided':True}
    if nm:m['normalTexture']={'index':addImg(nm,2048 if not rail else None,'JPEG' if not rail else 'PNG',92)}
    if em:m['emissiveTexture']={'index':addImg(em,2048,'JPEG',90)};m['emissiveFactor']=[1,1,1]
    if rail:m['alphaMode']='MASK';m['alphaCutoff']=.5
    mats.append(m)
gl={'asset':{'version':'2.0','generator':'x1 fbx2glb'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':nodes,'meshes':meshes,'materials':mats,'textures':texs,'images':imgs,
    'samplers':[{'magFilter':9729,'minFilter':9987,'wrapS':10497,'wrapT':10497}],'accessors':accs,'bufferViews':views,'buffers':[{'byteLength':len(buf)}]}
js=json.dumps(gl,separators=(',',':')).encode();js+=b' '*((4-len(js)%4)%4)
while len(buf)%4:buf.append(0)
glb=struct.pack('<III',0x46546C67,2,12+8+len(js)+8+len(buf))+struct.pack('<II',len(js),0x4E4F534A)+js+struct.pack('<II',len(buf),0x004E4942)+bytes(buf)
out=sys.argv[2] if len(sys.argv)>2 else '.';import os;print('glb',len(glb)//1024,'KB',[(m['name'],len(m['primitives'])) for m in meshes],[n.get('name') for n in nodes])
# scrambled pack: 'X1SP' + xorshift keystream, read only by the sim
def pack(b):
    a=np.frombuffer(b,np.uint8).copy();n=len(a);s=np.uint32(0x9E3779B9);ks=np.empty(n,np.uint8)
    # xorshift32 keystream, one byte per step (vectorised in blocks)
    x=0x9E3779B9;out=bytearray(n)
    ks=np.empty((n+3)//4,np.uint32)
    for i in range(len(ks)):
        x^=(x<<13)&0xFFFFFFFF;x^=x>>17;x^=(x<<5)&0xFFFFFFFF;ks[i]=x
    k=ks.view(np.uint8)[:n];return b'X1SP'+struct.pack('<I',n)+(a^k).tobytes()
open(os.path.join(out,'X1_SkyRacer_Ships.bin'),'wb').write(pack(glb));print('pack ok')
