/********************************
 * sceneManager.js
 * シーン関連の主要ロジック (API呼び出し含む)
 * ★ API 呼び出しを Gemini API (geminiClient) に変更
 * ★ ES Modules 形式、依存関係を import
 * ★ 省略なし
 ********************************/

// --- モジュールインポート ---
import { GeminiApiClient } from './geminiApiClient.js'; // ★ Gemini クラス
import {
    getScenarioById,
    updateScenario,
    addSceneEntry,
    updateSceneEntry,
    getSceneEntriesByScenarioId,
    deleteSceneEntry,
    addSceneSummaryRecord,
    getSceneSummaryByChunkIndex, // ★ 要約関連も import
    saveCharacterDataToIndexedDB,
    loadCharacterDataFromIndexedDB, // ゲットカード用
    getEntitiesByScenarioId, // ★ 必要なら追加
} from './indexedDB.js';

import { showToast } from './common.js';
// ★ sceneUI.js から UI 更新関数を import する想定 (またはグローバル window.* 参照)
import {
    showLoadingModal,
    showLastScene,
    renderItemChips,
    onGenerateActionCandidates,
    openImagePromptModal, // ★ 仮: sceneUI.js で export されている想定
    // 他に必要な UI 関数があれば追加
} from './sceneUI.js'; // ★ パス確認

// pako, DOMPurify はグローバル想定

// --- localStorage キー ---
const PREFERRED_GEMINI_MODEL_LS_KEY = 'preferredGeminiModel';

// --- シナリオ読み込み ---

/**
 * 指定されたシナリオIDのデータをDBから読み込み、メモリ (window変数) に展開し、UIを初期化する
 * @param {number} scenarioId
 */
// ★ export する (sceneMain.js や universalSaveLoad.js から呼ばれるため)
export async function loadScenarioData(scenarioId) {
    console.log(`[SceneManager] Loading scenario data for ID: ${scenarioId}...`);
    try {
        const sc = await getScenarioById(scenarioId); // import
        if (!sc) {
            throw new Error(`シナリオID ${scenarioId} が見つかりません。`);
        }

        // グローバル変数に格納 (sceneGlobals.js で定義されている想定)
        window.currentScenario = sc;
        window.currentScenarioId = scenarioId;

        const wd = sc.wizardData || {};
        // ★ window.scenarioType などは廃止したので、wizardData から直接参照する
        // window.scenarioType = wd.scenarioType;
        // window.clearCondition = wd.clearCondition || "";
        // window.sections = wd.sections || [];

        // シーン一覧をDBから取得してメモリに整形
        await loadAllScenesForScenario(scenarioId); // このファイル内で定義

        // 要約を読み込む
        window.sceneSummaries = []; // 初期化
        for (let i = 0; i < 100; i++) {
            // 最大100チャンクと仮定
            const sumRec = await getSceneSummaryByChunkIndex(i); // import
            if (!sumRec) break; // 見つからなくなったら終了
            window.sceneSummaries[i] = { en: sumRec.content_en, ja: sumRec.content_ja };
        }

        // 履歴エリアの初期表示状態をDBの値に合わせて設定
        const hist = document.getElementById('scene-history');
        const historyBtn = document.getElementById('toggle-history-button'); // ボタン要素も取得
        if (hist && window.currentScenario) {
            // DBから読み込んだ showHistory の値 (未定義なら false 扱い) を反映
            const show = window.currentScenario.showHistory || false;
            hist.style.display = show ? 'flex' : 'none'; // toggleHistory内の設定に合わせる ('flex' or 'block')
            console.log(`[SceneManager] Initial history display set to: ${hist.style.display}`);

            // 履歴ボタンの見た目も初期状態に合わせる (任意)
            if (historyBtn) {
                historyBtn.style.backgroundColor = show ? '#777' : ''; // toggleHistory内のスタイルに合わせる
            }
        } else if (!hist) {
            console.warn('[SceneManager] #scene-history element not found for initial setup.');
        }

        console.log(`[SceneManager] Loaded ${window.sceneSummaries.length} summary chunks.`);

        // UI再描画 (sceneUI.js の関数を import して使用)
        if (typeof updateSceneHistory === 'function') updateSceneHistory();
        else console.warn('updateSceneHistory not imported/found.');
        if (typeof showLastScene === 'function') showLastScene();
        else console.warn('showLastScene not imported/found.');
        if (typeof refreshEndingButtons === 'function') refreshEndingButtons();
        else console.warn('refreshEndingButtons not imported/found.'); // import (sceneExtras?)
        if (typeof renderItemChips === 'function') await renderItemChips();
        else console.warn('renderItemChips not imported/found.'); // import (sceneUI?)

        // ネタバレボタンの表示制御 (wizardData を直接参照)
        const spoilerButton = document.getElementById('spoiler-button');
        if (spoilerButton) spoilerButton.style.display = wd.scenarioType === 'objective' ? 'inline-block' : 'none';

        console.log(`[SceneManager] Scenario ${scenarioId} loaded successfully.`);
    } catch (err) {
        console.error('[SceneManager] シナリオ読み込み失敗:', err);
        alert('シナリオの読み込みに失敗しました:\n' + err.message);
        // エラーが発生したらメニューに戻るなどの処理
        // window.location.href = "index.html";
    }
}

