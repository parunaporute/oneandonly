/********************************
 * sceneExtras.js
 * エンディング、エンティティ、パーティ表示など補助機能
 * ★ API 呼び出しを Gemini Text / Stability Image に変更
 * ★ ES Modules 形式、依存関係を import、関数を export
 * ★ 省略なし
 ********************************/

// --- モジュールインポート ---
import { GeminiApiClient } from './geminiApiClient.js';
import { StabilityApiClient } from './stabilityApiClient.js';
import { open as multiModalOpen } from './multiModal.js';
import { showToast } from './common.js';
import {
    getEnding,
    saveEnding,
    deleteEnding, // エンディング DB
    getEntitiesByScenarioId,
    addEntity,
    updateEntity,
    deleteEntity, // エンティティ DB
    updateScenario, // セクション状態更新で必要
    // loadCharacterDataFromIndexedDB, // 不要？
} from './indexedDB.js';
// ★ sceneManager.js などから import する想定の関数 (要確認・修正)
import {
    decompressCondition, // common.js? sceneManager.js?
    generateEnglishTranslation, // sceneManager.js? (or このファイル内で定義)
    containsJapanese, // sceneManager.js? (or このファイル内で定義)
    // updateSceneHistory, showLastScene // refreshEntitiesAndChips 内で必要なら
} from './sceneManager.js'; // ★仮パス
import {
    showLoadingModal,
    renderItemChips
} from './sceneUI.js';

// DOMPurify はグローバルにある想定

// --- localStorage キー ---
const GEMINI_API_KEY_LS_KEY = 'geminiApiKey';
const STABILITY_API_KEY_LS_KEY = 'stabilityApiKey';
const PREFERRED_GEMINI_MODEL_LS_KEY = 'preferredGeminiModel';

/* =============================
 * エンディング関連
============================= */

/**
 * エンディングモーダルを開く (既存データがあれば表示、なければ生成)
 * @param {'clear' | 'bad'} type エンディング種別
 * ★ export する (sceneUI.js などから呼び出すため)
 */
export async function showEndingModal(type) {
    // ★ グローバル変数 window.currentScenario を参照
    const scenarioId = window.currentScenario?.scenarioId;
    if (!scenarioId) {
        alert('シナリオ未選択');
        return;
    }

    console.log(`[Extras] Showing ending modal (type: ${type}) for scenario ${scenarioId}`);
    showLoadingModal(true); // ローディング開始
    try {
        const existing = await getEnding(scenarioId, type); // import DB関数
        if (existing) {
            console.log('[Extras] Existing ending found.');
            openEndingModal(type, existing.story); // このファイル内で定義
        } else {
            console.log('[Extras] No existing ending found, generating new one...');
            const newStory = await generateEndingStory(type); // このファイル内で定義 (Gemini使用)
            if (!newStory || newStory.startsWith('(')) {
                // エラーメッセージでないかチェック
                showToast('エンディングの生成に失敗しました。'); // import
                return;
            }
            await saveEnding(scenarioId, type, newStory); // import DB関数
            console.log('[Extras] New ending generated and saved.');
            openEndingModal(type, newStory);
        }
    } catch (error) {
        console.error(`[Extras] Error showing/generating ending (type: ${type}):`, error);
        showToast(`エンディング処理エラー: ${error.message}`); // import
    } finally {
        showLoadingModal(false); // ローディング終了
    }
}

/**
 * multiModal を使ってエンディングモーダルを表示
 * @param {'clear' | 'bad'} type
 * @param {string} story
 */
function openEndingModal(type, story) {
    console.log(`[Extras] Opening multiModal for ending (type: ${type})`);
    const titleText = type === 'clear' ? 'クリアエンディング' : 'エンディング';
    // ★ import した multiModalOpen を使用
    multiModalOpen({
        id: `ending-modal-${type}`, // IDにタイプを含める
        title: titleText,
        contentHtml: `<pre id="ending-modal-story-${type}" style="white-space:pre-wrap; max-height: 70vh; overflow-y: auto; text-align: left; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 3px;">${DOMPurify.sanitize(
            story
        )}</pre>`, // global DOMPurify
        showCloseButton: true,
        closeOnOutsideClick: true,
        appearanceType: 'center',
        additionalButtons: [{ label: '再生成', onClick: () => onClickRegenerateEndingMulti(type) }], // このファイル内で定義
        cancelLabel: '閉じる',
    });
}

