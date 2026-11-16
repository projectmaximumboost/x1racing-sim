#!/usr/bin/env python3
"""X1 Motion Link: carries the X1 SkyRacer sim's 2-DOF motion packet from the browser to a motion rig over UDP.

A web page cannot send UDP, so the sim (opened with ?motion) connects to this helper by WebSocket on
127.0.0.1:4580 and sends 64-byte packets, 100 per second of flight. The helper forwards them at a steady 100 Hz, unchanged or as a line
of text, to one or more UDP targets (FlyPT Mover, SimTools, an Arduino/ESP32 bridge, ...).

Safety: if packets stop for 0.25 s (tab closed, browser hidden, sim crashed), the helper sends a 'parked'
packet that eases the 2-DOF commands back to zero over about a second and then holds them there.

Python 3.8+, standard library only.

  python3 x1_motion_link.py                          # UDP to 127.0.0.1:4123, binary
  python3 x1_motion_link.py --udp 192.168.1.50:4123  # rig controller on the network
  python3 x1_motion_link.py --udp 127.0.0.1:4123 --udp 127.0.0.1:4124 --csv
  python3 x1_motion_link.py --listen 4123            # no rig: print what arrives on UDP 4123 (decoder check)
"""
import argparse, base64, collections, hashlib, socket, struct, sys, threading, time

FMT = '<4sIfHH12f'          # 64 bytes, see README.md
SIZE = struct.calcsize(FMT)
FIELDS = ('pitchCmd', 'rollCmd', 'pitch', 'roll', 'heading', 'surge', 'sway', 'heave',
          'rollRate', 'pitchRate', 'yawRate', 'speed')
FLAG_NAMES = ((1, 'flying'), (2, 'parked'), (4, 'paused'), (8, 'intro'), (16, 'crash'), (32, 'reset'),
              (64, 'ground'), (128, 'SI'))
# pages allowed to drive the rig: a local copy of the sim (file:// sends Origin 'null'), localhost, x1racing.com
DEFAULT_ORIGINS = ('null', 'http://localhost', 'https://localhost', 'http://127.0.0.1', 'https://x1racing.com',
                   'https://www.x1racing.com')
GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'


def decode(pkt):
    m, seq, t, flags, ver, *v = struct.unpack(FMT, pkt)
    return m, seq, t, flags, ver, dict(zip(FIELDS, v))


def as_csv(pkt):
    m, seq, t, flags, ver, d = decode(pkt)
    return ('%d,%.3f,%d,' % (seq, t, flags) + ','.join('%.4f' % d[k] for k in FIELDS) + '\n').encode()


class Link:
    def __init__(self, targets, csv, quiet, rate=100.0):
        self.targets, self.csv, self.quiet, self.rate = targets, csv, quiet, rate
        self.q = collections.deque()
        self.udp = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.lock = threading.Lock()
        self.last_rx = 0.0
        self.last_pkt = None
        self.n = 0
        self.park_seq = 0

    def send(self, pkt):
        out = as_csv(pkt) if self.csv else pkt
        for t in self.targets:
            try:
                self.udp.sendto(out, t)
            except OSError as e:
                print('UDP to %s:%d failed: %s' % (t[0], t[1], e), file=sys.stderr)

    def packet(self, pkt):
        if len(pkt) != SIZE or pkt[:4] != b'X1M2':
            return
        with self.lock:
            self.last_rx, self.last_pkt = time.monotonic(), pkt
            self.n += 1
            if self.rate > 0:
                self.q.append(pkt)
                while len(self.q) > 8:  # more than 80 ms behind: drop the oldest rather than lag
                    self.q.popleft()
                return
        self.send(pkt)

    def pacer(self):
        """The browser delivers packets in a small burst each frame; send them on at a steady rate instead."""
        step = 1.0 / self.rate
        due = time.monotonic()
        while True:
            now = time.monotonic()
            if now < due:
                time.sleep(min(step, due - now))
                continue
            if now - due > 0.1:  # we were stalled: don't fire a catch-up burst
                due = now
            due += step
            with self.lock:
                pkt = self.q.popleft() if self.q else None
            if pkt is not None:
                self.send(pkt)

    def watchdog(self):
        """No packets for 0.25 s: ease the commands to zero at 50 Hz, then keep sending neutral at 10 Hz."""
        p = r = None
        while True:
            time.sleep(0.02)
            with self.lock:
                quiet_for = time.monotonic() - self.last_rx
                last = self.last_pkt
            if last is None or quiet_for < 0.25:
                p = r = None
                continue
            m, seq, t, flags, ver, d = decode(last)
            if p is None:
                p, r = d['pitchCmd'], d['rollCmd']
            step = 0.02  # 1.0 full scale per second
            p += max(-step, min(step, -p))
            r += max(-step, min(step, -r))
            if p == 0 and r == 0 and int(quiet_for * 50) % 5:
                continue  # holding neutral: 10 Hz is plenty
            d.update(pitchCmd=p, rollCmd=r)
            self.park_seq += 1
            pkt = struct.pack(FMT, b'X1M2', (seq + self.park_seq) & 0xffffffff, t, 2, ver, *[d[k] for k in FIELDS])
            self.send(pkt)

    def readout(self):
        while not self.quiet:
            time.sleep(0.5)
            with self.lock:
                last, n, age = self.last_pkt, self.n, time.monotonic() - self.last_rx
                self.n = 0
            if last is None:
                line = 'waiting for the sim (open it with ?motion) ...'
            else:
                m, seq, t, flags, ver, d = decode(last)
                st = ' '.join(nm for b, nm in FLAG_NAMES if flags & b)
                line = ('%3d pkt/s  pitch %+5.2f  roll %+5.2f | att %+6.1f %+6.1f  hdg %5.1f | g %+5.2f %+5.2f %+5.2f'
                        '  %5.1f m/s  [%s]' % (n * 2, d['pitchCmd'], d['rollCmd'], d['pitch'], d['roll'],
                                               d['heading'], d['surge'], d['sway'], d['heave'], d['speed'], st))
                if age > 0.25:
                    line += '  NO SIM - parking'
            sys.stdout.write('\r' + line[:150].ljust(150))
            sys.stdout.flush()


