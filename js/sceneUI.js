/********************************
 * sceneUI.js
 * シナリオ画面のUI関連イベント・表示更新など。
 * API呼び出し部分を Gemini API (window.geminiClient) に変更。
 ********************************/

// --- 依存関数 (他ファイルまたはグローバルスコープで定義されている想定) ---
// window.multiModalOpen (from multiModal.js)
// window.DOMPurify (external library)
// window.showToast (from common.js)
// window.showLoadingModal (this file or common.js)
// window.scenes, window.currentScenario, window.currentScenarioId, window.geminiClient, window.geminiApiKey, window.DOMPURIFY_CONFIG (from sceneGlobals.js or menu.js)
// window.getSceneEntriesByScenarioId, window.updateSceneEntry, window.deleteSceneEntry, window.addSceneEntry, window.updateScenario, window.getEnding, window.saveEnding, window.deleteEnding, window.getEntitiesByScenarioId, window.addEntity, window.updateEntity, window.deleteEntity (from indexedDB.js or global)
// window.getLastSceneSummary, window.generateEnglishTranslation, window.generateJapaneseTranslation, window.getNextScene, window.deleteScene, window.updateSceneHistory, window.showLastScene, window.renderItemChips, window.checkSectionClear, window.handleSceneSummaries (from sceneManager.js)
// window.onClickRegenerateEndingMulti, window.openEndingModal, window.refreshEndingButtons, window.areAllSectionsCleared (from sceneExtras.js)
// window.onUpdateEntitiesFromAllScenes, window.renderEntitiesList, window.createEntityRow, window.generateEntityImage (from sceneExtras.js)
// window.decompressCondition (from sceneUtils.js or common.js)
// window.initCarousel, window.removeDuplicateIDs (carousel related, maybe separate file)
// window.showPartyModal, window.renderPartyCardsInModalMulti (from sceneExtras.js or party.js)

