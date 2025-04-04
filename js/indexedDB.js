/* indexedDB.js */
/* ★ scenarios ストアに isFavorite インデックスを追加 */
/* ★ DBバージョンを更新 (例: 18 -> 19) */
/* ★ export を使用、省略なし */

let db = null; // データベースオブジェクト

/**
 * IndexedDB データベースを開き、オブジェクトストアとインデックスを初期化（またはアップグレード）します。
 * @returns {Promise<void>} データベースの準備ができたら解決される Promise
 */
export function initIndexedDB() {
    return new Promise((resolve, reject) => {
        // ★ バージョン番号をインクリメント (例: 18 -> 19)
        const request = indexedDB.open('trpgDB', 19);

        // データベースのバージョンが古い場合や新規作成時に実行
        request.onupgradeneeded = (event) => {
            console.log('[IndexedDB] onupgradeneeded event triggered. Upgrading database...');
            db = event.target.result;
            const tx = event.target.transaction; // ★ トランザクションを取得

            // characterData ストア
            if (!db.objectStoreNames.contains('characterData')) {
                console.log('[IndexedDB] Creating object store: characterData');
                db.createObjectStore('characterData', { keyPath: 'id' });
            }

            // scenarios ストア (★ isFavorite インデックス追加)
            let scenarioStore;
            if (!db.objectStoreNames.contains('scenarios')) {
                console.log('[IndexedDB] Creating object store: scenarios');
                scenarioStore = db.createObjectStore('scenarios', {
                    keyPath: 'scenarioId',
                    autoIncrement: true,
                });
                if (!scenarioStore.indexNames.contains('updatedAt')) {
                    scenarioStore.createIndex('updatedAt', 'updatedAt', {
                        unique: false,
                    });
                }
                // ★ 新規作成時に isFavorite インデックスを追加
                if (!scenarioStore.indexNames.contains('isFavorite')) {
                    console.log("[IndexedDB] Creating index 'isFavorite' on new scenarios store.");
                    scenarioStore.createIndex('isFavorite', 'isFavorite', {
                        unique: false,
                    });
                }
            } else {
                // 既存ストアの場合、トランザクションから取得してインデックス確認・追加
                console.log('[IndexedDB] Checking existing store: scenarios');
                if (tx) {
                    scenarioStore = tx.objectStore('scenarios');
                    if (!scenarioStore.indexNames.contains('isFavorite')) {
                        console.log(
                            "[IndexedDB] Creating index 'isFavorite' on existing scenarios store."
                        );
                        scenarioStore.createIndex('isFavorite', 'isFavorite', {
                            unique: false,
                        });
                    }
                    // 既存の updatedAt インデックスも確認 (念のため)
                    if (!scenarioStore.indexNames.contains('updatedAt')) {
                        console.log(
                            "[IndexedDB] Creating index 'updatedAt' on existing scenarios store."
                        );
                        scenarioStore.createIndex('updatedAt', 'updatedAt', {
                            unique: false,
                        });
                    }
                } else {
                    console.error(
                        '[IndexedDB] Could not get transaction during upgrade for scenarios store.'
                    );
                }
            }

            // sceneEntries ストア
            if (!db.objectStoreNames.contains('sceneEntries')) {
                console.log('[IndexedDB] Creating object store: sceneEntries');
                const sceneStore = db.createObjectStore('sceneEntries', {
                    keyPath: 'entryId',
                    autoIncrement: true,
                });
                if (!sceneStore.indexNames.contains('scenarioId')) {
                    sceneStore.createIndex('scenarioId', 'scenarioId', { unique: false });
                }
                if (!sceneStore.indexNames.contains('content_en')) {
                    try {
                        sceneStore.createIndex('content_en', 'content_en', {
                            unique: false,
                        });
                    } catch (e) {
                        console.warn("Failed index 'content_en':", e.message);
                    }
                }
            }

            // wizardState ストア
            if (!db.objectStoreNames.contains('wizardState')) {
                console.log('[IndexedDB] Creating object store: wizardState');
                db.createObjectStore('wizardState', { keyPath: 'id' });
            }

            // parties ストア
            if (!db.objectStoreNames.contains('parties')) {
                console.log('[IndexedDB] Creating object store: parties');
                const partyStore = db.createObjectStore('parties', {
                    keyPath: 'partyId',
                    autoIncrement: true,
                });
                if (!partyStore.indexNames.contains('updatedAt')) {
                    partyStore.createIndex('updatedAt', 'updatedAt', { unique: false });
                }
            }

            // bgImages ストア
            if (!db.objectStoreNames.contains('bgImages')) {
                console.log('[IndexedDB] Creating object store: bgImages');
                db.createObjectStore('bgImages', {
                    keyPath: 'id',
                    autoIncrement: true,
                });
            }

            // sceneSummaries ストア
            if (!db.objectStoreNames.contains('sceneSummaries')) {
                console.log('[IndexedDB] Creating object store: sceneSummaries');
                const sumStore = db.createObjectStore('sceneSummaries', {
                    keyPath: 'summaryId',
                    autoIncrement: true,
                });
                if (!sumStore.indexNames.contains('chunkIndex')) {
                    sumStore.createIndex('chunkIndex', 'chunkIndex', { unique: false });
                }
            }

            // endings ストア
            if (!db.objectStoreNames.contains('endings')) {
                console.log('[IndexedDB] Creating object store: endings');
                db.createObjectStore('endings', { keyPath: ['scenarioId', 'type'] });
            }

            // avatarData ストア
            if (!db.objectStoreNames.contains('avatarData')) {
                console.log('[IndexedDB] Creating object store: avatarData');
                db.createObjectStore('avatarData', { keyPath: 'id' });
            }

            // entities ストア
            if (!db.objectStoreNames.contains('entities')) {
                console.log('[IndexedDB] Creating object store: entities');
                const entStore = db.createObjectStore('entities', {
                    keyPath: 'entityId',
                    autoIncrement: true,
                });
                if (!entStore.indexNames.contains('scenarioId')) {
                    entStore.createIndex('scenarioId', 'scenarioId', { unique: false });
                }
            }

            // universalSaves ストア
            if (!db.objectStoreNames.contains('universalSaves')) {
                console.log('[IndexedDB] Creating object store: universalSaves');
                db.createObjectStore('universalSaves', { keyPath: 'slotIndex' });
            }

            // modelCache ストア (任意)
            if (!db.objectStoreNames.contains('modelCache')) {
                console.log('[IndexedDB] Creating object store: modelCache');
                db.createObjectStore('modelCache', { keyPath: 'id' });
            }

            console.log('[IndexedDB] onupgradeneeded finished.');
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            console.log(`[IndexedDB] Database opened successfully (version ${db.version}).`);
            // DB接続後にグローバル変数に設定 (他のファイルから参照するため)
            window.db = db;
            resolve();
        };
        request.onerror = (event) => {
            console.error('[IndexedDB] Database error:', event.target.error);
            reject(event.target.error);
        };
        request.onblocked = () => {
            console.warn('[IndexedDB] Database open blocked.');
            alert('DB更新ブロック。他のタブを閉じてリロードしてください。');
            reject(new Error('Database open blocked'));
        };
    });
}

