// ============================================================
// Difficulté adaptative — un Tuner par partie.
// 3 réussites consécutives → niveau +1 ('up', plafonné à max).
// 2 échecs consécutifs → niveau -1 ('down', plancher à min).
// Sinon 'same'. Les compteurs repartent à zéro après chaque
// changement (ou tentative de changement aux bornes).
// ============================================================

const WINS_TO_LEVEL_UP = 3
const FAILS_TO_LEVEL_DOWN = 2

export class Tuner {
  private readonly min: number
  private readonly max: number
  private readonly start: number
  private current: number
  private wins = 0
  private fails = 0

  constructor(opts: { min: number; max: number; start?: number }) {
    this.min = opts.min
    this.max = opts.max
    this.start = opts.start ?? opts.min
    this.current = this.start
  }

  get level(): number {
    return this.current
  }

  onResult(ok: boolean): 'up' | 'down' | 'same' {
    if (ok) {
      this.fails = 0
      this.wins += 1
      if (this.wins >= WINS_TO_LEVEL_UP) {
        this.wins = 0
        if (this.current < this.max) {
          this.current += 1
          return 'up'
        }
      }
      return 'same'
    }

    this.wins = 0
    this.fails += 1
    if (this.fails >= FAILS_TO_LEVEL_DOWN) {
      this.fails = 0
      if (this.current > this.min) {
        this.current -= 1
        return 'down'
      }
    }
    return 'same'
  }

  reset(): void {
    this.current = this.start
    this.wins = 0
    this.fails = 0
  }
}
