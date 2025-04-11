// menu.js
// ★ APIクライアント初期化削除、localStorage参照
// ★ チェックボックス状態保存機能を追加
// ★ お気に入りボタン追加、トグル関数追加

// --- モジュールインポート ---
import { GeminiApiClient } from './geminiApiClient.js';
import {
    initIndexedDB,
    listAllScenarios,
    loadCharacterDataFromIndexedDB,
    getScenarioById,
    updateScenario,
    deleteScenarioById,
    saveCharacterDataToIndexedDB,
} from './indexedDB.js';
import { showToast } from './common.js';
import { open as multiModalOpen } from './multiModal.js';
import { initAvatar } from './avatar.js';
import { initBackground, onChangeBgButtonClick } from './background.js';
import { showWarehouseModal } from './warehouse.js';
import { openSaveLoadModal } from './universalSaveLoad.js';

// --- グローバル変数・状態 ---
window.cachedScenarios = [];
window.characterData = [];
let isLoadingModels = false;

// --- DOM要素 ---
let modelSelectElement, modelDescriptionElement, updateModelsButton, setApiKeyButton;
let stopBgmButton, bgmAudio, scenarioListContainer, noScenariosMessage, showHiddenCheckbox;
let saveLoadButton, changeBgButton, clearCharBtn, showWhBtn, charCreateBtn, partyListBtn;
let newScenBtn, customScenBtn, bookshelfBtn, tutorialBtn;
let accordionHeader, accordionContent;

// --- localStorage キー ---
const SHOW_HIDDEN_CHECKBOX_KEY = 'showHiddenScenariosChecked';
const GEMINI_API_KEY_LS_KEY = 'geminiApiKey';
const STABILITY_API_KEY_LS_KEY = 'stabilityApiKey';
const PREFERRED_GEMINI_MODEL_LS_KEY = 'preferredGeminiModel';

// --- BGM 関連 ---
/** BGM フェードイン再生 */
function fadeInPlay(audio) {
    if (!audio) {
        console.warn('[Menu] Audio element not provided.');
        return;
    }
    audio.volume = 0;
    audio
        .play()
        .then(() => {
            console.log('[Menu] BGM playback started.');
            document.removeEventListener('click', handleUserGestureForBGM);
            let currentVolume = 0;
            const fadeInterval = 100;
            const fadeStep = 0.05;
            const targetVolume = 0.5;
            const intervalId = setInterval(() => {
                currentVolume += fadeStep;
                if (currentVolume >= targetVolume) {
                    audio.volume = targetVolume;
                    clearInterval(intervalId);
                    console.log('[Menu] BGM fade-in complete.');
                } else {
                    audio.volume = currentVolume;
                }
            }, fadeInterval);
        })
        .catch((err) => {
            console.warn('[Menu] BGM playback failed:', err);
            document.removeEventListener('click', handleUserGestureForBGM);
            document.addEventListener('click', handleUserGestureForBGM, { once: true });
        });
}
/** BGM再生のためのユーザー操作ハンドラ */
function handleUserGestureForBGM() {
    console.log('[Menu] User gesture BGM.');
    const audio = document.getElementById('bgm');
    if (audio?.paused && localStorage.getItem('bgmStopped') !== 'true') fadeInPlay(audio);
    document.removeEventListener('click', handleUserGestureForBGM);
}
/** BGMボタン表示更新 */
function updateBgmButtonStatus(isStopped) {
    if (!stopBgmButton) {
        console.warn('[Menu] Stop BGM button not found.');
        return;
    }
    if (isStopped) {
        stopBgmButton.innerHTML = `<div class="iconmoon icon-volume-mute2"></div>`;
        stopBgmButton.style.backgroundColor = 'rgb(255,115,68)';
        stopBgmButton.title = 'BGM再生';
    } else {
        stopBgmButton.innerHTML = `<div class="iconmoon icon-volume-high"></div>`;
        stopBgmButton.style.backgroundColor = '#4caf50';
        stopBgmButton.title = 'BGM停止';
    }
}

