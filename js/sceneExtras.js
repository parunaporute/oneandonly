/********************************
 * sceneExtras.js
 * エンディング、エンティティ(アイテム/登場人物)、パーティ表示など
 * 補助的な機能。API呼び出しを Gemini API に変更。
 ********************************/

// --- 依存関数 (他ファイルまたはグローバルスコープで定義されている想定) ---
// window.multiModalOpen (from multiModal.js)
// window.DOMPurify (external library)
// window.showToast (from common.js)
// window.showLoadingModal (from sceneUI.js or common.js)
// window.currentScenario, window.currentScenarioId, window.scenes, window.sections, window.geminiClient, window.geminiApiKey (from sceneGlobals.js or menu.js)
// window.getEnding, window.saveEnding, window.deleteEnding, window.getEntitiesByScenarioId, window.addEntity, window.updateEntity, window.deleteEntity, window.updateScenario (from indexedDB.js or global)
// window.decompressCondition (from sceneUtils.js or common.js)
// window.renderItemChips (from sceneUI.js)
// pako (external library, for decompressCondition)

/* =============================
   エンディング関連
============================= */

/**
 * 指定タイプのエンディングモーダルを表示 (既存がなければ生成)
 * @param {'clear' | 'bad'} type エンディングタイプ
 */
window.showEndingModal = async function (type) {
    console.log(`[SceneExtras] Showing ending modal for type: ${type}`);
    const scenarioId = window.currentScenario?.scenarioId;
    if (!scenarioId) {
        console.warn('[SceneExtras] Cannot show ending modal: Scenario ID not found.');
        if (typeof alert === 'function') alert('シナリオが選択されていません。');
        return;
    }

    try {
        // 既存のエンディングをDBから取得
        const existing = await window.getEnding(scenarioId, type); // DB関数
        if (existing?.story) {
            console.log('[SceneExtras] Existing ending found in DB.');
            openEndingModal(type, existing.story); // 既存のものを表示
        } else {
            console.log('[SceneExtras] No existing ending found. Generating new one...');
            // なければ新規生成
            const newStory = await generateEndingStory(type); // ★ Gemini で生成
            if (!newStory) {
                console.warn('[SceneExtras] Ending generation returned empty.');
                // エラーメッセージは generateEndingStory 内で表示される想定
                return;
            }
            await window.saveEnding(scenarioId, type, newStory); // DB保存
            console.log('[SceneExtras] New ending generated and saved.');
            openEndingModal(type, newStory); // 生成したものを表示
        }
    } catch (error) {
        console.error(`[SceneExtras] Error showing/generating ending (type: ${type}):`, error);
        if (typeof showToast === 'function')
            showToast(`エンディング処理中にエラー: ${error.message}`);
    }
};

/**
 * エンディングモーダルを multiModal で開く
 * @param {'clear' | 'bad'} type エンディングタイプ
 * @param {string} story 表示するエンディングストーリー
 */
window.openEndingModal = function (type, story) {
    const titleText = type === 'clear' ? 'クリアエンディング' : 'バッドエンディング';
    console.log(`[SceneExtras] Opening multiModal for ending: ${titleText}`);

    window.multiModalOpen({
        id: `ending-modal-${type}`, // モーダルにID付与
        title: titleText,
        contentHtml: `
            <pre id="ending-modal-story-content" style="white-space: pre-wrap; font-size: 0.9rem; max-height: 70vh; overflow-y: auto; background-color: rgba(255,255,255,0.05); padding: 10px; border-radius: 4px;">${DOMPurify.sanitize(
                story
            )}</pre>
        `,
        showCloseButton: true,
        closeOnOutsideClick: true,
        appearanceType: 'center',
        additionalButtons: [
            {
                id: `ending-regenerate-btn-${type}`, // ボタンにID
                label: '再生成',
                onClick: () => {
                    // 再生成ボタンが押されたときの処理
                    console.log(`[SceneExtras] Regenerate ending button clicked for type: ${type}`);
                    // モーダルを一旦閉じてから再生成＆再表示
                    const currentModal = window.multiModal.getCurrentInstanceById(
                        `ending-modal-${type}`
                    ); // 仮: IDで取得
                    if (currentModal) currentModal.close();
                    onClickRegenerateEnding(type); // ★ 再生成処理呼び出し
                },
            },
        ],
        cancelLabel: '閉じる',
    });
};

/**
 * エンディング再生成処理
 * @param {'clear' | 'bad'} type エンディングタイプ
 */
window.onClickRegenerateEnding = async function (type) {
    const scenarioId = window.currentScenario?.scenarioId;
    if (!scenarioId) {
        console.warn('[SceneExtras] Cannot regenerate ending: Scenario ID not found.');
        return;
    }
    console.log(`[SceneExtras] Regenerating ending for type: ${type}, scenario: ${scenarioId}`);

    try {
        // 1) 既存Ending削除 (DBから)
        await window.deleteEnding(scenarioId, type); // DB関数
        console.log('[SceneExtras] Deleted existing ending from DB.');

        // 2) 再生成
        const newStory = await generateEndingStory(type); // ★ Gemini で生成
        if (!newStory) {
            console.warn('[SceneExtras] Ending regeneration returned empty.');
            return; // 生成失敗時はここで終了
        }
        await window.saveEnding(scenarioId, type, newStory); // DB保存
        console.log('[SceneExtras] New ending regenerated and saved.');

        // 3) multiModalを開き直す
        openEndingModal(type, newStory);
    } catch (error) {
        console.error(`[SceneExtras] Error regenerating ending (type: ${type}):`, error);
        if (typeof showToast === 'function')
            showToast(`エンディング再生成エラー: ${error.message}`);
    }
};

/**
 * エンディングストーリーを生成する (★ Gemini API 使用)
 * @param {'clear' | 'bad'} type エンディングタイプ
 * @returns {Promise<string>} 生成されたエンディングストーリー文字列、失敗時は空文字
 */
