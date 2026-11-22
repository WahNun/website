import type { CourseMeta } from '@/lib/courseMeta'
import type { SiteMeta } from '@/lib/siteMeta'

const BASE_URL = 'https://azoresdiving.com'
const BUSINESS_ID = `${BASE_URL}/#business`

export function localBusinessJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': ['LocalBusiness', 'SportsActivityLocation'],
    '@id': BUSINESS_ID,
    name: 'Azoresdiving',
    alternateName: ['Azores Diving', 'AZORESDIVING', 'Azoresdiving/Açordiving SSI/Mares Dive Center'],
    url: BASE_URL,
    areaServed: [
      { '@type': 'Place', name: 'São Miguel, Azores' },
      { '@type': 'City', name: 'Ponta Delgada' },
    ],
    telephone: '+351 927 382 023',
    email: 'azoresdiving@gmail.com',
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Marina Pêro de Teive, Kiosk A',
      postalCode: '9500-771',
      addressLocality: 'Ponta Delgada',
      addressRegion: 'Azores',
      addressCountry: 'PT',
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: 37.7410,
      longitude: -25.6598,
    },
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        opens: '08:00',
        closes: '20:00',
      },
    ],
    sameAs: [
      'https://www.instagram.com/azoresdiving_divecenter/',
      'https://www.facebook.com/azoresdiving',
      'https://www.tripadvisor.com/Attraction_Review-g189135-d7119174-Reviews-Azoresdiving_Dive_Center-Ponta_Delgada_Sao_Miguel_Azores.html',
    ],
    image: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/images/hero.webp',
  }
}

export function courseJsonLd(slug: string, c: CourseMeta) {
  const base: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: c.name,
    description: c.description,
    url: `${BASE_URL}/courses/${slug}`,
    provider: { '@id': BUSINESS_ID },
  }
  if (c.price !== 'on request') {
    base.offers = {
      '@type': 'Offer',
      price: c.price.replace('€', ''),
      priceCurrency: 'EUR',
      availability: 'https://schema.org/InStock',
    }
  }
  return base
}

export function divesTripJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'TouristTrip',
    name: 'Daily Double Dive',
    description: 'Two guided boat dives — morning (8:00–13:00) or afternoon (14:00–19:00). Max 4 divers per guide. Tank, weights and guide included.',
    provider: { '@id': BUSINESS_ID },
    touristType: 'Certified scuba divers',
    url: `${BASE_URL}/dives`,
    offers: [
      { '@type': 'Offer', name: 'Double Dive (2 dives)', price: '99', priceCurrency: 'EUR', availability: 'https://schema.org/InStock', url: `${BASE_URL}/dives` },
      { '@type': 'Offer', name: '4-Dive Pack', price: '189', priceCurrency: 'EUR', availability: 'https://schema.org/InStock', url: `${BASE_URL}/dives` },
      { '@type': 'Offer', name: '6-Dive Pack', price: '270', priceCurrency: 'EUR', availability: 'https://schema.org/InStock', url: `${BASE_URL}/dives` },
      { '@type': 'Offer', name: '8-Dive Pack', price: '344', priceCurrency: 'EUR', availability: 'https://schema.org/InStock', url: `${BASE_URL}/dives` },
      { '@type': 'Offer', name: '10-Dive Pack', price: '409', priceCurrency: 'EUR', availability: 'https://schema.org/InStock', url: `${BASE_URL}/dives` },
    ],
  }
}

export function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Azoresdiving',
    alternateName: 'Azores Diving',
    url: BASE_URL,
    publisher: { '@id': BUSINESS_ID },
  }
}

export function siteAttractionJsonLd(slug: string, s: SiteMeta) {
  return {
    '@context': 'https://schema.org',
    '@type': 'TouristAttraction',
    '@id': `${BASE_URL}/sites/${slug}`,
    name: s.name,
    description: s.description,
    url: `${BASE_URL}/sites/${slug}`,
    containedInPlace: { '@id': BUSINESS_ID },
  }
}

export function siteBreadcrumbJsonLd(slug: string, name: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: BASE_URL },
      { '@type': 'ListItem', position: 2, name: 'Dive Sites', item: `${BASE_URL}/sites` },
      { '@type': 'ListItem', position: 3, name, item: `${BASE_URL}/sites/${slug}` },
    ],
  }
}