// --- 初期化処理 ---
window.addEventListener('DOMContentLoaded', async () => {
    console.log('[Menu] DOMContentLoaded event fired.');
    // DOM要素取得
    setApiKeyButton = document.getElementById('set-api-key-button');
    stopBgmButton = document.getElementById('stop-bgm-button');
    bgmAudio = document.getElementById('bgm');
    scenarioListContainer = document.getElementById('scenario-list-container');
    noScenariosMessage = document.getElementById('no-scenarios-message');
    showHiddenCheckbox = document.getElementById('show-hidden-scenarios');
    saveLoadButton = document.getElementById('save-load-button');
    changeBgButton = document.getElementById('change-bg-button');
    clearCharBtn = document.getElementById('clear-character-btn');
    showWhBtn = document.getElementById('show-warehouse-btn');
    charCreateBtn = document.getElementById('character-create');
    partyListBtn = document.getElementById('party-list');
    newScenBtn = document.getElementById('start-new-scenario-button');
    customScenBtn = document.getElementById('start-custom-scenario-button');
    bookshelfBtn = document.getElementById('show-bookshelf-btn');
    tutorialBtn = document.getElementById('open-tutorial-list-button');
    accordionHeader = document.getElementById('ongoing-scenarios-header');
    accordionContent = document.getElementById('ongoing-scenarios-content');

    // BGM初期化
    if (bgmAudio && stopBgmButton) {
        const stopped = localStorage.getItem('bgmStopped') === 'true';
        updateBgmButtonStatus(stopped);
        if (!stopped) {
            document.addEventListener('click', handleUserGestureForBGM, { once: true });
            setTimeout(() => fadeInPlay(bgmAudio), 100);
        }
        if (!stopBgmButton.hasAttribute('data-bgm-listener-added')) {
            stopBgmButton.addEventListener('click', () => {
                if (!bgmAudio) return;
                const stoppedNow = bgmAudio.paused || bgmAudio.volume === 0;
                if (stoppedNow) {
                    fadeInPlay(bgmAudio);
                    localStorage.setItem('bgmStopped', 'false');
                    updateBgmButtonStatus(false);
                } else {
                    let vol = bgmAudio.volume;
                    const id = setInterval(() => {
                        vol -= 0.1;
                        if (vol <= 0) {
                            clearInterval(id);
                            bgmAudio.pause();
                            bgmAudio.currentTime = 0;
                            bgmAudio.volume = 0;
                        } else {
                            bgmAudio.volume = vol;
                        }
                    }, 50);
                    localStorage.setItem('bgmStopped', 'true');
                    updateBgmButtonStatus(true);
                }
            });
            stopBgmButton.setAttribute('data-bgm-listener-added', 'true');
        }
    } else {
        console.warn('BGM elements not found.');
    }

    // DB初期化
    try {
        console.log('Initializing DB...');
        await initIndexedDB();
        console.log('DB initialized.');
        console.log('Initializing modules...');
        if (typeof initAvatar === 'function') initAvatar();
        else console.warn('initAvatar not found');
        if (typeof initBackground === 'function') await initBackground('index');
        else console.warn('initBackground not found');
        await initMenuPage(); // メインページコンテンツ初期化
        console.log('Page initialization complete.');
    } catch (e) {
        console.error('Initialization error:', e);
        showToast(`初期化エラー: ${e.message}`);
        disableCoreFeaturesOnError();
    }
}); // End of DOMContentLoaded

/** エラー時機能無効化 */
function disableCoreFeaturesOnError() {
    console.error('Disabling features due to error.');
    const btns = document.querySelectorAll(
        '.application-bar button, .container button, .container select'
    );
    btns.forEach((el) => {
        const keep = ['set-api-key-button', 'open-tutorial-list-button'];
        el.disabled = true;
        el.style.opacity = '0.5';
        el.style.cursor = 'not-allowed';
    });
    console.error('Core features disabled.');
}

/** initMenuPage: メインページのコンテンツ初期化 */
async function initMenuPage() {
    console.log('Initializing menu page content...');
    updateApiKeyButtonStatus(); // キー状態表示

    // DBデータ読み込み
    try {
        const scenarios = await listAllScenarios();
        window.cachedScenarios = scenarios;
    } catch (e) {
        console.error('Scenario list load failed:', e);
        showToast('シナリオ一覧読込失敗');
        window.cachedScenarios = [];
    }
    try {
        const chars = await loadCharacterDataFromIndexedDB();
        window.characterData = chars || [];
    } catch (e) {
        console.error('Char data load failed:', e);
        window.characterData = [];
    }

    // チェックボックス状態復元
    let showHiddenInitialState = false;
    if (showHiddenCheckbox) {
        try {
            showHiddenInitialState = localStorage.getItem(SHOW_HIDDEN_CHECKBOX_KEY) === 'true';
            showHiddenCheckbox.checked = showHiddenInitialState;
        } catch (e) {
            /* ... */
        }
    }

    // シナリオ一覧表示 (復元状態で)
    if (scenarioListContainer) applyScenarioFilter(showHiddenInitialState); // フィルタ適用
    else {
        console.warn('Scenario list container missing.');
    }

    initAccordion(); // アコーディオン初期化
    setupMenuButtons(); // ボタンイベント設定

    console.log('Menu page content initialized.');
}

/** APIキーボタンの状態を更新 */
function updateApiKeyButtonStatus() {
    if (!setApiKeyButton) return;
    const geminiKey = localStorage.getItem(GEMINI_API_KEY_LS_KEY);
    const stabilityKey = localStorage.getItem(STABILITY_API_KEY_LS_KEY);
    if (geminiKey) {
        let txt = `<span class="iconmoon icon-key"></span> 設定済`;
        if (!stabilityKey) txt += ` (画像未)`;
        setApiKeyButton.innerHTML = txt;
        setApiKeyButton.title = `G:${geminiKey.substring(0, 4)}...\nS:${stabilityKey ? `${stabilityKey.substring(0, 4)}...` : '未設定'
            }`;
    } else {
        setApiKeyButton.textContent = 'APIキー設定';
        setApiKeyButton.title = 'APIキー設定';
    }
}

