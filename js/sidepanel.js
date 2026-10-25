// sidepanel.js
// 侧边栏：选择采集记录，与 AI 多轮对话分析关键词

const PLATFORM_NAMES = {
    'www.xiaohongshu.com': '小红书',
    'www.douyin.com': '抖音',
    'www.bilibili.com': 'B站',
    'www.zhihu.com': '知乎',
    'www.baidu.com': '百度',
    'www.google.com': 'Google'
};

const DEFAULT_ANALYSIS_PROMPT = '你是一名搜索需求与内容运营分析师。用户提供的是从小红书、抖音、B站、知乎、百度、Google 等平台搜索框采集到的推荐词/联想词。'
    + '数据按批次给出，每批内按缩进表示层级：不缩进的是用户输入的种子词，每多一级缩进，表示由上一级词继续搜索得到的联想词。'
    + '请基于这些真实数据回答用户的问题，结论尽量引用具体关键词作为依据，不要编造数据里没有的词。用中文回答。';

let settings = {};
let batches = [];
let selectedIds = new Set();
let selectionInitialized = false;

// 当前对话：开始后锁定服务商、模型和关键词数据，保证多轮消息格式一致
let history = [];
let conversation = null;
let abortController = null;
let busy = false;

const chatLog = document.getElementById('chatLog');
const chatInput = document.getElementById('chatInput');
const sendButton = document.getElementById('sendButton');
const stopButton = document.getElementById('stopButton');

/**
 * 读取设置并显示当前使用的模型
 */
function loadSettings()
{
    chrome.storage.local.get('setting', function(result) {
        settings = result.setting || {};
        const config = getProviderConfig();
        const info = document.getElementById('modelInfo');
        if (!config.apiKey || !config.model) {
            info.textContent = '未配置 ' + config.label + ' 的 API Key 或未选择模型，请点右上角「设置」';
        } else {
            info.textContent = config.label + ' · ' + config.model;
        }
    });
}

/**
 * 当前设置选中的 AI 服务配置
 */
function getProviderConfig()
{
    const provider = PROVIDER_LABELS[settings.provider] ? settings.provider : 'anthropic';
    const config = (settings.providers && settings.providers[provider]) || {};
    return { provider: provider, label: PROVIDER_LABELS[provider], apiKey: config.key || '', model: config.model || '', maxTokens: config.maxTokens || null };
}

/**
 * 读取采集记录
 */
function loadBatches()
{
    chrome.storage.local.get('collect_batches', function(result) {
        const previousIds = new Set(batches.map(batch => batch.id));
        batches = result.collect_batches || [];
        const existingIds = new Set(batches.map(batch => batch.id));
        selectedIds = new Set([...selectedIds].filter(id => existingIds.has(id)));
        if (!isLocked()) {
            if (!selectionInitialized && batches.length > 0) {
                // 首次打开默认选中最新一次采集
                selectedIds.add(batches[0].id);
            } else if (selectionInitialized) {
                // 侧边栏打开期间新完成的采集自动选中
                batches.filter(batch => !previousIds.has(batch.id)).forEach(batch => selectedIds.add(batch.id));
            }
        }
        selectionInitialized = true;
        renderBatches();
    });
}

function isLocked()
{
    return history.length > 0 || busy;
}

