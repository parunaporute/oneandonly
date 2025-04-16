// js/hamburgerMenu.js

document.addEventListener('DOMContentLoaded', () => {
    const hamburgerButton = document.getElementById('hamburger-button');
    const hamburgerMenu = document.getElementById('hamburger-menu');
    const dynamicButtonsContainer = document.getElementById('hamburger-dynamic-buttons');
    const staticButtonsContainer = document.getElementById('hamburger-static-buttons');
  
    if (!hamburgerButton || !hamburgerMenu) {
      // console.warn('[HamburgerMenu] Hamburger elements not found.');
      return; // ハンバーガーメニューがないページでは何もしない
    }
  
    // --- ハンバーガーボタンのクリックイベント ---
    hamburgerButton.addEventListener('click', () => {
      const isExpanded = hamburgerButton.getAttribute('aria-expanded') === 'true';
      hamburgerButton.setAttribute('aria-expanded', !isExpanded);
      hamburgerMenu.classList.toggle('active');
      hamburgerMenu.setAttribute('aria-hidden', isExpanded);
      console.log(`[HamburgerMenu] Toggled. Expanded: ${!isExpanded}`);
    });
  
    // --- メニュー外クリックで閉じる ---
    document.addEventListener('click', (event) => {
      // メニューが開いていて、クリックがボタンとメニュー自身の外なら閉じる
      if (hamburgerMenu.classList.contains('active') &&
          !hamburgerButton.contains(event.target) &&
          !hamburgerMenu.contains(event.target)) {
        hamburgerButton.setAttribute('aria-expanded', 'false');
        hamburgerMenu.classList.remove('active');
        hamburgerMenu.setAttribute('aria-hidden', 'true');
        console.log('[HamburgerMenu] Closed by outside click.');
      }
    });
  
    // --- ページ固有の処理 ---
    const isScenarioPage = window.location.pathname.endsWith('scenario.html');
  
    // --- 静的ボタン（続き、背景）の複製 ---
    const cloneAndAppendStaticButton = (buttonId, container) => {
      const originalButton = document.getElementById(buttonId);
      if (originalButton && container) {
        console.log("これこれ",originalButton);
        const clone = originalButton.cloneNode(true);
        clone.removeAttribute('id'); // ID重複回避
        clone.style.display = 'flex';
        clone.style.width = '100%';
        clone.style.marginBottom = '0'; // メニュー内で調整
        clone.style.borderBottom = '1px solid #555'; // メニュースタイルに合わせる
        clone.addEventListener('click', () => {
            hamburgerMenu.classList.remove('active'); // メニューを閉じる
            hamburgerButton.setAttribute('aria-expanded', 'false');
            hamburgerMenu.setAttribute('aria-hidden', 'true');
            originalButton.click(); // 元のボタンのクリック処理を実行
        });
        container.appendChild(clone);
        console.log(`[HamburgerMenu] Cloned static button: ${buttonId}`);
      } else {
        // console.warn(`[HamburgerMenu] Static button ${buttonId} or container not found.`);
      }
    };
  
    if (staticButtonsContainer) {
      cloneAndAppendStaticButton('save-load-button', staticButtonsContainer);
      cloneAndAppendStaticButton('change-bg-button', staticButtonsContainer);
      // 他のページで共通してメニューに入れたいボタンがあればここに追加
    }
  
  
    // --- scenario.html のみ動的ボタン（履歴、PT、情報）の複製処理 ---
    if (isScenarioPage && dynamicButtonsContainer) {
      console.log('[HamburgerMenu] Scenario page detected. Waiting for dynamic buttons...');
  
      const addClonedDynamicButton = (originalButton, container) => {
        if (!originalButton || !container) {
          console.warn('[HamburgerMenu] Cannot clone dynamic button:', originalButton, container);
          return;
        }
        const clone = originalButton.cloneNode(true);
        clone.removeAttribute('id');
        clone.style.display = 'flex';
        clone.style.width = '100%';
        clone.style.marginBottom = '0';
        clone.style.borderBottom = '1px solid #555';
         clone.addEventListener('click', () => {
             hamburgerMenu.classList.remove('active'); // メニューを閉じる
             hamburgerButton.setAttribute('aria-expanded', 'false');
             hamburgerMenu.setAttribute('aria-hidden', 'true');
             originalButton.click(); // 元のボタンのクリック処理を実行
         });
        container.appendChild(clone);
        console.log(`[HamburgerMenu] Cloned dynamic button: ${originalButton.id}`);
      };
  
      // sceneUI.js からのイベントを待機
      document.addEventListener('dynamicButtonsReady', (event) => {
        console.log('[HamburgerMenu] Received dynamicButtonsReady event.');
        const { historyButton, partyButton, infoButton, spoilerButton } = event.detail;
  
        // 既存の中身をクリア（重複追加防止）
        dynamicButtonsContainer.innerHTML = '';
  
        // ボタンを複製して追加
        addClonedDynamicButton(historyButton, dynamicButtonsContainer);
        addClonedDynamicButton(partyButton, dynamicButtonsContainer);
        addClonedDynamicButton(infoButton, dynamicButtonsContainer);
        // シナリオタイプに応じてネタバレボタンも追加
        const scenarioType = window.currentScenario?.wizardData?.scenarioType;
        if (spoilerButton && scenarioType === 'objective') {
             addClonedDynamicButton(spoilerButton, dynamicButtonsContainer);
        }
  
  
      }, { once: true }); // 一度だけ実行するリスナー
    }
  });
  
  console.log('[HamburgerMenu] hamburgerMenu.js loaded.');