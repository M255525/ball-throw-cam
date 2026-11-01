# ball-throw-cam — 體感丟球大作戰

單檔靜態網頁遊戲（`index.html`＋`manual.html`＋PWA 檔），無建置步驟。跟 `fruit-ninja-cam`／`boxing-cam` 同一套攝影機骨架（`initCamera`／`refreshCamPicker`／`pickPreferredCam`／`lmToScreen`／滑鼠降級／跑馬燈／PWA 安裝段落都是複製來的），差異在玩法。port 8847。2026-11-01 建立，**尚未建 GitHub repo、未上 Pages**（上線前先問使用者）。

## 玩法
- 角色（男／女，可上傳長相照片當圓形大頭）在上方左右走，碰到左右邊界 → 反向＋`row+1`（降一格）。腳底越過防線（`LINE_RATIO=0.80`×H）→ 丟球的人輸。
- 命中：+10（連擊每次 +5，上限 +25；打到頭 +5「正中！」），角色 `hp-1`、`row-0.5`（被打回半格）、`hitT` 受擊動畫（舉手、XX 眼、💢、照片泛紅）。hp 歸零過關，`row` 重置；三關 `LEVELS`：hp 8/12/16、速度 0.16/0.23/0.30×W、降格 0.075/0.085/0.095×H；第 2 關起丟球時有機率 `dashT` 加速閃避，第 3 關 `tricky` 會突然停下／回頭＋變速。
- 同時最多 `MAX_BALLS=3` 顆在空中，重力 1.0×H/s²。
- 這些規則是使用者只描述了「左右移動、碰邊降一格、被丟球、太低就輸」後我自行決定的，使用者若要改依此調整。

## 丟球判定
- 體感：HandLandmarker（numHands 2），手掌點＝landmark 0/5/9/13/17 平均。`detectThrow(samples, now)` 是純函式：時間窗內最低點→最新點上升 ≥ rise 門檻、上升量 ≥ 0.6×橫向位移、最近 ≥50ms 瞬時上升速度 ≥ speed 門檻。門檻以 H 為比例（`RISE_BASE=0.14`、`WINDOW_BASE=260ms`、`SPEED_BASE=1.1`），`effThresholds()` 依靈敏度 1~5（`SENS_FACTOR`）縮放。冷卻 350ms。
- 備援：握拳（`handOpenness<1.35`）→ 0.6 秒內張開（>1.7）＝`aimedThrow` 自動瞄準頭部（含重力補償）。
- 滑鼠／觸控：往上拖曳放開＝依方向與放開前 120ms 速度丟；點一下（<25px）＝從下方中央瞄準點擊處丟。

## 儲存（localStorage，全部 try/catch）
`btc-settings`（gender/name/sens/ballSpeed/startLevel/sound）、`btc-face`（256px JPEG dataURL，照片只在本機）、`btc-best`、`btc-leaderboard`、`btc-cam`、`btc-warned`（首訪警語）、`btcMarquee`。

## 已知限制
- 丟球門檻只用合成軌跡驗證過（快速上甩觸發、慢抬手與橫揮不觸發、靈敏度 5 才接受 0.12H 小動作），**尚未用真實攝影機測手感**；真機若判定不準，先請使用者調靈敏度滑桿，調到極限仍不行才改 `_BASE` 常數。
- 握拳判定比例、鏡像方向沿用 fruit-ninja-cam 慣例，未經真人驗證。

## 測試
- 本機：`python -m http.server 8847`（launch.json 名稱 `ball-throw-cam`）。
- **只走滑鼠模式**：`document.getElementById('mouse-btn').click()` 後先確認 `__game.mode==='mouse'`，避免誤開真實攝影機。
- `window.__game._test`：`step(dt)`、`throwBall(x,y,vx,vy)`、`aimedThrow`、`detectThrow`、`effThresholds`、`headInfo(hero)`、`rowsLeft`、`setHeroRow(r)`、`forceEdge()`、`set`（設定物件）。斷言要在同一次 evaluate 內做完（背景 rAF 迴圈會讓角色繼續走、降格）；測命中時先把 `G.bannerTime` 設大讓角色停住。
- 2026-11-01 已驗證：碰邊反向＋降格、命中加分扣血上推、球數上限、過關換關、越過防線 Game Over、真滑鼠拖曳丟球、照片上傳／女生角色、375px 無溢出、console 無錯誤。
