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
  showLoading('Please wait...');
  
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

  // Add socket listeners for message actions
  addMessageActionSocketListeners();
  
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

  addMessageActionSocketListeners();
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
// const messageForm = document.getElementById('messageForm');
// if (messageForm) {
//   messageForm.addEventListener('submit', async (e) => {
//     e.preventDefault();
    
//     const input = document.getElementById('messageInput');
//     const sendBtn = document.getElementById('sendBtn');
    
//     if (!input || !sendBtn) return;
    
//     const content = input.value.trim();
    
//     if (!content || !state.currentConversation) return;
    
//     // Disable send button and show loading
//     sendBtn.disabled = true;
//     const originalHTML = sendBtn.innerHTML;
//     sendBtn.innerHTML = '<div style="width: 20px; height: 20px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: spin 1s linear infinite; margin: 0;"></div>';
    
//     try {
//       const response = await fetch(`${API_URL}/messages`, {
//         method: 'POST',
//         headers: {
//           'Content-Type': 'application/json',
//           'Authorization': `Bearer ${state.token}`
//         },
//         body: JSON.stringify({
//           conversationId: state.currentConversation._id,
//           content
//         })
//       });
      
//       if (!response.ok) throw new Error('Failed to send message');
      
//       input.value = '';
      
//       // Stop typing indicator
//       if (state.socket) {
//         state.socket.emit('typing', {
//           conversationId: state.currentConversation._id,
//           isTyping: false
//         });
//       }
//     } catch (error) {
//       console.error('Error sending message:', error);
//       alert('Failed to send message. Please try again.');
//     } finally {
//       // Re-enable send button
//       sendBtn.disabled = false;
//       sendBtn.innerHTML = originalHTML;
//     }
//   });
// }

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


// ========== PASSWORD VISIBILITY TOGGLE ==========
// Login monkey toggle
document.querySelector('#loginMonkey .monkey').addEventListener('click', function() {
    const container = document.getElementById('loginMonkey');
    const input = document.getElementById('loginPassword');
    
    container.classList.toggle('show');
    input.type = input.type === 'password' ? 'text' : 'password';
});

// Signup monkey toggle
document.querySelector('#signupMonkey .monkey').addEventListener('click', function() {
    const container = document.getElementById('signupMonkey');
    const input = document.getElementById('signupPassword');
    
    container.classList.toggle('show');
    input.type = input.type === 'password' ? 'text' : 'password';
});


// ========== MESSAGE NOTIFICATION SYSTEM ==========

// Add this to your existing JavaScript file (after the state object)

// Notification queue to prevent overlapping
let notificationQueue = [];
let isShowingNotification = false;

// Show message notification
function showMessageNotification(message, conversationId) {
  // Don't show notification if user is already viewing this conversation
  if (state.currentConversation?._id === conversationId) {
    return;
  }
  
  // Don't show notification for own messages
  if (message.sender._id === state.user.id) {
    return;
  }
  
  // Check if notifications are enabled
  if (state.user.settings && !state.user.settings.notifications) {
    return;
  }
  
  // Get sender name
  const senderName = message.sender.username;
  
  // Truncate message content (max 60 characters)
  let messagePreview = message.content.trim();
  if (messagePreview.length > 60) {
    messagePreview = messagePreview.substring(0, 60) + '...';
  }
  
  // Add to queue
  notificationQueue.push({
    senderName,
    messagePreview,
    conversationId,
    avatar: message.sender.avatar,
    timestamp: new Date()
  });
  
  // Process queue
  processNotificationQueue();
}

// Process notification queue
function processNotificationQueue() {
  if (isShowingNotification || notificationQueue.length === 0) {
    return;
  }
  
  isShowingNotification = true;
  const notification = notificationQueue.shift();
  
  displayNotification(notification);
}

