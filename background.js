// 修改发布状态对象
let publishState = {
  isPublishing: false,
  currentIndex: 0,
  totalNotes: 0,
  publishConfig: null,
  tabId: null,
  currentAction: '',
  waitTime: 0
};

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 立即返回 true 表示我们将异步发送响应
  const handleMessage = async () => {
    switch (message.type) {
      case 'START_PUBLISH':
        await startPublishing(message.data);
        return { success: true };
      case 'GET_STATE':
        return publishState;
      case 'STOP_PUBLISH':
        await stopPublishing();
        return { success: true };
      case 'SET_AUTH_TOKEN':
        await handleSetAuthToken(message.token, message.refreshToken);
        return { success: true };
      case 'GET_AUTH_TOKEN':
        const token = await getAuthToken();
        return { token: token };
    }
  };

  // 使用 Promise 处理异步响应
  handleMessage().then(response => {
    if (sendResponse) {
      sendResponse(response);
    }
  }).catch(error => {
    console.error('处理消息出错:', error);
    if (sendResponse) {
      sendResponse({ error: error.message });
    }
  });

  // 返回 true 表示我们会异步调用 sendResponse
  return true;
});

// 修改开始发布函数
async function startPublishing(data) {
  if (publishState.isPublishing) return;

  try {
    // 创建新标签页
    const tab = await chrome.tabs.create({
      url: 'https://creator.xiaohongshu.com/publish/publish',
      active: true
    });
    
    // 重置发布状态
    publishState = {
      isPublishing: true,
      currentIndex: 0,
      totalNotes: data.notes.length,
      publishConfig: {
        intervalType: data.publishConfig.intervalType,
        fixedInterval: data.publishConfig.fixedInterval,
        minInterval: data.publishConfig.minInterval,
        maxInterval: data.publishConfig.maxInterval
      },
      tabId: tab.id,
      currentAction: '准备发布（测试模式）',
      waitTime: 0
    };

    // 开始发布循环
    for (let i = 0; i < data.notes.length; i++) {
      if (!publishState.isPublishing) break;

      try {
        // 发布当前笔记
        await publishNote(data.notes[i]);
        
        // 更新进度
        publishState.currentIndex = i + 1;
        notifyPopup('NOTE_PUBLISHED', {
          index: i,
          total: data.notes.length
        });

        // 如果不是最后一篇，等待指定时间
        if (i < data.notes.length - 1) {
          const waitTime = calculateWaitTime();
          publishState.waitTime = waitTime;
          publishState.currentAction = '等待发布下一篇';
          
          notifyPopup('WAITING', {
            nextIndex: i + 1,
            waitTime,
            currentTime: new Date().toLocaleTimeString()
          });
          
          await wait(waitTime);
        }

      } catch (error) {
        console.error('发布笔记失败:', error);
        notifyPopup('ERROR', error.message);
        await handleError();
        break;
      }
    }

    // 发布完成
    if (publishState.currentIndex >= data.notes.length) {
      notifyPopup('COMPLETED');
    }

    // 清理状态
    await cleanup();

  } catch (error) {
    console.error('启动发布失败:', error);
    notifyPopup('ERROR', error.message);
    await cleanup();
  }
}

// 计算等待时间
function calculateWaitTime() {
  const config = publishState.publishConfig;
  if (config.intervalType === 'random') {
    return Math.floor(
      Math.random() * (config.maxInterval - config.minInterval + 1)
    ) + config.minInterval;
  }
  return config.fixedInterval;
}

// 错误处理
async function handleError() {
  publishState.isPublishing = false;
  
  // 尝试关闭发布标签页
  try {
    if (publishState.tabId) {
      await chrome.tabs.remove(publishState.tabId);
    }
  } catch (error) {
    console.error('关闭标签页失败:', error);
  }
}

