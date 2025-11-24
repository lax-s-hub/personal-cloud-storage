const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

// ============ CONFIGURATION ============
const STORAGE_DIR = './storage';
const userDir = path.join(STORAGE_DIR, 'user_1');

if (!fs.existsSync(userDir)) {
  fs.mkdirSync(userDir, { recursive: true });
}

// ============ MULTER SETUP ============
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, userDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ storage: storage });

// ============ API ENDPOINTS ============

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'Server running ✅',
    timestamp: new Date(),
    version: '1.0.0'
  });
});

// Upload File
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ 
      success: false,
      error: 'No file uploaded' 
    });
  }
  
  res.json({
    success: true,
    message: 'File uploaded successfully!',
    file: {
      originalName: req.file.originalname,
      size: req.file.size,
      uploadDate: new Date(),
      mimeType: req.file.mimetype
    }
  });
});

// Get All Files
app.get('/api/files', (req, res) => {
  fs.readdir(userDir, (err, files) => {
    if (err) {
      return res.status(500).json({ 
        success: false,
        error: 'Cannot read files' 
      });
    }
    
    // Get file stats
    const fileDetails = files.map(file => {
      const filePath = path.join(userDir, file);
      const stats = fs.statSync(filePath);
      return {
        name: file,
        size: stats.size,
        uploadDate: stats.birthtime
      };
    });
    
    const totalSize = fileDetails.reduce((sum, f) => sum + f.size, 0);

    res.json({
      success: true,
      files: files,
      fileDetails: fileDetails,
      totalFiles: files.length,
      totalStorageUsed: totalSize,
      storageLimit: '1GB'
    });
  });
});

// Get File Info
app.get('/api/files/:filename', (req, res) => {
  const filePath = path.join(userDir, req.params.filename);
  
  fs.stat(filePath, (err, stats) => {
    if (err) {
      return res.status(404).json({ 
        success: false,
        error: 'File not found' 
      });
    }
    
    res.json({
      success: true,
      filename: req.params.filename,
      size: stats.size,
      createdAt: stats.birthtime,
      updatedAt: stats.mtime
    });
  });
});

// PREVIEW FILE
function previewFile(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  
  // Images
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
    const fileUrl = `file:///C:/Users/laxmi/personal-cloud-storage/storage/user_1/${filename}`;
    
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    `;
    
    modal.innerHTML = `
      <div style="position: relative; max-width: 90%; max-height: 90%;">
        <img src="${fileUrl}" style="max-width: 100%; max-height: 100%; border-radius: 8px;">
        <button onclick="this.closest('div').parentElement.remove()" style="
          position: absolute;
          top: 10px;
          right: 10px;
          width: 40px;
          height: 40px;
          background: white;
          border: none;
          border-radius: 50%;
          cursor: pointer;
          font-size: 20px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        ">✕</button>
      </div>
    `;
    
    document.body.appendChild(modal);
    showStatus(`✅ Preview: ${filename}`, 'success');
  }
  
  // PDF
  else if (ext === 'pdf') {
    const fileUrl = `file:///C:/Users/laxmi/personal-cloud-storage/storage/user_1/${filename}`;
    window.open(fileUrl, '_blank');
    showStatus(`✅ Opening: ${filename}`, 'success');
  }
  
  // Text files
  else if (['txt', 'csv', 'json'].includes(ext)) {
    fetch(`file:///C:/Users/laxmi/personal-cloud-storage/storage/user_1/${filename}`)
      .then(r => r.text())
      .then(content => {
        const modal = document.createElement('div');
        modal.style.cssText = `
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: white;
          padding: 20px;
          border-radius: 8px;
          max-width: 600px;
          max-height: 600px;
          overflow: auto;
          z-index: 1000;
          box-shadow: 0 5px 40px rgba(0,0,0,0.3);
        `;
        
        modal.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
            <h3>${filename}</h3>
            <button onclick="this.closest('div').parentElement.remove()" style="
              border: none;
              background: none;
              font-size: 20px;
              cursor: pointer;
            ">✕</button>
          </div>
          <pre style="
            background: #f5f5f5;
            padding: 15px;
            border-radius: 4px;
            overflow: auto;
            max-height: 500px;
            font-size: 12px;
          ">${content}</pre>
        `;
        
        document.body.appendChild(modal);
        showStatus(`✅ Preview: ${filename}`, 'success');
      });
  }
  
  // Unsupported
  else {
    showStatus(`📥 Please download this file type to view`, 'error');
  }
}

// DOWNLOAD FILE - NEW ENDPOINT ADD KAR
app.get('/api/download/:filename', (req, res) => {
  const filePath = path.join(userDir, req.params.filename);
  
  fs.exists(filePath, (exists) => {
    if (!exists) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    res.download(filePath, req.params.filename);
  });
});

// VIEW FILE (SERVE IMAGE FILES)
app.get('/api/view/:filename', (req, res) => {
  const filePath = path.join(userDir, req.params.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  // Set proper MIME type
  const ext = filePath.split('.').pop().toLowerCase();
  let mimeType = 'application/octet-stream';
  if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
  else if (ext === 'png') mimeType = 'image/png';
  else if (ext === 'gif') mimeType = 'image/gif';
  else if (ext === 'pdf') mimeType = 'application/pdf';
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.sendFile(filePath);
});


// Delete File
app.delete('/api/files/:filename', (req, res) => {
  const filePath = path.join(userDir, req.params.filename);
  
  fs.unlink(filePath, (err) => {
    if (err) {
      return res.status(500).json({ 
        success: false,
        error: 'Cannot delete file' 
      });
    }
    
    res.json({ 
      success: true, 
      message: 'File deleted successfully',
      deletedFile: req.params.filename
    });
  });
});

// Search Files
app.get('/api/search/:query', (req, res) => {
  fs.readdir(userDir, (err, files) => {
    if (err) {
      return res.status(500).json({ error: 'Error searching files' });
    }
    
    const query = req.params.query.toLowerCase();
    const results = files.filter(file => 
      file.toLowerCase().includes(query)
    );
    
    res.json({
      success: true,
      query: query,
      results: results,
      count: results.length
    });
  });
});

// Get Storage Stats
app.get('/api/stats', (req, res) => {
  fs.readdir(userDir, (err, files) => {
    if (err) {
      return res.status(500).json({ error: 'Error reading stats' });
    }
    
    let totalSize = 0;
    files.forEach(file => {
      const filePath = path.join(userDir, file);
      const stats = fs.statSync(filePath);
      totalSize += stats.size;
    });
    
    res.json({
      success: true,
      totalFiles: files.length,
      totalStorage: formatBytes(totalSize),
      storageUsed: totalSize,
      storageLimit: 1073741824, // 1GB in bytes
      usagePercentage: ((totalSize / 1073741824) * 100).toFixed(2)
    });
  });
});

// Helper function
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// START SERVER
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`
  ╔════════════════════════════════════════╗
  ║  🚀 PERSONAL CLOUD STORAGE - RUNNING   ║
  ║  Server: http://localhost:${PORT}      
  ║  Storage: ${STORAGE_DIR}               
  ║  Status: ✅ READY                      
  ╚════════════════════════════════════════╝
  `);
});
