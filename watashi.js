import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, doc, updateDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";

const firebaseConfig={apiKey:"AIzaSyDCwPw3WxwYHvaudHqYJ64RzhS4hWhKvO0",authDomain:"coco-healthcare-59401.firebaseapp.com",projectId:"coco-healthcare-59401",storageBucket:"coco-healthcare-59401.firebasestorage.app",messagingSenderId:"986920233821",appId:"1:986920233821:web:96ff08e9f118d557a816b4"};
const app=initializeApp(firebaseConfig),db=getFirestore(app),auth=getAuth(app);
let recordsRef=null;
let user=null,records=[],selectedPeriod='week',pain=0,offsetDays=0;
const $=id=>document.getElementById(id);
const today=()=>{const d=new Date(),off=d.getTimezoneOffset();return new Date(d.getTime()-off*60000).toISOString().slice(0,10)};

/* ---- 期間スライド用のユーティリティ ---- */
const DAY=86400000;
const PERIOD_DAYS={week:7,month:30};
const parseKey=s=>new Date(s+'T00:00:00');
const toKey=d=>{const off=d.getTimezoneOffset();return new Date(d.getTime()-off*60000).toISOString().slice(0,10)};
const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
const diffDays=(a,b)=>Math.round((a-b)/DAY);
const fmtMD=d=>`${d.getMonth()+1}/${d.getDate()}`;
function anchorDate(){return parseKey($('recordDate').value||today())}
function todayOffset(){return clampOffset(diffDays(parseKey(today()),anchorDate()))}
function clampOffset(n){
  const days=PERIOD_DAYS[selectedPeriod];
  if(!days)return 0;
  const anchor=anchorDate();
  const max=Math.max(0,diffDays(parseKey(today()),anchor));
  let min=Math.min(0,max);
  if(records.length){
    const first=parseKey(records[0].date);
    min=Math.min(min,diffDays(first,anchor)-(days-1));
  }
  return Math.max(min,Math.min(max,n));
}

$('recordDate').value=today();
$('loginButton').onclick=()=>signInWithPopup(auth,new GoogleAuthProvider()).catch(e=>alert('ログインできませんでした: '+e.message));
$('logoutButton').onclick=()=>user&&signOut(auth);
onAuthStateChanged(auth,async u=>{if(!u){user=null;recordsRef=null;$('authGate').hidden=false;$('appContent').hidden=true;$('savebar').hidden=true;return}user=u;recordsRef=collection(db,'users',user.uid,'personalHealthRecords');$('authGate').hidden=true;$('appContent').hidden=false;$('savebar').hidden=false;try{await loadRecords();loadDate($('recordDate').value)}catch(e){$('authGate').hidden=false;$('appContent').hidden=true;$('savebar').hidden=true;$('authMessage').textContent='このアカウントでは利用できません。';$('loginButton').textContent='別のアカウントでログイン'}});

document.querySelectorAll('.pain-btn').forEach(btn=>btn.onclick=()=>{document.querySelectorAll('.pain-btn').forEach(b=>b.classList.remove('selected'));btn.classList.add('selected');pain=Number(btn.textContent);$('painValue').textContent=pain});
document.querySelectorAll('.chips').forEach(group=>group.querySelectorAll('.chip').forEach(btn=>btn.onclick=()=>{if(group.classList.contains('single'))group.querySelectorAll('.chip').forEach(b=>b.classList.remove('on'));btn.classList.toggle('on')}));
document.querySelectorAll('.chart-tab').forEach(btn=>btn.onclick=()=>{document.querySelectorAll('.chart-tab').forEach(b=>b.classList.remove('active'));btn.classList.add('active');selectedPeriod=btn.dataset.period;offsetDays=clampOffset(offsetDays);drawChart()});
$('recordDate').onchange=()=>{offsetDays=0;loadDate($('recordDate').value);drawChart()};
$('saveButton').onclick=saveRecord;
$('deleteButton').onclick=deleteRecord;
$('chartReset').onclick=()=>{offsetDays=todayOffset();drawChart()};

