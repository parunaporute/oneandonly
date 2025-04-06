/************************************************************
 * scenarioWizard.js
 * シナリオ作成ウィザード用スクリプト
 * ★ API クライアントは利用箇所で new して使用
 * ★ API呼び出しを Gemini API に変更
 * ★ ES Modules 形式、依存関数を import
 * ★ 省略なし (今度こそ！)
 ************************************************************/

// --- ★ モジュールインポート ---
import {
    initIndexedDB,
    loadWizardDataFromIndexedDB,
    saveWizardDataToIndexedDB,
    listAllParties,
    loadCharacterDataFromIndexedDB,
    loadAvatarData,
    createNewScenario,
    addSceneEntry,
    updateScenario,
    updateSceneEntry,
    getScenarioById,
    getSceneEntriesByScenarioId, // 必要なDB関数をインポート
    saveCharacterDataToIndexedDB, // clearCharBtn 用 (menu.js に移すべき？)
} from './indexedDB.js';
import { open as multiModalOpen } from './multiModal.js';
import { showToast } from './common.js';
import { initBackground } from './background.js';
// ★ API クライアントクラスをインポート
import { GeminiApiClient } from './geminiApiClient.js';
// import { StabilityApiClient } from './stabilityApiClient.js'; // このファイルでは使わない
// pako, DOMPurify はグローバルにある想定

// --- ★ ファイルスコープ変数 (クライアントインスタンスは都度生成) ---
let wizardData = {
    genre: '',
    title: '',
    scenarioType: '',
    clearCondition: '',
    scenarioSummary: '',
    scenarioSummaryEn: '',
    introScene: '',
    party: [],
    partyId: 0,
    currentPartyName: '',
    sections: [],
};
let wizStoredStageArr = [];
let wizStoredTheme = '';
let wizStoredMood = '';
let wizCustomStageChips = [];
let wizCustomThemeChips = [];
let wizCustomMoodChips = [];
let wizardCurrentOtherCategory = '';
let wizardDeletingChipLabel = '';
let wizardDeletingChipCategory = '';
let wizardChoice = '';
let wizardPartyList = [];

/** 指定ミリ秒待機する Promise ベースの sleep 関数 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ★ localStorage キー定数
const PREFERRED_GEMINI_MODEL_LS_KEY = 'preferredGeminiModel';

// --- 初期化処理 ---
window.addEventListener('DOMContentLoaded', async () => {
    console.log('[Wiz] DOMContentLoaded event fired.');
    try {
        // DB初期化
        console.log('Initializing DB...');
        await initIndexedDB(); // import
        console.log('DB initialized.');

        // 背景初期化
        if (typeof initBackground === 'function') await initBackground('scenarioWizard'); // import
        else console.warn('initBackground not found');

        // 戻るボタン
        const backBtn = document.getElementById('back-to-menu');
        if (backBtn)
            backBtn.addEventListener('click', () => {
                window.location.href = 'index.html';
            });

        // ウィザード状態読み込み
        const storedWizard = await loadWizardDataFromIndexedDB(); // import
        if (storedWizard) wizardData = storedWizard;
        console.log('Loaded wizard data:', wizardData);

        // チップ関連初期化 & パーティ一覧ロード＆表示 & ボタンイベント割り当て & UI初期更新
        initWizardChips(); // このファイル内
        wizardPartyList = await loadAndDisplayPartyList(); // このファイル内
        setupWizardEventListeners(); // このファイル内
        const axisChip = document.getElementById('choice-axis');
        const freeChip = document.getElementById('choice-free');
        if (axisChip && freeChip) {
            axisChip.addEventListener('click', () => {
                wizardChoice = 'axis';
                axisChip.classList.add('selected');
                freeChip.classList.remove('selected');
                enableAxisInput(true);
                enableFreeInput(false);
            });
            freeChip.addEventListener('click', () => {
                wizardChoice = 'free';
                freeChip.classList.add('selected');
                axisChip.classList.remove('selected');
                enableAxisInput(false);
                enableFreeInput(true);
            });
            wizardChoice = '';
            axisChip.classList.remove('selected');
            freeChip.classList.remove('selected');
            enableAxisInput(false);
            enableFreeInput(false);
        }
        updateSelectedGenreDisplay(); // このファイル内
        updateSummaryUI(); // このファイル内

        console.log('[Wiz] Scenario Wizard page initialized.');
    } catch (error) {
        console.error('[Wiz] Initialization error:', error);
        showToast(`ウィザード初期化エラー: ${error.message}`); // import
        document
            .querySelectorAll('#wizard-step0 button, #wizard-step1 button, #wizard-step2 button')
            .forEach((btn) => (btn.disabled = true));
    }
}); // End of DOMContentLoaded

/** ウィザード内のボタン等にイベントリスナーを設定 */
function setupWizardEventListeners() {
    console.log('[Wiz] Setting up wizard event listeners...');
    document.getElementById('go-wizard-step1-btn')?.addEventListener('click', onWizardStep0Next);
    document.getElementById('back-to-step0-button')?.addEventListener('click', onBackToStep0);
    document.getElementById('go-step2-btn')?.addEventListener('click', onGoStep2);
    document.getElementById('back-to-step1-button')?.addEventListener('click', onBackToStep1);
    document
        .getElementById('type-objective-btn')
        ?.addEventListener('click', () => onSelectScenarioType('objective'));
    document
        .getElementById('type-exploration-btn')
        ?.addEventListener('click', () => onSelectScenarioType('exploration'));
    document
        .getElementById('confirm-scenario-ok')
        ?.addEventListener('click', onConfirmScenarioModalOK);
    document
        .getElementById('confirm-scenario-cancel')
        ?.addEventListener('click', onConfirmScenarioModalCancel);
    document
        .getElementById('back-to-step2-button')
        ?.addEventListener('click', onBackToStep2FromStep3);
    document.getElementById('start-scenario-button')?.addEventListener('click', onStartScenario);
    document.getElementById('cancel-request-button')?.addEventListener('click', onCancelFetch);
    document
        .getElementById('wizard-other-generate-btn')
        ?.addEventListener('click', wizardOtherGenerate);
    document.getElementById('wizard-other-ok-btn')?.addEventListener('click', wizardOtherOk);
    document
        .getElementById('wizard-other-cancel-btn')
        ?.addEventListener('click', wizardOtherCancel);
    document
        .getElementById('wizard-delete-confirm-ok')
        ?.addEventListener('click', wizardDeleteConfirmOk);
    document
        .getElementById('wizard-delete-confirm-cancel')
        ?.addEventListener('click', wizardDeleteConfirmCancel);
    console.log('[Wiz] Wizard event listeners set up.');
}

