# Motion simulator output

The X1 SkyRacer sim can drive a **2-DOF motion seat** (pitch and roll). It streams the craft's motion cues, plus two ready-to-use actuator commands, as a 64-byte UDP packet. Rig software such as FlyPT Mover or SimTools can read it, and so can an Arduino or ESP32 controller you write yourself.

```
 sim in Chrome / Edge           X1 Motion Link                 rig
 (opened with ?motion)  --->  x1_motion_link.py  --UDP--->  FlyPT Mover / SimTools /
                  WebSocket 127.0.0.1:4580                   ESP32 / your controller
```

> **Why a helper program?** Browsers do not let web pages send UDP. That is a security rule: otherwise any website could send packets to devices on your network. The sim sends its packets to the helper over a local WebSocket, and the helper forwards them as UDP. The helper is a single Python file that needs nothing installed.

Motion output is **off** unless you ask for it, so normal play is unchanged.

---

## Quick start

1. **Start the helper** on the PC that runs the sim:

   ```
   python3 tools/motion/x1_motion_link.py --udp 127.0.0.1:4123
   ```

   Change the address to wherever your rig software or controller listens. It prints a live readout once the sim connects.

2. **Open the sim with `?motion`** on the end of the address:

   ```
   dist/X1_SkyRacer_GrandPrix_standalone.html?motion
   ```

   The chip row under the gauges shows **MOTION** when linked, **MOTION …** while connecting, and **MOTION OFF** if the helper is not running.

3. **Allow the connection.** The first time, recent Chrome and Edge ask whether the page may connect to apps and devices on this computer. Click **Allow**.

4. **Check the numbers before you sit in the rig.** The helper's readout shows both commands and the raw cues. You can also run a second copy as a listener, so you see exactly what goes out over UDP:

   ```
   python3 tools/motion/x1_motion_link.py --listen 4123
   ```

### Requirements

- Python 3.8 or newer. The helper uses the standard library only.
- Chrome or Edge on Windows, macOS or Linux. Safari blocks the local connection.
- The sim opened from a local copy, from `localhost`, or from x1racing.com.
  - Any other site has to be allowed with `--allow-origin`, so a random web page can't move the seat.
  - The Claude artifact preview **can't** be used, because it blocks outside connections.

---

## Helper options

