/**
 * The Mentor Square scene: draws the town, moves the player and the wandering
 * mentors, and reports to React through the bridge. Decisions (where to wander,
 * who is in reach, which way to face) come from the pure modules next to it.
 */
import * as Phaser from 'phaser'

import { showBubble } from '../bubbles'
import type { WorldBridge } from '../world-bridge'
import { appearanceFor, PLAYER_APPEARANCE, type Appearance } from './appearance'
import {
  ART_SCALE,
  CHARACTER_H,
  CHARACTER_TEXTURE,
  CHARACTER_W,
  characterFrame,
  drawBuilding,
  drawCharacterSheet,
  drawFountain,
  drawTileset,
  FACINGS,
  TILESET_TILE,
  WALK_FRAMES,
} from './art'
import {
  buildWorldMap,
  cellCenter,
  mentorSpawnSpots,
  groundUnder,
  isGround,
  TILE,
  TILE_KIND_COUNT,
  TileKind,
  type WorldMap,
} from './map'
import { CLOUD_TRAIL_DROP, cloudShape } from './cloud'
import { greetingLineMs, greetingLines, type GreetingLine } from './greetings'
import { isForTheGame, oncePerEvent } from './keys'
import { cellOf, findPath, startVisit, stepVisit, type VisitState } from './visits'
import {
  facingFor,
  facingTowards,
  findEncounters,
  mentorSpeed,
  nearestWithin,
  seededRng,
  startWander,
  stepWander,
  type Facing,
  type Point,
  type Rng,
  type WanderState,
} from './wander'

export interface WorldMentor {
  id: string
  name: string
}

export interface WorldSceneOptions {
  mentors: readonly WorldMentor[]
  bridge: WorldBridge
  labelsVisible: boolean
}

const PLAYER_SPEED = 150
const MENTOR_SPEED = mentorSpeed(PLAYER_SPEED)
/** How far from a place (the library steps, the pond...) a mentor's stroll may end. */
const PLACE_SPREAD = TILE * 1.5
/** Two free mentors this close (feet to feet) notice each other; one may walk over. */
const NOTICE_REACH = TILE * 5
/** The same two mentors report noticing each other at most this often. */
const ENCOUNTER_REPEAT_MS = 45_000
/** After a meeting, a mentor strolls on this long before stopping for anyone else. */
const SOCIAL_REST_MS = 12_000
/** A pause between the two lines of a greeting. */
const GREETING_GAP_MS = 250
/** How close (feet to feet) the player must be to talk. */
const TALK_REACH = TILE * 1.8
/** How close the player must be to see what a mentor told them. */
const BUBBLE_REACH = TILE * 5
/** The tag over a mentor whose memory is still being built; its dots cycle. */
const PREPARING_TEXT = 'preparing'
const PREPARING_DOT_MS = 400

function preparingText(now: number): string {
  return `${PREPARING_TEXT}${'.'.repeat(1 + (Math.floor(now / PREPARING_DOT_MS) % 3))}`
}

/** Feet sit this far below the sprite's centre. */
const FEET_OFFSET = CHARACTER_H / 2 - 6

interface Actor {
  sprite: Phaser.Physics.Arcade.Sprite
  textureKey: string
  facing: Facing
}

interface MentorActor extends Actor {
  id: string
  name: string
  label: Phaser.GameObjects.Text
  /** "preparing..." over their head while their memory is being built. */
  tag: Phaser.GameObjects.Text
  /** What they told you, shown over their head as the player walks past. */
  bubble: Phaser.GameObjects.Text
  /** The thought cloud painted behind the bubble text. */
  cloud: Phaser.GameObjects.Graphics
  /** The ledger text for the bubble; `saying` takes its place during a meeting. */
  bubbleText: string
  /** A line said in a meeting with another mentor, shown whatever the distance. */
  saying: string | null
  /** Walking to another mentor, waiting for one, or meeting one; null when free. */
  visit: Visit | null
  wander: WanderState
  /** Scene time from which they may stop for another mentor again. */
  sociableAt: number
  rng: Rng
  talking: boolean
  lastPosition: Point
}

type Visit =
  /** Walking over; `greeting` is a quick hello the scene plays, not a real chat. */
  | { role: 'visitor'; otherId: string; walk: VisitState; greeting: boolean }
  | { role: 'host'; otherId: string }
  | { role: 'meeting'; otherId: string }
  /** The visitor's side of a greeting: plays the lines, then lets both go. */
  | { role: 'greeting'; otherId: string; lines: GreetingLine[]; index: number; msLeft: number }

