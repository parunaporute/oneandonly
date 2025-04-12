/************************************************************
 * universalSaveLoad.js
 * 全体共通のセーブスロット管理
 * ★ onOpen コールバック内の要素取得方法を修正
 * ★ ES Modules 形式、必要な関数を export
 * ★ 依存関数を import
 * ★ 省略なし
 ************************************************************/

// --- モジュールインポート ---
import { open as multiModalOpen } from './multiModal.js';
import { getScenarioById, updateScenario, getSceneEntriesByScenarioId, deleteSceneEntry, addSceneEntry, listAllSlots as dbListAllSlots, getUniversalSave as dbGetUniversalSave, putUniversalSave as dbPutUniversalSave, deleteUniversalSlot as dbDeleteUniversalSlot } from './indexedDB.js';
import { showToast } from './common.js';
import { loadScenarioData } from './sceneManager.js'; 
// DOMPurify はグローバルにある想定

import { StabilityApiClient } from './stabilityApiClient.js';
import { GeminiApiClient } from './geminiApiClient.js';

// --- モジュールスコープ変数 ---
const PREFERRED_GEMINI_MODEL_LS_KEY = 'preferredGeminiModel';
const gemini = new GeminiApiClient(); // new
const modelId = localStorage.getItem(PREFERRED_GEMINI_MODEL_LS_KEY) || 'gemini-1.5-flash-latest';
const stability = new StabilityApiClient(); // new

// --- セーブ/ロード モーダル関連 ---

document.addEventListener('DOMContentLoaded', () => {
  console.log('[UniversalSaveLoad] DOMContentLoaded fired.'); // (1) リスナー実行確認

  const saveLoadButton = document.getElementById('save-load-button');
  console.log('[UniversalSaveLoad] saveLoadButton element:', saveLoadButton); // (2) ボタン要素を取得できたか確認

  if (saveLoadButton) {
    console.log('[UniversalSaveLoad] Adding click listener to #save-load-button'); // (3) リスナー追加処理が実行されるか確認

    // クリックされた時の処理を無名関数で囲み、その中でログ出力と関数呼び出しを行う
    saveLoadButton.addEventListener('click', () => {
      console.log('[UniversalSaveLoad] #save-load-button clicked!'); // (4) ボタンクリックが検知されたか確認

      // openSaveLoadModal が関数として存在するか確認してから呼び出す
      if (typeof openSaveLoadModal === 'function') {
        console.log('[UniversalSaveLoad] Calling openSaveLoadModal...'); // (5) 関数呼び出しが試みられるか確認
        openSaveLoadModal(); // 実際の関数呼び出し
      } else {
        console.error('[UniversalSaveLoad] openSaveLoadModal function is not defined!'); // (5') 関数が見つからない場合のエラーログ
        alert('エラー: モーダルを開く関数が見つかりません。');
      }
    });
  } else {
    // もしボタン要素が見つからない場合
    console.warn('[UniversalSaveLoad] #save-load-button element not found!');
  }
});

/**
 * セーブ／ロード用モーダルを multiModal で開く。
 */
