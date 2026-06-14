// All player-visible text for Palm City. Switching language = swapping this file.
export const STR = {
  title: "PALM CITY",
  tagline: "Roll into town broke. Leave your name on the skyline.",
  introBlurb: "An open-world story: run jobs, drive the streets, and buy up the city one business at a time.",
  controlsHint: "Touch: left side = move stick, buttons = act.  Keyboard: WASD/arrows, E = car, B = buy, Enter = talk.  Gamepad supported.",
  start: "START",
  continueGame: "CONTINUE",
  newGame: "NEW GAME",
  confirmReset: "Start over and erase your saved city?",
  noWebgl: "This device can't run 3D (WebGL unavailable). Try another browser.",
  loading: "Building the city…",

  money: m => "$" + m.toLocaleString("en-US"),
  incomeRate: r => "+$" + r + "/min",
  distance: d => Math.round(d) + "m",
  reward: r => "+$" + r,
  needMore: d => "You need $" + d.toLocaleString("en-US") + " more",
  purchased: name => "You now own " + name + "!",
  sideUnlock: "Depot side jobs unlocked — grab a package any time",
  sideJobGo: "Deliver the depot package",
  sideJobAt: "Side job: pick up a package at the depot",
  sideJobDone: "Package delivered",
  saved: "Progress saved",
  freeplay: "Your city. Cruise, collect, and keep building.",
  missionTag: n => "Chapter " + n,
  tapToContinue: "tap to continue",

  btnDrive: "DRIVE",
  btnExit: "EXIT",
  btnBuy: (name, cost) => "BUY · $" + cost.toLocaleString("en-US"),
  btnUpgrade: (lvl, cost) => "UPGRADE Lv" + lvl + " · $" + cost.toLocaleString("en-US"),
  btnSprint: "SPRINT",
  btnHorn: "HORN",
  btnBuyCar: (name, cost) => "BUY " + name + " · $" + cost.toLocaleString("en-US"),
  btnRepaint: "REPAINT",

  upgraded: (name, lvl) => name + " is now Lv" + lvl + "!",
  tips: a => "+$" + a + " tips collected",
  raceTimer: s => "⏱ " + s + "s",
  raceFail: "Too slow! Back to the start line…",

  palmCount: (n, t) => "🌴 " + n + "/" + t,
  palmGot: r => "Golden Palm! +$" + r,
  palmsAll: r => "All 12 Golden Palms! Bonus +$" + r.toLocaleString("en-US"),
  wantedToast: n => "Wanted! " + "★".repeat(n),
  wantedClear: "You lost the cops",
  busted: f => "BUSTED! Fine $" + f.toLocaleString("en-US"),
  jump: b => "SWEET JUMP! +$" + b,

  forSale: cost => "FOR SALE · $" + cost.toLocaleString("en-US"),
  ownedLabel: (lvl, perMin) => "Lv" + lvl + " · +$" + perMin + "/min",

  garageName: "CITY GARAGE",
  carForSale: (name, cost) => name + " · $" + cost.toLocaleString("en-US"),
  carBought: name => "New ride! " + name + " is yours",
  repaintTitle: name => "Repaint your " + name,
  repaintDone: "Fresh coat of paint!",
  garageDone: "DONE",
  garageBuy: cost => "BUY · $" + cost.toLocaleString("en-US"),
  garageSpeed: "Top speed",
  garageAccel: "Accel",
  garageHandling: "Handling",
  pcars: {
    coral:    { name: "Coral Cruiser", perk: "Showtime — +50% stunt jump cash" },
    azure:    { name: "Azure Sport",   perk: "Slippery — shakes police heat fast" },
    sterling: { name: "Sterling GT",   perk: "Connected — bust fines cut in half" },
  },

  biz: {
    dogs:   { name: "Sunny Dogs cart" },
    wash:   { name: "Marina Car Wash" },
    burger: { name: "Big Bun Burgers" },
    club:   { name: "Neon Palms Club" },
    taxi:   { name: "Palm Taxi Co." },
    marina: { name: "Bayside Marina" },
  },
  depotName: "DEPOT",
  pizzaName: "PRONTO PIZZA",

  who: { marco: "Marco", rosa: "Rosa", vince: "Vince Sterling", narrator: "Palm City", you: "You" },

  missions: [
    {
      title: "Fresh Off the Bus",
      intro: [
        ["narrator", "Palm City. Population: one more, as of right now."],
        ["marco", "Cuz! You made it! I'm at the plaza fountain — come find me."],
      ],
      steps: ["Walk to Marco at the plaza fountain"],
      outro: [
        ["marco", "Look at you — broke, hungry, and still smiling. I like it."],
        ["marco", "Here's a little walking-around money. Let's get you earning."],
      ],
    },
    {
      title: "Pizza Run",
      intro: [
        ["marco", "Tony at Pronto Pizza owes me a favor. Grab his delivery bag — easy money."],
      ],
      steps: ["Pick up the pizzas at Pronto Pizza", "Deliver the pizzas to the apartment"],
      outro: [
        ["marco", "Tony says you hustle. Told you — this city pays people who move."],
      ],
    },
    {
      title: "Learner Plates",
      intro: [
        ["marco", "Time to graduate from sneakers. My old hatchback is parked by the plaza."],
        ["marco", "Take it to the depot on the west side. Don't scratch her. She's family."],
      ],
      steps: ["Get into the car", "Drive to the depot"],
      outro: [
        ["marco", "She rattles, but she rolls. You know what? Keep her."],
      ],
    },
    {
      title: "Rosa's Ride",
      intro: [
        ["marco", "My friend Rosa needs a lift from the east side. Be nice — she tips."],
      ],
      steps: ["Pick up Rosa on the east side", "Drive Rosa to her studio uptown"],
      outro: [
        ["rosa", "Smooth driving! Marco said you were trouble. He lied."],
      ],
    },
    {
      title: "Courier King",
      intro: [
        ["marco", "Depot's slammed — three packages, three corners of the city."],
        ["marco", "Show me that hustle and the depot keeps you on the payroll."],
      ],
      steps: [
        "Deliver package 1 of 3 — southeast",
        "Deliver package 2 of 3 — northwest… other corner!",
        "Deliver package 3 of 3 — north side",
      ],
      outro: [
        ["marco", "Three for three! Officially the fastest wheels in Palm City."],
      ],
    },
    {
      title: "Open for Business",
      intro: [
        ["marco", "You've got cash burning a hole in your pocket."],
        ["marco", "The hot dog cart at the plaza is for sale. Stop earning money — start OWNING it."],
      ],
      steps: ["Buy the Sunny Dogs cart at the plaza"],
      outro: [
        ["marco", "A business owner! Pop always said: own something and it earns while you sleep."],
      ],
    },
    {
      title: "Suds & Money",
      intro: [
        ["marco", "Dream bigger, cuz. The car wash on the west side is up for grabs."],
        ["marco", "Save up $2,000 — your cart's income will help."],
      ],
      steps: ["Save up $2,000", "Buy the Marina Car Wash"],
      outro: [
        ["rosa", "Half this city washes their car twice a week. You're going to be rich."],
      ],
    },
    {
      title: "City Tycoon",
      intro: [
        ["marco", "Last stretch, tycoon. Big Bun Burgers and the Neon Palms club are both for sale."],
        ["marco", "Own the whole skyline. Make this city yours."],
      ],
      steps: ["Buy Big Bun Burgers — east side", "Buy the Neon Palms club — northeast corner"],
      outro: [
        ["marco", "From the bus stop to the skyline. Palm City is YOURS, cuz!"],
        ["narrator", "You built it all. The city keeps earning — and the streets are yours to roam."],
      ],
    },
    {
      title: "An Offer You Can Refuse",
      intro: [
        ["narrator", "Word travels fast when somebody buys half a city."],
        ["vince", "(phone) You don't know me, but I know your little empire. Plaza fountain. Now."],
      ],
      steps: ["Meet Vince Sterling at the plaza"],
      outro: [
        ["vince", "Vince Sterling. I owned this town's money — until you showed up."],
        ["vince", "Sell me everything. Triple what you paid. Last offer, hotshot."],
        ["you", "Palm City isn't for sale."],
        ["vince", "Cute. Then I'll just take your customers instead."],
      ],
    },
    {
      title: "Hostile Takeover",
      intro: [
        ["marco", "Cuz, it's bad — Sterling parked his trucks outside everything you own. Income's bleeding!"],
        ["marco", "Get out there and rally your crews. Show your face at every business you've got."],
      ],
      steps: [
        "Rally the crew at Sunny Dogs",
        "Rally the crew at the Marina Car Wash",
        "Rally the crew at Big Bun Burgers",
        "Rally the crew at the Neon Palms club",
      ],
      outro: [
        ["marco", "THAT'S how you hold a city. Your crews would walk through fire for you now."],
        ["narrator", "Loyalty earned: your businesses permanently earn 10% more."],
      ],
    },
    {
      title: "Rosa's Big Break",
      intro: [
        ["rosa", "(phone) Hey, superstar. My art show opens tonight and my van just died. Be my driver?"],
        ["marco", "Take care of her, cuz. And ask her about running the Neon Palms — she's got the eye."],
      ],
      steps: [
        "Pick up Rosa at her studio uptown",
        "Drive Rosa to the gallery downtown",
        "Rush her prints from the print shop — west side",
        "Back to the gallery before the doors open!",
      ],
      outro: [
        ["rosa", "You're a lifesaver! And tell Marco… yes. I'll run the club. Partners?"],
        ["narrator", "Rosa now manages the Neon Palms. Club income +25%."],
      ],
    },
    {
      title: "The Palm City Grand Race",
      intro: [
        ["vince", "(phone) One last play, hotshot. A race — my circuit, right now, pride on the line."],
        ["vince", "Beat the clock around the city and Palm City never hears from me again."],
        ["marco", "His record around that circuit is a minute forty. Smoke him, cuz."],
      ],
      steps: [
        "Get to the start line — northwest crossing",
        "Checkpoint 1 of 4 — northeast corner",
        "Checkpoint 2 of 4 — southeast corner",
        "Checkpoint 3 of 4 — park crossing, west",
        "Checkpoint 4 of 4 — old plaza corner",
        "Finish line — city center crossing!",
      ],
      outro: [
        ["vince", "…Nobody beats that time. Nobody. The city's yours, kid. I'm out."],
        ["marco", "From the bus stop to KING of Palm City! Pop would be proud."],
        ["narrator", "You've won it all. The city keeps earning — and the streets are forever yours."],
      ],
    },
  ],
};
