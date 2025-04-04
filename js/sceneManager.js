/********************************
 * sceneManager.js
 * シーン関連の主要ロジック。
 * API呼び出しを Gemini API (window.geminiClient) に変更。
 ********************************/

// --- 依存関数 (他ファイルまたはグローバルスコープで定義されている想定) ---
// getScenarioById, updateScenario, getSceneEntriesByScenarioId, updateSceneEntry, addSceneEntry, deleteSceneEntry (from indexedDB.js or global)
// getSceneSummaryByChunkIndex, addSceneSummaryRecord (from indexedDB.js or global)
// getEntitiesByScenarioId, updateEntity, addEntity, deleteEntity (from indexedDB.js or global)
// showLoadingModal (from sceneUI.js or common.js)
// showToast (from common.js)
// updateSceneHistory, showLastScene, refreshEndingButtons, renderItemChips (from sceneUI.js)
// buildPartyInsertionText (from sceneExtras.js)
// decompressCondition (from sceneUtils.js or common.js)
// DOMPurify (external library)

// --- グローバル変数 (sceneGlobals.js で定義されている想定) ---
// window.geminiApiKey, window.geminiClient,
// window.scenes, window.currentScenarioId, window.currentScenario,
// window.scenarioType, window.clearCondition, window.sections,
// window.sceneSummaries, window.selectedItem, window.DOMPURIFY_CONFIG

// --------------------------------------------------
// ▼ シナリオ読み込み (修正なし、依存関数が利用可能か確認)
// --------------------------------------------------
window.loadScenarioData = async function (scenarioId) {
    console.log(`[SceneManager] Loading scenario data for ID: ${scenarioId}`);
    try {
        const sc = await window.getScenarioById(scenarioId); // DB関数
        if (!sc) {
            // エラーメッセージをより具体的に
            const errorMsg = `指定されたシナリオ(ID: ${scenarioId})が見つかりません。`;
            console.error(`[SceneManager] ${errorMsg}`);
            if (typeof alert === 'function') alert(errorMsg); // alert より showToast やモーダルが良いかも
            // index.html にリダイレクトするなどの処理
            window.location.href = 'index.html';
            return;
        }
        window.currentScenario = sc;
        window.currentScenarioId = scenarioId;
        console.log('[SceneManager] Current scenario set:', window.currentScenario);

        const wd = sc.wizardData || {};
        window.scenarioType = wd.scenarioType; // シナリオタイプ
        window.clearCondition = wd.clearCondition || ''; // クリア条件 (使われているか不明)
        window.sections = wd.sections || []; // セクション情報
        console.log(
            '[SceneManager] Scenario type:',
            window.scenarioType,
            'Sections:',
            window.sections
        );

        // シーン一覧をDBから取得してメモリに整形
        await loadAllScenesForScenario(scenarioId);

        // 要約を読み込む
        window.sceneSummaries = []; // 初期化
        for (let i = 0; i < 100; i++) {
            // 上限を設ける
            const sumRec = await window.getSceneSummaryByChunkIndex(i); // DB関数
            if (!sumRec) break; // 見つからなければ終了
            window.sceneSummaries[i] = {
                en: sumRec.content_en,
                ja: sumRec.content_ja,
            };
        }
        console.log(`[SceneManager] Loaded ${window.sceneSummaries.length} scene summaries.`);

        // シーン履歴の表示フラグ (デフォルトは非表示)
        if (typeof sc.showHistory === 'undefined') {
            sc.showHistory = false;
        }
        // 履歴表示状態をUIに反映
        const hist = document.getElementById('scene-history');
        if (hist) {
            hist.style.display = sc.showHistory ? 'flex' : 'none'; // blockではなくflexかも
        }

        // UI再描画 (sceneUI.js の関数呼び出し)
        if (typeof window.updateSceneHistory === 'function') window.updateSceneHistory();
        if (typeof window.showLastScene === 'function') window.showLastScene();
        if (typeof window.refreshEndingButtons === 'function') window.refreshEndingButtons();
        if (typeof window.renderItemChips === 'function') await window.renderItemChips();

        // 背景初期化 (scenarioページ用)
        if (typeof window.initBackground === 'function') await window.initBackground('scenario');

        console.log('[SceneManager] Scenario data loaded and UI updated.');
    } catch (err) {
        console.error('[SceneManager] シナリオ読み込み失敗:', err);
        if (typeof alert === 'function') alert('シナリオの読み込みに失敗しました:\n' + err.message);
        // エラー発生時、index.html に戻るなど
        window.location.href = 'index.html';
    }
};

/**
 * DB の sceneEntries からシーンと画像を読み込み window.scenes に整形格納
 */
async function loadAllScenesForScenario(scenarioId) {
    console.log(`[SceneManager] Loading all scene entries for scenario ID: ${scenarioId}`);
    window.scenes = []; // 初期化
    const allEntries = await window.getSceneEntriesByScenarioId(scenarioId); // DB関数
    console.log(`[SceneManager] Found ${allEntries.length} entries in DB.`);

    // シーンと画像を仕分け
    const sceneRecords = allEntries.filter((e) => e && e.type === 'scene');
    const imageRecords = allEntries.filter((e) => e && e.type === 'image');

    // entryId で昇順ソート
    sceneRecords.sort((a, b) => (a.entryId || 0) - (b.entryId || 0));
    imageRecords.sort((a, b) => (a.entryId || 0) - (b.entryId || 0));

    // シーンごとに画像を紐づけ
    for (const sRec of sceneRecords) {
        // 不正なレコードを除外
        if (!sRec || !sRec.sceneId) {
            console.warn('[SceneManager] Skipping invalid scene record:', sRec);
            continue;
        }
        const scObj = {
            sceneId: sRec.sceneId,
            scenarioId: sRec.scenarioId,
            content: sRec.content || '',
            content_en: sRec.content_en || '',
            action: {
                // actionContent, actionContent_en から復元
                content: sRec.actionContent || '',
                content_en: sRec.actionContent_en || '',
            },
            images: [], // 初期化
        };

        // このシーンに紐づく画像を探す
        const imgs = imageRecords.filter((imgRec) => imgRec && imgRec.sceneId === sRec.sceneId);
        scObj.images = imgs.map((img) => ({
            entryId: img.entryId,
            dataUrl: img.dataUrl || '',
            prompt: img.prompt || '',
            // rotationAngle は scene record 側にはないので注意 (もし必要なら別途取得)
        }));

        window.scenes.push(scObj);
    }
    console.log(`[SceneManager] Processed ${window.scenes.length} scenes with their images.`);
}