/**
 * DB の sceneEntries からデータを取得し、window.scenes に整形格納
 * @param {number} scenarioId
 */
async function loadAllScenesForScenario(scenarioId) {
    console.log(`[SceneManager] Loading all scene entries for scenario ${scenarioId}...`);
    window.scenes = []; // 初期化
    const allEntries = await getSceneEntriesByScenarioId(scenarioId); // import

    const sceneRecords = allEntries.filter((e) => e.type === 'scene');
    const imageRecords = allEntries.filter((e) => e.type === 'image');
    sceneRecords.sort((a, b) => (a.entryId || 0) - (b.entryId || 0)); // entryId でソート
    imageRecords.sort((a, b) => (a.entryId || 0) - (b.entryId || 0));

    for (const sRec of sceneRecords) {
        const sceneImages = imageRecords
            .filter((imgRec) => imgRec.sceneId === sRec.sceneId)
            .map((img) => ({
                entryId: img.entryId,
                dataUrl: img.dataUrl,
                prompt: img.prompt || '',
            }));

        window.scenes.push({
            sceneId: sRec.sceneId,
            scenarioId: sRec.scenarioId,
            content: sRec.content || '',
            content_en: sRec.content_en || '',
            action: { content: sRec.actionContent || '', content_en: sRec.actionContent_en || '' },
            images: sceneImages, // 紐づく画像を設定
        });
    }
    console.log(`[SceneManager] Formatted ${window.scenes.length} scenes with images.`);
}

// --- 次のシーン取得 (★ Gemini API 使用) ---

/**
 * 次のシーンを生成して表示・保存する
 * @param {boolean} [useItem=false] アイテム使用フラグ
 */