// --- ステップ0: パーティ選択 ---

/** パーティ一覧を取得してラジオボタンで表示 */
async function loadAndDisplayPartyList() {
    console.log('[Wiz] Loading and displaying party list...');
    try {
        let avatarImageBase64 = '';
        const avatarData = await loadAvatarData('myAvatar'); // import
        if (avatarData?.imageData) avatarImageBase64 = avatarData.imageData;
        const allParties = await listAllParties(); // import
        const allChars = await loadCharacterDataFromIndexedDB(); // import
        const filtered = [];
        for (const p of allParties) {
            const cards = allChars.filter((c) => c.group === 'Party' && c.partyId === p.partyId);
            if (cards.length < 1) continue;
            let img = '';
            const av = cards.find((c) => c.role === 'avatar' && c.imageData);
            if (av) img = av.imageData;
            else {
                const fi = cards.find((c) => c.imageData);
                if (fi) img = fi.imageData;
            }
            filtered.push({
                partyId: p.partyId,
                name: p.name,
                updatedAt: p.updatedAt || '',
                avatarImage: img,
            });
        }
        filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        const youAvatarAsParty = {
            partyId: -1,
            name: 'あなたの分身',
            updatedAt: '',
            avatarImage: avatarImageBase64,
        };
        filtered.unshift(youAvatarAsParty);
        const container = document.getElementById('wizard-party-list');
        if (!container) throw new Error('Party list container not found.');
        container.innerHTML = ''; // クリア
        filtered.forEach((p) => {
            const row = document.createElement('div');
            row.className = 'wizard-party-row';
            const rb = document.createElement('input');
            rb.type = 'radio';
            rb.name = 'wizardPartyRadio';
            rb.value = String(p.partyId);
            if (wizardData.partyId === p.partyId) rb.checked = true;
            const uid = `radio-party-${p.partyId}`;
            rb.id = uid;
            const label = document.createElement('label');
            label.className = 'wizard-party-label';
            label.htmlFor = uid;
            if (p.avatarImage) {
                const img = document.createElement('img');
                img.src = p.avatarImage;
                img.alt = 'P';
                label.appendChild(img);
            } else {
                const ni = document.createElement('div');
                ni.className = 'no-image-box';
                ni.textContent = 'Img';
                label.appendChild(ni);
            }
            const span = document.createElement('span');
            const ymd = p.updatedAt?.split('T')[0] || '';
            if (p.partyId === -1) span.textContent = p.name;
            else span.textContent = `<span class="math-inline">\{p\.name\} \(更新\:</span>{ymd})`;
            label.appendChild(span);
            row.appendChild(rb);
            row.appendChild(label);
            container.appendChild(row);
        });
        // パーティなしオプション
        {
            const row = document.createElement('div');
            row.className = 'wizard-party-row';
            const rb = document.createElement('input');
            rb.type = 'radio';
            rb.name = 'wizardPartyRadio';
            rb.value = '0';
            const uid = 'radio-party-none';
            rb.id = uid;
            if (!wizardData.partyId || wizardData.partyId === 0) rb.checked = true;
            const label = document.createElement('label');
            label.className = 'wizard-party-label';
            label.htmlFor = uid;
            label.textContent = 'パーティなし';
            row.appendChild(rb);
            row.appendChild(label);
            container.appendChild(row);
        }
        console.log('[Wiz] Party list displayed.');
        return filtered;
    } catch (err) {
        console.error('Party list display failed:', err);
        const container = document.getElementById('wizard-party-list');
        if (container) container.innerHTML = `<p class="error">パーティ一覧読込失敗</p>`;
        return [];
    }
}

/** ステップ0 「次へ」ボタン処理 */
function onWizardStep0Next() {
    console.log('[Wiz] Step 0 Next clicked.');
    const checked = document.querySelector('input[name="wizardPartyRadio"]:checked');
    if (!checked) {
        alert('パーティ選択必須');
        return;
    }
    const pid = parseInt(checked.value, 10);
    wizardData.partyId = pid;
    if (pid === 0) wizardData.currentPartyName = 'パーティなし';
    else if (pid === -1) wizardData.currentPartyName = 'あなたの分身';
    else {
        const chosen = wizardPartyList.find((x) => x.partyId === pid);
        wizardData.currentPartyName = chosen ? chosen.name : '不明';
    }
    saveWizardDataToIndexedDB(wizardData).catch((e) =>
        console.error('Failed save wizard data step 0:', e)
    );
    document.getElementById('wizard-step0').style.display = 'none';
    document.getElementById('wizard-step1').style.display = 'block'; // import
}
/** ステップ1 「戻る」ボタン処理 */
function onBackToStep0() {
    console.log('[Wiz] Back to Step 0 clicked.');
    document.getElementById('wizard-step1').style.display = 'none';
    document.getElementById('wizard-step0').style.display = 'block';
}

