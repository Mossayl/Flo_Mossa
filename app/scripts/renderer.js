// 渲染进程的 JavaScript 代码
document.addEventListener('DOMContentLoaded', () => {
  console.log('✅ 悬浮窗已加载');
  console.log('检查 electronAPI:', window.electronAPI);
  console.log('electronAPI.saveChunk 存在?', window.electronAPI?.saveChunk ? '是' : '否');
  
  // 获取所有 UI 元素
  const tagSelector = document.getElementById('tagSelector');
  const titleInput = document.getElementById('titleInput');
  const sourceInput = document.getElementById('sourceInput');
  const contentTextarea = document.getElementById('contentTextarea');
  const screenshotDropzone = document.getElementById('screenshotDropzone');
  const screenshotDropzoneText = document.getElementById('screenshotDropzoneText');
  const fileSelectButton = document.getElementById('fileSelectButton');
  const fileInput = document.getElementById('fileInput');
  const thumbnailContainer = document.getElementById('thumbnailContainer');
  const cacheButton = document.getElementById('cacheButton');
  const submitButton = document.getElementById('submitButton');
  const cacheCount = document.getElementById('cacheCount');
  const hideButton = document.getElementById('hideButton');
  const closeButton = document.getElementById('closeButton');

  // 存储截图
  let screenshots = [];

  // 标签选择器事件
  tagSelector.addEventListener('change', async (e) => {
    console.log('选择的标签:', e.target.value);
    await updateCacheCountFromFile(tagSelector.value, titleInput.value);
  });

  // 输入框事件
  titleInput.addEventListener('input', async (e) => {
    console.log('小标题:', e.target.value);
    await updateCacheCountFromFile(tagSelector.value, titleInput.value);
  });

  sourceInput.addEventListener('input', (e) => {
    console.log('来源:', e.target.value);
  });

  contentTextarea.addEventListener('input', (e) => {
    console.log('笔记内容:', e.target.value);
  });

  // ===== 窗口控制按钮事件 =====
  hideButton.addEventListener('click', () => {
    console.log('🪟 点击隐藏按钮');
    if (window.electronAPI?.hideWindow) {
      window.electronAPI.hideWindow();
    } else {
      console.warn('hideWindow API 不可用');
    }
  });

  closeButton.addEventListener('click', () => {
    console.log('🪟 点击关闭按钮');
    if (window.electronAPI?.closeWindow) {
      window.electronAPI.closeWindow();
    } else {
      console.warn('closeWindow API 不可用');
    }
  });

  // ===== 图片上传功能：三种方式 =====
  
  // 方式 A：点击上传按钮（手动选择文件，仅限按钮）
  if (fileSelectButton) {
    fileSelectButton.addEventListener('click', (event) => {
      event.stopPropagation();
      fileInput.click();
    });
  }

  fileInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    handleImageFiles(files);
    // 清空 input，以便可以再次选择同一文件
    fileInput.value = '';
  });

  // 方式 B：拖拽图片到上传区域
  screenshotDropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    screenshotDropzone.classList.add('dragover');
  });

  screenshotDropzone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    screenshotDropzone.classList.remove('dragover');
  });

  screenshotDropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    screenshotDropzone.classList.remove('dragover');
    
    const files = Array.from(e.dataTransfer.files);
    handleImageFiles(files);
  });

  // 方式 C：复制粘贴图片（Ctrl + V / Cmd + V）
  document.addEventListener('paste', async (e) => {
    if (!e.clipboardData || !e.clipboardData.items) {
      return;
    }
    
    const items = e.clipboardData.items;
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          await handleImageFiles([file]);
        }
        break;
      }
    }
  });

  // 处理图片文件（统一处理函数）
  async function handleImageFiles(files) {
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        
        reader.onload = async (e) => {
          const imageUrl = e.target.result;
          
          // 保存图片到本地
          try {
            const timestamp = Date.now();
            const ext = file.name.split('.').pop() || 'png';
            const filename = `image_${timestamp}.${ext}`;
            
            if (window.electronAPI && window.electronAPI.saveImage) {
              await window.electronAPI.saveImage(imageUrl, filename);
            }
            
            // 添加到截图列表
            screenshots.push({
              file: file,
              url: imageUrl,
              filename: filename
            });
            
            // 显示缩略图
            addThumbnail(imageUrl);
            
            // 更新拖拽区提示文字
            updateDropzoneText();
          } catch (error) {
            console.error('保存图片失败:', error);
            // 即使保存失败，也显示缩略图
            screenshots.push({
              file: file,
              url: imageUrl
            });
            addThumbnail(imageUrl);
            updateDropzoneText();
          }
        };
        
        reader.readAsDataURL(file);
      }
    }
  }

  // 更新拖拽区提示文字
  function updateDropzoneText() {
    if (screenshots.length > 0) {
      screenshotDropzoneText.textContent = `已上传 ${screenshots.length} 张图片，可继续添加`;
    } else {
      screenshotDropzoneText.textContent = '拖拽图片到这里、点击上传或粘贴图片（Cmd+V）';
    }
  }

  // 添加缩略图（带成功提示）
  function addThumbnail(imageUrl) {
    const thumbnailItem = document.createElement('div');
    thumbnailItem.className = 'thumbnail-item';
    
    const img = document.createElement('img');
    img.src = imageUrl;
    img.className = 'thumbnail';
    img.alt = '截图';
    
    const successText = document.createElement('div');
    successText.className = 'thumbnail-success';
    successText.textContent = '✨ success！';
    
    thumbnailItem.appendChild(img);
    thumbnailItem.appendChild(successText);
    thumbnailContainer.appendChild(thumbnailItem);
    
    // 滚动到新添加的缩略图
    thumbnailItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function resetScreenshots() {
    screenshots = [];
    thumbnailContainer.innerHTML = '';
    updateDropzoneText();
  }

  function clearNoteContentArea() {
    contentTextarea.value = '';
    contentTextarea.focus();
  }

  // 保存笔记到本地缓存
  async function saveNoteToCache() {
    console.log('开始保存笔记到缓存...');
    const tag = tagSelector.value;
    const title = titleInput.value;
    const source = sourceInput.value;
    const content = contentTextarea.value;
    
    console.log('输入数据:', { tag, title, source, contentLength: content.length });
    
    // 检查 electronAPI 是否可用
    if (!window.electronAPI) {
      console.error('window.electronAPI 不存在！');
      alert('错误：electronAPI 不可用，请检查 preload.js');
      return false;
    }
    
    if (!window.electronAPI.saveChunk) {
      console.error('window.electronAPI.saveChunk 不存在！');
      alert('错误：saveChunk 方法不可用');
      return false;
    }
    
    // 构建 chunk 对象
    const chunk = {
      type: 'text',
      content: content,
      source: source,
      screenshots: screenshots.map(s => ({
        filename: s.filename,
        url: s.url
      }))
    };
    
    console.log('准备保存 chunk:', chunk);
    
    // 调用保存方法
    try {
      console.log('调用 saveChunk...');
      const result = await window.electronAPI.saveChunk(tag, title, chunk);
      console.log('saveChunk 返回结果:', result);
      
      if (result && result.success) {
        console.log('✅ 缓存成功! 文件路径:', result.filePath, '数量:', result.count);
        // 更新缓存计数（使用返回的 count）
        updateCacheCount(result.count);
        // 显示成功提示
        showMessage('✅ 缓存成功！', 'success');
        clearNoteContentArea();
        resetScreenshots();
        return true;
      } else {
        const errorMsg = result?.error || '未知错误';
        console.error('❌ 缓存失败:', errorMsg);
        showMessage('❌ 缓存失败: ' + errorMsg, 'error');
        return false;
      }
    } catch (error) {
      console.error('❌ 缓存出错:', error);
      showMessage('❌ 缓存出错: ' + error.message, 'error');
      return false;
    }
  }
  
  let toastTimer = null;

  // 显示消息提示
  function showMessage(message, type = 'info') {
    const appRoot = document.getElementById('app') || document.body;
    let messageEl = document.getElementById('toastMessage');
    if (!messageEl) {
      messageEl = document.createElement('div');
      messageEl.id = 'toastMessage';
      messageEl.className = 'toast-message';
      messageEl.setAttribute('role', 'status');
      messageEl.setAttribute('aria-live', 'polite');
      appRoot.appendChild(messageEl);
    }
    
    const text = type === 'success' ? '✨ success!' : (message || '');
    messageEl.textContent = text;
    messageEl.dataset.type = type;
    messageEl.classList.add('visible');
    
    if (toastTimer) {
      clearTimeout(toastTimer);
    }
    
    toastTimer = setTimeout(() => {
      messageEl.classList.remove('visible');
      toastTimer = setTimeout(() => {
        if (messageEl && messageEl.parentNode) {
          messageEl.parentNode.removeChild(messageEl);
        }
        toastTimer = null;
      }, 200);
    }, 2000);
  }

  // 从文件读取缓存数量并更新显示
  async function updateCacheCountFromFile(tag, title) {
    if (!window.electronAPI || !window.electronAPI.getCacheCount) {
      console.warn('getCacheCount 方法不可用');
      return;
    }
    
    try {
      const count = await window.electronAPI.getCacheCount(tag, title);
      console.log('当前缓存数量:', count);
      updateCacheCount(count);
    } catch (error) {
      console.error('获取缓存数量失败:', error);
    }
  }

  // 缓存按钮事件
  cacheButton.addEventListener('click', async () => {
    console.log('🖱️ 点击了缓存按钮');
    
    // 添加按钮点击反馈
    const originalText = cacheButton.textContent;
    cacheButton.textContent = '缓存中...';
    cacheButton.disabled = true;
    
    try {
      const success = await saveNoteToCache();
      if (success) {
        console.log('✅ 笔记已缓存');
      }
    } finally {
      // 恢复按钮状态
      cacheButton.textContent = originalText;
      cacheButton.disabled = false;
    }
  });

  async function submitCachedChunks() {
    if (!window.electronAPI || !window.electronAPI.submitChunks) {
      console.error('submitChunks 方法不可用');
      showMessage('❌ 提交功能不可用', 'error');
      return false;
    }
    
    try {
      const tag = tagSelector.value;
      const title = titleInput.value;
      const source = sourceInput.value;
      const result = await window.electronAPI.submitChunks(tag, title, source);
      console.log('submitChunks 返回结果:', result);
      
      if (result && result.success) {
        showMessage('✅ 提交成功，已生成 Word 文档！', 'success');
        clearNoteContentArea();
        resetScreenshots();
        await updateCacheCountFromFile(tagSelector.value, titleInput.value);
        if (result.docxPath) {
          console.log('DOCX 文件路径:', result.docxPath);
        }
        return true;
      } else {
        const errorMsg = result?.error || '未知错误';
        showMessage('❌ 提交失败: ' + errorMsg, 'error');
        return false;
      }
    } catch (error) {
      console.error('提交失败:', error);
      showMessage('❌ 提交出错: ' + error.message, 'error');
      return false;
    }
  }

  // 提交按钮事件（提交前保存当前输入）
  submitButton.addEventListener('click', async () => {
    console.log('点击了提交按钮');
    const originalText = submitButton.textContent;
    submitButton.textContent = '提交中...';
    submitButton.disabled = true;
    
    try {
      const hasPendingInput = contentTextarea.value.trim().length > 0 || screenshots.length > 0;
      if (hasPendingInput) {
        const cacheSuccess = await saveNoteToCache();
        if (!cacheSuccess) {
          return;
        }
      }
      await submitCachedChunks();
    } finally {
      submitButton.textContent = originalText;
      submitButton.disabled = false;
    }
  });

  // 更新缓存数量显示
  function updateCacheCount(count) {
    cacheCount.textContent = `已缓存 ${count} 条`;
  }

  // 初始化缓存数量
  updateCacheCountFromFile(tagSelector.value, titleInput.value);
});
