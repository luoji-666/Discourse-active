// ==UserScript==
// @name         Linux.do 考古掘金 (文雅慢读死磕版 V3.2)
// @namespace    http://tampermonkey.net/
// @version      3.2
// @description  专治长篇大论。采用双维进度检测，确保不漏读、不误判；模拟真人随机停顿，优雅考古。
// @author       Gemini_AI_Assistant
// @match        https://linux.do/*
// @match        https://www.linux.do/*
// @grant        GM_addStyle
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // --- ⚙️ 核心参数配置 ---
    const CONFIG = {
        homeUrl: "https://linux.do/latest",
        scrollStep: 140,                     // 每次滚动的像素 (100-200 较为自然)
        minInterval: 2000,                   // 最小停顿 2秒
        maxInterval: 4500,                   // 最大停顿 4.5秒
        bottomStay: 5000,                    // 读完后在底部回味 5秒
        maxWaitTime: 60,                     // 绝对静止超时 (60秒完全不动则判定为死路)
        maxSearchScroll: 60,                 // 列表页向下钻取次数
        storageKey: 'linuxdo_history_v3',
        statusKey: 'linuxdo_running_v3'
    };

    // 辅助函数：生成随机延迟
    const getRandomDelay = () => Math.floor(Math.random() * (CONFIG.maxInterval - CONFIG.minInterval + 1)) + CONFIG.minInterval;

    // --- 📊 状态管理 ---
    let state = {
        isRunning: localStorage.getItem(CONFIG.statusKey) === '1',
        searchAttempts: 0,
        visited: new Set()
    };

    // --- 🖥️ UI 界面控制 ---
    const UI = {
        init: function() {
            const div = document.createElement('div');
            div.style.cssText = `
                position: fixed; bottom: 20px; right: 20px; z-index: 10000;
                background: rgba(15, 15, 15, 0.9); color: #ecf0f1; padding: 15px; border-radius: 12px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                font-size: 13px; box-shadow: 0 8px 25px rgba(0,0,0,0.4);
                border: 1px solid #333; min-width: 180px; text-align: center; backdrop-filter: blur(4px);
            `;

            const btnColor = state.isRunning ? "#e74c3c" : "#27ae60";
            const btnText = state.isRunning ? "停止考古" : "开始考古";
            const statusColor = state.isRunning ? "#f1c40f" : "#95a5a6";

            div.innerHTML = `
                <div style="font-weight:bold; color:#f1c40f; margin-bottom:10px; display:flex; justify-content:space-between;">
                    <span>📜 考古学家 V3.2</span>
                    <span id="ld-clear" style="cursor:pointer; opacity:0.6;" title="清空历史">🗑️</span>
                </div>
                <div id="ld-msg" style="margin-bottom:8px; color:${statusColor};">等待启动...</div>
                <div id="ld-debug" style="margin-bottom:12px; color:#7f8c8d; font-size:11px;">准备就绪</div>
                <button id="ld-btn" style="width:100%; padding:8px; cursor:pointer; background:${btnColor}; border:none; color:#fff; border-radius:6px; font-weight:bold; transition:all 0.2s;">${btnText}</button>
                <div style="margin-top:8px; font-size:10px; color:#555;">已阅节点: <span id="ld-v-count">0</span></div>
            `;
            document.body.appendChild(div);

            document.getElementById('ld-v-count').innerText = state.visited.size;

            document.getElementById('ld-clear').onclick = () => {
                if(confirm('确定要清除所有阅读记录吗？')) {
                    localStorage.removeItem(CONFIG.storageKey);
                    location.reload();
                }
            };

            document.getElementById('ld-btn').onclick = () => {
                state.isRunning = !state.isRunning;
                localStorage.setItem(CONFIG.statusKey, state.isRunning ? '1' : '0');
                location.reload();
            };
        },
        log: function(msg) {
            const el = document.getElementById('ld-msg');
            if(el) el.innerText = msg;
        },
        debug: function(msg) {
            const el = document.getElementById('ld-debug');
            if(el) el.innerText = msg;
        }
    };

    // --- 💾 数据持久化 ---
    const Storage = {
        load: function() {
            try {
                const raw = localStorage.getItem(CONFIG.storageKey);
                if(raw) {
                    const data = JSON.parse(raw);
                    const now = Date.now();
                    Object.keys(data).forEach(u => {
                        // 3天内的记录有效
                        if(now - data[u] < 259200000) state.visited.add(u);
                    });
                }
            } catch(e){}
        },
        save: function(url) {
            state.visited.add(url);
            const data = {};
            if(state.visited.size > 5000) state.visited.clear();
            state.visited.forEach(u => data[u] = Date.now());
            localStorage.setItem(CONFIG.storageKey, JSON.stringify(data));
        }
    };

    // --- 🚀 核心自动化逻辑 ---
    const Core = {
        start: function() {
            Storage.load();
            this.router();
        },

        router: function() {
            if(!state.isRunning) return;

            // 1. 判断是否在帖子详情页
            if(/\/t\/.*?\/\d+$/.test(window.location.pathname)) {
                this.readPost();
                return;
            }

            // 2. 判断是否在列表页 (强制跳转最新)
            if(!window.location.pathname.includes('/latest') && !window.location.pathname.includes('/top')) {
                UI.log("🧭 正在前往遗迹...");
                window.location.href = CONFIG.homeUrl;
                return;
            }

            this.scanList();
        },

        // 🟢 扫描帖子列表
        scanList: async function() {
            UI.log("🔍 搜索新线索...");
            await new Promise(r => setTimeout(r, 2000));

            const checkAndScroll = async () => {
                if(!state.isRunning) return;

                const links = Array.from(document.querySelectorAll('.topic-list-item .raw-topic-link'));
                const unread = links.filter(l => !state.visited.has(l.href));

                UI.debug(`视野内:${links.length} | 未读:${unread.length}`);

                if(unread.length > 0) {
                    const target = unread[0];
                    UI.log(`💡 发现目标，准备进入...`);
                    Storage.save(target.href);
                    setTimeout(() => { window.location.href = target.href; }, 1500);
                    return;
                }

                // 没找到未读，向下滚动
                state.searchAttempts++;
                if(state.searchAttempts > CONFIG.maxSearchScroll) {
                    UI.log("📭 暂无新发现，刷新中");
                    setTimeout(() => location.reload(), 5000);
                    return;
                }

                UI.log(`📜 翻找更旧的内容...(${state.searchAttempts})`);
                window.scrollTo(0, document.body.scrollHeight);
                setTimeout(checkAndScroll, 2500);
            };
            checkAndScroll();
        },

        // 🔵 核心：阅读帖子逻辑
        readPost: function() {
            UI.log("📖 正在细品文章...");

            let lastProgressTime = Date.now(); // 记录最后一次真正有进度的时间
            let lastHeight = document.documentElement.scrollHeight;
            let lastScrollY = window.scrollY;

            const nextStep = () => {
                if(!state.isRunning) return;

                // 执行滚动
                window.scrollBy({
                    top: CONFIG.scrollStep + (Math.random() * 30),
                    behavior: 'smooth'
                });

                const currentHeight = document.documentElement.scrollHeight;
                const currentScrollY = window.scrollY;

                // --- ✨ 判定逻辑：只要高度在变，或者位置在变，就说明没卡死 ---
                if (currentHeight > lastHeight || currentScrollY > lastScrollY) {
                    lastHeight = currentHeight;
                    lastScrollY = currentScrollY;
                    lastProgressTime = Date.now(); // 重置保险丝
                    UI.debug(`当前进度: ${Math.floor(currentScrollY)}px`);
                } else {
                    let idleSec = Math.floor((Date.now() - lastProgressTime) / 1000);
                    if(idleSec > 2) UI.debug(`等待内容加载... ${idleSec}s`);
                }

                // 判定终点：寻找底部建议话题或按钮区域
                const footer = document.querySelector('#suggested-topics') ||
                               document.querySelector('.topic-footer-buttons') ||
                               document.querySelector('.footer-main-links');

                const isRealFooterVisible = footer && (footer.getBoundingClientRect().top <= window.innerHeight + 150);

                if (isRealFooterVisible) {
                    UI.log(`✅ 阅读完成，停留回味...`);
                    setTimeout(() => { window.location.href = CONFIG.homeUrl; }, CONFIG.bottomStay);
                }
                // 超时判定：如果位置和高度同时卡住超过设定时间
                else if ((Date.now() - lastProgressTime) > (CONFIG.maxWaitTime * 1000)) {
                    UI.log("⚠️ 无法继续向下，返回列表");
                    setTimeout(() => { window.location.href = CONFIG.homeUrl; }, 1000);
                }
                else {
                    // 递归调用，实现变频随机滚动
                    setTimeout(nextStep, getRandomDelay());
                }
            };

            // 进帖子先等 2 秒加载
            setTimeout(nextStep, 2000);
        }
    };

    // --- 🏁 脚本启动 ---
    window.addEventListener('load', () => {
        UI.init();
        if(state.isRunning) {
            setTimeout(() => Core.start(), 2000);
        }
    });

    // 监听 URL 变化 (Discourse 是单页应用)
    let lastUrl = window.location.href;
    setInterval(() => {
        if(state.isRunning && window.location.href !== lastUrl) {
            lastUrl = window.location.href;
            UI.debug("🚀 路径变更，重新路由");
            setTimeout(() => Core.router(), 2000);
        }
    }, 1000);

})();
