# Changelog

## 0.2.0 — 2026-10-05

- License current application source under Apache-2.0; add NOTICE, dependency license boundaries, and contributor/community templates. Earlier tags retain their MIT terms.
- Document Docker first-run setup, empty personal libraries, offline model cache, backup/restore, and source-only distribution.
- Add desktop/mobile browser regression tests using synthetic text and audio, plus deployment synthesis/persistence smoke checks.
- Audit staged source and reachable Git history for private artifacts; exclude environment variants and retain only a safe configuration example.
- Upgrade Transformers to 5.18.0 and validate offline speech in all nine language options.
- Add English/Chinese README navigation and reviewed synthetic product screenshots.
- Refresh CI actions and add browser checks and dependency update proposals.

开源准备版本：应用代码改用 Apache-2.0，补齐部署与贡献文档、浏览器回归和隐私历史检查。仓库继续私有，不发布个人文本、录音或预构建依赖镜像。

## 0.1.1 — 2026-10-05

- Report a nonzero failure when the background server has not exited after a stop request; never claim a successful stop while it remains running.
- Add regression coverage for exited, zombie, and still-running processes.
- Refresh the delivery checklist and operational troubleshooting.

收尾补丁：修正停止服务超时后的误报，补齐进程退出回归测试与交付索引。个人语料与录音保持不变。

## 0.1.0 — 2026-10-05

Initial private release of Sayloop.

- Local Kokoro speech studio: 54 voices, nine language/accent options, previews, queued full recordings, MP3/WAV/ZIP exports.
- Personal material library with UTF-8 imports, saved versions, search, and status filters.
- English sentence timestamps derived from model durations; safe upgrade with local backups.
- Automatic text following, reliable Space pause/resume, previous/next/replay shortcuts, and continuous/shadow/loop modes.
- Collapsible sidebar and a large-type immersive practice room.
- Reproducible setup, offline model reuse, private data separation, source packaging, CI checks, and operation guides.

首个私有版本：完成本地语音生成、个人语料库、逐句跟读、自动滚动、键盘控制、沉浸模式、备份与迁移文档。个人文本和音频不随代码发布。
