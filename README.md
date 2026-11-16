# ⚜ Dynasty Chronicle

A free, private, interactive family tree with the look and feel of a medieval royal dynasty: aged parchment, heraldic crests, gold and crimson, serif type and wax seals.

Everything runs in your browser and is saved locally (IndexedDB). There are no accounts and no server, and nothing leaves your device unless you export it.

## Features

### The canvas
- **Smooth pan, zoom and pinch** on a family *graph* layout. Remarriages, half-siblings, adoptions and in-law families are placed without overlaps.
- **Semantic zoom.** Close up you see full portrait cards. Further out each card shows a crest and name. From afar every person becomes a block of their House's colour.
- **Views:** Family, Ancestors (pedigree), Descendants, and a radial **Fan chart**.
- **Seat on the throne** re-centres the tree on anyone. **Fold** ancestors or descendants of any person.
- **Minimap** drawn as an antique scroll, plus **search** that flies the view to the person (`/` or `Ctrl+K`).

### Effortless lineage building
- **Quick-add ring.** Click anyone and wax-seal buttons appear for **+ Father, + Mother, + Spouse, + Sibling, + Child**. One small form, then Enter.
- Add a relative as **unknown** to keep the structure right and fill it in later. You can also **link an existing person**.
- **Keyboard-first:** `P` `M` `S` `C` `B` add relatives, arrow keys walk the tree, `Enter` opens the dossier.
- **Scribe's Dictation** adds a whole family in one go:
  ```
  spouse: Alys Varden (1880) m. 1902
  children: Tom (1903), Rose (F, 1905), Hal (b. 1909, d. 1944)
  ```
- **Lineage inference.** A new spouse becomes the other parent of existing children. Siblings without known parents share an "unknown parent" slot.

### Rich person dossier
- Portrait, a biography with an illuminated drop cap, titles and epithets ("*the Builder*"), alternate names.
- **Life events** with **evidence seals**: Verified, Probable or Legend. Each seal can carry its own source.
- **Disputed facts.** Conflicting records sit side by side.
- **Gallery** of images and **audio recordings** (oral histories).
- External links and **social media handles**.
- **Kin** tab to edit parents, unions (married, divorced, widowed…), children (birth, adopted, step, foster) and siblings (half/full).

### Heraldry engine
- Every House gets **procedurally generated arms** that obey the *rule of tincture* (the heraldic rule against metal on metal or colour on colour).
- A full **arms designer**: divisions, tinctures, ordinaries and charges, with a live formal **blazon** (e.g. *"Azure, a chevron Or between three towers Argent"*).
- **Inheritance.** Sons bear their father's arms with traditional **cadency marks** (a label, crescent, mullet and so on), and daughters bear them on a **lozenge**.

### Storytelling and insight
- **Golden Thread** — pick two people to see the exact relationship ("*1st cousin 4 times removed*", "*sister-in-law*"), with the connecting path glowing on the tree.
- **Time scrubber** — drag through the centuries and watch who was alive in each year.
- **Sagas** are guided tours: chapters that fly the camera from person to person with captions.
- **Book of the House** — a generated illuminated chronicle, one chapter per generation. You can print it or save it as PDF.
- **Hall of Records** shows the longest-lived, the largest families, lifespan by century and recurring names.
- **Fog of War** measures how much of your ancestry is still undiscovered. Gaps appear as mist on the tree.
- **Herald's Warnings** flag impossible or unlikely data (a mother aged 9, a birth after a parent's death, someone listed as their own ancestor) and possible **duplicates**, which you can merge.
- **Heirlooms** records the chain of custody for rings, swords, bibles and other objects.
- **On this day** lists anniversaries from your tree.

### Privacy and data
- **Public view** seals living people (initials only, no dates or socials), for screenshots and sharing.
- **GEDCOM 5.5.1 import and export** works with Ancestry, FamilySearch, MyHeritage, Gramps and others. Exports can optionally redact the living.
- **Full JSON backup** keeps everything: portraits, arms and sagas.
- **Undo/redo** and **the Annals**, a history of every change.
- **Candlelight** dark mode and a **Clear Ledger** low-ornament mode.

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests: dates, relationships, layout, GEDCOM, heraldry
npm run build      # static site in dist/
```

The build is a static site, so it can be hosted for free on GitHub Pages, Netlify, Cloudflare Pages or any static host. A GitHub Pages workflow is included in `.github/workflows/deploy.yml`.

## Keyboard

| Key | Action |
| --- | --- |
| `P` / `M` / `S` / `C` / `B` | Add father / mother / spouse / child / sibling |
| Arrows | Walk the tree |
| `Enter` | Open the dossier |
| `F` / `H` | Seat on the throne / return home |
| `G` | Golden Thread |
| `T` | Time scrubber |
| `/`, `Ctrl+K` | Search |
| `0` | Fit the whole tree |
| `[` / `]` | Fold ancestors / descendants |
| `Ctrl+Z` / `Ctrl+Y` | Undo / redo |

## Architecture

- **React 18 + TypeScript + Vite**, with **zustand** and **immer** for state and undo history.
- `src/model/`: the data model (union-based, GEDCOM `FAM`-style), fuzzy dates, relationship maths, validation, heraldry, GEDCOM and dictation parsing.
- `src/layout/familyLayout.ts`: the family-graph layout. Partners form blocks, generations come from a BFS, and contour-based tidy-tree packing places in-law subtrees next to where they connect.
- `src/components/`: canvas, cards, dossier, panels, fan chart and the Book.

## Roadmap

These features need a backend and are not built yet:
- Roles (Sovereign, Steward, Scribe, Guest), with edit **petitions** and review
- **Claim your seat**: invite living relatives to maintain their own profiles
- Scoped share links
- An animated **migration map** (needs place geocoding)
- Historical-events overlay on timelines
- DNA match import

## License

MIT
