// ========== STATE MANAGEMENT ==========
const state = {
  token: localStorage.getItem('token') || null,
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  conversations: [],
  currentConversation: null,
  currentView: 'chats', // 'chats', 'groups', 'unread'
  users: [],
  messages: {},
  socket: null,
  typingTimeouts: {}
};

// Detect environment
const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

// Backend base URL (Render, Railway, etc. for production)
const API_URL = isDev
  ? 'http://localhost:3000/api'
  : 'https://frankchat-pi4x.onrender.com/api';

// Socket URL
const SOCKET_URL = isDev
  ? 'http://localhost:3000'
  : 'https://frankchat-pi4x.onrender.com';


// ========= USERNAME VALIDATION ==========
function validateUsername(username) {
  // Check length
  if (username.length < 3 || username.length > 20) {
    return { valid: false, error: 'Username must be 3-20 characters' };
  }
  
  // Check allowed characters (alphanumeric, underscore, hyphen only)
  const usernameRegex = /^[a-zA-Z0-9_-]+$/;
  if (!usernameRegex.test(username)) {
    return { valid: false, error: 'Username can only contain letters, numbers, underscore, and hyphen' };
  }
  
  // Check if starts with letter or number
  if (!/^[a-zA-Z0-9]/.test(username)) {
    return { valid: false, error: 'Username must start with a letter or number' };
  }
  
  return { valid: true };
}

// ========== INITIALIZE ==========
document.addEventListener('DOMContentLoaded', () => {
  if (state.token && state.user) {
    initializeChat();
  }
});

// ========== LOADING OVERLAY ==========
function showLoading(message = 'Loading...') {
  let overlay = document.getElementById('loadingOverlay');
  
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'loadingOverlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      color: white;
      font-size: 16px;
    `;
    
    overlay.innerHTML = `
      <div style="width: 40px; height: 40px; border: 4px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 15px;"></div>
      <div id="loadingMessage">${message}</div>
    `;
    
    // Add spinner animation
    if (!document.getElementById('spinnerAnimation')) {
      const style = document.createElement('style');
      style.id = 'spinnerAnimation';
      style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
      document.head.appendChild(style);
    }
    
    document.body.appendChild(overlay);
  } else {
    overlay.style.display = 'flex';
    document.getElementById('loadingMessage').textContent = message;
  }
}

function hideLoading() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
}

// ========== AUTH FUNCTIONS ==========
function showAuthModal(tab) {
  const modal = document.getElementById('authModal');
  modal.classList.add('active');
  switchAuthTab(tab);
}

function closeAuthModal() {
  document.getElementById('authModal').classList.remove('active');
  document.getElementById('loginError').classList.remove('active');
  document.getElementById('signupError').classList.remove('active');
  document.getElementById('loginForm').reset();
  document.getElementById('signupForm').reset();
}

function switchAuthTab(tab) {
  const loginTab = document.getElementById('loginTab');
  const signupTab = document.getElementById('signupTab');
  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');
  
  if (tab === 'login') {
    loginTab.classList.add('active');
    signupTab.classList.remove('active');
    loginForm.style.display = 'block';
    signupForm.style.display = 'none';
  } else {
    loginTab.classList.remove('active');
    signupTab.classList.add('active');
    loginForm.style.display = 'none';
    signupForm.style.display = 'block';
  }
}

// Login Form Handler
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errorEl = document.getElementById('loginError');
  
  showLoading('Signing in...');
  
  try {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      hideLoading();
      errorEl.textContent = data.error || 'Login failed';
      errorEl.classList.add('active');
      return;
    }
    
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    
    closeAuthModal();
    await initializeChat();
    hideLoading();
  } catch (error) {
    hideLoading();
    errorEl.textContent = 'Connection error. Please try again.';
    errorEl.classList.add('active');
  }
});

// Signup Form Handler
document.getElementById('signupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('signupUsername').value.trim();
  const password = document.getElementById('signupPassword').value;
  const confirmPassword = document.getElementById('signupPasswordConfirm').value;
  const errorEl = document.getElementById('signupError');

  // VALIDATE USERNAME
  const validation = validateUsername(username);
  if (!validation.valid) {
    errorEl.textContent = validation.error;
    errorEl.classList.add('active');
    return;
  }
  
  if (password !== confirmPassword) {
    errorEl.textContent = 'Passwords do not match';
    errorEl.classList.add('active');
    return;
  }
  
  showLoading('Creating account...');
  
  try {
    const response = await fetch(`${API_URL}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      hideLoading();
      errorEl.textContent = data.error || 'Signup failed';
      errorEl.classList.add('active');
      return;
    }
    
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    
    closeAuthModal();
    await initializeChat();
    hideLoading();
  } catch (error) {
    hideLoading();
    errorEl.textContent = 'Connection error. Please try again.';
    errorEl.classList.add('active');
  }
});

