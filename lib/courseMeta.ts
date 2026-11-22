// Static metadata for SSI course pages — used by generateMetadata (Server Component)
// Image URLs from Supabase public bucket

const BASE_IMG = 'https://mgsmoutwqgczajumzpoy.supabase.co/storage/v1/object/public/courses'

export type CourseMeta = {
  name: string
  price: string
  description: string
  img?: string
}

export const COURSE_META: Record<string, CourseMeta> = {
  'basic-diver': {
    name: 'Basic Diver',
    price: '€139',
    description: 'Try scuba diving in São Miguel, Azores. The SSI Basic Diver course is the perfect first step — no experience needed, fully guided by certified SSI instructors. Book for €139.',
    img: `${BASE_IMG}/try-scuba-hero.webp`,
  },
  'discover-scuba-diving': {
    name: 'Discover Scuba Diving',
    price: '€139',
    description: 'Experience scuba diving for the first time in the Azores. Guided by certified SSI instructors in the clear waters of São Miguel, Ponta Delgada. No certification required.',
    img: `${BASE_IMG}/try-scuba-hero.webp`,
  },
  'scuba-diver': {
    name: 'Scuba Diver',
    price: '€320',
    description: 'Earn your SSI Scuba Diver certification in Ponta Delgada, São Miguel. Dive to 12 m with a professional — the first step toward your Open Water certification. From €320.',
    img: `${BASE_IMG}/scuba-diver.webp`,
  },
  'open-water-diver': {
    name: 'Open Water Diver',
    price: '€460',
    description: 'Get your SSI Open Water Diver certification in the Azores. Learn to dive independently to 18 m in the waters of São Miguel with certified SSI & Mares instructors. From €460.',
    img: `${BASE_IMG}/owd-hero.webp`,
  },
  'upgrade-owd': {
    name: 'Scuba Diver → Open Water Upgrade',
    price: '€300',
    description: 'Already an SSI Scuba Diver? Upgrade to the full Open Water Diver certification in Ponta Delgada, Azores. Dive to 18 m independently. From €300.',
    img: `${BASE_IMG}/upgrade-owd.webp`,
  },
  'advanced-open-water-diver': {
    name: 'Advanced Open Water Diver',
    price: '€380',
    description: 'Push your diving further with the SSI Advanced Open Water Diver course in the Azores. Five Adventure Dives including deep, navigation and buoyancy. From €380.',
    img: `${BASE_IMG}/aowd.webp`,
  },
  'skills-update': {
    name: 'Scuba Skills Update',
    price: '€95',
    description: 'Returning to diving after a break? The SSI Scuba Skills Update refreshes your knowledge and in-water confidence in Ponta Delgada, São Miguel. From €95.',
    img: `${BASE_IMG}/skills-update.webp`,
  },
  'perfect-buoyancy': {
    name: 'Perfect Buoyancy',
    price: '€200',
    description: 'Master neutral buoyancy with the SSI Perfect Buoyancy course in the Azores. Less air consumption, zero reef contact, smoother diving. From €200.',
    img: `${BASE_IMG}/perfect-buoyancy.webp`,
  },
  'waves-tides-currents': {
    name: 'Waves, Tides & Currents',
    price: '€250',
    description: 'Learn to read and dive in ocean currents with the SSI Waves, Tides & Currents specialty. Ideal for Azores diving conditions. Certified SSI instructors. From €250.',
    img: `${BASE_IMG}/waves-tides-currents.webp`,
  },
  'wreck-diving': {
    name: 'Wreck Diving',
    price: '€250',
    description: 'Explore the Dori shipwreck and other wrecks around São Miguel. The SSI Wreck Diving specialty teaches safe wreck navigation and penetration techniques. From €250.',
    img: `${BASE_IMG}/wreck-diving.webp`,
  },
  'night-diving': {
    name: 'Night & Limited Visibility Diving',
    price: '€350',
    description: 'Experience the Azorean ocean after dark. The SSI Night & Limited Visibility course opens a completely different world of marine life around São Miguel. From €350.',
    img: `${BASE_IMG}/night-diving.webp`,
  },
  'navigation': {
    name: 'Navigation',
    price: '€260',
    description: 'Never get lost underwater. The SSI Navigation specialty teaches compass navigation and natural landmark techniques in the waters of São Miguel, Azores. From €260.',
    img: `${BASE_IMG}/navigation.webp`,
  },
  'deep-diving': {
    name: 'Deep Diving',
    price: '€350',
    description: 'Dive deeper safely with the SSI Deep Diving specialty. Explore the walls and seamounts of the Azores to 40 m with certified SSI instructors in Ponta Delgada. From €350.',
    img: `${BASE_IMG}/deep-diving.webp`,
  },
  'offshore-prep': {
    name: 'Offshore Prep',
    price: '€160',
    description: 'Prepare for Formigas and open-ocean diving around the Azores. Our in-house Offshore Prep course covers currents, SMB deployment and safety protocols. From €160.',
  },
  'react-right': {
    name: 'React Right',
    price: '€180',
    description: 'Learn first aid and emergency response with the SSI React Right course in Ponta Delgada. Essential skills for any diver — practical, hands-on training. From €180.',
    img: `${BASE_IMG}/react-right.webp`,
  },
  'stress-rescue': {
    name: 'Stress & Rescue',
    price: '€360',
    description: 'Become a more confident and safety-conscious diver with the SSI Stress & Rescue course in São Miguel, Azores. Full rescue diver certification. From €360.',
    img: `${BASE_IMG}/stress-rescue.webp`,
  },
  'science-diving': {
    name: 'Science of Diving',
    price: '€250',
    description: 'Understand the physics, physiology and decompression theory behind every dive. The SSI Science of Diving course — required for Divemaster — in the Azores. From €250.',
    img: `${BASE_IMG}/science-diving.webp`,
  },
  'dive-guide': {
    name: 'Dive Guide',
    price: '€680',
    description: 'Lead divers underwater with the SSI Dive Guide certification in Ponta Delgada, São Miguel. Professional diver training in the Azores. From €680.',
    img: `${BASE_IMG}/dive-guide.webp`,
  },
  'divemaster': {
    name: 'Divemaster',
    price: '€950',
    description: 'Start your professional diving career with the SSI Divemaster program in the Azores. Train with experienced instructors in the Atlantic waters of São Miguel. From €950.',
    img: `${BASE_IMG}/divemaster.webp`,
  },
  'ssi-explorers': {
    name: 'SSI Explorers',
    price: 'on request',
    description: 'Introduce kids to the underwater world with the SSI Explorers program in Ponta Delgada. Safe, structured and fun aquatic adventures for young divers in São Miguel.',
    img: `${BASE_IMG}/ssi-explorers.webp`,
  },
  'photo-video': {
    name: 'Photo & Video',
    price: '€200',
    description: 'Capture the marine life of the Azores. The SSI Underwater Photography & Video specialty teaches composition, lighting and camera handling while diving. From €200.',
    img: `${BASE_IMG}/photo-video.webp`,
  },
  'computer-diving': {
    name: 'Computer Diving',
    price: '€170',
    description: 'Get the most from your dive computer with the SSI Computer Diving specialty in Ponta Delgada. Understand decompression models, algorithms and planning. From €170.',
    img: `${BASE_IMG}/computer-diving.webp`,
  },
  'boat-diving': {
    name: 'Boat Diving',
    price: '€250',
    description: 'Master entry, exit and underwater navigation from a dive boat. The SSI Boat Diving specialty in the Azores prepares you for offshore and open-ocean dives. From €250.',
    img: `${BASE_IMG}/boat-diving.webp`,
  },
  'fish-identification': {
    name: 'Fish Identification',
    price: '€170',
    description: 'Learn to name and understand the fish species you meet on every dive in the Azores. The SSI Fish Identification specialty — Atlantic reefs, pelagics and rays. From €170.',
    img: `${BASE_IMG}/fish-identification.webp`,
  },
  'coral-identification': {
    name: 'Coral Identification',
    price: '€150',
    description: 'Discover the coral and invertebrate life of the Azores with the SSI Coral Identification specialty. Perfect for marine biology enthusiasts diving in São Miguel. From €150.',
    img: `${BASE_IMG}/coral-identification.webp`,
  },
  'blue-oceans': {
    name: 'Blue Oceans',
    price: '€150',
    description: 'Dive with purpose — the SSI Blue Oceans course teaches ocean conservation and responsible diving in the Azores. Make every dive count. From €150.',
    img: `${BASE_IMG}/blue-oceans.webp`,
  },
  'manta-ray-ecology': {
    name: 'Manta & Ray Ecology',
    price: '€150',
    description: 'Study manta rays and their relatives with the SSI Manta & Ray Ecology specialty. Learn behaviour, identification and conservation diving in São Miguel, Azores. From €150.',
    img: `${BASE_IMG}/manta-ray-ecology.webp`,
  },
  'marine-invertebrate-ecology': {
    name: 'Marine Invertebrate Ecology',
    price: '€150',
    description: 'Explore the world of nudibranchs, crustaceans and other invertebrates. SSI Marine Invertebrate Ecology specialty — diving and science combined in the Azores. From €150.',
    img: `${BASE_IMG}/marine-invertebrate-ecology.webp`,
  },
  'marine-mammal-ecology': {
    name: 'Marine Mammal Ecology',
    price: '€150',
    description: 'Learn about whales, dolphins and seals with the SSI Marine Mammal Ecology specialty. Combine diving with marine biology in São Miguel, Azores. From €150.',
    img: `${BASE_IMG}/marine-mammal-ecology.webp`,
  },
  'nudibranch-ecology': {
    name: 'Nudibranch Ecology',
    price: '€150',
    description: 'Discover the colourful world of nudibranchs on every dive. The SSI Nudibranch Ecology specialty in the Azores — identification, behaviour and ecology. From €150.',
    img: `${BASE_IMG}/nudibranch-ecology.webp`,
  },
}
