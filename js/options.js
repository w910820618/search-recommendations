// options.js
// 设置页：选择 AI 服务 → 填 API Key → 自动拉取并选择模型；所有修改自动保存

const MODEL_CACHE_TTL = 24 * 60 * 60 * 1000;
const DEFAULT_MODELS = { anthropic: 'claude-opus-5-5' };

let setting = {};
let modelCache = {};

const providerSelect = document.getElementById('provider');
const apiKeyInput = document.getElementById('apiKey');
const modelSelect = document.getElementById('model');
const modelSearch = document.getElementById('modelSearch');
const modelStatus = document.getElementById('modelStatus');
const analysisPrompt = document.getElementById('analysisPrompt');

function currentProvider()
{
    return providerSelect.value;
}

function providerSetting(provider)
{
    setting.providers = setting.providers || {};
    setting.providers[provider] = setting.providers[provider] || { key: '', model: '', maxTokens: null };
    return setting.providers[provider];
}

/**
 * 保存设置到本地存储
 */
function saveSetting()
{
    chrome.storage.local.set({ 'setting': setting }, function() {
        const status = document.getElementById('saveStatus');
        status.textContent = '已自动保存 ✓';
        clearTimeout(saveSetting.timer);
        saveSetting.timer = setTimeout(function() {
            status.textContent = '修改会自动保存';
        }, 1500);
    });
}

function setModelStatus(text, isError)
{
    modelStatus.textContent = text;
    modelStatus.classList.toggle('model-status-error', !!isError);
}

/**
 * 根据缓存的模型列表渲染下拉框
 */
function renderModels()
{
    const provider = currentProvider();
    const config = providerSetting(provider);
    const models = (modelCache[provider] && modelCache[provider].models) || [];
    const keyword = modelSearch.value.trim().toLowerCase();

    modelSearch.hidden = models.length <= 30;
    modelSelect.textContent = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = models.length > 0 ? '请选择模型' : '（暂无模型列表）';
    modelSelect.appendChild(placeholder);

    let shown = models.filter(model => !keyword || model.id.toLowerCase().includes(keyword) || model.name.toLowerCase().includes(keyword));
    // 已选的模型即使不在筛选结果或列表里，也保留在下拉框中
    if (config.model && !shown.some(model => model.id === config.model)) {
        shown = [models.find(model => model.id === config.model) || { id: config.model, name: config.model }].concat(shown);
    }
    shown.forEach(function(model) {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = model.name !== model.id ? model.name + '（' + model.id + '）' : model.id;
        modelSelect.appendChild(option);
    });
    modelSelect.value = config.model || '';
}

/**
 * 显示模型列表的状态：缺 Key 时提示填写
 */
function renderModelStatus()
{
    const provider = currentProvider();
    const cache = modelCache[provider];
    if (MODEL_LIST_NEEDS_KEY[provider] && !providerSetting(provider).key) {
        setModelStatus('请先填写 ' + PROVIDER_LABELS[provider] + ' 的 API Key，填写后会自动拉取模型列表。', true);
    } else if (cache && cache.models.length > 0) {
        setModelStatus('共 ' + cache.models.length + ' 个模型，更新于 ' + new Date(cache.fetchedAt).toLocaleString('zh-CN'));
    } else {
        setModelStatus('');
    }
}

/**
 * 拉取当前服务商的模型列表并缓存
 */
async function fetchModels()
{
    const provider = currentProvider();
    const config = providerSetting(provider);
    if (MODEL_LIST_NEEDS_KEY[provider] && !config.key) {
        renderModelStatus();
        return;
    }
    setModelStatus('正在拉取模型列表…');
    try {
        const models = await listModels(provider, config.key);
        if (provider !== currentProvider()) return;
        modelCache[provider] = { models: models, fetchedAt: Date.now() };
        chrome.storage.local.set({ 'model_cache': modelCache });
        if (!config.model && DEFAULT_MODELS[provider] && models.some(model => model.id === DEFAULT_MODELS[provider])) {
            selectModel(DEFAULT_MODELS[provider]);
        }
        renderModels();
        renderModelStatus();
        if (!providerSetting(provider).model) setModelStatus('已拉取 ' + models.length + ' 个模型，请选择一个。');
    } catch (error) {
        if (provider !== currentProvider()) return;
        const hint = MODEL_LIST_NEEDS_KEY[provider] ? '请检查 API Key 是否正确、是否有权限。' : '请检查网络后点「刷新」重试。';
        setModelStatus('拉取模型列表失败：' + error.message + '。' + hint, true);
    }
}

/**
 * 选择模型并保存（Anthropic 会一并记录该模型的最大输出 token 数）
 */
function selectModel(modelId)
{
    const provider = currentProvider();
    const config = providerSetting(provider);
    const models = (modelCache[provider] && modelCache[provider].models) || [];
    const model = models.find(item => item.id === modelId);
    config.model = modelId;
    config.maxTokens = model ? model.maxTokens : null;
    saveSetting();
}

/**
 * 切换服务商时刷新界面，缓存过期或没有缓存时自动拉取
 */
function showProvider()
{
    const provider = currentProvider();
    apiKeyInput.value = providerSetting(provider).key || '';
    apiKeyInput.placeholder = MODEL_LIST_NEEDS_KEY[provider] ? '填写后自动拉取模型列表' : '对话时需要，模型列表无需 Key 即可拉取';
    modelSearch.value = '';
    renderModels();
    renderModelStatus();
    const cache = modelCache[provider];
    if (!cache || Date.now() - cache.fetchedAt > MODEL_CACHE_TTL) {
        fetchModels();
    }
}

document.addEventListener('DOMContentLoaded', function() {
    chrome.storage.local.get(['setting', 'model_cache'], function(result) {
        setting = result.setting || {};
        modelCache = result.model_cache || {};
        providerSelect.value = PROVIDER_LABELS[setting.provider] ? setting.provider : 'anthropic';
        analysisPrompt.value = setting.analysis_prompt || '';
        let levelRadio = document.querySelector('input[name="level"][value="' + (setting.level || '1') + '"]');
        if (levelRadio) levelRadio.checked = true;
        showProvider();
    });

    providerSelect.addEventListener('change', function() {
        setting.provider = currentProvider();
        saveSetting();
        showProvider();
    });

    // 输入时即保存（防止没离开输入框就关掉页面），输入完成后再拉取模型列表
    let keySaveTimer = null;
    apiKeyInput.addEventListener('input', function() {
        clearTimeout(keySaveTimer);
        keySaveTimer = setTimeout(function() {
            providerSetting(currentProvider()).key = apiKeyInput.value.trim();
            saveSetting();
        }, 400);
    });
    apiKeyInput.addEventListener('change', function() {
        clearTimeout(keySaveTimer);
        providerSetting(currentProvider()).key = apiKeyInput.value.trim();
        saveSetting();
        fetchModels();
    });

    modelSelect.addEventListener('change', function() {
        selectModel(modelSelect.value);
        renderModelStatus();
    });

    modelSearch.addEventListener('input', renderModels);

    document.getElementById('refreshModels').addEventListener('click', fetchModels);

    document.querySelectorAll('input[name="level"]').forEach(function(radio) {
        radio.addEventListener('change', function() {
            setting.level = radio.value;
            saveSetting();
        });
    });

    let promptSaveTimer = null;
    analysisPrompt.addEventListener('input', function() {
        clearTimeout(promptSaveTimer);
        promptSaveTimer = setTimeout(function() {
            setting.analysis_prompt = analysisPrompt.value.trim();
            saveSetting();
        }, 400);
    });
});