// ========== CHAT INITIALIZATION ==========
async function initializeChat() {
  showLoading('Setting up your chat...');
  
  document.getElementById('landingPage').style.display = 'none';
  document.getElementById('chatApp').style.display = 'grid';
  
  // Update sidebar user info (legacy support)
  const sidebarUsername = document.getElementById('sidebarUsername');
  const sidebarAvatar = document.getElementById('sidebarAvatar');
  if (sidebarUsername) sidebarUsername.textContent = state.user.username;
  if (sidebarAvatar) sidebarAvatar.textContent = state.user.avatar;
  
  // Update nav panel avatar (new design support)
  const navAvatar = document.getElementById('navAvatar');
  if (navAvatar) navAvatar.textContent = state.user.avatar;
  
  // Initialize Socket.IO
  initializeSocket();
  
  // Load conversations
  await loadConversations();
  
  // Load users
  await loadUsers();
  
  // Update unread badges
  updateUnreadBadges();
  
  // Apply saved theme
  if (state.user.settings && state.user.settings.theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    const themeSelect = document.getElementById('themeSelect');
    if (themeSelect) themeSelect.value = 'dark';
  }
  
  const notificationsToggle = document.getElementById('notificationsToggle');
  if (notificationsToggle && state.user.settings) {
    notificationsToggle.checked = state.user.settings.notifications;
  }
  
  hideLoading();
}

// ========== SOCKET.IO ==========
function initializeSocket() {
  state.socket = io(SOCKET_URL, {
    auth: { token: state.token }
  });
  
  state.socket.on('connect', () => {
    console.log('✅ Connected to socket');
  });
  
  state.socket.on('newMessage', (message) => {
    handleNewMessage(message);
  });
  
  state.socket.on('userStatusChange', ({ userId, status, lastSeen }) => {
    updateUserStatus(userId, status, lastSeen);
  });
  
  state.socket.on('userTyping', ({ userId, username, conversationId, isTyping }) => {
    handleTypingIndicator(userId, username, conversationId, isTyping);
  });
  
  state.socket.on('newConversation', (conversation) => {
    addConversation(conversation);
  });
  
  state.socket.on('messagesRead', ({ conversationId, userId }) => {
    markMessagesAsRead(conversationId, userId);
  });
}

// ========== CONVERSATIONS ==========
async function loadConversations() {
  try {
    const response = await fetch(`${API_URL}/conversations`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    
    if (!response.ok) throw new Error('Failed to load conversations');
    
    state.conversations = await response.json();
    renderConversations();
  } catch (error) {
    console.error('Error loading conversations:', error);
  }
}

function renderConversations() {
  const container = document.getElementById('conversationsList');
  const searchInput = document.getElementById('searchConversations');
  const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
  
  // Filter based on current view and search
  let filtered = state.conversations.filter(conv => {
    const name = getConversationName(conv).toLowerCase();
    const matchesSearch = name.includes(searchTerm);
    
    if (!matchesSearch) return false;
    
    if (state.currentView === 'groups') {
      return conv.type === 'group';
    } else if (state.currentView === 'unread') {
      const unreadCount = conv.unreadCount?.[state.user.id] || 0;
      return unreadCount > 0;
    }
    
    return true; // 'chats' shows all
  });
  
  // Remove loading indicator if exists
  const loadingDiv = container.querySelector('.loading-conversations');
  if (loadingDiv) loadingDiv.remove();
  
  if (filtered.length === 0) {
    let emptyMessage = 'No conversations yet';
    if (state.currentView === 'groups') emptyMessage = 'No group chats yet';
    if (state.currentView === 'unread') emptyMessage = 'No unread messages';
    
    container.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--text-light);">${emptyMessage}</div>`;
    return;
  }
  
  container.innerHTML = filtered.map(conv => {
    const name = getConversationName(conv);
    const avatar = getConversationAvatar(conv);
    const lastMsg = conv.lastMessage;
    const unreadCount = conv.unreadCount?.[state.user.id] || 0;
    const isActive = state.currentConversation?._id === conv._id;
    
    // Truncate preview to 40 characters
    let preview = 'No messages yet';
    if (lastMsg) {
      const escapedText = escapeHtml(lastMsg.text);
      preview = escapedText.length > 40 ? escapedText.substring(0, 40) + '...' : escapedText;
    }
    
    return `
      <div class="conversation-item ${isActive ? 'active' : ''}" onclick="openConversation('${conv._id}')">
        <div class="avatar">${avatar}</div>
        <div class="conversation-info">
          <div class="conversation-header">
            <div class="conversation-name">${name}</div>
            <div class="conversation-time">${lastMsg ? formatTime(lastMsg.time) : ''}</div>
          </div>
          <div class="conversation-preview">${preview}</div>
        </div>
        ${unreadCount > 0 ? `<div class="unread-badge">${unreadCount}</div>` : ''}
      </div>
    `;
  }).join('');
  
  updateUnreadBadges();
}

function getConversationName(conv) {
  if (conv.type === 'group') {
    return conv.name || 'Group Chat';
  }
  const otherUser = conv.participants.find(p => p._id !== state.user.id);
  return otherUser ? otherUser.username : 'Unknown';
}

function getConversationAvatar(conv) {
  if (conv.type === 'group') {
    return conv.name ? conv.name.substring(0, 2).toUpperCase() : 'GC';
  }
  const otherUser = conv.participants.find(p => p._id !== state.user.id);
  return otherUser ? otherUser.avatar : 'U';
}

function addConversation(conversation) {
  const exists = state.conversations.find(c => c._id === conversation._id);
  if (!exists) {
    state.conversations.unshift(conversation);
    renderConversations();
  }
}

