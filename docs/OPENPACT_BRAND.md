# OpenPact: Brand Guidelines

> "Your agents made a pact. The daemon is running."

---

## Brand personality

OpenPact has a devilish edge. The name plays on two meanings: a "pact" as in a binding agreement between agents, and a "pact" as in a deal with the devil. The software runs as a "daemon" on your machine. We lean into this. The brand is knowing, a little dangerous, and never corporate.

**Tone:** Sharp, confident, slightly mischievous. We're building serious infrastructure but we don't take ourselves too seriously. Think of a developer who knows something you don't and is about to show you.

**We are:** Bold, technical, open, irreverent, trustworthy under the hood.

**We are not:** Cute, corporate, preachy, Web3-bro, or trying too hard.

---

## Logo

### The eye

The OpenPact logo is a glowing slit-pupil eye flanked by two horns, with three connected agent nodes beneath it. It is the daemon watching over the shared memory. It sees everything the agents contribute and it keeps the pact.

The horns establish the devilish theme immediately. The slit pupil gives it an inhuman, watchful quality. The red glow radiating from the eye suggests something alive and always on. The three small dots below are the agents, connected in a triangle, feeding into the eye above.

**Files:**
- `openpact-logo.svg` (vector source, scalable)
- `openpact-logo-1024.png` (high-res, marketing, social banners)
- `openpact-logo-512.png` (GitHub avatar, npm avatar)
- `openpact-logo-256.png` (app icon)
- `openpact-logo-128.png` (documentation, in-app)
- `openpact-logo-64.png` (small icons)
- `openpact-logo-32.png` (favicon)

### Usage rules

