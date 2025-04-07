// customScenario.js

// ★★★ モジュールインポートを追加・修正 ★★★
import { initBackground } from './background.js';
import {
    initIndexedDB, // DB初期化関数
    // db, // indexedDB.js が db を export していればこちらを使う
    listAllParties,
    loadCharacterDataFromIndexedDB,
    createNewScenario,
    getScenarioById,
    updateScenario,
    addSceneEntry,
    getSceneEntriesByScenarioId, // ★ onCompleteWizard で必要
    saveWizardDataToIndexedDB, // ★ initCustomScenario で必要？ (もし読み込み処理があれば)
    loadAvatarData, // ★ loadMyAvatarData 内で必要？ (indexedDB.js側で定義されているか確認)
    // 必要に応じて他の関数も追加 (例: loadAvatarData など)
} from './indexedDB.js';
// pako, DOMPurify などはグローバルにある想定
import { showLoadingModal, generateImageForScene } from './sceneUI.js'; // ★ import修正

let customWizardData = {
    partyId: 0,
    party: [],
    title: '',
    overview: '',
    sections: [], // { number: 1, condition: "xxx" } という形
    intro: '',
};

/** 初期化 */
async function initCustomScenario() {
    console.log('[CustomScenario] Initializing custom scenario wizard...');
    try {
        // パーティ一覧の表示 (DBアクセス前に initIndexedDB が完了している必要あり)
        await loadAndDisplayPartyList();

        // イベント設定 (null チェックを追加するとより安全)
        document.getElementById('custom-go-step1-btn')?.addEventListener('click', onGoStep1);
        document
            .getElementById('custom-back-to-step0-btn')
            ?.addEventListener('click', onBackToStep0);
        document.getElementById('custom-go-step2-btn')?.addEventListener('click', onGoStep2);
        document
            .getElementById('custom-back-to-step1-btn')
            ?.addEventListener('click', onBackToStep1);
        document.getElementById('custom-add-section-btn')?.addEventListener('click', onAddSection);
        // セクション削除ボタン用のイベントリスナーは renderSections 内で追加するか、デリゲートを使う
        document
            .getElementById('custom-sections-container')
            ?.addEventListener('click', handleSectionDelete); // ★ イベントデリゲート例
        document.getElementById('custom-go-step3-btn')?.addEventListener('click', onGoStep3);
        document
            .getElementById('custom-back-to-step2-btn')
            ?.addEventListener('click', onBackToStep2);
        document.getElementById('custom-complete-btn')?.addEventListener('click', onCompleteWizard);

        // セクション表示を初期化
        renderSections();
        console.log('[CustomScenario] Initialization complete.');
    } catch (err) {
        console.error('[CustomScenario] Initialization failed:', err);
        alert('カスタムシナリオウィザードの初期化に失敗しました: ' + err.message);
    }
}

