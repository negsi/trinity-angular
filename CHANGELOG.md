# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Typed Reactive Forms:** Integrated `FormGroup<AgentForm>` in `AgentConfigComponent` for structured state management, input validation, and cleaner form resets.
- **Dedicated SSE Parsing Utility:** Introduced `SseDecoder` utility class to encapsulate event extraction, task chain updates, and attachment stream processing.
- **Stream Cancellation Support:** Added `AbortController` integration in `ApiChatService` to cleanly abort ongoing SSE streams when switching agents or clearing conversations.
- **Dynamic User Context Integration:** Connected chat messaging payload properties (`sender_id`, `sender_name`) directly to `UserContextService`.

### Changed

- **Codebase Aggregation Filter:** Updated `concat_code.py` to exclude `.html` and `.scss` files, restricting output context exclusively to `.ts` and `.json` files.
- **Datasource API Refactoring:** Moved `uploadDatasource` method from `ApiAgentService` into `DatasourceService` to enforce single responsibility principles.
- **Race-Condition Prevention:** Converted agent selection handling in `ChatWorkspaceComponent` to an RxJS pipeline using `toObservable` and `switchMap`.
- **Zoneless Render Timing:** Replaced `setTimeout` calls with Angular's native `afterNextRender` lifecycle hook for post-rendering focus and auto-scroll behaviors.
- **Avatar Utility Extraction:** Extracted `getInitials` and `getAvatarBg` helper functions from `AgentListComponent` into a standalone `avatar.util` module.

## [0.1.1] - 2026-08-22

### Added

- Integrated optimistic UI message appending and single-pipeline SSE streaming directly via `POST /api/v1/agents/<agent_id>/stream` in `ApiChatService`.
- Added real-time handling for incoming stream `meta` events to dynamically bind backend-generated `conversation_id`s to temporary UI messages.

### Changed

- Refactored `sendMessage` in `ApiChatService` to accept optional DTO fields and dispatch `FormData` or JSON payloads directly to the agent stream endpoint.
- Updated `SendMessageDto` interface to mark all sender and text properties as optional to align with backend context derivation.
- Handled unhandled promises in `ChatWorkspaceComponent` by adding `void` operators to `sendMessage` calls.

## [0.1.0] - 2026-08-18

### Added

- Added `TaskPhase` interface to support multi-phase task execution chains in messages.

### Changed

- Refactored `taskChain` property in `Message` and `ChatMessageUI` models to `taskPhases` array for multi-turn task history tracking.
- Updated `ApiChatService` to handle multi-phase `task_chain_init` events by appending new phases instead of overwriting existing task steps.
- Updated `ApiChatService` SSE handler for `task_step_update` to target steps within the active (latest) task phase.
- Updated `ChatWorkspaceComponent` template to render grouped task steps sequentially per phase (`Aufgabenplan (Phase X)`).
- Updated typing indicator visibility check to account for active `taskPhases`.

## [0.0.9] - 2026-08-18

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

[Unreleased]: https://github.com/negsi/trinity-angular/compare/v0.1.1...develop
[0.1.1]: https://github.com/negsi/trinity-angular/releases/tag/v0.1.1
[0.1.0]: https://github.com/negsi/trinity-angular/releases/tag/v0.1.0
[0.0.9]: https://github.com/negsi/trinity-angular/releases/tag/v0.0.9
[0.0.8]: https://github.com/negsi/trinity-angular/releases/tag/v0.0.8
[0.0.7]: https://github.com/negsi/trinity-angular/releases/tag/v0.0.7
[0.0.6]: https://github.com/negsi/trinity-angular/releases/tag/v0.0.6
[0.0.5]: https://github.com/negsi/trinity-angular/releases/tag/v0.0.5
[0.0.4]: https://github.com/negsi/trinity-angular/releases/tag/v0.0.4
[0.0.3]: https://github.com/negsi/trinity-angular/releases/tag/v0.0.3
[0.0.2]: https://github.com/negsi/trinity-angular/releases/tag/v0.0.2
[0.0.1]: https://github.com/negsi/trinity-angular/releases/tag/v0.0.1