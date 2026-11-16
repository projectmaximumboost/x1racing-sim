"""Give X1_SkyRacer_Starship.glb the Starship that flew Flight 15: Ship 42, a Block 3 (V3) ship.

prep.py cuts the tower model into its moving parts; its ship is the source model's generic one (flaps straight out to
the sides, 180 degrees apart). This replaces only the 'ship' mesh, built here from code, and leaves the rest alone:

  hull       steel rings with the black heat shield on the windward half, tangent-ogive nose
  flaps      four, each its own node on its hinge line so the page can move them:
               aft pair   on the sides (90 degrees from the windward centre line), large
               fwd pair   on the nose cone, smaller, and shifted leeward: 120 degrees round from the windward centre
                          line, so they angle back away from the heat shield instead of sticking straight out
             node extras: flap 'aft'|'fwd', s (+1/-1 side), a [stowed, belly flop, landing] degrees leeward of the
             hinge's own radial. The page turns each about its local y by s * angle.
  catch pins two, on the sides at the base of the nose cone, just under the forward flaps (they rest on the chopsticks)
  engines    three sea-level and three vacuum Raptor nozzles in the skirt
  raceways   two, down the leeward side

Frame (the file's root frame, metres): +y up, the stack axis at x = z = 0, the chopsticks either side on +-x, the tower
at -z. The heat shield faces +z, away from the tower, as it does at Starbase; the leeward side, with the flaps angled
toward it, faces the tower. The hull keeps the model's own diameter and the ship's height, so the stack, the catch
heights and the tower are unchanged.

Safe to run on its own output. usage: python3 -I ship42.py in.glb out.glb"""
import json, struct, sys
import numpy as np

src, dst = sys.argv[1], sys.argv[2]
raw = open(src, 'rb').read()
jl = struct.unpack('<I', raw[12:16])[0]
J = json.loads(raw[20:20 + jl]); BIN = raw[20 + jl + 8:]
CT = {5120: 'i1', 5121: 'u1', 5122: '<i2', 5123: '<u2', 5125: '<u4', 5126: '<f4'}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}

def get(ai):
    a = J['accessors'][ai]; v = J['bufferViews'][a['bufferView']]; n = NC[a['type']]
    arr = np.frombuffer(BIN, CT[a['componentType']], a['count'] * n, v.get('byteOffset', 0) + a.get('byteOffset', 0))
    return arr.reshape(-1, n) if n > 1 else arr

F = J['asset']['extras']['x1']
Y0 = F['split']                      # 92.8: the ship stands on the hot-staging ring
TOP = F['top'] - 0.01                # 151.95
R = F['radius']                      # 5.31 (the model's hull; 9 m ships scale by R / 4.5)
K = R / 4.5
NOSE = 14.0 * K                      # the tapered part of the nose cone
YN = TOP - NOSE
PIN_Y = F.get('hookY', 135.1)        # resting on the chopsticks' top chord when stacked
SEG = 32
STEEL, TILE = 1, 2                   # materials in the file
RHO = (R * R + NOSE * NOSE) / (2 * R)  # tangent ogive

def nose_r(u):
    return float(np.sqrt(RHO * RHO - (NOSE * u) ** 2) + R - RHO)
def nose_slope(u):                   # dr/dy
    return float(-(NOSE * u) / np.sqrt(RHO * RHO - (NOSE * u) ** 2))

class Mesh:
    """Triangles gathered per material; every triangle has its own three vertices (flat colour, own normals)."""
    def __init__(self): self.P = {STEEL: [], TILE: []}; self.N = {STEEL: [], TILE: []}; self.C = {STEEL: [], TILE: []}
    def tri(self, mat, p, n, c):
        """p: three points; n: one normal or three; c: grey level. Wound to face along the normal."""
        p = [np.asarray(q, float) for q in p]
        n = [np.asarray(n, float)] * 3 if np.ndim(n) == 1 else [np.asarray(q, float) for q in n]
        if np.dot(np.cross(p[1] - p[0], p[2] - p[0]), n[0] + n[1] + n[2]) < 0: p = [p[0], p[2], p[1]]; n = [n[0], n[2], n[1]]
        for q, m in zip(p, n):
            self.P[mat].append(q); self.N[mat].append(m / max(np.linalg.norm(m), 1e-9)); self.C[mat].append(c)
    def quad(self, mat, a, b, c, d, n, col):
        n4 = [n] * 4 if np.ndim(n) == 1 else n
        self.tri(mat, [a, b, c], [n4[0], n4[1], n4[2]], col); self.tri(mat, [a, c, d], [n4[0], n4[2], n4[3]], col)
    def count(self): return sum(len(v) for v in self.P.values()) // 3

