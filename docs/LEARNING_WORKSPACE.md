# Learning workspace · v0.4

Sayloop now connects personal ideas to reusable learning materials: polish Chinese, confirm its meaning, create expressions or scenario dialogues, edit the result, save a material, audition voices, and practice. Existing text imports and recordings remain available.

## Interaction decisions

The main editor keeps source text and results side by side on desktop, stacked on phones. Three short task buttons expose Chinese polishing, expression variants, and scenario dialogues. The initial form shows source text and one primary action; context, instructions, person, quantity, and turn count are in an optional settings disclosure. Language and style appear when relevant. A separate instruction field supports open-ended revision. Every submitted request creates an immutable server-side version with its source, options, parent version, progress, model attribution, and result. Editing a result is explicit; saving creates a new material snapshot.

This combines fixed operations and flexible instructions. It is informed by the primary study [Functional Flexibility in Generative AI Interfaces](https://arxiv.org/abs/2410.10644), whose toolbar and prompting participants switched between predefined and flexible functions. The interface choice is a design inference, not a claim that this particular workspace has been user-tested.

The natural American and everyday New York presets are independent, editable prompt implementations informed by [Li Xiaolai's kick-off task](https://1000h.org/training-tasks/kick-off.html). They prioritize personal meaning, common words and phrasal verbs, natural sentence rhythm, and concise or expanded expression. They do not impersonate the author or guarantee a regional speech accent. TTS voices and language-generation style are separate controls.

Chinese polishing leaves facts and uncertainty intact. After editing the Chinese result, “生成外语表达” submits the next request directly, keeping the selected language, style, and context while clearing the previous task’s temporary instructions. “调整语言和风格” opens configuration without submitting. Pending requests disable duplicate submission; failures keep the source and display an inline retryable error. Users can edit the Chinese result and explicitly use it for the next step. Expression requests support target language, person, context, and style. Scenario requests support 1–30 dialogues with 2–16 turns each. Model output must match the requested structure before it is accepted. Unknown personal facts should elicit clarification; visa and contract scenarios are language practice, not current procedural or legal advice.

## Models and failure handling

`data/llm.json` configures an ordered provider chain, read by the server. The browser receives only provider names and model identifiers, never credentials or endpoints. The operational installation prefers its configured remote Qwen service and falls back to local Ollama. No paid provider is added automatically.

A portable example, with placeholders only:

```json
{
  "providers": [
    {
      "name": "Primary model",
      "base_url": "https://YOUR_MODEL_HOST/v1",
      "model": "YOUR_MODEL_ID",
      "api_key_env": "SAYLOOP_LLM_KEY",
      "timeout": 120,
      "extra_body": {"chat_template_kwargs": {"enable_thinking": false}}
    },
    {
      "name": "Local Ollama",
      "base_url": "http://127.0.0.1:11434/v1",
      "model": "YOUR_INSTALLED_OLLAMA_MODEL",
      "native": true,
      "timeout": 180
    }
  ]
}
```

Use file permissions `600` for this file. Environment variables belong to the running process; `.env` is not automatically loaded. Without a configuration file, only local Ollama is attempted, with `SAYLOOP_OLLAMA_MODEL` or `qwen3.5:9b`. Install/verify that model separately. No automatic model download occurs.

The primary adapter uses [OpenAI-compatible chat completions](https://docs.vllm.ai/en/latest/features/structured_outputs/) with JSON output and Pydantic validation. The native Ollama adapter uses JSON format and disables thinking for editing tasks; [Ollama compatibility documentation](https://docs.ollama.com/api/openai-compatibility) explains the related API surface. A refused connection, timeout, HTTP error, malformed/truncated result, or incorrect dialogue structure advances to the next provider. If all fail, the request retains its source and reports failure. It does not generate placeholder learning content.

One authoring worker allows at most eight outstanding requests, two per user. Dialogue batches contain up to three dialogues, with previous topics supplied to subsequent batches to reduce repetition. Completed batches are persisted; interruption or failure exposes any completed portion for editing and saving. Restart marks unfinished requests interrupted. Larger requests take longer; batch progress remains visible after reopening the page. A single request accepts at most 12,000 source characters. Split larger texts into meaningful sections.

## Accounts and ownership

The first server startup provisions a random owner password in `data/OWNER_LOGIN.txt`, readable by the local owner only. A network visitor cannot claim the old library. Existing JSON records remain byte-for-byte unchanged and resolve to the persisted legacy owner. New materials, recordings, and authoring jobs carry an owner ID and default to private access.

The owner can generate one-use invitations expiring after 24 hours. Invited users choose their own username, nickname, and password. Password changes revoke all sessions. Forgotten passwords can be reset locally with `.venv/bin/python scripts/manage_users.py USERNAME`; passwords are entered interactively, never as command arguments.

Passwords use salted scrypt (`N=16384`, `r=8`, `p=5`), one of the configurations in the [OWASP password storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). Random 256-bit session tokens are stored as SHA-256 digests, expire after 30 days, and use HttpOnly, SameSite=Strict cookies with Secure on HTTPS. Failed logins are rate-limited over ten minutes. The [OWASP session guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) informed these controls. SQLite stores account, session, invitation, feedback, and study records in ignored `data/accounts.sqlite3`.

Every material listing, generation lookup, audio request (including Range and ETag), ZIP export, feedback target, and study session checks the authenticated account. A material owner may explicitly share it, including recordings made by that material owner, with all signed-in users. Recordings another learner creates from a shared text remain private to that learner. Only its owner may change metadata. Revoking sharing removes access through that material; a copy already saved or downloaded cannot be remotely recalled. Sharing is therefore an explicit disclosure decision.

The current deployment remains private to its existing access network. Account support does not authorize public hosting, Funnel, or changes to system proxy, DNS, firewall, or routing. HTTPS is preferred; ordinary LAN HTTP does not encrypt passwords in transit.

## Dialogue voices and feedback

Each material may contain A/B turns, role labels, and Chinese meanings. The studio assigns a separate voice to each role, including male and female choices from the selected language. Voice audition filters cover all 54 voices and nine language/accent options.

The synthesis worker renders each turn, joins PCM with the selected pause, then encodes one MP3/WAV. Role names and translations are metadata, not spoken text. Sentence timestamps are offset into the combined recording; practice shows the role and Chinese meaning. The same playback transport handles narration and dialogue. Existing dialogues can be reopened in the turn editor and saved as new materials.

Users can rate content or recordings and save specific notes. Their feedback history appears under learning progress. Composition feedback can populate the next revision's instruction field. Voice and pacing feedback informs the user's next audition and settings; it does not automatically retrain Kokoro, alter old recordings, or silently change model weights.

## Library, progress, and downloads

Search matches title, body, and tags. Filters cover language, dialogue/article, ownership, sharing, favorites, archived state, and audio readiness; sorting supports recency and title. The browser renders 24 matches at a time and can load more. JSON remains the material source of truth; this is a local library, not an indexed search cluster.

The server records listening sessions, capped heartbeats, and idempotent event IDs. Wall-clock bounds prevent duplicate tabs or replayed requests from multiplying credited time. Pauses, seeking, and unavailable media do not accrue browser playback time. Daily goals, a 14-day chart, streaks, recent practice, and minute milestones use these records. Dates use Asia/Shanghai. Counts describe listening, not measured speaking or pronunciation quality. They are motivational statistics, not fraud-resistant certification.

The seven-day leaderboard is opt-in and displays nickname and listening time only. Private material titles and content never appear there. Users can leave it through their profile.

Complete MP3/WAV resources retain versioned URLs, Range support, and conditional ETags. HTTP caches revalidate authentication (`private, no-cache`, `Vary: Cookie`); an unchanged authorized resource returns 304 without retransmitting its body. Explicit device saving stores complete audio in IndexedDB under account ID plus versioned URL. Reopening and seeking a saved recording uses a blob URL with no audio transfer. Logging out removes saved copies and drafts for that account on the current browser; it does not delete server files. A matching pre-account saved recording can be adopted into the current account only after a fresh authenticated lookup authorizes the exact recording version; other old unscoped entries are not reused.

Caches are per origin, browser profile, account, and device. The app cannot detect files downloaded into another app or another device. A page/library load still needs the server; browsers may evict local storage. There is no video generation or video library in this release, so video caching is not claimed.

## Backup and operational boundaries

Back up the entire private data directory while both queues are idle and the service is stopped, including `accounts.sqlite3`, compositions, materials, jobs, audio, and local model configuration. Restoring only audio loses ownership and timing information. Keep model weights in the existing model cache. `scripts/stop.py` refuses active speech or authoring queues.

The installation uses its existing OS login service; deployment updates and restarts that service after checks. Process recovery and login-item configuration can be verified without restarting the computer. A cold boot, physical phones, and mobile OS lock-screen behavior require separate device acceptance. Source checks and browser emulation do not certify those platforms.


## Phone interaction update (v0.4.1)

The phone has three primary tabs: materials, authoring, and practice. More opens a native action sheet for studio, voices, progress, and account actions. The library has one prominent create action, contextual card actions, and collapsible advanced filters. Audio settings and offline tools are disclosed on demand. Player settings and downloads share one sheet; hiding the player pauses it and preserves the selected recording. Keyboard focus, Escape, and backdrop dismissal follow the native dialog behavior. Role B's selected voice and dialogue metadata survive draft restoration and title-only version creation.

## v0.4.2 interaction and local drafts

Result textareas fit short content instead of reserving a large blank editor. Dialogue batches open the first dialogue and fold the rest; closed fields remain editable and are included in saved material snapshots. History is collapsed until needed. The empty desktop editor uses one focused column, then expands into the input/result split after submission.

Account-scoped drafts are saved after a short typing delay and synchronously flushed on page exit. Corrupt or unavailable browser storage cannot prevent submission. Draft status reports actual persistence success or failure. Editing an existing dialogue also retains its role metadata and unsaved text across reloads, even without a prior model-generated version. Logout cancels delayed draft writes before clearing local data.

Speech is generated on the server’s local machine. Authoring text is sent to the configured language-model service, which can be remote; the interface states this below the submit action. Private source publication and private application data remain separate.

**Request recovery:** clients attach a random, account-scoped request ID and retain it for a failed response. Retrying unchanged content reuses the accepted server job; a different payload with the same key is rejected. A successful POST is the accepted revision and does not depend on a follow-up GET. History changes and polling use a selection epoch so late responses cannot overwrite another version or a new draft. Input is briefly locked while submitting its snapshot, then enabled again while generation runs.


## v0.4.3 continuity, reuse, and account retirement

**Recover position without autoplay.** An authorized full-recording lookup returns only the current account's latest nonempty study session. Positions under two seconds or within one second of the end reset to zero. The browser applies pending seeks after metadata when necessary; an already loaded recording keeps its current transport position. Selecting a recording, restarting it, and entering focus all retain the association between selected lesson, media, and sentence segments.

**Keep library work in memory.** NFKC-normalized keyword matching spans title, body, and tags. A Map resolves ready recordings once per render; a WeakMap caches normalized text and invalidates when text metadata changes. Search is debounced and respects IME composition. Queries and view scroll positions are not written into URLs or browser storage; empty filtered results offer a clear action.

**Reuse exact private work deliberately.** The client prefers the explicitly opened owned private material when its full snapshot matches, preserving intentional duplicate copies. An unchanged private nonarchived snapshot can be reused under a single-process lock; default API material creation still creates a new copy. Shared/foreign/archived materials are excluded from reuse. Matching owned recordings reuse the same material, title, voices, speed, pause, and preview/full kind; another setting creates new work.

**Freeze each submitted intent.** Authoring candidate batches and studio generation capture immutable text/settings snapshots. Selection/edit epochs stop late saves from moving a newly edited workspace. Generation list reads use read and mutation epochs so older GET responses cannot erase accepted POST results. Speech request IDs are scoped to the account; the same key with a different payload returns 409. This is single-process deduplication, not a distributed-worker guarantee.

**Retire current-page writes before cleanup.** Logout and password changes mark the session transition before the revoking request, then invalidate audio-cache sessions and draft timers before awaiting storage cleanup. Same-origin tabs receive account retirement through BroadcastChannel when the browser permits it. Late downloads cannot recreate that session's device copy. Storage failures do not skip the other cleanup steps. A failed revoking response checks whether the server session is still active before clearing work or restoring controls. Restricted browsers without cross-tab messaging retain document-local cancellation. This does not remotely erase downloaded files or turn a shared browser profile into an OS security boundary.