// Display notification toast
function displayNotification({ senderName, messagePreview, conversationId, avatar, timestamp }) {
  // Remove any existing notification
  const existingNotification = document.getElementById('message-notification-toast');
  if (existingNotification) {
    existingNotification.remove();
  }
  
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const isDark = currentTheme === 'dark';
  
  // Create notification element
  const notification = document.createElement('div');
  notification.id = 'message-notification-toast';
  notification.dataset.dismissTimeout = ''; // Store timeout ID
  notification.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    width: 360px;
    max-width: calc(100vw - 48px);
    background: ${isDark ? '#1e293b' : '#ffffff'};
    border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, ${isDark ? '0.5' : '0.15'}), 
                0 0 0 1px ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'};
    padding: 16px;
    z-index: 10000;
    cursor: pointer;
    animation: slideInNotification 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    border-left: 4px solid #00c46a;
    backdrop-filter: blur(10px);
  `;
  
  notification.innerHTML = `
    <div style="display: flex; gap: 12px; align-items: start;">
      <div style="
        width: 42px;
        height: 42px;
        border-radius: 50%;
        background: linear-gradient(135deg, #00c46a, #009b54);
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
        color: white;
        font-size: 16px;
        flex-shrink: 0;
        box-shadow: 0 4px 12px rgba(0, 196, 106, 0.3);
      ">${avatar}</div>
      
      <div style="flex: 1; min-width: 0;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
          <div style="
            font-size: 13px;
            font-weight: 600;
            color: ${isDark ? '#f1f5f9' : '#1e293b'};
            display: flex;
            align-items: center;
            gap: 6px;
          ">
            <span>New message from ${escapeHtml(senderName)}</span>
          </div>
          <button onclick="closeMessageNotification(event)" style="
            background: none;
            border: none;
            color: ${isDark ? '#94a3b8' : '#64748b'};
            cursor: pointer;
            padding: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 4px;
            transition: background 0.2s ease;
            width: 24px;
            height: 24px;
          " onmouseover="this.style.background='${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}'" 
             onmouseout="this.style.background='none'">
            <i class="fas fa-times" style="font-size: 12px;"></i>
          </button>
        </div>
        
        <div style="
          font-size: 14px;
          color: ${isDark ? '#cbd5e1' : '#475569'};
          line-height: 1.5;
          margin-bottom: 8px;
          word-wrap: break-word;
        ">${escapeHtml(messagePreview)}</div>
        
        <div style="
          font-size: 11px;
          color: ${isDark ? '#64748b' : '#94a3b8'};
          text-transform: uppercase;
          letter-spacing: 0.5px;
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 4px;
        ">
          <i class="fas fa-circle" style="font-size: 6px; color: #00c46a;"></i>
          Just now
        </div>
      </div>
    </div>
    
    <div style="
      position: absolute;
      bottom: 0;
      left: 0;
      width: 100%;
      height: 3px;
      background: ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'};
      border-radius: 0 0 12px 12px;
      overflow: hidden;
    ">
      <div id="notification-progress-bar" style="
        height: 100%;
        width: 0%;
        background: linear-gradient(90deg, #00c46a, #009b54);
        animation: progressBar 5s linear forwards;
      "></div>
    </div>
  `;
  
  // Click handler to open conversation
  notification.addEventListener('click', (e) => {
    // Don't trigger if clicking close button
    if (e.target.closest('button')) return;
    
    openConversation(conversationId);
    closeMessageNotification();
    
    // Hide sidebar on mobile after opening chat
    if (window.innerWidth <= 768) {
      const sidebar = document.getElementById('sidebar');
      if (sidebar) sidebar.classList.add('hidden');
    }
  });
  
  // Hover effects
  notification.addEventListener('mouseenter', () => {
    notification.style.transform = 'translateY(-4px) scale(1.02)';
    notification.style.boxShadow = `0 16px 48px rgba(0, 0, 0, ${isDark ? '0.6' : '0.2'}), 
                                     0 0 0 1px ${isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)'}`;
    
    // Pause progress bar animation
    const progressBar = notification.querySelector('#notification-progress-bar');
    if (progressBar) {
      progressBar.style.animationPlayState = 'paused';
    }
    
    // Clear the auto-dismiss timeout
    const timeoutId = notification.dataset.dismissTimeout;
    if (timeoutId) {
      clearTimeout(parseInt(timeoutId));
      notification.dataset.dismissTimeout = '';
    }
  });
  
  notification.addEventListener('mouseleave', () => {
    notification.style.transform = 'translateY(0) scale(1)';
    notification.style.boxShadow = `0 10px 40px rgba(0, 0, 0, ${isDark ? '0.5' : '0.15'}), 
                                     0 0 0 1px ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}`;
    
    // Resume progress bar animation
    const progressBar = notification.querySelector('#notification-progress-bar');
    if (progressBar) {
      progressBar.style.animationPlayState = 'running';
      
      // Calculate remaining time based on progress bar width
      const computedStyle = window.getComputedStyle(progressBar);
      const currentWidth = parseFloat(computedStyle.width);
      const totalWidth = parseFloat(window.getComputedStyle(progressBar.parentElement).width);
      const progress = currentWidth / totalWidth;
      const remainingTime = 5000 * (1 - progress);
      
      // Set new timeout for remaining time
      if (remainingTime > 100) {
        const newTimeoutId = setTimeout(() => {
          closeMessageNotification();
        }, remainingTime);
        notification.dataset.dismissTimeout = newTimeoutId.toString();
      }
    }
  });
  
  document.body.appendChild(notification);
  
  // Set initial auto-dismiss timeout
  const initialTimeoutId = setTimeout(() => {
    closeMessageNotification();
  }, 5000);
  notification.dataset.dismissTimeout = initialTimeoutId.toString();
}

// Close notification
function closeMessageNotification(event) {
  if (event) {
    event.stopPropagation();
  }
  
  const notification = document.getElementById('message-notification-toast');
  if (notification) {
    notification.style.animation = 'slideOutNotification 0.3s cubic-bezier(0.4, 0, 0.6, 1) forwards';
    setTimeout(() => {
      notification.remove();
      isShowingNotification = false;
      
      // Process next notification in queue
      if (notificationQueue.length > 0) {
        setTimeout(() => processNotificationQueue(), 300);
      }
    }, 300);
  } else {
    isShowingNotification = false;
    if (notificationQueue.length > 0) {
      setTimeout(() => processNotificationQueue(), 300);
    }
  }
}

