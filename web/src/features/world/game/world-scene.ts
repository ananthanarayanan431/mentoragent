/**
 * The Mentor Square scene: draws the town, moves the player and the wandering
 * mentors, and reports to React through the bridge. Decisions (where to wander,
 * who is in reach, which way to face) come from the pure modules next to it.
 */
import * as Phaser from 'phaser'

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
import { isForTheGame, oncePerEvent } from './keys'
import {
  facingFor,
  facingTowards,
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
const MENTOR_SPEED = 42
const WANDER_RADIUS = TILE * 3
/** How close (feet to feet) the player must be to talk. */
const TALK_REACH = TILE * 1.8
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
  wander: WanderState
  home: Point
  rng: Rng
  talking: boolean
  lastPosition: Point
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
  private blockers: Phaser.Tilemaps.TilemapLayer[] = []
  private labelsVisible: boolean
  private keys!: MoveKeys
  private prompt!: Phaser.GameObjects.Text
  private nearby: MentorActor | null = null
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
        fontFamily: 'ui-monospace, Menlo, monospace',
        fontSize: '11px',
        color: '#fdfcf7',
        backgroundColor: '#1f2937cc',
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5, 1)
      .setResolution(2)
      .setVisible(this.labelsVisible)

    const added: MentorActor = {
      ...actor,
      id: mentor.id,
      name: mentor.name,
      label,
      home,
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
        fontFamily: 'ui-monospace, Menlo, monospace',
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
      return
    }
    this.updatePlayer(delta)
    for (const mentor of this.mentors) this.updateMentor(mentor, delta)
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

  private updateMentor(mentor: MentorActor, delta: number): void {
    const sprite = mentor.sprite
    if (mentor.talking) {
      sprite.setVelocity(0, 0)
      mentor.facing = facingTowards(this.feet(mentor), this.feet(this.player))
      this.animate(mentor, { x: 0, y: 0 })
    } else {
      const position = this.feet(mentor)
      const moved = Math.hypot(
        position.x - mentor.lastPosition.x,
        position.y - mentor.lastPosition.y,
      )
      const wasWalking = mentor.wander.mode === 'walk' && sprite.body!.velocity.length() > 0
      const step = stepWander(
        mentor.wander,
        { home: mentor.home, radius: WANDER_RADIUS, speed: MENTOR_SPEED },
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
    mentor.label.setPosition(sprite.x, sprite.y - CHARACTER_H / 2 + 2).setDepth(100_000)
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
  }

  private startTalk(mentor: MentorActor): void {
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