// 修改通知函数
function notifyPopup(type, data) {
  const time = new Date().toLocaleTimeString();
  let message = '';

  // 根据不同类型的消息生成日志内容
  switch (type) {
    case 'START_PUBLISH':
      message = `[${time}] 开始发布任务，共 ${publishState.totalNotes} 篇笔记`;
      break;
    case 'NOTE_PUBLISHED':
      message = `[${time}] 成功发布第 ${data.index + 1}/${data.total} 篇笔记`;
      break;
    case 'WAITING':
      const nextTime = new Date(Date.now() + data.waitTime * 1000).toLocaleTimeString();
      message = `[${time}] 等待发布第 ${data.nextIndex + 1} 篇笔记...
预计发布时间: ${nextTime}
等待时间: ${data.waitTime} 秒`;
      break;
    case 'ACTION_UPDATE':
      message = `[${time}] 正在发布第 ${publishState.currentIndex + 1} 篇：${publishState.currentAction}`;
      break;
    case 'ERROR':
      message = `[${time}] 发布出错: ${data}`;
      break;
    case 'COMPLETED':
      message = `[${time}] 所有笔记发布完成！`;
      break;
    case 'STOPPED':
      message = `[${time}] 已停止发布`;
      break;
    case 'COUNTDOWN':
      message = `[${time}] 倒计时: ${data.remainingTime}/${data.totalTime} 秒`;
      break;
    default:
      message = `[${time}] ${publishState.currentAction}`;
  }

  // 保存状态
  chrome.storage.local.set({
    pState: {
      i: publishState.isPublishing,
      c: publishState.currentIndex,
      t: publishState.totalNotes,
      a: publishState.currentAction,
      w: publishState.waitTime
    }
  });

  // 发送消息到 popup
  chrome.runtime.sendMessage({
    type: 'STATUS_UPDATE',
    data: {
      message,
      state: {
        isPublishing: publishState.isPublishing,
        currentIndex: publishState.currentIndex,
        totalNotes: publishState.totalNotes,
        currentAction: publishState.currentAction,
        waitTime: publishState.waitTime,
        time,
        countdown: type === 'COUNTDOWN' ? {
          current: data.remainingTime,
          total: data.totalTime
        } : null
      }
    }
  }).catch(() => {});
}

// 修改清理函数
async function cleanup() {
  publishState = {
    isPublishing: false,
    currentIndex: 0,
    totalNotes: 0,
    publishConfig: null,
    tabId: null,
    currentAction: '',
    waitTime: 0
  };
  
  await chrome.storage.local.remove(['pState']);
}

// 停止发布
async function stopPublishing() {
  // 设置发布状态为停止
  publishState.isPublishing = false;
  publishState.currentAction = '已停止发布';
  publishState.waitTime = 0;
  
  // 通知 popup 已停止
  notifyPopup('STOPPED');
  
  // 记录日志
  console.log('发布任务被手动停止', publishState);
  
  // 尝试关闭发布标签页
  try {
    if (publishState.tabId) {
      await chrome.tabs.remove(publishState.tabId);
      publishState.tabId = null;
    }
  } catch (error) {
    console.error('关闭标签页失败:', error);
  }
  
  // 清理存储的状态
  await chrome.storage.local.set({
    pState: {
      i: false,
      c: publishState.currentIndex,
      t: publishState.totalNotes,
      a: '已停止发布',
      w: 0
    }
  });
  
  return { success: true };
}

// 在扩展启动时恢复状态
chrome.runtime.onStartup.addListener(async () => {
  try {
    const data = await chrome.storage.local.get('pState');
    if (data.pState && data.pState.i) {
      publishState = {
        isPublishing: data.pState.i,
        currentIndex: data.pState.c,
        totalNotes: data.pState.t,
        publishConfig: {
          intervalType: data.pState.intervalType,
          fixedInterval: data.pState.fixedInterval,
          minInterval: data.pState.minInterval,
          maxInterval: data.pState.maxInterval
        },
        tabId: null,
        currentAction: data.pState.a,
        waitTime: data.pState.w
      };
      await startPublishing({ notes: [], publishConfig: { intervalType: data.pState.intervalType, fixedInterval: data.pState.fixedInterval, minInterval: data.pState.minInterval, maxInterval: data.pState.maxInterval } });
    }
  } catch (error) {
    console.error('恢复状态失败:', error);
  }
});

