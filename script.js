// script.js
import { GeminiApiClient } from './gemini-api-client.js';
// ★ IndexedDBヘルパーをインポート
import { saveModels, loadModels } from './indexeddb-helper.js';

// --- 要素取得 ---
const storyHistoryElement = document.getElementById('story-history');
const userInputElement = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');
const loadingElement = document.getElementById('loading');
const errorMessageElement = document.getElementById('error-message');
const modelSelectElement = document.getElementById('model-select');
const modelDescriptionElement = document.getElementById('model-description'); // 説明表示用
const updateModelsButton = document.getElementById('update-models-button'); // ★更新ボタン

// --- 設定 ---
// !!! 重要: ここにご自身のGemini APIキーを設定してください !!!
// セキュリティのため、本来はコードに直接書き込むのは非推奨です。
const API_KEY = 'AIzaSyCFcKyxST7rXgK4vI8jAnj-unrkyzA4XHw';

// ★ true にするとAPIに接続せず、ダミーデータで動作するスタブモードになります
const STUB_MODE = false;

// --- Gemini API クライアントのインスタンス化 ---
let geminiClient;
try {
     // ★ stubMode オプションを渡す
     geminiClient = new GeminiApiClient(API_KEY, { stubMode: STUB_MODE });
     if (STUB_MODE) {
         document.title += " (Stub Mode)"; // タイトルでスタブモードであることを示す (任意)
         console.warn("--- アプリケーションはスタブモードで動作しています ---");
         // 必要ならスタブモードであることを示すメッセージをUIに表示しても良い
         // 例: document.getElementById('some-status-element').textContent = "スタブモード有効";
     }
} catch (error) {
    console.error("GeminiApiClientの初期化に失敗:", error);
    // showError関数がまだ定義されていない可能性があるので、コンソールエラーを優先
    if (errorMessageElement) {
        errorMessageElement.textContent = `APIクライアント初期化エラー: ${error.message}`;
        errorMessageElement.style.display = 'block';
    }
    // APIクライアントが初期化できない場合、関連機能を無効化
    // disableChatUI はまだ使えないので、直接要素を無効化
    if(sendButton) sendButton.disabled = true;
    if(userInputElement) userInputElement.disabled = true;
    if(modelSelectElement) modelSelectElement.disabled = true;
    if(updateModelsButton) updateModelsButton.disabled = true;
}

// --- 状態変数 ---
const initialPrompt = "あなたは町の中心に立っています。周りには古いレンガ造りの建物や、賑やかな市場が見えます。どこへ向かいますか？"; // 最初の状況設定
let isLoading = false; // API呼び出し（生成）中のフラグ
let isLoadingModels = false; // ★モデルリスト読み込み中の状態フラグ


// --- 関数定義 ---

/**
 * エラーメッセージを表示する関数
 * @param {string} message 表示するエラーメッセージ
 */
function showError(message) {
    if (errorMessageElement) {
        errorMessageElement.textContent = message;
        errorMessageElement.style.display = 'block';
    } else {
        console.error("Error display element not found. Message:", message);
    }
}

/**
 * チャット関連のUI要素の有効/無効を切り替える関数
 * @param {boolean} disable 無効にする場合は true
 * @param {string} [reason=''] 無効化の理由（コンソールログ用）
 */
function disableChatUI(disable, reason = '') {
     if (reason) console.log(`UI ${disable ? 'disabled' : 'enabled'}: ${reason}`);
     if(sendButton) sendButton.disabled = disable;
     if(userInputElement) userInputElement.disabled = disable;
     if(modelSelectElement) modelSelectElement.disabled = disable;
     // ★ 更新ボタンも制御 (モデル読み込み中でなければ有効/無効を反映)
     if (updateModelsButton) {
         // isLoadingModels フラグを考慮して更新ボタンの状態を決める
         updateModelsButton.disabled = disable || isLoadingModels;
     }
 }

/**
 * 履歴表示エリアにメッセージを追加する関数
 * @param {string} text 表示するテキスト
 * @param {'user' | 'model'} role メッセージの役割 ('user' または 'model')
 */
