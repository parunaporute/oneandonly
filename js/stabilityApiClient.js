// stabilityApiClient.js
// Stability AI Platform API との通信を行うクライアントクラス

export class StabilityApiClient {
    #baseUrl = 'https://api.stability.ai/v1/generation/'; // v1 API ベースURL (モデルによって変わる可能性あり)
    #stubMode = false;
    #stubImageResponse =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='; // ダミー

    /**
     * @param {object} [options] オプション
     * @param {boolean} [options.stubMode=false] スタブモード
     */
    constructor(options = {}) {
        this.#stubMode = options.stubMode || false;
        if (this.#stubMode) console.warn('[StabilityClient] --- STUB MODE ---');
        console.log(`[StabilityClient] Initialized. Stub Mode: ${this.#stubMode}`);
    }

    /** スタブモードか */
    get isStubMode() {
        return this.#stubMode;
    }

    /**
     * Stability AI API を使用してテキストから画像を生成します。
     * @param {string} prompt 画像生成の指示を含むテキストプロンプト (★英語である必要あり)
     * @param {string} apiKey Stability AI の API キー
     * @param {object} [options={}] Stability AI API 固有のオプション
     * @param {string} [options.engineId='stable-diffusion-xl-1024-v1-0'] 使用エンジンID
     * @param {number} [options.samples=1] 生成枚数
     * @param {number} [options.width=1024] 幅
     * @param {number} [options.height=1024] 高さ
     * @param {number} [options.cfg_scale=7] 忠実度
     * @param {number} [options.steps=30] ステップ数
     * @param {string} [options.style_preset] スタイルプリセット
     * @param {string | null} [options.negative_prompt] ネガティブプロンプト
     * @returns {Promise<Array<{imageDataB64: string}>>} 生成画像のBase64データ配列
     * @throws {Error} キー/プロンプトがない場合、APIエラーの場合
     */
    async generateImage(prompt, apiKey, options = {}) {
        if (!prompt || !prompt.trim()) throw new Error('[StabilityClient] プロンプトが空です。');
        if (!apiKey) throw new Error('[StabilityClient] Stability AI APIキーがありません。');

        // --- スタブモード ---
        if (this.#stubMode) {
            console.log('[StabilityClient][Stub] Returning dummy image array.');
            await new Promise((resolve) => setTimeout(resolve, 1000));
            return Array(options.samples || 1).fill({ imageDataB64: this.#stubImageResponse });
        }

        // --- 通常モード ---
        const engineId = options.engineId || 'stable-diffusion-xl-1024-v1-0'; // 最新の推奨モデルを確認推奨
        const apiUrl = `${this.#baseUrl}${engineId}/text-to-image`;
        console.log(`[StabilityClient] POST ${apiUrl}`);
        console.log(`[StabilityClient] Prompt (EN): "${prompt.substring(0, 100)}..."`, options);

        try {
            // リクエストボディ構築
            const requestBody = {
                text_prompts: [{ text: prompt, weight: 1.0 }],
                cfg_scale: options.cfg_scale ?? 7, // ?? は nullish coalescing operator
                height: options.height ?? 1024,
                width: options.width ?? 1024,
                samples: Math.max(1, Math.min(10, options.samples || 1)),
                steps: options.steps ?? 30,
            };
            if (options.style_preset) requestBody.style_preset = options.style_preset;
            if (options.negative_prompt) {
                requestBody.text_prompts.push({ text: options.negative_prompt, weight: -1.0 });
            }
            if (options.seed != null) requestBody.seed = options.seed; // seedは0も有効なので null/undefined チェック
            if (options.sampler) requestBody.sampler = options.sampler;

            // API 呼び出し
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json', // Base64 JSON 応答を期待
                    Authorization: `Bearer ${apiKey}`, // ★ 引数で受け取ったキーを使用
                },
                body: JSON.stringify(requestBody),
            });

            const data = await response.json();

            // エラーハンドリング
            if (!response.ok) {
                console.error(`[StabilityClient Error] Status: ${response.status}`, data);
                const errorId = data?.id || 'unknown';
                const errorName = data?.name || 'API Error';
                const errorMessages = (data?.errors || ['Unknown error']).join(', ');
                // 403 Forbidden で言語エラーの可能性
                if (response.status === 403 && errorMessages.includes('language')) {
                    throw new Error(
                        `Stability AI Error (Language): ${errorMessages}. プロンプトは英語である必要があります。`
                    );
                }
                // 401 Unauthorized はキー間違い
                if (response.status === 401) {
                    throw new Error(
                        `Stability AI Error (401): APIキーが無効か認証に失敗しました。`
                    );
                }
                throw new Error(
                    `Stability AI Error (${response.status} ${errorName}/${errorId}): ${errorMessages}`
                );
            }

            console.log('[StabilityClient Response]', data);

            // レスポンスから画像データ抽出
            const generatedImages = [];
            if (data.artifacts && Array.isArray(data.artifacts)) {
                data.artifacts.forEach((artifact) => {
                    if (artifact.base64 && artifact.finishReason === 'SUCCESS') {
                        generatedImages.push({ imageDataB64: artifact.base64 });
                    } else {
                        console.warn(
                            'Artifact finishReason non-SUCCESS or missing base64:',
                            artifact.finishReason
                        );
                        // 安全フィルターにかかった場合なども考慮
                        if (artifact.finishReason === 'CONTENT_FILTERED') {
                            throw new Error(
                                '画像生成がコンテンツフィルターによりブロックされました。'
                            );
                        }
                    }
                });
            }

            if (generatedImages.length === 0) {
                console.error('No successful image artifacts found:', data);
                throw new Error('API応答に有効な画像データが含まれていませんでした。');
            }

            console.log(`[StabilityClient] Generated ${generatedImages.length} image(s).`);
            return generatedImages;
        } catch (error) {
            console.error('[StabilityClient] 画像生成API呼出エラー:', error);
            throw error;
        }
    }

    // (必要であれば、他の Stability AI API 機能用のメソッドを追加)
} // End of StabilityApiClient class

console.log('[StabilityClient] stabilityApiClient.js loaded.');
