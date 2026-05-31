// RP-22 — Chronicle template registry.
//
// CHRONICLE_TEMPLATES is the single source of truth for the past-tense
// sentences chronicle events render through. The registry MUST maintain
// ≥50% negative-tone entries across the whole file — negative templates
// are the language of entropy; the prairie names what failed to happen.
// A unit test asserts the ratio. Templates are short, past-tense,
// slot-bound, and contain no metaphorical adjective prose. The word
// `invasive` is banned across the whole repo and templates are in
// scope.
//
// Each template's text function takes its slot values and returns a
// single sentence ≤12 words.

import { ChronicleTemplateCategory, ChronicleTemplateTone } from '../types'

import type { ChronicleTemplate } from '../types'

const capitalize = (s: string): string => (s.length === 0 ? s : s[0].toUpperCase() + s.slice(1))

export const CHRONICLE_TEMPLATES = {
  // --- season-rollover ---
  'season-came': {
    id: 'season-came',
    category: ChronicleTemplateCategory.SeasonRollover,
    tone: ChronicleTemplateTone.Positive,
    slots: ['season', 'region'] as const,
    text: (s: Record<string, string>) => `${capitalize(s.season)} came to ${s.region}.`,
  },
  'season-came-late': {
    id: 'season-came-late',
    category: ChronicleTemplateCategory.SeasonRollover,
    tone: ChronicleTemplateTone.Negative,
    slots: ['season', 'region'] as const,
    text: (s: Record<string, string>) => `${capitalize(s.season)} came late to ${s.region}.`,
  },
  'season-failed': {
    id: 'season-failed',
    category: ChronicleTemplateCategory.SeasonRollover,
    tone: ChronicleTemplateTone.Negative,
    slots: ['season', 'region', 'year'] as const,
    text: (s: Record<string, string>) => `${s.region} did not see ${s.season} that year.`,
  },

  // --- species-extinction ---
  'species-did-not-return': {
    id: 'species-did-not-return',
    category: ChronicleTemplateCategory.SpeciesExtinction,
    tone: ChronicleTemplateTone.Negative,
    slots: ['species', 'region'] as const,
    text: (s: Record<string, string>) => `The ${s.species} did not return to ${s.region}.`,
  },
  'species-left': {
    id: 'species-left',
    category: ChronicleTemplateCategory.SpeciesExtinction,
    tone: ChronicleTemplateTone.Negative,
    slots: ['species', 'region', 'season'] as const,
    text: (s: Record<string, string>) => `${capitalize(s.species)} left ${s.region} that ${s.season}.`,
  },

  // --- egregore-reach ---
  'egregore-came': {
    id: 'egregore-came',
    category: ChronicleTemplateCategory.EgregoreReach,
    tone: ChronicleTemplateTone.Negative,
    slots: ['region'] as const,
    text: (s: Record<string, string>) => `The script came to ${s.region} that year.`,
  },
  'egregore-grew-unreadable': {
    id: 'egregore-grew-unreadable',
    category: ChronicleTemplateCategory.EgregoreReach,
    tone: ChronicleTemplateTone.Negative,
    slots: ['region', 'season'] as const,
    text: (s: Record<string, string>) => `${s.region} grew unreadable that ${s.season}.`,
  },

  // --- egregore-advance ---
  'egregore-took-hold': {
    id: 'egregore-took-hold',
    category: ChronicleTemplateCategory.EgregoreAdvance,
    tone: ChronicleTemplateTone.Negative,
    slots: ['region'] as const,
    text: (s: Record<string, string>) => `The script took hold of ${s.region}.`,
  },
  'egregore-kept-thread': {
    id: 'egregore-kept-thread',
    category: ChronicleTemplateCategory.EgregoreAdvance,
    tone: ChronicleTemplateTone.Positive,
    slots: ['region'] as const,
    text: (s: Record<string, string>) => `${s.region} kept its egregoric thread.`,
  },

  // --- meteorite-impact ---
  'meteorite-landed': {
    id: 'meteorite-landed',
    category: ChronicleTemplateCategory.MeteoriteImpact,
    tone: ChronicleTemplateTone.Positive,
    slots: ['region'] as const,
    text: (s: Record<string, string>) => `A stranger landed in ${s.region}.`,
  },
  'meteorite-burned': {
    id: 'meteorite-burned',
    category: ChronicleTemplateCategory.MeteoriteImpact,
    tone: ChronicleTemplateTone.Negative,
    slots: ['region'] as const,
    text: (s: Record<string, string>) => `Nothing grew where the stranger fell on ${s.region}.`,
  },

  // --- stone-circle ---
  'circle-held': {
    id: 'circle-held',
    category: ChronicleTemplateCategory.StoneCircle,
    tone: ChronicleTemplateTone.Positive,
    slots: ['region'] as const,
    text: (s: Record<string, string>) => `${s.region} held a stone circle that year.`,
  },
  'circle-quieted': {
    id: 'circle-quieted',
    category: ChronicleTemplateCategory.StoneCircle,
    tone: ChronicleTemplateTone.Negative,
    slots: ['region'] as const,
    text: (s: Record<string, string>) => `Stones quieted ${s.region} that year.`,
  },

  // --- hallowed-ground ---
  'ground-hallowed': {
    id: 'ground-hallowed',
    category: ChronicleTemplateCategory.HallowedGround,
    tone: ChronicleTemplateTone.Positive,
    slots: ['region', 'season'] as const,
    text: (s: Record<string, string>) => `${s.region} turned hallowed that ${s.season}.`,
  },
  'ground-went-quiet': {
    id: 'ground-went-quiet',
    category: ChronicleTemplateCategory.HallowedGround,
    tone: ChronicleTemplateTone.Negative,
    slots: ['region', 'season'] as const,
    text: (s: Record<string, string>) => `${s.region} went quiet that ${s.season}.`,
  },
} as const satisfies Record<string, ChronicleTemplate>

export type ChronicleTemplateId = keyof typeof CHRONICLE_TEMPLATES

// Helper for emitters — given a category and preferred tone, pick the
// first matching template. Falls back to any template in the category
// if the tone pool is empty (per the spec's `negative-template-pool-
// exhausted` invariant).
export const pickTemplate = (
  category: ChronicleTemplate['category'],
  preferredTone: ChronicleTemplate['tone']
): ChronicleTemplate => {
  const inCategory = Object.values(CHRONICLE_TEMPLATES).filter(t => t.category === category)
  const toneMatch = inCategory.find(t => t.tone === preferredTone)
  if (toneMatch) return toneMatch
  if (inCategory.length === 0) {
    throw new Error(`pickTemplate: no templates in category "${category}"`)
  }
  return inCategory[0]
}
