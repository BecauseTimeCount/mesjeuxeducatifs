import { Suspense, useMemo } from 'react'
import { KidCamera } from '@/arcade/KidCamera'
import { RenderProbe } from '@/arcade/RenderProbe'
import { ACTS, SERVICES } from '../logic'
import { useFtg } from '../store'
import { FoodItem3D } from './FoodItem3D'
import { Glouton3D } from './Glouton3D'
import { GloupGlb } from './GloupGlb'
import { Instanced } from './Instanced'
import { mat, PALETTE } from './materials'
import { Truck3D } from './Truck3D'

const ACT_GROUND: Record<number, string> = {
  1: PALETTE.sand,
  2: '#f3d9c4',
  3: '#d8e6ea',
  4: '#e9d7f2',
  5: '#c9bfd9',
}
const CLIENT_COLORS = [PALETTE.grape, PALETTE.lagoon, PALETTE.coral, PALETTE.sun, PALETTE.leaf] as const
const PARASOL_POLES = [-6.5, 6.5].map((x) => ({ position: [x, 1.4, -1] as const }))
const PARASOL_TOPS = [-6.5, 6.5].map((x) => ({ position: [x, 2.7, -1] as const }))

/** Décomposition d'un nombre tapé en caisses de 100 / 10 / brochettes (mode pavé). */
function decompose(n: number): Array<{ kind: 'caisse100' | 'caisse10' | 'brochette'; value: number }> {
  const out: Array<{ kind: 'caisse100' | 'caisse10' | 'brochette'; value: number }> = []
  const capped = Math.min(n, 999)
  for (let i = 0; i < Math.floor(capped / 100); i++) out.push({ kind: 'caisse100', value: 100 })
  for (let i = 0; i < Math.floor((capped % 100) / 10); i++) out.push({ kind: 'caisse10', value: 10 })
  if (capped % 10 > 0) out.push({ kind: 'brochette', value: capped % 10 })
  return out
}

/**
 * Scène de service : truck au fond, Gloup (chef) derrière le comptoir, le client devant,
 * les plats tapables en arc au premier plan, le plateau sur le comptoir.
 */
export function TruckScene() {
  const order = useFtg((s) => s.order)
  const selected = useFtg((s) => s.selected)
  const typed = useFtg((s) => s.typed)
  const phase = useFtg((s) => s.phase)
  const mood = useFtg((s) => s.mood)
  const hint = useFtg((s) => s.hint)
  const service = useFtg((s) => s.service)
  const index = useFtg((s) => s.index)
  const tapItem = useFtg((s) => s.tapItem)

  const act = SERVICES[service]?.act ?? 1
  const actSpec = ACTS[act - 1]
  const twins = order?.factor === 2
  const clientColor = CLIENT_COLORS[index % CLIENT_COLORS.length]
  const boss = SERVICES[service]?.boss === true

  // Positions des plats : arc au premier plan, largeur ≤ 8 unités (fitWidth de la caméra).
  const homes = useMemo(() => {
    const n = order?.items.length ?? 0
    const cols = Math.min(n, 7)
    const rows = Math.ceil(n / cols)
    return Array.from({ length: n }, (_, i): [number, number, number] => {
      const row = Math.floor(i / cols)
      const inRow = row === rows - 1 ? n - row * cols : cols
      const col = i - row * cols
      const x = (col - (inRow - 1) / 2) * 1.15
      return [x, 0, 1.6 + row * 1.15]
    })
  }, [order?.items.length])

  const trayPos = (k: number): [number, number, number] => [-0.6 + (k % 5) * 0.55, 1.05, -1.45 - Math.floor(k / 5) * 0.5]
  const typedItems = order?.input === 'numpad' ? decompose(Number(typed || '0')) : []

  return (
    <>
      <KidCamera position={[0, 7.5, 13]} target={[0, 0.9, -0.6]} fov={36} fitWidth={10} portraitLift={1.2} shortLift={0.6} enableRotate={false} />
      <hemisphereLight args={['#ffffff', ACT_GROUND[act], 1.5]} />
      <directionalLight
        position={[-6, 9, 6]}
        color="#fff4dc"
        intensity={2.1}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-9}
        shadow-camera-right={9}
        shadow-camera-top={9}
        shadow-camera-bottom={-9}
        shadow-camera-near={1}
        shadow-camera-far={30}
      />
      <RenderProbe />

      {/* sol : couleur de l'acte, fondu vers le papier au loin */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} material={mat(ACT_GROUND[act], { roughness: 0.95 })} receiveShadow>
        <circleGeometry args={[60, 48]} />
      </mesh>
      {actSpec.id === 1 && (
        <>
          <Instanced items={PARASOL_POLES} material={mat(PALETTE.woodDark)}>
            <cylinderGeometry args={[0.04, 0.04, 2.8, 8]} />
          </Instanced>
          <Instanced items={PARASOL_TOPS} material={mat(PALETTE.coral)} castShadow>
            <coneGeometry args={[1.5, 0.7, 10]} />
          </Instanced>
        </>
      )}

      <Truck3D />

      {/* Gloup, chef, juste derrière le comptoir (GLB Tripo, repli procédural pendant le chargement) */}
      <Suspense fallback={<Glouton3D clip={mood === 'oops' ? 'idle' : mood} position={[-1.2, 0, -1.75]} scale={1.6} chef rotationY={0.2} />}>
        <GloupGlb clip={mood === 'oops' ? 'idle' : mood} position={[-1.2, 0.6, -1.75]} scale={2.1} rotationY={0.2} />
      </Suspense>

      {/* client(s) devant le comptoir */}
      {twins ? (
        [-1.1, 1.1].map((x) => (
          <Glouton3D key={x} color={clientColor} clip={mood} position={[x + 1.6, 0, -0.1]} scale={1.25} sunglasses={act === 1} rotationY={Math.PI + x * 0.3} />
        ))
      ) : (
        <Glouton3D color={boss ? PALETTE.leaf : clientColor} clip={mood} position={[2.1, 0, -0.1]} scale={boss ? 1.9 : 1.4} sunglasses={act === 1} rotationY={Math.PI + 0.35} />
      )}

      {/* plateau sur le comptoir */}
      <mesh position={[0.1, 0.98, -1.4]} material={mat(PALETTE.lagoon)} receiveShadow>
        <boxGeometry args={[3.2, 0.08, 1.1]} />
      </mesh>

      {/* plats tapables (mode tap) */}
      {order?.input === 'tap' &&
        order.items.map((item, i) => {
          const sel = selected.includes(item.id)
          const k = selected.indexOf(item.id)
          return (
            <FoodItem3D
              key={`${index}-${item.id}`}
              item={item}
              home={homes[i]}
              tray={trayPos(k < 0 ? 0 : k)}
              selected={sel}
              glow={hint && order.solutionIds.includes(item.id) && !sel}
              disabled={phase !== 'idle'}
              onTap={tapItem}
            />
          )
        })}

      {/* matérialisation du nombre tapé (mode pavé) */}
      {typedItems.map((it, k) => (
        <FoodItem3D
          key={`typed-${k}-${it.kind}-${it.value}`}
          item={{ id: k, value: it.value, kind: it.kind }}
          home={trayPos(k)}
          tray={trayPos(k)}
          selected
          glow={false}
          disabled
          onTap={() => undefined}
        />
      ))}
    </>
  )
}
