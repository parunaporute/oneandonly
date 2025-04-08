// gachaCore.js
// ------------------------------------------
// 「ガチャ処理」のロジックだけを集めたファイル (★ Gemini API 用に修正)
// ------------------------------------------

// グローバルに必要な変数 (characterData など) は
// すでに window に存在すると仮定 (indexedDB や parse等も)
// showToast もグローバルにある想定

import { GeminiApiClient } from './geminiApiClient.js';
// StabilityApiClient はこのファイルでは不要なので削除 (必要なら残す)
// import { StabilityApiClient } from './stabilityApiClient.js';

// ★ localStorage キー定数
const PREFERRED_GEMINI_MODEL_LS_KEY = 'preferredGeminiModel';
const gemini = new GeminiApiClient(); // GeminiApiClientを使用
const modelId = localStorage.getItem(PREFERRED_GEMINI_MODEL_LS_KEY) || 'gemini-1.5-flash-latest';

// --------------------------------------------------------
// 1. runGacha(cardCount, addPrompt, onlyTitle = "", onlyType = "")
//
//   - ★ 指定枚数のエレメントをGemini APIで生成し、window.characterDataに加える
//   - 生成カードは最初から group="Warehouse" として保存する
//   - 生成完了後、localStorage["latestCreatedIds"] を
//     「今回生成したIDのみに」上書き保存し、
//     画面側でそれらを表示する
// --------------------------------------------------------
export async function runGacha(cardCount, addPrompt, onlyTitle = '', onlyType = '') {
  debugger; // 開発用デバッガ
  console.log('runGacha called with Gemini API'); // --- ▼▼▼ Gemini API 呼び出しに変更 ▼▼▼ --- // ★ APIクライアントチェック

  if (!gemini) {
    console.error('[GachaCore] Gemini client instance is not available.');
    if (typeof showToast === 'function') showToast('Gemini APIクライアントが見つかりません。');
    return; // クライアントがなければ処理中断
  } // ★ APIキーチェック (isAvailableでスタブモードも考慮)
  if (!gemini.isAvailable) {
    console.warn('[GachaCore] Gemini client is not available (check API key or stub mode).');
    if (!localStorage.getItem('geminiApiKey') && typeof showToast === 'function') {
      showToast('Gemini APIキーが設定されていないか無効です。');
    } else if (gemini.isStubMode) {
      console.log('[GachaCore] Running in STUB mode.'); // スタブモード時のダミーデータ生成 (characterCreate.jsのrunGachaスタブ処理を参考に)
      try {
        const dummyResults = [];
        const types = onlyType ? [onlyType] : ['キャラクター', 'アイテム', 'モンスター'];
        const rarities = onlyTitle ? ['★?'] : pickRaritiesForNCards(cardCount); // タイトル指定時はレア度不明扱い

        for (let i = 0; i < cardCount; i++) {
          const type = types[Math.floor(Math.random() * types.length)];
          const rarity = onlyTitle ? '★?' : rarities[i] || `★${Math.floor(Math.random() * 5)}`; // タイトル指定時は不定、なければランダム
          const rarityNum = parseInt(rarity.replace('★', '').replace('?', '1'), 10) || 1; // flipped計算用

          dummyResults.push({
            id: `stub_${Date.now()}_${i}`, // スタブID
            type: type,
            name: onlyTitle || `ダミー${type}${i + 1}`,
            rarity: rarity,
            state: '通常(スタブ)',
            special: 'スタブ能力',
            caption: 'スタブモードで生成されました。' + (addPrompt ? ` (${addPrompt})` : ''),
            imageprompt: `stub ${type} ${onlyTitle || ''}`.trim(),
            backgroundcss: 'linear-gradient(to bottom right, #eee, #ccc)', // スタブ背景
            imageData: '', // 画像は別途生成
            flipped: rarityNum >= 1, // ★1以上は裏向き (★? も裏向き扱い)
            group: 'Warehouse', // 生成時は倉庫へ
          });
        }
        window.characterData.push(...dummyResults);
        await saveCharacterDataToIndexedDB(window.characterData); // indexedDB.js assumed global or imported
        localStorage.setItem('latestCreatedIds', JSON.stringify(dummyResults.map((c) => c.id)));
        await new Promise((resolve) => setTimeout(resolve, 500)); // 擬似待機
        if (typeof showToast === 'function') showToast(`${cardCount}件のダミーデータを生成しました。`);
      } catch (stubError) {
        console.error('[GachaCore] Stub data generation failed:', stubError);
        if (typeof showToast === 'function') showToast('スタブデータ生成に失敗しました。');
      }
      return; // スタブ処理完了
    } else {
      // APIキーなし (スタブでもない)
      return;
    }
  } // AbortController は GeminiApiClient が未対応のため削除 // --- プロンプト生成 (Gemini向けに結合 + JSON出力指示) ---

  // window.currentGachaController = new AbortController();
  // const signal = window.currentGachaController.signal;

  let prompt = '';
  if (onlyTitle) {
    // タイトル指定がある場合
    prompt = `あなたはTRPG用のキャラクター、装備品、モンスター作成のエキスパートです。
以下のキャラクター、アイテム、モンスターのいずれか一つを生成してください。

指定された名前: ${onlyTitle}
指定されたタイプ: ${onlyType}
追加の指示: ${addPrompt || '(特になし)'}

生成する要素について、以下のJSON形式で**単一のオブジェクト**として出力してください。レア度は名前から推測して★0～★5で設定してください。

{
 "type": "${onlyType}",
 "name": "${onlyTitle}",
 "rarity": "★(名前から推測した0～5)",
 "state": "キャラクターやモンスターの状態 (例: 傷ついている、怒っている。アイテムなら空文字)",
 "special": "特技や特殊能力、効果など (日本語、簡潔に)",
 "caption": "フレーバーテキストや短い説明文 (日本語)",
 "imageprompt": "画像生成用の英語キーワード (例: anime style, male swordsman, red hair)",
 "backgroundcss": "CSSのbackground-image値 (例: linear-gradient(to right, red, blue))"
}

制約:
- 出力はJSONオブジェクトのみとし、他のテキストは含めないでください。
- 各フィールドの値は必ず文字列としてください。
- NGワード: ゴブリン

JSONオブジェクト出力:`;
  } else {
    // 通常の複数枚生成
    const rarities = pickRaritiesForNCards(cardCount);
    const countMap = makeRarityCountMap(rarities);

    prompt = `あなたはTRPG用のキャラクター、装備品、モンスター作成のエキスパートです。
以下の条件に基づいて、キャラクター、アイテム、モンスターを合計${cardCount}個、ランダムな組み合わせで生成してください。

条件:
${addPrompt || '(指定なし)'}

生成する各要素について、以下のJSON形式のオブジェクトを作成し、それらを要素とする**JSON配列**として出力してください。

{
  "type": "キャラクター or アイテム or モンスター",
  "name": "名前 (日本語)",
  "rarity": "★(指定されたレア度)",
  "state": "キャラクターやモンスターの状態 (例: 傷ついている、怒っている。アイテムなら空文字)",
  "special": "特技や特殊能力、効果など (日本語、簡潔に)",
  "caption": "フレーバーテキストや短い説明文 (日本語)",
  "imageprompt": "画像生成用の英語キーワード (例: anime style, male swordsman, red hair)",
  "backgroundcss": "CSSのbackground-image値 (例: linear-gradient(to right, red, blue))"
}

レア度内訳 (厳密に守ってください):
  - ★0: ${countMap['★0']}件
  - ★1: ${countMap['★1']}件
  - ★2: ${countMap['★2']}件
  - ★3: ${countMap['★3']}件
  - ★4: ${countMap['★4']}件
  - ★5: ${countMap['★5']}件

制約:
- 合計で正確に${cardCount}個生成してください。
- typeの割合はランダムにしてください。
- 出力はJSON配列の形式のみとし、他のテキストは含めないでください。
- 各フィールドの値は必ず文字列としてください。
- NGワード: ゴブリン

JSON配列出力:`;
  }

  try {
    console.log('[GachaCore] Sending prompt to Gemini:', prompt.substring(0, 200) + '...'); // プロンプト冒頭ログ
    gemini.initializeHistory([]); // 履歴リセット
    const responseText = await gemini.generateContent(prompt, modelId);
    console.log('[GachaCore] Raw response from Gemini:', responseText); // ★ 生成結果をパース (JSONを期待)

    // AbortController関連削除
    // if (signal.aborted) { return; }

    const newCards = parseCharacterData(responseText, onlyTitle); // onlyTitleを渡して処理を分岐

    if (!Array.isArray(newCards) || newCards.length === 0) {
      throw new Error('APIからの応答が空か、期待した形式ではありませんでした。');
    } // ガチャ箱は廃止 → 生成後は group="Warehouse" に (parseCharacterData内で設定済みに変更)

    // newCards.forEach(card => { card.group = "Warehouse"; }); // 不要に

    // 既存 characterData に追加 (window.characterData が存在すると仮定)
    if (window.characterData && Array.isArray(window.characterData)) {
      window.characterData.push(...newCards);
    } else {
      console.warn('[GachaCore] window.characterData is not available or not an array. Skipping push.');
      // 必要ならここで初期化するなどのフォールバック
      // window.characterData = [...newCards];
    } // IndexedDB に保存 (saveCharacterDataToIndexedDB が存在すると仮定)

    if (typeof saveCharacterDataToIndexedDB === 'function') {
      await saveCharacterDataToIndexedDB(window.characterData || newCards); // characterData がなければ newCards のみ保存
    } else {
      console.warn('[GachaCore] saveCharacterDataToIndexedDB function is not available. Skipping DB save.');
    } // localStorage["latestCreatedIds"] を // 「今回生成したIDのみに」上書き (＝以前のIDはクリア)

    const newIds = newCards.map((c) => c.id);
    localStorage.setItem('latestCreatedIds', JSON.stringify(newIds));
    console.log('[GachaCore] 【最新生成IDsを上書き】:', newIds);
  } catch (err) {
    // AbortController関連削除
    // if (err.name === "AbortError") { console.log("runGachaキャンセル"); }
    console.error('[GachaCore] runGacha失敗:', err);
    if (typeof showToast === 'function') showToast('エレメント生成に失敗しました:\n' + err.message);
    // alert はユーザー体験として良くない場合があるので showToast に統一 (必要なら alert 残す)
    // alert("エレメント生成に失敗しました:\n" + err.message);
  } finally {
    // AbortController関連削除
    // window.currentGachaController = null; // 完了またはエラー時にクリア
  } // --- ▲▲▲ Gemini API 呼び出しに変更 ▲▲▲ ---
}

