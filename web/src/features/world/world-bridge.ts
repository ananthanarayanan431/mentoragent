/**
 * The only link between the Phaser scene and React. The game reports what happens
 * (a mentor is nearby, the player wants to talk or pause); React sends commands
 * back (freeze input while typing, show or hide name labels). Neither side
 * imports the other.
 */

/** Events the game sends to React. */
export interface GameEvents {
  /** The mentor the player is close enough to talk to changed (null: nobody). */
  nearby: { mentorId: string | null }
  /** The player asked to talk to a mentor (Space, Enter, or a tap on them). */
  talk: { mentorId: string }
  /** The player asked for the pause menu (Escape). */
  pause: Record<string, never>
  /** The scene has built the world and is running. */
  ready: Record<string, never>
}

/** Commands React sends to the game. */
export interface GameCommands {
  /** Keyboard and pointer control of the player; off while a menu or dialogue is open. */
  input: { enabled: boolean }
  labels: { visible: boolean }
  /** The dialogue with this mentor closed: they go back to wandering. */
  endTalk: { mentorId: string }
}

type Listener<T> = (payload: T) => void

/** A minimal typed event emitter. */
export class Channel<Events extends object> {
  private listeners = new Map<keyof Events, Set<Listener<never>>>()

  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    let set = this.listeners.get(event)
    if (!set) {
      set = new Set()
      this.listeners.set(event, set)
    }
    set.add(listener as Listener<never>)
    return () => {
      set.delete(listener as Listener<never>)
    }
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    for (const listener of this.listeners.get(event) ?? []) {
      ;(listener as Listener<Events[K]>)(payload)
    }
  }

  clear(): void {
    this.listeners.clear()
  }
}

export interface WorldBridge {
  /** game -> React */
  events: Channel<GameEvents>
  /** React -> game */
  commands: Channel<GameCommands>
}

export function createWorldBridge(): WorldBridge {
  return { events: new Channel<GameEvents>(), commands: new Channel<GameCommands>() }
}
