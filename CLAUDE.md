# ball-throw-cam — 體感丟球大作戰

靜態網頁遊戲（`index.html`＋`scene3d.js`（3D 背景）＋`manual.html`＋PWA 檔），無建置步驟。跟 `fruit-ninja-cam`／`boxing-cam` 同一套攝影機骨架（`initCamera`／`refreshCamPicker`／`pickPreferredCam`／`lmToScreen`／滑鼠降級／跑馬燈／PWA 安裝段落都是複製來的），差異在玩法。port 8847。2026-11-01 建立並上線（使用者要求）：公開 repo <https://github.com/M255525/ball-throw-cam>，GitHub Pages（Actions workflow，push 到 master 自動部署）<https://m255525.github.io/ball-throw-cam/>。visitor-badge `m255525.ballthrowcam`。

## 玩法
- 角色（男／女，可上傳長相照片當圓形大頭）在上方左右走，碰到左右邊界 → 反向＋`row+1`（降一格）。腳底越過防線（`LINE_RATIO=0.80`×H）→ 丟球的人輸。
- 命中：+10（連擊每次 +5，上限 +25；打到頭 +5「正中！」），角色 `hp-1`、`row-0.5`（被打回半格）、`hitT` 受擊動畫（舉手、XX 眼、💢、照片泛紅）。hp 歸零過關，`row` 重置；三關 `LEVELS`：hp 8/12/16、速度 0.16/0.23/0.30×W、降格 0.075/0.085/0.095×H；第 2 關起丟球時有機率 `dashT` 加速閃避，第 3 關 `tricky` 會突然停下／回頭＋變速。
- 同時最多 `MAX_BALLS=3` 顆在空中，重力 1.0×H/s²。
- 這些規則是使用者只描述了「左右移動、碰邊降一格、被丟球、太低就輸」後我自行決定的，使用者若要改依此調整。

## 丟球判定（2026-11-01 使用者實機回報「手感不是很順」後改版）
- 體感：HandLandmarker（**numHands 1**、攝影機 640×360，減負擔拉高偵測幀率），手掌點＝landmark 0/5/9/13/17 平均再做 EMA（`PALM_SMOOTH=0.55`）。`detectThrow(samples, now, relax=1)` 是純函式：時間窗內最低點→最新點上升 ≥ rise 門檻、上升量 ≥ 0.5×橫向位移、最近 ≥33ms 瞬時上升速度 ≥ speed 門檻（樣本只要 2 點，CPU 模式 15fps 也能判）。基準值 `RISE_BASE=0.10`、`WINDOW_BASE=350ms`、`SPEED_BASE=0.8`（舊版 0.14/260/1.1 太嚴），`effThresholds()` 依靈敏度 1~5（`SENS_FACTOR`）縮放。冷卻 350ms。
- **手消失補判**：甩太快手會糊掉、追蹤中斷——手剛消失（最後樣本 <250ms）時用 `RELEASE_RELAX=0.65` 放寬門檻再判一次（`hs.released` 防重複）。
- **瞄準輔助** `SET.assist`（off/low/high＝0/0.35/0.65，預設 low）：`throwFromGesture` 把甩動初速與「正好打中頭（含重力補償）」的初速加權；滑鼠拖曳也套用。
- **力道環**：手掌外圈依 `upSpeed/門檻` 填滿，達門檻變綠＝會出手。**偵測數值面板**（設定「顯示偵測數值」，只在體感模式）：偵測 fps、上甩速度／門檻、上升高度／門檻、最後出手方式——使用者回報手感時請他開這個看數字再調。
- 備援：握拳（`handOpenness<1.35`）→ 0.6 秒內張開（>1.7）＝`aimedThrow` 自動瞄準頭部。
- 滑鼠／觸控：往上拖曳放開＝依方向與放開前 120ms 速度丟；點一下（<25px）＝從下方中央瞄準點擊處丟。

## 大頭照裁切（2026-11-01 使用者要求可放大縮小找最合適區域）
上傳後開 `#crop-modal`：拖曳移動、滑桿／滾輪／兩指縮放（zoom 0.6~5），虛線圓框（`CROP_R=0.42×畫布`）＝成品範圍。原圖縮到最長邊 1024 存 `btc-face-src`，參數 `btc-face-crop {cx,cy,zoom}`（原圖座標圓心），成品 256px 存 `btc-face`；「✂ 調整照片」沿用上次參數重裁，新上傳按取消不會覆蓋原照片。

