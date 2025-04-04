// menu.js
// ★ チェックボックスの状態保存機能を追加
// ★ イベントリスナーの重複登録防止チェックを削除
// ★ 省略なし

// --- モジュールインポート ---
import { GeminiApiClient } from "./geminiApiClient.js";
import { StabilityApiClient } from "./stabilityApiClient.js";
import {
  initIndexedDB,
  listAllScenarios,
  loadCharacterDataFromIndexedDB,
  getScenarioById,
  updateScenario,
  deleteScenarioById,
  saveCharacterDataToIndexedDB, // DB関数
} from "./indexedDB.js";
import { showToast } from "./common.js";
import { open as multiModalOpen } from "./multiModal.js";
import { initAvatar } from "./avatar.js";
import { initBackground, onChangeBgButtonClick } from "./background.js";
import { showWarehouseModal } from "./warehouse.js";
import { openSaveLoadModal } from "./universalSaveLoad.js";

// --- グローバル変数・状態 ---
window.cachedScenarios = [];
window.geminiApiKey = "";
window.stabilityApiKey = "";
window.geminiClient = null;
window.stabilityClient = null;
window.characterData = [];
let isLoadingModels = false; // Geminiモデルリスト読み込み中

// --- DOM要素 ---
let modelSelectElement,
  modelDescriptionElement,
  updateModelsButton,
  setApiKeyButton;
let stopBgmButton,
  bgmAudio,
  scenarioListContainer,
  noScenariosMessage,
  showHiddenCheckbox;
let saveLoadButton,
  changeBgButton,
  clearCharBtn,
  showWhBtn,
  charCreateBtn,
  partyListBtn;
let newScenBtn, customScenBtn, bookshelfBtn, tutorialBtn;
let accordionHeader, accordionContent;

// --- localStorage キー ---
const SHOW_HIDDEN_CHECKBOX_KEY = "showHiddenScenariosChecked";

// --- BGM 関連 ---

/** BGM フェードイン再生 */
function fadeInPlay(audio) {
  if (!audio) {
    console.warn("[Menu] Audio element not provided for fadeInPlay.");
    return;
  }
  audio.volume = 0;
  audio
    .play()
    .then(() => {
      console.log("[Menu] BGM playback started.");
      document.removeEventListener("click", handleUserGestureForBGM);
      let currentVolume = 0;
      const fadeInterval = 100;
      const fadeStep = 0.05;
      const targetVolume = 0.5; // 低めの目標音量
      const intervalId = setInterval(() => {
        currentVolume += fadeStep;
        if (currentVolume >= targetVolume) {
          audio.volume = targetVolume;
          clearInterval(intervalId);
          console.log("[Menu] BGM fade-in complete.");
        } else {
          audio.volume = currentVolume;
        }
      }, fadeInterval);
    })
    .catch((err) => {
      console.warn("[Menu] BGM playback failed or blocked:", err);
      document.removeEventListener("click", handleUserGestureForBGM);
      document.addEventListener("click", handleUserGestureForBGM, {
        once: true,
      });
    });
}

/** BGM再生のためのユーザー操作ハンドラ */
function handleUserGestureForBGM() {
  console.log("[Menu] User gesture detected for BGM playback.");
  const currentBgmAudio = document.getElementById("bgm");
  if (
    currentBgmAudio &&
    currentBgmAudio.paused &&
    localStorage.getItem("bgmStopped") !== "true"
  ) {
    fadeInPlay(currentBgmAudio);
  }
  document.removeEventListener("click", handleUserGestureForBGM);
}

/** BGMボタンの表示/アイコンを更新 */
function updateBgmButtonStatus(isStopped) {
  if (!stopBgmButton) {
    console.warn("[Menu] Stop BGM button not found for status update.");
    return;
  }
  if (isStopped) {
    stopBgmButton.innerHTML = `<div class="iconmoon icon-volume-mute2"></div>`;
    stopBgmButton.style.backgroundColor = "rgb(255,115,68)";
    stopBgmButton.title = "BGMを再生";
  } else {
    stopBgmButton.innerHTML = `<div class="iconmoon icon-volume-high"></div>`;
    stopBgmButton.style.backgroundColor = "#4caf50";
    stopBgmButton.title = "BGMを停止";
  }
}

// --- 初期化処理 ---

