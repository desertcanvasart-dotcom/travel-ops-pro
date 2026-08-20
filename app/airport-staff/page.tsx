import { redirect } from 'next/navigation'

// The airport-staff roster is gone: an assistant is a supplier, even when they
// are on the company payroll, because the company buys the service either way.
// Anyone with the old link lands on the same people, filed where they now live.
export default function AirportStaffPage() {
  redirect('/suppliers?type=airport_assistant')
}