async function generateEndingStory(type) {
    console.log(`[SceneExtras] Generating ending story (type: ${type})...`);
    // ★ APIクライアントのチェック
    if (!window.geminiClient) {
        if (typeof alert === 'function') alert('APIクライアントが利用できません。');
        console.error('[SceneExtras] Cannot generate ending: Gemini client not available.');
        return '';
    }
    if (window.geminiClient.isStubMode) {
        console.warn('[SceneExtras] Running generateEndingStory in STUB MODE.');
        // スタブモード用のダミー応答を返す
        await new Promise((resolve) => setTimeout(resolve, 500));
        return type === 'clear'
            ? 'こうして、あなたは目的を果たし、平和が訪れた。（クリアエンディング - スタブ）'
            : '残念ながら、あなたの冒険はここで終わってしまった。（バッドエンディング - スタブ）';
    }

    const scenario = window.currentScenario;
    if (!scenario) {
        if (typeof alert === 'function') alert('シナリオデータがありません。');
        console.error('[SceneExtras] Cannot generate ending: Current scenario data not available.');
        return '';
    }
    const wd = scenario.wizardData || {};
    const isClear = type === 'clear';
    // 概要、パーティ情報、シーン履歴、セクション情報を英語で準備 (Gemini向け)
    const scenarioSummaryEn = wd.scenarioSummaryEn || wd.scenarioSummary || '(No scenario outline)';
    const party = wd.party || [];
    const partyTextEn = buildPartyInsertionTextEn(party); // ★ 英語で生成するヘルパー

    // 最新10シーン履歴 (英語優先)
    const lastScenes = window.scenes.slice(-10);
    const sceneHistoryTextEn = lastScenes
        .map((s) => {
            const action = s.action?.content_en || s.action?.content || '';
            const scene = s.content_en || s.content || '';
            return (action ? `Player: ${action}\n` : '') + `GM: ${scene}`;
        })
        .join('\n---\n');

    // セクション情報 (英語優先)
    const sections = wd.sections || [];
    const sectionTextEnArr = sections
        .sort((a, b) => (a.number || 0) - (b.number || 0))
        .map((s) => {
            const conditionEn =
                s.conditionEn ||
                window.decompressCondition(s.conditionZipped || '') ||
                '(Condition unknown)';
            return `Section ${s.number} (${s.cleared ? 'Cleared' : 'Uncleared'}): ${conditionEn}`;
        });
    const sectionInfoEn = sectionTextEnArr.join('\n');

    const endTypeInstruction = isClear ? 'a conclusive happy ending' : 'a conclusive bad ending';

    // Gemini 向けプロンプト (英語)
    const prompt = `You are a talented writer crafting an ending for a TRPG scenario. Based on the provided information, write a compelling ending story in Japanese. The ending MUST be ${endTypeInstruction}. Structure the story into the following five parts, clearly labeled:

1.  **Scenario Outline:** (Briefly restate the core theme/goal from the outline)
2.  **Party Members:** (Briefly mention the key party members involved)
3.  **Story Summary:** (Summarize the key events leading to this ending, based on the scene history)
4.  **Section Status:** (Briefly mention the status of the main goals/sections)
5.  **Epilogue:** (Describe what happened afterwards, ensuring it fits the required ending type: ${endTypeInstruction})

--- Scenario Information ---

Scenario Outline:
${scenarioSummaryEn}

Party Members:
${partyTextEn || '(No party information)'}

Recent Scene History (up to last 10 scenes):
${sceneHistoryTextEn || '(No recent history)'}

Section Status:
${sectionInfoEn || '(No section information)'}
---

Now, write the complete ending story in JAPANESE, following the five-part structure and ensuring the final epilogue matches the required ending type (${endTypeInstruction}). Respond only with the Japanese ending story.`;

    // ローディング表示
    if (typeof window.showLoadingModal === 'function') window.showLoadingModal(true);
    // AbortController は使わない

    try {
        const currentModelId = document.getElementById('model-select')?.value;
        if (!currentModelId) throw new Error('モデル未選択');

        window.geminiClient.initializeHistory([]); // 履歴リセット
        console.log('[SceneExtras] Calling Gemini to generate ending story...');
        const generatedStory = await window.geminiClient.generateContent(prompt, currentModelId);
        console.log('[SceneExtras] Ending story generated.');

        // 応答が日本語であることを確認（念のため）
        if (!containsJapanese(generatedStory)) {
            console.warn(
                '[SceneExtras] Ending story was not generated in Japanese. Attempting translation...'
            );
            // 翻訳を試みるか、エラーとするか
            const translatedStory = await generateJapaneseTranslation(generatedStory);
            if (translatedStory && containsJapanese(translatedStory)) {
                return translatedStory;
            } else {
                throw new Error('エンディングを日本語で生成できませんでした。');
            }
        }
        return generatedStory.trim();
    } catch (err) {
        console.error('[SceneExtras] エンディング生成失敗:', err);
        if (err.name === 'AbortError') {
            // キャンセル処理は現状ないが念のため
            console.warn('[SceneExtras] エンディング生成キャンセル');
            return '';
        }
        if (typeof alert === 'function') alert('エンディング生成に失敗:\n' + err.message);
        return ''; // エラー時は空文字を返す
    } finally {
        if (typeof window.showLoadingModal === 'function') window.showLoadingModal(false);
    }
}

/** 全セクションがクリア済みかどうか */
window.areAllSectionsCleared = function () {
    if (!window.sections || window.sections.length === 0) return false; // セクションがなければ未クリア扱い
    return window.sections.every((s) => s.cleared === true); // 全ての cleared が true か
};

