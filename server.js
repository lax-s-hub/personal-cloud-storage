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