// --- ステップ1: ジャンル選択 ---

/** 軸入力用チップ初期化 */
function initWizardChips() {
    console.log('[Wiz] Initializing wizard chips...');
    let stageJson = localStorage.getItem('elementStageArr') || '[]';
    try {
        wizStoredStageArr = JSON.parse(stageJson);
    } catch {
        wizStoredStageArr = [];
    }
    wizStoredTheme = localStorage.getItem('elementTheme') || '';
    wizStoredMood = localStorage.getItem('elementMood') || '';
    wizCustomStageChips = loadWizardCustom('customStageChips'); // 下で定義
    wizCustomThemeChips = loadWizardCustom('customThemeChips');
    wizCustomMoodChips = loadWizardCustom('customMoodChips');
    renderWizardStageChips(); // 下で定義
    renderWizardThemeChips(); // 下で定義
    renderWizardMoodChips(); // 下で定義
    updateWizGenreResultText(); // 下で定義
}
/** カスタムチップ読み込み */
function loadWizardCustom(key) {
    try {
        const v = localStorage.getItem(key);
        return v ? JSON.parse(v) : [];
    } catch {
        return [];
    }
}
/** 舞台チップ表示 */
function renderWizardStageChips() {
    const defs = ['ファンタジー', 'SF', '歴史', '現代', 'ホラー'];
    const cont = document.getElementById('wiz-stage-chips-container');
    if (!cont) return;
    cont.innerHTML = '';
    const all = [...defs, ...wizCustomStageChips, 'その他'];
    all.forEach((l) => cont.appendChild(createWizardChip(l, 'stage')));
}
/** テーマチップ表示 */
function renderWizardThemeChips() {
    const defs = ['冒険', 'ミステリー', 'ロマンス', 'コメディ', 'スリラー'];
    const cont = document.getElementById('wiz-theme-chips-container');
    if (!cont) return;
    cont.innerHTML = '';
    const all = [...defs, ...wizCustomThemeChips, 'その他'];
    all.forEach((l) => cont.appendChild(createWizardChip(l, 'theme')));
}
/** 雰囲気チップ表示 */
function renderWizardMoodChips() {
    const defs = ['明るい', '中間', 'ダーク'];
    const cont = document.getElementById('wiz-mood-chips-container');
    if (!cont) return;
    cont.innerHTML = '';
    const all = [...defs, ...wizCustomMoodChips, 'その他'];
    all.forEach((l) => cont.appendChild(createWizardChip(l, 'mood')));
}
/** 軸入力用チップ生成 */
function createWizardChip(label, category) {
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.textContent = label;
    const isOther = label === 'その他';
    if (category === 'stage' && wizStoredStageArr.includes(label)) chip.classList.add('selected');
    else if (category === 'theme' && wizStoredTheme === label) chip.classList.add('selected');
    else if (category === 'mood' && wizStoredMood === label) chip.classList.add('selected');
    chip.addEventListener('click', () => {
        if (!canEditAxisInput()) return;
        if (isOther) {
            openWizardOtherModal(category);
            return;
        }
        if (category === 'stage') {
            if (chip.classList.contains('selected')) {
                chip.classList.remove('selected');
                wizStoredStageArr = wizStoredStageArr.filter((x) => x !== label);
            } else {
                chip.classList.add('selected');
                wizStoredStageArr.push(label);
            }
            localStorage.setItem('elementStageArr', JSON.stringify(wizStoredStageArr));
        } else if (category === 'theme') {
            const cont = document.getElementById('wiz-theme-chips-container');
            cont?.querySelectorAll('.chip').forEach((c) => c.classList.remove('selected'));
            chip.classList.add('selected');
            wizStoredTheme = label;
            localStorage.setItem('elementTheme', wizStoredTheme);
        } else if (category === 'mood') {
            const cont = document.getElementById('wiz-mood-chips-container');
            cont?.querySelectorAll('.chip').forEach((c) => c.classList.remove('selected'));
            chip.classList.add('selected');
            wizStoredMood = label;
            localStorage.setItem('elementMood', wizStoredMood);
        }
        updateWizGenreResultText();
    });
    const isCustom =
        (category === 'stage' && wizCustomStageChips.includes(label)) ||
        (category === 'theme' && wizCustomThemeChips.includes(label)) ||
        (category === 'mood' && wizCustomMoodChips.includes(label));
    if (!isOther && isCustom) addWizardRemoveButton(chip, label, category); // 下で定義
    return chip;
}
/** カスタムチップ削除ボタン追加 */
function addWizardRemoveButton(chip, label, category) {
    const span = document.createElement('span');
    span.innerHTML = '&times;';
    span.style.marginLeft = '4px';
    span.style.cursor = 'pointer';
    span.style.color = 'red';
    span.title = '削除';
    span.addEventListener('click', (ev) => {
        ev.stopPropagation();
        wizardDeletingChipLabel = label;
        wizardDeletingChipCategory = category;
        document.getElementById('wizard-delete-confirm-modal')?.classList.add('active');
    });
    chip.appendChild(span);
}
/** 軸入力有効/無効 */
function enableAxisInput(flag) {
    const g = document.getElementById('axis-input-group');
    if (!g) return;
    if (flag) {
        g.style.display = 'block';
        g.style.pointerEvents = 'auto';
        g.style.opacity = '1.0';
    } else {
        g.style.display = 'none';
        g.style.pointerEvents = 'none';
        g.style.opacity = '0.2';
    }
}
/** 自由入力有効/無効 */
function enableFreeInput(flag) {
    const g = document.getElementById('free-input-group');
    if (!g) return;
    if (flag) {
        g.style.display = 'block';
        g.style.pointerEvents = 'auto';
        g.style.opacity = '1.0';
    } else {
        g.style.display = 'none';
        g.style.pointerEvents = 'none';
        g.style.opacity = '0.2';
    }
}
/** 軸入力モードか */
function canEditAxisInput() {
    return wizardChoice === 'axis';
}
/** 選択ジャンルテキスト更新 */
function updateWizGenreResultText() {
    const st = wizStoredStageArr.length ? `【舞台】${wizStoredStageArr.join('/')}` : '';
    const th = wizStoredTheme ? `【テーマ】${wizStoredTheme}` : '';
    const md = wizStoredMood ? `【雰囲気】${wizStoredMood}` : '';
    const joined = st + th + md || '（未設定）';
    const el = document.getElementById('wiz-genre-result-text');
    if (el) el.textContent = joined;
}
/** 「その他」モーダル表示 */
function openWizardOtherModal(category) {
    wizardCurrentOtherCategory = category;
    let ct = '';
    if (category === 'stage') ct = '舞台';
    else if (category === 'theme') ct = 'テーマ';
    else ct = '雰囲気';
    const title = document.getElementById('wizard-other-input-modal-category');
    if (title) title.textContent = `【${ct}】に候補を追加`;
    const input = document.getElementById('wizard-other-input-text');
    if (input) input.value = '';
    document.getElementById('wizard-other-input-modal')?.classList.add('active');
    input?.focus();
}

