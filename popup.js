// 修改笔记数据存储，改为动态数组
let notes = [];
let isPublishing = false;

// 在文件开头添加图片数组用于跟踪顺序
let selectedImages = [];
let imagePreviewUrls = {};

// 添加飞书配置模态框HTML
const feishuModalHtml = `
<div id="feishuModal" class="modal">
  <div class="modal-content">
    <div class="modal-header">
      <h2>飞书多维表格配置</h2>
      <span class="close-modal">&times;</span>
    </div>
    <div class="form-group">
      <label for="appId">App ID:</label>
      <input type="text" id="appId" placeholder="输入飞书应用的App ID">
    </div>
    <div class="form-group">
      <label for="appSecret">App Secret:</label>
      <input type="text" id="appSecret" placeholder="输入飞书应用的App Secret">
    </div>
    <div class="form-group">
      <label for="appToken">多维表格AppToken:</label>
      <input type="text" id="appToken" placeholder="输入飞书多维表格的AppToken">
    </div>
    <div class="form-group">
      <label for="tableId">表格ID:</label>
      <input type="text" id="tableId" placeholder="输入表格ID">
    </div>
    <div class="form-group">
      <label for="viewId">视图ID:</label>
      <input type="text" id="viewId" placeholder="输入视图ID（可选）">
    </div>
    <div class="feishu-btn-group">
      <button id="saveFeishuConfig" class="btn-primary">保存配置</button>
      <button id="testFeishuConnection" class="btn-secondary">测试连接</button>
    </div>
    <div id="feishuStatus" class="status-message"></div>
  </div>
</div>
`;

// 添加飞书模态框CSS
const feishuModalCss = `
<style>
  .modal {
    display: none;
    position: fixed;
    z-index: 9999;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    overflow: auto;
    background-color: rgba(0, 0, 0, 0.4);
  }
  
  .modal-content {
    background-color: #fefefe;
    margin: 10% auto;
    padding: 20px;
    border: 1px solid #ddd;
    border-radius: 12px;
    width: 80%;
    max-width: 500px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  }
  
  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    padding-bottom: 10px;
    border-bottom: 1px solid #eee;
  }
  
  .modal-header h2 {
    margin: 0;
    color: #3370ff;
    font-size: 20px;
  }
  
  .close-modal {
    color: #aaa;
    font-size: 28px;
    font-weight: bold;
    cursor: pointer;
  }
  
  .close-modal:hover {
    color: #000;
  }
  
  .form-group {
    margin-bottom: 15px;
  }
  
  .form-group label {
    display: block;
    margin-bottom: 5px;
    font-weight: 500;
  }
  
  .form-group input {
    width: 100%;
    padding: 10px;
    border: 1px solid #ddd;
    border-radius: 8px;
    font-size: 14px;
  }
  
  .feishu-btn-group {
    display: flex;
    gap: 10px;
    margin-top: 20px;
  }
  
  .btn-primary {
    background-color: #3370ff;
    color: white;
    border: none;
    padding: 10px 15px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 15px;
    font-weight: 500;
    flex: 1;
  }
  
  .btn-secondary {
    background-color: #f0f0f0;
    color: #333;
    border: 1px solid #ddd;
    padding: 10px 15px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 15px;
    font-weight: 500;
    flex: 1;
  }
  
  .btn-primary:hover {
    background-color: #2860e0;
  }
  
  .btn-secondary:hover {
    background-color: #e0e0e0;
  }
  
  .status-message {
    margin-top: 15px;
    padding: 10px;
    border-radius: 6px;
    display: none;
  }
  
  .status-message.success {
    background-color: #f6ffed;
    border: 1px solid #b7eb8f;
    color: #52c41a;
    display: block;
  }
  
  .status-message.error {
    background-color: #fff2f0;
    border: 1px solid #ffccc7;
    color: #ff4d4f;
    display: block;
  }
  
  .status-message.loading {
    background-color: #e6f7ff;
    border: 1px solid #91d5ff;
    color: #1890ff;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .loading-spinner {
    border: 3px solid #f3f3f3;
    border-top: 3px solid #3370ff;
    border-radius: 50%;
    width: 20px;
    height: 20px;
    animation: spin 1s linear infinite;
    margin-right: 10px;
  }
  
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
</style>
`;

// 修改发布配置对象
const publishConfig = {
  intervalType: 'fixed', // 'fixed' 或 'random'
  fixedInterval: 300,    // 默认5分钟
  minInterval: 300,      // 默认最小5分钟
  maxInterval: 600,      // 默认最大10分钟
};

// 添加倒计时状态
let countdownTimers = [];

// 在文件开头添加状态保存和恢复函数
async function saveState() {
  try {
    const state = {
      notes,
      publishConfig,
      isPublishing
    };
    await chrome.storage.local.set({ popupState: state });
  } catch (error) {
    console.error('保存状态失败:', error);
  }
}

// 飞书配置相关变量
let feishuConfig = {
  appId: '',
  appSecret: '',
  appToken: '',
  tableId: '',
  viewId: ''
};

// 保存飞书配置
async function saveFeishuConfig() {
  try {
    await chrome.storage.local.set({ feishuConfig });
    console.log('飞书配置已保存');
  } catch (error) {
    console.error('保存飞书配置失败:', error);
  }
}

// 恢复飞书配置
async function restoreFeishuConfig() {
  try {
    const data = await chrome.storage.local.get(['feishuConfig']);
    if (data.feishuConfig) {
      feishuConfig = data.feishuConfig;
      
      // 填充表单
      if (document.getElementById('appId')) {
        document.getElementById('appId').value = feishuConfig.appId || '';
      }
      if (document.getElementById('appSecret')) {
        document.getElementById('appSecret').value = feishuConfig.appSecret || '';
      }
      if (document.getElementById('appToken')) {
        document.getElementById('appToken').value = feishuConfig.appToken || '';
      }
      if (document.getElementById('tableId')) {
        document.getElementById('tableId').value = feishuConfig.tableId || '';
      }
      if (document.getElementById('viewId')) {
        document.getElementById('viewId').value = feishuConfig.viewId || '';
      }
    }
  } catch (error) {
    console.error('恢复飞书配置失败:', error);
  }
}

async function restoreState() {
  try {
    const data = await chrome.storage.local.get(['popupState', 'publishState']);
    
    // 恢复 popup 状态
    if (data.popupState) {
      notes = data.popupState.notes;
      publishConfig = data.popupState.publishConfig;
      isPublishing = data.popupState.isPublishing;
      
      // 更新界面
      updateNotePanels();
      
      // 恢复发布设置
      const intervalTypeInputs = document.querySelectorAll('input[name="intervalType"]');
      intervalTypeInputs.forEach(input => {
        if (input.value === publishConfig.intervalType) {
          input.checked = true;
          // 触发change事件以显示/隐藏相应的设置项
          input.dispatchEvent(new Event('change'));
        }
      });
      
      document.getElementById('fixedInterval').value = publishConfig.fixedInterval / 60;
      document.getElementById('minInterval').value = publishConfig.minInterval / 60;
      document.getElementById('maxInterval').value = publishConfig.maxInterval / 60;
    }

    // 检查是否正在发布
    if (data.publishState && data.publishState.isPublishing) {
      isPublishing = true;
      addLog('发布任务正在后台运行中...', 'info');
    }
  } catch (error) {
    console.error('恢复状态失败:', error);
  }
}

// 在文件中添加状态变化监听
function setupStateListeners() {
  // 监听笔记内容变化
  const observer = new MutationObserver(() => {
    saveState();
  });

  // 监听设置变化
  const intervalTypeInputs = document.querySelectorAll('input[name="intervalType"]');
  intervalTypeInputs.forEach(input => {
    input.addEventListener('change', saveState);
  });

  document.getElementById('fixedInterval').addEventListener('change', saveState);
  document.getElementById('minInterval').addEventListener('change', saveState);
  document.getElementById('maxInterval').addEventListener('change', saveState);
  
  // 监听飞书配置变化
  const feishuInputs = ['appId', 'appSecret', 'appToken', 'tableId', 'viewId'];
  feishuInputs.forEach(id => {
    const input = document.getElementById(id);
    if (input) {
      input.addEventListener('change', () => {
        feishuConfig[id] = input.value.trim();
        saveFeishuConfig();
      });
    }
  });
}

// 改进日志函数
function addLog(message, type = 'info', details = '') {
  const logData = {
    time: new Date().toLocaleTimeString(),
    message,
    type,
    details
  };

  // 保存日志到 storage
  chrome.storage.local.get('logs', (data) => {
    const logs = data.logs || [];
    logs.push(logData);
    // 只保留最近的 100 条日志
    if (logs.length > 100) {
      logs.shift();
    }
    chrome.storage.local.set({ logs });
  });

  // 显示日志
  const logPanel = document.getElementById('logPanel');
  if (!logPanel) return;
  
  const logItem = document.createElement('div');
  logItem.className = `log-item ${type}`;
  
  const timeSpan = document.createElement('span');
  timeSpan.className = 'log-time';
  timeSpan.textContent = `[${logData.time}] `;
  
  const messageSpan = document.createElement('span');
  messageSpan.className = 'log-message';
  messageSpan.textContent = message;
  
  logItem.appendChild(timeSpan);
  logItem.appendChild(messageSpan);
  
  if (details) {
    const detailsDiv = document.createElement('div');
    detailsDiv.className = 'log-details';
    detailsDiv.textContent = details;
    logItem.appendChild(detailsDiv);
  }
  
  logPanel.appendChild(logItem);
  logPanel.scrollTop = logPanel.scrollHeight;
}

// 等待页面加载完成
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // 初始化UI
    setupEventListeners();
    
    // 设置消息监听
    setupMessageListener();
    setupStateListeners();
    
    // 设置飞书更新日志增强
    setupFeishuUpdateListener();
    
    // 恢复飞书配置
    await restoreFeishuConfig();
    
    // 恢复应用状态
    await restoreState();
    
    // 恢复日志
    await restoreLogs();
    
    // 初始化飞书模态框
    initFeishuModal();
    
    console.log('扩展初始化完成');
  } catch (error) {
    console.error('初始化失败:', error);
    addLog('初始化失败: ' + error.message, 'error');
  }
});

// 辅助函数：更新按钮状态
function updateButtonStatus(isPublishing) {
  const startButton = document.getElementById('startButton');
  const stopButton = document.getElementById('stopButton');
  
  if (startButton && stopButton) {
    if (isPublishing) {
      startButton.style.display = 'none';
      stopButton.style.display = 'block';
    } else {
      startButton.style.display = 'block';
      stopButton.style.display = 'none';
    }
  }
}

function switchTab(selector) {
  // 1. 找到所有的tab元素
  const allTabs = document.querySelectorAll('.creator-tab');
  
  // 2. 移除所有tab的active类
  allTabs.forEach(tab => {
    tab.classList.remove('active');
  });
  
  // 3. 给目标元素添加active类
  const targetTab = document.querySelector(selector);
  if (targetTab) {
    targetTab.classList.add('active');
    addLog('已切换到目标标签', 'success');
  } else {
    addLog('未找到目标标签', 'error');
  }
}