/** Already talking to the player or in another visit (or not here at all). */
function busy(mentor: MentorActor | undefined): boolean {
  return !mentor || mentor.talking || mentor.visit !== null
}

type MoveKeys = Record<
  'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd',
  Phaser.Input.Keyboard.Key
>

export class WorldScene extends Phaser.Scene {
  private readonly options: WorldSceneOptions
  private map!: WorldMap
  private player!: Actor
  private mentors: MentorActor[] = []
  /** Where mentors stroll to, as pixel points. */
  private places: Point[] = []
  private blockers: Phaser.Tilemaps.TilemapLayer[] = []
  private labelsVisible: boolean
  /** Mentors whose memory is still being built (see the `preparing` command). */
  private preparing = new Set<string>()
  private keys!: MoveKeys
  private prompt!: Phaser.GameObjects.Text
  private nearby: MentorActor | null = null
  /** When each pair of mentors last bumped into each other (scene time, ms). */
  private encounters = new Map<string, number>()
  // Frozen until the page says otherwise (it shows the title screen first).
  private inputEnabled = false
  private paused = true
  /** False until create() finished; update() does nothing on a half-built world. */
  private built = false
  /** For tap-to-walk: where the player was last frame, and for how long they have not moved. */
  private lastPlayerFeet: Point = { x: 0, y: 0 }
  private stuckMs = 0
  /** Where a tap asked the player to walk, and who to talk to on arrival. */
  private pointerTarget: { point: Point; mentor: MentorActor | null } | null = null
  private unsubscribe: (() => void)[] = []

  constructor(options: WorldSceneOptions) {
    super('world')
    this.options = options
    this.labelsVisible = options.labelsVisible
  }

  create(): void {
    // game.destroy() emits DESTROY, not SHUTDOWN; release the bridge on either.
    const release = () => {
      for (const off of this.unsubscribe.splice(0)) off()
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, release)
    this.events.once(Phaser.Scenes.Events.DESTROY, release)

    try {
      this.map = buildWorldMap()
      this.places = this.map.places.map(cellCenter)
      const blockers = this.createTerrain()
      this.createPlayer(blockers)
      this.createMentors(blockers)
      this.createPrompt()
      this.createInput()
      this.createCamera()
      this.listenToReact()
    } catch (error) {
      // Tell the page, which would otherwise wait for `ready` forever.
      const message = error instanceof Error ? error.message : String(error)
      this.options.bridge.events.emit('failed', { message })
      return
    }
    this.built = true
    this.options.bridge.events.emit('ready', {})
  }

  // --- World -----------------------------------------------------------------------

  private createTerrain(): Phaser.Tilemaps.TilemapLayer[] {
    this.textures.addCanvas('tiles', drawTileset())
    // Collision needs a tileset too; a blank one at world size will do (never drawn).
    this.textures.addCanvas('collision-tiles', blankTileset())
    const { tiles } = this.map

    const groundData = tiles.map((row, r) =>
      row.map((_, c) => groundUnder(this.map, { col: c, row: r })),
    )
    const objectData = tiles.map((row) => row.map((kind) => (isGround(kind) ? -1 : kind)))

    // What you see: 64px art at half size. What you bump into: the same tiles as
    // invisible 32px layers, so collision is unchanged by the art's resolution.
    this.artLayer(groundData, 0)
    this.artLayer(objectData, 1)
    const ground = this.collisionLayer(groundData)
    ground.setCollision(TileKind.Water)
    const objects = this.collisionLayer(objectData)
    // Every object tile (tree, hedge, bench, lamp, building, fountain) is solid.
    objects.setCollisionByExclusion([-1])

    for (const building of this.map.buildings) {
      const key = `building-${building.kind}`
      this.textures.addCanvas(key, drawBuilding(building))
      this.add
        .image(building.col * TILE, building.row * TILE, key)
        .setOrigin(0)
        .setScale(1 / ART_SCALE)
        .setDepth((building.row + building.rows) * TILE)
    }

    this.textures.addCanvas('fountain', drawFountain())
    const fountain = this.map.fountain
    this.add
      .image(fountain.col * TILE, fountain.row * TILE, 'fountain')
      .setOrigin(0)
      .setScale(1 / ART_SCALE)
      .setDepth((fountain.row + fountain.rows) * TILE)

    const width = tiles[0]!.length * TILE
    const height = tiles.length * TILE
    this.physics.world.setBounds(0, 0, width, height)
    return [ground, objects]
  }

