const dns = require("dns");
dns.setServers(["1.1.1.1", "8.8.8.8"]);
const User = require("./models/User");
const mongoose = require("mongoose");
const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const File = require("./models/File");
const app = express();
const crypto = require("crypto");

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.log("MongoDB error:", err));

mongoose.connection.on("connected", () => {
  console.log("MongoDB connected");
});

mongoose.connection.on("error", (err) => {
  console.log("MongoDB error:", err);
});

// ============ CONFIGURATION ============
const STORAGE_DIR = "./storage";
const userDir = path.join(STORAGE_DIR, "user_1");

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
  },
});

const upload = multer({ storage: storage });

// ============ API ENDPOINTS ============
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "landing.html"));
});
app.get("/signup.html", (req, res) => {
  res.sendFile(path.join(__dirname, "signup.html"));
});

app.get("/login.html", (req, res) => {
  res.sendFile(path.join(__dirname, "login.html"));
});

app.get("/index.html", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Is route ka kaam hai:
// frontend se data lena
// check karna email pehle se hai ya nahi
// MongoDB me new user save karna
app.post("/api/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    const newUser = new User({
      name,
      email,
      password,
    });

    await newUser.save();

    res.status(201).json({
      message: "User registered successfully",
    });
  } catch (error) {
    res.status(500).json({
      message: "Server error",
    });
  }
});

const jwt = require("jsonwebtoken");

const JWT_SECRET = "cloudstore_secret_2026";

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Invalid token format" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
}

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { userId: user._id, email: user.email },
      JWT_SECRET,
      { expiresIn: "7d" },
    );

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

app.get("/api/folders", authMiddleware, async (req, res) => {
  try {
    const folders = await File.distinct("folderName", {
      userId: req.user.userId,
      isDeleted: false,
    });

    res.json({
      success: true,
      folders: folders.filter(Boolean),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch folders",
    });
  }
});

app.post("/api/folders", authMiddleware, async (req, res) => {
  try {
    const { folderName } = req.body;

    if (!folderName || !folderName.trim()) {
      return res.status(400).json({
        success: false,
        error: "Folder name required",
      });
    }

    const exists = await File.findOne({
      userId: req.user.userId,
      folderName: folderName.trim(),
    });

    if (exists) {
      return res.json({
        success: true,
        message: "Folder already exists",
        folderName: folderName.trim(),
      });
    }

    const dummyFolderDoc = new File({
      userId: req.user.userId,
      originalName: "__folder__",
      storedName: "__folder__",
      filePath: "__folder__",
      size: 0,
      mimeType: "folder",
      folderName: folderName.trim(),
      isFolderPlaceholder: true,
    });

    await dummyFolderDoc.save();

    res.json({
      success: true,
      message: "Folder created",
      folderName: folderName.trim(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Folder creation failed",
    });
  }
});

app.put("/api/files/share/:id", authMiddleware, async (req, res) => {
  try {
    const file = await File.findOne({
      _id: req.params.id,
      userId: req.user.userId,
    });

    if (!file) {
      return res.status(404).json({
        success: false,
        error: "File not found",
      });
    }

    file.shared = true;
    file.shareToken = crypto.randomBytes(16).toString("hex");
    await file.save();

    res.json({
      success: true,
      message: "Share link created",
      shareLink: `/share/${file.shareToken}`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Share failed",
    });
  }
});

app.get("/share/:token", async (req, res) => {
  try {
    const file = await File.findOne({ shareToken: req.params.token });

    if (!file) {
      return res.status(404).send("File not found");
    }

    res.sendFile(path.resolve(file.filePath));
  } catch (error) {
    res.status(500).send("Share open failed");
  }
});

// Health Check
app.get("/api/health", (req, res) => {
  res.json({
    status: "Server running ✅",
    timestamp: new Date(),
    version: "1.0.0",
  });
});

// Upload File
app.post(
  "/api/upload",
  authMiddleware,
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: "No file uploaded",
        });
      }

      const newFile = new File({
        userId: req.user.userId,
        originalName: req.file.originalname,
        storedName: req.file.filename,
        filePath: req.file.path,
        size: req.file.size,
        mimeType: req.file.mimetype,
      });

      await newFile.save();

      res.json({
        success: true,
        message: "File uploaded successfully!",
        file: newFile,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "File upload failed",
      });
    }
  },
);

// Get All Files
app.get("/api/files", authMiddleware, async (req, res) => {
  try {
    const files = await File.find({
      userId: req.user.userId,
      isDeleted: false,
      isFolderPlaceholder: { $ne: true },
    }).sort({
      createdAt: -1,
    });

    const totalSize = files.reduce((sum, file) => sum + file.size, 0);

    res.json({
      success: true,
      files,
      totalFiles: files.length,
      totalStorageUsed: totalSize,
      storageLimit: "1GB",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Cannot fetch files",
    });
  }
});

// Get File Info
app.get("/api/files/:filename", authMiddleware, (req, res) => {
  const filePath = path.join(userDir, req.params.filename);

  fs.stat(filePath, (err, stats) => {
    if (err) {
      return res.status(404).json({
        success: false,
        error: "File not found",
      });
    }

    res.json({
      success: true,
      filename: req.params.filename,
      size: stats.size,
      createdAt: stats.birthtime,
      updatedAt: stats.mtime,
    });
  });
});

