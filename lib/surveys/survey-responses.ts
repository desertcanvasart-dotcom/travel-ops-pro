// ============================================
// Guest survey answers — one row per guest
// ============================================
// One survey link serves the whole party (the printed sheet's QR, the emailed
// link). Every submit used to REPLACE guest_surveys.responses, so the second
// guest's answers erased the first's. Each submit is now its own row in
// guest_survey_responses (migrations/20261216_surveys_and_voucher_numbers.sql),
// and the staff results page lists every one.

import type { SurveyResponses, RatingValue } from './guest-survey'

/** More answers than any party: past this a link is being abused. */
export const MAX_RESPONSES_PER_SURVEY = 50

/** The staff list, a page at a time. */
export const SURVEY_PAGE_SIZE = 50

export interface StoredSurveyResponse {
  id: string
  survey_id: string
  respondent_name: string | null
  answers: Partial<SurveyResponses>
  submitted_at: string
}

/** The row one submit inserts. org_id is the survey's (a trigger enforces it). */
export function responseRow(survey: { id: string; org_id: string }, answers: SurveyResponses, now: string) {
  return {
    survey_id: survey.id,
    org_id: survey.org_id,
    respondent_name: answers.guest_name ?? null,
    answers,
    submitted_at: now,
  }
}

/** The 1-based page asked for (?page=), never below 1. */
export function surveyPageParam(value: string | null): number {
  const n = Number.parseInt(value ?? '', 10)
  return Number.isFinite(n) && n >= 1 ? n : 1
}

/** Each survey with its responses, oldest answer first. */
export function attachResponses<S extends { id: string }>(
  surveys: S[],
  responses: StoredSurveyResponse[]
): Array<S & { responses: StoredSurveyResponse[] }> {
  const bySurvey = new Map<string, StoredSurveyResponse[]>()
  for (const r of [...responses].sort((a, b) => a.submitted_at.localeCompare(b.submitted_at))) {
    const list = bySurvey.get(r.survey_id) ?? []
    list.push(r)
    bySurvey.set(r.survey_id, list)
  }
  return surveys.map(s => ({ ...s, responses: bySurvey.get(s.id) ?? [] }))
}

/**
 * The overall-satisfaction figure for a survey's row: the mean of the 1–5
 * answers (該当なし / unanswered left out), to one decimal, and how many
 * answers it is the mean of. Null when nobody rated it.
 */
export function overallSummary(responses: Array<{ answers?: { ratings?: Record<string, RatingValue | undefined> } | null }>): { mean: number; count: number } | null {
  const scores = responses
    .map(r => r.answers?.ratings?.overall_satisfaction)
    .filter((v): v is Exclude<RatingValue, 'na'> => typeof v === 'number')
  if (scores.length === 0) return null
  const mean = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
  return { mean, count: scores.length }
}
