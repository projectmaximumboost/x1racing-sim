"""Starship tower GLB -> light GLB for the sim (dist/X1_SkyRacer_Starship.glb).

The source (starship_tower.glb, Blender export) is one 28k-triangle mesh with three 4k textures (35 MB). This:
  - welds it into connected parts and sorts every part into a group by where it sits:
      pad       tower, launch mount, crane (never moves)
      carriage  the ring that rides up and down the tower carrying the chopsticks
      armL/armR the two chopsticks; each node sits on its hinge (a vertical axis at the tower face) so rotation.y swings it
      qd        the quick-disconnect arm boom, its node on its own hinge
      booster   Super Heavy, ship  Starship (the hull is cut at the hot-staging ring)
  - scales model units to metres (0.71: the stack is 121 m) and puts the origin on the rocket axis at ground level,
    tower on -z, y up
  - bakes the base-colour texture into vertex colours and drops every texture (35 MB -> about 1.5 MB)
  - keeps all the triangles (28k: lighter than the Falcon 9 pad's 58k)
Model facts the sim reads are written into asset.extras.x1 (hinges, heights, radius) so the JS has no magic numbers.
usage: python3 -I prep.py starship_tower.glb X1_SkyRacer_Starship.glb"""
import io, json, struct, sys
import numpy as np
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
b = open(src, 'rb').read()
L = struct.unpack('<I', b[12:16])[0]
j = json.loads(b[20:20 + L])
B = b[20 + L + 8:]
CT = {5126: 'f4', 5125: 'u4', 5123: 'u2', 5121: 'u1'}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}


def acc(i):
    a = j['accessors'][i]
    bv = j['bufferViews'][a['bufferView']]
    n = NC[a['type']]
    o = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    return np.frombuffer(B, dtype='<' + CT[a['componentType']], count=a['count'] * n, offset=o).reshape(a['count'], n)


def img(i):
    bv = j['bufferViews'][j['images'][i]['bufferView']]
    o = bv.get('byteOffset', 0)
    return Image.open(io.BytesIO(B[o:o + bv['byteLength']])).convert('RGB')


pr = j['meshes'][0]['primitives'][0]
P = acc(pr['attributes']['POSITION']).astype(np.float64)
N = acc(pr['attributes']['NORMAL']).astype(np.float64)
UV = acc(pr['attributes']['TEXCOORD_0']).astype(np.float64)
I = acc(pr['indices']).reshape(-1, 3).astype(np.int64)
# texture names: find base colour by the material's baseColorTexture index
mat = j['materials'][0]
bc = img(j['textures'][mat['pbrMetallicRoughness']['baseColorTexture']['index']]['source'])
bc = np.asarray(bc.resize((512, 512), Image.BOX)).astype(np.float64) / 255.0

# ---- model-space constants (source units) ----
AX, AZ, Y0 = 0.0, 25.5, -1.7         # rocket axis and ground
SPLIT = 129.3                         # hot-staging ring: booster below, ship above
S = 121.0 / (212.8 - 42.0)            # stack 42.0..212.8 model -> 121 m
HINGE_L, HINGE_R = (-6.6, -11.6), (6.6, -11.6)
HINGE_QD = (-2.6, -9.6)

# ---- cut the hull at the staging plane (clip triangles that cross it) ----
def clip(P, N, UV, I, y0):
    P, N, UV = list(P), list(N), list(UV)
    out = []
    for t in I:
        ys = [P[k][1] - y0 for k in t]
        if min(ys) >= 0 or max(ys) <= 0:
            out.append(list(t)); continue
        below, above = [], []
        for a in range(3):
            i0, i1 = t[a], t[(a + 1) % 3]
            d0, d1 = P[i0][1] - y0, P[i1][1] - y0
            (below if d0 < 0 else above).append(i0)
            if (d0 < 0) != (d1 < 0):
                f = d0 / (d0 - d1)
                P.append(P[i0] + (P[i1] - P[i0]) * f); N.append(N[i0] + (N[i1] - N[i0]) * f); UV.append(UV[i0] + (UV[i1] - UV[i0]) * f)
                k = len(P) - 1; below.append(k); above.append(k)
        for poly in (below, above):
            for q in range(1, len(poly) - 1):
                out.append([poly[0], poly[q], poly[q + 1]])
    return np.array(P), np.array(N), np.array(UV), np.array(out)


