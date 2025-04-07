/********************************
 * sceneUI.js
 * シナリオ画面のUI関連イベント・表示更新など
 * ★ API 呼び出しを Gemini Text / Stability Image に変更
 * ★ ES Modules 形式、依存関係を import
 * ★ 省略なし (今度こそ！)
 ********************************/

// --- ▼▼▼ モジュールインポート (想定) ▼▼▼ ---
import { GeminiApiClient } from './geminiApiClient.js';
import { StabilityApiClient } from './stabilityApiClient.js';
import { open as multiModalOpen } from './multiModal.js';
import { showToast } from './common.js';
import {
    addSceneEntry,
    updateSceneEntry,
    getSceneEntriesByScenarioId,
    getEntitiesByScenarioId,
    updateScenario,
    deleteSceneEntry,
} from './indexedDB.js';
// --- 以下の import は関数の実際の場所に合わせてパスや関数名を修正してください ---

// sceneManager.js からと想定される関数 (★要確認/修正)
import {
    getNextScene, // 「次のシーン」「アイテム使用」ボタン
    generateEnglishTranslation, // トークン調整、プロンプト翻訳で使用
    generateImagePromptFromScene, // 挿絵生成のプロンプト作成で使用
    decompressCondition, // ネタバレモーダルや候補生成で使用 (common.jsかも？)
    areAllSectionsCleared, // ★ エンディングボタン表示で使用
    loadScenarioData, // ロード時に必要？(sceneMain.jsで呼ばれる想定)
} from './sceneManager.js'; // ★実際のファイルパスに注意

// sceneExtras.js からと想定される関数 (★要確認/修正)
import {
    showPartyModal, // PTボタン
    openEntitiesModal, // 情報ボタン
    renderEntitiesList, // 情報モーダル内で使用
    onUpdateEntitiesFromAllScenes, // 情報モーダル内で使用
    refreshEndingButtons, // エンディングボタン表示更新
    showEndingModal, // エンディングボタンクリック
} from './sceneExtras.js'; // ★実際のファイルパスに注意

// carousel.js からと想定される関数 (★要確認/修正)
import { initCarousel, removeDuplicateIDs } from './carousel.js';

// DOMPurify, pako はグローバルにある想定 (HTMLで読み込み済み)

// --- localStorage キー (menu.js と合わせる) ---
const GEMINI_API_KEY_LS_KEY = 'geminiApiKey';
const STABILITY_API_KEY_LS_KEY = 'stabilityApiKey';
const PREFERRED_GEMINI_MODEL_LS_KEY = 'preferredGeminiModel';

// --- ★ 画像ビューワの状態管理用オブジェクト初期化 (エラー修正) ★ ---
// window.imageViewerState = { sceneObj: null, currentIndex: 0, images: [], isOpen: false };
// 元の imageViewerState の定義に tapThreshold を追加（もし未定義なら）
window.imageViewerState = {
    sceneObj: null,
    currentIndex: 0,
    images: [],
    isOpen: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    isDragging: false,
    hasMoved: false, // tapThreshold を超えた移動があったか
    didIntentionalDrag: false, // わずかでもドラッグ操作を意図したか
    tapThreshold: 10, // タップと判定する移動距離の閾値 (px)
};

export function intUI(){
    // カルーセル初期化
    if (typeof initCarousel === 'function' && typeof removeDuplicateIDs === 'function') {
        setTimeout(() => {
            initCarousel();
            removeDuplicateIDs();
            console.log('[SceneUI] Carousel initialized.');
        }, 500);
    } else {
        console.warn('Carousel functions not found/imported.');
    }

    // アプリケーションバーへのボタン動的追加 (sceneMain.js で行うべきか要検討)
    const applicationBar = document.querySelector('.application-bar');
    const baseButton = document.getElementById('save-load-button'); // 基準ボタン
    if (applicationBar && baseButton) {
        console.log('[SceneUI] Adding buttons to application bar...');
        // 履歴ボタン
        if (
            !document.getElementById('toggle-history-button') &&
            typeof toggleHistory === 'function'
        ) {
            const historyBtn = document.createElement('button');
            historyBtn.id = 'toggle-history-button';
            historyBtn.innerHTML = '<div class="iconmoon icon-newspaper"></div>履歴';
            historyBtn.title = '履歴表示切替';
            applicationBar.insertBefore(historyBtn, baseButton);
            historyBtn.addEventListener('click', toggleHistory); // このファイル内で定義
        }
        // PTボタン
        if (!document.getElementById('show-party-button') && typeof showPartyModal === 'function') {
            // import
            const partyBtn = document.createElement('button');
            partyBtn.id = 'show-party-button';
            partyBtn.innerHTML = '<div class="iconmoon icon-strategy"></div>PT';
            partyBtn.title = 'パーティ情報';
            applicationBar.insertBefore(partyBtn, baseButton);
            partyBtn.addEventListener('click', showPartyModal);
        }
        // 情報ボタン
        if (!document.getElementById('info-button') && typeof openEntitiesModal === 'function') {
            // import
            const infoBtn = document.createElement('button');
            infoBtn.id = 'info-button';
            infoBtn.innerHTML = '<div class="iconmoon icon-info"></div>情報';
            infoBtn.title = 'エンティティ情報';
            applicationBar.insertBefore(infoBtn, baseButton);
            infoBtn.addEventListener('click', openEntitiesModal);
        }
        // ネタバレ(目標)ボタン
        if (!document.getElementById('spoiler-button')) {
            const spoilerBtn = document.createElement('button');
            spoilerBtn.id = 'spoiler-button';
            spoilerBtn.innerHTML = '<div class="iconmoon icon-flag"></div>目標';
            spoilerBtn.title = '現在の目標';
            spoilerBtn.style.display = 'none';
            applicationBar.insertBefore(spoilerBtn, baseButton);
            spoilerBtn.addEventListener('click', openSpoilerModal); // このファイル内で定義
        }
        // エンディングボタン
        if (!document.getElementById('ending-button') && typeof showEndingModal === 'function') {
            // import
            const endBtn = document.createElement('button');
            endBtn.id = 'ending-button';
            endBtn.innerHTML = `<div class="iconmoon icon-sad"></div>Ending`;
            endBtn.title = 'Bad End';
            endBtn.style.display = 'none';
            applicationBar.insertBefore(endBtn, baseButton);
            endBtn.addEventListener('click', () => showEndingModal('bad'));
        }
        if (
            !document.getElementById('clear-ending-button') &&
            typeof showEndingModal === 'function'
        ) {
            // import
            const clrEndBtn = document.createElement('button');
            clrEndBtn.id = 'clear-ending-button';
            clrEndBtn.innerHTML = `<div class="iconmoon icon-trophy"></div>Ending`;
            clrEndBtn.title = 'Clear End';
            clrEndBtn.style.display = 'none';
            applicationBar.insertBefore(clrEndBtn, baseButton);
            clrEndBtn.addEventListener('click', () => showEndingModal('clear'));
        }
    } else {
        console.warn('Application bar or base button not found for adding buttons.');
    }

    // 回答候補チェックボックス
    const autoGenCbx = document.getElementById('auto-generate-candidates-checkbox');
    if (autoGenCbx) {
        try {
            autoGenCbx.checked = localStorage.getItem('autoGenerateCandidates') === 'true';
        } catch (e) {}
        autoGenCbx.addEventListener('change', () => {
            const isChecked = autoGenCbx.checked;
            try {
                localStorage.setItem('autoGenerateCandidates', String(isChecked));
            } catch (e) {}
            if (isChecked) {
                onGenerateActionCandidates();
            } // このファイル内
            else {
                const cont = document.getElementById('action-candidates-container');
                if (cont) cont.innerHTML = '';
            }
        });
        console.log('[SceneUI] Auto-generate listener added.');
    } else {
        console.warn('Auto-generate checkbox not found.');
    }

    // アイテム使用ボタン
    const useItemBtn = document.getElementById('use-item-button');
    if (useItemBtn) {
        useItemBtn.addEventListener('click', () => {
            if (typeof getNextScene === 'function') getNextScene(true);
            else {
                console.error('getNextScene not found.');
                showToast('エラー: 進行処理不可');
            }
        }); // import
        console.log('[SceneUI] Use item listener added.');
    } else {
        console.warn('Use item button not found.');
    }

    // 全セクション閲覧ボタン
    const viewSectionsBtn = document.getElementById('view-all-sections-button');
    if (viewSectionsBtn) {
        viewSectionsBtn.addEventListener('click', showAllSectionsModal);
        console.log('[SceneUI] View sections listener added.');
    } else {
        console.warn('View sections button not found.');
    }

    // ローディングモーダルキャンセルボタン
    const cancelReqBtn = document.getElementById('cancel-request-button');
    if (cancelReqBtn) {
        cancelReqBtn.addEventListener('click', onCancelFetch);
        console.log('[SceneUI] Loading cancel listener added.');
    } else {
        console.warn('Cancel request button not found.');
    }

    // カスタム画像生成関連ボタン (もしモーダルをJSで開閉する場合)
    /*
     const customGenBtn = document.getElementById('image-custom-generate-button');
     if (customGenBtn) customGenBtn.addEventListener('click', () => { ... });
     const customCancelBtn = document.getElementById('image-custom-cancel-button');
     if (customCancelBtn) customCancelBtn.addEventListener('click', closeImagePromptModal);
     */
}

