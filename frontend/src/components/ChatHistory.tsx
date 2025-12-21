import { useEffect, useState } from 'react';
import {
  Button,
  Spinner,
  Text,
  useId,
  Input,
} from '@fluentui/react-components';
import { Delete24Regular, Add24Regular, Search24Regular } from '@fluentui/react-icons';
import { conversationDb } from '../services/conversationDb';
import styles from './ChatHistory.module.css';

export interface ConversationItem {
  id: string;
  title?: string;
  createdAt: string;
  lastAccessed?: string;
}

interface ChatHistoryProps {
  onSelectConversation: (conversationId: string) => void;
  onNewChat: () => void;
  currentConversationId?: string | null;
  isLoading?: boolean;
  isVisible?: boolean;
}

export function ChatHistory({
  onSelectConversation,
  onNewChat,
  currentConversationId,
  isLoading = false,
  isVisible = true,
}: ChatHistoryProps) {
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [localLoading, setLocalLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const headingId = useId('chat-history');

  useEffect(() => {
    loadConversations();
  }, []);

  // Auto-reload when other tabs modify localStorage and refresh relative timestamps every minute
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'chat_conversations') loadConversations();
    };

    const tickInterval = setInterval(() => {
      // Force re-render to update timeAgo labels
      setLocalLoading((v) => v ? v : false);
    }, 60_000);

    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      clearInterval(tickInterval);
    };
  }, []);

  // Listen for IndexedDB changes (cross-tab/component sync)
  useEffect(() => {
    const handler = () => loadConversations();
    window.addEventListener('indexeddb_conversations_updated', handler);

    return () => {
      window.removeEventListener('indexeddb_conversations_updated', handler);
    };
  }, []);

  const loadConversations = async () => {
    setLocalLoading(true);
    try {
      // Load from IndexedDB
      const stored = await conversationDb.getAllConversations();
      setConversations(stored);
    } catch (error) {
      console.error('Failed to load chat history:', error);
    } finally {
      setLocalLoading(false);
    }
  };

  const handleDeleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await conversationDb.deleteConversation(id);

      // Also remove from localStorage to keep sync consistent
      const stored = localStorage.getItem('chat_conversations');
      if (stored) {
        const conversations = JSON.parse(stored);
        const updated = conversations.filter((c: any) => c.id !== id);
        localStorage.setItem('chat_conversations', JSON.stringify(updated));
      }

      // Optimistically update UI
      setConversations((prev) => prev.filter((c) => c.id !== id));
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    }
  };

  const handleSelectConversation = (id: string) => {
    onSelectConversation(id);
  };

  const sortedConversations = [...conversations].sort(
    (a, b) =>
      new Date(b.lastAccessed || b.createdAt).getTime() -
      new Date(a.lastAccessed || a.createdAt).getTime()
  );

  const filteredConversations = sortedConversations.filter((conv) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const titleMatch = (conv.title || '').toLowerCase().includes(query);
    // Since we don't load messages here, we only search by title for now
    // To search messages, we'd need to fetch them or index them separately
    return titleMatch;
  });

  const formatTime = (iso?: string) => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      const now = new Date();
      const isToday = d.toDateString() === now.toDateString();

      if (isToday) {
        // Show time for today's conversations (e.g., "12:22:45 PM")
        return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' });
      } else {
        // Show date AND time for older conversations (e.g., "Dec 11, 12:22:45 PM")
        const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        const timeStr = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' });
        return `${dateStr}, ${timeStr}`;
      }
    } catch {
      return iso;
    }
  };

  const formatFullDate = (iso?: string) => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
    } catch {
      return iso;
    }
  };

  return (
    <div className={`${styles.chatHistory} ${!isVisible ? styles.hidden : ''}`}>
      <div className={styles.header}>
        <Text as="h2" id={headingId} className={styles.title}>
          Chat History
        </Text>
        <Button
          icon={<Add24Regular />}
          appearance="transparent"
          onClick={onNewChat}
          title="Start a new conversation"
          aria-label="Start new conversation"
        />
      </div>

      <div className={styles.searchContainer}>
        <Input
          contentBefore={<Search24Regular />}
          placeholder="Search conversations..."
          value={searchQuery}
          onChange={(_e, data) => setSearchQuery(data.value)}
          className={styles.searchInput}
          aria-label="Search conversations"
        />
      </div>

      <div className={styles.listContainer}>

        {localLoading || isLoading ? (
          <div className={styles.spinnerContainer}>
            <Spinner size="small" />
            <Text size={200}>Loading conversations...</Text>
          </div>
        ) : filteredConversations.length === 0 ? (
          <Text size={200} className={styles.emptyState}>
            {searchQuery ? 'No conversations found.' : 'No conversations yet. Start a new chat!'}
          </Text>
        ) : (
          <ul className={styles.conversationList} role="list">
            {filteredConversations.map((conv) => (
              <li key={conv.id} role="listitem">
                <button
                  className={`${styles.conversationItem} ${currentConversationId === conv.id ? styles.active : ''
                    }`}
                  onClick={() => handleSelectConversation(conv.id)}
                  title={conv.title || 'Untitled conversation'}
                >
                  <div className={styles.conversationContent}>
                    <Text
                      weight="medium"
                      size={200}
                      className={styles.conversationTitle}
                    >
                      {conv.title || 'Untitled'}
                    </Text>
                    <div className={styles.conversationDateWrap}>
                      <Text size={100} className={styles.conversationTime}>
                        {conv.lastAccessed ? formatTime(conv.lastAccessed) : formatTime(conv.createdAt)}
                      </Text>
                      <Text size={100} className={styles.conversationDate}>
                        {formatFullDate(conv.lastAccessed || conv.createdAt)}
                      </Text>
                    </div>
                  </div>
                </button>
                <Button
                  icon={<Delete24Regular />}
                  appearance="transparent"
                  size="small"
                  onClick={(e) => handleDeleteConversation(conv.id, e)}
                  title="Delete conversation"
                  aria-label={`Delete conversation: ${conv.title || 'Untitled'}`}
                  className={styles.deleteButton}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
