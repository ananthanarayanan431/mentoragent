import { useEffect, useRef, useState } from 'react'

import { startAmbientChat } from '@/lib/api'
import type { Mentor } from '@/lib/types'
import {
  eligiblePairs,
  lineSchedule,
  nextDelayMs,
  pickPair,
  type Meeting,
  type Pair,
} from './ambient'
import type { WorldBridge } from './world-bridge'

interface Options {
  bridge: WorldBridge
  /** True while the player is walking around (not on the title, paused, or talking). */
  active: boolean
  mentors: readonly Mentor[]
  random?: () => number
  now?: () => number
}

/**
 * Now and then, while the square is played and the tab is visible, sends a mentor
 * over to another, plays their chat as bubbles (about your goal if both advised you,
 * a short hello otherwise; never longer than `MAX_TALK_MS`), and lets them go.
 * Nothing runs otherwise: no request, no timer.
 */
export function useAmbientChats({
  bridge,
  active,
  mentors,
  random = Math.random,
  now = Date.now,
}: Options): Meeting | null {
  const [meeting, setMeeting] = useState<Meeting | null>(null)
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden')
  // Everything the timers and bridge listeners read, kept current without
  // re-subscribing: the latest props, the running meeting, and pending timers.
  const live = useRef({
    mentors,
    random,
    now,
    running: false,
    meeting: null as Meeting | null,
    lastPair: null as Pair | null,
    timers: new Set<ReturnType<typeof setTimeout>>(),
    generation: 0,
  })
  useEffect(() => {
    Object.assign(live.current, { mentors, random, now })
  }, [mentors, random, now])

  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])

  useEffect(() => {
    const state = live.current

    const later = (ms: number, run: () => void) => {
      const timer = setTimeout(() => {
        state.timers.delete(timer)
        run()
      }, ms)
      state.timers.add(timer)
    }
    const update = (next: Meeting | null) => {
      state.meeting = next
      setMeeting(next)
    }
    const scheduleNext = () => {
      if (state.running) later(nextDelayMs(state.random), start)
    }
    const finish = (meetingNow: Meeting, tell: boolean) => {
      if (state.meeting !== meetingNow) return
      const [visitorId, hostId] = meetingNow.mentorIds
      if (tell) bridge.commands.emit('endVisit', { visitorId, hostId })
      update({ ...meetingNow, endedAt: state.now() })
      scheduleNext()
    }
    function start() {
      const pair = pickPair(eligiblePairs(state.mentors), state.random, state.lastPair)
      if (!pair) {
        scheduleNext()
        return
      }
      state.lastPair = pair
      update({ mentorIds: pair, ambientId: null, lines: [], endedAt: null })
      bridge.commands.emit('visit', { visitorId: pair[0], hostId: pair[1] })
    }
    const play = async (current: Meeting, generation: number) => {
      try {
        const chat = await startAmbientChat(current.mentorIds)
        if (generation !== state.generation || state.meeting !== current) return
        const withChat = {
          ...current,
          ambientId: chat.id,
          lines: chat.lines.map((line) => ({ mentorId: line.mentor_id, text: line.text })),
        }
        update(withChat)
        const times = lineSchedule(chat.lines.map((line) => line.text))
        let at = 0
        chat.lines.forEach((line, index) => {
          later(at, () => {
            if (state.meeting !== withChat) return
            bridge.commands.emit('say', { mentorId: line.mentor_id, text: line.text })
          })
          at += times[index]!
        })
        later(at, () => finish(withChat, true))
      } catch {
        // Not eligible, too soon, or the model failed: skip this one quietly.
        if (generation === state.generation) finish(current, true)
      }
    }

    const offMet = bridge.events.on('met', ({ visitorId, hostId }) => {
      const current = state.meeting
      if (!current || current.endedAt !== null) return
      if (current.mentorIds[0] !== visitorId || current.mentorIds[1] !== hostId) return
      void play(current, state.generation)
    })
    const offFailed = bridge.events.on('visitFailed', ({ visitorId, hostId }) => {
      const current = state.meeting
      if (!current || current.endedAt !== null) return
      if (current.mentorIds[0] !== visitorId || current.mentorIds[1] !== hostId) return
      finish(current, false)
    })

    const running = active && visible
    state.running = running
    state.generation += 1
    if (running) scheduleNext()

    return () => {
      offMet()
      offFailed()
      state.running = false
      for (const timer of state.timers) clearTimeout(timer)
      state.timers.clear()
      const current = state.meeting
      if (current && current.endedAt === null) {
        const [visitorId, hostId] = current.mentorIds
        bridge.commands.emit('endVisit', { visitorId, hostId })
        update({ ...current, endedAt: state.now() })
      }
    }
  }, [bridge, active, visible])

  return meeting
}
