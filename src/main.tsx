import { StrictMode } from 'react'
import App from '@/App'
import { createRoot } from 'react-dom/client'

import '@/styles/index.css'

// Warm the italic Libre Baskerville face so the canvas zone-transition
// label (src/engine/render/passes/zoneTransitionOverlay.ts) doesn't fall
// back to Times on first paint. ctx.font does not auto-trigger
// @font-face loads — the font must already be in the document's font set.
if (typeof document !== 'undefined' && 'fonts' in document) {
  void document.fonts.load('italic 32px "Libre Baskerville"')
}

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
