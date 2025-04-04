/************************************************************
 * scenarioWizard.js
 * シナリオ作成ウィザード用スクリプト
 * ★ API呼び出しを Gemini API (geminiClient) に変更
 * ★ プロンプトを Gemini 向けに調整
 * ★ ES Modules 化はせず、元のグローバル形式を維持
 * ★ 省略なし
 ************************************************************/

// --- グローバル変数 (他ファイルで定義・設定される想定) ---
// window.db (IndexedDB connection from indexedDB.js)
// window.geminiClient (GeminiApiClient instance from menu.js)
// window.multiModal (from multiModal.js)
// window.showToast (from common.js)
// window.initBackground (from background.js)
// window.DOMPurify (external library)
// window.pako (external library)
// DBアクセス関数 (getScenarioById, updateScenario, etc. from indexedDB.js)
// listAllParties, loadCharacterDataFromIndexedDB (from indexedDB.js)

// --- ウィザード用状態変数 (モジュールスコープの代わり) ---
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
    sections: [], // sections も追加
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
let wizardChoice = ''; // "axis" or "free"
let wizardPartyList = []; // パーティ選択用

// --- 初期化処理 ---
window.addEventListener('DOMContentLoaded', async () => {
    console.log('[Wiz] DOMContentLoaded event fired.');
    try {
        // DB初期化 (initIndexedDB は他で呼ばれる想定だが念のため)
        if (!window.db && typeof window.initIndexedDB === 'function') {
            console.log('[Wiz] Initializing IndexedDB from Wizard...');
            await window.initIndexedDB();
            console.log('[Wiz] IndexedDB initialized.');
        } else if (!window.db) {
            throw new Error('IndexedDB is not initialized and init function not found.');
        }

        // 背景初期化
        if (typeof window.initBackground === 'function')
            await window.initBackground('scenarioWizard');

        // APIクライアントの存在確認 (menu.js などで初期化されているはず)
        if (!window.geminiClient)
            console.warn(
                '[Wiz] Gemini Client (window.geminiClient) not found. AI generation features will be disabled.'
            );
        // APIキーの読み込み (表示や一部機能で使う可能性) - グローバルにある想定
        // window.apiKey = localStorage.getItem("geminiApiKey") || ""; // Geminiキーを読み込む

        // 戻るボタン
        const backBtn = document.getElementById('back-to-menu');
        if (backBtn)
            backBtn.addEventListener('click', () => {
                window.location.href = 'index.html';
            });

        // 以前のウィザード状態読み込み
        if (typeof window.loadWizardDataFromIndexedDB === 'function') {
            const storedWizard = await window.loadWizardDataFromIndexedDB();
            if (storedWizard) wizardData = storedWizard;
            console.log('[Wiz] Loaded wizard data:', wizardData);
        }

        // チップ関連初期化
        initWizardChips();

        // パーティ一覧ロード＆表示
        wizardPartyList = await loadAndDisplayPartyList();

        // ボタンイベント割り当て
        setupWizardEventListeners();

        // 軸/自由入力トグル初期化
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
            // 初期状態はどちらも選択解除
            wizardChoice = '';
            axisChip.classList.remove('selected');
            freeChip.classList.remove('selected');
            enableAxisInput(false);
            enableFreeInput(false);
        }

        // UI初期更新
        updateSelectedGenreDisplay();
        updateSummaryUI(); // ステップ3の要約表示 (データがあれば)

        console.log('[Wiz] Scenario Wizard page initialized.');
    } catch (error) {
        console.error('[Wiz] Initialization error:', error);
        if (typeof window.showToast === 'function')
            window.showToast(`ウィザード初期化エラー: ${error.message}`);
        // エラー時は主要ボタンを無効化するなど
        document
            .querySelectorAll('#wizard-step0 button, #wizard-step1 button, #wizard-step2 button')
            .forEach((btn) => (btn.disabled = true));
    }
}); // End of DOMContentLoaded