# ---- connected parts (welded by position) ----
def parts(P, I):
    key = np.round(P * 1000).astype(np.int64)
    _, w = np.unique(key, axis=0, return_inverse=True)
    w = w.ravel()
    par = np.arange(w.max() + 1)

    def f(a):
        r = a
        while par[r] != r: r = par[r]
        while par[a] != r: par[a], a = r, par[a]
        return r
    for t in w[I]:
        a = f(t[0]); par[f(t[1])] = a; par[f(t[2])] = a
    root = np.array([f(i) for i in range(len(par))])
    _, lab = np.unique(root[w[I[:, 0]]], return_inverse=True)
    return lab.ravel()


lab = parts(P, I)
HULL = np.bincount(lab).argmax()                 # the hull is the largest part
hullT = I[lab == HULL]
P, N, UV, hullT = clip(P, N, UV, hullT, SPLIT)
I = np.concatenate([I[lab != HULL], hullT])
lab = np.concatenate([lab[lab != HULL], np.full(len(hullT), -1)])

FINS = []
group = np.empty(len(I), dtype=object)
cen = P[I].mean(1)
for k in np.unique(lab):
    m = lab == k
    if k == -1:
        group[m] = np.where(cen[m, 1] > SPLIT, 'ship', 'booster'); continue
    Q = P[I[m].ravel()]
    mn, mx = Q.min(0), Q.max(0)
    c = (mn + mx) / 2
    g = 'pad'
    rocket = mn[1] >= 41.5 and abs(mn[0]) <= 9.2 and abs(mx[0]) <= 9.2 and mn[2] >= 11.5 and mx[2] <= 40.5
    if rocket and 110 < mn[1] < 127.5 and mx[2] < 21: rocket = False   # tip of the QD arm
    if rocket and (mx[1] < 61 or (mx[1] - mn[1] < 1 and 45 < mn[1] < 80)):
        # blocky add-ons round the foot of the booster (four boxes on the sides, small brackets, rungs on the chines):
        # left out, so the booster ends in its four chine fins and the 33 engines the sim adds
        group[m] = 'drop'
        continue
    if rocket and 127.5 < mn[1] and mx[1] < 129.6 and (mx[2] < 19 or mn[2] > 32):
        # a grid fin: a flat plate standing out from the top of the booster. In the source the four plates stand out
        # parallel in pairs (along z), so the outer ones are canted about 33 degrees off the hull's normal. Each is
        # rebuilt in its own frame (hinge line along local x at the plate's inner edge, plate out along local +z) and
        # its node is yawed to the radial at its hinge, so deployed it stands straight out from the hull and
        # rotation.x = +90 folds it straight down flat against it
        fin_i = len(FINS); near = mx[2] < 19
        FINS.append({'name': 'fin%d' % fin_i, 'hinge': [c[0], (mn[1] + mx[1]) / 2, mx[2] if near else mn[2]], 'near': near, 'fold': 90})
        g = FINS[-1]['name']
    elif rocket: g = 'ship' if c[1] > SPLIT else 'booster'
    elif abs(c[0]) < 1 and mx[1] - mn[1] > 30 and 190 < mn[1] < 200 and mx[2] < -2:
        g = 'cable'   # the hook's two cables: shorten as the hook rides up
    elif abs(c[0]) < 2 and mx[0] - mn[0] < 4 and mx[2] < -2 and mx[2] > -12 and 184 < mn[1] < 198:
        g = 'hook'    # the crane hook hanging over the carriage: it rides up when the carriage rises past it
    elif mn[1] >= 160 and mx[1] <= 190.5 and mx[2] > -10.5 and abs(c[0]) >= 3: g = 'armL' if c[0] < 0 else 'armR'
    elif mn[1] >= 160 and mx[1] <= 190.5: g = 'carriage'
    elif mn[1] >= 110 and mx[1] <= 130 and mx[2] > -12: g = 'qd'
    group[m] = g
# the QD arm: only the boom in front of the tower face swings; its root frame stays with the tower
print('dropped', int((group == 'drop').sum()), 'triangles of booster add-ons')
qd = group == 'qd'
group[qd & (cen[:, 2] < HINGE_QD[1] - 0.6)] = 'pad'

