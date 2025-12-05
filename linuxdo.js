// ==UserScript==
// @name         Linux.do 考古掘金
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  专治1000楼长贴读不完。逻辑锁死：除非看到底部“建议话题”区域，否则绝不退出！
// @author       Gemini_User
// @match        https://linux.do/*
// @match        https://www.linux.do/*
// @grant        GM_addStyle
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // --- ⚙️ 参数配置 ---
    const CONFIG = {
        homeUrl: "https://linux.do/latest",  // 🎯 锁定 Latest
        scrollStep: 400,                     // 滚动步长 (稍微迈大步)
        scrollInterval: 800,                 // 滚动间隔 (0.8秒)
        bottomStay: 2000,                    // ⏱️ 到底后停留 2秒
        maxWaitTime: 120,                    // ⚠️ 单个帖子最长死磕 120秒 (防止断网卡死)
        maxSearchScroll: 80,                 // 列表页下钻次数
        storageKey: 'linuxdo_history_v3',    // 历史库升级V3
        statusKey: 'linuxdo_running_v3'
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
                background: #000; color: #fff; padding: 15px; border-radius: 8px;
                font-family: sans-serif; font-size: 12px; box-shadow: 0 4px 15px rgba(255,255,255,0.2);
                border: 1px solid #333; min-width: 160px; text-align: center;
            `;
            
            const btnColor = state.isRunning ? "#e74c3c" : "#f1c40f";
            const btnText = state.isRunning ? "停止死磕" : "开始死磕";
            const statusText = state.isRunning ? "🔨 死磕中..." : "🐧 已就绪";

            div.innerHTML = `
                <div style="font-weight:bold; color:#f1c40f; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
                    <span>🐧 Linux.do V3.0</span>
                    <span id="ld-clear" style="cursor:pointer; font-size:14px;" title="清除历史">🗑️</span>
                </div>
                <div id="ld-msg" style="margin-bottom:8px; color:#bdc3c7;">${statusText}</div>
                <div id="ld-debug" style="margin-bottom:10px; color:#666; font-size:10px;">等待指令...</div>
                <button id="ld-btn" style="width:100%; padding:8px; cursor:pointer; background:${btnColor}; border:none; color:#000; border-radius:4px; font-weight:bold;">${btnText}</button>
                <div style="margin-top:5px; font-size:10px; color:#444;">去重库: <span id="ld-v-count">0</span></div>
            `;
            document.body.appendChild(div);

            const btn = document.getElementById('ld-btn');
            const clearBtn = document.getElementById('ld-clear');
            
            setInterval(() => {
                const el = document.getElementById('ld-v-count');
                if(el) el.innerText = state.visited.size;
            }, 2000);

            clearBtn.onclick = () => {
                if(confirm('清除所有已读记录？')) {
                    state.visited.clear();
                    localStorage.removeItem(CONFIG.storageKey);
                    UI.log("🗑️ 记录已清空");
                }
            };

            btn.onclick = () => {
                state.isRunning = !state.isRunning;
                localStorage.setItem(CONFIG.statusKey, state.isRunning ? '1' : '0');
                if(state.isRunning) {
                    btn.innerText = "停止死磕";
                    btn.style.background = "#e74c3c";
                    btn.style.color = "#fff";
                    UI.log("🚀 启动...");
                    Core.start();
                } else {
                    btn.innerText = "开始死磕";
                    btn.style.background = "#f1c40f";
                    btn.style.color = "#000";
                    UI.log("🛑 已停止");
                    setTimeout(() => location.reload(), 500); 
                }
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

    // --- 💾 存储管理 ---
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
            if(state.visited.size > 3000) state.visited.clear();
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

            // 1. 帖子页
            if(/\/t\/.*?\/\d+$/.test(window.location.pathname)) {
                this.readPost();
                return;
            } 
            
            // 2. 强制 Latest
            if(!window.location.pathname.includes('/latest') && !window.location.pathname.includes('/top')) {
                UI.log("🔄 前往Latest...");
                window.location.href = CONFIG.homeUrl;
                return;
            }

            this.scanList();
        },

        // 🟢 扫描列表
        scanList: async function() {
            UI.log("🔍 扫描中...");
            await new Promise(r => setTimeout(r, 2000)); 

            const checkAndScroll = async () => {
                if(!state.isRunning) return;
                const links = Array.from(document.querySelectorAll('.topic-list-item .raw-topic-link'));
                const unread = links.filter(l => !state.visited.has(l.href));
                
                UI.debug(`发现:${links.length} | 未读:${unread.length}`);

                if(unread.length > 0) {
                    state.searchAttempts = 0;
                    const target = unread[0]; 
                    UI.log(`进入: ${target.innerText.trim().substring(0,8)}...`);
                    Storage.save(target.href);
                    window.location.href = target.href; 
                    return;
                }

                state.searchAttempts++;
                if(state.searchAttempts > CONFIG.maxSearchScroll) {
                    UI.log("⚠️ 无新帖，重置页面");
                    setTimeout(() => location.reload(), 5000);
                    return;
                }

                UI.log(`下钻寻找中... (${state.searchAttempts})`);
                window.scrollTo(0, document.body.scrollHeight);
                setTimeout(checkAndScroll, 2000); 
            };
            checkAndScroll();
        },

        // 🔵 阅读帖子 (V3.0 终极死磕逻辑)
        readPost: function() {
            UI.log("📖 正在爬楼...");
            
            let startTime = Date.now();
            let lastScrollTime = Date.now();
            let lastHeight = document.documentElement.scrollHeight;

            const timer = setInterval(() => {
                if(!state.isRunning) { clearInterval(timer); return; }

                // 1. 正常滚动
                window.scrollBy(0, CONFIG.scrollStep);

                // 2. 获取关键指标
                const currentHeight = document.documentElement.scrollHeight;
                const scrollPos = window.scrollY + window.innerHeight;
                
                // --- 🛡️ 核心判定条件 🛡️ ---
                
                // 条件A: 明确看到了底部的“建议话题” (这是唯一的真理)
                const footer = document.querySelector('#suggested-topics') || document.querySelector('#topic-footer-buttons');
                const isRealFooterVisible = footer && (footer.getBoundingClientRect().top <= window.innerHeight + 50);

                // 条件B: 进度条检测 (辅助判定)
                // Linux.do 右侧通常有进度条，如 "153 / 1000"
                // 暂时不作为主要退出依据，因为有时候不准，以 Footer 为准

                // 3. 状态反馈
                if(currentHeight > lastHeight) {
                    lastHeight = currentHeight;
                    lastScrollTime = Date.now(); // 重置卡顿计时
                    UI.log("📦 加载新楼层...");
                } else if (!isRealFooterVisible) {
                    // 如果高度没变，且没看到底
                    let waitTime = Math.floor((Date.now() - lastScrollTime) / 1000);
                    UI.debug(`等待加载... ${waitTime}s`);
                }

                // 4. 退出逻辑
                // 只有当 (看到了底部的Footer) 或者 (卡住超过了最大等待时间) 时才退出
                // 即使滚不动了(scrollPos >= currentHeight)，只要没看到Footer，就死等它加载
                
                if (isRealFooterVisible) {
                    clearInterval(timer);
                    UI.log(`✅ 到底！停留${CONFIG.bottomStay/1000}s`);
                    setTimeout(() => { window.location.href = CONFIG.homeUrl; }, CONFIG.bottomStay);
                } 
                else if ((Date.now() - lastScrollTime) > (CONFIG.maxWaitTime * 1000)) {
                    // 保险丝：卡了120秒还在原地，强制退出
                    clearInterval(timer);
                    UI.log("⚠️ 响应超时，强制返回");
                    setTimeout(() => { window.location.href = CONFIG.homeUrl; }, 1000);
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

    let lastUrl = window.location.href;
    setInterval(() => {
        if(state.isRunning && window.location.href !== lastUrl) {
            lastUrl = window.location.href;
            setTimeout(() => Core.router(), 2000);
        }
    }, 1000);

})();