/* ---- グラフを左右にドラッグ／スワイプして期間を移動 ---- */
(function enableChartDrag(){
  const surface=$('chartSurface');
  if(!surface)return;
  let drag=null;
  const perDayPx=()=>{
    const days=PERIOD_DAYS[selectedPeriod];
    if(!days)return 0;
    const plot=surface.getBoundingClientRect().width*(545/600);
    return days>1?plot/(days-1):plot;
  };
  surface.addEventListener('pointerdown',e=>{
    if(!PERIOD_DAYS[selectedPeriod])return;
    drag={x:e.clientX,base:offsetDays,id:e.pointerId};
    surface.classList.add('dragging');
    try{surface.setPointerCapture(e.pointerId)}catch(_){}
  });
  surface.addEventListener('pointermove',e=>{
    if(!drag)return;
    const per=perDayPx();
    if(!per)return;
    const next=clampOffset(drag.base-Math.round((e.clientX-drag.x)/per));
    if(next!==offsetDays){offsetDays=next;drawChart()}
  });
  const endDrag=()=>{
    if(!drag)return;
    surface.classList.remove('dragging');
    try{surface.releasePointerCapture(drag.id)}catch(_){}
    drag=null;
  };
  surface.addEventListener('pointerup',endDrag);
  surface.addEventListener('pointercancel',endDrag);
  surface.addEventListener('lostpointercapture',endDrag);
  surface.addEventListener('keydown',e=>{
    if(!PERIOD_DAYS[selectedPeriod])return;
    let move=0;
    if(e.key==='ArrowLeft')move=-1;
    else if(e.key==='ArrowRight')move=1;
    else if(e.key==='PageDown')move=-PERIOD_DAYS[selectedPeriod];
    else if(e.key==='PageUp')move=PERIOD_DAYS[selectedPeriod];
    else return;
    e.preventDefault();
    const next=clampOffset(offsetDays+move);
    if(next!==offsetDays){offsetDays=next;drawChart()}
  });
})();

async function loadRecords(){const snap=await getDocs(recordsRef);records=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.date.localeCompare(b.date));offsetDays=clampOffset(offsetDays);drawChart()}
function activeOne(id){return $(id).querySelector('.chip.on')?.dataset.value||'なし'}
function activeMany(id){return [...$(id).querySelectorAll('.chip.on')].map(b=>b.dataset.value)}
function setOne(id,value){$(id).querySelectorAll('.chip').forEach(b=>b.classList.toggle('on',b.dataset.value===(value||'なし')))}
function setMany(id,values=[]){$(id).querySelectorAll('.chip').forEach(b=>b.classList.toggle('on',values.includes(b.dataset.value)))}
function setPain(value){pain=Number(value)||0;document.querySelectorAll('.pain-btn').forEach(b=>b.classList.toggle('selected',Number(b.textContent)===pain));$('painValue').textContent=pain}
function loadDate(date){const r=records.find(x=>x.date===date);setPain(r?.painScore||0);$('painComment').value=r?.painComment||'';setOne('periodStatus',r?.periodStatus);$('periodComment').value=r?.periodComment||'';setOne('headacheStatus',r?.headacheStatus);$('headacheComment').value=r?.headacheComment||'';setMany('otherSymptoms',r?.otherSymptoms);$('symptomComment').value=r?.symptomComment||'';$('dailyMemo').value=r?.memo||'';$('saveButton').textContent=r?'この日の記録を更新':'今日の記録を保存';$('deleteButton').style.display=r?'block':'none';$('saveStatus').textContent=r?'保存済みの記録を表示しています':''}
async function saveRecord(){const date=$('recordDate').value;if(!date)return;const existing=records.find(r=>r.date===date),data={date,painScore:pain,painComment:$('painComment').value.trim(),periodStatus:activeOne('periodStatus'),periodComment:$('periodComment').value.trim(),headacheStatus:activeOne('headacheStatus'),headacheComment:$('headacheComment').value.trim(),otherSymptoms:activeMany('otherSymptoms'),symptomComment:$('symptomComment').value.trim(),memo:$('dailyMemo').value.trim(),updatedAt:serverTimestamp()};$('saveButton').disabled=true;$('saveStatus').textContent='保存中…';try{existing?await updateDoc(doc(recordsRef,existing.id),data):await addDoc(recordsRef,{...data,createdAt:serverTimestamp()});await loadRecords();loadDate(date);$('saveStatus').textContent='保存しました'}catch(e){$('saveStatus').textContent='保存できませんでした';alert('保存できませんでした: '+e.message)}finally{$('saveButton').disabled=false}}
async function deleteRecord(){const r=records.find(x=>x.date===$('recordDate').value);if(!r||!confirm('この日の記録を削除しますか？'))return;await deleteDoc(doc(recordsRef,r.id));await loadRecords();loadDate($('recordDate').value);$('saveStatus').textContent='削除しました'}

