// === Firebase SDKモジュールをインポート ===
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { 
    getFirestore, collection, addDoc, getDocs, doc, 
    updateDoc, deleteDoc, query, orderBy, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
// ★ 認証モジュール (signInWithPopup)
import {
    getAuth,
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup, // ポップアップ方式
    signOut
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";


// === Firebase 設定 (ここで置き換える) ===
const firebaseConfig = {
  apiKey: "AIzaSyDCwPw3WxwYHvaudHqYJ64RzhS4hWhKvO0",
  authDomain: "coco-healthcare-59401.firebaseapp.com",
  projectId: "coco-healthcare-59401",
  storageBucket: "coco-healthcare-59401.firebasestorage.app",
  messagingSenderId: "986920233821",
  appId: "1:986920233821:web:96ff08e9f118d557a816b4"
    
};

// ★★★=================================================★★★
// ★★★    ここを編集！ アクセスを許可する人の       ★★★
// ★★★    Googleメールアドレスをカンマ(,)区切りで入力 ★★★
// ★★★=================================================★★★
const ALLOWED_EMAIL_LIST = [
    'fine2025contact@gmail.com',
    '1103ohtm@gmail.com',
    'tatsuya51801736@gmail.com'
];
// ★★★=================================================★★★


// === Firebase の初期化 ===
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app); 
const recordsCollection = collection(db, 'records');

// === グローバル変数 ===
let currentPhotoBase64 = null; // Base64文字列を保持
let allRecordsCache = [];
let currentUser = null; 

// === HTML要素 ===
const mainContent = document.getElementById('mainContent');
const authSection = document.getElementById('authSection');
const authStatus = document.getElementById('authStatus');
const loginButton = document.getElementById('loginButton');
const logoutButton = document.getElementById('logoutButton');


// ★★★ 認証ロジック ★★★

// ログイン状態を監視する
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        if (ALLOWED_EMAIL_LIST.includes(user.email)) {
            showApp(user);
        } else {
            showAccessDenied(user);
        }
    } else {
        currentUser = null;
        showLoginScreen();
    }
});

// ログインボタンの処理 (ポップアップ方式)
loginButton.addEventListener('click', () => {
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider)
        .then((result) => {
            console.log("ポップアップログイン成功:", result.user.email);
        })
        .catch((error) => {
            console.error("ポップアップログイン失敗:", error);
            if (error.code === 'auth/popup-closed-by-user') {
                alert("ログインがキャンセルされました。");
            } else {
                alert("ログインに失敗しました: " + error.message);
            }
        });
});

// ログアウトボタン
logoutButton.addEventListener('click', () => {
    signOut(auth);
});

function showLoginScreen() {
    mainContent.style.display = 'none';
    authSection.style.display = 'block';
    authStatus.textContent = 'アプリを使うにはログインしてください。';
    loginButton.style.display = 'block';
    logoutButton.style.display = 'none';
}
function showAccessDenied(user) {
    mainContent.style.display = 'none';
    authSection.style.display = 'block';
    authStatus.innerHTML = `ようこそ、 ${user.displayName} さん<br><strong>(${user.email})</strong><br>このアカウントはアクセスが許可されていません。`;
    loginButton.style.display = 'none';
    logoutButton.style.display = 'block';
}
function showApp(user) {
    mainContent.style.display = 'block';
    authSection.style.display = 'block'; 
    authStatus.innerHTML = `ようこそ、 ${user.displayName} さん<br><strong>(${user.email})</strong>`;
    loginButton.style.display = 'none';
    logoutButton.style.display = 'block';
    initializeAppLogic();
}

// ★★★ アプリ本体のロジック ★★★
let appInitialized = false;
function initializeAppLogic() {
    if (appInitialized) return;
    appInitialized = true;

    // フォームのイベントリスナー
    document.getElementById('healthForm').addEventListener('submit', handleFormSubmit);
    document.getElementById('date').addEventListener('change', handleDateChange);
    document.getElementById('dogPhoto').addEventListener('change', handlePhotoPreview);
    document.getElementById('deleteButton').addEventListener('click', deleteCurrentRecord);
    
    // ★ スタンプ機能のイベントリスナーを追加 ★
    document.getElementById('stampPad').addEventListener('click', handleStampClick);

    const todayString = getFormattedDate(new Date());
    document.getElementById('date').value = todayString;
    loadAllRecordsFromFirestore();
}