function triggerElementClick(selector) {
  const element = document.querySelector(selector);
  if (!element) {
    console.log('未找到元素:', selector);
    return;
  }

  console.log('找到元素:', selector);

  // 方法1: 原生click()
  element.click();
  
  // 方法2: 模拟鼠标事件序列
  const events = [
    'mousedown',
    'mouseup',
    'click'
  ];

  events.forEach(eventName => {
    const event = new MouseEvent(eventName, {
      view: window,
      bubbles: true,
      cancelable: true,
      clientX: element.getBoundingClientRect().left + 5,
      clientY: element.getBoundingClientRect().top + 5
    });
    element.dispatchEvent(event);
  });

  // 方法3: 触发所有可能的事件
  [
    new MouseEvent('mouseover', { bubbles: true }),
    new MouseEvent('mouseenter', { bubbles: true }),
    new MouseEvent('mousedown', { bubbles: true }),
    new MouseEvent('mouseup', { bubbles: true }),
    new MouseEvent('click', { bubbles: true }),
    new Event('focus', { bubbles: true }),
    new KeyboardEvent('keydown', { bubbles: true }),
    new KeyboardEvent('keyup', { bubbles: true }),
    new KeyboardEvent('keypress', { bubbles: true })
  ].forEach(event => element.dispatchEvent(event));

  // 方法4: 直接执行元素上的onclick函数
  if (typeof element.onclick === 'function') {
    element.onclick();
  }

  // 方法5: 查找并触发父元素的点击事件
  let parent = element.parentElement;
  while (parent) {
    if (typeof parent.onclick === 'function') {
      parent.onclick();
    }
    parent = parent.parentElement;
  }

  // 输出元素的所有属性和事件处理器
  console.log('元素属性:', {
    id: element.id,
    className: element.className,
    style: element.style.cssText,
    onclick: element.onclick,
    dataset: element.dataset,
    attributes: Array.from(element.attributes).map(attr => ({
      name: attr.name,
      value: attr.value
    }))
  });
}

function simulateRealClick(selector) {
  const element = document.querySelector(selector);
  if (!element) return;

  const rect = element.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  const options = {
    bubbles: true,
    cancelable: true,
    view: window,
    detail: 1,
    screenX: centerX + window.screenX,
    screenY: centerY + window.screenY,
    clientX: centerX,
    clientY: centerY,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    button: 0,
    relatedTarget: null
  };

  element.dispatchEvent(new MouseEvent('mouseover', options));
  element.dispatchEvent(new MouseEvent('mouseenter', options));
  element.dispatchEvent(new MouseEvent('mousedown', options));
  element.dispatchEvent(new MouseEvent('mouseup', options));
  element.dispatchEvent(new MouseEvent('click', options));

  if (element.focus) {
    element.focus();
  }
}

// 修改图片预览创建函数
function createImagePreview(imageData, index, panel, noteIndex) {
  const wrapper = document.createElement('div');
  wrapper.className = 'preview-image-wrapper';
  wrapper.dataset.index = index;
  wrapper.draggable = true;
  
  const img = document.createElement('img');
  img.src = imageData.dataUrl;
  wrapper.appendChild(img);
  
  // 增加拖拽排序功能
  wrapper.addEventListener('dragstart', e => {
    e.dataTransfer.setData('text/plain', index);
    wrapper.classList.add('dragging');
  });
  
  wrapper.addEventListener('dragend', () => {
    wrapper.classList.remove('dragging');
  });
  
  wrapper.addEventListener('dragover', e => {
    e.preventDefault();
    const dragging = panel.querySelector('.dragging');
    if (dragging && dragging !== wrapper) {
      const imagePreview = panel.querySelector('.preview-images');
      const afterElement = getDragAfterElement(imagePreview, e.clientY);
      if (afterElement) {
        imagePreview.insertBefore(dragging, afterElement);
      } else {
        imagePreview.appendChild(dragging);
      }
    }
  });
  
  wrapper.addEventListener('dragenter', e => {
    e.preventDefault();
    wrapper.classList.add('drag-over');
  });
  
  wrapper.addEventListener('dragleave', () => {
    wrapper.classList.remove('drag-over');
  });
  
  wrapper.addEventListener('drop', e => {
    e.preventDefault();
    wrapper.classList.remove('drag-over');
    
    // 更新索引
    updateNoteImageIndices(panel, noteIndex);
  });
  
  // 点击图片右上角的删除按钮
  wrapper.addEventListener('click', e => {
    // 计算点击位置是否在右上角
    const rect = wrapper.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // 右上角区域定义为一个20x20的区域
    if (x > rect.width - 30 && y < 30) {
      // 删除图片
      wrapper.remove();
      
      // 从笔记中移除图片数据
      delete notes[noteIndex].images[index];
      delete notes[noteIndex].imageUrls[index];
      
      // 更新索引
      updateNoteImageIndices(panel, noteIndex);
      
      addLog(`已删除图片 #${index + 1}`, 'info');
      saveState();
    }
  });
  
  return wrapper;
}

