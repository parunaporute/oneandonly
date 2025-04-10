// tutorialManager.js
(function () {
    // -------------------------------------------
    // A) スコープ内変数
    // -------------------------------------------
    let overlayEl = null;
    let dialogEl = null;
    let modalCheckInterval = null;

    // -------------------------------------------
    // B) DOMContentLoaded 後に開始
    // -------------------------------------------
    document.addEventListener('DOMContentLoaded', async () => {
        createBaseElements(); // オーバーレイ & ダイアログを生成 or 再利用
        await runTutorials(); // チュートリアル全体の開始
    });

    // -------------------------------------------
    // C) ベース要素生成
    // -------------------------------------------
    function createBaseElements() {
        // 既に存在すれば使い回し
        overlayEl = document.getElementById('tutorial-overlay');
        dialogEl = document.getElementById('tutorial-dialog');
        if (overlayEl && dialogEl) return;

        // (1) オーバーレイ
        overlayEl = document.createElement('div');
        overlayEl.id = 'tutorial-overlay';
        overlayEl.classList.add('tutorial-overlay');
        // pointer-events: none; にして、下の要素操作を許可
        overlayEl.style.pointerEvents = 'none';
        document.body.appendChild(overlayEl);

        // (2) ダイアログ
        dialogEl = document.createElement('div');
        dialogEl.id = 'tutorial-dialog';
        dialogEl.classList.add('tutorial-dialog');
        // ダイアログ上は pointer-events: auto; でクリック可
        dialogEl.style.pointerEvents = 'auto';
        document.body.appendChild(dialogEl);
    }

    // -------------------------------------------
    // D) チュートリアル全体の起動
    // -------------------------------------------
    async function runTutorials() {
        if (!window.tutorials || !Array.isArray(window.tutorials)) {
            console.warn('No tutorials found.');
            return;
        }

        // URLパラメータに forceTutorial があれば強制実行
        const forcedTutorialId = getQueryParam('forceTutorial');
        if (forcedTutorialId) {
            const target = window.tutorials.find((t) => t.id === forcedTutorialId);
            if (target) {
                // 強制実行時は、ページマッチングは runTutorialIfMatchPage 内で行われる
                await runTutorialIfMatchPage(target);
            } else {
                console.warn(`Forced tutorial with id "${forcedTutorialId}" not found.`);
            }
            return; // 強制実行時はここで処理終了
        }

        // 通常実行: tutorialData.js の定義順に未完了のチュートリアルを探す
        // window.tutorials を定義順にそのままループする
        for (const story of window.tutorials) {
            const isCompleted = localStorage.getItem('completeStory_' + story.id) === 'true';
            if (!isCompleted) {
                // 未完了のチュートリアルが見つかった
                // このチュートリアルが現在のページにマッチするステップを持っているか確認し、持っていれば実行
                await runTutorialIfMatchPage(story);
                // 1つ実行したらループを抜ける（一度に複数のチュートリアルを開始しない）
                break;
            }
        }
    }

    // runTutorialIfMatchPage は、渡された story が現在のページにマッチするかどうかを
    // チェックする役割なので、変更は不要です。
    async function runTutorialIfMatchPage(story) {
        const currentPage = getCurrentPageName();
        // このストーリーに現在ページ用の step があるか？
        const hasStepForPage = story.steps.some(
            (step) => step.type === 'page' && step.match === currentPage
        );
        if (hasStepForPage) {
            // 現在のページにマッチするステップがあればチュートリアルを開始
            await startTutorialSteps(story);
        }
        // マッチしない場合は何もしない（次のチュートリアルに進むか、ループが終了する）
    }

    // -------------------------------------------
    // E) チュートリアルステップ開始
    // -------------------------------------------
    async function startTutorialSteps(story) {
        const currentPage = getCurrentPageName();

        // 1) このページに該当する step 一覧を抽出 (複数あり得る)
        const allPageSteps = story.steps.filter(
            (s) => s.type === 'page' && s.match === currentPage
        );
        if (!allPageSteps.length) return;

        // 2) story 全体の "page" step の順序リスト
        const pageSteps = story.steps.filter((s) => s.type === 'page');

        // 3) 今のページ上にある step を「前ステップが完了しているか/自分が未完了か」を確認しながら順に実行
        for (const st of allPageSteps) {
            // (a) すでにこの step が完了済みならスキップ
            if (isPageStepDone(story.id, st)) {
                console.log(`[Tutorial] This page-step is already done:`, st);
                continue;
            }

            // (b) 前のpage-stepがある場合、その完了フラグをチェック
            const idx = pageSteps.indexOf(st);
            if (idx > 0) {
                const prevStep = pageSteps[idx - 1];
                if (!isPageStepDone(story.id, prevStep)) {
                    // 前stepがまだ終わっていない → このstepは実行不可
                    console.log(
                        `[Tutorial] The previous page-step (index:${idx - 1
                        }) is not done yet. Stop here.`
                    );
                    return; // ここで終了（後続stepも実行しない）
                }
            }

            // (c) subSteps実行
            console.log(`[Tutorial] start subSteps for page-step index:${idx}`);
            const subSteps = st.subSteps || [];
            if (!subSteps.length) {
                // 単発表示
                const r = await showDialog(story.title, st.message, null, '1/1');
                if (r.skipCheck || r.ok) {
                    markPageStepDone(story, st);
                }
            } else {
                // 複数 subSteps
                let subStepCanceled = false;
                let stepCounter;

                for (let i = 0; i < subSteps.length; i++) {
                    const sub = subSteps[i];
                    // i番目のサブステップなので (i+1)/(全サブステップ数) を渡す
                    stepCounter = `${i + 1}/${subSteps.length}`;

                    const r = await showDialog(story.title, sub.message, sub, stepCounter);
                    if (r.skipCheck) {
                        // 「次は表示しない」→ チュートリアル全体完了に
                        localStorage.setItem('completeStory_' + story.id, 'true');
                        return;
                    }
                    if (!r.ok) {
                        // キャンセル → 中断
                        subStepCanceled = true;
                        break;
                    }
                }
                if (!subStepCanceled) {
                    // subSteps全部クリア → page-step完了
                    markPageStepDone(story, st);
                }
            }
        }
    }

    // -------------------------------------------
    // F) page-stepの完了フラグ管理
    // -------------------------------------------
    function isPageStepDone(storyId, step) {
        const stepIndex = getPageStepIndex(storyId, step);
        if (stepIndex < 0) return false; // stepが見つからない
        const key = `pageStepDone_${storyId}_${stepIndex}`;
        return localStorage.getItem(key) === 'true';
    }

    function markPageStepDone(story, step) {
        const stepIndex = getPageStepIndex(story.id, step);
        if (stepIndex < 0) return;
        // 今のpage-step完了
        localStorage.setItem(`pageStepDone_${story.id}_${stepIndex}`, 'true');

        // もしこれが story.steps のうち最後のtype===page だったら → 全体完了
        const pageSteps = story.steps.filter((s) => s.type === 'page');
        const currentIdx = pageSteps.indexOf(step);
        if (currentIdx === pageSteps.length - 1) {
            localStorage.setItem(`completeStory_${story.id}`, 'true');
            console.log(`[Tutorial] story ${story.id} fully completed.`);
        } else {
            console.log(`[Tutorial] page-step index=${currentIdx} done. More steps remain.`);
        }
    }

    function getPageStepIndex(storyId, step) {
        const pageSteps =
            (window.tutorials.find((t) => t.id === storyId) || {}).steps?.filter(
                (s) => s.type === 'page'
            ) || [];
        return pageSteps.indexOf(step);
    }

    // -------------------------------------------
    // G) ダイアログ表示 (Promise で完了を返す)
    // -------------------------------------------
    function showDialog(title, message, subStep, stepCounter = '') {
        return new Promise((resolve) => {
            // ダイアログ HTML を組み立て
            dialogEl.innerHTML = buildDialogHTML(title, message, subStep, stepCounter);

            // 表示開始
            overlayEl.style.display = 'block';
            dialogEl.style.display = 'block';
            dialogEl.style.opacity = '0';

            // ボタン類
            const nextBtn = dialogEl.querySelector('#tutorial-next-btn');
            const cancelBtn = dialogEl.querySelector('#tutorial-cancel-btn');
            const skipCheck = dialogEl.querySelector('#tutorial-skip-checkbox');

            // 「完了ボタン」要素 (completeステップ用)
            const completeBtn = dialogEl.querySelector('#tutorial-complete-btn');

            // 「OKボタン非表示」指定なら
            if (subStep?.removeOkButton && nextBtn) {
                nextBtn.style.display = 'none';
            }

            // もし「完了ボタン」(complete)があるなら、そのクリック時に resolve({ok:true}) して終わる
            if (completeBtn) {
                completeBtn.addEventListener('click', () =>
                    closeDialog({
                        ok: true,
                        cancel: false,
                        skipCheck: false,
                    })
                );
            }

            // イベント
            if (nextBtn) {
                nextBtn.addEventListener('click', () =>
                    closeDialog({
                        ok: true,
                        cancel: false,
                        skipCheck: !!skipCheck?.checked,
                    })
                );
            }
            if (cancelBtn) {
                cancelBtn.addEventListener('click', () => {
                    // ▼ ここで forceTutorial パラメータを削除
                    removeForceTutorialParam();
                    closeDialog({
                        ok: false,
                        cancel: true,
                        skipCheck: !!skipCheck?.checked,
                    });
                });
            }

            /** forceTutorialパラメータだけを削除してURLを上書き */
            function removeForceTutorialParam() {
                const currentUrl = new URL(window.location.href);
                currentUrl.searchParams.delete('forceTutorial');
                // 同じページでURLだけ書き換え(リロードせず)
                window.history.replaceState({}, '', currentUrl);
            }

            // ハイライト関連
            let highlightEl = null;
            if (subStep?.highlightSelector) {
                highlightEl = document.querySelector(subStep.highlightSelector);
                if (highlightEl) {
                    highlightEl.classList.add('tutorial-highlight');
                    highlightEl.scrollIntoView({
                        block: 'center',
                        inline: 'center',
                        behavior: 'smooth',
                    });
                    waitForScrollEnd(highlightEl, () => {
                        positionDialog(dialogEl, highlightEl);
                        fadeInDialog();
                    });
                } else {
                    centerDialog(dialogEl);
                    fadeInDialog();
                }
            } else {
                centerDialog(dialogEl);
                fadeInDialog();
            }

            // 特定要素クリック待ち
            let clickHandler = null;
            if (subStep?.waitForClickOn) {
                const targetEl = document.querySelector(subStep.waitForClickOn);
                if (targetEl) {
                    clickHandler = () => {
                        closeDialog({
                            ok: true,
                            cancel: false,
                            skipCheck: !!skipCheck?.checked,
                        });
                    };
                    targetEl.addEventListener('click', clickHandler);
                }
            }

            // ここではモーダル監視はオフにした例
            //startModalCheck();

            function closeDialog(action) {
                // ハイライト解除
                if (highlightEl) {
                    highlightEl.classList.remove('tutorial-highlight');
                }
                // クリック待ち解除
                if (clickHandler && subStep?.waitForClickOn) {
                    const tEl = document.querySelector(subStep.waitForClickOn);
                    tEl?.removeEventListener('click', clickHandler);
                }

                // 非表示
                dialogEl.style.display = 'none';
                dialogEl.style.opacity = '0';
                overlayEl.style.display = 'none';
                stopModalCheck();

                resolve(action);
            }

            function fadeInDialog() {
                requestAnimationFrame(() => {
                    dialogEl.style.opacity = '1';
                });
            }
        });
    }

    function buildDialogHTML(title, message, subStep, stepCounter = '') {
        // もし subStep?.complete が true なら、完了ボタンのみ表示のレイアウトにする
        if (subStep?.complete) {
            return `
      <div class="step-title">
        ${escapeHtml(title)}${escapeHtml(stepCounter)}
      </div>
      <div class="step-message">${escapeHtml(message)}</div>
      <div style="display:flex; justify-content:right; gap:10px;">
        <button id="tutorial-complete-btn" style="min-width:6rem;">完了</button>
      </div>
    `;
        }
        return `
      <div class="step-title">
        ${escapeHtml(title)}${escapeHtml(stepCounter)}
      </div>
      <div class="step-message">${escapeHtml(message)}</div>
      <div style="display:flex; justify-content:right; gap:10px;">
        <button id="tutorial-next-btn">次へ</button>
        <button id="tutorial-cancel-btn">キャンセル</button>
      </div>
      <div class="step-skip-container">
        <input type="checkbox" id="tutorial-skip-checkbox" />
        <label for="tutorial-skip-checkbox">次は表示しない</label>
      </div>
    `;
    }

    // -------------------------------------------
    // H) モーダル監視 (任意)
    // -------------------------------------------
    function startModalCheck() {
        stopModalCheck();
        modalCheckInterval = setInterval(() => {
            const isModalOpen = !!document.querySelector('.modal.active');
            // tutorualOverlayは常にクリック透過にしたい場合は "none" で固定
            overlayEl.style.pointerEvents = isModalOpen ? 'none' : 'none';
        }, 300);
    }

    function stopModalCheck() {
        if (modalCheckInterval) {
            clearInterval(modalCheckInterval);
            modalCheckInterval = null;
        }
    }

    // -------------------------------------------
    // I) 位置調整・ユーティリティ
    // -------------------------------------------
    function positionDialog(dialog, highlightEl) {
        const hlRect = highlightEl.getBoundingClientRect();
        const dw = dialog.offsetWidth;
        const dh = dialog.offsetHeight;

        // 下に配置できるか判定
        const spaceBelow = window.innerHeight - hlRect.bottom;
        let topPos;
        if (spaceBelow > dh + 10) {
            topPos = hlRect.bottom + 10;
        } else {
            topPos = hlRect.top - dh - 10;
        }
        if (topPos < 0) topPos = 0;

        let leftPos = hlRect.left;
        if (leftPos + dw > window.innerWidth) {
            leftPos = window.innerWidth - dw - 10;
        }
        if (leftPos < 0) leftPos = 0;

        dialog.style.top = topPos + 'px';
        dialog.style.left = leftPos + 'px';

        // 被りがあれば横ずらし
        const boxRect = dialog.getBoundingClientRect();
        if (checkOverlap(hlRect, boxRect)) {
            shiftHorizontally(dialog, hlRect, boxRect);
            clipToViewport(dialog);
        } else {
            clipToViewport(dialog);
        }
    }

    function checkOverlap(r1, r2) {
        const overlapX = r1.left < r2.right && r1.right > r2.left;
        const overlapY = r1.top < r2.bottom && r1.bottom > r2.top;
        return overlapX && overlapY;
    }

    function shiftHorizontally(dialog, hlRect, boxRect) {
        const highlightCenterX = (hlRect.left + hlRect.right) / 2;
        const screenCenterX = window.innerWidth / 2;
        const dw = boxRect.width;
        let newLeft;
        if (highlightCenterX < screenCenterX) {
            newLeft = hlRect.right + 10;
        } else {
            newLeft = hlRect.left - dw - 10;
        }
        if (newLeft < 0) newLeft = 0;
        if (newLeft + dw > window.innerWidth) {
            newLeft = window.innerWidth - dw - 10;
        }
        dialog.style.left = newLeft + 'px';
    }

    function clipToViewport(dialog) {
        const boxRect = dialog.getBoundingClientRect();
        let topPos = boxRect.top;
        let leftPos = boxRect.left;
        const dw = boxRect.width;
        const dh = boxRect.height;

        if (topPos < 0) topPos = 0;
        if (topPos + dh > window.innerHeight) {
            topPos = window.innerHeight - dh - 10;
            if (topPos < 0) topPos = 0;
        }
        if (leftPos < 0) leftPos = 0;
        if (leftPos + dw > window.innerWidth) {
            leftPos = window.innerWidth - dw - 10;
            if (leftPos < 0) leftPos = 0;
        }
        dialog.style.top = topPos + 'px';
        dialog.style.left = leftPos + 'px';
    }

    function centerDialog(dialog) {
        const dw = dialog.offsetWidth;
        const dh = dialog.offsetHeight;
        let topPos = (window.innerHeight - dh) / 2;
        let leftPos = (window.innerWidth - dw) / 2;
        if (topPos < 0) topPos = 0;
        if (leftPos < 0) leftPos = 0;
        dialog.style.top = topPos + 'px';
        dialog.style.left = leftPos + 'px';
    }

    function waitForScrollEnd(el, callback) {
        let stableCount = 0;
        let lastTop = null;
        function step() {
            const rect = el.getBoundingClientRect();
            const currentTop = rect.top;
            if (lastTop !== null && Math.abs(currentTop - lastTop) < 0.5) {
                stableCount++;
            } else {
                stableCount = 0;
            }
            lastTop = currentTop;
            if (stableCount > 5) {
                callback();
            } else {
                requestAnimationFrame(step);
            }
        }
        requestAnimationFrame(step);
    }

    // -------------------------------------------
    // J) 細かいユーティリティ
    // -------------------------------------------
    function getCurrentPageName() {
        let page = location.pathname.split('/').pop() || '';
        if (!page || page === '') {
            page = 'index.html';
        }
        return page;
    }
    function getQueryParam(name) {
        const params = new URLSearchParams(window.location.search);
        return params.get(name);
    }
    function escapeHtml(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
})();