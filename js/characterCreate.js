// characterCreate.js
// キャラクター・アイテム・モンスター生成画面の処理。
// API呼び出しを Gemini API (gemini) に変更。

// --- 依存関数・グローバル変数 ---
// gemini, window.geminiApiKey (from menu.js)
// window.characterData (from menu.js)
// window.initIndexedDB, window.loadCharacterDataFromIndexedDB, window.saveCharacterDataToIndexedDB (from indexedDB.js)
// initBackground (from background.js)
// window.showToast (from common.js)
// DOMPurify (external library)
// --- モジュールスコープ変数 ---
let storedStageArr = []; // 選択中の「舞台」
let storedMood = ''; // 選択中の「雰囲気」
let customStageChips = []; // カスタム「舞台」チップ
let customMoodChips = []; // カスタム「雰囲気」チップ
let currentOtherCategory = ''; // 「その他」モーダルで編集中カテゴリ
let deletingChipLabel = ''; // 削除確認中のチップラベル
let deletingChipCategory = ''; // 削除確認中のチップカテゴリ
import { runGacha } from './gachaCore.js';
import { initBackground } from './background.js';
import { loadCharacterDataFromIndexedDB, saveCharacterDataToIndexedDB } from './indexedDB.js';
import { GeminiApiClient } from './geminiApiClient.js';
import { StabilityApiClient } from './stabilityApiClient.js';

console.log('こけこっこ');
// ★ localStorage キー定数
const PREFERRED_GEMINI_MODEL_LS_KEY = 'preferredGeminiModel';
const gemini = new GeminiApiClient(); // new
const modelId = localStorage.getItem(PREFERRED_GEMINI_MODEL_LS_KEY) || 'gemini-1.5-flash-latest';
const stability = new StabilityApiClient(); // new

// --- DOMContentLoaded イベントリスナー ---
window.addEventListener('DOMContentLoaded', async function () {
  console.log('[CharCreate] DOMContentLoaded event fired.');
  console.log('こけこっこ');

  try {
    console.log('こけこっこ');
    // IndexedDB初期化
    await window.initIndexedDB(); // DB関数
    console.log('[CharCreate] IndexedDB initialized.');

    // 背景初期化 (characterCreateページ用)
    await initBackground('characterCreate'); // background.js関数

    // グローバルAPIキー/クライアントの存在確認 (menu.jsで設定されている想定)

    if (!gemini) {
      console.warn('[CharCreate] Gemini client not found. Some features might be disabled.');
      // 必要ならAPIキー設定を促すメッセージを表示
      if (!localStorage.getItem('geminiApiKey') && typeof showToast === 'function') {
        showToast('APIキーが設定されていません。index.htmlで設定してください。');
      }
    }
    console.log('こけこっこ');

    // メニューに戻るボタン
    const backBtn = document.getElementById('back-to-menu');
    if (backBtn) {
      backBtn.addEventListener('click', function () {
        console.log('[CharCreate] Back to menu button clicked.');
        window.location.href = 'index.html';
      });
    } else {
      console.warn('[CharCreate] Back to menu button not found.');
    }

    // このページ読み込み時にもキャラデータをロード (倉庫などから戻ってきた場合のため)
    const storedChars = await loadCharacterDataFromIndexedDB(); // DB関数
    if (storedChars) {
      window.characterData = storedChars;
      console.log(`[CharCreate] Loaded ${window.characterData.length} character data entries on page load.`);
    }
    console.log('こけこっこ');
    // localStorage から選択中のジャンル等を読み込み
    loadGenreSelection();
    // カスタムチップ読み込み
    customStageChips = loadCustomChipsFromLocalStorage('customStageChips');
    customMoodChips = loadCustomChipsFromLocalStorage('customMoodChips');

    // UIイベント登録
    setupEventListeners();

    // チップ表示初期化
    initStageChips();
    initMoodChips();

    // 「選んだジャンルの出力例」 ラベル更新
    updateGenreResultLabel();

    // 直近生成カード表示
    displayLatestCards();
    // リサイズ時の再描画
    window.addEventListener('resize', displayLatestCards);

    console.log('[CharCreate] Character creation page initialized.');
  } catch (error) {
    console.error('[CharCreate] Error during page initialization:', error);
    if (typeof showToast === 'function') showToast(`初期化エラー: ${error.message}`);
    // エラー発生時のUI制御
    disableGachaFeaturesOnError();
  }
}); // End of DOMContentLoaded

/** localStorageからジャンル選択状態を読み込む */
function loadGenreSelection() {
  try {
    const stageJson = localStorage.getItem('elementStageArr');
    storedStageArr = stageJson ? JSON.parse(stageJson) : [];
    storedMood = localStorage.getItem('elementMood') || '';
    console.log('[CharCreate] Loaded genre selection:', {
      stages: storedStageArr,
      mood: storedMood,
    });
  } catch (e) {
    console.error('[CharCreate] Failed to load genre selection from localStorage:', e);
    storedStageArr = [];
    storedMood = '';
    // 不正なデータがあれば削除
    localStorage.removeItem('elementStageArr');
    localStorage.removeItem('elementMood');
  }
}