## 換裝（2026-11-01 使用者要求）
開始畫面「👕 換裝」→ `#wardrobe-modal` 衣櫃（左側 `#ward-preview` 走路動畫即時預覽，`.ward-prev` sticky；手機版改成滿寬實底頂部列，否則預覽會蓋住選項）。資料在 `OUTFIT_DEFAULT`（男女預設，等同舊版固定外觀）／`OUTFIT_PRESETS`（7 套）／`WARDROBE`（頭飾、眼鏡、上衣、上衣色、下身、下身色、鞋、披風、髮色）。`drawHero(c, hero, {outfit})` 依 `curOutfit(gender)`（預設＋`SET.outfits[gender]` 覆寫）繪製，全部程式畫無圖檔；男女裝扮分開存、切換性別不互相覆蓋；照片頭像一樣可戴頭飾／眼鏡（眼鏡畫在卡通臉眼睛高度，對照片只是大略位置）。有頭飾時名字血條往上讓位（`hatH`）。按「完成」才寫入 `SET.outfits`。「英雄披風」只是通用披風造型，不要加任何特定超級英雄標誌（智財權）。

## 角色畫風（2026-11-02 使用者要求美化）
貼紙風 Q 版：所有形狀加深色描邊 `HERO_OL`（`fillOL`／`limb` 先粗深色再細彩色）、衣服左亮右暗漸層（`grad`）、手腳兩段有手肘膝蓋、左右腳前後交替＋手反向擺＋走路上下彈跳（`bob`，只 1% 身高，不影響命中）、大眼高光＋眉毛＋鼻子＋張嘴笑＋腮紅、約 3.6 秒眨眼一次（用 `performance.now()`，預覽畫面也會動）；受擊＝XX 眼＋O 嘴＋汗滴＋舉手亂揮。男生刺蝟瀏海＋翹毛＋耳朵；女生長髮畫在身體後面垂到肩下，前面側分瀏海＋兩側髮束（舊版整圈頭髮繞到下巴像鬍子，已改掉）。**頭的圓心與半徑公式不能動**——要跟 `headInfo()` 一致，命中判定靠它。
2026-11-07 二次美化（使用者要求「對主角色再進行美化」）：動漫大眼（深色眼框→虹膜漸層（男棕、女紫）→瞳孔→雙高光→上眼線，女生睫毛）、柔和腮紅＋斜線、張嘴露上排牙齒；頭髮 `hairGrad()` 上亮下暗、男生 `backHairMale()` 後髮蓬鬆（照片頭像也會露出）、髮尖改曲線、`bangsPath()` 先位移畫一次當額頭髮影、光澤環＋髮絲線；`limb` 加亮面細線；手有拇指；球鞋（鞋身漸層＋白鞋底＋鞋帶）；上衣賽璐珞暗面＋領口陰影＋皺褶；地面軟陰影；照片頭像加暗角與高光；受擊頭上三顆星星繞圈（`star()`）。

## 丟擲物件（2026-11-04 使用者要求可選玻璃杯、椅子等）
`ITEMS`（ball/glass/chair/pillow/slipper/pie）每種有 size／speed／grav／spin（相對球的倍率）、dmg／push／bonus／max（同時在飛上限，取代舊 `MAX_BALLS`）、slow、snd（命中音效）。`SET.item` 可再選 `random`（每丟一次重抽，`pickNext()`；`G.nextItem` 是實際下一個）。開始畫面 `#item-grid` 選、遊戲中 `#hud-item` 循環切換。**速度／重力倍率要在算初速時一起帶入**（`throwFromGesture`／`aimedThrow`），否則瞄準補償會偏。全部程式繪製（`ITEM_DRAW`，單位座標 r=1）。奶油派糊臉 `drawCream` 疊在角色上層，不動 `drawHero`。拖鞋是藍白拖造型。各物件數值是我自定，使用者可調。