// --------------------------------------------------
// ▼ 次のシーン取得 (★ Gemini API 使用に修正)
// --------------------------------------------------
window.getNextScene = async function (useItem = false) {
    console.log(`[SceneManager] getNextScene called. Use item: ${useItem}`);
    // ★ APIクライアントとキーの存在チェック
    if (!window.geminiClient) {
        if (typeof alert === 'function')
            alert('APIクライアントが初期化されていません。APIキーを確認してください。');
        console.error('[SceneManager] Gemini client not available.');
        return;
    }
    if (window.geminiClient.isStubMode) {
        console.warn('[SceneManager] Running getNextScene in STUB MODE.');
    }

    const hasIntro = window.scenes.length > 0;
    let playerActionJa = ''; // プレイヤー行動 (日本語)
    let playerActionEn = ''; // プレイヤー行動 (英語) - 翻訳結果用

    // 行動入力の取得
    if (hasIntro) {
        if (useItem) {
            // アイテム使用の場合
            if (window.selectedItem) {
                const nm = window.selectedItem.name || '不明アイテム';
                const ds = window.selectedItem.description || '説明不明';
                playerActionJa = `アイテム「${nm}」(${ds})を使用する。`;
                console.log(`[SceneManager] Using item: ${playerActionJa}`);
                window.selectedItem = null; // 使用したら選択解除
                if (typeof window.renderItemChips === 'function') window.renderItemChips(); // チップ表示更新
            } else {
                if (typeof alert === 'function') alert('使用するアイテムが選択されていません。');
                console.log('[SceneManager] No item selected to use.');
                return;
            }
        } else {
            // 通常の行動入力
            const inputEl = document.getElementById('player-input');
            playerActionJa = inputEl?.value.trim() || '';
            if (!playerActionJa) {
                if (typeof alert === 'function') alert('プレイヤーの行動を入力してください。');
                console.log('[SceneManager] Player input is empty.');
                return;
            }
            console.log(`[SceneManager] Player action (JA): ${playerActionJa}`);
            if (inputEl) inputEl.value = ''; // 入力欄クリア
        }
    } else {
        console.log('[SceneManager] First scene generation (intro). No player action.');
        playerActionJa = '(導入シーン)'; // 最初のシーン生成を示す（内部処理用）
    }

    // --- 処理中表示開始 ---
    if (typeof window.showLoadingModal === 'function') window.showLoadingModal(true);
    // AbortController は geminiClient が対応していないため一旦削除
    // window.cancelRequested = false;

    try {
        // --- 1) プレイヤー行動を英訳 (必要な場合) ---
        // Geminiに直接日本語で指示を出すことも可能だが、プロンプト全体を英語に統一した方が
        // 安定する可能性があるため、既存ロジックを踏襲して英訳する。
        if (playerActionJa && playerActionJa !== '(導入シーン)') {
            try {
                playerActionEn = await generateEnglishTranslation(playerActionJa); // ★ Gemini で翻訳
                console.log(`[SceneManager] Player action translated to EN: ${playerActionEn}`);
            } catch (translateError) {
                console.error('[SceneManager] Failed to translate player action:', translateError);
                // 翻訳失敗時は日本語のまま使うか、エラーとするか選択
                // playerActionEn = playerActionJa; // 例: 日本語のまま使う
                throw new Error(`行動の内部翻訳に失敗しました: ${translateError.message}`);
            }
        }

        // --- 2) Gemini API に渡すプロンプトと履歴の準備 ---
        const currentModelId = document.getElementById('model-select')?.value;
        if (!currentModelId) {
            throw new Error('使用するモデルが選択されていません。');
        }

        // --- GeminiApiClient の履歴を使う場合 ---
        // initializeHistory で初期プロンプトを設定し、generateContent で続きを生成
        // (注意: このクライアントは履歴がどんどん増えるので、どこかでリセット/要約が必要)

        // --- 毎回履歴を組み立てて initializeHistory する方法 ---
        const messagesForGemini = [];

        // System Prompt (役割定義)
        // ★ Gemini向けに調整。「あなたはTRPGのGMです」は維持しつつ、出力形式の指示などを明確化。
        let systemPrompt = `You are an experienced and kind TRPG Game Master. Your goal is to create an engaging story based on the user's actions and the scenario context. Follow these rules strictly:
1.  **Output language:** Respond ONLY in Japanese. 日本語で応答してください.
2.  **Consistency:** Maintain consistency with the scenario outline, party members, previous scenes, and section goals.
3.  **Engage the player:** Describe the scene vividly, include NPC dialogue or party member interactions occasionally, and always end by prompting the player for their next action. Avoid meta-narrative (do not act as a GM explicitly telling rules or mechanics).
4.  **Be Creative:** Generate interesting events and descriptions based on the player's input, even for unexpected actions. Provide subtle hints if the player seems stuck.
5.  **Format:** Use simple descriptive text. Do not use markdown tags for decoration (like ** or *). Use standard Japanese punctuation.`;

        // セクション情報を追加 (英語で)
        const wd = window.currentScenario?.wizardData || {};
        const sections = wd.sections || [];
        if (sections.length > 0) {
            systemPrompt += '\n\n--- Scenario Sections & Goals ---';
            const sortedSections = [...sections].sort((a, b) => (a.number || 0) - (b.number || 0));
            sortedSections.forEach((sec) => {
                const conditionEn = sec.conditionEn || '(Condition not available)'; // 英語条件がない場合
                systemPrompt += `\nSection ${sec.number} (${
                    sec.cleared ? 'Cleared' : 'Uncleared'
                }): ${conditionEn}`;
            });
            // 次の目標を強調
            const firstUncleared = sortedSections.find((s) => !s.cleared);
            if (firstUncleared) {
                systemPrompt += `\n\nCURRENT GOAL (Section ${firstUncleared.number}): ${
                    firstUncleared.conditionEn || '(Condition not available)'
                }`;
            } else {
                systemPrompt += `\n\nALL SECTIONS CLEARED. Proceed towards the ending.`;
            }
            systemPrompt += '\n------------------------------';
        }

        // messagesForGemini.push({ role: "system", parts: [{ text: systemPrompt }] }); // System Role は contents では使わないことが多い

        // ★ contents 配列を構築 (System Prompt は初回の user メッセージに含めるか、別途考慮)
        // Geminiは role: system を直接サポートしないため、user/model の交互形式で履歴を再現
        let historyContents = [];

        // シナリオ概要とパーティ情報 (最初の User ターンとして追加)
        let initialContext = '';
        if (window.currentScenario) {
            const scenarioWd = window.currentScenario.wizardData || {};
            const summaryEn =
                scenarioWd.scenarioSummaryEn?.trim() ||
                scenarioWd.scenarioSummary?.trim() ||
                '(No scenario summary)';
            initialContext += `Scenario Outline:\n${summaryEn}\n\n`;
            if (scenarioWd.party && scenarioWd.party.length > 0) {
                const partyTextEn = buildPartyInsertionTextEn(scenarioWd.party); // ★ 英語でパーティ情報を生成するヘルパーが必要
                initialContext += `Party Information:\n${partyTextEn}\n\n`;
            }
        }
        // System Prompt もここに含める
        initialContext += `Game Master Instructions:\n${systemPrompt}\n\nNow, begin the story or respond to the player's action.`;

        historyContents.push({ role: 'user', parts: [{ text: initialContext }] });
        // 最初の応答 (導入シーンなど) を model 応答として追加する必要があるかも
        if (window.scenes.length === 0) {
            // 導入シーンを生成させるための最初の model 応答 (空など)
            historyContents.push({ role: 'model', parts: [{ text: '物語を開始します。' }] }); // 仮
        }

        // 過去シーンの履歴を追加 (要約 + 直近の詳細)
        // (既存のロジックを流用し、user/model の交互形式に)
        const actionCount = window.scenes.filter((sc) => sc.action?.content?.trim()).length;
        const summaryChunkEnd = Math.max(-1, Math.floor((actionCount - 15) / 10)); // -1 から開始できるように調整
        for (let i = 0; i <= summaryChunkEnd; i++) {
            if (window.sceneSummaries[i]?.en) {
                // 英語要約を優先
                // 要約は Model の応答として追加
                historyContents.push({
                    role: 'model',
                    parts: [
                        {
                            text: `(Summary of previous events up to action ${(i + 1) * 10}):\n${
                                window.sceneSummaries[i].en
                            }`,
                        },
                    ],
                });
            } else if (window.sceneSummaries[i]?.ja) {
                historyContents.push({
                    role: 'model',
                    parts: [
                        {
                            text: `(過去の出来事の要約 ${(i + 1) * 10}行動目まで):\n${
                                window.sceneSummaries[i].ja
                            }`,
                        },
                    ],
                });
            }
        }

        const detailStartIndex = (summaryChunkEnd + 1) * 10;
        let detailActionCount = 0;
        for (const scn of window.scenes) {
            let actionAdded = false;
            if (scn.action?.content?.trim()) {
                detailActionCount++;
                if (detailActionCount > detailStartIndex) {
                    const actionTextEn = scn.action.content_en?.trim() || scn.action.content; // 英語優先
                    historyContents.push({
                        role: 'user',
                        parts: [{ text: `Player Action: ${actionTextEn}` }],
                    });
                    actionAdded = true;
                }
            }
            // アクションに対応するシーンを追加 (actionCount >= detailStartIndex)
            if (
                detailActionCount >= detailStartIndex ||
                (!scn.action?.content?.trim() &&
                    detailStartIndex === 0 &&
                    historyContents.length <= 2)
            ) {
                // 最初のアクションがない場合も考慮
                if (
                    actionAdded ||
                    detailActionCount > detailStartIndex ||
                    historyContents.length <= 2
                ) {
                    // User の後、または開始直後
                    const sceneTextEn = scn.content_en?.trim() || scn.content; // 英語優先
                    historyContents.push({ role: 'model', parts: [{ text: sceneTextEn }] });
                }
            }
        }

        // --- 3) 今回のプレイヤー行動を追加 ---
        // (導入シーン生成の場合は playerActionEn は空)
        if (playerActionEn) {
            historyContents.push({
                role: 'user',
                parts: [{ text: `Player Action: ${playerActionEn}` }],
            });
        } else if (!hasIntro) {
            // 導入シーン生成を促すメッセージ（もし historyContents が user で終わっていたら不要かも）
            if (
                historyContents.length === 0 ||
                historyContents[historyContents.length - 1].role === 'model'
            ) {
                historyContents.push({
                    role: 'user',
                    parts: [
                        {
                            text: 'Generate the opening scene based on the scenario outline and party.',
                        },
                    ],
                });
            }
        }

        // --- 4) Gemini API 呼び出し ---
        // (履歴は毎回 initializeHistory で設定し、最後のユーザー入力を prompt として渡す形式も検討可能)
        // 今回は historyContents を送信する想定でクライアントを呼び出す
        console.log(
            '[SceneManager] Preparing to call Gemini API with history. Final user input:',
            historyContents[historyContents.length - 1]?.parts[0]?.text
        );

        // 既存の履歴を無視して今回組み立てたものを送る場合
        // window.geminiClient.initializeHistory([]); // クライアント履歴をリセットする場合
        // 最後のユーザーメッセージを prompt として渡す
        // const lastUserMessage = historyContents.pop();
        // const promptForApi = lastUserMessage.parts[0].text;
        // window.geminiClient.initializeHistory(historyContents); // 組み立てた履歴を設定
        // const rawSceneEn = await window.geminiClient.generateContent(promptForApi, currentModelId);

        // ★ GeminiApiClient が履歴全体を受け取る前提での呼び出し
        // (generateContent 内で historyContents を使うようにクライアント側も修正が必要な場合あり)
        // この例では、クライアントが内部の conversationHistory を使うと仮定し、
        // 必要な履歴をクライアントに追加していくアプローチを試す (ただし複雑)

        // --- よりシンプルなアプローチ: 毎回履歴を構築し、クライアントに渡す ---
        // (GeminiApiClient の generateContent が履歴を受け取れるように修正が必要な場合あり)
        // この例では、クライアントは内部履歴を使わず、渡された履歴で毎回APIを呼ぶと仮定
        const responseTextEn = await callGeminiWithFullHistory(historyContents, currentModelId);
        let rawSceneEn = responseTextEn; // 応答は英語と仮定

        // --- 5) 日本語への翻訳 (応答が英語の場合) ---
        let finalSceneJa = rawSceneEn; // デフォルトは英語応答
        let finalSceneEn = rawSceneEn; // 英語結果も保持

        if (rawSceneEn && !containsJapanese(rawSceneEn)) {
            // 応答が日本語でなければ翻訳
            console.log('[SceneManager] Translating API response to Japanese...');
            try {
                finalSceneJa = await generateJapaneseTranslation(rawSceneEn); // ★ Gemini で翻訳
                console.log(
                    `[SceneManager] Translation result (JA): ${finalSceneJa.substring(0, 100)}...`
                );
            } catch (translateError) {
                console.error(
                    '[SceneManager] Failed to translate API response to Japanese:',
                    translateError
                );
                // 翻訳失敗時は英語のまま表示
                finalSceneJa = rawSceneEn + '\n\n(日本語への翻訳に失敗しました)';
            }
        } else {
            // 応答が既に日本語だった場合、英語訳を生成する
            console.log(
                '[SceneManager] API response seems to be Japanese. Generating English translation...'
            );
            try {
                finalSceneEn = await generateEnglishTranslation(finalSceneJa); // ★ Gemini で翻訳
                console.log(
                    `[SceneManager] Translation result (EN): ${finalSceneEn.substring(0, 100)}...`
                );
            } catch (translateError) {
                console.error(
                    '[SceneManager] Failed to generate English translation:',
                    translateError
                );
                finalSceneEn = '(Translation to English failed)'; // 翻訳失敗を示す
            }
        }

        // --- 6) 結果をDBとメモリに保存 ---
        const sceneId = 'scene_' + Date.now() + '_' + Math.random().toString(16).substring(2, 8); // よりユニークなID
        const sceneRecord = {
            scenarioId: window.currentScenarioId || 0,
            type: 'scene',
            sceneId: sceneId,
            content: finalSceneJa, // 日本語本文
            content_en: finalSceneEn, // 英語本文
            actionContent: playerActionJa !== '(導入シーン)' ? playerActionJa : '', // プレイヤー行動(日本語)
            actionContent_en: playerActionEn, // プレイヤー行動(英語)
            prompt: '', // 画像プロンプトは後で生成
            dataUrl: '', // 画像データは別レコード
        };
        const newEntryId = await window.addSceneEntry(sceneRecord); // DB保存
        sceneRecord.entryId = newEntryId; // DBから返されたIDを設定
        console.log(`[SceneManager] New scene entry saved to DB with entryId: ${newEntryId}`);

        // メモリ上のシーンリストにも追加
        const newSceneObject = {
            sceneId: sceneId,
            scenarioId: sceneRecord.scenarioId,
            content: finalSceneJa,
            content_en: finalSceneEn,
            action: {
                content: sceneRecord.actionContent,
                content_en: sceneRecord.actionContent_en,
            },
            images: [], // 画像はまだない
        };
        window.scenes.push(newSceneObject);
        console.log(
            `[SceneManager] New scene added to memory. Total scenes: ${window.scenes.length}`
        );

        // --- 7) 挿絵用プロンプト生成 (非同期で実行しても良いかも) ---
        try {
            const imagePromptText = await generateImagePromptFromScene(finalSceneJa); // ★ Gemini で生成
            if (imagePromptText) {
                sceneRecord.prompt = imagePromptText; // DBレコードにプロンプト追加
                await window.updateSceneEntry(sceneRecord); // DB更新
                console.log(
                    `[SceneManager] Image prompt generated and saved for scene ${sceneId}.`
                );
            }
        } catch (imgPromptError) {
            console.error('[SceneManager] Failed to generate image prompt:', imgPromptError);
            // エラーでも処理は続行
        }

        // --- 8) シナリオの最終更新日時を更新 ---
        if (window.currentScenario) {
            await window.updateScenario({
                ...window.currentScenario,
                updatedAt: new Date().toISOString(),
            });
            console.log('[SceneManager] Scenario updatedAt timestamp updated.');
        }

        // --- 9) セクション達成チェック ---
        await checkSectionClear(playerActionJa, finalSceneJa); // ★ Gemini で判定

        // --- 10) シーン要約処理 ---
        await handleSceneSummaries(); // ★ Gemini で要約

        // --- 11) UIの再描画 ---
        if (typeof window.updateSceneHistory === 'function') window.updateSceneHistory();
        if (typeof window.showLastScene === 'function') window.showLastScene();
        if (typeof window.renderItemChips === 'function') await window.renderItemChips(); // アイテム表示更新

        // --- 12) 回答候補のクリア＆自動生成 (オプション) ---
        const candidatesContainer = document.getElementById('action-candidates-container');
        if (candidatesContainer) {
            candidatesContainer.innerHTML = ''; // クリア
        }
        const autoGenCheckbox = document.getElementById('auto-generate-candidates-checkbox');
        if (autoGenCheckbox?.checked && typeof window.onGenerateActionCandidates === 'function') {
            console.log('[SceneManager] Auto-generating action candidates...');
            window.onGenerateActionCandidates(); // ★ Gemini で生成するように修正が必要
        }
    } catch (e) {
        // エラー処理
        console.error('[SceneManager] シーン取得または関連処理でエラー:', e);
        if (e.name === 'AbortError') {
            // AbortController がないため、この分岐は不要になるかも
            console.warn('[SceneManager] シーン取得キャンセル');
            if (typeof showToast === 'function') showToast('処理をキャンセルしました。');
        } else {
            if (typeof alert === 'function') alert('シーンの取得に失敗しました:\n' + e.message);
            // エラー内容をトースト表示する方が良いかも
            if (typeof showToast === 'function') showToast(`エラー: ${e.message}`);
        }
    } finally {
        // 処理中表示終了
        if (typeof window.showLoadingModal === 'function') window.showLoadingModal(false);
    }
};

