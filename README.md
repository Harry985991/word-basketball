# 單字籃球王

以 NBA 球員與籃球情境例句設計的國一英文單字遊戲，目前題庫共 20 字。

- 英文選中文的兩分球模式
- 中文拼英文的三分球模式
- 每日 10 個新字＋最多 10 個歷史字，並以錯字優先複習
- 同日重玩會重新抽歷史字，盡可能避開上一輪題目
- 每場時間、得分、錯題與每字正確率
- 原創新秀角色、球衣號碼與裝備更衣室
- 新秀到總冠軍的五階段賽季地圖與 XP 升級
- 真實對手比分、中場、勝敗、抄截、籃板與逆轉判定
- 投籃進球／碰框動畫、球場音效與 ON FIRE 狀態
- 六枚成就徽章，以及球衣、球鞋和球場解鎖
- 裝置內保存，以及可選的 Firebase Google 登入同步
- 手機、平板與電腦響應式畫面

## 本機預覽

此專案是純靜態網站，可從本目錄啟動任一靜態網站伺服器後開啟。

## 跨裝置同步

Firebase 專案為 `word-basketball-0204`。玩家點選右上角「裝置紀錄」後，以同一個 Google 帳號登入，即可在手機、平板與電腦共用作答紀錄。

- 每個 Google 帳號都是一位獨立玩家，紀錄互不混用。
- 右上角會顯示目前登入的玩家姓名與信箱。
- 可從玩家選單登出或切換 Google 帳號。
- 新 Google 帳號第一次登入時，可選擇從零建立球員，或匯入這台裝置尚未登入時的訪客紀錄。

Firebase Web 設定不等於管理員密鑰；任何 service account、私鑰或管理員憑證都不得放進本專案。

## 正式網站

正式網站：<https://word-basketball-0204.firebaseapp.com/>

原始碼持續由 GitHub 管理；Firebase Hosting 與 Firebase Authentication 使用相同網域，讓手機與桌機的 Google 登入更穩定。GitHub Pages 仍保留為預覽網址。

Repository：<https://github.com/Harry985991/word-basketball>

GitHub Pages 預覽：<https://harry985991.github.io/word-basketball/>
