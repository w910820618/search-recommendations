// llm.js
// AI 接口调用：Anthropic Messages API 与 OpenAI Chat Completions，均为流式输出。
// 插件没有构建流程，所以直接用 fetch 调用 HTTP 接口。

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODELS_URL = 'https://api.anthropic.com/v1/models';
const ANTHROPIC_VERSION = '2026-10-21';

// OpenAI 与 OpenRouter 的对话接口格式相同（Chat Completions）
const OPENAI_COMPATIBLE = {
    openai: {
        chatUrl: 'https://api.openai.com/v1/chat/completions',
        modelsUrl: 'https://api.openai.com/v1/models'
    },
    openrouter: {
        chatUrl: 'https://openrouter.ai/api/v1/chat/completions',
        modelsUrl: 'https://openrouter.ai/api/v1/models'
    }
};

const PROVIDER_LABELS = { anthropic: 'Anthropic', openai: 'OpenAI', openrouter: 'OpenRouter' };

// 拉取模型列表是否需要 API Key（OpenRouter 的模型列表是公开的）
const MODEL_LIST_NEEDS_KEY = { anthropic: true, openai: true, openrouter: false };

// OpenAI 模型列表里混有非对话模型，按名称排除
const OPENAI_NON_CHAT = /embedding|tts|whisper|dall-e|image|audio|realtime|transcribe|moderation|search|babbage|davinci|computer-use|sora/i;

// 支持服务端 fallbacks 的模型：被安全策略拒绝时由服务端自动换备用模型重试
const ANTHROPIC_FALLBACK_MODELS = ['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5'];

/**
 * 逐条读取 SSE 流中的 data 内容
 */
async function readSSE(response, onData)
{
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, '\n');
        let index;
        while ((index = buffer.indexOf('\n\n')) !== -1) {
            const rawEvent = buffer.slice(0, index);
            buffer = buffer.slice(index + 2);
            const data = rawEvent.split('\n')
                .filter(line => line.startsWith('data:'))
                .map(line => line.slice(5).trimStart())
                .join('\n');
            if (data) onData(data);
        }
    }
}

/**
 * 读取接口返回的错误信息
 */
async function readErrorMessage(response)
{
    const text = await response.text();
    try {
        const json = JSON.parse(text);
        if (json.error && json.error.message) return json.error.message;
    } catch (e) {}
    return text.slice(0, 300) || ('HTTP ' + response.status);
}

/**
 * 拉取服务商支持的模型列表
 * @returns {Promise<Array<{id: string, name: string, maxTokens: number|null}>>}
 */
async function listModels(provider, apiKey)
{
    if (provider === 'anthropic') {
        const models = [];
        let afterId = null;
        // 列表接口分页返回，最多翻 10 页
        for (let page = 0; page < 10; page++) {
            const url = ANTHROPIC_MODELS_URL + '?limit=1000' + (afterId ? '&after_id=' + encodeURIComponent(afterId) : '');
            const response = await fetch(url, {
                headers: {
                    'x-api-key': apiKey,
                    'anthropic-version': ANTHROPIC_VERSION,
                    'anthropic-dangerous-direct-browser-access': 'true'
                }
            });
            if (!response.ok) throw new Error(await readErrorMessage(response));
            const json = await response.json();
            json.data.forEach(function(model) {
                models.push({ id: model.id, name: model.display_name || model.id, maxTokens: model.max_tokens || null });
            });
            if (!json.has_more) break;
            afterId = json.last_id;
        }
        return models;
    }

    const headers = apiKey ? { 'authorization': 'Bearer ' + apiKey } : {};
    const response = await fetch(OPENAI_COMPATIBLE[provider].modelsUrl, { headers: headers });
    if (!response.ok) throw new Error(await readErrorMessage(response));
    const json = await response.json();
    if (provider === 'openrouter') {
        return json.data
            .filter(model => !model.architecture || !model.architecture.output_modalities || model.architecture.output_modalities.includes('text'))
            .map(model => ({ id: model.id, name: model.name || model.id, maxTokens: null }));
    }
    return json.data
        .filter(model => !OPENAI_NON_CHAT.test(model.id))
        .sort((a, b) => (b.created || 0) - (a.created || 0))
        .map(model => ({ id: model.id, name: model.id, maxTokens: null }));
}