/**
 * ★ ヘルパー関数: 組み立てた履歴全体を使ってGemini APIを呼び出す
 * (GeminiApiClientが履歴全体を受け取るか、毎回初期化する方式の場合)
 * @param {Array<object>} historyContents 送信する contents 配列
 * @param {string} modelId 使用するモデルID
 * @returns {Promise<string>} 生成されたテキスト (英語想定)
 */
async function callGeminiWithFullHistory(historyContents, modelId) {
    if (!window.geminiClient) throw new Error('Gemini client not initialized.');

    // ここでは例として、クライアントの generateContent が履歴を直接受け取ると仮定
    // もしクライアントが内部履歴を使うなら、呼び出し前に initializeHistory する
    // window.geminiClient.initializeHistory(historyContents.slice(0, -1)); // 最後の user 入力以外を履歴に設定
    // const lastUserContent = historyContents[historyContents.length - 1]?.parts[0]?.text || "";
    // return await window.geminiClient.generateContent(lastUserContent, modelId);

    // --- 以下、クライアントが履歴を引数で受け取る場合の仮実装 ---
    // (GeminiApiClient に このようなメソッドを追加する必要がある)
    /*
     try {
          const responseText = await window.geminiClient.generateContentWithHistory(historyContents, modelId);
          return responseText;
     } catch (error) {
          throw error;
     }
     */

    // --- 現状の GeminiApiClient を使い、毎回履歴をリセットする例 ---
    try {
        const lastUserMessage = historyContents.pop(); // 最後のユーザー入力を取り出す
        if (!lastUserMessage || lastUserMessage.role !== 'user') {
            throw new Error('Invalid history structure: Last element is not a user message.');
        }
        const prompt = lastUserMessage.parts[0]?.text || '';

        // ★★★ 注意: 履歴が多い場合、毎回initializeHistoryは非効率＆トークン制限の可能性 ★★★
        // 本来はクライアント側で適切に履歴を管理・送信するのが望ましい
        window.geminiClient.initializeHistory(historyContents); // 最後のユーザー入力 *以外* を履歴として設定

        // 最後のユーザープロンプトで生成
        const generatedText = await window.geminiClient.generateContent(prompt, modelId);

        // ★重要: 生成後、クライアントの内部履歴に今回のやり取りが追加されている。
        // この履歴を次回以降どう使うか、という設計が必要になる。
        // (例えば、次回呼び出し前に getHistory() で取得し、不要部分を削って再度 initializeHistory するなど)
        // ここでは、次回の呼び出しでまた initializeHistory される前提とする。

        return generatedText;
    } catch (error) {
        throw error;
    }
}

