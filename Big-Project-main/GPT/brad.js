console.log("OK brad.js loaded");

// 取得 DOM 元素
const chat = document.getElementById('chat');
const input = document.getElementById('userInput');
const send = document.getElementById('send');
// 送出按鈕裡的箭頭 span，方便動態切換顯示與隱藏
const iconArrow = send.querySelector('.icon-arrow');

// 產生唯一 session ID，用來維持同一次對話紀錄
const sessionId = crypto.randomUUID();

console.log("ok2:");