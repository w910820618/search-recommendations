let keywords = '';
let submitButton;
let currentWindowId = null;

document.addEventListener('DOMContentLoaded', function () {
    chrome.storage.local.get('keywords', function (data) {
        $("#keywords").val(data.keywords);
    });

    document.getElementById('openOptions').addEventListener('click', function() {
        chrome.runtime.openOptionsPage();
    });

    // 提前取得窗口ID，点击时同步打开侧边栏（sidePanel.open 必须在用户点击中直接调用）
    chrome.windows.getCurrent(function(win) {
        currentWindowId = win.id;
    });

    document.getElementById('openAnalysis').addEventListener('click', function() {
        chrome.sidePanel.open({ windowId: currentWindowId });
        window.close();
    });
});
// 获取弹窗元素
const popup = document.getElementById('popup');

// 获取关闭按钮元素
const closeButton = document.getElementById('closePopupBtn');

// 获取错误提示元素
const errorText = document.getElementById('message');

// 显示弹窗并设置错误提示文字
function showPopup(message) {
    errorText.textContent = message;
    popup.style.display = 'block';
}

// 关闭弹窗
function closePopup() {
    popup.style.display = 'none';
}

// 点击关闭按钮关闭弹窗
closeButton.addEventListener('click', closePopup);

/**
 * 发送搜索消息
 */
function sendSearchMessage()
{
    // 向 content-scripts.js 发送消息，包含关键词信息
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, { keywords: keywords,type:'collect_search_keywords'});
    });
}

$("#submit").click(function (){
    submitButton = this;
    submitButton.disabled = true;
    keywords = $("#keywords").val();
    if(keywords.trim() == '')
    {
        showPopup("输入不可以为空！");
        submitButton.disabled = false;
        return;
    }

    chrome.storage.local.set({ 'keywords': keywords }, function() {
        submitButton.disabled = false;
        sendSearchMessage();
    });
});
