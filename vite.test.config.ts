import { mergeConfig } from 'vite'
import base from './vite.config'

// Serveur de dev pour les tests e2e arcade : sans HMR ni watch, pour qu'une édition
// de fichier ne recharge pas la page testée (scripts/arcade/e2e.mjs).
export default mergeConfig(base, { server: { hmr: false, watch: null } })