/** エンディングボタン表示切り替え */
window.refreshEndingButtons = function () {
    const endingBtn = document.getElementById('ending-button');
    const clearEndingBtn = document.getElementById('clear-ending-button');
    if (!endingBtn || !clearEndingBtn) {
        console.warn('[SceneExtras] Ending buttons not found.');
        return;
    }

    // セクション情報がない場合は両方非表示
    if (!window.sections || window.sections.length === 0) {
        endingBtn.style.display = 'none';
        clearEndingBtn.style.display = 'none';
        console.log('[SceneExtras] Ending buttons hidden (no sections).');
        return;
    }

    const anyCleared = window.sections.some((sec) => sec.cleared === true);
    const allCleared = window.areAllSectionsCleared(); // 専用関数を使用

    // クリア済みが1つもなければ両方非表示
    if (!anyCleared) {
        endingBtn.style.display = 'none';
        clearEndingBtn.style.display = 'none';
        console.log('[SceneExtras] Ending buttons hidden (no sections cleared).');
    }
    // 全てクリア済みならクリアエンディングボタンのみ表示
    else if (allCleared) {
        endingBtn.style.display = 'none';
        clearEndingBtn.style.display = 'inline-block'; // 表示
        console.log('[SceneExtras] Clear ending button shown.');
    }
    // 1つ以上クリア済みだが全てではない場合、通常(Bad)エンディングボタンのみ表示
    else {
        endingBtn.style.display = 'inline-block'; // 表示
        clearEndingBtn.style.display = 'none';
        console.log('[SceneExtras] Bad ending button shown.');
    }
};

/* =============================
   エンティティ関連 (アイテム/登場人物)
   ★ Gemini API 使用に修正
============================= */

/**
 * まとめてリスト描画＆アイテムチップス更新を行うヘルパー関数
 */
async function refreshEntitiesAndChips() {
    console.log('[SceneExtras] Refreshing entities list and item chips...');
    // 両方の関数が存在するか確認してから実行
    if (typeof window.renderEntitiesList === 'function') await window.renderEntitiesList();
    if (typeof window.renderItemChips === 'function') await window.renderItemChips();
}

