# Kambio — image generation prompts

Copy-paste prompts for Gemini, ChatGPT / DALL·E, Midjourney or any other image
model, locked to the Kambio brand.

---

## Read this first

**There is no logo file.** Kambio's mark is a wordmark: the word `kambio` in
lowercase white, immediately followed by a full stop in brand green. Nothing
else — no icon, no symbol, no container shape.

**Do not ask an image model to draw it.** Text generation in image models is
unreliable: you will get `kambio` misspelled, kerned wrongly, or in the wrong
typeface, and you will not notice until it is on LinkedIn. Every prompt below
therefore asks for **artwork with empty space reserved for the wordmark**, which
you then place yourself in Canva, Figma or Keynote as live text.

Wordmark spec, for whatever tool you place it in:

| | |
|---|---|
| Text | `kambio.` all lowercase, including the full stop |
| Typeface | Inter, or any clean geometric sans — SF Pro, Helvetica Now, General Sans |
| Weight | Semibold (600) |
| Letter-spacing | Slightly tight, about −2% |
| `kambio` colour | `#E9EDF5` |
| `.` colour | `#3DDC97` |
| Clear space | At least the height of the "k" on every side |

---

## The palette — never substitute

| Role | Hex | Where it goes |
|---|---|---|
| Background | `#0A0C10` | The canvas. Near-black, very slightly blue. |
| Surface | `#12151C` | Cards, panels sitting on the background |
| Surface raised | `#171B24` | Headers and footers inside a card |
| Border | `#232936` | Every hairline. 1px, never heavier. |
| Text | `#E9EDF5` | Headlines and primary text |
| Muted text | `#8B93A7` | Secondary text, labels |
| **Brand green** | **`#3DDC97`** | Accents, ticks, the full stop. Sparingly. |
| Brand green dim | `#1FAA72` | Filled buttons |
| Amber | `#F5A623` | "Needs a human" states only |
| Red | `#F2545B` | Errors and blocked states only |

Green is an accent, not a theme. If more than roughly a tenth of the image is
green, it is wrong.

---

## The master prompt

Paste this at the top of **every** image request, then add one variant block
from the next section.

```
Create a 2D digital illustration for Kambio, a B2B software product for export
operations. Follow this art direction exactly.

PALETTE — use only these colours:
  background #0A0C10 (near-black, slightly blue)
  panels #12151C, raised panels #171B24
  hairline borders #232936, exactly 1px, never thicker
  primary text #E9EDF5, secondary text #8B93A7
  accent #3DDC97 (bright mint green) — accents only, under 10% of the image
  filled buttons #1FAA72
  amber #F5A623 and red #F2545B only for warning or error states

STYLE:
  Flat vector. Clean geometric shapes. Generous negative space.
  Dark-mode software UI aesthetic — the feel of a well-made developer tool.
  Rounded corners, 8 to 12px radius.
  Thin 1.5px line icons in the Lucide style: outlined, not filled, rounded caps.
  Subtle depth only: a faint green glow behind a focal element is fine.

FORBIDDEN:
  No photorealism. No 3D renders. No glossy or metallic surfaces.
  No gradient meshes, no neon cyberpunk, no purple or blue tech clichés.
  No stock-photo people, no handshakes, no globes with orbiting arcs.
  No circuit-board or "brain made of nodes" AI imagery.
  No drop shadows, no bevels, no glassmorphism.
  No lens flares, no particles, no swooshes.

TEXT:
  Render NO text, NO letters, NO numbers, NO logos anywhere in the image.
  Where text would go, leave clean empty space.
  (Any text is added afterwards in design software.)
```

---

## Variant blocks

Append one of these to the master prompt.

### 1. Hero / website banner — the copy-paste bridge

```
SUBJECT:
A wide horizontal composition. On the left, three small dark panels drift apart
at slight angles, disconnected — each a simplified message bubble outline in
#232936, unaligned and messy. On the right, one larger tidy panel with four
clean horizontal rows, neatly aligned, each row ending in a small mint-green
tick. Between the two sides, a single thin mint-green arrow shows the
transformation from scattered to structured.
Leave the upper-left quarter empty for a headline and wordmark.
Aspect ratio 16:9.
```

### 2. The shipment room — four parties, four views

```
SUBJECT:
A central rounded rectangle panel in #12151C, seen straight-on, representing one
shared workspace. Four thin lines radiate from it to four smaller panels at the
corners. Each corner panel shows a different number of visible document rows —
one shows four rows, one shows three, one shows two, one shows one — making
clear that each participant sees a different subset. Two of the connecting lines
are mint green; two are muted grey.
Centre the composition with breathing room on all sides.
Aspect ratio 1:1.
```

### 3. Extraction with provenance

```
SUBJECT:
Two stacked panels. The upper panel shows lines of monospaced-looking text
rendered as abstract grey bars of varying length, like a raw email. The lower
panel shows four tidy rows, each with a short label bar, a value bar, and a
small rounded pill at the right end. Three pills are mint green; the fourth is
amber, marking the one value a human still needs to check.
A thin mint-green downward arrow connects the two panels.
Aspect ratio 4:5, suited to a vertical social post.
```

### 4. Permission wall — who does not see what

```
SUBJECT:
A single tall panel divided into five horizontal rows. Each row has a document
icon on the left and four small circular indicators on the right. Some
indicators are filled mint green with a tick; others are muted grey with a
simple dash. The pattern of ticks and dashes differs on every row.
Strictly geometric and legible, like a permissions matrix.
Aspect ratio 3:4.
```

### 5. LinkedIn / social card background

```
SUBJECT:
A near-empty composition. A faint grid of #232936 hairlines across the lower
third, fading out toward the top. One small mint-green dot glows softly in the
lower-right area. Nothing else.
Deliberately minimal — this is a backdrop for text placed on top.
Leave the entire upper two-thirds clean and unobstructed.
Aspect ratio 1200x627.
```

### 6. Human-in-the-loop

```
SUBJECT:
A rounded panel showing a draft message as three grey text bars. Below it, two
buttons side by side: one filled mint green, one outlined in #232936. Above the
panel floats a small outlined shield icon with a tick inside, in mint green.
The composition should read as "written, waiting for approval".
Aspect ratio 16:9.
```

---

## After generating

1. **Check the palette.** Models drift toward teal, cyan and purple. Sample the
   greens — if they are not close to `#3DDC97`, regenerate rather than accept.
2. **Check for text.** If letters appear anywhere, regenerate. Do not try to fix
   garbled text by cropping.
3. **Place the wordmark yourself** using the spec at the top.
4. **Check contrast** if you overlay text: `#E9EDF5` on `#0A0C10` is strong, but
   `#8B93A7` on a busy area may fail accessibility. Keep body text on flat areas.

## If a model refuses or drifts

Gemini and DALL·E sometimes ignore "no text". Two things that help:

- Add: `This is an abstract diagram. It contains zero words.`
- Ask for the composition described as shapes only: `rounded rectangles, thin
  lines, small circles` — avoid the words "UI", "dashboard" or "interface",
  which pull the model toward generating fake labels.