  private tilemapLayer(
    data: number[][],
    tileSize: number,
    textureKey: string,
  ): Phaser.Tilemaps.TilemapLayer {
    const tilemap = this.make.tilemap({ data, tileWidth: tileSize, tileHeight: tileSize })
    const tileset = tilemap.addTilesetImage(textureKey, textureKey, tileSize, tileSize, 0, 0)
    const layer = tileset ? tilemap.createLayer(0, tileset, 0, 0) : null
    // Phaser 4 can also return a GPU layer; we ask for (and collide with) the standard one.
    if (!(layer instanceof Phaser.Tilemaps.TilemapLayer)) {
      throw new Error('Could not build a tilemap layer')
    }
    return layer
  }

  /** A visible layer of the 64px tile art, scaled to the world's 32px grid. */
  private artLayer(data: number[][], depth: number): void {
    this.tilemapLayer(data, TILESET_TILE, 'tiles')
      .setScale(1 / ART_SCALE)
      .setDepth(depth)
  }

  /** An invisible layer at world size, only for collision. */
  private collisionLayer(data: number[][]): Phaser.Tilemaps.TilemapLayer {
    return this.tilemapLayer(data, TILE, 'collision-tiles').setVisible(false)
  }

  // --- Characters ----------------------------------------------------------------

  private characterTexture(key: string, look: Appearance): void {
    const texture = this.textures.addCanvas(key, drawCharacterSheet(look))
    if (!texture) throw new Error(`Could not create the ${key} texture`)
    for (let i = 0; i < FACINGS.length * WALK_FRAMES; i++) {
      const { width, height } = CHARACTER_TEXTURE
      texture.add(
        i,
        0,
        (i % WALK_FRAMES) * width,
        Math.floor(i / WALK_FRAMES) * height,
        width,
        height,
      )
    }
    for (const facing of FACINGS) {
      this.anims.create({
        key: `${key}-walk-${facing}`,
        frames: [1, 0, 2, 0].map((frame) => ({ key, frame: characterFrame(facing, frame) })),
        frameRate: 8,
        repeat: -1,
      })
    }
  }

  private spawnActor(key: string, look: Appearance, at: Point): Actor {
    this.characterTexture(key, look)
    const sprite = this.physics.add.sprite(at.x, at.y - FEET_OFFSET, key, characterFrame('down', 0))
    sprite.setScale(1 / ART_SCALE)
    // Collide with the feet only (18 x 10 world px), so characters can stand in front
    // of walls. Body size and offset are in texture pixels, before the sprite's scale.
    const s = ART_SCALE
    sprite
      .body!.setSize(18 * s, 10 * s)
      .setOffset(((CHARACTER_W - 18) / 2) * s, (CHARACTER_H - 14) * s)
    sprite.setCollideWorldBounds(true)
    return { sprite, textureKey: key, facing: 'down' }
  }

  private createPlayer(blockers: Phaser.Tilemaps.TilemapLayer[]): void {
    this.player = this.spawnActor('player', PLAYER_APPEARANCE, cellCenter(this.map.playerSpawn))
    for (const layer of blockers) this.physics.add.collider(this.player.sprite, layer)
  }

  private createMentors(blockers: Phaser.Tilemaps.TilemapLayer[]): void {
    this.blockers = blockers
    for (const mentor of this.options.mentors) this.spawnMentor(mentor, false)
  }