function average(vals){const v=vals.filter(Number.isFinite);return v.length?v.reduce((a,b)=>a+b,0)/v.length:null}
function chartModel(){
  const days=PERIOD_DAYS[selectedPeriod];
  if(days){
    const end=addDays(anchorDate(),offsetDays),start=addDays(end,-(days-1)),todayKey=today(),items=[];
    for(let i=0;i<days;i++){
      const d=addDays(start,i),key=toKey(d),r=records.find(x=>x.date===key);
      let label='';
      if(days<=7)label=key===todayKey?'今日':String(d.getDate());
      else if(i===0||i===days-1||i%5===0)label=fmtMD(d);
      items.push({label,value:r?.painScore??null,key});
    }
    const title=days<=7?`${fmtMD(start)}〜${fmtMD(end)} の痛みの推移`:`${fmtMD(start)}〜${fmtMD(end)}（${days}日間）の痛み`;
    return{title,series:[{name:'痛み',color:'#d65f78',items}]};
  }
  const years=[...new Set(records.map(r=>Number(r.date.slice(0,4))))].sort();
  if(!years.includes(anchorDate().getFullYear()))years.push(anchorDate().getFullYear());
  const palette=['#d65f78','#7569b6','#4d8b78','#d6924a','#4f7fb5'];
  return{title:'1月〜12月・年ごとの平均痛み',series:years.sort().map((year,i)=>({name:`${year}年`,color:palette[i%palette.length],items:Array.from({length:12},(_,m)=>({label:`${m+1}月`,value:average(records.filter(r=>r.date.startsWith(`${year}-${String(m+1).padStart(2,'0')}`)).map(r=>r.painScore))}))}))};
}
function drawChart(){
  const model=chartModel(),svgW=545,left=35,slidable=!!PERIOD_DAYS[selectedPeriod];
  $('chartTitle').textContent=model.title;
  const vals=model.series.flatMap(s=>s.items.map(i=>i.value)).filter(Number.isFinite),avg=average(vals);
  $('chartCompare').textContent=vals.length?(slidable?`${vals.length}日分・平均 ${avg.toFixed(1)}`:`${records.length}日分の記録`):(records.length?'この期間の記録はありません':'まだ記録がありません');
  const count=model.series[0].items.length,step=count>1?svgW/(count-1):0;
  $('chartArea').setAttribute('d','');
  $('chartLine').setAttribute('points','');
  $('compareLine').setAttribute('points','');
  $('chartDots').innerHTML='';
  document.querySelectorAll('.dynamic-series').forEach(e=>e.remove());
  model.series.forEach(s=>{
    const points=s.items.map((item,i)=>item.value===null?null:`${left+i*step},${135-item.value*11}`).filter(Boolean).join(' '),
      line=document.createElementNS('http://www.w3.org/2000/svg','polyline');
    line.setAttribute('class','dynamic-series');
    line.setAttribute('points',points);
    line.setAttribute('fill','none');
    line.setAttribute('stroke',s.color);
    line.setAttribute('stroke-width','3');
    line.setAttribute('stroke-linecap','round');
    line.setAttribute('stroke-linejoin','round');
    $('chartDots').before(line);
    s.items.forEach((item,i)=>{
      if(item.value===null)return;
      const c=document.createElementNS('http://www.w3.org/2000/svg','circle');
      c.setAttribute('class','dot dynamic-series');
      c.setAttribute('cx',left+i*step);
      c.setAttribute('cy',135-item.value*11);
      c.setAttribute('r','3');
      c.setAttribute('style',`stroke:${s.color}`);
      $('chartDots').before(c);
    });
  });
  $('chartLabels').innerHTML=model.series[0].items.map((item,i)=>item.label?`<text x="${left+i*step}" y="158" font-size="${selectedPeriod==='year'?8:10}">${item.label}</text>`:'').join('');
  $('chartLegend').innerHTML=model.series.map(s=>`<span><i class="legend-dot" style="background:${s.color}"></i>${s.name}</span>`).join('');
  $('chartLegend').classList.toggle('show',selectedPeriod==='year');
  $('chartSurface').classList.toggle('slidable',slidable);
  $('chartHint').textContent=slidable?'グラフを左右にドラッグすると期間を動かせます':'';
  $('chartReset').hidden=!slidable||offsetDays===todayOffset();
}
