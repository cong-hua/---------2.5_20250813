// 创建一个固定的容器来放置插件窗口
const container = document.createElement('div');
container.id = 'xiaohongshu-helper-container';
container.style.cssText = `
  position: fixed;
  top: 20px;
  left: 20px;
  z-index: 9999;
  background: white;
  border: 1px solid #ccc;
  border-radius: 4px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
  display: none;
`;

document.body.appendChild(container);

// 创建一个 iframe 来加载插件内容
const iframe = document.createElement('iframe');
iframe.id = 'xiaohongshu-helper-iframe';
iframe.style.cssText = `
  width: 320px;
  height: 600px;
  border: none;
  background: white;
`;
iframe.src = chrome.runtime.getURL('popup.html');

container.appendChild(iframe);

// 监听来自后台脚本的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'togglePopup') {
    // 切换窗口显示状态
    container.style.display = container.style.display === 'none' ? 'block' : 'none';
  }
});

// 阻止点击事件冒泡，防止点击窗口内部时关闭窗口
container.addEventListener('click', (e) => {
  e.stopPropagation();
}); 