// --------------------------------------------------
// ▼ 英日翻訳系 (★ Gemini API 使用に修正)
// --------------------------------------------------

/** 日本語テキストを英語に翻訳 */
async function generateEnglishTranslation(japaneseText) {
    if (!japaneseText?.trim()) return '';
    console.log('[SceneManager] Translating to English:', japaneseText.substring(0, 50) + '...');
    if (!window.geminiClient) throw new Error('API client not available for translation.');

    const currentModelId = document.getElementById('model-select')?.value;
    if (!currentModelId) throw new Error('Model not selected for translation.');

    // 翻訳用のプロンプト
    // System Prompt は使わず、User Prompt 内で指示する方が Gemini では一般的
    const prompt = `Translate the following Japanese text accurately and naturally into English. Output only the translated English text, without any additional explanation or conversational text.\n\nJapanese Text:\n---\n${japaneseText}\n---\n\nEnglish Translation:`;

    try {
        // 翻訳タスクなので履歴は不要。毎回リセット。
        window.geminiClient.initializeHistory([]);
        const translatedText = await window.geminiClient.generateContent(prompt, currentModelId);
        // 応答に余計な前置きが含まれる場合があるので除去する処理（任意）
        return translatedText.trim();
    } catch (error) {
        console.error('[SceneManager] English translation failed:', error);
        throw error; // エラーを再スロー
    }
}

