// === Firebase SDKモジュールをインポート ===
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { 
    getFirestore, collection, addDoc, getDocs, doc, 
    updateDoc, deleteDoc, query, orderBy, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
import { 
    getStorage, ref, uploadBytes, getDownloadURL, 
    deleteObject 
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-storage.js";
// ★ 認証モジュールをインポート
import {
    getAuth,
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithRedirect,
    signOut
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";


// === Firebase 設定 (あなたの設定に置き換え済みのはず) ===
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// ★★★=================================================★★★
// ★★★    ここを編集！ アクセスを許可する人の       ★★★
// ★★★    Googleメールアドレスをカンマ(,)区切りで入力 ★★★
// ★★★=================================================★★★
const ALLOWED_EMAIL_LIST = [
    "fine2025contact@gmail.com", // ★ あなた自身のメアド
    "ohtm1103@yahoo.co.jp",  // ★ 許可したい人のメアド
    "1103ohtm@gmail.com"    // ★ 許可したい人のメアド
];
// ★★★=================================================★★★


// === Firebase の初期化 ===
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app); // ★ 認証を初期化
const recordsCollection = collection(db, 'records');

// === グローバル変数 ===
let currentPhotoFile = null;
let existingPhotoUrl = null;
let allRecordsCache = [];
let currentUser = null; // ★ ログイン中のユーザー情報

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
        // --- ログインしている ---
        currentUser = user;
        
        // ★ 許可リストにいるかチェック
        if (ALLOWED_EMAIL_LIST.includes(user.email)) {
            // 許可されたユーザー
            showApp(user);
        } else {
            // 許可されていないユーザー
            showAccessDenied(user);
        }
    } else {
        // --- ログアウトしている ---
        currentUser = null;
        showLoginScreen();
    }
});

// Googleログインボタンが押されたとき
loginButton.addEventListener('click', () => {
    const provider = new GoogleAuthProvider();
    signInWithRedirect(auth, provider); // Googleログイン画面にリダイレクト
});

// ログアウトボタンが押されたとき
logoutButton.addEventListener('click', () => {
    signOut(auth);
});

// 状態1: ログイン画面の表示
function showLoginScreen() {
    mainContent.style.display = 'none';
    authSection.style.display = 'block';
    authStatus.textContent = 'アプリを使うにはログインしてください。';
    loginButton.style.display = 'block';
    logoutButton.style.display = 'none';
}

// 状態2: アクセス拒否画面の表示
function showAccessDenied(user) {
    mainContent.style.display = 'none';
    authSection.style.display = 'block';
    authStatus.innerHTML = `ようこそ、 ${user.displayName} さん<br>
                        <strong>(${user.email})</strong><br>
                        このアカウントはアクセスが許可されていません。`;
    loginButton.style.display = 'none';
    logoutButton.style.display = 'block';
}

// 状態3: アプリ本体の表示 (許可されたユーザー)
function showApp(user) {
    mainContent.style.display = 'block';
    authSection.style.display = 'block'; // 認証セクションも表示したまま
    authStatus.innerHTML = `ようこそ、 ${user.displayName} さん<br>
                        <strong>(${user.email})</strong>`;
    loginButton.style.display = 'none';
    logoutButton.style.display = 'block';
    
    // ★ 認証成功後に初めてデータを読み込む
    initializeAppLogic();
}

// ★★★ アプリ本体のロジック ★★★

// (認証成功後に一度だけ実行する)
let appInitialized = false;
function initializeAppLogic() {
    if (appInitialized) return; // 既に初期化済みなら何もしない
    appInitialized = true;

    // イベントリスナーを設定
    document.getElementById('healthForm').addEventListener('submit', handleFormSubmit);
    document.getElementById('date').addEventListener('change', handleDateChange);
    document.getElementById('dogPhoto').addEventListener('change', handlePhotoPreview);
    document.getElementById('deleteButton').addEventListener('click', deleteCurrentRecord);

    const todayString = getFormattedDate(new Date());
    document.getElementById('date').value = todayString;

    // Firebaseから全データを読み込む
    loadAllRecordsFromFirestore();
}

// (↓... handleFormSubmit, loadAllRecordsFromFirestore などの
//    以前のコードはすべてそのまま流用します ...)


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
 * 写真が選択されたときにプレビューを表示（圧縮処理）
 */
async function handlePhotoPreview(event) {
    const file = event.target.files[0];
    const photoPreview = document.getElementById('photoPreview');
    
    if (file) {
        photoPreview.innerHTML = '🔄 圧縮中...';
        try {
            const compressedBlob = await resizeAndEncode(file, 600, 0.5);
            currentPhotoFile = compressedBlob; // アップロード用にBlobを保持
            
            const previewUrl = URL.createObjectURL(compressedBlob);
            const img = document.createElement('img');
            img.src = previewUrl;
            photoPreview.innerHTML = '';
            photoPreview.appendChild(img);
        } catch (error) {
            console.error("写真の処理中にエラー:", error);
            photoPreview.innerHTML = '⚠️ 写真の読み込みに失敗';
            currentPhotoFile = null;
        }
    }
}

/**
 * フォームの「記録する」ボタンが押されたときの処理 (Firebase対応)
 */