function addMessageToHistory(text, role) {
     if (!storyHistoryElement) return;

    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', role);

    const roleStrong = document.createElement('strong');
    roleStrong.textContent = role === 'user' ? 'あなた:' : '物語:';
    messageDiv.appendChild(roleStrong);

    const textNode = document.createElement('span');
    // 改行コード (\n) を HTML の <br> タグに変換して表示
    textNode.innerHTML = text.replace(/\n/g, '<br>');
    messageDiv.appendChild(textNode);

    storyHistoryElement.appendChild(messageDiv);
    storyHistoryElement.scrollTop = storyHistoryElement.scrollHeight;
}

/**
 * ユーザーの入力を処理し、APIを呼び出す（またはスタブ応答を得る）関数
 */
async function handleUserInput() {
    if (!userInputElement || !modelSelectElement || !geminiClient) return;

    const userText = userInputElement.value.trim();
    const selectedModel = modelSelectElement.value;

    // 入力チェックとクライアントの存在確認
    if (!userText || isLoading || !selectedModel) {
        if (!userText) console.log("User input is empty.");
        if (isLoading) console.log("Already processing generation.");
        if (!selectedModel) showError("使用するモデルを選択してください。");
        return;
    }

    addMessageToHistory(userText, 'user'); // ユーザー入力を表示
    userInputElement.value = ''; // 入力欄クリア

    // UIを処理中状態に更新
    if(loadingElement) loadingElement.style.display = 'block';
    if(errorMessageElement) errorMessageElement.style.display = 'none'; // 古いエラーを消す
    disableChatUI(true, 'API call initiated');
    isLoading = true;

    try {
        // --- API呼び出し or スタブ応答取得 ---
        const generatedText = await geminiClient.generateContent(userText, selectedModel);

        // --- 結果を画面に反映 ---
        addMessageToHistory(generatedText, 'model');

    } catch (error) {
        // --- API呼び出し中のエラー処理 ---
        console.error('コンテンツ生成エラー:', error);
        showError(error.message || '不明なエラーが発生しました。');
    } finally {
        // --- UIを入力可能状態に復帰 ---
        if(loadingElement) loadingElement.style.display = 'none';
        isLoading = false;
        // モデルリストが正常に読み込まれていればUIを有効化
        if (modelSelectElement && modelSelectElement.options.length > 0 && modelSelectElement.options[0]?.value) {
             disableChatUI(false, 'API call finished');
        } else {
             // 利用可能なモデルがない場合は無効のまま
             disableChatUI(true, 'No models available');
        }
        if(userInputElement) userInputElement.focus(); // 入力欄にフォーカス
    }
}

/**
 * 利用可能なGeminiモデルを取得し、ドロップダウンリストを更新する関数
 * IndexedDBからの読み込みとAPIからの取得（またはスタブ）を制御する
 * @param {boolean} [forceUpdate=false] trueの場合、キャッシュを無視してAPIから強制的に取得する
 */
