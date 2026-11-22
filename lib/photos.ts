export type Photo = {
  src: string;
  alt: string;
  credit: string;
  license: string;
  href: string;
};

export const photos = {
  heroSea: {
    src: "/images/hero-sea.jpg",
    alt: "A small sailboat on open water under a bright break in heavy cloud, off the Azores.",
    credit: "Guillaume Baviere",
    license: "CC BY 2.0",
    href: "https://commons.wikimedia.org/wiki/File:A%C3%A7ores_2010-07-20_(5085904240).jpg",
  },
  diveDeck: {
    src: "/images/dive-deck.jpg",
    alt: "Looking along the deck of a boat at sea, with the São Miguel coastline ahead.",
    credit: "Jules Verne Times Two",
    license: "CC BY-SA 4.0",
    href: "https://commons.wikimedia.org/wiki/File:%22Netos_de_Jos%C3%A9_Augusto%22_whale_watching_boat,_S%C3%A3o_Miguel_Island,_Azores,_Portugal_(PPL1-Corrected).jpg",
  },
  diveHarbour: {
    src: "/images/dive-harbour.jpg",
    alt: "A white passenger boat moored against a stone harbour wall in the Azores.",
    credit: "Luca Nebuloni",
    license: "CC BY 2.0",
    href: "https://commons.wikimedia.org/wiki/File:Azores_7261_(7857449910).jpg",
  },
  localWorkshop: {
    src: "/images/local-workshop.jpg",
    alt: "A tailor at work beside a sewing machine, with lengths of colourful cloth hanging behind her.",
    credit: "Maina Pat Mbae",
    license: "CC BY-SA 4.0",
    href: "https://commons.wikimedia.org/wiki/File:A_tailor_at_her_workshop.jpg",
  },
  localHome: {
    src: "/images/local-home.jpg",
    alt: "A sunlit living room with a grey sofa, used as a sample of a customer’s home.",
    credit: "Unsplash",
    license: "Unsplash Licence",
    href: "https://unsplash.com/photos/1493663284031-b7e3aefcae8e",
  },
  sampleSofa: {
    src: "/images/sample-sofa.jpg",
    alt: "A green velvet sofa against a plain wall, used as a sample photo in the quote demo.",
    credit: "Unsplash",
    license: "Unsplash Licence",
    href: "https://unsplash.com/photos/1555041469-a586c61ea9bc",
  },
} satisfies Record<string, Photo>;

export const photoCredits = Object.values(photos);