// Update unread badges in navigation
function updateUnreadBadges() {
  const totalUnread = state.conversations.reduce((sum, conv) => {
    return sum + (conv.unreadCount?.[state.user.id] || 0);
  }, 0);
  
  const groupsUnread = state.conversations
    .filter(c => c.type === 'group')
    .reduce((sum, conv) => {
      return sum + (conv.unreadCount?.[state.user.id] || 0);
    }, 0);
  
  // Update badges if they exist in the DOM
  const chatsBadge = document.getElementById('chatsBadge');
  const groupsBadge = document.getElementById('groupsBadge');
  const unreadBadge = document.getElementById('unreadBadge');
  
  if (chatsBadge) {
    if (totalUnread > 0) {
      chatsBadge.textContent = totalUnread;
      chatsBadge.style.display = 'flex';
    } else {
      chatsBadge.style.display = 'none';
    }
  }
  
  if (groupsBadge) {
    if (groupsUnread > 0) {
      groupsBadge.textContent = groupsUnread;
      groupsBadge.style.display = 'flex';
    } else {
      groupsBadge.style.display = 'none';
    }
  }
  
  if (unreadBadge) {
    if (totalUnread > 0) {
      unreadBadge.textContent = totalUnread;
      unreadBadge.style.display = 'flex';
    } else {
      unreadBadge.style.display = 'none';
    }
  }
}

// Switch view function (to be called from HTML)
function switchView(view) {
  state.currentView = view;
  renderConversations();
  
  // Update active nav item if exists
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
  });
  const activeNav = document.querySelector(`[onclick="switchView('${view}')"]`);
  if (activeNav) activeNav.classList.add('active');
}

// Search conversations
const searchInput = document.getElementById('searchConversations');
if (searchInput) {
  searchInput.addEventListener('input', renderConversations);
}

// ========== OPEN CONVERSATION ==========
async function openConversation(conversationId) {
  const conv = state.conversations.find(c => c._id === conversationId);
  if (!conv) return;
  
  state.currentConversation = conv;
  
  // Hide sidebar on mobile
  if (window.innerWidth <= 768) {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.add('hidden');
  }
  
  // Update UI
  const placeholder = document.querySelector('.chat-placeholder');
  const chatContainer = document.getElementById('chatContainer');
  
  if (placeholder) placeholder.style.display = 'none';
  if (chatContainer) chatContainer.style.display = 'flex';
  
  const name = getConversationName(conv);
  const avatar = getConversationAvatar(conv);
  
  const chatName = document.getElementById('chatName');
  const chatAvatar = document.getElementById('chatAvatar');
  const infoName = document.getElementById('infoName');
  const infoAvatar = document.getElementById('infoAvatar');
  
  if (chatName) chatName.textContent = name;
  if (chatAvatar) chatAvatar.textContent = avatar;
  if (infoName) infoName.textContent = name;
  if (infoAvatar) infoAvatar.textContent = avatar;
  
  // Update status
  const chatStatus = document.getElementById('chatStatus');
  const infoStatus = document.getElementById('infoStatus');
  
  if (conv.type === 'private') {
    const otherUser = conv.participants.find(p => p._id !== state.user.id);
    const status = otherUser.status === 'online' ? 'Online' : `Last seen ${formatTime(otherUser.lastSeen)}`;
    if (chatStatus) chatStatus.textContent = status;
    if (infoStatus) infoStatus.textContent = status;
  } else {
    const memberText = `${conv.participants.length} members`;
    if (chatStatus) chatStatus.textContent = memberText;
    if (infoStatus) infoStatus.textContent = memberText;
  }
  
  // Render participants
  renderParticipants(conv);
  
  // Mark active conversation
  renderConversations();
  
  // Show loading in messages
  const messagesContainer = document.getElementById('messagesContainer');
  if (messagesContainer) {
    messagesContainer.innerHTML = `
      <div class="loading-messages" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text-light);">
        <div style="width: 40px; height: 40px; border: 3px solid var(--border); border-top-color: var(--primary); border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 15px;"></div>
        <p>Loading messages...</p>
      </div>
    `;
  }
  
  // Load messages
  await loadMessages(conversationId);
  
  // Mark as read
  await markConversationAsRead(conversationId);
}

// ========== MESSAGES ==========
async function loadMessages(conversationId) {
  try {
    const response = await fetch(`${API_URL}/messages/${conversationId}`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    
    if (!response.ok) throw new Error('Failed to load messages');
    
    const messages = await response.json();
    state.messages[conversationId] = messages;
    renderMessages(conversationId);
  } catch (error) {
    console.error('Error loading messages:', error);
    const messagesContainer = document.getElementById('messagesContainer');
    if (messagesContainer) {
      messagesContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-light);">Failed to load messages</div>';
    }
  }
}