async function loadAvailableModels(forceUpdate = false) {
    // ★ 既にモデル読み込み中の場合は何もしない
    if (isLoadingModels) {
        console.log("モデルリストは既に読み込み中です。");
        return;
    }
    // 要素が存在するか確認
     if (!modelSelectElement || !updateModelsButton || !geminiClient) {
         console.error("必要なUI要素またはAPIクライアントが見つかりません。モデルリストを読み込めません。");
         return;
     }

    isLoadingModels = true; // 読み込み開始
    disableChatUI(true, 'Loading models'); // 更新ボタンもここで無効化される
    modelSelectElement.innerHTML = '<option value="">モデルを読込中...</option>';
    if(modelDescriptionElement) modelDescriptionElement.textContent = '';
    if(errorMessageElement) errorMessageElement.style.display = 'none'; // 古いエラーメッセージを隠す

    let models = null;

    // 1. キャッシュからの読み込み試行 (強制更新でない場合)
    if (!forceUpdate) {
        try {
            console.log("IndexedDBからモデルリストの読み込みを試みます...");
            models = await loadModels(); // ★ヘルパー関数使用
            if (models && Array.isArray(models) && models.length > 0) { // 取得データが配列かどうかもチェック
                 console.log(`キャッシュされた ${models.length} 件のモデルリストを使用します。`);
            } else {
                 console.log("キャッシュが見つからないか、空でした。APIまたはスタブから取得します。");
                 models = null; // API/スタブからの取得に進むように null に設定
            }
        } catch (error) {
            console.error("IndexedDBからのモデル読み込み中にエラー:", error);
            showError(`キャッシュ読み込みエラー: ${error.message} API/スタブから取得します。`);
            models = null; // エラー時はキャッシュなしとして扱う
        }
    } else {
         console.log("強制更新フラグにより、APIまたはスタブからモデルリストを取得します。");
         models = null; // 強制更新なのでキャッシュは使わない
    }

    // 2. APIからの取得またはスタブデータの使用 (キャッシュがない、または強制更新の場合)
    if (models === null) { // キャッシュを使わない場合に実行
        if (!STUB_MODE) {
             // --- 通常モード: APIから取得 ---
             // APIキーのチェック
             if (!API_KEY || API_KEY === 'YOUR_API_KEY') {
                 showError('警告: script.js ファイル内の API_KEY を設定してください。');
                 modelSelectElement.innerHTML = '<option value="">APIキー未設定</option>';
                 isLoadingModels = false; // 読み込み終了 (失敗)
                 disableChatUI(true, 'API Key missing'); // UIは無効のまま
                 return;
             }

            try {
                console.log("APIからモデルリストを取得しています...");
                models = await GeminiApiClient.listAvailableModels(API_KEY); // ★ API Client の静的メソッドを使用
                console.log(`APIから ${models.length} 件のモデルリストを取得しました。`);

                // ★ 取得したモデルリストをIndexedDBに保存
                if (models && models.length > 0) {
                     try {
                         await saveModels(models); // ★ヘルパー関数使用
                     } catch (saveError) {
                         console.error("取得したモデルリストのIndexedDBへの保存に失敗:", saveError);
                         showError(`モデルリストのキャッシュ保存に失敗: ${saveError.message}`);
                         // 保存に失敗しても処理は続行する
                     }
                }
            } catch (error) {
                console.error('APIからのモデルリスト読み込みエラー:', error);
                showError(`モデルリスト取得エラー: ${error.message}`);
                models = null; // エラーが発生したら models は null のまま
            }
        } else {
             // --- スタブモード: ダミーデータを使用 ---
             console.log("スタブモードのため、ダミーのモデルリストを使用します。");
             // ★ スタブモード用のダミーモデルリストを定義
             models = [
                 { id: 'stub-model-pro', displayName: 'Stub Pro', description: 'スタブモード用の高性能モデルです。実際には通信しません。', tier: '高性能' },
                 { id: 'stub-model-flash', displayName: 'Stub Flash', description: 'スタブモード用の高速モデルです。応答内容はランダムです。', tier: '高速' },
                 { id: 'stub-model-text', displayName: 'Stub Text', description: 'スタブモード用の標準テキストモデル。', tier: '標準' },
             ];
             // スタブモードではキャッシュ保存は行わない
        }
    }

    // 3. ドロップダウンリストの構築とUIの更新
    modelSelectElement.innerHTML = ''; // ドロップダウンをクリア
    if (models && models.length > 0) {
        // 有効なモデルが見つかった場合
        const preferredModelId = STUB_MODE ? "stub-model-pro" : "gemini-1.5-pro-latest"; // デフォルト選択

        models.forEach(model => {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = model.tier ? `${model.displayName} (${model.tier})` : model.displayName;
            option.setAttribute('data-description', model.description || '');

            if (model.id === preferredModelId) {
                option.selected = true;
            }
            modelSelectElement.appendChild(option);
        });

        if (errorMessageElement) errorMessageElement.style.display = 'none'; // エラーメッセージ非表示
        updateModelDescription(); // 初期選択モデルの説明を表示
        initializeChat();       // チャット初期化
        isLoadingModels = false; // 読み込み終了
        disableChatUI(false, 'Models loaded successfully'); // UI有効化

    } else {
        // 利用可能なモデルが見つからなかった、または取得/読み込みに失敗した場合
        if (errorMessageElement && !errorMessageElement.textContent) { // まだエラーが表示されていなければ
             showError('エラー: 利用可能なモデルが見つかりませんでした。');
        }
        modelSelectElement.innerHTML = '<option value="">利用可能なモデル無し</option>';
        if(modelDescriptionElement) modelDescriptionElement.textContent = ''; // 説明もクリア
        isLoadingModels = false; // 読み込み終了
        disableChatUI(true, 'No models found or loading failed'); // UIは無効のまま
    }
}