export async function openSaveLoadModal() {
  console.log('[SaveLoad] Opening save/load modal...');
  multiModalOpen({
    // import
    id: 'save-load-modal',
    title: 'セーブ / ロード',
    contentHtml: `
            <div id="slot-container" style="margin: 0 auto; max-width: 400px; margin-bottom: 20px;">
                <div id="slot-items-container" style="background-color: rgba(0,0,0,0.4); margin-bottom: 10px; min-height: 100px;">
                    <div class="loading" style="padding: 20px; text-align: center;">スロット読込中...</div>
                </div>
                <button id="add-slot-button" title="新しいセーブスロットを追加" style="width: 100%; border: none; background-color: rgba(255,255,255,0.08); padding: 8px;">＋ スロット追加</button>
            </div>
            <div class="c-flexbox" style="margin-bottom:20px;">
                <button id="do-save-button" style="display:none;" title="現在のシナリオ進行状況を選択スロットに保存">現在の状況を保存</button>
                <button id="do-load-button" title="選択したスロットの状況からシナリオを開始/再開">選択したスロットから始める</button>
            </div>
            <div class="c-flexbox" style="margin-top:15px;">
                <button id="clear-all-slots-button" style="background-color:#b71c1c; border-color:#b71c1c;" title="全てのセーブデータを削除して初期化します">全スロット初期化</button>
            </div>
        `,
    showCloseButton: true,
    appearanceType: 'center',
    closeOnOutsideClick: true,
    cancelLabel: '閉じる',
    // ★★★ onOpen コールバックの修正 ★★★
    onOpen: async () => {
      // ★ 引数 modalInstance を削除
      console.log('[SaveLoad] Modal opened. Initializing slots...');
      try {
        await ensureInitialSlots(); // スロット初期化

        // ★ 引数を使わず document.getElementById で要素を取得
        const addSlotBtn = document.getElementById('add-slot-button');
        const doSaveBtn = document.getElementById('do-save-button');
        const doLoadBtn = document.getElementById('do-load-button');
        const clearAllBtn = document.getElementById('clear-all-slots-button');

        // イベント紐付け (null チェック追加)
        if (addSlotBtn) addSlotBtn.addEventListener('click', onAddSlot);
        else console.warn('Add slot button not found');
        if (doSaveBtn) doSaveBtn.addEventListener('click', onClickSave);
        else console.warn('Save button not found');
        // ★ onClickLoad から modalInstance 引数を削除 (閉じる処理は別途検討)
        if (doLoadBtn) doLoadBtn.addEventListener('click', () => onClickLoad());
        else console.warn('Load button not found');
        if (clearAllBtn) clearAllBtn.addEventListener('click', onClearAllSlots);
        else console.warn('Clear all button not found');

        await renderSlotList(); // スロットリスト表示
        console.log('[SaveLoad] Slots rendered.');
      } catch (error) {
        console.error('[SaveLoad] Error during modal open setup:', error);
        showToast(`スロット初期化エラー: ${error.message}`); // import
        const container = document.getElementById('slot-items-container');
        if (container) container.innerHTML = `<p class="error">スロット情報読込失敗</p>`;
      }
    },
    // ★★★ ここまで修正 ★★★
  });
}

/**
 * スロット一覧を描画
 */
export async function renderSlotList() {
  // (中身は変更なし - 省略せず記述)
  const container = document.getElementById('slot-items-container');
  if (!container) {
    console.error('Slot container not found.');
    return;
  }
  container.innerHTML = `<div class="loading">読込中...</div>`;
  try {
    const allSlots = await listAllSlots();
    container.innerHTML = '';
    if (allSlots.length === 0) {
      container.innerHTML = `<p>スロットなし</p>`;
      return;
    }
    allSlots.forEach((slot) => {
      const rowC = document.createElement('div');
      rowC.className = 'save-slot-row-container';
      const delBtn = document.createElement('button');
      delBtn.className = 'save-slot-delete';
      delBtn.innerHTML = `<span class="iconmoon icon-cross"></span>`;
      delBtn.title = `スロット${slot.slotIndex}削除`;
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await onDeleteSlot(slot.slotIndex);
      });
      const row = document.createElement('div');
      row.className = 'save-slot-row';
      const rb = document.createElement('input');
      rb.type = 'radio';
      rb.name = 'slotRadio';
      rb.value = slot.slotIndex;
      rb.id = `slotRadio_${slot.slotIndex}`;
      const label = document.createElement('label');
      label.setAttribute('for', rb.id);
      if (!slot.data) {
        label.innerHTML = `<span style="color: #aaa;">${slot.slotIndex}: (空き)</span>`;
      } else {
        let date = slot.updatedAt;
        try {
          date = new Date(slot.updatedAt).toLocaleString('ja-JP');
        } catch {}
        const title = slot.data.scenarioTitle || '(不明)';
        const scenes = slot.data.scenes?.length || 0;
        label.innerHTML = `<b>${slot.slotIndex}:</b> ${DOMPurify.sanitize(title)} <small style="color:#bbb;">(${scenes}シーン, ${date})</small>`;
      }
      row.appendChild(rb);
      row.appendChild(label);
      rowC.appendChild(row);
      rowC.appendChild(delBtn);
      container.appendChild(rowC);
    });
    const saveBtn = document.getElementById('do-save-button');
    if (saveBtn) {
      if (window.currentScenarioId) {
        saveBtn.style.display = 'inline-block';
        saveBtn.disabled = false;
      } else {
        saveBtn.style.display = 'none';
        saveBtn.disabled = true;
      }
    }
  } catch (e) {
    console.error('Error rendering slots:', e);
    container.innerHTML = `<p class="error">リスト表示失敗</p>`;
    showToast(`リストエラー: ${e.message}`);
  }
}
/**
 * 個別スロットを削除またはクリアする処理
 * ★ スロット番号に応じて挙動を変更
 * @param {number} slotIndex 対象のスロット番号
 */
