# AI Agent Frontend

React-based frontend for the AI Agent application.

## New Features
- **Toggleable Navigation**: Sidebar can be collapsed/expanded. State persisted in `localStorage`.
- **IndexedDB Storage**: Conversations are stored in IndexedDB (`ChatConversationsDB`) for scale and performance.
- **Search**: Real-time conversation filtering by title.
- **Auto-Sync**: Automatic synchronization between Reducer state (localStorage) and IndexedDB.

## Key Components
- **ChatHistory**: Manages conversation list, search, and deletion. Handles persistence to IndexedDB.
- **conversationDb**: Service layer (`src/services/conversationDb.ts`) handling all IndexedDB operations.
- **App.tsx**: Manages global state and syncs data to IndexedDB on updates.
