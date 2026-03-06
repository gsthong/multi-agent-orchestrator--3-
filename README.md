# Vanilla AI Chatbot

A fast, lightweight, and beginner-friendly AI Chatbot built purely with **Vanilla TypeScript**, **HTML**, **Tailwind CSS**, and the **Google Gemini API**. No heavy frameworks like React or Next.js required! 

This project is perfect for first-year Computer Science students looking to understand DOM manipulation, API integrations, and state management using raw web technologies.

![App Demo](https://via.placeholder.com/800x400?text=App+Screenshot+-+Add+Your+Image+Here)

## Key Features

- **Pure Vanilla TypeScript**: Understand the core web technologies without the magic of frameworks.
- **ChatGPT-like Interface**: A sleek, responsive, dual-pane design with a sidebar history list and chat window.
- **Dynamic Personas**: Switch the AI's "system prompt" on the fly using the Sidebar (e.g., General Assistant, Senior Developer, English Tutor).
- **Local Storage Persistence**: Your conversation history is saved directly to your browser's `localStorage` and persists across page reloads.
- **Secure API Key Management**: A built-in modal that securely accepts and stores your Google Gemini API key locally.
- **Streaming Responses & Typing Indicators**: Real-time text generation with visual cues ("AI is typing...") for an interactive feel.
- **Robust Error Handling**: Network errors, invalid API keys, and rate limits are caught and displayed elegantly in the chat interface.

## Tech Stack

- **Frontend Core**: HTML5, Vanilla TypeScript
- **Styling**: Tailwind CSS (v4)
- **AI Integration**: `@google/genai` (Google Gemini SDK)
- **Build Tool**: Vite (Lightning fast development server)
- **Markdown Parsing**: `marked` (For formatting code blocks and AI responses)

##  Project Structure

\`\`\`text
src/
├── api/
│   └── gemini.ts        # Connects to the Gemini SDK, handles personas and streaming
├── components/
│   ├── ApiModal.ts      # UI component for receiving and saving the API Key
│   ├── ChatUI.ts        # Handles drawing messages, "typing...", and Markdown parsing
│   └── Sidebar.ts       # Handles the mobile menu, switching personas, and clearing history
├── utils/
│   └── storage.ts       # Wrapper around localStorage for history and API keys
├── main.ts              # Entry point linking all components together
└── style.css            # Tailwind directives and custom markdown styles
index.html               # The raw visual template of the app
\`\`\`

##  Step-by-Step Local Setup

1. **Clone the repository**
   \`\`\`bash
   git clone <your-repo-url>
   cd multi-agent-orchestrator
   \`\`\`

2. **Install Node.js Dependencies**
   Ensure you have Node.js installed, then run:
   \`\`\`bash
   npm install
   \`\`\`

3. **Get Free Google Gemini API Key**
   - Head over to [Google AI Studio](https://aistudio.google.com/app/apikey).
   - Sign in with your Google account and click "Create API Key".
   - Copy the key.

4. **Start the Development Server**
   \`\`\`bash
   npm run dev
   \`\`\`
   - Open \`http://localhost:3000\` in your browser.
   - The app will immediately prompt you for your API Key. Paste it in and start chatting!

## Learning Objectives for Beginners
If you are reading this codebase to learn:
1. Start in \`index.html\` to see how classes and IDs are laid out.
2. Read \`src/main.ts\` to see how we initialize classes.
3. Dive into \`src/components/ChatUI.ts\` to see how we use \`document.createElement\` and \`innerHTML\` to dynamically update the screen without React.
4. Review \`src/utils/storage.ts\` for a masterclass on saving things to the user's browser disk!
