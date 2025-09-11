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
    // 绑定日志控制按钮事件
    const downloadLogsBtn = document.getElementById('downloadLogs');
    if (downloadLogsBtn) {
      downloadLogsBtn.addEventListener('click', downloadLogs);
    }
    
    const clearLogsBtn = document.getElementById('clearLogs');
    if (clearLogsBtn) {
      clearLogsBtn.addEventListener('click', clearLogs);
    }
    // 初始化UI
    setupEventListeners();
    
    // 设置消息监听
    setupMessageListener();
    setupStateListeners();
    
    // 设置飞书更新日志增强
    setupFeishuUpdateListener();
    
    // 初始化MVP功能
    await initMVPFeatures();
    
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
  
  // 添加删除按钮样式
  wrapper.style.position = 'relative';
  
  // 创建删除按钮
  const deleteBtn = document.createElement('div');
  deleteBtn.className = 'image-delete-btn';
  deleteBtn.innerHTML = '×';
  deleteBtn.style.position = 'absolute';
  deleteBtn.style.top = '5px';
  deleteBtn.style.right = '5px';
  deleteBtn.style.width = '20px';
  deleteBtn.style.height = '20px';
  deleteBtn.style.borderRadius = '50%';
  deleteBtn.style.background = 'rgba(255, 0, 0, 0.7)';
  deleteBtn.style.color = 'white';
  deleteBtn.style.textAlign = 'center';
  deleteBtn.style.lineHeight = '18px';
  deleteBtn.style.cursor = 'pointer';
  deleteBtn.style.zIndex = '10';
  deleteBtn.style.fontSize = '16px';
  deleteBtn.style.fontWeight = 'bold';
  
  // 图片加载中的提示
  const loadingIndicator = document.createElement('div');
  loadingIndicator.className = 'image-loading';
  loadingIndicator.textContent = '加载中...';
  loadingIndicator.style.position = 'absolute';
  loadingIndicator.style.top = '50%';
  loadingIndicator.style.left = '50%';
  loadingIndicator.style.transform = 'translate(-50%, -50%)';
  loadingIndicator.style.color = 'white';
  loadingIndicator.style.background = 'rgba(0, 0, 0, 0.5)';
  loadingIndicator.style.padding = '5px 10px';
  loadingIndicator.style.borderRadius = '3px';
  loadingIndicator.style.zIndex = '5';
  
  wrapper.appendChild(loadingIndicator);
  
  const img = document.createElement('img');
  img.style.maxWidth = '100%';
  img.style.height = 'auto';
  img.style.display = 'block';
  
  // 显示图片 - 处理各种可能的图片数据格式
  let src = '';
  try {
    if (typeof imageData.dataUrl === 'string') {
      // 直接使用字符串URL
      src = imageData.dataUrl;
    } else if (imageData.dataUrl && imageData.dataUrl.blob instanceof Blob) {
      // Blob对象，创建URL
      src = URL.createObjectURL(imageData.dataUrl.blob);
    } else if (imageData.dataUrl && imageData.dataUrl.url) {
      // 包含URL属性的对象
      src = imageData.dataUrl.url;
    } else if (notes[noteIndex].images && notes[noteIndex].images[index]) {
      // 从笔记的images数组获取
      const noteImage = notes[noteIndex].images[index];
      if (noteImage instanceof Blob) {
        src = URL.createObjectURL(noteImage);
      } else if (noteImage && noteImage.blob instanceof Blob) {
        src = URL.createObjectURL(noteImage.blob);
      } else if (noteImage && noteImage.url) {
        src = noteImage.url;
      }
    } else if (notes[noteIndex].imageUrls && notes[noteIndex].imageUrls[index]) {
      // 从笔记的imageUrls获取
      const imgData = notes[noteIndex].imageUrls[index];
      if (typeof imgData === 'string') {
        src = imgData;
      } else if (imgData && imgData.blob instanceof Blob) {
        src = URL.createObjectURL(imgData.blob);
      } else if (imgData && imgData.url) {
        src = imgData.url;
      }
    }
    
    if (!src) {
      loadingIndicator.textContent = '无法加载图片';
      loadingIndicator.style.background = 'rgba(255, 0, 0, 0.5)';
    } else {
      img.src = src;
    }
  } catch (error) {
    console.error('创建图片预览时出错:', error);
    loadingIndicator.textContent = '加载图片出错';
    loadingIndicator.style.background = 'rgba(255, 0, 0, 0.5)';
  }
  
  // 图片加载完成后移除加载提示
  img.onload = () => {
    loadingIndicator.style.display = 'none';
  };
  
  // 图片加载失败处理
  img.onerror = () => {
    loadingIndicator.textContent = '图片加载失败';
    loadingIndicator.style.background = 'rgba(255, 0, 0, 0.5)';
  };
  
  wrapper.appendChild(img);
  wrapper.appendChild(deleteBtn);
  
  // 如果有文件名，显示文件名
  if (imageData.name) {
    const nameLabel = document.createElement('span');
    nameLabel.className = 'image-filename';
    nameLabel.textContent = imageData.name;
    nameLabel.style.position = 'absolute';
    nameLabel.style.bottom = '0';
    nameLabel.style.left = '0';
    nameLabel.style.right = '0';
    nameLabel.style.fontSize = '10px';
    nameLabel.style.background = 'rgba(0,0,0,0.6)';
    nameLabel.style.color = 'white';
    nameLabel.style.padding = '3px';
    nameLabel.style.textOverflow = 'ellipsis';
    nameLabel.style.overflow = 'hidden';
    nameLabel.style.whiteSpace = 'nowrap';
    nameLabel.style.textAlign = 'center';
    wrapper.appendChild(nameLabel);
  }
  
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
  
  // 点击删除按钮删除图片
  deleteBtn.addEventListener('click', e => {
    e.stopPropagation(); // 阻止事件冒泡
    
      // 删除图片
      wrapper.remove();
      
      // 从笔记中移除图片数据
      delete notes[noteIndex].images[index];
      delete notes[noteIndex].imageUrls[index];
      
      // 更新索引
      updateNoteImageIndices(panel, noteIndex);
      
      addLog(`已删除图片 #${index + 1}`, 'info');
      saveState();
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
    overflow-y: auto !important; // 添加滚动条
  }
  
  .log-panel-container {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  
  .log-controls {
    display: flex;
    justify-content: flex-end;
    padding: 5px 10px;
    background-color: #f5f5f5;
    border-top: 1px solid #ddd;
  }
  
  .log-controls button {
    margin-left: 8px;
    font-size: 12px;
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
    const productSpec1 = noteData.productSpec1 || '';
    const productSpec2 = noteData.productSpec2 || '';
    
    if (productSpec) {
      addLog(`笔记${index + 1}的商品规格是: ${productSpec}`);
    }
    if (productSpec1) {
      addLog(`笔记${index + 1}的商品规格1是: ${productSpec1}`);
    }
    if (productSpec2) {
      addLog(`笔记${index + 1}的商品规格2是: ${productSpec2}`);
    }
    
    if (!productSpec && !productSpec1 && !productSpec2) {
      addLog(`笔记${index + 1}未设置商品规格`);
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

    // 准备图片数据 - 这里是优化点：在实际需要上传时才将Blob转换为base64
    addLog('准备图片数据...');
    const imageDataArray = [];
    
    // 调试日志
    console.log('图片数据类型:', typeof noteData.imageUrls);
    console.log('图片键数量:', Object.keys(noteData.imageUrls || {}).length);
    
    // 手动转换Blob为base64的通用函数
    const blobToBase64Manual = async (blob) => {
      try {
        // 读取Blob为ArrayBuffer
        const arrayBuffer = await blob.arrayBuffer();
        
        // 将ArrayBuffer转换为二进制字符串
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        
        // 转换为base64
        const base64 = btoa(binary);
        
        // 添加MIME类型前缀
        const mimeType = blob.type || 'image/jpeg';
        return `data:${mimeType};base64,${base64}`;
      } catch (e) {
        console.error('手动转换Blob为base64失败:', e);
        return null;
      }
    };
    
    // 标准方法转换Blob为base64
    const blobToBase64Standard = (blob) => {
      return new Promise((resolve, reject) => {
        if (!(blob instanceof Blob)) {
          return reject(new Error('输入不是有效的Blob对象'));
        }
        
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = (e) => {
          console.error('FileReader失败:', e);
          reject(e);
        };
        reader.readAsDataURL(blob);
      });
    };
    
    // 从URL获取图片为base64
    const urlToBase64 = async (url) => {
      try {
        // 如果已经是base64格式，直接返回
        if (url.startsWith('data:')) return url;
        
        // 下载图片
        const response = await fetch(url);
        if (!response.ok) throw new Error(`获取图片失败: ${response.status}`);
        
        const blob = await response.blob();
        
        // 尝试两种方法转换
        try {
          return await blobToBase64Standard(blob);
        } catch (e) {
          console.warn('标准方法转换失败，尝试手动方法:', e);
          return await blobToBase64Manual(blob);
        }
      } catch (e) {
        console.error('URL转base64失败:', e);
        return null;
      }
    };
    
    // 根据imageUrls类型进行不同处理
    if (noteData.imageUrls) {
      const keys = Object.keys(noteData.imageUrls);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const imageData = noteData.imageUrls[key];
        console.log(`处理第${i+1}张图片(${key}):`, typeof imageData);
        
        try {
          let base64Data = null;
          
          // 判断类型并转换
          if (typeof imageData === 'string') {
            if (imageData.startsWith('data:')) {
              // 如果已经是base64，直接使用
              console.log(`第${i+1}张图片已是base64格式，直接使用`);
              base64Data = imageData;
            } else if (imageData.startsWith('http') || imageData.startsWith('blob:')) {
              // URL，需要下载并转换
              console.log(`第${i+1}张图片是URL，尝试下载并转换`);
              base64Data = await urlToBase64(imageData);
            }
          } else if (imageData && imageData.blob instanceof Blob) {
            // 对象中包含blob属性
            console.log(`第${i+1}张图片是Blob对象，进行转换`);
            try {
              base64Data = await blobToBase64Standard(imageData.blob);
            } catch (e) {
              console.warn('标准方法转换失败，尝试手动方法:', e);
              base64Data = await blobToBase64Manual(imageData.blob);
            }
          } else if (imageData && imageData.url) {
            // 对象中包含url属性
            console.log(`第${i+1}张图片有URL属性:`, imageData.url);
            base64Data = await urlToBase64(imageData.url);
          } else if (noteData.images && noteData.images[key]) {
            // 尝试从images数组获取
            const img = noteData.images[key];
            if (img instanceof Blob) {
              console.log(`第${i+1}张图片从images[${key}]获取Blob`);
              try {
                base64Data = await blobToBase64Standard(img);
              } catch (e) {
                console.warn('标准方法转换失败，尝试手动方法:', e);
                base64Data = await blobToBase64Manual(img);
              }
            } else if (img && img.blob instanceof Blob) {
              console.log(`第${i+1}张图片从images[${key}].blob获取Blob`);
              try {
                base64Data = await blobToBase64Standard(img.blob);
              } catch (e) {
                console.warn('标准方法转换失败，尝试手动方法:', e);
                base64Data = await blobToBase64Manual(img.blob);
              }
            }
          }
          
          // 验证并添加转换结果
          if (base64Data && typeof base64Data === 'string' && base64Data.startsWith('data:')) {
            imageDataArray.push(base64Data);
            console.log(`第${i+1}张图片转换成功，长度:`, base64Data.length);
            addLog(`第${i+1}张图片准备完成，大小: ${Math.round(base64Data.length/1024)}KB`);
          } else {
            console.error(`第${i+1}张图片转换失败，结果:`, base64Data);
            addLog(`第${i+1}张图片转换失败`, 'error');
          }
        } catch (processError) {
          console.error(`处理第${i+1}张图片时出错:`, processError);
          addLog(`处理第${i+1}张图片时出错: ${processError.message}`, 'error');
        }
      }
    }
    
    // 输出转换后的图片数量
    console.log(`转换后的图片数量: ${imageDataArray.length}`);
    addLog(`准备完成，共有 ${imageDataArray.length} 张图片可上传`);
    
    // 如果没有有效的图片，报错
    if (imageDataArray.length === 0) {
      throw new Error('没有有效的图片可以上传');
    }
    
    // 辅助函数：将Blob转换为base64
    function blobToBase64(blob) {
      return new Promise((resolve, reject) => {
        if (!(blob instanceof Blob)) {
          return reject(new Error('输入不是有效的Blob对象'));
        }
        
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }

    // 5. 点击上传图片并上传已选择的图片
    addLog('开始上传已选择的图片');
    
    // 首先获取页面上传元素结构，确保选择器正确
    const pageStructure = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: () => {
        // 检查页面结构
        const structure = {
          uploadInput: null,
          uploadWrapperExists: false,
          alternatives: []
        };
        
        // 检查常规上传输入框
          const uploadInput = document.querySelector('#web > div.outarea.upload-c > div > div > div.upload-content > div.upload-wrapper > div > input');
          if (uploadInput) {
          structure.uploadInput = {
            type: uploadInput.type,
            accept: uploadInput.accept,
            multiple: uploadInput.multiple
          };
        }
        
        // 检查上传包装元素
        const uploadWrapper = document.querySelector('#web > div.outarea.upload-c > div > div > div.upload-content > div.upload-wrapper');
        structure.uploadWrapperExists = !!uploadWrapper;
        
        // 查找替代上传元素
        const allInputs = Array.from(document.querySelectorAll('input[type="file"]'));
        structure.alternatives = allInputs.map(input => {
          const parentClasses = input.parentElement ? input.parentElement.className : '';
          return {
            id: input.id,
            className: input.className,
            parentClasses,
            accept: input.accept,
            multiple: input.multiple
          };
        });
        
        // 检查上传容器
        const containers = Array.from(document.querySelectorAll('div.upload-wrapper'));
        structure.containers = containers.map(c => ({
          className: c.className,
          children: c.childElementCount,
          hasFileInput: !!c.querySelector('input[type="file"]')
        }));
        
        return structure;
      }
    });
    
    console.log("页面上传元素结构:", pageStructure[0].result);
    addLog(`检测到上传元素: ${pageStructure[0].result.uploadInput ? '是' : '否'}`);
    
    // 尝试两种上传方法，增加成功率
    let uploadSuccess = false;
    
    // 方法1: 通过脚本直接操作input元素
    if (!uploadSuccess) {
      addLog('尝试上传方法1...');
      const uploadResult1 = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: (imageDataArray) => {
          return new Promise((resolve) => {
            console.log('在页面中处理图片，数量:', imageDataArray.length);
            
            // 查找所有可能的文件上传输入框
            const possibleInputs = [
              document.querySelector('#web > div.outarea.upload-c > div > div > div.upload-content > div.upload-wrapper > div > input'),
              ...Array.from(document.querySelectorAll('input[type="file"]'))
            ].filter(Boolean);
            
            console.log('找到可能的上传输入框:', possibleInputs.length);
            
            if (possibleInputs.length === 0) {
              console.error('未找到任何上传输入框');
              resolve({success: false, error: '未找到上传输入框'});
              return;
            }
            
            const uploadInput = possibleInputs[0];
            console.log('使用上传输入框:', uploadInput);
            
            try {
            // 创建 DataTransfer 对象
            const dataTransfer = new DataTransfer();
            
            // 将 base64 数据转换为 File 对象
              let validFiles = 0;
              
            imageDataArray.forEach((imageData, index) => {
                try {
                  console.log(`处理第${index+1}张图片，前20个字符:`, imageData.substring(0, 20));
                  
                  // 确保是有效的base64数据
                  if (!imageData || typeof imageData !== 'string' || !imageData.startsWith('data:')) {
                    console.error(`第${index+1}张图片不是有效的base64字符串`);
                    return;
                  }
                  
                  const parts = imageData.split(',');
                  if (parts.length !== 2) {
                    console.error(`第${index+1}张图片格式不正确`);
                    return;
                  }
                  
              // 从 base64 创建 Blob
                  const byteString = atob(parts[1]);
                  const mimeString = parts[0].split(':')[1].split(';')[0];
              const ab = new ArrayBuffer(byteString.length);
              const ia = new Uint8Array(ab);
              for (let i = 0; i < byteString.length; i++) {
                ia[i] = byteString.charCodeAt(i);
              }
              const blob = new Blob([ab], { type: mimeString });
              
              // 创建 File 对象
              const file = new File([blob], `image${index + 1}.jpg`, { type: mimeString });
              dataTransfer.items.add(file);
                  validFiles++;
                  
                  console.log(`第${index+1}张图片处理完成，大小:`, file.size);
                } catch (error) {
                  console.error(`处理第${index+1}张图片出错:`, error);
                }
              });
              
              console.log('处理后的有效文件数量:', validFiles);
              console.log('DataTransfer文件数量:', dataTransfer.files.length);
              
              if (dataTransfer.files.length === 0) {
                console.error('没有有效的图片文件可以上传');
                resolve({success: false, error: '没有有效的图片文件'});
                return;
              }

            // 设置文件到上传输入框
            uploadInput.files = dataTransfer.files;
              console.log('已设置文件到输入框，触发change事件');
            uploadInput.dispatchEvent(new Event('change', { bubbles: true }));
              
              // 检查上传后的状态
              setTimeout(() => {
                const uploadedImages = document.querySelectorAll('.image-uploader-item');
                const uploadedCount = uploadedImages.length;
                console.log('已上传图片数量:', uploadedCount);
                
                // 分析上传状态
                const allDataItems = document.querySelectorAll('.image-uploader-item');
                const itemsInfo = Array.from(allDataItems).map(item => ({
                  className: item.className,
                  hasImage: !!item.querySelector('img'),
                  hasProgress: !!item.querySelector('.progress')
                }));
                
                console.log('上传项目详情:', itemsInfo);
                
                resolve({
                  success: uploadedCount > 0,
                  uploadedCount,
                  itemsInfo
                });
              }, 3000);
            } catch (error) {
              console.error('上传过程中出错:', error);
              resolve({success: false, error: error.toString()});
            }
          });
        },
        args: [imageDataArray]
      });
      
      console.log("上传方法1结果:", uploadResult1[0].result);
      
      if (uploadResult1[0].result.success) {
        uploadSuccess = true;
        addLog(`方法1上传成功，已上传 ${uploadResult1[0].result.uploadedCount} 张图片`);
          } else {
        addLog(`方法1上传失败: ${uploadResult1[0].result.error || '未知错误'}`);
      }
    }
    
    // 方法2: 通过触发点击上传按钮的方式
    if (!uploadSuccess) {
      addLog('尝试上传方法2...');
      
      // 先准备好文件对象
      const prepareFilesResult = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: (imageDataArray) => {
          return new Promise((resolve) => {
            try {
              window.__preparedFiles = [];
              let validFiles = 0;
              
              // 将 base64 数据转换为 File 对象
              imageDataArray.forEach((imageData, index) => {
                try {
                  if (!imageData || typeof imageData !== 'string' || !imageData.startsWith('data:')) {
                    return;
                  }
                  
                  const parts = imageData.split(',');
                  if (parts.length !== 2) {
                    return;
                  }
                  
                  // 从 base64 创建 Blob
                  const byteString = atob(parts[1]);
                  const mimeString = parts[0].split(':')[1].split(';')[0];
                  const ab = new ArrayBuffer(byteString.length);
                  const ia = new Uint8Array(ab);
                  for (let i = 0; i < byteString.length; i++) {
                    ia[i] = byteString.charCodeAt(i);
                  }
                  const blob = new Blob([ab], { type: mimeString });
                  
                  // 创建 File 对象
                  const file = new File([blob], `image${index + 1}.jpg`, { type: mimeString });
                  window.__preparedFiles.push(file);
                  validFiles++;
                } catch (error) {
                  console.error(`处理图片出错:`, error);
                }
              });
              
              resolve({
                success: validFiles > 0,
                filesCount: validFiles
              });
            } catch (error) {
              resolve({success: false, error: error.toString()});
          }
        });
      },
        args: [imageDataArray]
      });
      
      console.log("准备文件结果:", prepareFilesResult[0].result);
      
      if (prepareFilesResult[0].result.success) {
        // 模拟点击上传按钮并使用准备好的文件
        const uploadResult2 = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          function: () => {
            return new Promise((resolve) => {
              try {
                // 先找到所有可能的上传入口
                const uploadButtons = [
                  ...document.querySelectorAll('.upload-wrapper'),
                  ...document.querySelectorAll('[class*="upload"]'),
                  ...document.querySelectorAll('[class*="Upload"]')
                ];
                
                console.log('找到可能的上传入口:', uploadButtons.length);
                
                if (uploadButtons.length === 0) {
                  resolve({success: false, error: '未找到上传入口'});
                  return;
                }
                
                // 劫持原生FileReader以劫持文件选择
                const originalAddEventListener = EventTarget.prototype.addEventListener;
                
                EventTarget.prototype.addEventListener = function(type, listener, options) {
                  if (type === 'change' && this.type === 'file') {
                    // 这是文件输入的change监听器
                    const originalListener = listener;
                    
                    const newListener = function(event) {
                      // 如果有准备好的文件，使用它们
                      if (window.__preparedFiles && window.__preparedFiles.length > 0) {
                        console.log('劫持文件选择，使用准备好的文件');
                        
                        // 创建自定义事件
                        const customEvent = new Event('change', { bubbles: true });
                        
                        // 创建自定义文件列表
                        const dataTransfer = new DataTransfer();
                        window.__preparedFiles.forEach(file => {
                          dataTransfer.items.add(file);
                        });
                        
                        // 设置自定义文件列表
                        Object.defineProperty(this, 'files', {
                          get: function() {
                            return dataTransfer.files;
                          }
                        });
                        
                        // 调用原始监听器
                        return originalListener.call(this, customEvent);
                      }
                      
                      // 否则使用原始事件
                      return originalListener.call(this, event);
                    };
                    
                    return originalAddEventListener.call(this, type, newListener, options);
                  }
                  
                  // 对于其他事件类型，使用原始方法
                  return originalAddEventListener.call(this, type, listener, options);
                };
                
                // 点击第一个上传入口
                console.log('点击上传入口');
                uploadButtons[0].click();
                
                // 恢复原始方法
                setTimeout(() => {
                  EventTarget.prototype.addEventListener = originalAddEventListener;
                }, 5000);
                
                // 检查结果
                setTimeout(() => {
                  const uploadedImages = document.querySelectorAll('.image-uploader-item');
                  const uploadedCount = uploadedImages.length;
                  console.log('已上传图片数量:', uploadedCount);
                  
                  resolve({
                    success: uploadedCount > 0,
                    uploadedCount: uploadedCount
                  });
                }, 5000);
              } catch (error) {
                console.error('上传过程中出错:', error);
                resolve({success: false, error: error.toString()});
              }
            });
          }
        });
        
        console.log("上传方法2结果:", uploadResult2[0].result);
        
        if (uploadResult2[0].result.success) {
          uploadSuccess = true;
          addLog(`方法2上传成功，已上传 ${uploadResult2[0].result.uploadedCount} 张图片`);
        } else {
          addLog(`方法2上传失败: ${uploadResult2[0].result.error || '未知错误'}`);
        }
      }
    }
    
    // 检查最终上传结果
    if (!uploadSuccess) {
      // 尝试模拟拖放操作
      addLog('尝试最后的拖放上传方法...');
      const dragDropResult = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: () => {
          return new Promise((resolve) => {
            try {
              // 检查是否有准备好的文件
              if (!window.__preparedFiles || window.__preparedFiles.length === 0) {
                resolve({success: false, error: '没有准备好的文件'});
                return;
              }
              
              // 查找拖放区域
              const dropZones = [
                document.querySelector('.upload-wrapper'),
                document.querySelector('[class*="upload-area"]'),
                document.querySelector('[class*="dropzone"]')
              ].filter(Boolean);
              
              if (dropZones.length === 0) {
                resolve({success: false, error: '未找到拖放区域'});
                return;
              }
              
              const dropZone = dropZones[0];
              console.log('找到拖放区域:', dropZone);
              
              // 创建拖放事件
              const dragEnterEvent = new DragEvent('dragenter', {
                bubbles: true,
                cancelable: true,
                dataTransfer: new DataTransfer()
              });
              
              const dragOverEvent = new DragEvent('dragover', {
                bubbles: true,
                cancelable: true,
                dataTransfer: new DataTransfer()
              });
              
              // 创建带有文件的dataTransfer
              const dropDataTransfer = new DataTransfer();
              window.__preparedFiles.forEach(file => {
                dropDataTransfer.items.add(file);
              });
              
              const dropEvent = new DragEvent('drop', {
                bubbles: true,
                cancelable: true,
                dataTransfer: dropDataTransfer
              });
              
              // 执行拖放事件序列
              dropZone.dispatchEvent(dragEnterEvent);
              dropZone.dispatchEvent(dragOverEvent);
              dropZone.dispatchEvent(dropEvent);
              
              // 检查结果
              setTimeout(() => {
                const uploadedImages = document.querySelectorAll('.image-uploader-item');
                const uploadedCount = uploadedImages.length;
                console.log('拖放后已上传图片数量:', uploadedCount);
                
                resolve({
                  success: uploadedCount > 0,
                  uploadedCount: uploadedCount
                });
              }, 3000);
            } catch (error) {
              console.error('拖放上传过程中出错:', error);
              resolve({success: false, error: error.toString()});
            }
          });
        }
      });
      
      console.log("拖放上传结果:", dragDropResult[0].result);
      
      if (dragDropResult[0].result.success) {
        uploadSuccess = true;
        addLog(`拖放上传成功，已上传 ${dragDropResult[0].result.uploadedCount} 张图片`);
      } else {
        addLog(`拖放上传失败: ${dragDropResult[0].result.error || '未知错误'}`);
      }
    }
    
    // 如果拖放上传也失败，尝试使用更强力的方法
    if (!uploadSuccess) {
      addLog('尝试最强力的上传方法...');
      
      // 让页面重新聚焦
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: () => {
          window.focus();
        }
      });
      
      // 强力注入方法：直接注入文件到页面DOM
      const powerfulUploadResult = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: () => {
          return new Promise((resolve) => {
            try {
              // 确保已准备好文件
              if (!window.__preparedFiles || window.__preparedFiles.length === 0) {
                resolve({success: false, error: '没有准备好的文件'});
                return;
              }
              
              console.log('执行强力上传方法，准备好的文件数量:', window.__preparedFiles.length);
              
              // 匹配所有可能的上传点的选择器
              const possibleUploadSelectors = [
                'input[type="file"]',
                '[class*="upload"] input[type="file"]',
                '.upload-wrapper input',
                '.image-uploader input',
                '#file-upload',
                '.upload-button input'
              ];
              
              // 找到所有文件输入元素
              let allInputs = [];
              possibleUploadSelectors.forEach(selector => {
                const inputs = document.querySelectorAll(selector);
                allInputs = [...allInputs, ...Array.from(inputs)];
              });
              
              console.log('找到的文件输入元素数量:', allInputs.length);
              
              if (allInputs.length === 0) {
                // 尝试创建新的上传输入元素
                console.log('未找到上传输入，尝试创建新元素');
                
                // 找到上传区域
                const uploadAreas = document.querySelectorAll('.upload-wrapper, [class*="upload-area"], [class*="dropzone"]');
                if (uploadAreas.length === 0) {
                  resolve({success: false, error: '未找到上传区域且无法创建输入元素'});
                  return;
                }
                
                // 创建新的文件输入
                const newInput = document.createElement('input');
                newInput.type = 'file';
                newInput.multiple = true;
                newInput.accept = 'image/*';
                newInput.style.position = 'absolute';
                newInput.style.top = '-1000px'; // 隐藏元素但保持功能
                
                // 添加到上传区域
                uploadAreas[0].appendChild(newInput);
                allInputs.push(newInput);
                console.log('已创建新的上传输入元素');
              }
              
              // 直接修改所有输入元素的文件
              const successfulInputs = [];
              
              allInputs.forEach((input, idx) => {
                try {
                  // 创建自定义文件列表
                  const dataTransfer = new DataTransfer();
                  window.__preparedFiles.forEach(file => {
                    dataTransfer.items.add(file);
                  });
                  
                  // 直接设置文件
                  input.files = dataTransfer.files;
                  console.log(`已设置文件到输入元素 #${idx}，尝试触发事件`);
                  
                  // 触发change事件
                  const event = new Event('change', { bubbles: true });
                  input.dispatchEvent(event);
                  
                  // 触发用户输入事件
                  const inputEvent = new Event('input', { bubbles: true });
                  input.dispatchEvent(inputEvent);
                  
                  successfulInputs.push(idx);
                } catch (e) {
                  console.error(`为输入元素 #${idx} 设置文件失败:`, e);
                }
              });
              
              // 如果还是没有上传成功，尝试模拟用户点击
              if (successfulInputs.length === 0) {
                // 找到所有上传按钮
                const uploadButtons = document.querySelectorAll('[class*="upload"], .upload-button, button:contains("上传")');
                console.log('找到可能的上传按钮:', uploadButtons.length);
                
                if (uploadButtons.length > 0) {
                  // 模拟点击第一个上传按钮
                  uploadButtons[0].click();
                  console.log('已模拟点击上传按钮');
                }
              }
              
              // 延迟检查上传结果
              setTimeout(() => {
                const uploadedImages = document.querySelectorAll('.image-uploader-item, [class*="uploadedItem"], .uploaded-image');
                const uploadedCount = uploadedImages.length;
                console.log('已上传图片数量:', uploadedCount);
                
                resolve({
                  success: uploadedCount > 0,
                  uploadedCount: uploadedCount,
                  successfulInputs
                });
              }, 5000);
            } catch (error) {
              console.error('强力上传过程中出错:', error);
              resolve({success: false, error: error.toString()});
            }
          });
        }
      });
      
      console.log("强力上传方法结果:", powerfulUploadResult[0].result);
      
      if (powerfulUploadResult[0].result.success) {
        uploadSuccess = true;
        addLog(`强力上传成功，已上传 ${powerfulUploadResult[0].result.uploadedCount} 张图片`);
      } else {
        addLog(`强力上传失败: ${powerfulUploadResult[0].result.error || '未知错误'}`);
      }
    }
    
    // 如果所有方法都失败，尝试获取更多页面信息用于诊断
    if (!uploadSuccess) {
      addLog('所有上传方法都失败，获取页面信息用于诊断', 'error');
      
      // 截取页面截图以帮助诊断
      try {
        addLog('尝试截取页面截图...');
        const screenshotResult = await chrome.tabs.captureVisibleTab();
        console.log('截图获取成功，长度:', screenshotResult.length);
        // 显示页面截图，帮助诊断
        const debugImg = document.createElement('img');
        debugImg.src = screenshotResult;
        debugImg.style.maxWidth = '300px';
        debugImg.style.border = '2px solid red';
        debugImg.style.margin = '10px 0';
        
        // 添加到日志区域
        const logArea = document.getElementById('log');
        if (logArea) {
          const imgContainer = document.createElement('div');
          imgContainer.innerHTML = '<strong>页面截图:</strong>';
          imgContainer.appendChild(debugImg);
          logArea.appendChild(imgContainer);
        }
        addLog('页面截图已添加到日志区域');
      } catch (screenshotError) {
        console.error('截图失败:', screenshotError);
        addLog('截图失败: ' + screenshotError.message, 'error');
      }
      
      const pageInfo = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: () => {
          const info = {
            url: window.location.href,
            title: document.title,
            bodyContent: document.body.innerHTML.substring(0, 1000),
            uploadElements: []
          };
          
          // 查找所有可能的上传相关元素
          const elements = document.querySelectorAll('[class*="upload"],[class*="Upload"],[class*="image"],[class*="Image"]');
          info.uploadElements = Array.from(elements).slice(0, 10).map(el => ({
            tagName: el.tagName,
            className: el.className,
            id: el.id,
            innerHTML: el.innerHTML.substring(0, 100)
          }));
          
          return info;
        }
      });
      
      console.log("页面诊断信息:", pageInfo[0].result);
      addLog(`页面诊断已完成，请检查控制台日志`, 'info');
      
      // 抛出具体的错误
      throw new Error('上传图片失败，所有上传方法都失败，请检查控制台日志');
    }
    
    // 添加手动上传提示
    addLog('自动上传失败，请尝试手动操作', 'warning');
    
    // 在日志区域添加手动指导
    const logArea = document.getElementById('log');
    if (logArea) {
      const manualDiv = document.createElement('div');
      manualDiv.innerHTML = `
        <div style="border:2px solid #ff4d4f; padding:10px; margin:10px 0; background:#fff2f0;">
          <h3 style="color:#ff4d4f; margin-top:0;">自动上传失败，请尝试手动上传图片</h3>
          <ol style="padding-left:20px;">
            <li>请在小红书页面中点击"上传图片"按钮</li>
            <li>选择你想上传的图片</li>
            <li>上传完成后，插件会继续自动填写标题和内容</li>
          </ol>
        </div>
      `;
      logArea.appendChild(manualDiv);
    }

    // 等待图片上传完成
    addLog('等待图片上传完成...');
    await new Promise(resolve => setTimeout(resolve, 8000)); // 延长等待时间

    // 6. 填写笔记内容
    addLog('开始填写内容');
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: async (contentData, productId, productSpec, productSpec1, productSpec2) => {
        return new Promise(async (resolve) => {
          // 调试：显示接收到的参数
          console.log('=== 规格选择调试信息 ===');
          console.log('contentData:', contentData);
          console.log('productId:', productId);
          console.log('productSpec:', productSpec);
          console.log('productSpec1:', productSpec1);
          console.log('productSpec2:', productSpec2);
          console.log('productSpec1 类型:', typeof productSpec1);
          console.log('productSpec2 类型:', typeof productSpec2);
          console.log('productSpec1 是否为空:', !productSpec1);
          console.log('productSpec2 是否为空:', !productSpec2);
          console.log('========================');
          
          setTimeout(async () => {
            // 填写标题
            const titleInput = document.querySelector('#web > div > div > div > div > div.body > div.content > div.plugin.title-container > div > div > div > div.d-input-wrapper.d-inline-block.c-input_inner > div > input');
            if (titleInput) {
              titleInput.value = contentData.title;
              titleInput.dispatchEvent(new Event('input', { bubbles: true }));
            }

            // 点击正文编辑器 - 兼容新旧版本
            const editor = document.querySelector('#web > div > div > div > div > div.body > div.content > div.plugin.editor-container > div > div > div.editor-container > div.editor-content > div > div') ||
                          document.querySelector('#quillEditor > div');
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
                                  
                                  // 等待商品添加成功并点击修改规格按钮
                                  setTimeout(async () => {
                                    console.log('寻找修改规格按钮...');
                                    
                                    // 等待一下确保商品卡片加载完成
                                    console.log('等待商品卡片加载完成...');
                                    await new Promise(r => setTimeout(r, 2000));
                                    
                                    // 再次检查商品是否已经添加成功
                                    let retryCount = 0;
                                    const maxRetries = 5;
                                    
                                    while (retryCount < maxRetries) {
                                      const commodityExists = document.querySelector('.media-commodity');
                                      if (commodityExists) {
                                        console.log('商品卡片已加载');
                                        break;
                                      }
                                      console.log(`等待商品卡片加载... (${retryCount + 1}/${maxRetries})`);
                                      await new Promise(r => setTimeout(r, 1000));
                                      retryCount++;
                                    }
                                    
                                    // 查找修改规格按钮
                                    let modifySpecBtn = null;
                                    
                                    // 使用正确的按钮选择器
                                    console.log('开始查找修改规格按钮...');
                                    
                                    // 首先检查商品卡片是否存在
                                    const commodityCard = document.querySelector('.media-commodity');
                                    console.log('商品卡片是否存在:', commodityCard ? '是' : '否');
                                    
                                    // 检查操作按钮容器是否存在
                                    const operationContainer = document.querySelector('.draggable-good-card-operation');
                                    console.log('操作按钮容器是否存在:', operationContainer ? '是' : '否');
                                    
                                    if (operationContainer) {
                                      const allButtons = operationContainer.querySelectorAll('button');
                                      console.log('操作容器中的按钮数量:', allButtons.length);
                                      allButtons.forEach((btn, index) => {
                                        console.log(`按钮${index + 1}文本:`, btn.textContent.trim());
                                      });
                                    }
                                    
                                    // 尝试完整选择器
                                    modifySpecBtn = document.querySelector('#web > div > div > div > div > div.body > div.content > div.media-commodity > div > div > div > div > div > div > div.draggable-wrap > div > div.draggable-good-card-operation > button:nth-child(2)');
                                    console.log('完整选择器结果:', modifySpecBtn ? '找到' : '未找到');
                                    
                                    if (!modifySpecBtn) {
                                      // 备用选择器
                                      modifySpecBtn = document.querySelector('.draggable-good-card-operation button:nth-child(2)');
                                      console.log('备用选择器结果:', modifySpecBtn ? '找到' : '未找到');
                                    }
                                    
                                    if (!modifySpecBtn && operationContainer) {
                                      // 尝试通过文本查找
                                      const allButtons = operationContainer.querySelectorAll('button');
                                      for (const btn of allButtons) {
                                        const btnText = btn.textContent.trim();
                                        if (btnText.includes('改规格') || btnText.includes('修改规格') || btnText.includes('规格')) {
                                          modifySpecBtn = btn;
                                          console.log('通过文本找到按钮:', btnText);
                                          break;
                                        }
                                      }
                                    }
                                    
                                    if (modifySpecBtn) {
                                      console.log('最终找到修改规格按钮，按钮文本:', modifySpecBtn.textContent.trim());
                                    } else {
                                      console.error('未能找到修改规格按钮');
                                    }
                                    
                                    // 调试：检查条件判断
                                    console.log('=== 条件判断调试 ===');
                                    console.log('modifySpecBtn 存在:', !!modifySpecBtn);
                                    console.log('productSpec1 值:', productSpec1);
                                    console.log('productSpec2 值:', productSpec2);
                                    console.log('productSpec1 || productSpec2:', !!(productSpec1 || productSpec2));
                                    console.log('最终判断结果:', !!(modifySpecBtn && (productSpec1 || productSpec2)));
                                    console.log('==================');
                                    
                                    if (modifySpecBtn && (productSpec1 || productSpec2)) {
                                      console.log('找到修改规格按钮，准备点击');
                                      console.log('按钮元素:', modifySpecBtn);
                                      console.log('按钮是否可见:', modifySpecBtn.offsetParent !== null);
                                      console.log('按钮是否被禁用:', modifySpecBtn.disabled);
                                      
                                      // 尝试多种点击方式
                                      try {
                                        // 方式1：直接点击
                                        console.log('尝试直接点击按钮');
                                        modifySpecBtn.click();
                                        
                                        // 方式2：触发鼠标事件
                                        setTimeout(() => {
                                          console.log('尝试触发鼠标事件');
                                          const clickEvent = new MouseEvent('click', {
                                            bubbles: true,
                                            cancelable: true,
                                            view: window
                                          });
                                          modifySpecBtn.dispatchEvent(clickEvent);
                                        }, 100);
                                        
                                        // 方式3：聚焦后按回车
                                        setTimeout(() => {
                                          console.log('尝试聚焦后按回车');
                                          modifySpecBtn.focus();
                                          const enterEvent = new KeyboardEvent('keydown', {
                                            key: 'Enter',
                                            code: 'Enter',
                                            keyCode: 13,
                                            which: 13,
                                            bubbles: true
                                          });
                                          modifySpecBtn.dispatchEvent(enterEvent);
                                        }, 200);
                                        
                                        console.log('按钮点击操作已执行');
                                      } catch (error) {
                                        console.error('点击按钮时出错:', error);
                                      }
                                      
                                      // 等待规格选择弹窗出现
                                      setTimeout(async () => {
                                        console.log('等待规格选择弹窗出现...');
                                        
                                        // 等待弹窗出现，最多重试10次
                                        let skuModal = null;
                                        let modalRetryCount = 0;
                                        const maxModalRetries = 10;
                                        
                                        while (modalRetryCount < maxModalRetries && !skuModal) {
                                          // 检查是否有规格选择弹窗
                                          skuModal = document.querySelector('body > div.d-modal-mask > div > div.d-modal-content');
                                          
                                          // 如果没有找到，尝试其他选择器
                                          if (!skuModal) {
                                            skuModal = document.querySelector('.d-modal-mask .d-modal-content');
                                          }
                                          
                                          if (!skuModal) {
                                            skuModal = document.querySelector('.d-modal-mask');
                                          }
                                          
                                          if (!skuModal) {
                                            console.log(`等待弹窗出现... (${modalRetryCount + 1}/${maxModalRetries})`);
                                            await new Promise(r => setTimeout(r, 500));
                                            modalRetryCount++;
                                          } else {
                                            console.log('找到规格选择弹窗');
                                            break;
                                          }
                                        }
                                        
                                        if (!skuModal) {
                                          console.error('等待超时，未找到规格选择弹窗');
                                        }
                                    
                                    if (skuModal) {
                                      console.log('发现规格选择弹窗');
                                      
                                      // 处理规格选择
                                      console.log('开始处理规格选择...');
                                      
                                      // 查找规格列表容器
                                      const variantList = skuModal.querySelector('.variant-list');
                                      if (!variantList) {
                                        console.error('未找到规格列表容器 .variant-list');
                                resolve(true);
                                        return;
                                      }
                                      
                                      // 获取所有规格选项
                                      const specOptions = variantList.querySelectorAll('span');
                                      console.log(`找到${specOptions.length}个规格选项`);
                                      
                                      // 步骤1：取消所有已选中的规格
                                      console.log('步骤1：取消所有已选中的规格');
                                      const checkedOptions = variantList.querySelectorAll('.d-radio-simulator.checked');
                                      console.log(`找到${checkedOptions.length}个已选中的规格`);
                                      
                                      for (const checkedOption of checkedOptions) {
                                        console.log('取消已选规格:', checkedOption.closest('span').textContent.trim());
                                        checkedOption.click();
                                        await new Promise(r => setTimeout(r, 300));
                                      }
                                      
                                      // 步骤2：选择指定的规格
                                      console.log('步骤2：选择指定的规格');
                                      let spec1Found = false;
                                      let spec2Found = false;
                                      
                                      // 遍历所有规格选项
                                      for (const specOption of specOptions) {
                                        const optionText = specOption.textContent.trim();
                                        const radioSimulator = specOption.querySelector('.d-radio-simulator');
                                        
                                        if (!radioSimulator) continue;
                                        
                                        // 检查是否匹配规格1
                                        if (productSpec1 && optionText === productSpec1) {
                                          console.log('找到匹配的规格1:', optionText);
                                          radioSimulator.click();
                                          spec1Found = true;
                                          await new Promise(r => setTimeout(r, 300));
                                        }
                                        
                                        // 检查是否匹配规格2
                                        if (productSpec2 && optionText === productSpec2) {
                                          console.log('找到匹配的规格2:', optionText);
                                          radioSimulator.click();
                                          spec2Found = true;
                                          await new Promise(r => setTimeout(r, 300));
                                        }
                                      }
                                      
                                      // 检查是否有未找到的规格
                                      if (productSpec1 && !spec1Found) {
                                        console.error('无法找到匹配的规格1:', productSpec1);
                                        window.specSelectionErrors = window.specSelectionErrors || [];
                                        window.specSelectionErrors.push({
                                          time: new Date().toISOString(),
                                          noteTitle: contentData.title,
                                          error: `无法找到匹配的规格1: ${productSpec1}`,
                                          specOptions: Array.from(specOptions).map(opt => opt.textContent.trim())
                                        });
                                      }
                                      
                                      if (productSpec2 && !spec2Found) {
                                        console.error('无法找到匹配的规格2:', productSpec2);
                                        window.specSelectionErrors = window.specSelectionErrors || [];
                                        window.specSelectionErrors.push({
                                          time: new Date().toISOString(),
                                          noteTitle: contentData.title,
                                          error: `无法找到匹配的规格2: ${productSpec2}`,
                                          specOptions: Array.from(specOptions).map(opt => opt.textContent.trim())
                                        });
                                      }
                                      
                                      // 检查是否有规格选择错误
                                      const hasError = window.specSelectionErrors && 
                                                       window.specSelectionErrors.some(err => 
                                                         err.noteTitle === contentData.title);
                                                         
                                      if (hasError) {
                                        console.error('存在规格选择错误，取消发布');
                                        
                                        // 尝试关闭弹窗
                                        const cancelBtn = skuModal.querySelector('.cancel-btn');
                                        if (cancelBtn) {
                                          cancelBtn.click();
                                        }
                                        
                                        // 返回错误，将中断发布流程
                                        resolve({
                                          success: false, 
                                          error: '规格选择失败，请检查规格设置',
                                          skipPublish: true
                                        });
                                        return;
                                      }
                                      
                                      // 点击确定按钮
                                      setTimeout(async () => {
                                        // 查找确定按钮
                                        let confirmBtn = null;
                                        
                                        // 通过文本内容查找确定按钮
                                        const allButtons = skuModal.querySelectorAll('button');
                                        for (const btn of allButtons) {
                                          const btnText = btn.textContent || btn.innerText || '';
                                          if (btnText.includes('确定') || btnText.includes('确认') || btnText.includes('完成') || btnText.includes('保存')) {
                                            confirmBtn = btn;
                                            console.log('找到确定按钮:', btnText);
                                            break;
                                          }
                                        }
                                        if (confirmBtn) {
                                          console.log('点击确定按钮');
                                          confirmBtn.click();
                                        } else {
                                          console.log('未找到确定按钮');
                                        }
                                        resolve(true);
                                        }, 1000);
                                      } else {
                                        console.log('未发现规格选择弹窗，商品可能没有规格选项');
                                        resolve(true);
                                      }
                                    }, 2000);
                                  } else {
                                    if (!modifySpecBtn) {
                                      console.log('未找到修改规格按钮，跳过规格选择');
                                    } else if (!productSpec1 && !productSpec2) {
                                      console.log('没有设置规格值，跳过规格选择');
                                    } else {
                                      console.log('未知原因，跳过规格选择');
                                    }
                                    if (!modifySpecBtn && (productSpec1 || productSpec2)) {
                                      // 记录错误
                                      window.specSelectionErrors = window.specSelectionErrors || [];
                                      window.specSelectionErrors.push({
                                        time: new Date().toISOString(),
                                        noteTitle: contentData.title,
                                        error: '未找到修改规格按钮，无法设置商品规格'
                                      });
                                    }
                                    resolve(true);
                                  }
                                }, 3000);
                                } else {
                                  console.log('未找到商品结果项');
                                  resolve(true);
                                }
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
        noteData.productSpec,
        noteData.productSpec1,
        noteData.productSpec2
      ]
    });

    // 等待内容填写完成
    addLog('等待内容填写完成...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    // 检查是否有规格错误
    if (window.specSelectionErrors && window.specSelectionErrors.some(err => err.noteTitle === noteData.title)) {
      addLog(`第${index + 1}篇笔记的规格选择失败，跳过发布`, 'error');
      
      // 记录详细错误信息
      const errors = window.specSelectionErrors.filter(err => err.noteTitle === noteData.title);
      errors.forEach(err => {
        addLog(`错误: ${err.error}`, 'error');
        addLog(`可用选项: ${err.specOptions.join(', ')}`, 'info');
      });
      
      return false;
    }

    addLog(`第${index + 1}篇笔记发布准备完成，请手动点击发布按钮`, 'success');
    
    // 输出规格信息
    if (noteData.productSpec) {
      addLog(`商品规格设置为: ${noteData.productSpec}`, 'info');
    }
    
    if (noteData.productSpec1) {
      addLog(`商品规格1设置为: ${noteData.productSpec1}`, 'info');
    }
    
    if (noteData.productSpec2) {
      addLog(`商品规格2设置为: ${noteData.productSpec2}`, 'info');
    }
    
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
    
    // 添加商品规格1显示
    if (note.productSpec1) {
      const productSpec1Span = document.createElement('span');
      productSpec1Span.className = 'product-spec1';
      productSpec1Span.textContent = `商品规格1: ${note.productSpec1}`;
      productSpec1Span.style.fontSize = '12px';
      productSpec1Span.style.display = 'block';
      productSpec1Span.style.marginTop = '5px';
      productSpec1Span.style.color = '#007bff';
      productLink.parentNode.appendChild(productSpec1Span);
    }
    
    // 添加商品规格2显示
    if (note.productSpec2) {
      const productSpec2Span = document.createElement('span');
      productSpec2Span.className = 'product-spec2';
      productSpec2Span.textContent = `商品规格2: ${note.productSpec2}`;
      productSpec2Span.style.fontSize = '12px';
      productSpec2Span.style.display = 'block';
      productSpec2Span.style.marginTop = '5px';
      productSpec2Span.style.color = '#28a745';
      productLink.parentNode.appendChild(productSpec2Span);
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
      imageInput.value = ''; // 重置文件输入框
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
      
      // 创建商品规格1容器
      const productSpec1Container = document.createElement('div');
      productSpec1Container.className = 'product-spec-container';
      productSpec1Container.style.marginTop = '10px';
      
      // 创建商品规格1标签
      const productSpec1Label = document.createElement('label');
      productSpec1Label.textContent = '商品规格1:';
      productSpec1Label.style.display = 'block';
      productSpec1Label.style.marginBottom = '5px';
      productSpec1Container.appendChild(productSpec1Label);
      
      // 创建商品规格1输入框
      const productSpec1Input = document.createElement('input');
      productSpec1Input.type = 'text';
      productSpec1Input.className = 'product-spec1-input';
      productSpec1Input.value = note.productSpec1 || '';
      productSpec1Input.style.width = '100%';
      productSpec1Input.style.padding = '5px';
      productSpec1Input.style.boxSizing = 'border-box';
      productSpec1Input.addEventListener('change', (e) => {
        handleNoteChange(index, 'productSpec1', e.target.value);
      });
      productSpec1Container.appendChild(productSpec1Input);
      
      // 创建商品规格2容器
      const productSpec2Container = document.createElement('div');
      productSpec2Container.className = 'product-spec-container';
      productSpec2Container.style.marginTop = '10px';
      
      // 创建商品规格2标签
      const productSpec2Label = document.createElement('label');
      productSpec2Label.textContent = '商品规格2:';
      productSpec2Label.style.display = 'block';
      productSpec2Label.style.marginBottom = '5px';
      productSpec2Container.appendChild(productSpec2Label);
      
      // 创建商品规格2输入框
      const productSpec2Input = document.createElement('input');
      productSpec2Input.type = 'text';
      productSpec2Input.className = 'product-spec2-input';
      productSpec2Input.value = note.productSpec2 || '';
      productSpec2Input.style.width = '100%';
      productSpec2Input.style.padding = '5px';
      productSpec2Input.style.boxSizing = 'border-box';
      productSpec2Input.addEventListener('change', (e) => {
        handleNoteChange(index, 'productSpec2', e.target.value);
      });
      productSpec2Container.appendChild(productSpec2Input);
      
      // 将商品规格容器添加到商品ID容器后面
      productIdContainer.parentNode.insertBefore(productSpecContainer, productIdContainer.nextSibling);
      productIdContainer.parentNode.insertBefore(productSpec1Container, productSpecContainer.nextSibling);
      productIdContainer.parentNode.insertBefore(productSpec2Container, productSpec1Container.nextSibling);
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
    Object.entries(notes[index].imageUrls).forEach(([imageIndex, imageData]) => {
      if (!imageData) return;
      
      // 处理不同格式的图片数据
      let dataUrl;
      let filename = '';
      
      if (typeof imageData === 'string') {
        // 旧格式：直接是base64字符串
        dataUrl = imageData;
      } else if (typeof imageData === 'object') {
        // 新格式：对象包含blob, url和filename
        if (imageData.url && typeof imageData.url === 'string') {
          dataUrl = imageData.url;
        } else if (imageData.blob instanceof Blob) {
          // 我们在创建预览时不需要将blob转为base64，只有在实际发布时才需要
          // 这里直接使用blobUrl
          if (!imageData.url) {
            imageData.url = URL.createObjectURL(imageData.blob);
          }
          dataUrl = imageData.url;
        }
        
        // 保存文件名用于显示
        filename = imageData.filename || `image_${parseInt(imageIndex) + 1}.jpg`;
      }
      
      if (!dataUrl) return;
      
      const previewData = {
        index: parseInt(imageIndex),
        dataUrl,
        name: filename
      };
      
      const wrapper = createImagePreview(previewData, parseInt(imageIndex), panel, index);
      
      // 在预览中显示文件名提示
      if (filename) {
        const nameLabel = document.createElement('span');
        nameLabel.className = 'image-filename';
        nameLabel.textContent = filename;
        nameLabel.style.position = 'absolute';
        nameLabel.style.bottom = '0';
        nameLabel.style.left = '0';
        nameLabel.style.right = '0';
        nameLabel.style.fontSize = '8px';
        nameLabel.style.background = 'rgba(0,0,0,0.5)';
        nameLabel.style.color = 'white';
        nameLabel.style.padding = '2px';
        nameLabel.style.textOverflow = 'ellipsis';
        nameLabel.style.overflow = 'hidden';
        nameLabel.style.whiteSpace = 'nowrap';
        wrapper.appendChild(nameLabel);
      }
      
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
  } else if (field === 'productSpec1') {
    notes[index].productSpec1 = value;
  } else if (field === 'productSpec2') {
    notes[index].productSpec2 = value;
  }
  
  // 保存修改
  saveState();
}

// 修改图片处理相关函数，添加状态保存
async function handleImageUpload(files, index, panel) {
  if (!files || files.length === 0) return;
  
  const imagePreview = panel.querySelector('.preview-images');
  if (!imagePreview) return;
  
  // 清空当前笔记的图片
  notes[index].images = [];
  notes[index].imageUrls = {};
  imagePreview.innerHTML = '';
  
  addLog(`选择了 ${files.length} 张图片`);
  
  try {
    // 将FileList转换为数组
    const fileArray = Array.from(files);
    
    // 提取文件名中的数字并排序
    const sortedFiles = fileArray.sort((a, b) => {
      // 从文件名中提取数字
      const getNumberFromFilename = (filename) => {
        if (!filename) return Infinity;
        
        // 先尝试提取数字模式
        const matches = filename.match(/\d+/g);
        if (matches && matches.length > 0) {
          // 从找到的所有数字中选择最合适的排序数字
          // 1. 如果有"稿定设计-数字"格式，优先使用该数字
          const designNumberMatch = filename.match(/[稿设计定][\s\-_]*(\d+)/);
          if (designNumberMatch && designNumberMatch[1]) {
            return parseInt(designNumberMatch[1]);
          }
          
          // 2. 如果有"数字.jpg"这样的格式，使用该数字
          const extensionNumberMatch = filename.match(/(\d+)\.[a-zA-Z]+$/);
          if (extensionNumberMatch && extensionNumberMatch[1]) {
            return parseInt(extensionNumberMatch[1]);
          }
          
          // 3. 默认使用找到的第一个数字
          return parseInt(matches[0]);
        }
        
        return Infinity; // 没有数字的排在后面
      };
      
      const numA = getNumberFromFilename(a.name);
      const numB = getNumberFromFilename(b.name);
      
      // 记录排序日志
      console.log(`排序上传图片: ${a.name} (${numA}) vs ${b.name} (${numB})`);
      
      return numA - numB; // 按数字升序排序
    });
    
    addLog(`图片已按文件名中的数字排序`);
    
    // 加载所有排序后的图片
    const loadedImages = await Promise.all(sortedFiles.map((file, i) => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve({
          index: i,
          file,
          dataUrl: e.target.result,
          name: file.name // 保存文件名用于显示
        });
        reader.readAsDataURL(file);
      });
    }));
    
    // 处理加载的图片
    loadedImages.forEach((imageData, i) => {
      notes[index].images[i] = imageData.file;
      notes[index].imageUrls[i] = imageData.dataUrl;
      
      const wrapper = createImagePreview(imageData, i, panel, index);
      
      // 在预览中显示文件名提示
      const nameLabel = document.createElement('span');
      nameLabel.className = 'image-filename';
      nameLabel.textContent = imageData.name;
      nameLabel.style.position = 'absolute';
      nameLabel.style.bottom = '0';
      nameLabel.style.left = '0';
      nameLabel.style.right = '0';
      nameLabel.style.fontSize = '8px';
      nameLabel.style.background = 'rgba(0,0,0,0.5)';
      nameLabel.style.color = 'white';
      nameLabel.style.padding = '2px';
      nameLabel.style.textOverflow = 'ellipsis';
      nameLabel.style.overflow = 'hidden';
      nameLabel.style.whiteSpace = 'nowrap';
      wrapper.appendChild(nameLabel);
      
      imagePreview.appendChild(wrapper);
      addLog(`已加载第 ${i + 1} 张图片: ${imageData.name}`);
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
    } else if (message.type === 'PUBLISH_COMPLETED') {
      // 处理笔记发布完成消息
      addLog(`笔记《${message.data.noteTitle}》发布完成`, 'success', `ID: ${message.data.noteId}`);
      
      // 更新飞书状态
      if (window.feishuClient && notes.length > 0) {
        try {
          // 查找当前笔记在notes数组中的索引
          const noteIndex = notes.findIndex(note => 
            note.title === message.data.noteTitle || 
            (message.data.from && note.id === message.data.from)
          );
          
          if (noteIndex !== -1) {
            const note = notes[noteIndex];
            // 调用飞书客户端更新发布状态
            window.feishuClient.updatePublishStatus(note.recordId || note.id, note.title, true)
              .then(() => {
                addLog(`飞书状态更新成功: ${note.title}`, 'success');
              })
              .catch(error => {
                addLog(`飞书状态更新失败: ${error.message}`, 'error');
                console.error('[增强日志] 更新飞书状态失败:', error);
              });
          } else {
            console.log('[增强日志] 找不到匹配的笔记进行飞书状态更新:', message);
          }
        } catch (error) {
          console.error('[增强日志] 处理发布完成消息出错:', error);
        }
      }
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
    
    // 处理图片数据
    addLog('开始处理图片数据...', 'step');
    for (let noteIndex = 0; noteIndex < notesWithImages.length; noteIndex++) {
      const note = notesWithImages[noteIndex];
      if (!note.recordId) {
        note.recordId = `temp_${Date.now()}_${noteIndex}`;
      }
      
      // 确保图片数组存在
      if (note.images && Array.isArray(note.images) && note.images.length > 0) {
        addLog(`处理笔记 ${noteIndex + 1}/${notesWithImages.length}: ${note.title}`, 'info');
        
        // 创建存储图片的数组
        if (!note.localImages) {
          note.localImages = [];
        }
        
        // 为每张图片处理数据
        for (let imgIndex = 0; imgIndex < note.images.length; imgIndex++) {
          const img = note.images[imgIndex];
          if (!img) continue;
          
          try {
            // 获取blob数据
            let blob = img.blob || img.data;
            if (!blob && img.url) {
              try {
                const response = await fetch(img.url);
                blob = await response.blob();
              } catch (e) {
                console.error(`无法从URL获取图片: ${e.message}`);
                continue;
              }
            }
            
            // 如果没有有效blob，跳过
            if (!blob || !(blob instanceof Blob)) {
              console.warn(`笔记 ${noteIndex + 1} 的第 ${imgIndex + 1} 张图片没有有效数据`);
              continue;
            }
            
            // 生成文件名
            let filename = '';
            if (img.filename) {
              filename = img.filename;
            } else if (img.name) {
              filename = img.name;
            } else {
              filename = `image_${imgIndex + 1}.jpg`;
            }
            
            // 确保文件名是安全的
            filename = filename.replace(/[^\w\s.-]/gi, '_');
            
            // 将Blob转换为Base64
            const base64Data = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
            
            // 保存内存中的图片数据引用 - 简化数据结构，只保存必要信息
            note.localImages.push({
              index: imgIndex,
              filename: filename,
              base64: base64Data,
              // 移除blob引用，与本地上传保持一致，避免消息过大
              // blob: blob,
              processed: true
            });
            
            addLog(`已处理笔记 ${noteIndex + 1} 的第 ${imgIndex + 1} 张图片: ${filename}`, 'info');
          } catch (err) {
            console.error(`处理图片失败:`, err);
            addLog(`处理笔记 ${noteIndex + 1} 的第 ${imgIndex + 1} 张图片失败: ${err.message}`, 'error');
          }
        }
        
        addLog(`笔记 "${note.title}" 的 ${note.localImages.length} 张图片已处理完成`, 'success');
      }
    }
    
    // 提示用户图片处理完成
    addLog('所有图片已处理完成，准备导入数据', 'success');
    
    // 显示操作指南
    const logArea = document.getElementById('log');
    if (logArea) {
      const guideDiv = document.createElement('div');
      guideDiv.innerHTML = `
        <div style="border:2px solid #4CAF50; padding:10px; margin:10px 0; background:#E8F5E9;">
          <h3 style="color:#2E7D32; margin-top:0;">操作指南：</h3>
          <ol style="padding-left:20px;">
            <li>所有图片已自动处理完成，无需手动操作</li>
            <li>选择要发布的笔记</li>
            <li>点击"发布笔记"按钮即可发布</li>
          </ol>
          <p>发布过程会自动使用已处理的图片数据</p>
        </div>
      `;
      logArea.appendChild(guideDiv);
    }
    
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
      
      // 收集图片数据 - 直接使用处理好的base64数据
      const images = {}; // 改为空对象，与本地上传保持一致
      const imageUrls = {};
      
      if (note.localImages && Array.isArray(note.localImages) && note.localImages.length > 0) {
        // 按文件名中的数字排序图片
        note.localImages.sort((a, b) => {
          // 从文件名中提取数字
          const getNumberFromFilename = (filename) => {
            if (!filename) return Infinity;
            
            // 先尝试提取数字模式
            const matches = filename.match(/\d+/g);
            if (matches && matches.length > 0) {
              // 从找到的所有数字中选择最合适的排序数字
              // 1. 如果有"稿定设计-数字"格式，优先使用该数字
              const designNumberMatch = filename.match(/[稿设计定][\s\-_]*(\d+)/);
              if (designNumberMatch && designNumberMatch[1]) {
                return parseInt(designNumberMatch[1]);
              }
              
              // 2. 如果有"数字.jpg"这样的格式，使用该数字
              const extensionNumberMatch = filename.match(/(\d+)\.[a-zA-Z]+$/);
              if (extensionNumberMatch && extensionNumberMatch[1]) {
                return parseInt(extensionNumberMatch[1]);
              }
              
              // 3. 默认使用找到的第一个数字
              return parseInt(matches[0]);
            }
            
            return Infinity; // 没有数字的排在后面
          };
          
          const numA = getNumberFromFilename(a.filename);
          const numB = getNumberFromFilename(b.filename);
          
          console.log(`排序飞书图片: ${a.filename} (${numA}) vs ${b.filename} (${numB})`);
          
          return numA - numB; // 按数字升序排序
        });
        
        addLog(`飞书图片已按文件名中的数字排序`, 'info');
        
        // 将排序后的图片数据保存到对应数组
        for (let i = 0; i < note.localImages.length; i++) {
          const img = note.localImages[i];
          // 直接使用已经转换好的base64数据
          if (img.base64) {
            imageUrls[i] = img.base64; // 只保存base64字符串
            addLog(`已获取第 ${i + 1} 张排序后的图片: ${img.filename}`, 'success');
          } else {
            addLog(`第 ${i + 1} 张图片缺少base64数据`, 'warning');
            imageUrls[i] = '';
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
        productSpec1: note.productSpec1 || '', // 添加商品规格1字段
        productSpec2: note.productSpec2 || '', // 添加商品规格2字段
        images: images, // 空对象，与本地上传保持一致
        imageUrls: imageUrls, // 只包含base64字符串
        recordId: note.recordId || null, // 保存记录ID，用于发布后更新状态
        from: 'feishu', // 标记来源为飞书
        id: Date.now() + '_' + Math.random().toString(36).substring(2, 9) // 生成唯一ID
      };
    }));
    
    // 保存状态
    await saveState();
    
    // 更新UI
    updateNotePanels();
    
    addLog(`成功导入 ${notes.length} 篇笔记，包含 ${notesWithImages.reduce((count, note) => count + (note.localImages ? note.localImages.length : 0), 0)} 张图片`, 'success');
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
          
          // 标记该笔记为已发布
          notes[index].published = true;
          
          // 如果是从飞书导入的笔记，更新飞书状态
          if (note.from === 'feishu' && note.recordId && window.feishuClient) {
            try {
              await window.feishuClient.updatePublishStatus(note.recordId, note.title, 'published');
              addLog(`已更新飞书中的发布状态: ${note.title}`, 'success');
              
              // 如果有本地下载的图片，标记为已处理
              if (note.localImages && note.localImages.length > 0) {
                note.localImagesProcessed = true;
                addLog(`笔记 "${note.title}" 的本地图片已标记为已处理，建议手动清理下载文件夹`, 'info');
              }
            } catch (updateError) {
              addLog(`更新飞书发布状态失败: ${updateError.message}`, 'warning');
            }
          }
          
          // 保存状态
          await saveState();
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
    const imageInput = panel.querySelector('input[type="file"]');
    const selectImageBtn = panel.querySelector('.select-images');
    const clearImagesBtn = panel.querySelector('.clear-images');
    const imagePreview = panel.querySelector('.preview-images');

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
        saveState();
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

        // 检查积分（MVP功能）
        const pointsCheckResult = await checkAndDeductPoints(1); // 消费1积分
        if (!pointsCheckResult) {
          addLog('积分检查失败，无法开始发布', 'error');
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
  
  // 清空规格选择错误
  window.specSelectionErrors = [];
  
  // 添加提示
  addLog('日志已清空', 'success');
}

// 添加下载日志的函数
function downloadLogs() {
  try {
    // 获取所有日志内容
    const logPanel = document.getElementById('logPanel');
    if (!logPanel || !logPanel.childNodes.length) {
      addLog('没有可下载的日志', 'warning');
      return;
    }
    
    // 构建日志文本
    let logText = '=== 小红书发布插件日志 ===\n';
    logText += `导出时间: ${new Date().toLocaleString()}\n\n`;
    
    // 添加普通日志
    Array.from(logPanel.childNodes).forEach(node => {
      if (node.textContent) {
        logText += node.textContent + '\n';
      }
    });
    
    // 如果有规格选择错误，添加到日志
    if (window.specSelectionErrors && window.specSelectionErrors.length > 0) {
      logText += '\n\n=== 规格选择错误详情 ===\n';
      window.specSelectionErrors.forEach((err, index) => {
        logText += `\n[错误 ${index + 1}]\n`;
        logText += `时间: ${err.time}\n`;
        logText += `笔记标题: ${err.noteTitle}\n`;
        logText += `错误信息: ${err.error}\n`;
        logText += `可用选项: ${err.specOptions ? err.specOptions.join(', ') : '无'}\n`;
      });
    }
    
    // 创建Blob对象
    const blob = new Blob([logText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    // 创建下载链接
    const a = document.createElement('a');
    a.href = url;
    a.download = `小红书发布插件日志_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    
    // 清理
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
    
    addLog('日志已下载', 'success');
  } catch (error) {
    console.error('下载日志失败:', error);
    addLog(`下载日志失败: ${error.message}`, 'error');
  }
}

// 监听来自background的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'STATUS_UPDATE':
      updatePublishStatus(message.data);
      break;
    case 'PUBLISH_COMPLETED':
      handlePublishCompleted(message.data);
      break;
    case 'POINTS_UPDATED':
      // 更新积分显示
      if (window.pointsManager) {
        window.pointsManager.pointsData = message.data;
        window.pointsManager.updatePointsDisplay();
      }
      break;
  }
});

// 处理发布完成事件
function handlePublishCompleted(data) {
  addLog(`笔记发布完成: ${data.noteTitle}`, 'success');
  // 可以在这里添加其他处理逻辑
}

// ==================== MVP积分管理功能 ====================

// MVP功能初始化
async function initMVPFeatures() {
  console.log('初始化MVP功能');
  
  // 初始化登录状态
  await checkLoginStatus();
  
  // 绑定登录相关事件
  setupLoginEventListeners();
  
  // 设置积分定时刷新
  setupPointsRefresh();
  
  // 监听来自background的消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'LOGIN_STATUS_CHANGED') {
      updateLoginStatusUI(message.data.isLoggedIn);
    }
  });
  
  // 监听Chrome存储变化，检测token更新
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.authToken) {
      const oldValue = changes.authToken.oldValue;
      const newValue = changes.authToken.newValue;
      
      console.log('检测到authToken变化:', { oldValue: !!oldValue, newValue: !!newValue });
      
      // 如果token被设置
      if (newValue && !oldValue) {
        updateLoginStatusUI(true);
        loadPoints();
      } 
      // 如果token被清除
      else if (!newValue && oldValue) {
        updateLoginStatusUI(false);
      }
    }
  });
}

// 检查登录状态
async function checkLoginStatus() {
  try {
    const result = await chrome.storage.local.get(['authToken']);
    const authToken = result.authToken;
    
    if (authToken) {
      updateLoginStatusUI(true);
      await loadPoints();
    } else {
      updateLoginStatusUI(false);
    }
  } catch (error) {
    console.error('检查登录状态失败:', error);
    updateLoginStatusUI(false);
  }
}

// 更新登录状态UI
function updateLoginStatusUI(isLoggedIn) {
  const loginStatus = document.getElementById('loginStatus');
  const statusText = document.getElementById('statusText');
  const loginBtn = document.getElementById('loginBtn');
  const userMenu = document.getElementById('userMenu');
  
  if (isLoggedIn) {
    loginStatus.className = 'login-status logged-in';
    statusText.textContent = '已登录';
    loginBtn.style.display = 'none';
    userMenu.style.display = 'block';
  } else {
    loginStatus.className = 'login-status logged-out';
    statusText.textContent = '未登录';
    loginBtn.style.display = 'block';
    userMenu.style.display = 'none';
  }
}

// 绑定登录相关事件
function setupLoginEventListeners() {
  const loginBtn = document.getElementById('loginBtn');
  const userMenuBtn = document.getElementById('userMenuBtn');
  const userDropdown = document.getElementById('userDropdown');
  
  // 登录按钮点击事件
  if (loginBtn) {
    loginBtn.addEventListener('click', openLogin);
  }
  
  // 用户菜单按钮点击事件
  if (userMenuBtn) {
    userMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      userDropdown.classList.toggle('show');
    });
  }
  
  // 点击其他地方关闭下拉菜单
  document.addEventListener('click', () => {
    if (userDropdown) {
      userDropdown.classList.remove('show');
    }
  });
}

// 加载积分信息
async function loadPoints() {
  try {
    const result = await chrome.storage.local.get(['authToken']);
    const authToken = result.authToken;
    
    if (!authToken) {
      console.log('未找到authToken');
      return;
    }
    
    // 替换为实际的域名
    const API_BASE_URL = 'https://xhspay.zeabur.app';
    
    const response = await fetch(`${API_BASE_URL}/api/points`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.success) {
        // 更新积分显示
        const currentPointsElement = document.getElementById('currentPoints');
        if (currentPointsElement) {
          currentPointsElement.textContent = data.points.current;
        }
        
        // 保存到本地存储
        await chrome.storage.local.set({ 
          pointsData: data.points,
          lastPointsUpdate: Date.now()
        });
        
        console.log('积分加载成功:', data.points);
      } else {
        console.error('获取积分失败:', data);
      }
    } else {
      console.error('积分请求失败:', response.status);
      // 如果是401，可能是token过期，清除登录状态
      if (response.status === 401) {
        await logout();
      }
    }
  } catch (error) {
    console.error('加载积分失败:', error);
  }
}

// 设置积分定时刷新
function setupPointsRefresh() {
  // 每60秒刷新一次积分
  setInterval(async () => {
    const result = await chrome.storage.local.get(['authToken']);
    if (result.authToken) {
      await loadPoints();
    }
  }, 60000);
}

// 打开登录页面
function openLogin() {
  const loginUrl = 'https://xhspay.zeabur.app/';
  window.open(loginUrl, '_blank');
}

// 打开网站
function openWebsite() {
  const websiteUrl = 'https://xhspay.zeabur.app/dashboard';
  window.open(websiteUrl, '_blank');
}

// 退出登录
async function logout() {
  try {
    // 清除本地存储
    await chrome.storage.local.remove(['authToken', 'pointsData']);
    
    // 通知background
    chrome.runtime.sendMessage({
      type: 'CLEAR_AUTH_TOKEN'
    }).catch(() => {});
    
    // 更新UI
    updateLoginStatusUI(false);
    
    // 重置积分显示
    const currentPointsElement = document.getElementById('currentPoints');
    if (currentPointsElement) {
      currentPointsElement.textContent = '0';
    }
    
    addLog('已退出登录', 'info');
  } catch (error) {
    console.error('退出登录失败:', error);
  }
}

// 检查积分并消费（用于发布前检查）
async function checkAndDeductPoints(points = 1) {
  try {
    const result = await chrome.storage.local.get(['authToken']);
    const authToken = result.authToken;
    
    if (!authToken) {
      alert('请先登录');
      return false;
    }
    
    const API_BASE_URL = 'https://xhspay.zeabur.app';
    
    const response = await fetch(`${API_BASE_URL}/api/points/use`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        points: points,
        actionType: 'publish_note',
        description: '发布笔记'
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.success) {
        // 更新积分显示
        const currentPointsElement = document.getElementById('currentPoints');
        if (currentPointsElement) {
          currentPointsElement.textContent = data.afterPoints;
        }
        
        // 保存新的积分数据
        await chrome.storage.local.set({ 
          pointsData: {
            current: data.afterPoints,
            totalConsumed: data.beforePoints - data.afterPoints + data.afterPoints,
            totalRecharged: 0
          }
        });
        
        addLog(`积分消费成功: 消费${points}积分，剩余${data.afterPoints}积分`, 'success');
        return true;
      } else {
        alert(data.error || '积分消费失败');
        return false;
      }
    } else {
      const errorData = await response.json();
      if (response.status === 400 && errorData.error === '积分不足') {
        alert('积分不足，请先充值');
        openWebsite();
      } else {
        alert('积分消费失败，请重试');
      }
      return false;
    }
  } catch (error) {
    console.error('积分消费失败:', error);
    alert('网络错误，请检查网络连接');
    return false;
  }
}

// 添加状态显示更新函数

