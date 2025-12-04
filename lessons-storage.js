/**
 * Lessons Storage Manager
 * Handles storage of AI-generated lessons using IndexedDB for large capacity
 * Falls back to localStorage for compatibility
 */

class LessonsStorage {
    constructor() {
        this.dbName = 'LessonsDB';
        this.dbVersion = 1;
        this.db = null;
        this.useIndexedDB = true;
        this.initialized = false;
    }

    /**
     * Initialize IndexedDB
     */
    async init() {
        if (this.initialized) return true;

        // Check if IndexedDB is available
        if (!window.indexedDB) {
            console.warn('IndexedDB not available, falling back to localStorage');
            this.useIndexedDB = false;
            this.initialized = true;
            return true;
        }

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => {
                console.error('Failed to open IndexedDB:', request.error);
                this.useIndexedDB = false;
                this.initialized = true;
                resolve(true); // Resolve anyway, we'll use localStorage
            };

            request.onsuccess = () => {
                this.db = request.result;
                this.initialized = true;
                console.log('✅ IndexedDB initialized for lessons storage');

                // Migrate existing data from localStorage if needed
                this.migrateFromLocalStorage();

                resolve(true);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Create object stores
                if (!db.objectStoreNames.contains('lessons')) {
                    db.createObjectStore('lessons', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('metadata')) {
                    db.createObjectStore('metadata', { keyPath: 'key' });
                }
            };
        });
    }

    /**
     * Migrate data from localStorage to IndexedDB
     */
    async migrateFromLocalStorage() {
        try {
            // Check if we've already migrated
            const migrated = await this.getMetadata('migrated');
            if (migrated) return;

            const lessonsStr = localStorage.getItem('aiLessons');

            if (lessonsStr) {
                const lessons = JSON.parse(lessonsStr);
                for (const lesson of lessons) {
                    await this.saveLesson(lesson);
                }
                console.log(`✅ Migrated ${lessons.length} lessons to IndexedDB`);
            }

            // Mark as migrated
            await this.saveMetadata('migrated', true);
        } catch (error) {
            console.error('Migration error:', error);
        }
    }

    /**
     * Save a single lesson
     */
    async saveLesson(lesson) {
        await this.init();

        if (this.useIndexedDB && this.db) {
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction(['lessons'], 'readwrite');
                const store = transaction.objectStore('lessons');
                const request = store.put(lesson);

                request.onsuccess = () => resolve(true);
                request.onerror = () => {
                    console.error('Failed to save lesson to IndexedDB:', request.error);
                    reject(request.error);
                };
            });
        } else {
            // Fallback to localStorage (may fail for large lessons)
            return this.saveToLocalStorage('aiLessons', lesson, true);
        }
    }

    /**
     * Get all lessons
     */
    async getAllLessons() {
        await this.init();

        if (this.useIndexedDB && this.db) {
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction(['lessons'], 'readonly');
                const store = transaction.objectStore('lessons');
                const request = store.getAll();

                request.onsuccess = () => resolve(request.result || []);
                request.onerror = () => {
                    console.error('Failed to get lessons from IndexedDB:', request.error);
                    resolve([]);
                };
            });
        } else {
            // Fallback to localStorage
            const lessonsStr = localStorage.getItem('aiLessons');
            return lessonsStr ? JSON.parse(lessonsStr) : [];
        }
    }

    /**
     * Get a single lesson by ID
     */
    async getLesson(lessonId) {
        await this.init();

        if (this.useIndexedDB && this.db) {
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction(['lessons'], 'readonly');
                const store = transaction.objectStore('lessons');
                const request = store.get(lessonId);

                request.onsuccess = () => resolve(request.result);
                request.onerror = () => resolve(null);
            });
        } else {
            const lessons = await this.getAllLessons();
            return lessons.find(l => l.id === lessonId);
        }
    }

    /**
     * Delete a lesson
     */
    async deleteLesson(lessonId) {
        await this.init();

        if (this.useIndexedDB && this.db) {
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction(['lessons'], 'readwrite');
                const store = transaction.objectStore('lessons');
                const request = store.delete(lessonId);

                request.onsuccess = () => resolve(true);
                request.onerror = () => reject(request.error);
            });
        } else {
            // Fallback to localStorage
            const lessons = await this.getAllLessons();
            const filtered = lessons.filter(l => l.id !== lessonId);
            return this.saveAllLessons(filtered);
        }
    }

    /**
     * Save all lessons at once
     */
    async saveAllLessons(lessons) {
        await this.init();

        if (this.useIndexedDB && this.db) {
            // Clear existing and save all
            const transaction = this.db.transaction(['lessons'], 'readwrite');
            const store = transaction.objectStore('lessons');

            await new Promise((resolve) => {
                const clearRequest = store.clear();
                clearRequest.onsuccess = resolve;
            });

            for (const lesson of lessons) {
                await this.saveLesson(lesson);
            }
            return true;
        } else {
            // Try localStorage
            try {
                localStorage.setItem('aiLessons', JSON.stringify(lessons));
                return true;
            } catch (e) {
                if (e.name === 'QuotaExceededError' || e.code === 22) {
                    throw new Error('Storage quota exceeded. Your lesson is too large. Please enable IndexedDB in your browser or reduce lesson size.');
                }
                throw e;
            }
        }
    }

    /**
     * Save metadata
     */
    async saveMetadata(key, value) {
        await this.init();

        if (this.useIndexedDB && this.db) {
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction(['metadata'], 'readwrite');
                const store = transaction.objectStore('metadata');
                const request = store.put({ key, value });

                request.onsuccess = () => resolve(true);
                request.onerror = () => reject(request.error);
            });
        }
        return true;
    }

    /**
     * Get metadata
     */
    async getMetadata(key) {
        await this.init();

        if (this.useIndexedDB && this.db) {
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction(['metadata'], 'readonly');
                const store = transaction.objectStore('metadata');
                const request = store.get(key);

                request.onsuccess = () => resolve(request.result?.value);
                request.onerror = () => resolve(null);
            });
        }
        return null;
    }

    /**
     * Helper: Save to localStorage with array handling
     */
    saveToLocalStorage(storageKey, item, isArrayItem = false) {
        try {
            if (isArrayItem) {
                const existing = localStorage.getItem(storageKey);
                const array = existing ? JSON.parse(existing) : [];
                const index = array.findIndex(i => i.id === item.id);

                if (index >= 0) {
                    array[index] = item;
                } else {
                    array.push(item);
                }

                localStorage.setItem(storageKey, JSON.stringify(array));
            } else {
                localStorage.setItem(storageKey, JSON.stringify(item));
            }
            return true;
        } catch (e) {
            if (e.name === 'QuotaExceededError' || e.code === 22) {
                throw new Error('Storage quota exceeded. Your data is too large for localStorage. Please enable IndexedDB support in your browser.');
            }
            throw e;
        }
    }

    /**
     * Get storage info
     */
    async getStorageInfo() {
        await this.init();

        return {
            type: this.useIndexedDB ? 'IndexedDB' : 'LocalStorage',
            lessonsCount: (await this.getAllLessons()).length
        };
    }
}

// Create global instance
window.lessonsStorage = new LessonsStorage();
