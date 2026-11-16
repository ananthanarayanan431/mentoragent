"""Soundtrack for the MentorAgents launch video: 120 BPM, A minor, 25.5 s.

Every event sits on one grid counted from frame 0 (beat = 0.5 s = 15 frames).
Run: uv run --with numpy python music.py out.wav
"""

import sys
import wave

import numpy as np

SR = 48000
DUR = 25.5
BEAT = 0.5
N = int(SR * DUR)
L = np.zeros(N)
R = np.zeros(N)
rng = np.random.default_rng(7)


def hz(midi: float) -> float:
    return 440.0 * 2 ** ((midi - 69) / 12)


def env(n: int, a: float, d: float) -> np.ndarray:
    t = np.arange(n) / SR
    e = np.minimum(1.0, t / max(a, 1e-4)) * np.exp(-t / d)
    return e


def lowpass(x: np.ndarray, cutoff: float) -> np.ndarray:
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.zeros_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc = (1 - a) * v + a * acc
        y[i] = acc
    return y


def add(t: float, sig: np.ndarray, gain: float, pan: float = 0.0) -> None:
    i = int(round(t * SR))
    if i >= N:
        return
    sig = sig[: N - i] * gain
    L[i : i + len(sig)] += sig * np.sqrt((1 - pan) / 2) * np.sqrt(2)
    R[i : i + len(sig)] += sig * np.sqrt((1 + pan) / 2) * np.sqrt(2)


def tone(freq: float, length: float, kind: str = "sine", a: float = 0.005, d: float = 0.3) -> np.ndarray:
    n = int(SR * length)
    t = np.arange(n) / SR
    if kind == "sine":
        w = np.sin(2 * np.pi * freq * t)
    elif kind == "tri":
        w = 2 * np.abs(2 * ((freq * t) % 1) - 1) - 1
    else:  # soft square: odd harmonics, rolled off
        w = np.zeros(n)
        k = 1
        while k * freq < 6000:
            w += np.sin(2 * np.pi * k * freq * t) / k * np.exp(-k / 9)
            k += 2
        w *= 0.9
    return w * env(n, a, d)


def kick() -> np.ndarray:
    n = int(SR * 0.35)
    t = np.arange(n) / SR
    f = 45 + 75 * np.exp(-t / 0.04)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t / 0.12)


def noise(length: float, cutoff: float, d: float, high: bool = False) -> np.ndarray:
    n = int(SR * length)
    x = rng.standard_normal(n)
    lp = lowpass(x, cutoff)
    y = x - lp if high else lp
    return y * env(n, 0.001, d)


# Am | F | C | G, one chord per bar (2 s), roots for the bass, triads for the pad.
CHORDS = [(57, [57, 60, 64]), (53, [53, 57, 60]), (48, [55, 60, 64]), (55, [55, 59, 62])]

# Pad: whole bars, gentle, the whole length (quieter in the hook).
for bar in range(13):
    root, triad = CHORDS[bar % 4]
    for m in triad:
        sig = tone(hz(m), 2.2, "tri", a=0.25, d=1.6)
        add(bar * 2.0, lowpass(sig, 1800), 0.045 if bar >= 1 else 0.035, pan=-0.3 + 0.3 * triad.index(m))

# Hook plucks, one per word group (frames 0, 7.5, 15).
for t, m in [(0.0, 76), (0.25, 79), (0.5, 84)]:
    add(t, tone(hz(m), 0.6, "square", d=0.18), 0.10, pan=0.1)

# Riser into the drop at 2.5 s.
n = int(SR * 1.0)
r = noise(1.0, 3000, 10.0, high=True) * np.linspace(0, 1, n) ** 2
add(1.5, r, 0.05)