/**
 * 调用 Anthropic Messages API（流式）
 * @returns {Promise<{content: Array, stopReason: string}>} content 为完整的内容块，用于下一轮原样回传
 */
async function streamAnthropic({ apiKey, model, maxTokens, system, messages, signal, onText, onFallback })
{
    const body = {
        model: model,
        max_tokens: Math.min(64000, maxTokens || 64000),
        system: system,
        messages: messages,
        stream: true,
        cache_control: { type: 'ephemeral' }
    };
    const headers = {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true'
    };
    if (ANTHROPIC_FALLBACK_MODELS.includes(model)) {
        body.fallbacks = 'default';
        headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
    }

    const response = await fetch(ANTHROPIC_API_URL, { method: 'POST', headers, body: JSON.stringify(body), signal });
    if (!response.ok) throw new Error(await readErrorMessage(response));

    const blocks = [];
    let stopReason = null;
    await readSSE(response, function(data) {
        const event = JSON.parse(data);
        if (event.type === 'content_block_start') {
            blocks[event.index] = Object.assign({}, event.content_block);
            if (event.content_block.type === 'fallback' && onFallback) onFallback();
        } else if (event.type === 'content_block_delta') {
            const block = blocks[event.index];
            const delta = event.delta;
            if (delta.type === 'text_delta') {
                block.text = (block.text || '') + delta.text;
                onText(delta.text);
            } else if (delta.type === 'thinking_delta') {
                block.thinking = (block.thinking || '') + delta.thinking;
            } else if (delta.type === 'signature_delta') {
                block.signature = delta.signature;
            }
        } else if (event.type === 'message_delta') {
            if (event.delta && event.delta.stop_reason) stopReason = event.delta.stop_reason;
        } else if (event.type === 'error') {
            throw new Error(event.error && event.error.message ? event.error.message : '接口返回错误');
        }
    });

    return { content: toEchoContent(blocks.filter(Boolean)), stopReason: stopReason };
}

/**
 * 整理下一轮要回传的助手内容：发生过备用模型切换时，
 * 切换点之前只保留文本块，并去掉 fallback 标记块本身
 */
function toEchoContent(blocks)
{
    let lastFallback = -1;
    blocks.forEach(function(block, i) {
        if (block.type === 'fallback') lastFallback = i;
    });
    if (lastFallback === -1) return blocks;
    return blocks.filter(function(block, i) {
        if (i < lastFallback) return block.type === 'text';
        return i > lastFallback;
    });
}

/**
 * 调用 OpenAI 格式的 Chat Completions API（流式），OpenAI 与 OpenRouter 共用
 * @returns {Promise<{content: string, stopReason: string}>}
 */
async function streamOpenAI({ provider, apiKey, model, system, messages, signal, onText })
{
    const body = {
        model: model,
        messages: [{ role: 'system', content: system }].concat(messages),
        stream: true
    };
    const response = await fetch(OPENAI_COMPATIBLE[provider || 'openai'].chatUrl, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'authorization': 'Bearer ' + apiKey
        },
        body: JSON.stringify(body),
        signal: signal
    });
    if (!response.ok) throw new Error(await readErrorMessage(response));

    let content = '';
    let stopReason = null;
    await readSSE(response, function(data) {
        if (data === '[DONE]') return;
        const event = JSON.parse(data);
        if (event.error) throw new Error(event.error.message || '接口返回错误');
        const choice = event.choices && event.choices[0];
        if (!choice) return;
        if (choice.delta && choice.delta.content) {
            content += choice.delta.content;
            onText(choice.delta.content);
        }
        if (choice.finish_reason) stopReason = choice.finish_reason;
    });
    return { content: content, stopReason: stopReason };
}
