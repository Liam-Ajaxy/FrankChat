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
    origin: [
      'http://localhost:5500',
      'http://localhost:5501',
      'http://localhost:3000',
      'http://127.0.0.1:5500',
      'http://127.0.0.1:5501',
      'https://vibeclass.vercel.app'
    ],
    methods: ['GET', 'POST', 'PATCH', 'DELETE'], // Added PATCH and DELETE
    credentials: true
  }
});


// ===================== CORS MIDDLEWARE =====================
const allowedOrigins = [
  'http://localhost:5500',
  'http://localhost:5501',
  'http://localhost:3000',
  'http://127.0.0.1:5500',
  'http://127.0.0.1:5501',
  'https://vibeclass.vercel.app'
];

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'], // ✅ Include OPTIONS
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// ✅ Add this right below the cors() middleware:
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin);
  res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.sendStatus(204);
});
// ============================================================

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

// ========== UPDATED MESSAGE SCHEMA WITH NEW FIELDS ==========
const messageSchema = new mongoose.Schema({
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true },
  type: { type: String, enum: ['text', 'image'], default: 'text' },
  fileUrl: { type: String, default: '' },
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null }, // NEW
  reactions: { type: Map, of: String, default: {} }, // NEW - userId -> emoji
  edited: { type: Boolean, default: false }, // NEW
  forwarded: { type: Boolean, default: false }, // NEW
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now } // NEW
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
      avatar: username.substring(0, 2).toUpperCase(),
      status: 'offline',
      lastSeen: new Date()
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
        status: user.status,
        lastSeen: user.lastSeen,
        settings: user.settings
      }
    });
  } catch (error) {
    console.error('Signup error:', error);
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

    // Update user status to online
    user.status = 'online';
    user.lastSeen = new Date();
    await user.save();

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        avatar: user.avatar,
        status: user.status,
        lastSeen: user.lastSeen,
        settings: user.settings
      }
    });
  } catch (error) {
    console.error('Login error:', error);
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
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update user settings
app.patch('/api/users/settings', authenticateToken, async (req, res) => {
  try {
    const { theme, notifications } = req.body;
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (theme) user.settings.theme = theme;
    if (notifications !== undefined) user.settings.notifications = notifications;

    await user.save();
    res.json({ settings: user.settings });
  } catch (error) {
    console.error('Update settings error:', error);
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
      .populate('participants', 'username avatar status lastSeen')
      .populate('lastMessage.sender', 'username')
      .sort({ 'lastMessage.time': -1 });

    res.json(conversations);
  } catch (error) {
    console.error('Get conversations error:', error);
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
      }).populate('participants', 'username avatar status lastSeen');

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
    await conversation.populate('participants', 'username avatar status lastSeen');

    // Emit to all participants
    allParticipants.forEach(participantId => {
      io.to(participantId.toString()).emit('newConversation', conversation);
    });

    res.json(conversation);
  } catch (error) {
    console.error('Create conversation error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== MESSAGE ROUTES ==========

// ========== UPDATED: Get messages with reply population ==========
app.get('/api/messages/:conversationId', authenticateToken, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const skip = parseInt(req.query.skip) || 0;

    // Verify user is participant of this conversation
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: req.user.id
    });

    if (!conversation) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const messages = await Message.find({ conversationId })
      .populate('sender', 'username avatar')
      .populate({
        path: 'replyTo',
        populate: { path: 'sender', select: 'username avatar' }
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip);

    res.json(messages.reverse());
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== UPDATED: Send message with reply support ==========
app.post('/api/messages', authenticateToken, async (req, res) => {
  try {
    const { conversationId, content, type, replyTo, forwarded } = req.body;

    if (!content || !conversationId) {
      return res.status(400).json({ error: 'Content and conversation ID required' });
    }

    // Verify user is participant
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: req.user.id
    });

    if (!conversation) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // If replying, verify the replied message exists in this conversation
    if (replyTo) {
      const repliedMessage = await Message.findOne({
        _id: replyTo,
        conversationId: conversationId
      });

      if (!repliedMessage) {
        return res.status(400).json({ error: 'Replied message not found' });
      }
    }

    const message = new Message({
      conversationId,
      sender: req.user.id,
      content,
      type: type || 'text',
      readBy: [req.user.id],
      replyTo: replyTo || null,
      forwarded: forwarded || false,
      reactions: new Map()
    });

    await message.save();
    await message.populate('sender', 'username avatar');
    
    // If this is a reply, populate the replied message too
    if (message.replyTo) {
      await message.populate({
        path: 'replyTo',
        populate: { path: 'sender', select: 'username avatar' }
      });
    }

    // Update conversation last message
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
    io.to(conversationId).emit('newMessage', {
      ...message.toObject(),
      conversationId: conversationId
    });

    res.json(message);
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== NEW: Edit Message ==========
app.patch('/api/messages/:messageId', authenticateToken, async (req, res) => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Content is required' });
    }

    // Find message
    const message = await Message.findById(messageId).populate('sender', 'username avatar');

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Verify user is the sender
    if (message.sender._id.toString() !== req.user.id) {
      return res.status(403).json({ error: 'You can only edit your own messages' });
    }

    // Update message
    message.content = content.trim();
    message.edited = true;
    message.updatedAt = new Date();
    await message.save();

    // Populate sender again after save
    await message.populate('sender', 'username avatar');
    
    // Populate reply if exists
    if (message.replyTo) {
      await message.populate({
        path: 'replyTo',
        populate: { path: 'sender', select: 'username avatar' }
      });
    }

    // Emit update to conversation participants
    io.to(message.conversationId.toString()).emit('messageUpdated', message);

    res.json(message);
  } catch (error) {
    console.error('Edit message error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== NEW: Delete Message ==========
app.delete('/api/messages/:messageId', authenticateToken, async (req, res) => {
  try {
    const { messageId } = req.params;

    // Find message
    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Verify user is the sender
    if (message.sender.toString() !== req.user.id) {
      return res.status(403).json({ error: 'You can only delete your own messages' });
    }

    const conversationId = message.conversationId;

    // Delete message
    await Message.findByIdAndDelete(messageId);

    // Update conversation's last message if this was the last message
    const conversation = await Conversation.findById(conversationId);
    if (conversation && conversation.lastMessage) {
      // Check if deleted message was the last message
      if (conversation.lastMessage.text === message.content) {
        // Find new last message
        const lastMessage = await Message.findOne({ conversationId })
          .sort({ createdAt: -1 })
          .limit(1);

        if (lastMessage) {
          conversation.lastMessage = {
            text: lastMessage.content,
            sender: lastMessage.sender,
            time: lastMessage.createdAt
          };
        } else {
          conversation.lastMessage = null;
        }
        await conversation.save();
      }
    }

    // Emit delete to conversation participants
    io.to(conversationId.toString()).emit('messageDeleted', {
      messageId,
      conversationId
    });

    res.json({ success: true, messageId });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== NEW: Add/Remove Reaction ==========
app.patch('/api/messages/:messageId/react', authenticateToken, async (req, res) => {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body;

    if (!emoji) {
      return res.status(400).json({ error: 'Emoji is required' });
    }

    // Find message
    const message = await Message.findById(messageId).populate('sender', 'username avatar');

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Verify user is participant of the conversation
    const conversation = await Conversation.findOne({
      _id: message.conversationId,
      participants: req.user.id
    });

    if (!conversation) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Initialize reactions map if it doesn't exist
    if (!message.reactions) {
      message.reactions = new Map();
    }

    // Toggle reaction - if same emoji exists, remove it; otherwise add/update
    const currentReaction = message.reactions.get(req.user.id);
    
    if (currentReaction === emoji) {
      // Remove reaction
      message.reactions.delete(req.user.id);
    } else {
      // Add or update reaction
      message.reactions.set(req.user.id, emoji);
    }

    message.markModified('reactions');
    await message.save();

    // Populate sender again
    await message.populate('sender', 'username avatar');
    
    // Populate reply if exists
    if (message.replyTo) {
      await message.populate({
        path: 'replyTo',
        populate: { path: 'sender', select: 'username avatar' }
      });
    }

    // Emit reaction update to conversation participants
    io.to(message.conversationId.toString()).emit('messageReactionUpdated', {
      messageId: message._id,
      reactions: Object.fromEntries(message.reactions),
      userId: req.user.id,
      emoji: currentReaction === emoji ? null : emoji
    });

    res.json(message);
  } catch (error) {
    console.error('React to message error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Mark messages as read
app.patch('/api/messages/read/:conversationId', authenticateToken, async (req, res) => {
  try {
    const { conversationId } = req.params;

    // Verify user is participant
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: req.user.id
    });

    if (!conversation) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await Message.updateMany(
      {
        conversationId,
        sender: { $ne: req.user.id },
        readBy: { $ne: req.user.id }
      },
      { $push: { readBy: req.user.id } }
    );

    // Reset unread count
    conversation.unreadCount.set(req.user.id, 0);
    await conversation.save();

    io.to(conversationId).emit('messagesRead', {
      conversationId,
      userId: req.user.id
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Upload image endpoint (optional for future use)
app.post('/api/upload', authenticateToken, upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    res.json({ fileUrl: `/uploads/${req.file.filename}` });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
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
  console.log(`✅ User connected: ${socket.username} (${socket.userId})`);

  userSockets.set(socket.userId, socket.id);

  try {
    // Update user status to online
    await User.findByIdAndUpdate(socket.userId, {
      status: 'online',
      lastSeen: new Date()
    });

    // Join user's conversations
    const conversations = await Conversation.find({
      participants: socket.userId
    });

    conversations.forEach(conv => {
      socket.join(conv._id.toString());
    });

    // Join user's personal room
    socket.join(socket.userId);

    // Broadcast online status to all users
    io.emit('userStatusChange', {
      userId: socket.userId,
      status: 'online',
      lastSeen: new Date()
    });

    // Handle typing indicator
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
      console.log(`❌ User disconnected: ${socket.username} (${socket.userId})`);
      userSockets.delete(socket.userId);

      const lastSeenTime = new Date();

      try {
        await User.findByIdAndUpdate(socket.userId, {
          status: 'offline',
          lastSeen: lastSeenTime
        });

        // Broadcast offline status to all users
        io.emit('userStatusChange', {
          userId: socket.userId,
          status: 'offline',
          lastSeen: lastSeenTime
        });
      } catch (error) {
        console.error('Error updating user status on disconnect:', error);
      }
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });

  } catch (error) {
    console.error('Socket connection error:', error);
  }
});

// ========== ERROR HANDLING ==========

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ========== START SERVER ==========

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
});