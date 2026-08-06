# Edward D. Clark Design System

## Design principles

### Idea first

The platform should lead with the intellectual question or purpose of each page. Portraits, credentials, and supporting detail should strengthen the narrative rather than replace it.

### Typography before decoration

Large, carefully spaced typography carries the visual identity. Decorative elements should be restrained and never compete with the content.

### Personal, not promotional

The tone should be confident, direct, scholarly, and accessible. Avoid résumé language, inflated claims, generic thought-leadership phrasing, and excessive calls to action.

### Related, not identical

EdwardDClark.com should visually relate to CollectiveStateInference.org through deep navy surfaces, cyan accents, and disciplined geometry. It should remain a distinct personal identity rather than a copy of the CSI site.

### Durable by default

Components should work for future publications, talks, biographies, and research directions without requiring redesign.

## Visual identity

### Core palette

```css
--background: #071521;
--surface: #0b1d2b;
--surface-soft: rgba(255, 255, 255, 0.035);
--text: #f4f7f9;
--muted: #a9b7c2;
--accent: #61dbc8;
--line: rgba(255, 255, 255, 0.13);
```

Usage:

- Background: primary page field
- Surface: cards, portrait framing, special content regions
- Text: headlines and high-priority content
- Muted: supporting copy and metadata
- Accent: kickers, selected links, primary actions, active states
- Line: dividers, borders, and structural separation

Brand colors from third-party identities should be used sparingly. Monochrome social icons are preferred unless brand recognition materially benefits from color.

## Typography

### Font stack

```css
font-family: Inter, ui-sans-serif, system-ui, -apple-system,
  BlinkMacSystemFont, "Segoe UI", sans-serif;
```

### Scale

- Display hero: `clamp(3.8rem, 9vw, 8.2rem)`
- Page hero: `clamp(3.2rem, 7vw, 6.5rem)`
- Section heading: `clamp(2.2rem, 5vw, 4.5rem)`
- Lead copy: `clamp(1.15rem, 2.25vw, 1.55rem)`
- Body copy: `clamp(1.05rem, 1.6vw, 1.25rem)`
- Kicker and metadata: `0.78rem–0.92rem`

### Rules

- Use tight negative tracking for display headings.
- Keep line lengths controlled: roughly 11–16 characters for large headings and 43–48rem for body copy.
- Avoid centered long-form text.
- Prefer sentence case.
- Use all caps only for short kickers and labels.

## Layout

### Content width

```css
--content: 76rem;
width: min(100% - 3rem, var(--content));
```

### Section grid

Desktop sections use a two-column editorial grid:

```text
Section label | Primary content
```

Recommended ratio:

```css
grid-template-columns: minmax(8rem, 0.7fr) minmax(0, 2.3fr);
```

Collapse to one column below approximately 52rem.

### Spacing

Use generous vertical sections:

```css
padding: clamp(5rem, 10vw, 9rem) 0;
```

Dense content should be avoided. White space is part of the identity.

## Core components

### Site header

- Sticky, translucent deep-navy surface
- EDC wordmark at left
- Concise navigation at right
- Bottom border using `--line`
- No oversized logo treatment

### Hero

- Kicker
- One central question or defining statement
- One supporting paragraph
- Maximum two calls to action
- Optional role line or metadata row

The homepage hero should not include the portrait. The About page may use a portrait-led hero.

### Section

- Kicker in left column
- Headline, narrative, and actions in right column
- Border at top
- No unnecessary background alternation

### Cards

Cards are reserved for clearly parallel categories such as areas of work, research stages, or speaking topics.

- One-pixel border
- Soft translucent fill
- Rounded corners around 1.1rem
- No heavy shadows
- Equal conceptual weight

### Actions

Primary actions:

- Accent fill
- Dark text
- Pill shape
- Strong but not oversized

Secondary actions:

- Transparent background
- Subtle border
- White or muted text

Inline links:

- Accent color
- Underline only on hover/focus
- External-link arrow when helpful

### Profile links

- Monochrome GitHub and LinkedIn icons
- CSI favicon retained in its native visual identity
- Compact inline pill treatment
- Icon and text both included for accessibility and recognition

### Portrait treatment

The canonical portrait is `Ed_Black_Blazer_No_Background.png` or a web-optimized derivative of the same source.

Recommended About-page treatment:

- Portrait occupies about 35–40% of the desktop hero
- Text remains dominant
- Transparent portrait placed over a subtle radial cyan glow
- Deep navy or surface background behind the image
- No circular crop
- No decorative frames that resemble a corporate directory
- Preserve natural proportions and recognizable LinkedIn continuity

### Research-program diagram

Use a restrained vertical or horizontal progression:

```text
Theory → Operationalization → Validation → Observatory → Applications
```

Prefer CSS and semantic HTML over a raster image so the diagram remains responsive and accessible.

## Page-specific visual direction

### Home

- Abstract, typographic, question-led
- No portrait
- Minimal supporting content

### About

- Portrait-led editorial layout
- Narrative sections
- Research philosophy as a prominent quotation or statement

### Research

- Diagrammatic structure
- Strong hierarchy
- Clear handoff to the CSI platform

### Publications

- Typographic and metadata-focused
- Consistent publication records
- Avoid card grids when a scholarly list is clearer

### Current Work

- Dated status entries
- Progress and momentum without dashboard clutter

### Speaking

- Portrait plus concise topics
- Strong downloadable-asset links

### Media

- Practical resource library
- Clear asset labels, formats, and approved usage

## Accessibility

- Maintain WCAG AA contrast as a minimum.
- Always provide visible focus states.
- Respect `prefers-reduced-motion`.
- Use semantic headings in sequence.
- Ensure icons are either labeled or hidden from assistive technology when adjacent text supplies the label.
- Do not encode meaning through color alone.
- All portrait images require meaningful alt text when informative.

## Motion

Motion should be subtle and functional:

- Small upward shift on actionable hover
- Gentle border or background transition
- No parallax on mobile
- No bounce effects
- No auto-playing decorative animation

## Asset standards

### Portraits

- Canonical transparent PNG
- Web-optimized WebP derivative
- High-resolution downloadable PNG for media
- Optional square crop for profiles

### EDC mark

- SVG primary
- Dark and light variants
- Favicon-safe simplified version

### Social preview

- 1200 × 630 image
- Edward D. Clark name
- Defining research statement
- Restrained portrait or EDC mark
- Minimal text

## Content voice

Prefer:

- “My research examines…”
- “The program develops…”
- “I work at the intersection of…”

Avoid:

- “Visionary thought leader”
- “Revolutionizing AI”
- “World-class”
- Unsupported superlatives
- Generic claims of innovation

The work should demonstrate significance through specificity, not promotional language.
