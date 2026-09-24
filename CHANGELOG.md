# Changelog

All notable changes to this project will be documented in this file. The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/) and this project adheres to [Semantic Versioning](http://semver.org).

## 1.0.2 (2026-09-25)

### Fixed
- `@FilterResponse()` now filters the `data` of a returned `EnvelopeBody` (nestjs-http-envelope v1.0.2 or later) and keeps its `extras`. Before this, the body object itself was filtered: forbidden attributes inside `data` were not stripped, and the envelope nested the result as `data: { data, extras }`. Any response wrapper can opt in through the `Symbol.for('nestjs-http-envelope:map-data')` method; this package still has no dependency on the envelope.

## 1.0.1 (2026-09-08)

### Fixed
- Peer dependency ranges now accept NestJS 12 (`@nestjs/common`, `@nestjs/core` `^10 || ^11 || ^12`).

## 1.0.0 (2026-06-28)

- Initial release.