/** ステップ0: パーティ選択UIに表示 */
async function loadAndDisplayPartyList() {
    console.log('[CustomScenario] Loading party list...');
    try {
        // ★★★ グローバルな window.db を参照 ★★★
        const dbInstance = window.db;
        if (!dbInstance) {
            throw new Error('IndexedDB is not initialized yet.'); // DB未初期化エラー
        }

        // avatarData(“myAvatar”) を読み込む
        let avatarImageBase64 = '';
        // ★ dbInstance を使うように修正
        const avatarTx = dbInstance.transaction('avatarData', 'readonly');
        const avatarStore = avatarTx.objectStore('avatarData');
        const avatarReq = avatarStore.get('myAvatar');
        const avatarData = await new Promise((resolve) => {
            avatarReq.onsuccess = () => resolve(avatarReq.result || null);
            avatarReq.onerror = () => resolve(null);
        });
        if (avatarData && avatarData.imageData) {
            avatarImageBase64 = avatarData.imageData;
        }

        // パーティ一覧 (★ import した関数を使う)
        const allParties = await listAllParties();
        const allChars = await loadCharacterDataFromIndexedDB();

        // パーティごとにカード1枚以上あるものだけ表示
        const filtered = [];
        for (const p of allParties) {
            const cards = allChars.filter((c) => c.group === 'Party' && c.partyId === p.partyId);
            if (cards.length < 1) continue;
            // アイコン画像
            let mainImage = '';
            const avatarCard = cards.find((c) => c.role === 'avatar' && c.imageData);
            if (avatarCard) {
                mainImage = avatarCard.imageData;
            } else {
                const firstImgCard = cards.find((c) => c.imageData);
                if (firstImgCard) {
                    mainImage = firstImgCard.imageData;
                }
            }
            filtered.push({
                partyId: p.partyId,
                name: p.name,
                updatedAt: p.updatedAt,
                avatarImage: mainImage,
            });
        }
        // 日付降順
        filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

        // "あなたの分身"を先頭に( partyId = -1 とする )
        filtered.unshift({
            partyId: -1,
            name: 'あなたの分身',
            updatedAt: '',
            avatarImage: avatarImageBase64,
        });

        const container = document.getElementById('custom-wizard-party-list');
        container.innerHTML = '';

        // 1行ずつ
        filtered.forEach((p) => {
            const row = document.createElement('div');
            row.className = 'wizard-party-row';

            const rb = document.createElement('input');
            rb.type = 'radio';
            rb.name = 'customPartyRadio';
            rb.value = p.partyId.toString();

            const uniqueId = 'radio-party-' + p.partyId;
            rb.id = uniqueId;

            // 現在の選択
            if (customWizardData.partyId === p.partyId) {
                rb.checked = true;
            }

            const label = document.createElement('label');
            label.className = 'wizard-party-label';
            label.setAttribute('for', uniqueId);

            if (p.avatarImage) {
                const img = document.createElement('img');
                img.src = p.avatarImage;
                img.alt = 'PartyImage';
                label.appendChild(img);
            } else {
                const noImg = document.createElement('div');
                noImg.className = 'no-image-box';
                noImg.textContent = 'No Image';
                label.appendChild(noImg);
            }

            const ymd = p.updatedAt ? p.updatedAt.split('T')[0] : '';
            label.appendChild(
                document.createTextNode(p.partyId === -1 ? p.name : `${p.name} (更新:${ymd})`)
            );

            row.appendChild(rb);
            row.appendChild(label);

            container.appendChild(row);
        });

        // 「パーティなし」
        {
            const row = document.createElement('div');
            row.className = 'wizard-party-row';

            const rb = document.createElement('input');
            rb.type = 'radio';
            rb.name = 'customPartyRadio';
            rb.value = '0';
            const uniqueId = 'radio-party-none';
            rb.id = uniqueId;

            if (!customWizardData.partyId) {
                rb.checked = true;
            }

            const label = document.createElement('label');
            label.className = 'wizard-party-label';
            label.setAttribute('for', uniqueId);
            label.textContent = 'パーティなし';

            row.appendChild(rb);
            row.appendChild(label);
            container.appendChild(row);
        }

        console.log('[CustomScenario] Party list displayed.');
    } catch (err) {
        console.error('パーティ一覧表示に失敗:', err);
        // 必要ならユーザーにエラー通知
        // showToast('パーティ一覧の表示に失敗しました。');
    }
}

/** ステップ0 → ステップ1 */
function onGoStep1() {
    const checked = document.querySelector('input[name="customPartyRadio"]:checked');
    if (!checked) {
        alert('パーティを選択してください。');
        return;
    }
    customWizardData.partyId = parseInt(checked.value, 10);

    // 画面遷移
    document.getElementById('custom-step0').style.display = 'none';
    document.getElementById('custom-step1').style.display = 'block';
}

function onBackToStep0() {
    document.getElementById('custom-step1').style.display = 'none';
    document.getElementById('custom-step0').style.display = 'block';
}

/** ステップ1 → ステップ2 */
function onGoStep2() {
    const title = document.getElementById('custom-title-input').value.trim();
    const overview = document.getElementById('custom-overview-input').value.trim();
    if (!title) {
        alert('タイトルを入力してください。');
        return;
    }
    customWizardData.title = title;
    customWizardData.overview = overview;

    document.getElementById('custom-step1').style.display = 'none';
    document.getElementById('custom-step2').style.display = 'block';
}

function onBackToStep1() {
    document.getElementById('custom-step2').style.display = 'none';
    document.getElementById('custom-step1').style.display = 'block';
}

/** セクション追加ボタン */
function onAddSection() {
    const newNumber = customWizardData.sections.length + 1;
    customWizardData.sections.push({
        number: newNumber,
        condition: '',
    });
    renderSections();
}

/** セクション一覧を表示 */
// ... (他の関数定義: onGoStep1, onBackToStep0, onGoStep2, onBackToStep1, onAddSection, renderSections, onGoStep3, onBackToStep2) ...

// ★ セクション削除ボタン用イベントハンドラを追加
function handleSectionDelete(event) {
    // クリックされた要素が削除ボタンかチェック
    if (event.target.classList.contains('delete-section-btn')) {
        // data-index 属性から削除対象のインデックスを取得
        const indexToRemove = parseInt(event.target.dataset.index, 10);
        if (
            !isNaN(indexToRemove) &&
            indexToRemove >= 0 &&
            indexToRemove < customWizardData.sections.length
        ) {
            customWizardData.sections.splice(indexToRemove, 1); // 配列から削除
            // 削除後に number プロパティを振り直す
            customWizardData.sections.forEach((sec, idx) => {
                sec.number = idx + 1;
            });
            renderSections(); // セクション一覧を再描画
        }
    }
}

