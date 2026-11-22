import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCourseAvailability, addDays, azoresNow } from '@/lib/availability'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_RANGE_DAYS = 120

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

/**
 * GET /api/availability/course
 *
 * Query-Parameter:
 *   from        YYYY-MM-DD  (Default: heute)
 *   to          YYYY-MM-DD  (Default: from + 60 Tage)
 *   course_id   string      Kurs-Slug aus course_prices, z. B. "open-water-diver"
 *                           → liest max_students_per_instructor für den Kurs.
 *
 * Antwort:
 *   { from, to, today, course_id, days: CourseAvailability[] }
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const today = azoresNow().date
  const from = searchParams.get('from') ?? today
  const to = searchParams.get('to') ?? addDays(from, 60)
  const courseId = searchParams.get('course_id')

  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: 'Invalid date range' }, { status: 400 })
  }
  const span = (Date.parse(to) - Date.parse(from)) / 86400000
  if (span < 0 || span > MAX_RANGE_DAYS) {
    return NextResponse.json({ error: 'Range too large' }, { status: 400 })
  }

  try {
    let maxStudentsPerInstructor: number | undefined

    if (courseId) {
      // Niedrigsten max_students_per_instructor aller Preisvarianten nehmen (konservativ)
      const { data } = await serviceClient()
        .from('course_prices')
        .select('max_students_per_instructor')
        .like('id', `${courseId}%`)
        .not('max_students_per_instructor', 'is', null)
        .order('max_students_per_instructor', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (data?.max_students_per_instructor) {
        maxStudentsPerInstructor = data.max_students_per_instructor
      }
    }

    const days = await getCourseAvailability(from, to, { maxStudentsPerInstructor, sandbox: searchParams.get('sandbox') === '1' })

    return NextResponse.json({
      from,
      to,
      today,
      course_id: courseId ?? null,
      max_students_per_instructor: maxStudentsPerInstructor ?? null,
      days,
    })
  } catch (e) {
    console.error('[availability/course]', e)
    return NextResponse.json({ error: 'Could not load course availability' }, { status: 500 })
  }
}
