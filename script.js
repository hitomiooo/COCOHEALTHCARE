// グローバル変数として、現在フォームに表示されている写真データを保持
let currentPhotoData = null;

// ページの読み込みが完了した時の処理
document.addEventListener('DOMContentLoaded', function() {
    // 1. イベントリスナーを設定
    document.getElementById('healthForm').addEventListener('submit', handleFormSubmit);
    document.getElementById('date').addEventListener('change', handleDateChange);
    document.getElementById('dogPhoto').addEventListener('change', handlePhotoPreview);
    document.getElementById('deleteButton').addEventListener('click', deleteCurrentRecord);

    // 2. 日付フィールドに今日の日付をセット
    const todayString = getFormattedDate(new Date());
    document.getElementById('date').value = todayString;

    // 3. 全記録リストを読み込む
    loadAllRecordsList();
    
    // 4. 今日のデータをフォームに読み込む
    loadRecordForDate(todayString);
});

/**
 * 日付オブジェクトを "YYYY-MM-DD" 形式の文字列に変換
 */
function getFormattedDate(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

/**
 * 日付が変更されたときに、その日のデータを読み込む
 */
function handleDateChange(event) {
    const dateString = event.target.value;
    loadRecordForDate(dateString);
}

/**
 * 写真が選択されたときにプレビューを表示（★圧縮処理を追加）
 */
async function handlePhotoPreview(event) {
    const file = event.target.files[0];
    const photoPreview = document.getElementById('photoPreview');
    
    if (file) {
        photoPreview.innerHTML = '🔄 圧縮中...'; // 処理中メッセージ
        try {
            // ★画像をリサイズ・圧縮してからBase64に変換
            currentPhotoData = await resizeAndEncode(file, 800, 0.7); // 最大800px, 品質70%
            
            const img = document.createElement('img');
            img.src = currentPhotoData;
            photoPreview.innerHTML = ''; // "圧縮中"を消去
            photoPreview.appendChild(img);
        } catch (error) {
            console.error("写真の処理中にエラー:", error);
            photoPreview.innerHTML = '⚠️ 写真の読み込みに失敗';
            currentPhotoData = null;
        }
    } else {
        // ファイル選択がキャンセルされた場合（何もしない、元の写真データを保持）
        // フォームクリア時に currentPhotoData は null になる
    }
}

/**
 * フォームの「記録する」ボタンが押されたときの処理（★エラー処理と二重送信防止を追加）
 */
async function handleFormSubmit(event) {
    event.preventDefault(); // デフォルトの送信をキャンセル

    const saveButton = document.getElementById('saveButton');
    saveButton.disabled = true; // ボタンを無効化
    saveButton.textContent = '保存中...';

    try {
        const existingId = document.getElementById('recordId').value;
        const date = document.getElementById('date').value;

        // currentPhotoData は handlePhotoPreview で
        // 既にリサイズ・エンコードされて設定されている

        // 1. フォームからデータを取得
        const record = {
            id: existingId ? parseInt(existingId) : Date.now(),
            date: date,
            weather: document.getElementById('weather').value,
            poopCount: document.getElementById('poopCount').value,
            poopQuality: document.getElementById('poopQuality').value,
            peeCount: document.getElementById('peeCount').value,
            peeColor: document.getElementById('peeColor').value,
            appetiteMorning: document.getElementById('appetiteMorning').value,
            appetiteNoon: document.getElementById('appetiteNoon').value,
            appetiteNight: document.getElementById('appetiteNight').value,
            sleepTime: document.getElementById('sleepTime').value,
            walk: document.getElementById('walk').value,
            otherNotes: document.getElementById('otherNotes').value,
            dogPhoto: currentPhotoData // リサイズ済みの写真データ
        };

        // 2. 全データを取得
        const records = getAllRecords();

        if (existingId) {
            // --- 更新処理 ---
            const index = records.findIndex(r => r.id == existingId);
            if (index !== -1) {
                records[index] = record;
            }
        } else {
            // --- 新規作成処理 ---
            const existingRecord = records.find(r => r.date === date);
            if (existingRecord) {
                alert("エラー: その日付の記録は既に存在します。フォームは既存のデータを読み込みます。");
                loadRecordForDate(date);
                return; // finallyブロックは実行される
            }
            records.unshift(record);
        }

        // 3. データを保存 (★ここで容量オーバーエラーが起きる可能性がある)
        saveAllRecords(records);
        
        // 4. リストを再読み込み
        loadAllRecordsList();
        
        // 5. フォームの状態を「更新完了」状態にする
        loadRecordForDate(date);
        
        alert("記録を保存しました。");

    } catch (error) {
        // ★エラー処理
        console.error("保存中にエラーが発生しました:", error);
        if (error.name === 'QuotaExceededError') {
            alert("保存に失敗しました。\n\n写真が多すぎるか、ブラウザの保存容量（約5MB）の上限に達しました。\n\n古い記録をいくつか削除してください。");
        } else {
            alert("不明なエラーが発生しました: " + error.message);
        }
    } finally {
        // ★成功しても失敗しても、ボタンを元に戻す
        saveButton.disabled = false;
        // ボタンのテキストは loadRecordForDate によって '記録する' または '記録を更新する' に戻される
    }
}

/**
 * 指定された日付のデータをフォームに読み込む
 */
function loadRecordForDate(dateString) {
    const records = getAllRecords();
    const record = records.find(r => r.date === dateString);

    if (record) {
        // --- データが見つかった場合 (編集モード) ---
        populateForm(record);
        document.getElementById('saveButton').textContent = '記録を更新する';
        document.getElementById('deleteButton').style.display = 'block';
    } else {
        // --- データが見つからない場合 (新規モード) ---
        clearForm(dateString); // 日付だけセットして他はクリア
        document.getElementById('saveButton').textContent = '記録する';
        document.getElementById('deleteButton').style.display = 'none';
    }
}

/**
 * リスト項目がクリックされたときに、そのIDのデータを読み込む
 */
function loadRecordById(id) {
    const records = getAllRecords();
    const record = records.find(r => r.id === id);

    if (record) {
        document.getElementById('date').value = record.date; // 日付ピッカーも連動
        populateForm(record);
        document.getElementById('saveButton').textContent = '記録を更新する';
        document.getElementById('deleteButton').style.display = 'block';
        window.scrollTo(0, 0); // ページ上部のフォームにスクロール
    }
}

/**
 * フォームを指定されたレコードデータで埋める
 */
function populateForm(record) {
    document.getElementById('recordId').value = record.id;
    document.getElementById('weather').value = record.weather;
    document.getElementById('poopCount').value = record.poopCount;
    document.getElementById('poopQuality').value = record.poopQuality;
    document.getElementById('peeCount').value = record.peeCount;
    document.getElementById('peeColor').value = record.peeColor;
    document.getElementById('appetiteMorning').value = record.appetiteMorning;
    document.getElementById('appetiteNoon').value = record.appetiteNoon;
    document.getElementById('appetiteNight').value = record.appetiteNight;
    document.getElementById('sleepTime').value = record.sleepTime;
    document.getElementById('walk').value = record.walk;
    document.getElementById('otherNotes').value = record.otherNotes;

    // 写真
    currentPhotoData = record.dogPhoto || null;
    const photoPreview = document.getElementById('photoPreview');
    photoPreview.innerHTML = '';
    if (currentPhotoData) {
        const img = document.createElement('img');
        img.src = currentPhotoData;
        photoPreview.appendChild(img);
    }
    document.getElementById('dogPhoto').value = ""; // ファイル選択欄はリセット
}

/**
 * フォームをクリアする (日付は保持)
 */
function clearForm(dateString) {
    document.getElementById('recordId').value = '';
    document.getElementById('date').value = dateString; // 日付はクリアしない
    document.getElementById('weather').value = '☀️';
    document.getElementById('poopCount').value = 0;
    document.getElementById('poopQuality').value = '良い';
    document.getElementById('peeCount').value = 0;
    document.getElementById('peeColor').value = '薄い';
    document.getElementById('appetiteMorning').value = '完食';
    document.getElementById('appetiteNoon').value = '完食';
    document.getElementById('appetiteNight').value = '完食';
    document.getElementById('sleepTime').value = 8;
    document.getElementById('walk').value = '行ってない';
    document.getElementById('otherNotes').value = '';
    
    currentPhotoData = null;
    document.getElementById('photoPreview').innerHTML = '';
    document.getElementById('dogPhoto').value = "";
}

/**
 * 現在フォームで編集中の記録を削除する
 */
function deleteCurrentRecord() {
    const idToDelete = document.getElementById('recordId').value;
    if (!idToDelete) {
        alert("削除する記録がありません。");
        return;
    }

    if (!confirm('本当にこの日の記録を削除しますか？')) {
        return; // キャンセルされたら何もしない
    }

    const records = getAllRecords();
    const newRecords = records.filter(r => r.id != idToDelete);
    
    saveAllRecords(newRecords);
    loadAllRecordsList();

    // フォームをクリア（今日の日付に戻す）
    const todayString = getFormattedDate(new Date());
    document.getElementById('date').value = todayString;
    loadRecordForDate(todayString); // 今日のデータを読み込み直す
    
    alert("記録を削除しました。");
}


// --- データ保存・読み込み (LocalStorage) ---

/**
 * LocalStorageから全データを取得
 */
function getAllRecords() {
    return JSON.parse(localStorage.getItem('dogHealthRecords') || '[]');
}

/**
 * LocalStorageに全データを保存
 */
function saveAllRecords(records) {
    // 日付の降順（新しい順）にソートしてから保存
    records.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    // ★ここで "QuotaExceededError" が発生する可能性がある
    localStorage.setItem('dogHealthRecords', JSON.stringify(records));
}

/**
 * LocalStorageからデータを読み込み、画面下の「これまでの記録」リストを生成する
 */
function loadAllRecordsList() {
    const records = getAllRecords();
    const recordListDiv = document.getElementById('recordList');
    recordListDiv.innerHTML = '';

    if (records.length === 0) {
        recordListDiv.innerHTML = '<p>まだ記録がありません。</p>';
        return;
    }

    records.forEach(record => {
        const recordItem = document.createElement('div');
        recordItem.className = 'record-item';
        recordItem.onclick = () => loadRecordById(record.id);

        const formattedDate = new Date(record.date).toLocaleDateString('ja-JP');

        recordItem.innerHTML = `
            <h4>${formattedDate} ${record.weather}</h4>
            ${record.dogPhoto ? `<div class="record-photo"><img src="${record.dogPhoto}" alt="わんこ"></div>` : ''}
            <p><strong>お通じ:</strong> ${record.poopCount}回 (${record.poopQuality})</p>
            <p><strong>おしっこ:</strong> ${record.peeCount}回 (${record.peeColor})</p>
            <p><strong>食欲:</strong> 朝:${record.appetiteMorning} 昼:${record.appetiteNoon} 晩:${record.appetiteNight}</p>
            <p><strong>散歩:</strong> ${record.walk}</p>
            ${record.otherNotes ? `<p><strong>メモ:</strong> ${record.otherNotes.replace(/\n/g, '<br>')}</p>` : ''}
        `;
        recordListDiv.appendChild(recordItem);
    });
}


/**
 * ★★★ 新しい関数 ★★★
 * ファイルをリサイズ・圧縮してBase64エンコードされた文字列に変換する
 * @param {File} file - 変換するファイル
 * @param {number} maxSize - 最大の幅または高さ (px)
 * @param {number} quality - 画質 (0.0 〜 1.0)
 * @returns {Promise<string>} 圧縮されたBase64文字列
 */
function resizeAndEncode(file, maxSize = 800, quality = 0.7) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(event) {
            const img = new Image();
            img.onload = function() {
                let width = img.width;
                let height = img.height;

                // アスペクト比を維持しつつリサイズ
                if (width > height) {
                    if (width > maxSize) {
                        height *= maxSize / width;
                        width = maxSize;
                    }
                } else {
                    if (height > maxSize) {
                        width *= maxSize / height;
                        height = maxSize;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // JPEG形式、指定された品質でBase64に変換
                const dataUrl = canvas.toDataURL('image/jpeg', quality);
                resolve(dataUrl);
            };
            img.onerror = reject;
            img.src = event.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}
