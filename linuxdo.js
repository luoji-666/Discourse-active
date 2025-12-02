// ==UserScript==
// @name         LinuxDo 活跃（单页面稳定版）
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  LinuxDo自动浏览帖子（无新页面+稳定启动）
// @author       原作者 / 修复优化
// @match        https://linux.do/*
// @match        https://linux.do/c/*
// @match        https://linux.do/t/*
// @match        https://linux.do/new
// @match        https://linux.do/top
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    const config = {
        interval: 3000,       // 帖子内停留时间（含随机）
        maxPosts: 20,         // 最大浏览数
        delayBeforeNext: 2000, // 翻页延迟
        postStayMin: 3000,    // 帖子最小停留
        postStayMax: 5000     // 帖子最大停留
    };

    let currentPosts = 0;
    const visitedPosts = new Set();
    const siteKey = 'linuxdo_visited_posts_v2';
    let isRunning = true;

    // 初始化去重记录
    function initVisitedPosts() {
        const stored = localStorage.getItem(siteKey);
        if (stored) {
            const parsed = JSON.parse(stored);
            const now = Date.now();
            Object.keys(parsed).forEach(url => {
                if (now - parsed[url] < 24 * 3600 * 1000) {
                    visitedPosts.add(url);
                }
            });
        }
    }

    // 保存已访问帖子
    function saveVisitedPost(url) {
        const stored = JSON.parse(localStorage.getItem(siteKey) || '{}');
        stored[url] = Date.now();
        localStorage.setItem(siteKey, JSON.stringify(stored));
        visitedPosts.add(url);
    }

    // 多备选选择器抓帖子链接
    function getPostLinks() {
        const selectors = [
            'a.title.raw-link.raw-topic-link',
            '.topic-list-item a.title',
            'a[data-topic-id].title-link',
            '.link-top-line a.title'
        ];

        for (const sel of selectors) {
            const links = Array.from(document.querySelectorAll(sel))
                .filter(link => link.href && link.href.includes('/t/'));
            if (links.length > 0) {
                return links;
            }
        }
        return [];
    }

    // 随机停留时间
    function randomStay() {
        return Math.floor(Math.random() * (config.postStayMax - config.postStayMin + 1)) + config.postStayMin;
    }

    // 核心逻辑：当前页面跳转
    function processPost() {
        if (!isRunning || currentPosts >= config.maxPosts) {
            console.log(`[LinuxDo脚本] 停止（已浏览${currentPosts}个）`);
            return;
        }

        // 如果在帖子详情页，停留后返回列表页
        if (window.location.pathname.includes('/t/')) {
            const stayTime = randomStay();
            console.log(`[LinuxDo脚本] 帖子内停留${stayTime/1000}秒`);
            setTimeout(() => {
                window.history.back(); // 返回列表页
                setTimeout(processPost, config.delayBeforeNext);
            }, stayTime);
            return;
        }

        // 列表页：找未访问帖子
        const postLinks = getPostLinks();
        if (postLinks.length === 0) {
            setTimeout(processPost, 2000); // 没找到就重试
            return;
        }

        const unvisited = postLinks.filter(link => !visitedPosts.has(link.href));
        if (unvisited.length === 0) {
            // 跳下一页
            const nextPage = document.querySelector('a.next.page-link') || document.querySelector('.pagination-next a');
            if (nextPage) {
                console.log('[LinuxDo脚本] 无新帖，跳下一页');
                nextPage.click();
                setTimeout(processPost, config.delayBeforeNext);
            } else {
                isRunning = false;
                console.log('[LinuxDo脚本] 已到最后一页');
            }
            return;
        }

        // 当前页面跳转帖子
        const randomPost = unvisited[Math.floor(Math.random() * unvisited.length)];
        saveVisitedPost(randomPost.href);
        currentPosts++;

        console.log(`[LinuxDo脚本] 浏览第${currentPosts}个帖子：${randomPost.textContent.trim()}`);
        window.location.href = randomPost.href; // 替换当前页面，不弹新标签
    }

    // 监听页面变化（SPA适配）
    function watchPageChange() {
        let lastUrl = window.location.href;
        setInterval(() => {
            if (window.location.href !== lastUrl && isRunning) {
                lastUrl = window.location.href;
                setTimeout(processPost, 1500);
            }
        }, 1000);
    }

    // 启动入口
    function initScript() {
        initVisitedPosts();
        watchPageChange();
        setTimeout(processPost, 1000); // 延迟启动，等页面加载
        console.log('[LinuxDo脚本] 启动成功（单页面模式）');
    }

    // 页面加载完成后启动
    if (document.readyState === 'complete') {
        initScript();
    } else {
        window.addEventListener('load', initScript);
    }

    // ESC停止
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            isRunning = false;
            alert('[LinuxDo脚本] 已停止');
        }
    });
})();
