/* indexedDB.js */
/* ★ deleteScenarioById 内のカーソル処理と非同期管理を修正 */
/* ★ isFavorite インデックス追加済み、DBバージョン 19 */
/* ★ export を使用、省略なし */

let db = null;

export function initIndexedDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('trpgDB', 19); // ★ Version 19

        request.onupgradeneeded = (event) => {
            console.log('[IndexedDB] onupgradeneeded event triggered.');
            db = event.target.result;
            const tx = event.target.transaction;
            // (各ストア定義 - isFavorite インデックス追加済み)
            if (!db.objectStoreNames.contains('characterData')) {
                db.createObjectStore('characterData', { keyPath: 'id' });
            }
            let scenarioStore;
            if (!db.objectStoreNames.contains('scenarios')) {
                scenarioStore = db.createObjectStore('scenarios', {
                    keyPath: 'scenarioId',
                    autoIncrement: true,
                });
                scenarioStore.createIndex('updatedAt', 'updatedAt', { unique: false });
                scenarioStore.createIndex('isFavorite', 'isFavorite', { unique: false });
            } else {
                if (tx) {
                    scenarioStore = tx.objectStore('scenarios');
                    if (!scenarioStore.indexNames.contains('isFavorite'))
                        scenarioStore.createIndex('isFavorite', 'isFavorite', { unique: false });
                    if (!scenarioStore.indexNames.contains('updatedAt'))
                        scenarioStore.createIndex('updatedAt', 'updatedAt', { unique: false });
                }
            }
            if (!db.objectStoreNames.contains('sceneEntries')) {
                const store = db.createObjectStore('sceneEntries', {
                    keyPath: 'entryId',
                    autoIncrement: true,
                });
                store.createIndex('scenarioId', 'scenarioId', { unique: false });
                try {
                    store.createIndex('content_en', 'content_en');
                } catch (e) {}
            }
            if (!db.objectStoreNames.contains('wizardState')) {
                db.createObjectStore('wizardState', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('parties')) {
                const store = db.createObjectStore('parties', {
                    keyPath: 'partyId',
                    autoIncrement: true,
                });
                store.createIndex('updatedAt', 'updatedAt');
            }
            if (!db.objectStoreNames.contains('bgImages')) {
                db.createObjectStore('bgImages', { keyPath: 'id', autoIncrement: true });
            }
            if (!db.objectStoreNames.contains('sceneSummaries')) {
                const store = db.createObjectStore('sceneSummaries', {
                    keyPath: 'summaryId',
                    autoIncrement: true,
                });
                store.createIndex('chunkIndex', 'chunkIndex');
            }
            if (!db.objectStoreNames.contains('endings')) {
                db.createObjectStore('endings', { keyPath: ['scenarioId', 'type'] });
            }
            if (!db.objectStoreNames.contains('avatarData')) {
                db.createObjectStore('avatarData', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('entities')) {
                const store = db.createObjectStore('entities', {
                    keyPath: 'entityId',
                    autoIncrement: true,
                });
                store.createIndex('scenarioId', 'scenarioId');
            }
            if (!db.objectStoreNames.contains('universalSaves')) {
                db.createObjectStore('universalSaves', { keyPath: 'slotIndex' });
            }
            if (!db.objectStoreNames.contains('modelCache')) {
                db.createObjectStore('modelCache', { keyPath: 'id' });
            }
            console.log('[IndexedDB] onupgradeneeded finished.');
        };
        request.onsuccess = (event) => {
            db = event.target.result;
            console.log(`[IndexedDB] DB opened (v${db.version}).`);
            window.db = db;
            resolve();
        };
        request.onerror = (event) => {
            console.error('[IndexedDB] DB error:', event.target.error);
            reject(event.target.error);
        };
        request.onblocked = () => {
            console.warn('[IndexedDB] DB open blocked.');
            alert('DB更新ブロック。他タブ閉じてリロード要。');
            reject(new Error('DB open blocked'));
        };
    });
}

// --- トランザクションヘルパー ---
function getStore(storeName, mode = 'readonly') {
    if (!window.db) throw new Error('DB not initialized.');
    try {
        const tx = window.db.transaction(storeName, mode);
        tx.onerror = (e) => console.error(`[DB] Tx error on ${storeName}:`, e.target.error);
        return tx.objectStore(storeName);
    } catch (e) {
        console.error(`[DB] Error getting store ${storeName}:`, e);
        throw e;
    }
}