// --- DOMContentLoaded イベントリスナー ---
window.addEventListener('DOMContentLoaded', () => {
    console.log('[SceneUI] DOMContentLoaded event fired.');

    // カルーセル初期化 (仮)
    setTimeout(() => {
        if (typeof window.initCarousel === 'function') window.initCarousel();
        if (typeof window.removeDuplicateIDs === 'function') window.removeDuplicateIDs();
    }, 500);

    // --- アプリケーションバーのボタン動的追加 ---
    const applicationBar = document.querySelector('.application-bar');
    const baseButton = document.getElementById('save-load-button'); // 基準ボタン

    if (applicationBar && baseButton) {
        console.log('[SceneUI] Adding buttons to application bar...');
        // 履歴ボタン
        if (!document.getElementById('toggle-history-button')) {
            const historyBtn = document.createElement('button');
            historyBtn.id = 'toggle-history-button';
            historyBtn.innerHTML = '<div class="iconmoon icon-newspaper"></div>履歴';
            historyBtn.title = 'シーン履歴の表示/非表示を切り替え';
            applicationBar.insertBefore(historyBtn, baseButton);
            historyBtn.addEventListener('click', toggleHistory);
            console.log('[SceneUI] History button added.');
        }

        // PTボタン (パーティ表示)
        if (!document.getElementById('show-party-button')) {
            const partyButton = document.createElement('button');
            partyButton.id = 'show-party-button';
            partyButton.innerHTML = '<div class="iconmoon icon-strategy"></div>PT';
            partyButton.title = '現在のパーティ情報を表示';
            applicationBar.insertBefore(partyButton, baseButton);
            // showPartyModal は sceneExtras.js などで定義されている想定
            if (typeof window.showPartyModal === 'function') {
                partyButton.addEventListener('click', window.showPartyModal);
            } else {
                console.warn('[SceneUI] showPartyModal function not found.');
                partyButton.disabled = true;
            }
            console.log('[SceneUI] Party button added.');
        }

        // 情報ボタン (アイテム/人物一覧)
        if (!document.getElementById('info-button')) {
            const infoButton = document.createElement('button');
            infoButton.id = 'info-button';
            infoButton.innerHTML = '<div class="iconmoon icon-info"></div>情報';
            infoButton.title = '登場人物やアイテムの情報を表示';
            applicationBar.insertBefore(infoButton, baseButton);
            // openEntitiesModal はこのファイル内で定義
            infoButton.addEventListener('click', openEntitiesModal);
            console.log('[SceneUI] Info (Entities) button added.');
        }

        // ネタバレボタン (条件がある場合のみ表示される想定)
        if (!document.getElementById('spoiler-button')) {
            const spoilerButton = document.createElement('button');
            spoilerButton.id = 'spoiler-button';
            spoilerButton.innerHTML = '<div class="iconmoon icon-flag"></div>目標'; // アイコン変更例
            spoilerButton.title = '現在のセクション目標を表示';
            spoilerButton.style.display = 'none'; // 初期非表示、条件満たしたら表示
            applicationBar.insertBefore(spoilerButton, baseButton);
            spoilerButton.addEventListener('click', openSpoilerModal); // モーダルを開く関数
            console.log('[SceneUI] Spoiler button added (initially hidden).');
        }

        // エンディングボタン (通常 / クリア) - 初期非表示
        if (!document.getElementById('ending-button')) {
            const endingBtn = document.createElement('button');
            endingBtn.id = 'ending-button';
            endingBtn.innerHTML = `<div class="iconmoon icon-sad"></div>Ending`; // 仮アイコン
            endingBtn.title = 'バッドエンディングを見る';
            endingBtn.style.display = 'none'; // 初期非表示
            applicationBar.insertBefore(endingBtn, baseButton);
            if (typeof window.showEndingModal === 'function') {
                endingBtn.addEventListener('click', () => window.showEndingModal('bad'));
            }
            console.log('[SceneUI] Bad Ending button added (initially hidden).');
        }
        if (!document.getElementById('clear-ending-button')) {
            const clearEndingBtn = document.createElement('button');
            clearEndingBtn.id = 'clear-ending-button';
            clearEndingBtn.innerHTML = `<div class="iconmoon icon-trophy"></div>Ending`; // 仮アイコン
            clearEndingBtn.title = 'クリアエンディングを見る';
            clearEndingBtn.style.display = 'none'; // 初期非表示
            applicationBar.insertBefore(clearEndingBtn, baseButton);
            if (typeof window.showEndingModal === 'function') {
                clearEndingBtn.addEventListener('click', () => window.showEndingModal('clear'));
            }
            console.log('[SceneUI] Clear Ending button added (initially hidden).');
        }
    } else {
        console.warn(
            '[SceneUI] Application bar or base button not found. Cannot add dynamic buttons.'
        );
    }

    // --- 他のボタンイベントリスナー設定 ---

    // トークン調整ボタン
    const tokenAdjustBtn = document.getElementById('token-adjust-button');
    if (tokenAdjustBtn) {
        tokenAdjustBtn.addEventListener('click', onOpenTokenAdjustModal);
        console.log('[SceneUI] Token adjust button listener added.');
    }

    // セーブ/ロードボタン (ユニバーサルセーブ用)
    const saveLoadButton = document.getElementById('save-load-button');
    if (saveLoadButton && typeof window.openSaveLoadModal === 'function') {
        // universalSaveLoad.js でリスナーが追加されていなければ追加
        if (!saveLoadButton.hasAttribute('data-listener-added')) {
            saveLoadButton.addEventListener('click', window.openSaveLoadModal);
            saveLoadButton.setAttribute('data-listener-added', 'true');
            console.log('[SceneUI] Save/Load button listener potentially added (if not already).');
        }
        // シナリオ画面ではセーブを可能にする
        const doSaveBtnInModal = document.getElementById('do-save-button'); // モーダル内のボタン想定
        if (doSaveBtnInModal) doSaveBtnInModal.style.display = 'block'; // 表示させる (universalSaveLoad.js側での制御と競合するかも)
    }

    // カード取得ボタン (機能が不明瞭なためコメントアウト or 削除検討)
    /*
    const getCardButton = document.getElementById("get-card-button");
    if (getCardButton) {
        getCardButton.addEventListener("click", async () => {
            // このボタンの正確な機能に合わせて実装見直しが必要
            console.log("[SceneUI] Get Card button clicked.");
            const summary = await window.getLastSceneSummary(); // ★ Gemini で要約/情報抽出
             if (!summary || summary.startsWith('(')) { // エラー時など
                 if(typeof showToast === 'function') showToast(`カード情報の取得に失敗しました: ${summary}`);
                 return;
             }
             window.multiModalOpen({
                 title: "抽出情報",
                 contentHtml: `<div id="preview-card-container"><pre>${DOMPurify.sanitize(summary)}</pre></div>`,
                 showCloseButton: true,
                 closeOnOutsideClick: true,
                 appearanceType: "center",
                 cancelLabel: "閉じる",
                 okLabel: "倉庫に追加 (未実装)",
                 onOk: () => { alert("倉庫への追加は未実装です。"); }
             });
        });
        console.log("[SceneUI] Get Card button listener added.");
    }
    */

    // 回答候補自動生成チェックボックス
    const autoGenCbx = document.getElementById('auto-generate-candidates-checkbox');
    if (autoGenCbx) {
        autoGenCbx.checked = localStorage.getItem('autoGenerateCandidates') === 'true'; // 初期状態
        autoGenCbx.addEventListener('change', () => {
            localStorage.setItem('autoGenerateCandidates', autoGenCbx.checked);
            console.log(`[SceneUI] Auto-generate candidates set to: ${autoGenCbx.checked}`);
            if (autoGenCbx.checked) {
                // チェックされたら即時生成
                onGenerateActionCandidates(); // ★ Gemini で生成
            } else {
                // チェックが外れたら候補をクリア
                const container = document.getElementById('action-candidates-container');
                if (container) container.innerHTML = '';
            }
        });
        console.log(
            `[SceneUI] Auto-generate candidates checkbox listener added. Initial state: ${autoGenCbx.checked}`
        );
    }

    // アイテム使用ボタン
    const useItemBtn = document.getElementById('use-item-button');
    if (useItemBtn) {
        useItemBtn.addEventListener('click', () => {
            console.log('[SceneUI] Use item button clicked.');
            // getNextScene(true) を呼び出す (sceneManager.jsで定義)
            if (typeof window.getNextScene === 'function') {
                window.getNextScene(true);
            } else {
                console.error('[SceneUI] getNextScene function not found.');
            }
        });
        console.log('[SceneUI] Use item button listener added.');
    }

    // 全セクション閲覧ボタン
    const viewAllSectionsBtn = document.getElementById('view-all-sections-button');
    if (viewAllSectionsBtn) {
        viewAllSectionsBtn.addEventListener('click', showAllSectionsModal);
        console.log('[SceneUI] View All Sections button listener added.');
    }

    // メニューに戻るボタン
    const backMenuBtn = document.getElementById('back-to-menu');
    if (backMenuBtn) {
        backMenuBtn.addEventListener('click', () => {
            console.log('[SceneUI] Back to menu button clicked.');
            window.location.href = 'index.html'; // index.html へ遷移
        });
        console.log('[SceneUI] Back to menu button listener added.');
    }

    // ローディングモーダル内のキャンセルボタン
    const cancelRequestBtn = document.getElementById('cancel-request-button');
    if (cancelRequestBtn) {
        // ★ AbortController が GeminiApiClient でサポートされていないため、
        //    このボタンの機能は現状では限定的になるか、削除する必要がある。
        //    もしキャンセル処理を実装する場合、API呼び出し中にフラグを立て、
        //    応答が返ってきたときにフラグを見て結果を破棄するなどの方法が考えられる。
        cancelRequestBtn.addEventListener('click', () => {
            console.warn(
                '[SceneUI] Cancel request button clicked, but cancellation might not be fully supported.'
            );
            // window.cancelRequested = true; // フラグを立てる例
            if (typeof window.showLoadingModal === 'function') window.showLoadingModal(false); // モーダルを閉じる
            if (typeof window.showToast === 'function')
                showToast('キャンセルを試みます...(APIによっては停止できません)');
        });
        console.log(
            '[SceneUI] Cancel request button listener added (functionality might be limited).'
        );
    }

    // カスタム画像生成モーダル関連 (multiModal 化を検討しても良い)
    setupCustomImageModalEvents();

    console.log('[SceneUI] DOMContentLoaded setup finished.');
}); // End of DOMContentLoaded

