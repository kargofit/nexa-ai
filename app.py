import os
import json
from flask import Flask, request, jsonify, render_template
from dotenv import load_dotenv
from openai import OpenAI
from ai_coach import SYSTEM_INSTRUCTION

load_dotenv()

app = Flask(__name__)

api_key = os.environ.get("OPENAI_API_KEY")
if not api_key:
    print("Warning: OPENAI_API_KEY environment variable is not set. Chat will not work.")

# Initialize global client and conversation history
client = None
conversation_history = []

if api_key:
    try:
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
        
        messages_for_api = conversation_history.copy()
        # Ensure we request JSON format for the UI to parse nudges
        messages_for_api[0] = {
            "role": "system",
            "content": SYSTEM_INSTRUCTION + "\n\nIMPORTANT: You must respond in JSON format with two keys: 'reply' (your actual response formatted in markdown, without the follow-up questions at the end) and 'nudges'. The 'nudges' key must be an array of 2-3 objects, each representing a suggested follow-up. Each object must have 'category' (the top-level coaching category), 'subcategory' (the specific coaching subcategory from the prompt), and 'text' (a short actionable question or statement, max 10 words, that the user can click as their next reply)."
        }

        response = client.chat.completions.create(
            model="gpt-4o",
            messages=messages_for_api,
            temperature=0.7,
            response_format={ "type": "json_object" }
        )
        
        response_content = response.choices[0].message.content
        try:
            parsed_response = json.loads(response_content)
            reply = parsed_response.get('reply', response_content)
            nudges = parsed_response.get('nudges', [])
        except json.JSONDecodeError:
            reply = response_content
            nudges = []

        conversation_history.append({"role": "assistant", "content": reply})
        return jsonify({'response': reply, 'nudges': nudges})
    except Exception as e:
        if conversation_history and conversation_history[-1]["role"] == "user":
            conversation_history.pop()
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
