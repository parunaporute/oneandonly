// geminiApiClient.js

/**
 * Gemini APIとの通信を行うクライアントクラス
 */
export class GeminiApiClient {
    #apiKey; // プライベートプロパティとしてAPIキーを保持
    #baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models/';
    conversationHistory = []; // 会話履歴はクラス内で管理
    #stubMode = false; // スタブモードフラグを追加
    #stubResponses = [
        // スタブモード時の応答例
        'なるほど、それであなたは市場に向かうことにしたのですね。活気ある声と香辛料の匂いが漂ってきます。何を探しますか？',
        '古いレンガ造りの図書館の扉を開けると、静寂と古い本の匂いに包まれました。どのセクションを調べますか？',
        '路地裏に入ると、不思議な雰囲気の店を見つけました。中から猫の鳴き声が聞こえます。入ってみますか？',
        '川沿いを歩いていると、吟遊詩人が物悲しい歌を歌っていました。話しかけてみますか？',
    ];

    /**
     * @param {string} apiKey Gemini APIキー
     * @param {object} [options] オプション
     * @param {boolean} [options.stubMode=false] スタブモードを有効にするか
     */
    constructor(apiKey, options = {}) {
        if (!apiKey || apiKey === 'YOUR_API_KEY') {
            // ダミーキーもチェック
            // 本番環境ではより安全な方法でキーを管理・検証してください
            console.warn('APIキーが設定されていないか、有効でない可能性があります。');
            // throw new Error('有効なAPIキーが必要です。'); // 必要に応じてエラーをスロー
        }
        this.#apiKey = apiKey;
        this.#stubMode = options.stubMode || false; // オプションからスタブモードを設定
        if (this.#stubMode) {
            console.warn('--- GeminiApiClientはスタブモードで動作しています ---');
        }
    }

    /**
     * 内部の会話履歴を初期化（クリア）する
     * @param {Array<{role: string, parts: Array<{text: string}>}>} initialHistory - オプション: 初期化時に設定する会話履歴
     */
    initializeHistory(initialHistory = []) {
        this.conversationHistory = Array.isArray(initialHistory) ? [...initialHistory] : [];
        console.log('Conversation history initialized.', this.conversationHistory);
    }

    /**
     * 現在の会話履歴を取得する
     * @returns {Array<{role: string, parts: Array<{text: string}>}>}
     */
    getHistory() {
        return [...this.conversationHistory]; // 外部から直接変更できないようにコピーを返す
    }

    /**
     * 選択されたモデルを使用して Gemini API (generateContent) を呼び出す関数
     * @param {string} prompt ユーザーからの入力プロンプト
     * @param {string} modelId 使用するモデルのID (例: 'gemini-1.5-pro-latest')
     * @returns {Promise<string>} 生成されたテキストを含むPromise
     * @throws {Error} APIエラーが発生した場合
     */
    async generateContent(prompt, modelId) {
        if (!prompt) {
            throw new Error('プロンプトが空です。');
        }

        // ユーザーの入力を会話履歴に追加 (これはスタブモードでも行う)
        this.conversationHistory.push({ role: 'user', parts: [{ text: prompt }] });

        // --- スタブモードの処理 ---
        if (this.#stubMode) {
            console.log('スタブモード: ダミー応答を返します。');
            // ランダムな応答を選択
            const stubText =
                this.#stubResponses[Math.floor(Math.random() * this.#stubResponses.length)];
            // ダミー応答も履歴に追加
            this.conversationHistory.push({ role: 'model', parts: [{ text: stubText }] });
            // 少し待機したように見せかける (任意)
            await new Promise((resolve) => setTimeout(resolve, 500));
            return stubText; // ダミー応答を返す
        }

        // --- 通常モード (API呼び出し) ---
        if (!this.#apiKey) {
            // APIキーチェックはスタブモードでない場合のみ行う
            throw new Error('APIキーが設定されていません。');
        }
        if (!modelId) {
            // モデルIDチェックも同様
            throw new Error('モデルIDが指定されていません。');
        }

        const apiUrl = `${this.#baseUrl}${modelId}:generateContent?key=${this.#apiKey}`;

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                // 会話履歴全体を送信
                body: JSON.stringify({ contents: this.conversationHistory }),
            });

            let generatedText = ''; // このスコープで宣言
            // レスポンスエラーハンドリング
            if (!response.ok) {
                let errorData = {};
                try {
                    errorData = await response.json();
                } catch (e) {
                    console.error('Failed to parse error response JSON:', e);
                }
                const detailMessage =
                    errorData?.error?.message || response.statusText || '不明なエラー';
                let errorMessage = `APIエラー (${response.status}): ${detailMessage}`;

                // より詳細なエラーメッセージの組み立て (元のコードから流用)
                if (response.status === 400) {
                    if (detailMessage.includes('prompt was blocked')) {
                        errorMessage = `APIエラー(${response.status}): プロンプトが安全設定によりブロックされました。`;
                    } else if (detailMessage.includes('User location is not supported')) {
                        errorMessage = `APIエラー(${response.status}): お住まいの地域からはこのモデルを利用できません。`;
                    } else {
                        errorMessage = `APIエラー(${response.status}): リクエスト形式が不正です。(${detailMessage})`;
                    }
                } else if (response.status === 404) {
                    errorMessage = `APIエラー(${response.status}): モデル '${modelId}' が見つからないかアクセス権がありません。(${detailMessage})`;
                } else if (response.status === 429) {
                    errorMessage = `APIエラー(${response.status}): APIレート制限を超えました。(${detailMessage})`;
                } else if (response.status >= 500) {
                    errorMessage = `APIエラー(${response.status}): Google側で一時的な問題が発生している可能性があります。(${detailMessage})`;
                }
                // エラー発生時は会話履歴から最後のユーザー入力を削除する方が自然かもしれない
                throw new Error(errorMessage);
            }

            // 正常なレスポンスの処理
            const data = await response.json();

            if (!data.candidates && data.promptFeedback?.blockReason) {
                generatedText = `コンテンツ生成がブロックされました: ${data.promptFeedback.blockReason}`;
                if (data.promptFeedback.safetyRatings) {
                    generatedText += `\n(詳細: ${JSON.stringify(
                        data.promptFeedback.safetyRatings
                    )})`;
                }
                // ブロックされた場合もモデルからの応答として履歴に追加する
                this.conversationHistory.push({ role: 'model', parts: [{ text: generatedText }] });
            } else if (data.candidates && data.candidates.length > 0) {
                const candidate = data.candidates[0];
                if (
                    !candidate.content ||
                    !candidate.content.parts ||
                    candidate.content.parts.length === 0
                ) {
                    generatedText = `応答が空でした。(終了理由: ${
                        candidate.finishReason || '不明'
                    })`;
                    console.warn('Empty response content received:', candidate);
                    // 空の応答も履歴に追加
                    this.conversationHistory.push({
                        role: 'model',
                        parts: [{ text: generatedText }],
                    });
                } else {
                    generatedText = candidate.content.parts[0].text;
                    if (candidate.finishReason && candidate.finishReason !== 'STOP') {
                        console.warn(`Generation finished with reason: ${candidate.finishReason}`);
                        generatedText += `\n\n(物語の生成が途中で終了しました: ${candidate.finishReason})`;
                    }
                    // 正常な応答を履歴に追加
                    this.conversationHistory.push({
                        role: 'model',
                        parts: [{ text: generatedText }],
                    });
                }
            } else {
                console.error('Invalid or unexpected API response structure:', data);
                // 予期しない応答の場合、履歴には追加せずエラーとする方が良いかもしれない
                throw new Error('APIから予期しない形式の応答がありました。');
            }

            return generatedText; // 生成されたテキストを返す
        } catch (error) {
            console.error('API呼び出し中にエラーが発生しました:', error);
            // エラーが発生した場合、最後に追加されたユーザー入力を履歴から削除する
            if (this.conversationHistory[this.conversationHistory.length - 1]?.role === 'user') {
                console.log('エラー発生のため、最後のユーザー入力を履歴から削除します。');
                this.conversationHistory.pop();
            }
            throw error;
        }
    }

    /**
     * 利用可能なGeminiモデルを取得する静的メソッド
     * @param {string} apiKey Gemini APIキー
     * @returns {Promise<Array<{id: string, displayName: string, description: string, tier: string | null}>>} 利用可能なモデル情報の配列
     * @throws {Error} モデルリスト取得エラーが発生した場合
     */
    static async listAvailableModels(apiKey) {
        if (!apiKey || apiKey === 'YOUR_API_KEY') {
            throw new Error(
                'APIキーが設定されていないか、有効でないためモデルリストを取得できません。'
            );
        }
        const modelsApiUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        console.log('Fetching available models from:', modelsApiUrl);

        try {
            const response = await fetch(modelsApiUrl);
            if (!response.ok) {
                let errorData = {};
                try {
                    errorData = await response.json();
                } catch (e) {
                    console.error('Failed to parse error response JSON:', e);
                }
                const detailMessage =
                    errorData?.error?.message || response.statusText || '不明なエラー';
                throw new Error(`モデルリスト取得エラー (${response.status}): ${detailMessage}`);
            }

            const data = await response.json();
            console.log('Available models data:', data);

            const availableModels = [];
            if (data.models && data.models.length > 0) {
                // --- モデルに関する補足情報 (ここにも定義するか、外部から渡せるようにしても良い) ---
                const modelInfo = {
                    'gemini-1.5-pro-latest': {
                        tier: '高性能・高機能',
                        description:
                            'Googleの最も高性能な次世代モデル。複雑なタスク、長文コンテキスト処理に優れます。',
                    },
                    'gemini-1.5-flash-latest': {
                        tier: '高速・効率的',
                        description:
                            '速度とコスト効率に優れた軽量モデル。応答速度が重要なタスクや、一般的な用途に適しています。',
                    },
                };

                data.models.forEach((model) => {
                    if (model.supportedGenerationMethods?.includes('generateContent')) {
                        const modelId = model.name.replace('models/', '');
                        if (
                            modelId.includes('vision') ||
                            modelId.includes('embedding') ||
                            modelId.includes('aqa')
                        ) {
                            console.log(
                                `Skipping non-text-generation or deprecated model: ${modelId}`
                            );
                            return;
                        }

                        const info = modelInfo[modelId];
                        const descriptionText = model.description || info?.description || '';
                        const tier = info?.tier || null;

                        availableModels.push({
                            id: modelId,
                            displayName: model.displayName || modelId,
                            description: descriptionText,
                            tier: tier,
                        });
                    }
                });
            }

            if (availableModels.length === 0) {
                console.warn("No suitable models found supporting 'generateContent'.");
                // エラーを投げる代わりに空配列を返すこともできる
                // throw new Error('利用可能な `generateContent` 対応モデルが見つかりません。');
            }

            // 必要に応じてモデルをソート（例：displayName）
            availableModels.sort((a, b) => a.displayName.localeCompare(b.displayName));

            return availableModels;
        } catch (error) {
            console.error('モデルリスト読み込み中にエラー:', error);
            throw error; // エラーを再スロー
        }
    }
}
