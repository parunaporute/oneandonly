/*******************************************************
 * common.js
 * アプリ全体で使い回す共通関数 (トースト表示など)
 * ★ showToast 関数を export する
 *******************************************************/

/**
 * 簡易トーストメッセージの表示
 * （画面下部中央に表示）
 * @param {string} message 表示するメッセージ
 * @param {string} [type='info'] メッセージタイプ ('info', 'success', 'error') 見た目を変える用
 * ★ export を追加
 */
export function showToast(message, type = 'info') {
    // 既存トーストがあれば削除 (連続表示に対応)
    const oldToast = document.getElementById('toast-message');
    if (oldToast) {
        oldToast.remove();
    }

    // 新規トースト要素を作成
    const toast = document.createElement('div');
    toast.id = 'toast-message';
    toast.textContent = message;
    toast.className = `toast toast-${type}`; // タイプに応じてクラス付与 (CSSでスタイル定義)

    // 基本スタイル設定 (CSSでの定義推奨)
    Object.assign(toast.style, {
        position: 'fixed',
        bottom: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '12px 25px',
        borderRadius: '6px',
        fontSize: '0.95rem',
        zIndex: '10000', // 最前面に
        opacity: '0', // 初期透明
        transition: 'opacity 0.4s ease, transform 0.4s ease', // フェードイン/アウト + 上下移動
        fontFamily: 'sans-serif', // フォント指定
        boxShadow: '0 3px 8px rgba(0,0,0,0.2)',
    });

    // タイプ別スタイル (CSSで定義推奨)
    if (type === 'success') {
        toast.style.backgroundColor = 'rgba(76, 175, 80, 0.9)'; // 緑系
        toast.style.color = '#fff';
    } else if (type === 'error') {
        toast.style.backgroundColor = 'rgba(244, 67, 54, 0.9)'; // 赤系
        toast.style.color = '#fff';
    } else {
        // info (デフォルト)
        toast.style.backgroundColor = 'rgba(50, 50, 50, 0.9)'; // ダークグレー系
        toast.style.color = '#fff';
    }

    document.body.appendChild(toast);

    // フェードイン + 少し上に移動するアニメーション
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(-50%) translateY(-10px)'; // 少し上に
    });

    // 3秒後にフェードアウトして削除
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(10px)'; // 少し下に
        // transitionend イベントで要素を削除
        toast.addEventListener(
            'transitionend',
            () => {
                // まだ要素が存在すれば削除 (複数回呼ばれるのを防ぐ)
                if (toast.parentNode) {
                    toast.remove();
                }
            },
            { once: true }
        ); // イベントリスナーを一度だけ実行
    }, 3000); // 3秒後に消える
}

// --- DOMContentLoaded 内の処理 ---
// この部分は common.js がモジュールとして読み込まれた場合でも、
// そのファイルが読み込まれた時点で一度だけ実行されます。
// 特定のページ(index.htmlなど)でのみ実行したい処理は、
// そのページのメインJSファイル(menu.jsなど)に移動するのがより適切かもしれません。
window.addEventListener('DOMContentLoaded', async () => {
    console.log('[Common] DOMContentLoaded event fired.');

    // 「取説」ボタンのクリックイベント (これが common.js にあるのが適切か？)
    // このボタンは index.html にしか無い可能性が高い。
    // menu.js に移すことを検討。
    const tutorialButton = document.getElementById('open-tutorial-list-button');
    if (tutorialButton) {
        // リスナーが既に追加されていないか確認
        if (!tutorialButton.hasAttribute('data-common-listener-added')) {
            tutorialButton.addEventListener('click', () => {
                console.log('[Common] Tutorial button clicked (redirecting).');
                window.location.href = 'tutorialList.html';
            });
            tutorialButton.setAttribute('data-common-listener-added', 'true');
        }
    } else {
        // index.html 以外ではボタンがないので、このログは出る可能性がある
        // console.log("[Common] Tutorial button not found on this page.");
    }
});

// ファイル読み込み完了ログ
console.log('[Common] common.js loaded and showToast function exported.');