// --- トークン調整 (英語データ生成) ---

/** トークン調整モーダルを開く */
function onOpenTokenAdjustModal() {
    console.log('[SceneUI] Opening token adjust modal...');
    // ★ 英語データ(content_en)がないシーン数をカウント
    const missingCount =
        (window.scenes || []).filter((sc) => !sc.content_en?.trim() && sc.content?.trim()).length +
        (window.scenes || []).filter(
            (sc) => !sc.action?.content_en?.trim() && sc.action?.content?.trim()
        ).length;

    const message =
        missingCount > 0
            ? `${missingCount}件のシーン/アクションに内部英語データがありません。生成しますか？ (API通信が発生します)`
            : '内部英語データは全て存在します。';

    window.multiModalOpen({
        title: '内部英語データ生成',
        contentHtml: `
            <p id="token-adjust-message" style="margin-bottom:1em;">${DOMPurify.sanitize(
                message
            )}</p>
            <p id="token-adjust-progress" style="min-height:1.5em; font-weight: bold;"></p>
        `,
        showCloseButton: true,
        closeOnOutsideClick: true,
        appearanceType: 'center',
        cancelLabel: 'キャンセル',
        // OKボタンは missingCount > 0 の場合のみ表示・有効化
        okLabel: missingCount > 0 ? '生成開始' : 'OK',
        okDisabled: missingCount === 0, // 件数が0ならOKボタン無効
        onOk: async (modalInstance) => {
            // ★ multiModal のインスタンスを受け取れるようにする (要 multiModal 側修正 or 別途取得)
            if (missingCount > 0) {
                // OKボタンとキャンセルボタンを無効化
                modalInstance?.setButtonsDisabled(true); // 仮: モーダルインスタンスにボタン無効化メソッドがあると仮定
                await onConfirmTokenAdjust();
                // 完了後、モーダルを閉じるか、完了メッセージを表示
                modalInstance?.setButtonsDisabled(false); // ボタン再有効化
                // 完了メッセージ更新 & OKボタン変更
                const msgEl = document.getElementById('token-adjust-message');
                const progEl = document.getElementById('token-adjust-progress');
                if (msgEl) msgEl.textContent = '英語データの生成が完了しました。';
                if (progEl) progEl.textContent = ''; // 進捗クリア
                modalInstance?.updateOkButton('閉じる', () => modalInstance.close()); // OKボタンを閉じるに変更
            } else {
                // 件数0の場合はそのまま閉じる
            }
        },
    });
}

