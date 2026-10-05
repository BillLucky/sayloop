# Privacy and security boundaries

Sayloop is a local, single-user application. The standard server binds to loopback and allows localhost hostnames. Same-origin checks reject browser writes from another origin. Text rendering is escaped, uploads accept bounded UTF-8 text only, and audio downloads resolve UUIDs rather than caller-supplied filesystem paths.

There is no account or authentication system. Do not expose the server to the public internet as-is. Private remote use should keep the process behind a trusted host boundary and an SSH tunnel.

All personal materials, audio, timing records, screenshots, logs, and backups belong under ignored local data directories. Model weights remain in the model cache. Source archives are built from Git-tracked source only. Public screenshots and fixtures must contain synthetic examples.

Report vulnerabilities privately to the repository owner. Do not put real credentials, personal text, or private recordings into an issue. `scripts/privacy_check.py` catches common accidental additions, but it is not a complete secret scanner; review staged changes and the full history before changing repository visibility.

## Dependency review

Audit pinned dependencies before release with `uvx pip-audit --disable-pip --no-deps -r requirements.lock` and `npm audit --registry=https://registry.npmjs.org`. Review advisory reachability and supported upgrades; do not suppress findings to obtain a green report. Re-run real synthesis in every language after changing Transformers, Torch, tokenizers, or model dependencies. Audit results are dated evidence, not a guarantee against future vulnerabilities.

The model repository and revision are fixed in code. Do not point `KOKORO_MODEL_DIR` at untrusted third-party weights. Uploaded files are text only and cannot select a model repository or execute remote model code. Runtime dependencies retain their own security and licensing boundaries.