  /**
   * Puts a mentor in the square at the next free spot (see mentorSpawnSpots, which
   * has room for any number). `arriving` fades them in, for one added during play.
   */
  private spawnMentor(mentor: WorldMentor, arriving: boolean): void {
    if (this.mentors.some((existing) => existing.id === mentor.id)) return
    const index = this.mentors.length
    const spot = mentorSpawnSpots(this.map, index + 1)[index]!
    const home = cellCenter(spot)
    const actor = this.spawnActor(`mentor-${mentor.id}`, appearanceFor(mentor.id), home)
    actor.sprite.setPushable(false)
    const rng = seededRng(index + 1)
    const label = this.add
      .text(home.x, home.y, mentor.name, {
        fontFamily: '"Pixelify Sans", ui-monospace, Menlo, monospace',
        fontSize: '11px',
        color: '#fdfcf7',
        backgroundColor: '#1f2937cc',
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5, 1)
      .setResolution(2)
      .setVisible(this.labelsVisible)
    const bubble = this.add
      .text(home.x, home.y, '', {
        fontFamily: '"Pixelify Sans", ui-monospace, Menlo, monospace',
        fontSize: '10px',
        color: '#1f2937',
        padding: { x: 4, y: 3 },
      })
      .setOrigin(0.5, 1)
      .setResolution(2)
      .setVisible(false)
    const cloud = this.add.graphics().setVisible(false)
    const tag = this.add
      .text(home.x, home.y, PREPARING_TEXT, {
        fontFamily: '"Pixelify Sans", ui-monospace, Menlo, monospace',
        fontSize: '10px',
        color: '#fffbeb',
        backgroundColor: '#b45309',
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5, 1)
      .setResolution(2)
      .setVisible(this.preparing.has(mentor.id))

    const added: MentorActor = {
      ...actor,
      id: mentor.id,
      name: mentor.name,
      label,
      tag,
      bubble,
      cloud,
      bubbleText: '',
      saying: null,
      visit: null,
      sociableAt: 0,
      rng,
      wander: startWander(home, rng),
      talking: false,
      lastPosition: home,
    }
    for (const layer of this.blockers) this.physics.add.collider(added.sprite, layer)
    this.physics.add.collider(this.player.sprite, added.sprite)
    for (const other of this.mentors) this.physics.add.collider(other.sprite, added.sprite)
    this.mentors.push(added)

    if (arriving) {
      const scale = 1 / ART_SCALE
      added.sprite.setAlpha(0).setScale(scale * 0.6)
      this.tweens.add({
        targets: added.sprite,
        alpha: 1,
        scale,
        duration: 600,
        ease: 'Back.Out',
      })
    }
  }

  private createPrompt(): void {
    this.prompt = this.add
      .text(0, 0, 'Space · Talk', {
        fontFamily: '"Pixelify Sans", ui-monospace, Menlo, monospace',
        fontSize: '11px',
        color: '#1f2937',
        backgroundColor: '#fef3c7',
        padding: { x: 5, y: 3 },
      })
      .setOrigin(0.5, 1)
      .setResolution(2)
      .setDepth(100_000)
      .setVisible(false)
  }

  // --- Input and camera ----------------------------------------------------------

  private createInput(): void {
    const keyboard = this.input.keyboard
    if (!keyboard) throw new Error('Keyboard input is not available')
    // No key capture: Phaser must never swallow keys the React overlays need
    // (Space and the arrows inside the dialogue's text box).
    this.keys = keyboard.addKeys(
      {
        up: Phaser.Input.Keyboard.KeyCodes.UP,
        down: Phaser.Input.Keyboard.KeyCodes.DOWN,
        left: Phaser.Input.Keyboard.KeyCodes.LEFT,
        right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
        w: Phaser.Input.Keyboard.KeyCodes.W,
        a: Phaser.Input.Keyboard.KeyCodes.A,
        s: Phaser.Input.Keyboard.KeyCodes.S,
        d: Phaser.Input.Keyboard.KeyCodes.D,
      },
      false,
    ) as MoveKeys
    // Talk on the keydown event itself, not by polling the key each frame: a quick
    // tap (down and up between two frames) would otherwise be missed.
    const talk = oncePerEvent((event: KeyboardEvent) => {
      if (!isForTheGame(event)) return
      if (!this.inputEnabled || !this.nearby || this.nearby.talking) return
      // The dialogue's text box takes focus during this same key press; without
      // this the Space (or Enter) would also be typed into it.
      event.preventDefault()
      this.startTalk(this.nearby)
    })
    keyboard.on('keydown-SPACE', talk)
    keyboard.on('keydown-ENTER', talk)
    keyboard.on(
      'keydown-ESC',
      oncePerEvent((event: KeyboardEvent) => {
        if (this.inputEnabled && isForTheGame(event)) {
          this.options.bridge.events.emit('pause', {})
        }
      }),
    )

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      if (!this.inputEnabled) return
      const point = { x: pointer.worldX, y: pointer.worldY }
      // A tap on (or right next to) a mentor walks over and starts talking.
      const mentor = nearestWithin(
        point,
        this.mentors.map((m) => ({ x: m.sprite.x, y: m.sprite.y, mentor: m })),
        TILE,
      )
      this.stuckMs = 0
      this.pointerTarget = mentor
        ? { point: this.feet(mentor.mentor), mentor: mentor.mentor }
        : { point, mentor: null }
    })
  }

