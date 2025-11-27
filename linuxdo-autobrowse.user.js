// ==UserScript==
// @name         LinuxDo 自动刷帖子（单页面版）
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  LinuxDo 自动浏览帖子（仅当前页面跳转，无新页面）
// @author       You
// @match        https://linux.do/*
// @grant        none
// @run-at       document.body
// ==/UserScript==

(function() {
    'use strict';

    // 等待页面完全加载后启动
    window.addEventListener('load', () => setTimeout(initScript, 2000));

    function initScript() {
        console.log('=== LinuxDo单页面自动刷帖启动 ===');

        // 配置项
        const config = {
            maxPosts: 10,          // 最大浏览数量
            postStayTime: [3000, 5000], // 帖子内停留时间（3-5秒）
            nextDelay: [1000, 2000], // 跳转间隔（1-2秒）
            storageKey: 'linuxdo_visited'
        };

        let visited = JSON.parse(localStorage.getItem(config.storageKey) || '[]');
        let count = 0;

        // 获取帖子链接（适配页面结构）
        function getPostLinks() {
            // 从当前列表页提取帖子链接（匹配页面中的标题链接）
            const links = Array.from(document.querySelectorAll('.topic-list-item a.title'))
                .map(link => link.closest('a')) // 确保是完整的<a>标签
                .filter(link => link && link.href.includes('/t/')); // 过滤有效帖子链接
            console.log(`当前页找到 ${links.length} 个帖子链接`);
            return links;
        }

        // 随机时间（范围内取随机值）
        function randomTime(range) {
            return Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0];
        }

        // 跳转到下一个未访问的帖子
        function goToNextPost() {
            if (count >= config.maxPosts) {
                console.log(`已浏览 ${count} 个帖子，达到上限，停止`);
                return;
            }

            // 如果当前在帖子详情页，先返回列表页
            if (window.location.pathname.includes('/t/')) {
                console.log('从帖子页返回列表页');
                window.history.back(); // 返回上一页（列表页）
                setTimeout(goToNextPost, randomTime(config.nextDelay));
                return;
            }

            // 在列表页：找未访问的帖子
            const allPosts = getPostLinks();
            const unvisited = allPosts.filter(link => !visited.includes(link.href));

            if (unvisited.length === 0) {
                // 无未访问帖子，跳转到下一页
                const nextBtn = document.querySelector('a.next.page-link') || document.querySelector('.pagination-next a');
                if (nextBtn) {
                    console.log('当前页无新帖，跳转到下一页');
                    nextBtn.click();
                    setTimeout(goToNextPost, randomTime(config.nextDelay));
                } else {
                    console.log('已到最后一页，无更多帖子');
                }
                return;
            }

            // 随机选一个未访问帖子，在当前页面跳转
            const randomPost = unvisited[Math.floor(Math.random() * unvisited.length)];
            visited.push(randomPost.href);
            localStorage.setItem(config.storageKey, JSON.stringify(visited));
            count++;

            const stayTime = randomTime(config.postStayTime);
            console.log(`即将浏览第 ${count} 个帖子：${randomPost.textContent.trim()}（停留 ${stayTime/1000} 秒）`);

            // 跳转到帖子详情页
            window.location.href = randomPost.href;

            // 停留后返回列表页，继续下一个
            setTimeout(goToNextPost, stayTime);
        }

        // 启动脚本
        goToNextPost();
    }
})();
