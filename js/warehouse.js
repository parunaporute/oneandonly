// js/warehouse.js
// 倉庫 + ゴミ箱タブ機能
// ★ 画像生成を stabilityClient.generateImage に変更
// ★ プロンプト英語化処理を追加
// ★ ES Modules 形式、showWarehouseModal を export
// ★ 省略なし

// --- モジュールインポート ---
import { open as multiModalOpen } from './multiModal.js';
import { showToast } from './common.js';
// ★ DBアクセス関数 (indexedDB.js から import)
import { saveCharacterDataToIndexedDB, loadCharacterDataFromIndexedDB } from './indexedDB.js';
// DOMPurify はグローバルにある想定
// window.geminiClient, window.stabilityClient は menu.js などで初期化されている想定

// --- モジュールスコープ変数 ---
let warehouseMode = 'menu';
let currentPartyIdForAdd = null;
let afterAddCallback = null;
let currentTab = 'キャラクター';
let warehouseSelectionMode = false;
let trashSelectionMode = false;
let allCardsForCurrentTab = [];
let cardsPerRow = 1;
let loadedLineCount = 0;
const LINES_PER_LOAD = 2; // 一度に読み込む行数
let isLoadingNextLines = false;

// --- ソート設定関連 ---

/** 指定タブのソート設定を localStorage に保存 */
function setSortConfig(tabName, sortKey, sortDir) {
    // (中身は変更なし - 省略せず記述)
    try {
        localStorage.setItem(`warehouseSortKey_${tabName}`, sortKey);
        localStorage.setItem(`warehouseSortDir_${tabName}`, sortDir);
    } catch (e) {
        console.error('[WH] Failed save sort config:', e);
    }
}

/** 指定タブのソート設定を localStorage から取得 */
function getSortConfig(tabName) {
    // (中身は変更なし - 省略せず記述)
    const defaults = { key: 'id', dir: 'desc' };
    let cfg = { ...defaults };
    try {
        cfg.key = localStorage.getItem(`warehouseSortKey_${tabName}`) || defaults.key;
        cfg.dir = localStorage.getItem(`warehouseSortDir_${tabName}`) || defaults.dir;
    } catch (e) {
        console.error('[WH] Failed load sort config:', e);
    }
    if (!['id', 'name', 'state'].includes(cfg.key)) cfg.key = defaults.key;
    if (!['asc', 'desc'].includes(cfg.dir)) cfg.dir = defaults.dir;
    return { sortKey: cfg.key, sortDir: cfg.dir };
}

/** カードIDからタイムスタンプを取得 */
function getTimeFromId(cardId) {
    // (中身は変更なし - 省略せず記述)
    if (typeof cardId !== 'string') return 0;
    const parts = cardId.split('_');
    if (parts.length >= 2) {
        const ts = parseInt(parts[1], 10);
        return isNaN(ts) ? 0 : ts;
    }
    return 0;
}

/** カード配列をソート */
function applySort(array, sortKey, sortDir) {
    // (中身は変更なし - 省略せず記述)
    if (!Array.isArray(array)) return;
    array.sort((a, b) => {
        let valA, valB;
        switch (sortKey) {
            case 'id':
                valA = getTimeFromId(a?.id);
                valB = getTimeFromId(b?.id);
                break;
            case 'name':
                valA = a?.name?.toLowerCase() || '';
                valB = b?.name?.toLowerCase() || '';
                return valA.localeCompare(valB, 'ja');
            case 'state':
                valA = a?.state?.toLowerCase() || '';
                valB = b?.state?.toLowerCase() || '';
                return valA.localeCompare(valB, 'ja');
            default:
                return 0;
        }
        if (typeof valA === 'number' && typeof valB === 'number') return valA - valB;
        return 0;
    });
    if (sortDir === 'desc') array.reverse();
    console.log(`[WH] Sorted ${array.length} by ${sortKey} ${sortDir}.`);
}

// --- モーダル表示 ---

/**
 * 倉庫モーダルを開く
 */
export function showWarehouseModal(mode = 'menu', partyId = null, onAddCb = null) {
    // (中身は変更なし - 省略せず記述)
    console.log(`[WH] Opening modal. Mode: ${mode}, Party: ${partyId}`);
    warehouseMode = mode;
    currentPartyIdForAdd = partyId;
    afterAddCallback = onAddCb;
    currentTab = 'キャラクター';
    warehouseSelectionMode = false;
    trashSelectionMode = false;
    multiModalOpen({
        id: 'warehouse-modal',
        title: '倉庫 / ゴミ箱',
        contentHtml: buildWarehouseModalHtml(),
        showCloseButton: true,
        closeOnOutsideClick: true,
        appearanceType: 'top',
        onOpen: async () => {
            console.log('[WH] Modal opened. Setting up...');
            setupWarehouseModalEvents();
            applySortUIFromStorage(currentTab);
            await loadCharacterData();
            loadCardsByTab();
        },
        onClose: () => {
            console.log('[WH] Modal closed.');
        },
    });
}

/** 倉庫モーダルのHTMLを生成 */
function buildWarehouseModalHtml() {
    // (中身は変更なし - 省略せず記述)
    return `<div style="display:flex; flex-direction:column; max-height:89vh;"><div class="warehouse-header-bar"><div class="warehouse-left"><button id="toggle-warehouse-selection-mode-btn" title="複数選択モード切替">選択モード</button><button id="delete-selected-warehouse-btn" style="display:none; background-color:#e6a800;" title="選択をゴミ箱へ">選択をゴミ箱へ</button><button id="add-to-party-btn" style="display:none; background-color:#2196f3;" title="選択をパーティへ">パーティに追加</button><button id="trash-selection-mode-btn" style="display:none;" title="複数選択モード切替">選択モード</button><button id="trash-restore-selected-btn" style="display:none; background-color:#4caf50;" title="選択を倉庫へ">選択を倉庫へ</button><button id="trash-delete-selected-btn" style="display:none; background-color:#f44336;" title="選択を完全削除">選択を完全削除</button></div><div class="warehouse-center"><div class="warehouse-tabs"><div class="warehouse-tab active" data-tab="キャラクター">キャラ</div><div class="warehouse-tab" data-tab="アイテム">アイテム</div><div class="warehouse-tab" data-tab="モンスター">モンスター</div><div class="warehouse-tab" data-tab="ゴミ箱">ゴミ箱</div></div></div><div class="warehouse-right"><select id="warehouse-sort-dropdown" title="表示順序"><option value="id">取得日時順</option><option value="name">名前順</option><option value="state">状態順</option></select><button id="warehouse-sort-direction-btn" title="昇順/降順切替"><span class="iconmoon icon-sort-alpha-desc"></span></button></div></div><div class="c-flexbox" id="trash-all-actions" style="display:none; margin-bottom: 10px;"><button id="trash-restore-all-btn" title="全て倉庫へ戻す">全て倉庫へ戻す</button><button id="trash-delete-all-btn" style="background-color:#f44336;" title="ゴミ箱を空にする">ゴミ箱を空にする</button></div><div id="warehouse-card-scroll-container" style="overflow-y: auto; width:100%; flex-grow: 1;"><div id="warehouse-card-container" style="display:flex; flex-wrap:wrap; gap:15px; padding: 10px; justify-content: center; opacity:0; visibility: hidden; transition:opacity 0.3s ease;"></div></div></div>`;
}

