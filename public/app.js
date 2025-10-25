// ========== STATE MANAGEMENT ==========
const state = {
  token: localStorage.getItem('token') || null,
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  conversations: [],
  currentConversation: null,
  users: [],
  messages: {},
  socket: null,
  typingTimeouts: {}
};

const API_URL = 'http://localhost:3000/api';

// ========== INITIALIZE ==========
document.addEventListener('DOMContentLoaded', () => {
  if (state.token && state.user) {
    initializeChat();
  }
});

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
  
  try {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      errorEl.textContent = data.error || 'Login failed';
      errorEl.classList.add('active');
      return;
    }
    
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    
    closeAuthModal();
    initializeChat();
  } catch (error) {
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
  
  if (password !== confirmPassword) {
    errorEl.textContent = 'Passwords do not match';
    errorEl.classList.add('active');
    return;
  }
  
  try {
    const response = await fetch(`${API_URL}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      errorEl.textContent = data.error || 'Signup failed';
      errorEl.classList.add('active');
      return;
    }
    
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    
    closeAuthModal();
    initializeChat();
  } catch (error) {
    errorEl.textContent = 'Connection error. Please try again.';
    errorEl.classList.add('active');
  }
});

// ========== CHAT INITIALIZATION ==========
async function initializeChat() {
  document.getElementById('landingPage').style.display = 'none';
  document.getElementById('chatApp').style.display = 'grid';
  
  // Update sidebar user info
  document.getElementById('sidebarUsername').textContent = state.user.username;
  document.getElementById('sidebarAvatar').textContent = state.user.avatar;
  
  // Initialize Socket.IO
  initializeSocket();
  
  // Load conversations
  await loadConversations();
  
  // Load users
  await loadUsers();
  
  // Apply saved theme
  if (state.user.settings.theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.getElementById('themeSelect').value = 'dark';
  }
  
  document.getElementById('notificationsToggle').checked = state.user.settings.notifications;
}

// ========== SOCKET.IO ==========
function initializeSocket() {
  state.socket = io('http://localhost:3000', {
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
  const searchTerm = document.getElementById('searchConversations').value.toLowerCase();
  
  const filtered = state.conversations.filter(conv => {
    const name = getConversationName(conv).toLowerCase();
    return name.includes(searchTerm);
  });
  
  if (filtered.length === 0) {
    container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-light);">No conversations yet</div>';
    return;
  }
  
  container.innerHTML = filtered.map(conv => {
    const name = getConversationName(conv);
    const avatar = getConversationAvatar(conv);
    const lastMsg = conv.lastMessage;
    const unreadCount = conv.unreadCount?.[state.user.id] || 0;
    const isActive = state.currentConversation?._id === conv._id;
    
    return `
      <div class="conversation-item ${isActive ? 'active' : ''}" onclick="openConversation('${conv._id}')">
        <div class="avatar">${avatar}</div>
        <div class="conversation-info">
          <div class="conversation-header">
            <div class="conversation-name">${name}</div>
            <div class="conversation-time">${lastMsg ? formatTime(lastMsg.time) : ''}</div>
          </div>
          <div class="conversation-preview">${lastMsg ? lastMsg.text : 'No messages yet'}</div>
        </div>
        ${unreadCount > 0 ? `<div class="unread-badge">${unreadCount}</div>` : ''}
      </div>
    `;
  }).join('');
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

// Search conversations
document.getElementById('searchConversations').addEventListener('input', renderConversations);

// ========== OPEN CONVERSATION ==========
async function openConversation(conversationId) {
  const conv = state.conversations.find(c => c._id === conversationId);
  if (!conv) return;
  
  state.currentConversation = conv;
  
  // Update UI
  document.querySelector('.chat-placeholder').style.display = 'none';
  document.getElementById('chatContainer').style.display = 'flex';
  
  const name = getConversationName(conv);
  const avatar = getConversationAvatar(conv);
  
  document.getElementById('chatName').textContent = name;
  document.getElementById('chatAvatar').textContent = avatar;
  document.getElementById('infoName').textContent = name;
  document.getElementById('infoAvatar').textContent = avatar;
  
  // Update status
  if (conv.type === 'private') {
    const otherUser = conv.participants.find(p => p._id !== state.user.id);
    const status = otherUser.status === 'online' ? 'Online' : `Last seen ${formatTime(otherUser.lastSeen)}`;
    document.getElementById('chatStatus').textContent = status;
    document.getElementById('infoStatus').textContent = status;
  } else {
    document.getElementById('chatStatus').textContent = `${conv.participants.length} members`;
    document.getElementById('infoStatus').textContent = `${conv.participants.length} members`;
  }
  
  // Render participants
  renderParticipants(conv);
  
  // Mark active conversation
  renderConversations();
  
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
  }
}

function renderMessages(conversationId) {
  if (state.currentConversation?._id !== conversationId) return;
  
  const container = document.getElementById('messagesContainer');
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
document.getElementById('messageForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const input = document.getElementById('messageInput');
  const content = input.value.trim();
  
  if (!content || !state.currentConversation) return;
  
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
    state.socket.emit('typing', {
      conversationId: state.currentConversation._id,
      isTyping: false
    });
  } catch (error) {
    console.error('Error sending message:', error);
  }
});

// Typing Indicator
let typingTimeout;
document.getElementById('messageInput').addEventListener('input', (e) => {
  if (!state.currentConversation) return;
  
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

function handleTypingIndicator(userId, username, conversationId, isTyping) {
  if (state.currentConversation?._id !== conversationId || userId === state.user.id) return;
  
  const indicator = document.getElementById('typingIndicator');
  const usernameEl = document.getElementById('typingUsername');
  
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

// ========== NEW CHAT MODAL ==========
function showNewChatModal() {
  document.getElementById('newChatModal').classList.add('active');
  switchNewChatTab('private');
  renderUsersList();
}

function closeNewChatModal() {
  document.getElementById('newChatModal').classList.remove('active');
  document.getElementById('searchUsers').value = '';
  document.getElementById('searchGroupUsers').value = '';
  document.getElementById('groupName').value = '';
}

function switchNewChatTab(tab) {
  const privateTab = document.getElementById('privateTab');
  const groupTab = document.getElementById('groupTab');
  const privateSection = document.getElementById('privateChatSection');
  const groupSection = document.getElementById('groupChatSection');
  
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
  const searchTerm = document.getElementById('searchUsers').value.toLowerCase();
  
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
  const searchTerm = document.getElementById('searchGroupUsers').value.toLowerCase();
  
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

document.getElementById('searchUsers').addEventListener('input', renderUsersList);
document.getElementById('searchGroupUsers').addEventListener('input', renderGroupUsersList);

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
  }
}

async function createGroupChat() {
  const groupName = document.getElementById('groupName').value.trim();
  
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
  }
}

// ========== CHAT INFO PANEL ==========
function toggleChatInfo() {
  const panel = document.getElementById('chatInfo');
  if (panel.style.display === 'none' || !panel.style.display) {
    panel.style.display = 'block';
  } else {
    panel.style.display = 'none';
  }
}

function renderParticipants(conv) {
  const container = document.getElementById('participantsList');
  
  container.innerHTML = conv.participants.map(user => `
    <div class="participant-item">
      <div class="avatar">${user.avatar}</div>
      <div class="participant-name">${user.username}</div>
    </div>
  `).join('');
}

// ========== SETTINGS MODAL ==========
function toggleSettingsModal() {
  const modal = document.getElementById('settingsModal');
  if (modal.classList.contains('active')) {
    modal.classList.remove('active');
  } else {
    document.getElementById('settingsUsername').textContent = state.user.username;
    document.getElementById('settingsAvatar').textContent = state.user.avatar;
    modal.classList.add('active');
  }
}

async function changeTheme() {
  const theme = document.getElementById('themeSelect').value;
  
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
    
    state.user.settings.theme = theme;
    localStorage.setItem('user', JSON.stringify(state.user));
  } catch (error) {
    console.error('Error updating theme:', error);
  }
}

async function toggleNotifications() {
  const enabled = document.getElementById('notificationsToggle').checked;
  
  try {
    await fetch(`${API_URL}/users/settings`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({ notifications: enabled })
    });
    
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
      document.getElementById('chatStatus').textContent = statusText;
      document.getElementById('infoStatus').textContent = statusText;
    }
  }
  
  renderConversations();
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
document.getElementById('authModal').addEventListener('click', (e) => {
  if (e.target.id === 'authModal') closeAuthModal();
});

document.getElementById('newChatModal').addEventListener('click', (e) => {
  if (e.target.id === 'newChatModal') closeNewChatModal();
});

document.getElementById('settingsModal').addEventListener('click', (e) => {
  if (e.target.id === 'settingsModal') toggleSettingsModal();
});