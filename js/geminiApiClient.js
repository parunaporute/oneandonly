// geminiApiClient.js
// Gemini API (テキスト生成、モデルリスト) 専用クライアント
// ★ Constructor で localStorage から API キーを読み込む
// ★ ES Modules 形式、クラスを export
// ★ 省略なし

/**
 * Gemini API (generativelanguage.googleapis.com) との通信を行うクライアントクラス
 * 主にテキスト生成 (:generateContent) とモデルリスト取得 (:listModels) を担当
 */
export class GeminiApiClient {
    #geminiApiKey = null; // プライベートプロパティとしてキーを保持
    #textBaseUrl = 'https://generativelanguage.googleapis.com/v1beta/models/';
    conversationHistory = [];
    #stubMode = false;
    #stubResponses = [
        '市場ですね。活気があります。何を探しましょう？',
        '図書館は静かです。どの棚へ？',
        '怪しい店…猫の声がします。入りますか？',
        '吟遊詩人がいますね。話しかけますか？',
    ];
    #isKeyValid = false; // キーが有効そうか (簡易チェック)

    /**
     * @param {object} [options={}] オプション
     * @param {boolean} [options.stubMode=false] スタブモードを有効にするか
     */
    constructor(options = {}) {
        this.#stubMode = options.stubMode || false; // スタブモード設定
        if (this.#stubMode) {
            console.warn('[GeminiClient] Constructor: Initializing in STUB MODE.');
            this.#isKeyValid = true; // スタブならキー不要だが利用可能扱い
        } else {
            // ★ localStorage から API キーを読み込む
            try {
                const storedKey = localStorage.getItem('geminiApiKey'); // menu.js で保存するキー名
                if (storedKey && storedKey !== 'YOUR_API_KEY' && storedKey.startsWith('AIza')) {
                    // 簡単な形式チェック
                    this.#geminiApiKey = storedKey;
                    this.#isKeyValid = true;
                    console.log(
                        '[GeminiClient] Constructor: Gemini API Key loaded and seems valid.'
                    );
                } else {
                    this.#geminiApiKey = null;
                    this.#isKeyValid = false;
                    if (storedKey) {
                        console.warn(
                            '[GeminiClient] Constructor: Invalid Gemini API Key found in localStorage.'
                        );
                    } else {
                        console.warn(
                            '[GeminiClient] Constructor: Gemini API Key not found in localStorage.'
                        );
                    }
                }
            } catch (e) {
                console.error(
                    '[GeminiClient] Constructor: Error accessing localStorage for API Key:',
                    e
                );
                this.#geminiApiKey = null;
                this.#isKeyValid = false;
            }
        }
        console.log(
            `[GeminiClient] Initialized. Stub Mode: ${this.#stubMode}, Key Set: ${!!this
                .#geminiApiKey}`
        );
    }

    /** API キーが設定されているか (スタブモードでなくてもキーが設定されているか) */
    get hasApiKey() {
        return !!this.#geminiApiKey;
    }

    /** API呼び出しが可能か (スタブモードか、キーが有効そうか) */
    get isAvailable() {
        console.log("API確認か？",this.#isKeyValid);
        // スタブモードが true なら常に利用可能
        // 通常モードなら #isKeyValid が true である必要がある
        return this.#stubMode || this.#isKeyValid;
    }

    /** スタブモードか */
    get isStubMode() {
        return this.#stubMode;
    }

    /** 会話履歴初期化 */
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
    /**
     * 選択されたモデルを使用して Gemini API (generateContent) でテキストを生成します。
     * 内部の会話履歴を使用・更新します。
     * ★ systemPrompt 引数を追加
     * @param {string} prompt ユーザーからの最新の入力プロンプト
     * @param {string} modelId 使用するモデルのID
     * @param {string | null} [systemPrompt=null] システムプロンプト (オプション)
     * @returns {Promise<string>} 生成されたテキスト
     * @throws {Error} APIキー/モデルIDがない場合、APIエラーの場合
     */
    async generateContent(prompt, modelId, systemPrompt = null) {
        // ★ systemPrompt 引数追加
        if (!prompt?.trim()) throw new Error('プロンプトが空');

        // ★ システムプロンプトとユーザープロンプトを含む会話履歴を作成
        const currentConversation = [...this.conversationHistory]; // 既存履歴コピー
        currentConversation.push({ role: 'user', parts: [{ text: prompt }] });
        console.log(`[GeminiClient][History User] ${prompt.substring(0, 100)}...`);

        // ★ リクエストボディに含めるコンテンツ
        const requestContents = [...currentConversation];

        // ★ リクエストボディ全体
        const requestBody = {
            contents: requestContents,
            // ★ generationConfig や safetySettings は必要なら追加
        };

        // ★ systemPrompt が指定されていれば、リクエストボディに追加
        //    Gemini API の正しいフィールド名は 'system_instruction' の可能性があります (要確認)
        if (systemPrompt && typeof systemPrompt === 'string') {
            requestBody.system_instruction = { parts: [{ text: systemPrompt }] };
            console.log('[GeminiClient] System prompt provided.');
        }

        // スタブモードまたはキー無効チェック
        if (this.#stubMode) {
            console.log('[GeminiClient][Stub] generateContent: Returning dummy response.');
            const stubText =
                this.#stubResponses[Math.floor(Math.random() * this.#stubResponses.length)];
            this.conversationHistory = currentConversation; // ★ ユーザー入力は履歴に残す
            this.conversationHistory.push({ role: 'model', parts: [{ text: stubText }] }); // スタブ応答も履歴へ
            console.log(`[GeminiClient][History Model Stub] ${stubText}`);
            await new Promise((r) => setTimeout(r, 500));
            return stubText;
        }
        if (!this.isAvailable || !this.#geminiApiKey) {
            if (this.conversationHistory.at(-1)?.role === 'user') this.conversationHistory.pop(); // 失敗時はユーザー入力削除
            throw new Error('Gemini APIキー未設定/無効');
        }
        if (!modelId) throw new Error('モデルID未指定');

        const apiUrl = `${this.#textBaseUrl}${modelId}:generateContent?key=${this.#geminiApiKey}`;
        console.log(`[GeminiClient][Text] POST ${apiUrl}`);
        // console.log("[GeminiClient][Text] Request Body:", JSON.stringify(requestBody, null, 2)); // デバッグ用

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            }); // ★ 修正したボディを使用
            const data = await response.json();
            if (!response.ok) {
                const msg = this.#formatApiError(response.status, data, modelId);
                if (this.conversationHistory.at(-1)?.role === 'user')
                    this.conversationHistory.pop();
                throw new Error(msg);
            }
            console.log('[GeminiClient][Text Response]', data);
            let text = '';
            if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
                text = data.candidates[0].content.parts[0].text;
                if (data.candidates[0].finishReason && data.candidates[0].finishReason !== 'STOP')
                    text += ` (End: ${data.candidates[0].finishReason})`;
                // ★ 成功したので会話履歴を更新
                this.conversationHistory = currentConversation;
                this.conversationHistory.push({ role: 'model', parts: [{ text }] });
                console.log(`[GeminiClient][History Model] ${text.substring(0, 100)}...`);
            } else if (data.promptFeedback?.blockReason) {
                text = `ブロック: ${data.promptFeedback.blockReason}`;
                // ★ ブロックされた場合も履歴は更新する（ユーザー入力は残る）
                this.conversationHistory = currentConversation;
                this.conversationHistory.push({ role: 'model', parts: [{ text }] });
                console.log(`[GeminiClient][History Model Blocked]`);
            } else {
                text = `(空応答: ${data.candidates?.[0]?.finishReason || '不明'})`;
                this.conversationHistory = currentConversation; // ユーザー入力は残す
                this.conversationHistory.push({ role: 'model', parts: [{ text }] });
                console.warn(`[GeminiClient][History Added - Model (Empty)]`, data);
            }
            return text;
        } catch (e) {
            console.error('[GeminiClient][Text] Error:', e);
            if (this.conversationHistory.at(-1)?.role === 'user') this.conversationHistory.pop();
            throw e;
        } // エラー時もユーザー入力削除
    }
    
    /**
     * 利用可能なGeminiモデルリスト取得 (静的メソッド)
     * ★ これは静的メソッドなので、APIキーは引数で受け取る必要がある
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
                    'gemini-1.5-pro-latest': { tier: '高性能', description: '...' },
                    'gemini-1.5-flash-latest': { tier: '高速', description: '...' },
                    'gemini-pro': { tier: '標準', description: '...' },
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
                            description: m.description || i?.description || '',
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

    /** APIエラー整形 */
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

console.log('[GeminiClient] geminiApiClient.js loaded (Constructor reads API key).');
