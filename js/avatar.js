// avatar.js
// あなたの分身(アバター)管理用スクリプト
// ★ renderAvatarCardPreview の可読性向上
// ★ ES Modules 形式、initAvatar を export
// ★ 画像生成を stabilityClient.generateImage に変更済
// ★ プロンプト英語化処理を追加済
// ★ DBアクセス関数は indexedDB.js から import 想定
// ★ 省略なし

// --- モジュールインポート ---
import { open as multiModalOpen } from './multiModal.js';
import { showToast } from './common.js';
import { saveAvatarData, loadAvatarData } from './indexedDB.js';
// DOMPurify はグローバルにある想定
// window.geminiClient, window.stabilityClient は menu.js などで初期化されている想定

// --- モジュールスコープ変数 ---
let currentAvatarData = null;
const AVATAR_STORE_KEY = 'myAvatar';

/**
 * 初期化：ページ読み込み後 (通常は menu.js などから) 呼び出し
 */
export function initAvatar() {
    console.log('[Avatar] Initializing avatar module (ESM)...');
    const btn = document.getElementById('you-avatar-btn');
    if (btn) {
        if (!btn.hasAttribute('data-avatar-listener-added')) {
            btn.addEventListener('click', openAvatarModal);
            btn.setAttribute('data-avatar-listener-added', 'true');
            console.log('[Avatar] Event listener added.');
        }
    } else {
        console.warn('Avatar button not found.');
    }
}

/**
 * アバター編集モーダルを開く
 */
async function openAvatarModal() {
    console.log('[Avatar] Opening avatar modal...');
    try {
        currentAvatarData = await loadAvatarData(AVATAR_STORE_KEY); // import
        console.log('Loaded data:', currentAvatarData);
        if (!currentAvatarData) {
            console.log('Creating new template.');
            currentAvatarData = {
                id: AVATAR_STORE_KEY,
                name: '',
                gender: '男',
                skill: '',
                job: '',
                serif: '',
                rarity: '★1',
                imageData: '',
                imagePrompt: '',
                rotationAngle: 0,
            };
        }
        if (typeof currentAvatarData.rotationAngle === 'undefined')
            currentAvatarData.rotationAngle = 0;

        multiModalOpen({
            // import
            title: 'あなたの分身',
            contentHtml: buildAvatarModalHtml(currentAvatarData),
            appearanceType: 'center',
            showCloseButton: true,
            closeOnOutsideClick: true,
            cancelLabel: '閉じる',
            additionalButtons: [{ id: 'avatar-save-btn', label: '保存', onClick: onSaveAvatar }],
            onOpen: () => {
                console.log('Modal opened. Setting up UI...');
                setupAvatarModalUI();
            },
        });
    } catch (e) {
        console.error('Failed open modal:', e);
        showToast(`読込失敗: ${e.message}`);
    } // import
}

/**
 * アバター編集モーダルのHTMLを組み立てる
 */
function buildAvatarModalHtml(avatarData) {
    // (中身は変更なし - 省略せず記述)
    const name = DOMPurify.sanitize(avatarData.name || '');
    const skill = DOMPurify.sanitize(avatarData.skill || '');
    const job = DOMPurify.sanitize(avatarData.job || '');
    const serif = DOMPurify.sanitize(avatarData.serif || '');
    return `<div class="l-flexbox mobile-col" style="gap: 20px;"><div id="avatar-card-preview-container" style="flex: 0 0 300px; display: flex; flex-direction: column; align-items: center; position: sticky; top: 20px;"><p style="font-size: 0.8em; color: #aaa; margin-top: 10px;">（プレビュー）</p></div><div id="avatar-form-container" style="flex: 1; min-width: 250px;"><div class="edit-row" style="max-width: none; margin-bottom: 1rem;"><label for="avatar-name" style="margin-bottom: 5px; font-weight: bold;">名前 <span style="color: #ff8a8a; font-size: 0.8em;">*必須</span></label><input type="text" id="avatar-name" placeholder="アバターの名前" value="${name}" required style="width: 100%; padding: 8px;"/></div><div class="edit-row" style="max-width: none; margin-bottom: 1rem;"><label style="margin-bottom: 5px; font-weight: bold;">性別</label><div id="avatar-gender-chips" class="chips-container" style="margin-top: 5px;"></div></div><div class="edit-row" style="max-width: none; margin-bottom: 1rem;"><label for="avatar-job" style="margin-bottom: 5px; font-weight: bold;">職業</label><textarea id="avatar-job" rows="1" placeholder="例: 剣士" style="width: 100%; padding: 8px;">${job}</textarea></div><div class="edit-row" style="max-width: none; margin-bottom: 1rem;"><label for="avatar-skill" style="margin-bottom: 5px; font-weight: bold;">特技・特徴</label><textarea id="avatar-skill" rows="2" placeholder="例: 火魔法" style="width: 100%; padding: 8px;">${skill}</textarea></div><div class="edit-row" style="max-width: none; margin-bottom: 1rem;"><label for="avatar-serif" style="margin-bottom: 5px; font-weight: bold;">決め台詞 / 口癖</label><textarea id="avatar-serif" rows="2" placeholder="短いセリフ" style="width: 100%; padding: 8px;">${serif}</textarea></div><div class="edit-row" style="max-width: none; margin-bottom: 1rem;"><label style="margin-bottom: 5px; font-weight: bold;">レア度</label><div id="avatar-rarity-chips" class="chips-container" style="margin-top: 5px;"></div></div><p style="font-size: 0.8em; color: #aaa; margin-top: 20px;">※名前以外は画像生成参考情報</p></div></div>`;
}

