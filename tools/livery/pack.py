#!/usr/bin/env python3
"""Pack the XXONE 51 and Yonder 01 liveries for the sim.

The liveries are designed in the X1 SkyRacer design repo, where each has a viewer page holding its paint map
and decals (written by xxone_livery.py and yonder_livery.py there). This script lifts both out of those viewer
pages and writes src/liveries.json, which tools/build.py embeds in the game pages:

  base     the side-projected paint map for the body, sponsons and flank panels, as a PNG (2048 x 352)
  decals   each decal's parts, projection, box in model mm and PNG, at half the viewer's resolution
           (0.4 for the belly, which is rarely seen) and reduced to 64 colours where that is smaller
  recolor  which white or red painted parts take which colour (the viewers' RECOLOR tables)

Usage: python3 -I tools/livery/pack.py <XXONE viewer .html> <Yonder viewer .html>
Needs Pillow and numpy.
"""
import base64
import io
import json
import os
import re
import sys

import numpy as np
from PIL import Image

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "src", "liveries.json")

# part-name pattern, which GLB paint ('white' = Paint_White, 'red' = Paint_Red), new colour. First match wins.
def recolor(red, gold, blue):
    return [
        ["^Duct_", "white", blue],
        ["^(Front|Rear)_Wing_Fillet", "white", gold],
        ["^(Front_Wing|Rear_Wing)", "white", red],
        ["^Thruster_[LR]", "white", blue],
        ["^Thruster_[LR]", "red", gold],
        ["^Sponson_Pylon", "white", blue],
        ["^Fuel_Filler", "red", gold],
    ]


LIVERIES = [
    # id, name shown in the sim, the paint map's script id in the viewer, recolours
    ("xxone", "XXONE 51", "d-liv-xxone", recolor("#101012", "#c8102e", "#101012")),
    ("yonder", "Yonder 01", "d-liv-yonder", recolor("#d6121e", "#fab700", "#0b4898")),
]


def png_url(im):
    """Smallest of: 64-colour palette, or full RGBA."""
    a = io.BytesIO()
    im.quantize(colors=64, method=Image.FASTOCTREE, dither=Image.NONE).save(a, "PNG", optimize=True)
    b = io.BytesIO()
    im.save(b, "PNG", optimize=True)
    data = min(a.getvalue(), b.getvalue(), key=len)
    return "data:image/png;base64," + base64.b64encode(data).decode()


out = []
for (key, name, lid, rec), path in zip(LIVERIES, sys.argv[1:3]):
    s = open(path, encoding="utf-8").read()
    m = re.search(r'<script id="%s"[^>]*data-w="(\d+)" data-h="(\d+)">(.*?)</script>' % lid, s, re.S)
    if not m:
        sys.exit(f"{path}: no {lid} paint map; is this the {name} viewer?")
    w, h = int(m.group(1)), int(m.group(2))
    raw = np.frombuffer(base64.b64decode(re.sub(r"\s", "", m.group(3))), dtype=np.uint8).reshape(h, w, 4)
    base = Image.fromarray(np.flipud(raw), "RGBA").convert("RGB")  # stored keel-first; a PNG is top-down
    buf = io.BytesIO()
    base.save(buf, "PNG", optimize=True)
    decals = []
    for d in json.loads(re.search(r'<script id="d-decals"[^>]*>(.*?)</script>', s, re.S).group(1)):
        im = Image.open(io.BytesIO(base64.b64decode(d["png"].split(",")[1]))).convert("RGBA")
        k = 0.4 if "belly" in d["id"] else 0.5
        im = im.resize((max(8, round(im.width * k)), max(8, round(im.height * k))), Image.LANCZOS)
        decals.append(dict(id=d["id"], parts=d["parts"], proj=d["proj"], nmin=d["nmin"], box=d["box"],
                           clear_glass=bool(d.get("clear_glass")), png=png_url(im)))
    out.append(dict(id=key, name=name, base="data:image/png;base64," + base64.b64encode(buf.getvalue()).decode(),
                    recolor=rec, decals=decals))
    print(f"{name}: paint map {w} x {h}, {len(decals)} decals")
json.dump(out, open(OUT, "w"), separators=(",", ":"))
print(f"wrote {OUT}  {os.path.getsize(OUT) / 1024:.0f} KB")