window.addEventListener("DOMContentLoaded", async () => {
  console.log("[Menu] DOMContentLoaded event fired.");
  // --- DOM要素取得 ---
  modelSelectElement = document.getElementById("model-select");
  modelDescriptionElement = document.getElementById("model-description");
  updateModelsButton = document.getElementById("update-models-button");
  setApiKeyButton = document.getElementById("set-api-key-button");
  stopBgmButton = document.getElementById("stop-bgm-button");
  bgmAudio = document.getElementById("bgm");
  scenarioListContainer = document.getElementById("scenario-list-container");
  noScenariosMessage = document.getElementById("no-scenarios-message");
  showHiddenCheckbox = document.getElementById("show-hidden-scenarios");
  saveLoadButton = document.getElementById("save-load-button");
  changeBgButton = document.getElementById("change-bg-button");
  clearCharBtn = document.getElementById("clear-character-btn");
  showWhBtn = document.getElementById("show-warehouse-btn");
  charCreateBtn = document.getElementById("character-create");
  partyListBtn = document.getElementById("party-list");
  newScenBtn = document.getElementById("start-new-scenario-button");
  customScenBtn = document.getElementById("start-custom-scenario-button");
  bookshelfBtn = document.getElementById("show-bookshelf-btn");
  tutorialBtn = document.getElementById("open-tutorial-list-button");
  accordionHeader = document.getElementById("ongoing-scenarios-header");
  accordionContent = document.getElementById("ongoing-scenarios-content");

  // --- BGM初期化 ---
  if (bgmAudio && stopBgmButton) {
    const isBgmStopped = localStorage.getItem("bgmStopped") === "true";
    updateBgmButtonStatus(isBgmStopped);
    if (!isBgmStopped) {
      document.addEventListener("click", handleUserGestureForBGM, {
        once: true,
      });
      setTimeout(() => fadeInPlay(bgmAudio), 100);
    }
    // BGM停止/再生ボタンのイベントリスナー
    stopBgmButton.addEventListener("click", () => {
      // 重複防止削除
      if (!bgmAudio) return;
      const currentlyStopped = bgmAudio.paused || bgmAudio.volume === 0;
      if (currentlyStopped) {
        fadeInPlay(bgmAudio);
        localStorage.setItem("bgmStopped", "false");
        updateBgmButtonStatus(false);
      } else {
        let currentVolume = bgmAudio.volume;
        const intervalId = setInterval(() => {
          currentVolume -= 0.1;
          if (currentVolume <= 0) {
            clearInterval(intervalId);
            bgmAudio.pause();
            bgmAudio.currentTime = 0;
            bgmAudio.volume = 0;
          } else {
            bgmAudio.volume = currentVolume;
          }
        }, 50);
        localStorage.setItem("bgmStopped", "true");
        updateBgmButtonStatus(true);
      }
    });
    // stopBgmButton.setAttribute('data-bgm-listener-added', 'true'); // 削除
  } else {
    console.warn("BGM elements not found.");
  }

  // --- IndexedDB と APIクライアント初期化 ---
  try {
    console.log("Initializing DB...");
    await initIndexedDB();
    console.log("DB initialized.");
    window.geminiApiKey = localStorage.getItem("geminiApiKey") || "";
    window.stabilityApiKey = localStorage.getItem("stabilityApiKey") || "";
    console.log(
      `Keys - G: ${window.geminiApiKey ? "Set" : "No"}, S: ${
        window.stabilityApiKey ? "Set" : "No"
      }`
    );
    if (window.geminiApiKey) initializeGeminiClient();
    else {
      console.log("Gemini Key not set.");
      updateApiKeyButtonStatus();
      if (modelSelectElement)
        modelSelectElement.innerHTML = "<option>Geminiキー未設定</option>";
      if (updateModelsButton) updateModelsButton.disabled = true;
    }
    initializeStabilityClient();
    console.log("Initializing modules...");
    if (typeof initAvatar === "function") initAvatar();
    else console.warn("initAvatar not found");
    if (typeof initBackground === "function") await initBackground("index");
    else console.warn("initBackground not found");

    // ★★★ initMenuPage はここで一度だけ呼び出す ★★★
    await initMenuPage();

    console.log("Page initialization complete.");
  } catch (e) {
    console.error("Initialization error:", e);
    showToast(`初期化エラー: ${e.message}`);
    disableCoreFeaturesOnError();
  }
}); // End of DOMContentLoaded