// Add notification animations to stylesheet
if (!document.getElementById('notificationAnimations')) {
  const style = document.createElement('style');
  style.id = 'notificationAnimations';
  style.textContent = `
    @keyframes slideInNotification {
      from {
        transform: translateX(400px) scale(0.9);
        opacity: 0;
      }
      to {
        transform: translateX(0) scale(1);
        opacity: 1;
      }
    }
    
    @keyframes slideOutNotification {
      from {
        transform: translateX(0) scale(1);
        opacity: 1;
      }
      to {
        transform: translateX(400px) scale(0.9);
        opacity: 0;
      }
    }
    
    @keyframes progressBar {
      from {
        width: 0%;
      }
      to {
        width: 100%;
      }
    }
    
    /* Mobile responsive */
    @media (max-width: 480px) {
      #message-notification-toast {
        width: calc(100vw - 32px) !important;
        bottom: 16px !important;
        right: 16px !important;
      }
    }
  `;
  document.head.appendChild(style);
}

// ========== UPDATE handleNewMessage FUNCTION ==========
// Replace the existing handleNewMessage function with this updated version:

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
      
      // Show notification for new message
      showMessageNotification(message, convId);
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
  
  // Play notification sound (optional)
  playNotificationSound();
}

// Optional: Add notification sound
function playNotificationSound() {
  // Check if notifications are enabled
  if (!state.user.settings || !state.user.settings.notifications) {
    return;
  }
  
  // Create and play a subtle notification sound
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  
  oscillator.frequency.value = 800;
  oscillator.type = 'sine';
  
  gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
  
  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + 0.1);
}

// ========== MESSAGE ACTIONS SYSTEM ==========
// Add this to your existing script.js file

// Store reply context
let replyingTo = null;

// Available reactions
const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

// ========== UPDATED renderMessages FUNCTION ==========
// Replace your existing renderMessages function with this one:

