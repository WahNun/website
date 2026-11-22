'use client'
import React from 'react'
import { T, s, bookBtnStyle, fireEvent, useIsMobile, Breadcrumb, type Lang } from './_shared'

type MLStr = { EN: string; PT: string; DE: string; ES: string }
type CourseDetail = {
 id: string; name: string; price: string; img?: string;
 tagline: MLStr; intro: MLStr; body: MLStr[]; highlights: MLStr[]; includes: MLStr[]
 prereqs: MLStr; duration: MLStr; dives: MLStr; depth: MLStr; certifies: MLStr
 accentColor: string
 noBook?: boolean
 testimonial?: { quote: string; author: string; source: string }
}

const COURSE_DETAIL: Record<string, CourseDetail> = {
 'basic-diver': {
 id: 'basic-diver', name: 'Basic Diver', price: '€139', img: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses/try-scuba-hero.webp', accentColor: '#b7c4b0',
 tagline: {
 EN: 'Your first real dive. Your first SSI certification.',
 PT: 'O seu primeiro mergulho real. A sua primeira certificação SSI.',
 DE: 'Dein erster echter Tauchgang. Deine erste SSI-Zertifizierung.',
 ES: 'Tu primera inmersión real. Tu primera certificación SSI.',
 },
 intro: {
 EN: 'No experience, no certification needed — the SSI Basic Diver programme is a half-day introduction to scuba diving with a real certification at the end. A confined water skills session in the marina seawater pool, followed by a guided dive in the calm harbour basin of Ponta Delgada. You leave with an official SSI Basic Diver card.',
 PT: 'Sem experiência, sem certificação necessária — o programa SSI Basic Diver é uma introdução de meio dia ao mergulho com uma certificação real no final. Uma sessão de competências em águas confinadas na piscina de água salgada da marina, seguida de um mergulho guiado na bacia portuária calma de Ponta Delgada. Sai com um cartão oficial SSI Basic Diver.',
 DE: 'Keine Erfahrung, keine Zertifizierung nötig — das SSI Basic Diver Programm ist eine halbtägige Einführung ins Tauchen mit einer echten Zertifizierung am Ende. Eine Fertigkeitssession im Meerwasserpool der Marina, gefolgt von einem geführten Tauchgang im ruhigen Hafenbecken von Ponta Delgada. Du verlässt uns mit einer offiziellen SSI Basic Diver Karte.',
 ES: 'Sin experiencia, sin certificación necesaria — el programa SSI Basic Diver es una introducción de medio día al buceo con una certificación real al final. Una sesión de habilidades en aguas confinadas en la piscina de agua salada del puerto, seguida de una inmersión guiada en la tranquila dársena de Ponta Delgada. Se va con una tarjeta oficial SSI Basic Diver.',
 },
 body: [
 {
 EN: 'We start in the marina seawater pool — sheltered, calm, right at the base. You learn how to breathe through the regulator, equalise your ears and signal to your instructor before entering open water. Online theory is completed beforehand via the MySSI app. Once you are comfortable in the pool, you move to the harbour basin: calm, protected water, max 12 m depth, with your instructor within arm\'s reach throughout.',
 PT: 'Começamos na piscina de água salgada da marina — abrigada, calma, mesmo na base. Aprende a respirar pelo regulador, equalizar os ouvidos e sinalizar ao instrutor antes de entrar em águas abertas. A teoria online é completada previamente através da aplicação MySSI. Assim que estiver confortável na piscina, passa para a bacia portuária: águas calmas e protegidas, profundidade máxima de 12 m, com o instrutor sempre ao seu alcance.',
 DE: 'Wir beginnen im Meerwasserpool der Marina — geschützt, ruhig, direkt an der Basis. Du lernst, durch den Atemregler zu atmen, den Druckausgleich zu machen und dem Instruktor zu signalisieren, bevor du ins offene Wasser gehst. Die Online-Theorie wird vorher über die MySSI-App absolviert. Sobald du dich im Pool wohlfühlst, wechselst du ins Hafenbecken: ruhiges, geschütztes Wasser, max. 12 m Tiefe, mit dem Instruktor immer in Reichweite.',
 ES: 'Comenzamos en la piscina de agua salada del puerto — protegida, tranquila, justo en la base. Aprende a respirar a través del regulador, a compensar los oídos y a señalizar al instructor antes de entrar al mar abierto. La teoría online se completa previamente a través de la app MySSI. Una vez cómodo en la piscina, se pasa a la dársena del puerto: aguas tranquilas y protegidas, profundidad máxima de 12 m, con el instructor siempre al alcance.',
 },
 {
 EN: 'Unlike introductory experiences, the Basic Diver programme is a genuine SSI certification (ISO 11121). Your Basic Diver card is valid for 6 months and lets you dive under direct SSI instructor supervision. It also counts towards the full Scuba Diver or Open Water Diver course if you continue within that window. Groups are always small — never more than 2 students per instructor.',
 PT: 'Ao contrário das experiências introdutórias, o programa Basic Diver é uma certificação SSI genuína (ISO 11121). O seu cartão Basic Diver é válido por 6 meses e permite-lhe mergulhar sob supervisão direta de um instrutor SSI. Também conta para o curso completo Scuba Diver ou Open Water Diver se continuar dentro dessa janela temporal. Os grupos são sempre pequenos — nunca mais de 2 alunos por instrutor.',
 DE: 'Im Gegensatz zu Schnuppertauchgängen ist das Basic Diver Programm eine echte SSI-Zertifizierung (ISO 11121). Deine Basic Diver Karte ist 6 Monate gültig und erlaubt dir das Tauchen unter direkter SSI-Instruktor-Aufsicht. Sie zählt auch für den vollständigen Scuba Diver oder Open Water Diver Kurs, wenn du innerhalb dieses Zeitfensters weitermachst. Gruppen sind immer klein — nie mehr als 2 Schüler pro Instruktor.',
 ES: 'A diferencia de las experiencias introductorias, el programa Basic Diver es una certificación SSI genuina (ISO 11121). Su tarjeta Basic Diver es válida por 6 meses y le permite bucear bajo supervisión directa de un instructor SSI. También cuenta para el curso completo Scuba Diver u Open Water Diver si continúa dentro de esa ventana. Los grupos son siempre pequeños — nunca más de 2 alumnos por instructor.',
 },
 ],
 highlights: [
 { EN: 'Confined water skills in marina seawater pool', PT: 'Competências em águas confinadas na piscina da marina', DE: 'Fertigkeiten im Meerwasserpool der Marina', ES: 'Habilidades en aguas confinadas en la piscina del puerto' },
 { EN: 'Harbour dive — calm, sheltered, max 12 m', PT: 'Mergulho no porto — calmo, abrigado, máx. 12 m', DE: 'Hafentauchgang — ruhig, geschützt, max. 12 m', ES: 'Inmersión en el puerto — tranquila, protegida, máx. 12 m' },
 { EN: 'All equipment included — no experience needed', PT: 'Todo o equipamento incluído — sem experiência necessária', DE: 'Gesamte Ausrüstung inklusive — keine Erfahrung nötig', ES: 'Todo el equipo incluido — sin experiencia necesaria' },
 { EN: 'Official SSI Basic Diver certification (ISO 11121)', PT: 'Certificação oficial SSI Basic Diver (ISO 11121)', DE: 'Offizielle SSI Basic Diver Zertifizierung (ISO 11121)', ES: 'Certificación oficial SSI Basic Diver (ISO 11121)' },
 ],
 includes: [
 { EN: 'All equipment (wetsuit, BCD, regulator, tank, weights)', PT: 'Todo o equipamento (fato de mergulho, BCD, regulador, botija, lastros)', DE: 'Gesamte Ausrüstung (Neoprenanzug, Tarierjacke, Atemregler, Flasche, Blei)', ES: 'Todo el equipo (traje de neopreno, BCD, regulador, botella, plomos)' },
 { EN: 'Online theory (MySSI app)', PT: 'Teoria online (app MySSI)', DE: 'Online-Theorie (MySSI-App)', ES: 'Teoría online (app MySSI)' },
 { EN: 'Confined water skills session (marina pool)', PT: 'Sessão de competências em águas confinadas (piscina da marina)', DE: 'Fertigkeitssession im Flachwasser (Marina-Pool)', ES: 'Sesión de habilidades en aguas confinadas (piscina del puerto)' },
 { EN: '1 guided harbour dive to max 12 m', PT: '1 mergulho guiado no porto até 12 m', DE: '1 geführter Hafentauchgang bis max. 12 m', ES: '1 inmersión guiada en el puerto hasta 12 m' },
 { EN: 'Marine insurance', PT: 'Seguro marítimo', DE: 'Meeresversicherung', ES: 'Seguro marítimo' },
 { EN: 'SSI Basic Diver digital certification card', PT: 'Cartão digital de certificação SSI Basic Diver', DE: 'Digitale SSI Basic Diver Zertifizierungskarte', ES: 'Tarjeta digital de certificación SSI Basic Diver' },
 ],
 prereqs: {
 EN: 'None — minimum age 10. Just be comfortable in water.',
 PT: 'Nenhum — idade mínima 10 anos. Basta estar confortável na água.',
 DE: 'Keine — Mindestalter 10 Jahre. Nur Wohlbefinden im Wasser erforderlich.',
 ES: 'Ninguno — edad mínima 10 años. Solo sentirse cómodo en el agua.',
 },
 duration: { EN: 'Half day (~3 hours)', PT: 'Meio dia (~3 horas)', DE: 'Halber Tag (~3 Stunden)', ES: 'Medio día (~3 horas)' },
 dives: { EN: 'Confined skills + 1 harbour dive', PT: 'Competências em piscina + 1 mergulho no porto', DE: 'Pool-Fertigkeiten + 1 Hafentauchgang', ES: 'Habilidades en piscina + 1 inmersión en el puerto' },
 depth: { EN: 'Max 12 m / 40 ft', PT: 'Máx. 12 m / 40 ft', DE: 'Max. 12 m / 40 ft', ES: 'Máx. 12 m / 40 ft' },
 certifies: { EN: 'SSI Basic Diver (ISO 11121)', PT: 'SSI Basic Diver (ISO 11121)', DE: 'SSI Basic Diver (ISO 11121)', ES: 'SSI Basic Diver (ISO 11121)' },
 testimonial: { quote: 'We were with this dive outfit for 3 days and they are awesome. Very responsive on WhatsApp where we got to ask many questions before booking. Staff is super friendly. Amazing!', author: 'Aylin M.', source: 'Google Reviews' },
 },
 'scuba-diver': {
 id: 'scuba-diver', name: 'Scuba Diver', price: '€320', img: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses/scuba-diver.webp', accentColor: '#b7c4b0',
 tagline: {
 EN: 'Certified in 3 days. Dive to 12 m.',
 PT: 'Certificado em 3 dias. Mergulhe até 12 m.',
 DE: 'Zertifiziert in 3 Tagen. Tauchen bis 12 m.',
 ES: 'Certificado en 3 días. Bucea hasta 12 m.',
 },
 intro: {
 EN: 'The SSI Scuba Diver is the perfect course if you have limited time but want a real, globally-recognised certification. Three days, two pool sessions, two ocean dives — and a card that lets you dive anywhere in the world with a professional guide.',
 PT: 'O SSI Scuba Diver é o curso perfeito se tem tempo limitado mas quer uma certificação real, reconhecida mundialmente. Três dias, duas sessões em piscina, dois mergulhos no oceano — e um cartão que lhe permite mergulhar em qualquer parte do mundo com um guia profissional.',
 DE: 'Der SSI Scuba Diver ist der ideale Kurs, wenn du wenig Zeit hast, aber eine echte, weltweit anerkannte Zertifizierung willst. Drei Tage, zwei Pool-Sessions, zwei Ozean-Tauchgänge — und eine Karte, mit der du überall auf der Welt mit einem professionellen Guide tauchen kannst.',
 ES: 'El SSI Scuba Diver es el curso perfecto si tiene tiempo limitado pero quiere una certificación real y reconocida mundialmente. Tres días, dos sesiones en piscina, dos inmersiones en el océano — y una tarjeta que le permite bucear en cualquier lugar del mundo con un guía profesional.',
 },
 body: [
 {
 EN: 'You cover the theory online before arriving — download the MySSI app in EN, PT, DE or ES and work through it at your own pace. Our time together on the water is maximised: two pool sessions to master buoyancy, equipment assembly and safety skills, then two ocean dives to 12 m on the volcanic reefs and arches around Ponta Delgada.',
 PT: 'A teoria é feita online antes de chegar — descarregue a app MySSI em PT, EN, DE ou ES e trabalhe ao seu ritmo. O nosso tempo na água é maximizado: duas sessões em piscina para dominar a flutuação, montagem do equipamento e competências de segurança, depois dois mergulhos no oceano até 12 m nos recifes e arcos vulcânicos em redor de Ponta Delgada.',
 DE: 'Die Theorie absolvierst du online vor der Anreise — lade die MySSI-App herunter (in über 40 Sprachen verfügbar) und arbeite in deinem eigenen Tempo. Unsere gemeinsame Zeit auf dem Wasser wird maximiert: zwei Pool-Sessions zum Beherrschen von Auftrieb, Ausrüstungsaufbau und Sicherheitsfähigkeiten, dann zwei Ozean-Tauchgänge bis 12 m an den Vulkanriffen und Bögen rund um Ponta Delgada.',
 ES: 'La teoría se hace online antes de llegar — descargue la app MySSI en ES, EN, PT o DE y trabaje a su propio ritmo. Maximizamos el tiempo juntos en el agua: dos sesiones en piscina para dominar la flotabilidad, el montaje del equipo y las habilidades de seguridad, luego dos inmersiones en el océano hasta 12 m en los arrecifes y arcos volcánicos alrededor de Ponta Delgada.',
 },
 {
 EN: 'The Scuba Diver certification is exactly half the full Open Water Diver curriculum. If you decide you want the complete OWD card, just two more ocean dives and you\'re there — you can do it the same trip or come back anytime. There\'s no pressure, but most guests go straight through.',
 PT: 'A certificação Scuba Diver é exatamente metade do currículo completo do Open Water Diver. Se decidir que quer o cartão OWD completo, bastam mais dois mergulhos no oceano — pode fazê-lo na mesma viagem ou regressar quando quiser. Sem pressão, mas a maioria dos hóspedes avança diretamente.',
 DE: 'Die Scuba Diver Zertifizierung ist genau die Hälfte des vollständigen Open Water Diver Lehrplans. Wenn du die komplette OWD-Karte möchtest, brauchst du nur zwei weitere Ozean-Tauchgänge — du kannst das auf derselben Reise erledigen oder jederzeit wiederkommen. Kein Druck, aber die meisten Gäste machen direkt weiter.',
 ES: 'La certificación Scuba Diver es exactamente la mitad del plan de estudios completo del Open Water Diver. Si decide que quiere la tarjeta OWD completa, solo dos inmersiones más en el océano y listo — puede hacerlo en el mismo viaje o volver cuando quiera. Sin presión, pero la mayoría de los huéspedes continúan directamente.',
 },
 ],
 highlights: [
 { EN: 'Certify in 3 days', PT: 'Certificação em 3 dias', DE: 'Zertifizierung in 3 Tagen', ES: 'Certificación en 3 días' },
 { EN: 'Dive to 12 m with a professional worldwide', PT: 'Mergulhe até 12 m com um profissional em todo o mundo', DE: 'Weltweit bis 12 m mit einem Profiguide tauchen', ES: 'Bucea hasta 12 m con un profesional en todo el mundo' },
 { EN: 'Upgrade to full OWD anytime — just 2 more dives', PT: 'Atualizar para OWD completo a qualquer momento — apenas 2 mergulhos a mais', DE: 'Jederzeit zum vollen OWD aufrüsten — nur 2 weitere Tauchgänge', ES: 'Mejora al OWD completo en cualquier momento — solo 2 inmersiones más' },
 { EN: 'Theory online at home before you arrive', PT: 'Teoria online em casa antes de chegar', DE: 'Online-Theorie zuhause vor der Anreise', ES: 'Teoría online en casa antes de llegar' },
 ],
 includes: [
 { EN: 'Digital theory access (MySSI app, EN/PT/DE/ES)', PT: 'Acesso à teoria digital (app MySSI, PT/EN/DE/ES)', DE: 'Digitaler Theoriezugang (MySSI-App, DE/EN/PT/ES)', ES: 'Acceso a teoría digital (app MySSI, ES/EN/PT/DE)' },
 { EN: '2 pool sessions', PT: '2 sessões em piscina', DE: '2 Pool-Sessions', ES: '2 sesiones en piscina' },
 { EN: '2 ocean dives to 12 m', PT: '2 mergulhos no oceano até 12 m', DE: '2 Ozean-Tauchgänge bis 12 m', ES: '2 inmersiones en el océano hasta 12 m' },
 { EN: 'All dive equipment', PT: 'Todo o equipamento de mergulho', DE: 'Gesamte Tauchausrüstung', ES: 'Todo el equipo de buceo' },
 { EN: 'SSI digital certification card', PT: 'Cartão digital de certificação SSI', DE: 'Digitale SSI-Zertifizierungskarte', ES: 'Tarjeta digital de certificación SSI' },
 { EN: 'Boat & insurance', PT: 'Barco e seguro', DE: 'Boot & Versicherung', ES: 'Barco y seguro' },
 ],
 prereqs: {
 EN: 'Fit to swim. Minimum age 10. No prior experience needed.',
 PT: 'Apto para nadar. Idade mínima 10 anos. Sem experiência prévia necessária.',
 DE: 'Schwimmfähig. Mindestalter 10 Jahre. Keine Vorerfahrung nötig.',
 ES: 'Apto para nadar. Edad mínima 10 años. Sin experiencia previa necesaria.',
 },
 duration: { EN: '3 days', PT: '3 dias', DE: '3 Tage', ES: '3 días' },
 dives: { EN: '2 ocean dives', PT: '2 mergulhos no oceano', DE: '2 Ozean-Tauchgänge', ES: '2 inmersiones en el océano' },
 depth: { EN: '12 m / 40 ft', PT: '12 m / 40 ft', DE: '12 m / 40 ft', ES: '12 m / 40 ft' },
 certifies: { EN: 'SSI Scuba Diver', PT: 'SSI Scuba Diver', DE: 'SSI Scuba Diver', ES: 'SSI Scuba Diver' },
 testimonial: { quote: 'Exceptional dive centre. Knowledgeable and professional staff. Ensured our safety and comfort throughout. Could not recommend more.', author: 'Harry H.', source: 'TripAdvisor' },
 },
 'upgrade-owd': {
 id: 'upgrade-owd', name: 'Upgrade OWD', price: '€300', img: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses/upgrade-owd.webp', accentColor: '#b7c4b0',
 tagline: {
 EN: "You're halfway there. Let's finish it.",
 PT: 'Já está a meio caminho. Vamos terminar.',
 DE: 'Du bist auf halbem Weg. Lass uns fertig werden.',
 ES: 'Ya estás a mitad de camino. Terminémoslo.',
 },
 intro: {
 EN: 'If you completed your SSI (or PADI) Scuba Diver certification and want the full Open Water Diver card, this upgrade gets you there efficiently. Two more ocean dives, a few remaining theory modules, and you walk away with the cert that opens every dive site on the planet.',
 PT: 'Se completou a certificação SSI (ou PADI) Scuba Diver e quer o cartão Open Water Diver completo, este upgrade leva-o lá de forma eficiente. Mais dois mergulhos no oceano, alguns módulos de teoria restantes, e sai com a certificação que abre todos os locais de mergulho do planeta.',
 DE: 'Wenn du deine SSI (oder PADI) Scuba Diver Zertifizierung abgeschlossen hast und die vollständige Open Water Diver Karte möchtest, bringt dich dieses Upgrade effizient ans Ziel. Zwei weitere Ozean-Tauchgänge, einige verbleibende Theoriemodule, und du verlässt uns mit der Zertifizierung, die jeden Tauchplatz der Welt öffnet.',
 ES: 'Si completó su certificación SSI (o PADI) Scuba Diver y quiere la tarjeta Open Water Diver completa, esta mejora le lleva allí de forma eficiente. Dos inmersiones más en el océano, algunos módulos de teoría restantes, y se va con la certificación que abre todos los sitios de buceo del planeta.',
 },
 body: [
 {
 EN: 'The Scuba Diver course already covers roughly half the OWD curriculum — you\'ve done the pool work and the foundation academics. The upgrade adds the remaining theory and two open water dives to 18 m. You\'ll explore sites you couldn\'t reach before: the upper walls of the Dori wreck, the deeper arches, and the lava channels that run down to the sand.',
 PT: 'O curso Scuba Diver já cobre aproximadamente metade do currículo OWD — já fez o trabalho em piscina e a teoria fundamental. O upgrade acrescenta a teoria restante e dois mergulhos em águas abertas até 18 m. Vai explorar locais que não conseguia atingir antes: as paredes superiores do naufrágio Dori, os arcos mais profundos e os canais de lava que descem até à areia.',
 DE: 'Der Scuba Diver Kurs deckt bereits ungefähr die Hälfte des OWD-Lehrplans ab — du hast die Pool-Arbeit und die grundlegende Theorie absolviert. Das Upgrade fügt die verbleibende Theorie und zwei Freiwassertauchgänge bis 18 m hinzu. Du erkundest Tauchplätze, die du vorher nicht erreichen konntest: die oberen Wände des Dori-Wracks, die tieferen Bögen und die Lavakanäle, die bis zum Sandboden führen.',
 ES: 'El curso Scuba Diver ya cubre aproximadamente la mitad del plan de estudios OWD — ya ha realizado el trabajo en piscina y la teoría fundamental. La mejora añade la teoría restante y dos inmersiones en aguas abiertas hasta 18 m. Explorará sitios que no podía alcanzar antes: las paredes superiores del pecio Dori, los arcos más profundos y los canales de lava que descienden hasta la arena.',
 },
 {
 EN: 'The full OWD certification gives you independent dive privileges to 18 m worldwide — no guide required. It\'s the globally recognised standard that every dive centre on the planet accepts without question.',
 PT: 'A certificação OWD completa dá-lhe privilégios de mergulho independente até 18 m em todo o mundo — sem necessidade de guia. É o padrão reconhecido mundialmente que todos os centros de mergulho do planeta aceitam sem questionar.',
 DE: 'Die vollständige OWD-Zertifizierung gibt dir unabhängige Tauchprivilegien bis 18 m weltweit — kein Guide erforderlich. Es ist der weltweit anerkannte Standard, den jedes Tauchzentrum auf dem Planeten ohne Fragen akzeptiert.',
 ES: 'La certificación OWD completa le otorga privilegios de buceo independiente hasta 18 m en todo el mundo — sin necesidad de guía. Es el estándar reconocido mundialmente que todos los centros de buceo del planeta aceptan sin cuestionarlo.',
 },
 ],
 highlights: [
 { EN: 'Only 2 extra ocean dives needed', PT: 'Apenas 2 mergulhos extra no oceano necessários', DE: 'Nur 2 weitere Ozean-Tauchgänge nötig', ES: 'Solo 2 inmersiones en el océano adicionales necesarias' },
 { EN: 'Completes your worldwide 18 m certification', PT: 'Completa a sua certificação mundial a 18 m', DE: 'Vervollständigt deine weltweite 18-m-Zertifizierung', ES: 'Completa su certificación mundial de 18 m' },
 { EN: 'Valid from any recognised Scuba Diver cert (SSI, PADI, etc.)', PT: 'Válido a partir de qualquer certificação Scuba Diver reconhecida (SSI, PADI, etc.)', DE: 'Gültig ab jeder anerkannten Scuba Diver Zertifizierung (SSI, PADI usw.)', ES: 'Válido desde cualquier certificación Scuba Diver reconocida (SSI, PADI, etc.)' },
 { EN: 'Dive independently worldwide after completion', PT: 'Mergulhar de forma independente em todo o mundo após conclusão', DE: 'Nach Abschluss weltweit unabhängig tauchen', ES: 'Bucear de forma independiente en todo el mundo tras la finalización' },
 ],
 includes: [
 { EN: '2 ocean dives to 18 m', PT: '2 mergulhos no oceano até 18 m', DE: '2 Ozean-Tauchgänge bis 18 m', ES: '2 inmersiones en el océano hasta 18 m' },
 { EN: 'Remaining OWD theory modules (MySSI)', PT: 'Módulos de teoria OWD restantes (MySSI)', DE: 'Verbleibende OWD-Theoriemodule (MySSI)', ES: 'Módulos de teoría OWD restantes (MySSI)' },
 { EN: 'All dive equipment', PT: 'Todo o equipamento de mergulho', DE: 'Gesamte Tauchausrüstung', ES: 'Todo el equipo de buceo' },
 { EN: 'SSI OWD digital certification card', PT: 'Cartão digital de certificação SSI OWD', DE: 'Digitale SSI OWD Zertifizierungskarte', ES: 'Tarjeta digital de certificación SSI OWD' },
 { EN: 'Boat & insurance', PT: 'Barco e seguro', DE: 'Boot & Versicherung', ES: 'Barco y seguro' },
 ],
 prereqs: {
 EN: 'SSI or PADI Scuba Diver certification.',
 PT: 'Certificação SSI ou PADI Scuba Diver.',
 DE: 'SSI oder PADI Scuba Diver Zertifizierung.',
 ES: 'Certificación SSI o PADI Scuba Diver.',
 },
 duration: { EN: '1–2 days', PT: '1–2 dias', DE: '1–2 Tage', ES: '1–2 días' },
 dives: { EN: '2 ocean dives', PT: '2 mergulhos no oceano', DE: '2 Ozean-Tauchgänge', ES: '2 inmersiones en el océano' },
 depth: { EN: '18 m / 60 ft', PT: '18 m / 60 ft', DE: '18 m / 60 ft', ES: '18 m / 60 ft' },
 certifies: { EN: 'SSI Open Water Diver', PT: 'SSI Open Water Diver', DE: 'SSI Open Water Diver', ES: 'SSI Open Water Diver' },
 },
 'open-water-diver': {
 id: 'open-water-diver', name: 'Open Water Diver', price: '€460', img: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses/owd-hero.webp', accentColor: '#b7c4b0',
 tagline: {
 EN: 'The cert the whole world recognises. Yours in four days.',
 PT: 'A certificação que o mundo inteiro reconhece. Sua em quatro dias.',
 DE: 'Die Zertifizierung, die die ganze Welt kennt. Deine in vier Tagen.',
 ES: 'La certificación que todo el mundo reconoce. Tuya en cuatro días.',
 },
 intro: {
 EN: 'The SSI Open Water Diver is the most widely recognised scuba certification on earth — your licence to dive to 18 m anywhere on the planet, independently. Four days of training, six pool sessions, four real ocean dives.',
 PT: 'O SSI Open Water Diver é a certificação de mergulho mais amplamente reconhecida no mundo — a sua licença para mergulhar até 18 m em qualquer parte do planeta, de forma independente. Quatro dias de formação, seis sessões em piscina, quatro mergulhos reais no oceano.',
 DE: 'Der SSI Open Water Diver ist die weltweit anerkannteste Tauchzertifizierung — deine Lizenz, unabhängig bis zu 18 m überall auf dem Planeten zu tauchen. Vier Tage Training, sechs Pool-Sessions, vier echte Ozean-Tauchgänge.',
 ES: 'El SSI Open Water Diver es la certificación de buceo más ampliamente reconocida en el mundo — su licencia para bucear hasta 18 m en cualquier lugar del planeta, de forma independiente. Cuatro días de formación, seis sesiones en piscina, cuatro inmersiones reales en el océano.',
 },
 body: [
 {
 EN: 'Theory is online through the MySSI app (available in 40+ languages) — start it before you land and our time together is all water. Six pool sessions cover buoyancy control, equipment assembly, mask clearing, regulator recovery and the safety skills you\'ll use every dive for the rest of your life. Then four ocean dives. The first two are in the sheltered waters of the Ponta Delgada harbour — calm, clear and surprisingly full of life, the ideal place to take your new skills into the sea. The last two are boat dives on real sites: the shallow side of the Dori wreck at 15–17 m, the volcanic arches of Arco do Espelho or Arco do Cavaco, or the reef at Viteleiro — depending on conditions on the day.',
 PT: 'A teoria é online através da app MySSI (disponível em mais de 40 idiomas) — comece-a antes de aterrar e o nosso tempo juntos é todo água. Seis sessões em piscina cobrem o controlo de flutuação, montagem do equipamento, limpeza da máscara, recuperação do regulador e as competências de segurança que usará em todos os mergulhos pelo resto da vida. Depois quatro mergulhos no oceano. Os primeiros dois são nas águas abrigadas do porto de Ponta Delgada — calmas, transparentes e surpreendentemente cheias de vida, o lugar ideal para levar as novas competências para o mar. Os últimos dois são mergulhos de barco em locais reais: o lado raso do naufrágio Dori a 15–17 m, os arcos vulcânicos do Arco do Espelho ou Arco do Cavaco, ou o recife do Viteleiro — conforme as condições do dia.',
 DE: 'Die Theorie erfolgt online über die MySSI-App (in über 40 Sprachen verfügbar) — beginne vor der Anreise und unsere gemeinsame Zeit ist nur Wasser. Sechs Pool-Sessions decken Auftriebskontrolle, Ausrüstungsaufbau, Maskenausblasen, Atemregler-Bergung und Sicherheitsfähigkeiten ab, die du bei jedem Tauchgang deines Lebens nutzen wirst. Dann vier Ozean-Tauchgänge. Die ersten zwei finden in den geschützten Gewässern des Hafens von Ponta Delgada statt — ruhig, klar und überraschend lebendig, der ideale Ort, um die neuen Fähigkeiten ins Meer mitzunehmen. Die letzten zwei sind Bootstauchgänge auf echten Plätzen: die flache Seite des Dori-Wracks auf 15–17 m, die Vulkanbögen des Arco do Espelho oder Arco do Cavaco, oder das Riff bei Viteleiro — je nach Bedingungen des Tages.',
 ES: 'La teoría es online a través de la app MySSI (disponible en más de 40 idiomas) — empiece antes de llegar y nuestro tiempo juntos es todo agua. Seis sesiones en piscina cubren el control de flotabilidad, montaje del equipo, limpieza de la máscara, recuperación del regulador y las habilidades de seguridad que usará en cada inmersión del resto de su vida. Luego cuatro inmersiones en el océano. Las dos primeras son en las aguas resguardadas del puerto de Ponta Delgada — tranquilas, claras y sorprendentemente llenas de vida, el lugar ideal para llevar las nuevas habilidades al mar. Las dos últimas son inmersiones en barco en sitios reales: el lado somero del pecio Dori a 15–17 m, los arcos volcánicos del Arco do Espelho o Arco do Cavaco, o el arrecife de Viteleiro — según las condiciones del día.',
 },
 {
 EN: 'By day four, you\'re a certified, independent diver. The card lives in the MySSI app, the digital logbook starts automatically, and access to 10,000+ verified dive sites opens up via Scubago. From here: explore the Azores on daily double dives, or keep going with a specialty course.',
 PT: 'No quarto dia, é um mergulhador certificado e independente. O cartão fica na app MySSI, o diário digital começa automaticamente e o acesso a mais de 10.000 locais de mergulho verificados abre-se via Scubago. A partir daqui: explore os Açores em mergulhos duplos diários, ou continue com um curso de especialidade.',
 DE: 'Am vierten Tag bist du ein zertifizierter, unabhängiger Taucher. Die Karte lebt in der MySSI-App, das digitale Logbuch startet automatisch und der Zugang zu 10.000+ verifizierten Tauchplätzen öffnet sich über Scubago. Von hier aus: die Azoren auf täglichen Doppel-Tauchgängen erkunden oder mit einem Spezialitätskurs weitermachen.',
 ES: 'Al cuarto día, es un buceador certificado e independiente. La tarjeta vive en la app MySSI, el diario digital empieza automáticamente y el acceso a más de 10.000 sitios de buceo verificados se abre a través de Scubago. A partir de aquí: explorar las Azores en inmersiones dobles diarias, o continuar con un curso de especialidad.',
 },
 ],
 highlights: [
 { EN: 'Worldwide certification — recognised at every dive centre on earth', PT: 'Certificação mundial — reconhecida em todos os centros de mergulho do planeta', DE: 'Weltweite Zertifizierung — an jedem Tauchzentrum der Erde anerkannt', ES: 'Certificación mundial — reconocida en todos los centros de buceo del planeta' },
 { EN: '4 real ocean dives on genuine Azorean sites', PT: '4 mergulhos reais no oceano em locais açorianos genuínos', DE: '4 echte Ozean-Tauchgänge an genuinen Azoren-Tauchplätzen', ES: '4 inmersiones reales en el océano en sitios auténticos de las Azores' },
 { EN: 'Digital theory at home, water time with us', PT: 'Teoria digital em casa, tempo na água connosco', DE: 'Digitale Theorie zuhause, Wasserzeit mit uns', ES: 'Teoría digital en casa, tiempo en el agua con nosotros' },
 { EN: '18 m independent diving worldwide after completion', PT: 'Mergulho independente até 18 m em todo o mundo após conclusão', DE: 'Nach Abschluss weltweit unabhängig bis 18 m tauchen', ES: 'Buceo independiente hasta 18 m en todo el mundo tras la finalización' },
 ],
 includes: [
 { EN: 'Full digital theory (MySSI app, EN/PT/DE/ES)', PT: 'Teoria digital completa (app MySSI, PT/EN/DE/ES)', DE: 'Vollständige digitale Theorie (MySSI-App, DE/EN/PT/ES)', ES: 'Teoría digital completa (app MySSI, ES/EN/PT/DE)' },
 { EN: '6 pool sessions', PT: '6 sessões em piscina', DE: '6 Pool-Sessions', ES: '6 sesiones en piscina' },
 { EN: '4 ocean dives to 18 m', PT: '4 mergulhos no oceano até 18 m', DE: '4 Ozean-Tauchgänge bis 18 m', ES: '4 inmersiones en el océano hasta 18 m' },
 { EN: 'All equipment (wetsuit, BCD, regs, computer)', PT: 'Todo o equipamento (fato, BCD, reguladores, computador)', DE: 'Gesamte Ausrüstung (Neoprenanzug, Tarierjacke, Regler, Computer)', ES: 'Todo el equipo (traje, BCD, reguladores, ordenador)' },
 { EN: 'SSI OWD digital cert + logbook', PT: 'Cert. digital SSI OWD + diário de mergulho', DE: 'Digitales SSI OWD Zertifikat + Logbuch', ES: 'Certificado digital SSI OWD + diario de buceo' },
 { EN: 'Boat & insurance', PT: 'Barco e seguro', DE: 'Boot & Versicherung', ES: 'Barco y seguro' },
 ],
 prereqs: {
 EN: 'Fit to swim. Minimum age 10. No prior experience needed.',
 PT: 'Apto para nadar. Idade mínima 10 anos. Sem experiência prévia necessária.',
 DE: 'Schwimmfähig. Mindestalter 10 Jahre. Keine Vorerfahrung nötig.',
 ES: 'Apto para nadar. Edad mínima 10 años. Sin experiencia previa necesaria.',
 },
 duration: { EN: '~4 days', PT: '~4 dias', DE: '~4 Tage', ES: '~4 días' },
 dives: { EN: '4 ocean dives', PT: '4 mergulhos no oceano', DE: '4 Ozean-Tauchgänge', ES: '4 inmersiones en el océano' },
 depth: { EN: '18 m / 60 ft', PT: '18 m / 60 ft', DE: '18 m / 60 ft', ES: '18 m / 60 ft' },
 certifies: { EN: 'SSI Open Water Diver', PT: 'SSI Open Water Diver', DE: 'SSI Open Water Diver', ES: 'SSI Open Water Diver' },
 testimonial: { quote: 'I had the pleasure of completing my OWD course under the guidance of an excellent instructor, Paulo. He combines professionalism with incredible calm and a great sense of humor. The course was a perfect mix of learning and pure joy while exploring the volcanic reef. It definitely was not my last dive with this amazing team!', author: 'Agnieszka T.', source: 'Google Reviews' },
 },
 'advanced-open-water-diver': {
 id: 'advanced-open-water-diver', name: 'Advanced Open Water Diver', price: '€380', img: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses/aowd.webp', accentColor: '#b7c4b0',
 tagline: {
 EN: 'Go deeper. Navigate. Push your limits.',
 PT: 'Vá mais fundo. Navegue. Supere os seus limites.',
 DE: 'Tiefer gehen. Navigieren. Grenzen überwinden.',
 ES: 'Ve más profundo. Navega. Supera tus límites.',
 },
 intro: {
 EN: 'Five adventure dives across five specialty areas — Deep and Navigation are mandatory, plus three more of your choice. You leave certified to 30 m, with credit toward any full specialty you complete later.',
 PT: 'Cinco mergulhos de aventura em cinco áreas de especialidade — Fundo e Navegação são obrigatórios, mais três à sua escolha. Sai certificado até 30 m, com crédito para qualquer especialidade completa que concluir mais tarde.',
 DE: 'Fünf Abenteuertauchgänge in fünf Spezialitätsbereichen — Tief und Navigation sind Pflicht, dazu drei weitere deiner Wahl. Du verlässt uns mit einer Zertifizierung bis 30 m und Guthaben für jede vollständige Spezialität, die du später abschließt.',
 ES: 'Cinco inmersiones de aventura en cinco áreas de especialidad — Profundidad y Navegación son obligatorias, más tres más a su elección. Se va certificado hasta 30 m, con crédito para cualquier especialidad completa que complete más adelante.',
 },
 body: [
 {
 EN: 'The AOWD is a sampler of the diving world\'s best specialties. Each of the five dives introduces you to a different discipline: you breathe at 30 m on a deep volcanic wall, navigate through lava channels without surfacing, and choose three more from wreck, night, perfect buoyancy, waves & currents, or whatever else fires you up. Deep and Navigation are mandatory because they\'re the most practically useful — everything else is your call.',
 PT: 'O AOWD é uma amostra das melhores especialidades do mundo do mergulho. Cada um dos cinco mergulhos introduz-lhe uma disciplina diferente: respira a 30 m numa parede vulcânica profunda, navega por canais de lava sem emergir, e escolhe mais três entre naufrágio, noturno, flutuação perfeita, ondas & correntes, ou o que mais lhe interessar. Fundo e Navegação são obrigatórios porque são os mais praticamente úteis — todo o resto é à sua escolha.',
 DE: 'Der AOWD ist eine Kostprobe der besten Spezialitäten der Taucherwelt. Jeder der fünf Tauchgänge führt dich in eine andere Disziplin ein: Du atmest bei 30 m an einer tiefen Vulkanwand, navigierst durch Lavakanäle ohne aufzutauchen, und wählst drei weitere aus Wrack, Nacht, Perfekter Auftrieb, Wellen & Strömungen oder was auch immer dich begeistert. Tief und Navigation sind Pflicht, weil sie am praktischsten sind — alles andere liegt bei dir.',
 ES: 'El AOWD es una muestra de las mejores especialidades del mundo del buceo. Cada una de las cinco inmersiones le introduce a una disciplina diferente: respira a 30 m en una pared volcánica profunda, navega a través de canales de lava sin emerger, y elige tres más entre pecio, nocturna, flotabilidad perfecta, olas y corrientes, o lo que más le entusiasme. Profundidad y Navegación son obligatorias por ser las más prácticas — todo lo demás es su elección.',
 },
 {
 EN: 'Nothing is wasted: every adventure dive in this program earns you credit toward the full specialty certification. So if you do the Wreck dive here and love it, completing the full Wreck Diving specialty only requires the remaining academic work — not the dives again. It\'s the most efficient way to level up after OWD.',
 PT: 'Nada é desperdiçado: cada mergulho de aventura neste programa dá-lhe crédito para a certificação de especialidade completa. Portanto, se fizer o mergulho em naufrágio aqui e adorar, completar a especialidade completa de Mergulho em Naufrágio requer apenas o trabalho académico restante — não os mergulhos novamente. É a forma mais eficiente de evoluir após o OWD.',
 DE: 'Nichts wird verschwendet: Jeder Abenteuertauchgang in diesem Programm bringt dir Guthaben für die vollständige Spezialitätszertifizierung. Wenn du also den Wrack-Tauchgang hier machst und liebst, erfordert die vollständige Wrack-Tauchen-Spezialität nur die verbleibende Theorie — nicht die Tauchgänge erneut. Es ist der effizienteste Weg, nach dem OWD aufzusteigen.',
 ES: 'Nada se desperdicia: cada inmersión de aventura en este programa le otorga crédito para la certificación de especialidad completa. Así que si hace la inmersión en pecio aquí y le encanta, completar la especialidad completa de Buceo en Pecios solo requiere el trabajo académico restante — no las inmersiones de nuevo. Es la forma más eficiente de progresar después del OWD.',
 },
 ],
 highlights: [
 { EN: 'Deep (30 m) + Navigation always included', PT: 'Fundo (30 m) + Navegação sempre incluídos', DE: 'Tief (30 m) + Navigation immer inklusive', ES: 'Profundidad (30 m) + Navegación siempre incluidos' },
 { EN: '3 additional adventure dives of your choice', PT: '3 mergulhos de aventura adicionais à sua escolha', DE: '3 zusätzliche Abenteuertauchgänge deiner Wahl', ES: '3 inmersiones de aventura adicionales a su elección' },
 { EN: 'Full credit toward specialty certifications', PT: 'Crédito total para certificações de especialidade', DE: 'Volles Guthaben für Spezialitätszertifizierungen', ES: 'Crédito total para certificaciones de especialidad' },
 { EN: 'Certify to 30 m independently worldwide', PT: 'Certificação até 30 m de forma independente em todo o mundo', DE: 'Weltweit bis 30 m unabhängig zertifiziert', ES: 'Certificación hasta 30 m de forma independiente en todo el mundo' },
 ],
 includes: [
 { EN: '5 adventure dives (to 30 m)', PT: '5 mergulhos de aventura (até 30 m)', DE: '5 Abenteuertauchgänge (bis 30 m)', ES: '5 inmersiones de aventura (hasta 30 m)' },
 { EN: 'Online theory modules for each specialty (MySSI)', PT: 'Módulos de teoria online para cada especialidade (MySSI)', DE: 'Online-Theoriemodule für jede Spezialität (MySSI)', ES: 'Módulos de teoría online para cada especialidad (MySSI)' },
 { EN: 'All dive equipment', PT: 'Todo o equipamento de mergulho', DE: 'Gesamte Tauchausrüstung', ES: 'Todo el equipo de buceo' },
 { EN: 'SSI Advanced Open Water Diver certification', PT: 'Certificação SSI Advanced Open Water Diver', DE: 'SSI Advanced Open Water Diver Zertifizierung', ES: 'Certificación SSI Advanced Open Water Diver' },
 { EN: 'Boat & insurance', PT: 'Barco e seguro', DE: 'Boot & Versicherung', ES: 'Barco y seguro' },
 ],
 prereqs: {
 EN: 'SSI Open Water Diver (or equivalent). Minimum age 12.',
 PT: 'SSI Open Water Diver (ou equivalente). Idade mínima 12 anos.',
 DE: 'SSI Open Water Diver (oder gleichwertig). Mindestalter 12 Jahre.',
 ES: 'SSI Open Water Diver (o equivalente). Edad mínima 12 años.',
 },
 duration: { EN: '2–3 days', PT: '2–3 dias', DE: '2–3 Tage', ES: '2–3 días' },
 dives: { EN: '5 adventure dives', PT: '5 mergulhos de aventura', DE: '5 Abenteuertauchgänge', ES: '5 inmersiones de aventura' },
 depth: { EN: '30 m / 100 ft', PT: '30 m / 100 ft', DE: '30 m / 100 ft', ES: '30 m / 100 ft' },
 certifies: { EN: 'SSI Advanced Open Water Diver', PT: 'SSI Advanced Open Water Diver', DE: 'SSI Advanced Open Water Diver', ES: 'SSI Advanced Open Water Diver' },
 testimonial: { quote: 'Had nice dives, and good guides who are also enthusiastic and helpful. Paul, Martha and especially Carolina is doing very well!! Nice diving school.', author: 'D.K.', source: 'TripAdvisor' },
 },
 'skills-update': {
 id: 'skills-update', name: 'Scuba Skills Update', price: '€95', img: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses/skills-update.webp', accentColor: '#b7c4b0',
 tagline: {
 EN: "It's been a while. Let's shake the rust off.",
 PT: 'Já passou algum tempo. Vamos sacudir a ferrugem.',
 DE: 'Es ist eine Weile her. Lass uns den Rost abschütteln.',
 ES: 'Ha pasado un tiempo. Sacudamos el óxido.',
 },
 intro: {
 EN: 'Your certification never expires, but your muscle memory might have. The Scuba Skills Update is a half-day refresher for certified divers returning to the water after a gap — pool skills, then a shallow ocean dive with a guide. No pressure, no judgment.',
 PT: 'A sua certificação nunca expira, mas a sua memória muscular pode ter perdido o fio. O Scuba Skills Update é um programa de atualização de meio dia para mergulhadores certificados que regressam à água após uma pausa — competências em piscina, depois um mergulho raso no oceano com um guia. Sem pressão, sem julgamentos.',
 DE: 'Deine Zertifizierung verfällt nie, aber dein Muskelgedächtnis könnte eingerostet sein. Das Scuba Skills Update ist eine halbtägige Auffrischung für zertifizierte Taucher, die nach einer Pause ins Wasser zurückkehren — Pool-Fertigkeiten, dann ein flacher Ozean-Tauchgang mit einem Guide. Kein Druck, kein Urteil.',
 ES: 'Su certificación nunca caduca, pero su memoria muscular puede haberse oxidado. El Scuba Skills Update es un repaso de medio día para buceadores certificados que regresan al agua tras una pausa — habilidades en piscina, luego una inmersión superficial en el océano con un guía. Sin presión, sin juicios.',
 },
 body: [
 {
 EN: 'We run through the core skills in the pool — mask clearing, regulator recovery, buoyancy trim, and equipment setup — until everything feels natural again. Then a shallow guided ocean dive in calm conditions to rebuild your confidence in open water. Most returning divers are back to full form within a single session.',
 PT: 'Passamos pelas competências essenciais na piscina — limpeza da máscara, recuperação do regulador, trim de flutuação e configuração do equipamento — até tudo se sentir natural novamente. Depois um mergulho guiado raso no oceano em condições calmas para reconstruir a confiança em águas abertas. A maioria dos mergulhadores que regressam recupera a forma plena numa única sessão.',
 DE: 'Wir gehen die Kernfähigkeiten im Pool durch — Maske ausblasen, Atemregler bergen, Tarierung und Ausrüstungsaufbau — bis sich alles wieder natürlich anfühlt. Dann ein flacher geführter Ozean-Tauchgang bei ruhigen Bedingungen, um dein Selbstvertrauen im Freiwasser wieder aufzubauen. Die meisten zurückkehrenden Taucher sind nach einer einzigen Session wieder voll in Form.',
 ES: 'Repasamos las habilidades fundamentales en la piscina — limpieza de la máscara, recuperación del regulador, trim de flotabilidad y configuración del equipo — hasta que todo se siente natural de nuevo. Luego una inmersión guiada superficial en el océano en condiciones tranquilas para reconstruir la confianza en aguas abiertas. La mayoría de los buceadores que regresan recuperan la plena forma en una sola sesión.',
 },
 {
 EN: 'Life happens. Diving gets paused. This is the fastest, lowest-stress way back in the water — and from here you\'re ready to join our daily double dives, book a specialty, or continue where you left off on a course.',
 PT: 'A vida acontece. O mergulho fica em pausa. Esta é a forma mais rápida e com menos stress de regressar à água — e a partir daqui está pronto para se juntar aos nossos mergulhos duplos diários, reservar uma especialidade ou continuar onde ficou num curso.',
 DE: 'Das Leben passiert. Das Tauchen wird pausiert. Dies ist der schnellste, stressärmste Weg zurück ins Wasser — und von hier aus bist du bereit, dich unseren täglichen Doppel-Tauchgängen anzuschließen, eine Spezialität zu buchen oder dort weiterzumachen, wo du bei einem Kurs aufgehört hast.',
 ES: 'La vida pasa. El buceo se pausa. Esta es la forma más rápida y con menos estrés de volver al agua — y desde aquí está listo para unirse a nuestras inmersiones dobles diarias, reservar una especialidad o continuar donde lo dejó en un curso.',
 },
 ],
 highlights: [
 { EN: 'Works with any recognised dive certification', PT: 'Válido com qualquer certificação de mergulho reconhecida', DE: 'Gilt für jede anerkannte Tauchzertifizierung', ES: 'Válido con cualquier certificación de buceo reconocida' },
 { EN: 'Pool refresh + ocean dive in one session', PT: 'Atualização em piscina + mergulho no oceano numa sessão', DE: 'Pool-Auffrischung + Ozean-Tauchgang in einer Session', ES: 'Repaso en piscina + inmersión en el océano en una sesión' },
 { EN: 'No theory or exams — pure practical', PT: 'Sem teoria ou exames — puramente prático', DE: 'Keine Theorie oder Prüfungen — rein praktisch', ES: 'Sin teoría ni exámenes — puramente práctico' },
 { EN: 'Get dive-ready before your trip', PT: 'Fique pronto para mergulhar antes da sua viagem', DE: 'Vor deiner Reise fit fürs Tauchen werden', ES: 'Prepárese para bucear antes de su viaje' },
 ],
 includes: [
 { EN: 'Pool skill refresh session', PT: 'Sessão de atualização de competências em piscina', DE: 'Pool-Fertigkeits-Auffrischungssession', ES: 'Sesión de repaso de habilidades en piscina' },
 { EN: '1 guided ocean dive', PT: '1 mergulho guiado no oceano', DE: '1 geführter Ozean-Tauchgang', ES: '1 inmersión guiada en el océano' },
 { EN: 'All dive equipment', PT: 'Todo o equipamento de mergulho', DE: 'Gesamte Tauchausrüstung', ES: 'Todo el equipo de buceo' },
 { EN: 'Boat & insurance', PT: 'Barco e seguro', DE: 'Boot & Versicherung', ES: 'Barco y seguro' },
 ],
 prereqs: {
 EN: 'Any recognised scuba certification (SSI, PADI, CMAS, RAID, etc.)',
 PT: 'Qualquer certificação de mergulho reconhecida (SSI, PADI, CMAS, RAID, etc.)',
 DE: 'Jede anerkannte Tauschzertifizierung (SSI, PADI, CMAS, RAID usw.)',
 ES: 'Cualquier certificación de buceo reconocida (SSI, PADI, CMAS, RAID, etc.)',
 },
 duration: { EN: 'Half day (~3 hours)', PT: 'Meio dia (~3 horas)', DE: 'Halber Tag (~3 Stunden)', ES: 'Medio día (~3 horas)' },
 dives: { EN: '1 pool + 1 ocean dive', PT: '1 piscina + 1 mergulho no oceano', DE: '1 Pool + 1 Ozean-Tauchgang', ES: '1 piscina + 1 inmersión en el océano' },
 depth: { EN: 'Up to 18 m', PT: 'Até 18 m', DE: 'Bis zu 18 m', ES: 'Hasta 18 m' },
 certifies: {
 EN: 'Refreshes your existing qualification — no new cert',
 PT: 'Atualiza a sua qualificação existente — sem nova certificação',
 DE: 'Aktualisiert deine bestehende Qualifikation — keine neue Zertifizierung',
 ES: 'Actualiza su calificación existente — sin nueva certificación',
 },
 testimonial: { quote: 'It was a very nice experience and we got to see many different fish. Among which 3 octopus, 2 pregnant rays, a striped barracuda and different kind of fish. Great to do the refresher on the shore here! Thank you Vasco!', author: 'Cansu A.', source: 'Google Reviews' },
 },
 'perfect-buoyancy': {
 id: 'perfect-buoyancy', name: 'Perfect Buoyancy', price: '€200', img: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses/perfect-buoyancy.webp', accentColor: 'var(--accent)',
 tagline: {
 EN: 'Float like you were born underwater.',
 PT: 'Flutue como se tivesse nascido debaixo de água.',
 DE: 'Schweben, als wärst du unter Wasser geboren.',
 ES: 'Flota como si hubieras nacido bajo el agua.',
 },
 intro: {
 EN: 'Buoyancy is the single skill that separates good divers from great ones. This specialty teaches you to hover effortlessly in any position, breathe your tank 30–40% longer, and protect the reef without thinking about it.',
 PT: 'A flutuação é a única competência que separa os bons mergulhadores dos excelentes. Esta especialidade ensina-o a pairar sem esforço em qualquer posição, a respirar o botijão 30–40% mais tempo e a proteger o recife sem pensar nisso.',
 DE: 'Auftrieb ist die eine Fähigkeit, die gute Taucher von großartigen trennt. Diese Spezialität lehrt dich, mühelos in jeder Position zu schweben, deine Flasche 30–40% länger zu atmen und das Riff zu schützen, ohne darüber nachzudenken.',
 ES: 'La flotabilidad es la única habilidad que separa a los buenos buceadores de los grandes. Esta especialidad le enseña a flotar sin esfuerzo en cualquier posición, a respirar la botella un 30–40% más y a proteger el arrecife sin pensarlo.',
 },
 body: [
 {
 EN: 'You\'ll spend time in the pool working on trim and breathing technique — the relationship between lung volume and position, how small adjustments cascade into perfect control. Then two ocean dives in some of the most rewarding conditions we have: volcanic boulders, swim-throughs and sandy flats where every adjustment is visible and immediate.',
 PT: 'Passará tempo na piscina a trabalhar no trim e na técnica de respiração — a relação entre o volume pulmonar e a posição, como pequenos ajustes se transformam em controlo perfeito. Depois dois mergulhos no oceano em algumas das condições mais gratificantes que temos: blocos vulcânicos, passagens e fundos arenosos onde cada ajuste é visível e imediato.',
 DE: 'Du verbringst Zeit im Pool mit Trim und Atemtechnik — die Beziehung zwischen Lungenvolumen und Position, wie kleine Anpassungen zu perfekter Kontrolle führen. Dann zwei Ozean-Tauchgänge unter einigen unserer lohnendsten Bedingungen: Vulkanblöcke, Durchschwimmgänge und Sandflächen, wo jede Anpassung sichtbar und unmittelbar ist.',
 ES: 'Pasará tiempo en la piscina trabajando el trim y la técnica de respiración — la relación entre el volumen pulmonar y la posición, cómo los pequeños ajustes se convierten en control perfecto. Luego dos inmersiones en el océano en algunas de las condiciones más gratificantes que tenemos: bloques volcánicos, túneles y fondos arenosos donde cada ajuste es visible e inmediato.',
 },
 {
 EN: 'Guests who take this specialty consistently call it the most transformative course they\'ve done — even after hundreds of dives. Better photos. Less fatigue. More bottom time. The reef stays intact. And it counts toward the Advanced Open Water Diver and SSI Master Diver recognitions.',
 PT: 'Os hóspedes que fazem esta especialidade chamam-lhe consistentemente o curso mais transformador que já fizeram — mesmo após centenas de mergulhos. Melhores fotos. Menos fadiga. Mais tempo de fundo. O recife fica intacto. E conta para as classificações Advanced Open Water Diver e SSI Master Diver.',
 DE: 'Gäste, die diese Spezialität belegen, nennen sie konsequent den transformativsten Kurs, den sie je gemacht haben — selbst nach Hunderten von Tauchgängen. Bessere Fotos. Weniger Müdigkeit. Mehr Grundzeit. Das Riff bleibt intakt. Und es zählt für die Advanced Open Water Diver und SSI Master Diver Anerkennungen.',
 ES: 'Los huéspedes que hacen esta especialidad la llaman consistentemente el curso más transformador que han realizado — incluso después de cientos de inmersiones. Mejores fotos. Menos fatiga. Más tiempo de fondo. El arrecife permanece intacto. Y cuenta para las clasificaciones Advanced Open Water Diver y SSI Master Diver.',
 },
 ],
 highlights: [
 { EN: 'Transform your air consumption immediately', PT: 'Transforme o seu consumo de ar imediatamente', DE: 'Deinen Luftverbrauch sofort verbessern', ES: 'Transforme su consumo de aire de inmediato' },
 { EN: '2 pool sessions + 2 ocean dives', PT: '2 sessões em piscina + 2 mergulhos no oceano', DE: '2 Pool-Sessions + 2 Ozean-Tauchgänge', ES: '2 sesiones en piscina + 2 inmersiones en el océano' },
 { EN: 'Counts toward AOWD and Master Diver ratings', PT: 'Conta para as classificações AOWD e Master Diver', DE: 'Zählt für AOWD und Master Diver Bewertungen', ES: 'Cuenta para las clasificaciones AOWD y Master Diver' },
 { EN: 'Essential for Blue Oceans partnership courses', PT: 'Essencial para os cursos de parceria Blue Oceans', DE: 'Unverzichtbar für Blue Oceans Partnerschaftskurse', ES: 'Esencial para los cursos de asociación Blue Oceans' },
 ],
 includes: [
 { EN: 'Online theory (MySSI)', PT: 'Teoria online (MySSI)', DE: 'Online-Theorie (MySSI)', ES: 'Teoría online (MySSI)' },
 { EN: '2 pool sessions', PT: '2 sessões em piscina', DE: '2 Pool-Sessions', ES: '2 sesiones en piscina' },
 { EN: '2 ocean dives to 30 m', PT: '2 mergulhos no oceano até 30 m', DE: '2 Ozean-Tauchgänge bis 30 m', ES: '2 inmersiones en el océano hasta 30 m' },
 { EN: 'All dive equipment', PT: 'Todo o equipamento de mergulho', DE: 'Gesamte Tauchausrüstung', ES: 'Todo el equipo de buceo' },
 { EN: 'SSI Perfect Buoyancy Specialty certification', PT: 'Certificação SSI Perfect Buoyancy Specialty', DE: 'SSI Perfect Buoyancy Specialty Zertifizierung', ES: 'Certificación SSI Perfect Buoyancy Specialty' },
 { EN: 'Boat & insurance', PT: 'Barco e seguro', DE: 'Boot & Versicherung', ES: 'Barco y seguro' },
 ],
 prereqs: {
 EN: 'SSI Open Water Diver (or equivalent). Minimum age 10.',
 PT: 'SSI Open Water Diver (ou equivalente). Idade mínima 10 anos.',
 DE: 'SSI Open Water Diver (oder gleichwertig). Mindestalter 10 Jahre.',
 ES: 'SSI Open Water Diver (o equivalente). Edad mínima 10 años.',
 },
 duration: { EN: '1–2 days', PT: '1–2 dias', DE: '1–2 Tage', ES: '1–2 días' },
 dives: { EN: '2 ocean dives', PT: '2 mergulhos no oceano', DE: '2 Ozean-Tauchgänge', ES: '2 inmersiones en el océano' },
 depth: { EN: '30 m / 100 ft', PT: '30 m / 100 ft', DE: '30 m / 100 ft', ES: '30 m / 100 ft' },
 certifies: { EN: 'SSI Perfect Buoyancy Specialty', PT: 'SSI Perfect Buoyancy Specialty', DE: 'SSI Perfect Buoyancy Specialty', ES: 'SSI Perfect Buoyancy Specialty' },
 testimonial: { quote: '2 great dives. Our dive master was excellent — best dive brief I\'ve been given. First dive to an interesting volcanic reef structure. Second dive on a wreck, plenty to see on both dives.', author: 'David R.', source: 'TripAdvisor' },
 },
 'waves-tides-currents': {
 id: 'waves-tides-currents', name: 'Waves, Tides & Currents', price: '€250', img: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses/waves-tides-currents.webp', accentColor: 'var(--accent)',
 tagline: {
 EN: 'Own the conditions — whatever the Atlantic throws.',
 PT: 'Domine as condições — o que quer que o Atlântico traga.',
 DE: 'Die Bedingungen beherrschen — was auch immer der Atlantik bringt.',
 ES: 'Domina las condiciones — lo que sea que el Atlántico presente.',
 },
 intro: {
 EN: 'The Azores sits in the middle of the North Atlantic. Currents, surge and tidal pull are part of every dive here. This specialty teaches you to read them, use them, and stay safe when they get serious.',
 PT: 'Os Açores situam-se no meio do Atlântico Norte. Correntes, surge e atração mareal fazem parte de cada mergulho aqui. Esta especialidade ensina-o a lê-las, usá-las e manter-se seguro quando ficam sérias.',
 DE: 'Die Azoren liegen mitten im Nordatlantik. Strömungen, Surge und Gezeitenzug sind Teil jedes Tauchgangs hier. Diese Spezialität lehrt dich, sie zu lesen, zu nutzen und sicher zu bleiben, wenn sie ernst werden.',
 ES: 'Las Azores se encuentra en medio del Atlántico Norte. Las corrientes, el oleaje y la fuerza mareal forman parte de cada inmersión aquí. Esta especialidad le enseña a leerlos, usarlos y mantenerse seguro cuando se ponen serios.',
 },
 body: [
 {
 EN: 'The theory covers how waves, tides and currents form and affect dive sites — the same knowledge that our guides use every morning before deciding which sites are diveable. Then two ocean dives in conditions that actually demand the skills: shore entries through surge, drift techniques in a gentle current, and reading the water from the surface before you commit to a dive.',
 PT: 'A teoria cobre como ondas, marés e correntes se formam e afetam os locais de mergulho — o mesmo conhecimento que os nossos guias usam todas as manhãs antes de decidir quais os locais mergulháveis. Depois dois mergulhos no oceano em condições que realmente exigem as competências: entradas na costa através do surge, técnicas de deriva em corrente suave e leitura da água da superfície antes de se comprometer com um mergulho.',
 DE: 'Die Theorie behandelt, wie Wellen, Gezeiten und Strömungen entstehen und Tauchplätze beeinflussen — dasselbe Wissen, das unsere Guides jeden Morgen nutzen, bevor sie entscheiden, welche Plätze tauchbar sind. Dann zwei Ozean-Tauchgänge unter Bedingungen, die die Fähigkeiten wirklich fordern: Küsteneinstiege durch Surge, Drifttechniken in sanfter Strömung und das Lesen des Wassers von der Oberfläche, bevor du dich für einen Tauchgang entscheidest.',
 ES: 'La teoría cubre cómo se forman las olas, las mareas y las corrientes y afectan a los sitios de buceo — el mismo conocimiento que nuestros guías usan cada mañana antes de decidir qué sitios son buceables. Luego dos inmersiones en el océano en condiciones que realmente exigen las habilidades: entradas desde la orilla a través del oleaje, técnicas de deriva en corriente suave y lectura del agua desde la superficie antes de comprometerse con una inmersión.',
 },
 {
 EN: 'This is one of the most practically relevant specialties you can take in São Miguel. It\'s essential preparation for the Formigas expedition, where conditions can change fast and a drift entry gone wrong is a real problem. It also counts toward your Advanced Open Water Diver certification.',
 PT: 'Esta é uma das especialidades mais praticamente relevantes que pode fazer em São Miguel. É uma preparação essencial para a expedição Formigas, onde as condições podem mudar rapidamente e uma entrada em deriva que corre mal é um problema real. Também conta para a sua certificação Advanced Open Water Diver.',
 DE: 'Dies ist eine der praktisch relevantesten Spezialitäten, die du in São Miguel belegen kannst. Sie ist eine unverzichtbare Vorbereitung für die Formigas-Expedition, wo sich die Bedingungen schnell ändern können und ein misslungener Drift-Einstieg ein echtes Problem ist. Sie zählt auch für deine Advanced Open Water Diver Zertifizierung.',
 ES: 'Esta es una de las especialidades más prácticamente relevantes que puede hacer en São Miguel. Es una preparación esencial para la expedición Formigas, donde las condiciones pueden cambiar rápidamente y una entrada de deriva que sale mal es un problema real. También cuenta para su certificación Advanced Open Water Diver.',
 },
 ],
 highlights: [
 { EN: 'Essential preparation for Formigas offshore dives', PT: 'Preparação essencial para os mergulhos offshore das Formigas', DE: 'Unverzichtbare Vorbereitung für Formigas Offshore-Tauchgänge', ES: 'Preparación esencial para las inmersiones offshore de Formigas' },
 { EN: 'Shore entries, drift techniques, tidal planning', PT: 'Entradas costeiras, técnicas de deriva, planeamento mareal', DE: 'Küsteneinstiege, Drifttechniken, Gezeitenplanung', ES: 'Entradas desde la orilla, técnicas de deriva, planificación de mareas' },
 { EN: '2 ocean dives in real Atlantic conditions', PT: '2 mergulhos no oceano em condições atlânticas reais', DE: '2 Ozean-Tauchgänge unter echten Atlantik-Bedingungen', ES: '2 inmersiones en el océano en condiciones atlánticas reales' },
 { EN: 'Counts toward AOWD certification', PT: 'Conta para a certificação AOWD', DE: 'Zählt für die AOWD-Zertifizierung', ES: 'Cuenta para la certificación AOWD' },
 ],
 includes: [
 { EN: 'Online theory (MySSI)', PT: 'Teoria online (MySSI)', DE: 'Online-Theorie (MySSI)', ES: 'Teoría online (MySSI)' },
 { EN: '2 ocean dives to 30 m', PT: '2 mergulhos no oceano até 30 m', DE: '2 Ozean-Tauchgänge bis 30 m', ES: '2 inmersiones en el océano hasta 30 m' },
 { EN: 'All dive equipment', PT: 'Todo o equipamento de mergulho', DE: 'Gesamte Tauchausrüstung', ES: 'Todo el equipo de buceo' },
 { EN: 'SSI Waves, Tides & Currents Specialty certification', PT: 'Certificação SSI Waves, Tides & Currents Specialty', DE: 'SSI Waves, Tides & Currents Specialty Zertifizierung', ES: 'Certificación SSI Waves, Tides & Currents Specialty' },
 { EN: 'Boat & insurance', PT: 'Barco e seguro', DE: 'Boot & Versicherung', ES: 'Barco y seguro' },
 ],
 prereqs: {
 EN: 'SSI Open Water Diver (or equivalent). Minimum age 10.',
 PT: 'SSI Open Water Diver (ou equivalente). Idade mínima 10 anos.',
 DE: 'SSI Open Water Diver (oder gleichwertig). Mindestalter 10 Jahre.',
 ES: 'SSI Open Water Diver (o equivalente). Edad mínima 10 años.',
 },
 duration: { EN: '1–2 days', PT: '1–2 dias', DE: '1–2 Tage', ES: '1–2 días' },
 dives: { EN: '2 ocean dives', PT: '2 mergulhos no oceano', DE: '2 Ozean-Tauchgänge', ES: '2 inmersiones en el océano' },
 depth: { EN: '30 m / 100 ft', PT: '30 m / 100 ft', DE: '30 m / 100 ft', ES: '30 m / 100 ft' },
 certifies: { EN: 'SSI Waves, Tides & Currents Specialty', PT: 'SSI Waves, Tides & Currents Specialty', DE: 'SSI Waves, Tides & Currents Specialty', ES: 'SSI Waves, Tides & Currents Specialty' },
 testimonial: { quote: 'Thorough instructions before we got into the water — plenty of prep time to get acquainted with the gear. We saw octopus, two types of rays, wrasse, grouper, damsel fish, parrot fish and more. The team was patient, encouraging and kind.', author: 'Nicole S.', source: 'TripAdvisor' },
 },
 'wreck-diving': {
 id: 'wreck-diving', name: 'Wreck Diving', price: '€250', img: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses/wreck-diving.webp', accentColor: 'var(--accent)',
 tagline: {
 EN: 'The Dori is waiting. Come find her.',
 PT: 'A Dori está à sua espera. Venha encontrá-la.',
 DE: 'Die Dori wartet. Komm und finde sie.',
 ES: 'La Dori está esperando. Ven a encontrarla.',
 },
 intro: {
 EN: 'The Dori is a WWII Liberty ship resting at 18–22 m off Ponta Delgada — one of the most accessible and biodiverse wreck dives in the Azores. This specialty gives you the skills to explore it, and every other shipwreck you\'ll encounter in your diving life.',
 PT: 'A Dori é um navio Liberty da 2.ª Guerra Mundial que repousa a 18–22 m ao largo de Ponta Delgada — um dos mergulhos em naufrágio mais acessíveis e biodiverse dos Açores. Esta especialidade dá-lhe as competências para o explorar, e todos os outros naufrágios que encontrará na sua vida de mergulhador.',
 DE: 'Die Dori ist ein Liberty-Schiff aus dem Zweiten Weltkrieg, das bei 18–22 m vor Ponta Delgada liegt — einer der zugänglichsten und artenreichsten Wracktauchgänge auf den Azoren. Diese Spezialität gibt dir die Fähigkeiten, es zu erkunden, und jedes andere Schiffswrack, dem du in deinem Tauchleben begegnen wirst.',
 ES: 'El Dori es un barco Liberty de la Segunda Guerra Mundial que descansa a 18–22 m frente a Ponta Delgada — uno de los buceos en pecios más accesibles y biodiversos de las Azores. Esta especialidad le da las habilidades para explorarlo, y todos los demás naufragios que encontrará en su vida de buceo.',
 },
 body: [
 {
 EN: 'The course covers non-penetration wreck techniques: navigation around a wreck using reels and natural references, buoyancy control near sediment, and safety procedures specific to wreck environments. You\'ll learn how wrecks become artificial reefs — why barracudas school at the bow, why groupers shelter in the shadowed hull approaches, and how to fin through without disturbing a century of colonisation.',
 PT: 'O curso cobre técnicas de naufrágio sem penetração: navegação em torno de um naufrágio usando carretilhas e referências naturais, controlo de flutuação perto de sedimentos e procedimentos de segurança específicos para ambientes de naufrágio. Aprenderá como os naufrágios se tornam recifes artificiais — por que as barracudas se agrupam na proa, por que os garoupas se abrigam nas aproximações sombreadas do casco e como nadar sem perturbar um século de colonização.',
 DE: 'Der Kurs behandelt Nicht-Penetrations-Wracktechniken: Navigation um ein Wrack herum mit Rollen und natürlichen Referenzen, Auftriebskontrolle in Sedimentnähe und wrackspezifische Sicherheitsverfahren. Du lernst, wie Wracks zu künstlichen Riffen werden — warum Barrakudas am Bug Schwärme bilden, warum Zackenbarsche in den schattigen Rumpfbereichen Schutz suchen und wie man hindurchflossert, ohne eine jahrhundertelange Besiedelung zu stören.',
 ES: 'El curso cubre técnicas de pecio sin penetración: navegación alrededor de un pecio usando carretes y referencias naturales, control de flotabilidad cerca de sedimentos y procedimientos de seguridad específicos para entornos de pecios. Aprenderá cómo los pecios se convierten en arrecifes artificiales — por qué las barracudas se agrupan en la proa, por qué los meros se refugian en las aproximaciones sombreadas del casco y cómo nadar sin perturbar un siglo de colonización.',
 },
 {
 EN: 'Your two open water training dives are on the Dori herself. By the time you\'re certified, you know this wreck intimately — the soft corals on the deck, the trevallies circling the superstructure, the cleaner shrimp stations on the engine room approach. The SSI Wreck Diving certification lets you approach wrecks confidently anywhere in the world.',
 PT: 'Os seus dois mergulhos de treino em águas abertas são na própria Dori. Quando estiver certificado, conhece este naufrágio intimamente — os corais moles no convés, os carangídeos circulando a superestrutura, as estações de camarão limpador na aproximação à casa das máquinas. A certificação SSI Wreck Diving permite-lhe aproximar-se a naufrágios com confiança em qualquer parte do mundo.',
 DE: 'Deine zwei Freiwasser-Trainings-Tauchgänge finden auf der Dori selbst statt. Wenn du zertifiziert bist, kennst du dieses Wrack in- und auswendig — die Weichkorallen auf dem Deck, die Stachelmakrelen, die die Aufbauten umkreisen, die Putzgarnelenstationen beim Maschinenraum-Zugang. Die SSI Wreck Diving Zertifizierung ermöglicht es dir, überall auf der Welt selbstbewusst an Wracks heranzugehen.',
 ES: 'Sus dos inmersiones de entrenamiento en aguas abiertas son en la propia Dori. Cuando esté certificado, conocerá este pecio íntimamente — los corales blandos en la cubierta, los pámpanos circulando la superestructura, las estaciones de camarón limpiador en la aproximación a la sala de máquinas. La certificación SSI Wreck Diving le permite aproximarse a pecios con confianza en cualquier lugar del mundo.',
 },
 ],
 highlights: [
 { EN: 'Training dives on the real Dori wreck (WWII Liberty ship)', PT: 'Mergulhos de treino no naufrágio real Dori (navio Liberty da WWII)', DE: 'Trainings-Tauchgänge am echten Dori-Wrack (WWII Liberty-Schiff)', ES: 'Inmersiones de entrenamiento en el pecio real Dori (barco Liberty de la IIGM)' },
 { EN: 'Non-penetration techniques + reel navigation', PT: 'Técnicas sem penetração + navegação com carretilha', DE: 'Nicht-Penetrations-Techniken + Rollnavigation', ES: 'Técnicas sin penetración + navegación con carrete' },
 { EN: 'Counts toward AOWD and Master Diver ratings', PT: 'Conta para as classificações AOWD e Master Diver', DE: 'Zählt für AOWD und Master Diver Bewertungen', ES: 'Cuenta para las clasificaciones AOWD y Master Diver' },
 { EN: 'Applicable to any wreck or artificial reef worldwide', PT: 'Aplicável a qualquer naufrágio ou recife artificial no mundo', DE: 'Anwendbar auf jedes Wrack oder künstliche Riff weltweit', ES: 'Aplicable a cualquier pecio o arrecife artificial en el mundo' },
 ],
 includes: [
 { EN: 'Online theory (MySSI)', PT: 'Teoria online (MySSI)', DE: 'Online-Theorie (MySSI)', ES: 'Teoría online (MySSI)' },
 { EN: '2 ocean dives on the Dori wreck', PT: '2 mergulhos no oceano no naufrágio Dori', DE: '2 Ozean-Tauchgänge am Dori-Wrack', ES: '2 inmersiones en el océano en el pecio Dori' },
 { EN: 'All equipment + reel', PT: 'Todo o equipamento + carretilha', DE: 'Gesamte Ausrüstung + Rolle', ES: 'Todo el equipo + carrete' },
 { EN: 'SSI Wreck Diving Specialty certification', PT: 'Certificação SSI Wreck Diving Specialty', DE: 'SSI Wreck Diving Specialty Zertifizierung', ES: 'Certificación SSI Wreck Diving Specialty' },
 { EN: 'Boat & insurance', PT: 'Barco e seguro', DE: 'Boot & Versicherung', ES: 'Barco y seguro' },
 ],
 prereqs: {
 EN: 'SSI Open Water Diver (or equivalent). Minimum age 10.',
 PT: 'SSI Open Water Diver (ou equivalente). Idade mínima 10 anos.',
 DE: 'SSI Open Water Diver (oder gleichwertig). Mindestalter 10 Jahre.',
 ES: 'SSI Open Water Diver (o equivalente). Edad mínima 10 años.',
 },
 duration: { EN: '1–2 days', PT: '1–2 dias', DE: '1–2 Tage', ES: '1–2 días' },
 dives: { EN: '2 ocean dives', PT: '2 mergulhos no oceano', DE: '2 Ozean-Tauchgänge', ES: '2 inmersiones en el océano' },
 depth: { EN: '30 m / 100 ft max', PT: 'Máx. 30 m / 100 ft', DE: 'Max. 30 m / 100 ft', ES: 'Máx. 30 m / 100 ft' },
 certifies: { EN: 'SSI Wreck Diving Specialty', PT: 'SSI Wreck Diving Specialty', DE: 'SSI Wreck Diving Specialty', ES: 'SSI Wreck Diving Specialty' },
 testimonial: { quote: 'If you have the opportunity to visit the Dori Shipwreck, I definitely recommend. It was a highlight for sure. I even was lucky enough to see a Mola Mola!! The team is extremely professional, with thorough briefings on dive spots and safety measures.', author: 'Amanda', source: 'Google Reviews' },
 },
 'night-diving': {
 id: 'night-diving', name: 'Night & Limited Visibility', price: '€350', img: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses/night-diving.webp', accentColor: 'var(--accent)',
 tagline: {
 EN: 'The ocean you know disappears. Another one takes its place.',
 PT: 'O oceano que conhece desaparece. Outro toma o seu lugar.',
 DE: 'Der Ozean, den du kennst, verschwindet. Ein anderer nimmt seinen Platz ein.',
 ES: 'El océano que conoces desaparece. Otro toma su lugar.',
 },
 intro: {
 EN: 'Night diving in the Azores is a completely different experience — bioluminescent plankton trails from your fins, octopuses hunting in the open, morays stretched across the sand, nudibranchs appearing on rocks you swam past at noon without noticing. This specialty gives you the skills and confidence to get in the water after dark.',
 PT: 'Mergulhar à noite nos Açores é uma experiência completamente diferente — trilhos de plâncton bioluminescente das barbatanas, polvos a caçar ao ar livre, morais esticadas na areia, nudibrânquios aparecendo em pedras que passou a nadar ao meio-dia sem notar. Esta especialidade dá-lhe as competências e a confiança para entrar na água depois do anoitecer.',
 DE: 'Nachttauchen auf den Azoren ist eine völlig andere Erfahrung — biolumineszentes Plankton zieht Spuren von deinen Flossen, Oktopusse jagen im Freien, Muränen recken sich über den Sand, Nacktschnecken erscheinen auf Felsen, an denen du mittags vorbeigeschwommen bist, ohne sie zu bemerken. Diese Spezialität gibt dir die Fähigkeiten und das Selbstvertrauen, nach Einbruch der Dunkelheit ins Wasser zu gehen.',
 ES: 'El buceo nocturno en las Azores es una experiencia completamente diferente — rastros de plancton bioluminiscente de sus aletas, pulpos cazando al aire libre, morenas extendidas sobre la arena, nudibranquios apareciendo en rocas que nadó junto a ellas al mediodía sin notar. Esta especialidad le da las habilidades y la confianza para entrar al agua después de que oscurezca.',
 },
 body: [
 {
 EN: 'The theory covers light physics underwater, torch selection, buddy communication at night, and safe entry/exit procedures in low visibility. You\'ll practice signals and navigation in a pool session before your two night ocean dives — entry after sunset, torch navigation along familiar lava ridges that look completely alien in the dark, and close encounters with the nocturnal residents of the reef.',
 PT: 'A teoria cobre a física da luz debaixo de água, seleção de tocha, comunicação com buddy à noite e procedimentos de entrada/saída seguros em baixa visibilidade. Praticará sinais e navegação numa sessão em piscina antes dos seus dois mergulhos noturnos no oceano — entrada após o pôr do sol, navegação com tocha ao longo de cristas de lava familiares que parecem completamente estranhas no escuro e encontros próximos com os residentes noturnos do recife.',
 DE: 'Die Theorie behandelt Lichtphysik unter Wasser, Lampenauswahl, Buddy-Kommunikation bei Nacht und sichere Ein-/Ausstiegsverfahren bei schlechter Sicht. Du übst Signale und Navigation in einer Pool-Session, bevor deine zwei Nacht-Ozean-Tauchgänge beginnen — Einstieg nach Sonnenuntergang, Lampennavigation entlang vertrauter Lavagrate, die im Dunkeln völlig fremd aussehen, und Nahbegegnungen mit den nächtlichen Bewohnern des Riffs.',
 ES: 'La teoría cubre la física de la luz bajo el agua, selección de linterna, comunicación con el compañero de noche y procedimientos de entrada/salida seguros en baja visibilidad. Practicará señales y navegación en una sesión de piscina antes de sus dos inmersiones nocturnas en el océano — entrada después del atardecer, navegación con linterna a lo largo de crestas de lava familiares que parecen completamente ajenas en la oscuridad, y encuentros cercanos con los residentes nocturnos del arrecife.',
 },
 {
 EN: 'Night diving accounts for some of the most memorable dives most people ever do. The Azores after dark is wild: the bioluminescence here is particularly vivid thanks to the depth of open Atlantic surrounding the islands. You\'ll surface with stories. The specialty counts toward AOWD and Master Diver recognition.',
 PT: 'O mergulho noturno é responsável por alguns dos mergulhos mais memoráveis que a maioria das pessoas alguma vez fez. Os Açores ao anoitecer são selvagens: a bioluminescência aqui é particularmente vívida graças à profundidade do Atlântico aberto que rodeia as ilhas. Vai emergir com histórias. A especialidade conta para as classificações AOWD e Master Diver.',
 DE: 'Nachttauchen ist für einige der denkwürdigsten Tauchgänge verantwortlich, die die meisten Menschen je gemacht haben. Die Azoren nach Einbruch der Dunkelheit sind wild: Die Biolumineszenz hier ist besonders lebhaft dank der Tiefe des offenen Atlantiks, der die Inseln umgibt. Du tauchst mit Geschichten auf. Die Spezialität zählt für AOWD und Master Diver Anerkennung.',
 ES: 'El buceo nocturno es responsable de algunas de las inmersiones más memorables que la mayoría de las personas hacen. Las Azores después del anochecer son salvajes: la bioluminiscencia aquí es particularmente vívida gracias a la profundidad del Atlántico abierto que rodea las islas. Saldrá con historias que contar. La especialidad cuenta para las clasificaciones AOWD y Master Diver.',
 },
 ],
 highlights: [
 { EN: '2 real ocean night dives', PT: '2 mergulhos noturnos reais no oceano', DE: '2 echte Nacht-Ozean-Tauchgänge', ES: '2 inmersiones nocturnas reales en el océano' },
 { EN: 'Bioluminescence, octopuses, nocturnal marine life', PT: 'Bioluminescência, polvos, vida marinha noturna', DE: 'Biolumineszenz, Oktopusse, nächtliches Meeresleben', ES: 'Bioluminiscencia, pulpos, vida marina nocturna' },
 { EN: 'Torch navigation + buddy communication at night', PT: 'Navegação com tocha + comunicação com buddy à noite', DE: 'Taschenlampennavigation + Buddy-Kommunikation bei Nacht', ES: 'Navegación con linterna + comunicación con compañero de noche' },
 { EN: 'Counts toward AOWD and Master Diver ratings', PT: 'Conta para as classificações AOWD e Master Diver', DE: 'Zählt für AOWD und Master Diver Bewertungen', ES: 'Cuenta para las clasificaciones AOWD y Master Diver' },
 ],
 includes: [
 { EN: 'Online theory (MySSI)', PT: 'Teoria online (MySSI)', DE: 'Online-Theorie (MySSI)', ES: 'Teoría online (MySSI)' },
 { EN: '2 night ocean dives to 30 m', PT: '2 mergulhos noturnos no oceano até 30 m', DE: '2 Nacht-Ozean-Tauchgänge bis 30 m', ES: '2 inmersiones nocturnas en el océano hasta 30 m' },
 { EN: 'Dive torch (rental)', PT: 'Tocha de mergulho (aluguer)', DE: 'Taucherlampe (Verleih)', ES: 'Linterna de buceo (alquiler)' },
 { EN: 'All dive equipment', PT: 'Todo o equipamento de mergulho', DE: 'Gesamte Tauchausrüstung', ES: 'Todo el equipo de buceo' },
 { EN: 'SSI Night Diving & Limited Visibility Specialty certification', PT: 'Certificação SSI Night Diving & Limited Visibility Specialty', DE: 'SSI Night Diving & Limited Visibility Specialty Zertifizierung', ES: 'Certificación SSI Night Diving & Limited Visibility Specialty' },
 { EN: 'Boat & insurance', PT: 'Barco e seguro', DE: 'Boot & Versicherung', ES: 'Barco y seguro' },
 ],
 prereqs: {
 EN: 'SSI Open Water Diver (or equivalent). Minimum age 10.',
 PT: 'SSI Open Water Diver (ou equivalente). Idade mínima 10 anos.',
 DE: 'SSI Open Water Diver (oder gleichwertig). Mindestalter 10 Jahre.',
 ES: 'SSI Open Water Diver (o equivalente). Edad mínima 10 años.',
 },
 duration: { EN: '1 evening/night session', PT: '1 sessão noturna', DE: '1 Abend-/Nachtsession', ES: '1 sesión de tarde/noche' },
 dives: { EN: '2 night ocean dives', PT: '2 mergulhos noturnos no oceano', DE: '2 Nacht-Ozean-Tauchgänge', ES: '2 inmersiones nocturnas en el océano' },
 depth: { EN: '30 m / 100 ft max', PT: 'Máx. 30 m / 100 ft', DE: 'Max. 30 m / 100 ft', ES: 'Máx. 30 m / 100 ft' },
 certifies: { EN: 'SSI Night Diving & Limited Visibility Specialty', PT: 'SSI Night Diving & Limited Visibility Specialty', DE: 'SSI Night Diving & Limited Visibility Specialty', ES: 'SSI Night Diving & Limited Visibility Specialty' },
 testimonial: { quote: 'We dived with them for 3 days, really professionals and all the equipment is perfect. The Dori Wreck dive is amazing and we even did a night dive there. They were incredible and super reliable. I would highly recommend this diving center!', author: 'Sara G.', source: 'Google Reviews' },
 },
 'navigation': {
 id: 'navigation', name: 'Navigation', price: '€260', img: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses/navigation.webp', accentColor: 'var(--accent)',
 tagline: {
 EN: 'Know exactly where you are, 25 m underwater.',
 PT: 'Saiba exatamente onde está, a 25 m de profundidade.',
 DE: 'Wisse genau, wo du bist — 25 m unter Wasser.',
 ES: 'Saber exactamente dónde estás, a 25 m bajo el agua.',
 },
 intro: {
 EN: 'Underwater navigation is the skill most divers wish they had learned earlier. Compass bearings, back-bearings, natural references, distance estimation — this specialty makes you self-sufficient and sharply aware of the topography around you.',
 PT: 'A navegação subaquática é a competência que a maioria dos mergulhadores deseja ter aprendido mais cedo. Rumos de bússola, contra-rumos, referências naturais, estimativa de distância — esta especialidade torna-o autossuficiente e muito consciente da topografia à sua volta.',
 DE: 'Unterwassernavigation ist die Fähigkeit, die sich die meisten Taucher wünschen, früher gelernt zu haben. Kompasskurse, Gegenkurse, natürliche Referenzen, Entfernungsschätzung — diese Spezialität macht dich selbstständig und schärft deinen Blick für die Topographie um dich herum.',
 ES: 'La navegación subacuática es la habilidad que la mayoría de los buceadores desean haber aprendido antes. Rumbos de brújula, contrarumbos, referencias naturales, estimación de distancias — esta especialidad le hace autosuficiente y muy consciente de la topografía a su alrededor.',
 },
 body: [
 {
 EN: 'The course covers compass navigation (heading, back-bearing, rectangular search patterns), natural navigation using the topography, current direction, depth contours and light angle, and distance estimation by kick cycle or time. Your two ocean dives put it into practice on real sites — navigating into swim-throughs by compass, locating the same cleaning station twice from different directions, and returning to the anchor line from 150 m away.',
 PT: 'O curso cobre navegação por bússola (rumo, contra-rumo, padrões de busca retangulares), navegação natural usando a topografia, direção da corrente, contornos de profundidade e ângulo de luz, e estimativa de distância por ciclo de palmarada ou tempo. Os seus dois mergulhos no oceano colocam tudo em prática em locais reais — navegar para passagens por bússola, localizar a mesma estação de limpeza duas vezes a partir de direções diferentes e regressar ao cabo de ancoragem a 150 m de distância.',
 DE: 'Der Kurs behandelt Kompassnavigation (Kurs, Gegenkurs, rechteckige Suchmuster), natürliche Navigation mithilfe der Topographie, Strömungsrichtung, Tiefenkonturen und Lichtwinkel sowie Entfernungsschätzung nach Flossenschlagzyklus oder Zeit. Deine zwei Ozean-Tauchgänge setzen dies an echten Plätzen in die Praxis um — per Kompass in Durchschwimmgänge navigieren, dieselbe Putzstation zweimal aus verschiedenen Richtungen orten und von 150 m Entfernung zur Ankerleine zurückkehren.',
 ES: 'El curso cubre navegación por brújula (rumbo, contrarumbo, patrones de búsqueda rectangulares), navegación natural usando la topografía, dirección de la corriente, contornos de profundidad y ángulo de luz, y estimación de distancias por ciclo de patada o tiempo. Sus dos inmersiones en el océano lo ponen en práctica en sitios reales — navegar a túneles por brújula, localizar la misma estación de limpieza dos veces desde diferentes direcciones, y regresar a la línea de fondeo desde 150 m de distancia.',
 },
 {
 EN: 'The Azores\' volcanic topography is excellent for natural nav practice: lava ridges, sand channels, wall transitions and the dramatic depth changes around the volcanic arches give you constant reference points to work with. Navigation is one of the two mandatory adventure dives in the AOWD program, so it also counts as credit toward that certification.',
 PT: 'A topografia vulcânica dos Açores é excelente para a prática de navegação natural: cristas de lava, canais de areia, transições de parede e as dramáticas mudanças de profundidade em torno dos arcos vulcânicos dão-lhe pontos de referência constantes para trabalhar. A Navegação é um dos dois mergulhos de aventura obrigatórios no programa AOWD, por isso também conta como crédito para essa certificação.',
 DE: 'Die vulkanische Topographie der Azoren ist hervorragend für die natürliche Nav-Übung: Lavagrate, Sandkanäle, Wandübergänge und die dramatischen Tiefenwechsel rund um die Vulkanbögen geben dir konstante Referenzpunkte zum Arbeiten. Navigation ist einer der zwei obligatorischen Abenteuertauchgänge im AOWD-Programm, also zählt sie auch als Guthaben für diese Zertifizierung.',
 ES: 'La topografía volcánica de las Azores es excelente para la práctica de navegación natural: crestas de lava, canales de arena, transiciones de pared y los dramáticos cambios de profundidad alrededor de los arcos volcánicos le dan puntos de referencia constantes con los que trabajar. La Navegación es una de las dos inmersiones de aventura obligatorias en el programa AOWD, por lo que también cuenta como crédito para esa certificación.',
 },
 ],
 highlights: [
 { EN: 'Compass + natural navigation both covered', PT: 'Navegação por bússola + natural ambas cobertas', DE: 'Kompass- + natürliche Navigation beides abgedeckt', ES: 'Navegación por brújula + natural, ambas cubiertas' },
 { EN: '2 ocean dives on genuine Azorean volcanic sites', PT: '2 mergulhos no oceano em locais vulcânicos açorianos genuínos', DE: '2 Ozean-Tauchgänge an echten azorischen Vulkanstellen', ES: '2 inmersiones en el océano en sitios volcánicos auténticos de las Azores' },
 { EN: 'Mandatory AOWD adventure specialty — earns credit', PT: 'Especialidade de aventura obrigatória do AOWD — ganha crédito', DE: 'Pflicht-AOWD-Abenteuerspezialität — verdient Guthaben', ES: 'Especialidad de aventura obligatoria del AOWD — obtiene crédito' },
 { EN: 'Never get turned around on a dive again', PT: 'Nunca mais se perder numa mergulho', DE: 'Nie wieder auf einem Tauchgang die Orientierung verlieren', ES: 'Nunca más desorientarse en una inmersión' },
 ],
 includes: [
 { EN: 'Online theory (MySSI)', PT: 'Teoria online (MySSI)', DE: 'Online-Theorie (MySSI)', ES: 'Teoría online (MySSI)' },
 { EN: '2 ocean dives to 30 m', PT: '2 mergulhos no oceano até 30 m', DE: '2 Ozean-Tauchgänge bis 30 m', ES: '2 inmersiones en el océano hasta 30 m' },
 { EN: 'Compass (rental)', PT: 'Bússola (aluguer)', DE: 'Kompass (Verleih)', ES: 'Brújula (alquiler)' },
 { EN: 'All dive equipment', PT: 'Todo o equipamento de mergulho', DE: 'Gesamte Tauchausrüstung', ES: 'Todo el equipo de buceo' },
 { EN: 'SSI Navigation Specialty certification', PT: 'Certificação SSI Navigation Specialty', DE: 'SSI Navigation Specialty Zertifizierung', ES: 'Certificación SSI Navigation Specialty' },
 { EN: 'Boat & insurance', PT: 'Barco e seguro', DE: 'Boot & Versicherung', ES: 'Barco y seguro' },
 ],
 prereqs: {
 EN: 'SSI Open Water Diver (or equivalent). Minimum age 10.',
 PT: 'SSI Open Water Diver (ou equivalente). Idade mínima 10 anos.',
 DE: 'SSI Open Water Diver (oder gleichwertig). Mindestalter 10 Jahre.',
 ES: 'SSI Open Water Diver (o equivalente). Edad mínima 10 años.',
 },
 duration: { EN: '1–2 days', PT: '1–2 dias', DE: '1–2 Tage', ES: '1–2 días' },
 dives: { EN: '2 ocean dives', PT: '2 mergulhos no oceano', DE: '2 Ozean-Tauchgänge', ES: '2 inmersiones en el océano' },
 depth: { EN: '30 m / 100 ft max', PT: 'Máx. 30 m / 100 ft', DE: 'Max. 30 m / 100 ft', ES: 'Máx. 30 m / 100 ft' },
 certifies: { EN: 'SSI Navigation Specialty', PT: 'SSI Navigation Specialty', DE: 'SSI Navigation Specialty', ES: 'SSI Navigation Specialty' },
 testimonial: { quote: 'Great dives around the Arca and Dori wreck with Celia and Martin. Guys make it all very easy. Boat skippers are the best, thanks all ', author: 'Adventure64449448558', source: 'TripAdvisor' },
 },
 'deep-diving': {
 id: 'deep-diving', name: 'Deep Diving', price: '€350', img: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses/deep-diving.webp', accentColor: 'var(--accent)',
 tagline: {
 EN: "The real depth starts at 20 m. Let's go further.",
 PT: 'A profundidade real começa nos 20 m. Vamos mais fundo.',
 DE: 'Die echte Tiefe beginnt bei 20 m. Gehen wir weiter.',
 ES: 'La profundidad real comienza a los 20 m. Vayamos más lejos.',
 },
 intro: {
 EN: 'Deep diving is its own discipline — gas consumption maths, narcosis awareness, controlled descent and ascent rates, dive computer interpretation. This specialty takes you from 18 m to 40 m with the knowledge to manage every metre safely.',
 PT: 'O mergulho em profundidade é a sua própria disciplina — cálculos de consumo de gás, consciência de narcose, taxas de descida e subida controladas, interpretação do computador de mergulho. Esta especialidade leva-o de 18 m a 40 m com o conhecimento para gerir cada metro em segurança.',
 DE: 'Tieftauchen ist eine eigene Disziplin — Gasverbrauchsberechnungen, Narkose-Bewusstsein, kontrollierte Ab- und Auftauchgeschwindigkeiten, Tauchcomputer-Interpretation. Diese Spezialität bringt dich von 18 m auf 40 m mit dem Wissen, jeden Meter sicher zu managen.',
 ES: 'El buceo en profundidad es su propia disciplina — cálculos de consumo de gas, conciencia de narcosis, tasas de descenso y ascenso controladas, interpretación del ordenador de buceo. Esta especialidad le lleva de 18 m a 40 m con el conocimiento para gestionar cada metro de forma segura.',
 },
 body: [
 {
 EN: 'Three ocean dives across the full depth range. The academics cover Boyle\'s Law in practice, gas consumption planning, the physiological effects of nitrogen narcosis (and how to recognise it in yourself and your buddy), and how to get the most from your dive computer at depth. You\'ll dive the deeper walls and structures around São Miguel that require this cert — including the keel of the Dori wreck at 40 m.',
 PT: 'Três mergulhos no oceano em toda a gama de profundidades. A teoria cobre a Lei de Boyle na prática, planeamento do consumo de gás, os efeitos fisiológicos da narcose por azoto (e como reconhecê-la em si mesmo e no seu buddy) e como tirar o máximo do seu computador de mergulho em profundidade. Vai mergulhar as paredes e estruturas mais profundas em redor de São Miguel que requerem esta certificação — incluindo a quilha do naufrágio Dori a 40 m.',
 DE: 'Drei Ozean-Tauchgänge über den gesamten Tiefenbereich. Die Theorie behandelt das Boyle\'sche Gesetz in der Praxis, Gasverbrauchsplanung, die physiologischen Auswirkungen von Stickstoffnarkose (und wie man sie bei sich selbst und beim Buddy erkennt) und wie man das Beste aus seinem Tauchcomputer in der Tiefe herausholt. Du wirst die tieferen Wände und Strukturen rund um São Miguel tauchen, die dieses Zertifikat erfordern — einschließlich des Kiels des Dori-Wracks bei 40 m.',
 ES: 'Tres inmersiones en el océano en toda la gama de profundidades. Los contenidos académicos cubren la Ley de Boyle en la práctica, planificación del consumo de gas, los efectos fisiológicos de la narcosis por nitrógeno (y cómo reconocerla en uno mismo y en el compañero) y cómo sacar el máximo partido del ordenador de buceo en profundidad. Buceará las paredes y estructuras más profundas alrededor de São Miguel que requieren esta certificación — incluyendo la quilla del pecio Dori a 40 m.',
 },
 {
 EN: 'At 15+, this is the minimum age specialty for good reason — the physiological demands at 30–40 m are real and the margin for error narrows. With proper training, the deep Atlantic walls of the Azores are breathtaking: large pelagics pass through at depth, the colour temperature shifts dramatically, and the sense of scale is unlike anything in the shallows.',
 PT: 'A partir dos 15 anos, esta é a especialidade de idade mínima por boas razões — as exigências fisiológicas a 30–40 m são reais e a margem para erro estreita-se. Com formação adequada, as paredes atlânticas profundas dos Açores são de tirar o fôlego: grandes pelágicos passam em profundidade, a temperatura de cor muda dramaticamente e o sentido de escala é diferente de qualquer coisa nas águas rasas.',
 DE: 'Mit 15+ hat diese Spezialität aus gutem Grund ein Mindestalter — die physiologischen Anforderungen bei 30–40 m sind real und der Fehlermargen engt sich ein. Mit angemessener Ausbildung sind die tiefen Atlantikwände der Azoren atemberaubend: Große Pelagische ziehen in der Tiefe durch, die Farbtemperatur verändert sich dramatisch und das Gefühl für Maßstäbe ist unvergleichlich mit allem in den Flachwasserzonen.',
 ES: 'Con 15+ años, esta es la especialidad de edad mínima por buenas razones — las exigencias fisiológicas a 30–40 m son reales y el margen de error se estrecha. Con la formación adecuada, las paredes atlánticas profundas de las Azores son impresionantes: los grandes pelágicos pasan a profundidad, la temperatura de color cambia dramáticamente y el sentido de escala es incomparable con cualquier cosa en las aguas poco profundas.',
 },
 ],
 highlights: [
 { EN: 'Dive to 40 m / 130 ft', PT: 'Mergulhar até 40 m / 130 ft', DE: 'Tauchen bis 40 m / 130 ft', ES: 'Bucea hasta 40 m / 130 ft' },
 { EN: '3 ocean dives across the depth range', PT: '3 mergulhos no oceano em toda a gama de profundidades', DE: '3 Ozean-Tauchgänge über den gesamten Tiefenbereich', ES: '3 inmersiones en el océano en toda la gama de profundidades' },
 { EN: 'Gas management, narcosis awareness, computer use', PT: 'Gestão de gás, consciência de narcose, uso do computador', DE: 'Gasmanagement, Narkose-Bewusstsein, Computernutzung', ES: 'Gestión de gas, conciencia de narcosis, uso del ordenador' },
 { EN: 'Unlocks the Dori\'s keel and deeper volcanic walls', PT: 'Abre a quilha da Dori e as paredes vulcânicas mais profundas', DE: 'Erschließt den Dori-Kiel und tiefere Vulkanwände', ES: 'Desbloquea la quilla de la Dori y las paredes volcánicas más profundas' },
 ],
 includes: [
 { EN: 'Online theory (MySSI)', PT: 'Teoria online (MySSI)', DE: 'Online-Theorie (MySSI)', ES: 'Teoría online (MySSI)' },
 { EN: '3 ocean dives (to 40 m)', PT: '3 mergulhos no oceano (até 40 m)', DE: '3 Ozean-Tauchgänge (bis 40 m)', ES: '3 inmersiones en el océano (hasta 40 m)' },
 { EN: 'All dive equipment', PT: 'Todo o equipamento de mergulho', DE: 'Gesamte Tauchausrüstung', ES: 'Todo el equipo de buceo' },
 { EN: 'SSI Deep Diving Specialty certification', PT: 'Certificação SSI Deep Diving Specialty', DE: 'SSI Deep Diving Specialty Zertifizierung', ES: 'Certificación SSI Deep Diving Specialty' },
 { EN: 'Boat & insurance', PT: 'Barco e seguro', DE: 'Boot & Versicherung', ES: 'Barco y seguro' },
 ],
 prereqs: {
 EN: 'SSI Open Water Diver (or equivalent). Minimum age 15.',
 PT: 'SSI Open Water Diver (ou equivalente). Idade mínima 15 anos.',
 DE: 'SSI Open Water Diver (oder gleichwertig). Mindestalter 15 Jahre.',
 ES: 'SSI Open Water Diver (o equivalente). Edad mínima 15 años.',
 },
 duration: { EN: '2 days', PT: '2 dias', DE: '2 Tage', ES: '2 días' },
 dives: { EN: '3 ocean dives', PT: '3 mergulhos no oceano', DE: '3 Ozean-Tauchgänge', ES: '3 inmersiones en el océano' },
 depth: { EN: '18–40 m / 60–130 ft', PT: '18–40 m / 60–130 ft', DE: '18–40 m / 60–130 ft', ES: '18–40 m / 60–130 ft' },
 certifies: { EN: 'SSI Deep Diving Specialty', PT: 'SSI Deep Diving Specialty', DE: 'SSI Deep Diving Specialty', ES: 'SSI Deep Diving Specialty' },
 testimonial: { quote: 'The instructor was absolutely amazing and reassured me from the start. Everything was clearly explained before getting in the water and the whole team was really attentive and caring. I\'ve got my dive confidence back and will definitely be diving again in São Miguel.', author: 'Sanne F.', source: 'TripAdvisor' },
 },
 'offshore-prep': {
 id: 'offshore-prep', name: 'Offshore Prep', price: '€160', accentColor: '#c9b48a',
 tagline: {
 EN: 'Train for the Formigas. Run it like a pro.',
 PT: 'Prepare-se para as Formigas. Execute como um profissional.',
 DE: 'Für die Formigas trainieren. Wie ein Profi durchführen.',
 ES: 'Entrena para Formigas. Ejecútalo como un profesional.',
 },
 intro: {
 EN: 'The Formigas is a 42 nm offshore run to an exposed seamount in full Atlantic conditions — mantas, mobulas, dusky groupers, big current. Offshore Prep is our in-house programme, developed exclusively for these waters to get you ready for it.',
 PT: 'As Formigas é uma travessia offshore de 42 nm até um monte submarino exposto em plenas condições atlânticas — mantas, mobulas, garoupas negras, grande corrente. O Offshore Prep é o nosso programa interno, desenvolvido exclusivamente para estas águas para o preparar para isso.',
 DE: 'Die Formigas ist eine 42-nm-Offshore-Fahrt zu einem exponierten Seamount unter vollen Atlantik-Bedingungen — Mantas, Mobulas, Mönchsbarsche, starke Strömung. Offshore Prep ist unser Inhouse-Programm, das exklusiv für diese Gewässer entwickelt wurde, um dich darauf vorzubereiten.',
 ES: 'Las Formigas es una travesía offshore de 42 mn hasta un monte submarino expuesto en plenas condiciones atlánticas — mantas, mobulas, meros negros, fuerte corriente. Offshore Prep es nuestro programa propio, desarrollado exclusivamente para estas aguas para prepararle para ello.',
 },
 body: [
 {
 EN: 'We designed this course in-house for AZD divers heading to Formigas and other open-water offshore sites in the mid-Atlantic. The theory session covers current prediction, surface protocols, SMB deployment, drift entry technique, and what to do if conditions change mid-dive. Two training dives follow at Ilhéu de Vila Franca do Campo, where tidal surge and exposed conditions simulate real offshore exposure.',
 PT: 'Concebemos este curso internamente para os mergulhadores da AZD que se dirigem para Formigas e outros locais offshore de águas abertas no Atlântico médio. A sessão de teoria cobre previsão de correntes, protocolos de superfície, lançamento de SMB, técnica de entrada em deriva e o que fazer se as condições mudarem a meio do mergulho. Seguem-se dois mergulhos de treino no Ilhéu de Vila Franca do Campo, onde o surge mareal e as condições expostas simulam a exposição offshore real.',
 DE: 'Wir haben diesen Kurs intern für AZD-Taucher entwickelt, die zu Formigas und anderen Offshore-Freiwasserstandorten im Mittelatlantik fahren. Die Theoriestunde behandelt Strömungsvorhersage, Oberflächenprotokolle, SMB-Einsatz, Drift-Einsteige-Technik und was zu tun ist, wenn sich die Bedingungen während des Tauchens ändern. Zwei Trainings-Tauchgänge folgen bei Ilhéu de Vila Franca do Campo, wo Gezeitensurge und exponierte Bedingungen echte Offshore-Exposition simulieren.',
 ES: 'Diseñamos este curso internamente para los buceadores de AZD que se dirigen a Formigas y otros sitios offshore de aguas abiertas en el Atlántico central. La sesión de teoría cubre predicción de corrientes, protocolos de superficie, despliegue de SMB, técnica de entrada en deriva y qué hacer si las condiciones cambian a mitad de la inmersión. A continuación, dos inmersiones de entrenamiento en el Ilhéu de Vila Franca do Campo, donde el oleaje mareal y las condiciones expuestas simulan la exposición offshore real.',
 },
 {
 EN: 'After Offshore Prep, you can read water from the surface, deploy a delayed SMB at 20 m in a gentle current, and execute a safe abort if conditions deteriorate. The Formigas waitlist prioritises divers who hold this certification. Prerequisites: Open Water Diver and 20 logged dives — this is not an entry-level course.',
 PT: 'Após o Offshore Prep, consegue ler a água da superfície, lançar um SMB atrasado a 20 m numa corrente suave e executar um abandono seguro se as condições se deteriorarem. A lista de espera das Formigas prioriza os mergulhadores que possuem esta certificação. Pré-requisitos: Open Water Diver e 20 mergulhos registados — este não é um curso de nível inicial.',
 DE: 'Nach Offshore Prep kannst du Wasser von der Oberfläche lesen, eine Boje (DSMB) bei 20 m in sanfter Strömung setzen und einen sicheren Abbruch ausführen, wenn sich die Bedingungen verschlechtern. Die Formigas-Warteliste priorisiert Taucher, die diese Zertifizierung besitzen. Voraussetzungen: Open Water Diver und 20 protokollierte Tauchgänge — dies ist kein Einsteigerkurs.',
 ES: 'Después de Offshore Prep, puede leer el agua desde la superficie, desplegar un SMB retardado a 20 m en una corriente suave y ejecutar un abandono seguro si las condiciones se deterioran. La lista de espera de Formigas prioriza a los buceadores que tienen esta certificación. Requisitos previos: Open Water Diver y 20 inmersiones registradas — este no es un curso de nivel principiante.',
 },
 ],
 highlights: [
 { EN: 'AZD-developed · Azores Exclusive', PT: 'Desenvolvido pela AZD · Exclusivo dos Açores', DE: 'Von AZD entwickelt · Azoren-exklusiv', ES: 'Desarrollado por AZD · Exclusivo de Azores' },
 { EN: 'SMB deployment + drift entry in real conditions', PT: 'Lançamento de SMB + entrada em deriva em condições reais', DE: 'SMB-Einsatz + Drift-Einstieg unter echten Bedingungen', ES: 'Despliegue de SMB + entrada en deriva en condiciones reales' },
 { EN: 'Formigas waitlist priority for certified holders', PT: 'Prioridade na lista de espera das Formigas para titulares certificados', DE: 'Formigas-Wartelisten-Priorität für zertifizierte Inhaber', ES: 'Prioridad en la lista de espera de Formigas para titulares certificados' },
 { EN: 'Training at Ilhéu de Vila Franca — real Atlantic surge', PT: 'Treino no Ilhéu de Vila Franca — surge atlântico real', DE: 'Training bei Ilhéu de Vila Franca — echter Atlantik-Surge', ES: 'Entrenamiento en Ilhéu de Vila Franca — surge atlántico real' },
 ],
 includes: [
 { EN: '1 theory session (1.5 hrs)', PT: '1 sessão de teoria (1,5 h)', DE: '1 Theoriestunde (1,5 Std.)', ES: '1 sesión de teoría (1,5 h)' },
 { EN: '2 ocean training dives', PT: '2 mergulhos de treino no oceano', DE: '2 Ozean-Trainings-Tauchgänge', ES: '2 inmersiones de entrenamiento en el océano' },
 { EN: 'SMB (rental)', PT: 'SMB (aluguer)', DE: 'SMB (Verleih)', ES: 'SMB (alquiler)' },
 { EN: 'All dive equipment', PT: 'Todo o equipamento de mergulho', DE: 'Gesamte Tauchausrüstung', ES: 'Todo el equipo de buceo' },
 { EN: 'Azores Offshore Prep certification (AZD)', PT: 'Certificação Azores Offshore Prep (AZD)', DE: 'Azores Offshore Prep Zertifizierung (AZD)', ES: 'Certificación Azores Offshore Prep (AZD)' },
 { EN: 'Boat & insurance', PT: 'Barco e seguro', DE: 'Boot & Versicherung', ES: 'Barco y seguro' },
 ],
 prereqs: {
 EN: 'Open Water Diver + minimum 20 logged dives.',
 PT: 'Open Water Diver + mínimo de 20 mergulhos registados.',
 DE: 'Open Water Diver + mindestens 20 protokollierte Tauchgänge.',
 ES: 'Open Water Diver + mínimo 20 inmersiones registradas.',
 },
 duration: { EN: '1 day + theory', PT: '1 dia + teoria', DE: '1 Tag + Theorie', ES: '1 día + teoría' },
 dives: { EN: '2 ocean dives', PT: '2 mergulhos no oceano', DE: '2 Ozean-Tauchgänge', ES: '2 inmersiones en el océano' },
 depth: { EN: '18–30 m', PT: '18–30 m', DE: '18–30 m', ES: '18–30 m' },
 certifies: {
 EN: 'Offshore Prep · Azores Diving (local certification)',
 PT: 'Offshore Prep · Azores Diving (certificação local)',
 DE: 'Offshore Prep · Azores Diving (lokale Zertifizierung)',
 ES: 'Offshore Prep · Azores Diving (certificación local)',
 },
 },
 'react-right': {
 id: 'react-right', name: 'React Right', price: '€180', img: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses/react-right.webp', accentColor: 'var(--muted)',
 tagline: {
 EN: 'The course everyone hopes never to use.',
 PT: 'O curso que todos esperam nunca ter de usar.',
 DE: 'Der Kurs, den jeder hofft, nie benutzen zu müssen.',
 ES: 'El curso que todos esperan no tener que usar nunca.',
 },
 intro: {
 EN: 'SSI React Right covers first aid, CPR and emergency oxygen administration — the chain of survival before the ambulance arrives. Required as a prerequisite for the Stress & Rescue course, and immediately applicable in any emergency situation, not just diving.',
 PT: 'O SSI React Right cobre primeiros socorros, RCP e administração de oxigénio de emergência — a cadeia de sobrevivência antes de a ambulância chegar. Obrigatório como pré-requisito para o curso Stress & Rescue, e imediatamente aplicável em qualquer situação de emergência, não apenas em mergulho.',
 DE: 'SSI React Right behandelt Erste Hilfe, CPR und Notfall-Sauerstoffgabe — die Überlebenskette, bevor der Krankenwagen eintrifft. Als Voraussetzung für den Stress & Rescue Kurs erforderlich und in jeder Notfallsituation sofort anwendbar, nicht nur beim Tauchen.',
 ES: 'SSI React Right cubre primeros auxilios, RCP y administración de oxígeno de emergencia — la cadena de supervivencia antes de que llegue la ambulancia. Requisito previo para el curso Stress & Rescue, e inmediatamente aplicable en cualquier situación de emergencia, no solo en buceo.',
 },
 body: [
 {
 EN: 'Scenarios include unconscious casualties, emergency oxygen administration, spinal injury management and coordinating emergency response at a remote dive site. This is a classroom and practical course with no dive component — a half-day of scenarios and technique that all AZD staff hold.',
 PT: 'Os cenários incluem vítimas inconscientes, administração de oxigénio de emergência, gestão de lesões na coluna e coordenação da resposta de emergência num local de mergulho remoto. Este é um curso teórico e prático sem componente de mergulho — meio dia de cenários e técnica que todo o pessoal da AZD possui.',
 DE: 'Szenarien umfassen bewusstlose Verletzte, Notfall-Sauerstoffgabe, Wirbelsäulenverletzungsmanagement und die Koordination der Notfallreaktion an einem abgelegenen Tauchplatz. Dies ist ein Kurs aus Unterricht und Praxis ohne Tauchkomponente — ein halber Tag mit Szenarien und Technik, die alle AZD-Mitarbeiter besitzen.',
 ES: 'Los escenarios incluyen víctimas inconscientes, administración de oxígeno de emergencia, gestión de lesiones medulares y coordinación de la respuesta de emergencia en un sitio de buceo remoto. Este es un curso teórico y práctico sin componente de buceo — medio día de escenarios y técnica que posee todo el personal de AZD.',
 },
 {
 EN: 'React Right is the entry point to SSI\'s rescue training pathway. It\'s also just a genuinely useful thing to know — the skills apply in any outdoor emergency. If you\'re already planning to do Stress & Rescue, React Right is bundled into that program, so you only need this standalone course if you want the cert without the full rescue training.',
 PT: 'O React Right é o ponto de entrada para a via de formação em resgate da SSI. É também simplesmente uma coisa genuinamente útil de saber — as competências aplicam-se em qualquer emergência ao ar livre. Se já está a planear fazer o Stress & Rescue, o React Right está incluído nesse programa, por isso apenas precisa deste curso autónomo se quiser a certificação sem a formação completa em resgate.',
 DE: 'React Right ist der Einstiegspunkt in SSIs Rettungsausbildungsweg. Es ist auch einfach eine wirklich nützliche Sache zu wissen — die Fähigkeiten gelten bei jedem Notfall im Freien. Wenn du bereits planst, Stress & Rescue zu machen, ist React Right in diesem Programm enthalten, sodass du diesen eigenständigen Kurs nur brauchst, wenn du das Zertifikat ohne die vollständige Rettungsausbildung möchtest.',
 ES: 'React Right es el punto de entrada a la vía de formación en rescate de SSI. También es simplemente algo genuinamente útil de saber — las habilidades se aplican en cualquier emergencia al aire libre. Si ya planea hacer Stress & Rescue, React Right está incluido en ese programa, por lo que solo necesita este curso independiente si quiere la certificación sin la formación completa en rescate.',
 },
 ],
 highlights: [
 { EN: 'First aid, CPR + emergency oxygen', PT: 'Primeiros socorros, RCP + oxigénio de emergência', DE: 'Erste Hilfe, CPR + Notfall-Sauerstoff', ES: 'Primeros auxilios, RCP + oxígeno de emergencia' },
 { EN: 'Required prerequisite for Stress & Rescue', PT: 'Pré-requisito obrigatório para Stress & Rescue', DE: 'Erforderliche Voraussetzung für Stress & Rescue', ES: 'Requisito previo obligatorio para Stress & Rescue' },
 { EN: 'No dive component — half-day classroom + practical', PT: 'Sem componente de mergulho — meio dia de aula + prática', DE: 'Keine Tauchkomponente — halber Tag Unterricht + Praxis', ES: 'Sin componente de buceo — medio día de aula + práctica' },
 { EN: 'Applicable in any emergency, not just diving', PT: 'Aplicável em qualquer emergência, não apenas em mergulho', DE: 'Anwendbar in jedem Notfall, nicht nur beim Tauchen', ES: 'Aplicable en cualquier emergencia, no solo en buceo' },
 ],
 includes: [
 { EN: 'All training materials', PT: 'Todos os materiais de formação', DE: 'Alle Trainingsmaterialien', ES: 'Todos los materiales de formación' },
 { EN: 'First aid kit practice scenarios', PT: 'Cenários de prática com kit de primeiros socorros', DE: 'Erste-Hilfe-Set Praxisszenarien', ES: 'Escenarios de práctica con kit de primeros auxilios' },
 { EN: 'SSI React Right certification card', PT: 'Cartão de certificação SSI React Right', DE: 'SSI React Right Zertifizierungskarte', ES: 'Tarjeta de certificación SSI React Right' },
 ],
 prereqs: {
 EN: 'None. Minimum age 10.',
 PT: 'Nenhum. Idade mínima 10 anos.',
 DE: 'Keine. Mindestalter 10 Jahre.',
 ES: 'Ninguno. Edad mínima 10 años.',
 },
 duration: { EN: 'Half day', PT: 'Meio dia', DE: 'Halber Tag', ES: 'Medio día' },
 dives: { EN: 'No dive component', PT: 'Sem componente de mergulho', DE: 'Keine Tauchkomponente', ES: 'Sin componente de buceo' },
 depth: { EN: '—', PT: '—', DE: '—', ES: '—' },
 certifies: { EN: 'SSI React Right', PT: 'SSI React Right', DE: 'SSI React Right', ES: 'SSI React Right' },
 testimonial: { quote: 'The training was well structured and extremely informative. Every part was explained clearly, making the learning experience both enjoyable and confidence-building. The instructor made me feel comfortable and supported throughout — highly recommend.', author: 'Júlia Carolina M.', source: 'TripAdvisor' },
 },
 'stress-rescue': {
 id: 'stress-rescue', name: 'Stress & Rescue', price: '€360', img: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses/stress-rescue.webp', accentColor: 'var(--muted)',
 tagline: {
 EN: 'The best course most divers ever take.',
 PT: 'O melhor curso que a maioria dos mergulhadores alguma vez faz.',
 DE: 'Der beste Kurs, den die meisten Taucher je machen.',
 ES: 'El mejor curso que hacen la mayoría de los buceadores.',
 },
 intro: {
 EN: 'Stress & Rescue is consistently rated the most impactful course divers take after basic certification. You learn to spot distress before it becomes an emergency, prevent problems through awareness, and perform full underwater rescues. It changes how you dive — for everyone around you.',
 PT: 'O Stress & Rescue é consistentemente classificado como o curso mais impactante que os mergulhadores fazem após a certificação básica. Aprende a detetar angústia antes de se tornar uma emergência, prevenir problemas através da consciência e realizar resgates subaquáticos completos. Muda a forma como mergulha — para todos à sua volta.',
 DE: 'Stress & Rescue wird konsequent als der wirkungsvollste Kurs bewertet, den Taucher nach der Grundzertifizierung belegen. Du lernst, Notlagen zu erkennen, bevor sie zu einem Notfall werden, Probleme durch Bewusstsein zu verhindern und vollständige Unterwasserrettungen durchzuführen. Es verändert, wie du tauchst — für alle um dich herum.',
 ES: 'Stress & Rescue está calificado consistentemente como el curso más impactante que los buceadores hacen después de la certificación básica. Aprende a detectar el estrés antes de que se convierta en una emergencia, prevenir problemas mediante la conciencia y realizar rescates subacuáticos completos. Cambia cómo bucea — para todos a su alrededor.',
 },
 body: [
 {
 EN: 'The course opens with stress and panic theory: the physiological cascade that leads to a diving accident, and how to interrupt it early with calm and technique. Then in the water: tired diver tows, panicked diver approaches, missing diver searches, and unconscious diver recoveries from depth. The final session is a full rescue simulation — multi-step, realistic, demanding.',
 PT: 'O curso começa com teoria sobre stress e pânico: a cascata fisiológica que leva a um acidente de mergulho e como interrompê-la cedo com calma e técnica. Depois na água: reboque de mergulhador cansado, aproximação a mergulhador em pânico, pesquisa de mergulhador desaparecido e recuperação de mergulhador inconsciente em profundidade. A sessão final é uma simulação de resgate completa — em várias etapas, realista e exigente.',
 DE: 'Der Kurs beginnt mit Stress- und Paniktheorie: die physiologische Kaskade, die zu einem Tauchunfall führt, und wie man sie frühzeitig mit Ruhe und Technik unterbrechen kann. Dann im Wasser: Schleppen eines erschöpften Tauchers, Umgang mit einem in Panik geratenen Taucher, Suche nach einem vermissten Taucher und Bergung eines bewusstlosen Tauchers aus der Tiefe. Die abschließende Session ist eine vollständige Rettungssimulation — mehrstufig, realistisch, anspruchsvoll.',
 ES: 'El curso comienza con teoría sobre estrés y pánico: la cascada fisiológica que lleva a un accidente de buceo y cómo interrumpirla a tiempo con calma y técnica. Luego en el agua: remolque de buceador cansado, aproximación a buceador en pánico, búsqueda de buceador desaparecido y recuperación de buceador inconsciente desde profundidad. La sesión final es una simulación de rescate completa — en múltiples pasos, realista y exigente.',
 },
 {
 EN: 'SSI Stress & Rescue includes React Right (first aid and emergency oxygen) as an integrated module, so you don\'t need to complete it separately. This is a required stepping-stone to Dive Guide and Divemaster. Many experienced divers describe a fundamental shift in their diving after this course — more calm, more aware, more decisive.',
 PT: 'O SSI Stress & Rescue inclui o React Right (primeiros socorros e oxigénio de emergência) como módulo integrado, por isso não precisa de o completar separadamente. Este é um degrau obrigatório para o Dive Guide e Divemaster. Muitos mergulhadores experientes descrevem uma mudança fundamental no seu mergulho após este curso — mais calmos, mais conscientes, mais decisivos.',
 DE: 'SSI Stress & Rescue enthält React Right (Erste Hilfe und Notfall-Sauerstoff) als integriertes Modul, sodass du es nicht separat abschließen musst. Dies ist ein erforderlicher Zwischenschritt zu Dive Guide und Divemaster. Viele erfahrene Taucher beschreiben eine grundlegende Veränderung in ihrem Tauchen nach diesem Kurs — ruhiger, bewusster, entschlossener.',
 ES: 'SSI Stress & Rescue incluye React Right (primeros auxilios y oxígeno de emergencia) como módulo integrado, por lo que no necesita completarlo por separado. Este es un escalón obligatorio hacia Dive Guide y Divemaster. Muchos buceadores experimentados describen un cambio fundamental en su buceo después de este curso — más calmados, más conscientes, más decisivos.',
 },
 ],
 highlights: [
 { EN: 'Includes React Right (first aid, CPR, emergency oxygen)', PT: 'Inclui React Right (primeiros socorros, RCP, oxigénio de emergência)', DE: 'Beinhaltet React Right (Erste Hilfe, CPR, Notfall-Sauerstoff)', ES: 'Incluye React Right (primeros auxilios, RCP, oxígeno de emergencia)' },
 { EN: 'Panic recognition + underwater rescue simulations', PT: 'Reconhecimento de pânico + simulações de resgate subaquático', DE: 'Panik-Erkennung + Unterwasserrettungssimulationen', ES: 'Reconocimiento de pánico + simulaciones de rescate subacuático' },
 { EN: 'Required for Dive Guide and Divemaster pathways', PT: 'Obrigatório para as vias Dive Guide e Divemaster', DE: 'Erforderlich für Dive Guide und Divemaster Wege', ES: 'Obligatorio para las vías Dive Guide y Divemaster' },
 { EN: 'Transforms how you dive — for everyone around you', PT: 'Transforma a forma como mergulha — para todos à sua volta', DE: 'Verändert, wie du tauchst — für alle um dich herum', ES: 'Transforma cómo bucea — para todos a su alrededor' },
 ],
 includes: [
 { EN: 'React Right module (first aid, CPR, oxygen)', PT: 'Módulo React Right (primeiros socorros, RCP, oxigénio)', DE: 'React Right Modul (Erste Hilfe, CPR, Sauerstoff)', ES: 'Módulo React Right (primeros auxilios, RCP, oxígeno)' },
 { EN: 'Online theory (MySSI)', PT: 'Teoria online (MySSI)', DE: 'Online-Theorie (MySSI)', ES: 'Teoría online (MySSI)' },
 { EN: 'Pool rescue practice sessions', PT: 'Sessões de prática de resgate em piscina', DE: 'Pool-Rettungsübungssessions', ES: 'Sesiones de práctica de rescate en piscina' },
 { EN: 'Ocean rescue scenario dives', PT: 'Mergulhos de cenário de resgate no oceano', DE: 'Ozean-Rettungsszenario-Tauchgänge', ES: 'Inmersiones de escenario de rescate en el océano' },
 { EN: 'All dive equipment', PT: 'Todo o equipamento de mergulho', DE: 'Gesamte Tauchausrüstung', ES: 'Todo el equipo de buceo' },
 { EN: 'SSI Diver Stress & Rescue certification', PT: 'Certificação SSI Diver Stress & Rescue', DE: 'SSI Diver Stress & Rescue Zertifizierung', ES: 'Certificación SSI Diver Stress & Rescue' },
 { EN: 'Boat & insurance', PT: 'Barco e seguro', DE: 'Boot & Versicherung', ES: 'Barco y seguro' },
 ],
 prereqs: {
 EN: 'SSI Open Water Diver (or equivalent). Minimum age 10.',
 PT: 'SSI Open Water Diver (ou equivalente). Idade mínima 10 anos.',
 DE: 'SSI Open Water Diver (oder gleichwertig). Mindestalter 10 Jahre.',
 ES: 'SSI Open Water Diver (o equivalente). Edad mínima 10 años.',
 },
 duration: { EN: '2 days', PT: '2 dias', DE: '2 Tage', ES: '2 días' },
 dives: { EN: 'Pool + ocean rescue scenarios', PT: 'Piscina + cenários de resgate no oceano', DE: 'Pool + Ozean-Rettungsszenarien', ES: 'Piscina + escenarios de rescate en el océano' },
 depth: { EN: 'Varies by scenario', PT: 'Varia conforme o cenário', DE: 'Je nach Szenario', ES: 'Varía según el escenario' },
 certifies: {
 EN: 'SSI Diver Stress & Rescue (includes React Right)',
 PT: 'SSI Diver Stress & Rescue (inclui React Right)',
 DE: 'SSI Diver Stress & Rescue (beinhaltet React Right)',
 ES: 'SSI Diver Stress & Rescue (incluye React Right)',
 },
 testimonial: { quote: 'The final rescue scenario is intense in the best way. By the end you are pulling an unconscious diver from 6 metres, getting them to the surface and onto the boat in under two minutes. This course made me a better diver and a better person to be underwater with.', author: 'Hannah O., Vienna', source: 'TripAdvisor' },
 },
 'science-diving': {
 id: 'science-diving', name: 'Science of Diving', price: '€250', img: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses/science-diving.webp', accentColor: 'var(--muted)',
 tagline: {
 EN: 'Understand every breath you take.',
 PT: 'Compreenda cada respiração que dá.',
 DE: 'Jeden Atemzug verstehen.',
 ES: 'Entiende cada respiración que tomas.',
 },
 intro: {
 EN: 'Five academic modules covering the physics, physiology, decompression theory and equipment mechanics behind everything you do underwater. Required for the Divemaster pathway — and genuinely fascinating for any diver who wants to understand what\'s actually happening at depth.',
 PT: 'Cinco módulos académicos que cobrem a física, fisiologia, teoria de descompressão e mecânica do equipamento por trás de tudo o que faz debaixo de água. Obrigatório para a via Divemaster — e genuinamente fascinante para qualquer mergulhador que queira compreender o que está realmente a acontecer em profundidade.',
 DE: 'Fünf akademische Module, die Physik, Physiologie, Dekompressionstheorie und Ausrüstungsmechanik hinter allem abdecken, was du unter Wasser tust. Erforderlich für den Divemaster-Weg — und wirklich faszinierend für jeden Taucher, der verstehen möchte, was tatsächlich in der Tiefe passiert.',
 ES: 'Cinco módulos académicos que cubren la física, fisiología, teoría de descompresión y mecánica del equipo detrás de todo lo que hace bajo el agua. Obligatorio para la vía Divemaster — y genuinamente fascinante para cualquier buceador que quiera entender lo que realmente ocurre en profundidad.',
 },
 body: [
 {
 EN: 'Boyle\'s Law, Dalton\'s Law, Henry\'s Law — not just formulas, but the actual reason your ears hurt when you don\'t equalise, why nitrogen narcosis gets worse as you descend, and how your dive computer decides your ascent rate. Physics of light and sound underwater. The physiology of decompression. The fluid dynamics of ocean environments. It\'s a lot — and it makes every future dive richer.',
 PT: 'Lei de Boyle, Lei de Dalton, Lei de Henry — não apenas fórmulas, mas a razão real pela qual os ouvidos doem quando não equaliza, por que a narcose por azoto piora à medida que desce e como o computador de mergulho decide a taxa de subida. Física da luz e do som debaixo de água. A fisiologia da descompressão. A dinâmica de fluidos dos ambientes oceânicos. É muito — e torna cada mergulho futuro mais rico.',
 DE: 'Das Boyle\'sche Gesetz, Daltons Gesetz, Henrys Gesetz — nicht nur Formeln, sondern der eigentliche Grund, warum deine Ohren schmerzen, wenn du keinen Druckausgleich machst, warum Stickstoffnarkose beim Abstieg schlimmer wird und wie dein Tauchcomputer deine Auftauchrate bestimmt. Physik von Licht und Schall unter Wasser. Die Physiologie der Dekompression. Die Fluiddynamik ozeanischer Umgebungen. Es ist viel — und macht jeden zukünftigen Tauchgang reicher.',
 ES: 'La Ley de Boyle, la Ley de Dalton, la Ley de Henry — no solo fórmulas, sino la razón real por la que le duelen los oídos cuando no compensa, por qué la narcosis por nitrógeno empeora al descender y cómo su ordenador de buceo decide su velocidad de ascenso. Física de la luz y el sonido bajo el agua. La fisiología de la descompresión. La dinámica de fluidos de los entornos oceánicos. Es mucho — y enriquece cada inmersión futura.',
 },
 {
 EN: 'Completing this specialty earns you halfway credit toward the SSI Divemaster rating. It\'s a prerequisite for all SSI Professional programs. Many divers take it purely out of curiosity. This is a classroom-only course with no dive component — 8–12 hours of pure theory delivered online and in session.',
 PT: 'Completar esta especialidade dá-lhe crédito de metade para a classificação SSI Divemaster. É um pré-requisito para todos os programas SSI Profissionais. Muitos mergulhadores fazem-na por pura curiosidade. Este é um curso exclusivamente teórico sem componente de mergulho — 8–12 horas de teoria pura ministrada online e em sessão.',
 DE: 'Das Abschließen dieser Spezialität gibt dir Guthaben für die SSI Divemaster Bewertung. Es ist eine Voraussetzung für alle SSI Professional Programme. Viele Taucher belegen es aus reiner Neugier. Dies ist ein reiner Unterrichtskurs ohne Tauchkomponente — 8–12 Stunden reine Theorie, online und in Sitzungen vermittelt.',
 ES: 'Completar esta especialidad le otorga crédito a mitad de camino hacia la calificación SSI Divemaster. Es un requisito previo para todos los programas SSI Professional. Muchos buceadores lo hacen por pura curiosidad. Este es un curso solo de aula sin componente de buceo — 8–12 horas de teoría pura impartida online y en sesión.',
 },
 ],
 highlights: [
 { EN: 'Physics, physiology, decompression + equipment theory', PT: 'Física, fisiologia, descompressão + teoria do equipamento', DE: 'Physik, Physiologie, Dekompression + Ausrüstungstheorie', ES: 'Física, fisiología, descompresión + teoría del equipo' },
 { EN: 'Required prerequisite for Divemaster pathway', PT: 'Pré-requisito obrigatório para a via Divemaster', DE: 'Erforderliche Voraussetzung für den Divemaster-Weg', ES: 'Requisito previo obligatorio para la vía Divemaster' },
 { EN: 'Earns halfway credit toward SSI Divemaster rating', PT: 'Ganha crédito a meio caminho para a classificação SSI Divemaster', DE: 'Verdient halbwegs Guthaben für die SSI Divemaster Bewertung', ES: 'Obtiene crédito a mitad de camino hacia la calificación SSI Divemaster' },
 { EN: 'No dive component — 8–12 hrs classroom/online', PT: 'Sem componente de mergulho — 8–12 h de aula/online', DE: 'Keine Tauchkomponente — 8–12 Std. Unterricht/online', ES: 'Sin componente de buceo — 8–12 h de aula/online' },
 ],
 includes: [
 { EN: 'Online theory access (MySSI)', PT: 'Acesso à teoria online (MySSI)', DE: 'Online-Theoriezugang (MySSI)', ES: 'Acceso a teoría online (MySSI)' },
 { EN: '5 academic sessions', PT: '5 sessões académicas', DE: '5 akademische Sitzungen', ES: '5 sesiones académicas' },
 { EN: 'SSI Science of Diving Specialty certification', PT: 'Certificação SSI Science of Diving Specialty', DE: 'SSI Science of Diving Specialty Zertifizierung', ES: 'Certificación SSI Science of Diving Specialty' },
 ],
 prereqs: {
 EN: 'SSI Open Water Diver (or equivalent). Minimum age 10.',
 PT: 'SSI Open Water Diver (ou equivalente). Idade mínima 10 anos.',
 DE: 'SSI Open Water Diver (oder gleichwertig). Mindestalter 10 Jahre.',
 ES: 'SSI Open Water Diver (o equivalente). Edad mínima 10 años.',
 },
 duration: { EN: '2–3 days (classroom)', PT: '2–3 dias (sala de aula)', DE: '2–3 Tage (Unterricht)', ES: '2–3 días (aula)' },
 dives: { EN: 'No dive component', PT: 'Sem componente de mergulho', DE: 'Keine Tauchkomponente', ES: 'Sin componente de buceo' },
 depth: { EN: '—', PT: '—', DE: '—', ES: '—' },
 certifies: { EN: 'SSI Science of Diving Specialty', PT: 'SSI Science of Diving Specialty', DE: 'SSI Science of Diving Specialty', ES: 'SSI Science of Diving Specialty' },
 testimonial: { quote: 'I took this because it is required for Divemaster. Did not expect to love it. Now I understand why my ears always equalised easier going up than down, why I get a headache after a long day of dives, and how my computer actually thinks. Worth it for any serious diver.', author: 'Paulo A., Lisbon', source: 'Google Reviews' },
 },
 'dive-guide': {
 id: 'dive-guide', name: 'Dive Guide', price: '€680', img: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses/dive-guide.webp', accentColor: 'var(--muted)',
 tagline: {
 EN: 'Time to lead. Your first professional rating.',
 PT: 'Hora de liderar. A sua primeira classificação profissional.',
 DE: 'Zeit zu führen. Deine erste professionelle Bewertung.',
 ES: 'Hora de liderar. Tu primera calificación profesional.',
 },
 intro: {
 EN: 'The SSI Dive Guide is your first professional certification — the credential that lets you guide certified recreational divers and start building a career in diving. It\'s a prerequisite for Divemaster, and the first step on a clear pathway to becoming an SSI Instructor.',
 PT: 'O SSI Dive Guide é a sua primeira certificação profissional — a credencial que lhe permite guiar mergulhadores recreativos certificados e começar a construir uma carreira em mergulho. É um pré-requisito para Divemaster e o primeiro passo num percurso claro para se tornar Instrutor SSI.',
 DE: 'Der SSI Dive Guide ist deine erste Profi-Zertifizierung — die Qualifikation, die dir erlaubt, zertifizierte Freizeittaucher zu führen und eine Karriere im Tauchen aufzubauen. Er ist eine Voraussetzung für Divemaster und der erste Schritt auf einem klaren Weg zum SSI Instruktor.',
 ES: 'El SSI Dive Guide es su primera certificación profesional — la credencial que le permite guiar a buceadores recreativos certificados y comenzar a construir una carrera en buceo. Es un requisito previo para Divemaster, y el primer paso en un camino claro para convertirse en Instructor SSI.',
 },
 body: [
 {
 EN: '35–45 hours of combined training: academic sessions covering dive leadership, site evaluation and emergency management; pool sessions on rescue skills and demonstration techniques; and five ocean training sessions where you plan and lead actual dives. Prerequisites are 40 logged dives totalling 25 hours underwater.',
 PT: '35–45 horas de formação combinada: sessões académicas sobre liderança de mergulho, avaliação de locais e gestão de emergências; sessões em piscina sobre competências de resgate e técnicas de demonstração; e cinco sessões de treino no oceano onde planeia e lidera mergulhos reais. Os pré-requisitos são 40 mergulhos registados num total de 25 horas debaixo de água.',
 DE: '35–45 Stunden kombiniertes Training: akademische Sitzungen über Tauchführung, Standortbewertung und Notfallmanagement; Pool-Sessions über Rettungsfähigkeiten und Demonstrationstechniken; und fünf Ozean-Trainingssessions, bei denen du echte Tauchgänge planst und führst. Voraussetzungen sind 40 protokollierte Tauchgänge mit insgesamt 25 Stunden unter Wasser.',
 ES: '35–45 horas de formación combinada: sesiones académicas sobre liderazgo de buceo, evaluación de sitios y gestión de emergencias; sesiones de piscina sobre habilidades de rescate y técnicas de demostración; y cinco sesiones de entrenamiento en el océano donde planifica y dirige inmersiones reales. Los requisitos previos son 40 inmersiones registradas con un total de 25 horas bajo el agua.',
 },
 {
 EN: 'As a Dive Guide you can professionally lead recreational dives and teach SSI Ecology specialty programs. AZD runs Dive Guide programs as working internships during the summer season — you train and work simultaneously. Talk to us if you\'re planning a career in diving: the Azores summer is an exceptional environment to build your hours and your skills.',
 PT: 'Como Dive Guide pode liderar profissionalmente mergulhos recreativos e ensinar programas de especialidade SSI Ecology. A AZD realiza programas de Dive Guide como estágios de trabalho durante a época de verão — treina e trabalha simultaneamente. Fale connosco se está a planear uma carreira em mergulho: o verão nos Açores é um ambiente excecional para acumular horas e desenvolver competências.',
 DE: 'Als Dive Guide kannst du professionell Freizeittauchgänge führen und SSI Ecology Spezialitätsprogramme unterrichten. AZD führt Dive Guide Programme als Arbeitspraktika während der Sommersaison durch — du trainierst und arbeitest gleichzeitig. Sprich mit uns, wenn du eine Karriere im Tauchen planst: Der Azoren-Sommer ist eine außergewöhnliche Umgebung, um deine Stunden und Fähigkeiten aufzubauen.',
 ES: 'Como Dive Guide puede liderar profesionalmente inmersiones recreativas y enseñar programas de especialidad SSI Ecology. AZD realiza programas de Dive Guide como prácticas laborales durante la temporada de verano — entrena y trabaja simultáneamente. Háblenos si está planeando una carrera en buceo: el verano en las Azores es un entorno excepcional para acumular horas y desarrollar habilidades.',
 },
 ],
 highlights: [
 { EN: 'First professional SSI rating (ISO 24801-3)', PT: 'Primeira classificação profissional SSI (ISO 24801-3)', DE: 'Erste professionelle SSI Bewertung (ISO 24801-3)', ES: 'Primera calificación profesional SSI (ISO 24801-3)' },
 { EN: 'Lead certified recreational divers professionally', PT: 'Liderar profissionalmente mergulhadores recreativos certificados', DE: 'Zertifizierte Freizeittaucher professionell führen', ES: 'Guiar profesionalmente a buceadores recreativos certificados' },
 { EN: 'Prerequisites: 40 dives / 25 hrs underwater', PT: 'Pré-requisitos: 40 mergulhos / 25 h debaixo de água', DE: 'Voraussetzungen: 40 Tauchgänge / 25 Std. unter Wasser', ES: 'Requisitos previos: 40 inmersiones / 25 h bajo el agua' },
 { EN: 'Available as a working AZD summer internship', PT: 'Disponível como estágio de trabalho AZD de verão', DE: 'Als AZD-Sommerpraktikum verfügbar', ES: 'Disponible como prácticas laborales de verano de AZD' },
 ],
 includes: [
 { EN: 'Online theory (MySSI)', PT: 'Teoria online (MySSI)', DE: 'Online-Theorie (MySSI)', ES: 'Teoría online (MySSI)' },
 { EN: '5 academic sessions', PT: '5 sessões académicas', DE: '5 akademische Sitzungen', ES: '5 sesiones académicas' },
 { EN: '4 pool sessions', PT: '4 sessões em piscina', DE: '4 Pool-Sessions', ES: '4 sesiones en piscina' },
 { EN: '5 ocean training sessions (to 40 m)', PT: '5 sessões de treino no oceano (até 40 m)', DE: '5 Ozean-Trainings sessions (bis 40 m)', ES: '5 sesiones de entrenamiento en el océano (hasta 40 m)' },
 { EN: 'All dive equipment', PT: 'Todo o equipamento de mergulho', DE: 'Gesamte Tauchausrüstung', ES: 'Todo el equipo de buceo' },
 { EN: 'SSI Dive Guide certification (ISO 24801-3)', PT: 'Certificação SSI Dive Guide (ISO 24801-3)', DE: 'SSI Dive Guide Zertifizierung (ISO 24801-3)', ES: 'Certificación SSI Dive Guide (ISO 24801-3)' },
 { EN: 'Boat & insurance', PT: 'Barco e seguro', DE: 'Boot & Versicherung', ES: 'Barco y seguro' },
 ],
 prereqs: {
 EN: 'Min. 40 logged dives / 25 hours. OWD + Stress & Rescue certifications.',
 PT: 'Mín. 40 mergulhos registados / 25 horas. Certificações OWD + Stress & Rescue.',
 DE: 'Mind. 40 protokollierte Tauchgänge / 25 Stunden. OWD + Stress & Rescue Zertifizierungen.',
 ES: 'Mín. 40 inmersiones registradas / 25 horas. Certificaciones OWD + Stress & Rescue.',
 },
 duration: { EN: '~1 week (35–45 hrs)', PT: '~1 semana (35–45 h)', DE: '~1 Woche (35–45 Std.)', ES: '~1 semana (35–45 h)' },
 dives: { EN: '5 ocean sessions', PT: '5 sessões no oceano', DE: '5 Ozean-Sessions', ES: '5 sesiones en el océano' },
 depth: { EN: '40 m / 130 ft', PT: '40 m / 130 ft', DE: '40 m / 130 ft', ES: '40 m / 130 ft' },
 certifies: { EN: 'SSI Dive Guide (ISO 24801-3)', PT: 'SSI Dive Guide (ISO 24801-3)', DE: 'SSI Dive Guide (ISO 24801-3)', ES: 'SSI Dive Guide (ISO 24801-3)' },
 testimonial: { quote: 'I spent a summer at AZD doing my Dive Guide as a working internship. Real guests, real dives, real feedback. By the end I was running briefings and leading groups myself. There is no better place in Europe to do this.', author: 'Clara M., Madrid', source: 'Google Reviews' },
 },
 'divemaster': {
 id: 'divemaster', name: 'Divemaster', price: '€950', img: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses/divemaster.webp', accentColor: 'var(--muted)',
 tagline: {
 EN: 'Your career in the ocean starts here.',
 PT: 'A sua carreira no oceano começa aqui.',
 DE: 'Deine Karriere im Ozean beginnt hier.',
 ES: 'Tu carrera en el océano empieza aquí.',
 },
 intro: {
 EN: 'The SSI Divemaster is the highest professional non-instructor rating — and the gateway to instructor training. 60 open water training sessions, ISO 24801-3 certification, and the credential to guide divers, run a dive operation, and teach ecology programs professionally.',
 PT: 'O SSI Divemaster é a classificação profissional não-instrutor mais elevada — e a porta de entrada para a formação de instrutores. 60 sessões de treino em águas abertas, certificação ISO 24801-3 e a credencial para guiar mergulhadores, gerir uma operação de mergulho e ensinar programas de ecologia profissionalmente.',
 DE: 'Der SSI Divemaster ist die höchste professionelle Nicht-Instruktor-Bewertung — und das Tor zur Instruktorausbildung. 60 Freiwasser-Trainings sessions, ISO 24801-3 Zertifizierung und die Qualifikation, Taucher zu führen, einen Tauchbetrieb zu leiten und Ökologieprogramme professionell zu unterrichten.',
 ES: 'El SSI Divemaster es la calificación profesional no instructora más alta — y la puerta de entrada a la formación de instructores. 60 sesiones de entrenamiento en aguas abiertas, certificación ISO 24801-3 y la credencial para guiar buceadores, gestionar una operación de buceo y enseñar programas de ecología profesionalmente.',
 },
 body: [
 {
 EN: 'Prerequisites: 60 logged dives (40 hours), Dive Guide certification, and Science of Diving specialty. The Divemaster program adds 60 more open water sessions and 43–57 hours of professional-level training: leadership, dive operations management, emergency coordination, ecology program delivery, and equipment servicing fundamentals. You graduate with ISO 24801-3 — globally recognised.',
 PT: 'Pré-requisitos: 60 mergulhos registados (40 horas), certificação Dive Guide e especialidade Science of Diving. O programa Divemaster acrescenta mais 60 sessões em águas abertas e 43–57 horas de formação de nível profissional: liderança, gestão de operações de mergulho, coordenação de emergências, entrega de programas de ecologia e fundamentos de manutenção de equipamento. Gradua-se com ISO 24801-3 — reconhecido mundialmente.',
 DE: 'Voraussetzungen: 60 protokollierte Tauchgänge (40 Stunden), Dive Guide Zertifizierung und Science of Diving Spezialität. Das Divemaster-Programm fügt 60 weitere Freiwasser-Sessions und 43–57 Stunden professionelles Training hinzu: Führung, Tauchbetriebsmanagement, Notfallkoordination, Ökologieprogramm-Durchführung und Ausrüstungswartungsgrundlagen. Du schließt mit ISO 24801-3 ab — weltweit anerkannt.',
 ES: 'Requisitos previos: 60 inmersiones registradas (40 horas), certificación Dive Guide y especialidad Science of Diving. El programa Divemaster añade 60 sesiones más en aguas abiertas y 43–57 horas de formación de nivel profesional: liderazgo, gestión de operaciones de buceo, coordinación de emergencias, impartición de programas de ecología y fundamentos de mantenimiento de equipos. Se gradúa con ISO 24801-3 — reconocido mundialmente.',
 },
 {
 EN: 'At AZD, Divemaster training runs as a working internship. You train alongside our instructors during real dive operations, which means your 60 sessions happen on actual boats with actual guests — not in a controlled training pond. If you\'re serious about a professional career in diving, reach out about the next intake. We typically take on 2–4 DM candidates per season.',
 PT: 'Na AZD, a formação de Divemaster decorre como um estágio de trabalho. Treina ao lado dos nossos instrutores durante operações de mergulho reais, o que significa que as suas 60 sessões acontecem em barcos reais com hóspedes reais — não numa piscina de treino controlada. Se está a sério sobre uma carreira profissional em mergulho, contacte-nos sobre o próximo ciclo de admissão. Normalmente aceitamos 2–4 candidatos a DM por temporada.',
 DE: 'Bei AZD läuft die Divemaster-Ausbildung als Arbeitspraktikum. Du trainierst neben unseren Instruktoren während echter Tauchoperationen, was bedeutet, dass deine 60 Sessions auf echten Booten mit echten Gästen stattfinden — nicht in einem kontrollierten Trainingspool. Wenn du es mit einer Profikarriere im Tauchen ernst meinst, melde dich wegen der nächsten Aufnahme bei uns. Wir nehmen typischerweise 2–4 DM-Kandidaten pro Saison auf.',
 ES: 'En AZD, la formación de Divemaster funciona como una práctica laboral. Entrena junto a nuestros instructores durante operaciones de buceo reales, lo que significa que sus 60 sesiones ocurren en barcos reales con huéspedes reales — no en un estanque de entrenamiento controlado. Si está en serio sobre una carrera profesional en buceo, contáctenos sobre la próxima convocatoria. Típicamente aceptamos 2–4 candidatos a DM por temporada.',
 },
 ],
 highlights: [
 { EN: 'ISO 24801-3 professional certification', PT: 'Certificação profissional ISO 24801-3', DE: 'ISO 24801-3 professionelle Zertifizierung', ES: 'Certificación profesional ISO 24801-3' },
 { EN: '60 open water training sessions', PT: '60 sessões de treino em águas abertas', DE: '60 Freiwasser-Trainings sessions', ES: '60 sesiones de entrenamiento en aguas abiertas' },
 { EN: 'Lead dives + teach ecology programs professionally', PT: 'Liderar mergulhos + ensinar programas de ecologia profissionalmente', DE: 'Tauchgänge führen + Ökologieprogramme professionell unterrichten', ES: 'Dirigir inmersiones + enseñar programas de ecología profesionalmente' },
 { EN: 'Gateway to SSI Open Water Instructor training', PT: 'Porta de entrada para a formação de Instrutor SSI Open Water', DE: 'Tor zur SSI Open Water Instruktor Ausbildung', ES: 'Puerta de entrada a la formación de Instructor SSI Open Water' },
 ],
 includes: [
 { EN: 'Online theory (MySSI)', PT: 'Teoria online (MySSI)', DE: 'Online-Theorie (MySSI)', ES: 'Teoría online (MySSI)' },
 { EN: '10 academic sessions', PT: '10 sessões académicas', DE: '10 akademische Sitzungen', ES: '10 sesiones académicas' },
 { EN: '4 pool sessions', PT: '4 sessões em piscina', DE: '4 Pool-Sessions', ES: '4 sesiones en piscina' },
 { EN: '60 open water training sessions', PT: '60 sessões de treino em águas abertas', DE: '60 Freiwasser-Trainings sessions', ES: '60 sesiones de entrenamiento en aguas abiertas' },
 { EN: 'All dive equipment', PT: 'Todo o equipamento de mergulho', DE: 'Gesamte Tauchausrüstung', ES: 'Todo el equipo de buceo' },
 { EN: 'SSI Divemaster certification (ISO 24801-3)', PT: 'Certificação SSI Divemaster (ISO 24801-3)', DE: 'SSI Divemaster Zertifizierung (ISO 24801-3)', ES: 'Certificación SSI Divemaster (ISO 24801-3)' },
 { EN: 'Boat & insurance', PT: 'Barco e seguro', DE: 'Boot & Versicherung', ES: 'Barco y seguro' },
 ],
 prereqs: {
 EN: '60 logged dives / 40 hrs. Dive Guide + Science of Diving. Minimum age 18.',
 PT: '60 mergulhos registados / 40 h. Dive Guide + Science of Diving. Idade mínima 18 anos.',
 DE: '60 protokollierte Tauchgänge / 40 Std. Dive Guide + Science of Diving. Mindestalter 18 Jahre.',
 ES: '60 inmersiones registradas / 40 h. Dive Guide + Science of Diving. Edad mínima 18 años.',
 },
 duration: { EN: '~2 weeks (43–57 hrs)', PT: '~2 semanas (43–57 h)', DE: '~2 Wochen (43–57 Std.)', ES: '~2 semanas (43–57 h)' },
 dives: { EN: '60 open water sessions', PT: '60 sessões em águas abertas', DE: '60 Freiwasser-Sessions', ES: '60 sesiones en aguas abiertas' },
 depth: { EN: '40 m / 130 ft', PT: '40 m / 130 ft', DE: '40 m / 130 ft', ES: '40 m / 130 ft' },
 certifies: { EN: 'SSI Divemaster (ISO 24801-3)', PT: 'SSI Divemaster (ISO 24801-3)', DE: 'SSI Divemaster (ISO 24801-3)', ES: 'SSI Divemaster (ISO 24801-3)' },
 testimonial: { quote: 'Two months in the Azores, 60 training dives, and I left as a Divemaster. The AZD internship model means you are doing real dives from week one. Nothing beats learning by actually doing it every single day.', author: 'Rafael T., São Paulo', source: 'TripAdvisor' },
 },
 'ssi-explorers': {
 id: 'ssi-explorers', name: 'SSI Explorers', price: 'Upon Request', img: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses/ssi-explorers.webp', accentColor: 'var(--accent)',
 noBook: true,
 tagline: {
 EN: 'Aquatic adventures designed for young ocean explorers — from age 6.',
 PT: 'Aventuras aquáticas criadas para jovens exploradores do oceano — a partir dos 6 anos.',
 DE: 'Aquatische Abenteuer für junge Ozeanentdecker — ab 6 Jahren.',
 ES: 'Aventuras acuáticas diseñadas para jóvenes exploradores del océano — desde los 6 años.',
 },
 intro: {
 EN: 'SSI Explorers is the international aquatic adventure program for children. A structured, educational and genuinely fun pathway that introduces young divers to the underwater world through five distinct program directions — each one a different way to experience and connect with the ocean.',
 PT: 'O SSI Explorers é o programa internacional de aventura aquática para crianças. Um percurso estruturado, educativo e genuinamente divertido que apresenta jovens mergulhadores ao mundo subaquático através de cinco direções de programa distintas — cada uma delas uma forma diferente de viver e conectar-se com o oceano.',
 DE: 'SSI Explorers ist das internationale Wasserabenteuer-Programm für Kinder. Ein strukturierter, lehrreicher und wirklich spaßiger Weg, der junge Taucher durch fünf verschiedene Programm-Richtungen in die Unterwasserwelt einführt — jede eine andere Möglichkeit, den Ozean zu erleben und sich mit ihm zu verbinden.',
 ES: 'SSI Explorers es el programa internacional de aventura acuática para niños. Un camino estructurado, educativo y genuinamente divertido que introduce a los jóvenes buceadores al mundo submarino a través de cinco direcciones de programa distintas — cada una una forma diferente de experimentar y conectar con el océano.',
 },
 body: [
 {
 EN: 'The five SSI Explorers directions are: Blue Oceans Explorer (ocean conservation awareness and education), Snorkel Explorer (surface exploration with mask and fins in confined water), Scuba Explorer (first breaths with scuba gear in a pool or confined water environment), Mermaid Explorer (monofin swimming and graceful underwater movement), and Freediving Explorer (breath-hold diving in a relaxed, supportive setting). Each direction earns an official SSI rating and digital C-Card — children can pursue one direction or work towards all five.',
 PT: 'As cinco direções do SSI Explorers são: Blue Oceans Explorer (consciência e educação para a conservação do oceano), Snorkel Explorer (exploração à superfície com máscara e barbatanas em água confinada), Scuba Explorer (primeiras respirações com equipamento de mergulho em piscina ou ambiente de água confinada), Mermaid Explorer (natação com monobarbatana e movimento subaquático gracioso) e Freediving Explorer (mergulho de apneia num ambiente relaxado e de apoio). Cada direção ganha uma classificação oficial SSI e C-Card digital — as crianças podem seguir uma direção ou trabalhar para atingir as cinco.',
 DE: 'Die fünf SSI Explorers Richtungen sind: Blue Oceans Explorer (Bewusstsein und Bildung für Meeresschutz), Snorkel Explorer (Oberflächenerkundung mit Maske und Flossen im Flachwasser), Scuba Explorer (erste Atemzüge mit Tauchausrüstung in einem Pool oder Flachwasserumgebung), Mermaid Explorer (Monoflosse Schwimmen und anmutiges Unterwasserbewegen) und Freediving Explorer (Apnoetauchen in einer entspannten, unterstützenden Umgebung). Jede Richtung verdient eine offizielle SSI-Bewertung und digitale C-Card — Kinder können eine Richtung verfolgen oder alle fünf anstreben.',
 ES: 'Las cinco direcciones de SSI Explorers son: Blue Oceans Explorer (concienciación y educación para la conservación del océano), Snorkel Explorer (exploración en superficie con máscara y aletas en agua confinada), Scuba Explorer (primeras respiraciones con equipo de buceo en piscina o entorno de agua confinada), Mermaid Explorer (natación con monofín y movimiento subacuático elegante) y Freediving Explorer (buceo en apnea en un entorno relajado y de apoyo). Cada dirección obtiene una calificación oficial SSI y C-Card digital — los niños pueden seguir una dirección o trabajar hacia las cinco.',
 },
 {
 EN: 'At Azores Diving we offer the Blue Oceans Explorer direction on request. This programme introduces children to the world\'s five oceans — the ecosystems they sustain, the creatures that depend on them, and the everyday choices every ocean lover can make to protect what lives below. The Azores is the ideal classroom: pristine Atlantic waters, extraordinary marine biodiversity, and a real, living example of why ocean protection matters. Sessions are small, calm and guided throughout by a qualified SSI instructor. Contact us to arrange a session around your family\'s schedule.',
 PT: 'Na Azores Diving oferecemos a direção Blue Oceans Explorer a pedido. Este programa apresenta as crianças aos cinco oceanos do mundo — os ecossistemas que sustentam, as criaturas que deles dependem e as escolhas do dia a dia que cada amante do oceano pode fazer para proteger o que vive no fundo. Os Açores são a sala de aula ideal: águas atlânticas pristinas, biodiversidade marinha extraordinária e um exemplo real e vivo de por que a proteção do oceano é importante. As sessões são pequenas, calmas e guiadas ao longo por um instrutor SSI qualificado. Contacte-nos para organizar uma sessão em torno do horário da sua família.',
 DE: 'Bei Azores Diving bieten wir die Blue Oceans Explorer Richtung auf Anfrage an. Dieses Programm führt Kinder in die fünf Ozeane der Welt ein — die Ökosysteme, die sie erhalten, die Kreaturen, die von ihnen abhängen, und die alltäglichen Entscheidungen, die jeder Ozean-Liebhaber treffen kann, um zu schützen, was in der Tiefe lebt. Die Azoren sind das ideale Klassenzimmer: unberührte Atlantikgewässer, außerordentliche Meeresbiodiversität und ein echtes, lebendiges Beispiel dafür, warum Meeresschutz wichtig ist. Sessions sind klein, ruhig und werden durchgehend von einem qualifizierten SSI-Instruktor geleitet. Kontaktiere uns, um eine Session rund um den Zeitplan deiner Familie zu arrangieren.',
 ES: 'En Azores Diving ofrecemos la dirección Blue Oceans Explorer a pedido. Este programa introduce a los niños a los cinco océanos del mundo — los ecosistemas que sustentan, las criaturas que dependen de ellos y las elecciones cotidianas que cada amante del océano puede hacer para proteger lo que vive en el fondo. Las Azores son el aula ideal: aguas atlánticas prístinas, extraordinaria biodiversidad marina y un ejemplo real y vivo de por qué la protección del océano importa. Las sesiones son pequeñas, tranquilas y guiadas a lo largo por un instructor SSI cualificado. Contáctenos para organizar una sesión alrededor del horario de su familia.',
 },
 ],
 highlights: [
 { EN: 'Five Explorer directions — Blue Oceans, Snorkel, Scuba, Mermaid, Freediving', PT: 'Cinco direções Explorer — Blue Oceans, Snorkel, Scuba, Mermaid, Freediving', DE: 'Fünf Explorer-Richtungen — Blue Oceans, Schnorchel, Scuba, Meerjungfrau, Freediving', ES: 'Cinco direcciones Explorer — Blue Oceans, Snorkel, Scuba, Sirena, Apnea' },
 { EN: 'Blue Oceans Explorer: ocean conservation education for young divers', PT: 'Blue Oceans Explorer: educação para a conservação do oceano para jovens mergulhadores', DE: 'Blue Oceans Explorer: Meeresschutz-Bildung für junge Taucher', ES: 'Blue Oceans Explorer: educación para la conservación del océano para jóvenes buceadores' },
 { EN: 'Open to children from age 6 — no prior diving experience needed', PT: 'Aberto a crianças a partir dos 6 anos — sem experiência de mergulho necessária', DE: 'Für Kinder ab 6 Jahren offen — keine Taucherfahrung erforderlich', ES: 'Abierto a niños desde los 6 años — sin experiencia de buceo necesaria' },
 { EN: 'Official SSI rating and digital C-Card on completion', PT: 'Classificação SSI oficial e C-Card digital na conclusão', DE: 'Offizielle SSI-Bewertung und digitale C-Card bei Abschluss', ES: 'Calificación SSI oficial y C-Card digital al completar' },
 { EN: 'Small-group session with a qualified SSI instructor throughout', PT: 'Sessão em grupo pequeno com instrutor SSI qualificado durante toda a sessão', DE: 'Kleingruppenssession mit qualifiziertem SSI-Instruktor während der gesamten Zeit', ES: 'Sesión en grupo pequeño con instructor SSI cualificado durante toda la sesión' },
 { EN: 'Available on request — we schedule around your family', PT: 'Disponível a pedido — organizamos em função da sua família', DE: 'Auf Anfrage verfügbar — wir planen um deine Familie herum', ES: 'Disponible a pedido — organizamos alrededor de su familia' },
 ],
 includes: [
 { EN: 'SSI Explorers printed learning materials (illustrated for young divers)', PT: 'Materiais de aprendizagem impressos SSI Explorers (ilustrados para jovens mergulhadores)', DE: 'SSI Explorers gedruckte Lernmaterialien (illustriert für junge Taucher)', ES: 'Materiales de aprendizaje impresos SSI Explorers (ilustrados para jóvenes buceadores)' },
 { EN: 'Blue Oceans Explorer programme activities (classroom + water session)', PT: 'Atividades do programa Blue Oceans Explorer (sala de aula + sessão na água)', DE: 'Blue Oceans Explorer Programmaktivitäten (Unterricht + Wassersession)', ES: 'Actividades del programa Blue Oceans Explorer (aula + sesión en el agua)' },
 { EN: 'All equipment sized for young participants', PT: 'Todo o equipamento dimensionado para participantes jovens', DE: 'Gesamte Ausrüstung in der richtigen Größe für junge Teilnehmer', ES: 'Todo el equipo adaptado para participantes jóvenes' },
 { EN: 'SSI Blue Oceans Explorer digital C-Card', PT: 'C-Card digital SSI Blue Oceans Explorer', DE: 'Digitale SSI Blue Oceans Explorer C-Card', ES: 'C-Card digital SSI Blue Oceans Explorer' },
 ],
 prereqs: {
 EN: 'No prior diving experience needed. Minimum age 6. A parent or guardian must be present throughout the session.',
 PT: 'Sem experiência de mergulho necessária. Idade mínima 6 anos. Um pai ou responsável deve estar presente durante toda a sessão.',
 DE: 'Keine Taucherfahrung erforderlich. Mindestalter 6 Jahre. Ein Elternteil oder Erziehungsberechtigter muss während der gesamten Session anwesend sein.',
 ES: 'Sin experiencia de buceo necesaria. Edad mínima 6 años. Un padre o tutor debe estar presente durante toda la sesión.',
 },
 duration: { EN: 'Half day (flexible)', PT: 'Meio dia (flexível)', DE: 'Halber Tag (flexibel)', ES: 'Medio día (flexible)' },
 dives: { EN: 'Pool / confined water', PT: 'Piscina / águas confinadas', DE: 'Pool / Flachwasser', ES: 'Piscina / aguas confinadas' },
 depth: { EN: 'Shallow water', PT: 'Águas rasas', DE: 'Flachwasser', ES: 'Aguas poco profundas' },
 certifies: {
 EN: 'SSI Blue Oceans Explorer Rating',
 PT: 'Classificação SSI Blue Oceans Explorer',
 DE: 'SSI Blue Oceans Explorer Bewertung',
 ES: 'Calificación SSI Blue Oceans Explorer',
 },
 },
 'photo-video': {
 id: 'photo-video', name: 'Photo & Video', price: '€200', img: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses/photo-video.webp', accentColor: 'var(--accent)',
 tagline: {
 EN: 'Bring the ocean home.',
 PT: 'Leve o oceano para casa.',
 DE: 'Den Ozean nach Hause bringen.',
 ES: 'Lleva el océano a casa.',
 },
 intro: {
 EN: 'The SSI Photo & Video specialty teaches you to capture underwater images and footage worth keeping. Camera settings, lighting principles, composition and the practical skills of shooting marine life without disturbing it — everything you need to document your dives.',
 PT: 'A especialidade SSI Photo & Video ensina-o a capturar imagens e filmagens subaquáticas que valem a pena guardar. Definições de câmara, princípios de iluminação, composição e as competências práticas de fotografar vida marinha sem a perturbar — tudo o que precisa para documentar os seus mergulhos.',
 DE: 'Die SSI Photo & Video Spezialität lehrt dich, Unterwasserbilder und -aufnahmen zu machen, die es wert sind, aufgehoben zu werden. Kameraeinstellungen, Beleuchtungsprinzipien, Komposition und die praktischen Fähigkeiten, Meeresleben zu fotografieren, ohne es zu stören — alles, was du zur Dokumentation deiner Tauchgänge brauchst.',
 ES: 'La especialidad SSI Photo & Video le enseña a capturar imágenes y vídeos submarinos que valen la pena guardar. Configuraciones de cámara, principios de iluminación, composición y las habilidades prácticas de fotografiar vida marina sin molestarla — todo lo que necesita para documentar sus inmersiones.',
 },
 body: [
 {
 EN: 'Theory covers underwater optics, white balance, exposure settings and the behaviour of light below the surface. You learn how to approach marine life for shots without fin kicks disturbing the substrate, how to use a strobe or video light effectively, and how to plan a dive around photographic objectives.',
 PT: 'A teoria cobre óptica subaquática, balanço de brancos, definições de exposição e o comportamento da luz abaixo da superfície. Aprende a aproximar-se da vida marinha para fotografias sem que as palmaradas perturbem o substrato, como usar eficazmente um flash ou luz de vídeo e como planear um mergulho em torno de objetivos fotográficos.',
 DE: 'Die Theorie behandelt Unterwasseroptik, Weißabgleich, Belichtungseinstellungen und das Verhalten von Licht unter der Oberfläche. Du lernst, dich Meeresleben für Aufnahmen zu nähern, ohne dass Flossenschläge das Substrat stören, wie man effektiv ein Blitzgerät oder Videolicht verwendet und wie man einen Tauchgang um fotografische Ziele plant.',
 ES: 'La teoría cubre óptica submarina, balance de blancos, configuraciones de exposición y el comportamiento de la luz bajo la superficie. Aprende cómo acercarse a la vida marina para tomas sin que las patadas de aletas disturben el sustrato, cómo usar un flash o luz de vídeo eficazmente y cómo planificar una inmersión en torno a objetivos fotográficos.',
 },
 {
 EN: 'Two specialty dives put it all into practice on São Miguel\'s reefs — plenty of texture, colour and marine life. You shoot, review with your instructor and shoot again. By the end you have a workflow you can apply on every dive for the rest of your life.',
 PT: 'Dois mergulhos de especialidade põem tudo em prática nos recifes de São Miguel — muita textura, cor e vida marinha. Fotografa, revê com o instrutor e fotografa novamente. No final tem um fluxo de trabalho que pode aplicar em cada mergulho pelo resto da vida.',
 DE: 'Zwei Spezialitäts-Tauchgänge setzen alles an den Riffen von São Miguel in die Praxis um — reichlich Textur, Farbe und Meeresleben. Du fotografierst, gehst die Bilder mit deinem Instruktor durch und fotografierst erneut. Am Ende hast du einen Workflow, den du bei jedem Tauchgang für den Rest deines Lebens anwenden kannst.',
 ES: 'Dos inmersiones de especialidad ponen todo en práctica en los arrecifes de São Miguel — mucha textura, color y vida marina. Fotografía, revisa con el instructor y fotografía de nuevo. Al final tiene un flujo de trabajo que puede aplicar en cada inmersión por el resto de su vida.',
 },
 ],
 highlights: [
 { EN: 'Underwater optics, lighting & composition theory', PT: 'Óptica subaquática, iluminação & teoria de composição', DE: 'Unterwasseroptik, Beleuchtung & Kompositionstheorie', ES: 'Óptica submarina, iluminación y teoría de composición' },
 { EN: 'Marine life approach without disturbing the substrate', PT: 'Aproximação à vida marinha sem perturbar o substrato', DE: 'Meereslebenannäherung ohne Substrat zu stören', ES: 'Aproximación a la vida marina sin disturbar el sustrato' },
 { EN: 'Shoot, review and improve on real dives', PT: 'Fotografar, rever e melhorar em mergulhos reais', DE: 'Fotografieren, überprüfen und verbessern auf echten Tauchgängen', ES: 'Fotografía, revisión y mejora en inmersiones reales' },
 { EN: '2 specialty dives with dedicated photo objectives', PT: '2 mergulhos de especialidade com objetivos fotográficos dedicados', DE: '2 Spezialitätstauchgänge mit dedizierten Fotozielen', ES: '2 inmersiones de especialidad con objetivos fotográficos dedicados' },
 ],
 includes: [
 { EN: 'Digital SSI course materials', PT: 'Materiais de curso SSI digitais', DE: 'Digitale SSI-Kursmaterialien', ES: 'Materiales de curso SSI digitales' },
 { EN: '2 ocean dives (equipment incl.)', PT: '2 mergulhos no oceano (equipamento incluído)', DE: '2 Ozean-Tauchgänge (Ausrüstung inklusive)', ES: '2 inmersiones en el océano (equipo incl.)' },
 { EN: 'Boat & insurance', PT: 'Barco e seguro', DE: 'Boot & Versicherung', ES: 'Barco y seguro' },
 { EN: 'SSI Photo & Video Specialty certification', PT: 'Certificação SSI Photo & Video Specialty', DE: 'SSI Photo & Video Specialty Zertifizierung', ES: 'Certificación SSI Photo & Video Specialty' },
 ],
 prereqs: {
 EN: 'SSI Open Water Diver (or equivalent). Minimum age 10. Bring your own camera or ask us about rentals.',
 PT: 'SSI Open Water Diver (ou equivalente). Idade mínima 10 anos. Traga a sua própria câmara ou pergunte-nos sobre alugueres.',
 DE: 'SSI Open Water Diver (oder gleichwertig). Mindestalter 10 Jahre. Bring deine eigene Kamera mit oder frag uns nach Leihkameras.',
 ES: 'SSI Open Water Diver (o equivalente). Edad mínima 10 años. Traiga su propia cámara o pregúntenos sobre alquileres.',
 },
 duration: { EN: '1 day', PT: '1 dia', DE: '1 Tag', ES: '1 día' },
 dives: { EN: '2 ocean dives', PT: '2 mergulhos no oceano', DE: '2 Ozean-Tauchgänge', ES: '2 inmersiones en el océano' },
 depth: { EN: 'Open Water limits (18 m)', PT: 'Limites Open Water (18 m)', DE: 'Open Water Grenzen (18 m)', ES: 'Límites Open Water (18 m)' },
 certifies: { EN: 'SSI Photography & Videography Specialty', PT: 'SSI Photography & Videography Specialty', DE: 'SSI Photography & Videography Specialty', ES: 'SSI Photography & Videography Specialty' },
 },
 'computer-diving': {
 id: 'computer-diving', name: 'Computer Diving', price: '€170', img: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses/computer-diving.webp', accentColor: 'var(--accent)',
 tagline: {
 EN: 'Know what your computer is telling you.',
 PT: 'Saiba o que o seu computador lhe está a dizer.',
 DE: 'Wissen, was dein Computer dir sagt.',
 ES: 'Saber lo que te dice tu ordenador.',
 },
 intro: {
 EN: 'The SSI Computer Diving specialty teaches you to plan, execute and log dives using a personal dive computer — reading no-decompression limits, managing ascent rates, understanding tissue loading and making smarter decisions on every dive.',
 PT: 'A especialidade SSI Computer Diving ensina-o a planear, executar e registar mergulhos usando um computador de mergulho pessoal — lendo limites de não-descompressão, gerindo taxas de subida, compreendendo a carga de tecidos e tomando decisões mais inteligentes em cada mergulho.',
 DE: 'Die SSI Computer Diving Spezialität lehrt dich, Tauchgänge mit einem persönlichen Tauchcomputer zu planen, durchzuführen und zu protokollieren — Nullzeitgrenzen lesen, Auftauchgeschwindigkeiten managen, Gewebesättigung verstehen und bei jedem Tauchgang klügere Entscheidungen treffen.',
 ES: 'La especialidad SSI Computer Diving le enseña a planificar, ejecutar y registrar inmersiones usando un ordenador de buceo personal — leyendo límites de no-descompresión, gestionando velocidades de ascenso, comprendiendo la saturación de tejidos y tomando decisiones más inteligentes en cada inmersión.',
 },
 body: [
 {
 EN: 'Theory covers how dive computers calculate nitrogen loading, what the numbers on the display actually mean, and how to plan multi-dive days safely using computer data rather than tables. You learn to set your computer correctly, interpret dive profiles after the fact, and recognise when the computer is flagging something important.',
 PT: 'A teoria cobre como os computadores de mergulho calculam a carga de azoto, o que os números no ecrã realmente significam e como planear dias de múltiplos mergulhos com segurança usando dados do computador em vez de tabelas. Aprende a configurar corretamente o computador, a interpretar perfis de mergulho após o facto e a reconhecer quando o computador está a sinalizar algo importante.',
 DE: 'Die Theorie behandelt, wie Tauchcomputer die Stickstoffsättigung berechnen, was die Zahlen auf der Anzeige tatsächlich bedeuten und wie man Tage mit mehreren Tauchgängen sicher mit Computerdaten statt Tabellen plant. Du lernst, deinen Computer korrekt einzustellen, Tauchprofile im Nachhinein zu interpretieren und zu erkennen, wenn der Computer etwas Wichtiges markiert.',
 ES: 'La teoría cubre cómo los ordenadores de buceo calculan la carga de nitrógeno, qué significan realmente los números en la pantalla y cómo planificar días de múltiples inmersiones de forma segura usando datos del ordenador en lugar de tablas. Aprende a configurar correctamente su ordenador, interpretar perfiles de inmersión a posteriori y reconocer cuando el ordenador está señalando algo importante.',
 },
 {
 EN: 'Two specialty dives apply the theory in open water — planning the dives, reading the computer throughout and reviewing the profiles together after. If you dive regularly, this specialty pays for itself on the first multi-day trip.',
 PT: 'Dois mergulhos de especialidade aplicam a teoria em águas abertas — planeando os mergulhos, lendo o computador ao longo e revendo os perfis juntos depois. Se mergulha regularmente, esta especialidade paga-se a si mesma na primeira viagem de múltiplos dias.',
 DE: 'Zwei Spezialitäts-Tauchgänge wenden die Theorie im Freiwasser an — die Tauchgänge planen, den Computer durchgehend ablesen und die Profile danach gemeinsam überprüfen. Wenn du regelmäßig tauchst, amortisiert sich diese Spezialität auf der ersten Mehrtagesreise.',
 ES: 'Dos inmersiones de especialidad aplican la teoría en aguas abiertas — planificando las inmersiones, leyendo el ordenador a lo largo y revisando los perfiles juntos después. Si bucea regularmente, esta especialidad se paga sola en el primer viaje de varios días.',
 },
 ],
 highlights: [
 { EN: 'Understand nitrogen loading and NDL limits', PT: 'Compreender a carga de azoto e os limites NDL', DE: 'Stickstoffbeladung und NDL-Grenzen verstehen', ES: 'Entender la carga de nitrógeno y los límites NDL' },
 { EN: 'Plan multi-dive days using computer data', PT: 'Planear dias de múltiplos mergulhos usando dados do computador', DE: 'Mehrtauchgang-Tage mit Computerdaten planen', ES: 'Planificar días de múltiples inmersiones usando datos del ordenador' },
 { EN: 'Ascent rate management and tissue loading', PT: 'Gestão da taxa de subida e carga de tecidos', DE: 'Auftauchgeschwindigkeitsmanagement und Gewebebeladung', ES: 'Gestión de velocidad de ascenso y saturación de tejidos' },
 { EN: '2 ocean dives with full computer integration', PT: '2 mergulhos no oceano com integração total do computador', DE: '2 Ozean-Tauchgänge mit voller Computerintegration', ES: '2 inmersiones en el océano con integración completa del ordenador' },
 ],
 includes: [
 { EN: 'Digital SSI course materials', PT: 'Materiais de curso SSI digitais', DE: 'Digitale SSI-Kursmaterialien', ES: 'Materiales de curso SSI digitales' },
 { EN: '2 ocean dives (equipment incl.)', PT: '2 mergulhos no oceano (equipamento incluído)', DE: '2 Ozean-Tauchgänge (Ausrüstung inklusive)', ES: '2 inmersiones en el océano (equipo incl.)' },
 { EN: 'Boat & insurance', PT: 'Barco e seguro', DE: 'Boot & Versicherung', ES: 'Barco y seguro' },
 { EN: 'SSI Computer Diving Specialty certification', PT: 'Certificação SSI Computer Diving Specialty', DE: 'SSI Computer Diving Specialty Zertifizierung', ES: 'Certificación SSI Computer Diving Specialty' },
 ],
 prereqs: {
 EN: 'SSI Open Water Diver (or equivalent). Minimum age 10.',
 PT: 'SSI Open Water Diver (ou equivalente). Idade mínima 10 anos.',
 DE: 'SSI Open Water Diver (oder gleichwertig). Mindestalter 10 Jahre.',
 ES: 'SSI Open Water Diver (o equivalente). Edad mínima 10 años.',
 },
 duration: { EN: '1 day', PT: '1 dia', DE: '1 Tag', ES: '1 día' },
 dives: { EN: '2 ocean dives', PT: '2 mergulhos no oceano', DE: '2 Ozean-Tauchgänge', ES: '2 inmersiones en el océano' },
 depth: { EN: 'Open Water limits (18 m)', PT: 'Limites Open Water (18 m)', DE: 'Open Water Grenzen (18 m)', ES: 'Límites Open Water (18 m)' },
 certifies: { EN: 'SSI Computer Diving Specialty', PT: 'SSI Computer Diving Specialty', DE: 'SSI Computer Diving Specialty', ES: 'SSI Computer Diving Specialty' },
 },
 'boat-diving': {
 id: 'boat-diving', name: 'Boat Diving', price: '€250', img: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses/boat-diving.webp', accentColor: 'var(--accent)',
 tagline: {
 EN: 'Get the most out of every boat trip.',
 PT: 'Tire o máximo de cada saída de barco.',
 DE: 'Das Beste aus jeder Bootsfahrt herausholen.',
 ES: 'Saca el máximo de cada salida en barco.',
 },
 intro: {
 EN: 'The SSI Boat Diving specialty covers everything from the moment you step aboard to when you dry off at the dock — gear management, entries and exits, surface signals, navigation back to the boat, and the etiquette that makes you a welcome guest on any dive vessel worldwide.',
 PT: 'A especialidade SSI Boat Diving cobre tudo desde o momento em que embarca até quando se seca no cais — gestão do equipamento, entradas e saídas, sinais de superfície, navegação de regresso ao barco e a etiqueta que o torna um hóspede bem-vindo em qualquer embarcação de mergulho no mundo.',
 DE: 'Die SSI Boat Diving Spezialität deckt alles ab, vom Moment, in dem du an Bord steigst, bis du am Dock abtrocknest — Ausrüstungsmanagement, Ein- und Ausstiege, Oberflächensignale, Navigation zurück zum Boot und die Etikette, die dich zu einem willkommenen Gast auf jedem Tauchschiff weltweit macht.',
 ES: 'La especialidad SSI Boat Diving cubre todo desde el momento en que sube a bordo hasta cuando se seca en el muelle — gestión del equipo, entradas y salidas, señales de superficie, navegación de regreso al barco y la etiqueta que le convierte en un huésped bienvenido en cualquier embarcación de buceo del mundo.',
 },
 body: [
 {
 EN: 'Most certified divers have done boat dives, but few have been formally taught the skills that make them smooth. You learn giant stride and backward roll entries, how to manage a descent line, how to locate and return to a boat underwater, how to handle surge at a swim platform, and how to manage your kit efficiently in tight deck space.',
 PT: 'A maioria dos mergulhadores certificados já fez mergulhos de barco, mas poucos foram formalmente ensinados nas competências que os tornam fluidos. Aprende entradas giant stride e backward roll, como gerir uma linha de descida, como localizar e regressar ao barco debaixo de água, como lidar com surge numa plataforma de natação e como gerir o equipamento eficientemente num espaço de convés pequeno.',
 DE: 'Die meisten zertifizierten Taucher haben Boots-Tauchgänge gemacht, aber wenige wurden formal in den Fähigkeiten unterrichtet, die sie reibungslos machen. Du lernst Giant Stride und Backward Roll Einstiege, wie man eine Abstiegsleine managt, wie man ein Boot unter Wasser lokalisiert und zurückkehrt, wie man mit Surge an einer Schwimmplattform umgeht und wie man seine Ausrüstung effizient auf engem Deck-Raum managt.',
 ES: 'La mayoría de los buceadores certificados han hecho inmersiones en barco, pero pocos han sido formalmente enseñados en las habilidades que las hacen fluidas. Aprende entradas giant stride y backward roll, cómo gestionar una línea de descenso, cómo localizar y regresar al barco bajo el agua, cómo manejar el oleaje en una plataforma de natación y cómo gestionar el equipo eficientemente en el reducido espacio de cubierta.',
 },
 {
 EN: 'Two specialty dives are conducted as standard day trips — exactly the format our guests use every day. Nothing artificial, nothing staged. By the end you move around a dive boat with the confidence of someone who has done it a hundred times.',
 PT: 'Dois mergulhos de especialidade são realizados como viagens de dia padrão — exatamente o formato que os nossos hóspedes usam todos os dias. Nada artificial, nada encenado. No final move-se num barco de mergulho com a confiança de alguém que já o fez cem vezes.',
 DE: 'Zwei Spezialitäts-Tauchgänge werden als Standard-Tagesausflüge durchgeführt — genau das Format, das unsere Gäste jeden Tag nutzen. Nichts Künstliches, nichts Inszeniertes. Am Ende bewegst du dich auf einem Tauchboot mit der Sicherheit von jemandem, der es hundertmal gemacht hat.',
 ES: 'Dos inmersiones de especialidad se realizan como excursiones de día estándar — exactamente el formato que nuestros huéspedes usan cada día. Nada artificial, nada ensayado. Al final se mueve por un barco de buceo con la confianza de alguien que lo ha hecho cien veces.',
 },
 ],
 highlights: [
 { EN: 'Entries, exits and surface signal techniques', PT: 'Técnicas de entrada, saída e sinais de superfície', DE: 'Einstiegs-, Ausstiegs- und Oberflächensignaltechniken', ES: 'Técnicas de entrada, salida y señales de superficie' },
 { EN: 'Navigation back to the boat in open water', PT: 'Navegação de regresso ao barco em águas abertas', DE: 'Navigation zurück zum Boot im Freiwasser', ES: 'Navegación de regreso al barco en aguas abiertas' },
 { EN: 'Gear management in limited deck space', PT: 'Gestão do equipamento em espaço de convés limitado', DE: 'Ausrüstungsmanagement auf begrenztem Deck-Raum', ES: 'Gestión del equipo en espacio de cubierta limitado' },
 { EN: 'Etiquette and communication on dive vessels', PT: 'Etiqueta e comunicação em embarcações de mergulho', DE: 'Etikette und Kommunikation auf Tauchschiffen', ES: 'Etiqueta y comunicación en embarcaciones de buceo' },
 ],
 includes: [
 { EN: 'Digital SSI course materials', PT: 'Materiais de curso SSI digitais', DE: 'Digitale SSI-Kursmaterialien', ES: 'Materiales de curso SSI digitales' },
 { EN: '2 ocean dives from boat (equipment incl.)', PT: '2 mergulhos no oceano desde barco (equipamento incluído)', DE: '2 Ozean-Tauchgänge vom Boot (Ausrüstung inklusive)', ES: '2 inmersiones en el océano desde barco (equipo incl.)' },
 { EN: 'Boat & insurance', PT: 'Barco e seguro', DE: 'Boot & Versicherung', ES: 'Barco y seguro' },
 { EN: 'SSI Boat Diving Specialty certification', PT: 'Certificação SSI Boat Diving Specialty', DE: 'SSI Boat Diving Specialty Zertifizierung', ES: 'Certificación SSI Boat Diving Specialty' },
 ],
 prereqs: {
 EN: 'SSI Open Water Diver (or equivalent). Minimum age 10.',
 PT: 'SSI Open Water Diver (ou equivalente). Idade mínima 10 anos.',
 DE: 'SSI Open Water Diver (oder gleichwertig). Mindestalter 10 Jahre.',
 ES: 'SSI Open Water Diver (o equivalente). Edad mínima 10 años.',
 },
 duration: { EN: '1 day', PT: '1 dia', DE: '1 Tag', ES: '1 día' },
 dives: { EN: '2 boat dives', PT: '2 mergulhos de barco', DE: '2 Boots-Tauchgänge', ES: '2 inmersiones en barco' },
 depth: { EN: 'Open Water limits (18 m)', PT: 'Limites Open Water (18 m)', DE: 'Open Water Grenzen (18 m)', ES: 'Límites Open Water (18 m)' },
 certifies: { EN: 'SSI Boat Diving Specialty', PT: 'SSI Boat Diving Specialty', DE: 'SSI Boat Diving Specialty', ES: 'SSI Boat Diving Specialty' },
 },
 'fish-identification': {
 id: 'fish-identification', name: 'Fish Identification', price: '€170', img: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses/fish-identification.webp', accentColor: 'var(--accent)',
 tagline: {
 EN: 'Name what you are looking at.',
 PT: 'Nomeie o que está a ver.',
 DE: 'Benennen, was du siehst.',
 ES: 'Nombra lo que estás viendo.',
 },
 intro: {
 EN: 'The SSI Fish Identification specialty teaches you to recognise, name and understand the fish species you encounter on every dive. Atlantic reef fish, pelagics, rays — you leave knowing who lives here and why it matters.',
 PT: 'A especialidade SSI Fish Identification ensina-o a reconhecer, nomear e compreender as espécies de peixe que encontra em cada mergulho. Peixes de recife atlânticos, pelágicos, raias — sai sabendo quem vive aqui e por que é importante.',
 DE: 'Die SSI Fish Identification Spezialität lehrt dich, die Fischarten zu erkennen, zu benennen und zu verstehen, denen du bei jedem Tauchgang begegnest. Atlantische Rifffische, Pelagische, Rochen — du verlässt uns mit dem Wissen, wer hier lebt und warum es wichtig ist.',
 ES: 'La especialidad SSI Fish Identification le enseña a reconocer, nombrar y comprender las especies de peces que encuentra en cada inmersión. Peces de arrecife atlánticos, pelágicos, rayas — se va sabiendo quién vive aquí y por qué importa.',
 },
 body: [
 {
 EN: 'Theory covers fish taxonomy, the key visual ID markers that distinguish families and species, and the ecological role fish play in reef systems. You learn to identify species by silhouette, colour pattern, fin shape and behaviour — the same approach used by marine biologists and underwater photographers.',
 PT: 'A teoria cobre taxonomia de peixes, os principais marcadores visuais de ID que distinguem famílias e espécies e o papel ecológico que os peixes desempenham nos sistemas de recife. Aprende a identificar espécies por silhueta, padrão de cor, forma da barbatana e comportamento — a mesma abordagem usada por biólogos marinhos e fotógrafos subaquáticos.',
 DE: 'Die Theorie behandelt Fischtaxonomie, die wichtigsten visuellen ID-Merkmale, die Familien und Arten unterscheiden, und die ökologische Rolle, die Fische in Riffsystemen spielen. Du lernst, Arten nach Silhouette, Farbmuster, Flossenform und Verhalten zu identifizieren — denselben Ansatz, den Meeresbiologen und Unterwasserfotografen verwenden.',
 ES: 'La teoría cubre taxonomía de peces, los marcadores de ID visuales clave que distinguen familias y especies, y el papel ecológico que los peces juegan en los sistemas de arrecife. Aprende a identificar especies por silueta, patrón de color, forma de la aleta y comportamiento — el mismo enfoque usado por biólogos marinos y fotógrafos submarinos.',
 },
 {
 EN: 'Certification is theory-based — no water time required by SSI. We offer an optional guided harbour dive where you keep a dive slate log of sightings and review with your instructor afterwards. São Miguel waters are rich — on a good day you can log 20+ species in a single dive.',
 PT: 'A certificação é baseada em teoria — nenhum tempo na água é exigido pela SSI. Oferecemos um mergulho no porto guiado opcional onde mantém um registo em slate de mergulho de avistamentos e revê com o instrutor depois. As águas de São Miguel são ricas — num bom dia pode registar mais de 20 espécies num único mergulho.',
 DE: 'Die Zertifizierung ist theoriebasiert — kein Wasseraufenthalt von SSI erforderlich. Wir bieten einen optionalen geführten Hafentauchgang an, bei dem du ein Sichtungsprotokoll auf der Tauchtafel führst und danach mit deinem Instruktor durchgehst. Die Gewässer von São Miguel sind reich — an einem guten Tag kannst du 20+ Arten in einem einzigen Tauchgang notieren.',
 ES: 'La certificación está basada en teoría — SSI no requiere tiempo en el agua. Ofrecemos una inmersión guiada opcional en el puerto donde mantiene un registro en pizarra de buceo de avistamientos y revisa con el instructor después. Las aguas de São Miguel son ricas — en un buen día puede registrar 20+ especies en una sola inmersión.',
 },
 ],
 highlights: [
 { EN: 'Atlantic reef fish taxonomy and visual ID', PT: 'Taxonomia e ID visual de peixes de recife atlânticos', DE: 'Atlantische Rifffisch-Taxonomie und visuelle ID', ES: 'Taxonomía e ID visual de peces de arrecife atlánticos' },
 { EN: 'Silhouette, colour pattern and fin shape recognition', PT: 'Reconhecimento de silhueta, padrão de cor e forma da barbatana', DE: 'Silhouette, Farbmuster und Flossenformerkennung', ES: 'Reconocimiento de silueta, patrón de color y forma de aleta' },
 { EN: 'Ecological role of fish in reef systems', PT: 'Papel ecológico dos peixes nos sistemas de recife', DE: 'Ökologische Rolle von Fischen in Riffsystemen', ES: 'Papel ecológico de los peces en los sistemas de arrecife' },
 { EN: 'Theory-based — certify entirely online, no water time required', PT: 'Baseado em teoria — certifique-se inteiramente online, sem tempo na água necessário', DE: 'Theoriebasiert — vollständig online zertifizieren, kein Wasseraufenthalt erforderlich', ES: 'Basado en teoría — certifícate completamente online, sin tiempo en el agua requerido' },
 ],
 includes: [
 { EN: 'Digital SSI course materials', PT: 'Materiais de curso SSI digitais', DE: 'Digitale SSI-Kursmaterialien', ES: 'Materiales de curso SSI digitales' },
 { EN: 'Optional guided observation dive (harbour, equipment incl.)', PT: 'Mergulho de observação guiado opcional (porto, equipamento incluído)', DE: 'Optionaler geführter Beobachtungs-Tauchgang (Hafen, Ausrüstung inklusive)', ES: 'Inmersión de observación guiada opcional (puerto, equipo incl.)' },
 { EN: 'ID slate for dives', PT: 'Slate de ID para mergulhos', DE: 'ID-Schiefer für Tauchgänge', ES: 'Pizarra de ID para inmersiones' },
 { EN: 'SSI Fish Identification Specialty certification', PT: 'Certificação SSI Fish Identification Specialty', DE: 'SSI Fish Identification Specialty Zertifizierung', ES: 'Certificación SSI Fish Identification Specialty' },
 ],
 prereqs: {
 EN: 'Open to all — no diving certification required. Minimum age 10.',
 PT: 'Aberto a todos — sem certificação de mergulho necessária. Idade mínima 10 anos.',
 DE: 'Für alle offen — keine Tauschzertifizierung erforderlich. Mindestalter 10 Jahre.',
 ES: 'Abierto a todos — no se requiere certificación de buceo. Edad mínima 10 años.',
 },
 duration: { EN: 'Self-paced online', PT: 'Online ao seu ritmo', DE: 'Online im eigenen Tempo', ES: 'Online a tu ritmo' },
 dives: { EN: 'Theory-based · optional harbour dive', PT: 'Baseado em teoria · mergulho no porto opcional', DE: 'Theoriebasiert · optionaler Hafentauchgang', ES: 'Basado en teoría · inmersión en el puerto opcional' },
 depth: { EN: 'N/A (optional harbour dive: max 18 m)', PT: 'N/A (mergulho no porto opcional: máx. 18 m)', DE: 'N/A (optionaler Hafentauchgang: max. 18 m)', ES: 'N/A (inmersión en el puerto opcional: máx. 18 m)' },
 certifies: { EN: 'SSI Fish Identification Specialty', PT: 'SSI Fish Identification Specialty', DE: 'SSI Fish Identification Specialty', ES: 'SSI Fish Identification Specialty' },
 },
 'coral-identification': {
 id: 'coral-identification', name: 'Coral Identification', price: '€150', img: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses/coral-identification.webp', accentColor: 'var(--accent)',
 tagline: {
 EN: 'Read the reef — understand what you are kneeling on.',
 PT: 'Leia o recife — compreenda no que está ajoelhado.',
 DE: 'Das Riff lesen — verstehen, worauf du kniest.',
 ES: 'Lee el arrecife — entiende sobre qué estás arrodillado.',
 },
 intro: {
 EN: 'The SSI Coral Identification specialty teaches you to identify reef-building organisms — hard corals, soft corals, sponges, gorgonians and other sessile invertebrates — and understand the reef structures they create.',
 PT: 'A especialidade SSI Coral Identification ensina-o a identificar organismos construtores de recife — corais duros, corais moles, esponjas, gorgónias e outros invertebrados sésseis — e a compreender as estruturas de recife que criam.',
 DE: 'Die SSI Coral Identification Spezialität lehrt dich, riffaufbauende Organismen zu identifizieren — Steinkorallen, Weichkorallen, Schwämme, Gorgonien und andere sessile Wirbellose — und die Riffstrukturen zu verstehen, die sie schaffen.',
 ES: 'La especialidad SSI Coral Identification le enseña a identificar organismos constructores de arrecife — corales duros, corales blandos, esponjas, gorgonias y otros invertebrados sésiles — y a comprender las estructuras de arrecife que crean.',
 },
 body: [
 {
 EN: 'Theory covers coral biology, the distinction between hard and soft corals, how reef zones form and why different species dominate different depths and exposure levels. You learn to ID common Atlantic species by structure, texture and growth form, and to recognise signs of bleaching and other stress responses.',
 PT: 'A teoria cobre biologia dos corais, a distinção entre corais duros e moles, como se formam as zonas de recife e por que diferentes espécies dominam diferentes profundidades e níveis de exposição. Aprende a identificar espécies atlânticas comuns por estrutura, textura e forma de crescimento e a reconhecer sinais de branqueamento e outras respostas ao stress.',
 DE: 'Die Theorie behandelt Korallenbiologie, die Unterscheidung zwischen Hart- und Weichkorallen, wie Riffzonen entstehen und warum verschiedene Arten verschiedene Tiefen und Expositionsniveaus dominieren. Du lernst, häufige Atlantikarten nach Struktur, Textur und Wuchsform zu identifizieren und Anzeichen von Bleiche und anderen Stressreaktionen zu erkennen.',
 ES: 'La teoría cubre biología del coral, la distinción entre corales duros y blandos, cómo se forman las zonas de arrecife y por qué diferentes especies dominan diferentes profundidades y niveles de exposición. Aprende a identificar especies atlánticas comunes por estructura, textura y forma de crecimiento, y a reconocer señales de blanqueamiento y otras respuestas al estrés.',
 },
 {
 EN: 'Certification is theory-based — no water time required by SSI. We offer an optional guided harbour dive where you apply identification skills in the field: shallow hard coral areas, soft coral and sponge zones, and the volcanic substrate that makes Azorean reefs unlike anything in the Mediterranean.',
 PT: 'A certificação é baseada em teoria — nenhum tempo na água é exigido pela SSI. Oferecemos um mergulho no porto guiado opcional onde aplica competências de identificação no terreno: áreas de corais duros rasos, zonas de corais moles e esponjas e o substrato vulcânico que torna os recifes açorianos diferentes de tudo no Mediterrâneo.',
 DE: 'Die Zertifizierung ist theoriebasiert — kein Wasseraufenthalt von SSI erforderlich. Wir bieten einen optionalen geführten Hafentauchgang an, bei dem du Identifikationsfähigkeiten im Feld anwendest: flache Steinkorallenbereiche, Weichkorallen- und Schwammzonen und das vulkanische Substrat, das Azoren-Riffe von allem im Mittelmeer unterscheidet.',
 ES: 'La certificación está basada en teoría — SSI no requiere tiempo en el agua. Ofrecemos una inmersión guiada opcional en el puerto donde aplica habilidades de identificación en el campo: áreas de coral duro poco profundas, zonas de coral blando y esponjas, y el sustrato volcánico que hace que los arrecifes de las Azores sean diferentes de cualquier cosa en el Mediterráneo.',
 },
 ],
 highlights: [
 { EN: 'Hard corals, soft corals, sponges and gorgonians', PT: 'Corais duros, corais moles, esponjas e gorgónias', DE: 'Steinkorallen, Weichkorallen, Schwämme und Gorgonien', ES: 'Corales duros, corales blandos, esponjas y gorgonias' },
 { EN: 'Reef zone ecology and depth-related species distribution', PT: 'Ecologia das zonas de recife e distribuição de espécies por profundidade', DE: 'Riffzonen-Ökologie und tiefenbezogene Artenverteilung', ES: 'Ecología de zonas de arrecife y distribución de especies por profundidad' },
 { EN: 'Bleaching and stress response recognition', PT: 'Reconhecimento de branqueamento e resposta ao stress', DE: 'Bleiche- und Stressreaktionserkennung', ES: 'Reconocimiento de blanqueamiento y respuesta al estrés' },
 { EN: 'Theory-based — certify entirely online, no water time required', PT: 'Baseado em teoria — certifique-se inteiramente online, sem tempo na água necessário', DE: 'Theoriebasiert — vollständig online zertifizieren, kein Wasseraufenthalt erforderlich', ES: 'Basado en teoría — certifícate completamente online, sin tiempo en el agua requerido' },
 ],
 includes: [
 { EN: 'Digital SSI course materials', PT: 'Materiais de curso SSI digitais', DE: 'Digitale SSI-Kursmaterialien', ES: 'Materiales de curso SSI digitales' },
 { EN: 'Optional guided observation dive (harbour, equipment incl.)', PT: 'Mergulho de observação guiado opcional (porto, equipamento incluído)', DE: 'Optionaler geführter Beobachtungs-Tauchgang (Hafen, Ausrüstung inklusive)', ES: 'Inmersión de observación guiada opcional (puerto, equipo incl.)' },
 { EN: 'SSI Coral Identification Specialty certification', PT: 'Certificação SSI Coral Identification Specialty', DE: 'SSI Coral Identification Specialty Zertifizierung', ES: 'Certificación SSI Coral Identification Specialty' },
 ],
 prereqs: {
 EN: 'Open to all — no diving certification required. Minimum age 10.',
 PT: 'Aberto a todos — sem certificação de mergulho necessária. Idade mínima 10 anos.',
 DE: 'Für alle offen — keine Tauschzertifizierung erforderlich. Mindestalter 10 Jahre.',
 ES: 'Abierto a todos — no se requiere certificación de buceo. Edad mínima 10 años.',
 },
 duration: { EN: 'Self-paced online', PT: 'Online ao seu ritmo', DE: 'Online im eigenen Tempo', ES: 'Online a tu ritmo' },
 dives: { EN: 'Theory-based · optional harbour dive', PT: 'Baseado em teoria · mergulho no porto opcional', DE: 'Theoriebasiert · optionaler Hafentauchgang', ES: 'Basado en teoría · inmersión en el puerto opcional' },
 depth: { EN: 'N/A (optional harbour dive: max 18 m)', PT: 'N/A (mergulho no porto opcional: máx. 18 m)', DE: 'N/A (optionaler Hafentauchgang: max. 18 m)', ES: 'N/A (inmersión en el puerto opcional: máx. 18 m)' },
 certifies: { EN: 'SSI Coral Identification Specialty', PT: 'SSI Coral Identification Specialty', DE: 'SSI Coral Identification Specialty', ES: 'SSI Coral Identification Specialty' },
 },
 'blue-oceans': {
 id: 'blue-oceans', name: 'Blue Oceans', price: '€150', img: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses/blue-oceans.webp', accentColor: '#b7c4b0',
 tagline: {
 EN: 'Dive with purpose. Protect what you love.',
 PT: 'Mergulhe com propósito. Proteja o que ama.',
 DE: 'Mit Absicht tauchen. Schützen, was du liebst.',
 ES: 'Bucea con propósito. Protege lo que amas.',
 },
 intro: {
 EN: 'SSI Blue Oceans connects your diving to global ocean conservation. You learn about the pressures facing marine ecosystems — plastics, climate change, unsustainable fishing — and come away knowing how to dive, buy and behave sustainably. Every dive from this point counts.',
 PT: 'O SSI Blue Oceans liga o seu mergulho à conservação global do oceano. Aprende sobre as pressões que os ecossistemas marinhos enfrentam — plásticos, alterações climáticas, pesca insustentável — e sai sabendo como mergulhar, comprar e comportar-se de forma sustentável. Cada mergulho a partir deste momento conta.',
 DE: 'SSI Blue Oceans verbindet dein Tauchen mit dem globalen Meeresschutz. Du lernst über die Belastungen mariner Ökosysteme — Kunststoffe, Klimawandel, nicht nachhaltige Fischerei — und gehst mit dem Wissen, wie man nachhaltig taucht, kauft und sich verhält. Jeder Tauchgang von diesem Punkt an zählt.',
 ES: 'SSI Blue Oceans conecta su buceo con la conservación global del océano. Aprende sobre las presiones que enfrentan los ecosistemas marinos — plásticos, cambio climático, pesca insostenible — y se va sabiendo cómo bucear, comprar y comportarse de forma sostenible. Cada inmersión a partir de este punto cuenta.',
 },
 body: [
 {
 EN: 'Theory covers the main threats to marine environments and the science behind them. You explore the role of divers as citizen scientists and ambassadors: how to report data, how to handle marine life responsibly, and how to make a measurable difference with choices both above and below the surface.',
 PT: 'A teoria cobre as principais ameaças aos ambientes marinhos e a ciência por detrás delas. Explora o papel dos mergulhadores como cientistas cidadãos e embaixadores: como reportar dados, como lidar responsavelmente com a vida marinha e como fazer uma diferença mensurável com escolhas acima e abaixo da superfície.',
 DE: 'Die Theorie behandelt die Hauptbedrohungen für Meeresumgebungen und die Wissenschaft dahinter. Du erkundest die Rolle der Taucher als Bürgerwissenschaftler und Botschafter: wie man Daten meldet, wie man verantwortungsvoll mit Meeresleben umgeht und wie man mit Entscheidungen sowohl über als auch unter der Oberfläche einen messbaren Unterschied macht.',
 ES: 'La teoría cubre las principales amenazas para los entornos marinos y la ciencia detrás de ellas. Explora el papel de los buceadores como científicos ciudadanos y embajadores: cómo reportar datos, cómo manejar la vida marina responsablemente y cómo marcar una diferencia medible con decisiones tanto encima como debajo de la superficie.',
 },
 {
 EN: 'A practical conservation dive applies what you learned — reef survey techniques, responsible interaction with marine life, and hands-on engagement with local conservation priorities. The Azores are a marine protected area: this course gives you the context for everything you see out there.',
 PT: 'Um mergulho de conservação prático aplica o que aprendeu — técnicas de levantamento de recife, interação responsável com a vida marinha e envolvimento prático com as prioridades de conservação locais. Os Açores são uma área marinha protegida: este curso dá-lhe o contexto para tudo o que vê lá fora.',
 DE: 'Ein praktischer Erhaltungs-Tauchgang wendet das Gelernte an — Riffsurveytechniken, verantwortungsvoller Umgang mit Meeresleben und praktisches Engagement mit lokalen Erhaltungsprioritäten. Die Azoren sind ein marines Schutzgebiet: Dieser Kurs gibt dir den Kontext für alles, was du dort draußen siehst.',
 ES: 'Una inmersión de conservación práctica aplica lo aprendido — técnicas de levantamiento de arrecife, interacción responsable con la vida marina y participación práctica en las prioridades de conservación locales. Las Azores son un área marina protegida: este curso le da el contexto para todo lo que ve ahí fuera.',
 },
 ],
 highlights: [
 { EN: 'Ocean conservation and sustainability theory', PT: 'Teoria de conservação oceânica e sustentabilidade', DE: 'Meeresschutz- und Nachhaltigkeitstheorie', ES: 'Teoría de conservación oceánica y sostenibilidad' },
 { EN: 'Plastic pollution, climate and fishing pressures', PT: 'Poluição por plásticos, clima e pressões da pesca', DE: 'Kunststoffverschmutzung, Klima und Fischereidruck', ES: 'Contaminación por plásticos, clima y presiones de la pesca' },
 { EN: 'Citizen science data collection techniques', PT: 'Técnicas de recolha de dados de ciência cidadã', DE: 'Bürgerwissenschaft-Datenerhebungstechniken', ES: 'Técnicas de recolección de datos de ciencia ciudadana' },
 { EN: 'Conservation dive with reef survey component', PT: 'Mergulho de conservação com componente de levantamento de recife', DE: 'Erhaltungs-Tauchgang mit Riffsurveey-Komponente', ES: 'Inmersión de conservación con componente de levantamiento de arrecife' },
 ],
 includes: [
 { EN: 'Digital SSI course materials', PT: 'Materiais de curso SSI digitais', DE: 'Digitale SSI-Kursmaterialien', ES: 'Materiales de curso SSI digitales' },
 { EN: '1 conservation dive (equipment incl.)', PT: '1 mergulho de conservação (equipamento incluído)', DE: '1 Erhaltungs-Tauchgang (Ausrüstung inklusive)', ES: '1 inmersión de conservación (equipo incl.)' },
 { EN: 'Boat & insurance', PT: 'Barco e seguro', DE: 'Boot & Versicherung', ES: 'Barco y seguro' },
 { EN: 'SSI Blue Oceans certification', PT: 'Certificação SSI Blue Oceans', DE: 'SSI Blue Oceans Zertifizierung', ES: 'Certificación SSI Blue Oceans' },
 ],
 prereqs: {
 EN: 'SSI Open Water Diver (or equivalent). Minimum age 10.',
 PT: 'SSI Open Water Diver (ou equivalente). Idade mínima 10 anos.',
 DE: 'SSI Open Water Diver (oder gleichwertig). Mindestalter 10 Jahre.',
 ES: 'SSI Open Water Diver (o equivalente). Edad mínima 10 años.',
 },
 duration: { EN: '1 day', PT: '1 dia', DE: '1 Tag', ES: '1 día' },
 dives: { EN: '1 conservation dive', PT: '1 mergulho de conservação', DE: '1 Erhaltungs-Tauchgang', ES: '1 inmersión de conservación' },
 depth: { EN: 'Open Water limits (18 m)', PT: 'Limites Open Water (18 m)', DE: 'Open Water Grenzen (18 m)', ES: 'Límites Open Water (18 m)' },
 certifies: { EN: 'SSI Blue Oceans Specialty', PT: 'SSI Blue Oceans Specialty', DE: 'SSI Blue Oceans Specialty', ES: 'SSI Blue Oceans Specialty' },
 },
 'manta-ray-ecology': {
 id: 'manta-ray-ecology', name: 'Manta & Ray Ecology', price: '€150', img: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses/manta-ray-ecology.webp', accentColor: '#b7c4b0',
 tagline: {
 EN: 'Understand the flyers of the deep.',
 PT: 'Compreenda os voadores das profundezas.',
 DE: 'Die Flieger der Tiefsee verstehen.',
 ES: 'Entiende a los voladores de las profundidades.',
 },
 intro: {
 EN: 'The SSI Manta & Ray Ecology specialty teaches you to identify, observe and protect elasmobranchs — the cartilaginous fish family that includes rays, skates and mantas. The Azores are home to several ray species, and waters around São Miguel offer regular encounters.',
 PT: 'A especialidade SSI Manta & Ray Ecology ensina-o a identificar, observar e proteger elasmobranquios — a família de peixes cartilaginosos que inclui raias, pateiras e mantas. Os Açores são o lar de várias espécies de raias e as águas em redor de São Miguel oferecem encontros regulares.',
 DE: 'Die SSI Manta & Ray Ecology Spezialität lehrt dich, Elasmobranchier zu identifizieren, zu beobachten und zu schützen — die Knorpelfischgruppe, die Rochen, Haie und Mantas umfasst. Die Azoren beherbergen mehrere Rochenarten, und die Gewässer rund um São Miguel bieten regelmäßige Begegnungen.',
 ES: 'La especialidad SSI Manta & Ray Ecology le enseña a identificar, observar y proteger a los elasmobranquios — la familia de peces cartilaginosos que incluye rayas, torpedos y mantas. Las Azores son el hogar de varias especies de rayas, y las aguas alrededor de São Miguel ofrecen encuentros regulares.',
 },
 body: [
 {
 EN: 'Theory covers the biology, taxonomy and behaviour of rays and mantas — ID characteristics, ecological roles, feeding strategies, reproductive biology and conservation status. You learn the responsible observation protocols that keep animals calm and encounters meaningful rather than stressful.',
 PT: 'A teoria cobre a biologia, taxonomia e comportamento de raias e mantas — características de ID, papéis ecológicos, estratégias de alimentação, biologia reprodutiva e estado de conservação. Aprende os protocolos de observação responsável que mantêm os animais calmos e os encontros significativos em vez de stressantes.',
 DE: 'Die Theorie behandelt Biologie, Taxonomie und Verhalten von Rochen und Mantas — ID-Merkmale, ökologische Rollen, Ernährungsstrategien, Fortpflanzungsbiologie und Erhaltungsstatus. Du lernst die verantwortungsvollen Beobachtungsprotokolle, die Tiere ruhig halten und Begegnungen bedeutungsvoll statt stressig machen.',
 ES: 'La teoría cubre la biología, taxonomía y comportamiento de rayas y mantas — características de ID, roles ecológicos, estrategias de alimentación, biología reproductiva y estado de conservación. Aprende los protocolos de observación responsable que mantienen a los animales tranquilos y los encuentros significativos en lugar de estresantes.',
 },
 {
 EN: 'Certification is theory-based — no water time required by SSI. We offer an optional guided harbour dive where you apply ID techniques in the water, log observations and contribute sightings to regional marine research. The Azores are one of the few places in Europe where ray encounters happen on standard reef dives — book the optional dive at the centre.',
 PT: 'A certificação é baseada em teoria — nenhum tempo na água é exigido pela SSI. Oferecemos um mergulho no porto guiado opcional onde aplica técnicas de ID na água, regista observações e contribui com avistamentos para investigação marinha regional. Os Açores são um dos poucos lugares na Europa onde os encontros com raias acontecem em mergulhos de recife normais — reserve o mergulho opcional no centro.',
 DE: 'Die Zertifizierung ist theoriebasiert — kein Wasseraufenthalt von SSI erforderlich. Wir bieten einen optionalen geführten Hafentauchgang an, bei dem du ID-Techniken im Wasser anwendest, Beobachtungen protokollierst und Sichtungen zur regionalen Meeresforschung beiträgst. Die Azoren sind einer der wenigen Orte in Europa, wo Rochenbegegnungen bei normalen Riff-Tauchgängen stattfinden — den optionalen Tauchgang buchst du direkt bei uns an der Basis.',
 ES: 'La certificación está basada en teoría — SSI no requiere tiempo en el agua. Ofrecemos una inmersión guiada opcional en el puerto donde aplica técnicas de ID en el agua, registra observaciones y contribuye avistamientos a la investigación marina regional. Las Azores son uno de los pocos lugares en Europa donde los avistamientos de rayas ocurren en inmersiones de arrecife normales — reservar la inmersión opcional en el centro.',
 },
 ],
 highlights: [
 { EN: 'Ray and manta ID for local Atlantic species', PT: 'ID de raias e mantas para espécies atlânticas locais', DE: 'Rochen- und Manta-ID für lokale Atlantikarten', ES: 'ID de rayas y mantas para especies atlánticas locales' },
 { EN: 'Behaviour, feeding and reproductive biology', PT: 'Comportamento, alimentação e biologia reprodutiva', DE: 'Verhalten, Ernährung und Fortpflanzungsbiologie', ES: 'Comportamiento, alimentación y biología reproductiva' },
 { EN: 'Responsible observation and interaction protocols', PT: 'Protocolos de observação e interação responsável', DE: 'Verantwortungsvolle Beobachtungs- und Interaktionsprotokolle', ES: 'Protocolos de observación e interacción responsable' },
 { EN: 'Theory-based — certify entirely online, no water time required', PT: 'Baseado em teoria — certifique-se inteiramente online, sem tempo na água necessário', DE: 'Theoriebasiert — vollständig online zertifizieren, kein Wasseraufenthalt erforderlich', ES: 'Basado en teoría — certifícate completamente online, sin tiempo en el agua requerido' },
 ],
 includes: [
 { EN: 'Digital SSI course materials', PT: 'Materiais de curso SSI digitais', DE: 'Digitale SSI-Kursmaterialien', ES: 'Materiales de curso SSI digitales' },
 { EN: 'Optional guided observation dive (harbour, equipment incl.)', PT: 'Mergulho de observação guiado opcional (porto, equipamento incluído)', DE: 'Optionaler geführter Beobachtungs-Tauchgang (Hafen, Ausrüstung inklusive)', ES: 'Inmersión de observación guiada opcional (puerto, equipo incl.)' },
 { EN: 'SSI Manta & Ray Ecology Specialty certification', PT: 'Certificação SSI Manta & Ray Ecology Specialty', DE: 'SSI Manta & Ray Ecology Specialty Zertifizierung', ES: 'Certificación SSI Manta & Ray Ecology Specialty' },
 ],
 prereqs: {
 EN: 'Open to all — no diving certification required. Minimum age 10.',
 PT: 'Aberto a todos — sem certificação de mergulho necessária. Idade mínima 10 anos.',
 DE: 'Für alle offen — keine Tauschzertifizierung erforderlich. Mindestalter 10 Jahre.',
 ES: 'Abierto a todos — no se requiere certificación de buceo. Edad mínima 10 años.',
 },
 duration: { EN: 'Self-paced online', PT: 'Online ao seu ritmo', DE: 'Online im eigenen Tempo', ES: 'Online a tu ritmo' },
 dives: { EN: 'Theory-based · optional harbour dive', PT: 'Baseado em teoria · mergulho no porto opcional', DE: 'Theoriebasiert · optionaler Hafentauchgang', ES: 'Basado en teoría · inmersión en el puerto opcional' },
 depth: { EN: 'N/A (optional harbour dive: max 18 m)', PT: 'N/A (mergulho no porto opcional: máx. 18 m)', DE: 'N/A (optionaler Hafentauchgang: max. 18 m)', ES: 'N/A (inmersión en el puerto opcional: máx. 18 m)' },
 certifies: { EN: 'SSI Manta & Ray Ecology Specialty', PT: 'SSI Manta & Ray Ecology Specialty', DE: 'SSI Manta & Ray Ecology Specialty', ES: 'SSI Manta & Ray Ecology Specialty' },
 },
 'marine-invertebrate-ecology': {
 id: 'marine-invertebrate-ecology', name: 'Marine Invertebrate Ecology', price: '€150', img: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses/marine-invertebrate-ecology.webp', accentColor: '#b7c4b0',
 tagline: {
 EN: 'Life without a spine — and a lot of personality.',
 PT: 'Vida sem coluna — e muita personalidade.',
 DE: 'Leben ohne Wirbelsäule — und viel Persönlichkeit.',
 ES: 'Vida sin columna — y mucha personalidad.',
 },
 intro: {
 EN: 'The SSI Marine Invertebrate Ecology specialty introduces you to the most abundant, diverse and visually spectacular group of animals in the ocean. Echinoderms, mollusks, crustaceans, cnidarians — once you start looking, you cannot stop.',
 PT: 'A especialidade SSI Marine Invertebrate Ecology apresenta-o ao grupo de animais mais abundante, diverso e visualmente espetacular do oceano. Equinodermes, moluscos, crustáceos, cnidários — uma vez que começa a olhar, não consegue parar.',
 DE: 'Die SSI Marine Invertebrate Ecology Spezialität führt dich in die häufigste, vielfältigste und visuell spektakulärste Tiergruppe im Ozean ein. Stachelhäuter, Weichtiere, Krebstiere, Nesseltiere — einmal angefangen zu schauen, hörst du nicht mehr auf.',
 ES: 'La especialidad SSI Marine Invertebrate Ecology le introduce al grupo de animales más abundante, diverso y visualmente espectacular del océano. Equinodermos, moluscos, crustáceos, cnidarios — una vez que empiezas a mirar, no puedes parar.',
 },
 body: [
 {
 EN: 'Theory covers the major invertebrate phyla: body plans, feeding strategies, reproduction, and the ecological functions each group performs on the reef. You learn to ID key families and species found in Atlantic waters — from sea urchins and starfish to arrow crabs and octopus — and understand what their presence or absence tells you about reef health.',
 PT: 'A teoria cobre os principais filos de invertebrados: planos corporais, estratégias de alimentação, reprodução e as funções ecológicas que cada grupo desempenha no recife. Aprende a identificar as principais famílias e espécies encontradas nas águas atlânticas — de ouriços-do-mar e estrelas-do-mar a caranguejos-flecha e polvos — e a compreender o que a sua presença ou ausência lhe diz sobre a saúde do recife.',
 DE: 'Die Theorie behandelt die wichtigsten Invertebratenstämme: Körperpläne, Ernährungsstrategien, Fortpflanzung und die ökologischen Funktionen, die jede Gruppe am Riff erfüllt. Du lernst, Schlüsselfamilien und Arten in atlantischen Gewässern zu identifizieren — von Seeigeln und Seesternen bis zu Pfeilkrabben und Oktopussen — und zu verstehen, was ihre Anwesenheit oder Abwesenheit über die Riffgesundheit aussagt.',
 ES: 'La teoría cubre los principales filos de invertebrados: planes corporales, estrategias de alimentación, reproducción y las funciones ecológicas que cada grupo realiza en el arrecife. Aprende a identificar familias y especies clave encontradas en aguas atlánticas — desde erizos de mar y estrellas de mar hasta cangrejos flecha y pulpos — y a entender lo que su presencia o ausencia le dice sobre la salud del arrecife.',
 },
 {
 EN: 'Certification is theory-based — no water time required by SSI. We offer an optional guided harbour dive with invertebrates as the primary focus. Your instructor shows you where to look — under ledges, in rubble, along the sand edge — and guides your ID technique in real conditions. It permanently changes how you see a reef.',
 PT: 'A certificação é baseada em teoria — nenhum tempo na água é exigido pela SSI. Oferecemos um mergulho no porto guiado opcional com os invertebrados como foco principal. O instrutor mostra-lhe onde olhar — debaixo de saliências, nos escombros, ao longo da borda de areia — e guia a sua técnica de ID em condições reais. Muda permanentemente a forma como vê um recife.',
 DE: 'Die Zertifizierung ist theoriebasiert — kein Wasseraufenthalt von SSI erforderlich. Wir bieten einen optionalen geführten Hafentauchgang an, bei dem Wirbellose im Mittelpunkt stehen. Dein Instruktor zeigt dir, wo du suchen musst — unter Vorsprüngen, im Geröll, entlang der Sandkante — und begleitet deine ID-Technik unter realen Bedingungen. Es verändert dauerhaft, wie du ein Riff siehst.',
 ES: 'La certificación está basada en teoría — SSI no requiere tiempo en el agua. Ofrecemos una inmersión guiada opcional en el puerto con los invertebrados como foco principal. Su instructor le muestra dónde buscar — bajo salientes, en escombros, a lo largo del borde de arena — y guía su técnica de ID en condiciones reales. Cambia permanentemente cómo ve un arrecife.',
 },
 ],
 highlights: [
 { EN: 'Echinoderms, mollusks, crustaceans and cnidarians', PT: 'Equinodermes, moluscos, crustáceos e cnidários', DE: 'Stachelhäuter, Weichtiere, Krebstiere und Nesseltiere', ES: 'Equinodermos, moluscos, crustáceos y cnidarios' },
 { EN: 'Feeding strategies and ecological function', PT: 'Estratégias de alimentação e função ecológica', DE: 'Ernährungsstrategien und ökologische Funktion', ES: 'Estrategias de alimentación y función ecológica' },
 { EN: 'Species ID in Atlantic reef and sand habitat', PT: 'ID de espécies em habitat de recife e areia atlânticos', DE: 'Arten-ID in atlantischem Riff- und Sandhabitat', ES: 'ID de especies en hábitat de arrecife y arena atlánticos' },
 { EN: 'Theory-based — certify entirely online, no water time required', PT: 'Baseado em teoria — certifique-se inteiramente online, sem tempo na água necessário', DE: 'Theoriebasiert — vollständig online zertifizieren, kein Wasseraufenthalt erforderlich', ES: 'Basado en teoría — certifícate completamente online, sin tiempo en el agua requerido' },
 ],
 includes: [
 { EN: 'Digital SSI course materials', PT: 'Materiais de curso SSI digitais', DE: 'Digitale SSI-Kursmaterialien', ES: 'Materiales de curso SSI digitales' },
 { EN: 'Optional guided observation dive (harbour, equipment incl.)', PT: 'Mergulho de observação guiado opcional (porto, equipamento incluído)', DE: 'Optionaler geführter Beobachtungs-Tauchgang (Hafen, Ausrüstung inklusive)', ES: 'Inmersión de observación guiada opcional (puerto, equipo incl.)' },
 { EN: 'SSI Marine Invertebrate Ecology Specialty certification', PT: 'Certificação SSI Marine Invertebrate Ecology Specialty', DE: 'SSI Marine Invertebrate Ecology Specialty Zertifizierung', ES: 'Certificación SSI Marine Invertebrate Ecology Specialty' },
 ],
 prereqs: {
 EN: 'Open to all — no diving certification required. Minimum age 10.',
 PT: 'Aberto a todos — sem certificação de mergulho necessária. Idade mínima 10 anos.',
 DE: 'Für alle offen — keine Tauschzertifizierung erforderlich. Mindestalter 10 Jahre.',
 ES: 'Abierto a todos — no se requiere certificación de buceo. Edad mínima 10 años.',
 },
 duration: { EN: 'Self-paced online', PT: 'Online ao seu ritmo', DE: 'Online im eigenen Tempo', ES: 'Online a tu ritmo' },
 dives: { EN: 'Theory-based · optional harbour dive', PT: 'Baseado em teoria · mergulho no porto opcional', DE: 'Theoriebasiert · optionaler Hafentauchgang', ES: 'Basado en teoría · inmersión en el puerto opcional' },
 depth: { EN: 'N/A (optional harbour dive: max 18 m)', PT: 'N/A (mergulho no porto opcional: máx. 18 m)', DE: 'N/A (optionaler Hafentauchgang: max. 18 m)', ES: 'N/A (inmersión en el puerto opcional: máx. 18 m)' },
 certifies: { EN: 'SSI Marine Invertebrate Ecology Specialty', PT: 'SSI Marine Invertebrate Ecology Specialty', DE: 'SSI Marine Invertebrate Ecology Specialty', ES: 'SSI Marine Invertebrate Ecology Specialty' },
 },
 'marine-mammal-ecology': {
 id: 'marine-mammal-ecology', name: 'Marine Mammal Ecology', price: '€150', img: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses/marine-mammal-ecology.webp', accentColor: '#b7c4b0',
 tagline: {
 EN: 'The Azores is one of the best places on Earth to study them.',
 PT: 'Os Açores são um dos melhores lugares do mundo para os estudar.',
 DE: 'Die Azoren sind einer der besten Orte der Welt, um sie zu studieren.',
 ES: 'Las Azores es uno de los mejores lugares de la Tierra para estudiarlos.',
 },
 intro: {
 EN: 'The SSI Marine Mammal Ecology specialty covers the biology, behaviour and conservation of cetaceans — whales, dolphins and porpoises. The Azores sees 28 species of cetacean, more than almost anywhere else in the world, making this course directly and immediately relevant.',
 PT: 'A especialidade SSI Marine Mammal Ecology cobre a biologia, comportamento e conservação dos cetáceos — baleias, golfinhos e botos. Os Açores avistam 28 espécies de cetáceos, mais do que quase qualquer outro lugar no mundo, tornando este curso direta e imediatamente relevante.',
 DE: 'Die SSI Marine Mammal Ecology Spezialität behandelt Biologie, Verhalten und Schutz der Cetaceen — Wale, Delfine und Tümmler. Auf den Azoren werden 28 Cetaceen-Arten gesichtet, mehr als fast überall sonst auf der Welt, was diesen Kurs direkt und unmittelbar relevant macht.',
 ES: 'La especialidad SSI Marine Mammal Ecology cubre la biología, comportamiento y conservación de los cetáceos — ballenas, delfines y marsopas. Las Azores avistan 28 especies de cetáceos, más que casi cualquier otro lugar del mundo, haciendo este curso directa e inmediatamente relevante.',
 },
 body: [
 {
 EN: 'Theory covers cetacean taxonomy, physiology, dive behaviour, social structures and communication — including why the Azores sits on one of the great migration corridors of the North Atlantic. You learn responsible encounter guidelines, surface and underwater observation protocols, and how sightings data contributes to long-term population studies.',
 PT: 'A teoria cobre taxonomia de cetáceos, fisiologia, comportamento de mergulho, estruturas sociais e comunicação — incluindo por que os Açores ficam num dos grandes corredores de migração do Atlântico Norte. Aprende diretrizes de encontro responsável, protocolos de observação na superfície e debaixo de água e como os dados de avistamentos contribuem para estudos de população a longo prazo.',
 DE: 'Die Theorie behandelt Cetaceen-Taxonomie, Physiologie, Tauchverhalten, Sozialstrukturen und Kommunikation — einschließlich warum die Azoren auf einem der großen Migrationskorridore des Nordatlantiks liegen. Du lernst verantwortungsvolle Begegnungsrichtlinien, Oberflächen- und Unterwasserbeobachtungsprotokolle und wie Sichtungsdaten zu langfristigen Populationsstudien beitragen.',
 ES: 'La teoría cubre taxonomía de cetáceos, fisiología, comportamiento de buceo, estructuras sociales y comunicación — incluyendo por qué las Azores se sitúa en uno de los grandes corredores de migración del Atlántico Norte. Aprende pautas de encuentro responsable, protocolos de observación en superficie y bajo el agua, y cómo los datos de avistamientos contribuyen a estudios de población a largo plazo.',
 },
 {
 EN: 'Certification is theory-based — no water time required by SSI. The course provides direct context for every whale-watching encounter you have in the Azores: everything the boat captains know, explained from a marine biology perspective. We offer an optional guided harbour dive where you apply underwater observation techniques in practice.',
 PT: 'A certificação é baseada em teoria — nenhum tempo na água é exigido pela SSI. O curso fornece contexto direto para cada encontro de observação de baleias que tiver nos Açores: tudo o que os capitães dos barcos sabem, explicado de uma perspetiva de biologia marinha. Oferecemos um mergulho no porto guiado opcional onde aplica técnicas de observação subaquática na prática.',
 DE: 'Die Zertifizierung ist theoriebasiert — kein Wasseraufenthalt von SSI erforderlich. Der Kurs bietet direkten Kontext für jede Walbeobachtungsbegegnung auf den Azoren: alles, was die Bootskapitäne wissen, aus einer Meeresbiologieperspektive erklärt. Wir bieten einen optionalen geführten Hafentauchgang an, bei dem du Unterwasserbeobachtungstechniken in der Praxis anwendest.',
 ES: 'La certificación está basada en teoría — SSI no requiere tiempo en el agua. El curso proporciona contexto directo para cada encuentro de avistamiento de ballenas en las Azores: todo lo que saben los capitanes de barco, explicado desde una perspectiva de biología marina. Ofrecemos una inmersión guiada opcional en el puerto donde aplica técnicas de observación subacuática en la práctica.',
 },
 ],
 highlights: [
 { EN: 'Cetacean taxonomy, physiology and dive behaviour', PT: 'Taxonomia, fisiologia e comportamento de mergulho dos cetáceos', DE: 'Cetaceen-Taxonomie, Physiologie und Tauchverhalten', ES: 'Taxonomía, fisiología y comportamiento de buceo de cetáceos' },
 { EN: 'Why the Azores sees 28 species of whale and dolphin', PT: 'Por que os Açores avistam 28 espécies de baleias e golfinhos', DE: 'Warum die Azoren 28 Wal- und Delfin-Arten sehen', ES: 'Por qué las Azores avistan 28 especies de ballenas y delfines' },
 { EN: 'Responsible encounter guidelines above and below', PT: 'Diretrizes de encontro responsável acima e abaixo da superfície', DE: 'Verantwortungsvolle Begegnungsrichtlinien über und unter der Oberfläche', ES: 'Pautas de encuentro responsable por encima y por debajo de la superficie' },
 { EN: 'Theory-based — certify entirely online, no water time required', PT: 'Baseado em teoria — certifique-se inteiramente online, sem tempo na água necessário', DE: 'Theoriebasiert — vollständig online zertifizieren, kein Wasseraufenthalt erforderlich', ES: 'Basado en teoría — certifícate completamente online, sin tiempo en el agua requerido' },
 ],
 includes: [
 { EN: 'Digital SSI course materials', PT: 'Materiais de curso SSI digitais', DE: 'Digitale SSI-Kursmaterialien', ES: 'Materiales de curso SSI digitales' },
 { EN: 'Optional guided observation dive (harbour, equipment incl.)', PT: 'Mergulho de observação guiado opcional (porto, equipamento incluído)', DE: 'Optionaler geführter Beobachtungs-Tauchgang (Hafen, Ausrüstung inklusive)', ES: 'Inmersión de observación guiada opcional (puerto, equipo incl.)' },
 { EN: 'SSI Marine Mammal Ecology Specialty certification', PT: 'Certificação SSI Marine Mammal Ecology Specialty', DE: 'SSI Marine Mammal Ecology Specialty Zertifizierung', ES: 'Certificación SSI Marine Mammal Ecology Specialty' },
 ],
 prereqs: {
 EN: 'Open to all — no diving certification required. Minimum age 10.',
 PT: 'Aberto a todos — sem certificação de mergulho necessária. Idade mínima 10 anos.',
 DE: 'Für alle offen — keine Tauschzertifizierung erforderlich. Mindestalter 10 Jahre.',
 ES: 'Abierto a todos — no se requiere certificación de buceo. Edad mínima 10 años.',
 },
 duration: { EN: 'Self-paced online', PT: 'Online ao seu ritmo', DE: 'Online im eigenen Tempo', ES: 'Online a tu ritmo' },
 dives: { EN: 'Theory-based · optional harbour dive', PT: 'Baseado em teoria · mergulho no porto opcional', DE: 'Theoriebasiert · optionaler Hafentauchgang', ES: 'Basado en teoría · inmersión en el puerto opcional' },
 depth: { EN: 'N/A (optional harbour dive: max 18 m)', PT: 'N/A (mergulho no porto opcional: máx. 18 m)', DE: 'N/A (optionaler Hafentauchgang: max. 18 m)', ES: 'N/A (inmersión en el puerto opcional: máx. 18 m)' },
 certifies: { EN: 'SSI Marine Mammal Ecology Specialty', PT: 'SSI Marine Mammal Ecology Specialty', DE: 'SSI Marine Mammal Ecology Specialty', ES: 'SSI Marine Mammal Ecology Specialty' },
 },
 'nudibranch-ecology': {
 id: 'nudibranch-ecology', name: 'Nudibranch Ecology', price: '€150', img: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses/nudibranch-ecology.webp', accentColor: '#b7c4b0',
 tagline: {
 EN: 'The most colourful animals in the ocean — and the hardest to find.',
 PT: 'Os animais mais coloridos do oceano — e os mais difíceis de encontrar.',
 DE: 'Die farbenprächtigsten Tiere im Ozean — und die am schwersten zu findenden.',
 ES: 'Los animales más coloridos del océano — y los más difíciles de encontrar.',
 },
 intro: {
 EN: 'The SSI Nudibranch Ecology specialty teaches you to find, identify and understand nudibranchs — shell-less mollusks famous for their extraordinary colour patterns and chemical defences. Once you develop the search image, you will find them on every single dive.',
 PT: 'A especialidade SSI Nudibranch Ecology ensina-o a encontrar, identificar e compreender os nudibrânquios — moluscos sem concha famosos pelos seus extraordinários padrões de cor e defesas químicas. Uma vez desenvolvida a imagem de busca, vai encontrá-los em absolutamente todos os mergulhos.',
 DE: 'Die SSI Nudibranch Ecology Spezialität lehrt dich, Nacktschnecken zu finden, zu identifizieren und zu verstehen — schalenlose Weichtiere, bekannt für ihre außergewöhnlichen Farbmuster und chemischen Abwehrmechanismen. Sobald du das Suchbild entwickelt hast, wirst du sie bei jedem einzigen Tauchgang finden.',
 ES: 'La especialidad SSI Nudibranch Ecology le enseña a encontrar, identificar y entender los nudibranquios — moluscos sin concha famosos por sus extraordinarios patrones de color y defensas químicas. Una vez que desarrolla la imagen de búsqueda, los encontrará en absolutamente cada inmersión.',
 },
 body: [
 {
 EN: 'Theory covers nudibranch taxonomy, the biology behind their colour patterns — warning colouration, mimicry and camouflage — feeding strategies, and the predator-prey relationships that drive their evolution. You learn the families and morphological features that let you classify an unknown species even without a reference book.',
 PT: 'A teoria cobre taxonomia de nudibrânquios, a biologia por trás dos seus padrões de cor — coloração de aviso, mimetismo e camuflagem — estratégias de alimentação e as relações predador-presa que impulsionam a sua evolução. Aprende as famílias e características morfológicas que lhe permitem classificar uma espécie desconhecida mesmo sem um livro de referência.',
 DE: 'Die Theorie behandelt Nacktschnecken-Taxonomie, die Biologie hinter ihren Farbmustern — Warnfärbung, Mimikry und Tarnung — Ernährungsstrategien und die Räuber-Beute-Beziehungen, die ihre Evolution antreiben. Du lernst die Familien und morphologischen Merkmale, die dir ermöglichen, eine unbekannte Art auch ohne Referenzbuch zu klassifizieren.',
 ES: 'La teoría cubre taxonomía de nudibranquios, la biología detrás de sus patrones de color — coloración de advertencia, mimetismo y camuflaje — estrategias de alimentación y las relaciones depredador-presa que impulsan su evolución. Aprende las familias y características morfológicas que le permiten clasificar una especie desconocida incluso sin un libro de referencia.',
 },
 {
 EN: 'Certification is theory-based — no water time required by SSI. We offer an optional guided harbour dive focused entirely on finding nudibranchs in the field. Your instructor knows the sites and the hiding spots — under ledges, on hydroids, on specific algae. You will be astonished what was there all along on every dive, invisible until you knew what to look for.',
 PT: 'A certificação é baseada em teoria — nenhum tempo na água é exigido pela SSI. Oferecemos um mergulho no porto guiado opcional focado inteiramente em encontrar nudibrânquios no terreno. O instrutor conhece os locais e os esconderijos — debaixo de saliências, em hidroides, em algas específicas. Ficará espantado com o que sempre esteve lá em cada mergulho, invisível até saber o que procurar.',
 DE: 'Die Zertifizierung ist theoriebasiert — kein Wasseraufenthalt von SSI erforderlich. Wir bieten einen optionalen geführten Hafentauchgang an, der sich vollständig auf das Finden von Nacktschnecken im Feld konzentriert. Dein Instruktor kennt die Standorte und Verstecke — unter Vorsprüngen, auf Hydroiden, auf bestimmten Algen. Du wirst erstaunt sein, was die ganze Zeit bei jedem Tauchgang da war, unsichtbar bis du wusstest, worauf du achten sollst.',
 ES: 'La certificación está basada en teoría — SSI no requiere tiempo en el agua. Ofrecemos una inmersión guiada opcional en el puerto centrada enteramente en encontrar nudibranquios en el campo. Su instructor conoce los sitios y los escondites — bajo salientes, en hidrozoos, en algas específicas. Se asombrará de lo que siempre estuvo ahí en cada inmersión, invisible hasta que supo qué buscar.',
 },
 ],
 highlights: [
 { EN: 'Nudibranch taxonomy and morphological ID features', PT: 'Taxonomia de nudibrânquios e características morfológicas de ID', DE: 'Nacktschnecken-Taxonomie und morphologische ID-Merkmale', ES: 'Taxonomía de nudibranquios y características morfológicas de ID' },
 { EN: 'Warning colouration, mimicry and chemical defence biology', PT: 'Coloração de aviso, mimetismo e biologia da defesa química', DE: 'Warnfärbung, Mimikry und chemische Abwehrbiologie', ES: 'Coloración de advertencia, mimetismo y biología de la defensa química' },
 { EN: 'Field search technique — how to actually find them', PT: 'Técnica de busca no terreno — como realmente encontrá-los', DE: 'Feldsuchttechnik — wie man sie tatsächlich findet', ES: 'Técnica de búsqueda en campo — cómo encontrarlos realmente' },
 { EN: 'Theory-based — certify entirely online, no water time required', PT: 'Baseado em teoria — certifique-se inteiramente online, sem tempo na água necessário', DE: 'Theoriebasiert — vollständig online zertifizieren, kein Wasseraufenthalt erforderlich', ES: 'Basado en teoría — certifícate completamente online, sin tiempo en el agua requerido' },
 ],
 includes: [
 { EN: 'Digital SSI course materials', PT: 'Materiais de curso SSI digitais', DE: 'Digitale SSI-Kursmaterialien', ES: 'Materiales de curso SSI digitales' },
 { EN: 'Optional guided observation dive (harbour, equipment incl.)', PT: 'Mergulho de observação guiado opcional (porto, equipamento incluído)', DE: 'Optionaler geführter Beobachtungs-Tauchgang (Hafen, Ausrüstung inklusive)', ES: 'Inmersión de observación guiada opcional (puerto, equipo incl.)' },
 { EN: 'SSI Nudibranch Ecology Specialty certification', PT: 'Certificação SSI Nudibranch Ecology Specialty', DE: 'SSI Nudibranch Ecology Specialty Zertifizierung', ES: 'Certificación SSI Nudibranch Ecology Specialty' },
 ],
 prereqs: {
 EN: 'Open to all — no diving certification required. Minimum age 10.',
 PT: 'Aberto a todos — sem certificação de mergulho necessária. Idade mínima 10 anos.',
 DE: 'Für alle offen — keine Tauschzertifizierung erforderlich. Mindestalter 10 Jahre.',
 ES: 'Abierto a todos — no se requiere certificación de buceo. Edad mínima 10 años.',
 },
 duration: { EN: 'Self-paced online', PT: 'Online ao seu ritmo', DE: 'Online im eigenen Tempo', ES: 'Online a tu ritmo' },
 dives: { EN: 'Theory-based · optional harbour dive', PT: 'Baseado em teoria · mergulho no porto opcional', DE: 'Theoriebasiert · optionaler Hafentauchgang', ES: 'Basado en teoría · inmersión en el puerto opcional' },
 depth: { EN: 'N/A (optional harbour dive: max 18 m)', PT: 'N/A (mergulho no porto opcional: máx. 18 m)', DE: 'N/A (optionaler Hafentauchgang: max. 18 m)', ES: 'N/A (inmersión en el puerto opcional: máx. 18 m)' },
 certifies: { EN: 'SSI Nudibranch Ecology Specialty', PT: 'SSI Nudibranch Ecology Specialty', DE: 'SSI Nudibranch Ecology Specialty', ES: 'SSI Nudibranch Ecology Specialty' },
 },
}