/** 英語テキストを日本語に翻訳 */
async function generateJapaneseTranslation(englishText) {
    if (!englishText?.trim()) return '';
    console.log('[SceneManager] Translating to Japanese:', englishText.substring(0, 50) + '...');
    if (!window.geminiClient) throw new Error('API client not available for translation.');

    const currentModelId = document.getElementById('model-select')?.value;
    if (!currentModelId) throw new Error('Model not selected for translation.');

    const prompt = `以下の英語のテキストを、自然で正確な日本語に翻訳してください。翻訳された日本語のテキストのみを出力し、追加の説明や会話文は含めないでください。\n\nEnglish Text:\n---\n${englishText}\n---\n\n日本語訳:`;

    try {
        window.geminiClient.initializeHistory([]);
        const translatedText = await window.geminiClient.generateContent(prompt, currentModelId);
        return translatedText.trim();
    } catch (error) {
        console.error('[SceneManager] Japanese translation failed:', error);
        throw error; // エラーを再スロー
    }
}

// --------------------------------------------------
// ▼ セクション達成チェック (★ Gemini API 使用に修正)
// --------------------------------------------------
async function checkSectionClear(latestActionJa, latestSceneJa) {
    console.log('[SceneManager] Checking section clear condition...');
    const wd = window.currentScenario?.wizardData;
    if (!wd?.sections) return; // セクションがなければ何もしない

    const sortedSections = [...wd.sections].sort((a, b) => (a.number || 0) - (b.number || 0));
    const firstUncleared = sortedSections.find((s) => !s.cleared);
    if (!firstUncleared) {
        console.log('[SceneManager] All sections already cleared.');
        return; // 全てクリア済みなら何もしない
    }

    // ★ conditionEn を使う（なければ日本語）
    const conditionText = firstUncleared.conditionEn || firstUncleared.condition || '(条件不明)';
    // シナリオ概要も英語を優先
    const scenarioSummary = wd.scenarioSummaryEn || wd.scenarioSummary || '(概要なし)';
    // 行動とシーンも英語を使う（翻訳済みのはず）
    const latestActionEn = await generateEnglishTranslation(latestActionJa); // 最新の状態を再翻訳（or 履歴から取得）
    const latestSceneEn = await generateEnglishTranslation(latestSceneJa);

    if (!window.geminiClient) {
        console.error('[SceneManager] Cannot check section clear: Gemini client not available.');
        return;
    }

    const currentModelId = document.getElementById('model-select')?.value;
    if (!currentModelId) {
        console.error('[SceneManager] Cannot check section clear: Model not selected.');
        return;
    }

    // Gemini に判定させるためのプロンプト (英語)
    const prompt = `You are an AI assistant for a TRPG. Your task is to determine if a scenario section's goal has been met based on the latest events. Respond ONLY with "YES" or "NO".

Scenario Outline:
${scenarioSummary}

Current Goal (Section ${firstUncleared.number}):
"${conditionText}"

Latest Player Action:
${latestActionEn || '(No action)'}

Resulting Scene:
${latestSceneEn}

Based *only* on the latest action and resulting scene, has the Current Goal "${conditionText}" been achieved?
Answer strictly with YES or NO. If unsure, lean towards YES.`;

    console.log('[SceneManager] Asking Gemini for section clear judgment...');
    try {
        window.geminiClient.initializeHistory([]); // 履歴リセット
        const responseText = await window.geminiClient.generateContent(prompt, currentModelId);
        const answer = responseText.trim().toUpperCase();
        console.log(
            `[SceneManager] Gemini judgment for section ${firstUncleared.number}: ${answer}`
        );

        if (answer.startsWith('YES')) {
            console.log(`[SceneManager] Section ${firstUncleared.number} marked as cleared.`);
            firstUncleared.cleared = true;
            // window.currentScenario の更新 (wizardData.sections を更新)
            if (window.currentScenario && window.currentScenario.wizardData) {
                window.currentScenario.wizardData.sections = sortedSections; // 更新された配列をセット
                await window.updateScenario(window.currentScenario); // DB保存
                if (typeof showToast === 'function')
                    showToast(`セクション ${firstUncleared.number} をクリアしました！`);
                // クリアしたらエンディングボタン表示更新
                if (typeof window.refreshEndingButtons === 'function')
                    window.refreshEndingButtons();
            }
        } else {
            console.log(`[SceneManager] Section ${firstUncleared.number} judged as not cleared.`);
        }
    } catch (err) {
        console.error('[SceneManager] セクション達成判定API失敗:', err);
        // 失敗してもゲームは続行する
        if (typeof showToast === 'function')
            showToast(`セクション達成判定中にエラー: ${err.message}`);
    }
}