/** Gemini API クライアント初期化 */
function initializeGeminiClient() {
  if (!window.geminiApiKey) {
    console.warn("Cannot init Gemini: No Key.");
    window.geminiClient = null;
    return;
  }
  try {
    window.geminiClient = new GeminiApiClient(window.geminiApiKey, {
      stubMode: false,
    }); // import
    console.log("GeminiClient initialized.");
  } catch (clientError) {
    console.error("GeminiClient init failed:", clientError);
    window.geminiClient = null;
    showToast(`APIクライアント初期化エラー: ${clientError.message}`); // import
    if (modelSelectElement)
      modelSelectElement.innerHTML = "<option>クライアントエラー</option>";
    if (updateModelsButton) updateModelsButton.disabled = true;
  }
}
/** Stability AI クライアント初期化 */
function initializeStabilityClient() {
  try {
    const stub = window.geminiClient?.isStubMode || false; // Geminiのスタブ状態に合わせる
    window.stabilityClient = new StabilityApiClient({ stubMode: stub }); // import
    console.log("StabilityClient initialized.");
  } catch (e) {
    console.error("StabilityClient init failed:", e);
    window.stabilityClient = null;
    showToast(`画像クライアント初期化エラー: ${e.message}`); // import
  }
}
/** エラー時機能無効化 */
function disableCoreFeaturesOnError() {
  console.error("Disabling features due to error.");
  const btns = document.querySelectorAll(
    ".application-bar button, .container button, .container select"
  );
  btns.forEach((el) => {
    const keep = ["set-api-key-button", "open-tutorial-list-button"];
    if (!keep.includes(el.id)) {
      el.disabled = true;
      el.style.opacity = "0.5";
      el.style.cursor = "not-allowed";
    }
  });
  if (modelSelectElement)
    modelSelectElement.innerHTML = "<option>初期化エラー</option>";
  console.error("Core features disabled.");
}

/** initMenuPage: メインページのコンテンツ初期化 (★ チェックボックス状態復元) */
async function initMenuPage() {
  console.log("Initializing menu page content...");
  updateApiKeyButtonStatus();

  // DBデータ読み込み
  try {
    const scenarios = await listAllScenarios();
    window.cachedScenarios = scenarios;
    console.log(`Loaded ${scenarios.length} scenarios.`);
  } catch (e) {
    console.error("Scenario list load failed:", e);
    showToast("シナリオ一覧読込失敗");
    window.cachedScenarios = [];
  }
  try {
    const chars = await loadCharacterDataFromIndexedDB();
    window.characterData = chars || [];
    console.log(`Loaded ${window.characterData.length} chars.`);
  } catch (e) {
    console.error("Char data load failed:", e);
    window.characterData = [];
  }

  // ★ チェックボックス状態復元
  let showHiddenInitialState = false;
  if (showHiddenCheckbox) {
    try {
      const savedState = localStorage.getItem(SHOW_HIDDEN_CHECKBOX_KEY);
      showHiddenInitialState = savedState === "true";
      showHiddenCheckbox.checked = showHiddenInitialState; // 状態反映
      console.log(
        `Restored showHidden checkbox state: ${showHiddenInitialState}`
      );
    } catch (e) {
      console.error("Failed load checkbox state:", e);
      showHiddenInitialState = false;
    }
  }

  // シナリオ一覧表示 (復元状態で)
  if (showHiddenCheckbox && scenarioListContainer && noScenariosMessage) {
    applyScenarioFilter(showHiddenInitialState); // ★ 復元状態を渡す
  } else {
    console.warn("Scenario list elements missing.");
  }

  initAccordion(); // アコーディオン初期化
  setupMenuButtons(); // ★ ボタンイベント設定 (リスナーはここで一度だけ設定される想定)

  // Geminiモデルリスト読み込み
  if (window.geminiClient && window.geminiApiKey) {
    console.log("Attempting load Gemini models...");
    await loadAvailableModels();
  } else {
    if (modelSelectElement)
      modelSelectElement.innerHTML = !window.geminiApiKey
        ? "<option>Gキー未設定</option>"
        : "<option>クライアントエラー</option>";
    if (updateModelsButton) updateModelsButton.disabled = true;
    if (modelDescriptionElement) modelDescriptionElement.textContent = "";
  }
  setupModelSelectorEvents(); // モデルセレクターイベント
  console.log("Menu page content initialized.");
}

/** APIキーボタンの状態を更新 */
function updateApiKeyButtonStatus() {
  if (!setApiKeyButton) return;
  if (window.geminiApiKey) {
    let txt = `<span class="iconmoon icon-key"></span> 設定済`;
    if (!window.stabilityApiKey) txt += ` (画像未)`;
    setApiKeyButton.innerHTML = txt;
    setApiKeyButton.title = `G:${window.geminiApiKey.substring(0, 4)}...\nS:${
      window.stabilityApiKey
        ? `${window.stabilityApiKey.substring(0, 4)}...`
        : "未設定"
    }`;
  } else {
    setApiKeyButton.textContent = "APIキー設定";
    setApiKeyButton.title = "APIキー設定";
  }
}