// 修改发布笔记函数
async function publishNote(noteData) {
  try {
    // 获取当前标签页
    publishState.currentAction = '打开发布页面';
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    await chrome.tabs.update(tab.id, { 
      url: 'https://creator.xiaohongshu.com/publish/publish?source=official&from=tab_switch' 
    });
    
    // 等待页面加载
    publishState.currentAction = '等待页面加载';
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 点击图文按钮
    publishState.currentAction = '点击图文按钮';
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

    // 等待页面切换
    publishState.currentAction = '等待页面切换';
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 上传图片
    publishState.currentAction = '上传图片';
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
      args: [Object.values(noteData.imageUrls)]
    });

    // 等待图片上传
    publishState.currentAction = '等待图片上传完成';
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 更新填写内容状态
    publishState.currentAction = '正在填写笔记内容...';
    notifyPopup('ACTION_UPDATE');

    // 填写内容
    publishState.currentAction = '填写笔记内容';
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: (contentData, productId) => {
        return new Promise((resolve) => {
          setTimeout(() => {
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

              // 分行处理正文，保留空行
              const lines = contentData.body.split('\n');
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
                    // 处理商品链接
                    if (productId) {
                      setTimeout(() => {
                        // 点击添加商品按钮
                        const addProductButton = document.querySelector('#web > div.outarea.publish-c > div > div > div > div.body > div.content > div.media-commodity > div > div > div > div > div > div > div.multi-good-select-empty-btn > button > div > span');
                        if (addProductButton) {
                          addProductButton.click();

                          // 等待弹窗出现并点击搜索商品ID按钮
                          setTimeout(() => {
                            const searchButton = document.querySelector('body > div.d-modal-mask > div > div.d-modal-content > div > div.d-grid > div:nth-child(2) > div > div > div');
                            if (searchButton) {
                              searchButton.click();

                              // 等待输入框出现并输入商品ID
                              setTimeout(() => {
                                const searchInput = document.querySelector('body > div.d-modal-mask > div > div.d-modal-content > div > div.d-grid > div:nth-child(2) > div > div > div > div');
                                if (searchInput) {
                                  searchInput.focus();
                                  document.execCommand('insertText', false, productId);
                                  searchInput.dispatchEvent(new Event('input', { bubbles: true }));

                                  // 记录商品规格（如果有）到控制台，方便调试
                                  if (contentData.productSpec) {
                                    console.log('注意：有商品规格需要设置:', contentData.productSpec);
                                  }

                                  // 等待搜索结果并勾选商品
                                  setTimeout(() => {
                                    const checkboxSpan = document.querySelector('body > div.d-modal-mask > div > div.d-modal-content > div > div.goods-list-container > div.goods-list-normal > div > div.good-card-container > div.d-grid.d-checkbox.d-checkbox-main.d-clickable.good-selected > span');
                                    if (checkboxSpan) {
                                      console.log('找到商品，点击勾选');
                                      checkboxSpan.click();

                                      // 点击保存按钮
                                      setTimeout(() => {
                                        const saveButton = document.querySelector('body > div.d-modal-mask > div > div.d-modal-footer > div > button > div');
                                        if (saveButton) {
                                          console.log('点击保存按钮');
                                          saveButton.click();
                                          
                                          // 等待保存完成后，处理商品规格（如果有）
                                          setTimeout(() => {
                                            // 获取商品规格
                                            const productSpec = contentData.productSpec;
                                            const productSpec1 = contentData.productSpec1;
                                            const productSpec2 = contentData.productSpec2;
                                            
                                            // 调试信息
                                            console.log('=== Background.js 规格调试 ===');
                                            console.log('productSpec:', productSpec);
                                            console.log('productSpec1:', productSpec1);
                                            console.log('productSpec2:', productSpec2);
                                            console.log('==============================');
                                            
                                            if ((productSpec && productSpec.trim() !== '') || 
                                                (productSpec1 && productSpec1.trim() !== '') || 
                                                (productSpec2 && productSpec2.trim() !== '')) {
                                              console.log('发现商品规格需要设置');
                                              
                                              // 点击改规格按钮 - 使用更新的选择器
                                              const editSpecButton = document.querySelector('#web > div > div > div > div > div.body > div.content > div.media-commodity > div > div > div > div > div > div > div.draggable-wrap > div > div.draggable-good-card-operation > button:nth-child(2)');
                                              
                                              if (editSpecButton) {
                                                console.log('点击规格选择按钮');
                                                editSpecButton.click();
                                                
                                                // 等待规格选择弹窗加载
                                                setTimeout(async () => {
                                                  try {
                                                    // 获取规格区域
                                                    const specContainer = document.querySelector('body > div.d-modal-mask > div > div.d-modal-content > div > div.variant-list');
                                                    
                                                    if (!specContainer) {
                                                      console.log('未找到规格容器，尝试其他选择器');
                                                      // 尝试其他可能的选择器
                                                      const altSpecContainer = document.querySelector('div.d-modal-mask div.variant-list') || 
                                                                                document.querySelector('div.variant-list');
                                                      
                                                      if (altSpecContainer) {
                                                        console.log('使用替代选择器找到规格容器');
                                                        specOptions = altSpecContainer.querySelectorAll('span');
                                                      } else {
                                                        console.log('未找到任何规格容器，跳过规格选择');
                                                        // 直接点击确认按钮
                                                        const confirmButton = document.querySelector('body > div.d-modal-mask > div > div.d-modal-content > div > div.variant-footer > button.d-button.d-button-default.d-button-with-content.--color-static.bold.--color-bg-primary.--color-white > div > span') ||
                                                                              document.querySelector('div.d-modal-mask button.d-button-with-content.--color-bg-primary');
                                                        if (confirmButton) {
                                                          console.log('点击确认按钮');
                                                          confirmButton.click();
                                                        }
                                                        
                                                        // 继续进行发布
                                                        setTimeout(() => {
                                                          const publishButton = document.querySelector('#web > div.outarea.publish-c > div > div > div > div.submit > div > button.d-button.d-button-large.--size-icon-large.--size-text-h6.d-button-with-content.--color-static.bold.--color-bg-fill.--color-text-paragraph.custom-button.red.publishBtn > div') ||
                                                                              document.querySelector('button.red.publishBtn div');
                                                          if (publishButton) {
                                                            console.log('点击发布按钮');
                                                            publishButton.click();
                                                            resolve(true);
                                                          } else {
                                                            console.log('未找到发布按钮');
                                                            resolve(false);
                                                          }
                                                        }, 2000);
                                                        return;
                                                      }
                                                    }
                                                    
                                                    // 获取所有规格选项 (span elements containing radio buttons)
                                                    const specOptions = specContainer.querySelectorAll('span');
                                                    console.log(`找到${specOptions.length}个规格选项`);
                                                    
                                                    // 打印所有可用的规格选项
                                                    console.log('=== 所有可用规格选项 ===');
                                                    specOptions.forEach((option, index) => {
                                                      const optionText = option.textContent.trim();
                                                      const hasRadio = option.querySelector('.d-radio-simulator');
                                                      console.log(`选项${index + 1}: "${optionText}" (包含单选框: ${!!hasRadio})`);
                                                    });
                                                    console.log('========================');
                                                    
                                                    // 步骤1：取消所有已选中的规格
                                                    console.log('步骤1：取消所有已选中的规格');
                                                    const checkedOptions = specContainer.querySelectorAll('.d-radio-simulator.checked');
                                                    console.log(`找到${checkedOptions.length}个已选中的规格`);
                                                    
                                                    for (const checkedOption of checkedOptions) {
                                                      console.log('取消已选规格:', checkedOption.closest('span').textContent.trim());
                                                      checkedOption.click();
                                                      await new Promise(r => setTimeout(r, 300)); // Small delay for UI update
                                                    }
                                                    
                                                    // 步骤2：选择指定的规格
                                                    console.log('步骤2：选择指定的规格');
                                                    let spec1Found = false;
                                                    let spec2Found = false;
                                                    let legacySpecFound = false;
                                                    
                                                    // 记录目标规格
                                                    if (productSpec1) console.log('正在查找目标规格1:', productSpec1);
                                                    if (productSpec2) console.log('正在查找目标规格2:', productSpec2);
                                                    if (productSpec) console.log('正在查找传统规格:', productSpec);
                                                    
                                                    // 多种匹配策略 - 精确匹配优先
                                                    const matchStrategies = [
                                                      // 策略1：精确匹配（最高优先级）
                                                      (optionText, targetSpec) => optionText === targetSpec,
                                                      // 策略2：去除空格后精确匹配
                                                      (optionText, targetSpec) => optionText.replace(/\s+/g, '') === targetSpec.replace(/\s+/g, ''),
                                                      // 策略3：分词匹配（严格匹配所有词）
                                                      (optionText, targetSpec) => {
                                                        const optionWords = optionText.split(/[\s,，、]+/).filter(w => w.length > 0);
                                                        const targetWords = targetSpec.split(/[\s,，、]+/).filter(w => w.length > 0);
                                                        return targetWords.every(word => optionWords.includes(word));
                                                      },
                                                      // 策略4：包含匹配（最低优先级，只有在没有更好匹配时才使用）
                                                      (optionText, targetSpec) => {
                                                        // 只有当选项文本比目标文本长不超过3倍时才进行包含匹配
                                                        if (optionText.length > targetSpec.length * 3) return false;
                                                        return optionText.includes(targetSpec);
                                                      }
                                                    ];
                                                    
                                                    for (let strategyIndex = 0; strategyIndex < matchStrategies.length; strategyIndex++) {
                                                      const strategy = matchStrategies[strategyIndex];
                                                      const strategyName = ['精确匹配', '去空格匹配', '分词匹配', '包含匹配'][strategyIndex];
                                                      
                                                      console.log(`尝试策略${strategyIndex + 1}: ${strategyName}`);
                                                      
                                                      for (const specOption of specOptions) {
                                                        const optionText = specOption.textContent.trim();
                                                        const radioSimulator = specOption.querySelector('.d-radio-simulator');
                                                        
                                                        // 检查productSpec1
                                                        if (productSpec1 && !spec1Found && strategy(optionText, productSpec1)) {
                                                          if (radioSimulator) {
                                                            console.log(`策略${strategyIndex + 1}找到匹配的规格1: "${optionText}" 匹配 "${productSpec1}"`);
                                                            radioSimulator.click();
                                                            spec1Found = true;
                                                            await new Promise(r => setTimeout(r, 300));
                                                          } else {
                                                            // 对于没有单选框的选项，尝试点击整个选项元素
                                                            console.log(`策略${strategyIndex + 1}找到匹配的规格1（无单选框，尝试点击选项）: "${optionText}" 匹配 "${productSpec1}"`);
                                                            try {
                                                              specOption.click();
                                                              spec1Found = true;
                                                              await new Promise(r => setTimeout(r, 300));
                                                            } catch (e) {
                                                              console.log('点击选项失败，尝试寻找父元素的单选框');
                                                              // 尝试寻找父元素或兄弟元素中的单选框
                                                              const parentRadio = specOption.closest('span')?.querySelector('.d-radio-simulator') || 
                                                                                 specOption.parentElement?.querySelector('.d-radio-simulator');
                                                              if (parentRadio) {
                                                                console.log('找到父级单选框，点击它');
                                                                parentRadio.click();
                                                                spec1Found = true;
                                                                await new Promise(r => setTimeout(r, 300));
                                                              }
                                                            }
                                                          }
                                                        }
                                                        
                                                        // 检查productSpec2
                                                        if (productSpec2 && !spec2Found && strategy(optionText, productSpec2)) {
                                                          if (radioSimulator) {
                                                            console.log(`策略${strategyIndex + 1}找到匹配的规格2: "${optionText}" 匹配 "${productSpec2}"`);
                                                            radioSimulator.click();
                                                            spec2Found = true;
                                                            await new Promise(r => setTimeout(r, 300));
                                                          } else {
                                                            console.log(`策略${strategyIndex + 1}找到匹配的规格2（无单选框，尝试点击选项）: "${optionText}" 匹配 "${productSpec2}"`);
                                                            try {
                                                              specOption.click();
                                                              spec2Found = true;
                                                              await new Promise(r => setTimeout(r, 300));
                                                            } catch (e) {
                                                              console.log('点击选项失败，尝试寻找父元素的单选框');
                                                              const parentRadio = specOption.closest('span')?.querySelector('.d-radio-simulator') || 
                                                                                 specOption.parentElement?.querySelector('.d-radio-simulator');
                                                              if (parentRadio) {
                                                                console.log('找到父级单选框，点击它');
                                                                parentRadio.click();
                                                                spec2Found = true;
                                                                await new Promise(r => setTimeout(r, 300));
                                                              }
                                                            }
                                                          }
                                                        }
                                                        
                                                        // 检查传统productSpec（向后兼容）
                                                        if (productSpec && !legacySpecFound && strategy(optionText, productSpec)) {
                                                          if (radioSimulator) {
                                                            console.log(`策略${strategyIndex + 1}找到匹配的传统规格: "${optionText}" 匹配 "${productSpec}"`);
                                                            radioSimulator.click();
                                                            legacySpecFound = true;
                                                            await new Promise(r => setTimeout(r, 300));
                                                          } else {
                                                            console.log(`策略${strategyIndex + 1}找到匹配的传统规格（无单选框，尝试点击选项）: "${optionText}" 匹配 "${productSpec}"`);
                                                            try {
                                                              specOption.click();
                                                              legacySpecFound = true;
                                                              await new Promise(r => setTimeout(r, 300));
                                                            } catch (e) {
                                                              console.log('点击选项失败，尝试寻找父元素的单选框');
                                                              const parentRadio = specOption.closest('span')?.querySelector('.d-radio-simulator') || 
                                                                                 specOption.parentElement?.querySelector('.d-radio-simulator');
                                                              if (parentRadio) {
                                                                console.log('找到父级单选框，点击它');
                                                                parentRadio.click();
                                                                legacySpecFound = true;
                                                                await new Promise(r => setTimeout(r, 300));
                                                              }
                                                            }
                                                          }
                                                        }
                                                      }
                                                      
                                                      // 如果所有需要的规格都找到了，就退出策略循环
                                                      const allSpecsFound = (!productSpec1 || spec1Found) && 
                                                                           (!productSpec2 || spec2Found) && 
                                                                           (!productSpec || legacySpecFound || productSpec1 || productSpec2);
                                                      if (allSpecsFound) {
                                                        console.log(`策略${strategyIndex + 1}成功，停止尝试其他策略`);
                                                          break;
                                                        }
                                                      }
                                                    
                                                    // 检查是否有未找到的规格
                                                    let hasError = false;
                                                    if (productSpec1 && !spec1Found) {
                                                      console.error('未找到规格1:', productSpec1);
                                                      hasError = true;
                                                    }
                                                    if (productSpec2 && !spec2Found) {
                                                      console.error('未找到规格2:', productSpec2);
                                                      hasError = true;
                                                    }
                                                    if (productSpec && !legacySpecFound && !productSpec1 && !productSpec2) {
                                                      console.error('未找到传统规格:', productSpec);
                                                      hasError = true;
                                                    }
                                                    
                                                    const specFound = spec1Found || spec2Found || legacySpecFound;
                                                    
                                                    // 等待一下再点击确认按钮
                                                    setTimeout(() => {
                                                      try {
                                                        // 根据是否找到规格决定点击确认或取消
                                                        if (specFound) {
                                                          // 点击确认按钮
                                                          const confirmButton = document.querySelector('body > div.d-modal-mask > div > div.d-modal-content > div > div.variant-footer > button.d-button.d-button-default.d-button-with-content.--color-static.bold.--color-bg-primary.--color-white > div > span') ||
                                                                                document.querySelector('div.d-modal-mask button.d-button-with-content.--color-bg-primary');
                                                          if (confirmButton) {
                                                            console.log('点击确认按钮');
                                                            confirmButton.click();
                                                            
                                                            // 确认完规格后再点击发布按钮
                                                            setTimeout(() => {
                                                              try {
                                                                const publishButton = document.querySelector('#web > div.outarea.publish-c > div > div > div > div.submit > div > button.d-button.d-button-large.--size-icon-large.--size-text-h6.d-button-with-content.--color-static.bold.--color-bg-fill.--color-text-paragraph.custom-button.red.publishBtn > div') ||
                                                                                  document.querySelector('button.red.publishBtn div');
                                                                if (publishButton) {
                                                                  console.log('点击发布按钮');
                                                                  publishButton.click();
                                                                  resolve(true);
                                                                } else {
                                                                  console.log('未找到发布按钮');
                                                                  resolve(false);
                                                                }
                                                              } catch (err) {
                                                                console.error('点击发布按钮时出错:', err);
                                                                resolve(false);
                                                              }
                                                            }, 3000);  // 增加延迟
                                                          } else {
                                                            console.log('未找到确认按钮，直接尝试点击发布按钮');
                                                            // 直接尝试点击发布按钮
                                                            setTimeout(() => {
                                                              const publishButton = document.querySelector('#web > div.outarea.publish-c > div > div > div > div.submit > div > button.d-button.d-button-large.--size-icon-large.--size-text-h6.d-button-with-content.--color-static.bold.--color-bg-fill.--color-text-paragraph.custom-button.red.publishBtn > div') ||
                                                                                document.querySelector('button.red.publishBtn div');
                                                              if (publishButton) {
                                                                console.log('点击发布按钮');
                                                                publishButton.click();
                                                                resolve(true);
                                                              } else {
                                                                console.log('未找到发布按钮');
                                                                resolve(false);
                                                              }
                                                            }, 2000);
                                                          }
                                                        } else {
                                                          // 点击取消按钮
                                                          console.log('未找到匹配规格，点击取消');
                                                          const cancelButton = document.querySelector('body > div.d-modal-mask > div > div.d-modal-content > div > div.variant-footer > button.d-button.d-button-default.d-button-with-content.--color-static.bold.--color-bg-fill.--color-text-paragraph > div > span') ||
                                                                              document.querySelector('div.d-modal-mask button:not(.d-button-with-content.--color-bg-primary)');
                                                          if (cancelButton) {
                                                            cancelButton.click();
                                                          }
                                                          
                                                          // 取消选择规格后，仍然点击发布按钮
                                                          setTimeout(() => {
                                                            const publishButton = document.querySelector('#web > div.outarea.publish-c > div > div > div > div.submit > div > button.d-button.d-button-large.--size-icon-large.--size-text-h6.d-button-with-content.--color-static.bold.--color-bg-fill.--color-text-paragraph.custom-button.red.publishBtn > div') ||
                                                                              document.querySelector('button.red.publishBtn div');
                                                            if (publishButton) {
                                                              console.log('点击发布按钮');
                                                              publishButton.click();
                                                              resolve(true);
                                                            } else {
                                                              console.log('未找到发布按钮');
                                                              resolve(false);
                                                            }
                                                          }, 3000);  // 增加延迟
                                                        }
                                                      } catch (btnErr) {
                                                        console.error('点击按钮时出错:', btnErr);
                                                        // 尝试直接点击发布按钮
                                                        setTimeout(() => {
                                                          try {
                                                            const publishButton = document.querySelector('#web > div.outarea.publish-c > div > div > div > div.submit > div > button.d-button.d-button-large.--size-icon-large.--size-text-h6.d-button-with-content.--color-static.bold.--color-bg-fill.--color-text-paragraph.custom-button.red.publishBtn > div') ||
                                                                                document.querySelector('button.red.publishBtn div');
                                                            if (publishButton) {
                                                              console.log('出错后尝试直接点击发布按钮');
                                                              publishButton.click();
                                                              resolve(true);
                                                            } else {
                                                              console.log('未找到发布按钮');
                                                              resolve(false);
                                                            }
                                                          } catch (finalErr) {
                                                            console.error('最终尝试点击发布按钮时出错:', finalErr);
                                                            resolve(false);
                                                          }
                                                        }, 3000);
                                                      }
                                                    }, 2000);  // 等待选择规格后的延迟
                                                  } catch (error) {
                                                    console.error('处理规格选择时出错:', error);
                                                    // 处理错误时直接尝试点击发布按钮
                                                    setTimeout(() => {
                                                      const publishButton = document.querySelector('#web > div.outarea.publish-c > div > div > div > div.submit > div > button.d-button.d-button-large.--size-icon-large.--size-text-h6.d-button-with-content.--color-static.bold.--color-bg-fill.--color-text-paragraph.custom-button.red.publishBtn > div') ||
                                                                          document.querySelector('button.red.publishBtn div');
                                                      if (publishButton) {
                                                        console.log('错误处理中点击发布按钮');
                                                        publishButton.click();
                                                        resolve(true);
                                                      } else {
                                                        console.log('未找到发布按钮');
                                                        resolve(false);
                                                      }
                                                    }, 2000);
                                                  }
                                                }, 2000);  // 等待规格选择弹窗加载
                                              } else {
                                                console.log('未找到改规格按钮，直接点击发布');
                                                // 未找到改规格按钮，直接点击发布
                                                setTimeout(() => {
                                                  const publishButton = document.querySelector('#web > div.outarea.publish-c > div > div > div > div.submit > div > button.d-button.d-button-large.--size-icon-large.--size-text-h6.d-button-with-content.--color-static.bold.--color-bg-fill.--color-text-paragraph.custom-button.red.publishBtn > div') ||
                                                                      document.querySelector('button.red.publishBtn div');
                                                  if (publishButton) {
                                                    console.log('点击发布按钮');
                                                    publishButton.click();
                                                    resolve(true);
                                                  } else {
                                                    console.log('未找到发布按钮');
                                                    resolve(false);
                                                  }
                                                }, 2000);
                                              }
                                            } else {
                                              // 没有商品规格，直接点击发布按钮
                                              console.log('无商品规格，直接点击发布');
                                              setTimeout(() => {
                                                const publishButton = document.querySelector('#web > div.outarea.publish-c > div > div > div > div.submit > div > button.d-button.d-button-large.--size-icon-large.--size-text-h6.d-button-with-content.--color-static.bold.--color-bg-fill.--color-text-paragraph.custom-button.red.publishBtn > div') ||
                                                                    document.querySelector('button.red.publishBtn div');
                                                if (publishButton) {
                                                  console.log('点击发布按钮');
                                                  publishButton.click();
                                                  resolve(true);
                                                } else {
                                                  console.log('未找到发布按钮');
                                                  resolve(false);
                                                }
                                              }, 2000);
                                            }
                                          }, 3000);
                                        } else {
                                          console.log('未找到保存按钮');
                                          resolve(false);
                                        }
                                      }, 2000);
                                    } else {
                                      console.log('未找到勾选商品复选框');
                                      // 尝试直接点击发布按钮
                                      setTimeout(() => {
                                        const publishButton = document.querySelector('#web > div.outarea.publish-c > div > div > div > div.submit > div > button.d-button.d-button-large.--size-icon-large.--size-text-h6.d-button-with-content.--color-static.bold.--color-bg-fill.--color-text-paragraph.custom-button.red.publishBtn > div') ||
                                                            document.querySelector('button.red.publishBtn div');
                                        if (publishButton) {
                                          console.log('未找到商品但仍点击发布按钮');
                                          publishButton.click();
                                          resolve(true);
                                        } else {
                                          console.log('未找到发布按钮');
                                          resolve(false);
                                        }
                                      }, 2000);
                                    }
                                  }, 3000);  // 增加搜索等待时间
                                } else {
                                  console.log('未找到搜索输入框');
                                  resolve(false);
                                }
                              }, 2000);
                            } else {
                              console.log('未找到搜索按钮');
                              resolve(false);
                            }
                          }, 2000);
                        } else {
                          console.log('未找到搜索按钮');
                          resolve(false);
                        }
                      }, 2000);
                    } else {
                      console.log('未找到商品ID，直接点击发布');
                      setTimeout(() => {
                        const publishButton = document.querySelector('#web > div.outarea.publish-c > div > div > div > div.submit > div > button.d-button.d-button-large.--size-icon-large.--size-text-h6.d-button-with-content.--color-static.bold.--color-bg-fill.--color-text-paragraph.custom-button.red.publishBtn > div');
                        if (publishButton) {
                          console.log('点击发布按钮');
                          publishButton.click();
                          resolve(true);
                        } else {
                          console.log('未找到发布按钮');
                          resolve(false);
                        }
                      }, 2000);
                    }
                  }
                }
                addNextTag();
              }
            } else {
              resolve(false);
            }
          }, 1000);
        });
      },
      args: [
        { 
          title: noteData.title, 
          body: noteData.body, 
          tags: noteData.tags,
          productSpec: noteData.productSpec, // 原有商品规格
          productSpec1: noteData.productSpec1, // 新增商品规格1
          productSpec2: noteData.productSpec2  // 新增商品规格2
        }, 
        noteData.productId || ''
      ]
    });

    // 等待发布完成
    publishState.currentAction = '等待发布完成';
    await new Promise(resolve => setTimeout(resolve, 30000));

    publishState.currentAction = '发布完成';
    
    // 扣除积分（发布一篇笔记消耗1积分）
    try {
      await deductPointsForPublish(noteData);
    } catch (error) {
      console.error('扣除积分失败:', error);
      // 积分扣除失败不影响发布流程，只记录日志
    }
    
    // 向popup发送笔记已发布的消息，包含recordId以便更新飞书状态
    chrome.runtime.sendMessage({
      type: 'PUBLISH_COMPLETED',
      data: {
        noteId: noteData.recordId,
        noteTitle: noteData.title,
        from: noteData.from || ''
      }
    }).catch(error => console.error('发送发布完成消息失败:', error));

  } catch (error) {
    console.error('发布笔记失败:', error);
    publishState.currentAction = `发布失败: ${error.message}`;
    notifyPopup('ERROR', error.message);
    throw error;
  }
}