// --- UI更新系関数 ---

/** ローディングモーダル表示/非表示 */
export function showLoadingModal(show) {
    const m = document.getElementById('loading-modal');
    if (!m) return;
    if (show) {
        m.classList.add('active');
    } else {
        m.classList.remove('active');
    }
}

/** APIリクエストキャンセル試行 */
export function onCancelFetch() {
    console.warn('[SceneUI] Request cancellation attempted (not supported).');
    showLoadingModal(false);
    showToast('キャンセルを試みます...(APIによっては停止できません)'); // import
}

/** 履歴表示のトグル */
function toggleHistory() {
    console.log('履歴ボタンがクリックされました'); // ← これを追加
    // ★ グローバル変数 window.currentScenario を参照
    if (!window.currentScenario) {
        console.warn('toggleHistory: currentScenario not found.');
        return;
    }
    const hist = document.getElementById('scene-history');
    if (!hist) {
        console.warn('toggleHistory: scene-history element not found.');
        return;
    }
    // showHistory プロパティをトグル（なければ false の逆で true に）
    window.currentScenario.showHistory = !(window.currentScenario.showHistory || false);
    hist.style.display = window.currentScenario.showHistory ? 'flex' : 'none';
    console.log(`History visibility toggled: ${window.currentScenario.showHistory}`);
    const btn = document.getElementById('toggle-history-button');
    if (btn) btn.style.backgroundColor = window.currentScenario.showHistory ? '#777' : '';
    // DB保存 (updateScenario は indexedDB.js から import)
    if (typeof updateScenario === 'function') {
        updateScenario(window.currentScenario).catch((e) =>
            console.error('Failed save history state:', e)
        ); // import
    } else {
        console.error('Cannot save history state: updateScenario function missing.');
    }
}

/** ネタバレ（目標表示）モーダルを開く */
function openSpoilerModal() {
    console.log('[SceneUI] Opening spoiler (goal) modal...');
    let goalText = '目標情報なし';
    const wd = window.currentScenario?.wizardData; // global
    // decompressCondition は import されている想定
    if (wd?.sections && typeof decompressCondition === 'function') {
        const sorted = [...wd.sections].sort((a, b) => (a.number || 0) - (b.number || 0));
        const firstUncleared = sorted.find((s) => !s.cleared);
        if (firstUncleared) {
            const condJa = decompressCondition(firstUncleared.conditionZipped || '') || '(不明)';
            const condEn = firstUncleared.conditionEn || '';
            goalText = `目標 (S ${firstUncleared.number}):\n${condJa}${
                condEn ? `\n(EN: ${condEn})` : ''
            }`;
        } else if (sorted.length > 0) {
            goalText = '全セクション目標達成済！';
        }
    } else if (!wd?.sections) {
        goalText = 'セクション情報なし';
    } else {
        goalText = '目標展開関数エラー';
    }

    multiModalOpen({
        // import
        title: '現在のセクション目標',
        contentHtml: `<pre style="white-space:pre-wrap; max-height:60vh; overflow-y:auto;">${DOMPurify.sanitize(
            goalText
        )}</pre>`, // global
        cancelLabel: '閉じる',
    });
}

/** 全セクション一覧モーダルを開く */
function showAllSectionsModal() {
    console.log('[SceneUI] Opening all sections modal...');
    multiModalOpen({
        // import
        title: '全セクション一覧',
        contentHtml: `<div id="all-sections-container" style="max-height:70vh; overflow-y:auto; white-space:pre-wrap; text-align:left; padding: 10px; background: rgba(0,0,0,0.2);">読込中...</div>`,
        cancelLabel: '閉じる',
        onOpen: renderAllSections, // このファイル内で定義
    });
}
/** 全セクション一覧を描画 */
function renderAllSections() {
    const container = document.getElementById('all-sections-container');
    if (!container) return;
    const wd = window.currentScenario?.wizardData; // global
    if (!wd?.sections?.length) {
        container.textContent = 'セクション情報なし';
        return;
    }
    const sorted = [...wd.sections].sort((a, b) => (a.number || 0) - (b.number || 0));
    let content = '';
    // decompressCondition は import されている想定
    if (typeof decompressCondition === 'function') {
        sorted.forEach((sec) => {
            const status = sec.cleared ? '【済】' : '【未】';
            const condition = decompressCondition(sec.conditionZipped || '') || '(不明)';
            const conditionEn = sec.conditionEn ? `\n   (EN: ${sec.conditionEn})` : '';
            content += `▼ S${sec.number} ${status}\n   目標: ${condition}${conditionEn}\n\n`;
        });
    } else {
        content = '条件展開関数エラー';
    }
    container.textContent = content; // pre タグは不要かも
}

// --- API呼び出し関連 ---

/**
 * 回答候補を生成 (★ Gemini API でJSON出力を指示し、JSでシャッフルする修正版)
 */