// --- トランザクションヘルパー ---
function getStore(storeName, mode = 'readonly') {
    // ★ window.db を使うように修正
    if (!window.db) throw new Error('Database not initialized (window.db is null).');
    try {
        const tx = window.db.transaction(storeName, mode);
        // トランザクションエラーハンドリング (オプション)
        tx.onerror = (event) => {
            console.error(
                `[IndexedDB] Transaction error on store "${storeName}":`,
                event.target.error
            );
        };
        return tx.objectStore(storeName);
    } catch (e) {
        console.error(`[IndexedDB] Error getting store "${storeName}" (mode: ${mode}):`, e);
        throw e;
    }
}

// --- 各ストアへのアクセス関数 (export 付き、省略なし) ---

/** 新しいシナリオを作成 */
export function createNewScenario(wizardData, title = '新シナリオ') {
    return new Promise((resolve, reject) => {
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

/** シナリオを更新 */
export function updateScenario(scenario, noUpdateDateTimeFlag = false) {
    return new Promise((resolve, reject) => {
        if (!scenario?.scenarioId) return reject(new Error('Invalid scenario or ID'));
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

/** シナリオをIDで取得 */
export function getScenarioById(scenarioId) {
    return new Promise((resolve, reject) => {
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

/** 全シナリオ取得 */
export function listAllScenarios() {
    return new Promise((resolve, reject) => {
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

/** シナリオ削除 (関連データも) */
export function deleteScenarioById(scenarioId) {
    return new Promise(async (resolve, reject) => {
        if (!window.db) return reject(new Error('DB未初期化'));
        if (typeof scenarioId !== 'number') return reject(new Error('不正ID'));
        try {
            console.log(`Deleting scenario ${scenarioId}...`);
            const stores = ['scenarios', 'sceneEntries', 'entities', 'endings', 'universalSaves'];
            const tx = window.db.transaction(stores, 'readwrite');
            const scStore = tx.objectStore('scenarios');
            const seStore = tx.objectStore('sceneEntries');
            const enStore = tx.objectStore('entities');
            const edStore = tx.objectStore('endings');
            const usStore = tx.objectStore('universalSaves');
            const proms = [];
            proms.push(
                new Promise((res, rej) => {
                    scStore.delete(scenarioId).onsuccess = res; /* onerrorはtxで捕捉 */
                })
            );
            proms.push(
                new Promise(async (res, rej) => {
                    const idx = seStore.index('scenarioId');
                    let cur = await idx.openCursor(IDBKeyRange.only(scenarioId));
                    let c = 0;
                    while (cur) {
                        await seStore.delete(cur.primaryKey);
                        c++;
                        cur = await cur.continue();
                    }
                    console.log(`Deleted ${c} sceneEntries.`);
                    res();
                })
            );
            proms.push(
                new Promise(async (res, rej) => {
                    const idx = enStore.index('scenarioId');
                    let cur = await idx.openCursor(IDBKeyRange.only(scenarioId));
                    let c = 0;
                    while (cur) {
                        await enStore.delete(cur.primaryKey);
                        c++;
                        cur = await cur.continue();
                    }
                    console.log(`Deleted ${c} entities.`);
                    res();
                })
            );
            proms.push(
                new Promise(async (res, rej) => {
                    const range = IDBKeyRange.bound([scenarioId, ''], [scenarioId, '\uffff']);
                    let cur = await edStore.openCursor(range);
                    let c = 0;
                    while (cur) {
                        await edStore.delete(cur.primaryKey);
                        c++;
                        cur = await cur.continue();
                    }
                    console.log(`Deleted ${c} endings.`);
                    res();
                })
            );
            proms.push(
                new Promise(async (res, rej) => {
                    let cur = await usStore.openCursor();
                    let c = 0;
                    while (cur) {
                        if (cur.value?.data?.scenarioId === scenarioId) {
                            const up = { ...cur.value, data: null };
                            await usStore.put(up);
                            c++;
                        }
                        cur = await cur.continue();
                    }
                    console.log(`Cleared ${c} save slots.`);
                    res();
                })
            );
            await Promise.all(proms);
            tx.oncomplete = () => {
                console.log(`Deletion tx completed for ${scenarioId}.`);
                resolve();
            };
            tx.onerror = (e) => reject(e.target.error);
        } catch (e) {
            reject(e);
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
                                store.delete(k).onsuccess = res; /* onerrorはtx */
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
            const rec = {
                scenarioId,
                type,
                story,
                createdAt: new Date().toISOString(),
            };
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
    /* (省略なし - universalSaveLoad.js に移動推奨) */ return new Promise(
        async (resolve, reject) => {
            try {
                const all = await listAllSlots();
                if (all.length > 0) {
                    resolve();
                    return;
                }
                console.log('[IndexedDB] Creating initial 5 slots.');
                const proms = [];
                for (let i = 1; i <= 5; i++) {
                    const rec = {
                        slotIndex: i,
                        updatedAt: new Date().toISOString(),
                        data: null,
                    };
                    proms.push(putUniversalSave(rec));
                }
                await Promise.all(proms);
                console.log('[IndexedDB] Initial slots created.');
                resolve();
            } catch (e) {
                reject(e);
            }
        }
    );
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
    /* (省略なし - コメントアウト中) */ console.warn('[DB] saveModels: Cache disabled.');
    return Promise.resolve();
}
export function loadModels() {
    /* (省略なし - コメントアウト中) */ console.warn('[DB] loadModels: Cache disabled.');
    return Promise.resolve(null);
}

/* --- アバターデータ (avatarData) --- */
export function saveAvatarData(avatarObj) {
    /* (省略なし) */ return new Promise((resolve, reject) => {
        if (!avatarObj?.id) return reject(new Error('Invalid avatar or ID'));
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
