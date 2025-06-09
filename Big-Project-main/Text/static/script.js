let player = null;
const subtitleDiv = document.getElementById("subtitle");
let subtitles = []; // 儲存所有字幕物件
let playerReady = false;
let videoIdToLoad = null; // 儲存待載入的影片ID
let lastSubtitle = null; // 記錄上一次顯示的字幕
let subtitleSystemReady = false; // 新增：追蹤字幕系統是否準備就緒

// API 端點
const API_URL = "http://127.0.0.1:8000";

console.log("腳本已載入"); // 確認腳本載入

// YouTube Iframe API 載入後會呼叫
function onYouTubeIframeAPIReady() {
    console.log("YouTube API 已準備就緒"); // 確認 API 載入
    initializePlayer();
}

// 初始化播放器
function initializePlayer() {
    if (typeof YT === 'undefined' || typeof YT.Player === 'undefined') {
        console.log("YouTube API 尚未準備好，等待中...");
        setTimeout(initializePlayer, 100);
        return;
    }

    console.log("正在初始化播放器..."); // 記錄初始化開始
    player = new YT.Player("player", {
        height: "360",
        width: "640",
        videoId: '',
        playerVars: {
            'playsinline': 1,
            'origin': window.location.origin,
            'enablejsapi': 1,
            'autoplay': 0,
            'host': 'https://www.youtube.com'
        },
        events: {
            onReady: (event) => {
                console.log("播放器已準備就緒"); // 確認播放器準備就緒
                playerReady = true;
                if (videoIdToLoad) {
                    loadYouTubeVideo(videoIdToLoad);
                    videoIdToLoad = null;
                }
            },
            onStateChange: onPlayerStateChange,
            onError: (event) => {
                console.error("播放器錯誤:", event.data); // 記錄播放器錯誤
                let errorMessage = "影片載入失敗";
                switch(event.data) {
                    case 2:
                        errorMessage = "無效的影片網址";
                        break;
                    case 5:
                        errorMessage = "HTML5 播放器錯誤";
                        break;
                    case 100:
                        errorMessage = "找不到影片";
                        break;
                    case 101:
                    case 150:
                        errorMessage = "影片不允許嵌入播放";
                        break;
                }
                alert(errorMessage);
            }
        }
    });
}

// 監聽播放器狀態變化
function onPlayerStateChange(event) {
    let stateText = "";
    switch(event.data) {
        case YT.PlayerState.ENDED:
            stateText = "已結束";
            break;
        case YT.PlayerState.PLAYING:
            stateText = "正在播放";
            break;
        case YT.PlayerState.PAUSED:
            stateText = "已暫停";
            break;
        case YT.PlayerState.BUFFERING:
            stateText = "緩衝中";
            break;
        case YT.PlayerState.CUED:
            stateText = "已準備";
            break;
        default:
            stateText = "未開始";
    }
    console.log("播放器狀態變更:", stateText);
    
    if (event.data == YT.PlayerState.PLAYING) {
        console.log("影片開始播放"); 
        updateSubtitle();
    }
}

// 解析 YouTube URL，取出影片ID
function getYouTubeID(url) {
    const regExp = /^.*(?:youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    const videoId = match && match[1].length === 11 ? match[1] : null;
    console.log("Extracted video ID:", videoId); // 記錄解析出的影片ID
    return videoId;
}

// 解析單段 SRT 字幕（時間與文字）
function parseSingleSRT(srtText) {
    const lines = srtText.trim().split("\n");
    if (lines.length < 3) return null;

    const timeMatch = lines[1].match(/(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})/);
    if (!timeMatch) return null;

    function toSeconds(t) {
        const [h, m, s, ms] = t.split(/[:,]/);
        return (+h) * 3600 + (+m) * 60 + (+s) + (+ms) / 1000;
    }

    return {
        start: toSeconds(timeMatch[1]),
        end: toSeconds(timeMatch[2]),
        text: lines.slice(2).join("\n").trim()
    };
}

