/**
 * The thought cloud behind a mentor's speech bubble: a rounded body ringed with
 * puffs, and a trail of shrinking dots down towards their head. Pure geometry,
 * so the scene only has to paint it.
 */

export interface Circle {
  x: number
  y: number
  r: number
}

export interface CloudShape {
  /** The body under the text: x, y of the top-left corner, width, height, corner radius. */
  body: { x: number; y: number; w: number; h: number; radius: number }
  /** Puffs round the body's edge that give it the cloud outline. */
  puffs: Circle[]
  /** Small dots under the cloud, largest first, leading down to the speaker. */
  trail: Circle[]
}

/** Gap between the text's bottom edge and the speaker the trail points at. */
export const CLOUD_TRAIL_DROP = 12

/**
 * The cloud for text `width` x `height` drawn with its bottom-centre at (0, 0),
 * which is where a text with origin (0.5, 1) sits.
 */
export function cloudShape(width: number, height: number): CloudShape {
  const left = -width / 2
  const top = -height
  const puffR = Math.max(4, height * 0.42)
  const puffs: Circle[] = []
  // Along the top and bottom edges, evenly spaced so the bumps look deliberate.
  const count = Math.max(2, Math.round(width / (puffR * 1.6)))
  const step = width / count
  for (let i = 0; i < count; i++) {
    const x = left + step * (i + 0.5)
    // Alternate sizes a touch so the edge doesn't look like a zip.
    const r = puffR * (i % 2 === 0 ? 1 : 0.85)
    puffs.push({ x, y: top + 1, r })
    puffs.push({ x, y: -1, r: r * 0.8 })
  }
  // Rounded ends.
  const endR = height / 2 + 2
  puffs.push({ x: left + 1, y: top + height / 2, r: endR })
  puffs.push({ x: -left - 1, y: top + height / 2, r: endR })

  // The trail starts just under the bottom-left of centre and steps down.
  const trail: Circle[] = [
    { x: -width * 0.12, y: puffR * 0.6 + 3, r: 2.5 },
    { x: -width * 0.12 - 4, y: puffR * 0.6 + 8, r: 1.5 },
  ]

  return {
    body: { x: left, y: top, w: width, h: height, radius: Math.min(6, height / 2) },
    puffs,
    trail,
  }
}