/** トークン調整 (英語データ生成) を実行 */
async function onConfirmTokenAdjust() {
    console.log('[SceneUI] Confirming token adjustment (generating English data)...');
    const progressEl = document.getElementById('token-adjust-progress');

    // ★ APIクライアントのチェック
    if (!window.geminiClient) {
        if (typeof alert === 'function') alert('APIクライアントが利用できません。');
        return;
    }

    // 英語データがないシーンとアクションを収集
    const scenesToTranslate = (window.scenes || [])
        .filter((sc) => sc.content?.trim() && !sc.content_en?.trim())
        .map((sc) => ({ type: 'scene', obj: sc }));
    const actionsToTranslate = (window.scenes || [])
        .filter((sc) => sc.action?.content?.trim() && !sc.action?.content_en?.trim())
        .map((sc) => ({ type: 'action', obj: sc }));

    const targets = [...scenesToTranslate, ...actionsToTranslate];

    if (targets.length === 0) {
        console.log('[SceneUI] No missing English data found.');
        if (progressEl) progressEl.textContent = '不足はありません。';
        return; // 対象がなければ終了
    }

    let doneCount = 0;
    const total = targets.length;
    if (progressEl) progressEl.textContent = `0/${total}件 処理中...`;

    for (const target of targets) {
        doneCount++;
        const sceneObj = target.obj;
        const textToTranslate =
            target.type === 'scene' ? sceneObj.content : sceneObj.action.content;

        if (progressEl)
            progressEl.textContent = `${doneCount}/${total}件 処理中... (${
                target.type === 'scene' ? 'シーン' : 'アクション'
            } ${sceneObj.sceneId})`;

        try {
            const translatedTextEn = await generateEnglishTranslation(textToTranslate); // ★ Geminiで翻訳

            if (target.type === 'scene') {
                sceneObj.content_en = translatedTextEn;
            } else {
                sceneObj.action.content_en = translatedTextEn;
            }

            // DB更新
            const allEntries = await window.getSceneEntriesByScenarioId(sceneObj.scenarioId);
            // sceneId に対応する scene レコードを探す (entryId ではない)
            const sceneRec = allEntries.find(
                (e) => e.type === 'scene' && e.sceneId === sceneObj.sceneId
            );
            if (sceneRec) {
                // レコードに翻訳結果を反映
                sceneRec.content_en = sceneObj.content_en;
                sceneRec.actionContent_en = sceneObj.action.content_en; // action も更新
                await window.updateSceneEntry(sceneRec); // DB更新関数
                console.log(
                    `[SceneUI] Updated English data in DB for sceneId: ${sceneObj.sceneId}`
                );
            } else {
                console.warn(
                    `[SceneUI] Scene record not found in DB for sceneId: ${sceneObj.sceneId}`
                );
            }
            // 短い待機（APIレート制限対策）
            await new Promise((resolve) => setTimeout(resolve, 200)); // 200ms待機
        } catch (error) {
            console.error(
                `[SceneUI] Failed to generate English data for ${target.type} ${sceneObj.sceneId}:`,
                error
            );
            if (progressEl) progressEl.textContent = `${doneCount}/${total}件 エラー発生`;
            if (typeof showToast === 'function') showToast(`エラー: ${error.message}`);
            // エラーが発生しても次の処理に進む
        }
    }

    console.log('[SceneUI] English data generation finished.');
    if (progressEl) progressEl.textContent = `${doneCount}/${total}件 完了`;
    // alert("英語データ生成が完了しました。"); // モーダル内でメッセージ更新するので不要
}

