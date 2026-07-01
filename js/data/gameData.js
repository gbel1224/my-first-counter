/* ============================================================
   Static game data: name pools, countries, avatars, traits.
   Kept separate so content can grow without touching logic.
   ============================================================ */

export const FIRST_NAMES = {
  male: ["James", "Liam", "Noah", "Ethan", "Mason", "Leo", "Kai", "Marcus",
         "Diego", "Omar", "Hiro", "Andre", "Victor", "Sam", "Theo", "Elias"],
  female: ["Olivia", "Emma", "Ava", "Sofia", "Maya", "Zoe", "Nadia", "Lena",
           "Aria", "Chloe", "Isla", "Yuki", "Amara", "Ruby", "Nora", "Ivy"],
  neutral: ["Alex", "Jordan", "Riley", "Sky", "Casey", "Rowan", "Quinn",
            "Sage", "Remy", "Nico", "Ari", "Charlie", "Frankie", "Jamie"],
};

export const LAST_NAMES = [
  "Carter", "Rivera", "Chen", "Novak", "Silva", "Okafor", "Kim", "Hassan",
  "Bennett", "Moretti", "Larsen", "Reyes", "Walsh", "Petrov", "Nakamura",
  "Dubois", "Fischer", "Costa", "Adeyemi", "Blackwood", "Sterling", "Vance",
];

export const COUNTRIES = [
  { code: "US", name: "United States", flag: "🇺🇸", currency: "$", wealth: 1.0 },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧", currency: "£", wealth: 1.0 },
  { code: "CA", name: "Canada",         flag: "🇨🇦", currency: "$", wealth: 0.95 },
  { code: "JP", name: "Japan",          flag: "🇯🇵", currency: "¥", wealth: 0.9 },
  { code: "DE", name: "Germany",        flag: "🇩🇪", currency: "€", wealth: 0.98 },
  { code: "BR", name: "Brazil",         flag: "🇧🇷", currency: "R$", wealth: 0.7 },
  { code: "NG", name: "Nigeria",        flag: "🇳🇬", currency: "₦", wealth: 0.55 },
  { code: "IN", name: "India",          flag: "🇮🇳", currency: "₹", wealth: 0.6 },
  { code: "AU", name: "Australia",      flag: "🇦🇺", currency: "$", wealth: 1.0 },
  { code: "MX", name: "Mexico",         flag: "🇲🇽", currency: "$", wealth: 0.72 },
];

/* Baby avatars shown at birth; the player picks a look for later life. */
export const AVATARS = ["👶", "🧒", "👦", "👧", "🧑", "👨", "👩", "🧑‍🦱",
                        "👨‍🦰", "👩‍🦰", "🧑‍🦳", "👨‍🦱", "👩‍🦱", "🧔"];

/* Starting family backgrounds influence money + a stat lean. */
export const BACKGROUNDS = [
  {
    id: "humble",
    name: "Humble Beginnings",
    icon: "🏚️",
    desc: "Born into a poor family. Little money, but plenty of grit.",
    startMoney: 0,
    statMods: { health: 0, happiness: -3, smarts: 2, looks: 0 },
  },
  {
    id: "working",
    name: "Working Class",
    icon: "🏠",
    desc: "A steady, ordinary household. A fair and balanced start.",
    startMoney: 250,
    statMods: { health: 2, happiness: 2, smarts: 0, looks: 0 },
  },
  {
    id: "comfortable",
    name: "Comfortable",
    icon: "🏡",
    desc: "Money was never tight. A supportive, stable home.",
    startMoney: 1500,
    statMods: { health: 3, happiness: 4, smarts: 2, looks: 2 },
  },
  {
    id: "wealthy",
    name: "Wealthy Family",
    icon: "🏰",
    desc: "Born with a silver spoon. Every door is already open.",
    startMoney: 10000,
    statMods: { health: 4, happiness: 6, smarts: 4, looks: 4 },
  },
];

/* Traits give small flavor + future gameplay hooks. Max 2 at creation. */
export const TRAITS = [
  { id: "athletic",  name: "Athletic",   icon: "🏃", desc: "+Health, ages slower physically." },
  { id: "genius",    name: "Genius",     icon: "🧠", desc: "+Smarts, learns faster." },
  { id: "charming",  name: "Charming",   icon: "😎", desc: "+Looks, better with people." },
  { id: "optimist",  name: "Optimist",   icon: "☀️", desc: "+Happiness, recovers from setbacks." },
  { id: "resilient", name: "Resilient",  icon: "🛡️", desc: "Bad events hit softer." },
  { id: "lucky",     name: "Lucky",      icon: "🍀", desc: "Good events happen more often." },
];

export const STAT_META = [
  { key: "health",    label: "Health",    icon: "❤️" },
  { key: "happiness", label: "Happiness", icon: "😊" },
  { key: "smarts",    label: "Smarts",    icon: "🧠" },
  { key: "looks",     label: "Looks",     icon: "✨" },
];