export async function onDeleteSlot(slotIndex) {
  console.log(`[SaveLoad] Delete/Clear slot ${slotIndex} initiated.`);

  // 削除かクリアかの判定
  const isDefaultSlot = slotIndex <= 5;
  const actionText = isDefaultSlot ? 'クリア' : '完全に削除';
  const confirmationTitle = isDefaultSlot ? 'スロットクリア確認' : 'スロット削除確認';
  const confirmationMessage = isDefaultSlot ? `<p>スロット ${slotIndex} のデータをクリアして空きスロットに戻しますか？<br>(スロット番号 ${slotIndex} は残ります)</p>` : `<p style="color: #ffcccc;"><strong>警告:</strong> スロット ${slotIndex} を完全に削除します。<br>このスロット番号は再利用されにくくなります。よろしいですか？</p>`;
  const okButtonLabel = isDefaultSlot ? 'データをクリア' : '完全に削除する';
  const okButtonColor = isDefaultSlot ? '#ffc107' : '#f44336'; // クリアは黄色、削除は赤

  // 確認モーダル (multiModalOpenを使用)
  multiModalOpen({
    // import
    title: confirmationTitle,
    contentHtml: confirmationMessage,
    showCloseButton: true,
    appearanceType: 'center',
    closeOnOutsideClick: true,
    okLabel: okButtonLabel,
    okButtonColor: okButtonColor,
    cancelLabel: 'キャンセル',
    onOk: async () => {
      console.log(`[SaveLoad] Executing ${actionText} for slot ${slotIndex}...`);
      try {
        if (isDefaultSlot) {
          // --- データクリア処理 ---
          const slot = await dbGetUniversalSave(slotIndex); // import DB関数
          if (slot) {
            if (slot.data === null) {
              // 既に空の場合
              showToast(`スロット ${slotIndex} は既に空です。`); // import
            } else {
              slot.data = null; // データ部分を null に
              await dbPutUniversalSave(slot); // import DB関数 (更新)
              console.log(`[SaveLoad] Slot ${slotIndex} data cleared.`);
              showToast(`スロット ${slotIndex} をクリアしました。`); // import
            }
            await renderSlotList(); // スロットリスト再描画
          } else {
            // このケースは通常起こらないはずだが念のため
            console.warn(`[SaveLoad] Slot ${slotIndex} not found for clearing.`);
            showToast('指定されたスロットが見つかりません。'); // import
          }
        } else {
          // --- レコード削除処理 ---
          await dbDeleteUniversalSlot(slotIndex); // import DB関数 (レコード削除)
          console.log(`[SaveLoad] Slot ${slotIndex} record deleted.`);
          showToast(`スロット ${slotIndex} を削除しました。`); // import
          await renderSlotList(); // スロットリスト再描画
        }
      } catch (error) {
        console.error(`[SaveLoad] Failed to ${actionText} slot ${slotIndex}:`, error);
        showToast(`スロット${actionText}中にエラー: ${error.message}`); // import
      }
    },
  });
}
/**
 * スロット追加ボタン処理
 */
