# Starship launch tower (standalone sequence, sim-ready)

`dist/X1_Starship_Launch_standalone.html` opens straight in a browser (the tower pack is embedded; three.js r147 loads from the CDN, same as the sim). It stands in the Falcon 9 page's spot on the shore, with the sim's own sky, water, spires, shore and paddock, and twilight. Put `X1_SkyRacer_Ships.bin` beside it and the cruise ships load too.

## What it does
- **Launch** (L / Space): T-10 countdown; ignition throws a launch cloud out between the mount's legs, rolls it along the ground round the foot of the tower and boils it up the legs; QD arm swings clear and the chopsticks open; ignition T-2.5; liftoff; gravity turn over the sea; hot staging T+38; Super Heavy flips (grid fins deploy only now: stowed against the hull on the pad and in the climb), boostback burn, falls engines first, landing burn over the tower; the chopsticks close on it at T+86 and it settles. Starship flies on.
- **Ship catch** (C): Super Heavy on the mount, carriage at the top of its travel (+21 m), arms open; the crane hook rides up on the carriage. Starship falls belly first, flips, burns, is caught, and the carriage lowers it onto the booster: stacked again, so Launch can follow.
- **Lifting** (carriage R/F with the arms closed): raising the carriage lifts Starship off Super Heavy on its hooks and carries it; lowering sets it back on the booster. A caught Super Heavy rides the carriage too: lower it the 44 m to the mount and it is set down and let go; close the arms round it there (no ship on top) and raise the carriage to pick it up again. The arms won't open with a vehicle hanging, and closed arms stop at Starship's hooks.
- Manual when idle: Arms (A), Carriage up/down (hold R/F), QD arm (Q), Grid fins (G). Reset (Esc).
- Cameras: Director cuts (default) or Orbit (V, or just drag; wheel/pinch zooms; double-click switches the orbit centre between the tower and the flying vehicle).

- **33 Raptors** under Super Heavy (3 + 10 + 20, the real pattern) with an aft heat shield; each burns its own jet into the merged plume. All 33 light for the climb, the inner 13 for boostback and the start of the landing burn, the centre 3 at the end. Three instanced draw calls.

- **Clamping**: closed, the chopsticks clamp right up against the rocket: the angle is worked out from the model on load so the arms' inner faces stand 0.12 m off the hull (1.9 degrees in from the modelled pose). Starship's hooks and Super Heavy's grid fins rest on the top chords.
- **Booster catch**: Super Heavy is caught by its grid fins (a pair on each side, facing the chopsticks). The landing burn lights 650 m up at 160 m/s, 13 engines then the centre 3, comes in 50 m from the sea and stops in a hover with the fins 1.6 m over the arms; the arms close in under them, the engines cut and the fins drop onto the arms' top chord. The flame kicks dust out across the mount on the way down.
- **Starship engines**: 3 sea-level Raptors in the middle and 3 big vacuum bells round them, recessed in the skirt (the stack still sits flush). All 6 for the climb after hot staging; the sea-level 3 alone for the flip and the landing burn.
- **Ship catch burn**: tuned for the catch at the top of the tower: it lights 500 m above the arms at 85 m/s, 45 m out toward the sea, decelerates evenly to rest at the hooks, and throttles down as it slows; the flame stops short of the booster on the mount.
- **Starship**: the heat shield (the smooth side, faces the tower when stacked) and the under half of every flap are tile black; the other side is steel. Two catch hooks stand out under the forward flaps; the ship is turned so flaps and hooks face the chopsticks, and in the ship catch it hangs on the hooks on the arms' top chord before it is lowered onto the booster.

## Files
- `tools/starship/prep.py` source GLB (28k tris, 35 MB of textures) -> `dist/X1_SkyRacer_Starship.glb` (1.45 MB): parts split into pad / carriage / armL / armR / qd / booster (+4 grid fins) / ship, hinged nodes, vertex colours, metres, facts in `asset.extras.x1`.
  `python3 -I tools/starship/prep.py starship_tower.glb dist/X1_SkyRacer_Starship.glb`
- `tools/build_starship.py` builds the page from `src/game` environment files + `src/starship/`.
- `src/starship/26_starship.js` the tower, mechanisms, flight script, plumes, smoke, sound and collision. Written against the sim's own names (`scene`, `toW`, `DEF`, `SHIP`, `FLAGS`, `banner`, `ac`/`na`), so it drops into `src/game` beside or instead of `26_falcon9.js`: call `stLoad()` where `f9Load` runs, `stTick(dt)` where `f9Tick` runs, and `stHit(x, y, h)` where `f9Hit` is checked.
- `src/starship/01_stubs.js`, `90_seq.js`, `shell.html`, `style.css`: the standalone page only.

## Performance (same budget as the Falcon 9 pad)
28k triangles, 3 materials, no textures, 11 nodes; whole scene 36 draw calls. Collision grids (0.8 m cells, grown 1.6 m) build when the browser is idle (about 0.14 s). Vehicles and plumes ignore fog so they stay visible high up.

## The ship: Ship 42 (Flight 15)

`tools/starship/ship42.py` replaces the ship in `dist/X1_SkyRacer_Starship.glb` with a Block 3 ship built from code: steel rings with the heat shield on the windward half, an ogive nose, the aft flaps on the sides and the smaller forward flaps on the nose cone shifted round to leeward (120 degrees from the windward centre line), two catch pins under the forward flaps, six Raptor nozzles and two raceways. Each flap is its own node on its hinge line; the page stows them for the pad and the climb, spreads them for the belly flop and folds them back for the landing burn and catch. The heat shield faces away from the tower, so the ship comes home from the land side, over the tower, nose toward the sea. Run it after `prep.py` (it is safe to run on its own output): `python3 -I tools/starship/ship42.py dist/X1_SkyRacer_Starship.glb dist/X1_SkyRacer_Starship.glb`.

## Landing and catch

Both stages fly the final approach Ship 42 flew into the chopsticks on Flight 15, from a frame-by-frame track of a phone video: 280 m above the catch point at 58 m/s, 135 m at 38, 60 m at 14, a slow stretch at 12-13 m/s, 16 m at 8 m/s, then a gentle settle to zero at contact (`STF` in `26_starship.js`). The arms swing in from about 11 s out, as far as the folded aft flaps allow (`STC.HOLD`, worked out on load), clamp once the flaps are below them, and the engines cut on contact. Before that the ship flips out of its belly flop past vertical and arcs in braking, leaning back about 28 degrees and righting itself as it slows (as in the Flight 15 time-lapse); the booster lights 1.25 km up and 160 m offshore, leans toward the tower, then back to brake, and is upright over it. Attitude follows the thrust each path needs.
