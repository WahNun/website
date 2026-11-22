'use client'
import React, { useState } from 'react'
import { T, s, bookBtnStyle, fireEvent, useIsMobile, Breadcrumb, type Lang } from './_shared'

export const FISH_DB: Record<string,{latin:string,img:string,habitat:string,diet:string}> = {
 'Atlantic Barracuda': { latin:'Sphyraena viridensis', img:'https://inaturalist-open-data.s3.amazonaws.com/photos/450173365/medium.jpg', habitat:'Open water & wrecks, 0–100 m', diet:'Fish, squid' },
 'Bigeye Trevally': { latin:'Caranx sexfasciatus', img:'https://inaturalist-open-data.s3.amazonaws.com/photos/1411110/medium.jpg', habitat:'Wrecks, reefs & pelagic, 0–100 m', diet:'Small fish, crustaceans' },
 'Moray Eel': { latin:'Muraena helena', img:'https://inaturalist-open-data.s3.amazonaws.com/photos/2563138/medium.jpg', habitat:'Rocky crevices, 0–80 m', diet:'Fish, cephalopods' },
 'Giant Moray': { latin:'Gymnothorax javanicus', img:'https://inaturalist-open-data.s3.amazonaws.com/photos/247871410/medium.jpg', habitat:'Rocky reef, 1–50 m', diet:'Fish, cephalopods, crustaceans' },
 'Common Moray': { latin:'Muraena helena', img:'https://inaturalist-open-data.s3.amazonaws.com/photos/2563138/medium.jpg', habitat:'Rocky crevices, 0–80 m', diet:'Fish, cephalopods' },
 'Scorpionfish': { latin:'Scorpaena scrofa', img:'https://inaturalist-open-data.s3.amazonaws.com/photos/240728995/medium.jpeg', habitat:'Rocky seabed, 5–500 m', diet:'Fish, crustaceans' },
 'Black Scorpionfish': { latin:'Scorpaena porcus', img:'https://inaturalist-open-data.s3.amazonaws.com/photos/61740418/medium.jpg', habitat:'Rocky seabed & algae, 5–800 m', diet:'Fish, crustaceans, invertebrates' },
 'Octopus': { latin:'Octopus vulgaris', img:'https://inaturalist-open-data.s3.amazonaws.com/photos/166419253/medium.jpeg', habitat:'Rocky seabed & coral, 0–200 m', diet:'Crustaceans, molluscs, fish' },
 'Common Octopus': { latin:'Octopus vulgaris', img:'https://inaturalist-open-data.s3.amazonaws.com/photos/166419253/medium.jpeg', habitat:'Rocky seabed & coral, 0–200 m', diet:'Crustaceans, molluscs, fish' },
 'Cuttlefish': { latin:'Sepia officinalis', img:'https://inaturalist-open-data.s3.amazonaws.com/photos/269553588/medium.jpeg', habitat:'Sandy & rocky seabed, 0–200 m', diet:'Fish, crustaceans, molluscs' },
 'Parrotfish': { latin:'Sparisoma cretense', img:'https://inaturalist-open-data.s3.amazonaws.com/photos/82455367/medium.jpeg', habitat:'Rocky reef & algae beds, 0–30 m', diet:'Algae scraped from rock' },
 'Atlantic Chromis': { latin:'Chromis limbata', img:'https://inaturalist-open-data.s3.amazonaws.com/photos/109129197/medium.jpg', habitat:'Rocky reef, 5–40 m', diet:'Zooplankton, algae' },
 'Saddled Seabream': { latin:'Oblada melanura', img:'https://inaturalist-open-data.s3.amazonaws.com/photos/8074045/medium.jpg', habitat:'Rocky reef & Posidonia, 2–30 m', diet:'Algae, invertebrates' },
 'Ornate Wrasse': { latin:'Thalassoma pavo', img:'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/fish/ornate-wrasse.webp', habitat:'Rocky reef, 2–40 m', diet:'Small invertebrates, fish' },
 'Peacock Wrasse': { latin:'Symphodus tinca', img:'https://static.inaturalist.org/photos/38022693/medium.jpg', habitat:'Rocky reef & Posidonia, 1–30 m', diet:'Molluscs, crustaceans, worms' },
 'Slipper Lobster': { latin:'Scyllarides latus', img:'https://inaturalist-open-data.s3.amazonaws.com/photos/164764178/medium.jpeg', habitat:'Rocky caves & overhangs, 2–100 m', diet:'Molluscs, echinoderms' },
 'Dusky Grouper': { latin:'Epinephelus marginatus', img:'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/fish/Dusky_Grouper.webp', habitat:'Rocky reef & Posidonia, 1–200 m', diet:'Fish, cephalopods, crustaceans' },
 'Stingray': { latin:'Dasyatis pastinaca', img:'https://inaturalist-open-data.s3.amazonaws.com/photos/265483902/medium.jpg', habitat:'Sandy & muddy seabed, 0–200 m', diet:'Crustaceans, molluscs, small fish' },
 'Spider Crab': { latin:'Maja squinado', img:'https://inaturalist-open-data.s3.amazonaws.com/photos/122808652/medium.jpg', habitat:'Rocky & sandy seabed, 0–50 m', diet:'Algae, molluscs, small invertebrates' },
 'Conger Eel': { latin:'Conger conger', img:'https://static.inaturalist.org/photos/63263473/medium.jpg', habitat:'Rocky crevices & wrecks, 3–500 m', diet:'Fish, cephalopods, crustaceans' },
 'Long-snouted Seahorse': { latin:'Hippocampus guttulatus', img:'https://inaturalist-open-data.s3.amazonaws.com/photos/154810988/medium.jpeg', habitat:'Seagrass & algae beds, 0–20 m', diet:'Tiny crustaceans, plankton' },
 'Nudibranch': { latin:'Chromodoris spp.', img:'https://inaturalist-open-data.s3.amazonaws.com/photos/61388694/medium.jpg', habitat:'Rocky reef, 0–30 m', diet:'Sponges, bryozoans, hydroids' },
 'Atlantic Damsels': { latin:'Abudefduf luridus', img:'https://inaturalist-open-data.s3.amazonaws.com/photos/313776938/medium.jpeg', habitat:'Rocky reef, 0–10 m', diet:'Algae, plankton' },
 'Atlantic Amberjack': { latin:'Seriola dumerili', img:'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/fish/greater-amberjack.webp', habitat:'Open water & rocky reef, 20–360 m', diet:'Fish, cephalopods, crustaceans' },
 'Greater Amberjack': { latin:'Seriola dumerili', img:'https://inaturalist-open-data.s3.amazonaws.com/photos/300897123/medium.jpg', habitat:'Open water & rocky reef, 20–360 m', diet:'Fish, cephalopods, crustaceans' },
 'Greater Barracuda': { latin:'Sphyraena barracuda', img:'https://static.inaturalist.org/photos/64376618/medium.jpeg', habitat:'Open water & coral reef, 0–100 m', diet:'Fish, squid, cephalopods' },
 'Silky Shark': { latin:'Carcharhinus falciformis', img:'https://inaturalist-open-data.s3.amazonaws.com/photos/477653797/medium.jpg', habitat:'Open ocean, surface to 500 m', diet:'Fish, squid, octopus' },
 'Banded Sea Bream': { latin:'Diplodus vulgaris', img:'https://inaturalist-open-data.s3.amazonaws.com/photos/429699/medium.jpg', habitat:'Rocky reef & seagrass, 3–90 m', diet:'Invertebrates, algae' },
 'Comber': { latin:'Serranus cabrilla', img:'https://static.inaturalist.org/photos/27542282/medium.jpg', habitat:'Rocky reef & sandy patches, 1–500 m', diet:'Small fish, crustaceans, worms' },
 'Painted Comber': { latin:'Serranus scriba', img:'https://inaturalist-open-data.s3.amazonaws.com/photos/244363364/medium.jpg', habitat:'Rocky reef, 2–150 m', diet:'Small fish, crustaceans' },
 'Common Eagle Ray': { latin:'Myliobatis aquila', img:'https://inaturalist-open-data.s3.amazonaws.com/photos/300896755/medium.jpg', habitat:'Sandy flats & rocky reef, 1–100 m', diet:'Molluscs, crustaceans, small fish' },
 'Salema Porgy': { latin:'Sarpa salpa', img:'https://inaturalist-open-data.s3.amazonaws.com/photos/424954652/medium.jpg', habitat:'Rocky reef & Posidonia, 0–70 m', diet:'Algae, seagrass (herbivore)' },
 'Atlantic Ray': { latin:'Raja clavata', img:'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/fish/Atlantic%20Stingray.webp', habitat:'Sandy & muddy seabed, 5–300 m', diet:'Crustaceans, molluscs, small fish' },
 'Blenny': { latin:'Parablennius spp.', img:'https://static.inaturalist.org/photos/2791095/medium.jpg', habitat:'Rocky intertidal & subtidal, 0–30 m', diet:'Algae, small invertebrates' },
 'Tube Worm colonies': { latin:'Sabella spallanzanii', img:'https://static.inaturalist.org/photos/529498974/medium.jpg', habitat:'Rocky & sandy seabed, 5–100 m', diet:'Filter feeder — plankton & detritus' },
 'Giant Devil Ray': { latin:'Mobula birostris', img:'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/fish/Mobula.webp', habitat:'Open ocean, surface to 200 m', diet:'Zooplankton, small fish (filter feeder)' },
 'Manta Ray': { latin:'Mobula alfredi', img:'https://inaturalist-open-data.s3.amazonaws.com/photos/33852153/medium.jpg', habitat:'Open ocean, 0–40 m typically', diet:'Zooplankton, small fish (filter feeder)' },
 'Grey Triggerfish': { latin:'Balistes capriscus', img:'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/fish/grey%20triggerfish.webp', habitat:'Rocky reef & open water, 1–100 m', diet:'Urchins, molluscs, crustaceans' },
 'Barred Hogfish': { latin:'Bodianus scrofa', img:'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/fish/barred%20hogfish.webp', habitat:'Rocky reef & boulder slopes, 5–60 m', diet:'Crustaceans, molluscs, echinoderms' },
 'Bluefin Tuna': { latin:'Thunnus thynnus', img:'https://inaturalist-open-data.s3.amazonaws.com/photos/161933338/medium.jpeg', habitat:'Open ocean, surface to 985 m', diet:'Fish, squid, crustaceans' },
}