export async function onGenerateActionCandidates() {
    console.log('[SceneUI] Generating action candidates using Gemini (JSON format)...');

    const gemini = new GeminiApiClient(); // import
    if (!gemini.isAvailable) {
        showToast('Gemini APIキー未設定/無効');
        return;
    }
    if (gemini.isStubMode) {
        console.warn('STUB MODE: Skip candidates');
        const c = document.getElementById('action-candidates-container');
        // スタブモードでも複数のボタンを表示する例
        if (c)
            c.innerHTML = ['探索する', '話しかける', '休憩する', '踊る']
                .sort(() => 0.5 - Math.random()) // スタブもシャッフル
                .map(
                    (t) => `<button style="display:block; text-align:left; margin:0;">${t}</button>`
                )
                .join('');
        return;
    }

    const lastScene = window.scenes?.[window.scenes.length - 1]; // global
    if (!lastScene?.content) {
        showToast('行動候補生成にはシーンが必要');
        return;
    }
    const lastSceneTextJa = lastScene.content;

    // クリア条件テキストの取得
    let conditionTextJa = '(目標情報なし)';
    const wd = window.currentScenario?.wizardData; // global
    if (wd?.sections && typeof decompressCondition === 'function') {
        // decompressCondition を import
        const sorted = [...wd.sections].sort((a, b) => (a.number || 0) - (b.number || 0));
        const firstUncleared = sorted.find((s) => !s.cleared);
        if (firstUncleared) {
            conditionTextJa = decompressCondition(firstUncleared.conditionZipped || '') || '?';
        } else if (sorted.length > 0) {
            conditionTextJa = '(全目標達成済み)';
        }
    } else if (wd && !wd.sections) {
        conditionTextJa = '(セクション情報なし)';
    } else if (typeof decompressCondition !== 'function') {
        console.warn('decompressCondition function not imported/found.');
        conditionTextJa = '(条件展開不可)';
    }

    const candidatesContainer = document.getElementById('action-candidates-container');
    if (candidatesContainer)
        candidatesContainer.innerHTML = `<div class="loading">選択肢生成中...</div>`;
    showLoadingModal(true); // このファイル内で export されている想定

    try {
        const modelId =
            localStorage.getItem(PREFERRED_GEMINI_MODEL_LS_KEY) || 'gemini-1.5-flash-latest';

        // ★★★ プロンプトをJSON出力指示に変更 ★★★
        const prompt = `あなたはTRPGのGMアシスタントです。以下の状況に基づき、プレイヤーが次に取りうる**多様な**行動の選択肢を**4つ**提案し、その結果を必ず指定されたJSON形式で出力してください。\n\n状況:\n---\n現在のシーン:\n${lastSceneTextJa}\n---\n現在の目標（セクションクリア条件）:\n${conditionTextJa}\n---\n\n出力指示:\n- 提案する行動選択肢は4つ生成してください。\n- 各選択肢は具体的で、プレイヤーが実際に行動できる内容にしてください。\n- 多様性を意識し、探索、対話、戦闘準備、回避、あるいは少し意外な行動など、異なる方向性の選択肢を含めてください。\n- **必ず以下のJSON形式で、選択肢テキストの配列のみを出力してください。JSON以外の前置き、後書き、説明、コメント、マークダウンの \`\`\`json \`\`\` などは一切含めないでください。**\n\n出力形式 (JSON):\n{\n  "options": [\n    "選択肢のテキスト1",\n    "選択肢のテキスト2",\n    "選択肢のテキスト3",\n    "選択肢のテキスト4"\n  ]\n}`;
        console.log('[onGenerateActionCandidates] Prompt for options (JSON format):', prompt);

        gemini.initializeHistory([]);
        console.log('[onGenerateActionCandidates] Calling API for options...');
        const jsonString = await gemini.generateContent(prompt, modelId); // API呼び出し (JSON文字列が返る想定)
        console.log('[onGenerateActionCandidates] API raw response:', jsonString);

        let options = [];
        try {
            // ★★★ JSONパース処理 (マークダウン除去含む) ★★★
            const cleanJsonString = jsonString
                .replace('```json', '') // 開始マーカーを除去
                .replace('```', '') // 終了マーカーを除去
                .trim();
            const responseObject = JSON.parse(cleanJsonString);

            if (responseObject && Array.isArray(responseObject.options)) {
                options = responseObject.options
                    .map((opt) => String(opt).trim()) // 文字列化、トリム
                    .filter((opt) => opt && opt.length > 1); // 空や短すぎるものを除去
                console.log(
                    `[onGenerateActionCandidates] Parsed ${options.length} options successfully.`
                );
            } else {
                console.warn(
                    '[onGenerateActionCandidates] Invalid JSON structure received:',
                    cleanJsonString
                );
                throw new Error('AIが期待しない形式で応答しました。');
            }
        } catch (e) {
            console.error(
                '[onGenerateActionCandidates] Failed to parse JSON response:',
                e,
                jsonString
            );
            if (typeof showToast === 'function') showToast('AI応答の解析に失敗しました');
            options = []; // パース失敗時は空にする
        }

        // ★★★ ボタン生成処理 (シャッフル含む) ★★★
        if (candidatesContainer) {
            candidatesContainer.innerHTML = ''; // コンテナをクリア

            if (options.length > 0) {
                // ★ JavaScript側でシャッフル (Fisher-Yatesアルゴリズム)
                const shuffledOptions = [...options]; // 配列をコピーしてシャッフル
                for (let i = shuffledOptions.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [shuffledOptions[i], shuffledOptions[j]] = [
                        shuffledOptions[j],
                        shuffledOptions[i],
                    ];
                }
                console.log('[onGenerateActionCandidates] Shuffled options:', shuffledOptions);

                // シャッフル後の配列でボタン生成
                shuffledOptions.forEach((optionText) => {
                    const btn = document.createElement('button');
                    btn.textContent = optionText; // JSONから取得したテキストをそのまま設定
                    btn.style.display = 'block';
                    btn.style.textAlign = 'left';
                    btn.style.margin = '0';
                    btn.addEventListener('click', () => {
                        const playerInput = document.getElementById('player-input');
                        if (playerInput) {
                            playerInput.value = btn.textContent;
                        }
                        // ★ オプション: クリックで候補を消す or チェックボックスをオフにする
                        // candidatesContainer.innerHTML = '';
                        // const autoCbx = document.getElementById('auto-generate-candidates-checkbox');
                        // if (autoCbx) autoCbx.checked = false;
                    });
                    candidatesContainer.appendChild(btn);
                });
            } else {
                // 候補が取得できなかった場合
                candidatesContainer.innerHTML = `<span>行動候補の生成に失敗しました</span>`;
                console.warn('[onGenerateActionCandidates] No options generated or extracted.');
            }
        } else {
            console.error('[onGenerateActionCandidates] candidatesContainer not found!');
        }
    } catch (e) {
        // API呼び出し自体のエラーなど
        console.error('候補生成API呼び出しエラー:', e);
        if (candidatesContainer) candidatesContainer.innerHTML = `<span>候補生成エラー</span>`;
        if (typeof showToast === 'function') showToast(`候補生成エラー: ${e.message}`);
    } finally {
        if (typeof showLoadingModal === 'function') showLoadingModal(false);
        console.log('[onGenerateActionCandidates] Function finished.');
    }
}

