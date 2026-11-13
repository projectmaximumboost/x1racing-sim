#!/usr/bin/env python3
"""Build the single-file game pages from one source tree.

  dist/X1_SkyRacer_GrandPrix.html             the Grand Prix, page content only (published as the artifact)
  dist/X1_SkyRacer_GrandPrix_standalone.html  the Grand Prix, full document (opens directly in a browser)
  dist/X1_SkyRacer_Falcon9.html               the same sim plus the Falcon 9 launch pad, page content only
  dist/X1_SkyRacer_Falcon9_standalone.html    ... full document

The two pages differ only in the F9_ON constant and the page title. The Falcon 9 page also loads
dist/X1_SkyRacer_F9.glb from the folder it is served from.

Before writing anything the joined script is checked:
  - it must parse (node --check, which also catches a let/const declared twice across files)
  - no top-level function may be declared twice across src/game/*.js
  - every name in the window.__x1 debug export must be declared somewhere

Run from anywhere: python3 tools/build.py"""
import base64, datetime, os, re, shutil, subprocess, sys, tempfile

R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rd = lambda p: open(os.path.join(R, p), encoding="utf-8").read()

VARIANTS = [
    # file stem, page title, F9_ON
    ("X1_SkyRacer_GrandPrix", "X1 Racing SkyRacer Flying Car Grand Prix", "false"),
    ("X1_SkyRacer_Falcon9", "X1 SkyRacer Falcon 9", "true"),
]

# src/game/*.js are sections of one script, joined in file-name order (they share one scope)
files = sorted(f for f in os.listdir(os.path.join(R, "src/game")) if f.endswith(".js"))
parts = {f: rd("src/game/" + f) for f in files}
# each file is plain top-level statements; together they run inside one strict-mode function, so nothing leaks to the page
game = "(()=>{'use strict';\n" + "\n".join(parts[f] for f in files) + "\n})();\n"
phys = rd("src/physics.js").replace("if(typeof module!=='undefined')module.exports=X1P;", "")
phys = re.sub(r"if\s*\(typeof module\s*!==\s*['\"]undefined['\"]\)\s*module\.exports\s*=\s*X1P;", "", phys)
course = re.sub(r"if\s*\(typeof module\s*!==\s*['\"]undefined['\"]\).*", "", rd("src/course.js"))


def check(script):
    """Fail the build on the mistakes a shared scope makes easy."""
    errs = []
    # 1. a top-level function declared in two places (the later one silently wins)
    seen = {}
    for f in files:
        for m in re.finditer(r"^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)", parts[f], re.M):
            if m.group(1) in seen and seen[m.group(1)] != f:
                errs.append(f"function {m.group(1)} is declared in both {seen[m.group(1)]} and {f}")
            seen.setdefault(m.group(1), f)
    # 2. every shorthand name in the window.__x1 export exists
    m = re.search(r"window\.__x1\s*=\s*\{", game)
    if m:
        i, depth, top, cur = m.end(), 1, [], ""
        while depth and i < len(game):
            c = game[i]
            if c in "{([":
                depth += 1
            elif c in "})]":
                depth -= 1
            if depth == 1 and c == ",":
                top.append(cur)
                cur = ""
            elif depth >= 1:
                cur += c
            i += 1
        top.append(cur)
        everything = phys + course + game
        for item in top:
            name = item.strip()
            if not re.fullmatch(r"[A-Za-z_$][\w$]*", name):
                continue  # key: value, or a method
            if name in ("THREE",):
                continue  # loaded from the CDN, not declared here
            n = re.escape(name)
            if not re.search(r"(?:\b(?:const|let|var)\s[^;]*?[\s,]|\b(?:const|let|var)\s+)" + n + r"\s*=|\bfunction\s*\*?\s*" + n + r"\b|\bclass\s+" + n + r"\b", everything):
                errs.append(f"window.__x1 exports {name}, which is not declared anywhere")
    # 3. the whole script parses; this also reports a let/const declared twice
    node = shutil.which("node")
    if node:
        with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8") as t:
            t.write(script)
        r = subprocess.run([node, "--check", t.name], capture_output=True, text=True)
        os.unlink(t.name)
        if r.returncode:
            tail = [l for l in r.stderr.strip().splitlines() if l.strip()]
            errs.append("the joined script does not parse: " + (tail[-1] if tail else "syntax error"))
            for l in tail[:4]:
                errs.append("    " + l[:200])
    else:
        print("note: node not found, syntax check skipped")
    if errs:
        print("BUILD FAILED")
        for e in errs:
            print("  " + e)
        sys.exit(1)


build = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
glb = base64.b64encode(open(os.path.join(R, "airframe/X1_SkyRacer_FanTilt_web.glb"), "rb").read()).decode()
shell = rd("src/shell.html").replace("@@CSS@@", rd("src/style.css")).replace("@@LOGO@@", rd("src/logo.b64"))
flag = rd("src/x1flag.b64").strip()
liveries = rd("src/liveries.json").strip()   # XXONE 51 and Yonder 01: tools/livery/pack.py
head = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>[hidden]{display:none!important}</style></head><body>'
os.makedirs(os.path.join(R, "dist"), exist_ok=True)

checked = False
for stem, title, f9 in VARIANTS:
    script = phys + "\n" + course + "\n" + game.replace("@@BUILD@@", build).replace("@@F9@@", f9)
    if not checked:
        check(script)
        checked = True
    script = script.replace("@@X1FLAG@@", flag)
    out = (shell.replace("@@TITLE@@", title).replace("@@X1FLAG@@", flag) + '<script id="glb" type="text/plain">' + glb + "</script>\n"
           + '<script id="liveries" type="application/json">' + liveries + "</script>\n<script>" + script + "</script>\n")
    open(os.path.join(R, f"dist/{stem}.html"), "w", encoding="utf-8").write(out)
    open(os.path.join(R, f"dist/{stem}_standalone.html"), "w", encoding="utf-8").write(head + out + "</body></html>")
    print(f"built {stem}  {len(out)/1e6:.2f} MB")