function renderMessages(conversationId) {
  if (state.currentConversation?._id !== conversationId) return;
  
  const container = document.getElementById('messagesContainer');
  if (!container) return;
  
  const messages = state.messages[conversationId] || [];
  
  container.innerHTML = messages.map(msg => {
    const isOwn = msg.sender._id === state.user.id;
    const time = formatTime(msg.createdAt);
    
    return `
      <div class="message ${isOwn ? 'own' : ''}">
        <div class="message-avatar">${msg.sender.avatar}</div>
        <div class="message-content">
          ${!isOwn ? `<div class="message-sender">${msg.sender.username}</div>` : ''}
          <div class="message-bubble">${escapeHtml(msg.content)}</div>
          <div class="message-time">
            ${time}
            ${isOwn && msg.readBy.length > 1 ? '<i class="fas fa-check-double"></i>' : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
  
  // Scroll to bottom
  container.scrollTop = container.scrollHeight;
}

function handleNewMessage(message) {
  const convId = message.conversationId;
  
  // Add to messages
  if (!state.messages[convId]) {
    state.messages[convId] = [];
  }
  state.messages[convId].push(message);
  
  // Update conversation last message
  const conv = state.conversations.find(c => c._id === convId);
  if (conv) {
    conv.lastMessage = {
      text: message.content,
      sender: message.sender._id,
      time: message.createdAt
    };
    
    // Increment unread if not in current conversation
    if (state.currentConversation?._id !== convId && message.sender._id !== state.user.id) {
      if (!conv.unreadCount) conv.unreadCount = {};
      conv.unreadCount[state.user.id] = (conv.unreadCount[state.user.id] || 0) + 1;
    }
    
    // Move to top
    state.conversations = [conv, ...state.conversations.filter(c => c._id !== convId)];
    renderConversations();
  }
  
  // Render if in current conversation
  if (state.currentConversation?._id === convId) {
    renderMessages(convId);
    markConversationAsRead(convId);
  }
}

// Send Message
const messageForm = document.getElementById('messageForm');
if (messageForm) {
  messageForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const input = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    
    if (!input || !sendBtn) return;
    
    const content = input.value.trim();
    
    if (!content || !state.currentConversation) return;
    
    // Disable send button and show loading
    sendBtn.disabled = true;
    const originalHTML = sendBtn.innerHTML;
    sendBtn.innerHTML = '<div style="width: 20px; height: 20px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: spin 1s linear infinite; margin: 0;"></div>';
    
    try {
      const response = await fetch(`${API_URL}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.token}`
        },
        body: JSON.stringify({
          conversationId: state.currentConversation._id,
          content
        })
      });
      
      if (!response.ok) throw new Error('Failed to send message');
      
      input.value = '';
      
      // Stop typing indicator
      if (state.socket) {
        state.socket.emit('typing', {
          conversationId: state.currentConversation._id,
          isTyping: false
        });
      }
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Failed to send message. Please try again.');
    } finally {
      // Re-enable send button
      sendBtn.disabled = false;
      sendBtn.innerHTML = originalHTML;
    }
  });
}

// Typing Indicator
let typingTimeout;
const messageInput = document.getElementById('messageInput');
if (messageInput) {
  messageInput.addEventListener('input', (e) => {
    if (!state.currentConversation || !state.socket) return;
    
    state.socket.emit('typing', {
      conversationId: state.currentConversation._id,
      isTyping: true
    });
    
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      state.socket.emit('typing', {
        conversationId: state.currentConversation._id,
        isTyping: false
      });
    }, 1000);
  });
}

function handleTypingIndicator(userId, username, conversationId, isTyping) {
  if (state.currentConversation?._id !== conversationId || userId === state.user.id) return;
  
  const indicator = document.getElementById('typingIndicator');
  const usernameEl = document.getElementById('typingUsername');
  
  if (!indicator || !usernameEl) return;
  
  if (isTyping) {
    usernameEl.textContent = username;
    indicator.style.display = 'flex';
  } else {
    indicator.style.display = 'none';
  }
}

async function markConversationAsRead(conversationId) {
  try {
    await fetch(`${API_URL}/messages/read/${conversationId}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    
    // Update local unread count
    const conv = state.conversations.find(c => c._id === conversationId);
    if (conv && conv.unreadCount) {
      conv.unreadCount[state.user.id] = 0;
      renderConversations();
    }
  } catch (error) {
    console.error('Error marking as read:', error);
  }
}

function markMessagesAsRead(conversationId, userId) {
  const messages = state.messages[conversationId] || [];
  messages.forEach(msg => {
    if (!msg.readBy.includes(userId)) {
      msg.readBy.push(userId);
    }
  });
  
  if (state.currentConversation?._id === conversationId) {
    renderMessages(conversationId);
  }
}

// ========== HELPER FUNCTIONS FOR WELCOME PAGE ==========
function openNewChatPrivate() {
  showNewChatModal();
  switchNewChatTab('private');
}

function openNewChatGroup() {
  showNewChatModal();
  switchNewChatTab('group');
}

// ========== NEW CHAT MODAL ==========
function showNewChatModal() {
  const modal = document.getElementById('newChatModal');
  if (modal) {
    modal.classList.add('active');
    switchNewChatTab('private');
    renderUsersList();
  }
}

function closeNewChatModal() {
  const modal = document.getElementById('newChatModal');
  if (modal) modal.classList.remove('active');
  
  const searchUsers = document.getElementById('searchUsers');
  const searchGroupUsers = document.getElementById('searchGroupUsers');
  const groupName = document.getElementById('groupName');
  
  if (searchUsers) searchUsers.value = '';
  if (searchGroupUsers) searchGroupUsers.value = '';
  if (groupName) groupName.value = '';
}

function switchNewChatTab(tab) {
  const privateTab = document.getElementById('privateTab');
  const groupTab = document.getElementById('groupTab');
  const privateSection = document.getElementById('privateChatSection');
  const groupSection = document.getElementById('groupChatSection');
  
  if (!privateTab || !groupTab || !privateSection || !groupSection) return;
  
  if (tab === 'private') {
    privateTab.classList.add('active');
    groupTab.classList.remove('active');
    privateSection.style.display = 'block';
    groupSection.style.display = 'none';
    renderUsersList();
  } else {
    privateTab.classList.remove('active');
    groupTab.classList.add('active');
    privateSection.style.display = 'none';
    groupSection.style.display = 'block';
    renderGroupUsersList();
  }
}

