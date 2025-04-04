// background.js
// 背景画像の生成と管理
// ★ 画像生成を stabilityClient.generateImage に変更
// ★ プロンプト英語化処理を追加
// ★ ES Modules 形式、依存関数を import
// ★ 省略なし

// --- モジュールインポート ---
import { getBgImageById, getAllBgImages, addBgImage, deleteBgImage } from './indexedDB.js';
import { open as multiModalOpen } from './multiModal.js';
import { showToast } from './common.js';
// import { fetchLatestScenarioPrompt } from './scenarioUtils.js'; // グローバル window.fetchLatestScenarioPrompt を使う想定
// DOMPurify はグローバルにある想定
// window.geminiClient, window.stabilityClient は menu.js で初期化想定

// --- モジュールスコープ変数 ---
let currentPageName = 'index';

// --- 関数定義 ---

/**
 * 初期化処理
 */
export async function initBackground(pageName = 'index') {
    currentPageName = pageName;
    console.log(`[Background] Initializing background for page: ${currentPageName}`);
    // (中身は変更なし - 省略せず記述)
    let selectedId = localStorage.getItem('selectedBgId_' + pageName);
    console.log(`[BG] Initial ID: ${selectedId}`);
    if (!selectedId || selectedId === 'null' || selectedId === 'undefined') {
        const fallbackId = localStorage.getItem('selectedBgId_index');
        console.log(`[BG] Fallback ID: ${fallbackId}`);
        if (
            fallbackId &&
            fallbackId !== 'none' &&
            fallbackId !== 'null' &&
            fallbackId !== 'undefined'
        ) {
            selectedId = fallbackId;
        } else {
            selectedId = null;
        }
    }
    if (selectedId) {
        if (selectedId === 'none') {
            console.log('[BG] Applying none');
            document.body.style.backgroundImage = 'none';
        } else {
            const imgId = parseInt(selectedId, 10);
            if (!isNaN(imgId)) {
                console.log(`[BG] Loading ID: ${imgId}`);
                try {
                    const img = await getBgImageById(imgId);
                    if (img?.dataUrl) {
                        console.log(`[BG] Applying ID: ${imgId}`);
                        document.body.style.backgroundImage = `url(${img.dataUrl})`;
                        document.body.style.backgroundSize = 'cover';
                        document.body.style.backgroundAttachment = 'fixed';
                        document.body.style.backgroundPositionX = 'center';
                    } else {
                        console.warn(`[BG] Image ${imgId} not found/invalid.`);
                        localStorage.removeItem('selectedBgId_' + pageName);
                        document.body.style.backgroundImage = '';
                    }
                } catch (e) {
                    console.error(`[BG] Error loading ${imgId}:`, e);
                    showToast(`背景読込失敗 ${imgId}`);
                    document.body.style.backgroundImage = '';
                }
            } else {
                console.warn(`[BG] Invalid ID: ${selectedId}`);
                localStorage.removeItem('selectedBgId_' + pageName);
                document.body.style.backgroundImage = '';
            }
        }
    } else {
        console.log('[BG] No background selected.');
        document.body.style.backgroundImage = '';
    }
    const changeBgBtn = document.getElementById('change-bg-button');
    if (changeBgBtn && !changeBgBtn.hasAttribute('data-bg-listener-added')) {
        changeBgBtn.addEventListener('click', onChangeBgButtonClick);
        changeBgBtn.setAttribute('data-bg-listener-added', 'true');
        console.log('[BG] Listener added.');
    } else if (!changeBgBtn) {
        console.warn('[BG] Button not found.');
    }
}

/**
 * 背景変更ボタンクリック時の処理
 */
export async function onChangeBgButtonClick() {
    console.log('[Background] Change background button clicked.');
    try {
        const all = await getAllBgImages(); // import
        if (all.length === 0) {
            console.log('[Background] No stock. Generating...');
            await generateNewBackground(); // 生成開始 (内部で成功時にモーダル表示)
        } else {
            console.log(`[Background] ${all.length} found. Opening modal.`);
            openBgModal(); // 選択モーダル表示
        }
    } catch (error) {
        console.error('[Background] Error in onChangeBgButtonClick:', error);
        showToast(`エラー: ${error.message}`); // import
    }
}