/** モーダル内のイベントリスナーを設定 */
function setupWarehouseModalEvents() {
    // (中身は変更なし - 省略せず記述)
    console.log('[WH] Setting up modal events...');
    const ids = [
        'toggle-warehouse-selection-mode-btn',
        'delete-selected-warehouse-btn',
        'add-to-party-btn',
        'trash-selection-mode-btn',
        'trash-restore-selected-btn',
        'trash-delete-selected-btn',
        'trash-restore-all-btn',
        'trash-delete-all-btn',
        'warehouse-sort-dropdown',
        'warehouse-sort-direction-btn',
        'warehouse-card-scroll-container',
    ];
    const els = ids.map((id) => document.getElementById(id));
    if (els.some((el) => !el)) {
        console.error('WH modal elements missing');
        return;
    }
    const [
        tsBtn,
        dswBtn,
        apBtn,
        tSelBtn,
        trsBtn,
        tdsBtn,
        traBtn,
        tdaBtn,
        sortDd,
        sortDirBtn,
        scrollC,
    ] = els;
    tsBtn.addEventListener('click', toggleWarehouseSelectionMode);
    dswBtn.addEventListener('click', moveSelectedCardsToTrash);
    apBtn.addEventListener('click', addSelectedCardsToParty);
    tSelBtn.addEventListener('click', toggleTrashSelectionMode);
    trsBtn.addEventListener('click', restoreSelectedTrashCards);
    tdsBtn.addEventListener('click', deleteSelectedTrashCards);
    traBtn.addEventListener('click', restoreAllTrashCards);
    tdaBtn.addEventListener('click', deleteAllTrashCards);
    sortDd.addEventListener('change', onSortChange);
    sortDirBtn.addEventListener('click', onSortDirToggle);
    scrollC.removeEventListener('scroll', onScrollCheck);
    scrollC.addEventListener('scroll', onScrollCheck);
    document.querySelectorAll('.warehouse-tab').forEach((el) => {
        el.removeEventListener('click', handleTabClick);
        el.addEventListener('click', handleTabClick);
    });
    console.log('[WH] Modal listeners set.');
}

/** タブクリック処理 */
function handleTabClick(event) {
    // (中身は変更なし - 省略せず記述)
    const tabEl = event.currentTarget;
    if (tabEl.classList.contains('active')) return;
    const newTab = tabEl.getAttribute('data-tab');
    console.log(`[WH] Tab changed: ${newTab}`);
    document.querySelectorAll('.warehouse-tab').forEach((t) => t.classList.remove('active'));
    tabEl.classList.add('active');
    currentTab = newTab;
    warehouseSelectionMode = false;
    trashSelectionMode = false;
    applySortUIFromStorage(currentTab);
    loadCardsByTab();
}

// --- カード読み込み・表示 ---

/** DBから最新キャラデータを読み込みメモリ更新 */
async function loadCharacterData() {
    // (中身は変更なし - 省略せず記述)
    try {
        window.characterData = await loadCharacterDataFromIndexedDB();
        console.log(`[WH] Reloaded char data: ${window.characterData?.length || 0}`);
    } catch (e) {
        console.error('[WH] Failed reload char data:', e);
        showToast(`データ再読込失敗: ${e.message}`);
    }
}

/** 現在タブのカードを読み込み表示 */
async function loadCardsByTab() {
    // (中身は変更なし - 省略せず記述)
    console.log(`[WH] Loading cards for tab: ${currentTab}`);
    const container = document.getElementById('warehouse-card-container');
    if (!container) {
        console.error('Card container missing.');
        return;
    }
    container.innerHTML = '';
    container.style.opacity = '0';
    container.style.visibility = 'hidden';
    loadedLineCount = 0;
    isLoadingNextLines = false;
    const allData = window.characterData || [];
    allCardsForCurrentTab =
        currentTab === 'ゴミ箱'
            ? allData.filter((c) => c?.group === 'Trash')
            : allData.filter((c) => c?.group === 'Warehouse' && c.type === currentTab);
    console.log(`Filtered ${allCardsForCurrentTab.length} cards.`);
    const config = getSortConfig(currentTab);
    applySort(allCardsForCurrentTab, config.sortKey, config.sortDir);
    updateHeaderUIForTab();
    cardsPerRow = calcCardsPerRow();
    console.log(`Cards per row: ${cardsPerRow}`);
    loadNextLines();
    await new Promise((r) => setTimeout(r, 50));
    fillContainerIfNeeded(() => {
        container.style.visibility = 'visible';
        container.style.opacity = '1';
        console.log('Initial card load complete.');
    });
}

/** 1行あたりのカード数計算 */
function calcCardsPerRow() {
    // (中身は変更なし - 省略せず記述)
    const cont = document.getElementById('warehouse-card-container');
    if (!cont) return 1;
    const cw = cont.clientWidth || window.innerWidth;
    if (cw <= 0) return 1;
    const fc = cont.querySelector('.card:not(.dummy)') || document.createElement('div');
    const cs = getComputedStyle(fc);
    const cns = getComputedStyle(cont);
    const cardW = parseFloat(cs.width) || 300;
    const gap = parseFloat(cns.gap) || 15;
    return Math.max(1, Math.floor((cw + gap) / (cardW + gap)));
}

/** スクロール位置チェック */
function onScrollCheck() {
    // (中身は変更なし - 省略せず記述)
    if (isLoadingNextLines) return;
    const sc = document.getElementById('warehouse-card-scroll-container');
    if (!sc) return;
    const thr = 200;
    const nearBot = sc.scrollTop + sc.clientHeight + thr >= sc.scrollHeight;
    const more = loadedLineCount * cardsPerRow < allCardsForCurrentTab.length;
    if (nearBot && more) {
        console.log('[WH] Near bottom, load next...');
        loadNextLines();
    }
}