async function loadUsers() {
  try {
    const response = await fetch(`${API_URL}/users`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    
    if (!response.ok) throw new Error('Failed to load users');
    
    state.users = await response.json();
  } catch (error) {
    console.error('Error loading users:', error);
  }
}

function renderUsersList() {
  const container = document.getElementById('usersList');
  if (!container) return;
  
  const searchInput = document.getElementById('searchUsers');
  const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
  
  const filtered = state.users.filter(user => 
    user.username.toLowerCase().includes(searchTerm)
  );
  
  if (filtered.length === 0) {
    container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-light);">No users found</div>';
    return;
  }
  
  container.innerHTML = filtered.map(user => `
    <div class="user-item" onclick="startPrivateChat('${user._id}')">
      <div class="avatar">${user.avatar}</div>
      <div class="user-item-info">
        <div class="user-item-name">${user.username}</div>
        <div class="user-item-status">${user.status === 'online' ? 'Online' : 'Offline'}</div>
      </div>
    </div>
  `).join('');
}

function renderGroupUsersList() {
  const container = document.getElementById('groupUsersList');
  if (!container) return;
  
  const searchInput = document.getElementById('searchGroupUsers');
  const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
  
  const filtered = state.users.filter(user => 
    user.username.toLowerCase().includes(searchTerm)
  );
  
  if (filtered.length === 0) {
    container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-light);">No users found</div>';
    return;
  }
  
  container.innerHTML = filtered.map(user => `
    <div class="user-item" onclick="toggleUserSelection('${user._id}', this)">
      <div class="avatar">${user.avatar}</div>
      <div class="user-item-info">
        <div class="user-item-name">${user.username}</div>
        <div class="user-item-status">${user.status === 'online' ? 'Online' : 'Offline'}</div>
      </div>
    </div>
  `).join('');
}

const searchUsersInput = document.getElementById('searchUsers');
const searchGroupUsersInput = document.getElementById('searchGroupUsers');

if (searchUsersInput) {
  searchUsersInput.addEventListener('input', renderUsersList);
}

if (searchGroupUsersInput) {
  searchGroupUsersInput.addEventListener('input', renderGroupUsersList);
}

let selectedGroupUsers = [];

function toggleUserSelection(userId, element) {
  const index = selectedGroupUsers.indexOf(userId);
  if (index > -1) {
    selectedGroupUsers.splice(index, 1);
    element.classList.remove('selected');
  } else {
    selectedGroupUsers.push(userId);
    element.classList.add('selected');
  }
}

async function startPrivateChat(userId) {
  try {
    const response = await fetch(`${API_URL}/conversations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({
        type: 'private',
        participants: [userId]
      })
    });
    
    if (!response.ok) throw new Error('Failed to create conversation');
    
    const conversation = await response.json();
    
    // Add to state if new
    const exists = state.conversations.find(c => c._id === conversation._id);
    if (!exists) {
      state.conversations.unshift(conversation);
      renderConversations();
    }
    
    closeNewChatModal();
    openConversation(conversation._id);
  } catch (error) {
    console.error('Error starting chat:', error);
    alert('Failed to start conversation. Please try again.');
  }
}

async function createGroupChat() {
  const groupNameInput = document.getElementById('groupName');
  if (!groupNameInput) return;
  
  const groupName = groupNameInput.value.trim();
  
  if (!groupName) {
    alert('Please enter a group name');
    return;
  }
  
  if (selectedGroupUsers.length === 0) {
    alert('Please select at least one user');
    return;
  }
  
  try {
    const response = await fetch(`${API_URL}/conversations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({
        type: 'group',
        participants: selectedGroupUsers,
        name: groupName
      })
    });
    
    if (!response.ok) throw new Error('Failed to create group');
    
    const conversation = await response.json();
    state.conversations.unshift(conversation);
    renderConversations();
    
    closeNewChatModal();
    selectedGroupUsers = [];
    openConversation(conversation._id);
  } catch (error) {
    console.error('Error creating group:', error);
    alert('Failed to create group. Please try again.');
  }
}

// ========== CHAT INFO PANEL ==========
function toggleChatInfo() {
  const panel = document.getElementById('chatInfo');
  if (!panel) return;
  panel.classList.toggle('active');
}

function renderParticipants(conv) {
  const container = document.getElementById('participantsList');
  if (!container) return;
  
  container.innerHTML = conv.participants.map(user => `
    <div class="participant-item">
      <div class="avatar">${user.avatar}</div>
      <div class="participant-name">${user.username}</div>
    </div>
  `).join('');
}

// ------ CLOSE ON OUTSIDE CLICK -------//
document.addEventListener('click', (e) => {
  const panel = document.getElementById('chatInfo');
  if (!panel) return;

  // Only apply outside-click behavior if panel is open
  if (panel.classList.contains('active')) {
    const clickedInsidePanel = panel.contains(e.target);
    const clickedInfoButton = e.target.closest('.icon-btn'); // ℹ️ or close buttons

    // If clicked outside both panel and info buttons → close
    if (!clickedInsidePanel && !clickedInfoButton) {
      toggleChatInfo(true);
    }
  }
});