function renderMessages(conversationId) {
  if (state.currentConversation?._id !== conversationId) return;
  
  const container = document.getElementById('messagesContainer');
  if (!container) return;
  
  const messages = state.messages[conversationId] || [];
  
  container.innerHTML = messages.map((msg, index) => {
    const isOwn = msg.sender._id === state.user.id;
    const time = formatTime(msg.createdAt);
    const isEdited = msg.edited ? '<span style="font-size: 10px; color: var(--text-light); margin-left: 4px;">(edited)</span>' : '';
    
    // Check if this message is a reply
    let replyHTML = '';
    if (msg.replyTo) {
      // Check if replyTo is an object (populated) or just an ID
      let repliedMsg = null;
      
      if (typeof msg.replyTo === 'object' && msg.replyTo !== null) {
        // Already populated from backend
        repliedMsg = msg.replyTo;
      } else {
        // Not populated, find in current messages
        repliedMsg = messages.find(m => m._id === msg.replyTo || m._id === msg.replyTo._id);
      }
      
      if (repliedMsg) {
        const repliedUsername = repliedMsg.sender?.username || 'Unknown';
        const repliedContent = repliedMsg.content || '';
        const repliedId = repliedMsg._id || msg.replyTo;
        
        replyHTML = `
          <div class="message-reply-preview" onclick="scrollToMessage('${repliedId}')" style="
            background: ${isOwn ? 'rgba(0, 0, 0, 0.1)' : 'rgba(0, 0, 0, 0.05)'};
            border-left: 3px solid #00c46a;
            padding: 6px 10px;
            margin-bottom: 6px;
            border-radius: 6px;
            cursor: pointer;
            transition: background 0.2s ease;
          " onmouseover="this.style.background='${isOwn ? 'rgba(0, 0, 0, 0.15)' : 'rgba(0, 0, 0, 0.1)'}'" 
             onmouseout="this.style.background='${isOwn ? 'rgba(0, 0, 0, 0.1)' : 'rgba(0, 0, 0, 0.05)'}'">
            <div style="font-size: 11px; font-weight: 600; color: #00c46a; margin-bottom: 2px;">
              ${escapeHtml(repliedUsername)}
            </div>
            <div style="font-size: 12px; color: var(--text-light); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              ${escapeHtml(repliedContent).substring(0, 50)}${repliedContent.length > 50 ? '...' : ''}
            </div>
          </div>
        `;
      }
    }
    
    // Reactions display
    let reactionsHTML = '';
    if (msg.reactions && Object.keys(msg.reactions).length > 0) {
      const reactionCounts = {};
      Object.entries(msg.reactions).forEach(([userId, emoji]) => {
        reactionCounts[emoji] = (reactionCounts[emoji] || 0) + 1;
      });
      
      reactionsHTML = `
        <div class="message-reactions" style="
          display: flex;
          gap: 4px;
          margin-top: 4px;
          flex-wrap: wrap;
        ">
          ${Object.entries(reactionCounts).map(([emoji, count]) => {
            const hasReacted = msg.reactions[state.user.id] === emoji;
            return `
              <div class="reaction-bubble" onclick="toggleReaction('${msg._id}', '${emoji}')" style="
                background: ${hasReacted ? 'rgba(0, 196, 106, 0.15)' : 'rgba(0, 0, 0, 0.05)'};
                border: 1px solid ${hasReacted ? '#00c46a' : 'transparent'};
                padding: 2px 8px;
                border-radius: 12px;
                font-size: 14px;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 4px;
                transition: all 0.2s ease;
                user-select: none;
              " onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'">
                <span>${emoji}</span>
                <span style="font-size: 11px; font-weight: 600; color: ${hasReacted ? '#00c46a' : 'var(--text-light)'};">${count}</span>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }
    
    return `
      <div class="message ${isOwn ? 'own' : ''}" id="message-${msg._id}" data-message-id="${msg._id}">
        <div class="message-avatar">${msg.sender.avatar}</div>
        <div class="message-content">
          ${!isOwn ? `<div class="message-sender">${msg.sender.username}</div>` : ''}
          <div class="message-bubble-wrapper" style="position: relative;">
            <div class="message-bubble" style="position: relative;">
              ${replyHTML}
              ${escapeHtml(msg.content)}
              
              <!-- Message Actions Button -->
              <button class="message-actions-btn" onclick="showMessageActions(event, '${msg._id}', ${isOwn})" style="
                position: absolute;
                top: -8px;
                ${isOwn ? 'left: -8px;' : 'right: -8px;'}
                background: var(--background);
                border: 1px solid var(--border);
                border-radius: 50%;
                width: 24px;
                height: 24px;
                display: none;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                transition: all 0.2s ease;
                z-index: 10;
              " onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'">
                <i class="fas fa-ellipsis-v" style="font-size: 10px; color: var(--text);"></i>
              </button>
            </div>
            ${reactionsHTML}
          </div>
          <div class="message-time">
            ${time}
            ${isEdited}
            ${isOwn && msg.readBy.length > 1 ? '<i class="fas fa-check-double"></i>' : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
  
  // Show action buttons on hover
  container.querySelectorAll('.message').forEach(msgEl => {
    msgEl.addEventListener('mouseenter', () => {
      const btn = msgEl.querySelector('.message-actions-btn');
      if (btn) btn.style.display = 'flex';
    });
    msgEl.addEventListener('mouseleave', () => {
      const btn = msgEl.querySelector('.message-actions-btn');
      if (btn) btn.style.display = 'none';
    });
  });
  
  // Scroll to bottom
  container.scrollTop = container.scrollHeight;
}

// ========== SHOW MESSAGE ACTIONS MENU ==========
function showMessageActions(event, messageId, isOwn) {
  event.stopPropagation();
  
  // Remove existing menu
  const existingMenu = document.getElementById('message-actions-menu');
  if (existingMenu) existingMenu.remove();
  
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const isDark = currentTheme === 'dark';
  
  const menu = document.createElement('div');
  menu.id = 'message-actions-menu';
  menu.style.cssText = `
    position: fixed;
    background: ${isDark ? '#1e293b' : '#ffffff'};
    border: 1px solid ${isDark ? '#334155' : '#e2e8f0'};
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
    z-index: 10001;
    min-width: 200px;
    overflow: hidden;
    animation: scaleIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  `;
  
  const actions = [
    { icon: 'fa-reply', label: 'Reply', action: () => replyToMessage(messageId), color: '#3b82f6' },
    { icon: 'fa-smile', label: 'React', action: () => showReactionPicker(event, messageId), color: '#f59e0b' },
    { icon: 'fa-copy', label: 'Copy', action: () => copyMessage(messageId), color: '#8b5cf6' },
    { icon: 'fa-share', label: 'Forward', action: () => forwardMessage(messageId), color: '#06b6d4' }
  ];
  
  if (isOwn) {
    actions.push(
      { icon: 'fa-edit', label: 'Edit', action: () => editMessage(messageId), color: '#10b981' },
      { icon: 'fa-trash', label: 'Delete', action: () => deleteMessage(messageId), color: '#ef4444' }
    );
  }
  
  menu.innerHTML = actions.map(({ icon, label, action, color }, index) => `
    <div class="message-action-item" data-action-index="${index}" style="
      padding: 12px 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      cursor: pointer;
      transition: background 0.2s ease;
      color: ${isDark ? '#e2e8f0' : '#334155'};
      font-size: 14px;
      font-weight: 500;
    " onmouseover="this.style.background='${isDark ? '#334155' : '#f8fafc'}'" onmouseout="this.style.background='transparent'">
      <i class="fas ${icon}" style="color: ${color}; width: 16px; text-align: center;"></i>
      <span>${label}</span>
    </div>
  `).join('');
  
  // Add click handlers for each action
  menu.querySelectorAll('.message-action-item').forEach((item, index) => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      actions[index].action();
      closeMessageActions();
    });
  });
  
  document.body.appendChild(menu);
  
  // Position menu
  const rect = event.target.closest('.message-actions-btn').getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  
  let top = rect.bottom + 8;
  let left = rect.left;
  
  if (top + menuRect.height > window.innerHeight) {
    top = rect.top - menuRect.height - 8;
  }
  
  if (left + menuRect.width > window.innerWidth) {
    left = rect.right - menuRect.width;
  }
  
  menu.style.top = top + 'px';
  menu.style.left = left + 'px';
  
  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', closeMessageActions);
  }, 0);
}

function closeMessageActions() {
  const menu = document.getElementById('message-actions-menu');
  if (menu) menu.remove();
  document.removeEventListener('click', closeMessageActions);
}

// ========== REPLY TO MESSAGE ==========
function replyToMessage(messageId) {
  const messages = state.messages[state.currentConversation._id] || [];
  const message = messages.find(m => m._id === messageId);
  
  if (!message) return;
  
  replyingTo = message;
  
  // Show reply preview
  const messageInput = document.getElementById('messageInput');
  const messageForm = document.getElementById('messageForm');
  
  if (!messageInput || !messageForm) return;
  
  // Remove existing reply preview
  const existingPreview = document.getElementById('reply-preview');
  if (existingPreview) existingPreview.remove();
  
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const isDark = currentTheme === 'dark';
  
  const replyPreview = document.createElement('div');
  replyPreview.id = 'reply-preview';
  replyPreview.style.cssText = `
    background: ${isDark ? '#1e293b' : '#f8fafc'};
    border-left: 3px solid #00c46a;
    padding: 10px 12px;
    margin-bottom: 8px;
    border-radius: 8px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    animation: slideDown 0.2s ease;
  `;
  
  replyPreview.innerHTML = `
    <div style="flex: 1; min-width: 0;">
      <div style="font-size: 12px; font-weight: 600; color: #00c46a; margin-bottom: 2px;">
        Replying to ${message.sender.username}
      </div>
      <div style="font-size: 13px; color: var(--text-light); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
        ${escapeHtml(message.content).substring(0, 60)}${message.content.length > 60 ? '...' : ''}
      </div>
    </div>
    <button onclick="cancelReply()" style="
      background: none;
      border: none;
      color: var(--text-light);
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 4px;
      transition: background 0.2s ease;
    " onmouseover="this.style.background='rgba(0,0,0,0.1)'" onmouseout="this.style.background='none'">
      <i class="fas fa-times"></i>
    </button>
  `;
  
  messageForm.insertBefore(replyPreview, messageForm.firstChild);
  messageInput.focus();
}

function cancelReply() {
  replyingTo = null;
  const preview = document.getElementById('reply-preview');
  if (preview) preview.remove();
}

// ========== SHOW REACTION PICKER ==========
function showReactionPicker(event, messageId) {
  closeMessageActions();
  
  const existingPicker = document.getElementById('reaction-picker');
  if (existingPicker) existingPicker.remove();
  
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const isDark = currentTheme === 'dark';
  
  const picker = document.createElement('div');
  picker.id = 'reaction-picker';
  picker.style.cssText = `
    position: fixed;
    background: ${isDark ? '#1e293b' : '#ffffff'};
    border: 1px solid ${isDark ? '#334155' : '#e2e8f0'};
    border-radius: 30px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
    padding: 8px 12px;
    display: flex;
    gap: 4px;
    z-index: 10002;
    animation: scaleIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  `;
  
  picker.innerHTML = REACTIONS.map(emoji => `
    <button onclick="addReaction('${messageId}', '${emoji}')" style="
      background: none;
      border: none;
      font-size: 24px;
      cursor: pointer;
      padding: 6px;
      border-radius: 50%;
      transition: transform 0.2s ease, background 0.2s ease;
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
    " onmouseover="this.style.transform='scale(1.3)'; this.style.background='rgba(0,0,0,0.05)'" 
       onmouseout="this.style.transform='scale(1)'; this.style.background='none'">
      ${emoji}
    </button>
  `).join('');
  
  document.body.appendChild(picker);
  
  // Position picker
  const rect = event.target.closest('.message').getBoundingClientRect();
  picker.style.top = (rect.top - picker.offsetHeight - 8) + 'px';
  picker.style.left = (rect.left + rect.width / 2 - picker.offsetWidth / 2) + 'px';
  
  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', closeReactionPicker);
  }, 0);
}

function closeReactionPicker() {
  const picker = document.getElementById('reaction-picker');
  if (picker) picker.remove();
  document.removeEventListener('click', closeReactionPicker);
}

// ========== ADD/TOGGLE REACTION ==========
async function addReaction(messageId, emoji) {
  closeReactionPicker();
  
  try {
    const response = await fetch(`${API_URL}/messages/${messageId}/react`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({ emoji })
    });
    
    if (!response.ok) throw new Error('Failed to add reaction');
    
    const updatedMessage = await response.json();
    
    // Update local state
    const messages = state.messages[state.currentConversation._id];
    const index = messages.findIndex(m => m._id === messageId);
    if (index !== -1) {
      messages[index] = updatedMessage;
      renderMessages(state.currentConversation._id);
    }
  } catch (error) {
    console.error('Error adding reaction:', error);
    showToast('Failed to add reaction', 'error');
  }
}

async function toggleReaction(messageId, emoji) {
  await addReaction(messageId, emoji);
}

// ========== COPY MESSAGE ==========
function copyMessage(messageId) {
  const messages = state.messages[state.currentConversation._id] || [];
  const message = messages.find(m => m._id === messageId);
  
  if (!message) return;
  
  navigator.clipboard.writeText(message.content).then(() => {
    showToast('Message copied to clipboard', 'success');
  }).catch(() => {
    showToast('Failed to copy message', 'error');
  });
}

// ========== FORWARD MESSAGE ==========
function forwardMessage(messageId) {
  const messages = state.messages[state.currentConversation._id] || [];
  const message = messages.find(m => m._id === messageId);
  
  if (!message) return;
  
  // Show forward modal
  showForwardModal(message);
}

function showForwardModal(message) {
  const existingModal = document.getElementById('forward-modal');
  if (existingModal) existingModal.remove();
  
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const isDark = currentTheme === 'dark';
  
  const modal = document.createElement('div');
  modal.id = 'forward-modal';
  modal.className = 'modal active';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10003;
    animation: fadeIn 0.2s ease;
  `;
  
  modal.innerHTML = `
    <div class="modal-content" style="
      background: var(--background);
      border-radius: 16px;
      width: 90%;
      max-width: 500px;
      max-height: 70vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      animation: scaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    ">
      <div style="padding: 20px; border-bottom: 1px solid var(--border);">
        <h3 style="margin: 0; font-size: 18px; font-weight: 700;">Forward Message</h3>
      </div>
      
      <div style="padding: 16px; background: ${isDark ? '#1e293b' : '#f8fafc'}; border-bottom: 1px solid var(--border);">
        <div style="font-size: 12px; color: var(--text-light); margin-bottom: 4px;">Message:</div>
        <div style="font-size: 14px; color: var(--text); font-style: italic;">
          "${escapeHtml(message.content).substring(0, 100)}${message.content.length > 100 ? '...' : ''}"
        </div>
      </div>
      
      <div style="flex: 1; overflow-y: auto; padding: 16px;" id="forward-conversations-list">
        ${state.conversations.filter(c => c._id !== state.currentConversation._id).map(conv => `
          <div class="forward-conversation-item" onclick="confirmForward('${conv._id}', '${message._id}')" style="
            padding: 12px;
            border-radius: 8px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 12px;
            transition: background 0.2s ease;
            margin-bottom: 8px;
          " onmouseover="this.style.background='${isDark ? '#334155' : '#f1f5f9'}'" onmouseout="this.style.background='transparent'">
            <div class="avatar">${getConversationAvatar(conv)}</div>
            <div style="flex: 1;">
              <div style="font-weight: 600; font-size: 14px;">${getConversationName(conv)}</div>
              <div style="font-size: 12px; color: var(--text-light);">
                ${conv.type === 'group' ? 'Group' : 'Private'} chat
              </div>
            </div>
          </div>
        `).join('')}
      </div>
      
      <div style="padding: 16px; border-top: 1px solid var(--border); display: flex; justify-content: flex-end;">
        <button onclick="closeForwardModal()" class="btn-secondary">Cancel</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeForwardModal();
  });
}

function closeForwardModal() {
  const modal = document.getElementById('forward-modal');
  if (modal) modal.remove();
}

async function confirmForward(conversationId, messageId) {
  const messages = state.messages[state.currentConversation._id] || [];
  const message = messages.find(m => m._id === messageId);
  
  if (!message) return;
  
  try {
    const response = await fetch(`${API_URL}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({
        conversationId: conversationId,
        content: message.content,
        forwarded: true
      })
    });
    
    if (!response.ok) throw new Error('Failed to forward message');
    
    closeForwardModal();
    showToast('Message forwarded successfully', 'success');
  } catch (error) {
    console.error('Error forwarding message:', error);
    showToast('Failed to forward message', 'error');
  }
}

