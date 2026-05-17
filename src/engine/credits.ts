export interface Credit {
  name: string
  role: string
}

export const CREDITS = [{ name: 'Tyler Etters', role: 'Lead' }] as const satisfies readonly Credit[]