// --------------------------------------------------------
// 2. parseCharacterData( jsonString, isSingleObject = false )
//    - ★ GeminiレスポンスからJSON部分を抽出して解析するように修正
// --------------------------------------------------------
function parseCharacterData(jsonString, isSingleObject = false) {
  console.log('[GachaCore] Parsing response:', jsonString);
  let parsedData = [];
  try {
    // --- ▼▼▼ JSON抽出ロジックを修正 ▼▼▼ ---
    // ```json ... ``` マークダウンを除去 (存在する場合)
    const cleanedString = jsonString.replace(/^```json\s*|```$/g, '').trim();

    // 文字列の中から JSON 配列 [...] または JSON オブジェクト {...} を正規表現で探す
    const jsonMatch = cleanedString.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);

    if (jsonMatch && jsonMatch[0]) {
      const potentialJson = jsonMatch[0];
      console.log('[GachaCore] Extracted JSON string:', potentialJson); // 抽出したJSON文字列をログ出力
      parsedData = JSON.parse(potentialJson);

      // isSingleObject フラグに基づいて期待する型をチェック
      if (isSingleObject) {
        if (Array.isArray(parsedData)) {
          console.warn('[GachaCore] Expected a single object but found an array. Using the first element if possible.');
          // 配列で返ってきたが、中身が1つのオブジェクトならそれを使う試み
          if (parsedData.length === 1 && typeof parsedData[0] === 'object') {
            parsedData = [parsedData[0]]; // 最初の要素を配列に入れる
          } else {
            throw new Error('単一オブジェクトを期待しましたが、配列が見つかりました。');
          }
        } else if (typeof parsedData === 'object' && parsedData !== null) {
          // 期待通り単一オブジェクトの場合、配列に入れる
          parsedData = [parsedData];
        } else {
          throw new Error('抽出されたデータが有効なオブジェクトではありませんでした。');
        }
      } else {
        // isSingleObject が false の場合 (配列を期待)
        if (!Array.isArray(parsedData)) {
          // オブジェクトで返ってきたが、中身を配列にする試みは難しいのでエラーとする
          console.warn('[GachaCore] Expected an array but found a single object.');
          throw new Error('配列を期待しましたが、単一オブジェクトが見つかりました。');
        }
      }
    } else {
      console.error('[GachaCore] No valid JSON array or object found in the response string:', cleanedString);
      throw new Error('応答から有効なJSONデータが見つかりませんでした。');
    }
    // --- ▲▲▲ JSON抽出ロジックを修正 ▲▲▲ ---
  } catch (e) {
    console.error('[GachaCore] Failed to parse JSON response:', e);
    // 元の（クリーンアップ前の）文字列もログ出力しておくとデバッグに役立つ
    console.error('[GachaCore] Original received string:', jsonString);
    throw new Error(`API応答の形式が不正です: ${e.message}`);
  }

  // --- ▼▼▼ パース後の処理 (変更なし) ▼▼▼ ---
  const characters = parsedData
    .map((item, index) => {
      // 基本的な検証
      if (!item || typeof item !== 'object') {
        console.warn(`[GachaCore] Invalid item found in parsed data at index ${index}. Skipping.`);
        return null; // 不正なデータはスキップ
      }
      const rarity = item.rarity || '★?';
      const rarityNum = parseInt(rarity.replace('★', '').replace('?', '1'), 10) || 1;

      return {
        id: `card_${Date.now()}_${Math.random().toString(36).substring(2)}_${index}`,
        type: item.type || '不明',
        name: item.name || '(名称未設定)',
        state: item.state || '',
        special: item.special || '',
        caption: item.caption || '',
        rarity: rarity,
        backgroundcss: item.backgroundcss || '',
        imageprompt: item.imageprompt || '',
        group: 'Warehouse',
        flipped: rarityNum >= 1,
        imageData: '',
        rotationAngle: 0,
      };
    })
    .filter((item) => item !== null);
  // --- ▲▲▲ パース後の処理 (変更なし) ▲▲▲ ---

  console.log(`[GachaCore] Parsed ${characters.length} cards successfully.`);
  return characters;
}

