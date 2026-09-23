import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, getCurrentUserId } from '@/lib/auth/current-org'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// `clients` has no `name` column — it holds first_name / last_name. Selecting
// `name` made Postgres reject the WHOLE query with 42703 ("column clients.name
// does not exist"), so every one of this route's branches 500'd: an email could
// never be linked to a client, and the auto-match by sender address never
// matched. The columns are read as they exist and the display name the inbox
// expects is composed here.
type ClientRow = { first_name?: string | null; last_name?: string | null }

function withDisplayName<T extends ClientRow>(client: T | null | undefined) {
  if (!client) return client ?? null
  const name = [client.first_name, client.last_name].filter(Boolean).join(' ').trim()
  return { ...client, name }
}

/** The same composition for a client embedded on a link row. */
function linkWithClientName<T extends { client?: ClientRow | null }>(link: T | null) {
  if (!link) return link
  return { ...link, client: withDisplayName(link.client) }
}

// Links belong to the SESSION user and clients to the caller's workspace. Every
// handler used to take userId from the query or body — so anyone signed in
// could read, relink or delete a colleague's email links — and the client
// lookups ran on this service-role client with no org filter.
async function caller(): Promise<{ userId: string; orgId: string } | null> {
  const [userId, orgId] = await Promise.all([getCurrentUserId(), getCurrentOrgId()])
  return userId && orgId ? { userId, orgId } : null
}
const unauthorized = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

// GET /api/email/links?emailAddress=xxx | ?messageId=xxx
// Returns linked client for an email address
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const me = await caller()
    if (!me) return unauthorized()
    const { userId, orgId } = me
    const emailAddress = searchParams.get('emailAddress')
    const messageId = searchParams.get('messageId')

    // If messageId provided, get link for specific email
    if (messageId) {
      const { data, error } = await supabase
        .from('email_client_links')
        .select(`
          *,
          client:clients(id, first_name, last_name, email, phone, status)
        `)
        .eq('user_id', userId)
        .eq('message_id', messageId)
        .single()

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
        throw error
      }

      return NextResponse.json({ link: linkWithClientName(data) })
    }

    // If emailAddress provided, find client by email
    if (emailAddress) {
      const { data: client, error } = await supabase
        .from('clients')
        // clients has no user_id column — this filter 400'd, so looking up a
        // client by email address never returned anything. Ownership on this
        // table is created_by; the lookup is by email, which is what the
        // caller actually asked for.
        .select('id, first_name, last_name, email, phone, status')
        .eq('org_id', orgId)
        .ilike('email', emailAddress)
        .single()

      if (error && error.code !== 'PGRST116') {
        throw error
      }

      return NextResponse.json({ client: withDisplayName(client) })
    }

    return NextResponse.json({ error: 'Provide emailAddress or messageId' }, { status: 400 })

  } catch (error: any) {
    console.error('Error fetching email link:', error)
    return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

// POST /api/email/links
// Link an email to a client
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const me = await caller()
    if (!me) return unauthorized()
    const { userId, orgId } = me
    const { messageId, clientId, emailAddress, threadId } = body

    if (!messageId || !clientId) {
      return NextResponse.json(
        { error: 'Missing required fields: messageId, clientId' },
        { status: 400 }
      )
    }
    // Only a client of THIS workspace can be linked.
    const { data: ownClient } = await supabase
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!ownClient) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // Check if link already exists
    const { data: existing } = await supabase
      .from('email_client_links')
      .select('id')
      .eq('user_id', userId)
      .eq('message_id', messageId)
      .single()

    if (existing) {
      // Update existing link
      const { data, error } = await supabase
        .from('email_client_links')
        .update({
          client_id: clientId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select(`
          *,
          client:clients(id, first_name, last_name, email, phone, status)
        `)
        .single()

      if (error) throw error
      return NextResponse.json({ link: linkWithClientName(data), updated: true })
    }

    // Create new link
    const { data, error } = await supabase
      .from('email_client_links')
      .insert({
        user_id: userId,
        message_id: messageId,
        thread_id: threadId || null,
        client_id: clientId,
        email_address: emailAddress || null,
      })
      .select(`
        *,
        client:clients(id, first_name, last_name, email, phone, status)
      `)
      .single()

    if (error) throw error

    return NextResponse.json({ link: linkWithClientName(data), created: true })

  } catch (error: any) {
    console.error('Error creating email link:', error)
    return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

// DELETE /api/email/links
// Remove an email-client link
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const me = await caller()
    if (!me) return unauthorized()
    const { userId } = me
    const { messageId, linkId } = body

    if (!messageId && !linkId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    let query = supabase
      .from('email_client_links')
      .delete()
      .eq('user_id', userId)

    if (linkId) {
      query = query.eq('id', linkId)
    } else {
      query = query.eq('message_id', messageId)
    }

    const { error } = await query

    if (error) throw error

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('Error deleting email link:', error)
    return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

// PUT /api/email/links/auto
// Auto-link emails based on email address matching
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const me = await caller()
    if (!me) return unauthorized()
    const { userId, orgId } = me
    const { emails } = body // emails: Array<{ messageId, threadId, fromEmail, toEmails }>

    if (!emails || !Array.isArray(emails)) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Get all clients for this user
    const { data: clients, error: clientError } = await supabase
      .from('clients')
      // Same missing column as above; the email->client map is built from
      // this workspace's clients (this is the service-role client — RLS does
      // not scope it, the org filter does).
      .select('id, email')
      .eq('org_id', orgId)

    if (clientError) throw clientError

    // Create email -> client lookup
    const emailToClient = new Map<string, string>()
    clients?.forEach(client => {
      if (client.email) {
        emailToClient.set(client.email.toLowerCase(), client.id)
      }
    })

    // Get existing links to avoid duplicates
    const messageIds = emails.map(e => e.messageId)
    const { data: existingLinks } = await supabase
      .from('email_client_links')
      .select('message_id')
      .eq('user_id', userId)
      .in('message_id', messageIds)

    const existingMessageIds = new Set(existingLinks?.map(l => l.message_id) || [])

    // Find matches and create links
    const linksToCreate: any[] = []

    for (const email of emails) {
      if (existingMessageIds.has(email.messageId)) continue

      // Check from email
      let clientId = emailToClient.get(email.fromEmail?.toLowerCase())

      // Check to emails if not found
      if (!clientId && email.toEmails) {
        for (const toEmail of email.toEmails) {
          clientId = emailToClient.get(toEmail.toLowerCase())
          if (clientId) break
        }
      }

      if (clientId) {
        linksToCreate.push({
          user_id: userId,
          message_id: email.messageId,
          thread_id: email.threadId || null,
          client_id: clientId,
          email_address: email.fromEmail,
          auto_linked: true,
        })
      }
    }

    if (linksToCreate.length > 0) {
      const { data, error } = await supabase
        .from('email_client_links')
        .insert(linksToCreate)
        .select()

      if (error) throw error

      return NextResponse.json({ 
        linked: data?.length || 0,
        total: emails.length 
      })
    }

    return NextResponse.json({ linked: 0, total: emails.length })

  } catch (error: any) {
    console.error('Error auto-linking emails:', error)
    return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}
