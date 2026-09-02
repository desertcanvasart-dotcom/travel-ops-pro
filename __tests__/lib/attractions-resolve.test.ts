import { describe, it, expect } from 'vitest'
import { resolveAttractions, buildAliasMap, matchByName } from '@/lib/pricing/attractions'

const FEES = [
  { id: 'giza', attraction_name: 'Giza plateau', eur_rate: 750, non_eur_rate: 750 },
  { id: 'khufu', attraction_name: 'Khufu ', eur_rate: 1500, non_eur_rate: 1500 },
  { id: 'vok', attraction_name: 'Valley Of Kings', eur_rate: 800, non_eur_rate: 800 },
  { id: 'memnon', attraction_name: 'Colossi of Memnon', eur_rate: 0, non_eur_rate: 0 },
  { id: 'dah1', attraction_name: 'Dahshur', eur_rate: 200, non_eur_rate: 200 },
  { id: 'horus', attraction_name: 'The Temple Of Horus', eur_rate: 550, non_eur_rate: 550 },
  { id: 'tut', attraction_name: 'Tutankhamun Tomb', eur_rate: 700, non_eur_rate: 700 },
  { id: 'red', attraction_name: 'The Red Pyramid', eur_rate: 200, non_eur_rate: 200 },
]

const ALIASES = buildAliasMap([
  { alias: 'スフィンクスと河岸神殿見学', canonical_name: 'Giza plateau' },
  { alias: '3大ピラミッドを見渡せるパノラマポイントでの写真撮影', canonical_name: 'Giza plateau' },
  { alias: 'クフ王のピラミッドに入場(確定）', canonical_name: 'Khufu' },
  { alias: '王家の谷、ツタンカーメン王墓入場', canonical_name: 'Valley of the Kings + Tutankhamun Tomb' },
  { alias: '屈折ピラミッドと赤ピラミッド見学へ', canonical_name: 'Dahshur + The Red Pyramid' },
  { alias: 'ミイラ室込み', canonical_name: 'Egyptian Museum + Mummies Hall' },
  { alias: 'エジプトの数ある遺跡の中でも、最も保存状態のいい遺跡です。', canonical_name: 'The Temple Of Horus' },
])

describe('resolveAttractions', () => {
  it('prices Japanese programme wording through the alias table', () => {
    const r = resolveAttractions(
      [
        { day: 1, attractions: ['スフィンクスと河岸神殿見学', '3大ピラミッドを見渡せるパノラマポイントでの写真撮影', 'クフ王のピラミッドに入場(確定）'] },
        { day: 4, attractions: ['エジプトの数ある遺跡の中でも、最も保存状態のいい遺跡です。'] },
      ],
      FEES, ALIASES, false
    )
    expect(r.tickets.map(t => t.id)).toEqual(['giza', 'khufu', 'horus'])
    expect(r.unresolved).toEqual([])
    // Two wordings for the plateau on one day charge ONE ticket.
    expect(r.tickets.find(t => t.id === 'giza')?.rate).toBe(750)
  })

  it('matches a canonical name whole, ignoring articles, case and punctuation', () => {
    // alias says "Valley of the Kings", fee row is "Valley Of Kings"; neither contains the other
    const r = resolveAttractions([{ day: 3, attractions: ['王家の谷、ツタンカーメン王墓入場'] }], FEES, ALIASES, true)
    expect(r.tickets.map(t => t.id)).toEqual(['vok', 'tut'])
  })

  it('one sentence can carry several tickets, and a missing one is named in the warning', () => {
    const r = resolveAttractions(
      [{ day: 2, attractions: ['屈折ピラミッドと赤ピラミッド見学へ'] }, { day: 3, attractions: ['ミイラ室込み'] }],
      FEES, ALIASES, false
    )
    expect(r.tickets.map(t => t.id)).toEqual(['dah1', 'red'])
    // "Egyptian Museum" is not in this fixture's fee table, Mummies Hall is not either
    expect(r.unresolved).toEqual([
      { day: 3, text: 'ミイラ室込み → Egyptian Museum' },
      { day: 3, text: 'ミイラ室込み → Mummies Hall' },
    ])
  })

  it('ids win, are exact, are charged once per trip, and silence the wording on their day', () => {
    const r = resolveAttractions(
      [
        { day: 1, attraction_ids: ['giza', 'khufu'], attractions: ['Pyramids'] },
        { day: 2, attraction_ids: ['giza'], attractions: ['Giza plateau'] },
      ],
      FEES, new Map(), false
    )
    expect(r.tickets.map(t => t.id)).toEqual(['giza', 'khufu'])
    expect(r.tickets[0].day).toBe(1)
    expect(r.unresolved).toEqual([])
  })

  it('reports an id the fee table no longer has, and wording nobody taught it', () => {
    const r = resolveAttractions(
      [{ day: 2, attraction_ids: ['deleted-row'], attractions: ['バザールの中は迷路の様な細い道が何本も！'] }],
      FEES, ALIASES, false
    )
    expect(r.tickets).toEqual([])
    expect(r.missingIds).toEqual([{ day: 2, id: 'deleted-row' }])
    expect(r.unresolved).toEqual([{ day: 2, text: 'バザールの中は迷路の様な細い道が何本も！' }])
  })

  it('a free site resolves with rate 0 rather than counting as unresolved', () => {
    const r = resolveAttractions([{ day: 5, attractions: ['Colossi of Memnon'] }], FEES, new Map(), false)
    expect(r.tickets).toEqual([{ id: 'memnon', name: 'Colossi of Memnon', rate: 0, day: 5, from: 'Colossi of Memnon' }])
  })

  it('English wording still matches the way it always did', () => {
    expect(matchByName(FEES, 'giza')?.id).toBe('giza')
    expect(matchByName(FEES, 'Valley of Kings')?.id).toBe('vok')
    expect(matchByName(FEES, 'nothing here')).toBeNull()
  })
})