// 辅助函数，用于确定元素拖拽后的位置
function getDragAfterElement(container, y) {
  const draggableElements = [...container.querySelectorAll('.preview-image-wrapper:not(.dragging)')];
  
  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    
    if (offset < 0 && offset > closest.offset) {
      return { offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// 修改更新图片索引的函数
function updateNoteImageIndices(panel, noteIndex) {
  const imagePreview = panel.querySelector('.preview-images');
  const wrappers = [...imagePreview.children];
  const newImages = [];
  const newImageUrls = {};
  
  wrappers.forEach((wrapper, newIndex) => {
    const oldIndex = parseInt(wrapper.dataset.index);
    
    // 更新DOM中的索引
    wrapper.dataset.index = newIndex;
    
    // 更新数据
    if (notes[noteIndex].images[oldIndex]) {
      newImages[newIndex] = notes[noteIndex].images[oldIndex];
      newImageUrls[newIndex] = notes[noteIndex].imageUrls[oldIndex];
    }
  });
  
  // 更新笔记对象中的图片数据
  notes[noteIndex].images = newImages.filter(Boolean);
  notes[noteIndex].imageUrls = Object.fromEntries(
    Object.entries(newImageUrls).filter(([_, v]) => v)
  );

  // 保存更新后的图片数据
  saveState();
}

// 修改解析笔记内容的函数
function parseNoteContent(text) {
  try {
    // 按行分割，保留所有空行
    const lines = text.split('\n');
    
    // 获取标题（第一行）
    const title = lines[0].trim();
    
    // 初始化变量
    let body = [];
    let tags = [];
    let productId = '';
    let isBody = true;
    let hasStartedBody = false;
    
    // 从第二行开始遍历
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      
      // 检查是否是标签行（包含#号的行）
      if (trimmedLine.includes('#')) {
        isBody = false; // 标记已经不是正文部分
        // 匹配所有标签，包括中文
        const tagMatches = trimmedLine.match(/#[\u4e00-\u9fa5a-zA-Z0-9]+/g);
        if (tagMatches) {
          tags = tags.concat(tagMatches);
        }
        continue;
      }
      
      // 检查是否是商品ID行（多种可能的格式）
      if (trimmedLine.toLowerCase().includes('商品id') || 
          trimmedLine.toLowerCase().includes('商品：') ||
          trimmedLine.toLowerCase().includes('商品:')) {
        isBody = false; // 标记已经不是正文部分
        // 匹配多种可能的分隔符
        const idMatch = trimmedLine.match(/(?:商品id|商品)[：:]\s*([a-zA-Z0-9]+)/i);
        if (idMatch) {
          productId = idMatch[1].trim();
        }
        continue;
      }
      
      // 如果还在正文部分
      if (isBody) {
        // 如果是第一个非空行，标记正文开始
        if (!hasStartedBody && trimmedLine) {
          hasStartedBody = true;
        }
        
        // 如果已经开始正文，保留所有行（包括空行）
        if (hasStartedBody) {
          body.push(line); // 使用原始行，不做trim
        }
      }
    }

    // 移除正文末尾的连续空行
    while (body.length > 0 && body[body.length - 1].trim() === '') {
      body.pop();
    }

    // 移除正文开头的连续空行
    while (body.length > 0 && body[0].trim() === '') {
      body.shift();
    }

    // 添加解析日志
    addLog(`解析笔记内容:
标题: ${title}
正文行数: ${body.length}
标签: ${tags.join(' ')}
商品ID: ${productId || '无'}`, 'info');

    // 添加详细日志
    addLog(`正文预览:
${body.slice(0, 3).join('\n')}
...
${body.slice(-3).join('\n')}`, 'info');

    return {
      title,
      body: body.join('\n'),
      tags,
      productId
    };
  } catch (error) {
    console.error('解析笔记内容出错:', error);
    addLog(`解析笔记内容出错: ${error.message}`, 'error');
    return {
      title: '',
      body: '',
      tags: [],
      productId: ''
    };
  }
}

// 更新样式
const style = document.createElement('style');
style.textContent = `
  .preview-images {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: 8px;
    padding: 8px;
    min-height: 100px;
    background: #f5f5f5;
    border-radius: 4px;
  }

  .preview-image-wrapper {
    position: relative;
    aspect-ratio: 1;
    border-radius: 4px;
    overflow: hidden;
    cursor: move;
    transition: all 0.2s ease;
    background: white;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    user-select: none;
  }

  .preview-image-wrapper img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    pointer-events: none;
  }

  .preview-image-wrapper.dragging {
    opacity: 0.8;
    transform: scale(1.05);
    box-shadow: 0 5px 15px rgba(0,0,0,0.2);
    z-index: 1000;
  }

  .image-index {
    position: absolute;
    top: 4px;
    left: 4px;
    background: rgba(0, 0, 0, 0.6);
    color: white;
    padding: 2px 6px;
    border-radius: 10px;
    font-size: 12px;
    z-index: 1;
  }

  .delete-image {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: rgba(255, 0, 0, 0.8);
    color: white;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    opacity: 0;
    transition: opacity 0.2s;
    z-index: 1;
  }

  .preview-image-wrapper:hover .delete-image {
    opacity: 1;
  }

  // 修改日志面板样式
  #logPanel {
    height: 300px !important; // 增加高度
    font-size: 14px !important; // 增大字体
    line-height: 1.5 !important; // 增加行高
    padding: 10px !important; // 增加内边距
    white-space: pre-wrap !important; // 保留换行和空格
  }

  .log-item {
    margin-bottom: 8px !important; // 增加日志条目间距
    border-bottom: 1px solid #eee !important; // 添加分隔线
    padding-bottom: 4px !important; // 增加底部内边距
  }

  .log-item.countdown {
    background-color: #fff3e0;
    color: #e65100;
    font-weight: bold;
    padding: 8px;
    margin: 4px 0;
    border-radius: 4px;
    white-space: pre-line;
  }
`;
document.head.appendChild(style);

// 修改面板日志函数
function addLogToPanel(panel, message, type = 'info') {
  const noteId = panel.id;
  const logPanel = document.getElementById(`${noteId}-logs`);
  if (!logPanel) return;
  
  const time = new Date().toLocaleTimeString();
  const logItem = document.createElement('div');
  logItem.className = `log-item ${type}`;
  logItem.textContent = `${time}: ${message}`;
  
  logPanel.appendChild(logItem);
  logPanel.scrollTop = logPanel.scrollHeight;
}

// 修改发布笔记函数
async function publishNote(noteData, index) {
  try {
    addLog(`开始发布第${index + 1}篇笔记...`, 'step');
    
    // 检查并记录商品ID
    const productId = noteData.productId || '';
    addLog(`正在处理笔记${index + 1}, 商品ID是: ${productId}`);

    // 检查并记录商品规格
    const productSpec = noteData.productSpec || '';
    if (productSpec) {
      addLog(`笔记${index + 1}的商品规格是: ${productSpec}`);
    }

    // 获取当前标签页
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // 1. 打开发布页面
    addLog('正在打开发布页面...');
    await chrome.tabs.update(tab.id, { 
      url: 'https://creator.xiaohongshu.com/publish/publish?source=official&from=tab_switch' 
    });
    
    // 2. 等待页面加载
    addLog('等待页面加载完成...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 3. 点击图文按钮
    addLog('点击图文按钮...');
    const clickTextResult = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: () => {
        return new Promise((resolve) => {
          const waitForButton = setInterval(() => {
            const btn = document.querySelector('#web > div.outarea.upload-c > div > div > div.header > div:nth-child(2) > span');
            if (btn) {
              clearInterval(waitForButton);
              btn.click();
              resolve({ success: true });
            }
          }, 1000);

          // 20秒后超时
          setTimeout(() => {
            clearInterval(waitForButton);
            resolve({ success: false, error: '未找到图文按钮' });
          }, 20000);
        });
      }
    });

    if (!clickTextResult[0].result.success) {
      throw new Error(clickTextResult[0].result.error);
    }

    // 4. 等待页面切换完成
    addLog('等待页面切换...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 5. 点击上传图片并上传已选择的图片
    addLog('开始上传已选择的图片');
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: (imageDataArray) => {
        return new Promise((resolve) => {
          const uploadInput = document.querySelector('#web > div.outarea.upload-c > div > div > div.upload-content > div.upload-wrapper > div > input');
          if (uploadInput) {
            // 创建 DataTransfer 对象
            const dataTransfer = new DataTransfer();
            
            // 将 base64 数据转换为 File 对象
            imageDataArray.forEach((imageData, index) => {
              // 从 base64 创建 Blob
              const byteString = atob(imageData.split(',')[1]);
              const mimeString = imageData.split(',')[0].split(':')[1].split(';')[0];
              const ab = new ArrayBuffer(byteString.length);
              const ia = new Uint8Array(ab);
              for (let i = 0; i < byteString.length; i++) {
                ia[i] = byteString.charCodeAt(i);
              }
              const blob = new Blob([ab], { type: mimeString });
              
              // 创建 File 对象
              const file = new File([blob], `image${index + 1}.jpg`, { type: mimeString });
              dataTransfer.items.add(file);
            });

            // 设置文件到上传输入框
            uploadInput.files = dataTransfer.files;
            uploadInput.dispatchEvent(new Event('change', { bubbles: true }));
            resolve(true);
          } else {
            resolve(false);
          }
        });
      },
      args: [Object.values(noteData.imageUrls)] // 使用保存的 base64 数据
    });

    // 等待图片上传完成
    addLog('等待图片上传完成...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 6. 填写笔记内容
    addLog('开始填写内容');
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: (contentData, productId, productSpec) => {
        return new Promise((resolve) => {
          setTimeout(() => {
            // 填写标题
            const titleInput = document.querySelector('.titleInput input');
            if (titleInput) {
              titleInput.value = contentData.title;
              titleInput.dispatchEvent(new Event('input', { bubbles: true }));
            }

            // 点击正文编辑器
            const editor = document.querySelector('#quillEditor > div');
            if (editor) {
              editor.click();
              editor.focus();
              editor.innerHTML = '';

              // 处理正文内容 - 如果有商品规格，添加到正文末尾
              let bodyContent = contentData.body;
              if (productSpec) {
                bodyContent += `\n\n商品规格: ${productSpec}`;
              }

              // 分行处理正文，保留空行
              const lines = bodyContent.split('\n');
              let currentLine = 0;

              function typeLine() {
                if (currentLine < lines.length) {
                  const line = lines[currentLine];
                  
                  // 如果不是第一行，先按回车换行
                  if (currentLine > 0) {
                    editor.dispatchEvent(new KeyboardEvent('keydown', {
                      key: 'Enter',
                      code: 'Enter',
                      keyCode: 13,
                      which: 13,
                      bubbles: true
                    }));
                  }

                  // 如果是空行，只需要换行
                  if (line.trim() === '') {
                    currentLine++;
                    setTimeout(typeLine, 100);
                  } else {
                    // 逐字符输入当前行
                    let charIndex = 0;
                    function typeChar() {
                      if (charIndex < line.length) {
                        document.execCommand('insertText', false, line[charIndex]);
                        editor.dispatchEvent(new Event('input', { bubbles: true }));
                        charIndex++;
                        setTimeout(typeChar, 50);
                      } else {
                        currentLine++;
                        setTimeout(typeLine, 100);
                      }
                    }
                    typeChar();
                  }
                } else {
                  // 确保最后有一个空行
                  editor.dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'Enter',
                    code: 'Enter',
                    keyCode: 13,
                    which: 13,
                    bubbles: true
                  }));
                  setTimeout(startAddingTags, 500);
                }
              }

              // 开始输入正文
              typeLine();

              // 输入标签
              function startAddingTags() {
                let currentIndex = 0;
                function addNextTag() {
                  if (currentIndex < contentData.tags.length) {
                    const tag = contentData.tags[currentIndex];
                    
                    // 如果不是第一个标签，添加空格
                    if (currentIndex > 0) {
                      document.execCommand('insertText', false, ' ');
                    }

                    // 直接输入标签文本（包含#）
                    let charIndex = 0;
                    function typeChar() {
                      if (charIndex < tag.length) {
                        document.execCommand('insertText', false, tag[charIndex]);
                        editor.dispatchEvent(new Event('input', { bubbles: true }));
                        charIndex++;
                        setTimeout(typeChar, 200);
                      } else {
                        // 等待2秒让下拉框出现
                        setTimeout(() => {
                          // 按回车选择标签
                          editor.dispatchEvent(new KeyboardEvent('keydown', {
                            key: 'Enter',
                            code: 'Enter',
                            keyCode: 13,
                            which: 13,
                            bubbles: true
                          }));
                          
                          // 等待标签选择后添加下一个
                          setTimeout(() => {
                            currentIndex++;
                            addNextTag();
                          }, 1000);
                        }, 2000);
                      }
                    }
                    typeChar();
                  } else {
                    // 添加商品ID（如果有）
                    if (productId) {
                      setTimeout(() => {
                        const goodsInput = document.querySelector('.productSearchBasisSearchContent input');
                        if (goodsInput) {
                          goodsInput.value = productId;
                          goodsInput.dispatchEvent(new Event('input', { bubbles: true }));
                          
                          // 等待搜索结果
                          setTimeout(() => {
                            // 点击搜索按钮
                            const searchBtn = document.querySelector('.productSearchBasisOperation button');
                            if (searchBtn) {
                              searchBtn.click();
                              
                              // 等待搜索结果并点击第一项
                              setTimeout(() => {
                                const firstResult = document.querySelector('.productSelectItem');
                                if (firstResult) {
                                  firstResult.click();
                                }
                                resolve(true);
                              }, 3000);
                            } else {
                              resolve(true);
                            }
                          }, 1000);
                        } else {
                          resolve(true);
                        }
                      }, 1000);
                    } else {
                      resolve(true);
                    }
                  }
                }

                // 开始添加标签
                addNextTag();
              }
            } else {
              resolve(false);
            }
          }, 1000);
        });
      },
      args: [
        { title: noteData.title, body: noteData.body, tags: noteData.tags },
        noteData.productId,
        noteData.productSpec
      ]
    });

    // 等待内容填写完成
    addLog('等待内容填写完成...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    addLog(`第${index + 1}篇笔记发布准备完成，请手动点击发布按钮`, 'success');
    
    // 标记笔记为已发布
    notes[index].published = true;
    
    // 保存状态
    await saveState();
    
    // 检查是否是从飞书导入的笔记，如果是则更新飞书状态
    if (noteData.from === 'feishu' && noteData.recordId) {
      try {
        addLog('检测到笔记来自飞书，正在更新飞书状态...', 'info');
        addLog(`笔记ID:${noteData.recordId}, 标题:"${noteData.title}"`, 'info');
        
        // 检查noteData内容，排除错误可能
        console.log('[publishNote] 笔记数据:', JSON.stringify(noteData, (key, value) => {
          if (key === 'images' || key === 'imageUrls') {
            return '[图片数据]';
          }
          return value;
        }, 2));
        
        // 检查feishuClient是否存在
        if (window.feishuClient) {
          addLog('飞书客户端已初始化，准备更新状态', 'info');
          
          // 检查飞书客户端配置
          const configStatus = checkFeishuClientConfig();
          if (!configStatus.success) {
            addLog(`飞书客户端配置不完整: ${configStatus.error}`, 'warning');
            addLog('请先完成飞书配置后再尝试', 'info');
            return true; // 仍然返回成功，因为发布成功了
          }
          
          // 确保有token
          let token;
          try {
            token = await window.feishuClient.getTenantAccessToken();
            if (token) {
              addLog('成功获取飞书访问令牌', 'info');
            } else {
              addLog('获取飞书访问令牌失败: 返回为空', 'warning');
              return true; // 仍然返回成功，因为发布成功了
            }
          } catch (tokenError) {
            addLog(`获取飞书访问令牌失败: ${tokenError.message}`, 'warning');
            return true; // 仍然返回成功，因为发布成功了
          }
          
          // 更新飞书记录的发布状态
          addLog('开始更新飞书记录发布状态...', 'step');
          const updateResult = await window.feishuClient.updateRecordPublishStatus(noteData.recordId);
          
          if (updateResult.success) {
            addLog(`已成功更新飞书记录"${noteData.title}"状态为"已发布"`, 'success');
            
            // 记录使用的字段名
            if (updateResult.fieldName) {
              addLog(`使用字段名"${updateResult.fieldName}"更新成功`, 'info');
            }
            
            // 展示响应详情
            if (updateResult.result) {
              addLog('更新响应详情', 'info', JSON.stringify(updateResult.result, null, 2));
            }
          } else {
            addLog(`更新飞书状态失败: ${updateResult.error}`, 'warning');
            
            // 检查可能的原因
            if (updateResult.error && updateResult.error.includes('权限')) {
              addLog('可能原因：飞书授权权限不足，请确保应用有写入权限', 'warning');
            } else if (updateResult.error && updateResult.error.includes('记录') && updateResult.error.includes('不存在')) {
              addLog('可能原因：飞书中的记录已被删除或移动', 'warning');
            } else if (updateResult.error && (updateResult.error.includes('字段') || updateResult.error.includes('field'))) {
              addLog('可能原因："是否发布"字段不存在或字段名不匹配', 'warning');
              addLog('请确认飞书多维表格中是否存在名为"是否发布"的字段', 'info');
            }
            
            // 显示尝试过的字段
            if (updateResult.triedFields) {
              addLog(`尝试过的字段名: ${updateResult.triedFields.join(', ')}`, 'info');
            }
          }
        } else {
          addLog('飞书客户端未初始化，尝试初始化客户端...', 'warning');
          
          // 尝试初始化客户端
          if (typeof feishuClient !== 'undefined') {
            window.feishuClient = feishuClient;
            addLog('已将feishuClient设置为全局变量，请尝试再次发布', 'info');
          } else {
            addLog('无法找到feishuClient对象，请先从飞书导入数据', 'warning');
          }
        }
      } catch (error) {
        console.error('更新飞书状态时出错:', error);
        addLog(`更新飞书状态异常: ${error.message}`, 'error');
        addLog('错误堆栈', 'error', error.stack);
        // 这里不抛出异常，因为笔记已经发布成功，更新飞书状态是附加功能
      }
    } else {
      // 记录为什么没有更新飞书状态
      if (!noteData.from || noteData.from !== 'feishu') {
        addLog('笔记来源不是飞书，不需要更新飞书状态', 'info');
      } else if (!noteData.recordId) {
        addLog('笔记缺少飞书记录ID，无法更新飞书状态', 'warning');
      }
    }
    
    return true;
  } catch (error) {
    console.error('发布笔记失败:', error);
    addLog(`发布笔记失败: ${error.message}`, 'error');
    throw error;
  }
}

