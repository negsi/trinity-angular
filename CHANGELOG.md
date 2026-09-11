# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

# [Unreleased]

### Added

### Changed

# [0.2.2] - 2026-09-11

### Added

- Added stacked tab navigation to the agent configuration component (`base` and `memory_ds` tabs).
- Added a full Markdown editor for the agent's persona and system instructions featuring a toolbar with text formatting controls (bold, italic, underline, strikethrough), heading dropdown menus (H1-H6), lists, quotes, code blocks, links, and image insertion.
- Added live Markdown preview mode using `marked` for rendering system prompts.
- Added robust conversation ID fallback resolution and optimistic UI updates with automatic rollback on failure when deleting chat messages.
- Added silent background message reloading after streaming completions to synchronize temporary IDs with real database UUIDs seamlessly.

### Changed

- Refactored agent configuration layout to use vertical collapsible full-width sections for better usability and space management.
- Streamlined SCSS variables and cleaned up unused code and comments in `agent-config.component.ts`.
- Prevented active stream cancellation on agent selection switches to maintain ongoing background tasks.
- Added conditional checks to avoid redundant message reloads during ongoing streaming states.

## [0.2.1] - 2026-09-10

### Added

- **Conversation Drawer / Inline Rename**:
  - `ConversationDrawerComponent`:
    - Added `renameConversation` event output to emit title updates to parent components.
    - Added inline editing state using `editingId` and `editingTitle` signals, alongside automatic element focus/selection (`titleInput`).
    - Added `startRename`, `saveRename`, and `cancelRename` methods to handle inline editing lifecycle via Enter, Escape, or Blur events.
  - `ApiChatService`:
    - Added `updateConversationTitle` method to issue `PATCH` requests to `/agents/{agentId}/conversations/{conversationId}`.

### Changed

- **Conversation Drawer UI & Behavior**:
  - `ConversationDrawerComponent`:
    - Added `FormsModule` to component imports for `[(ngModel)]` binding on the title input field.
    - Increased drawer panel width from `320px` to `400px` in SCSS.
    - Extended the `onSelect` click handler across the entire list item (`.conv-item`) while stopping event propagation on the title element to prevent switching conversations during rename.
    - Refactored conversation item typography, spacing, and hover states.
- **Chat Workspace Component**:
  - `ChatWorkspaceComponent`:
    - Implemented `onRenameConversation` handler to send title updates via `ApiChatService` and reactively update the local `conversationsList` signal.
    - Bound `(renameConversation)` event to `<app-conversation-drawer>` in the component template.

## [0.2.0] - 2026-09-10

### Added

- `deleteMessage` HTTP request method in `ApiChatService` to handle message deletion endpoints.
- `clearConversationMessages` HTTP request method in `ApiChatService` to reset conversation messages via API.
- `onDeleteMessage` handler in `ChatWorkspaceComponent` to delete messages and update the local reactive signal state.
- `onResetConversation` handler in `ChatWorkspaceComponent` to clear active conversation history.
- Delete action button in `ChatWorkspaceComponent` message action toolbar.
- Reset conversation button in `ChatWorkspaceComponent` header toolbar.

## [0.1.9] - 2026-09-10

### Added
- Dynamic right-side panel layout allowing seamless switching between Agent Configuration and File Workspace views.
- `FileWorkspaceComponent` integration into the main app component layout.
- Vertical navigation bar items in `RightSidebarComponent` with dynamic tab switching and tooltips.
- Workspace file management API endpoints in `ApiChatService` for listing, uploading, creating folders, downloading, and deleting conversation files/directories.
- Direct file download functionality (`getFileDownloadUrl`) in `ApiChatService` and `downloadFile` handler in `FileWorkspaceComponent`.
- Conversation state synchronization in `ApiAgentService` to fetch and maintain agent-specific conversations and track the active conversation ID.

