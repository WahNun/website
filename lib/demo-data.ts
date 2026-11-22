export type Flag = "Check-in" | "Medical review";

export type Boat = {
  time: string;
  name: string;
  trip: string;
  booked: number;
  capacity: number;
  flags: Flag[];
};

export const demoDate = "Saturday 22 November";
export const demoPlace = "Ponta Delgada";

export const boats: Boat[] = [
  {
    time: "08:30",
    name: "Rib Norte",
    trip: "Coastal dive",
    booked: 8,
    capacity: 10,
    flags: ["Check-in", "Medical review"],
  },
  {
    time: "09:00",
    name: "Azul",
    trip: "Two-tank boat dive",
    booked: 10,
    capacity: 12,
    flags: [],
  },
  {
    time: "11:30",
    name: "Harbour rib",
    trip: "Discover Scuba",
    booked: 4,
    capacity: 6,
    flags: ["Check-in"],
  },
];

export const outstanding = [
  {
    name: "Tom Becker",
    boat: "Rib Norte · 08:30",
    issue: "Certification missing",
    flag: "Check-in" as const,
  },
  {
    name: "Elena Costa",
    boat: "Rib Norte · 08:30",
    issue: "Medical declaration needs review",
    flag: "Medical review" as const,
  },
  {
    name: "Noah Pinto",
    boat: "Harbour rib · 11:30",
    issue: "Guest details not started",
    flag: "Check-in" as const,
  },
];

export const nextCourse = {
  name: "Open Water Diver",
  when: "Tuesday 24 November · 13:00",
  instructor: "Ana Ribeiro",
  enrolled: 3,
  capacity: 4,
  note: "Pool session. One space left.",
};

export const checkInGuests = [
  {
    name: "Maria Santos",
    boat: "Azul · 09:00",
    details: "Complete",
    certification: "PADI Open Water on file",
    equipment: "BCD and regulator to hire · own 5 mm · 6 kg",
    forms: "Complete",
    flag: null,
  },
  {
    name: "Tom Becker",
    boat: "Rib Norte · 08:30",
    details: "Complete",
    certification: "Missing",
    equipment: "Not started",
    forms: "Waiting",
    flag: "Check-in" as const,
  },
  {
    name: "Elena Costa",
    boat: "Rib Norte · 08:30",
    details: "Complete",
    certification: "On file",
    equipment: "Own kit",
    forms: "Declaration needs review",
    flag: "Medical review" as const,
  },
];

export const rota = [
  {
    day: "Mon 23",
    title: "Boats alongside",
    detail: "Paulo Nunes on deck and fills. No courses.",
  },
  {
    day: "Tue 24",
    title: "Open Water · pool",
    detail: "Ana Ribeiro · 13:00–17:00 · 3 of 4 enrolled.",
  },
  {
    day: "Wed 25",
    title: "Advanced Open Water",
    detail: "Rui Mendes · Azul 09:00 · 2 of 4 enrolled.",
  },
  {
    day: "Thu 26",
    title: "Discover Scuba",
    detail: "Harbour rib 11:30 · 4 of 6 booked · instructor not assigned.",
  },
];

export const suggestion =
  "Assign Sofia Almeida to Thursday Discover Scuba only if a fifth guest books. She is free from 10:00, and the rib still has space. A member of staff reviews this before the rota is confirmed.";

export const lowSeason = [
  {
    name: "James Hale",
    detail: "Group of 6 · July · a week of diving",
    quote: "Quote draft €4,200",
    follow: "Follow up Friday 27 Nov",
    status: "Quote to send",
  },
  {
    name: "Clara Nunes",
    detail: "Returning diver · refresher in April",
    quote: "Quote €95",
    follow: "Follow-up sent",
    status: "Waiting",
  },
  {
    name: "North Sea Club",
    detail: "14 divers · September · dates not fixed",
    quote: "No quote yet",
    follow: "Follow up Monday",
    status: "New enquiry",
  },
];

export const services = [
  "Upholstery cleaning",
  "Rug cleaning",
  "Mattress cleaning",
  "Curtains",
];