// 載入 YouTube 影片
function loadYouTubeVideo(videoId) {
    console.log("Attempting to load video:", videoId); // 記錄嘗試載入影片
    
    if (!playerReady) {
        console.log("Player not ready, storing video ID for later..."); // 記錄等待狀態
        videoIdToLoad = videoId;
        return;
    }
    
    try {
        console.log("Loading video..."); // 記錄開始載入
        player.loadVideoById({
            videoId: videoId,
            startSeconds: 0
        });
        player.playVideo();
    } catch (err) {
        console.error("載入影片時發生錯誤：", err);
        subtitleDiv.textContent = "載入影片時發生錯誤，請重新整理頁面後再試";
    }
}

// 持續更新字幕顯示
function updateSubtitle() {
    if (!playerReady || !player) {
        requestAnimationFrame(updateSubtitle);
        return;
    }

    try {
        // 只在播放狀態且有字幕時更新字幕
        if (player.getPlayerState() === YT.PlayerState.PLAYING && subtitles.length > 0) {
            const currentTime = player.getCurrentTime();
            let currentSub = null;

            // 從後往前找，找當前時間落在哪個字幕區間
            for (let i = subtitles.length - 1; i >= 0; i--) {
                if (currentTime >= subtitles[i].start && currentTime <= subtitles[i].end) {
                    currentSub = currentSub || subtitles[i];
                    break;
                }
            }

            // 只有當字幕內容改變時才更新顯示
            if (currentSub && (!lastSubtitle || lastSubtitle.text !== currentSub.text)) {
                console.log("字幕更新:", currentSub.text);
                lastSubtitle = currentSub;
                subtitleDiv.textContent = currentSub.text;
            } else if (!currentSub && lastSubtitle) {
                subtitleDiv.textContent = "";
                lastSubtitle = null;
            }
        }
        
        requestAnimationFrame(updateSubtitle);
    } catch (err) {
        console.error("更新字幕時發生錯誤：", err);
        requestAnimationFrame(updateSubtitle);
    }
}

// 按鈕事件：開始轉錄並播放影片
document.getElementById("startBtn").onclick = async () => {
    console.log("開始按鈕被點擊"); 
    
    const url = document.getElementById("youtubeUrl").value.trim();
    const videoId = getYouTubeID(url);

    if (!videoId) {
        alert("請輸入正確的 YouTube 連結");
        return;
    }

    subtitleDiv.textContent = "準備中...";
    subtitles = []; // 清除之前的字幕
    lastSubtitle = null; // 重置上一次的字幕
    subtitleSystemReady = false; // 重置字幕系統狀態

    try {
        console.log("正在從 API 獲取字幕..."); 
        const response = await fetch(`${API_URL}/api/generate-subtitle`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                youtube_url: url,
                segment_duration: "30"
            })
        });

        if (!response.ok) {
            throw new Error(`伺服器錯誤！狀態碼: ${response.status}`);
        }

        if (!response.body) {
            subtitleDiv.textContent = "無法取得字幕串流";
            return;
        }

        console.log("開始讀取字幕串流..."); 
        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";
        let subtitleCount = 0;
        const startTime = Date.now();

        // 開始字幕更新循環
        updateSubtitle();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split("\n\n");
            buffer = parts.pop(); 

            for (const part of parts) {
                const subtitle = parseSingleSRT(part);
                if (subtitle) {
                    subtitles.push(subtitle);
                    subtitleCount++;
                    
                    // 更新進度提示
                    if (subtitleCount === 1) {
                        console.log("收到第一個字幕，字幕系統準備就緒");
                        subtitleDiv.textContent = "字幕系統準備就緒，開始播放影片";
                        subtitleSystemReady = true; // 標記字幕系統已準備就緒
                        // 在收到第一個字幕時才開始播放影片
                        loadYouTubeVideo(videoId);
                    }
                    
                    // 每收到10個字幕更新一次進度
                    if (subtitleCount % 10 === 0) {
                        const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
                        console.log(`已處理 ${subtitleCount} 個字幕 (${elapsedTime}秒)`);
                    }
                }
            }
        }

        console.log(`字幕生成完成。共 ${subtitles.length} 個字幕`);
        
    } catch (err) {
        console.error("產生字幕時發生錯誤：", err);
        subtitleDiv.textContent = "產生字幕時發生錯誤：" + (err.message || "未知錯誤");
    }
};