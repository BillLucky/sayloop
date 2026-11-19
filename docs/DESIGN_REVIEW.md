GATE: FAIL 15 — logged-out marketing heuristics; application acceptance is recorded separately.

# Workspace design review · v0.4.2 · 2026-11-19

**Scope: refine the authenticated utility.** The existing forest-green/ivory palette, native controls, sidebar, phone navigation and common playback transport remain. No landing page, stock photography, shader, palette replacement or promotional animation was introduced.

**Reduce choices before adding effects.** Initial authoring shows a text field and one primary action. Optional parameters and history are disclosed on demand. The empty desktop form has one focused column; results restore the two-column workspace. Phones keep three primary navigation entries.

**Feedback follows actual state.** Submitting or opening history briefly locks the affected editor. Accepted jobs show server progress; duplicate taps and network retries cannot create a second accepted job for the same request ID. Errors preserve input. Late responses cannot overwrite a new idea or a more recent selection.

**Results remain usable at scale.** Short textareas fit their content; dialogue batches open one group at a time without discarding closed fields. Browser drafts report actual save failure and recover existing-dialogue edits. The model-service submission boundary is visible beneath the primary action.

## Gate interpretation

The design-kit gate inspected the real backend's unauthenticated login page. It reported the same 15 marketing-layout findings as the earlier utility review. Repeated unchanged checks reuse that result. No kit files were edited, no page was hidden from checks, and no formal waivers or gate PASS are claimed.

| Findings | Why they remain for this application |
| --- | --- |
| no-visual, copy-headline, copy-fact, moment-none | A private login form does not need promotional imagery, invented metrics or a dealt marketing scene. |
| links (two) | Existing hash routes select authenticated application views rather than marketing anchor sections. |
| hero-screen, section-height, section-air | Working forms grow with content and use compact application spacing. |
| one-section, one-heading, container-edges, row-lines, split-pair | Hidden authenticated views cannot be measured as visible marketing sections from the login screen. |
| container | The established application shell uses its own grid rather than the kit's `.wrap`. |

Six warnings concern the product-name heading, authenticated export links, skip link, private sharing metadata and generic form classification. No public runtime canonical URL or share-image metadata is invented. Existing focus rings, contrast and reduced-motion handling remain.

## Application evidence and limits

**Validate the actual workflow independently.** Chrome acceptance covers desktop and phone layouts, 320/390/768/1024/1440px widths, visible action placement, focus, pending/failure/retry, stale responses, draft recovery, role voices, real playback and saved-audio reuse. The real configured model and offline Kokoro preview chain ran against synthetic isolated data.

**Keep evidence private.** Screenshots and detailed reports remain in ignored project data. Existing public documentation images are unchanged and their exact synthetic blobs are reviewed. Physical phones, Safari, virtual-keyboard viewport behavior and OS background playback are not newly certified.


## v0.4.3 utility follow-through

**Reduce repeated work and preserve place.** The existing application layout and visual system remain. Contextual studio actions reuse a ready recording or show pending work. Practice explains the last saved position and offers one restart action. Empty library results expose clear filters; returning to the library restores the current page's reading position.

**Review actual interaction boundaries.** Regression scenarios cover frozen submission settings, intentional-copy identity, delayed list/save/media responses, selected-lesson transport, and local-session retirement. They extend the application acceptance above. No new marketing gate PASS or waiver is claimed; the unchanged unauthenticated screen retains the recorded marketing-checker limitations.