/** カスタムチップをLocalStorageから読み込む */
function loadCustomChipsFromLocalStorage(key) {
  try {
    const json = localStorage.getItem(key);
    const chips = json ? JSON.parse(json) : [];
    console.log(`[CharCreate] Loaded ${chips.length} custom chips for ${key}.`);
    return Array.isArray(chips) ? chips : []; // 配列でなければ空を返す
  } catch (e) {
    console.error(`[CharCreate] Failed to load custom chips for ${key}:`, e);
    localStorage.removeItem(key); // 不正データ削除
    return [];
  }
}

/** カスタムチップをLocalStorageへ保存 */
function saveCustomChipsToLocalStorage(key, arr) {
  try {
    localStorage.setItem(key, JSON.stringify(arr));
    console.log(`[CharCreate] Saved ${arr.length} custom chips for ${key}.`);
  } catch (e) {
    console.error(`[CharCreate] Failed to save custom chips for ${key}:`, e);
    if (typeof showToast === 'function') showToast('カスタムチップの保存に失敗しました。');
  }
}

/** UIイベントリスナーを設定 */
function setupEventListeners() {
  console.log('U');
  console.log('[CharCreate] Setting up event listeners...');
  document.getElementById('gacha-btn')?.addEventListener('click', onGachaButton);
  document.getElementById('genre-setting-ok-btn')?.addEventListener('click', onGenreSettingOk);
  document.getElementById('genre-setting-cancel-btn')?.addEventListener('click', onGenreSettingCancel);

  // 「その他」モーダル
  document.getElementById('other-generate-btn')?.addEventListener('click', onOtherGenerate); // ★ Gemini使用
  document.getElementById('other-ok-btn')?.addEventListener('click', onOtherOk);
  document.getElementById('other-cancel-btn')?.addEventListener('click', onOtherCancel);

  // 「削除」確認モーダル
  document.getElementById('delete-confirm-ok')?.addEventListener('click', onDeleteConfirmOk);
  document.getElementById('delete-confirm-cancel')?.addEventListener('click', onDeleteConfirmCancel);

  // 「すべて見る」ボタン
  document.getElementById('see-all-btn')?.addEventListener('click', onSeeAllCards);

  // カードプレビューモーダル (multiModal化推奨だが既存実装を残す場合)
  const previewCloseBtn = document.getElementById('card-preview-close-btn');
  previewCloseBtn?.addEventListener('click', closeCardPreview);
  const cardPreviewModal = document.getElementById('card-image-preview-modal');
  cardPreviewModal?.addEventListener('click', (e) => {
    if (e.target === cardPreviewModal) closeCardPreview();
  });

  // ガチャ実行中モーダルのキャンセルボタン
  const cancelGachaBtn = document.getElementById('cancel-gacha-btn');
  if (cancelGachaBtn) {
    // ★ キャンセル処理は GeminiApiClient が未対応のため、機能を限定/削除
    cancelGachaBtn.addEventListener('click', () => {
      console.warn('[CharCreate] Cancel Gacha button clicked, but cancellation might not stop the API call.');
      // window.cancelRequested = true; // フラグを立てる
      document.getElementById('gacha-modal')?.classList.remove('active'); // モーダルを閉じる
      if (typeof showToast === 'function') showToast('キャンセルを試みます...(APIによっては停止できません)');
    });
  }
  console.log('[CharCreate] Event listeners set up.');
}

/** エラー発生時にガチャ関連機能を無効化 */
function disableGachaFeaturesOnError() {
  document.getElementById('gacha-btn')?.setAttribute('disabled', 'true');
  document.querySelectorAll('.chip').forEach((el) => (el.style.pointerEvents = 'none'));
  // 他にも無効化すべきUIがあれば追加
  console.error('[CharCreate] Gacha features disabled due to error.');
}

/* -------------------------
   チップ生成・表示・操作
------------------------- */

/** 「舞台」チップ表示初期化 */
function initStageChips() {
  const defaultStageCandidates = ['ファンタジー', 'SF', '歴史・時代劇', '現代', 'ホラー / ダーク'];
  const container = document.getElementById('stage-chips-container');
  if (!container) return;
  container.innerHTML = ''; // クリア
  const allStageChips = [...defaultStageCandidates, ...customStageChips, 'その他'];
  allStageChips.forEach((label) => {
    const chip = createChipElement(label, 'stage');
    container.appendChild(chip);
  });
  console.log('[CharCreate] Stage chips initialized.');
}

/** 「雰囲気」チップ表示初期化 */
function initMoodChips() {
  const defaultMoodCandidates = ['ライト / ポップ', '中間 / バランス型', 'ダーク / シリアス'];
  const container = document.getElementById('mood-chips-container');
  if (!container) return;
  container.innerHTML = ''; // クリア
  const allMoodChips = [...defaultMoodCandidates, ...customMoodChips, 'その他'];
  allMoodChips.forEach((label) => {
    const chip = createChipElement(label, 'mood');
    container.appendChild(chip);
  });
  console.log('[CharCreate] Mood chips initialized.');
}

