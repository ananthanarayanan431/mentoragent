import { Check } from 'lucide-react'
import { useEffect, useId, useState } from 'react'

import { addPresetMentor, ApiError, listPresets } from '@/lib/api'
import type { Mentor, Preset } from '@/lib/types'

interface Props {
  /** Called with the mentor a preset became: memory building, not in the square yet. */
  onCreated: (mentor: Mentor) => void
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
 * Famous mentors whose background is stored with the agent, so no web research is
 * needed. Pick one, read who they are, then create them; they join your mentors,
 * not the square. Shows nothing if the agent offers none.
 */
export function PresetPicker({ onCreated }: Props) {
  const [presets, setPresets] = useState<Preset[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const headingId = useId()

  useEffect(() => {
    const controller = new AbortController()
    listPresets(controller.signal)
      .then(setPresets)
      .catch(() => setPresets([])) // an older agent without presets: just the form
    return () => controller.abort()
  }, [])

  const selected = presets.find((preset) => preset.id === selectedId) ?? null

  async function create(preset: Preset) {
    setError('')
    setCreating(true)
    try {
      const mentor = await addPresetMentor(preset.id)
      setPresets((current) => current.map((p) => (p.id === preset.id ? { ...p, added: true } : p)))
      setSelectedId(null)
      onCreated(mentor)
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : `${preset.name} could not be created.`)
    } finally {
      setCreating(false)
    }
  }

  if (!presets.length) return null

  return (
    <section
      aria-labelledby={headingId}
      className="mt-6 rounded-xl border border-line bg-surface p-5 shadow-sm"
    >
      <h2 id={headingId} className="text-lg font-semibold">
        Start from a preset
      </h2>
      <p className="mt-1 text-sm text-muted">
        Famous minds whose background is already stored, so there is no web search to wait for. Pick
        one to see who they are. Creating them does not put them in the square; you bring them in
        when you want.
      </p>

      <div className="mt-5 space-y-4">
        {byCategory(presets).map(([category, group]) => (
          <fieldset key={category}>
            <legend className="font-pixel text-xs font-semibold tracking-wider text-muted uppercase">
              {category}
            </legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {group.map((preset) => (
                <label
                  key={preset.id}
                  aria-label={preset.name}
                  className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${
                    preset.added
                      ? 'cursor-default border-line opacity-60'
                      : selectedId === preset.id
                        ? 'cursor-pointer border-accent bg-accent-soft'
                        : 'cursor-pointer border-line bg-canvas hover:border-line-strong hover:bg-raised'
                  }`}
                >
                  <input
                    type="radio"
                    name="preset"
                    value={preset.id}
                    checked={selectedId === preset.id}
                    disabled={preset.added || creating}
                    onChange={() => {
                      setError('')
                      setSelectedId(preset.id)
                    }}
                    className="mt-1 accent-[var(--ui-accent)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 font-medium">
                      {preset.name}
                      {preset.added && (
                        <span className="inline-flex items-center gap-0.5 text-xs font-normal text-positive">
                          <Check size={12} aria-hidden="true" />
                          Already created
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-xs text-muted">
                      {preset.expertise}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>

      {selected && (
        <div
          role="group"
          aria-label={`About ${selected.name}`}
          className="mt-5 rounded-lg border border-line bg-raised p-4 text-sm"
        >
          <p className="font-semibold">{selected.name}</p>
          <p className="mt-2">
            <span className="font-medium">Believes: </span>
            <span className="text-muted">{selected.perspective}</span>
          </p>
          <p className="mt-1.5">
            <span className="font-medium">Speaks: </span>
            <span className="text-muted">{selected.style}</span>
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void create(selected)}
              disabled={creating}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover disabled:opacity-50"
            >
              {creating ? 'Creating…' : `Create ${selected.name}`}
            </button>
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              disabled={creating}
              className="rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  )
}