/** ウィザード内のボタン等にイベントリスナーを設定 */
function setupWizardEventListeners() {
    console.log('[Wiz] Setting up wizard event listeners...');
    // ステップ0 -> 1
    document.getElementById('go-wizard-step1-btn')?.addEventListener('click', onWizardStep0Next);
    // ステップ1 -> 0
    document.getElementById('back-to-step0-button')?.addEventListener('click', onBackToStep0);
    // ステップ1 -> 2
    document.getElementById('go-step2-btn')?.addEventListener('click', onGoStep2);
    // ステップ2 -> 1
    document.getElementById('back-to-step1-button')?.addEventListener('click', onBackToStep1);
    // ステップ2 タイプ選択
    document
        .getElementById('type-objective-btn')
        ?.addEventListener('click', () => onSelectScenarioType('objective'));
    document
        .getElementById('type-exploration-btn')
        ?.addEventListener('click', () => onSelectScenarioType('exploration'));
    // ステップ2 確認モーダル
    document
        .getElementById('confirm-scenario-ok')
        ?.addEventListener('click', onConfirmScenarioModalOK);
    document
        .getElementById('confirm-scenario-cancel')
        ?.addEventListener('click', onConfirmScenarioModalCancel);
    // ステップ3 -> 2
    document
        .getElementById('back-to-step2-button')
        ?.addEventListener('click', onBackToStep2FromStep3);
    // ステップ3 -> シナリオ開始
    document.getElementById('start-scenario-button')?.addEventListener('click', onStartScenario);
    // ローディングキャンセル
    document.getElementById('cancel-request-button')?.addEventListener('click', onCancelFetch); // ★ キャンセル機能は GeminiClient 非対応のため限定的
    // 「その他」モーダル
    document
        .getElementById('wizard-other-generate-btn')
        ?.addEventListener('click', wizardOtherGenerate); // ★ Gemini使用
    document.getElementById('wizard-other-ok-btn')?.addEventListener('click', wizardOtherOk);
    document
        .getElementById('wizard-other-cancel-btn')
        ?.addEventListener('click', wizardOtherCancel);
    // 「削除」確認モーダル
    document
        .getElementById('wizard-delete-confirm-ok')
        ?.addEventListener('click', wizardDeleteConfirmOk);
    document
        .getElementById('wizard-delete-confirm-cancel')
        ?.addEventListener('click', wizardDeleteConfirmCancel);

    // チュートリアルボタンなど、他の共通ボタンのリスナーは common.js や menu.js で設定想定
    console.log('[Wiz] Wizard event listeners set up.');
}

// --- ステップ0: パーティ選択 ---

/** パーティ一覧を取得してラジオボタンで表示 */
async function loadAndDisplayPartyList() {
    // (中身は変更なし - 省略せず記述)
    console.log('[Wiz] Loading and displaying party list...');
    try {
        let avatarImg = '';
        const avatarData = await window.loadAvatarData('myAvatar');
        if (avatarData?.imageData) avatarImg = avatarData.imageData;
        const allParties = await window.listAllParties();
        const allChars = await window.loadCharacterDataFromIndexedDB();
        const filtered = [];
        for (const p of allParties) {
            const cards = allChars.filter((c) => c.group === 'Party' && c.partyId === p.partyId);
            if (cards.length < 1) continue;
            let mainImg = '';
            const avatarCard = cards.find((c) => c.role === 'avatar' && c.imageData);
            if (avatarCard) mainImg = avatarCard.imageData;
            else {
                const firstImg = cards.find((c) => c.imageData);
                if (firstImg) mainImg = firstImg.imageData;
            }
            filtered.push({
                partyId: p.partyId,
                name: p.name,
                updatedAt: p.updatedAt || '',
                avatarImage: mainImg,
            });
        }
        filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        const youAvatar = {
            partyId: -1,
            name: 'あなたの分身',
            updatedAt: '',
            avatarImage: avatarImg,
        };
        filtered.unshift(youAvatar);
        const container = document.getElementById('wizard-party-list');
        container.innerHTML = '';
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
            else span.textContent = `${p.name} (更新:${ymd})`;
            label.appendChild(span);
            row.appendChild(rb);
            row.appendChild(label);
            container.appendChild(row);
        });
        const rowNone = document.createElement('div');
        rowNone.className = 'wizard-party-row';
        const rbNone = document.createElement('input');
        rbNone.type = 'radio';
        rbNone.name = 'wizardPartyRadio';
        rbNone.value = '0';
        const uidNone = 'radio-party-none';
        rbNone.id = uidNone;
        if (!wizardData.partyId || wizardData.partyId === 0) rbNone.checked = true;
        const lblNone = document.createElement('label');
        lblNone.className = 'wizard-party-label';
        lblNone.htmlFor = uidNone;
        lblNone.textContent = 'パーティなし';
        rowNone.appendChild(rbNone);
        rowNone.appendChild(lblNone);
        container.appendChild(rowNone);
        console.log('[Wiz] Party list displayed.');
        return filtered;
    } catch (e) {
        console.error('Party list display failed:', e);
        return [];
    }
}

/** ステップ0 「次へ」ボタン処理 */
function onWizardStep0Next() {
    // (中身は変更なし - 省略せず記述)
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
    window.saveWizardDataToIndexedDB(wizardData).catch((e) => console.error(e));
    document.getElementById('wizard-step0').style.display = 'none';
    document.getElementById('wizard-step1').style.display = 'block';
}
/** ステップ1 「戻る」ボタン処理 */
function onBackToStep0() {
    // (中身は変更なし - 省略せず記述)
    console.log('[Wiz] Back to Step 0 clicked.');
    document.getElementById('wizard-step1').style.display = 'none';
    document.getElementById('wizard-step0').style.display = 'block';
}

// --- ステップ1: ジャンル選択 ---

