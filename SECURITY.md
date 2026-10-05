# Privacy and security boundaries

Sayloop is a local, single-user application. The standard server binds to loopback and allows localhost hostnames. Same-origin checks reject browser writes from another origin. Text rendering is escaped, uploads accept bounded UTF-8 text only, and audio downloads resolve UUIDs rather than caller-supplied filesystem paths.

There is no account or authentication system. Do not expose the server to the public internet as-is. Private remote use should keep the process behind a trusted host boundary and an SSH tunnel.

All personal materials, audio, timing records, screenshots, logs, and backups belong under ignored local data directories. Model weights remain in the model cache. Source archives are built from Git-tracked source only. Public screenshots and fixtures must contain synthetic examples.

Report vulnerabilities privately to the repository owner. Do not put real credentials, personal text, or private recordings into an issue. `scripts/privacy_check.py` catches common accidental additions, but it is not a complete secret scanner; review staged changes and the full history before changing repository visibility.