export async function onAddSlot() {
  // (中身は変更なし - 省略せず記述)
  console.log('Add slot clicked.');
  try {
    const slots = await listAllSlots();
    let max = 0;
    slots.forEach((s) => {
      if (s.slotIndex > max) max = s.slotIndex;
    });
    const newIdx = max + 1;
    const rec = {
      slotIndex: newIdx,
      updatedAt: new Date().toISOString(),
      data: null,
    };
    await dbPutUniversalSave(rec);
    console.log(`Added slot ${newIdx}.`);
    showToast(`スロット ${newIdx} を追加`);
    await renderSlotList();
  } catch (e) {
    console.error('Failed add slot:', e);
    showToast(`追加エラー: ${e.message}`);
  }
}

/**
 * 保存ボタン処理
 */
export async function onClickSave() {
  // (中身は変更なし - 省略せず記述)
  console.log('Save clicked.');
  const radio = document.querySelector('input[name="slotRadio"]:checked');
  if (!radio) {
    multiModalOpen({
      title: 'エラー',
      contentHtml: '<p>保存先スロット選択</p>',
      cancelLabel: '閉',
    });
    return;
  }
  const slotIdx = parseInt(radio.value, 10);
  const scenId = window.currentScenarioId;
  if (!scenId) {
    multiModalOpen({
      title: 'エラー',
      contentHtml: '<p>保存対象シナリオなし</p>',
      cancelLabel: '閉',
    });
    return;
  }
  try {
    const slot = await dbGetUniversalSave(slotIdx);
    if (slot?.data) {
      multiModalOpen({
        title: '上書き確認',
        contentHtml: `<p>スロット ${slotIdx} 使用中。上書き？</p>`,
        okLabel: '上書き',
        okButtonColor: '#ffc107',
        onOk: async () => {
          await doSaveToSlot(slotIdx);
        },
      });
    } else {
      await doSaveToSlot(slotIdx);
    }
  } catch (e) {
    console.error(`Save prep error ${slotIdx}:`, e);
    showToast(`保存準備エラー: ${e.message}`);
  }
}

/** 指定スロットに現在シナリオデータを保存 */
async function doSaveToSlot(slotIndex) {
  // (中身は変更なし - 省略せず記述)
  console.log(`Executing save to slot ${slotIndex}...`);
  const scenId = window.currentScenarioId;
  if (!scenId) return;
  try {
    const scenObj = window.currentScenario;
    const scenes = window.scenes || [];
    if (!scenObj) throw new Error(`メモリにシナリオ(ID: ${scenId})なし`);
    const data = {
      scenarioId: scenId,
      scenarioTitle: scenObj.title || '(無題)',
      scenarioWizardData: scenObj.wizardData || {},
      scenes: scenes,
    };
    const record = {
      slotIndex: slotIndex,
      updatedAt: new Date().toISOString(),
      data: data,
    };
    await dbPutUniversalSave(record);
    console.log(`Scenario ${scenId} saved to slot ${slotIndex}.`);
    showToast(`スロット ${slotIndex} に保存`);
    await renderSlotList();
  } catch (e) {
    console.error(`Failed save to slot ${slotIndex}:`, e);
    showToast(`保存失敗: ${e.message}`);
  }
}

/**
 * ロードボタン処理 (★ modalInstance 引数削除)
 */