/** チップ要素を作成 */
function createChipElement(label, category) {
  const isOther = label === 'その他';
  const chip = document.createElement('div');
  chip.className = 'chip';
  chip.textContent = label;
  chip.title = label; // ホバーでラベル全体表示

  // 初期選択状態を設定
  if (category === 'stage' && storedStageArr.includes(label)) {
    chip.classList.add('selected');
  } else if (category === 'mood' && storedMood === label) {
    chip.classList.add('selected');
  }

  // クリックイベント
  chip.addEventListener('click', () => {
    console.log(`[CharCreate] Chip clicked - Category: ${category}, Label: ${label}`);
    if (isOther) {
      openOtherModal(category); // 「その他」モーダルを開く
      return;
    }
    // 選択状態の更新と保存
    if (category === 'stage') {
      const selected = chip.classList.toggle('selected');
      if (selected) {
        if (!storedStageArr.includes(label)) storedStageArr.push(label);
      } else {
        storedStageArr = storedStageArr.filter((x) => x !== label);
      }
      localStorage.setItem('elementStageArr', JSON.stringify(storedStageArr));
    } else if (category === 'mood') {
      const container = document.getElementById('mood-chips-container');
      const currentlySelected = container?.querySelector('.chip.selected');
      if (currentlySelected === chip) {
        // 同じものをクリックしたら解除
        chip.classList.remove('selected');
        storedMood = '';
      } else {
        // 違うものをクリックしたら切り替え
        currentlySelected?.classList.remove('selected');
        chip.classList.add('selected');
        storedMood = label;
      }
      localStorage.setItem('elementMood', storedMood);
    }
    updateGenreResultLabel(); // 選択結果ラベル更新
  });

  // カスタムチップ用の削除ボタンを追加
  if (!isOther) {
    const isCustom = (category === 'stage' && customStageChips.includes(label)) || (category === 'mood' && customMoodChips.includes(label));
    if (isCustom) {
      addRemoveButton(chip, label, category);
    }
  }

  return chip;
}

/** チップに削除ボタンを追加 */
function addRemoveButton(chip, label, category) {
  const span = document.createElement('span');
  span.innerHTML = '&times;'; // ×記号
  span.style.marginLeft = '5px';
  span.style.padding = '0 3px';
  span.style.cursor = 'pointer';
  span.style.color = '#ff8a8a'; // 少し薄い赤
  span.style.fontWeight = 'bold';
  span.title = 'このカスタム候補を削除';
  span.addEventListener('click', (e) => {
    e.stopPropagation(); // チップ本体のクリックイベント抑制
    console.log(`[CharCreate] Remove button clicked for custom chip: ${label} (${category})`);
    deletingChipLabel = label;
    deletingChipCategory = category;
    // 確認モーダル表示 (multiModal推奨だが既存実装に合わせる)
    document.getElementById('delete-confirm-modal')?.classList.add('active');
  });
  chip.appendChild(span);
}

/** 「その他」追加モーダルを開く */
function openOtherModal(category) {
  console.log(`[CharCreate] Opening 'Other' input modal for category: ${category}`);
  currentOtherCategory = category;
  const titleEl = document.getElementById('other-input-modal-category');
  if (titleEl) titleEl.textContent = category === 'stage' ? '【舞台】に候補を追加' : '【雰囲気】に候補を追加';
  const inputEl = document.getElementById('other-input-text');
  if (inputEl) inputEl.value = ''; // 入力欄クリア
  document.getElementById('other-input-modal')?.classList.add('active');
  if (inputEl) inputEl.focus(); // 開いたらフォーカス
}