/** シナリオ全体のテキストから新規エンティティを抽出して登録 (★ Gemini API 使用) */
window.onUpdateEntitiesFromAllScenes = async function () {
    console.log('[SceneExtras] Updating entities from all scenes...');
    // ★ APIクライアントのチェック
    if (!window.geminiClient) {
        if (typeof alert === 'function') alert('APIクライアントが利用できません。');
        console.error('[SceneExtras] Cannot update entities: Gemini client not available.');
        return;
    }
    if (window.geminiClient.isStubMode) {
        console.warn('[SceneExtras] Running onUpdateEntitiesFromAllScenes in STUB MODE.');
        // スタブモード時の処理（例：ダミーデータを候補表示）
        const candidateListDiv = document.getElementById('entity-candidate-list');
        if (candidateListDiv) {
            candidateListDiv.innerHTML =
                '<p style="color:#888;">スタブモード: 新規エンティティ候補 (ダミー)</p><div><input type="checkbox" id="stub-item-1" checked><label for="stub-item-1">スタブアイテム (入手済)</label></div><div><input type="checkbox" id="stub-char-1"><label for="stub-char-1">スタブキャラ</label></div><button id="add-stub-entities">追加</button>';
            document.getElementById('add-stub-entities')?.addEventListener('click', async () => {
                const scenarioId = window.currentScenarioId;
                if (!scenarioId) return;
                const entitiesToAdd = [];
                if (document.getElementById('stub-item-1')?.checked)
                    entitiesToAdd.push({
                        scenarioId,
                        category: 'item',
                        name: 'スタブアイテム',
                        description: 'スタブモードで追加されたアイテム',
                        acquired: true,
                        imageData: '',
                    });
                if (document.getElementById('stub-char-1')?.checked)
                    entitiesToAdd.push({
                        scenarioId,
                        category: 'character',
                        name: 'スタブキャラ',
                        description: 'スタブモードで追加されたキャラ',
                        acquired: false,
                        imageData: '',
                    });
                for (const ent of entitiesToAdd) await window.addEntity(ent);
                await refreshEntitiesAndChips();
                if (candidateListDiv)
                    candidateListDiv.innerHTML = 'スタブエンティティを追加しました。';
            });
        }
        return;
    }

    const scenarioId = window.currentScenarioId;
    if (!scenarioId) {
        if (typeof alert === 'function') alert('シナリオIDが不明です');
        return;
    }
    let existingEntities = [];
    try {
        existingEntities = await window.getEntitiesByScenarioId(scenarioId); // DB関数
    } catch (dbError) {
        console.error('[SceneExtras] Failed to get existing entities:', dbError);
        if (typeof showToast === 'function')
            showToast(`既存エンティティの取得に失敗: ${dbError.message}`);
        // エラーでも抽出は試みる
    }

    // --- シナリオテキストの収集 (英語優先) ---
    // (sceneManager.js の getNextScene 内のロジックを流用・改善)
    let scenarioTextEn = '';
    const actionCount = window.scenes.length; // アクション数ではなくシーン数で区切る方が安定するかも
    const summaryInterval = 10; // 要約単位
    const detailCount = 15; // 直近の詳細表示数
    const summaryEndIndex = Math.max(0, actionCount - detailCount);
    const summaryChunkEnd = Math.max(-1, Math.floor(summaryEndIndex / summaryInterval) - 1);

    // 1) 要約部分 (英語優先)
    for (let i = 0; i <= summaryChunkEnd; i++) {
        const sumObj = window.sceneSummaries[i];
        if (sumObj && (sumObj.en || sumObj.ja)) {
            scenarioTextEn += sumObj.en || sumObj.ja; // 英語があれば英語、なければ日本語
            scenarioTextEn += '\n\n';
        }
    }
    // 2) 直近の詳細部分 (英語優先)
    const detailStartIndex = summaryEndIndex;
    for (let i = detailStartIndex; i < window.scenes.length; i++) {
        const scn = window.scenes[i];
        if (!scn) continue;
        if (scn.action?.content?.trim()) {
            scenarioTextEn += `Player: ${scn.action.content_en || scn.action.content}\n`;
        }
        scenarioTextEn += `GM: ${scn.content_en || scn.content}\n\n`;
    }

    if (!scenarioTextEn.trim()) {
        if (typeof showToast === 'function') showToast('抽出対象のシナリオテキストがありません。');
        return;
    }

    // --- 既存エンティティ情報の準備 ---
    const existingNames = new Set(existingEntities.map((ent) => ent.name?.toLowerCase())); // 重複チェック用に小文字セット
    const existingDesc =
        existingEntities.map((ent) => `- ${ent.name} (${ent.category})`).join('\n') || 'None';

    // --- Gemini 向けプロンプト (英語) ---
    // JSON形式での出力を期待するプロンプト
    const prompt = `Analyze the following TRPG scenario text and extract NEW characters and items that are NOT already listed in the "Existing Entities".

Rules for Extraction:
- Identify potential characters (people, named creatures) and items (objects, artifacts, consumables).
- For each NEW entity found, create a JSON object with "category" ("character" or "item"), "name" (in Japanese), and "description" (a brief explanation in Japanese, approx. 50 chars).
- Determine if an item was likely acquired by the player based on the context. If acquired, add "acquired": true, otherwise "acquired": false. Characters do not need the "acquired" field.
- Exclude locations, place names, general concepts, and entities already listed. Avoid duplicates or very similar entries.
- Output ONLY a valid JSON array containing the objects for the new entities found. If no new entities are found, output an empty array [].

Existing Entities:
---
${existingDesc}
---

Scenario Text:
---
${scenarioTextEn}
---

JSON Output (array of new entities):`;

    // ローディング表示 & UI準備
    if (typeof window.showLoadingModal === 'function') window.showLoadingModal(true);
    const candidateListDiv = document.getElementById('entity-candidate-list');
    if (candidateListDiv) {
        candidateListDiv.innerHTML = `<div class="loading">シナリオからアイテムや登場人物を抽出中...</div>`;
    }

    try {
        const currentModelId = document.getElementById('model-select')?.value;
        if (!currentModelId) throw new Error('モデル未選択');

        window.geminiClient.initializeHistory([]); // 履歴リセット
        console.log('[SceneExtras] Calling Gemini to extract entities...');
        const responseText = await window.geminiClient.generateContent(prompt, currentModelId);
        console.log('[SceneExtras] Raw response for entity extraction:', responseText);

        // 応答からJSON配列を抽出・パース
        let newEntities = [];
        const jsonMatch = responseText.match(/\[[\s\S]*\]/); // 配列部分を抽出
        if (jsonMatch) {
            try {
                newEntities = JSON.parse(jsonMatch[0]);
                if (!Array.isArray(newEntities)) newEntities = []; // 配列でなければ空にする
            } catch (e) {
                console.warn('[SceneExtras] Failed to parse JSON response for entities:', e);
                // JSONパース失敗時のフォールバック（応答テキストをそのまま表示するなど）
                if (candidateListDiv)
                    candidateListDiv.innerHTML = `<span style="color: #f88;">抽出結果の解析に失敗しました。</span><pre>${responseText.substring(
                        0,
                        200
                    )}...</pre>`;
                throw new Error('エンティティ抽出結果の形式が不正です。'); // エラーとして処理
            }
        } else {
            console.log('[SceneExtras] No JSON array found in entity extraction response.');
        }

        // --- 候補表示と追加処理 ---
        if (candidateListDiv) {
            if (newEntities.length === 0) {
                candidateListDiv.innerHTML =
                    '<p style="color:#aaa;">新しく追加できそうなアイテム/人物は見つかりませんでした。</p>';
            } else {
                // 候補をチェックボックスで表示し、ユーザーが選択して追加できるようにする
                let candidateHtml =
                    '<p style="font-weight:bold;">以下の候補が見つかりました。追加するものを選択してください:</p>';
                newEntities.forEach((item, index) => {
                    // 既存リストとの重複を再度チェック
                    if (item.name && !existingNames.has(item.name.toLowerCase())) {
                        const categoryJa = item.category === 'character' ? '人物' : 'アイテム';
                        const acquiredText = item.acquired ? ' (入手済)' : '';
                        candidateHtml += `
                                 <div style="margin-bottom: 5px;">
                                      <input type="checkbox" id="candidate-${index}" data-index="${index}" checked>
                                      <label for="candidate-${index}"><b>${DOMPurify.sanitize(
                            item.name
                        )}</b> (${categoryJa}${acquiredText}) - ${DOMPurify.sanitize(
                            item.description || ''
                        )}</label>
                                 </div>`;
                    } else {
                        console.log(
                            `[SceneExtras] Skipping duplicate or invalid candidate: ${item.name}`
                        );
                    }
                });
                candidateHtml += `<button id="add-selected-entities-btn" style="margin-top: 10px;">選択したものを追加</button>`;
                candidateListDiv.innerHTML = candidateHtml;

                // 「選択したものを追加」ボタンのイベント
                const addButton = document.getElementById('add-selected-entities-btn');
                if (addButton) {
                    addButton.addEventListener('click', async () => {
                        let addedCount = 0;
                        const checkboxes = candidateListDiv.querySelectorAll(
                            'input[type="checkbox"]:checked'
                        );
                        for (const checkbox of checkboxes) {
                            const index = parseInt(checkbox.dataset.index || '-1', 10);
                            const entityData = newEntities[index];
                            if (
                                entityData &&
                                entityData.name &&
                                !existingNames.has(entityData.name.toLowerCase())
                            ) {
                                const record = {
                                    scenarioId,
                                    category:
                                        entityData.category === 'character' ? 'character' : 'item',
                                    name: entityData.name,
                                    description: entityData.description || '',
                                    acquired: entityData.acquired === true,
                                    imageData: '',
                                };
                                try {
                                    await window.addEntity(record); // DBに追加
                                    addedCount++;
                                    existingNames.add(entityData.name.toLowerCase()); // 追加済みリスト更新
                                } catch (addError) {
                                    console.error(
                                        `[SceneExtras] Failed to add entity ${entityData.name}:`,
                                        addError
                                    );
                                    if (typeof showToast === 'function')
                                        showToast(`「${entityData.name}」の追加に失敗`);
                                }
                            }
                        }
                        if (addedCount > 0) {
                            if (typeof showToast === 'function')
                                showToast(`${addedCount}件のエンティティを追加しました。`);
                            await refreshEntitiesAndChips(); // リストとチップス更新
                            candidateListDiv.innerHTML = `<p style="color:#afa;">${addedCount}件追加しました。</p>`; // 完了メッセージ
                        } else {
                            candidateListDiv.innerHTML = `<p style="color:#aaa;">追加する候補が選択されませんでした。</p>`;
                        }
                    });
                }
            }
        }
    } catch (err) {
        console.error('[SceneExtras] onUpdateEntitiesFromAllScenes失敗:', err);
        if (typeof alert === 'function') alert('エンティティの抽出に失敗:\n' + err.message);
        if (candidateListDiv) {
            candidateListDiv.innerHTML = `<span style="color: #f88;">抽出処理中にエラーが発生しました。</span>`;
        }
    } finally {
        if (typeof window.showLoadingModal === 'function') window.showLoadingModal(false);
    }
};