  private createCamera(): void {
    const camera = this.cameras.main
    const width = this.map.tiles[0]!.length * TILE
    const height = this.map.tiles.length * TILE
    camera.setBounds(0, 0, width, height)
    camera.startFollow(this.player.sprite, true, 0.15, 0.15)
    camera.setRoundPixels(true)
    const fit = () => {
      // Show roughly 18 x 12 tiles whatever the window size, never below 1x.
      const zoom = Math.min(camera.width / (18 * TILE), camera.height / (12 * TILE))
      camera.setZoom(Math.max(1, Math.round(zoom * 4) / 4))
    }
    fit()
    this.scale.on(Phaser.Scale.Events.RESIZE, fit)
    this.unsubscribe.push(() => this.scale.off(Phaser.Scale.Events.RESIZE, fit))
  }

  private listenToReact(): void {
    const { commands } = this.options.bridge
    this.unsubscribe.push(
      commands.on('input', ({ enabled }) => {
        this.inputEnabled = enabled
        this.pointerTarget = null
        if (!enabled) this.player.sprite.setVelocity(0, 0)
        // Clear held keys, so a key released while a menu was open does not stick.
        if (this.input.keyboard) this.input.keyboard.resetKeys()
      }),
      commands.on('paused', ({ paused }) => {
        this.paused = paused
      }),
      commands.on('labels', ({ visible }) => {
        this.labelsVisible = visible
        for (const mentor of this.mentors) mentor.label.setVisible(visible)
      }),
      commands.on('addMentor', (mentor) => this.spawnMentor(mentor, true)),
      commands.on('removeMentor', ({ id }) => this.despawnMentor(id)),
      commands.on('preparing', ({ mentorIds }) => {
        this.preparing = new Set(mentorIds)
      }),
      commands.on('bubbles', ({ texts }) => {
        for (const mentor of this.mentors) mentor.bubbleText = texts[mentor.id] ?? ''
      }),
      commands.on('visit', ({ visitorId, hostId }) => this.startVisit(visitorId, hostId, false)),
      commands.on('greet', ({ visitorId, hostId }) => this.startVisit(visitorId, hostId, true)),
      commands.on('say', ({ mentorId, text }) => {
        const speaker = this.mentor(mentorId)
        if (!speaker?.visit) return
        const other = this.mentor(speaker.visit.otherId)
        if (other) other.saying = null
        speaker.saying = text
      }),
      commands.on('endVisit', ({ visitorId, hostId }) => {
        for (const id of [visitorId, hostId]) {
          const mentor = this.mentor(id)
          if (mentor) this.leaveVisit(mentor)
        }
      }),
      commands.on('joinTalk', ({ mentorId }) => {
        const mentor = this.mentor(mentorId)
        if (mentor) mentor.talking = true
      }),
      commands.on('endTalk', ({ mentorId }) => {
        const mentor = this.mentors.find((m) => m.id === mentorId)
        if (mentor) mentor.talking = false
      }),
    )
  }

  // --- Frame update ----------------------------------------------------------------

  override update(_time: number, delta: number): void {
    if (!this.built) return
    if (this.paused) {
      // A frozen world: everyone stands still and the wander timers do not run.
      for (const actor of [this.player, ...this.mentors]) {
        actor.sprite.setVelocity(0, 0)
        this.animate(actor, { x: 0, y: 0 })
      }
      for (const mentor of this.mentors) this.placeOverhead(mentor)
      return
    }
    this.updatePlayer(delta)
    for (const mentor of this.mentors) this.updateMentor(mentor, delta)
    this.updateEncounters()
    this.updateNearby()
    for (const actor of [this.player, ...this.mentors]) actor.sprite.setDepth(this.feet(actor).y)
  }

  private feet(actor: Actor): Point {
    return { x: actor.sprite.x, y: actor.sprite.y + FEET_OFFSET }
  }