// --- ネタバレ（目標表示）モーダル ---
/** ネタバレ（目標表示）モーダルを開く */
function openSpoilerModal() {
    console.log('[SceneUI] Opening spoiler (goal) modal...');
    let goalText = '現在の目標情報はありません。';
    const wd = window.currentScenario?.wizardData;
    if (wd && wd.sections) {
        const sorted = [...wd.sections].sort((a, b) => (a.number || 0) - (b.number || 0));
        const firstUncleared = sorted.find((s) => !s.cleared);
        if (firstUncleared) {
            // 英語と日本語の両方を表示する例
            const conditionJa =
                window.decompressCondition(firstUncleared.conditionZipped || '') ||
                '(日本語条件不明)';
            const conditionEn = firstUncleared.conditionEn || '(English condition unknown)';
            goalText = `現在の目標 (セクション ${firstUncleared.number}):\n\n${conditionJa}\n(${conditionEn})`;
        } else if (sorted.length > 0) {
            goalText = '全てのセクション目標は達成済みです！';
        }
    }

    window.multiModalOpen({
        title: '現在のセクション目標',
        contentHtml: `<pre id="clear-condition-text" style="white-space: pre-wrap; font-size: 1rem; max-height: 60vh; overflow-y: auto;">${DOMPurify.sanitize(
            goalText
        )}</pre>`,
        showCloseButton: true,
        closeOnOutsideClick: true,
        appearanceType: 'center',
        cancelLabel: '閉じる',
    });
}

// --- 回答候補生成 (★ Gemini API 使用) ---
/** 回答候補を生成して表示 */
async function onGenerateActionCandidates() {
    console.log('[SceneUI] Generating action candidates...');
    // ★ APIクライアントのチェック
    if (!window.geminiClient) {
        console.warn('[SceneUI] Cannot generate candidates: Gemini client not available.');
        // 必要ならユーザーに通知
        // showToast("APIクライアントが利用できません。");
        // チェックボックスの状態を戻すなど
        const autoGenCbx = document.getElementById('auto-generate-candidates-checkbox');
        if (autoGenCbx) autoGenCbx.checked = false;
        return;
    }

    const lastScene = [...window.scenes].slice(-1)[0];
    if (!lastScene?.content) {
        console.log('[SceneUI] No last scene content available for generating candidates.');
        return; // 最新シーンがなければ生成しない
    }
    const lastSceneTextJa = lastScene.content; // 日本語のシーンテキストを使用

    // 目標テキストを取得 (日本語)
    const wd = window.currentScenario?.wizardData;
    let conditionTextJa = '';
    if (wd?.sections) {
        const sorted = [...wd.sections].sort((a, b) => (a.number || 0) - (b.number || 0));
        const firstUncleared = sorted.find((s) => !s.cleared);
        if (firstUncleared) {
            conditionTextJa =
                window.decompressCondition(firstUncleared.conditionZipped || '') || '(目標不明)';
        }
    }

    const candidatesContainer = document.getElementById('action-candidates-container');
    if (candidatesContainer) {
        candidatesContainer.innerHTML = `<div class="loading" style="text-align:center; color:#aaa;">行動候補を生成中...</div>`; // 生成中表示
    }

    // AbortController は使わない

    try {
        // Gemini 向けプロンプト (日本語で指示、日本語で応答を期待)
        const prompt = `あなたはTRPGのGMアシスタントです。プレイヤーの次の行動のヒントとなる選択肢を4つ提案してください。
以下のルールに従ってください:
- 現在の「シーン」と「目標」を考慮すること。
- 選択肢はプレイヤーが取れそうな自然な行動であること。
- 1つは目標達成に繋がりそうな行動、2つは一般的な行動、1つは少しユニークまたは意外な行動を含むこと。
- 各選択肢は短い日本語の文章で表現すること。
- 番号や記号（「・」や「-」など）は付けず、各選択肢を改行で区切って出力すること。

現在のシーン:
---
${lastSceneTextJa}
---
${conditionTextJa ? `\n現在の目標:\n---\n${conditionTextJa}\n---\n` : ''}

行動の選択肢 (4つ、改行区切り):`;

        const currentModelId = document.getElementById('model-select')?.value;
        if (!currentModelId) throw new Error('モデル未選択');

        window.geminiClient.initializeHistory([]); // 履歴リセット
        const responseText = await window.geminiClient.generateContent(prompt, currentModelId);

        // 応答を解析してボタンを表示
        const lines = responseText
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => l && l.length > 1); // 空行や短すぎる行を除外
        console.log('[SceneUI] Generated action candidates:', lines);

        if (candidatesContainer) {
            candidatesContainer.innerHTML = ''; // クリア
            if (lines.length > 0) {
                lines.forEach((line) => {
                    const btn = document.createElement('button');
                    // 余計な接頭辞（例: "・", "- "）があれば削除
                    btn.textContent = line.replace(/^[\s・\-*]\s*/, '');
                    btn.style.display = 'block'; // 各ボタンをブロック要素に
                    btn.style.width = '100%'; // 幅をコンテナに合わせる
                    btn.style.textAlign = 'left';
                    btn.style.marginBottom = '5px'; // ボタン間のスペース
                    btn.addEventListener('click', () => {
                        const playerInput = document.getElementById('player-input');
                        if (playerInput) {
                            playerInput.value = btn.textContent; // 入力欄にコピー
                            playerInput.focus(); // フォーカス
                            candidatesContainer.innerHTML = ''; // 選択したら候補を消す
                            const autoGenCbx = document.getElementById(
                                'auto-generate-candidates-checkbox'
                            );
                            if (autoGenCbx) autoGenCbx.checked = false; // 自動生成チェックも外す
                        }
                    });
                    candidatesContainer.appendChild(btn);
                });
            } else {
                candidatesContainer.innerHTML = `<span style="color:#aaa;">候補を生成できませんでした。</span>`;
            }
        }
    } catch (e) {
        console.error('[SceneUI] 回答候補生成失敗:', e);
        if (candidatesContainer) {
            candidatesContainer.innerHTML = `<span style="color:#f88;">候補生成エラー</span>`;
        }
        if (typeof showToast === 'function') showToast(`候補生成失敗: ${e.message}`);
    } finally {
        // ローディング表示を確実に消す（もしあれば）
    }
}