// --- 各ストアアクセス関数 (export 付き、省略なし) ---
export function createNewScenario(wizardData, title = '新シナリオ') {
    /* (省略なし) */ return new Promise((resolve, reject) => {
        try {
            const store = getStore('scenarios', 'readwrite');
            const now = new Date().toISOString();
            const record = {
                title: String(title),
                wizardData: wizardData || {},
                createdAt: now,
                updatedAt: now,
                bookShelfFlag: false,
                hideFromHistoryFlag: false,
                isFavorite: false,
            };
            const req = store.add(record);
            req.onsuccess = (e) => resolve(e.target.result);
            req.onerror = (e) => reject(e.target.error);
        } catch (e) {
            reject(e);
        }
    });
}
export function updateScenario(scenario, noUpdateDateTimeFlag = false) {
    /* (省略なし) */ return new Promise((resolve, reject) => {
        if (!scenario?.scenarioId) return reject(new Error('Invalid scenario'));
        try {
            const store = getStore('scenarios', 'readwrite');
            if (!noUpdateDateTimeFlag) scenario.updatedAt = new Date().toISOString();
            scenario.bookShelfFlag = scenario.bookShelfFlag || false;
            scenario.hideFromHistoryFlag = scenario.hideFromHistoryFlag || false;
            scenario.isFavorite = scenario.isFavorite || false;
            if (scenario.bookShelfFlag && typeof scenario.shelfOrder !== 'number')
                scenario.shelfOrder = Date.now();
            const req = store.put(scenario);
            req.onsuccess = resolve;
            req.onerror = (e) => reject(e.target.error);
        } catch (e) {
            reject(e);
        }
    });
}
export function getScenarioById(scenarioId) {
    /* (省略なし) */ return new Promise((resolve, reject) => {
        if (typeof scenarioId !== 'number') return resolve(null);
        try {
            const store = getStore('scenarios');
            const req = store.get(scenarioId);
            req.onsuccess = (e) => resolve(e.target.result || null);
            req.onerror = (e) => reject(e.target.error);
        } catch (e) {
            reject(e);
        }
    });
}
export function listAllScenarios() {
    /* (省略なし) */ return new Promise((resolve, reject) => {
        try {
            const store = getStore('scenarios');
            const req = store.getAll();
            req.onsuccess = (e) => {
                const res = e.target.result || [];
                res.forEach((s) => {
                    s.bookShelfFlag = s.bookShelfFlag || false;
                    s.hideFromHistoryFlag = s.hideFromHistoryFlag || false;
                    s.isFavorite = s.isFavorite || false;
                });
                res.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
                resolve(res);
            };
            req.onerror = (e) => reject(e.target.error);
        } catch (e) {
            reject(e);
        }
    });
}

/**
 * シナリオ削除 (関連データも) (★ イベントハンドラベースに修正 v5)
 * @param {number} scenarioId 削除するシナリオのID
 * @returns {Promise<void>} 削除が成功したら解決される Promise
 */