/** 次の行のカードを読み込み表示 */
function loadNextLines() {
    // (中身は変更なし - 省略せず記述)
    if (isLoadingNextLines) return;
    isLoadingNextLines = true;
    const cont = document.getElementById('warehouse-card-container');
    if (!cont) {
        isLoadingNextLines = false;
        return;
    }
    const start = loadedLineCount * cardsPerRow;
    const end = start + LINES_PER_LOAD * cardsPerRow;
    const cards = allCardsForCurrentTab.slice(start, end);
    if (cards.length === 0) {
        isLoadingNextLines = false;
        return;
    }
    console.log(
        `Loading lines ${loadedLineCount + 1}-${loadedLineCount + LINES_PER_LOAD}. Idx ${start}-${
            end - 1
        }.`
    );
    const frag = document.createDocumentFragment();
    cards.forEach((c) => {
        let el =
            currentTab === 'ゴミ箱' ? createTrashCardElement(c) : createWarehouseCardElement(c);
        if (el) frag.appendChild(el);
    });
    cont.appendChild(frag);
    loadedLineCount += LINES_PER_LOAD;
    setTimeout(() => {
        isLoadingNextLines = false;
    }, 100);
}

/** コンテナが表示領域未満の場合、埋まるまで追加読み込み */
function fillContainerIfNeeded(callback) {
    // (中身は変更なし - 省略せず記述)
    const sc = document.getElementById('warehouse-card-scroll-container');
    if (!sc || isLoadingNextLines) {
        if (callback) callback();
        return;
    }
    let safety = 0;
    const maxL = 10;
    function check() {
        if (!sc) {
            if (callback) callback();
            return;
        }
        const needs = sc.scrollHeight <= sc.clientHeight;
        const more = loadedLineCount * cardsPerRow < allCardsForCurrentTab.length;
        if (needs && more && safety < maxL) {
            console.log(`Fill check (${++safety}), loading more.`);
            loadNextLines();
            requestAnimationFrame(check);
        } else {
            if (safety >= maxL) console.warn('Fill limit.');
            console.log('Fill check complete.');
            if (callback) callback();
        }
    }
    check();
}

// --- ヘッダーUI制御 ---
/** タブに応じてヘッダーボタン表示切替 */
function updateHeaderUIForTab() {
    // (中身は変更なし - 省略せず記述)
    console.log(`Updating header UI for tab: ${currentTab}`);
    const ids = [
        'toggle-warehouse-selection-mode-btn',
        'delete-selected-warehouse-btn',
        'add-to-party-btn',
        'trash-selection-mode-btn',
        'trash-restore-selected-btn',
        'trash-delete-selected-btn',
        'trash-all-actions',
    ];
    const els = ids.map((id) => document.getElementById(id));
    if (els.some((el) => !el)) {
        console.error('Header UI elements missing.');
        return;
    }
    const [tsBtn, dswBtn, apBtn, tSelBtn, trsBtn, tdsBtn, taaDiv] = els;
    const isTrash = currentTab === 'ゴミ箱';
    tsBtn.style.display = isTrash ? 'none' : 'inline-block';
    tSelBtn.style.display = isTrash ? 'inline-block' : 'none';
    taaDiv.style.display = isTrash ? 'flex' : 'none';
    dswBtn.style.display = 'none';
    apBtn.style.display = 'none';
    trsBtn.style.display = 'none';
    tdsBtn.style.display = 'none';
    if (isTrash) updateTrashSelectionButtons();
    else updateWarehouseSelectionButtons();
}

// --- カード要素生成 ---

/** 倉庫カードDOM生成 (★ 画像生成ボタン修正) */
function createWarehouseCardElement(card) {
    if (!card || !card.id) {
        console.warn('[WH] Invalid card data for element:', card);
        return null;
    }

    const cardEl = document.createElement('div');
    const rarityVal = parseInt((card.rarity || '★1').replace('★', ''), 10) || 1;
    cardEl.className = `card rarity${rarityVal}`;
    cardEl.dataset.id = card.id;
    if (card.flipped) cardEl.classList.add('flipped');

    // カードクリックイベント
    cardEl.addEventListener('click', (e) => {
        if (warehouseSelectionMode) {
            // 選択モード
            e.stopPropagation();
            cardEl.classList.toggle('selected');
            console.log(`[WH] Card ${card.id} selection: ${cardEl.classList.contains('selected')}`);
            updateWarehouseSelectionButtons();
        } else {
            // 通常モード
            if (cardEl.classList.contains('flipped')) {
                // 裏なら表へ
                cardEl.classList.remove('flipped');
                card.flipped = false;
                saveFlippedState(card.id, false);
                console.log(`Card ${card.id} flipped front.`);
            } else {
                // 表ならプレビュー
                if (card.imageData) {
                    console.log(`Opening preview for ${card.id}.`);
                    openImagePreview(card);
                } else {
                    showToast('画像がありません');
                } // import
            }
        }
    });

    // カード内部構造
    const inner = document.createElement('div');
    inner.className = 'card-inner';
    const front = document.createElement('div');
    front.className = 'card-front';
    const bgStyle = (card.backgroundcss || '').replace(/background[^:]*:/i, '').trim();
    if (bgStyle) front.style.background = bgStyle;
    front.innerHTML = `<div class="bezel rarity${rarityVal}"></div>`; // ベゼル

    const typeEl = document.createElement('div');
    typeEl.className = 'card-type';
    typeEl.textContent = card.type || '不明';
    front.appendChild(typeEl);

    const imgC = document.createElement('div');
    imgC.className = 'card-image';
    if (card.imageData) {
        // 画像あり
        const imgEl = document.createElement('img');
        imgEl.src = card.imageData;
        imgEl.alt = card.name || card.id;
        imgEl.loading = 'lazy';
        applyRotationToElement(imgEl, card.rotationAngle); // 回転適用 (下で定義)
        imgEl.style.cursor = 'pointer'; // プレビュー可能カーソル
        imgEl.addEventListener('click', (e) => {
            e.stopPropagation();
            openImagePreview(card);
        }); // プレビュー表示
        imgC.appendChild(imgEl);
    } else {
        // 画像なし
        // ★ 画像生成ボタン
        const genBtn = document.createElement('button');
        genBtn.className = 'gen-image-btn';
        genBtn.innerHTML = `<span class="iconmoon icon-picture"></span> 生成`;
        genBtn.title = '画像生成';
        // ★ generateWarehouseImage を呼び出すように変更
        genBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await generateWarehouseImage(card, genBtn); // ★ Stability AI で生成 (下で定義)
        });
        imgC.appendChild(genBtn);
    }
    front.appendChild(imgC);

    // 情報エリア
    const infoC = document.createElement('div');
    infoC.className = 'card-info';
    const nameP = document.createElement('p');
    nameP.innerHTML = `<h3>${DOMPurify.sanitize(card.name || '無名')}</h3>`;
    infoC.appendChild(nameP);
    if (card.state) {
        const st = document.createElement('p');
        st.innerHTML = `<strong>状態:</strong> ${DOMPurify.sanitize(card.state)}`;
        infoC.appendChild(st);
    }
    if (card.special) {
        const sp = document.createElement('p');
        sp.innerHTML = `<strong>特技:</strong> ${DOMPurify.sanitize(card.special)}`;
        infoC.appendChild(sp);
    }
    if (card.caption) {
        const cap = document.createElement('p');
        cap.innerHTML = `<span>${DOMPurify.sanitize(card.caption)}</span>`;
        infoC.appendChild(cap);
    }
    front.appendChild(infoC);

    // ゴミ箱ボタン
    const trashBtn = document.createElement('button');
    trashBtn.title = 'ゴミ箱へ';
    trashBtn.innerHTML = `<span class="iconmoon icon-bin"></span>`;
    trashBtn.className = 'card-action-button delete';
    Object.assign(trashBtn.style, {
        position: 'absolute',
        right: '5px',
        bottom: '5px',
        zIndex: '5',
    });
    trashBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (warehouseSelectionMode) return;
        multiModalOpen({
            title: 'ゴミ箱へ',
            contentHtml: `<p>「${DOMPurify.sanitize(card.name || card.id)}」をゴミ箱へ？</p>`,
            okLabel: '移動',
            cancelLabel: 'キャンセル',
            onOk: () => moveSingleCardToTrash(card.id),
        });
    }); // import
    front.appendChild(trashBtn);

    // 裏面
    const back = document.createElement('div');
    back.className = 'card-back';
    back.innerHTML = `<strong>${DOMPurify.sanitize(card.type || '?')}</strong>`;
    inner.appendChild(front);
    inner.appendChild(back);
    cardEl.appendChild(inner);
    return cardEl;
}

