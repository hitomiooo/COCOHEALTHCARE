/* =========================================================
   theme.js  —  背景写真の設定（全ページ共通）
   ・スマホのカメラ／写真ライブラリから画像を選んで背景に設定
   ・画像は縮小して localStorage に保存（この端末だけに残る）
   ・ぼかし／白ベールの強さも調整できる
   ========================================================= */
(function () {
    'use strict';

    var STORAGE_KEY = 'cocoAppBackground.v1';
    var DEFAULTS = { image: '', blur: 8, veil: 0.34 };

    /* ---------- 保存・読み込み ---------- */

    function loadSettings() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return Object.assign({}, DEFAULTS);
            var obj = JSON.parse(raw);
            return {
                image: typeof obj.image === 'string' ? obj.image : '',
                blur: typeof obj.blur === 'number' ? obj.blur : DEFAULTS.blur,
                veil: typeof obj.veil === 'number' ? obj.veil : DEFAULTS.veil
            };
        } catch (e) {
            return Object.assign({}, DEFAULTS);
        }
    }

    function saveSettings(s) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
            return true;
        } catch (e) {
            return false;
        }
    }

    var settings = loadSettings();

    /* ---------- 背景の適用 ---------- */

    function applySettings() {
        var root = document.documentElement;
        root.style.setProperty('--app-bg-image', settings.image ? 'url("' + settings.image + '")' : 'none');
        root.style.setProperty('--app-bg-blur', settings.blur + 'px');
        root.style.setProperty('--app-bg-veil', String(settings.veil));
        root.setAttribute('data-has-bg', settings.image ? '1' : '0');
    }

    // DOM 構築前でも html 要素には適用できるので、先に当ててちらつきを防ぐ
    applySettings();

    /* ---------- 画像の縮小 ---------- */

    function loadImageElement(file) {
        return new Promise(function (resolve, reject) {
            var url = URL.createObjectURL(file);
            var img = new Image();
            img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
            img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('画像を読み込めませんでした')); };
            img.src = url;
        });
    }

    function drawToDataUrl(source, maxSide, quality) {
        var w = source.width, h = source.height;
        var scale = Math.min(1, maxSide / Math.max(w, h));
        var cw = Math.max(1, Math.round(w * scale));
        var ch = Math.max(1, Math.round(h * scale));
        var canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(source, 0, 0, cw, ch);
        return canvas.toDataURL('image/jpeg', quality);
    }

    function shrinkFile(file) {
        // createImageBitmap が使えれば EXIF の向きを尊重できる
        if (typeof createImageBitmap === 'function') {
            return createImageBitmap(file, { imageOrientation: 'from-image' })
                .catch(function () { return loadImageElement(file); });
        }
        return loadImageElement(file);
    }

    function storeImage(source) {
        // 容量に収まるまで段階的に小さくする
        var attempts = [
            { side: 1600, q: 0.78 },
            { side: 1200, q: 0.70 },
            { side: 900, q: 0.62 },
            { side: 700, q: 0.55 }
        ];
        for (var i = 0; i < attempts.length; i++) {
            var dataUrl = drawToDataUrl(source, attempts[i].side, attempts[i].q);
            var next = { image: dataUrl, blur: settings.blur, veil: settings.veil };
            if (saveSettings(next)) {
                settings = next;
                return true;
            }
        }
        return false;
    }

    /* ---------- 共通メニュー ---------- */

    var NAV_ITEMS = [
        { file: 'index.html', label: '🐾 手帳' },
        { file: 'gohan.html', label: '🍚 ごはん' },
        { file: 'watashi.html', label: '🌿 ヒトミ' },
        { file: 'bunseki.html', label: '📊 解析' }
    ];

    function currentFile() {
        var path = window.location.pathname;
        var name = path.substring(path.lastIndexOf('/') + 1);
        return name === '' ? 'index.html' : name;
    }

    function buildNav() {
        if (document.querySelector('.app-nav')) return;

        var current = currentFile();
        var nav = document.createElement('nav');
        nav.className = 'app-nav';
        nav.setAttribute('aria-label', 'ページ切り替え');

        NAV_ITEMS.forEach(function (item) {
            var link = document.createElement('a');
            link.className = 'app-nav-link' + (item.file === current ? ' current' : '');
            link.href = item.file;
            link.textContent = item.label;
            if (item.file === current) link.setAttribute('aria-current', 'page');
            nav.appendChild(link);
        });

        // ページ側が置き場所を用意していればそこへ、なければヘッダーの直後／先頭へ
        var slot = document.getElementById('appNavSlot');
        if (slot) {
            slot.appendChild(nav);
            return;
        }
        var header = document.querySelector('body > header, body > .topbar, body > .site-header');
        if (header) {
            header.insertAdjacentElement('afterend', nav);
        } else {
            document.body.insertBefore(nav, document.body.firstChild);
        }
    }

    /* ---------- UI ---------- */

    function buildUI() {
        buildNav();
        if (document.getElementById('bgSettingsBtn')) return;

        // 背景レイヤー
        var layer = document.createElement('div');
        layer.id = 'appBgLayer';
        var veil = document.createElement('div');
        veil.id = 'appBgVeil';
        document.body.appendChild(layer);
        document.body.appendChild(veil);

        // 下部に固定バーがあるページ（watashi.html）はボタンを上にずらす
        if (document.querySelector('.savebar')) {
            document.body.classList.add('has-savebar');
        }

        // 設定ボタン
        var btn = document.createElement('button');
        btn.id = 'bgSettingsBtn';
        btn.type = 'button';
        btn.title = '背景を変える';
        btn.setAttribute('aria-label', '背景を変える');
        btn.textContent = '🖼';
        document.body.appendChild(btn);

        // 設定パネル
        var overlay = document.createElement('div');
        overlay.id = 'bgSettingsOverlay';
        overlay.hidden = true;
        overlay.innerHTML = [
            '<div class="bg-sheet" role="dialog" aria-modal="true" aria-label="背景の設定">',
            '  <h2>背景の設定</h2>',
            '  <p class="bg-desc">スマホの写真を背景にできます。設定はこの端末にだけ保存され、全ページ（手帳・ごはん・ヒトミ・解析）で使われます。</p>',
            '  <div class="bg-preview" id="bgPreview">写真は未設定です</div>',
            '  <input type="file" id="bgFileInput" accept="image/*">',
            '  <button type="button" class="bg-btn primary" id="bgPickBtn">📷 写真を選ぶ</button>',
            '  <div class="bg-row">',
            '    <label class="bg-label" for="bgBlurRange">背景のぼかし <span id="bgBlurValue"></span></label>',
            '    <input type="range" id="bgBlurRange" min="0" max="24" step="1">',
            '  </div>',
            '  <div class="bg-row">',
            '    <label class="bg-label" for="bgVeilRange">白のベール（文字の読みやすさ） <span id="bgVeilValue"></span></label>',
            '    <input type="range" id="bgVeilRange" min="0" max="80" step="1">',
            '  </div>',
            '  <button type="button" class="bg-btn danger" id="bgResetBtn">背景写真を削除して既定に戻す</button>',
            '  <button type="button" class="bg-btn" id="bgCloseBtn">閉じる</button>',
            '  <p class="bg-note">※ 写真は縮小してこの端末に保存されます。他の端末には引き継がれません。</p>',
            '</div>'
        ].join('\n');
        document.body.appendChild(overlay);

        var fileInput = overlay.querySelector('#bgFileInput');
        var pickBtn = overlay.querySelector('#bgPickBtn');
        var blurRange = overlay.querySelector('#bgBlurRange');
        var veilRange = overlay.querySelector('#bgVeilRange');
        var blurValue = overlay.querySelector('#bgBlurValue');
        var veilValue = overlay.querySelector('#bgVeilValue');
        var preview = overlay.querySelector('#bgPreview');
        var resetBtn = overlay.querySelector('#bgResetBtn');
        var closeBtn = overlay.querySelector('#bgCloseBtn');

        function syncPanel() {
            blurRange.value = String(settings.blur);
            veilRange.value = String(Math.round(settings.veil * 100));
            blurValue.textContent = settings.blur + 'px';
            veilValue.textContent = Math.round(settings.veil * 100) + '%';
            if (settings.image) {
                preview.classList.add('has-image');
                preview.textContent = '';
            } else {
                preview.classList.remove('has-image');
                preview.textContent = '写真は未設定です';
            }
        }

        function openPanel() {
            syncPanel();
            overlay.hidden = false;
        }
        function closePanel() { overlay.hidden = true; }

        btn.addEventListener('click', openPanel);
        closeBtn.addEventListener('click', closePanel);
        overlay.addEventListener('click', function (ev) {
            if (ev.target === overlay) closePanel();
        });
        document.addEventListener('keydown', function (ev) {
            if (ev.key === 'Escape' && !overlay.hidden) closePanel();
        });

        pickBtn.addEventListener('click', function () { fileInput.click(); });

        fileInput.addEventListener('change', function () {
            var file = fileInput.files && fileInput.files[0];
            if (!file) return;
            pickBtn.disabled = true;
            pickBtn.textContent = '⏳ 読み込み中...';
            Promise.resolve(shrinkFile(file))
                .then(function (source) {
                    var ok = storeImage(source);
                    if (source.close) { try { source.close(); } catch (e) {} }
                    if (!ok) {
                        window.alert('画像を保存できませんでした。端末の保存容量が不足している可能性があります。もう少し小さい写真をお試しください。');
                        return;
                    }
                    applySettings();
                    syncPanel();
                })
                .catch(function (err) {
                    window.alert('画像を読み込めませんでした。' + (err && err.message ? '\n' + err.message : ''));
                })
                .then(function () {
                    pickBtn.disabled = false;
                    pickBtn.textContent = '📷 写真を選ぶ';
                    fileInput.value = '';
                });
        });

        blurRange.addEventListener('input', function () {
            settings.blur = Number(blurRange.value);
            blurValue.textContent = settings.blur + 'px';
            applySettings();
        });
        blurRange.addEventListener('change', function () { saveSettings(settings); });

        veilRange.addEventListener('input', function () {
            settings.veil = Number(veilRange.value) / 100;
            veilValue.textContent = Number(veilRange.value) + '%';
            applySettings();
        });
        veilRange.addEventListener('change', function () { saveSettings(settings); });

        resetBtn.addEventListener('click', function () {
            settings = Object.assign({}, DEFAULTS);
            saveSettings(settings);
            applySettings();
            syncPanel();
        });

        syncPanel();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', buildUI);
    } else {
        buildUI();
    }
})();