/** 情報モーダル内のエンティティリストを描画 */
window.renderEntitiesList = async function () {
    const listDiv = document.getElementById('entity-list-container');
    if (!listDiv) return;
    console.log('[SceneExtras] Rendering entities list...');
    listDiv.innerHTML = `<div class="loading">読み込み中...</div>`; // 読み込み中表示

    const scenarioId = window.currentScenarioId;
    if (!scenarioId) {
        listDiv.textContent = 'シナリオが選択されていません。';
        return;
    }

    try {
        const allEnts = await window.getEntitiesByScenarioId(scenarioId); // DBから取得
        listDiv.innerHTML = ''; // クリア

        const items = allEnts.filter((e) => e && e.category === 'item');
        const chars = allEnts.filter((e) => e && e.category === 'character');

        // アイテムセクション
        if (items.length > 0) {
            const itemTitle = document.createElement('h3');
            itemTitle.textContent = 'アイテム';
            listDiv.appendChild(itemTitle);
            items
                .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ja'))
                .forEach((ent, index) => {
                    // 名前順ソート
                    const row = createEntityRow(ent); // isOdd は不要に
                    listDiv.appendChild(row);
                });
        }

        // キャラクターセクション
        if (chars.length > 0) {
            const charTitle = document.createElement('h3');
            charTitle.textContent = '登場人物'; // ラベル変更
            listDiv.appendChild(charTitle);
            chars
                .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ja'))
                .forEach((ent, index) => {
                    // 名前順ソート
                    const row = createEntityRow(ent);
                    listDiv.appendChild(row);
                });
        }

        if (items.length === 0 && chars.length === 0) {
            listDiv.textContent =
                'アイテムや登場人物の情報はありません。「シナリオから再抽出」をお試しください。';
        }
        console.log('[SceneExtras] Entities list rendered.');
    } catch (dbError) {
        console.error('[SceneExtras] Failed to render entities list:', dbError);
        listDiv.innerHTML = `<span style="color:#f88;">エンティティリストの読み込みに失敗しました。</span>`;
        if (typeof showToast === 'function') showToast(`リスト読み込みエラー: ${dbError.message}`);
    }
};

