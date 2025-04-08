// partyList.js
import { GeminiApiClient } from './geminiApiClient.js';
import { StabilityApiClient } from './stabilityApiClient.js';
import {
    initIndexedDB,
    listAllScenarios, // ← listAllScenarios はこのファイルでは不要かも？
    loadCharacterDataFromIndexedDB,
    getScenarioById, // ← getScenarioById はこのファイルでは不要かも？
    updateScenario, // ← updateScenario はこのファイルでは不要かも？
    deleteScenarioById, // ← deleteScenarioById はこのファイルでは不要かも？
    saveCharacterDataToIndexedDB,
    listAllParties,
    createParty,
    getPartyById, // ★ 追加: IDでパーティ取得
    updateParty, // ★ 追加: パーティ更新
    deletePartyById // ★ 追加: IDでパーティ削除 (importに移動)
} from './indexedDB.js';
import { showToast } from './common.js';
import { open as multiModalOpen } from './multiModal.js';
import { initAvatar } from './avatar.js'; // ← initAvatar はこのファイルでは不要かも？
import { initBackground, onChangeBgButtonClick } from './background.js';
import { showWarehouseModal } from './warehouse.js'; // ← showWarehouseModal はこのファイルでは不要かも？
import { openSaveLoadModal } from './universalSaveLoad.js'; // ← 念のため残す

// let editingPartyId = null; // ★ multiModal内で管理するため不要に

window.addEventListener("load", async () => {
    // IndexedDB初期化
    await initIndexedDB();
    await initBackground("partyList");

    // パーティ一覧を取得して描画
    await renderPartyList();

    // 新規作成ボタン
    document.getElementById("create-party-button").addEventListener("click", async () => {
        const newName = document.getElementById("new-party-name").value.trim();
        if (!newName) {
            showToast("パーティ名を入力してください。"); // alertから変更
            return;
        }
        try {
            const newId = await createParty(newName);
            document.getElementById("new-party-name").value = "";
            await renderPartyList();
            showToast(`パーティ「${newName}」を作成しました。`);
        } catch (e) {
            console.error(e);
            showToast("パーティ作成に失敗しました:\n" + e.message); // alertから変更
        }
    });

    // 戻るボタン
    document.getElementById("back-to-menu").addEventListener("click", () => {
        window.location.href = "index.html";
    });

    // --- ▼▼▼ モーダル関連のイベントリスナーは削除 ▼▼▼ ---
    // document.getElementById("edit-party-cancel-button").addEventListener("click", ...); // 削除
    // document.getElementById("edit-party-save-button").addEventListener("click", ...); // 削除
    // --- ▲▲▲ モーダル関連のイベントリスナーは削除 ▲▲▲ ---

    // 背景変更ボタン (元々あれば)
    const changeBgBtn = document.getElementById('change-bg-button');
    if (changeBgBtn) {
        changeBgBtn.addEventListener('click', onChangeBgButtonClick);
    }
    // セーブ・ロードボタン (元々あれば)
    const saveLoadBtn = document.getElementById('save-load-button');
    if (saveLoadBtn) {
        saveLoadBtn.addEventListener('click', openSaveLoadModal);
    }
    // 取説ボタン (元々あれば)
    const tutorialBtn = document.getElementById('open-tutorial-list-button');
    if (tutorialBtn) {
        tutorialBtn.addEventListener('click', () => {
            // tutorialManager.js の関数を呼び出すなど
             window.location.href = "tutorialList.html"; // 例
        });
    }
});