// ★ renderSections 関数に削除ボタンを追加
function renderSections() {
    const container = document.getElementById('custom-sections-container');
    if (!container) return;
    container.innerHTML = '';

    if (customWizardData.sections.length === 0) {
        // 0件の場合の表示（任意）
        // container.innerHTML = '<p style="color: #aaa;">セクションがありません。「追加」ボタンで作成してください。</p>';
    }

    customWizardData.sections.forEach((sec, idx) => {
        const div = document.createElement('div');
        div.style.position = 'relative'; // 削除ボタン配置用
        div.style.marginBottom = '15px';
        div.style.paddingRight = '30px'; // 削除ボタンのスペース確保

        const label = document.createElement('label');
        label.textContent = `セクション ${sec.number}: `; // 番号を反映
        label.style.display = 'block';
        label.style.marginBottom = '3px';

        const ta = document.createElement('textarea');
        ta.rows = 2;
        ta.style.width = '100%';
        ta.placeholder = '達成条件を動詞で始める形で入力...';
        ta.value = sec.condition;
        ta.addEventListener('input', () => {
            // インデックスで確実にアクセス
            if (customWizardData.sections[idx]) {
                customWizardData.sections[idx].condition = ta.value;
            }
        });

        // ★ 削除ボタン
        const delBtn = document.createElement('button');
        delBtn.innerHTML = '&times;'; // バツ印
        delBtn.title = `セクション ${sec.number} を削除`;
        delBtn.classList.add('delete-section-btn'); // ★ イベントデリゲート用のクラス
        delBtn.dataset.index = idx; // ★ 削除対象のインデックスを保持
        // ボタンのスタイル設定 (元のスタイルに近い形)
        Object.assign(delBtn.style, {
            position: 'absolute',
            top: '0',
            right: '0',
            background: 'rgba(255, 50, 50, 0.6)',
            color: 'white',
            border: 'none',
            borderRadius: '50%',
            width: '24px',
            height: '24px',
            fontSize: '16px',
            lineHeight: '22px', // 調整
            cursor: 'pointer',
            padding: '0', // パディング除去
        });

        div.appendChild(label);
        div.appendChild(ta);
        div.appendChild(delBtn); // 削除ボタンを追加
        container.appendChild(div);
    });
}

/** ステップ2 → ステップ3 */
function onGoStep3() {
    // 入力チェック(一応)
    if (customWizardData.sections.length === 0) {
        alert('セクションを1つ以上追加してください。');
        return;
    }

    // 画面遷移
    document.getElementById('custom-step2').style.display = 'none';
    document.getElementById('custom-step3').style.display = 'block';
}

function onBackToStep2() {
    document.getElementById('custom-step3').style.display = 'none';
    document.getElementById('custom-step2').style.display = 'block';
}

/** 完了ボタン → シナリオ作成 */
async function onCompleteWizard() {
    const intro = document.getElementById('custom-intro-input')?.value.trim() || ''; // null チェック
    customWizardData.intro = intro;

    const doGenerateImage =
        document.getElementById('custom-generate-image-checkbox')?.checked || false;

    if (typeof showLoadingModal === 'function') showLoadingModal(true); // import

    try {
        // 1) party情報を取り込み (★ import した関数を使う or このファイルで定義)
        await storePartyInWizardData(); // この関数の定義も必要

        // 2) シナリオDB作成 (★ import した関数を使う)
        const scenarioId = await createNewScenario(customWizardData, customWizardData.title);

        // 3) セクション情報を scenarioId に反映 (★ import した関数を使う)
        const scenarioObj = await getScenarioById(scenarioId);
        if (scenarioObj) {
            // wizardData を直接更新せず、新しいオブジェクトを作る
            const updatedWizardData = {
                ...customWizardData, // customWizardData の内容をコピー
                sections: customWizardData.sections.map((s) => {
                    // ★ zipString 関数が利用可能か確認
                    const zipped =
                        typeof zipString === 'function'
                            ? zipString(s.condition || '')
                            : btoa(unescape(encodeURIComponent(s.condition || '')));
                    return {
                        number: s.number,
                        conditionZipped: zipped,
                        // conditionEn: '', // カスタムでは英語翻訳しない想定
                        cleared: false,
                    };
                }),
            };
            scenarioObj.wizardData = updatedWizardData; // 更新した wizardData をセット
            await updateScenario(scenarioObj); // import
        } else {
            console.error('Failed to retrieve scenario after creation:', scenarioId);
            throw new Error('シナリオの取得に失敗しました。');
        }

        // 4) 導入シーンがあれば sceneに書き込む (★ import した関数を使う)
        if (customWizardData.intro) {
            const sceneId = 'intro_' + Date.now();
            const record = {
                scenarioId: scenarioId,
                type: 'scene',
                sceneId: sceneId,
                content: customWizardData.intro,
                content_en: '',
                actionContent: '',
                actionContent_en: '',
                prompt: '',
                dataUrl: '', // 画像データは別途生成
            };
            await addSceneEntry(record); // import

            // 5) 画像生成チェックがONなら、直後に generateImageForScene (★ import した関数を使う)
            if (doGenerateImage && typeof generateImageForScene === 'function') {
                // import 確認
                const sceneObjForImage = {
                    // generateImageForScene に渡す簡易オブジェクト
                    scenarioId: scenarioId,
                    sceneId: sceneId,
                    content: customWizardData.intro,
                    images: [],
                };
                // 画像生成を非同期で開始（完了を待たない）
                generateImageForScene(sceneObjForImage)
                    .then(() => console.log('[CustomScenario] Intro image generation started.'))
                    .catch((e) =>
                        console.error('[CustomScenario] Intro image generation failed:', e)
                    );
            }
        }

        // 6) 完了 → トップへ
        alert('カスタムシナリオを作成しました。');
        window.location.href = 'index.html';
    } catch (err) {
        console.error('カスタムシナリオ作成失敗:', err);
        alert('カスタムシナリオ作成に失敗しました:\n' + err.message);
    } finally {
        if (typeof showLoadingModal === 'function') showLoadingModal(false); // import
    }
}