/**
 * シーンの挿絵を生成 (★ Stability AI 使用)
 * @param {object} sceneObj 対象シーンオブジェクト
 */
async function generateImageForScene(sceneObj) {
    console.log(`[SceneUI] Generating illustration for scene ${sceneObj?.sceneId}...`);
    if (!sceneObj?.sceneId || !sceneObj.content) {
        showToast('挿絵生成対象シーン情報不正');
        return;
    } // import

    const stability = new StabilityApiClient(); // import
    if (!stability.isAvailable) {
        showToast('画像生成APIキー未設定/無効');
        return;
    } // import
    const stabilityApiKey = localStorage.getItem(STABILITY_API_KEY_LS_KEY); // 定数
    if (!stabilityApiKey) {
        showToast('Stability AI APIキー未設定');
        return;
    } // import
    const gemini = new GeminiApiClient(); // 翻訳用
    if (!gemini.isAvailable) {
        showToast('翻訳APIキー未設定/無効');
        return;
    } // import
    if (stability.isStubMode || gemini.isStubMode) {
        /* スタブ処理 */ return;
    }

    showLoadingModal(true);
    try {
        // プロンプト取得 or 生成
        let promptText = '';
        const allEntries = await getSceneEntriesByScenarioId(sceneObj.scenarioId); // import
        const sceneRecord = allEntries.find(
            (e) => e.type === 'scene' && e.sceneId === sceneObj.sceneId
        );
        promptText = sceneRecord?.prompt || '';
        if (!promptText && typeof generateImagePromptFromScene === 'function') {
            // import/このファイル内
            console.log('Generating image prompt...');
            promptText = await generateImagePromptFromScene(sceneObj.content); // ★ Gemini利用
            if (promptText && sceneRecord) {
                sceneRecord.prompt = promptText;
                await updateSceneEntry(sceneRecord);
            } // import
        }
        if (!promptText) throw new Error('画像プロンプト作成失敗');

        // 英語翻訳
        let promptEn = promptText;
        if (containsJapanese(promptText) && typeof generateEnglishTranslation === 'function') {
            // このファイル内
            console.log('Translating prompt...');
            try {
                promptEn = await generateEnglishTranslation(promptText);
            } catch (e) {
                console.error('Trans fail:', e);
                showToast('プロンプト英訳失敗');
                promptEn = promptText + ', illustration';
            } // import
        } else if (!promptEn.toLowerCase().includes('style')) {
            promptEn += ', illustration, beautiful';
        }

        // Stability AI 呼び出し
        const imageOptions = {
            samples: 1,
            width: 1344,
            height: 768,
            style_preset: 'cinematic-photorealistic',
        };
        console.log('Calling stabilityClient.generateImage:', imageOptions);
        const imageResults = await stability.generateImage(promptEn, stabilityApiKey, imageOptions); // ★ API呼び出し
        const base64 = imageResults?.[0]?.imageDataB64;
        if (!base64) throw new Error('API画像データ取得失敗');
        const dataUrl = 'data:image/png;base64,' + base64;

        // DB保存 & メモリ更新
        const newImgRec = {
            scenarioId: sceneObj.scenarioId,
            type: 'image',
            sceneId: sceneObj.sceneId,
            dataUrl: dataUrl,
            prompt: promptText,
        };
        const newId = await addSceneEntry(newImgRec); // import
        console.log(`Generated image saved (Entry ID: ${newId})`);
        sceneObj.images.push({ entryId: newId, dataUrl: dataUrl, prompt: promptText });

        // UI更新
        if (typeof updateSceneHistory === 'function') updateSceneHistory(); // import
        if (typeof showLastScene === 'function') showLastScene(); // import
        showToast('挿絵生成完了'); // import
    } catch (err) {
        console.error(`挿絵生成失敗:`, err);
        showToast(`挿絵生成エラー: ${err.message}`); // import
    } finally {
        showLoadingModal(false);
    }
}

/** カスタムプロンプトで画像を生成 (★ Stability AI 使用) */
async function onCustomImageGenerate(userPromptText) {
    // export 不要
    console.log(`[SceneUI] Generating custom image: "${userPromptText.substring(0, 50)}..."`);
    if (!userPromptText) {
        showToast('プロンプトが空');
        return;
    } // import

    const stability = new StabilityApiClient(); // import
    if (!stability.isAvailable) {
        showToast('画像APIキー未設定/無効');
        return;
    } // import
    const stabilityApiKey = localStorage.getItem(STABILITY_API_KEY_LS_KEY); // 定数
    if (!stabilityApiKey) {
        showToast('Stability AI キー未設定');
        return;
    } // import
    if (stability.isStubMode) {
        /* スタブ */ return;
    }

    const lastScene = window.scenes?.[window.scenes.length - 1]; // global
    if (!lastScene) {
        alert('画像追加先のシーンなし');
        return;
    }

    showLoadingModal(true);
    try {
        // プロンプトは英語前提 (UIで案内 or 翻訳)
        let promptEn = userPromptText;
        if (containsJapanese(promptEn)) {
            // このファイル内
            // ★ 翻訳処理を追加 (Gemini利用)
            console.log('Translating custom prompt...');
            const gemini = new GeminiApiClient(); // import
            if (!gemini.isAvailable) throw new Error('翻訳API利用不可');
            try {
                promptEn = await generateEnglishTranslation(userPromptText);
            } catch (transError) {
                // このファイル内
                console.error('Custom prompt trans fail:', transError);
                throw new Error('カスタムプロンプトの翻訳失敗');
            }
        }

        // Stability AI 呼び出し
        const imageOptions = { samples: 1, width: 1024, height: 1024, style_preset: 'digital-art' }; // 正方形/デジタルアート デフォルト
        console.log('Calling stabilityClient.generateImage (Custom):', imageOptions);
        const imageResults = await stability.generateImage(promptEn, stabilityApiKey, imageOptions); // ★ API呼び出し
        const base64 = imageResults?.[0]?.imageDataB64;
        if (!base64) throw new Error('API画像データ取得失敗');
        const dataUrl = 'data:image/png;base64,' + base64;

        // DB保存 & メモリ更新
        const imgRec = {
            scenarioId: lastScene.scenarioId,
            type: 'image',
            sceneId: lastScene.sceneId,
            dataUrl: dataUrl,
            prompt: userPromptText,
        };
        const newId = await addSceneEntry(imgRec); // import
        console.log(`Custom image saved (Entry ID: ${newId})`);
        lastScene.images.push({ entryId: newId, dataUrl: dataUrl, prompt: userPromptText });

        // UI更新
        if (typeof updateSceneHistory === 'function') updateSceneHistory(); // import
        if (typeof showLastScene === 'function') showLastScene(); // import
        showToast('カスタム画像生成完了'); // import
    } catch (err) {
        console.error('カスタム画像生成失敗:', err);
        showToast(`カスタム画像生成失敗: ${err.message}`); // import
    } finally {
        showLoadingModal(false);
    }
}
/** アイテムチップスを表示 */
export async function renderItemChips() {
    const container = document.getElementById('item-chips-container');
    if (!container) return;
    container.innerHTML = '';

    if (!window.currentScenario) return;
    const scenarioId = window.currentScenarioId;
    if (!scenarioId) return;

    // DB側アイテム
    const ents = await getEntitiesByScenarioId(scenarioId);
    const acquiredItems = ents.filter((e) => e.category === 'item' && e.acquired);

    // wizardDataのパーティアイテム
    const pArr = window.currentScenario?.wizardData?.party || [];
    const partyItems = pArr.filter((c) => c.type === 'アイテム');

    const result = [];
    const addedNames = new Set();

    // 1) パーティアイテム
    for (const it of partyItems) {
        const nm = it.name || '無名アイテム';
        if (addedNames.has(nm)) continue;
        addedNames.add(nm);

        result.push({
            name: nm,
            description: it.caption || '(説明不明)',
            imageData: it.imageData || '',
        });
    }
    // 2) DB取得アイテム
    for (const it of acquiredItems) {
        const nm = it.name || '無名アイテム';
        if (addedNames.has(nm)) continue;
        addedNames.add(nm);

        result.push({
            name: nm,
            description: it.description || '(説明不明)',
            imageData: it.imageData || '',
        });
    }

    if (result.length === 0) {
        container.textContent = '使用可能なアイテムはありません。';
        return;
    }

    let currentSelectedChip = null;
    result.forEach((item) => {
        const chip = document.createElement('div');
        chip.className = 'chip chip-withimage';
        // 画像表示
        if (item.imageData) {
            const im = document.createElement('img');
            im.src = item.imageData;
            im.alt = item.name;
            chip.appendChild(im);
        }
        // 名前
        const lbl = document.createElement('span');
        lbl.textContent = item.name;
        chip.appendChild(lbl);

        // 選択ハイライト
        chip.onclick = () => {
            if (currentSelectedChip && currentSelectedChip !== chip) {
                currentSelectedChip.classList.remove('selected');
            }
            const wasActive = chip.classList.contains('selected');
            if (wasActive) {
                chip.classList.remove('selected');
                window.selectedItem = null;
            } else {
                chip.classList.add('selected');
                window.selectedItem = item;
            }
            currentSelectedChip = wasActive ? null : chip;
        };
        container.appendChild(chip);
    });

    // 「更新」チップを最後に配置 ---
    const updateChip = document.createElement('div');
    updateChip.className = 'chip chip-withimage';
    updateChip.textContent = '更新';
    updateChip.onclick = () => {
        onUpdateEntitiesFromAllScenes();
    };
    container.appendChild(updateChip);
}