// ========== SETTINGS MODAL ==========
function toggleSettingsModal() {
  const modal = document.getElementById('settingsModal');
  if (!modal) return;
  
  if (modal.classList.contains('active')) {
    modal.classList.remove('active');
  } else {
    const settingsUsername = document.getElementById('settingsUsername');
    const settingsAvatar = document.getElementById('settingsAvatar');
    
    if (settingsUsername) settingsUsername.textContent = state.user.username;
    if (settingsAvatar) settingsAvatar.textContent = state.user.avatar;
    
    modal.classList.add('active');
  }
}

async function changeTheme() {
  const themeSelect = document.getElementById('themeSelect');
  if (!themeSelect) return;
  
  const theme = themeSelect.value;
  
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  
  try {
    await fetch(`${API_URL}/users/settings`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({ theme })
    });
    
    if (!state.user.settings) state.user.settings = {};
    state.user.settings.theme = theme;
    localStorage.setItem('user', JSON.stringify(state.user));
  } catch (error) {
    console.error('Error updating theme:', error);
  }
}

async function toggleNotifications() {
  const notificationsToggle = document.getElementById('notificationsToggle');
  if (!notificationsToggle) return;
  
  const enabled = notificationsToggle.checked;
  
  try {
    await fetch(`${API_URL}/users/settings`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({ notifications: enabled })
    });
    
    if (!state.user.settings) state.user.settings = {};
    state.user.settings.notifications = enabled;
    localStorage.setItem('user', JSON.stringify(state.user));
  } catch (error) {
    console.error('Error updating notifications:', error);
  }
}

function logout() {
  if (state.socket) {
    state.socket.disconnect();
  }
  
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  
  state.token = null;
  state.user = null;
  state.conversations = [];
  state.currentConversation = null;
  state.messages = {};
  
  document.getElementById('chatApp').style.display = 'none';
  document.getElementById('landingPage').style.display = 'block';
  
  toggleSettingsModal();
}

// ========== USER STATUS ==========
function updateUserStatus(userId, status, lastSeen) {
  // Update in conversations
  state.conversations.forEach(conv => {
    const participant = conv.participants.find(p => p._id === userId);
    if (participant) {
      participant.status = status;
      if (lastSeen) participant.lastSeen = lastSeen;
    }
  });
  
  // Update in users list
  const user = state.users.find(u => u._id === userId);
  if (user) {
    user.status = status;
    if (lastSeen) user.lastSeen = lastSeen;
  }
  
  // Update current chat if applicable
  if (state.currentConversation?.type === 'private') {
    const otherUser = state.currentConversation.participants.find(p => p._id === userId);
    if (otherUser) {
      const statusText = status === 'online' ? 'Online' : `Last seen ${formatTime(lastSeen)}`;
      const chatStatus = document.getElementById('chatStatus');
      const infoStatus = document.getElementById('infoStatus');
      
      if (chatStatus) chatStatus.textContent = statusText;
      if (infoStatus) infoStatus.textContent = statusText;
    }
  }
  
  renderConversations();
}

// ========== MOBILE SIDEBAR TOGGLE ==========
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (sidebar) {
    sidebar.classList.toggle('hidden');
  }
}

// ========== UTILITY FUNCTIONS ==========
function formatTime(timestamp) {
  if (!timestamp) return '';
  
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  
  // Less than 1 minute
  if (diff < 60000) return 'Just now';
  
  // Less than 1 hour
  if (diff < 3600000) {
    const mins = Math.floor(diff / 60000);
    return `${mins}m ago`;
  }
  
  // Today
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }
  
  // Yesterday
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }
  
  // This week
  if (diff < 604800000) {
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  }
  
  // Older
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ========== CLOSE MODALS ON OUTSIDE CLICK ==========
const authModal = document.getElementById('authModal');
if (authModal) {
  authModal.addEventListener('click', (e) => {
    if (e.target.id === 'authModal') closeAuthModal();
  });
}

const newChatModal = document.getElementById('newChatModal');
if (newChatModal) {
  newChatModal.addEventListener('click', (e) => {
    if (e.target.id === 'newChatModal') closeNewChatModal();
  });
}

const settingsModal = document.getElementById('settingsModal');
if (settingsModal) {
  settingsModal.addEventListener('click', (e) => {
    if (e.target.id === 'settingsModal') toggleSettingsModal();
  });
}


// ========== MOBILE FUNCTIONS ==========
function switchMobileView(view) {
  switchView(view);
  
  // Update mobile nav active state
  document.querySelectorAll('.mobile-nav-item').forEach(item => {
    item.classList.remove('active');
  });
  const activeItem = document.querySelector(`.mobile-nav-item[data-view="${view}"]`);
  if (activeItem) activeItem.classList.add('active');
}

function closeChatMobile() {
  const sidebar = document.getElementById('sidebar');
  const chatContainer = document.getElementById('chatContainer');
  const placeholder = document.querySelector('.chat-placeholder');
  
  if (sidebar) sidebar.classList.remove('hidden');
  if (chatContainer) chatContainer.style.display = 'none';
  if (placeholder) placeholder.style.display = 'flex';
  
  state.currentConversation = null;
}