/** 「その他」候補生成 (Gemini API 使用) */
async function wizardOtherGenerate() {
    console.log("[Wiz] Generating 'Other' suggestion using Gemini...");
    const gemini = new GeminiApiClient(); // new
    if (!gemini.isAvailable) {
        alert('Gemini APIキー未設定/無効');
        return;
    }
    if (gemini.isStubMode) {
        /* スタブ */ return;
    }

    let existingList = [];
    let categoryJa = '';
    if (wizardCurrentOtherCategory === 'stage') {
        existingList = ['ファンタジー', 'SF', '歴史', '現代', 'ホラー', ...wizCustomStageChips];
        categoryJa = '舞台';
    } else if (wizardCurrentOtherCategory === 'theme') {
        existingList = [
            '冒険',
            'ミステリー',
            'ロマンス',
            'コメディ',
            'スリラー',
            ...wizCustomThemeChips,
        ];
        categoryJa = 'テーマ';
    } else if (wizardCurrentOtherCategory === 'mood') {
        existingList = ['明るい', '中間', 'ダーク', ...wizCustomMoodChips];
        categoryJa = '雰囲気';
    }

    showLoadingModal(true);
    try {
        const modelId =
            localStorage.getItem(PREFERRED_GEMINI_MODEL_LS_KEY) || 'gemini-1.5-flash-latest';
        const prompt = `TRPGの${categoryJa}設定の新アイデア提案。既存: <span class="math-inline">\{existingList\.join\(" / "\)\}\\nこれらと異なるユニークな</span>{categoryJa}のアイデアを**1つだけ**短い単語かフレーズで提案(提案のみ出力)。`;
        gemini.initializeHistory([]);
        const newCandidate = await gemini.generateContent(prompt, modelId);
        const cleaned = newCandidate.replace(/["'「」]/g, '').trim();
        const inputEl = document.getElementById('wizard-other-input-text');
        if (inputEl) {
            inputEl.value = cleaned;
            inputEl.focus();
        }
        showToast('新しい候補を生成'); // import
    } catch (err) {
        console.error('候補生成失敗:', err);
        alert('候補生成失敗:\n' + err.message);
    } finally {
        showLoadingModal(false);
    }
}
/** 「その他」モーダルOK */
function wizardOtherOk() {
    const val = document.getElementById('wizard-other-input-text')?.value.trim();
    document.getElementById('wizard-other-input-modal')?.classList.remove('active');
    if (!val) return;
    if (wizardCurrentOtherCategory === 'stage') {
        if (!wizCustomStageChips.includes(val)) {
            wizCustomStageChips.push(val);
            localStorage.setItem('customStageChips', JSON.stringify(wizCustomStageChips));
        }
        renderWizardStageChips();
    } else if (wizardCurrentOtherCategory === 'theme') {
        if (!wizCustomThemeChips.includes(val)) {
            wizCustomThemeChips.push(val);
            localStorage.setItem('customThemeChips', JSON.stringify(wizCustomThemeChips));
        }
        renderWizardThemeChips();
    } else if (wizardCurrentOtherCategory === 'mood') {
        if (!wizCustomMoodChips.includes(val)) {
            wizCustomMoodChips.push(val);
            localStorage.setItem('customMoodChips', JSON.stringify(wizCustomMoodChips));
        }
        renderWizardMoodChips();
    }
    updateWizGenreResultText();
}
/** 「その他」モーダルキャンセル */
function wizardOtherCancel() {
    document.getElementById('wizard-other-input-modal')?.classList.remove('active');
}
/** 削除確認OK */
function wizardDeleteConfirmOk() {
    if (wizardDeletingChipCategory === 'stage') {
        wizCustomStageChips = wizCustomStageChips.filter((c) => c !== wizardDeletingChipLabel);
        localStorage.setItem('customStageChips', JSON.stringify(wizCustomStageChips));
        wizStoredStageArr = wizStoredStageArr.filter((s) => s !== wizardDeletingChipLabel);
        localStorage.setItem('elementStageArr', JSON.stringify(wizStoredStageArr));
        renderWizardStageChips();
    } else if (wizardDeletingChipCategory === 'theme') {
        wizCustomThemeChips = wizCustomThemeChips.filter((c) => c !== wizardDeletingChipLabel);
        localStorage.setItem('customThemeChips', JSON.stringify(wizCustomThemeChips));
        if (wizStoredTheme === wizardDeletingChipLabel) {
            wizStoredTheme = '';
            localStorage.setItem('elementTheme', '');
        }
        renderWizardThemeChips();
    } else if (wizardDeletingChipCategory === 'mood') {
        wizCustomMoodChips = wizCustomMoodChips.filter((c) => c !== wizardDeletingChipLabel);
        localStorage.setItem('customMoodChips', JSON.stringify(wizCustomMoodChips));
        if (wizStoredMood === wizardDeletingChipLabel) {
            wizStoredMood = '';
            localStorage.setItem('elementMood', '');
        }
        renderWizardMoodChips();
    }
    document.getElementById('wizard-delete-confirm-modal')?.classList.remove('active');
    wizardDeletingChipLabel = '';
    wizardDeletingChipCategory = '';
    updateWizGenreResultText();
}
/** 削除確認キャンセル */
function wizardDeleteConfirmCancel() {
    document.getElementById('wizard-delete-confirm-modal')?.classList.remove('active');
    wizardDeletingChipLabel = '';
    wizardDeletingChipCategory = '';
}

// --- ステップ1 → ステップ2 ---
/** ステップ1 「次へ」ボタン */
function onGoStep2() {
    console.log('Step 1 Next');
    if (!wizardChoice) {
        alert('入力方法選択');
        return;
    }
    if (wizardChoice === 'axis') {
        const r = buildChipsGenre();
        if (!r) {
            alert('軸入力選択');
            return;
        }
        wizardData.genre = r;
    } else {
        const fv = document.getElementById('free-genre-input')?.value.trim();
        if (!fv) {
            alert('自由入力');
            return;
        }
        wizardData.genre = fv;
    }
    saveWizardDataToIndexedDB(wizardData).catch((e) => console.error(e));
    document.getElementById('wizard-step1').style.display = 'none';
    document.getElementById('wizard-step2').style.display = 'block';
    updateSelectedPartyDisplay();
    updateSelectedGenreDisplay();
}
/** チップ選択からジャンル文字列生成 */
function buildChipsGenre() {
    const st = wizStoredStageArr.length ? `【舞台】${wizStoredStageArr.join('/')}` : '';
    const th = wizStoredTheme ? `【テーマ】${wizStoredTheme}` : '';
    const md = wizStoredMood ? `【雰囲気】${wizStoredMood}` : '';
    return st + th + md;
}
/** ステップ2 「戻る」ボタン */
function onBackToStep1() {
    console.log('Back to Step 1');
    document.getElementById('wizard-step2').style.display = 'none';
    document.getElementById('wizard-step1').style.display = 'block';
}
/** UI: 選択パーティ表示更新 */
function updateSelectedPartyDisplay() {
    const el = document.getElementById('selected-party-display');
    if (el) el.textContent = wizardData.currentPartyName || '(未選択)';
}
/** UI: 選択ジャンル表示更新 */
function updateSelectedGenreDisplay() {
    const el = document.getElementById('selected-genre-display');
    if (el) el.textContent = wizardData.genre || '（未選択）';
}

// --- ステップ2: シナリオタイプ選択 → 確認モーダル ---
/** シナリオタイプ選択 */
function onSelectScenarioType(type) {
    console.log(`Type selected: ${type}`);
    wizardData.scenarioType = type;
    saveWizardDataToIndexedDB(wizardData).catch((e) => console.error(e));
    const typeLbl = type === 'objective' ? '目的達成型' : '探索型';
    const partyEl = document.getElementById('confirm-party-text');
    if (partyEl) partyEl.textContent = 'パーティ: ' + (wizardData.currentPartyName || '(未選択)');
    const confirmEl = document.getElementById('confirm-genre-type-text');
    if (confirmEl) confirmEl.textContent = `ジャンル: ${wizardData.genre}\nタイプ: ${typeLbl}`;
    document.getElementById('confirm-scenario-modal')?.classList.add('active');
}
/** 確認モーダルキャンセル */
function onConfirmScenarioModalCancel() {
    document.getElementById('confirm-scenario-modal')?.classList.remove('active');
    console.log('Scenario confirm cancelled.');
}
/** 確認モーダルOK → シナリオ生成処理開始 (★ 待機処理追加) */
async function onConfirmScenarioModalOK() {
    console.log('[Wiz] Confirm scenario OK. Starting generation...');
    showLoadingModal(true);
    document.getElementById('confirm-scenario-modal')?.classList.remove('active');

    try {
        await storePartyInWizardData(); // パーティ情報反映
        console.log('[Wiz] Generating summary...');
        if (wizardData.scenarioType === 'objective') {
            await generateScenarioSummaryAndClearCondition();
        } else {
            await generateScenarioSummary();
        }
        await sleep(1000); // ★ 1秒待機 (API制限回避のため)

        console.log('[Wiz] Generating English summary...');
        await generateScenarioSummaryEn();
        await sleep(1000); // ★ 1秒待機

        console.log('[Wiz] Generating sections...');
        await generateSections(); // ★ 内部でも待機処理を追加
        // generateSections の完了を待つ (内部でエラーが出ても継続する可能性あり)
        console.log('[Wiz] Finished generating sections (or encountered errors).');
        await sleep(1000); // ★ 1秒待機

        console.log('[Wiz] Generating intro scene...');
        await generateIntroScene();
        await sleep(1000); // ★ 1秒待機

        // ★ タイトル生成は必須でなければ、後回しにするか、生成頻度を下げる検討も
        console.log('[Wiz] Generating title...');
        wizardData.title = await generateScenarioTitle(wizardData.scenarioSummary);
        console.log(`[Wiz] Generated title: ${wizardData.title}`);
        // タイトル生成後の DB 保存は onStartScenario で行う

        // ステップ3へ遷移 & UI更新
        document.getElementById('wizard-step2').style.display = 'none';
        document.getElementById('wizard-step3').style.display = 'block';
        updateSummaryUI();
        console.log('[Wiz] Scenario data generation process finished (check summary UI).');
    } catch (err) {
        // generate... 関数内でエラーが throw された場合
        console.error('[Wiz] シナリオ生成プロセス全体でエラー:', err);
        // エラーメッセージは各関数内で表示されるはずだが、ここでも表示
        alert(
            'シナリオ生成中にエラーが発生しました。詳細はコンソールを確認してください。\n' +
                err.message
        );
        document.getElementById('wizard-step3').style.display = 'none';
        document.getElementById('wizard-step2').style.display = 'block'; // ステップ2に戻す
    } finally {
        showLoadingModal(false);
    }
}

/** セクション目標生成 (★ 待機処理追加) */
async function generateSections() {
    console.log('[Wiz] Generating sections...');
    const gemini = new GeminiApiClient();
    if (!gemini.isAvailable) {
        wizardData.sections = [];
        return;
    }
    if (gemini.isStubMode) {
        /* スタブ */ return;
    }
    const count = Math.floor(Math.random() * 3) + 2; // 2-4個
    const modelId =
        localStorage.getItem(PREFERRED_GEMINI_MODEL_LS_KEY) || 'gemini-1.5-flash-latest';
    const prompt = `TRPG目標作成AIとして情報に基づき達成目標${count}個リストアップ...`; // 前と同じプロンプト
    try {
        gemini.initializeHistory([]);
        const responseText = await gemini.generateContent(prompt, modelId);
        console.log('[Wiz] Raw resp (Sections):', responseText);
        const lines = responseText
            .split('\n')
            .map((l) => l.trim().replace(/^[\s・\-*]\s*/, ''))
            .filter((l) => l);
        wizardData.sections = [];
        if (lines.length > 0) {
            // ★ 翻訳処理を直列化し、間に待機を入れる
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const zipped = zipString(line);
                let condEn = '';
                try {
                    // ★ 翻訳呼び出しの前に待機 (例: 1.5秒)
                    await sleep(1500);
                    console.log(`[Wiz] Translating section ${i + 1}: ${line}`);
                    condEn = await generateEnglishTranslation(line); // ヘルパー関数呼び出し
                } catch (e) {
                    console.error(`Section ${i + 1} translation failed:`, e);
                    condEn = '(EN translation failed)';
                    // ★ 翻訳失敗しても次の処理に進むが、API制限に引っかかっている可能性を示唆
                    showToast(
                        `目標${i + 1}の翻訳でエラーが発生しました。API制限の可能性があります。`
                    );
                    await sleep(5000); // ★ エラー時は長めに待つ (例: 5秒)
                }
                wizardData.sections.push({
                    number: i + 1,
                    conditionZipped: zipped,
                    conditionEn: condEn,
                    cleared: false,
                });
            }
        } else {
            /* ダミー生成 */
        }
        await saveWizardDataToIndexedDB(wizardData);
        console.log(`[Wiz] ${wizardData.sections.length} sections generated.`);
    } catch (err) {
        /* ... エラー処理 ... */ throw err;
    }
}

// ★ 英語翻訳ヘルパーにも待機を入れるとより安全 (オプション)
async function generateEnglishTranslation(japaneseText) {
    if (!japaneseText?.trim()) return '';
    const gemini = new GeminiApiClient();
    if (!gemini.isAvailable) throw new Error('翻訳APIキー未設定/無効');
    const modelId =
        localStorage.getItem(PREFERRED_GEMINI_MODEL_LS_KEY) || 'gemini-1.5-flash-latest';
    const prompt = `Translate Japanese to English:\nJA:\n${japaneseText}\nEN:`;
    try {
        // ★ 翻訳API呼び出し前にも少し待機 (オプション)
        // await sleep(500); // 0.5秒
        gemini.initializeHistory([]);
        return (await gemini.generateContent(prompt, modelId)).trim();
    } catch (e) {
        console.error('EN Translation failed:', e);
        throw e;
    }
}

/** パーティ情報を wizardData.party に格納 */
async function storePartyInWizardData() {
    console.log('Storing party data...');
    const pid = wizardData.partyId || 0;
    if (pid === 0) {
        wizardData.party = [];
        await saveWizardDataToIndexedDB(wizardData);
        return;
    }
    if (pid === -1) {
        const avatar = await loadMyAvatarData();
        if (avatar) wizardData.party = [convertAvatarToPartyCard(avatar)];
        else wizardData.party = [];
        await saveWizardDataToIndexedDB(wizardData);
        return;
    }
    const allChars = await loadCharacterDataFromIndexedDB();
    if (!allChars) {
        wizardData.party = [];
        await saveWizardDataToIndexedDB(wizardData);
        return;
    }
    const partyCards = allChars.filter((c) => c.group === 'Party' && c.partyId === pid);
    const stripped = partyCards.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        rarity: c.rarity,
        state: c.state,
        special: c.special,
        caption: c.caption,
        backgroundcss: c.backgroundcss,
        imageprompt: c.imageprompt,
        role: c.role,
        imageData: c.imageData,
    }));
    wizardData.party = stripped;
    await saveWizardDataToIndexedDB(wizardData);
    console.log('Party data stored.');
}
/** アバターデータ読込 */
async function loadMyAvatarData() {
    return await loadAvatarData('myAvatar');
}
/** アバターをパーティカード形式に変換 */
function convertAvatarToPartyCard(avatar) {
    return {
        id: 'avatar-' + Date.now(),
        name: avatar.name || 'アバター',
        type: 'キャラクター',
        rarity: avatar.rarity || '★1',
        state: '',
        special: avatar.skill || '',
        caption: avatar.serif || '',
        backgroundcss: '',
        imageprompt: '',
        role: 'avatar',
        imageData: avatar.imageData || '',
    };
}

