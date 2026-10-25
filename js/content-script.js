
	let kwIndex = 0;
	// 创建一个空字符串用于拼接 CSV 内容
	let csvContent = "";
	let keywords = '';
	let keywordList = [];
	let seedList = [];
	let collectKeywordList  = [];
	let collectLevel = 1;
	let currentDomain = window.location.hostname;
	const downloadMarkdown = (content) => {
		const element = document.createElement('a');
		const file = new Blob([content], {type: 'text/markdown'});
		element.href = URL.createObjectURL(file);
		element.download = "data(" + currentDomain+ ").md";
		document.body.appendChild(element);
		element.click();
	};
	/**
	 * 获取必要的dom对象
	 * @param $type
	 * @returns {Element | NodeListOf<Element>}
	 */
	function getNeetElement($type)
	{
		let result;
		if($type == "search")
		{
			if(currentDomain.includes("douyin"))
			{
				result = document.querySelector('header input[data-e2e="searchbar-input"]');
			}
			else if(currentDomain.includes("xiaohongshu"))
			{
				// 小红书放了同 class 的隐形蜜罐诱饵(aria-hidden/opacity:1e-05)在前面，
				// 必须用真框的唯一 id，避免写进诱饵触发反爬(__hp_input_hit)
				result = document.querySelector('input#search-input') || document.querySelector('input.search-input:not([aria-hidden="true"])');
			}
			else if(currentDomain.includes("bilibili"))
			{
				result = document.querySelector('.nav-search-input');
			}
			else if(currentDomain.includes("zhihu"))
			{
				result = document.querySelector('form.SearchBar-tool input[type=text]');
			}
			else if(currentDomain.includes("baidu"))
			{
				result = document.querySelector('#kw');
			}
			else if(currentDomain.includes("google"))
			{
				result = document.querySelector('form[role="search"] textarea');
			}

		}
		else if($type == "recommend")
		{
			if(currentDomain.includes("douyin"))
			{
				result = document.querySelectorAll("header div[data-index]");
			}
			else if(currentDomain.includes("xiaohongshu"))
			{
				result = document.querySelectorAll("div.sug-item");
			}
			else if(currentDomain.includes("bilibili"))
			{
				result = document.querySelectorAll("div.suggestions div.suggest-item");
			}
			else if(currentDomain.includes("zhihu"))
			{
				result = document.querySelectorAll('div.Menu-item');
			}
			else if(currentDomain.includes("baidu"))
			{
				result = document.querySelectorAll('ul li.bdsug-overflow');
			}
			else if(currentDomain.includes("google"))
			{
				result = document.querySelectorAll('ul[role="listbox"] li[role="presentation"] div[role="option"] div[role="presentation"]:first-child');
			}
		}

		return result;
	}

	/**
	 * 搜索关键词
	 * @param keywords
	 */
	async function search(q)
	{
		csvContent += "1," + q + "\n";
		collectKeywordList.push([1,q]);
		let searchInput = getNeetElement("search");
		if (searchInput) {
			inputDispatchEventEvent(searchInput,q);
			await sleep(3000);
			let recommendElements = getNeetElement("recommend");
			// 遍历每个 div 元素并输出其 TEXT 内容
			for (let element of recommendElements) {
				let html = element.innerHTML;
				let text = html.replace(/<[^>]*>/g, "");
				csvContent += "2," + text + "\n";
				collectKeywordList.push([2,text]);
				//获取3级关键词搜索结果
				if(collectLevel >= 2)
				{
					let keywords = await getSearchKeywords(text);
					console.log(keywords);
					for (let kw of keywords) {
						csvContent += "3," + kw + "\n";
						collectKeywordList.push([3,kw]);
						//获取4级关键词搜索结果
						if(collectLevel >= 3)
						{
							let keywords2 = await getSearchKeywords(kw);
							console.log(keywords2);
							for (let kw2 of keywords2) {
								csvContent += "4," + kw2 + "\n";
								collectKeywordList.push([4,kw2]);
							}
						}
					}
				}
				console.log(text);
			}
			kwIndex++;
			if(kwIndex >= keywordList.length)
			{
				let markdown = convertToXMindMarkdown(collectKeywordList);
				downloadMarkdown(markdown);
				console.log(markdown);
				saveCsv(csvContent);
				saveCollectBatch();
				return;
			}
			await searchByCharCode();
		}
	}

	function sleep(ms) {
		return new Promise(resolve => setTimeout(resolve, ms));
	}
	
	async function getSearchKeywords(q) {
		let searchInput = getNeetElement("search");
		inputDispatchEventEvent(searchInput,q);
		await sleep(3000);
		let recommendElements = getNeetElement("recommend");
		let keywords = [];
		for (let element of recommendElements) {
			let html = element.innerHTML;
			let text = html.replace(/<[^>]*>/g, "");
			keywords.push(text);
		}
		return keywords;
	}

	/**
	 * 保存内容为csv文件
	 * @param csvContent
	 */
	function saveCsv(csvContent)
	{
		// 创建一个 Blob 对象，将内容保存为 CSV 文件
		var blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });

		// 生成一个临时下载链接并下载文件
		var link = document.createElement("a");
		link.href = URL.createObjectURL(blob);
		link.download = "data(" + currentDomain+ ").csv";
		link.click();
	}

	function convertToXMindMarkdown(data) {
		let markdown = '# 采集助手\n';
		
		data.forEach((item, index) => {
			let len = item[0] + 1;
			for (let i = 0; i < len; i++) {
				markdown += '#';
			}
			
			markdown += ` ${item[1]}\n`;
		});
		
		return markdown;
	}

	async function searchByCharCode()
	{
		let kw = keywordList[kwIndex];
		await search(kw);
	}


	/**
	 * 收集搜索推荐词
	 * @param data
	 */
	async function collectSearchKeywords(data)
	{
		if (data.keywords) {
			// 将关键词信息展示在页面的搜索框中
			//console.log(message)
			window.focus();
			csvContent = "";
			collectKeywordList = [];
			kwIndex = 0;
			keywords = data.keywords;
			keywordList = [];
			// 修改表头为 "推荐关键词"
			let headers = ["层级","推荐关键词"];
			csvContent += headers.join(",") + "\n";
			//关键词处理
			let kwList = keywords.split("\n").filter(function(item) {
				return item.trim() !== "";
			});
			seedList = kwList;
			//判断是否有占位符，存在替换为26个字母
			kwList.forEach(item => {
				if(item.includes("{c}")) {
					keywordList.push(item.replace("{c}", ""));
					for (let i = 97; i <= 122; i++) {
						let character = String.fromCharCode(i);
						keywordList.push(item.replace("{c}", character));
					}
				} else {
					keywordList.push(item);
				}
			});

			console.log(keywordList);
			console.log(kwIndex);
			await searchByCharCode();
			console.log("收集关键词数组：" + collectKeywordList);
		}
	}
	
	/**
	 * input对象输入、改变、键盘事件分发
	 * @param obj
	 * @param value
	 */
	function inputDispatchEventEvent(obj,value)
	{
		let focusEvent = new Event('focus', {
			bubbles: true,
			cancelable: true
		});
		let inputEvent = new InputEvent('input', {
			bubbles: true,
			cancelable: true,
			inputType: 'insertText',
			data:value
		});
		let changeEvent = new Event('change', {
			bubbles: true,
			cancelable: true
		});
		let keyUpEvent = new KeyboardEvent('keyup', {
			key: '',
			bubbles: true,
			cancelable: true
		});
		obj.value = value;
		obj.focus();
		obj.dispatchEvent(focusEvent);
		obj.dispatchEvent(inputEvent);
		obj.dispatchEvent(changeEvent);
		obj.dispatchEvent(keyUpEvent);
		console.log(value + "触发搜索");
	}

	/**
	 * 保存本次采集结果，供侧边栏AI分析使用
	 */
	function saveCollectBatch()
	{
		let batch = {
			'id': Date.now().toString(),
			'platform': currentDomain,
			'seeds': seedList.slice(),
			'level': collectLevel,
			'time': Date.now(),
			'items': collectKeywordList.slice()
		};
		chrome.storage.local.get('collect_batches', function(result) {
			let batches = result.collect_batches || [];
			batches.unshift(batch);
			chrome.storage.local.set({ 'collect_batches': batches }, function() {
				console.log("采集结果已保存，共" + batch.items.length + "条");
			});
		});
	}

	chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
		console.log(message);
		if(message.type == 'collect_search_keywords')
		{
			collectSearchKeywords(message);
		}
	});

	// 在页面加载完成后读取采集层级配置
	window.onload = function() {
		chrome.storage.local.get('setting', function (data) {
			let setting = data.setting || {};
			collectLevel = (typeof setting.level !== 'undefined') ? parseInt(setting.level, 10) : 1;
			console.log("采集层级：" + collectLevel);
		});
	};
