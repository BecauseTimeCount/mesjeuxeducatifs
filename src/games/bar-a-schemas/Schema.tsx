// ============================================================
// Le Bar à Schémas — rendu du schéma en barres.
// Trois familles de schémas : parties-tout (tout en haut,
// parties en bas), transformation (avant → flèche → après),
// comparaison (deux barres alignées + écart au bout).
// Largeurs proportionnelles aux valeurs (modèle de Singapour),
// avec un minimum de 64 px pour les cibles tactiles.
// ============================================================

import type { ReactNode } from 'react'
import type { BscItem, Placement, SlotRole } from './logic'

export interface SchemaViewProps {
  item: BscItem
  placed: Placement
  /** Contenu de la barre « ? » : null → « ? » (saisie en cours, réponse révélée…). */
  unknownDisplay: string | null
  /** La barre « ? » brille (indice après 2 échecs de calcul). */
  unknownGlow: boolean
  /** Feedback de comptage : points remplis dans la barre « ? » (null = aucun). */
  countingDots: number | null
  /** Emplacements qui brillent (feedback élaboratif / indice de placement). */
  hintRoles: readonly SlotRole[]
  /** Phase MODÉLISER : les emplacements libres sont tappables. */
  interactive: boolean
  onSlotTap: (role: SlotRole) => void
  accent: string
}

const ALT_COLOR = 'var(--color-sky)'
const UNKNOWN_BORDER = 'var(--color-sun-deep)'
const UNKNOWN_BG = 'rgba(255, 201, 77, 0.25)'

const ROLE_LABELS: Readonly<Record<SlotRole, string>> = {
  whole: 'la grande barre du tout',
  part1: 'une barre de partie',
  part2: 'une barre de partie',
  start: 'la barre d’avant',
  change: 'le badge de la flèche',
  end: 'la barre d’après',
  heroBar: 'la barre du haut',
  rivalBar: 'la barre du bas',
  diff: 'la différence',
}

// ------------------------------------------------------------
// Briques visuelles
// ------------------------------------------------------------

function FilledBar({
  pct,
  value,
  emoji,
  color,
  label,
}: {
  pct: number
  value: number
  emoji: string
  color: string
  label: string
}) {
  return (
    <div
      role="img"
      aria-label={`${value} dans ${label}`}
      className="animate-pop flex h-16 items-center justify-center gap-1.5 rounded-bubble text-white shadow-card"
      style={{ width: `${pct}%`, minWidth: 64, background: color }}
    >
      <span className="text-3xl font-extrabold">{value}</span>
      <span aria-hidden="true" className="text-lg">{emoji}</span>
    </div>
  )
}

function TargetSlot({
  pct,
  glow,
  interactive,
  onTap,
  label,
}: {
  pct: number
  glow: boolean
  interactive: boolean
  onTap: () => void
  label: string
}) {
  return (
    <button
      type="button"
      disabled={!interactive}
      onClick={onTap}
      aria-label={`Poser un nombre sur ${label}`}
      className={`tap-target flex h-16 items-center justify-center rounded-bubble border-[3px] border-dashed border-ink-soft/30 bg-white/70 text-3xl font-extrabold text-ink-soft/50 transition-transform active:scale-95 ${glow ? 'animate-pulse-glow' : ''}`}
      style={{ width: `${pct}%`, minWidth: 64 }}
    >
      <span aria-hidden="true">·</span>
    </button>
  )
}

function UnknownBar({
  pct,
  display,
  glow,
  countingDots,
  total,
  accent,
}: {
  pct: number
  display: string | null
  glow: boolean
  countingDots: number | null
  total: number
  accent: string
}) {
  return (
    <div
      role="img"
      aria-label="le nombre mystère"
      className={`flex h-16 items-center justify-center rounded-bubble border-[3px] border-dashed px-2 ${glow ? 'animate-pulse-glow' : ''}`}
      style={{
        width: `${pct}%`,
        minWidth: 64,
        borderColor: UNKNOWN_BORDER,
        background: UNKNOWN_BG,
      }}
    >
      {countingDots !== null ? (
        <span className="flex flex-wrap items-center justify-center gap-1">
          {Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              className={`block rounded-full ${i < countingDots ? 'animate-pop' : ''}`}
              style={{
                width: 12,
                height: 12,
                background: accent,
                opacity: i < countingDots ? 1 : 0.2,
              }}
            />
          ))}
        </span>
      ) : (
        <span
          className="text-3xl font-extrabold"
          style={{ color: 'var(--color-sun-deep)' }}
        >
          {display ?? '?'}
        </span>
      )}
    </div>
  )
}

// ------------------------------------------------------------
// Le schéma complet
// ------------------------------------------------------------

export function SchemaView(props: SchemaViewProps) {
  const { item } = props
  const type = item.template.type
  if (type === 'parties-tout' || type === 'partie-cachee') return <PartsSchema {...props} />
  if (type === 'transfo-gain' || type === 'transfo-perte') return <TransfoSchema {...props} />
  return <CompareSchema {...props} />
}