/* ===========================================================
   シーン履歴表示、最新シーン表示など UI更新系関数
=========================================================== */
/** 履歴表示を更新 */
window.updateSceneHistory = function () {
    const his = document.getElementById('scene-history');
    if (!his) return;
    his.innerHTML = '';

    // シナリオ/セクション情報
    const wd = window.currentScenario?.wizardData;
    let sections = [];
    if (wd && wd.sections) {
        sections = wd.sections;
    }
    const sorted = [...sections].sort((a, b) => a.number - b.number);
    const firstUncleared = sorted.find((s) => !s.cleared);

    if (!firstUncleared && sorted.length > 0) {
        // 全部クリア済み
        const tile = document.createElement('div');
        tile.className = 'history-tile summary title';
        tile.textContent = 'シナリオ達成!';
        his.appendChild(tile);
    }

    for (const s of sorted) {
        const t = document.createElement('div');
        if (s.number < (firstUncleared?.number || Infinity)) {
            t.className = 'history-tile summary';
            t.textContent = `${decompressCondition(s.conditionZipped)}(クリア済み)`;
        } else if (s.number === firstUncleared?.number) {
            t.className = 'history-tile summary';
            t.textContent = `セクション${s.number} (未クリア)`;
        }
        his.appendChild(t);
    }
    let tile = document.createElement('div');
    tile.className = 'history-tile summary separator';
    his.appendChild(tile);

    // シナリオ概要
    const scenarioSummaryEl = document.createElement('div');
    scenarioSummaryEl.id = 'scenario-summary';
    scenarioSummaryEl.innerHTML = wd?.scenarioSummary || '';
    his.appendChild(scenarioSummaryEl);

    // 全シーンの描画 (最後の1件は下で別表示)
    const lastScene = [...window.scenes].slice(-1)[0] || null;
    const skipId = lastScene ? lastScene.sceneId : null;
    const toShow = window.scenes.filter((sc) => sc.sceneId !== skipId);

    // ★ Gemini API が利用可能かチェック
    const gemini = new GeminiApiClient(); // インスタンス作成
    const isGeminiAvailable = gemini.isAvailable; // isAvailable プロパティ (または同等のメソッド) で判定

    for (const scn of toShow) {
        const tile = document.createElement('div');
        tile.className = 'history-tile';

        // アクション
        if (scn.action?.content) {
            const at = document.createElement('p');
            at.className = 'action-text';
            at.setAttribute('contenteditable', isGeminiAvailable ? 'true' : 'false');
            at.innerHTML = DOMPurify.sanitize(scn.action.content, DOMPURIFY_CONFIG);
            at.addEventListener('blur', async () => {
                await onSceneOrActionContentEdited(scn, at.innerHTML.trim(), true);
            });
            tile.appendChild(at);
        }

        // シーン本文
        const st = document.createElement('p');
        st.className = 'scene-text';
        st.setAttribute('contenteditable', isGeminiAvailable ? 'true' : 'false');
        st.innerHTML = DOMPurify.sanitize(scn.content, DOMPURIFY_CONFIG);
        st.addEventListener('blur', async () => {
            await onSceneOrActionContentEdited(scn, st.innerHTML.trim(), false);
        });
        tile.appendChild(st);

        // 画像一覧
        const scImages = scn.images || [];
        scImages.forEach((imgRec, index) => {
            const img = document.createElement('img');
            img.src = imgRec.dataUrl;
            img.alt = '生成画像';
            img.style.maxHeight = '350px';
            img.style.width = '100%';
            img.style.objectFit = 'contain';

            img.addEventListener('click', () => {
                openImageViewer(scn, index);
            });
            tile.appendChild(img);
        });

        // シーン操作ドロップダウン
        const c = document.createElement('div');
        const dropdown = document.createElement('div');
        dropdown.className = 'scene-dropdown-menu';
        dropdown.style.display = 'none';
        dropdown.innerHTML = `
        <button class="dropdown-item scene-delete">
          <div class="iconmoon icon-bin"></div>シーンを削除
        </button>
        <button class="dropdown-item scene-illustration">
          <div class="iconmoon icon-picture"></div>挿絵を生成
        </button>
      `;
        c.appendChild(dropdown);

        c.className = 'r-flexbox';
        const wandBtn = document.createElement('button');
        wandBtn.className = 'scene-menu-button';
        wandBtn.innerHTML = '<div class="iconmoon icon-dots-three-horizontal"></div>';
        c.appendChild(wandBtn);

        wandBtn.addEventListener('click', () => {
            dropdown.style.display = dropdown.style.display === 'none' ? 'flex' : 'none';
        });

        const delBtn = dropdown.querySelector('.scene-delete');
        if (delBtn) {
            delBtn.addEventListener('click', async () => {
                dropdown.style.display = 'none';
                await deleteScene(scn);
            });
        }
        const illustBtn = dropdown.querySelector('.scene-illustration');
        if (illustBtn) {
            illustBtn.addEventListener('click', async () => {
                dropdown.style.display = 'none';
                await generateImageForScene(scn);
            });
        }

        tile.appendChild(c);
        his.appendChild(tile);
    }
    his.scrollTop = his.scrollHeight;
};

