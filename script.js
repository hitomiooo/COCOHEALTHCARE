// === Firebase SDKモジュールをインポート ===
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import {
    getFirestore, collection, addDoc, getDocs, doc,
    updateDoc, deleteDoc, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
import {
    getAuth,
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup,
    signOut
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";


// === Firebase 設定 ===
const firebaseConfig = {
  apiKey: "AIzaSyDCwPw3WxwYHvaudHqYJ64RzhS4hWhKvO0",
  authDomain: "coco-healthcare-59401.firebaseapp.com",
  projectId: "coco-healthcare-59401",
  storageBucket: "coco-healthcare-59401.firebasestorage.app",
  messagingSenderId: "986920233821",
  appId: "1:986920233821:web:96ff08e9f118d557a816b4"
};

// ★★★ アクセスを許可する人のメールアドレス ★★★
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

loginButton.addEventListener('click', () => {
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider)
        .then((result) => {
            console.log("ログイン成功:", result.user.email);
        })
        .catch((error) => {
            console.error("ログイン失敗:", error);
            if (error.code === 'auth/popup-closed-by-user') {
                alert("ログインがキャンセルされました。");
            } else {
                alert("ログインに失敗しました: " + error.message);
            }
        });
});

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
    document.getElementById('healthForm').addEventListener('submit', handleFormSubmit);
    document.getElementById('date').addEventListener('change', handleDateChange);
    document.getElementById('dogPhoto').addEventListener('change', handlePhotoPreview);
    document.getElementById('deleteButton').addEventListener('click', deleteCurrentRecord);
    document.getElementById('stampPad').addEventListener('click', handleStampClick);
    
    const weatherBtns = document.querySelectorAll('#weatherBtnGroup button');
    weatherBtns.forEach(btn => {
        btn.addEventListener('click', handleWeatherClick);
    });

    const todayString = getFormattedDate(new Date());
    document.getElementById('date').value = todayString;
    loadAllRecordsFromFirestore();

    // ★追加: 飯田市の気象情報の更新
    updateIidaWeather();
}