# ---- vertex colours from the base-colour atlas ----
u = np.clip((UV[:, 0] % 1.0) * 511, 0, 511).astype(int)
v = np.clip((UV[:, 1] % 1.0) * 511, 0, 511).astype(int)
col = bc[v, u] ** 2.2   # sRGB texels -> linear vertex colours (glTF COLOR_0 is linear)

# ---- to metres, origin on the axis at the ground ----
Pm = np.stack([(P[:, 0] - AX) * S, (P[:, 1] - Y0) * S, (P[:, 2] - AZ) * S], 1)
hm = lambda h: [(h[0] - AX) * S, 0.0, (h[1] - AZ) * S]
hmf = lambda h: [(h[0] - AX) * S, (h[1] - Y0) * S, (h[2] - AZ) * S]
NODES = {  # node origin (metres) in the root frame
    'pad': [0, 0, 0], 'carriage': [0, 0, 0], 'armL': hm(HINGE_L), 'armR': hm(HINGE_R), 'qd': hm(HINGE_QD),
    'booster': [0, 0, 0], 'ship': [0, 0, 0]}
for f in FINS: NODES[f['name']] = hmf(f['hinge'])
CABLE_TOP = float(Pm[I[group == 'cable'].ravel(), 1].max())
NODES['hook'] = [0, 0, 0]
NODES['cable'] = [0, CABLE_TOP, 0]   # scale.y shortens them from the top
MATS = ['frame', 'steel', 'tile']   # tower steel-work, stainless hull, black tiles/hardware on the rocket

def gridfin(W=3.0, L=3.9, D=0.55, bar=0.11, n=5):
    """A grid fin in its own frame: hinge line along x at z=0, the panel out along +z to L, its lattice faces up and down
    (depth D along y, centred). An outer frame of four bars and an n x n square lattice inside: boxes, flat-shaded."""
    boxes = [(0, 0.1 + bar / 2, W, bar), (0, L - bar / 2, W, bar), (-W / 2 + bar / 2, L / 2 + 0.05, bar, L - 0.1), (W / 2 - bar / 2, L / 2 + 0.05, bar, L - 0.1)]
    for i in range(1, n + 1):
        boxes.append((-W / 2 + W * i / (n + 1), L / 2 + 0.05, bar * 0.55, L - 0.1))
        boxes.append((0, 0.1 + (L - 0.1) * i / (n + 1), W, bar * 0.55))
    boxes.append((0, 0.05, 0.5, 0.1))   # the hinge root
    P, Nn, T = [], [], []
    for cx, cz, sx, sz in boxes:
        for ax in range(3):
            for sg in (-1, 1):
                nv = [0, 0, 0]; nv[ax] = sg
                u = [(1, 2), (2, 0), (0, 1)][ax]
                half = np.array([sx / 2, D / 2, sz / 2])
                base = len(P)
                for a, b in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                    v = np.zeros(3); v[ax] = sg; v[u[0]] = a; v[u[1]] = b
                    P.append(np.array([cx, 0, cz]) + v * half); Nn.append(nv)
                tri = [(0, 1, 2), (0, 2, 3)] if sg > 0 else [(0, 2, 1), (0, 3, 2)]
                T += [[base + i, base + j, base + k] for i, j, k in tri]
    P = np.array(P, '<f4'); Nn = np.array(Nn, '<f4'); T = np.array(T, '<u2')
    c4 = np.tile(np.array([[9, 9, 10, 255]], '<u1'), (len(P), 1))
    return P, Nn, c4, T