// ★ export する (sceneMain.js や sceneUI.js から呼ばれるため)
export async function getNextScene(useItem = false) {
    console.log(`[SceneManager] getNextScene called (useItem: ${useItem})`);
    // ★ Gemini クライアントを new して使用
    const gemini = new GeminiApiClient(); // import
    if (!gemini.isAvailable) {
        showToast('Gemini APIキー未設定/無効');
        return;
    } // import
    if (gemini.isStubMode) {
        /* ... スタブ処理 ... */ return;
    }

    const modelId = localStorage.getItem(PREFERRED_GEMINI_MODEL_LS_KEY) || 'gemini-1.5-flash-latest';
    let playerInputJa = ''; // 日本語のプレイヤー入力

    if (!useItem) {
        playerInputJa = document.getElementById('player-input')?.value?.trim() || '';
        if (!playerInputJa) {
            alert('プレイヤー行動を入力してください');
            return;
        }
    } else if (window.selectedItem) {
        // グローバル参照
        const item = window.selectedItem;
        playerInputJa = `[アイテム使用] ${item.name || '?'}: ${item.description || '?'}`;
        window.selectedItem = null; // 使用したら解除
        // アイテムチップの選択状態も解除 (sceneUI.js の責務かも)
        document.querySelectorAll('#item-chips-container .chip.selected').forEach((c) => c.classList.remove('selected'));
    } else {
        alert('使用するアイテムが選択されていません。');
        return;
    }

    // ★ キャンセル処理は削除 (AbortController使わない)
    // window.cancelRequested = false;
    showLoadingModal(true); // import/このファイル内?
    try {
        // 1) プレイヤー行動の英語翻訳 (翻訳ヘルパー使用)
        let playerInputEn = '';
        if (playerInputJa) {
            console.log('[SceneManager] Translating player action to English...');
            try {
                playerInputEn = await generateEnglishTranslation(playerInputJa); // このファイル内 (Gemini使用)
                console.log(`[SceneManager] Translated action (EN): ${playerInputEn}`);
            } catch (transError) {
                console.error('Action translation failed:', transError);
                showToast('行動の英訳に失敗しました。日本語のまま処理します。'); // import
                playerInputEn = playerInputJa; // 失敗時は日本語のまま
            }
        }

        // 2) システムプロンプト + 会話履歴の準備
        const wd = window.currentScenario?.wizardData || {}; // global
        const sections = wd.sections || [];
        let systemText = `あなたは経験豊富なTRPGゲームマスター(GM)です。以下のルールに従い、プレイヤーの行動に対する次のシーンを生成してください。
ルール:
- 背景黒が前提の、読みやすい文字のHTML的な装飾をする。style直書きで良い。
- 出力は必ず日本語。
- シナリオ設定と過去の展開との整合性を保つ。
- プレイヤーの行動の結果を具体的に描写する。
- 新たな状況や登場人物、選択肢を提示し、物語を進展させる。
- 時々パーティメンバーの短い会話や反応を含める。
- メタ的な発言(GMとしての説明など)はしない。
- 最後の文節はプレイヤーに次の行動を促す問いかけで終わることが望ましいが、選択肢は不要。
- 必要に応じて【セクション目標】の達成に繋がるヒントを自然に含める。
======
`;
        if (sections.length > 0) {
            systemText += '【現在のセクション目標】\n';
            sections.forEach((s) => {
                const status = s.cleared ? '(達成済)' : '(未達成)';
                const condition = decompressCondition(s.conditionZipped || '') || '?'; // import/このファイル内?
                systemText += `- セクション${s.number}${status}: ${condition}\n`;
            });
            systemText += '======\n';
        }
        // ★ Gemini は messages 形式より、履歴を単純結合した方が良い場合もある
        //    ここでは履歴を getHistory で取得し、プロンプトに組み込む
        const historyForPrompt = gemini.getHistory(); // 現在のクライアント内部履歴を取得
        // 必要なら過去の履歴を要約に置き換えるなどの処理
        // const messages = [{role: "system", content: systemText}, ...]; // 旧OpenAI形式

        // ★ 過去のやり取りをプロンプトに含める形式 (Gemini推奨の一つ)
        let promptForGemini = systemText + '\n--- シナリオ情報 ---\n';
        if (window.currentScenario) {
            const summ = wd.scenarioSummaryEn?.trim() ? wd.scenarioSummaryEn : wd.scenarioSummary || '';
            promptForGemini += `概要(Summary): ${summ}\n`;
            if (wd.party?.length > 0) {
                // パーティ情報は英語の方が良いかもしれない
                const partyTxtEn = await buildPartyInsertionTextEn(wd.party); // このファイル内
                promptForGemini += partyTxtEn + '\n';
            }
        }
        promptForGemini += '--- これまでの展開 ---\n';
        // 履歴を追加 (要約考慮は別途必要)
        window.scenes.forEach((scn) => {
            // global scenes を参照
            if (scn.action?.content) promptForGemini += `プレイヤー: ${scn.action.content}\n`;
            promptForGemini += `GM: ${scn.content}\n`;
        });
        promptForGemini += '--- 今回の行動 ---\n';
        promptForGemini += `プレイヤー: ${playerInputJa}\n`; // 今回の行動は日本語
        promptForGemini += '--- 次のシーン ---\nGM:'; // GMの応答を促す

        // 3) Gemini API 呼び出し
        gemini.initializeHistory([]); // 履歴はプロンプトに含めたのでリセット
        console.log('[SceneManager] Calling Gemini for next scene...');
        const rawSceneJa = await gemini.generateContent(promptForGemini, modelId); // ★ インスタンスメソッド呼び出し
        if (!rawSceneJa?.trim()) throw new Error('APIから空の応答がありました。');

        // 4) 応答 (日本語シーン) の英語翻訳
        console.log('[SceneManager] Translating generated scene to English...');
        const sceneEn = await generateEnglishTranslation(rawSceneJa); // このファイル内 (Gemini使用)

        // 5) 新しいシーンデータをメモリとDBに保存
        const sceneId = `scene_${Date.now()}_${Math.random().toString(16).substring(2, 8)}`;
        const newSceneEntry = {
            scenarioId: window.currentScenarioId,
            type: 'scene',
            sceneId: sceneId,
            content: rawSceneJa,
            content_en: sceneEn,
            actionContent: playerInputJa,
            actionContent_en: playerInputEn,
            prompt: '', // 画像プロンプトは後で生成
        };
        const newEntryId = await addSceneEntry(newSceneEntry); // import
        newSceneEntry.entryId = newEntryId; // IDを付与
        console.log(`[SceneManager] New scene entry saved to DB (ID: ${newEntryId})`);

        const newSceneObj = {
            sceneId: sceneId,
            scenarioId: window.currentScenarioId,
            content: rawSceneJa,
            content_en: sceneEn,
            action: { content: playerInputJa, content_en: playerInputEn },
            images: [], // 画像はまだない
        };
        window.scenes.push(newSceneObj); // メモリに追加 (global)

        // 6) 画像プロンプト生成 (非同期で実行、完了を待たない)
        if (typeof generateImagePromptFromScene === 'function') {
            // import
            generateImagePromptFromScene(rawSceneJa)
                .then(async (imgPrompt) => {
                    // ★ 非同期処理
                    if (imgPrompt && newSceneEntry.entryId) {
                        newSceneEntry.prompt = imgPrompt;
                        await updateSceneEntry(newSceneEntry); // import
                        console.log(`[SceneManager] Image prompt generated and saved for scene ${sceneId}`);
                    }
                })
                .catch((e) => console.error('Error generating/saving image prompt:', e));
        } else {
            console.warn('generateImagePromptFromScene function not found.');
        }

        // 7) シナリオ更新日時を更新
        if (window.currentScenario && typeof updateScenario === 'function') {
            // import
            await updateScenario(window.currentScenario); // updatedAt は自動更新されるはず
            console.log('[SceneManager] Scenario updatedAt timestamp updated.');
        } else {
            console.error('Cannot update scenario timestamp.');
        }

        // 8) セクション達成チェック (非同期で実行、完了を待たない)
        if (typeof checkSectionClear === 'function') {
            // ★ checkSectionClearViaChatGPT から改名想定
            checkSectionClear(playerInputJa, rawSceneJa)
                .then(() => {
                    // ★ 非同期処理
                    if (typeof refreshEndingButtons === 'function') refreshEndingButtons(); // import
                })
                .catch((e) => console.error('Error during section clear check:', e));
        } else {
            console.warn('checkSectionClear function not found.');
        }

        // 9) シーン要約処理 (非同期で実行、完了を待たない)
        if (typeof handleSceneSummaries === 'function') {
            // このファイル内? import?
            handleSceneSummaries().catch((e) => console.error('Error handling summaries:', e)); // ★ 非同期処理
        } else {
            console.warn('handleSceneSummaries function not found.');
        }

        // 10) UI更新
        const playerInputEl = document.getElementById('player-input');
        if (!useItem && playerInputEl) playerInputEl.value = ''; // 入力欄クリア
        if (typeof updateSceneHistory === 'function') updateSceneHistory(); // import
        if (typeof showLastScene === 'function') showLastScene(); // import
        if (typeof renderItemChips === 'function') await renderItemChips(); // アイテムリスト更新 (import)

        // 11) 回答候補コンテナクリア＆自動生成
        const candidatesContainer = document.getElementById('action-candidates-container');
        if (candidatesContainer) candidatesContainer.innerHTML = '';
        const autoGenCbx = document.getElementById('auto-generate-candidates-checkbox');
        if (autoGenCbx?.checked && typeof onGenerateActionCandidates === 'function') {
            onGenerateActionCandidates();
        }
    } catch (e) {
        console.error('[SceneManager] シーン取得失敗:', e);
        showToast(`シーン取得失敗: ${e.message}`); // import
        // 必要ならエラー時の処理（例：プレイヤー入力欄を元に戻すなど）
    } finally {
        showLoadingModal(false); // このファイル内? import?
    }
}

