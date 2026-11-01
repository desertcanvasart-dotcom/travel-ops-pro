'use client'

// The Rates layout's row counts, for the /rates overview to show without a
// second request.
import { createContext, useContext } from 'react'

export const RateCountsContext = createContext<Record<string, number | null>>({})
export const useRateCountsContext = () => useContext(RateCountsContext)