/**
 * アバターモーダル内のUI設定
 */
function setupAvatarModalUI() {
    // (中身は変更なし - 省略せず記述)
    const nIn = document.getElementById('avatar-name'),
        sIn = document.getElementById('avatar-skill'),
        jIn = document.getElementById('avatar-job'),
        srIn = document.getElementById('avatar-serif');
    [nIn, sIn, jIn, srIn].forEach((i) => {
        if (i)
            i.addEventListener('input', () => {
                if (currentAvatarData) {
                    currentAvatarData.name = nIn?.value.trim() || '';
                    currentAvatarData.skill = sIn?.value.trim() || '';
                    currentAvatarData.job = jIn?.value.trim() || '';
                    currentAvatarData.serif = srIn?.value.trim() || '';
                    renderAvatarCardPreview();
                }
            });
    });
    setupChips('avatar-gender-chips', ['男', '女', '不定'], currentAvatarData.gender, (v) => {
        if (currentAvatarData) currentAvatarData.gender = v;
        renderAvatarCardPreview();
    });
    setupChips(
        'avatar-rarity-chips',
        ['★1', '★2', '★3', '★4', '★5'],
        currentAvatarData.rarity,
        (v) => {
            if (currentAvatarData) currentAvatarData.rarity = v;
            renderAvatarCardPreview();
        }
    );
    renderAvatarCardPreview();
    console.log('Avatar modal UI setup complete.');
}

/** チップUIセットアップ */
function setupChips(containerId, valueList, currentValue, onChange) {
    // (中身は変更なし - 省略せず記述)
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`#${containerId} not found.`);
        return;
    }
    container.innerHTML = '';
    valueList.forEach((val) => {
        const chip = document.createElement('div');
        chip.className = 'chip chip-mini';
        chip.textContent = val;
        chip.dataset.value = val;
        if (val === currentValue) chip.classList.add('selected');
        chip.addEventListener('click', () => {
            container.querySelectorAll('.chip').forEach((c) => c.classList.remove('selected'));
            chip.classList.add('selected');
            onChange(val);
            console.log(`Chip selected: ${val}`);
        });
        container.appendChild(chip);
    });
}

/** 保存ボタン処理 */
async function onSaveAvatar() {
    // (中身は変更なし - 省略せず記述)
    console.log('Save clicked.');
    if (!currentAvatarData) {
        showToast('アバターデータなし');
        return;
    }
    const nEl = document.getElementById('avatar-name');
    if (!nEl?.value.trim()) {
        showToast('名前は必須');
        nEl?.focus();
        return;
    }
    const sEl = document.getElementById('avatar-skill'),
        jEl = document.getElementById('avatar-job'),
        srEl = document.getElementById('avatar-serif');
    if (nEl) currentAvatarData.name = nEl.value.trim();
    if (sEl) currentAvatarData.skill = sEl.value.trim();
    if (jEl) currentAvatarData.job = jEl.value.trim();
    if (srEl) currentAvatarData.serif = srEl.value.trim();
    console.log('Saving data:', currentAvatarData);
    try {
        await saveAvatarData(currentAvatarData);
        console.log('Save successful.');
        showToast('保存しました');
    } catch (e) {
        console.error('Save failed:', e);
        showToast(`保存失敗: ${e.message}`);
    }
}