// ★追加: 飯田市の気象情報を取得して表示
async function updateIidaWeather() {
    const tempContainer = document.getElementById('todayTempRange');
    const forecastContainer = document.getElementById('weeklyForecastContainer');
    const pressureContainer = document.getElementById('pressureAlertContainer');

    try {
        // Open-Meteo API (飯田市: 35.51, 137.82)
        const url = "https://api.open-meteo.com/v1/forecast?latitude=35.5147&longitude=137.8222&daily=weathercode,temperature_2m_max,temperature_2m_min&hourly=surface_pressure&timezone=Asia%2FTokyo";
        const response = await fetch(url);
        const data = await response.json();

        // 今日の最高・最低気温
        const todayMax = data.daily.temperature_2m_max[0];
        const todayMin = data.daily.temperature_2m_min[0];
        if(tempContainer) tempContainer.innerHTML = `🌡️ 気温: <span style="color:#d32f2f;">最高 ${todayMax}℃</span> / <span style="color:#1976d2;">最低 ${todayMin}℃</span>`;

        // 今日の気圧とアラート判定
        const now = new Date();
        const currentHour = now.getHours();
        const currentPressure = data.hourly.surface_pressure[currentHour];
        const futurePressure = data.hourly.surface_pressure[currentHour + 6]; 
        const drop = currentPressure - futurePressure;

        if (pressureContainer) {
            if (drop >= 5) {
                pressureContainer.innerHTML = `⚠️ <span style="background:#fff3cd; padding:2px 5px; border-radius:3px; border:1px solid #ffeeba;">気圧低下注意 (-${drop.toFixed(1)}hPa)</span>`;
            } else {
                pressureContainer.innerHTML = `🌤️ 気圧: ${currentPressure.toFixed(1)}hPa (安定)`;
            }
        }

        // 1週間の天気予報の描画
        if (forecastContainer) {
            forecastContainer.innerHTML = '';
            const weatherMap = {
                0: "☀️", 1: "🌤️", 2: "⛅", 3: "☁️", 45: "🌫️", 48: "🌫️",
                51: "🌦️", 61: "☔", 71: "❄️", 80: "🌧️", 95: "⚡"
            };

            data.daily.time.forEach((time, i) => {
                const dateObj = new Date(time);
                const dayLabel = i === 0 ? "今日" : `${dateObj.getMonth()+1}/${dateObj.getDate()}`;
                const icon = weatherMap[data.daily.weathercode[i]] || "❓";
                
                const dayEl = document.createElement('div');
                dayEl.style.cssText = "min-width:65px; text-align:center; background:#fff; padding:8px; border-radius:8px; border:1px solid #e0e0e0; flex-shrink:0;";
                dayEl.innerHTML = `
                    <div style="font-size:0.75em; color:#666;">${dayLabel}</div>
                    <div style="font-size:1.4em; margin:4px 0;">${icon}</div>
                    <div style="font-size:0.7em; font-weight:bold;">
                        <span style="color:#f44336;">${Math.round(data.daily.temperature_2m_max[i])}</span>/<span style="color:#2196f3;">${Math.round(data.daily.temperature_2m_min[i])}</span>
                    </div>
                `;
                forecastContainer.appendChild(dayEl);
            });
        }
    } catch (error) {
        console.error("気象情報の取得エラー:", error);
        if(forecastContainer) forecastContainer.innerHTML = "<p style='font-size:0.8em;'>⚠️ 気象情報を取得できませんでした</p>";
    }
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

function handleStampClick(event) {
    if (event.target.classList.contains('stamp-btn')) {
        const stamp = event.target.textContent;
        const memoTextArea = document.getElementById('otherNotes');
        const cursorPos = memoTextArea.selectionStart;
        const textBefore = memoTextArea.value.substring(0, cursorPos);
        const textAfter = memoTextArea.value.substring(cursorPos);
        memoTextArea.value = textBefore + stamp + textAfter;
        const newPos = cursorPos + stamp.length;
        memoTextArea.selectionStart = newPos;
        memoTextArea.selectionEnd = newPos;
        memoTextArea.focus();
    }
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

function handleWeatherClick(event) {
    const btn = event.currentTarget;
    const val = btn.getAttribute('data-val');
    const input = document.getElementById('weather');
    if (!input) return;
    let currentVals = input.value ? input.value.split('/') : [];
    if (btn.classList.contains('active')) {
        btn.classList.remove('active');
        currentVals = currentVals.filter(v => v !== val);
    } else {
        if (currentVals.length >= 2) {
            const removed = currentVals.shift(); 
            const btns = document.querySelectorAll('#weatherBtnGroup button');
            btns.forEach(b => {
                if(b.getAttribute('data-val') === removed) b.classList.remove('active');
            });
        }
        btn.classList.add('active');
        currentVals.push(val);
    }
    input.value = currentVals.join('/');
}

// フォーム送信
async function handleFormSubmit(event) {
    event.preventDefault();
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
        
        const markOptions = document.getElementsByName('eventMark');
        let selectedMark = '';
        for (const option of markOptions) {
            if (option.checked) {
                selectedMark = option.value;
                break;
            }
        }

        const recordData = {
            date: date,
            weather: document.getElementById('weather').value,
            eventMark: selectedMark, 
            temperatureFeel: document.getElementById('temperatureFeel').value,
            conditionCoco: document.getElementById('conditionCoco').value,
            conditionNono: document.getElementById('conditionNono').value,
            conditionMomo: document.getElementById('conditionMomo').value,
            conditionBibi: document.getElementById('conditionBibi').value,
            medPimo: document.getElementById('medPimo').checked,
            medLactu: document.getElementById('medLactu').checked,
            medConseve: document.getElementById('medConseve').checked,
            medPrega: document.getElementById('medPrega').checked,
            medOther: document.getElementById('medOther').checked,
            poopMorning: document.getElementById('poopMorning').checked,
            poopNoon: document.getElementById('poopNoon').checked,
            poopWalk: document.getElementById('poopWalk').checked,
            poopNight: document.getElementById('poopNight').checked,
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
                alert("エラー: その日付の記録は既に存在します。");
                return;
            }
            await addDoc(recordsCollection, recordData);
        }
        alert("記録を保存しました。");
        await loadAllRecordsFromFirestore();
        loadRecordForDate(date);
    } catch (error) {
        console.error("保存エラー:", error);
        alert("保存に失敗しました: " + error.message);
    } finally {
        toggleLoading(false);
    }
}