/** ゴミ箱カードDOM生成 */
function createTrashCardElement(card) {
    // (中身は変更なし - 省略せず記述)
    if (!card || !card.id) {
        console.warn('Invalid trash data:', card);
        return null;
    }
    const cardEl = document.createElement('div');
    const rVal = parseInt((card.rarity || '★1').replace('★', ''), 10) || 1;
    cardEl.className = `card rarity${rVal} trash-card`;
    cardEl.dataset.id = card.id;
    cardEl.addEventListener('click', (e) => {
        if (trashSelectionMode) {
            e.stopPropagation();
            cardEl.classList.toggle('selected');
            console.log(`Trash sel ${card.id}: ${cardEl.classList.contains('selected')}`);
            updateTrashSelectionButtons();
        } else {
            if (card.imageData) {
                openImagePreview(card);
            } else {
                showToast('画像なし');
            }
        }
    });
    const inner = document.createElement('div');
    inner.className = 'card-inner';
    const front = document.createElement('div');
    front.className = 'card-front';
    const bg = (card.backgroundcss || '').replace(/background[^:]*:/i, '').trim();
    if (bg) front.style.background = bg;
    front.innerHTML = `<div class="bezel rarity${rVal}"></div>`;
    const type = document.createElement('div');
    type.className = 'card-type';
    type.textContent = card.type || '?';
    front.appendChild(type);
    const imgC = document.createElement('div');
    imgC.className = 'card-image';
    if (card.imageData) {
        const img = document.createElement('img');
        img.src = card.imageData;
        img.alt = card.name || card.id;
        img.loading = 'lazy';
        applyRotationToElement(img, card.rotationAngle);
        imgC.appendChild(img);
    } else {
        imgC.innerHTML = '<div style="color:#aaa; font-size:0.8rem;">(画像なし)</div>';
    }
    front.appendChild(imgC);
    const info = document.createElement('div');
    info.className = 'card-info';
    const name = document.createElement('p');
    name.innerHTML = `<h3>${DOMPurify.sanitize(card.name || '無名')}</h3>`;
    info.appendChild(name);
    if (card.state) {
        const s = document.createElement('p');
        s.innerHTML = `<strong>状態:</strong> ${DOMPurify.sanitize(card.state)}`;
        info.appendChild(s);
    }
    if (card.special) {
        const sp = document.createElement('p');
        sp.innerHTML = `<strong>特技:</strong> ${DOMPurify.sanitize(card.special)}`;
        info.appendChild(sp);
    }
    if (card.caption) {
        const c = document.createElement('p');
        c.innerHTML = `<span>${DOMPurify.sanitize(card.caption)}</span>`;
        info.appendChild(c);
    }
    front.appendChild(info);
    const btns = document.createElement('div');
    Object.assign(btns.style, {
        position: 'absolute',
        bottom: '5px',
        right: '5px',
        display: 'flex',
        gap: '5px',
        zIndex: '5',
    });
    const restore = document.createElement('button');
    restore.title = '倉庫へ戻す';
    restore.innerHTML = `<span class="iconmoon icon-undo2"></span>`;
    restore.className = 'card-action-button restore';
    restore.style.backgroundColor = '#4caf50';
    restore.addEventListener('click', (e) => {
        e.stopPropagation();
        if (trashSelectionMode) return;
        multiModalOpen({
            title: '倉庫へ戻す',
            contentHtml: `<p>「${DOMPurify.sanitize(card.name || card.id)}」を倉庫へ？</p>`,
            okLabel: '戻す',
            onOk: () => restoreSingleCard(card.id),
        });
    });
    btns.appendChild(restore);
    const del = document.createElement('button');
    del.title = '完全削除';
    del.innerHTML = `<span class="iconmoon icon-cross"></span>`;
    del.className = 'card-action-button delete-permanent';
    del.style.backgroundColor = '#f44336';
    del.addEventListener('click', (e) => {
        e.stopPropagation();
        if (trashSelectionMode) return;
        multiModalOpen({
            title: '完全削除',
            contentHtml: `<p style="color:#ffcccc;"><strong>警告:</strong> 「${DOMPurify.sanitize(
                card.name || card.id
            )}」を完全削除？</p>`,
            okLabel: '完全削除',
            okButtonColor: '#f44336',
            onOk: () => deleteSingleCardPermanently(card.id),
        });
    });
    btns.appendChild(del);
    front.appendChild(btns);
    inner.appendChild(front);
    cardEl.appendChild(inner);
    return cardEl;
}

/** カード裏返し状態DB保存 */
async function saveFlippedState(cardId, flipped) {
    // (中身は変更なし - 省略せず記述)
    const idx = (window.characterData || []).findIndex((c) => c?.id === cardId);
    if (idx !== -1) {
        window.characterData[idx].flipped = flipped;
        try {
            await saveCharacterDataToIndexedDB(window.characterData);
            console.log(`Flipped state (${flipped}) saved for ${cardId}.`);
        } catch (e) {
            console.error(`Failed save flipped state for ${cardId}:`, e);
            window.characterData[idx].flipped = !flipped;
            showToast('カード状態保存失敗');
        }
    } else {
        console.warn(`Card ${cardId} not found for saveFlippedState.`);
    }
}