/** 「その他」候補をAIで生成 (★ Gemini API 使用) */
async function onOtherGenerate() {
  console.log("[CharCreate] Generating 'Other' suggestion using Gemini...");
  // ★ APIクライアントチェック
  if (!stability) {
    if (typeof alert === 'function') alert('APIクライアントが利用できません。');
    return;
  }
  if (stability.isStubMode) {
    console.warn('[CharCreate] Running onOtherGenerate in STUB MODE.');
    // スタブモードのダミー応答
    const dummySuggestion = currentOtherCategory === 'stage' ? `ダミー舞台${Math.random().toString(16).substring(2, 6)}` : `ダミー雰囲気${Math.random().toString(16).substring(2, 6)}`;
    const inputEl = document.getElementById('other-input-text');
    if (inputEl) inputEl.value = dummySuggestion;
    if (typeof showToast === 'function') showToast('スタブ候補を生成しました。');
    return;
  }

  let existingList = [];
  const categoryJa = currentOtherCategory === 'stage' ? '舞台' : '雰囲気';
  if (currentOtherCategory === 'stage') {
    existingList = ['ファンタジー', 'SF', '歴史・時代劇', '現代', 'ホラー / ダーク', ...customStageChips];
  } else {
    existingList = ['ライト / ポップ', '中間 / バランス型', 'ダーク / シリアス', ...customMoodChips];
  }

  // ローディング表示 (既存のガチャモーダル流用)
  const gachaModal = document.getElementById('gacha-modal');
  if (gachaModal) gachaModal.classList.add('active');

  try {
    // Gemini 向けプロンプト (日本語)
    const prompt = `あなたは創造的なアイデアを出すアシスタントです。TRPGの${categoryJa}設定の新しいアイデアを提案してください。
既存の候補は以下の通りです:
${existingList.join(' / ')}

これらとは異なる、ユニークで魅力的な${categoryJa}のアイデアを**1つだけ**、簡潔な単語または短いフレーズで提案してください。提案する単語・フレーズのみを出力し、他の文章は含めないでください。`;

    gemini.initializeHistory([]); // 履歴リセット
    const newCandidate = await gemini.generateContent(prompt, modelId);

    // 応答を整形 (余計な部分があれば除去)
    const cleanedCandidate = newCandidate.replace(/["'「」]/g, '').trim(); // クォートなどを除去
    const inputEl = document.getElementById('other-input-text');
    if (inputEl) {
      inputEl.value = cleanedCandidate; // 結果を入力欄に設定
      inputEl.focus();
    }
    if (typeof showToast === 'function') showToast('新しい候補を生成しました。');
  } catch (err) {
    console.error('[CharCreate] その他候補生成失敗:', err);
    if (typeof showToast === 'function') showToast(`候補生成失敗: ${err.message}`);
  } finally {
    if (gachaModal) gachaModal.classList.remove('active'); // ローディング非表示
  }
}

/** 「その他」モーダルOKボタン */
function onOtherOk() {
  const inputEl = document.getElementById('other-input-text');
  const text = inputEl?.value.trim();
  document.getElementById('other-input-modal')?.classList.remove('active');
  if (!text) return; // 入力がなければ何もしない

  console.log(`[CharCreate] Adding custom chip: ${text} to ${currentOtherCategory}`);
  if (currentOtherCategory === 'stage') {
    if (!customStageChips.includes(text)) {
      customStageChips.push(text);
      saveCustomChipsToLocalStorage('customStageChips', customStageChips);
      // 選択状態にする（任意）
      if (!storedStageArr.includes(text)) storedStageArr.push(text);
      localStorage.setItem('elementStageArr', JSON.stringify(storedStageArr));
    }
    initStageChips(); // チップ再描画
  } else if (currentOtherCategory === 'mood') {
    if (!customMoodChips.includes(text)) {
      customMoodChips.push(text);
      saveCustomChipsToLocalStorage('customMoodChips', customMoodChips);
      // 選択状態にする（単一選択なので既存選択を解除）
      storedMood = text;
      localStorage.setItem('elementMood', storedMood);
    }
    initMoodChips(); // チップ再描画
  }
  updateGenreResultLabel(); // ラベル更新
}

/** 「その他」モーダルキャンセルボタン */
function onOtherCancel() {
  document.getElementById('other-input-modal')?.classList.remove('active');
  console.log("[CharCreate] 'Other' input modal cancelled.");
}

/** カスタムチップ削除確認OKボタン */
function onDeleteConfirmOk() {
  document.getElementById('delete-confirm-modal')?.classList.remove('active');
  console.log(`[CharCreate] Confirming deletion of chip: ${deletingChipLabel} (${deletingChipCategory})`);

  if (!deletingChipLabel || !deletingChipCategory) return;

  if (deletingChipCategory === 'stage') {
    customStageChips = customStageChips.filter((c) => c !== deletingChipLabel);
    saveCustomChipsToLocalStorage('customStageChips', customStageChips);
    // 選択状態からも削除
    storedStageArr = storedStageArr.filter((x) => x !== deletingChipLabel);
    localStorage.setItem('elementStageArr', JSON.stringify(storedStageArr));
    initStageChips(); // 再描画
  } else if (deletingChipCategory === 'mood') {
    customMoodChips = customMoodChips.filter((c) => c !== deletingChipLabel);
    saveCustomChipsToLocalStorage('customMoodChips', customMoodChips);
    // 選択状態からも削除
    if (storedMood === deletingChipLabel) {
      storedMood = '';
      localStorage.setItem('elementMood', '');
    }
    initMoodChips(); // 再描画
  }

  // 削除情報をリセット
  deletingChipLabel = '';
  deletingChipCategory = '';
  updateGenreResultLabel(); // ラベル更新
  if (typeof showToast === 'function') showToast('カスタム候補を削除しました。');
}

/** カスタムチップ削除確認キャンセルボタン */
function onDeleteConfirmCancel() {
  // 削除情報をリセット
  deletingChipLabel = '';
  deletingChipCategory = '';
  document.getElementById('delete-confirm-modal')?.classList.remove('active');
  console.log('[CharCreate] Chip deletion cancelled.');
}

/** 「選んだジャンルの出力例」ラベルを更新 */
function updateGenreResultLabel() {
  const labelEl = document.getElementById('genre-result-text');
  if (!labelEl) return;
  let stagePart = storedStageArr.length > 0 ? '【舞台】' + storedStageArr.join(' / ') : '';
  let moodPart = storedMood ? '【雰囲気】' + storedMood : '';
  const separator = stagePart && moodPart ? ' ' : ''; // スペース区切り
  labelEl.textContent = stagePart + separator + moodPart || '（ジャンル未選択）';
}

/* -------------------------
   ガチャ（生成）関連
------------------------- */

/** ガチャボタンクリック → ジャンル選択モーダル表示 */
function onGachaButton() {
  console.log('[CharCreate] Gacha button clicked. Opening genre modal.');
  // チップを最新状態にしてからモーダル表示
  initStageChips();
  initMoodChips();
  updateGenreResultLabel(); // ラベルも更新
  document.getElementById('element-genre-modal')?.classList.add('active');
}

/** ジャンル設定OKボタン → ガチャ実行 */
function onGenreSettingOk() {
  document.getElementById('element-genre-modal')?.classList.remove('active');
  console.log('[CharCreate] Genre setting OK. Starting gacha...');

  const axisPrompt = buildAxisPrompt(); // 選択されたジャンルからプロンプト軸を作成
  const gachaModal = document.getElementById('gacha-modal'); // ローディングモーダル
  if (gachaModal) gachaModal.classList.add('active');
  debugger;
  // ★ runGacha を呼び出し (async)
  runGacha(10, axisPrompt) // 10連ガチャ実行
    .then(() => {
      console.log('[CharCreate] Gacha finished successfully.');
      // 生成後、最新のIDリストを再取得して表示
      displayLatestCards();
      // ボタン表示制御
      showSeeAllButtonIfNeeded();
    })
    .catch((err) => {
      console.error('[CharCreate] Gacha execution failed:', err);
      // エラーメッセージ表示は runGacha 内で行う想定
    })
    .finally(() => {
      if (gachaModal) gachaModal.classList.remove('active'); // ローディング非表示
    });
}

/** ジャンル設定キャンセルボタン */
function onGenreSettingCancel() {
  document.getElementById('element-genre-modal')?.classList.remove('active');
  console.log('[CharCreate] Genre setting cancelled.');
}

/** 選択されたジャンルからプロンプトの軸を作成 */
function buildAxisPrompt() {
  const lines = [];
  if (storedStageArr.length > 0) {
    lines.push('【舞台】' + storedStageArr.join(' / '));
  }
  if (storedMood) {
    lines.push('【雰囲気】' + storedMood);
  }
  const prompt = lines.join('\n');
  console.log('[CharCreate] Built axis prompt:', prompt);
  return prompt;
}

/** 「すべて見る」ボタンの表示/非表示制御 */
function showSeeAllButtonIfNeeded() {
  // 引数削除
  const seeAllBtn = document.getElementById('see-all-btn');
  if (!seeAllBtn) return;

  // 直近生成IDリストを取得
  const storedIdsStr = localStorage.getItem('latestCreatedIds') || '[]';
  let storedIds = [];
  try {
    storedIds = JSON.parse(storedIdsStr);
  } catch {
    storedIds = [];
  }

  // 直近生成カードの中に flipped なものがあるかチェック
  const hasFlipped = window.characterData.some((c) => c && storedIds.includes(c.id) && c.flipped === true);
  seeAllBtn.style.display = hasFlipped ? 'inline-block' : 'none';
  console.log(`[CharCreate] See All button visibility: ${hasFlipped}`);
}

/** 「すべて見る」ボタンクリック時の処理 */
async function onSeeAllCards() {
  console.log('[CharCreate] See All button clicked.');
  const seeAllBtn = document.getElementById('see-all-btn');
  if (seeAllBtn) seeAllBtn.style.display = 'none'; // ボタンを隠す

  // 直近生成IDリストを取得
  const storedIdsStr = localStorage.getItem('latestCreatedIds') || '[]';
  let storedIds = [];
  try {
    storedIds = JSON.parse(storedIdsStr);
  } catch {
    storedIds = [];
  }

  // 対象カード要素を取得
  const cardElements = Array.from(document.querySelectorAll('#card-container .card.flipped')).filter((el) => storedIds.includes(el.dataset.id));

  if (cardElements.length === 0) {
    console.log('[CharCreate] No flipped cards to reveal.');
    return; // 対象がなければ終了
  }

  // 順番にフリップ解除アニメーション
  for (let i = 0; i < cardElements.length; i++) {
    const cardEl = cardElements[i];
    const cardId = cardEl.dataset.id;
    const charIndex = window.characterData.findIndex((c) => c && c.id === cardId);

    if (charIndex !== -1) {
      window.characterData[charIndex].flipped = false; // データ更新
      cardEl.classList.remove('flipped'); // UI更新
      console.log(`[CharCreate] Revealed card ${cardId}.`);
      await new Promise((resolve) => setTimeout(resolve, 100)); // 表示ディレイ
    }
  }

  // 全て解除したらDB保存
  try {
    await saveCharacterDataToIndexedDB(window.characterData);
    console.log('[CharCreate] Saved flipped state after revealing all.');
  } catch (error) {
    console.error('[CharCreate] Failed to save flipped state:', error);
    if (typeof showToast === 'function') showToast('カード状態の保存に失敗しました。');
    // 必要ならUIを元に戻す処理
  }
  // 再描画は不要（既にUI更新済み）
}

/** 直近生成したカードをカードコンテナに表示 */
function displayLatestCards() {
  const container = document.getElementById('card-container');
  if (!container) return;

  const storedIdsStr = localStorage.getItem('latestCreatedIds') || '[]';
  let storedIds = [];
  try {
    storedIds = JSON.parse(storedIdsStr);
  } catch {
    storedIds = [];
  }

  console.log(`[CharCreate] Displaying ${storedIds.length} recently created cards.`);
  container.innerHTML = ''; // クリア

  if (storedIds.length === 0) {
    container.textContent = 'まだエレメントが生成されていません。「ガチャ実行」ボタンを押してください。';
    return;
  }

  const cardsToShow = window.characterData.filter((c) => c && storedIds.includes(c.id));
  // 念のためIDリストの順序に合わせる (任意)
  cardsToShow.sort((a, b) => storedIds.indexOf(a.id) - storedIds.indexOf(b.id));

  if (cardsToShow.length === 0) {
    container.textContent = '表示対象のエレメントが見つかりません。';
    return;
  }

  cardsToShow.forEach((ch) => {
    const cardEl = createCardElement(ch); // カード要素生成
    if (cardEl) container.appendChild(cardEl);
  });

  // 最終行が埋まらない場合にダミー要素を追加して左寄せにする
  fillDummyItemsForLastRow(container, cardsToShow.length);
  console.log(`[CharCreate] Rendered ${cardsToShow.length} cards.`);
  showSeeAllButtonIfNeeded(); // ボタン表示更新
}

/** カード要素生成 (既存の関数を流用・調整) */
function createCardElement(char) {
  if (!char || !char.id) return null;

  const card = document.createElement('div');
  const rarityNum = parseInt((char.rarity || '★1').replace('★', ''), 10) || 1;
  card.className = `card rarity${rarityNum}`;
  card.setAttribute('data-id', char.id);
  card.title = `${char.name || '無名'} (${char.type || '不明'} - ${char.rarity || '★?'})`; // ホバーで情報表示

  // 裏向き状態
  if (char.flipped) {
    card.classList.add('flipped');
  }

  // クリックイベント
  card.addEventListener('click', async () => {
    // async追加
    if (card.classList.contains('flipped')) {
      // 表向きにする
      card.classList.remove('flipped');
      char.flipped = false;
      const idx = window.characterData.findIndex((c) => c && c.id === char.id);
      if (idx !== -1) window.characterData[idx].flipped = false;
      try {
        await saveCharacterDataToIndexedDB(window.characterData); // DB保存
        console.log(`[CharCreate] Card ${char.id} flipped state saved (false).`);
      } catch (e) {
        console.error('Failed to save flipped state:', e);
        card.classList.add('flipped'); // エラー時は戻す
        char.flipped = true;
        if (idx !== -1) window.characterData[idx].flipped = true;
      }
    } else {
      // 画像プレビュー
      if (char.imageData) {
        openCardPreview(char.imageData); // 既存のプレビューモーダル
      } else {
        if (typeof showToast === 'function') showToast('このカードには画像がありません。');
      }
    }
  });

  // --- カード内部 (省略せず記述) ---
  const cardInner = document.createElement('div');
  cardInner.className = 'card-inner';

  const cardFront = document.createElement('div');
  cardFront.className = 'card-front';
  cardFront.innerHTML = `<div class='bezel rarity${rarityNum}'></div>`;
  const bgStyle = (char.backgroundcss || '').replace(/background[^:]*:/i, '').trim();
  if (bgStyle) cardFront.style.background = bgStyle;

  const typeEl = document.createElement('div');
  typeEl.className = 'card-type';
  typeEl.textContent = char.type || '不明';
  cardFront.appendChild(typeEl);

  const imageContainer = document.createElement('div');
  imageContainer.className = 'card-image';
  if (char.imageData) {
    const imageEl = document.createElement('img');
    imageEl.src = char.imageData;
    imageEl.alt = char.name || 'カード画像';
    imageEl.loading = 'lazy';
    // 回転は倉庫で設定するので、ここでは不要かも
    // applyRotationToElement(imageEl, char.rotationAngle);
    imageContainer.appendChild(imageEl);
  } else {
    const genImgBtn = document.createElement('button');
    genImgBtn.className = 'gen-image-btn';
    genImgBtn.innerHTML = `<span class="iconmoon icon-picture"></span> 生成`;
    genImgBtn.title = 'このカードの画像を生成';
    genImgBtn.addEventListener('click', async (e) => {
      // async追加
      e.stopPropagation();
      await generateCharacterImage(char, genImgBtn); // ★ Gemini で生成
    });
    imageContainer.appendChild(genImgBtn);
  }
  cardFront.appendChild(imageContainer);

  const infoContainer = document.createElement('div');
  infoContainer.className = 'card-info';
  const nameEl = document.createElement('p');
  nameEl.innerHTML = `<h3>${DOMPurify.sanitize(char.name || '(名称未設定)')}</h3>`;
  infoContainer.appendChild(nameEl);
  if (char.state) {
    const stateEl = document.createElement('p');
    stateEl.innerHTML = `<strong>状態:</strong> ${DOMPurify.sanitize(char.state)}`;
    infoContainer.appendChild(stateEl);
  }
  if (char.special) {
    const specialEl = document.createElement('p');
    specialEl.innerHTML = `<strong>特技:</strong> ${DOMPurify.sanitize(char.special)}`;
    infoContainer.appendChild(specialEl);
  }
  if (char.caption) {
    const captionEl = document.createElement('p');
    captionEl.innerHTML = `<span>${DOMPurify.sanitize(char.caption)}</span>`;
    infoContainer.appendChild(captionEl);
  }
  cardFront.appendChild(infoContainer);

  const cardBack = document.createElement('div');
  cardBack.className = 'card-back';
  cardBack.innerHTML = `<strong>${DOMPurify.sanitize(char.type || '?')}</strong><br><small>${DOMPurify.sanitize(char.rarity || '')}</small>`; // 裏面にもレア度表示

  cardInner.appendChild(cardFront);
  cardInner.appendChild(cardBack);
  card.appendChild(cardInner);

  return card;
}

/** 既存のカード画像プレビューモーダルを開く */
function openCardPreview(imageUrl) {
  const modal = document.getElementById('card-image-preview-modal');
  const imgEl = document.getElementById('card-preview-img');
  if (modal && imgEl) {
    imgEl.src = imageUrl;
    modal.classList.add('active');
    console.log('[CharCreate] Card image preview opened.');
  } else {
    console.error('[CharCreate] Card preview modal elements not found.');
  }
}
/** 既存のカード画像プレビューモーダルを閉じる */
function closeCardPreview() {
  const modal = document.getElementById('card-image-preview-modal');
  if (modal) {
    modal.classList.remove('active');
    const imgEl = document.getElementById('card-preview-img');
    if (imgEl) imgEl.src = ''; // 画像ソースをクリア (メモリ解放のため)
    console.log('[CharCreate] Card image preview closed.');
  }
}

/** キャラクターカードの画像を生成 (★ Stability AI API 使用に書き換え) */
async function generateCharacterImage(char, btnElement) {
  if (!char || !char.id) return;
  console.log(`[CharCreate] Generating image for character card ${char.id}...`); // --- ▼▼▼ Stability AI API 呼び出しに変更 ▼▼▼ --- // ★ APIクライアントチェック (Stability AI と 翻訳用 Gemini の両方)

  if (!stability || !gemini) {
    // stability と gemini をチェック
    if (typeof showToast === 'function') showToast('画像生成または翻訳用のAPIクライアントが利用できません。');
    console.error('[CharCreate] Stability AI or Gemini client not available.');
    return;
  } // ★ スタブモードチェック (Stability AI と 翻訳用 Gemini)

  if (stability.isStubMode || gemini.isStubMode) {
    console.warn('[CharCreate] Running generateCharacterImage in STUB MODE (Stability/Gemini).'); // スタブ処理 (stabilityApiClient のスタブ応答を利用)
    try {
      // stability.generateImage は Base64 配列を返す想定
      const stubResults = await stability.generateImage('stub prompt');
      const stubImageData = stubResults?.[0]?.imageDataB64 || stability.stubImageResponse; // imageDataB64 を使用
      char.imageData = stubImageData.startsWith('data:image') ? stubImageData : 'data:image/png;base64,' + stubImageData; // 必要ならData URL形式へ

      const idx = window.characterData.findIndex((c) => c && c.id === char.id);
      if (idx !== -1) {
        window.characterData[idx].imageData = char.imageData;
        window.characterData[idx].rotationAngle = 0; // 回転もリセット
      }
      await saveCharacterDataToIndexedDB(window.characterData);
      displayLatestCards();
      if (typeof showToast === 'function') showToast('スタブ画像を設定しました。');
    } catch (stubError) {
      console.error('[CharCreate] Stub image generation failed:', stubError);
      if (typeof showToast === 'function') showToast('スタブ画像処理に失敗しました。');
    }
    return;
  } // ★ キー有効性チェック (Stability AI と 翻訳用 Gemini)
  if (!stability.isAvailable || !gemini.isAvailable) {
    if (typeof showToast === 'function') showToast('必要なAPIキーが設定されていないか無効です。');
    console.error('[CharCreate] Stability AI or Gemini API key is not valid or not set.');
    return;
  }

  if (btnElement) btnElement.disabled = true;
  if (typeof showToast === 'function') showToast('画像を生成しています...'); // プロンプト取得 (日本語)

  const promptJa = char.imageprompt || buildAxisPrompt() + `\n${char.name} ${char.caption}`; // フォールバック
  if (!promptJa.trim()) {
    if (typeof showToast === 'function') showToast('画像生成用のプロンプトがありません。');
    if (btnElement) btnElement.disabled = false;
    return;
  }
  console.log('[CharCreate] Original prompt (JA):', promptJa);

  let promptEn = ''; // 英語プロンプト用変数

  try {
    // --- プロンプト英語翻訳 (Geminiを使用) ---
    try {
      console.log('[CharCreate] Translating prompt to English using Gemini...');
      const translationPrompt = `Translate Japanese description to English keywords/phrases for image prompt:\n---\n${promptJa}\n---\nEnglish Keywords:`;
      gemini.initializeHistory([]); // 履歴リセット
      promptEn = await gemini.generateContent(
        translationPrompt,
        modelId // グローバル変数 modelId を使用
      );
      console.log(`[CharCreate] Translated prompt (EN): "${promptEn}"`);
      if (!promptEn?.trim()) throw new Error('翻訳結果が空です');
    } catch (translateError) {
      console.error('[CharCreate] Prompt translation failed:', translateError);
      throw new Error(`プロンプト英語翻訳失敗: ${translateError.message}`);
    } // --- Stability AI オプション設定 (avatar.js を参考) ---

    const rarityNum = parseInt((char.rarity || '★1').replace('★', ''), 10) || 1;
    // width:1344, height:768 nealy 16:9
    let width = 1344,
      height = 768,
      stylePreset = 'anime'; // デフォルト (アイテムなど)
    if (rarityNum >= 3) {
      width = 768;
      height = 1344;
    }

    const imageOptions = {
      samples: 1,
      width: width,
      height: height,
      style_preset: stylePreset, // 必要なら他のオプションを追加 (例: negative_prompt) // negative_prompt: "worst quality, low quality, text, signature, watermark, username",
    };
    console.log('[CharCreate] Calling stabilityClient.generateImage with options:', imageOptions); // --- ★ StabilityApiClient を使って画像生成 ---

    const imageResults = await stability.generateImage(promptEn, imageOptions); // Stability API は Base64 文字列を含む配列を返す

    const base64ImageData = imageResults?.[0]?.imageDataB64;

    if (!base64ImageData) {
      throw new Error('APIから有効な画像データを取得できませんでした。');
    } // Base64 を Data URL に変換

    const dataUrl = 'data:image/png;base64,' + base64ImageData; // characterData を更新して IndexedDB に保存

    const idx = window.characterData.findIndex((c) => c && c.id === char.id);
    if (idx !== -1) {
      window.characterData[idx].imageData = dataUrl;
      window.characterData[idx].rotationAngle = 0; // 画像生成時は回転リセット
      await saveCharacterDataToIndexedDB(window.characterData);
      console.log(`[CharCreate] Image generated and saved for card ${char.id}.`);
      if (typeof showToast === 'function') showToast('画像の生成が完了しました。'); // 表示を更新
      displayLatestCards(); // カード一覧を再描画
    } else {
      console.warn(`[CharCreate] Card ${char.id} not found after image generation.`);
    }
  } catch (err) {
    console.error('[CharCreate] 画像生成プロセス中にエラー:', err); // エラーログ改善
    if (typeof showToast === 'function') showToast(`画像生成に失敗: ${err.message}`);
  } finally {
    if (btnElement) btnElement.disabled = false; // ボタン有効化
  } // --- ▲▲▲ Stability AI API 呼び出しに変更 ▲▲▲ ---
}
/** 最終行がカラム数に満たない場合、ダミー要素を追加して左寄せにする */
function fillDummyItemsForLastRow(container, realCount) {
  if (!container || realCount <= 0) return;
  const firstCard = container.querySelector('.card:not(.dummy)');
  if (!firstCard) return; // 表示するカードがない場合は何もしない

  const containerWidth = container.clientWidth;
  if (containerWidth <= 0) return; // コンテナ幅がなければ計算不可

  // カード幅とギャップを取得 (CSSから計算)
  const cardStyle = getComputedStyle(firstCard);
  const cardWidth = parseFloat(cardStyle.width) || 300; // デフォルト幅
  const containerStyle = getComputedStyle(container);
  const gap = parseFloat(containerStyle.gap) || 15; // デフォルトギャップ

  // 1行あたりのアイテム数を計算
  let itemsPerRow = Math.max(1, Math.floor((containerWidth + gap) / (cardWidth + gap)));

  // ダミーが必要か計算
  const remainder = realCount % itemsPerRow;
  if (remainder === 0) return; // ちょうど埋まっている場合は不要

  const dummyCount = itemsPerRow - remainder;
  console.log(`[CharCreate] Adding ${dummyCount} dummy items to fill last row (itemsPerRow: ${itemsPerRow}).`);
  for (let i = 0; i < dummyCount; i++) {
    const dummyEl = document.createElement('div');
    dummyEl.className = 'card dummy'; // スタイル適用のためクラス付与
    // ダミー要素のサイズを実際のカードに合わせる（CSSで .dummy に width, height, marginなどを設定推奨）
    dummyEl.style.width = `${cardWidth}px`; // 幅を合わせる
    dummyEl.style.height = '0'; // 高さは0にしてスペースを取らないようにするか、枠線だけにするなど
    dummyEl.style.margin = cardStyle.margin; // マージンを合わせる
    dummyEl.style.padding = '0';
    dummyEl.style.border = 'none';
    dummyEl.style.visibility = 'hidden'; // 表示はしない
    container.appendChild(dummyEl);
  }
}

// --- ファイル読み込み完了ログ ---
console.log('[CharCreate] characterCreate.js loaded.');