// ========== EDIT MESSAGE ==========
function editMessage(messageId) {
  const messages = state.messages[state.currentConversation._id] || [];
  const message = messages.find(m => m._id === messageId);
  
  if (!message) return;
  
  const messageInput = document.getElementById('messageInput');
  const sendBtn = document.getElementById('sendBtn');
  
  if (!messageInput || !sendBtn) return;
  
  // Cancel any active reply
  cancelReply();
  
  // Set input value
  messageInput.value = message.content;
  messageInput.dataset.editingId = messageId;
  
  // Change send button to update button
  sendBtn.innerHTML = '<i class="fas fa-check"></i>';
  sendBtn.style.background = 'linear-gradient(135deg, #3b82f6, #2563eb)';
  
  // Show cancel button
  const existingCancel = document.getElementById('edit-cancel-btn');
  if (existingCancel) existingCancel.remove();
  
  const cancelBtn = document.createElement('button');
  cancelBtn.id = 'edit-cancel-btn';
  cancelBtn.type = 'button';
  cancelBtn.className = 'icon-btn';
  cancelBtn.style.cssText = 'margin-right: 8px;';
  cancelBtn.innerHTML = '<i class="fas fa-times"></i>';
  cancelBtn.onclick = cancelEdit;
  
  sendBtn.parentElement.insertBefore(cancelBtn, sendBtn);
  
  messageInput.focus();
  messageInput.setSelectionRange(message.content.length, message.content.length);
  
  // Scroll to message being edited
  scrollToMessage(messageId);
}