/** パーティ一覧を描画 */
async function renderPartyList() {
    const container = document.getElementById("party-list-container");
    container.innerHTML = ""; // クリア

    let parties = [];
    try {
        parties = await listAllParties();
        parties.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0)); // 更新日時で降順ソート
    } catch (e) {
        console.error(e);
        container.textContent = "パーティ一覧の取得に失敗しました。";
        return;
    }

    if (parties.length === 0) {
        container.textContent = "パーティがありません。";
        return;
    }

    parties.forEach(party => {
        const div = document.createElement("div");
        div.className = 'party-list-item'; // スタイル用クラス
        div.style.marginBottom = "10px";
        div.style.border = "1px solid #555"; // 少し調整
        div.style.padding = "10px";
        div.style.display = 'flex'; // flexboxで見やすく
        div.style.justifyContent = 'space-between';
        div.style.alignItems = 'center';
        div.style.gap = '10px'; // 要素間のスペース

        const info = document.createElement("span");
        info.style.flexGrow = '1'; // 名前部分が伸びるように
        info.textContent = `${party.name}`; // シンプルに名前だけ表示
        info.title = `ID: ${party.partyId}\n作成: ${new Date(party.createdAt).toLocaleString()}\n更新: ${party.updatedAt ? new Date(party.updatedAt).toLocaleString() : 'なし'}`; // ホバーで詳細表示
        div.appendChild(info);

        const buttonGroup = document.createElement("div"); // ボタンをまとめるdiv
        buttonGroup.style.display = 'flex';
        buttonGroup.style.gap = '5px';

        // --- ▼▼▼ 名前変更ボタンを追加 ▼▼▼ ---
        const editBtn = document.createElement("button");
        editBtn.innerHTML = '<span class="iconmoon icon-edit"></span>'; // アイコン例
        editBtn.title = '名前変更';
        editBtn.addEventListener('click', () => {
            openEditPartyModal(party.partyId, party.name); // モーダルを開く関数を呼ぶ
        });
        buttonGroup.appendChild(editBtn);
        // --- ▲▲▲ 名前変更ボタンを追加 ▲▲▲ ---

        // 編成ボタン
        const arrangeBtn = document.createElement("button");
        arrangeBtn.textContent = "編成"; // テキストのまま
        // arrangeBtn.innerHTML = '<span class="iconmoon icon-users"></span> 編成'; // アイコン＋テキスト例
        arrangeBtn.title = 'パーティ編成画面へ';
        arrangeBtn.addEventListener("click", () => {
            window.location.href = `partyCreate.html?partyId=${party.partyId}`;
        });
        buttonGroup.appendChild(arrangeBtn);

        // 削除ボタン
        const delBtn = document.createElement("button");
        delBtn.innerHTML = '<span class="iconmoon icon-bin"></span>'; // アイコン例
        delBtn.title = '削除';
        delBtn.style.color = "#ff8a8a"; // 少し危険な色
        delBtn.style.border = '1px solid #ff8a8a';
        delBtn.addEventListener("click", async () => {
            // 削除確認はmultiModalを使うとより親切
            multiModalOpen({
                title: 'パーティ削除確認',
                contentHtml: `<p>パーティ「${DOMPurify.sanitize(party.name)}」を削除しますか？<br><small>（所属していたキャラクターは倉庫に戻ります）</small></p>`,
                okLabel: '削除する',
                okButtonColor: '#f44336',
                cancelLabel: 'キャンセル',
                onOk: async () => {
                    try {
                        // 1) characterDataをロードして、このpartyIdを持つカードを倉庫へ戻す
                        const storedChars = await loadCharacterDataFromIndexedDB();
                        let changed = false;
                        if (storedChars && Array.isArray(storedChars)) {
                           for (const c of storedChars) {
                               if (c && c.group === "Party" && c.partyId === party.partyId) {
                                   c.group = "Warehouse";
                                   c.role = "none"; // 役割もリセット
                                   delete c.partyId; // partyId を削除
                                   changed = true;
                               }
                           }
                           if (changed) {
                               await saveCharacterDataToIndexedDB(storedChars);
                               console.log(`[PartyList] Characters moved from party ${party.partyId} to Warehouse.`);
                           }
                        } else {
                           console.warn("[PartyList] Could not load character data to move characters from deleted party.");
                        }


                        // 2) party本体を削除
                        await deletePartyById(party.partyId);
                        showToast(`パーティ「${party.name}」を削除しました。`);

                        // 再描画
                        await renderPartyList();
                    } catch (e) {
                        console.error(e);
                        showToast("パーティ削除に失敗しました:\n" + e.message); // alertから変更
                    }
                }
            });
            // 元の confirm は削除
            // if (!confirm(`パーティ「${party.name}」を削除します。よろしいですか？`)) { return; }
        });
        buttonGroup.appendChild(delBtn);

        div.appendChild(buttonGroup); // ボタン群を追加
        container.appendChild(div);
    });
}

// --- ▼▼▼ パーティ名変更モーダルを開く関数を新規作成 ▼▼▼ ---
/**
 * パーティ名変更モーダルを開く
 * @param {number} partyId 編集対象のパーティID
 * @param {string} currentName 現在のパーティ名
 */
function openEditPartyModal(partyId, currentName) {
    const modalContentId = `edit-party-name-input-${partyId}`; // モーダル内の入力要素ID

    multiModalOpen({
        title: 'パーティ名変更',
        contentHtml: `
            <div class="edit-row">
                <label for="${modalContentId}">新しいパーティ名:</label>
                <input type="text" id="${modalContentId}" value="${DOMPurify.sanitize(currentName || '')}" placeholder="パーティ名..." />
            </div>
        `,
        okLabel: '保存',
        cancelLabel: 'キャンセル',
        onOpen: () => {
            // モーダルが開いたら入力欄にフォーカス
            const inputEl = document.getElementById(modalContentId);
            if (inputEl) {
                inputEl.focus();
                inputEl.select(); // テキストを選択状態にする
            }
        },
        onOk: async (instance) => { // ★ multiModalInstance を受け取れるようにコールバックを定義 (multiModal.jsの実装による)
            const inputEl = document.getElementById(modalContentId);
            const newName = inputEl ? inputEl.value.trim() : '';

            if (!newName) {
                showToast("パーティ名を入力してください。");
                // モーダルは閉じずに再度フォーカス
                 if (inputEl) inputEl.focus();
                // return false; // multiModalが false を返すと閉じない機能があれば使う (なければこの行は不要)
                 // ★ multiModal.js の ok() 実装によると、false を返しても閉じるため、この return false は無意味
                 // ★ 代わりに、エラー時は明示的に close() を呼ばないようにするか、再度モーダルを開きなおす必要があるが、
                 // ★ 今回はシンプルに showToast を表示するだけにする。
                return; // 保存処理に進まず終了
            }

            try {
                const party = await getPartyById(partyId);
                if (!party) {
                    showToast("対象パーティが見つかりません。");
                    return; // モーダルは閉じられる
                }
                party.name = newName;
                party.updatedAt = new Date().toISOString();
                await updateParty(party);
                showToast(`パーティ名を「${newName}」に変更しました。`);
                await renderPartyList(); // リストを再描画
                // instance.close(); // onOkの後、multiModalが自動で閉じるはずなので不要
            } catch (e) {
                console.error(e);
                showToast("パーティ名の更新に失敗:\n" + e.message);
                // instance.close(); // エラー時もmultiModalが自動で閉じる
            }
        },
        // onCancel: (instance) => { // キャンセル時の追加処理があれば
        //    console.log("編集をキャンセルしました。");
        // }
    });
}
// --- ▲▲▲ パーティ名変更モーダルを開く関数を新規作成 ▲▲▲ ---

// hideEditPartyModal 関数は不要になるので削除