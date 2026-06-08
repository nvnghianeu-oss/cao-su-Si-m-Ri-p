'use strict';
const APPS_SCRIPT_URL = "";
let STATE = { daily:[], workers:[], hs_total:{kh:0,tt:0}, hs_workers:[], luong:[], loaded:false };
let CHARTS = {};
// Pagination state
let PAGE = { att:1, luong:1 };
const PER_PAGE = 10;

const fmt = (n,d=0) => new Intl.NumberFormat('vi-VN',{maximumFractionDigits:d}).format(+n||0);
const fmtK = n => Math.abs(n)>=1e6?(n/1e6).toFixed(2)+'M R':Math.abs(n)>=1e3?(n/1e3).toFixed(0)+'K R':fmt(n)+' R';
const pct = v => (v*100).toFixed(1)+'%';
const clr = (v,lo=0.85,hi=1) => v>=hi?'var(--green)':v>=lo?'var(--yellow)':'var(--red)';
function destroyChart(id){if(CHARTS[id]){CHARTS[id].destroy();delete CHARTS[id];}}

const CD = {
  responsive:true, maintainAspectRatio:false,
  plugins:{legend:{display:false},tooltip:{backgroundColor:'#1a2235',borderColor:'rgba(255,255,255,0.08)',borderWidth:1,titleColor:'#e8edf5',bodyColor:'#94a3b8',padding:8}},
  scales:{
    x:{ticks:{color:'#4b5769',font:{size:10}},grid:{color:'rgba(255,255,255,0.04)'},border:{color:'rgba(255,255,255,0.08)'}},
    y:{ticks:{color:'#4b5769',font:{size:10}},grid:{color:'rgba(255,255,255,0.04)'},border:{color:'rgba(255,255,255,0.08)'}}
  }
};

// NAV
const PAGE_TITLES={'p-tongquan':'📊 Tổng Quan Điều Hành','p-chamcong':'📋 Chấm Công Hàng Ngày','p-sanluong':'🌿 Sản Lượng Tháng 5','p-luong':'💰 Hiệu Suất & Tiền Lương'};
document.querySelectorAll('.nav-item').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const pid=btn.dataset.page;
    document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(pid).classList.add('active');
    document.getElementById('topbar-title').textContent=PAGE_TITLES[pid]||'';
    if(pid==='p-tongquan') renderTongQuan();
    else if(pid==='p-chamcong') renderChamCong();
    else if(pid==='p-sanluong') renderSanLuong();
    else if(pid==='p-luong') renderLuong();
  });
});
function toggleSidebar(){document.getElementById('sidebar').classList.toggle('open');}