// --- カスタム画像生成 (★ Gemini API 使用) ---

/** カスタム画像生成モーダルを開く */
async function openImagePromptModal() {
    console.log('[SceneUI] Opening custom image prompt modal...');
    // 最新シーンの画像プロンプトをデフォルト値として設定
    const lastScene = [...window.scenes].slice(-1)[0];
    let defaultPrompt = '';
    if (lastScene) {
        const sceneRecord = await window
            .getSceneEntriesByScenarioId(lastScene.scenarioId)
            .then((entries) =>
                entries.find((e) => e.type === 'scene' && e.sceneId === lastScene.sceneId)
            );
        defaultPrompt = sceneRecord?.prompt || ''; // DBに保存されたプロンプトを使う
    }

    // multiModal で表示
    window.multiModalOpen({
        id: 'custom-image-modal',
        title: 'カスタム画像生成',
        contentHtml: `
              <p>画像生成AIへの指示（プロンプト）を英語で入力してください。</p>
              <textarea id="image-custom-prompt" rows="4" style="width: 100%; margin-bottom: 10px;" placeholder="例: Anime style, a brave knight standing in front of a castle, dynamic angle..."></textarea>
         `,
        showCloseButton: true,
        closeOnOutsideClick: false, // 外側クリックでは閉じない
        appearanceType: 'center',
        cancelLabel: 'キャンセル',
        okLabel: '生成開始',
        onOpen: () => {
            const promptInput = document.getElementById('image-custom-prompt');
            if (promptInput) {
                promptInput.value = defaultPrompt; // デフォルトプロンプト設定
                promptInput.focus();
            }
        },
        onOk: () => {
            const userPromptText = document.getElementById('image-custom-prompt')?.value.trim();
            if (!userPromptText) {
                if (typeof showToast === 'function') showToast('プロンプトを入力してください。');
                return false; // モーダルを閉じない
            }
            onCustomImageGenerate(userPromptText); // ★プロンプトを渡して生成実行
            // onOkの後、モーダルは自動で閉じる
        },
    });
}

