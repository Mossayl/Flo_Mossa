const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { Document, Packer, Paragraph, TextRun, Media } = require('docx');

let mainWindow = null;
let tray = null;
let allowWindowClose = false;
let isAppQuitting = false;

const sanitize = (str) => str.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_');

function getCacheFilePath(tag, title) {
  const cacheDir = path.join(app.getPath('userData'), 'local-notes-cache');
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  const safeTag = sanitize(tag || 'default');
  const safeTitle = sanitize(title || 'untitled');
  return path.join(cacheDir, `session_${safeTag}_${safeTitle}.json`);
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function formatTimestamp(ts) {
  const date = ts ? new Date(ts) : new Date();
  if (Number.isNaN(date.getTime())) {
    return formatTimestamp(Date.now());
  }
  const pad = (num) => String(num).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getNotesDir(tag) {
  const baseDir = path.join(app.getPath('userData'), 'local-notes', sanitize(tag || 'default'));
  ensureDir(baseDir);
  return baseDir;
}

function getDocxFilePath(tag, title) {
  const notesDir = getNotesDir(tag);
  const safeTitle = sanitize(title || 'untitled');
  return path.join(notesDir, `${safeTitle}.docx`);
}

function getMetadataFilePath(tag, title) {
  const notesDir = getNotesDir(tag);
  const safeTitle = sanitize(title || 'untitled');
  return path.join(notesDir, `${safeTitle}.json`);
}

function loadNoteMetadata(tag, title) {
  const metadataPath = getMetadataFilePath(tag, title);
  if (!fs.existsSync(metadataPath)) {
    return null;
  }
  
  try {
    const raw = fs.readFileSync(metadataPath, 'utf-8');
    const data = JSON.parse(raw);
    data.entries = Array.isArray(data.entries) ? data.entries : [];
    return data;
  } catch (error) {
    console.error('读取笔记 metadata 失败:', error);
    return null;
  }
}

function saveNoteMetadata(tag, title, metadata) {
  const metadataPath = getMetadataFilePath(tag, title);
  ensureDir(path.dirname(metadataPath));
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
}

function getImagePath(filename) {
  if (!filename) {
    return null;
  }
  return path.join(__dirname, 'images', filename);
}

function buildNoteText(chunks) {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return '（空）';
  }
  
  const parts = chunks
    .map((chunk) => (chunk?.content || '').trim())
    .filter(Boolean);
  
  return parts.length ? parts.join('\n') : '（空）';
}

function collectChunkImages(chunks) {
  const images = [];
  chunks.forEach((chunk) => {
    if (Array.isArray(chunk?.screenshots)) {
      chunk.screenshots.forEach((shot) => {
        if (shot?.filename) {
          images.push(shot.filename);
        }
      });
    }
  });
  return images;
}

function buildSubmissionEntry(tag, title, source, chunks) {
  const resolvedSource =
    (source && source.trim()) ||
    (Array.isArray(chunks)
      ? chunks.find((c) => c?.source && c.source.trim())?.source?.trim()
      : null) ||
    '无';
  
  return {
    source: resolvedSource,
    text: buildNoteText(chunks),
    images: collectChunkImages(chunks),
    createdAt: Date.now()
  };
}

function createDocParagraphs(doc, metadata) {
  const paragraphs = [];
  const tagText = metadata.tag || 'default';
  const titleText = metadata.title || '未命名';
  
  paragraphs.push(new Paragraph({ children: [new TextRun(`# ${tagText} - ${titleText}`)] }));
  paragraphs.push(new Paragraph({ children: [new TextRun(`创建日期：${formatTimestamp(metadata.createdAt)}`)] }));
  paragraphs.push(new Paragraph({ children: [new TextRun(`最近编辑：${formatTimestamp(metadata.updatedAt)}`)] }));
  paragraphs.push(new Paragraph({ children: [new TextRun('---')] }));
  paragraphs.push(new Paragraph({ children: [new TextRun('## 内容记录')] }));
  paragraphs.push(new Paragraph(''));
  
  metadata.entries.forEach((entry, index) => {
    if (index > 0) {
      paragraphs.push(new Paragraph(''));
    }
    
    paragraphs.push(new Paragraph({ children: [new TextRun(`- 来源：${entry.source || '无'}`)] }));
    
    const lines = (entry.text || '（空）').split(/\r?\n/);
    const textRuns = [];
    lines.forEach((line, lineIndex) => {
      const prefix = lineIndex === 0 ? '  文本：' : '';
      textRuns.push(new TextRun({ text: `${prefix}${line}` }));
      if (lineIndex < lines.length - 1) {
        textRuns.push(new TextRun({ break: 1 }));
      }
    });
    paragraphs.push(new Paragraph({ children: textRuns.length ? textRuns : [new TextRun('  文本：')] }));
    
    if (Array.isArray(entry.images)) {
      entry.images.forEach((filename) => {
        const imagePath = getImagePath(filename);
        if (imagePath && fs.existsSync(imagePath)) {
          try {
            const imageBuffer = fs.readFileSync(imagePath);
            const image = Media.addImage(doc, imageBuffer, 320);
            paragraphs.push(new Paragraph({ children: [image] }));
          } catch (error) {
            console.error('插入图片失败:', error);
          }
        }
      });
    }
  });
  
  return paragraphs;
}

function createDocFromMetadata(metadata) {
  const doc = new Document({ sections: [] });
  const paragraphs = createDocParagraphs(doc, metadata);
  doc.addSection({ properties: {}, children: paragraphs });
  return doc;
}

async function writeChunksToDocx(tag, title, source, chunks) {
  const now = Date.now();
  let metadata = loadNoteMetadata(tag, title);
  
  if (!metadata) {
    metadata = {
      tag: tag || 'default',
      title: title || '未命名',
      createdAt: (Array.isArray(chunks) && chunks[0]?.timestamp) || now,
      updatedAt: now,
      entries: []
    };
  }
  
  const entry = buildSubmissionEntry(tag, title, source, chunks);
  metadata.entries.push(entry);
  metadata.tag = metadata.tag || tag || 'default';
  metadata.title = metadata.title || title || '未命名';
  metadata.updatedAt = now;
  
  saveNoteMetadata(tag, title, metadata);
  
  const doc = createDocFromMetadata(metadata);
  const buffer = await Packer.toBuffer(doc);
  const docxPath = getDocxFilePath(tag, title);
  ensureDir(path.dirname(docxPath));
  fs.writeFileSync(docxPath, buffer);
  return docxPath;
}

// 立即注册所有 IPC 处理器（在应用启动前）
// IPC 处理器：保存图片
ipcMain.handle('save-image', async (event, imageData, filename) => {
  try {
    const imagesDir = path.join(__dirname, 'images');
    
    // 确保 images 目录存在
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }
    
    // 处理 base64 数据
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    
    // 保存文件
    const filePath = path.join(imagesDir, filename);
    fs.writeFileSync(filePath, buffer);
    
    return filePath;
  } catch (error) {
    console.error('保存图片失败:', error);
    throw error;
  }
});

