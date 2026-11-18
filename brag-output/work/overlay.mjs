// The video's own layer, drawn over the real app. Node computes every value per frame.
export const OVERLAY_INIT = () => {
  const css = `
  #ov{position:fixed;inset:0;z-index:99999;pointer-events:none;font-family:Inter,system-ui,sans-serif}
  #ov .dim{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 50%,rgba(14,22,12,.55),rgba(14,22,12,.85))}
  #ov .hook{position:absolute;left:70px;right:70px;top:50%;text-align:center;color:#fff;font-weight:700;font-size:74px;line-height:1.08;letter-spacing:-.025em;text-shadow:0 4px 24px rgba(0,0,0,.5)}
  #ov .hook em{font-style:normal;color:#ffb35c}
  #ov .kicker{position:absolute;left:0;right:0;top:250px;text-align:center;font-family:'Pixelify Sans',monospace;color:#ffcf8f;font-size:26px;letter-spacing:.3em;text-transform:uppercase}
  #ov .chip{position:absolute;left:50%;top:112px;transform:translateX(-50%);display:flex;align-items:center;gap:18px;max-width:960px;width:max-content;background:rgba(28,24,20,.9);color:#fff;border-radius:22px;padding:20px 30px 20px 20px;box-shadow:0 10px 30px rgba(0,0,0,.35);border:2px solid rgba(255,179,92,.35)}
  #ov .chip b{flex:none;display:grid;place-items:center;width:52px;height:52px;border-radius:14px;background:#c2610f;font-family:'Pixelify Sans',monospace;font-size:30px}
  #ov .chip span{font-size:36px;font-weight:600;letter-spacing:-.015em;line-height:1.15}
  #ov .chip span em{font-style:normal;color:#ffb35c}
  #ov .cursor{position:absolute;width:44px;height:44px;margin:-4px 0 0 -6px;filter:drop-shadow(0 3px 6px rgba(0,0,0,.45))}
  #ov .ring{position:absolute;width:70px;height:70px;margin:-35px 0 0 -35px;border-radius:50%;border:4px solid #ffb35c}
  #ov .end{position:absolute;inset:0;background:#24361f;display:grid;place-items:center;text-align:center;color:#fff}
  #ov .end .pat{position:absolute;inset:0;opacity:.13;background-image:linear-gradient(#000 2px,transparent 2px),linear-gradient(90deg,#000 2px,transparent 2px);background-size:44px 44px}
  #ov .end h1{font-family:'Pixelify Sans',monospace;font-size:120px;font-weight:600;margin:0;letter-spacing:.01em;text-shadow:0 6px 0 rgba(0,0,0,.3)}
  #ov .end p{font-size:44px;font-weight:600;margin:28px 0 0;letter-spacing:-.02em}
  #ov .end p em{font-style:normal;color:#ffb35c}
  #ov .end small{display:block;margin-top:46px;font-family:'Pixelify Sans',monospace;font-size:26px;letter-spacing:.28em;color:#ffcf8f;text-transform:uppercase}
  section[role=dialog]{zoom:1.3}
  main p[role=status]{zoom:1.5}
  #ov .dip{position:absolute;inset:0;background:#162013}
  `
  const style = document.createElement('style')
  style.textContent = css
  const root = document.createElement('div')
  root.id = 'ov'
  const add = () => {
    document.head.appendChild(style)
    document.body.appendChild(root)
  }
  if (document.body) add()
  else document.addEventListener('DOMContentLoaded', add)
  const cursorSvg = `<svg viewBox="0 0 24 24" width="44" height="44"><path d="M3 2l7.5 19 2.6-7.6L21 11z" fill="#fff" stroke="#1c1814" stroke-width="1.6" stroke-linejoin="round"/></svg>`
  window.__ov = (s) => {
    let h = ''
    if (s.dim) h += `<div class="dim" style="opacity:${s.dim}"></div>`
    if (s.kicker) h += `<div class="kicker" style="opacity:${s.kicker.o}">${s.kicker.text}</div>`
    for (const l of s.hook ?? [])
      h += `<div class="hook" style="opacity:${l.o};transform:translateY(calc(-50% + ${l.dy}px))">${l.html}</div>`
    if (s.chip)
      h += `<div class="chip" style="opacity:${s.chip.o};transform:translateX(-50%) translateY(${s.chip.dy}px)">${s.chip.n ? `<b>${s.chip.n}</b>` : ''}<span>${s.chip.html}</span></div>`
    if (s.ring)
      h += `<div class="ring" style="left:${s.ring.x}px;top:${s.ring.y}px;opacity:${s.ring.o};transform:scale(${s.ring.k})"></div>`
    if (s.cursor)
      h += `<div class="cursor" style="left:${s.cursor.x}px;top:${s.cursor.y}px;opacity:${s.cursor.o};transform:scale(${s.cursor.k ?? 1})">${cursorSvg}</div>`
    if (s.end)
      h += `<div class="end" style="opacity:${s.end.o}"><div class="pat"></div><div style="transform:translateY(${s.end.dy}px)"><small style="margin:0 0 30px">MentorAgents</small><h1>Mentor Square</h1><p style="opacity:${s.end.o2}">Great minds. <em>One room.</em> Your goal.</p></div></div>`
    if (s.dip) h += `<div class="dip" style="opacity:${s.dip}"></div>`
    root.innerHTML = h
  }
}

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
export const easeOut = (x) => 1 - Math.pow(1 - clamp(x), 3)
export const easeInOut = (x) => {
  x = clamp(x)
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}

/** Opacity and lift for an element shown from `a` to `b` seconds (0.3s in, 0.18s out). */
export function window_(t, a, b, inDur = 0.3, outDur = 0.18) {
  if (t < a || t > b) return null
  const i = easeOut((t - a) / inDur)
  const o = 1 - easeOut((t - (b - outDur)) / outDur)
  const v = Math.min(i, o)
  return { o: v.toFixed(3), dy: ((1 - i) * 22).toFixed(1) }
}

/** Dip to dark at the scene edges (cuts on the beat hide behind a 4-frame dip). */
export function dip(t, dur) {
  const e = 0.13
  if (t < e) return (1 - t / e).toFixed(3)
  if (t > dur - e) return ((t - (dur - e)) / e).toFixed(3)
  return 0
}
