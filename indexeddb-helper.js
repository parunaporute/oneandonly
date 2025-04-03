// indexeddb-helper.js

const DB_NAME = 'geminiAppDB';
const DB_VERSION = 1;
const STORE_NAME = 'settings'; // モデルリストや他の設定も保存できるよう汎用的な名前に
const MODELS_KEY = 'availableModels'; // モデルリストを保存するキー

let dbPromise = null; // DB接続を保持するPromise

/**
 * IndexedDBデータベースを初期化または開く関数
 * @returns {Promise<IDBDatabase>} データベースインスタンスへのPromise
 */
function initDB() {
    if (dbPromise) {
        return dbPromise; // 既に接続Promiseがあればそれを返す
    }

    dbPromise = new Promise((resolve, reject) => {
        // ブラウザがIndexedDBをサポートしているか確認
        if (!('indexedDB' in window)) {
            console.error('このブラウザは IndexedDB をサポートしていません。');
            reject(new Error('IndexedDB not supported'));
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
            console.error('データベースのオープンに失敗しました:', event.target.error);
            reject(new Error(`Database error: ${event.target.error}`));
        };

        request.onsuccess = (event) => {
            console.log('データベースのオープンに成功しました。');
            resolve(event.target.result);
        };

        // データベースのバージョンが古い場合や、初めて作成する場合に実行
        request.onupgradeneeded = (event) => {
            console.log('データベースのアップグレードまたは新規作成を行います。');
            const db = event.target.result;
            // オブジェクトストアが存在しない場合のみ作成
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                 console.log(`オブジェクトストア '${STORE_NAME}' を作成します。`);
                 db.createObjectStore(STORE_NAME); // キーを指定してデータを保存するため、keyPathは不要
            }
        };
    });
    return dbPromise;
}

/**
 * モデルリストをIndexedDBに保存する関数
 * @param {Array} models 保存するモデルリストの配列
 * @returns {Promise<void>} 保存完了を示すPromise
 */
export async function saveModels(models) {
    try {
        const db = await initDB();
        // 読み書き可能なトランザクションを開始
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        // 指定したキーでモデルリスト配列を保存 (上書き)
        const request = store.put(models, MODELS_KEY);

        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                console.log('モデルリストをIndexedDBに保存しました。');
                resolve();
            };
            request.onerror = (event) => {
                console.error('モデルリストの保存に失敗しました:', event.target.error);
                reject(new Error(`Failed to save models: ${event.target.error}`));
            };
            // トランザクション完了を待つ (成功/失敗どちらでも)
             transaction.oncomplete = () => { /* console.log('Save transaction completed.'); */ };
             transaction.onerror = (event) => {
                 console.error('Save transaction error:', event.target.error);
                 // request.onerror で reject されているはずだが念のため
                 if (!request.error) reject(new Error(`Save transaction failed: ${event.target.error}`));
             };
        });
    } catch (error) {
        console.error('データベース操作中にエラー:', error);
        throw error; // エラーを再スロー
    }
}

/**
 * IndexedDBからモデルリストを読み込む関数
 * @returns {Promise<Array|null>} モデルリスト配列、または存在しない場合はnullを含むPromise
 */
export async function loadModels() {
    try {
        const db = await initDB();
        // 読み取り専用トランザクションを開始
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        // 指定したキーでデータを取得
        const request = store.get(MODELS_KEY);

        return new Promise((resolve, reject) => {
            request.onsuccess = (event) => {
                const models = event.target.result;
                if (models) {
                    console.log('IndexedDBからモデルリストを読み込みました。');
                    resolve(models); // データが見つかった場合
                } else {
                    console.log('IndexedDBにモデルリストが見つかりませんでした。');
                    resolve(null); // データが見つからなかった場合
                }
            };
            request.onerror = (event) => {
                console.error('モデルリストの読み込みに失敗しました:', event.target.error);
                reject(new Error(`Failed to load models: ${event.target.error}`));
            };
             transaction.oncomplete = () => { /* console.log('Load transaction completed.'); */ };
             transaction.onerror = (event) => {
                 console.error('Load transaction error:', event.target.error);
                  if (!request.error) reject(new Error(`Load transaction failed: ${event.target.error}`));
             };
        });
    } catch (error) {
        console.error('データベース操作中にエラー:', error);
        throw error; // エラーを再スロー
    }
}