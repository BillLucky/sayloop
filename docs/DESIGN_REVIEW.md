GATE: OPEN 16 (rounds used up)

# Workspace design review · 2026-11-16

This iteration extends the existing authenticated application rather than creating a marketing site. It retains Sayloop's forest-green, ivory, and paper palette, sidebar navigation, browser-native controls, and common playback transport. The primary flow is personal idea → confirmed Chinese → editable expression or dialogue → saved material → voice audition → practice.

Voice: direct Chinese task labels and instructions; English is retained where it is learning content or an existing playback control. No invented testimonials, commercial metrics, customer portraits, prices, or licensing claims are used. There is no new brand name, canonical public runtime domain, photograph, stand-in asset, shader, or scene. Hover/press responses are small; reduced-motion preferences are respected. Visible focus rings and button-text contrast were strengthened after the initial checker findings.

The design-skill gate inspected the unauthenticated login screen and, in its final source-file run, served the page without its FastAPI backend. Its marketing-page checks remain open; no formal waivers were added and a gate PASS is **not** claimed. The remaining findings are:

| Check | Open finding and interpretation |
| --- | --- |
| `no-visual` | Login introduction has no photograph, effect, or UI mock. It intentionally presents the real login form. |
| `copy-headline` | The login heading is the existing product name rather than a sales-category heading. |
| `copy-fact` | Login has no sales number, price, place, or commercial proof. |
| `links` (two) | Brand links use the application's existing `#library` router, not an element named `library`. Hash navigation works in authenticated browser acceptance. |
| `moment-none` | The working editor has no dealt marketing animation section. |
| `hero-screen` | The application is not arranged as a full-screen marketing hero. |
| `section-height` | Editors grow with content rather than being restricted to one or two screens. |
| `section-air` | Application forms use compact working-space spacing. |
| `one-section` | The checker cannot measure hidden authenticated views from the logged-out screen. |
| `one-heading` | The application has separate view headings, not one marketing heading per screen. |
| `container-edges` | Existing application shell/grid classes replace the kit's `.wrap`. |
| `row-lines` | The checker has no visible authenticated section to measure from login. |
| `split-pair` | The checker has no visible authenticated split editor to measure from login. |
| `nav-covers` | The final static-file run shows the expected API-404 toast because it has no FastAPI backend. Live API/browser runs have no such error. |
| `container` | The existing application does not use the marketing kit's `.wrap` class. |

Seven warnings cover asset classification, the product-only heading, authenticated export links, the skip link, mixed-language classification, private-app sharing metadata, and form classification. No public canonical domain or share image is supplied because the running service remains private. Native form controls use labels, bounded input, and POST fallback; live browser tests verify actual submission and confirmations.

Separate application acceptance passed 22 Chrome tests at desktop and mobile sizes, including login, iterative editing, turn editing, male/female assignment, library management, feedback/progress access, logout, saved-audio reuse, and account-scoped caches. Real-model and real-audio browser acceptance also passed. Inspected captures at 1440, 1024, 820, 768, 390, and 320 pixels showed no horizontal overflow. The current checker confirms contrast, focus visibility, control naming, and the 320-pixel overflow walk. No standalone marketing-performance score is claimed.

Screenshots, checker reports, and operational captures are private local evidence under ignored `data/validation/`. No real personal library screenshots were added to the source repository. Physical phones, Safari, and mobile OS background behavior remain untested in this round.