// --- 翻訳系 (★ Gemini API 使用) ---

/** 英語パーティ情報文章化 (Gemini 翻訳) */
async function buildPartyInsertionTextEn(party) {
    if (!party?.length) return 'Party: None';
    let txtEn = 'Party Members:\n';
    const modelId = localStorage.getItem(PREFERRED_GEMINI_MODEL_LS_KEY) || 'gemini-1.5-flash-latest';
    const gemini = new GeminiApiClient();
    if (!gemini.isAvailable) return '(Translation API Error)';
    try {
        for (const p of party) {
            let nameEn = p.name || 'Unknown',
                typeEn = p.type || 'Unknown',
                detailJa = p.special || p.caption || '(No details)',
                detailEn = detailJa;
            if (containsJapanese(detailJa)) {
                try {
                    const prompt = `Translate Japanese details to English:\nJA: ${detailJa}\nEN:`;
                    gemini.initializeHistory([]);
                    detailEn = await gemini.generateContent(prompt, modelId);
                } catch (e) {
                    console.error('Party detail trans failed:', e);
                    detailEn = detailJa + ' (trans-fail)';
                }
            }
            txtEn += `- Name: ${nameEn} (${typeEn})`;
            if (p.role === 'avatar') txtEn += ' [Avatar]';
            if (p.role === 'partner') txtEn += ' [Partner]';
            txtEn += `\n  Details: ${detailEn}\n`;
        }
    } catch (e) {
        console.error('Party EN text gen error:', e);
        txtEn += '(Error translating)';
    }
    return txtEn;
}