/** メニュー内のボタン等のイベント設定 (hasAttribute チェック復活) */
function setupMenuButtons() {
    console.log('Setting up menu buttons (with duplicate listener check)...');
    // APIキー設定ボタン
    if (setApiKeyButton && !setApiKeyButton.hasAttribute('data-apikey-listener-added')) {
        setApiKeyButton.addEventListener('click', openApiKeysModal);
        setApiKeyButton.setAttribute('data-apikey-listener-added', 'true');
    }
    // クリアボタン
    if (clearCharBtn && !clearCharBtn.hasAttribute('data-listener-added')) {
        clearCharBtn.addEventListener('click', async () => {
            multiModalOpen({
                title: '全エレメントクリア確認',
                contentHtml: '<p>生成物全削除？</p>',
                okLabel: '削除',
                okButtonColor: '#f44336',
                onOk: async () => {
                    window.characterData = [];
                    try {
                        await saveCharacterDataToIndexedDB([]);
                        console.log('Cleared char data.');
                        showToast('全エレメント削除完了');
                    } catch (e) {
                        console.error('Clear failed:', e);
                        showToast('削除失敗');
                    }
                },
            });
        });
        clearCharBtn.setAttribute('data-listener-added', 'true');
    }
    // 倉庫ボタン
    if (showWhBtn && !showWhBtn.hasAttribute('data-listener-added')) {
        showWhBtn.addEventListener('click', () => {
            if (typeof showWarehouseModal === 'function') showWarehouseModal('menu');
            else console.error('showWhModal not found.');
        });
        showWhBtn.setAttribute('data-listener-added', 'true');
    }
    // キャラ生成ボタン
    if (charCreateBtn && !charCreateBtn.hasAttribute('data-listener-added')) {
        charCreateBtn.addEventListener('click', () => {
            window.location.href = 'characterCreate.html';
        });
        charCreateBtn.setAttribute('data-listener-added', 'true');
    }
    // パーティリストボタン
    if (partyListBtn && !partyListBtn.hasAttribute('data-listener-added')) {
        partyListBtn.addEventListener('click', () => {
            window.location.href = 'partyList.html';
        });
        partyListBtn.setAttribute('data-listener-added', 'true');
    }
    // 新規シナリオボタン
    if (newScenBtn && !newScenBtn.hasAttribute('data-listener-added')) {
        newScenBtn.addEventListener('click', () => {
            window.location.href = 'scenarioWizard.html';
        });
        newScenBtn.setAttribute('data-listener-added', 'true');
    }
    // カスタムシナリオボタン
    if (customScenBtn && !customScenBtn.hasAttribute('data-listener-added')) {
        customScenBtn.addEventListener('click', () => {
            window.location.href = 'customScenario.html';
        });
        customScenBtn.setAttribute('data-listener-added', 'true');
    }
    // 本棚ボタン
    if (bookshelfBtn && !bookshelfBtn.hasAttribute('data-listener-added')) {
        bookshelfBtn.addEventListener('click', () => {
            window.location.href = 'bookshelf.html';
        });
        bookshelfBtn.setAttribute('data-listener-added', 'true');
    }
    // 取説ボタン
    if (tutorialBtn && !tutorialBtn.hasAttribute('data-listener-added')) {
        tutorialBtn.addEventListener('click', () => {
            window.location.href = 'tutorialList.html';
        });
        tutorialBtn.setAttribute('data-listener-added', 'true');
    }

    // 背景ボタン (background.js でリスナー設定想定)
    if (
        changeBgButton &&
        typeof onChangeBgButtonClick === 'function' &&
        !changeBgButton.hasAttribute('data-bg-listener-added')
    ) {
        // background.js側でリスナーが追加されることを期待
    }

    // 非表示チェックボックス (hasAttribute チェック復活)
    if (showHiddenCheckbox) {
        if (!showHiddenCheckbox.hasAttribute('data-hidden-listener-added')) {
            console.log('[Menu Debug] Adding listeners to checkbox (with check).');
            showHiddenCheckbox.addEventListener('click', (e) => {
                e.stopPropagation();
            });
            showHiddenCheckbox.addEventListener('change', () => {
                console.log('[Menu Debug] CB changed!');
                const isChecked = showHiddenCheckbox.checked;
                console.log(`State: ${isChecked}`);
                try {
                    localStorage.setItem(SHOW_HIDDEN_CHECKBOX_KEY, String(isChecked));
                    console.log(`Saved state.`);
                } catch (e) {
                    console.error('Fail save state:', e);
                    showToast('状態保存失敗');
                }
                applyScenarioFilter(isChecked);
            });
            showHiddenCheckbox.setAttribute('data-hidden-listener-added', 'true');
        } else {
            console.log('[Menu] CB listener already added.');
        }
    } else {
        console.warn('Show hidden checkbox not found.');
    }
    console.log('Menu buttons setup complete.');
}