function cancelEdit() {
  const messageInput = document.getElementById('messageInput');
  const sendBtn = document.getElementById('sendBtn');
  const cancelBtn = document.getElementById('edit-cancel-btn');
  
  if (messageInput) {
    messageInput.value = '';
    delete messageInput.dataset.editingId;
  }
  
  if (sendBtn) {
    sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
    sendBtn.style.background = 'linear-gradient(135deg, #00c46a, #009b54)';
  }
  
  if (cancelBtn) cancelBtn.remove();
}

// ========== DELETE MESSAGE ==========
function deleteMessage(messageId) {
  if (!confirm('Are you sure you want to delete this message?')) return;
  
  deleteMessageConfirmed(messageId);
}

async function deleteMessageConfirmed(messageId) {
  try {
    const response = await fetch(`${API_URL}/messages/${messageId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${state.token}`
      }
    });
    
    if (!response.ok) throw new Error('Failed to delete message');
    
    // Remove from local state
    const messages = state.messages[state.currentConversation._id];
    const index = messages.findIndex(m => m._id === messageId);
    if (index !== -1) {
      messages.splice(index, 1);
      renderMessages(state.currentConversation._id);
    }
    
    showToast('Message deleted', 'success');
  } catch (error) {
    console.error('Error deleting message:', error);
    showToast('Failed to delete message', 'error');
  }
}

