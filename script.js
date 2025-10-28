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
 * 写真が選択されたときにプレビューを表示
 */
async function handlePhotoPreview(event) {
    const file = event.target.files[0];
    const photoPreview = document.getElementById('photoPreview');
    photoPreview.innerHTML = ''; // 既存のプレビューをクリア

    if (file) {
        currentPhotoData = await convertFileToBase64(file); // Base64に変換して保持
        const img = document.createElement('img');
        img.src = currentPhotoData;
        photoPreview.appendChild(img);
    } else {
        // 既存の写真を保持（クリアしない）
        // currentPhotoData = null; // ← ファイル未選択時に写真を消さないようにコメントアウト
    }
}

/**
 * フォームの「記録する」ボタンが押されたときの処理
 * (新規作成と更新の両方を担う)
 */
async function handleFormSubmit(event) {
    event.preventDefault(); // デフォルトの送信をキャンセル

    const existingId = document.getElementById('recordId').value;
    const date = document.getElementById('date').value;
    
    // ★写真が「選択」されていれば、それを優先する
    const photoFile = document.getElementById('dogPhoto').files[0];
    if (photoFile) {
        currentPhotoData = await convertFileToBase64(photoFile); // ファイル選択を優先
    }
    // currentPhotoData は、
    // 1. 既存データ読み込み時のデータ
    // 2. 新規ファイル選択時のデータ
    // のどちらかが入っている

    // 1. フォームからデータを取得
    const record = {
        id: existingId ? parseInt(existingId) : Date.now(), // 既存IDがあればそれを使う
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
        dogPhoto: currentPhotoData // プレビュー中の写真データ
    };

    // 2. 全データを取得
    const records = getAllRecords();

    if (existingId) {
        // --- 更新処理 ---
        const index = records.findIndex(r => r.id == existingId);
        if (index !== -1) {
            records[index] = record; // 既存のデータを上書き
        }
    } else {
        // --- 新規作成処理 ---
        // 同じ日付のデータが既にないか確認（多重登録防止）
        const existingRecord = records.find(r => r.date === date);
        if (existingRecord) {
            alert("エラー: その日付の記録は既に存在します。フォームは既存のデータを読み込みます。");
            loadRecordForDate(date); // 既存データを読み込む
            return;
        }
        records.unshift(record); // 配列の先頭に追加
    }

    // 3. データを保存
    saveAllRecords(records);

    // 4. リストを再読み込み
    loadAllRecordsList();
    
    // 5. フォームの状態を「更新完了」状態にする
    loadRecordForDate(date);
    
    alert("記録を保存しました。");
}

/**
 * 指定された日付のデータをフォームに読み込む
 * @param {string} dateString - "YYYY-MM-DD"
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
 * @param {number} id - レコードID
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
 * @param {object} record 
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
 * @param {string} dateString - 保持する日付
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
 * @returns {Array} 記録の配列
 */
function getAllRecords() {
    return JSON.parse(localStorage.getItem('dogHealthRecords') || '[]');
}

/**
 * LocalStorageに全データを保存
 * @param {Array} records 記録の配列
 */
function saveAllRecords(records) {
    // 日付の降順（新しい順）にソートしてから保存
    records.sort((a, b) => new Date(b.date) - new Date(a.date));
    localStorage.setItem('dogHealthRecords', JSON.stringify(records));
}

/**
 * LocalStorageからデータを読み込み、画面下の「これまでの記録」リストを生成する
 */
function loadAllRecordsList() {
    const records = getAllRecords(); // 日付順にソート済みのデータを取得
    const recordListDiv = document.getElementById('recordList');
    recordListDiv.innerHTML = '';

    if (records.length === 0) {
        recordListDiv.innerHTML = '<p>まだ記録がありません。</p>';
        return;
    }

    records.forEach(record => {
        const recordItem = document.createElement('div');
        recordItem.className = 'record-item';
        
        // ★クリックで編集フォームに読み込む機能を追加
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
 * ファイルをBase64エンコードされた文字列に変換する
 * @param {File} file
 * @returns {Promise<string>} Base64文字列
 */
function convertFileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
}
