# Claire Delish - Real-time AI Cooking Companion

Talk to Claire in real-time! She listens, responds with emotion, and can even see photos you share.

## Features

- 🎙️ **Real-time voice conversation** - Talk naturally, Claire responds
- 👁️ **Vision** - Show Claire images via camera or upload
- 🎭 **Emotion detection** - Claire detects your emotions and responds accordingly
- 🍳 **Cooking expertise** - Ask about recipes, ingredients, techniques

## Quick Start

### Run locally

```bash
# Start the server
python3 server.py

# Open http://localhost:8080 in your browser
```

### Required API Keys

On first load, you'll be prompted for:
- **Hume API Key** (required) - For voice conversation
- **OpenAI API Key** (optional) - For image analysis

Or pass via URL: `http://localhost:8080?key=YOUR_HUME_KEY&openai=YOUR_OPENAI_KEY`

## Deploy Options

### Vercel / Netlify (Static)
Just push to GitHub and connect - it's all static files!

### Docker
```bash
docker build -t claire-delish .
docker run -p 8080:8080 claire-delish
```

### AWS S3 + CloudFront
Upload all files to S3, enable static hosting, add CloudFront for HTTPS.

## Tech Stack

- **Hume EVI** - Real-time empathic voice AI
- **OpenAI GPT-4V** - Image analysis (optional)
- **Vanilla JS** - No build step required!

## Keyboard Shortcuts

- **Space** - Mute/unmute microphone
- **Esc** - End conversation

---

Created by Inception Point AI