// Firestoreから読み込み
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
        let currentMonthYear = null;
        let currentMonthBody = null;
        querySnapshot.forEach(doc => {
            const record = doc.data();
            const id = doc.id;
            allRecordsCache.push({ id, ...record });
            const recordDate = new Date(record.date + 'T00:00:00');
            const monthYear = `${recordDate.getFullYear()}年 ${recordDate.getMonth() + 1}月`;
            if (monthYear !== currentMonthYear) {
                currentMonthYear = monthYear;
                const monthHeader = document.createElement('div');
                monthHeader.className = 'month-header';
                monthHeader.innerHTML = `<h3>${monthYear}</h3><span class="toggle-icon">▼</span>`;
                const bodyForThisMonth = document.createElement('div');
                bodyForThisMonth.className = 'month-body';
                const monthToggleIcon = monthHeader.querySelector('.toggle-icon');
                monthHeader.onclick = () => {
                    const isHidden = bodyForThisMonth.style.display === 'none' || bodyForThisMonth.style.display === '';
                    bodyForThisMonth.style.display = isHidden ? 'block' : 'none';
                    monthToggleIcon.textContent = isHidden ? '▲' : '▼';
                };
                recordListDiv.appendChild(monthHeader);
                recordListDiv.appendChild(bodyForThisMonth);
                currentMonthBody = bodyForThisMonth;
            }
            const recordItem = document.createElement('div');
            recordItem.className = 'record-item';
            const dayOnly = `${recordDate.getDate()}日`;
            let conditionStr = `ココ:${record.conditionCoco || '○'} | ノノ:${record.conditionNono || '○'} | モモ:${record.conditionMomo || '○'} | ビビ:${record.conditionBibi || '○'}`;
            let poopStr = [
                record.poopMorning ? '朝' : '', record.poopNoon ? '昼' : '',
                record.poopWalk ? '散歩時' : '', record.poopNight ? '夜' : ''
            ].filter(Boolean).join(', ') || 'なし';
            let medStr = [
                record.medPimo ? 'ピモベハート' : '', record.medLactu ? 'ラクツロース' : '',
                record.medConseve ? 'コンセーブ' : '', record.medPrega ? 'プレガバリン' : '',
                record.medOther ? 'その他' : ''
            ].filter(Boolean).join(', ') || 'なし';
            
            const weatherDisplay = record.weather || '☀️';
            const markBadge = record.eventMark 
                ? `<span class="event-mark-badge">${record.eventMark}</span>` 
                : '';

            recordItem.innerHTML = `
                <div class="record-header">
                    <h4>${dayOnly} ${weatherDisplay} ${markBadge}</h4>
                    <span class="toggle-icon">▼</span>
                </div>
                <div class="record-body" style="display:none;">
                    <p><strong>体感:</strong> ${record.temperatureFeel || '?'}</p>
                    <p><strong>体調:</strong> ${conditionStr}</p>
                    <p><strong>お通じ:</strong> ${poopStr}</p>
                    <p><strong>服用薬:</strong> ${medStr}</p>
                    <hr>
                    <p><strong>食欲:</strong> 朝:${record.appetiteMorning} 昼:${record.appetiteNoon} 晩:${record.appetiteNight}</p>
                    <p><strong>睡眠:</strong> ${record.sleepTime}</p>
                    <p><strong>散歩:</strong> ${record.walk}</p>
                    ${record.otherNotes ? `<p><strong>メモ:</strong> ${record.otherNotes.replace(/\n/g, '<br>')}</p>` : ''}
                    ${record.dogPhotoBase64 ? `<div class="record-photo"><img src="${record.dogPhotoBase64}" alt="ぴーぴ" loading="lazy" style="max-width:100%; border-radius:8px; margin-top:10px;"></div>` : ''}
                    <button class="edit-btn-small" style="margin-top:10px;">この日を編集する</button>
                </div>
            `;
            const header = recordItem.querySelector('.record-header');
            const body = recordItem.querySelector('.record-body');
            const icon = recordItem.querySelector('.toggle-icon');
            header.onclick = () => {
                const isHidden = body.style.display === 'none';
                body.style.display = isHidden ? 'block' : 'none';
                icon.textContent = isHidden ? '▲' : '▼';
            };
            const editButton = recordItem.querySelector('.edit-btn-small');
            editButton.onclick = (e) => {
                e.stopPropagation();
                loadRecordById(id);
            };
            if (currentMonthBody) {
                currentMonthBody.appendChild(recordItem);
            }
        });
        const todayString = document.getElementById('date').value;
        loadRecordForDate(todayString);

        const chartContainer = document.getElementById('appetiteChartContainer');
        if (chartContainer) {
            chartContainer.innerHTML = generateAppetiteChart('Coco');
        }

    } catch (error) {
        console.error("読み込みエラー:", error);
        recordListDiv.innerHTML = '<p>⚠️ データの読み込みに失敗しました。</p>';
    }
}