# ---- minimal WebSocket server (RFC 6455): one client at a time, binary frames in ----
def recv_exact(c, n):
    b = b''
    while len(b) < n:
        k = c.recv(n - len(b))
        if not k:
            raise ConnectionError
        b += k
    return b


def serve_client(c, addr, link, origins):
    req = b''
    while b'\r\n\r\n' not in req:
        k = c.recv(4096)
        if not k or len(req) > 16384:
            return
        req += k
    hdr = {}
    for line in req.split(b'\r\n')[1:]:
        if b':' in line:
            k, v = line.split(b':', 1)
            hdr[k.strip().lower().decode()] = v.strip().decode(errors='replace')
    origin = hdr.get('origin', 'null')
    if hdr.get('upgrade', '').lower() != 'websocket':
        return
    if origins is not None and origin not in origins:
        print('\nrefused a page from %s (add --allow-origin %s to trust it)' % (origin, origin))
        c.sendall(b'HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n')
        return
    key = hdr.get('sec-websocket-key')
    if not key:
        return
    acc = base64.b64encode(hashlib.sha1((key + GUID).encode()).digest()).decode()
    c.sendall(('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
               'Sec-WebSocket-Accept: %s\r\n\r\n' % acc).encode())
    print('\nsim connected from %s' % origin)
    while True:
        b0, b1 = recv_exact(c, 2)
        op, masked, n = b0 & 0x0f, b1 & 0x80, b1 & 0x7f
        if n == 126:
            n = struct.unpack('>H', recv_exact(c, 2))[0]
        elif n == 127:
            n = struct.unpack('>Q', recv_exact(c, 8))[0]
        if n > 1 << 16:
            return
        mask = recv_exact(c, 4) if masked else b'\0\0\0\0'
        data = bytes(x ^ mask[i & 3] for i, x in enumerate(recv_exact(c, n)))
        if op == 8:  # close: echo it so the page sees a clean close
            c.sendall(bytes([0x88, len(data)]) + data)
            return
        if op == 9:  # ping -> pong
            c.sendall(bytes([0x8a, len(data)]) + data)
        elif op == 2:
            link.packet(data)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--port', type=int, default=4580, help='WebSocket port the sim connects to (default 4580)')
    ap.add_argument('--udp', action='append', metavar='HOST:PORT', help='UDP target, repeatable (default 127.0.0.1:4123)')
    ap.add_argument('--rate', type=float, default=100.0, metavar='HZ',
                    help='send UDP at this steady rate (default 100, the rate the sim produces packets); 0 forwards each '
                         'packet the moment it arrives')
    ap.add_argument('--csv', action='store_true', help='send a text line per packet instead of the 64-byte binary')
    ap.add_argument('--allow-origin', action='append', default=[], metavar='ORIGIN',
                    help="also accept the sim from this web origin, or 'any'")
    ap.add_argument('--listen', type=int, metavar='PORT', help='just decode and print UDP arriving on this port')
    ap.add_argument('--quiet', action='store_true')
    a = ap.parse_args()

    if a.listen:
        u = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        u.bind(('0.0.0.0', a.listen))
        print('listening on UDP %d' % a.listen)
        while True:
            pkt, src = u.recvfrom(2048)
            if len(pkt) == SIZE and pkt[:4] == b'X1M2':
                m, seq, t, flags, ver, d = decode(pkt)
                print('#%d t=%.2f flags=%d ' % (seq, t, flags) + ' '.join('%s=%+.3f' % kv for kv in d.items()))
            else:
                print(pkt.decode(errors='replace').strip())

    targets = []
    for s in a.udp or ['127.0.0.1:4123']:
        h, p = s.rsplit(':', 1)
        targets.append((h, int(p)))
    origins = None if 'any' in a.allow_origin else set(DEFAULT_ORIGINS) | set(a.allow_origin)
    link = Link(targets, a.csv, a.quiet, a.rate)
    if a.rate > 0:
        threading.Thread(target=link.pacer, daemon=True).start()
    threading.Thread(target=link.watchdog, daemon=True).start()
    threading.Thread(target=link.readout, daemon=True).start()

    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(('127.0.0.1', a.port))
    srv.listen(2)
    print('X1 Motion Link: sim -> ws://127.0.0.1:%d -> UDP %s (%s)' % (
        a.port, ', '.join('%s:%d' % t for t in targets), 'text' if a.csv else 'binary'))
    while True:
        c, addr = srv.accept()
        c.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)

        def run(c=c, addr=addr):
            try:
                serve_client(c, addr, link, origins)
            except (ConnectionError, OSError, ValueError):
                pass
            finally:
                c.close()
                print('\nsim disconnected')
        threading.Thread(target=run, daemon=True).start()


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print()