// --- 選択モード関連 ---
/** 倉庫選択モード切替 */
function toggleWarehouseSelectionMode() {
    /* (省略なし) */ warehouseSelectionMode = !warehouseSelectionMode;
    console.log(`WH select mode: ${warehouseSelectionMode}`);
    const btn = document.getElementById('toggle-warehouse-selection-mode-btn');
    if (btn) {
        btn.textContent = warehouseSelectionMode ? '選択解除' : '選択モード';
        btn.style.backgroundColor = warehouseSelectionMode ? '#f0ad4e' : '';
    }
    if (!warehouseSelectionMode) clearWarehouseSelections();
    updateWarehouseSelectionButtons();
    document
        .getElementById('warehouse-card-container')
        ?.classList.toggle('selection-mode-active', warehouseSelectionMode);
}
/** ゴミ箱選択モード切替 */
function toggleTrashSelectionMode() {
    /* (省略なし) */ trashSelectionMode = !trashSelectionMode;
    console.log(`Trash select mode: ${trashSelectionMode}`);
    const btn = document.getElementById('trash-selection-mode-btn');
    if (btn) {
        btn.textContent = trashSelectionMode ? '選択解除' : '選択モード';
        btn.style.backgroundColor = trashSelectionMode ? '#f0ad4e' : '';
    }
    if (!trashSelectionMode) clearTrashSelections();
    updateTrashSelectionButtons();
    document
        .getElementById('warehouse-card-container')
        ?.classList.toggle('selection-mode-active', trashSelectionMode);
}
/** 倉庫選択ボタン表示更新 */
function updateWarehouseSelectionButtons() {
    /* (省略なし) */ if (currentTab === 'ゴミ箱') return;
    const delBtn = document.getElementById('delete-selected-warehouse-btn');
    const addBtn = document.getElementById('add-to-party-btn');
    if (!delBtn || !addBtn) return;
    if (!warehouseSelectionMode) {
        delBtn.style.display = 'none';
        addBtn.style.display = 'none';
        return;
    }
    const cnt = document.querySelectorAll('#warehouse-card-container .card.selected').length;
    const hasSel = cnt > 0;
    console.log(`Updating wh select btns. Count: ${cnt}`);
    if (warehouseMode === 'menu') {
        delBtn.style.display = hasSel ? 'inline-block' : 'none';
        addBtn.style.display = 'none';
        if (hasSel) delBtn.textContent = `選択(${cnt})ゴミ箱へ`;
    } else {
        delBtn.style.display = 'none';
        addBtn.style.display = hasSel ? 'inline-block' : 'none';
        if (hasSel) addBtn.textContent = `選択(${cnt})パーティへ`;
    }
}
/** ゴミ箱選択ボタン表示更新 */
function updateTrashSelectionButtons() {
    /* (省略なし) */ if (currentTab !== 'ゴミ箱') return;
    const resBtn = document.getElementById('trash-restore-selected-btn');
    const delBtn = document.getElementById('trash-delete-selected-btn');
    if (!resBtn || !delBtn) return;
    if (!trashSelectionMode) {
        resBtn.style.display = 'none';
        delBtn.style.display = 'none';
        return;
    }
    const cnt = document.querySelectorAll('#warehouse-card-container .card.selected').length;
    const hasSel = cnt > 0;
    console.log(`Updating trash select btns. Count: ${cnt}`);
    resBtn.style.display = hasSel ? 'inline-block' : 'none';
    delBtn.style.display = hasSel ? 'inline-block' : 'none';
    if (hasSel) {
        resBtn.textContent = `選択(${cnt})倉庫へ`;
        delBtn.textContent = `選択(${cnt})完全削除`;
    }
}
/** 倉庫選択解除 */
function clearWarehouseSelections() {
    /* (省略なし) */ document
        .querySelectorAll('#warehouse-card-container .card.selected')
        .forEach((el) => el.classList.remove('selected'));
    console.log('Cleared warehouse selections.');
}
/** ゴミ箱選択解除 */
function clearTrashSelections() {
    /* (省略なし) */ document
        .querySelectorAll('#warehouse-card-container .card.selected')
        .forEach((el) => el.classList.remove('selected'));
    console.log('Cleared trash selections.');
}

// --- 画像生成 (★ Stability AI 使用) ---

/**
 * 倉庫カードの画像を Stability AI で生成
 * @param {object} card 対象カード
 * @param {HTMLButtonElement} btn 生成ボタン要素
 */
