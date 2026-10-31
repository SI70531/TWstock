# TWstock

台股研究網站，GitHub Pages：https://si70531.github.io/TWstock/

## 檔案

```
index.html               首頁：儀表板（分頁 + 動畫圖表）、登入與裝置 PIN
assets/twdash.js/.css    儀表板：滑動膠囊分頁、折線自己畫出、長條長高、環形圖掃出（目前是示意資料，換掉檔案裡的 DATA 即可）
assets/twaccount.js      帳號、裝置 PIN 與自選股同步（與 EZexams 共用同一個 Supabase 專案和 Worker）
tools/supabase-twstock.sql  自選股資料表（Row Level Security）
```

## 帳號

- 帳號和 EZexams 相同，同一組帳號密碼在兩個網站都能用。
- 登入後可以設定這台裝置的 4 位數 PIN，之後用 PIN 直接登入。PIN 只對這台裝置有效，錯 5 次就會移除，需要重新用密碼登入。
- 沒有登入時，自選股只存在這台瀏覽器。

## 一次性設定

1. Supabase → SQL Editor：執行 `tools/supabase-twstock.sql`。
2. Worker（`ezexams-ai`）已在 EZexams 設定好，TWstock 與它同一個網站來源（`https://si70531.github.io`），不需要另外設定。