export function deleteScenarioById(scenarioId) {
    return new Promise((resolve, reject) => {
        if (!window.db) return reject(new Error('DB未初期化'));
        if (typeof scenarioId !== 'number' || isNaN(scenarioId)) {
            return reject(new Error(`不正なシナリオID: ${scenarioId}`));
        }

        const storesToAccess = [
            'scenarios',
            'sceneEntries',
            'entities',
            'endings',
            'universalSaves',
        ];
        let tx;
        console.log(`[IndexedDB] Starting deletion transaction for scenario ${scenarioId}...`);

        try {
            tx = window.db.transaction(storesToAccess, 'readwrite');
            let deleteCount = {
                scenarios: 0,
                sceneEntries: 0,
                entities: 0,
                endings: 0,
                universalSaves: 0,
            };

            // トランザクション全体のイベントハンドラ
            tx.oncomplete = () => {
                console.log(
                    `[IndexedDB] Deletion transaction completed for scenario ${scenarioId}. Counts:`,
                    deleteCount
                );
                resolve();
            };
            tx.onerror = (event) => {
                console.error(
                    `[IndexedDB] Deletion transaction error for scenario ${scenarioId}:`,
                    event.target.error
                );
                reject(event.target.error || new Error('トランザクションエラー'));
            };
            tx.onabort = () => {
                console.warn(
                    `[IndexedDB] Deletion transaction aborted for scenario ${scenarioId}.`
                );
                reject(new Error('トランザクションが中断'));
            };

            // 各ストアオブジェクト取得
            const scenarioStore = tx.objectStore('scenarios');
            const sceneEntriesStore = tx.objectStore('sceneEntries');
            const entitiesStore = tx.objectStore('entities');
            const endingsStore = tx.objectStore('endings');
            const universalSavesStore = tx.objectStore('universalSaves');

            // --- 1) シナリオ本体削除 ---
            const scDeleteReq = scenarioStore.delete(scenarioId);
            scDeleteReq.onsuccess = () => {
                deleteCount.scenarios++;
                console.log(`[DB] scenarios delete request issued for ${scenarioId}`);
            };
            // scDeleteReq.onerror は tx.onerror で捕捉

            // --- 2) SceneEntries 削除 ---
            const seIndex = sceneEntriesStore.index('scenarioId');
            const seCursorReq = seIndex.openCursor(IDBKeyRange.only(scenarioId));
            seCursorReq.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    const key = cursor.primaryKey;
                    const req = sceneEntriesStore.delete(key); // ★ ストアの delete を使う
                    req.onsuccess = () => {
                        deleteCount.sceneEntries++;
                    };
                    cursor.continue(); // ★ 同期的に continue
                } else {
                    console.log(
                        `[DB] sceneEntries delete requests issued (approx ${deleteCount.sceneEntries}).`
                    );
                }
            };
            // seCursorReq.onerror は tx.onerror で捕捉

            // --- 3) Entities 削除 ---
            const enIndex = entitiesStore.index('scenarioId');
            const enCursorReq = enIndex.openCursor(IDBKeyRange.only(scenarioId));
            enCursorReq.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    const key = cursor.primaryKey;
                    const req = entitiesStore.delete(key); // ★ ストアの delete
                    req.onsuccess = () => {
                        deleteCount.entities++;
                    };
                    cursor.continue();
                } else {
                    console.log(
                        `[DB] entities delete requests issued (approx ${deleteCount.entities}).`
                    );
                }
            };
            // enCursorReq.onerror は tx.onerror で捕捉

            // --- 4) Endings 削除 ---
            const endingRange = IDBKeyRange.bound([scenarioId, ''], [scenarioId, '\uffff']);
            const edCursorReq = endingsStore.openCursor(endingRange);
            edCursorReq.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    const key = cursor.primaryKey;
                    const req = endingsStore.delete(key); // ★ ストアの delete
                    req.onsuccess = () => {
                        deleteCount.endings++;
                    };
                    cursor.continue();
                } else {
                    console.log(
                        `[DB] endings delete requests issued (approx ${deleteCount.endings}).`
                    );
                }
            };
            // edCursorReq.onerror は tx.onerror で捕捉

            // --- 5) UniversalSaves クリア ---
            const usCursorReq = universalSavesStore.openCursor();
            usCursorReq.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    if (cursor.value?.data?.scenarioId === scenarioId) {
                        const updatedSlot = { ...cursor.value, data: null };
                        // ★ update リクエストを発行
                        const req = cursor.update(updatedSlot);
                        req.onsuccess = () => {
                            deleteCount.universalSaves++;
                        };
                    }
                    cursor.continue(); // ★ update の完了を待たずに continue
                } else {
                    console.log(
                        `[DB] universalSaves update requests issued (approx ${deleteCount.universalSaves}).`
                    );
                }
            };
            // usCursorReq.onerror は tx.onerror で捕捉

            // ★ ここで Promise.all は使わない。トランザクションの完了を待つ。
        } catch (err) {
            // トランザクション開始時などの同期エラー
            console.error(
                `[IndexedDB] Error starting deletion transaction for scenario ${scenarioId}:`,
                err
            );
            reject(err);
            // トランザクションが開始されていれば abort を試みる (オプション)
            if (tx && tx.readyState !== 'done' && typeof tx.abort === 'function') {
                try {
                    tx.abort();
                } catch (abortErr) {}
            }
        }
    });
}