async function generateWarehouseImage(card, btn) {
    if (!card || !card.id) return;
    console.log(`[Warehouse] Generating image for card ${card.id} using Stability AI...`);
    // ★ クライアントとキーのチェック
    if (!window.stabilityClient) {
        showToast('画像生成クライアント未初期化');
        return;
    }
    const stabilityApiKey = localStorage.getItem('stabilityApiKey') || '';
    if (!stabilityApiKey) {
        showToast('Stability AI APIキー未設定');
        return;
    }
    if (!window.geminiClient) {
        showToast('翻訳用Geminiクライアント未初期化');
        return;
    } // 翻訳に使う
    if (window.stabilityClient.isStubMode || window.geminiClient.isStubMode) {
        console.warn('[Warehouse] Running generateWarehouseImage in STUB MODE.');
        // スタブ処理
        card.imageData = 'data:image/svg+xml,...'; // ダミーSVGなど
        const idx = window.characterData.findIndex((c) => c?.id === card.id);
        if (idx !== -1) window.characterData[idx].imageData = card.imageData;
        await saveCharacterDataToIndexedDB(window.characterData); // import
        reloadCardElement(card.id);
        showToast('スタブ画像生成');
        return;
    }

    if (btn) btn.disabled = true;
    showToast('カード画像を生成中です...'); // import

    // 日本語プロンプト生成
    const promptJa = buildWarehouseImagePrompt(card); // 下で定義
    const cardIndex = window.characterData.findIndex((c) => c?.id === card.id);
    if (cardIndex !== -1) window.characterData[cardIndex].imagePrompt = promptJa; // 保存(任意)
    console.log(`[Warehouse] Original prompt (JA): "${promptJa}"`);
    let promptEn = '';

    try {
        // --- プロンプト英語翻訳 (Gemini利用) ---
        const translationModelId = document.getElementById('model-select')?.value;
        if (!translationModelId) throw new Error('翻訳用Geminiモデル未選択');
        try {
            console.log('[Warehouse] Translating prompt to English...');
            // 翻訳用の指示を調整 (カードの種類に応じて)
            let transContext =
                'Translate Japanese description to English keywords/phrases for image prompt.';
            if (card.type === 'アイテム')
                transContext =
                    'Translate Japanese item description to English keywords/phrases for image prompt.';
            else if (card.type === 'モンスター')
                transContext =
                    'Translate Japanese monster description to English keywords/phrases for image prompt.';
            const translationPrompt = `${transContext}\n---\n${promptJa}\n---\nEnglish Keywords:`;
            window.geminiClient.initializeHistory([]);
            promptEn = await window.geminiClient.generateContent(
                translationPrompt,
                translationModelId
            ); // グローバル
            console.log(`[Warehouse] Translated prompt (EN): "${promptEn}"`);
            if (!promptEn?.trim()) throw new Error('翻訳結果が空');
        } catch (translateError) {
            throw new Error(`プロンプト英語翻訳失敗: ${translateError.message}`);
        }

        // --- Stability AI 呼び出し ---
        const rarityNum = parseInt((card.rarity || '★1').replace('★', ''), 10) || 1;
        // ★ カードタイプとレア度に応じて解像度とスタイルを設定
        let width = 1024,
            height = 1024,
            stylePreset = 'anime'; // デフォルト (アイテムなど)
        if (card.type === 'キャラクター') {
            if (rarityNum >= 3) {
                width = 768;
                height = 1344;
            } // 高レアキャラは縦長
            else {
                width = 1344;
                height = 768;
            } // 低レアキャラは横長
        } else if (card.type === 'モンスター') {
            width = 1344;
            height = 768; // モンスターは横長
            stylePreset = 'fantasy-art'; // ファンタジーアート風 (例)
        } else if (card.type === 'アイテム') {
            stylePreset = 'photographic'; // アイテムは写真風 (例)
            width = 1024;
            height = 1024; // 正方形
        }
        console.log(`[Warehouse] Target resolution: ${width}x${height}, Style: ${stylePreset}`);

        const imageOptions = {
            samples: 1,
            width: width,
            height: height,
            style_preset: stylePreset,
        };
        console.log('[Warehouse] Calling stabilityClient.generateImage:', imageOptions);
        const imageResults = await window.stabilityClient.generateImage(
            promptEn,
            stabilityApiKey,
            imageOptions
        ); // ★ クラスインスタンス経由
        const base64ImageData = imageResults?.[0]?.imageDataB64;

        if (!base64ImageData) throw new Error('API画像データ取得失敗');
        const dataUrl = 'data:image/png;base64,' + base64ImageData;

        // characterData 更新 & DB保存
        if (cardIndex !== -1) {
            window.characterData[cardIndex].imageData = dataUrl;
            window.characterData[cardIndex].rotationAngle = 0; // 回転リセット
            await saveCharacterDataToIndexedDB(window.characterData); // import
            console.log(`Image saved for card ${card.id}.`);
            showToast('画像生成完了'); // import
            reloadCardElement(card.id); // 表示更新
        } else {
            console.warn(`Card ${card.id} not found after gen.`);
            showToast('カード情報更新失敗');
        } // import
    } catch (err) {
        console.error(`[Warehouse] カード画像生成失敗 (Card ID: ${card.id}):`, err);
        showToast(`画像生成エラー: ${err.message}`); // import
    } finally {
        if (btn) btn.disabled = false; // ボタン有効化
    }
}

/** カード情報から画像生成用プロンプト組立 (日本語で) */
function buildWarehouseImagePrompt(card) {
    // (中身は変更なし - 省略せず記述)
    let pb = '';
    switch (card.type) {
        case 'キャラクター':
            pb = '全身アニメキャラ';
            break;
        case 'アイテム':
            pb = 'アイテムのイラスト';
            break;
        case 'モンスター':
            pb = 'ファンタジーモンスター';
            break;
        default:
            pb = 'イラスト';
    }
    let p = pb;
    if (card.name) p += ` 名前「${card.name}」。`;
    if (card.state) p += ` 状態/外見: ${card.state}。`;
    if (card.special) p += ` 特技/効果: ${card.special}。`;
    if (card.caption) p += ` 説明: ${card.caption}。`;
    const r = parseInt((card.rarity || '').replace('★', '')) || 1;
    if (r >= 4) p += ' 高品質、詳細。';
    if (r === 5) p += ' 壮大、ダイナミック。';
    p += ' 背景はシンプルに。文字は不要。';
    return p.trim();
}

/** 指定IDのカード要素再読込 */
function reloadCardElement(cardId) {
    // (中身は変更なし - 省略せず記述)
    const cardEl = document.querySelector(`#warehouse-card-container .card[data-id="${cardId}"]`);
    if (cardEl) {
        const cardData = window.characterData.find((c) => c?.id === cardId);
        if (cardData) {
            let newEl =
                currentTab === 'ゴミ箱'
                    ? createTrashCardElement(cardData)
                    : createWarehouseCardElement(cardData);
            if (newEl) {
                cardEl.replaceWith(newEl);
                console.log(`Card reloaded: ${cardId}`);
            }
        } else {
            console.warn(`Data not found for reload: ${cardId}.`);
            cardEl.remove();
        }
    } else {
        console.warn(`Element not found for reload: ${cardId}.`);
    }
}

// --- 画像プレビュー (回転機能付き) ---
/** 画像プレビューモーダルを開く */
function openImagePreview(card) {
    // (中身は変更なし - 省略せず記述)
    if (!card || !card.imageData) {
        showToast('プレビュー画像なし');
        return;
    }
    let angle = card.rotationAngle || 0;
    const html = `<div style="position:relative; background-color:#111; overflow:hidden; text-align:center; width: 95vw; height: 95vh; display: flex; align-items: center; justify-content: center;"><img id="warehouse-preview-image" src="${DOMPurify.sanitize(
        card.imageData
    )}" alt="プレビュー: ${DOMPurify.sanitize(
        card.name || card.id
    )}" style="max-width:100%; max-height:100%; object-fit:contain; cursor:default; transition: transform 0.3s ease;" /><div style="position:absolute; bottom:20px; left:50%; transform:translateX(-50%); z-index:10; background-color:rgba(0,0,0,0.7); padding:8px 15px; border-radius:5px; display:flex; gap:15px;"><button id="warehouse-preview-rotate-left-btn" title="左回転" style="min-width: initial; padding: 5px 10px;"><span class="iconmoon icon-undo2" style="transform: scaleX(-1); font-size: 1.2rem;"></span></button><button id="warehouse-preview-rotate-right-btn" title="右回転" style="min-width: initial; padding: 5px 10px;"><span class="iconmoon icon-undo2" style="font-size: 1.2rem;"></span></button></div></div>`;
    multiModalOpen({
        title: `プレビュー: ${DOMPurify.sanitize(card.name || card.id)}`,
        contentHtml: html,
        showCloseButton: true,
        appearanceType: 'center',
        closeOnOutsideClick: true,
        onOpen: () => {
            const img = document.getElementById('warehouse-preview-image');
            const btnL = document.getElementById('warehouse-preview-rotate-left-btn');
            const btnR = document.getElementById('warehouse-preview-rotate-right-btn');
            if (!img) return;
            applyRotationToElement(img, angle);
            const rotate = async (dir) => {
                angle = dir === 'left' ? (angle - 90 + 360) % 360 : (angle + 90) % 360;
                applyRotationToElement(img, angle);
                const idx = window.characterData.findIndex((c) => c?.id === card.id);
                if (idx !== -1) {
                    window.characterData[idx].rotationAngle = angle;
                    try {
                        await saveCharacterDataToIndexedDB(window.characterData);
                        const listImg = document.querySelector(
                            `#warehouse-card-container .card[data-id="${card.id}"] img`
                        );
                        applyRotationToElement(listImg, angle);
                    } catch (e) {
                        showToast('回転保存失敗');
                    }
                }
            };
            btnL?.addEventListener('click', (e) => {
                e.stopPropagation();
                rotate('left');
            });
            btnR?.addEventListener('click', (e) => {
                e.stopPropagation();
                rotate('right');
            });
        },
    });
}