// 添加更新笔记面板的函数
function updateNotePanels() {
  // 获取笔记容器
  const notesContainer = document.querySelector('.notes-container');
  if (!notesContainer) return;

  // 清空容器
  notesContainer.innerHTML = '';

  // 获取模板
  const template = document.getElementById('note-panel-template');
  if (!template) {
    addLog('未找到笔记面板模板', 'error');
    return;
  }

  // 如果有从飞书导入的笔记，添加测试按钮
  if (notes.length > 0 && notes.some(note => note.from === 'feishu' && note.recordId)) {
    // 测试按钮临时隐藏，需要时可以将下面的 false 改为 true 来显示测试按钮
    const showTestButtons = false;
    
    if (showTestButtons) {
      const testBtn = document.createElement('button');
      testBtn.innerText = '测试更新飞书字段';
      testBtn.className = 'button primary';
      testBtn.style.marginBottom = '10px';
      testBtn.addEventListener('click', async () => {
        try {
          // 找到第一个从飞书导入的有recordId的笔记
          const feishuNote = notes.find(note => note.from === 'feishu' && note.recordId);
          
          if (!feishuNote) {
            addLog('未找到有效的飞书笔记', 'error');
            return;
          }
          
          addLog(`开始测试更新飞书记录 ${feishuNote.recordId} 的状态...`, 'info');
          addLog(`记录标题: "${feishuNote.title}"`, 'info');
          
          // 检查feishuClient是否存在
          if (!window.feishuClient) {
            addLog('飞书客户端未初始化，尝试初始化客户端...', 'warning');
            
            // 尝试初始化客户端
            if (typeof feishuClient !== 'undefined') {
              window.feishuClient = feishuClient;
              addLog('已将feishuClient设置为全局变量', 'info');
            } else {
              addLog('无法找到feishuClient对象，请先从飞书导入数据', 'error');
              return;
            }
          }
          
          // 检查飞书客户端配置
          const configStatus = checkFeishuClientConfig();
          if (!configStatus.success) {
            addLog(`飞书客户端配置不完整: ${configStatus.error}`, 'error');
            addLog('请先完成飞书配置后再尝试', 'info');
            return;
          }
          
          addLog('检查飞书客户端配置成功', 'success');
          addLog(`飞书应用: ${configStatus.appId}, 表格: ${configStatus.tableId}`, 'info');
          
          // 确保有token
          addLog('正在获取飞书访问令牌...', 'info');
          try {
            const token = await window.feishuClient.getTenantAccessToken();
            if (token) {
              addLog('成功获取飞书访问令牌', 'success');
            } else {
              addLog('获取飞书访问令牌失败: 返回为空', 'error');
              return;
            }
          } catch (tokenError) {
            addLog(`获取飞书访问令牌失败: ${tokenError.message}`, 'error');
            addLog('请检查App ID和App Secret配置是否正确', 'info');
            return;
          }
          
          // 更新飞书记录的发布状态
          addLog('开始更新飞书记录发布状态...', 'step');
          
          const updateResult = await window.feishuClient.updateRecordPublishStatus(feishuNote.recordId);
          
          if (updateResult.success) {
            addLog(`测试成功：已更新飞书记录"${feishuNote.title}"状态为"已发布"`, 'success');
            
            // 展示响应详情
            if (updateResult.result) {
              addLog('更新响应详情', 'info', JSON.stringify(updateResult.result, null, 2));
            }
          } else {
            addLog(`测试失败：更新飞书状态失败 - ${updateResult.error}`, 'error');
            
            // 检查可能的原因
            if (updateResult.error.includes('权限') || updateResult.error.includes('未授权')) {
              addLog('可能原因：飞书授权权限不足，请确保应用有写入权限', 'warning');
            } else if (updateResult.error.includes('记录') && updateResult.error.includes('不存在')) {
              addLog('可能原因：飞书中的记录已被删除或移动', 'warning');
            } else if (updateResult.error.includes('字段') || updateResult.error.includes('field')) {
              addLog('可能原因："是否发布"字段不存在或字段名不匹配', 'warning');
              addLog('请确认飞书多维表格中是否存在名为"是否发布"的字段', 'info');
            }
          }
        } catch (error) {
          console.error('测试更新飞书状态时出错:', error);
          addLog(`测试异常: ${error.message}`, 'error');
          addLog('错误堆栈', 'error', error.stack);
        }
      });
      
      notesContainer.appendChild(testBtn);
      
      // 添加检查配置按钮
      const checkConfigBtn = document.createElement('button');
      checkConfigBtn.innerText = '检查飞书配置';
      checkConfigBtn.className = 'button secondary';
      checkConfigBtn.style.marginBottom = '10px';
      checkConfigBtn.style.marginLeft = '10px';
      checkConfigBtn.addEventListener('click', () => {
        const configStatus = checkFeishuClientConfig();
        
        if (configStatus.success) {
          addLog('飞书配置检查成功', 'success');
          addLog('飞书配置详情', 'info', JSON.stringify(configStatus.config, null, 2));
        } else {
          addLog(`飞书配置检查失败: ${configStatus.error}`, 'error');
        }
      });
      
      notesContainer.appendChild(checkConfigBtn);
    }
  }

  // 为每篇笔记创建面板
  notes.forEach((note, index) => {
    // 克隆模板
    const panelContent = template.content.cloneNode(true);
    const panel = panelContent.querySelector('.note-panel');
    panel.id = `note${index + 1}`;
    
    // 设置标题
    const titleElement = panel.querySelector('.note-title');
    titleElement.textContent = note.title || `第${index + 1}篇笔记`;
    
    // 设置正文内容
    const bodyElement = panel.querySelector('.body');
    bodyElement.textContent = note.body || '';
    
    // 设置标签
    const tagsContainer = panel.querySelector('.tags-container');
    tagsContainer.innerHTML = ''; // 清空默认标签
    
    if (note.tags && note.tags.length > 0) {
      note.tags.forEach(tag => {
        const tagSpan = document.createElement('span');
        tagSpan.className = 'tag';
        tagSpan.textContent = tag;
        tagsContainer.appendChild(tagSpan);
      });
    } else {
      const emptyTag = document.createElement('span');
      emptyTag.className = 'tag';
      emptyTag.style.opacity = '0.5';
      emptyTag.textContent = '暂无标签';
      tagsContainer.appendChild(emptyTag);
    }
    
    // 设置商品链接
    const productLink = panel.querySelector('.product-link');
    if (note.productId) {
      productLink.textContent = `商品ID: ${note.productId}`;
    } else {
      productLink.textContent = '未设置商品链接';
      productLink.style.opacity = '0.5';
    }

    // 添加商品规格显示
    if (note.productSpec) {
      const productSpecSpan = document.createElement('span');
      productSpecSpan.className = 'product-spec';
      productSpecSpan.textContent = `商品规格: ${note.productSpec}`;
      productSpecSpan.style.fontSize = '12px';
      productSpecSpan.style.display = 'block';
      productSpecSpan.style.marginTop = '5px';
      productLink.parentNode.appendChild(productSpecSpan);
    }

    // 如果是从飞书导入的笔记，显示记录ID
    if (note.from === 'feishu' && note.recordId) {
      const recordIdSpan = document.createElement('span');
      recordIdSpan.className = 'record-id';
      recordIdSpan.textContent = `飞书记录ID: ${note.recordId}`;
      recordIdSpan.style.fontSize = '12px';
      recordIdSpan.style.color = '#999';
      recordIdSpan.style.display = 'block';
      recordIdSpan.style.marginTop = '5px';
      panel.querySelector('.note-header').appendChild(recordIdSpan);
    }

    // 绑定事件 - 内容编辑
    bodyElement.addEventListener('click', () => {
      // 创建一个弹出式编辑框
      const editor = document.createElement('textarea');
      editor.value = note.body || '';
      editor.style.width = '100%';
      editor.style.minHeight = '200px';
      editor.style.padding = '15px';
      editor.style.borderRadius = 'var(--radius-sm)';
      editor.style.border = '1px solid var(--border-color)';
      editor.style.margin = '10px 0';
      editor.style.fontSize = '14px';
      editor.style.fontFamily = 'inherit';
      editor.style.lineHeight = '1.7';
      editor.style.outline = 'none';
      
      const saveBtn = document.createElement('button');
      saveBtn.textContent = '保存修改';
      saveBtn.style.marginTop = '10px';
      
      const container = bodyElement.parentElement;
      container.innerHTML = '';
      container.appendChild(editor);
      container.appendChild(saveBtn);
      
      editor.focus();
      
      saveBtn.addEventListener('click', () => {
        notes[index].body = editor.value.trim();
        bodyElement.textContent = notes[index].body;
        container.innerHTML = '';
        container.appendChild(bodyElement);
        addLog(`已更新第${index + 1}篇笔记的正文`, 'success');
        saveState();
      });
    });

    // 标题点击编辑
    titleElement.addEventListener('click', (e) => {
      if(e.target.classList.contains('delete-note')) return;
      
      const currentTitle = note.title || `第${index + 1}篇笔记`;
      const editor = document.createElement('input');
      editor.type = 'text';
      editor.value = currentTitle;
      editor.style.width = '70%';
      editor.style.padding = '8px 12px';
      editor.style.border = '1px solid var(--border-color)';
      editor.style.borderRadius = 'var(--radius-xs)';
      editor.style.fontSize = '16px';
      editor.style.fontWeight = 'bold';
      
      titleElement.replaceWith(editor);
      editor.focus();
      editor.select();
      
      // 保存修改
      const saveTitle = () => {
        notes[index].title = editor.value.trim() || `第${index + 1}篇笔记`;
        titleElement.textContent = notes[index].title;
        editor.replaceWith(titleElement);
        addLog(`已更新第${index + 1}篇笔记的标题`, 'success');
        saveState();
      };
      
      editor.addEventListener('blur', saveTitle);
      editor.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          saveTitle();
        }
      });
    });

    // 标签点击编辑
    tagsContainer.addEventListener('click', () => {
      const currentTags = note.tags ? note.tags.join(' ') : '';
      const editor = document.createElement('input');
      editor.type = 'text';
      editor.value = currentTags;
      editor.placeholder = '输入标签，用空格分隔，如: #旅行 #美食';
      editor.style.width = '100%';
      editor.style.padding = '10px';
      editor.style.border = '1px solid var(--border-color)';
      editor.style.borderRadius = 'var(--radius-xs)';
      editor.style.fontSize = '14px';
      
      tagsContainer.replaceWith(editor);
      editor.focus();
      
      // 保存修改
      const saveTags = () => {
        const tagsText = editor.value.trim();
        notes[index].tags = tagsText ? tagsText.split(/\s+/).map(tag => 
          tag.startsWith('#') ? tag : `#${tag}`
        ) : [];
        
        // 重新创建标签容器
        const newTagsContainer = document.createElement('div');
        newTagsContainer.className = 'tags-container';
        
        if (notes[index].tags.length > 0) {
          notes[index].tags.forEach(tag => {
            const tagSpan = document.createElement('span');
            tagSpan.className = 'tag';
            tagSpan.textContent = tag;
            newTagsContainer.appendChild(tagSpan);
          });
        } else {
          const emptyTag = document.createElement('span');
          emptyTag.className = 'tag';
          emptyTag.style.opacity = '0.5';
          emptyTag.textContent = '暂无标签';
          newTagsContainer.appendChild(emptyTag);
        }
        
        editor.replaceWith(newTagsContainer);
        tagsContainer = newTagsContainer;
        
        // 重新绑定点击事件
        tagsContainer.addEventListener('click', () => {
          // 这里会调用同样的函数，创建编辑框
          // 由于闭包，tagsContainer已经更新为最新的元素
          tagsContainer.click();
        });
        
        addLog(`已更新第${index + 1}篇笔记的标签`, 'success');
        saveState();
      };
      
      editor.addEventListener('blur', saveTags);
      editor.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          saveTags();
        }
      });
    });

    // 商品链接点击编辑
    productLink.addEventListener('click', () => {
      const currentProductId = note.productId || '';
      const editor = document.createElement('input');
      editor.type = 'text';
      editor.value = currentProductId;
      editor.placeholder = '请输入商品ID';
      editor.style.width = '100%';
      editor.style.padding = '8px';
      editor.style.border = '1px solid var(--border-color)';
      editor.style.borderRadius = 'var(--radius-xs)';
      editor.style.fontSize = '14px';
      
      productLink.replaceWith(editor);
      editor.focus();
      
      // 保存修改
      const saveProductId = () => {
        notes[index].productId = editor.value.trim();
        
        // 重新创建商品链接
        const newProductLink = document.createElement('div');
        newProductLink.className = 'product-link';
        
        // 添加SVG图标
        newProductLink.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 11 12 14 22 4"></polyline>
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
          </svg>
        `;
        
        if (notes[index].productId) {
          newProductLink.appendChild(document.createTextNode(`商品ID: ${notes[index].productId}`));
        } else {
          newProductLink.appendChild(document.createTextNode('未设置商品链接'));
          newProductLink.style.opacity = '0.5';
        }
        
        editor.replaceWith(newProductLink);
        productLink = newProductLink;
        
        // 重新绑定点击事件
        productLink.addEventListener('click', () => {
          // 这里会调用同样的函数，创建编辑框
          productLink.click();
        });
        
        addLog(`已更新第${index + 1}篇笔记的商品ID`, 'success');
        saveState();
      };
      
      editor.addEventListener('blur', saveProductId);
      editor.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          saveProductId();
        }
      });
    });

    // 绑定删除笔记按钮事件
    const deleteNoteBtn = panel.querySelector('.delete-note');
    deleteNoteBtn.onclick = () => {
      if (confirm(`确定要删除第${index + 1}篇笔记吗？`)) {
        notes.splice(index, 1);
        updateNotePanels();
        addLog(`已删除第${index + 1}篇笔记`, 'info');
        saveState();
      }
    };

    // 添加到容器
    notesContainer.appendChild(panel);

    // 绑定图片处理事件
    const imageInput = document.createElement('input');
    imageInput.type = 'file';
    imageInput.accept = 'image/*';
    imageInput.multiple = true;
    imageInput.style.display = 'none';
    panel.appendChild(imageInput);

    const selectImageBtn = panel.querySelector('.select-images');
    const clearImagesBtn = panel.querySelector('.clear-images');
    const imagePreview = panel.querySelector('.preview-images');

    // 恢复图片预览
    if (note.images && note.images.length > 0) {
      restoreImagePreviews(panel, index);
    }

    // 选择图片按钮点击事件
    selectImageBtn.onclick = () => imageInput.click();

    // 图片选择处理
    imageInput.onchange = async function() {
      if (this.files.length === 0) return;
      await handleImageUpload(this.files, index, panel);
    };

    // 清除图片按钮点击事件
    clearImagesBtn.onclick = () => {
      notes[index].images = [];
      notes[index].imageUrls = {};
      imagePreview.innerHTML = '';
      imageInput.value = '';
      addLog('已清除所有图片');
      saveState();
    };

    // 绑定事件 - 商品ID
    const productIdInput = panel.querySelector('.product-id-input');
    if (productIdInput) {
      productIdInput.value = note.productId || '';
      productIdInput.addEventListener('change', (e) => {
        handleNoteChange(index, 'productId', e.target.value);
      });
    }

    // 添加商品规格输入框
    const productIdContainer = panel.querySelector('.product-id-container');
    if (productIdContainer) {
      // 创建商品规格容器
      const productSpecContainer = document.createElement('div');
      productSpecContainer.className = 'product-spec-container';
      productSpecContainer.style.marginTop = '10px';
      
      // 创建商品规格标签
      const productSpecLabel = document.createElement('label');
      productSpecLabel.textContent = '商品规格:';
      productSpecLabel.style.display = 'block';
      productSpecLabel.style.marginBottom = '5px';
      productSpecContainer.appendChild(productSpecLabel);
      
      // 创建商品规格输入框
      const productSpecInput = document.createElement('input');
      productSpecInput.type = 'text';
      productSpecInput.className = 'product-spec-input';
      productSpecInput.value = note.productSpec || '';
      productSpecInput.style.width = '100%';
      productSpecInput.style.padding = '5px';
      productSpecInput.style.boxSizing = 'border-box';
      productSpecInput.addEventListener('change', (e) => {
        handleNoteChange(index, 'productSpec', e.target.value);
      });
      productSpecContainer.appendChild(productSpecInput);
      
      // 将商品规格容器添加到商品ID容器后面
      productIdContainer.parentNode.insertBefore(productSpecContainer, productIdContainer.nextSibling);
    }
  });

  addLog(`已更新 ${notes.length} 个笔记面板`);
}

// 修改倒计时更新函数
function startCountdownUpdates() {
  let intervalId = null;
  
  const updateCountdown = () => {
    if (!isPublishing || countdownTimers.length === 0) {
      if (intervalId) {
        clearInterval(intervalId);
      }
      return;
    }

    let countdownDetails = '';
    let hasActiveCountdown = false;

    for (let i = 1; i < notes.length; i++) {
      const remainingTime = countdownTimers[i];
      if (remainingTime > 0) {
        hasActiveCountdown = true;
        const minutes = Math.floor(remainingTime / 60);
        const seconds = remainingTime % 60;
        countdownDetails += `第${i + 1}篇笔记发布倒计时: ${minutes}分${seconds}秒\n`;
      }
    }

    if (countdownDetails) {
      addLog('发布倒计时', 'step', countdownDetails);
    }

    // 更新剩余时间
    countdownTimers = countdownTimers.map(t => Math.max(0, t - 10));

    // 如果没有活跃的倒计时，清除定时器
    if (!hasActiveCountdown) {
      clearInterval(intervalId);
    }
  };

  // 每10秒更新一次倒计时
  intervalId = setInterval(updateCountdown, 10000);

  // 立即显示第一次倒计时
  updateCountdown();

  return intervalId;
}

// 修改图片保存函数
async function saveNoteImages(noteIndex) {
  try {
    await chrome.storage.local.set({
      [`note_${noteIndex}_images`]: {
        images: notes[noteIndex].images,
        imageUrls: notes[noteIndex].imageUrls
      }
    });
  } catch (error) {
    console.error('保存图片数据失败:', error);
  }
}

// 修改图片恢复函数
async function restoreImagePreviews(panel, index) {
  try {
    if (!notes[index] || !notes[index].imageUrls) return;
    
    const imagePreview = panel.querySelector('.preview-images');
    if (!imagePreview) return;
    
    // 清空预览区域
    imagePreview.innerHTML = '';
    
    // 为每个图片创建预览
    Object.entries(notes[index].imageUrls).forEach(([imageIndex, dataUrl]) => {
      if (!dataUrl) return;
      
      const imageData = {
        index: parseInt(imageIndex),
        dataUrl
      };
      
      const wrapper = createImagePreview(imageData, parseInt(imageIndex), panel, index);
      imagePreview.appendChild(wrapper);
    });
    
    addLog(`已恢复第${index + 1}篇笔记的图片预览`, 'info');
  } catch (error) {
    addLog(`恢复图片预览失败: ${error.message}`, 'error');
  }
}

// 查找并修改 handleNoteChange 函数
function handleNoteChange(index, field, value) {
  // 检查index有效性
  if (index < 0 || index >= notes.length) return;
  
  // 修改对应字段
  if (field === 'title') {
    notes[index].title = value;
  } else if (field === 'body') {
    notes[index].body = value;
  } else if (field === 'tags') {
    // 处理标签
    let tags = value.split(/[,\s]+/).map(tag => {
      tag = tag.trim();
      return tag.startsWith('#') ? tag : `#${tag}`;
    }).filter(tag => tag.length > 1); // 过滤掉只有#的标签
    notes[index].tags = tags;
  } else if (field === 'productId') {
    notes[index].productId = value;
  } else if (field === 'productSpec') {
    notes[index].productSpec = value;
  }
  
  // 保存修改
  saveState();
}