HOOK_Y = 135.1   # metres: just under the forward flaps; resting on the chopsticks' top chord (134.8) when stacked
def hooks(r=0.24, x0=4.7, x1=6.0, seg=12):
    """Two catch hooks in the final ship frame (flaps on +-x): a round bar out from the hull under each forward flap,
    with a lip turned up at its end so it can't slide off the arm."""
    P, Nn, T = [], [], []
    def tube(a, b, rr):
        a, b = np.array(a, float), np.array(b, float); ax = (b - a) / np.linalg.norm(b - a)
        u = np.cross(ax, [0, 1, 0] if abs(ax[1]) < 0.9 else [1, 0, 0]); u /= np.linalg.norm(u); v = np.cross(ax, u)
        base = len(P)
        for k in range(seg):
            t = 2 * np.pi * k / seg; d = np.cos(t) * u + np.sin(t) * v
            P.append(a + d * rr); Nn.append(d); P.append(b + d * rr); Nn.append(d)
        for k in range(seg):
            i0, i1 = base + 2 * k, base + 2 * ((k + 1) % seg)
            T.append([i0, i1, i0 + 1]); T.append([i1, i1 + 1, i0 + 1])
        for end, sg in ((a, -1), (b, 1)):   # caps
            c = len(P); P.append(end); Nn.append(ax * sg)
            for k in range(seg):
                i0 = base + 2 * k + (0 if sg < 0 else 1); i1 = base + 2 * ((k + 1) % seg) + (0 if sg < 0 else 1)
                T.append([c, i1, i0] if sg < 0 else [c, i0, i1])
    for sg in (-1, 1):
        tube([sg * x0, HOOK_Y, 0], [sg * x1, HOOK_Y, 0], r)
        tube([sg * (x1 - 0.1), HOOK_Y - 0.08, 0], [sg * (x1 - 0.1), HOOK_Y + 0.38, 0], r * 0.85)
    return np.array(P), np.array(Nn), np.array(T)

bins = bytearray(); views = []; accs = []; meshes = []
def add(arr, target, ctype, typ, mm=False, norm=False):
    global bins
    while len(bins) % 4: bins += b'\0'
    off = len(bins); bins += arr.tobytes()
    views.append({'buffer': 0, 'byteOffset': off, 'byteLength': arr.nbytes, 'target': target})
    a = {'bufferView': len(views) - 1, 'componentType': ctype, 'count': len(arr) if arr.ndim > 1 else arr.size, 'type': typ}
    if norm: a['normalized'] = True
    if mm: a['min'] = arr.min(0).tolist(); a['max'] = arr.max(0).tolist()
    accs.append(a); return len(accs) - 1

node_list = [{'name': 'X1_Starship', 'children': []}]
stats = {}
for g in ['pad', 'carriage', 'armL', 'armR', 'qd', 'hook', 'cable', 'booster', 'ship'] + [f['name'] for f in FINS]:
    T = I[group == g]
    o = np.array(NODES[g])
    prims = []
    rocket = g in ('booster', 'ship')
    dark = col[T].mean(1).mean(1) < 0.05
    if g == 'ship':
        # the heat shield: every face of the ship on its smooth side (model -x, so the hull's windward half and the
        # under half of each flap) is tile black; the other side is all steel
        dark = N[T].mean(1)[:, 0] < 0
    fin = g.startswith('fin')
    for mi, sel in ([(1, ~dark), (2, dark)] if rocket else [(2, np.ones(len(T), bool))] if fin else [(0, np.ones(len(T), bool))]):
        TT = T[sel]
        if not len(TT): continue
        used, inv = np.unique(TT.ravel(), return_inverse=True)
        idx = inv.reshape(-1, 3).astype('<u2' if len(used) < 65536 else '<u4')
        if fin:
            # the source plate is a box turned in plan; it is replaced by a proper grid fin (see gridfin())
            pos, nrm, c4, idx = gridfin()
        else:
            pos = (Pm[used] - o).astype('<f4')
            nrm = N[used]
            nrm = (nrm / np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-9)).astype('<f4')
            c4 = np.concatenate([np.round(col[used] * 255), np.full((len(used), 1), 255)], 1).astype('<u1')
            if g == 'ship':
                if mi == 2:
                    c4[:, :3] = 6                                   # tiles
                else:
                    lo = c4[:, :3].mean(1) < 120
                    c4[lo, :3] = 170                                # old black graphics on the steel side -> steel
                    hp, hn, hidx = hooks()
                    idx = np.concatenate([idx.astype('<u4'), hidx.astype('<u4') + len(pos)])
                    idx = idx.astype('<u2' if len(pos) + len(hp) < 65536 else '<u4')
                    hp = np.array([[p[2], p[1], -p[0]] for p in hp])  # undo the turn applied below: built in the final frame
                    hn = np.array([[n[2], n[1], -n[0]] for n in hn])
                    pos = np.concatenate([pos, hp.astype('<f4')]); nrm = np.concatenate([nrm, hn.astype('<f4')])
                    c4 = np.concatenate([c4, np.tile(np.array([[95, 98, 104, 255]], '<u1'), (len(hp), 1))])
                # turn the ship a quarter about its axis: flaps (and hooks) toward the chopsticks on +-x, heat shield
                # toward the tower (-z). x' = -z, z' = x
                pos = np.stack([-pos[:, 2], pos[:, 1], pos[:, 0]], 1).astype('<f4')
                nrm = np.stack([-nrm[:, 2], nrm[:, 1], nrm[:, 0]], 1).astype('<f4')
        ip = add(pos, 34962, 5126, 'VEC3', True); inn = add(nrm, 34962, 5126, 'VEC3')
        ic = add(c4, 34962, 5121, 'VEC4', norm=True)
        ii = add(idx.ravel(), 34963, 5123 if idx.dtype == np.dtype('<u2') else 5125, 'SCALAR')
        prims.append({'attributes': {'POSITION': ip, 'NORMAL': inn, 'COLOR_0': ic}, 'indices': ii, 'material': mi})
    meshes.append({'name': g, 'primitives': prims})
    if fin:
        # child of the booster node: translation relative to it; extras.fold is the stowed angle about x (degrees)
        bi = next(i for i, n in enumerate(node_list) if n['name'] == 'booster')
        # yaw to the radial, as a pair on each side facing the chopsticks (+-x, 30 degrees either side of it), so in the
        # catch each pair rests on one arm's top chord; hinge just off the hull
        yaw = float(np.arctan2(o[0], o[2]))
        yaw = np.sign(yaw) * (np.radians(60) if abs(yaw) < np.pi / 2 else np.radians(120))
        o = np.array([np.sin(yaw) * 5.62, o[1], np.cos(yaw) * 5.62])
        node_list.append({'name': g, 'mesh': len(meshes) - 1, 'translation': [float(x) for x in o - np.array(NODES['booster'])],
                          'extras': {'fold': 90, 'yaw': round(float(np.degrees(yaw)), 3)}})
        node_list[bi].setdefault('children', []).append(len(node_list) - 1)
    else:
        node_list.append({'name': g, 'mesh': len(meshes) - 1, 'translation': [float(x) for x in o]})
        node_list[0]['children'].append(len(node_list) - 1)
    stats[g] = len(T) if not fin else sum(len(x) for x in [gridfin()[3]])