/** エンティティ一件分のDOM要素を作成 */
function createEntityRow(entity) {
    // isOdd 引数削除
    const row = document.createElement('div');
    row.className = 'info-row entity-row'; // クラス追加
    row.style.marginBottom = '15px';
    row.style.padding = '10px';
    row.style.border = '1px solid #444';
    row.style.borderRadius = '4px';
    row.style.backgroundColor = 'rgba(255,255,255,0.03)';
    row.style.overflow = 'hidden'; // clearfix の代わり

    const contentWrapper = document.createElement('div'); // 画像とテキストを囲む

    // 画像 (あれば左寄せ)
    if (entity.imageData) {
        const thumbWrapper = document.createElement('div');
        thumbWrapper.style.float = 'left';
        thumbWrapper.style.marginRight = '15px';
        thumbWrapper.style.marginBottom = '5px'; // 下にも少しマージン

        const thumb = document.createElement('img');
        thumb.src = entity.imageData;
        thumb.alt = entity.name;
        thumb.style.width = '80px'; // サイズ調整
        thumb.style.height = '80px';
        thumb.style.objectFit = 'cover'; // containからcoverに変更
        thumb.style.borderRadius = '4px'; // 円形やめ
        // thumb.style.shapeOutside = "circle(50%)"; // floatを使うなら不要かも

        // クリックでプレビュー表示（もし必要なら）
        thumb.style.cursor = 'pointer';
        thumb.addEventListener('click', () => {
            // 画像プレビュー関数 (warehouse.jsのopenImagePreviewのようなもの) を呼び出す
            if (typeof window.openEntityImagePreview === 'function') {
                // 仮の関数名
                window.openEntityImagePreview(entity);
            } else {
                console.warn('[SceneExtras] Image preview function for entities not found.');
            }
        });

        thumbWrapper.appendChild(thumb);
        contentWrapper.appendChild(thumbWrapper);
    }

    // 情報テキスト
    const infoSpan = document.createElement('div'); // spanからdivに変更
    let displayName = entity.name || '(名称未設定)';
    if (entity.category === 'item' && entity.acquired) {
        displayName += ' <span style="color: #8f8; font-size: 0.8em;">[入手済]</span>'; // スタイル変更
    }
    // description が長い場合に省略するかどうか
    const shortDescription =
        (entity.description || '').length > 100
            ? (entity.description || '').substring(0, 100) + '...'
            : entity.description || '(詳細不明)';

    infoSpan.innerHTML = `<h4 style="margin-bottom: 5px;">${DOMPurify.sanitize(
        displayName
    )}</h4> <p style="font-size: 0.9em; margin: 0; color: #ccc;">${DOMPurify.sanitize(
        shortDescription
    )}</p>`;
    contentWrapper.appendChild(infoSpan);

    row.appendChild(contentWrapper);

    // 操作ボタン (下部に右寄せ)
    const bottomWrapper = document.createElement('div');
    bottomWrapper.className = 'r-flexbox'; // 右寄せクラス (styles.cssにある想定)
    bottomWrapper.style.marginTop = '10px';
    bottomWrapper.style.clear = 'both'; // float解除

    // --- ドロップダウンメニュー方式 ---
    const menuButton = document.createElement('button');
    menuButton.className = 'scene-menu-button'; // 既存のスタイル流用
    menuButton.innerHTML = '<div class="iconmoon icon-dots-three-horizontal"></div>';
    menuButton.title = '操作メニュー';
    bottomWrapper.appendChild(menuButton);

    const dropdownMenu = document.createElement('div');
    dropdownMenu.className = 'scene-dropdown-menu'; // 既存のスタイル流用
    dropdownMenu.style.display = 'none'; // 初期非表示
    dropdownMenu.style.position = 'absolute'; // 相対位置からの絶対配置
    dropdownMenu.style.right = '0'; // ボタンの右に合わせる
    dropdownMenu.style.bottom = '35px'; // ボタンの上に表示
    dropdownMenu.style.zIndex = '10';
    dropdownMenu.style.backgroundColor = '#333'; // 背景色
    dropdownMenu.style.border = '1px solid #555';

    // 画像生成ボタン
    const genBtnItem = document.createElement('button');
    genBtnItem.className = 'dropdown-item entity-generate';
    genBtnItem.innerHTML = `<span class="iconmoon icon-picture"></span> 画像生成`;
    genBtnItem.title = 'このエンティティの画像を生成';
    genBtnItem.addEventListener('click', async (e) => {
        e.stopPropagation();
        dropdownMenu.style.display = 'none';
        await generateEntityImage(entity); // ★ Gemini で生成
    });
    dropdownMenu.appendChild(genBtnItem);

    // ★ acquired トグルボタン (アイテムの場合のみ)
    if (entity.category === 'item') {
        const acquireBtnItem = document.createElement('button');
        acquireBtnItem.className = 'dropdown-item entity-toggle-acquire';
        acquireBtnItem.innerHTML = entity.acquired
            ? `<span class="iconmoon icon-cross"></span> 未所持にする`
            : `<span class="iconmoon icon-save"></span> 所持済にする`; // アイコンは適宜変更
        acquireBtnItem.title = entity.acquired ? '「未所持」状態に変更' : '「所持済」状態に変更';
        acquireBtnItem.addEventListener('click', async (e) => {
            e.stopPropagation();
            dropdownMenu.style.display = 'none';
            await toggleEntityAcquired(entity); // ★ 状態変更関数
        });
        dropdownMenu.appendChild(acquireBtnItem);
    }

    // 削除ボタン
    const delBtnItem = document.createElement('button');
    delBtnItem.className = 'dropdown-item entity-delete';
    delBtnItem.innerHTML = `<span class="iconmoon icon-bin"></span> 削除`;
    delBtnItem.title = 'このエンティティを削除';
    delBtnItem.addEventListener('click', async (e) => {
        e.stopPropagation();
        dropdownMenu.style.display = 'none';
        window.multiModalOpen({
            title: 'エンティティ削除確認',
            contentHtml: `<p>「${DOMPurify.sanitize(entity.name)}」を削除しますか？</p>`,
            okLabel: '削除',
            okButtonColor: '#f44336',
            cancelLabel: 'キャンセル',
            onOk: async () => {
                try {
                    await window.deleteEntity(entity.entityId); // DB削除関数
                    await refreshEntitiesAndChips(); // リストとチップス更新
                    if (typeof showToast === 'function')
                        showToast(`「${entity.name}」を削除しました。`);
                } catch (delError) {
                    console.error(
                        `[SceneExtras] Failed to delete entity ${entity.entityId}:`,
                        delError
                    );
                    if (typeof showToast === 'function')
                        showToast(`削除エラー: ${delError.message}`);
                }
            },
        });
    });
    dropdownMenu.appendChild(delBtnItem);

    bottomWrapper.appendChild(dropdownMenu); // ドロップダウンをラッパーに追加
    row.appendChild(bottomWrapper); // ボタンラッパーをrowに追加

    // メニューボタンでドロップダウンを開閉
    menuButton.addEventListener('click', (e) => {
        e.stopPropagation();
        // 他のドロップダウンが開いていれば閉じる (オプション)
        document.querySelectorAll('.scene-dropdown-menu').forEach((dd) => {
            if (dd !== dropdownMenu) dd.style.display = 'none';
        });
        dropdownMenu.style.display = dropdownMenu.style.display === 'none' ? 'flex' : 'none';
    });
    // ドキュメント全体のクリックでドロップダウンを閉じる
    document.addEventListener(
        'click',
        (e) => {
            if (!row.contains(e.target)) {
                // row の外側をクリックしたら
                dropdownMenu.style.display = 'none';
            }
        },
        true
    ); // キャプチャフェーズで実行

    return row;
}

/**
 * アイテムの acquired 状態をトグルする関数
 * @param {object} entity 対象のアイテムエンティティ
 */