/** 英語翻訳 */
// ★ export する (sceneUI.js などから呼ばれるため)
export async function generateEnglishTranslation(japaneseText) {
    if (!japaneseText?.trim()) return '';
    console.log('[SceneManager] Translating to English...');
    const gemini = new GeminiApiClient(); // import
    if (!gemini.isAvailable) throw new Error('翻訳用APIキー未設定/無効');
    if (gemini.isStubMode) return '(Stub EN)';
    const modelId = localStorage.getItem(PREFERRED_GEMINI_MODEL_LS_KEY) || 'gemini-1.5-flash-latest';
    const prompt = `Translate Japanese to English. Output only the translation.\nJA:\n${japaneseText}\nEN:`;
    try {
        gemini.initializeHistory([]);
        return (await gemini.generateContent(prompt, modelId)).trim();
    } catch (e) {
        console.error('EN Trans fail:', e);
        throw e;
    }
}

/** 日本語翻訳 */
// ★ export する (もし他から使うなら)
export async function generateJapaneseTranslation(englishText) {
    if (!englishText?.trim()) return '';
    console.log('[SceneManager] Translating to Japanese...');
    const gemini = new GeminiApiClient(); // import
    if (!gemini.isAvailable) throw new Error('翻訳用APIキー未設定/無効');
    if (gemini.isStubMode) return '(Stub JA)';
    const modelId = localStorage.getItem(PREFERRED_GEMINI_MODEL_LS_KEY) || 'gemini-1.5-flash-latest';
    const prompt = `Translate English to Japanese. Output only the translation.\nEN:\n${englishText}\nJA:`;
    try {
        gemini.initializeHistory([]);
        return (await gemini.generateContent(prompt, modelId)).trim();
    } catch (e) {
        console.error('JA Trans fail:', e);
        throw e;
    }
}

// --- セクション達成チェック (★ Gemini API 使用) ---