/**
 * エンディング再生成ボタンの処理
 * @param {'clear' | 'bad'} type
 */
async function onClickRegenerateEndingMulti(type) {
    // ★ グローバル変数 window.currentScenario を参照
    const scenarioId = window.currentScenario?.scenarioId;
    if (!scenarioId) {
        alert('シナリオ未選択');
        return;
    }
    console.log(`[Extras] Regenerating ending (type: ${type}) for scenario ${scenarioId}`);

    // 現在開いているモーダルを閉じる (閉じないと再生成後に2つ開く)
    const currentModal = window.multiModal?.getInstanceById?.(`ending-modal-${type}`); // multiModal側の実装依存
    if (currentModal) currentModal.close();

    showLoadingModal(true);
    try {
        await deleteEnding(scenarioId, type); // 既存を削除 (import DB関数)
        const newStory = await generateEndingStory(type); // 再生成 (Gemini使用)
        if (!newStory || newStory.startsWith('(')) {
            showToast('エンディングの再生成失敗');
            return;
        } // import
        await saveEnding(scenarioId, type, newStory); // 保存 (import DB関数)
        console.log('[Extras] Ending regenerated and saved.');
        openEndingModal(type, newStory); // 新しい内容でモーダルを開く
    } catch (error) {
        console.error(`[Extras] Error regenerating ending (type: ${type}):`, error);
        showToast(`再生成エラー: ${error.message}`); // import
    } finally {
        showLoadingModal(false);
    }
}

/**
 * エンディングストーリーを生成 (★ Gemini API 使用)
 * @param {'clear' | 'bad'} type
 * @returns {Promise<string>} 生成されたストーリー or エラー時は空文字/エラーメッセージ
 */
async function generateEndingStory(type) {
    console.log(`[Extras] Generating ending story (type: ${type})...`);
    const gemini = new GeminiApiClient(); // import
    if (!gemini.isAvailable) {
        alert('Gemini APIキー未設定/無効');
        return '(APIキーエラー)';
    } // import alert?
    if (gemini.isStubMode) {
        return `スタブの${type === 'clear' ? 'クリア' : 'バッド'}エンディングです。`;
    }

    const scenario = window.currentScenario; // global
    if (!scenario) {
        alert('シナリオデータなし');
        return '(シナリオエラー)';
    }
    const wd = scenario.wizardData || {};
    const scenarioSummary = wd.scenarioSummary || '(概要なし)';
    const party = wd.party || [];
    const lastScenes = [...window.scenes].slice(-10); // global
    const combinedSceneText = lastScenes
        .map((s) => `P: ${s.action?.content || '(行動なし)'}\nGM: ${s.content || '(描写なし)'}`)
        .join('\n---\n');
    let sectionText = '(セクション情報なし)';
    if (wd.sections && typeof decompressCondition === 'function') {
        // import
        sectionText = wd.sections
            .map(
                (s) =>
                    `・S${s.number}(${s.cleared ? '済' : '未'}): ${decompressCondition(
                        s.conditionZipped || ''
                    )}`
            )
            .join('\n');
    }
    const endTypePrompt =
        type === 'clear' ? '感動的でハッピーな結末' : '後味の悪い、または悲劇的なバッドエンド';

    // ★ Gemini 向けプロンプト (構造化を指示)
    const prompt = `あなたはTRPGのエンディングを作成するAIです。以下の情報に基づき、指定された結末を迎えるエンディングストーリーを日本語で生成してください。
出力は以下の5部構成で記述してください:
1.【シナリオ概要の再確認】: 提供された概要を簡潔に。
2.【パーティメンバーの結末】: 各メンバーがどうなったか、個別に描写。
3.【物語の結末(${endTypePrompt})】: 指定された結末に至る経緯と最終的な状況を描写。
4.【セクション達成状況】: 提供されたセクション情報への言及（任意）。
5.【エピローグ】: 物語全体の締めくくりや、その後の世界について一言。

---
シナリオ概要: ${scenarioSummary}
パーティ情報: ${buildPartyInsertionText(party)}
直近の展開(最大10シーン):
${combinedSceneText || '(なし)'}
セクション情報:
${sectionText}
---

エンディングストーリー(${endTypePrompt}):`;

    const modelId =
        localStorage.getItem(PREFERRED_GEMINI_MODEL_LS_KEY) || 'gemini-1.5-flash-latest'; // localStorage参照

    try {
        showLoadingModal(true); // import/このファイル内?
        gemini.initializeHistory([]);
        const story = await gemini.generateContent(prompt, modelId);
        console.log('[Extras] Ending story generated.');
        return story.trim() || '(エンディング生成失敗)';
    } catch (err) {
        console.error('エンディング生成失敗:', err);
        showToast(`エンディング生成エラー: ${err.message}`); // import
        return '(エンディング生成エラー)';
    } finally {
        showLoadingModal(false);
    }
}