const HOMEPAGE_REVIEWS = [
 { quote: 'I do not know of any other dive center where everything is done with so much passion and dedication. The entire crew is top-notch. You simply feel at home here. Update 2026: quality is paramount. We will definitely be back.', author: 'Siegfried I.', meta: 'Local Guide · 158 reviews', source: 'Google Reviews' },
 { quote: 'I did 11 dives in total and my experience with this shop was truly excellent. I was always greeted with warm smiles by the staff. The instructors were competent and safety-oriented, with thorough pre-dive briefings. Groups are typically 3 to 4 divers per guide — even during high season. The staff went out of their way to make sure I had everything I needed. I can highly recommend this shop.', author: 'L. M.', meta: 'Lausanne, Switzerland', source: 'TripAdvisor' },
 { quote: 'If you have the opportunity to visit the Dori Shipwreck, I definitely recommend. It was a highlight for sure. I even was lucky enough to see a Mola Mola!! The team is extremely professional, with thorough briefings on dive spots and safety measures.', author: 'Amanda', meta: 'Local Guide · 14 reviews', source: 'Google Reviews' },
 { quote: '4 excellent dives over 2 mornings. Friendly staff at the kiosk, dive guides Claudia and Bernardo were knowledgeable, approachable and professional. Good and varied dive sites: a volcanic arch, canyons, swim throughs and a wreck — something for everyone. Lots of marine life: octopus, barracuda, stingray and moray to name but a few.', author: 'Peter F.', meta: 'TripAdvisor', source: 'TripAdvisor' },
 { quote: 'The course was a perfect mix of learning and pure joy while exploring the volcanic reef. It definitely was not my last dive with this amazing team!', author: 'Agnieszka T.', meta: 'Poland', source: 'Google Reviews' },
 { quote: 'My girlfriend and I — both Open Water divers with little experience — had a great time here. The diving at the Dori wreck was amazing. Both the underwater scenery and the marine life were incredible. We recommend Azores Diving to everyone who wants a great diving experience on Sao Miguel.', author: 'Albart80', meta: 'Netherlands', source: 'TripAdvisor' },
 { quote: 'We dived with them for 3 days, really professionals and all the equipment is perfect. The Dori Wreck dive is amazing and we even did a night dive there. Incredible and super reliable — I would highly recommend this diving center!', author: 'Sara G.', meta: 'Spain', source: 'Google Reviews' },
 { quote: 'A really great school with a friendly, family atmosphere and very qualified and nice instructors. We always felt we were in good hands. The dives were also fantastic!', author: 'Stefan M.', meta: 'Germany', source: 'Google Reviews' },
 { quote: 'We were with this dive outfit for 3 days and they are awesome. Very responsive on WhatsApp where we got to ask many questions before booking. Staff is super friendly. Amazing!', author: 'Aylin M.', meta: '5 reviews', source: 'Google Reviews' },
]

