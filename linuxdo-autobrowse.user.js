// ==UserScript==
// @name         LinuxDo 自动刷帖（稳定版）
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  LinuxDo自动浏览（SPA适配+稳定执行）
// @author       你的用户名
// @match        https://linux.do/*
// @grant        none
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // 配置项
    const config = {
        maxPosts: 10,
        postStayTime: [3000, 5000],
        retryDelay: 2000, // 元素找不到时重试间隔
        storageKey: 'linuxdo_visited'
    };

    let visited = JSON.parse(localStorage.getItem(config.storageKey) || '[]');
    let count = 0;
    let isRunning = true;

    // 1. 增强版元素选择器（多备选）
    function getValidPostLinks() {
        const selectors = [
            'a.title.raw-link.raw-topic-link',
            '.topic-list-item a[href^="/t/"]',
            'a[data-topic-id].title-link',
            '.topic-title a'
        ];
        for (const sel of selectors) {
            const links = Array.from(document.querySelectorAll(sel)).filter(link => 
                link.href && !visited.includes(link.href)
            );
            if (links.length > 0) return links;
        }
        return [];
    }

    // 2. 随机时间工具
    function randomTime(range) {
        return Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0];
    }

    // 3. 核心逻辑（带重试）
    function runScript() {
        if (!isRunning || count >= config.maxPosts) return;

        // 如果在帖子详情页，返回列表页
        if (window.location.pathname.includes('/t/')) {
            setTimeout(() => {
                window.history.back();
                setTimeout(runScript, randomTime([1000, 2000]));
            }, randomTime(config.postStayTime));
            return;
        }

        // 获取未访问帖子，没找到则重试
        const unvisited = getValidPostLinks();
        if (unvisited.length === 0) {
            const nextBtn = document.querySelector('a.next.page-link') || document.querySelector('.pagination-next a');
            if (nextBtn) {
                nextBtn.click();
                setTimeout(runScript, config.retryDelay); // 翻页后重试
            } else {
                setTimeout(runScript, config.retryDelay); // 没下一页，重试找元素
            }
            return;
        }

        // 正常跳转帖子
        const randomPost = unvisited[Math.floor(Math.random() * unvisited.length)];
        visited.push(randomPost.href);
        localStorage.setItem(config.storageKey, JSON.stringify(visited));
        count++;

        console.log(`浏览第${count}个帖子: ${randomPost.textContent.trim()}`);
        window.location.href = randomPost.href;
        setTimeout(runScript, randomTime(config.postStayTime));
    }

    // 4. 监听SPA页面变化（关键！）
    const observer = new MutationObserver((mutations) => {
        if (mutations.some(m => m.addedNodes.length > 0)) {
            if (isRunning) runScript(); // 页面内容变化时重新触发
        }
    });

    // 启动监听+脚本
    function init() {
        observer.observe(document.body, { childList: true, subtree: true });
        runScript();
    }

    // 确保页面完全加载后启动
    if (document.readyState === 'complete') {
        init();
    } else {
        window.addEventListener('load', init);
    }

    // 手动停止（ESC键）
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            isRunning = false;
            observer.disconnect(); // 停止监听
            alert('脚本已停止');
        }
    });
})();