/**
 * 選択されたモデルの説明を表示エリアに更新する関数
 */
function updateModelDescription() {
    if (!modelSelectElement || !modelDescriptionElement) return;

    const selectedOption = modelSelectElement.options[modelSelectElement.selectedIndex];
    if (!selectedOption || !selectedOption.value) { // valueが空（プレースホルダーなど）の場合もクリア
        modelDescriptionElement.textContent = '';
        return;
    }
    const description = selectedOption.getAttribute('data-description');
    modelDescriptionElement.textContent = description || 'このモデルに関する補足説明はありません。';
}

/**
 * チャットの初期状態を設定する関数 (最初のプロンプト表示など)
 */
function initializeChat() {
    // APIクライアントが正常に初期化されているか確認
    if (!geminiClient) {
        console.warn("Cannot initialize chat: Gemini client not available.");
        return;
    }
     // 履歴表示エリアが存在するか確認
     if (!storyHistoryElement) {
         console.warn("Cannot initialize chat: Story history element not found.");
         return;
     }
    // 最初の導入文で会話履歴を初期化
    geminiClient.initializeHistory([{ role: "model", parts: [{ text: initialPrompt }] }]);
    // 画面に初期プロンプトを表示
    storyHistoryElement.innerHTML = ''; // 一旦クリア
    addMessageToHistory(initialPrompt, 'model');

    console.log("Chat initialized.");
}


// --- イベントリスナー ---

// 送信ボタンクリック時の処理
if(sendButton) {
    sendButton.addEventListener('click', handleUserInput);
}

// テキストエリアでEnterキーを押した時の処理 (Shift+Enterで改行)
if(userInputElement) {
    userInputElement.addEventListener('keypress', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault(); // デフォルトのEnterキー動作（改行）をキャンセル
            if(sendButton) sendButton.click(); // 送信ボタンのクリックイベントを発火
        }
    });
}

// モデル選択が変更されたら説明を更新するリスナー
if(modelSelectElement) {
    modelSelectElement.addEventListener('change', updateModelDescription);
}

// ★ モデルリスト更新ボタンのリスナーを追加
if (updateModelsButton) {
    updateModelsButton.addEventListener('click', () => {
        if (!isLoadingModels) { // 読み込み中でなければ実行
            console.log("モデルリスト更新ボタンがクリックされました。");
            loadAvailableModels(true); // 強制更新フラグを立てて呼び出す
        } else {
            console.log("モデルリスト読み込み中のため、更新はスキップされました。");
        }
    });
} else {
    console.warn("Update models button element not found.");
}

// --- 初期化処理 ---
// HTMLのDOM構造が読み込み完了したら、モデルリスト取得処理を開始
document.addEventListener('DOMContentLoaded', () => {
     // APIクライアントが正常ならモデルリストをロード
     if (geminiClient) {
         loadAvailableModels(); // ★ 初回読み込み (キャッシュがあれば使う)
     } else {
         // クライアント初期化失敗時の処理（既にエラー表示などはされているはず）
         console.error("Cannot load models because Gemini client initialization failed.");
         // 必要に応じて追加のUIフィードバック
         if (modelSelectElement) {
            modelSelectElement.innerHTML = '<option value="">クライアント初期化エラー</option>';
            // disableChatUI はまだ使えないかもしれないので直接
             if(sendButton) sendButton.disabled = true;
             if(userInputElement) userInputElement.disabled = true;
             if(modelSelectElement) modelSelectElement.disabled = true;
             if(updateModelsButton) updateModelsButton.disabled = true;
         }
     }
 });