/** メニュー内のボタン等のイベント設定 (★ リスナー重複防止削除、チェックボックスリスナー修正) */
function setupMenuButtons() {
  console.log("Setting up menu buttons (Force listener registration)...");

  // ★ 各要素へのリスナー登録 (hasAttribute チェックを削除)
  setApiKeyButton?.addEventListener("click", openApiKeysModal);
  clearCharBtn?.addEventListener("click", async () => {
    multiModalOpen({
      title: "全エレメントクリア確認",
      contentHtml: "<p>生成物全削除？</p>",
      okLabel: "削除",
      okButtonColor: "#f44336",
      cancelLabel: "キャンセル",
      onOk: async () => {
        window.characterData = [];
        try {
          await saveCharacterDataToIndexedDB([]);
          console.log("Cleared char data.");
          showToast("全エレメント削除完了");
        } catch (e) {
          console.error("Clear failed:", e);
          showToast("削除失敗");
        } // import
      },
    });
  });
  showWhBtn?.addEventListener("click", () => {
    if (typeof showWarehouseModal === "function") showWarehouseModal("menu");
    else console.error("showWhModal not found.");
  }); // import
  charCreateBtn?.addEventListener("click", () => {
    window.location.href = "characterCreate.html";
  });
  partyListBtn?.addEventListener("click", () => {
    window.location.href = "partyList.html";
  });
  newScenBtn?.addEventListener("click", () => {
    window.location.href = "scenarioWizard.html";
  });
  customScenBtn?.addEventListener("click", () => {
    window.location.href = "customScenario.html";
  });
  bookshelfBtn?.addEventListener("click", () => {
    window.location.href = "bookshelf.html";
  });
  tutorialBtn?.addEventListener("click", () => {
    window.location.href = "tutorialList.html";
  });
  saveLoadButton?.addEventListener("click", openSaveLoadModal); // import
  changeBgButton?.addEventListener("click", onChangeBgButtonClick); // import

  // --- ▼▼▼ 非表示チェックボックスのイベントリスナー設定 (hasAttribute チェック削除) ▼▼▼ ---
  const showHiddenCheckbox = document.getElementById("show-hidden-scenarios");
  console.log("ここは１回だけ？");
  if (clearCharBtn && !clearCharBtn.hasAttribute("data-listener-added")) {
      console.log("ここは１回だけ？");

  }

  if (showHiddenCheckbox) {
    console.log("[Menu Debug] Found checkbox, adding listeners (force).");
    // click イベント (伝播停止)
    showHiddenCheckbox.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    // change イベント (状態保存とリスト更新)
    showHiddenCheckbox.addEventListener("change", () => {
      console.log("[Menu Debug] Show hidden checkbox changed!"); // ★ ログ確認用
      const isChecked = showHiddenCheckbox.checked;
      console.log(`[Menu] Checkbox state is now: ${isChecked}`);
      try {
        // ★ localStorage に状態を保存
        localStorage.setItem(SHOW_HIDDEN_CHECKBOX_KEY, String(isChecked));
        console.log(`[Menu] Saved state (${isChecked}) to localStorage.`);
      } catch (e) {
        console.error("Failed to save checkbox state:", e);
        showToast("状態保存失敗"); // import
      }
      applyScenarioFilter(isChecked); // フィルタ適用
    });
    console.log("[Menu] Show hidden checkbox listeners added (force).");
  } else {
    console.warn("Show hidden checkbox (#show-hidden-scenarios) not found.");
  }
  // --- ▲▲▲ 非表示チェックボックスのイベントリスナー設定 ▲▲▲ ---

  console.log("Menu buttons setup complete.");
}

