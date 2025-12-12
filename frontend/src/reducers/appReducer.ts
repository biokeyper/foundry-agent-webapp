import type { AppState, AppAction } from '../types/appState';

/**
 * Helper: Deduplicates conversations by ID, keeping the most recently accessed.
 * Removes any duplicate conversation IDs (keeps the first occurrence).
 */
function deduplicateConversations(conversations: any[]): any[] {
  const seenIds = new Set<string>();
  return conversations.filter((conv) => {
    if (seenIds.has(conv.id)) {
      return false; // Skip duplicate
    }
    seenIds.add(conv.id);
    return true;
  });
}

/**
 * Main application state reducer.
 * Handles all state transitions for auth, chat, and UI coordination.
 * 
 * Design principles:
 * - Pure function - no side effects
 * - Immutable updates - always return new state objects
 * - Exhaustive action handling via discriminated unions
 * - Optimized updates - only modified what changed
 * 
 * @param state - Current application state
 * @param action - Action to process (discriminated union)
 * @returns New application state
 */
export const appReducer = (state: AppState, action: AppAction): AppState => {
  switch (action.type) {
    // === Authentication Actions ===
    case 'AUTH_INITIALIZED':
      return {
        ...state,
        auth: {
          status: 'authenticated',
          user: action.user,
          error: null,
        },
      };

    case 'AUTH_TOKEN_EXPIRED':
      return {
        ...state,
        auth: {
          ...state.auth,
          status: 'unauthenticated',
        },
      };

    // === Chat Message Actions ===
    case 'CHAT_SEND_MESSAGE':
      return {
        ...state,
        chat: {
          ...state.chat,
          status: 'sending',
          messages: [...state.chat.messages, action.message],
        },
      };

    case 'CHAT_ADD_ASSISTANT_MESSAGE':
      return {
        ...state,
        chat: {
          ...state.chat,
          messages: [
            ...state.chat.messages,
            {
              id: action.messageId,
              role: 'assistant' as const,
              content: '',
              more: {
                time: new Date().toISOString(),
              },
            },
          ],
        },
      };

    // === Chat Streaming Actions ===
    case 'CHAT_START_STREAM': {
      const newState = {
        ...state,
        chat: {
          ...state.chat,
          status: 'streaming' as const,
          currentConversationId: action.conversationId || state.chat.currentConversationId,
          streamingMessageId: action.messageId,
          error: null,
        },
        ui: {
          ...state.ui,
          chatInputEnabled: false,
        },
      };

      // Only create/persist a conversation entry if we have a user prompt or a server-assigned id.
      const hasUserMessage = !!action.userMessage || newState.chat.messages.some(msg => msg.role === 'user');
      if (!action.conversationId && !hasUserMessage) {
        // No user prompt yet and no server id: do not create a 'New Conversation' entry prematurely.
        return newState;
      }

      const pendingId = action.conversationId || `pending_${action.messageId}`;
      const conversations = JSON.parse(localStorage.getItem('chat_conversations') || '[]');
      const conversationIndex = conversations.findIndex((c: any) => c.id === pendingId || c.id === action.conversationId);

      // Extract title: prefer action.userMessage, fall back to first user message in chat, or use default
      let title = 'New Conversation';
      if (action.userMessage) {
        title = action.userMessage.substring(0, 100);
      } else {
        const firstUserMsg = newState.chat.messages.find(msg => msg.role === 'user');
        if (firstUserMsg && typeof firstUserMsg.content === 'string') {
          title = firstUserMsg.content.substring(0, 100);
        }
      }

      if (conversationIndex === -1) {
        const newConversation = {
          id: pendingId,
          title,
          createdAt: new Date().toISOString(),
          lastAccessed: new Date().toISOString(),
          messages: newState.chat.messages,
          pending: !action.conversationId,
        };
        conversations.unshift(newConversation);
      } else {
        // Update existing (likely pending) conversation
        conversations[conversationIndex].lastAccessed = new Date().toISOString();
        conversations[conversationIndex].messages = newState.chat.messages;
        conversations[conversationIndex].title = conversations[conversationIndex].title || title;
        if (action.conversationId) conversations[conversationIndex].id = action.conversationId;
      }

      // Deduplicate before saving
      const dedupedConversations = deduplicateConversations(conversations);
      localStorage.setItem('chat_conversations', JSON.stringify(dedupedConversations));
      try { window.dispatchEvent(new Event('chat_conversations_updated')); } catch { }

      return newState;
    }

    case 'CHAT_ASSIGN_CONVERSATION': {
      // When conversationId is assigned by backend (SSE), ensure it's persisted
      const convId = action.conversationId;
      const conversations = JSON.parse(localStorage.getItem('chat_conversations') || '[]');

      // Strategy: First check if this exact ID exists, then look for pending conversation
      // This prevents duplicates when the SSE event arrives
      let conversationIndex = conversations.findIndex((c: any) => c.id === convId);

      if (conversationIndex === -1) {
        // No exact match - look for a pending conversation to upgrade
        conversationIndex = conversations.findIndex((c: any) => c.pending === true);
      }

      // Build a sensible title: prefer provided title, then first user message
      let title = action.title || 'New Conversation';
      if (!action.title) {
        const firstUserMsg = state.chat.messages.find(msg => msg.role === 'user' && typeof msg.content === 'string');
        if (firstUserMsg) title = (firstUserMsg.content || '').substring(0, 100) || title;
      }

      if (conversationIndex === -1) {
        // No existing or pending conversation - create new one
        const newConversation = {
          id: convId,
          title,
          createdAt: new Date().toISOString(),
          lastAccessed: new Date().toISOString(),
          messages: state.chat.messages,
        };
        conversations.unshift(newConversation);
      } else {
        // Update existing conversation (whether it was pending or a real ID match)
        conversations[conversationIndex].id = convId;
        conversations[conversationIndex].title = conversations[conversationIndex].title || title;
        conversations[conversationIndex].lastAccessed = new Date().toISOString();
        conversations[conversationIndex].messages = state.chat.messages;
        delete conversations[conversationIndex].pending;
      }

      // Clean up any other pending conversations that might be orphaned (safety measure)
      const cleanedConversations = conversations.filter((c: any, idx: number) =>
        idx === conversationIndex || !c.pending
      );

      // Deduplicate before saving
      const dedupedConversations = deduplicateConversations(cleanedConversations);
      localStorage.setItem('chat_conversations', JSON.stringify(dedupedConversations));
      try { window.dispatchEvent(new Event('chat_conversations_updated')); } catch { }

      return {
        ...state,
        chat: {
          ...state.chat,
          currentConversationId: convId,
        },
      };
    }

    case 'CHAT_RESTORE_MESSAGE':
      return {
        ...state,
        chat: {
          ...state.chat,
          messages: [...state.chat.messages, action.message],
        },
      };

    case 'CHAT_STREAM_CHUNK': {
      // Performance optimization: only update the specific message being streamed
      const messageIndex = state.chat.messages.findIndex(
        msg => msg.id === action.messageId
      );

      if (messageIndex === -1) {
        // Message not found - return unchanged state
        return state;
      }

      // Create new array with updated message
      const updatedMessages = [...state.chat.messages];
      updatedMessages[messageIndex] = {
        ...updatedMessages[messageIndex],
        content: updatedMessages[messageIndex].content + action.content,
      };

      return {
        ...state,
        chat: {
          ...state.chat,
          messages: updatedMessages,
        },
      };
    }

    case 'CHAT_STREAM_COMPLETE': {
      // Update the completed message with usage info
      const updatedMessages = state.chat.messages.map(msg =>
        msg.id === state.chat.streamingMessageId
          ? {
            ...msg,
            more: {
              ...msg.more,
              usage: action.usage,
            },
            duration: action.usage.duration,
          }
          : msg
      );

      const newState = {
        ...state,
        chat: {
          ...state.chat,
          status: 'idle' as const,
          streamingMessageId: undefined,
          messages: updatedMessages,
        },
        ui: {
          ...state.ui,
          chatInputEnabled: true,
        },
      };

      // Update localStorage with the final messages
      if (newState.chat.currentConversationId) {
        const conversations = JSON.parse(localStorage.getItem('chat_conversations') || '[]');
        const conversationIndex = conversations.findIndex((c: any) => c.id === newState.chat.currentConversationId);
        if (conversationIndex !== -1) {
          conversations[conversationIndex].messages = updatedMessages;
          localStorage.setItem('chat_conversations', JSON.stringify(conversations));
          try { window.dispatchEvent(new Event('chat_conversations_updated')); } catch { }
        }
      }

      return newState;
    }

    case 'CHAT_CANCEL_STREAM':
      return {
        ...state,
        chat: {
          ...state.chat,
          status: 'idle',
          streamingMessageId: undefined,
        },
        ui: {
          ...state.ui,
          chatInputEnabled: true,
        },
      };

    // === Chat Error Handling ===
    case 'CHAT_ERROR':
      return {
        ...state,
        chat: {
          ...state.chat,
          status: 'error',
          error: action.error,
          streamingMessageId: undefined,
        },
        ui: {
          ...state.ui,
          chatInputEnabled: action.error.recoverable,
        },
      };

    case 'CHAT_CLEAR_ERROR':
      return {
        ...state,
        chat: {
          ...state.chat,
          error: null,
          status: 'idle',
        },
        ui: {
          ...state.ui,
          chatInputEnabled: true,
        },
      };

    case 'CHAT_CLEAR':
      return {
        ...state,
        chat: {
          status: 'idle',
          messages: [],
          currentConversationId: null,
          error: null,
          streamingMessageId: undefined,
        },
        ui: {
          ...state.ui,
          chatInputEnabled: true,
        },
      };

    case 'CHAT_RESTORE_CONVERSATION':
      return {
        ...state,
        chat: {
          ...state.chat,
          currentConversationId: action.conversationId,
          status: 'idle',
          streamingMessageId: undefined,
          error: null,
        },
        ui: {
          ...state.ui,
          chatInputEnabled: true,
        },
      };

    default:
      // TypeScript ensures all actions are handled (exhaustiveness check)
      return state;
  }
};
