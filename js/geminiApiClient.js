// geminiApiClient.js
// ★ Gemini API (テキスト生成、モデルリスト) 専用クライアントに戻す
// ★ 画像生成関連メソッド (Imagen 3, Stability AI) を削除

/**
 * Gemini API (generativelanguage.googleapis.com) との通信を行うクライアントクラス
 * 主にテキスト生成 (:generateContent) とモデルリスト取得 (:listModels) を担当
 */
export class GeminiApiClient {
    #geminiApiKey; // プライベートプロパティとして Gemini API キーを保持
    #textBaseUrl = 'https://generativelanguage.googleapis.com/v1beta/models/'; // テキスト生成/モデルリスト用
    // #imageBaseUrl は削除
    // #stabilityApiBaseUrl は削除

    conversationHistory = []; // テキスト生成用の会話履歴
    #stubMode = false; // スタブモードフラグ
    #stubResponses = [
        // テキスト生成スタブ応答例
        'なるほど、それであなたは市場に向かうことにしたのですね。活気ある声と香辛料の匂いが漂ってきます。何を探しますか？',
        '古いレンガ造りの図書館の扉を開けると、静寂と古い本の匂いに包まれました。どのセクションを調べますか？',
        '路地裏に入ると、不思議な雰囲気の店を見つけました。中から猫の鳴き声が聞こえます。入ってみますか？',
        '川沿いを歩いていると、吟遊詩人が物悲しい歌を歌っていました。話しかけてみますか？',
    ];
    // #stubImageResponse は削除

    /**
     * @param {string} geminiApiKey Gemini API キー (Google AI Studio で取得したもの)
     * @param {object} [options] オプション
     * @param {boolean} [options.stubMode=false] スタブモードを有効にするか
     */
    constructor(geminiApiKey, options = {}) {
        if (!geminiApiKey || geminiApiKey === 'YOUR_API_KEY') {
            console.warn(
                '[GeminiClient] APIキーが設定されていないか、有効でない可能性があります。スタブモードでない場合、API呼び出しは失敗します。'
            );
        }
        this.#geminiApiKey = geminiApiKey;
        this.#stubMode = options.stubMode || false;
        if (this.#stubMode) {
            console.warn('[GeminiClient] --- GeminiApiClientはスタブモードで動作しています ---');
        }
        console.log(`[GeminiClient] Initialized. Stub Mode: ${this.#stubMode}`);
    }

    /** スタブモードが有効か */
    get isStubMode() {
        return this.#stubMode;
    }

    /** 会話履歴を初期化 */
    initializeHistory(initialHistory = []) {
        // (中身は変更なし - 省略せず記述)
        if (
            Array.isArray(initialHistory) &&
            initialHistory.every((item) => item.role && item.parts)
        ) {
            this.conversationHistory = [...initialHistory];
            console.log('[GeminiClient] History initialized:', this.conversationHistory);
        } else {
            this.conversationHistory = [];
            if (initialHistory.length > 0) console.warn('[GeminiClient] Invalid initialHistory.');
            else console.log('[GeminiClient] History initialized (empty).');
        }
    }

    /** 現在の会話履歴を取得 */
    getHistory() {
        return [...this.conversationHistory];
    } // (中身は変更なし)

    /** テキスト生成 (generateContent) */
    async generateContent(prompt, modelId) {
        // (中身は変更なし - 省略せず記述)
        if (!prompt?.trim()) throw new Error('テキスト生成プロンプトが空');
        this.conversationHistory.push({ role: 'user', parts: [{ text: prompt }] });
        console.log(`[History User] ${prompt.substring(0, 100)}...`);
        if (this.#stubMode) {
            /* スタブ処理 */ const stubText =
                this.#stubResponses[Math.floor(Math.random() * this.#stubResponses.length)];
            this.conversationHistory.push({ role: 'model', parts: [{ text: stubText }] });
            console.log(`[History Model Stub] ${stubText}`);
            await new Promise((r) => setTimeout(r, 500));
            return stubText;
        }
        if (!this.#geminiApiKey) throw new Error('Gemini APIキー未設定');
        if (!modelId) throw new Error('テキスト生成モデルID未指定');
        const apiUrl = `${this.#textBaseUrl}${modelId}:generateContent?key=${this.#geminiApiKey}`;
        console.log(`[Gemini Text] POST ${apiUrl}`);
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: this.conversationHistory }),
            });
            const data = await response.json();
            if (!response.ok) {
                const msg = this.#formatApiError(response.status, data, modelId);
                if (this.conversationHistory.at(-1)?.role === 'user')
                    this.conversationHistory.pop();
                throw new Error(msg);
            }
            console.log('[Gemini Text Resp]', data);
            let text = '';
            if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
                text = data.candidates[0].content.parts[0].text;
                if (data.candidates[0].finishReason !== 'STOP')
                    text += ` (End: ${data.candidates[0].finishReason})`;
                this.conversationHistory.push({ role: 'model', parts: [{ text }] });
                console.log(`[History Model] ${text.substring(0, 100)}...`);
            } else if (data.promptFeedback?.blockReason) {
                text = `ブロック: ${data.promptFeedback.blockReason}`;
                this.conversationHistory.push({ role: 'model', parts: [{ text }] });
                console.log(`[History Model Blocked]`);
            } else {
                if (this.conversationHistory.at(-1)?.role === 'user')
                    this.conversationHistory.pop();
                throw new Error('予期しない応答形式');
            }
            return text;
        } catch (e) {
            console.error('[Gemini Text] Error:', e);
            throw e;
        }
    }

    // --- ▼▼▼ 画像生成関連メソッドは削除 ▼▼▼ ---
    // async generateImageWithImagen3(prompt, options = {}) { ... } // 削除
    // async generateImageContent(prompt, modelId = 'gemini-1.5-flash-latest') { ... } // 削除またはコメントアウト
    // async generateImageWithStabilityAI(prompt, stabilityApiKey, options = {}) { ... } // ここに追加していたものも削除

    /**
     * 利用可能なGeminiモデルを取得する静的メソッド (テキスト生成用)
     */
    static async listAvailableModels(apiKey) {
        // (中身は変更なし - 省略せず記述)
        if (!apiKey || apiKey === 'YOUR_API_KEY') throw new Error('APIキー未設定');
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        console.log('[GeminiClient] Fetching models:', url);
        try {
            const r = await fetch(url);
            const d = await r.json();
            if (!r.ok) {
                const m = d?.error?.message || r.statusText;
                throw new Error(`モデルリスト取得エラー (${r.status}): ${m}`);
            }
            console.log('[GeminiClient] Raw models:', d);
            const models = [];
            if (d.models?.length) {
                const info = {
                    'gemini-1.5-pro-latest': { tier: '高性能', desc: '...' },
                    'gemini-1.5-flash-latest': { tier: '高速', desc: '...' },
                    'gemini-pro': { tier: '標準', desc: '...' },
                };
                d.models.forEach((m) => {
                    if (m.supportedGenerationMethods?.includes('generateContent')) {
                        const id = m.name.replace('models/', '');
                        if (
                            id.includes('vision') ||
                            id.includes('embedding') ||
                            id.includes('aqa') ||
                            (/\d{3}$/.test(id) && !id.includes('latest'))
                        ) {
                            console.log(`Skipping: ${id}`);
                            return;
                        }
                        const i = info[id];
                        models.push({
                            id,
                            displayName: m.displayName || id,
                            description: m.description || i?.desc || '',
                            tier: i?.tier || null,
                        });
                    }
                });
            }
            if (models.length === 0) console.warn('No suitable text models.');
            models.sort((a, b) => {
                const to = { 高性能: 1, 高速: 2, 標準: 3, null: 99 };
                const tc = (to[a.tier] || 99) - (to[b.tier] || 99);
                if (tc !== 0) return tc;
                return (a.displayName || '').localeCompare(b.displayName || '', 'ja');
            });
            console.log('[GeminiClient] Filtered text models:', models);
            return models;
        } catch (e) {
            console.error('[GeminiClient] モデルリスト読込エラー:', e);
            throw e;
        }
    }

    /**
     * APIエラーレスポンスを整形する内部ヘルパーメソッド
     */
    #formatApiError(status, errorData, modelId = '') {
        // (中身は変更なし - 省略せず記述)
        const detail = errorData?.error?.message || '不明';
        let msg = `APIエラー (${status})`;
        if (modelId) msg += ` [${modelId}]`;
        msg += `: ${detail}`;
        if (status === 400) {
            if (detail.includes('API key not valid'))
                msg = `APIエラー(${status}): APIキー無効/権限不足`;
            else if (detail.includes('prompt was blocked'))
                msg = `APIエラー(${status}): プロンプトブロック`;
            else if (detail.includes('User location is not supported'))
                msg = `APIエラー(${status}): 地域非対応`;
            else msg = `APIエラー(${status}): リクエスト/入力不正 (${detail})`;
        } else if (status === 403) msg = `APIエラー(${status}): 権限不足 or API無効`;
        else if (status === 404) msg = `APIエラー(${status}): モデル '${modelId}' 未発見/利用不可`;
        else if (status === 429) msg = `APIエラー(${status}): Quota超過`;
        else if (status >= 500) msg = `APIエラー(${status}): Googleサーバーエラー`;
        return msg;
    }
} // End of GeminiApiClient class

console.log('[GeminiClient] geminiApiClient.js loaded (Gemini Text/ListModels only).'); // ログ修正