// ★追加: 食欲グラフ生成関数
function generateAppetiteChart(targetDog = 'Coco') {
    const last30Days = allRecordsCache
        .filter(r => r.date)
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .slice(-30);

    updateAIAdvice(last30Days);

    if (last30Days.length === 0) return '<p style="font-size:0.8em; color:#999;">データが不足しています</p>';

    const scoreMap = { "完食": 3, "少し残す": 2, "半分": 1, "ほぼ食べず": 0 };
    const points = last30Days.map((r, index) => {
        const morning = scoreMap[r.appetiteMorning] || 0;
        const noon = scoreMap[r.appetiteNoon] || 0;
        const night = scoreMap[r.appetiteNight] || 0;
        const totalScore = morning + noon + night;
        const x = (index / 29) * 300 + 20; 
        const y = 100 - (totalScore / 9) * 80; 
        return `${x},${y}`;
    }).join(' ');

    return `
        <svg viewBox="0 0 340 120" style="width:100%; height:auto; background:#fdfdfd; border-radius:5px;">
            <line x1="20" y1="20" x2="320" y2="20" stroke="#eee" />
            <line x1="20" y1="100" x2="320" y2="100" stroke="#ccc" />
            <polyline fill="none" stroke="#ff6b6b" stroke-width="3" points="${points}" stroke-linejoin="round" />
            ${points.split(' ').map(p => `<circle cx="${p.split(',')[0]}" cy="${p.split(',')[1]}" r="3" fill="#ff6b6b" />`).join('')}
            <text x="20" y="115" font-size="8" fill="#999">30日前</text>
            <text x="280" y="115" font-size="8" fill="#999">今日</text>
        </svg>
    `;
}