// 修改图片处理相关函数，添加状态保存
async function handleImageUpload(files, index, panel) {
  if (!files || files.length === 0) return;
  
  const imagePreview = panel.querySelector('.image-preview');
  if (!imagePreview) return;
  
  // 清空当前笔记的图片
  notes[index].images = [];
  notes[index].imageUrls = {};
  imagePreview.innerHTML = '';
  
  addLog(`选择了 ${files.length} 张图片`);
  
  try {
    // 加载所有图片
    const loadedImages = await Promise.all(Array.from(files).map((file, i) => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve({
          index: i,
          file,
          dataUrl: e.target.result
        });
        reader.readAsDataURL(file);
      });
    }));
    
    // 处理加载的图片
    loadedImages.forEach((imageData, i) => {
      notes[index].images[i] = imageData.file;
      notes[index].imageUrls[i] = imageData.dataUrl;
      
      const wrapper = createImagePreview(imageData, i, panel, index);
      imagePreview.appendChild(wrapper);
      addLog(`已加载第 ${i + 1} 张图片`);
    });
    
    addLog(`共加载 ${loadedImages.length} 张图片`, 'success');
  } catch (error) {
    console.error('加载图片失败:', error);
    addLog(`加载图片失败: ${error.message}`, 'error');
  }
  
  // 在图片处理完成后保存状态
  await saveState();
}

