"""Falcon 9 pad GLB -> light GLB for the sim.
Splits the model into two nodes, 'rocket' (lifts off) and 'pad', converts z-up to y-up, drops UVs (no textures), and
decimates every mesh by vertex clustering (cell size per group), keeping smooth averaged normals.
usage: python3 -I decimate.py in.glb out.glb rocketCell padCell"""
import json,struct,sys,numpy as np
src,dst=sys.argv[1],sys.argv[2];RC=float(sys.argv[3]);PC=float(sys.argv[4])
b=open(src,'rb').read();L=struct.unpack('<I',b[12:16])[0];j=json.loads(b[20:20+L]);B=b[20+L+8:]
CT={5126:('f4',4),5125:('u4',4),5123:('u2',2),5121:('u1',1)};NC={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}
def acc(i):
  a=j['accessors'][i];bv=j['bufferViews'][a['bufferView']];dt,sz=CT[a['componentType']];n=NC[a['type']]
  off=bv.get('byteOffset',0)+a.get('byteOffset',0);st=bv.get('byteStride',sz*n)
  if st==sz*n: return np.frombuffer(B,dtype='<'+dt,count=a['count']*n,offset=off).reshape(a['count'],n).astype(np.float64 if dt=='f4' else np.int64)
  raw=np.frombuffer(B,dtype=np.uint8,count=st*a['count'],offset=off).reshape(a['count'],st)[:,:sz*n].copy()
  return raw.view('<'+dt).reshape(a['count'],n).astype(np.float64)
ROCKET={1,2,3,11,12,13,14,15,16,17,18,19,20,21,22,27,28,29,32,33,34,35,36,37,38,39}
out={'rocket':[],'pad':[]};tot0=tot1=0
for mi,m in enumerate(j['meshes']):
  for p in m['primitives']:
    P=acc(p['attributes']['POSITION']);N=acc(p['attributes']['NORMAL']) if 'NORMAL' in p['attributes'] else np.zeros_like(P);I=acc(p['indices']).reshape(-1,3)
    P=np.stack([P[:,0],P[:,2],-P[:,1]],1);N=np.stack([N[:,0],N[:,2],-N[:,1]],1)   # z-up -> y-up (the Sketchfab root matrix)
    grp='rocket' if mi in ROCKET else 'pad';c=RC if grp=='rocket' else PC
    key=np.floor(P/c).astype(np.int64);_,inv=np.unique(key,axis=0,return_inverse=True);inv=inv.ravel();k=inv.max()+1
    cnt=np.bincount(inv,minlength=k)[:,None];Pc=np.zeros((k,3));np.add.at(Pc,inv,P);Pc/=cnt
    T=inv[I];ok=(T[:,0]!=T[:,1])&(T[:,1]!=T[:,2])&(T[:,0]!=T[:,2]);T=T[ok]
    if len(T)==0: tot0+=len(I);continue
    Ts=np.sort(T,1);_,u=np.unique(Ts,axis=0,return_index=True);T=T[np.sort(u)]
    # normals: area-weighted face normals, so collapsed detail shades sensibly
    fn=np.cross(Pc[T[:,1]]-Pc[T[:,0]],Pc[T[:,2]]-Pc[T[:,0]]);Nc=np.zeros((k,3))
    for a in range(3):np.add.at(Nc,T[:,a],fn)
    l=np.linalg.norm(Nc,axis=1,keepdims=True);No=np.zeros((k,3));np.add.at(No,inv,N);Nc=np.where(l>1e-12,Nc/np.maximum(l,1e-12),No/np.maximum(np.linalg.norm(No,axis=1,keepdims=True),1e-12))
    used=np.unique(T);remap=-np.ones(k,np.int64);remap[used]=np.arange(len(used))
    out[grp].append((Pc[used].astype('<f4'),Nc[used].astype('<f4'),remap[T].astype('<u4'),p.get('material',0)))
    tot0+=len(I);tot1+=len(T)
# write GLB
bins=bytearray();views=[];accs=[];meshes=[];nodes=[{'name':'X1_F9','children':[1,2]},{'name':'rocket','children':[]},{'name':'pad','children':[]}]
def add(arr,target,ctype,typ,mm=False):
  global bins
  while len(bins)%4:bins+=b'\0'
  off=len(bins);bins+=arr.tobytes();views.append({'buffer':0,'byteOffset':off,'byteLength':arr.nbytes,'target':target})
  a={'bufferView':len(views)-1,'componentType':ctype,'count':len(arr) if arr.ndim>1 else arr.size,'type':typ}
  if mm:a['min']=arr.min(0).tolist();a['max']=arr.max(0).tolist()
  accs.append(a);return len(accs)-1
for gi,g in enumerate(['rocket','pad']):
  for (Pp,Nn,T,mat) in out[g]:
    ip=add(Pp,34962,5126,'VEC3',True);inn=add(Nn,34962,5126,'VEC3');ii=add(T.ravel(),34963,5125,'SCALAR')
    meshes.append({'primitives':[{'attributes':{'POSITION':ip,'NORMAL':inn},'indices':ii,'material':mat}]})
    nodes.append({'mesh':len(meshes)-1});nodes[1+gi]['children'].append(len(nodes)-1)
mats=[{k:v for k,v in m.items() if k!='doubleSided'}|{'doubleSided':True} for m in j['materials']]
G={'asset':{'version':'2.0','generator':'x1 decimate.py','extras':j['asset'].get('extras',{})},'scene':0,'scenes':[{'nodes':[0]}],'nodes':nodes,'meshes':meshes,'materials':mats,
   'accessors':accs,'bufferViews':views,'buffers':[{'byteLength':len(bins)}]}
js=json.dumps(G,separators=(',',':')).encode();js+=b' '*((4-len(js)%4)%4)
while len(bins)%4:bins+=b'\0'
glb=struct.pack('<III',0x46546C67,2,12+8+len(js)+8+len(bins))+struct.pack('<II',len(js),0x4E4F534A)+js+struct.pack('<II',len(bins),0x004E4942)+bins
open(dst,'wb').write(glb);print('tris',tot0,'->',tot1,'bytes',len(glb),{g:sum(len(x[2]) for x in out[g]) for g in out})