/** ビューワを開く */
function openImageViewer(sceneObj, startIndex) {
    // 1) state にデータ保持
    window.imageViewerState.sceneObj = sceneObj;
    window.imageViewerState.currentIndex = startIndex;
    window.imageViewerState.images = sceneObj.images || [];
    window.imageViewerState.isOpen = true;

    // 2) multiModal.open
    multiModalOpen({
        title: '画像ビューワー',
        contentHtml: `
        <div style="position:relative; background-color:#000; text-align:center; overflow:hidden;">
          <img id="viewer-image-element" class="viewer-image" 
               style="max-width:100%; max-height:80vh; transition:transform 0.2s;"
          />
          <div id="viewer-controls" class="viewer-controls hidden" 
               style="position:absolute; top:0; left:0; right:0; bottom:0; pointer-events:none;">
            <div class="center-buttons" style="pointer-events:auto; display:flex; gap:20px; justify-content:center; margin-top:40px;">
              <button id="viewer-delete-button">削除</button>
              <button id="viewer-download-button">ダウンロード</button>
            </div>
          </div>
        </div>
      `,
        appearanceType: 'center',
        closeOnOutsideClick: false, // 外クリックで閉じるかは好みで
        showCloseButton: false, // 右上×は不要ならfalse
        okLabel: 'OK', // 「OK」ボタンで閉じる
        // 追加ボタンは再度削除/ダウンロードしてもよいが、ここでは viewer-controls 内にあるため省略
        onOpen: () => {
            // モーダルが描画されたので、ここで画像表示/スワイプイベント登録
            initViewerModalContent();
        },
    });
}

function initViewerModalContent() {
    const imgEl = document.getElementById('viewer-image-element');
    const controlsEl = document.getElementById('viewer-controls');
    const delBtn = document.getElementById('viewer-delete-button');
    const dlBtn = document.getElementById('viewer-download-button');

    if (!imgEl || !delBtn || !dlBtn) return;

    // スワイプ等のイベント付与
    addViewerTouchEvents(imgEl);

    // 「削除」ボタン
    delBtn.onclick = () => {
        onClickViewerDelete();
    };

    // 「ダウンロード」ボタン
    dlBtn.onclick = () => {
        onClickViewerDownload();
    };

    // 初期表示
    showImageInViewer();
}

function showImageInViewer() {
    const { images, currentIndex } = window.imageViewerState;
    const viewerImg = document.getElementById('viewer-image-element');
    if (!viewerImg) return;
    if (!images[currentIndex]) return;

    viewerImg.src = images[currentIndex].dataUrl;
    viewerImg.style.transform = 'translateX(0px)';
}

/** スワイプイベント (グローバルリスナー版) */
function addViewerTouchEvents(imgEl) {
    const state = window.imageViewerState; // エイリアス

    // pointermove ハンドラ (グローバル)
    const handlePointerMove = (e) => {
        // isDragging チェックは不要 (リスナーが存在する = ドラッグ中)
        e.preventDefault();
        const dx = e.clientX - state.startX;
        const dy = e.clientY - state.startY;
        state.currentX = e.clientX;
        state.currentY = e.clientY;

        // わずかでも動いたらドラッグ操作意図ありとみなす
        if (!state.didIntentionalDrag && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) {
            state.didIntentionalDrag = true;
        }

        // tapThreshold を超えたら hasMoved フラグを立てる
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (!state.hasMoved && dist > state.tapThreshold) {
            state.hasMoved = true;
        }

        // ドラッグ中は画像位置を更新
        imgEl.style.transform = `translateX(${dx}px)`;
    };

    // pointerup / pointercancel ハンドラ (グローバル)
    const handlePointerEnd = (e) => {
        // isDragging チェックは念のため
        if (!state.isDragging) return;

        // グローバルリスナーを解除
        document.removeEventListener('pointermove', handlePointerMove, { passive: false });
        document.removeEventListener('pointerup', handlePointerEnd);
        document.removeEventListener('pointercancel', handlePointerEnd);

        // ポインタキャプチャを解放
        // try-catch は、万が一要素が存在しない/キャプチャされてない場合のエラーを防ぐため
        try {
            imgEl.releasePointerCapture(e.pointerId);
        } catch (error) {
            // console.warn("Failed to release pointer capture:", error);
        }

        // スワイプ/タップ判定へ
        finishSwipeOrTap(e.type === 'pointercancel');
    };

    // pointerdown ハンドラ (画像要素に設定)
    imgEl.onpointerdown = (e) => {
        // メインボタン(通常マウス左クリック、タッチ)以外は無視
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        // すでにドラッグ中の場合は無視（マルチタッチ対策）
        if (state.isDragging) return;

        e.preventDefault(); // デフォルトのドラッグなどを抑制
        e.stopPropagation(); // 親要素への伝播を抑制

        state.isDragging = true;
        state.hasMoved = false; // リセット
        state.didIntentionalDrag = false; //リセット
        state.startX = e.clientX;
        state.startY = e.clientY;
        state.currentX = e.clientX;
        state.currentY = e.clientY;

        // ポインタをキャプチャ
        try {
            imgEl.setPointerCapture(e.pointerId);
        } catch (error) {
            // console.error("Failed to set pointer capture:", error);
            // キャプチャ失敗時はドラッグ開始しない方が安全かもしれない
            state.isDragging = false;
            return;
        }

        // グローバルリスナーを登録 (passive: false で preventDefault を有効に)
        document.addEventListener('pointermove', handlePointerMove, { passive: false });
        document.addEventListener('pointerup', handlePointerEnd);
        document.addEventListener('pointercancel', handlePointerEnd);

        // ドラッグ開始時はアニメーションを切る
        imgEl.style.transition = 'none';
    };

    // クリックイベントの誤発火防止 (ドラッグ操作直後のクリックを無視)
    let wasDragging = false;
    imgEl.addEventListener(
        'click',
        (e) => {
            if (wasDragging) {
                e.preventDefault();
                e.stopPropagation();
                // console.log("Suppressed click after drag");
            }
        },
        true
    ); // キャプチャフェーズで早めに処理

    // finishSwipeOrTap 内で wasDragging を適切に設定する必要あり (後述)
    window.setWasDragging = (val) => {
        wasDragging = val;
    };
}