// 修改删除笔记的处理，添加状态保存
function handleNoteDelete(index) {
  if (confirm(`确定要删除第${index + 1}篇笔记吗？`)) {
    notes.splice(index, 1);
    updateNotePanels();
    addLog(`已删除第${index + 1}篇笔记`, 'info');
    saveState();
  }
}

// 修改状态更新函数
function startStatusUpdates() {
  if (window.statusUpdateTimer) {
    clearInterval(window.statusUpdateTimer);
  }

  window.statusUpdateTimer = setInterval(async () => {
    try {
      const state = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'GET_STATE' }, (response) => {
          resolve(response || { isPublishing: false });
        });
      });
      
      if (state.isPublishing) {
        const currentNote = state.notes[state.currentIndex];
        const totalNotes = state.notes.length;
        
        // 显示当前进度和操作
        addLog(`正在发布第 ${state.currentIndex + 1}/${totalNotes} 篇笔记`, 'info');
        if (state.currentAction) {
          addLog(`当前操作: ${state.currentAction}`, 'step');
        }
        
        // 如果有等待时间，显示倒计时
        if (state.waitTime > 0) {
          const minutes = Math.floor(state.waitTime / 60);
          const seconds = state.waitTime % 60;
          addLog(`等待发布下一篇笔记`, 'info', 
            `剩余时间: ${minutes}分${seconds}秒`);
        }
      } else {
        // 如果发布已结束，清除定时器
        clearInterval(window.statusUpdateTimer);
        window.statusUpdateTimer = null;
        isPublishing = false;
      }
    } catch (error) {
      console.error('获取状态失败:', error);
    }
  }, 5000);
}

// 在页面关闭时清理定时器
window.addEventListener('unload', () => {
  if (window.statusUpdateTimer) {
    clearInterval(window.statusUpdateTimer);
  }
});

// 在页面加载时恢复日志
async function restoreLogs() {
  try {
    const data = await chrome.storage.local.get('logs');
    if (data.logs) {
      const logPanel = document.getElementById('logPanel');
      logPanel.innerHTML = ''; // 清空现有日志
      
      data.logs.forEach(logData => {
        const logItem = document.createElement('div');
        logItem.className = `log-item ${logData.type}`;
        
        const timeSpan = document.createElement('span');
        timeSpan.className = 'log-time';
        timeSpan.textContent = `[${logData.time}] `;
        
        const messageSpan = document.createElement('span');
        messageSpan.className = 'log-message';
        messageSpan.textContent = logData.message;
        
        logItem.appendChild(timeSpan);
        logItem.appendChild(messageSpan);
        
        if (logData.details) {
          const detailsDiv = document.createElement('div');
          detailsDiv.className = 'log-details';
          detailsDiv.textContent = logData.details;
          logItem.appendChild(detailsDiv);
        }
        
        logPanel.appendChild(logItem);
      });
      
      logPanel.scrollTop = logPanel.scrollHeight;
    }
  } catch (error) {
    console.error('恢复日志失败:', error);
  }
}

// 添加状态显示更新函数
function updateStatusDisplay(state) {
  const logPanel = document.getElementById('logPanel');
  if (!logPanel) return;

  // 更新状态文本
  let statusText = '';
  let statusClass = 'log-item step';
  
  if (state.isPublishing) {
    if (state.countdown) {
      // 显示倒计时，使用橙色突出显示
      statusText = `正在发布第 ${state.currentIndex + 1}/${state.totalNotes} 篇笔记
倒计时: ${state.countdown.current}/${state.countdown.total} 秒
预计${new Date(Date.now() + state.countdown.current * 1000).toLocaleTimeString()}发布下一篇`;
      statusClass = 'log-item countdown';
    } else {
      // 显示当前进度
      statusText = `正在发布第 ${state.currentIndex + 1}/${state.totalNotes} 篇笔记
${state.currentAction}`;
    }
  } else {
    statusText = '准备就绪';
  }

  // 更新或创建状态显示
  let statusDiv = logPanel.querySelector('.log-item.countdown, .log-item.step');
  if (!statusDiv) {
    statusDiv = document.createElement('div');
    logPanel.appendChild(statusDiv);
  }

  // 更新状态内容
  statusDiv.className = statusClass;
  statusDiv.textContent = statusText;
  
  // 确保状态显示在最后
  logPanel.appendChild(statusDiv);
  logPanel.scrollTop = logPanel.scrollHeight;
}

/**
 * 检查飞书客户端配置是否完整
 * @returns {Object} 配置检查结果
 */
function checkFeishuClientConfig() {
  try {
    // 检查feishuClient是否存在
    if (!window.feishuClient) {
      return {
        success: false,
        error: '飞书客户端未初始化'
      };
    }
    
    // 获取飞书客户端配置
    const config = window.feishuClient.config;
    
    if (!config) {
      return {
        success: false,
        error: '飞书客户端未配置'
      };
    }
    
    // 检查必要的配置项
    const requiredFields = ['appId', 'appSecret', 'appToken', 'tableId'];
    const missingFields = [];
    
    for (const field of requiredFields) {
      if (!config[field]) {
        missingFields.push(field);
      }
    }
    
    if (missingFields.length > 0) {
      return {
        success: false,
        error: `缺少必要的配置项: ${missingFields.join(', ')}`,
        missingFields
      };
    }
    
    // 配置完整
    return {
      success: true,
      appId: config.appId,
      appToken: config.appToken,
      tableId: config.tableId,
      viewId: config.viewId || '默认视图',
      config: {
        appId: maskString(config.appId),
        appSecret: maskString(config.appSecret),
        appToken: maskString(config.appToken),
        tableId: maskString(config.tableId),
        viewId: config.viewId || '默认视图',
        fieldMapping: config.fieldMapping
      }
    };
  } catch (error) {
    console.error('检查飞书配置出错:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 隐藏部分字符串以保护隐私
 * @param {string} str 原始字符串
 * @returns {string} 隐藏部分字符的字符串
 */
function maskString(str) {
  if (!str) return '';
  if (str.length <= 8) return '****';
  return str.substring(0, 4) + '****' + str.substring(str.length - 4);
}

// 添加对飞书字段更新的日志记录
function setupFeishuUpdateListener() {
  // 创建一个原始方法的引用
  if (window.feishuClient && !window.feishuClient._originalUpdateRecordStatus) {
    window.feishuClient._originalUpdateRecordStatus = window.feishuClient.updateRecordStatus;
    
    // 替换为包含日志的版本
    window.feishuClient.updateRecordStatus = async function(recordId, fields) {
      console.log('[增强日志] 开始更新飞书记录:', recordId, '字段:', fields);
      addLog(`准备更新飞书记录: ${recordId}`, 'info');
      addLog(`更新字段: ${Object.keys(fields).join(', ')}`, 'info');
      
      try {
        const result = await this._originalUpdateRecordStatus(recordId, fields);
        console.log('[增强日志] 更新飞书记录成功:', result);
        addLog(`更新飞书记录成功: ${recordId}`, 'success');
        return result;
      } catch (error) {
        console.error('[增强日志] 更新飞书记录失败:', error);
        addLog(`更新飞书记录失败: ${error.message}`, 'error');
        
        // 检查是否有stack信息
        if (error.stack) {
          console.error('[增强日志] 错误堆栈:', error.stack);
        }
        
        // 检查具体的错误情况
        if (error.message.includes('权限')) {
          addLog('飞书应用权限不足，请确保应用有写入多维表格的权限', 'warning');
        } else if (error.message.includes('token')) {
          addLog('访问令牌无效，请检查飞书应用配置', 'warning');
        } else if (error.message.includes('字段') || error.message.includes('field')) {
          addLog('字段不存在或类型不匹配，请检查飞书表格中是否有对应字段', 'warning');
        }
        
        throw error;
      }
    };
  }
  
  // 同样增强updateRecordPublishStatus方法
  if (window.feishuClient && !window.feishuClient._originalUpdateRecordPublishStatus) {
    window.feishuClient._originalUpdateRecordPublishStatus = window.feishuClient.updateRecordPublishStatus;
    
    window.feishuClient.updateRecordPublishStatus = async function(recordId) {
      console.log('[增强日志] 开始更新飞书记录发布状态:', recordId);
      
      try {
        // 添加详细日志 - 检查配置
        const { appToken, tableId } = this.config;
        if (!appToken || !tableId) {
          const missingConfig = [];
          if (!appToken) missingConfig.push('appToken');
          if (!tableId) missingConfig.push('tableId');
          console.error(`[增强日志] 缺少必要的配置: ${missingConfig.join(', ')}`);
        } else {
          console.log(`[增强日志] 飞书配置: appToken=${appToken}, tableId=${tableId}`);
        }
        
        // 调用原始方法
        const result = await this._originalUpdateRecordPublishStatus(recordId);
        console.log('[增强日志] 更新飞书记录发布状态结果:', result);
        
        return result;
      } catch (error) {
        console.error('[增强日志] 更新飞书记录发布状态失败:', error);
        console.error('[增强日志] 错误堆栈:', error.stack);
        throw error;
      }
    };
  }
}

function setupMessageListener() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'STATUS_UPDATE') {
      // 更新日志（如果不是倒计时消息）
      if (!message.data.state.countdown) {
        addLog(message.data.message);
      }
      
      // 更新状态显示
      updateStatusDisplay(message.data.state);
      
      // 更新按钮状态
      updateButtonStatus(message.data.state.isPublishing);
    } else if (message.type === 'COMPLETED' || message.type === 'STOPPED') {
      // 发布完成或被停止
      isPublishing = false;
      
      // 更新按钮状态
      updateButtonStatus(false);
    } else if (message.type === 'NOTE_PUBLISHED') {
      addLog(`第${message.data.index + 1}篇笔记发布完成`, 'success');
    } else if (message.type === 'WAITING') {
      const minutes = Math.floor(message.data.waitTime / 60);
      const seconds = message.data.waitTime % 60;
      addLog(`等待发布第${message.data.nextIndex + 1}篇笔记...`, 'info',
        `等待时间: ${minutes}分${seconds}秒`);
    } else if (message.type === 'ERROR') {
      addLog(`发布出错: ${message.data}`, 'error');
      isPublishing = false;
      updateButtonStatus(false);
    }
  });
}

