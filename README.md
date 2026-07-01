# Life Simulator

A long-term browser life-simulation game inspired by BitLife, The Sims, and
idle/business sims. Start with almost nothing and build a life — one year at a
time.

## Play

Because the game uses ES modules, it needs to be served over HTTP (opening the
file directly via `file://` will block the module imports).

```bash
# from the project root
python3 -m http.server 8000
# then open http://localhost:8000
```

Or just visit the GitHub Pages deployment.

## Current features

- **Start menu** with New Life / Continue and save detection.
- **Character Creator** — a guided 3-step flow:
  1. Identity — name (with randomizer), gender, avatar
  2. Origin — country of birth, family background
  3. Traits — pick up to 2 traits, then review
- **Life dashboard** — avatar, age, life stage, money, and four core stats
  (Health, Happiness, Smarts, Looks) shown as animated bars.
- **Age Up engine** — live year by year with passive stat drift and
  age-appropriate random life events; includes aging and mortality.
- **Save system** — versioned localStorage saves with autosave, a migration
  hook, and base64 export/import helpers.

## Project structure

```
index.html            App shell + three screens (start / create / game)
css/styles.css        Full dark UI theme
js/
  main.js             Entry point — wires menus, creator, dashboard, saves
  state.js            Game state + life engine (aging, events) — no DOM
  storage.js          Versioned save/load (localStorage)
  ui.js               Screen manager, toasts, dashboard rendering
  characterCreator.js Guided character creation flow
  data/gameData.js    Static content: names, countries, traits, events
```

## Roadmap

Planned systems, added one polished feature at a time: jobs, XP & levels,
skills, education, housing, cars, businesses, banking, credit score,
investments, the stock market, relationships, crime, fame, achievements,
NPCs, travel, pets, a fake internet + phone + social media, and multiplayer.