/** HTML要素に回転スタイル適用 */
function applyRotationToElement(element, angle) {
    // (中身は変更なし - 省略せず記述)
    if (!element) return;
    const norm = (angle || 0) % 360;
    let tf = `rotate(${norm}deg)`;
    if (norm === 90 || norm === 270) tf += ' scale(1.3)';
    element.style.transform = tf;
}

// --- ソート処理 ---
/** ソートキー変更時 */
function onSortChange() {
    // (中身は変更なし - 省略せず記述)
    const sortKey = document.getElementById('warehouse-sort-dropdown')?.value;
    if (!sortKey) return;
    const { sortDir } = getSortConfig(currentTab);
    console.log(`Sort key changed: ${sortKey}`);
    setSortConfig(currentTab, sortKey, sortDir);
    loadCardsByTab();
}
/** ソート方向変更時 */
function onSortDirToggle() {
    // (中身は変更なし - 省略せず記述)
    const dirBtn = document.getElementById('warehouse-sort-direction-btn');
    if (!dirBtn) return;
    const config = getSortConfig(currentTab);
    const newDir = config.sortDir === 'asc' ? 'desc' : 'asc';
    console.log(`Sort direction toggled: ${newDir}`);
    setSortConfig(currentTab, config.sortKey, newDir);
    dirBtn.innerHTML = `<span class="iconmoon ${
        newDir === 'asc' ? 'icon-sort-alpha-asc' : 'icon-sort-alpha-desc'
    }"></span>`;
    loadCardsByTab();
}
/** ソートUIをストレージから復元 */
function applySortUIFromStorage(tabName) {
    // (中身は変更なし - 省略せず記述)
    const dropdown = document.getElementById('warehouse-sort-dropdown');
    const dirBtn = document.getElementById('warehouse-sort-direction-btn');
    if (!dropdown || !dirBtn) return;
    const { sortKey, sortDir } = getSortConfig(tabName);
    dropdown.value = sortKey;
    dirBtn.innerHTML = `<span class="iconmoon ${
        sortDir === 'asc' ? 'icon-sort-alpha-asc' : 'icon-sort-alpha-desc'
    }"></span>`;
    console.log(`Applied sort UI: ${sortKey} ${sortDir}`);
}

