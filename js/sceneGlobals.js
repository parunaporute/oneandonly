/********************************
 * sceneGlobals.js
 * グローバル変数や共通定数などを集めたファイル
 * ★ 不要になった API キー、クライアントインスタンス、キャンセル関連を削除
 * ★ シナリオタイプなども currentScenario から参照するため削除
 * ★ ES Modules として読み込まれる前提 (中身は window への登録)
 * ★ 省略なし
 ********************************/

console.log('[Globals] Loading sceneGlobals.js...');

// -------------------------------
// ▼ グローバル変数定義 (window オブジェクトを使用)
// -------------------------------

// --- 削除される変数 ---
// window.apiKey = ''; // 削除: 各クライアントが内部管理 or localStorage 参照
// window.geminiClient = null; // 削除: 利用側で new する
// window.stabilityClient = null; // 削除: 利用側で new する
// window.currentRequestController = null; // 削除: キャンセル機能変更のため
// window.cancelRequested = false; // 削除: キャンセル機能変更のため
// window.scenarioType = null; // 削除: window.currentScenario.wizardData を参照
// window.clearCondition = null; // 削除: window.currentScenario.wizardData を参照
// window.sections = []; // 削除: window.currentScenario.wizardData を参照

// --- 維持される変数 ---

/** 現在表示・操作中のシナリオID (例: menu.js や sceneMain.js で設定) */
window.currentScenarioId = null;

/** 現在表示・操作中のシナリオオブジェクト全体 (例: sceneManager.js で設定)
 * これには wizardData (scenarioType, clearCondition, sections を含む) も含まれる想定
 */
window.currentScenario = null;

/** 現在のシナリオのシーン履歴 (メモリキャッシュ) (例: sceneManager.js で更新) */
window.scenes = [];

/** シーン要約のメモリキャッシュ (例: sceneManager.js で更新) */
window.sceneSummaries = []; // sceneSummaries[chunkIndex] = { en: '...', ja: '...' }

/** 選択されたアイテム (アイテム使用機能用) (例: sceneUI.js で更新) */
window.selectedItem = null;

/** IndexedDB データベース接続オブジェクト (indexedDB.js で設定) */
window.db = null;

/** DOMPurify の設定 (固定値) */
window.DOMPURIFY_CONFIG = {
  ALLOWED_TAGS: ['p', 'br', 'hr', 'h3', 'h4', 'h5', 'span', 'div', 'strong', 'em'],
  ALLOWED_ATTR: ['style'],
};

// --- グローバル変数ではないが、便宜上ここに置いている可能性のあるもの ---
// (特になし)

// --- ファイル読み込み完了ログ ---
console.log('[Globals] sceneGlobals.js loaded and global variables initialized (or set to null).');

// ★ このファイル自体は他のファイルから import する必要はありません。
//    HTML で <script type="module" src="js/sceneGlobals.js"></script> のように
//    他のスクリプトより先に読み込ませて、window オブジェクトに必要な変数を定義します。
