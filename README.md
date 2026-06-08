# Cao Su Siêm Riệp — Tổ 5 Dashboard 🌿

**Báo cáo sản lượng & lương tháng 5/2026**  
Company: Cao su Siêm Riệp · Đội sản xuất số 1 · Tổ 5

## Trang báo cáo
- 📋 **Chấm Công Hàng Ngày** — Heatmap chấm công, bộ lọc tuần/lô/CN
- 🌿 **Sản Lượng** — KH vs TT, biểu đồ ngày, ranking CN
- 💰 **Hiệu Suất & Lương** — Phân tích lương stacked, hiệu suất CN

## Deploy lên GitHub Pages
```bash
git init
git add .
git commit -m "init: dashboard cao su to5"
git branch -M main
git remote add origin https://github.com/[USERNAME]/cao-su-to5.git
git push -u origin main
# GitHub: Settings → Pages → main → root → Save
```

## Kết nối Google Sheets (Live Data)

### Cách 1 — Publish sheet (đơn giản nhất)
1. Google Sheets → File → **Share** → **Publish to web**
2. Chọn từng sheet → Publish → OK
3. Dữ liệu sẽ tự load khi mở web (không cần config thêm)

### Cách 2 — Apps Script (mạnh hơn, cho công thức phức tạp)
1. Google Sheets → Extensions → **Apps Script**
2. Paste nội dung file `apps_script.gs` vào
3. Deploy → **New deployment** → Web App → Anyone → Deploy
4. Copy URL `/exec`
5. Mở `data.js` → thay `APPS_SCRIPT_URL = ""` → paste URL vào

## Sheet ID
```
119n7cRWVAJLwgltgElMmRyfie2uoBH168LfVPJlRTMc
```

## Tech Stack
- HTML5 + CSS3 (Variables, Flexbox, Grid)
- Chart.js 4.4
- PapaParse 5.4 (CSV parsing)
- Google Sheets GViz API (no API key needed)
- Vanilla JS (no framework)