async function handleFormSubmit(event) {
    event.preventDefault(); 
    const saveButton = document.getElementById('saveButton');
    toggleLoading(true, '保存中...');

    try {
        const existingId = document.getElementById('recordId').value;
        const date = document.getElementById('date').value;
        let photoURL = existingPhotoUrl; 

        if (currentPhotoFile) {
            if (existingPhotoUrl) {
                try {
                    const oldImageRef = ref(storage, existingPhotoUrl);
                    await deleteObject(oldImageRef);
                } catch (deleteError) {
                    console.warn("古い写真の削除に失敗:", deleteError);
                }
            }
            
            const newImageRef = ref(storage, `photos/${Date.now()}.jpg`);
            await uploadBytes(newImageRef, currentPhotoFile);
            photoURL = await getDownloadURL(newImageRef);
        }

        const recordData = {
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
            dogPhoto: photoURL, 
            updatedAt: serverTimestamp(),
            // ★ 誰がデータを保存したか記録
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
 * Firestoreから全データを読み込み、キャッシュとリストを更新
 */
async function loadAllRecordsFromFirestore() {
    // ★ 認証が完了していない場合は何もしない
    if (!currentUser) return; 

    const recordListDiv = document.getElementById('recordList');
    recordListDiv.innerHTML = '<p>🔄 データを読み込み中...</p>';
    
    try {
        // 'date' (日付) の降順 (新しい順) でデータを取得
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
            recordItem.onclick = () => loadRecordById(id);

            const formattedDate = new Date(record.date).toLocaleDateString('ja-JP');

            recordItem.innerHTML = `
                <h4>${formattedDate} ${record.weather}</h4>
                ${record.dogPhoto ? `<div class="record-photo"><img src="${record.dogPhoto}" alt="わんこ"></div>` : ''}
                <p><strong>お通じ:</strong> ${record.poopCount}回 (${record.poopQuality})</p>
                <p><strong>睡眠:</strong> ${record.sleepTime}</p>
                <p><strong>散歩:</strong> ${record.walk}</p>
                ${record.otherNotes ? `<p><strong>メモ:</strong> ${record.otherNotes.replace(/\n/g, '<br>')}</p>` : ''}
            `;
            recordListDiv.appendChild(recordItem);
        });
        
        const todayString = document.getElementById('date').value;
        loadRecordForDate(todayString);

    } catch (error) {
        console.error("データ読み込みエラー:", error);
        recordListDiv.innerHTML = '<p>⚠️ データの読み込みに失敗しました。</p>';
    }
}

/**
 * 指定された日付のデータをキャッシュから探し、フォームに読み込む
 */
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

/**
 * リスト項目がクリックされたときに、そのIDのデータを読み込む
 */
function loadRecordById(id) {
    const record = allRecordsCache.find(r => r.id === id);

    if (record) {
        document.getElementById('date').value = record.date; 
        populateForm(record);
        document.getElementById('saveButton').textContent = '記録を更新する';
        document.getElementById('deleteButton').style.display = 'block';
        window.scrollTo(0, 0);
    }
}

/**
* フォームを指定されたレコードデータで埋める
*/
function populateForm(record) {
    document.getElementById('healthForm').reset();
    document.getElementById('recordId').value = record.id;
    document.getElementById('date').value = record.date;
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

    existingPhotoUrl = record.dogPhoto || null; 
    currentPhotoFile = null; 
    const photoPreview = document.getElementById('photoPreview');
    photoPreview.innerHTML = '';
    if (existingPhotoUrl) {
        const img = document.createElement('img');
        img.src = existingPhotoUrl;
        photoPreview.appendChild(img);
    }
    document.getElementById('dogPhoto').value = ""; 
}

/**
 * フォームをクリアする (日付は保持)
 */
function clearForm(dateString) {
    document.getElementById('healthForm').reset(); 
    document.getElementById('recordId').value = '';
    document.getElementById('date').value = dateString; 
    
    existingPhotoUrl = null;
    currentPhotoFile = null;
    document.getElementById('photoPreview').innerHTML = '';
    // デフォルト値を再設定
    document.getElementById('sleepTime').value = 'ずっと寝てる';
}

/**
 * 現在フォームで編集中の記録を削除する (Firebase対応)
 */
async function deleteCurrentRecord() {
    const idToDelete = document.getElementById('recordId').value;
    if (!idToDelete) {
        alert("削除する記録がありません。");
        return;
    }

    if (!confirm('本当にこの日の記録を削除しますか？ (写真も削除されます)')) {
        return; 
    }
    
    toggleLoading(true, '削除中...');

    try {
        if (existingPhotoUrl) {
            try {
                const oldImageRef = ref(storage, existingPhotoUrl);
                await deleteObject(oldImageRef);
            } catch (deleteError) {
                console.warn("写真の削除に失敗:", deleteError);
            }
        }

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
        // テキストを元に戻す（IDがあるか無いかで判断）
        const existingId = document.getElementById('recordId').value;
        saveButton.textContent = existingId ? '記録を更新する' : '記録する';
    }
}

/**
 * ★★★ 圧縮関数 (Blobを返す) ★★★
 */
function resizeAndEncode(file, maxSize = 600, quality = 0.5) {
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

                canvas.toBlob((blob) => {
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new Error('Canvas to Blob conversion failed.'));
                    }
                }, 'image/jpeg', quality);
            };
            img.onerror = reject;
            img.src = event.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