// ========== SCROLL TO MESSAGE ==========
function scrollToMessage(messageId) {
  const messageEl = document.getElementById(`message-${messageId}`);
  if (!messageEl) return;
  
  messageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  
  // Highlight effect
  messageEl.style.background = 'rgba(0, 196, 106, 0.1)';
  setTimeout(() => {
    messageEl.style.background = '';
  }, 1500);
}

// ========== TOAST NOTIFICATIONS ==========
function showToast(message, type = 'info') {
  const existingToast = document.getElementById('action-toast');
  if (existingToast) existingToast.remove();
  
  const colors = {
    success: '#10b981',
    error: '#ef4444',
    info: '#3b82f6'
  };
  
  const icons = {
    success: 'fa-check-circle',
    error: 'fa-exclamation-circle',
    info: 'fa-info-circle'
  };
  
  const toast = document.createElement('div');
  toast.id = 'action-toast';
  toast.style.cssText = `
    position: fixed;
    bottom: 80px;
    left: 50%;
    transform: translateX(-50%);
    background: ${colors[type]};
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    z-index: 10004;
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 14px;
    font-weight: 500;
    animation: toastIn 0.3s ease;
  `;
  
  toast.innerHTML = `
    <i class="fas ${icons[type]}"></i>
    <span>${message}</span>
  `;
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'toastOut 0.35s cubic-bezier(0.55, 0.06, 0.68, 0.19) forwards';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

// ========== UPDATE MESSAGE FORM HANDLER ==========
// Replace the existing message form handler with this updated version:

const messageFormHandler = document.getElementById('messageForm');
if (messageFormHandler) {
  messageFormHandler.removeEventListener('submit', null); // Remove old listener
  
  messageFormHandler.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const input = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    
    if (!input || !sendBtn) return;
    
    const content = input.value.trim();
    
    if (!content || !state.currentConversation) return;
    
    // Check if editing
    const editingId = input.dataset.editingId;
    
    if (editingId) {
      // Update existing message
      sendBtn.disabled = true;
      
      try {
        const response = await fetch(`${API_URL}/messages/${editingId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${state.token}`
          },
          body: JSON.stringify({ content })
        });
        
        if (!response.ok) throw new Error('Failed to update message');
        
        const updatedMessage = await response.json();
        
        // Update local state
        const messages = state.messages[state.currentConversation._id];
        const index = messages.findIndex(m => m._id === editingId);
        if (index !== -1) {
          messages[index] = updatedMessage;
          renderMessages(state.currentConversation._id);
        }
        
        cancelEdit();
        showToast('Message updated', 'success');
      } catch (error) {
        console.error('Error updating message:', error);
        showToast('Failed to update message', 'error');
      } finally {
        sendBtn.disabled = false;
      }
      
      return;
    }
    
    // Send new message
    sendBtn.disabled = true;
    const originalHTML = sendBtn.innerHTML;
    sendBtn.innerHTML = '<div style="width: 20px; height: 20px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: spin 1s linear infinite; margin: 0;"></div>';
    
    try {
      const messageData = {
        conversationId: state.currentConversation._id,
        content
      };
      
      // Add reply reference if replying
      if (replyingTo) {
        messageData.replyTo = replyingTo._id;
      }
      
      const response = await fetch(`${API_URL}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.token}`
        },
        body: JSON.stringify(messageData)
      });
      
      if (!response.ok) throw new Error('Failed to send message');
      
      input.value = '';
      cancelReply();
      
      // Stop typing indicator
      if (state.socket) {
        state.socket.emit('typing', {
          conversationId: state.currentConversation._id,
          isTyping: false
        });
      }
    } catch (error) {
      console.error('Error sending message:', error);
      showToast('Failed to send message', 'error');
    } finally {
      sendBtn.disabled = false;
      sendBtn.innerHTML = originalHTML;
    }
  });
}