// ========== PROFILE MODAL ==========
function showProfileModal() {
  const modal = document.getElementById('profileModal');
  if (!modal) return;
  
  const profileUsername = document.getElementById('profileUsername');
  const profileAvatar = document.getElementById('profileAvatar');
  const totalChats = document.getElementById('totalChats');
  const totalGroups = document.getElementById('totalGroups');
  
  if (profileUsername) profileUsername.textContent = state.user.username;
  if (profileAvatar) profileAvatar.textContent = state.user.avatar;
  
  if (totalChats) {
    const privateChats = state.conversations.filter(c => c.type === 'private').length;
    totalChats.textContent = privateChats;
  }
  
  if (totalGroups) {
    const groupChats = state.conversations.filter(c => c.type === 'group').length;
    totalGroups.textContent = groupChats;
  }
  
  modal.classList.add('active');
}

function closeProfileModal() {
  const modal = document.getElementById('profileModal');
  if (modal) modal.classList.remove('active');
}

// Add click-outside-to-close for profile modal
const profileModal = document.getElementById('profileModal');
if (profileModal) {
  profileModal.addEventListener('click', (e) => {
    if (e.target.id === 'profileModal') closeProfileModal();
  });
}


// ========== KEYBOARD SHORTCUTS (Browser-Safe) ==========
document.addEventListener('keydown', (e) => {
  
  // Alt + T: Toggle Dark/Light Mode (Safe alternative)
  if (e.altKey && e.key === 't') {
    e.preventDefault();
    toggleThemeShortcut();
  }
  
  // Alt + N: New Private Chat
  if (e.altKey && e.key === 'n') {
    e.preventDefault();
    openNewChatPrivate();
  }
  
  // Alt + G: New Group Chat
  if (e.altKey && e.key === 'g') {
    e.preventDefault();
    openNewChatGroup();
  }
  
  // Alt + S: Focus Search
  if (e.altKey && e.key === 's') {
    e.preventDefault();
    const searchInput = document.getElementById('searchConversations');
    if (searchInput) searchInput.focus();
  }
  
  // Alt + . (period): Open Settings
  if (e.altKey && e.key === '.') {
    e.preventDefault();
    if (state.user && state.token) {
      toggleSettingsModal();
    }
  }
  
  // Alt + ? : Show shortcuts help
  if (e.altKey && e.key === '?') {
    e.preventDefault();
    showShortcutsHelp();
  }
  
  // Esc: Close modals (Universal shortcut)
  if (e.key === 'Escape') {
    // Check for shortcuts help modal first
    const shortcutsModal = document.getElementById('shortcuts-help-modal');
    if (shortcutsModal) {
      shortcutsModal.remove();
      return;
    }
    
    const authModal = document.getElementById('authModal');
    const newChatModal = document.getElementById('newChatModal');
    const settingsModal = document.getElementById('settingsModal');
    const chatInfo = document.getElementById('chatInfo');
    
    if (authModal && authModal.classList.contains('active')) {
      closeAuthModal();
    } else if (newChatModal && newChatModal.classList.contains('active')) {
      closeNewChatModal();
    } else if (settingsModal && settingsModal.classList.contains('active')) {
      toggleSettingsModal();
    } else if (chatInfo && chatInfo.style.display === 'block') {
      toggleChatInfo();
    }
  }
  
  // / (forward slash): Quick search focus
  if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const activeElement = document.activeElement;
    const isInputField = activeElement.tagName === 'INPUT' || 
                        activeElement.tagName === 'TEXTAREA' || 
                        activeElement.isContentEditable;
    
    if (!isInputField) {
      e.preventDefault();
      const searchInput = document.getElementById('searchConversations');
      if (searchInput) searchInput.focus();
    }
  }
});

// Toggle theme with keyboard shortcut
async function toggleThemeShortcut() {
  const themeSelect = document.getElementById('themeSelect');
  const currentTheme = document.documentElement.getAttribute('data-theme');
  
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  
  if (newTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  
  // Update select if exists
  if (themeSelect) {
    themeSelect.value = newTheme;
  }
  
  // Update user settings if logged in
  if (state.token && state.user) {
    try {
      await fetch(`${API_URL}/users/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.token}`
        },
        body: JSON.stringify({ theme: newTheme })
      });
      
      if (!state.user.settings) state.user.settings = {};
      state.user.settings.theme = newTheme;
      localStorage.setItem('user', JSON.stringify(state.user));
      
      // Show notification
      showThemeNotification(newTheme);
    } catch (error) {
      console.error('Error updating theme:', error);
    }
  } else {
    // Just change theme visually if not logged in
    showThemeNotification(newTheme);
  }
}

// Show theme change notification
function showThemeNotification(theme) {
  // Remove existing notification if any
  const existing = document.getElementById('theme-notification');
  if (existing) existing.remove();
  
  const notification = document.createElement('div');
  notification.id = 'theme-notification';
  notification.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: ${theme === 'dark' ? '#1e293b' : '#ffffff'};
    color: ${theme === 'dark' ? '#f1f5f9' : '#1e293b'};
    padding: 12px 20px;
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.3);
    border: 1px solid ${theme === 'dark' ? '#334155' : '#e2e8f0'};
    z-index: 10001;
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 14px;
    font-weight: 500;
    animation: slideInUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  `;
  
  notification.innerHTML = `
    <i class="fas fa-${theme === 'dark' ? 'moon' : 'sun'}" 
       style="font-size: 16px; color: ${theme === 'dark' ? '#60a5fa' : '#f59e0b'};"></i>
    <span>${theme === 'dark' ? 'Dark' : 'Light'} mode activated</span>
    <kbd style="
      background: ${theme === 'dark' ? '#334155' : '#f1f5f9'}; 
      padding: 2px 6px; 
      border-radius: 4px; 
      font-size: 11px;
      margin-left: 6px;
      font-family: monospace;
    ">Alt+T</kbd>
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = 'slideOutDown 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
    setTimeout(() => notification.remove(), 300);
  }, 2500);
}

