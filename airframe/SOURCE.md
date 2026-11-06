# Airframe source

This project uses copies of files from the X1 SkyRacer design repo. Update them on purpose, then rerun `tests/lap.js` and `tests/top_speed.js`, because mass or fan changes move lap times.

Repo: https://github.com/projectmaximumboost/x1skyracer

| File here | Source file | Commit |
| --- | --- | --- |
| `X1_SkyRacer_FanTilt_web.glb` | `X1_SkyRacer_FanTilt/X1_SkyRacer_FanTilt_web.glb` | f8133f6 |
| `x1_skyracer_manifest.json` | `X1_SkyRacer_PteroSim/x1_skyracer_manifest.json` | 01e7aee |
| `../assets/x1-logo.png` | `assets/x1-logo.png` | 32897ce |

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