// ★ これらの関数も適切に import または定義してください

/** パーティ情報を customWizardData.party に詰める */
async function storePartyInWizardData() {
    const pid = customWizardData.partyId || 0;

    if (pid === 0) {
        // パーティ無し
        customWizardData.party = [];
        return;
    }

    if (pid === -1) {
        // 「あなたの分身」
        const avatarObj = await loadMyAvatarData();
        if (avatarObj) {
            const card = convertAvatarToPartyCard(avatarObj);
            customWizardData.party = [card];
        } else {
            customWizardData.party = [];
        }
        return;
    }

    // 通常パーティ
    const allChars = await loadCharacterDataFromIndexedDB();
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
    customWizardData.party = stripped;
}

function loadMyAvatarData() {
    return new Promise((resolve) => {
        if (!db) {
            console.warn('DB未初期化');
            resolve(null);
            return;
        }
        const tx = db.transaction('avatarData', 'readonly');
        const store = tx.objectStore('avatarData');
        const req = store.get('myAvatar');
        req.onsuccess = () => {
            resolve(req.result || null);
        };
        req.onerror = () => {
            resolve(null);
        };
    });
}

function convertAvatarToPartyCard(avatarObj) {
    return {
        id: 'avatar-' + Date.now(),
        name: avatarObj.name || 'アバター',
        type: 'キャラクター',
        rarity: avatarObj.rarity || '★1',
        state: '',
        special: avatarObj.skill || '',
        caption: avatarObj.serif || '',
        backgroundcss: '',
        imageprompt: '',
        role: 'avatar',
        imageData: avatarObj.imageData || '',
    };
}

/** 文字列をpako圧縮(Base64化) */
function zipString(str) {
    const utf8 = new TextEncoder().encode(str);
    const def = pako.deflate(utf8);
    return btoa(String.fromCharCode(...def));
}

// --- ★ 初期化処理の修正 ★ ---
// window.addEventListener("DOMContentLoaded", ...); // ← このリスナーは削除または menu.js などに統合
// window.addEventListener("load", ...); // ← このリスナーは削除

// ★★★ DOMContentLoaded で初期化処理を完結させる ★★★
document.addEventListener('DOMContentLoaded', async function () {
    console.log('[CustomScenario] DOMContentLoaded fired.');
    try {
        // ★ DB初期化を await で完了させる
        await initIndexedDB(); // import
        console.log('[CustomScenario] IndexedDB initialized.');

        // 背景初期化
        if (typeof initBackground === 'function') {
            // import
            await initBackground('customScenario');
            console.log('[CustomScenario] Background initialized.');
        } else {
            console.warn('initBackground function not found.');
        }

        // メニューに戻るボタン
        const backBtn = document.getElementById('back-to-menu');
        if (backBtn) {
            backBtn.addEventListener('click', function () {
                window.location.href = 'index.html';
            });
        }

        // ★ DB初期化完了後にウィザード初期化を実行
        await initCustomScenario();
    } catch (err) {
        console.error('[CustomScenario] Initialization error:', err);
        alert('ページの初期化に失敗しました: ' + err.message);
        // 必要ならエラー時のUI制御
    }
});

// --- ファイル読み込み完了ログ ---
console.log('[CustomScenario] customScenario.js loaded.');
