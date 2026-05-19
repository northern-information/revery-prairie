import { EGREGORE_GLYPHS } from '@/engine/egregore'
import { ManualCategory } from '@/engine/manual'

// Tab labels for the manual category strip. Moved out of ManualPanel.tsx
// so the component file only exports React components (keeps Fast Refresh
// happy) and so tests can assert on these labels without rendering the
// component.
export const CATEGORY_LABELS: Record<ManualCategory, string> = {
  [ManualCategory.Life]: 'LIFE',
  [ManualCategory.Celestial]: 'CELESTIAL',
  [ManualCategory.Object]: 'OBJECTS',
  [ManualCategory.Person]: 'PEOPLE',
  [ManualCategory.Zone]: 'ZONES',
  [ManualCategory.Recipe]: 'RECIPES',
  [ManualCategory.Control]: 'CONTROLS',
  // Egregoric category — no English label. Renders as the first four
  // glyphs from EGREGORE_GLYPHS so the tab label and the tile glyph
  // allowlist cannot drift. The tab label deliberately resists naming;
  // per v3 doctrine the player-facing term for the egregores is none.
  [ManualCategory.Egregore]: EGREGORE_GLYPHS.slice(0, 4).join(''),
}