/** セクションクリア判定 */
// ★ export する (もし他から使うなら)
// async function checkSectionClearViaChatGPT(latestAction, latestScene) { // 旧名
export async function checkSectionClear(latestActionJa, latestSceneJa) {
    console.log('[SceneManager] Checking section clear status...');
    const wd = window.currentScenario?.wizardData; // global
    if (!wd?.sections) return;
    const sorted = [...wd.sections].sort((a, b) => (a.number || 0) - (b.number || 0));
    const firstUncleared = sorted.find((s) => !s.cleared);
    if (!firstUncleared) return; // 全クリア済み

    const gemini = new GeminiApiClient(); // import
    if (!gemini.isAvailable) {
        console.warn('Cannot check section clear: Gemini API key missing/invalid.');
        return;
    }
    if (gemini.isStubMode) {
        console.warn('STUB MODE: Skipping section clear check.');
        return;
    }

    const modelId = localStorage.getItem(PREFERRED_GEMINI_MODEL_LS_KEY) || 'gemini-1.5-flash-latest';
    const conditionTextJa = decompressCondition(firstUncleared.conditionZipped || '') || '?'; // import/このファイル内?
    const scenarioSummary = wd.scenarioSummary || '(概要なし)';

    // ★ Gemini に YES/NO で答えさせるプロンプト
    const prompt = `あなたはTRPGの審判AIです。以下の情報に基づき、提示された「達成条件」がプレイヤーの行動や状況によって満たされたかどうかを判断し、**YESかNOのみ**で答えてください。\n\nシナリオ概要:\n${scenarioSummary}\n\n達成条件(セクション${firstUncleared.number}):\n「${conditionTextJa}」\n\n最新のプレイヤー行動:\n${latestActionJa || '(行動なし)'}\n\n最新のシーン状況:\n${latestSceneJa || '(シーンなし)'}\n\n質問: この達成条件は満たされましたか？ (YES/NO)`;

    try {
        gemini.initializeHistory([]);
        console.log('[SceneManager] Calling Gemini for section clear check...');
        const answer = (await gemini.generateContent(prompt, modelId)).trim().toUpperCase();
        console.log(`[SceneManager] Section clear check result: ${answer}`);

        if (answer.startsWith('YES')) {
            console.log(`[SceneManager] Section ${firstUncleared.number} cleared!`);
            firstUncleared.cleared = true;
            // ★ currentScenario はグローバルなので直接更新して良いか？ 不変性を保つ方が安全
            // window.currentScenario.wizardData.sections = wd.sections; // 直接変更は避ける
            // 代わりに wizardData 全体を更新
            const updatedWizardData = { ...wd, sections: sorted }; // ソート済みを反映
            const scenarioToUpdate = { ...window.currentScenario, wizardData: updatedWizardData };
            window.currentScenario = scenarioToUpdate; // メモリ更新

            await updateScenario(scenarioToUpdate); // import (DB更新)
            showToast(`セクション${firstUncleared.number} クリア！`); // import

            if (typeof refreshEndingButtons === 'function') refreshEndingButtons(); // エンディングボタン更新 (import)
        } else {
            console.log(`[SceneManager] Section ${firstUncleared.number} not cleared yet.`);
        }
    } catch (err) {
        console.error('[SceneManager] セクション判定API失敗:', err);
        showToast(`目標達成判定エラー: ${err.message}`); // import
    }
}

// --- 要約作成 (★ Gemini API 使用) ---

/** シーン要約処理 */
// ★ export する (もし他から使うなら)
export async function handleSceneSummaries() {
    console.log('[SceneManager] Handling scene summaries...');
    // ★ window.scenes を参照 (global)
    const actionCount = window.scenes.filter((s) => s.action?.content?.trim()).length;
    if (actionCount < 15) return; // 15シーン未満はまだ要約しない

    const chunkIndex = Math.floor((actionCount - 15) / 10); // 10シーンごとのチャンク
    // ★ window.sceneSummaries を参照 (global)
    if (chunkIndex >= 0 && !window.sceneSummaries[chunkIndex]) {
        console.log(`[SceneManager] Generating summary for chunk ${chunkIndex}...`);
        const startAction = chunkIndex * 10 + 1;
        const endAction = (chunkIndex + 1) * 10;

        let gatheredTextJa = '';
        let gatheredTextEn = '';
        let aCounter = 0;
        for (const scn of window.scenes) {
            if (scn.action?.content?.trim()) aCounter++;
            if (aCounter >= startAction && aCounter <= endAction) {
                if (scn.action?.content?.trim()) gatheredTextJa += `\nP:${scn.action.content}`;
                gatheredTextJa += `\nS:${scn.content}`;
                // 英語データもあれば結合 (なければ日本語のみ)
                if (scn.action?.content_en?.trim()) gatheredTextEn += `\nP:${scn.action.content_en}`;
                else if (scn.action?.content?.trim()) gatheredTextEn += `\nP:${scn.action.content}`; // JA fallback
                if (scn.content_en?.trim()) gatheredTextEn += `\nS:${scn.content_en}`;
                else gatheredTextEn += `\nS:${scn.content}`; // JA fallback
            }
        }

        try {
            // ★ Gemini で要約生成 (英語と日本語)
            const enSummary = await generateSummaryWithLimit(gatheredTextEn, 5, 'en'); // 下で定義
            await sleep(1000); // 待機
            const jaSummary = await generateSummaryWithLimit(gatheredTextJa, 5, 'ja'); // 下で定義

            // 要約をDBとメモリに保存
            const sumRec = { chunkIndex, content_en: enSummary, content_ja: jaSummary };
            await addSceneSummaryRecord(sumRec); // import
            window.sceneSummaries[chunkIndex] = { en: enSummary, ja: jaSummary }; // global
            console.log(`[SceneManager] Summary for chunk ${chunkIndex} generated and saved.`);
        } catch (e) {
            console.error(`Failed to generate/save summary for chunk ${chunkIndex}:`, e);
            showToast(`要約生成エラー (Chunk ${chunkIndex})`); // import
        }
    } else if (chunkIndex >= 0) {
        console.log(`[SceneManager] Summary for chunk ${chunkIndex} already exists.`);
    }
}