/** 全セクションクリア済みか判定 */
// ★ sceneManager.js に移設して import する方が良い
// function areAllSectionsCleared() { /* ... */ }

/** エンディングボタン表示切り替え */
// ★ export する (sceneUI.js or sceneMain.js から呼ばれる想定)
export function refreshEndingButtons() {
    const endingBtn = document.getElementById('ending-button');
    const clearEndingBtn = document.getElementById('clear-ending-button');
    if (!endingBtn || !clearEndingBtn) {
        console.warn('Ending buttons not found.');
        return;
    }

    // ★ window.currentScenario.wizardData を参照
    const sections = window.currentScenario?.wizardData?.sections || [];
    if (!sections.length) {
        endingBtn.style.display = 'none';
        clearEndingBtn.style.display = 'none';
        return;
    }

    // ★ areAllSectionsCleared は sceneManager.js から import する想定
    if (typeof areAllSectionsCleared === 'function') {
        const allCleared = areAllSectionsCleared(); // import
        if (allCleared) {
            endingBtn.style.display = 'none';
            clearEndingBtn.style.display = 'inline-block';
        } else {
            endingBtn.style.display = 'inline-block';
            clearEndingBtn.style.display = 'none';
        }
        // ★ セクションが一つもクリアされていない場合も Bad End ボタンを表示する？ 仕様による
        // const anyCleared = sections.some(sec => sec.cleared);
        // if (!anyCleared) endingBtn.style.display = "none";
    } else {
        console.warn('areAllSectionsCleared function not found.');
    }
}

/* =============================
 * エンティティ(アイテム/キャラ)関連
============================= */

/** 情報モーダルを開いて一覧表示 */
// ★ export する (sceneUI.js などから呼び出すため)
export async function openEntitiesModal() {
    console.log('[Extras] Opening entities modal...');
    multiModalOpen({
        // import
        id: 'entities-info-modal',
        title: '情報 (アイテム / 登場人物)',
        contentHtml: `
            <div style="margin-bottom:15px; padding-bottom: 10px; border-bottom: 1px dashed #666;">
                 <button id="entity-update-button" title="現在のシナリオ全体からアイテムや登場人物をAIが抽出・更新します"><span class="iconmoon icon-search"></span> シナリオから抽出(AI)</button>
                 <p id="entity-candidate-list" style="font-size:0.9em; color:#ccc; min-height: 1em; margin-top: 5px;"></p>
            </div>
            <div id="entity-list-container" style="max-height: 60vh; overflow-y: auto; text-align: left;">
                 <div class="loading">読込中...</div>
            </div>`,
        showCloseButton: true,
        appearanceType: 'center',
        closeOnOutsideClick: true,
        cancelLabel: '閉じる',
        onOpen: async () => {
            console.log('[Extras] Entities modal opened. Rendering list...');
            await renderEntitiesList(); // このファイル内で定義
            const updateBtn = document.getElementById('entity-update-button');
            if (updateBtn) {
                updateBtn.addEventListener('click', onUpdateEntitiesFromAllScenes); // このファイル内で定義 (Gemini使用)
            }
        },
    });
}