function getFormattedDate(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function handleDateChange(event) {
    loadRecordForDate(event.target.value);
}

/**
 * ★★★ スタンプボタンが押されたときの処理 ★★★
 * (ここが追加された関数です)
 */
function handleStampClick(event) {
    // クリックされたのが .stamp-btn クラスのボタンか確認
    if (event.target.classList.contains('stamp-btn')) {
        const stamp = event.target.textContent; // ボタンの絵文字を取得
        const memoTextArea = document.getElementById('otherNotes');
        
        // テキストエリアの現在のカーソル位置を取得
        const cursorPos = memoTextArea.selectionStart;
        const textBefore = memoTextArea.value.substring(0, cursorPos);
        const textAfter = memoTextArea.value.substring(cursorPos);
        
        // カーソル位置にスタンプを挿入
        memoTextArea.value = textBefore + stamp + textAfter;
        
        // スタンプ挿入後にカーソル位置をスタンプの直後に移動
        const newPos = cursorPos + stamp.length;
        memoTextArea.selectionStart = newPos;
        memoTextArea.selectionEnd = newPos;
        
        // テキストエリアにフォーカスを戻す
        memoTextArea.focus();
    }
}


/**
 * 写真プレビュー (Base64に変換)
 */
async function handlePhotoPreview(event) {
    const file = event.target.files[0];
    const photoPreview = document.getElementById('photoPreview');
    
    if (file) {
        photoPreview.innerHTML = '🔄 圧縮中...';
        try {
            currentPhotoBase64 = await resizeAndEncode(file, 300, 0.4); 
            
            const img = document.createElement('img');
            img.src = currentPhotoBase64;
            photoPreview.innerHTML = '';
            photoPreview.appendChild(img);
        } catch (error) {
            console.error("写真の処理中にエラー:", error);
            photoPreview.innerHTML = '⚠️ 写真の読み込みに失敗';
            currentPhotoBase64 = null;
        }
    }
}

/**
 * フォーム送信 (新項目対応)
 */
async function handleFormSubmit(event) {
    event.preventDefault(); 
    const saveButton = document.getElementById('saveButton');
    toggleLoading(true, '保存中...');

    try {
        const existingId = document.getElementById('recordId').value;
        const date = document.getElementById('date').value;

        let photoData = currentPhotoBase64;
        if (!photoData && existingId) {
            const existingRecord = allRecordsCache.find(r => r.id === existingId);
            if (existingRecord) {
                photoData = existingRecord.dogPhotoBase64 || null;
            }
        }

        const recordData = {
            date: date,
            weather: document.getElementById('weather').value,
            temperatureFeel: document.getElementById('temperatureFeel').value,
            conditionCoco: document.getElementById('conditionCoco').value,
            conditionNono: document.getElementById('conditionNono').value,
            conditionMomo: document.getElementById('conditionMomo').value,
            medPimo: document.getElementById('medPimo').checked,
            medLactu: document.getElementById('medLactu').checked,
            medConseve: document.getElementById('medConseve').checked,
            poopMorning: document.getElementById('poopMorning').checked,
            poopEvening: document.getElementById('poopEvening').checked,
            poopNight: document.getElementById('poopNight').checked,
            peeCount: document.getElementById('peeCount').value,
            peeColor: document.getElementById('peeColor').value,
            appetiteMorning: document.getElementById('appetiteMorning').value,
            appetiteNoon: document.getElementById('appetiteNoon').value,
            appetiteNight: document.getElementById('appetiteNight').value,
            sleepTime: document.getElementById('sleepTime').value,
            walk: document.getElementById('walk').value,
            otherNotes: document.getElementById('otherNotes').value,
            dogPhotoBase64: photoData,
            updatedAt: serverTimestamp(),
            ownerEmail: currentUser.email 
        };

        if (existingId) {
            const docRef = doc(db, 'records', existingId);
            await updateDoc(docRef, recordData);
        } else {
            const existingRecord = allRecordsCache.find(r => r.date === date);
            if (existingRecord) {
                alert("エラー: その日付の記録は既に存在します。フォームを更新します。");
                loadRecordForDate(date);
                return;
            }
            await addDoc(recordsCollection, recordData);
        }
        
        alert("記録を保存しました。");
        await loadAllRecordsFromFirestore();
        loadRecordForDate(date); 

    } catch (error) {
        console.error("保存中にエラーが発生しました:", error);
        alert("保存に失敗しました: " + error.message);
    } finally {
        toggleLoading(false);
    }
}

/**
 * Firestoreから読み込み (新項目対応アコーディオン)
 */
async function loadAllRecordsFromFirestore() {
    if (!currentUser) return; 

    const recordListDiv = document.getElementById('recordList');
    recordListDiv.innerHTML = '<p>🔄 データを読み込み中...</p>';
    
    try {
        const q = query(recordsCollection, orderBy('date', 'desc'));
        const querySnapshot = await getDocs(q);
        
        allRecordsCache = []; 
        recordListDiv.innerHTML = ''; 

        if (querySnapshot.empty) {
            recordListDiv.innerHTML = '<p>まだ記録がありません。</p>';
            return;
        }

        querySnapshot.forEach(doc => {
            const record = doc.data();
            const id = doc.id;
            
            allRecordsCache.push({ id, ...record });

            const recordItem = document.createElement('div');
            recordItem.className = 'record-item';

            const formattedDate = new Date(record.date).toLocaleDateString('ja-JP');
            
            let conditionStr = `ココ:${record.conditionCoco || '○'} | ノノ:${record.conditionNono || '○'} | モモ:${record.conditionMomo || '○'}`;
            
            let poopStr = [
                record.poopMorning ? '朝' : '',
                record.poopEvening ? '夕' : '',
                record.poopNight ? '夜' : ''
            ].filter(Boolean).join(', ') || 'なし';

            let medStr = [
                record.medPimo ? 'ピモベハート' : '',
                record.medLactu ? 'ラクツロース' : '',
                record.medConseve ? 'コンセーブ' : ''
            ].filter(Boolean).join(', ') || 'なし';

            recordItem.innerHTML = `
                <div class="record-header">
                    <h4>${formattedDate} ${record.weather} (体感:${record.temperatureFeel || '?'})</h4>
                    <span class="toggle-icon">▼</span>
                </div>
                <div class="record-body">
                    <p><strong>体調:</strong> ${conditionStr}</p>
                    <p><strong>お通じ:</strong> ${poopStr}</p>
                    <p><strong>服用薬:</strong> ${medStr}</p>
                    <hr>
                    <p><strong>おしっこ:</strong> ${record.peeCount}回 (${record.peeColor})</p>
                    <p><strong>食欲:</strong> 朝:${record.appetiteMorning} 昼:${record.appetiteNoon} 晩:${record.appetiteNight}</p>
                    <p><strong>睡眠:</strong> ${record.sleepTime}</p>
                    <p><strong>散歩:</strong> ${record.walk}</p>
                    ${record.otherNotes ? `<p><strong>メモ:</strong> ${record.otherNotes.replace(/\n/g, '<br>')}</p>` : ''}
                    ${record.dogPhotoBase64 ? `<div class="record-photo"><img src="${record.dogPhotoBase64}" alt="わんこ"></div>` : ''}
                    <button class="edit-btn-small">この日を編集する</button>
                </div>
            `;
            
            const header = recordItem.querySelector('.record-header');
            const body = recordItem.querySelector('.record-body');
            const icon = recordItem.querySelector('.toggle-icon');
            
            header.onclick = () => {
                const isHidden = body.style.display === 'none' || body.style.display === '';
                if (isHidden) {
                    body.style.display = 'block';
                    icon.textContent = '▲';
                } else {
                    body.style.display = 'none';
                    icon.textContent = '▼';
                }
            };
            
            const editButton = recordItem.querySelector('.edit-btn-small');
            editButton.onclick = (e) => {
                e.stopPropagation(); 
                loadRecordById(id);
            };

            recordListDiv.appendChild(recordItem);
        });
        
        const todayString = document.getElementById('date').value;
        loadRecordForDate(todayString);

    } catch (error) {
        console.error("データ読み込みエラー:", error);
        recordListDiv.innerHTML = '<p>⚠️ データの読み込みに失敗しました。</p>';
    }
}


function loadRecordForDate(dateString) {
    const record = allRecordsCache.find(r => r.date === dateString);
    if (record) {
        populateForm(record);
        document.getElementById('saveButton').textContent = '記録を更新する';
        document.getElementById('deleteButton').style.display = 'block';
    } else {
        clearForm(dateString); 
        document.getElementById('saveButton').textContent = '記録する';
        document.getElementById('deleteButton').style.display = 'none';
    }
}

function loadRecordById(id) {
    const record = allRecordsCache.find(r => r.id === id);
    if (record) {
        document.getElementById('date').value = record.date; 
        populateForm(record);
        document.getElementById('saveButton').textContent = '記録を更新する';
        document.getElementById('deleteButton').style.display = 'block';
        window.scrollTo(0, 0); // ページ上部のフォームにスクロール
    }
}

/**
 * フォーム入力 (新項目対応)
 */
function populateForm(record) {
    document.getElementById('healthForm').reset();
    document.getElementById('recordId').value = record.id;
    document.getElementById('date').value = record.date;
    document.getElementById('weather').value = record.weather;
    
    document.getElementById('temperatureFeel').value = record.temperatureFeel || 'ちょうどいい';
    document.getElementById('conditionCoco').value = record.conditionCoco || '○';
    document.getElementById('conditionNono').value = record.conditionNono || '○';
    document.getElementById('conditionMomo').value = record.conditionMomo || '○';
    
    document.getElementById('medPimo').checked = record.medPimo === true;
    document.getElementById('medLactu').checked = record.medLactu === true;
    document.getElementById('medConseve').checked = record.medConseve === true;
    
    document.getElementById('poopMorning').checked = record.poopMorning === true;
    document.getElementById('poopEvening').checked = record.poopEvening === true;
    document.getElementById('poopNight').checked = record.poopNight === true;

    document.getElementById('peeCount').value = record.peeCount || 0;
    document.getElementById('peeColor').value = record.peeColor || '普通';
    document.getElementById('appetiteMorning').value = record.appetiteMorning || '完食';
    document.getElementById('appetiteNoon').value = record.appetiteNoon || '完食';
    document.getElementById('appetiteNight').value = record.appetiteNight || '完食';
    document.getElementById('sleepTime').value = record.sleepTime || 'ずっと寝てる';
    document.getElementById('walk').value = record.walk || '行ってない';
    document.getElementById('otherNotes').value = record.otherNotes || '';

    currentPhotoBase64 = null; 
    const photoPreview = document.getElementById('photoPreview');
    photoPreview.innerHTML = '';
    if (record.dogPhotoBase64) {
        const img = document.createElement('img');
        img.src = record.dogPhotoBase64;
        photoPreview.appendChild(img);
    }
    document.getElementById('dogPhoto').value = ""; 
}

/**
 * フォームクリア (新項目対応)
 */
function clearForm(dateString) {
    document.getElementById('healthForm').reset(); 
    document.getElementById('recordId').value = '';
    document.getElementById('date').value = dateString; 
    
    currentPhotoBase64 = null;
    document.getElementById('photoPreview').innerHTML = '';
    
    document.getElementById('temperatureFeel').value = 'ちょうどいい';
    document.getElementById('conditionCoco').value = '○';
    document.getElementById('conditionNono').value = '○';
    document.getElementById('conditionMomo').value = '○';
    document.getElementById('sleepTime').value = 'ずっと寝てる';
    
    document.getElementById('medPimo').checked = true;
    document.getElementById('medLactu').checked = true;
    document.getElementById('medConseve').checked = true;
    
    document.getElementById('poopMorning').checked = false;
    document.getElementById('poopEvening').checked = false;
    document.getElementById('poopNight').checked = false;

    document.getElementById('peeCount').value = 0;
    document.getElementById('peeColor').value = '普通';
    document.getElementById('appetiteMorning').value = '完食';
    document.getElementById('appetiteNoon').value = '完食';
    document.getElementById('appetiteNight').value = '完食';
    document.getElementById('walk').value = '行ってない';
    document.getElementById('otherNotes').value = '';
}

/**
 * 削除 (Firestoreのみ)
 */
async function deleteCurrentRecord() {
    const idToDelete = document.getElementById('recordId').value;
    if (!idToDelete) {
        alert("削除する記録がありません。");
        return;
    }
    if (!confirm('本当にこの日の記録を削除しますか？')) {
        return; 
    }
    toggleLoading(true, '削除中...');

    try {
        const docRef = doc(db, 'records', idToDelete);
        await deleteDoc(docRef);

        alert("記録を削除しました。");
        
        await loadAllRecordsFromFirestore();
        const todayString = getFormattedDate(new Date());
        document.getElementById('date').value = todayString;
        loadRecordForDate(todayString); 

    } catch (error) {
        console.error("削除中にエラー:", error);
        alert("削除に失敗しました: " + error.message);
    } finally {
        toggleLoading(false);
    }
}

/**
 * ボタンの有効/無効を切り替え
 */
function toggleLoading(isLoading, buttonText = null) {
    const saveButton = document.getElementById('saveButton');
    const deleteButton = document.getElementById('deleteButton');
    saveButton.disabled = isLoading;
    deleteButton.disabled = isLoading;
    if (buttonText) {
        saveButton.textContent = buttonText;
    } else {
        const existingId = document.getElementById('recordId').value;
        saveButton.textContent = existingId ? '記録を更新する' : '記録する';
    }
}

/**
 * 圧縮関数 (Base64を返す)
 */
function resizeAndEncode(file, maxSize = 300, quality = 0.4) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(event) {
            const img = new Image();
            img.onload = function() {
                let width = img.width;
                let height = img.height;

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
                
                // Base64文字列を返す
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
