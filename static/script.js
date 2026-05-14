document.addEventListener('DOMContentLoaded', async () => {
    const chatForm = document.getElementById('chat-form');
    const userInput = document.getElementById('user-input');
    const chatContainer = document.getElementById('chat-container');

    if (typeof marked !== 'undefined') {
        marked.setOptions({ breaks: true, gfm: true });
    }

    // On every page load, if already logged in, start a fresh session
    // with past highlights injected into the AI context.
    try {
        const meRes = await fetch('/me');
        const meData = await meRes.json();
        if (meData.logged_in) {
            const nsRes = await fetch('/new-session', { method: 'POST' });
            if (nsRes.ok) {
                const nsData = await nsRes.json();
                showApp(nsData.user_name, nsData.initials, nsData.profile_image, nsData.returning);
            }
        }
    } catch (_) {}

    // Password visibility toggle
    document.getElementById('toggle-password').addEventListener('click', () => {
        const input = document.getElementById('login-password');
        const eyeOn = document.getElementById('eye-icon');
        const eyeOff = document.getElementById('eye-off-icon');
        if (input.type === 'password') {
            input.type = 'text';
            eyeOn.style.display = 'none';
            eyeOff.style.display = 'inline';
        } else {
            input.type = 'password';
            eyeOn.style.display = 'inline';
            eyeOff.style.display = 'none';
        }
    });

    // Login
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        const errorEl = document.getElementById('login-error');
        const btn = document.getElementById('login-button');

        const resetBtn = () => { btn.disabled = false; btn.textContent = 'Sign In'; };
        btn.disabled = true;
        btn.textContent = 'Signing in…';
        errorEl.textContent = '';

        // Step 1: authenticate directly against the we-ace auth API
        let authData;
        try {
            const authRes = await fetch('https://api.we-ace.com/api/v1/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });
            authData = await authRes.json();
            if (!authRes.ok) {
                errorEl.textContent = authData.message || authData.error || 'Invalid email or password';
                resetBtn();
                return;
            }
        } catch (err) {
            errorEl.textContent = 'Authentication service unavailable. Please try again.';
            resetBtn();
            return;
        }

        // Step 2: establish our backend session with the returned profile + tokens
        const profile = authData.profileDetails || {};
        try {
            const res = await fetch('/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: profile.userId || profile._id,
                    firstName: profile.firstName,
                    lastName: profile.lastName,
                    email: profile.email || email,
                    profileImage: profile.profileImage,
                    accessToken: authData.accessToken,
                    refreshToken: authData.refreshToken,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                errorEl.textContent = data.error || 'Session error. Please try again.';
                resetBtn();
                return;
            }
            showApp(data.user_name, data.initials, data.profile_image, data.returning);
        } catch (err) {
            errorEl.textContent = 'Connection error. Please try again.';
            resetBtn();
        }
    });

    // Logout
    document.getElementById('logout-button').addEventListener('click', async () => {
        await fetch('/logout', { method: 'POST' });
        location.reload();
    });

    // Chat
    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const message = userInput.value.trim();
        if (!message) return;

        addMessage(message, 'user');
        userInput.value = '';

        const typingId = showTypingIndicator();

        try {
            const res = await fetch('/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message }),
            });
            const data = await res.json();
            removeElement(typingId);

            if (res.status === 401) {
                location.reload();
            } else if (res.ok) {
                addMessage(data.response, 'assistant');
            } else {
                addMessage(`Error: ${data.error}`, 'assistant');
            }
        } catch (err) {
            removeElement(typingId);
            addMessage(`Connection error: ${err.message}`, 'assistant');
        }
    });

    function showApp(userName, initials, profileImage, returning) {
        document.getElementById('login-overlay').style.display = 'none';
        document.getElementById('app-container').style.display = 'flex';
        document.getElementById('user-display').textContent = userName;
        window._userInitials = initials;
        window._profileImage = profileImage || '';

        // Header avatar
        const headerAvatar = document.getElementById('header-avatar');
        if (profileImage) {
            const img = document.createElement('img');
            img.src = profileImage;
            img.alt = userName;
            img.className = 'avatar-img';
            img.onerror = () => { img.replaceWith(makeInitialsSpan(initials)); };
            headerAvatar.appendChild(img);
        } else {
            headerAvatar.appendChild(makeInitialsSpan(initials));
        }

        const welcomeEl = document.getElementById('welcome-text');
        if (returning) {
            welcomeEl.textContent = `Welcome back, ${userName}. Ready to continue your leadership journey? What's on your mind today?`;
        } else {
            welcomeEl.textContent = `Welcome to your Executive Leadership Coaching Session, ${userName}. I'm Nexa, here to help you navigate complex professional challenges, enhance your leadership skills, and drive strategic impact. What would you like to focus on today?`;
        }
    }

    function makeInitialsSpan(initials) {
        const span = document.createElement('span');
        span.textContent = initials || 'U';
        return span;
    }

    function addMessage(text, sender) {
        const wrapper = document.createElement('div');
        wrapper.className = `message-wrapper ${sender}`;

        const avatar = document.createElement('div');
        avatar.className = `avatar ${sender}-avatar`;

        if (sender === 'user' && window._profileImage) {
            const img = document.createElement('img');
            img.src = window._profileImage;
            img.alt = window._userInitials || 'U';
            img.className = 'avatar-img';
            img.onerror = () => { avatar.textContent = window._userInitials || 'U'; };
            avatar.appendChild(img);
        } else {
            avatar.textContent = sender === 'user' ? (window._userInitials || 'U') : 'NX';
        }

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}-message`;

        if (sender === 'assistant' && typeof marked !== 'undefined') {
            messageDiv.innerHTML = marked.parse(text);
        } else {
            messageDiv.textContent = text;
        }

        wrapper.appendChild(avatar);
        wrapper.appendChild(messageDiv);
        chatContainer.appendChild(wrapper);
        scrollToBottom();
    }

    function showTypingIndicator() {
        const id = 'typing-' + Date.now();
        const wrapper = document.createElement('div');
        wrapper.className = 'message-wrapper assistant';
        wrapper.id = id;

        const avatar = document.createElement('div');
        avatar.className = 'avatar assistant-avatar';
        avatar.textContent = 'NX';

        const messageDiv = document.createElement('div');
        messageDiv.className = 'message assistant-message';

        const typingDiv = document.createElement('div');
        typingDiv.className = 'typing-indicator';
        typingDiv.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';

        messageDiv.appendChild(typingDiv);
        wrapper.appendChild(avatar);
        wrapper.appendChild(messageDiv);
        chatContainer.appendChild(wrapper);
        scrollToBottom();
        return id;
    }

    function removeElement(id) {
        const el = document.getElementById(id);
        if (el) el.remove();
    }

    function scrollToBottom() {
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
});