| Option | Default | What it does |
|---|---|---|
| `--udp HOST:PORT` | `127.0.0.1:4123` | UDP target. Repeat it to send to several targets at once. |
| `--rate HZ` | `100` | Steady UDP send rate. `0` forwards each packet the moment it arrives, in per-frame bursts. |
| `--csv` | off | Send one text line per packet instead of the binary packet (see [Text mode](#text-mode)). |
| `--port N` | `4580` | WebSocket port the sim connects to. If you change it, open the sim with `?motion=N`. |
| `--allow-origin ORIGIN` | — | Also accept the sim from this web origin, such as `https://example.com`. Use `any` to accept every origin, but only on a machine you trust. |
| `--listen PORT` | — | No forwarding: decode and print UDP packets arriving on this port. |
| `--quiet` | off | No live readout. |

The helper only listens on `127.0.0.1`, so other machines can't connect to it. It sends UDP to whatever addresses you give it with `--udp`.

---

## Packet format

**100 packets per second**, whatever the display's frame rate. 64 bytes, **little-endian**.

The sim builds a packet every 10 ms of flight, inside its physics loop. The browser hands them to the helper in small bursts, one burst per frame, and the helper spaces them back out to a steady 100 Hz before sending. While the sim is paused the physics stops, so it sends one parked packet per frame instead.

| Offset | Type | Field | Units and sign |
|---:|---|---|---|
| 0 | `char[4]` | magic | `X1M2` |
| 4 | `uint32` | seq | Goes up by one every packet |
| 8 | `float32` | sim time | Seconds |
| 12 | `uint16` | flags | See [Flags](#flags) |
| 14 | `uint16` | version | `1` |
| 16 | `float32` | **pitchCmd** | −1 … 1, **+ = seat nose up** |
| 20 | `float32` | **rollCmd** | −1 … 1, **+ = right side down** |
| 24 | `float32` | pitch | Degrees, + nose up |
| 28 | `float32` | roll | Degrees, + right wing down |
| 32 | `float32` | heading | Degrees 0 … 360, 0 = north |
| 36 | `float32` | surge | g, + = accelerating forward |
| 40 | `float32` | sway | g, + = accelerating to the right |
| 44 | `float32` | heave | g, **1.0 in a steady hover**, + up |
| 48 | `float32` | roll rate | Degrees per second, + rolling right |
| 52 | `float32` | pitch rate | Degrees per second, + nose rising |
| 56 | `float32` | yaw rate | Degrees per second, + nose right |
| 60 | `float32` | speed | Airspeed, m/s |

- **Surge, sway and heave** are the specific force at the pilot, in the craft's own axes. That is what a seat feels, including gravity, which is why heave reads 1 g in a hover.
- Each packet averages the two 200 Hz physics steps it covers.
- They are capped at ±3 g.

### Flags

| Bit | Value | Meaning |
|---:|---:|---|
| 0 | 1 | Flying: the commands are live |
| 1 | 2 | Parked: the commands are easing to, or holding at, zero |
| 2 | 4 | Paused |
| 3 | 8 | In the opening TV intro |
| 4 | 16 | Crash happened since the last packet |
| 5 | 32 | Reset or teleport: the position jumped, so don't follow it |
| 6 | 64 | On the ground |
| 7 | 128 | The SI is flying (spectator mode) |

### Decoding

Python:

```python
import struct
magic, seq, t, flags, version, pitch_cmd, roll_cmd, pitch, roll, heading, \
    surge, sway, heave, roll_rate, pitch_rate, yaw_rate, speed = struct.unpack('<4sIfHH12f', pkt)
```

C or C++ (Arduino, ESP32: both little-endian):

```c
typedef struct __attribute__((packed)) {
  char     magic[4];      // "X1M2"
  uint32_t seq;
  float    time;
  uint16_t flags, version;
  float    pitchCmd, rollCmd;          // -1..1
  float    pitch, roll, heading;       // deg
  float    surge, sway, heave;         // g
  float    rollRate, pitchRate, yawRate; // deg/s
  float    speed;                      // m/s
} X1Motion;                            // sizeof == 64
```

---

## The 2-DOF commands

`pitchCmd` and `rollCmd` are ready to scale straight onto two actuators, using −1 … 1 as each actuator's full travel:

```
pitchCmd = tanh( 0.85 · surge / 0.45 g  +  0.55 · pitch / 30° )
rollCmd  = tanh( 0.90 · roll  / 40°     −  0.60 · sway  / 0.35 g )
```

- **Pitch:** hard acceleration leans you back into the seat, braking tips you forward, and the craft's nose attitude adds on top.
- **Roll:** the seat banks with the craft. The SkyRacer flies coordinated turns, so there is little sideways push and bank angle carries most of the roll. A skid tilts you toward the side you are pushed.
- `tanh` gives a soft limit near full travel, rather than slamming into the end stops.
- Both commands are **rate-limited to 2.5 full-scale per second**.

On a simulated SI lap:

| | Range |
|---|---|
| Bank angle | Up to ±68° |
| rollCmd in turns | About ±0.9 |
| Forward acceleration | Peaks around 0.4 g |
| pitchCmd | Peaks around 0.8 |
| Largest change per packet | 0.025 |

### Doing your own cueing

If your rig software has its own washout and tilt-coordination filters (FlyPT Mover does), ignore the two commands. Feed it the raw cues at offsets 24–63 instead: attitude, specific force and rates.

---

## Safety

The sim and the helper both bring the seat back to level by themselves:

| Situation | What happens |
|---|---|
| Paused, in the intro, or a menu open | The commands ease to 0 at 0.8 full-scale per second and hold. Flag 2 is set. |
| Crash, reset, or any jump of more than 15 m between packets | The commands ease to 0 and hold for 1.2 s, then resume gently. |
| The sim stops sending for 0.25 s (tab closed, hidden or frozen) | The helper sends parked packets itself, easing to 0 at 1.0 full-scale per second. It then keeps sending neutral packets at 10 Hz. |
| Crash forces | Capped at 3 g before they reach the commands. |

**Always keep a hardware e-stop on the rig.** None of this replaces one.

Your controller should also park the seat if it hears nothing for a short while, in case the helper itself is closed.

---

## Connecting rig software

The packet is a plain fixed layout, so any program that can read a custom UDP stream can use it. Set it up with the table above:

- **FlyPT Mover:**
  1. Add a UDP source listening on the port you passed to `--udp`.
  2. Lay out the fields from [Packet format](#packet-format), little-endian.
  3. Use pitch, roll and the three accelerations as inputs to Mover's own filters, or map `pitchCmd` and `rollCmd` straight to the two axes.
- **SimTools and other tools with a text or CSV input:** run the helper with `--csv`.
- **ESP32 or Arduino with Ethernet:**
  1. Listen for UDP.
  2. Check `magic == "X1M2"` and `length == 64`.
  3. Map `pitchCmd` and `rollCmd` to your actuator travel.
  4. Park if no packet has arrived for 250 ms.

### Text mode

`--csv` sends one line per packet:

```
seq,time,flags,pitchCmd,rollCmd,pitch,roll,heading,surge,sway,heave,rollRate,pitchRate,yawRate,speed
```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Chip says **MOTION OFF** | Check the helper is running and on the same port as `?motion=`. Check you clicked **Allow** when Chrome asked about local connections. To reset that choice, open the site settings from the padlock in the address bar. |
| Helper prints `refused a page from …` | The sim was opened from a site it doesn't trust. Add `--allow-origin <that origin>`. |
| No **MOTION** chip at all | The address is missing `?motion`. |
| Helper connects but the rig doesn't move | Run `--listen` on the rig's port to check packets arrive, then check the rig software's port and field layout. |
| Seat moves the wrong way | Flip the sign in the rig software. In the packet, + pitch is nose up and + roll is right side down. |
| Motion stutters | Keep the sim tab visible: a hidden tab stops flying. The helper sends at a steady 100 Hz, but on Windows with Python older than 3.11 the timer is coarse (about 15 ms), so packets leave in pairs; use a newer Python. |

---

## Files

| File | |
|---|---|
| `src/game/29_motion.js` | Builds the packets in the physics loop: cue blend, rate limits, parking and flags |
| `src/physics.js` | Computes specific force in body axes (`s.fb`) every physics step |
| `tools/motion/x1_motion_link.py` | The helper: WebSocket in, steady-rate UDP out, watchdog, live readout, listener mode |
| `tests/browser/run.js` | `motion` checks the packets; `link` runs the helper end to end |
