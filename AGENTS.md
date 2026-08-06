# Repository Guidelines

## Project Structure & Module Organization

This is a browser-only React and TypeScript MIDI editor built with Vite. Application code lives in
`src/`: `components/` contains React UI, `domain/` holds editor rules and shared types, `state/`
contains the Zustand store and session persistence, `audio/` handles playback and Web MIDI, and
`midi/` contains codec logic plus its worker/client boundary. Static files belong in `public/`.
Unit tests are colocated as `src/**/*.test.ts`; browser workflows live in `e2e/*.spec.ts`. Generated
`dist/`, `test-results/`, and Playwright reports must not be committed.

## Build, Test, and Development Commands

Use the project-pinned tools rather than global runtimes:

```bash
mise install
mise trust
pnpm install
```

- `pnpm dev` starts Vite at `http://localhost:4173`.
- `pnpm check` runs Biome formatting and lint checks; `pnpm check:fix` applies safe fixes.
- `pnpm typecheck` runs strict TypeScript project checks without emitting files.
- `pnpm test` runs the Vitest unit suite once; `pnpm test:watch` supports local iteration.
- `pnpm test:e2e` runs Playwright in Chromium, Firefox, and WebKit. First run
  `pnpm exec playwright install`.
- `pnpm build` type-checks and produces the production bundle in `dist/`.

## Coding Style & Naming Conventions

Biome enforces 2-space indentation, LF endings, 100-character lines, single-quoted TypeScript,
double-quoted JSX attributes, and organized imports. Do not add semicolons unless required. Use
PascalCase for React components and interfaces, camelCase for functions and variables, and
descriptive domain terms such as `startTick` or `playbackEngine`. Keep browser side effects at
adapter boundaries; prefer pure, testable operations in `domain/`.

## Testing Guidelines

Use Vitest `describe`/`it` blocks and name unit files after the module (`time.test.ts`). Cover normal
behavior and domain rejection cases. Add Playwright coverage for user-visible workflows in
`e2e/app.spec.ts`. No numeric coverage threshold is configured, so every behavior change should
include focused regression tests. Run `pnpm check`, `pnpm typecheck`, `pnpm test`, and relevant E2E
tests before requesting review.

## Commit & Pull Request Guidelines

The current history uses Conventional Commit-style subjects such as `feat: build browser MIDI
editor`; continue with concise prefixes like `feat:`, `fix:`, `test:`, or `docs:`. Keep commits
focused and avoid generated artifacts. Pull requests should explain the user impact, summarize the
implementation, list verification commands, link related issues, and include screenshots or a short
recording for UI changes. Note browser, Web MIDI, or imported-file limitations explicitly.