app.get("/api/files/download/:id", authMiddleware, async (req, res) => {
  try {
    const file = await File.findOne({
      _id: req.params.id,
      userId: req.user.userId,
    });

    if (!file) {
      return res.status(404).json({
        success: false,
        error: "File not found",
      });
    }

    res.download(file.filePath, file.originalName);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Download failed",
    });
  }
});

// VIEW FILE (SERVE IMAGE FILES)

app.get("/api/view/:id", authMiddleware, async (req, res) => {
  try {
    const file = await File.findOne({
      _id: req.params.id,
      userId: req.user.userId,
    });

    if (!file) {
      return res.status(404).json({ error: "File not found" });
    }

    res.sendFile(path.resolve(file.filePath));
  } catch (error) {
    res.status(500).json({ error: "Preview failed" });
  }
});

app.get("/api/trash", authMiddleware, async (req, res) => {
  try {
    const files = await File.find({
      userId: req.user.userId,
      isDeleted: true,
    }).sort({
      deletedAt: -1,
    });

    res.json({
      success: true,
      files,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Cannot fetch trash files",
    });
  }
});

// Delete File
app.delete("/api/files/:id", authMiddleware, async (req, res) => {
  try {
    const file = await File.findOne({
      _id: req.params.id,
      userId: req.user.userId,
    });

    if (!file) {
      return res.status(404).json({
        success: false,
        error: "File not found",
      });
    }

    file.isDeleted = true;
    file.deletedAt = new Date();
    await file.save();

    res.json({
      success: true,
      message: "File moved to trash",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Cannot delete file",
    });
  }
});

app.put("/api/files/move/:id", authMiddleware, async (req, res) => {
  try {
    const { folderName } = req.body;

    if (!folderName || !folderName.trim()) {
      return res.status(400).json({
        success: false,
        error: "Folder name is required",
      });
    }

    const file = await File.findOne({
      _id: req.params.id,
      userId: req.user.userId,
      isDeleted: false,
    });

    if (!file) {
      return res.status(404).json({
        success: false,
        error: "File not found",
      });
    }

    file.folderName = folderName.trim();
    await file.save();

    res.json({
      success: true,
      message: "File moved successfully",
      file,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Move failed",
    });
  }
});

// Search Files
app.get("/api/search/:query", authMiddleware, (req, res) => {
  fs.readdir(userDir, (err, files) => {
    if (err) {
      return res.status(500).json({ error: "Error searching files" });
    }

    const query = req.params.query.toLowerCase();
    const results = files.filter((file) => file.toLowerCase().includes(query));

    res.json({
      success: true,
      query: query,
      results: results,
      count: results.length,
    });
  });
});

app.put("/api/files/rename/:id", authMiddleware, async (req, res) => {
  try {
    const { newName } = req.body;

    if (!newName || !newName.trim()) {
      return res.status(400).json({
        success: false,
        error: "New name is required",
      });
    }

    const file = await File.findOne({
      _id: req.params.id,
      userId: req.user.userId,
    });

    if (!file) {
      return res.status(404).json({
        success: false,
        error: "File not found",
      });
    }

    const oldPath = file.filePath;
    const ext = path.extname(file.storedName);
    const safeName = newName.trim();
    const newStoredName = `${Date.now()}-${safeName}`;
    const newPath = path.join(userDir, newStoredName);

    fs.renameSync(oldPath, newPath);

    file.originalName = safeName;
    file.storedName = newStoredName;
    file.filePath = newPath;

    await file.save();

    res.json({
      success: true,
      message: "File renamed successfully",
      file,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Rename failed",
    });
  }
});

app.put("/api/files/star/:id", authMiddleware, async (req, res) => {
  try {
    const file = await File.findOne({
      _id: req.params.id,
      userId: req.user.userId,
    });

    if (!file) {
      return res.status(404).json({
        success: false,
        error: "File not found",
      });
    }

    file.isStarred = !file.isStarred;
    await file.save();

    res.json({
      success: true,
      message: file.isStarred ? "File starred" : "File unstarred",
      file,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Star update failed",
    });
  }
});

app.put("/api/files/restore/:id", authMiddleware, async (req, res) => {
  try {
    const file = await File.findOne({
      _id: req.params.id,
      userId: req.user.userId,
    });

    if (!file) {
      return res.status(404).json({
        success: false,
        error: "File not found",
      });
    }

    file.isDeleted = false;
    file.deletedAt = null;
    await file.save();

    res.json({
      success: true,
      message: "File restored successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Restore failed",
    });
  }
});

app.delete("/api/files/permanent/:id", authMiddleware, async (req, res) => {
  try {
    const file = await File.findOne({
      _id: req.params.id,
      userId: req.user.userId,
    });

    if (!file) {
      return res.status(404).json({
        success: false,
        error: "File not found",
      });
    }

    if (fs.existsSync(file.filePath)) {
      fs.unlinkSync(file.filePath);
    }

    await File.deleteOne({ _id: file._id });

    res.json({
      success: true,
      message: "File permanently deleted",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Permanent delete failed",
    });
  }
});

// Get Storage Stats
app.get("/api/stats", authMiddleware, (req, res) => {
  fs.readdir(userDir, (err, files) => {
    if (err) {
      return res.status(500).json({ error: "Error reading stats" });
    }

    let totalSize = 0;
    files.forEach((file) => {
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
      usagePercentage: ((totalSize / 1073741824) * 100).toFixed(2),
    });
  });
});

// Helper function
function formatBytes(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
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