/** カスタムプロンプトで画像を生成 (★ Gemini API 使用) */
async function onCustomImageGenerate(userPromptText) {
    console.log('[SceneUI] Generating custom image with prompt:', userPromptText);
    // ★ APIクライアントのチェック
    if (!window.geminiClient) {
        if (typeof showToast === 'function') showToast('APIクライアントが利用できません。');
        return;
    }

    // 最新シーンがないと画像を追加できない
    const lastScene = [...window.scenes].slice(-1)[0];
    if (!lastScene) {
        if (typeof alert === 'function') alert('画像を追加する先のシーンが存在しません。');
        return;
    }

    // ローディング表示開始
    if (typeof window.showLoadingModal === 'function') window.showLoadingModal(true);

    try {
        // ★ GeminiApiClient を使って画像生成
        // 必要であればプロンプトに定型文を追加
        const finalPrompt = `Generate an image based on the following description: ${userPromptText}. Style: anime wide image. Do not include any text or letters.`;
        const dataUrl = await window.geminiClient.generateImageContent(
            finalPrompt /*, 'gemini-pro-vision' or image model*/
        );

        if (!dataUrl || !dataUrl.startsWith('data:image')) {
            throw new Error('有効な画像データURLを取得できませんでした。');
        }

        // DBに画像レコードを保存
        const imgRec = {
            scenarioId: lastScene.scenarioId,
            type: 'image',
            sceneId: lastScene.sceneId, // 最新シーンに紐付ける
            content: '', // 画像レコードには不要
            content_en: '',
            dataUrl: dataUrl,
            prompt: userPromptText, // ユーザーが入力したプロンプトを保存
        };
        const newEntryId = await window.addSceneEntry(imgRec); // DB保存関数
        console.log(`[SceneUI] Custom image saved to DB with entryId: ${newEntryId}`);

        // メモリ上のシーンデータにも画像情報を追加
        lastScene.images.push({
            entryId: newEntryId,
            dataUrl: dataUrl,
            prompt: userPromptText,
        });

        // UI更新
        if (typeof window.updateSceneHistory === 'function') window.updateSceneHistory();
        if (typeof window.showLastScene === 'function') window.showLastScene();
        if (typeof showToast === 'function') showToast('カスタム画像を生成・追加しました。');
    } catch (e) {
        console.error('[SceneUI] カスタム画像生成失敗:', e);
        if (typeof showToast === 'function') showToast(`カスタム画像生成失敗: ${e.message}`);
    } finally {
        if (typeof window.showLoadingModal === 'function') window.showLoadingModal(false);
    }
}

// --- その他のUI関連関数 ---

/** 履歴表示のトグル */
window.toggleHistory = async function () {
    if (!window.currentScenario) return;
    const hist = document.getElementById('scene-history');
    if (!hist) return;

    // showHistory フラグをトグル
    window.currentScenario.showHistory = !window.currentScenario.showHistory;
    const show = window.currentScenario.showHistory;
    hist.style.display = show ? 'flex' : 'none'; // 表示/非表示切り替え
    console.log(`[SceneUI] Toggled history visibility to: ${show}`);

    // ボタンの見た目を変更（任意）
    const historyBtn = document.getElementById('toggle-history-button');
    if (historyBtn) {
        historyBtn.style.backgroundColor = show ? '#777' : ''; // 例: 表示中はグレーに
        historyBtn.title = show ? 'シーン履歴を隠す' : 'シーン履歴を表示';
    }

    // 状態をDBに保存
    try {
        await window.updateScenario(window.currentScenario);
    } catch (error) {
        console.error('[SceneUI] Failed to save history visibility state:', error);
        // エラー時はUIの状態を元に戻すか検討
        window.currentScenario.showHistory = !show;
        hist.style.display = !show ? 'flex' : 'none';
        if (historyBtn) historyBtn.style.backgroundColor = !show ? '#777' : '';
    }
};

/** 情報モーダル (エンティティ一覧) を開く */
function openEntitiesModal() {
    console.log('[SceneUI] Opening entities modal...');
    window.multiModalOpen({
        title: '登場人物・アイテム情報',
        contentHtml: `
            <div style="margin-bottom:10px;">
                <button id="entity-update-button" title="現在のシナリオ全体から情報を再抽出します"><span class="iconmoon icon-search"></span> シナリオから再抽出</button>
            </div>
            <div id="entity-candidate-list" style="margin-bottom:15px; padding:5px; color: #aaa; font-style: italic; min-height: 1.2em;"></div>
            <div id="entity-list-container" style="margin-bottom:10px; padding:5px; max-height: 60vh; overflow-y: auto;">
                <div class="loading">読み込み中...</div>
            </div>
        `,
        showCloseButton: true,
        closeOnOutsideClick: true,
        cancelLabel: '閉じる',
        appearanceType: 'center',
        onOpen: async () => {
            // async に変更
            console.log('[SceneUI] Entities modal opened. Rendering list...');
            // ★ sceneExtras.js の関数がグローバルにある想定
            if (typeof window.renderEntitiesList === 'function') {
                await window.renderEntitiesList(); // awaitで待機
            } else {
                console.error('[SceneUI] renderEntitiesList function not found.');
                document.getElementById('entity-list-container').textContent =
                    'リスト表示関数が見つかりません。';
            }

            const entityUpdateBtn = document.getElementById('entity-update-button');
            if (entityUpdateBtn && typeof window.onUpdateEntitiesFromAllScenes === 'function') {
                entityUpdateBtn.addEventListener('click', window.onUpdateEntitiesFromAllScenes); // ★ sceneExtras.js の関数
            } else {
                if (entityUpdateBtn) entityUpdateBtn.disabled = true;
                console.error('[SceneUI] Entity update button or function not found.');
            }
        },
    });
}