- Always place on a dark background (#0F0A0A or close to it)
- Minimum size: 32px (below that, use the 32px pre-rendered PNG)
- Do not rotate, stretch, recolour, or add effects
- Do not place on busy backgrounds or photographs
- Clear space: leave at least 40% of the logo width on all sides
- The logo should always feel like it's emerging from darkness, not sitting on a surface

---

## Colour palette

### Primary reds

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| **Hellfire** | `#EF4444` | 239, 68, 68 | Primary brand colour. Buttons, links, key highlights |
| **Ember** | `#DC2626` | 220, 38, 38 | Hover states, logo fill, active elements |
| **Brimstone** | `#B91C1C` | 185, 28, 28 | Deep accent. Borders, secondary fills |
| **Inferno** | `#991B1B` | 153, 27, 27 | Dark red. Text on light-red backgrounds |
| **Charred** | `#7F1D1D` | 127, 29, 29 | Darkest red. Subtle tints, deep shadows |

### Backgrounds

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| **Abyss** | `#0F0A0A` | 15, 10, 10 | Primary background. App shell, hero sections |
| **Void** | `#1A1214` | 26, 18, 20 | Secondary background. Cards, panels |
| **Smoke** | `#2A1F22` | 42, 31, 34 | Tertiary. Elevated surfaces, input fields |
| **Ash** | `#3D2F32` | 61, 47, 50 | Borders, dividers, subtle separators |

### Light accents

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| **Blush** | `#FEE2E2` | 254, 226, 226 | Primary text on dark backgrounds |
| **Glow** | `#FECACA` | 254, 202, 202 | Bright highlights, logo centres |
| **Pale** | `#FCA5A5` | 252, 165, 165 | Secondary text, muted elements |
| **Spark** | `#F87171` | 248, 113, 113 | Bright accents, notifications, badges |

### Semantic colours

| Name | Hex | Usage |
|------|-----|-------|
| **Success** | `#22C55E` | Connected, complete, healthy |
| **Warning** | `#EAB308` | Claimed, pending, caution |
| **Error** | `#EF4444` | Same as Hellfire (intentional) |

### Colour rules

- The dashboard ships **both light and dark themes** with a system-default switcher. Light theme is the polished workspace palette (paper / canvas / mist surfaces, ink text, purple / teal / coral / amber accents) used in `docs/mockups/`. Dark theme is the brand palette (Abyss / Void / Smoke surfaces, Blush text, Hellfire / Ember reds). Each surfaces a different mood: light for daytime focused work, dark for the daemon-watching-over-you vibe.
- The CLI is **dark-only**. The terminal is the daemon's voice; the red still glows against the abyss.
- In the dark theme, never use pure white (#FFFFFF) for body text. Use Blush (#FEE2E2). Reserve white for the brightest highlights only (logo eye centre, active indicators).
- In the light theme, use Ink (#1A1A1A) for primary text. Reserve pure black for nothing — even logo strokes go #1A1A1A on light surfaces.
- For documentation on external platforms (GitHub README, npm page), match the dark theme where possible. Where you can't control the background, the red still works on white, just use Ember (#DC2626) or Brimstone (#B91C1C) instead of Hellfire for contrast.

### Logo on each theme

- **Dark theme:** `openpact-logo.svg` (the canonical eye + horns, designed for `#0F0A0A` Abyss).
- **Light theme:** `openpact-logo-light.svg` (the same mark inverted for use on `#F7F7F5` Canvas).
- The dashboard switches between the two automatically based on the active theme.

---

## Typography

### Primary: Inter

| Style | Weight | Size | Tracking | Usage |
|-------|--------|------|----------|-------|
| H1 | 600 | 22px | -0.5px | Page titles |
| H2 | 600 | 18px | -0.3px | Section headers |
| H3 | 500 | 15px | -0.2px | Card titles, panel headers |
| Body | 400 | 14px | 0 | Paragraphs, descriptions |
| Small | 400 | 12px | 0 | Metadata, timestamps |
| Tiny | 500 | 11px | 0.2px | Badges, labels, tags |

### Monospace: JetBrains Mono or SF Mono

| Style | Weight | Size | Usage |
|-------|--------|------|-------|
| Code | 400 | 13px | Inline code, entry IDs, CLI output |
| Code block | 400 | 13px | Multi-line code blocks |

### Typography rules

- Headings use negative letter-spacing for a tighter, more confident feel
- Body text at line-height: 1.6
- Primary text: Blush (#FEE2E2)
- Secondary text: Pale (#FCA5A5)
- Tertiary/muted text: a muted red-grey around #6B5555
- Code and technical identifiers: Glow (#FECACA) on Void background

---

## Component styling

### Cards

```css
background: #1A1214;
border: 0.5px solid rgba(239, 68, 68, 0.12);
border-radius: 12px;
padding: 18px 20px;
transition: border-color 0.12s;
```

Hover: `border-color: rgba(239, 68, 68, 0.25)`

### Buttons

```css
/* Primary */
background: #DC2626;
color: #FEE2E2;
border: none;
border-radius: 8px;
padding: 8px 16px;
font-weight: 500;

/* Primary hover */
background: #EF4444;

/* Secondary */
background: transparent;
color: #FCA5A5;
border: 0.5px solid rgba(239, 68, 68, 0.2);

/* Secondary hover */
border-color: rgba(239, 68, 68, 0.4);
color: #FEE2E2;
```

### Badges

```css
/* Online/success */
background: rgba(34, 197, 94, 0.12);
color: #22C55E;

/* Claimed/pending */
background: rgba(234, 179, 8, 0.12);
color: #EAB308;

/* New/highlight */
background: rgba(239, 68, 68, 0.15);
color: #FCA5A5;

/* Offline/muted */
background: rgba(255, 255, 255, 0.05);
color: #6B5555;
```

### Inputs

```css
background: #1A1214;
border: 0.5px solid rgba(239, 68, 68, 0.12);
border-radius: 8px;
color: #FEE2E2;
padding: 9px 14px;
font-size: 13px;

/* Focus */
border-color: #EF4444;
```

---

## Voice and copy

### CLI messages

The CLI has personality. The daemon is alive.

```
$ openpact init

  The pact is sealed. Your daemon awaits.
  
  Next: openpact start
  Then: openpact invite (to summon others)

$ openpact start

  Daemon awakened on localhost:7666
  Listening for peers in the dark...

$ openpact status

  Pact: bristle-fox-a7f2
  Peers: 4 souls bound, 1 wandering
  Entries: 847 memories
  View: synced (confirmed at #812)

$ openpact invite

  Share this to bind another agent:
  op://a7f2d...

$ openpact join <key>

  Joining the pact...
  Syncing 847 entries from 4 peers...
  Bound. Your agent is now part of the pact.
```

### Error messages

```
  The daemon is already running. (PID 4221)
  Only one daemon per soul.

  No peers found. The void is empty.
  Have the others started their daemons?

  Entry rejected: payload too large (max 1MB).
  The shared memory is not a dumping ground.
```

### Documentation tone

Clear and direct, with personality in the right places. Don't force it into API reference docs. Let it come through in the README, the getting-started guide, and the CLI.

Good: "Run `openpact start` to wake the daemon."
Bad: "Execute the `openpact start` command to initialise the background process."
Too much: "UNLEASH THE DAEMON FROM ITS SLUMBER."

---

## Social and profiles

- **GitHub avatar:** openpact-logo-512.png
- **npm avatar:** openpact-logo-512.png
- **Favicon:** openpact-logo-32.png
- **Twitter/X:** openpact-logo-512.png, bio: "P2P shared memory for software agents. The daemon is running."
- **Discord:** server name "OpenPact", icon openpact-logo-512.png

---

## The vibe, in summary

OpenPact looks like a tool built by someone who reads too much fantasy fiction and writes very clean code. It is dark, red, watchful, and extremely well-engineered underneath. The eye sees everything your agents share. The daemon never sleeps.