export function faqPageJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'Can I book just one dive, or do I need a package?',
        acceptedAnswer: { '@type': 'Answer', text: 'Yes — single dives are available on request. Our standard schedule runs double dives, which makes planning easier for everyone, but if you only want one dive, just let us know when booking.' },
      },
      {
        '@type': 'Question',
        name: 'How do I book?',
        acceptedAnswer: { '@type': 'Answer', text: 'Online through our website, by walking up to our kiosk at the marina, or via WhatsApp (+351 927 382 023). We love walk-ins and respond quickly on WhatsApp.' },
      },
      {
        '@type': 'Question',
        name: 'Is card payment accepted?',
        acceptedAnswer: { '@type': 'Answer', text: 'Yes — card payment is accepted at the kiosk and online.' },
      },
      {
        '@type': 'Question',
        name: 'What is your cancellation policy?',
        acceptedAnswer: { '@type': 'Answer', text: 'Cancel up to 72 hours before: full refund. Cancel between 72 and 48 hours before: 50% refund. Cancel less than 48 hours before or no-show: no refund. Need to reschedule? Reach out as early as possible and we will do our best to find you another slot.' },
      },
      {
        '@type': 'Question',
        name: 'I have never dived before — what can I do?',
        acceptedAnswer: { '@type': 'Answer', text: 'Our Basic Diver programme is made for this. No certification, no experience needed — just a minimum age of 10. You get online theory beforehand, a pool skills session, then a real harbour dive to up to 12 m with your instructor. You leave with an official SSI Basic Diver certification. Many guests call it one of the best hours of their lives.' },
      },
      {
        '@type': 'Question',
        name: 'Can a non-diving companion come on the boat?',
        acceptedAnswer: { '@type': 'Answer', text: 'Yes. A partner or friend who does not dive is welcome on the boat trip. Let us know when booking so we can confirm space. Non-divers can snorkel or simply enjoy being out on the Atlantic.' },
      },
      {
        '@type': 'Question',
        name: 'What certification do I need for the Formigas expedition?',
        acceptedAnswer: { '@type': 'Answer', text: 'Three pathways: Pathway A — AOWD + 30 or more dives, do a check dive with us (no course needed). Pathway B — OWD + more than 20 dives + Offshore Prep course (€160). Pathway C — AOWD + fewer than 30 dives + Offshore Prep course (€160). OWD with 20 or fewer dives is not yet eligible. See the Formigas page for details.' },
      },
      {
        '@type': 'Question',
        name: 'Is the Formigas trip guaranteed on a specific date?',
        acceptedAnswer: { '@type': 'Answer', text: 'No — it runs only when conditions allow the 42 nm offshore crossing safely. When a window opens, we contact everyone on the waitlist.' },
      },
      {
        '@type': 'Question',
        name: 'What can I expect to see underwater?',
        acceptedAnswer: { '@type': 'Answer', text: 'On a typical dive: grey triggerfish, barracuda, moray eels, groupers, stingrays, ornate wrasse, damselfish, and more Atlantic reef fish. Seasonally: Mola mola and mobula rays. At Formigas: mantas, whale sharks, and other large pelagics. Our team includes marine biologists who love talking you through what is out there.' },
      },
      {
        '@type': 'Question',
        name: 'When is the best time of year?',
        acceptedAnswer: { '@type': 'Answer', text: 'We dive year-round. Mola mola and mantas are most common July through October. Visibility and conditions are excellent April through November.' },
      },
      {
        '@type': 'Question',
        name: 'What should I bring?',
        acceptedAnswer: { '@type': 'Answer', text: 'Just yourself and a swimsuit. We provide everything: wetsuit, BCD, regulator, fins, mask, and weights. Your own gear is welcome too.' },
      },
      {
        '@type': 'Question',
        name: 'How early should I arrive?',
        acceptedAnswer: { '@type': 'Answer', text: 'Please be at Marina Quiosque A at least 30 minutes before your scheduled departure for check-in, equipment fitting, and briefing.' },
      },
      {
        '@type': 'Question',
        name: 'What happens if conditions are bad?',
        acceptedAnswer: { '@type': 'Answer', text: 'Safety always comes first. If we cancel due to weather, sea conditions, or any safety reason, you choose: full refund or reschedule — your call, no pressure.' },
      },
      {
        '@type': 'Question',
        name: 'Can I fly after diving?',
        acceptedAnswer: { '@type': 'Answer', text: 'Yes, but timing matters. After certified dives, wait at least 24 hours before flying or travelling to significant altitude. After the Basic Diver programme (introductory diving), the minimum is 12 hours. This is a safety rule — nitrogen needs time to leave your body.' },
      },
      {
        '@type': 'Question',
        name: 'I have a medical condition or special requirements — can I still dive?',
        acceptedAnswer: { '@type': 'Answer', text: 'Please reach out before booking and we will do everything we can to make it work. We have dived with guests with depth restrictions, heart conditions, sensory differences, neurodiversity, and more. There is nothing too sensitive to ask — we would rather talk it through than have you miss the ocean.' },
      },
      {
        '@type': 'Question',
        name: 'I have been told I can only dive to a limited depth — is that a problem?',
        acceptedAnswer: { '@type': 'Answer', text: 'In most cases, not at all. Many of our dive sites are beautiful at shallower depths, and our guides adapt the dive plan entirely to your limit. Just let us know your restriction when booking.' },
      },
      {
        '@type': 'Question',
        name: 'Is diving suitable for guests with sensory sensitivities or neurodiversity?',
        acceptedAnswer: { '@type': 'Answer', text: 'Yes. We adjust our briefing approach, take extra time, and plan the dive around what works best for you. Talk to us in advance — we will prepare accordingly.' },
      },
    ],
  }
}
