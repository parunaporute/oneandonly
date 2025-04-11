// tutorialData.js

window.tutorialGroups = [
    { id: 'basic', name: '基本編' },
    { id: 'advanced', name: '応用編' },
];

window.tutorials = [
    {
        id: 'apiKeySetup', // IDはそのまま
        title: '各種APIキーを設定しよう', // タイトル変更
        description: 'Gemini APIキーとStability AI APIキーの入手と設定手順を解説します。', // 説明変更
        groupId: 'basic',
        steps: [
            {
                type: 'page',
                match: 'index.html', // index.htmlで実行
                message: 'テキスト生成と画像生成に必要なAPIキーの設定を行いましょう。', // 開始メッセージ
                subSteps: [
                    {
                        // step1: APIキー設定モーダルを開く
                        message: 'まずは「APIキー設定」ボタンを押してください。',
                        highlightSelector: '#set-api-key-button', // 既存のボタンID
                        removeOkButton: true,
                        waitForClickOn: '#set-api-key-button', // このボタンのクリックを待つ
                    },
                    {
                        // step2: Geminiキー取得リンクへ誘導
                        message:
                            'モーダルが開きました。まず、Gemini APIキーを設定します。「Gemini キー取得」リンクをクリックして、キーの取得方法を確認し、キー（AIzaから始まる文字列）をコピーしてください。',
                        // menu.js の href を元にセレクタを指定
                        highlightSelector: 'a[href*="aistudio.google.com/app/apikey"]',
                        // removeOkButton: true, // リンククリックだけなのでOKボタンは表示したままにするか、非表示にするか選択。ここでは表示したままにする
                        // waitForClickOn は設定せず、「次へ」で進める形にする（別タブで開く可能性があるため）
                    },
                    {
                        // step3: Geminiキー入力欄へ誘導
                        message:
                            'Gemini APIキーを取得できたら、下の入力欄に貼り付けてください。',
                        highlightSelector: '#temp-gemini-api-key-input', // menu.js で定義されているID
                    },
                    {
                        // step4: Stabilityキー取得リンクへ誘導
                        message:
                            '次に、Stability AI APIキーを設定します。「Stability AI キー取得」リンクをクリックして、キーの取得方法を確認し、キー（sk-から始まる文字列）をコピーしてください。',
                        // menu.js の href を元にセレクタを指定
                        highlightSelector: 'a[href*="platform.stability.ai/account/keys"]',
                        // removeOkButton: true, // ここも「次へ」で進める
                    },
                    {
                        // step5: Stabilityキー入力欄へ誘導
                        message:
                            'Stability AI APIキーを取得できたら、下の入力欄に貼り付けてください。',
                        highlightSelector: '#temp-stability-api-key-input', // menu.js で定義されているID
                    },
                    {
                        // step6: 保存ボタン（モーダルのOKボタン）へ誘導
                        message: '両方のキーを入力したら、「保存」ボタンを押してください。',
                        // multiModal.js の実装に依存するが、既存のwaitForClickOn の ID を踏襲
                        highlightSelector: '#api-key-save-button', // multiModalの汎用OKボタンIDを想定（要確認）
                        removeOkButton: true, // モーダルのOKボタンを押させるため、チュートリアルの「次へ」は非表示
                        waitForClickOn: '#api-key-save-button', // モーダルのOKボタンのクリックを待つ（要確認）
                    },
                    {
                        // step7: 完了
                        message: '以上で、APIキーの設定は完了です。',
                        complete: true, // チュートリアル完了フラグ
                    },
                ],
            },
        ],
    },
    {
        id: 'story1',
        title: 'メインページのボタン説明',
        description: 'indexページにあるボタンの使い方を順番に説明します。',
        groupId: 'basic',
        steps: [
            {
                type: 'page',
                match: 'index.html',
                message: 'indexページの取説開始',
                subSteps: [
                    {
                        message: '生成ボタン: エレメント生成画面へ移動します。', // ボタン名変更
                        highlightSelector: '#character-create',
                    },
                    {
                        message: 'パーティボタン: 作成したキャラを編成・管理します。',
                        highlightSelector: '#party-list',
                    },
                    {
                        message: '倉庫: 生成したエレメントが収納されています。', // ボタン名変更
                        highlightSelector: '#show-warehouse-btn',
                    },
                    {
                        message: '以上で、ボタン説明を終わります。',
                        complete: true,
                    },
                ],
            },
        ],
    },
    {
        id: 'gachaFlow', // IDはそのまま。実態に合わせて 'elementCreationFlow' などに変更しても良い
        title: 'エレメント生成の流れ', // タイトル変更
        description:
            'トップ画面 から エレメント生成画面 へ進み、生成して倉庫で確認するまでの流れを解説します。', // 説明変更
        groupId: 'basic',
        steps: [
            // 1) index.html
            {
                type: 'page',
                match: 'index.html',
                message: 'エレメント生成の流れを説明します。', // メッセージ変更
                subSteps: [
                    {
                        message: 'まずは「生成」ボタンを押してください。', // メッセージ変更
                        highlightSelector: '#character-create',
                        removeOkButton: true,
                        waitForClickOn: '#character-create',
                    },
                ],
            },
            // 2) characterCreate.html
            {
                type: 'page',
                match: 'characterCreate.html', // このページ名は実際のものに合わせる
                message: 'エレメント生成画面での操作を行いましょう。', // メッセージ変更
                subSteps: [
                    {
                        message: '「エレメント生成」ボタンを押してください。', // ボタン名変更。実際のボタンIDに合わせる必要あり
                        highlightSelector: '#gacha-btn', // このIDは仮。実際の生成ボタンIDに合わせる
                        removeOkButton: true,
                        waitForClickOn: '#gacha-btn', // このIDは仮。実際の生成ボタンIDに合わせる
                    },
                    {
                        message: 'OKボタンを押してください。（生成開始）', // ジャンル設定がない場合はこのステップは不要かも
                        highlightSelector: '#genre-setting-ok-btn', // このIDは仮。
                        removeOkButton: true,
                        waitForClickOn: '#genre-setting-ok-btn', // このIDは仮。
                    },
                    {
                        message:
                            '生成が完了するまでしばらくお待ちください。完了したら次へ進みます。',
                        // 完了待ち。特定の要素が表示されるのを待つなどの処理が必要な場合もある
                    },
                    {
                        message:
                            '生成が確認できたら、戻るボタンを押してindexページへ戻りましょう。',
                        highlightSelector: '#back-to-menu', // 戻るボタンのID
                        removeOkButton: true,
                        waitForClickOn: '#back-to-menu', // 戻るボタンのID
                    },
                ],
            },
            // 3) 再び index.html に戻って倉庫へ
            {
                type: 'page',
                match: 'index.html',
                message: '生成したエレメントを倉庫で確認しましょう。', // メッセージ変更
                subSteps: [
                    {
                        message: '「倉庫」ボタンを押して、今生成したエレメントを確認してください。', // メッセージ変更
                        highlightSelector: '#show-warehouse-btn',
                        removeOkButton: true,
                        waitForClickOn: '#show-warehouse-btn',
                    },
                    {
                        message:
                            '倉庫の説明は後ほどするとして、生成したエレメントが表示されていると思います。', // メッセージ変更
                    },
                    {
                        message: '最後に「×」ボタンを押して倉庫を閉じましょう。',
                        highlightSelector: '#close-warehouse-btn', // 倉庫を閉じるボタンのID (要確認)
                        removeOkButton: true,
                        waitForClickOn: '#close-warehouse-btn', // 倉庫を閉じるボタンのID (要確認)
                    },
                    {
                        message: 'これでエレメント生成の説明は以上です。', // メッセージ変更
                        complete: true,
                    },
                ],
            },
        ],
    },
    {
        id: 'story3',
        title: '高度な倉庫管理',
        description: '倉庫画面でのソートやフィルタリング、選択モードなど高度な機能を紹介します。',
        groupId: 'advanced',
        steps: [
            {
                type: 'page',
                match: 'index.html',
                message: '倉庫管理の使い方を説明します。',
                subSteps: [
                    {
                        message: 'まずは「倉庫」ボタンを押して、倉庫画面を開きましょう。',
                        highlightSelector: '#show-warehouse-btn',
                        removeOkButton: true,
                        waitForClickOn: '#show-warehouse-btn',
                    },
                    {
                        message: 'これが倉庫画面です。',
                    },
                    {
                        message:
                            '画面上のタブをクリックすると、種類ごとにエレメントを絞り込めます。試しに切り替えてみましょう。', // 文言修正
                        highlightSelector: '.warehouse-tabs', // タブ全体のクラスを想定 (要確認)
                    },
                    {
                        message: '右上のドロップダウンから、名前順や日時順などのソートを選べます。',
                        highlightSelector: '#warehouse-sort-dropdown', // ソートドロップダウンのID (要確認)
                    },
                    {
                        message: 'ソート方向ボタンを押すと、昇順/降順を切り替えられます。',
                        highlightSelector: '#warehouse-sort-direction-btn', // ソート方向ボタンのID (要確認)
                    },
                    {
                        message:
                            '複数のエレメントを一括操作したい場合は「選択モード」を使いましょう。選択モードをオンにするとエレメントを複数同時選択ができます。まとめて削除できます。', // 文言修正
                        highlightSelector: '#toggle-warehouse-selection-mode-btn', // 選択モード切替ボタンのID (要確認)
                    },
                    {
                        message:
                            'エレメントをクリックすると、赤い枠が付きます。左上の選択したエレメントを削除ボタンを押すことで、削除が可能になります。', // 文言修正
                        // highlightSelector は特定のボタンを指すIDに変更した方が良いかもしれない (#delete-selected-warehouse-items-btn など)
                    },
                    {
                        message:
                            '最後に、右上の「×」(倉庫を閉じるボタン)を押して倉庫を閉じましょう。',
                        highlightSelector: '#close-warehouse-btn', // 閉じるボタンID (要確認)
                        removeOkButton: true,
                        waitForClickOn: '#close-warehouse-btn', // 閉じるボタンID (要確認)
                    },
                    {
                        message: '以上で、倉庫画面の高度な管理機能の説明は終わりです。',
                        complete: true,
                    },
                ],
            },
        ],
    },
    {
        id: 'createAvatar',
        title: 'あなたの分身を作成しよう',
        description: '自分だけのアバターを作成するチュートリアルです。',
        groupId: 'basic',
        steps: [
            {
                type: 'page',
                match: 'index.html',
                message: '「あなたの分身」機能の使い方を学びましょう。',
                subSteps: [
                    {
                        message: 'まずは「あなたの分身」ボタンを押してください。',
                        highlightSelector: '#you-avatar-btn',
                        removeOkButton: true,
                        waitForClickOn: '#you-avatar-btn',
                    },
                    {
                        message: '入力画面が開きました。まずは名前を入力しましょう。',
                        highlightSelector: '#avatar-name', // アバター名入力欄ID (要確認)
                    },
                    {
                        message: '性別を選択してください。',
                        highlightSelector: '#avatar-gender-chips', // 性別選択UIのID (要確認)
                    },
                    {
                        message: '特技を入力しましょう。',
                        highlightSelector: '#avatar-skill', // 特技入力欄ID (要確認)
                    },
                    {
                        message: '続いてカードのセリフを入力してください。',
                        highlightSelector: '#avatar-serif', // セリフ入力欄ID (要確認)
                    },
                    {
                        message: 'レア度を選択しましょう。',
                        highlightSelector: '#avatar-rarity-chips', // レア度選択UIのID (要確認)
                    },
                    {
                        message:
                            '画像生成ボタンを押してみましょう。（押下後は完了までしばらくお待ちください）',
                        highlightSelector: '.gen-image-btn', // 画像生成ボタンのクラスまたはID (要確認)
                        // removeOkButton: true, // 押下後に待機させるならtrue
                        // waitForClickOn: '.gen-image-btn' // 押下後に待機させるなら設定
                    },
                    {
                        message: '画像生成が完了するまで待ちます。', // 生成待ちステップ
                        // ここで特定の要素の出現や状態変化を待つロジックが必要な場合がある
                    },
                    {
                        message: '最後に、保存ボタンを押しましょう。',
                        highlightSelector: '#avatar-save-btn', // 保存ボタンID (要確認)
                        removeOkButton: true, // 保存ボタンを押させる
                        waitForClickOn: '#avatar-save-btn', // 保存ボタンのクリックを待つ
                    },
                    {
                        message: '以上でアバターが完成です！',
                        complete: true,
                    },
                ],
            },
        ],
    },
    {
        id: 'scenarioCreation',
        title: 'シナリオの作成と進行',
        description:
            'トップ画面 → シナリオウィザード → シナリオ画面 の流れで新しいシナリオを作成・進行します。',
        groupId: 'basic',
        steps: [
            // ---------- index.html ----------
            {
                type: 'page',
                match: 'index.html',
                message: 'シナリオの作成と進行：まずは index.html での操作です。',
                subSteps: [
                    {
                        message: '「新しいシナリオを始める」ボタンを押してください。',
                        highlightSelector: '#start-new-scenario-button',
                        removeOkButton: true,
                        waitForClickOn: '#start-new-scenario-button',
                    },
                ],
            },
            // ---------- scenarioWizard.html ----------
            {
                type: 'page',
                match: 'scenarioWizard.html', // ページ名確認
                message: '次にウィザード画面で操作を行います。',
                subSteps: [
                    {
                        message: 'あなたの分身（パーティ）を選んでください。',
                        highlightSelector: '#wizard-party-list', // パーティ選択UIのID (要確認)
                    },
                    {
                        message: '選び終えたら「次へ」ボタンを押しましょう。',
                        highlightSelector: '#go-wizard-step1-btn', // 次へボタンID (要確認)
                        removeOkButton: true,
                        waitForClickOn: '#go-wizard-step1-btn', // 次へボタンID (要確認)
                    },
                    {
                        message: 'ジャンル選択チップで「自由入力」を選択してください。',
                        highlightSelector: '#choice-free', // 自由入力選択肢ID (要確認)
                    },
                    {
                        message:
                            '自由入力ジャンルテキストボックスに「ミステリー」と入力しましょう。',
                        highlightSelector: '#free-genre-input', // 自由入力欄ID (要確認)
                    },
                    {
                        message: '「次へ」ボタンを押します。',
                        highlightSelector: '#go-step2-btn', // 次へボタンID (要確認)
                        removeOkButton: true,
                        waitForClickOn: '#go-step2-btn', // 次へボタンID (要確認)
                    },
                    {
                        message: '「目標達成型（目的達成型）」ボタンを押しましょう。',
                        highlightSelector: '#type-objective-btn', // 目標達成型ボタンID (要確認)
                    },
                    {
                        message: 'OKを押下し、キャンセルは押さずにしばらく待ちます。',
                        highlightSelector: '#confirm-scenario-ok', // 確認モーダルのOKボタンID (要確認)
                        removeOkButton: true,
                        waitForClickOn: '#confirm-scenario-ok', // 確認モーダルのOKボタンID (要確認)
                    },
                    {
                        message: '処理が終わり、シナリオ要約が表示されたら次へ進みます。',
                        // 特定要素の表示待ちなどが必要な場合がある
                    },
                    {
                        message: '「このシナリオで始める」ボタンを押してください。',
                        highlightSelector: '#start-scenario-button', // シナリオ開始ボタンID (要確認)
                        removeOkButton: true,
                        waitForClickOn: '#start-scenario-button', // シナリオ開始ボタンID (要確認)
                    },
                ],
            },
            // ---------- scenario.html ----------
            {
                type: 'page',
                match: 'scenario.html', // ページ名確認
                message: '新しく作成されたシナリオを進行させてみましょう。',
                subSteps: [
                    {
                        message:
                            '画面最下部までスクロールし、行動テキストボックスで「自己紹介」と入力してください。',
                        highlightSelector: '#player-input', // プレイヤー入力欄ID (要確認)
                    },
                    {
                        message:
                            '次のシーンボタンを押してください。キャンセルは押さず、完了を待ちます。',
                        highlightSelector: '#next-scene', // 次のシーンボタンID (要確認)
                        removeOkButton: true,
                        waitForClickOn: '#next-scene', // 次のシーンボタンID (要確認)
                    },
                    {
                        message: '次のシーンが表示されたら次へ進みます。',
                        // シーン表示待ち
                    },
                    {
                        message:
                            'これでシナリオの進行例は完了です。左上のホームボタンからトップページに戻れます。', // メッセージ変更
                        highlightSelector: '#back-to-menu', // ホームボタンID (要確認)
                    },
                    // { // このステップは index.html に戻った後の話なので、ここでは不要
                    //     message:
                    //         '進行中のシナリオ一覧の一番上の「続きへ」ボタンから、先ほど作成したシナリオにアクセスできます。',
                    // },
                    {
                        message: '以上がシナリオの作成と進行でした。ホームボタンを押してトップに戻ってください。', // メッセージ変更
                        complete: true,
                    },
                ],
            },
        ],
    },
];