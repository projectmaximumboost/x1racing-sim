# Airframe source

This project uses copies of files from the X1 SkyRacer design repo. Update them on purpose, then rerun `tests/lap.js` and `tests/top_speed.js`, because mass or fan changes move lap times.

Repo: https://github.com/projectmaximumboost/x1skyracer

| File here | Source file | Commit |
| --- | --- | --- |
| `X1_SkyRacer_FanTilt_web.glb` | `X1_SkyRacer_FanTilt/X1_SkyRacer_FanTilt_web.glb` | 35396c7 (branch `iter/cockpit-sim-screen`: simulator cockpit) |
| `x1_skyracer_manifest.json` | `X1_SkyRacer_PteroSim/x1_skyracer_manifest.json` | 01e7aee |
| `../assets/x1-logo.png` | `assets/x1-logo.png` | 32897ce |
| `../src/liveries.json` | `X1_SkyRacer_LiveryXXONE/X1_SkyRacer_LiveryXXONE_Viewer.html` and `X1_SkyRacer_LiveryYonder01/X1_SkyRacer_LiveryYonder01_Viewer.html`, packed by `tools/livery/pack.py` | working copies of 12 Nov 2026 (branches `iter/livery-xxone-51`, `iter/livery-yonder-01`) |

Numbers typed into `src/physics.js` from `X1_SkyRacer_FanTilt/FAN_TILT_RESULTS.md` (f8133f6): race CG and fan-tilt geometry.

## Values in `src/physics.js` that differ from or are not in the design files

| Value | Sim | Status |
| --- | --- | --- |
| LTO capacity | 7.5 kWh | Matches the kit |
| LTO charge and discharge limit | 375 kW (50C) | Stated by Mac, Nov 2026; kit has 308 kW |
| Boost ceiling | 2,000 hp | Stated output ceiling; kit burst is 1,913 hp |
| LTO efficiency | 97 % each way | Assumed |
| Rotor inertia | 1.2 kg m2 | Assumed |
| Rotor speed at full command | 4,000 rpm | Assumed |
| Pusher minimum thrust | 10 % | Stated by Mac, Nov 2026, for engine cooling |
| Duct ram drag | Off | Matches the trim scripts |
| Mean wing incidence | 4.5 deg | Rounded from the trim results |

## Cockpit in the airframe GLB (35396c7)

The GLB now has an open cockpit under the canopy. Nothing about mass, fans or geometry outside the cockpit changed, so the physics values above still apply.

| Node | What it is |
| --- | --- |
| `Cockpit_Tub`, `Cockpit_Deck`, `Dash`, `Console` | Cabin liner, matt decks under the glass, dash beam, centre console |
| `Dash_Screen` | Housing of the one centre screen |
| `Screen_Display` | The screen face: 0.332 x 0.207 m, UVs 0 to 1 (left to right, bottom to top). Give it a canvas texture to show flight data |
| `Stick` | Side-stick on the console; rotate it about its own origin |
| `Eye_L`, `Eye_R`, `Screen_Centre`, `Stick_Pivot` | Empty nodes: design eye points, screen centre, stick pivot |

Names the sim already uses are unchanged: `Canopy`, `Canopy_Frame`, `Seat_*`, `Footrest_*`, `Cockpit_Floor`, `Firewall`, the rotors and fans. `Canopy_Frame` now holds the one-piece canopy seal and the hoop.