/** エンティティリストを再描画 */
// ★ export する (openEntitiesModal や削除/生成後に呼ばれるため)
export async function renderEntitiesList() {
    const listDiv = document.getElementById('entity-list-container');
    if (!listDiv) {
        console.error('Entity list container not found.');
        return;
    }
    listDiv.innerHTML = `<div class="loading">読込中...</div>`;

    const scenarioId = window.currentScenarioId; // global
    if (!scenarioId) {
        listDiv.textContent = 'シナリオ未選択';
        return;
    }

    try {
        const allEnts = await getEntitiesByScenarioId(scenarioId); // import DB関数
        const items = allEnts
            .filter((e) => e.category === 'item')
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        const chars = allEnts
            .filter((e) => e.category === 'character')
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        listDiv.innerHTML = ''; // クリア

        if (items.length > 0) {
            const h3 = document.createElement('h3');
            h3.textContent = 'アイテム';
            listDiv.appendChild(h3);
            items.forEach((ent, i) => listDiv.appendChild(createEntityRow(ent, i % 2 !== 0)));
        }
        if (chars.length > 0) {
            const h3 = document.createElement('h3');
            h3.textContent = 'キャラクター・モンスター';
            listDiv.appendChild(h3);
            chars.forEach((ent, i) => listDiv.appendChild(createEntityRow(ent, i % 2 !== 0)));
        }
        if (items.length === 0 && chars.length === 0) {
            listDiv.textContent = 'アイテムや登場人物はまだ記録されていません。';
        }
        console.log(`[Extras] Rendered ${items.length} items and ${chars.length} characters.`);
    } catch (e) {
        console.error('Failed to render entities list:', e);
        listDiv.innerHTML = `<p class="error">リスト表示エラー</p>`;
        showToast(`エンティティリスト表示エラー: ${e.message}`); // import
    }
}

/** エンティティ情報1行分のDOM要素を作成 */
function createEntityRow(entity, isOdd) {
    // (中身は変更なし - 省略せず記述)
    const row = document.createElement('div');
    row.className = 'info-row';
    row.style.marginBottom = '20px';
    const topWrapper = document.createElement('div');
    topWrapper.style.justifyContent = 'space-between';
    topWrapper.style.alignItems = 'center';
    topWrapper.style.overflow = 'hidden';
    if (entity.imageData) {
        const thumb = document.createElement('img');
        thumb.src = entity.imageData;
        thumb.alt = entity.name;
        thumb.style.height = '150px';
        thumb.style.objectFit = 'contain';
        if (isOdd) {
            thumb.style.float = 'left';
            thumb.style.paddingRight = '20px';
        } else {
            thumb.style.float = 'right';
            thumb.style.paddingLeft = '20px';
        }
        thumb.style.borderRadius = '50%';
        thumb.style.shapeOutside = 'circle(50%)';
        topWrapper.appendChild(thumb);
    }
    const infoSpan = document.createElement('span');
    let displayName = entity.name;
    if (entity.category === 'item' && entity.acquired) {
        displayName += '【入手済】';
    }
    infoSpan.innerHTML = `<h4>${DOMPurify.sanitize(displayName)}</h4> ${DOMPurify.sanitize(
        entity.description
    )}`;
    topWrapper.appendChild(infoSpan);
    row.appendChild(topWrapper);
    const bottomWrapper = document.createElement('div');
    bottomWrapper.className = 'l-flexbox';
    const wandBtn = document.createElement('button');
    wandBtn.className = 'scene-menu-button';
    wandBtn.innerHTML = '<div class="iconmoon icon-dots-three-horizontal"></div>';
    bottomWrapper.appendChild(wandBtn);
    const dropdown = document.createElement('div');
    dropdown.className = 'scene-dropdown-menu';
    dropdown.style.display = 'none';
    dropdown.innerHTML = `<button class="dropdown-item entity-generate"><div class="iconmoon icon-picture"></div>画像生成</button><button class="dropdown-item entity-delete"><div class="iconmoon icon-bin"></div>削除</button>`;
    bottomWrapper.appendChild(dropdown);
    wandBtn.addEventListener('click', () => {
        dropdown.style.display = dropdown.style.display === 'none' ? 'flex' : 'none';
    });
    const genBtn = dropdown.querySelector('.entity-generate');
    if (genBtn) {
        genBtn.addEventListener('click', async () => {
            dropdown.style.display = 'none';
            await generateEntityImage(entity);
        });
    }
    const delBtn = dropdown.querySelector('.entity-delete');
    if (delBtn) {
        delBtn.addEventListener('click', async () => {
            dropdown.style.display = 'none';
            multiModalOpen({
                title: 'エンティティ削除',
                contentHtml: `「${DOMPurify.sanitize(entity.name)}」削除？`,
                okLabel: '削除',
                okButtonColor: '#f44336',
                onOk: async () => {
                    try {
                        await deleteEntity(entity.entityId);
                        await refreshEntitiesAndChips();
                    } catch (e) {
                        showToast(`削除失敗: ${e.message}`);
                    }
                },
            });
        });
    }
    topWrapper.appendChild(bottomWrapper);
    return row;
}

