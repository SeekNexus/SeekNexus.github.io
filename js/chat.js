// ============================================================
// SEEK NEXUS — AI Chat Widget
// Proxied through Cloudflare Worker (API key stays server-side)
//
// After deploying cloudflare-worker.js, replace the URL below
// with your worker URL, e.g.:
//   https://seek-nexus-ai.YOUR-NAME.workers.dev
// ============================================================

const PROXY_URL = 'https://bold-glade-7f61.tim-e-flinn.workers.dev';

const SYSTEM_PROMPT = `You are a helpful AI assistant for Seek Nexus (www.seek-nexus.com), a full-service technology company.

Services offered:
- Networking & low voltage installations (long-range wireless bridges, TP-Link Omada systems, structured cabling)
- Commercial & residential security camera installation
- Commercial audio design and installation (multi-zone, custom acoustic planning)
- Website design and hosting (mobile-first, modern design)
- Custom AI agent integration for customer support

Keep answers concise, friendly, and professional. Help visitors understand the services, answer questions, and encourage them to fill out the contact form for a free quote. If asked about pricing, say it varies by project and invite them to request a free quote.`;

// ---- State ----
const chatHistory = []; // { role, content }
let userName = '';
let userEmail = '';

// ---- DOM refs ----
const toggle      = document.getElementById('sn-chat-toggle');
const panel       = document.getElementById('sn-chat-panel');
const closeBtn    = document.getElementById('sn-chat-close-btn');
const messages    = document.getElementById('sn-chat-messages');
const input       = document.getElementById('sn-chat-input');
const sendBtn     = document.getElementById('sn-chat-send');
const userModal   = document.getElementById('sn-chat-user-modal');
const userNameInput = document.getElementById('sn-user-name');
const userEmailInput = document.getElementById('sn-user-email');
const userSaveBtn = document.getElementById('sn-user-save');

// ---- Toggle panel ----

function openChat() {
  panel.classList.add('open');
  toggle.style.display = 'none';
  // If user info not set, show modal
  if (!userName || !userEmail) {
    userModal.style.display = 'flex';
    setTimeout(() => userNameInput.focus(), 100);
  } else {
    input.focus();
  }
}
// Handle user info modal
userSaveBtn.addEventListener('click', saveUserInfo);
userNameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveUserInfo(); });
userEmailInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveUserInfo(); });

function saveUserInfo() {
  const name = userNameInput.value.trim();
  const email = userEmailInput.value.trim();
  if (!name || !validateEmail(email)) {
    userNameInput.classList.toggle('is-invalid', !name);
    userEmailInput.classList.toggle('is-invalid', !validateEmail(email));
    return;
  }
  userName = name;
  userEmail = email;
  userModal.style.display = 'none';
  input.focus();
}

function validateEmail(email) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}


async function closeChat() {
  panel.classList.remove('open');
  toggle.style.display = 'flex';
  // Send log to Worker for Google Sheet
  if (userName && userEmail && chatHistory.length > 0) {
    try {
      await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          logToSheet: true,
          user: { name: userName, email: userEmail },
          log: chatHistory
        })
      });
    } catch (err) {
      // Silent fail
      console.warn('Failed to log chat to Google Sheet:', err);
    }
  }
}

toggle.addEventListener('click', () => {
  panel.classList.contains('open') ? closeChat() : openChat();
});

closeBtn.addEventListener('click', closeChat);

// ---- Add message bubble ----
function addMessage(role, text) {
  const div = document.createElement('div');
  div.className = `sn-msg sn-msg-${role === 'user' ? 'user' : 'bot'}`;
  div.innerHTML = `<span>${escapeHtml(text)}</span>`;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
  return div;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---- Typing indicator ----
function showTyping() {
  const div = document.createElement('div');
  div.className = 'sn-msg sn-msg-bot sn-msg-typing';
  div.id = 'sn-typing';
  div.innerHTML = '<span></span><span></span><span></span>';
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

function removeTyping() {
  const el = document.getElementById('sn-typing');
  if (el) el.remove();
}

// ---- Send message ----
async function sendMessage() {
  const text = input.value.trim();
  if (!text) return;
  if (!userName || !userEmail) {
    userModal.style.display = 'flex';
    setTimeout(() => userNameInput.focus(), 100);
    return;
  }

  input.value = '';
  sendBtn.disabled = true;

  addMessage('user', text);
  chatHistory.push({ role: 'user', content: text });

  showTyping();

  try {
    const response = await fetch(PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...chatHistory
        ],
        max_tokens: 300,
        temperature: 0.7,
        stream: false,
        user: {
          name: userName,
          email: userEmail
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      const apiMsg = data.error?.message || `Error ${response.status}`;
      throw new Error(apiMsg);
    }

    const reply = data.choices[0].message.content.trim();
    chatHistory.push({ role: 'assistant', content: reply });

    removeTyping();
    addMessage('assistant', reply);
  } catch (err) {
    removeTyping();
    const errText = err.message && err.message.length < 200
      ? `Connection issue: ${err.message}`
      : 'Sorry, I had trouble connecting. Please try again or use the contact form below.';
    addMessage('assistant', errText);
    console.error('Seek Nexus AI error:', err);
  }

  sendBtn.disabled = false;
  input.focus();
}

// ---- Event listeners ----
sendBtn.addEventListener('click', sendMessage);

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