// 初始化飞书模态框
function initFeishuModal() {
  // 添加模态框到DOM
  const modalContainer = document.createElement('div');
  modalContainer.innerHTML = feishuModalHtml + feishuModalCss;
  document.body.appendChild(modalContainer);
  
  // 获取模态框元素
  const modal = document.getElementById('feishuModal');
  const closeBtn = modal.querySelector('.close-modal');
  const saveConfigBtn = document.getElementById('saveFeishuConfig');
  const testConnectionBtn = document.getElementById('testFeishuConnection');
  const statusDiv = document.getElementById('feishuStatus');
  
  // 绑定关闭按钮事件
  closeBtn.onclick = function() {
    modal.style.display = 'none';
  };
  
  // 点击模态框外部关闭
  window.onclick = function(event) {
    if (event.target === modal) {
      modal.style.display = 'none';
    }
  };
  
  // 绑定保存配置按钮事件
  saveConfigBtn.onclick = async function() {
    // 获取表单数据
    feishuConfig.appId = document.getElementById('appId').value.trim();
    feishuConfig.appSecret = document.getElementById('appSecret').value.trim();
    feishuConfig.appToken = document.getElementById('appToken').value.trim();
    feishuConfig.tableId = document.getElementById('tableId').value.trim();
    feishuConfig.viewId = document.getElementById('viewId').value.trim();
    
    // 验证必填字段
    if (!feishuConfig.appId || !feishuConfig.appSecret || !feishuConfig.appToken || !feishuConfig.tableId) {
      statusDiv.className = 'status-message error';
      statusDiv.textContent = '错误：除视图ID外，所有字段都必须填写';
      return;
    }
    
    try {
      // 保存配置
      await saveFeishuConfig();
      
      // 显示成功消息
      statusDiv.className = 'status-message success';
      statusDiv.textContent = '配置已保存成功';
      
      // 3秒后隐藏消息
      setTimeout(() => {
        statusDiv.style.display = 'none';
      }, 3000);
    } catch (error) {
      // 显示错误信息
      statusDiv.className = 'status-message error';
      statusDiv.textContent = `错误：${error.message}`;
    }
  };
  
  // 绑定测试连接按钮事件
  testConnectionBtn.onclick = async function() {
    // 显示加载状态
    statusDiv.className = 'status-message loading';
    statusDiv.innerHTML = '<div class="loading-spinner"></div> 正在测试连接，请稍候...';
    statusDiv.style.display = 'flex';
    
    // 获取表单数据
    feishuConfig.appId = document.getElementById('appId').value.trim();
    feishuConfig.appSecret = document.getElementById('appSecret').value.trim();
    feishuConfig.appToken = document.getElementById('appToken').value.trim();
    feishuConfig.tableId = document.getElementById('tableId').value.trim();
    feishuConfig.viewId = document.getElementById('viewId').value.trim();
    
    // 验证必填字段
    if (!feishuConfig.appId || !feishuConfig.appSecret || !feishuConfig.appToken || !feishuConfig.tableId) {
      statusDiv.className = 'status-message error';
      statusDiv.textContent = '错误：除视图ID外，所有字段都必须填写';
      return;
    }
    
    try {
      // 设置全局测试模式标志，避免下载图片
      window.feishuTestMode = true;
      
      // 检查feishuClient是否存在
      if (!window.feishuClient) {
        throw new Error('飞书客户端未初始化，请刷新页面后重试');
      }
      
      // 初始化飞书客户端
      const feishuClient = window.feishuClient;
      feishuClient.init({
        appId: feishuConfig.appId,
        appSecret: feishuConfig.appSecret,
        appToken: feishuConfig.appToken,
        tableId: feishuConfig.tableId,
        viewId: feishuConfig.viewId || undefined
      });
      
      // 尝试获取token
      await feishuClient.getTenantAccessToken();
      
      // 尝试获取记录数量
      const options = { 
        limit: 1, 
        testMode: true // 添加testMode参数，避免下载文件
      };
      if (feishuConfig.viewId) {
        options.viewId = feishuConfig.viewId;
      }
      
      // 使用测试模式获取记录
      const records = await feishuClient.fetchNotes(options);
      
      // 显示成功消息
      statusDiv.className = 'status-message success';
      statusDiv.textContent = `连接成功！检测到记录总数：${records.total || 0}`;
    } catch (error) {
      // 显示错误信息
      statusDiv.className = 'status-message error';
      statusDiv.textContent = `连接失败：${error.message}`;
    } finally {
      // 清除测试模式标志
      window.feishuTestMode = false;
    }
  };
  
  // 绑定配置按钮事件
  const configBtn = document.querySelector('.feishu-config-btn');
  if (configBtn) {
    configBtn.addEventListener('click', async () => {
      // 恢复飞书配置
      await restoreFeishuConfig();
      // 显示模态框
      modal.style.display = 'block';
    });
  }
}

// 从飞书导入数据
async function importFromFeishu() {
  try {
    addLog('开始从飞书导入数据...', 'info');
    
    // 检查feishuClient是否存在
    if (!window.feishuClient) {
      throw new Error('飞书客户端未初始化，请刷新页面后重试');
    }
    
    // 初始化飞书客户端
    const feishuClient = window.feishuClient;
    feishuClient.init({
      appId: feishuConfig.appId,
      appSecret: feishuConfig.appSecret,
      appToken: feishuConfig.appToken,
      tableId: feishuConfig.tableId,
      viewId: feishuConfig.viewId || undefined  // 如果有视图ID则使用，否则为undefined
    });
    
    // 获取所有记录并转换为笔记
    addLog('正在获取飞书多维表格数据...', 'step');
    const fetchedNotes = await feishuClient.fetchNotes();
    
    if (!fetchedNotes || fetchedNotes.length === 0) {
      throw new Error('未找到任何笔记数据');
    }
    
    addLog(`成功获取 ${fetchedNotes.length} 篇笔记`, 'success');
    
    // 预加载图片
    addLog('正在预加载图片...', 'step');
    const notesWithImages = await feishuClient.preloadImages(fetchedNotes);
    
    // 转换为插件使用的格式
    notes = await Promise.all(notesWithImages.map(async (note) => {
      // 处理标签，确保每个标签都带有#号
      let tags = [];
      
      // 检查tags的类型并相应处理
      if (note.tags) {
        if (Array.isArray(note.tags)) {
          // 如果已经是数组，确保每个标签有#前缀
          tags = note.tags.map(tag => tag.startsWith('#') ? tag : `#${tag}`);
        } else if (typeof note.tags === 'string') {
          // 如果是字符串，按空格分割，确保每个都有#
          tags = note.tags.split(/[\s,，]+/)
            .map(tag => tag.trim())
            .filter(Boolean)
            .map(tag => tag.startsWith('#') ? tag : `#${tag}`);
        }
      }
      
      // 收集图片 - 重要修改：确保正确存储为base64格式
      const images = [];
      const imageUrls = {};
      
      if (note.images && Array.isArray(note.images) && note.images.length > 0) {
        // 处理预加载后的图片格式
        for (let index = 0; index < note.images.length; index++) {
          const img = note.images[index];
          if (img) {
            // 保存原始对象到images数组
            images[index] = img.blob || img.data;
            
            // 重要：确保imageUrls中存储的是base64字符串
            if (img.data || img.blob) {
              const blob = img.data || img.blob;
              // 将Blob转换为base64
              const base64 = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(blob);
              });
              imageUrls[index] = base64;
              addLog(`已处理第 ${index + 1} 张图片为base64格式`, 'info');
            } else if (img.blobUrl) {
              // 尝试从blobUrl获取内容并转换
              try {
                const response = await fetch(img.blobUrl);
                const blob = await response.blob();
                const base64 = await new Promise((resolve) => {
                  const reader = new FileReader();
                  reader.onloadend = () => resolve(reader.result);
                  reader.readAsDataURL(blob);
                });
                imageUrls[index] = base64;
                addLog(`已从blobUrl处理第 ${index + 1} 张图片`, 'info');
              } catch (e) {
                addLog(`处理图片URL失败: ${e.message}`, 'error');
                // 如果失败，尝试使用其他可用的URL
                imageUrls[index] = img.blobUrl || img.url || '';
              }
            } else {
              // 使用其他可用的URL
              imageUrls[index] = img.url || '';
            }
          }
        }
      }
      
      // 处理商品ID
      let productIdValue = '';
      if (note.productId) {
        if (typeof note.productId === 'object' && note.productId.id) {
          // 商品ID是对象格式 {id: "xxx", type: "goods"}
          productIdValue = note.productId.id;
        } else {
          // 商品ID是字符串格式
          productIdValue = note.productId;
        }
      }
      
      // 重要：保存recordId用于后续更新发布状态
      return {
        title: note.title || '无标题笔记',
        body: note.body || note.content || '', // 使用body字段，如果没有则使用content字段
        tags: tags, // 确保tags是数组
        productId: productIdValue, // 使用处理后的商品ID
        productSpec: note.productSpec || '', // 添加商品规格字段
        images: images,
        imageUrls: imageUrls,
        recordId: note.recordId || null, // 保存记录ID，用于发布后更新状态
        from: 'feishu' // 标记来源为飞书
      };
    }));
    
    // 保存状态
    await saveState();
    
    // 更新UI
    updateNotePanels();
    
    addLog(`成功导入 ${notes.length} 篇笔记，包含 ${notesWithImages.reduce((count, note) => count + (note.images ? note.images.length : 0), 0)} 张图片`, 'success');
  } catch (error) {
    console.error('从飞书导入数据失败:', error);
    addLog(`从飞书导入数据失败: ${error.message}`, 'error');
    throw error;
  }
} 

