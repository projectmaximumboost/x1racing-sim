#!/usr/bin/env python3
"""Build the single-file game: dist/X1_SkyRacer_GrandPrix.html (page content, published as the artifact)
and dist/X1_SkyRacer_GrandPrix_standalone.html (full document, opens directly in a browser).
Run from anywhere: python3 tools/build.py"""
import base64, os, re
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rd = lambda p: open(os.path.join(R, p), encoding="utf-8").read()
s = rd("src/shell.html").replace("@@LOGO@@", rd("src/logo.b64"))
glb = base64.b64encode(open(os.path.join(R, "airframe/X1_SkyRacer_FanTilt_web.glb"), "rb").read()).decode()
phys = rd("src/physics.js").replace("if(typeof module!=='undefined')module.exports=X1P;", "")
course = re.sub(r"if\(typeof module!=='undefined'\).*", "", rd("src/course.js"))
out = s + '<script id="glb" type="text/plain">' + glb + "</script>\n<script>" + phys + "\n" + course + "\n" + rd("src/game.js") + "</script>\n"
os.makedirs(os.path.join(R, "dist"), exist_ok=True)
open(os.path.join(R, "dist/X1_SkyRacer_GrandPrix.html"), "w", encoding="utf-8").write(out)
head = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>[hidden]{display:none!important}</style></head><body>'
open(os.path.join(R, "dist/X1_SkyRacer_GrandPrix_standalone.html"), "w", encoding="utf-8").write(head + out + "</body></html>")
print(f"built {len(out)/1e6:.2f} MB")
