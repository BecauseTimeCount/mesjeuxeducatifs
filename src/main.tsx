import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import '@fontsource/nunito/400.css'
import '@fontsource/nunito/700.css'
import '@fontsource/nunito/800.css'
import './index.css'
import App from './App'

// PWA en autoUpdate : quand une nouvelle version est détectée, le service
// worker se met à jour et l'app se recharge seule (profil IndexedDB intact).
// On force une vérification quand l'app revient au premier plan (tablette :
// l'enfant rouvre l'app), au retour du réseau, et toutes les heures — sinon la
// détection n'a lieu qu'au lancement à froid et les nouveaux jeux n'arrivent pas.
registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return
    const checkForUpdate = (): void => void registration.update()
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') checkForUpdate()
    })
    window.addEventListener('online', checkForUpdate)
    setInterval(checkForUpdate, 60 * 60 * 1000)
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
