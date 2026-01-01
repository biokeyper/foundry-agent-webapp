import { AuthenticatedTemplate, UnauthenticatedTemplate, useMsalAuthentication } from "@azure/msal-react";
import { Spinner, Button } from '@fluentui/react-components';
import { Navigation24Regular, NavigationUnread24Regular } from '@fluentui/react-icons';
import { useAppState } from './hooks/useAppState';
import { InteractionType } from "@azure/msal-browser";
import { ErrorBoundary } from "./components/core/ErrorBoundary";
import { AgentPreview } from "./components/AgentPreview";
import { ChatHistory } from "./components/ChatHistory";
import { loginRequest } from "./config/authConfig";
import { useState, useEffect } from "react";
import { useAuth } from "./hooks/useAuth";
import { conversationDb } from "./services/conversationDb";
import type { IAgentMetadata } from "./types/chat";
import "./App.css";

export interface ChatInterfaceRef {
  clearChat: () => void;
  loadConversation: (conversationId: string) => Promise<void>;
}

function App() {
  // This hook handles authentication automatically - redirects if not authenticated
  useMsalAuthentication(InteractionType.Redirect, loginRequest);
  const { auth, dispatch } = useAppState();
  const { getAccessToken } = useAuth();
  const [agentMetadata, setAgentMetadata] = useState<IAgentMetadata | null>(null);
  const [isLoadingAgent, setIsLoadingAgent] = useState(true);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [isNavVisible, setIsNavVisible] = useState(() => {
    // Load nav visibility from localStorage (default: true)
    const stored = localStorage.getItem('chat_nav_visible');
    return stored !== null ? stored === 'true' : true;
  });

  useEffect(() => {
    const fetchAgentMetadata = async () => {
      if (auth.status !== 'authenticated') return;

      try {
        const token = await getAccessToken();
        const apiUrl = import.meta.env.VITE_API_URL || '/api';

        const response = await fetch(`${apiUrl}/agent`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        setAgentMetadata(data);

        // Update document title with agent name
        document.title = data.name ? `${data.name} - Your Legal Companion` : 'Legal AI';
      } catch (error) {
        console.error('Error fetching agent metadata:', error);
        // Fallback data keeps UI functional on error
        setAgentMetadata({
          id: 'fallback-agent',
          object: 'agent',
          createdAt: Date.now() / 1000,
          name: 'Azure AI Agent',
          description: 'Your intelligent conversational partner powered by Azure AI',
          model: 'gpt-4o-mini',
          metadata: { logo: 'Avatar_Default.svg' }
        });
        document.title = 'Azure AI Agent';
      } finally {
        setIsLoadingAgent(false);
      }
    };

    fetchAgentMetadata();
  }, [auth.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist nav visibility to localStorage
  useEffect(() => {
    localStorage.setItem('chat_nav_visible', String(isNavVisible));
  }, [isNavVisible]);

  // Initialize IndexedDB and migrate data on mount
  useEffect(() => {
    const initDb = async () => {
      try {
        await conversationDb.init();
        await conversationDb.migrateFromLocalStorage();
      } catch (error) {
        console.error('Failed to initialize IndexedDB:', error);
      }
    };
    initDb();
  }, []);



  // Sync localStorage (updated by reducer) to IndexedDB
  useEffect(() => {
    const syncHandler = async () => {
      try {
        const stored = localStorage.getItem('chat_conversations');
        if (stored) {
          const conversations = JSON.parse(stored);
          // Sync all to IndexedDB
          for (const conv of conversations) {
            await conversationDb.saveConversation(conv);
          }

          // Cleanup: remove any orphaned conversations from IndexedDB
          try {
            const existing = await conversationDb.getAllConversations();
            const keepIds = new Set(conversations.map((c: any) => c.id));
            for (const ex of existing) {
              if (!keepIds.has(ex.id)) {
                await conversationDb.deleteConversation(ex.id);
              }
            }
          } catch (cleanupError) {
            console.error('Failed to cleanup IndexedDB conversations:', cleanupError);
          }

          // Notify components to reload
          window.dispatchEvent(new CustomEvent('indexeddb_conversations_updated'));
        }
      } catch (error) {
        console.error('Failed to sync conversations:', error);
      }
    };

    window.addEventListener('chat_conversations_updated', syncHandler as EventListener);

    // Initial sync on mount to catch any missed updates
    syncHandler();

    return () => {
      window.removeEventListener('chat_conversations_updated', syncHandler as EventListener);
    };
  }, []);

  return (
    <ErrorBoundary>
      {auth.status === 'initializing' || isLoadingAgent ? (
        <div className="app-container" style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          flexDirection: 'column',
          gap: '1rem'
        }}>
          <Spinner size="large" />
          <p style={{ margin: 0 }}>
            {auth.status === 'initializing' ? 'Preparing your session...' : 'Loading agent...'}
          </p>
        </div>
      ) : (
        <>
          <AuthenticatedTemplate>
            {agentMetadata && (
              <div className="app-layout">
                <ChatHistory
                  isVisible={isNavVisible}
                  onSelectConversation={(id) => {
                    setSelectedConversationId(id);
                    // Load messages from localStorage
                    const conversations = JSON.parse(localStorage.getItem('chat_conversations') || '[]');
                    const conversation = conversations.find((c: any) => c.id === id);
                    if (conversation && conversation.messages) {
                      // Clear current state
                      dispatch({ type: 'CHAT_CLEAR' });
                      // Restore each message (without affecting status)
                      conversation.messages.forEach((msg: any) => {
                        dispatch({ type: 'CHAT_RESTORE_MESSAGE', message: msg });
                      });
                      // Restore the conversation state (sets currentConversationId and unlocks input)
                      dispatch({
                        type: 'CHAT_RESTORE_CONVERSATION',
                        conversationId: id,
                      });
                    }
                  }}
                  onNewChat={() => {
                    setSelectedConversationId(null);
                    dispatch({ type: 'CHAT_CLEAR' });
                  }}
                  currentConversationId={selectedConversationId}
                />
                <div className="app-main">
                  <Button
                    icon={isNavVisible ? <NavigationUnread24Regular /> : <Navigation24Regular />}
                    appearance="subtle"
                    onClick={() => setIsNavVisible(!isNavVisible)}
                    title={isNavVisible ? "Hide chat history" : "Show chat history"}
                    aria-label={isNavVisible ? "Hide chat history" : "Show chat history"}
                    style={{
                      position: 'absolute',
                      top: '16px',
                      left: '16px',
                      zIndex: 10,
                    }}
                  />
                  <AgentPreview
                    agentId={agentMetadata.id}
                    agentName={agentMetadata.name}
                    agentDescription={agentMetadata.description || undefined}
                    agentLogo={agentMetadata.metadata?.logo}
                    conversationId={selectedConversationId}
                  />
                </div>
              </div>
            )}
          </AuthenticatedTemplate>
          <UnauthenticatedTemplate>
            <div className="app-container" style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100vh'
            }}>
              <p>Signing in...</p>
            </div>
          </UnauthenticatedTemplate>
        </>
      )}
    </ErrorBoundary>
  );
}

export default App;
