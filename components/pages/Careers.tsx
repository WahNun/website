'use client'
import React from 'react'
import { s, Breadcrumb, useIsMobile, type Lang } from './_shared'

const CT = {
  h1:    { EN: 'Careers & Opportunities', PT: 'Carreiras & Oportunidades', DE: 'Karriere & Möglichkeiten', ES: 'Carreras y Oportunidades' },
  intro: {
    EN: 'Azoresdiving is a small SSI and Mares dive centre in Ponta Delgada. Every season we work with people who want to turn diving into a profession, and with students who want to spend time on the water. This page tells you what we offer today and how to reach us.',
    PT: 'A Azoresdiving é um pequeno centro de mergulho SSI e Mares em Ponta Delgada. Cada temporada trabalhamos com pessoas que querem transformar o mergulho numa profissão, e com estudantes que querem passar tempo no mar. Esta página conta-lhe o que oferecemos hoje e como nos contactar.',
    DE: 'Azoresdiving ist ein kleines SSI- und Mares-Tauchzentrum in Ponta Delgada. Jede Saison arbeiten wir mit Menschen zusammen, die das Tauchen zum Beruf machen möchten, und mit Studierenden, die Zeit auf dem Wasser verbringen wollen. Diese Seite erklärt, was wir heute anbieten und wie du uns erreichst.',
    ES: 'Azoresdiving es un pequeño centro de buceo SSI y Mares en Ponta Delgada. Cada temporada trabajamos con personas que quieren convertir el buceo en una profesión, y con estudiantes que quieren pasar tiempo en el agua. Esta página le explica lo que ofrecemos hoy y cómo contactarnos.',
  },

  blockA_title: { EN: 'Dive Guide & Divemaster — working internships', PT: 'Dive Guide & Divemaster — estágios de trabalho', DE: 'Dive Guide & Divemaster — Arbeitspraktika', ES: 'Dive Guide y Divemaster — prácticas laborales' },
  blockA_body:  {
    EN: 'Our SSI Dive Guide and Divemaster programs run as working internships during the summer season: you train alongside our instructors during real dive operations, on real boats with real guests. We typically take on 2–4 Divemaster candidates per season. Prerequisites: Dive Guide — 40 logged dives (25 hours), Open Water Diver and Stress & Rescue. Divemaster — 60 logged dives (40 hours), Dive Guide and Science of Diving.',
    PT: 'Os nossos programas SSI Dive Guide e Divemaster decorrem como estágios de trabalho durante a temporada de verão: treina ao lado dos nossos instrutores durante operações de mergulho reais, em barcos reais com hóspedes reais. Normalmente recebemos 2 a 4 candidatos a Divemaster por temporada. Pré-requisitos: Dive Guide — 40 mergulhos registados (25 horas), Open Water Diver e Stress & Rescue. Divemaster — 60 mergulhos registados (40 horas), Dive Guide e Science of Diving.',
    DE: 'Unsere SSI Dive Guide- und Divemaster-Programme laufen als Arbeitspraktika während der Sommersaison: du trainierst neben unseren Instructoren bei echten Taucheinsätzen, auf echten Booten mit echten Gästen. Wir nehmen in der Regel 2–4 Divemaster-Kandidaten pro Saison auf. Voraussetzungen: Dive Guide — 40 protokollierte Tauchgänge (25 Stunden), Open Water Diver und Stress & Rescue. Divemaster — 60 protokollierte Tauchgänge (40 Stunden), Dive Guide und Science of Diving.',
    ES: 'Nuestros programas SSI Dive Guide y Divemaster se desarrollan como prácticas laborales durante la temporada de verano: entrenas junto a nuestros instructores en operaciones de buceo reales, en barcos reales con huéspedes reales. Normalmente recibimos entre 2 y 4 candidatos a Divemaster por temporada. Requisitos: Dive Guide — 40 inmersiones registradas (25 horas), Open Water Diver y Stress & Rescue. Divemaster — 60 inmersiones registradas (40 horas), Dive Guide y Science of Diving.',
  },
  blockA_dg_link: { EN: 'Dive Guide program →', PT: 'Programa Dive Guide →', DE: 'Dive Guide Programm →', ES: 'Programa Dive Guide →' },
  blockA_dm_link: { EN: 'Divemaster program →', PT: 'Programa Divemaster →', DE: 'Divemaster Programm →', ES: 'Programa Divemaster →' },
  blockA_body2: {
    EN: 'You can pay the course fee, or work it off as part of your internship — we do both. Which model fits depends on how long you can stay and when. Tell us your dates and we\'ll find a solution that works for all of us.',
    PT: 'Pode pagar a taxa do curso ou compensá-la como parte do seu estágio — fazemos as duas coisas. O modelo que se adequa depende de quanto tempo pode ficar e quando. Diga-nos as suas datas e encontraremos uma solução que funcione para todos nós.',
    DE: 'Du kannst die Kursgebühr bezahlen oder sie als Teil deines Praktikums abarbeiten — beides ist möglich. Welches Modell passt, hängt davon ab, wie lange du bleiben kannst und wann. Nenn uns deinen Zeitraum, und wir finden eine Lösung, die für uns alle funktioniert.',
    ES: 'Puede pagar la tarifa del curso o compensarla como parte de su práctica — hacemos ambas cosas. El modelo que mejor encaja depende de cuánto tiempo puede quedarse y cuándo. Díganos sus fechas y encontraremos una solución que funcione para todos.',
  },
  blockA_btn:     { EN: 'Ask about an internship', PT: 'Perguntar sobre estágio', DE: 'Über ein Praktikum anfragen', ES: 'Preguntar sobre una práctica' },

  blockB_title: { EN: 'University & Erasmus placements', PT: 'Estágios universitários & Erasmus', DE: 'Hochschul- & Erasmus-Praktika', ES: 'Prácticas universitarias y Erasmus' },
  blockB_body:  {
    EN: 'If you are studying marine biology, tourism or a related field and want to spend a placement with us, write to us with your dates and what your programme requires.',
    PT: 'Se estuda biologia marinha, turismo ou uma área relacionada e quer fazer um estágio connosco, escreva-nos com as suas datas e o que o seu programa requer.',
    DE: 'Wenn du Meeresbiologie, Tourismus oder ein verwandtes Fach studierst und ein Praktikum bei uns verbringen möchtest, schreib uns mit deinen Daten und den Anforderungen deines Programms.',
    ES: 'Si estudia biología marina, turismo u otro campo relacionado y quiere hacer una estancia con nosotros, escríbanos con sus fechas y lo que su programa requiere.',
  },
  blockB_btn: { EN: 'Ask about a placement', PT: 'Perguntar sobre estágio académico', DE: 'Über ein Hochschulpraktikum anfragen', ES: 'Preguntar sobre una estancia académica' },

  blockC_title: { EN: 'Working with us for a season', PT: 'Trabalhar connosco uma temporada', DE: 'Eine Saison mit uns arbeiten', ES: 'Trabajar con nosotros una temporada' },
  blockC_body:  {
    EN: 'In high season we regularly look for instructors, skippers, dive guides and front-office staff. If you want to spend a season in the Azores, tell us who you are, what you hold and when you are available.',
    PT: 'Na alta temporada, procuramos regularmente instrutores, patrões, dive guides e staff de front office. Se quiser passar uma temporada nos Açores, diga-nos quem é, o que detém e quando está disponível.',
    DE: 'In der Hochsaison suchen wir regelmäßig Instructoren, Schiffsführer, Dive Guides und Front-Office-Personal. Wenn du eine Saison auf den Azoren verbringen möchtest, sag uns, wer du bist, was du mitbringst und wann du verfügbar bist.',
    ES: 'En temporada alta buscamos regularmente instructores, patrones, dive guides y personal de recepción. Si quiere pasar una temporada en las Azores, cuéntenos quién es, qué titulaciones tiene y cuándo está disponible.',
  },
  blockC_btn: { EN: 'Write to us', PT: 'Escreva-nos', DE: 'Schreib uns', ES: 'Escríbanos' },

  include_title: { EN: 'What to include', PT: 'O que incluir', DE: 'Was du angeben solltest', ES: 'Qué incluir' },
  include_body:  {
    EN: 'Your available dates, your certification level and number of logged dives (if you dive), the languages you speak, and one or two sentences on why the Azores.',
    PT: 'As suas datas disponíveis, o seu nível de certificação e número de mergulhos registados (se mergulha), os idiomas que fala, e uma ou duas frases sobre porque os Açores.',
    DE: 'Deine verfügbaren Daten, dein Zertifizierungsgrad und die Anzahl protokollierter Tauchgänge (falls du tauchst), die Sprachen, die du sprichst, und ein oder zwei Sätze darüber, warum die Azoren.',
    ES: 'Sus fechas disponibles, su nivel de certificación y número de inmersiones registradas (si bucea), los idiomas que habla, y una o dos frases sobre por qué las Azores.',
  },
  include_note: {
    EN: 'Applications go straight to management, not to the front office.',
    PT: 'As candidaturas vão diretamente para a direção, não para o front office.',
    DE: 'Bewerbungen gehen direkt an die Geschäftsleitung, nicht an das Front Office.',
    ES: 'Las solicitudes van directamente a la dirección, no a la recepción.',
  },

  bc:      { EN: 'Careers & Opportunities', PT: 'Carreiras & Oportunidades', DE: 'Karriere & Möglichkeiten', ES: 'Carreras y Oportunidades' },
  bc_home: { EN: 'Home', PT: 'Início', DE: 'Start', ES: 'Inicio' },
}