def pm(name, metal, rough):
    return {'name': name, 'doubleSided': True, 'pbrMetallicRoughness': {'baseColorFactor': [1, 1, 1, 1], 'metallicFactor': metal, 'roughnessFactor': rough}}
mats = [pm('frame', 0.35, 0.65), pm('steel', 0.8, 0.3), pm('tile', 0.0, 0.85)]

# facts for the JS, metres in the root frame
def ext(g):
    T = I[group == g]; Q = Pm[T.ravel()]; return [Q.min(0).round(2).tolist(), Q.max(0).round(2).tolist()]
facts = {
    'scale': S, 'split': round((SPLIT - Y0) * S, 2), 'base': round((42.0 - Y0) * S, 2), 'top': round((212.8 - Y0) * S, 2),
    'radius': round(7.5 * S, 2), 'hinge': {k: [round(x, 2) for x in NODES[k]] for k in ('armL', 'armR', 'qd')},
    'fins': len(FINS), 'finY': round(float(np.mean([NODES[f['name']][1] for f in FINS])), 3), 'finD': 0.55, 'cableTop': round(CABLE_TOP, 2), 'cableLen': round(CABLE_TOP - float(Pm[I[group == 'cable'].ravel(), 1].min()), 2), 'hookY': HOOK_Y, 'hookX': 6.0, 'box': {g: ext(g) for g in stats}}
G = {'asset': {'version': '2.0', 'generator': 'x1 tools/starship/prep.py', 'extras': {'x1': facts}}, 'scene': 0,
     'scenes': [{'nodes': [0]}], 'nodes': node_list, 'meshes': meshes, 'materials': mats,
     'accessors': accs, 'bufferViews': views, 'buffers': [{'byteLength': len(bins)}]}
js = json.dumps(G, separators=(',', ':')).encode(); js += b' ' * ((4 - len(js) % 4) % 4)
while len(bins) % 4: bins += b'\0'
glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bins)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(bins), 0x004E4942) + bins
open(dst, 'wb').write(glb)
print('triangles', stats, 'total', sum(stats.values()), 'bytes', len(glb))
print(json.dumps(facts))