function formatTime(timestamp)
{
    const d = new Date(timestamp);
    const pad = n => String(n).padStart(2, '0');
    return (d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function platformName(host)
{
    return PLATFORM_NAMES[host] || host;
}

/**
 * 渲染采集记录列表
 */
function renderBatches()
{
    const list = document.getElementById('batchList');
    const locked = isLocked();
    list.textContent = '';
    batches.forEach(function(batch) {
        const li = document.createElement('li');
        li.className = 'sp-batch';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = 'batch-' + batch.id;
        checkbox.checked = selectedIds.has(batch.id);
        checkbox.disabled = locked;
        checkbox.addEventListener('change', function() {
            if (checkbox.checked) selectedIds.add(batch.id);
            else selectedIds.delete(batch.id);
            renderSelectionInfo();
        });

        const label = document.createElement('label');
        label.htmlFor = checkbox.id;
        const title = document.createElement('div');
        title.className = 'sp-batch-title';
        title.textContent = platformName(batch.platform) + ' · ' + formatTime(batch.time) + ' · ' + batch.level + '级 · ' + batch.items.length + '条';
        const seeds = document.createElement('div');
        seeds.className = 'sp-batch-seeds';
        seeds.textContent = batch.seeds.slice(0, 3).join('、') + (batch.seeds.length > 3 ? ' 等' + batch.seeds.length + '个种子词' : '');
        seeds.title = batch.seeds.join('、');
        label.appendChild(title);
        label.appendChild(seeds);

        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'sp-batch-delete';
        deleteButton.title = '删除这条采集记录';
        deleteButton.textContent = '×';
        deleteButton.disabled = locked;
        deleteButton.addEventListener('click', function() {
            // 点两次才删除：第一次点击变成「确认删除」，3 秒内再点一次生效
            if (!deleteButton.classList.contains('sp-confirm')) {
                deleteButton.classList.add('sp-confirm');
                deleteButton.textContent = '确认删除';
                setTimeout(function() {
                    deleteButton.classList.remove('sp-confirm');
                    deleteButton.textContent = '×';
                }, 3000);
                return;
            }
            chrome.storage.local.get('collect_batches', function(result) {
                const remaining = (result.collect_batches || []).filter(item => item.id !== batch.id);
                chrome.storage.local.set({ 'collect_batches': remaining });
            });
        });

        li.appendChild(checkbox);
        li.appendChild(label);
        li.appendChild(deleteButton);
        list.appendChild(li);
    });
    document.getElementById('batchEmpty').hidden = batches.length > 0;
    document.getElementById('batchLockedHint').hidden = !locked;
    renderSelectionInfo();
}

function getSelectedBatches()
{
    return batches.filter(batch => selectedIds.has(batch.id));
}

function renderSelectionInfo()
{
    const selected = getSelectedBatches();
    const count = selected.reduce((sum, batch) => sum + batch.items.length, 0);
    document.getElementById('selectionInfo').textContent = selected.length > 0 ? '已选 ' + selected.length + ' 批 / ' + count + ' 个词' : '';
}

/**
 * 生成系统提示词：分析要求 + 所选批次的关键词（按层级缩进）
 */
function buildSystemPrompt(selected)
{
    const sections = selected.map(function(batch, i) {
        const header = '## 批次' + (i + 1) + '：' + platformName(batch.platform) + '，采集于 ' + new Date(batch.time).toLocaleString('zh-CN')
            + '，采集层级 ' + batch.level + '，共 ' + batch.items.length + ' 条';
        const lines = batch.items.map(item => '  '.repeat(Math.max(0, item[0] - 1)) + item[1]);
        return header + '\n' + lines.join('\n');
    });
    return (settings.analysis_prompt || DEFAULT_ANALYSIS_PROMPT) + '\n\n<keywords>\n' + sections.join('\n\n') + '\n</keywords>';
}

/**
 * 发送一条消息
 */
async function sendMessage(text)
{
    text = text.trim();
    if (busy || !text) return;

    if (!conversation) {
        const config = getProviderConfig();
        if (!config.apiKey || !config.model) {
            appendMessage('error', '请先点右上角「设置」，填写 ' + config.label + ' 的 API Key 并选择模型。');
            return;
        }
        const selected = getSelectedBatches();
        if (selected.length === 0) {
            appendMessage('error', '请先勾选至少一条采集记录。');
            return;
        }
        conversation = Object.assign({ system: buildSystemPrompt(selected) }, config);
    }

    chatInput.value = '';
    appendMessage('user', text);
    history.push({ role: 'user', content: text });
    setBusy(true);

    const bubble = appendMessage('assistant', '');
    bubble.innerHTML = '<span class="sp-thinking">思考中…</span>';
    let replyText = '';
    let renderPending = false;
    const onText = function(delta) {
        replyText += delta;
        if (renderPending) return;
        renderPending = true;
        requestAnimationFrame(function() {
            renderPending = false;
            bubble.innerHTML = renderMarkdown(replyText);
            scrollToBottom();
        });
    };

    abortController = new AbortController();
    const request = {
        provider: conversation.provider,
        apiKey: conversation.apiKey,
        model: conversation.model,
        maxTokens: conversation.maxTokens,
        system: conversation.system,
        messages: history,
        signal: abortController.signal,
        onText: onText,
        onFallback: function() {
            appendMessage('notice', '当前模型拒绝了请求，已自动切换到备用模型继续回答。');
        }
    };

    try {
        const result = conversation.provider === 'anthropic' ? await streamAnthropic(request) : await streamOpenAI(request);
        bubble.innerHTML = replyText ? renderMarkdown(replyText) : '<span class="sp-thinking">（没有返回文字内容）</span>';
        if (result.stopReason === 'refusal') {
            // 被安全策略拒绝：本轮作废，不计入对话，已输出的部分内容也一并丢弃
            history.pop();
            bubble.remove();
            appendMessage('notice', '模型拒绝回答这个请求，本轮已作废，可以换个问法再试。');
        } else {
            history.push({ role: 'assistant', content: result.content });
            if (result.stopReason === 'max_tokens' || result.stopReason === 'length') {
                appendMessage('notice', '回复太长，达到了长度上限被截断。');
            }
        }
    } catch (error) {
        history.pop();
        if (error.name === 'AbortError') {
            // 点「新对话」中断时对话区已清空，不再提示
            if (bubble.isConnected) appendMessage('notice', '已停止，本轮未计入对话。');
        } else {
            if (!replyText) bubble.remove();
            appendMessage('error', '请求失败：' + error.message);
        }
    } finally {
        abortController = null;
        setBusy(false);
        if (history.length === 0) conversation = null;
        renderBatches();
    }
}

function setBusy(value)
{
    busy = value;
    sendButton.disabled = value;
    stopButton.hidden = !value;
    document.querySelectorAll('.sp-chip').forEach(chip => chip.disabled = value);
    renderBatches();
}

function appendMessage(type, text)
{
    const div = document.createElement('div');
    div.className = 'sp-msg sp-msg-' + type;
    div.textContent = text;
    chatLog.appendChild(div);
    scrollToBottom();
    return div;
}

function scrollToBottom()
{
    chatLog.scrollTop = chatLog.scrollHeight;
}

function newConversation()
{
    if (abortController) abortController.abort();
    history = [];
    conversation = null;
    chatLog.textContent = '';
    renderBatches();
}

function escapeHtml(text)
{
    return text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderInline(text)
{
    return escapeHtml(text)
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

/**
 * 简单的 Markdown 渲染（标题、列表、表格、代码块、粗体），所有文本先转义
 */
function renderMarkdown(text)
{
    let html = '';
    let listType = null;
    let codeLines = null;
    let tableRows = [];
    const closeList = function() {
        if (listType) {
            html += '</' + listType + '>';
            listType = null;
        }
    };
    const flushTable = function() {
        if (tableRows.length === 0) return;
        const rows = tableRows.filter(row => !/^[\s|:-]+$/.test(row));
        html += '<pre>' + escapeHtml(rows.map(row => row.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim()).join('  |  ')).join('\n')) + '</pre>';
        tableRows = [];
    };
    text.split('\n').forEach(function(line) {
        if (line.trim().startsWith('```')) {
            if (codeLines !== null) {
                html += '<pre>' + escapeHtml(codeLines.join('\n')) + '</pre>';
                codeLines = null;
            } else {
                closeList();
                flushTable();
                codeLines = [];
            }
            return;
        }
        if (codeLines !== null) {
            codeLines.push(line);
            return;
        }
        if (/^\s*\|.*\|\s*$/.test(line)) {
            closeList();
            tableRows.push(line);
            return;
        }
        flushTable();
        let match;
        if ((match = line.match(/^\s*#{1,6}\s+(.*)$/))) {
            closeList();
            html += '<h3>' + renderInline(match[1]) + '</h3>';
        } else if ((match = line.match(/^\s*[-*]\s+(.*)$/))) {
            if (listType !== 'ul') {
                closeList();
                html += '<ul>';
                listType = 'ul';
            }
            html += '<li>' + renderInline(match[1]) + '</li>';
        } else if ((match = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
            if (listType !== 'ol') {
                closeList();
                html += '<ol>';
                listType = 'ol';
            }
            html += '<li>' + renderInline(match[1]) + '</li>';
        } else if (!line.trim()) {
            closeList();
        } else {
            closeList();
            html += '<p>' + renderInline(line) + '</p>';
        }
    });
    if (codeLines !== null) html += '<pre>' + escapeHtml(codeLines.join('\n')) + '</pre>';
    flushTable();
    closeList();
    return html;
}

document.getElementById('openOptions').addEventListener('click', function() {
    chrome.runtime.openOptionsPage();
});
sendButton.addEventListener('click', function() {
    sendMessage(chatInput.value);
});
stopButton.addEventListener('click', function() {
    if (abortController) abortController.abort();
});
document.getElementById('newChat').addEventListener('click', newConversation);
chatInput.addEventListener('keydown', function(event) {
    // 输入法组字过程中的回车不发送
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        sendMessage(chatInput.value);
    }
});
document.querySelectorAll('.sp-chip').forEach(function(chip) {
    chip.addEventListener('click', function() {
        sendMessage(chip.dataset.prompt);
    });
});
chrome.storage.onChanged.addListener(function(changes, area) {
    if (area !== 'local') return;
    if (changes.collect_batches) loadBatches();
    if (changes.setting) loadSettings();
});

loadSettings();
loadBatches();