/** スワイプorタップ判定 */
function finishSwipeOrTap(isCancel) {
    const imgEl = document.getElementById('viewer-image-element');
    const s = window.imageViewerState;

    // ドラッグ状態を解除 (リスナーは handlePointerEnd で解除済み)
    s.isDragging = false;
    // 直後のクリックイベントを抑制するためのフラグを設定（少し遅延させる）
    const dragOccurred = s.didIntentionalDrag; // わずかでもドラッグしたか
    window.setWasDragging(dragOccurred);
    setTimeout(() => {
        window.setWasDragging(false);
    }, 100); // 100ms後に抑制解除

    if (!imgEl) return;
    if (isCancel) {
        resetImagePosition(imgEl);
        return;
    }

    // タップ判定: 意図的なドラッグ操作がなかった場合
    if (!s.didIntentionalDrag) {
        // console.log("Tap detected");
        toggleViewerControls();
        // タップの場合は位置をリセット（念のため）
        resetImagePosition(imgEl);
        return;
    }

    // --- 以下、スワイプ判定 ---
    const dx = s.currentX - s.startX;
    // スワイプとみなす閾値を調整 (例: 画面幅の 15%)
    const swipeThreshold = window.innerWidth * 0.15; // この値は調整してください

    if (Math.abs(dx) < swipeThreshold) {
        // スワイプ距離が足りない場合は元の位置に戻す
        // console.log("Swipe distance too short, resetting.");
        resetImagePosition(imgEl);
    } else {
        // スワイプ方向に応じて次/前の画像へ
        if (dx < 0) {
            // console.log("Swipe left detected");
            goNextImage();
        } else {
            // console.log("Swipe right detected");
            goPrevImage();
        }
    }
}
/** バウンスバック */
function resetImagePosition(imgEl) {
    imgEl.style.transition = 'transform 0.2s';
    imgEl.style.transform = 'translateX(0px)';
    setTimeout(() => {
        imgEl.style.transition = '';
    }, 200);
}

/** 次へ */
function goNextImage() {
    const s = window.imageViewerState;
    if (s.currentIndex < s.images.length - 1) {
        animateSwipeTransition(-window.innerWidth);
        s.currentIndex++;
    } else {
        bounceBack(-1);
    }
}

/** 前へ */
function goPrevImage() {
    const s = window.imageViewerState;
    if (s.currentIndex > 0) {
        animateSwipeTransition(window.innerWidth);
        s.currentIndex--;
    } else {
        bounceBack(1);
    }
}

/** スワイプアニメ後に差し替え */
function animateSwipeTransition(offset) {
    const imgEl = document.getElementById('viewer-image-element');
    if (!imgEl) return;
    imgEl.style.transition = 'transform 0.2s';
    imgEl.style.transform = `translateX(${offset}px)`;
    setTimeout(() => {
        showImageInViewer();
        imgEl.style.transition = 'none';
    }, 200);
}

/** 端で弾く */
function bounceBack(direction) {
    const imgEl = document.getElementById('viewer-image-element');
    if (!imgEl) return;
    imgEl.style.transition = 'transform 0.2s';
    imgEl.style.transform = `translateX(${direction * 60}px)`;
    setTimeout(() => {
        imgEl.style.transform = 'translateX(0px)';
    }, 200);
    setTimeout(() => {
        imgEl.style.transition = '';
    }, 400);
}

/** タップ時のコントロール表示切替 */
function toggleViewerControls() {
    const controls = document.getElementById('viewer-controls');
    if (!controls) return;
    controls.classList.toggle('hidden');
}
/** 画像削除 (async/await版) */
async function onClickViewerDelete() {
    // async キーワード追加
    const s = window.imageViewerState;
    const { currentIndex, images } = s;
    if (!images[currentIndex]) return;

    // entryId の存在確認
    const entryId = images[currentIndex].entryId;
    if (!entryId) {
        console.error('Cannot delete image: entryId is missing.');
        alert('削除に必要な情報が見つかりません。');
        return;
    }

    if (!confirm('この画像を削除します。よろしいですか？')) return;

    // deleteSceneEntry が利用可能かチェック
    if (typeof deleteSceneEntry !== 'function') {
        console.error('deleteSceneEntry function is not available.');
        alert('データベース削除機能が見つかりません。');
        return;
    }

    showLoadingModal(true); // Loading表示開始

    try {
        await deleteSceneEntry(entryId); // await で待機

        images.splice(currentIndex, 1); // メモリから削除

        if (images.length === 0) {
            // 画像がなくなったらモーダルを閉じる処理（multiModal依存）
            const closeButton = document.querySelector(
                '.multimodal.active .modal-footer button.cancel, .multimodal.active .modal-close-button'
            );
            if (closeButton) closeButton.click();
            else console.warn('Could not find modal close button to click.');
            // UI更新はモーダルが閉じた後でも良いかもしれない
            if (typeof updateSceneHistory === 'function') updateSceneHistory();
            if (typeof showLastScene === 'function') showLastScene();
            showToast('最後の画像が削除されました。'); // Toast表示
            return; // モーダルが閉じるので以降の処理は不要
        }

        // インデックス調整
        if (currentIndex >= images.length) {
            s.currentIndex = images.length - 1;
        }

        // 残りの画像を表示し、UI更新
        showImageInViewer();
        if (typeof updateSceneHistory === 'function') updateSceneHistory();
        if (typeof showLastScene === 'function') showLastScene();
        showToast('画像を削除しました。'); // Toast表示
    } catch (err) {
        console.error('Delete error:', err);
        alert('削除に失敗しました: ' + err.message);
    } finally {
        showLoadingModal(false); // Loading表示終了
    }
}

