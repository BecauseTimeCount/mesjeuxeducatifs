import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getSummary } from '@/engine/mastery'
import { useProfiles } from '@/engine/profiles'
import { sessionMinutes } from '@/engine/session'
import { exportAll, importAll } from '@/engine/storage'
import { DOMAIN_LABELS, LEVEL_LABELS, SKILL_MAP } from '@/content/skill-map'
import { ParentGate } from '@/ui'
import type { Domain, MasteryState, SkillProgress } from '@/engine/types'

const DOMAIN_ORDER: Domain[] = ['francais', 'maths', 'logique']

const STATE_ORDER: MasteryState[] = ['decouverte', 'en-cours', 'maitrise', 'consolide']

const STATE_META: Record<MasteryState, { color: string; label: string }> = {
  decouverte: { color: '#cccccc', label: 'Découverte' },
  'en-cours': { color: '#ffc94d', label: 'En cours' },
  maitrise: { color: '#58c472', label: 'Maîtrisé' },
  consolide: { color: '#3a9e54', label: 'Consolidé' },
}

function SkillMapSection({ summary }: { summary: Record<string, SkillProgress> }) {
  return (
    <section className="card p-5">
      <h2 className="text-lg font-extrabold">Carte de compétences</h2>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
        {STATE_ORDER.map((state) => (
          <span key={state} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: STATE_META[state].color }}
            />
            {STATE_META[state].label}
          </span>
        ))}
      </div>
      {DOMAIN_ORDER.map((domain) => (
        <div key={domain} className="mt-4">
          <h3 className="text-sm font-bold uppercase tracking-wide text-ink-soft">
            {DOMAIN_LABELS[domain]}
          </h3>
          <ul className="mt-1 divide-y divide-sand">
            {SKILL_MAP.filter((s) => s.domain === domain).map((skill) => {
              const state = summary[skill.id]?.state ?? 'decouverte'
              const meta = STATE_META[state]
              return (
                <li key={skill.id} className="flex items-start gap-3 py-2">
                  <span
                    aria-hidden
                    className="mt-1 h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: meta.color }}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-snug">
                      {skill.label}{' '}
                      <span className="font-normal text-ink-soft">
                        · {LEVEL_LABELS[skill.level]} · {meta.label}
                      </span>
                    </p>
                    <p className="text-xs leading-snug text-ink-soft">{skill.official}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </section>
  )
}

function ParentDashboard() {
  const profiles = useProfiles((s) => s.profiles)
  const removeProfile = useProfiles((s) => s.remove)
  const [summary, setSummary] = useState<Record<string, SkillProgress>>({})
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [importError, setImportError] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const minutes = sessionMinutes()

  useEffect(() => {
    let cancelled = false
    void getSummary().then((s) => {
      if (!cancelled) setSummary(s)
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleRemove(id: string) {
    await removeProfile(id)
    setConfirmId(null)
  }

  async function handleExport() {
    const json = await exportAll()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'mes-jeux-sauvegarde.json'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  async function handleImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await importAll(await file.text())
      window.location.reload()
    } catch {
      setImportError(true)
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <header className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">Espace parents</h1>
        <Link
          to="/"
          className="rounded-xl p-2 text-sm font-semibold text-ink-soft underline underline-offset-2"
        >
          ← Retour aux jeux
        </Link>
      </header>

      <div className="flex flex-col gap-4">
        <SkillMapSection summary={summary} />

        <section className="card p-5">
          <h2 className="text-lg font-extrabold">Session en cours</h2>
          <p className="mt-1 text-sm">
            Temps de jeu cumulé&nbsp;: <strong>{minutes}&nbsp;min</strong>
          </p>
        </section>

        <section className="card p-5">
          <h2 className="text-lg font-extrabold">Profils</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {profiles.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-paper px-3 py-2">
                <span aria-hidden className="text-2xl">
                  {p.emoji}
                </span>
                <span className="flex-1 text-sm font-semibold">
                  {p.name} <span className="font-normal text-ink-soft">· {p.ageBand} ans</span>
                </span>
                {confirmId === p.id ? (
                  <span className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleRemove(p.id)}
                      className="rounded-lg bg-coral-deep px-3 py-2 text-sm font-bold text-white"
                    >
                      Confirmer
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmId(null)}
                      className="rounded-lg px-3 py-2 text-sm font-semibold text-ink-soft"
                    >
                      Annuler
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmId(p.id)}
                    className="rounded-lg px-3 py-2 text-sm font-semibold text-coral-deep"
                  >
                    Supprimer
                  </button>
                )}
              </li>
            ))}
            {profiles.length === 0 && <li className="text-sm text-ink-soft">Aucun profil.</li>}
          </ul>
          <p className="mt-2 text-xs text-ink-soft">
            La suppression efface définitivement la progression du profil sur cet appareil.
          </p>
        </section>

        <section className="card p-5">
          <h2 className="text-lg font-extrabold">Données</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Sauvegardez la progression dans un fichier, ou restaurez-la depuis une autre tablette.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void handleExport()}
              className="rounded-xl bg-lagoon-700 px-4 py-3 text-sm font-bold text-white"
            >
              Exporter
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="rounded-xl border-2 border-lagoon-700 px-4 py-3 text-sm font-bold text-lagoon-700"
            >
              Importer
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => void handleImport(e)}
            />
          </div>
          {importError && (
            <p className="mt-2 text-sm font-semibold text-coral-deep">
              Fichier invalide — import impossible.
            </p>
          )}
        </section>

        <section className="card p-5">
          <h2 className="text-lg font-extrabold">Notre charte</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-soft">
            <li>Zéro publicité, zéro compte, zéro tracking.</li>
            <li>Les données restent à 100&nbsp;% sur cet appareil (export manuel uniquement).</li>
            <li>
              Sessions courtes recommandées (15 à 20 minutes), conformément aux repères officiels
              sur les écrans des jeunes enfants, de préférence accompagné d’un adulte.
            </li>
          </ul>
        </section>

        <Link
          to="/"
          className="card block px-4 py-3 text-center text-base font-bold text-lagoon-700"
        >
          ← Retour aux jeux
        </Link>
      </div>
    </div>
  )
}

export default function ParentsPage() {
  const navigate = useNavigate()
  const [passed, setPassed] = useState(false)

  if (!passed) {
    return <ParentGate onPass={() => setPassed(true)} onCancel={() => void navigate('/')} />
  }

  return <ParentDashboard />
}
