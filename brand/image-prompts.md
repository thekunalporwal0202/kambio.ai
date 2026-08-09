# Kambio — marketing image prompts

Prompts for Gemini, ChatGPT / DALL·E, Midjourney or any other image model,
locked to the Kambio brand and carrying the wordmark.

---

## The logo

`brand/logo/` holds the real files. Use them — do not let a model draw the
wordmark from scratch.

| File | Use |
|---|---|
| `kambio-wordmark-light.png` | On dark backgrounds. Transparent, 1488×400. |
| `kambio-wordmark-dark.png` | On light backgrounds. Transparent. |
| `kambio-icon-512.png` | Square avatar — LinkedIn, X, favicon. |
| `kambio-icon-transparent.png` | The `k.` alone, no container. |

Set in Inter Semibold, letter-spacing −2%, `kambio` in `#E9EDF5` and the full
stop in `#3DDC97`. Clear space on every side is at least the height of the "k".

**Never** stretch it, recolour it, add a shadow, put it on a busy area, or
rebuild it in a different typeface.

---

## Two ways to work — pick by tool

### A. Reference-image compositing — best quality, use this

Gemini and ChatGPT both accept image uploads. Attach `kambio-wordmark-light.png`
and add this line to any prompt:

```
I have attached the Kambio wordmark. Place it exactly as provided — do not
redraw, retype, restyle or recolour it. Keep its proportions. Position it in
the space indicated and leave clear space around it equal to the height of
the "k". Generate no other text anywhere in the image.
```

This is the only approach that reliably gives you a correct wordmark.

### B. Text in the prompt — Gemini only, and check every time

Gemini's recent image models render short text reasonably well; DALL·E does not.
If you go this route, keep to **one line of six words or fewer**, and specify it
exactly:

```
Render exactly this text and nothing else: "kambio."
All lowercase. Font: Inter Semibold or a near-identical geometric sans.
The word "kambio" in #E9EDF5, the final full stop in #3DDC97.
Tight letter-spacing. No other words, letters or numbers in the image.
```

Then **zoom in and read it.** Models drop the "i", turn the full stop into a
comma, or render "kamblo". A wrong wordmark that ships is worse than no image.

### The production route for anything important

Generate the artwork with **no text at all**, then set the headline and place
the logo in Canva or Figma. Ten minutes, and the type is correct, on-brand and
editable. Use A or B for speed; use this for anything a customer or investor
will see.

---

## Palette — never substitute

| Role | Hex |
|---|---|
| Background | `#0A0C10` |
| Panel | `#12151C` |
| Panel raised | `#171B24` |
| Hairline border | `#232936` |
| Text | `#E9EDF5` |
| Muted text | `#8B93A7` |
| **Brand green** | **`#3DDC97`** |
| Green (filled buttons) | `#1FAA72` |
| Amber — "needs a human" only | `#F5A623` |

Green is an accent. If more than about a tenth of the image is green, it's wrong.

---

## Master prompt

Paste this first, every time. Then add one campaign block.

```
Create a 2D digital illustration for Kambio, a B2B software product for export
operations. Follow this art direction exactly.

PALETTE — only these colours:
  background #0A0C10 (near-black, slightly blue)
  panels #12151C, raised panels #171B24
  hairline borders #232936, exactly 1px, never thicker
  primary text #E9EDF5, secondary text #8B93A7
  accent #3DDC97 (bright mint green) — accents only, under 10% of the image
  filled buttons #1FAA72, amber #F5A623 for warning states only

STYLE:
  Flat vector. Clean geometric shapes. Generous negative space.
  Dark-mode software aesthetic — a well-made developer tool, not a consumer app.
  Rounded corners, 8-12px radius.
  Thin 1.5px outlined line icons, rounded caps, Lucide style.
  Depth only as a faint green glow behind one focal element.

FORBIDDEN:
  No photorealism, no 3D renders, no glossy or metallic surfaces.
  No gradient meshes, no neon cyberpunk, no purple or blue tech clichés.
  No stock-photo people, no handshakes, no globes with orbiting arcs.
  No circuit boards, no "brain made of nodes" AI imagery.
  No drop shadows, no bevels, no glassmorphism, no lens flares, no particles.
```

---

## Campaign blocks

Each gives the composition, the headline copy, and where the logo goes. Copy is
written to be set in Canva — if you're letting the model render it, use route B
above and check it.

### 1. Launch announcement — LinkedIn, 1200×627

```
COMPOSITION:
Wide horizontal. Left half empty and clean for a headline. Right half shows one
rounded panel with four neat horizontal rows, each ending in a small mint-green
tick, with a faint green glow behind the panel.
Reserve the bottom-left corner for a logo.
```

