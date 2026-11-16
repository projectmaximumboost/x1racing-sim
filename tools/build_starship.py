#!/usr/bin/env python3
"""Build the standalone Starship launch page from the sim's own environment files plus src/starship/.

  dist/X1_Starship_Launch_standalone.html   one file: opens straight in a browser (tower pack embedded)
  dist/X1_Starship_Launch.html              page content only (for the Claude artifact host)
  dist/X1_SkyRacer_Starship.glb             the tower pack, for the sim to fetch when it is integrated

Environment, unchanged from src/game: core, renderer + sky, water, textures, spires, shore and paddock, cruise ships
(only if X1_SkyRacer_Ships.bin sits beside the page), twilight. New: src/starship/01_stubs.js (race-only names the
environment touches), 26_starship.js (tower, chopsticks, vehicles, flight script: written against the sim's names so
it drops into src/game as is), 90_seq.js (cameras, controls, loop). Same checks as tools/build.py.
Run from anywhere: python3 tools/build_starship.py"""
import base64, os, re, shutil, subprocess, sys, tempfile

R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rd = lambda p: open(os.path.join(R, p), encoding="utf-8").read()
ENV = ["00_core.js", "01_renderer_sky.js", "02_water.js", "03_textures.js", "04_spires.js", "05_land.js", "14_ships.js", "22_twilight.js"]
parts = [("src/game/" + f, rd("src/game/" + f)) for f in ENV[:1]] + [("src/starship/01_stubs.js", rd("src/starship/01_stubs.js"))]
parts += [("src/game/" + f, rd("src/game/" + f)) for f in ENV[1:]]
parts += [("src/starship/" + f, rd("src/starship/" + f)) for f in ("26_starship.js", "90_seq.js")]
game = "(()=>{'use strict';\n" + "\n".join(s for _, s in parts) + "\n})();\n"
phys = re.sub(r"if\s*\(typeof module\s*!==\s*['\"]undefined['\"]\)\s*module\.exports\s*=\s*X1P;", "", rd("src/physics.js"))
course = re.sub(r"if\s*\(typeof module\s*!==\s*['\"]undefined['\"]\).*", "", rd("src/course.js"))
script = phys + "\n" + course + "\n" + game.replace("@@F9@@", "false")

errs, seen = [], {}
for f, s in parts:
    for m in re.finditer(r"^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)", s, re.M):
        if m.group(1) in seen and seen[m.group(1)] != f:
            errs.append(f"function {m.group(1)} is declared in both {seen[m.group(1)]} and {f}")
        seen.setdefault(m.group(1), f)
node = shutil.which("node")
if node:
    with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8") as t:
        t.write(script)
    r = subprocess.run([node, "--check", t.name], capture_output=True, text=True)
    os.unlink(t.name)
    if r.returncode:
        errs.append("the joined script does not parse:\n" + r.stderr[-800:])
if errs:
    print("BUILD FAILED"); [print("  " + e) for e in errs]; sys.exit(1)

glbp = os.path.join(R, "dist/X1_SkyRacer_Starship.glb")
if not os.path.exists(glbp):
    sys.exit("dist/X1_SkyRacer_Starship.glb is missing: python3 -I tools/starship/prep.py starship_tower.glb dist/X1_SkyRacer_Starship.glb")
glb = base64.b64encode(open(glbp, "rb").read()).decode()
flag = rd("src/x1flag.b64").strip()
shell = (rd("src/starship/shell.html").replace("@@CSS@@", rd("src/starship/style.css")).replace("@@LOGO@@", rd("src/logo.b64").strip())
         .replace("@@X1FLAG@@", flag).replace("@@TITLE@@", "X1 Racing Starship Launch"))
script = script.replace("@@X1FLAG@@", flag)
out = shell + '<script id="stglb" type="text/plain">' + glb + "</script>\n<script>" + script + "</script>\n"
head = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>[hidden]{display:none!important}</style></head><body>'
open(os.path.join(R, "dist/X1_Starship_Launch.html"), "w", encoding="utf-8").write(out)
open(os.path.join(R, "dist/X1_Starship_Launch_standalone.html"), "w", encoding="utf-8").write(head + out + "</body></html>")
print(f"built X1_Starship_Launch  {len(out)/1e6:.2f} MB")
