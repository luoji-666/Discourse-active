// ==UserScript==
// @name         NodeLoc 考古掘金
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  NodeLoc专用 (Discourse架构)。锁定 /latest 频道启动，底部停留2秒后返回，严格去重，无限下钻。
// @author       Gemini_User
// @match        https://www.nodeloc.com/*
// @match        https://nodeloc.com/*
// @grant        GM_addStyle
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // --- ⚙️ 参数配置 ---
    const CONFIG = {
        homeUrl: "https://www.nodeloc.com/latest", // 🎯 强制目标为 Latest 页面
        scrollStep: 300,                     // 滚动步长
        scrollInterval: 1000,                // 滚动间隔 (1秒)
        bottomStay: 2000,                    // ⏱️ 停留时间改为 2秒
        stuckLimit: 10,                      // 到底检测灵敏度
        maxSearchScroll: 60,                 // 列表页最大下钻次数
        storageKey: 'nodeloc_history_v2',    // 历史记录key
        statusKey: 'nodeloc_running_v2'      // 运行状态key
    };

    // --- 📊 状态记录 ---
    let state = {
        isRunning: localStorage.getItem(CONFIG.statusKey) === '1',
        searchAttempts: 0,
        visited: new Set()
    };

    // --- 🖥️ UI 控制面板 ---
    const UI = {
        init: function() {
            const div = document.createElement('div');
            div.style.cssText = `
                position: fixed; bottom: 20px; right: 20px; z-index: 10000;
                background: #2f3542; color: #fff; padding: 15px; border-radius: 8px;
                font-family: sans-serif; font-size: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.5);
                border: 1px solid #57606f; min-width: 160px; text-align: center;
            `;

            const btnColor = state.isRunning ? "#ff4757" : "#2ed573";
            const btnText = state.isRunning ? "停止考古" : "开始极速";
            const statusText = state.isRunning ? "⚡ 极速运行" : "🍵 已就绪";

            div.innerHTML = `
                <div style="font-weight:bold; color:#ffa502; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
                    <span>⚡ NodeLoc 极速版</span>
                    <span id="nl-clear" style="cursor:pointer; font-size:14px;" title="清除历史记录">🗑️</span>
                </div>
                <div id="nl-msg" style="margin-bottom:5px; color:#dfe4ea;">${statusText}</div>
                <div id="nl-debug" style="margin-bottom:10px; color:#a4b0be; font-size:10px;">等待启动...</div>
                <button id="nl-btn" style="width:100%; padding:8px; cursor:pointer; background:${btnColor}; border:none; color:#fff; border-radius:4px; font-weight:bold;">${btnText}</button>
                <div style="margin-top:5px; font-size:10px; color:#747d8c;">去重库: <span id="nl-v-count">0</span></div>
            `;
            document.body.appendChild(div);

            const btn = document.getElementById('nl-btn');
            const clearBtn = document.getElementById('nl-clear');

            // 实时更新显示
            setInterval(() => {
                const el = document.getElementById('nl-v-count');
                if(el) el.innerText = state.visited.size;
            }, 2000);

            // 清除缓存功能
            clearBtn.onclick = () => {
                if(confirm('要清除已读记录重新刷吗？')) {
                    state.visited.clear();
                    localStorage.removeItem(CONFIG.storageKey);
                    UI.log("🗑️ 记录已清空");
                    UI.debug("请重新点击开始");
                }
            };

            btn.onclick = () => {
                state.isRunning = !state.isRunning;
                localStorage.setItem(CONFIG.statusKey, state.isRunning ? '1' : '0');

                if(state.isRunning) {
                    btn.innerText = "停止考古";
                    btn.style.background = "#ff4757";
                    UI.log("🚀 引擎启动...");
                    Core.start();
                } else {
                    btn.innerText = "开始极速";
                    btn.style.background = "#2ed573";
                    UI.log("🛑 已停止");
                    setTimeout(() => location.reload(), 500);
                }
            };
        },
        log: function(msg) {
            const el = document.getElementById('nl-msg');
            if(el) el.innerText = msg;
        },
        debug: function(msg) {
            const el = document.getElementById('nl-debug');
            if(el) el.innerText = msg;
        }
    };

    // --- 💾 存储管理 (3天去重) ---
    const Storage = {
        load: function() {
            try {
                const raw = localStorage.getItem(CONFIG.storageKey);
                if(raw) {
                    const data = JSON.parse(raw);
                    const now = Date.now();
                    Object.keys(data).forEach(u => {
                        if(now - data[u] < 259200000) state.visited.add(u);
                    });
                }
            } catch(e){}
        },
        save: function(url) {
            state.visited.add(url);
            const data = {};
            if(state.visited.size > 2500) state.visited.clear();
            state.visited.forEach(u => data[u] = Date.now());
            localStorage.setItem(CONFIG.storageKey, JSON.stringify(data));
        }
    };

    // --- 🚀 核心逻辑 ---
    const Core = {
        start: function() {
            Storage.load();
            this.router();
        },

        router: function() {
            if(!state.isRunning) return;

            // 1. 如果在帖子页 (/t/xxx/123) -> 阅读
            if(/\/t\/.*?\/\d+$/.test(window.location.pathname)) {
                this.readPost();
                return;
            }

            // 2. 🚨 强制检查：必须在 /latest 页面
            // 如果 URL 不包含 /latest 且不是 Top 页，强制跳转
            if(!window.location.pathname.includes('/latest') && !window.location.pathname.includes('/top')) {
                UI.log("🔄 前往Latest...");
                window.location.href = CONFIG.homeUrl;
                return;
            }

            // 3. 扫描列表
            this.scanList();
        },

        // 🟢 扫描列表 (无限下钻)
        scanList: async function() {
            UI.log("🔍 扫描中...");
            await new Promise(r => setTimeout(r, 1500));

            const checkAndScroll = async () => {
                if(!state.isRunning) return;

                // Discourse 选择器
                const links = Array.from(document.querySelectorAll('.topic-list-item .raw-topic-link'));

                // 过滤已读
                const unread = links.filter(l => !state.visited.has(l.href));

                // 🐞 Debug信息
                UI.debug(`发现:${links.length} | 未读:${unread.length} | 下钻:${state.searchAttempts}`);

                // A. 找到未读
                if(unread.length > 0) {
                    state.searchAttempts = 0;
                    const target = unread[0];

                    UI.log(`进入: ${target.innerText.trim().substring(0,8)}...`);
                    Storage.save(target.href);

                    // 强制跳转
                    window.location.href = target.href;
                    return;
                }

                // B. 全是看过的，往下翻
                state.searchAttempts++;
                if(state.searchAttempts > CONFIG.maxSearchScroll) {
                    UI.log("⚠️ 翻页太多，重置...");
                    setTimeout(() => location.reload(), 5000);
                    return;
                }

                UI.log(`全已读，第 ${state.searchAttempts} 次下钻...`);
                window.scrollTo(0, document.body.scrollHeight);
                setTimeout(checkAndScroll, 2000);
            };

            checkAndScroll();
        },

        // 🔵 阅读帖子
        readPost: function() {
            UI.log("📖 阅读计时...");
            let lastHeight = 0;
            let stuckCount = 0;

            const timer = setInterval(() => {
                if(!state.isRunning) { clearInterval(timer); return; }

                window.scrollBy(0, CONFIG.scrollStep);

                const currentHeight = document.documentElement.scrollHeight;
                const scrollPos = window.scrollY + window.innerHeight;

                // Discourse 到底标志
                const footer = document.querySelector('#suggested-topics') || document.querySelector('.topic-map') || document.querySelector('#topic-footer-buttons');
                const isFooterVisible = footer && (footer.getBoundingClientRect().top < window.innerHeight);

                if (currentHeight === lastHeight) {
                    stuckCount++;
                } else {
                    stuckCount = 0;
                    lastHeight = currentHeight;
                }

                // 结束条件
                if (isFooterVisible || (stuckCount >= CONFIG.stuckLimit && scrollPos > currentHeight - 200)) {
                    clearInterval(timer);
                    UI.log("✅ 完成，返回...");

                    setTimeout(() => {
                        window.location.href = CONFIG.homeUrl;
                    }, CONFIG.bottomStay); // ⏳ 这里已经是 2000ms (2秒)
                }

            }, CONFIG.scrollInterval);
        }
    };

    // --- 初始化 ---
    window.addEventListener('load', () => {
        UI.init();
        if(state.isRunning) {
            setTimeout(() => Core.start(), 1500);
        }
    });

    // 路由监听
    let lastUrl = window.location.href;
    setInterval(() => {
        if(state.isRunning && window.location.href !== lastUrl) {
            lastUrl = window.location.href;
            setTimeout(() => Core.router(), 2000);
        }
    }, 1000);

})();