// --------------------------------------------------
// ▼ 要約作成 (★ Gemini API 使用に修正)
// --------------------------------------------------
async function handleSceneSummaries() {
    console.log('[SceneManager] Handling scene summaries...');
    const actionCount = window.scenes.filter((s) => s.action?.content?.trim()).length;
    const summaryInterval = 10; // 要約するアクションの間隔
    const summaryStartThreshold = 15; // このアクション数を超えたら要約開始

    if (actionCount < summaryStartThreshold) {
        console.log('[SceneManager] Not enough actions yet for summarization.');
        return; // まだ要約対象ではない
    }

    // 次に要約すべきチャンクインデックスを計算
    // 例: actionCount=15 -> chunk=0 (action 1-10), actionCount=25 -> chunk=1 (action 11-20)
    const targetChunkIndex =
        Math.floor((actionCount - summaryStartThreshold + summaryInterval) / summaryInterval) - 1;

    // 既にそのチャンクの要約が存在するかチェック
    if (targetChunkIndex < 0 || window.sceneSummaries[targetChunkIndex]) {
        console.log(
            `[SceneManager] Summary for chunk ${targetChunkIndex} already exists or not needed yet.`
        );
        return; // 既に要約済みか、まだ不要
    }

    console.log(
        `[SceneManager] Generating summary for chunk ${targetChunkIndex} (actions ${
            targetChunkIndex * summaryInterval + 1
        } to ${(targetChunkIndex + 1) * summaryInterval}).`
    );

    // 要約対象のテキストを収集 (英語優先)
    const startActionIndex = targetChunkIndex * summaryInterval;
    const endActionIndex = (targetChunkIndex + 1) * summaryInterval;
    let textForSummaryEn = '';
    let textForSummaryJa = ''; // 日本語も保持（フォールバック用）
    let currentActionIndex = 0;
    for (const scn of window.scenes) {
        let isAction = false;
        if (scn.action?.content?.trim()) {
            currentActionIndex++;
            isAction = true;
        }
        if (currentActionIndex > startActionIndex && currentActionIndex <= endActionIndex) {
            if (isAction) {
                textForSummaryEn += `\nPlayer: ${scn.action.content_en || scn.action.content}\n`;
                textForSummaryJa += `\nプレイヤー: ${scn.action.content}\n`;
            }
            textForSummaryEn += `GM: ${scn.content_en || scn.content}\n`;
            textForSummaryJa += `GM: ${scn.content}\n`;
        }
        if (currentActionIndex >= endActionIndex) break; // 対象範囲を超えたら終了
    }

    if (!textForSummaryEn.trim()) {
        console.warn(`[SceneManager] No text found for summary chunk ${targetChunkIndex}.`);
        // 空の要約を記録するか、何もしないか
        window.sceneSummaries[targetChunkIndex] = { en: '(No content)', ja: '(内容なし)' };
        // DBにも保存するなら
        // await window.addSceneSummaryRecord({ chunkIndex: targetChunkIndex, content_en: "(No content)", content_ja: "(内容なし)" });
        return;
    }

    try {
        // Gemini で英語要約を生成
        const enSummary = await generateSummaryWithLimit(textForSummaryEn, 5, 'en'); // 5行で英語要約

        // Gemini で日本語要約を生成
        const jaSummary = await generateSummaryWithLimit(textForSummaryJa, 5, 'ja'); // 5行で日本語要約

        // 結果をDBとメモリに保存
        const sumRec = {
            chunkIndex: targetChunkIndex,
            content_en: enSummary,
            content_ja: jaSummary,
        };
        await window.addSceneSummaryRecord(sumRec); // DB保存
        window.sceneSummaries[targetChunkIndex] = { en: enSummary, ja: jaSummary }; // メモリ更新
        console.log(`[SceneManager] Summary for chunk ${targetChunkIndex} generated and saved.`);
    } catch (error) {
        console.error(
            `[SceneManager] Failed to generate summary for chunk ${targetChunkIndex}:`,
            error
        );
        // エラー発生時、要約なしとしてマークするか？
        window.sceneSummaries[targetChunkIndex] = {
            en: '(Summarization failed)',
            ja: '(要約失敗)',
        };
        // 必要ならDBにも失敗記録を保存
        // await window.addSceneSummaryRecord({ chunkIndex: targetChunkIndex, content_en: "(Summarization failed)", content_ja: "(要約失敗)" });
        if (typeof showToast === 'function')
            showToast(`シーンの要約生成中にエラー: ${error.message}`);
    }
}