// ========== ADD ANIMATIONS CSS ==========
if (!document.getElementById('messageActionsAnimations')) {
  const style = document.createElement('style');
  style.id = 'messageActionsAnimations';
  style.textContent = `
    @keyframes slideDown {
      from {
        opacity: 0;
        transform: translateY(-10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    @keyframes toastIn {
      0% {
        opacity: 0;
        transform: translate(-50%, 30px) scale(0.95);
      }
      60% {
        opacity: 1;
        transform: translate(-50%, -4px) scale(1.02);
      }
      100% {
        opacity: 1;
        transform: translate(-50%, 0) scale(1);
      }
    }
    
    @keyframes toastOut {
      0% {
        opacity: 1;
        transform: translate(-50%, 0) scale(1);
      }
      100% {
        opacity: 0;
        transform: translate(-50%, 20px) scale(0.95);
      }
    }
      
    .message-bubble-wrapper:hover .message-actions-btn {
      display: flex !important;
    }
    
    .btn-secondary {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--text);
      padding: 10px 20px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
      transition: all 0.2s ease;
    }
    
    .btn-secondary:hover {
      background: var(--border);
    }
  `;
  document.head.appendChild(style);
}

// ========== ADD SOCKET EVENT LISTENERS ==========
// Add these to your initializeSocket() function after existing socket.on handlers:

function addMessageActionSocketListeners() {
  if (!state.socket) return;
  
  // Handle message updates (edits)
  state.socket.on('messageUpdated', (updatedMessage) => {
    const convId = updatedMessage.conversationId;
    const messages = state.messages[convId];
    
    if (messages) {
      const index = messages.findIndex(m => m._id === updatedMessage._id);
      if (index !== -1) {
        messages[index] = updatedMessage;
        
        // Re-render if viewing this conversation
        if (state.currentConversation?._id === convId) {
          renderMessages(convId);
        }
        
        // Update conversation last message if needed
        const conv = state.conversations.find(c => c._id === convId);
        if (conv && conv.lastMessage && conv.lastMessage.text === messages[index].content) {
          conv.lastMessage.text = updatedMessage.content;
          renderConversations();
        }
      }
    }
  });
  
  // Handle message deletions
  state.socket.on('messageDeleted', ({ messageId, conversationId }) => {
    const messages = state.messages[conversationId];
    
    if (messages) {
      const index = messages.findIndex(m => m._id === messageId);
      if (index !== -1) {
        messages.splice(index, 1);
        
        // Re-render if viewing this conversation
        if (state.currentConversation?._id === conversationId) {
          renderMessages(conversationId);
        }
        
        // Update conversation list
        renderConversations();
      }
    }
  });
  
  // Handle reaction updates
  state.socket.on('messageReactionUpdated', ({ messageId, reactions, userId, emoji }) => {
    // Find the message in any conversation
    for (const convId in state.messages) {
      const messages = state.messages[convId];
      const message = messages.find(m => m._id === messageId);
      
      if (message) {
        message.reactions = reactions;
        
        // Re-render if viewing this conversation
        if (state.currentConversation?._id === convId) {
          renderMessages(convId);
        }
        
        // Show toast if someone reacted to your message and you're not viewing the chat
        if (message.sender._id === state.user.id && 
            userId !== state.user.id && 
            emoji && 
            state.currentConversation?._id !== convId) {
          const reactor = state.users.find(u => u._id === userId);
          const reactorName = reactor ? reactor.username : 'Someone';
          showToast(`${reactorName} reacted with ${emoji}`, 'info');
        }
        
        break;
      }
    }
  });
}

// Call this function after socket initialization
// Add this line to your initializeSocket() function:
/*
function initializeSocket() {
  state.socket = io(SOCKET_URL, {
    auth: { token: state.token }
  });
  
  // ... existing socket.on handlers ...
  
  // Add message action listeners
  addMessageActionSocketListeners();
}
*/