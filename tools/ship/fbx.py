import re,sys
ID=re.compile(r'^([A-Za-z_][A-Za-z0-9_|]*):\s?(.*)$')
class N:
    __slots__=('name','val','kids')
    def __init__(s,n,v):s.name=n;s.val=v;s.kids=[]
    def get(s,n):
        for k in s.kids:
            if k.name==n:return k
    def all(s,n):return [k for k in s.kids if k.name==n]
def parse(path):
    root=N('root','');st=[root];last=None
    with open(path,encoding='utf8',errors='replace') as f:
        for line in f:
            t=line.strip()
            if not t or t.startswith(';'):continue
            if t=='}':st.pop();last=None;continue
            m=ID.match(t)
            if m:
                n,v=m.group(1),m.group(2)
                if v.endswith('{'):
                    node=N(n,v[:-1].strip());st[-1].kids.append(node);st.append(node);last=None
                else:
                    node=N(n,[v]);st[-1].kids.append(node);last=node
            else:
                if last is not None:last.val.append(t)
                else: raise Exception('orphan '+t[:60])
    return root
def leaf(n):return ''.join(n.val) if isinstance(n.val,list) else n.val
def nums(arrnode,typ=float):
    a=arrnode.get('a');s=leaf(a)
    return [typ(x) for x in s.split(',') if x.strip()!='']
def props(node):
    out={}
    p=node.get('Properties70')
    if not p:return out
    for k in p.all('P'):
        parts=[x.strip().strip('"') for x in re.findall(r'"[^"]*"|[^,]+',leaf(k))]
        out[parts[0]]=parts[1:]
    return out
def content(video):
    import base64,re
    s=leaf(video.get('Content'))
    return b''.join(base64.b64decode(c) for c in re.findall(r'"([^"]*)"',s))