// --- シナリオ生成関連 (★ Gemini API 呼び出し) ---

/** シナリオ概要とクリア条件生成 */
async function generateScenarioSummaryAndClearCondition() {
    console.log('[Wiz] Generating summary & condition...');
    const gemini = new GeminiApiClient();
    if (!gemini.isAvailable) {
        wizardData.scenarioSummary = '(APIキーエラー)';
        wizardData.clearCondition = '';
        return;
    }
    if (gemini.isStubMode) {
        wizardData.scenarioSummary = '目的達成型スタブ概要';
        wizardData.clearCondition = 'スタブ条件';
        return;
    }
    const modelId =
        localStorage.getItem(PREFERRED_GEMINI_MODEL_LS_KEY) || 'gemini-1.5-flash-latest';
    const prompt = `TRPGシナリオAIとして概要とクリア条件生成。\n条件:ジャンル:${wizardData.genre},タイプ:目的達成型\n出力形式:シナリオ概要(200字程度)\n【クリア条件】\n具体的クリア条件(1つ)`;
    try {
        gemini.initializeHistory([]);
        const text = await gemini.generateContent(prompt, modelId);
        console.log('Raw resp (Summ&Cond):', text);
        if (text.includes('【クリア条件】')) {
            const arr = text.split('【クリア条件】');
            wizardData.scenarioSummary = arr[0].trim();
            wizardData.clearCondition = arr[1]?.trim() || '(失敗)';
        } else {
            wizardData.scenarioSummary = text.trim();
            wizardData.clearCondition = '(抽出失敗)';
        }
        await saveWizardDataToIndexedDB(wizardData);
    } catch (err) {
        console.error('Fail gen summ/cond:', err);
        wizardData.scenarioSummary = '(エラー)';
        wizardData.clearCondition = '';
        await saveWizardDataToIndexedDB(wizardData);
        throw err;
    }
}
/** シナリオ概要生成 (探索型) */
async function generateScenarioSummary() {
    console.log('[Wiz] Generating summary (Exploration)...');
    const gemini = new GeminiApiClient();
    if (!gemini.isAvailable) {
        wizardData.scenarioSummary = '(APIキーエラー)';
        return;
    }
    if (gemini.isStubMode) {
        wizardData.scenarioSummary = '探索型スタブ概要';
        return;
    }
    const modelId =
        localStorage.getItem(PREFERRED_GEMINI_MODEL_LS_KEY) || 'gemini-1.5-flash-latest';
    const prompt = `TRPG概要AIとして概要(200字程度,日本語)生成。\nジャンル:${wizardData.genre}\nタイプ:探索型`;
    try {
        gemini.initializeHistory([]);
        const summary = await gemini.generateContent(prompt, modelId);
        wizardData.scenarioSummary = summary.trim() || '(失敗)';
        await saveWizardDataToIndexedDB(wizardData);
    } catch (err) {
        console.error('Fail gen summary:', err);
        wizardData.scenarioSummary = '(エラー)';
        await saveWizardDataToIndexedDB(wizardData);
        throw err;
    }
}
/** シナリオ概要の英語翻訳 */
async function generateScenarioSummaryEn() {
    console.log('[Wiz] Generating English summary...');
    const jp = wizardData.scenarioSummary || '';
    if (!jp.trim() || jp.startsWith('(')) {
        wizardData.scenarioSummaryEn = '';
        return;
    }
    const gemini = new GeminiApiClient();
    if (!gemini.isAvailable) {
        wizardData.scenarioSummaryEn = '(翻訳APIエラー)';
        return;
    }
    if (gemini.isStubMode) {
        wizardData.scenarioSummaryEn = '(Stub EN)';
        return;
    }
    const modelId =
        localStorage.getItem(PREFERRED_GEMINI_MODEL_LS_KEY) || 'gemini-1.5-flash-latest';
    const prompt = `Translate Japanese TRPG summary to English.\nJA:\n${jp}\nEN:`;
    try {
        gemini.initializeHistory([]);
        const enSummary = await gemini.generateContent(prompt, modelId);
        wizardData.scenarioSummaryEn = enSummary.trim() || '(失敗)';
        await saveWizardDataToIndexedDB(wizardData);
    } catch (err) {
        console.error('Fail gen EN summary:', err);
        wizardData.scenarioSummaryEn = '(エラー)';
        await saveWizardDataToIndexedDB(wizardData);
        showToast(`概要英訳失敗: ${err.message}`);
    }
}
/** 文字列圧縮 */
function zipString(str) {
    if (!str) return '';
    try {
        const u = new TextEncoder().encode(str);
        const d = pako.deflate(u);
        return btoa(String.fromCharCode(...d));
    } catch (e) {
        console.error('zipString error:', e);
        return '';
    }
}
/** 導入シーン生成 */
async function generateIntroScene() {
    console.log('[Wiz] Generating intro scene...');
    const gemini = new GeminiApiClient();
    if (!gemini.isAvailable) {
        wizardData.introScene = '(APIキーエラー)';
        return;
    }
    if (gemini.isStubMode) {
        wizardData.introScene = 'スタブ導入';
        return;
    }
    const modelId =
        localStorage.getItem(PREFERRED_GEMINI_MODEL_LS_KEY) || 'gemini-1.5-flash-latest';
    const prompt = `TRPGライターとして情報から導入シーン(日本語,300字程度)生成。\n概要:\n${
        wizardData.scenarioSummary
    }\nパーティ:\n${buildPartyInsertionText(wizardData.party || [])}\n\n導入シーン:`;
    try {
        gemini.initializeHistory([]);
        const intro = await gemini.generateContent(prompt, modelId);
        wizardData.introScene = intro.trim() || '(失敗)';
        await saveWizardDataToIndexedDB(wizardData);
    } catch (err) {
        wizardData.introScene = '(エラー)';
        await saveWizardDataToIndexedDB(wizardData);
        throw err;
    }
}