/**
 * シナリオ全体テキストからエンティティ抽出 (★ Gemini API 使用)
 */
// ★ export する (sceneUI.js などから呼び出すため)
export async function onUpdateEntitiesFromAllScenes() {
    console.log('[Extras] Updating entities from all scenes using Gemini...');
    const gemini = new GeminiApiClient(); // import
    if (!gemini.isAvailable) {
        alert('Gemini APIキー未設定/無効');
        return;
    } // import alert?
    if (gemini.isStubMode) {
        /* スタブ処理 */ return;
    }

    const scenarioId = window.currentScenarioId; // global
    if (!scenarioId) {
        alert('シナリオID不明');
        return;
    }

    showLoadingModal(true);
    const candidateListDiv = document.getElementById('entity-candidate-list');
    if (candidateListDiv) candidateListDiv.innerHTML = `<div class="loading">抽出中...</div>`;

    try {
        const existingEntities = await getEntitiesByScenarioId(scenarioId); // import
        const existingTextArr = existingEntities.map(
            (e) => `${e.name}(${e.category}): ${e.description.substring(0, 30)}...`
        );
        const existingDesc = existingTextArr.join('\n') || '（なし）';

        // シナリオテキストの準備 (sceneManager と同様のロジック)
        let scenarioText = '';
        const actionCount = window.scenes.length;
        let chunkEnd = Math.floor((actionCount - 15) / 10);
        if (chunkEnd < 0) chunkEnd = 0;
        for (let i = 0; i < chunkEnd; i++) {
            const sum = window.sceneSummaries[i];
            if (sum) {
                scenarioText += (sum.en || sum.ja || '') + '\n';
            }
        } // global
        const skipCount = chunkEnd * 10;
        let aCnt = 0;
        for (const scn of window.scenes) {
            if (scn.action?.content?.trim()) aCnt++;
            if (aCnt <= skipCount && aCnt !== 0) continue;
            if (scn.action?.content?.trim())
                scenarioText += `\nP:${scn.action.content_en || scn.action.content}\n`;
            scenarioText += `S:${scn.content_en || scn.content}\n`;
        } // global

        if (!scenarioText.trim()) {
            showToast('抽出対象のテキストがありません。');
            throw new Error('No text to process.');
        } // import

        const modelId =
            localStorage.getItem(PREFERRED_GEMINI_MODEL_LS_KEY) || 'gemini-1.5-flash-latest';
        // ★ Gemini に JSON 配列形式での出力を指示するプロンプト
        const prompt = `あなたはTRPGの情報を整理するAIです。以下のシナリオテキスト全体を読み、物語に登場した重要な【アイテム】や【キャラクター】(モンスター含む)を抽出してください。既に抽出済みのリストも参考に、重複を避け、新たに見つかったものだけをリストアップしてください。\n\n抽出済リスト:\n${existingDesc}\n\nシナリオテキスト:\n---\n${scenarioText}\n---\n\n出力形式は以下のJSON配列形式のみとしてください。説明や前置きは不要です。日本語で記述し、固有名詞が英語の場合はカタカナにしてください。プレイヤーが入手したと思われるアイテムには "acquired": true を設定してください。\n例: [{"category":"item","name":"古い鍵","description":"錆びついた銅製の鍵。","acquired":true}, {"category":"character","name":"ゴブリン","description":"小柄で緑色の肌を持つモンスター。","acquired":false}]\n\n新たに見つかったエンティティリスト(JSON配列):`;

        gemini.initializeHistory([]);
        console.log('[Extras] Calling Gemini for entity extraction...');
        const rawResponse = await gemini.generateContent(prompt, modelId);
        console.log('[Extras] Raw response (Entities):', rawResponse);

        // 応答からJSON部分を抽出する試み
        let newEntities = [];
        const jsonMatch = rawResponse.match(/\[\s*\{[\s\S]*\}\s*\]/); // [...] の部分を探す
        if (jsonMatch && jsonMatch[0]) {
            try {
                newEntities = JSON.parse(jsonMatch[0]);
                console.log('[Extras] Parsed new entities:', newEntities);
            } catch (e) {
                console.error('JSON parse failed:', e, '\nRaw response was:', rawResponse);
                showToast('AI応答の解析失敗');
            } // import
        } else {
            console.warn('Could not find JSON array in response:', rawResponse);
        }

        if (newEntities && Array.isArray(newEntities) && newEntities.length > 0) {
            let addedCount = 0;
            for (const e of newEntities) {
                if (e.name && e.category) {
                    // 最低限 name と category があるか
                    // ★ 既に同じ名前とカテゴリのものが存在しないかチェック (DBアクセス増える)
                    // const exists = existingEntities.some(ex => ex.name === e.name && ex.category === e.category);
                    // if (!exists) {
                    const rec = {
                        scenarioId,
                        category:
                            e.category === 'character' || e.category === 'モンスター'
                                ? 'character'
                                : 'item',
                        name: e.name,
                        description: e.description || '',
                        acquired: e.acquired === true,
                        imageData: '',
                    };
                    await addEntity(rec); // import
                    addedCount++;
                    // }
                }
            }
            await refreshEntitiesAndChips(); // このファイル内
            if (candidateListDiv)
                candidateListDiv.innerHTML = `${addedCount} 件の新しいアイテム/登場人物を登録しました。`;
            showToast(`${addedCount} 件登録完了`); // import
        } else {
            if (candidateListDiv)
                candidateListDiv.innerHTML = '新しく追加できそうなものはありませんでした。';
        }
    } catch (err) {
        console.error('エンティティ抽出失敗:', err);
        alert('抽出失敗:\n' + err.message);
        if (candidateListDiv) candidateListDiv.innerHTML = `<span class="error">抽出エラー</span>`;
    } finally {
        showLoadingModal(false);
    }
}