def ring_pt(r, y, th): return np.array([r * np.sin(th), y, r * np.cos(th)])   # th = 0 is the windward centre line (+z)

def band(M, y0, r0, s0, y1, r1, s1, steel, tile):
    """One ring of hull between two heights; s = dr/dy there (for the normals). Windward half tiled."""
    for k in range(SEG):
        t0, t1 = 2 * np.pi * k / SEG, 2 * np.pi * (k + 1) / SEG
        mid = (t0 + t1) / 2
        windward = np.cos(mid) > 0
        nr = lambda th, s: np.array([np.sin(th), -s, np.cos(th)])
        M.quad(TILE if windward else STEEL, ring_pt(r0, y0, t0), ring_pt(r0, y0, t1), ring_pt(r1, y1, t1), ring_pt(r1, y1, t0),
               [nr(t0, s0), nr(t1, s0), nr(t1, s1), nr(t0, s1)], tile if windward else steel)

def tube(M, a, b, r, seg, col, mat=None, wind=None, caps=True):
    """Cylinder from a to b. mat fixed, or by `wind`: faces looking along it (the windward side) are tile."""
    a, b = np.asarray(a, float), np.asarray(b, float); ax = (b - a) / np.linalg.norm(b - a)
    u = np.cross(ax, [0, 0, 1] if abs(ax[2]) < 0.9 else [1, 0, 0]); u /= np.linalg.norm(u); v = np.cross(ax, u)
    d = lambda k: np.cos(2 * np.pi * k / seg) * u + np.sin(2 * np.pi * k / seg) * v
    pick = lambda n: (mat, col) if wind is None else ((TILE, 7) if np.dot(n, wind) > 0.2 else (STEEL, col))
    ra, rb = (r, r) if np.ndim(r) == 0 else r
    for k in range(seg):
        d0, d1 = d(k), d(k + 1); m, c = pick(d0 + d1)
        M.quad(m, a + d0 * ra, a + d1 * ra, b + d1 * rb, b + d0 * rb, [d0, d1, d1, d0], c)
        if caps:
            for e, rr, sg in ((a, ra, -1), (b, rb, 1)):
                m2, c2 = pick(ax * sg); M.tri(m2, [e, e + d0 * rr, e + d1 * rr], ax * sg, c2)

def box(M, c, ax, half, col, mat=STEEL):
    c = np.asarray(c, float); ax = [np.asarray(a, float) for a in ax]
    for i in range(3):
        j, k = (i + 1) % 3, (i + 2) % 3
        for sg in (-1, 1):
            o = c + ax[i] * half[i] * sg
            M.quad(mat, o - ax[j] * half[j] - ax[k] * half[k], o + ax[j] * half[j] - ax[k] * half[k],
                   o + ax[j] * half[j] + ax[k] * half[k], o - ax[j] * half[j] + ax[k] * half[k], ax[i] * sg, col)

# ---------------- the hull ----------------
H = Mesh()
RING = 1.83 * K                                        # one steel ring
ys = list(np.arange(Y0, YN - 0.3, RING)) + [YN]
for i in range(len(ys) - 1):
    band(H, ys[i], R, 0, ys[i + 1], R, 0, 170 + 9 * (i % 2), 6 + (i % 2))
us = [0, 0.11, 0.22, 0.33, 0.44, 0.55, 0.65, 0.74, 0.82, 0.89, 0.94, 0.975]
for i in range(len(us) - 1):
    u0, u1 = us[i], us[i + 1]
    band(H, YN + NOSE * u0, nose_r(u0), nose_slope(u0), YN + NOSE * u1, nose_r(u1), nose_slope(u1), 172 + 8 * (i % 2), 6 + (i % 2))