// 修改等待函数
async function wait(seconds) {
  for (let i = seconds; i > 0; i--) {
    if (!publishState.isPublishing) break;
    
    publishState.waitTime = i;
    publishState.currentAction = `等待 ${i} 秒后发布下一篇...`;
    
    // 发送倒计时状态更新
    notifyPopup('COUNTDOWN', {
      remainingTime: i,
      totalTime: seconds
    });
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  publishState.waitTime = 0;
}

// 积分扣费函数
async function deductPointsForPublish(noteData) {
  const PUBLISH_COST = 1; // 发布一篇笔记消耗1积分
  
  try {
    // 获取当前积分数据
    const result = await chrome.storage.local.get(['pointsData']);
    let pointsData = result.pointsData || {
      current: 0,
      totalRecharged: 0,
      totalConsumed: 0
    };

    // 检查积分是否足够
    if (pointsData.current < PUBLISH_COST) {
      throw new Error(`积分不足，当前积分: ${pointsData.current}，需要: ${PUBLISH_COST}`);
    }

    // 扣除积分
    const beforePoints = pointsData.current;
    pointsData.current -= PUBLISH_COST;
    pointsData.totalConsumed += PUBLISH_COST;

    // 保存更新后的积分数据
    await chrome.storage.local.set({ pointsData });

    // 创建扣费记录
    const deductionRecord = {
      id: Date.now(),
      amount: PUBLISH_COST,
      actionType: 'publish_note',
      description: `发布笔记: ${noteData.title}`,
      noteId: noteData.recordId || '',
      beforePoints,
      afterPoints: pointsData.current,
      timestamp: Date.now()
    };

    // 保存扣费记录
    const { deductionRecords = [] } = await chrome.storage.local.get(['deductionRecords']);
    deductionRecords.push(deductionRecord);
    await chrome.storage.local.set({ deductionRecords });

    // 记录积分变动日志
    const { pointsLogs = [] } = await chrome.storage.local.get(['pointsLogs']);
    pointsLogs.push({
      id: Date.now(),
      changeType: 'deduction',
      pointsChange: -PUBLISH_COST,
      beforePoints,
      afterPoints: pointsData.current,
      description: `发布笔记消耗积分: ${noteData.title}`,
      timestamp: Date.now()
    });
    await chrome.storage.local.set({ pointsLogs });

    console.log(`积分扣费成功: 消耗 ${PUBLISH_COST} 积分，剩余 ${pointsData.current} 积分`);
    
    // 通知popup更新积分显示
    chrome.runtime.sendMessage({
      type: 'POINTS_UPDATED',
      data: pointsData
    }).catch(() => {});

  } catch (error) {
    console.error('积分扣费失败:', error);
    throw error;
  }
}

// ==================== MVP Token管理功能 ====================

// 设置认证token
async function handleSetAuthToken(token, refreshToken = null) {
  try {
    const storageData = { authToken: token };
    
    // 如果有refresh token，也保存起来
    if (refreshToken) {
      storageData.refreshToken = refreshToken;
    }
    
    await chrome.storage.local.set(storageData);
    console.log('AuthToken已保存', refreshToken ? '(包含refreshToken)' : '');
    
    // 通知popup更新登录状态
    chrome.runtime.sendMessage({
      type: 'LOGIN_STATUS_CHANGED',
      data: { isLoggedIn: true }
    }).catch(() => {});
  } catch (error) {
    console.error('保存AuthToken失败:', error);
  }
}

// 获取认证token
async function getAuthToken() {
  try {
    const result = await chrome.storage.local.get(['authToken']);
    return result.authToken || null;
  } catch (error) {
    console.error('获取AuthToken失败:', error);
    return null;
  }
}

// 清除认证token
async function clearAuthToken() {
  try {
    await chrome.storage.local.remove(['authToken', 'refreshToken']);
    console.log('AuthToken已清除');
    
    // 通知popup更新登录状态
    chrome.runtime.sendMessage({
      type: 'LOGIN_STATUS_CHANGED',
      data: { isLoggedIn: false }
    }).catch(() => {});
  } catch (error) {
    console.error('清除AuthToken失败:', error);
  }
} 