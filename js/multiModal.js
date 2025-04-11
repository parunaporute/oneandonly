// multiModal.js
// 複数同時表示を可能にする簡易サンプル
// ★ 元のスタイルに戻し、ES Modules 形式で export する

// --- クラス定義 (内部で使用) ---
class ModalInstance {
    constructor(options) {
        // ★ デフォルトオプションのマージは元のコードにはなかったので、そのまま受け取る
        this.options = { ...options };
        this.modalBackdrop = null;
        this.modalContainer = null;
        this.isOpen = false;
        // bind 'this' for event listeners
        this.onBackdropClick = this.onBackdropClick.bind(this);
        this.ok = this.ok.bind(this);
        this.cancel = this.cancel.bind(this);
        this.close = this.close.bind(this);
    }

    open() {
        if (this.isOpen) {
            console.warn('[MultiModal] Modal is already open.');
            return;
        }
        // DOM生成 (なければ)
        if (!this.modalBackdrop) {
            this.createDOM(); // 下で定義 (元のコード)
        }
        // オプション反映 (元のコード)
        this.applyAppearanceType(this.options.appearanceType || 'center');
        this.fillContents(); // 下で定義 (元のコード)

        // z-index 管理 (元のコード)
        const baseZ = 9999; // ★ 元のコードの baseZ
        const topZ = baseZ + getOpenedModalCount() * 2; // 元のコードの計算方法
        if (this.modalBackdrop) this.modalBackdrop.style.zIndex = topZ;
        if (this.modalContainer) this.modalContainer.style.zIndex = topZ + 1;

        // 表示 (元のコード)
        if (this.modalBackdrop) this.modalBackdrop.style.display = 'block'; // ★ 元通り block に
        this.isOpen = true;

        // モーダル外クリック (元のコード)
        if (this.options.closeOnOutsideClick && this.modalBackdrop) {
            this.modalBackdrop.addEventListener('click', this.onBackdropClick);
        }
        // 管理用リストに追加 (元のコード)
        addToGlobalModalList(this); // 下で定義
        console.log(`[MultiModal] Modal opened. Total open: ${getOpenedModalCount()}`);

        // onOpen コールバック (元のコード)
        if (typeof this.options.onOpen === 'function') {
            setTimeout(() => {
                try {
                    // ★ 元のコードでは引数を渡していないので、それに合わせる
                    this.options.onOpen();
                } catch (e) {
                    console.error('[MultiModal] Error in onOpen callback:', e);
                }
            }, 0);
        }
    }

    createDOM() {
        // ★ 元のコードの DOM 生成ロジックに戻す
        // バックドロップ
        this.modalBackdrop = document.createElement('div');
        this.modalBackdrop.className = 'mmodal-backdrop'; // CSSクラス名
        Object.assign(this.modalBackdrop.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(0, 0, 0, 0.7)', // 半透明の黒
            display: 'none', // 初期非表示
        });

        // コンテナ
        this.modalContainer = document.createElement('div');
        this.modalContainer.className = 'mmodal-container'; // CSSクラス名
        // ★ 元のスタイル設定に戻す
        Object.assign(this.modalContainer.style, {
            position: 'absolute', // backdrop基準
            backgroundColor: 'rgba(0,0,0,0.8)', // 元の背景色
            color: '#fff', // 元の文字色
            padding: '20px', // 元のパディング
            borderRadius: '5px', // 元の角丸
            width: 'calc(100% - 20px)', // ★ 元の幅計算
            boxSizing: 'border-box',
            overflow: 'auto', // ★ 元の overflow 設定
            maxHeight: '100vh', // ★ 元の maxHeight 設定
            // top, left, transform は applyAppearanceType で設定
        });

