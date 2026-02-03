// Claire Delish - Real-time AI Cooking Companion
// Using Hume EVI for voice + GPT-4V for vision

const CONFIG = {
    HUME_API_KEY: '',
    HUME_CONFIG_ID: '5e4ab7a7-c3e8-4539-b2a3-c3cdfe69ecf4', // Claire Delish EVI config
    OPENAI_API_KEY: ''
};

let socket = null;
let recorder = null;
let player = null;
let cameraStream = null;
let isMuted = false;
let currentImageData = null;

// DOM elements
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const muteBtn = document.getElementById('muteBtn');
const captureBtn = document.getElementById('captureBtn');
const statusEl = document.getElementById('status');
const avatarContainer = document.getElementById('avatarContainer');
const messagesEl = document.getElementById('messages');
const cameraPreview = document.getElementById('cameraPreview');
const uploadPreview = document.getElementById('uploadPreview');

// Initialize on load
window.onload = async () => {
    const params = new URLSearchParams(window.location.search);
    CONFIG.HUME_API_KEY = params.get('key') || localStorage.getItem('hume_api_key') || '';
    CONFIG.OPENAI_API_KEY = params.get('openai') || localStorage.getItem('openai_api_key') || '';
    
    if (!CONFIG.HUME_API_KEY) {
        const key = prompt('Enter your Hume API Key:');
        if (key) {
            CONFIG.HUME_API_KEY = key;
            localStorage.setItem('hume_api_key', key);
        }
    }
    
    if (!CONFIG.OPENAI_API_KEY) {
        const key = prompt('Enter OpenAI API Key (optional, for vision):');
        if (key) {
            CONFIG.OPENAI_API_KEY = key;
            localStorage.setItem('openai_api_key', key);
        }
    }
};

function updateStatus(status, text) {
    statusEl.className = `status-indicator ${status}`;
    statusEl.textContent = text;
    
    if (status === 'speaking') {
        avatarContainer.classList.add('speaking');
    } else {
        avatarContainer.classList.remove('speaking');
    }
}

function addMessage(role, text, emotions = null) {
    const div = document.createElement('div');
    div.className = `message ${role}`;
    
    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = role === 'user' ? 'You' : 'Claire';
    
    const content = document.createElement('div');
    content.textContent = text;
    
    div.appendChild(label);
    div.appendChild(content);
    
    if (emotions && Object.keys(emotions).length > 0) {
        const emotionsDiv = document.createElement('div');
        emotionsDiv.className = 'emotions';
        const sorted = Object.entries(emotions)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);
        const topEmotions = sorted.map(([name, score]) => `${name}: ${(score * 100).toFixed(0)}%`);
        emotionsDiv.textContent = topEmotions.join(' · ');
        div.appendChild(emotionsDiv);
    }
    
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

async function startChat() {
    if (!CONFIG.HUME_API_KEY) {
        alert('Please provide a Hume API key');
        return;
    }
    
    try {
        updateStatus('connecting', 'Connecting to Claire...');
        
        // Import Hume SDK
        const Hume = await import('https://cdn.jsdelivr.net/npm/hume@0.9.3/+esm');
        
        const client = new Hume.HumeClient({
            apiKey: CONFIG.HUME_API_KEY
        });
        
        // Initialize audio player
        player = new Hume.EVIWebAudioPlayer();
        
        // Connect to EVI
        socket = await client.empathicVoice.chat.connect({
            configId: CONFIG.HUME_CONFIG_ID
        });
        
        socket.on('open', async () => {
            console.log('Socket opened');
            updateStatus('connected', 'Connected! Start talking...');
            
            startBtn.classList.add('hidden');
            stopBtn.classList.remove('hidden');
            muteBtn.disabled = false;
            
            // Initialize player
            await player.init();
            
            // Start audio capture
            recorder = await startAudioCapture(socket, Hume);
        });
        
        socket.on('message', async (msg) => {
            console.log('Message:', msg.type, msg);
            
            switch (msg.type) {
                case 'chat_metadata':
                    addMessage('claire', "Hey there! I'm Claire, your AI cooking companion. What's cooking?");
                    break;
                    
                case 'user_message':
                    const userText = msg.message?.content || '';
                    const emotions = msg.models?.prosody?.scores || {};
                    addMessage('user', userText, emotions);
                    updateStatus('listening', 'Processing...');
                    break;
                    
                case 'assistant_message':
                    const claireText = msg.message?.content || '';
                    addMessage('claire', claireText);
                    break;
                    
                case 'audio_output':
                    updateStatus('speaking', 'Claire is speaking...');
                    await player.enqueue(msg);
                    break;
                    
                case 'user_interruption':
                    player.stop();
                    updateStatus('listening', 'Listening...');
                    break;
                    
                case 'assistant_end':
                    updateStatus('connected', 'Your turn...');
                    break;
                    
                case 'error':
                    console.error('EVI error:', msg);
                    updateStatus('disconnected', `Error: ${msg.message || 'Unknown'}`);
                    break;
            }
        });
        
        socket.on('error', (error) => {
            console.error('Socket error:', error);
            updateStatus('disconnected', 'Connection error');
        });
        
        socket.on('close', () => {
            console.log('Socket closed');
            updateStatus('disconnected', 'Disconnected');
            cleanup();
        });
        
    } catch (error) {
        console.error('Failed to start chat:', error);
        updateStatus('disconnected', `Error: ${error.message}`);
        cleanup();
    }
}

