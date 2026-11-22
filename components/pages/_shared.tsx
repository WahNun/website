'use client'
import React from 'react'
import { createClient } from '@/utils/supabase/client'

export const supabase = createClient()

export type Lang = 'EN' | 'PT' | 'DE' | 'ES'

export const T = {
 // Nav
 nav_home: { EN: 'Home', PT: 'Início', DE: 'Start', ES: 'Inicio' },
 nav_diving: { EN: 'Diving', PT: 'Mergulho', DE: 'Tauchen', ES: 'Buceo' },
 nav_beginners: { EN: 'Beginners', PT: 'Iniciantes', DE: 'Anfänger', ES: 'Principiantes' },
 nav_courses: { EN: 'Courses', PT: 'Cursos', DE: 'Kurse', ES: 'Cursos' },
 nav_sites: { EN: 'Dive Sites', PT: 'Pontos de Mergulho', DE: 'Tauchplätze', ES: 'Puntos de Buceo' },
 nav_offshore: { EN: 'Offshore', PT: 'Offshore', DE: 'Offshore', ES: 'Offshore' },
 nav_team: { EN: 'Team', PT: 'Equipa', DE: 'Team', ES: 'Equipo' },
 nav_contact: { EN: 'Contact', PT: 'Contacto', DE: 'Kontakt', ES: 'Contacto' },
 nav_book_now: { EN: 'Book now', PT: 'Reservar', DE: 'Jetzt buchen', ES: 'Reservar' },
 nav_member_area: { EN: 'Member Area', PT: 'Área Privada', DE: 'Mitgliederbereich', ES: 'Área de miembros' },

 // Hero
 hero_h1_seo: { EN: 'Scuba Diving in the Azores', PT: 'Mergulho nos Açores', DE: 'Tauchen auf den Azoren', ES: 'Buceo en las Azores' },
 hero_h1: { EN: 'Dive the wild heart of the Atlantic', PT: 'Mergulhe no coração selvagem do Atlântico', DE: 'Tauche ins wilde Herz des Atlantiks', ES: 'Sumérgete en el corazón salvaje del Atlántico' },
 hero_subtitle: { EN: "Morning & afternoon double dives, the legendary Dori wreck and offshore expeditions to Formigas — with São Miguel's SSI & Mares dive center.", PT: 'Mergulhos duplos de manhã e tarde, o lendário naufrágio Dori e expedições offshore às Formigas — com o centro de mergulho SSI & Mares de São Miguel.', DE: 'Doppeltauchgänge morgens und nachmittags, das legendäre Wrack Dori und Offshore-Expeditionen zu den Formigas — mit São Miguels SSI & Mares Tauchzentrum.', ES: 'Inmersiones dobles por la mañana y tarde, el legendario naufragio Dori y expediciones offshore a las Formigas — con el centro de buceo SSI & Mares de São Miguel.' },
 hero_cta_book: { EN: 'Book your dive — live availability', PT: 'Reservar mergulho — disponibilidade em tempo real', DE: 'Tauchgang buchen — Live-Verfügbarkeit', ES: 'Reservar inmersión — disponibilidad en vivo' },
 hero_cta_beginners: { EN: 'New to diving? Beginners ', PT: 'Nunca mergulhou? Iniciantes ', DE: 'Noch nie getaucht? Anfänger ', ES: '¿Nuevo en el buceo? Principiantes ' },

 // Trustbar
 trust_reviews: { EN: '183 TripAdvisor reviews', PT: '183 avaliações no TripAdvisor', DE: '183 TripAdvisor-Bewertungen', ES: '183 reseñas en TripAdvisor' },
 trust_ratio: { EN: 'guide-to-diver ratio', PT: 'rácio guia por mergulhador', DE: 'Verhältnis Guide zu Taucher', ES: 'ratio guía por buceador' },
 trust_visibility: { EN: 'visibility, 18–24 °C', PT: 'visibilidade, 18–24 °C', DE: 'Sicht, 18–24 °C', ES: 'visibilidad, 18–24 °C' },

 // Section headings
 sec_choose_adventure: { EN: 'Choose your adventure', PT: 'Escolha a sua aventura', DE: 'Wähle dein Abenteuer', ES: 'Elige tu aventura' },
 sec_daily_dives: { EN: 'Daily Dives ', PT: 'Mergulhos Diários ', DE: 'Tägliche Tauchgänge ', ES: 'Inmersiones Diarias ' },
 sec_dive_sites: { EN: 'Signature dive sites', PT: 'Pontos de mergulho de eleição', DE: 'Unsere Tauchplätze', ES: 'Puntos de buceo emblemáticos' },
 sec_explore_sites: { EN: 'Explore all sites ', PT: 'Explorar todos os pontos ', DE: 'Alle Tauchplätze ', ES: 'Explorar todos los puntos ' },
 sec_get_certified: { EN: 'Get certified — your way', PT: 'Obtenha a sua certificação — ao seu ritmo', DE: 'Zertifizierung — ganz nach dir', ES: 'Certifícate — a tu manera' },
 sec_all_courses: { EN: 'All courses ', PT: 'Todos os cursos ', DE: 'Alle Kurse ', ES: 'Todos los cursos ' },
 sec_ocean_waiting: { EN: 'The ocean is waiting', PT: 'O oceano espera', DE: 'Der Ozean wartet', ES: 'El océano te espera' },
 sec_ocean_sub: { EN: 'Live availability, instant confirmation, free cancellation up to 72 h.', PT: 'Disponibilidade em tempo real, confirmação imediata, cancelamento gratuito até 72h.', DE: 'Live-Verfügbarkeit, Sofortbestätigung, kostenlose Stornierung bis 72 Std.', ES: 'Disponibilidad en vivo, confirmación inmediata, cancelación gratuita hasta 72h.' },
 sec_check_avail: { EN: 'Check availability', PT: 'Ver disponibilidade', DE: 'Verfügbarkeit prüfen', ES: 'Consultar disponibilidad' },
 sec_faq_heading: { EN: 'Frequently asked questions', PT: 'Perguntas frequentes', DE: 'Häufig gestellte Fragen', ES: 'Preguntas frecuentes' },
 sec_faq_sub: { EN: 'Not finding your answer? We are at the marina every day — just reach out.', PT: 'Não encontra a resposta? Estamos na marina todos os dias — fale connosco.', DE: 'Antwort nicht gefunden? Wir sind täglich an der Marina — sprich uns an.', ES: '¿No encuentra la respuesta? Estamos en el puerto todos los días — contáctenos.' },

 // FAQ special needs callout
 faq_special_title: { EN: 'Medical conditions, special needs, or a question you are not sure how to ask?', PT: 'Condições médicas, necessidades especiais ou uma pergunta que não sabe como formular?', DE: 'Gesundheitliche Einschränkungen, besondere Bedürfnisse oder eine Frage, bei der du nicht weißt, wie du sie stellen sollst?', ES: '¿Condiciones médicas, necesidades especiales o una pregunta que no sabe cómo formular?' },
 faq_special_body: { EN: 'We have dived with guests with depth restrictions, heart conditions, sensory differences, and more. Please reach out before booking — there is nothing too sensitive to ask, and we will always do our best to make it work. The ocean is for everyone.', PT: 'Já mergulhámos com hóspedes com restrições de profundidade, condições cardíacas, diferenças sensoriais e muito mais. Entre em contacto antes de reservar — não há nenhuma pergunta demasiado sensível, e faremos sempre o nosso melhor para que funcione. O oceano é para todos.', DE: 'Wir haben mit Gästen mit Tiefenbeschränkungen, Herzerkrankungen, sensorischen Unterschieden und mehr getaucht. Bitte melde dich vor der Buchung — keine Frage ist zu heikel, und wir geben immer unser Bestes, damit es klappt. Der Ozean gehört allen.', ES: 'Hemos buceado con huéspedes con restricciones de profundidad, condiciones cardíacas, diferencias sensoriales y más. Contáctenos antes de reservar — no hay pregunta demasiado delicada, y siempre haremos lo mejor para que funcione. El océano es para todos.' },

 // FAQ categories
 faq_cat_booking: { EN: 'Booking & Prices', PT: 'Reservas & Preços', DE: 'Buchung & Preise', ES: 'Reservas & Precios' },
 faq_cat_dives: { EN: 'The Dives', PT: 'Os Mergulhos', DE: 'Die Tauchgänge', ES: 'Las Inmersiones' },
 faq_cat_marine: { EN: 'Marine Life', PT: 'Vida Marinha', DE: 'Meeresleben', ES: 'Vida Marina' },
 faq_cat_equipment: { EN: 'Equipment & On the Day', PT: 'Equipamento & No Dia', DE: 'Ausrüstung & Am Tag', ES: 'Equipo & El día del buceo' },
 faq_cat_special: { EN: 'Special Needs & Medical', PT: 'Necessidades Especiais & Médicas', DE: 'Besondere Bedürfnisse & Medizin', ES: 'Necesidades Especiales & Médicas' },

 // CARDS (adventure cards)
 card_dd_tag: { EN: 'Most popular', PT: 'Mais popular', DE: 'Am beliebtesten', ES: 'Más popular' },
 card_dd_desc: { EN: 'Two guided boat dives — morning (8:00–13:00) or afternoon (14:00–19:00) session, refreshments during the surface interval. Certified divers.', PT: 'Dois mergulhos guiados de barco — sessão de manhã (8:00–13:00) ou tarde (14:00–19:00), bebidas durante o intervalo de superfície. Mergulhadores certificados.', DE: 'Zwei geführte Bootstauchgänge — Morgen- (8:00–13:00) oder Nachmittagssession (14:00–19:00), Erfrischungen in der Oberflächenpause. Zertifizierte Taucher.', ES: 'Dos inmersiones guiadas en barco — sesión de mañana (8:00–13:00) o tarde (14:00–19:00), refrescos durante el intervalo en superficie. Buceadores certificados.' },
 card_bd_tag: { EN: 'No license needed', PT: 'Sem licença necessária', DE: 'Kein Schein erforderlich', ES: 'Sin licencia necesaria' },
 card_bd_desc: { EN: 'Your first breath underwater — pool session, then a real harbour dive. SSI certification included.', PT: 'A sua primeira respiração debaixo de água — sessão na piscina, depois um mergulho real no porto. Certificação SSI incluída.', DE: 'Dein erster Atemzug unter Wasser — Poolsession, dann ein echter Hafentauchgang. SSI-Zertifizierung inklusive.', ES: 'Tu primer aliento bajo el agua — sesión en piscina, luego una inmersión real en el puerto. Certificación SSI incluida.' },
 card_exp_tag: { EN: 'Expedition — Join the list', PT: 'Expedição — Junte-se à lista', DE: 'Expedition — Auf die Liste', ES: 'Expedición — Únete a la lista' },
 card_exp_desc: { EN: 'Full-day trip to the Formigas & Dollabarat reserve, 42 nm offshore. Mantas, mobulas, big pelagics. Never guaranteed — weather decides.', PT: 'Viagem de dia inteiro à reserva de Formigas & Dollabarat, 42 nm offshore. Mantas, mobulas, grandes pelágicos. Apenas avançados. Nunca garantido — o tempo decide.', DE: 'Ganztagesausflug zum Formigas & Dollabarat-Reservat, 42 nm offshore. Mantas, Mobulas, große Pelagische. Nur für Fortgeschrittene. Nie garantiert — das Wetter entscheidet.', ES: 'Excursión de día completo a la reserva Formigas & Dollabarat, 42 nm offshore. Mantas, mobulas, grandes pelágicos. Solo avanzados. Nunca garantizado — el tiempo decide.' },
 card_owd_tag: { EN: 'Get certified', PT: 'Obtenha certificação', DE: 'Zertifizierung', ES: 'Certifícate' },
 card_owd_desc: { EN: 'From zero to certified diver in four days — SSI, digital theory at home. Pool and 4 ocean dives with us.', PT: 'Do zero a mergulhador certificado em quatro dias — SSI, teoria digital em casa. Piscina e 4 mergulhos no oceano connosco.', DE: 'Von null zum zertifizierten Taucher in vier Tagen — SSI, digitale Theorie zu Hause. Pool und 4 Ozean-Tauchgänge mit uns.', ES: 'De cero a buceador certificado en cuatro días — SSI, teoría digital en casa. Piscina y 4 inmersiones en el océano con nosotros.' },
 card_cta_book: { EN: 'Book ', PT: 'Reservar ', DE: 'Buchen ', ES: 'Reservar ' },
 card_cta_join: { EN: 'Join the list ', PT: 'Entrar na lista ', DE: 'Auf die Liste ', ES: 'Unirse a la lista ' },
 card_weather_label: { EN: 'Weather dependent:', PT: 'Dependente do tempo:', DE: 'Wetterabhängig:', ES: 'Dependiente del clima:' },
 card_weather: { EN: 'Weather dependent: departures confirmed individually in safe windows only. Unsafe conditions = free reschedule or refund.', PT: 'Dependente do tempo: as partidas são confirmadas individualmente apenas em janelas seguras. Condições inseguras = reagendamento gratuito ou reembolso.', DE: 'Wetterabhängig: Abfahrten werden individuell nur bei sicheren Fenstern bestätigt. Unsichere Bedingungen = kostenlose Umbuchung oder Rückerstattung.', ES: 'Dependiente del clima: las salidas se confirman individualmente solo en ventanas seguras. Condiciones inseguras = reprogramación gratuita o reembolso.' },

 // SSI Courses section on home
 home_ssi_label: { EN: 'SSI DIVE CENTER · TRAINING', PT: 'CENTRO SSI · FORMAÇÃO', DE: 'SSI TAUCHZENTRUM · AUSBILDUNG', ES: 'CENTRO SSI · FORMACIÓN' },
 home_ssi_title: { EN: 'SSI Courses', PT: 'Cursos SSI', DE: 'SSI-Kurse', ES: 'Cursos SSI' },
 home_ssi_desc: { EN: 'Flexible digital learning with SSI — theory at home, ocean with us. From first breath to professional levels.', PT: 'Aprendizagem digital flexível com a SSI — teoria em casa, oceano connosco. Do primeiro respiração a níveis profissionais.', DE: 'Flexibles digitales Lernen mit SSI — Theorie zu Hause, Ozean mit uns. Vom ersten Atemzug bis zur Profi-Ebene.', ES: 'Aprendizaje digital flexible con SSI — teoría en casa, océano con nosotros. Desde el primer aliento hasta niveles profesionales.' },
 home_mares_label: { EN: 'MARES · EQUIPMENT PARTNER', PT: 'MARES · PARCEIRO DE EQUIPAMENTO', DE: 'MARES · AUSRÜSTUNGSPARTNER', ES: 'MARES · SOCIO DE EQUIPAMIENTO' },
 home_mares_title: { EN: 'Mares Equipped', PT: 'Equipado com Mares', DE: 'Mit Mares ausgestattet', ES: 'Equipado con Mares' },
 home_mares_desc: { EN: 'A modern Mares rental fleet, serviced in-house — plus the essentials for sale at our marina base.', PT: 'Uma frota de aluguer Mares moderna, com manutenção interna — mais os essenciais à venda na nossa base na marina.', DE: 'Eine moderne Mares-Mietflotte, hauseigen gewartet — plus das Wesentliche zum Kauf an unserer Marinabasis.', ES: 'Una flota de alquiler Mares moderna, mantenida internamente — más lo esencial a la venta en nuestra base en la marina.' },

 // Footer
 footer_contact: { EN: 'Contact', PT: 'Contacto', DE: 'Kontakt', ES: 'Contacto' },
 footer_instagram: { EN: 'Follow on Instagram ', PT: 'Seguir no Instagram ', DE: 'Auf Instagram folgen ', ES: 'Seguir en Instagram ' },
 footer_hours: { EN: 'Hours', PT: 'Horário', DE: 'Öffnungszeiten', ES: 'Horario' },
 footer_hours_weekday: { EN: 'Daily 8:00–20:00', PT: 'Todos os dias 8:00–20:00', DE: 'Täglich 8:00–20:00', ES: 'Diariamente 8:00–20:00' },
 footer_hours_weekend: { EN: 'Daily 8:00–20:00', PT: 'Todos os dias 8:00–20:00', DE: 'Täglich 8:00–20:00', ES: 'Diariamente 8:00–20:00' },
 footer_explore: { EN: 'Explore', PT: 'Explorar', DE: 'Entdecken', ES: 'Explorar' },
 footer_nav_dives: { EN: 'Dives', PT: 'Mergulhos', DE: 'Tauchen', ES: 'Buceo' },

 // Breadcrumbs / page titles
 bc_home: { EN: 'Home', PT: 'Início', DE: 'Start', ES: 'Inicio' },
 bc_dives: { EN: 'Diving', PT: 'Mergulho', DE: 'Tauchen', ES: 'Buceo' },
 bc_basicdiver: { EN: 'Basic Diver', PT: 'Basic Diver', DE: 'Basic Diver', ES: 'Basic Diver' },
 bc_courses: { EN: 'Courses', PT: 'Cursos', DE: 'Kurse', ES: 'Cursos' },
 bc_sites: { EN: 'Dive Sites', PT: 'Pontos de Mergulho', DE: 'Tauchplätze', ES: 'Puntos de Buceo' },
 bc_formigas: { EN: 'Formigas', PT: 'Formigas', DE: 'Formigas', ES: 'Formigas' },
 bc_team: { EN: 'Team', PT: 'Equipa', DE: 'Team', ES: 'Equipo' },
 bc_contact: { EN: 'Contact', PT: 'Contacto', DE: 'Kontakt', ES: 'Contacto' },

 // PageDives
 dives_hero_tag: { EN: 'SSI · MARES DIVE CENTER', PT: 'SSI · CENTRO DE MERGULHO MARES', DE: 'SSI · MARES TAUCHZENTRUM', ES: 'SSI · CENTRO DE BUCEO MARES' },
 dives_hero_h1: { EN: 'Diving', PT: 'Mergulho', DE: 'Tauchen', ES: 'Buceo' },
 dives_hero_sub: { EN: 'Two dives. One morning or afternoon. The Atlantic on your doorstep.', PT: 'Dois mergulhos. Uma manhã ou tarde. O Atlântico à sua porta.', DE: 'Zwei Tauchgänge. Morgens oder nachmittags. Der Atlantik vor deiner Tür.', ES: 'Dos inmersiones. Una mañana o tarde. El Atlántico a tu puerta.' },
 dives_schedule_title: { EN: 'Daily schedule', PT: 'Horário diário', DE: 'Tagesplan', ES: 'Horario diario' },
 dives_what_incl: { EN: "What's included", PT: 'O que está incluído', DE: 'Was ist inbegriffen', ES: 'Qué está incluido' },
 dives_requirements: { EN: 'Requirements', PT: 'Requisitos', DE: 'Anforderungen', ES: 'Requisitos' },
 dives_packages: { EN: 'Dive packages', PT: 'Pacotes de mergulho', DE: 'Tauchpakete', ES: 'Paquetes de buceo' },
 dives_add_ons: { EN: 'Add-ons', PT: 'Extras', DE: 'Extras', ES: 'Extras' },
 dives_sites_title: { EN: 'Where we dive', PT: 'Onde mergulhamos', DE: 'Wo wir tauchen', ES: 'Dónde buceamos' },
 dives_book_btn: { EN: 'Book now', PT: 'Reservar agora', DE: 'Jetzt buchen', ES: 'Reservar ahora' },

 // PageBasicDiver
 bd_hero_tag: { EN: 'No certification needed · Min. age 10 · SSI ISO 11121', PT: 'Sem certificação necessária · Idade mín. 10 · SSI ISO 11121', DE: 'Keine Zertifizierung erforderlich · Mindestalter 10 · SSI ISO 11121', ES: 'Sin certificación necesaria · Edad mín. 10 · SSI ISO 11121' },
 bd_hero_sub: { EN: 'Your first real dive — with an official SSI certification to take home.', PT: 'O seu primeiro mergulho real — com uma certificação SSI oficial para levar para casa.', DE: 'Dein erster echter Tauchgang — mit einer offiziellen SSI-Zertifizierung zum Mitnehmen.', ES: 'Tu primera inmersión real — con una certificación SSI oficial para llevar a casa.' },
 bd_intro_p1: { EN: "No experience. No certification. No problem — and this time you leave with an official SSI card. The Basic Diver programme is a half-day introduction to scuba diving: a confined water skills session in the marina seawater pool, followed by a guided dive in the calm harbour basin of Ponta Delgada. Your personal SSI instructor stays by your side the entire time.", PT: "Sem experiência. Sem certificação. Sem problema — e desta vez sai com um cartão SSI oficial. O programa Basic Diver é uma introdução de meio dia ao mergulho: uma sessão de competências em águas confinadas na piscina de água salgada da marina, seguida de um mergulho guiado na bacia portuária calma de Ponta Delgada. O seu instrutor SSI pessoal fica ao seu lado durante todo o tempo.", DE: "Keine Erfahrung. Keine Zertifizierung. Kein Problem — und diesmal nimmst du eine offizielle SSI-Karte mit. Das Basic Diver-Programm ist eine Halbtagseinführung ins Tauchen: eine Übungseinheit im geschützten Meerwasserpool der Marina, gefolgt von einem geführten Tauchgang im ruhigen Hafenbecken von Ponta Delgada. Dein persönlicher SSI-Instruktor bleibt die gesamte Zeit an deiner Seite.", ES: "Sin experiencia. Sin certificación. Sin problema — y esta vez sales con una tarjeta SSI oficial. El programa Basic Diver es una introducción de medio día al buceo: una sesión de habilidades en aguas confinadas en la piscina de agua de mar de la marina, seguida de una inmersión guiada en la tranquila dársena del puerto de Ponta Delgada. Tu instructor SSI personal permanece a tu lado todo el tiempo." },
 bd_what_expect: { EN: 'What to expect', PT: 'O que esperar', DE: 'Was dich erwartet', ES: 'Qué esperar' },
 bd_requirements_title: { EN: 'Requirements', PT: 'Requisitos', DE: 'Anforderungen', ES: 'Requisitos' },
 bd_requirements_body: { EN: 'None — minimum age 10. Just be comfortable in water. No prior diving or swimming certificate required.', PT: 'Nenhum — idade mínima 10 anos. Basta estar confortável na água. Não é necessário diploma de natação ou mergulho anterior.', DE: 'Keine — Mindestalter 10. Einfach im Wasser wohlfühlen. Kein vorheriges Tauch- oder Schwimmzeugnis erforderlich.', ES: 'Ninguno — edad mínima 10 años. Solo estar cómodo en el agua. No se requiere certificado de natación o buceo previo.' },
 bd_included_title: { EN: "What's Included", PT: 'O que está incluído', DE: 'Was ist inbegriffen', ES: 'Qué está incluido' },
 bd_pricing_title: { EN: 'Pricing', PT: 'Preços', DE: 'Preise', ES: 'Precios' },
 bd_go_further_title: { EN: 'Want to go further?', PT: 'Quer ir mais longe?', DE: 'Möchtest du weitermachen?', ES: '¿Quieres ir más lejos?' },
 bd_go_further_body: { EN: 'Your Basic Diver dive counts toward the full Open Water Diver course — complete it within 6 months and you are already one dive in. Most guests book their OWD the same week.', PT: 'O seu mergulho Basic Diver conta para o curso completo Open Water Diver — conclua-o em 6 meses e já tem um mergulho feito. A maioria dos hóspedes reserva o seu OWD na mesma semana.', DE: 'Dein Basic Diver-Tauchgang zählt für den vollständigen Open Water Diver-Kurs — absolviere ihn innerhalb von 6 Monaten und du bist bereits einen Tauchgang weit. Die meisten Gäste buchen ihren OWD in derselben Woche.', ES: 'Tu inmersión Basic Diver cuenta para el curso completo Open Water Diver — complétalo en 6 meses y ya llevas una inmersión. La mayoría de los huéspedes reservan su OWD la misma semana.' },
 bd_see_courses: { EN: 'See all courses ', PT: 'Ver todos os cursos ', DE: 'Alle Kurse ansehen ', ES: 'Ver todos los cursos ' },
 bd_duration: { EN: 'Duration', PT: 'Duração', DE: 'Dauer', ES: 'Duración' },
 bd_duration_val: { EN: 'Half day (~3 hrs)', PT: 'Meio dia (~3 hrs)', DE: 'Halber Tag (~3 Std.)', ES: 'Medio día (~3 hrs)' },
 bd_setup: { EN: 'Setup', PT: 'Configuração', DE: 'Ablauf', ES: 'Estructura' },
 bd_setup_val: { EN: 'Pool + harbour dive', PT: 'Piscina + mergulho no porto', DE: 'Pool + Hafentauchgang', ES: 'Piscina + inmersión en el puerto' },
 bd_depth: { EN: 'Depth', PT: 'Profundidade', DE: 'Tiefe', ES: 'Profundidad' },
 bd_depth_val: { EN: 'Max 12 m', PT: 'Máx. 12 m', DE: 'Max. 12 m', ES: 'Máx. 12 m' },
 bd_price_label: { EN: 'Price', PT: 'Preço', DE: 'Preis', ES: 'Precio' },

 // PageCourses
 courses_h1: { EN: 'SSI Diving Courses in the Azores', PT: 'Cursos de Mergulho SSI nos Açores', DE: 'SSI-Tauchkurse auf den Azoren', ES: 'Cursos de Buceo SSI en las Azores' },
 courses_intro: { EN: 'All SSI courses — theory at home, ocean with us. Flexible scheduling around your holiday.', PT: 'Todos os cursos SSI — teoria em casa, oceano connosco. Agendamento flexível em função das suas férias.', DE: 'Alle SSI-Kurse — Theorie zu Hause, Ozean mit uns. Flexible Planung rund um deinen Urlaub.', ES: 'Todos los cursos SSI — teoría en casa, océano con nosotros. Programación flexible en torno a tus vacaciones.' },
 courses_entry_label: { EN: 'ENTRY LEVEL — START DIVING', PT: 'NÍVEL DE ENTRADA — COMECE A MERGULHAR', DE: 'EINSTEIGERLEVEL — TAUCHEN BEGINNEN', ES: 'NIVEL INICIAL — EMPIEZA A BUCEAR' },
 courses_specialty_label: { EN: 'SPECIALTY COURSES', PT: 'CURSOS DE ESPECIALIDADE', DE: 'SPEZIALKURSE', ES: 'CURSOS DE ESPECIALIDAD' },
 courses_pro_label: { EN: 'PROFESSIONAL DEVELOPMENT', PT: 'DESENVOLVIMENTO PROFISSIONAL', DE: 'BERUFLICHE ENTWICKLUNG', ES: 'DESARROLLO PROFESIONAL' },
 courses_local_label: { EN: 'LOCAL SSI SPECIALTY COURSES', PT: 'CURSOS DE ESPECIALIDADE SSI LOCAIS', DE: 'LOKALE SSI-SPEZIALKURSE', ES: 'CURSOS DE ESPECIALIDAD SSI LOCALES' },
 courses_local_sub: { EN: 'Custom programmes developed with our own marine biologists — unique to Azores Diving.', PT: 'Programas personalizados desenvolvidos com os nossos próprios biólogos marinhos — exclusivos da Azores Diving.', DE: 'Individuelle Programme entwickelt mit unseren eigenen Meeresbiologen — exklusiv bei Azores Diving.', ES: 'Programas personalizados desarrollados con nuestros propios biólogos marinos — exclusivos de Azores Diving.' },

 // PageSites
 sites_h1: { EN: 'Dive Sites in São Miguel', PT: 'Pontos de Mergulho em São Miguel', DE: 'Tauchplätze auf São Miguel', ES: 'Puntos de Buceo en São Miguel' },
 sites_about_h2: { EN: 'Diving in São Miguel', PT: 'Mergulhar em São Miguel', DE: 'Tauchen auf São Miguel', ES: 'Bucear en São Miguel' },
 sites_about_p: { EN: 'São Miguel is the largest island of the Azores, and its south coast around Ponta Delgada is where we dive year-round. Within 10–30 minutes by boat from the marina you reach volcanic arches like Arco do Espelho and Arco do Cavaco, the Dori wreck — a WWII Liberty ship resting at 12–20 m — and sheltered reefs such as Viteleiro and Arcos da Caloura. Visibility runs 15–30 m in season (June to October), water temperatures 18–24 °C, and the Atlantic brings mobula rays, dusky groupers and amberjacks to the island. Offshore, the Formigas and Dollabarat banks are our expedition sites for experienced divers.', PT: 'São Miguel é a maior ilha dos Açores e a sua costa sul, em torno de Ponta Delgada, é onde mergulhamos durante todo o ano. A 10–30 minutos de barco da marina chega-se a arcos vulcânicos como o Arco do Espelho e o Arco do Cavaco, ao naufrágio Dori — um navio Liberty da II Guerra Mundial a 12–20 m — e a recifes abrigados como o Viteleiro e os Arcos da Caloura. A visibilidade ronda os 15–30 m na época (junho a outubro), a água os 18–24 °C, e o Atlântico traz jamantas, meros e lírios até à ilha. Ao largo, os bancos das Formigas e do Dollabarat são os nossos locais de expedição para mergulhadores experientes.', DE: 'São Miguel ist die größte Insel der Azoren, und an ihrer Südküste rund um Ponta Delgada tauchen wir das ganze Jahr. 10–30 Bootsminuten von der Marina liegen vulkanische Bögen wie Arco do Espelho und Arco do Cavaco, das Dori-Wrack — ein Liberty-Schiff aus dem Zweiten Weltkrieg auf 12–20 m — und geschützte Riffe wie Viteleiro und Arcos da Caloura. Die Sicht liegt in der Saison (Juni bis Oktober) bei 15–30 m, das Wasser bei 18–24 °C, und der Atlantik bringt Mobulas, Zackenbarsche und Bernsteinmakrelen an die Insel. Draußen vor der Küste sind die Formigas- und Dollabarat-Bänke unsere Expeditionsplätze für erfahrene Taucher.', ES: 'São Miguel es la isla más grande de las Azores y su costa sur, alrededor de Ponta Delgada, es donde buceamos todo el año. A 10–30 minutos en barco desde la marina se llega a arcos volcánicos como Arco do Espelho y Arco do Cavaco, al pecio Dori — un buque Liberty de la Segunda Guerra Mundial a 12–20 m — y a arrecifes resguardados como Viteleiro y Arcos da Caloura. La visibilidad ronda los 15–30 m en temporada (junio a octubre), el agua los 18–24 °C, y el Atlántico trae mantas mobula, meros y medregales hasta la isla. Mar adentro, los bancos de Formigas y Dollabarat son nuestros puntos de expedición para buceadores experimentados.' },
 link_sites_sm: { EN: 'See all dive sites in São Miguel ', PT: 'Ver todos os pontos de mergulho em São Miguel ', DE: 'Alle Tauchplätze auf São Miguel ', ES: 'Ver todos los puntos de buceo en São Miguel ' },
 sites_intro: { EN: 'Volcanic arches, the legendary Dori wreck, and the open blue of the Formigas — here is where we dive.', PT: 'Arcos vulcânicos, o lendário naufrágio Dori e o azul aberto das Formigas — é aqui que mergulhamos.', DE: 'Vulkanische Bögen, das legendäre Wrack Dori und das offene Blau der Formigas — hier tauchen wir.', ES: 'Arcos volcánicos, el legendario naufragio Dori y el azul abierto de las Formigas — aquí es donde buceamos.' },
 sites_filter_all: { EN: 'All', PT: 'Todos', DE: 'Alle', ES: 'Todos' },
 sites_filter_south: { EN: 'South Coast', PT: 'Costa Sul', DE: 'Südküste', ES: 'Costa Sur' },
 sites_filter_north: { EN: 'North Coast', PT: 'Costa Norte', DE: 'Nordküste', ES: 'Costa Norte' },
 sites_filter_offshore: { EN: 'Offshore', PT: 'Offshore', DE: 'Offshore', ES: 'Offshore' },
 sites_depth: { EN: 'Depth', PT: 'Profundidade', DE: 'Tiefe', ES: 'Profundidad' },
 sites_type: { EN: 'Type', PT: 'Tipo', DE: 'Typ', ES: 'Tipo' },
 sites_level: { EN: 'Level', PT: 'Nível', DE: 'Level', ES: 'Nivel' },
 sites_marine_life: { EN: 'Marine life', PT: 'Vida marinha', DE: 'Meeresleben', ES: 'Vida marina' },
 sites_book: { EN: 'Book a double dive ', PT: 'Reservar um mergulho duplo ', DE: 'Doppeltauchgang buchen ', ES: 'Reservar una inmersión doble ' },
 sites_dynamic_note: { EN: 'We choose the dive sites on the day, not at booking. Conditions — wind, swell, current, visibility, water temperature — and the group on board decide where the boat goes: with two fresh Open Water divers and an experienced group, we pick a site everyone can enjoy. This site is one of the places we dive, not a guarantee. Tell us your favourite at the marina and we\'ll go there whenever it fits.', PT: 'Escolhemos os pontos de mergulho no próprio dia, não no momento da reserva. As condições — vento, ondulação, corrente, visibilidade, temperatura da água — e o grupo a bordo determinam o rumo do barco: com dois mergulhadores Open Water recentes e um grupo experiente, escolhemos um ponto que todos possam aproveitar. Este ponto é um dos lugares onde mergulhamos, não uma garantia. Diga-nos o seu preferido na marina e iremos sempre que as condições o permitam.', DE: 'Wir wählen die Tauchplätze erst am Tag selbst — nicht bei der Buchung. Die Bedingungen — Wind, Swell, Strömung, Sicht, Wassertemperatur — und die Gruppe an Bord entscheiden, wohin das Boot fährt: Mit zwei frischen Open-Water-Tauchern und einer erfahrenen Gruppe wählen wir einen Platz, den alle genießen können. Dieser Platz ist einer der Orte, an denen wir tauchen — keine Garantie. Sag uns deinen Favoriten an der Marina, und wir fahren dort hin, wann immer es passt.', ES: 'Elegimos los puntos de buceo el día mismo, no en el momento de la reserva. Las condiciones — viento, oleaje, corriente, visibilidad, temperatura del agua — y el grupo a bordo deciden el rumbo del barco: con dos buceadores Open Water recientes y un grupo experimentado, elegimos un punto que todos puedan disfrutar. Este punto es uno de los lugares donde buceamos, no una garantía. Díganos cuál es su favorito en la marina e iremos cuando las condiciones lo permitan.' },

 // PageFormigas
 formigas_h1: { EN: 'Offshore: Formigas & Dollabarat', PT: 'Offshore: Formigas & Dollabarat', DE: 'Offshore: Formigas & Dollabarat', ES: 'Offshore: Formigas & Dollabarat' },
 formigas_tag: { EN: 'EXPEDITION · 42 NM OFFSHORE', PT: 'EXPEDIÇÃO · 42 NM OFFSHORE', DE: 'EXPEDITION · 42 NM OFFSHORE', ES: 'EXPEDICIÓN · 42 NM OFFSHORE' },
 formigas_intro: { EN: 'The marquee trip of the Azores dive scene — a full-day crossing to the Formigas Banks and Dollabarat seamount, 42 nautical miles east of São Miguel. Devil rays, manta rays, silky sharks, and more pelagics than anywhere else in the Mid-Atlantic.', PT: 'A viagem principal da cena de mergulho dos Açores — uma travessia de dia inteiro até os Bancos das Formigas e o monte submarino Dollabarat, 42 milhas náuticas a leste de São Miguel. Raias diabo, mantas-raias, tubarões sedosos e mais pelágicos do que em qualquer outro lugar do Atlântico Médio.', DE: 'Der Höhepunkt der Azoren-Tauchszene — eine ganztägige Überfahrt zu den Formigas-Bänken und dem Dollabarat-Seamount, 42 Seemeilen östlich von São Miguel. Teufelsrochen, Mantas, Seidenhaie und mehr Pelagische als sonst wo im Mittelatlantik.', ES: 'El viaje estrella de la escena de buceo de las Azores — una travesía de día completo a los Bancos de las Formigas y el monte submarino Dollabarat, 42 millas náuticas al este de São Miguel. Rayas diablo, mantas, tiburones sedosos y más pelágicos que en ningún otro lugar del Atlántico Medio.' },
 formigas_join: { EN: 'Join the waitlist', PT: 'Entrar na lista de espera', DE: 'Auf die Warteliste', ES: 'Unirse a la lista de espera' },
 formigas_requirements_title: { EN: 'Requirements', PT: 'Requisitos', DE: 'Anforderungen', ES: 'Requisitos' },
 formigas_season: { EN: 'Season & weather', PT: 'Época e condições', DE: 'Saison & Wetter', ES: 'Temporada y clima' },
 formigas_what_incl: { EN: "What's included", PT: 'O que está incluído', DE: 'Was ist inbegriffen', ES: 'Qué está incluido' },
 formigas_price_label: { EN: 'Price', PT: 'Preço', DE: 'Preis', ES: 'Precio' },

 // PageTeam
 team_h1: { EN: 'Meet the team', PT: 'Conheça a equipa', DE: 'Das Team', ES: 'Conoce al equipo' },
 team_intro: { EN: 'Marine biologists, dive guides and instructors — united by a passion for the Azores.', PT: 'Biólogos marinhos, guias de mergulho e instrutores — unidos pela paixão pelos Açores.', DE: 'Meeresbiologen, Tauchführer und Tauchlehrer — vereint durch die Leidenschaft für die Azoren.', ES: 'Biólogos marinos, guías de buceo e instructores — unidos por la pasión por las Azores.' },
 team_languages: { EN: 'Languages spoken', PT: 'Línguas faladas', DE: 'Gesprochene Sprachen', ES: 'Idiomas que se hablan' },
 team_instructor: { EN: 'SSI Instructor', PT: 'Instrutor SSI', DE: 'SSI-Tauchlehrer', ES: 'Instructor SSI' },
 team_divemaster: { EN: 'Divemaster', PT: 'Divemaster', DE: 'Tauchführer', ES: 'Divemaster' },
 team_guide: { EN: 'Dive Guide', PT: 'Guia de Mergulho', DE: 'Tauchguide', ES: 'Guía de Buceo' },
 team_marine_bio: { EN: 'Marine Biologist', PT: 'Biólogo Marinho', DE: 'Meeresbiologe', ES: 'Biólogo Marino' },

 // PageContact
 contact_h1: { EN: 'Contact us', PT: 'Contacte-nos', DE: 'Kontakt', ES: 'Contáctenos' },
 contact_intro: { EN: "We're at the marina every day. Drop by, send a message, or give us a call — we're always happy to help.", PT: 'Estamos na marina todos os dias. Passe por cá, envie uma mensagem ou ligue — estamos sempre disponíveis para ajudar.', DE: 'Wir sind täglich an der Marina. Komm vorbei, schreib uns eine Nachricht oder ruf an — wir helfen dir gerne.', ES: 'Estamos en el puerto todos los días. Pase por aquí, envíenos un mensaje o llámenos — siempre estamos felices de ayudar.' },
 contact_name: { EN: 'Name', PT: 'Nome', DE: 'Name', ES: 'Nombre' },
 contact_email: { EN: 'Email', PT: 'Email', DE: 'E-Mail', ES: 'Email' },
 contact_message: { EN: 'Message', PT: 'Mensagem', DE: 'Nachricht', ES: 'Mensaje' },
 contact_send: { EN: 'Send message', PT: 'Enviar mensagem', DE: 'Nachricht senden', ES: 'Enviar mensaje' },
 contact_sent: { EN: 'Message sent! We will be in touch soon.', PT: 'Mensagem enviada! Entraremos em contacto em breve.', DE: 'Nachricht gesendet! Wir melden uns bald.', ES: '¡Mensaje enviado! Nos pondremos en contacto pronto.' },
 contact_location: { EN: 'Location', PT: 'Localização', DE: 'Standort', ES: 'Ubicación' },
 contact_phone: { EN: 'Phone / WhatsApp', PT: 'Telefone / WhatsApp', DE: 'Telefon / WhatsApp', ES: 'Teléfono / WhatsApp' },
 contact_phone_placeholder: { EN: '+351 927 000 000', PT: '+351 927 000 000', DE: '+351 927 000 000', ES: '+351 927 000 000' },
 contact_agree_data: { EN: 'I agree to the processing of my data in accordance with the ', PT: 'Concordo com o tratamento dos meus dados de acordo com a ', DE: 'Ich stimme der Verarbeitung meiner Daten gemäß der ', ES: 'Acepto el tratamiento de mis datos conforme a la ' },
 contact_data_policy: { EN: 'Data Policy', PT: 'Política de Dados', DE: 'Datenschutzerklärung', ES: 'Política de Datos' },
 contact_err_email: { EN: 'Email is required', PT: 'Email é obrigatório', DE: 'E-Mail ist erforderlich', ES: 'El email es obligatorio' },
 contact_err_phone: { EN: 'Phone / WhatsApp is required', PT: 'Telefone é obrigatório', DE: 'Telefon ist erforderlich', ES: 'El teléfono es obligatorio' },
 contact_err_agree: { EN: 'Please accept the data policy to continue', PT: 'Por favor aceite a política de dados para continuar', DE: 'Bitte akzeptiere die Datenschutzerklärung', ES: 'Por favor acepte la política de datos para continuar' },
 contact_hours: { EN: 'Hours', PT: 'Horários', DE: 'Öffnungszeiten', ES: 'Horarios' },
 contact_hours_val: { EN: 'Daily 8:00–20:00', PT: 'Todos os dias 8:00–20:00', DE: 'Täglich 8:00–20:00', ES: 'Diariamente 8:00–20:00' },

 // PageFormigas additional
 formigas_stat_price_sub: { EN: 'full day · 2 dives', PT: 'dia inteiro · 2 mergulhos', DE: 'ganzer Tag · 2 Tauchgänge', ES: 'día completo · 2 inmersiones' },
 formigas_stat_crossing: { EN: 'Crossing', PT: 'Travessia', DE: 'Überfahrt', ES: 'Travesía' },
 formigas_stat_crossing_val: { EN: '2.5 h', PT: '2.5 h', DE: '2,5 Std.', ES: '2,5 h' },
 formigas_stat_crossing_sub: { EN: 'each way by boat', PT: 'de cada lado de barco', DE: 'hin und zurück mit Boot', ES: 'en cada sentido en barco' },
 formigas_stat_distance: { EN: 'Distance', PT: 'Distância', DE: 'Entfernung', ES: 'Distancia' },
 formigas_stat_distance_sub: { EN: 'offshore', PT: 'offshore', DE: 'offshore', ES: 'offshore' },
 formigas_stat_season: { EN: 'Season', PT: 'Época', DE: 'Saison', ES: 'Temporada' },
 formigas_stat_season_val: { EN: 'Jul–Sep', PT: 'Jul–Set', DE: 'Jul–Sep', ES: 'Jul–Sep' },
 formigas_stat_season_sub: { EN: 'weather windows', PT: 'janelas de tempo', DE: 'Wetterfenster', ES: 'ventanas de clima' },
 formigas_stat_level: { EN: 'Level', PT: 'Nível', DE: 'Niveau', ES: 'Nivel' },
 formigas_stat_level_val: { EN: 'OWD+', PT: 'OWD+', DE: 'OWD+', ES: 'OWD+' },
 formigas_stat_level_sub: { EN: '>20 dives · 3 pathways', PT: '>20 mergulhos · 3 caminhos', DE: '>20 Tauchgänge · 3 Wege', ES: '>20 inmersiones · 3 vías' },
 formigas_conditions_p: { EN: 'Conditions in the open Atlantic change fast — we monitor weather and swell up to 24 hours before departure. If the sea is not right, you get a free reschedule or a full refund. The 2.5-hour crossing each way demands a settled ocean; we never push the window.', PT: 'As condições no Atlântico aberto mudam rapidamente — monitorizamos o tempo e o swell até 24 horas antes da partida. Se o mar não estiver certo, obtém uma remarcação gratuita ou reembolso total. A travessia de 2,5 horas em cada sentido exige um oceano calmo; nunca forçamos a janela.', DE: 'Die Bedingungen im offenen Atlantik ändern sich schnell — wir überwachen Wetter und Swell bis zu 24 Stunden vor der Abfahrt. Wenn das Meer nicht stimmt, bekommst du eine kostenlose Umbuchung oder eine vollständige Rückerstattung. Die 2,5-stündige Überfahrt in jede Richtung erfordert einen ruhigen Ozean; wir erzwingen das Fenster nie.', ES: 'Las condiciones en el Atlántico abierto cambian rápido — monitorizamos el tiempo y el oleaje hasta 24 horas antes de la salida. Si el mar no está en condiciones, recibe una reprogramación gratuita o un reembolso completo. La travesía de 2,5 horas en cada sentido exige un océano calmado; nunca forzamos la ventana.' },
 formigas_exp_title: { EN: "You'll Experience", PT: 'Vai Experienciar', DE: 'Deine Erlebnisse', ES: 'Experiencias' },
 formigas_exp1: { EN: 'Occasional giant devil rays and mobulas in the open blue', PT: 'Raias gigantes e móbulas ocasionais no azul aberto', DE: 'Gelegentliche Teufelsmantarochen und Mobulas im offenen Blau', ES: 'Ocasionales rayas diablo gigantes y móbulas en el azul abierto' },
 formigas_exp2: { EN: 'Massive schools of dusky groupers at the Formigas seamount', PT: 'Enormes cardumes de garoupas na montanha submarina das Formigas', DE: 'Riesige Zackenbarsch-Schwärme am Formigas-Tiefseeberg', ES: 'Enormes bancos de meros en el monte submarino Formigas' },
 formigas_exp3: { EN: 'Drift dives in full Atlantic conditions, 42 nm offshore', PT: 'Mergulhos de deriva em plenas condições do Atlântico, a 42 nm offshore', DE: 'Strömungstauchgänge unter vollen Atlantikbedingungen, 42 Seemeilen offshore', ES: 'Inmersiones en deriva en plenas condiciones atlánticas, a 42 mn offshore' },
 formigas_exp4: { EN: 'Occasional mantas, amberjack, and blue sharks — no sighting is guaranteed', PT: 'Mantas, lírios e tubarões-azuis ocasionais — nenhum avistamento é garantido', DE: 'Gelegentliche Mantas, Bernsteinmakrelen und Blauhaie — keine Sichtung garantiert', ES: 'Mantas, pez limón y tiburones azules ocasionales — ningún avistamiento está garantizado' },
 formigas_exp_note: { EN: 'Wildlife encounters depend on season, currents and conditions — we never guarantee specific sightings.', PT: 'Os encontros com vida selvagem dependem da época, correntes e condições — nunca garantimos avistamentos específicos.', DE: 'Wildtierbegegnungen hängen von Jahreszeit, Strömungen und Bedingungen ab — wir garantieren keine spezifischen Sichtungen.', ES: 'Los encuentros con fauna marina dependen de la época, las corrientes y las condiciones — nunca garantizamos avistamientos específicos.' },
 formigas_path_title: { EN: 'Three pathways to Formigas', PT: 'Três caminhos para as Formigas', DE: 'Drei Wege zu den Formigas', ES: 'Tres vías para Formigas' },
 formigas_path1_step: { EN: 'Pathway A', PT: 'Via A', DE: 'Weg A', ES: 'Vía A' },
 formigas_path1_desc: { EN: 'AOWD + 30+ logged dives — book a check dive with us, no Offshore Prep course needed', PT: 'AOWD + 30+ mergulhos registados — faça um check dive connosco, sem curso Offshore Prep', DE: 'AOWD + 30+ protokollierte Tauchgänge — buch einen Check-Dive, kein Offshore-Prep-Kurs nötig', ES: 'AOWD + 30+ inmersiones registradas — haz un check dive con nosotros, sin curso Offshore Prep' },
 formigas_path2_step: { EN: 'Pathway B', PT: 'Via B', DE: 'Weg B', ES: 'Vía B' },
 formigas_path2_desc: { EN: 'OWD + more than 20 logged dives — complete the Offshore Prep course (€160, 1 day)', PT: 'OWD + mais de 20 mergulhos registados — complete o curso Offshore Prep (€160, 1 dia)', DE: 'OWD + mehr als 20 protokollierte Tauchgänge — Offshore-Prep-Kurs absolvieren (€160, 1 Tag)', ES: 'OWD + más de 20 inmersiones registradas — completa el curso Offshore Prep (€160, 1 día)' },
 formigas_path3_step: { EN: 'Pathway C', PT: 'Via C', DE: 'Weg C', ES: 'Vía C' },
 formigas_path3_desc: { EN: 'AOWD + fewer than 30 logged dives — complete the Offshore Prep course (€160, 1 day)', PT: 'AOWD + menos de 30 mergulhos registados — complete o curso Offshore Prep (€160, 1 dia)', DE: 'AOWD + weniger als 30 protokollierte Tauchgänge — Offshore-Prep-Kurs absolvieren (€160, 1 Tag)', ES: 'AOWD + menos de 30 inmersiones registradas — completa el curso Offshore Prep (€160, 1 día)' },
 formigas_path_note: { EN: 'OWD with 20 or fewer dives: not yet eligible — build more dive experience first.', PT: 'OWD com 20 ou menos mergulhos: ainda não elegível — acumule mais experiência de mergulho primeiro.', DE: 'OWD mit 20 oder weniger Tauchgängen: noch nicht berechtigt — sammle zuerst mehr Taucherfahrung.', ES: 'OWD con 20 o menos inmersiones: aún no elegible — acumule más experiencia de buceo primero.' },
 formigas_req_label1: { EN: 'Pathway A — AOWD · 30+ logged dives', PT: 'Via A — AOWD · 30+ mergulhos registados', DE: 'Weg A — AOWD · 30+ protokollierte Tauchgänge', ES: 'Vía A — AOWD · 30+ inmersiones registradas' },
 formigas_req_p1: { EN: "Book a guided dive with us as a check dive — no Offshore Prep course needed. We assess readiness on the water; if it works, you're on the list.", PT: 'Reserve um mergulho guiado connosco como check dive — sem curso Offshore Prep necessário. Avaliamos a prontidão na água; se funcionar, está na lista.', DE: 'Buch einen geführten Tauchgang mit uns als Check-Dive — kein Offshore-Prep-Kurs erforderlich. Wir beurteilen die Tauglichkeit im Wasser; wenn es passt, stehst du auf der Liste.', ES: 'Reserve una inmersión guiada con nosotros como check dive — no se necesita curso Offshore Prep. Evaluamos la preparación en el agua; si funciona, está en la lista.' },
 formigas_req_label2: { EN: 'Pathways B & C — Offshore Prep route', PT: 'Vias B & C — rota Offshore Prep', DE: 'Wege B & C — Offshore-Prep-Route', ES: 'Vías B & C — ruta Offshore Prep' },
 formigas_req_p2: { EN: 'OWD with more than 20 dives, or AOWD with fewer than 30 dives: complete the Offshore Prep course (€160, 1 day). Once certified, you join the waitlist — no re-enrollment needed.', PT: 'OWD com mais de 20 mergulhos, ou AOWD com menos de 30: complete o curso Offshore Prep (€160, 1 dia). Após certificado, entra na lista de espera — sem necessidade de nova inscrição.', DE: 'OWD mit mehr als 20 Tauchgängen oder AOWD mit weniger als 30: Offshore-Prep-Kurs absolvieren (€160, 1 Tag). Nach der Zertifizierung kommst du auf die Warteliste — keine erneute Anmeldung nötig.', ES: 'OWD con más de 20 inmersiones, o AOWD con menos de 30: completa el curso Offshore Prep (€160, 1 día). Una vez certificado, entras en la lista de espera — sin necesidad de reinscripción.' },
 formigas_incl_title: { EN: "What's Included", PT: 'O que está incluído', DE: 'Was ist inbegriffen', ES: 'Qué está incluido' },
 formigas_incl1: { EN: 'Full-day boat trip (2.5 h crossing each way)', PT: 'Viagem de barco dia inteiro (travessia de 2,5 h em cada sentido)', DE: 'Ganztägige Bootsfahrt (2,5 Std. Überfahrt je Richtung)', ES: 'Excursión en barco de día completo (travesía de 2,5 h en cada sentido)' },
 formigas_incl2: { EN: '2 dives at Formigas / Dollabarat seamount', PT: '2 mergulhos nas Formigas / monte submarino Dollabarat', DE: '2 Tauchgänge am Formigas / Dollabarat-Tiefseeberg', ES: '2 inmersiones en el monte submarino Formigas / Dollabarat' },
 formigas_incl3: { EN: 'Guide, boat, insurance', PT: 'Guia, barco, seguro', DE: 'Guide, Boot, Versicherung', ES: 'Guía, barco, seguro' },
 formigas_incl4: { EN: 'Underwater briefing at site', PT: 'Briefing subaquático no local', DE: 'Unterwasser-Briefing vor Ort', ES: 'Briefing subacuático en el sitio' },
 formigas_notincl_title: { EN: 'Not Included', PT: 'Não incluído', DE: 'Nicht inbegriffen', ES: 'No incluido' },
 formigas_notincl1: { EN: 'Equipment rental (available separately)', PT: 'Aluguer de equipamento (disponível separadamente)', DE: 'Ausrüstungsverleih (separat erhältlich)', ES: 'Alquiler de equipo (disponible por separado)' },
 formigas_notincl2: { EN: 'Offshore Prep course if not yet certified', PT: 'Curso Offshore Prep se ainda não certificado', DE: 'Offshore-Prep-Kurs, falls noch nicht zertifiziert', ES: 'Curso Offshore Prep si aún no está certificado' },
 formigas_waitlist_sub: { EN: 'Be the first to know when a window opens.', PT: 'Seja o primeiro a saber quando abre uma janela.', DE: 'Erfahre als Erster, wenn sich ein Fenster öffnet.', ES: 'Sea el primero en saber cuándo se abre una ventana.' },

 // PageHome SPOTS descriptions
 spot_dori_desc: { EN: 'WWII Liberty ship, sunk 1964. A protected artificial reef swarming with barracudas and trevallies.', PT: 'Navio Liberty da II Guerra Mundial, afundado em 1964. Um recife artificial protegido repleto de barracudas e cavalas.', DE: 'WWII-Frachter, gesunken 1964. Ein geschütztes künstliches Riff voller Barrakudas und Stachelmakrelen.', ES: 'Barco Liberty de la II Guerra Mundial, hundido en 1964. Un arrecife artificial protegido repleto de barracudas y jureles.' },
 spot_espelho_desc: { EN: 'The "Mirror Arch" — trapped air turns the dome into a liquid mirror. Home of Manuela the moray.', PT: 'O "Arco do Espelho" — o ar aprisionado transforma a cúpula num espelho líquido. Lar da Manuela, a moreia.', DE: 'Der "Spiegelbogen" — eingeschlossene Luft verwandelt die Kuppel in einen Flüssigkeitspiegel. Heimat von Manuela, der Muräne.', ES: 'El "Arco del Espejo" — el aire atrapado convierte la cúpula en un espejo líquido. Hogar de Manuela la morena.' },
 spot_cavaco_desc: { EN: 'Volcanic arches full of slipper lobsters, groupers, stingrays and scorpionfish.', PT: 'Arcos vulcânicos cheios de lagostas, garoupas, raias e rascaços.', DE: 'Vulkanische Bögen voller Bärenkrebse, Zackenbarsche, Rochen und Skorpionfische.', ES: 'Arcos volcánicos llenos de langostas, meros, rayas y peces escorpión.' },
 spot_formigas_desc: { EN: 'The marquee expedition of the Azores — dusky groupers, devil rays and mantas in the blue.', PT: 'A expedição de destaque dos Açores — garoupas, raias-diabo e mantas no azul.', DE: 'Die Hauptexpedition der Azoren — Zackenbarsche, Teufelsmantarochen und Mantas im Blau.', ES: 'La expedición estrella de las Azores — meros, rayas diablo y mantas en el azul.' },

 // PageSites UI labels
 sites_back: { EN: ' Dive Sites', PT: ' Pontos de Mergulho', DE: ' Tauchplätze', ES: ' Puntos de Buceo' },
 sites_back_all: { EN: ' All dive sites', PT: ' Todos os pontos', DE: ' Alle Tauchplätze', ES: ' Todos los sitios' },
 sites_beginner_friendly: { EN: 'Beginner Friendly', PT: 'Para Iniciantes', DE: 'Für Anfänger', ES: 'Para Principiantes' },
 sites_max_depth: { EN: 'Max Depth', PT: 'Profundidade Máx.', DE: 'Max. Tiefe', ES: 'Prof. Máx.' },
 sites_avg_depth: { EN: 'Avg Depth', PT: 'Profundidade Méd.', DE: 'Mittl. Tiefe', ES: 'Prof. Med.' },
 sites_water_temp: { EN: 'Water Temp', PT: 'Temperatura', DE: 'Wassertemperatur', ES: 'Temperatura' },
 sites_visibility: { EN: 'Visibility', PT: 'Visibilidade', DE: 'Sichtweite', ES: 'Visibilidad' },
 sites_vis_note: { EN: '* Visibility varies with underwater movement, swell, wind direction, season and suspended particles (algae, sand). 7–30 m covers the realistic range.', PT: '* A visibilidade varia com o movimento subaquático, ondulação, direção do vento, época e partículas em suspensão (algas, areia). 7–30 m abrange o intervalo realista.', DE: '* Die Sicht variiert mit Unterwasserbewegung, Swell, Windrichtung, Jahreszeit und Schwebeteilchen (Algen, Sand). 7–30 m deckt den realistischen Bereich ab.', ES: '* La visibilidad varía con el movimiento subacuático, oleaje, dirección del viento, temporada y partículas en suspensión (algas, arena). 7–30 m cubre el rango realista.' },
 sites_species: { EN: 'Species you may see', PT: 'Espécies que pode ver', DE: 'Mögliche Sichtungen', ES: 'Especies que puede ver' },
 sites_fish_habitat: { EN: 'Habitat', PT: 'Habitat', DE: 'Lebensraum', ES: 'Hábitat' },
 sites_fish_diet: { EN: 'Diet', PT: 'Dieta', DE: 'Ernährung', ES: 'Dieta' },
 sites_fish_no_details: { EN: 'No details available yet.', PT: 'Sem detalhes disponíveis ainda.', DE: 'Noch keine Details verfügbar.', ES: 'Aún no hay detalles disponibles.' },
 sites_fish_close: { EN: 'Close', PT: 'Fechar', DE: 'Schließen', ES: 'Cerrar' },

 // PageContact social
 contact_social_title: { EN: 'Follow us on Social Media', PT: 'Siga-nos nas Redes Sociais', DE: 'Folge uns in den sozialen Medien', ES: 'Síguenos en Redes Sociales' },
 contact_social_sub: { EN: 'Dive footage, underwater photos & life at the marina — updated regularly.', PT: 'Imagens de mergulho, fotos subaquáticas e vida na marina — atualizadas regularmente.', DE: 'Tauchaufnahmen, Unterwasserfotos und das Leben an der Marina — regelmäßig aktualisiert.', ES: 'Imágenes de buceo, fotos subacuáticas y vida en el puerto — actualizadas regularmente.' },
 sites_details_link: { EN: 'Details ', PT: 'Detalhes ', DE: 'Details ', ES: 'Detalles ' },
 sites_level_req: { EN: 'req.', PT: 'req.', DE: 'erf.', ES: 'req.' },

 // PageCourseDetail UI labels
 cd_ssi_cert: { EN: 'SSI Certification', PT: 'Certificação SSI', DE: 'SSI-Zertifizierung', ES: 'Certificación SSI' },
 cd_highlights: { EN: 'Highlights', PT: 'Destaques', DE: 'Highlights', ES: 'Destacados' },
 cd_requirements: { EN: 'Requirements', PT: 'Requisitos', DE: 'Anforderungen', ES: 'Requisitos' },
 cd_whats_included: { EN: "What's Included", PT: 'O que está incluído', DE: 'Was ist inbegriffen', ES: 'Qué está incluido' },
 cd_youll_earn: { EN: "You'll Earn", PT: 'Vai Obter', DE: 'Du bekommst', ES: 'Obtendrás' },
 cd_book_course: { EN: 'Book this course ', PT: 'Reservar este curso ', DE: 'Kurs buchen ', ES: 'Reservar este curso ' },
 cd_inquire_course: { EN: 'Inquire about Blue Oceans Explorer ', PT: 'Saber mais sobre Blue Oceans Explorer ', DE: 'Blue Oceans Explorer anfragen ', ES: 'Consultar sobre Blue Oceans Explorer ' },
 cd_inquire_generic: { EN: 'Inquire about this course ', PT: 'Saber mais sobre este curso ', DE: 'Diesen Kurs anfragen ', ES: 'Consultar sobre este curso ' },
 cd_back_courses: { EN: ' Back to all courses', PT: ' Voltar aos cursos', DE: ' Zurück zu allen Kursen', ES: ' Volver a todos los cursos' },

 // PageCourses subtexts
 courses_tap_hint: { EN: "Tap any course for full details, requirements and what's included.", PT: 'Clique em qualquer curso para ver detalhes, requisitos e o que está incluído.', DE: 'Tipp auf einen Kurs für alle Details, Voraussetzungen und Leistungen.', ES: 'Toca cualquier curso para ver detalles completos, requisitos y qué está incluido.' },
 courses_entry_sub: { EN: 'Start here — from your very first breath underwater to full Open Water certification.', PT: 'Comece aqui — desde o seu primeiro mergulho até à certificação Open Water.', DE: 'Beginne hier — von deinem ersten Atemzug unter Wasser bis zur Open Water Zertifizierung.', ES: 'Empiece aquí — desde su primera respiración bajo el agua hasta la certificación Open Water.' },
 courses_specialty_sub: { EN: 'Already certified? Level up with Advanced Open Water or add targeted specialty skills.', PT: 'Já certificado? Suba de nível com Advanced Open Water ou adicione especialidades.', DE: 'Bereits zertifiziert? Level auf mit Advanced Open Water oder Spezialkursen.', ES: '¿Ya certificado? Sube de nivel con Advanced Open Water o añade especialidades.' },
 courses_ecology_label: { EN: 'Ecology', PT: 'Ecologia', DE: 'Ökologie', ES: 'Ecología' },
 courses_ecology_sub: { EN: 'Go beyond the dive card — understand the ecosystems you move through.', PT: 'Vá além do cartão de mergulho — compreenda os ecossistemas.', DE: 'Geh über die Tauchkarte hinaus — verstehe die Ökosysteme.', ES: 'Ve más allá del carnet — comprende los ecosistemas que atraviesas.' },
 courses_pro_sub: { EN: 'For divers who want to lead, teach, or simply be the most capable person in the water.', PT: 'Para mergulhadores que querem liderar, ensinar ou simplesmente ser o mais capaz na água.', DE: 'Für Taucher, die leiten, lehren oder einfach die fähigste Person im Wasser sein wollen.', ES: 'Para buceadores que quieren liderar, enseñar o simplemente ser los más capaces en el agua.' },

 // PageTeam additional
 team_p2: { EN: 'Conservation is not a tagline for us — it is part of who we are. From the way we move underwater to the conversations we have on deck, we work every day to understand, celebrate, and protect the marine life we love. We want every diver who joins us to go home not only with great memories, but with a deeper connection to the ocean and a reason to care for it.', PT: 'A conservação não é um slogan para nós — faz parte do que somos. Desde a forma como nos movemos debaixo de água até às conversas que temos no barco, trabalhamos todos os dias para compreender, celebrar e proteger a vida marinha que amamos. Queremos que cada mergulhador que se junta a nós regresse a casa não só com ótimas memórias, mas com uma ligação mais profunda ao oceano e uma razão para cuidar dele.', DE: 'Meeresschutz ist für uns kein Slogan — er ist Teil unserer Identität. Von der Art, wie wir uns unter Wasser bewegen, bis zu den Gesprächen, die wir an Deck führen, arbeiten wir jeden Tag daran, das Meeresleben, das wir lieben, zu verstehen, zu feiern und zu schützen. Wir möchten, dass jeder Taucher, der sich uns anschließt, nicht nur mit großartigen Erinnerungen nach Hause geht, sondern mit einer tieferen Verbindung zum Ozean und einem Grund, sich um ihn zu sorgen.', ES: 'La conservación no es un eslogan para nosotros — es parte de lo que somos. Desde la manera en que nos movemos bajo el agua hasta las conversaciones que tenemos en cubierta, trabajamos cada día para comprender, celebrar y proteger la vida marina que amamos. Queremos que cada buceador que se une a nosotros regrese a casa no solo con grandes recuerdos, sino con una conexión más profunda con el océano y una razón para cuidarlo.' },
 team_p3: { EN: 'Most of all, we are here for you. Every single dive, our goal is simple: give you the best possible time in the water. Whether it is your very first breath underwater or your hundredth dive, we bring the same energy, the same warmth, and the same boundless love for the ocean. Come dive with us — the water is waiting.', PT: 'Acima de tudo, estamos aqui para si. Em cada mergulho, o nosso objetivo é simples: proporcionar-lhe o melhor momento possível na água. Seja a sua primeira respiração debaixo de água ou o seu centésimo mergulho, trazemos a mesma energia, o mesmo calor e o mesmo amor ilimitado pelo oceano. Venha mergulhar connosco — a água está à sua espera.', DE: 'Vor allem sind wir für dich da. Bei jedem einzelnen Tauchgang ist unser Ziel einfach: dir die bestmögliche Zeit im Wasser zu geben. Ob es dein erster Atemzug unter Wasser ist oder dein hundertster Tauchgang — wir bringen die gleiche Energie, die gleiche Wärme und die gleiche grenzenlose Liebe zum Ozean. Komm mit uns tauchen — das Wasser wartet.', ES: 'Sobre todo, estamos aquí para usted. En cada inmersión, nuestro objetivo es simple: darle el mejor momento posible en el agua. Ya sea su primer respiro bajo el agua o su centésima inmersión, traemos la misma energía, el mismo calor y el mismo amor ilimitado por el océano. Venga a bucear con nosotros — el agua está esperando.' },
 team_p1: { EN: 'We are a crew united by a shared passion for the sea and everything that calls it home. Our team brings together SSI and PADI instructors, experienced divemasters and skippers, marine biologists, and marine biology students who bring genuine scientific curiosity to every briefing and every descent. We know these waters intimately — the lava arches, the cleaning stations, the seasonal visitors, and yes, exactly where Manuela the moray is hiding.', PT: 'Somos uma tripulação unida por uma paixão partilhada pelo mar e por tudo o que nele habita. A nossa equipa reúne instrutores SSI e PADI, divemasters e patrões experientes, biólogos marinhos e estudantes de biologia marinha que trazem verdadeira curiosidade científica a cada briefing e cada descida. Conhecemos estas águas intimamente — os arcos de lava, as estações de limpeza, os visitantes sazonais e, sim, exatamente onde a Manuela a moreia está escondida.', DE: 'Wir sind eine Crew, die durch eine gemeinsame Leidenschaft für das Meer und alles, was darin lebt, vereint ist. Unser Team bringt SSI- und PADI-Instruktoren, erfahrene Tauchführer und Bootsführer, Meeresbiologen und Meeresbiologe-Studenten zusammen, die bei jedem Briefing und jedem Abstieg echte wissenschaftliche Neugier mitbringen. Wir kennen diese Gewässer intim — die Lavabögen, die Putzstationen, die saisonalen Besucher und ja, genau wo Manuela die Muräne sich versteckt.', ES: 'Somos una tripulación unida por una pasión compartida por el mar y todo lo que lo habita. Nuestro equipo reúne a instructores SSI y PADI, divemasters y patrones experimentados, biólogos marinos y estudiantes de biología marina que aportan genuina curiosidad científica a cada briefing y cada descenso. Conocemos estas aguas íntimamente — los arcos de lava, las estaciones de limpieza, los visitantes estacionales y sí, exactamente dónde se esconde Manuela la morena.' },

 // PageBasicDiver additional
 bd_p2: { EN: "We start in the marina seawater pool — sheltered, calm, right at the base. You cover basic theory online before arriving via the MySSI app. In the pool you learn how to breathe through the regulator, equalise your ears and signal before entering open water. Once you are comfortable, you move to the harbour basin: calm, protected, max 12 m, your instructor within arm's reach throughout.", PT: 'Começamos na piscina de água salgada da marina — protegida, calma, mesmo na base. Cobre a teoria básica online antes de chegar através da app MySSI. Na piscina aprende a respirar pelo regulador, equalizar os ouvidos e sinalizar antes de entrar em mar aberto. Quando estiver confortável, passa para a bacia do porto: calmo, protegido, máx. 12 m, com o instrutor sempre ao seu alcance.', DE: 'Wir beginnen im Meerwasserpool der Marina — geschützt, ruhig, direkt an der Basis. Die Grundtheorie absolvierst du online vor der Ankunft über die MySSI-App. Im Pool lernst du, durch den Lungenautomaten zu atmen, den Druckausgleich zu machen und Handzeichen zu geben. Wenn du dich wohlfühlst, wechselst du ins Hafenbecken: ruhig, geschützt, max. 12 m, dein Instruktor stets in Reichweite.', ES: 'Empezamos en la piscina de agua de mar de la marina — resguardada, tranquila, en la propia base. La teoría básica la completa online antes de llegar a través de la app MySSI. En la piscina aprende a respirar por el regulador, compensar los oídos y señalizar antes de entrar en aguas abiertas. Cuando se sienta cómodo, pasa a la dársena del puerto: tranquilo, protegido, máx. 12 m, con su instructor siempre a su alcance.' },
 bd_p3: { EN: "Unlike a simple intro experience, this is a genuine SSI certification (ISO 11121). Your Basic Diver card is valid for 6 months and allows you to dive under direct SSI instructor supervision. It also counts toward the full Open Water Diver course if you continue within that window — most guests do. Groups are always small: never more than 2 students per instructor.", PT: 'Ao contrário de uma simples experiência de introdução, esta é uma certificação SSI genuína (ISO 11121). O seu cartão Basic Diver é válido por 6 meses e permite-lhe mergulhar sob supervisão direta de um instrutor SSI. Conta também para o curso completo Open Water Diver se continuar dentro desse prazo — a maioria dos convidados faz isso. Os grupos são sempre pequenos: nunca mais de 2 alunos por instrutor.', DE: 'Anders als ein einfacher Schnuppertauchgang ist dies eine echte SSI-Zertifizierung (ISO 11121). Deine Basic-Diver-Karte ist 6 Monate gültig und erlaubt dir das Tauchen unter direkter SSI-Instruktor-Aufsicht. Sie zählt auch zum vollständigen Open-Water-Diver-Kurs, wenn du innerhalb dieses Zeitrahmens weitermachst — die meisten Gäste tun das. Gruppen sind immer klein: nie mehr als 2 Schüler pro Instruktor.', ES: 'A diferencia de una simple experiencia de introducción, esta es una certificación SSI genuina (ISO 11121). Su tarjeta Basic Diver es válida por 6 meses y le permite bucear bajo supervisión directa de un instructor SSI. También cuenta para el curso completo Open Water Diver si continúa dentro de ese plazo — la mayoría de los huéspedes lo hace. Los grupos son siempre pequeños: nunca más de 2 alumnos por instructor.' },
 bd_step1_name: { EN: 'Theory (before you arrive)', PT: 'Teoria (antes de chegar)', DE: 'Theorie (vor der Ankunft)', ES: 'Teoría (antes de llegar)' },
 bd_step1_desc: { EN: 'Download the MySSI app and complete the Basic Diver digital learning at home, in your own language, at your own pace.', PT: 'Descarregue a app MySSI e complete a aprendizagem digital Basic Diver em casa, no seu idioma, ao seu ritmo.', DE: 'Lade die MySSI-App herunter und absolviere die Basic-Diver-Online-Theorie zu Hause, in deiner Sprache, in deinem eigenen Tempo.', ES: 'Descarga la app MySSI y completa el aprendizaje digital Basic Diver en casa, en tu idioma, a tu ritmo.' },
 bd_step2_name: { EN: 'Arrive at the marina', PT: 'Chegue à marina', DE: 'Ankunft an der Marina', ES: 'Llegada a la marina' },
 bd_step2_desc: { EN: 'Meet your instructor, sign in, get fitted with your gear — wetsuit, BCD, regulator, computer.', PT: 'Encontre o seu instrutor, faça o registo, ajuste o equipamento — fato de mergulho, BCD, regulador, computador.', DE: 'Triff deinen Instruktor, melde dich an, pass deine Ausrüstung an — Neoprenanzug, BCD, Lungenautomat, Computer.', ES: 'Conozca a su instructor, regístrese, ajuste su equipo — traje de neopreno, BCD, regulador, ordenador.' },
 bd_step3_name: { EN: 'Confined water skills (30–45 min)', PT: 'Habilidades em água confinada (30–45 min)', DE: 'Grundfertigkeiten im Pool (30–45 Min.)', ES: 'Habilidades en agua confinada (30–45 min)' },
 bd_step3_desc: { EN: "In the marina seawater pool: breathe through the regulator, equalise, clear your mask, signal OK and surface safely. Everything at your own pace.", PT: 'Na piscina de água salgada da marina: respire pelo regulador, equalize, limpe a máscara, sinalize OK e suba com segurança. Tudo ao seu ritmo.', DE: 'Im Meerwasserpool der Marina: durch den Automaten atmen, Druck ausgleichen, Maske ausblasen, OK-Zeichen geben und sicher auftauchen. Alles in deinem Tempo.', ES: 'En la piscina de agua de mar de la marina: respire por el regulador, compense, limpie la máscara, señale OK y suba a la superficie con seguridad. Todo a su ritmo.' },
 bd_step4_name: { EN: 'Move to the harbour basin', PT: 'Deslocação para a bacia do porto', DE: 'Wechsel ins Hafenbecken', ES: 'Desplazamiento a la dársena del puerto' },
 bd_step4_desc: { EN: 'A short walk to the deeper part of the marina. Your instructor gives a final briefing before entry.', PT: 'Uma curta caminhada para a parte mais funda da marina. O seu instrutor dá um briefing final antes da entrada.', DE: 'Ein kurzer Spaziergang zum tieferen Teil der Marina. Dein Instruktor gibt ein abschließendes Briefing vor dem Einstieg.', ES: 'Un corto paseo hasta la parte más profunda de la marina. Su instructor da un briefing final antes de entrar.' },
 bd_step5_name: { EN: 'Harbour dive (20–30 min)', PT: 'Mergulho no porto (20–30 min)', DE: 'Hafentauchgang (20–30 Min.)', ES: 'Inmersión en el puerto (20–30 min)' },
 bd_step5_desc: { EN: "Descend to max 12 m in calm, sheltered water. Breathe, relax, take it all in — your first fish, your first glimpse of a world most people never see. Your instructor stays within arm's reach.", PT: 'Desça até máx. 12 m em água calma e abrigada. Respire, relaxe, absorva tudo — o seu primeiro peixe, o seu primeiro vislumbre de um mundo que a maioria nunca vê. O seu instrutor mantém-se sempre ao seu alcance.', DE: 'Abtauchen auf max. 12 m in ruhigem, geschütztem Wasser. Atmen, entspannen, alles aufsaugen — dein erster Fisch, dein erster Blick auf eine Welt, die die meisten nie sehen. Dein Instruktor bleibt in Greifweite.', ES: 'Descienda hasta máx. 12 m en agua tranquila y resguardada. Respire, relájese, absorba todo — su primer pez, su primer atisbo de un mundo que la mayoría nunca ve. Su instructor permanece siempre a su alcance.' },
 bd_step6_name: { EN: 'Debrief + certification', PT: 'Debriefing + certificação', DE: 'Debriefing + Zertifizierung', ES: 'Debriefing + certificación' },
 bd_step6_desc: { EN: 'Talk through what you saw, complete your skills evaluation and receive your official SSI Basic Diver digital certification card.', PT: 'Fale sobre o que viu, complete a avaliação de competências e receba o seu cartão de certificação digital SSI Basic Diver oficial.', DE: 'Besprich, was du gesehen hast, schließ deine Kompetenzprüfung ab und erhalte deine offizielle digitale SSI-Basic-Diver-Zertifizierungskarte.', ES: 'Comente lo que vio, complete su evaluación de habilidades y reciba su tarjeta de certificación digital oficial SSI Basic Diver.' },
 bd_incl1: { EN: 'All equipment (wetsuit, BCD, regulator, tank, weights)', PT: 'Todo o equipamento (fato, BCD, regulador, botija, lastros)', DE: 'Gesamte Ausrüstung (Neopren, BCD, Lungenautomaten, Flasche, Blei)', ES: 'Todo el equipo (traje, BCD, regulador, botella, lastre)' },
 bd_incl2: { EN: 'Online theory (MySSI app)', PT: 'Teoria online (app MySSI)', DE: 'Online-Theorie (MySSI-App)', ES: 'Teoría online (app MySSI)' },
 bd_incl3: { EN: 'Confined water skills session (marina pool)', PT: 'Sessão de competências em água confinada (piscina da marina)', DE: 'Grundfertigkeits-Sitzung im Pool (Marinapool)', ES: 'Sesión de habilidades en agua confinada (piscina de la marina)' },
 bd_incl4: { EN: '1 guided harbour dive to max 12 m', PT: '1 mergulho guiado no porto até máx. 12 m', DE: '1 geführter Hafentauchgang bis max. 12 m', ES: '1 inmersión guiada en el puerto hasta máx. 12 m' },
 bd_incl5: { EN: 'Marine insurance', PT: 'Seguro marítimo', DE: 'Meeresversicherung', ES: 'Seguro marítimo' },
 bd_incl6: { EN: 'Official SSI Basic Diver certification card', PT: 'Cartão de certificação SSI Basic Diver oficial', DE: 'Offizielle SSI-Basic-Diver-Zertifizierungskarte', ES: 'Tarjeta de certificación oficial SSI Basic Diver' },
 bd_price_pool: { EN: 'Pool session only', PT: 'Apenas sessão de piscina', DE: 'Nur Pool-Sitzung', ES: 'Solo sesión de piscina' },
 bd_price_group: { EN: 'Pool + Sea (group)', PT: 'Piscina + Mar (grupo)', DE: 'Pool + See (Gruppe)', ES: 'Piscina + Mar (grupo)' },
 bd_price_group_note: { EN: 'up to 2 students / instructor', PT: 'até 2 alunos / instrutor', DE: 'bis zu 2 Schüler / Instruktor', ES: 'hasta 2 alumnos / instructor' },
 bd_price_private: { EN: 'Pool + Sea — Private Instructor', PT: 'Piscina + Mar — Instrutor Privado', DE: 'Pool + See — Privater Instruktor', ES: 'Piscina + Mar — Instructor Privado' },
 bd_price_private_note: { EN: '1-on-1 with your own instructor', PT: '1-para-1 com o seu próprio instrutor', DE: '1-zu-1 mit deinem eigenen Instruktor', ES: '1-a-1 con su propio instructor' },

 // PageDives additional
 dives_stat_session: { EN: 'Session', PT: 'Sessão', DE: 'Sitzung', ES: 'Sesión' },
 dives_stat_group: { EN: 'Group size', PT: 'Tamanho do grupo', DE: 'Gruppengröße', ES: 'Tamaño del grupo' },
 dives_stat_dives: { EN: 'Dives', PT: 'Mergulhos', DE: 'Tauchgänge', ES: 'Inmersiones' },
 dives_stat_incl: { EN: 'Included', PT: 'Incluído', DE: 'Inklusive', ES: 'Incluido' },
 dives_stat_session_val: { EN: '8:00–13:00 or 14:00–19:00', PT: '8:00–13:00 ou 14:00–19:00', DE: '8:00–13:00 oder 14:00–19:00', ES: '8:00–13:00 o 14:00–19:00' },
 dives_stat_group_val: { EN: 'Max 4 divers / guide', PT: 'Máx. 4 mergulhadores / guia', DE: 'Max. 4 Taucher / Guide', ES: 'Máx. 4 buzos / guía' },
 dives_stat_dives_val: { EN: '2 guided boat dives', PT: '2 mergulhos guiados de barco', DE: '2 geführte Bootstauchen', ES: '2 inmersiones en barco guiadas' },
 dives_stat_incl_val: { EN: 'Tank · Weights · Guide', PT: 'Botija · Lastros · Guia', DE: 'Flasche · Blei · Guide', ES: 'Botella · Lastre · Guía' },
 dives_pricing: { EN: 'Pricing', PT: 'Preços', DE: 'Preise', ES: 'Precios' },
 dives_p1: { EN: "Two dives, one session — that's how we run every day of the season. Morning boats leave the marina at 8:00 and are back by 13:00. Afternoon boats leave at 14:00 and return by 19:00. Both sessions include a proper surface interval with refreshments and time to talk through the second dive.", PT: 'Dois mergulhos, uma sessão — é assim que trabalhamos todos os dias da temporada. Os barcos da manhã saem da marina às 8:00 e regressam às 13:00. Os barcos da tarde saem às 14:00 e regressam às 19:00. Ambas as sessões incluem um intervalo de superfície com refrescos e tempo para debater o segundo mergulho.', DE: 'Zwei Tauchgänge, eine Sitzung — so arbeiten wir jeden Tag der Saison. Morgenboote verlassen den Hafen um 8:00 Uhr und sind bis 13:00 Uhr zurück. Nachmittagsboote fahren um 14:00 Uhr ab und kehren bis 19:00 Uhr zurück. Beide Sitzungen beinhalten eine ordentliche Oberflächenpause mit Erfrischungen und Zeit, den zweiten Tauchgang zu besprechen.', ES: 'Dos inmersiones, una sesión — así trabajamos cada día de la temporada. Los barcos de la mañana salen del puerto a las 8:00 y regresan a las 13:00. Los barcos de la tarde salen a las 14:00 y vuelven a las 19:00. Ambas sesiones incluyen un intervalo de superficie con refrescos y tiempo para planificar la segunda inmersión.' },
 dives_p2: { EN: "We cap our groups at 4 divers per guide — not for regulatory reasons, but because it's the only ratio that makes sense in the Azores. The sites are wild, the conditions can change, and we want to spend the dive watching the animals, not counting heads. The result is a guided dive that feels like diving with a friend who knows every rock.", PT: 'Limitamos os grupos a 4 mergulhadores por guia — não por razões regulamentares, mas porque é a única proporção que faz sentido nos Açores. Os locais são selvagens, as condições podem mudar, e queremos passar o mergulho a observar os animais, não a contar cabeças. O resultado é um mergulho guiado que parece mergulhar com um amigo que conhece cada rocha.', DE: 'Wir begrenzen unsere Gruppen auf 4 Taucher pro Guide — nicht aus regulatorischen Gründen, sondern weil es das einzige Verhältnis ist, das auf den Azoren Sinn macht. Die Tauchplätze sind wild, die Bedingungen können sich ändern, und wir wollen den Tauchgang damit verbringen, die Tiere zu beobachten, nicht Köpfe zu zählen. Das Ergebnis ist ein geführter Tauchgang, der sich anfühlt, als würde man mit einem Freund tauchen, der jeden Stein kennt.', ES: 'Limitamos nuestros grupos a 4 buzos por guía — no por razones regulatorias, sino porque es la única proporción que tiene sentido en las Azores. Los sitios son salvajes, las condiciones pueden cambiar, y queremos pasar la inmersión observando los animales, no contando cabezas. El resultado es una inmersión guiada que se siente como bucear con un amigo que conoce cada roca.' },
 dives_p3: { EN: "Typical sites include the Dori wreck (WWII Liberty ship, 18–22 m), Arco do Espelho (the liquid-mirror arch), Arco do Cavaco (volcanic swim-throughs), and a rotating selection based on conditions and what's been spotted. We brief the plan at the marina and adjust on the day.", PT: 'Os locais habituais incluem o naufrágio Dori (navio Liberty da II Guerra Mundial, 18–22 m), Arco do Espelho (o arco do espelho líquido), Arco do Cavaco (passagens vulcânicas), e uma seleção rotativa baseada nas condições e no que foi avistado. Fazemos o briefing na marina e ajustamos no dia.', DE: 'Zu den typischen Tauchplätzen gehören das Dori-Wrack (WWII-Frachter, 18–22 m), Arco do Espelho (der Flüssigspiegel-Bogen), Arco do Cavaco (vulkanische Durchschwimmtunnel) und eine wechselnde Auswahl je nach Bedingungen und Sichtungen. Wir briefen den Plan an der Marina und passen ihn am Tag an.', ES: 'Los sitios habituales incluyen el pecio Dori (barco Liberty de la II Guerra Mundial, 18–22 m), Arco do Espelho (el arco espejo líquido), Arco do Cavaco (túneles volcánicos), y una selección rotativa según las condiciones y los avistamientos. Hacemos el briefing en el puerto y ajustamos el día.' },
 dives_incl_tank: { EN: 'Tank & weights', PT: 'Botija & lastros', DE: 'Flasche & Blei', ES: 'Botella & lastre' },
 dives_incl_guide: { EN: 'Expert guide (1:4 max)', PT: 'Guia especialista (1:4 máx.)', DE: 'Experten-Guide (1:4 max)', ES: 'Guía experto (máx. 1:4)' },
 dives_incl_boat: { EN: 'Boat + fuel', PT: 'Barco + combustível', DE: 'Boot + Kraftstoff', ES: 'Barco + combustible' },
 dives_incl_ins: { EN: 'Marine insurance', PT: 'Seguro marítimo', DE: 'Meeresversicherung', ES: 'Seguro marítimo' },
 dives_incl_interval: { EN: 'Surface interval with refreshments', PT: 'Intervalo de superfície com refrescos', DE: 'Oberflächenpause mit Erfrischungen', ES: 'Intervalo de superficie con refrescos' },
 dives_incl_brief: { EN: 'Dive briefing + debrief', PT: 'Briefing + debriefing de mergulho', DE: 'Tauch-Briefing + Debriefing', ES: 'Briefing + debriefing de inmersión' },
 dives_req_text: { EN: "Any recognised scuba certification (SSI, PADI, CMAS, RAID, etc.). If you've been out of the water for over a year, a Scuba Skills Update is mandatory before joining.", PT: "Qualquer certificação de mergulho reconhecida (SSI, PADI, CMAS, RAID, etc.). Se esteve fora de água durante mais de um ano, é obrigatório um Scuba Skills Update antes de participar.", DE: "Jede anerkannte Tauchzertifizierung (SSI, PADI, CMAS, RAID, etc.). Wenn du mehr als ein Jahr nicht getaucht bist, ist ein Scuba Skills Update vor der Teilnahme Pflicht.", ES: "Cualquier certificación de buceo reconocida (SSI, PADI, CMAS, RAID, etc.). Si no ha buceado durante más de un año, es obligatorio un Scuba Skills Update antes de participar." },
 dives_pkg_double: { EN: 'Double Dive (2 dives)', PT: 'Mergulho Duplo (2 mergulhos)', DE: 'Doppeltauchgang (2 Tauchgänge)', ES: 'Inmersión Doble (2 inmersiones)' },
 dives_pkg_4: { EN: '4-Dive Pack', PT: 'Pacote de 4 Mergulhos', DE: '4er-Tauchpaket', ES: 'Paquete de 4 Inmersiones' },
 dives_pkg_6: { EN: '6-Dive Pack', PT: 'Pacote de 6 Mergulhos', DE: '6er-Tauchpaket', ES: 'Paquete de 6 Inmersiones' },
 dives_pkg_8: { EN: '8-Dive Pack', PT: 'Pacote de 8 Mergulhos', DE: '8er-Tauchpaket', ES: 'Paquete de 8 Inmersiones' },
 dives_pkg_10: { EN: '10-Dive Pack', PT: 'Pacote de 10 Mergulhos', DE: '10er-Tauchpaket', ES: 'Paquete de 10 Inmersiones' },
 home_equip_fullrental: { EN: 'Full equipment rental', PT: 'Aluguer de equipamento completo', DE: 'Vollausrüstung mieten', ES: 'Alquiler de equipo completo' },
 home_equip_computer: { EN: 'Dive computer', PT: 'Computador de mergulho', DE: 'Tauchcomputer', ES: 'Ordenador de buceo' },
 home_equip_bundle_single: { EN: 'Full equipment + computer · single dive', PT: 'Equip. completo + computador · 1 mergulho', DE: 'Vollausrüstung + Computer · 1 Tauchgang', ES: 'Equipo completo + computador · inmersión simple' },
 home_equip_bundle_double: { EN: 'Full equipment + computer · double dive', PT: 'Equip. completo + computador · 2 mergulhos', DE: 'Vollausrüstung + Computer · 2 Tauchgänge', ES: 'Equipo completo + computador · doble inmersión' },
 home_equip_bundle_triple: { EN: 'Full equipment + computer · triple dive', PT: 'Equip. completo + computador · 3 mergulhos', DE: 'Vollausrüstung + Computer · 3 Tauchgänge', ES: 'Equipo completo + computador · triple inmersión' },
 home_equip_smb: { EN: 'SMB + spool — buy at the marina', PT: 'SMB + carretel — comprar na marina', DE: 'SMB + Spule — am Hafen kaufen', ES: 'SMB + carrete — comprar en el puerto' },
 home_equip_tank: { EN: '15 L tank upgrade', PT: 'Upgrade para botija de 15 L', DE: '15-L-Flasche Upgrade', ES: 'Mejora a botella de 15 L' },
 elasmo_p1: { EN: 'An altruistic scientific project addressing the information gap surrounding elasmobranchs — particularly rays, manta rays, and sharks — in the Azores. Using interviews with local fishermen, BRUVS deployments, and citizen science with marine tourism companies, the project collects data on species populations and distribution across the Azorean islands.', PT: 'Um projeto científico altruísta que aborda a lacuna de informação em torno dos elasmobrânquios — particularmente raias, mantas e tubarões — nos Açores. Usando entrevistas com pescadores locais, implementações de BRUVS e ciência cidadã com empresas de turismo marítimo, o projeto recolhe dados sobre populações e distribuição de espécies pelas ilhas açorianas.', DE: 'Ein altruistisches wissenschaftliches Projekt, das die Informationslücke rund um Elasmobranchier — insbesondere Rochen, Mantas und Haie — auf den Azoren schließt. Mit Interviews mit lokalen Fischern, BRUVS-Einsätzen und Citizen Science mit Meerestourismusunternehmen sammelt das Projekt Daten zu Artenpopulationen und -verteilung auf den Azoreninseln.', ES: 'Un proyecto científico altruista que aborda la brecha de información sobre los elasmobranquios — en particular rayas, mantarrayas y tiburones — en las Azores. Usando entrevistas con pescadores locales, instalaciones de BRUVS y ciencia ciudadana con empresas de turismo marino, el proyecto recopila datos sobre poblaciones y distribución de especies en las islas azoreanas.' },
 elasmo_p2: { EN: 'Our collaboration: during every dive we record the species we encounter and contribute these observations to the project — improving understanding of species seasonality and identifying areas of ecological importance such as potential breeding, nursery, or mating grounds.', PT: 'A nossa colaboração: durante cada mergulho registamos as espécies que encontramos e contribuímos com essas observações para o projeto — melhorando a compreensão da sazonalidade das espécies e identificando áreas de importância ecológica como potenciais locais de reprodução, berçário ou acasalamento.', DE: 'Unsere Zusammenarbeit: Bei jedem Tauchgang erfassen wir die Arten, die wir begegnen, und tragen diese Beobachtungen zum Projekt bei — um das Verständnis der Artensaisonalität zu verbessern und Gebiete von ökologischer Bedeutung wie potenzielle Brut-, Aufzucht- oder Paarungsgebiete zu identifizieren.', ES: 'Nuestra colaboración: durante cada inmersión registramos las especies que encontramos y contribuimos con estas observaciones al proyecto — mejorando la comprensión de la estacionalidad de las especies e identificando áreas de importancia ecológica como posibles zonas de cría, vivero o apareamiento.' },
 elasmo_follow: { EN: 'Follow on Instagram ', PT: 'Seguir no Instagram ', DE: 'Auf Instagram folgen ', ES: 'Seguir en Instagram ' },
 contact_name_placeholder: { EN: 'Your name', PT: 'O seu nome', DE: 'Dein Name', ES: 'Su nombre' },
 contact_msg_placeholder: { EN: 'How can we help?', PT: 'Como podemos ajudar?', DE: 'Wie können wir helfen?', ES: '¿En qué podemos ayudarle?' },

 // Missing strings fixed
 dives_page_h2: { EN: 'Daily Double Dive in São Miguel', PT: 'Mergulho Duplo Diário em São Miguel', DE: 'Täglicher Doppel-Tauchgang auf São Miguel', ES: 'Inmersión Doble Diaria en São Miguel' },
 card_title_dd: { EN: 'Daily Double Dive', PT: 'Mergulho Duplo Diário', DE: 'Täglicher Doppel-Tauchgang', ES: 'Inmersión Doble Diaria' },
 card_title_owd_course:{ EN: 'Open Water Course', PT: 'Curso Open Water', DE: 'Open Water Kurs', ES: 'Curso Open Water' },
 card_unit_2dives: { EN: '/ 2 dives', PT: '/ 2 mergulhos', DE: '/ 2 Tauchgänge', ES: '/ 2 inmersiones' },
 card_unit_person: { EN: '/ person', PT: '/ pessoa', DE: '/ Person', ES: '/ persona' },
 card_unit_allin: { EN: 'all-in', PT: 'tudo incluído', DE: 'alles inklusive', ES: 'todo incluido' },
 equip_ask_us: { EN: 'ask us', PT: 'consultar', DE: 'anfragen', ES: 'consultar' },
 cd_not_found: { EN: 'Course not found.', PT: 'Curso não encontrado.', DE: 'Kurs nicht gefunden.', ES: 'Curso no encontrado.' },
 badge_local_ssi: { EN: 'LOCAL SSI SPECIALTY', PT: 'ESPECIALIDADE SSI LOCAL', DE: 'LOKALE SSI-SPEZIALITÄT', ES: 'ESPECIALIDAD SSI LOCAL' },
 formigas_review_q: { EN: "The crossing alone was worth the trip — 2.5 hours of open Atlantic and then a seamount rising from the blue. We saw devil rays on both dives. I’ve been diving for fifteen years. Formigas goes straight to the top.", PT: 'A travessia por si só valeu a viagem — 2,5 horas de Atlântico aberto e depois um monte submarino a emergir do azul. Vimos raias diabólicas em ambos os mergulhos. Mergulho há quinze anos. Formigas vai diretamente para o topo.', DE: 'Die Überfahrt allein war die Reise wert — 2,5 Stunden offener Atlantik und dann ein Seamount, der aus dem Blau auftaucht. Wir sahen Teufelsrochen bei beiden Tauchgängen. Ich tauche seit fünfzehn Jahren. Formigas steht ganz oben.', ES: 'La travesía por sí sola mereció el viaje — 2,5 horas de Atlántico abierto y luego un monte submarino emergiendo del azul. Vimos mantas diabólicas en ambas inmersiones. Llevo quince años buceando. Formigas va directamente al primer puesto.' },
 formigas_review_author: { EN: 'Michael H., Berlin', PT: 'Michael H., Berlim', DE: 'Michael H., Berlin', ES: 'Michael H., Berlín' },
 hero_location: { EN: 'São Miguel · Azores · Mid-Atlantic', PT: 'São Miguel · Açores · Atlântico Norte', DE: 'São Miguel · Azoren · Nordatlantik', ES: 'São Miguel · Azores · Atlántico Norte' },
 contact_hours_full: { EN: 'Daily 8:00–20:00', PT: 'Todos os dias 8:00–20:00', DE: 'Täglich 8:00–20:00', ES: 'Diariamente 8:00–20:00' },

 // Course card short descriptions
 cdisc_basic_diver: { EN: 'Pool + harbour dive · SSI certification · no experience needed', PT: 'Piscina + mergulho no porto · certificação SSI · sem experiência necessária', DE: 'Pool + Hafentauchgang · SSI-Zertifizierung · keine Erfahrung nötig', ES: 'Piscina + inmersión en puerto · certificación SSI · sin experiencia necesaria' },
 cdisc_scuba_diver: { EN: '3 days · 12 m cert · halfway to OWD', PT: '3 dias · cert. a 12 m · a meio caminho do OWD', DE: '3 Tage · 12-m-Zert. · halbwegs zum OWD', ES: '3 días · cert. a 12 m · a mitad del camino al OWD' },
 cdisc_open_water_diver: { EN: '~4 days · 18 m worldwide · equipment incl.', PT: '~4 dias · 18 m mundial · equipamento incluído', DE: '~4 Tage · 18 m weltweit · Ausrüstung inklusive', ES: '~4 días · 18 m mundial · equipo incl.' },
 cdisc_skills_update: { EN: 'Refresher for certified divers back in the water', PT: 'Atualização para mergulhadores certificados que regressam à água', DE: 'Auffrischung für zertifizierte Taucher beim Wiedereinstieg', ES: 'Actualización para buceadores certificados que vuelven al agua' },
 cdisc_ssi_explorers: { EN: 'Aquatic adventure program for young ocean explorers from age 6', PT: 'Programa de aventura aquática para jovens exploradores oceânicos a partir dos 6 anos', DE: 'Aquatisches Abenteuerprogramm für junge Ozean-Entdecker ab 6 Jahren', ES: 'Programa de aventura acuática para jóvenes exploradores del océano desde los 6 años' },
 cdisc_upgrade_owd: { EN: 'Already Scuba Diver? Level up', PT: 'Já é Scuba Diver? Suba de nível', DE: 'Schon Scuba Diver? Jetzt aufstufen', ES: '¿Ya eres Scuba Diver? Sube de nivel' },
 cdisc_advanced_open_water_diver: { EN: '5 adventure dives incl. deep & nav · 30 m', PT: '5 mergulhos de aventura incl. fundo & nav · 30 m', DE: '5 Abenteuertauchgänge inkl. Tief & Nav · 30 m', ES: '5 inmersiones de aventura incl. profundidad & nav · 30 m' },
 cdisc_deep_diving: { EN: 'Down to 40 m · gas management & narcosis', PT: 'Até 40 m · gestão de gás & narcose', DE: 'Bis 40 m · Gasmanagement & Narkose', ES: 'Hasta 40 m · gestión de gas y narcosis' },
 cdisc_perfect_buoyancy: { EN: 'Trim & neutral float — transforms every dive', PT: 'Trim & flutuação neutra — transforma cada mergulho', DE: 'Trim & Schwebezustand — verändert jeden Tauchgang', ES: 'Trim y flotabilidad neutra — transforma cada inmersión' },
 cdisc_night_diving: { EN: 'Torch nav, altered marine life, new world', PT: 'Nav com tocha, vida marinha alterada, novo mundo', DE: 'Taschenlampen-Nav, verändertes Meeresleben, neue Welt', ES: 'Nav con linterna, vida marina transformada, nuevo mundo' },
 cdisc_waves_tides_currents: { EN: 'Essential for Formigas — read the current', PT: 'Essencial para Formigas — leia a corrente', DE: 'Unverzichtbar für Formigas — Strömungen lesen', ES: 'Esencial para Formigas — lee la corriente' },
 cdisc_wreck_diving: { EN: 'Dori & beyond · non-penetration & safety skills', PT: 'Dori & além · sem penetração & competências de segurança', DE: 'Dori & mehr · Nicht-Penetration & Sicherheitsfähigkeiten', ES: 'Dori y más · sin penetración y habilidades de seguridad' },
 cdisc_navigation: { EN: 'Compass mastery & natural reference points', PT: 'Domínio da bússola & pontos de referência naturais', DE: 'Kompassbeherrschung & natürliche Orientierungspunkte', ES: 'Dominio de brújula y puntos de referencia naturales' },
 cdisc_photo_video: { EN: 'Camera, lighting, composition — capture the underwater world', PT: 'Câmara, iluminação, composição — capture o mundo subaquático', DE: 'Kamera, Beleuchtung, Komposition — halte die Unterwasserwelt fest', ES: 'Cámara, iluminación, composición — captura el mundo submarino' },
 cdisc_computer_diving: { EN: 'Master your dive computer — plan and log dives safely', PT: 'Domine o computador de mergulho — planeie e registe mergulhos com segurança', DE: 'Tauchcomputer meistern — Tauchgänge sicher planen und protokollieren', ES: 'Domina tu ordenador de buceo — planifica y registra inmersiones con seguridad' },
 cdisc_boat_diving: { EN: 'Entries, exits, etiquette — get the most from every boat trip', PT: 'Entradas, saídas, etiqueta — aproveite ao máximo cada saída de barco', DE: 'Ein- und Ausstiege, Etikette — das Beste aus jeder Bootsfahrt herausholen', ES: 'Entradas, salidas, etiqueta — saca el máximo de cada salida en barco' },
 cdisc_offshore_prep: { EN: 'SMB · drift entry · current reading — our signature programme for Atlantic offshore diving, developed for these waters', PT: 'SMB · entrada em deriva · leitura de corrente — o nosso programa exclusivo para mergulho offshore no Atlântico, desenvolvido para estas águas', DE: 'SMB · Drift-Einstieg · Strömungslesen — unser Vorzeigeprogramm für atlantisches Offshore-Tauchen, entwickelt für diese Gewässer', ES: 'SMB · entrada en deriva · lectura de corriente — nuestro programa exclusivo para el buceo offshore atlántico, desarrollado para estas aguas' },
 cdisc_react_right: { EN: 'SSI first aid & CPR — prerequisite for Rescue', PT: 'Primeiros socorros & RCP SSI — pré-requisito para Resgate', DE: 'SSI Erste Hilfe & CPR — Voraussetzung für Rescue', ES: 'Primeros auxilios y RCP de SSI — prerrequisito para Rescue' },
 cdisc_stress_rescue: { EN: 'Full rescue incl. React Right — the best course most divers ever take', PT: 'Resgate completo incl. React Right — o melhor curso que a maioria dos mergulhadores faz', DE: 'Vollrettung inkl. React Right — der beste Kurs, den die meisten Taucher je machen', ES: 'Rescate completo incl. React Right — el mejor curso que hacen la mayoría de los buceadores' },
 cdisc_science_diving: { EN: 'Physics, physiology & the theory behind the manual', PT: 'Física, fisiologia & a teoria por trás do manual', DE: 'Physik, Physiologie & die Theorie hinter dem Handbuch', ES: 'Física, fisiología y la teoría detrás del manual' },
 cdisc_dive_guide: { EN: 'Lead certified divers — first professional rating', PT: 'Liderar mergulhadores certificados — primeira classificação profissional', DE: 'Zertifizierte Taucher führen — erste professionelle Bewertung', ES: 'Guiar a buceadores certificados — primera calificación profesional' },
 cdisc_divemaster: { EN: "SSI's top pro rating — includes Science of Diving", PT: 'A classificação profissional máxima da SSI — inclui Science of Diving', DE: 'SSIs höchste Pro-Bewertung — beinhaltet Science of Diving', ES: 'La calificación profesional máxima de SSI — incluye Science of Diving' },
 cdisc_blue_oceans: { EN: 'Ocean conservation · sustainability · citizen science', PT: 'Conservação do oceano · sustentabilidade · ciência cidadã', DE: 'Meeresschutz · Nachhaltigkeit · Bürgerwissenschaft', ES: 'Conservación del océano · sostenibilidad · ciencia ciudadana' },
 cdisc_manta_ray_ecology: { EN: 'Biology, behaviour & ID of rays and mantas', PT: 'Biologia, comportamento & ID de raias e mantas', DE: 'Biologie, Verhalten & Bestimmung von Rochen und Mantas', ES: 'Biología, comportamiento e ID de rayas y mantas' },
 cdisc_marine_invertebrate_ecology: { EN: 'Echinoderms, mollusks, crustaceans — life without a spine', PT: 'Equinodermes, moluscos, crustáceos — vida sem coluna', DE: 'Stachelhäuter, Weichtiere, Krebstiere — Leben ohne Wirbelsäule', ES: 'Equinodermos, moluscos, crustáceos — vida sin columna' },
 cdisc_marine_mammal_ecology: { EN: 'Dolphins, whales & cetacean biology', PT: 'Golfinhos, baleias & biologia dos cetáceos', DE: 'Delfine, Wale & Cetaceen-Biologie', ES: 'Delfines, ballenas y biología de cetáceos' },
 cdisc_nudibranch_ecology: { EN: 'Spot, ID and understand the most colourful slugs on the reef', PT: 'Identificar e compreender as lesmas mais coloridas do recife', DE: 'Die farbenprächtigsten Schnecken am Riff entdecken, bestimmen und verstehen', ES: 'Identificar y entender las babosas más coloridas del arrecife' },
 cdisc_fish_identification: { EN: 'Name the locals — Atlantic reef fish ID', PT: 'Conheça os locais — ID de peixes de recife atlântico', DE: 'Die Einheimischen kennen — Atlantische Riff-Fischbestimmung', ES: 'Conoce a los locales — ID de peces de arrecife atlántico' },
 cdisc_coral_identification: { EN: 'Identify corals, sponges and reef structures', PT: 'Identificar corais, esponjas e estruturas de recife', DE: 'Korallen, Schwämme und Riffstrukturen bestimmen', ES: 'Identificar corales, esponjas y estructuras arrecifales' },
 // Cookie consent banner
 cookie_title: { EN: 'We use cookies', PT: 'Utilizamos cookies', DE: 'Wir verwenden Cookies', ES: 'Usamos cookies' },
 cookie_desc: { EN: 'We use Google Analytics to understand how visitors use our site. Analytics cookies are only set after you accept. You can change your choice at any time.',
 PT: 'Utilizamos o Google Analytics para compreender como os visitantes usam o nosso site. Os cookies de análise só são ativados após a sua aceitação. Pode alterar a sua escolha a qualquer momento.',
 DE: 'Wir verwenden Google Analytics, um zu verstehen, wie Besucher unsere Website nutzen. Analytics-Cookies werden nur nach deiner Zustimmung gesetzt. Du kannst deine Entscheidung jederzeit ändern.',
 ES: 'Utilizamos Google Analytics para entender cómo los visitantes usan nuestro sitio. Las cookies de análisis solo se activan tras su aceptación. Puede cambiar su elección en cualquier momento.' },
 cookie_accept: { EN: 'Accept all', PT: 'Aceitar tudo', DE: 'Alle akzeptieren', ES: 'Aceptar todo' },
 cookie_reject: { EN: 'Reject non-essential', PT: 'Rejeitar não essenciais', DE: 'Nicht notwendige ablehnen', ES: 'Rechazar no esenciales' },
 cookie_more: { EN: 'Privacy Policy', PT: 'Política de Privacidade', DE: 'Datenschutzerklärung', ES: 'Política de Privacidad' },
 nav_privacy: { EN: 'Privacy Policy', PT: 'Política de Privacidade', DE: 'Datenschutzerklärung', ES: 'Política de Privacidad' },
} as const