// --------------------------------------------------------
// 3. pickRaritiesForNCards( n ), makeRarityCountMap( rarities )
//    (変更なし)
// --------------------------------------------------------
function pickRaritiesForNCards(n) {
  const rarityDist = [
    { star: '★0', probability: 0.5 }, // ★0を追加 (Geminiプロンプトに合わせて)
    { star: '★1', probability: 0.2 },
    { star: '★2', probability: 0.15 },
    { star: '★3', probability: 0.1 },
    { star: '★4', probability: 0.045 },
    { star: '★5', probability: 0.005 },
  ];
  const results = [];
  for (let i = 0; i < n; i++) {
    const rand = Math.random();
    let cum = 0;
    for (const r of rarityDist) {
      cum += r.probability;
      if (rand <= cum) {
        results.push(r.star);
        break;
      }
    }
    // フォールバック: もし確率の合計が1未満などでループを抜けた場合
    if (results.length <= i) results.push('★0');
  }
  return results;
}

function makeRarityCountMap(rarities) {
  const counts = { '★0': 0, '★1': 0, '★2': 0, '★3': 0, '★4': 0, '★5': 0 };
  rarities.forEach((r) => {
    if (counts.hasOwnProperty(r)) {
      // 定義されたレアリティのみカウント
      counts[r] = (counts[r] || 0) + 1;
    } else {
      console.warn(`[GachaCore] Unknown rarity found: ${r}`);
    }
  });
  return counts;
}

// -----------------------------------
// グローバルスコープへの登録 (必要に応じて)
if (typeof window !== 'undefined') {
  window.runGacha = runGacha;
}
// -----------------------------------

console.log('[GachaCore] gachaCore.js loaded (Using Gemini API)');
