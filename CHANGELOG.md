# Changelog

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