/** エンティティ画像生成 (★ Stability AI 使用) */
async function generateEntityImage(entity) {
    console.log(
        `[Extras] Generating image for entity ${entity?.entityId} (${entity?.name}) using Stability AI...`
    );
    if (!entity?.entityId || !entity.name) {
        showToast('画像生成対象のエンティティ情報が不正です。');
        return;
    }

    const stability = new StabilityApiClient(); // import
    if (!stability.isAvailable) {
        showToast('画像生成APIキー未設定/無効');
        return;
    }
    const stabilityApiKey = localStorage.getItem(STABILITY_API_KEY_LS_KEY); // 定数
    if (!stabilityApiKey) {
        showToast('Stability AI APIキー未設定');
        return;
    }
    const gemini = new GeminiApiClient(); // 翻訳用
    if (!gemini.isAvailable) {
        showToast('翻訳APIキー未設定/無効');
        return;
    }
    if (stability.isStubMode || gemini.isStubMode) {
        /* スタブ処理 */ return;
    }

    showLoadingModal(true);
    try {
        // プロンプト作成 (日本語)
        const promptJa = `${entity.category === 'item' ? 'アイテム:' : ''} ${entity.name}。 説明: ${
            entity.description || '(説明なし)'
        }`;
        console.log(`[Extras] Original prompt (JA) for entity: "${promptJa}"`);
        let promptEn = '';

        // 英語翻訳 (Gemini)
        try {
            console.log('Translating entity prompt...');
            promptEn = await generateEnglishTranslation(promptJa);
            console.log(`Translated prompt (EN): "${promptEn}"`);
            if (!promptEn?.trim()) throw new Error('翻訳結果空');
        } catch (transError) {
            throw new Error(`プロンプト英訳失敗: ${transError.message}`);
        }

        // Stability AI 呼び出し
        let width = 1024,
            height = 1024,
            stylePreset = 'fantasy-art'; // デフォルト
        if (entity.category === 'item') {
            stylePreset = 'photographic';
        } // アイテムは写真風
        else if (
            entity.category === 'character' &&
            entity.description?.toLowerCase().includes('monster')
        ) {
            stylePreset = 'comic-book';
        } // 説明にモンスターがあればコミック風 (例)

        const imageOptions = {
            samples: 1,
            width: width,
            height: height,
            style_preset: stylePreset,
        };
        console.log('Calling stabilityClient.generateImage (Entity):', imageOptions);
        const imageResults = await stability.generateImage(promptEn, stabilityApiKey, imageOptions); // ★ API 呼び出し
        const base64 = imageResults?.[0]?.imageDataB64;
        if (!base64) throw new Error('API画像データ取得失敗');
        const dataUrl = 'data:image/png;base64,' + base64;

        // DB更新
        entity.imageData = dataUrl;
        await updateEntity(entity); // import DB関数
        console.log(`Image saved for entity ${entity.entityId}.`);
        showToast('画像生成完了'); // import

        // UI更新
        await refreshEntitiesAndChips(); // このファイル内
    } catch (err) {
        console.error(`エンティティ画像生成失敗 (ID: ${entity.entityId}):`, err);
        showToast(`画像生成エラー: ${err.message}`); // import
    } finally {
        showLoadingModal(false);
    }
}