async function uploadToXiaohongshu() {
  try {
    // 禁用按钮
    document.getElementById('uploadBtn').disabled = true;
    document.getElementById('uploadBtn').innerText = '发布中...';
    
    // 清空日志
    clearLogs();
    
    // 获取选中的笔记
    const selectedNotes = notes.filter(note => note.selected && !note.published);
    
    if (selectedNotes.length === 0) {
      addLog('没有选中待发布的笔记', 'warning');
      document.getElementById('uploadBtn').disabled = false;
      document.getElementById('uploadBtn').innerText = '一键发布';
      return;
    }
    
    addLog(`开始发布 ${selectedNotes.length} 篇笔记`, 'step');
    
    // 检查是否有从飞书导入的笔记
    const feishuNotes = selectedNotes.filter(note => note.from === 'feishu' && note.recordId);
    if (feishuNotes.length > 0) {
      addLog(`检测到 ${feishuNotes.length} 篇来自飞书的笔记`, 'info');
      
      // 确保飞书客户端已初始化
      if (!window.feishuClient) {
        addLog('飞书客户端未初始化，尝试初始化...', 'warning');
        
        if (typeof feishuClient !== 'undefined') {
          window.feishuClient = feishuClient;
          addLog('已将feishuClient设置为全局变量', 'info');
        } else {
          addLog('警告: 无法找到feishuClient对象，发布后可能无法更新飞书状态', 'warning');
        }
      }
      
      // 检查飞书客户端配置
      if (window.feishuClient) {
        const configStatus = checkFeishuClientConfig();
        if (!configStatus.success) {
          addLog(`飞书客户端配置不完整: ${configStatus.error}`, 'warning');
          addLog('发布后可能无法更新飞书状态', 'warning');
        } else {
          addLog('飞书客户端配置正常，可以更新飞书状态', 'success');
        }
      }
    }
    
    // 按顺序发布笔记
    for (let i = 0; i < selectedNotes.length; i++) {
      const note = selectedNotes[i];
      
      // 检查是否有ID属性
      if (!note.id) {
        note.id = Date.now() + '_' + Math.random().toString(36).substring(2, 9);
        addLog(`笔记缺少ID，已生成临时ID: ${note.id}`, 'info');
      }
      
      const index = notes.findIndex(n => n.id === note.id);
      
      // 输出笔记信息
      addLog(`准备发布笔记 #${i+1}: "${note.title}"`, 'info');
      if (note.from === 'feishu' && note.recordId) {
        addLog(`笔记来源: 飞书, 记录ID: ${note.recordId}`, 'info');
      } else {
        addLog(`笔记来源: ${note.from || '本地'}`, 'info');
      }
      
      try {
        // 发布当前笔记
        const publishResult = await publishNote(note, index);
        
        if (publishResult) {
          addLog(`笔记 "${note.title}" 发布成功`, 'success');
        }
        
        // 等待指定时间后再发布下一篇
        if (i < selectedNotes.length - 1) {
          const waitTime = getRandomWaitTime();
          addLog(`等待 ${Math.floor(waitTime / 60000)}分${Math.round((waitTime % 60000) / 1000)}秒后发布下一篇...`, 'info');
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      } catch (error) {
        console.error(`发布第 ${i + 1} 篇笔记出错:`, error);
        
        // 如果是从飞书导入的笔记发布失败，添加更新状态的取消信息
        if (note.from === 'feishu' && note.recordId) {
          addLog(`由于发布失败，未更新飞书记录"${note.title}"的状态`, 'warning');
        }
        
        // 继续尝试发布下一篇笔记
        const continuePublishing = confirm(`发布第 ${i + 1} 篇笔记失败: ${error.message}\n\n是否继续发布下一篇？`);
        if (!continuePublishing) {
          break;
        }
      }
    }
    
    // 重新加载笔记列表
    await loadNotes();
    
    // 更新发布按钮状态
    document.getElementById('uploadBtn').disabled = false;
    document.getElementById('uploadBtn').innerText = '一键发布';
    
    addLog('发布任务完成', 'success');
  } catch (error) {
    console.error('发布过程发生错误:', error);
    addLog(`发布过程错误: ${error.message}`, 'error');
    
    // 恢复按钮状态
    document.getElementById('uploadBtn').disabled = false;
    document.getElementById('uploadBtn').innerText = '一键发布';
  }
}

/**
 * 设置所有事件监听器
 */
function setupEventListeners() {
  // 选择文件按钮
  const fileInput = document.getElementById('fileInput');
  const readFileBtn = document.getElementById('readFile');
  const startButton = document.getElementById('startButton');
  const stopButton = document.getElementById('stopButton');
  const importFeishuBtn = document.getElementById('importFeishu');
  
  // 绑定飞书导入按钮事件
  if (importFeishuBtn) {
    importFeishuBtn.addEventListener('click', async () => {
      console.log('点击从飞书导入');
      try {
        // 检查是否已配置飞书
        if (!feishuConfig.appId || !feishuConfig.appSecret || !feishuConfig.appToken || !feishuConfig.tableId) {
          addLog('请先配置飞书多维表格参数', 'error');
          // 打开配置模态框
          const configBtn = document.querySelector('.feishu-config-btn');
          if (configBtn) {
            configBtn.click();
          }
          return;
        }
        
        // 直接调用导入函数
        await importFromFeishu();
      } catch (error) {
        addLog(`导入失败: ${error.message}`, 'error');
      }
    });
  }
  
  if (readFileBtn && fileInput) {
    console.log('找到文件按钮');
    readFileBtn.addEventListener('click', () => {
      console.log('点击选择文件');
      fileInput.click();
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', async function() {
      if (this.files.length === 0) return;
      
      try {
        const text = await this.files[0].text();
        
        // 使用连续的破折号作为分隔符，不限制数量
        const noteContents = text.split(/\-{5,}/).map(content => content.trim()).filter(Boolean);
        
        // 处理所有笔记
        notes = noteContents.map(content => {
          const noteData = parseNoteContent(content);
          return { ...noteData, images: [], imageUrls: {} };
        });

        // 更新界面
        updateNotePanels();
        addLog(`成功导入 ${notes.length} 篇笔记`, 'success');
      } catch (error) {
        addLog(`读取文件失败: ${error.message}`, 'error');
      }
    });
  }

  // 为每个笔记面板添加图片处理功能
  document.querySelectorAll('.note-panel').forEach((panel, index) => {
    const imageInput = panel.querySelector('.image-input');
    const selectImageBtn = panel.querySelector('.select-image');
    const clearImagesBtn = panel.querySelector('.clear-images');
    const imagePreview = panel.querySelector('.image-preview');

    // 选择图片按钮点击事件
    if (selectImageBtn) {
      selectImageBtn.addEventListener('click', () => {
        imageInput.click();
      });
    }

    // 图片选择处理
    if (imageInput) {
      imageInput.onchange = async function() {
        if (this.files.length === 0) return;
        await handleImageUpload(this.files, index, panel);
      };
    }

    // 清除图片按钮点击事件
    if (clearImagesBtn) {
      clearImagesBtn.addEventListener('click', () => {
        notes[index].images = [];
        notes[index].imageUrls = {};
        imagePreview.innerHTML = '';
        imageInput.value = ''; // 重置文件输入框
        addLog('已清除所有图片');
      });
    }
  });

  // 获取设置控件
  const intervalTypeInputs = document.querySelectorAll('input[name="intervalType"]');
  const fixedIntervalInput = document.getElementById('fixedInterval');
  const minIntervalInput = document.getElementById('minInterval');
  const maxIntervalInput = document.getElementById('maxInterval');
  const fixedIntervalDiv = document.querySelector('.fixed-interval');
  const randomIntervalDiv = document.querySelector('.random-interval');

  // 处理间隔类型切换
  intervalTypeInputs.forEach(input => {
    input.addEventListener('change', (e) => {
      publishConfig.intervalType = e.target.value;
      if (e.target.value === 'fixed') {
        fixedIntervalDiv.style.display = 'block';
        randomIntervalDiv.style.display = 'none';
      } else {
        fixedIntervalDiv.style.display = 'none';
        randomIntervalDiv.style.display = 'block';
      }
    });
  });

  // 处理固定间隔输入
  if (fixedIntervalInput) {
    fixedIntervalInput.addEventListener('change', () => {
      publishConfig.fixedInterval = parseInt(fixedIntervalInput.value) * 60;
    });
  }

  // 处理随机间隔范围输入
  if (minIntervalInput) {
    minIntervalInput.addEventListener('change', () => {
      publishConfig.minInterval = parseInt(minIntervalInput.value) * 60;
    });
  }

  if (maxIntervalInput) {
    maxIntervalInput.addEventListener('change', () => {
      publishConfig.maxInterval = parseInt(maxIntervalInput.value) * 60;
    });
  }

  // 开始运行按钮
  if (startButton) {
    console.log('找到开始运行按钮');
    startButton.onclick = async () => {
      try {
        // 获取当前状态
        const response = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: 'GET_STATE' }, (response) => {
            resolve(response || { isPublishing: false });
          });
        });

        if (response.isPublishing) {
          addLog('正在发布中，请等待...', 'info');
          return;
        }

        // 检查笔记内容
        for (let i = 0; i < notes.length; i++) {
          if (!notes[i].title || notes[i].images.length === 0) {
            addLog(`第${i + 1}篇笔记缺少标题或图片`, 'error');
            return;
          }
        }

        // 发送开始发布消息
        await new Promise((resolve) => {
          chrome.runtime.sendMessage({
            type: 'START_PUBLISH',
            data: {
              notes: notes,
              publishConfig: publishConfig
            }
          }, (response) => {
            resolve(response);
          });
        });

        isPublishing = true;
        addLog('开始发布笔记...', 'info');
        startStatusUpdates();
        
        // 显示停止按钮，隐藏开始按钮
        startButton.style.display = 'none';
        stopButton.style.display = 'block';

      } catch (error) {
        addLog(`启动发布失败: ${error.message}`, 'error');
      }
    };

    // 添加点击效果
    startButton.addEventListener('mousedown', () => {
      startButton.style.transform = 'scale(0.98)';
    });

    startButton.addEventListener('mouseup', () => {
      startButton.style.transform = 'scale(1)';
    });

    // 添加悬停效果
    startButton.addEventListener('mouseover', () => {
      startButton.style.opacity = '0.9';
    });

    startButton.addEventListener('mouseout', () => {
      startButton.style.opacity = '1';
      startButton.style.transform = 'scale(1)';
    });
  }

  // 停止发布按钮
  if (stopButton) {
    console.log('找到停止发布按钮');
    stopButton.onclick = async () => {
      try {
        if (!confirm('确定要停止发布吗？已发布的笔记不会被撤回。')) {
          return;
        }
        
        addLog('正在停止发布...', 'info');
        
        // 发送停止发布消息
        await new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: 'STOP_PUBLISH' }, (response) => {
            resolve(response);
          });
        });
        
        isPublishing = false;
        addLog('已停止发布', 'success');
        
        // 隐藏停止按钮，显示开始按钮
        stopButton.style.display = 'none';
        startButton.style.display = 'block';
        
        // 清除状态更新定时器
        if (window.statusUpdateTimer) {
          clearInterval(window.statusUpdateTimer);
          window.statusUpdateTimer = null;
        }
      } catch (error) {
        addLog(`停止发布失败: ${error.message}`, 'error');
      }
    };
    
    // 添加点击效果
    stopButton.addEventListener('mousedown', () => {
      stopButton.style.transform = 'scale(0.98)';
    });

    stopButton.addEventListener('mouseup', () => {
      stopButton.style.transform = 'scale(1)';
    });

    // 添加悬停效果
    stopButton.addEventListener('mouseover', () => {
      stopButton.style.opacity = '0.9';
    });

    stopButton.addEventListener('mouseout', () => {
      stopButton.style.opacity = '1';
      stopButton.style.transform = 'scale(1)';
    });
  }

  // 关闭按钮
  const closeBtn = document.querySelector('.close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      window.close();
    });
  }

  // 帮助按钮点击事件
  const helpBtn = document.querySelector('.help-btn');
  const helpModal = document.querySelector('.help-modal');
  const closeHelp = document.querySelector('.close-help');

  if (helpBtn && helpModal && closeHelp) {
    helpBtn.onclick = () => {
      helpModal.style.display = 'flex';
    };

    closeHelp.onclick = () => {
      helpModal.style.display = 'none';
    };

    // 点击弹窗外部关闭
    helpModal.onclick = (e) => {
      if (e.target === helpModal) {
        helpModal.style.display = 'none';
      }
    };
  }
  
  // 检查是否正在发布，如果是则启动状态更新
  try {
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, (state) => {
      if (state && state.isPublishing) {
        isPublishing = true;
        addLog('发布任务正在进行中...', 'info');
        startStatusUpdates();
        
        // 显示停止按钮，隐藏开始按钮
        updateButtonStatus(true);
      }
    });
  } catch (error) {
    console.error('检查发布状态失败:', error);
  }
  
  // 恢复之前的状态
  chrome.storage.local.get(['pState'], (result) => {
    if (result.pState) {
      const state = {
        isPublishing: result.pState.i,
        currentIndex: result.pState.c,
        totalNotes: result.pState.t,
        currentAction: result.pState.a,
        waitTime: result.pState.w
      };
      updateStatusDisplay(state);
      
      // 根据状态更新按钮显示
      updateButtonStatus(state.isPublishing);
    }
  });
}

// 添加清空日志的函数
function clearLogs() {
  const logPanel = document.getElementById('logPanel');
  if (logPanel) {
    logPanel.innerHTML = '';
  }
  
  // 清空存储的日志
  chrome.storage.local.remove('logs');
}

// 添加状态显示更新函数