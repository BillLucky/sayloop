# Privacy and security boundaries

Sayloop is a private local service with account-scoped libraries, revocable sessions, and invitation-based registration. The standard server binds to loopback and allows localhost hostnames. Same-origin checks reject browser writes from another origin. Text rendering is escaped, uploads accept bounded UTF-8 text only, and audio downloads resolve UUIDs rather than caller-supplied filesystem paths.

Do not expose the server to the public internet as-is. Local accounts supplement the private network boundary. Private remote use should use Tailscale Serve HTTPS with restricted tailnet access (never Funnel), or an SSH tunnel. Optional LAN mode is unencrypted; use a trusted network and sign in before accessing personal content. Hostname checks are not authentication. See [remote access](docs/REMOTE_ACCESS.md). Explicitly saved browser audio remains personal data on that device; clear site storage before handing a device to another person.

All personal materials, audio, timing records, screenshots, logs, and backups belong under ignored local data directories. Model weights remain in the model cache. Source archives are built from Git-tracked source only. Public screenshots and fixtures must contain synthetic examples.

Report vulnerabilities using [GitHub private vulnerability reporting](https://github.com/BillLucky/sayloop/security/advisories/new). Do not put real credentials, personal text, or private recordings into an issue. `scripts/privacy_check.py` catches common accidental additions, but it is not a complete secret scanner; review staged changes and the full history before changing repository visibility.

## Dependency review

Audit pinned dependencies before release with `uvx pip-audit --disable-pip --no-deps -r requirements.lock` and `npm audit --registry=https://registry.npmjs.org`. Review advisory reachability and supported upgrades; do not suppress findings to obtain a green report. Re-run real synthesis in every language after changing Transformers, Torch, tokenizers, or model dependencies. Audit results are dated evidence, not a guarantee against future vulnerabilities.

The model repository and revision are fixed in code. Do not point `KOKORO_MODEL_DIR` at untrusted third-party weights. Uploaded files are text only and cannot select a model repository or execute remote model code. Runtime dependencies retain their own security and licensing boundaries.

## Account and cache boundary

The first owner is provisioned locally; existing materials resolve to that owner without a network claim flow. API content, exports, and audio (including conditional requests) require an authorized session. Sharing is explicit and revocable for future server requests; downloaded copies cannot be remotely recalled. Passwords use salted scrypt and session tokens are stored as digests. Use HTTPS for remote login. Browser audio/drafts are account-scoped and cleared on logout; shared browser profiles are not a secure OS-user boundary. See [workspace design](docs/LEARNING_WORKSPACE.md).