/** まとめてリスト描画＆アイテムチップス更新 */
async function refreshEntitiesAndChips() {
    // ★ renderItemChips は sceneUI.js から import する想定
    console.log('[Extras] Refreshing entities list and item chips...');
    await renderEntitiesList(); // このファイル内
    if (typeof renderItemChips === 'function') {
        // import されていれば
        await renderItemChips();
    } else {
        console.warn('renderItemChips function not found/imported.');
    }
}

/* =============================
 * パーティ表示関連 (★ sceneExtras.js にあったもの)
============================= */

/** パーティ情報モーダル表示 */
// ★ export する (sceneUI.js などから呼び出すため)
export function showPartyModal() {
    console.log('[Extras] Opening party modal...');
    multiModalOpen({
        // import
        title: 'パーティ情報',
        contentHtml: `<div id="party-modal-card-container" style="display:flex; flex-wrap:wrap; gap:15px; justify-content:center; padding:10px;">読込中...</div>`,
        appearanceType: 'top', // 上部表示
        showCloseButton: true,
        closeOnOutsideClick: true,
        cancelLabel: '閉じる',
        onOpen: () => {
            renderPartyCardsInModalMulti();
        }, // このファイル内で定義
    });
}

/** パーティカードをモーダル内に描画 */
function renderPartyCardsInModalMulti() {
    console.log('[Extras] Rendering party cards in modal...');
    const container = document.getElementById('party-modal-card-container');
    if (!container) return;
    container.innerHTML = '';
    // ★ window.currentScenario, window.characterData を参照 (global)
    const scenario = window.currentScenario;
    const wizardPartyCards = scenario?.wizardData?.party || []; // ウィザード時点のデータ
    const dbCards = window.characterData || []; // DB/メモリ上の最新データ

    if (wizardPartyCards.length === 0) {
        container.textContent = 'パーティメンバーなし';
        return;
    }

    // ウィザード時点のデータとDB/メモリ上の最新データをマージして表示
    const mergedParty = wizardPartyCards.map((wCard) => {
        const dbMatch = dbCards.find((dbC) => dbC.id === wCard.id);
        if (!dbMatch) return wCard; // DBにない場合(アバターなど)はウィザード時点のまま
        // DBにあれば最新情報を優先しつつ、ロール情報などはウィザード時点のを保持
        return { ...dbMatch, ...wCard, imageData: dbMatch.imageData || wCard.imageData };
    });

    mergedParty.forEach((card) => {
        const cardEl = createPartyCardElement(card); // このファイル内で定義
        container.appendChild(cardEl);
    });
    console.log(`[Extras] Rendered ${mergedParty.length} party cards.`);
}