/**
 * カードプレビュー描画 (★ 可読性向上、変数名修正済み)
 */
function renderAvatarCardPreview() {
    const previewContainer = document.getElementById('avatar-card-preview-container');
    if (!previewContainer) {
        console.warn('[Avatar] Preview container not found, skipping render.');
        return;
    }
    previewContainer.innerHTML = ''; // クリア

    if (!currentAvatarData) {
        console.warn('[Avatar] Cannot render preview: currentAvatarData is null.');
        previewContainer.textContent = '(データがありません)';
        return;
    }
    const rarityNum = parseInt((currentAvatarData.rarity || '★1').replace('★', ''), 10) || 1;

    // カード要素全体
    const cardEl = document.createElement('div'); // ★ 変数名 cardEl
    cardEl.className = `card avatar-card rarity${rarityNum}`;
    cardEl.style.width = '300px';

    // カード内部 (3D回転用だが、ここでは使わない)
    const cardInner = document.createElement('div');
    cardInner.className = 'card-inner';

    // カード表面
    const cardFront = document.createElement('div');
    cardFront.className = 'card-front';
    cardFront.innerHTML = `<div class="bezel rarity${rarityNum}"></div>`; // ベゼル

    // タイプ ("アバター")
    const typeEl = document.createElement('div');
    typeEl.className = 'card-type';
    typeEl.textContent = 'アバター';
    cardFront.appendChild(typeEl);

    // --- ▼▼▼ 画像表示エリア (修正箇所) ▼▼▼ ---
    const imageContainer = document.createElement('div'); // 変数名 imageContainer
    imageContainer.className = 'card-image';

    if (currentAvatarData.imageData) {
        // 画像がある場合
        imageContainer.style.cursor = 'pointer';
        const imgEl = document.createElement('img');
        imgEl.src = currentAvatarData.imageData;
        imgEl.alt = currentAvatarData.name || 'アバター画像';
        imgEl.loading = 'lazy';
        applyRotation(imgEl, currentAvatarData.rotationAngle); // 回転適用
        imgEl.addEventListener('click', (e) => {
            e.stopPropagation();
            openAvatarImagePreview(currentAvatarData); // プレビュー表示
        });
        imageContainer.appendChild(imgEl); // imageContainerに画像追加
    } else {
        // 画像がない場合
        imageContainer.style.cursor = 'default';
        const genBtn = document.createElement('button');
        genBtn.className = 'gen-image-btn';
        genBtn.id = 'avatar-generate-image-btn';
        genBtn.innerHTML = `<span class="iconmoon icon-picture"></span> 画像生成`;
        genBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await generateAvatarImage(currentAvatarData, genBtn); // ★ Stability AI で生成
        });
        imageContainer.appendChild(genBtn); // imageContainerにボタン追加
    }
    // imageContainer を cardFront に追加 (if/else の外で一度だけ)
    cardFront.appendChild(imageContainer);
    // --- ▲▲▲ 画像表示エリア (修正箇所) ▲▲▲ ---

    // 情報エリア
    const infoContainer = document.createElement('div');
    infoContainer.className = 'card-info';
    infoContainer.innerHTML = `
         <p><h3 style="margin: 0 0 5px 0; font-size: 1.1em;">${DOMPurify.sanitize(
             currentAvatarData.name || '(名称未設定)'
         )}</h3></p>
         <p style="font-size: 0.9em; margin: 2px 0;"><strong>性別:</strong> ${DOMPurify.sanitize(
             currentAvatarData.gender || '-'
         )}</p>
         ${
             currentAvatarData.job
                 ? `<p style="font-size: 0.9em; margin: 2px 0;"><strong>職業:</strong> ${DOMPurify.sanitize(
                       currentAvatarData.job
                   )}</p>`
                 : ''
         }
         ${
             currentAvatarData.skill
                 ? `<p style="font-size: 0.9em; margin: 2px 0;"><strong>特技:</strong> ${DOMPurify.sanitize(
                       currentAvatarData.skill
                   )}</p>`
                 : ''
         }
         ${
             currentAvatarData.serif
                 ? `<p style="font-size: 0.9em; margin-top: 8px; font-style: italic;">“${DOMPurify.sanitize(
                       currentAvatarData.serif
                   )}”</p>`
                 : ''
         }
    `;
    cardFront.appendChild(infoContainer);

    // 裏面 (元のコードにはあったが、アバタープレビューでは不要かも？ CSS依存)
    const cardBack = document.createElement('div');
    cardBack.className = 'card-back';
    cardBack.innerHTML = `<strong>アバター</strong>`;

    // 構造を正しく組み立てる
    cardInner.appendChild(cardFront);
    // cardInner.appendChild(cardBack); // 裏面も表示する場合
    cardEl.appendChild(cardInner); // cardEl に cardInner を追加

    // 最終的にコンテナに追加
    previewContainer.appendChild(cardEl);

    // 画像削除ボタン (画像がある場合のみ)
    if (currentAvatarData.imageData) {
        console.log('hoge');
        const delBtnContainer = document.createElement('div');
        delBtnContainer.style.marginTop = '10px';
        delBtnContainer.style.textAlign = 'center';
        const delBtn = document.createElement('button');
        delBtn.style.backgroundColor = '#f44336';
        delBtn.innerHTML = `<span class="iconmoon icon-bin"></span> 画像削除`;
        delBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            multiModalOpen({
                // import
                title: '画像削除確認',
                contentHtml: '<p>画像を削除しますか？</p>',
                okLabel: '削除',
                okButtonColor: '#f44336',
                onOk: async () => {
                    if (currentAvatarData) {
                        currentAvatarData.imageData = '';
                        currentAvatarData.rotationAngle = 0;
                        try {
                            await saveAvatarData(currentAvatarData);
                            renderAvatarCardPreview();
                            showToast('画像削除');
                        } catch (e) {
                            showToast(`削除失敗: ${e.message}`);
                        } // import
                    }
                },
            });
        });
        delBtnContainer.appendChild(delBtn);
        previewContainer.appendChild(delBtnContainer); // 削除ボタンコンテナを追加
    }
}

