# Project Charter: upmods CLI (MVP Phase)

## 1. Core Mission
Develop a **user-friendly**, high-performance Terminal User Interface (TUI) for managing and updating **Minecraft mods**. 
* **Internationalization**: Full support for **English and Traditional Chinese** (zh-TW) toggle.
* **Compatibility**: Ensure stability on Windows environments through strict architectural discipline and automated version control.

## 2. Development Philosophy & Workflow
* **Decoupled Architecture (GUI-Ready)**: Core business logic (API, file scanning, mod sorting) must reside in `@upmods/core` or a dedicated `lib` folder. **The TUI (Ink) should only be a consumer of these services.** This ensures future GUI (Web/Electron) implementations can reuse 100% of the logic.
* **TUI-First Design**: The interface must be implemented with mock data before connecting real business logic.
* **Incremental Complexity**: Build the "Shell" (Visuals) -> "State Machine" (Navigation) -> "Core Integration" (Real Logic).
* **Git-Driven Execution**: For every completed sub-task or bug fix, the agent must automatically perform:
    1. `git add .`
    2. `git commit -m "feat/fix: <clear description>"`
    3. `git push`.

## 3. Technical Stack & Standards
* **Framework**: [Ink](https://github.com/vadimdemedes/ink) (React-based TUI).
* **Runtime**: Node.js (ESM), executed via `tsx`.
* **Testing Strategy**: 
    * **Logic Only**: Focus 100% on unit tests for pure functions and state machines via [Vitest].
    * **No UI Testing**: Do NOT write tests for Ink components. Manual verification for visuals.
* **Linting**: ESLint with strict rules.

## 4. Operational Rules (The "Laws")
1.  **Logic-First Testing**: Pure logic modules must have passing tests before the task is "Done".
2.  **No "Silent Exits"**: Wrap async operations in `try/catch` with explicit `stderr` logging.
3.  **Windows Compatibility**: Use `node:url` and `node:path` for all file operations.
4.  **The MVP Boundary**: No real API integration until static TUI navigation is verified.

## 5. Definition of Done (DoD)
A feature is considered "Done" only if:
* [ ] Code passes `eslint`.
* [ ] Unit tests for logic pass.
* [ ] TUI renders correctly in manual verification.
* [ ] **Git commit and push are completed.**

---
*Signed: The Architect (User) & The Executor (AI)*