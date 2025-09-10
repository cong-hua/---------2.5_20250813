// site_bridge.js - 插件桥接脚本
// 用于在网站桥接页面获取token并传递给插件

(function() {
    'use strict';
    
    console.log('插件桥接脚本已加载');
    
    // 从URL hash中获取token
    function getTokenFromHash() {
        const hash = window.location.hash.slice(1); // 移除 #
        const params = new URLSearchParams(hash);
        return params.get('t');
    }
    
    // 保存token到chrome.storage
    function saveTokenToStorage(token) {
        if (!token) {
            console.error('Token为空');
            return;
        }
        
        chrome.storage.local.set({ authToken: token }, function() {
            console.log('Token已保存到插件存储');
            
            // 发送消息到background script
            try {
                chrome.runtime.sendMessage({
                    type: 'SET_AUTH_TOKEN',
                    token: token
                }, function(response) {
                    if (chrome.runtime.lastError) {
                        console.error('发送消息到background失败:', chrome.runtime.lastError);
                    } else {
                        console.log('Token已发送到background');
                    }
                });
            } catch (error) {
                console.error('发送消息失败:', error);
            }
            
            // 更新页面显示
            updatePageStatus('success');
        });
    }
    
    // 更新页面状态
    function updatePageStatus(status) {
        const statusElement = document.getElementById('status');
        if (statusElement) {
            switch (status) {
                case 'success':
                    statusElement.textContent = '插件已连接，可以关闭此页面';
                    statusElement.style.color = '#28a745';
                    break;
                case 'error':
                    statusElement.textContent = '连接失败，请重试';
                    statusElement.style.color = '#dc3545';
                    break;
                case 'not_found':
                    statusElement.textContent = '未检测到登录信息';
                    statusElement.style.color = '#ffc107';
                    break;
            }
        }
    }
    
    // 清空URL中的token
    function clearTokenFromUrl() {
        if (window.history.replaceState) {
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }
    
    // 主函数
    function init() {
        console.log('初始化桥接脚本');
        
        const token = getTokenFromHash();
        
        if (token) {
            console.log('获取到token，长度:', token.length);
            saveTokenToStorage(token);
            
            // 延迟清空URL，确保token被保存
            setTimeout(() => {
                clearTokenFromUrl();
            }, 1000);
        } else {
            console.log('未获取到token');
            updatePageStatus('not_found');
        }
        
        // 监听来自background的消息
        chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
            console.log('收到background消息:', request);
            
            if (request.type === 'GET_TOKEN') {
                const token = getTokenFromHash();
                sendResponse({ token: token });
            }
        });
    }
    
    // 页面加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
    // 暴露到全局作用域，供页面调用
    window.SiteBridge = {
        getToken: getTokenFromHash,
        saveToken: saveTokenToStorage,
        updateStatus: updatePageStatus
    };
    
})();