/** APIキー設定モーダルを開く (Gemini & Stability AI) */
function openApiKeysModal() {
    console.log('Opening API Keys modal...');
    let tempG = localStorage.getItem(GEMINI_API_KEY_LS_KEY) || '';
    let tempS = localStorage.getItem(STABILITY_API_KEY_LS_KEY) || '';

    const modelSelectorHtml = `
        <div class="model-selector" style="margin-top: 20px; margin-bottom: 20px; padding: 15px; background-color: rgba(0,0,0,0.2); border-radius: 5px; border: 1px solid #777;">
            <label for="model-select" style="margin-right: 10px;">使用するモデル:</label>
            <select id="model-select" disabled style="margin-right: 10px; padding: 5px; background-color: #555; color: #fff; border: 1px solid #777;">
                <option value="">モデルを読み込み中...</option>
            </select>
            <button id="update-models-button" title="モデルリストを再取得します" disabled style="padding: 5px 10px;">リスト更新</button>
            <div id="model-description" class="model-description" style="font-size: 0.8rem; margin-top: 10px; color: #ccc;"></div>
            <div class="pricing-link" style="font-size: 0.8rem; margin-top: 5px;">
                <a href="https://ai.google.dev/pricing" target="_blank" rel="noopener noreferrer" style="color: #aef;">料金情報はこちら (公式)</a>
            </div>
        </div>
    `;

    // ★変更: contentHtml にパスワード表示切替ボタンとモデルセレクターを追加
    const apiKeyInputStyle = "width: calc(100% - 50px); padding: 8px; background-color: #555; color: #fff; border: 1px solid #777; border-radius: 3px 0 0 3px; vertical-align: middle;"; // 幅調整
    const toggleButtonStyle = "width: 50px; padding: 8px; cursor: pointer; background-color: #666; color: #fff; border: 1px solid #777; border-left: none; border-radius: 0 3px 3px 0; user-select: none; font-size: 0.8em; line-height: 1.5; vertical-align: middle; box-sizing: border-box;"; // スタイル調整

    multiModalOpen({
        id: 'api-keys-modal',
        title: 'APIキー設定',
        contentHtml: `
            <p style="font-size: 0.9em; margin-bottom: 15px;">各サービスのサイトで取得したAPIキーを入力・保存してください。</p>
            <div style="margin-bottom: 20px;">
                <label for="temp-gemini-api-key-input" style="display: block; margin-bottom: 5px;"><b>Gemini API Key (テキスト生成用):</b></label>
                <div style="display: flex; align-items: center;">
                    <input type="password" id="temp-gemini-api-key-input" placeholder="Google AI Studio 等で取得 (AIza...)" style="${apiKeyInputStyle}" value="${DOMPurify.sanitize(tempG)}"/>
                    <button type="button" class="toggle-password" data-target="temp-gemini-api-key-input" style="${toggleButtonStyle}">表示</button>
                </div>
                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" style="font-size: 0.8em; color: #aef;">Gemini キー取得</a>
            </div>
            <div style="margin-bottom: 10px;">
                <label for="temp-stability-api-key-input" style="display: block; margin-bottom: 5px;"><b>Stability AI API Key (画像生成用):</b></label>
                <div style="display: flex; align-items: center;">
                    <input type="password" id="temp-stability-api-key-input" placeholder="Stability AI Platform で取得 (sk-...)" style="${apiKeyInputStyle}" value="${DOMPurify.sanitize(tempS)}"/>
                     <button type="button" class="toggle-password" data-target="temp-stability-api-key-input" style="${toggleButtonStyle}">表示</button>
                </div>
                <a href="https://platform.stability.ai/account/keys" target="_blank" rel="noopener noreferrer" style="font-size: 0.8em; color: #aef;">Stability AI キー取得</a>
            </div>
            ${modelSelectorHtml} `,
        appearanceType: 'center',
        showCloseButton: true,
        closeOnOutsideClick: true,
        additionalButtons: [
            {
                label: '両方クリア',
                onClick: (modal) => {
                    multiModalOpen({
                        title: 'クリア確認',
                        contentHtml: '<p>両キー削除？</p>',
                        okLabel: '削除',
                        okButtonColor: '#dc3545',
                        onOk: () => {
                            localStorage.removeItem(GEMINI_API_KEY_LS_KEY);
                            localStorage.removeItem(STABILITY_API_KEY_LS_KEY);
                            // ★変更: モーダル内の入力欄もクリア
                            const gInput = document.getElementById('temp-gemini-api-key-input');
                            const sInput = document.getElementById('temp-stability-api-key-input');
                            if (gInput) gInput.value = '';
                            if (sInput) sInput.value = '';
                            updateApiKeyButtonStatus();
                            // ★変更: キー削除時はモデルリスト関連UIをリセット (エラー表示は loadAvailableModels 内で行う)
                            if (modelSelectElement) {
                                modelSelectElement.innerHTML = '<option value="">Geminiキー未設定</option>';
                                modelSelectElement.disabled = true;
                            }
                            if (updateModelsButton) updateModelsButton.disabled = true;
                            if (modelDescriptionElement) modelDescriptionElement.textContent = 'Gemini APIキーを設定してください。';
                            showToast('両キー削除');
                        },
                    });
                },
            },
        ],
        cancelLabel: '閉じる',
        okLabel: '保存',
        okButtonId: 'api-key-save-button',
        onOk: async () => {
            const gIn = document.getElementById('temp-gemini-api-key-input');
            const sIn = document.getElementById('temp-stability-api-key-input');
            if (!gIn || !sIn) return false;
            const newG = gIn.value.trim();
            const newS = sIn.value.trim();
            let gCh = false,
                sCh = false;
            const curG = localStorage.getItem(GEMINI_API_KEY_LS_KEY) || '';
            const curS = localStorage.getItem(STABILITY_API_KEY_LS_KEY) || '';
            if (newG !== curG) {
                gCh = true;
                if (newG) localStorage.setItem(GEMINI_API_KEY_LS_KEY, newG);
                else localStorage.removeItem(GEMINI_API_KEY_LS_KEY);
                console.log(`Gemini Key ${newG ? 'upd' : 'clr'}.`);
                // キー変更時にモデルリストを再読み込み
                await loadAvailableModels(true, newG || null);
            }
            if (newS !== curS) {
                sCh = true;
                if (newS) localStorage.setItem(STABILITY_API_KEY_LS_KEY, newS);
                else localStorage.removeItem(STABILITY_API_KEY_LS_KEY);
                console.log(`Stability Key ${newS ? 'upd' : 'clr'}.`);
            }
            updateApiKeyButtonStatus();
            if (gCh || sCh) showToast('APIキー更新');
            else showToast('変更なし');
            // 保存後にGeminiキーがない場合はUIをリセット
            if (!localStorage.getItem(GEMINI_API_KEY_LS_KEY)) {
                if (modelSelectElement) {
                    modelSelectElement.innerHTML = '<option value="">Geminiキー未設定</option>';
                    modelSelectElement.disabled = true;
                }
                if (updateModelsButton) updateModelsButton.disabled = true;
                if (modelDescriptionElement) modelDescriptionElement.textContent = 'Gemini APIキーを設定してください。';
            }
        },
        // onOpenコールバックでモーダル内の要素への処理を行う
        onOpen: () => {
            console.log('API Keys modal opened.');
            // モーダル内のモデル関連要素をグローバル変数に代入 (元の関数が参照するため)
            modelSelectElement = document.getElementById('model-select');
            modelDescriptionElement = document.getElementById('model-description');
            updateModelsButton = document.getElementById('update-models-button');

            // パスワード表示切り替えボタンのイベントリスナーを設定
            const toggleButtons = document.querySelectorAll('.toggle-password');
            toggleButtons.forEach(button => {
                if (!button.hasAttribute('data-pw-toggle-listener-added')) {
                    button.addEventListener('click', (event) => {
                        const currentButton = event.currentTarget;
                        const targetId = currentButton.dataset.target;
                        const passwordInput = document.getElementById(targetId);
                        if (passwordInput) {
                            const currentType = passwordInput.getAttribute('type');
                            if (currentType === 'password') {
                                passwordInput.setAttribute('type', 'text');
                                currentButton.textContent = '非表示'; // テキスト変更
                            } else {
                                passwordInput.setAttribute('type', 'password');
                                currentButton.textContent = '表示'; // テキスト変更
                            }
                        }
                    });
                    button.setAttribute('data-pw-toggle-listener-added', 'true');
                }
            });

            // モーダル表示時にモデルセレクターのイベントを設定
            setupModelSelectorEvents();
            // モーダル表示時にモデルリストを読み込む
            const currentGeminiApiKey = localStorage.getItem(GEMINI_API_KEY_LS_KEY);
            loadAvailableModels(false, currentGeminiApiKey);
        },
    });
}