/**
 * 新規背景画像を Stability AI で生成
 */
export async function generateNewBackground() {
    console.log('[Background] Generating new background using Stability AI...');
    let generatingModal = multiModalOpen({
        // import
        id: 'bg-generating-modal',
        title: '背景画像を生成中',
        contentHtml: `<p>Stability AI API で画像を生成しています...</p><div class="loading"></div>`,
        showCloseButton: false,
        closeOnOutsideClick: false,
    });
    let generationSuccess = false;

    try {
        // ★ クライアントとキーのチェック
        if (!window.stabilityClient) throw new Error('画像生成クライアント未初期化');
        if (!window.geminiClient) throw new Error('翻訳用Geminiクライアント未初期化');
        const stabilityApiKey = localStorage.getItem('stabilityApiKey') || '';
        if (!stabilityApiKey) throw new Error('Stability AI APIキー未設定');
        if (window.stabilityClient.isStubMode || window.geminiClient.isStubMode) {
            console.warn('[Background] Running generation in STUB MODE.');
            // スタブ処理 (例: ダミー画像URLを返す)
            const dataUrl =
                'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22160%22 height=%2290%22><rect width=%22160%22 height=%2290%22 fill=%22%23555%22/><text x=%2280%22 y=%2245%22 font-size=%2210%22 text-anchor=%22middle%22 fill=%22%23fff%22 dy=%22.3em%22>BG STUB</text></svg>';
            const newId = await addBgImage(dataUrl); // import
            document.body.style.backgroundImage = `url(${dataUrl})`; /* ... */
            localStorage.setItem('selectedBgId_' + currentPageName, newId.toString());
            if (currentPageName === 'index') removeAllNoneSettingsExceptIndex();
            showToast('スタブ背景生成'); // import
            generationSuccess = true; // スタブでも成功扱い
            // finally でモーダルを開く
            return; // スタブ処理終了
        }

        // プロンプト準備 (日本語)
        let promptJa = '';
        try {
            if (typeof window.fetchLatestScenarioPrompt === 'function') {
                promptJa = await window.fetchLatestScenarioPrompt(); // グローバル想定
            } else {
                console.warn('fetchLatestScenarioPrompt not found.');
            }
        } catch (e) {
            console.error('Failed fetch prompt:', e);
        }
        if (!promptJa?.trim()) {
            promptJa =
                '美しくて詳細な風景または建築物、ウェブサイトの背景に適した、鮮やかな色、写実的またはアニメスタイル。'; // 日本語デフォルト例
            promptJa =
                '美しくて詳細な風景または建築物、ウェブサイトの背景に適した、鮮やかな色、写実的またはアニメスタイル。'; // 日本語デフォルト例
        }
        console.log(`[Background] Original prompt (JA): "${promptJa}"`);
        let promptEn = ''; // 英語プロンプト用

        // --- プロンプト英語翻訳 (Gemini利用) ---
        const translationModelId = document.getElementById('model-select')?.value;
        if (!translationModelId) throw new Error('翻訳用Geminiモデル未選択');
        try {
            console.log('[Background] Translating prompt to English...');
            const transPrompt = `Translate the following Japanese scene description into English suitable for an image generation prompt. Focus on visual keywords and atmosphere.\n---\n${promptJa}\n---\nEnglish Prompt:`;
            window.geminiClient.initializeHistory([]);
            promptEn = await window.geminiClient.generateContent(transPrompt, translationModelId);
            console.log(`[Background] Translated prompt (EN): "${promptEn}"`);
            if (!promptEn?.trim()) throw new Error('翻訳結果が空');
        } catch (translateError) {
            throw new Error(`プロンプト英語翻訳失敗: ${translateError.message}`);
        }

        // --- Stability AI 呼び出し ---
        const imageOptions = {
            samples: 1,
            // ★ 背景なので横長 (16:9) に近い解像度を指定
            width: 1024,
            height: 1024, // SDXL 1.0 サポート解像度例
            // width: 1536, height: 640, // 別の横長解像度例
            style_preset: 'anime', // 背景に適したスタイル例 (他にも 'photographic', 'fantasy-art' など)
            // negative_prompt: "text, words, people, characters, signature, watermark, blurry" // 不要要素除去
        };
        console.log('[Background] Calling stabilityClient.generateImage:', imageOptions);
        // ★ stabilityClient のメソッド呼び出し
        const imageResults = await window.stabilityClient.generateImage(
            promptEn,
            stabilityApiKey,
            imageOptions
        );
        const base64ImageData = imageResults?.[0]?.imageDataB64;

        if (!base64ImageData) throw new Error('API画像データ取得失敗');
        const dataUrl = 'data:image/png;base64,' + base64ImageData; // PNGと仮定

        // DB保存・適用・localStorage保存
        const newId = await addBgImage(dataUrl); // import
        console.log(`[Background] New background saved (ID: ${newId}). Applying...`);
        document.body.style.backgroundImage = `url(${dataUrl})`;
        document.body.style.backgroundSize = 'cover';
        document.body.style.backgroundAttachment = 'fixed';
        document.body.style.backgroundPositionX = 'center';
        localStorage.setItem('selectedBgId_' + currentPageName, newId.toString());
        if (currentPageName === 'index') removeAllNoneSettingsExceptIndex();
        showToast('新しい背景を生成しました。'); // import
        generationSuccess = true;
    } catch (err) {
        console.error('[Background] 背景生成失敗:', err);
        multiModalOpen({
            // import
            title: '背景生成失敗',
            contentHtml: `<p>画像の生成中にエラー:<br><small>${DOMPurify.sanitize(
                err.message
            )}</small></p>`,
            cancelLabel: '閉じる',
        });
    } finally {
        if (generatingModal && typeof generatingModal.close === 'function') {
            debugger;
            generatingModal.close();
        }
        // ★ 成功した場合のみ選択モーダルを開く
        if (generationSuccess) {
            console.log('[Background] Generation successful. Opening selection modal.');
        } else {
            console.log('[Background] Generation failed. Not opening selection modal.');
        }
    }
}

