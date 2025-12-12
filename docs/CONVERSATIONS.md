# Conversations and Chat History

This document describes how conversation threads (persistent chat history) are represented and accessed by the application.

## Key concepts

- Conversation: a persistent thread stored by the Azure AI Foundry project. Each conversation has an `id` and optional `metadata` (for example `title`).
- Messages: individual user/assistant messages within a conversation. Messages are streamed from the backend via Server-Sent Events (SSE) while the agent is generating responses.
- Conversation ID: created by the backend (AzureAIAgentService) when a new conversation is started. The frontend receives it as an SSE event and stores it in application state.

## Endpoints

- `POST /api/chat/stream` — Start or continue a conversation and stream assistant responses (SSE). Request body: `{ message: string, conversationId?: string, imageDataUris?: string[] }`. If `conversationId` is not provided, the backend creates one and emits a `conversationId` SSE event early in the stream.

**Note**: Conversation listing and metadata endpoints (`GET /api/conversations`, `GET /api/conversations/{id}`) are intended but not yet implemented. The Azure.AI.Projects SDK does not currently expose conversation enumeration APIs. These will be added once the SDK supports conversation listing.

## SSE event schema

Server-sent events emitted by `/api/chat/stream` include:

- `conversationId` — sent once when a new conversation is created.
  - payload: `{ type: "conversationId", conversationId: string }`

- `chunk` — incremental text delta from the assistant.
  - payload: `{ type: "chunk", content: string }`

- `usage` — summary of token usage and duration when the run completes.
  - payload: `{ type: "usage", duration: number, promptTokens: number, completionTokens: number, totalTokens: number }`

- `done` — end-of-stream marker.
  - payload: `{ type: "done" }`

- `error` — error during stream; frontend should show an error toast and allow retry.
  - payload: `{ type: "error", message: string }`

## Frontend behavior

- When sending a message, the frontend calls the streaming endpoint. If the response includes a `conversationId` event, the frontend saves it as the current conversation id and continues streaming into that conversation.
- The frontend stores `currentConversationId` in app state and will pass it on subsequent `sendMessage` calls to continue the same thread.
- Loading and listing conversations is not currently exposed in the UI; endpoint support is pending Azure SDK enhancements.

## Notes

- Conversation content (full message list) is stored by the Azure AI Foundry service. The backend exposes metadata and streaming access; implementing a full message-history REST API would require enumerating and returning conversation messages from the service (not currently supported by the SDK).