/** モデルセレクター関連イベント設定 */
function setupModelSelectorEvents() {
    // グローバル変数 modelSelectElement, updateModelsButton を使う
    if (modelSelectElement) {
        // 重複リスナー防止は元のコードにあればそのまま、なければ追加しない
        modelSelectElement.addEventListener('change', updateModelDescription);
        console.log('Model select listener added.');
    } else {
        console.warn('modelSelectElement not found when setting up events.'); // モーダル表示前はnull
    }
    if (updateModelsButton) {
        // 重複リスナー防止は元のコードにあればそのまま、なければ追加しない
        updateModelsButton.addEventListener('click', () => {
            const key = localStorage.getItem(GEMINI_API_KEY_LS_KEY);
            if (!key) {
                showToast('Geminiキー未設定');
                return;
            }
            if (!isLoadingModels) {
                console.log('Update models clicked.');
                loadAvailableModels(true, key);
            } else {
                showToast('モデルリスト読込中');
            }
        });
        console.log('Update models listener added.');
    } else {
        console.warn('updateModelsButton not found when setting up events.'); // モーダル表示前はnull
    }
}

/** 利用可能モデル取得＆表示 */
async function loadAvailableModels(forceUpdate = false, apiKeyToUse) {
    // グローバル変数 modelSelectElement 等を使う前提
    if (isLoadingModels) {
        console.log('Models loading.');
        return;
    }
    // 要素の存在チェックは元のコードのまま
    if (!modelSelectElement || !updateModelsButton || !apiKeyToUse) {
        console.log(`Cannot load models: elements or API Key missing.`);
        if (modelSelectElement) modelSelectElement.innerHTML = '<option>Geminiキー未設定</option>';
        if (updateModelsButton) updateModelsButton.disabled = true;
        isLoadingModels = false;
        return;
    }
    console.log(`Loading models (Force: ${forceUpdate})...`);
    isLoadingModels = true;
    modelSelectElement.innerHTML = '<option>読込中...</option>';
    modelSelectElement.disabled = true; // 読み込み中は無効化
    updateModelsButton.disabled = true; // 読み込み中は無効化
    if (modelDescriptionElement) modelDescriptionElement.textContent = '';

    let models = null;
    // キャッシュ処理は元のコードにあればそのまま、なければシンプルに取得
    try {
        console.log('Fetching models...');
        models = await GeminiApiClient.listAvailableModels(apiKeyToUse);
        console.log(`Workspaceed ${models?.length || 0} models.`);
    } catch (e) {
        console.error('Model fetch error:', e);
        showToast(`モデル取得エラー: ${e.message}`);
        models = null;
    }

    modelSelectElement.innerHTML = ''; // クリア
    if (models?.length) {
        const pref =
            localStorage.getItem(PREFERRED_GEMINI_MODEL_LS_KEY) || 'gemini-1.5-flash-latest';
        models.forEach((m) => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.tier ? `${m.displayName} (${m.tier})` : m.displayName;
            opt.dataset.description = m.description || '';
            if (m.id === pref) opt.selected = true;
            modelSelectElement.appendChild(opt);
        });
        updateModelDescription();
        modelSelectElement.disabled = false; // 読み込み完了で有効化
    } else {
        modelSelectElement.innerHTML = '<option>利用不可</option>';
        modelSelectElement.disabled = true; // 利用不可なら無効化
        if (modelDescriptionElement) modelDescriptionElement.textContent = '';
        if (!apiKeyToUse) {
            /* apiKeyがない場合の処理は関数の最初で行っている */
        } else if (models === null) { // APIエラーの場合
            showToast('モデルリストの取得に失敗しました');
        } else { // モデルが0件の場合
            showToast('利用可能なテキストモデルがありません');
        }
    }
    isLoadingModels = false;
    updateModelsButton.disabled = false; // ★追加: 更新ボタンは常に有効化
    console.log(`Model loading finished.`);
}