# the blunt tip
ut = us[-1]; yt = YN + NOSE * ut; rt = nose_r(ut); tip = np.array([0, yt + rt * 0.55, 0])
for k in range(SEG):
    t0, t1 = 2 * np.pi * k / SEG, 2 * np.pi * (k + 1) / SEG
    w = np.cos((t0 + t1) / 2) > 0
    H.tri(TILE if w else STEEL, [ring_pt(rt, yt, t0), ring_pt(rt, yt, t1), tip],
          [np.array([np.sin(t0), 0.8, np.cos(t0)]), np.array([np.sin(t1), 0.8, np.cos(t1)]), np.array([0, 1, 0])], 6 if w else 176)

# engine bay: a recessed plate, three sea-level Raptors in the middle and three vacuum Raptors round them
for k in range(SEG):
    t0, t1 = 2 * np.pi * k / SEG, 2 * np.pi * (k + 1) / SEG
    H.tri(STEEL, [ring_pt(R * 0.99, Y0 + 1.3, t0), ring_pt(R * 0.99, Y0 + 1.3, t1), [0, Y0 + 1.3, 0]], [0, -1, 0], 38)
for i in range(3):
    a = np.radians(90 + 120 * i); c = np.array([np.sin(a), 0, np.cos(a)])
    tube(H, c * 0.85 * K + [0, Y0 + 1.5, 0], c * 0.85 * K + [0, Y0 - 0.3, 0], (0.25 * K, 0.65 * K), 12, 62, STEEL, caps=False)
    a = np.radians(30 + 120 * i); c = np.array([np.sin(a), 0, np.cos(a)])
    tube(H, c * 2.75 * K + [0, Y0 + 1.6, 0], c * 2.75 * K + [0, Y0 - 0.5, 0], (0.35 * K, 1.2 * K), 14, 70, STEEL, caps=False)

# raceways down the leeward side
for sg in (-1, 1):
    th = np.radians(180 + sg * 24); rad = np.array([np.sin(th), 0, np.cos(th)]); tan = np.array([np.cos(th), 0, -np.sin(th)])
    box(H, rad * (R + 0.1) + [0, (Y0 + 3 + YN - 1.5) / 2, 0], [rad, np.array([0, 1, 0]), tan], [0.14, (YN - 1.5 - Y0 - 3) / 2, 0.3], 150)

# catch pins: a round bar out from each side with a turned-up end, on a pad on the hull
PIN_X = 6.0
for s in (-1, 1):
    box(H, [s * (R + 0.02), PIN_Y + 0.25, 0], [np.array([1, 0, 0]), np.array([0, 1, 0]), np.array([0, 0, 1])], [0.06, 0.45, 0.7], 120)  # thin: the hull slides between closed arms
    tube(H, [s * (R - 0.2), PIN_Y, 0], [s * PIN_X, PIN_Y, 0], 0.24, 12, 95, STEEL)
    tube(H, [s * (PIN_X - 0.1), PIN_Y - 0.08, 0], [s * (PIN_X - 0.1), PIN_Y + 0.38, 0], 0.2, 10, 95, STEEL)

# ---------------- the flaps ----------------
def qmul(a, b):
    ax, ay, az, aw = a; bx, by, bz, bw = b
    return [aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx,
            aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz]
qY = lambda t: [0, np.sin(t / 2), 0, np.cos(t / 2)]
qZ = lambda t: [0, 0, np.sin(t / 2), np.cos(t / 2)]
def rot(q, v):
    x, y, z, w = q; v = np.asarray(v, float); u = np.array([x, y, z])
    return v + 2 * np.cross(u, np.cross(u, v) + w * v)

