// stabilityApiClient.js
// Stability AI Platform API との通信を行うクライアントクラス
// ★ Constructor で localStorage から API キーを読み込む
// ★ generateImage メソッドから apiKey 引数を削除
// ★ ES Modules 形式、クラスを export
// ★ 省略なし

export class StabilityApiClient {
    #stabilityApiKey = null; // ★ プライベートプロパティでキーを保持
    #baseUrl = 'https://api.stability.ai/v1/generation/';
    #stubMode = false;
    #stubImageResponse =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    #isKeyValid = false; // ★ キーが有効そうか

    /**
     * @param {object} [options={}] オプション
     * @param {boolean} [options.stubMode=false] スタブモード
     */
    constructor(options = {}) {
        this.#stubMode = options.stubMode || false;
        if (this.#stubMode) {
            console.warn('[StabilityClient] Constructor: Initializing in STUB MODE.');
            this.#isKeyValid = true; // スタブならキー不要だが有効扱い
        } else {
            // ★ localStorage から API キーを読み込む
            try {
                const storedKey = localStorage.getItem('stabilityApiKey'); // menu.js で保存するキー名
                // ★ Stability AI キーの形式チェック (例: 'sk-' で始まるか)
                if (storedKey && storedKey.startsWith('sk-')) {
                    this.#stabilityApiKey = storedKey;
                    this.#isKeyValid = true;
                    console.log(
                        '[StabilityClient] Constructor: Stability AI Key loaded and seems valid.'
                    );
                } else {
                    this.#stabilityApiKey = null;
                    this.#isKeyValid = false;
                    if (storedKey) {
                        console.warn(
                            '[StabilityClient] Constructor: Invalid Stability AI Key found in localStorage.'
                        );
                    } else {
                        console.warn(
                            '[StabilityClient] Constructor: Stability AI Key not found in localStorage.'
                        );
                    }
                }
            } catch (e) {
                console.error(
                    '[StabilityClient] Constructor: Error accessing localStorage for API Key:',
                    e
                );
                this.#stabilityApiKey = null;
                this.#isKeyValid = false;
            }
        }
        console.log(
            `[StabilityClient] Initialized. Stub Mode: ${this.#stubMode}, Key Set: ${!!this
                .#stabilityApiKey}`
        );
    }

    /** API キーが設定されているか */
    get hasApiKey() {
        return !!this.#stabilityApiKey;
    }

    /** API呼び出しが可能か */
    get isAvailable() {
        return this.#stubMode || this.#isKeyValid;
    }

    /** スタブモードか */
    get isStubMode() {
        return this.#stubMode;
    }

    /**
     * Stability AI API を使用してテキストから画像を生成します。
     * ★ apiKey 引数を削除し、内部キーを使用
     * @param {string} prompt 画像生成の指示 (英語)
     * @param {object} [options={}] API オプション
     * @returns {Promise<Array<{imageDataB64: string}>>} 生成画像のBase64データ配列
     * @throws {Error} プロンプトがない場合、APIキーがない/無効な場合、APIエラーの場合
     */
    async generateImage(prompt, options = {}) {
        // ★ apiKey 引数を削除
        if (!prompt?.trim()) throw new Error('[StabilityClient] プロンプトが空');

        // ★ スタブモード or キー無効チェック
        if (this.#stubMode) {
            console.log('[StabilityClient][Stub] Returning dummy image array.');
            await new Promise((resolve) => setTimeout(resolve, 1000));
            return Array(options.samples || 1).fill({ imageDataB64: this.#stubImageResponse });
        }
        if (!this.isAvailable || !this.#stabilityApiKey) {
            // ★ isAvailable と内部キーでチェック
            console.error(
                '[StabilityClient] Cannot generate image: API Key is not valid or not set.'
            );
            throw new Error('Stability AI APIキーが設定されていないか無効です。');
        }

        const engineId = options.engineId || 'stable-diffusion-xl-1024-v1-0';
        const apiUrl = `${this.#baseUrl}${engineId}/text-to-image`;
        console.log(`[StabilityClient] POST ${apiUrl}`);
        console.log(`[StabilityClient] Prompt (EN): "${prompt.substring(0, 100)}..."`, options);

        try {
            // リクエストボディ (変更なし)
            const requestBody = {
                text_prompts: [{ text: prompt, weight: 1.0 }],
                cfg_scale: options.cfg_scale ?? 7,
                height: options.height ?? 1024,
                width: options.width ?? 1024,
                samples: Math.max(1, Math.min(10, options.samples || 1)),
                steps: options.steps ?? 30,
            };
            if (options.style_preset) requestBody.style_preset = options.style_preset;
            if (options.negative_prompt)
                requestBody.text_prompts.push({ text: options.negative_prompt, weight: -1.0 });
            if (options.seed != null) requestBody.seed = options.seed;
            if (options.sampler) requestBody.sampler = options.sampler;

            // API 呼び出し (★ 内部の #stabilityApiKey を使用)
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    Authorization: `Bearer ${this.#stabilityApiKey}`, // ★ 内部キー使用
                },
                body: JSON.stringify(requestBody),
            });

            const data = await response.json();

            // エラーハンドリング (変更なし)
            if (!response.ok) {
                console.error(`[StabilityClient Error] Status: ${response.status}`, data);
                const id = data?.id || '?';
                const name = data?.name || 'API Error';
                const errs = (data?.errors || ['Unknown']).join(', ');
                if (response.status === 403 && errs.includes('language'))
                    throw new Error(`Stability AI Error (Lang): ${errs}. 要英語プロンプト`);
                if (response.status === 401)
                    throw new Error(`Stability AI Error (401): APIキー無効/認証失敗`);
                throw new Error(`Stability AI Error (${response.status} ${name}/${id}): ${errs}`);
            }

            console.log('[StabilityClient Response]', data);

            // レスポンス処理 (変更なし)
            const generatedImages = [];
            if (data.artifacts?.length) {
                data.artifacts.forEach((a) => {
                    if (a.base64 && a.finishReason === 'SUCCESS')
                        generatedImages.push({ imageDataB64: a.base64 });
                    else {
                        console.warn('Artifact !SUCCESS:', a.finishReason);
                        if (a.finishReason === 'CONTENT_FILTERED')
                            throw new Error('画像生成がコンテンツフィルターによりブロック');
                    }
                });
            }
            if (generatedImages.length === 0) {
                console.error('No successful image artifacts:', data);
                throw new Error('API応答に有効な画像データなし');
            }
            console.log(`[StabilityClient] Generated ${generatedImages.length} image(s).`);
            return generatedImages;
        } catch (error) {
            console.error('[StabilityClient] 画像生成API呼出エラー:', error);
            throw error;
        }
    }
} // End of StabilityApiClient class

console.log('[StabilityClient] stabilityApiClient.js loaded (Constructor reads API key).');