/* --- シーン履歴 (sceneEntries) --- */
export function addSceneEntry(entry) {
    /* (省略なし) */ return new Promise((resolve, reject) => {
        if (!entry?.scenarioId || !entry.type) return reject(new Error('Invalid entry'));
        try {
            const store = getStore('sceneEntries', 'readwrite');
            const req = store.add(entry);
            req.onsuccess = (e) => resolve(e.target.result);
            req.onerror = (e) => reject(e.target.error);
        } catch (e) {
            reject(e);
        }
    });
}
export function updateSceneEntry(entry) {
    /* (省略なし) */ return new Promise((resolve, reject) => {
        if (!entry?.entryId) return reject(new Error('Invalid entry or ID'));
        try {
            const store = getStore('sceneEntries', 'readwrite');
            const req = store.put(entry);
            req.onsuccess = resolve;
            req.onerror = (e) => reject(e.target.error);
        } catch (e) {
            reject(e);
        }
    });
}
export function getSceneEntriesByScenarioId(scenarioId) {
    /* (省略なし) */ return new Promise((resolve, reject) => {
        if (typeof scenarioId !== 'number') return resolve([]);
        try {
            const store = getStore('sceneEntries');
            const idx = store.index('scenarioId');
            const req = idx.getAll(IDBKeyRange.only(scenarioId));
            req.onsuccess = (e) => {
                const res = e.target.result || [];
                res.sort((a, b) => (a.entryId || 0) - (b.entryId || 0));
                resolve(res);
            };
            req.onerror = (e) => reject(e.target.error);
        } catch (e) {
            reject(e);
        }
    });
}
export function deleteSceneEntry(entryId) {
    /* (省略なし) */ return new Promise((resolve, reject) => {
        if (typeof entryId !== 'number') return reject(new Error('Invalid ID'));
        try {
            const store = getStore('sceneEntries', 'readwrite');
            const req = store.delete(entryId);
            req.onsuccess = resolve;
            req.onerror = (e) => reject(e.target.error);
        } catch (e) {
            reject(e);
        }
    });
}

/* --- シーン要約 (sceneSummaries) --- */
export function addSceneSummaryRecord(summaryObj) {
    /* (省略なし) */ return new Promise((resolve, reject) => {
        if (!summaryObj || typeof summaryObj.chunkIndex !== 'number')
            return reject(new Error('Invalid summary obj'));
        try {
            const store = getStore('sceneSummaries', 'readwrite');
            const req = store.add(summaryObj);
            req.onsuccess = (e) => resolve(e.target.result);
            req.onerror = (e) => reject(e.target.error);
        } catch (e) {
            reject(e);
        }
    });
}
export function getSceneSummaryByChunkIndex(chunkIndex) {
    /* (省略なし) */ return new Promise(async (resolve, reject) => {
        if (typeof chunkIndex !== 'number') return resolve(null);
        try {
            const store = getStore('sceneSummaries');
            const idx = store.index('chunkIndex');
            const req = idx.getAll(IDBKeyRange.only(chunkIndex));
            req.onsuccess = (e) => resolve(e.target.result?.[0] || null);
            req.onerror = (e) => reject(e.target.error);
        } catch (e) {
            reject(e);
        }
    });
}
export function updateSceneSummaryRecord(summaryObj) {
    /* (省略なし) */ return new Promise((resolve, reject) => {
        if (!summaryObj?.summaryId) return reject(new Error('Invalid summary or ID'));
        try {
            const store = getStore('sceneSummaries', 'readwrite');
            const req = store.put(summaryObj);
            req.onsuccess = resolve;
            req.onerror = (e) => reject(e.target.error);
        } catch (e) {
            reject(e);
        }
    });
}
export function deleteSceneSummaryByChunkIndex(chunkIndex) {
    /* (省略なし) */ return new Promise(async (resolve, reject) => {
        if (!window.db) return reject(new Error('DB init error'));
        if (typeof chunkIndex !== 'number') return reject(new Error('Invalid index'));
        try {
            const store = getStore('sceneSummaries', 'readwrite');
            const idx = store.index('chunkIndex');
            const keysReq = idx.getAllKeys(IDBKeyRange.only(chunkIndex));
            keysReq.onsuccess = async (e) => {
                const keys = e.target.result || [];
                if (keys.length === 0) {
                    resolve();
                    return;
                }
                try {
                    const proms = keys.map(
                        (k) =>
                            new Promise((res, rej) => {
                                store.delete(k).onsuccess = res;
                            })
                    );
                    await Promise.all(proms);
                    resolve();
                } catch (delErr) {
                    reject(delErr);
                }
            };
            keysReq.onerror = (e) => reject(e.target.error);
        } catch (e) {
            reject(e);
        }
    });
}

