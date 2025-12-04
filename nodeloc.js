// ==UserScript==
// @name         NodeLoc 自动浏览（流畅增强版）
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  NodeLoc自动浏览帖子（平滑滚动、随机延迟、防卡死）
// @author       你的用户名
// @match        https://www.nodeloc.com/*
// @grant        none
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // ========== 配置区域 ==========
    const config = {
        maxPosts: 20,           // 每天/每次运行最大浏览帖子数
        scrollSpeed: 'fast',    // 滚动速度：'slow'(慢读), 'normal'(正常), 'fast'(刷分)
        minStayTime: 3000,      // 单个帖子最短停留时间（毫秒）
        maxStayTime: 6000,      // 单个帖子最长停留时间（毫秒）
        nextPageDelay: 1500,    // 翻页/返回后的等待时间
        storageKey: 'nodeloc_visited_posts'
    };
    // ============================

    let currentPosts = 0;
    const visitedPosts = new Set();
    let isRunning = true;

    // 获取随机停留时间
    const getRandomStayTime = () => Math.floor(Math.random() * (config.maxStayTime - config.minStayTime + 1)) + config.minStayTime;

    // 初始化去重（保留24小时内的记录）
    function initVisited() {
        try {
            const stored = localStorage.getItem(config.storageKey);
            if (stored) {
                const parsed = JSON.parse(stored);
                const now = Date.now();
                const newRecord = {};
                // 清理过期数据，只保留24小时内的
                Object.keys(parsed).forEach(url => {
                    if (now - parsed[url] < 24 * 3600 * 1000) {
                        visitedPosts.add(url);
                        newRecord[url] = parsed[url];
                    }
                });
                localStorage.setItem(config.storageKey, JSON.stringify(newRecord));
            }
        } catch (e) { console.error('存储读取失败', e); }
    }

    function saveVisited(url) {
        try {
            const stored = JSON.parse(localStorage.getItem(config.storageKey) || '{}');
            stored[url] = Date.now();
            localStorage.setItem(config.storageKey, JSON.stringify(stored));
            visitedPosts.add(url);
        } catch (e) {}
    }

    function getPostLinks() {
        const selectors = [
            'a.title.raw-link.raw-topic-link', // 列表页标题
            '.topic-list-item a.title',
            'a[data-topic-id].title-link'
        ];
        for (const sel of selectors) {
            const links = Array.from(document.querySelectorAll(sel))
                .filter(link => link.href && link.href.includes('/t/') && !link.href.includes('#')); // 排除锚点
            if (links.length > 0) return links;
        }
        return [];
    }

    // ========== 核心优化：平滑智能滚动 ==========
    function smoothScrollToBottom() {
        return new Promise(resolve => {
            console.log('[NodeLoc脚本] 开始平滑滚动...');
            
            // 根据配置决定滚动间隔
            const scrollIntervalTime = config.scrollSpeed === 'fast' ? 500 : (config.scrollSpeed === 'slow' ? 2000 : 1000);
            // 每次滚动的距离（屏幕高度的百分比）
            const scrollStepRatio = config.scrollSpeed === 'fast' ? 0.8 : 0.5;

            let totalStayTime = 0;
            const maxTimeProtection = 15000; // 强制保护：单个帖子最多呆15秒，防止无限长贴卡死

            const scrollTimer = setInterval(() => {
                if (!isRunning) {
                    clearInterval(scrollTimer);
                    return resolve();
                }

                const currentScroll = window.scrollY + window.innerHeight;
                const totalHeight = document.documentElement.scrollHeight;

                // 检查是否到底 (预留100px误差)
                if (currentScroll >= totalHeight - 100 || totalStayTime >= maxTimeProtection) {
                    clearInterval(scrollTimer);
                    console.log(`[NodeLoc脚本] 滚动结束 (耗时: ${totalStayTime}ms)`);
                    
                    // 到底后随机停留一下，模拟阅读结尾
                    setTimeout(resolve, 1000); 
                } else {
                    // 执行平滑滚动
                    window.scrollBy({
                        top: window.innerHeight * scrollStepRatio, 
                        behavior: 'smooth' 
                    });
                    totalStayTime += scrollIntervalTime;
                }
            }, scrollIntervalTime);
        });
    }

    // ========== 帖子处理逻辑 ==========
    async function processPost() {
        if (!isRunning || currentPosts >= config.maxPosts) {
            console.log(`[NodeLoc脚本] 任务完成或停止。本次共浏览: ${currentPosts}`);
            return;
        }

        // --- 场景：帖子详情页 ---
        if (window.location.pathname.includes('/t/')) {
            // 1. 先停留随机时间（模拟读标题和主楼）
            const readTime = getRandomStayTime();
            console.log(`[NodeLoc脚本] 正在阅读主楼，停留 ${readTime}ms`);
            await new Promise(r => setTimeout(r, readTime / 2));

            // 2. 平滑滚动到底部
            await smoothScrollToBottom();

            // 3. 准备返回
            console.log('[NodeLoc脚本] 阅览完毕，返回列表');
            // 优先使用 JS 返回，如果 history.length 太短则回首页
            if (window.history.length > 1) {
                window.history.back();
            } else {
                window.location.href = 'https://www.nodeloc.com/';
            }
            // 等待页面跳转的缓冲
            setTimeout(processPost, config.nextPageDelay); 
            return;
        }

        // --- 场景：帖子列表页 ---
        const postLinks = getPostLinks();
        if (postLinks.length === 0) {
            console.log('[NodeLoc脚本] 未找到帖子链接，重试中...');
            setTimeout(processPost, 2000);
            return;
        }

        // 过滤已访问
        const unvisited = postLinks.filter(link => !visitedPosts.has(link.href));
        
        // 如果当前页全看过了，翻页
        if (unvisited.length === 0) {
            console.log('[NodeLoc脚本] 当前页已阅完，尝试翻页...');
            const nextBtn = document.querySelector('a.next.page-link') || document.querySelector('.next a');
            if (nextBtn) {
                nextBtn.click();
                setTimeout(processPost, config.nextPageDelay + 1000); // 翻页多等一会
            } else {
                console.log('[NodeLoc脚本] 无下一页，停止运行');
                isRunning = false;
            }
            return;
        }

        // 随机选择一个未访问的帖子
        const randomPost = unvisited[Math.floor(Math.random() * unvisited.length)];
        saveVisited(randomPost.href);
        currentPosts++;
        
        console.log(`[NodeLoc脚本] ---> 进入第 ${currentPosts} 个帖子: ${randomPost.innerText.trim().substring(0, 20)}...`);
        
        // 模拟点击（比 href 跳转更像真人）
        randomPost.click();
        
        // 如果点击没反应（SPA），兜底跳转
        setTimeout(() => {
            if (!window.location.pathname.includes('/t/')) {
                window.location.href = randomPost.href;
            }
        }, 1000);
    }

    // 监听页面 URL 变化 (针对 SPA 单页应用优化)
    let lastUrl = window.location.href;
    setInterval(() => {
        if (window.location.href !== lastUrl) {
            lastUrl = window.location.href;
            if (isRunning) {
                console.log('[NodeLoc脚本] 页面URL变动，重新校准逻辑...');
                setTimeout(processPost, 1000);
            }
        }
    }, 1000);

    // 启动
    function init() {
        initVisited();
        console.log(`[NodeLoc脚本] 启动成功。目标: ${config.maxPosts}帖, 模式: ${config.scrollSpeed}`);
        setTimeout(processPost, 1500);
    }

    if (document.readyState === 'complete') {
        init();
    } else {
        window.addEventListener('load', init);
    }

    // 快捷键控制
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            isRunning = false;
            alert('[NodeLoc脚本] 已手动停止');
        }
    });

})();
