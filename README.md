# X1 Sim

The X1 Racing SkyRacer Flying Car Grand Prix: a browser flight simulator and air race for the X1 SkyRacer.

The SkyRacer is at the concept and design stage. Aero and propulsion numbers in this sim are estimates, not test data. X1 Racing is uncrewed and remotely piloted; the 500 lb in the seats is ballast.

## Play

Open `dist/X1_SkyRacer_GrandPrix_standalone.html` in Chrome. It needs internet to load Three.js and fonts. Press H in the game for controls.

`dist/X1_SkyRacer_Falcon9_standalone.html` is the same sim with a Falcon 9 on a launch pad beside the course: a launch in the opening sequence, a T-minus countdown (C, or the Launch F9 button, while the SI is flying) and a Starlink train in twilight. It loads `X1_SkyRacer_F9.glb` from the folder it is served from, so open it from a web server.

## Loading screen

The sim opens on a black screen with the X1 Racing logo and a boost gauge reading BOOSTING. The needle follows the load, moving like a boost needle (a sprung needle with flutter), and never reaches full boost before 2.5 s however fast the load is. At full boost it holds 0.5 s, then the logo and gauge fly out past the camera while an iris opens on the opening sequence. The loader is a small script at the top of `src/shell.html`, so it shows before Three.js has downloaded; `tests/loader_needle.js` checks its timing with a fake clock.

## Build

    python3 tools/build.py

One source tree builds both pages. They differ only in the `F9_ON` constant and the page title, which the build sets; everything Falcon 9 is behind `F9_ON`. Each page is one HTML file with the airframe model and logo embedded. The files without `_standalone` are for the published artifacts; they have no page wrapper because the host adds one.

The build stops with a message if the joined script does not parse (Node's syntax check, which also catches a `let` or `const` declared twice across files), if a top-level function is declared in two files, or if the `window.__x1` debug export names something that does not exist. The files in `src/game/` share one scope, so these are the mistakes that are easy to make.

## Controls

The right stick does the flying. Sideways banks, and at speed the turn is coordinated for you. Forward accelerates, centred holds the speed you let go at, back brakes. There is no separate thruster control: the flight computer sets the pushers and the nose-down pitch for the best acceleration that does not cost height. Boost is a button (Space, Shift, either trigger). A hard push sideways backs the pushers off to their 10% cooling flow for a full-bank turn. The left stick is yaw and climb.

On a phone or tablet there is one stick under the right thumb and a Boost button under the left. Take off, Land and Back to pad are on screen and in the swipeable menu row.

In the cockpit view the dash screen shows a camera under the nose, looking forward and down, beside a north-up map with your position and heading.

## Cabin, TV and VR

The airframe model has an open cockpit under the canopy: cabin liner, dash, centre console and a side-stick. Mass, the fans and the geometry outside the cockpit are unchanged from the earlier airframe. The source commit is in `airframe/SOURCE.md`.

V, or the view buttons, steps through chase, cockpit and bird's eye. While the SI is flying there are two more: Ship, from a cruise-ship deck, and TV, a race broadcast. The TV view cuts between a camera by the next spire, a helicopter alongside, fly-bys from ahead, a slow orbit, the ship decks, and short cockpit and bird's-eye shots. A tap, click or key during the opening starts in the TV view. In a headset it starts in the chase view.

VR is WebXR, for a Meta Quest. In the cockpit the headset sits at the design eye point and the HUD is a glass panel. Chase and bird's eye put you outside the aircraft, and Ship and the pool deck put you on a cruise ship. The VR button is on the menu bar. The hand controls are on the help screen (H).

## Liveries

Y, or the Livery button, steps through three paint schemes: all white, the black XXONE 51 and the red Yonder 01. The choice is remembered. Each livery is a paint map for the body, colours for the wings, ducts and pushers, and decals for the numbers and lettering, which fold with the wings. They come from the design repo's livery viewers; `tools/livery/pack.py` packs them into `src/liveries.json`, which the build embeds.

## Leaderboard

Best clean lap per X handle. Press B or Leaderboard in the menu. A new personal best offers a ready-made post for X. On x1racing.com the board lives in the site's Supabase database; see `docs/LOVABLE_LEADERBOARD.md`.

## Cruise ships

Two cruise ships sit in the infield. They load from a separate file once the sim is running, so the sim starts as fast as before. They are on by default as Max detail; K or the Max detail button turns them off, and that choice is remembered. With SI flying, the Ship view (its button only shows in SI mode) watches from the upper sun-deck rail and picks the best of the two ships automatically. The ships load from `X1_SkyRacer_Ships.bin`, which must sit in the same folder as the sim HTML on the web server. Browsers block this load when the sim is opened straight from disk, so test it from a web server.

The ship is the PLE "Large Cruise Ship" from the Unity Asset Store (Standard EULA, Single Entity licence). The EULA does not allow the raw model files to be redistributed, so `X1_SkyRacer_Ships.bin` is a scrambled pack that only the sim reads, and it is kept out of git. Rebuild it from the asset's FBX with:

    python3 tools/ship/fbx2ships.py LargeCruiseship_RotatingRadars.fbx dist

## Motion simulators

The sim can drive a 2-DOF (pitch and roll) motion seat. Run `python3 tools/motion/x1_motion_link.py --udp <rig address>:4123` on the PC, then open the sim with `?motion` on the end of the address. A small helper is needed because browsers can't send UDP. It streams a 64-byte UDP packet, 100 a second, with ready-to-use pitch and roll commands plus the raw motion cues, and it levels the seat whenever the sim is paused, crashes, resets or stops sending. Setup, packet layout and safety notes are in [`tools/motion/README.md`](tools/motion/README.md).

## Layout

| Folder | Holds |
| --- | --- |
| `src/physics.js` | Flight model, flight computer, course builder, SI pilot, autoland |
| `src/course.js` | Spires, launch pad, shoreline, SI launch route |
| `src/game/*.js` | The game, one file per part: scene, craft, input, race, cameras, ships, TV, VR, HUD, touch, leaderboard, intro, dash screen, Falcon 9, motion output. They are joined in file-name order into one script. |
| `src/shell.html` | Page layout and help screen |
| `src/style.css` | Styles |
| `docs/` | Leaderboard SQL and the Lovable setup prompt |
| `airframe/` | Copies of the airframe data, with their source in `SOURCE.md` |
| `tests/` | Flight-model checks (Node only) and `browser/` checks of the built pages |
| `tools/` | Build script; `livery/` packs the liveries; `motion/` holds the motion-seat helper and its README; `f9/` reduces the Falcon 9 model |

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
| `autothrust.js` | Speed control: acceleration, top speed, and height held through boost, hold, brake and turns |

`tests/browser/` checks the built pages in a headless browser: both pages boot, SI lap times, the dash screen, the liveries, the intro on phone sizes, ship and launch-pad flags, the motion packets, and the motion helper end to end. Screenshots land in `tests/browser/out/`.

    npm i playwright
    python3 tools/build.py
    node tests/browser/run.js          # or name checks: node tests/browser/run.js dash motion

The ship checks are skipped without `dist/X1_SkyRacer_Ships.bin`.

## Baseline

SI flying laps run about 60.4 to 60.6 s on the current course. With the stick held forward the SkyRacer reaches about 176 mph, and about 195 mph on boost (1,500 hp continuous, 2,000 hp boost) for as long as the pack lasts.

## Branches

`main` is the trunk and builds both pages. The older `falcon9` branch predates the single source tree and is no longer needed. Iterations use `iter/<area>-<what>`, and commit messages start with the area, such as `Sim: ...` or `Course: ...`.
