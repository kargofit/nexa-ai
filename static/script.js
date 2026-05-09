document.addEventListener('DOMContentLoaded', () => {
    const chatForm = document.getElementById('chat-form');
    const userInput = document.getElementById('user-input');
    const chatContainer = document.getElementById('chat-container');

    // Setup marked options for safe markdown rendering
    if (typeof marked !== 'undefined') {
        marked.setOptions({
            breaks: true,
            gfm: true
        });
    }

    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const message = userInput.value.trim();
        if (!message) return;

        // Remove existing nudges if any
        const existingNudges = document.querySelectorAll('.nudges-container');
        existingNudges.forEach(el => el.remove());

        // Add user message to UI
        addMessage(message, 'user');
        userInput.value = '';

        // Add typing indicator
        const typingIndicatorId = showTypingIndicator();

        try {
            const response = await fetch('/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ message })
            });

            const data = await response.json();
            
            // Remove typing indicator
            removeElement(typingIndicatorId);

            if (response.ok) {
                addMessage(data.response, 'assistant', data.nudges);
            } else {
                addMessage(`Error: ${data.error}`, 'assistant');
            }
        } catch (error) {
            removeElement(typingIndicatorId);
            addMessage(`Connection error: ${error.message}`, 'assistant');
        }
    });

    function addMessage(text, sender, nudges = []) {
        const wrapper = document.createElement('div');
        wrapper.className = `message-wrapper ${sender}`;

        const avatar = document.createElement('div');
        avatar.className = `avatar ${sender}-avatar`;
        avatar.textContent = sender === 'user' ? 'U' : 'NX';

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
        
        if (nudges && nudges.length > 0) {
            const nudgesContainer = document.createElement('div');
            nudgesContainer.className = 'nudges-container';
            
            nudges.forEach(nudge => {
                const button = document.createElement('button');
                button.className = 'nudge-button';
                
                let nudgeText = '';
                if (typeof nudge === 'string') {
                    // Fallback for older format
                    nudgeText = nudge;
                    button.textContent = nudgeText;
                } else {
                    nudgeText = nudge.text || nudge.subcategory;
                    button.innerHTML = `<span class="nudge-category">${nudge.category} &rsaquo; ${nudge.subcategory}</span><br/>${nudgeText}`;
                }
                
                button.onclick = () => {
                    userInput.value = nudgeText;
                    chatForm.dispatchEvent(new Event('submit'));
                };
                nudgesContainer.appendChild(button);
            });
            
            chatContainer.appendChild(nudgesContainer);
        }
        
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
        if (el) {
            el.remove();
        }
    }

    function scrollToBottom() {
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
});