/** 画像ダウンロード */
function onClickViewerDownload() {
    const s = window.imageViewerState;
    const { images, currentIndex } = s;
    if (!images[currentIndex]) return;

    const link = document.createElement('a');
    link.href = images[currentIndex].dataUrl;
    link.download = 'image.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/** ビューワを閉じる */
function closeImageViewer() {
    window.imageViewerState.isOpen = false;
    const viewerModal = document.getElementById('image-viewer-modal');
    if (viewerModal) {
        viewerModal.classList.remove('active');
    }
}

/** シーン削除 */
async function deleteScene(sceneObj) {
    const allEntries = await getSceneEntriesByScenarioId(sceneObj.scenarioId);
    const scRec = allEntries.find((e) => e.type === 'scene' && e.sceneId === sceneObj.sceneId);
    if (scRec) {
        await deleteSceneEntry(scRec.entryId);
    }
    const imgs = allEntries.filter((e) => e.type === 'image' && e.sceneId === sceneObj.sceneId);
    for (const iRec of imgs) {
        await deleteSceneEntry(iRec.entryId);
    }
    window.scenes = window.scenes.filter((s) => s.sceneId !== sceneObj.sceneId);

    updateSceneHistory();
    showLastScene();
}

/** 最新シーン表示 */
export async function showLastScene() {
    const storyDiv = document.getElementById('story');
    const lastSceneImagesDiv = document.getElementById('last-scene-images');
    const lastSceneAdded = document.getElementById('last-scene-added');

    if (!storyDiv || !lastSceneImagesDiv) return;

    const nextSceneBtn = document.getElementById('next-scene');
    const playerInput = document.getElementById('player-input');
    const playerActionLabel = document.getElementById('player-action');
    // ★ Gemini API が利用可能かチェック
    const gemini = new GeminiApiClient(); // インスタンスを作成
    // ↓↓↓ isAvailable プロパティが存在する場合の例。実際のクラス実装に合わせてください。
    const isGeminiAvailable = gemini.isAvailable;

    const lastScene = [...window.scenes].slice(-1)[0] || null;
    if (lastScene) {
        storyDiv.innerHTML = '';
        lastSceneAdded.innerHTML = '';

        // プレイヤーアクション
        if (lastScene.action?.content) {
            const at = document.createElement('p');
            at.className = 'action-text';
            at.setAttribute('contenteditable', isGeminiAvailable ? 'true' : 'false');
            at.innerHTML = DOMPurify.sanitize(lastScene.action.content, DOMPURIFY_CONFIG);
            at.addEventListener('blur', async () => {
                await onSceneOrActionContentEdited(lastScene, at.innerHTML.trim(), true);
            });
            storyDiv.appendChild(at);
        }

        // シーン本文
        const st = document.createElement('p');
        st.className = 'scene-text';
        st.setAttribute('contenteditable', isGeminiAvailable ? 'true' : 'false');
        st.innerHTML = DOMPurify.sanitize(lastScene.content, DOMPURIFY_CONFIG);
        st.addEventListener('blur', async () => {
            await onSceneOrActionContentEdited(lastScene, st.innerHTML.trim(), false);
        });
        storyDiv.appendChild(st);

        // ドロップダウン
        const dropdown = document.createElement('div');
        dropdown.className = 'scene-dropdown-menu';
        dropdown.style.display = 'none';
        dropdown.innerHTML = `
        <button class="dropdown-item last-scene-delete">
          <div class="iconmoon icon-bin"></div>シーンを削除
        </button>
        <button class="dropdown-item last-scene-illustration">
          <div class="iconmoon icon-picture"></div>挿絵を生成
        </button>
      `;
        lastSceneAdded.appendChild(dropdown);

        const wandBtn = document.createElement('button');
        wandBtn.className = 'scene-menu-button';
        wandBtn.innerHTML = '<div class="iconmoon icon-dots-three-horizontal"></div>';
        lastSceneAdded.appendChild(wandBtn);

        wandBtn.addEventListener('click', () => {
            dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
        });

        const delItem = dropdown.querySelector('.last-scene-delete');
        if (delItem) {
            delItem.addEventListener('click', async () => {
                dropdown.style.display = 'none';
                await deleteScene(lastScene);
            });
        }
        const illustItem = dropdown.querySelector('.last-scene-illustration');
        if (illustItem) {
            illustItem.addEventListener('click', async () => {
                dropdown.style.display = 'none';
                await generateImageForScene(lastScene);
            });
        }

        // 画像一覧
        lastSceneImagesDiv.innerHTML = '';
        lastScene.images.forEach((imgObj, index) => {
            const div = document.createElement('div');
            div.className = 'image-container';

            const imgEl = document.createElement('img');
            imgEl.src = imgObj.dataUrl;
            imgEl.alt = '生成画像';
            imgEl.style.maxHeight = '50vh';
            imgEl.style.objectFit = 'contain';
            imgEl.addEventListener('click', () => {
                openImageViewer(lastScene, index);
            });

            div.appendChild(imgEl);
            lastSceneImagesDiv.appendChild(div);
        });

        if (isGeminiAvailable) {
            nextSceneBtn.style.display = 'inline-block';
            playerInput.style.display = 'inline-block';
            playerActionLabel.textContent = 'プレイヤーの行動を入力してください';
        } else {
            nextSceneBtn.style.display = 'none';
            playerInput.style.display = 'none';
            playerActionLabel.textContent = '';
        }
    } else {
        // シーンが無い場合（導入前）
        storyDiv.innerHTML = '';
        lastSceneImagesDiv.innerHTML = '';
        if (isGeminiAvailabley) {
            nextSceneBtn.style.display = 'inline-block';
            playerInput.style.display = 'none';
            playerActionLabel.textContent = '最初のシーン(導入)を作成します。';
        } else {
            nextSceneBtn.style.display = 'none';
            playerInput.style.display = 'none';
            playerActionLabel.textContent = '';
        }
    }
}

// --- ★ 下記は古いモーダル実装の名残 or 未使用関数 ---
/** カスタム画像生成モーダルを開く (multiModal未使用版) */
export function openImagePromptModal(scenePrompt = '') {
    // この関数は現在の HTML では呼び出されていない可能性が高い
    console.warn('[SceneUI] openImagePromptModal (old version) called.');
    const ip = document.getElementById('image-custom-prompt');
    if (ip) ip.value = scenePrompt;
    const modal = document.getElementById('image-prompt-modal');
    if (modal) modal.classList.add('active');
}
/** カスタム画像生成モーダルを閉じる (古い実装) */
function closeImagePromptModal() {
    const modal = document.getElementById('image-prompt-modal');
    if (modal) modal.classList.remove('active');
}
function containsJapanese(text) {
    if (!text) return false;
    return /[ぁ-んァ-ン一-龯]/.test(text);
}
/* ===========================================================
   シーンテキスト編集、履歴トグル、アイテムchips表示 など
=========================================================== */
/** シーンorアクションのテキストを編集 */
async function onSceneOrActionContentEdited(sceneObj, newText, isActionEdit) {
    const gemini = new GeminiApiClient(); // import
    if (!gemini.isAvailable) return;
    //    if (!window.apiKey) return;
    const oldText = isActionEdit ? sceneObj.action.content : sceneObj.content;
    if (newText.trim() === oldText.trim()) {
        return;
    }
    showLoadingModal(true);
    try {
        // 英訳
        const en = await generateEnglishTranslation(newText);
        if (isActionEdit) {
            sceneObj.action.content = newText;
            sceneObj.action.content_en = en;
        } else {
            sceneObj.content = newText;
            sceneObj.content_en = en;
        }
        // DB更新
        const allEntries = await getSceneEntriesByScenarioId(sceneObj.scenarioId);
        const sceneRec = allEntries.find(
            (e) => e.type === 'scene' && e.sceneId === sceneObj.sceneId
        );
        if (sceneRec) {
            sceneRec.content = sceneObj.content;
            sceneRec.content_en = sceneObj.content_en;
            sceneRec.actionContent = sceneObj.action.content;
            sceneRec.actionContent_en = sceneObj.action.content_en;
            await updateSceneEntry(sceneRec);
        }
    } catch (err) {
        console.error('再翻訳失敗:', err);
    } finally {
        showLoadingModal(false);
    }
}

// --- ファイル読み込み完了ログ ---
console.log('[SceneUI] sceneUI.js loaded.');

// ★ 必要に応じて公開する関数を export
// export { toggleHistory, onGenerateActionCandidates, generateImageForScene, onCustomImageGenerate, ... };