const AVATAR = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%230a1e38'/%3E%3Ccircle cx='50' cy='36' r='20' fill='%231a3a6a'/%3E%3Cellipse cx='50' cy='88' rx='30' ry='24' fill='%231a3a6a'/%3E%3C/svg%3E`

const TEAM = [
 { name: 'Emanuel', role: 'Director · Skipper · Assistant Instructor Trainer', photo: '/team/Emanuel.webp', langs: ['','',''] },
 { name: 'Cláudia', role: 'Management · Front Office', photo: AVATAR, langs: ['','',''] },
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

const SSI_MATRIX: { name: string; ssiPro: string; mid: string; level: string; levelLabel: string; teaching: string; paidUntil: string|null; r: Record<string,number>; a?: Record<string,number> }[] = [
 { name:'Emanuel', ssiPro:'61194', mid:'669423', level:'ait', levelLabel:'AIT', teaching:'active', paidUntil:'Jan 2027', r:{snD:1,snI:1,ts:1,bOWD:1,aOWD:1,dmK:1,ean:1,pb:1,sod:1,sr:1,deep:1,nav:1,night:1,dsbt:1,mEco:0,cID:0,shk:1,rr:0,rrI:0,expI:0,dmT:1,aiT:1} },
 { name:'Paulo', ssiPro:'100648', mid:'2903449', level:'dmi', levelLabel:'DMI', teaching:'active', paidUntil:'Jan 2027', r:{snD:1,snI:1,ts:1,bOWD:1,aOWD:1,dmK:1,ean:1,pb:1,sod:1,sr:1,deep:1,nav:1,night:1,dsbt:1,mEco:1,cID:0,shk:0,rr:1,rrI:1,expI:1,dmT:1,aiT:1} },
 { name:'Milton', ssiPro:'100751', mid:'2810014', level:'dg', levelLabel:'Dive Guide', teaching:'non', paidUntil:null, r:{snD:1,snI:0,ts:0,bOWD:0,aOWD:0,dmK:0,ean:0,pb:0,sod:0,sr:0,deep:0,nav:0,night:0,dsbt:0,mEco:0,cID:0,shk:0,rr:0,rrI:0,expI:0,dmT:0,aiT:0}, a:{snD:1,snI:0,ts:1,bOWD:1,aOWD:0,dmK:0,ean:0,pb:0,sod:0,sr:0,deep:0,nav:0,night:0,dsbt:0,mEco:0,cID:0,shk:0,rr:0,rrI:0,expI:0,dmT:0,aiT:0} },
 { name:'Célia', ssiPro:'118298', mid:'2906627', level:'owi', levelLabel:'OWI', teaching:'active', paidUntil:'Jan 2027', r:{snD:1,snI:1,ts:1,bOWD:1,aOWD:1,dmK:1,ean:1,pb:1,sod:1,sr:1,deep:0,nav:0,night:0,dsbt:0,mEco:0,cID:0,shk:0,rr:0,rrI:0,expI:0,dmT:1,aiT:0} },
 { name:'André', ssiPro:'78780', mid:'2031742', level:'dmi', levelLabel:'DMI', teaching:'active', paidUntil:'Jan 2027', r:{snD:1,snI:1,ts:1,bOWD:1,aOWD:1,dmK:1,ean:1,pb:1,sod:1,sr:1,deep:1,nav:1,night:1,dsbt:0,mEco:1,cID:0,shk:0,rr:1,rrI:1,expI:0,dmT:1,aiT:1} },
 { name:'Fatema', ssiPro:'128389', mid:'2884802', level:'owi', levelLabel:'OWI', teaching:'active', paidUntil:'Jan 2027', r:{snD:1,snI:1,ts:1,bOWD:1,aOWD:1,dmK:1,ean:1,pb:1,sod:1,sr:1,deep:1,nav:0,night:0,dsbt:1,mEco:1,cID:1,shk:0,rr:1,rrI:0,expI:0,dmT:1,aiT:0} },
 { name:'Vasco', ssiPro:'99441', mid:'3172464', level:'owi', levelLabel:'OWI', teaching:'active', paidUntil:'Jan 2027', r:{snD:1,snI:1,ts:1,bOWD:1,aOWD:1,dmK:1,ean:1,pb:1,sod:0,sr:1,deep:0,nav:0,night:0,dsbt:1,mEco:1,cID:0,shk:0,rr:0,rrI:0,expI:1,dmT:0,aiT:0} },
 { name:'Carolina', ssiPro:'126209', mid:'2028346', level:'dg', levelLabel:'Dive Guide', teaching:'active', paidUntil:'Jan 2027', r:{snD:1,snI:0,ts:0,bOWD:0,aOWD:0,dmK:0,ean:0,pb:0,sod:0,sr:0,deep:0,nav:0,night:0,dsbt:0,mEco:0,cID:0,shk:0,rr:0,rrI:0,expI:0,dmT:0,aiT:0}, a:{snD:1,snI:0,ts:1,bOWD:1,aOWD:0,dmK:0,ean:0,pb:0,sod:0,sr:0,deep:0,nav:0,night:0,dsbt:0,mEco:0,cID:0,shk:0,rr:0,rrI:0,expI:0,dmT:0,aiT:0} },
 { name:'Lucas', ssiPro:'125455', mid:'3719862', level:'owi', levelLabel:'OWI', teaching:'active', paidUntil:'Jan 2027', r:{snD:1,snI:1,ts:1,bOWD:1,aOWD:1,dmK:1,ean:1,pb:1,sod:1,sr:1,deep:0,nav:0,night:0,dsbt:0,mEco:0,cID:0,shk:0,rr:0,rrI:0,expI:0,dmT:1,aiT:0} },
 { name:'Florian', ssiPro:'121341', mid:'3483034', level:'owi', levelLabel:'OWI', teaching:'active', paidUntil:'Jan 2027', r:{snD:1,snI:1,ts:1,bOWD:1,aOWD:1,dmK:1,ean:1,pb:1,sod:1,sr:1,deep:0,nav:0,night:0,dsbt:0,mEco:0,cID:0,shk:0,rr:0,rrI:0,expI:0,dmT:1,aiT:0} },
 { name:'Lois', ssiPro:'125432', mid:'3258303', level:'owi', levelLabel:'OWI', teaching:'active', paidUntil:'Jan 2027', r:{snD:1,snI:1,ts:1,bOWD:1,aOWD:1,dmK:1,ean:1,pb:1,sod:1,sr:1,deep:0,nav:0,night:0,dsbt:0,mEco:0,cID:0,shk:0,rr:0,rrI:0,expI:0,dmT:1,aiT:0} },
 { name:'Sergio', ssiPro:'129679', mid:'4656789', level:'dg', levelLabel:'Dive Guide', teaching:'active', paidUntil:'Jan 2027', r:{snD:1,snI:0,ts:0,bOWD:0,aOWD:0,dmK:0,ean:0,pb:0,sod:0,sr:0,deep:0,nav:0,night:0,dsbt:0,mEco:0,cID:0,shk:0,rr:0,rrI:0,expI:0,dmT:0,aiT:0}, a:{snD:1,snI:0,ts:1,bOWD:1,aOWD:0,dmK:0,ean:0,pb:0,sod:0,sr:0,deep:0,nav:0,night:0,dsbt:0,mEco:0,cID:0,shk:0,rr:0,rrI:0,expI:0,dmT:0,aiT:0} },
 { name:'Marta', ssiPro:'129359', mid:'4656792', level:'dg', levelLabel:'Dive Guide', teaching:'active', paidUntil:'Jan 2027', r:{snD:1,snI:0,ts:0,bOWD:0,aOWD:0,dmK:0,ean:0,pb:0,sod:0,sr:0,deep:0,nav:0,night:0,dsbt:0,mEco:0,cID:0,shk:0,rr:0,rrI:0,expI:0,dmT:0,aiT:0}, a:{snD:1,snI:0,ts:1,bOWD:1,aOWD:0,dmK:0,ean:0,pb:0,sod:0,sr:0,deep:0,nav:0,night:0,dsbt:0,mEco:0,cID:0,shk:0,rr:0,rrI:0,expI:0,dmT:0,aiT:0} },
 { name:'Paulo T.', ssiPro:'80924', mid:'2307753', level:'owi', levelLabel:'OWI', teaching:'non', paidUntil:null, r:{snD:1,snI:1,ts:1,bOWD:1,aOWD:1,dmK:1,ean:1,pb:1,sod:0,sr:1,deep:0,nav:0,night:0,dsbt:0,mEco:0,cID:0,shk:0,rr:0,rrI:0,expI:0,dmT:0,aiT:0} },
 { name:'Justýna', ssiPro:'115466', mid:'3427222', level:'dg', levelLabel:'Dive Guide', teaching:'active', paidUntil:'Jan 2027', r:{snD:1,snI:0,ts:0,bOWD:0,aOWD:0,dmK:0,ean:0,pb:0,sod:0,sr:0,deep:0,nav:0,night:0,dsbt:0,mEco:0,cID:0,shk:0,rr:0,rrI:0,expI:0,dmT:0,aiT:0}, a:{snD:1,snI:0,ts:1,bOWD:1,aOWD:0,dmK:0,ean:0,pb:0,sod:0,sr:0,deep:0,nav:0,night:0,dsbt:0,mEco:0,cID:0,shk:0,rr:0,rrI:0,expI:0,dmT:0,aiT:0} },
]
const SSI_COL_LABELS: Record<string,string> = {
 snD:'Snorkel Diver',snI:'Snorkel Instr.',ts:'Try Scuba',bOWD:'Basic OWD',aOWD:'Adv OWD',dmK:'DM Circuit',
 ean:'Nitrox/EAN',pb:'Perf Buoyancy',sod:'Sci of Diving',sr:'Stress & Rescue',deep:'Deep Diving',
 nav:'Navigation',night:'Night & LV',dsbt:'Boat Diving',mEco:'Marine Ecology',cID:'Coral ID',
 shk:'Shark Ecology',rr:'React Right',rrI:'RR Instructor',expI:'Expedition',dmT:'DM Trainer',aiT:'AIT'
}

const FAQ_DATA = [
 { cat: 'Booking & Prices', icon: '', items: [
 {
 q: { EN: 'Can I book just one dive, or do I need a package?', PT: 'Posso reservar apenas um mergulho, ou preciso de um pacote?', DE: 'Kann ich nur einen Tauchgang buchen, oder brauche ich ein Paket?', ES: '¿Puedo reservar solo una inmersión, o necesito un paquete?' },
 a: { EN: 'Yes — single dives are available on request. Our standard schedule runs double dives, which makes planning easier for everyone, but if you only want one dive, just let us know when booking.', PT: 'Sim — mergulhos individuais estão disponíveis mediante pedido. O nosso horário padrão inclui mergulhos duplos, o que facilita o planeamento, mas se quiser apenas um mergulho, basta avisar ao reservar.', DE: 'Ja — Einzeltauchgänge sind auf Anfrage möglich. Unser Standardplan sieht Doppeltauchgänge vor, was die Planung für alle erleichtert, aber wenn du nur einen Tauchgang möchtest, gib das einfach bei der Buchung an.', ES: 'Sí — las inmersiones individuales están disponibles bajo petición. Nuestro horario estándar incluye inmersiones dobles, lo que facilita la planificación, pero si solo quiere una inmersión, simplemente avísenos al reservar.' },
 },
 {
 q: { EN: 'How do I book?', PT: 'Como faço a reserva?', DE: 'Wie buche ich?', ES: '¿Cómo reservo?' },
 a: { EN: 'Online through our website, by walking up to our kiosk at the marina, or via WhatsApp (+351 927 382 023). We love walk-ins and respond quickly on WhatsApp.', PT: 'Online através do nosso website, pessoalmente no nosso quiosque na marina, ou via WhatsApp (+351 927 382 023). Adoramos visitas sem marcação e respondemos rapidamente no WhatsApp.', DE: 'Online über unsere Website, persönlich an unserem Kiosk in der Marina oder über WhatsApp (+351 927 382 023). Wir begrüßen auch Laufkundschaft und antworten schnell auf WhatsApp.', ES: 'Online a través de nuestra web, directamente en nuestro kiosco en el puerto, o por WhatsApp (+351 927 382 023). Nos encantan las visitas sin reserva y respondemos rápido por WhatsApp.' },
 },
 {
 q: { EN: 'Is card payment accepted?', PT: 'Aceitam pagamento com cartão?', DE: 'Wird Kartenzahlung akzeptiert?', ES: '¿Aceptan pago con tarjeta?' },
 a: { EN: 'Yes — card payment is accepted at the kiosk and online.', PT: 'Sim — pagamento com cartão aceite no quiosque e online.', DE: 'Ja — Kartenzahlung wird am Kiosk und online akzeptiert.', ES: 'Sí — se acepta pago con tarjeta en el kiosco y online.' },
 },
 {
 q: { EN: 'What is your cancellation policy?', PT: 'Qual é a vossa política de cancelamento?', DE: 'Wie lauten eure Stornierungsbedingungen?', ES: '¿Cuál es su política de cancelación?' },
 a: { EN: 'Cancel up to 72 hours before: full refund. Cancel between 72 and 48 hours before: 50% refund. Cancel less than 48 hours before or no-show: no refund. Need to reschedule? Reach out as early as possible and we will do our best to find you another slot.', PT: 'Cancelamento até 72 horas antes: reembolso total. Cancelamento entre 72 e 48 horas antes: reembolso de 50%. Cancelamento com menos de 48 horas ou não comparência: sem reembolso. Precisa de reagendar? Entre em contacto o mais cedo possível e faremos o possível para encontrar outra vaga.', DE: 'Stornierung bis zu 72 Stunden vorher: volle Rückerstattung. Stornierung zwischen 72 und 48 Stunden vorher: 50% Rückerstattung. Stornierung weniger als 48 Stunden vorher oder Nichterscheinen: keine Rückerstattung. Musst du umbuchen? Melde dich so früh wie möglich und wir tun unser Bestes, um einen anderen Termin zu finden.', ES: 'Cancelación hasta 72 horas antes: reembolso completo. Cancelación entre 72 y 48 horas antes: reembolso del 50%. Cancelación con menos de 48 horas o no presentarse: sin reembolso. ¿Necesita reprogramar? Contáctenos lo antes posible y haremos todo lo posible para encontrarle otro horario.' },
 },
 ]},
 { cat: 'The Dives', icon: '', items: [
 {
 q: { EN: 'I have never dived before — what can I do?', PT: 'Nunca mergulhei — o que posso fazer?', DE: 'Ich habe noch nie getaucht — was kann ich tun?', ES: 'Nunca he buceado — ¿qué puedo hacer?' },
 a: { EN: 'Our Basic Diver programme is made for this. No certification, no experience needed — just a minimum age of 10. You get online theory beforehand, a pool skills session, then a real harbour dive to up to 12 m with your instructor. You leave with an official SSI Basic Diver certification. Many guests call it one of the best hours of their lives.', PT: 'O nosso programa Basic Diver foi criado para isso. Sem certificação, sem experiência necessária — apenas idade mínima de 10 anos. Recebe teoria online antes, uma sessão de competências em piscina, depois um mergulho real no porto até 12 m com o seu instrutor. Sai com uma certificação oficial SSI Basic Diver. Muitos hóspedes dizem que foi uma das melhores horas das suas vidas.', DE: 'Unser Basic Diver Programm ist dafür gemacht. Keine Zertifizierung, keine Erfahrung nötig — nur ein Mindestalter von 10 Jahren. Du bekommst vorab Online-Theorie, eine Pool-Fertigkeitssession, dann einen echten Hafentauchgang bis zu 12 m mit deinem Instruktor. Du verlässt uns mit einer offiziellen SSI Basic Diver Zertifizierung. Viele Gäste nennen es eine der besten Stunden ihres Lebens.', ES: 'Nuestro programa Basic Diver está hecho para esto. Sin certificación, sin experiencia necesaria — solo edad mínima de 10 años. Recibirá teoría online por adelantado, una sesión de habilidades en piscina y luego una inmersión real en el puerto hasta 12 m con su instructor. Se irá con una certificación oficial SSI Basic Diver. Muchos huéspedes lo llaman una de las mejores horas de sus vidas.' },
 },
 {
 q: { EN: 'Can a non-diving companion come on the boat?', PT: 'Pode um acompanhante que não mergulha vir no barco?', DE: 'Kann eine nicht-tauchende Begleitperson mit ins Boot?', ES: '¿Puede venir un acompañante que no bucea en el barco?' },
 a: { EN: 'Yes. A partner or friend who does not dive is welcome on the boat trip. Let us know when booking so we can confirm space. Non-divers can snorkel or simply enjoy being out on the Atlantic.', PT: 'Sim. Um parceiro ou amigo que não mergulhe é bem-vindo na viagem de barco. Avise-nos ao reservar para confirmarmos o espaço. Quem não mergulha pode fazer snorkel ou simplesmente apreciar estar no Atlântico.', DE: 'Ja. Ein Partner oder Freund, der nicht taucht, ist auf dem Bootsausflug willkommen. Sag uns beim Buchen Bescheid, damit wir den Platz bestätigen können. Nicht-Taucher können schnorcheln oder einfach die Zeit auf dem Atlantik genießen.', ES: 'Sí. Un compañero o amigo que no bucea es bienvenido en el viaje en barco. Avísenos al reservar para confirmar el espacio. Los no buceadores pueden hacer snorkel o simplemente disfrutar de estar en el Atlántico.' },
 },
 {
 q: { EN: 'What certification do I need for the Formigas expedition?', PT: 'Que certificação preciso para a expedição às Formigas?', DE: 'Welche Zertifizierung benötige ich für die Formigas-Expedition?', ES: '¿Qué certificación necesito para la expedición a Formigas?' },
 a: { EN: 'Three pathways: Pathway A — AOWD + 30 or more dives, do a check dive with us (no course needed). Pathway B — OWD + more than 20 dives + Offshore Prep course (€160). Pathway C — AOWD + fewer than 30 dives + Offshore Prep course (€160). OWD with 20 or fewer dives is not yet eligible. See the Formigas page for details.', PT: 'Três vias: Via A — AOWD + 30 ou mais mergulhos, faça um check dive connosco (sem curso). Via B — OWD + mais de 20 mergulhos + Offshore Prep (€160). Via C — AOWD + menos de 30 mergulhos + Offshore Prep (€160). OWD com 20 ou menos mergulhos não é elegível. Consulte a página Formigas.', DE: 'Drei Wege: Weg A — AOWD + 30 oder mehr Tauchgänge, Check-Dive mit uns (kein Kurs nötig). Weg B — OWD + mehr als 20 Tauchgänge + Offshore-Prep (€160). Weg C — AOWD + weniger als 30 Tauchgänge + Offshore-Prep (€160). OWD mit 20 oder weniger Tauchgängen: noch nicht berechtigt. Formigas-Seite für Details.', ES: 'Tres vías: Vía A — AOWD + 30 o más inmersiones, haz un check dive con nosotros (sin curso). Vía B — OWD + más de 20 inmersiones + Offshore Prep (€160). Vía C — AOWD + menos de 30 inmersiones + Offshore Prep (€160). OWD con 20 o menos inmersiones aún no es elegible. Consulta la página Formigas.' },
 },
 {
 q: { EN: 'Is the Formigas trip guaranteed on a specific date?', PT: 'A viagem às Formigas é garantida numa data específica?', DE: 'Ist die Formigas-Fahrt an einem bestimmten Datum garantiert?', ES: '¿Está garantizado el viaje a Formigas en una fecha específica?' },
 a: { EN: 'No — it runs only when conditions allow the 42 nm offshore crossing safely. When a window opens, we contact everyone on the waitlist.', PT: 'Não — realiza-se apenas quando as condições permitem a travessia offshore de 42 nm em segurança. Quando surge uma janela, contactamos todos os que estão na lista de espera.', DE: 'Nein — es findet nur statt, wenn die Bedingungen die 42 sm Offshore-Überfahrt sicher ermöglichen. Wenn sich ein Fenster öffnet, kontaktieren wir alle auf der Warteliste.', ES: 'No — se realiza solo cuando las condiciones permiten cruzar las 42 mn de forma segura. Cuando se abre una ventana, contactamos a todos los de la lista de espera.' },
 },
 ]},
 { cat: 'Marine Life', icon: '', items: [
 {
 q: { EN: 'What can I expect to see underwater?', PT: 'O que posso esperar ver debaixo de água?', DE: 'Was kann ich unter Wasser erwarten zu sehen?', ES: '¿Qué puedo esperar ver bajo el agua?' },
 a: { EN: 'On a typical dive: grey triggerfish, barracuda, moray eels, groupers, stingrays, ornate wrasse, damselfish, and more Atlantic reef fish. Seasonally: Mola mola and mobula rays. At Formigas: mantas, whale sharks, and other large pelagics. Our team includes marine biologists who love talking you through what is out there.', PT: 'Num mergulho típico: peixes-porco-cinzentos, barracudas, enguias moray, meros, arraias, bodião ornado, damiselas e mais peixes de recife atlânticos. Sazonalmente: Mola mola e raias mobula. Nas Formigas: mantas, tubarões-baleia e outros grandes pelágicos. A nossa equipa inclui biólogos marinhos que adoram explicar o que existe lá fora.', DE: 'Bei einem typischen Tauchgang: Grauer Drückerfisch, Barrakudas, Muränen, Grouper, Stachelrochen, Ornatlippfische, Demoisellen und weitere atlantische Rifffische. Saisonal: Mondfisch und Teufelsrochen. Bei Formigas: Mantas, Walhaie und andere große Pelagische. Unser Team umfasst Meeresbiologen, die dir gerne erklären, was draußen zu finden ist.', ES: 'En una inmersión típica: ballesta gris, barracudas, morenas, meros, rayas, lábrido ornado, damiselas y más peces de arrecife atlánticos. De temporada: Mola mola y rayas mobula. En Formigas: mantas, tiburones ballena y otros grandes pelágicos. Nuestro equipo incluye biólogos marinos que les encanta explicarles qué hay ahí fuera.' },
 },
 {
 q: { EN: 'When is the best time of year?', PT: 'Qual é a melhor época do ano?', DE: 'Wann ist die beste Jahreszeit?', ES: '¿Cuál es la mejor época del año?' },
 a: { EN: 'We dive year-round. Mola mola and mantas are most common July through October. Visibility and conditions are excellent April through November.', PT: 'Mergulhamos durante todo o ano. O Mola mola e as mantas são mais comuns de julho a outubro. A visibilidade e as condições são excelentes de abril a novembro.', DE: 'Wir tauchen ganzjährig. Mola mola und Mantas sind am häufigsten von Juli bis Oktober. Sichtweite und Bedingungen sind von April bis November ausgezeichnet.', ES: 'Buceamos durante todo el año. El Mola mola y las mantas son más comunes de julio a octubre. La visibilidad y las condiciones son excelentes de abril a noviembre.' },
 },
 ]},
 { cat: 'Equipment & On the Day', icon: '', items: [
 {
 q: { EN: 'What should I bring?', PT: 'O que devo trazer?', DE: 'Was soll ich mitbringen?', ES: '¿Qué debo traer?' },
 a: { EN: 'Just yourself and a swimsuit. We provide everything: wetsuit, BCD, regulator, fins, mask, and weights. Your own gear is welcome too.', PT: 'Apenas você e um fato de banho. Fornecemos tudo: fato de mergulho, BCD, regulador, barbatanas, máscara e lastros. O seu próprio equipamento também é bem-vindo.', DE: 'Nur dich selbst und eine Badehose/einen Badeanzug. Wir stellen alles bereit: Neoprenanzug, Tarierjacke, Atemregler, Flossen, Maske und Blei. Deine eigene Ausrüstung ist ebenfalls willkommen.', ES: 'Solo usted y un bañador. Proporcionamos todo: traje de neopreno, BCD, regulador, aletas, máscara y plomos. Su propio equipo también es bienvenido.' },
 },
 {
 q: { EN: 'How early should I arrive?', PT: 'Com que antecedência devo chegar?', DE: 'Wie früh sollte ich ankommen?', ES: '¿Con cuánta antelación debo llegar?' },
 a: { EN: 'Please be at Marina Quiosque A at least 30 minutes before your scheduled departure for check-in, equipment fitting, and briefing.', PT: 'Por favor, esteja no Marina Quiosque A pelo menos 30 minutos antes da partida prevista para check-in, ajuste do equipamento e briefing.', DE: 'Bitte sei mindestens 30 Minuten vor deiner geplanten Abfahrt am Marina Quiosque A für Check-in, Ausrüstungsanpassung und Briefing.', ES: 'Por favor, esté en el Marina Quiosque A al menos 30 minutos antes de la salida programada para el check-in, ajuste del equipo y briefing.' },
 },
 {
 q: { EN: 'What happens if conditions are bad?', PT: 'O que acontece se as condições forem más?', DE: 'Was passiert, wenn die Bedingungen schlecht sind?', ES: '¿Qué pasa si las condiciones son malas?' },
 a: { EN: 'Safety always comes first. If we cancel due to weather, sea conditions, or any safety reason, you choose: full refund or reschedule — your call, no pressure.', PT: 'A segurança vem sempre primeiro. Se cancelarmos devido a condições meteorológicas, estado do mar ou qualquer razão de segurança, escolhe: reembolso total ou reagendamento — a sua decisão, sem pressão.', DE: 'Sicherheit hat immer Vorrang. Wenn wir aus Wettergründen, Seebedingungen oder einem anderen Sicherheitsgrund absagen, wählst du: volle Rückerstattung oder Umbuchen — deine Entscheidung, kein Druck.', ES: 'La seguridad siempre es lo primero. Si cancelamos por condiciones meteorológicas, estado del mar o cualquier razón de seguridad, usted elige: reembolso completo o reprogramación — su decisión, sin presión.' },
 },
 {
 q: { EN: 'Can I fly after diving?', PT: 'Posso voar depois de mergulhar?', DE: 'Kann ich nach dem Tauchen fliegen?', ES: '¿Puedo volar después de bucear?' },
 a: { EN: 'Yes, but timing matters. After certified dives, wait at least 24 hours before flying or travelling to significant altitude. After the Basic Diver programme (introductory diving), the minimum is 12 hours. This is a safety rule — nitrogen needs time to leave your body.', PT: 'Sim, mas o timing é importante. Após mergulhos certificados, aguarde pelo menos 24 horas antes de voar ou viajar para altitude significativa. Após o programa Basic Diver (mergulho introdutório), o mínimo é 12 horas. Esta é uma regra de segurança — o azoto precisa de tempo para sair do seu corpo.', DE: 'Ja, aber das Timing ist wichtig. Nach zertifizierten Tauchgängen wartest du mindestens 24 Stunden, bevor du fliegst oder in bedeutende Höhen reist. Nach dem Basic Diver Programm (Einführungstauchen) beträgt das Minimum 12 Stunden. Dies ist eine Sicherheitsregel — Stickstoff braucht Zeit, um deinen Körper zu verlassen.', ES: 'Sí, pero el momento importa. Después de inmersiones certificadas, espere al menos 24 horas antes de volar o viajar a altitudes significativas. Después del programa Basic Diver (buceo introductorio), el mínimo es de 12 horas. Esta es una regla de seguridad — el nitrógeno necesita tiempo para abandonar su cuerpo.' },
 },
 ]},
 { cat: 'Special Needs & Medical', icon: '', items: [
 {
 q: { EN: 'I have a medical condition or special requirements — can I still dive?', PT: 'Tenho uma condição médica ou necessidades especiais — posso ainda mergulhar?', DE: 'Ich habe eine Erkrankung oder besondere Anforderungen — kann ich noch tauchen?', ES: 'Tengo una condición médica o necesidades especiales — ¿puedo bucear igualmente?' },
 a: { EN: 'Please reach out before booking and we will do everything we can to make it work. We have dived with guests with depth restrictions, heart conditions, sensory differences, neurodiversity, and more. There is nothing too sensitive to ask — we would rather talk it through than have you miss the ocean.', PT: 'Por favor entre em contacto antes de reservar e faremos tudo o que pudermos para que funcione. Já mergulhámos com hóspedes com restrições de profundidade, condições cardíacas, diferenças sensoriais, neurodiversidade e muito mais. Não há nada demasiado sensível para perguntar — preferimos falar sobre isso do que ter de perder o oceano.', DE: 'Bitte melde dich vor der Buchung bei uns und wir werden alles tun, um es möglich zu machen. Wir haben mit Gästen mit Tiefenbeschränkungen, Herzerkrankungen, sensorischen Unterschieden, Neurodiversität und mehr getaucht. Es gibt nichts zu Sensibles, um zu fragen — wir sprechen lieber darüber, als dass du das Meer verpasst.', ES: 'Por favor, contáctenos antes de reservar y haremos todo lo posible para que funcione. Hemos buceado con huéspedes con restricciones de profundidad, condiciones cardíacas, diferencias sensoriales, neurodiversidad y más. No hay nada demasiado sensible que preguntar — preferimos hablarlo a que se pierda el océano.' },
 },
 {
 q: { EN: 'I have been told I can only dive to a limited depth — is that a problem?', PT: 'Disseram-me que só posso mergulhar até uma profundidade limitada — é um problema?', DE: 'Man hat mir gesagt, ich kann nur bis zu einer begrenzten Tiefe tauchen — ist das ein Problem?', ES: 'Me han dicho que solo puedo bucear hasta una profundidad limitada — ¿es un problema?' },
 a: { EN: 'In most cases, not at all. Many of our dive sites are beautiful at shallower depths, and our guides adapt the dive plan entirely to your limit. Just let us know your restriction when booking.', PT: 'Na maioria dos casos, de forma alguma. Muitos dos nossos locais de mergulho são lindos em profundidades mais rasas, e os nossos guias adaptam o plano de mergulho totalmente ao seu limite. Informe-nos da sua restrição ao reservar.', DE: 'In den meisten Fällen überhaupt nicht. Viele unserer Tauchplätze sind in flacheren Tiefen wunderschön, und unsere Guides passen den Tauchplan vollständig an deine Grenze an. Teil uns deine Einschränkung einfach bei der Buchung mit.', ES: 'En la mayoría de los casos, en absoluto. Muchos de nuestros sitios de buceo son hermosos en profundidades más someras, y nuestros guías adaptan el plan de inmersión completamente a su límite. Solo háganos saber su restricción al reservar.' },
 },
 {
 q: { EN: 'Is diving suitable for guests with sensory sensitivities or neurodiversity?', PT: 'O mergulho é adequado para hóspedes com sensibilidades sensoriais ou neurodiversidade?', DE: 'Ist Tauchen für Gäste mit sensorischen Empfindlichkeiten oder Neurodiversität geeignet?', ES: '¿Es el buceo adecuado para huéspedes con sensibilidades sensoriales o neurodiversidad?' },
 a: { EN: 'Yes. We adjust our briefing approach, take extra time, and plan the dive around what works best for you. Talk to us in advance — we will prepare accordingly.', PT: 'Sim. Ajustamos a nossa abordagem de briefing, levamos mais tempo e planeamos o mergulho em torno do que funciona melhor para si. Fale connosco com antecedência — prepararemos adequadamente.', DE: 'Ja. Wir passen unser Briefing an, nehmen uns extra Zeit und planen den Tauchgang um das herum, was für dich am besten funktioniert. Sprich im Voraus mit uns — wir bereiten uns entsprechend vor.', ES: 'Sí. Adaptamos nuestro enfoque de briefing, tomamos tiempo extra y planificamos la inmersión alrededor de lo que mejor funcione para usted. Háblenos con antelación — nos prepararemos en consecuencia.' },
 },
 ]},
]

const FAQ_SCHEMA = {
 '@context': 'https://schema.org',
 '@type': 'FAQPage',
 mainEntity: FAQ_DATA.flatMap(sec => sec.items.map(item => ({
 '@type': 'Question',
 name: item.q.EN,
 acceptedAnswer: { '@type': 'Answer', text: item.a.EN }
 })))
}
const CAREERS_BOX = {
 title: { EN: 'Want to do this as a working internship with us?', PT: 'Quer fazer este programa como estágio de trabalho connosco?', DE: 'Möchtest du dieses Programm als Arbeitspraktikum bei uns absolvieren?', ES: '¿Quieres hacer este programa como práctica laboral con nosotros?' },
 btn: { EN: 'Ask about an internship', PT: 'Perguntar sobre estágio', DE: 'Über ein Praktikum anfragen', ES: 'Preguntar sobre una práctica' },
 link: { EN: 'More on Careers & Opportunities ', PT: 'Mais sobre Carreiras & Oportunidades ', DE: 'Mehr zu Karriere & Möglichkeiten ', ES: 'Más sobre Carreras y Oportunidades ' },
}

export function PageCourseDetail({ nav, slug, lang }: { nav: (p: string) => void; slug: string; lang: Lang }) {
 const t = (key: keyof typeof T) => T[key][lang]
 const isMobile = useIsMobile()
 // SEO-Slug-Alias: /courses/discover-scuba-diving steht in app/sitemap.ts und
 // wird von der "Basic Diver"-Karte auf der Startseite angesteuert, der Kurs
 // selbst heisst intern basic-diver. Ohne diesen Alias zeigt die Seite
 // "Course not found." — bei einem Produkt fuer 139 EUR, direkt auf der Startseite.
 const SLUG_ALIASES: Record<string, string> = { 'discover-scuba-diving': 'basic-diver' }
 const d = COURSE_DETAIL[SLUG_ALIASES[slug] ?? slug]
 // /book: Produkt-ID = Kurs-Slug (Ausnahme Basic Diver). Nur online buchbare Kurse bekommen den Button,
 // alle anderen laufen ueber die Anfrage (sonst springt /book still auf Daily Double Dive).
 const BOOKABLE_COURSES = ['basic-diver-sea', 'scuba-diver', 'upgrade-owd', 'open-water-diver', 'advanced-open-water-diver', 'skills-update', 'wreck-diving', 'night-diving', 'navigation', 'deep-diving', 'stress-rescue', 'fish-identification', 'coral-identification', 'blue-oceans', 'manta-ray-ecology', 'marine-invertebrate-ecology', 'marine-mammal-ecology', 'nudibranch-ecology']
 const bookCandidate = (SLUG_ALIASES[slug] ?? slug) === 'basic-diver' ? 'basic-diver-sea' : (SLUG_ALIASES[slug] ?? slug)
 const bookSlug = BOOKABLE_COURSES.includes(bookCandidate) ? bookCandidate : null
 if (!d) return (
 <div style={{ padding: isMobile ? '32px 20px' : '60px 48px' }}>
 <Breadcrumb label={t('bc_courses')} homeLabel={t('bc_home')} goHome={() => nav('home')} />
 <p style={{ color: s.muted }}>{t('cd_not_found')}</p>
 </div>
 )

 const StatPill = ({ label, value }: { label: string; value: string }) => (
 <div style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 0, padding: '12px 16px', minWidth: '120px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: s.muted, marginBottom: '5px' }}>{label}</div>
 <div style={{ fontSize: '14px', fontWeight: 500, color: s.text }}>{value}</div>
 </div>
 )

 return (
 <div>
 {/* Hero */}
 <div style={{
 minHeight: '300px', position: 'relative', overflow: 'hidden',
 background: d.img
 ? `linear-gradient(180deg,color-mix(in srgb, var(--bg) 30%, transparent) 0%,color-mix(in srgb, var(--bg) 85%, transparent) 70%,var(--bg) 100%), url('${d.img}') center/cover`
 : 'linear-gradient(180deg,var(--surface),var(--bg))',
 display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
 padding: isMobile ? '32px 20px 28px' : '48px 48px 40px',
 }}>
 <div style={{ color: s.muted, marginBottom: '16px', fontSize: '14px' }}>
 <button type="button" onClick={() => nav('home')} style={{ color: s.accent, cursor: 'pointer', background: 'none', border: 'none', padding: 0, fontFamily: s.font }}>{t('bc_home')}</button>
 {' / '}
 <button type="button" onClick={() => nav('courses')} style={{ color: s.accent, cursor: 'pointer', background: 'none', border: 'none', padding: 0, fontFamily: s.font }}>{t('bc_courses')}</button>
 {' / '}{d.name}
 </div>
 <div style={{ color: d.accentColor, fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', fontSize: '14px', marginBottom: '10px' }}>
 {t('cd_ssi_cert')}
 </div>
 <h1 style={{ fontSize: 'clamp(28px,5vw,52px)', fontWeight: 500, letterSpacing: '-.02em', marginBottom: '10px', lineHeight: 1.05 }}>
 {d.name}<span style={{ color: d.accentColor }}>.</span>
 </h1>
 <p style={{ fontSize: '19px', fontWeight: 500, color: 'var(--text)', margin: '0 0 0', maxWidth: '540px', lineHeight: 1.4 }}>{d.tagline[lang]}</p>
 </div>

 <div style={{ padding: isMobile ? '0 20px 48px' : '0 48px 60px' }}>
 {/* Stats bar */}
 <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', margin: '28px 0 36px', paddingTop: '4px' }}>
 <StatPill label={t('bd_duration')} value={d.duration[lang]} />
 <StatPill label={t('dives_stat_dives')} value={d.dives[lang]} />
 <StatPill label={t('sites_max_depth')} value={d.depth[lang]} />
 <StatPill label={t('bd_price_label')} value={d.price} />
 </div>

 <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 340px', gap: isMobile ? '32px' : '48px', alignItems: 'start' }}>
 {/* Left: copy */}
 <div>
 <p style={{ fontSize: '17px', color: 'var(--text)', lineHeight: 1.7, marginBottom: '20px', fontWeight: 500 }}>{d.intro[lang]}</p>
 {d.body.map((para, i) => (
 <p key={i} style={{ fontSize: '15px', color: 'var(--muted)', lineHeight: 1.75, marginBottom: '16px' }}>{para[lang]}</p>
 ))}

 {/* Highlights */}
 <div style={{ margin: '32px 0 0' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: d.accentColor, marginBottom: '14px' }}>{t('cd_highlights')}</div>
 <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
 {d.highlights.map((h, hi) => (
 <div key={hi} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
 <span style={{ color: d.accentColor, fontWeight: 500, fontSize: '16px', lineHeight: 1, flexShrink: 0, marginTop: '1px' }}></span>
 <span style={{ fontSize: '14.5px', color: 'var(--text)', lineHeight: 1.5 }}>{h[lang]}</span>
 </div>
 ))}
 </div>
 </div>

 {/* Testimonial */}
 {d.testimonial && (
 <div style={{ marginTop: '36px', background: 'color-mix(in srgb, var(--text) 7%, transparent)', border: '1px solid color-mix(in srgb, var(--text) 16%, transparent)', borderLeft: `3px solid ${d.accentColor}`, borderRadius: 0, padding: '20px 22px' }}>
 <p style={{ fontSize: '15px', color: 'var(--text)', lineHeight: 1.7, margin: '0 0 10px', fontStyle: 'italic' }}>
 &ldquo;{d.testimonial.quote}&rdquo;
 </p>
 <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
 <div>
 <div style={{ fontSize: '14px', fontWeight: 500, color: d.accentColor }}>{d.testimonial.author}</div>
 <div style={{ fontSize: '14px', color: s.muted }}>{d.testimonial.source} </div>
 </div>
 </div>
 </div>
 )}

 {/* Careers box — only for dive-guide and divemaster */}
 {(slug === 'dive-guide' || slug === 'divemaster') && (
 <div style={{ marginTop: '36px', background: 'color-mix(in srgb, var(--text) 6%, transparent)', border: '1px solid color-mix(in srgb, var(--text) 15%, transparent)', borderRadius: 0, padding: '20px 22px' }}>
 <b style={{ color: 'var(--text)', fontSize: '15px', display: 'block', marginBottom: '14px' }}>
 {CAREERS_BOX.title[lang]}
 </b>
 <a
 href={`mailto:admin.azoresdiving@gmail.com?subject=Careers%20%E2%80%94%20Dive%20Guide%20%2F%20Divemaster%20internship`}
 style={{ display: 'inline-block', background: 'linear-gradient(135deg,var(--text),var(--text))', color: 'var(--on-accent)', fontWeight: 500, fontSize: '14px', padding: '10px 20px', borderRadius: 0, boxShadow: 'none', textDecoration: 'none', fontFamily: s.font }}
 >
 {CAREERS_BOX.btn[lang]}
 </a>
 <div style={{ marginTop: '12px' }}>
 <a href="/careers" style={{ color: s.accent, fontSize: '14px', fontWeight: 500, textDecoration: 'none', fontFamily: s.font }}>
 {CAREERS_BOX.link[lang]}
 </a>
 </div>
 </div>
 )}
 </div>

 {/* Right: sidebar */}
 <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
 {/* Requirements */}
 <div style={{ background: 'rgba(255,200,80,.07)', border: '1px solid rgba(255,200,80,.2)', borderRadius: 0, padding: '20px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: '#c9b48a', marginBottom: '12px' }}>{t('cd_requirements')}</div>
 <p style={{ fontSize: '14px', color: '#c9b48a', lineHeight: 1.6, margin: 0 }}>{d.prereqs[lang]}</p>
 </div>

 {/* What's included */}
 <div style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 0, padding: '20px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: s.muted, marginBottom: '12px' }}>{t('cd_whats_included')}</div>
 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
 {d.includes.map((item, ii) => (
 <div key={ii} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
 <span style={{ color: d.accentColor, fontSize: '14px', lineHeight: 1.4, flexShrink: 0 }}>—</span>
 <span style={{ fontSize: '14px', color: 'var(--muted)', lineHeight: 1.45 }}>{item[lang]}</span>
 </div>
 ))}
 </div>
 </div>

 {/* Certifies */}
 <div style={{ background: 'color-mix(in srgb, var(--text) 6%, transparent)', border: '1px solid color-mix(in srgb, var(--text) 15%, transparent)', borderRadius: 0, padding: '20px' }}>
 <div style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: s.accent, marginBottom: '8px' }}>{t('cd_youll_earn')}</div>
 <p style={{ fontSize: '14px', color: s.text, fontWeight: 500, margin: 0, lineHeight: 1.4 }}>{d.certifies[lang]}</p>
 </div>

 {/* Book / Inquire CTA */}
 {d.noBook || !bookSlug ? (
 <button type="button" onClick={() => nav('contact')} style={{ ...bookBtnStyle, display: 'block', textAlign: 'center', fontSize: '15px', padding: '14px 24px' }}>
 {d.noBook ? t('cd_inquire_course') : t('cd_inquire_generic')}
 </button>
 ) : (
 <a href={`/book?product=${bookSlug}`} onClick={() => fireEvent('booking_click')} style={{ ...bookBtnStyle, display: 'block', textAlign: 'center', fontSize: '15px', padding: '14px 24px' }}>
 {t('cd_book_course')}
 </a>
 )}
 <button type="button" onClick={() => nav('courses')} style={{ display: 'block', textAlign: 'center', fontSize: '14px', color: s.muted, cursor: 'pointer', padding: '4px', background: 'none', border: 'none', fontFamily: s.font, width: '100%' }}>
 {t('cd_back_courses')}
 </button>
 </div>
 </div>
 </div>
 </div>
 )
}