def flap(outline, s, t_root, t_tip):
    """A flap in its own frame: y along the hinge, x out along the span (toward s), +z the windward face (tiled)."""
    M = Mesh(); span = max(p[0] for p in outline)
    hz = lambda x: t_root + (t_tip - t_root) * (x / span)
    pts = [(s * x, y, hz(x)) for x, y in outline]
    cen = np.mean([[p[0], p[1]] for p in pts], 0)
    for i in range(len(pts)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        for sg, mat, col in ((1, TILE, 7), (-1, STEEL, 168)):
            M.tri(mat, [[cen[0], cen[1], sg * hz(span / 2)], [a[0], a[1], sg * a[2]], [b[0], b[1], sg * b[2]]], [0, 0, sg], col)
        e = np.array([b[0] - a[0], b[1] - a[1], 0]); n = np.cross(e, [0, 0, 1])
        if np.dot(n[:2], np.array([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]) - cen) < 0: n = -n
        M.quad(TILE, [a[0], a[1], -a[2]], [b[0], b[1], -b[2]], [b[0], b[1], b[2]], [a[0], a[1], a[2]], n, 9)
    return M

AFT_LEN = 12.7 * K; AFT_SPAN = 4.7 * K            # hinge length and span
FWD_LEN = 7.2 * K; FWD_SPAN = 3.6 * K
FWD_AZ = 120.0                                    # forward flaps: degrees round from the windward centre line
aft_y = Y0 + 1.6 + AFT_LEN / 2
uf = (1.2 * K + FWD_LEN / 2) / NOSE; fwd_y = YN + NOSE * uf; fwd_r = nose_r(uf); fwd_tilt = float(np.arctan(-nose_slope(uf)))
FLAPS = []
for s in (-1, 1):
    # aft: on the side, hinge parallel to the hull
    o = np.array([s * (R + 0.12), aft_y, 0.0])
    tube(H, o - [0, AFT_LEN / 2 + 0.5, 0], o + [0, AFT_LEN / 2 + 0.5, 0], 0.62, 10, 165, wind=np.array([0, 0, 1.0]))
    h = AFT_LEN / 2
    FLAPS.append(dict(name='flapA' + ('L' if s < 0 else 'R'), kind='aft', s=s, o=o, q=[0, 0, 0, 1], a=[32, 8, 62],
                      mesh=flap([(0.3, -h), (AFT_SPAN, -h + 0.7), (AFT_SPAN, h * 0.12), (0.3, h)], s, 0.3, 0.12)))
    # forward: on the nose cone, round toward the leeward side, hinge lying along the taper
    beta = np.radians(FWD_AZ - 90)
    q = qmul(qY(s * beta), qZ(s * fwd_tilt))
    rad = np.array([s * np.sin(np.radians(FWD_AZ)), 0, np.cos(np.radians(FWD_AZ))])
    o = rad * (fwd_r + 0.1) + [0, fwd_y, 0]
    hd = rot(q, [0, 1, 0])
    tube(H, o - hd * (FWD_LEN / 2 + 0.4), o + hd * (FWD_LEN / 2 + 0.4), 0.48, 10, 165, wind=np.array([0, 0, 1.0]))
    h = FWD_LEN / 2
    FLAPS.append(dict(name='flapF' + ('L' if s < 0 else 'R'), kind='fwd', s=s, o=o, q=q, a=[26, -6, 52],
                      mesh=flap([(0.3, -h), (FWD_SPAN, -h + 0.6), (FWD_SPAN, -h * 0.2), (0.3, h)], s, 0.24, 0.1)))

# ---------------- write the file back ----------------
bins = bytearray(); views = []; accs = []
def add(arr, target, ctype, typ, mm=False, norm=False):
    while len(bins) % 4: bins.extend(b'\0')
    off = len(bins); bins.extend(arr.tobytes())
    views.append({'buffer': 0, 'byteOffset': off, 'byteLength': arr.nbytes, 'target': target})
    a = {'bufferView': len(views) - 1, 'componentType': ctype, 'count': len(arr) if arr.ndim > 1 else arr.size, 'type': typ}
    if norm: a['normalized'] = True
    if mm: a['min'] = arr.min(0).tolist(); a['max'] = arr.max(0).tolist()
    accs.append(a); return len(accs) - 1

def prims_of(M):
    out = []
    for mat in (STEEL, TILE):
        if not M.P[mat]: continue
        P = np.array(M.P[mat], '<f4'); N = np.array(M.N[mat], '<f4'); g = np.array(M.C[mat], '<u1')
        C = np.stack([g, g, np.minimum(g.astype(int) + (2 if mat == STEEL else 1), 255).astype('<u1'), np.full(len(g), 255, '<u1')], 1)
        # weld identical vertices
        key = np.concatenate([np.round(P, 4), np.round(N, 3), C[:, :1].astype('<f4')], 1)
        _, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
        P, N, C = P[first], N[first], C[first]; idx = inv.astype('<u2' if len(P) < 65536 else '<u4')
        out.append({'attributes': {'POSITION': add(P, 34962, 5126, 'VEC3', True), 'NORMAL': add(N, 34962, 5126, 'VEC3'),
                                   'COLOR_0': add(C, 34962, 5121, 'VEC4', norm=True)},
                    'indices': add(idx.ravel(), 34963, 5123 if idx.dtype == np.dtype('<u2') else 5125, 'SCALAR'), 'material': mat})
    return out

nodes = [n for n in J['nodes'] if not str(n.get('name', '')).startswith('flap')]
keep = len(nodes)
meshes = []
for m in J['meshes'][:max(n['mesh'] for n in nodes if 'mesh' in n) + 1]:
    if m['name'] == 'ship':
        meshes.append({'name': 'ship', 'primitives': prims_of(H)}); continue
    ps = []
    for p in m['primitives']:
        idx = get(p['indices'])
        ps.append({'attributes': {'POSITION': add(get(p['attributes']['POSITION']).astype('<f4'), 34962, 5126, 'VEC3', True),
                                  'NORMAL': add(get(p['attributes']['NORMAL']).astype('<f4'), 34962, 5126, 'VEC3'),
                                  'COLOR_0': add(get(p['attributes']['COLOR_0']).astype('<u1'), 34962, 5121, 'VEC4', norm=True)},
                   'indices': add(idx, 34963, 5123 if idx.dtype == np.dtype('<u2') else 5125, 'SCALAR'), 'material': p['material']})
    meshes.append({'name': m['name'], 'primitives': ps})
ship = next(n for n in nodes if n.get('name') == 'ship')
ship['children'] = []
for n in nodes:
    if 'children' in n and n is not ship: n['children'] = [c for c in n['children'] if c < keep]
for f in FLAPS:
    meshes.append({'name': f['name'], 'primitives': prims_of(f['mesh'])})
    nodes.append({'name': f['name'], 'mesh': len(meshes) - 1, 'translation': [float(x) for x in f['o']],
                  'rotation': [float(x) for x in f['q']], 'extras': {'flap': f['kind'], 's': f['s'], 'a': f['a']}})
    ship['children'].append(len(nodes) - 1)

allP = np.array(H.P[STEEL] + H.P[TILE])
reach = max(AFT_SPAN, FWD_SPAN)
F['box']['ship'] = [[round(-R - reach, 2), round(float(allP[:, 1].min()), 2), round(-R - reach, 2)],
                    [round(R + reach, 2), round(float(allP[:, 1].max()), 2), round(R + reach, 2)]]
F['hookY'] = PIN_Y; F['hookX'] = PIN_X
F['ship'] = {'vehicle': 'Ship 42 (Block 3), Flight 15', 'pinY': PIN_Y, 'windward': '+z', 'fwdFlapAz': FWD_AZ,
             'aftFlap': [round(AFT_LEN, 2), round(AFT_SPAN, 2)], 'fwdFlap': [round(FWD_LEN, 2), round(FWD_SPAN, 2)]}
J.update({'nodes': nodes, 'meshes': meshes, 'accessors': accs, 'bufferViews': views, 'buffers': [{'byteLength': len(bins)}]})
J['asset']['generator'] = 'x1 tools/starship/prep.py + ship42.py'
js = json.dumps(J, separators=(',', ':')).encode(); js += b' ' * ((4 - len(js) % 4) % 4)
while len(bins) % 4: bins.extend(b'\0')
glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bins)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(bins), 0x004E4942) + bytes(bins)
open(dst, 'wb').write(glb)
print('ship', H.count(), 'triangles; flaps', [f['mesh'].count() for f in FLAPS], '; file', len(glb), 'bytes')
print(json.dumps(F['ship']), 'nose from', round(YN, 2), 'fwd hinge', round(fwd_y, 2), 'r', round(fwd_r, 2), 'tilt', round(float(np.degrees(fwd_tilt)), 1))