// --- アクション関数 (移動、削除など) ---
/** 倉庫カードをゴミ箱へ移動 (単体) */
async function moveSingleCardToTrash(cardId) {
    // (中身は変更なし - 省略せず記述)
    console.log(`Moving ${cardId} to trash...`);
    const idx = window.characterData.findIndex((c) => c?.id === cardId);
    if (idx === -1) {
        showToast('対象カードなし');
        return;
    }
    window.characterData[idx].group = 'Trash';
    try {
        await saveCharacterDataToIndexedDB(window.characterData);
        showToast('ゴミ箱へ移動');
        reloadCurrentTabView();
    } catch (e) {
        window.characterData[idx].group = 'Warehouse';
        showToast(`移動失敗: ${e.message}`);
    }
}
/** 倉庫選択カードをゴミ箱へ移動 */
async function moveSelectedCardsToTrash() {
    // (中身は変更なし - 省略せず記述)
    if (warehouseMode !== 'menu') return;
    const sel = document.querySelectorAll('#warehouse-card-container .card.selected');
    if (sel.length === 0) {
        showToast('カード未選択');
        return;
    }
    console.log(`Moving ${sel.length} cards to trash...`);
    multiModalOpen({
        title: '選択をゴミ箱へ',
        contentHtml: `<p>${sel.length}枚移動？</p>`,
        okLabel: '移動',
        onOk: async () => {
            let moved = 0;
            const ids = Array.from(sel).map((el) => el.dataset.id);
            ids.forEach((id) => {
                const idx = window.characterData.findIndex((c) => c?.id === id);
                if (idx !== -1) {
                    window.characterData[idx].group = 'Trash';
                    moved++;
                }
            });
            if (moved > 0) {
                try {
                    await saveCharacterDataToIndexedDB(window.characterData);
                    showToast(`${moved}枚移動`);
                    warehouseSelectionMode = false;
                    reloadCurrentTabView();
                } catch (e) {
                    showToast(`移動エラー: ${e.message}`);
                    loadCardsByTab();
                }
            } else {
                showToast('対象なし');
            }
        },
    });
}
/** 倉庫選択カードをパーティへ追加 */
async function addSelectedCardsToParty() {
    // (中身は変更なし - 省略せず記述)
    if (warehouseMode !== 'party' || !currentPartyIdForAdd) return;
    const sel = document.querySelectorAll('#warehouse-card-container .card.selected');
    if (sel.length === 0) {
        showToast('カード未選択');
        return;
    }
    console.log(`Adding ${sel.length} cards to party ${currentPartyIdForAdd}...`);
    let added = 0;
    const ids = Array.from(sel).map((el) => el.dataset.id);
    ids.forEach((id) => {
        const idx = window.characterData.findIndex((c) => c?.id === id);
        if (idx !== -1) {
            window.characterData[idx].group = 'Party';
            window.characterData[idx].partyId = currentPartyIdForAdd;
            window.characterData[idx].role = 'none';
            added++;
        }
    });
    if (added > 0) {
        try {
            await saveCharacterDataToIndexedDB(window.characterData);
            showToast(`${added}枚追加`);
            warehouseSelectionMode = false;
            reloadCurrentTabView();
            if (typeof afterAddCallback === 'function') afterAddCallback();
            updateWarehouseSelectionButtons();
        } catch (e) {
            showToast(`追加エラー: ${e.message}`);
            loadCardsByTab();
        }
    } else {
        showToast('対象なし');
    }
}
/** ゴミ箱カードを倉庫へ戻す (単体) */
async function restoreSingleCard(cardId) {
    // (中身は変更なし - 省略せず記述)
    console.log(`Restoring ${cardId}...`);
    const idx = window.characterData.findIndex((c) => c?.id === cardId);
    if (idx === -1) {
        showToast('対象なし');
        return;
    }
    window.characterData[idx].group = 'Warehouse';
    delete window.characterData[idx].partyId;
    try {
        await saveCharacterDataToIndexedDB(window.characterData);
        showToast('倉庫に戻しました');
        reloadCurrentTabView();
    } catch (e) {
        window.characterData[idx].group = 'Trash';
        showToast(`復元失敗: ${e.message}`);
    }
}
/** ゴミ箱カードを完全削除 (単体) */
async function deleteSingleCardPermanently(cardId) {
    // (中身は変更なし - 省略せず記述)
    console.log(`Deleting ${cardId}...`);
    const idx = window.characterData.findIndex((c) => c?.id === cardId);
    if (idx === -1) {
        showToast('対象なし');
        return;
    }
    const removed = window.characterData.splice(idx, 1)[0];
    try {
        await saveCharacterDataToIndexedDB(window.characterData);
        showToast('完全削除');
        reloadCurrentTabView();
    } catch (e) {
        window.characterData.splice(idx, 0, removed);
        showToast(`削除失敗: ${e.message}`);
    }
}
/** ゴミ箱選択カードを倉庫へ戻す */
async function restoreSelectedTrashCards() {
    // (中身は変更なし - 省略せず記述)
    const sel = document.querySelectorAll('#warehouse-card-container .card.selected');
    if (sel.length === 0) {
        showToast('カード未選択');
        return;
    }
    console.log(`Restoring ${sel.length} cards...`);
    multiModalOpen({
        title: '選択を倉庫へ',
        contentHtml: `<p>${sel.length}枚戻す？</p>`,
        okLabel: '戻す',
        onOk: async () => {
            let restored = 0;
            const ids = Array.from(sel).map((el) => el.dataset.id);
            ids.forEach((id) => {
                const idx = window.characterData.findIndex((c) => c?.id === id);
                if (idx !== -1 && window.characterData[idx].group === 'Trash') {
                    window.characterData[idx].group = 'Warehouse';
                    delete window.characterData[idx].partyId;
                    restored++;
                }
            });
            if (restored > 0) {
                try {
                    await saveCharacterDataToIndexedDB(window.characterData);
                    showToast(`${restored}枚戻しました`);
                    trashSelectionMode = false;
                    reloadCurrentTabView();
                } catch (e) {
                    showToast(`復元エラー: ${e.message}`);
                    loadCardsByTab();
                }
            } else {
                showToast('対象なし');
            }
        },
    });
}
/** ゴミ箱選択カードを完全削除 */
async function deleteSelectedTrashCards() {
    // (中身は変更なし - 省略せず記述)
    const sel = document.querySelectorAll('#warehouse-card-container .card.selected');
    if (sel.length === 0) {
        showToast('カード未選択');
        return;
    }
    console.log(`Deleting ${sel.length} cards...`);
    multiModalOpen({
        title: '選択を完全削除',
        contentHtml: `<p style="color:#ffcccc;"><strong>警告:</strong> ${sel.length}枚完全削除？</p>`,
        okLabel: '完全削除',
        okButtonColor: '#f44336',
        onOk: async () => {
            let deleted = 0;
            const ids = Array.from(sel).map((el) => el.dataset.id);
            const original = [...window.characterData];
            window.characterData = window.characterData.filter((c) => {
                if (c?.group === 'Trash' && ids.includes(c.id)) {
                    deleted++;
                    return false;
                }
                return true;
            });
            if (deleted > 0) {
                try {
                    await saveCharacterDataToIndexedDB(window.characterData);
                    showToast(`${deleted}枚完全削除`);
                    trashSelectionMode = false;
                    reloadCurrentTabView();
                } catch (e) {
                    window.characterData = original;
                    showToast(`削除エラー: ${e.message}`);
                    loadCardsByTab();
                }
            } else {
                showToast('対象なし');
            }
        },
    });
}
/** ゴミ箱全カードを倉庫へ戻す */
async function restoreAllTrashCards() {
    // (中身は変更なし - 省略せず記述)
    console.log('Restoring all...');
    const trash = window.characterData.filter((c) => c?.group === 'Trash');
    if (trash.length === 0) {
        showToast('ゴミ箱空');
        return;
    }
    multiModalOpen({
        title: '全て倉庫へ',
        contentHtml: `<p>${trash.length}枚全て倉庫へ？</p>`,
        okLabel: '全て戻す',
        onOk: async () => {
            let restored = 0;
            window.characterData.forEach((c) => {
                if (c?.group === 'Trash') {
                    c.group = 'Warehouse';
                    delete c.partyId;
                    restored++;
                }
            });
            if (restored > 0) {
                try {
                    await saveCharacterDataToIndexedDB(window.characterData);
                    showToast(`${restored}枚戻しました`);
                    trashSelectionMode = false;
                    reloadCurrentTabView();
                } catch (e) {
                    showToast(`復元エラー: ${e.message}`);
                    loadCardsByTab();
                }
            }
        },
    });
}
/** ゴミ箱全カードを完全削除 */
async function deleteAllTrashCards() {
    // (中身は変更なし - 省略せず記述)
    console.log('Emptying trash...');
    const trash = window.characterData.filter((c) => c?.group === 'Trash');
    if (trash.length === 0) {
        showToast('ゴミ箱空');
        return;
    }
    multiModalOpen({
        title: 'ゴミ箱を空に',
        contentHtml: `<p style="color:#ffcccc;"><strong>警告:</strong> ${trash.length}枚全て完全削除？</p>`,
        okLabel: 'ゴミ箱を空に',
        okButtonColor: '#f44336',
        onOk: async () => {
            const original = [...window.characterData];
            const len = window.characterData.length;
            window.characterData = window.characterData.filter((c) => c?.group !== 'Trash');
            const deleted = len - window.characterData.length;
            if (deleted > 0) {
                try {
                    await saveCharacterDataToIndexedDB(window.characterData);
                    showToast(`ゴミ箱空 (${deleted}枚削除)`);
                    trashSelectionMode = false;
                    reloadCurrentTabView();
                } catch (e) {
                    window.characterData = original;
                    showToast(`削除エラー: ${e.message}`);
                    loadCardsByTab();
                }
            } else {
                console.warn('No cards removed.');
            }
        },
    });
}

/** 現在タブ表示を再読み込み */
function reloadCurrentTabView() {
    console.log('[Warehouse] Reloading current tab view:', currentTab);
    loadCardsByTab(); // カード再読み込み & 表示
}

// --- ファイル読み込み完了ログ ---
console.log('[Warehouse] warehouse.js loaded and showWarehouseModal function exported.');
