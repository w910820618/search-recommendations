let keywords = '';
let submitButton;
let toolType = '';
let createPrompt = '';

document.addEventListener('DOMContentLoaded', function () {
    // 获取存储的值
    chrome.storage.local.get('setting', function (data) {
        createPrompt = (typeof data.setting.create_prompt !== 'undefined') ? data.setting.create_prompt : '';
        chrome.runtime.sendMessage({"type":"init_setting","setting":data.setting}, function (response) {
            console.log(response.farewell)
        });
    });

    chrome.storage.local.get('keywords', function (data) {
        $("#keywords").val(data.keywords);
    });

    chrome.storage.local.get('pga_keywords', function (data) {
        $("#pga_keywords").val(data.pga_keywords);
    });


    document.getElementById('openOptions').addEventListener('click', function() {
        chrome.runtime.openOptionsPage();
    });


    // 获取当前标签页的 URL
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        var currentUrl = tabs[0].url;
        console.log(currentUrl);
        // 根据当前 URL 判断展示的页面
        if (currentUrl.includes('chat.openai.com')) {
            document.getElementById('pageSearchKeywords').style.display = 'none';
            document.getElementById('pageGptArticle').style.display = 'block';
            toolType = 'chatgpt_create_article';
        } else {
            document.getElementById('pageSearchKeywords').style.display = 'block';
            document.getElementById('pageGptArticle').style.display = 'none';
            toolType = 'collect_search_keywords';
        }
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
        chrome.tabs.sendMessage(tabs[0].id, { keywords: keywords,type:toolType});
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

$("#pga_submit").click(function (){
    submitButton = this;
    submitButton.disabled = true;
    keywords = $("#pga_keywords").val();
    if(keywords.trim() == '')
    {
        showPopup("输入不可以为空！");
        submitButton.disabled = false;
        return;
    }
    else if(createPrompt == '')
    {
        showPopup("没有配置生成prompt,请点击右上角设置！");
        submitButton.disabled = false;
        return;
    }
    chrome.storage.local.set({ 'pga_keywords': keywords }, function() {
        submitButton.disabled = false;
        sendSearchMessage();
    });
});