/** 指定されたテキストを指定行数で要約 (★ Gemini API 使用) */
async function generateSummaryWithLimit(text, lines = 5, lang = 'en') {
    if (!text?.trim()) return '';
    console.log(
        `[SceneManager] Generating ${lang} summary (${lines} lines) for text: ${text.substring(
            0,
            100
        )}...`
    );
    if (!window.geminiClient) throw new Error('API client not available for summary.');

    const currentModelId = document.getElementById('model-select')?.value;
    if (!currentModelId) throw new Error('Model not selected for summary.');

    let prompt = '';
    if (lang === 'ja') {
        prompt = `以下のTRPGのプレイ記録を、重要な出来事を中心に${lines}行程度の自然な日本語で要約してください。箇条書きではなく、文章としてまとめてください。\n\nプレイ記録:\n---\n${text}\n---\n\n要約(日本語):`;
    } else {
        prompt = `Summarize the following TRPG play log into a concise paragraph of about ${lines} lines in natural English, focusing on the key events. Do not use bullet points.\n\nPlay Log:\n---\n${text}\n---\n\nSummary (English):`;
    }

    try {
        window.geminiClient.initializeHistory([]); // 履歴リセット
        const summaryText = await window.geminiClient.generateContent(prompt, currentModelId);
        return summaryText.trim();
    } catch (error) {
        console.error(`[SceneManager] ${lang.toUpperCase()} summary generation failed:`, error);
        throw error; // エラーを再スロー
    }
}

