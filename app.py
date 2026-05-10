import os
import json
from flask import Flask, request, jsonify, render_template
from dotenv import load_dotenv
from ai_coach import SYSTEM_INSTRUCTION

load_dotenv()

app = Flask(__name__)

# --- Provider configuration ---
# Set AI_PROVIDER=claude to use Anthropic Claude; defaults to openai.
# Set AI_MODEL to override the default model for the chosen provider.
AI_PROVIDER = os.environ.get("AI_PROVIDER", "openai").lower()

DEFAULT_MODELS = {
    "openai": "gpt-4o",
    "claude": "claude-sonnet-4-5",
}
AI_MODEL = os.environ.get("AI_MODEL", DEFAULT_MODELS.get(AI_PROVIDER, "gpt-4o"))

if AI_PROVIDER == "claude":
    api_key = os.environ.get("CLAUDE_API_KEY")
    if not api_key:
        print("Warning: CLAUDE_API_KEY environment variable is not set. Chat will not work.")
else:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("Warning: OPENAI_API_KEY environment variable is not set. Chat will not work.")

print(f"AI Provider: {AI_PROVIDER.upper()} | Model: {AI_MODEL}")

# Initialize global client and conversation history
client = None
conversation_history = []

if api_key:
    try:
        if AI_PROVIDER == "claude":
            from anthropic import Anthropic
            client = Anthropic(api_key=api_key)
        else:
            from openai import OpenAI
            client = OpenAI(api_key=api_key)
        conversation_history = [
            {"role": "system", "content": SYSTEM_INSTRUCTION}
        ]
        print("Initialized AI Coach chat session.")
    except Exception as e:
        print(f"Failed to initialize chat session: {e}")

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/chat', methods=['POST'])
def chat():
    global conversation_history
    if not client:
        return jsonify({'error': 'AI Coach is not initialized. Please check your API key.'}), 500
        
    data = request.json
    if not data or 'message' not in data:
        return jsonify({'error': 'Message is required'}), 400
        
    user_message = data['message']
    
    try:
        conversation_history.append({"role": "user", "content": user_message})

        if AI_PROVIDER == "claude":
            # Anthropic API: system prompt is separate; messages exclude system role
            messages_for_api = [m for m in conversation_history if m["role"] != "system"]
            response = client.messages.create(
                model=AI_MODEL,
                max_tokens=1024,
                system=SYSTEM_INSTRUCTION,
                messages=messages_for_api,
            )
            reply = response.content[0].text
        else:
            messages_for_api = conversation_history.copy()
            response = client.chat.completions.create(
                model=AI_MODEL,
                messages=messages_for_api,
                temperature=0.7,
            )
            reply = response.choices[0].message.content

        conversation_history.append({"role": "assistant", "content": reply})
        return jsonify({'response': reply})
    except Exception as e:
        if conversation_history and conversation_history[-1]["role"] == "user":
            conversation_history.pop()
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