/** Rend un emplacement selon son état (inconnu / rempli / cible vide). */
function renderSlot(props: SchemaViewProps, role: SlotRole, pct: number, color: string): ReactNode {
  const { item, placed, unknownDisplay, unknownGlow, countingDots, hintRoles, interactive, onSlotTap, accent } = props
  const slot = item.slots.find((s) => s.role === role)
  if (!slot) return null
  if (slot.value === null) {
    return (
      <UnknownBar
        pct={pct}
        display={unknownDisplay}
        glow={unknownGlow}
        countingDots={countingDots}
        total={item.answer}
        accent={accent}
      />
    )
  }
  const value = placed[role]
  if (value !== undefined) {
    return (
      <FilledBar pct={pct} value={value} emoji={item.template.emoji.object} color={color} label={ROLE_LABELS[role]} />
    )
  }
  return (
    <TargetSlot
      pct={pct}
      glow={hintRoles.includes(role)}
      interactive={interactive}
      onTap={() => onSlotTap(role)}
      label={ROLE_LABELS[role]}
    />
  )
}

/** Valeur réelle d'un emplacement (l'inconnue vaut answer) — pour les largeurs. */
function slotUnits(item: BscItem, role: SlotRole): number {
  const slot = item.slots.find((s) => s.role === role)
  if (!slot) return 0
  return slot.value ?? item.answer
}

// ---------- Parties-tout / partie cachée ----------

function PartsSchema(props: SchemaViewProps) {
  const { item, accent } = props
  const whole = slotUnits(item, 'whole')
  const max = Math.max(1, whole)
  const pct = (n: number): number => (n / max) * 100
  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="w-8 text-center text-xl">🧺</span>
        <div className="flex flex-1">{renderSlot(props, 'whole', pct(whole), accent)}</div>
      </div>
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="w-8 text-center text-xl">🧩</span>
        <div className="flex flex-1 gap-1.5">
          {renderSlot(props, 'part1', pct(slotUnits(item, 'part1')), accent)}
          {renderSlot(props, 'part2', pct(slotUnits(item, 'part2')), ALT_COLOR)}
        </div>
      </div>
    </div>
  )
}

// ---------- Transformation (avant → flèche → après) ----------

function TransfoSchema(props: SchemaViewProps) {
  const { item, placed, hintRoles, interactive, onSlotTap } = props
  const start = slotUnits(item, 'start')
  const end = slotUnits(item, 'end')
  const max = Math.max(1, start, end)
  const pct = (n: number): number => (n / max) * 100
  const sign = item.template.type === 'transfo-gain' ? '+' : '−'
  const changeValue = placed['change']

  return (
    <div className="flex w-full flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="w-12 text-right text-xs font-extrabold text-ink-soft">avant</span>
        <div className="flex flex-1">{renderSlot(props, 'start', pct(start), props.accent)}</div>
      </div>
      <div className="flex items-center justify-center gap-2 py-0.5">
        <span aria-hidden="true" className="text-3xl">⤵️</span>
        <span aria-hidden="true" className="text-3xl font-extrabold text-ink">{sign}</span>
        {changeValue !== undefined ? (
          <span
            role="img"
            aria-label={`${sign === '+' ? 'plus' : 'moins'} ${changeValue}`}
            className="animate-pop flex h-16 w-16 items-center justify-center gap-1 rounded-full text-white shadow-card"
            style={{ background: ALT_COLOR }}
          >
            <span className="text-2xl font-extrabold">{changeValue}</span>
          </span>
        ) : (
          <button
            type="button"
            disabled={!interactive}
            onClick={() => onSlotTap('change')}
            aria-label={`Poser un nombre sur ${ROLE_LABELS['change']}`}
            className={`tap-target flex h-16 w-16 items-center justify-center rounded-full border-[3px] border-dashed border-ink-soft/30 bg-white/70 text-2xl font-extrabold text-ink-soft/50 transition-transform active:scale-95 ${hintRoles.includes('change') ? 'animate-pulse-glow' : ''}`}
          >
            <span aria-hidden="true">·</span>
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="w-12 text-right text-xs font-extrabold text-ink-soft">après</span>
        <div className="flex flex-1">{renderSlot(props, 'end', pct(end), props.accent)}</div>
      </div>
    </div>
  )
}

// ---------- Comparaison (deux barres alignées + écart) ----------

function CompareSchema(props: SchemaViewProps) {
  const { item } = props
  const heroVal = slotUnits(item, 'heroBar')
  const rivalVal = slotUnits(item, 'rivalBar')
  const diffVal = slotUnits(item, 'diff')
  // L'écart se dessine au bout de la barre la plus courte.
  const diffOnHeroRow = heroVal < rivalVal
  const max = Math.max(1, heroVal + (diffOnHeroRow ? diffVal : 0), rivalVal + (diffOnHeroRow ? 0 : diffVal))
  const pct = (n: number): number => (n / max) * 100

  // minWidth 92 = slot interne (64) + flèche ⟷ (~24) + marge : sans ce budget,
  // un petit écart ferait déborder le slot du card en 375 px.
  const diffNode = (
    <div className="flex items-center" style={{ width: `${pct(diffVal)}%`, minWidth: 92 }}>
      <span aria-hidden="true" className="text-xl text-ink-soft">⟷</span>
      <div className="flex flex-1">{renderSlot(props, 'diff', 100, ALT_COLOR)}</div>
    </div>
  )

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="w-8 text-center text-2xl">{item.template.emoji.hero}</span>
        <div className="flex flex-1 items-center gap-1">
          {renderSlot(props, 'heroBar', pct(heroVal), props.accent)}
          {diffOnHeroRow && diffNode}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="w-8 text-center text-2xl">{item.template.emoji.rival ?? '🙂'}</span>
        <div className="flex flex-1 items-center gap-1">
          {renderSlot(props, 'rivalBar', pct(rivalVal), props.accent)}
          {!diffOnHeroRow && diffNode}
        </div>
      </div>
    </div>
  )
}