  private updatePlayer(delta: number): void {
    const sprite = this.player.sprite
    if (!this.inputEnabled) {
      this.animate(this.player, { x: 0, y: 0 })
      return
    }

    let vx = 0
    let vy = 0
    const k = this.keys
    if (k.left.isDown || k.a.isDown) vx -= 1
    if (k.right.isDown || k.d.isDown) vx += 1
    if (k.up.isDown || k.w.isDown) vy -= 1
    if (k.down.isDown || k.s.isDown) vy += 1

    if (vx !== 0 || vy !== 0) {
      this.pointerTarget = null // the keyboard takes over from a tap
    } else if (this.pointerTarget) {
      const feet = this.feet(this.player)
      const target = this.pointerTarget.mentor
      // Follow a mentor who wanders off, rather than walking to where they were.
      const goal = target ? this.feet(target) : this.pointerTarget.point
      const dx = goal.x - feet.x
      const dy = goal.y - feet.y
      const distance = Math.hypot(dx, dy)
      const stopAt = target ? TALK_REACH * 0.8 : 4
      const moved = Math.hypot(feet.x - this.lastPlayerFeet.x, feet.y - this.lastPlayerFeet.y)
      this.stuckMs = moved < 0.05 ? this.stuckMs + delta : 0
      if (distance <= stopAt) {
        this.pointerTarget = null
        if (target) this.startTalk(target)
      } else if (this.stuckMs > 400) {
        // Walking into water or a hedge: give up instead of pushing forever.
        this.pointerTarget = null
      } else {
        vx = dx / distance
        vy = dy / distance
      }
    }
    this.lastPlayerFeet = this.feet(this.player)

    const length = Math.hypot(vx, vy) || 1
    const velocity = { x: (vx / length) * PLAYER_SPEED, y: (vy / length) * PLAYER_SPEED }
    sprite.setVelocity(velocity.x, velocity.y)
    this.animate(this.player, velocity)
  }

  /** Takes a mentor out of the square: ends any visit, then drops their sprite and text. */
  private despawnMentor(id: string): void {
    const mentor = this.mentor(id)
    if (!mentor) return
    this.failVisit(mentor)
    if (this.nearby === mentor) {
      this.nearby = null
      this.options.bridge.events.emit('nearby', { mentorId: null })
    }
    const sprite = mentor.sprite
    for (const collider of this.physics.world.colliders.getActive()) {
      if (collider.object1 === sprite || collider.object2 === sprite) collider.destroy()
    }
    sprite.destroy()
    mentor.label.destroy()
    mentor.tag.destroy()
    mentor.bubble.destroy()
    mentor.cloud.destroy()
    this.mentors = this.mentors.filter((other) => other !== mentor)
  }

  private mentor(id: string): MentorActor | undefined {
    return this.mentors.find((mentor) => mentor.id === id)
  }

  /**
   * Sends one mentor walking over to another; `visitFailed` when it cannot start.
   * A greeting plays a quick hello on arrival instead of waiting for React.
   */
  private startVisit(visitorId: string, hostId: string, greeting: boolean): void {
    const visitor = this.mentor(visitorId)
    const host = this.mentor(hostId)
    const walk =
      visitor && host && visitorId !== hostId && !busy(visitor) && !busy(host)
        ? startVisit(this.map, this.feet(visitor), this.feet(host))
        : null
    if (!visitor || !host || !walk) {
      this.options.bridge.events.emit('visitFailed', { visitorId, hostId })
      return
    }
    visitor.visit = { role: 'visitor', otherId: hostId, walk, greeting }
    host.visit = { role: 'host', otherId: visitorId }
  }

  /** Ends a mentor's part in a visit: their line clears and they wander from here. */
  private leaveVisit(mentor: MentorActor): void {
    mentor.visit = null
    mentor.saying = null
    mentor.sociableAt = this.time.now + SOCIAL_REST_MS
    mentor.wander = startWander(this.feet(mentor), mentor.rng)
  }

  /** Gives a visit up for both mentors and tells React. */
  private failVisit(mentor: MentorActor): void {
    const visit = mentor.visit
    if (!visit) return
    const other = this.mentor(visit.otherId)
    const visitorId = visit.role === 'visitor' ? mentor.id : visit.otherId
    const hostId = visit.role === 'visitor' ? visit.otherId : mentor.id
    this.leaveVisit(mentor)
    if (other) this.leaveVisit(other)
    this.options.bridge.events.emit('visitFailed', { visitorId, hostId })
  }

  /** A mentor taking part in a visit: walk (visitor) or stand facing the other. */
  private updateVisit(mentor: MentorActor, visit: Visit, delta: number): void {
    const sprite = mentor.sprite
    const other = this.mentor(visit.otherId)
    if (!other) {
      this.leaveVisit(mentor)
      return
    }
    if (visit.role === 'visitor') {
      const step = stepVisit(visit.walk, this.feet(mentor), delta, MENTOR_SPEED)
      if (step.failed) {
        this.failVisit(mentor)
        return
      }
      if (!step.arrived) {
        mentor.visit = { ...visit, walk: step.state }
        sprite.setVelocity(step.velocity.x, step.velocity.y)
        this.animate(mentor, step.velocity)
        return
      }
      other.visit = { role: 'meeting', otherId: mentor.id }
      if (visit.greeting) {
        const lines = greetingLines(mentor.name, other.name, mentor.rng)
        mentor.visit = { role: 'greeting', otherId: other.id, lines, index: -1, msLeft: 0 }
      } else {
        mentor.visit = { role: 'meeting', otherId: other.id }
        this.options.bridge.events.emit('met', { visitorId: mentor.id, hostId: other.id })
      }
    } else if (visit.role === 'greeting') {
      this.updateGreeting(mentor, other, visit, delta)
      if (!mentor.visit) return
    }
    sprite.setVelocity(0, 0)
    if (
      visit.role !== 'host' ||
      Math.hypot(sprite.x - other.sprite.x, sprite.y - other.sprite.y) < TILE * 3
    ) {
      mentor.facing = facingTowards(this.feet(mentor), this.feet(other))
    }
    this.animate(mentor, { x: 0, y: 0 })
  }