// --------------------------------------------------
// ▼ 挿絵用英語プロンプト生成 (★ Gemini API 使用に修正)
// --------------------------------------------------
async function generateImagePromptFromScene(sceneTextJa) {
    if (!sceneTextJa?.trim()) return '';
    console.log(
        '[SceneManager] Generating image prompt from scene (JA):',
        sceneTextJa.substring(0, 100) + '...'
    );
    if (!window.geminiClient) {
        console.warn('[SceneManager] Cannot generate image prompt: Gemini client not available.');
        return ''; // APIクライアントがない場合は空文字を返す
    }

    const currentModelId = document.getElementById('model-select')?.value;
    if (!currentModelId) {
        console.warn('[SceneManager] Cannot generate image prompt: Model not selected.');
        return '';
    }

    // Gemini 向けプロンプト (英語でのキーワード抽出を指示)
    const prompt = `Extract key visual elements from the following Japanese scene description and list them as concise English keywords suitable for an image generation AI. Focus on characters, objects, setting, and atmosphere. Do not write sentences, just comma-separated keywords or short phrases.

Japanese Scene:
---
${sceneTextJa}
---

English Keywords:`;

    try {
        window.geminiClient.initializeHistory([]); // 履歴リセット
        const keywords = await window.geminiClient.generateContent(prompt, currentModelId);
        console.log('[SceneManager] Generated image prompt keywords:', keywords);
        // 簡単な整形 (改行を削除し、カンマ区切りを保証するなど)
        return keywords.replace(/\n/g, ', ').replace(/, ,/g, ',').trim();
    } catch (e) {
        console.error('[SceneManager] generateImagePromptFromScene失敗:', e);
        if (typeof showToast === 'function') showToast(`画像プロンプト生成エラー: ${e.message}`);
        return ''; // エラー時は空文字
    }
}

// --------------------------------------------------
// ▼ 最新シーンからカード化情報を抽出 (★ Gemini API 使用に修正)
// --------------------------------------------------
async function getLastSceneSummary() {
    // 関数名は既存のまま
    console.log('[SceneManager] Extracting card information from last scene...');
    const lastSceneEntry = [...window.scenes].slice(-1)[0] || null;
    if (!lastSceneEntry) {
        console.log('[SceneManager] No last scene found.');
        return 'シーンがありません。';
    }

    // 日本語のシーンテキストを使用
    const textJa = lastSceneEntry.content;
    if (!textJa?.trim()) {
        console.log('[SceneManager] Last scene content is empty.');
        return '最新シーンの内容が空です。';
    }

    if (!window.geminiClient) {
        console.error('[SceneManager] Cannot extract card info: Gemini client not available.');
        return '(APIクライアントエラー)';
    }
    const currentModelId = document.getElementById('model-select')?.value;
    if (!currentModelId) {
        console.error('[SceneManager] Cannot extract card info: Model not selected.');
        return '(モデル未選択)';
    }

    // Gemini向けプロンプト (JSON形式での出力を試みる)
    const prompt = `以下の日本語のシーン記述から、最も重要と思われるエンティティ（キャラクター、アイテム、またはモンスター）を1つだけ抽出し、以下のJSON形式で情報を整理してください。該当するものがなければ空のJSONオブジェクト {} を返してください。

{
  "name": "抽出した名前 (日本語)",
  "type": "キャラクター or アイテム or モンスター",
  "appearance": "外見や特徴の簡単な説明 (日本語, 50文字程度)"
}

シーン記述:
---
${textJa}
---

JSON出力:`;

    try {
        window.geminiClient.initializeHistory([]); // 履歴リセット
        const responseText = await window.geminiClient.generateContent(prompt, currentModelId);
        console.log('[SceneManager] Raw response for card info extraction:', responseText);

        // 応答からJSON部分を抽出してパース (応答がJSONだけとは限らないため)
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                const parsedJson = JSON.parse(jsonMatch[0]);
                if (parsedJson.name && parsedJson.type && parsedJson.appearance) {
                    // 抽出成功
                    console.log('[SceneManager] Extracted card info:', parsedJson);
                    // 表示用に整形 (元の関数の戻り値に合わせて)
                    return `【名前】${parsedJson.name}\n【タイプ】${parsedJson.type}\n【外見】${parsedJson.appearance}`;
                } else {
                    console.log('[SceneManager] Extracted JSON is incomplete or empty.');
                    return '(抽出対象が見つかりませんでした)';
                }
            } catch (parseError) {
                console.error(
                    '[SceneManager] Failed to parse JSON response for card info:',
                    parseError,
                    'Response was:',
                    responseText
                );
                // パース失敗時は応答テキストをそのまま返すか、エラーを示す
                return `(情報抽出エラー: ${responseText.substring(0, 100)}...)`;
            }
        } else {
            console.log('[SceneManager] No JSON object found in response for card info.');
            return '(抽出対象が見つかりませんでした)';
        }
    } catch (e) {
        console.error('[SceneManager] カード情報抽出失敗:', e);
        return `(抽出APIエラー: ${e.message})`;
    }
}

// --- 既存のヘルパー関数 (containsJapanese, buildCardDescription など) ---
// 省略せずに記述する必要がありますが、ここではコードの重複を避けるため省略します。

/** 日本語が含まれるかチェック */
function containsJapanese(text) {
    if (!text) return false;
    // 日本語のひらがな、カタカナ、漢字の範囲をチェック
    return /[ぁ-んァ-ン一-龯]/.test(text);
}

/** パーティ情報から英語の説明文を生成 (仮実装) */
function buildPartyInsertionTextEn(party) {
    // この関数は各カードの英語情報を参照して組み立てる必要がある
    // ここでは簡単な例を示す
    let txt = 'Party Members:\n';
    party.forEach((p) => {
        txt += `- Name: ${p.name || 'Unknown'}, Type: ${p.type || 'Unknown'}, Role: ${
            p.role || 'None'
        }\n`;
        txt += `  Details: ${p.caption || p.special || 'No details'}\n`; // 英語の説明が必要
    });
    return txt;
}

// ... 他の既存ヘルパー関数も省略せずに記述 ...

console.log('[SceneManager] sceneManager.js loaded.'); // 読み込み完了ログ