/* --- キャラデータ (characterData) --- */
export function saveCharacterDataToIndexedDB(characterDataArray) {
    /* (省略なし) */ return new Promise((resolve, reject) => {
        if (!Array.isArray(characterDataArray)) return reject(new Error('Invalid data type'));
        try {
            const store = getStore('characterData', 'readwrite');
            const record = { id: 'characterData', data: characterDataArray };
            const req = store.put(record);
            req.onsuccess = resolve;
            req.onerror = (e) => reject(e.target.error);
        } catch (e) {
            reject(e);
        }
    });
}
export function loadCharacterDataFromIndexedDB() {
    /* (省略なし) */ return new Promise((resolve, reject) => {
        try {
            const store = getStore('characterData');
            const req = store.get('characterData');
            req.onsuccess = (e) => resolve(e.target.result?.data || []);
            req.onerror = (e) => reject(e.target.error);
        } catch (e) {
            reject(e);
        }
    });
}

/* --- ウィザード状態 (wizardState) --- */
export function saveWizardDataToIndexedDB(wizardData) {
    /* (省略なし) */ return new Promise((resolve, reject) => {
        if (typeof wizardData !== 'object' || wizardData === null)
            return reject(new Error('Invalid data type'));
        try {
            const store = getStore('wizardState', 'readwrite');
            const record = { id: 'wizardData', data: wizardData };
            const req = store.put(record);
            req.onsuccess = resolve;
            req.onerror = (e) => reject(e.target.error);
        } catch (e) {
            reject(e);
        }
    });
}
export function loadWizardDataFromIndexedDB() {
    /* (省略なし) */ return new Promise((resolve, reject) => {
        try {
            const store = getStore('wizardState');
            const req = store.get('wizardData');
            req.onsuccess = (e) => resolve(e.target.result?.data || null);
            req.onerror = (e) => reject(e.target.error);
        } catch (e) {
            reject(e);
        }
    });
}

/* --- パーティ (parties) --- */
export function createParty(name = '新パーティ') {
    /* (省略なし) */ return new Promise((resolve, reject) => {
        try {
            const store = getStore('parties', 'readwrite');
            const now = new Date().toISOString();
            const rec = { name: String(name), createdAt: now, updatedAt: now };
            const req = store.add(rec);
            req.onsuccess = (e) => resolve(e.target.result);
            req.onerror = (e) => reject(e.target.error);
        } catch (e) {
            reject(e);
        }
    });
}
export function getPartyById(partyId) {
    /* (省略なし) */ return new Promise((resolve, reject) => {
        if (typeof partyId !== 'number') return resolve(null);
        try {
            const store = getStore('parties');
            const req = store.get(partyId);
            req.onsuccess = (e) => resolve(e.target.result || null);
            req.onerror = (e) => reject(e.target.error);
        } catch (e) {
            reject(e);
        }
    });
}
export function listAllParties() {
    /* (省略なし) */ return new Promise((resolve, reject) => {
        try {
            const store = getStore('parties');
            const req = store.getAll();
            req.onsuccess = (e) => {
                const list = e.target.result || [];
                list.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
                resolve(list);
            };
            req.onerror = (e) => reject(e.target.error);
        } catch (e) {
            reject(e);
        }
    });
}
export function updateParty(party) {
    /* (省略なし) */ return new Promise((resolve, reject) => {
        if (!party?.partyId) return reject(new Error('Invalid party or ID'));
        try {
            const store = getStore('parties', 'readwrite');
            party.updatedAt = new Date().toISOString();
            const req = store.put(party);
            req.onsuccess = resolve;
            req.onerror = (e) => reject(e.target.error);
        } catch (e) {
            reject(e);
        }
    });
}
export function deletePartyById(partyId) {
    /* (省略なし) */ return new Promise((resolve, reject) => {
        if (typeof partyId !== 'number') return reject(new Error('Invalid ID'));
        try {
            const store = getStore('parties', 'readwrite');
            const req = store.delete(partyId);
            req.onsuccess = resolve;
            req.onerror = (e) => reject(e.target.error);
        } catch (e) {
            reject(e);
        }
    });
}