export async function onClickLoad(/* modalInstance */) {
  // ← 引数削除
  console.log('[SaveLoad] Load button clicked.');
  const selectedRadio = document.querySelector('input[name="slotRadio"]:checked');
  if (!selectedRadio) {
    multiModalOpen({
      title: 'エラー',
      contentHtml: '<p>ロードスロット選択</p>',
      cancelLabel: '閉',
    });
    return;
  }
  const slotIndex = parseInt(selectedRadio.value, 10);

  try {
    const slotToLoad = await dbGetUniversalSave(slotIndex); // import
    if (!slotToLoad?.data) {
      multiModalOpen({
        title: 'エラー',
        contentHtml: `<p>スロット ${slotIndex} 空/不正</p>`,
        cancelLabel: '閉',
      });
      return;
    }
    const targetScenarioId = slotToLoad.data.scenarioId;
    if (!targetScenarioId) {
      multiModalOpen({
        title: 'エラー',
        contentHtml: `<p>スロット ${slotIndex} シナリオ情報なし</p>`,
        cancelLabel: '閉',
      });
      return;
    }

    // ★ モーダルを閉じる処理 (ID指定で試みる)
    const currentModal = window.multiModal?.getInstanceById?.('save-load-modal'); // 仮
    if (currentModal) currentModal.close();
    else console.warn('[SaveLoad] Could not find modal instance to close before load/redirect.');

    if (window.currentScenarioId && targetScenarioId === window.currentScenarioId) {
      // 同じシナリオ -> 上書き確認
      console.log(`Loading slot ${slotIndex} into current scenario ${targetScenarioId}...`);
      multiModalOpen({
        title: 'データ上書き確認',
        contentHtml: `<p>現在シナリオ(ID:${targetScenarioId})をスロット${slotIndex}データで上書き？</p>`,
        okLabel: '上書きロード',
        okButtonColor: '#ffc107',
        cancelLabel: 'キャンセル',
        onOk: async () => {
          // 上書き確認モーダルも閉じる必要があるかもしれない
          const confirmModal = window.multiModal?.getInstanceById?.('data-overwrite-confirm'); // 仮ID
          if (confirmModal) confirmModal.close();

          await doLoadScenarioFromSlot(slotToLoad.data); // ロード実行
          showToast(`スロット ${slotIndex} ロード完了`);
        },
      });
    } else {
      // 違うシナリオ -> scenario.html へ遷移
      console.log(`Redirecting to scenario.html?slotIndex=${slotIndex}...`);
      const url = `scenario.html?slotIndex=${slotIndex}&action=load`;
      window.location.href = url;
    }
  } catch (error) {
    console.error(`Load prep error for slot ${slotIndex}:`, error);
    showToast(`ロード準備エラー: ${error.message}`);
  }
}

/**
 * スロットデータからシナリオ情報をDB反映＆UI更新 (scenario.html 側想定)
 */