/** パーティカード要素作成 (元の実装) */
function createPartyCardElement(c) {
    // (中身は変更なし - 省略せず記述)
    const cardEl = document.createElement('div');
    const rNum = (c.rarity || '★0').replace('★', '').trim();
    cardEl.className = `card rarity${rNum}`;
    cardEl.setAttribute('data-id', c.id);
    cardEl.addEventListener('click', () => {
        cardEl.classList.toggle('flipped');
    });
    const inner = document.createElement('div');
    inner.className = 'card-inner';
    const cf = document.createElement('div');
    cf.className = 'card-front';
    const bezel = document.createElement('div');
    bezel.className = `bezel rarity${rNum}`;
    cf.appendChild(bezel);
    let role = '';
    if (c.role === 'avatar') role = '(アバター)';
    else if (c.role === 'partner') role = '(パートナー)';
    const tEl = document.createElement('div');
    tEl.className = 'card-type';
    tEl.textContent = (c.type || '?') + role;
    cf.appendChild(tEl);
    const imgC = document.createElement('div');
    imgC.className = 'card-image';
    if (c.imageData) {
        const im = document.createElement('img');
        im.src = c.imageData;
        im.alt = c.name;
        imgC.appendChild(im);
    }
    cf.appendChild(imgC);
    const info = document.createElement('div');
    info.className = 'card-info';
    const nm = document.createElement('p');
    nm.innerHTML = `<h3>${DOMPurify.sanitize(c.name || '無名')}</h3>`;
    info.appendChild(nm);
    if (c.state) {
        const st = document.createElement('p');
        st.innerHTML = `<strong>状態：</strong>${DOMPurify.sanitize(c.state)}`;
        info.appendChild(st);
    }
    const sp = document.createElement('p');
    sp.innerHTML = `<strong>特技：</strong>${DOMPurify.sanitize(c.special || 'なし')}`;
    info.appendChild(sp);
    const cap = document.createElement('p');
    cap.innerHTML = `<span>${DOMPurify.sanitize(c.caption || 'なし')}</span>`;
    info.appendChild(cap);
    cf.appendChild(info);
    const cb = document.createElement('div');
    cb.className = 'card-back';
    cb.innerHTML = `<strong>${DOMPurify.sanitize(c.type || '?')}</strong>`;
    inner.appendChild(cf);
    inner.appendChild(cb);
    cardEl.appendChild(inner);
    return cardEl;
}

/** パーティ情報文章化 (scenarioWizard.js と同じ実装) */
export function buildPartyInsertionText(party) {
    // (中身は変更なし - 省略せず記述)
    if (!party?.length) return 'なし';
    let txt = '【パーティ】\n';
    party.forEach((p) => {
        txt += `- ${p.name || '?'} (${p.type || '?'})`;
        if (p.role === 'avatar') txt += '[あなた]';
        if (p.role === 'partner') txt += '[パートナー]';
        txt += `\n 詳細:${p.special || p.caption || '(なし)'}\n`;
    });
    return txt;
}

// --- ファイル読み込み完了ログ ---
console.log('[SceneExtras] sceneExtras.js loaded.');

// ★ 必要に応じて公開する関数を export
// export { showEndingModal, openEntitiesModal, renderEntitiesList, onUpdateEntitiesFromAllScenes, refreshEndingButtons, showPartyModal };
