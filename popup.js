// 修改笔记数据存储，改为动态数组
let notes = [];
let isPublishing = false;

// 在文件开头添加图片数组用于跟踪顺序
let selectedImages = [];
let imagePreviewUrls = {};

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
  await restoreState();
  setupStateListeners();
  
  console.log('页面加载完成');

  // 选择文件按钮
  const fileInput = document.getElementById('fileInput');
  const readFileBtn = document.getElementById('readFile');
  const startButton = document.getElementById('startButton');
  const stopButton = document.getElementById('stopButton');
  
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
    selectImageBtn.addEventListener('click', () => {
      imageInput.click();
    });

    // 图片选择处理
    imageInput.onchange = async function() {
      if (this.files.length === 0) return;

      const files = Array.from(this.files);
      addLog(`选择了 ${files.length} 张图片`);
      
      try {
        // 加载所有图片
        const loadedImages = await Promise.all(files.map((file, i) => {
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
        
        // 清空当前笔记的图片（移到这里，确保新图片加载成功后再清空）
        notes[index].images = [];
        notes[index].imageUrls = {};
        imagePreview.innerHTML = '';
        
        // 处理加载的图片
        loadedImages.forEach((imageData, i) => {
          // 保存图片数据
          notes[index].images[i] = imageData.file;
          notes[index].imageUrls[i] = imageData.dataUrl;
          
          // 创建并添加预览元素
          const wrapper = createImagePreview(imageData, i, panel, index);
          
          // 确保 imagePreview 存在
          if (!imagePreview.isConnected) {
            panel.querySelector('.image-preview').appendChild(wrapper);
          } else {
            imagePreview.appendChild(wrapper);
          }
          
          addLog(`已加载第 ${i + 1} 张图片`);
        });

        // 保存图片数据到本地存储
        try {
          const noteImages = {
            images: notes[index].images,
            imageUrls: notes[index].imageUrls
          };
          localStorage.setItem(`note_${index}_images`, JSON.stringify(noteImages));
        } catch (error) {
          console.error('保存图片数据失败:', error);
        }

        addLog(`共加载 ${loadedImages.length} 张图片`, 'success');
      } catch (error) {
        addLog(`加载图片失败: ${error.message}`, 'error');
      }
    };

    // 清除图片按钮点击事件
    clearImagesBtn.addEventListener('click', () => {
      notes[index].images = [];
      notes[index].imageUrls = {};
      imagePreview.innerHTML = '';
      imageInput.value = ''; // 重置文件输入框
      addLog('已清除所有图片');
    });
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
  fixedIntervalInput.addEventListener('change', () => {
    publishConfig.fixedInterval = parseInt(fixedIntervalInput.value) * 60;
  });

  // 处理随机间隔范围输入
  minIntervalInput.addEventListener('change', () => {
    publishConfig.minInterval = parseInt(minIntervalInput.value) * 60;
  });

  maxIntervalInput.addEventListener('change', () => {
    publishConfig.maxInterval = parseInt(maxIntervalInput.value) * 60;
  });

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

  // 监听来自 background 的消息
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

  // 检查是否正在发布，如果是则启动状态更新
  try {
    const state = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
    if (state.isPublishing) {
      isPublishing = true;
      addLog('发布任务正在进行中...', 'info');
      startStatusUpdates();
      
      // 显示停止按钮，隐藏开始按钮
      updateButtonStatus(true);
    }
  } catch (error) {
    console.error('检查发布状态失败:', error);
  }

  setupMessageListener();
  
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
      function: (contentData, productId) => {
        return new Promise((resolve) => {
          // 在网页上下文中定义日志函数
          function webLog(message) {
            console.log(`${new Date().toLocaleTimeString()}: ${message}`);
          }

          // 点击正文编辑器
          setTimeout(() => {
            webLog('点击正文编辑器');
            const editor = document.querySelector('#quillEditor > div');
            if (editor) {
              editor.click();
              editor.focus();
              webLog('清空编辑器内容');
              editor.innerHTML = '';

              // 先填写标题
              const titleInput = document.querySelector('#web > div.outarea.publish-c > div > div > div > div.body > div.content > div.input.titleInput > div.d-input-wrapper.d-inline-block.c-input_inner > div > input');
              if (titleInput) {
                titleInput.value = contentData.title;
                titleInput.dispatchEvent(new Event('input', { bubbles: true }));
              }

              // 分行处理正文
              const lines = contentData.body.split('\n');
              let currentLine = 0;

              function typeLine() {
                if (currentLine < lines.length) {
                  webLog(`开始输入正文第${currentLine + 1}行`);
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

                  // 如果是空行，直接进入下一行
                  if (line.trim() === '') {
                    currentLine++;
                    setTimeout(typeLine, 100);
                    return;
                  }

                  // 逐字符输入当前行
                  let charIndex = 0;
                  function typeChar() {
                    if (charIndex < line.length) {
                      document.execCommand('insertText', false, line[charIndex]);
                      editor.dispatchEvent(new Event('input', { bubbles: true }));
                      charIndex++;
                      setTimeout(typeChar, 50);
                    } else {
                      webLog(`正文第${currentLine + 1}行输入完成`);
                      currentLine++;
                      setTimeout(typeLine, 100);
                    }
                  }
                  typeChar();
                } else {
                  webLog('正文输入完成');
                  webLog('开始添加标签');
                  setTimeout(startAddingTags, 100);
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
                    webLog(`开始输入标签：${tag}`);
                    
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
                        webLog('等待标签下拉框出现');
                        // 等待2秒让下拉框出现
                        setTimeout(() => {
                          webLog('选择标签关键词');
                          // 按回车选择标签
                          editor.dispatchEvent(new KeyboardEvent('keydown', {
                            key: 'Enter',
                            code: 'Enter',
                            keyCode: 13,
                            which: 13,
                            bubbles: true
                          }));
                          
                          // 继续下一个标签
                          setTimeout(() => {
                            currentIndex++;
                            addNextTag();
                          }, 1000);
                        }, 2000);
                      }
                    }
                    typeChar();
                  } else {
                    webLog('标签输入完成');
                    // 添加这行检查
                    webLog(`检查商品ID: ${productId}`);
                    
                    // 处理商品链接
                    if (productId) {
                      webLog('开始添加商品链接');
                      setTimeout(() => {
                        // 1. 点击添加商品按钮
                        const addProductButton = document.querySelector('#web > div.outarea.publish-c > div > div > div > div.body > div.content > div.media-commodity > div > div > div > div > div > div > div.multi-good-select-empty-btn > button > div > span');
                        if (addProductButton) {
                          addProductButton.click();
                          console.log('已点击添加商品按钮');

                          // 2. 等待弹窗出现并点击搜索商品ID按钮
                          setTimeout(() => {
                            const searchButton = document.querySelector('body > div.d-modal-mask > div > div.d-modal-content > div > div.d-grid > div:nth-child(2) > div > div > div');
                            if (searchButton) {
                              searchButton.click();
                              console.log('已点击搜索商品ID按钮');

                              // 3. 等待输入框出现并输入商品ID
                              setTimeout(() => {
                                const searchInput = document.querySelector('body > div.d-modal-mask > div > div.d-modal-content > div > div.d-grid > div:nth-child(2) > div > div > div > div');
                                if (searchInput) {
                                  // 聚焦输入框并输入商品ID
                                  searchInput.focus();
                                  document.execCommand('insertText', false, productId);
                                  searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                                  console.log('已输入商品ID');

                                  // 4. 等待搜索结果并勾选商品
                                  setTimeout(() => {
                                    const checkboxSpan = document.querySelector('body > div.d-modal-mask > div > div.d-modal-content > div > div.goods-list-container > div.goods-list-normal > div > div.good-card-container > div.d-grid.d-checkbox.d-checkbox-main.d-clickable.good-selected > span');
                                    if (checkboxSpan) {
                                      checkboxSpan.click();
                                      console.log('已勾选商品');

                                      // 5. 点击保存按钮
                                      setTimeout(() => {
                                        const saveButton = document.querySelector('body > div.d-modal-mask > div > div.d-modal-footer > div > button > div');
                                        if (saveButton) {
                                          saveButton.click();
                                          console.log('已点击保存按钮');
                                          
                                          // 等待保存完成后再点击发布按钮
                                          setTimeout(() => {
                                            const publishButton = document.querySelector('#web > div.outarea.publish-c > div > div > div > div.submit > div > button.d-button.d-button-large.--size-icon-large.--size-text-h6.d-button-with-content.--color-static.bold.--color-bg-fill.--color-text-paragraph.custom-button.red.publishBtn > div');
                                            if (publishButton) {
                                              publishButton.click();
                                              webLog('已点击发布按钮');
                                              resolve(true);
                                            } else {
                                              webLog('未找到发布按钮');
                                              resolve(false);
                                            }
                                          }, 2000);
                                        } else {
                                          console.log('未找到保存按钮');
                                          resolve(false);
                                        }
                                      }, 1000);
                                    } else {
                                      console.log('未找到商品勾选框');
                                      resolve(false);
                                    }
                                  }, 2000);
                                } else {
                                  console.log('未找到商品ID输入框');
                                  resolve(false);
                                }
                              }, 1000);
                            } else {
                              console.log('未找到搜索商品ID按钮');
                              resolve(false);
                            }
                          }, 1000);
                        } else {
                          console.log('未找到添加商品按钮');
                          resolve(false);
                        }
                      }, 1000);
                    } else {
                      // 如果没有商品ID，直接点击发布按钮
                      setTimeout(() => {
                        const publishButton = document.querySelector('#web > div.outarea.publish-c > div > div > div > div.submit > div > button.d-button.d-button-large.--size-icon-large.--size-text-h6.d-button-with-content.--color-static.bold.--color-bg-fill.--color-text-paragraph.custom-button.red.publishBtn > div');
                        if (publishButton) {
                          publishButton.click();
                          webLog('已点击发布按钮');
                          resolve(true);
                        } else {
                          webLog('未找到发布按钮');
                          resolve(false);
                        }
                      }, 1000);
                    }
                  }
                }
                addNextTag();
              }
            } else {
              webLog('未找到编辑器');
              resolve(false);
            }
          }, 1000);
        });
      },
      args: [noteData, productId]
    });

    // 等待内容填写和商品链接添加完成
    await new Promise(resolve => setTimeout(resolve, 30000));

    // 等待发布完成
    await new Promise(resolve => setTimeout(resolve, 5000));
    addLog(`第${index + 1}篇笔记发布完成`, 'success');
    
    // 如果还有下一篇笔记，显示等待信息
    if (index < notes.length - 1) {
      const nextWaitInterval = countdownTimers[index + 1];
      const minutes = Math.floor(nextWaitInterval / 60);
      const seconds = nextWaitInterval % 60;
      addLog(`等待发布第${index + 2}篇笔记...`, 'info', 
        `等待时间: ${minutes}分${seconds}秒`);
    }

    // 强制更新界面
    await new Promise(resolve => setTimeout(resolve, 100));
    
  } catch (error) {
    addLog(`发布第${index + 1}篇笔记失败: ${error.message}`, 'error');
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

      const files = Array.from(this.files);
      addLog(`选择了 ${files.length} 张图片`);
      
      // 清空当前笔记的图片
      notes[index].images = [];
      notes[index].imageUrls = {};
      imagePreview.innerHTML = '';
      
      try {
        // 加载所有图片
        const loadedImages = await Promise.all(files.map((file, i) => {
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
        saveState();
      } catch (error) {
        addLog(`加载图片失败: ${error.message}`, 'error');
      }
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

// 修改笔记内容变化的处理函数，添加状态保存
function handleNoteChange(index, field, value) {
  notes[index][field] = value;
  addLog(`已更新第${index + 1}篇笔记的${field}`);
  saveState();
}

// 修改图片处理相关函数，添加状态保存
async function handleImageUpload(files, index, panel) {
  // ... [现有的图片处理代码]
  
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

// 修改消息监听函数
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