/* --- エンディング (endings) --- */
export function getEnding(scenarioId, type) {
    /* (省略なし) */ return new Promise((resolve, reject) => {
        if (typeof scenarioId !== 'number' || !type) return resolve(null);
        try {
            const store = getStore('endings');
            const req = store.get([scenarioId, type]);
            req.onsuccess = (e) => resolve(e.target.result || null);
            req.onerror = (e) => reject(e.target.error);
        } catch (e) {
            reject(e);
        }
    });
}
export function saveEnding(scenarioId, type, story) {
    /* (省略なし) */ return new Promise((resolve, reject) => {
        if (typeof scenarioId !== 'number' || !type || typeof story !== 'string')
            return reject(new Error('Invalid args'));
        try {
            const store = getStore('endings', 'readwrite');
            const rec = { scenarioId, type, story, createdAt: new Date().toISOString() };
            const req = store.put(rec);
            req.onsuccess = resolve;
            req.onerror = (e) => reject(e.target.error);
        } catch (e) {
            reject(e);
        }
    });
}
export function deleteEnding(scenarioId, type) {
    /* (省略なし) */ return new Promise((resolve, reject) => {
        if (typeof scenarioId !== 'number' || !type) return reject(new Error('Invalid args'));
        try {
            const store = getStore('endings', 'readwrite');
            const req = store.delete([scenarioId, type]);
            req.onsuccess = resolve;
            req.onerror = (e) => reject(e.target.error);
        } catch (e) {
            reject(e);
        }
    });
}

/* --- エンティティ (entities) --- */
export function addEntity(entity) {
    /* (省略なし) */ return new Promise((resolve, reject) => {
        if (!entity?.scenarioId || !entity.category || !entity.name)
            return reject(new Error('Invalid entity'));
        try {
            const store = getStore('entities', 'readwrite');
            const req = store.add(entity);
            req.onsuccess = (e) => resolve(e.target.result);
            req.onerror = (e) => reject(e.target.error);
        } catch (e) {
            reject(e);
        }
    });
}
export function updateEntity(entity) {
    /* (省略なし) */ return new Promise((resolve, reject) => {
        if (!entity?.entityId) return reject(new Error('Invalid entity or ID'));
        try {
            const store = getStore('entities', 'readwrite');
            const req = store.put(entity);
            req.onsuccess = resolve;
            req.onerror = (e) => reject(e.target.error);
        } catch (e) {
            reject(e);
        }
    });
}
export function getEntitiesByScenarioId(scenarioId) {
    /* (省略なし) */ return new Promise((resolve, reject) => {
        if (typeof scenarioId !== 'number') return resolve([]);
        try {
            const store = getStore('entities');
            const idx = store.index('scenarioId');
            const req = idx.getAll(IDBKeyRange.only(scenarioId));
            req.onsuccess = (e) => resolve(e.target.result || []);
            req.onerror = (e) => reject(e.target.error);
        } catch (e) {
            reject(e);
        }
    });
}
export function deleteEntity(entityId) {
    /* (省略なし) */ return new Promise((resolve, reject) => {
        if (typeof entityId !== 'number') return reject(new Error('Invalid ID'));
        try {
            const store = getStore('entities', 'readwrite');
            const req = store.delete(entityId);
            req.onsuccess = resolve;
            req.onerror = (e) => reject(e.target.error);
        } catch (e) {
            reject(e);
        }
    });
}

/* --- 背景画像 (bgImages) --- */
export function addBgImage(dataUrl) {
    /* (省略なし) */ return new Promise((resolve, reject) => {
        if (!dataUrl?.startsWith('data:image')) return reject(new Error('Invalid dataURL'));
        try {
            const store = getStore('bgImages', 'readwrite');
            const rec = { dataUrl, createdAt: new Date().toISOString() };
            const req = store.add(rec);
            req.onsuccess = (e) => resolve(e.target.result);
            req.onerror = (e) => reject(e.target.error);
        } catch (e) {
            reject(e);
        }
    });
}
export function getAllBgImages() {
    /* (省略なし) */ return new Promise((resolve, reject) => {
        try {
            const store = getStore('bgImages');
            const req = store.getAll();
            req.onsuccess = (e) => {
                const res = e.target.result || [];
                res.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
                resolve(res);
            };
            req.onerror = (e) => reject(e.target.error);
        } catch (e) {
            reject(e);
        }
    });
}
export function getBgImageById(id) {
    /* (省略なし) */ return new Promise((resolve, reject) => {
        if (typeof id !== 'number') return resolve(null);
        try {
            const store = getStore('bgImages');
            const req = store.get(id);
            req.onsuccess = (e) => resolve(e.target.result || null);
            req.onerror = (e) => reject(e.target.error);
        } catch (e) {
            reject(e);
        }
    });
}
export function deleteBgImage(id) {
    /* (省略なし) */ return new Promise((resolve, reject) => {
        if (typeof id !== 'number') return reject(new Error('Invalid ID'));
        try {
            const store = getStore('bgImages', 'readwrite');
            const req = store.delete(id);
            req.onsuccess = resolve;
            req.onerror = (e) => reject(e.target.error);
        } catch (e) {
            reject(e);
        }
    });
}