### Changed
- Refactored `RightSidebarComponent` to render navigation items dynamically and manage tab selection state.
- Updated `AppComponent` layout to support persistent active tab state stored in `localStorage`.
- Streamlined `ApiAgentService` selection workflows to clear or update conversation states automatically upon agent switching or deletion.
- Replaced generic file format icons in `FileWorkspaceComponent` with a direct download action icon.

## [0.1.8] - 2026-09-07

### Added

- **Multi-Agent "Crew" Layout Support:**
  - `AppComponent` and workspace layout templates now support a responsive grid layout displaying up to 4 agents simultaneously (`grid-count-1` through `grid-count-4`).
  - View mode toggle pill in `AgentListComponent` to switch between `Single` (Solo) and `Multi` (Crew) workspace modes, with user preference persisting in `localStorage`.
  - Visual selection badge (checkmark overlay) for active crew agents and disabled UI state when reaching the 4-agent maximum limit.
- **Per-Agent State Isolation in `ApiChatService`:**
  - Isolated state management for chat messages (`messagesMap`) and active SSE streaming controllers (`abortControllersMap`, `streamingMap`) keyed by agent ID.
  - Added reactive signal helpers `isAgentStreaming(agentId)` and `getMessagesSignal(agentId)` for agent-level status tracking.
  - Introduced `draftAgentId` tracking to isolate unsaved new conversation drafts per agent.
- **Agent Override Support in `ChatWorkspaceComponent`:**
  - Added optional `overrideAgent` input allowing individual chat workspace instances in the Crew grid to bind to specific agent contexts.

### Changed

- **Isolated Chat Workspace Streaming State:**
  - `ChatWorkspaceComponent` now computes streaming activity per active agent (`isCurrentAgentStreaming`), ensuring input disabling and stream cancellation (`cancelActiveStream`) operate strictly on the targeted agent.
- **Layout & UI Refinements:**
  - Restructured `app.component.scss` to ensure full flexbox stretching in Single mode and clean 2x2 grid partitioning in Crew mode.
  - Redesigned agent list header layout with a modern pill toggle and adjusted padding styling.

## [0.1.7] - 2026-09-07

### Added

- Added `RightSidebarComponent` as a right-hand 64px navigation strip matching the left main sidebar layout to toggle the agent configuration panel.
- Added `isRightPanelCollapsed` signal state to persist and restore the panel's collapsed state in `localStorage` (`trinity_right_panel_collapsed`) via an Angular `effect()`.
- Added dynamic stop button controls in `ChatWorkspaceComponent` to cancel active SSE streaming requests (`chatService.cancelActiveStream()`).
- Added an reactive `effect()` in `ChatWorkspaceComponent` to automatically refocus the message input textarea when SSE streaming completes.

### Changed

- Updated `AppComponent` layout to support the 5-column structure incorporating the new right navigation sidebar.
- Fixed resizer width calculations during dragging by subtracting the 64px offset of the right sidebar.
- Conditionally rendered the resizer handle (`@if (!isRightPanelCollapsed())`) and applied `.collapsed` styles to hide/show the agent configuration panel dynamically.
- Disabled input textarea, file upload/remove buttons, and message resend actions in `ChatWorkspaceComponent` while SSE streaming is active.

## [0.1.6] - 2026-08-26

### Added

- **Smart Auto-Scrolling**: Added threshold-based auto-scroll logic in `ChatWorkspaceComponent`. Scrolling pauses automatically when the user scrolls up during message streaming and resumes when returning to the bottom.
- **Collapsible Task Chain View**: Enhanced `TaskChainListComponent` with collapsible task execution plans (collapsed by default, expandable via click).
- **Progress Indicator**: Dynamic progress indicator in the task chain header with live step counter (`Step X of Y` / `X/Y completed`) and a spinner animation during active execution.

### Changed

- **Scroll Event Binding**: Added scroll event tracking to the chat messages container to monitor user scroll position.
- **Task Chain Header Interaction**: Redesigned the task chain header into an interactive toggle element featuring a chevron icon indicating the expanded/collapsed state.