/** 軸入力用チップ初期化 */
function initWizardChips() {
    // (中身は変更なし - 省略せず記述)
    let stageJson = localStorage.getItem('elementStageArr') || '[]';
    try {
        wizStoredStageArr = JSON.parse(stageJson);
    } catch {
        wizStoredStageArr = [];
    }
    wizStoredTheme = localStorage.getItem('elementTheme') || '';
    wizStoredMood = localStorage.getItem('elementMood') || '';
    wizCustomStageChips = loadWizardCustom('customStageChips');
    wizCustomThemeChips = loadWizardCustom('customThemeChips');
    wizCustomMoodChips = loadWizardCustom('customMoodChips');
    renderWizardStageChips();
    renderWizardThemeChips();
    renderWizardMoodChips();
    updateWizGenreResultText();
}
/** カスタムチップ読み込み */
function loadWizardCustom(key) {
    /* (省略なし) */ try {
        const v = localStorage.getItem(key);
        return v ? JSON.parse(v) : [];
    } catch {
        return [];
    }
}
/** 舞台チップ表示 */
function renderWizardStageChips() {
    /* (省略なし) */ const defs = ['ファンタジー', 'SF', '歴史', '現代', 'ホラー'];
    const cont = document.getElementById('wiz-stage-chips-container');
    if (!cont) return;
    cont.innerHTML = '';
    const all = [...defs, ...wizCustomStageChips, 'その他'];
    all.forEach((l) => cont.appendChild(createWizardChip(l, 'stage')));
}
/** テーマチップ表示 */
function renderWizardThemeChips() {
    /* (省略なし) */ const defs = ['冒険', 'ミステリー', 'ロマンス', 'コメディ', 'スリラー'];
    const cont = document.getElementById('wiz-theme-chips-container');
    if (!cont) return;
    cont.innerHTML = '';
    const all = [...defs, ...wizCustomThemeChips, 'その他'];
    all.forEach((l) => cont.appendChild(createWizardChip(l, 'theme')));
}
/** 雰囲気チップ表示 */
function renderWizardMoodChips() {
    /* (省略なし) */ const defs = ['明るい', '中間', 'ダーク'];
    const cont = document.getElementById('wiz-mood-chips-container');
    if (!cont) return;
    cont.innerHTML = '';
    const all = [...defs, ...wizCustomMoodChips, 'その他'];
    all.forEach((l) => cont.appendChild(createWizardChip(l, 'mood')));
}
/** 軸入力用チップ生成 */
function createWizardChip(label, category) {
    /* (省略なし) */ const chip = document.createElement('div');
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
    if (!isOther && isCustom) addWizardRemoveButton(chip, label, category);
    return chip;
}
/** カスタムチップ削除ボタン追加 */
function addWizardRemoveButton(chip, label, category) {
    /* (省略なし) */ const span = document.createElement('span');
    span.innerHTML = '&times;';
    span.style.marginLeft = '4px';
    span.style.cursor = 'pointer';
    span.style.color = 'red';
    span.title = '削除';
    span.addEventListener('click', (e) => {
        e.stopPropagation();
        wizardDeletingChipLabel = label;
        wizardDeletingChipCategory = category;
        document.getElementById('wizard-delete-confirm-modal')?.classList.add('active');
    });
    chip.appendChild(span);
}
/** 軸入力有効/無効 */
function enableAxisInput(flag) {
    /* (省略なし) */ const g = document.getElementById('axis-input-group');
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
    /* (省略なし) */ const g = document.getElementById('free-input-group');
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
    /* (省略なし) */ const st = wizStoredStageArr.length
        ? `【舞台】${wizStoredStageArr.join('/')}`
        : '';
    const th = wizStoredTheme ? `【テーマ】${wizStoredTheme}` : '';
    const md = wizStoredMood ? `【雰囲気】${wizStoredMood}` : '';
    const joined = st + th + md || '（未設定）';
    const el = document.getElementById('wiz-genre-result-text');
    if (el) el.textContent = joined;
}
/** 「その他」モーダル表示 */
function openWizardOtherModal(category) {
    /* (省略なし) */ wizardCurrentOtherCategory = category;
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
/** 「その他」候補生成 (★ Gemini API 使用) */
async function wizardOtherGenerate() {
    console.log("[Wiz] Generating 'Other' suggestion...");
    // ★ APIクライアントチェック
    if (!window.geminiClient) {
        alert('APIクライアント未初期化');
        return;
    }
    if (window.geminiClient.isStubMode) {
        /* ... スタブ処理 ... */ return;
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

    showLoadingModal(true); // このファイル内で定義
    try {
        const currentModelId = document.getElementById('model-select')?.value;
        if (!currentModelId) throw new Error('Geminiモデル未選択');

        // ★ Gemini 向けプロンプト
        const prompt = `あなたは創造的なアイデアを出すAIです。TRPGのシナリオ設定に使われる「${categoryJa}」の新しいアイデアを提案してください。\n既存の候補は次の通りです： ${existingList.join(
            ' / '
        )}\n\nこれらとは異なる、ユニークで魅力的な新しい「${categoryJa}」のアイデアを**1つだけ**、短い単語かフレーズで提案してください。提案する単語・フレーズのみを出力してください。`;

        window.geminiClient.initializeHistory([]); // 履歴不要
        const newCandidate = await window.geminiClient.generateContent(prompt, currentModelId); // ★ Gemini呼び出し

        const cleaned = newCandidate.replace(/["'「」]/g, '').trim();
        const inputEl = document.getElementById('wizard-other-input-text');
        if (inputEl) {
            inputEl.value = cleaned;
            inputEl.focus();
        }
        showToast('新しい候補を生成しました'); // import/global
    } catch (err) {
        console.error('[Wiz] その他候補生成失敗:', err);
        alert('候補の生成に失敗しました:\n' + err.message);
    } finally {
        showLoadingModal(false);
    }
}
/** 「その他」モーダルOK */
function wizardOtherOk() {
    /* (省略なし) */ const val = document.getElementById('wizard-other-input-text')?.value.trim();
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
    /* (省略なし) */ document
        .getElementById('wizard-other-input-modal')
        ?.classList.remove('active');
}
/** 削除確認OK */
function wizardDeleteConfirmOk() {
    /* (省略なし) */ if (wizardDeletingChipCategory === 'stage') {
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
    /* (省略なし) */ document
        .getElementById('wizard-delete-confirm-modal')
        ?.classList.remove('active');
    wizardDeletingChipLabel = '';
    wizardDeletingChipCategory = '';
}

// --- ステップ1 → ステップ2 ---
/** ステップ1 「次へ」ボタン */
function onGoStep2() {
    // (中身は変更なし - 省略せず記述)
    console.log('[Wiz] Step 1 Next clicked.');
    if (!wizardChoice) {
        alert('「選択入力」か「自由入力」かを選択');
        return;
    }
    if (wizardChoice === 'axis') {
        const result = buildChipsGenre();
        if (!result) {
            alert('軸入力で何か選択してください');
            return;
        }
        wizardData.genre = result;
    } else {
        const freeVal = document.getElementById('free-genre-input')?.value.trim();
        if (!freeVal) {
            alert('自由入力ジャンルを入力');
            return;
        }
        wizardData.genre = freeVal;
    }
    window.saveWizardDataToIndexedDB(wizardData).catch((e) => console.error(e));
    document.getElementById('wizard-step1').style.display = 'none';
    document.getElementById('wizard-step2').style.display = 'block';
    updateSelectedPartyDisplay();
    updateSelectedGenreDisplay();
}
/** チップ選択からジャンル文字列生成 */
function buildChipsGenre() {
    /* (省略なし) */ const st = wizStoredStageArr.length
        ? `【舞台】${wizStoredStageArr.join('/')}`
        : '';
    const th = wizStoredTheme ? `【テーマ】${wizStoredTheme}` : '';
    const md = wizStoredMood ? `【雰囲気】${wizStoredMood}` : '';
    return st + th + md;
}
/** ステップ2 「戻る」ボタン */
function onBackToStep1() {
    /* (省略なし) */ console.log('Back to Step 1');
    document.getElementById('wizard-step2').style.display = 'none';
    document.getElementById('wizard-step1').style.display = 'block';
}
/** UI: 選択パーティ表示更新 */
function updateSelectedPartyDisplay() {
    /* (省略なし) */ const el = document.getElementById('selected-party-display');
    if (el) el.textContent = wizardData.currentPartyName || '(未選択)';
}
/** UI: 選択ジャンル表示更新 */
function updateSelectedGenreDisplay() {
    /* (省略なし) */ const el = document.getElementById('selected-genre-display');
    if (el) el.textContent = wizardData.genre || '（未選択）';
}

// --- ステップ2: シナリオタイプ選択 → 確認モーダル ---
/** シナリオタイプ選択 */
function onSelectScenarioType(type) {
    // (中身は変更なし - 省略せず記述)
    console.log(`Scenario type selected: ${type}`);
    wizardData.scenarioType = type;
    window.saveWizardDataToIndexedDB(wizardData).catch((e) => console.error(e));
    const typeLbl = type === 'objective' ? '目的達成型' : '探索型';
    const partyEl = document.getElementById('confirm-party-text');
    if (partyEl) partyEl.textContent = 'パーティ: ' + (wizardData.currentPartyName || '(未選択)');
    const confirmEl = document.getElementById('confirm-genre-type-text');
    if (confirmEl) confirmEl.textContent = `ジャンル: ${wizardData.genre}\nタイプ: ${typeLbl}`;
    document.getElementById('confirm-scenario-modal')?.classList.add('active');
}
/** 確認モーダルキャンセル */
function onConfirmScenarioModalCancel() {
    /* (省略なし) */ document.getElementById('confirm-scenario-modal')?.classList.remove('active');
    console.log('Scenario confirmation cancelled.');
}

/** 確認モーダルOK → シナリオ生成処理開始 */
async function onConfirmScenarioModalOK() {
    console.log('[Wiz] Confirm scenario OK. Starting generation...');
    showLoadingModal(true); // このファイル内で定義
    document.getElementById('confirm-scenario-modal')?.classList.remove('active');

    try {
        // 1) パーティ情報反映
        await storePartyInWizardData(); // 下で定義

        // 2) 概要 (+条件) 生成 (★ Gemini で生成)
        if (wizardData.scenarioType === 'objective') {
            await generateScenarioSummaryAndClearCondition(); // 下で定義
        } else {
            await generateScenarioSummary(); // 下で定義
        }
        // 3) 概要の英語翻訳 (★ Gemini で生成)
        await generateScenarioSummaryEn(); // 下で定義

        // 4) セクション生成 (★ Gemini で生成)
        await generateSections(); // 下で定義

        // 5) 導入シーン生成 (★ Gemini で生成)
        await generateIntroScene(); // 下で定義

        // 6) ステップ3へ遷移 & UI更新
        document.getElementById('wizard-step2').style.display = 'none';
        document.getElementById('wizard-step3').style.display = 'block';
        updateSummaryUI(); // 下で定義
        console.log('[Wiz] Scenario data generated successfully.');
    } catch (err) {
        console.error('[Wiz] シナリオ生成失敗:', err);
        alert('シナリオの生成中にエラーが発生しました:\n' + err.message);
        // エラーが発生した場合、ステップ2に戻すなどの処理
        document.getElementById('wizard-step3').style.display = 'none';
        document.getElementById('wizard-step2').style.display = 'block';
    } finally {
        showLoadingModal(false);
    }
}

/** パーティ情報を wizardData.party に格納 */
async function storePartyInWizardData() {
    // (中身は変更なし - 省略せず記述)
    console.log('Storing party data in wizardData...');
    const pid = wizardData.partyId || 0;
    if (pid === 0) {
        wizardData.party = [];
        await window.saveWizardDataToIndexedDB(wizardData);
        return;
    }
    if (pid === -1) {
        const avatar = await loadMyAvatarData();
        if (avatar) wizardData.party = [convertAvatarToPartyCard(avatar)];
        else wizardData.party = [];
        await window.saveWizardDataToIndexedDB(wizardData);
        return;
    }
    const allChars = await window.loadCharacterDataFromIndexedDB();
    if (!allChars) {
        wizardData.party = [];
        await window.saveWizardDataToIndexedDB(wizardData);
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
    await window.saveWizardDataToIndexedDB(wizardData);
    console.log('Party data stored.');
}
/** アバターデータ読込 */
function loadMyAvatarData() {
    /* (省略なし) */ return new Promise((resolve, reject) => {
        if (!window.db) {
            resolve(null);
            return;
        }
        const tx = window.db.transaction('avatarData', 'readonly');
        tx.objectStore('avatarData').get('myAvatar').onsuccess = (e) =>
            resolve(e.target.result || null);
        tx.onerror = (e) => resolve(null);
    });
}
/** アバターをパーティカード形式に変換 */
function convertAvatarToPartyCard(avatar) {
    /* (省略なし) */ return {
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

// --- シナリオ生成関連 (★ Gemini API 呼び出しに修正) ---

/** シナリオ概要とクリア条件生成 (目的達成型) */
async function generateScenarioSummaryAndClearCondition() {
    console.log('[Wiz] Generating scenario summary and clear condition (Objective)...');
    // ★ APIクライアントチェック
    if (!window.geminiClient) {
        wizardData.scenarioSummary = '(APIクライアント未初期化)';
        wizardData.clearCondition = '(なし)';
        return;
    }
    if (window.geminiClient.isStubMode) {
        /* ... スタブ処理 ... */ wizardData.scenarioSummary = '目的達成型スタブ概要';
        wizardData.clearCondition = 'スタブ条件';
        return;
    }

    const currentModelId = document.getElementById('model-select')?.value;
    if (!currentModelId) throw new Error('Geminiモデル未選択');

    // ★ Gemini 向けプロンプト (応答形式を指示)
    const prompt = `あなたはTRPGのシナリオを作成するAIです。以下の条件で日本語のシナリオ概要とクリア条件を生成してください。
条件:
- ジャンル: ${wizardData.genre || '指定なし'}
- シナリオタイプ: 目的達成型
出力形式:
シナリオ概要テキスト
(改行)
【クリア条件】
クリア条件テキスト

上記の形式で、シナリオ概要と【クリア条件】を明確に分けて出力してください。シナリオ概要は200字程度で、読者の興味を引くように記述してください。クリア条件は具体的で達成可能な目標を1つ設定してください。`;

    try {
        window.geminiClient.initializeHistory([]);
        const responseText = await window.geminiClient.generateContent(prompt, currentModelId); // ★ Gemini呼び出し
        console.log('[Wiz] Raw response (Summary & Condition):', responseText);

        // 応答を解析
        if (responseText.includes('【クリア条件】')) {
            const parts = responseText.split('【クリア条件】');
            wizardData.scenarioSummary = parts[0].trim();
            wizardData.clearCondition = parts[1]?.trim() || '(条件生成失敗)'; // 条件部分が空の場合も考慮
        } else {
            console.warn(
                "[Wiz] Response did not contain '【クリア条件】'. Treating entire response as summary."
            );
            wizardData.scenarioSummary = responseText.trim();
            wizardData.clearCondition = '(条件生成失敗)';
        }
        await window.saveWizardDataToIndexedDB(wizardData); // import/global
        console.log('[Wiz] Scenario summary and clear condition generated.');
    } catch (err) {
        console.error('[Wiz] Failed generate summary/condition:', err);
        wizardData.scenarioSummary = '(概要生成エラー)';
        wizardData.clearCondition = '(条件生成エラー)';
        await window.saveWizardDataToIndexedDB(wizardData); // import/global
        throw err; // エラーを呼び出し元に伝える
    }
}

/** シナリオ概要生成 (探索型) */
async function generateScenarioSummary() {
    console.log('[Wiz] Generating scenario summary (Exploration)...');
    if (!window.geminiClient) {
        wizardData.scenarioSummary = '(APIクライアント未初期化)';
        return;
    }
    if (window.geminiClient.isStubMode) {
        /* ... スタブ処理 ... */ wizardData.scenarioSummary = '探索型スタブ概要';
        return;
    }

    const currentModelId = document.getElementById('model-select')?.value;
    if (!currentModelId) throw new Error('Geminiモデル未選択');

    // ★ Gemini 向けプロンプト
    const prompt = `あなたはTRPGのシナリオ概要を作成するAIです。以下の条件で、読者の興味を引くような日本語のシナリオ概要を200字程度で生成してください。飾りタグなどは不要です。\nジャンル: ${
        wizardData.genre || '指定なし'
    }\nシナリオタイプ: 探索型`;

    try {
        window.geminiClient.initializeHistory([]);
        const summary = await window.geminiClient.generateContent(prompt, currentModelId); // ★ Gemini呼び出し
        wizardData.scenarioSummary = summary.trim() || '(概要生成失敗)';
        await window.saveWizardDataToIndexedDB(wizardData); // import/global
        console.log('[Wiz] Scenario summary generated.');
    } catch (err) {
        console.error('[Wiz] Failed generate summary:', err);
        wizardData.scenarioSummary = '(概要生成エラー)';
        await window.saveWizardDataToIndexedDB(wizardData); // import/global
        throw err;
    }
}

/** シナリオ概要の英語翻訳 */
async function generateScenarioSummaryEn() {
    console.log('[Wiz] Generating English translation for summary...');
    if (!window.geminiClient) {
        wizardData.scenarioSummaryEn = '(Translation client error)';
        return;
    }
    const jpSummary = wizardData.scenarioSummary || '';
    if (!jpSummary.trim() || jpSummary.startsWith('(')) {
        // 日本語概要がないかエラーならスキップ
        wizardData.scenarioSummaryEn = '';
        console.log('[Wiz] Skipping English summary translation (no valid JA summary).');
        return;
    }
    if (window.geminiClient.isStubMode) {
        /* ... スタブ処理 ... */ wizardData.scenarioSummaryEn = '(Stub English Summary)';
        return;
    }

    const currentModelId = document.getElementById('model-select')?.value;
    if (!currentModelId) throw new Error('Geminiモデル未選択');

    // ★ Gemini 向け翻訳プロンプト
    const prompt = `Translate the following Japanese TRPG scenario summary into natural English. Output only the translated English text.\n\nJapanese Summary:\n---\n${jpSummary}\n---\n\nEnglish Summary:`;

    try {
        window.geminiClient.initializeHistory([]);
        const enSummary = await window.geminiClient.generateContent(prompt, currentModelId); // ★ Gemini呼び出し
        wizardData.scenarioSummaryEn = enSummary.trim() || '(Translation failed)';
        await window.saveWizardDataToIndexedDB(wizardData); // import/global
        console.log('[Wiz] English summary generated.');
    } catch (err) {
        console.error('[Wiz] Failed generate English summary:', err);
        wizardData.scenarioSummaryEn = '(Translation error)';
        await window.saveWizardDataToIndexedDB(wizardData); // import/global
        // 翻訳エラーは続行可能とするか？ throwしない
        showToast(`概要の英語翻訳に失敗: ${err.message}`); // import/global
    }
}

/** セクション目標生成 */
async function generateSections() {
    console.log('[Wiz] Generating scenario sections...');
    if (!window.geminiClient) {
        wizardData.sections = [];
        return;
    } // エラー時は空にする
    if (window.geminiClient.isStubMode) {
        /* ... スタブ処理 ... */ wizardData.sections = [
            { number: 1, conditionZipped: btoa('スタブ目標1'), cleared: false },
        ];
        return;
    }

    const count = Math.floor(Math.random() * 3) + 2; // ★ 2～4個に減らす (API負荷軽減)
    const currentModelId = document.getElementById('model-select')?.value;
    if (!currentModelId) throw new Error('Geminiモデル未選択');

    // ★ Gemini 向けプロンプト (日本語で箇条書きを指示)
    const prompt = `あなたはTRPGのシナリオ目標作成AIです。以下の条件に基づき、プレイヤーが達成すべき具体的な目標を${count}個、日本語で提案してください。\n条件:\n- ジャンル: ${
        wizardData.genre || '指定なし'
    }\n- シナリオタイプ: ${wizardData.scenarioType || '指定なし'}\n- シナリオ概要: ${
        wizardData.scenarioSummary || '(概要なし)'
    }\n\n出力形式:\n- 各目標は「～を達成する」「～を見つける」「～を倒す」のような動詞で終わる簡潔な文章にする。\n- 各目標を改行で区切ってリスト形式で出力する。\n- 番号や記号は不要。`;

    try {
        window.geminiClient.initializeHistory([]);
        const responseText = await window.geminiClient.generateContent(prompt, currentModelId); // ★ Gemini呼び出し
        console.log('[Wiz] Raw response (Sections):', responseText);

        const lines = responseText
            .split('\n')
            .map((l) => l.trim().replace(/^[\s・\-*]\s*/, ''))
            .filter((l) => l);
        wizardData.sections = [];
        if (lines.length > 0) {
            for (let i = 0; i < lines.length; i++) {
                // 生成された行数だけループ
                const textLine = lines[i];
                const zipped = zipString(textLine); // 下で定義
                // ★ 英語条件も生成 (オプション)
                let conditionEn = '';
                try {
                    conditionEn = await generateEnglishTranslation(textLine);
                } catch {
                    /* ignore */
                }

                wizardData.sections.push({
                    number: i + 1,
                    conditionZipped: zipped,
                    conditionEn: conditionEn,
                    cleared: false,
                });
            }
        } else {
            // 生成失敗時のダミー
            console.warn('[Wiz] Failed to generate valid section lines. Creating dummy sections.');
            for (let i = 1; i <= count; i++)
                wizardData.sections.push({
                    number: i,
                    conditionZipped: btoa(`ダミー目標${i}`),
                    cleared: false,
                });
        }
        await window.saveWizardDataToIndexedDB(wizardData); // import/global
        console.log(`[Wiz] ${wizardData.sections.length} sections generated.`);
    } catch (err) {
        console.error('[Wiz] Failed generate sections:', err);
        // エラー時のダミー処理
        wizardData.sections = [];
        for (let i = 1; i <= count; i++)
            wizardData.sections.push({
                number: i,
                conditionZipped: btoa(`エラー目標${i}`),
                cleared: false,
            });
        await window.saveWizardDataToIndexedDB(wizardData); // import/global
        throw err;
    }
}

/** 文字列を圧縮して Base64 に変換 */
function zipString(str) {
    // (中身は変更なし - 省略せず記述)
    if (!str) return '';
    try {
        const utf8 = new TextEncoder().encode(str);
        const def = pako.deflate(utf8);
        return btoa(String.fromCharCode(...def));
    } catch (e) {
        console.error('zipString error:', e);
        return '';
    }
}

/** 導入シーン生成 */
async function generateIntroScene() {
    console.log('[Wiz] Generating intro scene...');
    if (!window.geminiClient) {
        wizardData.introScene = '(APIクライアント未初期化)';
        return;
    }
    if (window.geminiClient.isStubMode) {
        /* ... スタブ処理 ... */ wizardData.introScene = 'スタブ導入シーン';
        return;
    }

    const currentModelId = document.getElementById('model-select')?.value;
    if (!currentModelId) throw new Error('Geminiモデル未選択');

    // ★ Gemini 向けプロンプト (日本語、書式指示)
    const prompt = `あなたはTRPGのシナリオライターです。以下のシナリオ概要とパーティ情報に基づき、プレイヤーが物語を始めるための最初の導入シーンを日本語で生成してください。
ルール:
- 文字数は300字程度を目安とする。
- 状況描写と、プレイヤーに最初の行動を促す問いかけを含める。
- 必要であればパーティメンバーの名前や特徴を軽く描写に含める。
- 応答は導入シーンの文章のみとし、他の挨拶や説明は含めない。

シナリオ概要:
${wizardData.scenarioSummary || '(概要なし)'}

パーティ情報:
${buildPartyInsertionText(wizardData.party || [])}

導入シーン:`; // ★ buildPartyInsertionText は日本語版を使う

    try {
        window.geminiClient.initializeHistory([]);
        const intro = await window.geminiClient.generateContent(prompt, currentModelId); // ★ Gemini呼び出し
        wizardData.introScene = intro.trim() || '(導入生成失敗)';
        await window.saveWizardDataToIndexedDB(wizardData); // import/global
        console.log('[Wiz] Intro scene generated.');
    } catch (err) {
        console.error('[Wiz] Failed generate intro scene:', err);
        wizardData.introScene = '(導入生成エラー)';
        await window.saveWizardDataToIndexedDB(wizardData); // import/global
        throw err;
    }
}

// --- ステップ3: シナリオ要約表示 ---

/** ステップ2に戻る */
function onBackToStep2FromStep3() {
    /* (省略なし) */ console.log('Back to Step 2');
    document.getElementById('wizard-step3').style.display = 'none';
    document.getElementById('wizard-step2').style.display = 'block';
}

/** 「このシナリオで始める」ボタン処理 */
async function onStartScenario() {
    console.log('[Wiz] Start Scenario button clicked.');
    try {
        // ★ シナリオタイトル生成 (Gemini利用)
        wizardData.title = await generateScenarioTitle(wizardData.scenarioSummary); // 下で定義
        console.log(`[Wiz] Generated title: ${wizardData.title}`);

        // ★ DBにシナリオレコード作成 (createNewScenario は import した関数)
        const scenarioId = await createNewScenario(wizardData, wizardData.title);
        console.log(`[Wiz] New scenario created in DB with ID: ${scenarioId}`);

        // 導入シーンがあれば sceneEntries に追加
        if (wizardData.introScene && !wizardData.introScene.startsWith('(')) {
            // エラーでない場合
            const introSceneEn = await generateEnglishTranslation(wizardData.introScene); // ★ 英語も生成
            const firstScene = {
                scenarioId,
                type: 'scene',
                sceneId: 'intro_' + Date.now(),
                content: wizardData.introScene,
                content_en: introSceneEn,
                actionContent: '(導入)',
                actionContent_en: '(Introduction)', // アクションは空
                prompt: '', // 画像プロンプトは別途生成
            };
            const entryId = await addSceneEntry(firstScene); // import
            console.log(`[Wiz] Intro scene added to DB with entryId: ${entryId}`);
            // ★ 導入シーンの画像プロンプトも生成しておく (オプション)
            if (typeof window.generateImagePromptFromScene === 'function' && window.geminiClient) {
                firstScene.prompt = await window.generateImagePromptFromScene(firstScene.content);
                firstScene.entryId = entryId;
                await updateSceneEntry(firstScene); // import
            }
        }

        // scenario.html に移動
        console.log(`[Wiz] Redirecting to scenario.html?scenarioId=${scenarioId}`);
        window.location.href = `scenario.html?scenarioId=${scenarioId}`;
    } catch (err) {
        console.error('[Wiz] シナリオ開始失敗:', err);
        alert('シナリオの開始処理に失敗しました: ' + err.message);
    }
}

/** シナリオ概要からタイトルを作成 (★ Gemini API 使用) */
async function generateScenarioTitle(summary) {
    console.log('[Wiz] Generating scenario title...');
    if (!window.geminiClient || !summary?.trim() || summary.startsWith('(')) {
        return (
            '新シナリオ ' +
            new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
        ); // デフォルトタイトル
    }
    if (window.geminiClient.isStubMode) return 'スタブタイトル';

    const currentModelId = document.getElementById('model-select')?.value;
    if (!currentModelId) return 'モデル未選択タイトル';

    // ★ Gemini 向けプロンプト
    const prompt = `以下のTRPGシナリオ概要から、魅力的で短い日本語のタイトルを1つだけ生成してください。タイトルのみを出力し、括弧や接頭辞（「タイトル：」など）は付けないでください。\n\nシナリオ概要:\n---\n${summary}\n---\n\nタイトル:`;

    try {
        window.geminiClient.initializeHistory([]);
        const title = await window.geminiClient.generateContent(prompt, currentModelId); // ★ Gemini呼び出し
        return title.trim().replace(/["'「」『』]/g, '') || '生成失敗タイトル'; // クォート除去
    } catch (err) {
        console.error('[Wiz] Failed generate title:', err);
        return 'タイトル生成エラー';
    }
}

// --- UIヘルパー ---

/** シナリオ要約をUIに表示 */
function updateSummaryUI() {
    const el = document.getElementById('scenario-summary');
    if (!el) return;
    // DOMPurify はグローバル想定
    const sanitized = DOMPurify.sanitize(wizardData.scenarioSummary || '(未生成)');
    el.innerHTML = sanitized || '(概要が表示できません)'; // 空の場合の表示
}

/** ローディングモーダル表示/非表示 */
function showLoadingModal(show) {
    // ★ sceneUI.js と同じ実装をこちらにも（共通化推奨）
    let m = document.getElementById('loading-modal');
    if (!m) {
        // なければ作成
        m = document.createElement('div');
        m.id = 'loading-modal';
        Object.assign(m.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(0,0,0,0.6)',
            zIndex: '99999',
            display: 'none',
            justifyContent: 'center',
            alignItems: 'center',
        });
        m.innerHTML = `<div style="background:#fff; padding:20px 40px; border-radius:5px; text-align:center;"><div class="loading">処理中...</div><button id="internal-cancel-request-button" style="margin-top:15px; background:#aaa;">キャンセル(試行)</button></div>`;
        document.body.appendChild(m);
        m.querySelector('#internal-cancel-request-button')?.addEventListener(
            'click',
            onCancelFetch
        );
    }
    m.style.display = show ? 'flex' : 'none';
}

/** APIリクエストキャンセル試行 */
function onCancelFetch() {
    // ★ Gemini/Stability Client は AbortController を直接サポートしていないため、
    //   キャンセルは保証されない。モーダルを閉じるだけ。
    console.warn('[Wiz] Request cancellation attempted (not fully supported).');
    showLoadingModal(false);
    showToast('キャンセルを試みました (APIによっては停止できません)');
}

// --- ファイル読み込み完了ログ ---
console.log('[Wiz] scenarioWizard.js loaded.');