/** アバター画像プレビュー (回転機能付き) */
function openAvatarImagePreview(avatarData) {
    // (中身は変更なし - 省略せず記述)
    if (!avatarData || !avatarData.imageData) return;
    let angle = avatarData.rotationAngle || 0;
    const html = `<div style="position:relative; background-color:#111; overflow:hidden; text-align:center; width: 95vw; height: 95vh; display: flex; align-items: center; justify-content: center;"><img id="avatar-preview-image" src="${DOMPurify.sanitize(
        avatarData.imageData
    )}" alt="プレビュー" style="max-width:100%; max-height:100%; object-fit:contain; cursor:default; transition: transform 0.3s ease;" /><div style="position:absolute; bottom:20px; left:50%; transform:translateX(-50%); z-index:10; background-color:rgba(0,0,0,0.7); padding:8px 15px; border-radius:5px; display:flex; gap:15px;"><button id="avatar-preview-rotate-left-btn" title="左回転" style="min-width: initial; padding: 5px 10px;"><span class="iconmoon icon-undo2" style="transform: scaleX(-1); font-size: 1.2rem;"></span></button><button id="avatar-preview-rotate-right-btn" title="右回転" style="min-width: initial; padding: 5px 10px;"><span class="iconmoon icon-undo2" style="font-size: 1.2rem;"></span></button></div></div>`;
    multiModalOpen({
        title: '画像プレビュー',
        contentHtml: html,
        showCloseButton: true,
        appearanceType: 'center',
        closeOnOutsideClick: true,
        onOpen: () => {
            const img = document.getElementById('avatar-preview-image');
            const btnL = document.getElementById('avatar-preview-rotate-left-btn');
            const btnR = document.getElementById('avatar-preview-rotate-right-btn');
            if (!img) return;
            applyRotation(img, angle);
            const rotate = async (dir) => {
                angle = dir === 'left' ? (angle - 90 + 360) % 360 : (angle + 90) % 360;
                applyRotation(img, angle);
                if (currentAvatarData) {
                    currentAvatarData.rotationAngle = angle;
                    try {
                        await saveAvatarData(currentAvatarData);
                        const mainImg = document.querySelector(
                            '#avatar-card-preview-container img'
                        );
                        applyRotation(mainImg, angle);
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

/** img要素に回転スタイル適用 */
function applyRotation(imgEl, angle) {
    // (中身は変更なし - 省略せず記述)
    if (!imgEl) return;
    const norm = (angle || 0) % 360;
    let tf = `rotate(${norm}deg)`;
    if (norm === 90 || norm === 270) tf += ' scale(1.3)';
    imgEl.style.transform = tf;
}

/**
 * アバター画像生成 (★ Stability AI 呼び出し、解像度修正済み)
 */
async function generateAvatarImage(avatar, btnElement) {
    // (中身は変更なし - 省略せず記述)
    console.log('[Avatar] Generating avatar image using Stability AI...');
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
    }
    if (window.stabilityClient.isStubMode || window.geminiClient.isStubMode) {
        console.warn('[Avatar] Running generateAvatarImage in STUB MODE.');
        avatar.imageData = 'data:image/svg+xml,...';
        await saveAvatarData(avatar);
        renderAvatarCardPreview();
        showToast('スタブ画像生成');
        return;
    }
    if (btnElement) btnElement.disabled = true;
    showToast('アバター画像を生成しています...');
    const promptJa = buildAvatarPrompt(avatar);
    avatar.imagePrompt = promptJa;
    console.log(`[Avatar] Original prompt (JA): "${promptJa}"`);
    let promptEn = '';
    try {
        const translationModelId = document.getElementById('model-select')?.value;
        if (!translationModelId) throw new Error('翻訳用Geminiモデル未選択');
        try {
            console.log('[Avatar] Translating prompt to English...');
            const translationPrompt = `Translate Japanese description to English keywords/phrases for image prompt:\n---\n${promptJa}\n---\nEnglish Keywords:`;
            window.geminiClient.initializeHistory([]);
            promptEn = await window.geminiClient.generateContent(
                translationPrompt,
                translationModelId
            );
            console.log(`[Avatar] Translated prompt (EN): "${promptEn}"`);
            if (!promptEn?.trim()) throw new Error('翻訳結果が空');
        } catch (translateError) {
            throw new Error(`プロンプト英語翻訳失敗: ${translateError.message}`);
        }
        const rarityNum = parseInt((avatar.rarity || '★1').replace('★', ''), 10) || 1;
        let width = 1024,
            height = 1024,
            stylePreset = 'anime';
        if (rarityNum >= 3) {
            width = 832;
            height = 1216; // アスペクト比 約 0.684
        } else {
            width = 1344;
            height = 768;
        }
        console.log(`[Avatar] Target resolution: ${width}x${height}`);
        const imageOptions = {
            samples: 1,
            width: width,
            height: height,
            style_preset: stylePreset,
        };
        console.log('[Avatar] Calling stabilityClient.generateImage:', imageOptions);
        const imageResults = await window.stabilityClient.generateImage(
            promptEn,
            stabilityApiKey,
            imageOptions
        );
        const base64ImageData = imageResults?.[0]?.imageDataB64;
        if (!base64ImageData) throw new Error('API画像データ取得失敗');
        const dataUrl = 'data:image/png;base64,' + base64ImageData;
        avatar.imageData = dataUrl;
        avatar.rotationAngle = 0;
        await saveAvatarData(avatar);
        console.log('[Avatar] Avatar image data saved.');
        showToast('画像生成完了');
        renderAvatarCardPreview();
    } catch (err) {
        console.error('[Avatar] アバター画像生成失敗:', err);
        showToast(`画像生成失敗: ${err.message}`);
    } finally {
        if (btnElement) btnElement.disabled = false;
    }
}

/** アバター情報からプロンプト組立 (日本語で) */
function buildAvatarPrompt(avatar) {
    // (中身は変更なし - 省略せず記述)
    let prompt = `全身イラスト。`;
    if (avatar.job) prompt += `職業は${avatar.job}。`;
    if (avatar.gender) prompt += `性別は${avatar.gender}。`;
    if (avatar.skill) prompt += `特技や特徴は${avatar.skill}。`;
    if (avatar.serif) prompt += `性格や雰囲気は「${avatar.serif}」。`;
    prompt += `背景はシンプルに。`;
    return prompt.trim();
}

// --- ファイル読み込み完了ログ ---
console.log('[Avatar] avatar.js loaded and initAvatar exported.');
