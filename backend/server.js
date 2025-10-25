require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ MongoDB Error:', err));

// ========== MONGOOSE SCHEMAS ==========

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  avatar: { type: String, default: '' },
  status: { type: String, enum: ['online', 'offline', 'away'], default: 'offline' },
  lastSeen: { type: Date, default: Date.now },
  settings: {
    theme: { type: String, enum: ['light', 'dark'], default: 'light' },
    notifications: { type: Boolean, default: true }
  },
  createdAt: { type: Date, default: Date.now }
});

const conversationSchema = new mongoose.Schema({
  type: { type: String, enum: ['private', 'group'], required: true },
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  name: { type: String, default: '' },
  lastMessage: {
    text: String,
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    time: Date
  },
  unreadCount: { type: Map, of: Number, default: {} },
  createdAt: { type: Date, default: Date.now }
});

const messageSchema = new mongoose.Schema({
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true },
  type: { type: String, enum: ['text', 'image'], default: 'text' },
  fileUrl: { type: String, default: '' },
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Conversation = mongoose.model('Conversation', conversationSchema);
const Message = mongoose.model('Message', messageSchema);

// ========== JWT MIDDLEWARE ==========

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access denied' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

// ========== FILE UPLOAD SETUP ==========

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only images are allowed'));
  }
});

// ========== AUTH ROUTES ==========

// Sign Up
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    if (username.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
      username,
      password: hashedPassword,
      avatar: username.substring(0, 2).toUpperCase()
    });

    await user.save();

    const token = jwt.sign(
      { id: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        avatar: user.avatar,
        settings: user.settings
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    user.status = 'online';
    await user.save();

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        avatar: user.avatar,
        settings: user.settings
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== USER ROUTES ==========

// Get all users (for starting new chats)
app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    const users = await User.find({ _id: { $ne: req.user.id } })
      .select('username avatar status lastSeen');
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update user settings
app.patch('/api/users/settings', authenticateToken, async (req, res) => {
  try {
    const { theme, notifications } = req.body;
    const user = await User.findById(req.user.id);

    if (theme) user.settings.theme = theme;
    if (notifications !== undefined) user.settings.notifications = notifications;

    await user.save();
    res.json({ settings: user.settings });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== CONVERSATION ROUTES ==========

// Get all conversations for user
app.get('/api/conversations', authenticateToken, async (req, res) => {
  try {
    const conversations = await Conversation.find({
      participants: req.user.id
    })
      .populate('participants', 'username avatar status')
      .populate('lastMessage.sender', 'username')
      .sort({ 'lastMessage.time': -1 });

    res.json(conversations);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Create new conversation (private or group)
app.post('/api/conversations', authenticateToken, async (req, res) => {
  try {
    const { type, participants, name } = req.body;

    if (!participants || participants.length === 0) {
      return res.status(400).json({ error: 'Participants required' });
    }

    // Add current user to participants
    const allParticipants = [...new Set([req.user.id, ...participants])];

    // For private chats, check if conversation already exists
    if (type === 'private' && allParticipants.length === 2) {
      const existingConv = await Conversation.findOne({
        type: 'private',
        participants: { $all: allParticipants, $size: 2 }
      }).populate('participants', 'username avatar status');

      if (existingConv) {
        return res.json(existingConv);
      }
    }

    const conversation = new Conversation({
      type: type || 'private',
      participants: allParticipants,
      name: type === 'group' ? name : ''
    });

    await conversation.save();
    await conversation.populate('participants', 'username avatar status');

    // Emit to all participants
    allParticipants.forEach(participantId => {
      io.to(participantId.toString()).emit('newConversation', conversation);
    });

    res.json(conversation);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== MESSAGE ROUTES ==========

// Get messages for a conversation
app.get('/api/messages/:conversationId', authenticateToken, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const skip = parseInt(req.query.skip) || 0;

    const messages = await Message.find({ conversationId })
      .populate('sender', 'username avatar')
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip);

    res.json(messages.reverse());
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Send message
app.post('/api/messages', authenticateToken, async (req, res) => {
  try {
    const { conversationId, content, type } = req.body;

    if (!content || !conversationId) {
      return res.status(400).json({ error: 'Content and conversation ID required' });
    }

    const message = new Message({
      conversationId,
      sender: req.user.id,
      content,
      type: type || 'text',
      readBy: [req.user.id]
    });

    await message.save();
    await message.populate('sender', 'username avatar');

    // Update conversation last message
    const conversation = await Conversation.findById(conversationId);
    conversation.lastMessage = {
      text: content,
      sender: req.user.id,
      time: new Date()
    };

    // Increment unread count for other participants
    conversation.participants.forEach(participantId => {
      if (participantId.toString() !== req.user.id) {
        const currentCount = conversation.unreadCount.get(participantId.toString()) || 0;
        conversation.unreadCount.set(participantId.toString(), currentCount + 1);
      }
    });

    await conversation.save();

    // Emit to conversation participants
    io.to(conversationId).emit('newMessage', message);

    res.json(message);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Mark messages as read
app.patch('/api/messages/read/:conversationId', authenticateToken, async (req, res) => {
  try {
    const { conversationId } = req.params;

    await Message.updateMany(
      {
        conversationId,
        sender: { $ne: req.user.id },
        readBy: { $ne: req.user.id }
      },
      { $push: { readBy: req.user.id } }
    );

    // Reset unread count
    const conversation = await Conversation.findById(conversationId);
    conversation.unreadCount.set(req.user.id, 0);
    await conversation.save();

    io.to(conversationId).emit('messagesRead', {
      conversationId,
      userId: req.user.id
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== SOCKET.IO ==========

const userSockets = new Map(); // userId -> socketId

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication error'));

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return next(new Error('Authentication error'));
    socket.userId = decoded.id;
    socket.username = decoded.username;
    next();
  });
});

io.on('connection', async (socket) => {
  console.log(`✅ User connected: ${socket.username}`);

  userSockets.set(socket.userId, socket.id);

  // Update user status to online
  await User.findByIdAndUpdate(socket.userId, { status: 'online' });

  // Join user's conversations
  const conversations = await Conversation.find({
    participants: socket.userId
  });

  conversations.forEach(conv => {
    socket.join(conv._id.toString());
  });

  // Join user's personal room
  socket.join(socket.userId);

  // Broadcast online status
  io.emit('userStatusChange', {
    userId: socket.userId,
    status: 'online'
  });

  // Handle typing
  socket.on('typing', ({ conversationId, isTyping }) => {
    socket.to(conversationId).emit('userTyping', {
      userId: socket.userId,
      username: socket.username,
      conversationId,
      isTyping
    });
  });

  // Handle disconnect
  socket.on('disconnect', async () => {
    console.log(`❌ User disconnected: ${socket.username}`);
    userSockets.delete(socket.userId);

    await User.findByIdAndUpdate(socket.userId, {
      status: 'offline',
      lastSeen: new Date()
    });

    io.emit('userStatusChange', {
      userId: socket.userId,
      status: 'offline',
      lastSeen: new Date()
    });
  });
});

// ========== START SERVER ==========

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});