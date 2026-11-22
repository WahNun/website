// Static metadata for dive site pages — used by generateMetadata (Server Component)

const BASE_IMG = 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/spots'

export type SiteMeta = {
  name: string
  depth: string
  level: string
  type: string
  description: string
  img?: string
}

export const SITE_META: Record<string, SiteMeta> = {
  'dori': {
    name: 'Dori Wreck',
    depth: '12–20 m',
    level: 'OWD',
    type: 'Wreck',
    description: 'Dive the Dori — a WWII Liberty ship sunk in 1964 off Ponta Delgada. One of the best wreck dives in the Azores, teeming with barracudas, trevallies and moray eels at 12–20 m.',
    img: `${BASE_IMG}/dori-hero.webp`,
  },
  'espelho': {
    name: 'Arco do Espelho',
    depth: '7–25 m',
    level: 'OWD',
    type: 'Arch',
    description: 'The "Mirror Arch" dive site in São Miguel, Azores — a volcanic tunnel where trapped air creates a perfect mirror ceiling. Home of Manuela the resident giant moray. All levels, 7–25 m.',
    img: `${BASE_IMG}/espelho-hero.webp`,
  },
  'cavaco': {
    name: 'Arco do Cavaco',
    depth: '3–20 m',
    level: 'OWD',
    type: 'Arch',
    description: 'Interconnected volcanic arches on the south coast of São Miguel. Slipper lobsters, dusky groupers, stingrays and scorpionfish in a labyrinth of swim-throughs at 3–20 m.',
    img: `${BASE_IMG}/cavaco-hero.webp`,
  },
  'caloura': {
    name: 'Arcos da Caloura',
    depth: '6–17 m',
    level: 'OWD',
    type: 'Arch',
    description: 'Twin volcanic arches at Caloura harbour — one of the best spots in the Azores to see long-snouted seahorses. Calm, sheltered entry, ideal for Open Water divers. 6–17 m.',
    img: `${BASE_IMG}/Arcos%20da%20Caloura%20Hero.webp`,
  },
  'galera': {
    name: 'Ponta da Galera',
    depth: '11–42 m',
    level: 'AOW',
    type: 'Wall / Point',
    description: 'A dramatic headland on the south coast of São Miguel with deep walls and big pelagics. Advanced diving in the Azores — hammerheads, amberjacks and open ocean encounters. 11–42 m.',
    img: `${BASE_IMG}/galera-hero.webp`,
  },
  'viteleiro': {
    name: 'Viteleiro',
    depth: '6–20 m',
    level: 'OWD',
    type: 'Volcanic Rock',
    description: 'Volcanic rock formations on the north coast of São Miguel — home to octopus, morays and colourful reef fish. An excellent beginner and photography dive site. 6–20 m.',
    img: `${BASE_IMG}/viteleiro-hero.webp`,
  },
  'viteleiro2': {
    name: 'Viteleiro 2',
    depth: '11–25 m',
    level: 'AOW',
    type: 'Volcanic Rock',
    description: 'The deeper sister site of Viteleiro on São Miguel\'s north coast. Atmospheric volcanic structures, resident schools of fish and open-water visibility. 11–25 m.',
    img: `${BASE_IMG}/viteleiro2-hero.webp`,
  },
  'ancoras': {
    name: 'Âncoras',
    depth: '9–17 m',
    level: 'OWD',
    type: 'Volcanic Rock',
    description: 'Named for the old anchors scattered across the volcanic seabed. A peaceful reef dive near Ponta Delgada with moray eels, parrotfish and cleaner wrasse. 9–17 m.',
    img: `${BASE_IMG}/ancoras-hero.webp`,
  },
  'ilheu-cozinha': {
    name: 'Ilhéu da Cozinha',
    depth: '12–20 m',
    level: 'OWD',
    type: 'Islet',
    description: 'Dive around the Ilhéu da Cozinha islet south of São Miguel — abundant sea life, caverns and swim-throughs in clear Azorean water. Suitable for Open Water divers. 12–20 m.',
    img: `${BASE_IMG}/ilheu-cozinha-hero.webp`,
  },
  'ilheu-west': {
    name: 'Ilhéu West',
    depth: '12–20 m',
    level: 'OWD',
    type: 'Islet',
    description: 'The west side of the Cozinha islet — a quieter, more exposed dive with great visibility and interesting volcanic topography. A local favourite in São Miguel. 12–20 m.',
    img: `${BASE_IMG}/ilheu-west-hero.webp`,
  },
  'cruzeiro-18': {
    name: 'Cruzeiro 18',
    depth: '12–25 m',
    level: 'OWD',
    type: 'Arch',
    description: 'A well-known arch dive in São Miguel at 12–25 m depth. Strong fish life, good visibility and photogenic underwater topography. Accessible for Open Water certified divers.',
    img: `${BASE_IMG}/cruzeiro-hero.webp`,
  },
  'cruzeiro-30': {
    name: 'Cruzeiro 30',
    depth: '20–30 m',
    level: 'AOW',
    type: 'Arch',
    description: 'The deeper section of the Cruzeiro arch dive system — for Advanced Open Water divers. Bigger structures, stronger currents and encounters with larger pelagic fish. 20–30 m.',
    img: `${BASE_IMG}/cruzeiro-hero.webp`,
  },
  'baixa-ouro': {
    name: 'Baixa do Ouro',
    depth: '3–22 m',
    level: 'OWD',
    type: 'Volcanic Rock',
    description: 'Versatile volcanic reef near Ponta Delgada — one dive, multiple depths. From shallow snorkelling areas to 22 m walls rich with Azorean reef life. All levels.',
    img: `${BASE_IMG}/baixa-ouro-hero.webp`,
  },
  'formigas': {
    name: 'Formigas',
    depth: '8–35 m',
    level: 'Advanced',
    type: 'Seamount',
    description: 'The Formigas seamount — the Azores\' most iconic offshore dive. Massive schools of amberjacks, rays, Mola mola encounters and world-class pelagic action. Advanced divers. 8–35 m.',
    img: `${BASE_IMG}/formigas-hero.webp`,
  },
  'dollabarat': {
    name: 'Dollabarat',
    depth: '12–200 m',
    level: 'Advanced',
    type: 'Seamount',
    description: 'A remote seamount in the open Atlantic near the Azores. Cathedral-like topography, massive pelagics and extraordinary biodiversity. Advanced divers only. From 12 m.',
    img: `${BASE_IMG}/dollabarat-hero.webp`,
  },
}

export const DAY_BOAT_SLUGS: string[] = Object.keys(SITE_META).filter(
  s => s !== 'formigas' && s !== 'dollabarat'
)
