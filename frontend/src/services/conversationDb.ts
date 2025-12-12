/**
 * IndexedDB service for conversation persistence
 * Provides async storage for chat conversations with better performance and capacity than localStorage
 */

import type { IChatItem } from '../types/chat';

const DB_NAME = 'ChatConversationsDB';
const DB_VERSION = 1;
const STORE_NAME = 'conversations';

export interface ConversationRecord {
    id: string;
    title: string;
    createdAt: string;
    lastAccessed: string;
    messages: IChatItem[];
}

class ConversationDatabase {
    private db: IDBDatabase | null = null;
    private initPromise: Promise<void> | null = null;

    /**
     * Initialize the database connection
     */
    async init(): Promise<void> {
        // Return existing promise if already initializing
        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                console.error('Failed to open IndexedDB:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;

                // Create conversations object store
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });

                    // Create index for sorting by lastAccessed
                    store.createIndex('lastAccessed', 'lastAccessed', { unique: false });
                }
            };
        });

        return this.initPromise;
    }

    /**
     * Ensure database is initialized
     */
    private async ensureDb(): Promise<IDBDatabase> {
        if (!this.db) {
            await this.init();
        }
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        return this.db;
    }

    /**
     * Get all conversations, sorted by lastAccessed (most recent first)
     */
    async getAllConversations(): Promise<ConversationRecord[]> {
        const db = await this.ensureDb();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();

            request.onsuccess = () => {
                const conversations = request.result as ConversationRecord[];
                // Sort by lastAccessed (most recent first)
                conversations.sort((a, b) =>
                    new Date(b.lastAccessed).getTime() - new Date(a.lastAccessed).getTime()
                );
                resolve(conversations);
            };

            request.onerror = () => {
                console.error('Failed to get conversations:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * Get a single conversation by ID
     */
    async getConversation(id: string): Promise<ConversationRecord | undefined> {
        const db = await this.ensureDb();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(id);

            request.onsuccess = () => {
                resolve(request.result as ConversationRecord | undefined);
            };

            request.onerror = () => {
                console.error('Failed to get conversation:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * Save or update a conversation
     */
    async saveConversation(conversation: ConversationRecord): Promise<void> {
        const db = await this.ensureDb();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put(conversation);

            request.onsuccess = () => {
                // Dispatch event for cross-tab/component sync
                window.dispatchEvent(new CustomEvent('indexeddb_conversations_updated'));
                resolve();
            };

            request.onerror = () => {
                console.error('Failed to save conversation:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * Delete a conversation
     */
    async deleteConversation(id: string): Promise<void> {
        const db = await this.ensureDb();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(id);

            request.onsuccess = () => {
                // Dispatch event for cross-tab/component sync
                window.dispatchEvent(new CustomEvent('indexeddb_conversations_updated'));
                resolve();
            };

            request.onerror = () => {
                console.error('Failed to delete conversation:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * Migrate data from localStorage to IndexedDB
     * This is a one-time operation that runs on first load
     */
    async migrateFromLocalStorage(): Promise<void> {
        // Check if migration has already been done
        const migrationKey = 'chat_migrated_to_indexeddb';
        if (localStorage.getItem(migrationKey) === 'true') {
            return; // Already migrated
        }

        try {
            const stored = localStorage.getItem('chat_conversations');
            if (!stored) {
                // No data to migrate
                localStorage.setItem(migrationKey, 'true');
                return;
            }

            const conversations = JSON.parse(stored) as ConversationRecord[];
            console.log(`Migrating ${conversations.length} conversations from localStorage to IndexedDB...`);

            // Save each conversation to IndexedDB
            for (const conversation of conversations) {
                await this.saveConversation(conversation);
            }

            // Mark migration as complete
            localStorage.setItem(migrationKey, 'true');

            // Optionally remove old data (keeping it for safety during beta)
            // localStorage.removeItem('chat_conversations');

            console.log('Migration complete!');
        } catch (error) {
            console.error('Migration from localStorage failed:', error);
            // Don't throw - allow app to continue with empty state
        }
    }

    /**
     * Clear all conversations (for testing)
     */
    async clearAll(): Promise<void> {
        const db = await this.ensureDb();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.clear();

            request.onsuccess = () => {
                window.dispatchEvent(new CustomEvent('indexeddb_conversations_updated'));
                resolve();
            };

            request.onerror = () => {
                console.error('Failed to clear conversations:', request.error);
                reject(request.error);
            };
        });
    }
}

// Export singleton instance
export const conversationDb = new ConversationDatabase();