// ★追加: AI健康アドバイス生成関数
function updateAIAdvice(last30Days) {
    const adviceDiv = document.getElementById('aiAdviceContainer');
    if (!adviceDiv) return;

    if (last30Days.length < 3) {
        adviceDiv.innerHTML = "🐾 3日分以上のデータが貯まると、AIが健康トレンドを解析します。";
        return;
    }

    const scoreMap = { "完食": 3, "少し残す": 2, "半分": 1, "ほぼ食べず": 0 };
    const dailyScores = last30Days.map(r => {
        return (scoreMap[r.appetiteMorning] || 0) + (scoreMap[r.appetiteNoon] || 0) + (scoreMap[r.appetiteNight] || 0);
    });

    const recent3 = dailyScores.slice(-3); 
    const todayScore = recent3[2];
    const prevScore = recent3[1];
    const diff = todayScore - prevScore;

    let message = "";
    let icon = "💡";

    if (todayScore <= 3) {
        icon = "⚠️";
        message = "ココちゃんの食欲がかなり低下しています。スタンプにある「嘔吐」や「咳」が出ていないか確認し、続く場合は早めに先生に相談しましょう。";
    } else if (diff <= -3) {
        icon = "📉";
        message = "昨日より食欲が急に落ちています。気圧や気温の変化による疲れかもしれません。ゆっくり休ませてあげてください。";
    } else if (todayScore >= 8) {
        icon = "✨";
        message = "バッチリ完食が続いていますね！体調はとても良さそうです。この調子で投薬も忘れずに進めましょう。";
    } else {
        icon = "🐾";
        message = "食欲は安定しています。日々の記録を続けることで、小さな変化にも気づきやすくなります。";
    }

    adviceDiv.innerHTML = `<strong>${icon} AIアドバイス:</strong><br>${message}`;
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
    
    const savedWeather = record.weather || '';
    document.getElementById('weather').value = savedWeather;
    const weatherVals = savedWeather.split('/');
    document.querySelectorAll('#weatherBtnGroup button').forEach(btn => {
        if (weatherVals.includes(btn.getAttribute('data-val'))) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    const savedMark = record.eventMark || '';
    const markOptions = document.getElementsByName('eventMark');
    for (const option of markOptions) {
        if (option.value === savedMark) {
            option.checked = true;
            break;
        }
    }

    document.getElementById('temperatureFeel').value = record.temperatureFeel || 'ちょうどいい';
    document.getElementById('conditionCoco').value = record.conditionCoco || '○';
    document.getElementById('conditionNono').value = record.conditionNono || '○';
    document.getElementById('conditionMomo').value = record.conditionMomo || '○';
    document.getElementById('conditionBibi').value = record.conditionBibi || '○';
    document.getElementById('medPimo').checked = record.medPimo === true;
    document.getElementById('medLactu').checked = record.medLactu === true;
    document.getElementById('medConseve').checked = record.medConseve === true;
    document.getElementById('medPrega').checked = record.medPrega === true;
    document.getElementById('medOther').checked = record.medOther === true;
    document.getElementById('poopMorning').checked = record.poopMorning === true;
    document.getElementById('poopNoon').checked = record.poopNoon === true;
    document.getElementById('poopWalk').checked = record.poopWalk === true;
    document.getElementById('poopNight').checked = record.poopNight === true;
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
}

function clearForm(dateString) {
    document.getElementById('healthForm').reset();
    document.getElementById('recordId').value = '';
    document.getElementById('date').value = dateString;
    document.getElementById('weather').value = '';
    document.querySelectorAll('#weatherBtnGroup button').forEach(btn => {
        btn.classList.remove('active');
    });
    const markOptions = document.getElementsByName('eventMark');
    if(markOptions.length > 0) markOptions[0].checked = true;
    currentPhotoBase64 = null;
    document.getElementById('photoPreview').innerHTML = '';
}

async function deleteCurrentRecord() {
    const idToDelete = document.getElementById('recordId').value;
    if (!idToDelete || !confirm('本当にこの日の記録を削除しますか？')) return;
    toggleLoading(true, '削除中...');
    try {
        await deleteDoc(doc(db, 'records', idToDelete));
        alert("削除しました。");
        await loadAllRecordsFromFirestore();
    } catch (error) { alert("削除失敗: " + error.message); }
    finally { toggleLoading(false); }
}

function toggleLoading(isLoading, text) {
    const btn = document.getElementById('saveButton');
    btn.disabled = isLoading;
    if (text && isLoading) btn.textContent = text;
}

function resizeAndEncode(file, maxSize = 300, quality = 0.4) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let w = img.width, h = img.height;
                if (w > h) { if (w > maxSize) { h *= maxSize / w; w = maxSize; } }
                else { if (h > maxSize) { w *= maxSize / h; h = maxSize; } }
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}