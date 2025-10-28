// === Firebase SDKモジュールをインポート ===
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { 
    getFirestore, collection, addDoc, getDocs, doc, 
    updateDoc, deleteDoc, query, orderBy, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
// ★ 認証モジュール (signInWithPopup に変更)
import {
    getAuth,
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup, // ★ 変更点 1
    signOut
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";


// === Firebase 設定 (あなたの設定) ===
const firebaseConfig = {
  apiKey: "AIzaSyDCwPw3WxwYHvaudHqYJ64RzhS4hWhKvO0",
  authDomain: "coco-healthcare-59401.firebaseapp.com",
  projectId: "coco-healthcare-59401",
  storageBucket: "coco-healthcare-59401.firebasestorage.app",
  messagingSenderId: "986920233821",
  appId: "1:986920233821:web:96ff08e9f118d557a816b4"

};

// ★★★=================================================★★★
// ★★★    アクセスを許可する人のメールアドレス          ★★★
// ★★★=================================================★★★
const ALLOWED_EMAIL_LIST = [
    "fine2025contact@gmail.com", 
    "11033ohtm@gmail.com",  
    "ohtm1103@yahoo.co.jp"    
];
// ★★★=================================================★★★


// === Firebase の初期化 ===
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app); 
const recordsCollection = collection(db, 'records');

// === グローバル変数 ===
let currentPhotoBase64 = null; 
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

// ★★★ 変更点 2: ログインボタンの処理 ★★★
loginButton.addEventListener('click', () => {
    const provider = new GoogleAuthProvider();
    // signInWithRedirect から signInWithPopup に変更
    signInWithPopup(auth, provider)
        .then((result) => {
            // ログイン成功
            // この後 onAuthStateChanged が自動的に呼ばれる
            console.log("ポップアップログイン成功:", result.user.email);
        })
        .catch((error) => {
            // ログイン失敗（ポップアップを閉じた、など）
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

// (↓... showLoginScreen, showAccessDenied, showApp などの
//    残りの関数は、以前のコードから一切変更ありません ...)

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

let appInitialized = false;
function initializeAppLogic() {
    if (appInitialized) return;
    appInitialized = true;

    document.getElementById('healthForm').addEventListener('submit', handleFormSubmit);
    document.getElementById('date').addEventListener('change', handleDateChange);
    document.getElementById('dogPhoto').addEventListener('change', handlePhotoPreview);
    document.getElementById('deleteButton').addEventListener('click', deleteCurrentRecord);

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
            recordItem.onclick = () => loadRecordById(id);

            const formattedDate = new Date(record.date).toLocaleDateString('ja-JP');

            recordItem.innerHTML = `
                <h4>${formattedDate} ${record.weather}</h4>
                ${record.dogPhotoBase64 ? `<div class="record-photo"><img src="${record.dogPhotoBase64}" alt="わんこ"></div>` : ''}
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
        window.scrollTo(0, 0);
    }
}

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

function clearForm(dateString) {
    document.getElementById('healthForm').reset(); 
    document.getElementById('recordId').value = '';
    document.getElementById('date').value = dateString; 
    
    currentPhotoBase64 = null;
    document.getElementById('photoPreview').innerHTML = '';
    document.getElementById('sleepTime').value = 'ずっと寝てる';
}

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