// Show keyboard shortcuts help
function showShortcutsHelp() {
  // Check if modal already exists and remove it (toggle behavior)
  const existingModal = document.getElementById('shortcuts-help-modal');
  if (existingModal) {
    existingModal.remove();
    return;
  }
  
  const helpModal = document.createElement('div');
  helpModal.id = 'shortcuts-help-modal';
  helpModal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(4px);
    z-index: 10002;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.2s ease;
  `;
  
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const isDark = currentTheme === 'dark';
  
  helpModal.innerHTML = `
    <div style="
      background: ${isDark ? '#161A20' : '#ffffff'};
      color: ${isDark ? '#E6E9EF' : '#103a24'};
      border-radius: 16px;
      padding: 32px;
      max-width: 500px;
      width: 90%;
      box-shadow: 0 20px 60px rgba(0,0,0,0.4);
      animation: scaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    ">
      <h2 style="margin: 0 0 24px; font-size: 24px; font-weight: 700;">
        ⌨️ Keyboard Shortcuts
      </h2>
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: ${isDark ? '#0E1116' : '#f8fafc'}; border-radius: 8px;">
          <span>Toggle Dark/Light Mode</span>
          <kbd style="background: ${isDark ? '#161A20' : '#e2e8f0'}; padding: 4px 8px; border-radius: 4px; font-family: monospace; font-size: 12px;">Alt + T</kbd>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: ${isDark ? '#0E1116' : '#f8fafc'}; border-radius: 8px;">
          <span>New Private Chat</span>
          <kbd style="background: ${isDark ? '#161A20' : '#e2e8f0'}; padding: 4px 8px; border-radius: 4px; font-family: monospace; font-size: 12px;">Alt + N</kbd>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: ${isDark ? '#0E1116' : '#f8fafc'}; border-radius: 8px;">
          <span>New Group Chat</span>
          <kbd style="background: ${isDark ? '#161A20' : '#e2e8f0'}; padding: 4px 8px; border-radius: 4px; font-family: monospace; font-size: 12px;">Alt + G</kbd>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: ${isDark ? '#0E1116' : '#f8fafc'}; border-radius: 8px;">
          <span>Focus Search</span>
          <kbd style="background: ${isDark ? '#161A20' : '#e2e8f0'}; padding: 4px 8px; border-radius: 4px; font-family: monospace; font-size: 12px;">Alt + S</kbd>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: ${isDark ? '#0E1116' : '#f8fafc'}; border-radius: 8px;">
          <span>Quick Search</span>
          <kbd style="background: ${isDark ? '#161A20' : '#e2e8f0'}; padding: 4px 8px; border-radius: 4px; font-family: monospace; font-size: 12px;">/</kbd>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: ${isDark ? '#0E1116' : '#f8fafc'}; border-radius: 8px;">
          <span>Open Settings</span>
          <kbd style="background: ${isDark ? '#161A20' : '#e2e8f0'}; padding: 4px 8px; border-radius: 4px; font-family: monospace; font-size: 12px;">Alt + .</kbd>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: ${isDark ? '#0E1116' : '#f8fafc'}; border-radius: 8px;">
          <span>Close Modal</span>
          <kbd style="background: ${isDark ? '#161A20' : '#e2e8f0'}; padding: 4px 8px; border-radius: 4px; font-family: monospace; font-size: 12px;">Esc</kbd>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: ${isDark ? '#0E1116' : '#f8fafc'}; border-radius: 8px;">
          <span>Show This Help</span>
          <kbd style="background: ${isDark ? '#161A20' : '#e2e8f0'}; padding: 4px 8px; border-radius: 4px; font-family: monospace; font-size: 12px;">Alt + ?</kbd>
        </div>
      </div>
      <button onclick="document.getElementById('shortcuts-help-modal').remove()" style="
        margin-top: 24px;
        width: 100%;
        background: linear-gradient(135deg, #00c46a, #009b54);
        color: white;
        padding: 12px;
        border: none;
        border-radius: 8px;
        font-weight: 600;
        cursor: pointer;
        transition: transform 0.2s ease;
      " onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
        Got it!
      </button>
    </div>
  `;
  
  helpModal.onclick = (e) => {
    if (e.target === helpModal) helpModal.remove();
  };
  
  document.body.appendChild(helpModal);
}

// Add animation styles for notification
if (!document.getElementById('shortcutAnimations')) {
  const style = document.createElement('style');
  style.id = 'shortcutAnimations';
  style.textContent = `
    @keyframes slideInUp {
      from {
        transform: translateY(100px);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }
    @keyframes slideOutDown {
      from {
        transform: translateY(0);
        opacity: 1;
      }
      to {
        transform: translateY(100px);
        opacity: 0;
      }
    }
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes scaleIn {
      from {
        transform: scale(0.9);
        opacity: 0;
      }
      to {
        transform: scale(1);
        opacity: 1;
      }
    }
  `;
  document.head.appendChild(style);
}