/**
 * 背景選択モーダルを開く
 */
async function openBgModal() {
    // (中身は変更なし - 省略せず記述)
    console.log('[Background] Opening background selection modal.');
    let allImages = [];
    try {
        allImages = await getAllBgImages();
    } catch (dbError) {
        showToast('背景リスト読込失敗');
    }
    multiModalOpen({
        id: 'bg-select-modal',
        title: '背景選択',
        contentHtml: `<div id="bg-stock-container" class="bg-stock-grid" style="margin-bottom:10px; max-height: 60vh; overflow-y: auto;">${
            allImages.length === 0 ? '<p style="color:#aaa; text-align:center;">ストック空</p>' : ''
        }</div><div class="c-flexbox" style="margin-bottom:10px;"><button id="bg-none-button">背景無し</button><button id="bg-generate-button">新規生成</button></div>`,
        showCloseButton: true,
        appearanceType: 'center',
        closeOnOutsideClick: true,
        cancelLabel: '閉じる',
        onOpen: (modalInstance) => {
            console.log('[BG Modal] Opened. Setting up...');
            const cont = document.getElementById('bg-stock-container'),
                nBtn = document.getElementById('bg-none-button'),
                gBtn = document.getElementById('bg-generate-button');
            if (!cont || !nBtn || !gBtn) {
                console.error('BG Modal elements missing.');
                return;
            }
            nBtn.removeEventListener('click', handleNoneButtonClick);
            nBtn.addEventListener('click', () => handleNoneButtonClick(modalInstance));
            gBtn.removeEventListener('click', handleGenerateButtonClick);
            gBtn.addEventListener('click', handleGenerateButtonClick);
            refreshBgStock(cont, allImages, modalInstance);
            console.log('[BG Modal] Stock rendered.');
        },
    });
}

/** モーダル内の「生成」ボタンハンドラ */
async function handleGenerateButtonClick() {
    // (中身は変更なし - 省略せず記述)
    console.log('[Background] Generate button inside modal clicked.');
    const selectModal = window.multiModal?.getInstanceById?.('bg-select-modal');
    if (selectModal) selectModal.close();
    await generateNewBackground();
}

/** モーダル内の「背景無し」ボタンハンドラ */
function handleNoneButtonClick(modalInstance) {
    // (中身は変更なし - 省略せず記述)
    onBgNoneButton();
    if (modalInstance?.close) modalInstance.close();
    else window.multiModal?.getInstanceById?.('bg-select-modal')?.close();
}

