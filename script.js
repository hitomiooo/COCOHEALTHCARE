// ページの読み込みが完了したら、保存された記録を読み込む
document.addEventListener('DOMContentLoaded', loadRecords);

// フォームの送信イベントを監視
document.getElementById('healthForm').addEventListener('submit', function(event) {
    // フォームのデフォルトの送信動作をキャンセル
    event.preventDefault(); 
    
    // 1. フォームからデータを取得する
    const record = {
        id: Date.now(), // 削除や編集のためのユニークID
        date: document.getElementById('date').value,
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
    };

    // 2. データを保存する
    saveRecord(record);

    // 3. 記録リストを再読み込みする
    loadRecords();

    // 4. フォームをリセットする (日付以外)
    // ※日付は翌日のために保持しておくと便利な場合もあるので、ここではリセットしない
    // document.getElementById('healthForm').reset();
    document.getElementById('poopCount').value = 0;
    document.getElementById('peeCount').value = 0;
    document.getElementById('otherNotes').value = "";
});

/**
 * データをブラウザ(localStorage)に保存する関数
 * @param {object} record - 保存する記録オブジェクト
 */
function saveRecord(record) {
    // 既に保存されているデータを取得 (JSON文字列からJavaScript配列に変換)
    // データがなければ空の配列 '[]' を使う
    const records = JSON.parse(localStorage.getItem('dogHealthRecords') || '[]');
    
    // 新しい記録を配列の先頭に追加
    records.unshift(record);

    // JavaScript配列をJSON文字列に変換してlocalStorageに保存
    localStorage.setItem('dogHealthRecords', JSON.stringify(records));
}

/**
 * localStorageからデータを読み込み、画面に表示する関数
 */
function loadRecords() {
    const records = JSON.parse(localStorage.getItem('dogHealthRecords') || '[]');
    const recordListDiv = document.getElementById('recordList');

    // 表示エリアをクリア
    recordListDiv.innerHTML = '';

    if (records.length === 0) {
        recordListDiv.innerHTML = '<p>まだ記録がありません。</p>';
        return;
    }

    // 取得した記録を一件ずつループしてHTMLを生成
    records.forEach(record => {
        const recordItem = document.createElement('div');
        recordItem.className = 'record-item'; // CSSでスタイルを適用するため

        // 日付を「YYYY/MM/DD」形式にフォーマット
        const formattedDate = new Date(record.date).toLocaleDateString('ja-JP');

        recordItem.innerHTML = `
            <h4>${formattedDate} ${record.weather}</h4>
            <p><strong>お通じ:</strong> ${record.poopCount}回 (${record.poopQuality})</p>
            <p><strong>おしっこ:</strong> ${record.peeCount}回 (${record.peeColor})</p>
            <p><strong>食欲:</strong> 朝:${record.appetiteMorning} 昼:${record.appetiteNoon} 晩:${record.appetiteNight}</p>
            <p><strong>睡眠:</strong> ${record.sleepTime} 時間</p>
            <p><strong>散歩:</strong> ${record.walk}</p>
            ${record.otherNotes ? `<p><strong>メモ:</strong> ${record.otherNotes.replace(/\n/g, '<br>')}</p>` : ''}
        `;
        
        recordListDiv.appendChild(recordItem);
    });
}