/* --- ユニバーサルセーブ (universalSaves) --- */
export function ensureInitialSlots() {
    /* (省略なし) */ return new Promise(async (resolve, reject) => {
        try {
            const all = await dbListAllSlots();
            if (all.length > 0) {
                resolve();
                return;
            }
            console.log('[DB] Creating initial slots...');
            const proms = [];
            for (let i = 1; i <= 5; i++)
                proms.push(
                    dbPutUniversalSave({
                        slotIndex: i,
                        updatedAt: new Date().toISOString(),
                        data: null,
                    })
                );
            await Promise.all(proms);
            resolve();
        } catch (e) {
            reject(e);
        }
    });
}
export function listAllSlots() {
    /* (省略なし) */ return new Promise((resolve, reject) => {
        try {
            const store = getStore('universalSaves');
            const req = store.getAll();
            req.onsuccess = (e) => {
                const res = e.target.result || [];
                res.sort((a, b) => (a.slotIndex || 0) - (b.slotIndex || 0));
                resolve(res);
            };
            req.onerror = (e) => reject(e.target.error);
        } catch (e) {
            reject(e);
        }
    });
}
export function getUniversalSave(slotIndex) {
    /* (省略なし) */ return new Promise((resolve, reject) => {
        if (typeof slotIndex !== 'number') return resolve(null);
        try {
            const store = getStore('universalSaves');
            const req = store.get(slotIndex);
            req.onsuccess = (e) => resolve(e.target.result || null);
            req.onerror = (e) => reject(e.target.error);
        } catch (e) {
            reject(e);
        }
    });
}
export function putUniversalSave(record) {
    /* (省略なし) */ return new Promise((resolve, reject) => {
        if (!record?.slotIndex) return reject(new Error('Invalid record'));
        try {
            const store = getStore('universalSaves', 'readwrite');
            record.updatedAt = new Date().toISOString();
            const req = store.put(record);
            req.onsuccess = resolve;
            req.onerror = (e) => reject(e.target.error);
        } catch (e) {
            reject(e);
        }
    });
}
export function deleteUniversalSlot(slotIndex) {
    /* (省略なし) */ return new Promise((resolve, reject) => {
        if (typeof slotIndex !== 'number') return reject(new Error('Invalid index'));
        try {
            const store = getStore('universalSaves', 'readwrite');
            const req = store.delete(slotIndex);
            req.onsuccess = resolve;
            req.onerror = (e) => reject(e.target.error);
        } catch (e) {
            reject(e);
        }
    });
}

/* --- モデルキャッシュ (modelCache) - 任意追加 --- */
export function saveModels(models) {
    /* (省略なし - Cache disabled) */ console.warn('[DB] saveModels: Cache disabled.');
    return Promise.resolve();
}
export function loadModels() {
    /* (省略なし - Cache disabled) */ console.warn('[DB] loadModels: Cache disabled.');
    return Promise.resolve(null);
}

/* --- アバターデータ (avatarData) --- */
export function saveAvatarData(avatarObj) {
    /* (省略なし) */ return new Promise((resolve, reject) => {
        if (!avatarObj?.id) return reject(new Error('Invalid avatar'));
        try {
            const store = getStore('avatarData', 'readwrite');
            const req = store.put(avatarObj);
            req.onsuccess = resolve;
            req.onerror = (e) => reject(e.target.error);
        } catch (e) {
            reject(e);
        }
    });
}
export function loadAvatarData(id) {
    /* (省略なし) */ return new Promise((resolve, reject) => {
        if (!id) return resolve(null);
        try {
            const store = getStore('avatarData');
            const req = store.get(id);
            req.onsuccess = (e) => resolve(e.target.result || null);
            req.onerror = (e) => reject(e.target.error);
        } catch (e) {
            reject(e);
        }
    });
}

// --- ファイル読み込み完了ログ ---
console.log('[IndexedDB] indexedDB.js loaded and functions exported.');
window.initIndexedDB = initIndexedDB;