export async function doLoadScenarioFromSlot(slotData) {
  // (中身は変更なし - 省略せず記述)
  if (!slotData?.scenarioId) throw new Error('無効スロットデータ');
  const sId = slotData.scenarioId;
  console.log(`Executing load from slot for scenario ${sId}...`);
  if (typeof window.showLoadingModal === 'function') window.showLoadingModal(true);
  try {
    let scenObj = await getScenarioById(sId);
    if (!scenObj) throw new Error(`DBシナリオ ${sId} 不在`);
    scenObj.title = slotData.scenarioTitle || scenObj.title || '(無題)';
    scenObj.wizardData = slotData.scenarioWizardData || scenObj.wizardData || {};
    await updateScenario(scenObj, true);
    console.log(`Scenario ${sId} updated.`);
    const existing = await getSceneEntriesByScenarioId(sId);
    const delProms = existing.map((e) => deleteSceneEntry(e.entryId));
    await Promise.all(delProms);
    console.log(`Deleted ${existing.length} entries.`);
    const scenes = slotData.scenes || [];
    const addProms = [];
    for (const sc of scenes) {
      const rec = {
        scenarioId: sId,
        type: 'scene',
        sceneId: sc.sceneId || `scene_${Date.now()}_${Math.random().toString(16).substring(2, 8)}`,
        content: sc.content || '',
        content_en: sc.content_en || '',
        actionContent: sc.action?.content || '',
        actionContent_en: sc.action?.content_en || '',
        prompt: '',
      };
      addProms.push(
        addSceneEntry(rec).then(async (newId) => {
          rec.entryId = newId;
          if (rec.content && typeof window.generateImagePromptFromScene === 'function' && gemini) {
            try {
              const p = await window.generateImagePromptFromScene(rec.content);
              if (p) {
                rec.prompt = p;
                await updateSceneEntry(rec);
              }
            } catch (e) {
              console.error('Err gen img prompt:', e);
            }
          }
          const imgProms = (sc.images || []).map((img) =>
            addSceneEntry({
              scenarioId: sId,
              type: 'image',
              sceneId: rec.sceneId,
              dataUrl: img.dataUrl || '',
              prompt: img.prompt || '',
            })
          );
          return Promise.all(imgProms);
        })
      );
    }
    await Promise.all(addProms);
    console.log(`Added ${scenes.length} scenes.`);
    // ★ 修正箇所: window を使わず、import した関数を直接呼び出す
    if (typeof loadScenarioData === 'function') {
      // import した関数があるか確認
      await loadScenarioData(sId); // 直接呼び出し (window. を削除)
      console.log(`Scenario ${sId} reloaded.`);
    } else {
      // この else は import が正しければ通常通りません
      console.error('loadScenarioData function is not imported or not found!');
      showToast('エラー: シナリオ再読込関数の呼び出しに失敗しました');
    }
  } catch (e) {
    console.error(`Failed load from slot ${sId}:`, e);
    showToast(`ロードエラー: ${e.message}`);
    throw e;
  } finally {
    if (typeof window.showLoadingModal === 'function') window.showLoadingModal(false);
  }
}

/**
 * 「全スロット初期化」ボタン処理
 */
export async function onClearAllSlots() {
  // (中身は変更なし - 省略せず記述)
  console.log('Clear all slots initiated.');
  multiModalOpen({
    title: '全スロット初期化',
    contentHtml: "<p style='color: #ffcccc;'><strong>警告:</strong> 全セーブデータ削除？</p>",
    okLabel: '全て初期化',
    okButtonColor: '#b71c1c',
    cancelLabel: 'キャンセル',
    onOk: async () => {
      console.log('Clearing all slots...');
      try {
        const slots = await listAllSlots();
        const delProms = slots.map((s) => dbDeleteUniversalSlot(s.slotIndex));
        await Promise.all(delProms);
        console.log(`Deleted ${slots.length} slots.`);
        await ensureInitialSlots();
        await renderSlotList();
        showToast('全スロット初期化完了');
      } catch (e) {
        console.error('Failed clear all:', e);
        showToast(`初期化エラー: ${e.message}`);
      }
    },
  });
}

// --- DB操作関数 (indexedDB.js から import した関数を使う) ---

/** スロットがなければ初期スロット5つを作成 */
async function ensureInitialSlots() {
  // (中身は変更なし - 省略せず記述)
  try {
    const all = await dbListAllSlots();
    if (all.length > 0) return;
    console.log('[SaveLoad/DB] Creating initial 5 slots...');
    const promises = [];
    for (let i = 1; i <= 5; i++) {
      const rec = {
        slotIndex: i,
        updatedAt: new Date().toISOString(),
        data: null,
      };
      promises.push(dbPutUniversalSave(rec));
    }
    await Promise.all(promises);
    console.log('[SaveLoad/DB] Initial slots created.');
  } catch (e) {
    console.error('Error ensuring initial slots:', e);
    throw e;
  }
}

/** 全スロットデータをDBから取得 */
async function listAllSlots() {
  // (中身は変更なし - 省略せず記述)
  try {
    const result = await dbListAllSlots();
    return result;
  } catch (e) {
    console.error('Error listing slots:', e);
    throw e;
  }
}

// --- ファイル読み込み完了ログ ---
console.log('[SaveLoad] universalSaveLoad.js loaded and functions exported.');
