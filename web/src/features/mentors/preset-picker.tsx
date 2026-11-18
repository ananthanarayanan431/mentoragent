import { Check, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'

import { addPresetMentor, ApiError, listPresets } from '@/lib/api'
import type { Mentor, Preset } from '@/lib/types'

interface Props {
  /** Called with the mentor a preset became; their memory is building. */
  onAdded: (mentor: Mentor) => void
}

/** Presets in the order the agent lists them, grouped by category. */
function byCategory(presets: readonly Preset[]): [string, Preset[]][] {
  const groups = new Map<string, Preset[]>()
  for (const preset of presets) {
    groups.set(preset.category, [...(groups.get(preset.category) ?? []), preset])
  }
  return [...groups]
}

/**
 * Famous mentors ready to add with one click: their background is stored with the
 * agent, so no web research is needed. Shows nothing if the agent offers none.
 */
export function PresetPicker({ onAdded }: Props) {
  const [presets, setPresets] = useState<Preset[]>([])
  const [adding, setAdding] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    listPresets(controller.signal)
      .then(setPresets)
      .catch(() => setPresets([])) // an older agent without presets: just the form
    return () => controller.abort()
  }, [])

  async function add(preset: Preset) {
    setError('')
    setAdding(preset.id)
    try {
      const mentor = await addPresetMentor(preset.id)
      setPresets((current) => current.map((p) => (p.id === preset.id ? { ...p, added: true } : p)))
      onAdded(mentor)
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : `${preset.name} could not be added.`)
    } finally {
      setAdding(null)
    }
  }

  if (!presets.length) return null

  return (
    <section
      aria-labelledby="preset-heading"
      className="mt-6 rounded-xl border border-line bg-surface p-5 shadow-sm"
    >
      <h2 id="preset-heading" className="text-lg font-semibold">
        Start from a preset
      </h2>
      <p className="mt-1 text-sm text-muted">
        Famous minds whose background is already stored, so there is no web search to wait for.
        Their memory is ready in a minute or two.
      </p>
      <div className="mt-5 space-y-4">
        {byCategory(presets).map(([category, group]) => (
          <section key={category} aria-label={`${category} presets`}>
            <h3 className="font-pixel text-xs font-semibold tracking-wider text-muted uppercase">
              {category}
            </h3>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {group.map((preset) => (
                <li key={preset.id}>
                  <button
                    type="button"
                    onClick={() => void add(preset)}
                    disabled={preset.added || adding !== null}
                    aria-label={
                      preset.added ? `${preset.name} is in the square` : `Add ${preset.name}`
                    }
                    className="flex w-full items-start gap-3 rounded-lg border border-line bg-canvas px-3 py-2.5 text-left hover:border-accent hover:bg-raised disabled:cursor-default disabled:hover:border-line disabled:hover:bg-canvas"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{preset.name}</span>
                      <span className="mt-0.5 line-clamp-2 block text-xs text-muted">
                        {preset.expertise}
                      </span>
                    </span>
                    <span
                      aria-hidden="true"
                      className={`mt-0.5 inline-flex shrink-0 items-center gap-1 text-xs ${
                        preset.added ? 'text-positive' : 'text-accent'
                      }`}
                    >
                      {preset.added ? <Check size={14} /> : <Plus size={14} />}
                      {preset.added ? 'Added' : adding === preset.id ? 'Adding…' : 'Add'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </section>
  )
}
