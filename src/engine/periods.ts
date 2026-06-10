// ============================================================
// Calendrier scolaire français — périodes P1..P5. PURE.
// Mapping par mois (zones confondues, approximation stable) :
//   septembre-octobre → P1, novembre-décembre → P2,
//   janvier-février → P3, mars-avril → P4, mai à août → P5
// (l'été est rattaché à la P5 : on consolide la fin d'année).
// ============================================================

export type Period = 1 | 2 | 3 | 4 | 5

/** Période par mois (index getMonth(), 0 = janvier). */
const PERIOD_BY_MONTH: readonly Period[] = [
  3, // janvier
  3, // février
  4, // mars
  4, // avril
  5, // mai
  5, // juin
  5, // juillet
  5, // août
  1, // septembre
  1, // octobre
  2, // novembre
  2, // décembre
]

/** Période scolaire de la date donnée (sans argument : la date du jour). */
export function currentPeriod(d?: Date): Period {
  return PERIOD_BY_MONTH[(d ?? new Date()).getMonth()]
}

/** Libellés affichables côté parent. */
export const PERIOD_LABELS: Record<Period, string> = {
  1: 'Période 1 · septembre-octobre',
  2: 'Période 2 · novembre-décembre',
  3: 'Période 3 · janvier-février',
  4: 'Période 4 · mars-avril',
  5: 'Période 5 · mai-juin',
}
