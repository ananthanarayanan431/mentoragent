"""Soundtrack: 120 BPM chiptune bed in A minor with SFX on the same grid.
usage: python3 music.py events.json out.wav"""
import json, sys
import numpy as np

SR = 48000
BPM = 120
BEAT = 60 / BPM
DUR = 39.0
N = int(SR * DUR)
mix = np.zeros((N, 2))

def midi(m): return 440 * 2 ** ((m - 69) / 12)

def env(n, a=0.005, d=0.1, s=0.6, r=0.1, hold=None):
    t = np.arange(n) / SR
    hold = hold if hold is not None else n / SR - r
    e = np.where(t < a, t / a, np.where(t < a + d, 1 - (1 - s) * (t - a) / d, s))
    rel = np.clip((t - hold) / r, 0, 1)
    return e * (1 - rel)

def add(sig, at, gain=1.0, pan=0.0):
    i = int(at * SR)
    if i >= N: return
    sig = sig[: N - i]
    l, r = np.sqrt((1 - pan) / 2), np.sqrt((1 + pan) / 2)
    mix[i:i + len(sig), 0] += sig * gain * l
    mix[i:i + len(sig), 1] += sig * gain * r

def lp(x, k=0.15):  # one-pole lowpass for softness
    y = np.empty_like(x); acc = 0.0
    for i, v in enumerate(x):
        acc += k * (v - acc); y[i] = acc
    return y

def osc(freq, dur, kind='square', duty=0.5):
    t = np.arange(int(dur * SR)) / SR
    ph = (t * freq) % 1
    if kind == 'square': return np.where(ph < duty, 1.0, -1.0)
    if kind == 'tri': return 4 * np.abs(ph - 0.5) - 1
    return np.sin(2 * np.pi * freq * t)

def note(m, dur, kind='square', duty=0.5, a=0.004, d=0.12, s=0.35, r=0.08, k=0.12):
    x = osc(midi(m), dur, kind, duty) * env(int(dur * SR), a, d, s, r)
    return lp(x, k) if kind == 'square' else x

# Chords (Am F C G), one bar (2s) each; roots and triads
PROG = [(57, [57, 60, 64]), (53, [53, 57, 60]), (48, [55, 60, 64]), (55, [55, 59, 62])]

def pad(chord, dur):
    t = np.arange(int(dur * SR)) / SR
    x = sum(np.sin(2 * np.pi * midi(m) * t) + 0.3 * np.sin(2 * np.pi * midi(m) * 1.003 * t) for m in chord)
    return x / len(chord) * env(len(t), 0.4, 0.2, 0.9, 0.5)

def kick():
    n = int(0.28 * SR); t = np.arange(n) / SR
    f = 50 + 90 * np.exp(-t * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 11)

def snare():
    n = int(0.18 * SR); t = np.arange(n) / SR
    return lp(np.random.default_rng(1).uniform(-1, 1, n), 0.35) * np.exp(-t * 22) + 0.3 * np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30)

def hat():
    n = int(0.05 * SR); t = np.arange(n) / SR
    x = np.random.default_rng(2).uniform(-1, 1, n)
    return (x - lp(x, 0.5)) * np.exp(-t * 80)

K, S, H = kick(), snare(), hat()
GROOVE_FROM, GROOVE_TO, END_AT = 9.0, 35.5, 35.5

bar = 0
t0 = 0.0
while t0 < END_AT - 0.01:
    root, chord = PROG[bar % 4]
    add(pad(chord, 2.0), t0, 0.10 if t0 < 6 else 0.085)
    # arpeggio in eighths: always on, brighter once the reveal hits
    arp = [chord[0] + 12, chord[1] + 12, chord[2] + 12, chord[1] + 12] * 2
    for i, m in enumerate(arp):
        at = t0 + i * BEAT / 2
        if at >= END_AT: break
        g = 0.05 if t0 < 6 else 0.07
        add(note(m, 0.22, 'square', 0.25, k=0.09 if t0 < 6 else 0.14), at, g, pan=0.35 if i % 2 else -0.35)
    if t0 >= 6:
        for b in range(4):  # bass on beats
            at = t0 + b * BEAT
            if at < END_AT: add(note(root - 12, 0.42, 'tri', s=0.6), at, 0.22)
    if GROOVE_FROM <= t0 < GROOVE_TO:
        for b in range(4):
            at = t0 + b * BEAT
            if b % 2 == 0: add(K, at, 0.5)
            else: add(S, at, 0.16)
            add(H, at + BEAT / 2, 0.06, pan=0.3)
            add(H, at, 0.035, pan=0.3)
        # a simple lead in the second half of each 2-bar phrase
        if bar % 2 == 1:
            for i, m in enumerate([chord[2] + 12, chord[1] + 12, chord[0] + 12]):
                add(note(m, 0.45, 'square', 0.5, s=0.4, k=0.1), t0 + 1.0 + i * 0.5, 0.045)
    elif 6 <= t0 < GROOVE_FROM:
        for b in range(4): add(H, t0 + b * BEAT + BEAT / 2, 0.05, pan=0.3)
    bar += 1
    t0 += 2.0

# Ending: C major resolve with a bell
end_chord = [48, 55, 60, 64, 67]
add(pad(end_chord, DUR - END_AT), END_AT, 0.16)
add(K, END_AT, 0.45)
for i, m in enumerate([72, 76, 79, 84]):
    add(note(m, 1.6, 'sine', a=0.003, d=0.4, s=0.25, r=0.8), END_AT + i * 0.125, 0.11, pan=(-0.3, 0.3)[i % 2])
add(note(36, 3.0, 'tri', s=0.7, r=1.2), END_AT, 0.22)
# fade the last second
fade = np.ones(N); fl = int(1.2 * SR); fade[-fl:] = np.linspace(1, 0, fl)
mix *= fade[:, None]

# --- SFX on the grid, in key ---
def blip(m, g=0.1, pan=0.0, at=0):
    add(note(m, 0.12, 'sine', a=0.002, d=0.05, s=0.3, r=0.05), at, g, pan)

def swell(at, dur=0.6, g=0.05):
    n = int(dur * SR); t = np.arange(n) / SR
    x = lp(np.random.default_rng(3).uniform(-1, 1, n), 0.08) * (t / dur) ** 2
    add(x, at - dur, g)

ev = json.load(open(sys.argv[1]))
for at in ev.get('cuts', []):
    swell(at, 0.5, 0.18); blip(81, 0.06, at=at)
for at in ev.get('clicks', []):
    blip(88, 0.08, at=at); blip(76, 0.05, at=at + 0.02)
for a, b in ev.get('typing', []):
    x = a
    while x < b: add(H, x, 0.05, pan=-0.2); x += 1 / 15
for a, b in ev.get('speech', []):  # RPG text beeps, on 16ths, scale tones
    x = a; scale = [69, 72, 74, 76, 79]; i = 0
    q = BEAT / 4
    x = np.ceil(x / q) * q
    while x < b:
        add(note(scale[i % 5] + 12, 0.04, 'square', 0.5, a=0.001, d=0.02, s=0.2, r=0.02, k=0.2), x, 0.028)
        x += q; i += 3
for at in ev.get('chimes', []):
    for i, m in enumerate([76, 81]): blip(m + 12, 0.07, at=at + i * 0.125)

peak = np.max(np.abs(mix))
mix = np.tanh(mix / peak * 1.3) * 0.85
out = (mix * 32767).astype(np.int16)
import wave
with wave.open(sys.argv[2], 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(out.tobytes())
print('wrote', sys.argv[2])
