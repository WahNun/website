import { NextResponse } from 'next/server'

// Ponta Delgada, São Miguel, Azores
const LAT = 37.74
const LON = -25.68
const TZ  = 'Atlantic/Azores'

export async function GET() {
  try {
    const [atmRes, marRes] = await Promise.all([
      fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,windspeed_10m,winddirection_10m,windgusts_10m,weathercode&wind_speed_unit=kn&timezone=${encodeURIComponent(TZ)}`,
        { next: { revalidate: 1800 } }
      ),
      fetch(
        `https://marine-api.open-meteo.com/v1/marine?latitude=${LAT}&longitude=${LON}&current=wave_height,wave_period,sea_surface_temperature&timezone=${encodeURIComponent(TZ)}`,
        { next: { revalidate: 1800 } }
      ),
    ])

    if (!atmRes.ok) return NextResponse.json({ error: `Open-Meteo atm ${atmRes.status}` }, { status: 502 })
    if (!marRes.ok) return NextResponse.json({ error: `Open-Meteo marine ${marRes.status}` }, { status: 502 })

    const [atm, mar] = await Promise.all([atmRes.json(), marRes.json()])

    return NextResponse.json({
      weathercode:           atm.current?.weathercode          ?? 0,
      temperature_2m:        atm.current?.temperature_2m        ?? null,
      windspeed_10m:         atm.current?.windspeed_10m         ?? null,
      winddirection_10m:     atm.current?.winddirection_10m     ?? null,
      windgusts_10m:         atm.current?.windgusts_10m         ?? null,
      wave_height:           mar.current?.wave_height           ?? null,
      wave_period:           mar.current?.wave_period           ?? null,
      sea_surface_temperature: mar.current?.sea_surface_temperature ?? null,
      fetchTime: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[weather proxy]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