        // 構造と追加 (元のコード)
        this.modalBackdrop.appendChild(this.modalContainer);
        document.body.appendChild(this.modalBackdrop);
        console.log('[MultiModal] Modal DOM created (original style).');
    }

    applyAppearanceType(type) {
        // ★ 元のコードの AppearanceType ロジック
        if (!this.modalContainer) return;
        const s = this.modalContainer.style;
        // デフォルトスタイルをリセット (念のため)
        s.top = '';
        s.left = '';
        s.transform = '';

        if (type === 'center') {
            s.top = '50%';
            s.left = '50%';
            s.transform = 'translate(-50%, -50%)';
        } else if (type === 'top') {
            s.top = '0'; // ★ 元のコードでは top: 0
            s.left = '50%';
            s.transform = 'translate(-50%, 0)';
        } else {
            // デフォルト (type なし or 不明な type) は center と同じにする
            s.top = '50%';
            s.left = '50%';
            s.transform = 'translate(-50%, -50%)';
        }
        console.log(`[MultiModal] Applied appearance type: ${type || 'center'}`);
    }

    fillContents() {
        // ★ 元のコードの fillContents ロジック
        if (!this.modalContainer) return;
        this.modalContainer.innerHTML = ''; // クリア

        // タイトル (h2)
        if (this.options.title) {
            const h2 = document.createElement('h2'); // 元の h2
            h2.textContent = this.options.title;
            // 元のコードにはスタイル指定がなかったので追加しない
            this.modalContainer.appendChild(h2);
        }

        // 内容 (HTML)
        if (this.options.contentHtml) {
            const contentDiv = document.createElement('div');
            // 元のコードではクラス名指定なし
            // ★ DOMPurify によるサニタイズを追加（セキュリティ推奨）
            if (typeof DOMPurify !== 'undefined') {
                contentDiv.innerHTML = DOMPurify.sanitize(this.options.contentHtml, {
                    USE_PROFILES: { html: true },
                });
            } else {
                console.warn('[MultiModal] DOMPurify not found. Setting potentially unsafe HTML.');
                contentDiv.innerHTML = this.options.contentHtml;
            }
            this.modalContainer.appendChild(contentDiv);
        }

        // 右上閉じるボタン (×)
        if (this.options.showCloseButton !== false) {
            // ★ デフォルト true に変更 (元は指定がある場合のみ)
            const closeBtn = document.createElement('button');
            closeBtn.innerHTML = '&times;';
            closeBtn.setAttribute('aria-label', '閉じる');
            // ★ 元のスタイルに戻す
            Object.assign(closeBtn.style, {
                position: 'absolute',
                top: '10px',
                right: '10px',
                background: 'transparent',
                border: 'none',
                color: '#fff',
                fontSize: '1.2rem', // 元のサイズ
                cursor: 'pointer',
                padding: '0',
                lineHeight: '1', // 微調整
            });
            // closeButtonId オプションが指定されていれば、その値をIDとして設定
            if (this.options.closeButtonId) closeBtn.id = this.options.closeButtonId;
            closeBtn.addEventListener('click', this.cancel); // cancel メソッド呼び出し
            this.modalContainer.appendChild(closeBtn);
        }

        // ボタンエリア (元のコード)
        const buttonArea = document.createElement('div');
        buttonArea.className = 'mmodal-button-area'; // スタイル用クラス
        // ★ 元のスタイルに戻す
        Object.assign(buttonArea.style, {
            display: 'flex',
            justifyContent: 'center', // 元は center
            gap: '10px',
            marginTop: '20px',
        });

        let hasButtons = false;

        // 追加ボタン (元のコード)
        if (Array.isArray(this.options.additionalButtons)) {
            this.options.additionalButtons.forEach((bcfg) => {
                if (!bcfg || !bcfg.label) return;
                const btn = document.createElement('button');
                if (bcfg.id) btn.id = bcfg.id; // ID 設定
                btn.textContent = bcfg.label;
                if (typeof bcfg.onClick === 'function') {
                    // ★ 元のコードではインスタンスを渡していない
                    btn.addEventListener('click', () => {
                        try {
                            bcfg.onClick();
                        } catch (e) {
                            console.error(e);
                        }
                    });
                }
                if (bcfg.color) btn.style.backgroundColor = bcfg.color; // 色指定
                buttonArea.appendChild(btn);
                hasButtons = true;
            });
        }

        // キャンセルボタン (元のコード)
        if (typeof this.options.cancelLabel === 'string') {
            const cancelBtn = document.createElement('button');
            // ★ ID は指定があれば使う
            if (this.options.cancelButtonId) cancelBtn.id = this.options.cancelButtonId;
            cancelBtn.textContent = this.options.cancelLabel;
            cancelBtn.addEventListener('click', this.cancel);
            buttonArea.appendChild(cancelBtn);
            hasButtons = true;
        }

        // OKボタン (元のコード)
        if (typeof this.options.okLabel === 'string') {
            const okBtn = document.createElement('button');
            // ★ ID は指定があれば使う
            if (this.options.okButtonId) okBtn.id = this.options.okButtonId;
            okBtn.textContent = this.options.okLabel;
            if (this.options.okButtonColor)
                okBtn.style.backgroundColor = this.options.okButtonColor; // 色指定
            okBtn.disabled = this.options.okDisabled || false; // 無効状態
            okBtn.addEventListener('click', this.ok);
            buttonArea.appendChild(okBtn);
            hasButtons = true;
        }

        // ボタンがあればエリアを追加
        if (hasButtons) {
            this.modalContainer.appendChild(buttonArea);
        }
    }

    // 背景クリック時の処理 (元のコード)
    onBackdropClick(e) {
        if (e.target === this.modalBackdrop) {
            console.log('[MultiModal] Backdrop clicked, closing via cancel.');
            this.cancel();
        }
    }

    // OKボタン処理 (元のコード)
    ok() {
        console.log('[MultiModal] OK button clicked.');
        let shouldClose = true;
        if (typeof this.options.onOk === 'function') {
            try {
                // ★ 元のコードでは false を返しても閉じない機能はなかったので削除
                this.options.onOk();
            } catch (e) {
                console.error('Error in onOk:', e);
            }
        }
        // if (shouldClose) this.close(); // ★ 元のコードでは onOk 後に必ず close
        this.close(); // onOk の後に必ず閉じる
    }

    // キャンセルボタン処理 (元のコード)
    cancel() {
        console.log('[MultiModal] Cancel logic triggered.');
        if (typeof this.options.onCancel === 'function') {
            try {
                this.options.onCancel();
            } catch (e) {
                console.error('Error in onCancel:', e);
            }
        }
        this.close(); // キャンセル時は必ず閉じる
    }

    // モーダルを閉じる処理 (元のコード + リスナー解除)
    close() {
        if (!this.isOpen) return;
        console.log('[MultiModal] Closing modal.');
        this.isOpen = false;

        // ★ 元のコードのリスナー解除処理
        if (this.options.closeOnOutsideClick && this.modalBackdrop) {
            this.modalBackdrop.removeEventListener('click', this.onBackdropClick);
        }
        // 他にリスナーがあればここで解除

        // ★ 元のコードの DOM 除去処理
        if (this.modalBackdrop && this.modalBackdrop.parentNode) {
            this.modalBackdrop.parentNode.removeChild(this.modalBackdrop);
            this.modalBackdrop = null; // 参照解除
            this.modalContainer = null;
            console.log('[MultiModal] Modal DOM removed immediately.');
        }
        // 管理用リストから除去 (元のコード)
        removeFromGlobalModalList(this); // 下で定義
        console.log(`[MultiModal] Modal closed. Total open: ${getOpenedModalCount()}`);

        // onClose コールバック (★ 元のコードにはなかったが、追加しても良い)
        if (typeof this.options.onClose === 'function') {
            try {
                this.options.onClose(this);
            } catch (e) {
                console.error('Error in onClose:', e);
            }
        }
    }
} // End of ModalInstance class

// --- グローバル管理用ヘルパー (元のコード) ---
const globalModalList = [];
function addToGlobalModalList(modalInstance) {
    globalModalList.push(modalInstance);
}
function removeFromGlobalModalList(modalInstance) {
    const i = globalModalList.indexOf(modalInstance);
    if (i >= 0) {
        globalModalList.splice(i, 1);
    }
}
function getOpenedModalCount() {
    return globalModalList.length;
}

// --- ★ 公開する関数 (元の window.multiModal.open と同じ機能) ---
/**
 * 新しいモーダルを開きます。
 * @param {object} options モーダルの設定オプション (ModalInstance の constructor 参照)
 * @returns {ModalInstance} 生成されたモーダルインスタンス
 */
export function open(options) {
    // ★ export する
    const modalInstance = new ModalInstance(options);
    modalInstance.open();
    return modalInstance; // インスタンスを返す
}

// --- window.multiModal への代入は削除 ---
// window.multiModal = { open };

// --- ファイル読み込み完了ログ ---
console.log('[MultiModal] multiModal.js loaded (original style) and open function exported.');
