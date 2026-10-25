# search-recommendations
插件名称: 搜索推荐词采集助手

插件介绍:
搜索推荐词采集助手是一款强大的Chrome插件，专为小红书、抖音、B站、知乎、百度、google用户设计。它能够自动收集并显示这些平台的搜索推荐词或联想词，保存下载为csv文件，并且可以在浏览器侧边栏里用 Claude、OpenAI 或 OpenRouter 上的模型直接对话分析采集到的关键词，帮助您快速发现用户需求和内容方向。

主要特点:

一键采集: 搜索推荐词采集助手输入采集关键词，自动获取小红书、抖音、B站、知乎、百度、google的搜索推荐词或联想词。您只需点击插件图标，即可快速输入关键词自动化采集，省去手动采集的麻烦。

多平台支持: 插件支持小红书、抖音、B站、知乎、百度、google，覆盖了广泛的内容类型。不论您是在寻找美妆、旅行、美食、健身或娱乐方面的内容，该插件都能提供有价值的搜索推荐词，让您更快地找到感兴趣的内容。

AI 分析关键词：每次采集完成后结果会自动保存。点插件图标里的「AI 分析关键词」打开侧边栏，勾选一批或多批采集记录，就能和 AI 多轮对话分析这些关键词，例如主题归类、挖掘长尾需求、生成内容选题。支持 Anthropic（Claude）、OpenAI 和 OpenRouter，在设置页填入自己的 API Key 即可使用。

用户友好界面: 插件提供简洁而直观的用户界面，使得操作更加轻松和便捷。搜索推荐词采集助手的图标会显示在Chrome浏览器的工具栏上，您可以随时启用或禁用插件，根据自己的需要自由使用。

![插件界面](https://i.ibb.co/cThZtqt/WX20230618-144632-2x.png)

![插件界面](https://i.ibb.co/bRfV4RM/WX20230701-172055-2x.png)

<img width="1284" alt="image" src="https://github.com/user-attachments/assets/008fd357-2f40-4eaa-acb2-7e7dfdb608c9">

<img width="477" alt="image" src="https://github.com/user-attachments/assets/880c10e7-508d-4c79-b1de-1e1e24fdfbd8">


<img width="1278" alt="image" src="https://github.com/user-attachments/assets/d84cdc70-4c80-4596-a8e1-d70269e67bfc">

使用说明:

安装插件: 在Chrome Web Store中搜索"搜索推荐词采集助手"插件，并点击安装按钮进行安装。[安装教程](https://www.bilibili.com/video/BV1514y1U7Uw/?vd_source=07bc57c14ff07a0d104533f8de5fb6d3) | [代码下载](https://github.com/niemingxing/search-recommendations/archive/refs/heads/master.zip)

使用插件: 安装完成后，在浏览器的工具栏上会显示该插件的图标。当您需要搜索特定内容时，点击插件图标，即可获取相关的搜索推荐词。[插件演示](https://www.bilibili.com/video/BV1TN411r7sp/?vd_source=07bc57c14ff07a0d104533f8de5fb6d3)

AI 分析配置：

1. 点插件图标右上角「设置」，先选择 AI 服务（Anthropic、OpenAI 或 OpenRouter），再填入对应的 API Key。
2. 填好 Key 后会自动拉取该服务可用的模型列表，在下拉框里选一个即可（Anthropic 默认选中 `claude-opus-5-5`）。拉取失败时会提示检查 API Key；OpenRouter 的模型列表无需 Key 即可拉取，但对话时需要 Key。
3. 「分析提示词」可选，留空时使用内置的关键词分析提示词。
4. 所有设置修改后自动保存，每个服务的 Key 和模型分别记住，切换服务不会丢失；模型列表会缓存 24 小时，可点「刷新」手动更新。
5. API Key 只保存在本机浏览器的插件存储中，请求直接从浏览器发往 api.anthropic.com、api.openai.com 或 openrouter.ai。

### 交流方式(使用过程中有任何问题或者有很好的idea，非常欢迎一起交流共建)：

![vx:histargo](https://i.ibb.co/hMbTs1G/a3779b33-bfe2-4ff9-a592-f0ec090a3055-1-2.jpg)

### 赞赏鼓励(微信赞赏)

![微信赞赏](https://github.com/niemingxing/search-recommendations/assets/7400829/ddd8b306-9cd4-448c-9700-4eea9ce630fb)