  /** Shows the greeting's lines in turn over the speaker; then both stroll on. */
  private updateGreeting(
    mentor: MentorActor,
    other: MentorActor,
    visit: Extract<Visit, { role: 'greeting' }>,
    delta: number,
  ): void {
    const msLeft = visit.msLeft - delta
    if (msLeft > 0) {
      mentor.visit = { ...visit, msLeft }
      return
    }
    const index = visit.index + 1
    const line = visit.lines[index]
    if (!line) {
      this.leaveVisit(mentor)
      this.leaveVisit(other)
      return
    }
    const speaker = line.speaker === 'visitor' ? mentor : other
    const listener = speaker === mentor ? other : mentor
    listener.saying = null
    speaker.saying = line.text
    mentor.visit = { ...visit, index, msLeft: greetingLineMs(line.text) + GREETING_GAP_MS }
  }

  private updateMentor(mentor: MentorActor, delta: number): void {
    const sprite = mentor.sprite
    if (mentor.talking) {
      sprite.setVelocity(0, 0)
      mentor.facing = facingTowards(this.feet(mentor), this.feet(this.player))
      this.animate(mentor, { x: 0, y: 0 })
    } else if (mentor.visit) {
      this.updateVisit(mentor, mentor.visit, delta)
    } else {
      const position = this.feet(mentor)
      const moved = Math.hypot(
        position.x - mentor.lastPosition.x,
        position.y - mentor.lastPosition.y,
      )
      const wasWalking = mentor.wander.mode === 'walk' && sprite.body!.velocity.length() > 0
      const step = stepWander(
        mentor.wander,
        {
          places: this.places,
          spread: PLACE_SPREAD,
          speed: MENTOR_SPEED,
          route: (from, to) => this.route(from, to),
        },
        position,
        delta,
        mentor.rng,
        wasWalking && moved < 0.05,
      )
      mentor.wander = step.state
      mentor.lastPosition = position
      sprite.setVelocity(step.velocity.x, step.velocity.y)
      this.animate(mentor, step.velocity)
    }
    this.placeOverhead(mentor)
  }

  /** Keeps the name label, the "preparing" tag and the speech cloud over a mentor. */
  private placeOverhead(mentor: MentorActor): void {
    const sprite = mentor.sprite
    const labelY = sprite.y - CHARACTER_H / 2 + 2
    mentor.label.setPosition(sprite.x, labelY).setDepth(100_000)
    // The "preparing" tag sits on top of the name label, the cloud above both.
    const preparing = this.preparing.has(mentor.id)
    mentor.tag.setVisible(preparing)
    if (preparing) {
      const text = preparingText(this.time.now)
      if (mentor.tag.text !== text) mentor.tag.setText(text)
      mentor.tag.setPosition(sprite.x, labelY - 17).setDepth(100_000)
    }
    // Above the name label (or where it would be), with room for the cloud's trail.
    const bubbleY = sprite.y - CHARACTER_H / 2 - 16 - CLOUD_TRAIL_DROP - (preparing ? 16 : 0)
    mentor.cloud.setPosition(sprite.x, bubbleY).setDepth(100_001)
    mentor.bubble.setPosition(sprite.x, bubbleY).setDepth(100_002)
  }

  /** A walkable way round trees, benches and the fountain, as cell centres. */
  private route(from: Point, to: Point): Point[] | null {
    const path = findPath(this.map, cellOf(from), cellOf(to))
    return path ? path.map(cellCenter) : null
  }

