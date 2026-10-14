// The Clients list, asked of the server: which filters, which order, which page.
//
// The page used to read the client_summary view from the browser with
// .limit(200) — past 200 clients the rest were unreachable and the footer
// still said "Showing 200 clients". The filters, the sort, the page and the
// exact count are decided here now, on the active company's rows.
import { sanitizeSearchTerm } from '@/lib/db/sanitize-search'
import { isClientStatus, type ClientStatus } from './status'

export const CLIENT_LIST_MAX = 200
export const CLIENT_LIST_DEFAULT = 50

export type ClientSort = 'recent' | 'oldest' | 'name' | 'name_desc' | 'revenue' | 'revenue_asc' | 'bookings'

/** column + direction, in order; the last is the tiebreak that keeps pages stable. */
export const CLIENT_SORTS: Record<ClientSort, Array<[column: string, ascending: boolean]>> = {
  recent: [['created_at', false], ['id', true]],
  oldest: [['created_at', true], ['id', true]],
  name: [['first_name', true], ['last_name', true], ['id', true]],
  name_desc: [['first_name', false], ['last_name', false], ['id', true]],
  // The stored figure is each client's largest billed amount in any one
  // currency (clients.total_revenue_generated), so this orders by that.
  revenue: [['total_revenue_generated', false], ['id', true]],
  revenue_asc: [['total_revenue_generated', true], ['id', true]],
  bookings: [['total_bookings_count', false], ['id', true]],
}

export interface ClientListParams {
  page: number
  limit: number
  search: string
  status: ClientStatus | null
  clientType: string | null
  leadSource: string | null
  vipOnly: boolean
  dateFrom: string | null
  dateTo: string | null
  sort: ClientSort
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const wordOrNull = (v: string | null): string | null => {
  const s = (v ?? '').trim()
  return s && s !== 'all' && /^[A-Za-z0-9_ -]{1,50}$/.test(s) ? s : null
}

/** The query string of GET /api/clients, clamped and validated. */
export function parseClientListParams(sp: URLSearchParams): ClientListParams {
  const asked = parseInt(sp.get('limit') || '', 10)
  const limit = Number.isFinite(asked) ? Math.min(Math.max(asked, 1), CLIENT_LIST_MAX) : CLIENT_LIST_DEFAULT
  const askedPage = parseInt(sp.get('page') || '', 10)
  const page = Number.isFinite(askedPage) ? Math.max(askedPage, 1) : 1
  const status = sp.get('status')
  const sort = sp.get('sort') as ClientSort | null
  const from = sp.get('date_from')
  const to = sp.get('date_to')
  return {
    page,
    limit,
    search: sanitizeSearchTerm(sp.get('search')),
    status: isClientStatus(status) ? status : null,
    clientType: wordOrNull(sp.get('client_type')),
    leadSource: wordOrNull(sp.get('lead_source')),
    vipOnly: sp.get('vip') === '1' || sp.get('vip') === 'true',
    dateFrom: from && ISO_DATE.test(from) ? from : null,
    dateTo: to && ISO_DATE.test(to) ? to : null,
    // Names first, as the endpoint always listed them, unless asked otherwise.
    sort: sort && sort in CLIENT_SORTS ? sort : 'name',
  }
}

/** The PostgREST .or() text for a search box (already sanitised). */
export function clientSearchFilter(search: string): string {
  const like = `%${search}%`
  const parts = [
    `first_name.ilike.${like}`,
    `last_name.ilike.${like}`,
    `email.ilike.${like}`,
    `phone.ilike.${like}`,
    `client_code.ilike.${like}`,
  ]
  // "Ana Silva": neither name column holds the whole phrase, so the first word
  // is matched against the first name and the rest against the last.
  const [head, ...rest] = search.split(' ')
  if (head && rest.length > 0) {
    parts.push(`and(first_name.ilike.%${head}%,last_name.ilike.%${rest.join(' ')}%)`)
  }
  return parts.join(',')
}

// The slice of the supabase-js filter builder this needs. The filters are
// chained as written, so typing every builder generic would say nothing.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Builder = any

/** Filters (not paging, not order) of the list, on a query already scoped to a company. */
export function applyClientFilters(query: Builder, p: ClientListParams): Builder {
  let q = query
  if (p.search) q = q.or(clientSearchFilter(p.search))
  if (p.status) q = q.eq('status', p.status)
  if (p.clientType) q = q.eq('client_type', p.clientType)
  if (p.leadSource) q = q.eq('lead_source', p.leadSource)
  if (p.vipOnly) q = q.eq('vip_status', true)
  if (p.dateFrom) q = q.gte('created_at', p.dateFrom)
  if (p.dateTo) q = q.lte('created_at', `${p.dateTo}T23:59:59`)
  return q
}

export function applyClientSort(query: Builder, sort: ClientSort): Builder {
  let q = query
  for (const [column, ascending] of CLIENT_SORTS[sort]) q = q.order(column, { ascending })
  return q
}