/* Random life events keyed by age band. Each may nudge stats/money. */
export const LIFE_EVENTS = [
  { minAge: 1, maxAge: 5,  type: "event", text: "You took your first steps! Your family cheered.", stats: { happiness: 3 } },
  { minAge: 1, maxAge: 5,  type: "good",  text: "You learned to read early.", stats: { smarts: 4 } },
  { minAge: 2, maxAge: 6,  type: "bad",   text: "You caught a nasty cold and stayed home.", stats: { health: -4 } },
  { minAge: 5, maxAge: 12, type: "good",  text: "You won a school spelling bee.", stats: { smarts: 5, happiness: 3 } },
  { minAge: 6, maxAge: 13, type: "event", text: "You made a new best friend.", stats: { happiness: 6 } },
  { minAge: 6, maxAge: 14, type: "bad",   text: "You broke your arm falling off a bike.", stats: { health: -8, happiness: -3 } },
  { minAge: 8, maxAge: 15, type: "good",  text: "You joined a sports team and got fitter.", stats: { health: 6, looks: 2 } },
  { minAge: 10, maxAge: 17, type: "event", text: "You found a $20 bill on the sidewalk.", money: 20 },
  { minAge: 12, maxAge: 18, type: "bad",  text: "You got into an argument with a friend.", stats: { happiness: -5 } },
  { minAge: 13, maxAge: 19, type: "good", text: "You started working out and look great.", stats: { looks: 6, health: 3 } },
  { minAge: 14, maxAge: 20, type: "event", text: "You picked up a new hobby you love.", stats: { happiness: 5, smarts: 2 } },
  { minAge: 16, maxAge: 22, type: "good", text: "A small side gig earned you some cash.", money: 120, stats: { happiness: 2 } },
];

/* ---------- Education ---------- */

/* Credential ranks used to gate jobs. Ordering matters. */
export const EDUCATION_RANK = { none: 0, highschool: 1, university: 2 };

export const EDUCATION_LABEL = {
  none: "No diploma",
  highschool: "High School Diploma",
  university: "University Degree",
};

export const UNIVERSITY = {
  years: 4,          // years to graduate
  tuitionPerYear: 8000,
  smartsPerYear: 5,  // studying makes you smarter
};

/* ---------- Jobs ----------
   tier: entry (no diploma) | skilled (needs HS) | professional (needs degree)
   pay is annual; applied on each Age Up while employed. */
export const JOBS = [
  // Entry level — no diploma required
  { id: "babysitter",   title: "Babysitter",        icon: "🧸", tier: "entry", minAge: 14, edu: "none",       smarts: 0,  pay: 12000 },
  { id: "fastfood",     title: "Fast Food Worker",  icon: "🍔", tier: "entry", minAge: 16, edu: "none",       smarts: 0,  pay: 19000 },
  { id: "grocery",      title: "Grocery Clerk",     icon: "🛒", tier: "entry", minAge: 16, edu: "none",       smarts: 0,  pay: 22000 },
  { id: "delivery",     title: "Delivery Driver",   icon: "🚚", tier: "entry", minAge: 18, edu: "none",       smarts: 10, pay: 28000 },

  // Skilled — high school diploma
  { id: "office",       title: "Office Assistant",  icon: "🗂️", tier: "skilled", minAge: 18, edu: "highschool", smarts: 35, pay: 36000 },
  { id: "retailmgr",    title: "Retail Manager",    icon: "🏬", tier: "skilled", minAge: 20, edu: "highschool", smarts: 40, pay: 45000 },
  { id: "electrician",  title: "Electrician",       icon: "🔌", tier: "skilled", minAge: 20, edu: "highschool", smarts: 45, pay: 52000 },
  { id: "police",       title: "Police Officer",    icon: "👮", tier: "skilled", minAge: 21, edu: "highschool", smarts: 45, pay: 58000 },

  // Professional — university degree
  { id: "teacher",      title: "Teacher",           icon: "🍎", tier: "professional", minAge: 22, edu: "university", smarts: 55, pay: 54000 },
  { id: "accountant",   title: "Accountant",        icon: "📊", tier: "professional", minAge: 22, edu: "university", smarts: 60, pay: 68000 },
  { id: "developer",    title: "Software Developer",icon: "💻", tier: "professional", minAge: 22, edu: "university", smarts: 65, pay: 92000 },
  { id: "lawyer",       title: "Lawyer",            icon: "⚖️", tier: "professional", minAge: 24, edu: "university", smarts: 75, pay: 125000 },
  { id: "doctor",       title: "Doctor",            icon: "🩺", tier: "professional", minAge: 26, edu: "university", smarts: 82, pay: 175000 },
];

export const TIER_LABEL = {
  entry: "Entry level",
  skilled: "Requires High School",
  professional: "Requires Degree",
};