/** 選択モデルの説明表示 */
function updateModelDescription() {
    // グローバル変数 modelSelectElement, modelDescriptionElement を使う
    if (!modelSelectElement || !modelDescriptionElement) {
        console.warn('Model select or description element not found for update.');
        return;
    }
    const opt = modelSelectElement.options[modelSelectElement.selectedIndex];
    if (!opt || !opt.value) {
        modelDescriptionElement.textContent = '';
        return;
    }
    const desc = opt.dataset.description;
    modelDescriptionElement.textContent = desc || '';
    localStorage.setItem(PREFERRED_GEMINI_MODEL_LS_KEY, opt.value);
    console.log(`Desc updated: ${opt.value}`);
}

/** アコーディオン初期化 */
function initAccordion() {
    accordionHeader = document.getElementById('ongoing-scenarios-header');
    accordionContent = document.getElementById('ongoing-scenarios-content');
    if (!accordionHeader || !accordionContent) {
        console.warn('Accordion missing.');
        return;
    }
    const state = localStorage.getItem('ongoingScenariosAccordionState');
    if (state === 'open') accordionContent.classList.add('open');
    console.log(`Accordion state: ${state || 'closed'}.`);
    if (!accordionHeader.hasAttribute('data-accordion-listener-added')) {
        accordionHeader.addEventListener('click', (e) => {
            if (
                e.target.closest('#show-hidden-scenarios') ||
                e.target.closest("label[for='show-hidden-scenarios']")
            )
                return;
            accordionContent.classList.toggle('open');
            const ns = accordionContent.classList.contains('open') ? 'open' : 'closed';
            localStorage.setItem('ongoingScenariosAccordionState', ns);
            console.log(`Accordion toggled: ${ns}.`);
        });
        accordionHeader.setAttribute('data-accordion-listener-added', 'true');
        console.log('Accordion initialized.');
    }
}
/** シナリオリストフィルタ適用 (★ お気に入り最上位表示 実装) */
function applyScenarioFilter(showHidden) {
    if (!scenarioListContainer || !noScenariosMessage) {
        console.warn('Scenario list elements missing.');
        return;
    }
    console.log(`Applying filter (ShowHidden: ${showHidden})`);
    console.log(`[Debug] applyScenarioFilter called with showHidden = ${showHidden}`);
    const allScenarios = window.cachedScenarios || [];
    const sortedAll = [...allScenarios].sort((a, b) =>
        (b.updatedAt || '').localeCompare(a.updatedAt || '')
    );
    const favorites = sortedAll.filter((s) => s?.isFavorite === true);
    console.log(`Found ${favorites.length} favorites.`);
    const nonFavorites = sortedAll.filter((s) => s?.isFavorite !== true);
    let displayScenarios = [];
    if (showHidden) {
        const normals = nonFavorites
            .filter((s) => s?.hideFromHistoryFlag !== true)
            .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
        const hiddens = nonFavorites
            .filter((s) => s?.hideFromHistoryFlag === true)
            .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
        displayScenarios = [...favorites, ...normals, ...hiddens];
        console.log(
            `Show ON: Fav(${favorites.length}), Norm(${normals.length}), Hidden(${hiddens.length})`
        );
    } else {
        const normals = nonFavorites
            .filter((s) => s?.hideFromHistoryFlag !== true)
            .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
        const top3 = normals.slice(0, 3);
        displayScenarios = [...favorites, ...top3];
        console.log(`Show OFF: Fav(${favorites.length}), Top 3(${top3.length})`);
    }
    scenarioListContainer.innerHTML = '';
    if (displayScenarios.length === 0) {
        scenarioListContainer.style.display = 'none';
        noScenariosMessage.style.display = 'block';
    } else {
        scenarioListContainer.style.display = '';
        noScenariosMessage.style.display = 'none';
        displayScenarios.forEach((sc) => {
            const row = createScenarioRow(sc);
            if (row) scenarioListContainer.appendChild(row);
        });
    }
    console.log(`Rendered ${displayScenarios.length} rows.`);
}
/** シナリオ行DOM生成 (★ お気に入りボタン実装済) */
function createScenarioRow(scenario) {
    if (!scenario || typeof scenario.scenarioId === 'undefined') return null;
    const div = document.createElement('div');
    div.className = 'scenario-list';
    div.dataset.scenarioId = scenario.scenarioId;
    if (scenario.isFavorite) div.classList.add('is-favorite');
    const favButton = document.createElement('button');
    favButton.className = 'favorite-btn';
    favButton.innerHTML = scenario.isFavorite
        ? '<span class="iconmoon icon-star-full"></span>'
        : '<span class="iconmoon icon-star-empty"></span>';
    favButton.title = scenario.isFavorite ? 'お気に入り解除' : 'お気に入りに追加';
    favButton.style.color = scenario.isFavorite ? 'gold' : '#ccc';
    favButton.style.fontSize = '1.3rem';
    favButton.addEventListener('click', async (e) => {
        e.stopPropagation();
        await toggleFavorite(scenario.scenarioId, favButton);
    });
    const titleWrap = document.createElement('div');
    titleWrap.style.display = 'flex';
    titleWrap.style.alignItems = 'center';
    titleWrap.appendChild(favButton);
    const info = document.createElement('span');
    info.className = 'info';
    let date = scenario.updatedAt;
    try {
        date = new Date(date).toLocaleString('ja-JP');
    } catch { }
    info.innerHTML = `<span style="color:#888; font-size:0.8em; margin-right: 5px;">ID:${scenario.scenarioId
        }</span> | ${DOMPurify.sanitize(
            scenario.title || '(無題)'
        )} <small style="color:#888;">(更新: ${date})</small>`;
    titleWrap.appendChild(info);
    div.appendChild(titleWrap);
    const btns = document.createElement('div');
    btns.className = 'buttons';
    const showHidden = showHiddenCheckbox?.checked || false;
    if (!showHidden) {
        const btnCont = document.createElement('button');
        btnCont.type = 'button';
        btnCont.innerHTML = `<span class="iconmoon icon-arrow-right"></span> 始める`;
        btnCont.addEventListener('click', () => {
            window.location.href = `scenario.html?scenarioId=${scenario.scenarioId}`;
        });
        btns.appendChild(btnCont);
        const btnShelf = document.createElement('button');
        btnShelf.type = 'button';
        btnShelf.classList.add('btn-shelf');
        updateShelfButton(btnShelf, scenario.bookShelfFlag);
        btnShelf.addEventListener('click', async () => {
            await toggleBookShelfFlag(scenario.scenarioId, btnShelf);
        });
        btns.appendChild(btnShelf);
    }
    const btnHide = document.createElement('button');
    btnHide.type = 'button';
    if (!scenario.hideFromHistoryFlag) {
        btnHide.innerHTML = `<span class="iconmoon icon-bin"></span> 非表示`;
        btnHide.addEventListener('click', () => showHideConfirmModal(scenario));
    } else {
        btnHide.innerHTML = `<span class="iconmoon icon-undo2"></span> 表示`;
        btnHide.style.backgroundColor = '#757575';
        btnHide.addEventListener('click', async () => {
            await toggleHideFromHistoryFlag(scenario, false);
            showToast(`「${scenario.title || scenario.scenarioId}」を表示`);
        });
    }
    btns.appendChild(btnHide);
    if (showHidden && scenario.hideFromHistoryFlag) {
        const btnDel = document.createElement('button');
        btnDel.type = 'button';
        btnDel.innerHTML = `<span class="iconmoon icon-cross"></span> 完全削除`;
        btnDel.style.backgroundColor = '#f44336';
        btnDel.addEventListener('click', () => showDeleteConfirmModal(scenario));
        btns.appendChild(btnDel);
    }
    div.appendChild(btns);
    return div;
}
/** お気に入り状態トグル */
async function toggleFavorite(scenarioId, buttonElement) {
    console.log(`Toggling favorite for ${scenarioId}`);
    const idx = window.cachedScenarios.findIndex((s) => s.scenarioId === scenarioId);
    if (idx === -1) {
        showToast('エラー: シナリオ未発見');
        return;
    }
    const sc = window.cachedScenarios[idx];
    const newState = !(sc.isFavorite || false);
    sc.isFavorite = newState;
    sc.updatedAt = new Date().toISOString();
    buttonElement.innerHTML = newState
        ? '<span class="iconmoon icon-star-full"></span>'
        : '<span class="iconmoon icon-star-empty"></span>';
    buttonElement.style.color = newState ? 'gold' : '#ccc';
    buttonElement.title = newState ? '解除' : '追加';
    buttonElement.closest('.scenario-list')?.classList.toggle('is-favorite', newState);
    try {
        await updateScenario(sc);
        console.log(`Fav state -> ${newState} saved for ${scenarioId}`);
        showToast(newState ? 'お気に入り追加' : 'お気に入り解除');
        const showHidden = showHiddenCheckbox?.checked || false;
        applyScenarioFilter(showHidden);
    } catch (e) {
        console.error(`Fail update fav state ${scenarioId}:`, e);
        showToast(`お気に入り更新失敗: ${e.message}`);
        sc.isFavorite = !newState;
        buttonElement.innerHTML = !newState
            ? '<span class="iconmoon icon-star-full"></span>'
            : '<span class="iconmoon icon-star-empty"></span>';
        buttonElement.style.color = !newState ? 'gold' : '#ccc';
        buttonElement.title = !newState ? '解除' : '追加';
        buttonElement.closest('.scenario-list')?.classList.toggle('is-favorite', !newState);
    }
}
/** 本棚ボタン表示更新 */
function updateShelfButton(buttonElement, isShelved) {
    if (!buttonElement) return;
    if (isShelved) {
        buttonElement.innerHTML = `<span class="iconmoon icon-book"></span> 収納済`;
        buttonElement.style.backgroundColor = '#757575';
        buttonElement.title = '本棚から出す';
    } else {
        buttonElement.innerHTML = `<span class="iconmoon icon-books"></span> 本棚へ`;
        buttonElement.style.backgroundColor = '';
        buttonElement.title = '本棚へ収納';
    }
}
/** 本棚フラグトグル */
async function toggleBookShelfFlag(scenarioId, buttonElement) {
    console.log(`Toggling bookshelf for ${scenarioId}`);
    const idx = window.cachedScenarios.findIndex((s) => s.scenarioId === scenarioId);
    if (idx === -1) {
        showToast('シナリオ未発見');
        return;
    }
    const sc = window.cachedScenarios[idx];
    const newFlag = !sc.bookShelfFlag;
    try {
        sc.bookShelfFlag = newFlag;
        sc.updatedAt = new Date().toISOString();
        sc.shelfOrder = newFlag ? sc.shelfOrder || Date.now() : undefined;
        await updateScenario(sc);
        console.log(`Bookshelf flag -> ${newFlag}`);
        updateShelfButton(buttonElement, newFlag);
        showToast(newFlag ? `本棚へ収納` : `本棚から出す`);
    } catch (e) {
        console.error(`Failed toggle bookshelf for ${scenarioId}:`, e);
        showToast(`本棚更新失敗: ${e.message}`);
        sc.bookShelfFlag = !newFlag;
        updateShelfButton(buttonElement, !newFlag);
    }
}
/** 非表示フラグトグル */
async function toggleHideFromHistoryFlag(scenario, hideFlag) {
    console.log(`Toggling hide flag for ${scenario.scenarioId} to ${hideFlag}`);
    const idx = window.cachedScenarios.findIndex((s) => s.scenarioId === scenario.scenarioId);
    if (idx === -1) {
        showToast('シナリオ未発見');
        return;
    }
    const origFlag = scenario.hideFromHistoryFlag;
    try {
        scenario.hideFromHistoryFlag = hideFlag;
        scenario.updatedAt = new Date().toISOString();
        await updateScenario(scenario);
        console.log(`Hide flag -> ${hideFlag}`);
        applyScenarioFilter(showHiddenCheckbox.checked);
    } catch (e) {
        console.error(`Failed toggle hide flag for ${scenario.scenarioId}:`, e);
        showToast(`表示/非表示切替失敗: ${e.message}`);
        scenario.hideFromHistoryFlag = origFlag;
        applyScenarioFilter(showHiddenCheckbox.checked);
    }
}
/** 非表示確認モーダル */
function showHideConfirmModal(scenario) {
    multiModalOpen({
        title: '非表示確認',
        contentHtml: `<p>「${DOMPurify.sanitize(
            scenario.title || scenario.scenarioId
        )}」を非表示？</p>`,
        okLabel: '非表示',
        onOk: async () => {
            await toggleHideFromHistoryFlag(scenario, true);
            showToast(`「${scenario.title || scenario.scenarioId}」を非表示に`);
        },
    });
}
/** 削除確認モーダル */
function showDeleteConfirmModal(scenario) {
    multiModalOpen({
        title: '完全削除確認',
        contentHtml: `<p style="color:#ffcccc;"><strong>警告:</strong> 「${DOMPurify.sanitize(
            scenario.title || scenario.scenarioId
        )}」完全削除？</p>`,
        okLabel: '完全削除',
        okButtonColor: '#f44336',
        onOk: async () => {
            console.log(`Deleting ${scenario.scenarioId}...`);
            try {
                await deleteScenarioById(scenario.scenarioId);
                window.cachedScenarios = window.cachedScenarios.filter(
                    (s) => s.scenarioId !== scenario.scenarioId
                );
                console.log(`Deleted ${scenario.scenarioId}.`);
                showToast(`削除完了`);
                applyScenarioFilter(showHiddenCheckbox.checked);
            } catch (e) {
                console.error(`Failed delete ${scenario.scenarioId}:`, e);
                showToast(`削除失敗: ${e.message}`);
            }
        },
    });
}
/** シナリオ行DOM更新 */
function updateScenarioRow(rowElement, scenario) {
    const newRow = createScenarioRow(scenario);
    rowElement.replaceWith(newRow);
}

// --- ファイル読み込み完了ログ ---
console.log('[Menu] menu.js loaded.');
