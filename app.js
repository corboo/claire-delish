// Claire Delish - Real-time AI Cooking Companion
// Direct WebSocket implementation for Hume EVI

const CONFIG = {
    // Pre-configured keys (for this deployment)
    HUME_API_KEY: 'Qpo16RO78hsfKE37KnJM7mlXBp1pnGaXVUQ0x36nNIbmgjUp',
    HUME_CONFIG_ID: '5e4ab7a7-c3e8-4539-b2a3-c3cdfe69ecf4',
    OPENAI_API_KEY: '' // Optional - user can add for vision
};

let socket = null;
let mediaRecorder = null;
let audioContext = null;
let audioQueue = [];
let isPlaying = false;
let isMuted = false;
let cameraStream = null;
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

// Initialize
window.onload = () => {
    // Check for OpenAI key in URL or localStorage (optional for vision)
    const params = new URLSearchParams(window.location.search);
    CONFIG.OPENAI_API_KEY = params.get('openai') || localStorage.getItem('openai_api_key') || '';
};

function updateStatus(status, text) {
    statusEl.className = `status-indicator ${status}`;
    statusEl.textContent = text;
    avatarContainer.classList.toggle('speaking', status === 'speaking');
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
    
    if (emotions) {
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

async function getAccessToken() {
    // Fetch access token from Hume API
    const response = await fetch('https://api.hume.ai/oauth2-cc/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: `grant_type=client_credentials&api_key=${CONFIG.HUME_API_KEY}`
    });
    
    if (!response.ok) {
        // Fall back to using API key directly (older method)
        return null;
    }
    
    const data = await response.json();
    return data.access_token;
}

async function startChat() {
    try {
        updateStatus('connecting', 'Connecting to Claire...');
        
        // Request microphone access
        const micStream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                sampleRate: 16000,
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true
            }
        });
        
        // Initialize audio context for playback
        audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
        
        // Connect to Hume EVI WebSocket
        const wsUrl = `wss://api.hume.ai/v0/evi/chat?api_key=${CONFIG.HUME_API_KEY}&config_id=${CONFIG.HUME_CONFIG_ID}`;
        socket = new WebSocket(wsUrl);
        
        socket.onopen = () => {
            console.log('WebSocket connected');
            updateStatus('connected', 'Connected! Start talking...');
            
            startBtn.classList.add('hidden');
            stopBtn.classList.remove('hidden');
            muteBtn.disabled = false;
            
            // Start audio capture
            startAudioCapture(micStream);
        };
        
        socket.onmessage = async (event) => {
            const msg = JSON.parse(event.data);
            console.log('Received:', msg.type, msg);
            
            handleMessage(msg);
        };
        
        socket.onerror = (error) => {
            console.error('WebSocket error:', error);
            updateStatus('disconnected', 'Connection error');
        };
        
        socket.onclose = (event) => {
            console.log('WebSocket closed:', event.code, event.reason);
            updateStatus('disconnected', 'Disconnected');
            cleanup();
        };
        
    } catch (error) {
        console.error('Failed to start:', error);
        updateStatus('disconnected', `Error: ${error.message}`);
        cleanup();
    }
}

function handleMessage(msg) {
    switch (msg.type) {
        case 'chat_metadata':
            addMessage('claire', "Hey there! I'm Claire, your AI cooking companion. What's cooking?");
            break;
            
        case 'user_message':
            const userText = msg.message?.content || '';
            const emotions = msg.models?.prosody?.scores || null;
            if (userText) {
                addMessage('user', userText, emotions);
            }
            updateStatus('listening', 'Processing...');
            break;
            
        case 'assistant_message':
            const claireText = msg.message?.content || '';
            if (claireText) {
                addMessage('claire', claireText);
            }
            break;
            
        case 'audio_output':
            updateStatus('speaking', 'Claire is speaking...');
            playAudio(msg.data);
            break;
            
        case 'user_interruption':
            stopAudioPlayback();
            updateStatus('listening', 'Listening...');
            break;
            
        case 'assistant_end':
            // Audio might still be playing
            setTimeout(() => {
                if (!isPlaying) {
                    updateStatus('connected', 'Your turn...');
                }
            }, 500);
            break;
            
        case 'error':
            console.error('EVI error:', msg);
            addMessage('claire', `Oops! Something went wrong. Let me try again.`);
            break;
    }
}

function startAudioCapture(stream) {
    // Use MediaRecorder with webm/opus format
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
        ? 'audio/webm;codecs=opus' 
        : 'audio/webm';
    
    mediaRecorder = new MediaRecorder(stream, { mimeType });
    
    mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0 && socket?.readyState === WebSocket.OPEN && !isMuted) {
            const base64 = await blobToBase64(event.data);
            socket.send(JSON.stringify({
                type: 'audio_input',
                data: base64
            }));
        }
    };
    
    mediaRecorder.start(100); // Send chunks every 100ms
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

async function playAudio(base64Audio) {
    try {
        // Decode base64 to array buffer
        const binaryString = atob(base64Audio);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        
        // Decode audio
        const audioBuffer = await audioContext.decodeAudioData(bytes.buffer.slice(0));
        
        // Queue for playback
        audioQueue.push(audioBuffer);
        
        if (!isPlaying) {
            playNextInQueue();
        }
    } catch (error) {
        console.error('Audio playback error:', error);
    }
}

function playNextInQueue() {
    if (audioQueue.length === 0) {
        isPlaying = false;
        updateStatus('connected', 'Your turn...');
        return;
    }
    
    isPlaying = true;
    const audioBuffer = audioQueue.shift();
    
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    source.onended = playNextInQueue;
    source.start();
}

function stopAudioPlayback() {
    audioQueue = [];
    isPlaying = false;
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
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(t => t.stop());
    }
    mediaRecorder = null;
    
    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }
    
    if (cameraStream) {
        cameraStream.getTracks().forEach(t => t.stop());
        cameraStream = null;
        cameraPreview.classList.remove('active');
    }
    
    audioQueue = [];
    isPlaying = false;
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
        
        let description = "I can see you've shared an image. Tell me what you'd like to know about it!";
        
        if (CONFIG.OPENAI_API_KEY) {
            description = await analyzeImage(imageData);
        }
        
        if (socket && socket.readyState === WebSocket.OPEN) {
            // Send as text input
            socket.send(JSON.stringify({
                type: 'user_input',
                text: `[Looking at an image] ${description}`
            }));
            addMessage('user', `📷 Shared an image`);
        }
        
        updateStatus('connected', 'Image sent to Claire');
    } catch (error) {
        console.error('Image error:', error);
        updateStatus('connected', 'Could not process image');
    }
}

async function analyzeImage(base64Image) {
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
                        text: 'Describe this image briefly for a cooking AI. What food, ingredients, or kitchen items do you see? 1-2 sentences, conversational.'
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
    return data.choices?.[0]?.message?.content || "I can see an image but couldn't identify what's in it.";
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