export const FULL_SPOTS = [
 {
 id: 'dori', bg: 'linear-gradient(200deg,#121210 0%,#121210 90%)', depth: '12–20 m', level: 'OWD', type: 'Wreck',
 name: 'Dori Wreck',
 tagline: { EN: 'WWII Liberty ship · sunk 1964 · artificial reef', PT: 'Navio Liberty da 2ª Guerra · afundado em 1964 · recife artificial', DE: 'Liberty-Schiff aus dem 2. WK · 1964 versunken · künstliches Riff', ES: 'Barco Liberty de la 2ª GM · hundido en 1964 · arrecife artificial' },
 desc: { EN: 'WWII Liberty ship, sunk 1964. A protected artificial reef swarming with barracudas and trevallies.', PT: 'Navio Liberty da Segunda Guerra Mundial, afundado em 1964. Um recife artificial protegido repleto de barracudas e xaréus.', DE: 'Liberty-Schiff aus dem Zweiten Weltkrieg, 1964 versunken. Ein geschütztes künstliches Riff, das von Barrakudas und Stachelmakrelen wimmelt.', ES: 'Carguero Liberty de la Segunda Guerra Mundial, hundido en 1964. Un arrecife artificial protegido repleto de barracudas y jureles.' },
 long: { EN: 'The Dori is a WWII-era Liberty ship resting at around 20 m on a sandy bottom just off Ponta Delgada. Sunk in 1964 as an artificial reef, she has become one of the richest dive sites in the Azores. Schools of grey triggerfish, Atlantic barracuda and bigeye trevally circle the superstructure continuously. Moray eels, scorpionfish and octopus inhabit every crack. The bow section allows limited penetration for OWD-certified divers.', PT: 'O Dori é um navio Liberty da época da Segunda Guerra Mundial que repousa a cerca de 20 m de profundidade, sobre um fundo arenoso junto a Ponta Delgada. Afundado em 1964 como recife artificial, tornou-se um dos mergulhos mais ricos dos Açores. Cardumes de peixes-porco-cinzentos, barracudas-do-atlântico e xaréus-de-olhos-grandes circulam continuamente em redor da superestrutura. Enguias-moray, peixes-escorpião e polvos habitam cada fenda. A secção da proa permite penetração limitada para mergulhadores com certificação OWD.', DE: 'Die Dori ist ein Liberty-Schiff aus dem Zweiten Weltkrieg, das auf einem Sandboden in etwa 20 m Tiefe vor Ponta Delgada liegt. 1964 als künstliches Riff versenkt, ist sie zu einem der reichhaltigsten Tauchplätze der Azoren geworden. Schwärme grauer Drückerfische, atlantischer Barrakudas und Großaugen-Stachelmakrelen umkreisen das Aufbaudeck ununterbrochen. Muränen, Drachenköpfe und Oktopusse bewohnen jeden Spalt. Der Bug ermöglicht begrenztes Penetrationstauchen für OWD-zertifizierte Taucher.', ES: 'El Dori es un carguero Liberty de la época de la Segunda Guerra Mundial que descansa a unos 20 m de profundidad sobre un fondo arenoso frente a Ponta Delgada. Hundido en 1964 como arrecife artificial, se ha convertido en uno de los sitios de buceo más ricos de las Azores. Bancos de ballestas grises, barracudas del Atlántico y jureles de ojos grandes rodean continuamente la superestructura. Morenas, peces escorpión y pulpos habitan cada grieta. La sección de proa permite penetración limitada para buceadores con certificación OWD.' },
 fish: [
 { EN: 'Atlantic Barracuda', PT: 'Barracuda-do-Atlântico', DE: 'Atlantischer Barrakuda', ES: 'Barracuda del Atlántico' },
 { EN: 'Grey Triggerfish', PT: 'Peixe-porco-cinzento', DE: 'Grauer Drückerfisch', ES: 'Ballesta gris' },
 { EN: 'Bigeye Trevally', PT: 'Xaréu-de-olho-grande', DE: 'Großaugen-Stachelmakrele', ES: 'Jurel de ojos grandes' },
 { EN: 'Greater Amberjack', PT: 'Olho-de-boi', DE: 'Großer Bernfisch', ES: 'Pez de limón' },
 { EN: 'Moray Eel', PT: 'Enguia-moray', DE: 'Muräne', ES: 'Morena' },
 { EN: 'Scorpionfish', PT: 'Peixe-escorpião', DE: 'Drachenkopf', ES: 'Pez escorpión' },
 { EN: 'Octopus', PT: 'Polvo', DE: 'Oktopus', ES: 'Pulpo' },
 { EN: 'Barred Hogfish', PT: 'Peixe-cão', DE: 'Gebänderter Schweinslippfisch', ES: 'Pejeperro' },
 ],
 loc: { EN: 'Ponta Delgada bay', PT: 'Baía de Ponta Delgada', DE: 'Bucht von Ponta Delgada', ES: 'Bahía de Ponta Delgada' },
 maxDepth: '20 m', avgDepth: '15 m', tempRange: '17–24 °C', beginner: true,
 hero: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/spots/dori-hero.webp',
 images: ['https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/spots/dori-2.webp', 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/spots/dori-3.webp'],
 review: { source: 'Google Reviews', quote: { EN: 'If you have the opportunity to visit the Dori Shipwreck, I definitely recommend. It was a highlight for sure. I even was lucky enough to see a Mola Mola!! The team is extremely professional, with thorough briefings on dive spots and safety measures.', PT: 'Se tiver a oportunidade de visitar o naufrágio do Dori, recomendo vivamente. Foi um ponto alto, de certeza. Tive ainda a sorte de ver um Peixe-Lua!! A equipa é extremamente profissional, com briefings detalhados sobre os pontos de mergulho e medidas de segurança.', DE: 'Wenn du die Gelegenheit hast, das Dori-Wrack zu besuchen, empfehle ich es unbedingt. Es war definitiv ein Highlight. Ich hatte sogar das Glück, einen Mondfisch zu sehen!! Das Team ist äußerst professionell, mit gründlichen Briefings zu Tauchplätzen und Sicherheitsmaßnahmen.', ES: 'Si tiene la oportunidad de visitar el naufragio del Dori, lo recomiendo sin dudarlo. Fue un punto culminante, sin duda. ¡Incluso tuve la suerte de ver un Pez Luna! El equipo es extremadamente profesional, con briefings exhaustivos sobre los puntos de buceo y medidas de seguridad.' }, author: 'Amanda · Local Guide · 14 reviews' },
 },
 {
 id: 'espelho', bg: 'linear-gradient(200deg,#121210 0%,#121210 90%)', depth: '7–25 m', level: 'OWD', type: 'Arch',
 name: 'Arco do Espelho',
 tagline: { EN: '"The Mirror Arch" · resident moray · all levels', PT: '"O Arco do Espelho" · moray residente · todos os níveis', DE: '"Der Spiegelbogen" · ansässige Muräne · für alle Levels', ES: '"El Arco del Espejo" · morena residente · todos los niveles' },
 desc: { EN: 'The "Mirror Arch" — trapped air turns the dome into a liquid mirror. Home of Manuela the moray.', PT: 'O "Arco do Espelho" — o ar aprisionado transforma a abóbada num espelho líquido. Casa de Manuela, a moray.', DE: 'Der "Spiegelbogen" — eingeschlossene Luft verwandelt die Kuppel in einen flüssigen Spiegel. Heimat von Manuela, der Muräne.', ES: 'El "Arco del Espejo" — el aire atrapado convierte la cúpula en un espejo líquido. Hogar de Manuela, la morena.' },
 long: { EN: 'Arco do Espelho ("Mirror Arch") is named for the trapped air pocket inside the volcanic tunnel that creates a perfect mirror effect on the ceiling — one of the most photogenic moments in Azorean diving. The site starts shallow (7 m) making it ideal for Open Water students, yet the arch continues to 25 m with impressive walls covered in hydroids and sponges. Manuela, a resident giant moray, has lived here for many years and is reliably found at the base of the arch.', PT: 'O Arco do Espelho deve o seu nome ao bolso de ar aprisionado no interior do túnel vulcânico, que cria um perfeito efeito de espelho no tecto — um dos momentos mais fotogénicos do mergulho açoriano. O mergulho começa a pouca profundidade (7 m), sendo ideal para alunos de Open Water, mas o arco prolonga-se até 25 m com impressionantes paredes revestidas de hidroides e esponjas. Manuela, uma moray gigante residente, vive aqui há muitos anos e é encontrada de forma fiável na base do arco.', DE: 'Arco do Espelho ("Spiegelbogen") ist benannt nach dem eingeschlossenen Luftpolster im vulkanischen Tunnel, das einen perfekten Spiegeleffekt an der Decke erzeugt — einer der fotogensten Momente beim Tauchen auf den Azoren. Der Tauchplatz beginnt flach (7 m), was ihn ideal für Open-Water-Studenten macht, doch der Bogen reicht bis 25 m mit beeindruckenden Wänden, die mit Hydrozoen und Schwämmen bedeckt sind. Manuela, eine ansässige Riesenmuräne, lebt hier seit vielen Jahren und ist zuverlässig an der Basis des Bogens zu finden.', ES: 'El Arco do Espelho ("Arco del Espejo") recibe su nombre por la bolsa de aire atrapada dentro del túnel volcánico, que crea un efecto de espejo perfecto en el techo — uno de los momentos más fotogénicos del buceo en las Azores. El sitio comienza a poca profundidad (7 m), lo que lo hace ideal para estudiantes de Open Water, aunque el arco continúa hasta 25 m con impresionantes paredes cubiertas de hidroides y esponjas. Manuela, una morena gigante residente, lleva aquí muchos años y se encuentra de forma fiable en la base del arco.' },
 fish: [
 { EN: 'Giant Moray', PT: 'Moray-gigante', DE: 'Riesenmuräne', ES: 'Morena gigante' },
 { EN: 'Parrotfish', PT: 'Peixe-papagaio', DE: 'Papageienfisch', ES: 'Pez loro' },
 { EN: 'Atlantic Chromis', PT: 'Cromis-do-atlântico', DE: 'Atlantische Chromis', ES: 'Chromis del Atlántico' },
 { EN: 'Saddled Seabream', PT: 'Sargo-legítimo', DE: 'Streifenbrasse', ES: 'Sargo jerezano' },
 { EN: 'Ornate Wrasse', PT: 'Raiva-ornamentada', DE: 'Bunter Lippfisch', ES: 'Lábrido ornamentado' },
 { EN: 'Grey Triggerfish', PT: 'Peixe-porco-cinzento', DE: 'Grauer Drückerfisch', ES: 'Ballesta gris' },
 { EN: 'Barred Hogfish', PT: 'Peixe-cão', DE: 'Gebänderter Schweinslippfisch', ES: 'Pejeperro' },
 ],
 loc: { EN: 'Ilhéus de Baixo, south coast', PT: 'Ilhéus de Baixo, costa sul', DE: 'Ilhéus de Baixo, Südküste', ES: 'Ilhéus de Baixo, costa sur' },
 maxDepth: '25 m', avgDepth: '16 m', tempRange: '17–24 °C', beginner: true,
 hero: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/spots/espelho-hero.webp',
 images: ['https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/spots/espelho-2.webp', 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/spots/espelho-3.webp'],
 },
 {
 id: 'cavaco', bg: 'linear-gradient(200deg,#121210 0%,#121210 90%)', depth: '3–20 m', level: 'OWD', type: 'Arch',
 name: 'Arco do Cavaco',
 tagline: { EN: 'Volcanic arches · lobsters & groupers', PT: 'Arcos vulcânicos · lagostas & meros', DE: 'Vulkanische Bögen · Langusten & Grouper', ES: 'Arcos volcánicos · langostas & meros' },
 desc: { EN: 'Volcanic arches full of slipper lobsters, groupers, stingrays and scorpionfish.', PT: 'Arcos vulcânicos repletos de lagostas, meros, arraias e peixes-escorpião.', DE: 'Vulkanische Bögen voller Bärenkrebs, Grouper, Stachelrochen und Drachenköpfen.', ES: 'Arcos volcánicos llenos de cigalas, meros, rayas y peces escorpión.' },
 long: { EN: 'Arco do Cavaco is a series of interconnected volcanic arches and caverns on the south coast of São Miguel. The structure creates a labyrinth of swim-throughs between 3 and 20 m depth. The overhangs are colonised by slipper lobsters (cavaco) and spider crabs. Large dusky groupers patrol the outer walls while stingrays rest on the sandy patches between the arches. Scorpionfish disguise themselves on the rocky ledges — look carefully.', PT: 'O Arco do Cavaco é uma série de arcos e cavernas vulcânicos interligados na costa sul de São Miguel. A estrutura cria um labirinto de passagens entre 3 e 20 m de profundidade. Os tetos estão colonizados por lagostas (cavaco) e caranguejos-aranha. Grandes meros-negros patrulham as paredes externas, enquanto as arraias descansam nas zonas arenosas entre os arcos. Os peixes-escorpião camuflam-se nas saliências rochosas — observe com atenção.', DE: 'Arco do Cavaco ist eine Reihe miteinander verbundener vulkanischer Bögen und Höhlen an der Südküste von São Miguel. Die Struktur bildet ein Labyrinth von Durchschwimmpassagen zwischen 3 und 20 m Tiefe. Die Überhänge sind von Bärenkrebsen (Cavaco) und Spinnenkrabben besiedelt. Große Braunzackenbarsche patrouillieren die äußeren Wände, während Stachelrochen auf den sandigen Flächen zwischen den Bögen ruhen. Drachenköpfe tarnen sich auf den felsigen Vorsprüngen — schau genau hin.', ES: 'El Arco do Cavaco es una serie de arcos y cavernas volcánicas interconectadas en la costa sur de São Miguel. La estructura crea un laberinto de pasajes entre 3 y 20 m de profundidad. Los salientes están colonizados por cigalas (cavaco) y cangrejos araña. Grandes meros negros patrullan las paredes exteriores, mientras que las rayas descansan en los parches arenosos entre los arcos. Los peces escorpión se camuflan en las repisas rocosas — observe con atención.' },
 fish: [
 { EN: 'Slipper Lobster', PT: 'Lagosta (cavaco)', DE: 'Bärenkrabbe', ES: 'Cigala de mar' },
 { EN: 'Dusky Grouper', PT: 'Mero-negro', DE: 'Braunzackenbarsch', ES: 'Mero negro' },
 { EN: 'Stingray', PT: 'Arraia', DE: 'Stachelrochen', ES: 'Raya' },
 { EN: 'Scorpionfish', PT: 'Peixe-escorpião', DE: 'Drachenkopf', ES: 'Pez escorpión' },
 { EN: 'Spider Crab', PT: 'Caranguejo-aranha', DE: 'Spinnenkrabbe', ES: 'Cangrejo araña' },
 { EN: 'Conger Eel', PT: 'Congro', DE: 'Seeaal', ES: 'Congrio' },
 ],
 loc: { EN: 'South coast, near Lagoa', PT: 'Costa sul, perto de Lagoa', DE: 'Südküste, nahe Lagoa', ES: 'Costa sur, cerca de Lagoa' },
 maxDepth: '20 m', avgDepth: '16 m', tempRange: '17–24 °C', beginner: true,
 hero: '/spots/cavaco-reef.webp',
 card: '/spots/cavaco-hero.webp',
 images: ['/spots/cavaco-lobster.webp', '/spots/cavaco-hero.webp'],
 heroAlt: 'Arco do Cavaco — reef with ornate wrasse',
 imagesAlt: ['Slipper lobster (cavaco) under an overhang at Arco do Cavaco', 'Volcanic arch at Arco do Cavaco'],
 },
 {
 id: 'caloura', bg: 'linear-gradient(200deg,#121210 0%,#121210 90%)', depth: '6–17 m', level: 'OWD', type: 'Arch',
 name: 'Arcos da Caloura',
 tagline: { EN: 'Double arches · seahorse habitat · easy entry', PT: 'Arcos duplos · habitat de cavalos-marinhos · entrada fácil', DE: 'Doppelbögen · Seepferdchenhabitat · einfacher Einstieg', ES: 'Arcos dobles · hábitat de caballitos de mar · entrada fácil' },
 desc: { EN: 'Twin volcanic arches at Caloura harbour — calm conditions, rich sea life and regular seahorse sightings.', PT: 'Dois arcos vulcânicos junto ao porto de Caloura — condições calmas, vida marinha rica e avistamentos frequentes de cavalos-marinhos.', DE: 'Zwei vulkanische Bögen am Hafen von Caloura — ruhige Bedingungen, reiches Meeresleben und regelmäßige Seepferdchen-Sichtungen.', ES: 'Dos arcos volcánicos junto al puerto de Caloura — condiciones tranquilas, rica vida marina y frecuentes avistamientos de caballitos de mar.' },
 long: { EN: 'Arcos da Caloura sits just outside the historic harbour of Caloura, offering sheltered, easy-entry diving. Two main arches frame a sandy bottom at 12–17 m decorated with colourful nudibranchs and sea slugs. The site is one of the most reliable spots in the Azores to find long-snouted seahorses clinging to hydroid bushes. The calm conditions make it a favourite for underwater photography and OWD courses.', PT: 'Os Arcos da Caloura situam-se mesmo à saída do histórico porto de Caloura, oferecendo mergulhos em condições abrigadas e de fácil entrada. Dois arcos principais enquadram um fundo arenoso a 12–17 m, decorado com coloridos nudibranquios e lesmas-do-mar. O local é um dos pontos mais fiáveis dos Açores para encontrar cavalos-marinhos-de-focinho-longo agarrados a arbustos de hidroides. As condições calmas fazem dele um favorito para fotografia subaquática e cursos OWD.', DE: 'Arcos da Caloura liegt direkt vor dem historischen Hafen von Caloura und bietet geschütztes Tauchen mit einfachem Einstieg. Zwei Hauptbögen rahmen einen Sandboden bei 12–17 m ein, der mit bunten Nacktschnecken und Meeresschnecken geschmückt ist. Der Standort ist einer der zuverlässigsten Plätze auf den Azoren, um Langschnauzen-Seepferdchen zu finden, die sich an Hydrozoen-Sträuchern festhalten. Die ruhigen Bedingungen machen ihn zu einem Favoriten für Unterwasserfotografie und OWD-Kurse.', ES: 'Los Arcos da Caloura se encuentran justo a la salida del histórico puerto de Caloura, ofreciendo buceo en condiciones abrigadas y de fácil acceso. Dos arcos principales enmarcan un fondo arenoso a 12–17 m decorado con coloridos nudibranquios y babosas de mar. El sitio es uno de los más fiables de las Azores para encontrar caballitos de mar de hocico largo aferrados a matorrales de hidroides. Las condiciones tranquilas lo convierten en un favorito para la fotografía subacuática y los cursos OWD.' },
 fish: [
 { EN: 'Long-snouted Seahorse', PT: 'Cavalo-marinho-de-focinho-longo', DE: 'Langschnauzen-Seepferdchen', ES: 'Caballito de mar de hocico largo' },
 { EN: 'Nudibranch', PT: 'Nudibranquio', DE: 'Nacktschnecke', ES: 'Nudibranquio' },
 { EN: 'Cuttlefish', PT: 'Choco', DE: 'Tintenfisch', ES: 'Sepia' },
 { EN: 'Atlantic Damsels', PT: 'Damiselas-do-atlântico', DE: 'Atlantische Riffbarsche', ES: 'Castañuelas del Atlántico' },
 { EN: 'Peacock Wrasse', PT: 'Raiva-pavão', DE: 'Pfauenlippfisch', ES: 'Lábrido pavón' },
 { EN: 'Grey Triggerfish', PT: 'Peixe-porco-cinzento', DE: 'Grauer Drückerfisch', ES: 'Ballesta gris' },
 { EN: 'Barred Hogfish', PT: 'Peixe-cão', DE: 'Gebänderter Schweinslippfisch', ES: 'Pejeperro' },
 ],
 loc: { EN: 'Caloura harbour, south coast', PT: 'Porto de Caloura, costa sul', DE: 'Hafen Caloura, Südküste', ES: 'Puerto de Caloura, costa sur' },
 hero: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/spots/Arcos%20da%20Caloura%20Hero.webp',
 images: ['https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/spots/Arcos%20da%20Caloura%20I.webp', 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/spots/Arcos%20da%20Caloura%20II.webp'],
 maxDepth: '17 m', avgDepth: '13 m', tempRange: '17–24 °C', beginner: true,
 },
 {
 id: 'galera', bg: 'linear-gradient(200deg,#121210 0%,#121210 90%)', depth: '11–42 m', level: 'AOW', type: 'Wall / Point',
 name: 'Ponta da Galera',
 tagline: { EN: 'Dramatic headland · deep walls · big pelagics', PT: 'Promontório dramático · paredes profundas · pelágicos', DE: 'Dramatisches Kap · tiefe Wände · Pelagische Fische', ES: 'Promontorio dramático · paredes profundas · pelágicos' },
 desc: { EN: 'A dramatic volcanic headland with steep walls dropping to 42 m and regular encounters with Atlantic amberjack.', PT: 'Um dramático promontório vulcânico com paredes íngremes descendo aos 42 m e encontros frequentes com arabaiana-do-atlântico.', DE: 'Ein dramatisches Vulkankap mit steil abfallenden Wänden bis 42 m und regelmäßigen Begegnungen mit Atlantischer Gabelmakrele.', ES: 'Un dramático promontorio volcánico con paredes escarpadas que descienden hasta 42 m y frecuentes encuentros con la serviola del Atlántico.' },
 long: { EN: 'Ponta da Galera is one of the most dramatic dive sites on São Miguel — a volcanic point that drops steeply to 42 m on two sides. The walls are draped in black coral fans and encrusting sponges. Swim-throughs at mid-depth add variety for Advanced divers. The exposed position of the point draws in schools of Atlantic amberjack, banded sea bream and occasional pelagic encounters. Current can be strong on the ebb — ideal for a drift. Advanced divers only due to depth and current.', PT: 'A Ponta da Galera é um dos mergulhos mais dramáticos de São Miguel — um promontório vulcânico que cai abruptamente até 42 m em dois lados. As paredes estão revestidas de corais negros em leque e esponjas incrustantes. Passagens a meia profundidade acrescentam variedade para mergulhadores Advanced. A posição exposta do promontório atrai cardumes de arrabaiana-do-atlântico, sargo-legítimo e encontros ocasionais com pelágicos. A corrente pode ser forte na vazante — ideal para deriva. Apenas para mergulhadores Advanced, devido à profundidade e corrente.', DE: 'Ponta da Galera ist einer der dramatischsten Tauchplätze auf São Miguel — ein Vulkankap, das auf zwei Seiten steil auf 42 m abfällt. Die Wände sind mit Schwarzkorallenfächern und inkrustierenden Schwämmen bedeckt. Durchschwimmpassagen in mittlerer Tiefe bieten Advanced-Tauchern Abwechslung. Die exponierte Lage des Kaps zieht Schulen der Atlantischen Gabelmakrele, Streifenbrassen und gelegentliche Pelagische an. Die Strömung kann beim Ebbe stark sein — ideal für einen Drift. Nur für Advanced-Taucher wegen Tiefe und Strömung.', ES: 'La Ponta da Galera es uno de los sitios de buceo más dramáticos de São Miguel — un promontorio volcánico que cae abruptamente hasta 42 m por dos lados. Las paredes están cubiertas de abanicos de coral negro y esponjas incrustantes. Los pasos a media profundidad añaden variedad para los buceadores Advanced. La posición expuesta del promontorio atrae bancos de serviola del Atlántico, sargos y encuentros ocasionales con pelágicos. La corriente puede ser fuerte en la bajamar — ideal para una deriva. Solo para buceadores Advanced debido a la profundidad y la corriente.' },
 fish: [
 { EN: 'Atlantic Amberjack', PT: 'Arabaiana-do-atlântico', DE: 'Atlantische Gabelmakrele', ES: 'Serviola del Atlántico' },
 { EN: 'Banded Sea Bream', PT: 'Sargo-de-banda', DE: 'Bindenbrasse', ES: 'Sargo listado' },
 { EN: 'Black Scorpionfish', PT: 'Peixe-escorpião-negro', DE: 'Schwarzer Drachenkopf', ES: 'Pez escorpión negro' },
 { EN: 'Conger Eel', PT: 'Congro', DE: 'Seeaal', ES: 'Congrio' },
 { EN: 'Comber', PT: 'Serrano-pintado', DE: 'Zackenbarsch', ES: 'Cabrilla' },
 ],
 loc: { EN: 'Ponta da Galera, east coast', PT: 'Ponta da Galera, costa leste', DE: 'Ponta da Galera, Ostküste', ES: 'Ponta da Galera, costa este' },
 maxDepth: '42 m', avgDepth: '17 m', tempRange: '17–24 °C', beginner: false,
 hero: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/spots/galera-hero.webp',
 images: ['https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/spots/galera-2.webp', 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/spots/galera-3.webp'],
 },
 {
 id: 'viteleiro', bg: 'linear-gradient(200deg,#121210 0%,#121210 90%)', depth: '6–20 m', level: 'OWD', type: 'Volcanic Rock',
 name: 'Viteleiro',
 tagline: { EN: 'Submerged seamount · rays & groupers · all levels', PT: 'Monte submarino · arraias & meros · todos os níveis', DE: 'Untergetauchter Seamount · Rochen & Grouper · für alle Levels', ES: 'Monte submarino · rayas & meros · todos los niveles' },
 desc: { EN: 'A submerged volcanic seamount rising from 20 m to 6 m — an underwater mountain covered in life.', PT: 'Um monte submarino vulcânico que sobe dos 20 m para os 6 m — uma montanha subaquática coberta de vida.', DE: 'Ein versunkener vulkanischer Seamount, der von 20 m auf 6 m ansteigt — ein Unterwasserberg, bedeckt mit Leben.', ES: 'Un monte submarino volcánico que asciende de 20 m a 6 m — una montaña subacuática cubierta de vida.' },
 long: { EN: 'Viteleiro is a submerged volcanic seamount rising to within 6 m of the surface. The structure creates a current shadow that concentrates plankton and small baitfish, which in turn attract larger predators. Common sightings include large dusky groupers, common eagle rays and schools of salema porgy. The rocky slopes are encrusted with coralline algae, hydroids and sea urchins. A solid, compact dive site suitable for all OWD-certified divers.', PT: 'A Viteleiro é um monte submarino vulcânico que sobe até 6 m abaixo da superfície. A estrutura cria uma sombra de corrente que concentra plâncton e peixe-isca, atraindo por sua vez predadores maiores. As observações habituais incluem grandes meros-negros, ratões-águia e cardumes de salemas. As encostas rochosas estão incrustadas com algas calcárias, hidroides e ouriços-do-mar. Um mergulho sólido e compacto, adequado para todos os mergulhadores com certificação OWD.', DE: 'Viteleiro ist ein versunkener Vulkan-Seamount, dessen Gipfel bis auf 6 m unter die Oberfläche reicht. Die Struktur erzeugt einen Strömungsschatten, der Plankton und kleine Köderfish konzentriert, was wiederum größere Räuber anzieht. Häufige Sichtungen umfassen große Braunzackenbarsche, Adlerrochen und Schwärme von Goldstriemen. Die felsigen Hänge sind mit Kalkrotalgen, Hydrozoen und Seeigeln bewachsen. Ein solider, kompakter Tauchplatz für alle OWD-zertifizierten Taucher.', ES: 'La Viteleiro es un monte submarino volcánico que asciende hasta 6 m bajo la superficie. La estructura crea una sombra de corriente que concentra plancton y peces cebo, atrayendo a su vez a depredadores más grandes. Las observaciones habituales incluyen grandes meros negros, águilas marinas y bancos de salemas. Las pendientes rocosas están cubiertas de algas calcáreas, hidroides y erizos de mar. Un sitio de buceo sólido y compacto apto para todos los buceadores con certificación OWD.' },
 fish: [
 { EN: 'Dusky Grouper', PT: 'Mero-negro', DE: 'Braunzackenbarsch', ES: 'Mero negro' },
 { EN: 'Common Eagle Ray', PT: 'Ratão-águia', DE: 'Gewöhnlicher Adlerrochen', ES: 'Águila marina' },
 { EN: 'Salema Porgy', PT: 'Salema', DE: 'Goldstirn-Meerbrasse', ES: 'Salpa' },
 { EN: 'Common Octopus', PT: 'Polvo-comum', DE: 'Gemeiner Oktopus', ES: 'Pulpo común' },
 { EN: 'Peacock Wrasse', PT: 'Raiva-pavão', DE: 'Pfauenlippfisch', ES: 'Lábrido pavón' },
 ],
 loc: { EN: 'North coast, near Mosteiros', PT: 'Costa norte, perto de Mosteiros', DE: 'Nordküste, nahe Mosteiros', ES: 'Costa norte, cerca de Mosteiros' },
 maxDepth: '20 m', avgDepth: '14 m', tempRange: '17–24 °C', beginner: true,
 hero: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/spots/viteleira-hero.webp',
 images: ['https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/spots/viteleira-2.webp'],
 },
 {
 id: 'viteleiro2', bg: 'linear-gradient(200deg,#121210 0%,#121210 90%)', depth: '11–25 m', level: 'AOW', type: 'Volcanic Rock',
 name: 'Viteleiro II',
 tagline: { EN: 'Deeper plateau · larger groupers · stronger current', PT: 'Planalto mais profundo · meros maiores · corrente mais forte', DE: 'Tieferes Plateau · größere Grouper · stärkere Strömung', ES: 'Meseta más profunda · meros más grandes · más corriente' },
 desc: { EN: 'The deeper, wilder continuation of Viteleiro — walls to 25 m, bigger fish and more current.', PT: 'A continuação mais profunda e selvagem da Viteleiro — paredes até 25 m, peixe maior e mais corrente.', DE: 'Der tiefere und exponiertere Teil des Viteleiro-Seamount-Komplexes — Wände bis 25 m, größere Fische und mehr Strömung.', ES: 'La continuación más profunda y salvaje de la Viteleiro — paredes hasta 25 m, peces más grandes y más corriente.' },
 long: { EN: 'Viteleiro II is the deeper and more exposed section of the Viteleiro seamount complex. Where Viteleiro I tops out at 6 m, this section begins at 11 m and walls down to 25 m. The stronger current draws larger pelagic fish — Atlantic amberjack and barracuda replace the calmer species found on the shallow top. Large dusky groupers patrol the deeper ledges. This site suits Advanced divers comfortable with current and depth.', PT: 'A Viteleiro II é a secção mais profunda e exposta do complexo de montes submarinos da Viteleiro. Enquanto a Viteleiro I atinge os 6 m, esta secção começa nos 11 m e desce pelas paredes até 25 m. A corrente mais forte atrai peixes pelágicos maiores — arrabaiana-do-atlântico e barracuda substituem as espécies mais calmas encontradas no topo raso. Grandes meros-negros patrulham as saliências mais profundas. Este mergulho é indicado para mergulhadores Advanced confortáveis com corrente e profundidade.', DE: 'Viteleiro II ist der tiefere und exponierte Abschnitt des Viteleiro-Seamount-Komplexes. Wo Viteleiro I bei 6 m endet, beginnt dieser Abschnitt bei 11 m und fällt bis 25 m an den Wänden ab. Die stärkere Strömung zieht größere Pelagische an — Atlantische Gabelmakrelen und Barrakudas ersetzen die ruhigeren Arten auf dem flachen Gipfel. Große Braunzackenbarsche patrouillieren die tieferen Vorsprünge. Dieser Tauchplatz eignet sich für Advanced-Taucher, die mit Strömung und Tiefe vertraut sind.', ES: 'La Viteleiro II es la sección más profunda y expuesta del complejo de montes submarinos de la Viteleiro. Donde la Viteleiro I llega a los 6 m, esta sección comienza a los 11 m y cae por las paredes hasta los 25 m. La corriente más fuerte atrae peces pelágicos más grandes — serviolas del Atlántico y barracudas reemplazan a las especies más tranquilas del techo somero. Grandes meros negros patrullan las repisas más profundas. Este sitio es apto para buceadores Advanced cómodos con la corriente y la profundidad.' },
 fish: [
 { EN: 'Atlantic Amberjack', PT: 'Arabaiana-do-atlântico', DE: 'Atlantische Gabelmakrele', ES: 'Serviola del Atlántico' },
 { EN: 'Dusky Grouper', PT: 'Mero-negro', DE: 'Braunzackenbarsch', ES: 'Mero negro' },
 { EN: 'Atlantic Barracuda', PT: 'Barracuda-do-Atlântico', DE: 'Atlantischer Barrakuda', ES: 'Barracuda del Atlántico' },
 { EN: 'Common Eagle Ray', PT: 'Ratão-águia', DE: 'Gewöhnlicher Adlerrochen', ES: 'Águila marina' },
 { EN: 'Conger Eel', PT: 'Congro', DE: 'Seeaal', ES: 'Congrio' },
 ],
 loc: { EN: 'North coast, near Mosteiros', PT: 'Costa norte, perto de Mosteiros', DE: 'Nordküste, nahe Mosteiros', ES: 'Costa norte, cerca de Mosteiros' },
 hero: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/spots/Viteleiro%202%20Hero.webp',
 images: ['https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/spots/Viteleiro%202.webp'],
 maxDepth: '25 m', avgDepth: '16 m', tempRange: '17–24 °C', beginner: false,
 },
 {
 id: 'ancoras', bg: 'linear-gradient(200deg,#121210 0%,#121210 90%)', depth: '9–17 m', level: 'OWD', type: 'Volcanic Rock',
 name: 'Âncoras de São Roque',
 tagline: { EN: 'Historic anchors · reef & sandy channels · calm entry', PT: 'Âncoras históricas · recife e canais arenosos · entrada calma', DE: 'Historische Anker · Riff und Sandkanäle · ruhiger Einstieg', ES: 'Anclas históricas · arrecife y canales arenosos · entrada tranquila' },
 desc: { EN: 'Named after old anchors lying on the sandy bottom — a gentle reef dive with diverse Atlantic species.', PT: 'Batizado pelas velhas âncoras no fundo arenoso — um mergulho de recife suave com diversas espécies do Atlântico.', DE: 'Benannt nach alten Ankern auf dem Sandboden — ein sanfter Rifftauchgang mit vielfältigen Atlantikarten.', ES: 'Nombrado por las antiguas anclas en el fondo arenoso — un suave buceo en arrecife con diversas especies del Atlántico.' },
 long: { EN: 'Âncoras de São Roque ("Anchors of São Roque") takes its name from the collection of historic iron anchors scattered across the sandy seabed at 9–17 m. The site is a mix of volcanic reef and sand channels perfect for OWD dives and Open Water training. The anchors themselves are colonised by tube worms, blennies and painted combers. Rays are frequently spotted crossing the sand, and the calmer conditions make this a reliable dive even with mild swell.', PT: 'As Âncoras de São Roque devem o seu nome à coleção de âncoras de ferro históricas espalhadas pelo fundo arenoso a 9–17 m. O local combina recife vulcânico e canais de areia, perfeito para mergulhos OWD e treino de Open Water. As próprias âncoras estão colonizadas por vermes-tubulares, blénios e pérolas-pintadas. As arraias são frequentemente avistadas a cruzar a areia, e as condições calmas tornam este mergulho fiável mesmo com ondulação moderada.', DE: 'Âncoras de São Roque ("Anker von São Roque") verdankt seinen Namen der Sammlung historischer Eisenanker, die auf dem Sandboden bei 9–17 m verstreut liegen. Der Standort vereint Vulkanriff und Sandkanäle — perfekt für OWD-Tauchgänge und Open-Water-Training. Die Anker selbst sind von Röhrenwürmern, Schleimfischen und Gestreiften Zackenbarschen besiedelt. Rochen werden häufig über den Sand gleitend gesichtet, und die ruhigen Bedingungen machen diesen Tauchgang auch bei leichtem Swell zuverlässig.', ES: 'Las Âncoras de São Roque ("Anclas de São Roque") deben su nombre a la colección de anclas de hierro históricas esparcidas por el fondo arenoso a 9–17 m. El sitio combina arrecife volcánico y canales de arena, perfecto para inmersiones OWD y formación de Open Water. Las propias anclas están colonizadas por gusanos tubulares, blénidos y serránidos pintados. Las rayas se avistan frecuentemente cruzando la arena, y las condiciones tranquilas hacen que este sitio sea fiable incluso con algo de oleaje.' },
 fish: [
 { EN: 'Atlantic Ray', PT: 'Arraia-do-atlântico', DE: 'Atlantischer Rochen', ES: 'Raya del Atlántico' },
 { EN: 'Painted Comber', PT: 'Pérola-pintada', DE: 'Gestreifter Zackenbarsch', ES: 'Cabrilla pintada' },
 { EN: 'Blenny', PT: 'Blenídeo', DE: 'Schleimfisch', ES: 'Blenio' },
 { EN: 'Tube Worm colonies', PT: 'Colónias de vermes-tubulares', DE: 'Röhrenwurm-Kolonien', ES: 'Colonias de gusanos tubulares' },
 { EN: 'Ornate Wrasse', PT: 'Raiva-ornamentada', DE: 'Bunter Lippfisch', ES: 'Lábrido ornamentado' },
 ],
 loc: { EN: 'São Roque, south coast', PT: 'São Roque, costa sul', DE: 'São Roque, Südküste', ES: 'São Roque, costa sur' },
 hero: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/spots/Ancoras%20de%20Sao%20Roque%20hero.webp',
 images: ['https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/spots/Ancoras%20de%20Sao%20Roque%20I.webp', 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/spots/Ancoras%20de%20Sao%20Roque%20II.webp'],
 maxDepth: '17 m', avgDepth: '12 m', tempRange: '17–24 °C', beginner: true,
 },
 {
 id: 'ilheu-cozinha', bg: 'linear-gradient(200deg,#121210 0%,#121210 90%)', depth: '12–20 m', level: 'OWD', type: 'Islet',
 name: 'Ilheu de Vila Franca — Cozinha',
 tagline: { EN: 'Marine reserve · east side · dense fish life', PT: 'Reserva marinha · face leste · vida marinha densa', DE: 'Meeresschutzgebiet · Ostseite · dichtes Fischleben', ES: 'Reserva marina · cara este · abundante vida marina' },
 desc: { EN: 'The protected eastern face of the Vila Franca Islet — calm, rich and exceptional visibility.', PT: 'A face leste protegida do Ilhéu de Vila Franca do Campo — calma, rica e com visibilidade excecional.', DE: 'Die geschützte Ostseite des Ilhéu de Vila Franca do Campo — ruhig, artenreich und mit hervorragender Sichtweite.', ES: 'La cara este protegida del Ilhéu de Vila Franca do Campo — tranquila, rica y con visibilidad excepcional.' },
 long: { EN: 'The Cozinha ("Kitchen") side of Ilheu de Vila Franca do Campo is the eastern face of this fully protected marine reserve. The name references the abundance — fish life so dense the site feeds itself in a continuous cycle. Large dusky groupers approach divers without hesitation, and schools of salema and saddled seabream fill every crevice. The protected bay creates calmer conditions than the western side. Visibility frequently exceeds 25 m. This site is used in our Offshore Prep course.', PT: 'O lado Cozinha do Ilheu de Vila Franca do Campo é a face leste desta reserva marinha totalmente protegida. O nome faz referência à abundância — vida marinha tão densa que o local se autoalimenta num ciclo contínuo. Grandes meros-negros aproximam-se dos mergulhadores sem hesitação, e cardumes de salemas e sargos-legítimos preenchem todas as fendas. A baía protegida cria condições mais calmas do que o lado ocidental. A visibilidade ultrapassa frequentemente os 25 m. Este local é usado no nosso curso Offshore Prep.', DE: 'Die Cozinha ("Küche")-Seite des Ilheu de Vila Franca do Campo ist die Ostseite dieses vollständig geschützten Meeresschutzgebiets. Der Name spielt auf die Fülle an — das Fischleben ist so dicht, dass sich der Standort in einem kontinuierlichen Kreislauf selbst versorgt. Große Braunzackenbarsche nähern sich Tauchern ohne zu zögern, und Schwärme von Goldmakrelen und Streifenbrassen füllen jede Ritze. Die geschützte Bucht schafft ruhigere Bedingungen als die Westseite. Die Sichtweite überschreitet häufig 25 m. Dieser Standort wird in unserem Offshore-Prep-Kurs verwendet.', ES: 'El lado Cozinha ("Cocina") del Ilheu de Vila Franca do Campo es la cara este de esta reserva marina totalmente protegida. El nombre hace referencia a la abundancia — la vida marina es tan densa que el sitio se autoabastece en un ciclo continuo. Los grandes meros negros se acercan a los buceadores sin dudar, y bancos de salemas y sargos llenan cada grieta. La bahía protegida crea condiciones más tranquilas que el lado occidental. La visibilidad supera frecuentemente los 25 m. Este sitio se utiliza en nuestro curso Offshore Prep.' },
 fish: [
 { EN: 'Dusky Grouper', PT: 'Mero-negro', DE: 'Braunzackenbarsch', ES: 'Mero negro' },
 { EN: 'Salema Porgy', PT: 'Salema', DE: 'Goldstirn-Meerbrasse', ES: 'Salpa' },
 { EN: 'Saddled Seabream', PT: 'Sargo-legítimo', DE: 'Streifenbrasse', ES: 'Sargo jerezano' },
 { EN: 'Atlantic Chromis', PT: 'Cromis-do-atlântico', DE: 'Atlantische Chromis', ES: 'Chromis del Atlántico' },
 { EN: 'Common Moray', PT: 'Moray-comum', DE: 'Gemeine Muräne', ES: 'Morena común' },
 ],
 loc: { EN: 'Vila Franca do Campo, south-east coast', PT: 'Vila Franca do Campo, costa sudeste', DE: 'Vila Franca do Campo, Südostküste', ES: 'Vila Franca do Campo, costa sureste' },
 hero: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/spots/Ilheu%20de%20Vila%20Franca%20Cozinha%20Hero.webp',
 images: ['https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/spots/Ilheu%20de%20Vila%20Franca%20Cozinha.webp', 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/spots/Ilheu%20de%20Vila%20Franca%20Cozinha%20II.webp'],
 maxDepth: '20 m', avgDepth: '15 m', tempRange: '17–24 °C', beginner: true,
 },
 {
 id: 'ilheu-west', bg: 'linear-gradient(200deg,#121210 0%,#121210 90%)', depth: '12–20 m', level: 'OWD', type: 'Islet',
 name: 'Ilheu de Vila Franca — West',
 tagline: { EN: 'Marine reserve · open-water face · SMB practice', PT: 'Reserva marinha · face atlântica · prática de SMB', DE: 'Meeresschutzgebiet · Atlantikseite · SMB-Übung', ES: 'Reserva marina · cara atlántica · práctica de SMB' },
 desc: { EN: 'The exposed western face of the Vila Franca Islet reserve — more current, bigger fish, SMB deployment practice.', PT: 'A face oeste exposta da reserva do Ilhéu de Vila Franca — mais corrente, peixes maiores, prática de lançamento de SMB.', DE: 'Die exponierte Westseite des Meeresschutzgebiets Ilhéu de Vila Franca — mehr Strömung, größere Fische, SMB-Einsatzübung.', ES: 'La cara oeste expuesta de la reserva del Ilhéu de Vila Franca — más corriente, peces más grandes, práctica de lanzamiento de SMB.' },
 long: { EN: 'The western face of Ilheu de Vila Franca do Campo is the more exposed side of the marine reserve, facing the open Atlantic. The modest current concentrates more amberjack and large groupers here than on the calmer Cozinha side. Rocky ridges run out to 20 m with overhangs sheltering octopus and moray eels. This is the face used for SMB deployment and drift-entry training in our Offshore Prep specialty. An excellent site for divers ready to step up from completely sheltered diving.', PT: 'A face ocidental do Ilheu de Vila Franca do Campo é o lado mais exposto da reserva marinha, virado para o Atlântico aberto. A corrente moderada concentra mais arrabaiana e grandes meros do que no lado mais calmo da Cozinha. Cristas rochosas estendem-se até 20 m, com tetos a abrigar polvos e morays. Esta é a face utilizada para o treino de lançamento de SMB e entrada em deriva no nosso especial Offshore Prep. Um excelente local para mergulhadores prontos a dar um passo acima do mergulho em condições completamente abrigadas.', DE: 'Die Westseite des Ilheu de Vila Franca do Campo ist die exponiertere Seite des Meeresschutzgebiets, dem offenen Atlantik zugewandt. Die moderate Strömung konzentriert mehr Gabelmakrelen und große Grouper als auf der ruhigeren Cozinha-Seite. Felsrücken erstrecken sich bis 20 m mit Überhängen, die Oktopusse und Muränen beherbergen. Dies ist die Seite, die für das SMB-Einsatz- und Drifteintraining in unserer Offshore-Prep-Spezialität genutzt wird. Ein ausgezeichneter Standort für Taucher, die bereit sind, von vollständig geschütztem Tauchen auf anspruchsvollere Bedingungen umzusteigen.', ES: 'La cara occidental del Ilheu de Vila Franca do Campo es el lado más expuesto de la reserva marina, orientado hacia el Atlántico abierto. La corriente moderada concentra más serviolas y grandes meros que en el lado más tranquilo de la Cozinha. Crestas rocosas se extienden hasta 20 m con salientes que albergan pulpos y morenas. Esta es la cara utilizada para el entrenamiento de lanzamiento de SMB y entrada en deriva de nuestra especialidad Offshore Prep. Un sitio excelente para buceadores listos para dar un paso más allá del buceo en condiciones completamente abrigadas.' },
 fish: [
 { EN: 'Atlantic Amberjack', PT: 'Arabaiana-do-atlântico', DE: 'Atlantische Gabelmakrele', ES: 'Serviola del Atlántico' },
 { EN: 'Dusky Grouper', PT: 'Mero-negro', DE: 'Braunzackenbarsch', ES: 'Mero negro' },
 { EN: 'Common Octopus', PT: 'Polvo-comum', DE: 'Gemeiner Oktopus', ES: 'Pulpo común' },
 { EN: 'Common Moray', PT: 'Moray-comum', DE: 'Gemeine Muräne', ES: 'Morena común' },
 { EN: 'Painted Comber', PT: 'Pérola-pintada', DE: 'Gestreifter Zackenbarsch', ES: 'Cabrilla pintada' },
 ],
 loc: { EN: 'Vila Franca do Campo, south-east coast', PT: 'Vila Franca do Campo, costa sudeste', DE: 'Vila Franca do Campo, Südostküste', ES: 'Vila Franca do Campo, costa sureste' },
 hero: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/spots/Ilheu%20de%20Vila%20Franca%20West.webp',
 images: ['https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/spots/Ilheu%20de%20Vila%20Franca%20West%20II.webp'],
 maxDepth: '20 m', avgDepth: '15 m', tempRange: '17–24 °C', beginner: true,
 },
 {
 id: 'cruzeiro-18', bg: 'linear-gradient(200deg,#121210 0%,#121210 90%)', depth: '12–25 m', level: 'OWD', type: 'Arch',
 name: 'Arcos do Cruzeiro — 18',
 tagline: { EN: 'Volcanic arch system · shallow profile · colourful reef', PT: 'Sistema de arcos vulcânicos · perfil raso · recife colorido', DE: 'Vulkanisches Bogensystem · flaches Profil · buntes Riff', ES: 'Sistema de arcos volcánicos · perfil somero · arrecife colorido' },
 desc: { EN: 'The shallower route through the Cruzeiro arch system — ideal for OWD divers and underwater photography.', PT: 'O percurso mais raso pelo sistema de arcos do Cruzeiro — ideal para mergulhadores OWD e fotografia subaquática.', DE: 'Die flachere Route durch das Cruzeiro-Bogensystem — ideal für OWD-Taucher und Unterwasserfotografie.', ES: 'La ruta más somera por el sistema de arcos del Cruzeiro — ideal para buceadores OWD y fotografía subacuática.' },
 long: { EN: 'Arcos do Cruzeiro ("Crossroads Arches") at its 18 m profile offers a beautiful series of interconnected volcanic passages on the south coast of São Miguel. The arches frame corridors of coralline-encrusted rock hung with hydroids and small anemones. This shallower variant stays in the 12–25 m range, making it accessible to Open Water certified divers. Wrasse, chromis and damselfish move in and out of the arches in constant motion, and octopus are reliably found in crevices along the route.', PT: 'Os Arcos do Cruzeiro ("Arcos da Encruzilhada") no seu perfil de 18 m oferecem uma bela série de passagens vulcânicas interligadas na costa sul de São Miguel. Os arcos enquadram corredores de rocha incrustada de calcário, cobertos de hidroides e pequenas anémonas. Esta variante mais rasa mantém-se entre os 12 e os 25 m, tornando-a acessível a mergulhadores com certificação Open Water. Raivas, cromis e damiselas entram e saem dos arcos em movimento constante, e os polvos são encontrados de forma fiável nas fendas ao longo do percurso.', DE: 'Arcos do Cruzeiro ("Kreuzungsbögen") bei seinem 18-m-Profil bietet eine wunderschöne Reihe miteinander verbundener Vulkanpassagen an der Südküste von São Miguel. Die Bögen rahmen Korridore aus kalkverkrustetem Gestein ein, behängt mit Hydrozoen und kleinen Anemonen. Diese flachere Variante bleibt im Bereich von 12–25 m und ist für Open-Water-zertifizierte Taucher zugänglich. Lippfische, Chromis und Demoisellen bewegen sich in ständiger Bewegung durch die Bögen, und Oktopusse sind zuverlässig in Rissen entlang der Route zu finden.', ES: 'Los Arcos do Cruzeiro ("Arcos de la Encrucijada") en su perfil de 18 m ofrece una bella serie de pasajes volcánicos interconectados en la costa sur de São Miguel. Los arcos enmarcan corredores de roca incrustada de calcáreo, cubiertos de hidroides y pequeñas anémonas. Esta variante más somera se mantiene en el rango de 12–25 m, haciéndola accesible para buceadores con certificación Open Water. Lábridos, cromis y damiselas entran y salen de los arcos en movimiento constante, y los pulpos se encuentran de forma fiable en las grietas a lo largo del recorrido.' },
 fish: [
 { EN: 'Ornate Wrasse', PT: 'Raiva-ornamentada', DE: 'Bunter Lippfisch', ES: 'Lábrido ornamentado' },
 { EN: 'Atlantic Chromis', PT: 'Cromis-do-atlântico', DE: 'Atlantische Chromis', ES: 'Chromis del Atlántico' },
 { EN: 'Common Octopus', PT: 'Polvo-comum', DE: 'Gemeiner Oktopus', ES: 'Pulpo común' },
 { EN: 'Saddled Seabream', PT: 'Sargo-legítimo', DE: 'Streifenbrasse', ES: 'Sargo jerezano' },
 { EN: 'Peacock Wrasse', PT: 'Raiva-pavão', DE: 'Pfauenlippfisch', ES: 'Lábrido pavón' },
 ],
 loc: { EN: 'South coast, São Miguel', PT: 'Costa sul, São Miguel', DE: 'Südküste, São Miguel', ES: 'Costa sur, São Miguel' },
 maxDepth: '25 m', avgDepth: '15 m', tempRange: '17–24 °C', beginner: true,
 },
 {
 id: 'cruzeiro-30', bg: 'linear-gradient(200deg,#121210 0%,#121210 90%)', depth: '20–30 m', level: 'AOW', type: 'Arch',
 name: 'Arcos do Cruzeiro — 30',
 tagline: { EN: 'Deeper arch system · black coral · big groupers', PT: 'Sistema de arcos mais profundo · coral negro · grandes meros', DE: 'Tieferes Bogensystem · Schwarzkoralle · große Grouper', ES: 'Sistema de arcos más profundo · coral negro · grandes meros' },
 desc: { EN: 'The deeper passage through the Cruzeiro arches — black coral fans, large groupers and more current.', PT: 'A passagem mais profunda pelos arcos do Cruzeiro — leques de coral negro, grandes meros e mais corrente.', DE: 'Der tiefere Durchgang durch die Cruzeiro-Bögen — Schwarzkorallenfächer, große Grouper und mehr Strömung.', ES: 'El paso más profundo por los arcos del Cruzeiro — abanicos de coral negro, grandes meros y más corriente.' },
 long: { EN: 'The deeper variant of Arcos do Cruzeiro drops the profile to 20–30 m, opening a different world within the same volcanic structure. Black coral fans appear on the arch walls below 22 m, and the larger groupers that avoid shallower sites patrol this section freely. Average depth of 25 m means gas management becomes relevant, and the current is noticeably stronger on the ebb. Advanced Open Water certification is recommended. A rewarding extension for divers who have already explored the shallower 18 m profile.', PT: 'A variante mais profunda dos Arcos do Cruzeiro baixa o perfil para 20–30 m, abrindo um mundo diferente dentro da mesma estrutura vulcânica. Leques de coral negro aparecem nas paredes dos arcos abaixo dos 22 m, e os meros maiores que evitam os locais mais rasos patrulham esta secção livremente. A profundidade média de 25 m torna a gestão do gás relevante, e a corrente é visivelmente mais forte na vazante. Recomenda-se a certificação Advanced Open Water. Uma extensão gratificante para mergulhadores que já exploraram o perfil de 18 m mais raso.', DE: 'Die tiefere Variante der Arcos do Cruzeiro senkt das Profil auf 20–30 m ab und eröffnet eine andere Welt innerhalb derselben Vulkanstruktur. Schwarzkorallenfächer erscheinen an den Bogenwänden unterhalb von 22 m, und die größeren Grouper, die flachere Standorte meiden, patrouillieren diesen Abschnitt ungehindert. Die durchschnittliche Tiefe von 25 m macht die Gasverwaltung relevant, und die Strömung ist beim Ebbe deutlich stärker. Advanced Open Water-Zertifizierung wird empfohlen. Eine lohnende Erweiterung für Taucher, die bereits das flachere 18-m-Profil erkundet haben.', ES: 'La variante más profunda de los Arcos do Cruzeiro lleva el perfil a 20–30 m, abriendo un mundo diferente dentro de la misma estructura volcánica. Los abanicos de coral negro aparecen en las paredes de los arcos por debajo de 22 m, y los meros más grandes que evitan los sitios poco profundos patrullan esta sección libremente. La profundidad media de 25 m hace que la gestión del gas sea relevante, y la corriente es notablemente más fuerte en la bajamar. Se recomienda la certificación Advanced Open Water. Una extensión gratificante para buceadores que ya hayan explorado el perfil de 18 m.' },
 fish: [
 { EN: 'Dusky Grouper', PT: 'Mero-negro', DE: 'Braunzackenbarsch', ES: 'Mero negro' },
 { EN: 'Conger Eel', PT: 'Congro', DE: 'Seeaal', ES: 'Congrio' },
 { EN: 'Black Scorpionfish', PT: 'Peixe-escorpião-negro', DE: 'Schwarzer Drachenkopf', ES: 'Pez escorpión negro' },
 { EN: 'Ornate Wrasse', PT: 'Raiva-ornamentada', DE: 'Bunter Lippfisch', ES: 'Lábrido ornamentado' },
 { EN: 'Painted Comber', PT: 'Pérola-pintada', DE: 'Gestreifter Zackenbarsch', ES: 'Cabrilla pintada' },
 ],
 loc: { EN: 'South coast, São Miguel', PT: 'Costa sul, São Miguel', DE: 'Südküste, São Miguel', ES: 'Costa sur, São Miguel' },
 maxDepth: '30 m', avgDepth: '25 m', tempRange: '17–24 °C', beginner: false,
 },
 {
 id: 'baixa-ouro', bg: 'linear-gradient(200deg,#121210 0%,#121210 90%)', depth: '3–22 m', level: 'OWD', type: 'Volcanic Rock',
 name: 'Baixa do Ouro',
 tagline: { EN: '"Gold Shoal" · very shallow top · diverse reef life', PT: '"Baixa do Ouro" · topo muito raso · vida de recife diversa', DE: '"Goldene Untiefe" · sehr flacher Gipfel · vielfältiges Riffleben', ES: '"Bajo Dorado" · cima muy somera · diversa vida de arrecife' },
 desc: { EN: 'A shallow volcanic reef rising to just 3 m — rich with life from surface to 22 m and ideal for all levels.', PT: 'Um recife vulcânico raso que sobe até 3 m — rico em vida da superfície aos 22 m, ideal para todos os níveis.', DE: 'Ein flaches Vulkanriff, das bis auf 3 m unter die Oberfläche reicht — von der Oberfläche bis 22 m reich an Leben und für alle Levels geeignet.', ES: 'Un bajo volcánico que sube hasta 3 m — rico en vida desde la superficie hasta los 22 m, ideal para todos los niveles.' },
 long: { EN: 'Baixa do Ouro ("Gold Shoal") is a submerged volcanic reef whose top sits just 3 m below the surface, giving it exceptional light penetration that feeds a dense and diverse reef ecosystem. The site suits any certified diver — from open water students on their first ocean dives to experienced divers exploring the deeper ledges at 20–22 m. Colourful wrasse, large parrotfish and cuttlefish inhabit the shallower zones, while dusky groupers and rays favour the deeper sandy patches. An excellent second-dive option after a deeper morning site.', PT: 'A Baixa do Ouro é um recife vulcânico submerso cujo topo fica apenas 3 m abaixo da superfície, conferindo-lhe uma penetração de luz excecional que alimenta um ecossistema de recife denso e diversificado. O local adapta-se a qualquer mergulhador certificado — desde alunos de open water nos seus primeiros mergulhos no oceano até mergulhadores experientes a explorar as saliências mais profundas a 20–22 m. Raivas coloridas, grandes peixes-papagaio e chocos habitam as zonas mais rasas, enquanto meros-negros e arraias preferem as zonas arenosas mais fundas. Uma excelente opção para segundo mergulho após um local matinal mais profundo.', DE: 'Baixa do Ouro ("Goldene Untiefe") ist ein untergetauchtes Vulkanriff, dessen Gipfel nur 3 m unter der Oberfläche liegt, was ihm eine außergewöhnliche Lichtdurchdringung verleiht, die ein dichtes und vielfältiges Riffökosystem nährt. Der Standort eignet sich für jeden zertifizierten Taucher — von Open-Water-Studenten auf ihren ersten Ozean-Tauchgängen bis hin zu erfahrenen Tauchern, die die tieferen Vorsprünge bei 20–22 m erkunden. Bunte Lippfische, große Papageienfische und Tintenfische bewohnen die flacheren Zonen, während Braunzackenbarsche und Rochen sandige Tiefstellen bevorzugen. Eine ausgezeichnete Zweit-Tauchgang-Option nach einem tieferen Morgentauchplatz.', ES: 'La Baixa do Ouro ("Bajo Dorado") es un arrecife volcánico sumergido cuya cima se encuentra a solo 3 m bajo la superficie, proporcionándole una penetración de luz excepcional que alimenta un ecosistema de arrecife denso y diverso. El sitio se adapta a cualquier buceador certificado — desde estudiantes de open water en sus primeras inmersiones oceánicas hasta buceadores experimentados que exploran los salientes más profundos a 20–22 m. Lábridos coloridos, grandes peces loro y sepias habitan las zonas más someras, mientras que los meros negros y las rayas prefieren los parches arenosos más profundos. Una excelente opción para la segunda inmersión después de un sitio matutino más profundo.' },
 fish: [
 { EN: 'Dusky Grouper', PT: 'Mero-negro', DE: 'Braunzackenbarsch', ES: 'Mero negro' },
 { EN: 'Scorpionfish', PT: 'Peixe-escorpião', DE: 'Drachenkopf', ES: 'Pez escorpión' },
 { EN: 'Parrotfish', PT: 'Peixe-papagaio', DE: 'Papageienfisch', ES: 'Pez loro' },
 { EN: 'Atlantic Ray', PT: 'Arraia-do-atlântico', DE: 'Atlantischer Rochen', ES: 'Raya del Atlántico' },
 { EN: 'Ornate Wrasse', PT: 'Raiva-ornamentada', DE: 'Bunter Lippfisch', ES: 'Lábrido ornamentado' },
 ],
 loc: { EN: 'South coast, São Miguel', PT: 'Costa sul, São Miguel', DE: 'Südküste, São Miguel', ES: 'Costa sur, São Miguel' },
 hero: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/spots/Baixa%20do%20Ouro%20Hero.webp',
 images: ['https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/spots/Baixa%20do%20Ouro%20I.webp', 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/spots/Baixa%20do%20Ouro%20II.webp'],
 maxDepth: '22 m', avgDepth: '14 m', tempRange: '17–24 °C', beginner: true,
 },
 {
 id: 'formigas', bg: 'linear-gradient(200deg,#a39e94 0%,#121210 90%)', depth: '8–35 m', level: 'Advanced', type: 'Seamount', offshore: true,
 name: 'Formigas Banks',
 tagline: { EN: 'Offshore · 42 nm east · groupers · devil rays · July–Sept', PT: 'Offshore · 42 mn a leste · meros · raias-diabólicas · jul–set', DE: 'Offshore · 42 sm östlich · Grouper · Teufelsrochen · Jul–Sep', ES: 'Offshore · 42 mn al este · meros · rayas diablo · jul–sep' },
 desc: { EN: 'A remote seamount 42 nm from São Miguel — dense grouper schools, giant devil rays, and a sheer eastern wall dropping to 80 m.', PT: 'Um monte submarino remoto a 42 mn de São Miguel — densos cardumes de meros, gigantescas raias-diabólicas e uma imponente parede leste que mergulha até 80 m.', DE: 'Ein abgelegener Seamount 42 sm von São Miguel entfernt — dichte Grouper-Schulen, riesige Teufelsrochen und eine schroffe Ostwand, die auf 80 m abfällt.', ES: 'Un monte submarino remoto a 42 mn de São Miguel — densas escuelas de meros, gigantescas rayas diablo y una imponente pared este que cae hasta 80 m.' },
 long: { EN: 'The Formigas Banks are a group of small rocky islets and underwater seamounts 42 nautical miles east of São Miguel, forming one of the most remote and spectacular dive destinations in the Azores. Depending on conditions and the group, we explore different sections: the southern banks with dense dusky grouper aggregations in 10–35 m, the dramatic eastern wall plunging from 8 m to over 80 m encrusted with black coral and sea fans, and the calmer western plateau ideal for wide-angle photography. Giant devil rays cruise the blue water between formations throughout the season, and manta rays appear regularly. Offshore expedition only — departures confirmed individually when a safe weather window opens.', PT: 'As Formigas Banks são um grupo de pequenos ilhéus rochosos e montes submarinos a 42 milhas náuticas a leste de São Miguel, constituindo um dos destinos de mergulho mais remotos e espetaculares dos Açores. Dependendo das condições e do grupo, exploramos diferentes secções: os bancos sul com densas agregações de meros-negros a 10–35 m, a dramática parede leste que mergulha dos 8 m para mais de 80 m, incrustada de coral negro e leques de mar, e o planalto ocidental mais calmo, ideal para fotografia grand-angle. Raias-diabólicas gigantes cruzam a água azul entre as formações ao longo de toda a época, e raias-manta aparecem regularmente. Expedição offshore exclusiva — as saídas são confirmadas individualmente quando se abre uma janela meteorológica segura.', DE: 'Die Formigas Banks sind eine Gruppe kleiner Felseninseln und Unterwasser-Seamounts 42 Seemeilen östlich von São Miguel und gehören zu den abgelegensten und spektakulärsten Tauchzielen der Azoren. Je nach Bedingungen und Gruppe erkunden wir verschiedene Abschnitte: die südlichen Bänke mit dichten Braunzackenbarsch-Aggregationen in 10–35 m, die dramatische Ostwand, die von 8 m auf über 80 m abfällt und mit Schwarzkoralle und Seefächern besetzt ist, sowie das ruhigere westliche Plateau, ideal für Weitwinkel-Fotografie. Riesige Teufelsrochen kreuzen das blaue Wasser zwischen den Formationen während der gesamten Saison, und Mantas erscheinen regelmäßig. Nur Offshore-Expedition — Abfahrten werden individuell bestätigt, wenn ein sicheres Wetterfenster öffnet.', ES: 'Las Formigas Banks son un grupo de pequeños islotes rocosos y montes submarinos a 42 millas náuticas al este de São Miguel, formando uno de los destinos de buceo más remotos y espectaculares de las Azores. Según las condiciones y el grupo, exploramos diferentes secciones: los bancos del sur con densas agregaciones de meros negros a 10–35 m, la dramática pared este que cae de 8 m a más de 80 m cubierta de coral negro y abanicos de mar, y la meseta occidental más tranquila, ideal para fotografía gran angular. Las gigantescas rayas diablo cruzan el agua azul entre las formaciones a lo largo de toda la temporada, y las mantas aparecen regularmente. Expedición offshore exclusivamente — las salidas se confirman individualmente cuando se abre una ventana meteorológica segura.' },
 fish: [
 { EN: 'Dusky Grouper', PT: 'Mero-negro', DE: 'Braunzackenbarsch', ES: 'Mero negro' },
 { EN: 'Giant Devil Ray', PT: 'Raia-diabólica-gigante', DE: 'Riesiger Teufelsrochen', ES: 'Raya diablo gigante' },
 { EN: 'Manta Ray', PT: 'Raia-manta', DE: 'Mantarochen', ES: 'Manta raya' },
 { EN: 'Atlantic Amberjack', PT: 'Arabaiana-do-atlântico', DE: 'Atlantische Gabelmakrele', ES: 'Serviola del Atlántico' },
 { EN: 'Greater Barracuda', PT: 'Barracuda-maior', DE: 'Großer Barrakuda', ES: 'Barracuda grande' },
 { EN: 'Bluefin Tuna', PT: 'Atum-rabilho', DE: 'Roter Thun', ES: 'Atún rojo' },
 ],
 loc: { EN: '42 nm east of São Miguel — Formigas Banks', PT: '42 mn a leste de São Miguel — Formigas Banks', DE: '42 sm östlich von São Miguel — Formigas Banks', ES: '42 mn al este de São Miguel — Formigas Banks' },
 hero: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/spots/Formigas%20Hero.webp',
 images: ['https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/spots/Formigas%20I.webp', 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/spots/Formigas%20II.webp'],
 maxDepth: '80 m', avgDepth: '17 m', tempRange: '15–24 °C', beginner: false,
 },
 {
 id: 'dollabarat', bg: 'linear-gradient(200deg,#121210 0%,#121210 90%)', depth: '12–200 m', level: 'Advanced', type: 'Seamount', offshore: true,
 name: 'Dollabarat',
 tagline: { EN: 'Offshore · isolated pinnacle · drops to 200 m · blue water', PT: 'Offshore · pináculo isolado · mergulha a 200 m · água azul', DE: 'Offshore · isolierter Pinnacle · fällt auf 200 m ab · Freiwasser', ES: 'Offshore · pináculo aislado · cae a 200 m · agua abierta' },
 desc: { EN: 'A lone seamount pinnacle near Formigas — top at 12 m, walls plunging to 200 m into open Atlantic.', PT: 'Um solitário pináculo submarino perto das Formigas — topo a 12 m, paredes mergulhando nos 200 m do Atlântico aberto.', DE: 'Ein einsamer Seamount-Pinnacle nahe den Formigas Banks — Gipfel bei 12 m, Wände, die in 200 m offenen Atlantik abfallen.', ES: 'Un solitario pináculo submarino cerca de las Formigas — cima a 12 m, paredes que se precipitan a 200 m en el Atlántico abierto.' },
 long: { EN: 'Dollabarat is a solitary seamount pinnacle located near the Formigas Banks, rising from 200 m of open Atlantic to just 12 m below the surface. Its isolated position makes it a magnet for pelagic species that rarely approach coastal sites — manta rays, silky sharks and schools of tuna have all been recorded here. Divers work the pinnacle top and upper walls, keeping the infinite blue beneath in peripheral vision. This is not a dive for the faint-hearted: open water, strong current, and the knowledge that there is nothing below you for 200 m. Part of the Formigas offshore expedition.', PT: 'O Dollabarat é um pináculo submarino solitário situado perto das Formigas Banks, que sobe de 200 m do Atlântico aberto para apenas 12 m abaixo da superfície. A sua posição isolada torna-o um íman para espécies pelágicas que raramente se aproximam de locais costeiros — raias-manta, tubarões-sedosos e cardumes de atum já foram registados aqui. Os mergulhadores trabalham o topo do pináculo e as paredes superiores, mantendo o azul infinito por baixo no campo de visão periférico. Este não é um mergulho para os de coração fraco: águas abertas, corrente forte e a consciência de que não há nada abaixo durante 200 m. Parte da expedição offshore das Formigas.', DE: 'Dollabarat ist ein einsamer Seamount-Pinnacle in der Nähe der Formigas Banks, der aus 200 m offenem Atlantik bis auf 12 m unter die Oberfläche aufsteigt. Seine isolierte Position macht ihn zu einem Magneten für pelagische Arten, die sich selten Küstenstandorten nähern — Mantas, Seidenhaie und Thunfischschwärme wurden hier alle gesichtet. Taucher arbeiten den Pinnacle-Gipfel und die oberen Wände, mit dem unendlichen Blau darunter im peripheren Blickfeld. Dies ist kein Tauchgang für schwache Nerven: offenes Wasser, starke Strömung und das Wissen, dass 200 m tief nichts unter dir ist. Teil der Formigas-Offshore-Expedition.', ES: 'El Dollabarat es un solitario pináculo submarino situado cerca de las Formigas Banks, que asciende desde 200 m del Atlántico abierto hasta apenas 12 m bajo la superficie. Su posición aislada lo convierte en un imán para especies pelágicas que raramente se acercan a los sitios costeros — mantas, tiburones sedosos y bancos de atún han sido registrados aquí. Los buceadores trabajan la cima del pináculo y las paredes superiores, manteniendo el azul infinito debajo en el campo de visión periférico. Este no es un buceo para los débiles de corazón: agua abierta, fuerte corriente y la conciencia de que no hay nada bajo tus pies durante 200 m. Parte de la expedición offshore de las Formigas.' },
 fish: [
 { EN: 'Manta Ray', PT: 'Raia-manta', DE: 'Mantarochen', ES: 'Manta raya' },
 { EN: 'Giant Devil Ray', PT: 'Raia-diabólica-gigante', DE: 'Riesiger Teufelsrochen', ES: 'Raya diablo gigante' },
 { EN: 'Silky Shark', PT: 'Tubarão-sedoso', DE: 'Seidenhai', ES: 'Tiburón sedoso' },
 { EN: 'Bluefin Tuna', PT: 'Atum-rabilho', DE: 'Roter Thun', ES: 'Atún rojo' },
 { EN: 'Greater Amberjack', PT: 'Arabaiana-maior', DE: 'Großer Gabelmakrele', ES: 'Serviola mayor' },
 ],
 loc: { EN: '42 nm east of São Miguel — near Formigas Banks', PT: '42 mn a leste de São Miguel — perto das Formigas Banks', DE: '42 sm östlich von São Miguel — nahe Formigas Banks', ES: '42 mn al este de São Miguel — cerca de las Formigas Banks' },
 hero: 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/spots/Dollabarat%20Hero.webp',
 images: ['https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/spots/Dollabarat%20I.webp', 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/spots/Dollabarat%20II.webp'],
 maxDepth: '200 m', avgDepth: '16 m', tempRange: '15–24 °C', beginner: false,
 },
]

export function PageSites({ nav, lang }: { nav: (p: string) => void; lang: Lang }) {
 const t = (key: keyof typeof T) => T[key][lang]
 const isMobile = useIsMobile()

 return (
 <div style={{ padding: isMobile ? '32px 20px' : '60px 48px' }}>
 <Breadcrumb label={t('bc_sites')} homeLabel={t('bc_home')} goHome={() => nav('home')} />
 <h1 style={{ fontSize: 'clamp(28px,4vw,44px)', fontWeight: 500, letterSpacing: '-0.02em', marginBottom: '20px' }}>
 {t('sites_h1')}<span style={{ color: s.accent }}>.</span>
 </h1>
 <p style={{ color: '#f3efe6', fontSize: '17px', maxWidth: '600px', lineHeight: 1.65, marginBottom: '40px' }}>
 {t('sites_intro')}
 </p>
 <section aria-labelledby="sites-about" style={{ maxWidth: '760px', marginBottom: '40px' }}>
 <h2 id="sites-about" style={{ fontSize: 'clamp(20px,2.4vw,26px)', fontWeight: 500, letterSpacing: '-0.02em', marginBottom: '10px' }}>{t('sites_about_h2')}</h2>
 <p style={{ color: '#f3efe6', fontSize: '15.5px', lineHeight: 1.7, margin: 0 }}>{t('sites_about_p')}</p>
 </section>
 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: '14px', marginBottom: '36px' }}>
 {FULL_SPOTS.map(spot => (
 <div key={spot.name} onClick={() => { window.location.href = '/sites/' + spot.id }} style={{
 position: 'relative', borderRadius: 0, minHeight: '210px',
 display: 'flex', flexDirection: 'column', overflow: 'hidden',
 border: '1px solid rgba(255,255,255,.06)',
 cursor: 'pointer', transition: 'transform .15s, box-shadow .15s',
 }}
 onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-3px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 32px rgba(0,0,0,.4)' }}
 onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = '' }}
 >
 {(spot as any).hero ? (
 <>
 <div style={{ position: 'absolute', inset: 0, backgroundImage: `url('${(spot as any).card ?? (spot as any).hero}')`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
 <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(255,255,255,.045) 0%, rgba(0,0,0,0.78) 60%, rgba(0,0,0,0.95) 100%)' }} />
 </>
 ) : (
 <div style={{ position: 'absolute', inset: 0, background: spot.bg }} />
 )}
 <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', flex: 1, padding: '16px 18px 18px' }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
 <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
 <span style={{ fontSize: '14px', fontWeight: 500, color: 'rgba(255,255,255,.55)', background: 'rgba(0,0,0,.35)', padding: '3px 8px', borderRadius: 0 }}>{spot.type}</span>
 {(spot as any).offshore && <span style={{ fontSize: '14px', fontWeight: 500, color: '#c9b48a', background: 'rgba(201,180,138,.15)', padding: '3px 8px', borderRadius: 0, border: '1px solid rgba(201,180,138,.35)' }}>{t('sites_filter_offshore')}</span>}
 </div>
 <span style={{ fontSize: '14px', fontWeight: 500, color: '#c9c2b6', background: 'rgba(0,0,0,.35)', padding: '4px 9px', borderRadius: 0 }}>{spot.depth}</span>
 </div>
 <div style={{ flex: 1 }} />
 <h4 style={{ fontSize: '17px', margin: '0 0 5px', textShadow: '0 1px 8px rgba(0,0,0,.7)' }}>{spot.name}</h4>
 <p style={{ fontSize: '14px', color: '#f3efe6', lineHeight: 1.5, margin: '0 0 10px', textShadow: '0 1px 4px rgba(0,0,0,.6)' }}>{(spot.desc as any)[lang]}</p>
 <span style={{ fontSize: '14px', color: s.accent, fontWeight: 500 }}>{t('sites_details_link')}</span>
 </div>
 </div>
 ))}
 </div>
 <a href='/book' onClick={() => fireEvent('booking_click')} style={bookBtnStyle}>{t('sites_book')}</a>
 </div>
 )
}