async function toggleEntityAcquired(entity) {
    if (entity.category !== 'item') return;
    console.log(`[SceneExtras] Toggling acquired state for item: ${entity.name}`);
    entity.acquired = !entity.acquired; // 状態反転
    try {
        await window.updateEntity(entity); // DB更新
        await refreshEntitiesAndChips(); // リストとチップス更新
        if (typeof showToast === 'function')
            showToast(`「${entity.name}」を${entity.acquired ? '所持済' : '未所持'}にしました。`);
    } catch (updateError) {
        console.error(
            `[SceneExtras] Failed to update acquired state for ${entity.name}:`,
            updateError
        );
        entity.acquired = !entity.acquired; // エラー時は状態を戻す
        if (typeof showToast === 'function') showToast(`状態の更新に失敗: ${updateError.message}`);
        // UIの再描画が必要な場合も
        await refreshEntitiesAndChips();
    }
}

/** エンティティの画像を生成 (★ Gemini API 使用) */
async function generateEntityImage(entity) {
    console.log(
        `[SceneExtras] Generating image for entity: ${entity.name} (${entity.category})...`
    );
    // ★ APIクライアントのチェック
    if (!window.geminiClient) {
        if (typeof showToast === 'function') showToast('APIクライアントが利用できません。');
        console.error('[SceneExtras] Cannot generate entity image: Gemini client not available.');
        return;
    }
    if (window.geminiClient.isStubMode) {
        console.warn('[SceneExtras] Running generateEntityImage in STUB MODE.');
        // スタブモード時の処理 (ダミー画像URLを設定するなど)
        entity.imageData =
            'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22><rect width=%22100%22 height=%22100%22 fill=%22%23ddd%22/><text x=%2250%22 y=%2250%22 font-size=%2210%22 text-anchor=%22middle%22 dy=%22.3em%22>STUB</text></svg>';
        try {
            await window.updateEntity(entity);
            await refreshEntitiesAndChips();
            if (typeof showToast === 'function') showToast('スタブ画像を設定しました。');
        } catch (e) {
            console.error(e);
        }
        return;
    }

    // Gemini 向けプロンプト (英語)
    const prompt = `Generate an image of a${
        entity.category === 'item' ? 'n item' : ' character'
    } named "${entity.name}" for a TRPG.
Description: ${entity.description || '(no description)'}
Style: Anime illustration, focus on the entity, simple background, no text.`;

    // ローディング表示
    if (typeof window.showLoadingModal === 'function') window.showLoadingModal(true);

    try {
        // ★ GeminiApiClient を使って画像生成
        const dataUrl = await window.geminiClient.generateImageContent(
            prompt /*, 'gemini-pro-vision' etc */
        );

        if (!dataUrl || !dataUrl.startsWith('data:image')) {
            throw new Error('有効な画像データURLを取得できませんでした。');
        }

        // エンティティデータを更新してDB保存
        entity.imageData = dataUrl;
        entity.rotationAngle = 0; // 画像生成時は回転リセット
        await window.updateEntity(entity); // DB更新関数
        console.log(`[SceneExtras] Image generated and saved for entity: ${entity.name}`);

        // UIをまとめて更新
        await refreshEntitiesAndChips();
        if (typeof showToast === 'function') showToast(`「${entity.name}」の画像を生成しました。`);
    } catch (err) {
        console.error('[SceneExtras] generateEntityImage失敗:', err);
        if (typeof alert === 'function') alert('画像生成失敗:\n' + err.message); // alert より showToast
    } finally {
        if (typeof window.showLoadingModal === 'function') window.showLoadingModal(false);
    }
}

/* =============================
   パーティ表示 & 全セクション一覧 (修正なし)
============================= */
// (showPartyModal, renderPartyCardsInModalMulti, createPartyCardElement, showAllSectionsModal, renderAllSections は基本的に修正不要)
// ただし、multiModalOpen を使うように統一

/** パーティ情報モーダルを表示 */
window.showPartyModal = function () {
    console.log('[SceneExtras] Opening party modal...');
    window.multiModalOpen({
        // multiModalOpen 使用
        id: 'party-info-modal',
        title: 'パーティ情報',
        contentHtml: `
            <div id="party-modal-card-container" class="card-container" style="display: flex; flex-wrap: wrap; justify-content: center; gap: 15px; max-height: 70vh; overflow-y: auto;">
                 <div class="loading">読み込み中...</div>
            </div>
        `,
        appearanceType: 'center',
        showCloseButton: true,
        closeOnOutsideClick: true,
        cancelLabel: '閉じる',
        onOpen: () => {
            console.log('[SceneExtras] Party modal opened. Rendering cards...');
            renderPartyCardsInModalMulti(); // カード描画
        },
    });
};

/** パーティモーダル内にカードを描画 */
function renderPartyCardsInModalMulti() {
    const container = document.getElementById('party-modal-card-container');
    if (!container) {
        console.error('[SceneExtras] Party modal card container not found.');
        return;
    }
    container.innerHTML = ''; // クリア

    const scenario = window.currentScenario;
    const partyMembers = scenario?.wizardData?.party; // wizardData から取得

    if (!partyMembers || partyMembers.length === 0) {
        container.textContent = 'パーティメンバーがいません。';
        console.log('[SceneExtras] No party members found in scenario data.');
        return;
    }

    console.log(`[SceneExtras] Rendering ${partyMembers.length} party members.`);
    // 必要であれば、window.characterData とマージして最新情報を表示する
    const dbDataMap = new Map((window.characterData || []).map((c) => [c.id, c]));

    partyMembers.forEach((pMember) => {
        // DBの最新情報（特に画像）をマージ
        const dbInfo = dbDataMap.get(pMember.id);
        const mergedData = {
            ...pMember, // wizardDataの情報がベース
            imageData: dbInfo?.imageData || pMember.imageData, // DBの画像があれば優先
            rotationAngle: dbInfo?.rotationAngle, // DBの回転角
            // 必要なら他のフィールドもマージ
            state: dbInfo?.state || pMember.state,
            special: dbInfo?.special || pMember.special,
        };
        const cardEl = createPartyCardElement(mergedData); // パーティカード生成関数
        if (cardEl) container.appendChild(cardEl);
    });
}

