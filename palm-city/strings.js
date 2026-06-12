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

  forSale: cost => "FOR SALE · $" + cost.toLocaleString("en-US"),
  ownedLabel: rate => "OWNED · +$" + rate + "/min",

  biz: {
    dogs:   { name: "Sunny Dogs cart" },
    wash:   { name: "Marina Car Wash" },
    burger: { name: "Big Bun Burgers" },
    club:   { name: "Neon Palms Club" },
  },
  depotName: "DEPOT",
  pizzaName: "PRONTO PIZZA",

  who: { marco: "Marco", rosa: "Rosa", narrator: "Palm City", you: "You" },

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
  ],
};