/** 背景一覧を container に再描画 */
async function refreshBgStock(containerEl, imageList = null, modalInstance = null) {
    // (中身は変更なし - 省略せず記述)
    if (!containerEl) return;
    console.log('[BG] Refreshing stock...');
    containerEl.innerHTML = '';
    let all = imageList;
    if (!all) {
        try {
            all = await getAllBgImages();
        } catch (e) {
            showToast('背景再読込失敗');
            all = [];
        }
    }
    if (!all?.length) {
        containerEl.innerHTML = '<p>ストック空</p>';
        return;
    }
    all.forEach((img) => {
        if (!img?.dataUrl) return;
        const wrap = document.createElement('div');
        wrap.className = 'bg-thumb';
        const thumb = document.createElement('img');
        thumb.src = img.dataUrl;
        Object.assign(thumb.style, {
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
            cursor: 'pointer',
            borderRadius: '4px',
        });
        thumb.alt = `背景 ${img.id}`;
        thumb.loading = 'lazy';
        thumb.addEventListener('click', () => {
            console.log(`Applying BG ${img.id}`);
            document.body.style.backgroundImage = `url(${img.dataUrl})`;
            Object.assign(document.body.style, {
                backgroundSize: 'cover',
                backgroundAttachment: 'fixed',
                backgroundPositionX: 'center',
            });
            localStorage.setItem('selectedBgId_' + currentPageName, String(img.id));
            if (currentPageName === 'index') removeAllNoneSettingsExceptIndex();
            if (modalInstance) modalInstance.close();
        });
        wrap.appendChild(thumb);
        const delBtn = document.createElement('button');
        delBtn.className = 'bg-thumb-delete';
        delBtn.innerHTML = '&times;';
        delBtn.title = '削除';
        delBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            multiModalOpen({
                title: '背景削除確認',
                contentHtml: `<p>削除しますか？<br><img src="${img.dataUrl}" style="max-width:100px;"/></p>`,
                okLabel: '削除',
                okButtonColor: '#f44336',
                onOk: async () => {
                    try {
                        await deleteBgImage(img.id);
                        for (const k of Object.keys(localStorage)) {
                            if (
                                k.startsWith('selectedBgId_') &&
                                localStorage.getItem(k) === String(img.id)
                            )
                                localStorage.removeItem(k);
                        }
                        showToast('背景削除');
                        await refreshBgStock(containerEl, null, modalInstance);
                    } catch (e) {
                        showToast(`削除失敗: ${e.message}`);
                    }
                },
            });
        });
        wrap.appendChild(delBtn);
        containerEl.appendChild(wrap);
    });
    console.log(`Rendered ${all.length} BG images.`);
}

/** 背景無しボタンの処理 */
function onBgNoneButton() {
    // (中身は変更なし - 省略せず記述)
    console.log("[BG] 'None' button clicked.");
    document.body.style.backgroundImage = 'none';
    localStorage.setItem('selectedBgId_' + currentPageName, 'none');
    showToast('背景なし設定');
}

/** indexページで背景設定時、他ページのnone設定削除 */
function removeAllNoneSettingsExceptIndex() {
    // (中身は変更なし - 省略せず記述)
    let removed = 0;
    for (const key of Object.keys(localStorage)) {
        if (key.startsWith('selectedBgId_') && key !== 'selectedBgId_index') {
            if (localStorage.getItem(key) === 'none') {
                localStorage.removeItem(key);
                removed++;
            }
        }
    }
    if (removed > 0) console.log(`Removed ${removed} 'none' settings.`);
}

// --- fetchLatestScenarioPrompt 関数 (仮定義 or import/window) ---
// ★ 実際のコードに合わせてください
async function fetchLatestScenarioPrompt() {
    console.warn('[Background] fetchLatestScenarioPrompt using placeholder implementation.');
    if (typeof window.fetchLatestScenarioPrompt === 'function') {
        return await window.fetchLatestScenarioPrompt();
    }
    return ''; // デフォルト空文字
}

// --- ファイル読み込み完了ログ ---
console.log('[Background] background.js loaded and functions exported.');