/** 指定行数でテキスト要約 (★ Gemini API 使用) */
async function generateSummaryWithLimit(text, lines = 5, lang = 'en') {
    if (!text?.trim()) return '';
    console.log(`[SceneManager] Generating ${lang} summary (${lines} lines)...`);
    const gemini = new GeminiApiClient(); // import
    if (!gemini.isAvailable) throw new Error('要約APIキー未設定/無効');
    if (gemini.isStubMode) return `(Stub ${lang} summary ${lines} lines)`;

    const modelId = localStorage.getItem(PREFERRED_GEMINI_MODEL_LS_KEY) || 'gemini-1.5-flash-latest';
    let systemPrompt = `You are a summarizer. Output language must be English. Summarize in about ${lines} lines.`;
    let userPrompt = `Summarize the following game progress text concisely in about ${lines} lines of English. Focus on key events and outcomes:\n---\n${text}\n---\nSummary:`;
    if (lang === 'ja') {
        systemPrompt = `あなたは優秀な要約者です。必ず日本語で回答してください。${lines}行程度で要約してください。`;
        userPrompt = `以下のゲーム進行テキストを日本語で${lines}行程度に要約してください。重要な出来事や結果に焦点を当ててください:\n---\n${text}\n---\n要約:`;
    }

    try {
        gemini.initializeHistory([]);
        const summary = await gemini.generateContent(userPrompt, modelId, systemPrompt); // ★ systemPrompt も渡せるように Client 側も修正が必要かも
        return summary.trim();
    } catch (err) {
        console.error(`要約(${lang})失敗:`, err);
        throw err;
    } // エラー再スロー
}

// --- 画像プロンプト生成 (★ Gemini API 使用) ---

/** シーンテキストから画像生成用プロンプト作成 */
// ★ export (sceneUI.js などから使うため)
export async function generateImagePromptFromScene(sceneTextJa) {
    if (!sceneTextJa?.trim()) return '';
    console.log('[SceneManager] Generating image prompt from scene text...');
    const gemini = new GeminiApiClient(); // import
    if (!gemini.isAvailable) {
        console.warn('Cannot generate image prompt: Gemini key missing/invalid');
        return '';
    } // エラーにせず空を返す
    if (gemini.isStubMode) {
        return 'anime style, stub scene';
    }

    const modelId = localStorage.getItem(PREFERRED_GEMINI_MODEL_LS_KEY) || 'gemini-1.5-flash-latest';
    // ★ プロンプトを改善 (よりキーワード抽出を意識)
    const prompt = `以下の日本語のシーン描写から、画像生成に適した英語のキーワードを抽出してください。情景、登場人物の外見や感情、重要なオブジェクトなどをカンマ区切りで列挙してください。\nシーン:\n${sceneTextJa}\n\nImage Generation Keywords (English):`;

    try {
        gemini.initializeHistory([]);
        const keywords = await gemini.generateContent(prompt, modelId);
        // カンマ区切りにする処理を改善
        return keywords
            .split(/[\n,、。]/) // 改行、カンマ、句読点で区切る
            .map((k) => k.trim()) // 前後の空白削除
            .filter((k) => k) // 空要素削除
            .join(', '); // カンマとスペースで結合
    } catch (e) {
        console.error('Img prompt gen fail:', e);
        showToast(`画像プロンプト生成エラー: ${e.message}`);
        return '';
    } // import
}

// --- カード情報抽出 (★ Gemini API 使用) ---