/** APIキー設定モーダルを開く (Gemini & Stability AI) */
function openApiKeysModal() {
  // (中身は変更なし - 省略せず記述)
  console.log("Opening API Keys modal...");
  let tempG = window.geminiApiKey || "";
  let tempS = window.stabilityApiKey || "";
  multiModalOpen({
    id: "api-keys-modal",
    title: "APIキー設定",
    contentHtml: `<p style="font-size: 0.9em; margin-bottom: 15px;">各サービスのサイトで取得したAPIキーを入力・保存してください。</p><div style="margin-bottom: 20px;"><label for="temp-gemini-api-key-input" style="display: block; margin-bottom: 5px;"><b>Gemini API Key (テキスト生成用):</b></label><input type="password" id="temp-gemini-api-key-input" placeholder="Google AI Studio 等で取得 (AIza...)" style="width:100%; padding:8px; background-color: #555; color: #fff; border: 1px solid #777;" value="${DOMPurify.sanitize(
      tempG
    )}"/><a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" style="font-size: 0.8em; color: #aef;">Gemini キー取得はこちら</a></div><div style="margin-bottom: 10px;"><label for="temp-stability-api-key-input" style="display: block; margin-bottom: 5px;"><b>Stability AI API Key (画像生成用):</b></label><input type="password" id="temp-stability-api-key-input" placeholder="Stability AI Platform で取得 (sk-...)" style="width:100%; padding:8px; background-color: #555; color: #fff; border: 1px solid #777;" value="${DOMPurify.sanitize(
      tempS
    )}"/><a href="https://platform.stability.ai/account/keys" target="_blank" rel="noopener noreferrer" style="font-size: 0.8em; color: #aef;">Stability AI キー取得はこちら</a></div>`,
    appearanceType: "center",
    showCloseButton: true,
    closeOnOutsideClick: true,
    additionalButtons: [
      {
        label: "両方のキーをクリア",
        onClick: (modal) => {
          multiModalOpen({
            title: "クリア確認",
            contentHtml: "<p>両方のAPIキー削除？</p>",
            okLabel: "削除",
            okButtonColor: "#dc3545",
            cancelLabel: "キャンセル",
            onOk: () => {
              localStorage.removeItem("geminiApiKey");
              localStorage.removeItem("stabilityApiKey");
              window.geminiApiKey = "";
              window.stabilityApiKey = "";
              window.geminiClient = null;
              window.stabilityClient = null;
              updateApiKeyButtonStatus();
              if (modelSelectElement)
                modelSelectElement.innerHTML = "<option>Gキー未設定</option>";
              if (updateModelsButton) updateModelsButton.disabled = true;
              disableChatUI(true, "Keys cleared");
              showToast("両キー削除");
              if (modal) modal.close();
            },
          });
        },
      },
    ],
    cancelLabel: "閉じる",
    okLabel: "保存",
    onOk: async () => {
      const gIn = document.getElementById("temp-gemini-api-key-input");
      const sIn = document.getElementById("temp-stability-api-key-input");
      if (!gIn || !sIn) return false;
      const newG = gIn.value.trim();
      const newS = sIn.value.trim();
      let gCh = false,
        sCh = false;
      if (newG !== window.geminiApiKey) {
        gCh = true;
        window.geminiApiKey = newG;
        if (newG) {
          localStorage.setItem("geminiApiKey", newG);
          console.log("Gemini Key updated.");
          initializeGeminiClient();
          if (window.geminiClient) await loadAvailableModels(true);
          else {
            showToast("Gクライアント初期化失敗");
            disableChatUI(true, "Client fail");
          }
        } else {
          localStorage.removeItem("geminiApiKey");
          window.geminiClient = null;
          console.log("Gemini Key cleared.");
          if (modelSelectElement)
            modelSelectElement.innerHTML = "<option>Gキー未設定</option>";
          disableChatUI(true, "Gemini cleared");
        }
      }
      if (newS !== window.stabilityApiKey) {
        sCh = true;
        window.stabilityApiKey = newS;
        if (newS) {
          localStorage.setItem("stabilityApiKey", newS);
          console.log(`Stability Key updated.`);
          initializeStabilityClient();
        } else {
          localStorage.removeItem("stabilityApiKey");
          console.log(`Stability Key cleared.`);
        }
      }
      updateApiKeyButtonStatus();
      if (gCh || sCh) showToast("APIキー更新");
      else showToast("変更なし");
    },
    onOpen: () => {
      console.log("API Keys modal opened.");
    },
  });
}

