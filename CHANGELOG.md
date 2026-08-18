# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Task Chain Execution Progress Visualization**:
  - Integrated interactive task orchestration UI (`task-chain-card`) within agent message bubbles.
  - Added realtime status indicators (icons for `pending`, `running`, `completed`, and `failed` states) with visual spinner animations.
  - Added tool execution badges (`tool_name`) displaying active execution steps (e.g., `fetch_url`, `message_llm`, `generate_image`).
  - Added TypeScript interfaces (`TaskItem`, `TaskChainInitPayload`, `TaskStepUpdatePayload`) for task chain event definitions.

### Changed
- **SSE Event Stream Parsing**:
  - Updated `ApiChatService` to intercept and parse `__TASK_CHAIN__:` event stream chunks.
  - Refactored message models (`Message`, `ChatMessageUI`) to support real-time reactive updates of task chain status via Angular Signals.

## [0.0.8] - 2026-08-17

### Added
- **Markdown Image Styling:**
  - Added SCSS rules (`::ng-deep img`) in `chat-workspace.component.scss` for embedded Markdown images (`max-width: 100%`, rounded corners, block layout).

### Changed
- **SSE Stream Processing Refactoring:**
  - Extracted SSE event parsing in `ApiChatService` into a dedicated private helper method (`processSseEvent`).
  - Improved SSE payload parsing resilience to handle mixed data lines, raw payloads, and leading whitespace before attachment payloads (`__ATTACHMENTS__:`).
- **Agent Message Initialization:**
  - Explicitly initialized the `attachments` array on temporary agent message models created during response streaming.

## [0.0.7] - 2026-08-15

### Added
- **Dynamic Stream Attachments**: Integrated handling for `__ATTACHMENTS__` SSE payload events to render file attachment badges dynamically in real time upon agent completion.

### Changed
- **Attachment Download Pathing**: Updated conversation file attachment URLs to use the path-encoded filename endpoint for seamless downloads of generated and uploaded files.

## [0.0.6] - 2026-08-15

### Added

- fullscreen mode for chat workspace

### Changed

- Renamed and restructured components to follow official Angular naming conventions (`*.component.ts`, `*.component.html`, `*.component.scss`)
- Moved feature components (`agent-config`, `agent-list`, `chat-workspace`, `conversation-drawer`, `sidebar`) into `src/app/components/`
- Refactored root layout to decouple components from `AppComponent`
- Added JSDoc documentation to application configuration (`app.config.ts`) and routing definitions (`app.routes.ts`)
- Updated `.gitignore` to exclude generated codebase summary files (`codebase_summary.txt`)

## [0.0.5] - 2026-08-13

### Added

- Agent Memory Settings: UI controls in the Agent Form for configuring `memory_enabled`, `memory_mode`, `memory_limit_type`, and `memory_message_count`.

### Changed

- Updated Agent interfaces and API payloads to match v0.0.7 backend specifications.

## [0.0.4] - 2026-08-13

### Added

- Multi-conversation drawer to view, switch, and delete chat sessions
- Auto-focus on chat input when starting a new conversation
- Auto-load latest conversation when selecting an agent

### Changed

- Dynamic adoption of new conversation ID on first message
- Auto-close conversation drawer upon session selection
- Fixed layout centering for the delete action button

## [0.0.3] - 2026-08-12

### Changed

- adjust expanded input area height and positioning

## [0.0.2] - 2026-08-12

### Added

- UI improvements
- persist theme mode selection in local storage
- persist sidebar collapsed state in local storage
- persist right panel width in local storage

### Changed

- refined chat message actions and chat layout

## [0.0.1] - 2026-08-11 

### Added

- Base application structure and layout (UI, UX)
- Application services and views for agent creation and management
- Application services and routes for agent chats
- Angular components for agent configuration, chat workspace, and sidebar
- Application models

[Unreleased]: https://github.com/negsi/trinity-angular/compare/v0.0.8...develop
[0.0.8]: https://github.com/negsi/trinity-angular/releases/tag/v0.0.8
[0.0.7]: https://github.com/negsi/trinity-angular/releases/tag/v0.0.7
[0.0.6]: https://github.com/negsi/trinity-angular/releases/tag/v0.0.6
[0.0.5]: https://github.com/negsi/trinity-angular/releases/tag/v0.0.5
[0.0.4]: https://github.com/negsi/trinity-angular/releases/tag/v0.0.4
[0.0.3]: https://github.com/negsi/trinity-angular/releases/tag/v0.0.3
[0.0.2]: https://github.com/negsi/trinity-angular/releases/tag/v0.0.2
[0.0.1]: https://github.com/negsi/trinity-angular/releases/tag/v0.0.1