export const s = {
 accent: 'var(--accent)',
  bg: 'var(--bg)',
  bgDark: 'var(--bg)',
 text: 'var(--text)',
 muted: 'var(--muted)',
 sub: 'var(--muted)',
 font: `var(--font-geist-sans), sans-serif`,
}

export const inputStyle: React.CSSProperties = {
 width: '100%', background: 'transparent', color: 'var(--text)',
 border: '1px solid color-mix(in srgb, var(--text) 45%, transparent)', borderRadius: 0,
 padding: '12px', fontSize: '14px', fontFamily: s.font,
 outline: 'none', boxSizing: 'border-box',
}

export const bookBtnStyle: React.CSSProperties = {
 display: 'inline-flex',
 alignItems: 'center',
 justifyContent: 'center',
 background: 'transparent',
 color: 'var(--text)',
 fontWeight: 500,
 fontSize: '14px',
 letterSpacing: '0.08em',
 textTransform: 'uppercase',
 padding: '12px 18px',
 borderRadius: 0,
 boxShadow: 'none',
 textDecoration: 'none',
 cursor: 'pointer',
 border: '1px solid color-mix(in srgb, var(--text) 55%, transparent)',
 fontFamily: s.font,
}

export function Breadcrumb({ label, homeLabel = 'Home', goHome }: { label: string; homeLabel?: string; goHome: () => void }) {
 return (
 <div style={{ color: s.muted, marginBottom: '24px', fontSize: '14px' }}>
 <button type="button" onClick={goHome} style={{ color: s.accent, cursor: 'pointer', background: 'none', border: 'none', padding: 0, fontFamily: s.font }}>{homeLabel}</button> / {label}
 </div>
 )
}

