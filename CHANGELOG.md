# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

### Changed

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

[Unreleased]: https://github.com/negsi/trinity-angular/compare/v0.0.5...develop
[0.0.5]: https://github.com/negsi/trinity-angular/releases/tag/v0.0.5
[0.0.4]: https://github.com/negsi/trinity-angular/releases/tag/v0.0.4
[0.0.3]: https://github.com/negsi/trinity-angular/releases/tag/v0.0.3
[0.0.2]: https://github.com/negsi/trinity-angular/releases/tag/v0.0.2
[0.0.1]: https://github.com/negsi/trinity-angular/releases/tag/v0.0.1