/** 最新シーンからカード情報を抽出 */
// ★ export (sceneUI.js の「カード取得」ボタンなどで使う想定)
export async function getLastSceneSummary() {
    // 関数名は Summary だが実質カード情報抽出
    console.log('[SceneManager] Extracting card info from last scene...');
    // ★ window.scenes を参照 (global)
    const lastSceneEntry = window.scenes?.[window.scenes.length - 1];
    if (!lastSceneEntry?.content) {
        showToast('最新シーンなし');
        return '(抽出対象シーンなし)';
    } // import

    const gemini = new GeminiApiClient(); // import
    if (!gemini.isAvailable) {
        showToast('Gemini APIキー未設定/無効');
        return '(APIキーエラー)';
    } // import
    if (gemini.isStubMode) {
        return '【名前】スタブカード\n【タイプ】スタブ\n【外見】ダミーデータ';
    }

    const modelId = localStorage.getItem(PREFERRED_GEMINI_MODEL_LS_KEY) || 'gemini-1.5-flash-latest';
    const text = lastSceneEntry.content;
    // ★ Gemini にJSON風の出力をさせるプロンプト
    const prompt = `あなたはTRPGの情報を整理するAIです。以下のシーンテキストから、ゲーム内で「エレメントカード」として登録できそうな重要な【アイテム】または【キャラクター】（人物・モンスター）を**1つだけ**選び出し、以下の形式で情報を抽出・記述してください。対象が見つからない場合は「抽出対象なし」とだけ答えてください。\n\n【名前】: （抽出した名前）\n【タイプ】: （アイテム or キャラクター or モンスター のいずれか）\n【外見・説明】: （2,3行程度の簡潔な説明）\n\nシーンテキスト:\n---\n${text}\n---\n\n抽出結果:`;

    try {
        gemini.initializeHistory([]);
        const result = await gemini.generateContent(prompt, modelId);
        console.log('[SceneManager] Card info extraction result:', result);
        if (result.includes('抽出対象なし')) return '(対象なし)';
        return result.trim(); // そのまま返す (UI側でパース・表示)
    } catch (e) {
        console.error('カード情報抽出失敗:', e);
        showToast(`カード情報抽出エラー: ${e.message}`); // import
        return '(抽出エラー)';
    }
}

// --- ヘルパー関数 ---
/** 指定ミリ秒待機 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** 日本語を含むかチェック */
export function containsJapanese(text) {
    if (!text) return false;
    return /[ぁ-んァ-ン一-龯]/.test(text);
}
/** 条件展開 (pako使用) */
export function decompressCondition(zippedBase64) {
    if (!zippedBase64) return '(不明)';
    try {
        const bin = atob(zippedBase64);
        const uint8 = new Uint8Array([...bin].map((c) => c.charCodeAt(0)));
        const inf = pako.inflate(uint8);
        return new TextDecoder().decode(inf);
    } catch (e) {
        console.error('decompress失敗:', e);
        return '(解凍エラー)';
    }
}

/** 全セクションがクリア済みかどうか */
export function areAllSectionsCleared() {
    const wd = window.currentScenario?.wizardData || {}; // global
    const sections = wd.sections || [];

    if (!sections || !sections.length) return false;
    return sections.every((s) => s.cleared);
}

/** エンディングボタン表示切り替え */
export function refreshEndingButtons() {
    const endingBtn = document.getElementById('ending-button');
    const clearEndingBtn = document.getElementById('clear-ending-button');
    const wd = window.currentScenario?.wizardData || {}; // global
    const sections = wd.sections || [];
    console.log(sections);

    if (!endingBtn || !clearEndingBtn) return;

    if (!sections || sections.length === 0) {
        endingBtn.style.display = 'none';
        clearEndingBtn.style.display = 'none';
        return;
    }

    // いずれか1つでもクリア済みか？
    const anyCleared = sections.some((sec) => sec.cleared);
    // 全クリアか？
    const allCleared = areAllSectionsCleared();

    if (!anyCleared) {
        endingBtn.style.display = 'none';
        clearEndingBtn.style.display = 'none';
        return;
    }
    if (allCleared) {
        endingBtn.style.display = 'none';
        clearEndingBtn.style.display = 'inline-block';
    } else {
        endingBtn.style.display = 'inline-block';
        clearEndingBtn.style.display = 'none';
    }
}

// --- ファイル読み込み完了ログ ---
console.log('[SceneManager] sceneManager.js loaded.');

// ★ このファイル内の関数で、他のファイルから呼び出されるものは export する
// 例: export { loadScenarioData, getNextScene, checkSectionClear, handleSceneSummaries, ... };