## 3D 情境背景（2026-11-07 使用者要求「用 3D 方式進行情境化」）
- `scene3d.js`（ES module，`import * as THREE from 'three'`，importmap 指向 jsDelivr three@0.160.0，同 jetski-cam）畫在 `#scene3d` 畫布、位於 `#game` 2D 畫布後面。**遊戲判定、角色、物件全部仍在 2D**，3D 只是背景與氣氛，`headInfo()`／命中規則完全沒動。
- `index.html` 用 `import('./scene3d.js')` 動態載入，失敗就 `S3=null` 退回原本 2D 漸層背景。`use3D()`＝S3 存在且不是「體感模式＋背景選攝影機」。`applyBg()` 切 `body.has3d`、`#cam.pip`（體感模式下攝影機縮成左下角小視窗，偵測數值面板會往上讓位）、`#veil`。
- 三關情境＝`LEVELS[].name` 也改成「第 1 關・校園操場／第 2 關・夜市／第 3 關・頂樓煙火」：操場（跑道、看台觀眾、教學大樓、旗子飄、籃球架、樹、雲）、夜市（兩排攤位招牌＝通用小吃名、騎樓建築窗戶自發光、跨街燈串閃爍、燈籠擺動、牌樓、走動人潮）、頂樓（磁磚、女兒牆燈串、水塔／冷氣／曬衣架、自發光城市天際線＋通用造型高塔、星星月亮、自動煙火）。全部程式產生，無外部素材。
- 鏡頭：眼高 1.6m、FOV 55，pitch 依 `HORIZON=0.2` 讓地平線固定在畫面 20% 高。**畫面上緣只比地平線高約 10°**，放在天上的東西（煙火、雲、太陽月亮）y 要低，否則會在畫面外。
- `s3Marks()` 把每格腳底的畫面 y 與防線 y 用 `screenToGround()` 反推地面 z，畫地上格線＋紅膠帶＋三角錐；`setupLevel`／`resize` 時重建。左右兩側物件用 `anchor(l,obj,side,dist,out,ref)` 依畫面寬擺放：沒給 `ref` 會貼著畫面邊緣（所有距離都疊在同一個螢幕 x），給 `ref` 則是固定街寬往遠方收斂（夜市攤位用這個，最小 3.6m，手機直式才不會擋角色）。
- 事件：`onHit`（觀眾歡呼、鏡頭微震；第 3 關或打頭／椅子放煙火）、`onDrop`（鏡頭晃）、`celebrate`（過關全場歡呼＋五發煙火）、`setDanger`（剩 1 格內光線變暗）。開始畫面是半透明，背後看得到第 1 關緩慢擺鏡。
- 設定 `SET.bg`：`3d`（預設）／`cam`。測試掛鉤 `_test.s3()`、`use3D`、`applyBg`。

## 儲存（localStorage，全部 try/catch）
`btc-settings`（gender/name/sens/ballSpeed/startLevel/sound/assist/debug/outfits/item/bg）、`btc-face`（256px JPEG dataURL，照片只在本機）、`btc-face-src`、`btc-face-crop`、`btc-best`、`btc-leaderboard`、`btc-cam`、`btc-warned`（首訪警語）、`btcMarquee`。

## 已知限制
- 丟球門檻只用合成軌跡驗證過（30fps／15fps 甩手、左上甩會觸發；慢抬手、橫揮、手抖不觸發；糊掉的半段甩手靠放寬補判接住）。第一版使用者實機覺得不順，已放寬＋加補判／輔助／力道環；**改版後尚未有真機回饋**。下一步請使用者開「顯示偵測數值」回報 fps 與上甩速度，再調 `_BASE`。
- 握拳判定比例、鏡像方向沿用 fruit-ninja-cam 慣例，未經真人驗證。
- 3D 背景＋手部偵測同時跑的效能只在桌機 Playwright（滑鼠模式）驗證過；體感模式的左下角小視窗未經真機實測。低階筆電若偵測 fps 掉太多，請使用者把「背景」改成攝影機畫面。

## 測試
- 本機：`python -m http.server 8847`（launch.json 名稱 `ball-throw-cam`）。
- **只走滑鼠模式**：`document.getElementById('mouse-btn').click()` 後先確認 `__game.mode==='mouse'`，避免誤開真實攝影機。
- `window.__game._test`：`step(dt)`、`throwBall(x,y,vx,vy)`、`aimedThrow`、`detectThrow`、`effThresholds`、`headInfo(hero)`、`rowsLeft`、`setHeroRow(r)`、`forceEdge()`、`set`（設定物件）、`release(hist,lastT)`（手消失補判）、`throwFromGesture`、`curOutfit`、`ward`、`drawHero`、`crop`／`cropApply`／`cropSetZoom`（裁切）。斷言要在同一次 evaluate 內做完（背景 rAF 迴圈會讓角色繼續走、降格）；測命中時先把 `G.bannerTime` 設大讓角色停住。
- 2026-11-01 已驗證：碰邊反向＋降格、命中加分扣血上推、球數上限、過關換關、越過防線 Game Over、真滑鼠拖曳丟球、照片上傳／女生角色、375px 無溢出、console 無錯誤。