const MAILTO = 'admin.azoresdiving@gmail.com'
const SUBJ_INTERN    = 'Careers%20%E2%80%94%20Dive%20Guide%20%2F%20Divemaster%20internship'
const SUBJ_PLACEMENT = 'Careers%20%E2%80%94%20University%20%2F%20Erasmus%20placement'
const SUBJ_SEASON    = 'Careers%20%E2%80%94%20Season%20job'

export function PageCareers({ nav, lang }: { nav: (p: string) => void; lang: Lang }) {
  const isMobile = useIsMobile()
  const t = (key: keyof typeof CT) => CT[key][lang]

  const blockStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,.03)',
    border: '1px solid rgba(255,255,255,.08)',
    borderRadius: '14px',
    padding: isMobile ? '24px 20px' : '28px 32px',
    marginBottom: '20px',
  }

  const BlockTitle = ({ children }: { children: React.ReactNode }) => (
    <h2 style={{ fontSize: 'clamp(16px,2vw,20px)', fontWeight: 800, color: '#d7e7f7', margin: '0 0 12px' }}>
      {children}
    </h2>
  )

  const MailBtn = ({ href, label }: { href: string; label: string }) => (
    <a
      href={href}
      style={{
        display: 'inline-block', marginTop: '18px',
        background: 'linear-gradient(135deg,#35d0ff,#1a8fe0)', color: '#04101f',
        fontWeight: 800, fontSize: '14px', padding: '11px 22px', borderRadius: '999px',
        boxShadow: '0 4px 18px rgba(53,208,255,.3)', textDecoration: 'none', fontFamily: s.font,
      }}
    >
      {label}
    </a>
  )

  return (
    <div style={{ padding: isMobile ? '32px 20px 60px' : '60px 48px 80px', maxWidth: '820px' }}>
      <Breadcrumb label={t('bc')} homeLabel={t('bc_home')} goHome={() => nav('home')} />

      <h1 style={{ fontSize: 'clamp(28px,4vw,48px)', fontWeight: 900, letterSpacing: '-.01em', marginBottom: '14px' }}>
        {t('h1')}<span style={{ color: s.accent }}>.</span>
      </h1>
      <p style={{ color: '#cfe2f4', fontSize: '16px', lineHeight: 1.8, marginBottom: '40px' }}>
        {t('intro')}
      </p>

      {/* Block A — Internships */}
      <div style={blockStyle}>
        <BlockTitle>{t('blockA_title')}</BlockTitle>
        <p style={{ color: '#9fc4da', fontSize: '15px', lineHeight: 1.75, margin: '0 0 14px' }}>
          {t('blockA_body')}
        </p>
        <p style={{ color: '#9fc4da', fontSize: '15px', lineHeight: 1.75, margin: '0 0 14px' }}>
          {t('blockA_body2')}
        </p>
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
          <a href="/courses/dive-guide" style={{ color: s.accent, fontSize: '14px', fontWeight: 600, textDecoration: 'none', fontFamily: s.font }}>
            {t('blockA_dg_link')}
          </a>
          <a href="/courses/divemaster" style={{ color: s.accent, fontSize: '14px', fontWeight: 600, textDecoration: 'none', fontFamily: s.font }}>
            {t('blockA_dm_link')}
          </a>
        </div>
        <MailBtn href={`mailto:${MAILTO}?subject=${SUBJ_INTERN}`} label={t('blockA_btn')} />
      </div>

      {/* Block B — Placements */}
      <div style={blockStyle}>
        <BlockTitle>{t('blockB_title')}</BlockTitle>
        <p style={{ color: '#9fc4da', fontSize: '15px', lineHeight: 1.75, margin: 0 }}>
          {t('blockB_body')}
        </p>
        <MailBtn href={`mailto:${MAILTO}?subject=${SUBJ_PLACEMENT}`} label={t('blockB_btn')} />
      </div>

      {/* Block C — Season */}
      <div style={blockStyle}>
        <BlockTitle>{t('blockC_title')}</BlockTitle>
        <p style={{ color: '#9fc4da', fontSize: '15px', lineHeight: 1.75, margin: 0 }}>
          {t('blockC_body')}
        </p>
        <MailBtn href={`mailto:${MAILTO}?subject=${SUBJ_SEASON}`} label={t('blockC_btn')} />
      </div>

      {/* What to include */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,.07)', paddingTop: '28px', marginTop: '8px' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 800, color: '#d7e7f7', margin: '0 0 10px' }}>
          {t('include_title')}
        </h2>
        <p style={{ color: '#9fc4da', fontSize: '15px', lineHeight: 1.75, marginBottom: '10px' }}>
          {t('include_body')}
        </p>
        <p style={{ color: s.muted, fontSize: '13px', lineHeight: 1.6, margin: 0 }}>
          {t('include_note')}
        </p>
      </div>
    </div>
  )
}