// FETCH
async function fetchCSVRaw(sheetName){
  const url=`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  const res=await fetch(url,{cache:'no-store'});
  if(!res.ok) throw new Error('HTTP '+res.status);
  return await res.text();
}
function parseCSV(csvText,headerRowIndex=0){
  const allRows=Papa.parse(csvText,{header:false,skipEmptyLines:false}).data;
  const headers=allRows[headerRowIndex].map(h=>(h||'').trim());
  return allRows.slice(headerRowIndex+1).filter(r=>r.some(c=>c&&c.trim()!=='')).map(r=>{const obj={};headers.forEach((h,i)=>{obj[h]=r[i]||'';});return obj;});
}

async function loadAllData(){
  const overlay=document.getElementById('loading-overlay');
  const dot=document.querySelector('.status-dot');
  const stxt=document.querySelector('.data-status span');
  overlay.style.display='flex';
  try{
    const [ccCsv,hsCsv,tlCsv]=await Promise.all([fetchCSVRaw('CHAM CONG'),fetchCSVRaw('3. Hi\u1ec7u su\u1ea5t'),fetchCSVRaw('4. Ti\u1ec1n l\u01b0\u01a1ng')]);
    parseChamCong(parseCSV(ccCsv,0));
    parseHieuSuat(parseCSV(hsCsv,0));
    parseTienLuong(parseCSV(tlCsv,1));
    dot.className='status-dot ok'; stxt.textContent='Live · Google Sheets ✓';
  }catch(e){
    console.warn('Sheets fetch failed:',e);
    STATE.daily=FALLBACK_DAILY; STATE.workers=FALLBACK_WORKERS_ATT;
    STATE.hs_total=FALLBACK_HS_TOTAL; STATE.hs_workers=FALLBACK_HS_WORKERS;
    STATE.luong=FALLBACK_LUONG_WORKERS;
    dot.className='status-dot error'; stxt.textContent='Offline · Dữ liệu Excel';
    document.getElementById('error-banner').style.display='flex';
    document.getElementById('error-msg').textContent='⚠ Không kết nối Google Sheets — dùng dữ liệu Excel.';
  }
  overlay.style.display='none';
  STATE.loaded=true;
  initFilters();
  renderAll();
}

function parseChamCong(rows){
  const valid=rows.filter(r=>r['ID']&&r['HO TEN CONG NHAN']);
  const dayMap={};
  valid.forEach(r=>{
    const day=parseDay(r['NGAY']||''); if(!day) return;
    const dk=`2026-05-${String(day).padStart(2,'0')}`;
    if(!dayMap[dk]) dayMap[dk]={date:dk,day,n:0,ct:0,db:0,mb:0,mu_tuoi:0,mu_day:0};
    dayMap[dk].n++;
    if(r['Chính thức']==='TRUE') dayMap[dk].ct++;
    if(r['Dự bị']==='TRUE') dayMap[dk].db++;
    if(r['Mưa bão']==='TRUE') dayMap[dk].mb++;
    dayMap[dk].mu_tuoi+=parseVN(r['Mủ tươi']); dayMap[dk].mu_day+=parseVN(r['Mủ dây']);
  });
  STATE.daily=Object.values(dayMap).sort((a,b)=>a.day-b.day);
  const wMap={};
  valid.forEach(r=>{
    const name=r['HO TEN CONG NHAN'];
    if(!wMap[name]) wMap[name]={ten:name,lo:r['LO']||'',phan_cay:parseInt(r['Phần cây'])||0,n:0,ct:0,db:0,mb:0,mu_tuoi:0,mu_day:0,att:{}};
    wMap[name].n++;
    const ds=String(parseDay(r['NGAY']||''));
    if(r['Chính thức']==='TRUE'){wMap[name].ct++;wMap[name].att[ds]='CT';}
    else if(r['Dự bị']==='TRUE'){wMap[name].db++;wMap[name].att[ds]='DB';}
    else if(r['Mưa bão']==='TRUE'){wMap[name].mb++;wMap[name].att[ds]='MB';}
    else if(r['Chủ nhật']==='TRUE') wMap[name].att[ds]='CN';
    else wMap[name].att[ds]='';
    wMap[name].mu_tuoi+=parseVN(r['Mủ tươi']); wMap[name].mu_day+=parseVN(r['Mủ dây']);
  });
  STATE.workers=Object.values(wMap);
}

function parseHieuSuat(rows){
  const totRow=rows.find(r=>(r['Họ tên công nhân']||'').includes('HO TEN'));
  STATE.hs_total=totRow?{kh:parseVN(totRow['Kế hoạch sản lượng mủ tươi']),tt:parseVN(totRow[' Sản lượng mủ tươi thực tế']||totRow['Sản lượng mủ tươi thực tế'])}:FALLBACK_HS_TOTAL;
  STATE.hs_workers=rows.filter(r=>{const n=r['Họ tên công nhân']||'';return n&&!n.includes('HO TEN')&&n.trim()!=='';})
    .map(r=>({ten:r['Họ tên công nhân'],kh:parseVN(r['Kế hoạch sản lượng mủ tươi']),tt:parseVN(r[' Sản lượng mủ tươi thực tế']||r['Sản lượng mủ tươi thực tế']),hs:parseVN(r['Hiệu suất thực'])/100,lo:STATE.workers.find(w=>w.ten===r['Họ tên công nhân'])?.lo||'',mu_day:STATE.workers.find(w=>w.ten===r['Họ tên công nhân'])?.mu_day||0}))
    .filter(r=>r.ten&&r.kh>0);
}

function parseTienLuong(rows){
  const findCol=(r,...keys)=>{for(const k of keys){const found=Object.keys(r).find(col=>col.replace(/\s+/g,' ').includes(k));if(found&&r[found])return r[found];}return '';};
  STATE.luong=rows.filter(r=>{const name=(r['Họ tên CN']||'').trim();return name&&name!==''&&!/^[,\s]*$/.test(name)&&isNaN(Number(name));})
    .map(r=>({ten:(r['Họ tên CN']||'').trim(),cong:parseVN(r['Tổng số công']),tcc:parseVN(findCol(r,'Tiền chuyên','cần (Riel)')),mu_tuoi:parseVN(findCol(r,'Tổng mủ','tươi (kg)')),tsl:parseVN(findCol(r,'Tiền sản','lượng (Riel)')),rank:(findCol(r,'Xếp hạng')||'').trim(),hs:parseVN(r['Hiệu suất'])/100,tong:parseVN(findCol(r,'TỔNG LƯƠNG'))}))
    .filter(r=>r.ten&&r.tong>0);
  if(STATE.luong.length===0){STATE.luong=FALLBACK_LUONG_WORKERS;}
}

function initFilters(){
  const wSel=document.getElementById('f-worker');
  if(wSel.options.length<=1){[...STATE.workers].sort((a,b)=>a.ten.localeCompare(b.ten)).forEach(w=>{const o=document.createElement('option');o.value=w.ten;o.textContent=w.ten;wSel.appendChild(o);});wSel.onchange=renderChamCong;}
  ['f-lo','f-sl-lo'].forEach(id=>{const sel=document.getElementById(id);if(sel.options.length<=1){ALL_LOS.forEach(lo=>{const o=document.createElement('option');o.value=lo;o.textContent=lo;sel.appendChild(o);});sel.onchange=id==='f-lo'?renderChamCong:renderSanLuong;}});
}
function renderAll(){renderTongQuan();renderChamCong();renderSanLuong();renderLuong();updateTopbar();}
function updateTopbar(){
  const hs=STATE.hs_total.kh?(STATE.hs_total.tt/STATE.hs_total.kh*100).toFixed(1)+'%':'—';
  document.getElementById('tb-cn').textContent=STATE.workers.length+' CN';
  document.getElementById('tb-sl').textContent=fmt(STATE.hs_total.tt)+' kg';
  document.getElementById('tb-hs').textContent=hs;
}

// ══════════════════════════════════════════════
// PAGE 0: TỔNG QUAN — chỉ số + summary + warnings
// ══════════════════════════════════════════════
function renderTongQuan(){
  if(!STATE.loaded) return;
  const totLuong=STATE.luong.reduce((s,d)=>s+d.tong,0);
  const totMu=STATE.hs_total.tt, totKH=STATE.hs_total.kh;
  const hieuSuat=totKH?totMu/totKH:0, diff=totMu-totKH;
  const tongNgayCong=STATE.workers.reduce((s,w)=>s+w.ct,0);
  const kgPerNC=tongNgayCong>0?totMu/tongNgayCong:0;
  const luongKg=totMu>0?totLuong/totMu:0;
  const cnDuoi=STATE.hs_workers.filter(w=>w.hs<0.85).length;
  const cnNghi=STATE.workers.filter(w=>w.ct<25).length;
  const cnDat=STATE.hs_workers.filter(w=>w.hs>=1).length;

  document.getElementById('tq-sl').textContent=fmt(totMu)+' kg';
  document.getElementById('tq-sl-pct').textContent=pct(hieuSuat)+' KH';
  document.getElementById('tq-sl-diff').innerHTML=diff>=0?`<span style="color:var(--green)">▲ Vượt ${fmt(diff)} kg</span>`:`<span style="color:var(--red)">▼ Thiếu ${fmt(Math.abs(diff))} kg</span>`;
  document.getElementById('tq-kh').textContent=fmt(totKH)+' kg';
  document.getElementById('tq-luong').textContent=(totLuong/1e6).toFixed(2)+'M R';
  document.getElementById('tq-luong-kg').textContent=fmt(luongKg)+' R/kg';
  document.getElementById('tq-kg-nc').textContent=kgPerNC.toFixed(1)+' kg';
  document.getElementById('tq-cn-dat').textContent=cnDat+' / '+STATE.hs_workers.length;
  document.getElementById('tq-cn-dat-pct').textContent=((cnDat/Math.max(1,STATE.hs_workers.length))*100).toFixed(0)+'% đạt KH';
  document.getElementById('tq-cn-duoi').textContent=cnDuoi+' CN';
  document.getElementById('tq-cn-nghi').textContent=cnNghi+' CN';

  // Executive Summary
  const sorted=[...STATE.hs_workers].sort((a,b)=>b.hs-a.hs);
  const top3=sorted.slice(0,3), bot3=[...STATE.hs_workers].sort((a,b)=>a.hs-b.hs).slice(0,3);
  document.getElementById('tq-summary').innerHTML=[
    `🌿 Sản lượng tháng 5 đạt <b>${fmt(totMu)} kg</b> — <b>${pct(hieuSuat)}</b> kế hoạch. ${diff>=0?`Vượt <b>${fmt(diff)} kg</b>.`:`Thiếu <b>${fmt(Math.abs(diff))} kg</b>.`}`,
    `💰 Quỹ lương tổ: <b>${(totLuong/1e6).toFixed(2)}M Riel</b>. Chi phí lao động: <b>${fmt(luongKg)} Riel/kg mủ</b>. Năng suất lao động: <b>${kgPerNC.toFixed(1)} kg/ngày công</b>.`,
    `👥 <b>${cnDat}/${STATE.hs_workers.length}</b> công nhân đạt kế hoạch. <b>${cnDuoi}</b> CN hiệu suất dưới 85% cần theo dõi. <b>${cnNghi}</b> CN chuyên cần dưới chuẩn (< 25 ngày).`,
    `📈 Top vượt KH: <b>${top3.map(w=>w.ten.split(' ').pop()+' ('+pct(w.hs)+')').join(', ')}</b>.`,
    `⚠️ Cần chú ý: <b>${bot3.map(w=>w.ten.split(' ').pop()+' ('+pct(w.hs)+')').join(', ')}</b>.`
  ].map(s=>`<div class="summary-item">${s}</div>`).join('');

  // Warnings
  const warnings=[];
  STATE.hs_workers.forEach(w=>{if(w.hs<0.85) warnings.push({type:'red',msg:`<b>${w.ten}</b> — Hiệu suất ${pct(w.hs)} (dưới 85%). Kiểm tra kỹ thuật cạo.`});});
  STATE.workers.forEach(w=>{if(w.ct<25) warnings.push({type:'yellow',msg:`<b>${w.ten}</b> — Chỉ đi <b>${w.ct}</b> ngày chính thức. Xác minh lý do nghỉ.`});});
  const avgLuongKg=luongKg;
  STATE.luong.forEach(w=>{const lkg=w.mu_tuoi>0?w.tong/w.mu_tuoi:0;if(lkg>avgLuongKg*1.3&&w.mu_tuoi>0) warnings.push({type:'yellow',msg:`<b>${w.ten}</b> — Lương/kg cao: <b>${fmt(lkg)} R/kg</b> (TB: ${fmt(avgLuongKg)} R/kg).`});});
  const warningEl=document.getElementById('tq-warnings');
  warningEl.innerHTML=warnings.length===0?'<div style="color:var(--green);padding:10px">✅ Không có cảnh báo nghiêm trọng.</div>':warnings.map(w=>`<div class="warning-item warning-${w.type}">▲ ${w.msg}</div>`).join('');
}

// ══════════════════════════════════════════════
// PAGE 1: CHẤM CÔNG — phân trang 10/trang
// ══════════════════════════════════════════════
function renderChamCong(){
  if(!STATE.loaded) return;
  const wk=document.getElementById('f-week').value;
  const wSel=document.getElementById('f-worker').value;
  const loSel=document.getElementById('f-lo').value;
  const wkF=d=>{if(wk==='1')return d.day<=7;if(wk==='2')return d.day>=8&&d.day<=15;if(wk==='3')return d.day>=16&&d.day<=22;if(wk==='4')return d.day>=23;return true;};
  let daily=STATE.daily.filter(wkF);
  let workers=STATE.workers;
  if(wSel!=='all') workers=workers.filter(w=>w.ten===wSel);
  if(loSel!=='all') workers=workers.filter(w=>w.lo===loSel);

  const cc28=STATE.workers.filter(w=>w.ct>=28).length;
  const off25=STATE.workers.filter(w=>w.ct<25).length;
  const maxD=daily.reduce((m,d)=>d.n>m.n?d:m,daily[0]||{n:0});
  document.getElementById('k1-luot').textContent=fmt(daily.reduce((s,d)=>s+d.n,0));
  document.getElementById('k1-avg').textContent=(daily.length?daily.reduce((s,d)=>s+d.n,0)/daily.length:0).toFixed(1);
  document.getElementById('k1-max').textContent=maxD?maxD.n+' CN':'—';
  document.getElementById('k1-max-sub').textContent=maxD?`Ngày ${maxD.day}/5`:'';
  document.getElementById('k1-cc').textContent=cc28+' CN';
  document.getElementById('k1-off').textContent=off25+' CN';

  destroyChart('daily-att');
  CHARTS['daily-att']=new Chart(document.getElementById('c-daily-att').getContext('2d'),{
    type:'bar',
    data:{labels:daily.map(d=>d.day+'/5'),datasets:[{label:'Số CN',data:daily.map(d=>d.n),backgroundColor:daily.map(d=>d.n>=27?'rgba(34,197,94,0.7)':d.n>=24?'rgba(234,179,8,0.7)':'rgba(239,68,68,0.65)'),borderRadius:4,barPercentage:0.7}]},
    options:{...CD,scales:{...CD.scales,y:{...CD.scales.y,min:18,max:32}}}
  });
  destroyChart('att-pie');
  const totCT=STATE.workers.reduce((s,w)=>s+w.ct,0),totDB=STATE.workers.reduce((s,w)=>s+w.db,0),totMB=STATE.workers.reduce((s,w)=>s+w.mb,0);
  CHARTS['att-pie']=new Chart(document.getElementById('c-att-pie').getContext('2d'),{
    type:'doughnut',
    data:{labels:['Chính Thức','Dự Bị','Mưa Bão'],datasets:[{data:[totCT,totDB,totMB],backgroundColor:['rgba(34,197,94,0.8)','rgba(59,130,246,0.8)','rgba(234,179,8,0.75)'],borderColor:'#111827',borderWidth:2}]},
    options:{responsive:true,maintainAspectRatio:true,cutout:'62%',plugins:{legend:{display:true,position:'bottom',labels:{color:'#94a3b8',font:{size:10},padding:8}},tooltip:{...CD.plugins.tooltip}}}
  });
  renderHeatmap(workers,wk);

  // Bảng phân trang
  const avgSlPerDay=STATE.hs_total.tt/Math.max(1,STATE.workers.reduce((s,w)=>s+w.ct,0));
  const sorted=[...workers].sort((a,b)=>b.ct-a.ct);
  renderAttTable(sorted, avgSlPerDay);
}

function renderAttTable(allWorkers, avgSlPerDay){
  const total=allWorkers.length;
  const totalPages=Math.ceil(total/PER_PAGE);
  if(PAGE.att>totalPages) PAGE.att=1;
  const start=(PAGE.att-1)*PER_PAGE;
  const pageData=allWorkers.slice(start, start+PER_PAGE);

  document.getElementById('tb-att').innerHTML=pageData.map((w,i)=>{
    const ngayNghi=Math.max(0,27-w.ct);
    const matSL=Math.round(ngayNghi*avgSlPerDay);
    const cc=w.ct>=28?`<span class="chip chip-green">Cao (${w.ct})</span>`:w.ct>=25?`<span class="chip chip-blue">Đủ (${w.ct})</span>`:`<span class="chip chip-red">Thấp (${w.ct})</span>`;
    return `<tr><td>${start+i+1}</td><td><b>${w.ten}</b></td><td class="r">${w.n}</td><td class="r" style="color:var(--green);font-weight:700">${w.ct}</td><td class="r" style="color:var(--blue)">${w.db}</td><td class="r" style="color:var(--yellow)">${w.mb}</td><td class="c">${cc}</td><td class="r" style="color:var(--text2)">${fmt(w.mu_tuoi)}</td><td class="r" style="color:var(--red);font-size:11px">~${fmt(matSL)} kg</td></tr>`;
  }).join('');
  renderPager('pager-att', PAGE.att, totalPages, p=>{PAGE.att=p; renderAttTable(allWorkers,avgSlPerDay);});
}

function renderHeatmap(workers,wk){
  let days=Array.from({length:31},(_,i)=>i+1);
  if(wk==='1')days=Array.from({length:7},(_,i)=>i+1);
  else if(wk==='2')days=Array.from({length:8},(_,i)=>i+8);
  else if(wk==='3')days=Array.from({length:7},(_,i)=>i+16);
  else if(wk==='4')days=Array.from({length:9},(_,i)=>i+23);
  const ws=[...workers].sort((a,b)=>a.ten.localeCompare(b.ten));
  let html=`<table class="heatmap"><thead><tr><th class="name-th">Họ Tên CN</th>${days.map(d=>`<th>${d}</th>`).join('')}<th>CT</th><th>Tổng</th></tr></thead><tbody>`;
  ws.forEach(w=>{
    html+=`<tr><td class="name-td">${w.ten}</td>`;
    days.forEach(d=>{const s=w.att&&w.att[String(d)];if(s==='CT')html+=`<td class="att-ct">C</td>`;else if(s==='DB')html+=`<td class="att-db">D</td>`;else if(s==='MB')html+=`<td class="att-mb">M</td>`;else if(s==='CN')html+=`<td class="att-cn">-</td>`;else if(s==='')html+=`<td class="att-vang">—</td>`;else html+=`<td class="att-empty"></td>`;});
    html+=`<td class="stat-td green">${w.ct}</td><td class="stat-td">${w.n}</td></tr>`;
  });
  document.getElementById('heatmap-table').innerHTML=html+'</tbody></table>';
}

// ══════════════════════════════════════════════
// PAGE 2: SẢN LƯỢNG
// ══════════════════════════════════════════════
function renderSanLuong(){
  if(!STATE.loaded) return;
  const lo=document.getElementById('f-sl-lo').value;
  const wk=document.getElementById('f-sl-week').value;
  let hs=[...STATE.hs_workers];
  if(lo!=='all') hs=hs.filter(w=>w.lo===lo);
  let daily=STATE.daily.filter(d=>d.mu_tuoi>0);
  if(wk==='1')daily=daily.filter(d=>d.day<=7);
  else if(wk==='2')daily=daily.filter(d=>d.day>=8&&d.day<=15);
  else if(wk==='3')daily=daily.filter(d=>d.day>=16&&d.day<=22);
  else if(wk==='4')daily=daily.filter(d=>d.day>=23);

  const totTT=hs.reduce((s,w)=>s+w.tt,0),totKH=hs.reduce((s,w)=>s+w.kh,0);
  const hieuSuat=totKH?totTT/totKH:0,diff=totTT-totKH;
  const dayMu=daily.length?daily.reduce((s,d)=>s+d.mu_tuoi,0)/daily.length:0;

  document.getElementById('k2-tt').textContent=fmt(totTT)+' kg';
  document.getElementById('k2-tt-pct').textContent=pct(hieuSuat)+' kế hoạch';
  document.getElementById('k2-kh').textContent=fmt(totKH)+' kg';
  document.getElementById('k2-kh-diff').textContent=diff>=0?`Vượt: +${fmt(diff)} kg`:`Thiếu: ${fmt(Math.abs(diff))} kg`;
  document.getElementById('k2-avg').textContent=fmt(dayMu)+' kg';
  document.getElementById('k2-per-cn').textContent=fmt(STATE.hs_total.tt/Math.max(1,STATE.workers.length))+' kg';

  const pctVal=Math.min(hieuSuat*100,120);
  document.getElementById('prog-pct').textContent=pct(hieuSuat);
  document.getElementById('prog-pct').style.color=clr(hieuSuat);
  document.getElementById('prog-fill').style.width=pctVal.toFixed(0)+'%';
  document.getElementById('prog-fill').style.background=hieuSuat>=1?'linear-gradient(90deg,var(--green),#16a34a)':hieuSuat>=0.85?'linear-gradient(90deg,var(--yellow),#ca8a04)':'linear-gradient(90deg,var(--red),#b91c1c)';
  document.getElementById('prog-tt').textContent=fmt(totTT)+' kg';
  document.getElementById('prog-kh').textContent=fmt(totKH)+' kg';
  document.getElementById('prog-diff-label').innerHTML=diff>=0?`<span style="color:var(--green)">▲ Vượt ${fmt(diff)} kg</span>`:`<span style="color:var(--red)">▼ Thiếu ${fmt(Math.abs(diff))} kg</span>`;

  // Insight
  const cnDat=hs.filter(w=>w.hs>=1).length;
  const ngayMin=daily.reduce((m,d)=>d.mu_tuoi<m.mu_tuoi?d:m,daily[0]||{mu_tuoi:0,day:0});
  const worstCN=[...hs].sort((a,b)=>a.hs-b.hs).slice(0,3);
  document.getElementById('sl-insight').innerHTML=`
    <div class="insight-item">📊 <b>${cnDat}/${hs.length}</b> CN đạt KH · <b>${hs.filter(w=>w.hs>=0.85&&w.hs<1).length}</b> gần đạt · <b>${hs.filter(w=>w.hs<0.85).length}</b> dưới 85%</div>
    <div class="insight-item">📉 Ngày SL thấp nhất: <b>Ngày ${ngayMin.day}/5</b> — <b>${fmt(ngayMin.mu_tuoi)} kg</b></div>
    <div class="insight-item">⚠️ CN thiếu nhiều nhất: <b>${worstCN.map(w=>w.ten.split(' ').pop()+' ('+pct(w.hs)+')').join(', ')}</b></div>`;

  // Chart: màu rõ hơn — nền xanh đậm, đường xanh sáng rõ
  destroyChart('sl-daily');
  CHARTS['sl-daily']=new Chart(document.getElementById('c-sl-daily').getContext('2d'),{
    type:'line',
    data:{labels:daily.map(d=>d.day+'/5'),datasets:[
      {label:'Mủ tươi (kg)',data:daily.map(d=>d.mu_tuoi),borderColor:'#22c55e',backgroundColor:'rgba(22,197,94,0.25)',tension:0.3,fill:true,pointBackgroundColor:'#22c55e',pointBorderColor:'#fff',pointBorderWidth:2,pointRadius:5,borderWidth:2.5},
      {label:'Mủ dây (kg)',data:daily.map(d=>d.mu_day),borderColor:'#60a5fa',backgroundColor:'rgba(96,165,250,0.12)',tension:0.3,fill:true,pointBackgroundColor:'#60a5fa',pointBorderColor:'#fff',pointBorderWidth:1.5,pointRadius:4,borderWidth:2,borderDash:[5,4]}
    ]},
    options:{...CD,plugins:{...CD.plugins,legend:{display:true,labels:{color:'#e8edf5',font:{size:11},boxWidth:14,padding:12}}}}
  });

  destroyChart('sl-dist');
  const over=hs.filter(w=>w.hs>=1).length,near=hs.filter(w=>w.hs>=0.85&&w.hs<1).length,under=hs.filter(w=>w.hs<0.85).length;
  CHARTS['sl-dist']=new Chart(document.getElementById('c-sl-dist').getContext('2d'),{
    type:'doughnut',
    data:{labels:['Đạt KH (≥100%)','Gần đạt (85–100%)','Thiếu (<85%)'],datasets:[{data:[over,near,under],backgroundColor:['rgba(34,197,94,0.85)','rgba(234,179,8,0.8)','rgba(239,68,68,0.75)'],borderColor:'#111827',borderWidth:2}]},
    options:{responsive:true,maintainAspectRatio:true,cutout:'60%',plugins:{legend:{display:true,position:'bottom',labels:{color:'#94a3b8',font:{size:10},padding:6}},tooltip:{...CD.plugins.tooltip,callbacks:{label:c=>`${c.label}: ${c.raw} CN`}}}}
  });

  const hsSorted=[...hs].sort((a,b)=>b.tt-a.tt);
  destroyChart('sl-worker');
  CHARTS['sl-worker']=new Chart(document.getElementById('c-sl-worker').getContext('2d'),{
    type:'bar',
    data:{labels:hsSorted.map(w=>w.ten.split(' ').slice(-1)[0]),datasets:[
      {label:'KH (kg)',data:hsSorted.map(w=>w.kh),backgroundColor:'rgba(99,150,250,0.45)',borderColor:'rgba(99,150,250,0.8)',borderWidth:1,borderRadius:3,barPercentage:0.4,categoryPercentage:0.85},
      {label:'TT (kg)',data:hsSorted.map(w=>w.tt),backgroundColor:hsSorted.map(w=>w.hs>=1?'rgba(34,197,94,0.85)':'rgba(239,68,68,0.7)'),borderWidth:0,borderRadius:3,barPercentage:0.4,categoryPercentage:0.85}
    ]},
    options:{...CD,plugins:{...CD.plugins,legend:{display:true,labels:{color:'#e8edf5',font:{size:11},boxWidth:14}}}}
  });

  // Bảng sản lượng — dùng hs_workers làm data
  document.getElementById('tb-sl').innerHTML=[...hs].sort((a,b)=>b.tt-a.tt).map((w,i)=>{
    const hsPct=pct(w.hs),barW=Math.min(w.hs*100,130)/1.3;
    const barCls=w.hs>=1?'bar-green':w.hs>=0.85?'bar-orange':'bar-red';
    const status=w.hs>=1?'<span class="chip chip-green">✓ Đạt</span>':w.hs>=0.85?'<span class="chip chip-yellow">~ Gần</span>':'<span class="chip chip-red">✗ Thiếu</span>';
    return `<tr><td>${i+1}</td><td><b>${w.ten}</b></td><td class="r" style="color:var(--blue)">${fmt(w.kh)}</td><td class="r" style="color:var(--green);font-weight:700">${fmt(w.tt)}</td><td><div class="bar-inline"><div class="bar-track"><div class="bar-fill ${barCls}" style="width:${barW.toFixed(0)}%"></div></div><span class="bar-label" style="color:${clr(w.hs)}">${hsPct}</span></div></td><td class="r">${fmt(w.mu_day)}</td><td class="c">${status}</td></tr>`;
  }).join('');
}

// ══════════════════════════════════════════════
// PAGE 3: LƯƠNG — phân trang 10/trang
// ══════════════════════════════════════════════
function renderLuong(){
  if(!STATE.loaded) return;
  const sortBy=document.getElementById('f-l-sort').value;
  const hsFilter=document.getElementById('f-l-hs').value;
  const rankFilter=document.getElementById('f-l-rank').value;
  let data=[...STATE.luong];
  if(hsFilter==='over') data=data.filter(d=>d.hs>=1);
  if(hsFilter==='under') data=data.filter(d=>d.hs<1);
  if(rankFilter!=='all') data=data.filter(d=>d.rank===rankFilter);
  const rO={'A+':0,'A':1,'B':2,'C':3,'D':4,'E':5};
  if(sortBy==='luong') data.sort((a,b)=>b.tong-a.tong);
  else if(sortBy==='hs') data.sort((a,b)=>b.hs-a.hs);
  else if(sortBy==='cong') data.sort((a,b)=>b.cong-a.cong);
  else data.sort((a,b)=>(rO[a.rank]??9)-(rO[b.rank]??9));

  const all=STATE.luong;
  const totLuong=all.reduce((s,d)=>s+d.tong,0);
  const totMu=all.reduce((s,d)=>s+d.mu_tuoi,0);
  const over100=all.filter(d=>d.hs>=1).length;
  const hsAvg=STATE.hs_total.kh?(STATE.hs_total.tt/STATE.hs_total.kh*100).toFixed(1)+'%':'—';
  const luongKg=totMu>0?totLuong/totMu:0;

  document.getElementById('k3-total').textContent=(totLuong/1e6).toFixed(2)+'M R';
  document.getElementById('k3-avg').textContent=fmtK(totLuong/Math.max(1,all.length));
  document.getElementById('k3-over').textContent=over100+' CN';
  document.getElementById('k3-over-pct').textContent=((over100/Math.max(1,all.length))*100).toFixed(0)+'% tổng tổ';
  document.getElementById('k3-hs-avg').textContent=hsAvg;
  document.getElementById('k3-luong-kg').textContent=fmt(luongKg)+' R/kg';
  document.getElementById('k3-total-display').textContent='Quỹ lương: '+fmt(totLuong)+' Riel';

  destroyChart('hs-bar');
  const hsSorted=[...STATE.hs_workers].sort((a,b)=>b.hs-a.hs);
  CHARTS['hs-bar']=new Chart(document.getElementById('c-hs-bar').getContext('2d'),{
    type:'bar',
    data:{labels:hsSorted.map(w=>w.ten.split(' ').slice(-1)[0]),datasets:[{label:'Hiệu suất (%)',data:hsSorted.map(w=>(w.hs*100).toFixed(1)),backgroundColor:hsSorted.map(w=>w.hs>=1.15?'rgba(59,130,246,0.85)':w.hs>=1?'rgba(34,197,94,0.8)':w.hs>=0.85?'rgba(234,179,8,0.75)':'rgba(239,68,68,0.7)'),borderRadius:3}]},
    options:{...CD,scales:{...CD.scales,y:{...CD.scales.y,min:50,ticks:{...CD.scales.y.ticks,callback:v=>v+'%'}}}}
  });

  destroyChart('luong-pie');
  const totCC=all.reduce((s,d)=>s+d.tcc,0),totSL=all.reduce((s,d)=>s+d.tsl,0),totKT=Math.max(0,totLuong-totCC-totSL);
  CHARTS['luong-pie']=new Chart(document.getElementById('c-luong-pie').getContext('2d'),{
    type:'doughnut',
    data:{labels:['Chuyên Cần','Sản Lượng','KT & Hiệu Suất'],datasets:[{data:[totCC,totSL,totKT],backgroundColor:['rgba(34,197,94,0.85)','rgba(59,130,246,0.85)','rgba(234,179,8,0.8)'],borderColor:'#111827',borderWidth:2}]},
    options:{responsive:true,maintainAspectRatio:true,cutout:'60%',plugins:{legend:{display:true,position:'bottom',labels:{color:'#94a3b8',font:{size:10},padding:8}},tooltip:{...CD.plugins.tooltip,callbacks:{label:c=>`${c.label}: ${fmtK(c.raw)} (${((c.raw/totLuong)*100).toFixed(1)}%)`}}}}
  });

  destroyChart('luong-bar');
  const lSort=[...all].sort((a,b)=>b.tong-a.tong);
  CHARTS['luong-bar']=new Chart(document.getElementById('c-luong-bar').getContext('2d'),{
    type:'bar',
    data:{labels:lSort.map(l=>l.ten.split(' ').slice(-1)[0]),datasets:[
      {label:'Chuyên Cần',data:lSort.map(l=>l.tcc),backgroundColor:'rgba(34,197,94,0.75)',borderRadius:2,stack:'s'},
      {label:'Sản Lượng',data:lSort.map(l=>l.tsl),backgroundColor:'rgba(59,130,246,0.75)',borderRadius:2,stack:'s'},
      {label:'KT/HS',data:lSort.map(l=>Math.max(0,l.tong-l.tcc-l.tsl)),backgroundColor:'rgba(234,179,8,0.75)',borderRadius:2,stack:'s'}
    ]},
    options:{...CD,plugins:{...CD.plugins,legend:{display:true,labels:{color:'#e8edf5',font:{size:11},boxWidth:14}}},scales:{x:{...CD.scales.x,stacked:true},y:{...CD.scales.y,stacked:true,ticks:{...CD.scales.y.ticks,callback:v=>fmtK(v)}}}}
  });

  destroyChart('luong-scatter');
  CHARTS['luong-scatter']=new Chart(document.getElementById('c-luong-scatter').getContext('2d'),{
    type:'scatter',
    data:{datasets:[{label:'CN',data:all.map(w=>({x:w.mu_tuoi,y:w.tong/1000,name:w.ten.split(' ').pop()})),backgroundColor:all.map(w=>w.hs>=1?'rgba(34,197,94,0.75)':w.hs>=0.85?'rgba(234,179,8,0.75)':'rgba(239,68,68,0.7)'),pointRadius:6,pointHoverRadius:8}]},
    options:{...CD,plugins:{...CD.plugins,tooltip:{...CD.plugins.tooltip,callbacks:{label:c=>[`${c.raw.name}`,`SL: ${fmt(c.raw.x)} kg`,`Lương: ${fmt(c.raw.y)}K R`]}}},
      scales:{x:{...CD.scales.x,title:{display:true,text:'Sản lượng (kg)',color:'#4b5769',font:{size:10}}},y:{...CD.scales.y,title:{display:true,text:'Lương (K Riel)',color:'#4b5769',font:{size:10}}}}}
  });

  // Phân trang bảng lương
  renderLuongTable(data, luongKg);

  // Footer tổng
  document.getElementById('ft-cong').textContent=data.reduce((s,d)=>s+d.cong,0).toFixed(0);
  document.getElementById('ft-cc').textContent=fmt(data.reduce((s,d)=>s+d.tcc,0))+' R';
  document.getElementById('ft-mu').textContent=fmt(data.reduce((s,d)=>s+d.mu_tuoi,0))+' kg';
  document.getElementById('ft-sl').textContent=fmt(data.reduce((s,d)=>s+d.tsl,0))+' R';
  document.getElementById('ft-luong').textContent=fmt(data.reduce((s,d)=>s+d.tong,0))+' R';
  document.getElementById('ft-luong').style.color='var(--orange)';
}

function renderLuongTable(allData, luongKg){
  const total=allData.length;
  const totalPages=Math.ceil(total/PER_PAGE);
  if(PAGE.luong>totalPages) PAGE.luong=1;
  const start=(PAGE.luong-1)*PER_PAGE;
  const pageData=allData.slice(start, start+PER_PAGE);

  document.getElementById('tb-luong').innerHTML=pageData.map((d,i)=>{
    const hsPct=pct(d.hs),barW=Math.min(d.hs*100,130)/1.3;
    const barCls=d.hs>=1?'bar-green':d.hs>=0.85?'bar-orange':'bar-red';
    const rankCls={'A+':'rank-ap','A':'rank-a','B':'rank-b','C':'rank-c','D':'rank-d','E':'rank-e'}[d.rank]||'rank-b';
    const lkg=d.mu_tuoi>0?d.tong/d.mu_tuoi:0;
    const lkgClr=lkg>luongKg*1.25?'var(--red)':lkg>luongKg*1.1?'var(--yellow)':'var(--text2)';
    return `<tr><td>${start+i+1}</td><td><b>${d.ten}</b></td><td class="r">${d.cong}</td><td class="r" style="color:var(--green)">${fmt(d.tcc)}</td><td class="r">${fmt(d.mu_tuoi)} kg</td><td class="r" style="color:var(--blue)">${fmt(d.tsl)}</td><td class="c"><span class="rank ${rankCls}">${d.rank||'B'}</span></td><td><div class="bar-inline"><div class="bar-track"><div class="bar-fill ${barCls}" style="width:${barW.toFixed(0)}%"></div></div><span class="bar-label" style="color:${clr(d.hs)}">${hsPct}</span></div></td><td class="r" style="color:${lkgClr};font-size:11px">${fmt(lkg)}</td><td class="r" style="color:var(--orange);font-weight:800;font-family:var(--mono)">${fmt(d.tong)}</td></tr>`;
  }).join('');
  renderPager('pager-luong', PAGE.luong, totalPages, p=>{PAGE.luong=p; renderLuongTable(allData, luongKg);});
}

// ══════════════════════════════════════════════
// PAGER component
// ══════════════════════════════════════════════
function renderPager(containerId, current, total, onPage){
  const el=document.getElementById(containerId);
  if(!el||total<=1){if(el)el.innerHTML='';return;}
  let html=`<div class="pager">`;
  html+=`<button class="pager-btn" ${current===1?'disabled':''} onclick="(${onPage.toString()})(${current-1})">‹ Trước</button>`;
  for(let i=1;i<=total;i++){
    if(i===1||i===total||Math.abs(i-current)<=1){
      html+=`<button class="pager-btn ${i===current?'active':''}" onclick="(${onPage.toString()})(${i})">${i}</button>`;
    } else if(Math.abs(i-current)===2){
      html+=`<span class="pager-dots">…</span>`;
    }
  }
  html+=`<button class="pager-btn" ${current===total?'disabled':''} onclick="(${onPage.toString()})(${current+1})">Sau ›</button>`;
  html+=`<span class="pager-info">Trang ${current}/${total}</span></div>`;
  el.innerHTML=html;
}

document.addEventListener('DOMContentLoaded',()=>loadAllData());
