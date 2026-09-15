import { useMemo } from 'react'
import { AssetBoundary } from '@/arcade/AssetBoundary'
import { KidCamera } from '@/arcade/KidCamera'
import { RenderProbe } from '@/arcade/RenderProbe'
import { ACTS, SERVICES } from '../logic'
import { useFtg } from '../store'
import { ASSETS, CLIENT_KINDS, type ClientKind } from '../assets'
import { Backdrop } from './Backdrop'
import { Client } from './Client'
import { FoodItem3D } from './FoodItem3D'
import { GlbProp } from './GlbProp'
import { Glouton3D } from './Glouton3D'
import { GloupGlb } from './GloupGlb'
import { Instanced } from './Instanced'
import { mat, PALETTE } from './materials'
import { OrderBubble } from './OrderBubble'
import { Truck3D } from './Truck3D'

const BACKDROP_BEACH = ASSETS.backdropBeach

const ACT_GROUND: Record<number, string> = {
  1: '#f2dfbd',
  2: '#f3d9c4',
  3: '#d8e6ea',
  4: '#e9d7f2',
  5: '#c9bfd9',
}
const CLIENT_COLORS = [PALETTE.grape, PALETTE.lagoon, PALETTE.coral, PALETTE.sun, PALETTE.leaf] as const
const PARASOL_POLES = [-6.5, 6.5].map((x) => ({ position: [x, 1.4, -1] as const }))
const PARASOL_TOPS = [-6.5, 6.5].map((x) => ({ position: [x, 2.7, -1] as const }))
/** Dessus du comptoir de service au premier plan (les plats y sont posés). */
const TABLE_TOP = 0.62
/** Les GLB Tripo sont normalisés (~1 unité) et centrés : échelle = taille monde, y = −min.y × échelle. */
const PALM_SCALE = 6.5
const PALM_LIFT = 0.5 * PALM_SCALE
const TRUCK_SCALE = 6.2
/** Orientation du truck (Tripo aligne le modèle sur la vue de référence, en 3/4) — ajusté à l'œil. */
const TRUCK_YAW = -Math.PI / 2

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
  const clientKind: ClientKind | null = CLIENT_KINDS.length > 0 ? CLIENT_KINDS[index % CLIENT_KINDS.length] : null
  const boss = SERVICES[service]?.boss === true

  // Positions des plats : posés sur le comptoir de service au premier plan (y = dessus de la table).
  const homes = useMemo(() => {
    const n = order?.items.length ?? 0
    const cols = Math.min(n, 7)
    const rows = Math.ceil(n / cols)
    return Array.from({ length: n }, (_, i): [number, number, number] => {
      const row = Math.floor(i / cols)
      const inRow = row === rows - 1 ? n - row * cols : cols
      const col = i - row * cols
      const x = (col - (inRow - 1) / 2) * 1.0 - 0.3
      return [x, TABLE_TOP, 1.35 + row * 1.0]
    })
  }, [order?.items.length])

  /** plats servis : posés sur le comptoir du truck (GLB), en deux rangées */
  const trayPos = (k: number): [number, number, number] => [-0.9 + (k % 5) * 0.6, 1.02, -0.15 - Math.floor(k / 5) * 0.55]
  const typedItems = order?.input === 'numpad' ? decompose(Number(typed || '0')) : []

  return (
    <>
      {/* caméra basse et proche, à hauteur d'enfant, comme sur le key art */}
      <KidCamera position={[0.4, 4.6, 10.4]} target={[0.3, 1.15, -0.8]} fov={38} fitWidth={9.6} portraitLift={1.2} shortLift={0.5} enableRotate={false} />
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

      {/* décor : panorama IA derrière la scène, sol de la couleur du sable du panorama */}
      {act === 1 && (
        <AssetBoundary fallback={null}>
          <Backdrop url={BACKDROP_BEACH} />
        </AssetBoundary>
      )}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, -4]} material={mat(ACT_GROUND[act], { roughness: 0.95 })} receiveShadow>
        <planeGeometry args={[70, 36]} />
      </mesh>
      {actSpec.id === 1 && (
        <>
          <Instanced items={PARASOL_POLES} material={mat(PALETTE.woodDark)}>
            <cylinderGeometry args={[0.04, 0.04, 2.8, 8]} />
          </Instanced>
          <Instanced items={PARASOL_TOPS} material={mat(PALETTE.coral)}>
            <coneGeometry args={[1.5, 0.7, 10]} />
          </Instanced>
          {/* palmiers (GLB Tripo) de part et d'autre du truck */}
          <AssetBoundary fallback={null}>
            <GlbProp url={ASSETS.palm} name="palm-left" position={[-6.2, PALM_LIFT, -4.5]} scale={PALM_SCALE} rotation={[0, 0.4, 0]} />
            <GlbProp url={ASSETS.palm} position={[6.4, PALM_LIFT * 1.15, -5.5]} scale={PALM_SCALE * 1.15} rotation={[0, -1.1, 0]} />
          </AssetBoundary>
        </>
      )}

      {/* le truck : GLB Tripo (3 vues GPT Image 2.5), repli procédural pendant le chargement */}
      <AssetBoundary fallback={<Truck3D />}>
        <GlbProp url={ASSETS.truck} name="truck" position={[0.4, TRUCK_SCALE * 0.34, -3.0]} scale={TRUCK_SCALE} rotation={[0, TRUCK_YAW, 0]} />
      </AssetBoundary>

      {/* Gloup, chef, juste derrière le comptoir (GLB Tripo, repli procédural pendant le chargement) */}
      <AssetBoundary fallback={<Glouton3D clip={mood === 'oops' ? 'idle' : mood} position={[0.5, 0, -1.0]} scale={1.6} chef rotationY={0.15} />}>
        <GloupGlb clip={mood === 'oops' ? 'idle' : mood} position={[0.5, 1.0, -1.3]} scale={1.9} rotationY={0.15} />
      </AssetBoundary>

      {/* client(s) devant le comptoir, tournés vers Gloup (3/4 face caméra) : GLB Tripo, repli procédural */}
      {twins ? (
        [-1.1, 1.1].map((x) => (
          <Client key={x} kind={clientKind} color={clientColor} clip={mood} position={[x * 0.9 + 3.9, 0, 1.2 - x * 0.6]} scale={1.6} sunglasses={act === 1} rotationY={-0.85 + x * 0.2} />
        ))
      ) : (
        <Client kind={boss ? null : clientKind} color={boss ? PALETTE.leaf : clientColor} clip={mood} position={[3.9, 0, 1.2]} scale={boss ? 2.3 : 1.9} sunglasses={act === 1} rotationY={-0.85} />
      )}
      {order && <OrderBubble order={order} position={[3.9, twins ? 2.4 : 2.9, 1.2]} />}

      {/* comptoir de service au premier plan : les plats à choisir sont posés dessus */}
      <group position={[-0.3, 0, 1.6]}>
        <mesh position={[0, TABLE_TOP - 0.06, 0]} material={mat(PALETTE.wood)} castShadow receiveShadow>
          <boxGeometry args={[7.0, 0.12, 2.3]} />
        </mesh>
        <mesh position={[0, (TABLE_TOP - 0.12) / 2, 0]} material={mat(PALETTE.woodDark)} receiveShadow>
          <boxGeometry args={[6.6, TABLE_TOP - 0.12, 2.0]} />
        </mesh>
      </group>

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