async function startAudioCapture(socket, Hume) {
    const mimeTypeResult = Hume.getBrowserSupportedMimeType();
    const mimeType = mimeTypeResult.success ? mimeTypeResult.mimeType : 'audio/webm';
    
    const micAudioStream = await Hume.getAudioStream();
    Hume.ensureSingleValidAudioTrack(micAudioStream);
    
    const rec = new MediaRecorder(micAudioStream, { mimeType });
    
    rec.ondataavailable = async (e) => {
        if (e.data.size > 0 && socket.readyState === WebSocket.OPEN && !isMuted) {
            const data = await Hume.convertBlobToBase64(e.data);
            socket.sendAudioInput({ data });
        }
    };
    
    rec.onerror = (e) => console.error('MediaRecorder error:', e);
    rec.start(80); // 80ms chunks
    
    return rec;
}

function stopChat() {
    if (socket) {
        socket.close();
    }
    cleanup();
    updateStatus('disconnected', 'Chat ended');
    addMessage('claire', "Thanks for chatting! Come back anytime for more cozy cooking fun!");
}

function cleanup() {
    if (recorder) {
        recorder.stream.getTracks().forEach(t => t.stop());
        recorder = null;
    }
    if (player) {
        player.dispose();
        player = null;
    }
    if (cameraStream) {
        cameraStream.getTracks().forEach(t => t.stop());
        cameraStream = null;
        cameraPreview.classList.remove('active');
    }
    
    socket = null;
    startBtn.classList.remove('hidden');
    stopBtn.classList.add('hidden');
    muteBtn.disabled = true;
    captureBtn.disabled = true;
}

function toggleMute() {
    isMuted = !isMuted;
    muteBtn.textContent = isMuted ? '🔊 Unmute' : '🔇 Mute';
    updateStatus(isMuted ? 'connected' : 'listening', isMuted ? 'Muted' : 'Listening...');
}

async function toggleCamera() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(t => t.stop());
        cameraStream = null;
        cameraPreview.classList.remove('active');
        captureBtn.disabled = !currentImageData;
        return;
    }
    
    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'environment' } 
        });
        cameraPreview.srcObject = cameraStream;
        cameraPreview.classList.add('active');
        captureBtn.disabled = false;
        uploadPreview.classList.remove('active');
        currentImageData = null;
    } catch (error) {
        alert('Could not access camera: ' + error.message);
    }
}

function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        uploadPreview.src = e.target.result;
        uploadPreview.classList.add('active');
        currentImageData = e.target.result;
        captureBtn.disabled = false;
        
        if (cameraStream) {
            cameraStream.getTracks().forEach(t => t.stop());
            cameraStream = null;
            cameraPreview.classList.remove('active');
        }
    };
    reader.readAsDataURL(file);
}

async function captureAndSend() {
    let imageData = currentImageData;
    
    // Capture from camera if active
    if (cameraStream && cameraPreview.classList.contains('active')) {
        const canvas = document.createElement('canvas');
        canvas.width = cameraPreview.videoWidth;
        canvas.height = cameraPreview.videoHeight;
        canvas.getContext('2d').drawImage(cameraPreview, 0, 0);
        imageData = canvas.toDataURL('image/jpeg', 0.8);
    }
    
    if (!imageData) {
        alert('No image to send');
        return;
    }
    
    try {
        updateStatus('connecting', 'Claire is looking at the image...');
        
        const description = await analyzeImage(imageData);
        
        if (socket && socket.readyState === WebSocket.OPEN) {
            // Send description as text input
            socket.sendSessionSettings({
                context: {
                    type: 'editable',
                    text: `[User is showing an image: ${description}]`
                }
            });
            
            // Also send as user input to trigger response
            socket.sendUserInput(description);
            addMessage('user', `📷 Shared an image`);
        }
        
        updateStatus('connected', 'Image sent to Claire');
    } catch (error) {
        console.error('Image analysis error:', error);
        updateStatus('connected', 'Could not analyze image');
        
        // Still send a generic message
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.sendUserInput("I'm showing you something, can you see it?");
        }
    }
}

async function analyzeImage(base64Image) {
    if (!CONFIG.OPENAI_API_KEY) {
        return "The user is showing me an image. I should ask them what they'd like to know about it.";
    }
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${CONFIG.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'gpt-4o',
            messages: [{
                role: 'user',
                content: [
                    {
                        type: 'text',
                        text: 'Describe this image briefly for a cooking AI assistant. What food, ingredients, dishes, or kitchen items do you see? Keep it to 1-2 sentences, be conversational.'
                    },
                    {
                        type: 'image_url',
                        image_url: { url: base64Image }
                    }
                ]
            }],
            max_tokens: 150
        })
    });
    
    const data = await response.json();
    return data.choices?.[0]?.message?.content || "I can see an image but couldn't identify the contents.";
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && socket && !e.target.matches('input, textarea')) {
        e.preventDefault();
        toggleMute();
    }
    if (e.code === 'Escape' && socket) {
        stopChat();
    }
});
