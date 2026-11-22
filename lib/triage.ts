import { createClient } from '@supabase/supabase-js'

export function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export const DEFAULT_SYSTEM_PROMPT = `You triage emails for Azores Diving, a scuba diving center in São Miguel, Azores.
Classify as exactly one word:

ticket – a real person is writing to us and needs a reply: booking inquiries, pricing questions, availability, courses, cancellations, complaints, general questions from customers or potential customers

internal – emails addressed to or intended for management/ownership rather than the customer support team: job applications, work placement requests, requests addressed to Emanuel or Nelinho by name, B2B partnership proposals from local businesses, equipment supplier inquiries, dive insurance partner follow-ups

ignore – unsolicited B2B sales outreach and advertising (car rentals, web agencies, marketing services, cold outreach), automated notifications, booking system emails, newsletters, no-reply senders, out-of-office replies, spam, platform notifications (Google, Facebook, TripAdvisor), payment receipts, order confirmations, any email that is clearly machine-generated or does not expect a human reply from us

review – only when you genuinely cannot determine if the sender is a real customer or an automated system

Reply with ONLY the single word: ticket, internal, ignore, or review.`

export async function getActiveSystemPrompt(supabase: ReturnType<typeof getServiceClient>): Promise<string> {
  try {
    const { data } = await supabase
      .from('triage_config')
      .select('prompt_text')
      .eq('is_active', true)
      .maybeSingle()
    return data?.prompt_text ?? DEFAULT_SYSTEM_PROMPT
  } catch {
    return DEFAULT_SYSTEM_PROMPT
  }
}

export async function classify(subject: string, body: string, systemPrompt: string): Promise<'ticket' | 'review' | 'ignore' | 'internal'> {
  if (!process.env.MISTRAL_API_KEY) return 'review'
  const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'mistral-small-latest',
      temperature: 0,
      max_tokens: 5,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Subject: ${subject}\n\n${body.slice(0, 800)}` },
      ],
    }),
  })
  const data = await res.json() as { choices: { message: { content: string } }[] }
  const word = data.choices?.[0]?.message?.content?.trim().toLowerCase() ?? 'review'
  if (word === 'ticket' || word === 'ignore' || word === 'internal') return word
  return 'review'
}
