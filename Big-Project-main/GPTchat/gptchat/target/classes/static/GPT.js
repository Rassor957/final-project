// 取得 DOM 元素
const chat = document.getElementById('chat');
const input = document.getElementById('userInput');
const send = document.getElementById('send');
// 送出按鈕裡的箭頭 span，方便動態切換顯示與隱藏
const iconArrow = send.querySelector('.icon-arrow');

// 產生唯一 session ID，用來維持同一次對話紀錄
const sessionId = crypto.randomUUID();

/**
 * 新增訊息到聊天區
 * @param {boolean} fromUser - 是否為使用者訊息(true)或機器人(false)
 * @param {string} text - 訊息內容，若未提供則從輸入框抓取
 */
function sendMessage(fromUser = true, text = '') {
    const content = text || input.value.trim();
    if (content !== '') {
        const msg = document.createElement('div');
        msg.className = 'message ' + (fromUser ? 'user' : 'bot');
        msg.textContent = content;
        chat.appendChild(msg);
        if (fromUser) input.value = ''; // 使用者訊息送出後清空輸入框
        // 自動捲動到最底部，顯示最新訊息
        chat.scrollTop = chat.scrollHeight;
    }
}

/**
 * 處理送出行為
 * - 顯示 loading 動畫
 * - 發送請求到後端 GPT API
 * - 收到回覆後顯示，移除 loading
 */
async function handleSend() {
    const userText = input.value.trim();
    if (!userText) return; // 空字串不送出

    // 按鈕箭頭隱藏，避免同時顯示loading和箭頭
    iconArrow.style.display = 'none';

    // 建立並加入 loading 旋轉圈到按鈕中
    const loading = document.createElement('span');
    loading.className = 'loading-icon';
    loading.id = 'loadingIcon'; // 方便稍後移除
    send.appendChild(loading);

    // 禁用按鈕，避免重複送出
    send.disabled = true;

    // 先把使用者訊息加到聊天區
    sendMessage(true, userText);

    try {
        // 發送 POST 請求到後端，帶入使用者問題及 sessionId
        const response = await fetch('http://localhost:8080/GPT/P1', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question: userText, sessionId: sessionId })
        });

        if (!response.ok) throw new Error('伺服器錯誤');

        // 取得回覆文字
        const reply = await response.text();
        // 把 GPT 回答加到聊天區
        sendMessage(false, reply);
    } catch (error) {
        // 出錯時顯示錯誤訊息
        sendMessage(false, '伺服器錯誤，請稍後再試');
    } finally {
        // 不論成功或失敗，都要還原按鈕狀態
        send.disabled = false;
        iconArrow.style.display = ''; // 顯示箭頭
        const loadingIcon = document.getElementById('loadingIcon');
        if (loadingIcon) loadingIcon.remove(); // 移除 loading 圈圈
    }
}

// 監聽輸入框鍵盤事件
// 按 Enter 且沒有按 Shift 則送出
input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault(); // 阻止換行
        handleSend();
    }
});

// 監聽送出按鈕點擊
send.addEventListener('click', handleSend);
