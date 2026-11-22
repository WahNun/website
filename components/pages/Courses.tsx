'use client'
import React, { useState, useRef } from 'react'
import { T, s, bookBtnStyle, fireEvent, useIsMobile, Breadcrumb, type Lang } from './_shared'

const ENTRY_COURSES = [
 { id: 'basic-diver', price: '€139', bg: 'linear-gradient(210deg,#121210 0%,#121210 90%)', color: '#b7c4b0', name: 'Basic Diver', desc: 'Pool + harbour dive · SSI certification · no experience needed', img: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses/basic-diver.webp' },
 { id: 'scuba-diver', price: '€320', bg: 'linear-gradient(210deg,#121210 0%,#121210 90%)', color: '#b7c4b0', name: 'Scuba Diver', desc: '3 days · 12 m cert · halfway to OWD', img: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses/scuba-diver.webp' },
 { id: 'open-water-diver', price: '€460', bg: 'linear-gradient(210deg,#121210 0%,#121210 90%)', color: '#b7c4b0', name: 'Open Water Diver', desc: '~4 days · 18 m worldwide · equipment incl.', img: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses/owd.webp' },
 { id: 'skills-update', price: '€95', bg: 'linear-gradient(210deg,#121210 0%,#121210 90%)', color: '#b7c4b0', name: 'Scuba Skills Update', desc: 'Refresher for certified divers back in the water', img: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses/skills-update.webp' },
 { id: 'ssi-explorers', price: 'Upon Request', bg: 'linear-gradient(210deg,#121210 0%,#121210 90%)', color: '#b7c4b0', name: 'SSI Explorers', desc: 'Aquatic adventure program for young ocean explorers from age 6', img: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses/ssi-explorers.webp' },
 { id: 'upgrade-owd', price: '€300', bg: 'linear-gradient(210deg,#121210 0%,#121210 90%)', color: '#b7c4b0', name: 'Upgrade OWD', desc: 'Already Scuba Diver? Level up', img: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses/upgrade-owd.webp' },
]

const SPECIALTY_COURSES = [
 { id: 'advanced-open-water-diver', price: '€380', bg: 'linear-gradient(210deg,#121210 0%,#121210 90%)', name: 'Advanced Open Water Diver', desc: '5 adventure dives incl. deep & nav · 30 m', img: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses/aowd.webp' },
 { id: 'deep-diving', price: '€350', bg: 'linear-gradient(210deg,#121210 0%,#121210 90%)', name: 'Deep Diving', desc: 'Down to 40 m · gas management & narcosis', img: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses/deep-diving.webp' },
 { id: 'perfect-buoyancy', price: '€200', bg: 'linear-gradient(210deg,#121210 0%,#121210 90%)', name: 'Perfect Buoyancy', desc: 'Trim & neutral float — transforms every dive', img: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses/perfect-buoyancy.webp' },
 { id: 'night-diving', price: '€350', bg: 'linear-gradient(210deg,#121210 0%,#121210 90%)', name: 'Night & Limited Vis', desc: 'Torch nav, altered marine life, new world', img: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses/night-diving.webp' },
 { id: 'waves-tides-currents', price: '€250', bg: 'linear-gradient(210deg,#121210 0%,#121210 90%)', name: 'Waves, Tides & Currents', desc: 'Essential for Formigas — read the current', img: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses/waves-tides-currents.webp' },
 { id: 'wreck-diving', price: '€250', bg: 'linear-gradient(210deg,#121210 0%,#121210 90%)', name: 'Wreck Diving', desc: 'Dori & beyond · non-penetration & safety skills', img: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses/wreck-diving.webp' },
 { id: 'navigation', price: '€260', bg: 'linear-gradient(210deg,#121210 0%,#121210 90%)', name: 'Navigation', desc: 'Compass mastery & natural reference points', img: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses/navigation.webp' },
 { id: 'photo-video', price: '€200', bg: 'linear-gradient(210deg,#121210 0%,#121210 90%)', name: 'Photo & Video', desc: 'Camera, lighting, composition — capture the underwater world', img: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses/photo-video.webp' },
 { id: 'computer-diving', price: '€170', bg: 'linear-gradient(210deg,#121210 0%,#121210 90%)', name: 'Computer Diving', desc: 'Master your dive computer — plan and log dives safely', img: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses/computer-diving.webp' },
 { id: 'boat-diving', price: '€250', bg: 'linear-gradient(210deg,#121210 0%,#121210 90%)', name: 'Boat Diving', desc: 'Entries, exits, etiquette — get the most from every boat trip', img: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses/boat-diving.webp' },
 { id: 'offshore-prep', price: '€160', bg: 'linear-gradient(210deg,#121210 0%,#121210 90%)', name: 'Offshore Prep', desc: 'SMB · drift entry · current reading — our signature programme for Atlantic offshore diving, developed for these waters', local: 'AZORES EXCLUSIVE' },
]

const PRO_COURSES = [
 { id: 'react-right', price: '€180', bg: 'linear-gradient(210deg,#121210 0%,#070211 90%)', name: 'React Right', desc: 'SSI first aid & CPR — prerequisite for Rescue', img: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses/react-right.webp' },
 { id: 'stress-rescue', price: '€360', bg: 'linear-gradient(210deg,#121210 0%,#060311 90%)', name: 'Stress & Rescue', desc: 'Full rescue incl. React Right — the best course most divers ever take', img: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses/stress-rescue.webp' },
 { id: 'science-diving', price: '€250', bg: 'linear-gradient(210deg,#121210 0%,#080213 90%)', name: 'Science of Diving', desc: 'Physics, physiology & the theory behind the manual', img: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses/science-diving.webp' },
 { id: 'dive-guide', price: '€680', bg: 'linear-gradient(210deg,#121210 0%,#05020e 90%)', name: 'Dive Guide', desc: 'Lead certified divers — first professional rating', img: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses/dive-guide.webp' },
 { id: 'divemaster', price: '€950', bg: 'linear-gradient(210deg,#121210 0%,#080312 90%)', name: 'Divemaster', desc: "SSI's top pro rating — includes Science of Diving", img: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses/divemaster.webp' },
]

const ECOLOGY_COURSES = [
 { id: 'blue-oceans', price: '€150', bg: 'linear-gradient(210deg,#121210 0%,#121210 90%)', name: 'Blue Oceans', desc: 'Ocean conservation · sustainability · citizen science', img: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses/blue-oceans.webp' },
 { id: 'manta-ray-ecology', price: '€150', bg: 'linear-gradient(210deg,#121210 0%,#121210 90%)', name: 'Manta & Ray Ecology', desc: 'Biology, behaviour & ID of rays and mantas', img: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses/manta-ray-ecology.webp' },
 { id: 'marine-invertebrate-ecology', price: '€150', bg: 'linear-gradient(210deg,#121210 0%,#121210 90%)', name: 'Marine Invertebrate Ecology', desc: 'Echinoderms, mollusks, crustaceans — life without a spine', img: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses/marine-invertebrate-ecology.webp' },
 { id: 'marine-mammal-ecology', price: '€150', bg: 'linear-gradient(210deg,#121210 0%,#121210 90%)', name: 'Marine Mammal Ecology', desc: 'Dolphins, whales & cetacean biology', img: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses/marine-mammal-ecology.webp' },
 { id: 'nudibranch-ecology', price: '€150', bg: 'linear-gradient(210deg,#3a0f40 0%,#150620 90%)', name: 'Nudibranch Ecology', desc: 'Spot, ID and understand the most colourful slugs on the reef', img: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses/nudibranch-ecology.webp' },
 { id: 'fish-identification', price: '€170', bg: 'linear-gradient(210deg,#121210 0%,#121210 90%)', name: 'Fish Identification', desc: 'Name the locals — Atlantic reef fish ID', img: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses/fish-identification.webp' },
 { id: 'coral-identification', price: '€150', bg: 'linear-gradient(210deg,#0f3a30 0%,#04180e 90%)', name: 'Coral Identification', desc: 'Identify corals, sponges and reef structures', img: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses/coral-identification.webp' },
]

const COURSE_DESC_KEY: Record<string, keyof typeof T> = {
 'basic-diver': 'cdisc_basic_diver',
 'scuba-diver': 'cdisc_scuba_diver',
 'open-water-diver': 'cdisc_open_water_diver',
 'skills-update': 'cdisc_skills_update',
 'ssi-explorers': 'cdisc_ssi_explorers',
 'upgrade-owd': 'cdisc_upgrade_owd',
 'advanced-open-water-diver': 'cdisc_advanced_open_water_diver',
 'deep-diving': 'cdisc_deep_diving',
 'perfect-buoyancy': 'cdisc_perfect_buoyancy',
 'night-diving': 'cdisc_night_diving',
 'waves-tides-currents': 'cdisc_waves_tides_currents',
 'wreck-diving': 'cdisc_wreck_diving',
 'navigation': 'cdisc_navigation',
 'photo-video': 'cdisc_photo_video',
 'computer-diving': 'cdisc_computer_diving',
 'boat-diving': 'cdisc_boat_diving',
 'offshore-prep': 'cdisc_offshore_prep',
 'react-right': 'cdisc_react_right',
 'stress-rescue': 'cdisc_stress_rescue',
 'science-diving': 'cdisc_science_diving',
 'dive-guide': 'cdisc_dive_guide',
 'divemaster': 'cdisc_divemaster',
 'blue-oceans': 'cdisc_blue_oceans',
 'manta-ray-ecology': 'cdisc_manta_ray_ecology',
 'marine-invertebrate-ecology': 'cdisc_marine_invertebrate_ecology',
 'marine-mammal-ecology': 'cdisc_marine_mammal_ecology',
 'nudibranch-ecology': 'cdisc_nudibranch_ecology',
 'fish-identification': 'cdisc_fish_identification',
 'coral-identification': 'cdisc_coral_identification',
}

function translateCourseList<C extends { id?: string; price: string; bg: string; name: string; desc: string; local?: boolean | string; img?: string }>(courses: C[], lang: Lang, localBadge: string): (Omit<C, 'local'> & { local?: boolean | string })[] {
 return courses.map(c => ({
 ...c,
 desc: c.id && COURSE_DESC_KEY[c.id] ? T[COURSE_DESC_KEY[c.id]][lang] : c.desc,
 local: c.local ? localBadge : undefined,
 }))
}

function CourseCard({ course, color = '#b7c4b0', onClick, lang = 'EN' }: { course: { id?: string; price: string; bg: string; name: string; desc: string; local?: boolean | string; img?: string }; color?: string; onClick?: () => void; lang?: Lang }) {
 const [hovered, setHovered] = useState(false)
 return (
 <div
 onClick={onClick}
 onMouseEnter={() => setHovered(true)}
 onMouseLeave={() => setHovered(false)}
 style={{
 minWidth: '220px', maxWidth: '240px', borderRadius: 0,
 display: 'flex', flexDirection: 'column',
 border: hovered ? '1px solid rgba(243,239,230,.45)' : '1px solid rgba(255,255,255,.07)',
 flexShrink: 0, scrollSnapAlign: 'start', cursor: 'pointer',
 transform: hovered ? 'translateY(-3px)' : 'none',
 transition: 'transform .18s ease, border-color .18s ease, box-shadow .18s ease',
 boxShadow: hovered ? '0 8px 32px rgba(0,0,0,.45)' : 'none',
 background: '#121210', overflow: 'hidden',
 }}>
 <div style={{ height: '155px', position: 'relative', flexShrink: 0, overflow: 'hidden' }}>
 {course.img ? (
 <img src={course.img} alt={course.name} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', display: 'block' }} />
 ) : (
 <div style={{ width: '100%', height: '100%', background: course.bg }} />
 )}
 <span style={{ position: 'absolute', bottom: '11px', right: '11px', zIndex: 2, fontSize: '14px', fontWeight: 500, color, background: 'rgba(9,9,9,.72)', padding: '4px 9px', borderRadius: 0, backdropFilter: 'blur(6px)' }}>{course.price}</span>
 {course.local && (
 <span style={{ position: 'absolute', bottom: '10px', left: '10px', zIndex: 2, fontSize: '14px', fontWeight: 500, color: '#c9b48a', background: 'rgba(255,200,80,.18)', padding: '2px 7px', borderRadius: 0, letterSpacing: '.08em', backdropFilter: 'blur(4px)' }}>{typeof course.local === 'string' ? course.local : T.badge_local_ssi[lang]}</span>
 )}
 </div>
 <div style={{ padding: '14px 16px 16px', flex: 1 }}>
 <h4 style={{ fontSize: '15px', fontWeight: 500, color: '#f3efe6', marginBottom: '5px', lineHeight: 1.2, margin: '0 0 5px' }}>{course.name}</h4>
 <p style={{ fontSize: '14px', color: '#c9c2b6', lineHeight: 1.5, margin: 0 }}>{course.desc}</p>
 </div>
 </div>
 )
}

function CourseRow({ label, color, subtext, courses, cardColor, onCourseClick, lang = 'EN' }: { label: string; color: string; subtext?: string; courses: { id?: string; price: string; bg: string; name: string; desc: string; color?: string; local?: boolean | string; img?: string }[]; cardColor: string; onCourseClick?: (id: string) => void; lang?: Lang }) {
 const ref = useRef<HTMLDivElement>(null)
 const scroll = (dir: 1 | -1) => {
 if (ref.current) ref.current.scrollBy({ left: dir * 244, behavior: 'smooth' })
 }
 const arrowStyle: React.CSSProperties = {
 width: '32px', height: '32px', borderRadius: '50%', border: '1px solid rgba(255,255,255,.12)',
 background: 'rgba(255,255,255,.05)', color: '#f3efe6', fontSize: '16px', cursor: 'pointer',
 display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
 userSelect: 'none', transition: 'background .15s',
 }
 return (
 <div style={{ marginBottom: '34px' }}>
 <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: subtext ? '6px' : '14px', gap: '16px' }}>
 <div>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color, marginBottom: subtext ? '5px' : '0' }}>{label}</div>
 {subtext && <div style={{ fontSize: '14px', color: '#c9c2b6', lineHeight: 1.55, maxWidth: '520px' }}>{subtext}</div>}
 </div>
 <div style={{ display: 'flex', gap: '8px', flexShrink: 0, marginTop: '2px' }}>
 <div style={arrowStyle} onClick={() => scroll(-1)}
 onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,.12)')}
 onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,.05)')}>‹</div>
 <div style={arrowStyle} onClick={() => scroll(1)}
 onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,.12)')}
 onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,.05)')}>›</div>
 </div>
 </div>
 {subtext && <div style={{ marginBottom: '12px' }} />}
 <div ref={ref} style={{
 display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '10px',
 scrollbarWidth: 'none', scrollSnapType: 'x mandatory',
 WebkitOverflowScrolling: 'touch' as React.CSSProperties['WebkitOverflowScrolling'],
 }}>
 {courses.map(c => (
 <CourseCard
 key={c.name}
 course={c}
 color={cardColor}
 onClick={c.id && onCourseClick ? () => onCourseClick(c.id!) : undefined}
 lang={lang}
 />
 ))}
 </div>
 </div>
 )
}

export function PageCourses({ lang, nav }: { lang: Lang; nav: (p: string) => void }) {
 const t = (key: keyof typeof T) => T[key][lang]
 const isMobile = useIsMobile()
 const localBadge = t('badge_local_ssi')
 const tEntry = translateCourseList(ENTRY_COURSES, lang, localBadge)
 const tSpecialty = translateCourseList(SPECIALTY_COURSES, lang, localBadge)
 const tEcology = translateCourseList(ECOLOGY_COURSES, lang, localBadge)
 const tPro = translateCourseList(PRO_COURSES, lang, localBadge)
 const handleCourseClick = (id: string) => { window.location.href = '/courses/' + id }
 return (
 <div style={{ padding: isMobile ? '32px 20px 40px' : '60px 48px 50px' }}>
 <Breadcrumb label={t('bc_courses')} homeLabel={t('bc_home')} goHome={() => nav('home')} />
 <h1 style={{ fontSize: 'clamp(28px,4vw,44px)', fontWeight: 500, letterSpacing: '-0.02em', marginBottom: '8px' }}>
 {t('courses_h1')}<span style={{ color: s.accent }}>.</span>
 </h1>
 <p style={{ color: '#f3efe6', fontSize: '17px', maxWidth: '600px', lineHeight: 1.65, marginBottom: '8px' }}>
 {t('courses_intro')}
 </p>
 <p style={{ color: s.muted, fontSize: '14px', maxWidth: '600px', lineHeight: 1.6, marginBottom: '38px' }}>
 {t('courses_tap_hint')}
 </p>
 <CourseRow label={t('courses_entry_label')} color="#b7c4b0" subtext={t('courses_entry_sub')} courses={tEntry} cardColor="#b7c4b0" onCourseClick={handleCourseClick} lang={lang} />
 <CourseRow label={t('courses_specialty_label')} color={s.accent} subtext={t('courses_specialty_sub')} courses={tSpecialty} cardColor={s.accent} onCourseClick={handleCourseClick} lang={lang} />
 <CourseRow label={t('courses_ecology_label')} color="#b7c4b0" subtext={t('courses_ecology_sub')} courses={tEcology} cardColor="#b7c4b0" onCourseClick={handleCourseClick} lang={lang} />
 <CourseRow label={t('courses_pro_label')} color="#c9c2b6" subtext={t('courses_pro_sub')} courses={tPro} cardColor="#c9c2b6" onCourseClick={handleCourseClick} lang={lang} />
 <a href='/book' onClick={() => fireEvent('booking_click')} style={bookBtnStyle}>{t('nav_book_now')}</a>
 </div>
 )
}