  /**
   * Tells React when two free mentors notice each other while strolling; React has
   * one walk over, for a real chat or a quick hello. Each pair at most every
   * `ENCOUNTER_REPEAT_MS`, and nobody just out of a meeting.
   */
  private updateEncounters(): void {
    const now = this.time.now
    const free = this.mentors
      .filter((mentor) => !mentor.talking && !mentor.visit && now >= mentor.sociableAt)
      .map((mentor) => {
        const feet = this.feet(mentor)
        return { id: mentor.id, x: feet.x, y: feet.y }
      })
    for (const pair of findEncounters(free, NOTICE_REACH)) {
      const key = pair.toSorted().join('+')
      if (now - (this.encounters.get(key) ?? -Infinity) < ENCOUNTER_REPEAT_MS) continue
      this.encounters.set(key, now)
      // Who walks over to whom is a coin toss.
      const [a, b] = pair
      this.options.bridge.events.emit('encounter', {
        mentorIds: Math.random() < 0.5 ? [a, b] : [b, a],
      })
      return
    }
  }

  private updateNearby(): void {
    const feet = this.feet(this.player)
    const found = nearestWithin(
      feet,
      this.mentors.map((mentor) => ({ ...this.feet(mentor), mentor })),
      TALK_REACH,
    )
    const nearby = found?.mentor ?? null
    if (nearby !== this.nearby) {
      this.nearby = nearby
      this.options.bridge.events.emit('nearby', { mentorId: nearby?.id ?? null })
    }
    const showPrompt = Boolean(nearby && this.inputEnabled && !nearby.talking)
    this.prompt.setVisible(showPrompt)
    if (nearby && showPrompt) {
      this.prompt.setPosition(nearby.sprite.x, nearby.sprite.y - CHARACTER_H / 2 - 22)
    }
    for (const mentor of this.mentors) {
      const at = this.feet(mentor)
      // A line said in a meeting shows whatever the distance; otherwise the ledger hint.
      const text = mentor.saying ?? mentor.bubbleText
      if (mentor.bubble.text !== text) {
        mentor.bubble.setText(text)
        paintCloud(mentor.cloud, mentor.bubble.width, mentor.bubble.height)
      }
      const visible =
        mentor.saying !== null
          ? !mentor.talking
          : showBubble({
              hasText: text.length > 0,
              distance: Math.hypot(at.x - feet.x, at.y - feet.y),
              reach: BUBBLE_REACH,
              talking: mentor.talking,
              prompted: showPrompt && mentor === nearby,
            })
      mentor.bubble.setVisible(visible)
      mentor.cloud.setVisible(visible)
    }
  }

  private startTalk(mentor: MentorActor): void {
    // Walking up to a mentor in a visit ends it; React may turn this talk into
    // joining their conversation.
    this.failVisit(mentor)
    mentor.talking = true
    this.player.facing = facingTowards(this.feet(this.player), this.feet(mentor))
    this.player.sprite.setVelocity(0, 0)
    this.options.bridge.events.emit('talk', { mentorId: mentor.id })
  }

  private animate(actor: Actor, velocity: Point): void {
    const moving = velocity.x !== 0 || velocity.y !== 0
    actor.facing = facingFor(velocity, actor.facing)
    if (moving) {
      actor.sprite.anims.play(`${actor.textureKey}-walk-${actor.facing}`, true)
    } else {
      actor.sprite.anims.stop()
      actor.sprite.setFrame(characterFrame(actor.facing, 0))
    }
  }
}

/** A transparent tileset at world size, for the invisible collision layers. */
function blankTileset(): HTMLCanvasElement {
  const element = document.createElement('canvas')
  element.width = TILE * TILE_KIND_COUNT
  element.height = TILE
  return element
}

const CLOUD_FILL = 0xfdfcf7
const CLOUD_EDGE = 0x1f2937
const CLOUD_EDGE_WIDTH = 1.5

/**
 * Paints the thought cloud for a bubble of this size, relative to the bubble's
 * bottom-centre. Every shape is filled in the edge colour slightly larger first,
 * then in the fill colour, so overlapping puffs merge into one outlined cloud.
 */
function paintCloud(g: Phaser.GameObjects.Graphics, width: number, height: number): void {
  g.clear()
  if (width === 0) return
  const { body, puffs, trail } = cloudShape(width, height)
  for (const [color, grow] of [
    [CLOUD_EDGE, CLOUD_EDGE_WIDTH],
    [CLOUD_FILL, 0],
  ] as const) {
    g.fillStyle(color, 1)
    g.fillRoundedRect(
      body.x - grow,
      body.y - grow,
      body.w + grow * 2,
      body.h + grow * 2,
      body.radius,
    )
    for (const c of [...puffs, ...trail]) g.fillCircle(c.x, c.y, c.r + grow)
  }
}