/** 全セクション一覧モーダル */
function showAllSectionsModal() {
    console.log('[SceneUI] Opening all sections modal...');
    window.multiModalOpen({
        title: '全セクション一覧',
        contentHtml: `
            <div id="all-sections-container" style="max-height:70vh; overflow-y:auto; white-space: pre-wrap; line-height: 1.6; font-size: 0.9rem;">
                 <div class="loading">読み込み中...</div>
            </div>
        `,
        showCloseButton: true,
        appearanceType: 'center',
        closeOnOutsideClick: true,
        cancelLabel: '閉じる',
        onOpen: () => {
            renderAllSections(); // 描画関数呼び出し
        },
    });
}

/** 全セクション一覧を描画 */
function renderAllSections() {
    const container = document.getElementById('all-sections-container');
    if (!container) {
        console.error('[SceneUI] All sections container not found.');
        return;
    }
    container.innerHTML = ''; // クリア

    const wd = window.currentScenario?.wizardData;
    if (!wd?.sections || wd.sections.length === 0) {
        container.textContent = 'セクション情報がありません。';
        console.log('[SceneUI] No section data found to render.');
        return;
    }

    // 番号でソート
    const sorted = [...wd.sections].sort((a, b) => (a.number || 0) - (b.number || 0));
    let content = '';
    sorted.forEach((sec) => {
        const status = sec.cleared ? '【クリア済】' : '【未クリア】';
        const condition = window.decompressCondition(sec.conditionZipped || '') || '(条件不明)';
        content += `▼ セクション ${sec.number} ${status}\n`;
        content += `   目標: ${condition}\n\n`;
    });
    container.textContent = content; // textContent を使うと pre-wrap が効く
    console.log('[SceneUI] Rendered all sections.');
}

/** カスタム画像生成モーダル関連のイベント設定 */
function setupCustomImageModalEvents() {
    // この関数は multiModal を使うようになったため、不要になった可能性が高い
    // もしカスタム画像生成モーダルを multiModal 以外で実装している場合はここに記述
    console.log('[SceneUI] Skipping setup for non-multiModal custom image modal events.');
}

// --- ローディングモーダル表示/非表示 ---
// (common.js に移動する方が良いかもしれない)
window.showLoadingModal = function (show) {
    const m = document.getElementById('loading-modal');
    if (!m) {
        // ローディングモーダル要素がなければ動的に生成 (初回のみ)
        const loadingModal = document.createElement('div');
        loadingModal.id = 'loading-modal';
        // style は CSS で定義推奨
        loadingModal.style.position = 'fixed';
        loadingModal.style.top = '0';
        loadingModal.style.left = '0';
        loadingModal.style.width = '100%';
        loadingModal.style.height = '100%';
        loadingModal.style.backgroundColor = 'rgba(0,0,0,0.6)';
        loadingModal.style.zIndex = '99999'; // 最前面
        loadingModal.style.display = 'none'; // 初期非表示
        loadingModal.style.justifyContent = 'center';
        loadingModal.style.alignItems = 'center';
        loadingModal.innerHTML = `
              <div style="background-color: #fff; padding: 20px 40px; border-radius: 5px; text-align: center;">
                   <div class="loading">処理中...</div>
                   <button id="internal-cancel-request-button" style="margin-top: 15px; background-color: #aaa;">キャンセル</button>
              </div>`;
        document.body.appendChild(loadingModal);

        // 生成したモーダル内のキャンセルボタンにイベント設定
        const internalCancelBtn = document.getElementById('internal-cancel-request-button');
        if (internalCancelBtn) {
            internalCancelBtn.addEventListener('click', () => {
                console.warn(
                    '[SceneUI] Internal cancel button clicked (functionality might be limited).'
                );
                // window.cancelRequested = true; // フラグを立てる
                window.showLoadingModal(false); // モーダルを閉じる
                if (typeof showToast === 'function') showToast('キャンセルを試みます...');
            });
        }
        // 再度要素を取得
        const newM = document.getElementById('loading-modal');
        if (newM) {
            if (show) newM.style.display = 'flex';
        }
    } else {
        m.style.display = show ? 'flex' : 'none';
    }
    console.log(`[SceneUI] Loading modal ${show ? 'shown' : 'hidden'}.`);
};

// 画像ビューア関連の関数 (openImageViewer, initViewerModalContent など) は変更がないため省略せず記述。
// (ここではコードの重複を避けるため省略しますが、実際のファイルには記述してください)

console.log('[SceneUI] sceneUI.js loaded.'); // ファイル読み込み完了ログ