- **Headline:** Stop being the bridge.
- **Sub:** One room per shipment. Your CHA, forwarder and buyer already in it.
- **Logo:** bottom-left, wordmark at about 8% of image width.

### 2. The problem — square, 1080×1080

```
COMPOSITION:
Three small dark message-bubble outlines in #232936, scattered at slight angles
in the upper two-thirds, unaligned and disconnected. Nothing connects them.
The lower third is empty and clean.
Reserve the lower third for text and a logo.
```

- **Headline:** Four threads. One shipment. No source of truth.
- **Logo:** bottom-centre.

### 3. Extraction with provenance — vertical, 1080×1350

```
COMPOSITION:
Two stacked rounded panels. The upper panel shows lines of abstract grey bars of
varying length, like raw email text. The lower panel shows four tidy rows, each
with a short label bar, a value bar, and a small rounded pill at the right end.
Three pills mint green, the fourth amber.
A thin mint-green downward arrow connects the two panels.
Reserve the top 20% for a headline.
```

- **Headline:** Every field shows its source.
- **Sub:** And how confident it is. The amber one waits for you.
- **Logo:** bottom-right, small.

### 4. The permission wall — square, 1080×1080

```
COMPOSITION:
One tall panel divided into five horizontal rows. Each row: a document icon on
the left, four small circular indicators on the right. Some indicators filled
mint green with a tick, others muted grey with a dash. The pattern differs on
every row. Strictly geometric, like a permissions matrix.
Reserve the top 20% for a headline.
```

- **Headline:** Your buyer never sees the shipping bill.
- **Sub:** Not because you remembered. Because the room doesn't contain it.
- **Logo:** bottom-centre.

### 5. Human in the loop — 1200×627

```
COMPOSITION:
A rounded panel showing a draft message as three grey text bars. Below it two
buttons side by side: one filled mint green, one outlined in #232936. A small
outlined shield icon with a tick floats above the panel in mint green.
Reads as "written, waiting for approval".
Reserve the left third for a headline.
```

- **Headline:** AI drafts. You decide.
- **Sub:** Nothing financially consequential is ever sent without a person.
- **Logo:** top-left, above the headline.

### 6. Zero install — 1200×627

```
COMPOSITION:
A central rounded panel with four thin lines radiating to four smaller panels at
the corners. Each corner panel shows a different number of visible rows — four,
three, two, one. Two connecting lines mint green, two muted grey.
Centred with breathing room on all sides.
```

- **Headline:** Nobody else has to sign up.
- **Sub:** A scoped link, and they keep using email and WhatsApp.
- **Logo:** bottom-centre.

### 7. Instagram story / vertical — 1080×1920

```
COMPOSITION:
Mostly empty. A faint grid of #232936 hairlines across the lower third, fading
upward. One mint-green dot glows softly, low and right of centre. Nothing else.
Keep the upper two-thirds completely clean.
```

- **Headline:** Forward one email.
- **Sub:** Watch the shipment build itself.
- **Logo:** centred, upper third.

### 8. Social avatar

Don't generate this. Use `kambio-icon-512.png` directly.

---

## Headline bank

Short, concrete, and true to what the product does. Six words or fewer where it
matters.

- Stop being the bridge.
- Forward one email.
- Your buyer never sees the shipping bill.
- AI drafts. You decide.
- Four threads. One shipment.
- Nobody else has to sign up.
- Every field shows its source.
- One room per shipment.
- The copy-paste stops here.
- Your CHA asks once.

Avoid: "revolutionise", "seamless", "game-changer", "supercharge", "10x",
"AI-powered". The product is credible because it is specific — the copy should
be too.

---

## Before you publish

1. **Sample the greens.** Models drift to teal, cyan and emerald. If it isn't
   close to `#3DDC97`, regenerate rather than accept.
2. **Read every letter of the wordmark** at full zoom.
3. **Check for stray text.** Models add fake UI labels unprompted. Regenerate
   rather than crop.
4. **Check contrast** on any overlaid text. `#E9EDF5` on `#0A0C10` is strong;
   `#8B93A7` over a busy area is not.
5. **Never put the logo over detail.** It needs a flat area.

## If the model drifts

- Add: `This is an abstract diagram. It contains zero words.`
- Describe shapes, not software: `rounded rectangles, thin lines, small circles`
  rather than "dashboard" or "UI", which pull it toward inventing fake labels.
- If the palette keeps going teal: `The green must be a bright mint green,
  #3DDC97 — not teal, not emerald, not cyan.`