// IPC 处理器：读取图片文件
ipcMain.handle('read-image-file', async (event, filePath) => {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, (err, data) => {
      if (err) {
        reject(err);
      } else {
        const base64 = data.toString('base64');
        const ext = path.extname(filePath).slice(1);
        const mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
        resolve(`data:${mimeType};base64,${base64}`);
      }
    });
  });
});

// IPC 处理器：保存笔记 chunk
ipcMain.handle('save-chunk', async (event, tag, title, chunk) => {
  try {
    const filePath = getCacheFilePath(tag, title);
    
    // 读取现有数据（如果存在）
    let chunks = [];
    if (fs.existsSync(filePath)) {
      try {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        chunks = JSON.parse(fileContent);
        if (!Array.isArray(chunks)) {
          chunks = [];
        }
      } catch (error) {
        console.error('读取缓存文件失败，将创建新文件:', error);
        chunks = [];
      }
    }
    
    const chunkWithTimestamp = {
      ...chunk,
      timestamp: Date.now()
    };
    
    chunks.push(chunkWithTimestamp);
    
    fs.writeFileSync(filePath, JSON.stringify(chunks, null, 2), 'utf-8');
    return {
      success: true,
      filePath,
      count: chunks.length
    };
  } catch (error) {
    console.error('保存缓存文件失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// IPC 处理器：获取缓存数量
ipcMain.handle('get-cache-count', async (event, tag, title) => {
  try {
    const filePath = getCacheFilePath(tag, title);
    
    if (!fs.existsSync(filePath)) {
      return 0;
    }
    
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const chunks = JSON.parse(fileContent);
    return Array.isArray(chunks) ? chunks.length : 0;
  } catch (error) {
    console.error('读取缓存数量失败:', error);
    return 0;
  }
});

// IPC 处理器：提交缓存并生成 Markdown
ipcMain.handle('submit-chunks', async (event, tag, title, source) => {
  try {
    const filePath = getCacheFilePath(tag, title);
    if (!fs.existsSync(filePath)) {
      return {
        success: false,
        error: '没有可提交的缓存'
      };
    }
    
    let chunks = [];
    try {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      chunks = JSON.parse(fileContent);
      if (!Array.isArray(chunks) || chunks.length === 0) {
        return {
          success: false,
          error: '缓存为空'
        };
      }
    } catch (error) {
      console.error('解析缓存失败:', error);
      return {
        success: false,
        error: '缓存文件损坏'
      };
    }
    
    const docxPath = await writeChunksToDocx(tag, title, source, chunks);
    fs.unlinkSync(filePath);
    
    return {
      success: true,
      docxPath
    };
  } catch (error) {
    console.error('提交缓存失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 360,
    height: 420,
    alwaysOnTop: true,
    frame: false,
    transparent: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadFile('app/index.html');
  
  // 自动打开开发者工具（方便调试）
  mainWindow.webContents.openDevTools();

  // 监听窗口关闭事件（默认隐藏，除非允许关闭）
  mainWindow.on('close', (event) => {
    if (!allowWindowClose) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    allowWindowClose = false;
    updateTrayMenu();
  });

  // 监听窗口显示/隐藏事件，更新 tray 菜单
  mainWindow.on('show', () => {
    updateTrayMenu();
  });

  mainWindow.on('hide', () => {
    updateTrayMenu();
  });

  return mainWindow;
}

function createTray() {
  // 创建一个简单的图标（使用系统默认图标或创建一个简单的图标）
  const iconPath = path.join(__dirname, 'app', 'icon.png');
  let trayIcon;
  
  try {
    trayIcon = nativeImage.createFromPath(iconPath);
  } catch (e) {
    // 如果图标不存在，创建一个空的图标
    trayIcon = nativeImage.createEmpty();
  }

  // 如果图标为空或无效，使用模板图标
  if (trayIcon.isEmpty()) {
    trayIcon = nativeImage.createFromNamedImage('NSApplicationIcon');
  }

  tray = new Tray(trayIcon);
  updateTrayMenu();

  // 点击 tray 图标时显示/隐藏窗口
  tray.on('click', () => {
    if (mainWindow) {
      if (!mainWindow.isVisible()) {
        mainWindow.show();
      } else {
        mainWindow.focus();
      }
    } else {
      createWindow();
    }
  });
}

function updateTrayMenu() {
  if (!tray) return;

  const isVisible = mainWindow && mainWindow.isVisible();
  const contextMenu = Menu.buildFromTemplate([
    {
      label: isVisible ? '隐藏窗口' : '显示窗口',
      click: () => {
        if (mainWindow) {
          if (mainWindow.isVisible()) {
            mainWindow.hide();
          } else {
            mainWindow.show();
          }
        } else {
          createWindow();
        }
      }
    },
    {
      label: '退出',
      click: () => {
        isAppQuitting = true;
        allowWindowClose = true;
        if (mainWindow) {
          mainWindow.close();
        }
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.setToolTip('悬浮窗');
}

app.whenReady().then(() => {
  createWindow();
  createTray();

  app.on('activate', () => {
    if (mainWindow) {
      mainWindow.show();
    } else {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // macOS 上即使所有窗口关闭也不退出，保持 tray 运行
  if (process.platform !== 'darwin' || isAppQuitting) {
    app.quit();
  }
});

// 处理应用退出
app.on('before-quit', () => {
  isAppQuitting = true;
  allowWindowClose = true;
});

// IPC 消息处理
ipcMain.on('hide-window', () => {
  if (mainWindow) {
    mainWindow.hide();
  }
});

ipcMain.on('close-window', () => {
  if (mainWindow) {
    allowWindowClose = true;
    isAppQuitting = false;
    mainWindow.close();
  }
});