/** モデルセレクター関連イベント設定 */
function setupModelSelectorEvents() {
  // (中身は変更なし - 省略せず記述)
  if (modelSelectElement) {
    modelSelectElement.addEventListener("change", updateModelDescription);
    console.log("Model select listener added.");
  }
  if (updateModelsButton) {
    updateModelsButton.addEventListener("click", () => {
      if (!isLoadingModels) {
        console.log("Update models clicked.");
        loadAvailableModels(true);
      } else {
        showToast("モデルリスト読込中");
      }
    });
    console.log("Update models listener added.");
  }
}
/** 利用可能モデル取得＆表示 (Gemini Text用) */
async function loadAvailableModels(forceUpdate = false) {
  // (中身は変更なし - 省略せず記述)
  if (isLoadingModels) {
    console.log("Models loading.");
    return;
  }
  if (!modelSelectElement || !updateModelsButton || !window.geminiClient) {
    console.error("Cannot load models.");
    return;
  }
  console.log(`Loading models (Force: ${forceUpdate})...`);
  isLoadingModels = true;
  disableChatUI(true, "Loading models");
  modelSelectElement.innerHTML = '<option value="">読込中...</option>';
  if (modelDescriptionElement) modelDescriptionElement.textContent = "";
  let models = null;
  /* Cache skipped */ if (models === null) {
    if (!window.geminiClient.isStubMode) {
      try {
        console.log("Fetching models from API...");
        models = await GeminiApiClient.listAvailableModels(window.geminiApiKey);
        console.log(`Workspaceed ${models?.length || 0}.`);
      } catch (e) {
        console.error("Model fetch error:", e);
        showToast(`モデル取得エラー: ${e.message}`);
        models = null;
      }
    } else {
      models = [
        { id: "stub-pro", displayName: "Stub Pro", desc: "", tier: "" },
      ];
      console.log("Using stub models.");
    }
  }
  modelSelectElement.innerHTML = "";
  if (models?.length) {
    const pref =
      localStorage.getItem("preferredGeminiModel") || "gemini-1.5-flash-latest";
    models.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = m.tier ? `${m.displayName} (${m.tier})` : m.displayName;
      opt.dataset.description = m.description || "";
      if (m.id === pref) opt.selected = true;
      modelSelectElement.appendChild(opt);
    });
    updateModelDescription();
  } else {
    modelSelectElement.innerHTML = '<option value="">利用不可</option>';
    if (modelDescriptionElement) modelDescriptionElement.textContent = "";
    if (!window.geminiApiKey) showToast("Geminiキー未設定");
    else if (!models) {
    } else showToast("利用可能テキストモデルなし");
  }
  isLoadingModels = false;
  const enable = !!window.geminiApiKey && models?.length > 0;
  disableChatUI(!enable, enable ? "Models loaded" : "Failed load");
  console.log(`Model loading finished. UI Enabled: ${enable}`);
}
/** 選択モデルの説明表示 */
function updateModelDescription() {
  // (中身は変更なし - 省略せず記述)
  if (!modelSelectElement || !modelDescriptionElement) return;
  const opt = modelSelectElement.options[modelSelectElement.selectedIndex];
  if (!opt || !opt.value) {
    modelDescriptionElement.textContent = "";
    return;
  }
  const desc = opt.dataset.description;
  modelDescriptionElement.textContent = desc || "";
  localStorage.setItem("preferredGeminiModel", opt.value);
  console.log(`Desc updated: ${opt.value}`);
}
/** チャットUI有効/無効化 */
function disableChatUI(disable, reason = "") {
  // (中身は変更なし - 省略せず記述)
  if (reason) console.log(`UI ${disable ? "disabled" : "enabled"}: ${reason}`);
  if (modelSelectElement) modelSelectElement.disabled = disable;
  if (updateModelsButton)
    updateModelsButton.disabled = disable || isLoadingModels;
}
/** アコーディオン初期化 */
function initAccordion() {
  // (中身は変更なし - 省略せず記述)
  accordionHeader = document.getElementById("ongoing-scenarios-header");
  accordionContent = document.getElementById("ongoing-scenarios-content");
  if (!accordionHeader || !accordionContent) {
    console.warn("Accordion missing.");
    return;
  }
  const state = localStorage.getItem("ongoingScenariosAccordionState");
  if (state === "open") accordionContent.classList.add("open");
  console.log(`Accordion state: ${state || "closed"}.`);
  accordionHeader.addEventListener("click", (e) => {
    if (
      e.target.closest("#show-hidden-scenarios") ||
      e.target.closest("label[for='show-hidden-scenarios']")
    )
      return;
    accordionContent.classList.toggle("open");
    const ns = accordionContent.classList.contains("open") ? "open" : "closed";
    localStorage.setItem("ongoingScenariosAccordionState", ns);
    console.log(`Accordion toggled: ${ns}.`);
  });
  console.log("Accordion initialized.");
}
/** シナリオリストフィルタ適用 */
function applyScenarioFilter(showHidden) {
  // (中身は変更なし - 省略せず記述 - ★後で修正必要)
  if (!scenarioListContainer || !noScenariosMessage) {
    console.warn("Scenario list elements missing.");
    return;
  }
  console.log(`Filtering scenarios (ShowHidden: ${showHidden})...`);
  const rows = Array.from(
    scenarioListContainer.querySelectorAll(".scenario-list")
  );
  const map = {};
  rows.forEach((r) => {
    if (r.dataset.scenarioId) map[r.dataset.scenarioId] = r;
  });
  const filtered = window.cachedScenarios.filter((s) => {
    return showHidden ? true : !s.hideFromHistoryFlag;
  });
  filtered.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  const ids = new Set(filtered.map((s) => String(s.scenarioId)));
  let rem = 0,
    add = 0,
    upd = 0;
  /* 差分更新ロジックは一旦コメントアウトし、全再描画に変更 */ scenarioListContainer.innerHTML =
    "";
  filtered.forEach((sc) => {
    console.log(`Appending row for: ${sc.scenarioId}`);
    const r = createScenarioRow(sc);
    if (r) scenarioListContainer.appendChild(r);
    else console.error("Failed create row:", sc);
    add++;
  });
  console.log(`Filter applied: Added ${add}.`);
  scenarioListContainer.style.display = filtered.length === 0 ? "none" : "";
  noScenariosMessage.style.display = filtered.length === 0 ? "block" : "none";
  console.log(
    `Final display - List: ${
      filtered.length > 0 ? "shown" : "hidden"
    }, Message: ${filtered.length === 0 ? "shown" : "hidden"}`
  );
}
/** シナリオ行DOM生成 */
function createScenarioRow(scenario) {
  // (中身は変更なし - 省略せず記述 - ★後で修正必要)
  const div = document.createElement("div");
  div.className = "scenario-list";
  div.dataset.scenarioId = scenario.scenarioId;
  const info = document.createElement("span");
  info.className = "info";
  let date = scenario.updatedAt;
  try {
    date = new Date(scenario.updatedAt).toLocaleString("ja-JP");
  } catch {}
  info.textContent = `ID:${scenario.scenarioId} | ${
    scenario.title || "(無題)"
  } (更新: ${date})`;
  div.appendChild(info);
  const btns = document.createElement("div");
  btns.className = "buttons";
  const showHidden = showHiddenCheckbox?.checked || false;
  if (!showHidden) {
    const btnCont = document.createElement("button");
    btnCont.type = "button";
    btnCont.innerHTML = `<span class="iconmoon icon-arrow-right"></span> 始める`;
    btnCont.addEventListener("click", () => {
      window.location.href = `scenario.html?scenarioId=${scenario.scenarioId}`;
    });
    btns.appendChild(btnCont);
    const btnShelf = document.createElement("button");
    btnShelf.type = "button";
    btnShelf.classList.add("btn-shelf");
    updateShelfButton(btnShelf, scenario.bookShelfFlag);
    btnShelf.addEventListener("click", async () => {
      await toggleBookShelfFlag(scenario.scenarioId, btnShelf);
    });
    btns.appendChild(btnShelf);
  }
  const btnHide = document.createElement("button");
  btnHide.type = "button";
  if (!scenario.hideFromHistoryFlag) {
    btnHide.innerHTML = `<span class="iconmoon icon-bin"></span> 非表示`;
    btnHide.addEventListener("click", () => showHideConfirmModal(scenario));
  } else {
    btnHide.innerHTML = `<span class="iconmoon icon-undo2"></span> 表示`;
    btnHide.style.backgroundColor = "#757575";
    btnHide.addEventListener("click", async () => {
      await toggleHideFromHistoryFlag(scenario, false);
      showToast(`「${scenario.title || scenario.scenarioId}」を表示`);
    });
  }
  btns.appendChild(btnHide);
  if (showHidden && scenario.hideFromHistoryFlag) {
    const btnDel = document.createElement("button");
    btnDel.type = "button";
    btnDel.innerHTML = `<span class="iconmoon icon-cross"></span> 完全削除`;
    btnDel.style.backgroundColor = "#f44336";
    btnDel.addEventListener("click", () => showDeleteConfirmModal(scenario));
    btns.appendChild(btnDel);
  }
  div.appendChild(btns);
  return div;
}
/** 本棚ボタン表示更新 */
function updateShelfButton(buttonElement, isShelved) {
  /* ... (省略なし) ... */ if (!buttonElement) return;
  if (isShelved) {
    buttonElement.innerHTML = `<span class="iconmoon icon-book"></span> 収納済`;
    buttonElement.style.backgroundColor = "#757575";
    buttonElement.title = "本棚から出す";
  } else {
    buttonElement.innerHTML = `<span class="iconmoon icon-books"></span> 本棚へ`;
    buttonElement.style.backgroundColor = "";
    buttonElement.title = "本棚へ収納";
  }
}
/** 本棚フラグトグル */
async function toggleBookShelfFlag(scenarioId, buttonElement) {
  /* ... (省略なし) ... */ console.log(`Toggling bookshelf for ${scenarioId}`);
  const idx = window.cachedScenarios.findIndex(
    (s) => s.scenarioId === scenarioId
  );
  if (idx === -1) {
    showToast("シナリオ未発見");
    return;
  }
  const sc = window.cachedScenarios[idx];
  const newFlag = !sc.bookShelfFlag;
  try {
    sc.bookShelfFlag = newFlag;
    sc.updatedAt = new Date().toISOString();
    sc.shelfOrder = newFlag ? sc.shelfOrder || Date.now() : undefined;
    await updateScenario(sc);
    console.log(`Bookshelf flag -> ${newFlag}`);
    updateShelfButton(buttonElement, newFlag);
    showToast(newFlag ? `本棚へ収納` : `本棚から出す`);
  } catch (e) {
    console.error(`Failed toggle bookshelf for ${scenarioId}:`, e);
    showToast(`本棚更新失敗: ${e.message}`);
    sc.bookShelfFlag = !newFlag;
    updateShelfButton(buttonElement, !newFlag);
  }
}
/** 非表示フラグトグル */
async function toggleHideFromHistoryFlag(scenario, hideFlag) {
  /* ... (省略なし) ... */ console.log(
    `Toggling hide flag for ${scenario.scenarioId} to ${hideFlag}`
  );
  const idx = window.cachedScenarios.findIndex(
    (s) => s.scenarioId === scenario.scenarioId
  );
  if (idx === -1) {
    showToast("シナリオ未発見");
    return;
  }
  const origFlag = scenario.hideFromHistoryFlag;
  try {
    scenario.hideFromHistoryFlag = hideFlag;
    scenario.updatedAt = new Date().toISOString();
    await updateScenario(scenario);
    console.log(`Hide flag -> ${hideFlag}`);
    applyScenarioFilter(showHiddenCheckbox.checked);
  } catch (e) {
    console.error(`Failed toggle hide flag for ${scenario.scenarioId}:`, e);
    showToast(`表示/非表示切替失敗: ${e.message}`);
    scenario.hideFromHistoryFlag = origFlag;
    applyScenarioFilter(showHiddenCheckbox.checked);
  }
}
/** 非表示確認モーダル */
function showHideConfirmModal(scenario) {
  /* ... (省略なし) ... */ multiModalOpen({
    title: "非表示確認",
    contentHtml: `<p>「${DOMPurify.sanitize(
      scenario.title || scenario.scenarioId
    )}」を非表示？</p>`,
    okLabel: "非表示",
    onOk: async () => {
      await toggleHideFromHistoryFlag(scenario, true);
      showToast(`「${scenario.title || scenario.scenarioId}」を非表示に`);
    },
  });
}
/** 削除確認モーダル */
function showDeleteConfirmModal(scenario) {
  /* ... (省略なし) ... */ multiModalOpen({
    title: "完全削除確認",
    contentHtml: `<p style="color:#ffcccc;"><strong>警告:</strong> 「${DOMPurify.sanitize(
      scenario.title || scenario.scenarioId
    )}」完全削除？</p>`,
    okLabel: "完全削除",
    okButtonColor: "#f44336",
    onOk: async () => {
      console.log(`Deleting ${scenario.scenarioId}...`);
      try {
        await deleteScenarioById(scenario.scenarioId);
        window.cachedScenarios = window.cachedScenarios.filter(
          (s) => s.scenarioId !== scenario.scenarioId
        );
        console.log(`Deleted ${scenario.scenarioId}.`);
        showToast(`削除完了`);
        applyScenarioFilter(showHiddenCheckbox.checked);
      } catch (e) {
        console.error(`Failed delete ${scenario.scenarioId}:`, e);
        showToast(`削除失敗: ${e.message}`);
      }
    },
  });
}
/** シナリオ行DOM更新 */
function updateScenarioRow(rowElement, scenario) {
  /* ... (省略なし) ... */ const newRow = createScenarioRow(scenario);
  rowElement.replaceWith(newRow);
}

// --- ファイル読み込み完了ログ ---
console.log("[Menu] menu.js loaded.");
