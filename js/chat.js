const PROXY_URL = 'https://bold-glade-7f61.tim-e-flinn.workers.dev';

// ============================================================
// SEEK NEXUS — AI Chat Widget
// Proxied through Cloudflare Worker (API key stays server-side)
//
// After deploying cloudflare-worker.js, replace the URL below
// with your worker URL, e.g.:
//   https://seek-nexus-ai.YOUR-NAME.workers.dev
// ============================================================


function getSystemPrompt(name) {
  return `You are a helpful AI assistant for Seek Nexus (www.seek-nexus.com), a full-service technology company.

The person you are speaking with is ${name ? escapeHtml(name) : 'a potential customer'}, interested in Seek Nexus's services.

Services offered:
- Networking & low voltage installations (long-range wireless bridges, TP-Link Omada systems, structured cabling)
- Commercial & residential security camera installation
- Commercial audio design and installation (multi-zone, custom acoustic planning)
- Website design and hosting (mobile-first, modern design)
- Custom AI agent integration for customer support

Keep answers concise, friendly, and professional. Help visitors understand the services, answer questions, and encourage them to fill out the contact form for a free quote. If asked about pricing, say it varies by project and invite them to request a free quote.`;
}

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
const userForm    = document.getElementById('sn-chat-user-form');
const userNameInput = document.getElementById('sn-user-name');
const userEmailInput = document.getElementById('sn-user-email');
const userSaveBtn = document.getElementById('sn-user-save');


// ---- Cookie helpers ----
function setCookie(name, value, days) {
  let expires = '';
  if (days) {
    const date = new Date();
    date.setTime(date.getTime() + (days*24*60*60*1000));
    expires = '; expires=' + date.toUTCString();
  }
  document.cookie = name + '=' + encodeURIComponent(value) + expires + '; path=/';
}
function getCookie(name) {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : '';
}

// ---- Toggle panel ----
function openChat() {
  panel.classList.add('open');
  toggle.style.display = 'none';
  userName = getCookie('sn_user_name') || '';
  userEmail = getCookie('sn_user_email') || '';
  if (!userName || !userEmail) {
    userForm.style.display = 'block';
    document.getElementById('sn-chat-main').style.display = 'none';
    setTimeout(() => userNameInput.focus(), 100);
  } else {
    userForm.style.display = 'none';
    document.getElementById('sn-chat-main').style.display = 'block';
    input.focus();
  }
}

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
  setCookie('sn_user_name', userName, 30);
  setCookie('sn_user_email', userEmail, 30);
  userForm.style.display = 'none';
  document.getElementById('sn-chat-main').style.display = 'block';
  // Get the user name to use in prompt
  CLIENT_NAME = escapeHtml(userName);
  setTimeout(() => input.focus(), 100);
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
  // Always scroll to bottom after new message
  setTimeout(() => {
    messages.scrollTop = messages.scrollHeight;
  }, 10);
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
    openChat();
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
          { role: 'system', content: getSystemPrompt(userName) },
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
