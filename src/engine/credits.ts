export interface Credit {
  name: string
  role: string
}

export const CREDITS = [
  { name: 'Tyler Etters', role: 'Lead' },
  { name: 'Pablo Impallari & Rodrigo Fuenzalida', role: 'Libre Baskerville Typeface' },
  { name: 'kreativekorp', role: 'Voynich Unicode Typeface' },
] as const satisfies readonly Credit[]
