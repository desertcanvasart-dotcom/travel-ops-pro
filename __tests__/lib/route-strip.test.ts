import { describe, it, expect } from 'vitest'
import { routeStripFromDays, renderRouteStrip } from '@/lib/maps/route-strip'
import { tripTransport } from '@/lib/maps/trip-transport'

// KEK802-ABS as the office wrote it (2026-11-02 sample): the strip reads the
// order of cities, the transport between them and the nights.
const KEK802 = [
  { day: 1, description: '20:45 関西国際空港 第1ターミナル\n23:45 関西空港発 エミレーツ航空 EK317便にて空路ドバイへ', overnight_city: null, overnight_kind: 'flight' },
  { day: 2, description: '04:35 ドバイ到着後、ご自身でお乗り継ぎ\n08:15 ドバイ発 EK927便にて空路カイロへ\n11:05 カイロ到着', overnight_city: 'Cairo' },
  { day: 3, description: '08:30 カイロ発、国内線 MS147便にて空路アスワンへ\n■ アスワン観光\n◎ ファルーカ（帆掛け船）セーリング体験\nアブ・シンベルへ（約3時間）。到着後、ホテルにチェックイン', overnight_city: 'Abu Simbel' },
  { day: 4, description: 'アブ・シンベル神殿観光\nその後、再び車でアスワンへ戻ります（約3時間）。\nアスワン駅から列車にてルクソールへ（約3～4時間）', overnight_city: 'Luxor' },
  { day: 5, description: 'ルクソール西岸観光\n21:30 ルクソール発、国内線 MS69便にて空路カイロへ', overnight_city: 'Cairo' },
  { day: 6, description: 'ダハシュール、サッカラ、メンフィス', overnight_city: 'Cairo' },
  { day: 7, description: '20:05 カイロ発、エミレーツ航空 EK924便にて空路ドバイへ', overnight_city: null, overnight_kind: 'flight' },
  { day: 8, description: '03:00 ドバイ発 エミレーツ航空 EK316便にて空路帰国の途へ\n17:15 関西空港到着', overnight_city: null },
]

describe('route strip', () => {
  const strip = routeStripFromDays(KEK802)!

  it('lists the stops in order, home airport at both ends, with nights', () => {
    expect(strip.stops.map(s => `${s.label}:${s.day}:${s.nights}`)).toEqual([
      '関西:1:0', 'カイロ:2:1', 'アスワン:3:0', 'アブ・シンベル:3:1', 'アスワン:4:0', 'ルクソール:4:1', 'カイロ:5:2', '関西:8:0',
    ])
  })

  it('reads how each leg is travelled from its own line — and never guesses', () => {
    expect(strip.legs.map(l => [l.mode, l.carrier, l.duration])).toEqual([
      ['plane', 'EK', null],
      ['plane', 'MS', null],
      // 「アブ・シンベルへ（約3時間）」 does not say how: an arrow with the time.
      // The 帆掛け船 two lines above is sightseeing, not the leg.
      [null, null, '約3時間'],
      ['car', null, '約3時間'],
      ['train', null, '約3～4時間'],
      ['plane', 'MS', null],
      ['plane', 'EK', null],
    ])
  })

  it('a trip day\'s own services fill a leg the text leaves open; cruise days are by ship', () => {
    const s = routeStripFromDays([
      { day: 1, description: 'Arrive Cairo', overnight_city: 'Cairo' },
      { day: 2, description: 'To Aswan', overnight_city: 'Aswan', transport: tripTransport([{ service_type: 'flight' }, { service_type: 'guide' }]) },
      { day: 3, description: 'Kom Ombo, Edfu', overnight_city: 'Nile Cruise', is_cruise_day: true },
    ])!
    expect(s.legs.map(l => l.mode)).toEqual(['plane', 'ship', 'ship'])
  })

  it('draws self-contained HTML: numbered stops (a revisit keeps its number), icons, key', () => {
    const html = renderRouteStrip(strip)
    expect(html).toContain('<svg')
    expect(html).toContain('関西')
    expect(html).toContain('5日目・2泊')
    expect(html.match(/>2<\/div>/g)).toHaveLength(2)
    expect(html).toContain('飛行機')
    expect(html).not.toMatch(/https?:\/\/(?!www\.w3\.org)/)
  })

  it('no strip for a tour with fewer than two places', () => {
    expect(routeStripFromDays([{ day: 1, description: 'カイロ観光', overnight_city: 'Cairo' }])).toBeNull()
  })
})