// --- ステップ3: シナリオ要約表示 ---

/** ステップ2に戻る */
function onBackToStep2FromStep3() {
    console.log('Back to Step 2');
    document.getElementById('wizard-step3').style.display = 'none';
    document.getElementById('wizard-step2').style.display = 'block';
}
/** 「このシナリオで始める」ボタン処理 */
async function onStartScenario() {
    console.log('[Wiz] Start Scenario clicked.');
    try {
        wizardData.title = await generateScenarioTitle(wizardData.scenarioSummary);
        console.log(`Generated title: ${wizardData.title}`);
        const scenarioId = await createNewScenario(wizardData, wizardData.title);
        console.log(`New scenario ID: ${scenarioId}`);
        if (wizardData.introScene && !wizardData.introScene.startsWith('(')) {
            const introEn = await generateEnglishTranslation(wizardData.introScene);
            const firstScene = {
                scenarioId,
                type: 'scene',
                sceneId: 'intro_' + Date.now(),
                content: wizardData.introScene,
                content_en: introEn,
                actionContent: '(導入)',
                actionContent_en: '(Intro)',
                prompt: '',
            };
            const entryId = await addSceneEntry(firstScene);
            console.log(`Intro scene added ID: ${entryId}`);
            if (typeof generateImagePromptFromScene === 'function') {
                firstScene.prompt = await generateImagePromptFromScene(firstScene.content);
                firstScene.entryId = entryId;
                await updateSceneEntry(firstScene);
            }
        }
        console.log(`Redirecting to scenario.html?scenarioId=${scenarioId}`);
        window.location.href = `scenario.html?scenarioId=${scenarioId}`;
    } catch (err) {
        console.error('シナリオ開始失敗:', err);
        alert('開始失敗: ' + err.message);
    }
}
/** シナリオ概要からタイトルを作成 */
async function generateScenarioTitle(summary) {
    console.log('[Wiz] Generating scenario title...');
    const defaultTitle =
        '新シナリオ ' +
        new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    const gemini = new GeminiApiClient();
    if (!gemini.isAvailable || !summary?.trim() || summary.startsWith('(')) return defaultTitle;
    if (gemini.isStubMode) return 'スタブタイトル';
    const modelId =
        localStorage.getItem(PREFERRED_GEMINI_MODEL_LS_KEY) || 'gemini-1.5-flash-latest';
    const prompt = `以下概要から魅力的な日本語タイトルを1つだけ生成(タイトルのみ出力):\n概要:\n${summary}\nタイトル:`;
    try {
        gemini.initializeHistory([]);
        const title = await gemini.generateContent(prompt, modelId);
        return title.trim().replace(/["'「」『』]/g, '') || defaultTitle;
    } catch (err) {
        console.error('Failed gen title:', err);
        return 'タイトル生成エラー';
    }
}

// --- UIヘルパー ---
/** シナリオ要約をUIに表示 */
function updateSummaryUI() {
    const el = document.getElementById('scenario-summary');
    if (!el) return;
    const sanitized = DOMPurify.sanitize(wizardData.scenarioSummary || '(未生成)');
    el.innerHTML = sanitized || '(概要表示不可)';
}
/** ローディングモーダル表示/非表示 */
function showLoadingModal(show) {
    const m = document.getElementById("loading-modal");
    if (!m) return;
    if (show) {
      m.classList.add("active");
    } else {
      m.classList.remove("active");
    }
}
/** APIリクエストキャンセル試行 */
function onCancelFetch() {
    console.warn('Cancel requested (not fully supported).');
    showLoadingModal(false);
    showToast('キャンセル試行...');
}
/** パーティ情報文章化 (日本語) */
function buildPartyInsertionText(party) {
    if (!party?.length) return 'パーティメンバーなし';
    let txt = '';
    party.forEach((p) => {
        txt += `- Name: ${p.name} (${p.type})`;
        if (p.role === 'avatar') txt += ' [あなた]';
        if (p.role === 'partner') txt += ' [パートナー]';
        txt += `\n  詳細: ${p.special || p.caption || '(詳細なし)'}\n`;
    });
    return txt;
}

/** 画像プロンプト生成ヘルパー */
async function generateImagePromptFromScene(sceneTextJa) {
    if (!sceneTextJa?.trim()) return '';
    const gemini = new GeminiApiClient();
    if (!gemini.isAvailable) return '';
    const modelId =
        localStorage.getItem(PREFERRED_GEMINI_MODEL_LS_KEY) || 'gemini-1.5-flash-latest';
    const prompt = `Extract English keywords for image generation from Japanese scene:\nJA:\n${sceneTextJa}\nEN Keywords:`;
    try {
        gemini.initializeHistory([]);
        const keywords = await gemini.generateContent(prompt, modelId);
        return keywords.replace(/\n/g, ', ').replace(/, ,/g, ',').trim();
    } catch (e) {
        console.error('Img prompt gen failed:', e);
        return '';
    }
}

// --- ファイル読み込み完了ログ ---
console.log('[Wiz] scenarioWizard.js loaded.');
