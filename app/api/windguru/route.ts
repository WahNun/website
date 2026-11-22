// Edge runtime = Vercel's global edge network IPs, not AWS Lambda IPs
export const runtime = 'edge'

import { NextResponse } from 'next/server'

// ─── WINDGURU SET ID ──────────────────────────────────────────────────────────
// From windguru.cz/?set=87696  → id_set = 87696
const WINDGURU_SET_ID = 87696
// ─────────────────────────────────────────────────────────────────────────────

const DIRS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW']

function msToKn(ms: number) { return Math.round(ms * 1.94384) }
function degToDir(deg: number) { return DIRS[Math.round(deg / 22.5) % 16] }

// Windguru JS uses: Math.floor(Date.now() / 600000) — changes every 10 min
function cachefix() { return Math.floor(Date.now() / 600000) }
function ruuid()    { return Math.random().toString(36).substring(2, 15) }

const HEADERS = {
  'Accept': 'application/json, text/javascript, */*; q=0.01',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Referer': 'https://www.windguru.cz/',
  'Origin': 'https://www.windguru.cz',
  'X-Requested-With': 'XMLHttpRequest',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
}

async function safeJson(res: Response): Promise<{ ok: true; data: any } | { ok: false; body: string }> {
  const text = await res.text().catch(() => '')
  try {
    return { ok: true, data: JSON.parse(text) }
  } catch {
    return { ok: false, body: text.slice(0, 500) }
  }
}

export async function GET() {
  try {
    const cf = cachefix()
    const ru = ruuid()

    // Step 1: resolve set → get spot IDs
    const setUrl = `https://www.windguru.cz/int/iapi.php?q=set&id_set=${WINDGURU_SET_ID}&uid=0&ruuid=${ru}&cachefix=${cf}`
    const setRes = await fetch(setUrl, { headers: HEADERS, next: { revalidate: 86400 } })

    if (!setRes.ok) {
      const body = (await setRes.text().catch(() => '')).slice(0, 300)
      return NextResponse.json({ error: `Windguru set HTTP ${setRes.status}`, body }, { status: 422 })
    }

    const setParsed = await safeJson(setRes)
    if (!setParsed.ok) {
      return NextResponse.json({ error: 'Windguru set: not JSON', body: setParsed.body }, { status: 422 })
    }
    const setData = setParsed.data

    // Spots can be array or object
    const spots: any[] = Array.isArray(setData?.spots)
      ? setData.spots
      : Object.values(setData?.spots ?? {})
    const spotId: number | null = spots[0]?.id_spot ?? spots[0]?.id ?? null

    if (!spotId) {
      return NextResponse.json(
        { error: 'No spot in set', setKeys: Object.keys(setData ?? {}), spotsRaw: JSON.stringify(setData?.spots).slice(0, 300) },
        { status: 422 }
      )
    }

    // Step 2: fetch GFS forecast for that spot
    const fcstUrl = `https://www.windguru.cz/int/iapi.php?q=forecast&id_spot=${spotId}&models=3&lang=en&uid=0&ruuid=${ru}&cachefix=${cf}`
    const fcstRes = await fetch(fcstUrl, { headers: HEADERS, next: { revalidate: 1800 } })

    if (!fcstRes.ok) {
      const body = (await fcstRes.text().catch(() => '')).slice(0, 300)
      return NextResponse.json({ error: `Windguru forecast HTTP ${fcstRes.status}`, spotId, body }, { status: 422 })
    }

    const fcstParsed = await safeJson(fcstRes)
    if (!fcstParsed.ok) {
      return NextResponse.json({ error: 'Windguru forecast: not JSON', spotId, body: fcstParsed.body }, { status: 422 })
    }
    const data = fcstParsed.data

    const fcst = data?.fcst?.['3']
    if (!fcst) {
      return NextResponse.json(
        { error: 'No GFS model in forecast', spotId, availableModels: Object.keys(data?.fcst ?? {}) },
        { status: 422 }
      )
    }

    // index 0 = soonest forecast hour
    const windSpeedMs: number | null = fcst.WINDSPD?.[0] ?? null  // m/s
    const windDirDeg:  number | null = fcst.SMER?.[0]   ?? null   // degrees
    const gustMs:      number | null = fcst.GUST?.[0]   ?? null   // m/s

    const windSpeedKn  = windSpeedMs !== null ? msToKn(windSpeedMs) : null
    const gustKn       = gustMs      !== null ? msToKn(gustMs)      : null
    const windDirLabel = windDirDeg  !== null ? degToDir(windDirDeg) : null

    return NextResponse.json({
      windSpeedKn,
      windDirDeg,
      windDirLabel,
      gustKn,
      windLabel: windDirLabel && windSpeedKn !== null
        ? `${windDirLabel} ${windSpeedKn} kn${gustKn ? ` (${gustKn})` : ''}`
        : null,
      spotId,
      setId: WINDGURU_SET_ID,
      initdate: fcst.initdate ?? null,
      fetchTime: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[windguru proxy]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