## [0.1.5] - 2026-08-26

### Added

- **Data Models & Streaming (Task Execution Pipeline):** Extended task tracking structures for step result handling.
  - Added optional `result` field to `TaskItem` interface in `task-chain-model.ts` to support tool execution outputs.
  - Extended `SseParsedEvent` (`task_step_update`) in `sse-decoder.util.ts` to capture and stream `result` payloads from SSE events.

### Changed

- **UI/Layout (Chat Workspace):** Consolidated layout bounds across chat bubbles and Markdown containers to prevent horizontal overflow.
  - Applied `min-width: 0` and `max-width: 100%` constraints to message content containers and `markdown` host elements.
  - Configured `overflow-x: auto`, `white-space: pre`, and standard container padding for HTML `<pre>` elements in code blocks.
  - Adjusted inline code styling (`:not(pre) > code`) to enforce word wrapping and fluid text reflow.
- **UI/Layout (Task Chain List & Sub-Agent Delegation):** Redesigned sub-agent execution preview from a static code block into an interactive chat-bubble interface.
  - Replaced legacy `.subagent-delegation-box` with a responsive `.sub-agent-chat` container rendering outbound prompts and inbound agent responses as distinct mini-bubbles.
  - Integrated `getInitials` and `getAvatarColor` avatar utilities in `TaskChainListComponent` to render dynamic sub-agent avatars.
  - Implemented `getAgentName()` helper to safely extract target agent identifiers from task parameters with fallback support.
- **State Management (SSE Decoder):** Optimized recursive step updates across nested task execution phases.
  - Refactored `SseDecoder.applyTaskStepUpdate()` to immutably project step status and result updates across arbitrary nesting levels (`callDepth`).

## [0.1.4] - 2026-08-24

### Added

- Extract task chain step rendering into modular `TaskChainListComponent`.
- Add support for nested task chain visualization (`callDepth`, `agentId`, and `subTaskChain` structures) to display inter-agent sub-agent delegation.
- Introduce custom UI styling for nested delegation execution blocks and agent tool badges.

### Changed

- Update `TaskItem` and `TaskPhase` models to include optional tool invocation parameters and nested sub-agent task chains.
- Refactor `SseDecoder` to handle sub-agent task execution payloads (`call_depth`, `agent_id`) and recursively update status across execution depths.

### Fixed

- Fixed auto-scroll functionality in `ChatWorkspaceComponent` when loading messages by replacing `afterNextRender` inside the Signal `effect` with `requestAnimationFrame`.

## [0.1.3] - 2026-08-23

### Fixed

- **Agent Config Form Binding:** Fixed Angular compilation error (`TS2339`) by replacing non-existent signal bindings (`ngModel`) with `formControlName` and `formGroup` bindings for reactive form integration.

## [0.1.2] - 2026-08-23

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

[Unreleased]: https://github.com/negsi/trinity-angular/compare/v0.2.2...develop
[0.2.2]: https://github.com/negsi/trinity-angular/releases/tag/v0.2.2
[0.2.1]: https://github.com/negsi/trinity-angular/releases/tag/v0.2.1
[0.2.0]: https://github.com/negsi/trinity-angular/releases/tag/v0.2.0
[0.1.9]: https://github.com/negsi/trinity-angular/releases/tag/v0.1.9
[0.1.8]: https://github.com/negsi/trinity-angular/releases/tag/v0.1.8
[0.1.7]: https://github.com/negsi/trinity-angular/releases/tag/v0.1.7
[0.1.6]: https://github.com/negsi/trinity-angular/releases/tag/v0.1.6
[0.1.5]: https://github.com/negsi/trinity-angular/releases/tag/v0.1.5
[0.1.4]: https://github.com/negsi/trinity-angular/releases/tag/v0.1.4
[0.1.3]: https://github.com/negsi/trinity-angular/releases/tag/v0.1.3
[0.1.2]: https://github.com/negsi/trinity-angular/releases/tag/v0.1.2
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