GROOVE_START, OUTRO = 2.5, 22.5
LAST = 24.5
beats = np.arange(0, DUR / BEAT)
for b in beats:
    t = b * BEAT
    if GROOVE_START <= t < OUTRO:
        add(t, kick(), 0.55)
        if int(b) % 2 == 1:
            add(t, noise(0.25, 2500, 0.07), 0.20, pan=0.05)  # soft clap
        for off in (0.0, 0.25):
            add(t + off, noise(0.06, 7000, 0.015, high=True), 0.06 if off else 0.04, pan=0.35)
    elif t >= OUTRO and int(b) % 2 == 1 and t < LAST:
        add(t, kick(), 0.40)  # half-time outro

# Bass: eighth notes on the root, from the drop through the outro.
for b8 in range(int(DUR / (BEAT / 2))):
    t = b8 * BEAT / 2
    if t < GROOVE_START or t >= LAST:
        continue
    root = CHORDS[int(t // 2.0) % 4][0] - 12
    note = root + (12 if b8 % 4 == 3 else 0)
    add(t, lowpass(tone(hz(note), 0.24, "tri", d=0.16), 900), 0.20)

# Lead: an A-minor-pentatonic figure per bar, sixteenth-grid, from the drop.
FIG = [(0, 0), (0.5, 3), (0.75, 5), (1.0, 7), (1.5, 5), (1.75, 3)]
PENT = [69, 72, 74, 76, 79, 81, 84, 86]
for bar in range(1, 11):
    t0 = bar * 2.0
    shift = [0, -1, 0, 1][bar % 4]
    for off, step in FIG:
        t = t0 + off
        if t < GROOVE_START:
            continue
        m = PENT[max(0, min(len(PENT) - 1, step // 2 + 1 + shift))]
        sig = lowpass(tone(hz(m), 0.3, "square", d=0.12), 3200)
        add(t, sig, 0.055, pan=0.25)
        add(t + 0.375, sig, 0.02, pan=-0.35)  # dotted-eighth echo, shared space

# Effects, all on the grid and in key.
for t in (2.5, 5.5, 7.5, 12.0, 15.5, 17.5):  # cuts
    add(t, lowpass(tone(hz(81), 0.25, "square", d=0.06), 2500), 0.06, pan=-0.1)
    add(t, tone(hz(88), 0.4, "sine", d=0.12), 0.04)
for start, count in ((2.625, 7), (7.625, 5), (12.25, 3), (17.625, 7)):  # typing, sixteenths
    for i in range(count):
        add(start + i * 0.125, noise(0.03, 5000, 0.006, high=True), 0.05, pan=0.2)
for t, m in [(6.25, 81), (6.5, 84), (6.75, 86), (7.0, 88)]:  # chips land
    add(t, tone(hz(m), 0.5, "sine", d=0.15), 0.07, pan=0.15)
for m in (81, 88, 93):  # memory ready chime
    add(7.0, tone(hz(m), 1.4, "sine", d=0.5), 0.05)
    add(7.375, tone(hz(m), 1.0, "sine", d=0.4), 0.018)

# Outro: a full Am hit at 22.5 s that rings out, then a last A at 24.5 s.
for m in (45, 57, 64, 69, 72, 76):
    add(OUTRO, lowpass(tone(hz(m), 4.0, "tri", a=0.01, d=1.6), 2400), 0.06)
for t, m in [(22.75, 76), (23.0, 79), (23.25, 81)]:
    add(t, lowpass(tone(hz(m), 0.6, "square", d=0.2), 2600), 0.05, pan=0.2)
for m in (57, 69, 76):
    add(LAST, tone(hz(m), 1.0, "sine", a=0.01, d=0.5), 0.05)

# Master: gentle fade at the very end, soft clip, normalise.
fade = np.ones(N)
fn = int(SR * 0.6)
fade[-fn:] = np.linspace(1, 0, fn)
mix = np.stack([L, R], axis=1) * fade[:, None]
mix = np.tanh(mix * 1.2) / np.tanh(1.2)
mix /= np.max(np.abs(mix)) / 0.89
pcm = (mix * 32767).astype(np.int16)
with wave.open(sys.argv[1], "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("wrote", sys.argv[1])
