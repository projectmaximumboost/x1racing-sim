# X1 Sim

The X1 Racing SkyRacer Flying Car Grand Prix: a browser flight simulator and air race for the X1 SkyRacer.

The SkyRacer is at the concept and design stage. Aero and propulsion numbers in this sim are estimates, not test data. X1 Racing is uncrewed and remotely piloted; the 500 lb in the seats is ballast.

## Play

Open `dist/X1_SkyRacer_GrandPrix_standalone.html` in Chrome. It needs internet to load Three.js and fonts. Press H in the game for controls.

## Build

    python3 tools/build.py

The build embeds the airframe model and logo in one HTML file. Use `dist/X1_SkyRacer_GrandPrix.html` for the published artifact; it has no page wrapper because the host adds one.

## Layout

| Folder | Holds |
| --- | --- |
| `src/physics.js` | Flight model, flight computer, course builder, SI pilot, autoland |
| `src/course.js` | Spires, launch pad, shoreline, SI launch route |
| `src/game.js` | 3D scene, HUD, input, race rules, lap storage |
| `src/shell.html` | Page layout, styles, help screen |
| `airframe/` | Copies of the airframe data, with their source in `SOURCE.md` |
| `tests/` | Headless checks |
| `tools/` | Build script |

## Tests

Run from `tests/` with Node, for example `node lap.js`. No install is needed.

| Test | Checks |
| --- | --- |
| `lap.js` | SI flying laps and spire clearance |
| `top_speed.js` | Top speed against the fan-tilt trim study |
| `lto_energy.js` | Pack energy in and out per lap |
| `autoland.js` | Autoland from points around the course |
| `yaw_response.js` | Yaw stick response in hover and at speed |
| `boost_trigger.js` | Power limit against left trigger position |
| `takeoff_hover.js` | Takeoff, rock-back and hover drift |
| `si_launch.js` | SI launch route clearance and gate entry |

## Baseline

SI flying laps run about 60.4 to 60.7 s on the current course. Top speed is about 175 mph at 1,500 hp.

## Branches

`main` is the trunk. Iterations use `iter/<area>-<what>`, and commit messages start with the area, such as `Sim: ...` or `Course: ...`.
