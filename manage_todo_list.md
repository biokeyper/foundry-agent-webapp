Todo list — manage_todo_list

Steps implemented:

1) Add storage listener
- Add `storage` event listener in `frontend/src/components/ChatHistory.tsx` to auto-reload conversations when `localStorage.chat_conversations` changes (cross-tab updates).
- Add a 60s tick to refresh human-friendly timestamps.

2) Update ChatHistory to auto reload and human-friendly timestamps
- `ChatHistory.tsx` now persists lastAccessed updates to `localStorage` when selecting or deleting conversations.
- Displays human-friendly timestamps (`just now`, `5m`, `3h`, or locale date) for conversation dates.

3) Ensure reducer stores conversation when conversationId is received
- Added new action `CHAT_ASSIGN_CONVERSATION` and reducer handling in `frontend/src/reducers/appReducer.ts` to persist conversation metadata (id, title, createdAt, lastAccessed, messages) to `localStorage` when backend assigns a conversation id.

4) Update chatService to dispatch an action when SSE event `conversationId` arrives
- `frontend/src/services/chatService.ts` now passes the initial user message into the streaming processor and dispatches `CHAT_ASSIGN_CONVERSATION` when the SSE `conversationId` event arrives, providing a suggested title when available.

Files changed:
- frontend/src/components/ChatHistory.tsx
- frontend/src/services/chatService.ts
- frontend/src/reducers/appReducer.ts
- frontend/src/types/appState.ts

Notes:
- Reducer intentionally writes to `localStorage` to keep behaviour consistent with existing code patterns in this project.
- I did not run dev servers here; please run the local dev task to validate end-to-end behavior.