export function fireEvent(name: string, params?: Record<string, unknown>) {
 try { (window as any).gtag?.('event', name, params ?? {}) } catch {}
}

export function useIsMobile() {
 const [isMobile, setIsMobile] = React.useState(false)
 React.useEffect(() => {
 const check = () => setIsMobile(window.innerWidth < 1000)
 check()
 window.addEventListener('resize', check)
 return () => window.removeEventListener('resize', check)
 }, [])
 return isMobile
}

export const AVATAR = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%230a1e38'/%3E%3Ccircle cx='50' cy='36' r='20' fill='%231a3a6a'/%3E%3Cellipse cx='50' cy='88' rx='30' ry='24' fill='%231a3a6a'/%3E%3C/svg%3E`

export const TEAM = [
 { name: 'Emanuel', role: 'Director · Skipper · Assistant Instructor Trainer', photo: '/team/Emanuel.webp', langs: ['','',''] },
 { name: 'Cláudia', role: 'Management · Front Office', photo: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/team/Claudia.webp', langs: ['','',''] },
 { name: 'Paulo', role: 'Divemaster Instructor · Skipper', photo: '/team/Paulo.webp', langs: ['','',''] },
 { name: 'Milton', role: 'Divemaster · Skipper', photo: '/team/Milton.webp', langs: ['','',''] },
 { name: 'Célia', role: 'SSI Instructor · Biologist · Skipper', photo: '/team/Celia.webp', langs: ['','',''] },
 { name: 'André', role: 'Divemaster Instructor · Skipper · Gas Blender (Nitrox & Trimix)', photo: '/team/andre.webp', langs: ['','',''] },
 { name: 'Fatema', role: 'SSI Instructor · PADI Instructor · Skipper · Marine Biologist', photo: '/team/Fatema.webp', langs: ['','',''] },
 { name: 'Vasco', role: 'SSI Instructor · Marine Biologist · Skipper', photo: '/team/Vasco.webp', langs: ['','','',''] },
 { name: 'Carolina', role: 'Divemaster · Skipper · Marketing', photo: '/team/Carolina.webp', langs: ['',''] },
 { name: 'João Tomás', role: 'Skipper · Crew', photo: '/team/joao-tomas.webp',langs: ['',''] },
 { name: 'Lucas', role: 'SSI Instructor · IT · Marketing', photo: '/team/Lucas.webp', langs: ['','','',''] },
 { name: 'Florian', role: 'SSI Instructor · IT', photo: AVATAR, langs: ['',''] },
 { name: 'Lois', role: 'SSI Instructor · Biologist · Underwater Photographer', photo: '/team/Lois.webp', langs: ['','',''] },
 { name: 'Sergi', role: 'Biologist · Oceanographer · Guide · Front Office', photo: '/team/Sergi.webp', langs: ['','',''] },
 { name: 'Sergio', role: 'Oceanographer · Marine Biologist · Guide · Front Office', photo: '/team/Sergio.webp', langs: ['','',''] },
 { name: 'Noa', role: 'Front Office · Crew', photo: '/team/Noa.webp', langs: ['','',''] },
 { name: 'Justýna', role: 'Front Office · Divemaster · Skipper', photo: AVATAR, langs: ['','',''] },
 { name: 'Oier', role: 'Front Office · Crew', photo: '/team/Oier.webp', langs: ['','',''] },
 { name: 'Laura', role: 'Oceanographer · Marine Biologist · Skipper · Guide', photo: '/team/Laura.webp', langs: ['','',''] },
 { name: 'Marta', role: 'Oceanographer · Marine Biologist · Guide · Front Office', photo: '/team/Marta.webp', langs: ['','',''] },
 { name: 'Paulo T.', role: 'SSI Instructor · Skipper', photo: AVATAR, langs: ['',''] },
]

export const LANG_FLAG: Record<string, string> = {
 PT:'',EN:'',DE:'',FR:'',ES:'',IT:'',NL:'',RU:'',
 ZH:'',JA:'',AR:'',KO:'',SV:'',DA:'',NO:'',FI:'',
 PL:'',CS:'',HU:'',RO:'',BG:'',HR:'',UK:'',SR:'',
 EL:'',TR:'',HE:'',ID:'',MS:'',TH:'',VI:'',HI:'',
}