/** パーティカード要素を作成 (既存の関数を流用) */
function createPartyCardElement(c) {
    if (!c || !c.id) return null; // 不正データチェック

    const cardEl = document.createElement('div');
    const rarityNum = parseInt((c.rarity || '★1').replace('★', ''), 10) || 1; // デフォルト★1
    cardEl.className = `card party-card rarity${rarityNum}`; // クラス追加
    cardEl.setAttribute('data-id', c.id);

    // クリックで裏返す (オプション)
    cardEl.addEventListener('click', () => {
        cardEl.classList.toggle('flipped');
    });

    const cardInner = document.createElement('div');
    cardInner.className = 'card-inner';

    const cf = document.createElement('div'); // front
    cf.className = 'card-front';
    cf.innerHTML = `<div class="bezel rarity${rarityNum}"></div>`; // ベゼル

    // 役割表示
    let roleLabel = '';
    if (c.role === 'avatar') roleLabel = ' (あなた)';
    else if (c.role === 'partner') roleLabel = ' (パートナー)';

    const tEl = document.createElement('div'); // type
    tEl.className = 'card-type';
    tEl.textContent = (c.type || '不明') + roleLabel;
    cf.appendChild(tEl);

    const imgCont = document.createElement('div'); // image container
    imgCont.className = 'card-image';
    if (c.imageData) {
        const im = document.createElement('img');
        im.src = c.imageData;
        im.alt = c.name || 'パーティメンバー';
        im.loading = 'lazy';
        applyRotationToElement(im, c.rotationAngle); // 回転適用
        imgCont.appendChild(im);
    } else {
        imgCont.innerHTML =
            '<div style="color:#aaa; font-size:0.8rem; text-align:center;">(画像なし)</div>';
    }
    cf.appendChild(imgCont);

    const info = document.createElement('div'); // info container
    info.className = 'card-info';
    const nm = document.createElement('p');
    nm.innerHTML = `<h3>${DOMPurify.sanitize(c.name || '(名称未設定)')}</h3>`;
    info.appendChild(nm);
    if (c.state) {
        const st = document.createElement('p');
        st.innerHTML = `<strong>状態:</strong> ${DOMPurify.sanitize(c.state)}`;
        info.appendChild(st);
    }
    if (c.special) {
        const sp = document.createElement('p');
        sp.innerHTML = `<strong>特技:</strong> ${DOMPurify.sanitize(c.special)}`;
        info.appendChild(sp);
    }
    if (c.caption) {
        const cap = document.createElement('p');
        cap.innerHTML = `<span>${DOMPurify.sanitize(c.caption)}</span>`;
        info.appendChild(cap);
    }
    cf.appendChild(info);

    const cb = document.createElement('div'); // back
    cb.className = 'card-back';
    cb.innerHTML = `<strong>${DOMPurify.sanitize(c.type || '?')}</strong>`;

    cardInner.appendChild(cf);
    cardInner.appendChild(cb);
    cardEl.appendChild(cardInner);
    return cardEl;
}

/** パーティ情報文章化ヘルパー (英語用) - sceneManager.js で使用 */
function buildPartyInsertionTextEn(party) {
    if (!party || party.length === 0) return '(No party members)';
    let txt = '';
    party.forEach((p) => {
        txt += `- ${p.name || 'Unknown'} (${p.type || 'Unknown'})`;
        if (p.role === 'avatar') txt += ' [Player Avatar]';
        if (p.role === 'partner') txt += ' [Partner]';
        // 英語の説明 (description_en などがあれば使う)
        txt += `\n  Details: ${
            p.description_en || p.caption || p.special || 'No specific details'
        }\n`;
    });
    return txt;
}

/** パーティ情報文章化ヘルパー (日本語用) - 既存コード */
window.buildPartyInsertionText = function (party) {
    if (!party || party.length === 0) return 'パーティメンバーはいません。';
    let txt = '【パーティ編成情報】\n';

    const roles = ['avatar', 'partner', 'none']; // 表示順序
    const types = ['キャラクター', 'モンスター', 'アイテム']; // タイプ別表示用

    roles.forEach((role) => {
        const members = party.filter((p) => (p.role || 'none') === role);
        if (members.length > 0) {
            if (role === 'avatar') txt += '◆プレイヤー(あなた)\n';
            else if (role === 'partner') txt += '◆パートナー\n';
            else txt += '◆その他メンバー\n'; // role='none' or undefined

            // タイプ別に表示
            types.forEach((type) => {
                const typeMembers = members.filter((m) => m.type === type);
                if (typeMembers.length > 0) {
                    txt += `【${type}】\n`;
                    typeMembers.forEach((member) => {
                        txt += buildCardDescription(member); // 詳細生成ヘルパー呼び出し
                    });
                }
            });
        }
    });

    txt += '\n以上を踏まえ、描写に活かしてください。'; // 指示調整
    return txt;
};

/** カードの詳細情報をテキスト化 (buildPartyInsertionTextで使用) - 既存コード */
function buildCardDescription(card) {
    if (!card) return '';
    let result = '';
    result += ` - 【名前】${card.name || '(不明)'}\n`;
    if (card.rarity) result += `   【レア度】${card.rarity}\n`;
    if (card.state) result += `   【状態】${card.state}\n`;
    if (card.special) result += `   【特技】${card.special}\n`;
    if (card.caption) result += `   【説明】${card.caption}\n`;
    // imageprompt は長すぎる可能性があるので含めないか、短縮する
    // if (card.imageprompt) result += `   【外見特徴】${(card.imageprompt || "").substring(0, 50)}...\n`;
    return result;
}

// --- 初期化時に実行される可能性のある関数 ---
// refreshEndingButtons(); // これはシナリオロード後など、適切なタイミングで呼び出す

console.log('[SceneExtras] sceneExtras.js loaded.'); // ファイル読み込み完了ログ
